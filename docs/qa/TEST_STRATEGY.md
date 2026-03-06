# Kamu Web Audit – Test Stratejisi

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit platformu için **uçtan uca test stratejisini** tanımlar:

- Unit testler ile kural motoru ve yardımcı fonksiyonların doğrulanması,
- Integration testler ile mock web uygulamalarına karşı login/crawl/finding zincirinin doğrulanması,
- UAT (User Acceptance Testing) senaryoları,
- Load/performans testleri ile darboğaz analizi.

---

## 1. Test Klasör Planı

- `backend/KamuAudit.Api/`
  - `KamuAudit.Tests/`
    - Unit:
      - Ingestion (`AuditResultIngestorTests`),
      - Auth / RBAC (AuthController, AuditRunService).
    - Integration:
      - Gerçek Postgres (Docker) ile migration + basic API akışları.
- `runner/`
  - `src/tests/`
    - Unit:
      - `domScan.spec.ts` – UI inventory label normalizasyonu.
      - `httpAnalyzer.spec.ts` – HTTP security header kuralları.
      - `jsAnalyzer.spec.ts` – JS/secret/sourcemap/debug analizörü.
      - `urlNormalizer.spec.ts` – URL canonicalization ve dedup anahtarı.
    - Integration:
      - `formAnalyzer.spec.ts` – mock HTTP server ile form refleksiyon + open-redirect heuristics.
      - `crawlerIntegration.spec.ts` – mock site üzerinde crawl budget + robots + BFS.
      - `ruleEngineIntegration.spec.ts` – RuleEngine’in HTTP/JS/Network katmanlarıyla birlikte çalışması.
    - Smoke:
      - `smoke.spec.ts` – gerçek target’e karşı basic “homepage opens” doğrulaması (CI’da opsiyonel).

---

## 2. Unit Test Stratejisi

### 2.1. HTTP Header Kuralları (runner/rules/http)

Kapsam:

- HSTS (`KWA-HTTP-001`) – header yok veya düşük max-age,
- CSP var/yok ve `unsafe-inline`/`unsafe-eval` kullanımı,
- X-Frame-Options / frame-ancestors kombinasyonları,
- X-Content-Type-Options: `nosniff` vs. diğer değerler,
- Referrer-Policy / Permissions-Policy varlığı,
- Cookie flag’leri (Secure/HttpOnly/SameSite),
- CORS wildcard (`Access-Control-Allow-Origin: *`),
- Mixed content: HTTPS sayfada HTTP resource’lar.

`httpAnalyzer.spec.ts` içinde en az **5** ayrı test ile:

- Pozitif/negatif durumlar (header eksik vs doğru konfig),
- Cookie ve CORS kurallarının ayrı ayrı tetiklendiği senaryolar.

### 2.2. URL Canonicalization

Yeni unit test dosyası: `runner/src/tests/urlNormalizer.spec.ts`

Testler:

- Fragment temizliği (`https://a/b#c` → `https://a/b`),
- Default port normalize (`http://a:80/` → `http://a/`),
- Tracking parametrelerinin (utm/gclid vb.) kaldırılması,
- Query parametre sırala (deterministik canonicalKey),
- Geçersiz URL için `null` dönmesi.

### 2.3. Fingerprint / Dedup (backend ingestion)

- `AuditResultIngestorTests` içine ek unit testler:
  - Aynı `ruleId + canonicalUrl + parameter + evidenceKey` için:
    - Aynı fingerprint üretildiğini,
    - `FindingTemplate.OccurrenceCount`’ın arttığını,
    - `FindingInstances` kaydının oluştuğunu doğrulayan senaryolar.
  - Farklı parametre veya URL için farklı fingerprint’ler.

### 2.4. JS Analyzer

`jsAnalyzer.spec.ts`:

- Inline HTML içinde secret-like pattern → `KWA-JS-001` (confidence düşük),
- `/api/...` ve `graphql` URL’leri → `KWA-JS-002`,
- `.map` dosyaları → `KWA-JS-003`,
- Debug log’lar (`DEV MODE`, `development build`) → `KWA-JS-004`.

Toplamda runner tarafında **10+ unit test** hedeflenmiştir.

---

## 3. Integration Test Stratejisi

### 3.1. Mock Web App – Node HTTP Server

Playwright test runner ile:

- Node `http.createServer` kullanarak basit mock uygulamalar:
  - Login formu, refleksiyon endpoint’i, basic robots.txt ve birkaç link.
