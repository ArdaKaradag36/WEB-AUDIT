import type { Plugin } from "../types";

function isNviHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "www.nvi.gov.tr" || h === "nvi.gov.tr";
  } catch {
    return false;
  }
}

export const nviCookieConsentPlugin: Plugin = {
  name: "nvi-cookie-consent",
  providesCapabilities: ["COOKIE_CONSENT"],
  async apply(ctx) {
    if (!isNviHost(ctx.targetUrl)) {
      ctx.results.push({
        code: "PLUGIN.NVI_COOKIES.SKIPPED_HOST",
        title: "NVI cookie plugin skipped (not nvi.gov.tr host)",
        status: "NA",
      });
      return;
    }

    // NVI has both a privacy modal and a bottom cookie bar with \"Kabul et\" text.
    // We only target the consent action (non-destructive).
    let clicked = false;

    const tryClickByText = async (text: string) => {
      if (clicked) return;
      const locator = ctx.page.locator(`button:has-text("${text}"), a:has-text("${text}")`);
      const count = await locator.count();
      if (count > 0) {
        await locator.first().click({ timeout: 2000 }).catch(() => {});
        clicked = true;
      }
    };

    // Give the page a moment to render banners.
    await ctx.page.waitForTimeout(1000);

    // 1) Explicit cookie banner text: \"Kabul et\" in Turkish.
    await tryClickByText("Kabul et");
    if (!clicked) {
      // 2) Fallback: any button/link containing lowercase \"kabul\".
      const buttons = ctx.page.locator("button, a");
      const count = await buttons.count();
      for (let i = 0; i < Math.min(count, 40); i++) {
        const el = buttons.nth(i);
        const text = (await el.innerText().catch(() => "")).trim().toLowerCase();
        if (!text) continue;
        if (text.includes("kabul")) {
          await el.click({ timeout: 2000 }).catch(() => {});
          clicked = true;
          break;
        }
      }
    }

    if (clicked) {
      ctx.results.push({
        code: "PLUGIN.NVI_COOKIES.APPLIED",
        title: "NVI-specific cookie consent plugin accepted banner",
        status: "PASS",
      });
    } else {
      ctx.results.push({
        code: "PLUGIN.NVI_COOKIES.NOT_FOUND",
        title: "NVI-specific cookie banner not found or not clickable",
        status: "NA",
      });
    }
  },
};

