## Kamu Web Audit – İkinci Kez Çalıştırma (Hızlı Başlangıç)

Bu dosya, projeyi **daha önce başarıyla kurduktan sonra** tekrar açarken yapman gereken minimum adımları özetler.

> Not: Aşağıdaki adımlar, PostgreSQL 16 container’ının ve Node/Playwright/Next.js kurulumunun ilk seferde yapıldığını varsayar. Eğer makineyi yeniden başlattıysan, sadece Docker container ve `dotnet` / `npm` komutlarını tekrar çalıştırman yeterli.

---

### 1. Proje Klasörüne Geç

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit"
```

---

### 2. PostgreSQL 16 Container’ını (Yeniden) Başlat

Eğer `kamu-audit-db` container’ı zaten çalışıyorsa bu adım hata verebilir; sorun değil. Emin olmak için:

```powershell
docker start kamu-audit-db  # varsa start eder, yoksa hata verir (önemli değil)

# Eğer container yoksa yeniden oluştur:
docker run --name kamu-audit-db -p 5432:5432 `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=kamu_audit `
  -d postgres:16
```

---

### 3. Backend API’yi Çalıştır

Yeni bir PowerShell penceresi aç:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api"

# Gerekli ortam değişkenleri
$env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres"
$env:Jwt__Key = "GelistirmeIcinCokGizliBirAnahtar_EnAz32Karakter"
$env:Runner__WorkingDirectory = "..\..\..\..\..\runner"
$env:Runner__NodePath = "node"
$env:Runner__CliScript = "dist/cli.js"
$env:Cors__Enabled = "true"
$env:Cors__AllowedOrigins__0 = "http://localhost:3000"

dotnet run
```

Bu pencere açık kalmalı. Health check’i kontrol etmek istersen:

```powershell
curl http://localhost:5000/health/ready
```

---

### 4. Frontend (Next.js) Uygulamasını Çalıştır

Başka bir PowerShell penceresi aç:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\frontend"

$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000"

npm run dev
```

Frontend `http://localhost:3000` adresinde çalışacaktır. Bu pencere de açık kalmalı.

> Eğer daha önce `npm install` çalıştırmadıysan veya paketler değiştiyse, bir kez `npm install` çalıştırman gerekir.

---

### 5. Tarayıcıdan Kullanım

1. Tarayıcıda `http://localhost:3000` adresine git.
2. Login/Register ekranından giriş yap.
3. Dashboard’da:
   - `Hedef URL` alanına test etmek istediğin siteyi yaz (örn. `https://example.com`).
   - Gerekirse kimlik bilgisi kutusunu işaretleyip username/password/2FA notu gir.
   - **“Audit Başlat”** butonuna tıkla.
4. Alt taraftaki listeden audit satırına tıklayarak detay ekranını görebilirsin.

Bu adımlar, projeyi her açışında hızlıca tekrar ayağa kaldırmak için yeterlidir.

