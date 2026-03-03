⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Implementation Plan — Özet (TR)

> Bu dosya, kökteki `IMPLEMENTATION_PLAN.md` belgesinin Türkçe özetidir.  
> Ayrıntılı İngilizce sürüm için: `IMPLEMENTATION_PLAN_EN.md`.

Bu plan, Kamu Web Audit sistemini **üretim koşullarına taşımak** için yapılması gereken işleri fazlara ayırır.

- **Faz 1 – Kritik Düzeltmeler**
  - **JSON → DB ingest (1A)**:  
    - Yeni DTO’lar (`RunnerReportModels`) ve `AuditResultIngestor` ile `summary.json` / `gaps.json` dosyalarından gelen veriler güvenli ve idempotent şekilde `findings` ve `gaps` tablolarına aktarılır.
    - `AuditRunnerBackgroundService`, Node/Playwright çalışmasından sonra aynı transaction içinde ingest’i tetikler.
  - **Runner crash summary (1B)**:  
    - CLI tarafında (runner) beklenmeyen bir hata olduğunda, en azından minimal bir `summary.json` yazılır ki backend bu çalışmayı “failed” olarak raporlayabilsin.
  - **Güvenli konfigürasyon (1C)**:  
    - `appsettings*.json` içindeki connection string’ler placeholder’a çekilir; gerçek değerler user-secrets veya env var üzerinden verilir.

- **Faz 2 – Mimari**
  - **Application layer (2D)**:  
    - `IAuditRunService`, `AuditRunService` ve `IAuditRunner` / `IAuditResultIngestor` arayüzleri eklenir.  
    - Controller’lar doğrudan DbContext yerine bu servisleri kullanır.
  - **İş kuyruğu güvenliği (2E)**:  
    - `audit_runs` tablosuna `attempt_count` ve `last_error` alanları eklenir (migration).  
    - `AuditRunnerBackgroundService` içinde `FOR UPDATE SKIP LOCKED` ile tekil iş rezervasyonu ve retry/backoff mantığı uygulanır.

- **Faz 3 – Üretim Hazırlığı**
  - **Observability (3F)**: Serilog JSON log’ları, `/metrics`, `/health/live`, `/health/ready` ve korelasyon alanları eklenir.
  - **Auth (3G)**: JWT tabanlı kimlik doğrulama, roller (`QA`, `Developer`, `Security`, `Admin`), `[Authorize]` ve politikalar.
  - **CI (3H)**: `.github/workflows/backend-ci.yml` ile build, test ve migration’ları çalıştıran pipeline tanımlanır.

Plan; her fazın riskini, etkilenen dosyaları ve çalışma sırasını detaylandırır.  
Tam liste ve komutlar için İngilizce dokümana bakabilirsiniz: `IMPLEMENTATION_PLAN_EN.md`.

