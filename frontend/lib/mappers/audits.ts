import type { AuditSummaryRow, AuditSummary, DashboardMetrics, StorageUsage } from "../types/audits";

export function computeDashboardMetrics(
  audits: AuditSummaryRow[],
  latestSummary: AuditSummary | null
): DashboardMetrics {
  const totalAudits = audits.length;
  const completedAudits = audits.filter(a => a.status === "completed").length;
  const successRate = totalAudits > 0 ? (completedAudits / totalAudits) * 100 : 0;

  const activeFindings =
    latestSummary != null ? latestSummary.criticalCount + latestSummary.errorCount : null;

  const uiCoveragePercent =
    latestSummary && latestSummary.totalElements && latestSummary.totalElements > 0
      ? ((latestSummary.testedElements ?? 0) / latestSummary.totalElements) * 100
      : 0;

  return {
    totalAudits,
    completedAudits,
    successRate,
    activeFindings,
    uiCoveragePercent,
  };
}

export function storageUsageFromNumbers(usedGb: number, totalGb: number): StorageUsage {
  const safeTotal = totalGb > 0 ? totalGb : 1;
  const usedPercent = Math.min(100, Math.max(0, (usedGb / safeTotal) * 100));
  return {
    usedGb,
    totalGb,
    usedPercent,
  };
}

