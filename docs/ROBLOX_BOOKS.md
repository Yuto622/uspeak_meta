# 絵本を Roblox 版に 出す（自動アップロード）

よみもの島の 絵本（120 冊・表紙と ページで 1,309 まい）を、Roblox 版でも 読める ように する しくみです。
絵は サーバーが かいた ものを 画像（PNG 1024×768）に して、Roblox の Open Cloud（Assets API）へ **自動で** 上げます。

## しくみ

| 仕事 | ファイル |
|---|---|
| 絵（SVG）→ PNG | `server/src/roblox/book-png.js`（@resvg/resvg-js。お金は かからない） |
| Roblox へ 上げる・記録・つづきから | `server/src/roblox/book-assets.js`（記録は `DATA_DIR/roblox-book-assets.json`） |
| 運営の 画面 | `/admin/roblox-books`（`server/src/roblox/book-admin.js`） |
| ターミナルから | `server/scripts/roblox-upload-books.mjs`（`--dry-run`・`--limit N`・`--book <id>`） |
| Roblox の ゲームへ わたす 口 | `server/src/roblox/books-api.js`（`/api/roblox/books`・`/books/<id>`・`/books/check`） |
| Roblox 側の スクリプト | `roblox/USpeakBooks.server.luau`・`roblox/USpeakBooksClient.client.luau` |

- **同じ 絵は 1 回だけ** 上げます。絵の かき方（`ART_VERSION`）や 場面が かわった 絵だけ 上げなおします。
- Roblox の **審査を 通った 絵だけ** が Roblox 版の 本に 出ます。審査中・だめだった ページは「じゅんびちゅう」。
- だめ（rejected）に なった 絵は 自動では 上げなおしません（同じ 絵は また 落ちる ため）。本の 場面を 直すと、その 絵だけ 上げなおします。
- クイズの 答えは Roblox の サーバーだけが 持つ 署名つきの token の 中（英検ドリルと 同じ）。判定・コイン・学習の 記録は Web の サーバー。
  記録は Web の よみもの島と 同じ 形（`quiz`・world=`reading`／ ✓ で `book`）なので、ロードマップと 保護者レポートが そのまま 数えます。
- Roblox では「きく・よむ」の しるしが ないので、**クイズ 8 割で その 本は ✓**。コインは 1 人 1 冊 1 回（20）・1 日 80 まで。

## はじめに する こと（運営・1 回だけ）

1. **Roblox の API キーを 作る**（Creator Dashboard → Open Cloud → API Keys）。
   - Access Permissions に **assets** を 足し、**Read** と **Write** を つける。
   - グループの 絵に する ときは、キーを 作る 人に グループの アセットを 作る 権限が いります。
   - IP の 制限は かけない（Fly の サーバーの IP は かわる ため）。
2. **キーは チャット・メール・コードに 書かない。** パソコンの ターミナルで 入れます（値は ここには 書きません）：
   - `fly secrets set ROBLOX_OPEN_CLOUD_KEY=…`
   - グループの 絵に する：`fly secrets set ROBLOX_CREATOR_GROUP_ID=…`（個人なら `ROBLOX_CREATOR_USER_ID=…`）。
     **ゲーム（experience）の 持ち主と 同じ** に して ください。ちがうと ゲームの 中で 絵が 出ません。
3. `/admin/roblox-books` を ひらいて「アップロードを はじめる」。1 回に 200 まい（数は かえられます）。
   おわったら もう一度 おすと つづきを 上げ、前に 上げた 絵の **審査の ようす** も 見なおします。
4. Roblox Studio で `roblox/USpeakBooks.server.luau`（ServerScriptService）と `roblox/USpeakBooksClient.client.luau`（StarterPlayerScripts）を 入れ、
   本だなに したい Part に タグ `USpeakBookShelf` と 属性 `Stage`（"A"・"B"・"C"・"1"〜"9"）を つける。
   Secrets の `USPEAK_WEB_KEY` と「Allow HTTP Requests」は いまの Roblox 版と 同じ。

## かえられる 設定（環境変数・ふつうは いらない）

| 名前 | 既定 | いみ |
|---|---|---|
| `ROBLOX_UPLOAD_PER_MIN` | 30 | 1 分に 上げる 数（Roblox から 429 が 来たら 自動で 待ちます） |
| `ROBLOX_BOOK_ASSET_TYPE` | `Image` | `Decal` に すると Decal として 上げる（そのときは 絵が 小さめの サムネイルに なります） |

## まだ たしかめて いない こと

- **本物の Roblox には まだ つないで いません。** にせの サーバーで ためした だけです（鍵が ない ため）。はじめは `--limit 5` か 画面の 数を 5 に して ためして ください。
- **Roblox の スクリプトは Studio で 動かして いません。**
- 1 分に 何まいまで 上げられるか は、読んだ 公式の 説明に 数字が ありません。30 まい／分に して あります（1,309 まいで 約 45 分）。
- アセットの 種類 `Image` で 上がらない ときは、画面の エラーに 400 と 出ます。そのときは `ROBLOX_BOOK_ASSET_TYPE=Decal` を ためして ください。
- 審査に かかる 時間・1 か月に 上げられる 数の 上限は、アカウント（本人確認の 有無 など）で かわります。

参考（公式）：Usage guide for assets（create.roblox.com/docs/cloud/guides/usage-assets）・Assets API v1（…/docs/cloud/reference … assets/v1）。

## Roblox の きまりに あわせた 絵（2026-11）
Roblox に 送る 絵だけ、審査に ひっかかりそうな ものを かえるか 外す（`server/src/roblox/safe-art.js`。Web の 絵は かわらない）。
おさけ → ガラスの びん、はもの → 食器・まき、お札 → コイン、宗教の たてもの → ふつうの たてもの、シャワー・トイレ・くちびる・下着などは 外す。
いま かわるのは 13 冊・22 まい。一覧は `/admin/roblox-books` の「Roblox の きまりに あわせて かえる 絵」。表を かえたら `SAFE_VERSION` を 上げる（かわった 絵だけ 上げなおす）。
検査は `server/test/roblox-safe-art.test.mjs`。「ABC と おと」の 絵カードは Roblox には 送って いない。
