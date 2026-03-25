using WebAudit.Core;

namespace WebAudit.Postgres;

/// <summary>IJobStore implementation backed by PostgreSQL.</summary>
public sealed class PostgresJobStore : IJobStore
{
    private readonly string _cs;
    private readonly string _runnerDir;

    public PostgresJobStore(string connectionString, string runnerDir)
    {
        _cs = connectionString;
        _runnerDir = runnerDir;
    }

    public void InsertQueuedJob(string jobId, string targetUrl, long createdAt, string runDirRel,
        string? externalTicketId, int maxLinks, int maxUiAttempts, string loginMode,
        string? identifier, int hasPassword, byte[]? secretPayload)
        => PostgresAudit.InsertQueuedJob(_cs, jobId, targetUrl, createdAt, runDirRel,
            externalTicketId, maxLinks, maxUiAttempts, loginMode, identifier, hasPassword, secretPayload);

    public void MarkRunning(string jobId) => PostgresAudit.MarkRunning(_cs, jobId);

    public void FinishJob(string jobId, string status, long finishedAt, int exitCode, string? errorMessage)
        => PostgresAudit.FinishJob(_cs, jobId, status, finishedAt, exitCode, errorMessage);

    public void MarkAborted(string jobId, string safeError) => PostgresAudit.MarkAborted(_cs, jobId, safeError);

    public void MarkNotRun(string jobId, string safeError) => PostgresAudit.MarkNotRun(_cs, jobId, safeError);

    public AuditJob? GetJobById(string jobId)
    {
        using var conn = PostgresAudit.Open(_cs);
        return PostgresAudit.ReadJobById(conn, jobId);
    }

    public void ReconcileIfCompleted(string runnerDir, string jobId, string status, string runDir)
        => PostgresAudit.ReconcileIfCompleted(_cs, runnerDir, jobId, status, runDir);

    public void UpsertSummaryAndFindings(string jobId, string summaryPath)
    {
        if (!File.Exists(summaryPath)) return;
        using var conn = PostgresAudit.Open(_cs);
        PostgresAudit.UpsertSummaryAndFindings(conn, jobId, summaryPath);
    }

    public void DeleteJob(string jobId)
    {
        using var conn = PostgresAudit.Open(_cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM audit_jobs WHERE id=@id";
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
    }

    public string? GetRunDir(string jobId)
    {
        using var conn = PostgresAudit.Open(_cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=@id LIMIT 1";
        cmd.Parameters.AddWithValue("id", jobId);
        return cmd.ExecuteScalar() as string;
    }
}
