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
        var auditDays = _retentionOptions.AuditRunsDays > 0
            ? _retentionOptions.AuditRunsDays
            : _retentionOptions.KeepDays;
        var artifactDays = _retentionOptions.ArtifactsDays > 0
            ? _retentionOptions.ArtifactsDays
            : auditDays;

        if (auditDays <= 0 && artifactDays <= 0)
        {
            _logger.LogWarning("Retention enabled but neither AuditRunsDays nor ArtifactsDays is positive; skipping cleanup.");
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var auditCutoff = auditDays > 0 ? now.AddDays(-auditDays) : (DateTimeOffset?)null;
        var artifactCutoff = artifactDays > 0 ? now.AddDays(-artifactDays) : (DateTimeOffset?)null;

        var baseDir = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, _runnerOptions.WorkingDirectory));
        var normalizedBaseDir = baseDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

        // 1) Filesystem purge (artifacts) – may have shorter retention than DB rows.
        if (artifactCutoff is not null)
        {
            var artifactCandidates = await db.AuditRuns
                .Where(a => a.Status != "running")
                .Where(a => (a.FinishedAt ?? a.CreatedAt) < artifactCutoff.Value)
                .Select(a => new { a.Id, a.RunDir })
                .ToListAsync(cancellationToken);

            if (artifactCandidates.Count == 0)
            {
                _logger.LogInformation("Retention cleanup (artifacts) found no audit runs older than {Cutoff}.", artifactCutoff);
            }
            else
            {
                foreach (var item in artifactCandidates)
                {
                    if (string.IsNullOrWhiteSpace(item.RunDir))
                    {
                        continue;
                    }

                    var runDirFull = Path.GetFullPath(Path.Combine(baseDir, item.RunDir));
                    var normalizedRunDir = runDirFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                        + Path.DirectorySeparatorChar;

                    // Safety: ensure runDirFull is under the configured working directory.
                    if (!normalizedRunDir.StartsWith(normalizedBaseDir, StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogWarning("Skipping deletion of RunDir {RunDirFull} for audit run {AuditRunId} because it is outside the runner working directory.", runDirFull, item.Id);
                        continue;
                    }

                    if (!Directory.Exists(runDirFull))
                    {
                        continue;
                    }

                    if (_retentionOptions.DryRun)
                    {
                        _logger.LogInformation("DryRun: would delete reports directory {RunDirFull} for audit run {AuditRunId}.", runDirFull, item.Id);
                        continue;
                    }

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
        }

        // 2) DB purge – delete audit_runs rows, cascades to findings/instances/gaps/coverage.
        if (auditCutoff is not null)
        {
            var ids = await db.AuditRuns
                .Where(a => a.Status != "running")
                .Where(a => (a.FinishedAt ?? a.CreatedAt) < auditCutoff.Value)
                .Select(a => a.Id)
                .ToListAsync(cancellationToken);

            if (ids.Count == 0)
            {
                _logger.LogInformation("Retention cleanup (audit_runs) found no rows older than {Cutoff}.", auditCutoff);
                return;
            }

            _logger.LogInformation("Retention cleanup will delete {Count} audit runs older than {Cutoff}.", ids.Count, auditCutoff);

            if (_retentionOptions.DryRun)
            {
                _logger.LogInformation("DryRun is enabled; skipping deletion of {Count} audit runs.", ids.Count);
                return;
            }

            var runsToDelete = await db.AuditRuns
                .Where(a => ids.Contains(a.Id))
                .ToListAsync(cancellationToken);

            db.AuditRuns.RemoveRange(runsToDelete);
            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Retention cleanup deleted {Count} audit runs (and associated findings/gaps/coverage).", runsToDelete.Count);
        }
    }
}

