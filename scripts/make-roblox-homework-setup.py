#!/usr/bin/env python3
"""宿題プレースの「一発 セットアップ」（Roblox Studio の コマンドバーに はる 1 本）を 作る。

roblox/ の 3 つ（USpeakFormatUI・USpeakHomework・USpeakHomeworkClient）を 中に 入れた Lua を
roblox/setup-homework-place.lua に 書く。スクリプトを なおしたら これを 走らせて 作りなおす。

Run: python3 scripts/make-roblox-homework-setup.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
R = ROOT / 'roblox'
MAIN_PLACE = 139338411931177


def src(name):
    text = (R / name).read_text(encoding='utf-8')
    assert ']=====]' not in text, name
    return f'[=====[{text}]=====]'


def main():
    lua = f'''-- ============================================================
-- 📚 U-Speak 宿題プレース：一発 セットアップ（宿題プレースを Studio で ひらき、表示 → コマンドバー に まるごと はって Enter）
--   scripts/make-roblox-homework-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
--   ① メインワールドと 同じ 問題の 画面（USpeakFormatUI ＋ えらぶ）② 宿題の サーバーと 画面 ③ HTTP オン
--   ④ しゅくだいの へや（看板・つくえ 6 こ・スタート地点）
--   宿題は Web で 先生が クラスに くばった もの。とちゅうまでの すすみぐあいも ごほうびも Web と 同じ。
-- ============================================================
local RunService = game:GetService("RunService")
if not RunService:IsEdit() then warn("⚠ テストプレイを停止して、編集モードのコマンドバーで実行してください") return end
if game.PlaceId == {MAIN_PLACE} then warn("⚠ ここは メインワールドです。宿題プレースを ひらいて 実行してください（何も変更していません）") return end
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
put(ReplicatedStorage, "ModuleScript", "USpeakFormatUI", {src('USpeakFormatUI.luau')})
put(ServerScriptService, "Script", "USpeakHomework", {src('USpeakHomework.server.luau')})
put(StarterPlayerScripts, "LocalScript", "USpeakHomeworkClient", {src('USpeakHomeworkClient.client.luau')})

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
		for _, dx in ipairs({{ -3.6, 3.6 }}) do
			for _, dz in ipairs({{ -1.9, 1.9 }}) do part(Vector3.new(0.5, 2.7, 0.5), C3(90, 70, 50), CFrame.new(x + dx, Y + 1.35, z + dz)) end
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
'''
    (R / 'setup-homework-place.lua').write_text(lua, encoding='utf-8')
    print('wrote', R / 'setup-homework-place.lua', len(lua))


if __name__ == '__main__':
    main()
