using KamuAudit.Api.Contracts.Responses;

namespace KamuAudit.Api.Application.Interfaces;

public interface IReportingService
{
    Task<ReportSummaryResponse> GetSummaryAsync(
        Guid? userId,
        bool isAdmin,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken = default);
}

