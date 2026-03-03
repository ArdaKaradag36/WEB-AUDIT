⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## İndeks Önerileri – Özet (TR)

> Ayrıntılı İngilizce sürüm: `INDEX_RECOMMENDATIONS_EN.md`.

Bu doküman, backend sorgu kalıplarına göre PostgreSQL üzerinde ek indeksler önermektedir.

### 1. `audit_runs` – Zaman Filtreleme ve Retention

- Mevcut sahalar: `Status`, `StartedAt`, `FinishedAt`, `SystemId`.
- Sorgular genellikle:
  - `Status` ve/veya `SystemId` ile filtreler,
  - `(StartedAt ?? FinishedAt)` aralığına göre filtreler,
  - `StartedAt ?? FinishedAt` alanına göre sıralama yapar.

**Öneri:**  
`FinishedAt` ve `Status` için bileşik indeks:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_runs_finishedat_status
    ON audit_runs ("FinishedAt", "Status");
```

Bu indeks, özellikle retention job’ının kullandığı `WHERE FinishedAt < cutoff AND Status <> 'running'` filtresini hızlandırır.

### 2. `findings` – Audit Bazlı Sayfalama ve Severity

Sorgular:

- `WHERE AuditRunId = @id`
- `GROUP BY Severity` (özetler için)
- Listeleme için `ORDER BY Severity, RuleId` ve sayfalama.

**Öneri:**  

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_findings_auditruns_severity_ruleid
    ON findings ("AuditRunId", "Severity", "RuleId");
```

Bu sayede hem özetler hem de sayfalı listeler büyük veride daha hızlı çalışır.

### 3. `gaps` – Audit Bazlı Sayfalama ve Risk

Sorgular:

- `WHERE AuditRunId = @id`
- `GROUP BY RiskLevel`
- Listeleme için `ORDER BY RiskLevel, ElementId` (+ `ReasonCode` filtresi).

**Öneri:**  

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gaps_auditruns_risk_reason_element
    ON gaps ("AuditRunId", "RiskLevel", "ReasonCode", "ElementId");
```

### 4. Migration Stratejisi

Bu indeksler; ister EF Core migration’ları üzerinden (`HasIndex`) ister doğrudan DBA script’i ile (`CREATE INDEX CONCURRENTLY`) uygulanabilir. Büyük tablolarda **concurrently** oluşturmak tablo kilitlenmesini azaltır.

Detaylar ve EF Core örnekleri için İngilizce dokümana bakınız: `INDEX_RECOMMENDATIONS_EN.md`.

