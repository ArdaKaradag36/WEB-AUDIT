## Kamu Web Audit – DB Migrations Playbook

Last updated: 2026-03-05  
İlgili dokümanlar: `docs/db/SCHEMA.md`, `docs/db/MIGRATIONS.md`, `docs/internal/adr/0003-db-migrations-strategy.md`

---

### 1. Amaç ve Kapsam

Bu playbook, PostgreSQL şemasının **prod ortamda güvenli ve öngörülebilir şekilde evrilmesi** için uygulanabilir adımları tanımlar.

- Hedef ortamlar: **dev → CI → staging → prod**
- Araçlar: EF Core migrations + gerektiğinde ek SQL migration’lar
- Strateji: **forward-only**, expand & contract (bkz. `MIGRATIONS.md`)

---

### 2. Release Öncesi Checklist (DB & Migrations)

Her release öncesi aşağıdaki checklist **PR onayı ön şartı** olmalıdır:

- **Şema ve kod tutarlılığı**
  - [ ] Tüm şema değişiklikleri için **EF migration** veya SQL migration dosyası eklendi.
  - [ ] `KamuAuditDbContext` modeli ile veritabanı şeması uyumlu (`dotnet test` CI’de Testcontainers/Postgres üzerinde `Database.MigrateAsync()` ile çalışıyor).
- **Migration güvenliği**
  - [ ] Migration’lar **backwards-compatible** (expand & contract): önce ekle, sonra tüket, en son temizle.
  - [ ] Büyük tablo değişikliklerinde **index create/drop** işlemleri dikkatle incelendi (gerekirse `CONCURRENTLY`).
  - [ ] Uzun sürebilecek data migration logic’i, mümkünse **uygulamadan ayrı bir batch job** veya background servis ile yapılıyor (migration içinde uzun süren `UPDATE`/`DELETE` yok).
- **Çalıştırma sırası**
  - [ ] Migration set’i sıfırdan yeni bir Postgres instance’ına başarıyla uygulanabiliyor (CI testleri bunu zaten dry-run ediyor).
  - [ ] Uygulama kodu, eski ve yeni şemayı aynı anda tolere edebiliyor (geçiş döneminde).
- **Rollback & backup planı**
  - [ ] Veri kaybı riski olan migration’lar için **prod snapshot/backup** planı tanımlandı.
  - [ ] Geri dönüş stratejisi “**forward-fix**” (yeni migration ile düzeltme) olarak belgelendi.
- **Observability & runbook**
  - [ ] `/metrics` altında, migration/ingestion metrikleri izlenebilir (`ingestion_duration_seconds`, `audit_ingestion_failures_total`, `audit_runs_total{status}`).
  - [ ] Release için uygulanacak DB adımları, bu dosyaya veya release notlarına link verilerek paylaşıldı.

---

### 3. Migration Uygulama Sırası

#### 3.1. Ortam Bazında Sıra

1. **Dev / Lokal**
   - Geliştirici yeni migration’ı üretir:
     - `dotnet ef migrations add <Name> -p backend/KamuAudit.Api/KamuAudit.Api.csproj`
   - Lokal Postgres üzerinde:
     - `dotnet ef database update -p backend/KamuAudit.Api/KamuAudit.Api.csproj`
   - Uygulama kodu ile birlikte manuel smoke test.
2. **CI (Testcontainers Postgres ile)**
   - `dotnet test` sırasında integration test’ler:
     - Yeni bir Postgres container’a tüm migration’ları **sıfırdan** uygular (`Database.MigrateAsync()`),
     - API’yi ayağa kaldırır ve smoke senaryolarını çalıştırır.
   - Bu aşama, migration’ların **bozuk/eksik** olmasını otomatik olarak yakalar.
3. **Staging**
   - Prod’a benzer schema/veri hacmi olan staging DB’de:
     1. Migration’lar sırayla uygulanır (bkz. 4. bölüm).
     2. Backend + runner + frontend staging ortamı ayağa kaldırılır.
     3. Uçtan uca regression ve performans smoke test’leri çalıştırılır.
