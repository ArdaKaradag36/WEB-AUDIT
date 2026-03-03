## Kamu Web Audit – Hızlı Çalıştırma Rehberi (Windows / PowerShell)

Aşağıdaki adımları **sırayla** takip ederek sistemi uçtan uca (backend + runner + frontend) çalıştırabilirsin.

> Not: Bu komutlar Windows + PowerShell içindir. .NET SDK 8.0.418’in kurulu olduğundan emin ol (`dotnet --list-sdks` çıktısında görünmeli).

---

### 1. Proje Klasörüne Geç

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit"
```

---

### 2. PostgreSQL 16 Container’ını Başlat (Docker)

```powershell
docker run --name kamu-audit-db -p 5432:5432 `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=kamu_audit `
  -d postgres:16
```

Bu container arka planda çalışmaya devam edecek; kapatmak için:

```powershell
docker stop kamu-audit-db
```

---

### 3. Backend İçin Ortam Değişkenlerini Ayarla ve Migrations Çalıştır

Yeni bir PowerShell penceresi aç ve:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api"

# Veritabanı bağlantısı
$env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres"

# Geliştirme için JWT anahtarı (en az 32 karakter)
$env:Jwt__Key = "GelistirmeIcinCokGizliBirAnahtar_EnAz32Karakter"

$env:Runner__WorkingDirectory = "..\..\..\..\..\runner"
$env:Runner__NodePath = "node"
$env:Runner__CliScript = "dist/cli.js"

# CORS – frontend için localhost:3000’e izin ver
$env:Cors__Enabled = "true"
$env:Cors__AllowedOrigins__0 = "http://localhost:3000"

# EF Core migrations
dotnet ef database update
```

---

### 4. Runner’ı Hazırla (Node + Playwright)

Aynı ya da farklı bir PowerShell penceresinde:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\runner"

npm ci
npx playwright install --with-deps chromium
npm run build
```

Bu adım sonunda `runner/dist/cli.js` oluşturulmuş ve Playwright kurulmuş olmalıdır.

---

### 5. Backend API’yi Çalıştır

Backend penceresine dön (veya yeni bir tane açıp tekrar env değişkenlerini set et):

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api"

dotnet run
```

Backend varsayılan olarak `http://localhost:5000` adresinde dinler. Bu pencere açık kalmalı.

---

### 6. Frontend (Next.js) Uygulamasını Çalıştır

Yeni bir PowerShell penceresi aç:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\frontend"

$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000"

npm install
npm run dev
```

Frontend `http://localhost:3000` adresinde çalışacaktır. Bu pencere de açık kalmalı.

---

### 7. Tarayıcıdan Uçtan Uca Test

1. Tarayıcıda `http://localhost:3000` adresine git.
2. Login/Register ekranında:
   - E‑posta ve şifre ile kayıt ol, ardından giriş yap.
3. Dashboard ekranında:
   - “Hedef URL” alanına test etmek istediğin siteyi yaz (ör. `https://example.com`).
   - Giriş gerektiren siteler için “kimlik bilgisi kullan” kutusunu işaretleyip username/password/2FA notu girebilirsin (opsiyonel).
   - “Audit Başlat” butonuna tıkla.
4. Alt taraftaki tabloda yeni audit satırını göreceksin; satıra tıklayarak detay sayfasına gidip status/metrics, findings ve gaps tablolarını görebilirsin.

Bu adımları takip ederek sistemi her seferinde hızlıca ayağa kaldırabilirsin.

