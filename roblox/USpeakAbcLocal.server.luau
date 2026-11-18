-- U-Speak「ABC と おと」— Roblox だけで うごく 版（サーバー）。Web の サーバーも Secrets も 絵の アップロードも いらない。
--
-- 置き場所：ABC 用の place の ServerScriptService（Script）。1 行の セットアップ（roblox/oneline/abc-local-all.txt）が ここに 入れる。
-- Web に つなぐ 版（USpeakAbc）とは いっしょに うごかさない（セットアップが そちらを はずす）。
--
-- ・もんだいと きまりは Web 版（server/src/game/abc.js）を そのまま うつした もの：はじめの すうもん → もじ 1 つずつ
--   （みる → うた → なまえ → おと → え）→ ことばを よむ きまり（つなげる・2 もじの おと・ながい おと・つづる）。
--   8 わりで つぎへ。まちがえた もじ・きまりは「にがて」に ためて、まとめて ふくしゅう。
-- ・こたえあわせは この Script（サーバー）。がめんには えらぶ ものだけ おくり、こたえは こたえた あとに かえす。
-- ・えは もじ（emoji）で だす。がぞうは つかわない。
-- ・きろくは DataStore（ひとりずつ）。つかえない とき（Studio で API が オフ など）は その あいだだけ おぼえる。
-- ・なかみ（DATA）は server/scripts/make-roblox-abc-local.mjs が abc-data.json から つくる。てで なおさない。
--
-- がめんとの やりとりは Web に つなぐ 版と おなじ なまえ（がめんの Script は 1 つを つかいまわす）：
--   RemoteEvent USpeakAbcShow / RemoteFunction USpeakAbcStart / RemoteFunction USpeakAbcAnswer / RemoteEvent USpeakAbcQuit
--
-- ※ きまりの ぶぶんは Roblox の そとの Lua で うごかして たしかめた（server/test/roblox-abc-local.test.mjs）。Studio では まだ。
-- ※ かたの ちゅうしゃくや += を つかわない のは、ふつうの Lua でも うごかせる ように する ため。

