⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Kamu Web Audit – Deployment Runbook

This document describes how to deploy the Kamu Web Audit system (backend API, background worker, and Playwright runner) to a production-like environment, including required configuration, infrastructure expectations, and common operational procedures.

---

## 1. Required environment variables & secrets

All configuration should be supplied via environment variables or platform-specific secret stores (Kubernetes `Secret`, cloud parameter store, etc.). Do **not** commit secrets.

### 1.1 Database

- **`ConnectionStrings__Default`**  
  PostgreSQL connection string used by the backend API and migrations. Example:

```bash
ConnectionStrings__Default="Host=db;Port=5432;Database=kamu_audit;Username=kamu_audit_app;Password=STRONG_PASSWORD"
```

### 1.2 JWT authentication

- **`Jwt__Key`** (required)  
  Symmetric signing key for JWT tokens.

  - **Minimum length:** 32 characters.  
  - **Recommended:** 64+ characters of high entropy (e.g. generated via password manager or `openssl rand -base64 48`).
  - If unset or too short, the app **will not start** (startup validation in `Program.cs`).

Example:

```bash
Jwt__Key="b4c3f8b6c9d3e7a1f2c4e6a8b0d2f4c6e8a0c2e4g6i8k0m2p4s6u8x0z2"
```

**Rotation notes:**

- Prefer key rotation during maintenance windows since the system currently uses a single symmetric key. Tokens issued with the old key will become invalid once the key changes.
- Recommended pattern:
  - Reduce JWT TTL (e.g. a few hours).
  - Change `Jwt__Key` and restart API instances one by one behind the load balancer.
  - Monitor login error rates during the rotation window.

### 1.3 Runner configuration

These map to `Runner` options in the backend (`AuditRunnerOptions`). They must match how/where you deploy the Node/Playwright runner.

- **`Runner__WorkingDirectory`**  
  Filesystem path (from backend process perspective) to the runner repo root.

  - Example (single VM/container with app + runner side-by-side):

```bash
Runner__WorkingDirectory="/app/runner"
```

- **`Runner__NodePath`**  
  Path or command name for Node.js binary used to run the CLI.

```bash
Runner__NodePath="node"               # if node is on PATH
Runner__NodePath="/usr/local/bin/node"
```

- **`Runner__CliScript`**  
  Relative path (inside `Runner__WorkingDirectory`) to the compiled CLI entry point.

```bash
Runner__CliScript="dist/cli.js"
```

- **`Runner__MaxRunDurationMinutes`** (optional, default 15)  
  Maximum duration per Playwright run before the backend kills the Node process and marks the run as timed out.

```bash
Runner__MaxRunDurationMinutes=15
```

> Note: There is also a dev-only `Runner__SimulateHangSeconds` for debugging timeouts; it must **not** be enabled in production.

### 1.4 Rate limiting

Application-level rate limiting settings (ASP.NET Core RateLimiter):

- **`RateLimiting__Enabled`** (default: `true`)  
- **`RateLimiting__Auth`** – requests per minute per IP for auth endpoints (`/api/auth/login`, `/api/auth/register`). Default: `10`.
- **`RateLimiting__AuditCreate`** – requests per minute per IP for `POST /api/Audits`. Default: `5`.

Example:

```bash
RateLimiting__Enabled=true
RateLimiting__Auth=20
RateLimiting__AuditCreate=10
```

### 1.5 OpenTelemetry / tracing

To export traces to an OTLP collector:

- **`OTEL_EXPORTER_OTLP_ENDPOINT`**  
  OTLP endpoint (gRPC or HTTP) of your collector, e.g.:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4317"
