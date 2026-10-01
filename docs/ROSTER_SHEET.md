# 名簿スプレッドシート — シートに書いてある名前の人しか入れないようにする

Google スプレッドシートを **名簿** にして、そこに書いてある名前（アカウント名）の子だけが
U-Speak Web にログインできるようにします。先生はブラウザーでシートに名前を足したり消したり
するだけで、サーバーには触りません。

**学習記録の置き場所（Fly のボリューム）はそのまま**です。名簿のシートは「読むだけ」で、
サーバーがシートに何かを書くことはありません。

## できあがりの動き

| 入ってきた人 | 結果 |
|---|---|
| シートに名前がある子 | 入れる |
| シートに名前がない子（前に遊んだことがあっても） | 入れない。画面に「この 名前は この クラスの めいぼに ありません」と出る |
| `TEACHER_KEY` を持つ先生 | 名簿を見ずに入れる |
| シートが一時的に読めないとき | **最後に読めた名簿**で判定（授業中に Google が落ちても子どもを締め出さない） |

名前の **大文字小文字・前後の空白・全角半角は区別しません**（`Aki` と ` aki ` は同じ子）。

## 1. シートを作る

Google スプレッドシートを新規作成して、1行目を見出しにし、2行目から名前を書きます。

| class | name | note |
|---|---|---|
| 6-1 | Aki | |
| 6-1 | Ben | 4月から |
| 6-2 | Chika | |
| | Sora | クラスに関係なく入れる |

- `class` はロビーで入れる **クラスコード**。空欄か `*` にした行は **どのクラスでも入れる**名前です。
- 見出しは日本語でも構いません（`クラス` / `名前` または `アカウント名` / `メモ`）。
- `name` の1列だけのシートでもよく、その場合は全員が「どのクラスでも入れる」扱いです。
- タブの名前は何でもよく、`roster` というタブがあればそれを、なければ **いちばん左のタブ** を読みます。
  別のタブにしたいときは `ROSTER_SHEET_TAB` にタブ名を入れます。

URL の `/d/` と `/edit` の間の文字列が **スプレッドシートID** です。控えておきます。

## 2. サービスアカウントを作って、シートを共有する

すでに学習記録を Google シートに置いている（`GOOGLE_SERVICE_ACCOUNT_JSON` を設定済み）なら、
**同じサービスアカウントをそのまま使えます**。手順 2 は飛ばして、新しい名簿シートを
そのメールアドレスに共有するだけです。

1. Google Cloud Console → プロジェクトを作成（または既存を選択）。
2. 「API とサービス」→「ライブラリ」→ **Google Sheets API** を有効化。
3. 「IAM と管理」→「サービスアカウント」→ 作成（例：`uspeak-server`）。ロールは不要。
4. 作ったサービスアカウント →「キー」→「鍵を追加」→ **JSON** をダウンロード。
5. 名簿シートの **共有** で、サービスアカウントのメールアドレス（`xxx@yyy.iam.gserviceaccount.com`）を
   追加する。**閲覧者で十分です**（サーバーは読むだけ）。これを忘れると 403 になります。

**JSON の鍵は、チャットやメールに貼らないでください。** 次の手順で `fly secrets` に直接入れます。
`fly secrets` はサーバーの中にだけ置かれ、`fly.toml` にも git にも残りません。

## 3. サーバーに教える（`fly secrets set`）

```sh
# macOS / Linux
fly secrets set --app uspeak-multiplayer \
  ACCESS_MODE=roster \
  ROSTER_SHEET_ID='<スプレッドシートID>' \
  GOOGLE_SERVICE_ACCOUNT_JSON="$(base64 -w0 service-account.json)"     # macOS は base64 -i service-account.json
```

```powershell
# Windows PowerShell
$json = [Convert]::ToBase64String([IO.File]::ReadAllBytes('service-account.json'))
fly secrets set --app uspeak-multiplayer ACCESS_MODE=roster ROSTER_SHEET_ID='<スプレッドシートID>' GOOGLE_SERVICE_ACCOUNT_JSON=$json
```

`fly secrets set` は **そのままマシンを入れ替えます**（`fly deploy` は不要）。1〜2分で戻ってきます。
`TEACHER_KEY` が入っていないと `ACCESS_MODE=roster` は起動を拒否します（先生も入れなくなるため）。

学習記録をすでに Google シートに置いている場合（`GOOGLE_SHEET_ID` 設定済み）、名簿は
そのシートの `roster` タブでもよく、その場合は `ROSTER_SHEET_ID` を省略できます。
`ROSTER_SHEET_ID` を入れればそちらが優先されます。

## 4. 効いたかを確かめる

**サーバーの側から**（鍵は何も出ません）：

```sh
curl -s https://uspeak-multiplayer.fly.dev/healthz
```

- `"gate":{"mode":"roster","register":"google-sheet"}` … 名簿シートで判定している
- `"gate":{"mode":"open",...}` … まだ誰でも入れる
- `"register":"file"` … シートではなく `data/roster.json` を見ている（`ROSTER_SHEET_ID` が未設定）

`fly logs` には起動時に `[roster] google sheet xxxxxx… tab="roster" rows=12` のように出ます。
`could not be read` と出たら、共有（手順 2-5）かスプレッドシートIDを見直してください。

**手元から、サーバーと同じ目でシートを読む**（`server/.env` に同じ変数を書いておく）：

```sh
cd server
node scripts/check-roster.mjs          # クラスごとに、入れる名前の一覧
node scripts/check-roster.mjs 6-1      # 6-1 に入れる名前だけ
```

## 5. 授業中に名前を足したとき

シートは **5分ごと** に読み直されます（`ROSTER_TTL_MS`）。いますぐ入れたいときは、
先生コンソールの **「🔄 めいぼを読み直す」** を押すと、そのクラスの名簿をその場で読み直します。

## 6. 名簿をやめるとき

```sh
fly secrets set --app uspeak-multiplayer ACCESS_MODE=open
```

シートと鍵はそのまま残しておいて構いません。`ACCESS_MODE=open` の間は名簿を読みもしません。

## 仕組み（開発者向け）

- `server/src/store/roster-sheet.js` … シートを読む（`spreadsheets.readonly` スコープ）・見出しの判定・`*` クラス。
- `server/src/game/gate.js` … 入場ゲート。名簿が読めたらそれが答え。読めないときだけ「最後に読めた名簿」→「そのクラスで遊んだ記録」の順に落ちる。
- `server/src/store/index.js` … 名簿の出どころを選ぶ（`ROSTER_SHEET_ID` → Sheets ストアの `roster` タブ → `data/roster.json`）。起動時に1回読んでログに出す。
- 判定はすべて **サーバー側**（`ClassRoom.onAuth`）。クライアントに名簿は渡りません。
- テスト：`server/test/roster-sheet.test.mjs`・`gate.test.mjs`・`access.test.mjs`。
