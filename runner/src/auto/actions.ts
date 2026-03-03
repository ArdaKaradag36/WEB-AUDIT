import type { Page, Locator } from "playwright";
import type { UiElement, AttemptResult, RecommendedSelector, ElementEvidence } from "../domain/uiInventory";
import type { ReasonCode } from "../domain/uiInventory";
import { exceptionToReasonCode } from "./reasonCodes";
import { detectMeaningfulInteraction } from "./heuristics";
import {
  classifyVisibility,
  scrollIntoViewIfNeeded,
  getViewportSize,
  type VisibilityResult,
} from "./visibility";
import { detectCommonOverlays, dismissOverlaysSafely } from "./overlays";
import { sanitizeLabelForKey } from "./domScan";

/** Info from a clickable ancestor resolved via DOM closest(); used to build a stable locator. */
export type ClickableAncestorInfo = {
  tag: string;
  role?: string;
  href?: string;
  id?: string;
  ariaLabel?: string;
  innerText?: string;
  dataTestId?: string;
  dataTest?: string;
  dataQa?: string;
  ariaControls?: string;
  rect: { width: number; height: number; x: number; y: number };
};

const SMOKE_FILL_VALUE = "Audit smoke";

const GENERIC_TAG_ONLY = /^(a|button|div|span|input)$/i;

/** True if selector is too generic (tag only, no qualifiers). */
export function isGenericCssSelector(css: string): boolean {
  const trimmed = css.trim();
  if (GENERIC_TAG_ONLY.test(trimmed)) return true;
  const tagOnly = /^[a-z][a-z0-9]*$/i.test(trimmed);
  return tagOnly && /^(a|button|div|span|input)$/i.test(trimmed);
}

export type LocatorResult = {
  locator: Locator;
  strategyUsed: string;
  matchedCount: number;
  visibleCount?: number;
  reasonCode?: ReasonCode;
  evidence?: ElementEvidence;
};

/** Classification for one match. */
type MatchClassification = "VISIBLE_IN_VIEWPORT" | "OUT_OF_VIEWPORT_SCROLL_REQUIRED" | "NOT_VISIBLE" | "ZERO_RECT";

/** Classify first N matches; priority VISIBLE > OUT_OF_VIEWPORT > NOT_VISIBLE / ZERO_RECT. */
async function classifyMatches(
  page: Page,
  baseLocator: Locator,
  maxCheck: number
): Promise<{ classification: MatchClassification; index: number }[]> {
  const count = await baseLocator.count();
  const results: { classification: MatchClassification; index: number }[] = [];
  for (let i = 0; i < Math.min(maxCheck, count); i++) {
    const sub = baseLocator.nth(i);
    const vis = await classifyVisibility(sub, page);
    results.push({ classification: vis.classification as MatchClassification, index: i });
  }
  return results;
}

/** Pick best match: first VISIBLE; else first OUT_OF_VIEWPORT; else ZERO_RECT_MATCH or NOT_VISIBLE. */
function pickByVisibilityPriority(
  classified: { classification: MatchClassification; index: number }[]
): { index: number; reasonCode?: ReasonCode } {
  const visible = classified.filter((r) => r.classification === "VISIBLE_IN_VIEWPORT");
  const outOfVp = classified.filter((r) => r.classification === "OUT_OF_VIEWPORT_SCROLL_REQUIRED");
  const zeroRect = classified.filter((r) => r.classification === "ZERO_RECT");
  if (visible.length > 1) return { index: -1, reasonCode: "SELECTOR_AMBIGUOUS" };
  if (visible.length === 1) return { index: visible[0].index };
  if (outOfVp.length >= 1) return { index: outOfVp[0].index };
  if (zeroRect.length >= 1) return { index: -1, reasonCode: "ZERO_RECT_MATCH" };
  return { index: -1, reasonCode: "NOT_VISIBLE" };
}

