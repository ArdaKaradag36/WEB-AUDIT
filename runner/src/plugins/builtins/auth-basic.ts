import type { Plugin } from "../types";
import { detectCaptcha } from "../../core/detectCaptcha";
import { detectLogin } from "../../core/detectLogin";

export const authBasicPlugin: Plugin = {
  name: "auth-basic",
  providesCapabilities: ["AUTH"],
  async apply(ctx) {
    const user =
      process.env.AUDIT_USER ||
      process.env.AUDIT_EMAIL ||
      process.env.AUDIT_USERNAME ||
      process.env.AUDIT_PHONE;
    const pass = process.env.AUDIT_PASS || process.env.AUDIT_PASSWORD;

    if (!user || !pass) {
      ctx.results.push({
        code: "PLUGIN.AUTH_BASIC.MISSING_CREDS",
        title: "Auth basic plugin requires AUDIT_USER/AUDIT_PASS env vars",
        status: "NA",
        errorMessage: "Set AUDIT_USER and AUDIT_PASS to enable login flow.",
      });
      return;
    }

    const userInput = ctx.page
      .locator(
        [
          'input[type="email"]',
          'input[type="text"]',
          'input[type="tel"]',
          'input[name*="email" i]',
          'input[name*="user" i]',
          'input[name*="phone" i]',
          'input[id*="email" i]',
          'input[id*="user" i]',
          'input[id*="phone" i]',
        ].join(", ")
      )
      .first();
    const passInput = ctx.page.locator('input[type="password"]').first();

    const userCount = await userInput.count();
    const passCount = await passInput.count();

    if (userCount === 0 || passCount === 0) {
      ctx.results.push({
        code: "PLUGIN.AUTH_BASIC.NO_FORM",
        title: "Auth basic plugin couldn't find login form",
        status: "NA",
      });
      return;
    }

    await userInput.fill(user).catch(() => {});
    await passInput.fill(pass).catch(() => {});

    const submit = ctx.page.locator('button[type="submit"], input[type="submit"]').first();
    if ((await submit.count()) > 0) {
      await submit.click().catch(() => {});
    } else {
      await passInput.press("Enter").catch(() => {});
    }

    await ctx.page.waitForTimeout(2_000);

    const hasCaptcha = await detectCaptcha(ctx.page);
    const stillLogin = await detectLogin(ctx.page);

    if (hasCaptcha) {
      ctx.results.push({
        code: "PLUGIN.AUTH_BASIC.CAPTCHA_AFTER_LOGIN",
        title: "Auth basic plugin encountered captcha after submit",
        status: "SKIPPED",
        errorMessage: "Captcha detected after login attempt.",
      });
      return;
    }

    if (stillLogin) {
      ctx.results.push({
        code: "PLUGIN.AUTH_BASIC.LOGIN_STILL_REQUIRED",
        title: "Auth basic plugin attempted login but still on login/auth screen",
        status: "SKIPPED",
        errorMessage: "Login still appears required after submit.",
      });
      return;
    }

    ctx.results.push({
      code: "PLUGIN.AUTH_BASIC.ATTEMPTED",
      title: "Auth basic plugin attempted login",
      status: "PASS",
    });
  },
};
