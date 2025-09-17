global.CONSTANTS = require(`${__dirname}/constants.js`);

const net = require("net");
const http = require("http");
const https = require("https");
const fs = require("fs");
const conf = require(`${CONSTANTS.CONFDIR}/lb.json`);

const routing_table = {};
let serverIndex = 0;

const bootstrap = () => {
    console.log("Starting the load-balancer...");

    /* Init the logs */
    console.log("Initializing the logs.");
    require(CONSTANTS.LIBDIR + "/log.js").initGlobalLoggerSync();
    LOG.overrideConsole();

    /* Init health checks */
    require(CONSTANTS.LIBDIR + "/checks.js").initHealthChecks(conf);

    if (!Array.isArray(conf.servers) || conf.servers.length == 0) { LOG.error("No servers listed, exiting."); process.exit(1); }
    if (!conf.host) conf.host = "::"; // support IPv6 and IPv4

    if (conf.mode === "http") {
        startHttpLoadBalancer();
    } else {
        startTcpLoadBalancer();
    }
};

const startTcpLoadBalancer = () => {
    net.createServer({ allowHalfOpen: true }, (client) => {
        LOG.debug(`Got connection from ${client.remoteAddress}:${client.remotePort}`);
        handleTcpRequest(client);
    }).listen(conf.port, conf.host, () => LOG.console(`TCP LB listening on ${conf.host}:${conf.port}\n`)
    ).on("error", error => { LOG.error("Server received a socket error"); LOG.error(error); });
};

const startHttpLoadBalancer = () => {
    const serverOptions = {};
    let server;

    // Configure SSL if needed
    if (conf.secure && conf.sslConf) {
        try {
            serverOptions.key = fs.readFileSync(conf.sslConf.key);
            serverOptions.cert = fs.readFileSync(conf.sslConf.cert);
            server = https.createServer(serverOptions, handleHttpRequest);
            LOG.info("SSL Termination enabled");
        } catch (error) {
            LOG.error("Failed to load SSL certificates, falling back to HTTP");
            LOG.error(error);
            server = http.createServer(handleHttpRequest);
        }
    } else {
        server = http.createServer(handleHttpRequest);
    }

    server.listen(conf.port, conf.host, () => {
        const protocol = conf.secure ? "HTTPS" : "HTTP";
        LOG.console(`${protocol} LB listening on ${conf.host}:${conf.port}\n`);
    }).on("error", error => {
        LOG.error("Server received an error");
        LOG.error(error);
    });
};

const handleTcpRequest = (client) => {
    const serverConnection = getBackendServerConnection(client);

    client.on("data", (chunk) => serverConnection.write(chunk));
    client.on("end", () => (serverConnection) ? serverConnection.end() : undefined);
    client.on("error", () => (serverConnection) ? serverConnection.destroy() : undefined);
    client.on("close", () => (serverConnection) ? serverConnection.destroy() : undefined);
};

const handleHttpRequest = (req, res) => {
    const clientIP = req.socket.remoteAddress;
    const clientPort = req.socket.remotePort;
    LOG.debug(`Got HTTP request from ${clientIP}:${clientPort} for ${req.url}`);
    
    // Handle health check endpoint directly from the load balancer

    // Get backend using session persistence logic if enabled
    const backend = getBackendServer(clientIP);
    
    // Create options for proxying the request
    const options = {
        hostname: backend.host,
        port: backend.port,
        path: req.url,
        method: req.method,
        headers: {...req.headers}
    };

    // Preserve original client IP in headers
    options.headers['X-Forwarded-For'] = clientIP;
    options.headers['X-Forwarded-Proto'] = req.socket.encrypted ? 'https' : 'http';

    // Create request to backend
    const protocol = backend.secure ? https : http;
    const proxyReq = protocol.request(options, (proxyRes) => {
        // Copy status code and headers from backend response
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // Pipe the backend response directly to the client
        proxyRes.pipe(res);
    });

    // Handle errors
    proxyReq.on('error', (error) => {
        LOG.error(`Error proxying to backend ${backend.host}:${backend.port}: ${error.message}`);
        res.writeHead(502);
        res.end('Bad Gateway');
    });

    // Pipe the client request directly to the backend
    req.pipe(proxyReq);

    // Log the connection
    LOG.info(`HTTP proxied: ${clientIP}:${clientPort} -> ${backend.host}:${backend.port}`);
};

// Handle health check requests to the load balancer itself

const getBackendServerConnection = (clientConnection) => {
    const incomingIP = clientConnection.remoteAddress;
    const backendServerConf = getBackendServer(incomingIP);

    const serverConnection = net.connect(backendServerConf.port, backendServerConf.host, () => {
        LOG.info(`Connected succesfully: ${clientConnection.remoteAddress}:${clientConnection.remotePort} -> ${backendServerConf.host}:${backendServerConf.port}`);
    }).ref();

    serverConnection.on("data", (chunk) => clientConnection.write(chunk));
    serverConnection.on("end", () => clientConnection.end());
    serverConnection.on("error", () => {
        clientConnection.destroy();
        LOG.error(`Error in backend connection: ${clientConnection.remoteAddress}:${clientConnection.remotePort} -> ${backendServerConf.host}:${backendServerConf.port}`)
    });
    serverConnection.on("close", () => clientConnection.destroy());

    return serverConnection;
};

const getBackendServer = (clientIP) => {
    // Use sticky session if enabled in config
    if (conf.stickySession) {
        if (routing_table[clientIP]) {
            return routing_table[clientIP];
        } else {
            const backend = getNextRoundRobinBackend();
            routing_table[clientIP] = backend;
            return backend;
        }
    } else {
        return getNextRoundRobinBackend();
    }
};

const getNextRoundRobinBackend = () => {
    // Check if we have valid servers
    if (!conf.validServers || conf.validServers.length === 0) {
        LOG.error("No valid backend servers available");
        return conf.servers[0]; // Return first server as fallback
    }

    serverIndex = (serverIndex + 1) % conf.validServers.length;
    return conf.validServers[serverIndex];
};

module.exports = { bootstrap };

// support starting in stand-alone config
if (require("cluster").isMaster) bootstrap();