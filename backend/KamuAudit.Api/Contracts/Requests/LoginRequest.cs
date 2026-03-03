using System.ComponentModel.DataAnnotations;

namespace KamuAudit.Api.Contracts.Requests;

public sealed class LoginRequest
{
    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = default!;

    [Required]
    [StringLength(128, MinimumLength = 8)]
    public string Password { get; set; } = default!;
}
