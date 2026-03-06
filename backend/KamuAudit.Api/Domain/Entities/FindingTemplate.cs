using System.Text.Json;

namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Normalized finding template (deduplicated by fingerprint across runs).
/// One template represents a logical finding type identified by fingerprint.
/// </summary>
public sealed class FindingTemplate
{
    public Guid Id { get; set; }

    /// <summary>
    /// Stable fingerprint computed from ruleId + canonicalUrl + parameter + evidence key.
    /// </summary>
    public string Fingerprint { get; set; } = default!;

    public string RuleId { get; set; } = default!;

    public string Severity { get; set; } = default!;

    public string Category { get; set; } = default!;

    public string Title { get; set; } = default!;

    public string CanonicalUrl { get; set; } = default!;

    public string Parameter { get; set; } = default!;

    public string? Remediation { get; set; }

    /// <summary>
    /// Most recent execution-level status observed for this template.
    /// </summary>
    public FindingStatus Status { get; set; } = FindingStatus.OK;

    /// <summary>
    /// Most common or last observed skip reason when Status == SKIPPED.
    /// </summary>
    public SkipReason? SkipReason { get; set; }

    public DateTimeOffset FirstSeenAt { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }

    public long OccurrenceCount { get; set; }

    /// <summary>
    /// Count of occurrences that appear "safe" (e.g. low severity) in recent history.
    /// Used to suggest automatic risk downgrades.
    /// </summary>
    public int RecentSafeOccurrences { get; set; }

    /// <summary>
    /// When true, UI can highlight that this template is a candidate
    /// for severity/risk downgrading based on historical trend.
    /// </summary>
    public bool AutoRiskLowerSuggested { get; set; }

    /// <summary>
    /// Optional aggregated meta information (example evidence, sample URLs, etc).
    /// </summary>
    public JsonDocument? Meta { get; set; }
}

