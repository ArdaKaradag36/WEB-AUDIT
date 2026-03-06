## Kamu Web Audit

Last updated: 2026-03-05

Kamu Web Audit, kamu kurumlarının web sitelerini **tarayıcı tabanlı otomatik denetimlerle** analiz eden bir SaaS ürünüdür.  
Amaç; güvenlik, teknik sağlık ve UI davranışları hakkında **tekrarlanabilir ve ölçülebilir** raporlar üretmek ve bunları modern bir web arayüzü üzerinden sunmaktır.

---

### Özellikler

- **Otomatik web denetimi**: Node.js 20 + Playwright ile gerçek tarayıcı üzerinden gezinme ve kontroller.
- **Çoklu kullanıcı ve rol desteği**: JWT tabanlı kimlik doğrulama, rol bazlı yetkilendirme (QA, Developer, Security, Admin).
- **Kuyruklu çalıştırma**: Arka plan worker ile `queued → running → completed/failed` durum makinesi.
- **Raporlama**: Findings/gaps tabloları, özet metrikler ve detay sayfaları.
- **Gözlemlenebilirlik**: `/metrics`, `/health/*`, OpenTelemetry entegrasyonu.
- **Opsiyonel credential desteği**: Giriş gerektiren hedef siteler için şifrelenmiş credential saklama ve runner’a güvenli aktarım.

---

### Mimari Genel Bakış

- **Backend (.NET 8 Web API)**  
  JWT auth, audit kuyruğu, arka plan worker, JSON ingest, metrikler ve health check uçları.

- **Runner (Node.js 20 + Playwright)**  
  Hedef siteyi gerçek tarayıcı ile denetler, JSON raporlar (`summary`, `findings`, `gaps`, `ui-inventory`) üretir.

- **Veritabanı (PostgreSQL 16)**  
  `audit_runs`, `findings`, `gaps` ve isteğe bağlı credential kayıtları için kalıcı saklama.

- **Frontend (Next.js + TypeScript)**  
  Login, dashboard ve audit detay ekranları; backend API’lerini çağırır ve JWT ile yetkilendirme yapar.

---

### Tech Stack

- **Backend**: ASP.NET Core 8, EF Core, Serilog, OpenTelemetry
- **Runner**: Node.js 20, TypeScript, Playwright
- **Frontend**: Next.js 14, React 18, TypeScript
- **Veritabanı**: PostgreSQL 16
- **CI/CD**: GitHub Actions, Dependabot, güvenlik taramaları

---

### Nasıl Çalışır? (Kısa)

1. Kullanıcı, web arayüzünde e‑posta ve şifresiyle giriş yapar.
2. Dashboard üzerinden hedef URL (ve isteğe bağlı kimlik bilgileri) ile yeni bir audit oluşturur.
3. Backend, isteği kuyruğa alır; arka plan worker sıradaki işi alır ve Playwright runner’ı çalıştırır.
4. Runner, siteyi gezer, bulguları ve UI boşluklarını JSON raporlar olarak yazar.
5. Backend, bu raporları PostgreSQL’e işler ve metrikleri günceller.
6. Kullanıcı, dashboard ve detay sayfalarından audit durumunu, bulguları ve metrikleri görüntüler.

---

### Lokal Çalıştırma (Özet)

- **Gereksinimler**
  - .NET SDK 8.0.418
  - Node.js 20.x LTS
  - Docker (Postgres 16 için, yerel geliştirmede önerilir)

- **Backend**

```bash
cd backend/KamuAudit.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres"
dotnet user-secrets set "Jwt:Key" "GeliştirmeIçinGüçlüBirAnahtar_EnAz32Karakter"
dotnet ef database update
dotnet run
```

- **Runner**

```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

- **Frontend**

```bash
cd frontend
npm install
npm run dev
```

Backend varsayılan olarak `http://localhost:5000`, frontend ise `http://localhost:3000` adresinde çalışacak şekilde tasarlanmıştır.  
Frontend, `NEXT_PUBLIC_API_BASE_URL` ortam değişkeni ile backend adresine işaret eder (lokalde `http://localhost:5000`).

---

### Adım Adım: Sistemi Uçtan Uca Çalıştırma

Aşağıdaki adımları sırayla izleyerek **frontend’ten URL yapıştırıp audit çalıştırabileceğin** bir ortam kurabilirsin.

#### 1. Depo Klasörüne Geç

```bash
cd c:\Users\karad\Desktop\kamu-web-audit
```

#### 2. PostgreSQL 16 Çalıştır (Docker ile)

```bash
docker run --name kamu-audit-db -p 5432:5432 `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=kamu_audit `
  -d postgres:16
```

#### 3. Backend Ortam Değişkenlerini Ayarla

PowerShell’de (aynı terminalde):

