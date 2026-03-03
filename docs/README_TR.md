## Kamu Web Audit – Proje Dokümantasyonu (TR)

Bu depo, **Kamu Web Audit** sisteminin tamamını içerir:

- **Backend (.NET 8 Web API)** – JWT ile kimlik doğrulama, denetim kayıtları, kuyruk yönetimi, arka plan işi ve JSON ingest işlemleri.
- **Runner (Node.js 20 + Playwright)** – Hedef URL üzerinde tarayıcı tabanlı denetim çalıştırır, JSON raporları üretir.
- **Altyapı** – PostgreSQL 16, EF Core, GitHub Actions CI, gözlemlenebilirlik (health, metrics, OpenTelemetry), güvenlik ve deployment runbook’ları.

Bu klasör, projenin **Türkçe teknik dokümantasyonunun** tek kaynağıdır. Kök `README.md` sadece kısa İngilizce özet içerir ve buraya yönlendirir.

---

### 1. Dokümantasyon Klasör Yapısı

`/docs` altında kullanılan yapı:

- `architecture/`
  - **`IMPLEMENTATION_PLAN.md`** – Üretim bileşenleri için adım adım uygulama planı.
  - **`SYSTEM_TECHNICAL_DOCUMENTATION_TR.md`** – Tüm sistem için kapsamlı teknik mimari dokümanı (önerilen başlangıç noktası).
  - **`QA_ARCHITECTURE_REPORT.md`** – Önceki mimari / kalite incelemesinin ayrıntılı raporu.
- `deployment/`
  - **`RUNBOOK_DEPLOYMENT.md`** – Üretim benzeri ortama dağıtım için tam runbook.
  - **`DEPLOYMENT_CHECKLIST.md`** – Staging / prod öncesi kısa denetim listesi.
- `security/`
  - **`SECURITY.md`** – Bağımlılık güvenliği, otomatik taramalar ve güvenlik süreçleri.
- `testing/`
  - **`TEST_AUDIT_PLAN.md`** – Uçtan uca test ve denetim planı (backend + runner + DB).
  - **`REGRESSION_CHECKLIST.md`** – UI görünürlük & scroll sampling regresyon kontrol listesi.
  - **`REPORT_SCHEMA_EXAMPLE.md`** – `ui-inventory.json` / `gaps.json` şeması ve alan açıklamaları.
  - **`VISIBILITY_AND_SCROLL.md`** – Görünürlük sınıflandırması ve scroll sampling tasarımı.
- `operations/`
  - **`OBSERVABILITY_GUIDE.md`** – `/metrics`, dashboard’lar, PromQL sorguları ve uyarı önerileri.
- `performance/`
  - **`INDEX_RECOMMENDATIONS.md`** – Sorgu kalıplarına göre PostgreSQL indeks önerileri.
- `reports/`
  - **`REVIEW_REPORT.md`** – Geniş kapsamlı ilk mimari / güvenlik / güvenilirlik incelemesi.
  - **`QA_ARCHITECTURE_REPORT.md`** – QA / SRE odaklı son durum değerlendirmesi.

> Not: Orijinal İngilizce dokümanlar depo kökünde referans amaçlı durmaktadır; güncel ve birincil kaynak bu Türkçe dokümantasyondur.

---

### 2. Proje Genel Bakış

Kamu Web Audit, **kamu web sitelerinin teknik ve güvenlik kalitesini** ölçmek için tasarlanmış bir denetim sistemidir:

- Kullanıcı, API üzerinden bir **audit** talebi (hedef URL + parametreler) oluşturur.
- Backend bu talebi **`audit_runs`** tablosunda `queued` durumuyla kaydeder.
- Arka planda çalışan **`AuditRunnerBackgroundService`**, Postgres kuyruğundan `FOR UPDATE SKIP LOCKED` ile tekil iş rezervasyonu yapar.
- **`NodeAuditRunner`**, Node 20 + Playwright kullanan **runner CLI**’ını (`dist/cli.js`) çalıştırır; runner:
  - sayfayı ziyaret eder, link’leri örnekler, konsol/ağ hatalarını toplar,
  - otomatik UI denetimi yapar, **`summary.json`**, **`gaps.json`**, **`ui-inventory.json`** vb. üretir.
