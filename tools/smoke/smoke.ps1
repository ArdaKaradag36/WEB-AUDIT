Param(
    [string]$ApiUrl = "http://localhost:5000",
    [string]$PostgresContainerName = "kamu-audit-smoke-db"
)

set-strictmode -version latest
$ErrorActionPreference = "Stop"

Write-Host "=== Kamu Web Audit smoke test (PowerShell) ===" -ForegroundColor Cyan

function Invoke-OrFail {
    param(
        [string]$Step,
        [scriptblock]$Action
    )

    Write-Host "-- $Step" -ForegroundColor Yellow
    & $Action
}

try {
    Invoke-OrFail "Check Docker availability" {
        docker --version | Out-Null
    }

    Invoke-OrFail "Start Postgres 16 container (if not running)" {
        $existing = docker ps --filter "name=$PostgresContainerName" --format "{{.ID}}"
        if (-not $existing) {
            docker run -d --rm `
                --name $PostgresContainerName `
                -p 5432:5432 `
                -e POSTGRES_USER=postgres `
                -e POSTGRES_PASSWORD=postgres `
                -e POSTGRES_DB=kamu_audit_smoke `
                postgres:16 | Out-Null
        } else {
            Write-Host "Postgres container $PostgresContainerName already running." -ForegroundColor Green
        }
    }

    Write-Host "Waiting for Postgres to accept connections..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15

    $backendDir = Join-Path $PSScriptRoot "..\..\backend\KamuAudit.Api" | Resolve-Path

    Invoke-OrFail "Apply EF Core migrations" {
        Push-Location $backendDir
        try {
            $env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit_smoke;Username=postgres;Password=postgres"
            dotnet ef database update
        } finally {
            Pop-Location
        }
    }

    $backendProcess = $null

    Invoke-OrFail "Start backend API" {
        Push-Location $backendDir
        try {
            $env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=kamu_audit_smoke;Username=postgres;Password=postgres"
            $env:Jwt__Key = "THIS_IS_A_LOCAL_SMOKE_TEST_KEY_WITH_MINIMUM_32_CHARS!"
            $env:Runner__WorkingDirectory = (Join-Path $backendDir "..\..\runner" | Resolve-Path)
            $env:Runner__NodePath = "node"
            $env:Runner__CliScript = "dist/cli.js"
            $env:Runner__MaxRunDurationMinutes = "5"
            $env:RateLimiting__Enabled = "false"

            $backendProcess = Start-Process dotnet -ArgumentList "run","--urls",$ApiUrl -WorkingDirectory $backendDir -PassThru
        } finally {
            Pop-Location
        }
    }

    Write-Host "Waiting for /health/ready..." -ForegroundColor Yellow
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing "$ApiUrl/health/ready"
            if ($resp.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $ready) {
        throw "API did not become ready in time."
    }

    Invoke-OrFail "Register user" {
        $body = @{
            email = "smoke@example.com"
            password = "SmokeTest123!"
            role = "QA"
        } | ConvertTo-Json

        $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$ApiUrl/api/auth/register" -ContentType "application/json" -Body $body
        if ($resp.StatusCode -ne 200) {
            throw "Register failed with status $($resp.StatusCode)"
        }
    }

    $token = $null
    Invoke-OrFail "Login user" {
        $body = @{
            email = "smoke@example.com"
            password = "SmokeTest123!"
        } | ConvertTo-Json

        $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$ApiUrl/api/auth/login" -ContentType "application/json" -Body $body
        if ($resp.StatusCode -ne 200) {
            throw "Login failed with status $($resp.StatusCode)"
        }
        $json = $resp.Content | ConvertFrom-Json
        $token = $json.token
        if (-not $token) {
            throw "Login response did not contain token."
        }
    }

    $auditId = $null
    Invoke-OrFail "Create audit" {
        $body = @{
            targetUrl = "https://example.com"
            maxLinks = 5
        } | ConvertTo-Json

        $headers = @{ Authorization = "Bearer $token" }
        $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$ApiUrl/api/Audits" -ContentType "application/json" -Body $body -Headers $headers
        if ($resp.StatusCode -ne 201) {
            throw "Create audit failed with status $($resp.StatusCode)"
        }
        $json = $resp.Content | ConvertFrom-Json
        $auditId = $json.id
        if (-not $auditId) {
            throw "Create audit response did not contain id."
        }
    }

    Invoke-OrFail "Poll audit until terminal status" {
        $headers = @{ Authorization = "Bearer $token" }
        $terminal = $false
        for ($i = 0; $i -lt 60; $i++) {
            $resp = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$ApiUrl/api/Audits/$auditId" -Headers $headers
            if ($resp.StatusCode -ne 200) {
                throw "Get audit failed with status $($resp.StatusCode)"
            }
            $json = $resp.Content | ConvertFrom-Json
            $status = $json.status
            Write-Host "Current status: $status"
            if ($status -eq "completed" -or $status -eq "failed") {
                $terminal = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $terminal) {
            throw "Audit did not reach a terminal status in time."
        }
    }

    Invoke-OrFail "Fetch summary/findings/gaps" {
        $headers = @{ Authorization = "Bearer $token" }

        $summary = (Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$ApiUrl/api/Audits/$auditId/summary" -Headers $headers).Content | ConvertFrom-Json
        $findings = (Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$ApiUrl/api/Audits/$auditId/findings?page=1&pageSize=20" -Headers $headers).Content | ConvertFrom-Json
        $gaps = (Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$ApiUrl/api/Audits/$auditId/gaps?page=1&pageSize=20" -Headers $headers).Content | ConvertFrom-Json

        Write-Host "Summary: FindingsTotal=$($summary.FindingsTotal) GapsTotal=$($summary.GapsTotal)"
        Write-Host "Findings items: $($findings.Items.Count)  Gaps items: $($gaps.Items.Count)"
    }

    Invoke-OrFail "Verify /metrics contains key metrics" {
        $metrics = (Invoke-WebRequest -UseBasicParsing "$ApiUrl/metrics").Content
        $required = @(
            "audit_queue_depth",
            "audit_running_count",
            "audit_runs_completed_total",
            "audit_runs_started_total",
            "audit_runs_retries_total",
            "audit_ingestion_failures_total",
            "audit_runner_timeouts_total",
            "audit_run_duration_ms_count",
            "audit_run_duration_ms_sum"
        )
        foreach ($name in $required) {
            if (-not ($metrics -match [regex]::Escape($name))) {
                throw "Metric '$name' not found in /metrics output."
            }
        }
    }

    Write-Host "Smoke test completed successfully." -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "Smoke test FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Write-Host "Cleaning up backend and Postgres..." -ForegroundColor Yellow
    try {
        if ($backendProcess -and -not $backendProcess.HasExited) {
            $backendProcess.Kill()
        }
    } catch {
        # ignore
    }
    try {
        docker stop $PostgresContainerName | Out-Null
    } catch {
        # ignore
    }
}

