using System.ComponentModel.DataAnnotations;

namespace KamuAudit.Api.Contracts.Requests;

/// <summary>
/// Yeni bir audit run başlatmak için istek DTO'su.
/// </summary>
public sealed class CreateAuditRunRequest : IValidatableObject
{
    public Guid? SystemId { get; set; }

    [Required]
    [StringLength(1000)]
    public string TargetUrl { get; set; } = default!;

    [Range(1, 200)]
    public int? MaxLinks { get; set; }

    [Range(1, 200)]
    public int? MaxUiAttempts { get; set; }

    public bool? SafeMode { get; set; }

    public bool? Strict { get; set; }

    [StringLength(32)]
    public string? Browser { get; set; }

    /// <summary>
    /// Plugin listesi; virgülle ayrılmış (örn. "cookie-consent,nvi-cookie-consent").
    /// Maksimum ~10 plugin ve toplam uzunluk sınırı ile sınırlandırılır.
    /// </summary>
    [StringLength(2000)]
    public string? Plugins { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!Uri.TryCreate(TargetUrl, UriKind.Absolute, out var uri))
        {
            yield return new ValidationResult(
                "TargetUrl must be an absolute URL.",
                [nameof(TargetUrl)]);
        }

        if (!string.IsNullOrWhiteSpace(Plugins))
        {
            var items = Plugins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (items.Length > 10)
            {
                yield return new ValidationResult(
                    "Plugins list cannot contain more than 10 entries.",
                    [nameof(Plugins)]);
            }
        }
    }
}

