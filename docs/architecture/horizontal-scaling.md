# Mimari Referans — Yatay Ölçekleme

Bu doküman, tek node “inline runner” yaklaşımından **çoklu worker** mimarisine geçiş için önerilen referans tasarımı özetler.

## Mevcut yaklaşım (baseline)

- `audit-host` audit job’ını başlatır ve runner sürecini tetikler
- Küçük/orta ölçek için uygundur
- Sınırlamalar: kapasite, izolasyon, kuyruk yönetimi, artefakt saklama

## Hedef mimari (öneri)

1. **PostgreSQL**: job state machine + idempotent claim
2. **Queue**: RabbitMQ / Redis Streams / Service Bus (kurumsal standardınıza göre)
3. **Workers**: Playwright çalıştıran, yatay ölçeklenen pod’lar
4. **KEDA/Autoscaling**: kuyruk derinliği ve gecikmeye göre ölçekleme
5. **Object storage**: rapor artefaktları için lifecycle policy (S3 uyumlu)

## Güvenlik ilkeleri

- Egress kontrolü (SSRF defense‑in‑depth): network policy / proxy / allowlist
- Secrets: Secret Manager + rotasyon
- İzlenebilirlik: OTel ile standart metrik/iz/log

## Referans dosyalar

- Kubernetes örnekleri: `infra/k8s/`

---

# Architecture Reference — Horizontal Scaling

This document outlines a reference design for moving from a single-node “inline runner” approach to a **multi-worker** architecture.

## Current baseline

- `audit-host` creates jobs and triggers the runner process
- Suitable for small/medium scale
- Limitations: capacity, isolation, queueing, artifact storage

## Target architecture (recommended)

1. **PostgreSQL**: job state machine + idempotent claiming
2. **Queue**: RabbitMQ / Redis Streams / Service Bus (based on your standard)
3. **Workers**: horizontally scaled pods running Playwright
4. **KEDA/Autoscaling**: scale based on queue depth and latency
5. **Object storage**: artifacts with lifecycle policies (S3 compatible)

## Security principles

- Egress controls (SSRF defense-in-depth): network policies / proxy / allowlist
- Secrets: Secret Manager with rotation
- Observability: standard OTel metrics/traces/logs

## Reference files

- Kubernetes examples: `infra/k8s/`
