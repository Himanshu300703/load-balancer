const net = require("net");
const http = require("http");
const https = require("https");

let conf;

const initHealthChecks = (confObj) => {
    conf = confObj; 
    conf.validServers = conf.servers.filter(server => server.enabled);
    
    const handler = async () => {
        LOG.info("Starting health check cycle...");
        const healthChecks = [];
        
        for (let server of conf.servers) {
            if (server.check && server.check.type && Object.keys(module.exports).includes(server.check.type)) {
                healthChecks.push(module.exports[server.check.type](server));
            }
        }
        
        await Promise.all(healthChecks);
        conf.validServers = conf.servers.filter((server) => (server.enabled));
        
        LOG.info(`Health Check cycle completed. Active backends: ${conf.validServers.length}/${conf.servers.length}`);
        
        // Log details about each server
        conf.servers.forEach(server => {
            const status = server.enabled ? "ACTIVE" : "DOWN";
            LOG.debug(`Backend ${server.host}:${server.port} - Status: ${status}`);
        });
    };
    
    // Run an initial health check immediately
    handler();
    
    // Then set up the interval
    const interval = (conf.healthCheckInterval > 0) 
        ? conf.healthCheckInterval 
        : CONSTANTS.DEFAULT_HEALTHCHECKINTERVAL;
        
    LOG.info(`Health checks scheduled every ${interval}ms`);
    return setInterval(handler, interval);
};

const portCheck = async (server) => {
    LOG.debug(`Performing port check for ${server.host}:${server.port}`);
    try {
        const healthCheckResult = await _checkConnection(
            server.host, 
            (server.check.target) ? server.check.target : server.port, 
            server.check.timeout
        );
        server.enabled = healthCheckResult;
        
        if (healthCheckResult) {
            LOG.debug(`Port check successful for ${server.host}:${server.port}`);
        } else {
            LOG.error(`Port check failed for ${server.host}:${server.port}`);
        }
    } catch (error) {
        server.enabled = false;
        LOG.error(`Port check error for ${server.host}:${server.port}: ${error.message}`);
    }
};

const _checkConnection = (host, port, timeout = 5000) => new Promise((resolve, _reject) => {
    let connected;
    const socket = net.connect(port, host, () => { connected = true; socket.destroy(); }).ref();
    socket.setTimeout(timeout);
    socket.on("timeout", () => { connected = false; socket.destroy(); });
    socket.on("error", () => { connected = false; });
    socket.on("close", () => { resolve(connected); });
});

const httpCheck = async (server) => {
    LOG.debug(`Performing HTTP check for ${server.host}:${server.port}${server.check.path || "/health-check"}`);
    
    const protocol = server.check.protocol === "https" ? https : http;
    const options = {
        hostname: server.host,
        port: server.port,
        path: server.check.path || "/health-check",
        method: "GET",
        timeout: server.check.timeout || 5000,
    };

    return new Promise((resolve) => {
        const req = protocol.request(options, (res) => {
            const isHealthy = res.statusCode >= 200 && res.statusCode < 300;
            server.enabled = isHealthy;
            
            if (isHealthy) {
                LOG.debug(`HTTP check successful [${res.statusCode}] for ${server.host}:${server.port}`);
            } else {
                LOG.error(`HTTP check failed [${res.statusCode}] for ${server.host}:${server.port}`);
            }
            resolve();
        });

        req.on("error", (error) => {
            server.enabled = false;
            LOG.error(`HTTP check error for ${server.host}:${server.port}: ${error.message}`);
            resolve();
        });

        req.on("timeout", () => {
            req.destroy();
            server.enabled = false;
            LOG.error(`HTTP check timeout for ${server.host}:${server.port}`);
            resolve();
        });

        req.end();
    });
};

// Endpoint check for both HTTP and HTTPS backends
const endpointCheck = async (server) => {
    const endpoint = server.check.endpoint || "/health-check";
    LOG.debug(`Performing endpoint check for ${server.host}:${server.port}${endpoint}`);
    
    const protocol = server.secure ? https : http;
    const options = {
        hostname: server.host,
        port: server.port,
        path: endpoint,
        method: "GET",
        timeout: server.check.timeout || 5000,
    };

    return new Promise((resolve) => {
        const req = protocol.request(options, (res) => {
            const isHealthy = res.statusCode >= 200 && res.statusCode < 300;
            server.enabled = isHealthy;
            
            if (isHealthy) {
                LOG.debug(`Endpoint check successful [${res.statusCode}] for ${server.host}:${server.port}${endpoint}`);
            } else {
                LOG.error(`Endpoint check failed [${res.statusCode}] for ${server.host}:${server.port}${endpoint}`);
            }
            resolve();
        });

        req.on("error", (error) => {
            server.enabled = false;
            LOG.error(`Endpoint check error for ${server.host}:${server.port}: ${error.message}`);
            resolve();
        });

        req.on("timeout", () => {
            req.destroy();
            server.enabled = false;
            LOG.error(`Endpoint check timeout for ${server.host}:${server.port}`);
            resolve();
        });

        req.end();
    });
};

module.exports = {
    initHealthChecks,
    portCheck,
    httpCheck,
    endpointCheck
};