# mTLS (Servisler Arası İletişim)

Bu doküman, `audit-host` API’sini **servisler arası** çağrılarda istemci sertifikası ile korumak için referans çerçeve sunar. Amaç, ağ içindeki “her şey güvenlidir” varsayımını kaldırmaktır.

## Ne zaman gerekli?

- `audit-host` cluster içinde farklı namespace/servislerden çağrılıyorsa
- API anahtarı/OIDC yanında ek bir **transport‑layer** güvenlik katmanı isteniyorsa
- Zero‑Trust, servis mesh, veya gateway standardınız varsa

## Uygulama yaklaşımı (özet)

- TLS terminasyon noktasını netleştirin (Ingress/Gateway mi, uygulama mı?)
- Sertifika yaşam döngüsü: issuing → rotation → revocation
- İstemci sertifikası doğrulamasını policy ile zorunlu kılın

## Referans

- Microsoft dokümantasyonu: `https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth`

---

# mTLS (Service-to-Service)

This document provides a reference framework for protecting the `audit-host` API with client certificates for **service-to-service** traffic. The goal is to remove implicit trust within internal networks.

## When to use it?

- `audit-host` is called by multiple services/namespaces inside a cluster
- You want an additional **transport‑layer** control alongside API keys/OIDC
- You operate under Zero‑Trust, service mesh, or gateway policies

## Implementation approach (high level)

- Define TLS termination (Ingress/Gateway vs application)
- Certificate lifecycle: issuing → rotation → revocation
- Enforce client-certificate verification through policy

## Reference

- Microsoft documentation: `https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth`
