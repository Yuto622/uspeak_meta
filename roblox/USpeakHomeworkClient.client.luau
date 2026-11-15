-- U-Speak 宿題プレース（Roblox 側・画面）— 宿題の 一覧と、1 問ずつ メインワールドと 同じ 問題の 画面（USpeakFormatUI）で とく。
-- 置き場所：宿題プレースの StarterPlayerScripts（LocalScript）。サーバーは USpeakHomework.server.luau。
-- 画面に 出すのは サーバーから 来た 答えの ない 形だけ。正解・答えは サーバーが 決めた ものだけを 見せる。

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TeleportService = game:GetService("TeleportService")
local TweenService = game:GetService("TweenService")

local MAIN_PLACE = 139338411931177
local plr = Players.LocalPlayer
local RF = ReplicatedStorage:WaitForChild("USpeakHW")
local OpenEv = ReplicatedStorage:WaitForChild("USpeakHWOpen")
local FormatUI = require(ReplicatedStorage:WaitForChild("USpeakFormatUI"))

local GREEN = Color3.fromRGB(27, 58, 47)
local ORANGE = Color3.fromRGB(226, 122, 45)
local CREAM = Color3.fromRGB(255, 251, 245)
local GOLD = Color3.fromRGB(255, 208, 70)
local GRAY = Color3.fromRGB(140, 130, 118)
local OKC = Color3.fromRGB(70, 170, 110)
local NGC = Color3.fromRGB(220, 80, 80)
local WHITE = Color3.new(1, 1, 1)

local function call(...)
	local ok, r = pcall(function(...) return RF:InvokeServer(...) end, ...)
	if not ok or type(r) ~= "table" then return { ok = false, error = "network" } end
	return r
end

-- ---- 土台 -----------------------------------------------------------------------------------------
local sg = Instance.new("ScreenGui")
sg.Name = "USpeakHomeworkUI" sg.ResetOnSpawn = false sg.DisplayOrder = 120 sg.IgnoreGuiInset = true
sg.Parent = plr:WaitForChild("PlayerGui")

local function corner(i, r) local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r or 12) c.Parent = i return c end
local function stroke(i, col, th) local s = Instance.new("UIStroke") s.Color = col s.Thickness = th or 2 s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border s.Parent = i return s end
local function text(parent, str, size, col, props)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1 t.Text = str t.TextSize = size t.TextColor3 = col t.Font = Enum.Font.FredokaOne
	t.TextWrapped = true t.AutoLocalize = false
	for k, v in pairs(props or {}) do t[k] = v end
	t.Parent = parent
	return t
end
local function btn(parent, str, bg, fg, props)
	local b = Instance.new("TextButton")
	b.Text = str b.BackgroundColor3 = bg b.TextColor3 = fg or WHITE b.Font = Enum.Font.FredokaOne b.TextSize = 18 b.AutoLocalize = false b.AutoButtonColor = true
	for k, v in pairs(props or {}) do b[k] = v end
	corner(b, 12)
	b.Parent = parent
	return b
end

-- 上の まんなかの 小さな ボタン（いつでも 一覧を ひらける）
local openBtn = btn(sg, "📚 しゅくだい", ORANGE, WHITE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10), Size = UDim2.fromOffset(150, 40), TextSize = 18 })
stroke(openBtn, WHITE, 2)

-- 一覧の パネル
local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 0.5) panel.Position = UDim2.fromScale(0.5, 0.5) panel.Size = UDim2.new(1, -24, 1, -80)
panel.BackgroundColor3 = CREAM panel.Visible = false panel.Parent = sg
corner(panel, 22) stroke(panel, ORANGE, 4)
local fit = Instance.new("UISizeConstraint") fit.MaxSize = Vector2.new(620, 560) fit.Parent = panel
local head = Instance.new("Frame") head.Size = UDim2.new(1, 0, 0, 56) head.BackgroundColor3 = GREEN head.BorderSizePixel = 0 head.Parent = panel
corner(head, 22)
local headFix = Instance.new("Frame") headFix.Position = UDim2.new(0, 0, 1, -20) headFix.Size = UDim2.new(1, 0, 0, 20) headFix.BackgroundColor3 = GREEN headFix.BorderSizePixel = 0 headFix.Parent = head
local title = text(head, "📚 HOMEWORK  しゅくだい", 22, WHITE, { Position = UDim2.new(0, 18, 0, 0), Size = UDim2.new(1, -80, 1, 0), TextXAlignment = Enum.TextXAlignment.Left })
local closeB = btn(head, "✕", ORANGE, WHITE, { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -12, 0.5, 0), Size = UDim2.fromOffset(36, 36) })
local note = text(panel, "", 15, GRAY, { Position = UDim2.new(0, 18, 0, 62), Size = UDim2.new(1, -36, 0, 22), TextXAlignment = Enum.TextXAlignment.Left, Font = Enum.Font.GothamBold })
local list = Instance.new("ScrollingFrame")
list.Position = UDim2.new(0, 14, 0, 90) list.Size = UDim2.new(1, -28, 1, -150) list.BackgroundTransparency = 1 list.BorderSizePixel = 0
list.ScrollBarThickness = 6 list.AutomaticCanvasSize = Enum.AutomaticSize.Y list.CanvasSize = UDim2.new() list.Parent = panel
local lay = Instance.new("UIListLayout") lay.Padding = UDim.new(0, 10) lay.SortOrder = Enum.SortOrder.LayoutOrder lay.Parent = list
local pad = Instance.new("UIPadding") pad.PaddingTop = UDim.new(0, 4) pad.PaddingBottom = UDim.new(0, 8) pad.PaddingLeft = UDim.new(0, 2) pad.PaddingRight = UDim.new(0, 8) pad.Parent = list
local homeB = btn(panel, "🏠 メインワールドへ もどる", GREEN, WHITE, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -12), Size = UDim2.fromOffset(260, 42) })

