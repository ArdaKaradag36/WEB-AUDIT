import type { Page } from "playwright";
import type { UiElement, ReasonCode, ElementStatus, UiInventory } from "../domain/uiInventory";
import { getReasonMeta } from "./reasonCodes";
import { buildLocator, safeFill, safeClick, attemptErrorToReasonCode, type WaitStrategy } from "./actions";
import { domScan, isBetterCandidate, hasStableSelector } from "./domScan";

export type AutoUiAuditConfig = {
  safeMode: boolean;
  clickAllowlist: string[];
  /** Total attempt budget across initial + all scroll steps. */
  maxAttemptsTotal: number;
  actionTimeout: number;
  waitStrategy?: WaitStrategy;
  networkIdleTimeout?: number;
  /** Number of scroll steps (0 = disabled). */
  scrollSteps: number;
  /** Ms to wait after each scroll before re-scanning. */
  scrollStabilizationMs: number;
  /** Max elements to attempt per scroll step. */
  maxAttemptsPerScrollStep: number;
  /** If true, retry NOT_VISIBLE after scroll (default false). */
  retryNotVisible?: boolean;
  /** @deprecated Use maxAttemptsTotal. */
  maxAttempts?: number;
};

const DEFAULT_CONFIG: AutoUiAuditConfig = {
  safeMode: true,
  clickAllowlist: [],
  maxAttemptsTotal: 150,
  actionTimeout: 8_000,
  waitStrategy: "domcontentloaded",
  networkIdleTimeout: 2_000,
  scrollSteps: 6,
  scrollStabilizationMs: 400,
  maxAttemptsPerScrollStep: 30,
  retryNotVisible: false,
};

/** Returns skip reason code when element must not be attempted; caller MUST set element.status/reasonCode/actionHint/evidence. */
/** Visibility (NOT_VISIBLE / OUT_OF_VIEWPORT) is classified by buildLocator + visibility.ts, not from initial el.visible. */
function getSkipReasonCode(el: UiElement, config: AutoUiAuditConfig): ReasonCode | undefined {
  if (!el.enabled) return "DISABLED";
  if (el.riskLevel === "requires_auth") return "REQUIRES_AUTH";
  if (el.riskLevel === "destructive") return "DESTRUCTIVE_RISK";
  if (el.riskLevel === "needs_allowlist" && config.safeMode) {
    const allowlisted = config.clickAllowlist.some(
      (a) => el.recommendedSelectorsLegacy?.some((s) => s.selector.includes(a)) || el.humanName?.includes(a)
    );
    if (!allowlisted) return "ALLOWLIST_REQUIRED";
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
  return el.type === "input" || el.type === "textarea";
}

function isClickable(el: UiElement, config: AutoUiAuditConfig): boolean {
  if (el.type !== "link" && el.type !== "button" && el.tagName !== "button") return false;
  if (el.riskLevel === "safe") return true;
  if (el.riskLevel === "needs_allowlist" && config.clickAllowlist.length > 0) {
    return config.clickAllowlist.some(
      (a) => el.recommendedSelectorsLegacy?.some((s) => s.selector.includes(a)) || el.humanName?.includes(a)
    );
  }
  return false;
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
  const attemptedKeys = new Set<string>();
  const steps = Math.max(0, Math.min(config.scrollSteps, 6));
  const newlyDiscoveredPerScrollStep: number[] = Array(steps).fill(0);
  const collisionCountPerStep: number[] = Array(steps).fill(0);
  let collisionCountTotal = 0;

  for (const el of args.elements) {
    const skipCode = getSkipReasonCode(el, config);
    if (skipCode !== undefined) {
      setElementSkipped(el, skipCode);
      continue;
    }

    if (attemptsUsed >= config.maxAttemptsTotal) {
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
      } else if (result.status === "skipped" && result.meta?.reasonCode) {
        const rc = result.meta.reasonCode as ReasonCode;
        setElementSkipped(el, rc, { ...(result.meta.evidence as object), selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount });
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
        } else {
          el.status = "ATTEMPTED_NO_EFFECT";
          el.reasonCode = "NO_MEANINGFUL_CHANGE";
          const meta = getReasonMeta("NO_MEANINGFUL_CHANGE");
          el.actionHint = meta.actionHint;
          el.confidence = meta.confidence;
          el.evidence = { ...el.evidence, selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount };
          el.tested = false;
        }
      } else if (result.status === "skipped" && result.meta?.reasonCode) {
        const rc = result.meta.reasonCode as ReasonCode;
        setElementSkipped(el, rc, { ...(result.meta.evidence as object), selectorStrategy: locatorResult.strategyUsed, matchedCount: locatorResult.matchedCount });
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
      }
    } else {
      setElementSkipped(el, "ALLOWLIST_REQUIRED");
    }
  }

  // Per-scroll re-scan + merge + attempt queue (only OUT_OF_VIEWPORT or visible; NOT_VISIBLE skipped unless retryNotVisible)
  if (steps > 0 && attemptsUsed < config.maxAttemptsTotal) {
    const maxScrollY = await args.page.evaluate(() => Math.max(0, document.body.scrollHeight - window.innerHeight));
    for (let step = 0; step < steps && attemptsUsed < config.maxAttemptsTotal; step++) {
      const stepY = maxScrollY <= 0 ? 0 : (step / Math.max(1, steps - 1)) * maxScrollY;
      await args.page.evaluate((y) => window.scrollTo(0, y), stepY);
      await args.page.waitForTimeout(config.scrollStabilizationMs);

      const fresh = await domScan({ page: args.page, pageUrl: args.pageUrl, isBlocked: false });
      const { newlyAdded, collisionCount } = mergeScanIntoInventory(args.elements, fresh, step);
      newlyDiscoveredPerScrollStep[step] = newlyAdded;
      collisionCountPerStep[step] = collisionCount;
      collisionCountTotal += collisionCount;

      const notAttempted = args.elements.filter((e) => !attemptedKeys.has(e.elementKey ?? e.elementId));
      const ordered = sortAttemptQueue(notAttempted, config);
      let perStepAttempts = 0;

      for (const el of ordered) {
        if (attemptsUsed >= config.maxAttemptsTotal || perStepAttempts >= config.maxAttemptsPerScrollStep) break;
        const skipCode = getSkipReasonCode(el, config);
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

        if (isTextLikeInput(el)) {
          const result = await safeFill(args.page, lr.locator!, { timeout, value: "Audit smoke" });
          el.attempts.push(result);
          if (result.status === "success") {
            el.status = "TESTED_SUCCESS";
            el.tested = true;
            el.reasonCode = undefined;
            el.actionHint = undefined;
            el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
          } else if (result.status === "skipped" && result.meta?.reasonCode) {
            setElementSkipped(el, result.meta.reasonCode as ReasonCode, { ...(result.meta.evidence as object), selectorStrategy: lr.strategyUsed });
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
            } else {
              el.status = "ATTEMPTED_NO_EFFECT";
              el.reasonCode = "NO_MEANINGFUL_CHANGE";
              const meta = getReasonMeta("NO_MEANINGFUL_CHANGE");
              el.actionHint = meta.actionHint;
              el.confidence = meta.confidence;
              el.evidence = { ...el.evidence, selectorStrategy: lr.strategyUsed, matchedCount: lr.matchedCount };
            }
          } else if (result.status === "skipped" && result.meta?.reasonCode) {
            setElementSkipped(el, result.meta.reasonCode as ReasonCode, { ...(result.meta.evidence as object), selectorStrategy: lr.strategyUsed });
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

  const budgetExhausted = attemptsUsed >= config.maxAttemptsTotal;
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