-- DATA BEGIN
local DATA = {
	order = {"s","a","t","p","i","n","m","d","g","o","c","k","e","u","r","h","b","f","l","j","v","w","x","y","z","q"},
	letters = {
		a = {words={{w="apple",e="🍎"},{w="ant",e="🐜"},{w="astronaut",e="🧑‍🚀"}}},
		b = {words={{w="bus",e="🚌"},{w="banana",e="🍌"},{w="bear",e="🐻"}}},
		c = {words={{w="cat",e="🐱"},{w="car",e="🚗"},{w="cow",e="🐮"}}},
		d = {words={{w="dog",e="🐶"},{w="duck",e="🦆"},{w="door",e="🚪"}}},
		e = {words={{w="egg",e="🥚"},{w="elephant",e="🐘"},{w="envelope",e="✉️"}}},
		f = {words={{w="fish",e="🐟"},{w="fire",e="🔥"}}},
		g = {words={{w="goat",e="🐐"},{w="gift",e="🎁"},{w="guitar",e="🎸"}}},
		h = {words={{w="hat",e="🎩"},{w="horse",e="🐴"},{w="house",e="🏠"}}},
		i = {words={{w="insect",e="🦗"},{w="iguana",e="🦎"},{w="ill",e="🤒"}}},
		j = {words={{w="juice",e="🧃"},{w="jeans",e="👖"},{w="jellyfish",e="🪼"}}},
		k = {words={{w="key",e="🔑"},{w="kite",e="🪁"},{w="kangaroo",e="🦘"}}},
		l = {words={{w="lion",e="🦁"},{w="lemon",e="🍋"},{w="lock",e="🔒"}}},
		m = {words={{w="moon",e="🌙"},{w="monkey",e="🐵"},{w="milk",e="🥛"}}},
		n = {words={{w="nose",e="👃"},{w="nut",e="🌰"},{w="nest",e="🪺"}}},
		o = {words={{w="octopus",e="🐙"},{w="otter",e="🦦"},{w="olive",e="🫒"}}},
		p = {words={{w="pig",e="🐷"},{w="pizza",e="🍕"},{w="pencil",e="✏️"}}},
		q = {words={{w="queen",e="👸"},{w="question",e="❓"},{w="quiet",e="🤫"}}},
		r = {words={{w="rabbit",e="🐰"},{w="rainbow",e="🌈"},{w="robot",e="🤖"}}},
		s = {words={{w="sun",e="☀️"},{w="sock",e="🧦"},{w="star",e="⭐"}}},
		t = {words={{w="tiger",e="🐯"},{w="tomato",e="🍅"},{w="tent",e="⛺"}}},
		u = {words={{w="umbrella",e="☂️"},{w="up",e="⬆️"}}},
		v = {words={{w="violin",e="🎻"},{w="van",e="🚐"},{w="volcano",e="🌋"}}},
		w = {words={{w="watermelon",e="🍉"},{w="window",e="🪟"},{w="wolf",e="🐺"}}},
		x = {words={{w="box",e="📦",fin=true},{w="fox",e="🦊",fin=true},{w="six",e="6️⃣",fin=true}}},
		y = {words={{w="yarn",e="🧶"},{w="yellow",e="🟨"}}},
		z = {words={{w="zebra",e="🦓"},{w="zero",e="0️⃣"},{w="zzz",e="💤"}}},
	},
	cvc = {
		{w="cat",e="🐱",parts={"c","a","t"}},
		{w="hat",e="🎩",parts={"h","a","t"}},
		{w="bat",e="🦇",parts={"b","a","t"}},
		{w="map",e="🗺️",parts={"m","a","p"}},
		{w="van",e="🚐",parts={"v","a","n"}},
		{w="bag",e="👜",parts={"b","a","g"}},
		{w="can",e="🥫",parts={"c","a","n"}},
		{w="man",e="👨",parts={"m","a","n"}},
		{w="pan",e="🍳",parts={"p","a","n"}},
		{w="rat",e="🐀",parts={"r","a","t"}},
		{w="cap",e="🧢",parts={"c","a","p"}},
		{w="cab",e="🚕",parts={"c","a","b"}},
		{w="fan",e="🪭",parts={"f","a","n"}},
		{w="bed",e="🛏️",parts={"b","e","d"}},
		{w="hen",e="🐔",parts={"h","e","n"}},
		{w="pen",e="🖊️",parts={"p","e","n"}},
		{w="net",e="🥅",parts={"n","e","t"}},
		{w="ten",e="🔟",parts={"t","e","n"}},
		{w="web",e="🕸️",parts={"w","e","b"}},
		{w="jet",e="🛩️",parts={"j","e","t"}},
		{w="red",e="🟥",parts={"r","e","d"}},
		{w="pig",e="🐷",parts={"p","i","g"}},
		{w="pin",e="📌",parts={"p","i","n"}},
		{w="six",e="6️⃣",parts={"s","i","x"}},
		{w="kid",e="🧒",parts={"k","i","d"}},
		{w="bin",e="🗑️",parts={"b","i","n"}},
		{w="zip",e="🤐",parts={"z","i","p"}},
		{w="dig",e="⛏️",parts={"d","i","g"}},
		{w="dog",e="🐶",parts={"d","o","g"}},
		{w="fox",e="🦊",parts={"f","o","x"}},
		{w="box",e="📦",parts={"b","o","x"}},
		{w="pot",e="🍲",parts={"p","o","t"}},
		{w="log",e="🪵",parts={"l","o","g"}},
		{w="hot",e="🥵",parts={"h","o","t"}},
		{w="dot",e="⚫",parts={"d","o","t"}},
		{w="rod",e="🎣",parts={"r","o","d"}},
		{w="sob",e="😭",parts={"s","o","b"}},
		{w="sun",e="☀️",parts={"s","u","n"}},
		{w="bus",e="🚌",parts={"b","u","s"}},
		{w="cup",e="☕",parts={"c","u","p"}},
		{w="bug",e="🐛",parts={"b","u","g"}},
		{w="nut",e="🌰",parts={"n","u","t"}},
		{w="hut",e="🛖",parts={"h","u","t"}},
		{w="tub",e="🛁",parts={"t","u","b"}},
		{w="run",e="🏃",parts={"r","u","n"}},
	},
	digraphs = {
		{id="sh",words={{w="ship",e="🚢",parts={"sh","i","p"}},{w="shop",e="🏪",parts={"sh","o","p"}},{w="fish",e="🐟",parts={"f","i","sh"}},{w="shell",e="🐚",parts={"sh","e","ll"}},{w="dish",e="🍽️",parts={"d","i","sh"}},{w="sheep",e="🐑",parts={"sh","ee","p"}}}},
		{id="ch",words={{w="chick",e="🐥",parts={"ch","i","ck"}},{w="cheese",e="🧀",parts={"ch","ee","se"}},{w="chair",e="🪑",parts={"ch","air"}},{w="cherry",e="🍒",parts={"ch","e","rr","y"}},{w="chips",e="🍟",parts={"ch","i","p","s"}},{w="lunch",e="🍱",parts={"l","u","n","ch"}}}},
		{id="th",words={{w="thumb",e="👍",parts={"th","u","mb"}},{w="three",e="3️⃣",parts={"th","r","ee"}},{w="tooth",e="🦷",parts={"t","oo","th"}},{w="think",e="🤔",parts={"th","i","n","k"}}}},
		{id="ck",words={{w="duck",e="🦆",parts={"d","u","ck"}},{w="sock",e="🧦",parts={"s","o","ck"}},{w="clock",e="⏰",parts={"c","l","o","ck"}},{w="rock",e="🪨",parts={"r","o","ck"}},{w="truck",e="🚚",parts={"t","r","u","ck"}},{w="lock",e="🔒",parts={"l","o","ck"}}}},
		{id="ng",words={{w="ring",e="💍",parts={"r","i","ng"}},{w="king",e="🤴",parts={"k","i","ng"}},{w="sing",e="🎤",parts={"s","i","ng"}},{w="song",e="🎵",parts={"s","o","ng"}},{w="wing",e="🪽",parts={"w","i","ng"}},{w="strong",e="💪",parts={"s","t","r","o","ng"}}}},
	},
	magicE = {
		{id="a_e",words={{w="cake",e="🎂",parts={"c","a","k","e"}},{w="game",e="🎮",parts={"g","a","m","e"}},{w="plane",e="✈️",parts={"p","l","a","n","e"}},{w="snake",e="🐍",parts={"s","n","a","k","e"}},{w="whale",e="🐋",parts={"wh","a","l","e"}},{w="wave",e="🌊",parts={"w","a","v","e"}}}},
		{id="i_e",words={{w="bike",e="🚲",parts={"b","i","k","e"}},{w="kite",e="🪁",parts={"k","i","t","e"}},{w="five",e="5️⃣",parts={"f","i","v","e"}},{w="nine",e="9️⃣",parts={"n","i","n","e"}},{w="smile",e="😊",parts={"s","m","i","l","e"}},{w="rice",e="🍚",parts={"r","i","c","e"}},{w="dice",e="🎲",parts={"d","i","c","e"}}}},
		{id="o_e",words={{w="nose",e="👃",parts={"n","o","s","e"}},{w="rose",e="🌹",parts={"r","o","s","e"}},{w="bone",e="🦴",parts={"b","o","n","e"}},{w="phone",e="📱",parts={"ph","o","n","e"}},{w="home",e="🏡",parts={"h","o","m","e"}},{w="globe",e="🌍",parts={"g","l","o","b","e"}}}},
		{id="u_e",words={{w="cube",e="🧊",parts={"c","u","b","e"}},{w="flute",e="🪈",parts={"f","l","u","t","e"}},{w="tube",e="🧪",parts={"t","u","b","e"}},{w="cute",e="🥰",parts={"c","u","t","e"}},{w="tune",e="🎶",parts={"t","u","n","e"}},{w="mute",e="🔇",parts={"m","u","t","e"}},{w="dune",e="🏜️",parts={"d","u","n","e"}}}},
	},
}
-- DATA END