function evidenceFromVisibility(v: VisibilityResult): ElementEvidence {
  const e = v.evidence;
  return {
    box: e.box,
    viewport: e.viewport,
    displayNone: e.displayNone,
    visibilityHidden: e.visibilityHidden,
    opacityZero: e.opacityZero,
    outOfViewport: e.outOfViewport,
    zeroRect: e.zeroRect,
    ...(e.style && { style: e.style }),
  };
}

const CLICKABLE_SELECTOR = "a[href], button, input[type=button], input[type=submit], [role=button], [role=link]";

/**
 * Resolve clickable ancestor via DOM closest() from the matched node (e.g. zero-rect text child).
 * Returns serializable info and non-zero rect, or null if none found.
 */
export async function resolveClickableAncestorViaClosest(locator: Locator): Promise<ClickableAncestorInfo | null> {
  const handle = await locator.first().elementHandle().catch(() => null);
  if (!handle) return null;
  try {
    const ancestorHandle = await handle.evaluateHandle(
      (el: Element) => (el as HTMLElement).closest(CLICKABLE_SELECTOR)
    );
    const isNull = await ancestorHandle.evaluate((el: Element | null) => el === null);
    if (isNull) {
      await ancestorHandle.dispose();
      return null;
    }
    const info = await ancestorHandle.evaluate((el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const tag = el.tagName.toLowerCase();
      const role = (el.getAttribute("role") ?? "").toLowerCase() || undefined;
      const href = tag === "a" ? (el as HTMLAnchorElement).href ?? "" : "";
      const id = (el as HTMLElement).id ?? "";
      const ariaLabel = el.getAttribute("aria-label") ?? "";
      const innerText = ((el as HTMLElement).innerText ?? "").trim().slice(0, 100);
      const dataTestId = el.getAttribute("data-testid") ?? "";
      const dataTest = el.getAttribute("data-test") ?? "";
      const dataQa = el.getAttribute("data-qa") ?? "";
      const ariaControls = el.getAttribute("aria-controls") ?? "";
      return {
        tag,
        role,
        href: href || undefined,
        id: id || undefined,
        ariaLabel: ariaLabel || undefined,
        innerText: innerText || undefined,
        dataTestId: dataTestId || undefined,
        dataTest: dataTest || undefined,
        dataQa: dataQa || undefined,
        ariaControls: ariaControls || undefined,
        rect: { width: r.width, height: r.height, x: r.x, y: r.y },
      };
    });
    await ancestorHandle.dispose();
    return info;
  } finally {
    await handle.dispose();
  }
}

/** Build a stable locator for the clickable ancestor; prefer data-* > href > id > role+name. */
function locatorFromClickableAncestor(
  page: Page,
  info: ClickableAncestorInfo
): { locator: Locator; selectorUsed: string } | null {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  if (info.dataTestId)
    return { locator: page.locator(`[data-testid="${esc(info.dataTestId)}"]`), selectorUsed: `data-testid:${info.dataTestId}` };
  if (info.dataTest)
    return { locator: page.locator(`[data-test="${esc(info.dataTest)}"]`), selectorUsed: `data-test:${info.dataTest}` };
  if (info.dataQa)
    return { locator: page.locator(`[data-qa="${esc(info.dataQa)}"]`), selectorUsed: `data-qa:${info.dataQa}` };
  if (info.tag === "a" && info.href) {
    const hrefSel = `a[href="${esc(info.href)}"]`;
    if (info.ariaControls)
      return { locator: page.locator(`a[href="${esc(info.href)}"][aria-controls="${esc(info.ariaControls)}"]`), selectorUsed: `${hrefSel}+aria-controls` };
    return { locator: page.locator(hrefSel), selectorUsed: `href:${info.href.slice(0, 50)}` };
  }
  if (info.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(info.id))
    return { locator: page.locator(`#${info.id}`), selectorUsed: `id:${info.id}` };
  const role = info.role === "link" || info.tag === "a" ? "link" : info.role === "button" || info.tag === "button" ? "button" : null;
  const name = sanitizeLabelForKey(info.ariaLabel || info.innerText || "").trim().slice(0, 100);
  if (role && name)
    return { locator: page.getByRole(role, { name, exact: true }), selectorUsed: `role:${role}:${name.slice(0, 30)}` };
  if (role) return { locator: page.getByRole(role), selectorUsed: `role:${role}` };
  return null;
}

