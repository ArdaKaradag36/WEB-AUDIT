namespace KamuAudit.Api.Contracts.Responses;

public sealed class PagedFindingsResponse
{
    public IReadOnlyList<FindingDto> Items { get; set; } = Array.Empty<FindingDto>();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}
