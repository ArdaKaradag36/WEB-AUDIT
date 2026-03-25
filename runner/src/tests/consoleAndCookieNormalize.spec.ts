import { test, expect } from "@playwright/test";
import { dedupeConsoleIssues, isKnownDevCdnWarning, normalizeConsoleIssuesForScoring } from "../core/consoleNormalize";
import { cookieDomainMatchesSite, filterCookiesForTargetSite } from "../core/cookieFilter";
import type { Cookie } from "@playwright/test";

test("console: 15 aynı Tailwind uyarısı → 1; skor için gürültü sıfır", () => {
  const msg =
    "cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation";
  const raw = Array.from({ length: 15 }, () => ({
    type: "warning" as const,
    text: msg,
    location: "https://cdn.tailwindcss.com/:63",
  }));
  expect(dedupeConsoleIssues(raw).length).toBe(1);
  expect(isKnownDevCdnWarning(msg)).toBe(true);
  expect(normalizeConsoleIssuesForScoring(raw).length).toBe(0);
});

test("cookie: yalnızca hedef host ile eşleşen çerezler (Twitter çerezi elenir)", () => {
  const site = "https://user.github.io/app/";
  const cookies: Cookie[] = [
    {
      name: "guest_id",
      value: "x",
      domain: ".twitter.com",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: "None",
    },
    {
      name: "_gh_sess",
      value: "y",
      domain: ".github.io",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ];
  const f = filterCookiesForTargetSite(cookies, site);
  expect(f.some((c) => c.name === "guest_id")).toBe(false);
  expect(f.some((c) => c.name === "_gh_sess")).toBe(true);
});

test("cookieDomainMatchesSite", () => {
  expect(cookieDomainMatchesSite(".example.com", "app.example.com")).toBe(true);
  expect(cookieDomainMatchesSite("twitter.com", "github.io")).toBe(false);
});

test("console: CSP / Google 403 / YouTube ads CORS — skor gürültüsü elenir", () => {
  const issues = [
    {
      type: "error" as const,
      text: "Executing inline script violates the following Content Security Policy directive 'script-src-elem",
      location: "https://example.com/:1",
    },
    {
      type: "error" as const,
      text: "Failed to load resource: the server responded with a status of 403 ()",
      location: "https://accounts.google.com/v3/signin/identifier:0",
    },
    {
      type: "error" as const,
      text: "Access to fetch at 'https://googleads.g.doubleclick.net/...' has been blocked by CORS policy",
      location: "https://www.youtube.com/watch?v=x:0",
    },
  ];
  expect(normalizeConsoleIssuesForScoring(issues)).toHaveLength(0);
});