-- ======================================================================================================
-- きまり（Roblox の ものを つかわない：ふつうの Lua だけ）
-- ======================================================================================================
local PASS = 0.8
local ALPHA = { "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z" }
local VOWELS = { "a", "e", "i", "o", "u" }
-- きいて えらぶ ときに まぎらわしい もじ（まちがいの えらぶ ものに しない）。
local SIMILAR = {
	c = { "k", "q", "s", "x" }, k = { "c", "q", "x" }, q = { "k", "c" }, s = { "c", "z", "x" }, z = { "s" }, g = { "j" }, j = { "g" },
	x = { "s", "k", "c" }, f = { "v" }, v = { "f", "b" }, b = { "v", "p", "d" }, p = { "b" }, d = { "b", "t" }, t = { "d" }, m = { "n" }, n = { "m" },
	l = { "r" }, r = { "l" }, i = { "e" }, e = { "i" }, o = { "u" }, u = { "o", "a" }, a = { "u" }, w = { "y" }, y = { "w" }, h = {},
}
local IS_ALPHA = {}
for _, l in ipairs(ALPHA) do IS_ALPHA[l] = true end

local rng = math.random -- 0 いじょう 1 みまん。たしかめる ときは さしかえる。

local function copyList(a) local b = {} for i = 1, #a do b[i] = a[i] end return b end
local function contains(a, v) for i = 1, #a do if a[i] == v then return true end end return false end
local function filter(a, f) local b = {} for i = 1, #a do if f(a[i]) then b[#b + 1] = a[i] end end return b end
local function shuffled(a)
	local b = copyList(a)
	for i = #b, 2, -1 do
		local j = math.floor(rng() * i) + 1
		b[i], b[j] = b[j], b[i]
	end
	return b
