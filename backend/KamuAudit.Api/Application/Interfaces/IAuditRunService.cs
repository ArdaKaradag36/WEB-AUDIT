using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;

namespace KamuAudit.Api.Application.Interfaces;

public interface IAuditRunService
{
    Task<(AuditRunDetailDto? Detail, string? Error)> CreateAsync(
        Guid userId,
        CreateAuditRunRequest request,
        CancellationToken cancellationToken = default);

    Task<(AuditRunDetailDto? Detail, string? Error)> CreateWithCredentialsAsync(
        Guid userId,
        CreateAuditWithCredentialsRequest request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AuditRunSummaryDto>> GetListAsync(
        Guid? userId,
        bool isAdmin,
        Guid? systemId,
        string? status,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken = default);

    Task<AuditRunDetailDto?> GetByIdAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    Task<(PagedFindingsResponse? Response, bool NotFound)> GetFindingsAsync(
        Guid auditId,
        int page,
        int pageSize,
        string? severity,
        string? category,
        CancellationToken cancellationToken = default);

    Task<(PagedGapsResponse? Response, bool NotFound)> GetGapsAsync(
        Guid auditId,
        int page,
        int pageSize,
        string? riskLevel,
        string? reasonCode,
        CancellationToken cancellationToken = default);

    Task<(AuditSummaryResponse? Response, bool NotFound)> GetSummaryAsync(
        Guid auditId,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);
}
