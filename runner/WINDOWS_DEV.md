## Windows Local Development Guide (Runner)

The Playwright runner is tested and used primarily on **Node.js 20 LTS** and works best on Linux environments. On Windows, `npm ci` can sometimes fail with file lock (`EBUSY`) issues due to antivirus, indexers, or tools holding `node_modules` files open.

This guide describes recommended setups and recovery steps for a stable Windows dev experience.

---

## 1. Recommended: use WSL2

For the smoothest experience, use **WSL2 (Ubuntu)** for Node/Playwright development:

1. Install WSL2 + Ubuntu (via “Ubuntu” app in Microsoft Store or `wsl --install`).
2. Inside WSL2:
   ```bash
   cd /mnt/c/Users/<your-user>/Desktop/kamu-web-audit/runner
   nvm install 20   # or install Node 20 via your package manager
   nvm use 20
   node -v         # v20.x.x

   npm ci
   npx playwright install --with-deps chromium
   npm run build
   npm test
   ```
3. Use VS Code “WSL” integration or your editor’s remote features to edit files while running Node/Playwright in Linux.

This avoids most Windows-specific `EBUSY` / locking problems and aligns more closely with CI (Ubuntu runners).

---

## 2. Staying on native Windows

If you prefer to run Node/Playwright directly on Windows (PowerShell / cmd), follow these guidelines:

### 2.1 Close tools that may lock files

Before running `npm ci` or other heavy operations:

- Close any terminals or tools currently running Node commands in `runner/`.
- Close file explorers or search/index tools focused on `runner/node_modules`.
- Ensure antivirus or real-time scanners are not aggressively scanning the project folder (if possible, add a safe exclusion for the repo path).

### 2.2 Clean `node_modules` + cache (safe reset)

A common reason for `EBUSY` is a half-installed `node_modules` tree. To reset safely:

1. **Stop all Node processes** related to this repo (close terminals, dev servers, tests).
2. From PowerShell in `runner/`:

```powershell
cd runner

# Optional: clear npm cache (can be slow)
npm cache clean --force

# Remove node_modules and lockfile if they seem corrupted
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Fresh install
npm ci
```

If `Remove-Item` fails with EBUSY, ensure no other process is using the directory. As a fallback, reboot (see below) and retry `Remove-Item` + `npm ci`.

### 2.3 Optional npm config tweaks

You can set some npm configs to reduce network and filesystem churn:

```powershell
# Prefer local cache when possible
npm config set prefer-offline true

# Reduce concurrency if you continue to see EBUSY (tradeoff: slower installs)
npm config set scripts-prepend-node-path true
```

(Do not set `--force` globally; keep it as an explicit flag when needed.)

### 2.4 Last resort: reboot

If you continue to see `EBUSY: resource busy or locked, unlink ...` errors:

1. Reboot Windows to clear all file handles.
2. Immediately after reboot, open a single PowerShell window:

```powershell
cd C:\Users\<your-user>\Desktop\kamu-web-audit\runner
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm cache clean --force
npm ci
```

This usually resolves stubborn locking issues.

---

## 3. Playwright browser install on Windows

After you have a clean `npm ci`, install Playwright browsers:

```powershell
cd runner
npx playwright install --with-deps chromium
```

Notes:

- On Windows, Playwright will download browser binaries into a cache (normally under your user profile). Ensure you have sufficient disk space and that your proxy/firewall allows these downloads.
- The CI pipeline uses the same command, so if it works locally it should work in CI.

---

## 4. Clean reset script (PowerShell)

For convenience, you can use the `clean-runner.ps1` script (stored in the `runner` folder) to perform a clean reset:

```powershell
cd runner
.\clean-runner.ps1
```

What it does (high level):

- Stops on first error by default.
- Prints each step.
- Clears npm cache (`npm cache clean --force`).
- Deletes `node_modules` and `package-lock.json` if present.
- Runs `npm ci` and then prints `node -v` and `npm -v`.

Check the script content before running and adapt paths/options to your environment if needed.

