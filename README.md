# U-Speak RPG マルチプレイ版

子ども向け英語学習ワールド「U-Speak RPG」に、教室で 1 クラス（最大 25〜30 人）が同じ世界で
アバターを動かせる Colyseus ベースのマルチプレイを追加したリポジトリです。

- `client/` … 既存の 1 人用 Three.js ゲーム（`client/dist` が手書きソース）＋ マルチプレイ層 `net-*.js`
- `server/` … Colyseus 0.15 サーバー（Node 20+、プレーン JS ESM）。静的クライアントも同じプロセスで配信
- `docs/` … フェーズ0レビュー、Google Sheets 設定、実機テストのチェックリスト
- `Dockerfile` / `fly.toml` … Fly.io 東京リージョン（nrt）用

オフライン 1 人用モードはそのまま残っています（ロビーで「ひとりで遊ぶ」）。

## アーキテクチャ（要点）

| 項目 | 実装 |
|---|---|
| 同期 | クライアント 20Hz 送信（変化時のみ、無変化時は 500ms 心拍）→ サーバー 10Hz 差分ブロードキャスト（Colyseus Schema） |
| 補間 | 受信位置は 100ms 遅らせて線形補間。欠落時は最終速度で最大 250ms 外挿→静止。6 unit 超のジャンプはスナップ。定数は `client/dist/net-config.js` に集約 |
| サーバー権威 | 位置・向き・アニメは申告のまま。**正誤判定・XP・コイン・捕獲・購入・学習ログはサーバーが確定**（クライアントは「どの問題にどの選択肢を答えたか」だけ送る） |
| 判定データ | サーバーが `client/dist/*-data.js` を直接 import。データの複製なし |
| iPad 復帰 | `visibilitychange` / `pageshow` / `pagehide` / `online` を処理。復帰時に 1.2 秒以内の疎通確認→ダメなら即再接続。再接続トークン → 名前での再参加の順で復元。切断後 60 秒は席を保持 |
| 講師 | 講師キー（環境変数 `TEACHER_KEY`）をロビーで入力。判定はサーバー側のみ。全員集合／個別移動／呼び出し／チャット一時停止 |
| チャット | `client/dist/phrases.json` の定型英語フレーズのみ。サーバーも同じ JSON で ID を検証 |
| ルーム | 1 ルーム = 1 クラス（クラスコード）。`MAX_CLIENTS`（既定 30）超過は「満員」で拒否。同名は 1 席 |
| 永続化 | Google スプレッドシート（write-behind、5 秒ごと）。未設定時はローカル JSON |

## ローカル起動

必要なもの：Node.js 20 以上。

```sh
cd server
npm ci
cp ../.env.example .env         # TEACHER_KEY などを編集
npm start                       # http://localhost:2567
```

`client/dist/vendor/colyseus.js`（ブラウザ用 SDK）はコミット済みです。SDK を更新したときだけ `npm run vendor` で再生成します。

ブラウザで http://localhost:2567 を開き、アバターを選び、ロビーで名前とクラスコードを入れて参加します。
別タブ／別端末（同じ LAN なら `http://<PCのIP>:2567`）で同じクラスコードを入れると同期します。
講師として入る場合はロビーの「先生用」に `.env` の `TEACHER_KEY` を入力します。

- Google Sheets を使わない場合の保存先：`server/data/store.json`
- 開発中の自動再起動：`npm run dev`
- ヘルスチェック：`curl localhost:2567/healthz`

### テスト

```sh
cd server && npm test           # 判定・経済・Sheetsストア・ルーム統合（実 WebSocket）
cd client && node tests/regression.mjs   # 既存 1 人用ゲームの回帰テスト
cd server && npm run test:e2e   # 実ブラウザ3画面（先生+生徒2）の同期・再接続テスト。要 Playwright（npm i -D playwright && npx playwright install chromium）
cd server && npm run test:scale # 実ブラウザ1画面 + ボット99接続（100人在室）の描画予算・復帰テスト
```

### 負荷テスト（25 接続・10 分）

```sh
cd server
npm run loadtest -- --url=ws://localhost:2567 --clients=25 --duration=600
# 本番: npm run loadtest -- --url=wss://<app>.fly.dev --clients=25 --duration=600 --class=loadtest
```

