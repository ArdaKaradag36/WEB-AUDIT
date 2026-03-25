/**
 * Dashboard özet skoru, durum rozeti ve üst çubuk genişliği — tek kaynak (test edilebilir).
 * “Tamamlandı = %100 çubuk” gibi görünürlüğü gizleyen modeller kullanılmaz; çubuk özet skora bağlıdır.
 */

export const SUCCESS_RATIO_THRESHOLD = 0.5;

export function parseFindings(findingsRaw) {
  if (!findingsRaw) return {};
  if (typeof findingsRaw === 'object') return findingsRaw;
  try {
    return JSON.parse(findingsRaw);
  } catch {
    return {};
  }
}

export function coverageRatioFromCache(cache) {
  const total = Number(cache?.totalElements || 0);
  const tested = Number(cache?.testedElements || 0);
  if (!total) return null;
  return tested / total;
}

export function uiAutomationPercent(cache) {
  const r = coverageRatioFromCache(cache);
  return r == null ? null : Math.round(r * 100);
}

export function derivedStatus(job, cache) {
  if (!job) return 'error';
  if (job.status === 'running' || job.status === 'queued') return 'running';
  if (job.status === 'error' || job.status === 'notrun') return 'error';

  const total = Number(cache?.totalElements || 0);
  const tested = Number(cache?.testedElements || 0);
  const failed = Number(cache?.failedElements || 0);
  if (!total) return 'success';

  const ratio = tested / total;
  if (failed > 0 || ratio < SUCCESS_RATIO_THRESHOLD) return 'partial';
  return 'success';
}

export function scoreFromData(job, summary) {
  const findings = parseFindings(summary?.cache?.findingsBySeverity);
  const err = Number(findings.error || 0);
  const critical = Number(findings.critical || 0);
  const warn = Number(findings.warn || 0);
  const info = Number(findings.info || 0);
  let score = 100 - (critical * 20 + err * 12 + warn * 6 + info * 1);
  if (job?.status === 'running' || job?.status === 'queued') score = Math.min(score, 70);
  if (job?.status === 'error' || job?.status === 'notrun') score = Math.min(score, 35);

  const ratio = coverageRatioFromCache(summary?.cache || {});
  if (ratio != null && ratio < SUCCESS_RATIO_THRESHOLD) score = Math.min(score, 55);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Üst çubuk genişliği: özet skor + (partial iken) üst sınır.
 * Denetim “bitti” bilgisi için job.status / süre alanlarına bakılır; çubuk bunu temsil etmez.
 */
export function progressBarPercent(job, cat, score) {
  if (!job) return 0;
  if (job.status === 'queued') return 15;
  if (job.status === 'running') return 45;
  if (job.status === 'error' || job.status === 'notrun') return 100;
  if (job.status === 'success') {
    if (cat === 'success') return score;
    if (cat === 'partial') return Math.min(score, 78);
  }
  return 0;
}
