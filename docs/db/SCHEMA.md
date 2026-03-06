# Kamu Web Audit – PostgreSQL Şeması (3NF)

Bu doküman, Kamu Web Audit için tasarlanan **PostgreSQL 3NF şemasını** tanımlar.  
Amaç; Nessus-benzeri web application security scanner domain’ini normalize etmek, deduplikasyon ve raporlama ihtiyaçlarını karşılamak, büyük log verileri için ölçeklenebilir bir yapı sunmaktır.

Tanımlanan tablolar:

- `targets`
- `auth_profiles`
- `scans`
- `scan_jobs`
- `pages`
- `requests`
- `findings`
- `evidence`
- `rules_catalog`
- `finding_instances`
- `metrics_timeseries` (opsiyonel / genişletilebilir)

---

## 1. Genel ERD (Metinsel)

Metinsel ERD özeti:

- **targets (1) — (N) scans**
- **scans (1) — (N) scan_jobs**
- **scan_jobs (1) — (N) pages**
- **pages (1) — (N) requests**
- **rules_catalog (1) — (N) findings**
- **findings (1) — (N) finding_instances**
- **scans (1) — (N) finding_instances**
- **scan_jobs (1) — (N) finding_instances** (opsiyonel, hangi job’da tespit edildiği)
- **pages (1) — (N) finding_instances** (URL ve sayfa ilişkisi)
- **evidence (1) — (N) finding_instances** (primer evidence üzerinden; ek ilişki tabloları ile genişletilebilir)
- **scans / targets / scan_jobs / pages (1) — (N) metrics_timeseries** (scope bazlı metrikler)

Tüm ilişkiler tek yönlü de okunabilir:

```text
target -> scans -> scan_jobs -> pages -> requests
                     |
                     +-> finding_instances -> findings -> rules_catalog
                             |
                             +-> evidence
```

---

## 2. targets

### 2.1. Amaç

Taranacak web uygulamalarını / siteleri temsil eder.

### 2.2. Sütunlar

- `id` (PK, bigint veya UUID)
- `organization_id` (FK, nullable veya zorunlu – çok kiracılılık durumuna göre)
- `project_id` (FK/nullable – mantıksal grup)
- `name` (varchar, not null)
- `base_url` (varchar, not null)
- `risk_profile` (smallint veya enum mapping; örn. 0=PUBLIC,1=INTERNAL,2=HIGH_SENSITIVITY)
- `labels` (jsonb, opsiyonel; anahtar-değer etiketler)
- `is_active` (boolean, not null, default true)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

### 2.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**: `organization_id` → `organizations.id` (ileride gerekirse)
- **Unique**:
  - `(organization_id, base_url)` – aynı org altında aynı base_url için tek kayıt.
- **Index önerileri**:
  - `idx_targets_org` on `(organization_id)`
  - `idx_targets_base_url` on `(base_url)`
  - GIN index: `idx_targets_labels_gin` on `labels` (jsonb) – label bazlı sorgular için.

### 2.4. JSONB kullanımı

- `labels` alanı, esnek etiketleme için **jsonb** olmalıdır.

### 2.5. Retention

- Target kayıtları genelde uzun ömürlüdür; **TTL uygulanmaz**.

---

## 3. auth_profiles

### 3.1. Amaç

Login / session yönetimi için yeniden kullanılabilir kimlik doğrulama profilleri.

### 3.2. Sütunlar

- `id` (PK)
- `organization_id` (FK)
- `name` (varchar, not null)
- `type` (smallint/enum; örn. 0=NONE,1=FORM_LOGIN,2=OIDC_DEVICE_FLOW,3=CUSTOM_SCRIPT)
- `config` (jsonb, not null) – form selector’ları, field mapping, success kriterleri vb.
- `is_sensitive` (boolean, not null, default true) – secret içerip içermediği.
- `created_at`, `updated_at`

### 3.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**: `organization_id` → `organizations.id`
- **Unique**:
  - `(organization_id, name)`
- **Index önerileri**:
  - `idx_auth_profiles_org` on `(organization_id)`

### 3.4. JSONB kullanımı

- `config` jsonb; login flow DSL’ini ve gerektiğinde maskelenmiş secret referanslarını içerir.

