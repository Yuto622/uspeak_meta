-- U-Speak えほん（よみもの島）の place：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-books-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 3 つを 入れる ② HTTP を オン（できれば）③ 本だな 12 こ（レベル A〜9）を ならべる ④ のこりの 手作業を 表示する
-- 本と 絵は ここには 入って いません：ゲームが 動く ときに Web の サーバーから もらいます（審査を 通った 絵だけ 出ます）。
--
-- コマンドでは できない こと（この あと 手で する）：
--   1. Creator Hub → この体験 → Secrets に USPEAK_WEB_KEY（メインワールドと 同じ 値）を 入れる。
--   2. HTTP が オンに ならなかった ときは、Game Settings → Security → Allow HTTP Requests を オンに する。
--   3. File → Publish to Roblox で 公開する（Secrets は 公開した 体験で だけ 読める）。
--   4. 絵は Web の 管理ページ（/admin/roblox-books）で 上げて、Roblox の 審査を まつ。まだの ページは「じゅんびちゅう」と 出る。
--      画像の 持ち主（ROBLOX_CREATOR_USER_ID か GROUP_ID）は この 体験の 持ち主と 同じに する。
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayerScripts = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
local CollectionService = game:GetService("CollectionService")

local function put(parent, className, name, source)
	local old = parent:FindFirstChild(name)
	if old then old:Destroy() end
	local s = Instance.new(className)
	s.Name = name
	s.Source = source
	s.Parent = parent
	return s
end

