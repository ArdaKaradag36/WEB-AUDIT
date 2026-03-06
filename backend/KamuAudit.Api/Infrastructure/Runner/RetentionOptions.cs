namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// Retention settings for pruning old audit runs and their reports.
/// </summary>
public sealed class RetentionOptions
{
    /// <summary>
    /// Enables the periodic retention cleanup job when true.
    /// Default is false (no automatic deletions).
    /// </summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// Number of days to keep audit_runs rows (logical audit history) before they are eligible for deletion.
    /// Default is 90 days.
    /// </summary>
    public int AuditRunsDays { get; set; } = 90;

    /// <summary>
    /// Number of days to keep runner artifacts on disk (summary.json, traces, screenshots).
    /// Default is 30 days.
    /// </summary>
    public int ArtifactsDays { get; set; } = 30;

    /// <summary>
    /// When true, cleanup runs in dry-run mode: no deletions, only log what would happen.
    /// </summary>
    public bool DryRun { get; set; } = false;

    /// <summary>
    /// Legacy configuration for retention window in days.
    /// If set &gt; 0, it is used as a fallback when the new fields are not configured.
    /// </summary>
    public int KeepDays { get; set; } = 90;
}

