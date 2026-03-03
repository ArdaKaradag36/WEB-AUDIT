Param(
    [switch]$SkipNpmCi
)

Write-Host "Kamu Web Audit runner clean script starting..." -ForegroundColor Cyan

Push-Location $PSScriptRoot\..

try {
    Write-Host "Attempting to stop Node.js processes (best-effort)..." -ForegroundColor Yellow
    try {
        Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Warning: Failed to stop some node processes: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    Write-Host "Removing local build and cache directories (node_modules, dist, .playwright)..." -ForegroundColor Yellow
    foreach ($path in @("node_modules", "dist", ".playwright")) {
        if (Test-Path $path) {
            try {
                Remove-Item $path -Recurse -Force -ErrorAction Stop
                Write-Host "Removed $path" -ForegroundColor Green
            } catch {
                Write-Host "Warning: Failed to remove $path: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }

    Write-Host "Verifying npm cache..." -ForegroundColor Yellow
    try {
        npm cache verify
    } catch {
        Write-Host "Warning: npm cache verify failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    if (-not $SkipNpmCi) {
        Write-Host "Running npm ci to install dependencies..." -ForegroundColor Yellow
        npm ci
    } else {
        Write-Host "SkipNpmCi specified; not running npm ci." -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

Write-Host "Runner clean script completed." -ForegroundColor Cyan

