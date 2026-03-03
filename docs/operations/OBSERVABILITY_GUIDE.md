⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Gözlemlenebilirlik Rehberi – Özet (TR)

> Ayrıntılı İngilizce sürüm: `OBSERVABILITY_GUIDE_EN.md`.

Bu rehber, Kamu Web Audit sisteminin nasıl izleneceğini açıklar:

- `/metrics` uç noktasından alınan Prometheus metrikleri,
- OpenTelemetry izleri,
- Önerilen dashboard panelleri ve alarmlar.

### 1. Metrikler

Başlıca metrikler:

- `audit_queue_depth` – `queued` durumundaki audit run sayısı.
+- `audit_running_count` – `running` durumundaki run sayısı.
+- `audit_runs_completed_total{status="completed"|"failed"}` – tamamlanan/başarısız run toplamları.
+- `audit_runs_started_total` – başlatılan deneme sayısı.
+- `audit_runs_retries_total` – yeniden kuyruğa alınan deneme sayısı.
+- `audit_ingestion_failures_total` – ingest sırasında hata oluşan run sayısı.
+- `audit_runner_timeouts_total` – zaman aşımına uğrayıp öldürülen runner çalışmaları.
+- `audit_run_duration_ms_count` / `audit_run_duration_ms_sum` – çalıştırma sürelerinin özeti.

Bu metrikler; kuyruk derinliği, başarısızlık oranı, zaman aşımı oranı ve ortalama run süresini izlemenize olanak tanır.

### 2. Dashboard Önerileri

Grafana gibi araçlarda aşağıdaki paneller önerilir:

- Kuyruk derinliği (line/gauge) – `audit_queue_depth`
- Çalışan run sayısı – `audit_running_count`
- Tamamlanan vs. başarısız run oranı – `rate(audit_runs_completed_total{status="..."})`
- Başarısızlık yüzdesi – completed+failed oranına göre hesaplanan yüzde.
- Runner timeouts – `rate(audit_runner_timeouts_total[5m])`
- Ingestion hataları – `rate(audit_ingestion_failures_total[5m])`
- Ortalama run süresi – `audit_run_duration_ms_sum / audit_run_duration_ms_count`

### 3. Alarm Örnekleri

- **Kuyruk derinliği yüksek**:  
  `audit_queue_depth > N` değeri 10+ dakika boyunca devam ederse uyarı.
- **Başarısızlık oranı yükseldi**:  
  Failed/completed oranı belirli bir eşiğin (örn. %20) üzerine çıkarsa uyarı.
- **Runner timeouts artıyor**:  
  `rate(audit_runner_timeouts_total[15m]) > 0` ise sistematik sorun olabileceği anlamına gelir.
- **Ingestion hataları**:  
  `audit_ingestion_failures_total` oranı sıfırdan büyükse rapor dosyaları veya ingest katmanı incelenmelidir.

### 4. `/metrics` Scrape

Prometheus için basit bir scrape konfigürasyonu örneği:

```yaml
scrape_configs:
  - job_name: "kamu-audit-api"
    metrics_path: "/metrics"
    scrape_interval: 15s
    static_configs:
      - targets: ["kamu-audit-api:5000"]
```

### 5. OpenTelemetry İzleri

Backend, aşağıdaki bileşenler için span üretir:

- HTTP istekleri (ASP.NET Core instrumentation),
- HTTP client çağrıları,
- EF Core sorguları,
- `AuditRun.Execute` (background worker),
- `Runner.StartProcess` ve ingestion adımları.

OTLP kolektöre göndermek için:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`

değişkenlerini ayarlamanız yeterlidir. Kolektör tarafında gelen izleri log’a veya trace backend’ine (Jaeger, Tempo vb.) yönlendirebilirsiniz.

Detaylı PromQL örnekleri, kolektör konfigürasyonu ve dashboard tarifleri için İngilizce dokümana bakınız: `OBSERVABILITY_GUIDE_EN.md`.

