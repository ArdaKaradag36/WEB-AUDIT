import type { NetworkIssue } from "./collectNetworkIssues";

/** Büyük medya; navigasyon/öncelik ile net::ERR_ABORTED sık — uygulama kullanılabilirliği hatası sayılmaz. */
export function isLikelyAbortedMediaRequest(url: string, failureText?: string): boolean {
  const ft = (failureText || "").toLowerCase();
  if (!ft.includes("err_aborted")) return false;
  const u = url.toLowerCase();
  return (
    /\.(mp4|webm|m4v|mov|ogv|m3u8)(\?|#|$)/i.test(u) ||
    u.includes("/videos/") ||
    u.includes("ctfassets.net") ||
    u.includes("video.twimg.com")
  );
}

/** Küçük statik varlık 404’leri (spinner, ikon) — ana API hatası gibi error seviyesinde raporlanmaz. */
export function isMinorStaticAsset404(url: string, status?: number): boolean {
  if (status !== 404) return false;
  const u = url.toLowerCase();
  return /\.(gif|png|jpe?g|webp|ico|svg|woff2?)(\?|#|$)/i.test(u) || u.includes("/images/") || u.includes("/img/");
}

/** Aynı URL için tekrarlanan FAILED_REQUEST kayıtlarını tekilleştir (çift critical üretmesin). */
export function dedupeNetworkIssuesByUrl(issues: NetworkIssue[]): NetworkIssue[] {
  const seen = new Set<string>();
  const out: NetworkIssue[] = [];
  for (const i of issues) {
    const key = `${i.kind}|${i.url}|${i.status ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

export function partitionHttpIssues(issues: NetworkIssue[]): {
  material4xx: NetworkIssue[];
  minor404: NetworkIssue[];
} {
  const http = issues.filter((i) => i.kind === "HTTP_4XX_5XX");
  const minor404: NetworkIssue[] = [];
  const material4xx: NetworkIssue[] = [];
  for (const i of http) {
    if (isMinorStaticAsset404(i.url, i.status)) minor404.push(i);
    else material4xx.push(i);
  }
  return { material4xx, minor404 };
}
