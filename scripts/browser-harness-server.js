const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = 4177;
const files = new Map([
  ["/", ["test/browser-harness/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["test/browser-harness/index.html", "text/html; charset=utf-8"]],
  ["/shared/url-utils.js", ["shared/url-utils.js", "text/javascript; charset=utf-8"]],
  ["/content/adapters.js", ["content/adapters.js", "text/javascript; charset=utf-8"]],
  ["/content/content-script.js", ["content/content-script.js", "text/javascript; charset=utf-8"]],
  ["/content/styles.css", ["content/styles.css", "text/css; charset=utf-8"]],
  ["/popup/popup.js", ["popup/popup.js", "text/javascript; charset=utf-8"]],
  ["/popup/popup.css", ["popup/popup.css", "text/css; charset=utf-8"]],
  ["/assets/icons/icon128.png", ["assets/icons/icon128.png", "image/png"]]
]);
for (const site of ["pornhub", "xvideos", "xhamster", "literotica"]) {
  files.set(`/test/fixtures/${site}/feed.html`, [`test/fixtures/${site}/feed.html`, "text/html; charset=utf-8"]);
}

const headers = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'"
};

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }
  let pathname;
  try { pathname = new URL(request.url, "http://127.0.0.1").pathname; } catch (_) {
    response.writeHead(400, headers);
    response.end("Bad request");
    return;
  }
  const entry = files.get(pathname);
  if (!entry) {
    response.writeHead(404, headers);
    response.end("Not found");
    return;
  }
  const [relative, contentType] = entry;
  const body = fs.readFileSync(path.join(root, relative));
  response.writeHead(200, { ...headers, "content-type": contentType, "content-length": body.length });
  if (request.method === "HEAD") response.end();
  else response.end(body);
});

server.on("error", (error) => {
  console.error(`SIMULATED CHROME API HARNESS ERROR: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`SIMULATED CHROME API HARNESS READY: http://127.0.0.1:${port}/?site=pornhub`);
  console.log("Loopback-only allowlist; no proxy, browser profile, bookmarks, or extension installation.");
});
