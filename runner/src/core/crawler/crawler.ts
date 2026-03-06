import type { Page, ConsoleMessage, Response } from "playwright";
import { collectNetworkIssues } from "../collectNetworkIssues";
import { domScan } from "../../auto/domScan";
import { canonicalizeUrl } from "./urlNormalizer";
import { UrlQueue } from "./urlQueue";
import type {
  CrawlContext,
  CrawlerConfig,
  CrawlResult,
  PageVisit,
  PageEvidence,
  UiSelectorSummary,
  NetworkPolicyReason,
} from "./types";

type RobotsCacheEntry = {
  disallowPrefixes: string[];
};

async function initSpaRouteTracking(page: Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    if (!anyWindow.__kamuSpaRoutes) {
      anyWindow.__kamuSpaRoutes = new Set<string>();
      anyWindow.__kamuSpaRoutes.add(location.href);
    }
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    function record(url: string | URL | null | undefined) {
      if (!url) return;
      try {
        const u = new URL(url.toString(), location.href);
        anyWindow.__kamuSpaRoutes.add(u.href);
      } catch {
        // ignore
      }
    }
    history.pushState = function (state: unknown, title: string, url: string | URL | null | undefined) {
      record(url);
      return origPush(state, title, url as string);
    };
    history.replaceState = function (state: unknown, title: string, url: string | URL | null | undefined) {
      record(url);
      return origReplace(state, title, url as string);
    };
    window.addEventListener("popstate", () => {
      anyWindow.__kamuSpaRoutes.add(location.href);
    });
  });
}

async function getSpaRoutes(page: Page): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routes = await page.evaluate(() => Array.from((window as any).__kamuSpaRoutes ?? []));
    return Array.isArray(routes) ? routes.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function fetchRobots(base: URL, page: Page): Promise<RobotsCacheEntry | null> {
  const robotsUrl = new URL("/robots.txt", base.origin).toString();
  try {
    const resp = await page.request.get(robotsUrl, { timeout: 10_000 });
    if (!resp.ok()) return null;
    const text = await resp.text();
    const disallowPrefixes: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const [directive, value] = line.split(":", 2).map((x) => x.trim());
      if (!directive || !value) continue;
      if (directive.toLowerCase() === "disallow" && value) {
        disallowPrefixes.push(value);
      }
    }
    return { disallowPrefixes };
  } catch {
    return null;
  }
}

function isDisallowedByRobots(entry: RobotsCacheEntry | null, url: URL): boolean {
  if (!entry) return false;
  const path = url.pathname || "/";
  return entry.disallowPrefixes.some((p) => p !== "" && path.startsWith(p));
}

function classifyNetworkPolicyReason(status?: number, isTimeout?: boolean): NetworkPolicyReason | undefined {
  if (status === 429) return "HTTP_429";
  if (isTimeout) return "TIMEOUT";
  return undefined;
}

