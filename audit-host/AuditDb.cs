using System.Net;
using System.Net.Sockets;
using Microsoft.Data.Sqlite;
using WebAudit.Core;

namespace AuditHost;

internal static class AuditDb
{
    public static string? ExtractBearer(string? authorization)
    {
        if (string.IsNullOrWhiteSpace(authorization)) return null;
        const string prefix = "Bearer ";
        if (!authorization.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
        return authorization[prefix.Length..].Trim();
    }

    public static string SanitizeStoredError(Exception ex)
    {
        var msg = $"{ex.GetType().Name}: {ex.Message}";
        const int max = 500;
        return msg.Length <= max ? msg : msg[..max] + "…";
    }

    public static bool IsNonPublicIp(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip)) return true;
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6SiteLocal || ip.IsIPv6Teredo || ip.IsIPv6LinkLocal) return true;
            if (ip.IsIPv4MappedToIPv6)
                return IsNonPublicIp(ip.MapToIPv4());
        }

        var bytes = ip.GetAddressBytes();
        if (bytes.Length != 4) return false;
        if (bytes[0] == 10) return true;
        if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
        if (bytes[0] == 192 && bytes[1] == 168) return true;
        if (bytes[0] == 169 && bytes[1] == 254) return true;
        if (bytes[0] == 127) return true;
        if (bytes[0] == 100 && bytes[1] >= 64 && bytes[1] <= 127) return true;
        if (bytes[0] == 0) return true;
        return false;
    }

    public static async Task<string?> ValidateAuditTargetUriAsync(Uri uri, bool allowPrivateTargets, CancellationToken ct)
    {
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return "Sadece http ve https hedefleri desteklenir.";

        if (allowPrivateTargets) return null;

        var host = uri.IdnHost;
        if (IPAddress.TryParse(host, out var directIp))
        {
            if (IsNonPublicIp(directIp))
                return "Bu IP adresi (ozel ag / loopback) hedef olarak izin verilmiyor. AuditHost:AllowPrivateTargets=true ile acilabilir.";
            return null;
        }

        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase))
            return "localhost hedefleri izin verilmiyor (AllowPrivateTargets ile acilabilir).";

        try
        {
            var addresses = await Dns.GetHostAddressesAsync(host, ct);
            if (addresses.Length == 0)
                return "Alan adi cozulemedi.";
            foreach (var a in addresses)
            {
                if (IsNonPublicIp(a))
                    return "Alan adi ozel ag veya loopback adresine cozuluyor. AuditHost:AllowPrivateTargets=true ile acilabilir.";
            }
        }
        catch (Exception ex)
        {
            return $"Alan adi cozum hatasi: {ex.Message}";
        }

        return null;
    }

    /// <summary>Optional allowlist: AuditHost:AllowedTargetHosts = "a.com,b.gov.tr" (suffix match).</summary>
    public static bool IsTargetHostAllowed(Uri uri, IConfiguration configuration, out string? error)
    {
        error = null;
        var raw = configuration["AuditHost:AllowedTargetHosts"];
        if (string.IsNullOrWhiteSpace(raw))
            return true;
        var host = uri.IdnHost.ToLowerInvariant();
        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var suffix = part.ToLowerInvariant();
            if (host == suffix || host.EndsWith("." + suffix, StringComparison.Ordinal))
            {
                return true;
            }
        }

        error = "Hedef host izin listesinde degil (AuditHost:AllowedTargetHosts).";
        return false;
    }

    public static AuditJob ReadJob(SqliteDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.IsDBNull(3) ? 0 : reader.GetInt64(3),
        reader.IsDBNull(4) ? 0 : reader.GetInt64(4),
        reader.IsDBNull(5) ? 0 : reader.GetInt64(5),
        reader.IsDBNull(6) ? "" : reader.GetString(6),
        reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
        reader.IsDBNull(8) ? "" : reader.GetString(8),
        reader.IsDBNull(9) ? null : reader.GetString(9)
    );

    public static AuditJob? ReadJobById(SqliteConnection conn, string id)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message,external_ticket_id
            FROM audit_jobs
            WHERE id=$id LIMIT 1
            """;
        cmd.Parameters.AddWithValue("$id", id);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return ReadJob(reader);
    }

    public static void ReconcileIfCompleted(string dbPath, string runnerDir, string jobId, string status, string runDir)
    {
        if (status is not ("running" or "queued")) return;
        var runComplete = Path.Combine(runnerDir, runDir, "run.complete.json");
        if (!File.Exists(runComplete)) return;
        var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");

        using var conn = Open(dbPath);
        Exec(conn, """
            UPDATE audit_jobs
            SET status=$status, finished_at=$finished
            WHERE id=$id AND status IN ('running','queued')
            """,
            ("$status", "success"), ("$finished", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$id", jobId));

        if (!File.Exists(summaryPath)) return;
        if (!SummaryJsonParser.TryParseMetricsFromFile(summaryPath, out var findings, out var pages, out var requests,
                out var skipped, out var testedElements, out var totalElements, out var skippedElements, out var failedElements))
            return;
        Exec(conn, """
            INSERT INTO audit_summary_cache(
              job_id,
              findings_by_severity_json,
              pages_scanned,
              requests_total,
              skipped_network,
              tested_ui_elements,
              total_ui_elements,
              skipped_ui_elements,
              failed_ui_elements,
              updated_at
            )
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
            ("$job_id", jobId),
            ("$findings", findings),
            ("$pages", pages),
            ("$requests", requests),
            ("$skipped", skipped),
            ("$tested", testedElements),
            ("$total", totalElements),
            ("$skipped_ui", skippedElements),
            ("$failed", failedElements),
            ("$updated", DateTimeOffset.UtcNow.ToUnixTimeSeconds()));

        NormalizedFindingStore.UpsertSqlite(conn, jobId, summaryPath);
    }

    public static SqliteConnection Open(string dbPath)
    {
        var conn = new SqliteConnection($"Data Source={dbPath}");
        conn.Open();
        using var wal = conn.CreateCommand();
        wal.CommandText = "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;";
        wal.ExecuteNonQuery();
        return conn;
    }

    public static void Exec(SqliteConnection conn, string sql, params (string key, object value)[] p)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (key, value) in p) cmd.Parameters.AddWithValue(key, value);
        cmd.ExecuteNonQuery();
    }

    public static void EnsureColumn(SqliteConnection conn, string table, string column, string ddl)
    {
        using var check = conn.CreateCommand();
        check.CommandText = $"PRAGMA table_info({table});";
        using var reader = check.ExecuteReader();
        var exists = false;
        while (reader.Read())
        {
            var name = reader.GetString(1);
            if (string.Equals(name, column, StringComparison.OrdinalIgnoreCase))
            {
                exists = true;
                break;
            }
        }

        if (!exists)
        {
            using var alter = conn.CreateCommand();
            alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {ddl};";
            alter.ExecuteNonQuery();
        }
    }

    public static void ReconcileStuckJobs(string dbPath, string runnerDir, int maxAgeMinutes = 120)
    {
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-maxAgeMinutes).ToUnixTimeSeconds();
        var victims = new List<(string Id, string RunDir, string Status)>();
        using (var conn = Open(dbPath))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT id, run_dir, status FROM audit_jobs
                WHERE (status = 'running' AND started_at < $cut)
                   OR (status = 'queued'  AND created_at < $cut)
                """;
            cmd.Parameters.AddWithValue("$cut", cutoff);
            using var r = cmd.ExecuteReader();
            while (r.Read())
                victims.Add((r.GetString(0), r.GetString(1), r.GetString(2)));
        }
        foreach (var (id, runDir, _) in victims)
        {
            var runComplete = Path.Combine(runnerDir, runDir, "run.complete.json");
            var newStatus = File.Exists(runComplete) ? "success" : "error";
            var msg = newStatus == "error" ? "Interrupted: job was stuck in running/queued state on startup" : (string?)null;
            using var conn = Open(dbPath);
            Exec(conn, "UPDATE audit_jobs SET status=$st, finished_at=$ft, error_message=COALESCE($msg, error_message) WHERE id=$id AND status IN ('running','queued')",
                ("$st", newStatus), ("$ft", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$msg", msg ?? (object)DBNull.Value), ("$id", id));
            if (newStatus == "success")
            {
                var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
                if (File.Exists(summaryPath) &&
                    SummaryJsonParser.TryParseMetricsFromFile(summaryPath, out var findings, out var pages, out var requests,
                        out var skipped, out var tested, out var total, out var skippedUi, out var failed))
                {
                    Exec(conn, """
                        INSERT OR IGNORE INTO audit_summary_cache(job_id,findings_by_severity_json,pages_scanned,requests_total,skipped_network,tested_ui_elements,total_ui_elements,skipped_ui_elements,failed_ui_elements,updated_at)
                        VALUES ($ji,$f,$p,$r,$sk,$te,$tl,$se,$fe,$up)
                        """,
                        ("$ji", id), ("$f", findings), ("$p", pages), ("$r", requests), ("$sk", skipped),
                        ("$te", tested), ("$tl", total), ("$se", skippedUi), ("$fe", failed),
                        ("$up", DateTimeOffset.UtcNow.ToUnixTimeSeconds()));
                }
            }
        }
    }

    public static void InitDb(string dbPath)
    {
        using var conn = Open(dbPath);
        Exec(conn, """
            CREATE TABLE IF NOT EXISTS audit_jobs(
              id TEXT PRIMARY KEY,
              target_url TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              started_at INTEGER,
              finished_at INTEGER,
              run_dir TEXT NOT NULL,
              exit_code INTEGER,
              error_message TEXT
            )
            """);
        Exec(conn, """
            CREATE TABLE IF NOT EXISTS audit_credentials(
              job_id TEXT PRIMARY KEY,
              login_mode TEXT NOT NULL,
              identifier TEXT,
              has_password INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY(job_id) REFERENCES audit_jobs(id)
            )
            """);
        Exec(conn, """
            CREATE TABLE IF NOT EXISTS audit_summary_cache(
              job_id TEXT PRIMARY KEY,
              findings_by_severity_json TEXT,
              pages_scanned INTEGER,
              requests_total INTEGER,
              skipped_network INTEGER,
              tested_ui_elements INTEGER NOT NULL DEFAULT 0,
              total_ui_elements INTEGER NOT NULL DEFAULT 0,
              skipped_ui_elements INTEGER NOT NULL DEFAULT 0,
              failed_ui_elements INTEGER NOT NULL DEFAULT 0,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(job_id) REFERENCES audit_jobs(id)
            )
            """);

        EnsureColumn(conn, "audit_summary_cache", "tested_ui_elements", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(conn, "audit_summary_cache", "total_ui_elements", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(conn, "audit_summary_cache", "skipped_ui_elements", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(conn, "audit_summary_cache", "failed_ui_elements", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(conn, "audit_jobs", "external_ticket_id", "TEXT");

        Exec(conn, """
            CREATE TABLE IF NOT EXISTS audit_normalized_findings(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              job_id TEXT NOT NULL,
              fingerprint TEXT NOT NULL,
              rule_id TEXT,
              severity TEXT,
              category TEXT,
              title TEXT,
              detail TEXT,
              evidence_json TEXT,
              created_at INTEGER NOT NULL,
              UNIQUE(job_id,fingerprint),
              FOREIGN KEY(job_id) REFERENCES audit_jobs(id)
            )
            """);
        Exec(conn, """
            CREATE TABLE IF NOT EXISTS immutable_audit_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              seq INTEGER NOT NULL UNIQUE,
              event_ts INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              actor TEXT,
              subject TEXT,
              payload_json TEXT NOT NULL,
              prev_hash TEXT NOT NULL,
              entry_hash TEXT NOT NULL
            )
            """);
        Exec(conn, "CREATE INDEX IF NOT EXISTS ix_audit_jobs_status_created ON audit_jobs(status, created_at)");
    }
}
