⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## 1. Proje Genel Bakış

Kamu Web Audit, kamu kurumlarının web sitelerini **tarayıcı tabanlı otomatik denetimlerle** analiz eden bir sistemdir. Amaç; güvenlik, teknik sağlık, erişilebilirlik ve UI davranışları hakkında **kanıta dayalı** bulgular üretmek ve bu bulguları API üzerinden, veritabanı destekli bir modelle sunmaktır.

Yüksek seviyede sistem şu bileşenlerden oluşur:

- **Web/API katmanı (ASP.NET Core Web API, .NET 8)**  
  Kullanıcı kayıt/giriş, audit oluşturma, audit sonuçlarını listeleme/filtreleme, health ve metrics uçlarını barındırır.
- **Application katmanı**  
  İş kurallarını (audit oluşturma, listeleme, özet hesaplama, sayfalama) domain ve altyapıdan soyutlanmış servisler üzerinden uygular.
- **Infrastructure & Persistence katmanı**  
  EF Core tabanlı PostgreSQL erişimi, arka plan işleri (`BackgroundService`), Node/Playwright runner entegrasyonu, ingest (JSON → DB) ve izleme (metrics, tracing) sağlar.
- **Runner (Node.js 20 + Playwright)**  
  Hedef URL üzerinde gerçek tarayıcı oturumu açar, sayfayı gezer, konsol/ağ hatalarını ve UI etkileşimlerini toplar; `summary.json`, `ui-inventory.json`, `gaps.json` gibi JSON çıktıları üretir.

Sistem; **audit → kuyruk → worker → runner → ingest → API** zincirinin tamamını tek uçtan otomatikleştirir.

---

## 2. Mimari Katmanlar

### 2.1 Web / API Katmanı

Konum: `backend/KamuAudit.Api`

- **`Program.cs` + `StartupExtensions`**  
  - Serilog, OpenTelemetry, health checks, metrics ve CORS konfigürasyonunu yapar.
  - JWT auth ve yetkilendirme politikalarını (`AuditUsers`) kaydeder.
  - Rate limiting politikalarını (`AuthPolicy`, `AuditCreatePolicy`) devreye alır.
- **`Controllers/AuthController.cs`**
  - `POST /api/auth/register` – yeni kullanıcı oluşturma.
  - `POST /api/auth/login` – JWT üretme.
  - `JwtSettings` ile tip güvenli JWT yapılandırması kullanır.
- **`Controllers/AuditsController.cs`**
  - `POST /api/Audits` – yeni audit oluşturma (auth gerekli).
  - `GET /api/Audits` – filtrelenebilir audit listesi.
  - `GET /api/Audits/{id}` – detay.
  - `GET /api/Audits/{id}/findings`, `/gaps`, `/summary` – sonuç ve özet uçları.
  - Tüm iş kurallarını `IAuditRunService`’e delegasyonla yürütür.

### 2.2 Application Katmanı

Konum: `backend/KamuAudit.Api/Application`

- **`IAuditRunService`** – Audit ile ilgili use-case sınırı:
  - `CreateAsync`, `GetListAsync`, `GetByIdAsync`, `GetFindingsAsync`, `GetGapsAsync`, `GetSummaryAsync`.
- **`AuditRunService`**:
  - `AuditRuns` üzerinde filtreleme (`systemId`, `status`, tarih aralığı) yapar.
  - `Findings` ve `Gaps` üzerinden `GroupBy` + `Select` ile özet metrikler (severity / risk dağılımı) üretir.
  - DTO dönüşümlerini gerçekleştirir (summary, detail, counts).

Bu katman, controller’ların doğrudan EF Core / runner ile konuşmasını engelleyerek **test edilebilirlik** ve **bağımlılık yönü** açısından temiz bir yapı sağlar.

### 2.3 Infrastructure Katmanı

#### 2.3.1 Runner Entegrasyonu

Konum: `backend/KamuAudit.Api/Infrastructure/Runner`

- **`AuditRunnerOptions`** – konfigürasyon (WorkingDirectory, NodePath, CliScript, MaxRunDurationMinutes, MaxConcurrentRuns, MaxAttempts vb.).
- **`NodeAuditRunner` (IAuditRunner)**:
  - `ProcessStartInfo` ile `node <CliScript> --url ... --out ...` komutunu oluşturur.
  - Argümanlar güvenli şekilde escape edilir; `TargetUrl`, `MaxLinks`, `MaxUiAttempts`, `SafeMode`, `Strict`, `Plugins` ve `Out` parametrelerini CLI’a iletir.
  - `WaitForExitAsync` + `Task.Delay` ile **zaman aşımı** uygular (`Runner:MaxRunDurationMinutes`).
  - Zaman aşımında süreçleri öldürür, `LastError` doldurur ve `AuditMetrics.IncrementRunnerTimeouts()` çağırır.
  - Çıkış kodu 0 ve 2 (strict eşiği) başarı sayılır; diğer kodlar hatadır.

