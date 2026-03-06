using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace KamuAudit.Api.Infrastructure.Idempotency;

/// <summary>
/// Periodically purges expired idempotency_keys rows to keep the table size bounded.
/// Runs once per day by default.
/// </summary>
public sealed class IdempotencyCleanupBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<IdempotencyCleanupBackgroundService> _logger;
    private readonly IdempotencyOptions _options;

    public IdempotencyCleanupBackgroundService(
        IServiceProvider services,
        IOptions<IdempotencyOptions> options,
        ILogger<IdempotencyCleanupBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Simple daily loop; in production this could be replaced by a cron-like scheduler.
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PurgeExpiredKeysAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while purging expired idempotency keys.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromDays(1), stoppingToken);
            }
            catch (TaskCanceledException)
            {
                // service is stopping
            }
        }
    }

    private async Task PurgeExpiredKeysAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KamuAuditDbContext>();

        var now = DateTimeOffset.UtcNow;
        var batchSize = 500;

        while (!cancellationToken.IsCancellationRequested)
        {
            var batch = await db.IdempotencyKeys
                .Where(k => k.ExpiresAt <= now)
                .OrderBy(k => k.ExpiresAt)
                .Take(batchSize)
                .ToListAsync(cancellationToken);

            if (batch.Count == 0)
            {
                break;
            }

            db.IdempotencyKeys.RemoveRange(batch);
            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Purged {Count} expired idempotency keys.", batch.Count);
        }
    }
}

