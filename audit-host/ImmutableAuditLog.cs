using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Npgsql;
using WebAudit.Postgres;

namespace AuditHost;

internal static class ImmutableAuditLog
{
    private const string Genesis = "GENESIS";

    public static void TryAppendSqlite(string dbPath, string eventType, string? actor, string? subject, object payload)
    {
        try
        {
            var json = JsonSerializer.Serialize(payload);
            using var conn = AuditDb.Open(dbPath);
            AppendSqlite(conn, eventType, actor, subject, json);
        }
        catch
        {
            /* best-effort */
        }
    }

    public static void TryAppendPostgres(string? cs, string eventType, string? actor, string? subject, object payload)
    {
        if (string.IsNullOrEmpty(cs)) return;
        try
        {
            var json = JsonSerializer.Serialize(payload);
            using var conn = PostgresAudit.Open(cs);
            AppendPostgres(conn, eventType, actor, subject, json);
        }
        catch
        {
            /* best-effort */
        }
    }

    private static void AppendSqlite(SqliteConnection conn, string eventType, string? actor, string? subject, string payloadJson)
    {
        string prevHash;
        long nextSeq;
        long ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT seq, entry_hash FROM immutable_audit_events ORDER BY seq DESC LIMIT 1";
            using var r = cmd.ExecuteReader();
            if (r.Read())
            {
                nextSeq = r.GetInt64(0) + 1;
                prevHash = r.GetString(1);
            }
            else
            {
                nextSeq = 1;
                prevHash = Genesis;
            }
        }

        var entryHash = ComputeHash(prevHash, nextSeq, ts, eventType, actor, subject, payloadJson);
        using var ins = conn.CreateCommand();
        ins.CommandText = """
            INSERT INTO immutable_audit_events(seq,event_ts,event_type,actor,subject,payload_json,prev_hash,entry_hash)
            VALUES ($seq,$ts,$etype,$actor,$subj,$payload,$prev,$eh)
            """;
        ins.Parameters.AddWithValue("$seq", nextSeq);
        ins.Parameters.AddWithValue("$ts", ts);
        ins.Parameters.AddWithValue("$etype", eventType);
        ins.Parameters.AddWithValue("$actor", actor ?? (object)DBNull.Value);
        ins.Parameters.AddWithValue("$subj", subject ?? (object)DBNull.Value);
        ins.Parameters.AddWithValue("$payload", payloadJson);
        ins.Parameters.AddWithValue("$prev", prevHash);
        ins.Parameters.AddWithValue("$eh", entryHash);
        ins.ExecuteNonQuery();
    }

    private static void AppendPostgres(NpgsqlConnection conn, string eventType, string? actor, string? subject, string payloadJson)
    {
        string prevHash;
        long nextSeq;
        long ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT seq, entry_hash FROM immutable_audit_events ORDER BY seq DESC LIMIT 1";
            using var r = cmd.ExecuteReader();
            if (r.Read())
            {
                nextSeq = r.GetInt64(0) + 1;
                prevHash = r.GetString(1);
            }
            else
            {
                nextSeq = 1;
                prevHash = Genesis;
            }
        }

        var entryHash = ComputeHash(prevHash, nextSeq, ts, eventType, actor, subject, payloadJson);
        using var ins = conn.CreateCommand();
        ins.CommandText = """
            INSERT INTO immutable_audit_events(seq,event_ts,event_type,actor,subject,payload_json,prev_hash,entry_hash)
            VALUES (@seq,@ts,@etype,@actor,@subj,@payload,@prev,@eh)
            """;
        ins.Parameters.AddWithValue("seq", nextSeq);
        ins.Parameters.AddWithValue("ts", ts);
        ins.Parameters.AddWithValue("etype", eventType);
        ins.Parameters.AddWithValue("actor", actor ?? (object)DBNull.Value);
        ins.Parameters.AddWithValue("subj", subject ?? (object)DBNull.Value);
        ins.Parameters.AddWithValue("payload", payloadJson);
        ins.Parameters.AddWithValue("prev", prevHash);
        ins.Parameters.AddWithValue("eh", entryHash);
        ins.ExecuteNonQuery();
    }

    private static string ComputeHash(string prevHash, long seq, long ts, string eventType, string? actor, string? subject, string payloadJson)
    {
        var canonical = $"{prevHash}|{seq}|{ts}|{eventType}|{actor}|{subject}|{payloadJson}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
