# 絵本と ABC の 絵を ぜんぶ Roblox へ 上げて、審査を 待つ（Windows・PowerShell）。1 回 走らせるだけ。
#
#   cd C:\Users\yukim\uspeak_meta; git pull; .\scripts\roblox-books.ps1
#
# する こと（上から じゅんに。なんど 走らせても よい：おくった 絵は もう おくらない）：
#   1. Roblox の Open Cloud の 鍵が Fly に まだ 入って いなければ、ここで たずねて 入れる
#      （字は 画面に 出ない・この PC の どこにも のこさない・入れる 先は fly secrets だけ）
#   2. サーバーが 新しい 版で なければ、先に デプロイする（scripts\redeploy.ps1）
#   3. サーバーの 中で、絵を ぜんぶ おくる → 審査が おわるまで 15 秒ごとに すすみを 出す
#   4. Roblox Studio の コマンドバーに 貼る 1 行を クリップボードに 入れる
#
#   -GroupId 123        グループの 持ちものに する とき（ふつうは いらない）
#   -AssetType Decal    Roblox が Image を うけつけなかった とき
#   -NewKey             鍵を 入れなおす とき
#   -PasteOnly          絵は おくらず、貼る 1 行を クリップボードに 入れるだけ
#   -Minutes 180        審査を 見はる 時間の 上限
param(
  [string]$App = 'uspeak-multiplayer',
  [string]$UserId = '10292435597',
  [string]$GroupId = '',
  [ValidateSet('', 'Image', 'Decal')][string]$AssetType = '',
  [int]$Minutes = 180,
  [switch]$NewKey,
  [switch]$PasteOnly
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
foreach ($name in 'Tls12', 'Tls13') {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::$name } catch { }
}
Set-Location (Join-Path $PSScriptRoot '..')
$url = "https://$App.fly.dev"
$lineFile = Join-Path (Get-Location) 'roblox\oneline\books-open-all.txt'

function Copy-Line {
  if (-not (Test-Path -LiteralPath $lineFile)) { Write-Host "✖ $lineFile が ありません。git pull を して から もう一度。"; return $false }
  $text = [IO.File]::ReadAllText($lineFile, [Text.Encoding]::UTF8).Trim()
  Set-Clipboard -Value $text
  Write-Host ''
  Write-Host "==> 貼る 1 行（$($text.Length) 字）を クリップボードに 入れました。あと 3 つ："
  Write-Host '    1. Roblox Studio で 絵本の place を ひらく（View → Command Bar で 下に 入力らんが 出る）'
  Write-Host '    2. その 入力らんを クリック → Ctrl+V → Enter（「✅ 3/3」が Output に 出れば OK）'
  Write-Host '    3. File → Publish to Roblox'
  Write-Host '    ※ Roblox の Secrets は いりません。入ると 2 秒で 本だなが ひらきます。'
  return $true
}
function Wait-Site([int]$tries = 30) {
  for ($i = 1; $i -le $tries; $i++) {
    try { $null = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 15; return $true } catch { Write-Host "    サーバーを 待って います…（$($i * 10) 秒）"; Start-Sleep -Seconds 10 }
  }
  return $false
}

if ($PasteOnly) { $null = Copy-Line; return }

if (-not (Get-Command fly -ErrorAction SilentlyContinue)) { Write-Host '✖ fly コマンドが 見つかりません。PowerShell を ひらきなおして もう一度。'; exit 1 }

