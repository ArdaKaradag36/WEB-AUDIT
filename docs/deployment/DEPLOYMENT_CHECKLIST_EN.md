⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Deployment Checklist – Kamu Web Audit

Use this checklist before promoting a build to staging or production.

### 1. Environment & Secrets

- [ ] **.NET SDK 8.0.418** installed on build/CI agents and any machine running `dotnet ef` or `dotnet` commands (matches `global.json`).
- [ ] **Node.js 20.x LTS** installed on hosts building/running the runner (matches `.nvmrc` and CI).
- [ ] **Database connection string** set via `ConnectionStrings__Default` (no secrets in config files).
- [ ] **JWT signing key** set via `Jwt__Key` (min 32 chars, 64+ recommended); no default/fallback key.
- [ ] **Runner configuration** set:
  - `Runner__WorkingDirectory`
  - `Runner__NodePath`
  - `Runner__CliScript` (e.g. `dist/cli.js`)
  - `Runner__MaxRunDurationMinutes` appropriate for environment.
- [ ] **Rate limiting** tuned via `RateLimiting__Enabled`, `RateLimiting__Auth`, `RateLimiting__AuditCreate`.
- [ ] **CORS** configured if a frontend exists (`Cors__Enabled`, `Cors__AllowedOrigins`).
- [ ] **OpenTelemetry** endpoint/headers configured if sending traces (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`).

### 2. Database & Migrations

- [ ] PostgreSQL 16 instance provisioned (or managed equivalent).
- [ ] App role and database created (e.g. `kamu_audit_app` / `kamu_audit`).
- [ ] `dotnet ef database update` run against the target DB using the same SDK as CI.
- [ ] If retention is desired, `Retention__Enabled` and `Retention__KeepDays` are set and validated in a lower environment first.

### 3. Runner & Playwright

- [ ] From `runner/` with Node 20:
  - [ ] `npm ci`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `npm test`
- [ ] Playwright browsers installed (or pre-baked in image), e.g. `npx playwright install --with-deps chromium`.
- [ ] On Windows dev machines, `runner\scripts\clean.ps1` documented/used if `npm ci` hits EBUSY/lock issues.

### 4. CI Status

- [ ] **Backend CI** (`backend-ci.yml`) green:
  - `dotnet restore`, `dotnet build`, `dotnet test` all pass.
  - Integration job with Postgres service and `dotnet ef database update` passes.
- [ ] **Runner workflows** (`audit.yml`) green:
  - `npm ci`, `npm run lint`, `npm run build`, `npm test` all pass on Node 20.
  - `npx playwright install --with-deps` step succeeds.
- [ ] **Security audit workflow** green or triaged:
  - `dotnet list package --vulnerable --include-transitive` output reviewed.
  - `npm audit --audit-level=high` findings triaged; critical/high issues have a remediation plan.

### 5. Observability & Health

- [ ] `/health/live` and `/health/ready` wired into load balancer/ingress health checks.
- [ ] `/metrics` scraped by Prometheus (or equivalent) with dashboards/alerts configured per `OBSERVABILITY_GUIDE_EN.md`.
- [ ] Logs shipped to a central store (e.g. ELK/Loki) with correlation IDs (`TraceId`, `SpanId`) visible.
- [ ] OpenTelemetry traces visible in the chosen backend (if configured).

### 6. Smoke Validation

- [ ] On a staging-like environment, run the smoke test once per build:
  - [ ] `tools/smoke/smoke.ps1` (Windows/PowerShell) or
  - [ ] `tools/smoke/smoke.sh` (Linux/macOS).
- [ ] Smoke script succeeds (`exit code 0`), verifying:
  - User registration/login.
  - Audit creation and background processing.
  - Summary/findings/gaps APIs return consistent data.
  - `/metrics` exposes required metrics (`audit_queue_depth`, `audit_running_count`, `audit_runs_completed_total`, `audit_runs_started_total`, `audit_runs_retries_total`, `audit_ingestion_failures_total`, `audit_runner_timeouts_total`, `audit_run_duration_ms_count`, `audit_run_duration_ms_sum`).

### 7. Rollout & Rollback

- [ ] Deployment strategy chosen (rolling, blue/green, etc.) and documented.
- [ ] DB backup/snapshot mechanism verified before applying new migrations.
- [ ] Rollback plan documented (how to revert app version and, if necessary, restore DB from backup).

