## Kamu Web Audit – Test Stratejisi Özeti

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit için test stratejisinin **özetini** sunar ve detaylı
plan için `docs/qa/TEST_STRATEGY.md` dosyasına referans verir.

---

### 1. Test Kategorileri

- **Unit testler**
  - Kural motoru (HTTP header kuralları, JS analyzer, form analyzer),
  - URL canonicalization ve fingerprint/dedup hesaplamaları,
  - Backend ingestion (FindingTemplate / FindingInstance güncellemeleri).
- **Integration testler**
  - Mock web uygulamalarıyla login + crawl + findings zinciri,
  - Crawler bütçeleri, robots.txt ve BFS kuyruğu davranışı,
  - Rule engine’in HTTP/JS/Network katmanlarıyla birlikte çalışması.
- **UAT (User Acceptance Testing)**
  - Captcha’lı siteler, zorunlu login, SPA’ler, yoğun 429/403 senaryoları gibi edge case’ler.
- **Load / performans testleri**
  - 1000 sayfalık simüle site ile süre ve kaynak kullanımı,
  - Runner, DB ve background worker darboğazlarının analizi.

---

### 2. Klasör Yapısı (Özet)

- `backend/KamuAudit.Api/`
  - `KamuAudit.Tests/` – backend unit ve integration testleri için yer.
    - Ingestion & dedup:
      - `AuditResultIngestorTests` – gerçek PostgreSQL (Testcontainers) ile FindingTemplate/FindingInstance dedup mantığını doğrular.
      - Test DB: **Testcontainers PostgreSql** (Docker gerektirir).
      - Çalıştırmak için: Docker daemon açıkken depo kökünden `dotnet test` komutu yeterlidir.
- `runner/`
  - `src/tests/`
    - Unit: `httpAnalyzer.spec.ts`, `jsAnalyzer.spec.ts`, `urlNormalizer.spec.ts` vb.
    - Integration: `formAnalyzer.spec.ts`, `crawlerIntegration.spec.ts`, `ruleEngineIntegration.spec.ts`.
    - Smoke: `smoke.spec.ts` – temel “homepage opens” senaryosu.

Detay için: `docs/qa/TEST_STRATEGY.md`.

---

### 3. Amaçlar

- Kural motorunun **deterministik** ve tekrarlanabilir sonuç üretmesini sağlamak,
- Non‑destructive ilkelerin testlerle korunmasını güvence altına almak,
- Genişletilen her yeni modül (crawler, auth, JS analyzer vb.) için
  minimum unit + integration test standardını korumak.

