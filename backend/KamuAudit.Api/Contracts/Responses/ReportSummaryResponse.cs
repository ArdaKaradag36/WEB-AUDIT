namespace KamuAudit.Api.Contracts.Responses;

/// <summary>
/// Aggregated reporting summary for a given time window.
/// Used for dashboard trend charts (7-day / 30-day).
/// </summary>
public sealed class ReportSummaryResponse
{
    public int TotalRuns { get; set; }

    /// <summary>Ratio in [0,1] of runs that completed successfully.</summary>
    public double SuccessRate { get; set; }

    /// <summary>Average duration in milliseconds across completed runs (if any).</summary>
    public double? AvgDurationMs { get; set; }

    /// <summary>Finding count grouped by category (e.g. network, console, link, security_headers).</summary>
    public Dictionary<string, int> FindingCountByCategory { get; set; } = new();
}

