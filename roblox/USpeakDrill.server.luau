--!strict
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
