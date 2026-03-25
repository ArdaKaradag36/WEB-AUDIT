# Container İmzalama — Cosign/Sigstore

Bu doküman, yayınlanan container imajlarının bütünlüğünü ve kaynağını doğrulamak için imzalama yaklaşımını özetler.

## Neden?

- Supply‑chain saldırılarına karşı ek güvenlik katmanı
- “Bu imaj gerçekten bizim pipeline’dan mı çıktı?” doğrulaması
- Admission policy ile cluster içine yalnızca imzalı imajların alınması

## Örnek akış (yüksek seviye)

1. Build → Push (registry)
2. İmzala (cosign)
3. Deploy sırasında doğrula (policy/admission)

## Örnek komut

```bash
cosign sign ghcr.io/<org>/<image>:<version>
```

> Not: Anahtar yönetimi ve OIDC tabanlı keyless imzalama kurum standardınıza göre belirlenmelidir.

---

# Container Signing — Cosign/Sigstore

This document summarizes a signing approach for verifying the integrity and provenance of released container images.

## Why?

- Additional protection against supply-chain attacks
- Provenance: “did this image come from our pipeline?”
- Admission policies can enforce “signed images only”

## Example flow (high level)

1. Build → Push (registry)
2. Sign (cosign)
3. Verify during deploy (policy/admission)

## Example command

```bash
cosign sign ghcr.io/<org>/<image>:<version>
```

> Note: Key management and keyless signing (OIDC) should follow your organization’s standards.
