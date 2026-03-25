/**
 * Realistic risk scoring. Only submit/destructive/auth => needs_allowlist or destructive.
 * Benign UI buttons are safe by default in safeMode.
 */

import type { RiskLevel } from "../domain/uiInventory";

const HARD_DESTRUCTIVE_TEXT_PATTERNS = [
  "delete",
  "remove",
  "logout",
  "sign out",
  "sil",
  "kaldır",
  "çıkış",
];

const REVIEW_REQUIRED_TEXT_PATTERNS = [
  "pay",
  "checkout",
  "confirm",
  "submit",
  "approve",
  "ödeme",
  "onayla",
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
  if (HARD_DESTRUCTIVE_TEXT_PATTERNS.some((p) => text.includes(p) || href.includes(p))) {
    return "destructive";
  }
  if (REVIEW_REQUIRED_TEXT_PATTERNS.some((p) => text.includes(p) || href.includes(p))) {
    return "needs_allowlist";
  }
  if (input.type === "submit") {
    return "needs_allowlist";
  }
  if (input.tag === "a" && href) {
    try {
      const url = new URL(href);
      if (url.protocol === "mailto:" || url.protocol === "tel:" || url.protocol === "sms:") {
        return "safe";
      }
      const host = url.hostname.toLowerCase();
      if (host === "wa.me" || host.endsWith(".wa.me") || host.includes("whatsapp")) {
        return "safe";
      }
      const main = input.mainOrigin ? new URL(input.mainOrigin).origin : "";
      if (main && url.origin !== main && (url.protocol === "http:" || url.protocol === "https:")) {
        return "needs_allowlist";
      }
    } catch {}
  }
  return "safe";
}
