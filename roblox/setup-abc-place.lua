-- U-Speak「ABC と おと」の place：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-abc-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 2 つを 入れる ② HTTP を オン（できれば）③ 入口（「ABC と おと」の かんばん）を 置く ④ のこりの 手作業を 表示する
--
-- コマンドでは できない こと（この あと 手で する）：
--   1. Creator Hub → この体験 → Secrets に USPEAK_WEB_KEY（メインワールドと 同じ 値）を 入れる。
--   2. HTTP が オンに ならなかった ときは、Game Settings → Security → Allow HTTP Requests を オンに する。
--   3. File → Publish to Roblox で 公開する（Secrets は 公開した 体験で だけ 読める）。
--   4. 絵カードの 画像は Web の 管理ページ（/admin/roblox-books）で 上げて、Roblox の 審査を まつ。そろうまで 画面は「えを じゅんびちゅう」。
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

-- ① スクリプト
put(ServerScriptService, "Script", "USpeakAbc", [=====[-- U-Speak「ABC と おと」— Roblox 側・サーバー。Web 版（幼児モードの カード）と **同じ 問題・同じ きまり**で あそぶ。
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
]=====])
put(StarterPlayerScripts, "LocalScript", "USpeakAbcClient", [=====[-- U-Speak「ABC と おと」— Roblox 側・画面。USpeakAbc.server.luau から 来た もんだいを 1 画面 1 問で 見せる。
--
-- 置き場所：StarterPlayerScripts（LocalScript）。ほかの 部品は いらない（画面は ここで 作る）。
-- 流れ：はじめの 画面（すすみぐあい・はじめる・にがての ふくしゅう）→ 1 もん（おすだけ）→ こたえ → … → けっか。
-- もんだいの 形は Web 版と 同じ 10 しゅるい：show・chant・name・sound・picture・rule・blend・pair・word・spell。
-- 字は ひらがな＋英語＋絵だけ（漢字・カタカナ語は 出さない）。もじは 字で、ことばは 絵（rbxassetid://…）で 出す。
-- **こえは 出ない**ので、Web 版の「きいてね」の もんだいは、絵と もじを 見せる 形に して ある：
--   name  ＝ 大きい もじを 見て、おなじ もじ（小さい もじ）を えらぶ
--   sound ＝ 絵を 見て、その ことばの はじめ（x は おわり）の もじを えらぶ
--   pair  ＝ 絵を 見て、その ことばに 入って いる ふたつの もじを えらぶ
--   word  ＝ 絵を 見て、ただしい つづりを えらぶ
-- 正解・すすみぐあいは サーバーから 来た ものだけを 見せる（画面では きめない）。
--
-- ※ まだ Roblox Studio では 動かして いません。はじめに Studio で 見た目（大きさ・フォント）を たしかめて ください。
-- ※ 型の 注釈や += を 使って いないのは、Studio の 外でも 文法を たしかめられる ように する ため。

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Show = ReplicatedStorage:WaitForChild("USpeakAbcShow")
local Start = ReplicatedStorage:WaitForChild("USpeakAbcStart")
local Answer = ReplicatedStorage:WaitForChild("USpeakAbcAnswer")
local Quit = ReplicatedStorage:WaitForChild("USpeakAbcQuit")

local INK = Color3.fromRGB(35, 50, 74)
local PAPER = Color3.fromRGB(255, 247, 223)
local YELLOW = Color3.fromRGB(240, 180, 60)
local GREEN = Color3.fromRGB(47, 143, 91)
local RED = Color3.fromRGB(214, 84, 70)
local BLUE = Color3.fromRGB(63, 134, 208)
local GREY = Color3.fromRGB(214, 206, 188)
local WHITE = Color3.new(1, 1, 1)
local LETTER_FONT = Enum.Font.FredokaOne
local TEXT_FONT = Enum.Font.GothamBold
local TILE_COLORS = { Color3.fromRGB(226, 87, 76), Color3.fromRGB(63, 134, 208), Color3.fromRGB(79, 168, 104), Color3.fromRGB(138, 92, 192), Color3.fromRGB(226, 122, 45) }

-- ---- 部品を 作る 小さな 関数 ------------------------------------------------------------------------
local function make(className, props, parent)
	local o = Instance.new(className)
	for k, v in pairs(props) do o[k] = v end
	if parent then o.Parent = parent end
	return o
end
local function round(parent, r) make("UICorner", { CornerRadius = UDim.new(0, r) }, parent) end
local function label(parent, text, size, props)
	local l = make("TextLabel", { BackgroundTransparency = 1, Text = text, TextSize = size, Font = TEXT_FONT, TextColor3 = INK, TextWrapped = true, Size = UDim2.new(1, 0, 0, size + 10) }, parent)
	if props then for k, v in pairs(props) do l[k] = v end end
	return l
end
local function button(parent, text, color, props)
	local b = make("TextButton", { Text = text, TextSize = 24, Font = TEXT_FONT, TextColor3 = WHITE, BackgroundColor3 = color, AutoButtonColor = true, Size = UDim2.fromOffset(220, 64) }, parent)
	round(b, 16)
	if props then for k, v in pairs(props) do b[k] = v end end
	return b
end
local function row(parent, props, gap)
	local f = make("Frame", { BackgroundTransparency = 1 }, parent)
	for k, v in pairs(props) do f[k] = v end
	make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center, Padding = UDim.new(0, gap or 16), SortOrder = Enum.SortOrder.LayoutOrder }, f)
	return f
end

-- もじの 出し方（クラスの 設定：both＝大文字と 小文字・upper・lower）。
local caseFirst = "both"
local function letterText(l, how)
	local mode = how or caseFirst
	if mode == "upper" then return string.upper(l) end
	if mode == "lower" then return string.lower(l) end
	return string.upper(l) .. " " .. string.lower(l)
end
local function hue(l)
	local n = string.byte(string.lower(l)) or 97
	return TILE_COLORS[(n % #TILE_COLORS) + 1]
end
-- もじの つみき（字で かく）。
local function letterTile(parent, text, color, props)
	local f = make("Frame", { BackgroundColor3 = color, BorderSizePixel = 0, Size = UDim2.fromOffset(170, 170) }, parent)
	if props then for k, v in pairs(props) do f[k] = v end end
	round(f, 22)
	make("UIStroke", { Color = WHITE, Thickness = 5 }, f)
	make("TextLabel", { BackgroundTransparency = 1, Size = UDim2.new(1, -16, 1, -16), Position = UDim2.fromOffset(8, 8), Text = text, TextScaled = true, Font = LETTER_FONT, TextColor3 = WHITE }, f)
	return f
end
-- ことばの 絵（まだ 審査中なら 色の 板と「じゅんびちゅう」）。
local function picture(parent, image, props)
	local holder = make("Frame", { BackgroundColor3 = WHITE, BorderSizePixel = 0, ClipsDescendants = true, Size = UDim2.fromOffset(170, 170) }, parent)
	if props then for k, v in pairs(props) do holder[k] = v end end
	round(holder, 22)
	local isAsset = type(image) == "string" and (string.sub(image, 1, 3) == "rbx" or string.sub(image, 1, 4) == "http")
	if isAsset then
		make("ImageLabel", { BackgroundTransparency = 1, Image = image, ScaleType = Enum.ScaleType.Fit, Size = UDim2.fromScale(1, 1) }, holder)
	elseif type(image) == "string" and image ~= "" then
		-- Roblox だけで うごく 版：えは もじ（emoji）で くる。
		make("TextLabel", { BackgroundTransparency = 1, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(0.8, 0.8), Text = image, TextScaled = true, Font = Enum.Font.SourceSans, TextColor3 = INK }, holder)
	else
		label(holder, "じゅんびちゅう", 18, { Size = UDim2.fromScale(1, 1), TextColor3 = Color3.fromRGB(138, 148, 166) })
	end
	return holder
end

-- ---- 画面の 入れ物 --------------------------------------------------------------------------------
local gui = make("ScreenGui", { Name = "USpeakAbc", ResetOnSpawn = false, IgnoreGuiInset = true, Enabled = false, DisplayOrder = 41 }, Players.LocalPlayer:WaitForChild("PlayerGui"))
make("Frame", { BackgroundColor3 = Color3.fromRGB(20, 28, 60), BackgroundTransparency = 0.25, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1) }, gui)
local panel = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.new(0.94, 0, 0.9, 0), BackgroundColor3 = PAPER, BorderSizePixel = 0 }, gui)
round(panel, 24)
make("UISizeConstraint", { MaxSize = Vector2.new(1180, 780) }, panel)
local head = make("Frame", { BackgroundColor3 = YELLOW, BorderSizePixel = 0, Size = UDim2.new(1, 0, 0, 64) }, panel)
round(head, 24)
label(head, "ABC と おと", 26, { TextColor3 = INK, Position = UDim2.fromOffset(84, 0), Size = UDim2.new(0.4, 0, 1, 0), TextXAlignment = Enum.TextXAlignment.Left })
local progress = label(head, "", 20, { TextColor3 = INK, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -84, 0, 0), Size = UDim2.new(0.5, 0, 1, 0), TextXAlignment = Enum.TextXAlignment.Right })
local close = button(head, "X", Color3.fromRGB(196, 140, 40), { Size = UDim2.fromOffset(52, 48), Position = UDim2.fromOffset(12, 8) })
local body = make("Frame", { BackgroundTransparency = 1, Position = UDim2.fromOffset(16, 76), Size = UDim2.new(1, -32, 1, -92) }, panel)