-- ① スクリプト（コインを Web と そろえる USpeakWalletSync も 入れる。もう 入って いれば 入れかえ）
put(ServerScriptService, "Script", "USpeakBooks", [=====[--!strict
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
]=====])
put(ServerScriptService, "Script", "USpeakWalletSync", [=====[--!strict
-- U-Speak コイン同期（Roblox 側）— Web 版（https://uspeak-multiplayer.fly.dev）と 同じ 残高に そろえる。
--
-- 置き場所：ServerScriptService（Script）。Creator Hub → Secrets に USPEAK_WEB_KEY（サーバーの USPEAK_ROBLOX_KEY と同じ値）。
-- Game Settings → Security → Allow HTTP Requests を ON。
--
-- 約束（docs/ROBLOX_SYNC.md）：**Roblox の DataStore の 残高が 正本**。Web で 動いた ぶんは サーバーに 行として たまり、
-- ここが 取りに行って 足し、印（ack）を つける。Roblox で 動いた ぶんは、残高を 教えた しゅんかんに Web に 反映される。
--   * 入ったとき・出るとき・30 秒ごと・**Roblox で コインが 変わったら 2 秒後** に 同期する（Web に すぐ 届く）。
--   * 足した 行の id は DataStore に 残す（ack が 失敗しても 2 回 足さない）。
--   * 残高は 0 より 下に しない。
--
-- ゲームの コインの 持ち方が ちがうときは、下の getCoins / setCoins / coinChanged の 3 つだけ 書きかえる。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local COIN_STAT = "Coins"            -- leaderstats の IntValue の 名前
local PERIOD = 30                    -- 秒
local DEBOUNCE = 2                   -- コインが 変わってから 同期するまで（秒）
local KEEP_IDS = 400                 -- 足した id を いくつ 覚えておくか

local appliedStore = DataStoreService:GetDataStore("USpeakWalletApplied")

-- ---- ゲームの コイン（ここだけ ゲームに あわせる）--------------------------------------------
local function coinValue(player: Player): IntValue?
	local stats = player:FindFirstChild("leaderstats")
	local v = stats and stats:FindFirstChild(COIN_STAT)
	return (v and v:IsA("IntValue")) and v or nil
end
local function getCoins(player: Player): number
	local v = coinValue(player)
	return v and math.max(0, v.Value) or 0
end
local function setCoins(player: Player, n: number)
	local v = coinValue(player)
	if v then v.Value = math.max(0, math.floor(n)) end
end
local function coinChanged(player: Player, fn: () -> ())
	local v = coinValue(player)
	if v then return v.Changed:Connect(fn) end
	return nil
end

-- ---- HTTP -------------------------------------------------------------------------------
local function post(path: string, body: any): any?
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok or not res.Success then
		warn("[uspeak] " .. path .. " failed", ok and res.StatusCode or res)
		return nil
	end
	return HttpService:JSONDecode(res.Body)
end

-- ---- 足した id（DataStore）-----------------------------------------------------------------
type State = { applied: { [string]: boolean }, order: { string }, busy: boolean, again: boolean, pending: boolean, conn: RBXScriptConnection? }
local states: { [Player]: State } = {}

local function loadApplied(player: Player): ({ [string]: boolean }, { string })
	local ok, list = pcall(function() return appliedStore:GetAsync(tostring(player.UserId)) end)
	local order = (ok and type(list) == "table") and list or {}
	local set = {}
	for _, id in ipairs(order) do set[id] = true end
	return set, order
end
local function saveApplied(player: Player, st: State)
	while #st.order > KEEP_IDS do
		st.applied[table.remove(st.order, 1)] = nil
	end
	local copy = table.clone(st.order)
	pcall(function() appliedStore:SetAsync(tostring(player.UserId), copy) end)
end

-- ---- 同期（1 人ぶん。重ならないように 1 本ずつ）--------------------------------------------
-- 保護者の 👏（Web の 保護者ページで「見たよ」）。コインの 行の reason が "clap:" の とき、画面の 上に 5 秒 出す。
-- サーバーから PlayerGui に 置くので、LocalScript は 要らない。
local function showClap(player: Player, amount: number)
	local gui = player:FindFirstChildOfClass("PlayerGui")
	if not gui then return end
	local sg = Instance.new("ScreenGui")
	sg.Name = "USpeakClap"
	sg.ResetOnSpawn = false
	local label = Instance.new("TextLabel")
	label.AnchorPoint = Vector2.new(0.5, 0)
	label.Position = UDim2.new(0.5, 0, 0, 24)
	label.Size = UDim2.new(0, 460, 0, 64)
	label.BackgroundColor3 = Color3.fromRGB(226, 122, 45)
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.Text = "おうちの人から 👏 が とどいたよ！ +" .. tostring(amount) .. "コイン"
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 14)
	corner.Parent = label
	label.Parent = sg
	sg.Parent = gui
	task.delay(5, function() sg:Destroy() end)
end

local function sync(player: Player)
	local st = states[player]
	if not st then return end
	if st.busy then st.again = true return end
	st.busy = true
	repeat
		st.again = false
		local r = post("/wallet/pending", { users = { { username = player.Name, userId = tostring(player.UserId), balance = getCoins(player) } } })
		if r and r.users and r.users[1] then
			local ids = {}
			local added = false
			for _, e in ipairs(r.users[1].entries) do
				if not st.applied[e.id] then
					st.pending = true                              -- 自分で 変えた ぶんで もう一度 同期しない
					setCoins(player, getCoins(player) + (tonumber(e.amount) or 0))
					if type(e.reason) == "string" and string.sub(e.reason, 1, 5) == "clap:" then showClap(player, tonumber(e.amount) or 0) end
					st.applied[e.id] = true
					table.insert(st.order, e.id)
					added = true
				end
				table.insert(ids, e.id)
			end
			if added then saveApplied(player, st) end              -- ack の 前に 残す（ack が 落ちても 2 回 足さない）
			if #ids > 0 or added then
				post("/wallet/ack", { acks = { { username = player.Name, ids = ids, balance = getCoins(player) } } })
			end
			task.defer(function() st.pending = false end)
		end
	until not st.again or not player.Parent
	st.busy = false
end

local function onJoin(player: Player)
	local applied, order = loadApplied(player)
	local st: State = { applied = applied, order = order, busy = false, again = false, pending = false, conn = nil }
	states[player] = st
	-- コインの IntValue が できるのを すこし 待つ（ほかの スクリプトが leaderstats を 作る）。
	local stats = player:WaitForChild("leaderstats", 15)
	if stats then stats:WaitForChild(COIN_STAT, 15) end
	local timer: thread? = nil
	st.conn = coinChanged(player, function()
		if st.pending then return end
		if timer then task.cancel(timer) end
		timer = task.delay(DEBOUNCE, function() timer = nil; sync(player) end)
	end)
	sync(player)
end

Players.PlayerAdded:Connect(onJoin)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(onJoin, p) end
Players.PlayerRemoving:Connect(function(player)
	local st = states[player]
	if st and st.conn then st.conn:Disconnect() end
	sync(player)
	states[player] = nil
end)
task.spawn(function()
	while true do
		task.wait(PERIOD)
		for player in pairs(states) do task.spawn(sync, player) end
	end
end)
game:BindToClose(function()
	for player in pairs(states) do sync(player) end
end)
]=====])
put(StarterPlayerScripts, "LocalScript", "USpeakBooksClient", [=====[--!strict
-- U-Speak えほん（よみもの島）— Roblox 側・画面。USpeakBooks.server.luau から 来た 本だなと 本を 見せる。
--
-- 置き場所：StarterPlayerScripts（LocalScript）。ほかの 部品は いらない（画面は ここで 作る）。
-- 流れ：本だな（表紙が ならぶ）→ 本（左に 絵・右に 英語と 日本語・もどる／つぎへ）→ クイズ（1 画面 1 問）→ けっか。
-- 絵は rbxassetid://…（Web の サーバーが 上げて、Roblox の 審査を 通った もの）。まだの ページは 色の 板と「じゅんびちゅう」。
-- 正解・コインは サーバーから 来た ものだけを 見せる（画面では 決めない）。
--
-- ※ まだ Roblox Studio では 動かして いません。はじめに Studio で 見た目（大きさ・フォント）を たしかめて ください。

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Show = ReplicatedStorage:WaitForChild("USpeakBookShow") :: RemoteEvent
local Open = ReplicatedStorage:WaitForChild("USpeakBookOpen") :: RemoteFunction
local Answer = ReplicatedStorage:WaitForChild("USpeakBookAnswer") :: RemoteFunction
local Quit = ReplicatedStorage:WaitForChild("USpeakBookQuit") :: RemoteEvent

local INK = Color3.fromRGB(35, 50, 74)
local PAPER = Color3.fromRGB(255, 253, 246)
local GREEN = Color3.fromRGB(47, 143, 91)
local ORANGE = Color3.fromRGB(226, 122, 45)
local COVER = { Color3.fromRGB(226, 87, 76), Color3.fromRGB(226, 122, 45), Color3.fromRGB(79, 168, 104), Color3.fromRGB(63, 134, 208), Color3.fromRGB(138, 92, 192) }

-- ---- 部品を 作る 小さな 関数 ------------------------------------------------------------------------
local function make(className: string, props: { [string]: any }, parent: Instance?): any
	local o = Instance.new(className)
	for k, v in pairs(props) do (o :: any)[k] = v end
	if parent then o.Parent = parent end
	return o
end
local function round(parent: Instance, r: number) make("UICorner", { CornerRadius = UDim.new(0, r) }, parent) end
local function label(parent: Instance, text: string, size: number, props: { [string]: any }?): TextLabel
	local l = make("TextLabel", { BackgroundTransparency = 1, Text = text, TextSize = size, Font = Enum.Font.GothamBold, TextColor3 = INK, TextWrapped = true, Size = UDim2.new(1, 0, 0, size + 8) }, parent)
	if props then for k, v in pairs(props) do (l :: any)[k] = v end end
	return l
end
local function button(parent: Instance, text: string, color: Color3, props: { [string]: any }?): TextButton
	local b = make("TextButton", { Text = text, TextSize = 22, Font = Enum.Font.GothamBold, TextColor3 = Color3.new(1, 1, 1), BackgroundColor3 = color, AutoButtonColor = true, Size = UDim2.fromOffset(180, 56) }, parent)
	round(b, 14)
	if props then for k, v in pairs(props) do (b :: any)[k] = v end end
	return b
end
-- 絵（まだ 審査中なら 色の 板と「じゅんびちゅう」）。
local function picture(parent: Instance, image: string, props: { [string]: any }): Frame
	local holder = make("Frame", { BackgroundColor3 = Color3.fromRGB(243, 234, 214), BorderSizePixel = 0, ClipsDescendants = true }, parent)
	for k, v in pairs(props) do (holder :: any)[k] = v end
	round(holder, 16)
	if image ~= "" then
		make("ImageLabel", { BackgroundTransparency = 1, Image = image, ScaleType = Enum.ScaleType.Crop, Size = UDim2.fromScale(1, 1) }, holder)
	else
		label(holder, "🎨 じゅんびちゅう", 20, { Size = UDim2.fromScale(1, 1), TextColor3 = Color3.fromRGB(138, 148, 166) })
	end
	return holder
end

-- ---- 画面の 入れ物 --------------------------------------------------------------------------------
local gui = make("ScreenGui", { Name = "USpeakBooks", ResetOnSpawn = false, IgnoreGuiInset = true, Enabled = false, DisplayOrder = 40 }, Players.LocalPlayer:WaitForChild("PlayerGui"))
make("Frame", { BackgroundColor3 = Color3.fromRGB(20, 28, 60), BackgroundTransparency = 0.25, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1) }, gui)
local panel = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.new(0.92, 0, 0.88, 0), BackgroundColor3 = Color3.fromRGB(250, 245, 232), BorderSizePixel = 0 }, gui)
round(panel, 24)
make("UISizeConstraint", { MaxSize = Vector2.new(1180, 760) }, panel)
local head = make("Frame", { BackgroundColor3 = Color3.fromRGB(42, 61, 122), BorderSizePixel = 0, Size = UDim2.new(1, 0, 0, 64) }, panel)
round(head, 24)
local title = label(head, "わたしの ほんだな", 24, { TextColor3 = Color3.new(1, 1, 1), Position = UDim2.fromOffset(84, 0), Size = UDim2.new(1, -168, 1, 0), TextXAlignment = Enum.TextXAlignment.Left })
local back = button(head, "←", Color3.fromRGB(74, 92, 160), { Size = UDim2.fromOffset(52, 48), Position = UDim2.fromOffset(12, 8), Visible = false })
local close = button(head, "✕", Color3.fromRGB(74, 92, 160), { Size = UDim2.fromOffset(52, 48), AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -12, 0, 8) })
local body = make("Frame", { BackgroundTransparency = 1, Position = UDim2.fromOffset(16, 76), Size = UDim2.new(1, -32, 1, -106) }, panel)
-- 絵の 小物は Twemoji（CC-BY 4.0）。きまりで クレジットを いつも 出す（Web 版の 本だなと 同じ 文）。
label(panel, "Emoji art: Twemoji (CC-BY 4.0)", 12, { TextColor3 = Color3.fromRGB(140, 148, 162), Font = Enum.Font.Gotham, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -6), Size = UDim2.new(1, -32, 0, 16) })

