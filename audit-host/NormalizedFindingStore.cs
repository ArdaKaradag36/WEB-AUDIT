using Microsoft.Data.Sqlite;
using WebAudit.Core;

namespace AuditHost;

internal static class NormalizedFindingStore
{
    public static void UpsertSqlite(SqliteConnection conn, string jobId, string summaryPath)
    {
        if (!File.Exists(summaryPath)) return;
        string text;
        try
        {
            text = File.ReadAllText(summaryPath);
        }
        catch
        {
            return;
        }

        var norm = FindingNormalizer.FromSummaryJson(text);
        if (norm.Count == 0) return;
        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        AuditDb.Exec(conn, "DELETE FROM audit_normalized_findings WHERE job_id=$id", ("$id", jobId));
        foreach (var row in norm)
        {
            AuditDb.Exec(conn, """
                INSERT INTO audit_normalized_findings(job_id,fingerprint,rule_id,severity,category,title,detail,evidence_json,created_at)
                VALUES ($job_id,$fp,$rule,$sev,$cat,$title,$detail,$ev,$created)
                """,
                ("$job_id", jobId),
                ("$fp", row.Fingerprint),
                ("$rule", row.RuleId ?? (object)DBNull.Value),
                ("$sev", row.Severity ?? (object)DBNull.Value),
                ("$cat", row.Category ?? (object)DBNull.Value),
                ("$title", row.Title ?? (object)DBNull.Value),
                ("$detail", row.Detail ?? (object)DBNull.Value),
                ("$ev", row.EvidenceJson),
                ("$created", ts));
        }
    }
}
