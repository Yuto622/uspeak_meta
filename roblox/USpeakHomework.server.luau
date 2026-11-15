-- U-Speak 宿題プレース（Roblox 側・サーバー）— Web で 先生が クラスに くばった 宿題を、メインワールドと 同じ 問題の 画面
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
