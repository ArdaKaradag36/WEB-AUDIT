import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import type { TestResult, Artifact } from "../domain/result";
import { hashFileSha256 } from "./hashFileSha256";

type SpecAction =
  | { type: "goto"; url: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; text: string }
  | { type: "assertVisible"; selector: string }
  | { type: "assertEnabled"; selector: string }
  | { type: "assertTextContains"; selector: string; text: string }
  | { type: "waitFor"; ms: number };

export type AuditSpec = {
  name: string;
  startUrl?: string;
  steps: Array<{
    code: string;
    title: string;
    action: SpecAction;
  }>;
};

function addEvidence(outDir: string, artifacts: Artifact[], prefix: string, page: Page) {
  const p = path.join(outDir, `${prefix}_${Date.now()}.png`);
  return page
    .screenshot({ path: p, fullPage: true })
    .then(() => {
      artifacts.push({ type: "SCREENSHOT", path: p, sha256: hashFileSha256(p) });
      return p;
    })
    .catch(() => undefined);
}

/**
 * Reads JSON safely:
 * - Reads as Buffer
 * - Converts to UTF-8
 * - Removes UTF-8 BOM if present
 * - Trims leading whitespace
 * This prevents JSON.parse errors like "Unexpected token ''".
 */
function readJsonFileSafe(filePath: string): unknown {
  const buf = fs.readFileSync(filePath);

  let text = buf.toString("utf8");

  // ✅ Remove UTF-8 BOM (0xEF 0xBB 0xBF) which becomes \uFEFF in JS strings
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // ✅ Remove leading whitespace / stray characters
  text = text.trimStart();

  try {
    return JSON.parse(text);
  } catch (err: any) {
    // Give a more actionable error message
    const preview = text.slice(0, 80).replace(/\r?\n/g, "\\n");
    throw new Error(
      `Spec JSON parse failed for "${filePath}". ` +
        `FirstChars="${preview}". ` +
        `OriginalError=${err?.message ?? String(err)}`
    );
  }
}

export async function runSpecFile(args: {
  specPath: string;
  page: Page;
  outDir: string;
  results: TestResult[];
  artifacts: Artifact[];
}) {
  const parsed = readJsonFileSafe(args.specPath);

  // Minimal runtime validation (kamu standardı: daha deterministik hata)
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid spec: root must be an object. Path=${args.specPath}`);
  }

  const spec = parsed as AuditSpec;

  if (!spec.name || typeof spec.name !== "string") {
    throw new Error(`Invalid spec: "name" is required and must be a string. Path=${args.specPath}`);
  }
  if (!Array.isArray(spec.steps)) {
    throw new Error(`Invalid spec: "steps" must be an array. Path=${args.specPath}`);
  }

  if (spec.startUrl) {
    await args.page.goto(spec.startUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }

  for (const step of spec.steps) {
    const code = `ELM.${spec.name}.${step.code}`.toUpperCase();

    try {
      const a = step.action;

      if (a.type === "goto") {
        await args.page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      } else if (a.type === "click") {
        await args.page.locator(a.selector).first().click({ timeout: 10_000 });
      } else if (a.type === "fill") {
        await args.page.locator(a.selector).first().fill(a.text, { timeout: 10_000 });
      } else if (a.type === "assertVisible") {
        await args.page.locator(a.selector).first().waitFor({ state: "visible", timeout: 10_000 });
      } else if (a.type === "assertEnabled") {
        const el = args.page.locator(a.selector).first();
        await el.waitFor({ state: "visible", timeout: 10_000 });
        const disabled = await el.isDisabled().catch(() => true);
        if (disabled) throw new Error("Element is disabled");
      } else if (a.type === "assertTextContains") {
        const el = args.page.locator(a.selector).first();
        await el.waitFor({ state: "visible", timeout: 10_000 });
        const txt = (await el.innerText()).trim();
        if (!txt.includes(a.text)) {
          throw new Error(`Text mismatch: expected contains "${a.text}", got "${txt}"`);
        }
      } else if (a.type === "waitFor") {
        await args.page.waitForTimeout(a.ms);
      } else {
        const _exhaustive: never = a;
        throw new Error(`Unknown action: ${(a as any).type}`);
      }

      args.results.push({
        code,
        title: step.title,
        status: "PASS",
      });
    } catch (e: any) {
      const evidence = await addEvidence(args.outDir, args.artifacts, code.replace(/\./g, "_"), args.page);

      args.results.push({
        code,
        title: step.title,
        status: "FAIL",
        errorMessage: e?.message ?? "Spec step failed",
        evidence: evidence ? [evidence] : undefined,
      });
    }
  }
}
