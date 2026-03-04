namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Self-learning history for UI elements (identified by a stable hash).
/// Tracks how many times an element pattern passed or failed across all runs.
/// </summary>
public sealed class ElementHistory
{
    /// <summary>Stable hash/identifier for the element pattern (e.g. reasonCode + humanName).</summary>
    public string ElementHash { get; set; } = default!;

    public int PassCount { get; set; }

    public int FailCount { get; set; }
}

