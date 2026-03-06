namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// A single occurrence of a finding template in a specific audit run.
/// </summary>
public sealed class FindingInstance
{
    public Guid Id { get; set; }

    public Guid FindingTemplateId { get; set; }

    public FindingTemplate FindingTemplate { get; set; } = default!;

    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public string Url { get; set; } = default!;

    public string Parameter { get; set; } = default!;

    public DateTimeOffset DetectedAt { get; set; }

    /// <summary>
    /// Execution-level status for this particular occurrence.
    /// </summary>
    public FindingStatus Status { get; set; } = FindingStatus.OK;

    /// <summary>
    /// Optional skip reason for this occurrence.
    /// </summary>
    public SkipReason? SkipReason { get; set; }
}

