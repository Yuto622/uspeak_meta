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
