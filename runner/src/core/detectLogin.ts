import type { Page } from "@playwright/test";

export async function detectLogin(page: Page): Promise<boolean> {
  // Form alanlarına bak: password input çok güçlü sinyal
  const passwordCount = await page.locator('input[type="password"]').count();
  if (passwordCount > 0) return true;

  // Metin sinyalleri: "Giriş", "Login", "Sign in"
  const bodyText = (await page.locator("body").innerText()).slice(0, 20000);
  return /(\bgiriş\b|\blogin\b|\bsign in\b|\boturum aç\b)/i.test(bodyText);
}
