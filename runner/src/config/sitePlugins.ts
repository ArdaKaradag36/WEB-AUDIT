/**
 * Site-specific plugin hints keyed by target hostname (lowercase).
 * Keeps core CLI free of one-off host branches.
 */
export function extraPluginsForHost(hostname: string): string[] {
  const h = hostname.toLowerCase();
  if (h === "www.nvi.gov.tr" || h === "nvi.gov.tr") {
    return ["nvi-cookie-consent"];
  }
  return [];
}