/** For links: data-* > href (a[href=]) > id (#) > role > text > generic css. For buttons: role/data-* > rest. */
function orderSelectorsForInteractive(selectors: RecommendedSelector[], element: UiElement): RecommendedSelector[] {
  if (element.type !== "link" && element.type !== "button") return selectors;
  const dataStable = selectors.filter(
    (s) => s.strategy === "data-testid" || s.strategy === "data-test" || s.strategy === "data-qa"
  );
  const hrefCss = selectors.filter((s) => s.strategy === "css" && s.css.startsWith("a[href="));
  const idCss = selectors.filter((s) => s.strategy === "css" && s.css.startsWith("#"));
  const roleSel = selectors.filter((s) => s.strategy === "role");
  const textSel = selectors.filter((s) => s.strategy === "text");
  const otherCss = selectors.filter(
    (s) =>
      s.strategy === "css" &&
      !s.css.startsWith("a[href=") &&
      !s.css.startsWith("#")
  );
  if (element.type === "link")
    return [...dataStable, ...hrefCss, ...idCss, ...roleSel, ...textSel, ...otherCss];
  return [...dataStable, ...roleSel, ...idCss, ...textSel, ...otherCss];
}

/** If elementKey contains href (e.g. #mm-2), inject a[href="..."] as first candidate when missing from selectors. */
function injectHrefFromElementKey(element: UiElement): RecommendedSelector[] {
  if (element.type !== "link" || !element.elementKey) return element.recommendedSelectors;
  const parts = element.elementKey.split("|");
  const hrefPart = (parts[3] ?? "").trim();
  if (!hrefPart || hrefPart.startsWith("javascript:")) return element.recommendedSelectors;
  const hasHrefSelector = element.recommendedSelectors.some(
    (s) => s.strategy === "css" && s.css.startsWith("a[href=")
  );
  if (hasHrefSelector) return element.recommendedSelectors;
  const escaped = hrefPart.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const synthetic: RecommendedSelector = { strategy: "css", css: `a[href="${escaped}"]`, preferred: true };
  return [synthetic, ...element.recommendedSelectors];
}

/**
 * Build Playwright locator with visible-first logic.
 * Tries each candidate with error isolation; one failing does not fail the whole build.
 * For links: prefers href/id/data-* before text. ZERO_RECT may resolve to clickable ancestor.
 */
