import type { Page } from "playwright";

/**
 * Starts collecting all response URLs for the page lifecycle.
 * Returns the same array reference; caller reads it after the run to compute third-party origins.
 */
export function collectResponseUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("response", (res) => urls.push(res.url()));
  return urls;
}
