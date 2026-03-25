using System.Text.Json;

namespace WebAudit.Core;

public static class SummaryJsonParser
{
    public static bool TryParseMetricsFromFile(string summaryPath, out string findingsBySeverityJson, out int pages, out int requests,
        out int skipped, out int testedElements, out int totalElements, out int skippedElements, out int failedElements)
    {
        findingsBySeverityJson = "{}";
        pages = requests = skipped = testedElements = totalElements = skippedElements = failedElements = 0;
        if (!File.Exists(summaryPath)) return false;
        return TryParseMetrics(File.ReadAllText(summaryPath), out findingsBySeverityJson, out pages, out requests,
            out skipped, out testedElements, out totalElements, out skippedElements, out failedElements);
    }

    public static bool TryParseMetrics(string summaryText, out string findingsBySeverityJson, out int pages, out int requests,
        out int skipped, out int testedElements, out int totalElements, out int skippedElements, out int failedElements)
    {
        findingsBySeverityJson = "{}";
        pages = requests = skipped = testedElements = totalElements = skippedElements = failedElements = 0;
        try
        {
            using var doc = JsonDocument.Parse(summaryText);
            var root = doc.RootElement;
            var metrics = root.TryGetProperty("metrics", out var m) ? m : default;
            if (metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("findingsBySeverity", out var f))
                findingsBySeverityJson = f.GetRawText();
            if (metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("pagesScanned", out var p))
                pages = p.GetInt32();
            if (metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("requestsTotal", out var r))
                requests = r.GetInt32();
            if (metrics.ValueKind != JsonValueKind.Undefined && metrics.TryGetProperty("skippedNetwork", out var s))
                skipped = s.GetInt32();

            var uiCoverage = root.TryGetProperty("uiCoverage", out var u) ? u : default;
            if (uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("totalElements", out var te))
                totalElements = te.GetInt32();
            if (uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("testedElements", out var t))
                testedElements = t.GetInt32();
            if (uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("skippedElements", out var se))
                skippedElements = se.GetInt32();
            if (uiCoverage.ValueKind != JsonValueKind.Undefined && uiCoverage.TryGetProperty("failedElements", out var fe))
                failedElements = fe.GetInt32();
            return true;
        }
        catch
        {
            return false;
        }
    }
}
