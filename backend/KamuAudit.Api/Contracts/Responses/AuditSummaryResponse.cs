namespace KamuAudit.Api.Contracts.Responses;

/// <summary>
/// Aggregate summary for an audit run (from DB and/or summary.json).
/// </summary>
public sealed class AuditSummaryResponse
{
    public Guid AuditRunId { get; set; }
    public int FindingsTotal { get; set; }
    public int GapsTotal { get; set; }
    public int CriticalCount { get; set; }
    public int ErrorCount { get; set; }
    public int WarnCount { get; set; }
    public int InfoCount { get; set; }
    public int GapsByRiskSafe { get; set; }
    public int GapsByRiskNeedsAllowlist { get; set; }
    public int GapsByRiskDestructive { get; set; }
    public int GapsByRiskRequiresAuth { get; set; }
    public long? DurationMs { get; set; }
    public int? LinkSampled { get; set; }
    public int? LinkBroken { get; set; }

    /// <summary>Total UI elements discovered during the run (from coverage metrics).</summary>
    public int? TotalElements { get; set; }

    /// <summary>Number of elements that were actually tested.</summary>
    public int? TestedElements { get; set; }

    /// <summary>Number of elements that were skipped (e.g. out of viewport, auth, destructive risk).</summary>
    public int? SkippedElements { get; set; }

    /// <summary>Coverage ratio in [0,1]: TestedElements / TotalElements.</summary>
    public double? CoverageRatio { get; set; }

    /// <summary>Maximum console error count observed per page (approximation from findings metadata).</summary>
    public int? MaxConsoleErrorPerPage { get; set; }

    /// <summary>URL path that appears most frequently in link/network failures (best-effort).</summary>
    public string? TopFailingUrl { get; set; }

    /// <summary>Most common gap ReasonCode (human-ready identifier).</summary>
    public string? MostCommonGapReason { get; set; }

    /// <summary>
    /// Number of findings in this run that were explicitly marked as SKIPPED (e.g. due to network policy).
    /// </summary>
    public int SkippedFindings { get; set; }
}