local state: { shelf: any?, book: any?, page: number, quiz: number, busy: boolean } = { shelf = nil, book = nil, page = 1, quiz = 0, busy = false }
local function clear() for _, c in ipairs(body:GetChildren()) do c:Destroy() end end
local showShelf: () -> ()
local showPage: () -> ()
local showQuiz: () -> ()

local function hide()
	gui.Enabled = false
	state.book = nil
	Quit:FireServer()
end
close.MouseButton1Click:Connect(hide)
back.MouseButton1Click:Connect(function()
	if state.book then state.book = nil; Quit:FireServer(); showShelf() end
end)

-- ---- 本だな ---------------------------------------------------------------------------------------
showShelf = function()
	clear()
	back.Visible = false
	local s = state.shelf
	title.Text = "えほん レベル " .. tostring(s and s.stage or "")
	local scroll = make("ScrollingFrame", { BackgroundTransparency = 1, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1), ScrollBarThickness = 8, AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new() }, body)
	make("UIGridLayout", { CellSize = UDim2.fromOffset(200, 250), CellPadding = UDim2.fromOffset(16, 16), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	for i, b in ipairs(s and s.books or {}) do
		local card = make("TextButton", { Text = "", AutoButtonColor = true, BackgroundColor3 = COVER[(i - 1) % #COVER + 1], LayoutOrder = i }, scroll)
		round(card, 14)
		label(card, tostring(b.title), 17, { TextColor3 = Color3.new(1, 1, 1), Position = UDim2.fromOffset(10, 8), Size = UDim2.new(1, -20, 0, 60) })
		picture(card, tostring(b.image or ""), { Position = UDim2.fromOffset(10, 72), Size = UDim2.new(1, -20, 0, 135) })
		label(card, tostring(b.titleJa or ""), 13, { TextColor3 = Color3.new(1, 1, 1), Position = UDim2.new(0, 8, 1, -38), Size = UDim2.new(1, -16, 0, 32), Font = Enum.Font.Gotham })
		card.MouseButton1Click:Connect(function()
			if state.busy then return end
			state.busy = true
			local book = Open:InvokeServer(b.id)
			state.busy = false
			if type(book) ~= "table" then return end
			state.book = book; state.page = 1; state.quiz = 0
			showPage()
		end)
	end
end

-- ---- 本の ページ ----------------------------------------------------------------------------------
showPage = function()
	clear()
	back.Visible = true
	local b = state.book
	if not b then return end
	local p = b.pages[state.page]
	title.Text = ("%s   %d / %d"):format(tostring(b.title), state.page, #b.pages)
	picture(body, tostring(p.image or ""), { Size = UDim2.new(0.56, -8, 1, -76) })
	local text = make("Frame", { BackgroundColor3 = PAPER, BorderSizePixel = 0, Position = UDim2.new(0.56, 8, 0, 0), Size = UDim2.new(0.44, -8, 1, -76) }, body)
	round(text, 16)
	make("UIPadding", { PaddingLeft = UDim.new(0, 18), PaddingRight = UDim.new(0, 18), PaddingTop = UDim.new(0, 16) }, text)
	label(text, tostring(p.text), 30, { Size = UDim2.new(1, 0, 0.62, 0), TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, TextScaled = true })
	make("UITextSizeConstraint", { MaxTextSize = 40, MinTextSize = 16 }, text:FindFirstChildOfClass("TextLabel"))
	label(text, tostring(p.ja), 18, { Position = UDim2.new(0, 0, 0.66, 0), Size = UDim2.new(1, 0, 0.3, 0), TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, Font = Enum.Font.Gotham, TextColor3 = Color3.fromRGB(93, 107, 130) })
	local prev = button(body, "← もどる", Color3.fromRGB(154, 163, 178), { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 0, 1, 0) })
	prev.Visible = state.page > 1
	prev.MouseButton1Click:Connect(function() state.page -= 1; showPage() end)
	local last = state.page >= #b.pages
	local nextB = button(body, last and "クイズへ →" or "つぎへ →", GREEN, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, 0, 1, 0) })
	nextB.MouseButton1Click:Connect(function()
		if last then state.quiz = 1; showQuiz() else state.page += 1; showPage() end
	end)
end

-- ---- クイズ（1 画面 1 問）と けっか ------------------------------------------------------------------
local function showResult(r: any)
	clear()
	back.Visible = true
	local b = state.book
	title.Text = b and tostring(b.title) or ""
	label(body, r.passed and "🏆 よみおえたよ！" or "💪 おしい！ もう一度 よんで みよう", 34, { Position = UDim2.new(0, 0, 0.18, 0), Size = UDim2.new(1, 0, 0, 60) })
	label(body, ("クイズ  %d / %d"):format(tonumber(r.right) or 0, tonumber(r.total) or 5), 28, { Position = UDim2.new(0, 0, 0.36, 0), Size = UDim2.new(1, 0, 0, 44) })
	if (tonumber(r.coins) or 0) > 0 then label(body, ("＋%d コイン"):format(r.coins), 26, { Position = UDim2.new(0, 0, 0.48, 0), Size = UDim2.new(1, 0, 0, 40), TextColor3 = ORANGE }) end
	local again = button(body, "📚 ほんだなへ", GREEN, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0.66, 0), Size = UDim2.fromOffset(240, 60) })
	again.MouseButton1Click:Connect(function() state.book = nil; Quit:FireServer(); showShelf() end)
end

showQuiz = function()
	clear()
	back.Visible = true
	local b = state.book
	if not b then return end
	local q = b.quiz[state.quiz]
	if not q then return end
	title.Text = ("クイズ  %d / %d"):format(state.quiz, #b.quiz)
	label(body, tostring(q.q), 28, { Size = UDim2.new(1, 0, 0, 84), TextScaled = true })
	label(body, tostring(q.ja), 18, { Position = UDim2.fromOffset(0, 88), Size = UDim2.new(1, 0, 0, 30), Font = Enum.Font.Gotham, TextColor3 = Color3.fromRGB(93, 107, 130) })
	local verdict = label(body, "", 24, { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 0, 1, -8), Size = UDim2.new(0.6, 0, 0, 44), TextXAlignment = Enum.TextXAlignment.Left })
	local buttons: { TextButton } = {}
	local answered = false
	for i, c in ipairs(q.choices) do
		local cb = button(body, tostring(c), Color3.fromRGB(63, 134, 208), { Position = UDim2.new(0, 0, 0, 128 + (i - 1) * 70), Size = UDim2.new(1, 0, 0, 60), TextWrapped = true })
		buttons[i] = cb
		cb.MouseButton1Click:Connect(function()
			if answered or state.busy then return end
			answered = true; state.busy = true
			local r = Answer:InvokeServer({ n = state.quiz, choice = tostring(c) })
			state.busy = false
			if type(r) ~= "table" or r.error then answered = false; verdict.Text = "つうしんできません。もう一度 おしてね。"; return end
			for j, other in ipairs(buttons) do
				local txt = tostring(q.choices[j])
				other.BackgroundColor3 = (txt == r.answer) and GREEN or ((other == cb) and Color3.fromRGB(200, 87, 62) or Color3.fromRGB(170, 178, 190))
				other.AutoButtonColor = false
			end
			verdict.Text = r.correct and "⭕ せいかい！" or "❌ みどりが こたえだよ"
			local nextB = button(body, r.done and "けっかを みる →" or "つぎへ →", GREEN, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, 0, 1, 0) })
			nextB.MouseButton1Click:Connect(function()
				if r.done then showResult(r) else state.quiz += 1; showQuiz() end
			end)
		end)
	end
