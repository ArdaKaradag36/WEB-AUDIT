import path from "path";
import fs from "fs";

export type AuditConfig = {
  /** Safe mode: no destructive clicks without allowlist. */
  safeMode: boolean;
  /** Max links to sample. */
  maxLinks: number;
  /** Fail pipeline when findings exceed thresholds (critical>0, error>5, warn>20). */
  strict: boolean;
  /** Browser: chromium | firefox. */
  browser: "chromium" | "firefox";
  /** Run headless. */
  headless: boolean;
  /** Selectors or labels allowlisted for click (comma-separated in env). */
  clickAllowlist: string[];
  /** Max UI elements to attempt (fill/click) per run. */
  maxUiAttempts: number;
  /** Enable AI provider (test-plan suggestions). Disabled by default. */
  aiProviderEnabled: boolean;
  /** Proxy URL when running in closed network (e.g. HTTP_PROXY). */
  proxy?: string;
};

const DEFAULTS: AuditConfig = {
  safeMode: true,
  maxLinks: 20,
  strict: false,
  browser: "chromium",
  headless: true,
  clickAllowlist: [],
  maxUiAttempts: 150,
  aiProviderEnabled: false,
};

function loadEnvFile(dir: string): Record<string, string> {
  const envPath = path.join(dir, ".env");
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = val;
  }
  return out;
}

/**
 * Load config: defaults + .env (from cwd or runner root) + process.env overrides.
 * CLI should override with getArg() after calling this.
 */
export function loadConfig(cliOverrides?: Partial<AuditConfig>): AuditConfig {
  const cwd = process.cwd();
  const runnerRoot = path.resolve(cwd, "..");
  const env = { ...loadEnvFile(cwd), ...loadEnvFile(runnerRoot), ...process.env };

  const fromEnv: Partial<AuditConfig> = {
    safeMode: env.AUDIT_SAFE_MODE !== undefined ? env.AUDIT_SAFE_MODE !== "0" && env.AUDIT_SAFE_MODE.toLowerCase() !== "false" : undefined,
    maxLinks: env.AUDIT_MAX_LINKS !== undefined ? Number(env.AUDIT_MAX_LINKS) : undefined,
    strict: env.AUDIT_STRICT !== undefined ? env.AUDIT_STRICT !== "0" && env.AUDIT_STRICT.toLowerCase() !== "false" : undefined,
    browser: env.AUDIT_BROWSER === "firefox" ? "firefox" : env.AUDIT_BROWSER === "chromium" ? "chromium" : undefined,
    headless: env.AUDIT_HEADLESS !== undefined ? env.AUDIT_HEADLESS !== "0" && env.AUDIT_HEADLESS.toLowerCase() !== "false" : undefined,
    clickAllowlist: env.AUDIT_CLICK_ALLOWLIST ? env.AUDIT_CLICK_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    maxUiAttempts: env.AUDIT_MAX_UI_ATTEMPTS !== undefined ? Number(env.AUDIT_MAX_UI_ATTEMPTS) : undefined,
    aiProviderEnabled: env.AUDIT_AI_PROVIDER_ENABLED !== undefined ? env.AUDIT_AI_PROVIDER_ENABLED !== "0" && env.AUDIT_AI_PROVIDER_ENABLED.toLowerCase() !== "false" : undefined,
    proxy: env.HTTP_PROXY || env.https_proxy || env.HTTPS_PROXY || undefined,
  };

  const merged: AuditConfig = {
    ...DEFAULTS,
    ...Object.fromEntries(Object.entries(fromEnv).filter(([, v]) => v !== undefined)),
    ...cliOverrides,
  };
  return merged;
}
