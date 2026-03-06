import type { Page } from "playwright";
import type { Finding } from "../../domain/finding";

export type FormAnalyzerOptions = {
  /** Max number of forms to actively probe with HTTP requests. */
  maxActiveForms?: number;
  /** Timeout for each probe request (ms). */
  requestTimeoutMs?: number;
};

type DiscoveredForm = {
  index: number;
  action: string;
  method: string;
  hasPassword: boolean;
  hasFileInput: boolean;
  hasEmailInput: boolean;
  hasCsrfToken: boolean;
  hasAutocompleteSensitive: boolean;
  fields: { name: string; type: string }[];
};

const SAFE_REFLECTION_PAYLOAD = "<script>alert(1)</script>";
const OPEN_REDIRECT_TEST_URL = "https://example.com/";

function computeFingerprint(ruleId: string, url: string, paramName: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  const raw = `${ruleId}|${url.toLowerCase()}|${paramName.toLowerCase()}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function discoverForms(page: Page): Promise<DiscoveredForm[]> {
  const forms = await page.evaluate(() => {
    const CSRF_NAME_RE = /(csrf|xsrf|requestverificationtoken|anti[-_]?forgery)/i;
    const SENSITIVE_NAME_RE = /(password|pass|pwd|tcno|tckimlik|ssn)/i;

    return Array.from(document.forms).map((form, index) => {
      const method = (form.getAttribute("method") || "GET").toUpperCase();
      const action = form.getAttribute("action") || window.location.href;

      const inputs = Array.from(
        form.querySelectorAll("input, select, textarea"),
      ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

      let hasPassword = false;
      let hasFileInput = false;
      let hasEmailInput = false;
      let hasCsrfToken = false;
      let hasAutocompleteSensitive = false;

      const fields: { name: string; type: string }[] = [];

      for (const el of inputs) {
        const type =
          (el as HTMLInputElement).type ||
          (el.tagName.toLowerCase() === "textarea" ? "textarea" : "text");
        const name = (el.getAttribute("name") || "").trim();
        const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();

        if (type === "password") hasPassword = true;
        if (type === "file") hasFileInput = true;
        if (type === "email") hasEmailInput = true;

        if (
          el.getAttribute("type") === "hidden" &&
          CSRF_NAME_RE.test(name)
        ) {
          hasCsrfToken = true;
        }

        if (
          autocomplete === "on" &&
          (type === "password" || SENSITIVE_NAME_RE.test(name))
        ) {
          hasAutocompleteSensitive = true;
        }

        if (name) {
          fields.push({ name, type });
        }
      }

      return {
        index,
        action,
        method,
        hasPassword,
        hasFileInput,
        hasEmailInput,
        hasCsrfToken,
        hasAutocompleteSensitive,
        fields,
      };
    });
  });

  return forms;
}

export async function analyzeForms(
  page: Page,
  targetUrl: string,
  options?: FormAnalyzerOptions,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const maxActiveForms = options?.maxActiveForms ?? 5;
  const requestTimeoutMs = options?.requestTimeoutMs ?? 8_000;

  const url = new URL(targetUrl);
  const isHttps = url.protocol === "https:";

  const forms = await discoverForms(page);

  // Quick exit: if no forms, return inventory-like info finding as optional.
  if (forms.length === 0) {
    return findings;
  }

  // KWA-FORM-010 – Form inventory (info-level).
  findings.push({
    ruleId: "KWA-FORM-010",
    severity: "info",
    category: "form",
    title: "Form inventory discovered",
    detail: `${forms.length} form(s) detected on the page.`,
    remediation:
      "Review which forms are critical (authentication, state changes) and ensure they are covered by security testing and manual review.",
    confidence: 1.0,
    meta: {
      count: forms.length,
      forms: forms.slice(0, 20).map((f) => ({
        index: f.index,
        action: f.action,
        method: f.method,
        fields: f.fields.map((x) => x.name),
      })),
    },
  });

  let activeProbed = 0;

  for (const form of forms) {
    const actionUrl = new URL(form.action, targetUrl);
    const sameOrigin = actionUrl.origin === url.origin;

    // KWA-FORM-005 – Password field on HTTP page.
    if (!isHttps && form.hasPassword) {
      findings.push({
        ruleId: "KWA-FORM-005",
        severity: "error",
        category: "form",
        title: "Password field served over plain HTTP",
        detail:
          "A form includes a password input on an HTTP page, exposing credentials to interception.",
        remediation: "Serve all authentication forms exclusively over HTTPS.",
        confidence: 0.95,
        meta: {
          action: actionUrl.toString(),
          method: form.method,
          formIndex: form.index,
        },
      });
    }

    // KWA-FORM-007 – Form action posts to external origin.
    if (!sameOrigin) {
      findings.push({
        ruleId: "KWA-FORM-007",
        severity: "info",
        category: "form",
        title: "Form posts to external origin",
        detail: `Form submits to external origin ${actionUrl.origin}.`,
        remediation:
          "Review whether posting form data to external origins is necessary; ensure contracts and data protection are in place.",
        confidence: 0.7,
        meta: {
          action: actionUrl.toString(),
          method: form.method,
          formIndex: form.index,
        },
      });
    }

    // KWA-FORM-008 – File upload present.
    if (form.hasFileInput) {
      findings.push({
        ruleId: "KWA-FORM-008",
        severity: "info",
        category: "form",
        title: "File upload form detected",
        detail:
          "The page contains a file upload field; ensure server-side validation and scanning are in place.",
        remediation:
          "Validate uploaded files by type and size; use antivirus / content scanning and store outside webroot.",
        confidence: 0.8,
        meta: {
          action: actionUrl.toString(),
          method: form.method,
          formIndex: form.index,
        },
      });
    }

    // KWA-FORM-009 – Sensitive fields with autocomplete on.
    if (form.hasAutocompleteSensitive) {
      findings.push({
        ruleId: "KWA-FORM-009",
        severity: "info",
        category: "form",
        title: "Sensitive form fields allow browser autocomplete",
        detail:
          "One or more sensitive fields (password/ID) have autocomplete enabled, which may leak data on shared devices.",
        remediation:
          "Disable autocomplete on sensitive fields unless required, and educate users about shared device risks.",
        confidence: 0.6,
        meta: {
          action: actionUrl.toString(),
          method: form.method,
          formIndex: form.index,
        },
      });
    }

    // KWA-FORM-004 – CSRF heuristic for POST without token.
    if (
      form.method === "POST" &&
      !form.hasPassword &&
      sameOrigin &&
      !form.hasCsrfToken
    ) {
      findings.push({
        ruleId: "KWA-FORM-004",
        severity: "warn",
        category: "form",
        title: "Potential CSRF risk: state-changing POST form without apparent CSRF token",
        detail:
          "A POST form appears to be state-changing but does not contain a recognizable CSRF token field.",
        remediation:
          "Add a CSRF token (anti-forgery token) to state-changing POST forms and validate it server-side.",
        confidence: 0.6,
        meta: {
          action: actionUrl.toString(),
          method: form.method,
          fields: form.fields.map((f) => f.name),
          formIndex: form.index,
        },
      });
    }

    // For non-destructive behavior: do not actively submit POST forms here.
    if (activeProbed >= maxActiveForms) {
      continue;
    }

    // Only probe GET forms via out-of-band requests (no navigation).
    if (form.method !== "GET") {
      // KWA-FORM-006 – Password submitted via GET (static heuristic).
      if (form.hasPassword && form.method === "GET") {
        findings.push({
          ruleId: "KWA-FORM-006",
          severity: "warn",
          category: "form",
          title: "Password field may be submitted via GET",
          detail:
            "A form with a password input uses GET, which risks leaking credentials via URLs and logs.",
          remediation:
            "Use POST for login forms and avoid placing credentials in URLs or query strings.",
          confidence: 0.9,
          meta: {
            action: actionUrl.toString(),
            formIndex: form.index,
          },
        });
      }
      continue;
    }

    const textField = form.fields.find(
      (f) => f.type !== "password" && f.type !== "hidden" && f.name,
    );
    if (!textField) continue;

    activeProbed += 1;

    const params = new URLSearchParams();
    params.set(textField.name, SAFE_REFLECTION_PAYLOAD);

    // Open redirect param candidates.
    const redirectParam = form.fields.find((f) =>
      /(redirect|return|next|url|continue)/i.test(f.name),
    );

    if (redirectParam) {
      params.set(redirectParam.name, OPEN_REDIRECT_TEST_URL);
    }

    const requestUrl = (() => {
      const base = actionUrl.toString();
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}${params.toString()}`;
    })();

    try {
      const resp = await page.request.get(requestUrl, {
        timeout: requestTimeoutMs,
      });
      const body = await resp.text();

      const rawReflected = body.includes(SAFE_REFLECTION_PAYLOAD);
      const encodedReflected =
        body.includes("&lt;script&gt;alert(1)&lt;/script&gt;") ||
        body.includes("&lt;script&gt;alert(1)&lt;&#x2F;script&gt;") ||
        // Looser heuristic: script tag brackets encoded but inner content may use raw '>'.
        (body.includes("&lt;script") && body.includes("alert(1)") && body.includes("&lt;/script"));

      if (rawReflected) {
        const ruleId = "KWA-FORM-001";
        findings.push({
          ruleId,
          severity: "warn",
          category: "form",
          title: "Reflected input without HTML encoding (potential XSS surface)",
          detail:
            "A test payload sent through a form field was reflected in the response without HTML encoding.",
          remediation:
            "HTML-encode untrusted input in responses and validate/sanitize user input; review for stored/reflected XSS.",
          confidence: 0.8,
          evidence: [requestUrl],
          meta: {
            parameter: textField.name,
            fingerprint: computeFingerprint(ruleId, actionUrl.toString(), textField.name),
          },
        });
      } else if (encodedReflected) {
        const ruleId = "KWA-FORM-002";
        findings.push({
          ruleId,
          severity: "info",
          category: "form",
          title: "Reflected input appears HTML-encoded (reflection surface present)",
          detail:
            "A test payload was reflected in the response in encoded form, suggesting a reflection surface with some output encoding.",
          remediation:
            "Ensure output encoding and input validation are consistently applied; consider whether reflection of user input is necessary.",
          confidence: 0.7,
          evidence: [requestUrl],
          meta: {
            parameter: textField.name,
            fingerprint: computeFingerprint(ruleId, actionUrl.toString(), textField.name),
          },
        });
      }

      // Open redirect: if redirectParam existed and final URL host matches benign domain.
      if (redirectParam) {
        try {
          const finalUrl = new URL(resp.url());
          const benignHost = new URL(OPEN_REDIRECT_TEST_URL).host;
          if (finalUrl.host === benignHost) {
            const ruleId = "KWA-FORM-003";
            findings.push({
              ruleId,
              severity: "warn",
              category: "form",
              title: "Potential open redirect via form parameter",
              detail:
                "A form parameter appears to control redirection to an arbitrary external URL.",
              remediation:
                "Restrict redirect targets to a safe allowlist or internal paths; avoid reflecting user-controlled URLs into Location headers.",
              confidence: 0.85,
              evidence: [requestUrl],
              meta: {
                parameter: redirectParam.name,
                fingerprint: computeFingerprint(ruleId, actionUrl.toString(), redirectParam.name),
              },
            });
          }
        } catch {
          // ignore URL parsing errors
        }
      }
    } catch {
      // Respect network policies: timeouts/429 are already handled by global collectors;
      // form analyzer stays non-destructive and does not escalate here.
    }
  }

  return findings;
}

