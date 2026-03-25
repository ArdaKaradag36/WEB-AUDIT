import { test, expect } from "@playwright/test";
import { runRuleEngine, type RuleEngineInput } from "../core/ruleEngine";

test("rule engine combines HTTP, cookie, JS and network rules", () => {
  const input: RuleEngineInput = {
    targetUrl: "https://example.com",
    results: [],
    consoleIssues: [],
    pageErrors: [],
    networkIssues: [
      // HTTP 500 response
      { url: "https://example.com/api/data", kind: "HTTP_4XX_5XX", status: 500 },
    ] as any,
    linkChecks: [],
    mainDocumentHeaders: {
      "Content-Type": "text/html",
      // missing HSTS and CSP
      "Referrer-Policy": "no-referrer-when-downgrade",
      "X-Content-Type-Options": "nosniff",
    },
    cookies: [
      { name: "sessionid", secure: false, httpOnly: false, sameSite: "None" },
    ],
    thirdPartyOrigins: [
      "https://api.example.com",
    ],
    // responseUrls is what js/analyzer reads for sourcemap detection (KWA-JS-003).
    responseUrls: [
      "https://example.com/static/app.js",
      "https://example.com/static/app.js.map",
    ],
  };

  const findings = runRuleEngine(input);
  const ruleIds = findings.map((f) => f.ruleId);

  // HTTP security headers (HSTS, CSP missing)
  expect(ruleIds).toContain("KWA-HTTP-001");
  expect(ruleIds).toContain("KWA-HTTP-002");

  // Cookie security flags
  expect(ruleIds).toContain("KWA-HTTP-009");

  // JS/sourcemap or network rules should also be present via js analyzer.
  expect(ruleIds.some((id) => id.startsWith("KWA-JS-"))).toBeTruthy();
});

test("rule engine: blocker only for captcha BLOCKED, not AUTH WARN", () => {
  const empty: RuleEngineInput = {
    targetUrl: "https://example.com",
    results: [],
    consoleIssues: [],
    pageErrors: [],
    networkIssues: [],
    linkChecks: [],
  };

  const authWarn = runRuleEngine({
    ...empty,
    results: [
      { code: "CORE.AUTH.REQUIRED", title: "Auth", status: "WARN" },
    ] as any,
  });
  expect(authWarn.some((f) => f.ruleId === "blocker")).toBe(false);

  const captchaBlocked = runRuleEngine({
    ...empty,
    results: [
      { code: "CORE.CAPTCHA.DETECTED", title: "Captcha", status: "BLOCKED" },
    ] as any,
  });
  expect(captchaBlocked.some((f) => f.ruleId === "blocker")).toBe(true);
});

