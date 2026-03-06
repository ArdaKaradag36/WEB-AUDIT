## ADR 0003 – DB Migrations Strategy (Prod vs Staging)

Last updated: 2026-03-05

- Tarih: 2026-03-05  
- Durum: Proposed  
- İlgili bileşenler: Backend API, PostgreSQL, CI/CD, Ops

---

### 1. Context

Kamu Web Audit, PostgreSQL 16 üzerinde çalışan ve EF Core migration’ları ile evrilen bir şemaya sahiptir.

İhtiyaçlar:

- Prod’da:
  - **Veri kaybı riski** düşük olmalı,
  - Migration hataları hızla tespit edilip **ileri yönde düzeltilebilmeli** (forward-fix),
  - Uygulama restart’ına bağlı, kontrolsüz migration tetiklemelerinden kaçınılmalı.
- Staging ve alt ortamlar:
  - Migration’lar gerçekçi veri hacimleri üzerinde denenmeli,
  - CI her commit’te **migration dry-run** yaparak bozuk migration’ları erken yakalamalı.

Bu ADR, prod/staging için **auto-migrate davranışını** ve CI’deki migration dry-run yaklaşımını netleştirir.

---

### 2. Decision

1. **Prod ortamında auto-migrate KAPALI**
   - ASP.NET Core uygulaması start aldığında **otomatik `Database.Migrate()` çağrısı yapılmayacaktır**.
   - Migration’lar, ops tarafından:
     - Ayrı bir script veya EF Core migration bundle,
     - Veya DB deployment pipeline’ı ile **explicit** olarak çalıştırılacaktır.
2. **Staging ve alt ortamlar için “controlled auto-migrate” opsiyonel**
   - Staging’de:
     - Tercihen migration’lar da explicit komut ile uygulanır (prod ile aynı prosedür).
     - İstenirse, sadece staging için `Database.Migrate()` çağrısı eklenebilir; ancak bu, prod’a taşınmaz.
3. **CI’da migration dry-run, integration test’ler üzerinden**
   - `KamuAudit.Tests` projeleri:
     - Testcontainers PostgreSQL üzerinde yeni bir veritabanına **tüm EF migration’ları** uygular (`Database.MigrateAsync()`),
     - API + ingestion + report endpoint’lerini uçtan uca çalıştırır.
   - Dolayısıyla her commit, migration set’inin **en az bir kez sıfırdan başarıyla uygulanabildiğini** kanıtlar.

---

### 3. Rationale

#### 3.1. Neden prod’da auto-migrate kapalı?

- Uygulama start’ında otomatik migration:
  - Yanlış veya eksik bir migration’ın **tam prod ortamında** ilk istekle birlikte tetiklenmesine yol açabilir.
  - Trafik altındayken:
    - Uzun süren `ALTER TABLE` veya `CREATE INDEX` işlemleri,
    - Beklenmedik lock’lar,
    - Hatta veri kaybı senaryoları (yanlış `DROP` / `UPDATE`) yaratabilir.
- Ayrı bir migration adımı olduğunda:
  - Değişiklikler ops tarafından:
    - Planlı bir bakım penceresinde,
    - Önceden tanımlı backup/rollback planıyla,
    - Gözlemlenebilir metrikler eşliğinde çalıştırılabilir.

#### 3.2. Neden CI’daki integration test’ler migration dry-run olarak yeterli?

- Testler:
  - Gerçek Postgres instance’ı (Testcontainers) üzerinde:
    - Tüm EF migration’larını sıfırdan uygular,
    - `WebApplicationFactory` ile API’yi ayağa kaldırır,
    - Auth, audit create, runner ingest, report endpoint’lerini test eder.
- Bu yaklaşım:
  - Hem migration script’lerinin,
  - Hem de uygulama kodunun **aynı commit** içinde uyumlu olduğunu doğrular.

İleride, istenirse:

- `dotnet ef migrations script --idempotent` veya
- `dotnet ef migrations bundle`

ile, prod/staging deployment pipeline’larında kullanılacak ayrı bir “migration artifact” üretilebilir.

---

### 4. Alternatives Considered

1. **Prod’da auto-migrate açık**
   - Artılar:
     - Ops tarafında ek adım gerektirmez; uygulama start aldığında şema güncellenir.
   - Eksiler:
     - Migration hataları doğrudan prod’da ortaya çıkar (yüksek risk).
     - Lock ve uzun süren schema değişiklikleri kullanıcı trafiğini etkileyebilir.
   - Bu nedenle reddedildi.
2. **Sadece SQL tabanlı dış migration runner**
   - Tüm migration’lar SQL dosyaları olarak (`VYYYYMMDDHHMM__...`) tutulur ve
     yalnızca bu runner ile uygulanır.
   - Mevcut EF Core model tabanlı geliştirme tarzıyla çeliştiği için **karma hibrit model** (bkz. `MIGRATIONS.md`) tercih edildi.

---

### 5. Consequences

#### 5.1. Positive

- Prod’daki schema değişiklikleri:
  - Kontrollü,
  - Gözlemlenebilir,
  - Gerekirse backup/restore ile geri alınabilir hale gelir.
- Her commit, CI’de:
  - Migration set’inin temiz bir veritabanına uygulanabildiğini kanıtlar.

#### 5.2. Negative / Trade-offs

- Ops tarafında:
  - Release sürecine **ek bir adım** (migration apply) eklenir.
- Staging ve alt ortamlarda:
  - Uygulama start oldu diye migration’ın otomatik uygulanmış sayılmaması gerekir; runbook’a uyulmalıdır.

---

### 6. Follow-Up Actions

1. `docs/db/MIGRATIONS_PLAYBOOK.md` içinde:
   - Bu ADR’ye referans verildi (prod/staging strategy).
   - Release öncesi checklist ve staging rehearsal adımları tanımlandı.
2. CI dokümanında (`docs/ci/CI.md`):
   - Migration dry-run’in `KamuAudit.Tests` integration test’leri üzerinden yapıldığı açıkça belirtilmelidir.
3. Production deployment runbook’unda:
   - Migration apply komutları ve backup/rollback prosedürü ayrıntılı yazılmalıdır.

