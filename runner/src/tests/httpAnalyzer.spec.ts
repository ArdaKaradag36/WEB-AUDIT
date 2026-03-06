import { test, expect } from "@playwright/test";
import { runHttpResponseRules } from "../rules/http/analyzer";
import type { CookieInfo } from "../core/ruleEngine";
import type { NetworkIssue } from "../core/collectNetworkIssues";

function makeHeaders(h: Record<string, string>): Record<string, string> {
  return h;
}

test("HSTS missing and CSP missing produce findings", () => {
  const findings = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({
      "Content-Type": "text/html",
    }),
    cookies: [],
    networkIssues: [],
  });

  const ids = findings.map((f) => f.ruleId);
  expect(ids).toContain("KWA-HTTP-001"); // HSTS
  expect(ids).toContain("KWA-HTTP-002"); // CSP
});

test("CSP unsafe-inline and unsafe-eval are flagged", () => {
  const findings = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';",
    }),
    cookies: [],
    networkIssues: [],
  });

  const ids = findings.map((f) => f.ruleId);
  expect(ids).toContain("KWA-HTTP-003");
  expect(ids).toContain("KWA-HTTP-004");
});

test("X-Content-Type-Options nosniff passes, missing fails", () => {
  const bad = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({}),
    cookies: [],
    networkIssues: [],
  });
  expect(bad.find((f) => f.ruleId === "KWA-HTTP-006")).toBeTruthy();

  const good = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({ "X-Content-Type-Options": "nosniff" }),
    cookies: [],
    networkIssues: [],
  });
  expect(good.find((f) => f.ruleId === "KWA-HTTP-006")).toBeFalsy();
});

test("Cookie flags rule fires for insecure cookies", () => {
  const cookies: CookieInfo[] = [
    { name: "sessionid", secure: false, httpOnly: false, sameSite: "None" },
    { name: "analytics", secure: true, httpOnly: false },
  ];

  const findings = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({}),
    cookies,
    networkIssues: [],
  });

  const cookieFinding = findings.find((f) => f.ruleId === "KWA-HTTP-009");
  expect(cookieFinding).toBeTruthy();
  expect(cookieFinding?.meta).toBeTruthy();
});

test("CORS wildcard with credentials is flagged", () => {
  const findings = runHttpResponseRules({
    targetUrl: "https://example.com",
    mainDocumentHeaders: makeHeaders({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
    }),
    cookies: [],
    networkIssues: [],
  });

  expect(findings.some((f) => f.ruleId === "KWA-HTTP-010")).toBeTruthy();
});

test("Mixed content rule fires on HTTP resources when page is HTTPS", () => {
  const issues: NetworkIssue[] = [
    {
      url: "http://insecure.example.com/script.js",
      kind: "HTTP_4XX_5XX",
      status: 200,
    },
  ];

  const findings = runHttpResponseRules({
    targetUrl: "https://secure.example.com",
    mainDocumentHeaders: makeHeaders({}),
    cookies: [],
    networkIssues: issues,
  });

  expect(findings.some((f) => f.ruleId === "KWA-HTTP-011")).toBeTruthy();
});

