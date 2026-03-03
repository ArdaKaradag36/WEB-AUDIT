using System.Text.Json;

namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Test edilemeyen veya başarısız UI öğesi için gap kaydı.
/// </summary>
public sealed class Gap
{
    public Guid Id { get; set; }

    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public string ElementId { get; set; } = default!;

    public string? HumanName { get; set; }

    public string ReasonCode { get; set; } = default!;

    public string? ActionHint { get; set; }

    public string RiskLevel { get; set; } = default!;

    public string? RecommendedScript { get; set; }

    /// <summary>
    /// Evidence JSONB; locator strategy, selector count, visibility vb.
    /// </summary>
    public JsonDocument? Evidence { get; set; }
}

