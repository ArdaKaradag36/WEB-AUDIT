## Kamu Web Audit - Runner Only CI

Bu dokuman, `runner` (Node.js + Playwright audit CLI) icin GitHub Actions CI standartlarini ozetler.

### 1) Ana Workflow
- `.github/workflows/ci.yml`

### 2) Runner Job
- Yol: `runner/`
- Adimlar:
  1. `npm ci`
  2. `npm run lint`
  3. `npm test`
  4. Playwright tarayici kurulum/adimlari (tarik/CI paketine gore)
- Artefaktlar:
  - `test-results/**`
  - `reports/runs/**`

### 3) Security Audit Job
- Yol: `runner/`
- `npm audit --audit-level=high` (raporlayip fail etmez; policy gelecekte degisebilir)