export async function buildLocator(page: Page, element: UiElement): Promise<LocatorResult> {
  const rawSelectors = injectHrefFromElementKey(element);
  const selectors = orderSelectorsForInteractive(rawSelectors, element);
  const candidateFailures: Array<{ strategy: string; error: string }> = [];

  for (const s of selectors) {
    let strategyUsed = "";
    try {
    let baseLocator: Locator;
    if (s.strategy === "css") {
      if (isGenericCssSelector(s.css)) {
        strategyUsed = `css:${s.css}`;
        const cnt = await page.locator(s.css).count();
        return {
          locator: page.locator(s.css).first(),
          strategyUsed,
          matchedCount: cnt,
          reasonCode: "SELECTOR_UNSTABLE",
          evidence: { selectorStrategy: strategyUsed, phase: "generic_tag_only", candidateFailures: candidateFailures.length ? candidateFailures : undefined },
        };
      }
      baseLocator = page.locator(s.css);
      strategyUsed = `css:${s.css}`;
    } else if (s.strategy === "data-testid" || s.strategy === "data-test" || s.strategy === "data-qa") {
      const attr = s.strategy === "data-testid" ? "data-testid" : s.strategy === "data-test" ? "data-test" : "data-qa";
      baseLocator = page.locator(`[${attr}="${s.value}"]`);
      strategyUsed = `${attr}:${s.value}`;
    } else if (s.strategy === "role") {
      baseLocator = s.name != null
        ? page.getByRole(s.role as any, { name: s.name, exact: s.exact ?? false })
        : page.getByRole(s.role as any);
      strategyUsed = `role:${s.role}:${s.name ?? ""}`;
    } else if (s.strategy === "text") {
      baseLocator = page.getByText(s.text, { exact: s.exact ?? false });
      strategyUsed = `text:${s.text.slice(0, 30)}`;
    } else if (s.strategy === "label") {
      baseLocator = page.getByLabel(s.label);
      strategyUsed = `label:${s.label.slice(0, 30)}`;
    } else {
      continue;
    }

    const count = await baseLocator.count();
    if (count === 0) continue;

    if (count === 1) {
      const first = baseLocator.first();
      let vis = await classifyVisibility(first, page);
      if (vis.classification === "ZERO_RECT" && (s.strategy === "text" || s.strategy === "role")) {
        const ancestorInfo = await resolveClickableAncestorViaClosest(first);
        if (ancestorInfo) {
          const built = locatorFromClickableAncestor(page, ancestorInfo);
          if (built) {
            const ancLoc = built.locator.first();
            const ancVis = await classifyVisibility(ancLoc, page);
            if (ancVis.classification === "VISIBLE_IN_VIEWPORT" || ancVis.classification === "OUT_OF_VIEWPORT_SCROLL_REQUIRED") {
              const evidence: ElementEvidence = {
                selectorStrategy: built.selectorUsed,
                matchedCount: 1,
                zeroRectOriginal: true,
                resolvedToAncestor: true,
                ancestorTag: ancestorInfo.tag,
                ancestorRect: ancestorInfo.rect,
                ...(ancestorInfo.href && { ancestorHref: ancestorInfo.href }),
                ...(ancestorInfo.id && { ancestorId: ancestorInfo.id }),
                ...(ancestorInfo.dataTestId && { ancestorDataTestId: ancestorInfo.dataTestId }),
              };
              return { locator: ancLoc, strategyUsed: `${strategyUsed}(ancestor:${built.selectorUsed})`, matchedCount: 1, evidence };
            }
          }
        }
        return {
          locator: first,
          strategyUsed,
          matchedCount: 1,
          reasonCode: "ZERO_RECT_MATCH",
          evidence: { ...evidenceFromVisibility(vis), selectorStrategy: strategyUsed, matchedCount: 1, zeroRect: true },
        };
      }
      if (vis.classification === "NOT_VISIBLE") {
        return {
          locator: first,
          strategyUsed,
          matchedCount: 1,
          reasonCode: "NOT_VISIBLE",
          evidence: { ...evidenceFromVisibility(vis), selectorStrategy: strategyUsed, matchedCount: 1 },
        };
      }
      return { locator: first, strategyUsed, matchedCount: 1, evidence: { selectorStrategy: strategyUsed, matchedCount: 1 } };
    }

    const classified = await classifyMatches(page, baseLocator, 5);
    const pick = pickByVisibilityPriority(classified);
    if (pick.reasonCode === "SELECTOR_AMBIGUOUS") {
      return {
        locator: baseLocator.first(),
        strategyUsed,
        matchedCount: count,
        visibleCount: classified.filter((c) => c.classification === "VISIBLE_IN_VIEWPORT").length,
        reasonCode: "SELECTOR_AMBIGUOUS",
        evidence: { selectorStrategy: strategyUsed, matchedCount: count },
      };
    }
    if (pick.reasonCode === "ZERO_RECT_MATCH" && (strategyUsed.startsWith("text:") || strategyUsed.startsWith("role:"))) {
      const first = baseLocator.first();
      const ancestorInfo = await resolveClickableAncestorViaClosest(first);
      if (ancestorInfo) {
        const built = locatorFromClickableAncestor(page, ancestorInfo);
        if (built) {
          const ancLoc = built.locator.first();
          const ancVis = await classifyVisibility(ancLoc, page);
          if (ancVis.classification === "VISIBLE_IN_VIEWPORT" || ancVis.classification === "OUT_OF_VIEWPORT_SCROLL_REQUIRED") {
            const evidence: ElementEvidence = {
              selectorStrategy: built.selectorUsed,
              matchedCount: count,
              zeroRectOriginal: true,
              resolvedToAncestor: true,
              ancestorTag: ancestorInfo.tag,
              ancestorRect: ancestorInfo.rect,
              ...(ancestorInfo.href && { ancestorHref: ancestorInfo.href }),
              ...(ancestorInfo.id && { ancestorId: ancestorInfo.id }),
              ...(ancestorInfo.dataTestId && { ancestorDataTestId: ancestorInfo.dataTestId }),
            };
            return { locator: ancLoc, strategyUsed: `${strategyUsed}(ancestor:${built.selectorUsed})`, matchedCount: count, evidence };
          }
        }
      }
    }
    if (pick.reasonCode === "NOT_VISIBLE" || pick.reasonCode === "ZERO_RECT_MATCH") {
      const vis = await classifyVisibility(baseLocator.first(), page);
      return {
        locator: baseLocator.first(),
        strategyUsed,
        matchedCount: count,
        reasonCode: (vis.classification === "ZERO_RECT" ? "ZERO_RECT_MATCH" : "NOT_VISIBLE") as ReasonCode,
        evidence: { ...evidenceFromVisibility(vis), selectorStrategy: strategyUsed, matchedCount: count },
      };
    }
    return {
      locator: baseLocator.nth(pick.index),
      strategyUsed,
      matchedCount: count,
      evidence: { selectorStrategy: strategyUsed, matchedCount: count },
    };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      candidateFailures.push({ strategy: strategyUsed || (s.strategy === "css" ? `css:${s.css?.slice(0, 40)}` : String(s.strategy)), error: errMsg });
    }
  }

  try {
    const fallback = page.locator(element.tagName);
    const count = await fallback.count();
    if (count === 0) {
      return {
        locator: fallback.first(),
        strategyUsed: `css:${element.tagName}`,
        matchedCount: 0,
        reasonCode: "SELECTOR_UNSTABLE",
        evidence: { selectorStrategy: `css:${element.tagName}`, candidateFailures: candidateFailures.length ? candidateFailures : undefined },
      };
    }
    if (count > 1) {
      return {
        locator: fallback.first(),
        strategyUsed: `css:${element.tagName}`,
        matchedCount: count,
        reasonCode: "SELECTOR_AMBIGUOUS",
        evidence: { selectorStrategy: `css:${element.tagName}`, matchedCount: count },
      };
    }
    if (isGenericCssSelector(element.tagName)) {
      return {
        locator: fallback.first(),
        strategyUsed: `css:${element.tagName}`,
        matchedCount: 1,
        reasonCode: "SELECTOR_UNSTABLE",
        evidence: { selectorStrategy: `css:${element.tagName}`, matchedCount: 1, phase: "generic_fallback", candidateFailures: candidateFailures.length ? candidateFailures : undefined },
      };
    }
    const vis = await classifyVisibility(fallback.first(), page);
    if (vis.classification !== "VISIBLE_IN_VIEWPORT") {
      return {
        locator: fallback.first(),
        strategyUsed: `css:${element.tagName}`,
        matchedCount: count,
        reasonCode: vis.reasonCode!,
        evidence: { ...evidenceFromVisibility(vis), selectorStrategy: `css:${element.tagName}`, matchedCount: count },
      };
    }
    return { locator: fallback.first(), strategyUsed: `css:${element.tagName}`, matchedCount: count };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      locator: page.locator("body"),
      strategyUsed: "none",
      matchedCount: 0,
      reasonCode: "SELECTOR_UNSTABLE",
      evidence: {
        exceptionMessage: errMsg,
        candidateFailures: candidateFailures.length ? candidateFailures : undefined,
      },
    };
  }
}

