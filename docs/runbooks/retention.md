# Saklama Politikası (Retention) — Runbook

Bu runbook, audit çıktılarını (veritabanı kayıtları + dosya artefaktları) kurum saklama politikasına uygun şekilde yönetmek içindir.

## Veri sınıfları

- **Operasyonel metadata**: job durumu, zaman damgaları, özet metrikler
- **Artefaktlar**: `summary.json`, `network.json`, `console.json`, vb.
- **Hassas içerik riski**: hedef sitelerden gelen metinler/URL’ler (PII içerebilir)

## Güvenli varsayılanlar

- Saklama süresi **tanımlı** olmalı (sınırsız saklama önerilmez).
- Silme işlemi doğrulanmalı (ör. metrik/rapor kıyaslaması, denetim kaydı).

## Yapılandırma

- `AuditHost:Retention:DeletedAfterDays`: N günden eski kayıtlar için silme eşiği
- `AuditHost:Retention:IntervalHours`: periyodik temizlik aralığı

## Operasyon

- Üretimde SQLite yerine Postgres + object storage hedeflenir (bkz. `docs/architecture/horizontal-scaling.md`).

---

# Retention Policy — Runbook

This runbook describes how to manage audit outputs (database records + file artifacts) in line with your organization’s retention policy.

## Data classes

- **Operational metadata**: job status, timestamps, summary metrics
- **Artifacts**: `summary.json`, `network.json`, `console.json`, etc.
- **Sensitive content risk**: content/URLs captured from target sites (may contain PII)

## Secure defaults

- Retention must be **explicitly** defined (indefinite storage is discouraged).
- Deletions should be verifiable (metrics/report checks, audit logging).

## Configuration

- `AuditHost:Retention:DeletedAfterDays`: delete threshold for older runs
- `AuditHost:Retention:IntervalHours`: periodic cleanup interval

## Operations

- For production scale, prefer Postgres + object storage (see `docs/architecture/horizontal-scaling.md`).
