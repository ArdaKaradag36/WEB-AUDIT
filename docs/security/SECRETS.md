# Gizli Bilgi Yönetimi (Security‑First)

Bu doküman, **anahtar/şifre/token** gibi gizli bilgilerin güvenli şekilde yönetimi için ürün standardı önerileri içerir. Bu repoda **hiçbir gizli bilgi** versiyon kontrolüne konulmamalıdır.

## İlkeler

- Gizli bilgi **kaynağa yazılmaz** (kod, `.md`, örnek config, test verisi).
- Gizli bilgi **log’lara düşmez** (stdout/stderr, CI çıktısı, JSON artefaktlar).
- Gizli bilgi **en az ayrıcalık** prensibiyle tutulur (scope, süre, rotasyon).

## Önerilen Yaklaşım

| Ortam | Öneri | Not |
|---|---|---|
| Lokal geliştirme | Ortam değişkeni veya yerel `.env` (git ignore) | Dosyayı paylaşmayın; kısa ömürlü anahtar kullanın |
| CI | GitHub Actions Encrypted Secrets | PR loglarında değerleri asla yazdırmayın |
| Kubernetes | Secret Manager / Vault + External Secrets | Rotasyon ve erişim kayıtları zorunlu |

## Uygulama Notları

- `audit-host` API erişimi için `AUDIT_HOST_API_KEY` (veya `AuditHost:ApiKey`) kullanılabilir.
- Runner çalıştırma sırasında **gizli verileri** argüman olarak değil, kontrollü kanallardan (secret store → env/volume) verin.

---

# Secret Management (Security‑First)

This document provides production-grade guidance for handling **keys/passwords/tokens**. No secrets must ever be committed to version control in this repository.

## Principles

- Secrets are **never** stored in source (code, docs, sample configs, fixtures).
- Secrets are **never** written to logs (stdout/stderr, CI output, JSON artifacts).
- Secrets follow **least privilege** (scoped, time-bound, rotated).

## Recommended Approach

| Environment | Recommendation | Notes |
|---|---|---|
| Local development | Environment variables or local `.env` (git-ignored) | Do not share; use short‑lived keys |
| CI | GitHub Actions Encrypted Secrets | Never print values in PR logs |
| Kubernetes | Secret Manager / Vault + External Secrets | Rotation and access auditing required |

## Implementation Notes

- `audit-host` can enforce API access via `AUDIT_HOST_API_KEY` (or `AuditHost:ApiKey`).
- Avoid passing secrets via CLI args; prefer secret stores injected as env/volume.
