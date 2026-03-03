export type TestStatus =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "NA"
  | "SKIPPED"; // ✅ EKLENDİ

export type TestResult = {
  code: string;
  title: string;
  status: TestStatus;
  evidence?: string[];
  errorMessage?: string;
  meta?: Record<string, unknown>;
};

export type Artifact = {
  type: "TRACE" | "SCREENSHOT" | "VIDEO" | "LOG";
  path: string;
  sha256: string;
};

export type AuditReport = {
  schemaVersion: "1.0";
  runnerVersion: string;
  runId: string;
  targetUrl: string;
  startedAt: string;
  finishedAt: string;

  usedPlugins: string[];
  requiresPlugins: string[];

  artifacts: Artifact[];
  results: TestResult[];

  summary: {
    total: number;
    pass: number;
    fail: number;
    blocked: number;
    na: number;
    skipped: number; // ✅ EKLENDİ
  };
};
