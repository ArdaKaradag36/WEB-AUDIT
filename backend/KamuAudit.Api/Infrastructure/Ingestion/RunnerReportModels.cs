using System.Text.Json;
using System.Text.Json.Serialization;

namespace KamuAudit.Api.Infrastructure.Ingestion;

/// <summary>
/// Root of summary.json produced by the runner.
/// </summary>
public sealed class SummaryJsonRoot
{
    [JsonPropertyName("run")]
    public RunInfoJson? Run { get; set; }

    [JsonPropertyName("config")]
    public RunConfigJson? Config { get; set; }

    [JsonPropertyName("findings")]
    public List<FindingJson>? Findings { get; set; }

    [JsonPropertyName("metrics")]
    public MetricsJson? Metrics { get; set; }

    [JsonPropertyName("uiCoverage")]
    public UiCoverageSummaryJson? UiCoverage { get; set; }
}

public sealed class RunInfoJson
{
    [JsonPropertyName("runId")]
    public string? RunId { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("startedAt")]
    public string? StartedAt { get; set; }

    [JsonPropertyName("finishedAt")]
    public string? FinishedAt { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }
}

public sealed class RunConfigJson
{
    [JsonPropertyName("headless")]
    public bool Headless { get; set; }

    [JsonPropertyName("browser")]
    public string? Browser { get; set; }

    [JsonPropertyName("maxLinks")]
    public int MaxLinks { get; set; }
}

public sealed class FindingJson
{
    [JsonPropertyName("ruleId")]
    public string? RuleId { get; set; }

    [JsonPropertyName("severity")]
    public string? Severity { get; set; }

    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("detail")]
    public string? Detail { get; set; }

    [JsonPropertyName("remediation")]
    public string? Remediation { get; set; }

    [JsonPropertyName("meta")]
    public JsonElement? Meta { get; set; }
}

public sealed class MetricsJson
{
    [JsonPropertyName("durationMs")]
    public long? DurationMs { get; set; }

    [JsonPropertyName("linkSampled")]
    public int? LinkSampled { get; set; }

    [JsonPropertyName("linkBroken")]
    public int? LinkBroken { get; set; }

    [JsonPropertyName("consoleErrors")]
    public int? ConsoleErrors { get; set; }

    [JsonPropertyName("response4xx5xx")]
    public int? Response4xx5xx { get; set; }

    [JsonPropertyName("requestFailed")]
    public int? RequestFailed { get; set; }
}

public sealed class UiCoverageSummaryJson
{
    [JsonPropertyName("totalElements")]
    public int TotalElements { get; set; }

    [JsonPropertyName("testedElements")]
    public int TestedElements { get; set; }

    [JsonPropertyName("actionableGaps")]
    public int ActionableGaps { get; set; }
}

/// <summary>
/// Root of gaps.json: { "gaps": [...] }
/// </summary>
public sealed class GapsJsonRoot
{
    [JsonPropertyName("gaps")]
    public List<GapJson>? Gaps { get; set; }
}

public sealed class GapJson
{
    [JsonPropertyName("elementId")]
    public string? ElementId { get; set; }

    [JsonPropertyName("humanName")]
    public string? HumanName { get; set; }

    [JsonPropertyName("reasonCode")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actionHint")]
    public string? ActionHint { get; set; }

    [JsonPropertyName("riskLevel")]
    public string? RiskLevel { get; set; }

    [JsonPropertyName("recommendedScript")]
    public string? RecommendedScript { get; set; }

    [JsonPropertyName("evidence")]
    public JsonElement? Evidence { get; set; }
}
