⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Deployment Checklist – Özet (TR)

> Tam İngilizce liste için: `DEPLOYMENT_CHECKLIST_EN.md`.

Bu kontrol listesi, bir sürümü **staging** veya **prod** ortamına almadan önce hızlıca gözden geçirmeniz gereken maddeleri içerir.

- **Ortam & Sırlar**
  - .NET SDK 8.0.418 ve Node.js 20.x LTS kurulu mu?
  - `ConnectionStrings__Default` ve `Jwt__Key` doğru set edilmiş mi?
  - Runner ayarları (`Runner__WorkingDirectory`, `Runner__NodePath`, `Runner__CliScript`, `Runner__MaxRunDurationMinutes`) doğru mu?
  - Rate limiting ve CORS yapılandırmaları hedef ortama uygun mu?

- **Veritabanı & Migration**
  - PostgreSQL 16 örneği hazır mı?
  - Uygulama kullanıcısı / veritabanı açıldı mı?
  - `dotnet ef database update` doğru SDK ile çalıştırıldı mı?

- **Runner & Playwright**
  - `runner/` dizininde:
    - `npm ci`
    - `npm run lint`
    - `npm run build`
    - `npm test`
  - Playwright tarayıcıları (`npx playwright install --with-deps chromium`) yüklü mü?

- **CI Durumu**
  - Backend CI (`backend-ci.yml`) yeşil mi (build + test + migrations)?
  - Runner iş akışları (`audit.yml`) yeşil mi?
  - Güvenlik taraması workflow’u çalıştırıldı mı; kritik/high bulgular için plan var mı?

- **Gözlemlenebilirlik**
  - `/health/live` ve `/health/ready` load balancer/ingress health check’lerine bağlı mı?
  - `/metrics` Prometheus tarafından scrape ediliyor mu; dashboard ve alarmlar tanımlı mı?
  - Loglar merkezi bir sisteme gönderiliyor mu; `TraceId`/`SpanId` görülebiliyor mu?

- **Smoke Test**
  - Staging benzeri ortamda:
    - `tools/smoke/smoke.ps1` veya `tools/smoke/smoke.sh` başarıyla tamamlandı mı (exit code 0)?

Tüm maddeler sağlanmadan prod’a rollout yapılmaması önerilir. Ayrıntılar için: `RUNBOOK_DEPLOYMENT_EN.md` ve `DEPLOYMENT_CHECKLIST_EN.md`.

