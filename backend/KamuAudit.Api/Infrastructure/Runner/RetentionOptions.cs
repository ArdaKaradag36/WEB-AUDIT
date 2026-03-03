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
    /// Number of days to keep completed/failed runs before they are eligible for deletion.
    /// Default is 90 days.
    /// </summary>
    public int KeepDays { get; set; } = 90;
}

