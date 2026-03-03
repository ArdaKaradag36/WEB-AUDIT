namespace KamuAudit.Api.Application.Interfaces;

/// <summary>
/// Abstraction over encryption for sensitive credentials (e.g., target site passwords).
/// Backed by ASP.NET Core DataProtection in production.
/// </summary>
public interface ICredentialProtector
{
    string Protect(string plaintext);

    string Unprotect(string protectedPayload);
}

