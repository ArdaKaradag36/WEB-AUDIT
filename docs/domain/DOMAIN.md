# Kamu Web Audit – Domain Model (Nessus-benzeri)

Bu doküman, Kamu Web Audit için **Nessus-benzeri web application security scanner** hedefiyle tasarlanan domain modelini tanımlar.  
Amaç; Target, Scan, PageAsset, Finding, Rule, Evidence, Metrics ve UiCoverage kavramlarını, bunlar arasındaki ilişkileri, kullanılan enum’ları ve JSON örneklerini netleştirmektir.

> Not: Buradaki isimler C# sınıf isimleriyle bire bir aynı olmak zorunda değildir; konsept ve kontratları tanımlar.

---

## 1. Yüksek Seviye Domain Kavramları

Ana kavramlar:

- **Target** – Tarama yapılacak web uygulaması veya site (ör. `https://www.ornek.gov.tr`).
- **ScanConfig** – Bir tarama için konfigürasyon (budget, maxPages, depth, authProfile, throttling, retryPolicy, rule packs).
- **Scan** – Kullanıcı veya sistem tarafından tetiklenen mantıksal tarama isteği (kampanya / run grubu).
- **ScanJob** – Queue’ye giren, runner tarafından işlenecek atomik iş birimi.
- **ScanRun** – Bir ScanJob için yapılan tek çalıştırma (attempt); retry’ler için birden fazla olabilir.
- **PageAsset** – Tarama sırasında elde edilen sayfa varlıkları (HTML, screenshot, console/network log referansları).
- **Finding** – Rule engine tarafından üretilen, deduplikasyon yapılabilen güvenlik/kalite bulgusu.
- **Rule** – Belirli bir güvenlik/kalite kuralının tanımı (kategori, severity, tags, detect, remediate).
- **Evidence** – Finding’leri destekleyen kanıtlar (header/snippet/screenshot/trace vb.).
- **Metrics** – ScanRun ve target düzeyinde metrikler (latency, pagesScanned, requests, errors, timeouts).
- **UiCoverage** – UI element envanteri, coverage durumu, gaps ve normalize edilmiş grup bilgileri.

---

## 2. Target

**Target**, taranacak web uygulamasının veya sitenin domain modeldeki temsilidir.

### 2.1. Ana Alanlar

- `id` – Benzersiz kimlik.
- `organizationId` – Kuruma ait kimlik.
- `projectId` – Varsa proje / uygulama grubu.
- `name` – İnsan tarafından okunabilir isim.
- `baseUrl` – Ana URL (örn. `https://www.ornek.gov.tr`).
- `labels` – Key-value etiketler (örn. `{"env":"prod","type":"portal"}`).
- `riskProfile` – Varsayılan risk profili (örn. `PUBLIC`, `INTERNAL`, `HIGH_SENSITIVITY`).
- `defaultScanConfigId` – Varsayılan ScanConfig referansı.
- `isActive` – Aktif/pasif.
- `createdAt`, `updatedAt`.

### 2.2. Örnek JSON

```json
{
  "id": "target-001",
  "organizationId": "org-1",
  "projectId": "proj-portal",
  "name": "Örnek Kamu Portalı",
  "baseUrl": "https://www.ornek.gov.tr",
  "labels": {
    "env": "prod",
    "type": "citizen-portal"
  },
  "riskProfile": "PUBLIC",
  "defaultScanConfigId": "scan-config-quick",
  "isActive": true,
  "createdAt": "2026-03-05T10:00:00Z",
  "updatedAt": "2026-03-05T10:00:00Z"
}
```

---

## 3. ScanConfig

**ScanConfig**, bir taramanın parametrelerini ve sınırlarını tanımlar.

### 3.1. Ana Alanlar

- `id`, `name`, `description`.
- `targetId` veya daha geniş kapsam için `scope` alanı (örn. bir proje veya org düzeyinde).
- `budget`:
  - `maxPages` – Taranacak maksimum sayfa sayısı.
  - `maxDepth` – Link takibinde izin verilen maksimum derinlik.
  - `maxDurationSeconds` – Toplam tarama süresi sınırı.
  - `maxRequests` – Toplam HTTP istek sayısı sınırı.
- `authProfileId` – Login / session yönetimi profili referansı.
- `throttling`:
  - `maxRps` – Maksimum istek/saniye.
  - `maxConcurrentRequests` – Eş zamanlı istek limiti.
  - `politenessDelayMs` – Her istek arası minimum bekleme (isteğe bağlı).
