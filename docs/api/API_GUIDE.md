# Kamu Web Audit API – Kullanım Kılavuzu

Bu doküman, `openapi.yaml` ile tanımlanan **Kamu Web Audit API** için pratik kullanım rehberidir.  
Hedef kitle; güvenlik mühendisleri, QA ekipleri ve CI/CD entegrasyonu yapan geliştiricilerdir.

---

## 1. Kimlik Doğrulama (JWT) ve Yetkilendirme

- API, **Bearer JWT** kullanır:
  - HTTP header: `Authorization: Bearer <access_token>`
- Token içinde tipik alanlar:
  - `sub` – kullanıcı kimliği
  - `role` veya `permissions[]` – yetkiler (örn. `Scan.Create`, `Finding.Read`, `Rule.Read`)
- Tüm endpoint’ler (ör. `/targets`, `/scans`, `/rules-catalog`) varsayılan olarak **JWT gerektirir**.

> Öneri (ADR için not): Access token’ların süresi kısa olmalı; uzun oturumlar için **refresh token** mekanizması ayrı bir auth endpoint set’i ile tasarlanmalıdır (bu sözleşmenin kapsamı dışındadır, ancak mimari karar kaydında belirtilmelidir).

---

## 2. Temel Kaynaklar ve Akış

Yaygın kullanım akışı:

1. **Target oluştur** (`POST /targets`)
2. Gerekirse **Auth Profile oluştur** (`POST /auth-profiles`)
3. **Scan oluştur** (`POST /scans`)
4. **Scan’i başlat** (`POST /scans/{id}/start`)
5. **Scan durumunu takip et** (`GET /scans/{id}`)
6. **Scan findings’leri al** (`GET /scans/{id}/findings`)
7. **Scan raporu al** (`GET /scans/{id}/report?format=json|pdf`)
8. Gerekirse **Rules Catalog’u** listele (`GET /rules-catalog`)

---

## 3. Targets API

### 3.1. Target Oluşturma

`POST /targets`

Örnek istek:

```http
POST /targets HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Örnek Kamu Portalı",
  "baseUrl": "https://www.ornek.gov.tr",
  "riskProfile": "PUBLIC",
  "labels": {
    "env": "prod",
    "team": "web-security"
  }
}
```

Başarılı durumda:

- HTTP `201 Created`
- `Location` header’ında yeni target URL’si

### 3.2. Target Listeleme

`GET /targets?page=1&pageSize=20&search=portal&isActive=true`

Dönen gövde:

- `items[]` – Target listesi
- `meta` – pagination metadata

---

## 4. Auth Profiles (Login Steps)

`POST /auth-profiles`

Amaç: Login form selector’ları, alan eşlemeleri ve başarı kriterlerini tanımlayan yeniden kullanılabilir auth profilleri oluşturmak.

Örnek:

```http
POST /auth-profiles HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Portal Login (Citizen)",
  "type": "FORM_LOGIN",
  "config": {
    "loginUrl": "https://www.ornek.gov.tr/login",
    "usernameSelector": "input[name=\"tcno\"]",
    "passwordSelector": "input[name=\"password\"]",
    "submitSelector": "button[type=\"submit\"]",
    "successIndicator": {
      "selector": "a[href=\"/logout\"]"
    }
  }
}
```

Bu profil daha sonra `ScanConfig.authProfileId` ile bir taramaya bağlanabilir.

---

## 5. Scan / Audit Yönetimi

### 5.1. Audit Oluşturma (Idempotent)

`POST /api/audits`

- **Idempotency-Key** header’ı kullanarak güvenli tekrar deneme sağlanır.
- Aynı kullanıcı + aynı `Idempotency-Key` + mantıksal aynı istek gövdesi için sunucu:
  - İlk istekte audit run’ı oluşturur ve **201 Created** döner.
  - Sonraki isteklerde **aynı audit run’ı** döndürür ve **200 OK** dönebilir (idempotent replay).
- Aynı kullanıcı + aynı `Idempotency-Key` + **farklı istek gövdesi** için:
  - Sunucu `409 Conflict` döndürür ve key’in yeniden kullanımının hatalı olduğunu belirtir.
 - Idempotency key’lerin **TTL politikası**:
   - Varsayılan olarak `Idempotency:RetentionHours = 24` (24 saat) sonra key **süresi dolar**.
   - Süresi dolmuş bir key ile gelen istek, yeni bir idempotent create isteği gibi değerlendirilir (yani eski mapping yok sayılır).
   - Arka planda çalışan bir temizlik job’u (`IdempotencyCleanupBackgroundService`), periyodik olarak `idempotency_keys` tablosundaki süresi dolmuş kayıtları temizler.

Örnek:

```http
POST /api/audits HTTP/1.1
Authorization: Bearer <token>
Idempotency-Key: 5f4dcc3b-1d2e-4f31-9e1a-1234567890ab
Content-Type: application/json

{
  "targetUrl": "https://www.ornek.gov.tr",
  "maxLinks": 50,
  "maxUiAttempts": 30,
  "safeMode": true,
  "strict": false,
  "browser": "chromium",
  "plugins": "cookie-consent,nvi-cookie-consent"
}
```

Başarılı durumda:

- İlk istekte:
  - HTTP `201 Created`
  - Gövdede `AuditRunDetailDto` nesnesi
- Aynı header + aynı body ile tekrar çağrıldığında:
  - HTTP `200 OK`
  - Gövdede **aynı** `AuditRunDetailDto.Id`

### 5.2. Scan Başlatma

`POST /scans/{id}/start`

- Gövde yoktur; server, scan’i `QUEUED/RUNNING` durumuna geçirir.
- HTTP `202 Accepted` döner ve güncel scan durumu gövdede yer alır.

