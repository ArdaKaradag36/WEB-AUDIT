import type { Page } from "playwright";

export type RobotsPolicy = "ignore" | "respect" | "report-only";

export type SitemapPolicy = "disabled" | "try";

export type SpaDiscoveryMode = "disabled" | "basic";

export type EvidenceCaptureMode = "none" | "minimal" | "full";

export type NetworkPolicyReason = "TIMEOUT" | "HTTP_429" | "ROBOTS" | "BUDGET_EXCEEDED";

export type CrawlJobOutcome = "OK" | "FAILED" | "SKIPPED_NETWORK_POLICY";

export type CrawlQueueStrategy = "bfs";

export interface CrawlBudget {
  maxPages: number;
  maxDepth: number;
  maxTimeMs: number;
}

export interface PerHostRateLimit {
  /** Max requests per second per host (best-effort). */
  maxRps: number;
  /** Max in-flight navigations/requests per host (best-effort). */
  maxConcurrent: number;
}

export interface EvidenceConfig {
  mode: EvidenceCaptureMode;
  captureConsole?: boolean;
  captureResponseHeaders?: boolean;
  captureTimings?: boolean;
  captureScreenshots?: boolean;
}

export interface CrawlerConfig {
  /** Absolute start URL. */
  startUrl: string;
  budget: CrawlBudget;
  perHostRateLimit: PerHostRateLimit;
  robotsPolicy: RobotsPolicy;
  sitemapPolicy: SitemapPolicy;
  spaDiscovery: SpaDiscoveryMode;
  queueStrategy: CrawlQueueStrategy;
  evidence: EvidenceConfig;
}

export interface PageEvidence {
  url: string;
  statusCode?: number;
  redirectedTo?: string;
  startedAt: number;
  finishedAt: number;
  consoleLogs?: { type: string; text: string }[];
  responseHeaders?: Record<string, string>;
  screenshotPath?: string;
}

export interface UiSelectorSummary {
  pageUrl: string;
  stableSelectors: string[];
}

export interface PageVisit {
  url: string;
  depth: number;
  outcome: CrawlJobOutcome;
  networkPolicyReason?: NetworkPolicyReason;
  statusCode?: number;
  timingMs: number;
}

export interface CrawlStats {
  totalVisited: number;
  totalQueued: number;
  networkPolicySkips: number;
  transientFailures: number;
  permanentFailures: number;
  startedAt: number;
  finishedAt: number;
}

export interface CrawlResult {
  outcome: CrawlJobOutcome;
  pages: PageVisit[];
  evidence: PageEvidence[];
  uiSelectors: UiSelectorSummary[];
  stats: CrawlStats;
}

export interface CrawlContext {
  page: Page;
  config: CrawlerConfig;
  startedAt: number;
}

