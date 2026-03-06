# Kamu Web Audit – PostgreSQL Migration Yaklaşımı

Bu doküman, Kamu Web Audit için tasarlanan PostgreSQL şemasının **nasıl evrileceği** ve migration’ların nasıl yönetileceği konusunda rehberdir.  
Amaç; 3NF şemayı korurken, prod ortamda **güvenli, izlenebilir ve mümkün olduğunca kesintisiz** schema değişiklikleri yapmaktır.

---

## 1. Genel Prensipler

- **Migration’lar versiyonlu ve immutable olmalıdır**:
  - Her şema değişikliği için yeni bir migration eklenir.
  - Var olan migration dosyaları geriye dönük olarak değiştirilmez.
- **Forward-only strateji**:
  - Prod ortamda migration’lar yalnızca ileri (up) yönde çalıştırılır.
  - Geri alma (down) işlemleri yalnızca lokal/dev ortamlar için düşünülür; prod’da geri dönüş, yeni bir düzeltici migration ile yapılır.
- **Schema changes kod değişiklikleriyle atomik düşünülür**:
  - Uygulama kodu + migration bir PR içinde incelenir.
  - Uygulama release sıralaması:
    1. Migration’ları deploy et.
    2. Uygulama kodunu deploy et (schema artık uygun durumda).
- **Backwards-compatible değişiklikler tercih edilir**:
  - Mümkün olduğunca “expand and contract” modeli kullanılır (aşağıda anlatılıyor).

---

## 2. Migration Araçları

Repository .NET + PostgreSQL tabanlı olduğu için önerilen seçenekler:

- **EF Core Migrations**:
  - Domain/Infrastructure katmanında EF Core kullanılıyorsa, model’den migration üretilebilir.
  - Avantaj: C# kodu ile strongly-typed migration; schema’nın kod ile senkronu.
  - Dezavantaj: Çok el ile optimize edilmiş index/partition yönetiminde esneklik sınırlı.
- **SQL-tabanlı migration dosyaları**:
  - `sql/` altında sıralı dosyalar (örn. `V202603051000__init_schema.sql`).
  - Deployment pipeline’ında bu dosyalar sırayla çalıştırılır.
  - Avantaj: Tam kontrol (index, partition, advanced ops).
  - Dezavantaj: Uygulama kodu modeli ile senkronu manuel takip gerekir.

> Öneri: **Temel şema için EF Core migrations + ileri seviye index/partition ayarları için ek SQL migration’lar** hibrit yaklaşım.

---

## 3. İsimlendirme ve Versiyonlama

- Migration dosyaları için önerilen isimlendirme:

```text
VYYYYMMDDHHMM__kisa_aciklama.sql
```

Örnekler:

- `V202603051000__init_core_schema.sql`
- `V202603061530__add_finding_instances_table.sql`
- `V202603071200__add_metrics_timeseries_partitioning.sql`

EF Core kullanılıyorsa:

- Migration sınıf isimleri benzer bir pattern izleyebilir:
  - `Migration202603051000_InitCoreSchema`

---

## 4. Expand & Contract Deseni

Schema değişiklikleri için **iki/üç aşamalı yaklaşım**:

1. **Expand (Ek Alan / Yapı Ekleme)**:
   - Yeni tablo/kolon/index eklenir.
   - Eski alanlar dokunulmaz; uygulama her iki yapıyı da tolere eder.
2. **Data Migration (Opsiyonel)**:
   - Arka plan job veya migration script’i ile eski yapıda tutulan veri yeni yapıya taşınır.
   - Bu adım uzun sürebilir; genellikle uygulamadan bağımsız batch job olarak kurgulanır.
3. **Contract (Temizlik)**:
   - Uygulama kodu yeni yapıyı kullanmaya geçtikten ve data migration tamamlandıktan sonra:
     - Eski kolonlar nullable yapılır, sonra drop edilir.
     - Eski tablolar kaldırılır.

Bu sayede:

- Zero-downtime’e yakın deployment mümkün olur.
- Rollout ve rollback sırasında schema-uyumsuzluk hataları minimize edilir.

---

## 5. Enum / Status Alanları İçin Yaklaşım

PostgreSQL native enum’ları yerine genellikle:

- `smallint` veya `int` + uygulama kodunda enum mapping

kullanılması tavsiye edilir. Böylece:

- Yeni status eklemek için PostgreSQL enum type’ını değiştirmeye gerek kalmaz.
- Migration’lar daha basit ve risk siz olur.

Yeni status ekleme adımları:

1. Domain enum’una yeni değer eklenir.
2. Uygulama kodu bu değeri handle edecek şekilde güncellenir.
3. Gerekirse mevcut satırlar için data migration yapılır (`UPDATE ... SET status = ... WHERE ...`).

---

## 6. Büyük Tablolar ve Partitioning

Özellikle:

- `pages`
- `requests`
- `evidence`
- `metrics_timeseries`

tabloları için **büyüme hızı yüksek** olacaktır. Öneri:

- Zaman bazlı partitioning (örn. aylık):

```text
pages_2026_03, pages_2026_04, ...
requests_2026_03, ...
metrics_timeseries_2026_03, ...
```

Migration adımları:

