## WEB-AUDIT

### Proje Amacı: Ne işe yarar?

**WEB-AUDIT**, web uygulamalarını tarayıcı tabanlı (Playwright) denetleyerek teknik risk sinyalleri üreten bir denetim aracıdır. Çıktılar; güvenlik başlıkları, ağ hataları, erişilebilirlik/SEO/mahremiyet sinyalleri ve UI etkileşim kapsaması gibi alanlarda özetlenir.

### Kapsam & Hedef: Kimler, ne için kullanabilir?

- **Güvenlik ekipleri**: güvenlik başlıkları, SSRF/redirect riskleri, üçüncü taraf izleme sinyalleri
- **QA / ürün ekipleri**: kırık linkler, konsol hataları, temel erişilebilirlik kontrolleri
- **Platform/DevOps**: health endpoint’leri, retention, gözlemlenebilirlik, ölçekleme planı

> Ürün yaklaşımı: “güvenlik‑öncelikli” otomasyon. UI otomasyon metrikleri, iş kuralı doğruluğu yerine **sinyal** olarak değerlendirilmelidir.

### Yol Haritası (Status)

| Alan | Durum | Not |
|---|---:|---|
| Runner audit çekirdeği (HTTP/Network/Console) | %90 | CI’de testli |
| SSRF korumaları (host + runner) | %85 | Defense-in-depth önerilir |
| UI otomasyon (heuristics + allowlist) | %70 | Site/DOM yapısına göre değişir |
| Page analyzer (a11y/SEO/privacy sinyalleri) | %75 | A11y job ile CI’da çalışır |
| Postgres job store + worker ölçekleme | %60 | Mimari doküman hazır |
| Kurumsal hardening (mTLS, signing, policies) | %60 | Rehberler `docs/` altında |

### Çalıştırma

Kurulum ve kullanım adımları için `START.md` dosyasına bakın.

### Çıktılar (Artefaktlar)

Her çalışmada tipik olarak aşağıdaki dosyalar üretilir:

- `summary.json`
- `gaps.json`
- `ui-inventory.json` (varsa)
- `console.json`
- `network.json`
- `request_failed.json`
- `run.complete.json`

### Dokümantasyon

Kurumsal referans dokümanları `docs/` altındadır (security, compliance, CI, runbooks, mimari).

---

## WEB-AUDIT (English)

### Purpose: What does it do?

**WEB-AUDIT** is a browser-based (Playwright) auditing tool that produces technical risk signals for web applications. Outputs summarize security headers, network failures, accessibility/SEO/privacy signals, and UI interaction coverage.

### Scope & Audience: Who should use it?

- **Security teams**: header posture, SSRF/redirect exposure, third‑party tracking signals
- **QA / product teams**: broken links, console errors, baseline accessibility checks
- **Platform/DevOps**: health endpoints, retention, observability, scaling plan

> Product stance: security-first automation. UI automation metrics should be treated as a **signal**, not a correctness guarantee for business logic.

### Roadmap (Status)

| Area | Status | Notes |
|---|---:|---|
| Runner core (HTTP/Network/Console) | 90% | Covered in CI |
| SSRF protections (host + runner) | 85% | Defense-in-depth recommended |
| UI automation (heuristics + allowlist) | 70% | Highly site-dependent |
| Page analyzer (a11y/SEO/privacy signals) | 75% | Runs in dedicated CI job |
| Postgres job store + worker scaling | 60% | Architecture doc available |
| Enterprise hardening (mTLS, signing, policies) | 60% | Guides under `docs/` |

### Running the project

See `START.md` for setup and usage instructions.

### Outputs (Artifacts)

Each run typically produces:

- `summary.json`
- `gaps.json`
- `ui-inventory.json` (if available)
- `console.json`
- `network.json`
- `request_failed.json`
- `run.complete.json`

### Documentation

Enterprise reference docs live under `docs/` (security, compliance, CI, runbooks, architecture).

