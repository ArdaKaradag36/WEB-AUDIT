⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Index Recommendations for Kamu Web Audit

This document summarizes query patterns observed in the backend and proposes additional PostgreSQL indexes. The goal is to improve performance on common list/detail/report views without changing application behavior.

All index names below are suggestions; adjust naming to your conventions as needed.

---

### 1. `audit_runs` – time filtering and retention

**Current model (relevant fields)**

- `Id (uuid, PK)`  
- `SystemId (uuid, nullable)`  
- `Status (text, queued|running|completed|failed)`  
- `StartedAt (timestamptz, nullable)`  
- `FinishedAt (timestamptz, nullable)`  

**Existing indexes (from `KamuAuditDbContext`):**

- `IX_audit_runs_Status` (`Status`)  
- `IX_audit_runs_SystemId` (`SystemId`)  

**Observed query patterns**

- In `AuditRunService.GetListAsync`:
  - Optional filter: `SystemId == systemId`  
  - Optional filter: `Status == status`  
  - Time window filter: `(StartedAt ?? FinishedAt) >= from` and `<= to`  
  - Sort: `ORDER BY (StartedAt ?? FinishedAt ?? DateTimeOffset.MinValue) DESC`
- In `RetentionCleanupBackgroundService.RunCleanupAsync`:
  - Filter: `FinishedAt < cutoff` and `Status != "running"`

**Recommendation A – time+status composite index (read‑heavy list + retention)**

The API list and retention cleanup both benefit from a composite index that starts with time and includes status:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_runs_finishedat_status
    ON audit_runs ("FinishedAt", "Status");
```

**Why it helps**

- Retention cleanup uses `WHERE FinishedAt < cutoff AND Status <> 'running'`, which can use this index as a range scan on `FinishedAt` and then filter `Status` cheaply.
- Many production workloads will have most completed runs with non‑null `FinishedAt`; this index keeps retention and any time‑based reports efficient as the table grows.

> **Note:** the API list uses `COALESCE(StartedAt, FinishedAt)` in LINQ. PostgreSQL cannot directly use an index on that expression via a standard EF index, but having `FinishedAt` indexed still helps for the majority of runs that are finished. If you later want a pure SQL/DB‑side index, see **Recommendation A‑alt** below.

**Optional EF Core model snippet (if you choose to add a migration)**

```csharp
// In OnModelCreating, AuditRuns configuration
entity.HasIndex(a => new { a.FinishedAt, a.Status });
```

This will generate an index equivalent to `ix_audit_runs_finishedat_status` on PostgreSQL.

**Recommendation A‑alt – functional index for time‑window queries (DBA‑level option)**

If you are comfortable managing indexes directly in PostgreSQL and want to align tightly with the LINQ expression `(StartedAt ?? FinishedAt)`, you can add a functional index instead of (or in addition to) A:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_runs_effective_started
    ON audit_runs (COALESCE("StartedAt", "FinishedAt"));
```

This matches the API’s `from`/`to` filters exactly, at the cost of being a database‑only construct (EF will not know about the expression).

---

### 2. `findings` – per‑run paging and severity filtering

**Current model (relevant fields)**

- `Id (uuid, PK)`  
- `AuditRunId (uuid, FK)`  
- `RuleId (text)`  
- `Severity (text)`  
- `Category (text)`  

**Existing indexes:**

- `IX_findings_AuditRunId` (`AuditRunId`)

**Observed query patterns**

In `AuditRunService`:

- **Detail/summary counts**
  - `WHERE AuditRunId = @id`
  - Group by `Severity`:
    - `Findings.Where(f => f.AuditRunId == id).GroupBy(f => f.Severity)`
  - `CountAsync(f => f.AuditRunId == id)`
- **Paged findings list**
  - Base filter: `WHERE AuditRunId = @auditId`
  - Optional filters: `Severity == severity`, `Category == category`
  - Sort: `ORDER BY Severity, RuleId`
  - Paging via `Skip/Take`

**Recommendation B – composite index for per‑run scans and ordering**

Add a composite index that matches the most selective predicates and the ORDER BY:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_findings_auditruns_severity_ruleid
    ON findings ("AuditRunId", "Severity", "RuleId");
```

**Why it helps**

- For a given `AuditRunId`, all findings are clustered by `Severity` then `RuleId`, which aligns with both the grouping and ordering patterns.
- The paged list (`ORDER BY Severity, RuleId` with `Skip/Take`) can be served almost entirely from the index, reducing heap lookups.
- The existing single‑column index on `AuditRunId` remains useful, but this composite index better matches real traffic on large runs.

**Optional EF Core model snippet**

```csharp
// In OnModelCreating, Findings configuration
entity.HasIndex(f => new { f.AuditRunId, f.Severity, f.RuleId });
```

---

### 3. `gaps` – per‑run paging and risk filtering

**Current model (relevant fields)**

- `Id (uuid, PK)`  
- `AuditRunId (uuid, FK)`  
- `ElementId (text)`  
- `ReasonCode (text)`  
- `RiskLevel (text)`  

**Existing indexes:**

- `IX_gaps_AuditRunId` (`AuditRunId`)

**Observed query patterns**

In `AuditRunService`:

- **Detail/summary counts**
  - `WHERE AuditRunId = @id`
  - Group by `RiskLevel`:
    - `Gaps.Where(g => g.AuditRunId == id).GroupBy(g => g.RiskLevel)`
  - `CountAsync(g => g.AuditRunId == id)`
- **Paged gaps list**
  - Base filter: `WHERE AuditRunId = @auditId`
  - Optional filters: `RiskLevel == riskLevel`, `ReasonCode == reasonCode`
  - Sort: `ORDER BY RiskLevel, ElementId`
  - Paging via `Skip/Take`

**Recommendation C – composite index for per‑run scans and ordering**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gaps_auditruns_risk_reason_element
    ON gaps ("AuditRunId", "RiskLevel", "ReasonCode", "ElementId");
```

**Why it helps**

- For a given `AuditRunId`, rows are organized by `RiskLevel` then `ReasonCode` and `ElementId`, which matches both filters and ordering.
- This is especially beneficial when a single audit run produces many gaps (large, complex UIs).

**Optional EF Core model snippet**

```csharp
// In OnModelCreating, Gaps configuration
entity.HasIndex(g => new { g.AuditRunId, g.RiskLevel, g.ReasonCode, g.ElementId });
```

---

### 4. Migration strategy (optional)

If you decide to materialize these indexes via EF Core migrations, one safe path is:

1. **Add the `HasIndex` calls** mentioned above to `KamuAuditDbContext.OnModelCreating` for `AuditRun`, `Finding`, and `Gap`.
2. **Create a migration** (from the `backend/KamuAudit.Api` directory):

   ```bash
   dotnet ef migrations add AddReportingIndexes --project KamuAudit.Api.csproj --startup-project KamuAudit.Api.csproj
   ```

3. **Apply the migration** to the target database (e.g., staging/prod):

   ```bash
   dotnet ef database update --project KamuAudit.Api.csproj --startup-project KamuAudit.Api.csproj
   ```

4. For large existing tables, consider manually editing the generated migration to use `CREATE INDEX CONCURRENTLY` with raw SQL and an online‑safe pattern (transaction‑less `CREATE INDEX CONCURRENTLY` plus a follow‑up `ALTER TABLE ...` to add EF metadata if needed). This avoids long table locks on very large datasets.

If you prefer **DBA‑managed indexes**, you can skip EF changes entirely and apply the raw `CREATE INDEX CONCURRENTLY` statements directly in PostgreSQL; EF will work transparently with these indexes without any code changes.

