import type { Page } from "@playwright/test";

/**
 * URL path suggests a dedicated auth page (not bare "login" substring in arbitrary paths).
 */
export function loginPathMatches(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    /(^|\/)(login|signin|sign-in|sign_in|giris|oturum|session|register|signup|kayit|kayıt)(\/|$)/.test(p) ||
    /\/account\/(login|signin|sign-in)(\/|$)/.test(p) ||
    /\/user(s)?\/(login|signin)(\/|$)/.test(p) ||
    /\/auth\/(login|signin|sign-in)(\/|$)/.test(p)
  );
}

/** Keywords on an auth-like path, or near a visible password field (handled separately). */
export function hasAuthKeywords(text: string): boolean {
  const slice = text.slice(0, 20_000);
  return /(\bgiriş\b|\blogin\b|\bsign in\b|\boturum aç\b|\bsign up\b|\bkayıt ol\b|\bregister\b|\bcreate account\b)/i.test(
    slice,
  );
}

export type LoginProbe = {
  pathname: string;
  passwordInputsVisible: number;
  bodyTextPreview: string;
};

/**
 * Heuristic used by the runner and unit tests. Avoids flagging every page that mentions
 * "Sign in" in the header/footer when the path is not an auth page and no password field is visible.
 */
export function detectLoginHeuristic(probe: LoginProbe): boolean {
  if (probe.passwordInputsVisible > 0) return true;
  if (!loginPathMatches(probe.pathname)) return false;
  return hasAuthKeywords(probe.bodyTextPreview);
}

export async function detectLogin(page: Page): Promise<boolean> {
  const probe = await page.evaluate(() => {
    function visible(el: Element): boolean {
      const h = el as HTMLElement;
      const st = window.getComputedStyle(h);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const op = parseFloat(st.opacity || "1");
      if (op < 0.05) return false;
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    const passwordInputsVisible = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible)
      .length;

    const main = document.querySelector("main, [role='main']");
    let bodyTextPreview = "";
    if (main) {
      bodyTextPreview = (main as HTMLElement).innerText ?? "";
    } else {
      bodyTextPreview = document.body?.innerText ?? "";
    }

    return {
      pathname: window.location.pathname,
      passwordInputsVisible,
      bodyTextPreview: bodyTextPreview.slice(0, 20_000),
    };
  });

  return detectLoginHeuristic(probe);
}
