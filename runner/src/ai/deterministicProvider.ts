import type { IAuditAiProvider } from "./types";
import type { TestSuggestion } from "./types";
import type { AuditAiProviderInput } from "./types";

/**
 * Deterministic provider: turns each gap into a test suggestion using recommendedScript.
 * No external AI; suitable when AUDIT_AI_PROVIDER_ENABLED is set but no external service is configured.
 * Generated tests still require human review.
 */
export class DeterministicGapProvider implements IAuditAiProvider {
  readonly enabled = true;

  async generateTestSuggestions(input: AuditAiProviderInput): Promise<TestSuggestion[]> {
    return input.gaps.map((g) => {
      const safeName = g.elementId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
      return {
        gapElementId: g.elementId,
        humanName: g.humanName,
        pageUrl: g.pageUrl,
        suggestedTestPath: `generated/tests/gap-${safeName}.spec.ts`,
        scriptContent: g.recommendedScript,
        riskLevel: g.riskLevel,
      };
    });
  }
}
