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
}
