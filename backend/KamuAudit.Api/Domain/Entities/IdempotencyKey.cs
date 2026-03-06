namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Idempotent create operations for audits are tracked per user + key.
/// Replays with the same key and request hash will return the same AuditRun.
/// </summary>
public sealed class IdempotencyKey
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string Key { get; set; } = default!;

    public string RequestHash { get; set; } = default!;

    public Guid AuditRunId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public User? User { get; set; }

    public AuditRun? AuditRun { get; set; }
}

