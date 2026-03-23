using System.Diagnostics;
using System.Text.Json;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var rootDir = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, ".."));
var runnerDir = Path.Combine(rootDir, "runner");
var dbPath = Path.Combine(app.Environment.ContentRootPath, "audit-host.db");

Directory.CreateDirectory(app.Environment.ContentRootPath);
InitDb(dbPath);

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", () => Results.Ok(new { ok = true }));

app.MapPost("/api/audits", (CreateAuditRequest req) =>
{
  if (string.IsNullOrWhiteSpace(req.TargetUrl) || !Uri.TryCreate(req.TargetUrl, UriKind.Absolute, out _))
  {
    return Results.BadRequest(new { error = "Gecerli bir targetUrl zorunlu." });
  }

  var loginMode = (req.LoginMode ?? "none").Trim().ToLowerInvariant();
  if (!new[] { "none", "email", "username", "phone" }.Contains(loginMode))
  {
    return Results.BadRequest(new { error = "loginMode: none|email|username|phone olmali." });
  }

  if (loginMode != "none" && (string.IsNullOrWhiteSpace(req.Identifier) || string.IsNullOrWhiteSpace(req.Password)))
  {
    return Results.BadRequest(new { error = "Giris modu seciliyse identifier ve password zorunlu." });
  }

  var jobId = Guid.NewGuid().ToString("N");
  var runDirRel = $"reports/runs/{jobId}";
  var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  var maxLinks = req.MaxLinks is > 0 and <= 200 ? req.MaxLinks.Value : 35;
  var maxUiAttempts = req.MaxUiAttempts is > 0 and <= 1000 ? req.MaxUiAttempts.Value : 220;

  using (var conn = Open(dbPath))
  {
    Exec(conn, """
      INSERT INTO audit_jobs(id,target_url,status,created_at,run_dir)
      VALUES ($id,$target,$status,$created,$run_dir)
      """,
      ("$id", jobId), ("$target", req.TargetUrl), ("$status", "queued"), ("$created", now), ("$run_dir", runDirRel));

    Exec(conn, """
      INSERT INTO audit_credentials(job_id,login_mode,identifier,has_password)
      VALUES ($job_id,$login_mode,$identifier,$has_password)
      """,
      ("$job_id", jobId), ("$login_mode", loginMode), ("$identifier", req.Identifier ?? ""), ("$has_password", string.IsNullOrWhiteSpace(req.Password) ? 0 : 1));
  }

  _ = Task.Run(async () =>
  {
    try
    {
      using (var conn = Open(dbPath))
      {
        Exec(conn, "UPDATE audit_jobs SET status=$status, started_at=$started WHERE id=$id",
          ("$status", "running"), ("$started", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$id", jobId));
      }

      var psi = new ProcessStartInfo
      {
        FileName = "node",
        WorkingDirectory = runnerDir,
        RedirectStandardError = true,
        RedirectStandardOutput = true,
        UseShellExecute = false,
      };
      psi.ArgumentList.Add("dist/cli.js");
      psi.ArgumentList.Add("--url");
      psi.ArgumentList.Add(req.TargetUrl);
      psi.ArgumentList.Add("--max-links");
      psi.ArgumentList.Add(maxLinks.ToString());
      psi.ArgumentList.Add("--max-ui-attempts");
      psi.ArgumentList.Add(maxUiAttempts.ToString());
      psi.ArgumentList.Add("--out");
      psi.ArgumentList.Add(runDirRel);

      if (loginMode != "none")
      {
        // Runner auth plugin ortam degiskenleri:
        // - AUDIT_USER / AUDIT_PASS (legacy)
        // - AUDIT_EMAIL / AUDIT_USERNAME / AUDIT_PHONE
        // - AUDIT_PASSWORD (alias)
        // Burada loginMode'a gore dogru kimlik alanlarini dolduruyoruz.
        var identifier = req.Identifier ?? "";
        var password = req.Password ?? "";
        psi.Environment["AUDIT_PASS"] = password;
        psi.Environment["AUDIT_PASSWORD"] = password;
        psi.Environment["AUDIT_USER"] = identifier; // geriye donuk uyumluluk

        switch (loginMode)
        {
          case "email":
            psi.Environment["AUDIT_EMAIL"] = identifier;
            break;
          case "username":
            psi.Environment["AUDIT_USERNAME"] = identifier;
            break;
          case "phone":
            psi.Environment["AUDIT_PHONE"] = identifier;
            break;
        }
      }

      using var process = new Process { StartInfo = psi };
      process.Start();
      var stdoutTask = process.StandardOutput.ReadToEndAsync();
      var stderrTask = process.StandardError.ReadToEndAsync();
      await process.WaitForExitAsync();
      var stdout = await stdoutTask;
      var stderr = await stderrTask;
      var finishedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

      var status = process.ExitCode == 0 || process.ExitCode == 2 ? "success" : "error";
      var errorMessage = string.IsNullOrWhiteSpace(stderr) ? null : stderr.Trim();
      if (process.ExitCode != 0 && process.ExitCode != 2 && string.IsNullOrWhiteSpace(errorMessage))
      {
        errorMessage = stdout.Trim();
      }

      using (var conn = Open(dbPath))
      {
        Exec(conn, """
          UPDATE audit_jobs
          SET status=$status, finished_at=$finished, exit_code=$exit_code, error_message=$error
          WHERE id=$id
          """,
          ("$status", status), ("$finished", finishedAt), ("$exit_code", process.ExitCode), ("$error", errorMessage ?? ""), ("$id", jobId));
      }

      var summaryPath = Path.Combine(runnerDir, runDirRel, "summary.json");
      if (File.Exists(summaryPath))
      {
        var summaryText = await File.ReadAllTextAsync(summaryPath);
        using var doc = JsonDocument.Parse(summaryText);
        var root = doc.RootElement;
        var metrics = root.TryGetProperty("metrics", out var m) ? m : default;
        var findings = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("findingsBySeverity", out var f)
          ? f.GetRawText()
          : "{}";
        var pages = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("pagesScanned", out var p) ? p.GetInt32() : 0;
        var requests = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("requestsTotal", out var r) ? r.GetInt32() : 0;
        var skipped = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("skippedNetwork", out var s) ? s.GetInt32() : 0;

        var uiCoverage = root.TryGetProperty("uiCoverage", out var u) ? u : default;
        var totalElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("totalElements", out var te) ? te.GetInt32() : 0;
        var testedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("testedElements", out var t) ? t.GetInt32() : 0;
        var skippedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("skippedElements", out var se) ? se.GetInt32() : 0;
        var failedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("failedElements", out var fe) ? fe.GetInt32() : 0;
        using var conn = Open(dbPath);
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
      }
    }
    catch (Exception ex)
    {
      using var conn = Open(dbPath);
      Exec(conn, """
        UPDATE audit_jobs
        SET status=$status, finished_at=$finished, exit_code=$exit_code, error_message=$error
        WHERE id=$id
        """,
        ("$status", "notrun"), ("$finished", DateTimeOffset.UtcNow.ToUnixTimeSeconds()), ("$exit_code", -1), ("$error", ex.Message), ("$id", jobId));
    }
  });

  return Results.Ok(new { id = jobId, status = "queued", runDir = runDirRel });
});

app.MapGet("/api/audits/current", () =>
{
  using var conn = Open(dbPath);
  using var cmd = conn.CreateCommand();
  cmd.CommandText = """
    SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message
    FROM audit_jobs
    ORDER BY created_at DESC
    LIMIT 1
    """;
  using var reader = cmd.ExecuteReader();
  if (!reader.Read()) return Results.Ok(new { });
  var job = ReadJob(reader);
  ReconcileIfCompleted(dbPath, runnerDir, job.id, job.status, job.runDir);
  return Results.Ok(ReadJobById(conn, job.id) ?? job);
});

app.MapGet("/api/audits/recent", (int? limit) =>
{
  var lim = limit is > 0 and <= 50 ? limit.Value : 5;
  using var conn = Open(dbPath);
  using var cmd = conn.CreateCommand();
  cmd.CommandText = $"""
    SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,
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
    ReconcileIfCompleted(dbPath, runnerDir, jobId, status, runDir);

    var job = ReadJobById(conn, jobId) ?? ReadJob(reader);
    list.Add(new
    {
      job,
      summary = new
      {
        findingsBySeverity = reader.IsDBNull(9) ? "{}" : reader.GetString(9),
        pagesScanned = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
        requestsTotal = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
        skippedNetwork = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
        testedElements = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
        totalElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
        skippedElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
        failedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
      }
    });
  }
  return Results.Ok(list);
});

app.MapGet("/api/audits", (int? limit) =>
{
  var lim = limit is > 0 and <= 500 ? limit.Value : 100;
  using var conn = Open(dbPath);
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
    var job = ReadJob(reader);
    list.Add(new
    {
      job,
      cache = new
      {
        findingsBySeverity = reader.IsDBNull(9) ? "{}" : reader.GetString(9),
        pagesScanned = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
        requestsTotal = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
        skippedNetwork = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
        testedElements = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
        totalElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
        skippedElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
        failedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
      }
    });
  }
  return Results.Ok(list);
});

app.MapGet("/api/audits/{id}/summary", (string id) =>
{
  using var conn = Open(dbPath);
  using var cmd = conn.CreateCommand();
  cmd.CommandText = """
    SELECT j.id,j.target_url,j.status,j.created_at,j.started_at,j.finished_at,j.run_dir,j.exit_code,j.error_message,
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
  ReconcileIfCompleted(dbPath, runnerDir, id, status, runDir);
  var refreshed = ReadJobById(conn, id);
  var summaryPath = Path.Combine(runnerDir, runDir, "summary.json");
  string? summaryJson = File.Exists(summaryPath) ? File.ReadAllText(summaryPath) : null;
  return Results.Ok(new
  {
    job = refreshed ?? ReadJob(reader),
    cache = new
    {
      findingsBySeverity = reader.IsDBNull(9) ? "{}" : reader.GetString(9),
      pagesScanned = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
      requestsTotal = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
      skippedNetwork = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
      testedElements = reader.IsDBNull(13) ? 0 : reader.GetInt32(13),
      totalElements = reader.IsDBNull(14) ? 0 : reader.GetInt32(14),
      skippedElements = reader.IsDBNull(15) ? 0 : reader.GetInt32(15),
      failedElements = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
    },
    summaryJsonExists = summaryJson != null,
    summaryJson
  });
});

app.MapGet("/api/audits/{id}/json/{file}", (string id, string file) =>
{
  var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
  {
    "summary", "gaps", "ui-inventory", "console", "network", "request_failed", "report", "run.complete"
  };
  if (!allowed.Contains(file)) return Results.BadRequest(new { error = "Dosya desteklenmiyor." });
  using var conn = Open(dbPath);
  using var cmd = conn.CreateCommand();
  cmd.CommandText = "SELECT run_dir FROM audit_jobs WHERE id=$id LIMIT 1";
  cmd.Parameters.AddWithValue("$id", id);
  var runDir = cmd.ExecuteScalar() as string;
  if (string.IsNullOrWhiteSpace(runDir)) return Results.NotFound(new { error = "Audit bulunamadi." });
  var path = Path.Combine(runnerDir, runDir, $"{file}.json");
  if (!File.Exists(path)) return Results.NotFound(new { error = "JSON dosyasi bulunamadi." });
  var json = File.ReadAllText(path);
  return Results.Text(json, "application/json");
});

app.Run();

static AuditJob ReadJob(SqliteDataReader reader) => new(
  reader.GetString(0),
  reader.GetString(1),
  reader.GetString(2),
  reader.IsDBNull(3) ? 0 : reader.GetInt64(3),
  reader.IsDBNull(4) ? 0 : reader.GetInt64(4),
  reader.IsDBNull(5) ? 0 : reader.GetInt64(5),
  reader.IsDBNull(6) ? "" : reader.GetString(6),
  reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
  reader.IsDBNull(8) ? "" : reader.GetString(8)
);

static AuditJob? ReadJobById(SqliteConnection conn, string id)
{
  using var cmd = conn.CreateCommand();
  cmd.CommandText = """
    SELECT id,target_url,status,created_at,started_at,finished_at,run_dir,exit_code,error_message
    FROM audit_jobs
    WHERE id=$id LIMIT 1
    """;
  cmd.Parameters.AddWithValue("$id", id);
  using var reader = cmd.ExecuteReader();
  if (!reader.Read()) return null;
  return ReadJob(reader);
}

static void ReconcileIfCompleted(string dbPath, string runnerDir, string jobId, string status, string runDir)
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
  using var doc = JsonDocument.Parse(File.ReadAllText(summaryPath));
  var metrics = doc.RootElement.TryGetProperty("metrics", out var m) ? m : default;
  var findings = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("findingsBySeverity", out var f)
    ? f.GetRawText()
    : "{}";
  var pages = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("pagesScanned", out var p) ? p.GetInt32() : 0;
  var requests = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("requestsTotal", out var r) ? r.GetInt32() : 0;
  var skipped = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("skippedNetwork", out var s) ? s.GetInt32() : 0;

  var uiCoverage = doc.RootElement.TryGetProperty("uiCoverage", out var u) ? u : default;
  var totalElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("totalElements", out var te) ? te.GetInt32() : 0;
  var testedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("testedElements", out var t) ? t.GetInt32() : 0;
  var skippedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("skippedElements", out var se) ? se.GetInt32() : 0;
  var failedElements = uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("failedElements", out var fe) ? fe.GetInt32() : 0;
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
}

static SqliteConnection Open(string dbPath)
{
  var conn = new SqliteConnection($"Data Source={dbPath}");
  conn.Open();
  return conn;
}

static void Exec(SqliteConnection conn, string sql, params (string key, object value)[] p)
{
  using var cmd = conn.CreateCommand();
  cmd.CommandText = sql;
  foreach (var (key, value) in p) cmd.Parameters.AddWithValue(key, value);
  cmd.ExecuteNonQuery();
}

static void EnsureColumn(SqliteConnection conn, string table, string column, string ddl)
{
  using var check = conn.CreateCommand();
  check.CommandText = $"PRAGMA table_info({table});";
  using var reader = check.ExecuteReader();
  var exists = false;
  while (reader.Read())
  {
    // PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
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

static void InitDb(string dbPath)
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

  // Eski calisan DB’lerde yeni sutunlar olmayabilir; sessizce ekle.
  EnsureColumn(conn, "audit_summary_cache", "tested_ui_elements", "INTEGER NOT NULL DEFAULT 0");
  EnsureColumn(conn, "audit_summary_cache", "total_ui_elements", "INTEGER NOT NULL DEFAULT 0");
  EnsureColumn(conn, "audit_summary_cache", "skipped_ui_elements", "INTEGER NOT NULL DEFAULT 0");
  EnsureColumn(conn, "audit_summary_cache", "failed_ui_elements", "INTEGER NOT NULL DEFAULT 0");
}

internal record CreateAuditRequest(
  string TargetUrl,
  string? LoginMode,
  string? Identifier,
  string? Password,
  int? MaxLinks,
  int? MaxUiAttempts
);

internal record AuditJob(
  string id,
  string targetUrl,
  string status,
  long createdAt,
  long startedAt,
  long finishedAt,
  string runDir,
  int exitCode,
  string errorMessage
);
