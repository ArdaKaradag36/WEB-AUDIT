import type { Cookie } from "@playwright/test";

/** Çerez, denetlenen sitenin host’una ait görünmüyorsa (ör. Twitter embed) KWA-HTTP-009’da sayma. */
export function cookieDomainMatchesSite(cookieDomain: string | undefined, siteHostname: string): boolean {
  if (!cookieDomain) return true;
  const d = cookieDomain.toLowerCase().startsWith(".") ? cookieDomain.toLowerCase().slice(1) : cookieDomain.toLowerCase();
  const h = siteHostname.toLowerCase();
  return h === d || h.endsWith("." + d);
}

export function filterCookiesForTargetSite(cookies: Cookie[], targetUrl: string): Cookie[] {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return cookies;
  }
  return cookies.filter((c) => cookieDomainMatchesSite(c.domain, hostname));
}
