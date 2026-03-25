using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WebAudit.Core;
using Xunit;

namespace AuditHost.Tests;

/// <summary>
/// Integration tests: SummaryJsonParser, SqliteJobStore lifecycle, and end-to-end API flow.
/// </summary>
public class IntegrationAndParseTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public IntegrationAndParseTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    // ── SummaryJsonParser ────────────────────────────────────────────────

    [Fact]
    public void SummaryJsonParser_ParsesValidSummaryJson()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "parser-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var summaryPath = Path.Combine(tmpDir, "summary.json");

        File.WriteAllText(summaryPath, """
            {
              "run": { "runId": "test1", "url": "https://example.com", "status": "ok" },
              "metrics": {
                "pagesScanned": 5,
                "requestsTotal": 120,
                "skippedNetwork": 2,
                "findingsBySeverity": { "error": 1, "warn": 3, "info": 2 }
              },
              "uiCoverage": {
                "totalElements": 30,
                "testedElements": 20,
                "skippedElements": 8,
                "failedElements": 2
              },
              "findings": []
            }
            """);

        try
        {
            var ok = SummaryJsonParser.TryParseMetricsFromFile(summaryPath,
                out var findings, out var pages, out var requests,
                out var skipped, out var tested, out var total, out var skippedUi, out var failed);

            Assert.True(ok);
            Assert.Equal(5, pages);
            Assert.Equal(120, requests);
            Assert.Equal(2, skipped);
            Assert.Equal(20, tested);
            Assert.Equal(30, total);
            Assert.Equal(8, skippedUi);
            Assert.Equal(2, failed);
            Assert.Contains("error", findings ?? "");
            Assert.Contains("warn", findings ?? "");
        }
        finally
        {
            Directory.Delete(tmpDir, recursive: true);
        }
    }

    [Fact]
    public void SummaryJsonParser_ReturnsFalse_ForMissingFile()
    {
        var ok = SummaryJsonParser.TryParseMetricsFromFile("/nonexistent/path/summary.json",
            out _, out _, out _, out _, out _, out _, out _, out _);
        Assert.False(ok);
    }

    [Fact]
    public void SummaryJsonParser_ReturnsFalse_ForInvalidJson()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "parser-invalid-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var path = Path.Combine(tmpDir, "summary.json");
        File.WriteAllText(path, "{ not valid json }}}");
        try
        {
            var ok = SummaryJsonParser.TryParseMetricsFromFile(path,
                out _, out _, out _, out _, out _, out _, out _, out _);
            Assert.False(ok);
        }
        finally { Directory.Delete(tmpDir, recursive: true); }
    }

    [Fact]
    public void SummaryJsonParser_ParsesEmptyFindingsAsCurlyBraces()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "parser-empty-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var path = Path.Combine(tmpDir, "summary.json");
        File.WriteAllText(path, """
            {
              "metrics": { "pagesScanned": 1, "requestsTotal": 5, "skippedNetwork": 0 },
              "uiCoverage": { "totalElements": 0 },
              "findings": []
            }
            """);
        try
        {
            var ok = SummaryJsonParser.TryParseMetricsFromFile(path,
                out var findings, out var pages, out _, out _, out _, out _, out _, out _);
            Assert.True(ok);
            Assert.Equal(1, pages);
            Assert.NotNull(findings);
        }
        finally { Directory.Delete(tmpDir, recursive: true); }
    }

    // ── SqliteJobStore lifecycle ─────────────────────────────────────────

    [Fact]
    public void SqliteJobStore_FullLifecycle()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "store-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var dbPath = Path.Combine(tmpDir, "test.db");

        try
        {
            AuditDb.InitDb(dbPath);
            var store = new SqliteJobStore(dbPath, tmpDir);
            var jobId = Guid.NewGuid().ToString("N");
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var runDir = $"reports/runs/{jobId}";

            // InsertQueuedJob
            store.InsertQueuedJob(jobId, "https://example.com", now, runDir, null, 50, 220, "none", null, 0, null);
            var job = store.GetJobById(jobId);
            Assert.NotNull(job);
            Assert.Equal("queued", job!.status);
            Assert.Equal("https://example.com", job.targetUrl);

            // MarkRunning
            store.MarkRunning(jobId);
            job = store.GetJobById(jobId);
            Assert.Equal("running", job!.status);

            // FinishJob
            store.FinishJob(jobId, "success", DateTimeOffset.UtcNow.ToUnixTimeSeconds(), 0, null);
            job = store.GetJobById(jobId);
            Assert.Equal("success", job!.status);
            Assert.Equal(0, job.exitCode);

            // GetRunDir
            var rd = store.GetRunDir(jobId);
            Assert.Equal(runDir, rd);

            // DeleteJob
            store.DeleteJob(jobId);
            var deleted = store.GetJobById(jobId);
            Assert.Null(deleted);
        }
        finally
        {
            Directory.Delete(tmpDir, recursive: true);
        }
    }

    [Fact]
    public void SqliteJobStore_MarkAborted_SetsCorrectStatus()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "store-abort-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var dbPath = Path.Combine(tmpDir, "test.db");
        try
        {
            AuditDb.InitDb(dbPath);
            var store = new SqliteJobStore(dbPath, tmpDir);
            var jobId = Guid.NewGuid().ToString("N");
            store.InsertQueuedJob(jobId, "https://example.com", DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                $"reports/runs/{jobId}", null, 50, 220, "none", null, 0, null);
            store.MarkRunning(jobId);
            store.MarkAborted(jobId, "Host shutdown during execution");

            var job = store.GetJobById(jobId);
            Assert.NotNull(job);
            Assert.Equal("aborted", job!.status);
            Assert.Equal(-2, job.exitCode);
        }
        finally { Directory.Delete(tmpDir, recursive: true); }
    }

    [Fact]
    public void SqliteJobStore_UpsertSummaryAndFindings_Works()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "store-summary-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var dbPath = Path.Combine(tmpDir, "test.db");
        try
        {
            AuditDb.InitDb(dbPath);
            var store = new SqliteJobStore(dbPath, tmpDir);
            var jobId = Guid.NewGuid().ToString("N");
            var runDirRel = $"reports/runs/{jobId}";
            var runDirFull = Path.Combine(tmpDir, runDirRel);
            Directory.CreateDirectory(runDirFull);

            store.InsertQueuedJob(jobId, "https://example.com", DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                runDirRel, null, 50, 220, "none", null, 0, null);

            var summaryPath = Path.Combine(runDirFull, "summary.json");
            File.WriteAllText(summaryPath, """
                {
                  "metrics": { "pagesScanned": 3, "requestsTotal": 50, "skippedNetwork": 0,
                    "findingsBySeverity": { "warn": 2 } },
                  "uiCoverage": { "totalElements": 10, "testedElements": 7, "skippedElements": 3, "failedElements": 0 },
                  "findings": [
                    { "ruleId": "KWA-HTTP-002", "severity": "warn", "category": "security_headers",
                      "title": "CSP missing", "confidence": 0.9 }
                  ]
                }
                """);

            store.UpsertSummaryAndFindings(jobId, summaryPath);

            using var conn = AuditDb.Open(dbPath);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT pages_scanned, requests_total FROM audit_summary_cache WHERE job_id=$id";
            cmd.Parameters.AddWithValue("$id", jobId);
            using var reader = cmd.ExecuteReader();
            Assert.True(reader.Read());
            Assert.Equal(3, reader.GetInt32(0));
            Assert.Equal(50, reader.GetInt32(1));
        }
        finally { Directory.Delete(tmpDir, recursive: true); }
    }

    // ── End-to-end API flow ───────────────────────────────────────────────

    [Fact]
    public async Task PostAudit_ReturnsQueuedJob_WithValidPublicUrl()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/v1/audits", new
        {
            targetUrl = "https://example.com",
            maxLinks = 1,
            maxUiAttempts = 5
        });

        // Either 200 OK (queued) or 400 (SSRF/validation) — must not be 500.
        Assert.NotEqual(HttpStatusCode.InternalServerError, resp.StatusCode);

        if (resp.StatusCode == HttpStatusCode.OK)
        {
            var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(body.TryGetProperty("id", out var idProp));
            Assert.False(string.IsNullOrWhiteSpace(idProp.GetString()));
            Assert.Equal("queued", body.GetProperty("status").GetString());
        }
    }

    [Fact]
    public async Task GetSummary_Returns404_ForNonExistentAudit()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/audits/nonexistentid99999/summary");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetAll_ReturnsJsonArray()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/audits?limit=5");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Array, body.ValueKind);
    }

    [Fact]
    public async Task GetRecent_ReturnsJsonArray()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/audits/recent?limit=3");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Array, body.ValueKind);
    }
}
