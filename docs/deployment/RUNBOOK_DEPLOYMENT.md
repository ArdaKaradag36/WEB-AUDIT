⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Deployment Runbook – Özet (TR)

> Bu dosya, kökteki orijinal runbook’un Türkçe özetidir.  
> Ayrıntılı İngilizce sürüm için: `RUNBOOK_DEPLOYMENT_EN.md`.

Bu runbook; Kamu Web Audit sisteminin (backend API + arka plan worker + Node/Playwright runner) **staging / prod benzeri** bir ortama nasıl dağıtılacağını adım adım anlatır.

### 1. Gerekli Ortam Değişkenleri ve Sırlar

- `ConnectionStrings__Default` – PostgreSQL connection string’i (API + migrations).
- `Jwt__Key` – JWT imzalama anahtarı (min 32, önerilen 64+ karakter).
- Runner ayarları:
  - `Runner__WorkingDirectory`
  - `Runner__NodePath`
  - `Runner__CliScript` (örn. `dist/cli.js`)
  - `Runner__MaxRunDurationMinutes`
- Rate limiting:
  - `RateLimiting__Enabled`, `RateLimiting__Auth`, `RateLimiting__AuditCreate`
- OpenTelemetry:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`
- Retention (isteğe bağlı):
  - `Retention__Enabled`, `Retention__KeepDays`
- CORS (frontend varsa):
  - `Cors__Enabled`, `Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`, …

### 2. Sağlama (Provisioning)

- PostgreSQL 16 kurulumu, kullanıcı ve veritabanı oluşturma.
- Doğru .NET SDK ile (`global.json`’a göre) `dotnet ef database update` çalıştırma.
- Node.js 20 ve Playwright tarayıcılarının runner ortamına kurulumu.
- Disk boyutlandırma:
  - `runner/reports/runs/` için en az 30–90 günlük rapor saklayacak alan.
  - Log’lar için merkezi log altyapısı + lokal rotasyon.

### 3. Reverse Proxy ve TLS

- Nginx / ingress üzerinden TLS terminasyonu ve backend’e proxy.
- `X-Forwarded-For` / `X-Real-IP` başlıklarının doğru ayarlanması.
- (İsteğe bağlı) ASP.NET Core `ForwardedHeadersOptions` yapılandırması.

### 4. Sorun Giderme

- Kuyruk takılması, runner hataları, zaman aşımı, DB down ve eksik JSON raporları için adım adım senaryolar içerir.
- Rapor klasörlerinin ve DB’nin nasıl temizleneceği / prune edileceği açıklanır.

### 5. Rollback ve Migration Stratejisi

- Migration’ların tek yönlü (forward-only) olduğu varsayımıyla; rollback durumunda DB snapshot geri yükleme önerilir.
- Güvenli migration uygulama örnek komutları: `dotnet ef database update --no-build -c Release`.

Tam detaylar ve komut örnekleri için İngilizce runbook’a bakınız: `RUNBOOK_DEPLOYMENT_EN.md`.

