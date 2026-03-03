/**
 * Realistic risk scoring. Only submit/destructive/auth => needs_allowlist or destructive.
 * Benign UI buttons are safe by default in safeMode.
 */

import type { RiskLevel } from "../domain/uiInventory";

const DESTRUCTIVE_TEXT_PATTERNS = [
  "delete",
  "remove",
  "pay",
  "checkout",
  "confirm",
  "logout",
  "sign out",
  "sil",
  "kaldır",
  "ödeme",
  "çıkış",
];

export type RiskInput = {
  tag: string;
  type: string;
  role: string;
  href: string;
  text: string;
  name?: string;
  ariaLabel?: string;
  /** Main document origin for same-origin check. */
  mainOrigin?: string;
};

export function scoreRisk(input: RiskInput): RiskLevel {
  const text = (input.text || input.ariaLabel || input.name || "").toLowerCase();
  const href = (input.href || "").toLowerCase();

  if (href && (href.includes("logout") || href.includes("log-out") || href.includes("signout") || href.includes("delete") || href.includes("sil"))) {
    return "destructive";
  }
  if (DESTRUCTIVE_TEXT_PATTERNS.some((p) => text.includes(p) || href.includes(p))) {
    return "destructive";
  }
  if (input.type === "submit") {
    return "needs_allowlist";
  }
  if (input.tag === "a" && href) {
    try {
      const url = new URL(href);
      const main = input.mainOrigin ? new URL(input.mainOrigin).origin : "";
      if (main && url.origin !== main && (url.protocol === "http:" || url.protocol === "https:")) {
        return "needs_allowlist";
      }
    } catch {}
  }
  if (input.tag === "a" && (href.startsWith("mailto:") || href.startsWith("tel:"))) {
    return "needs_allowlist";
  }
  return "safe";
}