local state = { st = nil, q = nil, result = nil, picked = nil, rowIds = {}, busy = false }

local function clear()
	for _, c in ipairs(body:GetChildren()) do c:Destroy() end
end
local function setProgress()
	local st = state.st
	if not st or not st.placed then progress.Text = "" return end
	if st.track == "kinder" then
		progress.Text = "おぼえた もじ " .. tostring(st.lettersDone) .. " / 26"
	else
		progress.Text = "よめる きまり " .. tostring(st.rulesDone) .. " こ"
	end
end

local showHome, showQuestion, showSummary

-- すすみぐあいの 棒（もじ A〜Z ／ きまりの まる）。
local function progressBar(parent)
	local st = state.st
	if not st or not st.placed then return end
	local bar = row(parent, { Size = UDim2.new(1, 0, 0, 40), Position = UDim2.fromOffset(0, 4) }, 4)
	if st.track == "kinder" and type(st.letters) == "table" then
		for i, x in ipairs(st.letters) do
			local on = x.done == true
			local t = make("TextLabel", { LayoutOrder = i, Size = UDim2.fromOffset(34, 34), BackgroundColor3 = on and GREEN or GREY, BorderSizePixel = 0, Text = string.upper(tostring(x.l)), TextSize = 18, Font = LETTER_FONT, TextColor3 = on and WHITE or INK }, bar)
			round(t, 8)
		end
	elseif type(st.rules) == "table" then
		for i, x in ipairs(st.rules) do
			local t = make("Frame", { LayoutOrder = i, Size = UDim2.fromOffset(34, 34), BackgroundColor3 = x.done == true and GREEN or GREY, BorderSizePixel = 0 }, bar)
			round(t, 17)
		end
	end
