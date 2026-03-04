namespace KamuAudit.Api.Contracts.Responses;

/// <summary>
/// Liste ekranı için hafif audit run özeti.
/// </summary>
public sealed class AuditRunSummaryDto
{
    public Guid Id { get; set; }

    public Guid? SystemId { get; set; }

    public string TargetUrl { get; set; } = default!;

    public string Status { get; set; } = default!;

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    /// <summary>High-level error classification when the run is failed or retried.</summary>
    public string? ErrorType { get; set; }
}