1. Ana tabloyu `PARTITION BY RANGE (collected_at)` (veya `occurred_at` / `timestamp`) ile partition’lı hale getirmek.
2. Yeni zaman aralıkları için partition tablolarını migration veya cron job ile otomatik oluşturmak.
3. TTL/retention politikasına göre eski partition’ları `DROP TABLE` ile kaldırmak (hızlı temizlik).

> Not: Partitioning kararı alınmadan önce beklenen veri hacmi ve sorgu pattern’leri gözden geçirilmeli; gerekirse pilot ortamda test edilmelidir.

---

## 7. Dedup ve Unique Constraint’ler

Özellikle:

- `findings.fingerprint` (template dedup)
- `finding_instances (finding_id, scan_id, page_id, request_id, parameter, primary_evidence_id)`
- `pages (scan_job_id, normalized_url)`

gibi alanlarda **unique constraint** kullanmak önemlidir.

Migration sırasında:

1. Önce veri kalitesini ölçmek:
   - Geçmişte duplicate üretildiyse, constraint eklemeden önce temizlenmelidir.
2. Constraint’i **DEFERRABLE INITIALLY DEFERRED** olarak eklemek:
   - Büyük batch insert/update işlemleri sırasında transaction sonuna kadar kontrol ertelenebilir.
3. Uygulama tarafında:
   - Upsert pattern’i (INSERT ... ON CONFLICT DO UPDATE) kullanılarak duplicate oluşumu önlenmelidir.

---

## 8. JSONB Alanları ve Index’ler

JSONB alanları:

- `targets.labels`
- `auth_profiles.config`
- `requests.request_headers`
- `requests.response_headers`
- `evidence.metadata`
- `findings.metadata`
- `metrics_timeseries.labels`

için önerilen yaklaşım:

- Sık sorgulanan anahtarlar için **partial GIN index**:

```text
idx_requests_resp_headers_hsts_gin
  ON requests
  USING gin (response_headers jsonb_path_ops)
  WHERE response_headers ? 'Strict-Transport-Security';
```

- Az kullanılan / esnek alanlar için index gerekmeyebilir; query profiler ile karar verilir.

Migration sürecinde:

- GIN index’ler büyük olabilir; **concurrently** oluşturulmalıdır:
  - `CREATE INDEX CONCURRENTLY ...`
  - EF Core veya SQL runner aracı bu pattern’i destekleyecek şekilde yapılandırılmalıdır.

---

## 9. Retention ve Temizlik Migration’ları

Büyük log tabloları ve blob pointer’ları için periyodik temizlik gerekir:

- `pages`, `requests`, `evidence`, `metrics_timeseries`:
  - Zaman bazlı partitioning varsa, eski partition’ların `DROP TABLE` ile kaldırılması (ör. `DROP TABLE pages_2025_01;`).
  - Partitioning yoksa:
    - Batch `DELETE` + `VACUUM` / `VACUUM FULL` (dikkat: uzun sürebilir).
- Blob storage’ta:
  - Application veya ayrı bir temizlik job’u, veritabanında artık referans edilmeyen pointer’ları bulup siler.

Migration dokümanları:

- Retention politikasını değiştiren her adım için açıklayıcı bir migration notu eklenmelidir:
  - Örn. `V202604011000__set_requests_retention_180_days.sql`.

---

## 10. Ortamlar Arası Uygulama

Migration’lar aşağıdaki sırayla uygulanmalıdır:

1. **Lokal / Dev**:
   - Geliştiriciler yeni migration’ları burada üretir ve test eder.
2. **CI / Test / QA**:
   - CI pipeline’ı, temiz bir veritabanına tüm migration’ları sıfırdan uygulayarak şemanın tutarlılığını garanti eder.
3. **Staging**:
   - Prod’a benzer veri hacmiyle migration performansı ve olası lock’lar test edilir.
4. **Prod**:
   - Değişiklik penceresi ve risk seviyesine göre:
     - Ya manuel onay sonrası,
     - Ya da otomatik (ancak gözlemlenebilirlik ve rollback planıyla) uygulanır.

Her ortamda:

- Migration versiyon tablosu (örn. `__ef_migrations_history` veya `schema_version`) ile hangi migration’ların uygulandığı izlenmelidir.

---

## 11. Geri Dönüş (Rollback) Stratejisi

Prod’da **otomatik down migration** tercih edilmez. Bunun yerine:

- Hatalı bir migration sonrası:
  - Yeni bir düzeltici migration yazılır (ör. eksik index ekleme, yanlış kolon tipini düzeltme).
  - Uygulama kodu ile birlikte yeniden deploy edilir.
- Veri kaybı riskli operasyonlarda:
  - Migration öncesi backup (snapshot) alınır.
  - Gerekirse snapshot’tan restore yapılır (planlı bakım penceresi gerektirir).

---

## 12. Özet

- Şema, 3NF prensipleriyle tasarlandı ve **expand & contract** modeliyle evrilecek.
- Enum/status alanları için PostgreSQL enum yerine `smallint`/`int` + kod tarafında mapping kullanılacak.
- Büyük hacimli tablolar partitioning + TTL ile yönetilecek.
- JSONB alanlar için yalnızca gerekli durumlarda, mümkünse partial GIN index’ler oluşturulacak.
- Tüm değişiklikler, versiyonlu ve forward-only migration’lar ile, önce alt ortamlar sonra prod’da uygulanacak.

