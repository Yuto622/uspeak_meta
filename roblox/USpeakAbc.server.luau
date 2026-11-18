-- U-Speak「ABC と おと」— Roblox 側・サーバー。Web 版（幼児モードの カード）と **同じ 問題・同じ きまり**で あそぶ。
--
-- 置き場所：ABC 用の place の ServerScriptService（Script）。Secrets の USPEAK_WEB_KEY と「Allow HTTP Requests」は
-- ほかの U-Speak の Script（USpeakDrill・USpeakBooks）と 同じ。一発 セットアップ（roblox/setup-abc-place.lua）が ここに 入れる。
--
-- しくみ（英検ドリル USpeakDrill・えほん USpeakBooks と 同じ 考え方）：
--   * 問題を 作るのも 判定も Web の サーバー（GET /api/roblox/abc/state・POST /abc/start・POST /abc/answer）。
--     きまりは Web 版と 同じ ファイル（server/src/game/abc.js）：はじめの 数問で どこから はじめるかを きめる・
--     8 わり できたら つぎへ・まちがえた もじは「にがて」に たまる・クラスごとの 設定（大文字／小文字・もじの 順）。
--   * 1 回ぶんの しるし（sid）は この Script だけが 持つ。画面には もんだいと えらぶ ものだけ わたす（答えは 答えた あとに 来る）。
--   * 記録は Web の その 子と 同じ 1 つ（つづきを Web で しても Roblox で しても 同じ）。保護者レポートの
--     「おぼえた もじ ○/26・よめる きまり ○こ」にも のる。コインは 出ない（Web 版と 同じ）。
--   * 絵は Web の サーバーが Roblox へ 上げた じぶんたちの 絵（rbxassetid://…）。審査を 通った 絵が そろうまでは
--     はじめられない（画面に「えを じゅんびちゅう」）。もじは 絵では なく 字で 出す。
--   * **こえは 出ない。** Web 版は こえで きかせるが、この place では 「きく」かわりに 絵と もじを 見せる
--     （画面の もんだい文も「きいてね」では なく「この えの ことばは…」に して ある）。
--
-- 入口：CollectionService の タグ "USpeakAbcBoard" を つけた Part（ProximityPrompt つき）。近づいて 押すと ひらく。
--
-- 画面との やりとり（ReplicatedStorage に 自動で 作る）：
--   RemoteEvent    USpeakAbcShow    サーバー → 画面：{ state = {…} } ／ { error = "…" }
--   RemoteFunction USpeakAbcStart   画面 → サーバー：review（true＝にがての ふくしゅう）→ { q, state } ／ { error = "…" }
--   RemoteFunction USpeakAbcAnswer  画面 → サーバー：{ choice = "…" } ／ { order = {"b0",…} } ／ { seen = true } → { teach, correct, answer, parts, over, next, summary, state }
--   RemoteEvent    USpeakAbcQuit    画面 → サーバー：とじた
--
-- ※ この Script は Web 側の 口に あわせて 書いた もので、まだ Roblox Studio では 動かして いません（はじめに Studio で ためす こと）。
-- ※ 型の 注釈や += を 使って いないのは、Studio の 外でも 文法を たしかめられる ように する ため（ふつうの Lua の 書き方）。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
-- かぎ（Secrets の USPEAK_WEB_KEY）。まだ 入れて いない ときに ここで 止まると 画面も 出なく なるので、止めずに おぼえて おく。
-- Studio で ためす とき：ホーム → ゲーム設定 → セキュリティ → Secrets に 入れる。公開した 体験：Creator Hub → その体験 → Secrets。
local KEY = nil
local function loadKey()
	if KEY then return true end
	local ok, secret = pcall(function() return HttpService:GetSecret("USPEAK_WEB_KEY") end)
	if ok and secret then KEY = secret return true end
	return false
end
if not loadKey() then
	warn("[uspeak abc] Secrets に USPEAK_WEB_KEY が ありません。いれるまで もんだいは でません（がめんには「じゅんびちゅう」と でます）。")
end
local BOARD_TAG = "USpeakAbcBoard"

local function remote(className, name)
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then
		r = Instance.new(className)
		r.Name = name
		r.Parent = ReplicatedStorage
	end
	return r
end
local Show = remote("RemoteEvent", "USpeakAbcShow")
local Start = remote("RemoteFunction", "USpeakAbcStart")
local Answer = remote("RemoteFunction", "USpeakAbcAnswer")
local Quit = remote("RemoteEvent", "USpeakAbcQuit")

-- ---- HTTP ---------------------------------------------------------------------------------------
-- 返す：data（JSON）, status。つながらない ときは nil, 0。400 の へんじ（{ ok=false, error=… }）も data で 返す。
local function request(method, path, body)
	if not loadKey() then return { ok = false, error = "no key" }, 0 end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path,
			Method = method,
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		warn("[uspeak abc] " .. path .. " failed", res)
		return nil, 0
	end
	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not res.Success and res.StatusCode ~= 400 then
		warn("[uspeak abc] " .. path .. " status", res.StatusCode)
	end
	return okJson and data or nil, res.StatusCode
