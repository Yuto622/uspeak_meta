--!strict
-- U-Speak えほん（よみもの島）— Roblox 側・サーバー。Web 版の 絵本（120 冊・12 レベル）を Roblox でも 読む。
--
-- 置き場所：えほんを 読ませたい place の ServerScriptService（Script）。Secrets の USPEAK_WEB_KEY と「Allow HTTP Requests」は
-- USpeakWalletSync と 同じ（コインを Web と そろえるので、この place にも USpeakWalletSync を 入れる）。
--
-- しくみ（英検ドリル USpeakDrill と 同じ 考え方）：
--   * 本（本文・日本語・ことば・絵の 番号・クイズ）は Web の サーバーから もらう（GET /api/roblox/books・/books/<id>）。
--   * 絵は Web の サーバーが Roblox へ 上げた 画像（rbxassetid://…）。**Roblox の 審査を 通った 絵だけ** 番号が 来る。
--     まだの ページは image が ""（画面は「じゅんびちゅう」の 色の 板を 出す）。
--   * クイズの 答えは 署名つきの token に とじて あり、この Script だけが 持つ。判定・コイン・学習の 記録
--     （ロードマップ・保護者レポート・先生の /class）は Web の サーバーが 決めて のこす（POST /api/roblox/books/check）。
--     ここは 返って きた coins を leaderstats に 足すだけ。クイズ 8 割で その 本は ✓（コインは 1 冊 1 回）。
--
-- 入口：CollectionService の タグ "USpeakBookShelf" を つけた Part に ProximityPrompt と 属性 Stage（"A"・"B"・"C"・"1"〜"9"）を
-- つける。近づいて 押すと その レベルの 本だなが ひらく。属性が なければ "A"。
--
-- 画面との やりとり（ReplicatedStorage に 自動で 作る）：
--   RemoteEvent    USpeakBookShow    サーバー → 画面：{ shelf = { stage, books } } ／ { book = { … } } ／ { error = "…" }
--   RemoteFunction USpeakBookOpen    画面 → サーバー：本の id → 本（クイズは token を ぬいた 形）
--   RemoteFunction USpeakBookAnswer  画面 → サーバー：{ n = 何問目, choice = えらんだ 文字列 } → { correct, answer, done?, right?, passed?, coins? }
--   RemoteEvent    USpeakBookQuit    画面 → サーバー：とじた
--
-- ※ この Script は Web 側の 口に あわせて 書いた もので、まだ Roblox Studio では 動かして いません（はじめに Studio で ためす こと）。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local COIN_STAT = "Coins"   -- leaderstats の IntValue（USpeakWalletSync と 同じ）
local SHELF_TAG = "USpeakBookShelf"
local SHELF_CACHE_SEC = 300 -- 本だなは 5 分 おぼえて おく（審査を 通った 絵が ふえるので 長くは おぼえない）

local function remote(className: string, name: string): Instance
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then
		r = Instance.new(className)
		r.Name = name
		r.Parent = ReplicatedStorage
	end
	return r :: Instance
end
local Show = remote("RemoteEvent", "USpeakBookShow") :: RemoteEvent
local Open = remote("RemoteFunction", "USpeakBookOpen") :: RemoteFunction
local Answer = remote("RemoteFunction", "USpeakBookAnswer") :: RemoteFunction
local Quit = remote("RemoteEvent", "USpeakBookQuit") :: RemoteEvent

-- ---- HTTP ---------------------------------------------------------------------------------------
local function request(method: string, path: string, body: any?): any?
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path,
			Method = method,
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok or not res.Success then
		warn("[uspeak books] " .. path .. " failed", ok and res.StatusCode or res)
		return nil
	end
	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	return okJson and data or nil
end

