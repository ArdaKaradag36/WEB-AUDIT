using System.Diagnostics;
using System.Text.Json;
using System.Security.Cryptography;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Monitoring;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace KamuAudit.Api.Infrastructure.Ingestion;

/// <summary>
/// Reads runner JSON reports from RunDir and persists Findings and Gaps for an audit run.
/// Idempotent: replaces any existing findings/gaps for the run in a single transaction.
/// </summary>
public sealed class AuditResultIngestor : IAuditResultIngestor
{
    private readonly KamuAuditDbContext _db;
    private readonly string _runnerWorkingDirectory;
    private readonly ILogger<AuditResultIngestor> _logger;
    private readonly ActivitySource _activitySource;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public AuditResultIngestor(
        KamuAuditDbContext db,
        IOptions<Infrastructure.Runner.AuditRunnerOptions> runnerOptions,
        ILogger<AuditResultIngestor> logger,
        ActivitySource activitySource)
    {
        _db = db;
        _runnerWorkingDirectory = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, runnerOptions.Value.WorkingDirectory));
        _logger = logger;
        _activitySource = activitySource;
    }

    /// <summary>
    /// Ingest summary.json and gaps.json for the given audit run.
    /// Run status and FinishedAt must be updated in the same transaction by the caller.
    /// Idempotent when files exist: replaces existing Findings/Gaps for this run from JSON.
    /// When summary.json is missing, existing data is preserved and ingestion is skipped.
    /// </summary>
    public async Task IngestAsync(Guid auditRunId, CancellationToken cancellationToken = default)
    {
        var run = await _db.AuditRuns
            .FirstOrDefaultAsync(a => a.Id == auditRunId, cancellationToken);

        if (run is null)
        {
            _logger.LogWarning("Audit run {AuditRunId} not found for ingestion.", auditRunId);
            AuditMetrics.IncrementIngestionFailures();
            return;
        }

        if (string.IsNullOrWhiteSpace(run.RunDir))
        {
            _logger.LogWarning("Audit run {AuditRunId} has no RunDir; skipping ingestion.", auditRunId);
            AuditMetrics.IncrementIngestionFailures();
            return;
        }

        var runDirFull = Path.GetFullPath(Path.Combine(_runnerWorkingDirectory, run.RunDir));
        if (!Directory.Exists(runDirFull))
        {
            _logger.LogWarning("RunDir does not exist for audit {AuditRunId}: {RunDir}", auditRunId, runDirFull);
            run.ErrorType ??= "IngestionError";
            AuditMetrics.IncrementIngestionFailures();
            return;
        }

        var completionMarkerPath = Path.Combine(runDirFull, "run.complete.json");
        if (!File.Exists(completionMarkerPath))
        {
            _logger.LogWarning(
                "Completion marker run.complete.json not found for audit run {AuditRunId} in RunDir {RunDir}. " +
                "Run will be marked as failed and ingestion skipped.",
                auditRunId, runDirFull);

            if (string.IsNullOrWhiteSpace(run.LastError))
            {
                run.LastError = $"Ingestion skipped: completion marker run.complete.json not found in {runDirFull}.";
            }

            run.ErrorType ??= "IngestionError";

            // For safety, mark the run as failed if it is still in a non-terminal state.
            if (!string.Equals(run.Status, "failed", StringComparison.OrdinalIgnoreCase))
            {
                run.Status = "failed";
            }

            await _db.SaveChangesAsync(cancellationToken);
            AuditMetrics.IncrementIngestionFailures();
            return;
        }

        var summaryPath = Path.Combine(runDirFull, "summary.json");
        var gapsPath = Path.Combine(runDirFull, "gaps.json");

        if (!File.Exists(summaryPath))
        {
            _logger.LogWarning(
                "summary.json not found for audit run {AuditRunId} in RunDir {RunDir}. Existing findings/gaps will be preserved.",
                auditRunId, runDirFull);

            if (string.IsNullOrWhiteSpace(run.LastError))
            {
                run.LastError = $"Ingestion skipped: summary.json not found in {runDirFull}.";
            }

            run.ErrorType ??= "IngestionError";

            AuditMetrics.IncrementIngestionFailures();
            return;
        }

        var stopwatch = Stopwatch.StartNew();

        List<Finding> findings;
        RunMetrics? metrics;
        List<Gap> gaps;
        bool hasGapsJson;

        using (var activity = _activitySource.StartActivity("Ingestion.ParseJson", ActivityKind.Internal))
        {
            activity?.SetTag("auditRun.id", auditRunId);
            activity?.SetTag("ingestion.runDir", runDirFull);

            (findings, metrics) = await ReadSummaryAndFindingsAsync(summaryPath, cancellationToken);
            hasGapsJson = File.Exists(gapsPath);
            gaps = hasGapsJson
                ? await ReadGapsAsync(gapsPath, cancellationToken)
                : new List<Gap>();
        }

        // Update run metrics from summary (duration, link stats) and persist to DB
        using (var activity = _activitySource.StartActivity("Ingestion.PersistDb", ActivityKind.Internal))
        {
            activity?.SetTag("auditRun.id", auditRunId);

            if (metrics is not null)
            {
                run.DurationMs = metrics.DurationMs;
                run.LinkSampled = metrics.LinkSampled;
                run.LinkBroken = metrics.LinkBroken;

                // Feed runner-level metrics into in-memory Prometheus snapshot.
                AuditMetrics.AddRunnerMetrics(
                    metrics.DurationMs,
                    metrics.PagesScanned,
                    metrics.RequestsTotal,
                    metrics.RequestFailed,
                    metrics.SkippedNetwork);

                if (metrics.FindingsBySeverity is { Count: > 0 })
                {
                    foreach (var kvp in metrics.FindingsBySeverity)
                    {
                        AuditMetrics.AddRunnerFindingsBySeverity(kvp.Key, kvp.Value);
                    }
                }
            }

            // Idempotency:
            // - Always replace Findings when summary exists.
            // - Replace Gaps only when gaps.json exists; otherwise keep existing gaps.
            _db.Findings.RemoveRange(_db.Findings.Where(f => f.AuditRunId == auditRunId));
            _db.FindingInstances.RemoveRange(_db.FindingInstances.Where(i => i.AuditRunId == auditRunId));

            if (hasGapsJson)
            {
                _db.Gaps.RemoveRange(_db.Gaps.Where(g => g.AuditRunId == auditRunId));
            }
            else
            {
                _logger.LogWarning(
                    "gaps.json not found for audit run {AuditRunId} in RunDir {RunDir}. Existing gaps will be preserved.",
                    auditRunId, runDirFull);
            }

            if (findings.Count > 0)
            {
                // Compute fingerprints and upsert into finding_templates + finding_instances.
                var now = DateTimeOffset.UtcNow;

                // Preload any existing templates for fingerprints in this run.
                var fingerprints = findings
                    .Select(f => ComputeFingerprint(run.TargetUrl, f))
                    .Distinct()
                    .ToList();

                var templates = await _db.FindingTemplates
                    .Where(t => fingerprints.Contains(t.Fingerprint))
                    .ToListAsync(cancellationToken);
                var templatesByFingerprint = templates.ToDictionary(t => t.Fingerprint, t => t, StringComparer.Ordinal);

                foreach (var f in findings)
                {
                    f.AuditRunId = auditRunId;
                    _db.Findings.Add(f);

                    var fp = ComputeFingerprint(run.TargetUrl, f);
                    if (!templatesByFingerprint.TryGetValue(fp, out var template))
                    {
                        template = new FindingTemplate
                        {
                            Id = Guid.NewGuid(),
                            Fingerprint = fp,
                            RuleId = f.RuleId,
                            Severity = f.Severity,
                            Category = f.Category,
                            Title = f.Title,
                            CanonicalUrl = CanonicalizeUrl(run.TargetUrl),
                            Parameter = ExtractParameter(f),
                            Remediation = f.Remediation,
                            FirstSeenAt = now,
                            LastSeenAt = now,
                            OccurrenceCount = 0,
                            RecentSafeOccurrences = 0,
                            AutoRiskLowerSuggested = false,
                            Meta = f.Meta,
                            Status = f.Status,
                            SkipReason = f.SkipReason
                        };
                        templatesByFingerprint[fp] = template;
                        _db.FindingTemplates.Add(template);
                    }

                    template.OccurrenceCount += 1;
                    template.LastSeenAt = now;
                    if (IsSafeSeverity(f.Severity))
                    {
                        template.RecentSafeOccurrences += 1;
                    }

                    // Simple heuristic: if we have seen this template at least 5 times and all are low severity,
                    // suggest risk lowering in the UI.
                    if (!template.AutoRiskLowerSuggested &&
                        template.OccurrenceCount >= 5 &&
                        template.RecentSafeOccurrences >= 5 &&
                        IsSafeSeverity(template.Severity))
                    {
                        template.AutoRiskLowerSuggested = true;
                    }

                    var instance = new FindingInstance
                    {
                        Id = Guid.NewGuid(),
                        FindingTemplateId = template.Id,
                        AuditRunId = auditRunId,
                        Url = run.TargetUrl,
                        Parameter = ExtractParameter(f),
                        DetectedAt = now,
                        Status = f.Status,
                        SkipReason = f.SkipReason
                    };
                    _db.FindingInstances.Add(instance);
                }
            }

            if (hasGapsJson)
            {
                foreach (var g in gaps)
                {
                    g.AuditRunId = auditRunId;
                    _db.Gaps.Add(g);
                }
            }

            _logger.LogInformation(
                "Ingested {FindingCount} findings and {GapCount} gaps for audit run {AuditRunId}.",
                findings.Count, hasGapsJson ? gaps.Count : 0, auditRunId);
        }

        stopwatch.Stop();
        AuditMetrics.AddIngestionDuration(stopwatch.ElapsedMilliseconds);
    }

    private async Task<(List<Finding> Findings, RunMetrics? Metrics)> ReadSummaryAndFindingsAsync(string summaryPath, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(summaryPath);
        var root = await JsonSerializer.DeserializeAsync<SummaryJsonRoot>(stream, JsonOptions, cancellationToken);
        var list = root?.Findings ?? new List<FindingJson>();

        var entities = new List<Finding>();
        foreach (var j in list)
        {
            entities.Add(MapToFinding(j));
        }

        RunMetrics? metrics = null;
        if (root is not null)
        {
            if (root.Metrics is { } m)
            {
                metrics ??= new RunMetrics();
                metrics.DurationMs = m.DurationMs;
                metrics.LinkSampled = m.LinkSampled;
                metrics.LinkBroken = m.LinkBroken;
                metrics.PagesScanned = m.PagesScanned;
                metrics.RequestsTotal = m.RequestsTotal;
                metrics.RequestFailed = m.RequestFailed;
                metrics.SkippedNetwork = m.SkippedNetwork;
                metrics.FindingsBySeverity = m.FindingsBySeverity;
            }

            if (root.UiCoverage is { } c)
            {
                metrics ??= new RunMetrics();
                metrics.TotalElements = c.TotalElements;
                metrics.TestedElements = c.TestedElements;
                metrics.SkippedElements = c.SkippedElements;
            }
        }

        return (entities, metrics);
    }

    private sealed class RunMetrics
    {
        public long? DurationMs { get; set; }
        public int? LinkSampled { get; set; }
        public int? LinkBroken { get; set; }
        public int? TotalElements { get; set; }
        public int? TestedElements { get; set; }
        public int? SkippedElements { get; set; }

        public int? PagesScanned { get; set; }
        public int? RequestsTotal { get; set; }
        public int? RequestFailed { get; set; }
        public int? SkippedNetwork { get; set; }
        public Dictionary<string, int>? FindingsBySeverity { get; set; }
    }

    private static Finding MapToFinding(FindingJson j)
    {
        JsonDocument? meta = null;
        if (j.Meta is { } el && el.ValueKind != JsonValueKind.Null && el.ValueKind != JsonValueKind.Undefined)
        {
            try
            {
                meta = JsonDocument.Parse(el.GetRawText());
            }
            catch
            {
                // ignore invalid meta
            }
        }

        return new Finding
        {
            Id = Guid.NewGuid(),
            RuleId = NullToEmpty(j.RuleId, 200),
            Severity = NullToEmpty(j.Severity, 32),
            Category = NullToEmpty(j.Category, 64),
            Title = NullToEmpty(j.Title, 500),
            Detail = j.Detail ?? "",
            Remediation = j.Remediation,
            Meta = meta,
            Confidence = j.Confidence,
            Status = ParseFindingStatus(j.Status),
            SkipReason = ParseSkipReason(j.SkipReason)
        };
    }

    private async Task<List<Gap>> ReadGapsAsync(string gapsPath, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(gapsPath);
        var root = await JsonSerializer.DeserializeAsync<GapsJsonRoot>(stream, JsonOptions, cancellationToken);
        var list = root?.Gaps ?? new List<GapJson>();

        var entities = new List<Gap>();
        foreach (var j in list)
        {
            entities.Add(MapToGap(j));
        }

        return entities;
    }

    // Normalization and element history are disabled for now at ingestion-time;
    // gap spam is handled in reporting/export by grouping on HumanName + ReasonCode.

    private static Gap MapToGap(GapJson j)
    {
        JsonDocument? evidence = null;
        if (j.Evidence is { } el && el.ValueKind != JsonValueKind.Null && el.ValueKind != JsonValueKind.Undefined)
        {
            try
            {
                evidence = JsonDocument.Parse(el.GetRawText());
            }
            catch
            {
                // ignore
            }
        }

        return new Gap
        {
            Id = Guid.NewGuid(),
            ElementId = NullToEmpty(j.ElementId, 200),
            HumanName = j.HumanName,
            ReasonCode = NullToEmpty(j.ReasonCode, 100),
            ActionHint = j.ActionHint,
            RiskLevel = NullToEmpty(j.RiskLevel, 50),
            RecommendedScript = j.RecommendedScript,
            Evidence = evidence
        };
    }

    private static string NullToEmpty(string? value, int maxLen)
    {
        var s = string.IsNullOrWhiteSpace(value) ? "" : value!.Trim();
        return s.Length > maxLen ? s[..maxLen] : s;
    }

    private static FindingStatus ParseFindingStatus(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return FindingStatus.OK;

        return raw.ToUpperInvariant() switch
        {
            "OK" => FindingStatus.OK,
            "SKIPPED" => FindingStatus.SKIPPED,
            "FAILED" => FindingStatus.FAILED,
            "INFO" => FindingStatus.INFO,
            _ => FindingStatus.OK
        };
    }

    private static SkipReason? ParseSkipReason(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        return raw.ToUpperInvariant() switch
        {
            "NETWORK_POLICY" => SkipReason.NETWORK_POLICY,
            "RATE_LIMIT" => SkipReason.RATE_LIMIT,
            "TIMEOUT" => SkipReason.TIMEOUT,
            "AUTH_BLOCKED" => SkipReason.AUTH_BLOCKED,
            "ROBOTS" => SkipReason.ROBOTS,
            "OTHER" => SkipReason.OTHER,
            _ => null
        };
    }

    private static string CanonicalizeUrl(string url)
    {
        try
        {
            var u = new Uri(url, UriKind.Absolute);
            var builder = new UriBuilder(u)
            {
                Fragment = string.Empty
            };
            if ((builder.Scheme == Uri.UriSchemeHttp && builder.Port == 80) ||
                (builder.Scheme == Uri.UriSchemeHttps && builder.Port == 443))
            {
                builder.Port = -1;
            }
            return builder.Uri.ToString().ToLowerInvariant();
        }
        catch
        {
            return url.ToLowerInvariant();
        }
    }

    private static string ExtractParameter(Finding f)
    {
        try
        {
            if (f.Meta is null) return "-";
            var root = f.Meta.RootElement;
            if (root.ValueKind == JsonValueKind.Object &&
                root.TryGetProperty("parameter", out var paramProp) &&
                paramProp.ValueKind == JsonValueKind.String)
            {
                var value = paramProp.GetString();
                return string.IsNullOrWhiteSpace(value) ? "-" : value!.Trim();
            }
        }
        catch
        {
            // ignore
        }
        return "-";
    }

    private static bool IsSafeSeverity(string severity)
    {
        return string.Equals(severity, "info", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(severity, "warn", StringComparison.OrdinalIgnoreCase);
    }

    private static string ComputeFingerprint(string targetUrl, Finding f)
    {
        var ruleId = f.RuleId ?? string.Empty;
        var canonicalUrl = CanonicalizeUrl(targetUrl);
        var parameter = ExtractParameter(f);
        var evidenceKey = ExtractEvidenceKey(f);

        var raw = $"{ruleId}|{canonicalUrl}|{parameter}|{evidenceKey}";
        using var sha = SHA256.Create();
        var bytes = System.Text.Encoding.UTF8.GetBytes(raw);
        var hash = sha.ComputeHash(bytes);
        return Convert.ToHexString(hash);
    }

    private static string ExtractEvidenceKey(Finding f)
    {
        try
        {
            if (f.Meta is null) return $"{f.Title}|{f.Detail}".Trim();
            var root = f.Meta.RootElement;
            if (root.ValueKind == JsonValueKind.Object &&
                root.TryGetProperty("fingerprint", out var fpProp) &&
                fpProp.ValueKind == JsonValueKind.String)
            {
                var value = fpProp.GetString();
                if (!string.IsNullOrWhiteSpace(value)) return value!;
            }
        }
        catch
        {
            // ignore
        }

        return $"{f.Title}|{f.Detail}".Trim();
    }
}
