#!/usr/bin/env python3
"""英検ドリル ワールドの「一発 セットアップ」（Roblox Studio の コマンドバーに はる 1 本）を 作る。

roblox/ の スクリプト 3 つ（USpeakDrill・USpeakDrillClient・USpeakWalletSync）を 中に 入れた Lua を
roblox/setup-drill-place.lua に 書く。スクリプトを なおしたら これを 走らせて 作りなおす。

Run: python3 scripts/make-roblox-drill-setup.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
R = ROOT / 'roblox'
GRADES = ['5級', '4級', '3級', '準2級', '2級', '準1級以上', 'ジュニア']
COLORS = ['#3CA06E', '#28A0AA', '#4682DC', '#8C50D2', '#E27A2D', '#E66496', '#E0A020']


def src(name):
    text = (R / name).read_text(encoding='utf-8')
    assert ']=====]' not in text, name
    return f'[=====[{text}]=====]'


def main():
    gates = ',\n'.join(f'  {{ "{g}", Color3.fromHex("{c}") }}' for g, c in zip(GRADES, COLORS))
    lua = f'''-- U-Speak 英検ドリル ワールド：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-drill-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 3 つを 入れる ② HTTP を オン ③ 入口（級ごとの 台）を 7 つ 置く ④ たりない ものを 表示する
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

-- ① スクリプト
put(ServerScriptService, "Script", "USpeakDrill", {src('USpeakDrill.server.luau')})
put(ServerScriptService, "Script", "USpeakWalletSync", {src('USpeakWalletSync.server.luau')})
put(StarterPlayerScripts, "LocalScript", "USpeakDrillClient", {src('USpeakDrillClient.client.luau')})

-- ② HTTP（Web の サーバーと 話す）
pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 入口：級ごとの 台（タグ USpeakDrillGate・属性 Grade）。近づいて「とく」を おすと 10 問。
local GATES = {{
{gates}
}}
local old = workspace:FindFirstChild("USpeakDrillGates")
if old then old:Destroy() end
local folder = Instance.new("Folder")
folder.Name = "USpeakDrillGates"
folder.Parent = workspace
for i, g in ipairs(GATES) do
	local p = Instance.new("Part")
	p.Name = "Gate_" .. g[1]
	p.Anchored = true
	p.Size = Vector3.new(6, 1, 6)
	p.Position = Vector3.new((i - 4) * 9, 0.5, -20)
	p.Color = g[2]
	p.Material = Enum.Material.SmoothPlastic
	p:SetAttribute("Grade", g[1])
	CollectionService:AddTag(p, "USpeakDrillGate")
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "とく"
	prompt.ObjectText = "英検 " .. g[1]
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 10
	prompt.Parent = p
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(160, 50)
	bb.StudsOffset = Vector3.new(0, 4, 0)
	bb.AlwaysOnTop = true
	bb.Parent = p
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = g[1]
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.3
	t.Parent = bb
	p.Parent = folder
end

-- ④ たりない もの
print("✅ U-Speak 英検ドリル：スクリプト 3 つ・HTTP・入口 7 つ を 入れました。File → Save to Roblox（または Publish）で 保存してください。")
if not ReplicatedStorage:FindFirstChild("USpeakFormatUI") then
	warn("⚠ ReplicatedStorage に USpeakFormatUI が ありません。メインワールドから コピーして ここに 貼りつけてください（7 形式の 画面）。")
end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
'''
    (R / 'setup-drill-place.lua').write_text(lua, encoding='utf-8')
    print('roblox/setup-drill-place.lua', len(lua.encode()), 'bytes')


if __name__ == '__main__':
    main()
