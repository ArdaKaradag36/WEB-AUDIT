/**
 * Single source of truth for why an element was not tested or attempt failed.
 * Every untested element MUST have a reasonCode. attempt_failed is decomposed into deterministic codes.
 */

import type { ReasonCode } from "../domain/uiInventory";

export const REASON_CODES: ReasonCode[] = [
  "NOT_VISIBLE",
  "OUT_OF_VIEWPORT_SCROLL_REQUIRED",
  "DISABLED",
  "ALLOWLIST_REQUIRED",
  "SELECTOR_UNSTABLE",
  "SELECTOR_AMBIGUOUS",
  "INTERACTION_INTERCEPTED",
  "TIMEOUT",
  "DETACHED_FROM_DOM",
  "NO_MEANINGFUL_CHANGE",
  "REQUIRES_AUTH",
  "DESTRUCTIVE_RISK",
  "CAPTCHA_DETECTED",
  "FILE_UPLOAD_REQUIRED",
  "MAX_ATTEMPTS_REACHED",
  "ZERO_RECT_MATCH",
  "UNKNOWN",
];

export type ReasonMeta = {
  actionHint: string;
  /** 0..1; how confident we are in this classification. */
  confidence: number;
  fixSuggestion?: string;
};

const REASON_META: Record<ReasonCode, ReasonMeta> = {
  NOT_VISIBLE: {
    actionHint: "Scroll element into view or wait for visibility before interacting.",
    confidence: 0.95,
    fixSuggestion: "Ensure element is visible when audit runs, or add scroll-into-view in test.",
  },
  OUT_OF_VIEWPORT_SCROLL_REQUIRED: {
    actionHint: "Scroll to bring element into viewport, then retry.",
    confidence: 0.9,
    fixSuggestion: "Use scrollIntoView or scroll the container before click/fill.",
  },
  DISABLED: {
    actionHint: "Element is disabled; no interaction attempted.",
    confidence: 1,
    fixSuggestion: "Enable the control in test setup if it should be interactive.",
  },
  ALLOWLIST_REQUIRED: {
    actionHint: "Add selector or label to click allowlist if this action is intended in safe mode.",
    confidence: 0.9,
    fixSuggestion: "Use --click-allowlist or AUDIT_CLICK_ALLOWLIST for this control.",
  },
  SELECTOR_UNSTABLE: {
    actionHint: "Use a stable selector (data-testid, role+name, or unique id).",
    confidence: 0.85,
    fixSuggestion: "Add data-testid or aria-label to the element.",
  },
  SELECTOR_AMBIGUOUS: {
    actionHint: "Selector matched multiple elements; narrow with role+name or data-testid.",
    confidence: 0.95,
    fixSuggestion: "Use getByRole(role, { name }) or a unique data-testid.",
  },
  INTERACTION_INTERCEPTED: {
    actionHint: "Another element received the click (overlay, loading). Retry with wait or scroll.",
    confidence: 0.8,
    fixSuggestion: "Wait for overlays to disappear or use force: true only if safe.",
  },
  TIMEOUT: {
    actionHint: "Interaction timed out; increase timeout or check if element is ready.",
    confidence: 0.9,
    fixSuggestion: "Increase actionTimeout or add explicit wait for element state.",
  },
  DETACHED_FROM_DOM: {
    actionHint: "Element was removed from DOM before or during interaction.",
    confidence: 0.9,
    fixSuggestion: "Re-query the element after navigation or wait for DOM stability.",
  },
  NO_MEANINGFUL_CHANGE: {
    actionHint: "Click/fill executed but no URL/DOM/modal/hash change detected; may be no-op or client-only.",
    confidence: 0.75,
    fixSuggestion: "If action is correct, add custom assertion; or mark as allowlist for retry.",
  },
  REQUIRES_AUTH: {
    actionHint: "Page requires login; use auth plugin or provide credentials.",
    confidence: 0.95,
    fixSuggestion: "Run with auth plugin or allowlist after manual login.",
  },
  DESTRUCTIVE_RISK: {
    actionHint: "Action may submit form, delete, or navigate away; allowlist only if intended.",
    confidence: 0.9,
    fixSuggestion: "Add to allowlist only when this action is part of the test plan.",
  },
  CAPTCHA_DETECTED: {
    actionHint: "Page has captcha; automation cannot proceed without human/approved bypass.",
    confidence: 1,
    fixSuggestion: "Bypass captcha in test environment or use manual review.",
  },
  FILE_UPLOAD_REQUIRED: {
    actionHint: "Element requires file upload; enable in config to test.",
    confidence: 0.95,
    fixSuggestion: "Use Playwright file chooser or allowlist this input.",
  },
  MAX_ATTEMPTS_REACHED: {
    actionHint: "Attempt budget reached. Increase maxUiAttempts/maxAttemptsTotal or enable crawl/raise scrollSteps.",
    confidence: 0.7,
    fixSuggestion: "Raise --max-ui-attempts or AUDIT_MAX_UI_ATTEMPTS; or increase scrollSteps.",
  },
  ZERO_RECT_MATCH: {
    actionHint: "Matched a zero-size node (sr-only/child). Prefer role-based locator or climb to clickable ancestor.",
    confidence: 0.85,
    fixSuggestion: "Use getByRole with name, or select clickable ancestor <a>/<button> instead of text child.",
  },
  UNKNOWN: {
    actionHint: "Unknown failure; check attempt evidence (exception, screenshot).",
    confidence: 0.5,
    fixSuggestion: "Inspect exception message and trace; add data-testid for stability.",
  },
};

export function getReasonMeta(code: ReasonCode): ReasonMeta {
  return REASON_META[code] ?? REASON_META.UNKNOWN;
}

/** Map Playwright exception message to deterministic reason code. */
export function exceptionToReasonCode(errorMessage: string): ReasonCode {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("timeout") || msg.includes("exceeded")) return "TIMEOUT";
  if (msg.includes("detached") || msg.includes("not attached")) return "DETACHED_FROM_DOM";
  if (msg.includes("intercept") || msg.includes("obscured") || msg.includes("covered")) return "INTERACTION_INTERCEPTED";
  return "UNKNOWN";
}

export function isSkippedReason(code: ReasonCode): boolean {
  return [
    "NOT_VISIBLE",
    "OUT_OF_VIEWPORT_SCROLL_REQUIRED",
    "DISABLED",
    "ALLOWLIST_REQUIRED",
    "SELECTOR_UNSTABLE",
    "SELECTOR_AMBIGUOUS",
    "REQUIRES_AUTH",
    "DESTRUCTIVE_RISK",
    "CAPTCHA_DETECTED",
    "FILE_UPLOAD_REQUIRED",
    "MAX_ATTEMPTS_REACHED",
    "ZERO_RECT_MATCH",
  ].includes(code);
}
