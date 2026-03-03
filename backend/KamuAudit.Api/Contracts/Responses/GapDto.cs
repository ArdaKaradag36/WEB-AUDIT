namespace KamuAudit.Api.Contracts.Responses;

public sealed class GapDto
{
    public Guid Id { get; set; }
    public string ElementId { get; set; } = default!;
    public string? HumanName { get; set; }
    public string ReasonCode { get; set; } = default!;
    public string? ActionHint { get; set; }
    public string RiskLevel { get; set; } = default!;
    public string? RecommendedScript { get; set; }
    public object? Evidence { get; set; }
}
