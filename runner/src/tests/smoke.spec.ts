import { test, expect } from "@playwright/test";

test("smoke: homepage opens", async ({ page }) => {
  const url = process.env.TARGET_URL;

  test.skip(!url, "Set TARGET_URL to run smoke test against a real site.");

  await page.goto(url!, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveTitle(/.+/);
});
