⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Observability Guide — Kamu Web Audit

This guide describes how to monitor the Kamu Web Audit system using the `/metrics` endpoint and OpenTelemetry traces, and suggests a starter set of dashboards and alerts.

---

## 1. Metrics and dashboards

The backend exposes Prometheus-style metrics at `/metrics`. See `RUNBOOK_DEPLOYMENT_EN.md` for full metric definitions; key series are summarized here.

### 1.1 Core metrics

From `/metrics`:

- `audit_queue_depth` (gauge) — number of runs in `queued` status.
- `audit_running_count` (gauge) — number of runs in `running` status.
- `audit_runs_completed_total{status="completed"}` (counter).
- `audit_runs_completed_total{status="failed"}` (counter).
- `audit_runs_started_total` (counter).
- `audit_runs_retries_total` (counter).
- `audit_ingestion_failures_total` (counter).
- `audit_runner_timeouts_total` (counter).
- `audit_run_duration_ms_count` / `audit_run_duration_ms_sum` (summary-like).

You can combine these with Prometheus functions to build SLOs and error rates.

### 1.2 Suggested dashboard panels

Below are example PromQL snippets for a Grafana dashboard. Adjust job/instance labels to match your environment.

#### Panel: Queue depth over time

- **Title:** Audit queue depth
- **Query:**

```promql
audit_queue_depth
```

- **Type:** Line / gauge.
- **Goal:** Should usually be near 0; sustained growth indicates worker slowness/backlog.

#### Panel: Running audits

- **Title:** Running audits
- **Query:**

```promql
audit_running_count
```

- **Type:** Line.
- **Goal:** Track concurrency and detect stuck runs (running count high with no completions).

#### Panel: Run outcomes (completed vs failed)

- **Title:** Audit runs completed/failed (rate)
- **Queries:**

```promql
rate(audit_runs_completed_total{status="completed"}[5m])
```
```promql
rate(audit_runs_completed_total{status="failed"}[5m])
```

- **Type:** Stacked/overlaid line.
- **Goal:** Watch for spikes in failures relative to completions.

#### Panel: Failure rate

- **Title:** Audit failure rate (%)
- **Query:**

```promql
100 * rate(audit_runs_completed_total{status="failed"}[5m])
  / ignoring(status)
    (rate(audit_runs_completed_total{status="failed"}[5m])
   + rate(audit_runs_completed_total{status="completed"}[5m]) + 1e-9)
```

- **Type:** SingleStat / line.
- **Goal:** Keep failure rate within expected bounds (e.g., < 5–10% in steady state).

#### Panel: Runner timeouts

- **Title:** Runner timeouts (rate)
- **Query:**

```promql
rate(audit_runner_timeouts_total[5m])
```

- **Type:** Line.
- **Goal:** Should normally be zero; helpful to catch systemic slowness or hangs in Playwright runner.

#### Panel: Ingestion failures

- **Title:** Ingestion failures (rate)
- **Query:**

```promql
rate(audit_ingestion_failures_total[5m])
```

- **Type:** Line.
- **Goal:** Detect missing/invalid JSON or missing `RunDir` from the runner.

#### Panel: Average run duration

- **Title:** Average audit run duration (ms)
- **Query:**

```promql
audit_run_duration_ms_sum / clamp_min(audit_run_duration_ms_count, 1)
```

- **Type:** SingleStat / line.
- **Goal:** Track how long audits take; sudden increases may indicate target slowness or runner issues.

---

## 2. Suggested alerts

These example PromQL alerts assume your metrics are scraped into Prometheus.

### 2.1 Queue depth high for N minutes

**Alert:** `AuditQueueDepthHigh`

```promql
audit_queue_depth > 20
```

- **For:** `10m`
- **Description:** More than 20 queued runs for at least 10 minutes.
- **Rationale:** Indicates worker cannot keep up (under-provisioning, DB slowdown, or runner issues).

### 2.2 Failure rate spike

**Alert:** `AuditFailureRateHigh`

```promql
100 * rate(audit_runs_completed_total{status="failed"}[10m])
  / clamp_min(
      rate(audit_runs_completed_total{status="failed"}[10m])
    + rate(audit_runs_completed_total{status="completed"}[10m]),
      1e-3
    ) > 20
```