### 3.5. Retention

- Uzun ömürlü, TTL yok. Secret değerleri, ayrı bir secret store’da tutulmalı; burada referans/key saklanmalı.

---

## 4. scans

### 4.1. Amaç

Mantıksal tarama tanımı (kampanya / run grubu).

### 4.2. Sütunlar

- `id` (PK)
- `target_id` (FK → targets.id)
- `auth_profile_id` (FK → auth_profiles.id, nullable)
- `status` (smallint/enum; `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
- `requested_by_user_id` (FK/nullable – kullanıcı modeliyle ilişki)
- **Konfig alanları (ScanConfig’ten normalize edilmiş)**:
  - `max_pages` (int)
  - `max_depth` (int)
  - `max_duration_seconds` (int)
  - `max_requests` (int)
  - `max_rps` (int)
  - `max_concurrent_requests` (int)
  - `politeness_delay_ms` (int)
  - `retry_max_attempts` (int)
  - `retry_backoff_strategy` (smallint/enum; `NONE`, `LINEAR`, `EXPONENTIAL`)
  - `retryable_status_codes` (int[] veya jsonb)
  - `rule_packs` (text[] veya jsonb) – uygulanan rule pack ID listesi.
- `scheduled_at` (timestamptz, nullable)
- `started_at` (timestamptz, nullable)
- `completed_at` (timestamptz, nullable)
- `created_at`, `updated_at`

### 4.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**:
  - `target_id` → `targets.id`
  - `auth_profile_id` → `auth_profiles.id`
- **Index önerileri**:
  - `idx_scans_target` on `(target_id)`
  - `idx_scans_status` on `(status)`
  - `idx_scans_scheduled_at` on `(scheduled_at)`
  - `idx_scans_started_at` on `(started_at)`

### 4.4. JSONB kullanımı

- `rule_packs` için `text[]` de kullanılabilir, ancak ek metadata gerekirse `jsonb` daha esnek.
- `retryable_status_codes` – `int[]` veya `jsonb` (sorgu ihtiyaçlarına göre).

### 4.5. Retention

- Scans metadata’sı raporlama için uzun süre tutulabilir.  
  Büyük veri bu tabloda değil, ilişkili `pages`, `requests`, `evidence`, `metrics_timeseries` tablolarında saklanır.

---

## 5. scan_jobs

### 5.1. Amaç

Queue’ye konan iş birimi; genellikle bir `scan` ile ilişkilidir.

### 5.2. Sütunlar

- `id` (PK)
- `scan_id` (FK → scans.id)
- `shard_index` (int, nullable; büyük taramalar için parça numarası)
- `status` (smallint/enum; `QUEUED`, `DISPATCHED`, `TIMED_OUT`, `COMPLETED`, `FAILED`)
- `priority` (smallint/enum; `LOW`, `NORMAL`, `HIGH`)
- `runner_node_id` (varchar, nullable; hangi runner node’unun işlediği)
- `created_at` (timestamptz)
- `dispatched_at` (timestamptz, nullable)
- `completed_at` (timestamptz, nullable)

### 5.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**: `scan_id` → `scans.id`
- **Unique**:
  - `(scan_id, shard_index)` – aynı scan + shard için tek job.
- **Index önerileri**:
  - `idx_scan_jobs_scan` on `(scan_id)`
  - `idx_scan_jobs_status_priority` on `(status, priority)`
  - `idx_scan_jobs_dispatched_at` on `(dispatched_at)`

### 5.4. Retention

- Scan geçmişiyle birlikte tutulabilir; çok büyük hacim oluşursa **zaman bazlı partition** (ör. `scan_jobs_y2026m03`) kullanılabilir.

---

## 6. pages

### 6.1. Amaç

Tarama sırasında elde edilen sayfa bazlı varlıkları temsil eder.

### 6.2. Sütunlar

- `id` (PK)
- `scan_job_id` (FK → scan_jobs.id)
- `url` (varchar, not null)
- `normalized_url` (varchar, not null)
- `status_code` (int)
- `content_type` (varchar)
- `html_ref` (varchar, nullable) – HTML içeriği için storage pointer.
- `screenshot_ref` (varchar, nullable)
- `console_log_ref` (varchar, nullable)
- `network_log_ref` (varchar, nullable)
- `collected_at` (timestamptz)

### 6.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**: `scan_job_id` → `scan_jobs.id`
- **Unique**:
  - `(scan_job_id, normalized_url)` – aynı job içinde aynı sayfa için tek kayıt.
- **Index önerileri**:
  - `idx_pages_scan_job` on `(scan_job_id)`
  - `idx_pages_normalized_url` on `(normalized_url)`

### 6.4. Retention

- `html_ref`, `screenshot_ref`, `console_log_ref`, `network_log_ref` büyük veri işaret eder.  
  Bu pointer’ların işaret ettiği blob’lar için:
  - **TTL / retention policy**: Örn. prod için 90 veya 180 gün.
  - Eski veriler, object storage level’da silinir; referanslar isteğe bağlı olarak null’lanabilir veya “expired” olarak işaretlenebilir.
- Tablo satırlarının kendisi daha uzun süre tutulabilir (metadata raporlama için).

---

## 7. requests

### 7.1. Amaç

Her HTTP isteği/yanıtı temsil eder.

### 7.2. Sütunlar

- `id` (PK)
- `scan_job_id` (FK → scan_jobs.id)
- `page_id` (FK → pages.id, nullable; her istek bir sayfayla ilişkilendirilmek zorunda değil)
- `method` (varchar, not null)
- `url` (varchar, not null)
- `normalized_url` (varchar, not null)
- `request_headers` (jsonb)
- `request_body_ref` (varchar, nullable)
- `response_status_code` (int)
- `response_headers` (jsonb)
- `response_body_ref` (varchar, nullable)
- `duration_ms` (int, nullable)
- `error_type` (varchar, nullable)
- `error_message` (varchar, nullable)
- `occurred_at` (timestamptz, not null)

### 7.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**:
  - `scan_job_id` → `scan_jobs.id`
  - `page_id` → `pages.id`
- **Index önerileri**:
  - `idx_requests_scan_job` on `(scan_job_id)`
  - `idx_requests_page` on `(page_id)`
  - `idx_requests_normalized_url` on `(normalized_url)`
  - GIN index: `idx_requests_req_headers_gin` on `request_headers` (jsonb)
  - GIN index: `idx_requests_resp_headers_gin` on `response_headers` (jsonb)

### 7.4. JSONB kullanımı

- `request_headers`, `response_headers` – **jsonb** ile saklanır; header isimleri ve değerleri üzerinde sorgu yapılabilir.

### 7.5. Retention

- Body pointer’ları büyük veri (özellikle HTML/JSON).  
  Body’ler için:
  - Kısa TTL (örn. 30–90 gün) ve object storage’da saklama.
  - İhtiyaç halinde PII / hassas veri içeren path’ler için daha agresif TTL.

---

## 8. rules_catalog

### 8.1. Amaç

Tüm kural tanımlarının merkezi kataloğu.

### 8.2. Sütunlar

- `id` (PK, varchar; örn. `KWA-SEC-001`)
- `category` (smallint/enum; `SECURITY_HEADER`, `XSS`, `COOKIE` vb.)
- `default_severity` (smallint/enum)
- `title` (varchar, not null)
- `description` (text, not null)
- `tags` (text[] veya jsonb)
- `references` (text[] veya jsonb)
- `detect_description` (text) – insan tarafından okunabilir detection açıklaması.
- `remediation` (text)
- `created_at`, `updated_at`

### 8.3. PK/FK, Unique, Index

- **PK**: `id`
- **Index önerileri**:
  - `idx_rules_category` on `(category)`
  - `idx_rules_default_severity` on `(default_severity)`
  - GIN index: `idx_rules_tags_gin` on `tags`

### 8.4. JSONB kullanımı

- `tags` ve `references` için `text[]` çoğu durumda yeterli; daha zengin metadata gerekirse `jsonb`.

### 8.5. Retention

- Rule catalog uzun ömürlüdür; geçmiş raporların yorumlanması için gereklidir, TTL uygulanmaz.

---

## 9. findings

### 9.1. Amaç

Dedup edilmiş, fingerprint bazlı “finding template” kayıtları.  
Aynı problemi temsil eden birden fazla occurrence (farklı scan’ler, run’lar) için tek kaynaktır.

### 9.2. Sütunlar

- `id` (PK)
- `rule_id` (FK → rules_catalog.id)
- `target_id` (FK → targets.id)
- `category` (smallint/enum; redundansa izin verilir, rule’dan derive edilebilir)
- `severity` (smallint/enum) – **en güncel severity** (rule değişikliği veya override sonrası).
- `status` (smallint/enum; `OPEN`, `FIXED`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `IGNORED`)
- `title` (varchar, not null)
- `remediation` (text)
- `url` (varchar, not null) – normalize edilmiş ana URL.
- `parameter` (varchar, not null, default '-') – yoksa ‘-’.
- `primary_evidence_key` (varchar, not null) – header adı, DOM selector, cookie adı vb.
- `fingerprint` (varchar(64) veya benzeri, not null) – deterministik hash.
- `first_seen_at` (timestamptz, not null)
- `last_seen_at` (timestamptz, not null)
- `occurrence_count` (bigint, not null, default 0)
- `metadata` (jsonb, opsiyonel; ek nitelikler)

### 9.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**:
  - `rule_id` → `rules_catalog.id`
  - `target_id` → `targets.id`
- **Unique**:
  - `fingerprint` – **deduplikasyonun temel garantisi**.
- **Index önerileri**:
  - `idx_findings_target` on `(target_id)`
  - `idx_findings_status` on `(status)`
  - `idx_findings_severity` on `(severity)`
  - `idx_findings_rule` on `(rule_id)`

### 9.4. JSONB kullanımı

- `metadata` – ek alanlar (ör. `{"owasp":"A6","cwe":"CWE-200"}`) için jsonb.

### 9.5. Retention

- Findings uzun ömürlüdür; trend ve compliance için gereklidir. TTL uygulanmaz; ancak çok eski ve FIXED bulgular arşive taşınabilir.

---

## 10. evidence

### 10.1. Amaç

Finding’leri destekleyen kanıt parçaları.

### 10.2. Sütunlar

- `id` (PK)
- `scan_job_id` (FK → scan_jobs.id)
- `page_id` (FK → pages.id, nullable)
- `request_id` (FK → requests.id, nullable)
- `type` (smallint/enum; `HEADER`, `BODY_SNIPPET`, `DOM_SNIPPET`, `SCREENSHOT`, `NETWORK_TRACE`, `CONSOLE_LOG`, `UI_EVENT_LOG`, `OTHER`)
- `description` (text, nullable)
- `storage_pointer` (varchar, not null)
- `metadata` (jsonb, nullable) – header name, selector, line number vb.
- `created_at` (timestamptz, not null)

### 10.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**:
  - `scan_job_id` → `scan_jobs.id`
  - `page_id` → `pages.id`
  - `request_id` → `requests.id`
- **Index önerileri**:
  - `idx_evidence_scan_job` on `(scan_job_id)`
  - `idx_evidence_page` on `(page_id)`
  - `idx_evidence_request` on `(request_id)`
  - `idx_evidence_type` on `(type)`
  - GIN index: `idx_evidence_metadata_gin` on `metadata`

### 10.4. JSONB kullanımı

- `metadata` jsonb, esnek sorgular (örn. `metadata->>'headerName' = 'Set-Cookie'`) için kullanılır.

### 10.5. Retention

- `storage_pointer` işaret ettiği blob’lar büyük olabilir (screenshot, trace vb.).  
  Öneri:
  - Evidence blob’ları için ayrı bir retention policy (örn. 90–365 gün).
  - Eski evidence blob’ları silindiğinde, satır tutulabilir ancak pointer’ın geçersiz olduğu işaretlenebilir (`metadata` içine `{"expired": true}`).

---

## 11. finding_instances

### 11.1. Amaç

Aynı finding template’inin (fingerprint) farklı scan’lerde ve sayfalarda görülen **occurrence** kayıtları.

### 11.2. Sütunlar

- `id` (PK)
- `finding_id` (FK → findings.id)
- `scan_id` (FK → scans.id)
- `scan_job_id` (FK → scan_jobs.id, nullable)
- `page_id` (FK → pages.id, nullable)
- `request_id` (FK → requests.id, nullable)
- `primary_evidence_id` (FK → evidence.id, nullable)
- `url` (varchar, not null)
- `parameter` (varchar, not null, default '-')
- `detected_at` (timestamptz, not null)

### 11.3. PK/FK, Unique, Index

- **PK**: `id`
- **FK**:
  - `finding_id` → `findings.id`
  - `scan_id` → `scans.id`
  - `scan_job_id` → `scan_jobs.id`
  - `page_id` → `pages.id`
  - `request_id` → `requests.id`
  - `primary_evidence_id` → `evidence.id`
- **Unique** (öneri – tam dedup için):
  - `(finding_id, scan_id, page_id, request_id, parameter, primary_evidence_id)` – aynı occurrence’ın yanlışlıkla iki kez yazılmasını önler.
- **Index önerileri**:
  - `idx_finding_instances_finding` on `(finding_id)`
  - `idx_finding_instances_scan` on `(scan_id)`
  - `idx_finding_instances_page` on `(page_id)`
  - `idx_finding_instances_request` on `(request_id)`

### 11.4. Retention

- Finding template’lerinden daha kısa veya eşit ömürlü olabilir.  
  Eski scan’lar için occurrence kayıtları daha agresif şekilde arşivlenebilir veya silinebilir; findings tablosu aggregate bilgileri tutmaya devam eder.

---

## 12. metrics_timeseries (opsiyonel)

### 12.1. Amaç

Scan, target veya runner düzeyinde **zaman serisi metrikleri** depolamak.  
Örn. scan latency, queue depth, error rate, pages per minute, vb.

### 12.2. Sütunlar

- `id` (PK)
- `scope_type` (smallint/enum; `SCAN`, `TARGET`, `RUNNER_NODE`, `GLOBAL`)
- `scope_id` (varchar; scan_id, target_id veya runner_node_id)
- `timestamp` (timestamptz, not null)
- `metric_name` (varchar, not null) – örn. `scan_latency_seconds`, `pages_scanned`, `requests_total`.
- `metric_value` (double precision, not null)
- `labels` (jsonb, nullable) – ek boyutlar (örn. `{"status":"SUCCEEDED","rulePack":"web-core-1.0.0"}`).

### 12.3. PK/FK, Unique, Index

- **PK**: `id`
- **Unique (öneri)**:
  - `(scope_type, scope_id, timestamp, metric_name, hash(labels))` – zaman serisi cardinality’sini kontrol altına almak için.
- **Index önerileri**:
  - `idx_metrics_scope_time` on `(scope_type, scope_id, timestamp)`
  - `idx_metrics_metric_name` on `(metric_name)`
  - GIN index: `idx_metrics_labels_gin` on `labels`

### 12.4. JSONB kullanımı

- `labels` jsonb, Prometheus etiket mantığına benzer esnek boyutlar için.

### 12.5. Retention

- Bu tablo doğal olarak **zaman serisi**. Öneri:
  - Range partitioning by time (örn. aylık partition).
  - Partition başına TTL (örn. 6–12 ay).
  - Eski partition’ların drop edilmesi ile hızlı temizlik.

---

## 13. Genel Retention / TTL Stratejisi

- **Uzun ömürlü tablolar**:
  - `targets`, `auth_profiles`, `rules_catalog`, `findings`:
    - TTL yok veya çok uzun (yıllar).
    - Critical compliance ve trend analizi için gerekliler.
- **Orta ömürlü tablolar**:
  - `scans`, `scan_jobs`, `finding_instances`:
    - Kullanım durumuna göre 1–3 yıl tutulabilir.
    - Eski dönemler için arşivleme (ayrı schema veya ayrı DB) düşünülebilir.
- **Kısa ömürlü / hacimli tablolar**:
  - `pages`, `requests`, `evidence`, `metrics_timeseries`:
    - Zaman temelli partitioning + TTL (örn. 90–365 gün).
    - Blob pointer’larının işaret ettiği veri (html/screenshot/trace/body) için bağımsız object storage TTL.

Bu strateji, hem **güvenlik ekipleri için zengin geçmiş veri** sunar, hem de veritabanı boyutunu ve IO yükünü yönetilebilir tutar.

