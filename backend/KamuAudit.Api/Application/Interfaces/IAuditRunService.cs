using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;

namespace KamuAudit.Api.Application.Interfaces;

public interface IAuditRunService
{
    Task<(AuditRunDetailDto? Detail, string? Error, bool FromCache)> CreateAsync(
        Guid userId,
        CreateAuditRunRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken = default);

    Task<(AuditRunDetailDto? Detail, string? Error, bool FromCache)> CreateWithCredentialsAsync(
        Guid userId,
        CreateAuditWithCredentialsRequest request,
        string? idempotencyKey,
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
        string[]? severity,
        string[]? category,
        string[]? status,
        string[]? skipReason,
        string? url,
        double? minConfidence,
        string? sort,
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

    /// <summary>
    /// Returns a consolidated JSON report for the given audit run (summary + breakdown + evidence links).
    /// </summary>
    Task<(AuditReportResponse? Report, bool NotFound)> GetReportAsync(
        Guid auditId,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes an audit run and its related data if the caller is allowed.
    /// Returns false when the run does not exist or caller has no access.
    /// </summary>
    Task<bool> DeleteAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns a CSV representation of normalized gaps (GapTemplates) for the given audit run.
    /// </summary>
    Task<(string? Csv, bool NotFound)> GetGapsCsvAsync(
        Guid auditId,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Attempts to cancel a queued audit run owned by the given user (or any run for admins).
    /// Returns false when the run does not exist or cannot be canceled.
    /// </summary>
    Task<bool> CancelAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);
}
