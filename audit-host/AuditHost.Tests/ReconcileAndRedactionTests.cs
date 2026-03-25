using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AuditHost.Tests;

public class ReconcileAndRedactionTests
{
    // ── GATE-02: ReconcileStuckJobs ──────────────────────────────────────────

    [Fact]
    public void ReconcileStuckJobs_MarksStuckRunningJob_AsError()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "audit-reconcile-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var dbPath = Path.Combine(tmpDir, "test.db");
        var runnerDir = tmpDir;

        try
        {
            AuditDb.InitDb(dbPath);

            var jobId = Guid.NewGuid().ToString("N");
            var staleStarted = DateTimeOffset.UtcNow.AddHours(-3).ToUnixTimeSeconds();

            using (var conn = AuditDb.Open(dbPath))
            {
                AuditDb.Exec(conn, """
                    INSERT INTO audit_jobs(id,target_url,status,created_at,started_at,run_dir)
                    VALUES ($id,$url,'running',$created,$started,$run)
                    """,
                    ("$id", jobId), ("$url", "http://example.com"), ("$created", staleStarted),
                    ("$started", staleStarted), ("$run", $"reports/runs/{jobId}"));
            }

            AuditDb.ReconcileStuckJobs(dbPath, runnerDir, maxAgeMinutes: 60);

            using var conn2 = AuditDb.Open(dbPath);
            var job = AuditDb.ReadJobById(conn2, jobId);
            Assert.NotNull(job);
            Assert.Equal("error", job.status);
        }
        finally
        {
            Directory.Delete(tmpDir, recursive: true);
        }
    }

    [Fact]
    public void ReconcileStuckJobs_MarksJobWithRunComplete_AsSuccess()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "audit-reconcile-success-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        var dbPath = Path.Combine(tmpDir, "test.db");
        var runnerDir = tmpDir;

        try
        {
            AuditDb.InitDb(dbPath);

            var jobId = Guid.NewGuid().ToString("N");
            var runDirRel = $"reports/runs/{jobId}";
            var runDirFull = Path.Combine(runnerDir, runDirRel);
            Directory.CreateDirectory(runDirFull);
            File.WriteAllText(Path.Combine(runDirFull, "run.complete.json"), "{\"status\":\"ok\"}");

            var staleStarted = DateTimeOffset.UtcNow.AddHours(-3).ToUnixTimeSeconds();
            using (var conn = AuditDb.Open(dbPath))
            {
                AuditDb.Exec(conn, """
                    INSERT INTO audit_jobs(id,target_url,status,created_at,started_at,run_dir)
                    VALUES ($id,$url,'running',$created,$started,$run)
                    """,
                    ("$id", jobId), ("$url", "http://example.com"), ("$created", staleStarted),
                    ("$started", staleStarted), ("$run", runDirRel));
            }

            AuditDb.ReconcileStuckJobs(dbPath, runnerDir, maxAgeMinutes: 60);

            using var conn2 = AuditDb.Open(dbPath);
            var job = AuditDb.ReadJobById(conn2, jobId);
            Assert.NotNull(job);
            Assert.Equal("success", job.status);
        }
        finally
        {
            Directory.Delete(tmpDir, recursive: true);
        }
    }

    // ── GATE-07: SarifExport.TryRedactJson ──────────────────────────────────

    [Fact]
    public void TryRedactJson_ReturnsOriginal_WhenRedactDisabled()
    {
        var config = new ConfigurationBuilder().Build();
        var json = """{"token":"abc123","user":"alice"}""";
        var result = SarifExport.TryRedactJson(json, config);
        Assert.Equal(json, result);
    }

    [Fact]
    public void TryRedactJson_RedactsNestedTokenField_WhenEnabled()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AuditHost:RedactJsonResponses"] = "true"
            })
            .Build();

        var json = """{"data":{"token":"supersecret","user":"alice"}}""";
        var result = SarifExport.TryRedactJson(json, config);

        var doc = JsonDocument.Parse(result);
        Assert.Equal("[REDACTED]", doc.RootElement.GetProperty("data").GetProperty("token").GetString());
        Assert.Equal("alice", doc.RootElement.GetProperty("data").GetProperty("user").GetString());
    }

    [Fact]
    public void TryRedactJson_OutputIsValidJson()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AuditHost:RedactJsonResponses"] = "true"
            })
            .Build();

        var json = """{"password":"s3cr3t","api_key":"key123","name":"test"}""";
        var result = SarifExport.TryRedactJson(json, config);

        // Must be parseable - proves output is valid JSON
        var doc = JsonDocument.Parse(result);
        Assert.Equal("[REDACTED]", doc.RootElement.GetProperty("password").GetString());
        Assert.Equal("[REDACTED]", doc.RootElement.GetProperty("api_key").GetString());
        Assert.Equal("test", doc.RootElement.GetProperty("name").GetString());
    }

    [Fact]
    public void TryRedactJson_PreservesKeyName_DoesNotRedactKeyText()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AuditHost:RedactJsonResponses"] = "true"
            })
            .Build();

        // The old string.Replace approach would have corrupted "downloadToken" -> "download[redacted]"
        var json = """{"downloadToken":"abc","token":"secret123"}""";
        var result = SarifExport.TryRedactJson(json, config);

        var doc = JsonDocument.Parse(result);
        // "downloadToken" key should be preserved in output (it's not in the sensitive list)
        Assert.True(doc.RootElement.TryGetProperty("downloadToken", out var dtProp));
        Assert.Equal("abc", dtProp.GetString());
        // "token" key value should be redacted
        Assert.Equal("[REDACTED]", doc.RootElement.GetProperty("token").GetString());
    }
}
