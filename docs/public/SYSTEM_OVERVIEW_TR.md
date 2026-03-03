## Kamu Web Audit – Ürün Genel Bakış (Public)

Kamu Web Audit, kamu kurumlarının web sitelerini **tarayıcı tabanlı otomatik denetimlerle** analiz eden bir SaaS ürünüdür.  
Amaç; güvenlik, teknik sağlık, kullanılabilirlik ve UI davranışları hakkında **tekrarlanabilir ve ölçülebilir** raporlar üretmektir.

---

### Hedef Kullanıcılar

- **Kamu kurumlarında** yazılım ekipleri, QA ekipleri, bilgi güvenliği birimleri
- Denetim/uyumluluk ekipleri (KVKK, erişilebilirlik, güvenlik kontrolleri)
- Merkezi SİBER GÜVENLİK / BT birimleri (çok sayıda kurumsal siteyi gözlemleyen ekipler)

---

### Ürünün Çözdüğü Problem

- Kamu siteleri genellikle:
  - Birden fazla ekip tarafından geliştirilmiş,
  - Farklı teknoloji stack’lerine sahip,
  - Zaman içinde kontrolü zorlaşan yapılardır.
- Sonuç olarak:
  - Bozuk linkler, istisna fırlatan sayfalar,
  - Kapatılamayan popup’lar / cookie banner’lar,
  - UI etkileşim hataları,
  - Gözden kaçan güvenlik / teknik sorunlar
  **geç fark edilir**.

Kamu Web Audit, bu sorunları tespit etmek için **otomatik tarayıcı akışları** ve **raporlanabilir metrikler** sunar.

---

### Yüksek Seviye Bileşenler

- **Web API (Backend)**  
  - JWT tabanlı kimlik doğrulama
  - Audit kuyruğu ve durum makinesi (queued → running → completed / failed)
  - Rapor okumayı ve özetleri sunan REST uçları (`/api/Audits/...`)
  - Sağlık ve metrik uçları (`/health/*`, `/metrics`)

- **Playwright Runner (Node.js 20)**  
  - Gerçek tarayıcı ile hedef URL’yi açar
  - Link örnekleme, konsol/ağ hatası toplama
  - Otomatik UI denetimleri (görünürlük, scroll, etkileşimler)
  - JSON raporlar üretir (`summary`, `findings`, `gaps`, `ui-inventory`)

- **PostgreSQL Veritabanı**  
  - Audit çalıştırmalarının (runs) kalıcı kaydı
  - Bulgu (finding) ve boşluk (gap) tabloları
  - Zaman bazlı raporlar ve indekslenmiş sorgular

---

### Temel Kullanım Senaryoları

1. **Tek bir site için manuel denetim**  
   - Kullanıcı hedef URL’yi girer
   - İsteğe bağlı olarak maksimum link sayısı, UI deneme sayısı gibi sınırları belirler
   - Sistem arkada tarayıcıyı çalıştırır ve rapor üretir

2. **Birden fazla sistem için düzenli tarama**  
   - Aynı API üzerinden farklı kurum siteleri için audit’ler tanımlanır
   - Zaman içinde başarısızlık oranı, süreler ve kritik bulgular takip edilir

3. **Operasyonel izleme**  
   - `/metrics` üzerinden kuyruk derinliği, başarısızlık oranları, zaman aşımı sayıları izlenir
   - Gözlem altyapısı (Prometheus, Grafana, OTel) ile entegre edilir

---

### Daha Fazla Bilgi

Public dokümantasyonun diğer bölümleri:

- [`HOW_IT_WORKS_TR.md`](HOW_IT_WORKS_TR.md) – Uçtan uca akışın adım adım açıklaması
- [`DEPLOYMENT_OVERVIEW_TR.md`](DEPLOYMENT_OVERVIEW_TR.md) – Ürünün nasıl konumlandırılacağı ve temel topoloji
- [`SECURITY_OVERVIEW_TR.md`](SECURITY_OVERVIEW_TR.md) – Kimlik doğrulama, yetkilendirme ve rate limiting özeti

