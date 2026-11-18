-- Roblox の そとの Lua（fengari）で、roblox/USpeakAbcLocal.server.luau を まるごと うごかす。
-- Roblox の もの（game・Instance・task・DataStore）は にせもの。こどもは がめんに とどく ものだけを 見て こたえる。
-- ABC_SOURCE（スクリプトの 中身）は Node が 入れる。おわりに SIM_REPORT（1 行ずつの きろく）を のこす。
local report = {}
local function note(s) report[#report + 1] = s end
local function check(cond, msg) if not cond then error("CHECK: " .. tostring(msg), 2) end end

-- ---- にせものの Roblox --------------------------------------------------------------------------------
local function signal()
	local s = { fns = {} }
	function s:Connect(f) self.fns[#self.fns + 1] = f end
	function s:Fire(...) for _, f in ipairs(self.fns) do f(...) end end
	return s
end
local function deep(v)
	if type(v) ~= "table" then return v end
	local c = {}
	for k, x in pairs(v) do c[k] = deep(x) end
	return c
end
local function world(opts)
	local w = { created = {}, shown = {}, saved = {}, warns = {}, delayed = {}, saves = 0 }
	local Players = { PlayerAdded = signal(), PlayerRemoving = signal() }
	function Players:GetPlayers() return {} end
	local Replicated = {}
	function Replicated:FindFirstChild() return nil end
	local Collection = {}
	function Collection:GetTagged() return {} end
	function Collection:GetInstanceAddedSignal() return signal() end
	local Store = {}
	function Store:GetAsync(key) if opts.storeFails then error("DataStore off") end return deep(opts.disk[key]) end
	function Store:SetAsync(key, value) if opts.storeFails then error("DataStore off") end w.saves = w.saves + 1 opts.disk[key] = deep(value) end
	local DataStoreService = {}
	function DataStoreService:GetDataStore(name) w.storeName = name return Store end
	local services = { Players = Players, ReplicatedStorage = Replicated, CollectionService = Collection, DataStoreService = DataStoreService }
	local game = {}
	function game:GetService(name) local s = services[name] if not s then error("no service " .. name) end return s end
	local Instance = {}
	function Instance.new(class)
		local o = { ClassName = class }
		if class == "RemoteEvent" then
			o.OnServerEvent = signal()
			function o:FireClient(player, payload) w.shown[#w.shown + 1] = { player = player, payload = payload } end
		end
		w.created[#w.created + 1] = o
		return o
	end
	local task = {}
	function task.delay(_, f) w.delayed[#w.delayed + 1] = f end
	local env = setmetatable({ game = game, Instance = Instance, task = task, warn = function(s) w.warns[#w.warns + 1] = tostring(s) end, _G = {} }, { __index = _G })
	env._G.__USPEAK_ABC_LOCAL_TEST = function(rules) w.rules = rules end
	local chunk, err = load(ABC_SOURCE, "@USpeakAbcLocal", "t", env)
	if not chunk then error(err) end
	chunk()
	local function byName(n) for _, o in ipairs(w.created) do if o.Name == n then return o end end error("no remote " .. n) end
	w.Start = byName("USpeakAbcStart")
	w.Answer = byName("USpeakAbcAnswer")
	w.Quit = byName("USpeakAbcQuit")
	w.Show = byName("USpeakAbcShow")
	w.Players = Players
	function w:join(userId)
		local p = { UserId = userId, Parent = true }
		Players.PlayerAdded:Fire(p)
		local d = self.delayed
		self.delayed = {}
		for _, f in ipairs(d) do f() end
		return p
	end
	function w:leave(p) p.Parent = nil Players.PlayerRemoving:Fire(p) end
	return w
end

-- ---- きまった らんすう ----------------------------------------------------------------------------------
local function lcg(seed)
	local s = seed % 2147483647
	if s <= 0 then s = s + 2147483646 end
	return function() s = (s * 48271) % 2147483647 return (s - 1) / 2147483646 end
end

-- ---- こども：がめんに とどいた ものだけから こたえを 出す ------------------------------------------------
local function perms(list, n, f, acc, used)
	acc = acc or {}
	used = used or {}
	if #acc == n then return f(acc) end
	for i = 1, #list do
		if not used[i] then
			used[i] = true
			acc[#acc + 1] = list[i]
			if perms(list, n, f, acc, used) then return true end
			acc[#acc] = nil
			used[i] = false
		end
	end
	return false
end
local function rightAnswer(q)
	if q.kind == "name" then return { choice = string.lower(q.say) } end
	if q.kind == "sound" then return { choice = q["end"] and string.sub(q.say, -1) or string.sub(q.say, 1, 1) } end
	if q.kind == "picture" then
		for _, c in ipairs(q.choices) do
			local hit = q["end"] and string.sub(c, -1) == q.letter or (not q["end"] and string.sub(c, 1, 1) == q.letter)
			if hit then return { choice = c } end
		end
		error("picture: no choice for " .. q.letter)
	end
	if q.kind == "blend" then return { choice = table.concat(q.parts, "") } end
	if q.kind == "pair" then
		for _, c in ipairs(q.choices) do if string.find(q.word, c, 1, true) then return { choice = c } end end
		error("pair: no choice for " .. q.word)
	end
	if q.kind == "word" then return { choice = q.word } end
	if q.kind == "spell" then
		local found = nil
		perms(q.blocks, #q.blocks, function(acc)
			local t, ids = {}, {}
			for i, b in ipairs(acc) do t[i] = b.t ids[i] = b.id end
			if table.concat(t, "") == q.word then found = ids return true end
			return false
		end)
		check(found, "spell: no order for " .. q.word)
		return { order = found }
	end
	error("kind " .. tostring(q.kind))
end
local function wrongAnswer(q)
	if q.kind == "spell" then
		local right = rightAnswer(q).order
		local ids = {}
		for i = #right, 1, -1 do ids[#ids + 1] = right[i] end
		local t, byId = {}, {}
		for _, b in ipairs(q.blocks) do byId[b.id] = b.t end
		for i, id in ipairs(ids) do t[i] = byId[id] end
		if table.concat(t, "") == q.word then return { order = { right[1] } } end -- さかさでも 同じ ことば → かずを たりなく する
		return { order = ids }
	end
	local right = rightAnswer(q).choice
	for _, c in ipairs(q.choices) do if c ~= right then return { choice = c } end end
	error("no wrong choice")
end
local KINDS = {}
local function checkQ(q)
	check(type(q) == "table", "q")
	check(q.answer == nil and q.key == nil and q.used == nil and q.item == nil, "answer leaked in " .. tostring(q.kind))
	check(type(q.images) == "table", "images")
	KINDS[q.kind] = (KINDS[q.kind] or 0) + 1
	if q.choices then
		check(#q.choices >= 2 and #q.choices <= 3, q.kind .. " choices " .. #q.choices)
		local seen = {}
		for _, c in ipairs(q.choices) do check(not seen[c], "dup choice " .. c) seen[c] = true end
	end
	if q.kind == "picture" or q.kind == "blend" then
		for _, c in ipairs(q.choices) do check(type(q.images[c]) == "string" and q.images[c] ~= "", "no emoji for " .. c) end
	end
	if q.word then check(q.images[q.word] ~= nil and q.images[q.word] ~= "", "no emoji for " .. q.word) end
end

-- 1 かいぶんを あそぶ。decide(q, i) → true なら ただしく こたえる。かえす：summary, state, こたえた かず。
local function playRound(w, player, review, decide)
	local first = w.Start.OnServerInvoke(player, review)
	check(type(first) == "table", "start gave nothing")
	if first.error then return nil, first.error end
	local q = first.q
	local judged = 0
	for _ = 1, 40 do
		checkQ(q)
		local msg
		local wantRight = nil
		if q.teach then
			msg = { seen = true }
		else
			judged = judged + 1
			wantRight = decide(q, judged) == true
			msg = wantRight and rightAnswer(q) or wrongAnswer(q)
		end
		local r = w.Answer.OnServerInvoke(player, msg)
		check(type(r) == "table" and not r.error, "answer failed")
		if wantRight ~= nil then
			check(r.correct == wantRight, q.kind .. " [" .. tostring(q.letter or q.word or q.say) .. " | " .. table.concat(q.choices or {}, ",") .. " | sent " .. tostring(msg.choice) .. " | answer " .. tostring(r.answer) .. "]: judged " .. tostring(r.correct) .. " but child meant " .. tostring(wantRight))
			check(r.answer ~= nil, "no answer after answering")
		end
		if r.over then
			check(type(r.summary) == "table" and type(r.state) == "table", "no summary")
			return r.summary, nil, r.state
		end
		q = r.next
	end
	error("round did not end")
end
local function always(v) return function() return v end end
local function wrongFirst(n) return function(_, i) return i > n end end
local function opened(w) return w.shown[#w.shown].payload.state end

-- ======================================================================================================
-- A. ぜんぶ できる 子：はじめの もんだい（もじ 4 → ことば 3）→ おおきい 子の みち → さいごまで
do
	local disk = {}
	local w = world({ disk = disk })
	w.rules.setRng(lcg(11))
	local p = w:join(1)
	local st0 = opened(w)
	check(st0.placed == false and st0.next.type == "place" and st0.pictures.playable == true, "A: first state")
	check(st0.lettersTotal == 26 and st0.rulesTotal == #w.rules.ruleUnits(), "A: totals")
	local s = playRound(w, p, false, always(true))
	check(s.mode == "place" and s.of == 7 and s.right == 7, "A: placement 4 letters + 3 words, got " .. s.of)
	check(s.placed.track == "elem" and s.placed.letters == 26 and s.placed.rules == 5, "A: placed elem")
	local rounds, st = 1, nil
	local order = {}
	while true do
		local sum, err, state = playRound(w, p, false, always(true))
		if not sum then
			check(err == "ぜんぶ できたよ！ すごいね。", "A: end text " .. tostring(err))
			break
		end
		rounds = rounds + 1
		check(sum.mode == "unit" and sum.passed and sum.advanced and sum.advanced.unit, "A: unit round")
		order[#order + 1] = sum.advanced.unit
		st = state
		check(rounds < 60, "A: too many rounds")
	end
	check(st.finished == true and st.rulesDone == st.rulesTotal and st.next.type == "done", "A: finished")
	check(order[#order] == "spell", "A: spell is last")
	note("A perfect child: placement 7/7 -> elem, units in order " .. table.concat(order, ",") .. ", finished after " .. rounds .. " rounds")
end

-- B. はじめの もんだいが できない 子：ちいさい 子の みち。もじは DATA.order の じゅん。そのあと きまり → おわり。
do
	local disk = {}
	local w = world({ disk = disk })
	w.rules.setRng(lcg(22))
	local p = w:join(2)
	local s, _, placedState = playRound(w, p, false, always(false))
	check(s.mode == "place" and s.of == 4 and s.right == 0 and s.placed.track == "kinder" and s.placed.letters == 0, "B: placement")
	-- はじめの もんだいで まちがえた 4 つの もじは にがてに 入る → ふくしゅうで ぜんぶ できると なくなる。
	check(placedState.weak == 4, "B: weak after placement " .. placedState.weak)
	local n = 0
	while true do
		local sum, err = playRound(w, p, true, always(true))
		if not sum then check(err == "いまは にがてな ものが ないよ。", "B: review end " .. tostring(err)) break end
		check(sum.mode == "review" and sum.of == 4, "B: review mode")
		n = n + 1
		check(n < 20, "B: review never ends")
	end
	check(n == 1, "B: one clean review clears four weak letters")
	local letters, unitsDone = {}, {}
	local stageSeen = false
	local st
	for _ = 1, 80 do
		local sum, _, state = playRound(w, p, false, always(true))
		if not sum then break end
		st = state
		check(sum.passed, "B: passed")
		if sum.mode == "letter" then
			check(sum.of == 5, "B: letter round has 5 judged, got " .. sum.of)
			letters[#letters + 1] = sum.advanced.letter
			if sum.advanced.stage == "elem" then stageSeen = true end
		else
			unitsDone[#unitsDone + 1] = sum.advanced.unit
		end
	end
	check(table.concat(letters, "") == table.concat(w.rules.data.order, ""), "B: letter order " .. table.concat(letters, ""))
	check(stageSeen, "B: stage elem after 26 letters")
	check(#unitsDone == #w.rules.units() and st.finished == true, "B: all units")
	check(st.weak == 0, "B: nothing weak at the end")
	note("B beginner: placement 0/4 -> kinder, 26 letters in order, then " .. #unitsDone .. " units, finished; review cleared weak in " .. n .. " rounds")
end

-- C. 8 わり：5 もん中 4 つで すすむ・3 つでは すすまない（もじ・きまり）。まちがえた ものは にがてに 入り、ふくしゅうで へる。
do
	local disk = {}
	local w = world({ disk = disk })
	w.rules.setRng(lcg(33))
	local p = w:join(3)
	playRound(w, p, false, always(false))
	local first = w.rules.data.order[1]
	local s, _, st = playRound(w, p, false, wrongFirst(2))
	check(s.mode == "letter" and s.of == 5 and s.right == 3 and s.passed == false and s.advanced == nil, "C: 3/5 must not pass")
	check(st.next.letter == first and st.lettersDone == 0, "C: same letter again")
	local weakBefore = st.weak
	check(weakBefore >= 1, "C: weak after wrong")
	s, _, st = playRound(w, p, false, wrongFirst(1))
	check(s.right == 4 and s.passed == true and s.advanced.letter == first and st.lettersDone == 1, "C: 4/5 passes")
	check(st.next.letter == w.rules.data.order[2], "C: next letter")
	-- ふくしゅう：ぜんぶ まちがえると へらない／ぜんぶ できると へる。
	local before = st.weak
	s, _, st = playRound(w, p, true, always(false))
	check(s.mode == "review" and st.weak >= before, "C: review wrong keeps weak")
	local guard = 0
	while st.weak > 0 do
		s, _, st = playRound(w, p, true, always(true))
		guard = guard + 1
		check(guard < 20, "C: weak never clears")
	end
	-- きまり：のこりの もじを おえて、cvc の 1 つめで 3/5 → すすまない、4/5 → すすむ。
	while st.next.type == "letter" do s, _, st = playRound(w, p, false, always(true)) end
	local unit = st.next.unit
	s, _, st = playRound(w, p, false, wrongFirst(2))
	check(s.mode == "unit" and s.of == 5 and s.right == 3 and not s.passed and st.next.unit == unit and st.weak == 1, "C: unit 3/5 must not pass")
	s, _, st = playRound(w, p, false, wrongFirst(1))
	check(s.right == 4 and s.passed and s.advanced.unit == unit and st.next.unit ~= unit, "C: unit 4/5 passes")
	note("C pass mark: letter 3/5 stays, 4/5 advances; unit " .. unit .. " 3/5 stays, 4/5 advances; weak items come back in review and clear")
end

-- D. はじめの もんだい：もじは ぜんぶ できるが ことばは よめない → もじは おわり、きまりの はじめから。
do
	local disk = {}
	local w = world({ disk = disk })
	w.rules.setRng(lcg(44))
	local p = w:join(4)
	local s, _, st = playRound(w, p, false, function(q) return q.kind ~= "blend" end)
	check(s.of == 7 and s.right == 4 and s.placed.track == "elem" and s.placed.letters == 26 and s.placed.rules == 0, "D: letters known, words not")
	check(st.next.type == "unit" and st.next.unit == "cvc-a", "D: starts at cvc-a")
	-- はんぶんだけ できる（1・2 つめの 4 ぶんの 1）→ その ぶんの もじだけ おわり。
	local w2 = world({ disk = {} })
	w2.rules.setRng(lcg(45))
	local p2 = w2:join(5)
	local s2, _, st2 = playRound(w2, p2, false, wrongFirst(0) and function(_, i) return i <= 2 end)
	check(s2.of == 4 and s2.placed.track == "kinder" and s2.placed.letters == 13, "D: half known gives 13 letters, got " .. s2.placed.letters)
	check(st2.next.type == "letter" and st2.next.letter == w2.rules.data.order[14], "D: starts at 14th letter")
	note("D placement: letters right + words wrong -> 26 letters done, starts at cvc-a; first two quarters right -> 13 letters done")
end

-- E. きろくが のこる：ぬけて、あたらしい サーバーで 入りなおしても つづきから。
do
	local disk = {}
	local w = world({ disk = disk })
	w.rules.setRng(lcg(55))
	local p = w:join(6)
	playRound(w, p, false, always(false))
	local st
	for _ = 1, 3 do _, _, st = playRound(w, p, false, always(true)) end
	_, _, st = playRound(w, p, false, always(false))
	check(w.storeName == "USpeakAbcLocalV1" and w.saves >= 5, "E: saved each round")
	w:leave(p)
	local w2 = world({ disk = disk })
	w2.rules.setRng(lcg(56))
	w2:join(6)
	local back = opened(w2)
	check(back.placed == true and back.lettersDone == 3 and back.weak == st.weak and back.rounds == st.rounds, "E: progress came back")
	check(back.next.letter == st.next.letter, "E: same next letter")
	local other = w2:join(7)
	check(opened(w2).placed == false, "E: another child starts fresh")
	check(other.UserId == 7, "E")
	note("E save/load: after 5 rounds, a new server with the same store shows lettersDone=3, weak=" .. st.weak .. ", next=" .. st.next.letter .. "; another child starts fresh")
end

-- F. DataStore が つかえない：あそべる・1 かいだけ しらせる。こわれた きろくは ただしい かたちに なおす。
do
	local w = world({ disk = {}, storeFails = true })
	w.rules.setRng(lcg(66))
	local p = w:join(8)
	local s = playRound(w, p, false, always(true))
	check(s.placed.track == "elem", "F: plays without store")
	playRound(w, p, false, always(true))
	check(#w.warns == 1, "F: warned once, got " .. #w.warns)
	local bad = { u9 = { track = "x", placed = true, letters = { a = { done = true }, zz = { done = true } }, rules = { ["cvc-a"] = { done = true }, ["BAD KEY"] = { done = true } }, weak = { ["L:a"] = 99, junk = 3 }, rounds = -4 } }
	local w3 = world({ disk = bad })
	w3:join(9)
	local st = opened(w3)
	check(st.placed and st.lettersDone == 1 and st.rulesDone == 1 and st.weak == 1 and st.rounds == 0, "F: sanitized")
	note("F no DataStore: still playable, one warning; a broken saved record is cleaned on load")
end

-- G. まもり：じゅんばんの ちがう よびだし・へんな こたえ。
do
	local w = world({ disk = {} })
	w.rules.setRng(lcg(77))
	local p = w:join(10)
	check(w.Answer.OnServerInvoke(p, { choice = "a" }) == nil, "G: answer before start")
	local first = w.Start.OnServerInvoke(p, false)
	check(w.Answer.OnServerInvoke(p, "x") == nil and w.Answer.OnServerInvoke(p, {}) == nil and w.Answer.OnServerInvoke(p, { choice = 5 }) == nil, "G: bad answers ignored")
	local r = w.Answer.OnServerInvoke(p, { choice = string.rep("z", 500) })
	check(r.correct == false and r.answer ~= nil, "G: long junk is just wrong")
	w.Quit.OnServerEvent:Fire(p)
	check(w.Answer.OnServerInvoke(p, { choice = "a" }) == nil, "G: after quit")
	check(first.q.n == 1, "G")
	note("G guards: answers before start / after quit / malformed are ignored; junk text is judged wrong")
end

-- H. いろいろな 子（らんすう）：エラーなし・すすみは へらない・さいごまで いける。
do
	local finished, total = 0, 0
	for seed = 1, 60 do
		local w = world({ disk = {} })
		local r = lcg(seed * 7919)
		w.rules.setRng(lcg(seed * 104729))
		local p = w:join(100 + seed)
		local skill = 0.55 + (seed % 9) * 0.05
		local lastL, lastR, st = 0, 0, nil
		for round = 1, 400 do
			local review = st and st.weak > 0 and r() < 0.25 or false
			local sum, err, state = playRound(w, p, review, function() return r() < skill end)
			if not sum then
				check(err == "ぜんぶ できたよ！ すごいね。" or err == "いまは にがてな ものが ないよ。", "H: " .. tostring(err))
				if st and st.finished and not review then break end
			else
				st = state
				check(st.lettersDone >= lastL and st.rulesDone >= lastR, "H: progress went backwards")
				lastL, lastR = st.lettersDone, st.rulesDone
				check(sum.of > 0 and sum.right <= sum.of, "H: counts")
				if sum.mode ~= "place" and sum.mode ~= "review" then
					check(sum.passed == (sum.right / sum.of >= 0.8), "H: pass mark")
					check((sum.advanced ~= nil) == sum.passed, "H: advance only when passed")
				end
				total = total + 1
			end
		end
		if st and st.finished then finished = finished + 1 end
	end
	check(finished >= 30, "H: only " .. finished .. " of 60 finished")
	note("H 60 random children (skill 55%-95%): " .. total .. " rounds, no errors, progress never decreased, " .. finished .. " reached the end within 400 rounds")
end

local kinds = {}
for k, n in pairs(KINDS) do kinds[#kinds + 1] = k .. "=" .. n end
table.sort(kinds)
note("question kinds seen: " .. table.concat(kinds, " "))
SIM_REPORT = table.concat(report, "\n")
