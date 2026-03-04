import type { Page } from "playwright";

export type LinkCheck = {
  url: string;
  status: "OK" | "BROKEN" | "SKIPPED";
  httpStatus?: number;
  reason?: string;
  category?: "AUTH" | "FORBIDDEN" | "RATE_LIMIT" | "SERVER" | "CLIENT" | "NETWORK";
};

function isHttpUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function categorize(status: number): LinkCheck["category"] {
  if (status === 401) return "AUTH";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "SERVER";
  if (status >= 400) return "CLIENT";
  return undefined;
}

function isLikelyPolicy(status: number) {
  return status === 403 || status === 429;
}

function isLikelyNetworkFlake(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("net::") ||
    m.includes("socket") ||
    m.includes("econn") ||
    m.includes("dns") ||
    m.includes("name_not_resolved") ||
    m.includes("connection") ||
    m.includes("tls")
  );
}

export async function sampleLinks(page: Page, limit = 20): Promise<LinkCheck[]> {
  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => (a as HTMLAnchorElement).href).filter(Boolean)
  );

  const unique = Array.from(new Set(hrefs)).filter(isHttpUrl).slice(0, limit);

  const results: LinkCheck[] = [];

  for (const url of unique) {
    try {
      // GET daha stabil (HEAD bazı sunucularda sorun çıkarıyor)
      const resp = await page.request.get(url, { timeout: 15_000 });
      const status = resp.status();

      if (status >= 400) {
        const cat = categorize(status);
        const policy = isLikelyPolicy(status);

        results.push({
          url,
          status: policy ? "SKIPPED" : "BROKEN",
          httpStatus: status,
          category: cat,
          reason: policy ? "NETWORK_POLICY" : undefined,
        });
      } else {
        results.push({ url, status: "OK", httpStatus: status });
      }
    } catch (e: any) {
      const msg = e?.message ?? "request failed";
      const flake = isLikelyNetworkFlake(msg);

      results.push({
        url,
        status: flake ? "SKIPPED" : "BROKEN",
        reason: flake ? "NETWORK_POLICY" : msg,
        category: "NETWORK",
      });
    }
  }

  return results;
}
