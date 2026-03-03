namespace KamuAudit.Api.Contracts.Responses;

public sealed class FindingDto
{
    public Guid Id { get; set; }
    public string RuleId { get; set; } = default!;
    public string Severity { get; set; } = default!;
    public string Category { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Detail { get; set; } = default!;
    public string? Remediation { get; set; }
    public object? Meta { get; set; }
}
