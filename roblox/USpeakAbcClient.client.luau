-- U-Speak「ABC と おと」— Roblox 側・画面。USpeakAbc.server.luau から 来た もんだいを 1 画面 1 問で 見せる。
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
	if type(image) == "string" and image ~= "" then
		make("ImageLabel", { BackgroundTransparency = 1, Image = image, ScaleType = Enum.ScaleType.Fit, Size = UDim2.fromScale(1, 1) }, holder)
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
