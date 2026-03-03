using System.ComponentModel.DataAnnotations;

namespace KamuAudit.Api.Contracts.Requests;

public sealed class CreateAuditWithCredentialsRequest
{
    [Required]
    public CreateAuditRunRequest Audit { get; set; } = default!;

    [StringLength(255)]
    public string? Username { get; set; }

    [StringLength(512)]
    public string? Password { get; set; }

    [StringLength(2000)]
    public string? TwoFactorNote { get; set; }
}

