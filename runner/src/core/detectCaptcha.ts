import type { Page } from "@playwright/test";

export async function detectCaptcha(page: Page): Promise<boolean> {
  // Basit heuristic: reCAPTCHA / hCaptcha / captcha kelimeleri
  const html = await page.content();
  const patterns = [
    /recaptcha/i,
    /hcaptcha/i,
    /g-recaptcha/i,
    /data-sitekey/i,
    /captcha/i
  ];
  return patterns.some((p) => p.test(html));
}
