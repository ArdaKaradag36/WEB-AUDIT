using KamuAudit.Api.Domain.Entities;

namespace KamuAudit.Api.Application.Interfaces;

/// <summary>
/// Runs the external Node/Playwright audit CLI for a given audit run.
/// </summary>
public interface IAuditRunner
{
    /// <summary>
    /// Executes the runner process for the given audit. RunDir is the relative path (e.g. reports/runs/guid).
    /// Optional credential context is used for login-required targets.
    /// Returns true if exit code indicates success (0 or 2), false otherwise.
    /// </summary>
    Task<bool> RunAsync(AuditRun run, AuditCredentialContext? credential, string runDirRelative, CancellationToken cancellationToken = default);
}

public sealed class AuditCredentialContext
{
    public string? Username { get; init; }
    public string? Password { get; init; }
    public string? TwoFactorNote { get; init; }
}