end

-- ---- はじめの 画面 ---------------------------------------------------------------------------------
local function begin(review)
	if state.busy then return end
	state.busy = true
	local r = Start:InvokeServer(review == true)
	state.busy = false
	if type(r) ~= "table" or r.error or type(r.q) ~= "table" then
		clear()
		label(body, (type(r) == "table" and r.error) or "いまは つながらないよ。すこし まってから もう いちど。", 26, { Size = UDim2.new(1, 0, 0.5, 0), Position = UDim2.fromScale(0, 0.1) })
		button(body, "もどる", BLUE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromScale(0.5, 0.7) }).MouseButton1Click:Connect(function() showHome() end)
		return
	end
	if type(r.state) == "table" then state.st = r.state end
	state.q = r.q
	state.result = nil
	state.picked = nil
	state.rowIds = {}
	showQuestion()
end

showHome = function()
	clear()
	state.q = nil
	state.result = nil
	local st = state.st
	if type(st) == "table" and type(st.caseFirst) == "string" then caseFirst = st.caseFirst end
	setProgress()
	progressBar(body)
	local nx = (st and st.next) or {}
	local what = ""
	local big = nil
	if st and st.pictures and st.pictures.playable ~= true then
		what = "えを じゅんびちゅう だよ。もう すこし まってね。\nPictures are getting ready."
	elseif nx.type == "place" then
		what = "はじめに すこし きくよ。どこから はじめるか きめるね。\nFirst, a few questions."
	elseif nx.type == "letter" then
		what = "きょうの もじは これ！\nToday's letter."
		big = tostring(nx.letter)
	elseif nx.type == "unit" then
		if nx.kind == "spell" then what = "もじの つみきを ならべて、ことばを つくろう。\nMake words with letter blocks."
		elseif nx.kind == "cvc" then what = "みっつの おとを つなげて よもう。\nPut three sounds together."
		elseif nx.kind == "digraph" then what = "ふたつの もじで ひとつの おと。\nTwo letters, one sound."
		else what = "さいごの e で おとが かわるよ。\nThe last e changes the sound." end
	else
		what = "ぜんぶ できたね！ すごい！\nYou did it all!"
	end
	if big then
		letterTile(body, letterText(big), hue(big), { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 60) })
	elseif nx.type == "unit" and nx.kind ~= "spell" then
		letterTile(body, tostring(nx.label), BLUE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 60) })
	end
	label(body, what, 24, { Position = UDim2.new(0, 0, 0, 244), Size = UDim2.new(1, 0, 0, 90) })
	local acts = row(body, { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 0, 1, -8), Size = UDim2.new(1, 0, 0, 72) }, 18)
	local canPlay = st and st.pictures and st.pictures.playable == true and nx.type ~= "done" and nx.type ~= "none"
	if canPlay then
		button(acts, "▶ はじめる", GREEN, { LayoutOrder = 1 }).MouseButton1Click:Connect(function() begin(false) end)
	end
	if st and st.pictures and st.pictures.playable == true and (tonumber(st.weak) or 0) > 0 then
		button(acts, "にがてを ふくしゅう", BLUE, { LayoutOrder = 2, Size = UDim2.fromOffset(300, 64) }).MouseButton1Click:Connect(function() begin(true) end)
	end