- `retryPolicy`:
  - `maxRetries` – Tek bir istek için maksimum retry sayısı.
  - `backoffStrategy` – `NONE`, `LINEAR`, `EXPONENTIAL`.
  - `retryableStatusCodes` – Örn. `[429, 500, 502, 503, 504]`.
- `rulePackIds` – Uygulanacak rule pack listesi (örn. `["web-core-1.0.0", "security-headers-1.0.0"]`).

### 3.2. Örnek JSON

```json
{
  "id": "scan-config-quick",
  "targetId": "target-001",
  "name": "Quick security scan",
  "description": "Hızlı web security taraması (header + cookie + temel XSS sinyalleri).",
  "budget": {
    "maxPages": 50,
    "maxDepth": 3,
    "maxDurationSeconds": 900,
    "maxRequests": 2000
  },
  "authProfileId": "auth-profile-public",
  "throttling": {
    "maxRps": 2,
    "maxConcurrentRequests": 4,
    "politenessDelayMs": 200
  },
  "retryPolicy": {
    "maxRetries": 2,
    "backoffStrategy": "EXPONENTIAL",
    "retryableStatusCodes": [429, 500, 502, 503, 504]
  },
  "rulePackIds": [
    "web-core-1.0.0",
    "security-headers-1.0.0",
    "cookie-security-1.0.0"
  ]
}
```

---

## 4. Scan, ScanJob, ScanRun

### 4.1. Scan

**Scan**, kullanıcı veya sistemin tetiklediği mantıksal taramayı temsil eder (Nessus’ta bir “scan” tanımı gibi).

- `id`
- `targetId`
- `scanConfigId`
- `requestedByUserId`
- `status` – `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- `scheduledAt` – Zamanlanmış başlama zamanı (hemen değilse).
- `createdAt`, `updatedAt`.

Örnek:

```json
{
  "id": "scan-20260305-001",
  "targetId": "target-001",
  "scanConfigId": "scan-config-quick",
  "requestedByUserId": "user-123",
  "status": "RUNNING",
  "scheduledAt": "2026-03-05T10:05:00Z",
  "createdAt": "2026-03-05T10:00:00Z",
  "updatedAt": "2026-03-05T10:06:30Z"
}
```

### 4.2. ScanJob

**ScanJob**, queue’ye atılan ve runner tarafından tüketilen iş birimidir. Genellikle `Scan` ile bire bir eşlenebilir, ancak büyük taramalar için shard’lanmış da olabilir.

- `id`
- `scanId`
- `shardIndex` (opsiyonel) – Büyük taramalarda bölümlere ayırmak için.
- `status` – `QUEUED`, `DISPATCHED`, `TIMED_OUT`, `COMPLETED`, `FAILED`.
- `priority`
- `createdAt`, `dispatchedAt`, `completedAt`.

Örnek:

```json
{
  "id": "scan-job-abc123",
  "scanId": "scan-20260305-001",
  "shardIndex": 0,
  "status": "DISPATCHED",
  "priority": "NORMAL",
  "createdAt": "2026-03-05T10:00:05Z",
  "dispatchedAt": "2026-03-05T10:05:01Z",
  "completedAt": null
}
```

### 4.3. ScanRun

**ScanRun**, bir ScanJob için yapılan tek attempt’tir. Retry’ler için birden çok `ScanRun` olabilir.

- `id`
- `scanId`
- `scanJobId`
- `attemptNumber` – 1’den başlar.
- `status` – `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `PARTIAL`.
- `metricsId` – İlgili `Metrics` kaydına referans.
- `startedAt`, `completedAt`.
- `failureReason` (opsiyonel).

Örnek:

```json
{
  "id": "scan-run-1",
  "scanId": "scan-20260305-001",
  "scanJobId": "scan-job-abc123",
  "attemptNumber": 1,
  "status": "SUCCEEDED",
  "metricsId": "metrics-scan-run-1",
  "startedAt": "2026-03-05T10:05:02Z",
  "completedAt": "2026-03-05T10:15:45Z",
  "failureReason": null
}
```

---

## 5. PageAsset

**PageAsset**, tarama sırasında elde edilen sayfa bazlı varlıkları temsil eder.

### 5.1. Ana Alanlar

- `id`
- `scanRunId`
- `url` – Normalize edilmiş sayfa URL’si.
- `statusCode`
- `contentType`
- `htmlRef` – HTML içeriğinin tutulduğu storage pointer (örn. object storage key).
- `screenshotRef` – Ekran görüntüsü pointer’ı.
- `consoleLogRef` – Console logları için pointer.
- `networkLogRef` – Network trace için pointer.
- `collectedAt`

