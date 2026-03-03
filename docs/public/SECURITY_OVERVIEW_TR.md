## Kamu Web Audit – Güvenlik Genel Bakışı (Public)

Bu doküman, Kamu Web Audit ürününün **yüksek seviyeli güvenlik modelini** özetler.  
Amaç; güvenlik ekiplerine ve ürün sahiplerine, sistemin temel koruma katmanlarını anlaşılır şekilde aktarmaktır.

---

### 1. Kimlik Doğrulama (Authentication)

- Sistem, HTTP isteklerini **JWT (JSON Web Token)** ile korur.
- Kullanıcı akışı:
  1. Kullanıcı e‑posta + şifre ile giriş yapar.
  2. Backend, doğrulama sonrası imzalı bir JWT üretir.
  3. Tarayıcı, bu token’ı sonraki isteklerde `Authorization: Bearer <token>` başlığı ile gönderir.
- Token içeriği:
  - `sub` / `NameIdentifier` → Kullanıcı ID’si
  - `email`
  - `role` (örn. QA, Developer, Security, Admin)

**JWT Anahtarı (Signing Key)**

- Üretim ortamında, simetrik imza anahtarı sadece ortam değişkeninden okunur (`Jwt__Key`).  
- Anahtar:
  - En az **32 karakter**, tercihen **64+ karakter** olmalıdır.
  - Ayarlı değilse veya çok kısaysa, uygulama **başlatılmaz** (fail-fast).

---

### 2. Yetkilendirme (Authorization) ve Roller

- Tüm audit CRUD uçları, **rollerle** korunur.
- Örnek rolleri:
  - **QA** – Kendi oluşturduğu audit’leri görebilir ve yeni audit başlatabilir.
  - **Developer / Security** – Tipik olarak aynı kapsamda, teknik kullanıcılar.
  - **Admin** – Gerekirse tüm kullanıcıların audit’lerini görebilen yönetici rolü.
- Controller seviyesinde `[Authorize]` ve rol/policy tabanlı kurallar kullanılır.

Bu sayede çoklu kullanıcı senaryosunda, her audit run **ilgili kullanıcıya ait** olacak şekilde sınırlandırılabilir.

---

### 3. Rate Limiting (İstek Sınırlama)

Aşağıdaki kritik uçlar için uygulama katmanında rate limiting uygulanabilir:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/Audits` (ve `POST /api/audits/with-credentials`)

Örnek politika:

- Login için IP başına dakikada **10 istek**
- Audit oluşturma için IP başına dakikada **5 istek**

Limit aşıldığında:

- HTTP **429** (Too Many Requests) döner
- JSON cevap: `{ "error": "rate_limited", "retryAfterSeconds": X }`
- `Retry-After` başlığı ayarlanır

Bu mekanizma, brute-force girişimleri ve kötü niyetli yüksek hacimli istekleri sınırlamak için tasarlanmıştır.

---

### 4. Hassas Veriler ve Kimlik Bilgileri

Ürün, bazı hedef siteler için **login gerektiren** akışları destekleyebilir. Bu durumda:

- Kullanıcı, audit oluştururken isteğe bağlı olarak:
  - `Username`
  - `Password` (hedef siteye ait)
  - `TwoFactorNote` (ör. “SMS ile gelen kodu manuel giriniz”)
  bilgisini sunabilir.
- Bu bilgiler backend’de:
  - **Şifrelenmiş** olarak saklanır (ASP.NET Data Protection veya benzeri bir mekanizma ile),
  - **Hiçbir zaman plaintext** olarak loglanmaz veya API üzerinden geri dönülmez,
  - Sadece runner’a, audit çalıştırma anında güvenli bir şekilde aktarılır.

Bu yaklaşım, hedef sitelere giriş için gerekli kimlik bilgilerinin **sadece geçici olarak kullanılıp**, kalıcı olarak korunmasını sağlar.

---

### 5. Gözlemlenebilirlik ve Güvenlik İzleme

Güvenlik açısından kritik olan bazı metrikler:

- **Denetim kuyruğu derinliği** – Sistem yetişebiliyor mu?
- **Başarısızlık oranı** – Yapısal bir hata mı var?
- **Runner zaman aşımı sayıları** – Hedef siteler çok mu yavaş, yoksa runner mı sıkışıyor?
- **Ingestion hataları** – Rapor dosyaları eksik mi veya yanlış mı?

Bu metrikler `/metrics` ucu üzerinden Prometheus formatında sunulur ve:

- Uyarı üretmek (alert),
- Trend analizi yapmak,
- Olay incelemelerinde (post-mortem) kullanılmak için kullanılabilir.

---

### 6. Yüzey Alanı ve En İyi Uygulamalar

- **TLS zorunlu** – Tüm dış erişimler HTTPS üzerinden olmalıdır.
- **CORS** – Sadece bilinen front-end origin’leri (`Cors__AllowedOrigins`) izinli olmalıdır.
- **Log yönetimi** –
  - Parola, token, hassas payload içerikleri log’lara yazılmamalıdır.
  - Loglar merkezi ve erişimi kontrol edilen bir sisteme aktarılmalıdır.
- **Güncelleme ve zafiyet yönetimi** –
  - NuGet ve npm bağımlılıkları için otomatik güvenlik taramaları çalıştırılır (Dependabot + security workflow).
  - Kritik ve yüksek önem seviyesindeki bulgular için kısa süreli SLA’ler tanımlanmalıdır.

---

### 7. Detaylı Güvenlik Dokümantasyonu

Bu sayfa, sadece **kavramsal** bir güvenlik özeti sunar.  
Şu başlıklar, iç dokümantasyonda detaylı olarak ele alınır:

- Kimlik bilgisinin nasıl şifrelendiği
- Runner’a credential aktarım kanalı
- Rate limiting ve loglama stratejisi
- CI pipeline’larında güvenlik taramaları

Bu iç dokümanlar, yalnızca teknik ekipler için hazırlanmış ve depo içinde **“⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC”** ibaresiyle işaretlenmiştir.

