namespace KamuAudit.Api.Application.Interfaces;

/// <summary>
/// Reads runner JSON reports (summary.json, gaps.json) from RunDir and persists Findings and Gaps.
/// Idempotent: replaces existing data for the run. Caller must SaveChanges after.
/// </summary>
public interface IAuditResultIngestor
{
    Task IngestAsync(Guid auditRunId, CancellationToken cancellationToken = default);
}