```

- **`OTEL_EXPORTER_OTLP_HEADERS`** (optional)  
  Additional headers for the exporter, e.g. auth:

```bash
OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer YOUR_TOKEN"
```

If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, the backend defaults to a **console exporter** for traces (useful in development).

---

### 1.6 Retention (DB + reports)

Retention is disabled by default. When enabled, a background job periodically deletes old audit runs and their reports.

- **`Retention__Enabled`** – when `true`, the cleanup job runs once a day.
- **`Retention__KeepDays`** – number of days to keep finished runs (default: `90`).

Behavior when enabled:

- Finds `AuditRun` rows where:
  - `FinishedAt` is older than `now - KeepDays`, and
  - `Status` is **not** `"running"`.
- For each such run:
  - Deletes the corresponding reports directory under `Runner__WorkingDirectory` (if present and safely under that root).
  - Deletes the `AuditRun` row (cascading to related `Findings` and `Gaps`).

Example configuration:

```bash
Retention__Enabled=true
Retention__KeepDays=90
```

> Note: Runs with `Status='running'` are never deleted by the retention job.

---

### 1.7 CORS (frontend origins)

By default, CORS is **disabled**. When you have a trusted frontend (e.g., SPA on a specific domain), you can enable CORS explicitly.

- **`Cors__Enabled`** – when `true`, the API enables a CORS policy named `FrontendCors`.
- **`Cors__AllowedOrigins`** – array of allowed origins (e.g., `https://audit-frontend.example.com`).

Behavior when enabled:

- Only the origins listed in `Cors__AllowedOrigins` are allowed.
- Allowed HTTP methods: `GET`, `POST`, `OPTIONS`.
- Allowed headers: `Content-Type`, `Authorization`.
- Credentials (cookies) are **not** allowed by default (`DisallowCredentials()`).

Example configuration (environment variables):

```bash
Cors__Enabled=true
Cors__AllowedOrigins__0="https://audit-frontend.example.com"
Cors__AllowedOrigins__1="https://audit-admin.example.com"
```

> Do **not** use wildcard (`*`) origins in production. Always list concrete HTTPS origins for your frontends.

---

## 2. Provisioning steps

### 2.1 PostgreSQL 16

1. **Install Postgres 16** (or provision a managed instance).
2. **Create role and database** (example):

```sql
CREATE ROLE kamu_audit_app WITH LOGIN PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE kamu_audit OWNER kamu_audit_app;
GRANT ALL PRIVILEGES ON DATABASE kamu_audit TO kamu_audit_app;
```

3. **Run migrations** from a machine/container with the correct `.NET 8 SDK` (8.0.400):

```bash
cd backend/KamuAudit.Api
export ConnectionStrings__Default="Host=db;Port=5432;Database=kamu_audit;Username=kamu_audit_app;Password=STRONG_PASSWORD"
dotnet ef database update
```

The CI workflow (`backend-ci.yml`) uses Postgres 16 and runs migrations; keep production closely aligned (version and extensions).

### 2.2 Node.js 20

Install Node.js **20.x LTS** on the host(s) where the runner will be built/executed.

Examples:

