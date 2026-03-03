## Kamu Web Audit – Dağıtım Genel Bakışı (Public)

Bu doküman, Kamu Web Audit ürününün **yüksek seviyede** nasıl konumlandırılacağını ve hangi bileşenlere ihtiyaç duyduğunu açıklar.  
Detaylı komutlar, migration adımları ve sorun giderme rehberi içeren teknik runbook’lar **iç dokümantasyon** altında tutulur.

---

### 1. Tipik Topoloji

Basit bir kurulum için aşağıdaki bileşenler önerilir:

1. **Uygulama Sunucusu (Backend + Worker)**
   - .NET 8 Web API çalıştıran servis
   - Aynı proses içinde arka plan worker (audit kuyruğunu tüketir)
   - `/api/*`, `/health/*`, `/metrics` uçlarını barındırır

2. **Runner Ortamı (Node.js + Playwright)**
   - Node.js 20.x LTS
   - Playwright tarayıcıları (en az Chromium)
   - Proje kodu (`runner`) ve build çıktıları (`dist`) bu ortamda bulunur
   - Backend, bu ortamda `node dist/cli.js` komutunu çalıştırır

3. **Veritabanı (PostgreSQL 16)**
   - Audit kayıtları, bulgular (findings), boşluklar (gaps) burada saklanır
   - Ayrı bir DB sunucusu veya yönetilen bir PostgreSQL servisi olabilir

4. **Reverse Proxy / Ingress (Nginx vb.)**
   - Kamu Web Audit API’sine gelen trafiği yönlendirir
   - TLS sonlandırma, HTTP → HTTPS yönlendirme
   - Client IP’yi doğru başlıklarla (`X-Forwarded-For` vb.) backend’e iletir

5. **Gözlem Altyapısı (Opsiyonel ama önerilir)**
   - Prometheus + Grafana (veya eşdeğeri)
   - OpenTelemetry collector + izleme backend’i (Jaeger, Tempo vb.)

---

### 2. Ortam Değişkenleri ve Sırlar (Özet)

Üretim ortamında, yapılandırmaların tamamı **ortam değişkenleri** veya gizli yapılandırma mağazaları (Secret, Key Vault vb.) üzerinden sağlanmalıdır.

Örnek başlıklar:

- **Veritabanı**
  - `ConnectionStrings__Default`
- **Kimlik Doğrulama**
  - `Jwt__Key` (en az 32, tercihen 64+ karakter)
- **Runner Ayarları**
  - `Runner__WorkingDirectory`
  - `Runner__NodePath`
  - `Runner__CliScript`
  - `Runner__MaxRunDurationMinutes`
- **Rate Limiting**
  - `RateLimiting__Enabled`
  - `RateLimiting__Auth`
  - `RateLimiting__AuditCreate`
- **CORS**
  - `Cors__Enabled`
  - `Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`, ...
- **OpenTelemetry (opsiyonel)**
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`

Bu değişkenler, hem **staging** hem de **production** ortamlarında sıkı şekilde versiyonlanmalı ve belgelenmelidir.

---

### 3. Trafik Akışı (Kısa Özet)

1. Kullanıcı tarayıcısı → **Reverse Proxy / Ingress** → Backend API (`/api/...`)
2. Backend API → **PostgreSQL** (audit kayıtları ve rapor verisi)
3. Backend Worker → **Runner Ortamı** (Node + Playwright)
4. Runner → **Hedef Web Sitesi** (denetlenen kamu sitesi)
5. Backend → **/metrics** ve **/health** → Gözlem altyapısı (Prometheus, Grafana, OTel)

Bu akışta, kamu sistemleri ile olan tüm HTTP trafiği (runner ↔ hedef site) **kurumun güvenlik politikalarına uygun şekilde** sınırlandırılmalı ve izlenmelidir.

---

### 4. Ölçeklendirme Stratejisi (Özet)

- **Dikey ölçeklendirme** (başlangıç için yeterli):
  - Tek bir backend instance’ı + tek bir runner ortamı ile başlanabilir.
  - CPU/RAM artışı ile daha fazla audit aynı anda işlenebilir.

- **Yatay ölçeklendirme**:
  - Backend/worker çoğaltılabilir; audit kuyruğu, veritabanı üzerinden **iş güvenli biçimde dağıtılır**.
  - Runner ortamı da çoğaltılarak farklı makinelerde paralel audit’ler çalıştırılabilir.

- **Sınırlayıcılar**:
  - `MaxConcurrentRuns` benzeri ayarlar ile aynı anda çalışan audit sayısı kontrol edilir.
  - Rate limiting (özellikle login ve audit oluşturma uçlarında) kötüye kullanımı engeller.

---

### 5. Hangi Doküman Nereye Bakmalı?

Bu sayfa, sadece **yüksek seviye** bir dağıtım bakışı sunar. Daha derin operasyonel detaylar için:

- İç dokümantasyon:
  - Detaylı kurulum ve migration adımları
  - Sorun giderme rehberleri
  - İzleme/alert yapılandırmaları

Bu iç dokümanlar, depo içinde **“⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC”** etiketiyle işaretlenmiştir ve yalnızca teknik ekiplere yöneliktir.

