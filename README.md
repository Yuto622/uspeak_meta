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
cd server && npm run test:layout # スマホ・iPad 5サイズでの画面崩れ検査（はみ出し・要素の重なりを自動判定）
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
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | (空=大広間なし) | おはなし島を **100人**の通話にする SFU。未設定なら 6 人メッシュに落ちる（下記） |

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

## 英会話島（AI英会話・キャラクター動画）

ワールドマップから **英会話島** に飛ぶと、4つの家があります。家に入って E を押すと、
ウーピー（画面の中のキャラクター）と英語で会話できます。

| 家 | 場面 | レベル |
|---|---|---|
| であいのカフェ | はじめまして／カフェでたのむ | 英検5級 |
| おかいものストリート | おみせでかう／みちをきく | 英検5級 |
| がっこうテラス | 学校の一日／しゅうまつのこと | 英検4級 |
| ゆめのとうだい | しょうらいのゆめ／行ってみたい国 | 英検3級 |

- **話すのはマイク、書いてもOK。** 送るのは「マイクが聞き取った文字列（または入力した文）」だけで、
  できたかどうかの判定は**すべてサーバー**（`server/src/ai/tutor.js`）。
- **できたこと（2〜3個）** が1つ埋まるごとに XP、全部そろうと **+40🪙**（1日の上限200）。
- **`OPENAI_API_KEY` が無くても動きます**（台本モードのウーピーが相手をします）。
  本物の会話にするならサーバーに `OPENAI_API_KEY` を入れてください。
- キャラクターは `client/dist/assets/character/idle.mp4` と `talking.mp4` の2本だけ。
  読み上げが鳴っている間だけ talking に切り替わります。差し替えるときは
  **同じ構図・同じ照明・最初と最後のフレームを揃える**（クロスフェードが見えなくなります）。
  デコードできない端末では絵のフクロウに自動で落ちるので、会話は止まりません。

## おはなし（通話）と大広間（100人）

部屋に入ればその部屋の全員と話せます。**部屋の大きさで仕組みが変わります。**

| | どこ | 人数 | 仕組み | サーバー費用 |
|---|---|---|---|---|
| 小部屋 | どの島の建物の中でも | 6人 | ブラウザー同士の直結（WebRTC メッシュ） | なし |
| 大広間 | おはなし島のひろば | **100人** | SFU（LiveKit）が声を1本ずつ受けて配る | LiveKit が要る |

**大広間には LiveKit が要ります。**3つの環境変数を入れるだけで、クライアントの変更は不要です。
未設定でもサーバーは普通に動き、おはなし島は 6 人メッシュに落ちて、画面にもそう出ます。

```bash
# 1) LiveKit Cloud（無料枠あり・東京リージョンを選べる）: https://cloud.livekit.io
#    プロジェクトを作って URL / API Key / API Secret をコピーする
fly secrets set LIVEKIT_URL=wss://<your>.livekit.cloud LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...

# 2) 自前で建てる（バイナリ1つ。Docker は不要。1.10 以降が必要）
curl -sSL https://get.livekit.io | bash
livekit-server --keys "mykey: <32文字以上の秘密>" --node-ip <サーバーの公開IP>
#    UDP 50000-60000 を開ける。学校が UDP を塞いでいる場合は --rtc.port-tcp 7881 で TCP にも出せる
```

鍵はサーバーから出ません。ブラウザーに渡るのは **その子・その部屋・2時間・何を出してよいか**を
書いて署名したトークンだけで、`server/src/game/stage.js` が発行します。

- **声は全員、カメラは先生と「ステージ」の子だけ。** 100台のカメラは授業ではなく通信障害なので、
  先生コンソールの名簿の 🎙 ボタンで子どもをステージに上げると、その子だけカメラと画面共有が開きます。
- **メッセージ（定型文）は人数に関係なく使えます。** マイクを入れていなくても読み書きできます。
- 動作確認：`LIVEKIT_BIN=./livekit-server node server/test/e2e/browser-stage.mjs`
  （本物の LiveKit を起動して実ブラウザー3枚で通す。バイナリが無ければ SKIP）。

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
| `rpg.js` | `activate(id, placePlayer, force)` の第 3 引数、`syncBuddy` 公開、おつかい島の登録・当たり判定 |
| `rpg-data.js` / `rpg-state.js` / `rpg-map.js` | おつかい島を 3 つめのハブとして追加 |
| `treasure-data.js` / `magic-data.js` | おつかい島には宝箱と U-Speak park 入口を置かない |
| `index.html` | 右側のボタン群を `.right-rail` でまとめ、`viewport-fit=cover` を追加 |
| 新規 | `net-config.js` `net-hooks.js` `net-client.js` `remote-players.js` `chat.js` `teacher.js` `lobby.js` `mission.js` `errand-data.js` `errand-island.js` `net.css` `mobile.css` `mission.css` `phrases.json` `missions.json` `lesson-data.js` `vendor/colyseus.js` |

