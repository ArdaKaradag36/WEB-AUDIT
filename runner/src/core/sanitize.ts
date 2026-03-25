export const SENSITIVE_KEYS: string[] = [
  "password", "passwd", "pwd",
  "token", "access_token", "refresh_token", "id_token",
  "authorization", "bearer",
  "cookie", "set-cookie",
  "x-api-key", "api-key", "apikey", "api_key",
  "secret", "api_secret", "client_secret",
  "credential", "credentials",
  "private_key", "private-key",
  "session", "sessionid", "session_id",
];

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-]{20,}/gi;

export function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '[REDACTED]' : sanitizeValue(v);
    }
    return result;
  }
  if (typeof value === 'string') return value.replace(BEARER_PATTERN, 'Bearer [REDACTED]');
  return value;
}
