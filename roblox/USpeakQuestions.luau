--!strict
-- **下書き（2026-10）**：いまの Roblox の 出題スクリプトを 読んでから つなぎかたを 決める。まだ どの place にも 入れていない。
-- U-Speak の 問題データベース（Roblox 側）— /admin/qbank で「Robloxに出す」に した 問題を 取ってきて 出題する。
--
-- 置き場所：ServerScriptService の ModuleScript（名前は USpeakQuestions）。**ReplicatedStorage に 置かないこと**
-- （答えが 子どもの 端末に とどく）。Secrets の USPEAK_WEB_KEY と「Allow HTTP Requests」は USpeakWalletSync と 同じ。
--
-- しくみ（docs/ROBLOX_SYNC.md の「問題データベース」）：
--   * GET /api/roblox/questions を 1000 問ずつ 全部 取って サーバーの メモリに 持つ。5 分ごとに updatedAt だけ 見て、
--     admin で 書きかえられて いたら 取りなおす。Web に つながらない ときは 前に 取った ぶん（DataStore）で 出す。
--   * 出題（ask）は 答えを ぬいて、選択肢を まぜて わたす。判定（answer）は ここで する。答えは 1 問 1 回まで。
--   * 判定の 結果は /api/roblox/events に type="quiz" で 送る（保護者レポート・苦手単語の 復習・先生の /class に のる）。
--
-- つかいかた（ほかの サーバー Script から）：
--   local Q = require(game.ServerScriptService.USpeakQuestions)
--   local q = Q.ask(player, { grade = "5級", skill = "reading" })      -- 答えの ない 問題（なければ nil）
--   local r = Q.answer(player, q.id, "apple")                           -- { correct, answer, explanation }
-- 子どもの 画面から 使うときは USpeakQuestionRemotes.server.luau（RemoteFunction）を 通す。

local HttpService = game:GetService("HttpService")
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local CHECK_EVERY = 300        -- 秒。updatedAt を 見る 間かく
local PAGE = 1000              -- 1 回に 取る 数（サーバーの 上限）
local FLUSH_EVERY = 15         -- 秒。学習の 記録を まとめて 送る 間かく
local FAST_MS = 1200           -- これより 早い まちがいは あてずっぽう（fast）
local CACHE_MAX = 3500000      -- DataStore に 置く 写しの 上限（1 つの 値は 4MB まで）

export type Item = {
	id: string, grade: string, skill: string, format: string, passage: string, question: string,
	choices: { string }, answer: string, explanation: string, model_answer: string, tags: string,
}
export type Public = {
	id: string, grade: string, skill: string, format: string, passage: string, question: string, choices: { string },
}
export type Filter = { grade: string?, skill: string?, format: string?, tag: string? }
export type Result = { correct: boolean, answer: string, explanation: string }

local Q = {}
local items: { Item } = {}
local byId: { [string]: Item } = {}
local updatedAt = 0
local ready = false
local cache = DataStoreService:GetDataStore("USpeakQuestionBank")

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
		warn("[uspeak] " .. path .. " failed", ok and res.StatusCode or res)
		return nil
	end
	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	return okJson and data or nil
end

-- ---- 問題を もつ ----------------------------------------------------------------------------------
local function install(list: { any }, at: number)
	local nextItems: { Item } = {}
	local nextById: { [string]: Item } = {}
	for _, raw in ipairs(list) do
		if type(raw) == "table" and type(raw.id) == "string" and type(raw.answer) == "string" then
			local it: Item = {
				id = raw.id, grade = raw.grade or "", skill = raw.skill or "", format = raw.format or "",
				passage = raw.passage or "", question = raw.question or "", choices = type(raw.choices) == "table" and raw.choices or {},
				answer = raw.answer, explanation = raw.explanation or "", model_answer = raw.model_answer or "", tags = raw.tags or "",
			}
			table.insert(nextItems, it)
			nextById[it.id] = it
		end
	end
	items, byId, updatedAt, ready = nextItems, nextById, at, true
end