-- ---- 本だな（レベルごと・少しの あいだ おぼえる）------------------------------------------------------
local shelves: { [string]: { at: number, books: any } } = {}
local function shelf(stage: string): any?
	local c = shelves[stage]
	if c and os.clock() - c.at < SHELF_CACHE_SEC then return c.books end
	local r = request("GET", "/books?stage=" .. HttpService:UrlEncode(stage))
	if not r or not r.ok or type(r.books) ~= "table" then return c and c.books or nil end
	shelves[stage] = { at = os.clock(), books = r.books }
	return r.books
end

-- ---- 1 人ぶんの 本 --------------------------------------------------------------------------------
type Session = { id: string, tokens: { string }, shownAt: number, busy: boolean }
local sessions: { [Player]: Session } = {}

local function addCoins(player: Player, n: number)
	if n <= 0 then return end
	local stats = player:FindFirstChild("leaderstats")
	local v = stats and stats:FindFirstChild(COIN_STAT)
	if v and v:IsA("IntValue") then v.Value += n end
end

local function openShelf(player: Player, stage: string)
	local books = shelf(stage)
	if not books then
		Show:FireClient(player, { error = "いまは 本だなを よみこめません。すこし まってから もう一度。" })
		return
	end
	Show:FireClient(player, { shelf = { stage = stage, books = books } })
end

-- 本を ひらく：クイズの token は ここに のこし、画面には 問題と 選択肢だけ わたす。
Open.OnServerInvoke = function(player: Player, id: any)
	if type(id) ~= "string" or not string.match(id, "^rd%-[%w%-]+$") then return nil end
	local r = request("GET", ("/books/%s?username=%s"):format(id, HttpService:UrlEncode(player.Name)))
	if not r or not r.ok or type(r.book) ~= "table" then return nil end
	local book = r.book
	local tokens: { string } = {}
	local quiz = {}
	for i, q in ipairs(book.quiz or {}) do
		tokens[i] = tostring(q.token)
		quiz[i] = { n = i, q = q.q, ja = q.ja, choices = q.choices }
	end
	book.quiz = quiz
	sessions[player] = { id = id, tokens = tokens, shownAt = os.clock(), busy = false }
	return book
end

-- 画面から 答えが 来た。判定は Web の サーバー。
Answer.OnServerInvoke = function(player: Player, given: any)
	local s = sessions[player]
	if not s or s.busy or type(given) ~= "table" then return nil end
	local n = tonumber(given.n)
	local token = n and s.tokens[n]
	if not token or type(given.choice) ~= "string" then return nil end
	s.busy = true
	local r = request("POST", "/books/check", {
		token = token, choice = given.choice, ms = math.floor((os.clock() - s.shownAt) * 1000),
		username = player.Name, userId = tostring(player.UserId), classCode = player:GetAttribute("ClassCode") or "",
		placeId = tostring(game.PlaceId),
	})
	s.busy = false
	s.shownAt = os.clock()
	if not r or not r.ok then return { error = true } end
	local coins = tonumber(r.coins) or 0
	addCoins(player, coins)
	return { correct = r.correct == true, answer = r.answer, done = r.done == true, right = r.right, total = r.of, passed = r.passed == true, coins = coins }
end

Quit.OnServerEvent:Connect(function(player: Player) sessions[player] = nil end)
Players.PlayerRemoving:Connect(function(player: Player) sessions[player] = nil end)

-- ---- 入口（タグ USpeakBookShelf の Part）----------------------------------------------------------
local function hookShelf(part: Instance)
	local prompt = part:FindFirstChildWhichIsA("ProximityPrompt", true)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "よむ"
		prompt.ObjectText = "えほん レベル " .. tostring(part:GetAttribute("Stage") or "A")
		prompt.HoldDuration = 0
		prompt.Parent = part
	end
	(prompt :: ProximityPrompt).Triggered:Connect(function(player: Player)
		local stage = part:GetAttribute("Stage")
		openShelf(player, (type(stage) == "string" and stage ~= "") and stage or "A")
	end)
end
for _, part in ipairs(CollectionService:GetTagged(SHELF_TAG)) do hookShelf(part) end
CollectionService:GetInstanceAddedSignal(SHELF_TAG):Connect(hookShelf)