# ---- 1. 鍵（名前の 一覧だけを 見る。中身は 読めないし 出さない） ----
Write-Host '==> Fly の 設定を 見ます'
$names = (fly secrets list -a $App 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Write-Host '✖ fly secrets list が できません。fly auth login を して から もう一度。'; exit 1 }
$set = @()
if ($NewKey -or $names -notmatch 'ROBLOX_OPEN_CLOUD_KEY') {
  Write-Host ''
  Write-Host '    Roblox の Open Cloud の 鍵が いります（まだの ときは：https://create.roblox.com/dashboard/credentials'
  Write-Host '    → Create API Key → API System に「assets」を 足して Read と Write に チェック → IP は 0.0.0.0/0）。'
  $secure = Read-Host -AsSecureString '    鍵を ここに 貼って Enter（字は 出ません）'
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim()
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  if ($plain.Length -lt 20) { Write-Host '✖ 鍵が みじかすぎます。もう一度 走らせて、鍵を まるごと 貼って ください。'; exit 1 }
  if ($plain -match '\s') { Write-Host '✖ 鍵の 中に 空白や 改行が あります。もう一度 コピーしなおして ください。'; exit 1 }
  $set += "ROBLOX_OPEN_CLOUD_KEY=$plain"
}
if ($GroupId) { if ($GroupId -notmatch '^\d+$') { Write-Host '✖ -GroupId は 数字だけ。'; exit 1 }; $set += "ROBLOX_CREATOR_GROUP_ID=$GroupId" }
elseif ($names -notmatch 'ROBLOX_CREATOR_USER_ID' -and $names -notmatch 'ROBLOX_CREATOR_GROUP_ID') { $set += "ROBLOX_CREATOR_USER_ID=$UserId" }
elseif ($PSBoundParameters.ContainsKey('UserId')) { $set += "ROBLOX_CREATOR_USER_ID=$UserId" }
if ($AssetType) { $set += "ROBLOX_BOOK_ASSET_TYPE=$AssetType" }

# ---- 2. サーバーが 新しい 版か（絵本を 合言葉なしで わたす 口が あるか） ----
$fresh = $false
try { $r = Invoke-WebRequest -Uri "$url/api/public/books?stage=A" -TimeoutSec 30 -UseBasicParsing; $fresh = ($r.StatusCode -eq 200) } catch { }
if (-not $fresh) {
  Write-Host '==> サーバーが まだ 古い 版なので、先に デプロイします（数分）'
  try { & (Join-Path $PSScriptRoot 'redeploy.ps1') -AppName $App }
  catch { Write-Host "✖ デプロイが できませんでした：$_"; exit 1 }
}

if ($set.Count -gt 0) {
  Write-Host "==> Fly に 入れます：$(($set | ForEach-Object { ($_ -split '=')[0] }) -join '・')（中身は 出しません）"
  # 鍵は この スクリプトの 中から わたす（打った コマンドの 履歴には のこらない・画面にも 出さない）。
  fly secrets set @set -a $App | Out-Null
  $code = $LASTEXITCODE
  $hadKey = [bool]($set | Where-Object { $_ -like 'ROBLOX_OPEN_CLOUD_KEY=*' })
  $plain = $null; $set = $null
  if ($code -ne 0 -and $hadKey) { Write-Host "✖ fly secrets set が しっぱいしました。fly status -a $App を 見て ください。"; exit 1 }
  if ($code -ne 0) { Write-Host '    （もう 同じ 中身が 入って いた ようです。つづけます）' }
  Write-Host '    入れました。サーバーが 立ちなおるのを 待ちます。'
  Start-Sleep -Seconds 15
}
if (-not (Wait-Site)) { Write-Host "✖ サーバーが 5 分 たっても こたえません。fly logs -a $App --no-tail を 見て ください。"; exit 1 }

# ---- 3. サーバーの 中で おくる（鍵は サーバーから 出ない） ----
Write-Host '==> 絵を おくります（ぜんぶで やく 1,470 まい：おくるのに 50 分ほど ＋ 審査）。この まどは 開けた ままに。'
Write-Host '    とちゅうで 切れても だいじょうぶ：サーバーの 中で つづきます。同じ コマンドを もう一度 走らせると 見られます。'
fly ssh console -a $App -C "node /app/server/scripts/roblox-books-run.mjs --minutes $Minutes"
$code = $LASTEXITCODE
if ($code -eq 3 -or $code -eq 2) { Write-Host ''; Write-Host '==> 上の「✖」を なおして から、同じ コマンドを もう一度。（絵が なくても 本は 読めます：.\scripts\roblox-books.ps1 -PasteOnly）'; exit $code }
if ($code -ne 0) { Write-Host ''; Write-Host "==> つながりが 切れた ようです（$code）。サーバーの 中では つづいて います。あとで 同じ コマンドを もう一度 走らせると つづきが 見られます。" }

# ---- 4. Studio に 貼る 1 行 ----
$null = Copy-Line
