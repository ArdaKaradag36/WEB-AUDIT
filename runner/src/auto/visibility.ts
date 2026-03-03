/**
 * Visibility classification: NOT_VISIBLE vs OUT_OF_VIEWPORT_SCROLL_REQUIRED vs VISIBLE.
 * Prevents false TIMEOUT when element is hidden or out of viewport.
 * Uses page.viewportSize() when available; evidence includes boundingBox, viewport, display, visibility, opacity.
 */

import type { Locator, Page } from "playwright";
import type { ReasonCode } from "../domain/uiInventory";

export type BoundingBox = { x: number; y: number; width: number; height: number } | null;

export type ViewportSize = { width: number; height: number };

export type ViewportWithScroll = ViewportSize & { scrollY: number };

export type ComputedVisibilityStyle = {
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
  ariaHidden: boolean;
};

export type VisibilityEvidence = {
  box: BoundingBox;
  viewport: ViewportSize;
  scrollY?: number;
  style?: ComputedVisibilityStyle;
  display?: string;
  visibility?: string;
  opacity?: string;
  displayNone?: boolean;
  visibilityHidden?: boolean;
  opacityZero?: boolean;
  zeroSize?: boolean;
  zeroRect?: boolean;
  outOfViewport?: boolean;
};

export type VisibilityResult =
  | { classification: "NOT_VISIBLE"; reasonCode: ReasonCode; evidence: VisibilityEvidence }
  | { classification: "ZERO_RECT"; reasonCode: "ZERO_RECT_MATCH"; evidence: VisibilityEvidence }
  | { classification: "OUT_OF_VIEWPORT_SCROLL_REQUIRED"; reasonCode: "OUT_OF_VIEWPORT_SCROLL_REQUIRED"; evidence: VisibilityEvidence }
  | { classification: "VISIBLE_IN_VIEWPORT"; reasonCode?: undefined; evidence: VisibilityEvidence };

/** Get bounding box of the first element (Playwright boundingBox; can be null when offscreen). */
export async function getElementBox(locator: Locator): Promise<BoundingBox> {
  return locator.first().boundingBox();
}

/** DOMRect from getBoundingClientRect (viewport-relative). Works for offscreen elements. */
export type ClientRect = { top: number; left: number; bottom: number; right: number; width: number; height: number } | null;

export async function getElementRect(locator: Locator): Promise<ClientRect> {
  return locator.first().evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
  }).catch(() => null);
}

