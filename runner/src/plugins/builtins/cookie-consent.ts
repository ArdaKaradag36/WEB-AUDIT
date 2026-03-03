import type { Plugin } from "../types";

const ACCEPT_TEXTS = [
  "kabul",
  "kabul et",
  "accept",
  "accept all",
  "tümünü kabul",
  "hepsini kabul",
  "ok",
  "anladım",
];

export const cookieConsentPlugin: Plugin = {
  name: "cookie-consent",
  providesCapabilities: ["COOKIE_CONSENT"],
  async apply(ctx) {
    const buttons = ctx.page.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 30); i++) {
      const b = buttons.nth(i);
      const text = (await b.innerText().catch(() => "")).trim().toLowerCase();
      if (!text) continue;

      if (ACCEPT_TEXTS.some((t) => text.includes(t))) {
        await b.click({ timeout: 2000 }).catch(() => {});
        ctx.results.push({
          code: "PLUGIN.COOKIE_CONSENT.APPLIED",
          title: "Cookie consent plugin attempted to accept banner",
          status: "PASS",
          meta: { clickedText: text },
        });
        return;
      }
    }

    ctx.results.push({
      code: "PLUGIN.COOKIE_CONSENT.NOT_FOUND",
      title: "Cookie consent banner not found or not clickable",
      status: "NA",
    });
  },
};
