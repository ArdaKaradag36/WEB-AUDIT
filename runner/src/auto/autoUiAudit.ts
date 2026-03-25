import type { Page } from "playwright";
import type { UiElement, ReasonCode, ElementStatus, UiInventory } from "../domain/uiInventory";
import { getReasonMeta } from "./reasonCodes";
import {
  buildLocator,
  safeFill,
  safeClick,
  safeSelectMeaningful,
  attemptErrorToReasonCode,
  type WaitStrategy,
} from "./actions";
import { domScan, isBetterCandidate, hasStableSelector } from "./domScan";

export type AutoUiAuditConfig = {
  safeMode: boolean;
  clickAllowlist: string[];
  /** Total attempt budget across initial + all scroll steps. */
  maxAttemptsTotal: number;
  /** Hard runtime budget for auto UI phase (ms). */
  maxDurationMs: number;
  /** Stop when this many attempts produced no tested success. */
  maxConsecutiveNoSuccess: number;
  actionTimeout: number;
  waitStrategy?: WaitStrategy;
  networkIdleTimeout?: number;
  /** Number of scroll steps (0 = disabled). */
  scrollSteps: number;
  /** @deprecated scrollStabilizationMs is no longer used; scroll stabilization uses waitForFunction. */
  scrollStabilizationMs?: number;
  /** Max elements to attempt per scroll step. */
  maxAttemptsPerScrollStep: number;
  /** If true, retry NOT_VISIBLE after scroll (default false). */
  retryNotVisible?: boolean;
  /** In safe mode, allow bounded attempts for review-required elements. */
  allowlistReviewEnabled?: boolean;
  /** Max review-required attempts when element is not explicitly allowlisted. */
  allowlistReviewMaxAttempts?: number;
  /** @deprecated Use maxAttemptsTotal. */
  maxAttempts?: number;
};

const DEFAULT_CONFIG: AutoUiAuditConfig = {
  safeMode: true,
  clickAllowlist: [],
  maxAttemptsTotal: 220,
  maxDurationMs: 240_000,
  maxConsecutiveNoSuccess: 70,
  actionTimeout: 3_500,
  waitStrategy: "domcontentloaded",
  networkIdleTimeout: 1_000,
  scrollSteps: 10,
  scrollStabilizationMs: 520,
  maxAttemptsPerScrollStep: 45,
  retryNotVisible: false,
  allowlistReviewEnabled: true,
  allowlistReviewMaxAttempts: 12,
};

function includesAllowlistText(el: UiElement, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  const haystack = [
    el.humanName ?? "",
    ...((el.recommendedSelectorsLegacy ?? []).map((s) => s.selector)),
  ]
    .join(" ")
    .toLowerCase();
  return allowlist.some((a) => haystack.includes(a.toLowerCase()));
}

function isReviewFriendlyNeedsAllowlist(el: UiElement): boolean {
  if (el.riskLevel !== "needs_allowlist") return false;
  const label = (el.humanName ?? "").toLowerCase();
  const reviewKeywords = [
    "kabul",
    "accept",
    "agree",
    "continue",
    "devam",
    "next",
    "open",
    "close",
    "menu",
    "ara",
    "search",
    "tab",
    "filter",
    "filtre",
  ];
  return reviewKeywords.some((k) => label.includes(k));
}

/** Returns skip reason code when element must not be attempted; caller MUST set element.status/reasonCode/actionHint/evidence. */
/** Visibility (NOT_VISIBLE / OUT_OF_VIEWPORT) is classified by buildLocator + visibility.ts, not from initial el.visible. */
function getSkipReasonCode(
  el: UiElement,
  config: AutoUiAuditConfig,
  reviewState?: { used: number }
): ReasonCode | undefined {
  if (!el.enabled) return "DISABLED";
  if (el.riskLevel === "requires_auth") return "REQUIRES_AUTH";
  if (el.riskLevel === "destructive") return "DESTRUCTIVE_RISK";
  if (el.riskLevel === "needs_allowlist" && config.safeMode) {
    const allowlisted = includesAllowlistText(el, config.clickAllowlist);
    if (!allowlisted) {
      const canReviewAttempt =
        config.allowlistReviewEnabled === true &&
        isReviewFriendlyNeedsAllowlist(el) &&
        (reviewState?.used ?? 0) < (config.allowlistReviewMaxAttempts ?? 0);
      if (!canReviewAttempt) return "ALLOWLIST_REQUIRED";
      if (reviewState) reviewState.used++;
    }
  }
  if (el.reasonCode && el.status === "SKIPPED") return el.reasonCode;
  return undefined;
}

