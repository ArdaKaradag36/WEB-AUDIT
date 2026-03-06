using System;
using System.Threading;
using System.Threading.Tasks;
using KamuAudit.Api.Domain.Entities;
using KamuAudit.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// Centralized leasing logic for <see cref="AuditRun"/> rows using SELECT ... FOR UPDATE SKIP LOCKED.
/// </summary>
public static class AuditRunLeasing
{
    /// <summary>
    /// Attempts to reserve the next runnable audit run for the given lease owner.
    /// This uses a single SQL statement with FOR UPDATE SKIP LOCKED to guarantee
    /// that no two workers can reserve the same row concurrently.
    /// </summary>
    public static async Task<AuditRun?> TryReserveNextAsync(
        KamuAuditDbContext db,
        string leaseOwner,
        TimeSpan leaseDuration,
        CancellationToken cancellationToken = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var now = DateTimeOffset.UtcNow;

            // Select next runnable row:
            // - queued
            //   OR running with expired lease (zombie recovery)
            // - RetryAfterUtc <= now()
            // - ordered by CreatedAt for fairness/determinism
            var id = await db.Database
                .SqlQueryRaw<Guid>(
                    """
                    SELECT "Id" AS "Value" FROM audit_runs
                    WHERE ("Status" = 'queued'
                           OR ("Status" = 'running' AND ("LeaseUntil" IS NULL OR "LeaseUntil" <= {0})))
                      AND ("RetryAfterUtc" IS NULL OR "RetryAfterUtc" <= {0})
                    ORDER BY "CreatedAt"
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                    """,
                    now)
                .FirstOrDefaultAsync(cancellationToken);

            if (id == default)
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            var run = await db.AuditRuns.FindAsync([id], cancellationToken);
            if (run is null)
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            run.Status = "running";
            run.StartedAt ??= now;
            run.RetryAfterUtc = null;
            run.LeaseOwner = leaseOwner;
            run.LeaseUntil = now.Add(leaseDuration);
            run.LeaseVersion = run.LeaseVersion <= 0 ? 1 : run.LeaseVersion + 1;

            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            return run;
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }
}

