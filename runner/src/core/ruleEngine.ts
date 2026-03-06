import type { TestResult } from "../domain/result";
import type { Finding, FindingStatus, SkipReason } from "../domain/finding";
import type { ConsoleIssue } from "./collectConsoleIssues";
import type { NetworkIssue } from "./collectNetworkIssues";
import type { LinkCheck } from "./sampleLinks";

const CONSOLE_ERROR_PATTERNS = [
  "TypeError",
  "ReferenceError",
  "Mixed Content",
  "CORS",
  "Failed to fetch",
];

export type CookieInfo = {
  name: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None" | string;
};

export type RuleEngineInput = {
  targetUrl: string;
  results: TestResult[];
  consoleIssues: ConsoleIssue[];
  pageErrors: string[];
  networkIssues: NetworkIssue[];
  linkChecks?: LinkCheck[];
  /** Main document response headers (for security headers rule). */
  mainDocumentHeaders?: Record<string, string>;
  /** Cookies from context (for cookie security rule). */
  cookies?: CookieInfo[];
  /** Third-party origins observed (for third-party policy rule). */
  thirdPartyOrigins?: string[];
  /** Denylisted origins; if any thirdPartyOrigin matches, produce a finding. */
  thirdPartyDenylist?: string[];
};

import { runHttpResponseRules } from "../rules/http/analyzer";
import { runJsAnalyzer } from "../rules/js/analyzer";

function isTelemetryUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("google-analytics") ||
      host.includes("googletagmanager") ||
      host.includes("doubleclick") ||
      host.includes("gstatic") ||
      host.includes("youtube") ||
      host.includes("ytimg") ||
      host.includes("googlesyndication")
    );
  } catch {
    return false;
  }
}