- **`AuditRunnerBackgroundService` (BackgroundService)**:
  - Döngüsel olarak kuyruktan iş çeker:
    - `TryReserveOneAsync` içinde `SELECT ... FOR UPDATE SKIP LOCKED` kullanarak tek bir `AuditRun` kaydını `queued` → `running` durumuna geçirir (çoklu worker güvenli).
  - Worker iş akışı:
    1. Audit’i `running` yapar, `StartedAt` ve `RunDir` atar.
    2. `IAuditRunner.RunAsync` ile Node/Playwright sürecini çağırır.
    3. Süreç sonucu başarılıysa `Status=completed`, değilse retry/backoff uygular:
       - `AttemptCount` artar.
       - `LastError` güncellenir.
       - `RetryAfterUtc` ile üstel bekleme süresi (`2^attempt` saniye) ayarlanır.
       - `MaxAttempts` aşıldığında `failed` ile sonlandırır.
    4. Çalışma süresi metriklerini (`AuditMetrics`) günceller.

- **`RetentionCleanupBackgroundService`**:
  - `Retention__Enabled=true` ise günlük olarak:
    - `FinishedAt` süresi `now - KeepDays` öncesinde kalan ve `Status != "running"` olan kayıtları bulur.
    - İlgili `RunDir` klasörünü, yalnızca `Runner__WorkingDirectory` altındaysa, güvenli şekilde siler.
    - `audit_runs` satırını (ve bağlı `findings`/`gaps` verilerini) DB’den kaldırır.

#### 2.3.2 Ingestion (JSON → DB)

Konum: `backend/KamuAudit.Api/Infrastructure/Ingestion`

- **`AuditResultIngestor`**:
  - `RunDir` altındaki `summary.json` ve `gaps.json` dosyalarını okur.
  - **Mutlu yol** (her iki dosya da mevcut):
    - İlgili `AuditRunId` için mevcut `Findings` ve `Gaps` kayıtlarını siler.
    - JSON’dan yeni `Finding` / `Gap` nesneleri üretir ve toplu ekler.
    - `DurationMs`, `LinkSampled`, `LinkBroken` gibi metrik alanlarını `AuditRun` üzerinde günceller.
  - **Dosya eksikliği için güvenli davranış**:
    - `summary.json` yoksa: mevcut `Findings`/`Gaps` korunur, ingest atlanır, uyarı loglanır, `LastError` set edilir.
    - `summary.json` var, `gaps.json` yoksa: Findings + metrikler güncellenir, mevcut `Gaps` korunur.
  - Hatalı/eksik ingest senaryolarında `audit_ingestion_failures_total` metriğini arttırır.

#### 2.3.3 İzleme ve Sağlık

- **`AuditMetrics`**:
  - `audit_runs_started_total`
  - `audit_runs_retries_total`
  - `audit_ingestion_failures_total`
  - `audit_runner_timeouts_total`
  - `audit_run_duration_ms_count` / `audit_run_duration_ms_sum`
  - Tüm sayaçlar thread-safe `Interlocked` işlemleri ile tutulur.

- **Health Checks & Metrics** (`StartupExtensions.MapHealthAndMetrics`):
  - `/health/live` – sadece uygulama ayağa kalkmış mı?
  - `/health/ready` – DB bağlantısı sağlıklı mı?
  - `/metrics` – audit kuyruk ve çalışma metrikleri + özel sayaçlar.

### 2.4 Persistence Katmanı

Konum: `backend/KamuAudit.Api/Infrastructure/Persistence`

- **`KamuAuditDbContext`**:
  - `Users`, `Systems`, `AuditRuns`, `Findings`, `Gaps` DbSet’leri.
  - `audit_runs`:
    - `Status` (`queued|running|completed|failed`), `StartedAt`, `FinishedAt`, `AttemptCount`, `LastError`, `RetryAfterUtc`.
    - `TargetUrl`, `Browser`, `Plugins` (JSON string), `RunDir`, `DurationMs`, `LinkSampled`, `LinkBroken`.
    - İndeksler: `Status`, `SystemId`; ek indeksler için bkz. `docs/performance/INDEX_RECOMMENDATIONS.md`.
  - `findings`:
    - `Severity`, `Category`, `RuleId`, `Title`, `Detail`, `Remediation`, `Meta (jsonb)`.
    - FK: `AuditRunId` → `audit_runs` (CASCADE DELETE).
  - `gaps`:
    - `ElementId`, `HumanName`, `ReasonCode`, `RiskLevel`, `RecommendedScript`, `Evidence (jsonb)`.
    - FK: `AuditRunId` → `audit_runs` (CASCADE DELETE).

