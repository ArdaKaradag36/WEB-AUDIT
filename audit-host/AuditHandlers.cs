using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Npgsql;
using WebAudit.Core;
using WebAudit.Postgres;
using WebAudit.Shared;

namespace AuditHost;

internal static class AuditHandlers
{
    private static async Task<IResult?> ValidateAuditRequest(CreateAuditRequest req, AuditHostOptions o, CancellationToken ct)
    {
        var configuration = o.Configuration;
        if (string.IsNullOrWhiteSpace(req.TargetUrl) || !Uri.TryCreate(req.TargetUrl, UriKind.Absolute, out var absUri))
            return Results.BadRequest(new { error = "Gecerli bir targetUrl zorunlu." });

        var allowPrivate = configuration.GetValue("AuditHost:AllowPrivateTargets", false);
        var targetErr = await AuditDb.ValidateAuditTargetUriAsync(absUri, allowPrivate, ct);
        if (targetErr != null)
            return Results.BadRequest(new { error = targetErr });

        if (!AuditDb.IsTargetHostAllowed(absUri, configuration, out var policyErr))
            return Results.BadRequest(new { error = policyErr });

        var requireTicket = configuration.GetValue("AuditHost:RequireExternalTicket", false);
        if (requireTicket && string.IsNullOrWhiteSpace(req.ExternalTicketId))
            return Results.BadRequest(new { error = "externalTicketId zorunlu (AuditHost:RequireExternalTicket)." });

        var loginMode = (req.LoginMode ?? "none").Trim().ToLowerInvariant();
        if (!new[] { "none", "email", "username", "phone" }.Contains(loginMode))
            return Results.BadRequest(new { error = "loginMode: none|email|username|phone olmali." });

        if (loginMode != "none" && (string.IsNullOrWhiteSpace(req.Identifier) || string.IsNullOrWhiteSpace(req.Password)))
            return Results.BadRequest(new { error = "Giris modu seciliyse identifier ve password zorunlu." });
        return null;
    }

    public static async Task<IResult> PostAudit(CreateAuditRequest req, CancellationToken ct, AuditHostOptions o, IHostApplicationLifetime lifetime, IJobStore store)
    {
        if (o.UsePostgres)
            return await PostAuditPostgres(req, ct, o, lifetime);
        return await PostAuditCore(req, ct, o, lifetime, store);
    }

    /// <summary>Unified inline-runner path using IJobStore — replaces the SQLite-only duplicate.</summary>
    private static async Task<IResult> PostAuditCore(CreateAuditRequest req, CancellationToken ct, AuditHostOptions o, IHostApplicationLifetime lifetime, IJobStore store)
    {
        var ve = await ValidateAuditRequest(req, o, ct);
        if (ve != null) return ve;

        var loginMode = (req.LoginMode ?? "none").Trim().ToLowerInvariant();
        var jobId = Guid.NewGuid().ToString("N");
        var runDirRel = $"reports/runs/{jobId}";
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var maxLinks = req.MaxLinks is > 0 and <= 500 ? req.MaxLinks.Value : 50;
        var maxUiAttempts = req.MaxUiAttempts is > 0 and <= 1000 ? req.MaxUiAttempts.Value : 220;
        var ticket = string.IsNullOrWhiteSpace(req.ExternalTicketId) ? null : req.ExternalTicketId.Trim();

        store.InsertQueuedJob(jobId, req.TargetUrl, now, runDirRel, ticket, maxLinks, maxUiAttempts,
            loginMode, req.Identifier, string.IsNullOrWhiteSpace(req.Password) ? 0 : 1, null);

        ImmutableAuditLog.TryAppendSqlite(o.DbPath, "audit.job.create", null, jobId, new { target = req.TargetUrl, mode = "sqlite_inline" });

        _ = Task.Run(async () =>
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(lifetime.ApplicationStopping);
            try
            {
                store.MarkRunning(jobId);
                var (code, stdout, stderr) = await RunnerJobRunner.RunAsync(
                    o.RunnerDir, req.TargetUrl, runDirRel, maxLinks, maxUiAttempts,
                    loginMode, req.Identifier, req.Password, cts.Token);
                var finishedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var status = code is 0 or 2 ? "success" : "error";
                var errorMessage = string.IsNullOrWhiteSpace(stderr) ? null : stderr.Trim();
                if (code != 0 && code != 2 && string.IsNullOrWhiteSpace(errorMessage)) errorMessage = stdout.Trim();
                store.FinishJob(jobId, status, finishedAt, code, errorMessage);
                var summaryPath = Path.Combine(o.RunnerDir, runDirRel, "summary.json");
                if (File.Exists(summaryPath)) store.UpsertSummaryAndFindings(jobId, summaryPath);
            }
            catch (OperationCanceledException)
            {
                store.MarkAborted(jobId, "Host shutdown during execution");
            }
            catch (Exception ex)
            {
                store.MarkNotRun(jobId, AuditDb.SanitizeStoredError(ex));
            }
        });

