import type { IAuditAiProvider } from "./types";
import type { AuditConfig } from "../config/loadConfig";
import { DisabledAuditAiProvider } from "./disabledProvider";
import { DeterministicGapProvider } from "./deterministicProvider";

const deterministicProvider = new DeterministicGapProvider();

/**
 * Returns the AI provider for this run. When aiProviderEnabled is false (default),
 * returns a no-op provider that yields no suggestions.
 * When true, returns deterministic gap-based generator (recommendedScript per gap).
 * Replace default via setDefaultAuditAiProvider() to plug in an external AI service.
 */
export function getAuditAiProvider(config: Pick<AuditConfig, "aiProviderEnabled">): IAuditAiProvider {
  if (!config.aiProviderEnabled) {
    return new DisabledAuditAiProvider();
  }
  return defaultProvider;
}

let defaultProvider: IAuditAiProvider = deterministicProvider;

export { deterministicProvider };

/**
 * Register a custom provider (e.g. for tests or when integrating an external AI service).
 * Not used by default; AI remains disabled unless explicitly enabled and a provider is set.
 */
export function setDefaultAuditAiProvider(provider: IAuditAiProvider): void {
  defaultProvider = provider;
}
