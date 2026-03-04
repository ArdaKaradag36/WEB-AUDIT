using System.Diagnostics;
using KamuAudit.Api.Application.Interfaces;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Monitoring;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Serilog.Context;

namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// Polls for queued audit runs with atomic reservation (FOR UPDATE SKIP LOCKED),
/// runs the Node CLI via IAuditRunner, ingests via IAuditResultIngestor, and supports retry with backoff.
/// </summary>
public sealed class AuditRunnerBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditRunnerBackgroundService> _logger;
    private readonly AuditRunnerOptions _options;
    private readonly ActivitySource _activitySource;

    public AuditRunnerBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<AuditRunnerOptions> options,
        ILogger<AuditRunnerBackgroundService> logger,
        ActivitySource activitySource)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _options = options.Value;
        _activitySource = activitySource;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AuditRunnerBackgroundService started (MaxConcurrent={Max}, MaxAttempts={Attempts}).",
            _options.MaxConcurrentRuns, _options.MaxAttempts);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

                if (await db.AuditRuns.CountAsync(a => a.Status == "running", stoppingToken) >= _options.MaxConcurrentRuns)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    continue;
                }

                var next = await TryReserveOneAsync(db, stoppingToken);
                if (next is null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    continue;
                }

                using (LogContext.PushProperty("AuditRunId", next.Id))
                using (var activity = _activitySource.StartActivity("AuditRun.Execute", ActivityKind.Internal))
                {
                activity?.SetTag("auditRun.id", next.Id);
                activity?.SetTag("auditRun.status.initial", next.Status);
                if (Uri.TryCreate(next.TargetUrl, UriKind.Absolute, out var uri))
                {
                    activity?.SetTag("auditRun.targetHost", uri.Host);
                }

                using (LogContext.PushProperty("TraceId", Activity.Current?.TraceId.ToString() ?? string.Empty))
                using (LogContext.PushProperty("SpanId", Activity.Current?.SpanId.ToString() ?? string.Empty))
                {
                _logger.LogInformation("Starting audit run {AuditRunId} for {TargetUrl} (attempt {Attempt})",
                    next.Id, next.TargetUrl, next.AttemptCount + 1);
                AuditMetrics.IncrementRunsStarted();

                var runDirRelative = Path.Combine("reports", "runs", next.Id.ToString("N"));
                next.RunDir = runDirRelative;
                await db.SaveChangesAsync(stoppingToken);

                var runner = scope.ServiceProvider.GetRequiredService<IAuditRunner>();

                AuditCredentialContext? credentialContext = null;
                var credential = await db.AuditTargetCredentials
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.AuditRunId == next.Id, stoppingToken);

                if (credential is not null)
                {
                    // The encrypted password will be decrypted inside the credential protector
                    // when the runner process is started; no plaintext is logged or persisted.
                    var protector = scope.ServiceProvider.GetRequiredService<ICredentialProtector>();
                    var password = protector.Unprotect(credential.EncryptedPassword);
                    credentialContext = new AuditCredentialContext
                    {
                        Username = credential.Username,
                        Password = password,
                        TwoFactorNote = credential.TwoFactorNote
                    };
                }

                var success = await runner.RunAsync(next, credentialContext, runDirRelative, stoppingToken);

                var finishedAt = DateTimeOffset.UtcNow;
                next.FinishedAt = finishedAt;

                if (success)
                {
                    next.Status = "completed";
                    next.LastError = null;
                    next.ErrorType = null;
                    db.AuditRuns.Update(next);
                    var ingestor = scope.ServiceProvider.GetRequiredService<IAuditResultIngestor>();
                    await ingestor.IngestAsync(next.Id, stoppingToken);
                    await db.SaveChangesAsync(stoppingToken);
                    if (next.DurationMs.HasValue)
                    {
                        AuditMetrics.AddRunDuration(next.DurationMs.Value);
                    }
                    activity?.SetTag("auditRun.status.final", next.Status);
                    activity?.SetTag("auditRun.success", true);
                    _logger.LogInformation("Audit run {AuditRunId} finished with status completed.", next.Id);
                }
                else
                {
                    next.AttemptCount++;
                    next.RetryCount = next.AttemptCount;
                    if (string.IsNullOrWhiteSpace(next.LastError))
                    {
                        next.LastError = "Runner exited with failure (exit code 1 or exception).";
                    }
                    if (next.AttemptCount < _options.MaxAttempts)
                    {
                        next.Status = "queued";
                        next.StartedAt = null;
                        next.RunDir = null;
                        var backoffSeconds = Math.Pow(2, next.AttemptCount);
                        next.RetryAfterUtc = DateTimeOffset.UtcNow.AddSeconds(backoffSeconds);
                        AuditMetrics.IncrementRunsRetries();
                        activity?.SetTag("auditRun.status.final", next.Status);
                        activity?.SetTag("auditRun.success", false);
                        _logger.LogWarning("Audit run {AuditRunId} failed (attempt {Attempt}); re-queued for retry after {Backoff}s. LastError={LastError}",
                            next.Id, next.AttemptCount, (int)backoffSeconds, next.LastError);
                    }
                    else
                    {
                        next.Status = "failed";
                        next.RetryAfterUtc = null;
                        activity?.SetTag("auditRun.status.final", next.Status);
                        activity?.SetTag("auditRun.success", false);
                        _logger.LogError("Audit run {AuditRunId} failed after {Attempts} attempts. LastError={LastError}", next.Id, next.AttemptCount, next.LastError);
                    }
                    db.AuditRuns.Update(next);
                    await db.SaveChangesAsync(stoppingToken);
                }
                } // end TraceId/SpanId scope
                } // end Activity + AuditRunId scope
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Audit runner loop error.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        _logger.LogInformation("AuditRunnerBackgroundService stopping.");
    }

    /// <summary>Atomically reserve one queued job using SELECT FOR UPDATE SKIP LOCKED.</summary>
    private static async Task<AuditRun?> TryReserveOneAsync(KamuAuditDbContext db, CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var now = DateTimeOffset.UtcNow;
            var id = await db.Database
                .SqlQueryRaw<Guid>("""
                    SELECT "Id" AS "Value" FROM audit_runs
                    WHERE "Status" = 'queued'
                      AND ("RetryAfterUtc" IS NULL OR "RetryAfterUtc" <= {0})
                    ORDER BY "StartedAt" NULLS LAST
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                    """, now)
                .FirstOrDefaultAsync(cancellationToken);

            if (id == default)
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            var next = await db.AuditRuns.FindAsync([id], cancellationToken);
            if (next is null)
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            next.Status = "running";
            next.StartedAt = DateTimeOffset.UtcNow;
            next.RetryAfterUtc = null;

            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            return next;
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }
}

