## Kamu Web Audit – Nasıl Çalışır? (Public)

Bu doküman, Kamu Web Audit ürününün **uçtan uca akışını** sade bir dille açıklar.  
Amaç; bir audit isteğinin, kullanıcının tarayıcıdan API’ye, oradan da rapor ekranına kadar nasıl ilerlediğini görselleştirmektir.

---

### 1. Kullanıcı Girişi ve Kimlik Doğrulama

1. Son kullanıcı veya QA mühendisi, web arayüzünden **e‑posta + şifre** ile giriş yapar.
2. Backend, **JWT (JSON Web Token)** üreterek kullanıcıyı kimlik doğrular:
   - Token içinde `userId` ve `role` (örn. QA, Admin) bulunur.
   - Bu token, sonraki API çağrılarında `Authorization: Bearer ...` başlığıyla gönderilir.
3. Her istek, backend tarafında JWT ile doğrulanır ve kullanıcının rolü/kimliği kontrol edilir.

---

### 2. Audit Oluşturma Akışı

1. Kullanıcı, web arayüzündeki **“Yeni Denetim”** formuna:
   - Hedef URL (ör. `https://www.ornek.gov.tr`)
   - Maksimum link sayısı
   - Maksimum UI deneme sayısı
   - İsteğe bağlı eklenti (plugin) listesi
   girer.
2. İsteğe bağlı olarak, audit’in hedeflediği site için **kimlik bilgileri** (kullanıcı adı/şifre, 2FA notu) tanımlanabilir:
   - Bu bilgiler, backend’de **şifrelenmiş** halde saklanır (plaintext tutulmaz).
3. Backend, bu bilgileri kullanarak veritabanında yeni bir **audit run** kaydı oluşturur:
   - Durum: `queued`
   - İlgili kullanıcı: audit’i oluşturan kullanıcı
4. Kullanıcı, dashboard ekranında yeni audit’i “kuyrukta” olarak görür.

---

### 3. Arka Plan Worker ve Runner Etkileşimi

1. **Arka plan worker**, belirli aralıklarla veritabanındaki **kuyrukta (queued)** audit’leri kontrol eder.
2. Her audit, **sadece bir worker** tarafından işlenebilmesi için güvenli şekilde rezerve edilir.
3. Worker, audit’i `running` durumuna alır ve Playwright runner’ı şu bilgilerle başlatır:
   - Hedef URL
   - Limitler (max links, max UI attempts, strict/safe mod)
   - Gerekirse kimlik bilgileri (sadece runner tarafından okunabilecek güvenli bir kanal üzerinden)
4. Runner, gerçek bir tarayıcı açar ve sayfayı gezer:
   - Link’leri örnekler (ör. en çok ziyaret edilen 20 link)
   - Konsol ve ağ hatalarını toplar
   - UI elementlerini tespit eder ve bazı etkileşimler dener
5. Çalışma tamamlandığında runner, dosya sistemine JSON rapor dosyaları yazar:
   - `summary` – genel özet ve metrikler
   - `findings` – kurallara göre tespit edilen bulgular
   - `gaps` – UI etkileşim boşlukları
   - (İsteğe bağlı) `ui-inventory` – UI envanteri

---

### 4. Raporların İçeri Alınması (Ingestion)

1. Runner işi bitirdiğinde, worker bu audit için üretilen JSON dosyalarını okur.
2. Backend, bu JSON verisini **PostgreSQL** veritabanındaki tablolara dönüştürür:
   - `findings` tablosu – Kural bazlı bulgular
   - `gaps` tablosu – UI boşlukları ve risk seviyeleri
   - `audit_runs` üzerindeki metrik alanları – süre, örneklenen link sayısı vb.
3. Bu işlem **idempotent** olacak şekilde tasarlanmıştır:
   - Aynı audit run için ingestion tekrar çalıştırıldığında, eski kayıtlar güvenli şekilde güncellenir.
4. Ingestion başarılı ise audit’in durumu genellikle `completed` olarak işaretlenir;
   hata durumunda ilgili alanlara **açıklayıcı hata mesajı** yazılır.

---

### 5. Sonuçların Gösterimi

Web arayüzü, backend’in sunduğu REST API’leri kullanarak aşağıdaki bilgileri çeker:

- **Audit listesi** – Kullanıcının oluşturduğu audit’lerin özeti
- **Audit detay görünümü** –
  - Durum (queued / running / completed / failed)
  - Süre, örneklenen linkler, kırık link sayısı
- **Bulgular (findings)** –
  - Kural ID’si, seviye (critical, error, warn, info), kategori
  - Açıklama ve önerilen düzeltmeler
- **Boşluklar (gaps)** –
  - UI element ID’si, risk seviyesi, önerilen script’ler

Tüm bu uçlar, **sadece ilgili kullanıcıya ait audit’leri** gösterecek şekilde sınırlandırılabilir; admin rolü ise genellikle global görünüm yetkisine sahiptir.

---

### 6. Metrikler ve Sağlık Durumu

Operasyon ekipleri için backend şu uçları sağlar:

- `/health/live` – Uygulama sürecinin hayatta olup olmadığını gösterir
- `/health/ready` – Veritabanı bağlantısı ve temel bağımlılıkların hazır olup olmadığını gösterir
- `/metrics` –
  - Kuyruk derinliği (kaç audit kuyrukta?)
  - Çalışan audit sayısı
  - Tamamlanan/başarısız denetim sayıları
  - Zaman aşımı ve ingestion hata sayaçları

Bu metrikler, Prometheus/Grafana gibi sistemlerle **paneller ve alarmlar** oluşturmak için kullanılabilir.

---

### 7. Özet

Kısaca:

1. Kullanıcı giriş yapar ve audit talebi oluşturur.
2. Backend, isteği kuyruğa yazar.
3. Arka plan worker, sıradaki audit’i alır ve Playwright runner’ı çalıştırır.
4. Runner, hedef siteyi gerçek bir tarayıcı ile denetler ve JSON raporlar üretir.
5. Backend, raporları veritabanına işler ve metrikleri günceller.
6. Kullanıcı, web arayüzü üzerinden sonucu bulgular/gaps/özet ekranlarında görür.
7. Operasyon ekipleri, health ve metrics uçları ile sistemi izler.

