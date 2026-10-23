# 問題データベース（/admin/qbank）

英検形式の 問題データベースを admin で 入れて、**web版**と **Roblox** に 出し分ける。

- 置き場所：`DATA_DIR/qbank.json`（Fly の ボリューム）。**リポジトリには 置かない**（答えつきの 問題を 公開しないため）。
- 入れかた：`/admin/qbank` →「入れる」で CSV / TSV / JSON を アップロード。
  - 「まるごと 入れかえ」か「同じ ID だけ 上書き・新しい ID は 足す」。
  - 列は `ID, 級, 技能, 形式, 本文・スクリプト, 問題, 選択肢1〜4, 正解, 解説, 模範解答, 出典, タグ, 配信, web版に出す, Robloxに出す`
    （英語の 列名 `id, grade, skill, …, on, web, roblox` でも よい）。○ / 1 / true が オン。
  - 正解が 選択肢に ない・同じ 選択肢が ある・ID・級・技能・問題・正解の どれかが ない 行は 入らない（件数が 画面に 出る）。
- 出し分け：
  - **配信** を 外すと どこにも 出ない。
  - **web版に出す** … 英検の島（5級・4級・3級）の「読む」「聞く」の 出題に まざる（4択の 問題だけ。もとの 問題に 足す）。
  - **Robloxに出す** … Roblox が `GET /api/roblox/questions` で 取る（下）。
  - しぼりこんだ 問題を まとめて オンオフできる。1 問ずつ 書きかえも できる。かえると **すぐ 反映**（再起動 いらない）。
- 書き出し：「いまの しぼりこみを CSV で 書き出す」。

## Roblox から 取る

`GET https://uspeak-multiplayer.fly.dev/api/roblox/questions?grade=5級&skill=reading&page=0&limit=500`
（ヘッダー `X-USpeak-Key` ＝ `USPEAK_ROBLOX_KEY`。ほかの `/api/roblox` と 同じ 鍵・同じ 回数制限）

```json
{ "ok": true, "updatedAt": 1760000000000, "total": 1234, "page": 0, "limit": 500,
  "items": [ { "id": "G5-00001", "grade": "5級", "skill": "reading", "format": "短文の語句空所補充",
               "passage": "", "question": "I ( ) a cat.", "choices": ["have","has","having","had"], "answer": "have",
               "explanation": "…", "model_answer": "", "tags": "…" } ] }
```

- `updatedAt` が 前と 同じなら 取りなおさなくて よい（サーバーを 起こしたとき・1 時間ごと など）。
- 正解（`answer`）が ふくまれるので、**ServerScriptService の 中だけで** 使い、クライアントには 問題と 選択肢だけを 送る。

```lua
-- ServerScriptService/QuestionBank.server.lua
local HttpService = game:GetService("HttpService")
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local function fetchPage(grade, skill, page)
  local url = ("https://uspeak-multiplayer.fly.dev/api/roblox/questions?grade=%s&skill=%s&page=%d&limit=500")
    :format(HttpService:UrlEncode(grade), skill, page)
  local res = HttpService:RequestAsync({ Url = url, Method = "GET", Headers = { ["X-USpeak-Key"] = KEY } })
  if not res.Success then return nil end
  return HttpService:JSONDecode(res.Body)
end
```

## Roblox の ドリル ワールド（7 形式で とく）

メインワールドとは 別の place で、DB の 問題を メインワールドと 同じ 7 形式（えらぶ・せんつなぎ・つづり・タイピング・
ならべかえ・あなうめ・きいて えらぶ）で とく。**問題の 形を 作るのも 判定も Web の サーバー**（`server/src/roblox/drill.js`）。
web版と 同じ `formats-core.js` を 使うので、Roblox に 同じ ロジックを 書かない。

- 出るのは `/admin/qbank` で **配信 ○・Robloxに出す ○** の 問題だけ（かえると すぐ 反映）。
- DB の 形式 → 7 形式：
  - 単語の意味（日→英・英→日）・聞いて 絵を えらぶ … ことばの 問題。えらぶ・つづり・きいて えらぶ・タイピング・せんつなぎ を まぜて わりあてる
  - 聞いて 英単語を えらぶ … きいて えらぶ
  - 短文の語句空所補充（答えが 英単語 1 語）… あなうめ
  - 和文英訳（ならべかえ）・日本文付き短文の語句整序（解説に 正しい 文が ある もの）… ならべかえ
  - のこりの 4 択（会話の応答・語い文法 など。本文と あわせて 300 字まで）… 問題文つきの えらぶ
  - 出さない：面接・ライティング・本文を 聞く リスニング・イラストの 問題
- 1 セット 10 問。形を じゅんばんに まぜる。1 回目の 正解で +10 コイン（やりなおしは なし・1 人 1 日 300 まで）。
- 記録は `type="quiz"`・`world="eiken-drill"` で のこる（保護者レポート・苦手単語の 復習・先生の /class）。

`GET /api/roblox/drill?grade=5級&n=10` → `{ ok, items: [{ token, kind, public }] }`
`POST /api/roblox/drill/check` `{ token, answer, attempt, username, userId, classCode, ms }` → `{ ok, correct, coins, retry?, reveal? }`

`token` は 答えつきの 形を `USPEAK_ROBLOX_KEY` で 署名した もの（3 時間で 切れる）。**Roblox の サーバーだけが 持ち、子どもの 端末には `public` だけ 送る。**

Roblox 側：`roblox/USpeakDrill.server.luau`（ServerScriptService）と `roblox/USpeakDrillClient.client.luau`（StarterPlayerScripts）。
入口は タグ `USpeakDrillGate` の Part に 属性 `Grade`（"5級" など）。画面は メインワールドの `USpeakFormatUI` を この place の
ReplicatedStorage に コピーし、`USpeakDrillClient` の「画面（ここだけ あわせる）」の 3 つを その 呼びかたに あわせる。

### web で といたか Roblox で といたか

- 学習の 記録（`roblox_events`。Google シートの タブも 同じ）に **`source` 列**（`web` / `roblox`）。前から ある 行は 空なので、
  `data_json` の `source` と `place_id`（`web`）で 決める（`roblox-metrics.js` の `sourceOf`）。
- ドリル ワールドの 記録も 同じ 表に 入るので、保護者レポート（web・PDF）・LINE の 週／月・先生の /class に そのまま 足される。
- 内わけ：週の レポートの「先週 ○問」の 横に `web ○・Roblox ○`（Roblox で といた ときだけ）。LINE の 文の 吹き出しの 先頭に
  `🎮 といた 場所：web ○問・Roblox ○問`。先生の /class の 表に「web で といた 問題」「Roblox で といた 問題」の 列。

### 一発 セットアップ（Roblox Studio の コマンドバー）

`roblox/setup-drill-place.lua`（`scripts/make-roblox-drill-setup.py` が 作る）を ドリル用の place の コマンドバーに はって Enter。
スクリプト 3 つ（USpeakDrill・USpeakDrillClient・USpeakWalletSync）・HTTP オン・級ごとの 入口 7 つ を 入れる。
Secrets（USPEAK_WEB_KEY）と USpeakFormatUI の コピーだけは 手で（コマンドでは できない）。
