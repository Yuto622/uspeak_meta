#!/usr/bin/env python3
"""えほん（よみもの島）の place の「一発 セットアップ」（Roblox Studio の コマンドバーに はる 1 本）を 作る。

roblox/ の スクリプト 3 つ（USpeakBooks・USpeakBooksClient・USpeakWalletSync）を 中に 入れた Lua を
roblox/setup-books-place.lua に 書く。スクリプトを なおしたら これを 走らせて 作りなおす。鍵は 入れない（Roblox の Secrets から 読む）。
本・絵の 番号は ここには 書かない：ゲームが 動く ときに Web の サーバー（/api/roblox/books）から もらう。

Run: python3 scripts/make-roblox-books-setup.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
R = ROOT / 'roblox'
STAGES = ['A', 'B', 'C', '1', '2', '3', '4', '5', '6', '7', '8', '9']
COLORS = ['#E2574C', '#E27A2D', '#D99A1E', '#4FA868', '#2F9A9A', '#3F86D0', '#5A66C8', '#8A5CC0', '#C0589A', '#3CA06E', '#28A0AA', '#4682DC']


def src(name):
    text = (R / name).read_text(encoding='utf-8')
    assert ']=====]' not in text, name
    return f'[=====[{text}]=====]'


def main():
    shelves = ',\n'.join(f'  {{ "{s}", Color3.fromHex("{c}") }}' for s, c in zip(STAGES, COLORS))
    lua = f'''-- U-Speak えほん（よみもの島）の place：一発 セットアップ（Roblox Studio の 表示 → コマンドバー に まるごと はって Enter）
-- scripts/make-roblox-books-setup.py が 作る ファイル。手で なおさない。何回 走らせても 同じ 形に なる（前の ぶんは 入れかえ）。
-- やること：① スクリプト 3 つを 入れる ② HTTP を オン（できれば）③ 本だな 12 こ（レベル A〜9）を ならべる ④ のこりの 手作業を 表示する
-- 本と 絵は ここには 入って いません：ゲームが 動く ときに Web の サーバーから もらいます（審査を 通った 絵だけ 出ます）。
--
-- コマンドでは できない こと（この あと 手で する）：
--   1. Creator Hub → この体験 → Secrets に USPEAK_WEB_KEY（メインワールドと 同じ 値）を 入れる。
--   2. HTTP が オンに ならなかった ときは、Game Settings → Security → Allow HTTP Requests を オンに する。
--   3. File → Publish to Roblox で 公開する（Secrets は 公開した 体験で だけ 読める）。
--   4. 絵は Web の 管理ページ（/admin/roblox-books）で 上げて、Roblox の 審査を まつ。まだの ページは「じゅんびちゅう」と 出る。
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

-- ① スクリプト（コインを Web と そろえる USpeakWalletSync も 入れる。もう 入って いれば 入れかえ）
put(ServerScriptService, "Script", "USpeakBooks", {src('USpeakBooks.server.luau')})
put(ServerScriptService, "Script", "USpeakWalletSync", {src('USpeakWalletSync.server.luau')})
put(StarterPlayerScripts, "LocalScript", "USpeakBooksClient", {src('USpeakBooksClient.client.luau')})

-- ② HTTP（Web の サーバーと 話す）
local httpOk = pcall(function() game:GetService("HttpService").HttpEnabled = true end)

-- ③ 本だな：レベルごとに 1 つ（タグ USpeakBookShelf・属性 Stage）。近づいて「よむ」を おすと その レベルの 本だなが ひらく。
local SHELVES = {{
{shelves}
}}
local old = workspace:FindFirstChild("USpeakBookShelves")
if old then old:Destroy() end
local folder = Instance.new("Folder")
folder.Name = "USpeakBookShelves"
folder.Parent = workspace
for i, s in ipairs(SHELVES) do
	local p = Instance.new("Part")
	p.Name = "Shelf_" .. s[1]
	p.Anchored = true
	p.Size = Vector3.new(6, 8, 2)
	p.Position = Vector3.new((i - 6.5) * 8, 4, -24)
	p.Color = s[2]
	p.Material = Enum.Material.Wood
	p:SetAttribute("Stage", s[1])
	CollectionService:AddTag(p, "USpeakBookShelf")
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "よむ"
	prompt.ObjectText = "えほん レベル " .. s[1]
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.Parent = p
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(150, 60)
	bb.StudsOffset = Vector3.new(0, 6, 0)
	bb.AlwaysOnTop = true
	bb.Parent = p
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = "レベル " .. s[1]
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.3
	t.Parent = bb
	p.Parent = folder
end

-- ④ のこりの 手作業
print("✅ できました：えほんの スクリプト 3 つ と 本だな 12 こ（レベル A〜9）を 入れました。" .. (httpOk and "HTTP も オンに しました。" or ""))
if not httpOk then warn("⚠ HTTP を オンに できませんでした：Game Settings → Security → Allow HTTP Requests を オンに してください。") end
warn("⚠ Secrets の USPEAK_WEB_KEY は コマンドでは 入れられません：Creator Hub → この体験 → Secrets で メインワールドと 同じ 値を 入れてください。")
warn("⚠ 絵は Web の 管理ページ /admin/roblox-books で 上げます。審査が おわった 絵から 本に 出ます（まだの ページは「じゅんびちゅう」）。")
print("さいごに File → Publish to Roblox で 公開してください。")
'''
    (R / 'setup-books-place.lua').write_text(lua, encoding='utf-8')
    print('roblox/setup-books-place.lua', len(lua.encode()), 'bytes')


if __name__ == '__main__':
    main()
