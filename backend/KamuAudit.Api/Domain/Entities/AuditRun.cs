namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Bir audit çalıştırmasının meta bilgisi; CLI runner ile çalışan her run için kayıt.
/// </summary>
public sealed class AuditRun
{
    public Guid Id { get; set; }

    public Guid? UserId { get; set; }

    public User? User { get; set; }

    public Guid? SystemId { get; set; }

    public SystemEntity? System { get; set; }

    public string TargetUrl { get; set; } = default!;

    /// <summary>
    /// queued | running | completed | failed
    /// Şimdilik string; ileride enum + converter'a çevrilebilir.
    /// </summary>
    public string Status { get; set; } = default!;

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    public bool SafeMode { get; set; }

    public int MaxLinks { get; set; }

    public int MaxUiAttempts { get; set; }

    public bool Strict { get; set; }

    public string? Browser { get; set; }

    /// <summary>
    /// Plugin listesi; şimdilik JSON string (örn. ["cookie-consent","nvi-cookie-consent"]).
    /// </summary>
    public string Plugins { get; set; } = "[]";

    /// <summary>
    /// Runner'ın çıktı yazdığı klasör; rapor dosyaları bu klasörde tutulur.
    /// </summary>
    public string? RunDir { get; set; }

    /// <summary>Duration in ms from summary.json metrics (set on ingestion).</summary>
    public long? DurationMs { get; set; }

    /// <summary>Link sampled count from summary metrics.</summary>
    public int? LinkSampled { get; set; }

    /// <summary>Link broken count from summary metrics.</summary>
    public int? LinkBroken { get; set; }

    /// <summary>Number of run attempts (incremented on failure; used for retry limit).</summary>
    public int AttemptCount { get; set; }

    /// <summary>Last error message when runner failed (for retries or final failure).</summary>
    public string? LastError { get; set; }

    /// <summary>When set, job is re-queued and will only be picked after this time (exponential backoff).</summary>
    public DateTimeOffset? RetryAfterUtc { get; set; }

    /// <summary>High-level error classification for the last run attempt (nullable for successful runs).</summary>
    public string? ErrorType { get; set; }

    /// <summary>Last process exit code emitted by the runner (if available).</summary>
    public int? LastExitCode { get; set; }

    /// <summary>Total number of retries that have been attempted for this run.</summary>
    public int RetryCount { get; set; }

    public ICollection<Finding> Findings { get; set; } = new List<Finding>();

    public ICollection<Gap> Gaps { get; set; } = new List<Gap>();
}

