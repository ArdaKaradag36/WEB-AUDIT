/**
 * Generic overlay detection and safe dismiss (cookie banners, modals, backdrops).
 * Reduces INTERACTION_INTERCEPTED by dismissing allowlisted overlay buttons at most once per step.
 */

import type { Page, Locator } from "playwright";

const OVERLAY_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  ".modal",
  ".cookie",
  "[id*='cookie']",
  "[id*='Cookie']",
  "[class*='cookie']",
  "[class*='Cookie']",
  ".overlay",
  ".backdrop",
  "[class*='consent']",
  "[class*='Consent']",
  "[class*='banner']",
  "[class*='Banner']",
];

const DISMISS_BUTTON_TEXTS = [
  "accept",
  "kabul",
  "tamam",
  "agree",
  "i agree",
  "ok",
  "allow",
  "allow all",
  "accept all",
  "tümünü kabul et",
  "close",
  "kapat",
  "dismiss",
  "got it",
  "understand",
  "continue",
  "devam",
];

export type OverlayDetectionResult = {
  overlayCount: number;
  dismissButtons: Locator[];
};

/**
 * Detect common overlay containers and allowlisted dismiss buttons.
 * Buttons are only those with safe, non-destructive text (Accept, Kabul, Tamam, etc.).
 */
export async function detectCommonOverlays(page: Page): Promise<OverlayDetectionResult> {
  const dismissButtons: Locator[] = [];
  let overlayCount = 0;

  for (const sel of OVERLAY_SELECTORS) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    overlayCount += count;
  }

  const button = page.locator("button, a[href='#'], [role='button'], input[type='submit']");
  const n = await button.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 30); i++) {
    const b = button.nth(i);
    const text = await b.innerText().catch(() => "");
    const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (DISMISS_BUTTON_TEXTS.some((t) => norm === t || norm.startsWith(t + " ") || norm.includes(" " + t))) {
      dismissButtons.push(b);
    }
  }

  return { overlayCount, dismissButtons };
}

/** Call once per step when intercept detected. Clicks at most one allowlisted dismiss button. */
export async function dismissOverlaysSafely(page: Page): Promise<boolean> {
  const { dismissButtons } = await detectCommonOverlays(page);
  for (const btn of dismissButtons.slice(0, 3)) {
    try {
      const box = await btn.boundingBox();
      if (!box || box.width <= 0 || box.height <= 0) continue;
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(350);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
