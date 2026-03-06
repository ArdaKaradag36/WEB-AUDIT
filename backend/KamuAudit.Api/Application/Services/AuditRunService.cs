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

        public async Task<(AuditRunDetailDto? Detail, string? Error, bool FromCache)> CreateAsync(
        Guid userId,
        CreateAuditRunRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.TargetUrl))
            return (null, "targetUrl boş olamaz.", false);
        if (!Uri.TryCreate(request.TargetUrl, UriKind.Absolute, out var targetUri))
            return (null, "targetUrl geçerli bir mutlak URL olmalıdır.", false);

        if (!Infrastructure.Security.TargetUrlGuard.IsAllowed(targetUri))
            return (null, "Bu targetUrl izin verilen adresler dışında (ör. localhost veya metadata IP'leri). Güvenlik politikası gereği reddedildi.", false);

        // Idempotency handling: same user + key + request hash => same AuditRun.
        var requestHash = ComputeRequestHash(request);

        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var nowIdem = DateTimeOffset.UtcNow;

            var existing = await _db.IdempotencyKeys
                .Include(k => k.AuditRun)
                .FirstOrDefaultAsync(
                    k => k.UserId == userId && k.Key == idempotencyKey,
                    cancellationToken);

            if (existing is not null)
            {
                // Eğer key süresi dolmuşsa, bu kaydı yok say ve yeni bir audit run oluştur.
                if (existing.ExpiresAt <= nowIdem)
                {
                    // Temizlik job'u da ayrıca çalışacak, burada sadece davranışı "yeni create" gibi yapıyoruz.
                }
                else
                {
                    if (!string.Equals(existing.RequestHash, requestHash, StringComparison.Ordinal))
                    {
                        return (null, "Idempotency-Key already used with a different request payload.", false);
                    }

                    if (existing.AuditRun is null)
                    {
                        var audit = await _db.AuditRuns.FindAsync([existing.AuditRunId], cancellationToken);
                        if (audit is null)
                        {
                            return (null, "Idempotent mapping exists but target audit run is missing.", false);
                        }

                        return (ToDetailDto(audit), null, true);
                    }

                    return (ToDetailDto(existing.AuditRun), null, true);
                }
            }
        }

        var now = DateTimeOffset.UtcNow;
        var auditRun = new AuditRun
        {
            Id = Guid.NewGuid(),
            CreatedAt = now,
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

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);

        _db.AuditRuns.Add(auditRun);

        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var key = new IdempotencyKey
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Key = idempotencyKey!,
                RequestHash = requestHash,
                AuditRunId = auditRun.Id,
                CreatedAt = now,
                ExpiresAt = now.AddHours(24),
            };
            _db.IdempotencyKeys.Add(key);
        }

        await _db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        return (ToDetailDto(auditRun), null, false);
    }

    public async Task<(AuditRunDetailDto? Detail, string? Error, bool FromCache)> CreateWithCredentialsAsync(
        Guid userId,
        CreateAuditWithCredentialsRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        var (detail, error, fromCache) = await CreateAsync(userId, request.Audit, idempotencyKey, cancellationToken);
        if (detail is null || !string.IsNullOrWhiteSpace(error))
        {
            return (detail, error, fromCache);
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            // No credential payload; behave like a normal audit creation.
            return (detail, error, fromCache);
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

        return (detail, error, fromCache);
    }

    private static string ComputeRequestHash(CreateAuditRunRequest request)
    {
        var json = JsonSerializer.Serialize(request, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        });

        using var sha = System.Security.Cryptography.SHA256.Create();
        var bytes = System.Text.Encoding.UTF8.GetBytes(json);
        var hash = sha.ComputeHash(bytes);
        return Convert.ToHexString(hash);
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
                FinishedAt = a.FinishedAt,
                ErrorType = null
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
        string[]? severity,
        string[]? category,
        string[]? status,
        string[]? skipReason,
        string? url,
        double? minConfidence,
        string? sort,
        CancellationToken cancellationToken = default)
    {
        // Ownership checks are enforced at controller level through GetSummary/GetById;
        // findings/gaps access is guarded by auth/policies.
        if (await _db.AuditRuns.FindAsync([auditId], cancellationToken) is null)
            return (null, true);

        var query = _db.Findings.AsNoTracking().Where(f => f.AuditRunId == auditId);

        if (severity is { Length: > 0 })
        {
            query = query.Where(f => severity.Contains(f.Severity));
        }

        if (category is { Length: > 0 })
        {
            query = query.Where(f => category.Contains(f.Category));
        }

        if (status is { Length: > 0 })
        {
            var parsed = status
                .Select(s => Enum.TryParse<FindingStatus>(s, true, out var v) ? v : (FindingStatus?)null)
                .Where(v => v.HasValue)
                .Select(v => v!.Value)
                .ToArray();
            if (parsed.Length > 0)
            {
                query = query.Where(f => parsed.Contains(f.Status));
            }
        }

        if (skipReason is { Length: > 0 })
        {
            var parsed = skipReason
                .Select(s => Enum.TryParse<SkipReason>(s, true, out var v) ? v : (SkipReason?)null)
                .Where(v => v.HasValue)
                .Select(v => v!.Value)
                .ToArray();
            if (parsed.Length > 0)
            {
                query = query.Where(f => f.SkipReason != null && parsed.Contains(f.SkipReason.Value));
            }
        }

        if (!string.IsNullOrWhiteSpace(url))
        {
            query = query.Where(f => f.AuditRun.TargetUrl.Contains(url));
        }

        if (minConfidence.HasValue)
        {
            query = query.Where(f => f.Confidence >= minConfidence.Value);
        }

        // Sorting
        query = sort switch
        {
            "severity_desc" => query.OrderByDescending(f => f.Severity).ThenBy(f => f.RuleId),
            "newest" => query.OrderByDescending(f => f.Id),
            _ => query.OrderBy(f => f.Severity).ThenBy(f => f.RuleId),
        };

        var total = await query.CountAsync(cancellationToken);
        var size = Math.Clamp(pageSize, 1, 200);
        var baseQuery = query;

        var items = await baseQuery
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken);

        // Grouped counts per rule/category/title for "Bu tipten X adet" UI (respecting filters).
        var grouped = await baseQuery
            .GroupBy(f => new { f.RuleId, f.Severity, f.Category, f.Title })
            .Select(g => new FindingGroupDto
            {
                RuleId = g.Key.RuleId,
                Severity = g.Key.Severity,
                Category = g.Key.Category,
                Title = g.Key.Title,
                Count = g.Count()
            })
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
                Meta = f.Meta?.RootElement,
                Status = f.Status.ToString(),
                SkipReason = f.SkipReason?.ToString()
            }).ToList(),
            TotalCount = total,
            Page = page,
            PageSize = size,
            Groups = grouped
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

        // Most common gap reasonCode (for quick summary).
        var reasonCounts = await _db.Gaps
            .Where(g => g.AuditRunId == auditId)
            .GroupBy(g => g.ReasonCode)
            .Select(g => new { ReasonCode = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync(cancellationToken);
        var mostCommonGapReason = reasonCounts.FirstOrDefault()?.ReasonCode;

        // Approximate console error density and top failing URL from findings meta JSON.
        int? maxConsoleErrorPerPage = null;
        string? topFailingUrl = null;

        var consoleFinding = await _db.Findings
            .AsNoTracking()
            .Where(f => f.AuditRunId == auditId && f.RuleId == "console_rule" && f.Meta != null)
            .FirstOrDefaultAsync(cancellationToken);
        if (consoleFinding?.Meta is { } consoleMeta)
        {
            try
            {
                var root = consoleMeta.RootElement;
                if (root.TryGetProperty("consoleErrorCount", out var consoleErrorsProp) &&
                    consoleErrorsProp.ValueKind == System.Text.Json.JsonValueKind.Number &&
                    consoleErrorsProp.TryGetInt32(out var consoleErrorsVal))
                {
                    maxConsoleErrorPerPage = consoleErrorsVal;
                }
            }
            catch
            {
                // best-effort only
            }
        }

        var linkFinding = await _db.Findings
            .AsNoTracking()
            .Where(f => f.AuditRunId == auditId && f.RuleId == "link_rule" && f.Meta != null)
            .FirstOrDefaultAsync(cancellationToken);
        if (linkFinding?.Meta is { } linkMeta)
        {
            try
            {
                var root = linkMeta.RootElement;
                if (root.TryGetProperty("brokenSamples", out var brokenSamples) &&
                    brokenSamples.ValueKind == System.Text.Json.JsonValueKind.Array &&
                    brokenSamples.GetArrayLength() > 0)
                {
                    var sample = brokenSamples[0];
                    if (sample.TryGetProperty("url", out var urlProp) &&
                        urlProp.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        topFailingUrl = urlProp.GetString();
                    }
                }
            }
            catch
            {
                // best-effort only
            }
        }

        var skippedCount = await _db.Findings.CountAsync(
            f => f.AuditRunId == auditId &&
                 f.Status == FindingStatus.SKIPPED &&
                 f.SkipReason == SkipReason.NETWORK_POLICY,
            cancellationToken);

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
            LinkBroken = audit.LinkBroken,
            TotalElements = null,
            TestedElements = null,
            SkippedElements = null,
            CoverageRatio = null,
            MaxConsoleErrorPerPage = maxConsoleErrorPerPage,
            TopFailingUrl = topFailingUrl,
            MostCommonGapReason = mostCommonGapReason,
            SkippedFindings = skippedCount
        }, false);
    }

    public async Task<(AuditReportResponse? Report, bool NotFound)> GetReportAsync(
        Guid auditId,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var audit = await _db.AuditRuns.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == auditId, cancellationToken);
        if (audit is null) return (null, true);

        if (!isAdmin && userId.HasValue && audit.UserId.HasValue && audit.UserId != userId)
        {
            return (null, true);
        }

        var findings = await _db.Findings
            .AsNoTracking()
            .Where(f => f.AuditRunId == auditId)
            .ToListAsync(cancellationToken);

        var gapsTotal = await _db.Gaps.CountAsync(g => g.AuditRunId == auditId, cancellationToken);

        var bySeverity = findings
            .GroupBy(f => f.Severity)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var byCategory = findings
            .GroupBy(f => f.Category)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var critical = bySeverity.TryGetValue("critical", out var c) ? c : 0;
        var error = bySeverity.TryGetValue("error", out var e) ? e : 0;
        var warn = bySeverity.TryGetValue("warn", out var w) ? w : 0;
        var info = bySeverity.TryGetValue("info", out var i) ? i : 0;

        // WebScore: simple severity-weighted average in [0,10].
        static double ComputeWebScore(int critical, int error, int warn, int info)
        {
            var total = critical + error + warn + info;
            if (total == 0) return 0;
            var weighted = 4.0 * critical + 3.0 * error + 2.0 * warn + 1.0 * info;
            var severityScore = weighted / total; // between 1 and 4
            var webScore = severityScore * 2.5;   // scale to 0-10
            return Math.Clamp(webScore, 0, 10);
        }

        var webScore = ComputeWebScore(critical, error, warn, info);

        var totalSkipped = findings.Count(f => f.Status == FindingStatus.SKIPPED);
        var skippedByReason = findings
            .Where(f => f.Status == FindingStatus.SKIPPED && f.SkipReason != null)
            .GroupBy(f => f.SkipReason!.Value.ToString())
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var topTemplates = await _db.FindingInstances
            .AsNoTracking()
            .Where(i => i.AuditRunId == auditId)
            .Join(
                _db.FindingTemplates.AsNoTracking(),
                i => i.FindingTemplateId,
                t => t.Id,
                (i, t) => new { Instance = i, Template = t })
            .GroupBy(x => x.Template.Fingerprint)
            .Select(g => new ReportFindingGroupDto
            {
                Fingerprint = g.Key,
                RuleId = g.First().Template.RuleId,
                Title = g.First().Template.Title,
                Category = g.First().Template.Category,
                WorstSeverity = g.Max(x => x.Template.Severity),
                Count = g.Count()
            })
            .OrderByDescending(g => g.Count)
            .ThenByDescending(g => g.WorstSeverity)
            .Take(20)
            .ToListAsync(cancellationToken);

        var remediationPlan = findings
            .GroupBy(f => new { f.RuleId, f.Title, f.Severity, f.Remediation })
            .Select(g => new RemediationItemDto
            {
                RuleId = g.Key.RuleId,
                Title = g.Key.Title,
                Severity = g.Key.Severity,
                Remediation = g.Key.Remediation,
                Count = g.Count()
            })
            .OrderByDescending(r => r.Severity)
            .ThenByDescending(r => r.Count)
            .ToList();

        var evidence = BuildEvidenceLinks(audit);

        var report = new AuditReportResponse
        {
            AuditRunId = audit.Id,
            TargetUrl = audit.TargetUrl,
            Status = audit.Status,
            StartedAt = audit.StartedAt,
            FinishedAt = audit.FinishedAt,
            SafeMode = audit.SafeMode,
            MaxLinks = audit.MaxLinks,
            MaxUiAttempts = audit.MaxUiAttempts,
            Strict = audit.Strict,
            Browser = audit.Browser,
            Plugins = audit.Plugins,
            DurationMs = audit.DurationMs,
            ExecSummary = new ExecSummaryDto
            {
                WebScore = webScore,
                TotalFindings = findings.Count,
                Critical = critical,
                Error = error,
                Warn = warn,
                Info = info,
                TotalGaps = gapsTotal
            },
            Coverage = new CoverageSummaryDto
            {
                PagesScanned = null,
                LinkSampled = audit.LinkSampled,
                LinkBroken = audit.LinkBroken,
                TotalElements = null,
                TestedElements = null,
                CoverageRatio = null
            },
            FindingsBreakdown = new FindingsBreakdownDto
            {
                BySeverity = bySeverity,
                ByCategory = byCategory
            },
            TopFindings = topTemplates,
            SkippedSummary = new SkippedSummaryDto
            {
                TotalSkipped = totalSkipped,
                ByReason = skippedByReason
            },
            RemediationPlan = remediationPlan,
            EvidenceLinks = evidence
        };

        return (report, false);
    }

    private static EvidenceLinksDto BuildEvidenceLinks(AuditRun audit)
    {
        if (string.IsNullOrWhiteSpace(audit.RunDir))
        {
            return new EvidenceLinksDto();
        }

        // For now we expose relative paths under the run directory.
        // A file-serving layer (reverse proxy / static files) can map these to absolute URLs.
        var runDir = audit.RunDir.Replace("\\", "/").Trim('/');
        string PathFor(string fileName) => $"/reports/runs/{runDir}/{fileName}";

        return new EvidenceLinksDto
        {
            TraceUrl = PathFor("trace.zip"),
            ConsoleUrl = PathFor("console.json"),
            NetworkUrl = PathFor("network.json"),
            RequestFailedUrl = PathFor("request_failed.json"),
            ScreenshotUrls = Array.Empty<string>() // Could be populated by scanning artifacts if needed.
        };
    }

    public async Task<bool> DeleteAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var audit = await _db.AuditRuns.FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (audit is null)
        {
            return false;
        }

        if (!isAdmin && userId.HasValue && audit.UserId.HasValue && audit.UserId != userId)
        {
            // Çağıran bu run'a sahip değil; 404 gibi davran.
            return false;
        }

        _db.AuditRuns.Remove(audit);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<(string? Csv, bool NotFound)> GetGapsCsvAsync(
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

        // Group gaps on the fly by HumanName + ReasonCode + RiskLevel to avoid duplicate spam.
        var templates = await _db.Gaps
            .AsNoTracking()
            .Where(g => g.AuditRunId == auditId)
            .GroupBy(g => new { g.HumanName, g.ReasonCode, g.RiskLevel })
            .Select(g => new
            {
                g.Key.HumanName,
                g.Key.ReasonCode,
                g.Key.RiskLevel,
                OccurrenceCount = g.Count()
            })
            .ToListAsync(cancellationToken);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("HumanName,ReasonCode,RiskLevel,OccurrenceCount,ExampleUrl");

        foreach (var t in templates.OrderByDescending(t => t.OccurrenceCount))
        {
            static string Escape(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return "";
                var v = value.Replace("\"", "\"\"");
                return v.Contains(',') || v.Contains('\n') ? $"\"{v}\"" : v;
            }

            sb.Append(Escape(t.HumanName));
            sb.Append(',');
            sb.Append(Escape(t.ReasonCode));
            sb.Append(',');
            sb.Append(Escape(t.RiskLevel));
            sb.Append(',');
            sb.Append(t.OccurrenceCount.ToString(System.Globalization.CultureInfo.InvariantCulture));
            sb.Append(',');
            sb.Append("");
            sb.AppendLine();
        }

        return (sb.ToString(), false);
    }

    public async Task<bool> CancelAsync(
        Guid id,
        Guid? userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var run = await _db.AuditRuns.FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (run is null)
        {
            return false;
        }

        if (!isAdmin && userId.HasValue && run.UserId.HasValue && run.UserId != userId)
        {
            // 404 gibi davran.
            return false;
        }

        // Şimdilik yalnızca queued durumundaki run'lar iptal edilebilir.
        if (!string.Equals(run.Status, "queued", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        run.Status = "canceled";
        run.RetryAfterUtc = null;
        run.LeaseOwner = null;
        run.LeaseUntil = null;

        await _db.SaveChangesAsync(cancellationToken);
        return true;
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
            RunDir = a.RunDir,
            LastError = a.LastError,
            ErrorType = a.ErrorType,
            LastExitCode = a.LastExitCode,
            RetryCount = a.RetryCount
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
