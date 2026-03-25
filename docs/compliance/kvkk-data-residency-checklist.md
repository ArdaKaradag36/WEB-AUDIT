# KVKK / Veri Yerelliği — Teknik Kontrol Listesi

Bu belge **hukuki tavsiye değildir**. Amaç; ürünün işletiminde veri yerelliği ve saklama gereksinimlerini teknik olarak uygulanabilir hale getirmektir.

## Uygulanabilir mekanizmalar

- **Veri yerelliği kapısı**: Yazma operasyonlarında bölge etiketi zorunluluğu (ör. `X-Data-Region`)
- **Saklama (retention)**: süre bazlı otomatik silme
- **Denetim izi**: append-only olay kaydı (hash zinciri) ile bütünlük sinyali

## Kontrol listesi

| # | Başlık | Beklenti | Kanıt/çıktı |
|---|---|---|---|
| 1 | Amaç sınırlaması | Toplanan veri, audit amacıyla sınırlı | DPIA / teknik mimari dokümanı |
| 2 | Saklama | Süre ve silme prosedürü net | Retention config + silme raporları |
| 3 | Güvenlik | TLS + erişim kontrolü + log redaction | Güvenlik dokümantasyonu |
| 4 | Erişim | Yetkisiz erişim engelli | API key/OIDC politikası |
| 5 | Bütünlük | Denetim kaydı değişiklik sinyali veriyor | immutable log zinciri doğrulaması |
| 6 | Yerleşim | Veri belirlenen bölgede | Host sözleşmesi + konfig doğrulaması |

## Operasyon notu

Üretimde, bütünlük zinciri doğrulaması için periyodik dış kontrol (ör. SIEM/SECOPS) önerilir.

---

# KVKK / Data Residency — Technical Checklist

This document is **not legal advice**. Its goal is to provide an implementable technical checklist for data residency and retention requirements.

## Applicable mechanisms

- **Data residency gate**: require a region label (e.g., `X-Data-Region`) on write operations
- **Retention**: time-based automated deletion
- **Audit trail**: append-only event log (hash chain) as an integrity signal

## Checklist

| # | Topic | Expectation | Evidence/output |
|---|---|---|---|
| 1 | Purpose limitation | Collected data limited to audit needs | DPIA / technical architecture |
| 2 | Retention | Clear duration and deletion procedure | Retention config + deletion reports |
| 3 | Security | TLS + access control + log redaction | Security documentation |
| 4 | Access | Unauthorized access prevented | API key/OIDC policy |
| 5 | Integrity | Audit record tampering signals | immutable log chain validation |
| 6 | Residency | Data stays in the chosen region | hosting contract + config validation |

## Operational note

In production, periodic external validation (e.g., SIEM/SECOPS) is recommended for integrity checks.
