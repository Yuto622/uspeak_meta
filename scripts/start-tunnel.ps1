# Run the multiplayer server on this PC and expose it to the internet through a free
# Cloudflare quick tunnel. No cloud account and no credit card needed.
#
#   .\scripts\start-tunnel.ps1 'teacher-password'
#
# Prints an https URL that iPads can open from anywhere. Press Ctrl+C to stop:
# the tunnel closes, the server stops, and the URL stops working.
#
# For testing only. The URL changes every run and Cloudflare gives no uptime promise.
# For classroom use deploy with scripts/deploy-fly.ps1 instead.
param(
  [Parameter(Mandatory = $true)][string]$TeacherKey,
  [int]$Port = 2567
)
$ErrorActionPreference = 'Stop'

if ($TeacherKey.Length -lt 8) { throw 'teacher key must be at least 8 characters' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js not found. Install it (winget install --id OpenJS.NodeJS.LTS) and reopen PowerShell.'
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared not found. Install it (winget install --id Cloudflare.cloudflared) and reopen PowerShell.'
}

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $repo 'server'
$logDir = Join-Path $repo '.tunnel-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir 'server.out.log'
$errLog = Join-Path $logDir 'server.err.log'

# 1. Dependencies (first run only).
if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
  Write-Host '==> installing server dependencies (first run only)'
  Push-Location $serverDir
  try { npm ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
}

# 2. Start the server. Development mode, so any origin is accepted: the page and the
#    WebSocket both come through the tunnel, so they are same-origin anyway.
$env:TEACHER_KEY = $TeacherKey
$env:PORT = "$Port"
$env:NODE_ENV = 'development'
$env:STORE_BACKEND = 'file'
Write-Host "==> starting server on port $Port"
$server = Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory $serverDir `
  -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog

try {
  # 3. Wait until the server answers its health check.
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 700
    if ($server.HasExited) { Get-Content $errLog -Tail 20; throw 'the server exited during startup' }
    try { Invoke-RestMethod "http://127.0.0.1:$Port/healthz" -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { }
  }
  if (-not $ready) { Get-Content $errLog -Tail 20; throw 'the server did not become healthy' }
  Write-Host '==> server is healthy'

  # 4. Open the tunnel and surface the public URL as soon as cloudflared prints it.
  Write-Host '==> opening the Cloudflare tunnel (this can take a few seconds)'
  Write-Host ''
  $shown = $false
  & cloudflared tunnel --url "http://localhost:$Port" 2>&1 | ForEach-Object {
    $line = "$_"
    if (-not $shown -and $line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      $url = $Matches[0]
      $shown = $true
      Write-Host ''
      Write-Host '======================================================='
      Write-Host "  open this on the iPads:  $url"
      Write-Host '======================================================='
      Write-Host '  students: name + class code'
      Write-Host '  teacher : same page, open 先生用 and enter the key'
      Write-Host '  stop    : press Ctrl+C in this window'
      Write-Host ''
    }
    Write-Host $line
  }
} finally {
  Write-Host ''
  Write-Host '==> stopping the server'
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Write-Host 'the tunnel URL no longer works. progress is saved in server/data/store.json.'
}
