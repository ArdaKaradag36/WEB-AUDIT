# Kamu Web Audit – CI Standartları

Bu doküman, Kamu Web Audit projesi için **Continuous Integration (CI)** standartlarını tanımlar.

Hedefler:

- Lint + format + unit/integration testlerini her PR’da otomatik çalıştırmak,
- Örnek rapor ve log artefaktlarını saklamak,
- Bağımlılık güvenliğini periyodik olarak tarayıp raporlamak,
- Orta vadede kod coverage ve güvenlik politikalarına göre pipeline’ı fail ettirebilecek bir temel hazırlamak.

---

## 1. Workflow Genel Bakış

Ana workflow: `.github/workflows/ci.yml`

Trigger:

- `push` ve `pull_request` (branch: `main`, `master`).

Jobs:

- **backend** – .NET API için build + test.
- **runner** – Node + Playwright runner için lint + unit/integration tests.
- **frontend** – Next.js frontend için lint + build.
- **security-audit** – .NET ve npm bağımlılık güvenlik taramaları (raporlayıp geçer; fail policy ileride).

---

## 2. Backend Job (backend/.NET)

- Yol: `backend/KamuAudit.Api/`
- Adımlar:
  1. `actions/checkout@v4`
  2. `actions/setup-dotnet@v4` (`global.json` kullanılarak).
  3. `dotnet restore backend/KamuAudit.Api/KamuAudit.Api.csproj`
  4. `dotnet build ... -c Release --no-restore`
  5. `dotnet test backend/KamuAudit.Tests/KamuAudit.Tests.csproj -c Release --no-build --verbosity normal` (varsa).
  6. Test artefaktlarının (ör. `TestResults/**`) `backend-test-artifacts` adıyla upload edilmesi.

> Coverage: Şu an yalnızca test sonuçları toplanıyor. Orta vadede `coverlet` veya benzeri bir aracın entegre edilmesiyle
> coverage raporu üretilecek ve minimum threshold (örn. %70 line coverage) tanımlanacaktır.

---

## 3. Runner Job (Node + Playwright)

- Yol: `runner/`
- Adımlar:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node sürümü `.nvmrc`’den, npm cache aktif).
  3. `npm ci`
  4. `npm run lint`
  5. `npm test` – Jest yerine Playwright test runner; unit ve integration testler birlikte koşar:
     - `domScan.spec.ts`, `httpAnalyzer.spec.ts`, `jsAnalyzer.spec.ts`,
     - `urlNormalizer.spec.ts`, `formAnalyzer.spec.ts`, `crawlerIntegration.spec.ts`,
     - `ruleEngineIntegration.spec.ts`, `smoke.spec.ts` (opsiyonel).
  6. Artefakt upload:
     - `test-results/**` (Playwright test raporları),
     - `reports/runs/**` (lokal run raporları – eğer testler sırasında üretilirse).

> Coverage: Playwright test runner şu an coverage üretmiyor; ileride ek bir araç (nyc/istanbul) ile
> coverage raporlaması eklenecek ve minimum threshold projeye özgü belirlenecek.

---

## 4. Frontend Job (Next.js)

- Yol: `frontend/`
- Adımlar:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (`runner/.nvmrc` ile aynı Node sürümü).
  3. `npm ci`
  4. `npm run lint`
  5. `npm run build`

Bu job, API/runner’dan bağımsız olarak frontend’in en azından lint/build seviyesinde sağlıklı kalmasını sağlar.

---

## 5. Security Audit Job (Dependency Security – Raporlayıcı)

Job adı: `security-audit`  
Bağlılık: `needs: [backend, runner]` – sadece ana işler geçtikten sonra çalışır.

Adımlar:

- .NET:
  - `dotnet restore backend/KamuAudit.Api`
  - `dotnet list package --vulnerable --include-transitive` (**continue-on-error: true**)
- Node:
  - `npm ci` (runner)
  - `npm audit --audit-level=high` (**continue-on-error: true**)
- Özet:
  - `GITHUB_STEP_SUMMARY` üzerinden:
    - Hangi komutların çalıştırıldığı,
    - Şu an **pipeline’ı fail etmediği**, ancak gelecekte severity/yaş eşiği ile fail politikası eklenebileceği belirtilir.

> Fail Policy (gelecek):
>
> - Kritik zafiyetler (CVSS >= 9.0) ve/veya **High** zafiyetler 7 günden fazla open kaldığında:
>   - Güvenlik ekibinin onayıyla CI’nin bu job’ı **fail** edecek şekilde konfigüre edilmesi planlanmaktadır.

---

## 6. Artefakt Standartları

CI her koşuda aşağıdaki artefaktları toplamaya çalışır:

- **Backend**:
  - `backend-test-artifacts`:
    - `**/TestResults/*` gibi test çıktıları (trx/log).
- **Runner**:
  - `runner-test-artifacts`:
    - `test-results/**` – Playwright raporları,
    - `reports/runs/**` – JSON rapor örnekleri ve log’lar (testler veya ayrı bir job bu klasörleri doldurursa).

Bu artefaktlar, pipeline sonrası:

- Flaky testlerde debugging,
- Örnek rapor JSON’larının manuel incelenmesi,
- Gelecekteki analiz araçları (coverage, security, kalite raporları) için temel oluşturur.

---

## 7. Gelişim Alanları

1. **Coverage Enforcement**
   - .NET: `coverlet` veya yerleşik code coverage ile JUnit/Cobertura formatında rapor üretip,
     örneğin `%70` line + `%60` branch coverage altında job’ı fail etmek.
   - Runner: JS/TS coverage için `nyc` entegrasyonu.
2. **Static Analysis / SAST**
   - GitHub CodeQL veya Semgrep gibi araçların entegrasyonu.
3. **Daha Zengin Artefaktlar**
   - HTML test raporları, coverage raporları, örnek PDF rapor çıktıları (ileride).

Bu doküman, `.github/workflows/ci.yml` ile senkron tutulmalıdır. Pipeline’a yeni adımlar eklendikçe,
ilgili bölümler güncellenmelidir.

