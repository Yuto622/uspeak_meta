# Run the multiplayer server on this PC for iPads on the same Wi-Fi. No tunnel, no
# cloud, no account: the iPads open this PC's address directly.
#
#   .\scripts\start-lan.ps1 -TeacherKey teacher-password
#
# Use this when the Cloudflare tunnel will not come up (a network that blocks its
# ports, or a DNS that refuses trycloudflare.com). The one thing it cannot do is reach
# an iPad on a different network, so for testing from home use the tunnel or Fly.io.
param(
  [Parameter(Mandatory = $true)][string]$TeacherKey,
  [int]$Port = 2567
)
$ErrorActionPreference = 'Stop'

if ($TeacherKey.Length -lt 8) { throw 'teacher key must be at least 8 characters' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js not found. Install it (winget install --id OpenJS.NodeJS.LTS) and reopen PowerShell.'
}

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $owner = ($busy | Select-Object -First 1).OwningProcess
  $name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
  throw "port $Port is already in use by process $owner ($name). Close that window, or use -Port $($Port + 1)."
}

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $repo 'server'
$logDir = Join-Path $repo '.tunnel-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$marker = Join-Path $serverDir 'node_modules\colyseus\package.json'
if (-not (Test-Path $marker)) {
  Write-Host '==> installing server dependencies (a few minutes on the first run)'
  Push-Location $serverDir
  try { npm ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Run it by hand in the server folder to see the error.' }
}

# The address the iPads type. Prefer a private address on a real adapter: a laptop often
# also has virtual ones (Hyper-V, WSL, VPN) that no iPad can reach.
$candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object -Property @{ Expression = { if ($_.InterfaceAlias -match 'Wi-Fi|Wireless|Ethernet') { 0 } else { 1 } } }, InterfaceMetric
$ip = ($candidates | Select-Object -First 1).IPAddress
if (-not $ip) { throw 'no network address found. Is this PC on Wi-Fi?' }

# Windows blocks inbound connections by default, which looks exactly like "the iPad
# cannot open it". Add the rule if we are allowed to; say so plainly if we are not.
$rule = Get-NetFirewallRule -DisplayName "U-Speak $Port" -ErrorAction SilentlyContinue
if (-not $rule) {
  try {
    New-NetFirewallRule -DisplayName "U-Speak $Port" -Direction Inbound -Protocol TCP `
      -LocalPort $Port -Action Allow -Profile Private, Domain -ErrorAction Stop | Out-Null
    Write-Host "==> firewall: allowed inbound TCP $Port on private networks"
  } catch {
    Write-Host "==> could not add a firewall rule (needs an administrator PowerShell)."
    Write-Host "    If the iPads cannot open the address, run this once as administrator:"
    Write-Host "    New-NetFirewallRule -DisplayName 'U-Speak $Port' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private"
  }
}

$env:TEACHER_KEY = $TeacherKey
$env:PORT = "$Port"
$env:NODE_ENV = 'development'
$env:STORE_BACKEND = 'file'
$secretFile = Join-Path $logDir 'report-secret.txt'
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  Set-Content -Path $secretFile -NoNewline -Value ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'))
}
$env:REPORT_SECRET = (Get-Content $secretFile -Raw).Trim()

Write-Host ''
Write-Host '======================================================='
Write-Host "  open this on the iPads:  http://${ip}:$Port"
Write-Host '======================================================='
Write-Host '  the iPads must be on the same Wi-Fi as this PC'
Write-Host '  students: name + class code'
Write-Host '  teacher : same page, open the teacher section and enter the key'
Write-Host '  stop    : press Ctrl+C in this window'
Write-Host ''
Push-Location $serverDir
try { node src/index.js } finally { Pop-Location }