Veri modeli; audit başına çok sayıda finding/gap satırını destekleyecek şekilde tasarlanmıştır.

### 2.5 Runner (Node/Playwright)

Konum: `runner/`

- **Dil ve araçlar**: Node.js 20, TypeScript, Playwright, @playwright/test.
- **Temel bileşenler**:
  - `src/cli.ts` – CLI giriş noktası; argümanları okur, Playwright tarayıcısını başlatır, akışı orkestre eder.
  - `src/core/*` – konsol/ağ toplama, link örnekleme, rule engine.
  - `src/auto/*` – otomatik UI denetimi, görünürlük sınıflandırması, scroll sampling, gap üretimi.
  - `src/reporting/*` – JSON raporlarını (`summary.json`, `gaps.json`, `ui-inventory.json`) ve artefaktları (`trace.zip`) yazar.
  - `src/plugins/*` – ek kurallar ve genişletme noktaları.

Çıktıların şeması için bkz. `docs/testing/REPORT_SCHEMA_EXAMPLE.md`.

---

## 3. Veri Akışı (Uçtan Uca)

### 3.1 Audit Oluşturma

1. İstemci (ör. frontend veya CLI), `POST /api/auth/login` ile JWT alır.
2. `POST /api/Audits` isteğiyle hedef URL, `maxLinks`, `maxUiAttempts`, `SafeMode`, `Strict` vb. parametreleri gönderir.
3. `AuditsController` isteği `IAuditRunService.CreateAsync`’e iletir.
4. `AuditRunService`:
   - Parametreleri doğrular (DTO + DataAnnotations).
   - Yeni bir `AuditRun` kaydı ekler (`Status = "queued"`, `StartedAt/FinishedAt = null`).

### 3.2 Worker Kuyruğu

1. `AuditRunnerBackgroundService` periyodik döngü içinde `TryReserveOneAsync` çağırır.
2. Bu metot:
   - `Status = 'queued'` ve `RetryAfterUtc <= now` olan satırlardan birini `FOR UPDATE SKIP LOCKED` ile seçer.
   - Kaydı yükler, `Status = 'running'`, `StartedAt = now` ve `RunDir` alanlarını doldurur.
3. Bu sayede aynı audit aynı anda iki worker tarafından işlenemez.

### 3.3 Runner Çalıştırma

1. Worker, `IAuditRunner.RunAsync` çağırır (`NodeAuditRunner`).
2. `NodeAuditRunner`:
   - `ProcessStartInfo` ile `node dist/cli.js --url ... --out <RunDir>` komutunu yürütür.
   - Zaman aşımı süresini (`MaxRunDurationMinutes`) uygular; sürecin kilitlenmesi durumunda process tree’yi sonlandırır.
3. Runner CLI:
   - Sayfayı açar, güvenli modda yıkıcı aksiyonları engeller.
   - Linkleri örnekler, forms/inputs üzerinde denemeler yapar.
   - Konsol ve ağ loglarını toplar.
   - UI öğelerini envanterleyip denemeler sonucunda `status` ve `reasonCode` alanlarını hesaplar.

### 3.4 JSON Ingestion

1. Runner tamamlandığında, `AuditRunnerBackgroundService`:
   - `FinishedAt` ve `Status` alanlarını günceller.
   - `IAuditResultIngestor.IngestAsync` çağırarak `summary.json` ve `gaps.json` dosyalarını işleme alır.
2. Ingestor:
   - `Findings` ve `Gaps` tablo kayıtlarını yeniler.
   - `DurationMs`, `LinkSampled`, `LinkBroken` gibi metrikleri `audit_runs` tablosuna yazar.

### 3.5 DB Persist ve API Okuma

1. Kalıcı durumu PostgreSQL saklar (`audit_runs`, `findings`, `gaps`).  
2. Kullanıcılar aşağıdaki uçlardan sonuç okur:
   - `GET /api/Audits` – paged liste.
   - `GET /api/Audits/{id}` – temel detay.
   - `GET /api/Audits/{id}/summary` – aggregate sonuçlar.
   - `GET /api/Audits/{id}/findings` ve `/gaps` – detaylı bulgu listeleri.

### 3.6 Metrics Güncelleme

