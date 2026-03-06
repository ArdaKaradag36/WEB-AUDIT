namespace KamuAudit.Api.Infrastructure.Idempotency;

public sealed class IdempotencyOptions
{
    /// <summary>
    /// Retention window for idempotency keys in hours. Defaults to 24.
    /// </summary>
    public int RetentionHours { get; set; } = 24;
}

