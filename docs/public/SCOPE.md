## Kamu Web Audit – Tarama Kapsamı ve Politika (Scope)

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit platformunun **ne yaptığını** ve **bilinçli olarak ne yapmadığını**
netleştirmek için hazırlanmıştır. Özellikle **web uygulaması güvenlik taramaları** için
uygundur ve non‑destructive (yıkıcı olmayan) ilkelere göre tasarlanmıştır.

---

### 1. Ne Taranır? (In Scope)

- **Web uygulamaları ve HTTP(S) endpoint’leri**
  - Kurum web siteleri (`https://www.ornek.gov.tr`),
  - Alt uygulamalar ve yönetim panelleri (URL tabanlı).
- **Tarayıcı tabanlı davranışlar**
  - HTML sayfalar, CSS/JS asset’leri,
  - Formlar ve login sayfaları,
  - SPA routing (History API ile sayfa değişimleri).
- **HTTP/HTTPS protokol seviyesinde güvenlik kontrolleri**
  - Security header’lar (HSTS, CSP, X-Frame-Options, X-Content-Type-Options vb.),
  - Cookie flag’leri (Secure, HttpOnly, SameSite),
  - Mixed content ve temel CORS yanlış konfigürasyonları.
- **Pasif içerik analizi**
  - JS dosyaları ve inline script’lerde secret-benzeri pattern’ler,
  - Frontend API endpoint’leri ve sourcemap maruziyeti.

---

### 2. Ne Yapmaz? (Out of Scope)

- **Ağ katmanı / port taraması**
  - Nmap benzeri TCP/UDP port taraması yapılmaz.
  - Sadece HTTP/HTTPS istekleri üzerinden çalışır.
- **Aktif exploit ve istismar girişimleri**
  - SQL injection brute force, parola brute force, ağ tarama (ping sweep) vb. yoktur.
  - Amaç, production sistemlere zarar vermek değil, **konfigürasyon ve davranış risklerini** görünür kılmaktır.
- **Veri silme / yazma / değişiklik**
  - Tasarım gereği non‑destructive’tir:
    - Form scanner, sadece güvenli payload’lar ve kontrollü istekler kullanır.
    - State‑changing POST istekleri en aza indirilir ve güvenlik heuristikleri ile sınırlandırılır.
- **İç ağ keşfi**
  - SSRF koruması nedeniyle:
    - `localhost`, `127.0.0.1`, `169.254.169.254` gibi iç IP’lere karşı tarama reddedilir.
    - Bu adresler ürünün kapsamı dışındadır.

---

### 3. Non‑Destructive Davranış İlkeleri

Platformun tasarımında şu ilkeler gözetilir:

- **Minimum etkili tarama**
  - Gereksiz tekrarlı istekler ve agresif brute force yoktur.
  - Rate limit’ler ve zaman aşımı politikaları ile hedef sistem korunur.
- **Güvenli form taraması**
  - Kullanılan payload’lar, gerçek bir saldırı gerçekleştirmez;
  - Sistem sadece **refleksiyon, encoding ve yapı** üzerinden sinyal üretir.
- **Network Policy ve SKIPPED**
  - Aşırı timeout, WAF blokajı veya sık 429 hatalarında:
    - İlgili istekler **SKIPPED (Network Policy)** olarak işaretlenir,
    - Daha fazla zorlamak yerine güvenli tarafta kalınır.
- **Kimlik bilgisi güvenliği**
  - Gönderilen kullanıcı adları ve şifreler şifreli saklanır,
  - Runner sadece kısa süreli kullanım için plaintext erişir, kalıcı kaydetmez.

---

### 4. Kullanıcı Sorumlulukları

- **Yetkili olduğunuz sistemleri tarayın**
  - Sadece hukuken ve kurumsal politika gereği yetkili olduğunuz hedefleri ekleyin.
- **Tarama penceresini yönetin**
  - Mümkünse mesai dışı saatlerde veya bakım pencerelerinde çalıştırın.
- **Rate Limit ve WAF politikalarınızı gözden geçirin**
  - Ürünün ürettiği SKIPPED metrikleri, aşırı korumacı WAF/RateLimit ayarlarını
    gözden geçirmek için bir sinyal olarak kullanılabilir.

---

### 5. Özet

- Kamu Web Audit, **web uygulaması** odaklı, tarayıcı tabanlı bir güvenlik ve kalite tarayıcısıdır.
- Ağ seviyesi port taraması yapmaz, aktif exploit denemez ve non‑destructive şekilde çalışır.
- SKIPPED (Network Policy) ve benzeri mekanizmalar, hedef sistemin güvenliğini önceleyen
  tasarım tercihlerini yansıtır.