- Worker ve ingest süreci boyunca:
  - `AuditMetrics.IncrementRunsStarted()` – her deneme başlangıcında.
  - `AuditMetrics.IncrementRunsRetries()` – yeniden kuyruğa alınan denemelerde.
  - `AuditMetrics.IncrementRunnerTimeouts()` – zaman aşımı yaşandığında.
  - `AuditMetrics.AddRunDuration(durationMs)` – tamamlanan denemelerde.
- `/metrics` uç noktası bu sayaçları Prometheus formatında dışarı açar.

---

## 4. Veritabanı Şeması Açıklaması

Ana tablolar:

- **`users`** – kimlik doğrulama ve yetki:
  - `Id`, `Email` (unique), `PasswordHash`, `Role`, `CreatedAt`.
- **`systems`** – denetlenen sistemler (isteğe bağlı):
  - `Id`, `Name`, `BaseUrl`, `Description`.
- **`audit_runs`** – her denetim çalıştırması için bir satır:
  - `Id (uuid)`
  - `SystemId (fk nullable)`
  - `TargetUrl`, `Status`, `StartedAt`, `FinishedAt`
  - `SafeMode`, `MaxLinks`, `MaxUiAttempts`, `Strict`, `Browser`, `Plugins`
  - `RunDir`
  - `DurationMs`, `LinkSampled`, `LinkBroken`
  - `AttemptCount`, `LastError`, `RetryAfterUtc`
- **`findings`** – kural bazlı bulgular:
  - `Id`, `AuditRunId (fk)`, `RuleId`, `Severity`, `Category`, `Title`, `Detail`, `Remediation`, `Meta (jsonb)`.
- **`gaps`** – test edilemeyen veya problemli UI öğeleri:
  - `Id`, `AuditRunId (fk)`, `ElementId`, `HumanName`, `ReasonCode`, `ActionHint`, `RiskLevel`, `RecommendedScript`, `Evidence (jsonb)`.

Performans için ayrıntılı indeks önerileri: `docs/performance/INDEX_RECOMMENDATIONS.md`.

---

## 5. Retry & Timeout Mekanizması

- **Retry**:
  - `MaxAttempts` kadar deneme yapılır.
  - Her hata sonrası `AttemptCount` artar; `RetryAfterUtc = now + 2^AttemptCount` (saniye) olarak ayarlanır.
  - `TryReserveOneAsync` sadece `RetryAfterUtc <= now` olan işleri seçer.
  - `MaxAttempts` aşıldığında durum `failed` olarak sabitlenir.

- **Timeout**:
  - `Runner__MaxRunDurationMinutes` ile sınırlı.
  - Zaman aşımında:
    - Node süreci (ve child’ları) öldürülmeye çalışılır.
    - `LastError = "Runner timeout after {X} minutes."` olarak set edilir.
    - `audit_runner_timeouts_total` metriği artar.

Bu mekanizma, bozuk/hang eden sitelerin tüm iş kuyruğunu kilitlemesini engeller.

---

## 6. Güvenlik Katmanı

### 6.1 JWT

- `Jwt__Key` zorunlu; **en az 32 karakter**, 64+ önerilir.
- Issuer/Audience kontrolü aktiftir; süre (`ExpiryHours`) yapılandırılabilir.
- Key eksik veya kısa ise uygulama **başlangıçta hata fırlatır**.

### 6.2 Role-based Access

- Roller: `QA`, `Developer`, `Security`, `Admin` (örnek set).
- `AuditUsers` politikası; audit uçlarına erişimi bu rollere sınırlar.

### 6.3 Rate Limiting

- ASP.NET Core RateLimiter kullanılır.
- Konfigürasyon:
  - `RateLimiting__Enabled` (bool)
  - `RateLimiting__Auth` – auth uçları için dakikadaki istek sayısı.
  - `RateLimiting__AuditCreate` – `POST /api/Audits` için dakikalık limit.
- Limit aşıldığında:
  - HTTP 429 + gövde: `{ "error": "rate_limited", "retryAfterSeconds": X }`
  - `Retry-After` header’ı set edilir.

Detay için: `docs/deployment/RUNBOOK_DEPLOYMENT.md` ve `docs/security/SECURITY.md`.

---

## 7. Observability

- **Health Endpoints**:
  - `/health/live` – temel liveness.
  - `/health/ready` – DB bağlantısı dahil readiness.
- **Metrics** (`/metrics`):
  - Kuyruk derinliği, çalışan run sayısı, tamamlanan/başarısız run toplamları.
  - Retry, ingest hataları, runner timeouts ve süre özetleri.
