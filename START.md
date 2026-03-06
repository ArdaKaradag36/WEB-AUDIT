## Kamu Web Audit – Sıfırdan Çalıştırma Rehberi 🚀

Bu dosya, **projeyi ilk kez gören birinin**, temiz bir Windows 10/11 makinede bu repoyu klonlayıp **uçtan uca çalıştırabilmesi** için hazırlandı.

Eğer projeyi daha önce kurduysan ve sadece yeniden ayağa kaldırmak istiyorsan, detaylı komutlar için `README.md` dosyasına da bakabilirsin.  
Ama **sadece bu dosyayı izleyerek** de sistemi çalışır hale getirebilmelisin.

---

### Şu anki durum (local health)

- Backend (`dotnet build`, `dotnet test`) ve runner (`npm test`) tüm testleri şu an **geçiyor**.
- Frontend tarafında `npm run lint` ve `npm run build` CI’da yeşil; lokal olarak da bu dosyadaki adımları izleyerek sorunsuz ayağa kalkması bekleniyor.
- Eğer adımları izlerken bir hata veya boş ekran görürsen, lütfen:
  - Hangi komutun hata verdiğini,
  - Terminal/log çıktısını
  - Ve mümkünse hangi URL’de/paydload’da olduğunu
  not edip bana ilet; birlikte kalıcı bir fix’e çeviririz.

---

### 0. Gerekli Kurulumlar (Bir Kere Yapılır)

- **Git**  
  `https://git-scm.com/downloads` adresinden indir ve kur.

- **Docker Desktop** (PostgreSQL için tavsiye olunur)  
  `https://www.docker.com/products/docker-desktop/` adresinden indir ve kur.  
  Kurulumdan sonra Docker Desktop’ı aç ve çalıştığından emin ol.

- **.NET SDK 8**  
  `https://dotnet.microsoft.com/en-us/download/dotnet/8.0`  
  En az `8.0.x` SDK yüklü olmalı.

- **Node.js 20 LTS**  
  `https://nodejs.org/en/download` üzerinden **20.x LTS** kurulu olmalı.

Kurulumlardan sonra yeni bir PowerShell penceresi açıp şu komutların çalıştığını kontrol edebilirsin:

```powershell
dotnet --version
node --version
npm --version
docker --version
```

---

### 1. Repoyu Klonla (veya klasöre gir)

Eğer repo henüz makinede yoksa:

```powershell
cd "C:\Users\karad\Desktop"
git clone https://github.com/.../kamu-web-audit.git   # gerçek URL’yi kullan
cd "C:\Users\karad\Desktop\kamu-web-audit"
```

Eğer repo zaten varsa:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit"
git pull   # (opsiyonel) En son değişiklikleri almak için
```

---

### 2. PostgreSQL 16 Container’ını Çalıştır

Docker Desktop açıkken, **yeni bir PowerShell penceresinde**:

```powershell
docker run --name kamu-audit-db -p 5432:5432 `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=kamu_audit `
  -d postgres:16
```

> Eğer container daha önce oluşturulduysa ve çalışmıyorsa:
>
> ```powershell
> docker start kamu-audit-db
> ```

---

### 3. Runner’ı (Node.js + Playwright) Hazırla

Runner, gerçek tarayıcı üzerinden denetimleri yapan Node.js uygulamasıdır.  
İlk kurulumda **Playwright tarayıcılarını indirmen** gerekir.

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\runner"

npm ci
npx playwright install --with-deps chromium
npm run build
```

Bu adım sonunda `runner\dist\cli.js` oluşmuş olmalı.

---

### 4. Backend (ASP.NET 8 API) İçin Ortamı Hazırla

Backend, audit kayıtlarını, kuyruğu ve raporları yöneten ASP.NET Core API’dir.

Yeni bir PowerShell penceresinde:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api"

# Veritabanı bağlantısı
$env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit;Username=postgres;Password=postgres"

# Geliştirme için JWT anahtarı (en az 32 karakter)
$env:Jwt__Key = "GelistirmeIcinCokGizliBirAnahtar_EnAz32Karakter"

# Runner konumu (bu repodaki Node runner ile entegre)
$env:Runner__WorkingDirectory = "..\..\..\..\runner"
$env:Runner__NodePath = "node"
$env:Runner__CliScript = "dist/cli.js"

