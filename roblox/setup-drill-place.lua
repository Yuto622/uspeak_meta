-- U-Speak 英検ドリル ワールド：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-drill-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 3 つを 入れる ② HTTP を オン ③ 入口（級ごとの 台）を 7 つ 置く ④ たりない ものを 表示する
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayerScripts = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
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

-- ① スクリプト
put(ServerScriptService, "Script", "USpeakDrill", [=====[--!strict
-- U-Speak 英検ドリル ワールド（Roblox 側・サーバー）— /admin/qbank の「Robloxに出す」問題を、メインワールドと 同じ
-- 7 形式（mc・match・spell・type・order・fill・listen）で 出す。docs/QBANK.md の「Roblox の ドリル ワールド」。
--
-- 置き場所：ドリル用の place の ServerScriptService（Script）。Secrets の USPEAK_WEB_KEY と「Allow HTTP Requests」は
-- USpeakWalletSync と 同じ（コインを Web と そろえるので、この place にも USpeakWalletSync を 入れる）。
--
-- しくみ：
--   * 問題を 作るのも 判定も Web の サーバー（GET /api/roblox/drill・POST /api/roblox/drill/check）。
--     形の 作りかたは web版と 同じ ファイル（formats-core.js）なので、メインワールドの 7 形式と 同じ 形の データが 来る。
--   * 1 問ずつ { token, kind, public }。token（答えが とじて ある）は この Script だけが 持ち、子どもには public だけ 送る。
--   * 正解・コイン・学習の 記録（保護者レポート・苦手単語・先生の /class）は サーバーが 決めて のこす。ここは 返ってきた
--     coins を leaderstats に 足すだけ。まちがえたら 1 回だけ やりなおし（2 回目は コインなし・答えを 見せる）。
--
-- 入口：CollectionService の タグ "USpeakDrillGate" を つけた Part に ProximityPrompt と 属性 Grade（"5級"・"4級"・"3級"・
-- "準2級"・"2級"・"準1級以上"・"ジュニア"）を つける。近づいて 押すと その 級の 10 問が はじまる。
--
-- 画面との やりとり（ReplicatedStorage に 自動で 作る）：
--   RemoteEvent    USpeakDrillShow   サーバー → 画面：{ index, total, grade, public } … 1 問 見せる / { done = true, right, total, coins }
--   RemoteFunction USpeakDrillAnswer 画面 → サーバー：answer（形ごとの 答え。下の 表）→ { correct, retry?, reveal?, coins }
--   RemoteEvent    USpeakDrillQuit   画面 → サーバー：とじた
-- 答えの 形（formats-core の checkFormat と 同じ）：mc＝えらんだ 文字列・match＝左の 順の 日本語の 配列・spell＝文字の 配列か
-- 文字列・type＝打った 文字列・order＝単語の 配列か 文字列・fill＝えらんだ カード・listen＝えらんだ 英単語。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local COIN_STAT = "Coins"   -- leaderstats の IntValue（USpeakWalletSync と 同じ）
local PER_SET = 10
local GATE_TAG = "USpeakDrillGate"

local function remote(className: string, name: string): Instance
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then
		r = Instance.new(className)
		r.Name = name
		r.Parent = ReplicatedStorage
	end
	return r :: Instance
end
local Show = remote("RemoteEvent", "USpeakDrillShow") :: RemoteEvent
local Answer = remote("RemoteFunction", "USpeakDrillAnswer") :: RemoteFunction
local Quit = remote("RemoteEvent", "USpeakDrillQuit") :: RemoteEvent

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
		warn("[uspeak drill] " .. path .. " failed", ok and res.StatusCode or res)
		return nil
	end
	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	return okJson and data or nil
end

-- ---- 1 人ぶんの セット ----------------------------------------------------------------------------
type Item = { token: string, kind: string, public: any }
type Session = { grade: string, items: { Item }, index: number, attempt: number, shownAt: number, right: number, coins: number, busy: boolean }
local sessions: { [Player]: Session } = {}

local function addCoins(player: Player, n: number)
	if n <= 0 then return end
	local stats = player:FindFirstChild("leaderstats")
	local v = stats and stats:FindFirstChild(COIN_STAT)
	if v and v:IsA("IntValue") then v.Value += n end
end

local function showCurrent(player: Player)
	local s = sessions[player]
	if not s then return end
	local it = s.items[s.index]
	if not it then
		Show:FireClient(player, { done = true, right = s.right, total = #s.items, coins = s.coins, grade = s.grade })
		sessions[player] = nil
		return
	end
	s.attempt = 1
	s.shownAt = os.clock()
	Show:FireClient(player, { index = s.index, total = #s.items, grade = s.grade, public = it.public })
end

local function start(player: Player, grade: string)
	if sessions[player] and sessions[player].busy then return end
	local r = request("GET", ("/drill?grade=%s&n=%d"):format(HttpService:UrlEncode(grade), PER_SET))
	if not r or not r.ok or type(r.items) ~= "table" or #r.items == 0 then
		Show:FireClient(player, { error = "いまは 問題を よみこめません。すこし まってから もう一度。" })
		return
	end
	local items: { Item } = {}
	for _, q in ipairs(r.items) do
		if type(q) == "table" and type(q.token) == "string" and type(q.public) == "table" then
			table.insert(items, { token = q.token, kind = tostring(q.kind), public = q.public })
		end
	end
	sessions[player] = { grade = grade, items = items, index = 1, attempt = 1, shownAt = os.clock(), right = 0, coins = 0, busy = false }
	showCurrent(player)
end

-- 画面から 答えが 来た。判定は サーバー（Web）。
Answer.OnServerInvoke = function(player: Player, given: any)
	local s = sessions[player]
	if not s or s.busy then return nil end
	local it = s.items[s.index]
	if not it then return nil end
	s.busy = true
	local r = request("POST", "/drill/check", {
		token = it.token, answer = given, attempt = s.attempt, ms = math.floor((os.clock() - s.shownAt) * 1000),
		username = player.Name, userId = tostring(player.UserId), classCode = player:GetAttribute("ClassCode") or "",
		world = "eiken-drill", placeId = tostring(game.PlaceId),
	})
	s.busy = false
	if not r or not r.ok then return { error = true } end
	local coins = tonumber(r.coins) or 0
	addCoins(player, coins)
	s.coins += coins
	if r.correct and s.attempt == 1 then s.right += 1 end
	local out = { correct = r.correct == true, coins = coins, reveal = r.reveal, retry = r.retry }
	if r.correct or s.attempt >= 2 then
		-- つぎの 問題へ（画面が 正解・答えを 見せてから 出す）
		s.index += 1
		task.delay(1.6, function() if sessions[player] == s then showCurrent(player) end end)
	else
		s.attempt = 2
		s.shownAt = os.clock()
	end
	return out
end

Quit.OnServerEvent:Connect(function(player: Player) sessions[player] = nil end)
Players.PlayerRemoving:Connect(function(player: Player) sessions[player] = nil end)

-- ---- 入口（タグ USpeakDrillGate の Part）------------------------------------------------------------
local function hookGate(part: Instance)
	local prompt = part:FindFirstChildWhichIsA("ProximityPrompt", true)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "とく"
		prompt.ObjectText = tostring(part:GetAttribute("Grade") or "英検ドリル")
		prompt.HoldDuration = 0
		prompt.Parent = part
	end
	(prompt :: ProximityPrompt).Triggered:Connect(function(player: Player)
		local grade = part:GetAttribute("Grade")
		if type(grade) == "string" and grade ~= "" then start(player, grade) end
	end)
end
for _, part in ipairs(CollectionService:GetTagged(GATE_TAG)) do hookGate(part) end
CollectionService:GetInstanceAddedSignal(GATE_TAG):Connect(hookGate)
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
put(StarterPlayerScripts, "LocalScript", "USpeakDrillClient", [=====[--!strict
-- U-Speak 英検ドリル ワールド（Roblox 側・画面）— USpeakDrill.server.luau から 来た 1 問を、メインワールドの
-- 7 形式の 画面（USpeakFormatUI）で 見せて、答えを サーバーに 返す。
--
-- 置き場所：ドリル用の place の StarterPlayerScripts（LocalScript）。メインワールドの USpeakFormatUI（ModuleScript）を
-- この place の ReplicatedStorage に コピーして おく。
--
-- **メインワールドの USpeakFormatUI の 呼びかたに あわせて、下の 「画面（ここだけ あわせる）」の 3 つだけ 書きかえる。**
-- 来る 問題（public）は web版と 同じ 形（formats-core.js の publicFormat）：
--   mc     { kind, word, choices, prompt? }          match  { kind, left, right }
--   spell  { kind, ja, letters, say }                type   { kind, ja, length, say, hint?（2 回目）}
--   order  { kind, ja, words }                       fill   { kind, ja, before, after, cards }
--   listen { kind, word（読み上げる 英語）, choices }
-- 答えの 形は USpeakDrill.server.luau の 先頭の 表。正解・答えは サーバーから 来た ものだけを 見せる（画面では 決めない）。

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Show = ReplicatedStorage:WaitForChild("USpeakDrillShow") :: RemoteEvent
local Answer = ReplicatedStorage:WaitForChild("USpeakDrillAnswer") :: RemoteFunction
local Quit = ReplicatedStorage:WaitForChild("USpeakDrillQuit") :: RemoteEvent
local FormatUI = require(ReplicatedStorage:WaitForChild("USpeakFormatUI")) :: any

-- ---- 画面（ここだけ あわせる）---------------------------------------------------------------------
-- 1 問 出す。子どもが 答えたら submit(answer) を 呼ぶ。✕ で とじたら onClose()。
local function render(public: any, header: string, submit: (any) -> (), onClose: () -> ())
	FormatUI.Show(public, { header = header, onSubmit = submit, onClose = onClose })
end
-- 判定の 結果を 見せる（correct・reveal（答え）・retry（2 回目の 形）・coins）。
local function feedback(result: any)
	FormatUI.Feedback(result)
end
-- セットの おわり／エラー
local function finish(summary: any)
	FormatUI.Hide()
	if summary.error then warn(summary.error) end
end

-- ---- サーバーと つなぐ（ここは かえない）-----------------------------------------------------------
local function submit(answer: any)
	local r = Answer:InvokeServer(answer)
	if not r or r.error then
		feedback({ error = true })
		return
	end
	feedback(r)
end

Show.OnClientEvent:Connect(function(msg: any)
	if type(msg) ~= "table" then return end
	if msg.done or msg.error then
		finish(msg)
		return
	end
	render(msg.public, ("%s  %d / %d"):format(msg.grade or "", msg.index or 0, msg.total or 0), submit, function()
		Quit:FireServer()
		FormatUI.Hide()
	end)
end)
]=====])

-- ② HTTP（Web の サーバーと 話す）
pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 入口：級ごとの 台（タグ USpeakDrillGate・属性 Grade）。近づいて「とく」を おすと 10 問。
local GATES = {
  { "5級", Color3.fromHex("#3CA06E") },
  { "4級", Color3.fromHex("#28A0AA") },
  { "3級", Color3.fromHex("#4682DC") },
  { "準2級", Color3.fromHex("#8C50D2") },
  { "2級", Color3.fromHex("#E27A2D") },
  { "準1級以上", Color3.fromHex("#E66496") },
  { "ジュニア", Color3.fromHex("#E0A020") }
}
local old = workspace:FindFirstChild("USpeakDrillGates")
if old then old:Destroy() end
local folder = Instance.new("Folder")
folder.Name = "USpeakDrillGates"
folder.Parent = workspace
for i, g in ipairs(GATES) do
	local p = Instance.new("Part")
	p.Name = "Gate_" .. g[1]
	p.Anchored = true
	p.Size = Vector3.new(6, 1, 6)
	p.Position = Vector3.new((i - 4) * 9, 0.5, -20)
	p.Color = g[2]
	p.Material = Enum.Material.SmoothPlastic
	p:SetAttribute("Grade", g[1])
	CollectionService:AddTag(p, "USpeakDrillGate")
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "とく"
	prompt.ObjectText = "英検 " .. g[1]
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 10
	prompt.Parent = p
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(160, 50)
	bb.StudsOffset = Vector3.new(0, 4, 0)
	bb.AlwaysOnTop = true
	bb.Parent = p
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = g[1]
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.3
	t.Parent = bb
	p.Parent = folder
end

-- ④ たりない もの
print("✅ U-Speak 英検ドリル：スクリプト 3 つ・HTTP・入口 7 つ を 入れました。File → Save to Roblox（または Publish）で 保存してください。")
if not ReplicatedStorage:FindFirstChild("USpeakFormatUI") then
	warn("⚠ ReplicatedStorage に USpeakFormatUI が ありません。メインワールドから コピーして ここに 貼りつけてください（7 形式の 画面）。")
end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