export function getBestCssSelector(element: UiElement): string {
  for (const s of element.recommendedSelectors) {
    if (s.strategy === "css") return s.css;
    if (s.strategy === "data-testid") return `[data-testid="${s.value}"]`;
    if (s.strategy === "data-test") return `[data-test="${s.value}"]`;
    if (s.strategy === "data-qa") return `[data-qa="${s.value}"]`;
  }
  return element.tagName;
}

/**
 * Safe fill: classify visibility first; if not visible, scroll and re-check; skip with reasonCode instead of TIMEOUT.
 */
export async function safeFill(
  page: Page,
  locator: Locator,
  options: { timeout?: number; value?: string }
): Promise<AttemptResult> {
  const startedAt = new Date().toISOString();
  const value = options.value ?? SMOKE_FILL_VALUE;
  const timeout = options.timeout ?? 8_000;

  let vis = await classifyVisibility(locator, page);
  if (vis.classification === "OUT_OF_VIEWPORT_SCROLL_REQUIRED") {
    await scrollIntoViewIfNeeded(locator);
    await page.waitForTimeout(250);
    vis = await classifyVisibility(locator, page);
  }
  if (vis.classification !== "VISIBLE_IN_VIEWPORT") {
    return {
      action: "fill",
      status: "skipped",
      error: vis.reasonCode ?? "NOT_VISIBLE",
      startedAt,
      endedAt: new Date().toISOString(),
      meta: { reasonCode: vis.reasonCode, evidence: vis.evidence },
    };
  }

  try {
    const type = await locator.evaluate((el) => ((el as HTMLInputElement).type ?? "").toLowerCase()).catch(() => "");
    if (["file", "submit", "button", "image", "reset", "hidden"].includes(type)) {
      return {
        action: "fill",
        status: "skipped",
        error: `Input type="${type}" is not safe to fill`,
        startedAt,
        endedAt: new Date().toISOString(),
      };
    }
    await locator.fill(value, { timeout });
    const actual = await locator.inputValue().catch(() => "");
    const success = actual === value || (actual.length > 0 && value.startsWith(actual));
    return {
      action: "fill",
      status: success ? "success" : "failed",
      error: success ? undefined : `Expected value "${value}", got "${actual.slice(0, 50)}"`,
      startedAt,
      endedAt: new Date().toISOString(),
    };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    const reasonCode = exceptionToReasonCode(err);
    return {
      action: "fill",
      status: "failed",
      error: err,
      startedAt,
      endedAt: new Date().toISOString(),
      meta: { reasonCode },
    };
  }
}

