import fs from "fs";
import path from "path";
import type { SummaryReport, RunInfo, Evidence, UiCoverageSummary, ArtifactManifestItem } from "../domain/summary";
import type { UiInventory } from "../domain/uiInventory";
import type { UiGap } from "../domain/uiInventory";
import type { ConsoleIssue } from "../core/collectConsoleIssues";
import type { NetworkIssue } from "../core/collectNetworkIssues";
import { hashFileSha256 } from "../core/hashFileSha256";

export type WriteRunReportsInput = {
  runDir: string;
  summary: SummaryReport;
  uiInventory: UiInventory | null;
  gaps: UiGap[];
  consoleIssues: ConsoleIssue[];
  pageErrors: string[];
  networkIssues: NetworkIssue[];
};

const SENSITIVE_KEYS = ["password", "passwd", "token", "authorization", "cookie", "set-cookie"];

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = sanitizeValue(v);
      }
    }
    return result;
  }
  return value;
}

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

  let uiInventoryPath: string | null = null;
  if (input.uiInventory) {
    uiInventoryPath = path.join(runDir, "ui-inventory.json");
    fs.writeFileSync(uiInventoryPath, JSON.stringify(input.uiInventory, null, 2), "utf-8");
  }

  const gapsPath = path.join(runDir, "gaps.json");
  fs.writeFileSync(gapsPath, JSON.stringify({ gaps: input.gaps }, null, 2), "utf-8");

  const consolePath = path.join(runDir, "console.json");
  const consolePayload = sanitizeValue({ issues: input.consoleIssues, pageErrors: input.pageErrors });
  fs.writeFileSync(consolePath, JSON.stringify(consolePayload, null, 2), "utf-8");

  const httpBad = input.networkIssues.filter((i) => i.kind === "HTTP_4XX_5XX");
  const failed = input.networkIssues.filter((i) => i.kind === "FAILED_REQUEST");

  const networkPath = path.join(runDir, "network.json");
  const networkPayload = sanitizeValue({ responses4xx5xx: httpBad });
  fs.writeFileSync(networkPath, JSON.stringify(networkPayload, null, 2), "utf-8");

  const requestFailedPath = path.join(runDir, "request_failed.json");
  const failedPayload = sanitizeValue({ requestFailed: failed });
  fs.writeFileSync(requestFailedPath, JSON.stringify(failedPayload, null, 2), "utf-8");

  // Build minimal artifact manifest for summary.json
  const artifactsManifest: ArtifactManifestItem[] = [];

  function addArtifactManifest(type: string, absolutePath: string) {
    if (!fs.existsSync(absolutePath)) return;
    const stat = fs.statSync(absolutePath);
    const rel = path.relative(runDir, absolutePath).replace(/\\/g, "/");
    artifactsManifest.push({
      type,
      path: rel,
      sizeBytes: stat.size,
      sha256: hashFileSha256(absolutePath),
    });
  }

  addArtifactManifest("SUMMARY", summaryPath);
  if (uiInventoryPath) {
    addArtifactManifest("UI_INVENTORY", uiInventoryPath);
  }
  addArtifactManifest("GAPS", gapsPath);
  addArtifactManifest("CONSOLE", consolePath);
  addArtifactManifest("NETWORK", networkPath);
  addArtifactManifest("REQUEST_FAILED", requestFailedPath);

  if (fs.existsSync(artDir)) {
    for (const name of fs.readdirSync(artDir)) {
      const p = path.join(artDir, name);
      if (fs.statSync(p).isDirectory()) continue;
      const lower = name.toLowerCase();
      let kind = "OTHER";
      if (lower.endsWith(".zip")) kind = "TRACE";
      else if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) kind = "SCREENSHOT";
      else if (lower.endsWith(".json") || lower.endsWith(".log") || lower.endsWith(".txt")) kind = "LOG";
      addArtifactManifest(kind, p);
    }
  }

  input.summary.artifacts = artifactsManifest;

  // Finally, write summary.json including the populated artifacts manifest.
  fs.writeFileSync(summaryPath, JSON.stringify(input.summary, null, 2), "utf-8");

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