- Using NodeSource on Debian/Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # should show v20.x
```

- Using `nvm`:

```bash
nvm install 20
nvm alias default 20
node -v  # v20.x.x
```

On Windows developer machines, if you encounter `EBUSY` or lock errors during `npm ci`, you can use the helper script:

```powershell
cd runner
.\scripts\clean.ps1
```

This script best-effort stops local `node` processes, removes `node_modules`, `dist`, and `.playwright`, verifies the npm cache, and then runs `npm ci` again.

### 2.3 Playwright browsers

From the `runner/` directory (with Node 20 active):

```bash
cd runner
npm ci
npx playwright install --with-deps chromium
```

For CI/containers, you can pre-bake the browser installation into the image to avoid runtime downloads.

### 2.4 Disk sizing & retention

- **Runner reports**: `runner/reports/runs/` stores JSON and artifacts (trace, screenshots) for each run.
  - Estimate: per run, tens to hundreds of KB in JSON, plus optional trace/screenshots (MBs).
  - Plan disk such that you can store at least 30–90 days of reports, or enforce a retention policy.
- **Logs**:
  - Backend logs (Serilog JSON) should be shipped to a centralized log store (ELK, Loki, etc.) rather than being kept indefinitely on disk.
  - Configure log rotation on host if writing to files.

Recommended starting point (single node):

- 20–50 GB for `runner/reports/` depending on expected volume.
- 10–20 GB for logs if not immediately shipped/rotated.

---

## 3. Reverse proxy & TLS expectations

The API is designed to run behind a reverse proxy or ingress controller that terminates TLS.

### 3.1 Example Nginx configuration (conceptual)

```nginx
server {
    listen 80;
    server_name audit.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name audit.example.com;

    ssl_certificate     /etc/ssl/certs/audit.crt;
    ssl_certificate_key /etc/ssl/private/audit.key;

    location / {
        proxy_pass         http://backend-api:5000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

In Kubernetes, a similar configuration would live in an Ingress resource (or service mesh gateway), with TLS handled by cert-manager or the cloud provider.

### 3.2 Forwarded headers & client IP

The rate limiting policies are per-IP, using `HttpContext.Connection.RemoteIpAddress` by default. Behind a reverse proxy:

- Ensure the reverse proxy sets `X-Forwarded-For` / `X-Real-IP` correctly.
- Optionally configure ASP.NET Core `ForwardedHeadersOptions` to trust your proxy and use the forwarded IP as the effective remote IP (not yet wired in code; do this carefully to avoid spoofing from untrusted networks).

Network-level protections (WAF, API gateway rate limits) should complement the application-level rate limiting for defense in depth.

---

## 4. Troubleshooting guide

### 4.1 Queue stuck (no audits progressing)

**Symptoms:**

- `/metrics` shows growing `audit_queue_depth`.
- Many `AuditRun` rows with `Status='queued'` and no recent `StartedAt`/`FinishedAt`.

**Checks:**

- Confirm the backend process (which hosts the background worker) is running and healthy (`/health/live`, `/health/ready`).
- Inspect logs for `"AuditRunnerBackgroundService started"` and `"Audit runner loop error"` entries.
- Check DB connectivity errors in logs.

**Actions:**

- If DB is unavailable, restore DB service and confirm `/health/ready` turns healthy; the worker should resume automatically.
- If worker crashed (no logs, process not running), restart the backend deployment.

### 4.2 Runner failures (Node errors, missing Node/Playwright)

**Symptoms:**

- `AuditRun.Status` remains `failed` after retries; `LastError` shows process exit or timeout messages.

**Checks:**

- Inspect `AuditRun.LastError` via API or DB.
- Look for logs from `NodeAuditRunner` indicating `workingDirectory not found`, `NodePath` not executable, or Playwright/browser issues.

**Actions:**

- Ensure `Runner__WorkingDirectory` is correct and accessible from backend pods/VMs.
- Ensure Node 20 is installed and `Runner__NodePath` points to a valid binary.
- Re-run in `runner/`:

```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

### 4.3 Timeouts

**Symptoms:**

- `LastError` contains `"Runner timeout after X minutes."`.
- Logs show `"Runner timeout after {Minutes} minutes for audit run {AuditRunId}."`.

**Actions:**

- Check if target sites are particularly slow or have long-running flows.
- Increase `Runner__MaxRunDurationMinutes` cautiously if audits legitimately require more time.
- If timeouts are due to runner hangs or Playwright bugs, inspect `runner/reports/runs/<run_id>/artifacts/trace.zip` and `console.json` for clues; consider improving runner logic rather than just increasing timeout.

### 4.4 Database down

**Symptoms:**

- `/health/ready` reports unhealthy.
- API returns 5xx for most endpoints.
- Worker logs show DB connectivity exceptions.

**Actions:**

- Restore DB service and connectivity.
- Verify migrations are still valid (`dotnet ef database update` if needed).
- Once DB is back, the backend/worker should resume; queued jobs will be retried.

### 4.5 Missing JSON reports

**Symptoms:**

- Logs from ingestor:
  - `"summary.json not found for audit run {AuditRunId}..."`  
  - or `"gaps.json not found for audit run {AuditRunId}..."`.
- `LastError` may contain `"Ingestion skipped: summary.json not found in ..."`.

**Behavior:**

- When `summary.json` is missing, **no DB data is deleted**; ingestion is skipped.
- When `summary.json` exists but `gaps.json` is missing, findings and metrics are updated but existing gaps are preserved.

**Actions:**

- Verify that the runner successfully wrote reports into the expected `RunDir` (`runner/reports/runs/<run_id>/`).
- If files were accidentally deleted from disk, re-run the audit if possible; otherwise, existing DB data remains as last ingested.

### 4.6 Cleaning reports/ and pruning DB

**Reports directory cleanup:**

- To free disk space, you can safely delete old run directories under `runner/reports/runs/`. This does **not** delete DB rows (findings/gaps), but trace artifacts and raw JSON will be gone.
- Consider implementing a periodic job (cron, systemd timer, K8s CronJob) that deletes directories older than N days:

```bash
find /app/runner/reports/runs -maxdepth 1 -mindepth 1 -type d -mtime +30 -exec rm -rf {} \;
```

**Database pruning:**

- For long-term retention, decide a policy (e.g., delete `AuditRun` and related data older than 180 days).
- Example (PostgreSQL):

```sql
DELETE FROM audit_runs
WHERE "FinishedAt" < now() - interval '180 days';
```

Because `findings` and `gaps` have ON CASCADE DELETE, their rows will be removed automatically.

---

## 5. Rollback and migrations

### 5.1 Applying migrations safely

Recommended pattern (blue/green or rolling deployment):

1. Build and test using the same `.NET 8 SDK` as in `global.json` (8.0.400) in CI.
2. In a maintenance window (or controlled rollout):
   - Apply migrations once:

```bash
cd backend/KamuAudit.Api
export ConnectionStrings__Default="Host=db;Port=5432;Database=kamu_audit;Username=kamu_audit_app;Password=STRONG_PASSWORD"
dotnet ef database update --no-build -c Release
```

3. Deploy updated application binaries/containers gradually (e.g., one pod at a time) to avoid full downtime.

### 5.2 Rolling back application version

The schema migrations are designed to be **forward-only**. Rolling back the application should be done carefully:

- **Preferred:** support backward compatibility where possible (older app version is still compatible with newer schema).
- If that’s not feasible:
  - Keep backups of the DB prior to migration (e.g., nightly snapshots).
  - In case of severe issues, restore from backup and redeploy the previous app version that matches that schema.

Operational rollback steps:

1. Scale down or stop the new app version.
2. Restore DB snapshot (if necessary).
3. Deploy the previous app/container version (matching schema).
4. Validate `/health/ready` and run smoke tests.

> Avoid running schema downgrades in production unless you have thoroughly tested them; restoring from backups is usually safer.

---

## 6. Summary

For a production deployment you need:

- A Postgres 16 instance initialized with `dotnet ef database update`.
- A backend deployment configured via env vars (connection string, JWT key, runner options, rate limiting, OTel).
- Node 20 and Playwright browsers installed in/for the runner environment.
- A reverse proxy or ingress terminating TLS and forwarding client IP correctly.
- Log aggregation and, optionally, an OTLP collector for traces.
- Routine housekeeping for `runner/reports/` and database size.

With these pieces in place, you can operate the Kamu Web Audit system with predictable behavior and clear troubleshooting paths.

---

## 7. Deployment checklist and smoke tests

Before promoting a build to staging or production, review `DEPLOYMENT_CHECKLIST_EN.md` for a concise, step-by-step list of environment, secrets, CI, and observability requirements.

For end-to-end validation of the full path (API → DB → background worker → runner → ingestion → API + metrics), you can run the smoke scripts:

- On Windows/PowerShell:

```powershell
pwsh ./tools/smoke/smoke.ps1
```

- On Linux/macOS:

```bash
chmod +x ./tools/smoke/smoke.sh
./tools/smoke/smoke.sh
```

These scripts start a disposable Postgres 16 instance (via Docker), apply migrations, run the backend, create and process a real audit, and verify key metrics before returning `exit code 0`.

## 8. Metrics reference (API)

The `/metrics` endpoint exposes a small set of Prometheus-compatible metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `audit_queue_depth` | gauge | Number of audit runs currently in `queued` status. |
| `audit_running_count` | gauge | Number of audit runs currently in `running` status. |
| `audit_runs_completed_total{status="completed"}` | counter | Total number of runs that finished with `Status='completed'`. |
| `audit_runs_completed_total{status="failed"}` | counter | Total number of runs that finished with `Status='failed'`. |
| `audit_runs_started_total` | counter | Total number of audit run **attempts** started by the background worker. |
| `audit_runs_retries_total` | counter | Total number of audit run retries where a failed attempt was re-queued. |
| `audit_ingestion_failures_total` | counter | Total number of ingestion attempts that could not read reports (missing `RunDir` / `summary.json` / run not found). |
| `audit_runner_timeouts_total` | counter | Total number of times the runner process timed out and was killed. |
| `audit_run_duration_ms_count` | summary (count) | Number of completed runs for which a duration was recorded (from `summary.json`). |
| `audit_run_duration_ms_sum` | summary (sum) | Sum of durations in milliseconds for those completed runs. |

Example scrape:

```bash
curl -s http://localhost:5000/metrics
```

You should see the above metric names and values, which can be scraped by Prometheus or inspected manually during troubleshooting.