### 5.3. Scan İptali

`POST /scans/{id}/cancel`

- Henüz çalışmamış veya çalışan bir scan’e iptal isteği gönderir.
- Uygun değilse `409 Conflict` (ör. zaten `COMPLETED`).

### 5.4. Scan Durumu

`GET /scans/{id}`

- Dönen nesne `ScanStatus` alanına sahiptir:
  - `PENDING`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.

---

## 6. Findings Listeleme (Pagination & Filtering)

`GET /scans/{id}/findings`

Desteklenen query parametreleri:

- `page` (varsayılan `1`)
- `pageSize` (varsayılan `50`, max `200`)
- `severity` (çoklu):
  - Örn. `?severity=HIGH&severity=CRITICAL`
- `category` (çoklu):
  - Örn. `?category=SECURITY_HEADER&category=XSS`
- `url`:
  - Normalize edilmiş URL prefix; örn. `?url=https://www.ornek.gov.tr/admin`
- `status`:
  - `OPEN`, `FIXED`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `IGNORED`

Örnek:

```http
GET /scans/scan-20260305-001/findings?page=1&pageSize=20&severity=HIGH&severity=CRITICAL&url=https://www.ornek.gov.tr/login HTTP/1.1
Authorization: Bearer <token>
```

Örnek yanıt (özet):

```json
{
  "items": [
    {
      "id": "finding-0001",
      "scanId": "scan-20260305-001",
      "ruleId": "KWA-SEC-001",
      "title": "Strict-Transport-Security header is missing on login page",
      "severity": "HIGH",
      "confidence": "CERTAIN",
      "category": "SECURITY_HEADER",
      "status": "OPEN",
      "url": "https://www.ornek.gov.tr/login",
      "parameter": "-",
      "evidenceIds": ["evidence-001"],
      "remediation": "Enable HSTS on HTTPS responses for the login page and the main site.",
      "fingerprint": "f2b9...",
      "firstSeenAt": "2026-03-05T10:16:00Z",
      "lastSeenAt": "2026-03-05T10:16:00Z",
      "occurrenceCount": 1
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

---

## 7. Scan Report (JSON / PDF)

`GET /scans/{id}/report?format=json|pdf`

- `format` query parametresi:
  - `json` (varsayılan)
  - `pdf`

Örnek – JSON:

```http
GET /scans/scan-20260305-001/report?format=json HTTP/1.1
Authorization: Bearer <token>
Accept: application/json
```

Örnek – PDF:

```http
GET /scans/scan-20260305-001/report?format=pdf HTTP/1.1
Authorization: Bearer <token>
Accept: application/pdf
```

Yanıt:

- JSON için `application/json` gövde (`ScanReport` şeması).
- PDF için `application/pdf` binary gövde.

---

## 8. Rules Catalog

`GET /rules-catalog`

Kullanım örneği:

```http
GET /rules-catalog?page=1&pageSize=50&severity=HIGH&category=SECURITY_HEADER&search=hsts HTTP/1.1
Authorization: Bearer <token>
```

Döner:

- `items[]` içinde her bir rule:
  - `id`, `category`, `severity`, `tags`, `title`, `description`, `references`, `detect`, `remediate`
- `meta` içinde pagination bilgisi.

Bu API:

- Hangi kuralın ne yaptığına dair dokümantasyon için,
- Kurum içi policy mapping (örn. `KWA-SEC-001` → dahili policy ID),
- Dashboard ve raporlamalar için kullanılabilir.

---

## 9. Hata Modeli – problem+json

Tüm 4xx/5xx hatalar **RFC 7807** formatında `application/problem+json` döner:

Örnek 400 – Validation Error:

```json
{
  "type": "https://api.kamu-web-audit.example.com/problems/validation-error",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "The ScanCreateRequest payload is invalid.",
  "instance": "/scans",
  "errors": {
    "targetId": ["TargetId is required."],
    "config.maxPages": ["maxPages must be greater than zero."]
  }
}
```

İstemci tarafında:

- `status` HTTP kodu ile eşitlenir.
- `errors` alanı form bazlı doğrulama için doğrudan kullanılabilir.

---

## 10. Rate Limit Başlıkları

Listeleme ve yoğun kullanılan endpoint’ler, yanıtlarda şu başlıkları içerir:

- `X-RateLimit-Limit` – Mevcut pencere içindeki maksimum istek sayısı
- `X-RateLimit-Remaining` – Pencere sonuna kadar kalan istek sayısı
- `X-RateLimit-Reset` – Pencerenin sıfırlanacağı UTC epoch zamanı (saniye)

Limit aşıldığında:

- HTTP `429 Too Many Requests`
- Ek olarak `Retry-After` header’ı (saniye cinsinden) döner.
- Gövde, `ProblemDetails` formatındadır.

Örnek:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1781234567
Retry-After: 60
```

---

## 11. Güvenlik ve En İyi Uygulamalar

- **En az ayrıcalık**:
  - API token’larına sadece gerekli izinler verin (ör. sadece read-only dashboard için findings okuma).
- **Idempotent tasarım**:
  - CI/CD entegrasyonlarında `POST /scans` çağrılarını her zaman `Idempotency-Key` ile yapın.
- **Pagination zorunlu kabul edilmeli**:
  - Büyük kurumlarda findings sayısı çok yüksek olabilir; istemci, sayfa sayısı ve sayfa boyuna göre iteratif okuma yapmalıdır.
- **Hata ve rate limit yönetimi**:
  - `429` ve `5xx` durumları için exponential backoff + jitter stratejisi kullanın.

Bu kılavuz, `openapi.yaml` ile birlikte okunmalıdır. Sözleşmenin tam şemaları ve alan tanımları için `openapi.yaml` içindeki `components/schemas` bölümüne bakın.