# CORS – frontend için localhost:3000’e izin ver
$env:Cors__Enabled = "true"
$env:Cors__AllowedOrigins__0 = "http://localhost:3000"
```

#### 4.1. Veritabanı Şemasını Oluştur (EF Migrations)

```powershell
dotnet ef database update
```

Bu komut:
- `audit_runs`, `findings`, `gaps`, `users` vb. tüm tabloları oluşturur.

#### 4.2. Backend’i Çalıştır

```powershell
dotnet run
```

Backend artık `http://localhost:5000` adresinde çalışıyor olmalı.  
Bu pencere **açık kalmalı**, kapatırsan API durur.

İstersen health check’i test edebilirsin:

```powershell
curl http://localhost:5000/health/ready
```

---

### 5. Frontend (Next.js 14) Uygulamasını Çalıştır

Frontend, kullanıcı arayüzünü sağlayan Next.js uygulamasıdır.

Yeni bir PowerShell penceresinde:

```powershell
cd "C:\Users\karad\Desktop\kamu-web-audit\frontend"

# Backend adresini frontend’e tanıt
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000"

# Bağımlılıkları yükle (ilk seferde)
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

Frontend `http://localhost:3000` adresinde çalışacaktır.  
Bu pencere de **açık kalmalı**.

---

### 6. Tarayıcıdan Uçtan Uca Kullanım

Artık hem backend hem frontend hem de runner hazır.  
Şimdi tarayıcıdan ilk audit’ini çalıştırabilirsin.

1. Tarayıcıda `http://localhost:3000` adresine git.
2. **Login / Register** ekranı gelir:
   - E‑posta ve şifre gir.
   - Eğer kullanıcı yoksa önce “Kayıt” sekmesinden kullanıcı oluştur,
   - Sonra “Giriş” sekmesiyle login ol.
3. Giriş yaptıktan sonra **Dashboard** sayfasına yönlendirilirsin:
   - `Hedef URL` alanına test etmek istediğin siteyi yaz (örneğin `https://example.com`).
   - Gerekirse “kimlik bilgisi kullan” kutusunu işaretleyip username/password/2FA notu gir (opsiyonel).
   - **“Audit Başlat”** butonuna tıkla.
4. Sayfanın altındaki listede yeni audit satırını görürsün:
   - Durum `queued` → `running` → `completed/failed` olarak güncellenir.
5. Satıra tıklayarak `/audits/{id}` detaya git:
   - Özet metrikleri,
   - Findings (bulgular) tablosunu,
   - Gaps (boşluklar) tablosunu,
   - Varsa export / indirme aksiyonlarını görebilirsin.

Bu noktada sistem **uçtan uca çalışır** durumdadır.

---

### 7. Sonraki Açılışlarda Ne Yapmalıyım?

Makineyi kapatıp açtığında **sıfırdan kurulum yapmana gerek yok**.  
Genelde şu adımlar yeterlidir:

1. Docker Desktop’ı aç.
2. PostgreSQL container’ını başlat:

   ```powershell
   docker start kamu-audit-db
   ```

3. Backend için:

   ```powershell
   cd "C:\Users\karad\Desktop\kamu-web-audit\backend\KamuAudit.Api"
   dotnet run
   ```

4. Frontend için:

   ```powershell
   cd "C:\Users\karad\Desktop\kamu-web-audit\frontend"
   npm run dev
   ```

İlk kurulumda yaptığın `npm install`, `npm ci`, `playwright install`, `dotnet ef database update` vb. adımları tekrar etmen gerekmez (ta ki bağımlılıklar veya şema değişene kadar).

---

### 8. Sık Karşılaşılan Sorunlar (Kısa)

- **Sorun:** `docker: command not found`  
  **Çözüm:** Docker Desktop kurulu ve çalışır durumda olmalı. Kurup tekrar PowerShell aç.

- **Sorun:** Backend `dotnet run` çalışırken veritabanına bağlanamıyor  
  **Çözüm:** `kamu-audit-db` container’ı çalışıyor mu kontrol et:

  ```powershell
  docker ps
  ```

  Listede yoksa:

  ```powershell
  docker start kamu-audit-db
  ```

- **Sorun:** Frontend API’ye bağlanamıyor (`5000` portu hatası)  
  **Çözüm:** Backend’in açık olduğundan ve `NEXT_PUBLIC_API_BASE_URL` değerinin `http://localhost:5000` olduğundan emin ol.

---

Bu dosyadaki adımları sırasıyla izlersen, projeyi **sıfırdan bilmeyen biri olarak bile** birkaç dakika içinde ayağa kaldırabilir ve ilk audit’ini çalıştırabilirsin. İleri seviye ayarlar ve mimari detaylar için `README.md` ve `docs/` klasörüne bakabilirsin.

