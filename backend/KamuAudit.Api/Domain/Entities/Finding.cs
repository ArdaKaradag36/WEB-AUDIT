using System.Text.Json;

namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Rule engine tarafından üretilen bulgu (console/network/security vs).
/// </summary>
public sealed class Finding
{
    public Guid Id { get; set; }

    public Guid AuditRunId { get; set; }

    public AuditRun AuditRun { get; set; } = default!;

    public string RuleId { get; set; } = default!;

    public string Severity { get; set; } = default!;

    public string Category { get; set; } = default!;

    public string Title { get; set; } = default!;

    public string Detail { get; set; } = default!;

    public string? Remediation { get; set; }

    /// <summary>
    /// Ek detayları tutmak için JSONB alanı (ör. sample loglar, sayılar).
    /// JsonDocument kullanıyoruz; Npgsql bunu jsonb'ye doğal map ediyor.
    /// </summary>
    public JsonDocument? Meta { get; set; }
}

