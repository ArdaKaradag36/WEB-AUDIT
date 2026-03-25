namespace WebAudit.Core;

/// <summary>
/// Abstraction over the persistence layer for audit jobs.
/// Implementations: SqliteJobStore (audit-host) and PostgresJobStore (WebAudit.Postgres).
/// </summary>
public interface IJobStore
{
    void InsertQueuedJob(string jobId, string targetUrl, long createdAt, string runDirRel,
        string? externalTicketId, int maxLinks, int maxUiAttempts, string loginMode,
        string? identifier, int hasPassword, byte[]? secretPayload);

    void MarkRunning(string jobId);

    void FinishJob(string jobId, string status, long finishedAt, int exitCode, string? errorMessage);

    void MarkAborted(string jobId, string safeError);

    void MarkNotRun(string jobId, string safeError);

    AuditJob? GetJobById(string jobId);

    void ReconcileIfCompleted(string runnerDir, string jobId, string status, string runDir);

    void UpsertSummaryAndFindings(string jobId, string summaryPath);

    void DeleteJob(string jobId);

    string? GetRunDir(string jobId);
}
