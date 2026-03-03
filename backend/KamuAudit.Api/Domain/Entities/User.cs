namespace KamuAudit.Api.Domain.Entities;

/// <summary>
/// Sistem kullanıcısı; ileride login/rol bazlı yetkilendirme için temel entity.
/// </summary>
public sealed class User
{
    public Guid Id { get; set; }

    public string Email { get; set; } = default!;

    public string PasswordHash { get; set; } = default!;

    public string Role { get; set; } = default!;

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<AuditRun> AuditRuns { get; set; } = new List<AuditRun>();
}

