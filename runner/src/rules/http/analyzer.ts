import type { Finding } from "../../domain/finding";
import type { NetworkIssue } from "../../core/collectNetworkIssues";
import type { CookieInfo } from "../../core/ruleEngine";
import { httpRuleCatalog } from "./catalog";

export type HttpRuleInput = {
  targetUrl: string;
  mainDocumentHeaders?: Record<string, string>;
  cookies?: CookieInfo[];
  networkIssues: NetworkIssue[];
};

function headerLookup(
  headers: Record<string, string> | undefined,
): (name: string) => string | undefined {
  if (!headers) {
    return () => undefined;
  }
  return (name: string) => {
    const lower = name.toLowerCase();
    const ent = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
    const raw = ent?.[1];
    if (raw == null) return undefined;
    return Array.isArray(raw) ? raw.join(", ") : String(raw);
  };
}

function getRule(id: string) {
  return httpRuleCatalog.find((r) => r.id === id)!;
}

export function runHttpResponseRules(input: HttpRuleInput): Finding[] {
  const findings: Finding[] = [];
  const h = input.mainDocumentHeaders;
  const header = headerLookup(h);

  const isHttps = (() => {
    try {
      return new URL(input.targetUrl).protocol === "https:";
    } catch {
      return false;
    }
  })();

  // KWA-HTTP-001 – HSTS missing or weak (HTTPS only)
  if (isHttps) {
    const rule = getRule("KWA-HTTP-001");
    const hsts = header("strict-transport-security");
    let needsFinding = false;
    let detail = "";
    if (!hsts) {
      needsFinding = true;
      detail = "Strict-Transport-Security header is not present on the main HTTPS response.";
    } else {
      const maxAgeMatch = /max-age\s*=\s*(\d+)/i.exec(hsts);
      const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      if (!maxAgeMatch || !Number.isFinite(maxAge) || maxAge < 15552000) {
        needsFinding = true;
        detail = `Strict-Transport-Security is present but max-age appears low or missing (value="${hsts}").`;
      }
    }
    if (needsFinding) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail,
        remediation: rule.remediation,
        confidence: 0.95,
        meta: { headers: h },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-002 – CSP missing (HTTPS only)
  if (isHttps) {
    const rule = getRule("KWA-HTTP-002");
    const csp = header("content-security-policy");
    if (!csp) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: "Content-Security-Policy header is not present on the main response.",
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { headers: h },
        status: "OK",
      });
    }
  }

  const csp = header("content-security-policy");
  if (csp) {
    const cspLower = csp.toLowerCase();

    // KWA-HTTP-003 – CSP unsafe-inline
    if (cspLower.includes("unsafe-inline")) {
      const rule = getRule("KWA-HTTP-003");
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: `Content-Security-Policy contains 'unsafe-inline': ${csp}.`,
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { csp },
        status: "OK",
      });
    }

    // KWA-HTTP-004 – CSP unsafe-eval
    if (cspLower.includes("unsafe-eval")) {
      const rule = getRule("KWA-HTTP-004");
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: `Content-Security-Policy contains 'unsafe-eval': ${csp}.`,
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { csp },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-005 – Clickjacking protection missing
  {
    const rule = getRule("KWA-HTTP-005");
    const xfo = header("x-frame-options");
    const csp = header("content-security-policy");

    const hasFrameAncestors =
      csp?.toLowerCase().includes("frame-ancestors ") ?? false;
    const hasSafeXfo =
      xfo != null &&
      /^(deny|sameorigin)$/i.test(xfo.trim());

    if (!hasFrameAncestors && !hasSafeXfo) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail:
          "Neither a strong X-Frame-Options nor a frame-ancestors directive was observed on the main response.",
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { xFrameOptions: xfo, csp },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-006 – X-Content-Type-Options
  {
    const rule = getRule("KWA-HTTP-006");
    const xcto = header("x-content-type-options");
    if (!xcto || xcto.toLowerCase() !== "nosniff") {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: xcto
          ? `X-Content-Type-Options is "${xcto}", expected 'nosniff'.`
          : "X-Content-Type-Options header is missing.",
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { xContentTypeOptions: xcto },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-007 – Referrer-Policy missing or too permissive
  {
    const rule = getRule("KWA-HTTP-007");
    const rp = header("referrer-policy");
    const lower = rp?.toLowerCase();
    const tooPermissive =
      lower === "unsafe-url" || lower === "no-referrer-when-downgrade";
    if (!rp || tooPermissive) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: !rp
          ? "Referrer-Policy header is missing."
          : `Referrer-Policy is "${rp}", which may leak full URLs to external sites.`,
        remediation: rule.remediation,
        confidence: 0.7,
        meta: { referrerPolicy: rp },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-008 – Permissions-Policy missing
  {
    const rule = getRule("KWA-HTTP-008");
    const pp = header("permissions-policy") ?? header("feature-policy");
    if (!pp) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: "Permissions-Policy (or legacy Feature-Policy) header is missing.",
        remediation: rule.remediation,
        confidence: 0.6,
        meta: { headers: h },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-009 – Cookie flags
  if (input.cookies && input.cookies.length > 0) {
    const rule = getRule("KWA-HTTP-009");
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
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: `${weak.length} cookie(s) with missing Secure/HttpOnly or invalid SameSite settings.`,
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { weakCookies: weak.slice(0, 30) },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-010 – CORS wildcard
  {
    const rule = getRule("KWA-HTTP-010");
    const acao = header("access-control-allow-origin");
    const acac = header("access-control-allow-credentials");
    if (acao && acao.trim() === "*") {
      const unsafeWithCreds =
        acac != null && acac.toLowerCase() === "true";
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: unsafeWithCreds
          ? "Access-Control-Allow-Origin is '*' and credentials are allowed, which is unsafe."
          : "Access-Control-Allow-Origin is '*', which may be unsafe for sensitive APIs.",
        remediation: rule.remediation,
        confidence: unsafeWithCreds ? 0.95 : 0.8,
        meta: { accessControlAllowOrigin: acao, accessControlAllowCredentials: acac },
        status: "OK",
      });
    }
  }

  // KWA-HTTP-011 – Mixed content (HTTPS page with HTTP resources)
  if (isHttps) {
    const rule = getRule("KWA-HTTP-011");
    const mixed: string[] = [];
    for (const issue of input.networkIssues) {
      const url = issue.url;
      if (!url) continue;
      if (url.startsWith("http://")) {
        mixed.push(url);
      }
    }
    if (mixed.length > 0) {
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        title: rule.title,
        detail: `${mixed.length} HTTP resource(s) loaded on HTTPS page.`,
        remediation: rule.remediation,
        confidence: 0.9,
        meta: { mixedSamples: mixed.slice(0, 20) },
      });
    }
  }

  return findings;
}

