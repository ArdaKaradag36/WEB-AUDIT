## Test & Denetim Planı – Özet (TR)

> Tam İngilizce plan: `TEST_AUDIT_PLAN_EN.md`.

Bu plan, Kamu Web Audit sisteminin uçtan uca nasıl test edileceğini tanımlar.

### Kapsam

- **Statik kontroller**: repo yapısı, `global.json`, `.nvmrc`, GitHub Actions workflow’ları, `appsettings.json` placeholder’ları, migrations.
- **Build + unit/integration**:
  - Backend: `dotnet restore`, `dotnet build`, `dotnet test backend/KamuAudit.Tests/...`.
  - Runner: `npm ci`, `npm run build`, `npm test`.
- **Entegrasyon / E2E**:
  - Docker ile Postgres 16,
  - Ortam değişkenleri ile çalışan backend,
  - Node/Playwright runner,
  - JSON ingest (`summary.json`, `gaps.json`),
  - Auth, metrics ve health uçları.
- **Güvenlik testleri**: JWT key doğrulama, DTO input validasyonu, process execution güvenliği, repo hijyeni.
- **Yük / stres**: login ve audit uçlarında hafif yük; hata oranları ve kuyruk davranışının gözlemi.

### Araçlar

- .NET SDK (global.json ile 8.0.x)
- Node.js 20 (runner/.nvmrc)
- Docker (Postgres 16)
- curl veya benzeri HTTP istemci
- k6 (opsiyonel)

### Başarı Kriterleri

- Tüm build ve test komutları CI-benzeri ortamda **PASS** duruma gelir.
- E2E senaryoda:
  - Audit `queued → running → completed/failed` akışını tamamlar.
  - `/summary`, `/findings`, `/gaps` uçları tutarlı veri döner.
- Failure path’lerde:
  - Zaman aşımı, missing JSON, auth ve rate limiting davranışları beklenen şekilde gerçekleşir.
- `/metrics` ve OpenTelemetry izleri, yapılan işlemleri doğru yansıtır.

Detaylı komutlar ve riskler için `TEST_AUDIT_PLAN_EN.md` dosyasına bakınız.

