namespace KamuAudit.Api.Infrastructure.Auth;

/// <summary>
/// Validated JWT settings (key, issuer, audience, expiry). Populated at startup; no default key.
/// </summary>
public sealed class JwtSettings
{
    /// <summary>Signing key bytes (min 32 bytes; validated at startup).</summary>
    public byte[] SigningKeyBytes { get; set; } = [];

    /// <summary>Token issuer (e.g. KamuAudit.Api).</summary>
    public string Issuer { get; set; } = "KamuAudit.Api";

    /// <summary>Token audience (e.g. KamuAudit).</summary>
    public string Audience { get; set; } = "KamuAudit";

    /// <summary>Token expiry in hours (default 24).</summary>
    public int ExpiryHours { get; set; } = 24;
}