- **For:** `15m`
- **Description:** More than 20% of audit runs are failing over a 10-minute window.
- **Rationale:** Highlights widespread issues with targets, runner, or backend.

### 2.3 Runner timeouts increasing

**Alert:** `AuditRunnerTimeouts`

```promql
rate(audit_runner_timeouts_total[15m]) > 0.1
```

- **For:** `15m`
- **Description:** At least 0.1 timeouts/minute over the last 15 minutes.
- **Rationale:** The runner is consistently hitting `MaxRunDurationMinutes` and being killed.

### 2.4 Ingestion failures

**Alert:** `AuditIngestionFailures`

```promql
rate(audit_ingestion_failures_total[15m]) > 0
```

- **For:** `15m`
- **Description:** Ingestion failures (missing `summary.json` / `RunDir`) are occurring.
- **Rationale:** Indicates backend may be misconfigured or reports are being cleaned up prematurely.

### 2.5 DB readiness failing

If you wire health checks into Prometheus (via `kube-state-metrics` or a separate exporter), create an alert on the readiness endpoint:

- **Alert:** `BackendReadyCheckFailing`  
- **Signal:** HTTP probe to `/health/ready` failing across multiple instances (e.g., `> 0` failures over `5m`).  
- **Rationale:** Indicates DB connectivity or schema issues.

In Kubernetes, you can also base alerts on pod readiness probes failing for the backend deployment.

---

## 3. Scraping /metrics

### 3.1 Prometheus scrape config

Assuming the backend is exposed as `kamu-audit-api` service on port 5000:

```yaml
scrape_configs:
  - job_name: "kamu-audit-api"
    metrics_path: "/metrics"
    scrape_interval: 15s
    static_configs:
      - targets: ["kamu-audit-api:5000"]
```

If using Kubernetes, replace `static_configs` with a service/pod-based discovery (e.g. `kubernetes_sd_configs`) and appropriate relabeling.

### 3.2 Local manual check

From a terminal on the same network:

```bash
curl -s http://localhost:5000/metrics
```

You should see the metrics text described above.

---

## 4. OpenTelemetry traces

The backend uses OpenTelemetry tracing with:

- ASP.NET Core instrumentation (incoming HTTP)
- HttpClient instrumentation (outgoing HTTP)
- Entity Framework Core instrumentation (DB)
- Custom spans for:
  - `AuditRun.Execute` (background worker)
  - `Runner.StartProcess` (Node runner)
  - `Ingestion.ParseJson` and `Ingestion.PersistDb`

### 4.1 Configuring OTLP export

Set the following environment variables for the backend:

- `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP collector endpoint (gRPC or HTTP), e.g.:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4317"
```

- `OTEL_EXPORTER_OTLP_HEADERS` — optional headers (e.g., auth):

```bash
OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer YOUR_TOKEN"
```

If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, the backend falls back to a **console exporter** for traces (useful in development).

### 4.2 Example collector config

A minimal OpenTelemetry Collector configuration that receives traces and logs them:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

exporters:
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [logging]
```

Run via Docker:

```bash
docker run --rm -it -p 4317:4317 -p 4318:4318 \
  -v "$PWD/otel-collector-config.yaml:/etc/otel-collector-config.yaml" \
  otel/opentelemetry-collector:latest \
  --config /etc/otel-collector-config.yaml
```

With this in place and `OTEL_EXPORTER_OTLP_ENDPOINT` pointing to the collector, you can visualize traces in tools like Jaeger, Tempo, or any backend that supports OTLP.

---

## 5. Putting it together

For a production-ready observability stack:

1. **Scrape `/metrics`** into Prometheus (or compatible TSDB) using the example scrape config.
2. **Export traces** via OTLP to your collector and trace backend (Jaeger/Tempo/etc.).
3. **Create dashboards** with panels described in section 1 to visualize queue depth, failure rates, timeouts, and durations.
4. **Configure alerts** from section 2 for queue growth, failure rate spikes, runner timeouts, ingestion failures, and DB readiness.

This combination gives SREs enough signal to detect and debug most production issues in the Kamu Web Audit system.

