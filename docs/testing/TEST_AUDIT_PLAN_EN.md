## Kamu Web Audit – Test & Audit Plan

This plan describes how the backend, database, background worker, Node/Playwright runner, ingestion, auth, and observability will be validated end-to-end. It is designed to be executable in a CI-like environment; when the current environment is missing prerequisites (e.g., .NET 8.0.400 SDK, Node 20, Docker), those are called out explicitly and the steps are still specified for later execution.

---

### 1. Scope – What Will Be Tested

- **Static / configuration checks**
  - Repository layout, `global.json`, `.nvmrc`, GitHub Actions workflows.
  - Backend `appsettings.json` (placeholders only, no secrets).
  - EF Core migrations presence and basic consistency.
  - Linting/formatting configuration:
    - Runner: `npm run lint` (ESLint + TypeScript).
    - Backend: `dotnet format` (only if available and configured).

- **Build + unit/integration tests**
  - Backend:
    - `dotnet restore`
    - `dotnet build`
    - `dotnet test backend/KamuAudit.Tests/KamuAudit.Tests.csproj`
  - Runner:
    - `cd runner && npm ci`
    - `npm run build`
    - `npm test`

- **Integration / end-to-end system tests**
  - Postgres 16 instance via Docker.
  - Backend API with configured env vars (no user‑secrets).
  - Background worker executing Node/Playwright CLI via `NodeAuditRunner`.
  - Ingestion of `summary.json` and `gaps.json`.
  - Auth (register/login, protected endpoints).
  - Metrics and health endpoints (`/metrics`, `/health/live`, `/health/ready`).

- **Security tests (practical)**
  - JWT key hardening behavior at startup.
  - Input validation for auth and audit creation DTOs.
  - Process execution safety around runner invocation.
  - On‑disk secrets and configuration hygiene.

- **Light load / stress testing**
  - Small, controlled load against:
    - `/api/auth/login`
    - `/api/Audits` (POST and GET)
  - Observation of latency, error rate, and queue/worker behavior.

- **Observability validation**
  - Health endpoints behavior.
  - Metrics presence and updating under load.
  - OpenTelemetry traces for HTTP requests, background worker, runner, and ingestion.

---

### 2. Tools and Commands

**Core tooling**

- `.NET SDK` – version pinned by `global.json` (`8.0.400`).
- `Node.js` – version pinned by `runner/.nvmrc` (`20`).
- `npm` – for runner dependency install, build, lint, and tests.
- `Docker` – to run PostgreSQL 16 in a disposable container.
- `curl` or equivalent HTTP client – for exercising API endpoints.
- `k6` (optional) – for structured load testing; simple loops/scripts are a fallback.

**Representative commands (happy path)**

- Static checks:
  - `dotnet --info`
  - `ls .github/workflows`
  - `dotnet tool list` (optional, to detect `dotnet-format`).
  - `cd runner && npm run lint`

- Backend build & tests:
  - `dotnet restore`
  - `dotnet build`
  - `dotnet test backend/KamuAudit.Tests/KamuAudit.Tests.csproj`

- Runner build & tests:
  - `cd runner`
  - `node -v`
  - `npm ci`
  - `npm run build`
  - `npm test`

- Integration / e2e:
  - Start Postgres 16:
    - `docker run --rm -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kamu_audit postgres:16`
  - Apply migrations:
    - `dotnet ef database update`
  - Run backend with env vars (sample):
    - `ConnectionStrings__Default=Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres`
    - `Jwt__Key=AtLeast64CharactersLong_UseARealSecret_InProd_ChangeMeNow!!!!`
    - `Runner__WorkingDirectory=..\..\..\..\runner`
    - `Runner__NodePath=node`
    - `Runner__CliScript=dist/cli.js`
    - `Runner__MaxRunDurationMinutes=5`
    - `RateLimiting__Enabled=false`
    - `Retention__Enabled=false`
  - HTTP flow (curl sketch):
    - Register: `POST /api/auth/register`
    - Login: `POST /api/auth/login` → capture JWT
    - Create audit: `POST /api/Audits`
    - Poll: `GET /api/Audits/{id}` until `status` terminal
    - Summary: `GET /api/Audits/{id}/summary`
    - Findings: `GET /api/Audits/{id}/findings?page=1&pageSize=20`
    - Gaps: `GET /api/Audits/{id}/gaps?page=1&pageSize=20`

- Security & validation:
  - Startup behavior with/without `Jwt__Key`.
  - Invalid payloads for register/login and create‑audit endpoints.
  - Basic repo secret scan via `rg`/`grep` for `Password=`, `Jwt:Key`, `.env`, etc.

- Load / stress (example):
  - With k6:
    - `k6 run tools/testing/k6-login-and-audits.js`
  - Without k6: small PowerShell/bash loops invoking `curl` in parallel.

