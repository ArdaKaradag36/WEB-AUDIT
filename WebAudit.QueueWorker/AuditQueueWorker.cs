using System.Text.Json;
using Npgsql;
using WebAudit.Postgres;
using WebAudit.Shared;

namespace WebAudit.QueueWorker;

/// <summary>Claims queued jobs from PostgreSQL and runs <see cref="RunnerJobRunner"/>.</summary>
internal sealed class AuditQueueWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuditQueueWorker> _logger;

    public AuditQueueWorker(IConfiguration configuration, ILogger<AuditQueueWorker> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var cs = _configuration["Postgres:ConnectionString"] ?? Environment.GetEnvironmentVariable("WEBAUDIT_POSTGRES_URL");
        var runnerDir = _configuration["RunnerDirectory"] ?? Environment.GetEnvironmentVariable("WEBAUDIT_RUNNER_DIR") ?? "";
        var secretKey = _configuration["JobPayloadSecretKeyBase64"] ?? Environment.GetEnvironmentVariable("WEBAUDIT_JOB_SECRET");
        if (string.IsNullOrWhiteSpace(cs) || string.IsNullOrWhiteSpace(runnerDir))
        {
            _logger.LogError("Postgres:ConnectionString and RunnerDirectory required (or WEBAUDIT_POSTGRES_URL / WEBAUDIT_RUNNER_DIR).");
            return;
        }

        runnerDir = Path.GetFullPath(runnerDir);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var conn = new NpgsqlConnection(cs);
                await conn.OpenAsync(stoppingToken);
                var job = PostgresAudit.ClaimNextJob(conn);
                if (job == null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                    continue;
                }

                string? password = null;
                if (job.LoginMode != "none" && job.SecretPayload is { Length: > 0 } blob)
                {
                    if (string.IsNullOrWhiteSpace(secretKey))
                    {
                        PostgresAudit.MarkNotRun(cs, job.Id, "WEBAUDIT_JOB_SECRET missing for encrypted credentials");
                        continue;
                    }

                    try
                    {
                        var json = JobPayloadCrypto.DecryptUtf8(secretKey, blob);
                        password = JsonSerializer.Deserialize<Payload>(json)?.Password;
                    }
                    catch (Exception ex)
                    {
                        PostgresAudit.MarkNotRun(cs, job.Id, "Decrypt job secret failed: " + ex.Message);
                        continue;
                    }
                }

                var finishedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                try
                {
                    var (code, stdout, stderr) = await RunnerJobRunner.RunAsync(
                        runnerDir,
                        job.TargetUrl,
                        job.RunDirRel,
                        job.MaxLinks,
                        job.MaxUiAttempts,
                        job.LoginMode,
                        job.Identifier,
                        password,
                        stoppingToken);

                    finishedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var status = code is 0 or 2 ? "success" : "error";
                    var err = string.IsNullOrWhiteSpace(stderr) ? null : stderr.Trim();
                    if (code != 0 && code != 2 && string.IsNullOrWhiteSpace(err))
                        err = stdout.Trim();
                    PostgresAudit.FinishJob(cs, job.Id, status, finishedAt, code, err);

                    var summaryPath = Path.Combine(runnerDir, job.RunDirRel, "summary.json");
                    if (File.Exists(summaryPath))
                    {
                        await using var c2 = new NpgsqlConnection(cs);
                        await c2.OpenAsync(stoppingToken);
                        PostgresAudit.UpsertSummaryAndFindings(c2, job.Id, summaryPath);
                    }
                }
                catch (OperationCanceledException)
                {
                    try { PostgresAudit.MarkAborted(cs, job.Id, "Host shutdown during execution (aborted)"); }
                    catch { /* best-effort; avoid masking original cancellation */ }
                    throw;
                }
                catch (Exception ex)
                {
                    PostgresAudit.MarkNotRun(cs, job.Id, ex.GetType().Name + ": " + ex.Message);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Queue worker loop error");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private sealed class Payload
    {
        public string? Password { get; set; }
    }
}
