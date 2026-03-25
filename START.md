# Kurulum Rehberi (START)

Bu doküman, projeyi **en hızlı şekilde** çalıştırmak için hazırlanmıştır. En üstte “Docker”, ardından “Local” kurulum bulunur.

## Docker ile (önerilen)

```bash
cd /home/arda/software/WEB-AUDIT
docker compose build
docker compose up -d
```

Kontrol:

- UI: `http://127.0.0.1:5090`
- Health: `http://127.0.0.1:5090/health/live`

## Local kurulum (geliştirme)

### Gereksinimler

- .NET 8 SDK
- Node.js 20.x + npm

### Runner (ilk kurulum)

```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

### Audit Host (UI + API)

```bash
cd audit-host
dotnet run --urls http://127.0.0.1:5090
```

## Genel Kullanım / Başlatma

### CLI ile audit çalıştırma

```bash
cd runner
node dist/cli.js --url https://example.com --max-links 50 --max-ui-attempts 220 --out "reports/runs/demo-1"
```

### UI üzerinden audit çalıştırma

UI üzerinden hedef URL girip audit başlatabilirsiniz; sonuçlar “Canlı Durum” ve “Genel Sonuç” panellerinde görünür.

## İleri Düzey Yapılandırma

### Güvenlik

- **API key**: `AUDIT_HOST_API_KEY` veya `AuditHost:ApiKey`
- **OIDC**: `AuditHost:Oidc:*` (kurumsal kimlik doğrulama)
- **SSRF**: Varsayılan olarak private/internal hedefler reddedilir. Bilinçli olarak izin vermek için `AuditHost:AllowPrivateTargets=true` kullanın.
- **Egress (öneri)**: network policy / proxy ile RFC1918 egress engeli (defense‑in‑depth)

### Retention (saklama)

- `AuditHost:Retention:DeletedAfterDays`
- `AuditHost:Retention:IntervalHours`

### Runner ayarları

- `AUDIT_MAX_LINKS`, `AUDIT_MAX_UI_ATTEMPTS`
- `AUDIT_SAFE_MODE`, `AUDIT_CLICK_ALLOWLIST`

---

# Setup Guide (START) — English

This document shows the **fastest** way to run the project. Docker comes first, then local development setup.

## Using Docker (recommended)

```bash
cd /home/arda/software/WEB-AUDIT
docker compose build
docker compose up -d
```

Checks:

- UI: `http://127.0.0.1:5090`
- Health: `http://127.0.0.1:5090/health/live`

## Local setup (development)

### Requirements

- .NET 8 SDK
- Node.js 20.x + npm

### Runner (first-time setup)

```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

### Audit Host (UI + API)

```bash
cd audit-host
dotnet run --urls http://127.0.0.1:5090
```

## General Usage / Start

### Running an audit via CLI

```bash
cd runner
node dist/cli.js --url https://example.com --max-links 50 --max-ui-attempts 220 --out "reports/runs/demo-1"
```

### Running an audit via UI

Use the UI to enter a target URL and start an audit. Results are shown in the “Live Status” and “Summary” sections.

## Advanced Configuration

### Security

- **API key**: `AUDIT_HOST_API_KEY` or `AuditHost:ApiKey`
- **OIDC**: `AuditHost:Oidc:*` (enterprise authentication)
- **SSRF**: Private/internal targets are rejected by default. To explicitly allow them, use `AuditHost:AllowPrivateTargets=true`.
- **Egress (recommended)**: network policy / proxy-based RFC1918 egress restrictions (defense‑in‑depth)

### Retention

- `AuditHost:Retention:DeletedAfterDays`
- `AuditHost:Retention:IntervalHours`

### Runner settings

- `AUDIT_MAX_LINKS`, `AUDIT_MAX_UI_ATTEMPTS`
- `AUDIT_SAFE_MODE`, `AUDIT_CLICK_ALLOWLIST`

