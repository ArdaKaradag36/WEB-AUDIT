import type { Finding } from "./finding";

export type RunInfo = {
  runId: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  runnerVersion: string;
  status: "ok" | "blocked" | "crash";
};

export type RunConfig = {
  headless: boolean;
  browser: string;
  safeMode: boolean;
  maxLinks: number;
  strict: boolean;
  linkLimit?: number; // legacy alias
};

export type Evidence = {
  screenshot?: string;
  trace?: string;
  consoleLogPath?: string;
  networkLogPath?: string;
  requestFailedPath?: string;
};

export type UiCoverageSummary = {
  totalElements: number;
  testedElements: number;
  skippedElements: number;
  failedElements: number;
  attemptedNoEffectElements: number;
  topSkipReasons: Array<{ reason: string; count: number }>;
  byStatus: Record<string, number>;
  byReasonCode: Record<string, number>;
  topReasonCodes: Array<{ reasonCode: string; count: number }>;
  topActionableItems: Array<{ elementId: string; reasonCode: string; actionHint: string }>;
  actionableGaps: number;
  /** Count of elements with reasonCode UNKNOWN (final-pass guardrail). */
  unknownReasonCount?: number;
  /** Total elements that had at least one attempt (from scroll metrics). */
  attemptedCountTotal?: number;
  /** Newly discovered elements per scroll step (re-scan merge). */
  newlyDiscoveredPerScrollStep?: number[];
  skippedHiddenCount?: number;
  skippedOutOfViewportCount?: number;
  /** Total elementKey collisions (same key, different identity); helps tune elementKey. */
  collisionCountTotal?: number;
};

export type Metrics = {
  durationMs?: number;
  linkSampled?: number;
  linkBroken?: number;
  consoleErrors?: number;
  consoleWarnings?: number;
  response4xx5xx?: number;
  requestFailed?: number;
  /** Number of link/network checks we explicitly skipped due to NETWORK_POLICY (timeouts/429/blocked). */
  skippedNetwork?: number;
  /** Number of retry attempts performed for flaky network requests. */
  retriedRequests?: number;
  /** Number of requests that still failed after retry (real failures). */
  realFailures?: number;
};

export type RunMetadata = {
  nodeVersion?: string;
  platform?: string;
  playwrightVersion?: string;
};

export type SummaryReport = {
  run: RunInfo;
  config: RunConfig;
  evidence: Evidence;
  findings: Finding[];
  uiCoverage: UiCoverageSummary;
  metrics: Metrics;
  /** Audit trail: environment versions. */
  runMetadata?: RunMetadata;
};
