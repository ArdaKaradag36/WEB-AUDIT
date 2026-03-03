using KamuAudit.Api.Application.Interfaces;
using Microsoft.AspNetCore.DataProtection;

namespace KamuAudit.Api.Infrastructure.Security;

/// <summary>
/// Credential protector implementation based on ASP.NET Core DataProtection.
/// Encrypts sensitive secrets (like target site passwords) before persisting.
/// </summary>
public sealed class DataProtectionCredentialProtector : ICredentialProtector
{
    private readonly IDataProtector _protector;

    public DataProtectionCredentialProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector("KamuAudit.Api.Credentials");
    }

    public string Protect(string plaintext)
    {
        if (string.IsNullOrEmpty(plaintext))
        {
            throw new ArgumentException("Plaintext must not be null or empty.", nameof(plaintext));
        }

        return _protector.Protect(plaintext);
    }

    public string Unprotect(string protectedPayload)
    {
        if (string.IsNullOrEmpty(protectedPayload))
        {
            throw new ArgumentException("Protected payload must not be null or empty.", nameof(protectedPayload));
        }

        return _protector.Unprotect(protectedPayload);
    }
}

