# Kamu Web Audit – Ürün Seviyesi Observability Tasarımı

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit için **ürün seviyesi gözlemlenebilirlik (observability)** modelini tanımlar.
Amaç; hem backend (.NET API) hem de runner (Node + Playwright) tarafında **loglar, trace’ler ve metrikler** için tutarlı bir şema sağlamaktır.

---

## 1. Structured Logging

### 1.1. Ortak alanlar

Tüm servislerde JSON structured logging kullanılması hedeflenir; her log eventi için:

- `ts` – ISO8601 timestamp
- `level` – `INFO`, `WARN`, `ERROR` vb.
- `service` – `api` veya `runner`
- `runId` – Runner çalıştırmasının ID’si (summary.json içindeki `run.runId`)
- `auditRunId` / `scanId` – Backend tarafında `AuditRun.Id`
- `targetUrl` – Taranan temel URL
- `url` – Spesifik HTTP isteği veya sayfa URL’si (varsa)
- `ruleId` – Rule engine tarafında üretilen bulgular için (örn. `KWA-HTTP-001`)
- `attempt` – Retry denemesi (background worker için)

### 1.2. Backend (.NET)

- Serilog JSON sink’i ile:
  - `AuditRunnerBackgroundService`:
    - `AuditRunId`, `TargetUrl`, `AttemptCount` alanları zaten log’larda yer alır.
    - Örnek event:
      ```json
      {
        "ts": "2026-03-05T10:00:00Z",
        "level": "Information",
        "service": "api",
        "message": "Starting audit run {AuditRunId} for {TargetUrl} (attempt {Attempt})",
        "AuditRunId": "b3f3...",
        "TargetUrl": "https://portal.gov.tr",
        "Attempt": 1
      }
      ```
- Ingestion (`AuditResultIngestor`):
  - Her ingest başlangıcında: `auditRunId`, `runDir`, `findingCount`, `gapCount`.
  - Hata durumunda: `ErrorType = IngestionError`, mesaj + stack trace.

### 1.3. Runner (Node + Playwright)

- `runner/src/core/log.ts` (minimal helper):
  - `logEvent(event, payload)` → `console.log(JSON.stringify({ ts, event, ...payload }))`
- `cli.ts`’de önerilen eventler:
  - `run_started` – `runId`, `targetUrl`, `browser`, `headless`, `safeMode`, `maxLinks`.
  - `run_completed` – `runId`, `targetUrl`, `status`, `metrics` (duration, linkSampled, skippedNetwork, findingsBySeverity).
  - İleri aşamada: `crawl_page_started`, `crawl_page_completed`, `rule_evaluation_completed` vb. event’ler eklenebilir.

---

## 2. Tracing Modeli

### 2.1. Backend

- .NET tarafında OpenTelemetry ile:
  - Root span: HTTP isteği (`/api/Audits`, `/api/Audits/{id}/summary`).
  - İç span:
    - `AuditRunnerBackgroundService.Execute` – kuyruğa alınan run’lar için.
    - `AuditResultIngestor.Ingest` – JSON ingest pipeline’ı.
  - Span tag’leri:
    - `auditRun.id`
    - `auditRun.targetUrl`
    - `auditRun.status.initial` / `auditRun.status.final`

### 2.2. Runner

- Playwright tracing (`context.tracing.start`) zaten devreye alındı:
  - `trace.zip` artefaktı, HTTP + DOM snapshot’larını içerir.
- Ürün seviyesi trace modeli:
  - Root: `audit.run` (runId, targetUrl).
  - Çocuk span’ler:
    - `crawl.homepage` – ilk `page.goto`.
    - `crawl.link_sampling` – `sampleLinks`.
    - `analysis.rule_engine` – `runRuleEngine`.
    - `report.write` – `writeRunReports`.
- İlk iterasyonda bu span’ler JSON log event’leri ile temsil edilir (OpenTelemetry entegrasyonu daha sonra yapılabilir).

---

## 3. Metrikler

### 3.1. Runner summary.json → Metrics

`summary.json` içindeki `metrics` bölümünde aşağıdaki alanlar hedeflenir:

- **Performans**
  - `durationMs` – toplam çalışma süresi.
  - `pagesScanned` – taranan sayfa sayısı (crawler entegre olduktan sonra).
- **HTTP & Network**
  - `requestsTotal` – toplam HTTP isteği sayısı.
  - `response4xx5xx` – 4xx/5xx yanıt sayısı.
  - `requestFailed` – Playwright `requestfailed` event’leri sayısı.
  - `skippedNetwork` – NETWORK_POLICY (timeout/429/blocked) nedeniyle atlanan istek sayısı.
  - `retriedRequests` – en az 1 retry yapılan istek sayısı.
  - `realFailures` – retry sonrası hala başarısız olan istek sayısı.
- **Coverage**
  - `linkSampled` – örneklenen link sayısı.
  - `linkBroken` – kırık link sayısı.
- **Findings**
  - `findingsBySeverity` – `{"critical": n, "error": n, "warn": n, "info": n}`.

