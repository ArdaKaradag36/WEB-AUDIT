using System.Net;

namespace KamuAudit.Api.Infrastructure.Security;

/// <summary>
/// Minimal SSRF guard for audit target URLs.
/// Blocks obviously dangerous hosts such as localhost and cloud metadata endpoints.
/// </summary>
public static class TargetUrlGuard
{
    public static bool IsAllowed(Uri uri)
    {
        if (!uri.IsAbsoluteUri)
        {
            return false;
        }

        // Only HTTP/HTTPS are allowed for now.
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        var host = uri.Host.TrimEnd('.').ToLowerInvariant();

        // Exact blocked hostnames (localhost, well-known metadata endpoints).
        if (host is "localhost" or "127.0.0.1" or "::1" or "0.0.0.0" or "169.254.169.254" or "metadata.google.internal")
        {
            return false;
        }

        if (IPAddress.TryParse(host, out var ip))
        {
            // Loopback IPv4/IPv6.
            if (IPAddress.IsLoopback(ip))
            {
                return false;
            }

            // RFC1918 private ranges and link-local/metadata ranges.
            if (IsPrivateOrLinkLocal(ip))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsPrivateOrLinkLocal(IPAddress ip)
    {
        if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            var bytes = ip.GetAddressBytes();

            // 10.0.0.0/8
            if (bytes[0] == 10)
            {
                return true;
            }

            // 172.16.0.0/12
            if (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
            {
                return true;
            }

            // 192.168.0.0/16
            if (bytes[0] == 192 && bytes[1] == 168)
            {
                return true;
            }

            // 169.254.0.0/16 (link-local + metadata range)
            if (bytes[0] == 169 && bytes[1] == 254)
            {
                return true;
            }
        }
        else if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            // IPv6 link-local: fe80::/10
            if (ip.IsIPv6LinkLocal)
            {
                return true;
            }

            // IPv6 unique local (fc00::/7) treated as private.
            var bytes = ip.GetAddressBytes();
            if ((bytes[0] & 0b1111_1110) == 0b1111_1100) // fc00::/7
            {
                return true;
            }
        }

        return false;
    }
}

