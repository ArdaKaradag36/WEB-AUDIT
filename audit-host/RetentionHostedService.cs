using WebAudit.Postgres;

namespace AuditHost;

/// <summary>Periodic purge of finished audits older than <see cref="AuditHost:Retention:DeletedAfterDays"/>.</summary>
internal sealed class RetentionHostedService : BackgroundService
{
    private readonly AuditHostOptions _options;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RetentionHostedService> _logger;

    public RetentionHostedService(AuditHostOptions options, IConfiguration configuration, ILogger<RetentionHostedService> logger)
    {
        _options = options;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = Math.Max(1, _configuration.GetValue("AuditHost:Retention:IntervalHours", 24));
        using var timer = new PeriodicTimer(TimeSpan.FromHours(intervalHours));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            var days = _configuration.GetValue("AuditHost:Retention:DeletedAfterDays", 0);
            if (days > 0)
            {
                var cutoff = DateTimeOffset.UtcNow.AddDays(-days).ToUnixTimeSeconds();
                try
                {
                    if (_options.UsePostgres && _options.PostgresConnectionString is { } pg)
                        PurgePostgres(pg, cutoff);
                    else
                        PurgeSqlite(_options.DbPath, cutoff);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Retention purge failed");
                }
            }

            // Reconcile stuck running jobs every cycle regardless of retention days setting.
            var maxAgeMinutes = _configuration.GetValue("AuditHost:Reconcile:MaxAgeMinutes", 120);
            try
            {
                if (_options.UsePostgres && _options.PostgresConnectionString is { } pgReconcile)
                    PostgresAudit.ReconcileStuckJobs(pgReconcile, _options.RunnerDir, maxAgeMinutes);
                else
                    AuditDb.ReconcileStuckJobs(_options.DbPath, _options.RunnerDir, maxAgeMinutes);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Reconcile stuck jobs failed");
            }

            CleanStaleTmpDirs(_options.RunnerDir);
        }
    }

    private void PurgeSqlite(string dbPath, long cutoff)
    {
        var victims = new List<(string Id, string RunDir)>();
        using (var conn = AuditDb.Open(dbPath))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id, run_dir FROM audit_jobs WHERE created_at < $cut AND status != 'running'";
            cmd.Parameters.AddWithValue("$cut", cutoff);
            using var r = cmd.ExecuteReader();
            while (r.Read())
                victims.Add((r.GetString(0), r.GetString(1)));
        }

        foreach (var (id, runDirRel) in victims)
        {
            using var conn = AuditDb.Open(dbPath);
            AuditDb.Exec(conn, "DELETE FROM audit_summary_cache WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_normalized_findings WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_credentials WHERE job_id=$id", ("$id", id));
            AuditDb.Exec(conn, "DELETE FROM audit_jobs WHERE id=$id", ("$id", id));
            TryDeleteRunDir(_options.RunnerDir, runDirRel);
        }

        if (victims.Count > 0)
            _logger.LogInformation("Retention: removed {Count} SQLite audit job(s) older than cutoff", victims.Count);
    }

    private void PurgePostgres(string cs, long cutoff)
    {
        var victims = new List<(string Id, string RunDir)>();
        using (var conn = PostgresAudit.Open(cs))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id, run_dir FROM audit_jobs WHERE created_at < @cut AND status <> 'running'";
            cmd.Parameters.AddWithValue("cut", cutoff);
            using var r = cmd.ExecuteReader();
            while (r.Read())
                victims.Add((r.GetString(0), r.GetString(1)));
        }

        foreach (var (id, runDirRel) in victims)
        {
            using var conn = PostgresAudit.Open(cs);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM audit_jobs WHERE id=@id";
            cmd.Parameters.AddWithValue("id", id);
            cmd.ExecuteNonQuery();
            TryDeleteRunDir(_options.RunnerDir, runDirRel);
        }

        if (victims.Count > 0)
            _logger.LogInformation("Retention: removed {Count} Postgres audit job(s) older than cutoff", victims.Count);
    }

    private void CleanStaleTmpDirs(string runnerDir, int maxAgeHours = 4)
    {
        var reportsBase = Path.Combine(runnerDir, "reports", "runs");
        if (!Directory.Exists(reportsBase)) return;
        var cutoff = DateTime.UtcNow.AddHours(-maxAgeHours);
        foreach (var dir in Directory.GetDirectories(reportsBase, "*.tmp", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var created = Directory.GetCreationTimeUtc(dir);
                if (created < cutoff)
                {
                    Directory.Delete(dir, recursive: true);
                    _logger.LogInformation("Retention: deleted stale .tmp directory {Dir}", dir);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Retention: could not delete .tmp dir {Dir}", dir);
            }
        }
    }

    private void TryDeleteRunDir(string runnerDir, string runDirRel)
    {
        var runnerRoot = Path.GetFullPath(runnerDir).TrimEnd(Path.DirectorySeparatorChar);
        var rel = runDirRel.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var target = Path.GetFullPath(Path.Combine(runnerDir, rel));
        var prefix = runnerRoot + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            if (Directory.Exists(target))
                Directory.Delete(target, recursive: true);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Retention: could not delete run dir {Path}", target);
        }
    }
}
