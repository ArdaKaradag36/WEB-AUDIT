using System.Diagnostics;
using System.Text.Json;
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

            AuditMetrics.IncrementIngestionFailures();
            return;
        }

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

        // Update run metrics from summary (duration, link stats)
        using (var activity = _activitySource.StartActivity("Ingestion.PersistDb", ActivityKind.Internal))
        {
            activity?.SetTag("auditRun.id", auditRunId);

            if (metrics is not null)
            {
                run.DurationMs = metrics.DurationMs;
                run.LinkSampled = metrics.LinkSampled;
                run.LinkBroken = metrics.LinkBroken;
            }

            // Idempotency:
            // - Always replace Findings when summary exists.
            // - Replace Gaps only when gaps.json exists; otherwise keep existing gaps.
            _db.Findings.RemoveRange(_db.Findings.Where(f => f.AuditRunId == auditRunId));

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

            foreach (var f in findings)
            {
                f.AuditRunId = auditRunId;
                _db.Findings.Add(f);
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
        if (root?.Metrics is { } m)
        {
            metrics = new RunMetrics
            {
                DurationMs = m.DurationMs,
                LinkSampled = m.LinkSampled,
                LinkBroken = m.LinkBroken
            };
        }

        return (entities, metrics);
    }

    private sealed class RunMetrics
    {
        public long? DurationMs { get; set; }
        public int? LinkSampled { get; set; }
        public int? LinkBroken { get; set; }
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
            Meta = meta
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
}
