# One-shot Fly.io deploy for the U-Speak multiplayer server (Windows PowerShell).
#
#   .\scripts\deploy-fly.ps1 uspeak-multiplayer 'teacher-password'
#
# Creates the app on first run, keeps CORS_ORIGINS in sync with the app name,
# and deploys using Fly's remote builder (no local Docker needed).
# Safe to re-run: later runs just redeploy.
param(
  [Parameter(Mandatory = $true)][string]$AppName,
  [Parameter(Mandatory = $true)][string]$TeacherKey,
  [string]$Region = 'nrt'
)
$ErrorActionPreference = 'Stop'

if ($TeacherKey.Length -lt 8) { throw 'teacher key must be at least 8 characters' }
if ($AppName -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'app name must be lowercase letters, digits and dashes' }
if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
  throw 'flyctl not found. Close and reopen PowerShell after installing it, or see https://fly.io/docs/flyctl/install/'
}

# Run from the repository root regardless of where the script was invoked from.
Set-Location (Join-Path $PSScriptRoot '..')
$url = "https://$AppName.fly.dev"
Write-Host "==> app=$AppName region=$Region url=$url"

# 1. Create the app if it does not exist yet.
fly status --app $AppName *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host '==> creating app'
  fly apps create $AppName --org personal
  if ($LASTEXITCODE -ne 0) { throw 'could not create the app. The name may already be taken; try another one.' }
}

# 2. Keep fly.toml's app name and CORS origin consistent with the chosen name.
$toml = Get-Content -Raw -Encoding UTF8 'fly.toml'
$toml = [regex]::Replace($toml, '(?m)^app = ".*"$', "app = `"$AppName`"", 1)
$toml = [regex]::Replace($toml, '(?m)^  CORS_ORIGINS = ".*"$', "  CORS_ORIGINS = `"$url`"", 1)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'fly.toml'), $toml, (New-Object System.Text.UTF8Encoding $false))
Write-Host "fly.toml: app=$AppName CORS_ORIGINS=$url"

# 3. Secrets. Google Sheets values are optional; set them as environment variables to include them.
Write-Host '==> setting secrets'
$secrets = @("TEACHER_KEY=$TeacherKey")
if ($env:GOOGLE_SHEET_ID) { $secrets += "GOOGLE_SHEET_ID=$($env:GOOGLE_SHEET_ID)" }
if ($env:GOOGLE_SERVICE_ACCOUNT_JSON) { $secrets += "GOOGLE_SERVICE_ACCOUNT_JSON=$($env:GOOGLE_SERVICE_ACCOUNT_JSON)" }
fly secrets set --app $AppName --stage @secrets
if ($LASTEXITCODE -ne 0) { throw 'could not set secrets' }

# 4. Deploy. --remote-only builds on Fly's builders, so Docker Desktop is not required.
Write-Host '==> deploying'
fly deploy --app $AppName --remote-only
if ($LASTEXITCODE -ne 0) { throw 'deploy failed. Run "fly logs --app ' + $AppName + '" to see why.' }

Write-Host ''
Write-Host '==> health check'
Start-Sleep -Seconds 5
try {
  $health = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 20
  Write-Host ($health | ConvertTo-Json -Compress)
} catch {
  Write-Warning "health check did not respond yet: $_"
  Write-Warning "wait a few seconds and open $url/healthz in a browser"
}
Write-Host ''
Write-Host "done. open $url on the classroom iPads."
Write-Host 'teachers enter the key under the lobby 先生用 section.'
