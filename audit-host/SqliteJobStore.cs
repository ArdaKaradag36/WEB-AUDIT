using WebAudit.Core;

namespace AuditHost;

/// <summary>IJobStore implementation backed by SQLite (audit-host.db).</summary>
public sealed class SqliteJobStore : IJobStore
{
    private readonly string _dbPath;
    private readonly string _runnerDir;

    public SqliteJobStore(string dbPath, string runnerDir)
    {
        _dbPath = dbPath;
        _runnerDir = runnerDir;
    }

    public void InsertQueuedJob(string jobId, string targetUrl, long createdAt, string runDirRel,
        string? externalTicketId, int maxLinks, int maxUiAttempts, string loginMode,
        string? identifier, int hasPassword, byte[]? secretPayload)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, """
            INSERT INTO audit_jobs(id,target_url,status,created_at,run_dir,external_ticket_id)
            VALUES ($id,$target,'queued',$created,$run_dir,$ticket)
            """,
            ("$id", jobId), ("$target", targetUrl), ("$created", createdAt),
            ("$run_dir", runDirRel), ("$ticket", externalTicketId ?? (object)DBNull.Value));

        AuditDb.Exec(conn, """
            INSERT INTO audit_credentials(job_id,login_mode,identifier,has_password)
            VALUES ($job_id,$login_mode,$identifier,$has_password)
            """,
            ("$job_id", jobId), ("$login_mode", loginMode),
            ("$identifier", identifier ?? ""), ("$has_password", hasPassword));
    }

    public void MarkRunning(string jobId)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, "UPDATE audit_jobs SET status='running', started_at=$started WHERE id=$id",
            ("$started", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$id", jobId));
    }

    public void FinishJob(string jobId, string status, long finishedAt, int exitCode, string? errorMessage)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, """
            UPDATE audit_jobs SET status=$status, finished_at=$finished, exit_code=$exit_code, error_message=$error
            WHERE id=$id
            """,
            ("$status", status), ("$finished", finishedAt), ("$exit_code", exitCode),
            ("$error", errorMessage ?? ""), ("$id", jobId));
    }

    public void MarkAborted(string jobId, string safeError)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, """
            UPDATE audit_jobs SET status='aborted', finished_at=$finished, exit_code=-2, error_message=$error
            WHERE id=$id
            """,
            ("$finished", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$error", safeError), ("$id", jobId));
    }

    public void MarkNotRun(string jobId, string safeError)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, """
            UPDATE audit_jobs SET status='notrun', finished_at=$finished, exit_code=-1, error_message=$error
            WHERE id=$id
            """,
            ("$finished", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$error", safeError), ("$id", jobId));
    }

    public AuditJob? GetJobById(string jobId)
    {
        using var conn = AuditDb.Open(_dbPath);
        return AuditDb.ReadJobById(conn, jobId);
    }

    public void ReconcileIfCompleted(string runnerDir, string jobId, string status, string runDir)
        => AuditDb.ReconcileIfCompleted(_dbPath, runnerDir, jobId, status, runDir);

    public void UpsertSummaryAndFindings(string jobId, string summaryPath)
    {
        if (!File.Exists(summaryPath)) return;
        if (!SummaryJsonParser.TryParseMetricsFromFile(summaryPath, out var findings, out var pages,
                out var requests, out var skipped, out var tested, out var total, out var skippedUi, out var failed))
            return;
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, """
            INSERT INTO audit_summary_cache(
              job_id, findings_by_severity_json, pages_scanned, requests_total, skipped_network,
              tested_ui_elements, total_ui_elements, skipped_ui_elements, failed_ui_elements, updated_at)
            VALUES ($job_id,$findings,$pages,$requests,$skipped,$tested,$total,$skipped_ui,$failed,$updated)
            ON CONFLICT(job_id) DO UPDATE SET
              findings_by_severity_json=excluded.findings_by_severity_json,
              pages_scanned=excluded.pages_scanned,
              requests_total=excluded.requests_total,
              skipped_network=excluded.skipped_network,
              tested_ui_elements=excluded.tested_ui_elements,
              total_ui_elements=excluded.total_ui_elements,
              skipped_ui_elements=excluded.skipped_ui_elements,
              failed_ui_elements=excluded.failed_ui_elements,
              updated_at=excluded.updated_at
            """,
            ("$job_id", jobId), ("$findings", findings), ("$pages", pages),
            ("$requests", requests), ("$skipped", skipped), ("$tested", tested),
            ("$total", total), ("$skipped_ui", skippedUi), ("$failed", failed),
            ("$updated", DateTimeOffset.UtcNow.ToUnixTimeSeconds()));
        NormalizedFindingStore.UpsertSqlite(conn, jobId, summaryPath);
    }

    public void DeleteJob(string jobId)
    {
        using var conn = AuditDb.Open(_dbPath);
        AuditDb.Exec(conn, "DELETE FROM audit_summary_cache WHERE job_id=$id", ("$id", jobId));
        AuditDb.Exec(conn, "DELETE FROM audit_normalized_findings WHERE job_id=$id", ("$id", jobId));
        AuditDb.Exec(conn, "DELETE FROM audit_credentials WHERE job_id=$id", ("$id", jobId));
        AuditDb.Exec(conn, "DELETE FROM audit_jobs WHERE id=$id", ("$id", jobId));
    }

    public string? GetRunDir(string jobId)
    {
        using var conn = AuditDb.Open(_dbPath);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=$id LIMIT 1";
        cmd.Parameters.AddWithValue("$id", jobId);
        return cmd.ExecuteScalar() as string;
    }
}
