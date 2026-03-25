import { test, expect } from "@playwright/test";
import { detectCaptcha } from "../core/detectCaptcha";

test("script/recaptcha URL metni — görünür iframe yok → captcha yok", async ({ page }) => {
  await page.setContent(`<!doctype html><html><body>
    <script src="https://www.google.com/recaptcha/api.js"></script>
    <p>normal içerik</p>
  </body></html>`);
  expect(await detectCaptcha(page)).toBe(false);
});

test("görünür boyutlu reCAPTCHA iframe → captcha", async ({ page }) => {
  await page.setContent(`<!doctype html><html><body>
    <iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor"
      width="304" height="78" style="border:0"></iframe>
  </body></html>`);
  expect(await detectCaptcha(page)).toBe(true);
});

test("0x0 recaptcha iframe → sayma", async ({ page }) => {
  await page.setContent(`<!doctype html><html><body>
    <iframe src="https://www.google.com/recaptcha/api2/anchor"
      width="0" height="0"></iframe>
  </body></html>`);
  expect(await detectCaptcha(page)).toBe(false);
});
