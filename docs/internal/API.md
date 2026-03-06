## Kamu Web Audit – API Genel Bakış

Last updated: 2026-03-05

Bu doküman, Kamu Web Audit API’lerinin **yüksek seviye** özetini verir ve detaylı
OpenAPI sözleşmesine (`docs/api/openapi.yaml`) referans olur. Uygulamalı kullanım
örnekleri için `docs/api/API_GUIDE.md` dosyasına bakın.

---

### 1. Kimlik Doğrulama ve Yetkilendirme

- Tüm API’ler JWT tabanlı **Bearer token** ile korunur:
  - `Authorization: Bearer <access_token>`
- Token içinde tipik alanlar:
  - `sub` – kullanıcı kimliği,
  - `role` veya `permissions[]` – yetki seti.
- Uzun oturumlar için refresh token mekanizması ADR ile tanımlanmıştır:
  - `docs/architecture/adr/0002-auth-cookie-vs-localstorage.md`.

---

### 2. Ana Kaynaklar ve Akış

Temel akış:

1. **Target oluştur** – `POST /targets`
2. (Opsiyonel) **Auth profile oluştur** – `POST /auth-profiles`
3. **Scan oluştur** – `POST /scans` (idempotent; `Idempotency-Key` header’ı ile)
4. **Scan’i başlat** – `POST /scans/{id}/start`
5. **Scan durumunu izle** – `GET /scans/{id}`
6. **Findings al** – `GET /scans/{id}/findings`
7. **Rapor al** – `GET /scans/{id}/report?format=json|pdf`
8. **Rules catalog** – `GET /rules-catalog`

Detaylı örnek HTTP istek/yanıtları için: `docs/api/API_GUIDE.md`.

---

### 3. Hata Modeli (problem+json)

API, 4xx/5xx durumlarında **RFC 7807 – Problem Details** formatını kullanır:

- Content-Type: `application/problem+json`
- Tipik alanlar:
  - `type`, `title`, `status`, `detail`, `instance`
  - İsteğe bağlı `errors` nesnesi (validation hataları için)

Örnek (validation hatası):

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

Frontend tarafında:

- `status` HTTP kodu ile uyumlu kullanılır,
- `errors` alanı form alanı bazlı hata gösterimi için doğrudan işlenebilir.

---

### 4. Rate Limiting Başlıkları

Sık kullanılan listeleme ve oluşturma uçları rate limit altındadır:

- Yanıtlarda:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- Limit aşıldığında:
  - `429 Too Many Requests`
  - `Retry-After` header’ı,
  - Gövdede yine `ProblemDetails` formatı.

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

### 5. OpenAPI Dosyası ve Şemalar

Tüm endpoint’ler, istek/gönderim şemaları ve enum’lar:

- `docs/api/openapi.yaml` içinde tanımlıdır.
  - `paths` – endpoint listesi,
  - `components/schemas` – DTO şemaları,
  - `components/parameters` – pagination ve filtre parametreleri.

Bu dosya:

- API client üretimi (TypeScript, C#, Java vb. için),
- Mock server’lar,
- API dokümantasyon UI’ları (Swagger UI, Redoc) için kullanılabilir.

