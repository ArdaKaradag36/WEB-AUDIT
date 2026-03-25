import type { Page, Response, Request } from "@playwright/test";
import { dedupeNetworkIssuesByUrl, isLikelyAbortedMediaRequest } from "./networkClassify";
import { isSsrfBlocked } from "./networkPolicy";

export type NetworkIssue = {
  url: string;
  method?: string;
  status?: number;
  kind: "FAILED_REQUEST" | "HTTP_4XX_5XX";
  failureText?: string;
  /** Optional policy marker for SKIPPED network noise (timeouts, 429, blocked). */
  policyReason?: "NETWORK_POLICY";
};

export type NetworkStats = {
  /** Number of retry attempts performed for failed/5xx requests. */
  retriedRequests: number;
  /** Number of requests that still failed after retry (real failures). */
  realFailures: number;
  /** Number of requests we marked as SKIPPED due to network policy (timeouts/429/blocked). */
  skippedNetwork: number;
};

/** mailto:/tel:/sms: tarayıcıda uygulama açar; HTTP hatası değildir — sahte "critical" üretmemek için yok sayılır. */
function isNonHttpAppNavigationUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.startsWith("mailto:") ||
    u.startsWith("tel:") ||
    u.startsWith("sms:") ||
    u.startsWith("javascript:")
  );
}

function isNetworkPolicyFailure(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("net::err_blocked_by_client") ||
    m.includes("net::err_connection_closed") ||
    m.includes("net::err_connection_reset") ||
    m.includes("net::err_network_changed") ||
    m.includes("proxy") ||
    m.includes("blocked")
  );
}

export async function collectNetworkIssues(page: Page): Promise<{
  issues: NetworkIssue[];
  stats: NetworkStats;
}> {
  const issues: NetworkIssue[] = [];
  const stats: NetworkStats = {
    retriedRequests: 0,
    realFailures: 0,
    skippedNetwork: 0,
  };

  async function retryOnce(url: string): Promise<number | "failed"> {
    // SSRF guard: page.request bypasses context.route() intercept.
    try {
      const hostname = new URL(url).hostname;
      if (await isSsrfBlocked(hostname)) return "failed";
    } catch {
      return "failed";
    }
    stats.retriedRequests += 1;
    try {
      const resp = await page.request.get(url, { timeout: 15_000 });
      return resp.status();
    } catch {
      return "failed";
    }
  }

  page.on("requestfailed", async (req: Request) => {
    const failureText = req.failure()?.errorText;
    const url = req.url();

    if (isNonHttpAppNavigationUrl(url)) {
      return;
    }

    if (isLikelyAbortedMediaRequest(url, failureText)) {
      return;
    }

    if (isNetworkPolicyFailure(failureText)) {
      stats.skippedNetwork += 1;
      issues.push({
        url,
        method: req.method(),
        kind: "FAILED_REQUEST",
        failureText,
        policyReason: "NETWORK_POLICY",
      });
      return;
    }

    const retryStatus = await retryOnce(url);
    if (retryStatus === "failed" || retryStatus >= 500) {
      stats.realFailures += 1;
      issues.push({
        url,
        method: req.method(),
        status: typeof retryStatus === "number" ? retryStatus : undefined,
        kind: "FAILED_REQUEST",
        failureText,
      });
    }
    // If retry succeeded (<500), we intentionally do not record an issue.
  });

  page.on("response", async (res: Response) => {
    const status = res.status();
    const url = res.url();

    if (status === 429) {
      // Rate limit -> treat as SKIPPED NETWORK_POLICY (do not count as real failure).
      stats.skippedNetwork += 1;
      issues.push({
        url,
        status,
        kind: "HTTP_4XX_5XX",
        policyReason: "NETWORK_POLICY",
      });
      return;
    }

    if (status >= 500) {
      const retryStatus = await retryOnce(url);
      if (retryStatus === "failed" || retryStatus >= 500) {
        stats.realFailures += 1;
        issues.push({
          url,
          status,
          kind: "HTTP_4XX_5XX",
        });
      }
      // If retry succeeded (<500), ignore as transient flake.
      return;
    }

    if (status >= 400) {
      issues.push({
        url,
        status,
        kind: "HTTP_4XX_5XX",
      });
    }
  });

  const dedupedIssues = dedupeNetworkIssuesByUrl(issues);
  const uniqueFailUrls = new Set<string>();
  for (const i of dedupedIssues) {
    if (i.policyReason) continue;
    if (i.kind === "FAILED_REQUEST") uniqueFailUrls.add(i.url);
    if (i.kind === "HTTP_4XX_5XX" && (i.status ?? 0) >= 500) uniqueFailUrls.add(i.url);
  }
  stats.realFailures = uniqueFailUrls.size;

  return { issues: dedupedIssues, stats };
}