/** Get viewport size: page.viewportSize() when set, else window inner size. */
export async function getViewportSize(page: Page): Promise<ViewportSize> {
  const v = page.viewportSize();
  if (v && v.width > 0 && v.height > 0) return { width: v.width, height: v.height };
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

/** Get viewport size plus current scrollY (for scroll-aware classification). */
export async function getViewport(page: Page): Promise<ViewportWithScroll> {
  const size = await getViewportSize(page);
  const scrollY = await page.evaluate(() => window.scrollY ?? 0);
  return { ...size, scrollY };
}

/** Get computed visibility-related style and aria-hidden for an element. */
export async function getComputedVisibility(locator: Locator): Promise<ComputedVisibilityStyle & {
  displayNone: boolean;
  visibilityHidden: boolean;
  opacityZero: boolean;
}> {
  return locator.first().evaluate((el) => {
    const style = window.getComputedStyle(el);
    const display = style.display;
    const visibility = style.visibility;
    const opacity = style.opacity;
    const pointerEvents = style.pointerEvents;
    const ariaHidden = (el.getAttribute("aria-hidden") ?? "").toLowerCase() === "true";
    return {
      display,
      visibility,
      opacity,
      pointerEvents,
      ariaHidden,
      displayNone: display === "none",
      visibilityHidden: visibility === "hidden",
      opacityZero: parseFloat(opacity) === 0,
    };
  }).catch(() => ({
    display: "none",
    visibility: "hidden",
    opacity: "0",
    pointerEvents: "none",
    ariaHidden: true,
    displayNone: true,
    visibilityHidden: true,
    opacityZero: true,
  }));
}

/** @deprecated Use getComputedVisibility. */
export async function isElementDisplayHidden(locator: Locator): Promise<{
  display: string;
  visibility: string;
  opacity: string;
  displayNone: boolean;
  visibilityHidden: boolean;
  opacityZero: boolean;
}> {
  const v = await getComputedVisibility(locator);
  return {
    display: v.display,
    visibility: v.visibility,
    opacity: v.opacity,
    displayNone: v.displayNone,
    visibilityHidden: v.visibilityHidden,
    opacityZero: v.opacityZero,
  };
}

const VIEWPORT_TOLERANCE = 2;

/**
 * Check if element (in page coordinates) is outside the visible viewport.
 * viewportTop = scrollY, viewportBottom = scrollY + viewportHeight.
 * pageTop = rect.top + scrollY, pageBottom = rect.bottom + scrollY (getBoundingClientRect is viewport-relative).
 */
export function isOutOfViewportWithScroll(
  rect: ClientRect,
  viewportHeight: number,
  scrollY: number
): boolean {
  if (!rect || rect.width <= 0 || rect.height <= 0) return true;
  const viewportTop = scrollY - VIEWPORT_TOLERANCE;
  const viewportBottom = scrollY + viewportHeight + VIEWPORT_TOLERANCE;
  const pageTop = rect.top + scrollY;
  const pageBottom = rect.bottom + scrollY;
  if (pageBottom < viewportTop) return true;
  if (pageTop > viewportBottom) return true;
  return false;
}

/**
 * Classify visibility using getBoundingClientRect (works for offscreen elements) and scrollY.
 * - HIDDEN: display:none, visibility:hidden, aria-hidden=true, or rect width/height == 0
 * - OUT_OF_VIEWPORT: not hidden and (pageBottom < viewportTop OR pageTop > viewportBottom)
 * - IN_VIEWPORT: otherwise
 */
export async function classifyVisibility(locator: Locator, page: Page): Promise<VisibilityResult> {
  const viewportWithScroll = await getViewport(page);
  const { width: viewportWidth, height: viewportHeight, scrollY } = viewportWithScroll;
  const viewport: ViewportSize = { width: viewportWidth, height: viewportHeight };

  const style = await getComputedVisibility(locator);
  const rect = await getElementRect(locator);

  const evidence: VisibilityEvidence = {
    box: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
    viewport,
    scrollY,
    style: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      ariaHidden: style.ariaHidden,
    },
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    displayNone: style.displayNone,
    visibilityHidden: style.visibilityHidden,
    opacityZero: style.opacityZero,
  };

  if (style.displayNone || style.visibilityHidden || style.opacityZero || style.ariaHidden) {
    return {
      classification: "NOT_VISIBLE",
      reasonCode: "NOT_VISIBLE",
      evidence: { ...evidence, zeroSize: false },
    };
  }

  if (!rect) {
    return {
      classification: "NOT_VISIBLE",
      reasonCode: "NOT_VISIBLE",
      evidence: { ...evidence, zeroSize: true },
    };
  }

  const zeroSize = rect.width <= 0 || rect.height <= 0;
  if (zeroSize) {
    return {
      classification: "ZERO_RECT",
      reasonCode: "ZERO_RECT_MATCH",
      evidence: { ...evidence, zeroSize: true, zeroRect: true },
    };
  }

  const outOfVp = isOutOfViewportWithScroll(rect, viewportHeight, scrollY);
  evidence.outOfViewport = outOfVp;
  if (outOfVp) {
    return {
      classification: "OUT_OF_VIEWPORT_SCROLL_REQUIRED",
      reasonCode: "OUT_OF_VIEWPORT_SCROLL_REQUIRED",
      evidence: { ...evidence, outOfViewport: true },
    };
  }

  return { classification: "VISIBLE_IN_VIEWPORT", evidence };
}

/** Scroll the first matched element into view; then re-check visibility. */
export async function scrollIntoViewIfNeeded(locator: Locator): Promise<void> {
  await locator.first().evaluate((el) => {
    (el as HTMLElement).scrollIntoView({ block: "center", behavior: "instant" });
  });
}

export type ClickableAncestorInfo = {
  found: boolean;
  tag?: string;
  role?: string;
  href?: string;
  id?: string;
  ariaLabel?: string;
  innerText?: string;
  dataTestId?: string;
};

/**
 * Climb parents from the first matched element to find a clickable ancestor (a/button or role=button/link or onclick)
 * with non-zero getBoundingClientRect. Returns serializable info to build a locator.
 */
export async function findClickableAncestorInfo(locator: Locator, maxDepth: number = 5): Promise<ClickableAncestorInfo | null> {
  const raw = await locator.first().evaluate((el, depth: number) => {
    let cur: Element | null = el;
    for (let i = 0; i < depth && cur; i++) {
      const tag = cur.tagName?.toLowerCase();
      const role = (cur.getAttribute("role") ?? "").toLowerCase();
      const rect = (cur as HTMLElement).getBoundingClientRect?.();
      const hasSize = rect && rect.width > 0 && rect.height > 0;
      const isClickable =
        tag === "a" || tag === "button" || role === "button" || role === "link" || (cur as HTMLElement).onclick != null;
      if (isClickable && hasSize) {
        const href = tag === "a" ? (cur as HTMLAnchorElement).href ?? "" : "";
        const id = cur.id ?? "";
        const ariaLabel = cur.getAttribute("aria-label") ?? "";
        const innerText = ((cur as HTMLElement).innerText ?? "").trim().slice(0, 100);
        const dataTestId = cur.getAttribute("data-testid") ?? "";
        return {
          found: true,
          tag,
          role: role || undefined,
          href: href || undefined,
          id: id || undefined,
          ariaLabel: ariaLabel || undefined,
          innerText: innerText || undefined,
          dataTestId: dataTestId || undefined,
        };
      }
      cur = cur.parentElement;
    }
    return { found: false };
  }, maxDepth).catch(() => ({ found: false }));
  return raw?.found ? (raw as ClickableAncestorInfo) : null;
}
