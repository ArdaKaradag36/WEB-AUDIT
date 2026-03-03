namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Optional target-site credential attached to a single audit run.
/// Password is stored encrypted at rest and never logged or returned via API.
/// </summary>
public sealed class AuditTargetCredential
{
    public Guid Id { get; set; }

    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public string? Username { get; set; }

    /// <summary>
    /// Encrypted password blob (protected via ASP.NET Core DataProtection).
    /// </summary>
    public string EncryptedPassword { get; set; } = default!;

    public string? TwoFactorNote { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

