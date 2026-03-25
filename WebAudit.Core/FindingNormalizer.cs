using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WebAudit.Core;

public sealed record NormalizedFindingRow(
    string Fingerprint,
    string? RuleId,
    string? Severity,
    string? Category,
    string? Title,
    string? Detail,
    string EvidenceJson);

public static class FindingNormalizer
{
    public static IReadOnlyList<NormalizedFindingRow> FromSummaryJson(string summaryText)
    {
        var list = new List<NormalizedFindingRow>();
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(summaryText);
        }
        catch
        {
            return list;
        }

        using (doc)
        {
            if (!doc.RootElement.TryGetProperty("findings", out var arr) || arr.ValueKind != JsonValueKind.Array)
                return list;

            foreach (var f in arr.EnumerateArray())
            {
                var ruleId = f.TryGetProperty("ruleId", out var r) ? r.GetString() : null;
                var severity = f.TryGetProperty("severity", out var sev) ? sev.GetString() : null;
                var category = f.TryGetProperty("category", out var c) ? c.GetString() : null;
                var title = f.TryGetProperty("title", out var t) ? t.GetString() : null;
                var detail = f.TryGetProperty("detail", out var d) ? d.GetString() : null;
                var evidence = f.TryGetProperty("meta", out var meta) ? meta.GetRawText() : "{}";
                var fp = Fingerprint(ruleId, severity, category, title, detail);
                list.Add(new NormalizedFindingRow(fp, ruleId, severity, category, title, detail, evidence));
            }
        }

        return list;
    }

    public static string Fingerprint(string? ruleId, string? severity, string? category, string? title, string? detail)
    {
        var raw = $"{ruleId ?? ""}|{severity ?? ""}|{category ?? ""}|{title ?? ""}|{detail ?? ""}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
