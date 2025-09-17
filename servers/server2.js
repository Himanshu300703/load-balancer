const http = require("http");

http.createServer((req, res) => {
    if (req.url === "/health-check") return res.end("OK");
    res.end("Response from Backend 2");
}).listen(8081, () => {
    console.log("Backend 2 running on port 8081");
});
