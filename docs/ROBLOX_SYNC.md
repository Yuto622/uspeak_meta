# Roblox 版 U-Speak との連携（学習の記録とコインの同期）

Roblox 版（PlaceId 139338411931177）で起きた学習を Web（https://uspeak-multiplayer.fly.dev）に
貯め、保護者と教室に見せる。コインは **両方の世界で同じ数字** を見せる。

- 口は 3 つ、合言葉は 1 つ（`USPEAK_ROBLOX_KEY`、ヘッダー `X-USpeak-Key`）。
- Roblox 側は **送るだけ**（HttpService）。Web の DB・鍵・名簿は Roblox に渡らない。
- 貯めるのは **アカウント名と学習の記録だけ**。本名・メール・年齢は入れない（入れても使わない）。

## 1. 鍵と URL（Roblox 側に渡すもの）

| 渡すもの | 値 |
|---|---|
| URL | `https://uspeak-multiplayer.fly.dev/api/roblox` |
| 鍵（ヘッダー `X-USpeak-Key`） | `USPEAK_ROBLOX_KEY` と同じ文字列 |

鍵を作る（32 文字以上のランダム。**チャットやメールに貼らない**）：

```bash
# 作ってそのまま Fly に入れる（画面には出ない）
fly secrets set USPEAK_ROBLOX_KEY="$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-40)"
# 同じ値を Roblox Creator Hub → Game → Secrets に「USPEAK_WEB_KEY」として登録する。
# Roblox 側で見る必要があるときだけ、`fly ssh console -C 'printenv USPEAK_ROBLOX_KEY'` で読む。
```

Roblox 側の設定：

1. Game Settings → Security → **Allow HTTP Requests** を ON。
2. Creator Hub → Secrets に `USPEAK_WEB_KEY` を登録（値は上と同じ）。
3. スクリプトからは `HttpService:GetSecret("USPEAK_WEB_KEY")` で `Secret` を取り、
   `secret:AddPrefix("")` をそのままヘッダーの値にする（文字列として読めないのが仕様）。

`/healthz` の `roblox.enabled` が `true` なら、鍵が入って口が開いている。

## 2. 3 つの口

すべて `POST`、`Content-Type: application/json`、ヘッダー `X-USpeak-Key`。
鍵が無い・違う → `401`。壊れた JSON → `400`。1 つの鍵で **1 分 120 回**（`ROBLOX_RATE_PER_MIN`）を超えると `429`。

### `POST /api/roblox/events` — 学習の記録を貯める

```json
{ "batchId": "any-string", "placeId": "139338411931177", "world": "main",
  "events": [
    { "id": "<一意の文字列>", "ts": 1760000000, "type": "quiz", "username": "rbx_hana", "userId": "12345", "classCode": "6-1",
      "data": { "level": "5", "word": "apple", "correct": true, "fast": false, "retry": false, "ms": 2300 } }
  ] }
```

- `id` は **冪等キー**。同じ id は 2 度目から `duplicates` に数えられ、貯まらない。
  `userId .. os.time() .. 連番` のような形にする。最大 **300 件 / 回**。
- `ts` は秒でもミリ秒でも ISO 文字列でも。無ければ受け取った時刻。
- `type` と `data` は **検査しない**（知らない type もそのまま貯まる）。`data` は 32 KB まで。
- `world` は **Roblox の中のどこで起きたか**（`fishing` / `hut` / `main` / `quiz` …）。event に無ければ batch の値。
  保護者ページの「場所ごとの問題数と正答率」「ワールド別の時間」「最近の記録」の「どこで」になる。
  画面の名前は `roblox-metrics.js` の `WORLD_LABELS`（Stats v4.2）：hut=小屋のクイズ / fishing=さかなつり / battle=バトル /
  gym=ことばのジム / main=メインワールド / racing=レース / rpg=RPG / building=けんちく / themepark=テーマパーク /
  farm=ぼくじょう / island=しま / quizlab=クイズラボ / other=そのほか。知らない名前はそのまま出る。
- `quiz` の `data.level` は SuperEasy / Easy / Medium / Hard / Fishing / Battle / Gym / Racing（英検の 5 / 4 / 3 / pre2 / 2 も可）。
  「レベルごとの正答率」の表はこれで、「場所ごと」の表は `world` で集計する。
- `session` の `data` は `seconds` / `coinsEarned` / `balance` / `level`（`balance` と `level` はいまは使わない）。
- `classCode` を付けると先生ページのクラスに出る。
- 返事：`{ "ok": true, "accepted": 3, "duplicates": 0 }`。

