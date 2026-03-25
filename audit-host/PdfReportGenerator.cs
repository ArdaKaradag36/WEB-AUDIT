using System.Text.Json;
using WebAudit.Core;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AuditHost;

internal static class PdfReportGenerator
{
    static PdfReportGenerator()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] FromSummaryJson(string summaryJson, string jobId, string? redactedNotice = null)
    {
        using var doc = JsonDocument.Parse(summaryJson);
        var root = doc.RootElement;
        var run = root.TryGetProperty("run", out var r) ? r : default;
        var url = run.ValueKind != JsonValueKind.Undefined && run.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
        var status = run.ValueKind != JsonValueKind.Undefined && run.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";
        var started = run.ValueKind != JsonValueKind.Undefined && run.TryGetProperty("startedAt", out var sa) ? sa.GetString() ?? "" : "";
        var finished = run.ValueKind != JsonValueKind.Undefined && run.TryGetProperty("finishedAt", out var fa) ? fa.GetString() ?? "" : "";

        var metrics = root.TryGetProperty("metrics", out var m) ? m : default;
        var pages = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("pagesScanned", out var p) ? p.GetInt32() : 0;
        var findingsSeverity = metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("findingsBySeverity", out var f)
            ? f.GetRawText()
            : "{}";

        var normalized = FindingNormalizer.FromSummaryJson(summaryJson);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(36);
                page.Header().Text($"WEB-AUDIT raporu — {jobId}").SemiBold().FontSize(16);
                page.Content().Column(col =>
                {
                    col.Spacing(6);
                    if (!string.IsNullOrEmpty(redactedNotice))
                        col.Item().Background(Colors.Orange.Medium).Padding(8).Text(redactedNotice).FontSize(9);
                    col.Item().Text($"Hedef: {url}");
                    col.Item().Text($"Durum: {status}  |  Baslangic: {started}  |  Bitis: {finished}");
                    col.Item().Text($"Sayfa: {pages}");
                    col.Item().Text("Ozette bulgu dagilimi (JSON):");
                    col.Item().PaddingLeft(8).Text(findingsSeverity).FontSize(8).FontFamily(Fonts.CourierNew);
                    col.Item().PaddingTop(10).Text("Normalize bulgular (ilk 120)").SemiBold();
                    foreach (var n in normalized.Take(120))
                    {
                        var line = $"{n.RuleId} [{n.Severity}] {Truncate(n.Title ?? "", 100)}";
                        col.Item().Text(line).FontSize(9);
                    }
                });
            });
        }).GeneratePdf();
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
