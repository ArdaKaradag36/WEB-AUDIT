⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

Last updated: 2026-03-05

## Kamu Web Audit – Ürün Güvenliği (Özet)

> Ayrıntılı İngilizce sürüm: `SECURITY_EN.md`.

Bu doküman, **kamu web sitelerini tarayan** Kamu Web Audit platformunun kendisi için alınan
güvenlik önlemlerini özetler. Amaç; hem ürün mimarisini korumak hem de yanlış konfigürasyon
veya kötüye kullanım risklerini azaltmaktır.

---

### 1. Credential Güvenliği (Şifreleme + Anahtar Döngüsü)

- **Credential saklama**:
  - Hedef uygulama kimlik bilgileri (`AuditTargetCredential`) **plaintext olarak tutulmaz**.
  - Uygulama, ASP.NET Core **DataProtection** altyapısını kullanan
    `DataProtectionCredentialProtector` implementasyonuyla şifreleme yapar:
    - `EncryptedPassword = protector.Protect(plaintext)`.
    - Şifre çözme yalnızca runner başlatılırken yapılır.
- **Anahtar yönetimi**:
  - DataProtection anahtarları, üretim ortamında:
    - Lokal disk yerine **paylaşılan bir key store**’da tutulmalıdır
      (örn. Azure Key Vault, AWS KMS + S3, kurum içi HSM).
  - Anahtar döngüsü (key rotation) için öneri:
    - DataProtection’ın **key lifetime** parametresi (örn. 90 gün) ile otomatik yeni anahtar üretimi.
    - Eski anahtarlar yalnızca **decryption** için tutulur; süresi dolan anahtarların temizliği
      ayrı bir operasyon adımı olarak planlanır.
  - Runner ile paylaşılan şifreler:
    - .NET backend, runner process’ine sadece **kısa ömürlü plaintext credential** geçirir
      (process argümanı veya env var); runner bu bilgiyi dosyaya yazmaz.

---

### 2. JWT ve Oturum Yönetimi

- Mevcut sürüm:
  - UI, backend’den aldığı **JWT’yi Authorization: Bearer** header’ı ile kullanır.
  - Uzun vadeli hedef (bkz. `0002-auth-cookie-vs-localstorage` ADR):
    - Access token’ların **HttpOnly + Secure + SameSite** cookie’lerinde tutulması,
    - Refresh token’ların server-side kontrollü yaşam döngüsü ile yönetilmesi.
- **LocalStorage vs HttpOnly cookie**:
  - LocalStorage:
    - **XSS durumunda token çalınmasına** açıktır.
    - Uygulama kodu içinde token’a direkt erişim vardır.
  - HttpOnly cookie:
    - JS tarafından okunamaz; XSS sonrası token exfiltration riskini azaltır.
    - CSRF’ye karşı koruma için:
      - SameSite=Lax/Strict,
      - Gerekirse ek CSRF token’i ile birlikte kullanılması önerilir.

Detaylar için: `docs/architecture/adr/0002-auth-cookie-vs-localstorage.md`.

---

### 3. RBAC ve Erişim Kontrolü

- Roller:
  - **Admin**:
    - Tüm kullanıcı ve scan’leri görebilir.
    - Sistem konfigürasyonunu yönetebilir (rule pack, rate limit, policy).
  - **User (QA / Engineer)**:
    - Sadece **kendi oluşturduğu** scan’leri görebilir.
    - Hedef/credential tanımları kendi yetkisi dahilinde.
  - **Auditor**:
    - Okuma yetkisi geniş ama yazma yetkisi kısıtlı:
      - Scan başlatma yetkisi opsiyonel,
      - Rapor okuma yetkisi yaygın.
- Erişim enforcement:
  - Backend `AuditRunService`:
    - `GetListAsync` ve `GetByIdAsync` içinde:
      - `!isAdmin && userId.HasValue` ise sadece ilgili `UserId`’ye ait run’lar.
  - Findings / gaps / summary uçları:
    - Controller’da `GetCurrentUser()` ile alınan `userId` ve `isAdmin` bilgisi
      service çağrılarına parametre olarak geçer.

---

### 4. Rate Limiting

