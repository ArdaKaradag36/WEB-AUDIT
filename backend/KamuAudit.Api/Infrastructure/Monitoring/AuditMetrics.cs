using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;

namespace KamuAudit.Api.Infrastructure.Monitoring;

/// <summary>
/// In-memory counters for simple /metrics exposition.
/// Thread-safe via Interlocked operations and concurrent collections.
/// </summary>
public static class AuditMetrics
{
    private static long _runsStartedTotal;
    private static long _runsRetriesTotal;
    private static long _ingestionFailuresTotal;
    private static long _runnerTimeoutsTotal;
    private static long _runDurationCount;
    private static long _runDurationSumMs;

    private static long _ingestionDurationCount;
    private static long _ingestionDurationSumMs;
    private static long _idempotencyConflictsTotal;

    private static long _apiRequestDurationCount;
    private static long _apiRequestDurationSumMs;

    private static long _runnerPagesScannedTotal;
    private static long _runnerRequestsTotal;
    private static long _runnerRequestsFailedTotal;
    private static long _runnerSkippedNetworkTotal;

    private static readonly ConcurrentDictionary<string, long> RunnerFindingsBySeverity =
        new(StringComparer.OrdinalIgnoreCase);

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

    public static void AddIngestionDuration(long durationMs)
    {
        if (durationMs < 0)
        {
            return;
        }

        Interlocked.Increment(ref _ingestionDurationCount);
        Interlocked.Add(ref _ingestionDurationSumMs, durationMs);
    }

    public static void IncrementIdempotencyConflicts() => Interlocked.Increment(ref _idempotencyConflictsTotal);

    public static void AddApiRequestDuration(long durationMs)
    {
        if (durationMs < 0)
        {
            return;
        }

        Interlocked.Increment(ref _apiRequestDurationCount);
        Interlocked.Add(ref _apiRequestDurationSumMs, durationMs);
    }

    public static void AddRunnerMetrics(long? durationMs, int? pagesScanned, int? requestsTotal, int? requestsFailed, int? skippedNetwork)
    {
        if (durationMs.HasValue && durationMs.Value >= 0)
        {
            AddRunDuration(durationMs.Value);
        }

        if (pagesScanned.HasValue && pagesScanned.Value > 0)
        {
            Interlocked.Add(ref _runnerPagesScannedTotal, pagesScanned.Value);
        }

        if (requestsTotal.HasValue && requestsTotal.Value > 0)
        {
            Interlocked.Add(ref _runnerRequestsTotal, requestsTotal.Value);
        }

        if (requestsFailed.HasValue && requestsFailed.Value > 0)
        {
            Interlocked.Add(ref _runnerRequestsFailedTotal, requestsFailed.Value);
        }

        if (skippedNetwork.HasValue && skippedNetwork.Value > 0)
        {
            Interlocked.Add(ref _runnerSkippedNetworkTotal, skippedNetwork.Value);
        }
    }

    public static void AddRunnerFindingsBySeverity(string? severity, long count)
    {
        if (string.IsNullOrWhiteSpace(severity) || count <= 0)
        {
            return;
        }

        var key = severity.Trim().ToLowerInvariant();
        RunnerFindingsBySeverity.AddOrUpdate(key, count, (_, existing) => existing + count);
    }

    public static MetricsSnapshot Snapshot()
    {
        var findings = RunnerFindingsBySeverity.ToArray();
        var findingsDict = new Dictionary<string, long>(findings.Length, StringComparer.OrdinalIgnoreCase);
        foreach (var kv in findings)
        {
            findingsDict[kv.Key] = kv.Value;
        }

        return new MetricsSnapshot(
            Interlocked.Read(ref _runsStartedTotal),
            Interlocked.Read(ref _runsRetriesTotal),
            Interlocked.Read(ref _ingestionFailuresTotal),
            Interlocked.Read(ref _runnerTimeoutsTotal),
            Interlocked.Read(ref _runDurationCount),
            Interlocked.Read(ref _runDurationSumMs),
            Interlocked.Read(ref _ingestionDurationCount),
            Interlocked.Read(ref _ingestionDurationSumMs),
            Interlocked.Read(ref _idempotencyConflictsTotal),
            Interlocked.Read(ref _apiRequestDurationCount),
            Interlocked.Read(ref _apiRequestDurationSumMs),
            Interlocked.Read(ref _runnerPagesScannedTotal),
            Interlocked.Read(ref _runnerRequestsTotal),
            Interlocked.Read(ref _runnerRequestsFailedTotal),
            Interlocked.Read(ref _runnerSkippedNetworkTotal),
            findingsDict);
    }

    public readonly record struct MetricsSnapshot(
        long RunsStartedTotal,
        long RunsRetriesTotal,
        long IngestionFailuresTotal,
        long RunnerTimeoutsTotal,
        long RunDurationCount,
        long RunDurationSumMs,
        long IngestionDurationCount,
        long IngestionDurationSumMs,
        long IdempotencyConflictsTotal,
        long ApiRequestDurationCount,
        long ApiRequestDurationSumMs,
        long RunnerPagesScannedTotal,
        long RunnerRequestsTotal,
        long RunnerRequestsFailedTotal,
        long RunnerSkippedNetworkTotal,
        IReadOnlyDictionary<string, long> RunnerFindingsBySeverity);
}

