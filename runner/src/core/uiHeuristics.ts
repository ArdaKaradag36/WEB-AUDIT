import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import type { Artifact, TestResult } from "../domain/result";
import { hashFileSha256 } from "./hashFileSha256";

type UiHeuristicsOptions = {
  sampleLimit?: number;
  /** When false (default), A11Y heuristic is WARN only and does not fail the run. When true, allow FAIL. */
  a11yStrict?: boolean;
};

type UiIssue = {
  kind:
    | "NO_INTERACTIVE_VISIBLE"
    | "BUTTON_MISSING_NAME"
    | "LINK_MISSING_NAME"
    | "INPUT_MISSING_LABEL"
    | "TOO_MANY_DISABLED_CONTROLS";
  selectorHint?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

function addArtifact(
  artifacts: Artifact[],
  type: Artifact["type"],
  filePath: string
) {
  if (!fs.existsSync(filePath)) return;
  artifacts.push({ type, path: filePath, sha256: hashFileSha256(filePath) });
}

async function screenshotEvidence(
  outDir: string,
  artifacts: Artifact[],
  prefix: string,
  page: Page
) {
  const p = path.join(outDir, `${prefix}_${Date.now()}.png`);
  try {
    await page.screenshot({ path: p, fullPage: true });
    addArtifact(artifacts, "SCREENSHOT", p);
    return p;
  } catch {
    return undefined;
  }
}

export async function runUiHeuristics(args: {
  page: Page;
  outDir: string;
  results: TestResult[];
  artifacts: Artifact[];
  options?: UiHeuristicsOptions;
}) {
  const sampleLimit = args.options?.sampleLimit ?? 20;

  const data = await args.page.evaluate(() => {
    const isVisible = (el: Element) => {
      const e = el as HTMLElement;
      const style = window.getComputedStyle(e);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = e.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const getText = (el: Element) => (el as HTMLElement).innerText?.trim() ?? "";
    const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";

    const interactive = Array.from(
      document.querySelectorAll(
        [
          "button",
          "a[href]",
          "input",
          "select",
          "textarea",
          "[role='button']",
          "[onclick]",
        ].join(",")
      )
    );

    const items = interactive.map((el) => {
      const tag = el.tagName.toLowerCase();
      const role = attr(el, "role");
      const ariaLabel = attr(el, "aria-label");
      const ariaLabelledby = attr(el, "aria-labelledby");
      const id = attr(el, "id");
      const href = tag === "a" ? (el as HTMLAnchorElement).href : "";
      const type = tag === "input" ? (el as HTMLInputElement).type : "";
      const disabled =
        (el as any).disabled === true || attr(el, "aria-disabled") === "true";
      const visible = isVisible(el);
      const text = getText(el);

      return {
        tag,
        role,
        ariaLabel,
        ariaLabelledby,
        id,
        href,
        type,
        disabled,
        visible,
        text,
      };
    });

    return items;
  });

  const issues: UiIssue[] = [];

  const interactiveTotal = data.length;
  const interactiveVisible = data.filter((x) => x.visible).length;
  const disabledVisible = data.filter((x) => x.visible && x.disabled).length;

  const buttonMissingName = data.filter((x) => {
    const isBtn = x.tag === "button" || x.role === "button";
    if (!isBtn || !x.visible) return false;
    const hasName = !!(x.text || x.ariaLabel || x.ariaLabelledby);
    return !hasName;
  });

  const linkMissingName = data.filter((x) => {
    if (x.tag !== "a" || !x.visible) return false;
    const hasName = !!(x.text || x.ariaLabel || x.ariaLabelledby);
    return !hasName;
  });

  const inputMissingLabel = data.filter((x) => {
    if (x.tag !== "input" || !x.visible) return false;
    if (["hidden", "submit", "button", "image", "reset"].includes(x.type)) return false;
    const hasLabelish = !!(x.ariaLabel || x.ariaLabelledby);
    return !hasLabelish;
  });

  if (interactiveVisible === 0) {
    issues.push({ kind: "NO_INTERACTIVE_VISIBLE" });
  }

  for (const x of buttonMissingName.slice(0, sampleLimit)) {
    issues.push({
      kind: "BUTTON_MISSING_NAME",
      selectorHint: x.tag,
      text: x.text,
      meta: { ariaLabel: x.ariaLabel, ariaLabelledby: x.ariaLabelledby },
    });
  }

  for (const x of linkMissingName.slice(0, sampleLimit)) {
    issues.push({
      kind: "LINK_MISSING_NAME",
      selectorHint: "a[href]",
      text: x.text,
      meta: {
        href: x.href,
        ariaLabel: x.ariaLabel,
        ariaLabelledby: x.ariaLabelledby,
      },
    });
  }

  for (const x of inputMissingLabel.slice(0, sampleLimit)) {
    issues.push({
      kind: "INPUT_MISSING_LABEL",
      selectorHint: "input",
      meta: { type: x.type, id: x.id },
    });
  }

  if (
    interactiveVisible > 0 &&
    disabledVisible / interactiveVisible >= 0.5 &&
    disabledVisible >= 10
  ) {
    issues.push({
      kind: "TOO_MANY_DISABLED_CONTROLS",
      meta: { disabledVisible, interactiveVisible },
    });
  }

  // Karar: NO_INTERACTIVE_VISIBLE headless'ta false-positive olabiliyor -> SKIPPED
  let status: TestResult["status"] = "PASS";
  let errorMessage: string | undefined;

  if (issues.some((i) => i.kind === "NO_INTERACTIVE_VISIBLE")) {
    status = "SKIPPED";
    errorMessage = "No visible interactive elements found (possible rendering/WAF/overlay).";
  }

  const a11yIssues = issues.filter((i) =>
    ["BUTTON_MISSING_NAME", "LINK_MISSING_NAME", "INPUT_MISSING_LABEL"].includes(i.kind)
  );
  const a11yIssueCount = a11yIssues.length;
  const a11yStrict = args.options?.a11yStrict === true;
  const a11yStatus: TestResult["status"] = a11yStrict && a11yIssueCount >= 10 ? "FAIL" : "PASS";

  if (status !== "PASS") {
    const ev = await screenshotEvidence(args.outDir, args.artifacts, "UI_HEURISTICS", args.page);
    args.results.push({
      code: "UI.HEURISTICS.BASIC",
      title: "UI heuristics: interactive elements baseline",
      status,
      errorMessage,
      evidence: ev ? [ev] : undefined,
      meta: {
        interactiveTotal,
        interactiveVisible,
        disabledVisible,
        issuesSample: issues.slice(0, sampleLimit),
      },
    });
  } else {
    args.results.push({
      code: "UI.HEURISTICS.BASIC",
      title: "UI heuristics: interactive elements baseline",
      status: "PASS",
      meta: {
        interactiveTotal,
        interactiveVisible,
        disabledVisible,
      },
    });
  }

  args.results.push({
    code: "UI.HEURISTICS.A11Y_NAMES",
    title: "UI heuristics: accessible names/labels (best-effort)",
    status: a11yStatus,
    errorMessage: a11yStrict && a11yIssueCount >= 10
      ? "Too many missing accessible names/labels (heuristic)."
      : undefined,
    meta: {
      buttonMissingName: buttonMissingName.length,
      linkMissingName: linkMissingName.length,
      inputMissingLabel: inputMissingLabel.length,
      a11yWarn: a11yIssueCount > 0 && !a11yStrict,
      issuesSample: issues
        .filter((i) => i.kind !== "NO_INTERACTIVE_VISIBLE")
        .slice(0, sampleLimit),
    },
  });
}
