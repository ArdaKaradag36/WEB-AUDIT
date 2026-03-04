import fs from "fs";
import path from "path";
import { chromium, firefox } from "playwright";
import { v4 as uuidv4 } from "uuid";

import { runUiHeuristics } from "./core/uiHeuristics";
import { AuditReport, Artifact, TestResult } from "./domain/result";
import { writeJsonReport } from "./reporting/writeJsonReport";
import { printSummary } from "./reporting/printSummary";
import { collectConsoleIssues } from "./core/collectConsoleIssues";
import { collectNetworkIssues } from "./core/collectNetworkIssues";
import { collectResponseUrls } from "./core/collectResponseUrls";
import { sampleLinks } from "./core/sampleLinks";
import { detectCaptcha } from "./core/detectCaptcha";
import { detectLogin } from "./core/detectLogin";
import { hashFileSha256 } from "./core/hashFileSha256";
import { runRuleEngine } from "./core/ruleEngine";
import { domScan } from "./auto/domScan";
import { buildGaps } from "./auto/gaps";
import { runAutoUiAudit } from "./auto/autoUiAudit";
import { writeRunReports, artifactPathInRun } from "./reporting/writeRunReports";
import { writeMinimalSummaryForCrash } from "./reporting/writeMinimalSummary";
import type { SummaryReport, RunInfo, RunConfig, Evidence, UiCoverageSummary, Metrics, RunMetadata } from "./domain/summary";
import type { UiInventory, UiGap, ReasonCode } from "./domain/uiInventory";

import { pluginRegistry } from "./plugins/registry";
import type { PluginContext } from "./plugins/types";

import { runSpecFile } from "./core/runSpec";
import { loadConfig } from "./config/loadConfig";
import { getAuditAiProvider, writeGeneratedTests } from "./ai";