- Her integration test:
  - Sunucuyu ephemeral port’ta ayağa kaldırır,
  - `page.goto` veya crawler fonksiyonlarını kullanarak akışı çalıştırır,
  - Sonuçları (findings, coverage, crawl stats) assert eder,
  - Test sonunda `server.close()` çağırır.

### 3.2. Planlanan Integration Testler

- `formAnalyzer.spec.ts`:
  - GET form + encoded reflection senaryosu (başlangıçta eklendi),
  - Genişletilebilir: CSRF token’lı/CSRF’siz POST formlar, open redirect parametreleri.

- `crawlerIntegration.spec.ts`:
  - Basit site:
    - `/` → `/page1`, `/page2` link’leri,
    - `robots.txt` ile bir path’in disallow edilmesi.
  - `crawlSite` ile:
    - `maxPages`, `maxDepth` ve robots politikasının doğru uygulandığı,
    - `pagesVisited` ve `networkPolicySkips` metriklerinin beklendiği gibi olduğu doğrulanır.

- `ruleEngineIntegration.spec.ts`:
  - Manuel `RuleEngineInput` fixture’ı:
    - Security header’lar, networkIssues, cookies, consoleIssues,
    - `runRuleEngine` çağrısı ile HTTP/JS/Network kurallarının birlikte üretildiği bir senaryo.
  - Amaç: HTTP analyzer + JS analyzer + network kurallarının tek noktadan doğru çalıştığını doğrulamak.

Toplamda **en az 3 integration test** koşar durumda olmalıdır.

---

## 4. UAT (User Acceptance Testing)

UAT, gerçek kullanıcı senaryoları üzerinden yapılır; teknik doğrulamaya ek olarak:

- **Edge case listesi**:
  - Captcha korumalı siteler (AUTH_BLOCKED / SKIPPED network policy),
  - Zorunlu login gerektiren portallar (Auth profile devreye girdiğinde),
  - Çok sayfalı SPA’ler (history API ile route değişimi),
  - Ağ kesintileri, proxy/WAF, 403/429 yoğun olduğu siteler,
  - Farklı tarayıcı profilleri (chromium/firefox),
  - Farklı dil/charset kombinasyonları (TR, UTF-8 dışı).
- Her edge case için:
  - Beklenen davranış: BLOCKED/SAFE/SKIPPED,
  - Rapor ekranında kullanıcıya gösterilen mesajlar (örn. “Tarama captcha nedeniyle durduruldu, manual review gerekli”),
  - Güvenlik: Asla destructive aksiyon, kimlik bilgisi sızıntısı vb. olmamalı.

UAT, staging ortamında gerçek kurumsal hedefler ile, güvenlik ekibi ve QA ekibinin birlikte yürüttüğü bir süreçtir.

---

## 5. Load / Performans Test Stratejisi

### 5.1. 1000 Sayfa Simülasyonu

- Mock server ile:
  - `/page/1` → `/page/2` → ... → `/page/1000` zinciri,
  - Her sayfada birkaç link ve basit DOM.
- Crawler konfigürasyonu:
  - `maxPages = 1000`, `maxDepth >= 3`, uygun rate limit.
- Ölçülecekler:
  - Toplam süre (durationMs),
  - `pagesScanned`, `requestsTotal`, `skippedNetwork`, `retries`,
  - CPU/memory profili (runner süreci),
  - Backend tarafında ingest ve rapor üretimi süresi.

### 5.2. Darboğaz Analizi

- Hedefler:
  - Runner CPU / IO darboğazı (concurrency artırıldığında),
  - Backend DB sorgu süresi (finding_templates / finding_instances büyüdükçe),
  - Queue derinliği ve background worker throughput’u.
- Araçlar:
  - `k6` veya benzeri load test aracı ile API seviyesinde,
  - Playwright testleri ile tarama başı süre dağılımı,
  - Prometheus + Grafana dashboard’ları ile metrik analizi.

---

## 6. Özet

- Unit testler, kural motoru ve yardımcı fonksiyonların deterministik ve güvenli davranmasını garanti eder.
- Integration testler, gerçekçi ama kontrollü mock web uygulamalarıyla tarama motorunun “uçtan uca” akışını doğrular.
- UAT, kamu kurumlarının gerçek ihtiyaçlarını karşılar şekilde edge case’lerin insan gözetimiyle test edilmesini sağlar.
- Load testleri, platformun ölçeklenebilirliğini ve darboğaz noktalarını görünür kılar.

