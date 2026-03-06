/**
 * Finding: evidence-backed audit finding from the rule engine.
 * Severity drives strict-mode thresholds; category and remediation support reporting.
 */
export type FindingSeverity = "critical" | "error" | "warn" | "info";

export type FindingStatus = "OK" | "SKIPPED" | "FAILED" | "INFO";

export type SkipReason =
  | "NETWORK_POLICY"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "AUTH_BLOCKED"
  | "ROBOTS"
  | "OTHER";

export type FindingCategory =
  | "console"
  | "network"
  | "link"
  | "form"
  | "security_headers"
  | "ui_coverage"
  | "blocker"
  | "cookies"
  | "cors"
  | "mixed_content";

export type Finding = {
  ruleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail?: string;
  remediation?: string;
  /** Optional confidence score in [0,1]; higher means more certain. */
  confidence?: number;
  evidence?: string[];
  meta?: Record<string, unknown>;
  /** Execution-level status (OK/SKIPPED/FAILED/INFO). Defaults to OK if omitted. */
  status?: FindingStatus;
  /** Optional skip reason when status === "SKIPPED". */
  skipReason?: SkipReason;
};
