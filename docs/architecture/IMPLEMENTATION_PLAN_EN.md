⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

# Implementation Plan — Production Components

## Checklist (ordered) with risk and file-level plan

### PHASE 1 — Critical Fixes

| # | Task | Risk | Files to add/change |
|---|------|------|---------------------|
| **1A** | **JSON → DB ingestion** | Medium | **New:** `Infrastructure/Ingestion/RunnerReportModels.cs` (DTOs for summary/gaps JSON), `Infrastructure/Ingestion/AuditResultIngestor.cs` (parse + map + idempotent persist). **Change:** `AuditRunnerBackgroundService.cs` (after run, call ingestor in same transaction); `AuditsController.cs` (GET findings, GET gaps, GET summary; extend GET by-id with aggregates). **New DTOs:** `FindingsResponse`, `GapsResponse`, `AuditSummaryResponse`, extend `AuditRunDetailDto`. |
| **1B** | **Runner minimal summary.json on crash** | Low | **Change:** `runner/src/cli.ts` (wrap main in try/catch, on catch write minimal summary.json then rethrow). **New:** `runner/src/reporting/writeMinimalSummary.ts` (write summary with status=failed, error). |
| **1C** | **Secure configuration** | Low | **Change:** `appsettings.json`, `appsettings.Development.json` (remove or placeholder connection string). **Doc:** instructions for `dotnet user-secrets set` and env vars. |

### PHASE 2 — Architecture

| # | Task | Risk | Files to add/change |
|---|------|------|---------------------|
| **2D** | **Application layer** | Medium | **New:** `Application/Services/AuditRunService.cs`, `Application/Interfaces/IAuditRunService.cs`, `IAuditRunner.cs`, `IAuditResultIngestor.cs`. **New:** `Infrastructure/Runner/NodeAuditRunner.cs` (implements IAuditRunner), ingestor implements IAuditResultIngestor. **Change:** `Program.cs` (register services), `AuditsController.cs` (use IAuditRunService only). |
| **2E** | **Job concurrency safety** | Medium | **New:** Migration (add `attempt_count`, `last_error` to audit_runs). **Change:** `AuditRun` entity; `AuditRunnerBackgroundService` or new job processor: atomic `SELECT ... FOR UPDATE SKIP LOCKED` or `UPDATE ... WHERE status='queued' ... RETURNING *`; configurable concurrency; retry with exponential backoff. |

### PHASE 3 — Production Readiness

| # | Task | Risk | Files to add/change |
|---|------|------|---------------------|
| **3F** | **Observability** | Low | **New:** Serilog (JSON console), correlation (AuditRunId in scope), `/metrics` (Prometheus or in-memory), `/health/live`, `/health/ready` (DB). **Change:** `Program.cs`, `*.csproj` (Serilog packages). |
| **3G** | **Auth (JWT + roles)** | Medium | **New:** `AuthController` (register, login), JWT options, `[Authorize]` on audit endpoints. **Change:** User entity already exists; add PasswordHash with IPasswordHasher; role claims. |
| **3H** | **CI (GitHub Actions)** | Low | **New:** `.github/workflows/backend-ci.yml` (build, test, optional Postgres + migrations). |

### Testing

| # | Task | Risk | Files |
|---|------|------|--------|
| **T** | **Unit + fixtures** | Low | **New:** `KamuAudit.Tests` (or in-api test project), `Fixtures/summary.json`, `Fixtures/gaps.json`; unit tests for ingestor (parse, idempotency). Optional: integration test (POST audit, reserve once). |

---

## Idempotency strategy (1A)

**Choice:** When both `summary.json` and `gaps.json` exist, delete existing Findings and Gaps for the AuditRunId, then insert all from JSON, inside the same transaction that updates run status to completed/failed.  
If `summary.json` is missing, ingestion is skipped and existing Findings/Gaps are preserved.  
If `summary.json` exists but `gaps.json` is missing, Findings/metrics are replaced but existing Gaps are preserved.

