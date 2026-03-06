namespace KamuAudit.Api.Contracts.Responses;

/// <summary>
/// Consolidated JSON report for a single audit run.
/// Combines scan info, coverage and findings breakdown in a Nessus-like shape.
/// </summary>
public sealed class AuditReportResponse
{
    public Guid AuditRunId { get; set; }
    public string TargetUrl { get; set; } = default!;
    public string Status { get; set; } = default!;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    public bool SafeMode { get; set; }
    public int MaxLinks { get; set; }
    public int MaxUiAttempts { get; set; }
    public bool Strict { get; set; }
    public string? Browser { get; set; }
    public string Plugins { get; set; } = "[]";

    public long? DurationMs { get; set; }

    public ExecSummaryDto ExecSummary { get; set; } = new();
    public CoverageSummaryDto Coverage { get; set; } = new();
    public FindingsBreakdownDto FindingsBreakdown { get; set; } = new();

    public IReadOnlyList<ReportFindingGroupDto> TopFindings { get; set; } = Array.Empty<ReportFindingGroupDto>();

    public SkippedSummaryDto SkippedSummary { get; set; } = new();

    public IReadOnlyList<RemediationItemDto> RemediationPlan { get; set; } = Array.Empty<RemediationItemDto>();

    public EvidenceLinksDto EvidenceLinks { get; set; } = new();
}

public sealed class ExecSummaryDto
{
    /// <summary>Web-specific risk score in [0,10], inspired by CVSS.</summary>
    public double? WebScore { get; set; }

    public int TotalFindings { get; set; }
    public int Critical { get; set; }
    public int Error { get; set; }
    public int Warn { get; set; }
    public int Info { get; set; }

    public int TotalGaps { get; set; }
}

public sealed class CoverageSummaryDto
{
    public int? PagesScanned { get; set; }
    public int? LinkSampled { get; set; }
    public int? LinkBroken { get; set; }

    public int? TotalElements { get; set; }
    public int? TestedElements { get; set; }
    public double? CoverageRatio { get; set; }
}

public sealed class FindingsBreakdownDto
{
    public Dictionary<string, int> BySeverity { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> ByCategory { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ReportFindingGroupDto
{
    public string Fingerprint { get; set; } = default!;
    public string RuleId { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Category { get; set; } = default!;
    public string WorstSeverity { get; set; } = default!;
    public int Count { get; set; }
}

public sealed class SkippedSummaryDto
{
    public int TotalSkipped { get; set; }
    public Dictionary<string, int> ByReason { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class RemediationItemDto
{
    public string RuleId { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Severity { get; set; } = default!;
    public string? Remediation { get; set; }
    public int Count { get; set; }
}

public sealed class EvidenceLinksDto
{
    public string? TraceUrl { get; set; }
    public IReadOnlyList<string> ScreenshotUrls { get; set; } = Array.Empty<string>();
    public string? ConsoleUrl { get; set; }
    public string? NetworkUrl { get; set; }
    public string? RequestFailedUrl { get; set; }
}