サーバー CPU / メモリ（`/healthz` を 5 秒ごとに取得）、1 クライアントあたりの下り帯域（KB/s）、
ブロードキャスト遅延の分布（p50/p95/p99）、切断回数を表示し、`server/loadtest-results/*.json` に保存します。

## 収容人数の目安（`docs/LOADTEST_RESULTS.md`）

| 構成 | 結果 |
|---|---|
| 1 クラス 25 人 × 10 分 | 下り 4.3 KB/s/台、遅延 p95 49 ms、CPU 2%、切断 0 |
| 4 クラス × 25 人 = 100 人同時 | 下り 4.2 KB/s/台、遅延 p95 50 ms、CPU 6%、切断 0 |
| 1 ワールドに 100 人（`MAX_CLIENTS=100`） | 下り 16 KB/s/台、遅延 p95 75 ms、CPU 5.5%、切断 0 |
| トンネル経由 1 クラス 25 人（実測） | 下り 3.8 KB/s/台、遅延 p95 182 ms、切断 0 |

クライアントは近い順に最大 32 人だけ描画し（`MAX_RENDERED_REMOTES`）、遠い人・ラベルは間引くので、
1 ワールド 100 人でも iPad 側の描画負荷は一定に抑えられます。通常授業は「1 クラス = 1 ルーム」で運用し、
学校全体のイベントで 1 ワールドにまとめたい場合だけ `MAX_CLIENTS` を上げてください。

## 環境変数

`.env.example` を参照。主なもの：

| 変数 | 既定 | 意味 |
|---|---|---|
| `PORT` | 2567 | 待受ポート |
| `MAX_CLIENTS` | 30 | 1 クラスの最大人数 |
| `TEACHER_KEY` | (空=講師無効) | 講師キー。8 文字以上 |
| `CORS_ORIGINS` | (dev: 全許可) | 許可するオリジン（カンマ区切り）。本番では必須 |
| `PATCH_RATE_MS` | 100 | ブロードキャスト間隔（10Hz） |
| `RECONNECT_GRACE_SEC` | 60 | 切断後に席を保持する秒数 |
| `STORE_BACKEND` | auto | `auto` / `sheets` / `file` / `memory` |
| `STORE_FLUSH_MS` | 5000 | Sheets への書き込み間隔 |
| `GOOGLE_SHEET_ID` ほか | | `docs/GOOGLE_SHEETS_SETUP.md` 参照 |
| `PUBLIC_SERVER_URL` | (同一ホスト) | クライアントと別ホストで動かすときの `wss://` URL（`/config.js` で配信） |
| `NET_OVERRIDES` | (なし) | クライアントの同期・描画定数を JSON で上書き（例 `{"INTERP_DELAY_MS":150,"MAX_RENDERED_REMOTES":24}`） |

接続先 URL はクライアントに埋め込まれていません。`/config.js`（環境変数から生成）→ `<meta name="uspeak-server">` →
`?server=` → ページと同じホスト、の順で決まります。https ページでは自動的に `wss://` になります。

## カード登録なしで実機テストする

自分の PC でサーバーを動かし、Cloudflare の無料トンネルで iPad から接続します。手順は `docs/TUNNEL_TESTING.md` を参照してください。

```powershell
# 初回のみ。インストール後に PowerShell を開き直してから実行ポリシーを解除する
winget install --id OpenJS.NodeJS.LTS -e; winget install --id Cloudflare.cloudflared -e
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

.\scripts\start-tunnel.ps1 -TeacherKey 先生用の8文字以上のパスワード
```

```sh
./scripts/start-tunnel.sh '先生用の8文字以上のパスワード'   # macOS / Linux
```

表示された `https://....trycloudflare.com` を iPad で開きます。Ctrl+C で停止し、URL は無効になります。
テスト専用で、URL は起動のたびに変わります。

## Fly.io へのデプロイ（東京 nrt）

付属のスクリプトが、アプリ作成・`fly.toml` のアプリ名と `CORS_ORIGINS` の同期・シークレット設定・デプロイ・疎通確認までを行います。

```sh
# macOS / Linux（初回も2回目以降も同じコマンド。アプリ名は世界で一意、取られていたら別名にする）
./scripts/deploy-fly.sh uspeak-multiplayer '8文字以上の講師キー'

# Google スプレッドシートも一緒に設定する場合
export GOOGLE_SHEET_ID='<スプレッドシートID>'
export GOOGLE_SERVICE_ACCOUNT_JSON="$(base64 -w0 service-account.json)"
./scripts/deploy-fly.sh uspeak-multiplayer '8文字以上の講師キー'
```