**Justification:** Simpler than upsert (no natural business key for Finding/Gap except audit+rule or audit+elementId); re-ingestion after fix is rare; keeps schema simple and avoids ON CONFLICT handling.

---

## Execution order

1. Phase 1A → 1B → 1C  
2. Phase 2D → 2E  
3. Phase 3F → 3G → 3H  
4. Tests (fixtures + unit tests for ingestor; optional integration).

---

## How to run locally (backend)

### Secrets (required)

**No connection string or other secrets are committed.** Set them as follows.

**Development (User Secrets):**

```bash
cd backend/KamuAudit.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=YOUR_PASSWORD"
dotnet user-secrets set "Jwt:Key" "YOUR_SECRET_KEY_AT_LEAST_32_CHARS_LONG_FOR_DEV"
```

**Production:** Set environment variables:
- `ConnectionStrings__Default` (double underscore for nested key)
- `Jwt__Key` — JWT signing key (required; min 32 characters, 64+ recommended)

The app will not start if `Jwt:Key` is missing. There is no default key.

### Run API and migrations

```bash
cd backend/KamuAudit.Api
dotnet ef database update
dotnet run
```

### Runner configuration (timeouts and hang simulation)

- `Runner:MaxRunDurationMinutes` — maximum duration for a single Node/Playwright runner process before it is killed (default: `15`).  
  - Override via `appsettings.json` / `appsettings.Development.json` under the `Runner` section, or environment variable `Runner__MaxRunDurationMinutes`.
- `Runner:SimulateHangSeconds` — development-only helper to simulate a hung runner without calling Node (in seconds).  
  - Configure via `appsettings.Development.json` or environment variable `Runner__SimulateHangSeconds`. Do **not** enable in production.

When a run exceeds `Runner:MaxRunDurationMinutes`, the backend:
- kills the runner process (and process tree where supported),
- logs a structured error with `AuditRunId` and timeout duration,
- sets `AuditRun.LastError` to `"Runner timeout after {X} minutes."`,
- increments `AttemptCount` and applies the existing retry/backoff policy.

### Rate limiting (auth + audit creation)

Rate limiting is enabled by default using ASP.NET Core's built-in rate limiting middleware.

- Auth endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - Policy: `"AuthPolicy"` — default **10 requests per minute per IP**.
- Audit creation endpoint:
  - `POST /api/Audits`
  - Policy: `"AuditCreatePolicy"` — default **5 requests per minute per IP**.

Configuration (defaults):

```json
"RateLimiting": {
  "Enabled": true,
  "Auth": 10,
  "AuditCreate": 5
}
```

Environment overrides:
- `RateLimiting__Enabled` (`true`/`false`)
- `RateLimiting__Auth` (integer; requests per minute for auth endpoints)
- `RateLimiting__AuditCreate` (integer; requests per minute for audit creation)

When the limit is exceeded:
- the API returns **HTTP 429** with body: `{"error":"rate_limited","retryAfterSeconds":X}`
- the `Retry-After` header is set to `X` seconds.

### Verify Phase 1A (ingestion) with curl

```bash
# Create audit
curl -s -X POST http://localhost:5000/api/Audits -H "Content-Type: application/json" -d "{\"targetUrl\":\"https://example.com\"}" | jq

# Get audit by id (use id from above)
curl -s "http://localhost:5000/api/Audits/{id}" | jq

# After run completes: findings, gaps, summary
curl -s "http://localhost:5000/api/Audits/{id}/findings?page=1&pageSize=10" | jq
curl -s "http://localhost:5000/api/Audits/{id}/gaps?page=1&pageSize=10" | jq
curl -s "http://localhost:5000/api/Audits/{id}/summary" | jq
```

### Run unit tests

```bash
cd backend/KamuAudit.Tests
dotnet restore
dotnet build
dotnet test
```

If the test host reports missing assemblies (e.g. JwtBearer, Newtonsoft.Json), ensure a stable .NET 8 SDK (non-preview) or run from the solution directory. Fixtures are under `backend/KamuAudit.Tests/Fixtures/` (summary.json, gaps.json).

