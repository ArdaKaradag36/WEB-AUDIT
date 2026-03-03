using System.Text.Json;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Contracts.Requests;
using KamuAudit.Api.Contracts.Responses;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace KamuAudit.Api.Application.Services;

public sealed class AuditRunService : IAuditRunService
{
    private readonly KamuAuditDbContext _db;
    private readonly ICredentialProtector _credentialProtector;

    public AuditRunService(KamuAuditDbContext db, ICredentialProtector credentialProtector)
    {
        _db = db;
        _credentialProtector = credentialProtector;
    }

    public async Task<(AuditRunDetailDto? Detail, string? Error)> CreateAsync(
        Guid userId,
        CreateAuditRunRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.TargetUrl))
            return (null, "targetUrl boş olamaz.");
        if (!Uri.TryCreate(request.TargetUrl, UriKind.Absolute, out _))
            return (null, "targetUrl geçerli bir mutlak URL olmalıdır.");

        var auditRun = new AuditRun
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SystemId = request.SystemId,
            TargetUrl = request.TargetUrl.Trim(),
            Status = "queued",
            StartedAt = null,
            FinishedAt = null,
            SafeMode = request.SafeMode ?? true,
            MaxLinks = request.MaxLinks ?? 20,
            MaxUiAttempts = request.MaxUiAttempts ?? 30,
            Strict = request.Strict ?? false,
            Browser = string.IsNullOrWhiteSpace(request.Browser) ? "chromium" : request.Browser.Trim(),
            Plugins = string.IsNullOrWhiteSpace(request.Plugins) ? "[]" : ToJsonArrayString(request.Plugins),
            RunDir = null
        };

        _db.AuditRuns.Add(auditRun);
        await _db.SaveChangesAsync(cancellationToken);

        return (ToDetailDto(auditRun), null);
    }

    public async Task<(AuditRunDetailDto? Detail, string? Error)> CreateWithCredentialsAsync(
        Guid userId,
        CreateAuditWithCredentialsRequest request,
        CancellationToken cancellationToken = default)
    {
        var (detail, error) = await CreateAsync(userId, request.Audit, cancellationToken);
        if (detail is null || !string.IsNullOrWhiteSpace(error))
        {
            return (detail, error);
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            // No credential payload; behave like a normal audit creation.
            return (detail, error);
        }

        var encrypted = _credentialProtector.Protect(request.Password);

        var credential = new AuditTargetCredential
        {
            Id = Guid.NewGuid(),
            AuditRunId = detail.Id,
            Username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim(),
            EncryptedPassword = encrypted,
            TwoFactorNote = string.IsNullOrWhiteSpace(request.TwoFactorNote) ? null : request.TwoFactorNote,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.AuditTargetCredentials.Add(credential);
        await _db.SaveChangesAsync(cancellationToken);

        return (detail, error);
    }

    public async Task<IReadOnlyList<AuditRunSummaryDto>> GetListAsync(
        Guid? userId,
        bool isAdmin,
        Guid? systemId,
        string? status,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken cancellationToken = default)
    {
        var query = _db.AuditRuns.AsQueryable();

        if (!isAdmin && userId.HasValue)
        {
            query = query.Where(a => a.UserId == userId.Value);
        }
        if (systemId.HasValue) query = query.Where(a => a.SystemId == systemId.Value);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(a => a.Status == status);
        if (from.HasValue) query = query.Where(a => (a.StartedAt ?? a.FinishedAt) >= from);
        if (to.HasValue) query = query.Where(a => (a.StartedAt ?? a.FinishedAt) <= to);

        return await query
            .OrderByDescending(a => a.StartedAt ?? a.FinishedAt ?? DateTimeOffset.MinValue)
            .Select(a => new AuditRunSummaryDto
            {
                Id = a.Id,
                SystemId = a.SystemId,
                TargetUrl = a.TargetUrl,
                Status = a.Status,
                StartedAt = a.StartedAt,
                FinishedAt = a.FinishedAt
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<AuditRunDetailDto?> GetByIdAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var audit = await _db.AuditRuns.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (audit is null) return null;

        if (!isAdmin && userId.HasValue && audit.UserId.HasValue && audit.UserId != userId)
        {
            return null;
        }

        var severityCounts = await _db.Findings
            .Where(f => f.AuditRunId == id)
            .GroupBy(f => f.Severity)
            .Select(g => new { Severity = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var riskCounts = await _db.Gaps
            .Where(g => g.AuditRunId == id)
            .GroupBy(g => g.RiskLevel)
            .Select(g => new { RiskLevel = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var dto = ToDetailDto(audit);
        dto.Counts = new AuditRunCountsDto
        {
            Critical = severityCounts.FirstOrDefault(x => x.Severity == "critical")?.Count ?? 0,
            Error = severityCounts.FirstOrDefault(x => x.Severity == "error")?.Count ?? 0,
            Warn = severityCounts.FirstOrDefault(x => x.Severity == "warn")?.Count ?? 0,
            Info = severityCounts.FirstOrDefault(x => x.Severity == "info")?.Count ?? 0
        };
        dto.GapCounts = new AuditRunGapCountsDto
        {
            Safe = riskCounts.FirstOrDefault(x => x.RiskLevel == "safe")?.Count ?? 0,
            NeedsAllowlist = riskCounts.FirstOrDefault(x => x.RiskLevel == "needs_allowlist")?.Count ?? 0,
            Destructive = riskCounts.FirstOrDefault(x => x.RiskLevel == "destructive")?.Count ?? 0,
            RequiresAuth = riskCounts.FirstOrDefault(x => x.RiskLevel == "requires_auth")?.Count ?? 0
        };
        dto.DurationMs = audit.DurationMs;
        dto.LinkSampled = audit.LinkSampled;
        dto.LinkBroken = audit.LinkBroken;
        return dto;
    }

    public async Task<(PagedFindingsResponse? Response, bool NotFound)> GetFindingsAsync(
        Guid auditId,
        int page,
        int pageSize,
        string? severity,
        string? category,
        CancellationToken cancellationToken = default)
    {
        // Ownership checks are enforced at controller level through GetSummary/GetById;
        // findings/gaps access is guarded by auth/policies.
        if (await _db.AuditRuns.FindAsync([auditId], cancellationToken) is null)
            return (null, true);

        var query = _db.Findings.AsNoTracking().Where(f => f.AuditRunId == auditId);
        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(f => f.Severity == severity);
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(f => f.Category == category);

        var total = await query.CountAsync(cancellationToken);
        var size = Math.Clamp(pageSize, 1, 200);
        var items = await query
            .OrderBy(f => f.Severity).ThenBy(f => f.RuleId)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken);

        return (new PagedFindingsResponse
        {
            Items = items.Select(f => new FindingDto
            {
                Id = f.Id,
                RuleId = f.RuleId,
                Severity = f.Severity,
                Category = f.Category,
                Title = f.Title,
                Detail = f.Detail,
                Remediation = f.Remediation,
                Meta = f.Meta?.RootElement
            }).ToList(),
            TotalCount = total,
            Page = page,
            PageSize = size
        }, false);
    }

    public async Task<(PagedGapsResponse? Response, bool NotFound)> GetGapsAsync(
        Guid auditId,
        int page,
        int pageSize,
        string? riskLevel,
        string? reasonCode,
        CancellationToken cancellationToken = default)
    {
        if (await _db.AuditRuns.FindAsync([auditId], cancellationToken) is null)
            return (null, true);

        var query = _db.Gaps.AsNoTracking().Where(g => g.AuditRunId == auditId);
        if (!string.IsNullOrWhiteSpace(riskLevel)) query = query.Where(g => g.RiskLevel == riskLevel);
        if (!string.IsNullOrWhiteSpace(reasonCode)) query = query.Where(g => g.ReasonCode == reasonCode);

        var total = await query.CountAsync(cancellationToken);
        var size = Math.Clamp(pageSize, 1, 200);
        var items = await query
            .OrderBy(g => g.RiskLevel).ThenBy(g => g.ElementId)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken);

        return (new PagedGapsResponse
        {
            Items = items.Select(g => new GapDto
            {
                Id = g.Id,
                ElementId = g.ElementId,
                HumanName = g.HumanName,
                ReasonCode = g.ReasonCode,
                ActionHint = g.ActionHint,
                RiskLevel = g.RiskLevel,
                RecommendedScript = g.RecommendedScript,
                Evidence = g.Evidence?.RootElement
            }).ToList(),
            TotalCount = total,
            Page = page,
            PageSize = size
        }, false);
    }

    public async Task<(AuditSummaryResponse? Response, bool NotFound)> GetSummaryAsync(
        Guid auditId,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var audit = await _db.AuditRuns.AsNoTracking().FirstOrDefaultAsync(a => a.Id == auditId, cancellationToken);
        if (audit is null) return (null, true);

        if (!isAdmin && userId.HasValue && audit.UserId.HasValue && audit.UserId != userId)
        {
            return (null, true);
        }

        var severityCounts = await _db.Findings
            .Where(f => f.AuditRunId == auditId)
            .GroupBy(f => f.Severity)
            .Select(g => new { Severity = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var riskCounts = await _db.Gaps
            .Where(g => g.AuditRunId == auditId)
            .GroupBy(g => g.RiskLevel)
            .Select(g => new { RiskLevel = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        return (new AuditSummaryResponse
        {
            AuditRunId = auditId,
            FindingsTotal = await _db.Findings.CountAsync(f => f.AuditRunId == auditId, cancellationToken),
            GapsTotal = await _db.Gaps.CountAsync(g => g.AuditRunId == auditId, cancellationToken),
            CriticalCount = severityCounts.FirstOrDefault(x => x.Severity == "critical")?.Count ?? 0,
            ErrorCount = severityCounts.FirstOrDefault(x => x.Severity == "error")?.Count ?? 0,
            WarnCount = severityCounts.FirstOrDefault(x => x.Severity == "warn")?.Count ?? 0,
            InfoCount = severityCounts.FirstOrDefault(x => x.Severity == "info")?.Count ?? 0,
            GapsByRiskSafe = riskCounts.FirstOrDefault(x => x.RiskLevel == "safe")?.Count ?? 0,
            GapsByRiskNeedsAllowlist = riskCounts.FirstOrDefault(x => x.RiskLevel == "needs_allowlist")?.Count ?? 0,
            GapsByRiskDestructive = riskCounts.FirstOrDefault(x => x.RiskLevel == "destructive")?.Count ?? 0,
            GapsByRiskRequiresAuth = riskCounts.FirstOrDefault(x => x.RiskLevel == "requires_auth")?.Count ?? 0,
            DurationMs = audit.DurationMs,
            LinkSampled = audit.LinkSampled,
            LinkBroken = audit.LinkBroken
        }, false);
    }

    private static AuditRunDetailDto ToDetailDto(AuditRun a)
    {
        return new AuditRunDetailDto
        {
            Id = a.Id,
            SystemId = a.SystemId,
            TargetUrl = a.TargetUrl,
            Status = a.Status,
            StartedAt = a.StartedAt,
            FinishedAt = a.FinishedAt,
            SafeMode = a.SafeMode,
            MaxLinks = a.MaxLinks,
            MaxUiAttempts = a.MaxUiAttempts,
            Strict = a.Strict,
            Browser = a.Browser,
            Plugins = a.Plugins,
            RunDir = a.RunDir
        };
    }


    private static string ToJsonArrayString(string csv)
    {
        var items = csv
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct()
            .ToArray();
        return JsonSerializer.Serialize(items);
    }
}
