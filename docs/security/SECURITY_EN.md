⚠ INTERNAL ENGINEERING DOCUMENTATION – NOT PUBLIC

## Security Policy

This document describes how dependency security is monitored for this repository and how to respond to alerts.

---

## 1. Automated dependency scanning

There are two main mechanisms that watch for vulnerable dependencies:

- **Dependabot** (`.github/dependabot.yml`)
  - **nuget**: scans `backend/**` weekly for outdated/vulnerable NuGet packages and opens pull requests to update them.
  - **npm**: scans `runner/**` weekly for outdated/vulnerable npm packages and opens pull requests to update them.

- **Security Audit workflow** (`.github/workflows/security-audit.yml`)
  - **.NET job**:
    - Restores `backend/KamuAudit.Api`.
    - Runs:
      ```bash
      dotnet list package --vulnerable --include-transitive
      ```
    - Outputs a list of vulnerable direct and transitive NuGet packages to the CI logs.
  - **Node job**:
    - Runs in `runner/` with Node 20.
    - Executes:
      ```bash
      npm ci
      npm audit --audit-level=high
      ```
    - Reports known npm vulnerabilities of **high** severity and above in the CI logs.

Both jobs use `continue-on-error: true` so they will not fail the entire workflow while you are still triaging issues, but the output is always visible in GitHub Actions.

---

## 2. Responding to alerts

When Dependabot or the Security Audit workflow reports vulnerabilities:

### 2.1 Triage

1. **Identify severity and impact**
   - For .NET, review the `dotnet list package --vulnerable` output and linked advisories.
   - For npm, review `npm audit` output and linked advisories.
2. **Determine exposure**
   - Check whether the vulnerable package is actually used at runtime (e.g., devDependency vs. production, transitive vs. direct).
   - Assess whether the vulnerable code path is reachable in this project.

### 2.2 Remediation

#### .NET / NuGet

1. Let Dependabot open PRs for package updates, or update manually in the relevant `.csproj`:
   - Prefer patch/minor bumps that fix the vulnerability.
2. Run locally or in CI:
   ```bash
   cd backend/KamuAudit.Api
   dotnet restore
   dotnet build
   dotnet test ../KamuAudit.Tests/KamuAudit.Tests.csproj
   dotnet list package --vulnerable --include-transitive
   ```
3. Verify runtime behavior in a staging environment before deploying to production.

#### Node / npm

1. Review `npm audit` results for `runner/`.
2. Where possible, let Dependabot PRs update the affected packages, or:
   ```bash
   cd runner
   npm audit fix --audit-level=high
   # or, for more control, update specific dependencies in package.json
   npm ci
   npm test
   npm run build
   npm run lint
   ```
3. Validate the Playwright runner behavior in staging before deploying.

### 2.3 SLAs (suggested)

These timelines can be adjusted based on your risk appetite, but as a starting point:

- **Critical**: Investigate within 24 hours; patch or mitigate within 3 days.
- **High**: Investigate within 3 days; patch or mitigate within 7 days.
- **Medium**: Investigate within 7 days; patch or mitigate within 30 days.
- **Low**: Best-effort; address during regular maintenance cycles.

---

## 3. Reporting security issues

If you discover a security vulnerability in this project:

- Do **not** open a public GitHub issue with sensitive details.
- Instead, contact the maintainers through your organization’s private security channel (e.g., security@your-org.example, internal ticketing system) and provide:
  - A description of the issue and potential impact.
  - Steps to reproduce.
  - Any suggested fixes or mitigations.

The maintainers will:

1. Acknowledge receipt of the report.
2. Triage the severity and scope.
3. Prepare a fix and coordinate a responsible disclosure process as appropriate.

