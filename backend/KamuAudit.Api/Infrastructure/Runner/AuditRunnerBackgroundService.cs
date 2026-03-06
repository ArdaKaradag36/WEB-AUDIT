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
    private readonly string _workerId;

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
        _workerId = $"{Environment.MachineName}-{Guid.NewGuid():N}";
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

                var leaseDuration = TimeSpan.FromSeconds(Math.Max(30, _options.MaxRunDurationMinutes * 60));
                var next = await AuditRunLeasing.TryReserveNextAsync(db, _workerId, leaseDuration, stoppingToken);
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
                _logger.LogInformation("Starting audit run {AuditRunId} for {TargetUrl} (attempt {Attempt}) (Worker={WorkerId})",
                    next.Id, next.TargetUrl, next.AttemptCount + 1, _workerId);
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

                using var leaseCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                var leaseRefreshTask = RefreshLeaseAsync(next.Id, leaseDuration, leaseCts.Token);

                var success = await runner.RunAsync(next, credentialContext, runDirRelative, stoppingToken);

                leaseCts.Cancel();
                try
                {
                    await leaseRefreshTask;
                }
                catch (OperationCanceledException)
                {
                    // expected when lease refresh loop is cancelled
                }

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

    private async Task RefreshLeaseAsync(Guid auditRunId, TimeSpan leaseDuration, CancellationToken cancellationToken)
    {
        // Heartbeat: periodically extend LeaseUntil for the currently owned run.
        var interval = TimeSpan.FromSeconds(Math.Max(10, leaseDuration.TotalSeconds / 2));

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

            var run = await db.AuditRuns.FirstOrDefaultAsync(a => a.Id == auditRunId && a.LeaseOwner == _workerId, cancellationToken);
            if (run is null)
            {
                // Run deleted or lease taken over.
                break;
            }

            if (string.Equals(run.Status, "completed", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(run.Status, "failed", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(run.Status, "canceled", StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            run.LeaseUntil = DateTimeOffset.UtcNow.Add(leaseDuration);
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