- **OpenTelemetry Traces**:
  - ASP.NET Core, HttpClient, EF Core ve özel `ActivitySource("KamuAudit.Backend")` ile:
    - `AuditRun.Execute` (worker),
    - `Runner.StartProcess`,
    - `Ingestion.ParseJson`, `Ingestion.PersistDb` gibi span’ler üretir.

Ayrıntılı gözlemlenebilirlik kılavuzu: `docs/operations/OBSERVABILITY_GUIDE.md`.

---

## 8. CI/CD Süreci

- **Backend CI (`backend-ci.yml`)**:
  - .NET 8 (global.json) kurulumu, restore, build, test.
  - Postgres 16 servisi ile `dotnet ef database update` entegrasyonu.
- **Runner CI (`audit.yml`)**:
  - Node 20 kurulumu (`runner/.nvmrc`), `npm ci`, `npm run lint`, `npm run build`, `npm test`.
  - `npx playwright install --with-deps` ile tarayıcı kurulumu.
  - Chromium/Firefox matrisinde smoke denetimler.
- **Security Audit (`security-audit.yml`)**:
  - `.NET`: `dotnet list package --vulnerable --include-transitive`.
  - `npm`: `npm audit --audit-level=high`.

Detaylar için: `docs/security/SECURITY.md` ve `docs/reports/QA_ARCHITECTURE_REPORT.md`.

---

## 9. Deployment Mimarisi

Önerilen topoloji:

- **Uygulama**:
  - 1+ adet backend pod/VM (API + worker birlikte).
  - Ayrı Node 20 + Playwright runner dosya sistemi (aynı node veya paylaşılan disk).
- **Veritabanı**:
  - PostgreSQL 16 (yönetilen servis veya VM).
- **Reverse Proxy / Ingress**:
  - TLS terminasyonu, `X-Forwarded-*` başlıkları, rate limiting / WAF kuralları.

Dağıtım adımları: `docs/deployment/RUNBOOK_DEPLOYMENT.md` ve `docs/deployment/DEPLOYMENT_CHECKLIST.md`.

---

## 10. Ölçeklenebilirlik Analizi

- **Yatay ölçekleme**:
  - Birden fazla backend instance’ı, `FOR UPDATE SKIP LOCKED` sayesinde aynı kuyruğu güvenle paylaşabilir.
  - Runner yükü; `MaxConcurrentRuns` ve replika sayısı ile kontrol edilir.
- **Veri büyümesi**:
  - Büyük `findings`/`gaps` tabloları için önerilen indeksler kullanılmalıdır.
  - `Retention` job’u, eski kayıtları ve rapor klasörlerini temizleyerek disk/bellek baskısını azaltır.

---

## 11. Güçlü Yönler

- Temiz katmanlı mimari (API / Application / Infrastructure / Persistence / Runner ayrımı).
- Postgres tarafında doğru concurrency modeli (`FOR UPDATE SKIP LOCKED` kuyruk).
- Idempotent ingest stratejisi (delete-then-insert).
- Zaman aşımı ve retry/backoff mekanizması ile dayanıklılık.
- Gözlemlenebilirlik: health, metrics, OpenTelemetry, Serilog JSON logları.

---

## 12. Teknik Borçlar

Detaylar için ayrıca bkz. `docs/reports/REVIEW_REPORT.md` ve `docs/reports/QA_ARCHITECTURE_REPORT.md`, ancak özetle:

- Runner ve backend testlerinin CI’da her zaman yeşil olması için ortam bağımlılıklarının (SDK, Node, Playwright) sertleştirilmesi.
- Bazı hata/path senaryoları için ek otomatik testler (timeout, ingestion hataları, rate limit).
- Daha zengin metrik setleri (endpoint latency, runner per-target istatistikleri).

---

## 13. Canlıya Hazırlık Durumu

Güncel mimari ve kod kalitesi, sistemi **staging** ve **küçük ölçekli üretim** ortamları için uygun hale getirir.  
Tam anlamıyla **kurumsal seviyede prod** için aşağıdaki minimumlar önerilir:

- Tüm CI job’larının (backend, runner, security) stabil yeşil olması.
- Smoke script’lerinin (`tools/smoke/smoke.*`) her dağıtımda başarıyla çalışması.
- Temel uyarı setinin (queue derinliği, failure rate, runner timeouts, ingestion failures, DB readiness) aktif ve takip edilir olması.

Bu gereksinimler sağlandığında, Kamu Web Audit sistemi operasyonel olarak izlenebilir, geri alınabilir ve ölçeklenebilir bir şekilde canlıya alınabilir.