end

-- ---- 1 もん ---------------------------------------------------------------------------------------
-- もんだいの 文（上＝ひらがな、下＝英語）。こえが 出ないので「きいてね」は 使わない。
local PROMPT = {
	show = { "みて おぼえよう。", "Look and learn." },
	chant = { "うたの ことばを よんで みよう。", "Read the little song." },
	name = { "おなじ もじは どれ？", "Which is the same letter?" },
	sound = { "この えの ことばは、どの もじで はじまる？", "Which letter does it start with?" },
	soundEnd = { "この えの ことばは、どの もじで おわる？", "Which letter does it end with?" },
	picture = { "この もじで はじまる えは どれ？", "Which picture starts with this letter?" },
	pictureEnd = { "この もじで おわる えは どれ？", "Which picture ends with this letter?" },
	rule = { "きまりを みて おぼえよう。", "Look at the rule." },
	blend = { "おとを つなげて よもう。どの え かな？", "Put the sounds together. Which picture?" },
	pair = { "この えの ことばに ある ふたつの もじは どれ？", "Which two letters are in this word?" },
	word = { "この えの ことば。ただしい つづりは どれ？", "Which spelling is right?" },
	spell = { "もじの つみきを ならべて、ことばを つくろう。", "Put the blocks in order." },
}

local function imageOf(q, word)
	local images = q.images
	if type(images) ~= "table" then return "" end
	local v = images[word]
	return type(v) == "string" and v or ""
