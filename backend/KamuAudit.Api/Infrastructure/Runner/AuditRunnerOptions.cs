namespace KamuAudit.Api.Infrastructure.Runner;

/// <summary>
/// TypeScript audit runner (Playwright CLI) için konfigürasyon seçenekleri.
/// </summary>
public sealed class AuditRunnerOptions
{
    /// <summary>
    /// Çalışma dizini; varsayılan olarak backend bin klasöründen ../../../../runner altına göre hesaplanır.
    /// Örn: "..\\..\\..\\..\\runner"
    /// </summary>
    public string WorkingDirectory { get; set; } = "..\\..\\..\\..\\runner";

    /// <summary>
    /// Node.js çalıştırılabilir adı veya yolu (örn. "node").
    /// </summary>
    public string NodePath { get; set; } = "node";

    /// <summary>
    /// Runner CLI entrypoint'i; WorkingDirectory altında göreceli yol (örn. "dist/cli.js").
    /// </summary>
    public string CliScript { get; set; } = "dist/cli.js";

    /// <summary>Maximum concurrent audit runs (default 1).</summary>
    public int MaxConcurrentRuns { get; set; } = 1;

    /// <summary>Max retry attempts per run before marking failed (default 3).</summary>
    public int MaxAttempts { get; set; } = 3;

    /// <summary>
    /// Maximum duration for a single runner process before it is killed (in minutes).
    /// </summary>
    public int MaxRunDurationMinutes { get; set; } = 15;

    /// <summary>
    /// Lease duration (in seconds) used for DB leasing of audit_runs rows.
    /// </summary>
    public int LeaseDurationSeconds { get; set; } = 60;

    /// <summary>
    /// Development-only helper to simulate a hung runner (in seconds). Optional; do not enable in production.
    /// </summary>
    public int? SimulateHangSeconds { get; set; }
}

