# DPIA Şablonu (Teknik Taslak)

Bu dosya, kurumunuzun DPIA sürecine uyarlanmak üzere hazırlanmış **teknik taslaktır**. Hukuki değerlendirme ve onay süreçleri kurum sorumluluğundadır.

## 1) Sistem Tanımı

- **Sistem adı:** WEB-AUDIT
- **Amaç:** Web uygulamalarında güvenlik/kalite sinyali üretimi
- **Bileşenler:** `audit-host` (API/UI), `runner` (Playwright tabanlı denetim)

## 2) Veri Kategorileri (minimum)

- Hedef URL’ler
- Teknik ölçümler (HTTP header özetleri, hata kodları)
- Çalışma artefaktları (`summary.json` vb.)

> Not: Kimlik bilgileri kullanılıyorsa (login), kapsamı ayrıca dokümante edilmelidir.

## 3) Riskler

- Yetkisiz tarama / kapsam dışı hedefler
- Artefaktlarda hassas veri/PII birikmesi
- Yetkisiz API erişimi

## 4) Teknik Önlemler

- SSRF kontrolleri + egress politikası (defense-in-depth)
- Kimlik doğrulama (API key/OIDC) + rate limit
- Retention ve otomatik silme
- Log redaction ve erişim denetimi

---

# DPIA Template (Technical Draft)

This file is a **technical draft** intended to be adapted to your organization’s DPIA process. Legal assessment and approvals are the organization’s responsibility.

## 1) System Description

- **System name:** WEB-AUDIT
- **Purpose:** generating security/quality signals for web applications
- **Components:** `audit-host` (API/UI), `runner` (Playwright-based audits)

## 2) Data Categories (minimum)

- Target URLs
- Technical metrics (HTTP header summaries, error codes)
- Run artifacts (`summary.json`, etc.)

> Note: If credentials are used (login), document scope and handling separately.

## 3) Risks

- Unauthorized scanning / out-of-scope targets
- Sensitive data/PII accumulation in artifacts
- Unauthorized API access

## 4) Technical Controls

- SSRF controls + egress policy (defense-in-depth)
- Authentication (API key/OIDC) + rate limiting
- Retention and automated deletion
- Log redaction and access auditing
