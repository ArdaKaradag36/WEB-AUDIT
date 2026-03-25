namespace AuditHost;

/// <summary>Shared paths and config for audit API handlers.</summary>
public sealed record AuditHostOptions(
    string DbPath,
    string RunnerDir,
    IConfiguration Configuration,
    string? PostgresConnectionString = null,
    bool PostgresExternalWorkerOnly = false,
    string? JobPayloadSecretKeyBase64 = null)
{
    public bool UsePostgres => !string.IsNullOrWhiteSpace(PostgresConnectionString);
}
