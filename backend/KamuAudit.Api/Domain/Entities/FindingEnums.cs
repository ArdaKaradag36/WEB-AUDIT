namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Execution-level status of a finding produced by the runner.
/// This is distinct from lifecycle states like OPEN/FIXED; it describes
/// whether the underlying check was executed, skipped or failed.
/// </summary>
public enum FindingStatus
{
    OK,
    SKIPPED,
    FAILED,
    INFO
}

/// <summary>
/// Reason for a finding being marked as SKIPPED or for an audit being blocked.
/// </summary>
public enum SkipReason
{
    NETWORK_POLICY,
    RATE_LIMIT,
    TIMEOUT,
    AUTH_BLOCKED,
    ROBOTS,
    OTHER
}