4. **Prod**
   - Planlı değişiklik penceresi içinde:
     1. Migration’lar uygulanır.
     2. Uygulama release edilir (gerekirse blue/green veya canary).
     3. `/metrics`, `/health/*` ve log’lar üzerinden doğrulama yapılır.

#### 3.2. Tek Release İçindeki Adım Sırası

Genel sıralama:

1. **Migration deploy** (koşul: backwards-compatible)
2. **Uygulama deploy**
3. **Opsiyonel data migration job’ları**
4. **Contract/cleanup migration’ları** (eski kolon/tablo temizliği; ayrı bir release olabilir)

---

### 4. Staging Rehearsal Adımları

Her **schema içeren** release için staging’de aşağıdaki rehearsal en az bir kez çalıştırılmalıdır:

1. **Hazırlık**
   - Staging ortamı, prod ile uyumlu:
     - PostgreSQL versiyonu,
     - Önemli tabloların veri hacmi (en azından benzer indeks ve row sayısı).
   - Release branch’i staging’e deploy edilebilir durumda.
2. **Migration rehearsal**
   1. Staging DB’nin **manuel snapshot/backup**’ı alınır (örneğin managed Postgres snapshot).
   2. EF migration’ları staging’e uygulanır:
      - Önerilen komut:
        - `dotnet ef database update -p backend/KamuAudit.Api/KamuAudit.Api.csproj`
      - Alternatif: Lifecycle’da EF migration bundle veya SQL script runner kullanılıyorsa, ilgili komutlar.
   3. Migration çıktısı ve Postgres log’ları incelenir:
      - Uzun süren lock’lar,
      - Index rebuild süreleri,
      - Hata/uyarı mesajları.
3. **Uygulama doğrulaması**
   1. Staging backend/runner/frontend ayağa kaldırılır.
   2. Aşağıdaki smoke senaryoları çalıştırılır:
      - Yeni user register + login,
      - Yeni audit create + run tamamlanana kadar bekleme,
      - Findings & gaps listesi görüntüleme,
      - `/metrics` ve `/health/*` uçlarının sağlıklı olması.
   3. Eğer mümkünse, CI’de kullanılan Testcontainers senaryoları staging endpoint’lerine karşı da koşulabilir.
4. **Gözlemlenebilirlik kontrolü**
   - `/metrics` üzerinde:
     - `audit_runs_total{status}`, `audit_run_duration_ms_*`,
     - `ingestion_duration_seconds_*`,
     - `audit_ingestion_failures_total` metrikleri beklenen aralıklarda.
   - Log’larda migration veya ingest kaynaklı hata yok.
5. **Sonuç kaydı**
   - Rehearsal tamamlandığında:
     - Release notuna veya `README.md` altında “Migration Rehearsal” bölümüne:
       - Tarih,
       - Staging DB adı,
       - Özet sonuç (PASS/FAIL) not edilir.

Bu repo özelinde, CI’nin zaten her run’da Testcontainers Postgres üzerinden **tam migration set’ini** denediği bilgisi `README.md` altına not edildi; staging rehearsal ise gerçek staging verisiyle manual/ops runbook adımıdır.

---

### 5. Başarısız Migration – Rollback Stratejisi

Prod ortamda **otomatik down migration çalıştırılmayacaktır**. Strateji:

1. **Öncelik: İleriye doğru düzeltme (forward-fix)**
   - Schema hataları veya eksik index durumunda:
     - Yeni bir düzeltici migration yazılır (örneğin kolon tipi düzeltme, index ekleme).
     - Aynı release içerisinde veya hotfix olarak deploy edilir.
2. **Snapshot/backup tabanlı geri dönüş (yüksek riskli değişiklikler için)**
   - Veri kaybı ihtimali olan operasyonlar (örneğin kolon drop, tablo drop, batch delete) için:
     - Migration öncesi DB snapshot/backup alınır.
     - Migration sonrası ciddi sorun çıkarsa:
       - Uygulama trafiği durdurulur (read-only moda veya bakım sayfasına alınır).
       - Snapshot’tan restore yapılır.
       - Yeni düzeltici migration ile bir sonraki pencerede tekrar denenir.
