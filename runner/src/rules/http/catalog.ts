import type { FindingSeverity } from "../../domain/finding";

export type HttpRuleCategory =
  | "security_headers"
  | "cookies"
  | "cors"
  | "mixed_content";

export type HttpRuleDefinition = {
  id: string;
  category: HttpRuleCategory;
  defaultSeverity: FindingSeverity;
  title: string;
  description: string;
  remediation: string;
};

export const httpRuleCatalog: HttpRuleDefinition[] = [
  {
    id: "KWA-HTTP-001",
    category: "security_headers",
    defaultSeverity: "error",
    title: "Strict-Transport-Security header missing or too weak",
    description:
      "HSTS is not present or has an insufficient max-age value on HTTPS responses, increasing risk of downgrade and stripping attacks.",
    remediation:
      "Enable Strict-Transport-Security with an appropriate max-age (e.g. >= 15552000) and includeSubDomains where applicable; consider preload where policy allows.",
  },
  {
    id: "KWA-HTTP-002",
    category: "security_headers",
    defaultSeverity: "warn",
    title: "Content-Security-Policy header missing",
    description:
      "The response does not emit a Content-Security-Policy header, which helps mitigate XSS and content injection.",
    remediation:
      "Define a CSP suited to the application (default-src, script-src, style-src, img-src, connect-src) avoiding wildcards in high-risk directives.",
  },
  {
    id: "KWA-HTTP-003",
    category: "security_headers",
    defaultSeverity: "warn",
    title: "CSP allows unsafe-inline scripts",
    description:
      "The Content-Security-Policy header includes 'unsafe-inline' in script-related directives, allowing inline scripts to run.",
    remediation:
      "Remove 'unsafe-inline' from script directives; migrate inline scripts to external files or use nonces/hashes.",
  },
  {
    id: "KWA-HTTP-004",
    category: "security_headers",
    defaultSeverity: "warn",
    title: "CSP allows unsafe-eval",
    description:
      "The Content-Security-Policy header includes 'unsafe-eval', allowing use of eval-like functions that increase XSS risk.",
    remediation:
      "Remove 'unsafe-eval' from script directives; refactor code to avoid eval, new Function, or similar patterns.",
  },
  {
    id: "KWA-HTTP-005",
    category: "security_headers",
    defaultSeverity: "warn",
    title: "No effective clickjacking protection (X-Frame-Options / frame-ancestors)",
    description:
      "The response does not emit X-Frame-Options or frame-ancestors directives that prevent clickjacking via framing.",
    remediation:
      "Add X-Frame-Options: DENY or SAMEORIGIN for legacy user agents, and/or a CSP frame-ancestors directive restricting allowed origins.",
  },
  {
    id: "KWA-HTTP-006",
    category: "security_headers",
    defaultSeverity: "warn",
    title: "X-Content-Type-Options missing or not set to nosniff",
    description:
      "The response is missing X-Content-Type-Options or it is not set to 'nosniff', allowing MIME type sniffing.",
    remediation:
      "Emit X-Content-Type-Options: nosniff on all HTML, script, and stylesheet responses.",
  },
  {
    id: "KWA-HTTP-007",
    category: "security_headers",
    defaultSeverity: "info",
    title: "Referrer-Policy header missing or too permissive",
    description:
      "The response does not send a Referrer-Policy header or uses a value that leaks full URLs to external sites.",
    remediation:
      "Set a privacy-respecting Referrer-Policy such as 'strict-origin-when-cross-origin' or 'no-referrer' depending on business needs.",
  },
  {
    id: "KWA-HTTP-008",
    category: "security_headers",
    defaultSeverity: "info",
    title: "Permissions-Policy header missing",
    description:
      "The response does not emit a Permissions-Policy header to restrict powerful browser features (camera, geolocation, etc.).",
    remediation:
      "Add a Permissions-Policy header explicitly limiting powerful features to required origins only.",
  },
  {
    id: "KWA-HTTP-009",
    category: "cookies",
    defaultSeverity: "warn",
    title: "Sensitive cookies missing Secure/HttpOnly/SameSite",
    description:
      "One or more cookies appear to be session or authentication cookies but lack Secure, HttpOnly, or safe SameSite attributes.",
    remediation:
      "Mark authentication/session cookies as Secure and HttpOnly; prefer SameSite=Strict or Lax, and ensure SameSite=None is only used with Secure.",
  },
  {
    id: "KWA-HTTP-010",
    category: "cors",
    defaultSeverity: "warn",
    title: "CORS allows any origin",
    description:
      "The Access-Control-Allow-Origin header is set to '*', which may expose APIs or sensitive resources to any origin.",
    remediation:
      "Replace wildcard CORS with a restricted set of allowed origins or use echo-back patterns only for non-sensitive, publicly cacheable resources.",
  },
  {
    id: "KWA-HTTP-011",
    category: "mixed_content",
    defaultSeverity: "error",
    title: "Mixed content: HTTP resources loaded on HTTPS page",
    description:
      "The HTTPS page loads one or more HTTP resources (mixed content), risking downgraded security and integrity issues.",
    remediation:
      "Serve all resources over HTTPS; update URLs, CDNs, and external references to use secure schemes.",
  },
];