export type WaitStrategy = "domcontentloaded" | "networkidle";

/**
 * Safe click: classify visibility first; scroll if needed; trial click for intercept; on timeout re-check visibility.
 */
export async function safeClick(
  page: Page,
  locator: Locator,
  pageUrl: string,
  options: {
    timeout?: number;
    evidenceRefs?: string[];
    waitStrategy?: WaitStrategy;
    networkIdleTimeout?: number;
  }
): Promise<AttemptResult> {
  const startedAt = new Date().toISOString();
  const timeout = options.timeout ?? 8_000;
  const waitStrategy = options.waitStrategy ?? "domcontentloaded";
  const networkIdleTimeout = options.networkIdleTimeout ?? 2_000;

  let vis = await classifyVisibility(locator, page);
  if (vis.classification === "OUT_OF_VIEWPORT_SCROLL_REQUIRED") {
    await scrollIntoViewIfNeeded(locator);
    await page.waitForTimeout(250);
    vis = await classifyVisibility(locator, page);
  }
  if (vis.classification !== "VISIBLE_IN_VIEWPORT") {
    return {
      action: "click",
      status: "skipped",
      error: vis.reasonCode ?? "NOT_VISIBLE",
      startedAt,
      endedAt: new Date().toISOString(),
      meta: { reasonCode: vis.reasonCode, evidence: vis.evidence },
    };
  }

  const href = await locator.evaluate((el) => (el as HTMLAnchorElement).href?.toLowerCase?.() ?? "").catch(() => "");
  if (href && (href.includes("logout") || href.includes("log-out") || href.includes("signout") || href.includes("delete"))) {
    return {
      action: "click",
      status: "skipped",
      error: "Link appears destructive; skipped in safe mode",
      startedAt,
      endedAt: new Date().toISOString(),
    };
  }

  const isIntercepted = (msg: string) => {
    const m = msg.toLowerCase();
    return m.includes("intercept") || m.includes("obscured") || m.includes("covered");
  };
  let trialIntercepted = false;
  try {
    await locator.click({ trial: true, timeout: 2000 });
  } catch (trialErr: unknown) {
    const msg = trialErr instanceof Error ? trialErr.message : String(trialErr);
    if (isIntercepted(msg)) {
      trialIntercepted = true;
      await dismissOverlaysSafely(page);
      try {
        await locator.click({ trial: true, timeout: 2000 });
      } catch (retryErr: unknown) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (isIntercepted(retryMsg)) {
          const { overlayCount } = await detectCommonOverlays(page);
          return {
            action: "click",
            status: "failed",
            error: retryMsg,
            startedAt,
            endedAt: new Date().toISOString(),
            meta: { reasonCode: "INTERACTION_INTERCEPTED", overlayCandidatesCount: overlayCount },
          };
        }
      }
    }
  }

  const urlBefore = page.url();
  const hashBefore = urlBefore.includes("#") ? urlBefore.split("#")[1] : "";
  const domBefore = await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0);

  try {
    await locator.click({ timeout, noWaitAfter: false });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    const lower = err.toLowerCase();
    if (lower.includes("timeout") || lower.includes("exceeded")) {
      const recheck = await classifyVisibility(locator, page);
      if (recheck.classification !== "VISIBLE_IN_VIEWPORT") {
        return {
          action: "click",
          status: "skipped",
          error: recheck.reasonCode ?? "NOT_VISIBLE",
          startedAt,
          endedAt: new Date().toISOString(),
          meta: { reasonCode: recheck.reasonCode, evidence: recheck.evidence, phase: "timeout_recheck" },
        };
      }
    }
    return {
      action: "click",
      status: "failed",
      error: err,
      startedAt,
      endedAt: new Date().toISOString(),
      evidenceRefs: options.evidenceRefs,
      meta: { reasonCode: exceptionToReasonCode(err) },
    };
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  if (waitStrategy === "networkidle") {
    await page.waitForLoadState("networkidle", { timeout: networkIdleTimeout }).catch(() => {});
  }
  await page.waitForTimeout(400);

  const urlAfter = page.url();
  if (urlAfter && (urlAfter.toLowerCase().includes("logout") || urlAfter.toLowerCase().includes("delete"))) {
    return {
      action: "click",
      status: "failed",
      error: "Navigation went to logout/delete-like URL after click",
      startedAt,
      endedAt: new Date().toISOString(),
      evidenceRefs: options.evidenceRefs,
    };
  }

  const meaningful = await detectMeaningfulInteraction(page, urlBefore, domBefore, { hashBefore });
  return {
    action: "click",
    status: "success",
    startedAt,
    endedAt: new Date().toISOString(),
    meta: {
      meaningfulInteraction: meaningful.meaningful,
      reason: meaningful.reason,
      urlChanged: urlAfter !== urlBefore,
    },
  };
}

export function attemptErrorToReasonCode(errorMessage: string): ReasonCode {
  return exceptionToReasonCode(errorMessage);
}
