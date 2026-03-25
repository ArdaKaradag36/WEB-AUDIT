using Npgsql;
using NpgsqlTypes;
using WebAudit.Core;

namespace WebAudit.Postgres;

public static class PostgresAudit
{
    public static void EnsureSchema(string connectionString)
    {
        using var conn = Open(connectionString);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS audit_jobs (
              id TEXT PRIMARY KEY,
              target_url TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at BIGINT NOT NULL,
              started_at BIGINT,
              finished_at BIGINT,
              run_dir TEXT NOT NULL,
              exit_code INT,
              error_message TEXT,
              external_ticket_id TEXT,
              max_links INT NOT NULL DEFAULT 35,
              max_ui_attempts INT NOT NULL DEFAULT 220,
              login_mode TEXT NOT NULL DEFAULT 'none',
              identifier TEXT,
              has_password INT NOT NULL DEFAULT 0,
              secret_payload BYTEA
            );
            CREATE TABLE IF NOT EXISTS audit_credentials (
              job_id TEXT PRIMARY KEY REFERENCES audit_jobs (id) ON DELETE CASCADE,
              login_mode TEXT NOT NULL,
              identifier TEXT,
              has_password INT NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS audit_summary_cache (
              job_id TEXT PRIMARY KEY REFERENCES audit_jobs (id) ON DELETE CASCADE,
              findings_by_severity_json TEXT,
              pages_scanned INT,
              requests_total INT,
              skipped_network INT,
              tested_ui_elements INT NOT NULL DEFAULT 0,
              total_ui_elements INT NOT NULL DEFAULT 0,
              skipped_ui_elements INT NOT NULL DEFAULT 0,
              failed_ui_elements INT NOT NULL DEFAULT 0,
              updated_at BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_normalized_findings (
              id BIGSERIAL PRIMARY KEY,
              job_id TEXT NOT NULL REFERENCES audit_jobs (id) ON DELETE CASCADE,
              fingerprint TEXT NOT NULL,
              rule_id TEXT,
              severity TEXT,
              category TEXT,
              title TEXT,
              detail TEXT,
              evidence_json JSONB,
              created_at BIGINT NOT NULL,
              UNIQUE (job_id, fingerprint)
            );
            CREATE INDEX IF NOT EXISTS ix_audit_normalized_findings_job ON audit_normalized_findings (job_id);
            CREATE TABLE IF NOT EXISTS immutable_audit_events (
              id BIGSERIAL PRIMARY KEY,
              seq BIGINT NOT NULL UNIQUE,
              event_ts BIGINT NOT NULL,
              event_type TEXT NOT NULL,
              actor TEXT,
              subject TEXT,
              payload_json TEXT NOT NULL,
              prev_hash TEXT NOT NULL,
              entry_hash TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_audit_jobs_status_created ON audit_jobs (status, created_at);
            """;
        cmd.ExecuteNonQuery();
    }

    public static void Ping(string connectionString)
    {
        using var conn = Open(connectionString);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT 1";
        cmd.ExecuteScalar();
    }

    public static void InsertQueuedJob(string cs, string jobId, string targetUrl, long createdAt, string runDirRel,
        string? ticket, int maxLinks, int maxUiAttempts, string loginMode, string? identifier, int hasPassword, byte[]? secretPayload)
    {
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO audit_jobs(
              id,target_url,status,created_at,run_dir,external_ticket_id,max_links,max_ui_attempts,
              login_mode,identifier,has_password,secret_payload)
            VALUES (@id,@url,'queued',@created,@run,@ticket,@ml,@mui,@lm,@ident,@hp,@sec)
            """;
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.Parameters.AddWithValue("url", targetUrl);
        cmd.Parameters.AddWithValue("created", createdAt);
        cmd.Parameters.AddWithValue("run", runDirRel);
        cmd.Parameters.AddWithValue("ticket", ticket ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("ml", maxLinks);
        cmd.Parameters.AddWithValue("mui", maxUiAttempts);
        cmd.Parameters.AddWithValue("lm", loginMode);
        cmd.Parameters.AddWithValue("ident", identifier ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("hp", hasPassword);
        cmd.Parameters.Add("sec", NpgsqlDbType.Bytea).Value = secretPayload ?? (object)DBNull.Value;
        cmd.ExecuteNonQuery();

        using var c2 = conn.CreateCommand();
        c2.CommandText = """
            INSERT INTO audit_credentials(job_id,login_mode,identifier,has_password)
            VALUES (@job_id,@lm,@ident,@hp)
            ON CONFLICT (job_id) DO UPDATE SET login_mode=EXCLUDED.login_mode,identifier=EXCLUDED.identifier,has_password=EXCLUDED.has_password
            """;
        c2.Parameters.AddWithValue("job_id", jobId);
        c2.Parameters.AddWithValue("lm", loginMode);
        c2.Parameters.AddWithValue("ident", identifier ?? "");
        c2.Parameters.AddWithValue("hp", hasPassword);
        c2.ExecuteNonQuery();
    }

    public static NpgsqlConnection Open(string connectionString)
    {
        var c = new NpgsqlConnection(connectionString);
        c.Open();
        return c;
    }

    public static AuditJob ReadJob(NpgsqlDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.IsDBNull(3) ? 0 : reader.GetInt64(3),
        reader.IsDBNull(4) ? 0 : reader.GetInt64(4),
        reader.IsDBNull(5) ? 0 : reader.GetInt64(5),
        reader.IsDBNull(6) ? "" : reader.GetString(6),
        reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
        reader.IsDBNull(8) ? "" : reader.GetString(8),
        reader.IsDBNull(9) ? null : reader.GetString(9));

    public static AuditJob? ReadJobById(NpgsqlConnection conn, string id)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message,external_ticket_id
            FROM audit_jobs WHERE id=@id LIMIT 1
            """;
        cmd.Parameters.AddWithValue("id", id);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return ReadJob(reader);
    }

    public static void ReconcileStuckJobs(string cs, string runnerDir, int maxAgeMinutes = 120)
    {
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-maxAgeMinutes).ToUnixTimeSeconds();
        var victims = new List<(string Id, string RunDir)>();
        using (var conn = Open(cs))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id, run_dir FROM audit_jobs WHERE (status='running' AND started_at < @cut) OR (status='queued' AND created_at < @cut)";
            cmd.Parameters.AddWithValue("cut", cutoff);
            using var r = cmd.ExecuteReader();
            while (r.Read()) victims.Add((r.GetString(0), r.GetString(1)));
        }
        foreach (var (id, runDir) in victims)
        {
            var runComplete = Path.Combine(runnerDir, runDir, "run.complete.json");
            var newStatus = File.Exists(runComplete) ? "success" : "error";
            var msg = newStatus == "error" ? "Interrupted: stuck on startup" : (string?)null;
            using var conn = Open(cs);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE audit_jobs SET status=@st, finished_at=@ft, error_message=COALESCE(@msg, error_message) WHERE id=@id AND status IN ('running','queued')";
            cmd.Parameters.AddWithValue("st", newStatus);
            cmd.Parameters.AddWithValue("ft", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            cmd.Parameters.AddWithValue("msg", (object?)msg ?? DBNull.Value);
            cmd.Parameters.AddWithValue("id", id);
            cmd.ExecuteNonQuery();
            if (newStatus == "success")
            {
                var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
                if (File.Exists(summaryPath)) UpsertSummaryAndFindings(conn, id, summaryPath);
            }
        }
    }

    public static void ReconcileIfCompleted(string cs, string runnerDir, string jobId, string status, string runDir)
    {
        if (status is not ("running" or "queued")) return;
        var runComplete = Path.Combine(runnerDir, runDir, "run.complete.json");
        if (!File.Exists(runComplete)) return;
        var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE audit_jobs
            SET status=@st, finished_at=@ft
            WHERE id=@id AND status IN ('running','queued')
            """;
        cmd.Parameters.AddWithValue("st", "success");
        cmd.Parameters.AddWithValue("ft", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
        if (!File.Exists(summaryPath)) return;
        UpsertSummaryAndFindings(conn, jobId, summaryPath);
    }

    public static void UpsertSummaryAndFindings(NpgsqlConnection conn, string jobId, string summaryPath)
    {
        if (!SummaryJsonParser.TryParseMetricsFromFile(summaryPath, out var findings, out var pages, out var requests,
                out var skipped, out var tested, out var total, out var skippedUi, out var failed))
            return;
        var updated = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = """
                INSERT INTO audit_summary_cache(
                  job_id, findings_by_severity_json, pages_scanned, requests_total, skipped_network,
                  tested_ui_elements, total_ui_elements, skipped_ui_elements, failed_ui_elements, updated_at)
                VALUES (@job_id,@findings,@pages,@requests,@skipped,@tested,@total,@skipped_ui,@failed,@updated)
                ON CONFLICT (job_id) DO UPDATE SET
                  findings_by_severity_json=EXCLUDED.findings_by_severity_json,
                  pages_scanned=EXCLUDED.pages_scanned,
                  requests_total=EXCLUDED.requests_total,
                  skipped_network=EXCLUDED.skipped_network,
                  tested_ui_elements=EXCLUDED.tested_ui_elements,
                  total_ui_elements=EXCLUDED.total_ui_elements,
                  skipped_ui_elements=EXCLUDED.skipped_ui_elements,
                  failed_ui_elements=EXCLUDED.failed_ui_elements,
                  updated_at=EXCLUDED.updated_at
                """;
            cmd.Parameters.AddWithValue("job_id", jobId);
            cmd.Parameters.AddWithValue("findings", findings);
            cmd.Parameters.AddWithValue("pages", pages);
            cmd.Parameters.AddWithValue("requests", requests);
            cmd.Parameters.AddWithValue("skipped", skipped);
            cmd.Parameters.AddWithValue("tested", tested);
            cmd.Parameters.AddWithValue("total", total);
            cmd.Parameters.AddWithValue("skipped_ui", skippedUi);
            cmd.Parameters.AddWithValue("failed", failed);
            cmd.Parameters.AddWithValue("updated", updated);
            cmd.ExecuteNonQuery();
        }

        var text = File.ReadAllText(summaryPath);
        var norm = FindingNormalizer.FromSummaryJson(text);
        if (norm.Count == 0) return;
        using var tx = conn.BeginTransaction();
        using (var del = conn.CreateCommand())
        {
            del.Transaction = tx;
            del.CommandText = "DELETE FROM audit_normalized_findings WHERE job_id=@id";
            del.Parameters.AddWithValue("id", jobId);
            del.ExecuteNonQuery();
        }

        foreach (var row in norm)
        {
            using var ins = conn.CreateCommand();
            ins.Transaction = tx;
            ins.CommandText = """
                INSERT INTO audit_normalized_findings(job_id,fingerprint,rule_id,severity,category,title,detail,evidence_json,created_at)
                VALUES (@job_id,@fp,@rule,@sev,@cat,@title,@detail,@ev::jsonb,@created)
                ON CONFLICT (job_id,fingerprint) DO NOTHING
                """;
            ins.Parameters.AddWithValue("job_id", jobId);
            ins.Parameters.AddWithValue("fp", row.Fingerprint);
            ins.Parameters.AddWithValue("rule", (object?)row.RuleId ?? DBNull.Value);
            ins.Parameters.AddWithValue("sev", (object?)row.Severity ?? DBNull.Value);
            ins.Parameters.AddWithValue("cat", (object?)row.Category ?? DBNull.Value);
            ins.Parameters.AddWithValue("title", (object?)row.Title ?? DBNull.Value);
            ins.Parameters.AddWithValue("detail", (object?)row.Detail ?? DBNull.Value);
            ins.Parameters.Add("ev", NpgsqlDbType.Jsonb).Value = row.EvidenceJson;
            ins.Parameters.AddWithValue("created", updated);
            ins.ExecuteNonQuery();
        }

        tx.Commit();
    }

    public static ClaimedJobRow? ClaimNextJob(NpgsqlConnection conn)
    {
        using var tx = conn.BeginTransaction();
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = """
            WITH c AS (
              SELECT id FROM audit_jobs
              WHERE status = 'queued'
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE audit_jobs j
            SET status = 'running', started_at = EXTRACT(EPOCH FROM NOW())::bigint
            FROM c
            WHERE j.id = c.id
            RETURNING j.id, j.target_url, j.run_dir, j.max_links, j.max_ui_attempts, j.login_mode, j.identifier, j.secret_payload;
            """;
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
        {
            tx.Commit();
            return null;
        }

        var row = new ClaimedJobRow(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetInt32(3),
            reader.GetInt32(4),
            reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? null : (byte[])reader.GetValue(7));
        reader.Close();
        tx.Commit();
        return row;
    }

    public static void FinishJob(string cs, string jobId, string status, long finishedAt, int exitCode, string? errorMessage)
    {
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE audit_jobs SET status=@st, finished_at=@ft, exit_code=@ex, error_message=@err WHERE id=@id
            """;
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("ft", finishedAt);
        cmd.Parameters.AddWithValue("ex", exitCode);
        cmd.Parameters.AddWithValue("err", errorMessage ?? "");
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
    }

    public static void MarkRunning(string cs, string jobId)
    {
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE audit_jobs SET status='running', started_at=@st WHERE id=@id
            """;
        cmd.Parameters.AddWithValue("st", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
    }

    public static void MarkNotRun(string cs, string jobId, string safeError)
    {
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE audit_jobs SET status=@st, finished_at=@ft, exit_code=@ex, error_message=@err WHERE id=@id
            """;
        cmd.Parameters.AddWithValue("st", "notrun");
        cmd.Parameters.AddWithValue("ft", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("ex", -1);
        cmd.Parameters.AddWithValue("err", safeError);
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Marks a job as aborted (graceful shutdown / SIGTERM). Consistent with SQLite inline path.</summary>
    public static void MarkAborted(string cs, string jobId, string safeError)
    {
        using var conn = Open(cs);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE audit_jobs SET status=@st, finished_at=@ft, exit_code=@ex, error_message=@err WHERE id=@id
            """;
        cmd.Parameters.AddWithValue("st", "aborted");
        cmd.Parameters.AddWithValue("ft", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("ex", -2);
        cmd.Parameters.AddWithValue("err", safeError);
        cmd.Parameters.AddWithValue("id", jobId);
        cmd.ExecuteNonQuery();
    }
}

public sealed record ClaimedJobRow(
    string Id,
    string TargetUrl,
    string RunDirRel,
    int MaxLinks,
    int MaxUiAttempts,
    string LoginMode,
    string? Identifier,
    byte[]? SecretPayload);
