namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Normalized view of UI gaps for a single audit run, grouped by HumanName + ReasonCode.
/// Used for reporting/export to avoid duplicate gap spam.
/// </summary>
public sealed class GapTemplate
{
    public Guid Id { get; set; }

    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public string? HumanName { get; set; }

    public string ReasonCode { get; set; } = default!;

    public string RiskLevel { get; set; } = default!;

    /// <summary>Total number of individual gaps that were aggregated into this template.</summary>
    public int OccurrenceCount { get; set; }

    /// <summary>Example URL where this gap was observed (if available from evidence).</summary>
    public string? ExampleUrl { get; set; }
}

