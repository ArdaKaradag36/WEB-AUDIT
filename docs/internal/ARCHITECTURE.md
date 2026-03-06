## Kamu Web Audit – İç Mimari Özeti

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit için hedeflenen **layered architecture** yapısının özetini
ve repo içindeki ana modüllerle eşleşmesini anlatır. Detaylar için
`docs/architecture/ARCHITECTURE.md` dosyasına bakabilirsiniz.

---

### 1. Katmanlar ve Bağımlılık Yönü

Mantıksal katmanlar:

```text
Presentation (UI - Next.js)
        |
        v
    API (REST - .NET Controllers)
        |
        v
Application (Use Cases / Services)
        |
        v
   Domain (Entities, Value Objects, Policies)

Infrastructure (DB, Runner, Queue, Integrations)
        ^           ^
        |           |
        +-----------+
```

- Katmanlar sadece içeri doğru bağımlıdır (UI → API → Application → Domain).
- **Domain** en içte ve en “saf” katmandır; HTTP, DB, Playwright, queue gibi detayları bilmez.
- **Infrastructure**, Domain / Application tarafından tanımlanan port/interface’leri gerçekleştirir.

Detaylı sorumluluk ve interface listesi için: `docs/architecture/ARCHITECTURE.md`.

---

### 2. Repo Yapısı ile Eşleşme

- `frontend/` → **Presentation**
  - Next.js tabanlı web arayüzü,
  - Targets, Scans, Findings, Auth Profiles, Settings sayfaları.

- `backend/KamuAudit.Api/Controllers` → **API Layer**
  - REST endpoint’leri (`AuditsController`, `AuthController` vb.),
  - JWT auth, model binding, ProblemDetails hata modeli.

- `backend/KamuAudit.Api/Application/...` → **Application Layer**
  - Use case servisleri (`AuditRunService` vb.),
  - İş akışlarının ve transaction sınırlarının koordine edildiği yer.

- `backend/KamuAudit.Api/Domain/...` → **Domain Layer**
  - `AuditRun`, `Finding`, `FindingTemplate`, `FindingInstance` gibi entity’ler,
  - Domain kuralları ve politikalar.

- `backend/KamuAudit.Api/Infrastructure/...` → **Infrastructure Layer**
  - EF Core repository implementasyonları ve `KamuAuditDbContext`,
  - Ingestion (`AuditResultIngestor`),
  - Background worker (`AuditRunnerBackgroundService`),
  - Idempotency key TTL & cleanup (`IdempotencyCleanupBackgroundService`),
  - SSRF guard, DataProtection tabanlı credential encryption,
  - Observability ve rate limiting altyapıları.

- `runner/` → Infrastructure içinde **Runner ve Rule Engine**
  - `src/core/crawler/*` – Playwright crawler,
  - `src/core/auth/*` – Auth profile login executor,
  - `src/rules/http/*`, `src/rules/forms/*`, `src/rules/js/*` – kural motoru,
  - `src/domain/*` – runner tarafı domain modelleri (Finding, Summary, Result),
  - `summary.json`, `findings.json`, `gaps.json`, `ui-inventory.json` üretimi.

---

### 3. İlgili Dokümanlar

- Detaylı layered architecture: `docs/architecture/ARCHITECTURE.md`
- Domain modeli: `docs/domain/DOMAIN.md`
- DB şeması: `docs/db/SCHEMA.md`, `docs/db/MIGRATIONS.md`
- API sözleşmesi: `docs/api/openapi.yaml`, `docs/api/API_GUIDE.md`, `docs/internal/API.md`
- Observability: `docs/ops/OBSERVABILITY.md`
- Güvenlik: `docs/security/SECURITY.md`