Bu değerler runner içinde hesaplanır, `summary.json`’a yazılır ve backend ingest (`AuditResultIngestor`) tarafından okunarak hem DB alanlarına hem de Prometheus /metrics çıktısına yansıtılır.

### 3.2. Backend Prometheus Metrikleri (Gerçekleştirilmiş)

Backend’in `/metrics` endpoint’i şu metrikleri üretir:

- **Kuyruk ve durum metrikleri**
  - `audit_queue_depth` – queued run sayısı (gauge).
  - `audit_running_count` – şu an çalışan run sayısı (gauge).
  - `audit_runs_total{status="completed|failed"}` – tamamlanan run sayıları (counter).
- **API metrikleri**
  - `api_request_duration_seconds_count` / `_sum` – tüm HTTP istekleri için süre özeti (summary).
- **Ingestion metrikleri**
  - `ingestion_duration_seconds_count` / `_sum` – ingest süresi (summary).
  - `audit_ingestion_failures_total` – ingest hataları (counter).
- **Idempotency metrikleri**
  - `idempotency_conflicts_total` – Idempotency-Key çakışması sayısı (counter).
- **Runner metrikleri (Prometheus’a yansıtılmış)**
  - `runner_audit_duration_ms_count` / `_sum` – runner çalışma süresi (summary).
  - `runner_pages_scanned_total` – taranan sayfa toplamı (counter).
  - `runner_requests_total` – gözlenen HTTP istekleri (counter).
  - `runner_requests_failed_total` – başarısız HTTP istekleri (counter).
  - `runner_skipped_network_total{reason="NETWORK_POLICY"}` – network policy nedeniyle atlanan istekler (counter).
  - `runner_findings_total{severity="critical|error|warn|info|..."}` – runner bulguları (counter).

Bu metrikler tek bir `/metrics` text endpoint’i üzerinden Prometheus tarafından scrape edilebilir durumdadır.

### 3.3. Örnek Dashboard Panelleri

Önerilen minimum 3 panel:

1. **Audit Akışı & Kuyruk Paneli**
   - Grafikler:
     - `audit_queue_depth` (gauge, zaman serisi),
     - `audit_running_count`,
     - `audit_runs_total{status}` (stacked area).
   - Amaç: Backlog, concurrency ve throughput’u izlemek.
2. **API Sağlık & Gecikme Paneli**
   - Grafikler:
     - `api_request_duration_seconds` (p95/p99 latency),
     - HTTP 4xx/5xx oranı (log’lardan veya mevcut metriklerden türetilmiş).
   - Amaç: API performansı ve hata oranlarını görmek.
3. **Runner Kalitesi & Coverage Paneli**
   - Grafikler:
     - `runner_pages_scanned_total` (rate),
     - `runner_requests_total` vs `runner_requests_failed_total`,
     - `runner_skipped_network_total{reason="NETWORK_POLICY"}`,
     - `runner_findings_total{severity}` (stacked bar).
   - Amaç: gerçek tarama derinliği, network sorunları ve bulgu dağılımını görmek.

---

## 4. Sağlık Uçları (Health / Readiness)

API zaten aşağıdaki uçlara sahip olmalıdır (veya basitçe eklenebilir):

- `GET /health/live`
  - Process ayağa kalkmış mı? (her zaman hızlı cevap).
- `GET /health/ready`
  - DB bağlantısı, dış bağımlılıklar, critical konfigler hazır mı?
- `GET /metrics`
  - Prometheus uyumlu text format (Serilog/OpenTelemetry + PrometheusExporter ile).

Öneriler:

- `/health/ready` içinde:
  - DB connection test,
  - En az bir migration’ın uygulanmış olduğu kontrolü,
  - Runner working directory’nin mevcut olması.

---

## 5. Örnek Akış – Uçtan Uca Observability

1. Kullanıcı `POST /api/Audits` ile yeni run başlatır.
2. `AuditRunnerBackgroundService`:
   - Log: `event = "audit_run_start"`, `auditRunId`, `targetUrl`, `attempt`.
   - Trace: span `AuditRun.Execute`.
3. Runner:
   - Log: `run_started` (runId, targetUrl, config).
   - Trace/zap: Playwright `trace.zip` + summary metrics.
4. `run.complete.json` + `summary.json` yazılır.
5. Backend ingest:
   - Log: `ingestion_start` + `ingestion_completed`.
   - Metric: `kamu_audit_runs_total{status="completed"}` artar.
6. Rapor istenir (`GET /api/Audits/{id}/summary` veya `/report`):
   - API logları + trace’ler, hangi run’ın okunduğunu gösterir.

Bu modelle:

- Ürün ekipleri, tek bir run veya tüm sistem için:
  - Ne çalıştı / nerede takıldı,
  - Ne kadar sürede,
  - Kaç bulgu ve hangi şiddette,
  - Ne kadar network policy kaynaklı SKIPPED gördüğünü
  rahatça görebilir.