指標が使う `type` と `data`（最低限これを送れば、下の画面が全部出る）：

| type | data | 使う指標 |
|---|---|---|
| `quiz` | `level`（SuperEasy / Easy / Medium / Hard / Fishing / Battle / Gym / Racing）、`word`、`correct`、`fast`（読み上げが終わる前に答えた）、`retry`（やり直し）、`ms` | 問題数・正答率・あてずっぽう率・級ごと・覚えた単語・苦手な単語・最長の連続正解 |
| `fast-type` | （なし） | あてずっぽう率の分子・分母 |
| `session` | `seconds`、`coinsEarned`、（event の）`world` | 学習時間・ワールド別の時間・かせいだコイン |
| （何でも） | | 来た日・連続日数（どの type でもその日に来たことになる） |

### `POST /api/roblox/wallet/pending` — 残高を預け、未配達の増減を受け取る

```json
{ "users": [ { "username": "rbx_hana", "userId": "12345", "balance": 200 } ] }
```

返事：

```json
{ "ok": true, "users": [ { "username": "rbx_hana", "balance": 200, "total": 15,
    "entries": [ { "id": "m3k…", "amount": 15, "reason": "award:quiz:5", "createdAt": "2026-10-07T03:00:00.000Z" } ] } ] }
```

- `balance` は **Roblox の今の残高**（0 以上。負なら `400`）。50 人まで。
- `entries` は Web で動いたコイン（±）。**ack で印を付けるまで、何度でも同じ行が返る。**
  Roblox 側は id ごとに DataStore に「適用済み」を書いてから ack する（二重適用しない）。
- `roblox/USpeakWalletSync.server.luau` は 入室時・30 秒ごと・コインが 変わった 2 秒後 に 呼ぶ（5 分ごとだと その間 ずれる）。

### `POST /api/roblox/wallet/ack` — 届いた行に印を付ける

```json
{ "acks": [ { "username": "rbx_hana", "ids": ["m3k…"], "balance": 215 } ] }
```

- `balance` は **適用後の残高**。返事 `{ "ok": true, "acked": 1 }`。
- `{ "username", "ids", "balance" }` を 1 つだけ（`acks` なし）でも受ける。

### 残高の約束

**Web の残高 = Roblox の残高の最新値 ＋ まだ Roblox に届いていない Web の増減。**

- Web でコインが動くたび（釣り・クイズ・店・ぼくじょう・BLOCKWILD・土地島…すべて）、
  `wallet_entries` に 1 行入る（`server/src/rooms/ClassRoom.js` の `coinRow`：コインが動く所は
  ここ 1 つ）。
- Roblox にまだ一度も入っていない子は、これまで通り Web の残高だけで動く。
- Roblox が `pending` / `ack` を呼ぶと、オンラインの子の画面の残高もその場で差し替わる。
- Web の画面には「コインは Roblox と おなじです。ここで ふえたぶんは、Roblox に 入ると 反映されます。」と 1 度出る。

## 2b. 2 つの 残高を 完全に そろえるための 約束（2026-10）

- **正本は Roblox の 残高**。Web の 残高は いつも「Roblox が 最後に 教えた 残高 ＋ まだ 届いていない Web の 増減」。
- **はじめて つなぐ 子の Web の コインは 消えない**：Roblox が まだ 1 度も 残高を 教えていない 子が クラスに 入ると、
  Web の コインのうち 行に なっていない ぶんを 1 回だけ `web:carry` の 行に する（`sync.js` の `carryOver`）。
  Roblox が はじめて 残高 B を 教えると、両方とも B ＋ Web の コインに なる。
- **まだ 届いていない 行は すてない**（FileStore の 行の 上限で 古い 行を すてるときも、配達済みだけ）。
- **紐づけの 名前は 大文字・小文字を 区別しない**（Roblox の アカウント名と 同じ）。
- **Roblox 側は `roblox/USpeakWalletSync.server.luau` を そのまま 置く**：入る・出る・30 秒ごと・**Roblox で コインが
  変わったら 2 秒後** に 同期するので、Roblox で 使った コインも 数秒で Web に 出る。足した 行の id は DataStore に 残し、
  ack が 落ちても 2 回 足さない。ゲームの コインの 持ち方が leaderstats の `Coins` で ないときは、ファイルの 頭の
  `getCoins` / `setCoins` / `coinChanged` だけ 書きかえる（コインそのものの 保存は いままでの ゲームの 仕組みのまま）。

## 3. Roblox 側の最小スクリプト（Luau・ServerScriptService）

