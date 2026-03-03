namespace KamuAudit.Api.Contracts.Responses;

public sealed class LoginResponse
{
    public string Token { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string Role { get; set; } = default!;
    public DateTimeOffset ExpiresAt { get; set; }
}
