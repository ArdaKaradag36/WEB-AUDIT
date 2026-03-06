import type { BrowserContext, Page } from "playwright";
import { detectCaptcha } from "../detectCaptcha";
import type {
  AuthProfileConfig,
  AuthResult,
  LoginExecutorContext,
  LoginStep,
  AuthSessionSnapshot,
} from "./types";

async function runLoginSteps(page: Page, steps: LoginStep[]): Promise<void> {
  for (const step of steps) {
    switch (step.type) {
      case "goto":
        await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        break;
      case "waitFor":
        await page.waitForTimeout(step.ms);
        break;
      case "fill":
        await page.locator(step.selector).first().fill(step.value, { timeout: 15_000 });
        break;
      case "click":
        await page.locator(step.selector).first().click({ timeout: 15_000 });
        break;
      case "assertText": {
        const el = page.locator(step.selector).first();
        await el.waitFor({ state: "visible", timeout: 10_000 });
        const text = (await el.innerText()).trim();
        if (!text.includes(step.text)) {
          throw new Error(
            `assertText failed: expected "${step.text}" in "${text}" for ${step.selector}`,
          );
        }
        break;
      }
      case "assertUrl": {
        const current = page.url();
        if (!current.includes(step.urlContains)) {
          throw new Error(
            `assertUrl failed: "${current}" does not contain "${step.urlContains}"`,
          );
        }
        break;
      }
      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown login step type: ${(step as any).type}`);
      }
    }
  }
}

export async function applyAuthProfile(ctx: LoginExecutorContext): Promise<AuthResult> {
  const { page, context, profile } = ctx;

  if (profile.type === "NONE") {
    return { status: "OK" };
  }

  if (profile.type === "COOKIE_SESSION") {
    // NOTE: The actual storage JSON is resolved by the backend; here we only accept the
    // prepared storageState injected by the orchestrator. For happy-path demo we no-op.
    // In production, a small adapter would call `context.addCookies` and `page.addInitScript`
    // with decrypted values.
    return { status: "OK" };
  }

  if (profile.type === "BASIC_AUTH") {
    // Minimal happy path: apply basic auth via extra HTTP headers.
    const { username, password } = profile.basic;
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    await context.setExtraHTTPHeaders({
      Authorization: `Basic ${token}`,
    });
    return { status: "OK" };
  }

  if (profile.type === "FORM_LOGIN_STEPS") {
    try {
      if (profile.form.entryUrl) {
        await page.goto(profile.form.entryUrl, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
      }
      await runLoginSteps(page, profile.form.steps);

      // After login steps, check for captcha/OTP blocks.
      const hasCaptcha = await detectCaptcha(page as any);
      if (hasCaptcha) {
        return {
          status: "BLOCKED",
          blockedReason: "CAPTCHA_DETECTED",
          errorMessage: "Captcha detected after login steps; treating as AUTH_BLOCKED.",
        };
      }

      return { status: "OK" };
    } catch (e: any) {
      return {
        status: "FAILED",
        errorMessage: e?.message ?? "Login steps failed",
      };
    }
  }

  return {
    status: "FAILED",
    errorMessage: `Unsupported auth profile type: ${(profile as any).type}`,
  };
}

export async function exportSessionSnapshot(context: BrowserContext): Promise<AuthSessionSnapshot> {
  const storageState = await context.storageState();
  return { storageState };
}

