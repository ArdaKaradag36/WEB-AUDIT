namespace KamuAudit.Api.Contracts.Responses;

/// <summary>
/// Tek bir audit run'ın detay bilgisi için DTO.
/// </summary>
public sealed class AuditRunDetailDto
{
    public Guid Id { get; set; }

    public Guid? SystemId { get; set; }

    public string TargetUrl { get; set; } = default!;

    public string Status { get; set; } = default!;

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    public bool SafeMode { get; set; }

    public int MaxLinks { get; set; }

    public int MaxUiAttempts { get; set; }

    public bool Strict { get; set; }

    public string? Browser { get; set; }

    public string Plugins { get; set; } = default!;

    public string? RunDir { get; set; }

    /// <summary>Aggregate: findings count by severity (critical, error, warn, info).</summary>
    public AuditRunCountsDto? Counts { get; set; }

    /// <summary>Aggregate: gaps count by risk level.</summary>
    public AuditRunGapCountsDto? GapCounts { get; set; }

    /// <summary>Duration in milliseconds, if available from run.</summary>
    public long? DurationMs { get; set; }

    /// <summary>Link stats from summary metrics, if available.</summary>
    public int? LinkSampled { get; set; }
    public int? LinkBroken { get; set; }
}

public sealed class AuditRunCountsDto
{
    public int Critical { get; set; }
    public int Error { get; set; }
    public int Warn { get; set; }
    public int Info { get; set; }
}

public sealed class AuditRunGapCountsDto
{
    public int Safe { get; set; }
    public int NeedsAllowlist { get; set; }
    public int Destructive { get; set; }
    public int RequiresAuth { get; set; }
}

