import type { Page } from "@playwright/test";

/**
 * Yalnızca görünür, boyutlu captcha/bot widget’larını sayar.
 * Sayfa kaynağında geçen `recaptcha/api.js` / `google.com/recaptcha` string’leri
 * (YouTube vb.) tek başına tetiklenmez — 0 UI yanlış pozitiflerini önler.
 */
export async function detectCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    function visibleSized(el: Element): boolean {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const st = window.getComputedStyle(el as HTMLElement);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const op = parseFloat(st.opacity || "1");
      if (op < 0.05) return false;
      return true;
    }

    function iframeLooksLikeCaptcha(src: string): boolean {
      const s = src.toLowerCase();
      return (
        s.includes("google.com/recaptcha") ||
        s.includes("recaptcha.net") ||
        s.includes("hcaptcha.com") ||
        s.includes("challenges.cloudflare.com")
      );
    }

    function walkFrames(root: Document | ShadowRoot, visit: (el: Element) => boolean): boolean {
      for (const el of Array.from(root.querySelectorAll("iframe"))) {
        if (visit(el)) return true;
      }
      for (const host of Array.from(root.querySelectorAll("*"))) {
        const sh = (host as HTMLElement).shadowRoot;
        if (sh && walkFrames(sh, visit)) return true;
      }
      return false;
    }

    if (
      walkFrames(document, (el) => {
        const src = (el as HTMLIFrameElement).src || "";
        return iframeLooksLikeCaptcha(src) && visibleSized(el);
      })
    ) {
      return true;
    }

    const boxSelectors = [".g-recaptcha", ".h-captcha", ".cf-turnstile"];
    for (const sel of boxSelectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (visibleSized(el)) return true;
      }
    }

    return false;
  });
}