export function runRuleEngine(input: RuleEngineInput): Finding[] {
  const findings: Finding[] = [];

  const consoleErrors = input.consoleIssues.filter((i) => i.type === "error");
  const consoleWarnings = input.consoleIssues.filter((i) => i.type === "warning");
  const hasPageError = input.pageErrors.length > 0;
  const patternMatched = [...input.consoleIssues, ...input.pageErrors.map((t) => ({ type: "error", text: t }))].some(
    (i) => CONSOLE_ERROR_PATTERNS.some((p) => (i as { text: string }).text?.includes(p))
  );

  if (consoleErrors.length > 0 || hasPageError) {
    findings.push({
      ruleId: "console_rule",
      severity: "error",
      category: "console",
      title: "Runtime/Console errors detected",
      detail: `${consoleErrors.length} console.error(s), ${input.pageErrors.length} pageerror(s).`,
      remediation:
        "Fix JS exceptions, mixed-content, CORS violations; attach console logs as evidence.",
      evidence: undefined,
      meta: {
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: input.pageErrors.length,
        samples: [...consoleErrors.slice(0, 5), ...input.pageErrors.slice(0, 3).map((t) => ({ type: "pageerror", text: t }))],
      },
      status: "OK",
    });
  }

  if (consoleWarnings.length > 0 || patternMatched) {
    findings.push({
      ruleId: "console_rule",
      severity: "warn",
      category: "console",
      title: "Console warnings detected",
      detail: `${consoleWarnings.length} warning(s).`,
      remediation: "Review warnings; often indicate deprecations, CSP issues, or resource loads.",
      meta: { count: consoleWarnings.length, samples: consoleWarnings.slice(0, 5) },
      status: "OK",
    });
  }

  const networkNonPolicy = input.networkIssues.filter((i) => !i.policyReason);
  const httpBad = networkNonPolicy.filter((i) => i.kind === "HTTP_4XX_5XX");
  if (httpBad.length > 0) {
    findings.push({
      ruleId: "network_rule",
      severity: "error",
      category: "network",
      title: "HTTP error responses detected",
      detail: `${httpBad.length} response(s) with status >= 400.`,
      remediation: "Fix endpoints returning 4xx/5xx; ensure static resources are accessible.",
      meta: { count: httpBad.length, samples: httpBad.slice(0, 10) },
      status: "FAILED",
    });
  }

  const failedReq = networkNonPolicy.filter((i) => i.kind === "FAILED_REQUEST");
  if (failedReq.length > 0) {
    findings.push({
      ruleId: "network_rule",
      severity: "critical",
      category: "network",
      title: "Network request failures detected",
      detail: `${failedReq.length} request(s) failed (DNS/timeout/blocked).`,
      remediation:
        "Investigate DNS/timeouts/blocked requests; check firewall/proxy policies in public networks.",
      meta: { count: failedReq.length, samples: failedReq.slice(0, 10) },
      status: "FAILED",
    });
  }

  // Telemetry / analytics endpoints: keep as informational only.
  const telemetryIssues = input.networkIssues.filter(
    (i) =>
      (i.kind === "HTTP_4XX_5XX" || i.kind === "FAILED_REQUEST") &&
      isTelemetryUrl(i.url)
  );
  if (telemetryIssues.length > 0) {
    findings.push({
      ruleId: "network_telemetry",
      severity: "info",
      category: "network",
      title: "Telemetry/analytics endpoints failed",
      detail: `${telemetryIssues.length} request(s) to analytics/telemetry domains failed or returned errors.`,
      remediation:
        "Review telemetry/analytics endpoints if required; these are informational only for application availability.",
      meta: { samples: telemetryIssues.slice(0, 10) },
      status: "INFO",
    });
  }

  // Aggregate SKIPPED due to network policy (timeouts/429/blocked).
  const policyIssues = input.networkIssues.filter((i) => i.policyReason === "NETWORK_POLICY");
  if (policyIssues.length > 0) {
    findings.push({
      ruleId: "network_policy_skipped",
      severity: "info",
      category: "network",
      title: "Requests skipped due to network policy",
      detail: `${policyIssues.length} request(s) were skipped due to timeouts, proxies or rate limits.`,
      remediation:
        "Review network/firewall/WAF and rate-limit policies; if intentional, this can usually be accepted as risk.",
      confidence: 0.8,
      meta: { samples: policyIssues.slice(0, 20) },
      status: "SKIPPED",
      skipReason: "NETWORK_POLICY",
    });
  }

  if (input.linkChecks) {
    const broken = input.linkChecks.filter((l) => l.status === "BROKEN");
    let origin: string;
    try {
      origin = new URL(input.targetUrl).origin;
    } catch {
      origin = "";
    }
    const internalBroken = broken.filter((l) => {
      try {
        return new URL(l.url).origin === origin;
      } catch {
        return false;
      }
    });
    if (internalBroken.length > 0) {
      findings.push({
        ruleId: "link_rule",
        severity: "warn",
        category: "link",
        title: "Broken internal links detected",
        detail: `${broken.length} broken link(s) in sample.`,
        remediation: "Fix 404/500 internal paths; update navigation and sitemap.",
        meta: { brokenCount: broken.length, samples: broken.slice(0, 10) },
        status: "OK",
      });
    }
  }

  const a11yFail = input.results.find(
    (r) => r.code === "UI.HEURISTICS.A11Y_NAMES" && r.status === "FAIL"
  );
  if (a11yFail) {
    findings.push({
      ruleId: "form_rule",
      severity: "warn",
      category: "form",
      title: "Form accessibility baseline failed",
      detail: a11yFail.errorMessage ?? "Missing labels/aria for form controls.",
      remediation: "Add <label for> or aria-label; ensure keyboard accessibility.",
      meta: a11yFail.meta,
      status: "FAILED",
    });
  }

  const blocked = input.results.some((r) => r.status === "BLOCKED");
  if (blocked) {
    findings.push({
      ruleId: "blocker",
      severity: "critical",
      category: "blocker",
      title: "Audit blocked (captcha or login required)",
      remediation: "Use allowlisted auth plugin or manual review.",
      meta: { codes: input.results.filter((r) => r.status === "BLOCKED").map((r) => r.code) },
      status: "SKIPPED",
      skipReason: "AUTH_BLOCKED",
    });
  }
  findings.push(
    ...runHttpResponseRules({
      targetUrl: input.targetUrl,
      mainDocumentHeaders: input.mainDocumentHeaders,
      cookies: input.cookies,
      networkIssues: input.networkIssues,
    }),
  );

  // JavaScript / frontend analysis: secrets, API endpoints, sourcemaps, debug noise.
  findings.push(
    ...runJsAnalyzer({
      targetUrl: input.targetUrl,
      consoleIssues: input.consoleIssues,
      responseUrls: input.thirdPartyOrigins ?? [],
      // mainDocumentHtml could be wired here in the future; for now we omit it
      // to avoid large payloads through the rule engine interface.
    }),
  );

  if (input.thirdPartyOrigins && input.thirdPartyOrigins.length > 0) {
    const denylist = input.thirdPartyDenylist ?? [];
    const blocked = denylist.filter((d) => input.thirdPartyOrigins!.some((o) => o === d || o.endsWith("." + d)));
    if (blocked.length > 0) {
      findings.push({
        ruleId: "third_party_policy_rule",
        severity: "warn",
        category: "network",
        title: "Third-party denylist: requests to disallowed domains",
        detail: `Observed requests to: ${blocked.join(", ")}.`,
        remediation: "Remove or allowlist these domains; enforce third-party policy in governance.",
        meta: { blocked, thirdPartyOrigins: input.thirdPartyOrigins.slice(0, 50) },
      });
    }
    findings.push({
      ruleId: "third_party_inventory",
      severity: "info",
      category: "network",
      title: "Third-party domains observed",
      detail: `${input.thirdPartyOrigins.length} distinct origin(s).`,
      remediation: "Review for governance and data-residency requirements.",
      meta: { origins: input.thirdPartyOrigins.slice(0, 50) },
    });
  }

  return findings;
}
