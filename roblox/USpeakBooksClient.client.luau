--!strict
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