-- 「3 / 10」の 帯（問題の 画面の 上）
local bar = text(sg, "", 18, WHITE, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 56), Size = UDim2.fromOffset(360, 34),
	BackgroundTransparency = 0, BackgroundColor3 = GREEN, Visible = false, ZIndex = 5 })
corner(bar, 17)
local barGui = Instance.new("ScreenGui") barGui.Name = "USpeakHomeworkBar" barGui.ResetOnSpawn = false barGui.DisplayOrder = 130 barGui.IgnoreGuiInset = true barGui.Parent = sg.Parent
bar.Parent = barGui

local busy = false
local function clearList() for _, c in ipairs(list:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end end
local function dueText(due)
	local m, d = tostring(due or ""):match("^%d+%-(%d+)%-(%d+)$")
	return m and ("しめきり " .. tonumber(m) .. "/" .. tonumber(d)) or "しめきり なし"
end

local openList
local startRun

local function card(item, order)
	local c = Instance.new("Frame")
	c.Size = UDim2.new(1, 0, 0, 96) c.BackgroundColor3 = WHITE c.LayoutOrder = order c.Parent = list
	corner(c, 16)
	local st = stroke(c, item.done and OKC or (item.overdue and NGC or Color3.fromRGB(230, 222, 208)), item.done and 3 or 2)
	text(c, item.title or "しゅくだい", 20, GREEN, { Position = UDim2.new(0, 14, 0, 8), Size = UDim2.new(1, -170, 0, 26), TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd })
	local chip = item.done and ("✅ おわり  " .. tostring(item.score or 0) .. "てん") or (item.overdue and "⚠ しめきり すぎ" or ((item.answered or 0) > 0 and "⏳ とちゅう" or "🆕 まだ"))
	text(c, chip .. "  ・  " .. dueText(item.due), 14, item.overdue and NGC or GRAY, { Position = UDim2.new(0, 14, 0, 36), Size = UDim2.new(1, -170, 0, 20), TextXAlignment = Enum.TextXAlignment.Left, Font = Enum.Font.GothamBold })
	-- すすみぐあいの 棒
	local track = Instance.new("Frame") track.Position = UDim2.new(0, 14, 0, 66) track.Size = UDim2.new(1, -170, 0, 14) track.BackgroundColor3 = Color3.fromRGB(238, 232, 222) track.Parent = c
	corner(track, 7)
	local total = math.max(1, item.total or 1)
	local fill = Instance.new("Frame") fill.Size = UDim2.new(math.clamp((item.answered or 0) / total, 0, 1), 0, 1, 0) fill.BackgroundColor3 = item.done and OKC or ORANGE fill.Parent = track
	corner(fill, 7)
	text(c, ("%d / %d"):format(item.answered or 0, item.total or 0), 13, GRAY, { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -160, 0, 50), Size = UDim2.fromOffset(80, 16), TextXAlignment = Enum.TextXAlignment.Right, Font = Enum.Font.GothamBold })
	local redo = item.done and (item.correct or 0) < (item.total or 0)
	local label = item.done and (redo and "× を やりなおす" or "もう いちど") or ((item.answered or 0) > 0 and "つづきを とく" or "とく ▶")
	local b = btn(c, label, item.done and GREEN or ORANGE, WHITE, { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -12, 0.5, 0), Size = UDim2.fromOffset(140, 52), TextSize = 17, TextWrapped = true })
	b.Activated:Connect(function() startRun(item.id, item.done) end)
	if item.done and not redo then b.Visible = false end
end

