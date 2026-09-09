# Run the multiplayer server on this PC and expose it to the internet through a free
# Cloudflare quick tunnel. No cloud account and no credit card needed.
#
#   .\scripts\start-tunnel.ps1 -TeacherKey teacher-password
#
# Prints an https URL that iPads can open from anywhere. Press Ctrl+C to stop:
# the tunnel closes, the server stops, and the URL stops working.
#
# For testing only. The URL changes every run and Cloudflare gives no uptime promise.
# For classroom use deploy with scripts/deploy-fly.ps1 instead.
param(
  [Parameter(Mandatory = $true)][string]$TeacherKey,
  [int]$Port = 2567,
  # cloudflared reaches Cloudflare over QUIC (UDP 7844) by default. Networks that
  # block UDP report "Allow outbound QUIC traffic on port 7844 or use HTTP2" and the
  # tunnel never serves; pass -Protocol http2 to fall back to TCP.
  [ValidateSet('auto', 'http2', 'quic')][string]$Protocol = 'auto',
  # cloudflared may resolve Cloudflare's edge to IPv6. On a network without working
  # IPv6 that shows up as "dial tcp [2606:4700:...]:7844: i/o timeout"; pass 4 to
  # force IPv4.
  [ValidateSet('auto', '4', '6')][string]$EdgeIpVersion = 'auto'
)
$ErrorActionPreference = 'Stop'

if ($TeacherKey.Length -lt 8) { throw 'teacher key must be at least 8 characters' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js not found. Install it (winget install --id OpenJS.NodeJS.LTS) and reopen PowerShell.'
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared not found. Install it (winget install --id Cloudflare.cloudflared) and reopen PowerShell.'
}

# An earlier run left running in another window would otherwise fail deep inside the
# server with a raw EADDRINUSE stack trace.
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $owner = ($busy | Select-Object -First 1).OwningProcess
  $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
  throw "port $Port is already in use by process $owner ($name), most likely an earlier run of this script. Close that PowerShell window, or start this one on another port:  .\scripts\start-tunnel.ps1 -TeacherKey <key> -Port $($Port + 1)"
}

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $repo 'server'
$logDir = Join-Path $repo '.tunnel-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir 'server.out.log'
$errLog = Join-Path $logDir 'server.err.log'

# 1. Dependencies. Check for a real entry point, not just the folder: an install that
#    was interrupted (closed window, flat battery) leaves a partial node_modules behind.
$marker = Join-Path $serverDir 'node_modules\colyseus\package.json'
if (-not (Test-Path $marker)) {
  Write-Host '==> installing server dependencies (a few minutes on the first run)'
  Push-Location $serverDir
  try { npm ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Run it by hand in the server folder to see the error.' }
  if (-not (Test-Path $marker)) { throw 'dependencies are still incomplete after npm ci' }
}

# 2. Start the server. Development mode, so any origin is accepted: the page and the
#    WebSocket both come through the tunnel, so they are same-origin anyway.
$env:TEACHER_KEY = $TeacherKey
$env:PORT = "$Port"
$env:NODE_ENV = 'development'
$env:STORE_BACKEND = 'file'
Write-Host "==> starting server on port $Port"
$tunnel = $null
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

  # 4. Open the tunnel. cloudflared writes its banner and the public URL to stderr, and
  #    piping a native command's stderr into PowerShell turns every line into an error
  #    record, which aborts the script under $ErrorActionPreference = 'Stop'. So capture
  #    both streams to files and read the URL out of them instead.
  Write-Host '==> opening the Cloudflare tunnel (this can take a few seconds)'
  $tunOut = Join-Path $logDir 'tunnel.out.log'
  $tunErr = Join-Path $logDir 'tunnel.err.log'
  Remove-Item $tunOut, $tunErr -ErrorAction SilentlyContinue
  $tunnelArgs = @('tunnel', '--url', "http://localhost:$Port")
  if ($Protocol -ne 'auto') { $tunnelArgs += @('--protocol', $Protocol) }
  if ($EdgeIpVersion -ne 'auto') { $tunnelArgs += @('--edge-ip-version', $EdgeIpVersion) }
  $tunnel = Start-Process -FilePath 'cloudflared' -ArgumentList $tunnelArgs `
    -PassThru -NoNewWindow -RedirectStandardOutput $tunOut -RedirectStandardError $tunErr

  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 700
    $text = ((Get-Content $tunOut, $tunErr -Raw -ErrorAction SilentlyContinue) -join "`n")
    if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
    if ($tunnel.HasExited) { break }
  }
  if (-not $url) {
    Write-Host '--- cloudflared output ---'
    Get-Content $tunErr -Tail 25 -ErrorAction SilentlyContinue
    throw 'the tunnel did not report a URL'
  }

  Write-Host ''
  Write-Host '======================================================='
  Write-Host "  open this on the iPads:  $url"
  Write-Host '======================================================='
  Write-Host '  students: name + class code'
  Write-Host '  teacher : same page, open the teacher section and enter the key'
  Write-Host '  stop    : press Ctrl+C in this window'
  Write-Host ''
  Write-Host 'running. tunnel warnings, if any, appear below.'
  Write-Host 'if the log repeats "Serve tunnel error", stop and rerun with:'
  Write-Host '  -Protocol http2                  (the network blocks QUIC on UDP 7844)'
  Write-Host '  -Protocol http2 -EdgeIpVersion 4 (and it has no working IPv6 route)'

  # 5. Stay up until Ctrl+C or until either process dies, surfacing only real problems.
  $offset = 0
  while (-not $tunnel.HasExited -and -not $server.HasExited) {
    Start-Sleep -Seconds 2
    $lines = @(Get-Content $tunErr -ErrorAction SilentlyContinue)
    if ($lines.Count -gt $offset) {
      $lines[$offset..($lines.Count - 1)] | Where-Object { $_ -match 'ERR|WRN' } | ForEach-Object { Write-Host $_ }
      $offset = $lines.Count
    }
  }
  if ($server.HasExited) { Write-Warning 'the server stopped'; Get-Content $errLog -Tail 20 -ErrorAction SilentlyContinue }
  if ($tunnel.HasExited) { Write-Warning 'the tunnel stopped'; Get-Content $tunErr -Tail 20 -ErrorAction SilentlyContinue }
} finally {
  Write-Host ''
  Write-Host '==> stopping the tunnel and the server'
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Write-Host 'the tunnel URL no longer works. progress is saved in server/data/store.json.'
}