function setElementSkipped(el: UiElement, reasonCode: ReasonCode, evidence?: UiElement["evidence"]): void {
  el.status = "SKIPPED";
  el.reasonCode = reasonCode;
  const meta = getReasonMeta(reasonCode);
  el.actionHint = meta.actionHint;
  el.confidence = meta.confidence;
  el.fixSuggestion = meta.fixSuggestion;
  if (evidence) el.evidence = { ...el.evidence, ...evidence };
  el.tested = false;
}

function isTextLikeInput(el: UiElement): boolean {
  if (el.type === "textarea") return true;
  if (el.type !== "input") return false;
  const t = ((el.meta?.type as string) ?? "").toLowerCase();
  return t !== "checkbox" && t !== "radio" && t !== "submit" && t !== "button" && t !== "reset" && t !== "file" && t !== "hidden";
}

function isSelectable(el: UiElement): boolean {
  return el.type === "select" || el.tagName === "select";
}

function isClickable(el: UiElement, config: AutoUiAuditConfig): boolean {
  if (el.riskLevel === "destructive" || el.riskLevel === "requires_auth") return false;

  const isLinkButton =
    el.type === "link" || el.type === "button" || el.tagName === "button" || el.tagName === "summary";
  const isNavInteractive = el.type === "tab" || el.type === "menuitem";
  const isToggle = el.type === "checkbox" || el.type === "radio";

  if (!isLinkButton && !isNavInteractive && !isToggle) return false;

  if (el.riskLevel === "safe") return true;

  if (el.riskLevel === "needs_allowlist") {
    if (config.clickAllowlist.length > 0 && includesAllowlistText(el, config.clickAllowlist)) return true;
    if (config.allowlistReviewEnabled === true && isReviewFriendlyNeedsAllowlist(el)) return true;
    return false;
  }

  return true;
}

/** Priority: IN_VIEWPORT + low-risk + stable selector first, then OUT_OF_VIEWPORT + same, then by elementId. */
function sortAttemptQueue(candidates: UiElement[], config: AutoUiAuditConfig): UiElement[] {
  const score = (el: UiElement): number => {
    let s = 0;
    if ((el as { inViewport?: boolean }).inViewport === true && el.visible) s += 4;
    else if (el.visible) s += 2;
    if (el.riskLevel === "safe" || (el.riskLevel === "needs_allowlist" && config.clickAllowlist.length > 0)) s += 2;
    if (hasStableSelector(el)) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sb !== sa) return sb - sa;
    return (a.elementId ?? "").localeCompare(b.elementId ?? "");
  });
}

/** Same elementKey but different tag/type/humanName => collision (elementKey too coarse). */
function isElementKeyCollision(existing: UiElement, fresh: UiElement): boolean {
  if (existing.tagName !== fresh.tagName) return true;
  if (existing.type !== fresh.type) return true;
  const a = (existing.humanName ?? "").trim().toLowerCase();
  const b = (fresh.humanName ?? "").trim().toLowerCase();
  return a !== b;
}

function mergeScanIntoInventory(master: UiElement[], fresh: UiElement[], step: number): { newlyAdded: number; collisionCount: number } {
  let newlyAdded = 0;
  let collisionCount = 0;
  for (const freshEl of fresh) {
    const key = freshEl.elementKey ?? freshEl.elementId;
    const idx = master.findIndex((e) => (e.elementKey ?? e.elementId) === key);
    if (idx === -1) {
      master.push({ ...freshEl, elementId: `el-s${step}-${freshEl.tagName}-${master.length}` });
      newlyAdded++;
    } else {
      if (isElementKeyCollision(master[idx], freshEl)) collisionCount++;
      if (isBetterCandidate(freshEl, master[idx])) {
        const existing = master[idx];
        master[idx] = {
          ...freshEl,
          elementId: existing.elementId,
          attempts: existing.attempts,
          status: existing.status,
          reasonCode: existing.reasonCode,
          actionHint: existing.actionHint,
          confidence: existing.confidence,
          evidence: existing.evidence,
          tested: existing.tested,
        };
      }
    }
  }
  return { newlyAdded, collisionCount };
}

