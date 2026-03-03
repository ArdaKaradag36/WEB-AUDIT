import type { Plugin } from "../types";

export const authBasicPlugin: Plugin = {
  name: "auth-basic",
  providesCapabilities: ["AUTH"],
  async apply(ctx) {
    const user = process.env.AUDIT_USER;
    const pass = process.env.AUDIT_PASS;

    if (!user || !pass) {
      ctx.results.push({
        code: "PLUGIN.AUTH_BASIC.MISSING_CREDS",
        title: "Auth basic plugin requires AUDIT_USER/AUDIT_PASS env vars",
        status: "BLOCKED",
        errorMessage: "Set AUDIT_USER and AUDIT_PASS to enable login flow.",
      });
      return;
    }

    const userInput = ctx.page.locator('input[type="text"], input[type="email"]').first();
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

    await ctx.page.waitForTimeout(1500);

    ctx.results.push({
      code: "PLUGIN.AUTH_BASIC.ATTEMPTED",
      title: "Auth basic plugin attempted login",
      status: "PASS",
    });
  },
};
