const TRACKING_PARAM_PREFIXES = ["utm_", "mc_", "fbclid", "gclid"];

function stripTrackingParams(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAM_PREFIXES.some((p) => lower === p || lower.startsWith(p))) {
      continue;
    }
    out.append(key, value);
  }
  return out;
}

/** Produces a canonical URL (scheme/host lowercased, tracking params dropped, params sorted, fragment removed). */
export function canonicalizeUrl(base: string, href: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // Lowercase scheme/host.
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // Normalize default ports.
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  // Drop fragment.
  url.hash = "";

  // Sort & strip query params.
  const cleaned = stripTrackingParams(url.searchParams);
  const entries = Array.from(cleaned.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const normalized = new URL(url.toString());
  normalized.search = "";
  if (entries.length > 0) {
    const sp = new URLSearchParams();
    for (const [k, v] of entries) {
      sp.append(k, v);
    }
    normalized.search = `?${sp.toString()}`;
  }

  return normalized;
}

/** Canonical key used for deduplication. */
export function canonicalKey(url: URL): string {
  return url.toString();
}

export function getHostKey(url: URL): string {
  return url.hostname;
}

export function isSameOriginOrSubdomain(root: URL, candidate: URL): boolean {
  if (root.hostname === candidate.hostname) return true;
  return candidate.hostname.endsWith(`.${root.hostname}`);
}

