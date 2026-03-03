/**
 * UI element inventory and coverage gaps.
 * Every untested element MUST have status + reasonCode + actionHint + evidence.
 */

export type ReasonCode =
  | "NOT_VISIBLE"
  | "OUT_OF_VIEWPORT_SCROLL_REQUIRED"
  | "DISABLED"
  | "ALLOWLIST_REQUIRED"
  | "SELECTOR_UNSTABLE"
  | "SELECTOR_AMBIGUOUS"
  | "INTERACTION_INTERCEPTED"
  | "TIMEOUT"
  | "DETACHED_FROM_DOM"
  | "NO_MEANINGFUL_CHANGE"
  | "REQUIRES_AUTH"
  | "DESTRUCTIVE_RISK"
  | "CAPTCHA_DETECTED"
  | "FILE_UPLOAD_REQUIRED"
  | "MAX_ATTEMPTS_REACHED"
  | "ZERO_RECT_MATCH"
  | "UNKNOWN";

export type ElementType =
  | "button"
  | "link"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "tab"
  | "menuitem"
  | "dialog_trigger"
  | "accordion"
  | "carousel_control"
  | "other";

/** Outcome status for coverage. */
export type ElementStatus =
  | "TESTED_SUCCESS"
  | "SKIPPED"
  | "ATTEMPTED_FAILED"
  | "ATTEMPTED_NO_EFFECT";

/** Structured selector: one of css | role | text | label. Used by locator builder. */
export type RecommendedSelector =
  | { strategy: "css"; css: string; preferred?: boolean }
  | { strategy: "role"; role: string; name?: string; exact?: boolean; preferred?: boolean }
  | { strategy: "text"; text: string; exact?: boolean; preferred?: boolean }
  | { strategy: "label"; label: string; preferred?: boolean }
  | { strategy: "data-testid"; value: string; preferred?: boolean }
  | { strategy: "data-test"; value: string; preferred?: boolean }
  | { strategy: "data-qa"; value: string; preferred?: boolean };

/** Legacy flat shape for backward compat; prefer RecommendedSelector. */
export type RecommendedSelectorLegacy = { strategy: string; selector: string; preferred?: boolean };

/** Evidence for why element got this status/reasonCode. */
export type ElementEvidence = {
  selectorStrategy?: string;
  matchedCount?: number;
  visibleCount?: number;
  exceptionName?: string;
  exceptionMessage?: string;
  screenshotPath?: string;
  urlBefore?: string;
  urlAfter?: string;
  hashChanged?: boolean;
  modalOpened?: boolean;
  /** Visibility classification evidence (NOT_VISIBLE / OUT_OF_VIEWPORT). */
  box?: { x: number; y: number; width: number; height: number } | null;
  viewport?: { width: number; height: number };
  displayNone?: boolean;
  visibilityHidden?: boolean;
  opacityZero?: boolean;
  outOfViewport?: boolean;
  /** True when locator matched a zero-size node (sr-only/child); use ZERO_RECT_MATCH. */
  zeroRect?: boolean;
  /** True when zero-rect match was resolved to a clickable ancestor. */
  zeroRectOriginal?: boolean;
  resolvedToAncestor?: boolean;
  ancestorTag?: string;
  ancestorRect?: { width: number; height: number; x: number; y: number };
  ancestorHref?: string;
  ancestorId?: string;
  ancestorDataTestId?: string;
  /** e.g. "final-pass" when reasonCode set in guardrail. */
  phase?: string;
  /** When INTERACTION_INTERCEPTED, number of overlay candidates detected. */
  overlayCandidatesCount?: number;
  /** Visibility style (display, visibility, opacity, pointerEvents, ariaHidden). */
  style?: { display?: string; visibility?: string; opacity?: string; pointerEvents?: string; ariaHidden?: boolean };
  /** When buildLocator tries multiple candidates, failures per strategy (resilient build). */
  candidateFailures?: Array<{ strategy: string; error: string }>;
  [key: string]: unknown;
};

export type RiskLevel = "safe" | "needs_allowlist" | "destructive" | "requires_auth";

export type AttemptStatus = "success" | "failed" | "skipped";

export type AttemptResult = {
  action: "fill" | "click";
  status: AttemptStatus;
  error?: string;
  startedAt: string;
  endedAt: string;
  evidenceRefs?: string[];
  meta?: Record<string, unknown>;
};

export type UiElement = {
  elementId: string;
  /** Stable key for dedupe (tag+role+normalizedText+href/src+aria-label+name+type). No box; stable across scroll. */
  elementKey?: string;
  type: ElementType;
  tagName: string;
  humanName?: string;
  pageUrl: string;
  visible: boolean;
  /** True when visible and within initial viewport (scan-time). Used for merge priority. */
  inViewport?: boolean;
  enabled: boolean;
  /** Structured selectors for locator builder. */
  recommendedSelectors: RecommendedSelector[];
  /** Legacy flat selectors (for reporting/gaps); may be derived from recommendedSelectors. */
  recommendedSelectorsLegacy?: RecommendedSelectorLegacy[];
  /** True only if at least one attempt succeeded (TESTED_SUCCESS). */
  tested: boolean;
  /** Outcome status. Required when tested=false. */
  status: ElementStatus;
  /** Required when status !== TESTED_SUCCESS. No element left without reasonCode. */
  reasonCode?: ReasonCode;
  /** Human-readable next step. From reason taxonomy. */
  actionHint?: string;
  /** 0..1 confidence in classification. */
  confidence?: number;
  /** Optional fix suggestion. */
  fixSuggestion?: string;
  /** Evidence (selector used, matchedCount, exception, etc.). */
  evidence?: ElementEvidence;
  /** @deprecated Use reasonCode + status. Kept for backward compat. */
  skipReason?: string;
  riskLevel?: RiskLevel;
  attempts?: AttemptResult[];
  meta?: Record<string, unknown>;
};

export type ScrollStepMetrics = {
  newlyDiscovered: number;
};

export type UiInventory = {
  pageUrl: string;
  capturedAt: string;
  elements: UiElement[];
  /** Set by audit when per-step re-scan is used. */
  scrollMetrics?: {
    newlyDiscoveredPerScrollStep: number[];
    attemptedCountTotal: number;
    skippedHiddenCount: number;
    skippedOutOfViewportCount: number;
    /** ElementKey collisions per scroll step (same key, different href/tag/role/humanName). */
    collisionCountPerStep?: number[];
    collisionCountTotal?: number;
  };
};

/** Aggregated counts by status and reasonCode for reporting. */
export type UiCoverageAggregates = {
  byStatus: Record<ElementStatus, number>;
  byReasonCode: Record<string, number>;
  totalElements: number;
  testedElements: number;
  skippedElements: number;
  attemptedFailedElements: number;
  attemptedNoEffectElements: number;
  actionableGaps: number;
  topReasonCodes: Array<{ reasonCode: string; count: number }>;
  topActionableItems: Array<{ elementId: string; reasonCode: string; actionHint: string }>;
};

export type UiGap = {
  elementId: string;
  type: ElementType;
  humanName: string;
  pageUrl: string;
  status: ElementStatus;
  reasonCode: ReasonCode;
  actionHint: string;
  confidence?: number;
  fixSuggestion?: string;
  evidence?: ElementEvidence;
  why: string;
  recommendedSelectors: RecommendedSelectorLegacy[] | RecommendedSelector[];
  recommendedScript: string;
  riskLevel: RiskLevel;
  lastAttemptError?: string;
  suggestDataTestId?: boolean;
  notes?: string;
};
