--!strict
-- U-Speak 英検ドリル ワールド（Roblox 側・画面）— USpeakDrill.server.luau から 来た 1 問を、メインワールドの
-- 7 形式の 画面（USpeakFormatUI）で 見せて、答えを サーバーに 返す。
--
-- 置き場所：ドリル用の place の StarterPlayerScripts（LocalScript）。メインワールドの USpeakFormatUI（ModuleScript）を
-- この place の ReplicatedStorage に コピーして おく。
--
-- **メインワールドの USpeakFormatUI の 呼びかたに あわせて、下の 「画面（ここだけ あわせる）」の 3 つだけ 書きかえる。**
-- 来る 問題（public）は web版と 同じ 形（formats-core.js の publicFormat）：
--   mc     { kind, word, choices, prompt? }          match  { kind, left, right }
--   spell  { kind, ja, letters, say }                type   { kind, ja, length, say, hint?（2 回目）}
--   order  { kind, ja, words }                       fill   { kind, ja, before, after, cards }
--   listen { kind, word（読み上げる 英語）, choices }
-- 答えの 形は USpeakDrill.server.luau の 先頭の 表。正解・答えは サーバーから 来た ものだけを 見せる（画面では 決めない）。

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Show = ReplicatedStorage:WaitForChild("USpeakDrillShow") :: RemoteEvent
local Answer = ReplicatedStorage:WaitForChild("USpeakDrillAnswer") :: RemoteFunction
local Quit = ReplicatedStorage:WaitForChild("USpeakDrillQuit") :: RemoteEvent
local FormatUI = require(ReplicatedStorage:WaitForChild("USpeakFormatUI")) :: any

-- ---- 画面（ここだけ あわせる）---------------------------------------------------------------------
-- 1 問 出す。子どもが 答えたら submit(answer) を 呼ぶ。✕ で とじたら onClose()。
local function render(public: any, header: string, submit: (any) -> (), onClose: () -> ())
	FormatUI.Show(public, { header = header, onSubmit = submit, onClose = onClose })
end
-- 判定の 結果を 見せる（correct・reveal（答え）・retry（2 回目の 形）・coins）。
local function feedback(result: any)
	FormatUI.Feedback(result)
end
-- セットの おわり／エラー
local function finish(summary: any)
	FormatUI.Hide()
	if summary.error then warn(summary.error) end
end

-- ---- サーバーと つなぐ（ここは かえない）-----------------------------------------------------------
local function submit(answer: any)
	local r = Answer:InvokeServer(answer)
	if not r or r.error then
		feedback({ error = true })
		return
	end
	feedback(r)
end

Show.OnClientEvent:Connect(function(msg: any)
	if type(msg) ~= "table" then return end
	if msg.done or msg.error then
		finish(msg)
		return
	end
	render(msg.public, ("%s  %d / %d"):format(msg.grade or "", msg.index or 0, msg.total or 0), submit, function()
		Quit:FireServer()
		FormatUI.Hide()
	end)
end)
