namespace KamuAudit.Api.Contracts.Responses;

public sealed class PagedFindingsResponse
{
    public IReadOnlyList<FindingDto> Items { get; set; } = Array.Empty<FindingDto>();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }

    /// <summary>
    /// Grouped view of findings for the same audit run (e.g. "X occurrences of this type").
    /// Useful for UI summaries like "Bu tipten X adet".
    /// </summary>
    public IReadOnlyList<FindingGroupDto> Groups { get; set; } = Array.Empty<FindingGroupDto>();
}

public sealed class FindingGroupDto
{
    public string RuleId { get; set; } = default!;
    public string Severity { get; set; } = default!;
    public string Category { get; set; } = default!;
    public string Title { get; set; } = default!;
    public int Count { get; set; }
}
