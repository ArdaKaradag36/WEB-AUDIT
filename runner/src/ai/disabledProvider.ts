import type { IAuditAiProvider } from "./types";
import type { TestSuggestion } from "./types";
import type { AuditAiProviderInput } from "./types";

export class DisabledAuditAiProvider implements IAuditAiProvider {
  readonly enabled = false;

  async generateTestSuggestions(_input: AuditAiProviderInput): Promise<TestSuggestion[]> {
    return [];
  }
}