end

-- ---- サーバーから ----------------------------------------------------------------------------------
Show.OnClientEvent:Connect(function(msg: any)
	if type(msg) ~= "table" then return end
	if msg.error then warn(msg.error); return end
	if msg.shelf then
		state.shelf = msg.shelf; state.book = nil
		gui.Enabled = true
		showShelf()
	end
end)
]=====])

-- ② HTTP（Web の サーバーと 話す）
local httpOk = pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 本だな：レベルごとに 1 つ（タグ USpeakBookShelf・属性 Stage）。近づいて「よむ」を おすと その レベルの 本だなが ひらく。
local SHELVES = {
  { "A", Color3.fromHex("#E2574C") },
  { "B", Color3.fromHex("#E27A2D") },
  { "C", Color3.fromHex("#D99A1E") },
  { "1", Color3.fromHex("#4FA868") },
  { "2", Color3.fromHex("#2F9A9A") },
  { "3", Color3.fromHex("#3F86D0") },
  { "4", Color3.fromHex("#5A66C8") },
  { "5", Color3.fromHex("#8A5CC0") },
  { "6", Color3.fromHex("#C0589A") },
  { "7", Color3.fromHex("#3CA06E") },
  { "8", Color3.fromHex("#28A0AA") },
  { "9", Color3.fromHex("#4682DC") }
}
local old = workspace:FindFirstChild("USpeakBookShelves")
if old then old:Destroy() end
local folder = Instance.new("Folder")
folder.Name = "USpeakBookShelves"
folder.Parent = workspace
for i, s in ipairs(SHELVES) do
	local p = Instance.new("Part")
	p.Name = "Shelf_" .. s[1]
	p.Anchored = true
	p.Size = Vector3.new(6, 8, 2)
	p.Position = Vector3.new((i - 6.5) * 8, 4, -24)
	p.Color = s[2]
	p.Material = Enum.Material.Wood
	p:SetAttribute("Stage", s[1])
	CollectionService:AddTag(p, "USpeakBookShelf")
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "よむ"
	prompt.ObjectText = "えほん レベル " .. s[1]
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.Parent = p
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(150, 60)
	bb.StudsOffset = Vector3.new(0, 6, 0)
	bb.AlwaysOnTop = true
	bb.Parent = p
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = "レベル " .. s[1]
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.3
	t.Parent = bb
	p.Parent = folder
end

-- ④ のこりの 手作業
print("✅ できました：えほんの スクリプト 3 つ と 本だな 12 こ（レベル A〜9）を 入れました。" .. (httpOk and "HTTP も オンに しました。" or ""))
if not httpOk then warn("⚠ HTTP を オンに できませんでした：Game Settings → Security → Allow HTTP Requests を オンに してください。") end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
warn("⚠ 絵は Web の 管理ページ /admin/roblox-books で 上げます。審査が おわった 絵から 本に 出ます（まだの ページは「じゅんびちゅう」）。")
print("さいごに File → Publish to Roblox で 公開してください。")