openList = function()
	if busy then return end
	busy = true
	panel.Visible = true openBtn.Visible = false
	clearList()
	note.Text = "よみこみちゅう…"
	local r = call("list")
	busy = false
	if not r.ok then note.Text = "つながりません。すこし まって もう いちど ひらいてね" return end
	if not r.child then note.Text = "まだ クラスと つながっていません。先生に Roblox の 名前「" .. plr.Name .. "」を つたえてね" return end
	local items = r.items or {}
	local todo = 0
	for _, it in ipairs(items) do if not it.done then todo += 1 end end
	note.Text = (#items == 0) and "いまは しゅくだいが ないよ 🎉" or ("のこり " .. todo .. " こ" .. ((r.coins or 0) > 0 and ("  ・  🪙 +" .. r.coins .. " もらったよ") or ""))
	-- まだ → とちゅう → おわり の じゅん
	table.sort(items, function(a, b)
		local ra = a.done and 2 or ((a.answered or 0) > 0 and 0 or 1)
		local rb = b.done and 2 or ((b.answered or 0) > 0 and 0 or 1)
		if ra ~= rb then return ra < rb end
		return tostring(a.due or "9999") < tostring(b.due or "9999")
	end)
	for i, it in ipairs(items) do card(it, i) end
end
local function closeList() panel.Visible = false openBtn.Visible = true end

-- ---- 1 問ずつ ---------------------------------------------------------------------------------------
local current = nil   -- { q, index, total, title }
local showQuestion

local function showDone(r)
	bar.Visible = false
	FormatUI.close()
	panel.Visible = true openBtn.Visible = false
	clearList()
	local box = Instance.new("Frame") box.Size = UDim2.new(1, 0, 0, 200) box.BackgroundColor3 = WHITE box.Parent = list
	corner(box, 18) stroke(box, GOLD, 3)
	text(box, "🎉 おつかれさま！", 30, GREEN, { Position = UDim2.new(0, 0, 0, 16), Size = UDim2.new(1, 0, 0, 40) })
	text(box, (r.title or "しゅくだい") .. "  ・  " .. tostring(r.correct or 0) .. " / " .. tostring(r.total or 0) .. " せいかい", 18, GRAY, { Position = UDim2.new(0, 10, 0, 64), Size = UDim2.new(1, -20, 0, 26), Font = Enum.Font.GothamBold })
	if (r.coins or 0) > 0 then
		text(box, "🪙 +" .. r.coins .. "（メインワールドに もどると ふえるよ）", 18, ORANGE, { Position = UDim2.new(0, 10, 0, 100), Size = UDim2.new(1, -20, 0, 26) })
	end
	local back = btn(box, "しゅくだいの リストへ", ORANGE, WHITE, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -14), Size = UDim2.fromOffset(240, 46) })
	back.Activated:Connect(openList)
	note.Text = ""
end

local function onSubmit(ans)
	if not current then return end
	if ans == nil or ans == "__cancel__" then
		call("answer", "__cancel__")
		current = nil bar.Visible = false
		openList()
		return
	end
	local r = call("answer", ans)
	if not r.ok then
		FormatUI.showResult(false, "つながりません", nil, true)
		task.wait(1.5)
		current = nil bar.Visible = false FormatUI.close() openList()
		return
	end
	if not r.final then
		-- まちがい 1 回目：もう いちど（メインワールドと 同じ）
		FormatUI.showResult(false, nil, nil, false)
		task.wait(1.4)
		if current then FormatUI.open(current.q, onSubmit) end
		return
	end
	FormatUI.showResult(r.correct == true, r.answerText, r.extra, true)
	if r.saveError then bar.Text = "⚠ きろくが できませんでした" end
	task.wait(r.correct and 1.6 or 2.8)
	local n = call("next")
	if n.ok and n.q then showQuestion(n) else current = nil showDone(n) end
end

showQuestion = function(r)
	current = { q = r.q, index = r.index, total = r.total, title = r.title }
	bar.Text = "📚 " .. tostring(r.title or "") .. "   " .. tostring(r.index or 1) .. " / " .. tostring(r.total or 1) .. (r.redo and "  （やりなおし）" or "")
	bar.Visible = true
	FormatUI.open(r.q, onSubmit)
end

startRun = function(aid, redo)
	if busy then return end
	busy = true
	note.Text = "よみこみちゅう…"
	local r = call("start", aid, redo == true)
	busy = false
	if not r.ok then note.Text = "ひらけませんでした。もう いちど ためしてね" return end
	if r.q then
		panel.Visible = false openBtn.Visible = false
		showQuestion(r)
	else
		showDone(r)
	end
end

openBtn.Activated:Connect(openList)
OpenEv.OnClientEvent:Connect(function() if not current then openList() end end)
closeB.Activated:Connect(closeList)
homeB.Activated:Connect(function()
	homeB.Text = "いどう ちゅう…"
	local ok = pcall(function() TeleportService:Teleport(MAIN_PLACE, plr) end)
	if not ok then homeB.Text = "🏠 メインワールドへ もどる" end
end)

print("[HomeworkUI] v1 loaded ✅")
