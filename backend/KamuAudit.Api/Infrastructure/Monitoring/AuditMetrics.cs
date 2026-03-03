using System.Threading;

namespace KamuAudit.Api.Infrastructure.Monitoring;

/// <summary>
/// In-memory counters for simple /metrics exposition.
/// Thread-safe via Interlocked operations.
/// </summary>
public static class AuditMetrics
{
    private static long _runsStartedTotal;
    private static long _runsRetriesTotal;
    private static long _ingestionFailuresTotal;
    private static long _runnerTimeoutsTotal;
    private static long _runDurationCount;
    private static long _runDurationSumMs;

    public static void IncrementRunsStarted() => Interlocked.Increment(ref _runsStartedTotal);

    public static void IncrementRunsRetries() => Interlocked.Increment(ref _runsRetriesTotal);

    public static void IncrementIngestionFailures() => Interlocked.Increment(ref _ingestionFailuresTotal);

    public static void IncrementRunnerTimeouts() => Interlocked.Increment(ref _runnerTimeoutsTotal);

    public static void AddRunDuration(long durationMs)
    {
        if (durationMs < 0)
        {
            return;
        }

        Interlocked.Increment(ref _runDurationCount);
        Interlocked.Add(ref _runDurationSumMs, durationMs);
    }

    public static MetricsSnapshot Snapshot() => new(
        Interlocked.Read(ref _runsStartedTotal),
        Interlocked.Read(ref _runsRetriesTotal),
        Interlocked.Read(ref _ingestionFailuresTotal),
        Interlocked.Read(ref _runnerTimeoutsTotal),
        Interlocked.Read(ref _runDurationCount),
        Interlocked.Read(ref _runDurationSumMs));

    public readonly record struct MetricsSnapshot(
        long RunsStartedTotal,
        long RunsRetriesTotal,
        long IngestionFailuresTotal,
        long RunnerTimeoutsTotal,
        long RunDurationCount,
        long RunDurationSumMs);
}