### 5.2. Örnek JSON

```json
{
  "id": "page-001",
  "scanRunId": "scan-run-1",
  "url": "https://www.ornek.gov.tr/login",
  "statusCode": 200,
  "contentType": "text/html",
  "htmlRef": "blob://scan-run-1/pages/001.html",
  "screenshotRef": "blob://scan-run-1/screenshots/001.png",
  "consoleLogRef": "blob://scan-run-1/console/001.json",
  "networkLogRef": "blob://scan-run-1/network/001.har",
  "collectedAt": "2026-03-05T10:06:10Z"
}
```

---

## 6. Evidence

**Evidence**, bir Finding’i destekleyen kanıtları taşır. Evidence kendisi genellikle büyük veri blob’larına işaret eder.

### 6.1. Enum: EvidenceType

- `HEADER`
- `BODY_SNIPPET`
- `DOM_SNIPPET`
- `SCREENSHOT`
- `NETWORK_TRACE`
- `CONSOLE_LOG`
- `UI_EVENT_LOG`
- `OTHER`

### 6.2. Ana Alanlar

- `id`
- `scanRunId`
- `type` – `EvidenceType`.
- `description` – Kısa açıklama.
- `storagePointer` – Blob storage veya dosya sistemine işaret eden string.
- `metadata` – Key-value ek bilgiler (örn. header name, line number, selector vs.).

### 6.3. Örnek JSON

```json
{
  "id": "evidence-001",
  "scanRunId": "scan-run-1",
  "type": "HEADER",
  "description": "Response headers for https://www.ornek.gov.tr/login",
  "storagePointer": "blob://scan-run-1/headers/login.json",
  "metadata": {
    "url": "https://www.ornek.gov.tr/login"
  }
}
```

---

## 7. Rule

**Rule**, belirli bir güvenlik/kalite kuralını temsil eder.

### 7.1. Enum: RuleCategory

Örnek kategoriler:

- `SECURITY_HEADER`
- `TLS`
- `COOKIE`
- `XSS`
- `CSRF`
- `AUTHENTICATION`
- `AUTHORIZATION`
- `INPUT_VALIDATION`
- `CONFIGURATION`
- `AVAILABILITY`
- `BEST_PRACTICE`
- `OTHER`

### 7.2. Enum: Severity

- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`
- `INFO`

### 7.3. Ana Alanlar

- `id` – Kural kimliği (örn. `KWA-SEC-001`).
- `category` – `RuleCategory`.
- `severity` – Varsayılan `Severity`.
- `tags` – List of string (örn. `["owasp-a6", "security-header"]`).
- `title` – Kısa başlık.
- `description` – Ayrıntılı açıklama.
- `references` – URL listesi (OWASP, CWE, doküman linkleri).
- `detect` – Detection mantığının insanlar için okunabilir tanımı (kural koşulu; implementation Infra’da).
- `remediate` – Önerilen çözüm/adımların açıklaması.

### 7.4. Örnek JSON

```json
{
  "id": "KWA-SEC-001",
  "category": "SECURITY_HEADER",
  "severity": "HIGH",
  "tags": ["owasp-a6", "missing-hsts"],
  "title": "Strict-Transport-Security header is missing",
  "description": "The Strict-Transport-Security (HSTS) header is not present on HTTPS responses, increasing the risk of protocol downgrade and SSL stripping attacks.",
  "references": [
    "https://owasp.org/www-project-top-ten/",
    "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security"
  ],
  "detect": "On HTTPS responses, check if the Strict-Transport-Security header is present with a max-age value >= 15552000.",
  "remediate": "Configure the web server to send the Strict-Transport-Security header with an appropriate max-age and includeSubDomains directive if applicable."
}
```

---

## 8. Finding

**Finding**, Rule engine’in ürettiği, deduplikasyon yapılabilir bir bulgudur.

### 8.1. Enum: Confidence

- `CERTAIN`
- `HIGH`
- `MEDIUM`
- `LOW`
- `UNKNOWN`

### 8.2. Enum: FindingStatus

- `OPEN`
- `FIXED`
- `ACCEPTED_RISK`
- `FALSE_POSITIVE`
- `IGNORED`

### 8.3. Ana Alanlar

- `id` – Benzersiz kimlik (tekil kayıt için).
- `scanId`
- `scanRunId`
- `ruleId`
- `title`
- `severity` – `Severity`.
- `confidence` – `Confidence`.
- `category` – `RuleCategory`.
- `status` – `FindingStatus`.
- `url` – İlgili URL (normalize edilmiş).
- `parameter` – Varsa ilgili parametre adı (query param, form field, header adı vb.).
- `evidenceRef` – Bir veya daha fazla `Evidence` kaydına referanslar.
- `remediation` – Önerilen çözüm özeti.
- `fingerprint` – **Deduplikasyon için zorunlu, deterministik kimlik** (aşağıda ayrıntı).
- `firstSeenAt` – Bu fingerprint için ilk görüldüğü zaman.
- `lastSeenAt` – Bu fingerprint için son görüldüğü zaman.
- `occurrenceCount` – Aynı fingerprint’in toplam görülme sayısı (tüm ScanRun’lar boyunca).

### 8.4. Fingerprint Kuralı (Deduplication)

Bir Finding’in fingerprint’i, aynı mantıksal problemi temsil eden bulguları **scan ve run’lardan bağımsız** olarak eşleyebilmek için kullanılır.

Önerilen deterministik fingerprint girişi:

- `ruleId`
- `normalizedUrl` – Örn. scheme + host + path (parametre normalizasyonu yapılmış).
- `parameter` – Yoksa `"-"` gibi sabit bir değer.
- `primaryEvidenceKey` – Evidence metadata’sından stabil bir alan (örn. header name, DOM selector, cookie name).

Örnek pseudo:

```text
rawKey = lowerCase(ruleId + "|" + normalizedUrl + "|" + parameterOrDash + "|" + primaryEvidenceKey)
fingerprint = SHA-256(rawKey)
```

Bu fingerprint:

- Aynı rule + aynı URL + aynı parametre + aynı evidence anahtarı için aynı olacaktır.
- ScanRun’lar ve zaman içinde değişmeyen problemler için sabit kalır (trend analizi ve MTTR için gereklidir).

### 8.5. Örnek JSON

```json
{
  "id": "finding-0001",
  "scanId": "scan-20260305-001",
  "scanRunId": "scan-run-1",
  "ruleId": "KWA-SEC-001",
  "title": "Strict-Transport-Security header is missing on login page",
  "severity": "HIGH",
  "confidence": "CERTAIN",
  "category": "SECURITY_HEADER",
  "status": "OPEN",
  "url": "https://www.ornek.gov.tr/login",
  "parameter": "-",
  "evidenceRef": ["evidence-001"],
  "remediation": "Enable HSTS on HTTPS responses for the login page and the main site.",
  "fingerprint": "f2b9b3b9c7b1a0f5a1e6c0e2c2d1e5f9c89a4d7e2e3a1b6c5d7e9f0a1b2c3d4",
  "firstSeenAt": "2026-03-05T10:16:00Z",
  "lastSeenAt": "2026-03-05T10:16:00Z",
  "occurrenceCount": 1
}
```

> Not: Fingerprint örneğinde kullanılan hash değeri temsili olup, gerçek sistemde SHA-256 veya benzeri bir algoritma ile üretilecektir.

---

## 9. Metrics

**Metrics**, özellikle ScanRun düzeyinde performans ve güvenilirlik metriklerini taşır.

### 9.1. Ana Alanlar (ScanRun düzeyi)

- `id`
- `scanRunId`
- `latencySeconds` – ScanRun toplam süresi (run-level).
- `pagesScanned`
- `requestsTotal`
- `requestsSucceeded`
- `requestsFailed`
- `timeouts`
- `avgResponseTimeMs`
- `maxResponseTimeMs`
- `errorRate` – `requestsFailed / requestsTotal`.

### 9.2. Örnek JSON

```json
{
  "id": "metrics-scan-run-1",
  "scanRunId": "scan-run-1",
  "latencySeconds": 643,
  "pagesScanned": 42,
  "requestsTotal": 480,
  "requestsSucceeded": 470,
  "requestsFailed": 10,
  "timeouts": 2,
  "avgResponseTimeMs": 320,
  "maxResponseTimeMs": 2100,
  "errorRate": 0.0208
}
```

Gelecekte eklenebilecek alanlar:

- Rule başına evaluation süresi.
- Finding başına ortalama evidence büyüklüğü.
- Crawler coverage metriği (taranan URL / keşfedilen URL).

---

## 10. UiCoverage

**UiCoverage**, tarama sırasında tespit edilen UI elementlerinin envanteri, coverage durumu ve gaps bilgisini temsil eder. Mevcut `ui-inventory.json` ve `gaps.json` kavramlarını normalize eder.

### 10.1. Enum: UiElementStatus

- `TESTED_SUCCESS`
- `SKIPPED`
- `ATTEMPTED_FAILED`
- `ATTEMPTED_NO_EFFECT`
- `NOT_VISIBLE`
- `OUT_OF_VIEWPORT`
- `UNKNOWN`

### 10.2. Enum: UiGapSeverity

- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`
- `INFO`

