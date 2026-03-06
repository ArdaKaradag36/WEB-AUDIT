## Kamu Web Audit – Kullanım Kılavuzu (Web UI)

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit web arayüzünü kullanarak **hedef ekleme**, **scan başlatma**
ve **bulguları yorumlama** adımlarını açıklar.

---

### 1. Giriş ve Yetkilendirme

- Tarayıcıdan ürün URL’sine gidin (lokalde: `http://localhost:3000`).
- E‑posta ve şifre ile kayıt olup giriş yapın.
- Rolünüze göre (Admin / User / Auditor) görebileceğiniz sayfalar ve yetkiler değişebilir.

---

### 2. Hedefler (Targets) Listesi

Sidebar’dan **“Hedefler” (Targets)** sayfasına gidin:

- Tabloda her satır, benzersiz bir **target URL**’i temsil eder.
- Her hedef için:
  - Son taramanın durumu (başarılı, başarısız, iptal, çalışıyor),
  - Kaç adet tarama yapıldığı,
  - Son taramanın tarihi ve özet bulgu sayıları gösterilir.

**Yeni hedef için tarama başlatmak:**

- Satırdaki **“Yeni tarama”** veya benzeri aksiyon butonuna tıklayın; bu sizi yeni audit formuna yönlendirir ve `targetUrl` alanı önceden doldurulur.

---

### 3. Yeni Tarama Başlatma (Scan Create + Start)

**“Yeni Denetim”** sayfasında:

- **Hedef URL**:
  - Zorunlu alandır; geçerli bir `https://...` formatında olmalıdır.
  - Bu URL, taramanın temel başlangıç noktasıdır.
- **Kimlik bilgisi kullan (opsiyonel)**:
  - Login gerektiren hedefler için kullanıcı adı / parola / 2FA notu girebilirsiniz.
  - Şifre alanları maskelenir ve backend tarafında şifrelenmiş olarak saklanır.

Formu doldurduktan sonra:

- **“Audit Başlat”** butonuna tıkladığınızda:
  - Backend yeni bir `AuditRun` kaydı oluşturur ve kuyruğa alır.
  - Başarılı durumda, otomatik olarak ilgili **Audit Detay** sayfasına yönlendirilirsiniz.
- Hata durumunda:
  - Form üstünde kullanıcı dostu bir hata mesajı gösterilir
    (ör. geçersiz URL, rate limit, yetki hatası).

---

### 4. Tarama Detayları ve İlerleme (Scan Detail + Progress)

`/audits/{id}` sayfasında:

- Üst bölümde:
  - Hedef URL,
  - Audit ID,
  - Durum: `queued`, `running`, `completed`, `failed`, `canceled`.
- Özet kartları:
  - Toplam bulgu sayısı ve seviyelere göre dağılım,
  - Tahmini süre, istek sayısı, yeniden deneme (retry) bilgisi,
  - **SKIPPED (Network Policy)** alanı:
    - Ağ kısıtları, timeout veya 429 rate limit nedeniyle atlanan istek/bulgu sayısını gösterir.

Sayfa periyodik olarak backend’den veriyi çekerek durumu yeniler (minimal polling).

---

### 5. Bulguların İncelenmesi (Findings & Dedup Grupları)

Audit detayındaki **“Bulgular”** bölümünde:

- İki seviye görünüm vardır:
  - **Bulgu Grupları** (“Bu tipten X adet”):
    - Aynı kural ve başlığa sahip bulgular bir araya getirilir.
    - Her satır: `severity`, `ruleId`, `başlık`, `adet`.
  - **Tekil bulgular tablosu**:
    - Her satır: `kural`, `başlık`, `kategori`, `seviye`, `detay`.
    - Bazı bulgular için `SKIPPED (Network Policy)` veya benzeri etiketler gösterilebilir.

Global **“Bulgular” (Findings Explorer)** sayfasında:

- Birden fazla audit’i bir arada filtreleyerek:
  - Şiddete (critical/high/medium/low/info),
  - Kategoriye (security_headers, network, js, form, ui_coverage, vs.),
  - Başlık / detay aramasına göre filtreleme yapabilirsiniz.
- SKIPPED bulgular, özel bir rozet ile işaretlenir.

---

### 6. SKIPPED Nedir?

Bazı durumlarda tarayıcı veya ağ, belirli istekleri güvenli şekilde tamamlayamaz:

- Sürekli timeout alan istekler,
- WAF / güvenlik duvarı tarafından engellenen istekler,
- Ağ rate limit’ine takılan (429) istekler.

Bu gibi durumlarda sistem:

- Hedef uygulamaya zarar vermemek için agresif yeniden denemeler yapmak yerine,
- İlgili istekleri **“SKIPPED (Network Policy)”** olarak işaretler.

UI’da:

- Özet kartta toplam SKIPPED sayısı,
- Bulgular tablosunda ilgili satırlarda **SKIPPED** etiketi,
- Raporlarda **ayrı bir metrik** olarak görülür.

Bu, platformun **non‑destructive** çalıştığının bir parçasıdır: şüpheli durumlarda “saldırıya devam etmek” yerine güvenli tarafta kalır.

---

### 7. Raporlar

Tamamlanan bir tarama için:

- Audit detay sayfasından JSON rapora (`report.json`) giden linkler gösterilir.
- İleride PDF rapor desteği eklendiğinde aynı sayfadan indirilebilir olacaktır.

JSON rapor:

- Executive summary,
- Top risks,
- Coverage metrikleri,
- Seviyeye ve kategoriye göre bulgu dağılımı,
- SKIPPED metrikleri ve network policy nedenleri gibi alanlar içerir.

Tamamlanmış bir denetim için konsolide JSON raporu **tek bir API çağrısıyla** alabilirsiniz:

```http
GET /api/Audits/{id}/report?format=json HTTP/1.1
Authorization: Bearer <token>
Accept: application/json
```

Yanıt, `AuditReportResponse` şemasına uygun bir JSON döner:

- `execSummary.webScore` – 0–10 arası web risk skoru,
- `findingsBreakdown.bySeverity` / `byCategory`,
- `topFindings` – “Bu tipten X adet” grupları,
- `skippedSummary` – SKIPPED bulguların sayısı ve nedenlere göre kırılımı,
- `evidenceLinks` – ilgili `trace.zip`, `console.json`, `network.json` vb. artefaktlara giden yollar.

