import http from "http";
import type { AddressInfo } from "net";
import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { crawlSite } from "../core/crawler/crawler";
import type { CrawlerConfig } from "../core/crawler/types";

function startCrawlerMockServer() {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      // Disallow /blocked to test robots policy.
      res.end("User-agent: *\nDisallow: /blocked\n");
      return;
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body>
        <a href="/page1">Page 1</a>
        <a href="/page1">Page 1 duplicate</a>
        <a href="/blocked">Blocked</a>
      </body></html>`);
      return;
    }
    if (url === "/page1") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body>
        <a href="/page2">Page 2</a>
        <a href="/page3">Page 3</a>
      </body></html>`);
      return;
    }
    if (url === "/page2") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><a href="/page4">Page 4</a></body></html>`);
      return;
    }
    if (url === "/page3" || url === "/page4") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Leaf page</body></html>");
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test("crawlSite visits multiple pages with BFS and dedup, respects robots.txt", async ({ page }) => {
  const { server, baseUrl } = await startCrawlerMockServer();

  const tmp = fs.mkdtempSync(path.join(process.cwd(), "crawl-test-"));
  try {
    const config: CrawlerConfig = {
      startUrl: `${baseUrl}/`,
      budget: { maxPages: 10, maxDepth: 4, maxTimeMs: 30_000 },
      perHostRateLimit: { maxRps: 10, maxConcurrent: 4 },
      robotsPolicy: "respect",
      sitemapPolicy: "disabled",
      spaDiscovery: "disabled",
      queueStrategy: "bfs",
      evidence: {
        mode: "minimal",
        captureConsole: false,
        captureResponseHeaders: true,
        captureTimings: true,
        captureScreenshots: false,
      },
    };

    const result = await crawlSite({ page, config, outDir: tmp });

    const visitedUrls = result.pages.map((p) => p.url);
    const uniqueVisited = new Set(visitedUrls);

    // At least 5 distinct pages (/, page1, page2, page3, page4)
    expect(uniqueVisited.size).toBeGreaterThanOrEqual(5);
    expect(visitedUrls).toContain(`${baseUrl}/`);
    expect(visitedUrls).toContain(`${baseUrl}/page1`);
    expect(visitedUrls).toContain(`${baseUrl}/page2`);
    expect(visitedUrls).toContain(`${baseUrl}/page3`);
    expect(visitedUrls).toContain(`${baseUrl}/page4`);

    // /blocked must be skipped due to robots policy.
    expect(
      result.pages.find((p) => p.url.endsWith("/blocked") && p.outcome === "SKIPPED_NETWORK_POLICY"),
    ).toBeTruthy();

    expect(result.stats.totalVisited).toBeGreaterThanOrEqual(5);
    expect(result.stats.networkPolicySkips).toBeGreaterThanOrEqual(1);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

