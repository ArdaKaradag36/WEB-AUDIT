import http from "http";
import type { AddressInfo } from "net";

export type SimpleSiteServer = {
  server: http.Server;
  baseUrl: string;
};

/**
 * Deterministic minimal site for smoke/crawler tests:
 * - / -> links to /a
 * - /a -> links to /b
 * - /b -> 200 OK leaf
 * - /rate-limited -> 429 Too Many Requests (optional policy test)
 */
export function startSimpleSite(): Promise<SimpleSiteServer> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><head><title>Home</title></head><body>
        <a href="/a">Go to A</a>
      </body></html>`);
      return;
    }
    if (url === "/a") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><head><title>A</title></head><body>
        <a href="/b">Go to B</a>
      </body></html>`);
      return;
    }
    if (url === "/b") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><head><title>B</title></head><body>Leaf</body></html>");
      return;
    }
    if (url === "/rate-limited") {
      res.writeHead(429, { "Content-Type": "text/plain" });
      res.end("Too Many Requests");
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  return new Promise<SimpleSiteServer>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

