import { test, expect } from "@playwright/test";
import { scoreRisk } from "../auto/riskModel";

test("mailto/tel/sms ve WhatsApp bağlantıları safe (safeMode’da gereksiz allowlist yok)", () => {
  const base = { tag: "a", type: "", role: "", text: "x", mainOrigin: "https://example.com" };
  expect(scoreRisk({ ...base, href: "mailto:a@b.com" })).toBe("safe");
  expect(scoreRisk({ ...base, href: "tel:+905551234567" })).toBe("safe");
  expect(scoreRisk({ ...base, href: "https://wa.me/905551234567" })).toBe("safe");
});

test("harici https (bilinmeyen host) cross-origin allowlist", () => {
  expect(
    scoreRisk({
      tag: "a",
      type: "",
      role: "",
      text: "ext",
      href: "https://evil.example/foo",
      mainOrigin: "https://example.com",
    })
  ).toBe("needs_allowlist");
});