- ASP.NET Core `RateLimiter` ile üç ana politika:
  - **AuthPolicy** – `/api/Auth/register`, `/api/Auth/login`:
    - IP başına dakika bazlı limit (örn. 10–20 istek/dk).
  - **AuditCreatePolicy** – `/api/Audits` (scan create):
    - IP başına sınırlı sayıda yeni scan (örn. 5–10 istek/dk).
  - **Rapor/Export** (opsiyonel) – CSV ve büyük rapor uçları:
    - `/api/Audits/{id}/gaps.csv` için aynı `AuditCreatePolicy` veya ayrı bir
      `ReportPolicy` kullanılabilir.
- Limit aşımı:
  - HTTP `429 Too Many Requests`,
  - `Retry-After` header’ı ve JSON body
    `{"error":"rate_limited","retryAfterSeconds":N}` ile yanıt.

---

### 5. SSRF Koruması (Target URL Guard)

 - Tarama hedefi, kullanıcı tarafından sağlanan bir URL’dir (`TargetUrl`).
   - Bu URL’nin:
     - `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`,
     - Bulut metadata IP’leri (`169.254.169.254` vb.),
     - RFC1918 private aralıkları (`10/8`, `172.16/12`, `192.168/16`),
     - IPv4 link-local (`169.254/16`),
     - IPv6 link-local (`fe80::/10`) ve unique local (`fc00::/7`)
   gibi **iç veya hassas servisleri** göstermesi engellenmelidir.
- Backend tarafında:
  - `AuditRunService.CreateAsync` içinde:
    - `Uri.TryCreate` sonrası `TargetUrlGuard.IsAllowed` ile host kontrolü yapılır.
    - Riskli host’lar için:
      - `400 BadRequest` döndürülür (kullanıcıya açıklayıcı mesaj).
- Guard mantığı, `backend/KamuAudit.Tests/TargetUrlGuardTests.cs` içinde en az 12 adet deterministik unit test ile güvence altındadır.
- Gelecek adım:
  - Config tabanlı allowlist/denylist:
    - `Security:OutboundAllowlist` (explicit domain’ler),
    - `Security:OutboundDenylist` (ek iç IP aralıkları).
  - DNS resolution ile IP bazlı kontrol (örn. RFC1918, link-local, loopback).

---

### 6. Runner Sandbox ve Tarayıcı Güvenliği

- Playwright context:
  - `acceptDownloads: false` (indirilebilir dosyalar devre dışı),
  - Yalnızca HTTP/HTTPS,
  - Proxy veya sistem ayarları üzerinden kontrol edilen outbound.
- Süreç izolasyonu:
  - Runner, production’da:
    - Ayrı bir kullanıcı hesabı altında,
    - Sınırlı dosya erişimi (sadece `reports/runs/**` altında),
    - Tercihen container (Kubernetes pod / container) içinde çalıştırılmalıdır.
- Güvenlik ilkesi:
  - Tarama sırasında **asla destructive aksiyonlar** (örneğin veri silme, yazma) yapılmaz;
  - Form scanner ve crawler sadece non-destructive GET ve limitli probe’lar kullanır.

---

### 7. Bağımlılık Güvenliği ve Açık Yönetimi

- **Dependabot** (`.github/dependabot.yml`):
  - `backend/**` için NuGet,
  - `runner/**` için npm paketleri.
- **Security Audit workflow** (`.github/workflows/security-audit.yml`):
  - `.NET`: `dotnet list package --vulnerable --include-transitive`
  - Node: `npm audit --audit-level=high`
- Önerilen SLA’ler:
  - Kritik: 24 saat içinde triage, 3 gün içinde fix/mitigasyon.
  - Yüksek: 3 gün içinde triage, 7 gün içinde fix.
  - Orta: 7 gün içinde triage, 30 gün içinde fix.

---

### 8. Güvenlik Açıklarının Bildirilmesi

- Kamuya açık GitHub issue yerine, kurum içi güvenlik kanalı (örn. `security@...`) üzerinden bildirin.
- Şu bilgileri ekleyin:
  - Sorunun açıklaması ve etkisi,
  - Tekrar üretim adımları,
  - Önerilen çözüm veya mitigasyonlar (varsa).

Detaylar ve örnek komutlar için İngilizce dokümana bakınız: `SECURITY_EN.md`.

