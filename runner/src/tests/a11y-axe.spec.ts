import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startSimpleSite } from "./mocks/sites/simpleSite";

/** WCAG-oriented: full axe scan (see https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright ) */
test("a11y: axe reports no violations on simple site", async ({ page }) => {
  const { server, baseUrl } = await startSimpleSite();
  try {
    await page.goto(baseUrl);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
