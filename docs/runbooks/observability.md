# Gözlemlenebilirlik — Runbook (OpenTelemetry)

Bu runbook, `audit-host` servisinin metrik/iz/log üçlüsü ile izlenebilir şekilde işletilmesi içindir. Amaç, sorunları **ölçülebilir** hale getirip olay müdahalesini hızlandırmaktır.

## Minimum hedefler

- HTTP istek süresi (p50/p95/p99)
- Hata oranı (4xx/5xx)
- Audit çalıştırma süresi ve sonuç dağılımı (success/error/aborted)
- Kuyruk/iş yoğunluğu (Postgres + worker modunda)

## OpenTelemetry yapılandırması

- `AuditHost:OpenTelemetry:OtlpEndpoint` örnek: `http://otel-collector:4317`

## Dashboard önerileri

- HTTP latency heatmap + p95
- Audit başlatma hızı (jobs/min)
- En çok görülen bulgular (severity + ruleId)

---

# Observability — Runbook (OpenTelemetry)

This runbook explains how to operate `audit-host` with metrics/traces/logs. The goal is to make incidents **measurable** and reduce time-to-resolution.

## Minimum targets

- HTTP latency (p50/p95/p99)
- Error rate (4xx/5xx)
- Audit duration and outcome distribution (success/error/aborted)
- Queue/load signals (in Postgres + worker mode)

## OpenTelemetry configuration

- `AuditHost:OpenTelemetry:OtlpEndpoint` example: `http://otel-collector:4317`

## Dashboard suggestions

- HTTP latency heatmap + p95
- Audit throughput (jobs/min)
- Top recurring findings (severity + ruleId)