> **ふつうは この下ではなく `roblox/USpeakWalletSync.server.luau` を 使う**（下は 仕組みを 説明する ための 最小形）。

```lua
local HttpService = game:GetService("HttpService")
local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")   -- Creator Hub → Secrets

local function post(path, body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path, Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok or not res.Success then warn("[uspeak] " .. path .. " failed", ok and res.StatusCode or res) return nil end
	return HttpService:JSONDecode(res.Body)
end

-- 学習の記録：まとめて送る（30 秒ごと、または 100 件たまったら）
local queue = {}
local function track(player, kind, data, world)
	table.insert(queue, { id = player.UserId .. "-" .. os.time() .. "-" .. #queue, ts = os.time(), type = kind,
		username = player.Name, userId = tostring(player.UserId), classCode = player:GetAttribute("ClassCode") or "", world = world, data = data })
end
task.spawn(function()
	while true do
		task.wait(30)
		if #queue > 0 then
			local batch = queue; queue = {}
			local r = post("/events", { batchId = tostring(os.time()), placeId = tostring(game.PlaceId), world = "main", events = batch })
			if not r then for _, e in ipairs(batch) do table.insert(queue, e) end end   -- 失敗したら次回に（id が同じなので二重にならない）
		end
	end
end)

-- コイン：入室時と 5 分ごと。Web で動いたぶんを DataStore の残高に足し、適用した id に印を付ける。
local function syncWallet(player, coins)   -- coins: その子の残高を持つオブジェクト（{ get = fn, add = fn, applied = {id=true} }）
	local r = post("/wallet/pending", { users = { { username = player.Name, userId = tostring(player.UserId), balance = coins.get() } } })
	if not r then return end
	local ids = {}
	for _, e in ipairs(r.users[1].entries) do
		if not coins.applied[e.id] then coins.add(e.amount); coins.applied[e.id] = true end
		table.insert(ids, e.id)
	end
	post("/wallet/ack", { acks = { { username = player.Name, ids = ids, balance = coins.get() } } })
end
```

`track(player, "quiz", { level = "5", word = "apple", correct = true, fast = false, retry = false, ms = 2300 })`
のように、クイズの判定の直後・セッションの終わりに呼ぶ。

## 4. 画面

| 画面 | URL | だれが |
|---|---|---|
| 保護者ページ | `/report/<username>?t=<署名>` | 保護者（1 人ぶんの署名つきリンク。`/admin` の「Roblox 連携」か、先生コンソール「📄 保護者レポートのリンク」の 🎮） |
| 先生ページの表 | `/class/<クラス>?t=<署名>` の「Roblox の学習」 | 教室（先生コンソール「教室のようす」） |
| その CSV | `/class/<クラス>/roblox.csv?t=<同じ署名>` | 教室 |
| 指標の定義・紐づけ | `/admin` の「Roblox 連携」 | オーナー（`ADMIN_KEY`） |
| JSON | 上の 2 つに `&format=json` | 検査用 |

保護者ページ：累計 → 今週／先週（▲▼）→ あてずっぽう率（「問題の読み上げが終わる前に答えて
間違えた割合。低いほど、きちんと読んで答えています」）→ 級ごとの正答率 → 間違えやすい単語
→ ワールド別の時間。スマホと印刷に合わせてある。

先生ページの表：名前・今週の学習時間・問題数・正答率・あてずっぽう率・最後に来た日・連続日数
（＋定義にある数の指標）。見出しで並べ替え、行を押すと今週／先週／累計の全指標。
**● 気になる印**＝あてずっぽう率 30% 以上、または 7 日来ていない。**未登録**＝Roblox から
記録は来ているが、名簿にも紐づけにもない名前。

## 5. 指標の定義（`metric_definitions`）

**行を足すだけで、保護者ページと先生ページに出る。** `/admin` の表で編集する（Sheets 版は
`metric_definitions` タブを直接編集しても同じ）。

| 列 | 意味 |
|---|---|
| `key` | 英小文字・数字・`_` |
| `label_ja` / `label_en` | 画面の見出し |
| `kind` | `count` / `sum` / `ratio` / `group` / `custom` |
| `event_type` | 数える type（`quiz` など。`custom` は空でよい） |
| `expr_json` | 式（下） |
| `enabled` | `1` / `0` |
| `order` | 並び順（小さいほど上） |
| `unit` | `count` / `percent` / `seconds` / `days` / `coins` / `words` / `list` / `table` |

式の例：

