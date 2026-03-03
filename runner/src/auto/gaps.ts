import type { UiElement, UiGap, RecommendedSelectorLegacy, ReasonCode } from "../domain/uiInventory";
import { getReasonMeta } from "./reasonCodes";

function toLegacySelectors(el: UiElement): RecommendedSelectorLegacy[] {
  if (el.recommendedSelectorsLegacy?.length) return el.recommendedSelectorsLegacy;
  return el.recommendedSelectors.map((s) => {
    if (s.strategy === "css") return { strategy: "css", selector: s.css, preferred: s.preferred };
    if (s.strategy === "role") return { strategy: "role", selector: `getByRole('${s.role}', { name: '${(s.name || "").replace(/'/g, "\\'")}' })`, preferred: s.preferred };
    if (s.strategy === "text") return { strategy: "text", selector: `getByText('${s.text.replace(/'/g, "\\'")}')`, preferred: s.preferred };
    if (s.strategy === "label") return { strategy: "label", selector: s.label, preferred: s.preferred };
    if (s.strategy === "data-testid") return { strategy: "data-testid", selector: `[data-testid="${s.value}"]`, preferred: s.preferred };
    if (s.strategy === "data-test") return { strategy: "data-test", selector: `[data-test="${s.value}"]`, preferred: s.preferred };
    if (s.strategy === "data-qa") return { strategy: "data-qa", selector: `[data-qa="${s.value}"]`, preferred: s.preferred };
    return { strategy: "css", selector: "unknown", preferred: false };
  });
}

function locatorLineFromSelector(sel: RecommendedSelectorLegacy): string {
  if (sel.selector.startsWith("getByRole")) return `page.getByRole(...); // ${sel.selector}`;
  if (sel.selector.startsWith("getByText")) return `page.getByText(...); // ${sel.selector}`;
  if (sel.selector.startsWith("[")) return `page.locator('${sel.selector}')`;
  return `page.locator('${sel.selector}')`;
}

export function buildGaps(inventory: UiElement[]): UiGap[] {
  const gaps: UiGap[] = [];
  for (const el of inventory) {
    if (el.status === "TESTED_SUCCESS" && el.tested) continue;

    const reasonCode: ReasonCode = el.reasonCode ?? "UNKNOWN";
    const meta = getReasonMeta(reasonCode);
    const actionHint = el.actionHint ?? meta.actionHint;
    const why = meta.actionHint;
    const legacySelectors = toLegacySelectors(el);
    const preferred = legacySelectors.find((s) => s.preferred) ?? legacySelectors[0];
    const locatorLine = preferred ? locatorLineFromSelector(preferred) : `page.locator('${el.tagName}')`;
    const recommendedScript = `import { test, expect } from '@playwright/test';

test('GAP: ${(el.humanName ?? el.elementId).replace(/'/g, "\\'")}', async ({ page }) => {
  await page.goto('${el.pageUrl}', { waitUntil: 'domcontentloaded' });
  const locator = ${locatorLine};
  await expect(locator).toBeVisible();
});`;

    const lastAttempt = el.attempts?.length ? el.attempts[el.attempts.length - 1] : undefined;
    const suggestDataTestId = !el.recommendedSelectors.some((s) => s.strategy === "data-testid" || s.strategy === "data-test" || s.strategy === "data-qa") &&
      (reasonCode === "SELECTOR_AMBIGUOUS" || reasonCode === "SELECTOR_UNSTABLE" || el.status === "ATTEMPTED_FAILED");

    gaps.push({
      elementId: el.elementId,
      type: el.type,
      humanName: el.humanName ?? el.elementId,
      pageUrl: el.pageUrl,
      status: el.status,
      reasonCode,
      actionHint,
      confidence: el.confidence,
      fixSuggestion: el.fixSuggestion ?? meta.fixSuggestion,
      evidence: el.evidence,
      why,
      recommendedSelectors: legacySelectors,
      recommendedScript,
      riskLevel: el.riskLevel ?? "safe",
      lastAttemptError: lastAttempt?.status === "failed" ? lastAttempt.error : undefined,
      suggestDataTestId,
      notes: el.meta ? JSON.stringify(el.meta) : undefined,
    });
  }
  return gaps;
}
