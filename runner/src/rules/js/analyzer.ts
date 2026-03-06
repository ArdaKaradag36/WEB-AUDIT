import type { Finding } from "../../domain/finding";
import type { ConsoleIssue } from "../../core/collectConsoleIssues";

export type JsAnalyzerInput = {
  targetUrl: string;
  consoleIssues: ConsoleIssue[];
  responseUrls: string[];
  /** Raw HTML of the main document (optional, for inline script scanning). */
  mainDocumentHtml?: string;
};

export type JsAnalyzerOptions = {
  allowlistPatterns?: string[];
};

type SecretHit = {
  patternId: string;
  snippet: string;
};

const DEFAULT_ALLOWLIST: string[] = [];

// Very coarse secret patterns; tuned for high recall, low precision + confidence scoring.
const SECRET_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  // Allow a wide range of characters for the value to favor recall (confidence remains low).
  { id: "generic_api_key", re: /\b(api(_)?key|apikey)\s*[:=]\s*["'][^"']{16,}["']/i },
  { id: "jwt_token", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/ },
  { id: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/ },
];

const FRONTEND_API_PATTERNS: RegExp[] = [
  /\/api\/[A-Za-z0-9/_-]*/i,
  /graphql/i,
];

const SOURCEMAP_PATTERN = /\.map($|\?)/i;

function isAllowlisted(snippet: string, allowlist: string[]): boolean {
  return allowlist.some((p) => snippet.includes(p));
}

function scanForSecrets(
  html: string | undefined,
  allowlist: string[],
): SecretHit[] {
  if (!html) return [];
  const hits: SecretHit[] = [];
  const lowerAllowlist = allowlist;

  for (const def of SECRET_PATTERNS) {
    const re = new RegExp(def.re.source, def.re.flags + (def.re.flags.includes("g") ? "" : "g"));
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(html)) !== null) {
      const snippet = html.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
      if (isAllowlisted(snippet, lowerAllowlist)) continue;
      hits.push({ patternId: def.id, snippet });
      if (hits.length >= 20) return hits;
    }
  }
  return hits;
}

export function runJsAnalyzer(
  input: JsAnalyzerInput,
  options?: JsAnalyzerOptions,
): Finding[] {
  const findings: Finding[] = [];
  const allowlist = options?.allowlistPatterns ?? DEFAULT_ALLOWLIST;

  // 1) Secret-like patterns in inline JS / HTML.
  const secrets = scanForSecrets(input.mainDocumentHtml, allowlist);
  if (secrets.length > 0) {
    findings.push({
      ruleId: "KWA-JS-001",
      severity: "warn",
      category: "network",
      title: "Potential secrets or tokens in inline JavaScript/HTML",
      detail:
        "Secret-like patterns (API keys, tokens) were found in the main document. These may be false positives and require manual validation.",
      remediation:
        "Move credentials and tokens out of frontend code into secure server-side configuration or environment variables; expose only scoped tokens when strictly required.",
      confidence: 0.5,
      meta: {
        hits: secrets,
      },
    });
  }

  // 2) Frontend API endpoints (inventory).
  const apiEndpoints = new Set<string>();
  for (const url of input.responseUrls) {
    for (const re of FRONTEND_API_PATTERNS) {
      if (re.test(url)) apiEndpoints.add(url);
    }
  }
  if (apiEndpoints.size > 0) {
    findings.push({
      ruleId: "KWA-JS-002",
      severity: "info",
      category: "network",
      title: "Frontend API endpoints discovered",
      detail: `${apiEndpoints.size} API-like endpoint(s) observed from the frontend.`,
      remediation:
        "Review these endpoints for authentication, authorization, and rate limiting; ensure they are not overexposed to unauthenticated clients.",
      confidence: 0.9,
      meta: {
        endpoints: Array.from(apiEndpoints).slice(0, 50),
      },
    });
  }

  // 3) Sourcemap exposure.
  const sourcemapUrls = input.responseUrls.filter((u) => SOURCEMAP_PATTERN.test(u));
  if (sourcemapUrls.length > 0) {
    findings.push({
      ruleId: "KWA-JS-003",
      severity: "info",
      category: "network",
      title: "JavaScript source maps are publicly served",
      detail:
        "One or more JavaScript source map files (.map) are accessible from the frontend. While not always a vulnerability, they can expose source details.",
      remediation:
        "Consider restricting source maps to non-production environments or protecting them behind authentication, especially if they contain sensitive implementation details.",
      confidence: 0.7,
      meta: {
        sourcemaps: sourcemapUrls.slice(0, 50),
      },
    });
  }

  // 4) Debug / console noise heuristic.
  const debugMessages = input.consoleIssues.filter((i) =>
    /(debug|trace|verbose|DEV MODE|development build)/i.test(i.text),
  );
  const consoleLogCount = input.consoleIssues.length;

  if (consoleLogCount > 50 || debugMessages.length > 0) {
    findings.push({
      ruleId: "KWA-JS-004",
      severity: "info",
      category: "console",
      title: "High volume of console output or debug flags detected",
      detail:
        "The page emits many console messages or contains debug/development markers, which may indicate a non-hardened build.",
      remediation:
        "Reduce console noise in production builds; disable verbose debug logging and ensure debug flags are not enabled in prod.",
      confidence: consoleLogCount > 100 ? 0.9 : 0.6,
      meta: {
        consoleIssueCount: consoleLogCount,
        debugSamples: debugMessages.slice(0, 10),
      },
    });
  }

  return findings;
}

