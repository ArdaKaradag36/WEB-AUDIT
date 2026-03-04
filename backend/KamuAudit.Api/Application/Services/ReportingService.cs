using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Contracts.Responses;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace KamuAudit.Api.Application.Services;

public sealed class ReportingService : IReportingService
{
    private readonly KamuAuditDbContext _db;

    public ReportingService(KamuAuditDbContext db)
    {
        _db = db;
    }

    public async Task<ReportSummaryResponse> GetSummaryAsync(
        Guid? userId,
        bool isAdmin,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken = default)
    {
        var runsQuery = _db.AuditRuns.AsNoTracking().AsQueryable();

        if (!isAdmin && userId.HasValue)
        {
            runsQuery = runsQuery.Where(a => a.UserId == userId.Value);
        }

        if (from.HasValue)
        {
            runsQuery = runsQuery.Where(a => (a.StartedAt ?? a.FinishedAt) >= from);
        }

        if (to.HasValue)
        {
            runsQuery = runsQuery.Where(a => (a.StartedAt ?? a.FinishedAt) <= to);
        }

        var totalRuns = await runsQuery.CountAsync(cancellationToken);

        var completedRuns = await runsQuery
            .Where(a => a.Status == "completed")
            .ToListAsync(cancellationToken);

        double successRate = 0d;
        double? avgDurationMs = null;

        if (totalRuns > 0)
        {
            successRate = (double)completedRuns.Count / totalRuns;
        }

        var durations = completedRuns
            .Where(r => r.DurationMs.HasValue)
            .Select(r => (double)r.DurationMs!.Value)
            .ToList();

        if (durations.Count > 0)
        {
            avgDurationMs = durations.Average();
        }

        // Findings grouped by category for the same run set.
        var runIds = await runsQuery
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        var findingCounts = await _db.Findings
            .AsNoTracking()
            .Where(f => runIds.Contains(f.AuditRunId))
            .GroupBy(f => f.Category)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var dict = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var fc in findingCounts)
        {
            dict[fc.Category] = fc.Count;
        }

        return new ReportSummaryResponse
        {
            TotalRuns = totalRuns,
            SuccessRate = successRate,
            AvgDurationMs = avgDurationMs,
            FindingCountByCategory = dict
        };
    }
}

