using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;

namespace AuditHost;

internal static class SarifExport
{
    /// <summary>Best-effort SARIF 2.1.0 from runner summary.json (severity counts).</summary>
    public static string FromSummaryJson(string summaryJson, string runId)
    {
        try
        {
            using var doc = JsonDocument.Parse(summaryJson);
            var root = doc.RootElement;
            var findings = root.TryGetProperty("metrics", out var m) && m.TryGetProperty("findingsBySeverity", out var f)
                ? f
                : default;
            var rules = new JsonArray();
            var results = new JsonArray();
            if (findings.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in findings.EnumerateObject())
                {
                    var level = MapLevel(prop.Name);
                    var ruleId = $"WEB-AUDIT/{prop.Name}";
                    rules.Add(new JsonObject
                    {
                        ["id"] = ruleId,
                        ["name"] = prop.Name,
                    });
                    results.Add(new JsonObject
                    {
                        ["ruleId"] = ruleId,
                        ["level"] = level,
                        ["message"] = new JsonObject { ["text"] = $"Count: {prop.Value.GetInt32()}" },
                    });
                }
            }

            var sarif = new JsonObject
            {
                ["$schema"] = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
                ["version"] = "2.1.0",
                ["runs"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["tool"] = new JsonObject
                        {
                            ["driver"] = new JsonObject
                            {
                                ["name"] = "WEB-AUDIT",
                                ["version"] = "1.0.0",
                                ["rules"] = rules,
                            },
                        },
                        ["results"] = results,
                        ["properties"] = new JsonObject { ["runId"] = runId },
                    },
                },
            };
            return sarif.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            return """{"version":"2.1.0","runs":[]}""";
        }
    }

    private static string MapLevel(string name) => name.ToLowerInvariant() switch
    {
        "critical" => "error",
        "error" => "error",
        "warn" => "warning",
        _ => "note",
    };

    private static readonly HashSet<string> _sensitiveCSharpKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "passwd", "pwd", "token", "access_token", "refresh_token",
        "authorization", "bearer", "cookie", "set-cookie",
        "x-api-key", "api-key", "apikey", "api_key",
        "secret", "api_secret", "client_secret",
        "credential", "credentials", "private_key", "session", "sessionid",
    };

    /// <summary>Phase 5: optional PII redaction in JSON text when AuditHost:RedactJsonResponses=true.</summary>
    public static string TryRedactJson(string json, IConfiguration configuration)
    {
        if (!configuration.GetValue("AuditHost:RedactJsonResponses", false))
            return json;
        try
        {
            var node = JsonNode.Parse(json);
            if (node == null) return json;
            RedactNode(node);
            return node.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            return json;
        }
    }

    private static void RedactNode(JsonNode node)
    {
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(p => p.Key).ToList())
            {
                if (_sensitiveCSharpKeys.Contains(key))
                    obj[key] = JsonValue.Create("[REDACTED]");
                else if (obj[key] is { } child)
                    RedactNode(child);
            }
        }
        else if (node is JsonArray arr)
        {
            foreach (var item in arr)
            {
                if (item != null) RedactNode(item);
            }
        }
    }
}
