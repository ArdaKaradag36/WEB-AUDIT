/**
 * Writes a minimal summary.json when the runner crashes before writeRunReports().
 * Ensures the backend always has a summary file to parse (with status=failed/crash).
 */
import fs from "fs";
import path from "path";

let runnerVersion: string = "unknown";
try {
  runnerVersion = require("../package.json").version ?? runnerVersion;
} catch {
  // ignore
}

export type MinimalSummaryCrashPayload = {
  runDir: string;
  url: string;
  runId?: string;
  errorMessage: string;
  errorStack?: string;
};

/**
 * Write summary.json with status "crash" and error details.
 * RunDir must exist or will be created.
 */
export function writeMinimalSummaryForCrash(payload: MinimalSummaryCrashPayload): string {
  const { runDir, url, runId, errorMessage, errorStack } = payload;
  fs.mkdirSync(runDir, { recursive: true });
  const now = new Date().toISOString();
  const summary = {
    run: {
      runId: runId ?? "crash",
      url,
      startedAt: now,
      finishedAt: now,
      runnerVersion,
      status: "crash",
      errorMessage,
      errorStack: errorStack ?? undefined,
    },
    config: {
      headless: true,
      browser: "chromium",
      safeMode: true,
      maxLinks: 20,
      strict: false,
    },
    evidence: {},
    findings: [],
    uiCoverage: {
      totalElements: 0,
      testedElements: 0,
      skippedElements: 0,
      failedElements: 0,
      attemptedNoEffectElements: 0,
      topSkipReasons: [],
      byStatus: {},
      byReasonCode: {},
      topReasonCodes: [],
      topActionableItems: [],
      actionableGaps: 0,
    },
    metrics: {},
  };
  const summaryPath = path.join(runDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  return summaryPath;
}