function summarize(results: TestResult[]) {
  const count = (s: TestResult["status"]) => results.filter((r) => r.status === s).length;

  return {
    total: results.length,
    pass: count("PASS"),
    fail: count("FAIL"),
    blocked: count("BLOCKED"),
    na: count("NA"),
    skipped: count("SKIPPED"),
  };
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function getBoolArg(name: string, defaultValue: boolean): boolean {
  const i = process.argv.indexOf(name);
  if (i === -1) return defaultValue;
  const v = process.argv[i + 1];
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return true; // flag present => true
}

function getCsvArg(name: string): string[] {
  const v = getArg(name);
  if (!v) return [];
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}

function addArtifact(artifacts: Artifact[], type: Artifact["type"], filePath: string) {
  if (!fs.existsSync(filePath)) return;
  artifacts.push({
    type,
    path: filePath,
    sha256: hashFileSha256(filePath),
  });
}

async function main(): Promise<0 | 1 | 2> {
  const targetUrlArg = getArg("--url");
  const runId = uuidv4();
  const defaultOut = path.join("reports", "runs", runId);
  const outDir = getArg("--out") ?? defaultOut;
  const tempDir = path.join(outDir, ".tmp");
  const linkLimit = Number(getArg("--max-links") ?? getArg("--linkLimit") ?? "20");
  const headless = getBoolArg("--headless", true);
  const safeMode = getBoolArg("--safe-mode", true);
  const strict = getBoolArg("--strict", false);
  const browserName = (getArg("--browser") ?? "chromium").toLowerCase() as "chromium" | "firefox";
  const pluginNames = getCsvArg("--plugins");
  const specPath = getArg("--spec");
  const resolvedSpecPath = specPath ? path.resolve(specPath) : undefined;

  if (!targetUrlArg) {
    console.error(
      "Usage: npm run audit -- --url <URL> [--out dir] [--browser chromium|firefox] [--headless true|false] [--safe-mode true|false] [--max-links N] [--strict] [--plugins name1,name2] [--spec path]"
    );
    process.exit(1);
  }

  const targetUrl: string = targetUrlArg;
  const maxUiAttemptsArg = getArg("--max-ui-attempts");
  const config = loadConfig({
    safeMode,
    maxLinks: linkLimit,
    strict,
    browser: browserName,
    headless,
    maxUiAttempts: maxUiAttemptsArg ? Number(maxUiAttemptsArg) : 30,
  });
  if (getArg("--click-allowlist")) {
    config.clickAllowlist = getCsvArg("--click-allowlist");
  }

  // All artifacts are written into a temp directory first and only moved
  // into the final run directory once execution completes successfully.
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const finishedAt = () => new Date().toISOString();
  const runnerVersion = "1.0.0";
  let linkChecks: Awaited<ReturnType<typeof sampleLinks>> = [];
  let mainDocumentHeaders: Record<string, string> | undefined;

  const results: TestResult[] = [];
  const artifacts: Artifact[] = [];

  const usedPlugins: string[] = [];
  const requiresPlugins: string[] = [];

  const launchOptions = { headless };
  const browser =
    browserName === "firefox"
      ? await firefox.launch(launchOptions)
      : await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });

  const consoleCollector = await collectConsoleIssues(page);
  const consoleIssues = consoleCollector.issues;
  const pageErrors = consoleCollector.pageErrors;
  const networkIssues = await collectNetworkIssues(page);
  const responseUrls = collectResponseUrls(page);

  // 1) Homepage open
  let homepageLoaded = false;
  try {
    const t0 = Date.now();
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (response) mainDocumentHeaders = response.headers();
    const title = await page.title();
    const duration = Date.now() - t0;

    homepageLoaded = true;

    results.push({
      code: "CORE.HOMEPAGE.OPEN",
      title: "Homepage opens and has a title",
      status: title?.trim() ? "PASS" : "FAIL",
      meta: { durationMs: duration, title },
    });
  } catch (e: any) {
    const shotPath = artifactPathInRun(tempDir, "homepage_open_fail.png");
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch {}
    addArtifact(artifacts, "SCREENSHOT", shotPath);

    results.push({
      code: "CORE.HOMEPAGE.OPEN",
      title: "Homepage opens and has a title",
      status: "FAIL",
      errorMessage: e?.message ?? "page.goto failed",
      evidence: fs.existsSync(shotPath) ? [shotPath] : undefined,
    });
  }

  // Homepage açılmadıysa erken çık
  if (!homepageLoaded) {
    const tracePath = artifactPathInRun(tempDir, "trace.zip");
    await context.tracing.stop({ path: tracePath });
    addArtifact(artifacts, "TRACE", tracePath);

    await context.close();
    await browser.close();

    const report: AuditReport = {
      schemaVersion: "1.0",
      runnerVersion,
      runId,
      targetUrl,
      startedAt,
      finishedAt: finishedAt(),
      usedPlugins,
      requiresPlugins,
      artifacts,
      results,
      summary: summarize(results),
    };

    writeJsonReport(tempDir, report);
    printSummary(report);
    console.log("\nRun dir:", outDir);
    return 1; // crash
  }

  // 0) BLOCKED tespiti
  const hasCaptcha = await detectCaptcha(page);
  if (hasCaptcha) {
    const shotPath = artifactPathInRun(tempDir, "blocked_captcha.png");
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch {}
    addArtifact(artifacts, "SCREENSHOT", shotPath);

    results.push({
      code: "CORE.CAPTCHA.DETECTED",
      title: "Captcha detected (automation cannot proceed without human/approved bypass)",
      status: "BLOCKED",
      errorMessage: "Captcha detected. Requires site-specific handling; bypass is not attempted.",
      evidence: fs.existsSync(shotPath) ? [shotPath] : undefined,
    });

    if (!requiresPlugins.includes("manual-review")) requiresPlugins.push("manual-review");
  }

  const loginRequired = await detectLogin(page);
  if (loginRequired) {
    const shotPath = artifactPathInRun(tempDir, "blocked_login.png");
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch {}
    addArtifact(artifacts, "SCREENSHOT", shotPath);

    results.push({
      code: "CORE.AUTH.REQUIRED",
      title: "Authentication appears required (login detected)",
      status: "BLOCKED",
      errorMessage: "Login detected. Requires AUTH plugin with credentials/SSO flow.",
      evidence: fs.existsSync(shotPath) ? [shotPath] : undefined,
    });

    if (!requiresPlugins.includes("auth-basic")) requiresPlugins.push("auth-basic");
  }

  // 1) Plugin'leri çalıştır
  for (const name of pluginNames) {
    const plugin = pluginRegistry[name];

    if (!plugin) {
      results.push({
        code: "PLUGIN.NOT_FOUND",
        title: `Plugin not found: ${name}`,
        status: "NA",
        errorMessage: "No such plugin in registry.",
      });
      continue;
    }

    usedPlugins.push(name);

    const pctx: PluginContext = {
      runId,
      targetUrl,
      outDir: tempDir,
      page,
      context,
      results,
      artifacts,
    };

    try {
      await plugin.apply(pctx);
    } catch (e: any) {
      results.push({
        code: "PLUGIN.ERROR",
        title: `Plugin error: ${name}`,
        status: "FAIL",
        errorMessage: e?.message ?? "plugin threw an error",
      });
    }
  }

  const isBlocked = results.some((r) => r.status === "BLOCKED");


  // 1.4) UI HEURISTICS (siteye özel script olmadan "elimden gelen" kontroller)
  if (isBlocked) {
    results.push({
      code: "UI.HEURISTICS.SKIPPED",
      title: "UI heuristics skipped because audit is BLOCKED",
      status: "SKIPPED",
      errorMessage: "Skipped due to captcha/auth block.",
    });
  } else {
    try {
      await runUiHeuristics({
        page,
          outDir: tempDir,
        results,
        artifacts,
        options: { sampleLimit: 20, a11yStrict: strict },
      });
    } catch (e: any) {
      results.push({
        code: "UI.HEURISTICS.ERROR",
        title: "UI heuristics failed unexpectedly",
        status: "NA",
        errorMessage: e?.message ?? "ui heuristics threw",
      });
    }
  }

  // 1.5) ELEMENT SPEC (pluginlerden sonra)
  if (resolvedSpecPath) {
    if (isBlocked) {
      results.push({
        code: "ELM.SPEC.SKIPPED",
        title: "Element spec skipped because audit is BLOCKED",
        status: "SKIPPED",
        errorMessage: "Skipped due to captcha/auth block.",
      });
    } else {
      try {
        await runSpecFile({
          specPath: resolvedSpecPath,
          page,
          outDir: tempDir,
          results,
          artifacts,
        });
      } catch (e: any) {
        results.push({
          code: "ELM.SPEC.RUN_FAILED",
          title: "Element spec runner failed",
          status: "FAIL",
          errorMessage: e?.message ?? "runSpecFile threw",
        });
      }
    }
  } else {
    results.push({
      code: "ELM.SPEC.NOT_PROVIDED",
      title: "Element spec was not provided",
      status: "SKIPPED",
      errorMessage: "Run without --spec (site-specific UI checks not executed).",
    });
  }

  // 2) Console health
  const consoleErrorCount = consoleIssues.filter((i) => i.type === "error").length;
  results.push({
    code: "CORE.CONSOLE.NO_ERRORS",
    title: "No console errors on initial load",
    status: consoleErrorCount === 0 ? "PASS" : "FAIL",
    meta: {
      errorCount: consoleErrorCount,
      warningCount: consoleIssues.filter((i) => i.type === "warning").length,
      samples: consoleIssues.slice(0, 5),
    },
  });

  // 3) Network health
  const httpBad = networkIssues.filter((i) => i.kind === "HTTP_4XX_5XX");
  const failedReq = networkIssues.filter((i) => i.kind === "FAILED_REQUEST");

  results.push({
    code: "CORE.NETWORK.NO_4XX_5XX",
    title: "No HTTP 4xx/5xx responses on initial load",
    status: httpBad.length === 0 ? "PASS" : "FAIL",
    meta: { count: httpBad.length, samples: httpBad.slice(0, 10) },
  });

  results.push({
    code: "CORE.NETWORK.NO_FAILED_REQUESTS",
    title: "No failed network requests on initial load",
    status: failedReq.length === 0 ? "PASS" : "FAIL",
    meta: { count: failedReq.length, samples: failedReq.slice(0, 10) },
  });

    // 4) Link sampling
  if (isBlocked) {
    results.push({
      code: "CORE.LINKS.SAMPLE_OK",
      title: `Sampled ${linkLimit} links and ensured they are reachable`,
      status: "SKIPPED",
      errorMessage: "Skipped because audit is BLOCKED (captcha/auth).",
    });
  } else {
    try {
      linkChecks = await sampleLinks(page, linkLimit);

      const broken = linkChecks.filter((l) => l.status === "BROKEN");
      const skipped = linkChecks.filter((l) => l.status === "SKIPPED");

      const brokenByCategory = broken.reduce<Record<string, number>>((acc, x) => {
        const k = x.category ?? "UNKNOWN";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

      // 🔎 timeout/network SKIPPED sayısı
      const skippedNetwork = skipped.filter((x) => x.category === "NETWORK").length;

      // Plugin önerileri (BROKEN üstünden)
      if ((brokenByCategory["AUTH"] ?? 0) > 0 && !requiresPlugins.includes("auth-basic")) {
        requiresPlugins.push("auth-basic");
      }
      if (((brokenByCategory["FORBIDDEN"] ?? 0) > 0 || (brokenByCategory["RATE_LIMIT"] ?? 0) > 0) &&
          !requiresPlugins.includes("manual-review")) {
        requiresPlugins.push("manual-review");
      }

      // ✅ Karar mantığı:
      // - Gerçek FAIL: en az 1 BROKEN var ve bu BROKEN'lar policy/rate değil (403/429 ağırlıklı değil),
      //   ayrıca SKIPPED'lar çoğunluğu oluşturmuyor.
      // - SKIPPED: çok sayıda SKIPPED (timeout/rate) varsa veya BROKEN'lar 403/429 ağırlıklıysa.
      // - PASS: BROKEN yok.

      const totalChecked = linkChecks.length;
      const totalBroken = broken.length;

      const forb = brokenByCategory["FORBIDDEN"] ?? 0;
      const rate = brokenByCategory["RATE_LIMIT"] ?? 0;

      // policy-heavy: BROKEN içinde 403/429 oranı yüksekse
      const policyHeavy =
        totalBroken > 0 && (forb + rate) / totalBroken >= 0.6;

      // network-heavy: SKIPPED(network) çoksa (kamu sitelerinde sık)
      const networkHeavy =
        totalChecked > 0 && (skippedNetwork / totalChecked) >= 0.3 && skippedNetwork >= 3;

      let status: TestResult["status"] = "PASS";
      let errorMessage: string | undefined;

      if (totalBroken === 0) {
        status = "PASS";
      } else if (policyHeavy || networkHeavy) {
        status = "SKIPPED";
        errorMessage = policyHeavy
          ? "Most broken link checks look like access policy/rate-limit (403/429). Treating as SKIPPED."
          : "Many link checks timed out (network/rate). Treating as SKIPPED.";
      } else {
        status = "FAIL";
      }

      results.push({
        code: "CORE.LINKS.SAMPLE_OK",
        title: `Sampled ${linkLimit} links and ensured they are reachable`,
        status,
        errorMessage,
        meta: {
          sampled: totalChecked,
          brokenCount: totalBroken,
          skippedCount: skipped.length,
          brokenByCategory,
          brokenSamples: broken.slice(0, 10),
          skippedSamples: skipped.slice(0, 10),
        },
      });
    } catch (e: any) {
      results.push({
        code: "CORE.LINKS.SAMPLE_OK",
        title: `Sampled ${linkLimit} links and ensured they are reachable`,
        status: "NA",
        errorMessage: e?.message ?? "link sampling failed",
      });
    }
  }

  // UI inventory, safe attempts, then gaps (while page still open)
  let uiInventory: UiInventory | null = null;
  let gaps: UiGap[] = [];
  try {
    const skipAll: ReasonCode | undefined = isBlocked
      ? (hasCaptcha ? "CAPTCHA_DETECTED" : "REQUIRES_AUTH")
      : undefined;
    const elements = await domScan({
      page,
      pageUrl: targetUrl,
      isBlocked,
      skipReasonsForAll: skipAll,
    });
    if (!isBlocked && elements.length > 0) {
      const auditResult = await runAutoUiAudit({
        page,
        elements,
        pageUrl: targetUrl,
        config: {
          safeMode: config.safeMode,
          maxAttemptsTotal: config.maxUiAttempts ?? 150,
          maxAttempts: config.maxUiAttempts,
          clickAllowlist: config.clickAllowlist,
        },
      });
      uiInventory = {
        pageUrl: targetUrl,
        capturedAt: new Date().toISOString(),
        elements,
        scrollMetrics: auditResult?.scrollMetrics,
      };
    } else {
      uiInventory = {
        pageUrl: targetUrl,
        capturedAt: new Date().toISOString(),
        elements,
      };
    }
    gaps = buildGaps(elements);
  } catch (e: any) {
    console.warn("UI inventory/gaps failed:", e?.message);
  }

  const tracePath = artifactPathInRun(outDir, "trace.zip");
  await context.tracing.stop({ path: tracePath });
  addArtifact(artifacts, "TRACE", tracePath);

  let cookies: Array<{ name: string; secure?: boolean; httpOnly?: boolean; sameSite?: string }> = [];
  try {
    cookies = await context.cookies();
  } catch {}

  await context.close();
  await browser.close();

  let mainOrigin = "";
  try {
    mainOrigin = new URL(targetUrl).origin;
  } catch {}
  const thirdPartyOrigins = [...new Set(
    responseUrls
      .map((u) => {
        try {
          return new URL(u).origin;
        } catch {
          return null;
        }
      })
      .filter((o): o is string => o != null)
  )].filter((o) => o !== mainOrigin);

  const findings = runRuleEngine({
    targetUrl,
    results,
    consoleIssues,
    pageErrors,
    networkIssues,
    linkChecks,
    mainDocumentHeaders,
    cookies: cookies.map((c) => ({ name: c.name, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite })),
    thirdPartyOrigins,
  });

  const totalElements = uiInventory?.elements.length ?? 0;
  const testedElements = uiInventory?.elements.filter((e) => e.status === "TESTED_SUCCESS").length ?? 0;
  const skippedElements = uiInventory?.elements.filter((e) => e.status === "SKIPPED").length ?? 0;
  const failedElements = uiInventory?.elements.filter((e) => e.status === "ATTEMPTED_FAILED").length ?? 0;
  const attemptedNoEffectElements = uiInventory?.elements.filter((e) => e.status === "ATTEMPTED_NO_EFFECT").length ?? 0;
  const byStatus: Record<string, number> = { TESTED_SUCCESS: 0, SKIPPED: 0, ATTEMPTED_FAILED: 0, ATTEMPTED_NO_EFFECT: 0 };
  const byReasonCode: Record<string, number> = {};
  for (const e of uiInventory?.elements ?? []) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    if (e.reasonCode) byReasonCode[e.reasonCode] = (byReasonCode[e.reasonCode] ?? 0) + 1;
  }
  const topSkipReasons = Object.entries(byReasonCode).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  const topReasonCodes = topSkipReasons.map((r) => ({ reasonCode: r.reason, count: r.count }));
  const topActionableItems = (uiInventory?.elements ?? [])
    .filter((e) => !e.tested && e.reasonCode && e.actionHint)
    .slice(0, 20)
    .map((e) => ({ elementId: e.elementId, reasonCode: e.reasonCode!, actionHint: e.actionHint! }));
  const actionableGaps = uiInventory?.elements.filter((e) => !e.tested).length ?? 0;
  const unknownReasonCount = uiInventory?.elements.filter((e) => e.reasonCode === "UNKNOWN").length ?? 0;

  const runInfo: RunInfo = {
    runId,
    url: targetUrl,
    startedAt,
    finishedAt: finishedAt(),
    runnerVersion,
    status: isBlocked ? "blocked" : "ok",
  };
  const runConfig: RunConfig = {
    headless,
    browser: browserName,
    safeMode,
    maxLinks: linkLimit,
    strict,
    linkLimit,
  };
  const evidence: Evidence = {
    screenshot: artifacts.find((a) => a.type === "SCREENSHOT")?.path,
    trace: artifacts.find((a) => a.type === "TRACE")?.path,
    consoleLogPath: path.join(tempDir, "console.json"),
    networkLogPath: path.join(tempDir, "network.json"),
    requestFailedPath: path.join(tempDir, "request_failed.json"),
  };
  const sm = uiInventory?.scrollMetrics;
  const uiCoverage: UiCoverageSummary = {
    totalElements,
    testedElements,
    skippedElements,
    failedElements,
    attemptedNoEffectElements,
    topSkipReasons,
    byStatus,
    byReasonCode,
    topReasonCodes,
    topActionableItems,
    actionableGaps: gaps.length,
    unknownReasonCount,
    attemptedCountTotal: sm?.attemptedCountTotal,
    newlyDiscoveredPerScrollStep: sm?.newlyDiscoveredPerScrollStep,
    skippedHiddenCount: sm?.skippedHiddenCount,
    skippedOutOfViewportCount: sm?.skippedOutOfViewportCount,
    collisionCountTotal: sm?.collisionCountTotal,
  };
  const metrics: Metrics = {
    durationMs: results.find((r) => r.code === "CORE.HOMEPAGE.OPEN")?.meta?.durationMs as number | undefined,
    linkSampled: linkChecks.length,
    linkBroken: linkChecks.filter((l) => l.status === "BROKEN").length,
    consoleErrors: consoleIssues.filter((i) => i.type === "error").length,
    consoleWarnings: consoleIssues.filter((i) => i.type === "warning").length,
    response4xx5xx: networkIssues.filter((i) => i.kind === "HTTP_4XX_5XX").length,
    requestFailed: networkIssues.filter((i) => i.kind === "FAILED_REQUEST").length,
  };

  let playwrightVersion: string | undefined;
  try {
    playwrightVersion = require("playwright/package.json").version;
  } catch {}

  const runMetadata: RunMetadata = {
    nodeVersion: process.version,
    platform: process.platform,
    playwrightVersion,
  };

  const summaryReport: SummaryReport = {
    run: runInfo,
    config: runConfig,
    evidence,
    findings,
    uiCoverage,
    metrics,
    runMetadata,
  };

  writeRunReports({
    runDir: tempDir,
    summary: summaryReport,
    uiInventory,
    gaps,
    consoleIssues,
    pageErrors,
    networkIssues,
  });

  if (config.aiProviderEnabled && gaps.length > 0) {
    try {
      const aiProvider = getAuditAiProvider(config);
      const suggestions = await aiProvider.generateTestSuggestions({
        gaps,
        inventory: uiInventory,
        runId,
        targetUrl,
      });
      if (suggestions.length > 0) {
        const written = writeGeneratedTests(tempDir, suggestions);
        console.log("Generated test skeletons (review required):", written.length, "files in", path.join(tempDir, "generated", "tests"));
      }
    } catch (e: any) {
      console.warn("AI provider / generated tests failed:", e?.message);
    }
  }

  const report: AuditReport = {
    schemaVersion: "1.0",
    runnerVersion,
    runId,
    targetUrl,
    startedAt,
    finishedAt: finishedAt(),
    usedPlugins,
    requiresPlugins,
    artifacts,
    results,
    summary: summarize(results),
  };

  writeJsonReport(tempDir, report);

  // Finalize: move temp directory to final run directory and write completion marker.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  fs.renameSync(tempDir, outDir);

  const completionMarker = {
    runId,
    url: targetUrl,
    finishedAt: runInfo.finishedAt,
    status: runInfo.status,
  };
  fs.writeFileSync(
    path.join(outDir, "run.complete.json"),
    JSON.stringify(completionMarker, null, 2),
    "utf-8"
  );
  printSummary(report);
  console.log("\nRun dir:", outDir);
  console.log("summary.json, ui-inventory.json, gaps.json, console.json, network.json, request_failed.json");

  let exitCode: 0 | 1 | 2 = 0;
  if (strict) {
    const critical = findings.filter((f) => f.severity === "critical").length;
    const error = findings.filter((f) => f.severity === "error").length;
    const warn = findings.filter((f) => f.severity === "warn").length;
    if (critical > 0 || error > 5 || warn > 20) exitCode = 2;
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("Fatal:", e);
    try {
      const outDir = getArg("--out") ?? path.join("reports", "runs", "crash-" + Date.now());
      const url = getArg("--url") ?? "unknown";
      const summaryPath = writeMinimalSummaryForCrash({
        runDir: outDir,
        url,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
      console.error("Wrote minimal summary (crash):", summaryPath);
    } catch (writeErr) {
      console.error("Failed to write minimal summary:", writeErr);
    }
    process.exit(1);
  });