### 10.3. Ana Yapı

- `scanRunId`
- `totalElements`
- `testedElements`
- `skippedElements`
- `failedElements`
- `byStatus` – `UiElementStatus` → count.
- `byGapSeverity` – `UiGapSeverity` → count.
- `elements` – Element envanteri:
  - `elementId`
  - `type`/`tagName`
  - `humanName`
  - `pageUrl`
  - `status` – `UiElementStatus`.
  - `reasonCode` – SKIPPED / FAILED için sebep (örn. `NOT_VISIBLE`, `SELECTOR_AMBIGUOUS`, `TIMEOUT`).
  - `riskLevel` – Örn. `safe`, `needs_allowlist`, `destructive`, `requires_auth`.
  - `recommendedSelectors`
  - `attempts[]` – Her UI aksiyonu için detaylar.
- `gaps` – Önemli coverage boşlukları:
  - `elementId`
  - `pageUrl`
  - `gapSeverity` – `UiGapSeverity`.
  - `actionHint`
  - `recommendedScript`
- `normalizedGroups` – Benzer elementlerin normalize edilmiş grupları (örn. “primary actions”, “dangerous actions”):
  - `groupId`
  - `groupName`
  - `criteria` (tag, role, text pattern, riskLevel vb.)
  - `elementIds[]`

### 10.4. Örnek JSON (Özet)

```json
{
  "scanRunId": "scan-run-1",
  "totalElements": 120,
  "testedElements": 80,
  "skippedElements": 30,
  "failedElements": 10,
  "byStatus": {
    "TESTED_SUCCESS": 80,
    "SKIPPED": 20,
    "ATTEMPTED_FAILED": 8,
    "ATTEMPTED_NO_EFFECT": 2,
    "NOT_VISIBLE": 5,
    "OUT_OF_VIEWPORT": 3,
    "UNKNOWN": 2
  },
  "byGapSeverity": {
    "CRITICAL": 1,
    "HIGH": 3,
    "MEDIUM": 5,
    "LOW": 4,
    "INFO": 2
  },
  "elements": [
    {
      "elementId": "el-0-button-login",
      "type": "button",
      "humanName": "Giriş",
      "pageUrl": "https://www.ornek.gov.tr/login",
      "status": "TESTED_SUCCESS",
      "reasonCode": null,
      "riskLevel": "requires_auth",
      "recommendedSelectors": ["role=button[name=\"Giriş\"]"],
      "attempts": [
        {
          "action": "click",
          "outcome": "SUCCESS",
          "timestamp": "2026-03-05T10:06:12Z"
        }
      ]
    }
  ],
  "gaps": [
    {
      "elementId": "el-42-button-delete",
      "pageUrl": "https://www.ornek.gov.tr/admin/users",
      "gapSeverity": "HIGH",
      "actionHint": "Destructive admin action, requires manual allowlist before automatic testing.",
      "recommendedScript": "click('button[aria-label=\"Kullanıcıyı sil\"]', { confirmDialog: true })"
    }
  ],
  "normalizedGroups": [
    {
      "groupId": "group-primary-actions",
      "groupName": "Primary actions",
      "criteria": {
        "role": "button",
        "classPattern": "btn-primary"
      },
      "elementIds": ["el-0-button-login", "el-10-button-submit", "el-11-button-save"]
    }
  ]
}
```

---

## 11. Özet

- Domain modeli, **Target → Scan → ScanJob → ScanRun** zinciriyle tarama yaşam döngüsünü yönetir.
- **ScanConfig** ve auth/throttling/budget ayarları, Nessus-benzeri profiler yaratmayı mümkün kılar.
- **Finding** nesneleri, **deterministik fingerprint** alanı ile deduplikasyon ve trend analizi için tasarlanmıştır.
- **Rule, Evidence, Metrics, UiCoverage** kavramları; hem güvenlik ekipleri için anlamlı, hem de runner/ingestion altyapısından bağımsız kullanılabilir olacak şekilde tanımlanmıştır.