local function fetchAll(): boolean
	local all = {}
	local page = 0
	local at = 0
	while true do
		local r = request("GET", "/questions?limit=" .. PAGE .. "&page=" .. page)
		if not r or not r.ok then return false end
		at = tonumber(r.updatedAt) or 0
		for _, it in ipairs(r.items or {}) do table.insert(all, it) end
		if #(r.items or {}) < PAGE then break end
		page += 1
	end
	install(all, at)
	-- つながらない 日の ための 写し（大きすぎる ときは 置かない）
	local okEnc, json = pcall(function() return HttpService:JSONEncode({ updatedAt = at, items = all }) end)
	if okEnc and #json <= CACHE_MAX then pcall(function() cache:SetAsync("bank", json) end) end
	print(("[uspeak] question bank: %d questions (updatedAt %d)"):format(#items, at))
	return true
end

local function loadCache()
	local ok, json = pcall(function() return cache:GetAsync("bank") end)
	if not ok or type(json) ~= "string" then return end
	local okDec, data = pcall(function() return HttpService:JSONDecode(json) end)
	if okDec and type(data) == "table" and type(data.items) == "table" then
		install(data.items, tonumber(data.updatedAt) or 0)
		print(("[uspeak] question bank from cache: %d questions"):format(#items))
	end
end

-- 5 分ごとに updatedAt だけ 見る（1 問だけ 取る）。かわって いたら 全部 取りなおす。
local function watch()
	while true do
		task.wait(CHECK_EVERY)
		local r = request("GET", "/questions?limit=1")
		if r and r.ok and (tonumber(r.updatedAt) or 0) ~= updatedAt then fetchAll() end
	end
end

-- ---- 出題と 判定 -----------------------------------------------------------------------------------
type Issued = { id: string, at: number }
local issued: { [Player]: Issued } = {}
local recent: { [Player]: { string } } = {}     -- 同じ 問題が つづかない ように（さいごの 20 問）

local function matches(it: Item, f: Filter): boolean
	if f.grade and f.grade ~= "" and it.grade ~= f.grade then return false end
	if f.skill and f.skill ~= "" and it.skill ~= f.skill then return false end
	if f.format and f.format ~= "" and it.format ~= f.format then return false end
	if f.tag and f.tag ~= "" and not string.find(it.tags, f.tag, 1, true) then return false end
	return true
end

local function shuffled(list: { string }): { string }
	local out = table.clone(list)
	for i = #out, 2, -1 do
		local j = math.random(1, i)
		out[i], out[j] = out[j], out[i]
	end
	return out
end

-- 文字の そろえかた（大文字・前後の 空白・おわりの . ! ? を 気に しない）
local function norm(s: string): string
	s = string.lower(s)
	s = string.gsub(s, "[%s\u{3000}]+", " ")
	s = string.gsub(s, "^%s+", "")
	s = string.gsub(s, "[%s%.!%?。！？]+$", "")
	return s
end

-- 保護者レポートの 級（data.level）と 形（data.format）に あわせる
local LEVEL = { ["5級"] = "5", ["4級"] = "4", ["3級"] = "3", ["準2級"] = "pre2", ["2級"] = "2" }
local function formatOf(it: Item): string
	if it.skill == "listening" then return "listen" end
	if #it.choices > 0 then return "mc" end
	return "type"
end

-- ---- 学習の 記録（まとめて 送る）-------------------------------------------------------------------
local queue = {}
local seq = 0
local function track(player: Player, it: Item, correct: boolean, ms: number)
	seq += 1
	local data: { [string]: any } = {
		level = LEVEL[it.grade] or it.grade, format = formatOf(it), correct = correct,
		fast = (not correct) and ms < FAST_MS, retry = false, ms = ms, qid = it.id, skill = it.skill,
	}
	-- 苦手単語の 復習（review.js）は 英単語 1 語だけを 数える。文の 答えは word に 入れない。
	if string.match(it.answer, "^[%a'%-]+$") then data.word = string.lower(it.answer) end
	table.insert(queue, {
		id = ("qb-%d-%d-%d"):format(player.UserId, os.time(), seq), ts = os.time(), type = "quiz", world = "quiz",
		username = player.Name, userId = tostring(player.UserId), classCode = player:GetAttribute("ClassCode") or "", data = data,
	})
end
local function flush()
	if #queue == 0 then return end
	local batch = queue
	queue = {}
	local r = request("POST", "/events", { batchId = "qb-" .. tostring(os.time()), placeId = tostring(game.PlaceId), world = "quiz", events = batch })
	if not r then for _, e in ipairs(batch) do table.insert(queue, e) end end   -- 失敗したら つぎに（id が 同じなので 二重に ならない）
end

-- ---- そとから 呼ぶ ------------------------------------------------------------------------------------
function Q.ready(): boolean return ready end
function Q.count(f: Filter?): number
	if not f then return #items end
	local n = 0
	for _, it in ipairs(items) do if matches(it, f) then n += 1 end end
	return n
end

-- 答えの ない 問題を 1 つ。条件に あう 問題が なければ nil（ゲームの もとの 問題に もどす）。
function Q.ask(player: Player, f: Filter?): Public?
	local filter: Filter = f or {}
	local pool = {}
	local seen = {}
	for _, id in ipairs(recent[player] or {}) do seen[id] = true end
	for _, it in ipairs(items) do if matches(it, filter) and not seen[it.id] then table.insert(pool, it) end end
	if #pool == 0 then for _, it in ipairs(items) do if matches(it, filter) then table.insert(pool, it) end end end
	if #pool == 0 then return nil end
	local it = pool[math.random(1, #pool)]
	issued[player] = { id = it.id, at = os.clock() }
	local r = recent[player] or {}
	table.insert(r, it.id)
	if #r > 20 then table.remove(r, 1) end
	recent[player] = r
	return {
		id = it.id, grade = it.grade, skill = it.skill, format = it.format, passage = it.passage, question = it.question,
		choices = shuffled(it.choices),
	}
end

-- 判定。いま 出して いる 問題に だけ 1 回 答えられる（ほかの id や 2 回目は nil）。
function Q.answer(player: Player, id: string, given: string): Result?
	local now = issued[player]
	if not now or now.id ~= id or type(given) ~= "string" then return nil end
	issued[player] = nil
	local it = byId[id]
	if not it then return nil end
	local correct = norm(given) == norm(it.answer)
	track(player, it, correct, math.floor((os.clock() - now.at) * 1000))
	return { correct = correct, answer = it.answer, explanation = it.explanation }
end

-- 出して いた 問題を なかった ことに する（画面を とじた とき）。
function Q.cancel(player: Player) issued[player] = nil end

-- ---- はじめる -------------------------------------------------------------------------------------------
task.spawn(function()
	if not fetchAll() then loadCache() end
	watch()
end)
task.spawn(function()
	while true do
		task.wait(FLUSH_EVERY)
		flush()
	end
end)
Players.PlayerRemoving:Connect(function(player)
	issued[player] = nil
	recent[player] = nil
end)
game:BindToClose(flush)

return Q
