using Xunit;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Ingestion;
using KamuAudit.Api.Infrastructure.Persistence;
using KamuAudit.Api.Infrastructure.Runner;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace KamuAudit.Tests;

public class AuditResultIngestorTests : IDisposable
{
    private readonly string _runDir;
    private readonly KamuAuditDbContext _db;

    public AuditResultIngestorTests()
    {
        _runDir = Path.Combine(Path.GetTempPath(), "KamuAuditTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_runDir);

        var options = new DbContextOptionsBuilder<KamuAuditDbContext>()
            .UseInMemoryDatabase(databaseName: "IngestorTests_" + Guid.NewGuid().ToString("N"))
            .Options;
        _db = new KamuAuditDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_runDir)) Directory.Delete(_runDir, recursive: true); } catch { /* ignore */ }
    }

    [Fact]
    public async Task IngestAsync_parses_summary_and_gaps_and_persists()
    {
        var auditId = Guid.NewGuid();
        var workingDir = Path.GetDirectoryName(_runDir)!;
        var runDirRelative = Path.GetFileName(_runDir);
        _db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await _db.SaveChangesAsync();

        File.WriteAllText(Path.Combine(_runDir, "summary.json"), """
            {"run":{},"findings":[{"ruleId":"r1","severity":"error","category":"console","title":"E","detail":"D"}],"metrics":{"durationMs":1000}}
            """);
        File.WriteAllText(Path.Combine(_runDir, "gaps.json"), """
            {"gaps":[{"elementId":"el1","humanName":"Btn","reasonCode":"NOT_VISIBLE","riskLevel":"safe","recommendedScript":"click"}]}
            """);

        var runnerOptions = Options.Create(new AuditRunnerOptions { WorkingDirectory = workingDir });
        var ingestor = new AuditResultIngestor(_db, runnerOptions, NullLogger<AuditResultIngestor>.Instance);

        await ingestor.IngestAsync(auditId);
        await _db.SaveChangesAsync();

        var findings = await _db.Findings.Where(f => f.AuditRunId == auditId).ToListAsync();
        var gaps = await _db.Gaps.Where(g => g.AuditRunId == auditId).ToListAsync();

        Assert.Single(findings);
        Assert.Equal("r1", findings[0].RuleId);
        Assert.Equal("error", findings[0].Severity);
        Assert.Single(gaps);
        Assert.Equal("el1", gaps[0].ElementId);
        Assert.Equal("safe", gaps[0].RiskLevel);
    }

    [Fact]
    public async Task IngestAsync_is_idempotent_second_run_replaces_data()
    {
        var auditId = Guid.NewGuid();
        var workingDir = Path.GetDirectoryName(_runDir)!;
        var runDirRelative = Path.GetFileName(_runDir);

        _db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });
        await _db.SaveChangesAsync();

        File.WriteAllText(Path.Combine(_runDir, "summary.json"), """{"run":{},"findings":[{"ruleId":"r1","severity":"info","category":"x","title":"T","detail":""}],"metrics":{}}""");
        File.WriteAllText(Path.Combine(_runDir, "gaps.json"), """{"gaps":[{"elementId":"e1","reasonCode":"UNKNOWN","riskLevel":"safe"}]}""");

        var runnerOptions = Options.Create(new AuditRunnerOptions { WorkingDirectory = workingDir });
        var ingestor = new AuditResultIngestor(_db, runnerOptions, NullLogger<AuditResultIngestor>.Instance);

        await ingestor.IngestAsync(auditId);
        await _db.SaveChangesAsync();

        var count1 = await _db.Findings.CountAsync(f => f.AuditRunId == auditId);

        await ingestor.IngestAsync(auditId);
        await _db.SaveChangesAsync();

        var count2 = await _db.Findings.CountAsync(f => f.AuditRunId == auditId);

        Assert.Equal(1, count1);
        Assert.Equal(1, count2);
    }

    [Fact]
    public async Task IngestAsync_does_not_touch_existing_data_when_summary_missing()
    {
        var auditId = Guid.NewGuid();
        var workingDir = Path.GetDirectoryName(_runDir)!;
        var runDirRelative = Path.GetFileName(_runDir);

        var run = new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        };
        _db.AuditRuns.Add(run);

        // Existing DB data that must be preserved
        _db.Findings.Add(new Finding { Id = Guid.NewGuid(), AuditRunId = auditId, RuleId = "existing", Severity = "info", Category = "x", Title = "t", Detail = "" });
        _db.Gaps.Add(new Gap { Id = Guid.NewGuid(), AuditRunId = auditId, ElementId = "e-existing", ReasonCode = "EXISTING", RiskLevel = "safe" });
        await _db.SaveChangesAsync();

        // No summary.json present

        var runnerOptions = Options.Create(new AuditRunnerOptions { WorkingDirectory = workingDir });
        var ingestor = new AuditResultIngestor(_db, runnerOptions, NullLogger<AuditResultIngestor>.Instance);

        await ingestor.IngestAsync(auditId);
        await _db.SaveChangesAsync();

        var findings = await _db.Findings.Where(f => f.AuditRunId == auditId).ToListAsync();
        var gaps = await _db.Gaps.Where(g => g.AuditRunId == auditId).ToListAsync();

        Assert.Single(findings);
        Assert.Equal("existing", findings[0].RuleId);
        Assert.Single(gaps);
        Assert.Equal("e-existing", gaps[0].ElementId);
    }

    [Fact]
    public async Task IngestAsync_preserves_existing_gaps_when_gaps_json_missing()
    {
        var auditId = Guid.NewGuid();
        var workingDir = Path.GetDirectoryName(_runDir)!;
        var runDirRelative = Path.GetFileName(_runDir);

        _db.AuditRuns.Add(new AuditRun
        {
            Id = auditId,
            TargetUrl = "https://example.com",
            Status = "completed",
            RunDir = runDirRelative,
            Plugins = "[]"
        });

        // Existing gaps should be preserved
        _db.Gaps.Add(new Gap { Id = Guid.NewGuid(), AuditRunId = auditId, ElementId = "gap-existing", ReasonCode = "EXISTING", RiskLevel = "medium" });

        // Existing findings should be replaced
        _db.Findings.Add(new Finding { Id = Guid.NewGuid(), AuditRunId = auditId, RuleId = "old", Severity = "info", Category = "x", Title = "old", Detail = "" });
        await _db.SaveChangesAsync();

        // summary.json present with new findings
        File.WriteAllText(Path.Combine(_runDir, "summary.json"), """
            {"run":{},"findings":[{"ruleId":"new","severity":"error","category":"console","title":"E","detail":"D"}],"metrics":{"durationMs":500}}
            """);
        // gaps.json intentionally missing

        var runnerOptions = Options.Create(new AuditRunnerOptions { WorkingDirectory = workingDir });
        var ingestor = new AuditResultIngestor(_db, runnerOptions, NullLogger<AuditResultIngestor>.Instance);

        await ingestor.IngestAsync(auditId);
        await _db.SaveChangesAsync();

        var findings = await _db.Findings.Where(f => f.AuditRunId == auditId).ToListAsync();
        var gaps = await _db.Gaps.Where(g => g.AuditRunId == auditId).ToListAsync();

        Assert.Single(findings);
        Assert.Equal("new", findings[0].RuleId);

        Assert.Single(gaps);
        Assert.Equal("gap-existing", gaps[0].ElementId);
        Assert.Equal("EXISTING", gaps[0].ReasonCode);
    }
}
