Param(
    [switch] $SkipCacheClean
)

Write-Host "== Kamu Web Audit runner clean reset ==" -ForegroundColor Cyan

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "Current directory: $(Get-Location)"

if (-not $SkipCacheClean) {
    Write-Host "Step 1/4: Cleaning npm cache (npm cache clean --force)..." -ForegroundColor Yellow
    npm cache clean --force
} else {
    Write-Host "Skipping npm cache clean (per --SkipCacheClean)." -ForegroundColor Yellow
}

Write-Host "Step 2/4: Removing node_modules (if present)..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    try {
        Remove-Item -Recurse -Force "node_modules"
    } catch {
        Write-Warning "Failed to remove node_modules. Ensure no other process is locking these files and try again."
        throw
    }
} else {
    Write-Host "node_modules not found; nothing to remove."
}

Write-Host "Step 3/4: Removing package-lock.json (if present)..." -ForegroundColor Yellow
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
} else {
    Write-Host "package-lock.json not found; nothing to remove."
}

Write-Host "Step 4/4: Running npm ci to reinstall dependencies..." -ForegroundColor Yellow
npm ci

Write-Host ""
Write-Host "Node version:" -ForegroundColor Cyan
node -v
Write-Host "npm version:" -ForegroundColor Cyan
npm -v

Write-Host ""
Write-Host "Runner clean reset completed. If you still see EBUSY or locking errors, try closing editors/antivirus, then reboot and re-run this script." -ForegroundColor Green

