# Redeploy the already-created Fly app (Windows PowerShell).
#
#   .\scripts\redeploy.ps1
#
# scripts\deploy-fly.ps1 is for the FIRST deploy: it creates the app, rewrites fly.toml
# and sets the secrets. This one only ships the current code, and it refuses to start
# when the conditions that broke the site in September are present.
#
# **What broke it:** C: had 0.8 GB free. `git pull` wrote truncated files without
# failing, `git merge --ff-only` then refused, and `fly deploy` shipped the corrupted
# working tree. The site went down and the cause was two steps upstream of the deploy.
# So: disk first, then a clean tree, then the build.
param(
  [string]$AppName = 'uspeak-multiplayer',
  [int]$MinFreeGb = 5
)
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 offers TLS 1.0 first and Fly.io refuses it: without this the
# health check below fails on an app that deployed fine.
foreach ($name in 'Tls12', 'Tls13') {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::$name } catch { }
}

Set-Location (Join-Path $PSScriptRoot '..')
$root = Get-Location
Write-Host "==> repo  $root"

# 1. Disk. The one that actually bit us.
$drive = (Get-Item $root).PSDrive.Name
$free = [math]::Round((Get-PSDrive $drive).Free / 1GB, 1)
Write-Host "==> disk  ${drive}: ${free} GB free (need $MinFreeGb)"
if ($free -lt $MinFreeGb) {
  throw "only $free GB free on ${drive}:. git writes truncated files at this point and the deploy ships them. Free some space first (Downloads, Docker images, old builds), then run this again."
}

# 2. A clean tree. A half-written file is not something to ship.
$dirty = (git status --porcelain)
if ($dirty) {
  Write-Host $dirty
  throw 'the working tree has uncommitted changes. Commit them or `git checkout -- .` before deploying.'
}

# 3. What is about to ship.
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse --short HEAD).Trim()
Write-Host "==> ship  $branch @ $head"

if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
  throw 'flyctl not found. Close and reopen PowerShell after installing it: https://fly.io/docs/flyctl/install/'
}

# 4. Build on Fly's own builder. **--depot=false** because Depot returned 401 here;
# the classic remote builder is slower but it works with this account.
Write-Host '==> deploying (this takes a few minutes)'
fly deploy --app $AppName --remote-only --depot=false
if ($LASTEXITCODE -ne 0) { throw "deploy failed. Run: fly logs --app $AppName" }

# 5. Prove it, rather than assume it. A deploy that 'succeeded' has still shipped a
# broken tree before, so ask the live site for a file only this version has.
Write-Host ''
Write-Host '==> checking the live site'
$url = "https://$AppName.fly.dev"
Start-Sleep -Seconds 6
try {
  $health = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 20
  Write-Host ("healthz : " + ($health | ConvertTo-Json -Compress))
} catch { Write-Warning "healthz did not answer yet: $_" }
foreach ($file in 'lang.json', 'i18n.js') {
  try {
    $r = Invoke-WebRequest -Uri "$url/$file" -TimeoutSec 20 -UseBasicParsing
    Write-Host ("{0,-10}: {1} ({2} bytes)" -f $file, $r.StatusCode, $r.RawContentLength)
  } catch { Write-Warning "$file did not load: $_" }
}
Write-Host ''
Write-Host "done. $url"
# ASCII only below: Windows PowerShell 5.1 reads a BOM-less UTF-8 script as the system
# code page, so anything else printed from here arrives as mojibake.
Write-Host 'Open it on an iPad and check the header: the language button is next to "?".'