end
local function tiles(parent, parts, props)
	local f = row(parent, props, 10)
	for i, p in ipairs(parts) do
		letterTile(f, tostring(p), TILE_COLORS[((i - 1) % #TILE_COLORS) + 1], { LayoutOrder = i, Size = UDim2.fromOffset(110, 110) })
	end
	return f
end

local function send(given)
	if state.busy or state.result then return end
	state.busy = true
	local r = Answer:InvokeServer(given)
	state.busy = false
	if type(r) ~= "table" or r.error then
		clear()
		label(body, (type(r) == "table" and r.error) or "いまは つながらないよ。すこし まってから もう いちど。", 26, { Size = UDim2.new(1, 0, 0.5, 0), Position = UDim2.fromScale(0, 0.1) })
		button(body, "もどる", BLUE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromScale(0.5, 0.7) }).MouseButton1Click:Connect(function() showHome() end)
		return
	end
	if type(r.state) == "table" then state.st = r.state end
	if r.teach then
		-- おしえる 画面（show・chant・rule）は こたえあわせ なしで つぎへ。
		if r.over then showSummary(r.summary) return end
		state.q = r.next
		state.result = nil
		state.picked = nil
		state.rowIds = {}
		showQuestion()
		return
	end
	state.result = r
	showQuestion()
end
local function goNext()
	local r = state.result
	if not r then return end
	if r.over then showSummary(r.summary) return end
	state.q = r.next
	state.result = nil
	state.picked = nil
	state.rowIds = {}
	showQuestion()
end

-- えらぶ もの 1 つ（もじ・絵・つづり）。こたえた あとは 正解＝みどり、えらんだ まちがい＝あか。
local function choice(parent, q, c, order)
	local r = state.result
	local color = WHITE
	if r then
		if c == r.answer then color = GREEN elseif c == state.picked then color = RED else color = GREY end
	end
	local b = make("TextButton", { LayoutOrder = order, Text = "", AutoButtonColor = not r, BackgroundColor3 = color, BorderSizePixel = 0, Size = UDim2.fromOffset(230, 230), Active = not r }, parent)
	round(b, 26)
	make("UIStroke", { Color = (r and c == r.answer) and GREEN or Color3.fromRGB(232, 214, 160), Thickness = 5 }, b)
	if q.kind == "picture" or q.kind == "blend" then
		picture(b, imageOf(q, c), { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(196, 196) })
	elseif q.kind == "name" then
		-- 大きい もじを 見て 小さい もじを えらぶ（クラスが 大文字だけ なら 大文字）。
		letterTile(b, letterText(c, caseFirst == "upper" and "upper" or "lower"), hue(c), { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(190, 190) })
	elseif q.kind == "sound" then
		letterTile(b, letterText(c), hue(c), { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(190, 190) })
	else
		make("TextLabel", { BackgroundTransparency = 1, Size = UDim2.new(1, -20, 1, -20), Position = UDim2.fromOffset(10, 10), Text = tostring(c), TextScaled = true, Font = LETTER_FONT, TextColor3 = (r and color ~= WHITE and color ~= GREY) and WHITE or INK }, b)
		make("UITextSizeConstraint", { MaxTextSize = 64, MinTextSize = 22 }, b:FindFirstChildOfClass("TextLabel"))
	end
	if not r then
		b.MouseButton1Click:Connect(function()
			if state.busy or state.result then return end
			state.picked = c
			send({ choice = c })
		end)
	end
	return b
end

showQuestion = function()
	clear()
	local q = state.q
	if type(q) ~= "table" then showHome() return end
	local r = state.result
	setProgress()
	label(body, tostring(q.n) .. " / " .. tostring(q.of), 18, { Size = UDim2.new(1, 0, 0, 24), TextColor3 = Color3.fromRGB(120, 110, 90) })
	local isEnd = q["end"] == true and (q.kind == "sound" or q.kind == "picture")
	local p = PROMPT[isEnd and (q.kind .. "End") or q.kind] or PROMPT.show
	label(body, p[1], 26, { Position = UDim2.fromOffset(0, 26), Size = UDim2.new(1, 0, 0, 36) })
	label(body, p[2], 16, { Position = UDim2.fromOffset(0, 62), Size = UDim2.new(1, 0, 0, 22), Font = Enum.Font.Gotham, TextColor3 = Color3.fromRGB(110, 120, 140) })
	local stage = make("Frame", { BackgroundTransparency = 1, Position = UDim2.fromOffset(0, 92), Size = UDim2.new(1, 0, 1, -176) }, body)
	local foot = row(body, { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 0, 1, -4), Size = UDim2.new(1, 0, 0, 72) }, 18)

	if q.kind == "show" then
		local f = row(stage, { Size = UDim2.fromScale(1, 1) }, 30)
		letterTile(f, letterText(tostring(q.letter)), hue(tostring(q.letter)), { LayoutOrder = 1, Size = UDim2.fromOffset(240, 240) })
		local card = make("Frame", { LayoutOrder = 2, BackgroundTransparency = 1, Size = UDim2.fromOffset(240, 290) }, f)
		picture(card, imageOf(q, q.word), { Size = UDim2.fromOffset(240, 240) })
		label(card, tostring(q.word), 34, { Position = UDim2.fromOffset(0, 244), Font = LETTER_FONT })
		button(foot, "つぎへ →", GREEN, {}).MouseButton1Click:Connect(function() send({ seen = true }) end)
	elseif q.kind == "chant" then
		local list = make("Frame", { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) }, stage)
		make("UIListLayout", { FillDirection = Enum.FillDirection.Vertical, HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center, Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, list)
		for i, ln in ipairs(q.lines or {}) do
			local line = row(list, { LayoutOrder = i, Size = UDim2.new(1, 0, 0, 110) }, 18)
			picture(line, imageOf(q, ln.word), { LayoutOrder = 1, Size = UDim2.fromOffset(104, 104) })
			local text = ln.text
			if type(ln.parts) == "table" then text = table.concat(ln.parts, " · ") .. "   " .. tostring(ln.word) end
			label(line, tostring(text), 40, { LayoutOrder = 2, Size = UDim2.fromOffset(520, 104), Font = LETTER_FONT, TextXAlignment = Enum.TextXAlignment.Left })
		end
		button(foot, "つぎへ →", GREEN, {}).MouseButton1Click:Connect(function() send({ seen = true }) end)
	elseif q.kind == "rule" then
		local f = row(stage, { Size = UDim2.fromScale(1, 1) }, 30)
		local left = make("Frame", { LayoutOrder = 1, BackgroundTransparency = 1, Size = UDim2.fromOffset(420, 290) }, f)
		letterTile(left, tostring(q.rule), BLUE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 0), Size = UDim2.fromOffset(200, 130) })
		tiles(left, q.parts or {}, { Position = UDim2.fromOffset(0, 150), Size = UDim2.new(1, 0, 0, 120) })
		local card = make("Frame", { LayoutOrder = 2, BackgroundTransparency = 1, Size = UDim2.fromOffset(240, 290) }, f)
		picture(card, imageOf(q, q.word), { Size = UDim2.fromOffset(240, 240) })
		label(card, tostring(q.word), 34, { Position = UDim2.fromOffset(0, 244), Font = LETTER_FONT })
		button(foot, "つぎへ →", GREEN, {}).MouseButton1Click:Connect(function() send({ seen = true }) end)
	elseif q.kind == "spell" then
		picture(stage, imageOf(q, q.word), { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 0), Size = UDim2.fromOffset(170, 170) })
		local byId = {}
		for _, b in ipairs(q.blocks or {}) do byId[b.id] = b.t end
		local used = {}
		for _, id in ipairs(state.rowIds) do used[id] = true end
		-- ならべた 列（おすと もどる）。こたえた あとは 正解＝みどり、まちがい＝あか。
		local line = row(stage, { Position = UDim2.fromOffset(0, 182), Size = UDim2.new(1, 0, 0, 100) }, 10)
		for i = 1, #(q.blocks or {}) do
			local id = state.rowIds[i]
			if id then
				local color = BLUE
				if r then color = r.correct and GREEN or RED end
				local b = button(line, tostring(byId[id] or "?"), color, { LayoutOrder = i, Size = UDim2.fromOffset(92, 92), TextSize = 44, Font = LETTER_FONT, Active = not r })
				if not r then
					b.MouseButton1Click:Connect(function()
						local keep = {}
						for _, x in ipairs(state.rowIds) do if x ~= id then table.insert(keep, x) end end
						state.rowIds = keep
						showQuestion()
					end)
				end
			else
				local slot = make("Frame", { LayoutOrder = i, Size = UDim2.fromOffset(92, 92), BackgroundColor3 = GREY, BorderSizePixel = 0 }, line)
				round(slot, 16)
			end
		end
		if r and not r.correct and type(r.parts) == "table" then
			-- ただしい ならび。
			local ans = row(stage, { Position = UDim2.fromOffset(0, 290), Size = UDim2.new(1, 0, 0, 84) }, 10)
			for i, p in ipairs(r.parts) do button(ans, tostring(p), GREEN, { LayoutOrder = i, Size = UDim2.fromOffset(78, 78), TextSize = 38, Font = LETTER_FONT, Active = false, AutoButtonColor = false }) end
		elseif not r then
			local tray = row(stage, { Position = UDim2.fromOffset(0, 296), Size = UDim2.new(1, 0, 0, 100) }, 10)
			for i, b in ipairs(q.blocks or {}) do
				if not used[b.id] then
					local id = b.id
					button(tray, tostring(b.t), YELLOW, { LayoutOrder = i, Size = UDim2.fromOffset(92, 92), TextSize = 44, Font = LETTER_FONT, TextColor3 = INK }).MouseButton1Click:Connect(function()
						if state.busy or state.result then return end
						table.insert(state.rowIds, id)
						showQuestion()
					end)
				end
			end
			if #state.rowIds == #(q.blocks or {}) then
				button(foot, "できた", GREEN, {}).MouseButton1Click:Connect(function()
					local order = {}
					for i, x in ipairs(state.rowIds) do order[i] = x end
					send({ order = order })
				end)
			end
		end
	else
		-- えらぶ もんだい（name・sound・picture・blend・pair・word）。上＝見る もの、下＝えらぶ もの。
		local top = row(stage, { Size = UDim2.new(1, 0, 0, 170) }, 14)
		if q.kind == "name" then
			letterTile(top, string.upper(tostring(q.say)), hue(tostring(q.say)), { Size = UDim2.fromOffset(160, 160) })
		elseif q.kind == "sound" then
			picture(top, imageOf(q, q.say), { Size = UDim2.fromOffset(160, 160) })
		elseif q.kind == "picture" then
			letterTile(top, letterText(tostring(q.letter)), hue(tostring(q.letter)), { Size = UDim2.fromOffset(160, 160) })
		elseif q.kind == "blend" then
			tiles(top, q.parts or {}, { Size = UDim2.fromOffset(520, 160) })
		else
			picture(top, imageOf(q, q.word), { Size = UDim2.fromOffset(160, 160) })
		end
		local choices = row(stage, { Position = UDim2.fromOffset(0, 180), Size = UDim2.new(1, 0, 0, 240) }, 22)
		for i, c in ipairs(q.choices or {}) do choice(choices, q, tostring(c), i) end
	end

	if r and not q.teach then
		label(foot, r.correct and "せいかい！" or "みどりが こたえだよ。", 26, { LayoutOrder = 1, Size = UDim2.fromOffset(330, 64), TextColor3 = r.correct and GREEN or RED })
		button(foot, r.over and "けっかを みる →" or "つぎへ →", GREEN, { LayoutOrder = 2, Size = UDim2.fromOffset(260, 64) }).MouseButton1Click:Connect(goNext)
	end
