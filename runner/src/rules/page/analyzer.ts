import type { Finding } from "../../domain/finding";

export type PageAnalyzerInput = {
  targetUrl: string;
  /** Raw outer HTML of the main document. */
  mainDocumentHtml: string;
  /** Main document response headers (for server info leakage checks). */
  mainDocumentHeaders?: Record<string, string>;
  /** All response URLs observed during the audit (for SRI and tracking checks). */
  responseUrls?: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function h(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

/** Known privacy/tracking script domains. */
const TRACKING_DOMAINS: Record<string, string> = {
  "google-analytics.com": "Google Analytics",
  "googletagmanager.com": "Google Tag Manager",
  "doubleclick.net": "Google DoubleClick",
  "facebook.net": "Facebook Pixel",
  "facebook.com/tr": "Facebook Pixel",
  "connect.facebook.net": "Facebook SDK",
  "hotjar.com": "Hotjar",
  "clarity.ms": "Microsoft Clarity",
  "fullstory.com": "FullStory",
  "mixpanel.com": "Mixpanel",
  "segment.com": "Segment",
  "amplitude.com": "Amplitude",
  "heap.io": "Heap Analytics",
  "intercom.io": "Intercom",
  "crisp.chat": "Crisp Chat",
  "tawk.to": "Tawk.to",
  "mouseflow.com": "Mouseflow",
  "logrocket.com": "LogRocket",
  "sentry.io": "Sentry (error tracking)",
  "bugsnag.com": "Bugsnag (error tracking)",
  "rollbar.com": "Rollbar (error tracking)",
  "yandex.ru/metrika": "Yandex Metrica",
  "mc.yandex.ru": "Yandex Metrica",
};

function detectTrackingScripts(html: string, responseUrls: string[]): { domain: string; service: string }[] {
  const found = new Map<string, string>();

  // Check response URLs
  for (const url of responseUrls) {
    for (const [domain, service] of Object.entries(TRACKING_DOMAINS)) {
      if (url.includes(domain)) {
        found.set(domain, service);
      }
    }
  }

  // Check script src in HTML
  const scriptSrcRe = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrcRe.exec(html)) !== null) {
    const src = m[1];
    for (const [domain, service] of Object.entries(TRACKING_DOMAINS)) {
      if (src.includes(domain)) {
        found.set(domain, service);
      }
    }
  }

  return Array.from(found.entries()).map(([domain, service]) => ({ domain, service }));
}

function extractExternalScripts(html: string): { src: string; hasSri: boolean }[] {
  const results: { src: string; hasSri: boolean }[] = [];
  const re = /<script([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch = /src=["']([^"']+)["']/i.exec(attrs);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("//")) continue;
    const hasSri = /integrity=["'][^"']+["']/i.test(attrs);
    results.push({ src, hasSri });
  }
  return results;
}

// ─── Main analyzer ──────────────────────────────────────────────────────────