end
local function pick(a) return a[math.floor(rng() * #a) + 1] end
-- n こ えらぶ（たりなければ くりかえす）。
local function take(list, n)
	local out = {}
	local bag = {}
	while #out < n and #list > 0 do
		if #bag == 0 then bag = shuffled(list) end
		out[#out + 1] = table.remove(bag)
	end
	return out
end
local function unique(a)
	local seen, out = {}, {}
	for i = 1, #a do if not seen[a[i]] then seen[a[i]] = true out[#out + 1] = a[i] end end
	return out
end

-- きまりの ならび。さいごの「つづる」は きまりの かずには いれない。
local UNITS = nil
local function units()
	if UNITS then return UNITS end
	local out = {}
	for _, v in ipairs(VOWELS) do
		local words = filter(DATA.cvc, function(x) return x.parts[2] == v end)
		if #words >= 3 then out[#out + 1] = { id = "cvc-" .. v, type = "cvc", label = v, words = words } end
	end
	for _, g in ipairs(DATA.digraphs) do out[#out + 1] = { id = g.id, type = "digraph", label = g.id, words = g.words } end
	for _, g in ipairs(DATA.magicE) do out[#out + 1] = { id = g.id, type = "magic", label = g.id, words = g.words } end
	local spellWords = copyList(DATA.cvc)
	for _, g in ipairs(DATA.digraphs) do for _, w in ipairs(g.words) do spellWords[#spellWords + 1] = w end end
	if #spellWords >= 3 then out[#out + 1] = { id = "spell", type = "spell", label = "abc", words = spellWords } end
	UNITS = out
	return out
end
local function ruleUnits() return filter(units(), function(u) return u.type ~= "spell" end) end
local function unitById(id) for _, u in ipairs(units()) do if u.id == id then return u end end return nil end

-- ---- こどもの きろく ---------------------------------------------------------------------------------
local function blankProgress() return { track = "", placed = false, letters = {}, rules = {}, weak = {}, finished = false, rounds = 0, at = 0 } end
local function sanitizeProgress(raw)
	local p = blankProgress()
	local r = type(raw) == "table" and raw or {}
	if r.track == "kinder" or r.track == "elem" then p.track = r.track end
	p.placed = r.placed == true
	p.finished = r.finished == true
	p.rounds = math.max(0, math.floor(tonumber(r.rounds) or 0))
	p.at = tonumber(r.at) or 0
	if type(r.letters) == "table" then
		for _, l in ipairs(ALPHA) do
			local v = r.letters[l]
			if type(v) == "table" and v.done == true then p.letters[l] = { done = true, placed = v.placed == true or nil } end
		end
	end
	if type(r.rules) == "table" then
		for k, v in pairs(r.rules) do
			if type(k) == "string" and string.match(k, "^[a-z_%-]+$") and #k >= 2 and #k <= 8 and type(v) == "table" and v.done == true then
				p.rules[k] = { done = true, placed = v.placed == true or nil }
			end
		end
	end
	if type(r.weak) == "table" then
		for k, v in pairs(r.weak) do
			if type(k) == "string" and string.match(k, "^[LR]:[a-z_%-]+$") and #k <= 10 and (tonumber(v) or 0) > 0 then
				p.weak[k] = math.min(5, math.floor(tonumber(v)))
			end
		end
	end
	return p
end
local function lettersDone(p)
	local n = 0
	for _, l in ipairs(ALPHA) do if p.letters[l] and p.letters[l].done then n = n + 1 end end
	return n
end
local function rulesDone(p)
	local n = 0
	for _, u in ipairs(ruleUnits()) do if p.rules[u.id] and p.rules[u.id].done then n = n + 1 end end
	return n
end
-- にがての ならび（おおい じゅん。おなじ かずは なまえの じゅん）。
local function weakKeys(p)
	local list = {}
	for k, v in pairs(p.weak) do
		local id = string.sub(k, 3)
		local ok
		if string.sub(k, 1, 1) == "L" then ok = IS_ALPHA[id] == true else ok = unitById(id) ~= nil end
		if ok then list[#list + 1] = { k = k, v = v } end
	end
	table.sort(list, function(a, b) if a.v ~= b.v then return a.v > b.v end return a.k < b.k end)
	local out = {}
	for i = 1, #list do out[i] = list[i].k end
	return out
end

-- つぎに やる こと。
local function nextOf(p)
	if not p.placed then return { type = "place" } end
	if p.track ~= "elem" then
		for _, l in ipairs(DATA.order) do
			if not (p.letters[l] and p.letters[l].done) then return { type = "letter", letter = l } end
		end
	end
	for _, u in ipairs(units()) do
		if not (p.rules[u.id] and p.rules[u.id].done) then return { type = "unit", unit = u.id, kind = u.type, label = u.label } end
	end
	return { type = "done" }
end

-- がめんに おくる ようす（こたえに かかわる ものは いれない）。
local function publicState(p)
	local nx = nextOf(p)
	local track = ""
	if p.placed then track = (nx.type == "letter") and "kinder" or "elem" end
	local letters = {}
	for i, l in ipairs(DATA.order) do letters[i] = { l = l, done = (p.letters[l] and p.letters[l].done) == true } end
	local rules = {}
	local ru = ruleUnits()
	for i, u in ipairs(ru) do rules[i] = { id = u.id, label = u.label, type = u.type, done = (p.rules[u.id] and p.rules[u.id].done) == true } end
	return {
		ready = true, placed = p.placed, track = track, caseFirst = "both", accent = "us",
		letters = letters, lettersDone = lettersDone(p), lettersTotal = 26,
		rules = rules, rulesDone = rulesDone(p), rulesTotal = #ru,
		next = nx, weak = #weakKeys(p), finished = nx.type == "done", rounds = p.rounds,
	}
end

-- ---- もんだいを つくる -------------------------------------------------------------------------------
local function wordOf(l, notWord)
	local ws = DATA.letters[l].words
	local pool = filter(ws, function(x) return x.w ~= notWord end)
	return pick(#pool > 0 and pool or ws)
end
-- まぎらわしく ない もじを n こ。
local function otherLetters(l, n)
	local bad = { [l] = true }
	for _, x in ipairs(SIMILAR[l] or {}) do bad[x] = true end
	return take(filter(ALPHA, function(x) return not bad[x] end), n or 2)
end
local function join(list, extra)
	local out = copyList(list)
	for _, x in ipairs(extra) do out[#out + 1] = x end
	return out
end

local function qShow(l)
	local w = DATA.letters[l].words[1]
	return { kind = "show", teach = true, key = "L:" .. l, pub = { letter = l, word = w.w, ["end"] = w.fin == true } }
end
local function qChant(l)
	local lines = {}
	local ws = DATA.letters[l].words
	for i = 1, math.min(3, #ws) do
		lines[i] = { text = string.upper(l) .. ", " .. l .. ", " .. ws[i].w, word = ws[i].w, ["end"] = ws[i].fin == true }
	end
	return { kind = "chant", teach = true, key = "L:" .. l, pub = { letter = l, lines = lines } }
end
local function qName(l)
	return { kind = "name", key = "L:" .. l, format = "listen", answer = l, pub = { say = string.upper(l), choices = shuffled(join({ l }, otherLetters(l))) } }
end
local function qSound(l, notWord)
	local w = wordOf(l, notWord or "")
	return { kind = "sound", key = "L:" .. l, format = "listen", answer = l, used = w.w, pub = { say = w.w, ["end"] = w.fin == true, choices = shuffled(join({ l }, otherLetters(l))) } }
end
local function qPicture(l, notWord)
	local w = wordOf(l, notWord or "")
	local others = {}
	for _, o in ipairs(otherLetters(l)) do
		local all = DATA.letters[o].words
		local ws = filter(all, function(x) return not x.fin and string.sub(x.w, 1, 1) ~= l and string.sub(x.w, -1) ~= l end)
		-- Web 版は ここで「ぜんぶ」に もどる ので、b の もんだいに box が まざる ことが ある。こちらは その もじで はじまる・おわる ことばを さける。
		if #ws == 0 then ws = filter(all, function(x) return string.sub(x.w, 1, 1) ~= l and string.sub(x.w, -1) ~= l end) end
		others[#others + 1] = pick(#ws > 0 and ws or all).w
	end
	return { kind = "picture", key = "L:" .. l, format = "mc", answer = w.w, used = w.w, pub = { letter = l, ["end"] = w.fin == true, choices = shuffled(join({ w.w }, others)) } }
end
local function qBlend(unit, w)
	local source = (unit.type == "cvc") and DATA.cvc or unit.words
	local pool = filter(source, function(x) return x.w ~= w.w end)
	if #pool < 2 then pool = filter(DATA.cvc, function(x) return x.w ~= w.w end) end
	local others = {}
	for _, x in ipairs(take(pool, 2)) do others[#others + 1] = x.w end
	return { kind = "blend", key = "R:" .. unit.id, format = "mc", answer = w.w, word = w.w, pub = { parts = copyList(w.parts), choices = shuffled(unique(join({ w.w }, others))) } }
end
local function qRule(unit)
	local w = unit.words[1]
	return { kind = "rule", teach = true, key = "R:" .. unit.id, pub = { rule = unit.label, type = unit.type, word = w.w, parts = copyList(w.parts) } }
end
local function qRuleChant(unit)
	local lines = {}
	for i = 1, math.min(3, #unit.words) do
		local x = unit.words[i]
		lines[i] = { text = x.w, word = x.w, parts = copyList(x.parts) }
	end
	return { kind = "chant", teach = true, key = "R:" .. unit.id, pub = { rule = unit.label, type = unit.type, lines = lines } }
end
local function qPair(unit, w)
	local labels = {}
	for _, g in ipairs(DATA.digraphs) do
		if g.id ~= unit.id and not string.find(w.w, g.id, 1, true) then labels[#labels + 1] = g.id end
	end
	return { kind = "pair", key = "R:" .. unit.id, format = "listen", answer = unit.id, word = w.w, pub = { say = w.w, word = w.w, choices = shuffled(join({ unit.id }, take(labels, 2))) } }
end
local function qWord(unit, w)
	-- ことばを 3 つの つづりから えらぶ：ただしい もの・さいごの e が ない もの・ぼいんが ちがう もの。
	local word = w.w
	local noE = (string.sub(word, -1) == "e") and string.sub(word, 1, -2) or word
	local v = string.sub(unit.label, 1, 1)
	local other = pick(filter(VOWELS, function(x) return x ~= v end))
	local swapped = word
	if #word >= 3 and string.sub(word, -1) == "e" and string.sub(word, -3, -3) == v then
		swapped = string.sub(word, 1, -4) .. other .. string.sub(word, -2)
	end
	local third = (swapped == word) and (noE .. "a") or swapped
	return { kind = "word", key = "R:" .. unit.id, format = "listen", answer = word, word = word, pub = { say = word, word = word, choices = shuffled(unique({ word, noE, third })) } }
end
local function qSpell(unit, w)
	local order = {}
	for i, t in ipairs(w.parts) do order[i] = { id = "b" .. (i - 1), t = t } end
	local want = table.concat(w.parts, "|")
	for _ = 1, 6 do
		order = shuffled(order)
		local ts = {}
		for i, b in ipairs(order) do ts[i] = b.t end
		if table.concat(ts, "|") ~= want then break end
	end
	local blocks = {}
	for i, b in ipairs(order) do blocks[i] = { id = b.id, t = b.t } end
	return { kind = "spell", key = "R:" .. unit.id, format = "spell", answer = table.concat(w.parts, ""), word = w.w, parts = copyList(w.parts), blocks = order, pub = { say = w.w, word = w.w, blocks = blocks } }
end
-- にがての 1 もん（もじ → きいて えらぶ か え、きまり → その きまりの もんだい）。
local function qFor(key)
	local id = string.sub(key, 3)
	if string.sub(key, 1, 1) == "L" then
		if rng() < 0.5 then return qSound(id) end
		return qPicture(id)
	end
	local u = unitById(id)
	if not u then return nil end
	local w = pick(u.words)
	if u.type == "spell" then return qSpell(u, w) end
	if u.type == "digraph" then if rng() < 0.5 then return qPair(u, w) end return qBlend(u, w) end
	if u.type == "magic" then if rng() < 0.5 then return qWord(u, w) end return qBlend(u, w) end
	return qBlend(u, w)
end

-- はじめの すうもん（どこから はじめるか）。
local function slice(a, from, to) local b = {} for i = from, math.min(to, #a) do b[#b + 1] = a[i] end return b end
local function quarters(order) return { slice(order, 1, 6), slice(order, 7, 13), slice(order, 14, 19), slice(order, 20, 26) } end
local function placeLetters(order)
	local out = {}
	for i, q in ipairs(quarters(order)) do
		local l = pick(q)
		local it = ((i - 1) % 2 == 1) and qPicture(l) or qSound(l)
		it.phase = "L"
		it.quarter = i - 1
		out[i] = it
	end
	return out
end
local function placeWords()
	local u = nil
	for _, x in ipairs(units()) do if x.type == "cvc" then u = x break end end
	if not u then return {} end
	local out = {}
	for _, w in ipairs(take(DATA.cvc, 3)) do
		local it = qBlend({ id = "cvc-" .. w.parts[2], type = "cvc", label = u.label, words = u.words }, w)
		it.phase = "W"
		out[#out + 1] = it
	end
	return out
end

-- 1 かいぶんを はじめる。opts: { review, hi }。できなければ nil。
local function startRound(progress, opts)
	opts = opts or {}
	local order = DATA.order
	local function mk(mode, items)
		return { mode = mode, items = items, at = 0, right = 0, judged = 0, log = {}, order = order, hi = opts.hi == true }
	end
	if opts.review then
		local keys = weakKeys(progress)
		if #keys == 0 then return nil end
		local items = {}
		for i = 1, math.min(8, #keys) do
			local q = qFor(keys[i])
			if q then items[#items + 1] = q end
		end
		return mk("review", items)
	end
	local nx = nextOf(progress)
	if nx.type == "place" then
		local words = opts.hi and placeWords() or {}
		return mk("place", (#words > 0) and words or placeLetters(order))
	end
	if nx.type == "letter" then
		local l = nx.letter
		local s1 = qSound(l)
		local p1 = qPicture(l, s1.used)
		local s = mk("letter", { qShow(l), qChant(l), qName(l), s1, p1, qSound(l, s1.used), qPicture(l, p1.used) })
		s.letter = l
		return s
	end
	if nx.type == "unit" then
		local u = unitById(nx.unit)
		local ws = take(u.words, 5)
		local items = {}
		if u.type == "cvc" then
			items[1] = qRule(u)
			for _, w in ipairs(ws) do items[#items + 1] = qBlend(u, w) end
		elseif u.type == "digraph" or u.type == "magic" then
			items[1] = qRule(u)
			items[2] = qRuleChant(u)
			for i, w in ipairs(ws) do
				if i <= 3 then
					items[#items + 1] = (u.type == "digraph") and qPair(u, w) or qWord(u, w)
				else
					items[#items + 1] = qBlend(u, w)
				end
			end
		else
			for _, w in ipairs(ws) do items[#items + 1] = qSpell(u, w) end
		end
		local s = mk("unit", items)
		s.unit = u.id
		return s
	end
	return nil
end

-- いまの 1 もん（がめんに おくる かたち）。
local function question(session)
	local it = session and session.items[session.at + 1]
	if not it then return nil end
	local judgedAll = 0
	for _, x in ipairs(session.items) do if not x.teach then judgedAll = judgedAll + 1 end end
	local q = { n = session.at + 1, of = #session.items, judged = judgedAll, mode = session.mode, kind = it.kind, teach = it.teach == true }
	for k, v in pairs(it.pub) do q[k] = v end
	return q
end

-- こたえる。msg: { choice } ／ { order = { つみきの id } } ／ おしえる がめんは { seen = true }。
local function answer(session, msg)
	local it = session and session.items[session.at + 1]
	if not it then return nil end
	local correct = nil
	local given = ""
	if not it.teach then
		if it.kind == "spell" then
			local ids = {}
			if type(msg) == "table" and type(msg.order) == "table" then
				for i = 1, math.min(#msg.order, 12) do ids[i] = tostring(msg.order[i]) end
			end
			local byId = {}
			for _, b in ipairs(it.blocks) do byId[b.id] = b.t end
			local seen, dup, parts = {}, false, {}
			for i, id in ipairs(ids) do
				if seen[id] then dup = true end
				seen[id] = true
				parts[i] = byId[id] or "?"
			end
			given = dup and "" or table.concat(parts, "")
			correct = (#ids == #it.blocks) and (given == it.answer)
		else
			given = string.sub(tostring(type(msg) == "table" and msg.choice or ""), 1, 20)
			correct = given == it.answer
		end
		session.judged = session.judged + 1
		if correct then session.right = session.right + 1 end
		session.log[#session.log + 1] = { key = it.key, kind = it.kind, correct = correct, phase = it.phase, quarter = it.quarter }
	end
	session.at = session.at + 1
	-- はじめの すうもん：もじが ぜんぶ できたら ことばを よむ もんだいへ、よめなければ もじへ（まだ して いない ほうを たす）。
	if session.mode == "place" and session.at >= #session.items then
		local hasL, hasW, allL, rightW = false, false, true, 0
		for _, x in ipairs(session.log) do
			if x.phase == "L" then hasL = true if not x.correct then allL = false end end
			if x.phase == "W" then hasW = true if x.correct then rightW = rightW + 1 end end
		end
		if hasL and not hasW and allL then
			for _, q in ipairs(placeWords()) do session.items[#session.items + 1] = q end
		elseif hasW and not hasL and rightW <= 1 then
			for _, q in ipairs(placeLetters(session.order)) do session.items[#session.items + 1] = q end
		end
	end
	return {
		teach = it.teach == true, correct = correct, given = given, answer = (not it.teach) and it.answer or nil,
		parts = (it.kind == "spell") and it.parts or nil, over = session.at >= #session.items, item = it,
	}
end

-- 1 かいぶんが おわった：きろくを すすめる。
local function finish(progress, session, now)
	local of = session.judged
	local right = session.right
	local passed = of > 0 and (right / of) >= PASS
	local out = { mode = session.mode, right = right, of = of, passed = passed, advanced = nil }
	progress.rounds = progress.rounds + 1
	progress.at = now or 0
	-- にがて：まちがえた もじ・きまりを ためる。ふくしゅうで できたら へらす。
	for _, x in ipairs(session.log) do
		if not x.correct then
			progress.weak[x.key] = math.min(5, (progress.weak[x.key] or 0) + 1)
		elseif session.mode == "review" and progress.weak[x.key] then
			progress.weak[x.key] = progress.weak[x.key] - 1
			if progress.weak[x.key] <= 0 then progress.weak[x.key] = nil end
		end
	end
	if session.mode == "place" then
		local byQ = {}
		local anyL, anyW, allW = false, false, true
		for _, x in ipairs(session.log) do
			if x.phase == "L" then
				anyL = true
				if byQ[x.quarter] == nil then byQ[x.quarter] = x.correct == true end
			end
			if x.phase == "W" then anyW = true if not x.correct then allW = false end end
		end
		local known = 0 -- はじめから つづけて できた 4 ぶんの 1 の かず
		if anyL then
			while known < 4 and byQ[known] == true do known = known + 1 end
		else
			known = 4
		end
		local qs = quarters(session.order)
		for i = 1, known do
			for _, l in ipairs(qs[i]) do progress.letters[l] = { done = true, placed = true } end
		end
		local all = known == 4
		if all and anyW and allW then
			for _, u in ipairs(units()) do
				if u.type == "cvc" then progress.rules[u.id] = { done = true, placed = true } end
			end
		end
		progress.placed = true
		progress.track = all and "elem" or "kinder"
		out.placed = { track = progress.track, letters = lettersDone(progress), rules = rulesDone(progress) }
		out.passed = true
	elseif session.mode == "letter" and passed then
		progress.letters[session.letter] = { done = true }
		progress.weak["L:" .. session.letter] = nil
		out.advanced = { letter = session.letter }
		if lettersDone(progress) == 26 then
			progress.track = "elem"
			out.advanced.stage = "elem"
		end
	elseif session.mode == "unit" and passed then
		progress.rules[session.unit] = { done = true }
		progress.weak["R:" .. session.unit] = nil
		out.advanced = { unit = session.unit }
		local every = true
		for _, u in ipairs(units()) do if not (progress.rules[u.id] and progress.rules[u.id].done) then every = false end end
		if every then
			progress.finished = true
			out.advanced.finished = true
		end
	end
	return out
end

-- ことば → え（emoji）。
local EMOJI = nil
local function emojiOf(word)
	if not EMOJI then
		EMOJI = {}
		for _, l in ipairs(ALPHA) do for _, w in ipairs(DATA.letters[l].words) do EMOJI[w.w] = w.e end end
		for _, w in ipairs(DATA.cvc) do EMOJI[w.w] = w.e end
		for _, g in ipairs(DATA.digraphs) do for _, w in ipairs(g.words) do EMOJI[w.w] = w.e end end
		for _, g in ipairs(DATA.magicE) do for _, w in ipairs(g.words) do EMOJI[w.w] = w.e end end
	end
	return EMOJI[word] or ""
end
-- がめんに わたす 1 もん：もんだいに でる ことばの え（emoji）を そえる。
local function publicQ(session)
	local q = question(session)
	if not q then return nil end
	local images = {}
	if q.word then images[q.word] = emojiOf(q.word) end
	if q.kind == "sound" and q.say then images[q.say] = emojiOf(q.say) end
	if (q.kind == "picture" or q.kind == "blend") and q.choices then
		for _, c in ipairs(q.choices) do images[c] = emojiOf(c) end
	end
	if q.lines then for _, ln in ipairs(q.lines) do if ln.word then images[ln.word] = emojiOf(ln.word) end end end
	q.images = images
	return q
end
local function stateFor(progress)
	local st = publicState(progress)
	st.pictures = { ready = 1, total = 1, playable = true } -- えは emoji なので いつでも あそべる
	return st
end

-- たしかめる とき（Roblox の そとの Lua）だけ、きまりを そとへ わたす。
local RULES = {
	data = DATA, units = units, ruleUnits = ruleUnits, blankProgress = blankProgress, sanitizeProgress = sanitizeProgress,
	lettersDone = lettersDone, rulesDone = rulesDone, weakKeys = weakKeys, nextOf = nextOf, publicState = publicState,
	startRound = startRound, question = question, publicQ = publicQ, answer = answer, finish = finish, stateFor = stateFor,
	setRng = function(f) rng = f end,
}
if type(_G) == "table" and type(_G.__USPEAK_ABC_LOCAL_TEST) == "function" then _G.__USPEAK_ABC_LOCAL_TEST(RULES) end

-- ======================================================================================================
-- Roblox と つなぐ ところ
-- ======================================================================================================
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local BOARD_TAG = "USpeakAbcBoard"
local STORE_NAME = "USpeakAbcLocalV1"

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

-- ---- きろく（DataStore。つかえなければ その あいだだけ おぼえる）----------------------------------------
local store = nil
local storeTried = false
local warned = false
local function storeFailed(why)
	if not warned then
		warned = true
		warn("[uspeak abc] DataStore が つかえません。きろくは この あそびの あいだだけ です。(" .. tostring(why) .. ")")
	end
end
local function getStore()
	if storeTried then return store end
	storeTried = true
	local ok, s = pcall(function() return game:GetService("DataStoreService"):GetDataStore(STORE_NAME) end)
	if ok and s then store = s else storeFailed(s) end
	return store
end
local progressOf = {} -- [player] = きろく
local function keyOf(player) return "u" .. tostring(player.UserId) end
local function loadProgress(player)
	if progressOf[player] then return progressOf[player] end
	local raw = nil
	local s = getStore()
	if s then
		local ok, v = pcall(function() return s:GetAsync(keyOf(player)) end)
		if ok then raw = v else storeFailed(v) end
	end
	local p = sanitizeProgress(raw)
	progressOf[player] = p
	return p
end
local function saveProgress(player)
	local p = progressOf[player]
	local s = getStore()
	if not p or not s then return end
	local ok, err = pcall(function() s:SetAsync(keyOf(player), p) end)
	if not ok then storeFailed(err) end
end

-- ---- 1 にんぶんの 1 かい -------------------------------------------------------------------------------
local sessions = {} -- [player] = { round = …, busy = false }
local ERRORS = {
	nothing = "ぜんぶ できたよ！ すごいね。",
	["no review"] = "いまは にがてな ものが ないよ。",
}
local function errorText(code) return ERRORS[tostring(code)] or "いまは できないよ。もう いちど ためしてね。" end

local function openBoard(player)
	sessions[player] = nil
	Show:FireClient(player, { state = stateFor(loadProgress(player)) })
end

Start.OnServerInvoke = function(player, review)
	local old = sessions[player]
	if old and old.busy then return nil end
	local progress = loadProgress(player)
	local round = startRound(progress, { review = review == true, hi = false })
	if not round or #round.items == 0 then
		sessions[player] = nil
		return { error = errorText(review == true and "no review" or "nothing") }
	end
	sessions[player] = { round = round, busy = false }
	return { q = publicQ(round), state = stateFor(progress) }
end

Answer.OnServerInvoke = function(player, given)
	local s = sessions[player]
	if not s or s.busy or type(given) ~= "table" then return nil end
	local msg = {}
	if given.seen == true then
		msg.seen = true
	elseif type(given.order) == "table" then
		msg.order = given.order
	elseif type(given.choice) == "string" then
		msg.choice = given.choice
	else
		return nil
	end
	s.busy = true
	local out = answer(s.round, msg)
	if not out then
		s.busy = false
		sessions[player] = nil
		return { error = errorText("") }
	end
	local summary, st, nextQ = nil, nil, nil
	if out.over then
		local progress = loadProgress(player)
		summary = finish(progress, s.round, os.time())
		sessions[player] = nil
		saveProgress(player)
		st = stateFor(progress)
	else
		nextQ = publicQ(s.round)
		s.busy = false
	end
	return {
		teach = out.teach == true, correct = out.correct == true, answer = out.answer, parts = out.parts,
		over = out.over == true, next = nextQ, summary = summary, state = st,
	}
end

Quit.OnServerEvent:Connect(function(player) sessions[player] = nil end)
Players.PlayerRemoving:Connect(function(player)
	sessions[player] = nil
	saveProgress(player)
	progressOf[player] = nil
end)

-- ---- はいった しゅんかんに ひらく -----------------------------------------------------------------------
local function openOnJoin(player)
	task.delay(2, function()
		if player.Parent then openBoard(player) end
	end)
end
Players.PlayerAdded:Connect(openOnJoin)
for _, player in ipairs(Players:GetPlayers()) do openOnJoin(player) end

-- ---- いりぐち（タグ USpeakAbcBoard の Part）-------------------------------------------------------------
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
