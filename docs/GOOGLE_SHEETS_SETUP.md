# Google スプレッドシート（永続化）のセットアップ

サーバーは **サービスアカウント** でスプレッドシートに書き込みます。API キーは不要で、
鍵はサーバーの環境変数（Fly.io では secrets）にだけ置きます。クライアントには一切渡りません。

## 1. スプレッドシートを作る

1. Google スプレッドシートを新規作成（名前は自由。例：`U-Speak 学習記録`）。
2. URL の `/d/` と `/edit` の間の文字列が **スプレッドシートID** です。控えておく。
3. タブ（シート）は作らなくて構いません。サーバーが初回起動時に `players` / `learning_log` / `coin_log` を
   見出し付きで自動作成します。

## 2. サービスアカウントを作る

1. Google Cloud Console → プロジェクトを作成（または既存を選択）。
2. 「API とサービス」→「ライブラリ」→ **Google Sheets API** を有効化。
3. 「IAM と管理」→「サービスアカウント」→ 作成（例：`uspeak-server`）。ロールは不要。
4. 作成したサービスアカウント →「キー」→「鍵を追加」→ JSON をダウンロード。
5. **スプレッドシートの共有** で、サービスアカウントのメールアドレス（`xxx@yyy.iam.gserviceaccount.com`）を
   **編集者** として追加する。これを忘れると 403 になります。

## 3. サーバーに渡す（どちらか一方）

方法A：JSON を base64 で 1 変数にまとめる（推奨。改行の扱いで失敗しない）

```sh
base64 -w0 service-account.json      # macOS は base64 -i service-account.json
fly secrets set GOOGLE_SHEET_ID=<スプレッドシートID> GOOGLE_SERVICE_ACCOUNT_JSON=<上の出力>
```

方法B：メールと秘密鍵を個別に渡す

```sh
fly secrets set GOOGLE_SHEET_ID=<ID> \
  GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@yyy.iam.gserviceaccount.com \
  GOOGLE_PRIVATE_KEY="$(jq -r .private_key service-account.json)"
```

ローカル開発では `server/.env` に同じ変数を書きます（`.env` は git 管理外）。
`GOOGLE_SHEET_ID` が空のときは自動的に `server/data/store.json`（ローカルファイル）に保存されます。

## 4. 書き込まれる内容

| タブ | 1行の意味 | 主な列 |
|---|---|---|
| `players` | 生徒1人＝1行（クラス+名前で一意）。上書き更新 | coins, correct, attempts, catches, space/x/z, inventory_json, progress_json, last_seen |
| `learning_log` | 1回答＝1行（追記） | timestamp, class, name, question_id, mode, choice, correct(1/0), xp |
| `coin_log` | コインの増減＝1行（追記） | timestamp, class, name, op(catch/sell/buy/buyWand), item, quantity, delta, balance |

保護者向けレポートは `learning_log` を name / 日付で集計して作成できます（`correct` の合計 ÷ 行数 = 正答率）。

## 5. 運用上の注意

- 書き込みは最大 `STORE_FLUSH_MS`（既定 5 秒）遅れます。授業中にシートを開いていても問題ありません。
- シートの値を手で書き換えても、接続中のサーバーのメモリには反映されません（その生徒が次に接続したときに読み込まれます）。
- Sheets API の上限（1分あたり 60 書き込み）に対し、本サーバーは 5 秒ごとに最大 4 リクエストしか送りません。
- Google 側が一時的に落ちても授業は続行できます（メモリ上で動き続け、復旧後にまとめて書き込み）。
  サーバープロセスが再起動すると未書き込み分は失われるため、`/healthz` の `store.pending` を監視してください。
- 列を増やしたい場合は `server/src/store/records.js` の `PLAYER_COLUMNS` を変更し、シートの見出し行も合わせます。