```powershell
cd backend/KamuAudit.Api

$env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres"
$env:Jwt__Key = "GelistirmeIcinCokGizliBirAnahtar_EnAz32Karakter"

# Runner ayarları (repo yapısı ile uyumlu)
$env:Runner__WorkingDirectory = "..\..\..\..\runner"
$env:Runner__NodePath = "node"
$env:Runner__CliScript = "dist/cli.js"

# CORS – frontend için localhost:3000’e izin ver
$env:Cors__Enabled = "true"
$env:Cors__AllowedOrigins__0 = "http://localhost:3000"
```

#### 4. EF Migrations Uygula

```powershell
cd c:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api
dotnet ef database update
```

Bu komut, `audit_runs`, `users`, `findings`, `gaps` ve `audit_target_credentials` dâhil tüm şemayı hazırlar.

#### 5. Runner’ı Hazırla

```powershell
cd c:\Users\karad\Desktop\kamu-web-audit\runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

Bu adım sonunda `runner/dist/cli.js` oluşturulmuş ve Playwright tarayıcıları kurulmuş olmalıdır.

#### 6. Backend’i Çalıştır

```powershell
cd c:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api
dotnet run
```

Backend `http://localhost:5000` adresinde dinleyecektir. Bu terminali açık bırak.

#### 7. Frontend’i Çalıştır

Yeni bir PowerShell penceresinde:

```powershell
cd c:\Users\karad\Desktop\kamu-web-audit\frontend

$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000"

npm install
npm run dev
```

Frontend `http://localhost:3000` adresinde çalışacaktır.

#### 8. Tarayıcıdan Uçtan Uca Akış

1. `http://localhost:3000` adresine git.
2. Login/Register ekranında:
   - E‑posta ve şifre gir.
   - İstersen önce “Kayıt” sekmesiyle kullanıcı oluştur, sonra “Giriş” sekmesiyle login ol.
3. Başarılı girişten sonra **Dashboard** sayfasına yönlendirilirsin:
   - `Hedef URL` alanına test etmek istediğin siteyi yaz (örneğin `https://example.com`).
   - Giriş gerektiren siteler için “kimlik bilgisi kullan” kutusunu işaretleyip username/password/2FA notu doldurabilirsin (opsiyonel).
   - “Audit Başlat” butonuna bas.
4. Alt taraftaki **audit listesi** tablosunda yeni audit kaydını görürsün.
5. Bir satıra tıklayarak `/audits/{id}` sayfasına geç:
   - Audit detayları (durum, süre, link metrikleri),
   - Findings tablosu,
   - Gaps tablosu frontend üzerinden backend API’lerinden ( `/api/Audits/*` ) çekilerek gösterilir.

Bu adımlar tamamlandığında, frontend arayüzünden URL yapıştırıp audit başlatabilir ve sonuçları aynı ekranda görebilirsin.

---

### Production Hazırlığı

- JWT anahtarı (`Jwt__Key`) zorunlu ve minimum uzunluk kontrolüne tabi.
- Rate limiting, login ve audit oluşturma uçlarına uygulanabilir.
- CORS, sadece güvenilen frontend origin’lerini (`Cors__AllowedOrigins`) kabul edecek şekilde yapılandırılabilir.
- `/metrics` ve `/health/*` uçları, Prometheus ve load balancer health check’leri için hazırdır.
- İç runbook ve indeks dokümanları, `docs/internal` altında tutulur.
 - PostgreSQL migration’ları için operasyonel playbook: `docs/db/MIGRATIONS_PLAYBOOK.md`
   - CI, Testcontainers Postgres üzerinde tüm EF migration set’ini her run’da sıfırdan deneyerek **migration dry-run** yapar.
   - Gerçek staging/prod rehearsal ve apply adımları için `MIGRATIONS_PLAYBOOK.md` içindeki “Staging Rehearsal” bölümüne bakılmalıdır.

---

### Dokümantasyon

- **Genel dokümantasyon index’i**: `docs/README.md`
- **Public ürün dokümantasyonu** (kullanıcı / iş birimi odaklı):
  - `docs/public/SYSTEM_OVERVIEW_TR.md`
  - `docs/public/HOW_IT_WORKS_TR.md`
  - `docs/public/DEPLOYMENT_OVERVIEW_TR.md`
  - `docs/public/SECURITY_OVERVIEW_TR.md`
  - `docs/public/SCOPE.md`
  - `docs/public/USAGE.md`
- **İç teknik dokümantasyon** (mimari, API, test, güvenlik):
  - `docs/internal/ARCHITECTURE.md`
  - `docs/internal/API.md`
  - `docs/internal/QA.md`
  - `docs/security/SECURITY.md`
  - `docs/ops/OBSERVABILITY.md`
  - `docs/ci/CI.md`
  - `docs/ui/UI_SPEC.md`

---

### Lisans

Bu proje, MIT lisansı ile lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakabilirsiniz.