/**
 * Runs safe UI actions and sets status/reasonCode/actionHint/evidence on EVERY element.
 * Per-scroll re-scan merges newly visible elements; only OUT_OF_VIEWPORT (and visible) are retried; NOT_VISIBLE is skipped unless retryNotVisible.
 * ZERO elements with tested=false and missing reasonCode at exit.
 */
export async function runAutoUiAudit(args: {
  page: Page;
  elements: UiElement[];
  pageUrl: string;
  config?: Partial<AutoUiAuditConfig>;
  inventoryRef?: { current: UiInventory };
}): Promise<{ scrollMetrics?: UiInventory["scrollMetrics"] }> {
  const config: AutoUiAuditConfig = { ...DEFAULT_CONFIG, ...args.config };
  if (args.config?.maxAttempts != null) (config as any).maxAttemptsTotal = args.config.maxAttempts;
  let attemptsUsed = 0;
  let consecutiveNoSuccess = 0;
  const attemptedKeys = new Set<string>();
  const t0 = Date.now();
  const runtimeExceeded = () => Date.now() - t0 >= config.maxDurationMs;
  const steps = Math.max(0, Math.min(config.scrollSteps, 12));
  const newlyDiscoveredPerScrollStep: number[] = Array(steps).fill(0);
  const collisionCountPerStep: number[] = Array(steps).fill(0);
  let collisionCountTotal = 0;
  const allowlistReviewState = { used: 0 };

  for (const el of args.elements) {
    const skipCode = getSkipReasonCode(el, config, allowlistReviewState);
    if (skipCode !== undefined) {
      setElementSkipped(el, skipCode);
      continue;
    }

    if (attemptsUsed >= config.maxAttemptsTotal || runtimeExceeded() || consecutiveNoSuccess >= config.maxConsecutiveNoSuccess) {
      setElementSkipped(el, "MAX_ATTEMPTS_REACHED", { phase: "budget" });
      continue;
    }

    let locatorResult;
    try {
      locatorResult = await buildLocator(args.page, el);
    } catch {
      setElementSkipped(el, "SELECTOR_UNSTABLE", { exceptionMessage: "buildLocator failed" });
      continue;
    }

    const skipFromLocator =
      locatorResult.reasonCode === "SELECTOR_AMBIGUOUS" ||
      locatorResult.reasonCode === "SELECTOR_UNSTABLE" ||
      locatorResult.reasonCode === "NOT_VISIBLE" ||
      locatorResult.reasonCode === "ZERO_RECT_MATCH";
    if (skipFromLocator && locatorResult.reasonCode) {
      setElementSkipped(el, locatorResult.reasonCode, {
        ...locatorResult.evidence,
        selectorStrategy: locatorResult.strategyUsed,
        matchedCount: locatorResult.matchedCount,
        visibleCount: locatorResult.visibleCount,
      });
      continue;
    }

    const key = el.elementKey ?? el.elementId;
    attemptedKeys.add(key);
    el.attempts = el.attempts ?? [];
    const timeout = config.actionTimeout;

    if (isSelectable(el)) {
      const result = await safeSelectMeaningful(args.page, locatorResult.locator, { timeout });
      el.attempts.push(result);
      attemptsUsed++;
      if (result.status === "success") {
        el.status = "TESTED_SUCCESS";
        el.tested = true;
        el.reasonCode = undefined;
        el.actionHint = undefined;
        el.evidence = { ...el.evidence, selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount };
        consecutiveNoSuccess = 0;
      } else if (result.status === "skipped" && result.meta?.reasonCode) {
        const rc = result.meta.reasonCode as ReasonCode;
        setElementSkipped(el, rc, { ...(result.meta.evidence as object), selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount });
        consecutiveNoSuccess++;
      } else if (result.status === "failed" && result.error) {
        el.status = "ATTEMPTED_FAILED";
        el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
        const meta = getReasonMeta(el.reasonCode);
        el.actionHint = meta.actionHint;
        el.confidence = meta.confidence;
        el.evidence = {
          ...el.evidence,
          selectorStrategy: locatorResult.strategyUsed,
          matchedCount: locatorResult.matchedCount,
          exceptionMessage: result.error,
        };
        el.tested = false;
        consecutiveNoSuccess++;
      }
      continue;
    }

    if (isTextLikeInput(el)) {
      const result = await safeFill(args.page, locatorResult.locator, { timeout, value: "Audit smoke" });
      el.attempts.push(result);
      attemptsUsed++;
      if (result.status === "success") {
        el.status = "TESTED_SUCCESS";
        el.tested = true;
        el.reasonCode = undefined;
        el.actionHint = undefined;
        el.evidence = { ...el.evidence, selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount };
        consecutiveNoSuccess = 0;
      } else if (result.status === "skipped" && result.meta?.reasonCode) {
        const rc = result.meta.reasonCode as ReasonCode;
        setElementSkipped(el, rc, { ...(result.meta.evidence as object), selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount });
        consecutiveNoSuccess++;
      } else if (result.status === "failed" && result.error) {
        el.status = "ATTEMPTED_FAILED";
        el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
        const meta = getReasonMeta(el.reasonCode);
        el.actionHint = meta.actionHint;
        el.confidence = meta.confidence;
        el.evidence = {
          ...el.evidence,
          selectorStrategy: locatorResult.strategyUsed,
          matchedCount: locatorResult.matchedCount,
          exceptionMessage: result.error,
          ...(result.meta?.overlayCandidatesCount != null && { overlayCandidatesCount: result.meta.overlayCandidatesCount as number }),
        };
        el.tested = false;
        consecutiveNoSuccess++;
      }
      continue;
    }

    if (isClickable(el, config)) {
      const result = await safeClick(args.page, locatorResult.locator, args.pageUrl, {
        timeout,
        waitStrategy: config.waitStrategy,
        networkIdleTimeout: config.networkIdleTimeout,
      });
      el.attempts.push(result);
      attemptsUsed++;

      if (result.status === "success") {
        const meaningful = result.meta?.meaningfulInteraction === true || result.meta?.reason != null;
        if (meaningful) {
          el.status = "TESTED_SUCCESS";
          el.tested = true;
          el.reasonCode = undefined;
          el.actionHint = undefined;
          el.evidence = { ...el.evidence, selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount };
          consecutiveNoSuccess = 0;
        } else {
          el.status = "ATTEMPTED_NO_EFFECT";
          el.reasonCode = "NO_MEANINGFUL_CHANGE";
          const meta = getReasonMeta("NO_MEANINGFUL_CHANGE");
          el.actionHint = meta.actionHint;
          el.confidence = meta.confidence;
          el.evidence = { ...el.evidence, selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount };
          el.tested = false;
          consecutiveNoSuccess++;
        }
      } else if (result.status === "skipped" && result.meta?.reasonCode) {
        const rc = result.meta.reasonCode as ReasonCode;
        setElementSkipped(el, rc, { ...(result.meta.evidence as object), selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount });
        consecutiveNoSuccess++;
      } else if (result.status === "failed" && result.error) {
        el.status = "ATTEMPTED_FAILED";
        el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
        const meta = getReasonMeta(el.reasonCode);
        el.actionHint = meta.actionHint;
        el.confidence = meta.confidence;
        el.evidence = {
          ...el.evidence,
          selectorStrategy: locatorResult.strategyUsed,
          matchedCount: locatorResult.matchedCount,
          exceptionMessage: result.error,
          ...(result.meta?.overlayCandidatesCount != null && { overlayCandidatesCount: result.meta.overlayCandidatesCount as number }),
        };
        el.tested = false;
        consecutiveNoSuccess++;
      }
    } else {
      setElementSkipped(el, "ALLOWLIST_REQUIRED");
    }
  }

  // Per-scroll re-scan + merge + attempt queue (only OUT_OF_VIEWPORT or visible; NOT_VISIBLE skipped unless retryNotVisible)
  if (steps > 0 && attemptsUsed < config.maxAttemptsTotal && !runtimeExceeded() && consecutiveNoSuccess < config.maxConsecutiveNoSuccess) {
    const maxScrollY = await args.page.evaluate(() => Math.max(0, document.body.scrollHeight - window.innerHeight));
    for (let step = 0; step < steps && attemptsUsed < config.maxAttemptsTotal && !runtimeExceeded() && consecutiveNoSuccess < config.maxConsecutiveNoSuccess; step++) {
      const stepY = maxScrollY <= 0 ? 0 : (step / Math.max(1, steps - 1)) * maxScrollY;
      await args.page.evaluate((y) => window.scrollTo(0, y), stepY);
      await args.page.waitForFunction(
        (expectedY) => Math.abs(window.scrollY - expectedY) < 5,
        stepY,
        { timeout: 2000 }
      ).catch(() => {});

      const fresh = await domScan({ page: args.page, pageUrl: args.pageUrl });
      const { newlyAdded, collisionCount } = mergeScanIntoInventory(args.elements, fresh, step);
      newlyDiscoveredPerScrollStep[step] = newlyAdded;
      collisionCountPerStep[step] = collisionCount;
      collisionCountTotal += collisionCount;

      const notAttempted = args.elements.filter((e) => !attemptedKeys.has(e.elementKey ?? e.elementId));
      const ordered = sortAttemptQueue(notAttempted, config);
      let perStepAttempts = 0;

      for (const el of ordered) {
        if (attemptsUsed >= config.maxAttemptsTotal || perStepAttempts >= config.maxAttemptsPerScrollStep || runtimeExceeded() || consecutiveNoSuccess >= config.maxConsecutiveNoSuccess) break;
        const skipCode = getSkipReasonCode(el, config, allowlistReviewState);
        if (skipCode !== undefined) {
          setElementSkipped(el, skipCode);
          continue;
        }
        let lr;
        try {
          lr = await buildLocator(args.page, el);
        } catch {
          setElementSkipped(el, "SELECTOR_UNSTABLE", { exceptionMessage: "buildLocator failed" });
          continue;
        }
        if (lr.reasonCode === "NOT_VISIBLE" && !config.retryNotVisible) continue;
        if (lr.reasonCode === "ZERO_RECT_MATCH") {
          setElementSkipped(el, "ZERO_RECT_MATCH", { ...lr.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount });
          continue;
        }
        if (lr.reasonCode === "SELECTOR_AMBIGUOUS" || lr.reasonCode === "SELECTOR_UNSTABLE") {
          setElementSkipped(el, lr.reasonCode, { ...lr.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount });
          continue;
        }
        if (lr.reasonCode === "NOT_VISIBLE" && config.retryNotVisible) {
          setElementSkipped(el, "NOT_VISIBLE", { ...lr.evidence, selectorStrategy: lr.strategyUsed });
          continue;
        }

        const key = el.elementKey ?? el.elementId;
        attemptedKeys.add(key);
        perStepAttempts++;
        attemptsUsed++;
        el.attempts = el.attempts ?? [];
        const timeout = config.actionTimeout;

        if (isSelectable(el)) {
          const result = await safeSelectMeaningful(args.page, lr.locator!, { timeout });
          el.attempts.push(result);
          if (result.status === "success") {
            el.status = "TESTED_SUCCESS";
            el.tested = true;
            el.reasonCode = undefined;
            el.actionHint = undefined;
            el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
            consecutiveNoSuccess = 0;
          } else if (result.status === "skipped" && result.meta?.reasonCode) {
            setElementSkipped(el, result.meta.reasonCode as ReasonCode, { ...(result.meta.evidence as object), selectorStrategy: lr.strategyUsed });
            consecutiveNoSuccess++;
          } else if (result.status === "failed" && result.error) {
            el.status = "ATTEMPTED_FAILED";
            el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
            const meta = getReasonMeta(el.reasonCode!);
            el.actionHint = meta.actionHint;
            el.confidence = meta.confidence;
            el.evidence = {
              ...el.evidence,
              selectorStrategy: lr.strategyUsed,
              matchedCount: lr.matchedCount,
              exceptionMessage: result.error,
            };
            consecutiveNoSuccess++;
          }
          continue;
        }

        if (isTextLikeInput(el)) {
          const result = await safeFill(args.page, lr.locator!, { timeout, value: "Audit smoke" });
          el.attempts.push(result);
          if (result.status === "success") {
            el.status = "TESTED_SUCCESS";
            el.tested = true;
            el.reasonCode = undefined;
            el.actionHint = undefined;
            el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
            consecutiveNoSuccess = 0;
          } else if (result.status === "skipped" && result.meta?.reasonCode) {
            setElementSkipped(el, result.meta.reasonCode as ReasonCode, { ...(result.meta.evidence as object), selectorStrategy: lr.strategyUsed });
            consecutiveNoSuccess++;
          } else if (result.status === "failed" && result.error) {
            el.status = "ATTEMPTED_FAILED";
            el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
            const meta = getReasonMeta(el.reasonCode!);
            el.actionHint = meta.actionHint;
            el.confidence = meta.confidence;
            el.evidence = {
              ...el.evidence,
              selectorStrategy: lr.strategyUsed,
              matchedCount: lr.matchedCount,
              exceptionMessage: result.error,
              ...(result.meta?.overlayCandidatesCount != null && { overlayCandidatesCount: result.meta.overlayCandidatesCount as number }),
            };
            consecutiveNoSuccess++;
          }
          continue;
        }
        if (isClickable(el, config)) {
          const result = await safeClick(args.page, lr.locator!, args.pageUrl, {
            timeout,
            waitStrategy: config.waitStrategy,
            networkIdleTimeout: config.networkIdleTimeout,
          });
          el.attempts.push(result);
          if (result.status === "success") {
            const meaningful = result.meta?.meaningfulInteraction === true || result.meta?.reason != null;
            if (meaningful) {
              el.status = "TESTED_SUCCESS";
              el.tested = true;
              el.reasonCode = undefined;
              el.actionHint = undefined;
              el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
              consecutiveNoSuccess = 0;
            } else {
              el.status = "ATTEMPTED_NO_EFFECT";
              el.reasonCode = "NO_MEANINGFUL_CHANGE";
              const meta = getReasonMeta("NO_MEANINGFUL_CHANGE");
              el.actionHint = meta.actionHint;
              el.confidence = meta.confidence;
              el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
              consecutiveNoSuccess++;
            }
          } else if (result.status === "skipped" && result.meta?.reasonCode) {
            setElementSkipped(el, result.meta.reasonCode as ReasonCode, { ...(result.meta.evidence as object), selectorStrategy: lr.strategyUsed });
            consecutiveNoSuccess++;
          } else if (result.status === "failed" && result.error) {
            el.status = "ATTEMPTED_FAILED";
            el.reasonCode = (result.meta?.reasonCode as ReasonCode) ?? attemptErrorToReasonCode(result.error);
            const meta = getReasonMeta(el.reasonCode!);
            el.actionHint = meta.actionHint;
            el.confidence = meta.confidence;
            el.evidence = {
              ...el.evidence,
              selectorStrategy: lr.strategyUsed,
              matchedCount: lr.matchedCount,
              exceptionMessage: result.error,
              ...(result.meta?.overlayCandidatesCount != null && { overlayCandidatesCount: result.meta.overlayCandidatesCount as number }),
            };
            consecutiveNoSuccess++;
          }
        } else {
          setElementSkipped(el, "ALLOWLIST_REQUIRED");
        }
      }
    }
  }

  const attemptedCountTotal = args.elements.filter((e) => (e.attempts?.length ?? 0) > 0).length;
  const skippedHiddenCount = args.elements.filter((e) => e.reasonCode === "NOT_VISIBLE").length;
  const skippedOutOfViewportCount = args.elements.filter((e) => e.reasonCode === "OUT_OF_VIEWPORT_SCROLL_REQUIRED").length;

  const scrollMetrics: UiInventory["scrollMetrics"] = {
    newlyDiscoveredPerScrollStep,
    attemptedCountTotal,
    skippedHiddenCount,
    skippedOutOfViewportCount,
    collisionCountPerStep,
    collisionCountTotal,
  };
  if (args.inventoryRef?.current) args.inventoryRef.current.scrollMetrics = scrollMetrics;

  const budgetExhausted =
    attemptsUsed >= config.maxAttemptsTotal ||
    runtimeExceeded() ||
    consecutiveNoSuccess >= config.maxConsecutiveNoSuccess;
  for (const el of args.elements) {
    if (el.tested === false && el.reasonCode == null) {
      el.status = "SKIPPED";
      el.reasonCode = budgetExhausted ? "MAX_ATTEMPTS_REACHED" : "UNKNOWN";
      const meta = getReasonMeta(el.reasonCode);
      el.actionHint = meta.actionHint;
      el.confidence = meta.confidence;
      el.evidence = { ...(el.evidence ?? {}), phase: "final-pass" };
    }
  }

  return { scrollMetrics };
}