export function runPageAnalyzer(input: PageAnalyzerInput): Finding[] {
  const findings: Finding[] = [];
  const { mainDocumentHtml: html, mainDocumentHeaders: headers, responseUrls = [], targetUrl } = input;

  if (!html || html.length < 50) return findings;

  // ── KWA-PAGE-001: Missing lang attribute on <html> ─────────────────────
  {
    const htmlTagMatch = /<html([^>]*)>/i.exec(html);
    const htmlAttrs = htmlTagMatch?.[1] ?? "";
    const hasLang = /\blang\s*=/i.test(htmlAttrs);
    if (!hasLang) {
      findings.push({
        ruleId: "KWA-PAGE-001",
        severity: "warn",
        category: "accessibility",
        title: "Missing lang attribute on <html> element",
        detail: "The <html> element does not specify a lang attribute. Screen readers and search engines rely on this to determine the page language.",
        remediation: "Add lang attribute to the <html> tag, e.g. <html lang=\"tr\"> or <html lang=\"en\">.",
        confidence: 0.95,
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-002: Images without alt text ──────────────────────────────
  {
    const imgRe = /<img([^>]*)>/gi;
    let m: RegExpExecArray | null;
    const missingAlt: string[] = [];
    while ((m = imgRe.exec(html)) !== null) {
      const attrs = m[1];
      const hasAlt = /\balt\s*=/i.test(attrs);
      const hasSrc = /\bsrc\s*=["']([^"']+)["']/i.exec(attrs);
      if (!hasAlt && hasSrc) {
        const src = hasSrc[1].split("/").pop()?.slice(0, 60) ?? "";
        missingAlt.push(src);
      }
    }
    if (missingAlt.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-002",
        severity: missingAlt.length >= 5 ? "warn" : "info",
        category: "accessibility",
        title: `Images without alt text (${missingAlt.length} found)`,
        detail: `${missingAlt.length} <img> element(s) are missing alt attributes, making them inaccessible to screen readers and SEO crawlers.`,
        remediation: "Add descriptive alt text to all meaningful images. Use alt=\"\" for decorative images.",
        confidence: 0.9,
        evidence: missingAlt.slice(0, 10),
        meta: { count: missingAlt.length, samples: missingAlt.slice(0, 10) },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-003: Form inputs without labels ───────────────────────────
  {
    const inputRe = /<input([^>]*)>/gi;
    let m: RegExpExecArray | null;
    const unlabeled: string[] = [];
    while ((m = inputRe.exec(html)) !== null) {
      const attrs = m[1];
      const typeMatch = /\btype\s*=["']?([^"'\s>]+)/i.exec(attrs);
      const inputType = typeMatch?.[1]?.toLowerCase() ?? "text";
      if (["hidden", "submit", "button", "image", "reset"].includes(inputType)) continue;
      const hasLabel =
        /\baria-label\s*=/i.test(attrs) ||
        /\baria-labelledby\s*=/i.test(attrs) ||
        /\bid\s*=["']([^"']+)["']/i.test(attrs); // label for= could reference this
      const nameMatch = /\bname\s*=["']([^"']+)["']/i.exec(attrs);
      const name = nameMatch?.[1] ?? inputType;
      if (!hasLabel) {
        unlabeled.push(name.slice(0, 40));
      }
    }
    if (unlabeled.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-003",
        severity: unlabeled.length >= 3 ? "warn" : "info",
        category: "accessibility",
        title: `Form inputs potentially missing labels (${unlabeled.length} found)`,
        detail: `${unlabeled.length} input field(s) may lack accessible labels (aria-label or aria-labelledby). This makes forms unusable with screen readers.`,
        remediation: "Ensure every form input has an associated <label> element or aria-label attribute.",
        confidence: 0.7,
        evidence: unlabeled.slice(0, 10),
        meta: { count: unlabeled.length, samples: unlabeled.slice(0, 10) },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-004: Missing viewport meta ───────────────────────────────
  {
    const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html) ||
      /<meta[^>]+content=[^>]+width=device-width[^>]*>/i.test(html);
    if (!hasViewport) {
      findings.push({
        ruleId: "KWA-PAGE-004",
        severity: "warn",
        category: "mobile",
        title: "Missing viewport meta tag",
        detail: "The page does not include a <meta name=\"viewport\"> tag, which is required for proper mobile rendering.",
        remediation: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the <head>.",
        confidence: 0.95,
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-005: Missing or empty <title> ─────────────────────────────
  {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const titleText = titleMatch?.[1]?.trim() ?? "";
    if (!titleMatch || titleText.length === 0) {
      findings.push({
        ruleId: "KWA-PAGE-005",
        severity: "warn",
        category: "seo",
        title: "Missing or empty <title> element",
        detail: "The page has no title or an empty title tag. Title is essential for SEO, browser tabs, and screen readers.",
        remediation: "Add a descriptive <title> to the <head> that describes the page content (50–60 characters).",
        confidence: 0.95,
        status: "OK",
      });
    } else if (titleText.length > 80) {
      findings.push({
        ruleId: "KWA-PAGE-005",
        severity: "info",
        category: "seo",
        title: "Page title may be too long for search engines",
        detail: `Page title is ${titleText.length} characters. Google typically displays the first 50-60 characters.`,
        remediation: "Keep page titles under 60 characters for optimal search engine display.",
        confidence: 0.7,
        meta: { title: titleText.slice(0, 100) },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-006: Missing meta description ─────────────────────────────
  {
    const hasDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i.test(html) ||
      /<meta[^>]+content=["'][^"']{10,}["'][^>]+name=["']description["']/i.test(html);
    if (!hasDesc) {
      findings.push({
        ruleId: "KWA-PAGE-006",
        severity: "info",
        category: "seo",
        title: "Missing meta description",
        detail: "The page does not include a meta description, which is used by search engines and social sharing previews.",
        remediation: "Add <meta name=\"description\" content=\"...\"> with 120-160 characters summarizing the page.",
        confidence: 0.9,
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-007: External scripts without Subresource Integrity (SRI) ─
  {
    const externalScripts = extractExternalScripts(html);
    const withoutSri = externalScripts.filter((s) => !s.hasSri);
    if (withoutSri.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-007",
        severity: withoutSri.length >= 3 ? "warn" : "info",
        category: "security_headers",
        title: `External scripts loaded without Subresource Integrity (${withoutSri.length})`,
        detail: `${withoutSri.length} externally hosted <script> tag(s) lack integrity= attributes. If the CDN or third-party host is compromised, malicious code could be injected.`,
        remediation: "Add integrity and crossorigin attributes to external scripts: <script src=\"...\" integrity=\"sha384-...\" crossorigin=\"anonymous\">.",
        confidence: 0.85,
        evidence: withoutSri.map((s) => s.src).slice(0, 10),
        meta: { count: withoutSri.length, scripts: withoutSri.slice(0, 10) },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-008: Server technology information leakage ────────────────
  {
    const serverHeader = h(headers, "server");
    const poweredBy = h(headers, "x-powered-by");
    const aspNetVersion = h(headers, "x-aspnet-version") ?? h(headers, "x-aspnetmvc-version");
    const leaked: string[] = [];

    if (serverHeader && /[0-9]/.test(serverHeader)) {
      leaked.push(`Server: ${serverHeader}`);
    }
    if (poweredBy) {
      leaked.push(`X-Powered-By: ${poweredBy}`);
    }
    if (aspNetVersion) {
      leaked.push(`X-AspNet-Version: ${aspNetVersion}`);
    }

    if (leaked.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-008",
        severity: "info",
        category: "security_headers",
        title: "Server technology version disclosed in response headers",
        detail: `Response headers reveal server technology details: ${leaked.join(", ")}. This aids attackers in targeting known vulnerabilities.`,
        remediation: "Remove or mask X-Powered-By, X-AspNet-Version headers; configure Server header to omit version numbers.",
        confidence: 0.9,
        evidence: leaked,
        meta: { leakedHeaders: leaked },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-009: Privacy & tracking scripts ──────────────────────────
  {
    const trackingFound = detectTrackingScripts(html, responseUrls);
    if (trackingFound.length > 0) {
      const services = trackingFound.map((t) => t.service);
      const hasAnalytics = services.some((s) => s.toLowerCase().includes("analytics") || s.toLowerCase().includes("tag manager") || s.toLowerCase().includes("pixel"));
      findings.push({
        ruleId: "KWA-PAGE-009",
        severity: hasAnalytics ? "info" : "info",
        category: "privacy",
        title: `Third-party tracking/analytics scripts detected (${trackingFound.length})`,
        detail: `The following tracking services were detected: ${services.join(", ")}. Ensure user consent and privacy compliance (KVKK, GDPR).`,
        remediation: "Ensure a cookie consent mechanism is in place before loading tracking scripts. Review data processing agreements for each service. KVKK/GDPR may require explicit opt-in for analytics cookies.",
        confidence: 0.9,
        evidence: services,
        meta: { services: trackingFound },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-010: Password fields with autocomplete=on ─────────────────
  {
    const passwordInputRe = /<input([^>]*type=["']?password["']?[^>]*)>/gi;
    let m: RegExpExecArray | null;
    const risks: string[] = [];
    while ((m = passwordInputRe.exec(html)) !== null) {
      const attrs = m[1];
      const autocomplete = /\bautocomplete\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
      if (autocomplete === "on" || autocomplete === undefined) {
        const name = /\bname\s*=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "password";
        risks.push(name);
      }
    }
    if (risks.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-010",
        severity: "info",
        category: "form",
        title: "Password input without autocomplete=off",
        detail: `${risks.length} password field(s) do not explicitly disable autocomplete. Browsers may cache passwords on shared devices.`,
        remediation: "Add autocomplete=\"new-password\" (registration) or autocomplete=\"current-password\" (login) to password fields. Use autocomplete=\"off\" only when truly needed.",
        confidence: 0.7,
        evidence: risks,
        meta: { passwordFields: risks },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-011: Meta refresh redirect to external URL ────────────────
  {
    const metaRefreshRe = /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'\s;>]+)/gi;
    let m: RegExpExecArray | null;
    const redirects: string[] = [];
    while ((m = metaRefreshRe.exec(html)) !== null) {
      const redirectUrl = m[1];
      try {
        const targetOrigin = new URL(targetUrl).origin;
        const redirectOrigin = new URL(redirectUrl, targetUrl).origin;
        if (redirectOrigin !== targetOrigin) {
          redirects.push(redirectUrl);
        }
      } catch {
        redirects.push(redirectUrl);
      }
    }
    if (redirects.length > 0) {
      findings.push({
        ruleId: "KWA-PAGE-011",
        severity: "warn",
        category: "security_headers",
        title: "Meta refresh redirects to external URL",
        detail: `Page contains <meta http-equiv="refresh"> redirecting to an external domain. This could be an open redirect or phishing vector.`,
        remediation: "Avoid meta refresh redirects to external URLs. Use server-side redirects (301/302) with validated destinations.",
        confidence: 0.85,
        evidence: redirects,
        meta: { redirectUrls: redirects },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-012: Inline event handlers (XSS surface indicator) ────────
  {
    const inlineHandlerRe = /\s(onclick|onmouseover|onload|onerror|onfocus|onblur|onsubmit|onchange)\s*=\s*["'][^"']{20,}["']/gi;
    const handlers: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = inlineHandlerRe.exec(html)) !== null) {
      handlers.push(m[1]);
    }
    if (handlers.length >= 5) {
      const handlerCounts = handlers.reduce<Record<string, number>>((acc, h) => {
        acc[h] = (acc[h] ?? 0) + 1;
        return acc;
      }, {});
      findings.push({
        ruleId: "KWA-PAGE-012",
        severity: "info",
        category: "security_headers",
        title: `Inline event handlers detected (${handlers.length} instances)`,
        detail: `The page uses ${handlers.length} inline JavaScript event handlers (onclick, onload, etc.). Inline handlers increase XSS risk and are blocked by strict CSP.`,
        remediation: "Move inline event handlers to external JavaScript files and use addEventListener. Adopt a strict Content-Security-Policy without 'unsafe-inline'.",
        confidence: 0.7,
        meta: { count: handlers.length, byType: handlerCounts },
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-013: Cookie consent mechanism check ────────────────────────
  {
    const hasCookieBanner =
      /cookie[\s\-]*(banner|consent|notice|policy|bar|popup|modal|dialog)/i.test(html) ||
      /çerez[\s\-]*(uyarı|onay|bildir|izin|politika|banner)/i.test(html) ||
      /cookieconsent|cookiebanner|cookie-consent|gdpr-cookie|kvkk/i.test(html);

    const hasTracking = detectTrackingScripts(html, responseUrls).length > 0;

    if (hasTracking && !hasCookieBanner) {
      findings.push({
        ruleId: "KWA-PAGE-013",
        severity: "warn",
        category: "privacy",
        title: "Tracking scripts present without detectable cookie consent",
        detail: "The page loads third-party tracking scripts but no cookie consent mechanism was detected. Under KVKK and GDPR, explicit user consent is typically required before loading analytics/tracking.",
        remediation: "Implement a cookie consent management platform (CMP) that obtains consent before loading analytics/tracking scripts. Ensure consent records are stored as required by KVKK.",
        confidence: 0.7,
        status: "OK",
      });
    }
  }

  // ── KWA-PAGE-014: Open Graph / social sharing meta tags ─────────────────
  {
    const hasOgTitle = /<meta[^>]+property=["']og:title["'][^>]*>/i.test(html);
    const hasOgDesc = /<meta[^>]+property=["']og:description["'][^>]*>/i.test(html);
    if (!hasOgTitle && !hasOgDesc) {
      findings.push({
        ruleId: "KWA-PAGE-014",
        severity: "info",
        category: "seo",
        title: "Missing Open Graph meta tags for social sharing",
        detail: "The page lacks og:title and og:description tags. When shared on social media platforms, the preview will show no meaningful content.",
        remediation: "Add Open Graph meta tags: <meta property=\"og:title\">, <meta property=\"og:description\">, <meta property=\"og:image\">.",
        confidence: 0.8,
        status: "OK",
      });
    }
  }

  return findings;
}