- Backend, **`AuditResultIngestor`** ile JSON çıktıları okur, `findings` ve `gaps` tablolarını **idempotent** şekilde günceller, `AuditRun` metriklerini (süre, link sayıları) yazar.
- İstemciler sonuçları şu uçlardan okur:
  - `GET /api/Audits` (liste)
  - `GET /api/Audits/{id}` (detay)
  - `GET /api/Audits/{id}/summary`
  - `GET /api/Audits/{id}/findings`
  - `GET /api/Audits/{id}/gaps`
- `/metrics` Prometheus uyumlu metrikler üretir, `/health/live` ve `/health/ready` health check sağlar, OpenTelemetry ile izler gönderilebilir.

Detaylı mimari açıklama için: **`architecture/SYSTEM_TECHNICAL_DOCUMENTATION_TR.md`**.

---

### 3. Önemli Dokümanlara Hızlı Linkler

- **Mimari & tasarım**
  - [`architecture/SYSTEM_TECHNICAL_DOCUMENTATION_TR.md`](architecture/SYSTEM_TECHNICAL_DOCUMENTATION_TR.md)
  - [`architecture/IMPLEMENTATION_PLAN.md`](architecture/IMPLEMENTATION_PLAN.md)
  - [`performance/INDEX_RECOMMENDATIONS.md`](performance/INDEX_RECOMMENDATIONS.md)

- **Test & kalite güvencesi**
  - [`testing/TEST_AUDIT_PLAN.md`](testing/TEST_AUDIT_PLAN.md)
  - [`testing/REGRESSION_CHECKLIST.md`](testing/REGRESSION_CHECKLIST.md)
  - [`testing/REPORT_SCHEMA_EXAMPLE.md`](testing/REPORT_SCHEMA_EXAMPLE.md)
  - [`testing/VISIBILITY_AND_SCROLL.md`](testing/VISIBILITY_AND_SCROLL.md)

- **Güvenlik**
  - [`security/SECURITY.md`](security/SECURITY.md)

- **Operasyon & gözlemlenebilirlik**
  - [`deployment/RUNBOOK_DEPLOYMENT.md`](deployment/RUNBOOK_DEPLOYMENT.md)
  - [`deployment/DEPLOYMENT_CHECKLIST.md`](deployment/DEPLOYMENT_CHECKLIST.md)
  - [`operations/OBSERVABILITY_GUIDE.md`](operations/OBSERVABILITY_GUIDE.md)

- **Raporlar**
  - [`reports/REVIEW_REPORT.md`](reports/REVIEW_REPORT.md)
  - [`reports/QA_ARCHITECTURE_REPORT.md`](reports/QA_ARCHITECTURE_REPORT.md)

---

### 4. Nasıl Başlamalı?

1. **Sistemi anlamak için**:  
   `architecture/SYSTEM_TECHNICAL_DOCUMENTATION_TR.md` dosyasını baştan sona okuyun.
2. **Lokal ortam kurmak için**:  
   `deployment/RUNBOOK_DEPLOYMENT.md` ve `deployment/DEPLOYMENT_CHECKLIST.md` bölüm 1–3 adımlarını uygulayın.
3. **Test ve kalite planını görmek için**:  
   `testing/TEST_AUDIT_PLAN.md` ve `reports/QA_ARCHITECTURE_REPORT.md`’a bakın.
4. **Prod operasyonu ve gözlemlenebilirlik için**:  
   `operations/OBSERVABILITY_GUIDE.md` ve `deployment/RUNBOOK_DEPLOYMENT.md` > metrics & troubleshooting bölümlerini kullanın.

