namespace AuditHost;

internal record CreateAuditRequest(
    string TargetUrl,
    string? LoginMode,
    string? Identifier,
    string? Password,
    int? MaxLinks,
    int? MaxUiAttempts,
    string? ExternalTicketId
);