3. **Online “rollback” kabul edilmeyen durumlar**
   - Örneğin:
     - Yeni kolon eklendikten sonra uygulama bu kolonu yazmaya başlamışsa,
     - Veri geri alınamayacak şekilde dönüştürülmüşse;
   - Bu durumlarda, migration’ı geri almak yerine:
     - Ek düzeltici migration’lar ile şema ve veriyi **tutarlı yeni bir duruma** taşımak gerekir.

---

### 6. Migration Safety Rules

Bu projede **tüm migration’lar** için geçerli zorunlu kurallar:

1. **Destructive DROP yok (önce backfill & contract)**
   - Tablo/kolon drop:
     - Ancak şu koşullarda:
       - Eski kod versiyonları o kolonu kullanmıyor,
       - Gerekli data yeni yapıya taşınmış (backfill tamam),
       - En az bir release boyunca production’da gözlemlenmiş.
2. **Lock minimization**
   - Büyük tablolar üzerinde:
     - `ALTER TABLE` ve `CREATE INDEX` işlemleri dikkatle planlanır.
     - Gerekirse:
       - `CREATE INDEX CONCURRENTLY`,
       - Parti parti update (küçük batch’ler),
       - Yoğun trafik saatleri dışında maintenance penceresi.
3. **Long-running data migration’lar migration içinde değil, job olarak**
   - Mümkünse:
     - Migration sadece **schema** değişikliğini yapar.
     - Data taşıma:
       - Background worker,
       - Tek seferlik batch job,
       - Veya ayrı “ops script” ile yönetilir.
4. **Geri dönülebilir feature toggling**
   - Yeni şema alanlarını kullanan logic’ler için:
     - Gerekirse feature flag veya config üzerinden **rollback** yolu tanımlanır.
5. **Her migration için review soruları**
   - Code review’da en az şu sorulara cevap verilmelidir:
     - Bu migration **hangi tabloları** etkiliyor?
     - Hangi index’ler ekleniyor/siliniyor?
     - Yaklaşık kaç satır etkilenecek?
     - Uygulamaya **zero-downtime’e yakın** olacak şekilde uygulanabilecek mi?

---

### 7. CI’de Migration Dry-Run Yaklaşımı

Şu an CI pipeline’ı (bkz. `.github/workflows/ci.yml`):

- `backend` job’ı içinde:
  - `dotnet build` ile API derleniyor.
  - `dotnet test backend/KamuAudit.Tests/KamuAudit.Tests.csproj` ile:
    - Testcontainers Postgres üzerinde **temiz bir veritabanına** tüm EF migration’ları uygulanıyor (`Database.MigrateAsync()`),
    - API ve ingestion katmanı uçtan uca test ediliyor.

Bu, her commit için **otomatik migration dry-run** anlamına gelir:

- Migration dosyası bozuksa (syntax, eksik tablo/kolon, yanlış FK) testler fail olur.
- Uygulama, yeni schema ile ayağa kalkamıyorsa fail olur.

İleri aşamada isteğe bağlı olarak:

- Ayrı bir CI job’ında:
  - `dotnet ef migrations script --idempotent` veya
  - `dotnet ef migrations bundle`
  - kullanılacak bir “DB deployment artifact’i” üretilebilir.

---

### 8. Operasyonel Notlar

- Prod’da **auto-migrate (uygulama start’ında otomatik `Database.Migrate`) KAPALI** kalmalıdır.
- Migration’lar:
  - Ayrı bir ops adımı (script veya bundle) olarak,
  - İlgili release için planlı pencerede,
  - Gözlem (logs + metrics) eşliğinde çalıştırılmalıdır.
- Staging’de:
  - Auto-migrate opsiyonel olarak açılabilir, ancak bu playbook’ta esas kabul edilen yol:
    - Migration’ların staging’e de **explicit komutla** uygulanmasıdır (bkz. 4. bölüm).