Windows PowerShell の場合は同じ内容の `.ps1` を使います。

```powershell
.\scripts\deploy-fly.ps1 uspeak-multiplayer '8文字以上の講師キー'
```

Windows には git と flyctl が必要です。どちらも入っていなければ次で導入し、PowerShell を開き直してください。

```powershell
winget install --id Git.Git -e --source winget
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

手動で行う場合は次のとおりです。

```sh
fly launch --copy-config --no-deploy --name uspeak-multiplayer --region nrt
fly secrets set TEACHER_KEY='<8文字以上の講師キー>' \
  CORS_ORIGINS='https://uspeak-multiplayer.fly.dev' \
  GOOGLE_SHEET_ID='<スプレッドシートID>' GOOGLE_SERVICE_ACCOUNT_JSON="$(base64 -w0 service-account.json)"
fly deploy
```

`fly.toml` のポイント：`auto_stop_machines = false` と `min_machines_running = 1` でアイドル時にスリープしない、
`force_https = true`、`/healthz` によるヘルスチェック、`primary_region = "nrt"`。
アプリ名を変える場合は `fly.toml` の `app` と `CORS_ORIGINS` を合わせてください。

デプロイ後の確認：

```sh
curl https://uspeak-multiplayer.fly.dev/healthz
fly logs
```

クライアントを別の静的ホスティングに置く場合は、その配信元を `CORS_ORIGINS` に追加し、
`PUBLIC_SERVER_URL=wss://uspeak-multiplayer.fly.dev` を設定します（クライアント側は `/config.js` を読めない
ので、`client/dist/config.js` に `window.USPEAK_CONFIG={serverUrl:"wss://..."}` を置くか `<meta name="uspeak-server">` を使います）。

## 講師の使い方

1. ロビーで名前を入れ、「先生用」を開いて講師キーを入力して参加。
2. 画面右下の 👩‍🏫 で先生コンソールを開く。
   - 📣 全員をここに集合 … 全員が先生の足元に移動（建物内からは不可。外で使う）
   - ⏸ チャットを一時停止 / ▶ 再開
   - 生徒一覧の 📢（呼び出し）… 生徒の画面にバナーが出て、ボタンで先生の所へ来られる
   - 生徒一覧の ⤵（ここへ移動）… その生徒を強制的に先生の所へ
   - 一覧には接続状態・場所・コイン・正解/回答数（サーバー集計）が 3 秒ごとに更新される

## 変更したファイル（既存ゲームへの影響範囲）

| ファイル | 変更 |
|---|---|
| `index.html` | `net.css`、`config.js`、`vendor/colyseus.js` の読み込み追加 |
| `game.js` | 会話データを `lesson-data.js` へ分離（内容不変）、`setupNet` 呼び出し、毎フレーム `net.update`、回答フック 1 行 |
| `fishing.js` / `adventure.js` | 回答時のフック 1 行ずつ |
| `fishing-state.js` | 売買時のフック、サーバー値で上書きする `reconcile()` |
| `rpg.js` | `activate(id, placePlayer, force)` の第 3 引数、`syncBuddy` 公開 |
| 新規 | `net-config.js` `net-hooks.js` `net-client.js` `remote-players.js` `chat.js` `teacher.js` `lobby.js` `net.css` `phrases.json` `lesson-data.js` `vendor/colyseus.js` |

既存の localStorage 保存キーと 1 人用の挙動は変えていません。オンライン時はコイン・所持品がサーバーの値で上書きされます。

## 既知の制約

- 問題文・選択肢の生成はクライアント側。データファイルを読める人が「常に正解を選ぶ」ことは防げない（正誤・コインの改ざんは防止）。
- ルームはサーバープロセスのメモリ上にあるため、Fly のマシンは 1 台構成（`fly.toml` の `[deploy]`）。
- 音声チャット（WebRTC）と AI 対話は本リポジトリのスコープ外。
- Colyseus は 0.15 系に固定（サーバー・クライアント SDK とも）。0.16 以降はコールバック API が変わるため、更新時は `net-client.js` の `onAdd/onChange/listen` を見直す。
