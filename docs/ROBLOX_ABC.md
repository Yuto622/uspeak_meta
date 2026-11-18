# 「ABC と おと」を Roblox 版に 出す

Web 版の 幼児モードの カード「ABC と おと」と **同じ 問題・同じ きまり**を、Roblox の **ABC 用の place**（えほんの place とは べつ）で あそべる ように する。

## しくみ

- **問題を 作るのも 判定も Web の サーバー**（`server/src/roblox/abc-api.js` が Web と 同じ `server/src/game/abc.js` を 使う）。
  はじめの 数問で どこから はじめるかを きめる・8 わりで つぎへ・にがての ふくしゅう・クラスごとの 設定（`/admin/abc`）も 同じ。
- **記録は Web の その 子と 同じ 1 つ**。Roblox の 名前は つなぎ表（Roblox の 名前 ↔ Web の クラス・名前）で Web の 子に なおす。
  つなぎが ない 子は「Roblox が 言う クラス（なければ `roblox`）・Roblox の 名前」の 記録に なる。
- **答えは 先に 出ない**：1 回ぶん（round）は Web の サーバーが おぼえ、Roblox には しるし（sid）と 選択肢だけ わたす。sid は Roblox の サーバー Script だけが 持つ。
- **記録**：判定した 答えは 1 問ずつ `roblox_events` の `quiz`（world=abc・source=roblox）、1 回ぶんが おわると `abc`（保護者レポートの「おぼえた もじ ○/26・よめる ルール ○こ」）。コインは 出ない（Web と 同じ）。
- **絵**：ことばの 絵カード（じぶんたちで かいた 絵・512×512）を、絵本と 同じ 道具（`/admin/roblox-books`）で Roblox へ 上げる。もじは 上げない（Roblox の 画面で 字として 出す）。
  **もじ 26 と きまり ぜんぶに 使える 絵が 審査を 通るまで はじめられない**（画面に「えを じゅんびちゅう」）。まだ 審査を 通って いない 絵の ことばは 問題に 使わない。
- **Roblox には 出さない ことば**（上げない・Roblox 版の 問題にも 使わない。Web は そのまま）：`bath`（おふろの 子）・`underwear`（下着）・`mouth`（くちびる）・`hug`（だきあう 2 人と ハート）・`leg`・`foot`（はだしの 足だけの 絵）。
  表は `server/src/roblox/abc-assets.js` の `ROBLOX_BLOCKED`。かえたら `ABC_SAFE_VERSION` を 上げる。

## こえに ついて（だいじ）

**Roblox 版は こえが 出ません。** いまの U-Speak の Roblox スクリプトには 読み上げが なく、Roblox に 確かな 無料の 読み上げが あるとは 言えない ためです。
Web 版で「きいて えらぶ」問題は、Roblox では **絵と もじを 見て えらぶ** 形に して あります（答え・判定は Web と 同じ）：

| Web（こえ） | Roblox（見る） |
|---|---|
| もじの 名前を きいて、3 つの もじから えらぶ | 大きい もじを 見て、おなじ もじ（小さい もじ）を えらぶ |
| ことばを きいて、はじめの もじを えらぶ | 絵を 見て、その ことばの はじめ（x は おわり）の もじを えらぶ |
| ことばを きいて、ふたつの もじ（sh・ch…）を えらぶ | 絵を 見て えらぶ |
| ことばを きいて、ただしい つづりを えらぶ | 絵を 見て えらぶ |
| うた（"S, s, sun"） | うたの ことばを 字と 絵で 見せる（うたは 流れない） |

## はじめに する こと（順番）

1. **絵を 上げる**（えほんと 同じ 鍵・同じ ページ）：`docs/ROBLOX_BOOKS.md` の 1〜3 が すんで いれば、`/admin/roblox-books` で「アップロードを はじめる」。
   表の「🔤 ABC と おと」の 行が 絵カード（157 まい）。**画像の 持ち主は ABC の place の 体験の 持ち主と 同じ**に する。
2. **ABC の place で 一発 セットアップ**：Roblox Studio で ABC 用の place を ひらき、表示 → コマンドバー に `roblox/setup-abc-place.lua` の 中身を **まるごと はって Enter**。
   スクリプト 2 つ（`USpeakAbc`・`USpeakAbcClient`）と 入口の かんばん（タグ `USpeakAbcBoard`）が 入る。何回 走らせても 同じ 形。