export async function crawlSite(args: {
  page: Page;
  config: CrawlerConfig;
  outDir?: string;
}): Promise<CrawlResult> {
  const { page, config } = args;
  const startedAt = Date.now();

  const ctx: CrawlContext = { page, config, startedAt };
  const visits: PageVisit[] = [];
  const evidence: PageEvidence[] = [];
  const uiSelectors: UiSelectorSummary[] = [];

  const root = new URL(config.startUrl);
  const queue = new UrlQueue({ root, maxDepth: config.budget.maxDepth, allowSubdomains: true });

  const robotsCache = new Map<string, RobotsCacheEntry | null>();

  let networkPolicySkips = 0;
  let transientFailures = 0;
  let permanentFailures = 0;

  // Attach network issue collection (used for link sampling policy).
  const { stats: networkStats } = await collectNetworkIssues(page as any);

  const consoleLogs: { type: string; text: string }[] = [];
  if (config.evidence.captureConsole) {
    page.on("console", (msg: ConsoleMessage) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
  }

  if (config.spaDiscovery !== "disabled") {
    await initSpaRouteTracking(page);
  }

  // Seed the queue with the start URL.
  const startUrl = canonicalizeUrl(root.toString(), config.startUrl);
  if (!startUrl) {
    return {
      outcome: "FAILED",
      pages: [],
      evidence: [],
      uiSelectors: [],
      stats: {
        totalVisited: 0,
        totalQueued: 0,
        networkPolicySkips: 0,
        transientFailures: 0,
        permanentFailures: 1,
        startedAt,
        finishedAt: Date.now(),
      },
    };
  }
  queue.enqueue(startUrl, 0);

  let pagesVisited = 0;

  while (true) {
    const now = Date.now();
    if (now - startedAt > config.budget.maxTimeMs) {
      break;
    }
    if (pagesVisited >= config.budget.maxPages) {
      break;
    }

    const item = queue.dequeue();
    if (!item) break;

    const visitStart = Date.now();

    // Robots.txt check per origin (minimal).
    if (config.robotsPolicy !== "ignore") {
      const originKey = item.url.origin;
      let robots = robotsCache.get(originKey);
      if (robots === undefined) {
        robots = await fetchRobots(item.url, page);
        robotsCache.set(originKey, robots);
      }
      if (isDisallowedByRobots(robots, item.url)) {
        networkPolicySkips++;
        const timingMs = Date.now() - visitStart;
        visits.push({
          url: item.url.toString(),
          depth: item.depth,
          outcome: "SKIPPED_NETWORK_POLICY",
          networkPolicyReason: "ROBOTS",
          timingMs,
        });
        continue;
      }
    }

    let response: Response | null = null;
    let statusCode: number | undefined;
    let redirectedTo: string | undefined;
    let networkPolicyReason: NetworkPolicyReason | undefined;
    let outcome: PageVisit["outcome"] = "OK";

    try {
      response = await page.goto(item.url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      statusCode = response?.status();
      if (response && response.url() !== item.url.toString()) {
        redirectedTo = response.url();
      }
    } catch (e: any) {
      const message = e?.message ?? "";
      const isTimeout = /timeout|timed out/i.test(message);
      networkPolicyReason = classifyNetworkPolicyReason(undefined, isTimeout);
      if (networkPolicyReason) {
        outcome = "SKIPPED_NETWORK_POLICY";
        networkPolicySkips++;
      } else {
        outcome = "FAILED";
        transientFailures++;
      }
    }

    const visitEnd = Date.now();
    const timingMs = visitEnd - visitStart;

    // SPA routes discovery.
    if (config.spaDiscovery === "basic") {
      const spaRoutes = await getSpaRoutes(page);
      for (const href of spaRoutes) {
        const normalized = canonicalizeUrl(root.toString(), href);
        if (!normalized) continue;
        queue.enqueue(normalized, item.depth + 1);
      }
    }

    // Extract links from current page for BFS.
    const hrefs: string[] = await page.$$eval("a[href]", (as) =>
      as.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
    );
    for (const href of hrefs) {
      const normalized = canonicalizeUrl(item.url.toString(), href);
      if (!normalized) continue;
      queue.enqueue(normalized, item.depth + 1);
    }

    // Evidence capture (minimal).
    let pageEvidence: PageEvidence | undefined;
    if (config.evidence.mode !== "none") {
      const headers: Record<string, string> = {};
      if (config.evidence.captureResponseHeaders && response) {
        for (const [k, v] of Object.entries(response.headers())) {
          headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
        }
      }

      let screenshotPath: string | undefined;
      if (config.evidence.captureScreenshots && args.outDir) {
        const fileName = `crawl_${pagesVisited}_${Date.now()}.png`;
        const filePath = require("path").join(args.outDir, fileName);
        try {
          await page.screenshot({ path: filePath, fullPage: true });
          screenshotPath = filePath;
        } catch {
          screenshotPath = undefined;
        }
      }

      pageEvidence = {
        url: item.url.toString(),
        statusCode,
        redirectedTo,
        startedAt: visitStart,
        finishedAt: visitEnd,
        consoleLogs: config.evidence.captureConsole ? [...consoleLogs] : undefined,
        responseHeaders: config.evidence.captureResponseHeaders ? headers : undefined,
        screenshotPath,
      };
      evidence.push(pageEvidence);
    }

    // UI coverage stable selectors (inventory-lite).
    const uiElements = await domScan({
      page,
      pageUrl: item.url.toString(),
      isBlocked: false,
    });
    const stableSelectors = uiElements
      .map((el) => el.recommendedSelectors?.[0])
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => {
        if (s.strategy === "css") return s.css;
        if (s.strategy === "role") return `role=${s.role}[name="${s.name ?? ""}"]`;
        if (s.strategy === "text") return `text=${s.text}`;
        if (s.strategy === "label") return `label=${s.label}`;
        if (s.strategy === "data-testid" || s.strategy === "data-test" || s.strategy === "data-qa") {
          return `${s.strategy}=${s.value}`;
        }
        return "";
      })
      .filter(Boolean);
    uiSelectors.push({
      pageUrl: item.url.toString(),
      stableSelectors,
    });

    // Determine final outcome if HTTP status indicates problems.
    if (statusCode && outcome === "OK") {
      if (statusCode === 429) {
        outcome = "SKIPPED_NETWORK_POLICY";
        networkPolicyReason = "HTTP_429";
        networkPolicySkips++;
      } else if (statusCode >= 500) {
        transientFailures++;
        outcome = "FAILED";
      }
    }

    visits.push({
      url: item.url.toString(),
      depth: item.depth,
      outcome,
      networkPolicyReason,
      statusCode,
      timingMs,
    });
    pagesVisited++;

    // Link sampling policy – if too many network policy issues, end early as SKIPPED_NETWORK_POLICY.
    if (networkStats.skippedNetwork >= 10 && pagesVisited < 3) {
      // Heavy WAF/rate-limit scenario; bail out early.
      break;
    }
  }

  const finishedAt = Date.now();

  const outcome: CrawlResult["outcome"] =
    networkPolicySkips > 0 && visits.length === 0
      ? "SKIPPED_NETWORK_POLICY"
      : permanentFailures > 0
      ? "FAILED"
      : "OK";

  return {
    outcome,
    pages: visits,
    evidence,
    uiSelectors,
    stats: {
      totalVisited: visits.length,
      totalQueued: queue.snapshot().visited,
      networkPolicySkips,
      transientFailures,
      permanentFailures,
      startedAt,
      finishedAt,
    },
  };
}

