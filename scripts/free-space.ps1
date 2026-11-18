# C: ドライブの あき容量を 安全に ふやす（Windows・PowerShell）。
#
#   cd C:\Users\yukim\uspeak_meta; git pull; .\scripts\free-space.ps1
#
# 消すのは「あとで 自動で つくりなおされる もの」だけ：
#   一時ファイル・ごみ箱・npm／pip の キャッシュ・クラッシュの 記録・画面の シェーダー キャッシュ・
#   Roblox の ログと とちゅうで 止まった インストーラー・このリポジトリの git の ごみ。
# 消さない もの：ダウンロード・ドキュメント・デスクトップ・写真・アプリの 設定・ブラウザーの ログイン。
# 管理者で なくても 動く（管理者で ひらくと Windows の 一時ファイルも 消える）。
param([double]$NeedGb = 2)

$ErrorActionPreference = 'SilentlyContinue'
function FreeGb { [math]::Round((Get-PSDrive C).Free / 1GB, 2) }
$before = FreeGb
Write-Host "==> いまの あき：$before GB"

function Clear-Folder([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $size = (Get-ChildItem -LiteralPath $path -Recurse -Force -File | Measure-Object Length -Sum).Sum
  Get-ChildItem -LiteralPath $path -Force | Remove-Item -Recurse -Force
  Write-Host ("    {0,-28} {1,8:N0} MB" -f $label, ($size / 1MB))
}

Write-Host "==> 自動で つくりなおされる ものを 消す"
Clear-Folder $env:TEMP                                      'ユーザーの 一時ファイル'
Clear-Folder 'C:\Windows\Temp'                              'Windows の 一時ファイル'
Clear-Folder "$env:LOCALAPPDATA\CrashDumps"                 'クラッシュの 記録'
Clear-Folder "$env:LOCALAPPDATA\D3DSCache"                  'シェーダー キャッシュ'
Clear-Folder "$env:LOCALAPPDATA\NVIDIA\DXCache"             'NVIDIA キャッシュ'
Clear-Folder "$env:LOCALAPPDATA\npm-cache"                  'npm キャッシュ'
Clear-Folder "$env:APPDATA\npm-cache"                       'npm キャッシュ（古い 場所）'
Clear-Folder "$env:LOCALAPPDATA\pip\Cache"                  'pip キャッシュ'
Clear-Folder "$env:LOCALAPPDATA\Roblox\logs"                'Roblox の ログ'
Clear-Folder "$env:LOCALAPPDATA\Roblox\Downloads"           'Roblox の ダウンロードの のこり'
Clear-Folder "$env:LOCALAPPDATA\Temp\Roblox"                'Roblox の 一時ファイル'
Clear-Folder "$env:LOCALAPPDATA\Microsoft\Windows\INetCache" 'Windows の ネット キャッシュ'

Write-Host "==> ごみ箱を 空に する"
Clear-RecycleBin -DriveLetter C -Force

if (Test-Path (Join-Path $PSScriptRoot '..\.git')) {
  Write-Host "==> このリポジトリの git の ごみを まとめる（コミットは 消えない）"
  Push-Location (Join-Path $PSScriptRoot '..'); git gc --prune=now --quiet; Pop-Location
}

$after = FreeGb
Write-Host ""
Write-Host ("==> あき：{0} GB → {1} GB（+{2} GB）" -f $before, $after, [math]::Round($after - $before, 2))
if ($after -lt $NeedGb) {
  Write-Host "==> まだ $NeedGb GB に 足りません。大きい ものを 下に 出します（消すかは ご自分で きめて ください）。"
  foreach ($dir in @("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Videos", "$env:USERPROFILE\Documents")) {
    if (Test-Path $dir) {
      Get-ChildItem $dir -Force | ForEach-Object {
        $s = if ($_.PSIsContainer) { (Get-ChildItem $_.FullName -Recurse -Force -File | Measure-Object Length -Sum).Sum } else { $_.Length }
        [pscustomobject]@{ MB = [math]::Round($s / 1MB); Path = $_.FullName }
      } | Sort-Object MB -Descending | Select-Object -First 5 | Format-Table -AutoSize
    }
  }
  Write-Host "    Windows の「設定 → システム → 記憶域 → 一時ファイル」でも、Windows Update の のこりを 消せます（管理者）。"
} else {
  Write-Host "==> OK：$NeedGb GB 以上 あいて います。"
}
