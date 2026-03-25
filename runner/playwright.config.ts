import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  testDir: 'src/tests',
  // a11y-axe.spec.ts is now included in CI via the dedicated a11y-tests job.
  testIgnore: process.env.SKIP_A11Y === '1' ? ['**/a11y-axe.spec.ts'] : [],
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
};

export default config;

