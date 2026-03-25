# CI/CD — Kurumsal Standartlar

Bu doküman, repodaki CI iş akışlarının (GitHub Actions) hedeflediği kalite kapılarını özetler. Amaç: her merge’in derlenebilir, test edilmiş ve güvenlik açısından izlenebilir olması.

## Workflow

- Ana dosya: `.github/workflows/ci.yml`

## İşler (Jobs)

### `audit-host` (.NET 8)

- Build: `dotnet build -c Release`
- Test: `dotnet test ... -c Release`
- Artefakt: NuGet paket listesi (SBOM benzeri rapor)

### `runner` (Node + Playwright)

- Install: `npm ci`
- Lint: `npm run lint`
- Test: `npm test` (a11y testleri bu job’da devre dışı; ayrı job’da çalışır)

### `a11y-tests` (Axe)

- Chromium üzerinde `a11y-axe.spec.ts` çalıştırır
- Raporu artifact olarak saklar

### `security-audit` (Bağımlılık taraması)

- Runner bağımlılıkları için `npm audit --audit-level=high`
- Kurum politikasına göre “fail” kuralı ayrıca sıkılaştırılabilir

## Branch koruması

- PR zorunlu, status checks zorunlu, CODEOWNERS ile review
- Ayrıntı: `docs/ci/branch-protection-setup.md`

---

# CI/CD — Enterprise Standards

This document summarizes the CI workflows (GitHub Actions) and the quality gates enforced by this repository. The goal is to ensure every merge is buildable, tested, and security-auditable.

## Workflow

- Primary file: `.github/workflows/ci.yml`

## Jobs

### `audit-host` (.NET 8)

- Build: `dotnet build -c Release`
- Test: `dotnet test ... -c Release`
- Artifact: NuGet package list (SBOM-like report)

### `runner` (Node + Playwright)

- Install: `npm ci`
- Lint: `npm run lint`
- Test: `npm test` (a11y is excluded here; executed in a dedicated job)

### `a11y-tests` (Axe)

- Runs `a11y-axe.spec.ts` on Chromium
- Uploads the report as an artifact

### `security-audit` (Dependency scanning)

- Runs `npm audit --audit-level=high` for runner dependencies
- “Fail” policy can be tightened based on your governance

## Branch protection

- PR required, status checks required, CODEOWNERS-based reviews
- Details: `docs/ci/branch-protection-setup.md`
