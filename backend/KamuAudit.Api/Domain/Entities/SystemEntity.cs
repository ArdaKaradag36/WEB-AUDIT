namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Denetlenen uygulama / sistem (ör. NVI, Roketsan Kurumsal, AirSense).
/// </summary>
public sealed class SystemEntity
{
    public Guid Id { get; set; }

    public string Name { get; set; } = default!;

    public string BaseUrl { get; set; } = default!;

    public string? Description { get; set; }

    public ICollection<AuditRun> AuditRuns { get; set; } = new List<AuditRun>();
}

