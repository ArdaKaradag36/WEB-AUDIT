import type { TestResult } from "../domain/result";
import type { Finding } from "../domain/finding";
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
    });
  }

  const httpBad = input.networkIssues.filter((i) => i.kind === "HTTP_4XX_5XX");
  if (httpBad.length > 0) {
    findings.push({
      ruleId: "network_rule",
      severity: "error",
      category: "network",
      title: "HTTP error responses detected",
      detail: `${httpBad.length} response(s) with status >= 400.`,
      remediation: "Fix endpoints returning 4xx/5xx; ensure static resources are accessible.",
      meta: { count: httpBad.length, samples: httpBad.slice(0, 10) },
    });
  }

  const failedReq = input.networkIssues.filter((i) => i.kind === "FAILED_REQUEST");
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
    });
  }

  if (input.mainDocumentHeaders) {
    const h = input.mainDocumentHeaders;
    const header = (name: string) => {
      const lower = name.toLowerCase();
      const ent = Object.entries(h).find(([k]) => k.toLowerCase() === lower);
      return ent?.[1]?.trim();
    };
    const missing: string[] = [];
    if (!header("content-security-policy")) missing.push("Content-Security-Policy");
    if (!header("strict-transport-security")) missing.push("Strict-Transport-Security");
    if (!header("x-content-type-options")) missing.push("X-Content-Type-Options");
    if (!header("referrer-policy")) missing.push("Referrer-Policy");
    const xfo = header("x-frame-options");
    const csp = header("content-security-policy");
    const fa = csp?.includes("frame-ancestors");
    if (!xfo && !fa) missing.push("X-Frame-Options or CSP frame-ancestors");
    if (missing.length > 0) {
      findings.push({
        ruleId: "security_headers_rule",
        severity: "warn",
        category: "security_headers",
        title: "Security headers missing or weak",
        detail: `Missing or not observed: ${missing.join(", ")}.`,
        remediation:
          "Add recommended headers suitable for public sector deployments (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors/X-Frame-Options).",
        meta: { missing, observed: Object.keys(h) },
      });
    }
    if (csp) {
      const cspLower = csp.toLowerCase();
      const unsafe: string[] = [];
      if (cspLower.includes("unsafe-inline")) unsafe.push("unsafe-inline");
      if (cspLower.includes("unsafe-eval")) unsafe.push("unsafe-eval");
      if (cspLower.includes("*") && (cspLower.includes("script-src") || cspLower.includes("default-src"))) unsafe.push("wildcard in script/default-src");
      if (unsafe.length > 0) {
        findings.push({
          ruleId: "csp_quality_rule",
          severity: "warn",
          category: "security_headers",
          title: "CSP uses unsafe or weak directives",
          detail: `Observed: ${unsafe.join(", ")}.`,
          remediation: "Tighten CSP: avoid unsafe-inline, unsafe-eval, and wildcards for script-src/default-src.",
          meta: { unsafe },
        });
      }
    }
  }

  if (input.cookies && input.cookies.length > 0) {
    const weak: Array<{ name: string; missing: string[] }> = [];
    for (const c of input.cookies) {
      const missing: string[] = [];
      if (!c.secure) missing.push("Secure");
      if (!c.httpOnly) missing.push("HttpOnly");
      if (c.sameSite === "None" && !c.secure) missing.push("SameSite=None requires Secure");
      if (missing.length > 0) weak.push({ name: c.name, missing });
    }
    if (weak.length > 0) {
      findings.push({
        ruleId: "cookie_security_rule",
        severity: "warn",
        category: "security_headers",
        title: "Cookie security flags missing or weak",
        detail: `${weak.length} cookie(s) with missing Secure/HttpOnly or invalid SameSite.`,
        remediation: "Set Secure and HttpOnly on sensitive cookies; prefer SameSite=Strict or Lax.",
        meta: { weakCookies: weak.slice(0, 20) },
      });
    }
  }

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