        return Results.Ok(new { id = jobId, status = "queued", runDir = runDirRel });
    }

    private static async Task<IResult> PostAuditPostgres(CreateAuditRequest req, CancellationToken ct, AuditHostOptions o, IHostApplicationLifetime lifetime)
    {
        var ve = await ValidateAuditRequest(req, o, ct);
        if (ve != null) return ve;

        var configuration = o.Configuration;
        var pg = o.PostgresConnectionString!;
        var runnerDir = o.RunnerDir;
        var loginMode = (req.LoginMode ?? "none").Trim().ToLowerInvariant();
        var jobId = Guid.NewGuid().ToString("N");
        var runDirRel = $"reports/runs/{jobId}";
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var maxLinks = req.MaxLinks is > 0 and <= 500 ? req.MaxLinks.Value : 50;
        var maxUiAttempts = req.MaxUiAttempts is > 0 and <= 1000 ? req.MaxUiAttempts.Value : 220;
        var ticket = string.IsNullOrWhiteSpace(req.ExternalTicketId) ? null : req.ExternalTicketId.Trim();

        byte[]? secretPayload = null;
        if (loginMode != "none" && !string.IsNullOrWhiteSpace(req.Password))
        {
            var key = o.JobPayloadSecretKeyBase64 ?? configuration["AuditHost:Postgres:JobPayloadSecretKeyBase64"];
            if (o.PostgresExternalWorkerOnly && string.IsNullOrWhiteSpace(key))
                return Results.BadRequest(new { error = "Harici worker: AuditHost:Postgres:JobPayloadSecretKeyBase64 veya options uzerinden anahtar gerekli." });
            if (!string.IsNullOrWhiteSpace(key))
                secretPayload = JobPayloadCrypto.EncryptUtf8(key, JsonSerializer.Serialize(new { password = req.Password }));
        }

        PostgresAudit.InsertQueuedJob(pg, jobId, req.TargetUrl, now, runDirRel, ticket, maxLinks, maxUiAttempts, loginMode,
            req.Identifier, string.IsNullOrWhiteSpace(req.Password) ? 0 : 1, secretPayload);

        if (o.PostgresExternalWorkerOnly)
        {
            ImmutableAuditLog.TryAppendPostgres(pg, "audit.job.queued", null, jobId, new { target = req.TargetUrl, mode = "external_worker" });
            return Results.Accepted($"/api/v1/audits/{jobId}/summary", new { id = jobId, status = "queued", runDir = runDirRel });
        }

        ImmutableAuditLog.TryAppendPostgres(pg, "audit.job.create", null, jobId, new { target = req.TargetUrl, mode = "postgres_inline" });

        _ = Task.Run(async () =>
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(lifetime.ApplicationStopping);
            try
            {
                PostgresAudit.MarkRunning(pg, jobId);
                var (code, stdout, stderr) = await RunnerJobRunner.RunAsync(
                    runnerDir,
                    req.TargetUrl,
                    runDirRel,
                    maxLinks,
                    maxUiAttempts,
                    loginMode,
                    req.Identifier,
                    req.Password,
                    cts.Token);
                var finishedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var status = code is 0 or 2 ? "success" : "error";
                var errorMessage = string.IsNullOrWhiteSpace(stderr) ? null : stderr.Trim();
                if (code != 0 && code != 2 && string.IsNullOrWhiteSpace(errorMessage))
                    errorMessage = stdout.Trim();
                PostgresAudit.FinishJob(pg, jobId, status, finishedAt, code, errorMessage);
                var summaryPath = Path.Combine(runnerDir, runDirRel, "summary.json");
                if (File.Exists(summaryPath))
                {
                    using var conn = PostgresAudit.Open(pg);
                    PostgresAudit.UpsertSummaryAndFindings(conn, jobId, summaryPath);
                }
            }
            catch (OperationCanceledException)
            {
                PostgresAudit.MarkAborted(pg, jobId, "Host shutdown during execution (aborted)");
            }
            catch (Exception ex)
            {
                PostgresAudit.MarkNotRun(pg, jobId, AuditDb.SanitizeStoredError(ex));
            }
        });

        return Results.Ok(new { id = jobId, status = "queued", runDir = runDirRel });
    }

    public static IResult GetCurrent(AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
            return GetCurrentPostgres(pg, o);
        return GetCurrentSqlite(o);
    }

    private static IResult GetCurrentSqlite(AuditHostOptions o)
    {
        var dbPath = o.DbPath;
        var runnerDir = o.RunnerDir;
        using var conn = AuditDb.Open(dbPath);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message,external_ticket_id
            FROM audit_jobs
            ORDER BY created_at DESC
            LIMIT 1
            """;
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return Results.Ok(new { current = (AuditJob?)null });

        var job = AuditDb.ReadJob(reader);
        AuditDb.ReconcileIfCompleted(dbPath, runnerDir, job.id, job.status, job.runDir);
        var refreshed = AuditDb.ReadJobById(conn, job.id) ?? job;
        return Results.Ok(new { current = refreshed });
    }

    private static IResult GetCurrentPostgres(string pg, AuditHostOptions o)
    {
        var runnerDir = o.RunnerDir;
        using var conn = PostgresAudit.Open(pg);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message,external_ticket_id
            FROM audit_jobs ORDER BY created_at DESC LIMIT 1
            """;
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return Results.Ok(new { current = (AuditJob?)null });
        var job = PostgresAudit.ReadJob(reader);
        reader.Close();
        PostgresAudit.ReconcileIfCompleted(pg, runnerDir, job.id, job.status, job.runDir);
        var refreshed = PostgresAudit.ReadJobById(conn, job.id) ?? job;
        return Results.Ok(new { current = refreshed });
    }

    public static IResult GetRecent(int? limit, AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
            return GetRecentPostgres(pg, limit, o);
        return GetRecentSqlite(limit, o);
    }

    private static IResult GetRecentSqlite(int? limit, AuditHostOptions o)
    {
        var lim = limit is > 0 and <= 50 ? limit.Value : 5;
        var dbPath = o.DbPath;
        var runnerDir = o.RunnerDir;
        using var conn = AuditDb.Open(dbPath);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,j.external_ticket_id,
                   s.findings_by_severity_json,
                   s.pages_scanned,
                   s.requests_total,
                   s.skipped_network,
                   s.tested_ui_elements,
                   s.total_ui_elements,
                   s.skipped_ui_elements,
                   s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            ORDER BY j.created_at DESC
            LIMIT {lim}
            """;
        using var reader = cmd.ExecuteReader();
        var list = new List<object>();
        while (reader.Read())
        {
            var status = reader.GetString(2);
            var jobId = reader.GetString(0);
            var runDir = reader.GetString(6);
            AuditDb.ReconcileIfCompleted(dbPath, runnerDir, jobId, status, runDir);

            AuditJob job;
            using (var c2 = AuditDb.Open(dbPath))
            {
                job = AuditDb.ReadJobById(c2, jobId) ?? AuditDb.ReadJob(reader);
            }

            list.Add(new
            {
                job,
                summary = new
                {
                    findingsBySeverity = reader.IsDBNull(10) ? "{}" : reader.GetString(10),
                    pagesScanned = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                    requestsTotal = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                    skippedNetwork = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
                    testedElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
                    totalElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
                    skippedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
                    failedElements = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
                }
            });
        }

        return Results.Ok(list);
    }

    private static IResult GetRecentPostgres(string pg, int? limit, AuditHostOptions o)
    {
        var lim = limit is > 0 and <= 50 ? limit.Value : 5;
        var runnerDir = o.RunnerDir;
        using var conn = PostgresAudit.Open(pg);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,j.external_ticket_id,
                   s.findings_by_severity_json,
                   s.pages_scanned,
                   s.requests_total,
                   s.skipped_network,
                   s.tested_ui_elements,
                   s.total_ui_elements,
                   s.skipped_ui_elements,
                   s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            ORDER BY j.created_at DESC
            LIMIT @lim
            """;
        cmd.Parameters.AddWithValue("lim", lim);
        using var reader = cmd.ExecuteReader();
        var buffer = new List<(AuditJob snap, string findings, int ps, int rt, int sn, int te, int tl, int ske, int fe)>();
        while (reader.Read())
        {
            buffer.Add((
                PostgresAudit.ReadJob(reader),
                reader.IsDBNull(10) ? "{}" : reader.GetString(10),
                reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
                reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
                reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
                reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
                reader.IsDBNull(17) ? 0 : reader.GetInt32(17)
            ));
        }

        var list = new List<object>();
        foreach (var (snap, findings, ps, rt, sn, te, tl, ske, fe) in buffer)
        {
            PostgresAudit.ReconcileIfCompleted(pg, runnerDir, snap.id, snap.status, snap.runDir);
            AuditJob job;
            using (var c2 = PostgresAudit.Open(pg))
                job = PostgresAudit.ReadJobById(c2, snap.id) ?? snap;
            list.Add(new
            {
                job,
                summary = new
                {
                    findingsBySeverity = findings,
                    pagesScanned = ps,
                    requestsTotal = rt,
                    skippedNetwork = sn,
                    testedElements = te,
                    totalElements = tl,
                    skippedElements = ske,
                    failedElements = fe,
                }
            });
        }

        return Results.Ok(list);
    }

    public static IResult GetAll(int? limit, AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
            return GetAllPostgres(pg, limit);
        return GetAllSqlite(limit, o);
    }

    private static IResult GetAllSqlite(int? limit, AuditHostOptions o)
    {
        var lim = limit is > 0 and <= 500 ? limit.Value : 100;
        var dbPath = o.DbPath;
        using var conn = AuditDb.Open(dbPath);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT j.id,
                   j.target_url,
                   j.status,
                   j.created_at,
                   j.started_at,
                   j.finished_at,
                   j.run_dir,
                   j.exit_code,
                   j.error_message,
                   j.external_ticket_id,
                   s.findings_by_severity_json,
                   s.pages_scanned,
                   s.requests_total,
                   s.skipped_network,
                   s.tested_ui_elements,
                   s.total_ui_elements,
                   s.skipped_ui_elements,
                   s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            ORDER BY created_at DESC
            LIMIT {lim}
            """;
        using var reader = cmd.ExecuteReader();
        var list = new List<object>();
        while (reader.Read())
        {
            var job = AuditDb.ReadJob(reader);
            list.Add(new
            {
                job,
                cache = new
                {
                    findingsBySeverity = reader.IsDBNull(10) ? "{}" : reader.GetString(10),
                    pagesScanned = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                    requestsTotal = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                    skippedNetwork = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
                    testedElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
                    totalElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
                    skippedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
                    failedElements = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
                }
            });
        }

        return Results.Ok(list);
    }

    private static IResult GetAllPostgres(string pg, int? limit)
    {
        var lim = limit is > 0 and <= 500 ? limit.Value : 100;
        using var conn = PostgresAudit.Open(pg);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,j.external_ticket_id,
                   s.findings_by_severity_json,s.pages_scanned,s.requests_total,s.skipped_network,
                   s.tested_ui_elements,s.total_ui_elements,s.skipped_ui_elements,s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            ORDER BY j.created_at DESC
            LIMIT @lim
            """;
        cmd.Parameters.AddWithValue("lim", lim);
        using var reader = cmd.ExecuteReader();
        var list = new List<object>();
        while (reader.Read())
        {
            var job = PostgresAudit.ReadJob(reader);
            list.Add(new
            {
                job,
                cache = new
                {
                    findingsBySeverity = reader.IsDBNull(10) ? "{}" : reader.GetString(10),
                    pagesScanned = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                    requestsTotal = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                    skippedNetwork = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
                    testedElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
                    totalElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
                    skippedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
                    failedElements = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
                }
            });
        }

        return Results.Ok(list);
    }

    public static IResult GetSummary(string id, AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
            return GetSummaryPostgres(pg, id, o);
        return GetSummarySqlite(id, o);
    }

    private static IResult GetSummarySqlite(string id, AuditHostOptions o)
    {
        var dbPath = o.DbPath;
        var runnerDir = o.RunnerDir;
        using var conn = AuditDb.Open(dbPath);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,j.external_ticket_id,
                   s.findings_by_severity_json,
                   s.pages_scanned,
                   s.requests_total,
                   s.skipped_network,
                   s.tested_ui_elements,
                   s.total_ui_elements,
                   s.skipped_ui_elements,
                   s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            WHERE j.id = $id
            LIMIT 1
            """;
        cmd.Parameters.AddWithValue("$id", id);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return Results.NotFound(new { error = "Audit bulunamadi." });
        var runDir = reader.GetString(6);
        var status = reader.GetString(2);
        var jobRow = AuditDb.ReadJob(reader);
        var cache = new
        {
            findingsBySeverity = reader.IsDBNull(10) ? "{}" : reader.GetString(10),
            pagesScanned = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
            requestsTotal = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
            skippedNetwork = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
            testedElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
            totalElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
            skippedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
            failedElements = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
        };
        reader.Close();

        AuditDb.ReconcileIfCompleted(dbPath, runnerDir, id, status, runDir);
        var refreshed = AuditDb.ReadJobById(conn, id);
        var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
        string? summaryJson = File.Exists(summaryPath) ? File.ReadAllText(summaryPath) : null;
        summaryJson = summaryJson != null ? SarifExport.TryRedactJson(summaryJson, o.Configuration) : null;
        return Results.Ok(new
        {
            job = refreshed ?? jobRow,
            cache,
            summaryJsonExists = summaryJson != null,
            summaryJson
        });
    }

    private static IResult GetSummaryPostgres(string pg, string id, AuditHostOptions o)
    {
        var runnerDir = o.RunnerDir;
        using var conn = PostgresAudit.Open(pg);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,j.external_ticket_id,
                   s.findings_by_severity_json,s.pages_scanned,s.requests_total,s.skipped_network,
                   s.tested_ui_elements,s.total_ui_elements,s.skipped_ui_elements,s.failed_ui_elements
            FROM audit_jobs j
            LEFT JOIN audit_summary_cache s ON s.job_id = j.id
            WHERE j.id=@id LIMIT 1
            """;
        cmd.Parameters.AddWithValue("id", id);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return Results.NotFound(new { error = "Audit bulunamadi." });
        var runDir = reader.GetString(6);
        var status = reader.GetString(2);
        var jobRow = PostgresAudit.ReadJob(reader);
        var cache = new
        {
            findingsBySeverity = reader.IsDBNull(10) ? "{}" : reader.GetString(10),
            pagesScanned = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
            requestsTotal = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
            skippedNetwork = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
            testedElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
            totalElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
            skippedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
            failedElements = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
        };
        reader.Close();
        PostgresAudit.ReconcileIfCompleted(pg, runnerDir, id, status, runDir);
        var refreshed = PostgresAudit.ReadJobById(conn, id);
        var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
        string? summaryJson = File.Exists(summaryPath) ? File.ReadAllText(summaryPath) : null;
        summaryJson = summaryJson != null ? SarifExport.TryRedactJson(summaryJson, o.Configuration) : null;
        return Results.Ok(new
        {
            job = refreshed ?? jobRow,
            cache,
            summaryJsonExists = summaryJson != null,
            summaryJson
        });
    }

    public static IResult GetNormalizedFindings(string id, AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
        {
            using var pgConn = PostgresAudit.Open(pg);
            using var pgCmd = pgConn.CreateCommand();
            pgCmd.CommandText = """
                SELECT fingerprint,rule_id,severity,category,title,detail,evidence_json
                FROM audit_normalized_findings WHERE job_id=@id ORDER BY id
                """;
            pgCmd.Parameters.AddWithValue("id", id);
            using var pgReader = pgCmd.ExecuteReader();
            var rows = new List<object>();
            while (pgReader.Read())
            {
                rows.Add(new
                {
                    fingerprint = pgReader.GetString(0),
                    ruleId = pgReader.IsDBNull(1) ? null : pgReader.GetString(1),
                    severity = pgReader.IsDBNull(2) ? null : pgReader.GetString(2),
                    category = pgReader.IsDBNull(3) ? null : pgReader.GetString(3),
                    title = pgReader.IsDBNull(4) ? null : pgReader.GetString(4),
                    detail = pgReader.IsDBNull(5) ? null : pgReader.GetString(5),
                    evidence = pgReader.IsDBNull(6) ? null : pgReader.GetString(6),
                });
            }

            return Results.Ok(new { jobId = id, count = rows.Count, findings = rows });
        }

        var dbPath = o.DbPath;
        using var slConn = AuditDb.Open(dbPath);
        using var slCmd = slConn.CreateCommand();
        slCmd.CommandText = """
            SELECT fingerprint,rule_id,severity,category,title,detail,evidence_json
            FROM audit_normalized_findings WHERE job_id=$id ORDER BY id
            """;
        slCmd.Parameters.AddWithValue("$id", id);
        using var slReader = slCmd.ExecuteReader();
        var list = new List<object>();
        while (slReader.Read())
        {
            list.Add(new
            {
                fingerprint = slReader.GetString(0),
                ruleId = slReader.IsDBNull(1) ? null : slReader.GetString(1),
                severity = slReader.IsDBNull(2) ? null : slReader.GetString(2),
                category = slReader.IsDBNull(3) ? null : slReader.GetString(3),
                title = slReader.IsDBNull(4) ? null : slReader.GetString(4),
                detail = slReader.IsDBNull(5) ? null : slReader.GetString(5),
                evidence = slReader.IsDBNull(6) ? null : slReader.GetString(6),
            });
        }

        return Results.Ok(new { jobId = id, count = list.Count, findings = list });
    }

    public static IResult GetPdf(string id, AuditHostOptions o)
    {
        string? runDirRel;
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
        {
            using var conn = PostgresAudit.Open(pg);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=@id LIMIT 1";
            cmd.Parameters.AddWithValue("id", id);
            runDirRel = cmd.ExecuteScalar() as string;
        }
        else
        {
            using var conn = AuditDb.Open(o.DbPath);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=$id LIMIT 1";
            cmd.Parameters.AddWithValue("$id", id);
            runDirRel = cmd.ExecuteScalar() as string;
        }

        if (string.IsNullOrWhiteSpace(runDirRel)) return Results.NotFound(new { error = "Audit bulunamadi." });
        var path = Path.Combine(o.RunnerDir, runDirRel, "summary.json");
        if (!File.Exists(path)) return Results.NotFound(new { error = "summary.json bulunamadi." });
        var json = File.ReadAllText(path);
        var redacted = SarifExport.TryRedactJson(json, o.Configuration);
        var notice = o.Configuration.GetValue("AuditHost:RedactJsonResponses", false)
            ? "PDF, RedactJsonResponses etkin: bazi dizeler maskeleyebilir."
            : null;
        var pdf = PdfReportGenerator.FromSummaryJson(redacted, id, notice);
        return Results.File(pdf, "application/pdf", fileDownloadName: $"webaudit-{id}.pdf");
    }

    public static IResult GetJsonFile(string id, string file, AuditHostOptions o)
    {
        var runnerDir = o.RunnerDir;
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "summary", "gaps", "ui-inventory", "console", "network", "request_failed", "report", "run.complete"
        };
        if (!allowed.Contains(file)) return Results.BadRequest(new { error = "Dosya desteklenmiyor." });
        string? runDir;
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
        {
            using var conn = PostgresAudit.Open(pg);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=@id LIMIT 1";
            cmd.Parameters.AddWithValue("id", id);
            runDir = cmd.ExecuteScalar() as string;
        }
        else
        {
            using var conn = AuditDb.Open(o.DbPath);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=$id LIMIT 1";
            cmd.Parameters.AddWithValue("$id", id);
            runDir = cmd.ExecuteScalar() as string;
        }

        if (string.IsNullOrWhiteSpace(runDir)) return Results.NotFound(new { error = "Audit bulunamadi." });
        var path = Path.Combine(runnerDir, runDir, $"{file}.json");
        if (!File.Exists(path)) return Results.NotFound(new { error = "JSON dosyasi bulunamadi." });
        var json = File.ReadAllText(path);
        json = SarifExport.TryRedactJson(json, o.Configuration);
        return Results.Text(json, "application/json");
    }

    public static IResult GetSarif(string id, AuditHostOptions o)
    {
        var runnerDir = o.RunnerDir;
        string? runDir;
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
        {
            using var conn = PostgresAudit.Open(pg);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=@id LIMIT 1";
            cmd.Parameters.AddWithValue("id", id);
            runDir = cmd.ExecuteScalar() as string;
        }
        else
        {
            using var conn = AuditDb.Open(o.DbPath);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=$id LIMIT 1";
            cmd.Parameters.AddWithValue("$id", id);
            runDir = cmd.ExecuteScalar() as string;
        }

        if (string.IsNullOrWhiteSpace(runDir)) return Results.NotFound(new { error = "Audit bulunamadi." });
        var path = Path.Combine(runnerDir, runDir, "summary.json");
        if (!File.Exists(path)) return Results.NotFound(new { error = "summary.json bulunamadi." });
        var text = File.ReadAllText(path);
        var sarif = SarifExport.FromSummaryJson(text, id);
        return Results.Text(sarif, "application/json");
    }

    public static IResult DeleteAudit(string id, AuditHostOptions o)
    {
        if (o.UsePostgres && o.PostgresConnectionString is { } pg)
            return DeleteAuditPostgres(pg, id, o);
        return DeleteAuditSqlite(id, o);
    }

    private static IResult DeleteAuditSqlite(string id, AuditHostOptions o)
    {
        var dbPath = o.DbPath;
        var runnerDir = o.RunnerDir;
        string? runDirRel;
        string status;
        using (var conn = AuditDb.Open(dbPath))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir, status FROM audit_jobs WHERE id=$id LIMIT 1";
            cmd.Parameters.AddWithValue("$id", id);
            using var reader = cmd.ExecuteReader();
            if (!reader.Read()) return Results.NotFound(new { error = "Audit bulunamadi." });
            runDirRel = reader.GetString(0);
            status = reader.GetString(1);
        }

        if (status == "running")
            return Results.Conflict(new { error = "Denetim calisiyor; silinemez." });

        ImmutableAuditLog.TryAppendSqlite(dbPath, "audit.job.delete", null, id, new { });
        using (var conn = AuditDb.Open(dbPath))
        {
            AuditDb.Exec(conn, "DELETE FROM audit_summary_cache WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_normalized_findings WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_credentials WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_jobs WHERE id=$id", ("$id", id));
        }

        return TryDeleteFilesystem(runnerDir, runDirRel!);
    }

    private static IResult DeleteAuditPostgres(string pg, string id, AuditHostOptions o)
    {
        string? runDirRel;
        string status;
        using (var conn = PostgresAudit.Open(pg))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT run_dir, status FROM audit_jobs WHERE id=@id LIMIT 1";
            cmd.Parameters.AddWithValue("id", id);
            using var reader = cmd.ExecuteReader();
            if (!reader.Read()) return Results.NotFound(new { error = "Audit bulunamadi." });
            runDirRel = reader.GetString(0);
            status = reader.GetString(1);
        }

        if (status == "running")
            return Results.Conflict(new { error = "Denetim calisiyor; silinemez." });

        ImmutableAuditLog.TryAppendPostgres(pg, "audit.job.delete", null, id, new { });
        using (var conn = PostgresAudit.Open(pg))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM audit_jobs WHERE id=@id";
            cmd.Parameters.AddWithValue("id", id);
            cmd.ExecuteNonQuery();
        }

        return TryDeleteFilesystem(o.RunnerDir, runDirRel!);
    }

    private static IResult TryDeleteFilesystem(string runnerDir, string runDirRel)
    {
        var runnerRoot = Path.GetFullPath(runnerDir).TrimEnd(Path.DirectorySeparatorChar);
        var rel = runDirRel.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var target = Path.GetFullPath(Path.Combine(runnerDir, rel));
        var prefix = runnerRoot + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { error = "Gecersiz run yolu." });

        try
        {
            if (Directory.Exists(target))
                Directory.Delete(target, recursive: true);
            var tmp = target + ".tmp";
            if (Directory.Exists(tmp))
                Directory.Delete(tmp, recursive: true);
        }
        catch (Exception ex)
        {
            return TypedResults.Problem(
                title: "Kismi silme",
                detail: "Veritabani kaydi silindi; dosya dizini kaldirilamadi.",
                statusCode: StatusCodes.Status207MultiStatus,
                extensions: new Dictionary<string, object?> { ["warning"] = ex.Message, ["databaseDeleted"] = true, ["filesystemDeleted"] = false });
        }

        return Results.Ok(new { ok = true, databaseDeleted = true, filesystemDeleted = true });
    }
}
