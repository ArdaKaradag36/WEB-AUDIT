/**
 * Meaningful interaction detection: hash change, modal opened, scroll (anchor in viewport).
 * Used after click to decide TESTED_SUCCESS vs ATTEMPTED_NO_EFFECT.
 */

import type { Page } from "playwright";

export type MeaningfulResult = {
  meaningful: boolean;
  reason?: "url_change" | "hash_change" | "dom_change" | "modal_opened" | "anchor_in_viewport";
};

export async function detectMeaningfulInteraction(
  page: Page,
  urlBefore: string,
  domBefore: number,
  options: { hashBefore?: string }
): Promise<MeaningfulResult> {
  const urlAfter = page.url();
  const hashBefore = options.hashBefore ?? (urlBefore.includes("#") ? urlBefore.split("#")[1] : "");
  const hashAfter = urlAfter.includes("#") ? urlAfter.split("#")[1] : "";

  if (urlAfter !== urlBefore) {
    return { meaningful: true, reason: "url_change" };
  }
  if (hashAfter !== hashBefore && hashAfter !== undefined) {
    return { meaningful: true, reason: "hash_change" };
  }

  const domAfter = await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0);
  if (Math.abs(domAfter - domBefore) > 10) {
    return { meaningful: true, reason: "dom_change" };
  }

  const modalVisible = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!dialog) return false;
    const style = window.getComputedStyle(dialog);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = (dialog as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).catch(() => false);
  if (modalVisible) {
    return { meaningful: true, reason: "modal_opened" };
  }

  const anchorInViewport = await page.evaluate(() => {
    const hash = window.location.hash?.slice(1);
    if (!hash) return false;
    const target = document.getElementById(hash) || document.querySelector(`[name="${hash}"]`);
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    const vh = window.innerHeight;
    return rect.top >= 0 && rect.top <= vh * 0.9;
  }).catch(() => false);
  if (anchorInViewport) {
    return { meaningful: true, reason: "anchor_in_viewport" };
  }

  return { meaningful: false };
}
