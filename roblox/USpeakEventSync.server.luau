--!strict
-- U-Speak 学習の 記録を Web に すぐ 送る（Roblox 側）— 保護者ページ（/report/<アカウント名>）が リアルタイムに 更新される。
--
-- 置き場所：ServerScriptService（Script）。Creator Hub → Secrets に USPEAK_WEB_KEY（サーバーの USPEAK_ROBLOX_KEY と同じ値）。
-- Game Settings → Security → Allow HTTP Requests を ON。
--
-- 使い方：クイズの 判定の 直後などに、サーバーの スクリプトから
--   _G.USpeakTrack(player, "quiz", { level = "5", word = "apple", correct = true, fast = false, retry = false, ms = 2300 }, "fishing")
-- を 呼ぶだけ。いままで 30 秒ごとに まとめて 送って いた スクリプトが あれば、その track の 中身を これに 置きかえる。
--
-- 約束（docs/ROBLOX_SYNC.md）：
--   * 記録が 出てから 2 秒後に 送る（その間の 記録は 1 回に まとめる）。100 件 たまったら すぐ。
--   * 送れなかった ぶんは 15 秒ごとに 送りなおす。id が 同じなので 二重に ならない。
--   * 子が 出る とき・サーバーを 閉じる ときは のこりを 送ってから。

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local BASE = "https://uspeak-multiplayer.fly.dev/api/roblox"
local KEY = HttpService:GetSecret("USPEAK_WEB_KEY")
local WORLD = "main"                 -- この プレースの 名前（main / fishing / drill など）
local DELAY = 2                      -- 記録が 出てから 送るまで（秒）
local RETRY = 15                     -- 送りなおし（秒）
local MAX_BATCH = 100
local MAX_QUEUE = 2000               -- つながらない あいだに ためる 上限（古い ものから すてる）

local queue: { any } = {}
local seq = 0
local scheduled = false
local sending = false

local function post(path: string, body: any): any?
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. path,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["X-USpeak-Key"] = KEY:AddPrefix("") },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok or not res.Success then
		warn("[uspeak] " .. path .. " failed", ok and res.StatusCode or res)
		return nil
	end
	local decoded
	pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
	return decoded or {}
end

local function flush()
	scheduled = false
	if sending or #queue == 0 then return end
	sending = true
	while #queue > 0 do
		local batch = {}
		for i = 1, math.min(MAX_BATCH, #queue) do batch[i] = queue[i] end
		local r = post("/events", { batchId = tostring(os.time()) .. "-" .. tostring(seq), placeId = tostring(game.PlaceId), world = WORLD, events = batch })
		if not r then break end                      -- 失敗：のこして つぎの 回に
		for _ = 1, #batch do table.remove(queue, 1) end
	end
	sending = false
end

local function track(player: Player, kind: string, data: any?, world: string?)
	seq += 1
	table.insert(queue, {
		id = tostring(player.UserId) .. "-" .. tostring(os.time()) .. "-" .. tostring(seq) .. "-" .. string.sub(game.JobId, 1, 8),
		ts = os.time(), type = kind, username = player.Name, userId = tostring(player.UserId),
		classCode = player:GetAttribute("ClassCode") or "", world = world or WORLD, data = data or {},
	})
	while #queue > MAX_QUEUE do table.remove(queue, 1) end
	if #queue >= MAX_BATCH then
		task.spawn(flush)
	elseif not scheduled then
		scheduled = true
		task.delay(DELAY, flush)
	end
end

_G.USpeakTrack = track

-- 出る ときは のこりを すぐ 送る（学習時間の session は いままでの スクリプトが 送って いる ものを そのまま：ここでは 二重に 数えない）。
Players.PlayerRemoving:Connect(function()
	task.spawn(flush)
end)

task.spawn(function()
	while true do
		task.wait(RETRY)
		flush()
	end
end)

game:BindToClose(function()
	flush()
end)
