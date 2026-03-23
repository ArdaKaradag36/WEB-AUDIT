## Kamu Web Audit - Local Runner + UI

Bu repo, kamu web siteleri uzerinde **tarayici tabanli otomatik denetimler** yapan:
- `runner` (Node.js + Playwright CLI)
- `audit-host` (ASP.NET Core Minimal API + SQLite + tek sayfa local UI)
bilesenlerinden olusur.

`audit-host`, localde audit baslatma, canli durum, son denetimler ve ham JSON goruntuleme ekranini saglar.

### Calistirma (CLI)
```bash
cd runner
npm ci
npx playwright install --with-deps chromium
npm run build

# audit
npm run audit -- --url https://example.com --max-links 5 --max-ui-attempts 15 --out "reports/runs/demo-1"
```

### Calistirma (Local UI)
```bash
cd audit-host
dotnet run --urls http://127.0.0.1:5090
```

Ardindan tarayicida:
- `http://127.0.0.1:5090` (UI)
- `http://127.0.0.1:5090/api/health` (health)

### Cikti - Raporlar
`runner` asagidaki dosyalari (run dizini altinda) yazar; `audit-host` bu dosyalari API ile sunar:
- `summary.json`
- `gaps.json`
- `ui-inventory.json` (varsa)
- `console.json`
- `network.json`
- `request_failed.json`
- `run.complete.json`

### CI
GitHub Actions su anda sadece `runner` icin:
- lint
- test (`npm test`)
- Playwright/browsers kurulumu
- ve `npm audit` bagimlilik guvenlik kontrolu