end

-- ---- けっか ---------------------------------------------------------------------------------------
showSummary = function(s)
	clear()
	state.q = nil
	state.result = nil
	setProgress()
	progressBar(body)
	local msg = "おしい！ もう いちど やって みよう。\nAlmost! Try once more."
	if type(s) == "table" then
		if s.mode == "place" then
			if type(s.placed) == "table" and s.placed.track == "elem" then msg = "もじは しって いるね！ ことばを よもう。\nYou know your letters!" else msg = "いいね。もじから はじめよう。\nLet us start with letters." end
		elseif type(s.advanced) == "table" and s.advanced.finished then msg = "ぜんぶ できたね！ すごい！\nYou did it all!"
		elseif type(s.advanced) == "table" and s.advanced.letter then msg = string.upper(tostring(s.advanced.letter)) .. " を おぼえたよ！\nYou learned a letter!"
		elseif type(s.advanced) == "table" and s.advanced.unit then msg = "あたらしい きまりが よめたよ！\nYou can read a new rule!"
		elseif s.mode == "review" then msg = "よく れんしゅう したね！\nNice practice!" end
	end
	label(body, msg, 30, { Position = UDim2.new(0, 0, 0, 90), Size = UDim2.new(1, 0, 0, 120) })
	if type(s) == "table" and (tonumber(s.of) or 0) > 0 then
		label(body, tostring(s.of) .. " もん ちゅう " .. tostring(s.right) .. " もん せいかい", 24, { Position = UDim2.new(0, 0, 0, 220), Size = UDim2.new(1, 0, 0, 40), TextColor3 = Color3.fromRGB(110, 120, 140) })
	end
	local acts = row(body, { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 0, 1, -8), Size = UDim2.new(1, 0, 0, 72) }, 18)
	local st = state.st
	if st and st.finished ~= true then
		button(acts, "▶ つづける", GREEN, { LayoutOrder = 1 }).MouseButton1Click:Connect(function() begin(false) end)
	end
	button(acts, "おわる", BLUE, { LayoutOrder = 2 }).MouseButton1Click:Connect(function() showHome() end)
