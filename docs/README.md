## Kamu Web Audit – Docs Index

Last updated: 2026-03-05

Bu klasör, Kamu Web Audit için hem **public ürün dokümantasyonu**nu hem de **iç teknik dokümantasyonu** barındırır.

---

### 1. Public Dokümantasyon (`docs/public`)

Bu dokümanlar, ürünü kullanan ekipler (QA, güvenlik, iş birimi) içindir.

- `docs/public/SYSTEM_OVERVIEW_TR.md` – Ürünün ne yaptığı, hangi problemi çözdüğü.
- `docs/public/HOW_IT_WORKS_TR.md` – Yüksek seviyeli akış (hedef → scan → findings → rapor).
- `docs/public/DEPLOYMENT_OVERVIEW_TR.md` – Ürünün hangi ortamlarda nasıl konumlandığı.
- `docs/public/SECURITY_OVERVIEW_TR.md` – Ürün güvenliği ve veri güvenliği açısından özet.
- `docs/public/SCOPE.md` – Yalnızca **web uygulaması** taradığı, non‑destructive politika.
- `docs/public/USAGE.md` – Web UI üzerinden nasıl scan başlatılacağı ve sonuçların okunacağı.

Public dokümantasyon, “**ürün nasıl kullanılır**?” sorusuna cevap verir.

---

### 2. İç Teknik Dokümantasyon (`docs/internal` ve alt klasörler)

Bu bölüm, mühendislik / SRE / güvenlik ekipleri içindir.

- `docs/internal/ARCHITECTURE.md` – Layered architecture özeti ve ana bileşenler.
- `docs/internal/API.md` – API kullanım rehberi (OpenAPI + error modeli).
- `docs/internal/QA.md` – Test stratejisi özeti ve detaylı dokümana linkler.
- `docs/internal/adr/` – Mimari karar kayıtları (ADRs).

Diğer teknik dokümanlar:

- Mimari ve domain:
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/domain/DOMAIN.md`
  - `docs/db/SCHEMA.md`, `docs/db/MIGRATIONS.md`
- API sözleşmesi:
  - `docs/api/openapi.yaml`
  - `docs/api/API_GUIDE.md`
- Güvenlik, operasyon, CI:
  - `docs/security/SECURITY.md`, `docs/security/SECURITY_EN.md`
  - `docs/ops/OBSERVABILITY.md`
  - `docs/ci/CI.md`
- UI ve UX:
  - `docs/ui/UI_SPEC.md`

Eski TR indeks ve readme dosyaları `docs/internal/deprecated/` altına taşınmıştır; yeni giriş noktası bu dosyadır.

---

### 3. Hızlı Başlangıç

Bir mühendisseniz ve sistemi hızlıca anlamak istiyorsanız:

1. `docs/internal/ARCHITECTURE.md` – Katmanlı mimari ve ana bileşenler.
2. `docs/domain/DOMAIN.md` – Target / Scan / Finding / Rule domain modeli.
3. `docs/api/API_GUIDE.md` ve `docs/internal/API.md` – API uçları ve hata modeli.
4. `docs/internal/QA.md` ve `docs/qa/TEST_STRATEGY.md` – Test stratejisi.
5. `docs/security/SECURITY.md` ve `docs/ops/OBSERVABILITY.md` – Güvenlik + observability.