```json
{"where": {"retry": true}}                                   // count: retry 回数
{"field": "seconds"}                                         // sum: 学習時間
{"num": {"where": {"correct": true, "retry": false}}, "den": {"where": {"retry": false}}}   // ratio: 正答率
{"by": "level", "agg": "ratio", "num": {"where": {"correct": true}}, "den": {"where": {"retry": false}}, "labels": {"5": "5級"}}   // group
{"by": "world", "agg": "sum", "field": "seconds"}            // group: ワールド別の時間
{"fn": "streak_days", "periods": ["all"]}                   // custom（累計だけ）
```

`where` は `data` の中（無ければ記録そのもの）を見る。`true` / `false` はゆるく比べる
（`retry: false` は retry の無い記録にも当たる）。`$ne` / `$in` / `$gt` / `$gte` / `$lt` / `$lte` / `$exists` が使える。
`custom` の関数：`guess_rate` / `active_days` / `streak_days` / `words_mastered` / `weak_words` / `best_streak` / `balance`
（`server/src/game/roblox-metrics.js`）。

最初から入っている 14 行（版が上がって増えた行は、起動時に無い key だけ足される。いらない指標は `enabled` を `0` に）：問題数・正答率・あてずっぽう率・学習時間・来た日・連続日数・覚えた単語・
最長の連続正解・かせいだコイン・いまのコイン・間違えやすい単語・級ごとの正答率・場所ごとの問題数と正答率・ワールド別の時間。

計算の約束：

- 週は **日本時間の月曜 0:00 〜 日曜 24:00**。
- 問題数 ＝ `quiz` で `retry` でないもの。正答率 ＝ そのうち `correct`。
- あてずっぽう率 ＝ (`quiz` で `fast` かつ不正解 ＋ `fast-type`) ÷ (問題数 ＋ `fast-type`)。
- 覚えた単語 ＝ その単語の直近 3 問が連続で正解。苦手な単語 ＝ 2 回以上出て正答率 50% 以下、間違えた回数順に 5 つ。
- 連続日数 ＝ きょう（またはきのう）から さかのぼって途切れるまで。

## 6. 保存先

| 表 | file / memory | Google Sheets |
|---|---|---|
| `roblox_events` | `data/store.json` の `roblox_events` | タブ `roblox_events`（追記だけ、**消さない**） |
| `wallet_entries` | 同 `wallet_entries` | タブ `wallet_entries`（`delivered_at` を書き戻す） |
| `wallet_snapshots` | 同 `wallet_snapshots` | タブ `wallet_snapshots`（名前につき 1 行） |
| `metric_definitions` | 同 `metric_definitions` | タブ `metric_definitions` |
| `roblox_links` | 同 `roblox_links` | タブ `roblox_links`（username / class / name / note） |

タブは起動時に自動で作られる（`docs/GOOGLE_SHEETS_SETUP.md` と同じ仕組み）。

## 7. 紐づけ（Roblox の名前 ≠ Web の名前のとき）

Web のロビーで入力する名前と Roblox のアカウント名が同じなら何もしなくてよい。違う子だけ
`/admin` → 「Roblox 連携」→ 紐づけ に `username / クラス / Web の名前` を書く。すると：

- その子の Web のコインは Roblox の名前の財布に書かれる。
- 先生ページの表に Web の名前で出る（「未登録」が消える）。
- 先生コンソールの 🎮 がその子の Roblox の保護者ページを指す。

## 8. 試す

```bash
# ローカル
USPEAK_ROBLOX_KEY=roblox-test-key-0123456789abcdef-XYZ REPORT_SECRET=test-report-secret-0123456789 npm start   # server/
USPEAK_ROBLOX_KEY=roblox-test-key-0123456789abcdef-XYZ ./scripts/roblox-smoke.sh http://127.0.0.1:2567
# 本番（鍵は環境変数で。履歴に残さない）
USPEAK_ROBLOX_KEY="$(fly ssh console -q -C 'printenv USPEAK_ROBLOX_KEY')" ./scripts/roblox-smoke.sh https://uspeak-multiplayer.fly.dev
# 試験
cd server && node --test test/roblox.test.mjs
```

## 9. プライバシー（利用規約・プライバシーポリシーに足す文）

> Roblox 上の学習記録（アカウント名・回答・利用時間）を本サービスに保存し、保護者・教室に表示する。

保存するのは Roblox のアカウント名（`username`）と `userId`、答えた問題・正誤・かかった時間・
いた時間・コインの増減。本名・メール・生年月日は受け取らない。保護者ページは 1 人ぶんの
署名つきリンクで、検索エンジンには載せない（`noindex`）。
