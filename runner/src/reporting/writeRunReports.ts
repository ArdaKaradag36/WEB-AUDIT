import fs from "fs";
import path from "path";
import type { SummaryReport, RunInfo, Evidence, UiCoverageSummary } from "../domain/summary";
import type { UiInventory } from "../domain/uiInventory";
import type { UiGap } from "../domain/uiInventory";
import type { ConsoleIssue } from "../core/collectConsoleIssues";
import type { NetworkIssue } from "../core/collectNetworkIssues";

export type WriteRunReportsInput = {
  runDir: string;
  summary: SummaryReport;
  uiInventory: UiInventory | null;
  gaps: UiGap[];
  consoleIssues: ConsoleIssue[];
  pageErrors: string[];
  networkIssues: NetworkIssue[];
};

function artifactsDir(runDir: string): string {
  const d = path.join(runDir, "artifacts");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function writeRunReports(input: WriteRunReportsInput): {
  summaryPath: string;
  uiInventoryPath: string | null;
  gapsPath: string;
  consolePath: string;
  networkPath: string;
  requestFailedPath: string;
} {
  const runDir = input.runDir;
  fs.mkdirSync(runDir, { recursive: true });
  const artDir = artifactsDir(runDir);

  const summaryPath = path.join(runDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(input.summary, null, 2), "utf-8");

  let uiInventoryPath: string | null = null;
  if (input.uiInventory) {
    uiInventoryPath = path.join(runDir, "ui-inventory.json");
    fs.writeFileSync(uiInventoryPath, JSON.stringify(input.uiInventory, null, 2), "utf-8");
  }

  const gapsPath = path.join(runDir, "gaps.json");
  fs.writeFileSync(gapsPath, JSON.stringify({ gaps: input.gaps }, null, 2), "utf-8");

  const consolePath = path.join(runDir, "console.json");
  fs.writeFileSync(
    consolePath,
    JSON.stringify(
      { issues: input.consoleIssues, pageErrors: input.pageErrors },
      null,
      2
    ),
    "utf-8"
  );

  const httpBad = input.networkIssues.filter((i) => i.kind === "HTTP_4XX_5XX");
  const failed = input.networkIssues.filter((i) => i.kind === "FAILED_REQUEST");

  const networkPath = path.join(runDir, "network.json");
  fs.writeFileSync(
    networkPath,
    JSON.stringify({ responses4xx5xx: httpBad }, null, 2),
    "utf-8"
  );

  const requestFailedPath = path.join(runDir, "request_failed.json");
  fs.writeFileSync(
    requestFailedPath,
    JSON.stringify({ requestFailed: failed }, null, 2),
    "utf-8"
  );

  return {
    summaryPath,
    uiInventoryPath,
    gapsPath,
    consolePath,
    networkPath,
    requestFailedPath,
  };
}

export function artifactPathInRun(runDir: string, fileName: string): string {
  const artDir = path.join(runDir, "artifacts");
  fs.mkdirSync(artDir, { recursive: true });
  return path.join(artDir, fileName);
}