既存の localStorage 保存キーと 1 人用の挙動は変えていません。オンライン時はコイン・所持品がサーバーの値で上書きされます。

## おつかいクエスト（おつかい島を歩くAI英会話）

**おつかい島**を歩いてやる「おつかい」です。判定・報酬・学習ログはサーバーが確定します。
詳細と運用は `docs/AI_MISSION.md` を参照してください。

```
① おつかい広場でミアから受け取る  →  ② お店まで歩いて英語で話す  →  ③ 広場にとどけてコイン
```

3つの区間はどれも、アバターがその場所に立っていることをサーバーが確認してから進みます。
一覧から選んでも行き先が決まるだけで、会話は始まりません。メニューだけでは完了できません。
（座標はクライアント申告なので不正の完全な防止ではありません。詳細は `docs/AI_MISSION.md`）

| 項目 | 実装 |
|---|---|
| 島 | `missions.json` の `island`（広場＋お店9か所）。クライアントの地形もサーバーの位置判定も同じ座標 |
| ミッション | `client/dist/missions.json`（15本、英検5〜2級）。サーバーも同じファイルを読む |
| AI | プロバイダをアダプタで分離。`OPENAI_API_KEY` 未設定なら台本パートナーで動作し、API料金ゼロ |
| サーバー権威 | AIの返答も検証。存在しないお題IDは破棄、達成の取り消し不可、完了はサーバーが再計算 |
| 位置の確認 | 受け取り・会話・とどけの3つとも、島の該当地点から半径5m（＋余裕1.5m）以内でなければ `too far` |
| 報酬 | とどけて初めてコインとスタンプ。`economy` の `award` はサーバー専用で、クライアントからは呼べない |
| 先生 | 先生コンソールで「今日のおつかい」を指定。クラス全員の画面に出る |
| コスト管理 | 1返答のトークン上限、連打制限、1日の発話上限、1ミッションの往復上限 |
| 安全 | 個人情報を聞かない、AIだと明かさない、級ごとの語彙制限、全発話をログに記録 |

```sh
# ローカル。キーなしでも動きます（台本モード）
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini npm start
```

## スマホ・タブレット対応

`client/dist/mobile.css` が端末サイズ別の調整をまとめて担当します。デスクトップの見た目は変えていません。

| 直した点 | 内容 |
|---|---|
| 移動ボタンが出ない | 画面幅600px以下でしか表示されず、iPad と横向きスマホでは指で歩けなかった。タッチ端末なら常に表示するよう変更 |
| ホットバーの見切れ | 画面下のメニューが16pxはみ出していた。中央寄せのレイアウトに変更して全体を表示 |
| 右側ボタンの画面外配置 | 地図・カメラ・RPG・釣り・図鑑が固定の縦位置で並び、横向きでは画面外に出ていた。1本の縦並び（`.right-rail`）にまとめ、入り切らない場合はスクロール |
| クエストパネルの重なり | 内容が伸びて移動ボタンに重なっていた。高さに上限を付けてスクロール |
| ノッチ・ホームバー | `env(safe-area-inset-*)` で iPhone の切り欠きを回避 |
| マルチプレイUI | 接続状況の表示を「● 3人」に圧縮し、チャットと先生ボタンを移動ボタンと同じ帯の反対側へ配置 |

検証は5サイズ（iPhone 縦横、小型スマホ、iPad 縦横）で自動化してあります。

```sh
cd server && npm run test:layout
```

はみ出しと要素の重なりを検出し、`server/loadtest-results/layout-*.png` にスクリーンショットを保存します。

## 既知の制約

- 問題文・選択肢の生成はクライアント側。データファイルを読める人が「常に正解を選ぶ」ことは防げない（正誤・コインの改ざんは防止）。
- ルームはサーバープロセスのメモリ上にあるため、Fly のマシンは 1 台構成（`fly.toml` の `[deploy]`）。
- 通話は2種類。建物の中は 6 人（ブラウザー同士の直結）、おはなし島のひろばは 100 人（SFU）。
  屋外はおはなし島以外 通話にならない。
- Colyseus は 0.15 系に固定（サーバー・クライアント SDK とも）。0.16 以降はコールバック API が変わるため、更新時は `net-client.js` の `onAdd/onChange/listen` を見直す。
