using System.Diagnostics;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Ingestion;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace KamuAudit.Tests;

/// <summary>
/// Tests for the finding deduplication pipeline in <see cref="AuditResultIngestor"/>.
/// Uses Testcontainers PostgreSQL to mirror production behavior (no InMemory provider).
/// </summary>
[Collection("postgres-ingestion")]
public sealed class AuditResultIngestorTests
{
    private readonly PostgresIngestionFixture _fixture;

    public AuditResultIngestorTests(PostgresIngestionFixture fixture)
    {
        _fixture = fixture;
    }

    private static (KamuAuditDbContext Db, string WorkingRoot) CreateDbAndWorkingDir(PostgresIngestionFixture fixture)
    {
        var db = fixture.CreateContext(resetDatabase: true);

        var workingRoot = Path.Combine(Path.GetTempPath(), "KamuAuditIngestorTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workingRoot);

        return (db, workingRoot);
    }

    private static AuditResultIngestor CreateIngestor(KamuAuditDbContext db, string workingRoot)
    {
        var options = Options.Create(new AuditRunnerOptions
        {
            // Absolute path so Path.Combine(AppContext.BaseDirectory, WorkingDirectory) resolves correctly.
            WorkingDirectory = workingRoot
        });

        var activitySource = new ActivitySource("KamuAudit.Tests.Ingestion");
        return new AuditResultIngestor(db, options, NullLogger<AuditResultIngestor>.Instance, activitySource);
    }

    private static string PrepareRunDirectory(string workingRoot, out string runDirRelative)
    {
        runDirRelative = Guid.NewGuid().ToString("N");
        var runDirFull = Path.Combine(workingRoot, runDirRelative);
        Directory.CreateDirectory(runDirFull);

        // Completion marker is required by IngestAsync.
        File.WriteAllText(Path.Combine(runDirFull, "run.complete.json"), """{"status":"completed"}""");
        return runDirFull;
    }

    [Fact]
    public async Task Same_fingerprint_reuses_template_and_creates_multiple_instances()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        // Two identical findings -> same fingerprint.
        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                { "ruleId": "R1", "severity": "info", "category": "test", "title": "Same", "detail": "Det" },
                { "ruleId": "R1", "severity": "info", "category": "test", "title": "Same", "detail": "Det" }
              ],
              "metrics": {}
            }
            """);

        // gaps.json optional here; we focus on findings/templates.
        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var templates = await db.FindingTemplates.AsNoTracking().ToListAsync();
        var instances = await db.FindingInstances.AsNoTracking().ToListAsync();
        var findings = await db.Findings.AsNoTracking().Where(f => f.AuditRunId == auditId).ToListAsync();

        Assert.Equal(2, findings.Count);
        Assert.Single(templates);
        Assert.Equal(2, templates[0].OccurrenceCount);
        Assert.Equal(2, instances.Count);
        Assert.All(instances, i => Assert.Equal(templates[0].Id, i.FindingTemplateId));
    }

    [Fact]
    public async Task Different_parameter_creates_distinct_templates()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        // Same rule/title but different meta.parameter -> different fingerprints.
        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                { "ruleId": "R2", "severity": "info", "category": "test", "title": "Param", "detail": "Det", "meta": { "parameter": "p1" } },
                { "ruleId": "R2", "severity": "info", "category": "test", "title": "Param", "detail": "Det", "meta": { "parameter": "p2" } }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var templates = await db.FindingTemplates.AsNoTracking().OrderBy(t => t.Parameter).ToListAsync();
        var instances = await db.FindingInstances.AsNoTracking().OrderBy(i => i.Parameter).ToListAsync();

        Assert.Equal(2, templates.Count);
        Assert.All(templates, t => Assert.Equal(1, t.OccurrenceCount));

        Assert.Equal(new[] { "p1", "p2" }, templates.Select(t => t.Parameter).ToArray());
        Assert.Equal(new[] { "p1", "p2" }, instances.Select(i => i.Parameter).ToArray());
    }

    [Fact]
    public async Task Duplicate_findings_in_same_run_produce_correct_occurrence_and_instance_counts()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                { "ruleId": "R3", "severity": "warn", "category": "test", "title": "Dup", "detail": "Det" },
                { "ruleId": "R3", "severity": "warn", "category": "test", "title": "Dup", "detail": "Det" },
                { "ruleId": "R3", "severity": "warn", "category": "test", "title": "Dup", "detail": "Det" }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var template = await db.FindingTemplates.AsNoTracking().SingleAsync();
        var instances = await db.FindingInstances.AsNoTracking().ToListAsync();
        var findings = await db.Findings.AsNoTracking().Where(f => f.AuditRunId == auditId).ToListAsync();

        Assert.Equal(3, findings.Count);
        Assert.Equal(3, template.OccurrenceCount);
        Assert.Equal(3, instances.Count);
        Assert.All(instances, i => Assert.Equal(template.Id, i.FindingTemplateId));
    }

    [Fact]
    public async Task Safe_severity_findings_toggle_auto_risk_lower_suggested_after_threshold()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        // 5 info-level findings with same fingerprint.
        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                { "ruleId": "R4", "severity": "info", "category": "test", "title": "Safe", "detail": "Det" },
                { "ruleId": "R4", "severity": "info", "category": "test", "title": "Safe", "detail": "Det" },
                { "ruleId": "R4", "severity": "info", "category": "test", "title": "Safe", "detail": "Det" },
                { "ruleId": "R4", "severity": "info", "category": "test", "title": "Safe", "detail": "Det" },
                { "ruleId": "R4", "severity": "info", "category": "test", "title": "Safe", "detail": "Det" }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var template = await db.FindingTemplates.AsNoTracking().SingleAsync();

        Assert.Equal(5, template.OccurrenceCount);
        Assert.Equal(5, template.RecentSafeOccurrences);
        Assert.True(template.AutoRiskLowerSuggested);
    }

    [Fact]
    public async Task Template_copies_remediation_and_meta_from_first_occurrence()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                {
                  "ruleId": "R5",
                  "severity": "error",
                  "category": "test",
                  "title": "Template",
                  "detail": "Det",
                  "remediation": "Fix it",
                  "meta": { "parameter": "q", "fingerprint": "custom-fp" }
                }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var template = await db.FindingTemplates.AsNoTracking().SingleAsync();

        Assert.Equal("Fix it", template.Remediation);
        Assert.Equal("q", template.Parameter);
        Assert.NotNull(template.Meta);
    }

    [Fact]
    public async Task Status_and_skipReason_are_mapped_from_summary_json()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                {
                  "ruleId": "R6",
                  "severity": "info",
                  "category": "network",
                  "title": "Policy",
                  "detail": "Skipped by network policy",
                  "status": "SKIPPED",
                  "skipReason": "NETWORK_POLICY"
                }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var finding = await db.Findings.AsNoTracking().SingleAsync();
        var template = await db.FindingTemplates.AsNoTracking().SingleAsync();
        var instance = await db.FindingInstances.AsNoTracking().SingleAsync();

        Assert.Equal(FindingStatus.SKIPPED, finding.Status);
        Assert.Equal(SkipReason.NETWORK_POLICY, finding.SkipReason);
        Assert.Equal(FindingStatus.SKIPPED, template.Status);
        Assert.Equal(SkipReason.NETWORK_POLICY, template.SkipReason);
        Assert.Equal(FindingStatus.SKIPPED, instance.Status);
        Assert.Equal(SkipReason.NETWORK_POLICY, instance.SkipReason);
    }

    [Fact]
    public async Task Missing_status_defaults_to_OK()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                {
                  "ruleId": "R7",
                  "severity": "error",
                  "category": "console",
                  "title": "No status",
                  "detail": "Detail"
                }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var finding = await db.Findings.AsNoTracking().SingleAsync();

        Assert.Equal(FindingStatus.OK, finding.Status);
        Assert.Null(finding.SkipReason);
    }

    [Fact]
    public async Task Unknown_status_string_maps_to_OK()
    {
        var (db, workingRoot) = CreateDbAndWorkingDir(_fixture);
        using var _ = db;

        var runDirFull = PrepareRunDirectory(workingRoot, out var runDirRelative);
        var auditId = Guid.NewGuid();

        db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await db.SaveChangesAsync();

        File.WriteAllText(
            Path.Combine(runDirFull, "summary.json"),
            """
            {
              "run": {},
              "findings": [
                {
                  "ruleId": "R8",
                  "severity": "warn",
                  "category": "network",
                  "title": "Weird status",
                  "detail": "Detail",
                  "status": "SOMETHING_ELSE"
                }
              ],
              "metrics": {}
            }
            """);

        File.WriteAllText(
            Path.Combine(runDirFull, "gaps.json"),
            """{"gaps":[]}""");

        var ingestor = CreateIngestor(db, workingRoot);

        await ingestor.IngestAsync(auditId);
        await db.SaveChangesAsync();

        var finding = await db.Findings.AsNoTracking().SingleAsync();

        Assert.Equal(FindingStatus.OK, finding.Status);
        Assert.Null(finding.SkipReason);
    }
}

