import dns from 'dns';
import net from 'net';

const PRIVATE_IPV4_RANGES: [number, number][] = [
  [ipToInt('10.0.0.0'),    ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'),  ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'),   ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')],
  [ipToInt('100.64.0.0'),  ipToInt('100.127.255.255')],
  [ipToInt('0.0.0.0'),     ipToInt('0.255.255.255')],
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

export function isPrivateIpv4Literal(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const n = ipToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

export function isPrivateIpv6Literal(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe81:') || lower.startsWith('fe82:') || lower.startsWith('fe83:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4Literal(mapped[1]);
  const altMapped = lower.match(/^::ffff:0:(\d+\.\d+\.\d+\.\d+)$/);
  if (altMapped) return isPrivateIpv4Literal(altMapped[1]);
  return false;
}

export function isPrivateIpLiteral(ip: string): boolean {
  return isPrivateIpv4Literal(ip) || isPrivateIpv6Literal(ip);
}

export async function isPrivateHostname(
  hostname: string,
  opts?: { allowPrivate?: boolean }
): Promise<boolean> {
  if (opts?.allowPrivate) return false;
  if (net.isIPv4(hostname)) return isPrivateIpv4Literal(hostname);
  if (net.isIPv6(hostname)) return isPrivateIpv6Literal(hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  try {
    const addresses = await dns.promises.resolve(hostname);
    return addresses.some((a) => isPrivateIpLiteral(a));
  } catch {
    try {
      const result = await dns.promises.lookup(hostname, { all: true });
      return result.some((r) => isPrivateIpLiteral(r.address));
    } catch {
      return false;
    }
  }
}

/**
 * Returns true when the hostname should be SSRF-blocked.
 * Respects AUDIT_ALLOW_PRIVATE_TARGETS=true (same flag used by context.route() in cli.ts)
 * so that test environments pointing at 127.0.0.1 test servers work correctly.
 */
export async function isSsrfBlocked(hostname: string): Promise<boolean> {
  if (process.env.AUDIT_ALLOW_PRIVATE_TARGETS === 'true') return false;
  return isPrivateHostname(hostname);
}
