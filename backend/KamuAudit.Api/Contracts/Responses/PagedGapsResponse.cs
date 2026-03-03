namespace KamuAudit.Api.Contracts.Responses;

public sealed class PagedGapsResponse
{
    public IReadOnlyList<GapDto> Items { get; set; } = Array.Empty<GapDto>();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}
