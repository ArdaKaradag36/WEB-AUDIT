import http from "http";
import type { AddressInfo } from "net";
import { test, expect } from "@playwright/test";
import { analyzeForms } from "../rules/forms/analyzer";

function startMockServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const server = http.createServer(handler);
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test("analyzeForms detects reflected and encoded payload heuristically", async ({ page }) => {
  const { server, baseUrl } = await startMockServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const q = url.searchParams;
    const name = q.get("q") ?? "";
    // Reflect encoded
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><body><form method="GET" action="/search"><input name="q"/></form><div id="echo">${name.replace(
        /</g,
        "&lt;",
      )}</div></body></html>`,
    );
  });

  try {
    const url = `${baseUrl}/search`;
    await page.goto(url);
    const findings = await analyzeForms(page, url, { maxActiveForms: 1 });
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("KWA-FORM-010"); // inventory
    expect(ids).toContain("KWA-FORM-002"); // encoded reflection surface
  } finally {
    server.close();
  }
});

