-- U-Speak えほん（よみもの島）— Roblox 側・サーバー（かぎ なし 版）。Web 版の 絵本（120 冊・12 レベル）を Roblox で 読む。
--
-- USpeakBooks（かぎ つき）との ちがい：Secrets の USPEAK_WEB_KEY が いらない。Web の サーバーの だれでも 読める 口
-- （/api/public/books）から 本を もらう。そのかわり、ここで 読んだ ぶんは **学習の きろくにも コインにも のらない**
-- （きろくを のこしたい ときは かぎ つきの USpeakBooks を 使う。2 つを 同じ place に 入れない）。
--
-- 置き場所：えほんの place の ServerScriptService（Script）。「Allow HTTP Requests」だけ オンに する（一発 セットアップが する）。
--
-- しくみ：
--   * 本（本文・日本語・ことば・絵の 番号・クイズの しつもんと えらぶ もの）は Web の サーバーから もらう。**こたえは 来ない**。
--   * 絵は Web の サーバーが Roblox へ 上げた 画像（rbxassetid://…）。Roblox の 審査を 通った 絵だけ 番号が 来る。
--     まだの ページは image が ""（画面は「じゅんびちゅう」の 色の 板を 出し、文は 読める）。
--   * クイズは 1 問ずつ Web の サーバーに きく（POST /api/public/books/<id>/check）。こたえた あとに だけ 正解が わかる。
--     何問 あって いたかは この Script が 数える（はじめの こたえ だけ）。8 わりで ごうかく。
--   * 入って 2 秒で 本だな（レベル A）が ひらく。ほかの レベルは 本だなの「よむ」。
--
-- 画面との やりとり（USpeakBooksClient が そのまま 使える）：
--   RemoteEvent    USpeakBookShow    サーバー → 画面：{ shelf = { stage, books } } ／ { error = "…" }
--   RemoteFunction USpeakBookOpen    画面 → サーバー：本の id → 本
--   RemoteFunction USpeakBookAnswer  画面 → サーバー：{ n, choice } → { correct, answer, done?, right?, total?, passed?, coins }
--   RemoteEvent    USpeakBookQuit    画面 → サーバー：とじた
--
-- ※ まだ Roblox Studio では 動かして いません（文法の 検査だけ）。型の 注釈や += を 使って いないのは、Studio の 外でも 文法を たしかめる ため。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/public/books"
local SHELF_TAG = "USpeakBookShelf"
local SHELF_CACHE_SEC = 120
local FIRST_STAGE = "A"

local function remote(className, name)
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then
		r = Instance.new(className)
		r.Name = name
		r.Parent = ReplicatedStorage
	end
	return r
end
local Show = remote("RemoteEvent", "USpeakBookShow")
local Open = remote("RemoteFunction", "USpeakBookOpen")
local Answer = remote("RemoteFunction", "USpeakBookAnswer")
local Quit = remote("RemoteEvent", "USpeakBookQuit")

-- 返す：data（JSON）, status。つながらない ときは nil, 0。
local function request(method, path, body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path,
			Method = method,
			Headers = { ["Content-Type"] = "application/json" },
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		warn("[uspeak books] " .. path .. " failed", res)
		return nil, 0
	end
	if not res.Success then
		warn("[uspeak books] " .. path .. " status", res.StatusCode)
		return nil, res.StatusCode
	end
	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	return okJson and data or nil, res.StatusCode
end

-- 本だな（レベルごと・少しの あいだ おぼえる）。
local shelves = {}
local function shelf(stage)
	local c = shelves[stage]
	if c and os.clock() - c.at < SHELF_CACHE_SEC then return c.books end
	local r = request("GET", "?stage=" .. HttpService:UrlEncode(stage))
	if not r or not r.ok or type(r.books) ~= "table" then return c and c.books or nil end
	shelves[stage] = { at = os.clock(), books = r.books }
	return r.books
end

-- sessions[player] = { id, total, pass, right, seen = { [n] = true }, busy }
local sessions = {}

local function openShelf(player, stage)
	local books = shelf(stage)
	if not books then
		Show:FireClient(player, { error = "いまは ほんだなを よみこめないよ。すこし まってから もう いちど。" })
		return
	end
	Show:FireClient(player, { shelf = { stage = stage, books = books } })
end

Open.OnServerInvoke = function(player, id)
	if type(id) ~= "string" or not string.match(id, "^rd%-[%w%-]+$") then return nil end
	local r = request("GET", "/" .. id)
	if not r or not r.ok or type(r.book) ~= "table" then return nil end
	local book = r.book
	local quiz = {}
	for i, q in ipairs(book.quiz or {}) do
		quiz[i] = { n = i, q = q.q, ja = q.ja, choices = q.choices }
	end
	book.quiz = quiz
	sessions[player] = { id = id, total = #quiz, pass = tonumber(book.pass) or 0.8, right = 0, seen = {}, count = 0, busy = false }
	return book
end

-- 画面から こたえが 来た。あって いるかは Web の サーバーが きめる（こたえは ここにも 来て いない）。
Answer.OnServerInvoke = function(player, given)
	local s = sessions[player]
	if not s or s.busy or type(given) ~= "table" then return nil end
	local n = tonumber(given.n)
	if not n or n < 1 or n > s.total or n ~= math.floor(n) or type(given.choice) ~= "string" then return nil end
	s.busy = true
	local r = request("POST", "/" .. s.id .. "/check", { n = n, choice = given.choice })
	s.busy = false
	if not r or not r.ok then return { error = true } end
	if not s.seen[n] then
		s.seen[n] = true
		s.count = s.count + 1
		if r.correct == true then s.right = s.right + 1 end
	end
	local done = s.count >= s.total
	return {
		correct = r.correct == true, answer = r.answer, done = done, right = s.right, total = s.total,
		passed = done and (s.right / math.max(1, s.total) >= s.pass) or false, coins = 0,
	}
end

Quit.OnServerEvent:Connect(function(player) sessions[player] = nil end)
Players.PlayerRemoving:Connect(function(player) sessions[player] = nil end)

-- 入って 2 秒で 本だなが ひらく（本だなまで 歩かなくて いい）。とじた あとは 本だなの「よむ」で もう いちど。
local function openOnJoin(player)
	task.delay(2, function()
		if player.Parent then openShelf(player, FIRST_STAGE) end
	end)
end
Players.PlayerAdded:Connect(openOnJoin)
for _, player in ipairs(Players:GetPlayers()) do openOnJoin(player) end

-- 入口（タグ USpeakBookShelf の Part）。
local function hookShelf(part)
	local prompt = part:FindFirstChildWhichIsA("ProximityPrompt", true)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "よむ"
		prompt.ObjectText = "えほん レベル " .. tostring(part:GetAttribute("Stage") or FIRST_STAGE)
		prompt.HoldDuration = 0
		prompt.Parent = part
	end
	prompt.Triggered:Connect(function(player)
		local stage = part:GetAttribute("Stage")
		openShelf(player, (type(stage) == "string" and stage ~= "") and stage or FIRST_STAGE)
	end)
end
for _, part in ipairs(CollectionService:GetTagged(SHELF_TAG)) do hookShelf(part) end
CollectionService:GetInstanceAddedSignal(SHELF_TAG):Connect(hookShelf)
