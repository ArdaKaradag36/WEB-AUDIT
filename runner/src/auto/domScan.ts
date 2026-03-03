import type { Page } from "playwright";
import type { UiElement, ElementType, RecommendedSelector, ReasonCode } from "../domain/uiInventory";
import { getReasonMeta } from "./reasonCodes";
import { scoreRisk } from "./riskModel";

const DATA_ATTRS = ["data-testid", "data-test", "data-qa"] as const;

/** Boilerplate phrases to strip from humanName/elementKey (case-insensitive). */
const BOILERPLATE_PATTERN = /\b(open submenu|close submenu|toggle navigation)\b/gi;

/** Remove boilerplate and normalize whitespace for humanName and elementKey. */
export function sanitizeLabelForKey(s: string | undefined): string {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(BOILERPLATE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Escape href for use in CSS attribute selector a[href="..."] */
function escapeHrefForCss(href: string): string {
  return href.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isVoidOrEmptyHref(href: string): boolean {
  if (!href || !href.trim()) return true;
  const h = href.trim().toLowerCase();
  return h === "#" || h.startsWith("javascript:");
}

function inferElementType(tag: string, role: string, type: string, href: string): ElementType {
  if (tag === "a" && href) return "link";
  if (tag === "button" || role === "button") return "button";
  if (tag === "input") {
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    return "input";
  }
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (role === "tab") return "tab";
  if (role === "menuitem") return "menuitem";
  if (role === "dialog" || role === "alertdialog") return "dialog_trigger";
  return "other";
}

function buildStructuredSelectors(el: {
  tag: string;
  role: string;
  id: string;
  ariaLabel: string;
  ariaLabelledby: string;
  name: string;
  placeholder: string;
  type: string;
  href: string;
  text: string;
  dataAttrs: Record<string, string>;
}): RecommendedSelector[] {
  const out: RecommendedSelector[] = [];
  const hasStableDataAttr = DATA_ATTRS.some((k) => el.dataAttrs[k]);

  for (const key of DATA_ATTRS) {
    const v = el.dataAttrs[key];
    if (v) {
      const strategy = key === "data-testid" ? "data-testid" : key === "data-test" ? "data-test" : "data-qa";
      out.push({ strategy, value: v, preferred: true });
      return out;
    }
  }

  if (el.tag === "a" && el.href && !isVoidOrEmptyHref(el.href)) {
    const hrefEscaped = escapeHrefForCss(el.href);
    out.push({ strategy: "css", css: `a[href="${hrefEscaped}"]`, preferred: !hasStableDataAttr });
  }
  if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) {
    out.push({ strategy: "css", css: `#${el.id}`, preferred: out.length === 0 });
  }
  const nameForRole = ((el.ariaLabel || el.text) ?? "").trim().slice(0, 100);
  if (el.role && nameForRole) {
    out.push({ strategy: "role", role: el.role, name: nameForRole, exact: false, preferred: out.length === 0 });
  }
  if (el.tag === "input" && (el.ariaLabel || el.placeholder)) {
    out.push({ strategy: "label", label: el.ariaLabel || el.placeholder, preferred: false });
  }
  const textForSelector = (el.text ?? "").trim().slice(0, 80);
  if (textForSelector && el.tag !== "input") {
    out.push({ strategy: "text", text: textForSelector, exact: false, preferred: out.length === 0 });
  }
  const cssSelector = el.type ? `${el.tag}[type="${el.type}"]` : el.tag;
  const isGenericA = cssSelector === "a";
  out.push({ strategy: "css", css: cssSelector, preferred: !isGenericA && out.length === 0 });
  return out;
}

function toLegacy(selectors: RecommendedSelector[]): Array<{ strategy: string; selector: string; preferred?: boolean }> {
  return selectors.map((s) => {
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

export type ScanInput = {
  page: Page;
  pageUrl: string;
  isBlocked: boolean;
  /** When set, all elements get this reason (e.g. REQUIRES_AUTH, CAPTCHA_DETECTED). */
  skipReasonsForAll?: ReasonCode;
};

export async function domScan(input: ScanInput): Promise<UiElement[]> {
  let mainOrigin = "";
  try {
    mainOrigin = new URL(input.pageUrl).origin;
  } catch {}

  const elements = await input.page.evaluate((skipAllReason: string | undefined) => {
    const DATA_ATTR_KEYS = ["data-testid", "data-test", "data-qa"];
    const isVisible = (el: Element) => {
      const e = el as HTMLElement;
      const style = window.getComputedStyle(e);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = e.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const inViewport = (el: Element) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight && rect.left >= 0 && rect.left < window.innerWidth;
    };
    const getText = (el: Element) => (el as HTMLElement).innerText?.trim().slice(0, 200) ?? "";
    const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";

    const interactive = Array.from(
      document.querySelectorAll(
        "button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='menuitem']"
      )
    );

    const boilerplateRe = /\b(open submenu|close submenu|toggle navigation)\b/gi;
    const sanitize = (s: string) => (s ?? "").replace(boilerplateRe, "").replace(/\s+/g, " ").trim();
    const normalize = (s: string) => (s ?? "").trim().slice(0, 80).replace(/\s+/g, " ");
    return interactive.map((el, idx) => {
      const tag = el.tagName.toLowerCase();
      const role = attr(el, "role");
      const type = tag === "input" ? (el as HTMLInputElement).type : "";
      const href = tag === "a" ? (el as HTMLAnchorElement).href : "";
      const disabled = (el as any).disabled === true || attr(el, "aria-disabled") === "true";
      const visible = isVisible(el);
      const inVp = visible && inViewport(el);
      const text = getText(el);
      const id = attr(el, "id");
      const ariaLabel = attr(el, "aria-label") ?? "";
      const ariaLabelledby = attr(el, "aria-labelledby") ?? "";
      const name = attr(el, "name") ?? "";
      const placeholder = attr(el, "placeholder") ?? "";
      const dataAttrsObj: Record<string, string> = {};
      DATA_ATTR_KEYS.forEach((k) => {
        const v = el.getAttribute(k);
        if (v) dataAttrsObj[k] = v;
      });
      const src = attr(el, "src") || "";
      const hrefOrSrc = (href || src || "").slice(0, 80);
      const ariaControls = (attr(el, "aria-controls") ?? "").slice(0, 40);
      const ariaHaspopup = (attr(el, "aria-haspopup") ?? "").slice(0, 20);
      const dataStable = (dataAttrsObj["data-testid"] || dataAttrsObj["data-test"] || dataAttrsObj["data-qa"] || "").slice(0, 40);
      const elementKey = [tag, role, normalize(sanitize(text)).slice(0, 80), hrefOrSrc, normalize(sanitize(ariaLabel)), name || placeholder, type, (id ?? "").slice(0, 40), ariaControls, ariaHaspopup, dataStable].join("|");
      return {
        index: idx,
        tag,
        role,
        type,
        href,
        disabled,
        visible,
        inViewport: inVp,
        text,
        id,
        ariaLabel,
        ariaLabelledby,
        name,
        placeholder,
        dataAttrs: dataAttrsObj,
        elementKey,
      };
    });
  }, input.skipReasonsForAll);

  const uiElements: UiElement[] = elements.map((el: any) => {
    const elType = inferElementType(el.tag, el.role, el.type, el.href);
    const textSanitized = sanitizeLabelForKey(el.text);
    const ariaLabelSanitized = sanitizeLabelForKey(el.ariaLabel);
    const recommendedSelectors = buildStructuredSelectors({
      tag: el.tag,
      role: el.role,
      id: el.id,
      ariaLabel: ariaLabelSanitized,
      ariaLabelledby: el.ariaLabelledby,
      name: el.name,
      placeholder: el.placeholder,
      type: el.type,
      href: el.href,
      text: textSanitized,
      dataAttrs: el.dataAttrs || {},
    });
    const riskLevel = scoreRisk({
      tag: el.tag,
      type: el.type,
      role: el.role,
      href: el.href,
      text: el.text,
      name: el.name,
      ariaLabel: el.ariaLabel,
      mainOrigin,
    });

    let status: UiElement["status"] = "SKIPPED";
    let reasonCode: ReasonCode | undefined;
    const tested = false;

    if (input.skipReasonsForAll) {
      reasonCode = input.skipReasonsForAll;
      status = "SKIPPED";
    } else if (el.disabled) {
      reasonCode = "DISABLED";
      status = "SKIPPED";
    } else {
      status = "SKIPPED";
      reasonCode = undefined;
    }

    const meta = reasonCode ? getReasonMeta(reasonCode) : null;
    const actionHint = meta?.actionHint;
    const confidence = meta?.confidence;
    const fixSuggestion = meta?.fixSuggestion;

    return {
      elementId: `el-${el.index}-${el.tag}-${el.index}`,
      elementKey: el.elementKey,
      type: elType,
      tagName: el.tag,
      humanName: sanitizeLabelForKey(el.ariaLabel || el.text || el.placeholder || el.name || el.tag) || el.tag,
      pageUrl: input.pageUrl,
      visible: el.visible,
      inViewport: el.inViewport,
      enabled: !el.disabled,
      recommendedSelectors,
      recommendedSelectorsLegacy: toLegacy(recommendedSelectors),
      tested,
      status,
      reasonCode,
      actionHint,
      confidence,
      fixSuggestion,
      riskLevel,
      meta: { index: el.index, type: el.type },
    };
  });

  return dedupeByElementKey(uiElements);
}

export function hasStableSelector(el: UiElement): boolean {
  const s = el.recommendedSelectors?.[0];
  if (!s) return false;
  return s.strategy === "data-testid" || s.strategy === "data-test" || s.strategy === "data-qa" || s.strategy === "role";
}

function visibilityRank(el: UiElement): number {
  const inVp = (el as { inViewport?: boolean }).inViewport === true;
  if (inVp && el.visible) return 3;
  if (el.visible) return 2;
  return 1;
}

export function isBetterCandidate(newEl: UiElement, existing: UiElement): boolean {
  const rNew = visibilityRank(newEl);
  const rExisting = visibilityRank(existing);
  if (rNew !== rExisting) return rNew > rExisting;
  if (hasStableSelector(newEl) && !hasStableSelector(existing)) return true;
  return false;
}

export function dedupeByElementKey(elements: UiElement[]): UiElement[] {
  const byKey = new Map<string, UiElement>();
  for (const el of elements) {
    const key = el.elementKey ?? el.elementId;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, el);
      continue;
    }
    if (isBetterCandidate(el, existing)) byKey.set(key, el);
  }
  return Array.from(byKey.values());
}
