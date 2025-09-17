const http = require("http");

http.createServer((req, res) => {
    if (req.url === "/health-check") return res.end("OK");
    res.end("Response from Backend 1");
}).listen(8080, () => {
    console.log("Backend 1 running on port 8080");
});
