$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required. Install it, then run this script again."
}

docker compose up --build -d
Write-Host "Waiting for CivicLens services..."
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing -TimeoutSec 2 | Out-Null
    Invoke-WebRequest http://127.0.0.1:8008/health -UseBasicParsing -TimeoutSec 2 | Out-Null
    $healthy = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $healthy) {
  docker compose logs --tail=80
  throw "CivicLens services did not become healthy."
}

Write-Host "CivicLens is ready: http://localhost:3000"
Write-Host "Admin demo login: http://localhost:3000/login"
Write-Host "ML health: http://localhost:8008/health"
Write-Host "Stop services: docker compose down"