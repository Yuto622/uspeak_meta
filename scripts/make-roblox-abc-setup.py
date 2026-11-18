#!/usr/bin/env python3
"""「ABC と おと」の place の「一発 セットアップ」（Roblox Studio の コマンドバーに はる 1 本）を 作る。

roblox/ の スクリプト 2 つ（USpeakAbc・USpeakAbcClient）を 中に 入れた Lua を roblox/setup-abc-place.lua に 書く。
スクリプトを なおしたら これを 走らせて 作りなおす。鍵は 入れない（Roblox の Secrets から 読む）。

Run: python3 scripts/make-roblox-abc-setup.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
R = ROOT / 'roblox'


def src(name):
    text = (R / name).read_text(encoding='utf-8')
    assert ']=====]' not in text, name
    return f'[=====[{text}]=====]'


def main():
    lua = f'''-- U-Speak「ABC と おと」の place：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-abc-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 2 つを 入れる ② HTTP を オン（できれば）③ 入口（「ABC と おと」の かんばん）を 置く ④ のこりの 手作業を 表示する
--
-- コマンドでは できない こと（この あと 手で する）：
--   1. Creator Hub → この体験 → Secrets に USPEAK_WEB_KEY（メインワールドと 同じ 値）を 入れる。
--   2. HTTP が オンに ならなかった ときは、Game Settings → Security → Allow HTTP Requests を オンに する。
--   3. File → Publish to Roblox で 公開する（Secrets は 公開した 体験で だけ 読める）。
--   4. 絵カードの 画像は Web の 管理ページ（/admin/roblox-books）で 上げて、Roblox の 審査を まつ。そろうまで 画面は「えを じゅんびちゅう」。
--      画像の 持ち主（ROBLOX_CREATOR_USER_ID か GROUP_ID）は この 体験の 持ち主と 同じに する。
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayerScripts = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
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

-- ① スクリプト
put(ServerScriptService, "Script", "USpeakAbc", {src('USpeakAbc.server.luau')})
put(StarterPlayerScripts, "LocalScript", "USpeakAbcClient", {src('USpeakAbcClient.client.luau')})

-- ② HTTP（Web の サーバーと 話す）
local httpOk = pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 入口：「ABC と おと」の かんばん（タグ USpeakAbcBoard）。近づいて「あそぶ」を おすと ひらく。
local old = workspace:FindFirstChild("USpeakAbcBoard")
if old then old:Destroy() end
local model = Instance.new("Model")
model.Name = "USpeakAbcBoard"
local board = Instance.new("Part")
board.Name = "Board"
board.Anchored = true
board.Size = Vector3.new(14, 9, 1)
board.Position = Vector3.new(0, 5.5, -24)
board.Color = Color3.fromRGB(240, 180, 60)
board.Material = Enum.Material.SmoothPlastic
board.Parent = model
CollectionService:AddTag(board, "USpeakAbcBoard")
local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "あそぶ"
prompt.ObjectText = "ABC と おと"
prompt.HoldDuration = 0
prompt.MaxActivationDistance = 14
prompt.RequiresLineOfSight = false
prompt.Parent = board
local face = Instance.new("SurfaceGui")
face.Face = Enum.NormalId.Back
face.CanvasSize = Vector2.new(700, 450)
face.Parent = board
local title = Instance.new("TextLabel")
title.Size = UDim2.fromScale(1, 0.55)
title.BackgroundTransparency = 1
title.Text = "A B C"
title.TextScaled = true
title.Font = Enum.Font.FredokaOne
title.TextColor3 = Color3.new(1, 1, 1)
title.Parent = face
local sub = Instance.new("TextLabel")
sub.Size = UDim2.fromScale(1, 0.35)
sub.Position = UDim2.fromScale(0, 0.58)
sub.BackgroundTransparency = 1
sub.Text = "ABC と おと"
sub.TextScaled = true
sub.Font = Enum.Font.GothamBold
sub.TextColor3 = Color3.fromRGB(35, 50, 74)
sub.Parent = face
-- かんばんの 両がわの 色の つみき（かざり）。
local COLORS = {{ Color3.fromRGB(226, 87, 76), Color3.fromRGB(79, 168, 104), Color3.fromRGB(63, 134, 208) }}
for i, c in ipairs(COLORS) do
	local b = Instance.new("Part")
	b.Name = "Block" .. i
	b.Anchored = true
	b.Size = Vector3.new(3, 3, 3)
	b.Position = Vector3.new((i - 2) * 4, 1.5, -20)
	b.Color = c
	b.Material = Enum.Material.SmoothPlastic
	b.Parent = model
end
model.Parent = workspace

-- ④ のこりの 手作業
print("✅ できました：「ABC と おと」の スクリプト 2 つ と 入口（かんばん）を 入れました。" .. (httpOk and "HTTP も オンに しました。" or ""))
if not httpOk then warn("⚠ HTTP を オンに できませんでした：Game Settings → Security → Allow HTTP Requests を オンに してください。") end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
warn("⚠ 絵カードは Web の 管理ページ /admin/roblox-books で 上げます。Roblox の 審査が おわるまで 画面は「えを じゅんびちゅう」と 出ます。")
print("さいごに File → Publish to Roblox で 公開してください。")
'''
    (R / 'setup-abc-place.lua').write_text(lua, encoding='utf-8')
    print('roblox/setup-abc-place.lua', len(lua.encode()), 'bytes')


if __name__ == '__main__':
    main()