end

local function classOf(player)
	local c = player:GetAttribute("ClassCode")
	return type(c) == "string" and c or ""
end

-- ---- 1 人ぶんの 1 回 ------------------------------------------------------------------------------
-- sessions[player] = { sid = "…", shownAt = os.clock(), busy = false }
local sessions = {}

local ERRORS = {
	pictures = "えを じゅんびちゅう だよ。もう すこし まってね。",
	nothing = "ぜんぶ できたよ！ すごいね。",
	["no review"] = "いまは にがてな ものが ないよ。",
	["no data"] = "いまは つかえないよ。せんせいに きいてね。",
	["no key"] = "まだ じゅんびちゅう だよ。せんせいに きいてね。",
}
local function errorText(code)
	return ERRORS[tostring(code)] or "いまは つながらないよ。すこし まってから もう いちど。"
end

local function openBoard(player)
	local r = request("GET", "/abc/state?username=" .. HttpService:UrlEncode(player.Name) .. "&classCode=" .. HttpService:UrlEncode(classOf(player)))
	if not r or not r.ok or type(r.state) ~= "table" then
		Show:FireClient(player, { error = errorText(r and r.error) })
		return
	end
	sessions[player] = nil
	Show:FireClient(player, { state = r.state })
end

-- はじめる（review＝にがての ふくしゅう）。sid は ここに のこし、画面には もんだいだけ わたす。
Start.OnServerInvoke = function(player, review)
	local old = sessions[player]
	if old and old.busy then return nil end
	sessions[player] = { sid = "", shownAt = os.clock(), busy = true }
	local r = request("POST", "/abc/start", {
		username = player.Name, userId = tostring(player.UserId), classCode = classOf(player), review = review == true,
	})
	if not r or not r.ok or type(r.q) ~= "table" then
		sessions[player] = nil
		return { error = errorText(r and r.error) }
	end
	sessions[player] = { sid = tostring(r.sid), shownAt = os.clock(), busy = false }
	return { q = r.q, state = r.state }
end

-- 画面から 答えが 来た。判定は Web の サーバー。
Answer.OnServerInvoke = function(player, given)
	local s = sessions[player]
	if not s or s.busy or s.sid == "" or type(given) ~= "table" then return nil end
	local body = {
		sid = s.sid, username = player.Name, placeId = tostring(game.PlaceId),
		ms = math.floor((os.clock() - s.shownAt) * 1000),
	}
	if given.seen == true then
		body.seen = true
	elseif type(given.order) == "table" then
		local order = {}
		for i = 1, math.min(#given.order, 12) do order[i] = tostring(given.order[i]) end
		body.order = order
	elseif type(given.choice) == "string" then
		body.choice = string.sub(given.choice, 1, 20)
	else
		return nil
	end
	s.busy = true
	local r = request("POST", "/abc/answer", body)
	s.busy = false
	s.shownAt = os.clock()
	if not r or not r.ok then
		if r and r.error == "no round" then sessions[player] = nil end
		return { error = errorText(r and r.error) }
	end
	if r.over == true then sessions[player] = nil end
	return {
		teach = r.teach == true, correct = r.correct == true, answer = r.answer, parts = r.parts,
		over = r.over == true, next = r.next, summary = r.summary, state = r.state,
	}
end

Quit.OnServerEvent:Connect(function(player) sessions[player] = nil end)
Players.PlayerRemoving:Connect(function(player) sessions[player] = nil end)

-- ---- 入った しゅんかんに ひらく ---------------------------------------------------------------------
-- かんばんまで 歩かなくても、入ったら すぐ「ABC と おと」が ひらく（とじた あとは かんばんの「あそぶ」で もう いちど）。
-- 画面の スクリプトが できるまで 少し まつ。RemoteEvent は 聞く 人が できるまで ためて おかれる。
local function openOnJoin(player)
	task.delay(2, function()
		if player.Parent then openBoard(player) end
	end)
end
Players.PlayerAdded:Connect(openOnJoin)
for _, player in ipairs(Players:GetPlayers()) do openOnJoin(player) end

-- ---- 入口（タグ USpeakAbcBoard の Part）-----------------------------------------------------------
local function hookBoard(part)
	local prompt = part:FindFirstChildWhichIsA("ProximityPrompt", true)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "あそぶ"
		prompt.ObjectText = "ABC と おと"
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = 12
		prompt.Parent = part
	end
	prompt.Triggered:Connect(function(player) openBoard(player) end)
end
for _, part in ipairs(CollectionService:GetTagged(BOARD_TAG)) do hookBoard(part) end
CollectionService:GetInstanceAddedSignal(BOARD_TAG):Connect(hookBoard)
