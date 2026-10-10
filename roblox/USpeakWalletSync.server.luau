--!strict
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
