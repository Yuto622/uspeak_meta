-- ============================================================
-- 📚 U-Speak 宿題プレース：一発 セットアップ（宿題プレースを Studio で ひらき、表示 → コマンドバー に まるごと はって Enter）
--   scripts/make-roblox-homework-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
--   ① メインワールドと 同じ 問題の 画面（USpeakFormatUI ＋ えらぶ）② 宿題の サーバーと 画面 ③ HTTP オン
--   ④ しゅくだいの へや（看板・つくえ 6 こ・スタート地点）
--   宿題は Web で 先生が クラスに くばった もの。とちゅうまでの すすみぐあいも ごほうびも Web と 同じ。
-- ============================================================
local RunService = game:GetService("RunService")
if not RunService:IsEdit() then warn("⚠ テストプレイを停止して、編集モードのコマンドバーで実行してください") return end
if game.PlaceId == 139338411931177 then warn("⚠ ここは メインワールドです。宿題プレースを ひらいて 実行してください（何も変更していません）") return end
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

-- ① ② スクリプト
put(ReplicatedStorage, "ModuleScript", "USpeakFormatUI", [=====[-- ============================================================
-- USpeakFormatUI：6形式の問題画面と判定（ReplicatedStorage のモジュール）
--   形式：order（ならべかえ）/ fill（あなうめ）/ type（タイピング）/ match（せんつなぎ）/ listen（きいて えらぶ）/ spell（つづり）
--         ＋ mc（えらぶ・4択）… 宿題プレースで 足した 形（Web の 宿題の「えらぶ」と 同じ。ほかの 6 形式は メインワールドと 同じ）
--   もとは メインワールドの USpeakFormatUI（形式画面 修正v5）。roblox/USpeakFormatUI.luau が 正本。
--   M.public(fmt)  … 端末に見せてよい部分だけ
--   M.check(fmt, ans) … 判定（サーバーでも端末でも同じ）
--   M.open(payload, onSubmit) / M.showResult(ok, answerText) / M.close()  … 端末だけ
-- ============================================================
local M = {}
local RunService = game:GetService("RunService")

-- ============================================================
-- 共通（サーバー・端末 両方で使う）
-- ============================================================
function M.shuffle(t, rng)
	rng = rng or Random.new()
	local a = table.clone(t)
	for i = #a, 2, -1 do local j = rng:NextInteger(1, i) a[i], a[j] = a[j], a[i] end
	return a
end
function M.public(fmt)
	local p = {}
	for k, v in pairs(fmt) do if k ~= "secret" then p[k] = v end end
	return p
end
function M.check(fmt, ans)
	local s = fmt.secret or {}
	local t = fmt.type
	if t == "order" or t == "spell" then
		if type(ans) ~= "table" or #ans ~= #s.order then return false end
		-- 並びを「文字列」にして比べる（同じ文字が2つあっても正しく判定）
		local textOf = {}
		for _, it in ipairs(fmt.items or {}) do textOf[it.id] = it.t end
		local got, want = {}, {}
		for i, id in ipairs(ans) do got[i] = textOf[id] or "?" end
		for i, id in ipairs(s.order) do want[i] = textOf[id] or "?" end
		return table.concat(got, "\1") == table.concat(want, "\1")
	elseif t == "fill" then
		if type(ans) ~= "table" then return false end
		for i, w in ipairs(s.answers) do
			local chip = ans[i]
			if type(chip) ~= "string" or s.chipWord[chip] ~= w then return false end
		end
		return true
	elseif t == "type" then
		return type(ans) == "string" and ans:lower():gsub("%s+", "") == tostring(s.answer):lower():gsub("%s+", "")
	elseif t == "match" then
		if type(ans) ~= "table" then return false end
		local n = 0
		for l, r in pairs(ans) do
			if type(l) ~= "string" or s.pairs[l] ~= r then return false end
			n = n + 1
		end
		return n == s.count
	elseif t == "listen" or t == "mc" then
		return ans == s.id
	end
	return false
end
function M.answerText(fmt)
	local s = fmt.secret or {}
	if fmt.type == "type" or fmt.type == "spell" then return tostring(s.answer or "") end
	if fmt.type == "fill" then return table.concat(s.answers or {}, " / ") end
	if fmt.type == "order" then return tostring(s.sentence or "") end
	if fmt.type == "listen" or fmt.type == "mc" then return tostring(s.word or "") end
	if fmt.type == "match" then return "" end
	return ""
end

-- ============================================================
-- 問題の組み立て（サーバーでも端末でも）
-- ============================================================
local function newId(prefix, i) return prefix .. i end
-- 穴埋め：tokens（"_" が空欄）＋ 答え（空欄の順）＋ まちがい選択肢
function M.buildFill(tokens, answers, extras, jp, rng)
	local words = {}
	for _, w in ipairs(answers) do table.insert(words, w) end
	for _, w in ipairs(extras) do table.insert(words, w) end
	words = M.shuffle(words, rng)
	local bank, chipWord = {}, {}
	for i, w in ipairs(words) do bank[i] = { id = newId("c", i), w = w } chipWord[bank[i].id] = w end
	local full = {}
	local bi = 0
	for _, t in ipairs(tokens) do if t == "_" then bi = bi + 1 table.insert(full, answers[bi]) else table.insert(full, t) end end
	return { type = "fill", jp = jp, tokens = tokens, bank = bank, blanks = #answers, speak = table.concat(full, " "),
		secret = { answers = answers, chipWord = chipWord } }
end
-- ならべかえ：正しい順の語
function M.buildOrder(words, en, jp, rng)
	local items = {}
	for i, t in ipairs(words) do items[i] = { id = newId("o", i), t = t } end
	local shuffled = M.shuffle(items, rng)
	local same = true
	for i, it in ipairs(shuffled) do if it.id ~= items[i].id then same = false break end end
	if same and #shuffled > 1 then shuffled[1], shuffled[#shuffled] = shuffled[#shuffled], shuffled[1] end
	local order = {}
	for i = 1, #items do order[i] = items[i].id end
	return { type = "order", en = en, jp = jp, items = shuffled, speak = table.concat(words, " "),
		secret = { order = order, sentence = table.concat(words, " ") } }
end
-- 答えの単語から番号を作る（ヒントを「同じ単語」にだけ結びつけるため。番号から単語は分からない）
function M.wordId(w)
	local h = 7
	for i = 1, #w do h = (h * 31 + w:byte(i) * i) % 1000000007 end
	return h
end
-- タイピング：ヒント（絵文字・日本語・文）、答えの単語
function M.buildType(answer, emoji, jp, prompt, ghost)
	return { type = "type", emoji = emoji or "", jp = jp or "", prompt = prompt or "", len = #answer, ghost = ghost and answer or nil, speak = answer,
		hid = M.wordId(tostring(answer):lower()),
		secret = { answer = answer } }
end
-- せんつなぎ：pairs = { {left, right}, ... }
function M.buildMatch(pairsList, jp, rng)
	local left, right, map = {}, {}, {}
	for i, p in ipairs(pairsList) do
		left[i] = { id = newId("L", i), t = p[1] }
		right[i] = { id = newId("R", i), t = p[2] }
		map["L" .. i] = "R" .. i
	end
	local ws = {}
	for _, p in ipairs(pairsList) do if tostring(p[1]):match("^[%a%s']+$") then table.insert(ws, p[1]) end end
	local L2 = M.shuffle(left, rng)
	local R2 = M.shuffle(right, rng)
	for _ = 1, 20 do -- 正解の線が2本以上「交差」するまで並べ替える（全部平行を避ける）
		local parallel = 0
		for i, l in ipairs(L2) do if R2[i] and map[l.id] == R2[i].id then parallel = parallel + 1 end end
		if parallel <= #L2 - 2 then break end
		R2 = M.shuffle(right, rng)
	end
	return { type = "match", jp = jp or "", left = L2, right = R2, speak = table.concat(ws, ", "),
		secret = { pairs = map, count = #pairsList } }
end
-- きいて えらぶ：word を読み上げ、4つ（ことば）から選ぶ。distractors = まちがいの候補
function M.buildListen(word, emoji, distractors, rng)
	local opts = { { id = "p1", t = emoji } }
	for i, e in ipairs(distractors) do table.insert(opts, { id = "p" .. (i + 1), t = e }) end
	return { type = "listen", options = M.shuffle(opts, rng), speak = word, secret = { id = "p1", word = word } }
end
-- えらぶ（4択）：prompt（問題）と 正解・まちがいの 候補。speak は 読み上げる 英語（なければ 読まない）
function M.buildChoice(prompt, correct, wrongs, jp, speak, rng)
	local opts = { { id = "p1", t = correct } }
	for i, w in ipairs(wrongs) do if i <= 3 then table.insert(opts, { id = "p" .. (i + 1), t = w }) end end
	return { type = "mc", prompt = prompt or "", jp = jp or "", options = M.shuffle(opts, rng), speak = speak or "", secret = { id = "p1", word = correct } }
end
-- つづり：単語の文字をバラす
function M.buildSpell(word, jp, emoji, rng)
	local letters = {}
	for i = 1, #word do letters[i] = { id = newId("s", i), t = word:sub(i, i) } end
	local shuffled = M.shuffle(letters, rng)
	local same = true
	for i, it in ipairs(shuffled) do if it.id ~= letters[i].id then same = false break end end
	if same and #shuffled > 1 then shuffled[1], shuffled[#shuffled] = shuffled[#shuffled], shuffled[1] end
	local order = {}
	for i = 1, #letters do order[i] = letters[i].id end
	return { type = "spell", jp = jp or "", emoji = emoji or "", items = shuffled, speak = word, secret = { order = order, answer = word } }
end

if RunService:IsServer() then return M end

-- ============================================================
-- ここから端末だけ（画面）
-- ============================================================
local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local TS = game:GetService("TweenService")
local SoundService = game:GetService("SoundService")
local plr = Players.LocalPlayer
local pg = plr:WaitForChild("PlayerGui")

local GREEN = Color3.fromRGB(27, 58, 47)
local ORANGE = Color3.fromRGB(226, 122, 45)
local CREAM = Color3.fromRGB(255, 251, 245)
local GOLD = Color3.fromRGB(255, 208, 70)
local GRAY = Color3.fromRGB(140, 130, 118)
local WHITE = Color3.new(1, 1, 1)
local OK = Color3.fromRGB(70, 170, 110)
local NG = Color3.fromRGB(220, 80, 80)
local LINEC = Color3.fromRGB(230, 222, 208)
local TITLES = {
	order = { "Put in Order", "ならべかえ", "🔢" }, fill = { "Fill the Blank", "あなうめ", "🧩" }, type = { "Type the Word", "タイピング", "⌨️" },
	match = { "Match", "せんつなぎ", "🔗" }, listen = { "Listen & Pick", "きいて えらぶ", "👂" }, spell = { "Spell It", "つづり", "🔤" },
	mc = { "Choose", "えらぶ", "✅" },
}
-- 形式ごとの色（ヘッダー・枠・ボタン）
local THEME = {
	order = { Color3.fromRGB(70, 130, 220), Color3.fromRGB(226, 238, 255) }, spell = { Color3.fromRGB(40, 160, 170), Color3.fromRGB(222, 245, 246) },
	fill = { Color3.fromRGB(226, 122, 45), Color3.fromRGB(255, 236, 214) }, type = { Color3.fromRGB(140, 80, 210), Color3.fromRGB(240, 230, 255) },
	match = { Color3.fromRGB(60, 160, 110), Color3.fromRGB(222, 245, 230) }, listen = { Color3.fromRGB(230, 100, 150), Color3.fromRGB(255, 228, 238) },
	mc = { Color3.fromRGB(27, 120, 90), Color3.fromRGB(222, 242, 234) },
}
local function themeOf(t) return (THEME[t] or { GREEN, CREAM })[1], (THEME[t] or { GREEN, CREAM })[2] end
-- 👆 手のお手本（最初だけ。触ったら消える）
local handTween = nil
local hand = nil
local function stopHand()
	if handTween then handTween:Cancel() handTween = nil end
	if hand then hand:Destroy() hand = nil end
end
local function showHand(parent, fromPos, toPos)
	stopHand()
	hand = Instance.new("TextLabel")
	hand.BackgroundTransparency = 1 hand.Text = "👆" hand.TextSize = 56 hand.Size = UDim2.fromOffset(60, 60) hand.Position = fromPos hand.ZIndex = 150 hand.AutoLocalize = false hand.Parent = parent
	local h = hand
	task.spawn(function()
		for _ = 1, 3 do
			if h ~= hand then return end
			h.Position = fromPos
			local tw = TS:Create(h, TweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Position = toPos })
			handTween = tw tw:Play() tw.Completed:Wait()
			if h ~= hand then return end
			task.wait(0.35)
		end
		if h == hand then stopHand() end
	end)
end

local function corner(i, r) local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, r or 12) c.Parent = i return c end
local function stroke(i, color, th, tr) local s = Instance.new("UIStroke") s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border s.Color = color s.Thickness = th or 2 s.Transparency = tr or 0 s.Parent = i return s end
local function label(parent, str, size, color, font, x, y, w, h, align)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1 t.Text = str t.TextSize = size t.TextColor3 = color t.Font = font or Enum.Font.FredokaOne
	t.Position = UDim2.new(0, x, 0, y) t.Size = UDim2.new(0, w, 0, h) t.TextXAlignment = align or Enum.TextXAlignment.Left
	t.AutoLocalize = false t.Parent = parent
	return t
end
local function button(parent, str, x, y, w, h, bg, fg, size)
	local b = Instance.new("TextButton")
	b.Position = UDim2.new(0, x, 0, y) b.Size = UDim2.new(0, w, 0, h) b.BackgroundColor3 = bg b.Text = str b.TextColor3 = fg or WHITE
	b.Font = Enum.Font.FredokaOne b.TextSize = size or 18 b.AutoButtonColor = true b.AutoLocalize = false b.Parent = parent
	corner(b, 14)
	return b
end
local function tween(o, t, props, style) local tw = TS:Create(o, TweenInfo.new(t, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props) tw:Play() return tw end
local function shake(o, power)
	task.spawn(function()
		local base = o.Position
		for i = 1, 6 do o.Position = base + UDim2.fromOffset((i % 2 == 0) and power or -power, 0) task.wait(0.04) end
		o.Position = base
	end)
end

-- 読み上げ
local ttsSeq = 0
function M.speak(text)
	if type(text) ~= "string" or text == "" then return end
	if not text:match("^[%w%s%p]+$") then return end -- 英語以外は読まない（TTS の InvalidText を防ぐ）
	ttsSeq = ttsSeq + 1
	local my = ttsSeq
	task.spawn(function()
		local out = SoundService:FindFirstChild("USpeakFormatTTSOut")
		if not out then out = Instance.new("AudioDeviceOutput") out.Name = "USpeakFormatTTSOut" out.Parent = SoundService end
		local t = Instance.new("AudioTextToSpeech")
		t.Text = text t.VoiceId = "1" t.Volume = 1
		pcall(function() t.Speed = 0.9 end)
		t.Parent = SoundService
		local w = Instance.new("Wire") w.SourceInstance = t w.SourceName = "Output" w.TargetInstance = out w.TargetName = "Input" w.Parent = t
		local ok = pcall(function() return t:LoadAsync() end)
		if my ~= ttsSeq then t:Destroy() return end
		if ok then
			local done = false
			t.Ended:Once(function() done = true end)
			t:Play()
			local t0 = os.clock()
			while not done and my == ttsSeq and os.clock() - t0 < 20 do task.wait(0.05) end
		end
		t:Destroy()
	end)
end

-- ドラッグ
local activeDrag = nil
local SCALE = { v = 1 }
local function startDrag(input, gui, data, cbs)
	if activeDrag then return end
	activeDrag = { input = input, gui = gui, data = data, cbs = cbs, grab = Vector2.new(input.Position.X, input.Position.Y) - gui.AbsolutePosition, moved = false, start = Vector2.new(input.Position.X, input.Position.Y) }
	gui.ZIndex = gui.ZIndex + 50
	if cbs.onStart then cbs.onStart(gui, data) end
end
local function dragPoint(input) return Vector2.new(input.Position.X, input.Position.Y) end
UIS.InputChanged:Connect(function(input)
	local d = activeDrag
	if not d then return end
	local mine = (input == d.input) or (d.input.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType == Enum.UserInputType.MouseMovement)
	if not mine then return end
	local p = dragPoint(input)
	if (p - d.start).Magnitude > 6 then d.moved = true end
	if d.cbs.onMove then d.cbs.onMove(d.gui, d.data, p, d.grab) end
end)
UIS.InputEnded:Connect(function(input)
	local d = activeDrag
	if not d then return end
	local mine = (input == d.input) or (d.input.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType == Enum.UserInputType.MouseButton1)
	if not mine then return end
	activeDrag = nil
	if d.gui.Parent then d.gui.ZIndex = d.gui.ZIndex - 50 end
	if d.cbs.onEnd then d.cbs.onEnd(d.gui, d.data, dragPoint(input), d.moved) end
end)
local function draggable(gui, data, cbs)
	gui.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then startDrag(input, gui, data, cbs) end
	end)
end
local function moveTo(gui, layer, p, grab) local lp = (p - layer.AbsolutePosition - grab) / SCALE.v gui.Position = UDim2.fromOffset(lp.X, lp.Y) end
local function centerOf(gui) return gui.AbsolutePosition + gui.AbsoluteSize / 2 end
local function inside(gui, p) local a, s = gui.AbsolutePosition, gui.AbsoluteSize return p.X >= a.X and p.X <= a.X + s.X and p.Y >= a.Y and p.Y <= a.Y + s.Y end

-- 操作ロック
local controls = nil
local function setControls(on)
	pcall(function()
		if not controls then controls = require(plr:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule")):GetControls() end
		if on then controls:Enable() else controls:Disable() end
	end)
end

-- 土台
local gui, panel, head, hIcon, hTitle, hJP, body, foot, spkBtn, hint, checkBtn, uiscale
local current = nil
local function ensureGui()
	if gui and gui.Parent then return end
	gui = Instance.new("ScreenGui")
	gui.Name = "USpeakFormatUI" gui.ResetOnSpawn = false gui.DisplayOrder = 125 gui.IgnoreGuiInset = true gui.Enabled = false gui.Parent = pg
	local dim = Instance.new("Frame") dim.Size = UDim2.fromScale(1, 1) dim.BackgroundColor3 = Color3.fromRGB(10, 20, 16) dim.BackgroundTransparency = 0.35 dim.BorderSizePixel = 0 dim.Parent = gui
	panel = Instance.new("Frame")
	panel.AnchorPoint = Vector2.new(0.5, 0.5) panel.Position = UDim2.fromScale(0.5, 0.5) panel.Size = UDim2.fromOffset(920, 600) panel.BackgroundColor3 = CREAM panel.BorderSizePixel = 0 panel.Parent = gui
	corner(panel, 26) stroke(panel, ORANGE, 4)
	uiscale = Instance.new("UIScale") uiscale.Parent = panel
	local function fit() local v = workspace.CurrentCamera.ViewportSize uiscale.Scale = math.max(0.5, math.min(1, v.X / 980, v.Y / 680)) SCALE.v = uiscale.Scale end
	fit()
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
	head = Instance.new("Frame") head.Size = UDim2.new(1, 0, 0, 68) head.BackgroundColor3 = GREEN head.BorderSizePixel = 0 head.Parent = panel corner(head, 26)
	local hf = Instance.new("Frame") hf.Position = UDim2.new(0, 0, 1, -26) hf.Size = UDim2.new(1, 0, 0, 26) hf.BackgroundColor3 = GREEN hf.BorderSizePixel = 0 hf.Parent = head
	hIcon = label(head, "", 30, WHITE, nil, 22, 14, 44, 40)
	hTitle = label(head, "", 24, WHITE, nil, 70, 10, 500, 30)
	hJP = label(head, "", 13, Color3.fromRGB(200, 215, 205), Enum.Font.GothamBold, 72, 40, 500, 18)
	local closeB = Instance.new("TextButton")
	closeB.Name = "CloseX" closeB.AnchorPoint = Vector2.new(1, 0.5) closeB.Position = UDim2.new(1, -16, 0.5, 0) closeB.Size = UDim2.fromOffset(40, 40)
	closeB.BackgroundColor3 = Color3.fromRGB(255, 255, 255) closeB.BackgroundTransparency = 0.85 closeB.Text = "" closeB.AutoButtonColor = true closeB.Parent = head
	corner(closeB, 20)
	for _, rot in ipairs({ 45, -45 }) do
		local bar = Instance.new("Frame") bar.AnchorPoint = Vector2.new(0.5, 0.5) bar.Position = UDim2.fromScale(0.5, 0.5) bar.Size = UDim2.fromOffset(18, 3) bar.BackgroundColor3 = WHITE bar.BorderSizePixel = 0 bar.Rotation = rot bar.Parent = closeB
	end
	label(head, "やめる", 9, Color3.fromRGB(200, 215, 205), Enum.Font.GothamBold, -70, 50, 56, 12, Enum.TextXAlignment.Center).Position = UDim2.new(1, -64, 0, 50)
	closeB.MouseButton1Click:Connect(function() M.cancel() end)
	body = Instance.new("Frame") body.Position = UDim2.new(0, 20, 0, 84) body.Size = UDim2.new(1, -40, 1, -170) body.BackgroundTransparency = 1 body.Parent = panel
	foot = Instance.new("Frame") foot.Position = UDim2.new(0, 20, 1, -78) foot.Size = UDim2.new(1, -40, 0, 62) foot.BackgroundTransparency = 1 foot.Parent = panel
	spkBtn = button(foot, "🔊", 0, 6, 62, 50, Color3.fromRGB(90, 150, 230), WHITE, 26)
	local bubble = Instance.new("Frame") bubble.Name = "Bubble" bubble.Position = UDim2.new(0, 76, 0, 2) bubble.Size = UDim2.fromOffset(520, 58) bubble.BackgroundColor3 = WHITE bubble.BorderSizePixel = 0 bubble.Parent = foot
	corner(bubble, 16) stroke(bubble, LINEC, 2)
	local tail = Instance.new("Frame") tail.AnchorPoint = Vector2.new(0.5, 0.5) tail.Position = UDim2.new(0, 0, 0.5, 0) tail.Size = UDim2.fromOffset(14, 14) tail.Rotation = 45 tail.BackgroundColor3 = WHITE tail.BorderSizePixel = 0 tail.Parent = bubble
	hint = label(bubble, "", 14, GREEN, Enum.Font.GothamBold, 14, 4, 496, 50) hint.TextWrapped = true hint.TextYAlignment = Enum.TextYAlignment.Center
	checkBtn = button(foot, "✅ Check / こたえあわせ", 620, 6, 260, 50, ORANGE, WHITE, 20)
	spkBtn.MouseButton1Click:Connect(function() if current and current.speak then M.speak(current.speak) end end)
	checkBtn.MouseButton1Click:Connect(function() if current and current.getAnswer and not current.locked then M.submit(current.getAnswer()) end end)
end

local function clearBody()
	if current and current.cleanup then pcall(current.cleanup) end
	for _, c in ipairs(body:GetChildren()) do c:Destroy() end
	activeDrag = nil
end
local function banner(text, color)
	local b = Instance.new("TextLabel")
	b.AnchorPoint = Vector2.new(0.5, 0.5) b.Position = UDim2.fromScale(0.5, 0.42) b.Size = UDim2.fromOffset(20, 20)
	b.BackgroundColor3 = color b.Text = text b.TextColor3 = WHITE b.Font = Enum.Font.FredokaOne b.TextScaled = true b.ZIndex = 200 b.AutoLocalize = false b.Parent = panel
	corner(b, 24) stroke(b, WHITE, 4)
	tween(b, 0.3, { Size = UDim2.fromOffset(460, 110) }, Enum.EasingStyle.Back)
	task.delay(1.1, function() if b.Parent then tween(b, 0.2, { Size = UDim2.fromOffset(20, 20), TextTransparency = 1 }) task.delay(0.25, function() b:Destroy() end) end end)
end
local function confetti(n)
	for i = 1, n do
		local s = Instance.new("TextLabel")
		s.AnchorPoint = Vector2.new(0.5, 0.5) s.Position = UDim2.fromScale(0.5, 0.45) s.Size = UDim2.fromOffset(28, 28)
		s.BackgroundTransparency = 1 s.Text = ({ "✨", "⭐", "🎉", "💫" })[math.random(4)] s.TextScaled = true s.ZIndex = 210 s.AutoLocalize = false s.Parent = panel
		local a = (i / n) * math.pi * 2
		local dist = 160 + math.random(0, 120)
		tween(s, 0.8 + math.random() * 0.4, { Position = UDim2.new(0.5, math.cos(a) * dist, 0.45, math.sin(a) * dist), TextTransparency = 1, Rotation = math.random(-180, 180) })
		task.delay(1.3, function() s:Destroy() end)
	end
end

local renderers = {}

-- ① ならべかえ／つづり（同じ描画・カードの大きさだけ違う）
local function renderOrderLike(q, isSpell)
	local col, soft = themeOf(isSpell and "spell" or "order")
	hint.Text = isSpell and "① カードを ひっぱる か、2まい タップで いれかえ\n② ことばが できたら ✅ Check" or "① カードを ひっぱる か、2まい タップで いれかえ\n② ただしい ぶんに なったら ✅ Check"
	if isSpell then
		label(body, q.emoji ~= "" and q.emoji or "🔤", 72, GREEN, nil, 0, 0, 880, 84, Enum.TextXAlignment.Center)
		label(body, q.jp or "", 20, GREEN, Enum.Font.GothamBold, 0, 86, 880, 26, Enum.TextXAlignment.Center)
	else
		label(body, q.jp or "", 18, GRAY, Enum.Font.GothamBold, 0, 6, 880, 24, Enum.TextXAlignment.Center)
		label(body, q.en or "", 30, GREEN, nil, 0, 30, 880, 40, Enum.TextXAlignment.Center)
	end
	local layer = Instance.new("Frame") layer.Position = UDim2.new(0, 0, 0, isSpell and 120 or 100) layer.Size = UDim2.new(1, 0, 0, 260) layer.BackgroundTransparency = 1 layer.Parent = body
	local n = #q.items
	local cw = isSpell and math.min(72, math.floor(840 / n) - 8) or math.min(150, math.floor(820 / n) - 12)
	local gap = isSpell and 8 or 12
	local total = n * cw + (n - 1) * gap
	local x0 = math.floor((880 - total) / 2)
	local ch = isSpell and 84 or 110
	local CY = 70
	local order, cards = {}, {}
	local function slotX(i) return x0 + (i - 1) * (cw + gap) end
	-- 番号つきの枠（カードの後ろ）
	for i = 1, n do
		local sl = Instance.new("Frame") sl.Position = UDim2.fromOffset(slotX(i) - 4, CY - 4) sl.Size = UDim2.fromOffset(cw + 8, ch + 8) sl.BackgroundColor3 = soft sl.BorderSizePixel = 0 sl.ZIndex = 1 sl.Parent = layer
		corner(sl, 20) stroke(sl, col, 2, 0.55)
		label(sl, tostring(i), 14, col, Enum.Font.GothamBold, 0, ch + 10, cw + 8, 18, Enum.TextXAlignment.Center)
	end
	label(layer, "→", 26, col, nil, 0, CY + ch + 30, 880, 30, Enum.TextXAlignment.Center).Text = (isSpell and "← よみかた の じゅんに →" or "← ぶんの あたまから おわりへ →")
	local function indexOf(id) for i, v in ipairs(order) do if v == id then return i end end return nil end
	local function layoutAll(except) for i, id in ipairs(order) do if id ~= except then tween(cards[id], 0.18, { Position = UDim2.fromOffset(slotX(i), CY) }) end end end
	local selected = nil
	local function setSel(id, on)
		local c = cards[id] if not c then return end
		for _, st in ipairs(c:GetChildren()) do if st:IsA("UIStroke") then st.Color = on and GOLD or col st.Thickness = on and 5 or 3 end end
		tween(c, 0.12, { Size = on and UDim2.fromOffset(cw + 8, ch + 8) or UDim2.fromOffset(cw, ch) })
	end
	for i, it in ipairs(q.items) do
		order[i] = it.id
		local c = Instance.new("TextButton")
		c.Position = UDim2.fromOffset(slotX(i), CY) c.Size = UDim2.fromOffset(cw, ch)
		c.BackgroundColor3 = WHITE c.Text = it.t c.TextColor3 = GREEN c.Font = Enum.Font.FredokaOne c.TextScaled = true
		c.AutoButtonColor = false c.AutoLocalize = false c.ZIndex = 5 c.Parent = layer
		corner(c, 18) stroke(c, col, 3)
		local pad = Instance.new("UIPadding") pad.PaddingLeft = UDim.new(0, 8) pad.PaddingRight = UDim.new(0, 8) pad.Parent = c
		cards[it.id] = c
		draggable(c, it.id, {
			onStart = function(g) stopHand() tween(g, 0.1, { Size = UDim2.fromOffset(cw + 10, ch + 10) }) end,
			onMove = function(g, id, p, grab)
				moveTo(g, layer, p, grab)
				local cx = (g.AbsolutePosition.X + g.AbsoluteSize.X / 2 - layer.AbsolutePosition.X) / SCALE.v
				local want = math.clamp(math.floor((cx - x0) / (cw + gap) + 0.5) + 1, 1, n)
				local cur = indexOf(id)
				if want ~= cur then table.remove(order, cur) table.insert(order, want, id) layoutAll(id) end
			end,
			onEnd = function(g, id, p, moved)
				tween(g, 0.15, { Size = UDim2.fromOffset(cw, ch), Position = UDim2.fromOffset(slotX(indexOf(id)), CY) })
				if moved then return end
				-- タップ：2まい選ぶと いれかえ
				if selected == nil then
					selected = id setSel(id, true)
				elseif selected == id then
					setSel(id, false) selected = nil
				else
					local a, b = indexOf(selected), indexOf(id)
					order[a], order[b] = order[b], order[a]
					setSel(selected, false) selected = nil
					layoutAll(nil)
				end
			end,
		})
	end
	-- 手のお手本：1まいめを 2まいめの位置へ
	if n >= 2 then showHand(layer, UDim2.fromOffset(slotX(1) + cw / 2 - 30, CY + ch / 2), UDim2.fromOffset(slotX(2) + cw / 2 - 30, CY + ch / 2)) end
	current.getAnswer = function() return table.clone(order) end
	current.reveal = function(ok, answerText)
		if ok then return end
		if answerText and answerText ~= "" then label(body, "Answer: " .. answerText, 22, OK, nil, 0, isSpell and 380 or 370, 880, 30, Enum.TextXAlignment.Center) end
	end
end
renderers.order = function(q) renderOrderLike(q, false) end
renderers.spell = function(q) renderOrderLike(q, true) end

-- ② あなうめ
renderers.fill = function(q)
	local col, soft = themeOf("fill")
	hint.Text = "① ことばを タップ（または ひっぱる）→ あなに はいる\n② できたら ✅ Check"
	label(body, q.jp or "", 15, GRAY, Enum.Font.GothamBold, 0, 4, 880, 20, Enum.TextXAlignment.Center)
	local layer = Instance.new("Frame") layer.Size = UDim2.new(1, 0, 1, 0) layer.BackgroundTransparency = 1 layer.Parent = body
	local pieces, totalW = {}, 0
	for i, tok in ipairs(q.tokens) do local w = (tok == "_") and 150 or (18 + #tok * 17) pieces[i] = { tok = tok, w = w } totalW = totalW + w + 10 end
	local x = math.floor((880 - totalW) / 2)
	local blanks, bi = {}, 0
	for _, pc in ipairs(pieces) do
		if pc.tok == "_" then
			bi = bi + 1
			local b = Instance.new("Frame") b.Position = UDim2.fromOffset(x, 60) b.Size = UDim2.fromOffset(pc.w, 70) b.BackgroundColor3 = soft b.BorderSizePixel = 0 b.Parent = layer
			corner(b, 16) local bst = stroke(b, col, 3, 0.1)
			label(b, "?", 32, col, nil, 0, 0, pc.w, 70, Enum.TextXAlignment.Center).Name = "Q"
			blanks[bi] = { gui = b, chip = nil, x = x, st = bst }
			task.spawn(function() -- 点滅（カードが入るまで）
				while b.Parent and not blanks[bi].chip do
					TS:Create(bst, TweenInfo.new(0.6, Enum.EasingStyle.Sine), { Transparency = 0.7 }):Play() task.wait(0.6)
					TS:Create(bst, TweenInfo.new(0.6, Enum.EasingStyle.Sine), { Transparency = 0.1 }):Play() task.wait(0.6)
				end
			end)
		else
			label(layer, pc.tok, 34, GREEN, nil, x, 60, pc.w, 70, Enum.TextXAlignment.Center)
		end
		x = x + pc.w + 10
	end
	local chips, nb, chipW = {}, #q.bank, 150
	local bx0 = math.floor((880 - (nb * chipW + (nb - 1) * 16)) / 2)
	local homeOf = {}
	local function detach(id) local ch = chips[id] if ch.inBlank then blanks[ch.inBlank].chip = nil blanks[ch.inBlank].gui:FindFirstChild("Q").Visible = true ch.inBlank = nil end end
	local function place(id, k)
		local b = blanks[k]
		if b.chip and b.chip ~= id then local other = chips[b.chip] other.inBlank = nil tween(other.gui, 0.2, { Position = homeOf[b.chip] }) end
		b.chip = id b.gui:FindFirstChild("Q").Visible = false chips[id].inBlank = k
		b.st.Transparency = 0
		tween(chips[id].gui, 0.18, { Size = UDim2.fromOffset(chipW, 64), Position = UDim2.fromOffset(b.x, 63) }, Enum.EasingStyle.Back)
	end
	for i, c in ipairs(q.bank) do
		homeOf[c.id] = UDim2.fromOffset(bx0 + (i - 1) * (chipW + 16), 230)
		local g = Instance.new("TextButton") g.Position = homeOf[c.id] g.Size = UDim2.fromOffset(chipW, 64)
		g.BackgroundColor3 = WHITE g.Text = c.w g.TextColor3 = GREEN g.Font = Enum.Font.FredokaOne g.TextScaled = true g.AutoButtonColor = false g.AutoLocalize = false g.ZIndex = 6 g.Parent = layer
		corner(g, 16) stroke(g, col, 3)
		local pad = Instance.new("UIPadding") pad.PaddingLeft = UDim.new(0, 8) pad.PaddingRight = UDim.new(0, 8) pad.Parent = g
		chips[c.id] = { gui = g, inBlank = nil }
		draggable(g, c.id, {
			onStart = function(gg, id) stopHand() tween(gg, 0.1, { Size = UDim2.fromOffset(chipW + 8, 70) }) end,
			onMove = function(gg, id, p, grab) moveTo(gg, layer, p, grab) end,
			onEnd = function(gg, id, p, moved)
				if not moved then
					-- タップ：入っていれば戻す、入っていなければ 空いている あなへ
					if chips[id].inBlank then detach(id) tween(gg, 0.2, { Size = UDim2.fromOffset(chipW, 64), Position = homeOf[id] }) return end
					for k, b in ipairs(blanks) do if not b.chip then place(id, k) return end end
					place(id, 1)
					return
				end
				detach(id)
				local best, bestD = nil, 80
				local cc = centerOf(gg)
				for k, b in ipairs(blanks) do local d = (centerOf(b.gui) - cc).Magnitude if d < bestD then best, bestD = k, d end end
				if best then place(id, best) else tween(gg, 0.2, { Size = UDim2.fromOffset(chipW, 64), Position = homeOf[id] }) end
			end,
		})
	end
	if blanks[1] and q.bank[1] then showHand(layer, UDim2.fromOffset(bx0 + chipW / 2 - 30, 240), UDim2.fromOffset(blanks[1].x + 45, 70)) end
	current.getAnswer = function() local ans = {} for k, b in ipairs(blanks) do ans[k] = b.chip or "" end return ans end
	current.reveal = function(ok, answerText)
		if ok or not answerText then return end
		for _, b in ipairs(blanks) do
			local q2 = b.gui:FindFirstChild("Q")
			if b.chip then chips[b.chip].gui.Visible = false end
			q2.Visible = true q2.Text = answerText q2.TextColor3 = OK
			b.st.Color = OK b.st.Transparency = 0
		end
	end
end

-- ③ タイピング
renderers.type = function(q)
	local col = themeOf("type")
	local y0 = 0
	if q.emoji and q.emoji ~= "" then label(body, q.emoji, 84, GREEN, nil, 0, 0, 880, 100, Enum.TextXAlignment.Center) y0 = 100 end
	if q.prompt and q.prompt ~= "" then label(body, q.prompt, 26, GREEN, nil, 0, y0, 880, 60, Enum.TextXAlignment.Center) y0 = y0 + 60 end
	label(body, q.jp or "", 16, GRAY, Enum.Font.GothamBold, 0, y0, 880, 22, Enum.TextXAlignment.Center)
	local n = q.len
	local bw = math.min(64, math.floor(820 / n) - 8)
	local x0 = math.floor((880 - (n * bw + (n - 1) * 8)) / 2)
	local by = y0 + 30
	-- 前回この問題で合っていた文字（その枠に固定する）
	local hintKey = tostring(q.hid or "") .. "|" .. tostring(q.len)
	local firstHint = (M._typeHints or {})[hintKey]   -- 2回目：さいしょの もじ
	local fixed = {}                                     -- 事前には何も入れない
	hint.Text = "① えいごで ことばを うつ（キーボードでも OK）\n② ぜんぶ うったら  Enter ⏎"
	local slots, boxes = {}, {}
	for i = 1, n do
		local b = Instance.new("Frame") b.Position = UDim2.fromOffset(x0 + (i - 1) * (bw + 8), by) b.Size = UDim2.fromOffset(bw, 64) b.BackgroundColor3 = WHITE b.BorderSizePixel = 0 b.Parent = body
		corner(b, 14) stroke(b, LINEC, 3)
		label(b, "", 36, GREEN, nil, 0, 0, bw, 64, Enum.TextXAlignment.Center).Name = "T"
		boxes[i] = b
	end
	if firstHint and firstHint ~= "" then
		local hl = label(body, ("💡 ヒント：さいしょの もじは「 %s 」"):format(firstHint), 18, ORANGE, nil, 0, by + 68, 880, 24, Enum.TextXAlignment.Center)
		hl.Name = "FirstHint"
	end
	local enterBtn
	local function nextEmpty() for i = 1, n do if not slots[i] then return i end end return nil end
	local function lastTyped() for i = n, 1, -1 do if slots[i] and not fixed[i] then return i end end return nil end
	local function word() local t = {} for i = 1, n do t[i] = slots[i] or "" end return table.concat(t) end
	local function render()
		local cur = nextEmpty()
		for i, b in ipairs(boxes) do
			local t = b:FindFirstChild("T")
			t.Text = slots[i] or ""
			t.TextColor3 = fixed[i] and OK or GREEN
			b.BackgroundColor3 = fixed[i] and Color3.fromRGB(225, 245, 232) or ((i == cur) and Color3.fromRGB(248, 244, 255) or WHITE)
			for _, st in ipairs(b:GetChildren()) do if st:IsA("UIStroke") then
				st.Color = fixed[i] and OK or ((i == cur) and col or LINEC)
				st.Thickness = (i == cur) and 4 or 3
			end end
		end
		if enterBtn then enterBtn.BackgroundColor3 = (cur == nil) and OK or Color3.fromRGB(170, 200, 185) end
	end
	local function submitTyped()
		if not current or current.locked then return end
		if nextEmpty() then shake(enterBtn, 6) return end
		M.submit(word())
	end
	local function press(ch)
		if not current or current.locked then return end
		if ch == "⌫" then
			local i = lastTyped()
			if i then slots[i] = nil render() end
			return
		end
		local i = nextEmpty()
		if not i then return end
		slots[i] = ch
		render()
	end
	local rows = { "qwertyuiop", "asdfghjkl", "zxcvbnm" }
	local kw, kh, kg = 68, 52, 8
	local ky = by + 96
	for r, row in ipairs(rows) do
		local rx0 = math.floor((880 - (#row * kw + (#row - 1) * kg)) / 2)
		if r == 3 then rx0 = rx0 - 90 end
		for i = 1, #row do
			local ch = row:sub(i, i)
			local k = button(body, ch, rx0 + (i - 1) * (kw + kg), ky + (r - 1) * (kh + kg), kw, kh, WHITE, GREEN, 24)
			stroke(k, LINEC, 2)
			k.MouseButton1Click:Connect(function()
				local sc = k:FindFirstChild("Pop") or Instance.new("UIScale") sc.Name = "Pop" sc.Parent = k
				sc.Scale = 0.86 tween(sc, 0.18, { Scale = 1 }, Enum.EasingStyle.Back)
				press(ch)
			end)
		end
		if r == 3 then
			local bx = rx0 + #row * (kw + kg)
			local del = button(body, "⌫ けす", bx, ky + 2 * (kh + kg), 110, kh, Color3.fromRGB(150, 140, 125), WHITE, 18)
			del.MouseButton1Click:Connect(function() press("⌫") end)
			enterBtn = button(body, "Enter ⏎", bx + 118, ky + 2 * (kh + kg), 150, kh, OK, WHITE, 20)
			enterBtn.MouseButton1Click:Connect(submitTyped)
		end
	end
	local conn = UIS.InputBegan:Connect(function(input)
		if not current then return end
		if input.UserInputType ~= Enum.UserInputType.Keyboard then return end
		local name = input.KeyCode.Name
		if #name == 1 and name:match("%a") then press(name:lower())
		elseif input.KeyCode == Enum.KeyCode.Backspace then press("⌫")
		elseif input.KeyCode == Enum.KeyCode.Return or input.KeyCode == Enum.KeyCode.KeypadEnter then submitTyped() end
	end)
	current.cleanup = function() conn:Disconnect() end
	checkBtn.Visible = false
	current.getAnswer = function() return word() end
	current.reveal = function(ok, answerText, _, final)
		M._typeHints = M._typeHints or {}
		if ok then M._typeHints[hintKey] = nil return end
		if not answerText then return end
		-- 念のため：答えの番号が合わなければヒントは使わない
		if q.hid and M.wordId(tostring(answerText):lower()) ~= q.hid then M._typeHints[hintKey] = nil return end
		for i, b in ipairs(boxes) do
			local t = b:FindFirstChild("T")
			local mine, want = slots[i] or "", answerText:sub(i, i)
			if mine ~= "" and mine:lower() == want:lower() then
				t.TextColor3 = OK b.BackgroundColor3 = Color3.fromRGB(225, 245, 232)
			elseif final then
				t.Text = want t.TextColor3 = OK
			else
				t.Text = mine ~= "" and mine or "_" t.TextColor3 = NG b.BackgroundColor3 = Color3.fromRGB(255, 228, 228)
			end
		end
		if final then M._typeHints[hintKey] = nil else M._typeHints[hintKey] = answerText:sub(1, 1):lower() end
	end
	render()
end

-- ④ せんつなぎ
renderers.match = function(q)
	local col = themeOf("match")
	hint.Text = "① ひだりの えいごを タップ → みぎの いみを タップ（ひっぱっても OK）\n② ぜんぶ つないだら ✅ Check"
	label(body, q.jp or "", 15, GRAY, Enum.Font.GothamBold, 0, 2, 880, 20, Enum.TextXAlignment.Center)
	local layer = Instance.new("Frame") layer.Size = UDim2.new(1, 0, 1, 0) layer.BackgroundTransparency = 1 layer.Parent = body
	local lines = Instance.new("Frame") lines.Size = UDim2.new(1, 0, 1, 0) lines.BackgroundTransparency = 1 lines.ZIndex = 3 lines.Parent = layer
	local COLORS = { Color3.fromRGB(90, 150, 230), ORANGE, OK, Color3.fromRGB(150, 80, 210), Color3.fromRGB(240, 110, 160) }
	local leftG, rightG, links = {}, {}, {}
	local rowH, top = 82, 34
	for i, it in ipairs(q.left) do
		local c = Instance.new("TextButton") c.Position = UDim2.fromOffset(110, top + (i - 1) * rowH) c.Size = UDim2.fromOffset(230, 70)
		c.BackgroundColor3 = WHITE c.Text = it.t c.TextColor3 = GREEN c.Font = Enum.Font.FredokaOne c.TextScaled = true c.AutoButtonColor = false c.AutoLocalize = false c.ZIndex = 5 c.Parent = layer
		local pad0 = Instance.new("UIPadding") pad0.PaddingLeft = UDim.new(0, 12) pad0.PaddingRight = UDim.new(0, 18) pad0.PaddingTop = UDim.new(0, 10) pad0.PaddingBottom = UDim.new(0, 10) pad0.Parent = c
		corner(c, 16) local st = stroke(c, COLORS[i] or GRAY, 3)
		local dot = Instance.new("Frame") dot.AnchorPoint = Vector2.new(0.5, 0.5) dot.Position = UDim2.new(1, 0, 0.5, 0) dot.Size = UDim2.fromOffset(18, 18) dot.BackgroundColor3 = COLORS[i] or GRAY dot.BorderSizePixel = 0 dot.ZIndex = 6 dot.Parent = c corner(dot, 9)
		leftG[it.id] = { gui = c, color = COLORS[i] or GRAY, dot = dot, st = st }
	end
	for i, it in ipairs(q.right) do
		local c = Instance.new("TextButton") c.Position = UDim2.fromOffset(540, top + (i - 1) * rowH) c.Size = UDim2.fromOffset(230, 70)
		c.BackgroundColor3 = WHITE c.Text = it.t c.TextColor3 = GREEN c.Font = Enum.Font.FredokaOne c.TextScaled = true c.AutoButtonColor = false c.AutoLocalize = false c.ZIndex = 5 c.Parent = layer
		corner(c, 16) stroke(c, LINEC, 3)
		local pad = Instance.new("UIPadding") pad.PaddingLeft = UDim.new(0, 10) pad.PaddingRight = UDim.new(0, 10) pad.Parent = c
		local dot = Instance.new("Frame") dot.AnchorPoint = Vector2.new(0.5, 0.5) dot.Position = UDim2.new(0, 0, 0.5, 0) dot.Size = UDim2.fromOffset(18, 18) dot.BackgroundColor3 = Color3.fromRGB(200, 200, 200) dot.BorderSizePixel = 0 dot.ZIndex = 6 dot.Parent = c corner(dot, 9)
		rightG[it.id] = { gui = c, dot = dot }
	end
	local function drawLine(frame, a, b, color)
		local la, lb = (a - lines.AbsolutePosition) / SCALE.v, (b - lines.AbsolutePosition) / SCALE.v
		local mid, len = (la + lb) / 2, (lb - la).Magnitude
		frame.AnchorPoint = Vector2.new(0.5, 0.5) frame.Position = UDim2.fromOffset(mid.X, mid.Y) frame.Size = UDim2.fromOffset(len, 7)
		frame.Rotation = math.deg(math.atan2(lb.Y - la.Y, lb.X - la.X)) frame.BackgroundColor3 = color
	end
	local function newLine(color) local f = Instance.new("Frame") f.BorderSizePixel = 0 f.ZIndex = 4 f.Parent = lines corner(f, 4) f.BackgroundColor3 = color return f end
	local function unlink(lid) if links[lid] then links[lid].line:Destroy() rightG[links[lid].rid].dot.BackgroundColor3 = Color3.fromRGB(200, 200, 200) links[lid] = nil end end
	local function linkedTo(rid) for lid, l in pairs(links) do if l.rid == rid then return lid end end return nil end
	local function connect(lid, rid)
		local Lg, R = leftG[lid], rightG[rid]
		unlink(lid)
		local prev = linkedTo(rid) if prev then unlink(prev) end
		local f = newLine(Lg.color) drawLine(f, centerOf(Lg.dot), centerOf(R.dot), Lg.color) R.dot.BackgroundColor3 = Lg.color links[lid] = { rid = rid, line = f }
		tween(R.gui, 0.12, { Size = UDim2.fromOffset(242, 76) }) task.delay(0.12, function() if R.gui.Parent then tween(R.gui, 0.12, { Size = UDim2.fromOffset(230, 70) }) end end)
	end
	local selectedL = nil
	local function setSelL(lid, on)
		local Lg = leftG[lid] if not Lg then return end
		Lg.st.Color = on and GOLD or Lg.color Lg.st.Thickness = on and 5 or 3
		tween(Lg.gui, 0.12, { Size = on and UDim2.fromOffset(240, 76) or UDim2.fromOffset(230, 70) })
	end
	local temp = nil
	for lid, Lg in pairs(leftG) do
		draggable(Lg.gui, lid, {
			onStart = function(g, id) stopHand() temp = newLine(Lg.color) end,
			onMove = function(g, id, p) if temp then drawLine(temp, centerOf(Lg.dot), p, Lg.color) end for rid, R in pairs(rightG) do R.gui.BackgroundColor3 = inside(R.gui, p) and Color3.fromRGB(240, 252, 245) or WHITE end end,
			onEnd = function(g, id, p, moved)
				if temp then temp:Destroy() temp = nil end
				for _, R in pairs(rightG) do R.gui.BackgroundColor3 = WHITE end
				if not moved then
					if selectedL == id then setSelL(id, false) selectedL = nil
					else if selectedL then setSelL(selectedL, false) end selectedL = id setSelL(id, true) end
					return
				end
				for rid, R in pairs(rightG) do if inside(R.gui, p) then connect(id, rid) end end
			end,
		})
	end
	for rid, R in pairs(rightG) do
		R.gui.MouseButton1Click:Connect(function()
			if not selectedL then return end
			connect(selectedL, rid)
			setSelL(selectedL, false) selectedL = nil
		end)
	end
	local firstL, firstR = q.left[1], q.right[1]
	if firstL and firstR then showHand(layer, UDim2.fromOffset(225 - 30, top + 35 - 30), UDim2.fromOffset(655 - 30, top + 35 - 30)) end
	current.getAnswer = function() local ans = {} for lid, l in pairs(links) do ans[lid] = l.rid end return ans end
	current.reveal = function(ok, _, pairsMap)
		if type(pairsMap) ~= "table" then return end
		for lid, l in pairs(links) do l.line.BackgroundColor3 = (pairsMap[lid] == l.rid) and OK or NG end
		if not ok then
			task.delay(0.9, function()
				for lid in pairs(links) do unlink(lid) end
				for lid, rid in pairs(pairsMap) do local Lg, R = leftG[lid], rightG[rid] if Lg and R then local f = newLine(OK) drawLine(f, centerOf(Lg.dot), centerOf(R.dot), OK) R.dot.BackgroundColor3 = OK end end
			end)
		end
	end
end

-- ⑤ きいて えらぶ
renderers.listen = function(q)
	local col = themeOf("listen")
	hint.Text = "① 🔊 を おして よく きく（なんかいでも OK）\n② きこえた ことばを タップ"
	checkBtn.Visible = false
	local big = button(body, "🔊", 0, 10, 120, 120, col, WHITE, 56)
	big.Position = UDim2.new(0.5, -60, 0, 10) corner(big, 60)
	local ring = Instance.new("Frame") ring.AnchorPoint = Vector2.new(0.5, 0.5) ring.Position = UDim2.fromScale(0.5, 0.5) ring.Size = UDim2.fromScale(1, 1) ring.BackgroundTransparency = 1 ring.ZIndex = big.ZIndex - 1 ring.Parent = big
	corner(ring, 60) local rs = stroke(ring, col, 3, 0.3)
	task.spawn(function() -- 脈（開いている間だけ）
		while ring.Parent and current do
			ring.Size = UDim2.fromScale(1, 1) rs.Transparency = 0.3
			TS:Create(ring, TweenInfo.new(1.1, Enum.EasingStyle.Sine), { Size = UDim2.fromScale(1.6, 1.6) }):Play()
			TS:Create(rs, TweenInfo.new(1.1, Enum.EasingStyle.Sine), { Transparency = 1 }):Play()
			task.wait(1.4)
		end
	end)
	big.MouseButton1Click:Connect(function() M.speak(q.speak) end)
	label(body, "もういちど きく", 12, GRAY, Enum.Font.GothamBold, 0, 134, 880, 16, Enum.TextXAlignment.Center)
	local n = #q.options
	local w = math.min(200, math.floor((860 - (n - 1) * 20) / math.max(n, 1)))
	local x0 = math.floor((880 - (n * w + (n - 1) * 20)) / 2)
	local picked = nil
	local btns = {}
	for i, o in ipairs(q.options) do
		local b = button(body, o.t, x0 + (i - 1) * (w + 20), 170, w, 150, WHITE, GREEN, 40)
		b.TextScaled = true
		local pad = Instance.new("UIPadding") pad.PaddingLeft = UDim.new(0, 14) pad.PaddingRight = UDim.new(0, 14) pad.PaddingTop = UDim.new(0, 40) pad.PaddingBottom = UDim.new(0, 40) pad.Parent = b
		stroke(b, LINEC, 3) corner(b, 24)
		b.MouseEnter:Connect(function() tween(b, 0.1, { Size = UDim2.fromOffset(w + 10, 160) }) end)
		b.MouseLeave:Connect(function() tween(b, 0.1, { Size = UDim2.fromOffset(w, 150) }) end)
		btns[o.id] = b
		b.MouseButton1Click:Connect(function()
			if not current or current.locked then return end
			picked = o.id
			for _, bb in pairs(btns) do bb.BackgroundColor3 = WHITE end
			b.BackgroundColor3 = Color3.fromRGB(255, 236, 214)
			M.submit(picked)
		end)
	end
	current.getAnswer = function() return picked end
	current.reveal = function(ok, _, correctId)
		for id, b in pairs(btns) do
			if id == correctId then b.BackgroundColor3 = Color3.fromRGB(225, 245, 232) for _, s in ipairs(b:GetChildren()) do if s:IsA("UIStroke") then s.Color = OK end end
			elseif id == picked and not ok then b.BackgroundColor3 = Color3.fromRGB(255, 228, 228) end
		end
	end
end

-- ⑦ えらぶ（4択）：問題を 大きく 出して、4 つから タップ（宿題プレースで 足した 形）
renderers.mc = function(q)
	local col = themeOf("mc")
	hint.Text = "ただしい ものを タップしてね"
	checkBtn.Visible = false
	spkBtn.Visible = q.speak ~= nil and q.speak ~= ""
	local y = 0
	local pl = label(body, q.prompt or "", 40, GREEN, nil, 0, y, 880, 120, Enum.TextXAlignment.Center)
	pl.TextWrapped = true pl.TextScaled = true
	local lim = Instance.new("UITextSizeConstraint") lim.MaxTextSize = 54 lim.Parent = pl
	y = y + 124
	if q.jp and q.jp ~= "" then label(body, q.jp, 16, GRAY, Enum.Font.GothamBold, 0, y, 880, 22, Enum.TextXAlignment.Center) y = y + 28 end
	local n = #q.options
	local cols = (n <= 2) and n or 2
	local w = (cols == 1) and 420 or 420
	local h = 74
	local x0 = math.floor((880 - (cols * w + (cols - 1) * 20)) / 2)
	local picked = nil
	local btns = {}
	for i, o in ipairs(q.options) do
		local cx = (i - 1) % cols
		local cy = math.floor((i - 1) / cols)
		local b = button(body, o.t, x0 + cx * (w + 20), y + 6 + cy * (h + 16), w, h, WHITE, GREEN, 28)
		b.TextWrapped = true b.TextScaled = true
		local tl = Instance.new("UITextSizeConstraint") tl.MaxTextSize = 30 tl.Parent = b
		local pad = Instance.new("UIPadding") pad.PaddingLeft = UDim.new(0, 16) pad.PaddingRight = UDim.new(0, 16) pad.PaddingTop = UDim.new(0, 10) pad.PaddingBottom = UDim.new(0, 10) pad.Parent = b
		stroke(b, LINEC, 3) corner(b, 18)
		btns[o.id] = b
		b.MouseButton1Click:Connect(function()
			if not current or current.locked then return end
			picked = o.id
			for _, bb in pairs(btns) do bb.BackgroundColor3 = WHITE end
			b.BackgroundColor3 = Color3.fromRGB(255, 236, 214)
			M.submit(picked)
		end)
	end
	current.getAnswer = function() return picked end
	current.reveal = function(ok, _, correctId)
		for id, b in pairs(btns) do
			if id == correctId then b.BackgroundColor3 = Color3.fromRGB(225, 245, 232) for _, s in ipairs(b:GetChildren()) do if s:IsA("UIStroke") then s.Color = OK end end
			elseif id == picked and not ok then b.BackgroundColor3 = Color3.fromRGB(255, 228, 228) end
		end
	end
end

-- ============================================================
-- 開く・答える・結果・閉じる
-- ============================================================
local onSubmitCb = nil
function M.open(payload, onSubmit)
	ensureGui()
	clearBody()
	local t = TITLES[payload.type] or { payload.type, "", "❓" }
	hIcon.Text = t[3] hTitle.Text = t[1] hJP.Text = t[2]
	local col = themeOf(payload.type)
	head.BackgroundColor3 = col
	for _, c in ipairs(head:GetChildren()) do if c:IsA("Frame") and c.Size == UDim2.new(1, 0, 0, 26) then c.BackgroundColor3 = col end end
	for _, st in ipairs(panel:GetChildren()) do if st:IsA("UIStroke") then st.Color = col end end
	checkBtn.BackgroundColor3 = col
	stopHand()
	checkBtn.Visible = true spkBtn.Visible = true hint.Text = ""
	current = { locked = false, speak = payload.speak }
	onSubmitCb = onSubmit
	openedAt = os.clock()
	local r = renderers[payload.type]
	if not r then return false end
	r(payload)
	gui.Enabled = true
	panel.Size = UDim2.fromOffset(20, 20)
	tween(panel, 0.3, { Size = UDim2.fromOffset(920, 600) }, Enum.EasingStyle.Back)
	setControls(false)
	task.delay(0.35, function() if current and current.speak then M.speak(current.speak) end end)
	return true
end
function M.submit(ans)
	if not current or current.locked then return end
	current.locked = true
	checkBtn.Visible = false
	if onSubmitCb then onSubmitCb(ans) end
end
-- result: ok / answerText / extra（match なら pairs、listen なら 正解id）
function M.showResult(ok, answerText, extra, final)
	if not current then return end
	stopHand()
	if ok then banner("🎉 Correct!  せいかい！", OK) confetti(18) else banner(final and "Not quite…  こたえは こちら" or "Not quite…  もういちど！", NG) end
	if current.reveal then pcall(current.reveal, ok, answerText, extra, final) end
end
function M.close()
	if gui then gui.Enabled = false end
	stopHand()
	local cb = (current and not current.locked) and onSubmitCb or nil
	clearBody()
	current = nil
	onSubmitCb = nil
	ttsSeq = ttsSeq + 1
	setControls(true)
	task.delay(0.5, function() if not (gui and gui.Enabled) then setControls(true) end end)
	if cb then pcall(cb, nil) end -- 答える前に閉じられた → 「答えなし」として返す（呼び出し側が止まらない）
end
-- ✕：問題をやめる（呼び出し側には "__cancel__" が返る）
function M.cancel()
	if not current then M.close() return end
	local cb = onSubmitCb
	current.locked = true
	onSubmitCb = nil
	M.close()
	if cb then pcall(cb, "__cancel__") end
end
local openedAt = 0
function M.openedAt() return openedAt end
function M.isOpen() return gui ~= nil and gui.Enabled end
plr.CharacterAdded:Connect(function() task.delay(0.5, function() if not (gui and gui.Enabled) then setControls(true) end end) end)
return M
]=====])
put(ServerScriptService, "Script", "USpeakHomework", [=====[-- U-Speak 宿題プレース（Roblox 側・サーバー）— Web で 先生が クラスに くばった 宿題を、メインワールドと 同じ 問題の 画面
-- （USpeakFormatUI：ならべかえ・あなうめ・タイピング・せんつなぎ・きいて えらぶ・つづり ＋ えらぶ）で とく。
--
-- 置き場所：宿題プレースの ServerScriptService（Script）。Secrets の USPEAK_WEB_KEY と「Allow HTTP Requests」は
-- メインワールドの Web 連携と 同じ（同じ ゲームの 中の place なので Secrets は そのまま 使える）。
--
-- しくみ（docs/ROBLOX_SYNC.md の「宿題プレース」）：
--   * 宿題の 置き場は Web の 1 つだけ（/api/roblox/homework/…）。Web の 宿題島で とちゅうまで やって、つづきを ここで やっても 同じ。
--   * 1 問の もと（答えつき）は この Script だけが 持つ。形は USpeakFormatUI の build* で 作り、子どもの 端末には
--     FormatUI.public（答えの ない 形）だけを 送る。判定も FormatUI.check（メインワールドと 同じ）。
--   * まちがえたら 1 回だけ もう一度（メインワールドと 同じ）。1 回目で 正解 ＝ ○、それ 以外 ＝ ×（Web の 宿題と 同じ）。
--   * ○×・すすみぐあい・ごほうび（ぜんぶ おえたら コイン）・保護者レポートの 記録は Web が 決めて のこす。
--     コインは Web の コインの 行に 入り、メインワールドの USpeakWalletSync が 次に 同期した ときに 残高に 入る。
--
-- 画面との やりとり（ReplicatedStorage に 自動で 作る）：
--   RemoteFunction USpeakHW   画面 → サーバー：("list") / ("start", aid, redo) / ("answer", ans) / ("next") / ("quit")
--   RemoteEvent    USpeakHWOpen サーバー → 画面：宿題の つくえの「ひらく」が おされた

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local DESK_TAG = "USpeakHomeworkDesk"
local FormatUI = require(ReplicatedStorage:WaitForChild("USpeakFormatUI"))

local KEY = nil
pcall(function() KEY = HttpService:GetSecret("USPEAK_WEB_KEY") end)
if not KEY then warn("[Homework] Secrets に USPEAK_WEB_KEY が ありません（Creator Hub → Secrets。Studio で ためす ときは ゲーム設定 → セキュリティ の Secrets）") end

local function remote(className, name)
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then r = Instance.new(className) r.Name = name r.Parent = ReplicatedStorage end
	return r
end
local RF = remote("RemoteFunction", "USpeakHW")
local OpenEv = remote("RemoteEvent", "USpeakHWOpen")

-- ---- HTTP ---------------------------------------------------------------------------------------
local function post(path, body)
	if not KEY then return nil, "no key" end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path, Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok then warn("[Homework] " .. path .. " failed", res) return nil, "network" end
	local data = nil
	pcall(function() data = HttpService:JSONDecode(res.Body) end)
	if not res.Success then warn("[Homework] " .. path .. " " .. tostring(res.StatusCode), res.Body) return nil, data and data.error or tostring(res.StatusCode) end
	return data, nil
end

-- だれか：メインワールドから 来た ときの TeleportData の classCode（あれば）
local function idOf(plr)
	local cc = ""
	pcall(function()
		local td = plr:GetJoinData().TeleportData
		if type(td) == "table" and type(td.classCode) == "string" then cc = td.classCode end
	end)
	if cc == "" then cc = tostring(plr:GetAttribute("ClassCode") or "") end
	return { username = plr.Name, userId = tostring(plr.UserId), classCode = cc, placeId = tostring(game.PlaceId) }
end
local function body(plr, extra)
	local b = idOf(plr)
	for k, v in pairs(extra or {}) do b[k] = v end
	return b
end

-- ---- 1 問の もと → メインワールドの 形（FormatUI.build*） ----------------------------------------------
local rng = Random.new()
local function hasJa(s) return type(s) == "string" and s:find("[\227-\233]") ~= nil end
local function isEnglish(s) return type(s) == "string" and s:match("^[%a][%a '%.,!%?%-]*$") ~= nil end
local function words(s) local t = {} for w in tostring(s):gmatch("%S+") do table.insert(t, w) end return t end
local function uniq(list, skip)
	local seen, out = {}, {}
	for _, s in ipairs(skip or {}) do seen[tostring(s):lower()] = true end
	for _, s in ipairs(list) do
		local k = tostring(s):lower()
		if s ~= "" and not seen[k] then seen[k] = true table.insert(out, s) end
	end
	return out
end
local function wordPool(item, all)
	local pool = {}
	for _, p in ipairs(all) do
		if p ~= item and p.en ~= "" and p.ja ~= "" and p.prompt == "" and p.en:lower() ~= item.en:lower()
			and (p.kind == "mc" or p.kind == "match" or p.kind == "spell" or p.kind == "type" or p.kind == "listen") then
			table.insert(pool, p)
		end
	end
	return FormatUI.shuffle(pool, rng)
end

local function buildFmt(item, all)
	local pool = wordPool(item, all)
	if item.prompt ~= "" and item.answer ~= "" then
		local wrong = uniq(item.wrong, { item.answer })
		return FormatUI.buildChoice(item.prompt, item.answer, wrong, "", isEnglish(item.prompt) and item.prompt or "", rng)
	end
	local k = item.kind
	if k == "match" and item.en ~= "" and item.ja ~= "" and #pool >= 1 then
		local pairs_ = { { item.en, item.ja } }
		local used = { [item.en:lower()] = true, [item.ja] = true }
		for _, p in ipairs(pool) do
			if #pairs_ >= 4 then break end
			if not used[p.en:lower()] and not used[p.ja] then used[p.en:lower()] = true used[p.ja] = true table.insert(pairs_, { p.en, p.ja }) end
		end
		if #pairs_ >= 2 then return FormatUI.buildMatch(pairs_, "えいごと いみを せんで つなごう", rng) end
	elseif k == "spell" and item.en:match("^%a+$") then
		return FormatUI.buildSpell(item.en, item.ja, "", rng)
	elseif k == "type" and isEnglish(item.en) then
		return FormatUI.buildType(item.en, "", item.ja, "", nil)
	elseif k == "listen" and isEnglish(item.en) then
		local d = {}
		for _, w in ipairs(item.wrong) do if isEnglish(w) then table.insert(d, w) end end
		for _, p in ipairs(pool) do table.insert(d, p.en) end
		d = uniq(d, { item.en })
		if #d >= 1 then return FormatUI.buildListen(item.en, item.en, { d[1], d[2], d[3] }, rng) end
	elseif k == "order" and item.sentence ~= "" then
		local ws = words(item.sentence)
		if #ws >= 2 then return FormatUI.buildOrder(ws, item.sentence, item.ja, rng) end
	elseif k == "fill" and item.sentence ~= "" and item.blank ~= "" then
		local tokens, found = {}, false
		for _, w in ipairs(words(item.sentence)) do
			local core, tail = w:match("^(.-)([%.,!%?]*)$")
			if not found and core:lower() == item.blank:lower() then
				found = true
				table.insert(tokens, "_")
				if tail ~= "" then table.insert(tokens, tail) end
			else
				table.insert(tokens, w)
			end
		end
		if found then
			local cards = {}
			for _, w in ipairs(item.wrong) do if isEnglish(w) and not w:find(" ") then table.insert(cards, w) end end
			for _, p in ipairs(pool) do if not p.en:find(" ") then table.insert(cards, p.en) end end
			cards = uniq(cards, { item.blank })
			return FormatUI.buildFill(tokens, { item.blank }, { cards[1], cards[2] }, item.ja, rng)
		end
	end
	-- えらぶ（ことば）：英語を 見て 意味を えらぶ（Web の 宿題の mc と 同じ）。ほかの 形に できない ときも これ
	if item.en ~= "" and item.ja ~= "" then
		local wrong = {}
		for _, w in ipairs(item.wrong) do if hasJa(w) then table.insert(wrong, w) end end
		for _, p in ipairs(pool) do table.insert(wrong, p.ja) end
		wrong = uniq(wrong, { item.ja })
		return FormatUI.buildChoice(item.en, item.ja, { wrong[1], wrong[2], wrong[3] }, "いみを えらぼう", item.en, rng)
	end
	if item.sentence ~= "" then
		local ws = words(item.sentence)
		if #ws >= 2 then return FormatUI.buildOrder(ws, item.sentence, item.ja, rng) end
	end
	return nil
end

-- ---- 1 人ずつの 「いま とく 宿題」 --------------------------------------------------------------------
local runs = {}      -- [plr] = { aid, title, items, answers, queue, i, q = { item, fmt, attempt, askedAt }, redo }
local lastCall = {}

local function clean(it)
	local w = {}
	for _, x in ipairs(type(it.wrong) == "table" and it.wrong or {}) do if type(x) == "string" and x ~= "" then table.insert(w, x) end end
	return { id = tostring(it.id or ""), kind = tostring(it.kind or ""), en = tostring(it.en or ""), ja = tostring(it.ja or ""),
		sentence = tostring(it.sentence or ""), blank = tostring(it.blank or ""), prompt = tostring(it.prompt or ""), answer = tostring(it.answer or ""), wrong = w }
end

local function askNext(plr)
	local run = runs[plr]
	if not run then return { done = true } end
	while run.i < #run.queue do
		run.i += 1
		local item = run.queue[run.i]
		local ok, fmt = pcall(buildFmt, item, run.items)
		if ok and fmt then
			run.q = { item = item, fmt = fmt, attempt = 1, askedAt = os.clock() }
			local index = run.redo and run.i or math.min(run.answered + 1, #run.items)
			return { q = FormatUI.public(fmt), index = index, total = run.redo and #run.queue or #run.items, title = run.title, redo = run.redo }
		end
		warn("[Homework] この 問題は 形に できなかったので とばします：", item.id)
	end
	run.q = nil
	return { done = true, title = run.title, answered = run.answered, total = #run.items, correct = run.correct, coins = run.coins }
end

local actions = {}
function actions.list(plr)
	local r, err = post("/homework/list", body(plr))
	if not r then return { ok = false, error = err } end
	return { ok = true, child = r.child, items = r.items or {}, coins = r.coins or 0 }
end
function actions.start(plr, aid, redo)
	if type(aid) ~= "string" or #aid > 40 then return { ok = false } end
	local r, err = post("/homework/items", body(plr, { aid = aid }))
	if not r then return { ok = false, error = err } end
	local items, queue, answered, correct = {}, {}, 0, 0
	for _, raw in ipairs(r.items or {}) do table.insert(items, clean(raw)) end
	local answers = r.answers or {}
	for _, it in ipairs(items) do
		local a = answers[it.id]
		if a then answered += 1 if a.ok then correct += 1 end end
		-- ふつうは まだ 答えて いない 問題。「やりなおす」は × だった 問題
		if (redo and not (a and a.ok)) or (not redo and not a) then table.insert(queue, it) end
	end
	runs[plr] = { aid = aid, title = r.assignment and r.assignment.title or "しゅくだい", items = items, queue = queue, i = 0,
		answered = answered, correct = correct, coins = 0, redo = redo == true }
	local out = askNext(plr)
	out.ok = true
	return out
end
function actions.answer(plr, ans)
	local run = runs[plr]
	local q = run and run.q
	if not q then return { ok = false } end
	if ans == nil or ans == "__cancel__" then runs[plr] = nil return { ok = true, quit = true } end
	local good = false
	pcall(function() good = FormatUI.check(q.fmt, ans) == true end)
	local final = good or q.attempt >= 2
	local out = { ok = true, correct = good, final = final, attempt = q.attempt }
	if not final then
		q.attempt = 2      -- まちがえたら 1 回だけ もう一度（メインワールドと 同じ）
		return out
	end
	out.answerText = FormatUI.answerText(q.fmt)
	local s = q.fmt.secret or {}
	if q.fmt.type == "listen" or q.fmt.type == "mc" then out.extra = s.id elseif q.fmt.type == "match" then out.extra = s.pairs end
	local ms = math.floor((os.clock() - q.askedAt) * 1000)
	local r = post("/homework/answer", body(plr, { aid = run.aid, itemId = q.item.id, ok = good, attempt = q.attempt, kind = q.item.kind, ms = ms }))
	run.q = nil
	if r then
		run.answered = r.answered or run.answered
		if r.summary then run.correct = r.summary.correct or run.correct end
		run.coins += (r.coins or 0)
		out.answered, out.total, out.finished, out.coins = r.answered, r.total, r.finished, r.coins
	else
		out.saveError = true
	end
	return out
end
function actions.next(plr)
	local out = askNext(plr)
	out.ok = true
	return out
end
function actions.quit(plr)
	runs[plr] = nil
	return { ok = true }
end

RF.OnServerInvoke = function(plr, action, a, b)
	local now = os.clock()
	if lastCall[plr] and now - lastCall[plr] < 0.2 then return { ok = false, error = "too fast" } end
	lastCall[plr] = now
	local fn = actions[action]
	if not fn then return { ok = false } end
	local ok, res = pcall(fn, plr, a, b)
	if not ok then warn("[Homework]", res) return { ok = false, error = "server" } end
	return res
end
Players.PlayerRemoving:Connect(function(plr) runs[plr] = nil lastCall[plr] = nil end)

-- ---- 宿題の つくえ（タグ USpeakHomeworkDesk の Part に ProximityPrompt） ----------------------------------
local function hookDesk(part)
	if not part:IsA("BasePart") then return end
	local pp = part:FindFirstChildOfClass("ProximityPrompt")
	if not pp then
		pp = Instance.new("ProximityPrompt")
		pp.ActionText = "しゅくだいを ひらく" pp.ObjectText = "📚 HOMEWORK"
		pp.HoldDuration = 0 pp.MaxActivationDistance = 10 pp.RequiresLineOfSight = false
		pp.Parent = part
	end
	pp.Triggered:Connect(function(plr) OpenEv:FireClient(plr) end)
end
for _, p in ipairs(CollectionService:GetTagged(DESK_TAG)) do hookDesk(p) end
CollectionService:GetInstanceAddedSignal(DESK_TAG):Connect(hookDesk)

print("[Homework] v1 loaded ✅ Web の 宿題 × メインワールドの 問題画面（7 形式）")
]=====])
put(StarterPlayerScripts, "LocalScript", "USpeakHomeworkClient", [=====[-- U-Speak 宿題プレース（Roblox 側・画面）— 宿題の 一覧と、1 問ずつ メインワールドと 同じ 問題の 画面（USpeakFormatUI）で とく。
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
]=====])

-- ③ HTTP（Web の サーバーと 話す）
pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ④ しゅくだいの へや
local old = workspace:FindFirstChild("USpeakHomeworkRoom")
if old then old:Destroy() end
local room = Instance.new("Model")
room.Name = "USpeakHomeworkRoom"
local C3 = Color3.fromRGB
local function part(size, color, cf, mat, collide)
	local p = Instance.new("Part")
	p.Size = size p.Color = color p.CFrame = cf p.Material = mat or Enum.Material.SmoothPlastic
	p.Anchored = true p.CanCollide = collide ~= false p.TopSurface = Enum.SurfaceType.Smooth p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = room
	return p
end
local Y = 0.5
local floor = part(Vector3.new(84, 1, 64), C3(222, 196, 156), CFrame.new(0, Y - 0.5, 0), Enum.Material.WoodPlanks)
floor.Name = "Floor"
part(Vector3.new(84, 14, 1), C3(246, 236, 222), CFrame.new(0, Y + 7, -32))
part(Vector3.new(1, 14, 64), C3(246, 236, 222), CFrame.new(-42, Y + 7, 0))
part(Vector3.new(1, 14, 64), C3(246, 236, 222), CFrame.new(42, Y + 7, 0))
part(Vector3.new(84, 1.2, 0.6), C3(226, 122, 45), CFrame.new(0, Y + 3.5, -31.4))
-- こくばん（看板）
local board = part(Vector3.new(36, 10, 0.6), C3(27, 58, 47), CFrame.new(0, Y + 8, -31.3) * CFrame.Angles(0, math.pi, 0))
board.Name = "Board"
do
	local g = Instance.new("SurfaceGui") g.Face = Enum.NormalId.Front g.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud g.PixelsPerStud = 30 g.LightInfluence = 0 g.Parent = board
	local f = Instance.new("Frame") f.Size = UDim2.fromScale(1, 1) f.BackgroundTransparency = 1 f.Parent = g
	local st = Instance.new("UIStroke") st.Color = C3(226, 122, 45) st.Thickness = 10 st.Parent = f
	local a = Instance.new("TextLabel") a.BackgroundTransparency = 1 a.Position = UDim2.fromScale(0.05, 0.08) a.Size = UDim2.fromScale(0.9, 0.42)
	a.Text = "📚 HOMEWORK ROOM" a.TextScaled = true a.Font = Enum.Font.FredokaOne a.TextColor3 = C3(255, 251, 245) a.Parent = f
	local b = Instance.new("TextLabel") b.BackgroundTransparency = 1 b.Position = UDim2.fromScale(0.05, 0.55) b.Size = UDim2.fromScale(0.9, 0.3)
	b.Text = "しゅくだいの へや ・ つくえで「しゅくだいを ひらく」" b.TextScaled = true b.Font = Enum.Font.FredokaOne b.TextColor3 = C3(255, 215, 130) b.Parent = f
end
-- つくえ（タグ USpeakHomeworkDesk）6 こ
local n = 0
for row = 0, 1 do
	for col = -1, 1 do
		n += 1
		local x, z = col * 18, -12 + row * 14
		local top = part(Vector3.new(8, 0.6, 4.5), C3(196, 150, 100), CFrame.new(x, Y + 3, z), Enum.Material.Wood)
		top.Name = "Desk" .. n
		CollectionService:AddTag(top, "USpeakHomeworkDesk")
		for _, dx in ipairs({ -3.6, 3.6 }) do
			for _, dz in ipairs({ -1.9, 1.9 }) do part(Vector3.new(0.5, 2.7, 0.5), C3(90, 70, 50), CFrame.new(x + dx, Y + 1.35, z + dz)) end
		end
		part(Vector3.new(3, 0.5, 3), C3(226, 122, 45), CFrame.new(x, Y + 1.6, z + 4.2))
		part(Vector3.new(3, 3, 0.5), C3(226, 122, 45), CFrame.new(x, Y + 3.1, z + 5.5))
		local book = part(Vector3.new(2.2, 0.4, 1.6), C3(70, 130, 220), CFrame.new(x - 1.5, Y + 3.5, z) * CFrame.Angles(0, math.rad(12), 0))
		book.CanCollide = false
		local pp = Instance.new("ProximityPrompt")
		pp.ActionText = "しゅくだいを ひらく" pp.ObjectText = "📚 HOMEWORK" pp.HoldDuration = 0 pp.MaxActivationDistance = 10 pp.RequiresLineOfSight = false
		pp.Parent = top
	end
end
local light = part(Vector3.new(1, 1, 1), C3(255, 255, 255), CFrame.new(0, Y + 13, 0))
light.Transparency = 1 light.CanCollide = false
local pl = Instance.new("PointLight") pl.Range = 50 pl.Brightness = 1.2 pl.Parent = light
local spawn = workspace:FindFirstChildWhichIsA("SpawnLocation")
if not spawn then
	spawn = Instance.new("SpawnLocation")
	spawn.Size = Vector3.new(8, 1, 8) spawn.Anchored = true spawn.Parent = workspace
end
spawn.CFrame = CFrame.new(0, Y + 0.5, 22)
spawn.Color = C3(226, 122, 45) spawn.Material = Enum.Material.SmoothPlastic
room.PrimaryPart = floor
room.Parent = workspace

print("✅ 宿題プレースの セットアップ 完了（スクリプト 3 つ・HTTP オン・しゅくだいの へや・つくえ " .. n .. " こ）")
print("   ・Secrets の USPEAK_WEB_KEY は メインワールドと 同じ ゲームなので そのまま 使えます（Studio で ためす ときは ゲーム設定 → セキュリティ → Secrets にも 入れる）")
print("   ・ファイル → Roblox に 公開（Publish）してください")