3. **手で する こと**（コマンドでは できない）：
   - Creator Hub → この体験 → Secrets に `USPEAK_WEB_KEY`（メインワールドと 同じ 値。値は チャットや メールに 書かない）。
   - 「HTTP を オンに できませんでした」と 出た ときは Game Settings → Security → Allow HTTP Requests を オン。
   - `File → Publish to Roblox`。
4. Studio で ためす：かんばんに 近づいて「あそぶ」。絵が そろって いなければ「えを じゅんびちゅう」。

スクリプトを なおしたら `python3 scripts/make-roblox-abc-setup.py` で セットアップを 作りなおす（`server/test/roblox-setup.test.mjs` が 作りなおし わすれを 見つける）。

## Roblox だけで うごく 版（Web に つながない）

Web の サーバー・Secrets・絵の アップロードを 使わずに、place の 中だけで うごく 版も あります。

**入れかた**：`roblox/oneline/abc-local-all.txt` の 中身（1 行・約 58,000 字）を Studio の コマンドバーに 貼って Enter → Play。
入るのは `USpeakAbcLocal`（Script）・`USpeakAbcClient`（LocalScript・Web に つなぐ 版と 同じ もの）・入口の かんばん。
Web に つなぐ `USpeakAbc` が あれば はずします（2 つ いっしょには うごかしません）。HTTP の 設定には さわりません。

| | Web に つなぐ 版（`USpeakAbc`） | Roblox だけの 版（`USpeakAbcLocal`） |
|---|---|---|
| 用意 | Secrets `USPEAK_WEB_KEY`・HTTP オン・絵の アップロードと 審査 | 1 行を 貼るだけ |
| もんだいと きまり | Web の サーバー（`abc.js`） | 同じ きまりを Lua に うつした もの（スクリプトの 中） |
| 絵 | かいた 絵カード | emoji（もじ） |
| きろく | Web と 共通（Web で 進めた 子は つづきから） | Roblox の DataStore だけ（Web とは べつ） |
| 保護者の レポート・学習の 記録 | のる | のらない |
| 教室ごとの 設定（大文字／小文字・もじの 順） | きく | きかない（小文字と 大文字の 両方・データの 順） |
| はじめる 場所 | ロードマップの 級で 決まる ことが ある | いつも「はじめの もんだい」（もじ 4 もん）から |
| こえ | どちらも なし（上の「こえに ついて」） | 同じ |

- 中の ことばは `server/scripts/make-roblox-abc-local.mjs` が `abc-data.json` から 作ります（Roblox に 出さない 6 語は ぬく）。
  ことばを なおしたら：`node server/scripts/make-roblox-abc-local.mjs && python3 scripts/make-roblox-oneline.py`。
- きろくを のこすには、place を 公開して Game Settings → Security → **Enable Studio Access to API Services** を オンに します
  （オフでも あそべます。その ときは あそんで いる あいだだけ おぼえます）。
- たしかめた こと：Roblox の そとの Lua（fengari）で スクリプトを まるごと うごかし、子どもを 何人も あそばせた
  （`server/test/roblox-abc-local.test.mjs`）。**Studio では まだ うごかして いません。** emoji の 中には Roblox の 字に ない ものが
  あるかも しれません（四角に 見えたら その ことばの emoji を `abc-data.json` で かえる）。

## まだ たしかめて いない こと

- **Roblox の スクリプトは Studio で 動かして いません。** 文法だけ、ふつうの Lua の 文法の 検査（luaparse）を 通して あります（そのため 型の 注釈や `+=` を 使わずに 書いて あります）。画面の 大きさ・フォント・ボタンの 位置は Studio で 見て なおす 必要が ある はずです。
- 本物の Roblox への アップロードと 審査（鍵が ない 環境で 作りました）。
- Roblox の コマンドバーに 4 万字の スクリプトを はれるか（英検ドリルの セットアップ＝2 万字と 同じ 作り方です）。

検査：`server/test/roblox-abc.test.mjs`・`server/test/roblox-setup.test.mjs`。
