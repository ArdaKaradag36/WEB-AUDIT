import type { UiGap } from "../domain/uiInventory";
import type { UiInventory } from "../domain/uiInventory";

export type TestSuggestion = {
  gapElementId: string;
  humanName: string;
  pageUrl: string;
  suggestedTestPath: string;
  /** Playwright test skeleton; must be reviewed before CI execution. */
  scriptContent: string;
  riskLevel: string;
};

export type AuditAiProviderInput = {
  gaps: UiGap[];
  inventory: UiInventory | null;
  runId: string;
  targetUrl: string;
};

/**
 * AI provider for test-plan and test-skeleton suggestions.
 * Disabled by default; enable via AUDIT_AI_PROVIDER_ENABLED.
 * Generated tests require human review and must not be auto-executed in CI.
 */
export type IAuditAiProvider = {
  readonly enabled: boolean;
  /** Generate test suggestions from gaps. Returns empty when disabled. */
  generateTestSuggestions(input: AuditAiProviderInput): Promise<TestSuggestion[]>;
};
