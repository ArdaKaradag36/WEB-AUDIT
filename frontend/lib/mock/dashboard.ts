import type { StorageUsage } from "../types/audits";

export const mockStorageUsage: StorageUsage = {
  usedGb: 64.2,
  totalGb: 100,
  usedPercent: 64,
};

export const mockSidebarStats = {
  activeAudits: 12,
  errorRatePercent: 1.8,
};

export const mockLandingHeroStats = {
  auditTypesLabel: "12+",
  reportingLabel: "JSON + UI",
  modelLabel: "Multi-user",
};

export const mockLandingControlPanel = {
  activeAudits: 18,
  criticalFindings: 27,
  healthScore: 84,
};

export const mockLandingRecentTargets: Array<{
  title: string;
  status: string;
  toneClass: string;
}> = [
  { title: "nvi.gov.tr", status: "Running", toneClass: "text-blue-300" },
  { title: "kurum-portal.local", status: "Queued", toneClass: "text-amber-300" },
  { title: "internal-docs.gov", status: "Completed", toneClass: "text-emerald-300" },
];

