/**
 * Finding: evidence-backed audit finding from the rule engine.
 * Severity drives strict-mode thresholds; category and remediation support reporting.
 */
export type FindingSeverity = "critical" | "error" | "warn" | "info";

export type FindingCategory =
  | "console"
  | "network"
  | "link"
  | "form"
  | "security_headers"
  | "ui_coverage"
  | "blocker";

export type Finding = {
  ruleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail?: string;
  remediation?: string;
  evidence?: string[];
  meta?: Record<string, unknown>;
};