end

-- ---- サーバーから ---------------------------------------------------------------------------------
local function shut()
	gui.Enabled = false
	state.q = nil
	state.result = nil
	Quit:FireServer()
end
close.MouseButton1Click:Connect(shut)

Show.OnClientEvent:Connect(function(m)
	if type(m) ~= "table" then return end
	gui.Enabled = true
	if m.error then
		clear()
		progress.Text = ""
		label(body, tostring(m.error), 26, { Size = UDim2.new(1, 0, 0.6, 0), Position = UDim2.fromScale(0, 0.1) })
		return
	end
	if type(m.state) == "table" then
		state.st = m.state
		showHome()
	end
end)
]=====])

-- ② HTTP（Web の サーバーと 話す）
local httpOk = pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 入口：「ABC と おと」の かんばん（タグ USpeakAbcBoard）。近づいて「あそぶ」を おすと ひらく。
local old = workspace:FindFirstChild("USpeakAbcBoard")
if old then old:Destroy() end
local model = Instance.new("Model")
model.Name = "USpeakAbcBoard"
local board = Instance.new("Part")
board.Name = "Board"
board.Anchored = true
board.Size = Vector3.new(14, 9, 1)
board.Position = Vector3.new(0, 5.5, -24)
board.Color = Color3.fromRGB(240, 180, 60)
board.Material = Enum.Material.SmoothPlastic
board.Parent = model
CollectionService:AddTag(board, "USpeakAbcBoard")
local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "あそぶ"
prompt.ObjectText = "ABC と おと"
prompt.HoldDuration = 0
prompt.MaxActivationDistance = 14
prompt.RequiresLineOfSight = false
prompt.Parent = board
local face = Instance.new("SurfaceGui")
face.Face = Enum.NormalId.Back
face.CanvasSize = Vector2.new(700, 450)
face.Parent = board
local title = Instance.new("TextLabel")
title.Size = UDim2.fromScale(1, 0.55)
title.BackgroundTransparency = 1
title.Text = "A B C"
title.TextScaled = true
title.Font = Enum.Font.FredokaOne
title.TextColor3 = Color3.new(1, 1, 1)
title.Parent = face
local sub = Instance.new("TextLabel")
sub.Size = UDim2.fromScale(1, 0.35)
sub.Position = UDim2.fromScale(0, 0.58)
sub.BackgroundTransparency = 1
sub.Text = "ABC と おと"
sub.TextScaled = true
sub.Font = Enum.Font.GothamBold
sub.TextColor3 = Color3.fromRGB(35, 50, 74)
sub.Parent = face
-- かんばんの 両がわの 色の つみき（かざり）。
local COLORS = { Color3.fromRGB(226, 87, 76), Color3.fromRGB(79, 168, 104), Color3.fromRGB(63, 134, 208) }
for i, c in ipairs(COLORS) do
	local b = Instance.new("Part")
	b.Name = "Block" .. i
	b.Anchored = true
	b.Size = Vector3.new(3, 3, 3)
	b.Position = Vector3.new((i - 2) * 4, 1.5, -20)
	b.Color = c
	b.Material = Enum.Material.SmoothPlastic
	b.Parent = model
end
model.Parent = workspace

-- ④ のこりの 手作業
print("✅ できました：「ABC と おと」の スクリプト 2 つ と 入口（かんばん）を 入れました。" .. (httpOk and "HTTP も オンに しました。" or ""))
if not httpOk then warn("⚠ HTTP を オンに できませんでした：Game Settings → Security → Allow HTTP Requests を オンに してください。") end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
warn("⚠ 絵カードは Web の 管理ページ /admin/roblox-books で 上げます。Roblox の 審査が おわるまで 画面は「えを じゅんびちゅう」と 出ます。")
print("さいごに File → Publish to Roblox で 公開してください。")
