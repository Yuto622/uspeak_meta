# カード登録なしで実機テストする（Cloudflare トンネル）

自分の PC でサーバーを動かし、Cloudflare の無料トンネルでインターネットに公開します。
クラウドのアカウントもクレジットカードも不要です。iPad から教室外でも接続できます。

**テスト専用です。** URL は起動のたびに変わり、PC を閉じると使えなくなります。
教室で正式に使うときは `scripts/deploy-fly.ps1` で Fly.io にデプロイしてください。

## 1. 必要なものを入れる（初回のみ）

Windows PowerShell で実行します。

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Cloudflare.cloudflared -e --source winget
```

**インストール後は PowerShell を閉じて開き直してください。** そのあと確認します。

```powershell
git --version
node --version
cloudflared --version
```

続けて、PowerShell スクリプトの実行を許可します。Windows は初期状態でこれを禁止しており、
`npm` 自体も PowerShell スクリプトなので、解除しないと先に進めません。

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

確認を聞かれたら `Y` を押します。自分で用意したスクリプトは実行でき、インターネットから
ダウンロードした署名なしスクリプトはブロックされたままになる設定です。1回だけで済みます。

macOS の場合は Homebrew で入ります。

```sh
brew install git node cloudflared
```

## 2. コードを取得（初回のみ）

```powershell
cd $HOME
git clone https://github.com/Yuto622/uspeak_meta.git
cd uspeak_meta
```

## 3. 起動する（毎回）

```powershell
cd $HOME\uspeak_meta
.\scripts\start-tunnel.ps1 '先生用の8文字以上のパスワード'
```

macOS / Linux では次を使います。

```sh
cd ~/uspeak_meta
./scripts/start-tunnel.sh '先生用の8文字以上のパスワード'
```

初回は依存パッケージのインストールで数分かかります。完了すると URL が表示されます。

インストールが途中で中断された場合（ウィンドウを閉じた、電源が切れた）は、
サーバーフォルダで手動インストールしてからやり直してください。進行状況が画面に出ます。

```powershell
cd $HOME\uspeak_meta\server
npm ci
```

```
=======================================================
  open this on the iPads:  https://xxxx-yyyy-zzzz.trycloudflare.com
=======================================================
```

この URL を iPad の Safari で開きます。生徒は名前とクラスコードを入れるだけです。
先生は同じ URL を開き、ロビーの「先生用」にパスワードを入れます。

保護者レポートのリンクは、先生コンソールの「📄 保護者レポートのリンク」に出ます
（子ども1人につき1本）。署名の鍵は初回起動時に `.tunnel-logs/report-secret.txt` に
作られ、次回以降も同じものを使うので、一度配ったリンクは生き続けます。
**このファイルを消すと、配ったリンクはすべて無効になります。**

## 4. 終了する

このウィンドウで **Ctrl+C** を押します。サーバーが止まり、URL も使えなくなります。
次に起動すると URL は別のものになるので、生徒に配り直す必要があります。

## つながらないとき

**`Allow outbound QUIC traffic on port 7844` と出て URL が反応しない**

cloudflared は既定で QUIC（UDP 7844）を使います。これを塞いでいるネットワークでは接続できません。
Ctrl+C で止めて、HTTP/2（TCP）に切り替えて起動し直してください。

```powershell
.\scripts\start-tunnel.ps1 -TeacherKey <キー> -Protocol http2
```

macOS / Linux では環境変数で指定します。

```sh
PROTOCOL=http2 ./scripts/start-tunnel.sh '<キー>'
```

**`dial tcp [2606:4700:...]:7844: i/o timeout` と出る**

Cloudflare のエッジが IPv6 で解決されているのに、その回線が IPv6 を通していません。IPv4 を強制します。

```powershell
.\scripts\start-tunnel.ps1 -TeacherKey <キー> -Protocol http2 -EdgeIpVersion 4
```

```sh
PROTOCOL=http2 EDGE_IP_VERSION=4 ./scripts/start-tunnel.sh '<キー>'
```

**それでもポート 7844 に届かない**

回線が 7844 番を塞いでいます。切り分けと回避策は次のとおりです。

- スマホのテザリングに切り替えて再実行する。通ればルーター側の制限が原因
- Windows ファイアウォールで cloudflared の送信を許可する
- どちらも駄目なら Fly.io にデプロイする。通常の HTTPS だけを使うのでこの問題は起きない

**`port ... is already in use`**

前回の起動が別のウィンドウで動いたままです。そのウィンドウで Ctrl+C を押すか、別のポートを指定します。

```powershell
.\scripts\start-tunnel.ps1 -TeacherKey <キー> -Port 2568
```

## 注意点

- **PC をスリープさせない**こと。スリープすると全員切断されます。電源設定で「スリープしない」にしてください。
- URL を知っている人は誰でも入れます。授業以外の場所に貼らないでください。終了すれば無効になります。
- PC の上り回線を全員で使います。25人なら常時 100 KB/s 程度なので家庭回線でも足りますが、
  PC が教室外にある場合は PC 側の回線品質がそのまま遅延になります。
- 学習記録は `server/data/store.json` に保存されます。Google スプレッドシートに送りたい場合は、
  起動前に環境変数を設定してください（`docs/GOOGLE_SHEETS_SETUP.md` 参照）。

```powershell
$env:GOOGLE_SHEET_ID = 'スプレッドシートID'
$env:GOOGLE_SERVICE_ACCOUNT_JSON = 'base64のサービスアカウントJSON'
$env:STORE_BACKEND = 'sheets'
.\scripts\start-tunnel.ps1 '先生用のパスワード'
```

## 実機テストで何を確認するか

`docs/DEVICE_TEST_CHECKLIST.md` の A 節（接続・同期）と C 節（iPad のバックグラウンド復帰）を
優先してください。この2つが通れば、Fly.io にデプロイしても同じ挙動になります。

## Fly.io に移行するとき

トンネルで問題がなければ、カードを登録して次を実行するだけです。コードは同じものが動きます。

```powershell
fly auth login
.\scripts\deploy-fly.ps1 uspeak-multiplayer '先生用のパスワード'
```

違いは、URL が固定になること、PC を起動しなくてよいこと、CORS が本番用に絞られることの3点です。