---

### 3. Expected Outputs and Success Criteria

**Static checks**

- `global.json` and `.nvmrc` present and aligned with CI configuration.
- No hard‑coded secrets in `appsettings.json` or other configs (placeholders only).
- EF Core migrations exist and model snapshot is coherent.
- `npm run lint` in `runner` passes (after successful `npm ci`).
- If available, `dotnet format` completes without large numbers of issues.

**Build + unit/integration tests**

- `dotnet restore`, `dotnet build`, and `dotnet test` all **PASS** under SDK 8.0.400.
- `npm ci`, `npm run build`, and `npm test` all **PASS** under Node 20.
- No flaky tests or external network dependencies causing intermittent failures.

**Integration / e2e**

- Database migrations apply cleanly to a fresh Postgres 16 instance.
- Full auth + audit + ingestion flow succeeds:
  - Audit moves from `queued` → `running` → `completed` (or `failed` with reasonable diagnostics).
  - `summary`, `findings`, and `gaps` endpoints return consistent data.
  - DB shows corresponding `audit_runs`, `findings`, and `gaps` rows.

**Failure paths**

- Timeouts:
  - When runner exceeds `Runner__MaxRunDurationMinutes` (or `SimulateHangSeconds`), audit transitions through retries and eventually fails.
  - `AuditRun.LastError` contains a specific timeout message.
  - `audit_runner_timeouts_total` and retry metrics increment as expected.
- Missing JSON:
  - Deleting `gaps.json` does **not** wipe existing `Gaps` rows for a run.
  - Deleting `summary.json` does **not** alter existing `Findings`/`Gaps` and surfaces a clear error.
- Auth & rate limiting:
  - Requests without JWT receive `401 Unauthorized` on protected endpoints.
  - With valid JWT, same endpoints succeed.
  - When rate limiting is enabled, high‑frequency calls receive `429` with `{"error":"rate_limited","retryAfterSeconds":X}` and a `Retry-After` header.

**Security tests**

- Backend refuses to start when `Jwt__Key` is missing or shorter than 32 characters.
- Invalid DTO inputs (email, password length, URL, range constraints) yield `400 Bad Request` with model validation errors.
- No obvious secret material (passwords, tokens, real keys) in the repository.

**Load / stress**

- Under light load, p95 latency and error rate remain acceptable (no systemic failures or runaway queues).
- `audit_queue_depth` and related metrics reflect load and worker throughput realistically.

**Observability**

- `/health/live` reports healthy when the process is up; `/health/ready` reflects DB connectivity.
- `/metrics` exposes all required counters and summaries and they update during tests.
- OpenTelemetry traces are emitted for HTTP requests and background operations, with consistent trace IDs flowing into logs.

---

### 4. Known Risks, Constraints, and Flakiness Mitigations

- **Environment prerequisites**
  - Requires `.NET SDK 8.0.400` as pinned by `global.json`. If only newer SDKs (e.g., 9.0.x) are installed, `dotnet` commands will fail before tests can run.
  - Requires `Node.js 20.x` per `.nvmrc`. Running on Node 22 can cause Playwright/browser incompatibilities or subtle differences.
  - Requires `Docker` with Linux containers to run `postgres:16`. Lack of Docker support blocks true end‑to‑end DB testing.
  - Requires Playwright browsers to be installed in CI (`npx playwright install --with-deps`) for runner tests.

- **Windows‑specific issues for the runner**
  - `npm ci` can fail with `EBUSY` file‑lock errors (e.g., `unlink ...node_modules\.bin\tsc.cmd`). The `runner/WINDOWS_DEV.md` and `runner/clean-runner.ps1` script describe mitigations (closing tools, clearing cache, deleting `node_modules`, rebooting).

- **External network dependencies**
  - Using real targets like `https://example.com` in e2e tests introduces dependence on public internet and external availability. Where possible, tests should:
    - Use `FakeAuditRunner` or fixtures for deterministic behavior.
    - Reserve external calls for a very small number of smoke tests with generous timeouts.

- **Playwright/browser flakiness**
  - Browser installs and headless rendering can be flaky on constrained CI workers or misconfigured environments. Mitigations:
    - Pin compatible Playwright versions (already configured in `runner/package.json`).
    - Use retries and timeouts in tests judiciously.
    - Keep the core CI suite focused on deterministic, fixture‑based behavior; reserve heavier browser flows for a separate nightly job.

- **Metrics and tracing backends**
  - This plan assumes local `/metrics` scraping and console/OTLP export for traces. If no Prometheus or OTLP collector is configured in a given environment, metric ingestion and trace storage cannot be fully validated; instead, we verify the emitted payloads at the application boundary.

