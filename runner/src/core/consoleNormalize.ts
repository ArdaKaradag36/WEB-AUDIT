import type { ConsoleIssue } from "./collectConsoleIssues";

/** Geliştirme CDN’leri (üretimde önerilmez) — bulgu skoruna girmesin; gerçek uyarı değil. */
const DEV_CDN_WARNINGS: RegExp[] = [/cdn\.tailwindcss\.com should not be used in production/i];

export function isKnownDevCdnWarning(text: string): boolean {
  return DEV_CDN_WARNINGS.some((re) => re.test(text));
}

/** CSP uyarıları, Google hesap 403 ve reklam CORS — özet skorda ceza üretmesin (otomasyon gürültüsü). */
export function isNoiseConsoleErrorForScoring(text: string, location?: string): boolean {
  const t = text || "";
  const loc = (location || "").toLowerCase();
  if (/violates the following content security policy/i.test(t)) return true;
  if (
    /failed to load resource: the server responded with a status of 403/i.test(t) &&
    (loc.includes("accounts.google.com") || loc.includes("google.com/v3/signin"))
  ) {
    return true;
  }
  if (/has been blocked by cors policy/i.test(t) && /doubleclick|googleads/i.test(t) && loc.includes("youtube.com")) {
    return true;
  }
  if (/blocked script execution in ['"]about:blank['"]/i.test(t)) return true;
  if (/failed to load resource: net::err_failed/i.test(t) && /doubleclick\.net|googleads/i.test(loc)) return true;
  return false;
}

export function dedupeConsoleIssues(issues: ConsoleIssue[]): ConsoleIssue[] {
  const seen = new Set<string>();
  const out: ConsoleIssue[] = [];
  for (const i of issues) {
    const key = `${i.type}|${(i.text ?? "").trim()}|${i.location ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

/** Skor / rule engine öncesi: tekrarları at, bilinen CDN gürültüsünü çıkar. */
export function normalizeConsoleIssuesForScoring(issues: ConsoleIssue[]): ConsoleIssue[] {
  const deduped = dedupeConsoleIssues(issues);
  return deduped.filter((i) => {
    if (i.type === "error" && isNoiseConsoleErrorForScoring(i.text, i.location)) return false;
    if (i.type === "warning" && isKnownDevCdnWarning(i.text)) return false;
    return true;
  });
}
