namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Persisted UI coverage metrics for a single audit run.
/// Derived from runner summary.json (uiCoverage section).
/// </summary>
public sealed class AuditCoverage
{
    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public int TotalElements { get; set; }

    public int TestedElements { get; set; }

    public int SkippedElements { get; set; }

    /// <summary>TestedElements / TotalElements as a ratio in [0,1].</summary>
    public double CoverageRatio { get; set; }
}

