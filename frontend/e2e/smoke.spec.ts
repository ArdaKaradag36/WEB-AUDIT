import { test, expect } from "@playwright/test";

// Minimal e2e smoke: ensure login page and dashboard shell render without crashing
// and audit detail page shows status progression (running -> completed).

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("login page renders", async ({ page }) => {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /giriş/i })).toBeVisible();
});

test("dashboard shell renders when authenticated token is present (mock)", async ({ page }) => {
  // For now we simulate an already-authenticated session by setting a fake token in localStorage.
  await page.addInitScript(() => {
    window.localStorage.setItem("kamu_web_auth_token", "fake-token");
  });

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Gösterge Paneli/i })).toBeVisible();
});

test("audit detail shows running to completed status timeline (mocked API)", async ({ page }) => {
  // Speed up polling interval inside the app for tests.
  await page.addInitScript(() => {
    const originalSetInterval = window.setInterval;
    window.setInterval = (handler, timeout, ...args) => {
      if (typeof timeout === "number" && timeout === 5000) {
        return originalSetInterval(handler, 200, ...args);
      }
      return originalSetInterval(handler, timeout, ...args);
    };

    window.localStorage.setItem("kamu_web_auth_token", "fake-token");
  });

  const auditId = "test-audit-1";
  let detailCallCount = 0;

  // Mock detail endpoint: first "running", then "completed".
  await page.route("**/api/Audits/test-audit-1", async route => {
    detailCallCount += 1;
    const status = detailCallCount === 1 ? "running" : "completed";
    const body = {
      id: auditId,
      targetUrl: "https://example.com",
      status,
      startedAt: new Date().toISOString(),
      finishedAt: status === "completed" ? new Date().toISOString() : null,
      durationMs: 1000,
      linkSampled: 1,
      linkBroken: 0,
      lastError: null,
      errorType: null,
      lastExitCode: 0,
      retryCount: 0
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body)
    });
  });

  // Mock summary endpoint.
  await page.route("**/api/Audits/test-audit-1/summary", async route => {
    const summary = {
      auditRunId: auditId,
      findingsTotal: 0,
      gapsTotal: 0,
      criticalCount: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      gapsByRiskSafe: 0,
      gapsByRiskNeedsAllowlist: 0,
      gapsByRiskDestructive: 0,
      gapsByRiskRequiresAuth: 0,
      durationMs: 1000,
      linkSampled: 1,
      linkBroken: 0,
      totalElements: 0,
      testedElements: 0,
      skippedElements: 0,
      coverageRatio: 0,
      maxConsoleErrorPerPage: 0,
      topFailingUrl: null,
      mostCommonGapReason: null
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(summary)
    });
  });

  // Mock findings/gaps endpoints.
  await page.route("**/api/Audits/test-audit-1/findings**", async route => {
    const payload = {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 200,
      groups: []
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
  });

  await page.route("**/api/Audits/test-audit-1/gaps**", async route => {
    const payload = {
      items: []
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
  });

  await page.goto(`${baseUrl}/audits/${auditId}`, { waitUntil: "domcontentloaded" });

  // Initially running.
  await expect(page.getByText("Devam Ediyor")).toBeVisible();

  // After polling, status should move to completed ("Tamamlandı") and timeline should reflect it.
  await expect(page.getByText("Tamamlandı")).toBeVisible({ timeout: 10000 });
});

test("findings explorer applies status and url filters (mocked API)", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kamu_web_auth_token", "fake-token");
  });

  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const auditId = "audit-findings-1";

  // Mock audits list
  await page.route("**/api/Audits", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: auditId,
          systemId: null,
          targetUrl: "https://example.com",
          status: "completed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorType: null,
        },
      ]),
    });
  });

  let lastRequestUrl = "";

  await page.route(`**/api/Audits/${auditId}/findings**`, async (route) => {
    const url = route.request().url();
    lastRequestUrl = url;

    const u = new URL(url);
    const statusParams = u.searchParams.getAll("status");
    const urlFilter = u.searchParams.get("url") ?? "";

    const isFilteredCall =
      statusParams.includes("SKIPPED") && urlFilter.includes("/admin");

    const payload = isFilteredCall
      ? {
          items: [
            {
              id: "f1",
              ruleId: "R-SKIP",
              severity: "info",
              category: "network",
              title: "Skipped network",
              detail: "Skipped by policy",
              status: "SKIPPED",
              skipReason: "NETWORK_POLICY",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 200,
          groups: [],
        }
      : {
          items: [],
          totalCount: 0,
          page: 1,
          pageSize: 200,
          groups: [],
        };

  await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto(`${baseUrl}/findings`, { waitUntil: "domcontentloaded" });

  // Select status SKIPPED
  await page.getByText("Status").scrollIntoViewIfNeeded();
  await page.getByLabel("SKIPPED").check();

  // Enter URL contains filter
  await page.getByPlaceholder("Örn. /login").fill("/admin");

  // Wait for mocked response and UI update
  await page.waitForTimeout(500);

  expect(lastRequestUrl).toContain("status=SKIPPED");
  expect(lastRequestUrl).toContain("url=%2Fadmin");

  await expect(page.getByText("Skipped network")).toBeVisible();
});

