using System.Diagnostics;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// Periodically deletes old audit runs (and cascaded findings/gaps) and prunes corresponding
/// runner report directories on disk.
/// </summary>
public sealed class RetentionCleanupBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RetentionCleanupBackgroundService> _logger;
    private readonly AuditRunnerOptions _runnerOptions;
    private readonly RetentionOptions _retentionOptions;

    public RetentionCleanupBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<AuditRunnerOptions> runnerOptions,
        IOptions<RetentionOptions> retentionOptions,
        ILogger<RetentionCleanupBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _runnerOptions = runnerOptions.Value;
        _retentionOptions = retentionOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run once shortly after startup, then every 24 hours.
        var initialDelay = TimeSpan.FromMinutes(1);
        try
        {
            await Task.Delay(initialDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_retentionOptions.Enabled)
                {
                    await RunCleanupAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // shutting down
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Retention cleanup job failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        if (_retentionOptions.KeepDays <= 0)
        {
            _logger.LogWarning("Retention enabled but KeepDays={KeepDays} is not positive; skipping cleanup.", _retentionOptions.KeepDays);
            return;
        }

        var cutoff = DateTimeOffset.UtcNow.AddDays(-_retentionOptions.KeepDays);
        var workingDirectory = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, _runnerOptions.WorkingDirectory));

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

        var candidates = await db.AuditRuns
            .Where(a =>
                a.FinishedAt != null &&
                a.FinishedAt < cutoff &&
                a.Status != "running")
            .Select(a => new { a.Id, a.RunDir })
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            _logger.LogInformation("Retention cleanup found no audit runs older than {Cutoff}.", cutoff);
            return;
        }

        _logger.LogInformation("Retention cleanup will delete {Count} audit runs older than {Cutoff}.", candidates.Count, cutoff);

        foreach (var item in candidates)
        {
            if (string.IsNullOrWhiteSpace(item.RunDir))
            {
                continue;
            }

            var runDirFull = Path.GetFullPath(Path.Combine(workingDirectory, item.RunDir));

            // Safety: ensure runDirFull is under the configured working directory.
            if (!runDirFull.StartsWith(workingDirectory, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Skipping deletion of RunDir {RunDirFull} for audit run {AuditRunId} because it is outside the runner working directory.", runDirFull, item.Id);
                continue;
            }

            if (Directory.Exists(runDirFull))
            {
                try
                {
                    Directory.Delete(runDirFull, recursive: true);
                    _logger.LogInformation("Deleted reports directory {RunDirFull} for audit run {AuditRunId}.", runDirFull, item.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete reports directory {RunDirFull} for audit run {AuditRunId}.", runDirFull, item.Id);
                }
            }
        }

        // Delete audit_runs rows (cascades to findings/gaps).
        var ids = candidates.Select(c => c.Id).ToList();
        var runsToDelete = await db.AuditRuns
            .Where(a => ids.Contains(a.Id))
            .ToListAsync(cancellationToken);

        db.AuditRuns.RemoveRange(runsToDelete);
        await db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Retention cleanup deleted {Count} audit runs (and associated findings/gaps).", runsToDelete.Count);
    }
}

