"use strict";

// A static file server for this machine only, for trying the web page
// (`npm run web`) and for the browser tests. It serves one folder on
// 127.0.0.1, which Chrome treats as a secure context, so WebHID is there.
// It is not how the page is published; the page needs no server code at all.
//
//     node scripts/serve.js [folder] [--port 8975]

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

function serve(root, port) {
    const base = path.resolve(root);
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://127.0.0.1");
        let file;
        try {file = path.join(base, decodeURIComponent(url.pathname));} catch {file = "";}
        if (file !== base && !file.startsWith(base + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
        fs.readFile(file, (error, body) => {
            if (error) {
                response.writeHead(404, {"content-type": "text/plain"}).end("Not found\n");
                return;
            }
            response.writeHead(200, {"content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store"});
            response.end(body);
        });
    });
    return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const at = args.indexOf("--port");
    const port = at >= 0 ? Number(args[at + 1]) : 8975;
    const root = args.find((arg, index) => !arg.startsWith("--") && index !== at + 1) || ".";
    serve(root, port).then(() => console.log(`serving ${path.relative(process.cwd(), path.resolve(root)) || "."} at http://localhost:${port}/`));
}

module.exports = {serve};
