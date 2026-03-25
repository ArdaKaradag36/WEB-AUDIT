namespace WebAudit.Core;

public record AuditJob(
    string id,
    string targetUrl,
    string status,
    long createdAt,
    long startedAt,
    long finishedAt,
    string runDir,
    int exitCode,
    string errorMessage,
    string? externalTicketId);
