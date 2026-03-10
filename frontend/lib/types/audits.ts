export interface AuditSummaryRow {
  id: string;
  targetUrl: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  errorType?: string;
}

export interface AuditSummary {
  auditRunId: string;
  findingsTotal: number;
  gapsTotal: number;
  criticalCount: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  gapsByRiskSafe: number;
  gapsByRiskNeedsAllowlist: number;
  gapsByRiskDestructive: number;
  gapsByRiskRequiresAuth: number;
  durationMs?: number;
  linkSampled?: number;
  linkBroken?: number;
  totalElements?: number;
  testedElements?: number;
  skippedElements?: number;
  coverageRatio?: number;
  maxConsoleErrorPerPage?: number;
  topFailingUrl?: string;
  mostCommonGapReason?: string;
  skippedFindings?: number;
}

export interface AuditDetail {
  id: string;
  targetUrl: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  linkSampled?: number;
  linkBroken?: number;
  lastError?: string;
  errorType?: string;
  lastExitCode?: number;
  retryCount?: number;
}

export interface FindingDto {
  id: string;
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  detail?: string;
  meta?: unknown;
  status?: "OK" | "SKIPPED" | "FAILED" | "INFO";
  skipReason?: "NETWORK_POLICY" | "RATE_LIMIT" | "TIMEOUT" | "AUTH_BLOCKED" | "ROBOTS" | "OTHER";
}

export interface FindingGroupDto {
  ruleId: string;
  severity: string;
  category: string;
  title: string;
  count: number;
}

export interface PagedFindingsResponse {
  items: FindingDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  groups: FindingGroupDto[];
}

export interface GapDto {
  id: string;
  elementId: string;
  reasonCode: string;
  riskLevel: string;
  humanName?: string;
  actionHint?: string;
}

export interface DashboardMetrics {
  totalAudits: number;
  completedAudits: number;
  successRate: number;
  activeFindings: number | null;
  uiCoveragePercent: number;
}

export interface StorageUsage {
  usedGb: number;
  totalGb: number;
  usedPercent: number;
}

export interface ReportsOverview {
  totalReports: number;
  lastGeneratedAt?: string;
}

