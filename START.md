## Kamu Web Audit - Local Calistirma

Bu repo iki parca ile local calisir:
- `runner` (Node.js + Playwright audit CLI)
- `audit-host` (ASP.NET Core Minimal API + SQLite + tek sayfa UI)

### 0) Gereksinimler
- Node.js 20.x LTS
- npm
- (Ilk calistirmada) Playwright tarayicilari/bagimlilari

### 1) Kurulum (Ilk kez)
```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build
```

Bu adimlar sonunda `runner/dist/cli.js` olusur.

### 2) Audit calistirma
Ornek:
```bash
cd runner
npm run audit -- --url https://example.com --max-links 5 --max-ui-attempts 15 --out "reports/runs/demo-1"
```

Baslica ciktilar:
- `reports/runs/<calisma-id>/summary.json`
- `reports/runs/<calisma-id>/gaps.json`
- `reports/runs/<calisma-id>/ui-inventory.json` (varsa)
- `reports/runs/<calisma-id>/console.json`
- `reports/runs/<calisma-id>/network.json`
- `reports/runs/<calisma-id>/request_failed.json`

### 3) Strict mod (Kalite kapisi)
```bash
cd runner
node dist/cli.js --url https://example.com --max-links 5 --strict
```

### 4) Opsiyonlar
- `--spec <path>`: Site-ozel UI element spec dosyasi (JSON)
- `--browser chromium|firefox`
- `--headless true|false`
- `--safe-mode true|false`
- `--max-ui-attempts <N>`
- `--plugins name1,name2` (plugin secimi)

### 5) Local UI ve API host
`audit-host`, `runner`'i process olarak calistirir, durum ve ozetleri SQLite'a yazar.

```bash
cd audit-host
dotnet run --urls http://127.0.0.1:5090
```

Ardindan:
- UI: `http://127.0.0.1:5090`
- API health: `http://127.0.0.1:5090/api/health`

Temel endpointler:
- `POST /api/audits` (audit olustur)
- `GET /api/audits/current`
- `GET /api/audits/recent?limit=5`
- `GET /api/audits/{id}/summary`
- `GET /api/audits/{id}/json/{file}` (`summary|gaps|ui-inventory|console|network|request_failed|report|run.complete`)

