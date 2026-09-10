# Roblox → Web 移管：機能インベントリと仕分け

U-Speak Roblox（PlaceId 139338411931177）の全ダンプを読んだ結果です。
**スクリプト 398 本・全文**、**インスタンス 4,675 件**（装飾を除いた分）を解析しました。

まだコードは1行も書いていません。この文書の仕分けと島割りに承認をもらってから着手します。

---

## 0. 先に伝えること 3 点

### ① 武器の扱いは、私では決められません

`ServerScriptService.WeaponServer` はレベル制限つきで武器を配っており、`WeaponMenu` /
`WeaponShopUI` という UI もあります。つまり武器は**意図的に組み込まれた機能**です。
用途は `NightGhostManager` にあるとおり「⚔️ぶきで叩くと キラキラ弾けて Uコインを落とす」——
夜のおばけを叩いてコインを稼ぐ手段です。

ただし中身は shotgun / tommy gun / Famas / Handgun / Flare Gun です。**小学生向けの英語学習
サービスとして、実銃を Web 版に持ち込むかどうかは経営判断**であって、私が黙って決めることでは
ありません。同じフォルダに `Magical wand` もあり、Web 版にはすでに杖（`magic.js` / `wandModel`）が
あります。「おばけを叩く手段」だけ残して杖に一本化する案を推しますが、決めるのは U-Speak Lab です。

### ② 取り込みテンプレートが 175 本あります

398 本のうち 175 本は `City_Template`（街の建物キット・85本）、`ServerStorage.Weapons`（62本）、
`EnemyZombie`、`Famas Spawner`、`退避_テンプレ残骸` など、外部から取り込んだものでした。
`EnemyZombie` は `NightGhostManager` のコメントで「既存の ZombieManager を無効化すること」と
名指しで置き換え対象になっており、**すでに死んでいるコード**です。これらは移管対象外と判断しました。

### ③ ダンプに含まれていた資格情報

自動で伏せ字になったもの（**3 件とも `ServerScriptService` / `ServerStorage` にあり、プレイヤーからは
読めません。置き場所は正しいです**）:

| 場所 | 内容 |
|---|---|
| `ServerScriptService.AccessGate` | `TOKEN`（40文字） |
| `ServerScriptService._BAK_AccessGate_preautorecover` | 同上（旧版のバックアップ） |
| `ServerStorage.Secrets` | `OPENAI_API_KEY`（164文字） |

伏せ字にならなかったが、**扱いに注意が要る URL が 2 件**あります（変数名に key/token が入って
いなかったため素通りしました）:

- `ServerScriptService.Script` の GAS URL（クラスコード → PlaceId 照会）
- `ServerScriptService.ParentReportQRServer` の保護者レポート URL
  `https://uspeak-reports.pages.dev/treebell-c_RPqFBihvw/qr/index.json`

後者はパスの `treebell-c_RPqFBihvw` が推測不能な文字列であることだけで守られている構造です。
**この2つの URL は、いま私との会話履歴に平文で載っています。** 保護者の学習記録に繋がる導線なので、
心配なら発行し直してください（Roblox 側とレポート側の両方の差し替えが要ります）。

---

## 1. 機能インベントリ（38 系統）

### A. 学習の中核

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| A1 | AI英会話 | `AiChat.server.lua` v4 | 「ウーピー（Upee／フクロウ先生）」人格を全級プロンプトに固定。級別（5/4/3）に語彙・文法・文長を制約。TextService で入力と返答の両方をフィルタ（フェイルクローズ）、外部送信前に個人情報をスクラブ、AIエラーの生文言は出さない |
| A2 | 単語の小屋クイズ | `WordHouseQuiz_ServerOnly_ProximityPrompt` v4.7 (2,347行) | 入口タグ Easy/Medium/Hard。4択・選択肢シャッフル・🔊再読み上げ（読む文面はサーバー確定＝改ざん不可）。正解 +10XP +10🪙、10問パーフェクトで +10🪙 |
| A3 | 聞く・話すジム | `GymXP` v3 / `ListenSpeakGym` | 音声系は最高単価。正解 = 15XP + 5🪙 |
| A4 | えいごアリーナ | `BattleService` (529行) / `BattleQuizBank` / `BattleUI` (801行) | CPU戦（マスターウーピー3難易度）＋同サーバーPvP。わざ4種（ぽよん／えいごビーム／スーパーワード／にこにこヒール）。**出題と正解はサーバー保持、クライアントへは選択肢のみ**。日次上限150🪙 |
| A5 | NPC会話・キャラ図鑑 | `NpcTalkManager` / `CharWorldService` v1.2 / `TalkUI` / `CharLookAt` | NPCに「🦉 はなす」→ AI会話へ一本化。図鑑初登録 +5🪙 +5XP。16スタッド以内でこちらを向く |
| A6 | チャットXP | `ChatLevel.server.lua` v2 / `ChatXp.client.lua` | 1発話 = 5XP。3経路（Chatted / ChatXpEvent / AiChatEvent）を共通クールダウンで重複防止 |
| A7 | 読み上げ | `USpeakTTSClient` | |
| A8 | 宿題 | `StarterGui.HomeworkGui` | |
| A9 | フレーズ図鑑 | `PhraseDex` 属性 / `UspeakDexMark` | 使ったフレーズの記録 |

### B. 経済・進行（島ではなく「世界の仕組み」）

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| B1 | XP・レベル | `XPCore` v1.1 | 必要XP = `20 + Lv×10`。付与口は `UspeakGiveXP` に一本化 |
| B2 | 永続化 | `PlayerAttributeData` v5 | DataStore `SurvivalMaster_Ultimate_V1`。読込3回リトライ、失敗/破損セッションは保存禁止、UpdateAsync マージでレベル退行を物理的に禁止 |
| B3 | コイン | `Coins` 属性 / `UspeakGiveCoins` | 全機能の共通通貨 |
| B4 | デイリーログイン | `DailyLogin` (154行) | 日本時間12:00切替。7日サイクル 100→150→…→400🪙。Day7 は「10分おなかが減らない」バフ。途切れたら Day1 |
| B5 | 週間ランキング | `WeeklyRank` v1.2 | 学校コード別 TOP10、60秒ごとフラッシュ |
| B6 | シーズン | `SeasonManager` | 月連動（3-5春/6-8夏/9-11秋/12-2冬）で `SeasonArea` の建物を自動建て替え |
| B7 | キャラデータ永続化 | `CharDataStore` v1 | CharDex / CharMoves / OwnedOutfits / WornOutfits を別 DataStore に |

### C. 収集・育成

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| C1 | 釣り | `FishingManager` v4.5 (250行) / `釣り竿` | 100種。専用テンプレが無い種は汎用 RawFish を複製して名前・イラストを差し替え |
| C2 | 魚図鑑 | `FishDexService` v2 (200行) | 100種登録済み。初ゲット +10🪙。DataStore `USpeakFishDex_V1` |
| C3 | 魚の買取屋 | `FishBuyService` (244行) | レア度別に個別価格（ハズレ枠3🪙〜ゴールデン600🪙）。売却は全てサーバー権威（Tool実在確認→Destroy→加算） |
| C4 | 魚でわざを覚える | `FeedMoveService` | 魚ごとの固有わざを習得。常に1つ（上書き式）。バトルの「とくいわざ」になる |
| C5 | ペット | `PetService` (149行) / `PetUI` (764行) | たまご300🪙 → 6種ランダム孵化。ごはん20🪙（おなか+40, XP+5）／なでる（無料60秒CD, ごきげん+10, XP+2）。**オフライン中も減衰を計算** |
| C6 | 空腹 | `HungerManager` v2.3 / `HungerHUD` | |
| C7 | 持ち物上限 | `InvSwapService` (10個上限＋入れ替え) / `InventoryLimitManager` (魚は上限外・絶対に捨てない) | |

### D. 建築・住まい

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| D1 | 建築 | `BuildManager` v2 / `建築ハンマー` / `BuildBlockOptimizer` | グリッド3。購入ブロックの所有チェック。設置後は自動でアンカー＋影OFF＋接触判定OFF |
| D2 | マイルーム | `HousingService` v2.2 (312行) / `HousingUI` | **インスタンス方式**：街に置くのは入口だけ、部屋は入る瞬間に生成。容量は登録生徒数でなく在室人数にしか比例しない。レベル＋コインで引っ越し |
| D3 | 建築エリア | `BuildAreaGateTeleport` / `BuildAreaGate2Teleport` | 別プレイス（PlaceId 95969847608732）へテレポート |

### E. 世界・移動

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| E1 | 時間帯 | `TimeManager` | 昼300秒／夕120／夜240／朝45 |
| E2 | 夜のおばけ | `NightGhostManager` (307行) | ゾンビの審査セーフ置き換え。**血・死・恐怖ゼロ**。3D実体おばけ、4体に1体は🎃。触られると空腹が少し減るだけ（ダメージなし）。叩くとコインを落とす。朝に消える |
| E3 | 乗り物 | `VehicleGate` v3 (405行) / `VehicleNetOwner` | ティア別、Level+Coins で解放。条件を満たすと金色看板に変化。乗車で運転者にネットワークオーナー移譲 |
| E4 | 別ワールド移動 | `SchoolTeleportHandler` / `WorldSelectHub` / `RPGGatePreview` / `RaceGatePreview` | treebell（PlaceId 140641159224170）等へ |
| E5 | ミニマップ | `MiniMap` (628行) | |
| E6 | 環境音・音楽 | `SoundScatter`（鳥・草・風）/ `MusicManager` | |

### F. 見た目

| # | 機能 | Roblox 実装 |
|---|---|---|
| F1 | レベル連動の服 | `AutoOutfitByLevel` v2 / `ReplicatedStorage.OutfitByLevel`（`@RequiredLevel` 属性） |
| F2 | きせかえ | `OutfitShopUI` / `WardrobeMenu` / `EquipServer` / `USpeakClothesShop.OutfitShopServer` (609行) |
| F3 | 写真館 | `PhotoBoothUI` |

### G. 運用・教室

| # | 機能 | Roblox 実装 | 中身 |
|---|---|---|---|
| G1 | 入場ゲート | `AccessGate` v2.0 (393行) | **台帳で確認できた人だけ通す**。三重化（GAS 5分キャッシュ → DataStore スナップショット → 待機再試行）。GAS障害でも正規の子を締め出さず、部外者も通さない設計 |
| G2 | シート同期 | `SheetSync` v6.2 | 属性 → usage タブへ一方向送信。参加時／5分ごと（変化時のみ）／退出時。累計XPは保存せず Level と XP から毎回逆算 |
| G3 | 保護者レポートQR | `ParentReportQRServer` | Cloudflare Pages の index.json を5分キャッシュ |
| G4 | クラスコード照会 | `ServerScriptService.Script` | クラスコード → PlaceId を GAS に問い合わせ |

---

## 2. 移管仕分け

### そのまま作れる（Web の方がむしろ作りやすい）

A2 単語クイズ・A3 ジム・A4 アリーナ・A6 チャットXP・A9 フレーズ図鑑・
B1 XP・B3 コイン・B4 デイリーログイン・B5 週間ランキング・B6 シーズン・
C2 魚図鑑・C3 買取屋・C4 わざ習得・C5 ペット・C6 空腹・C7 持ち物上限・
E1 時間帯・E2 夜のおばけ・E5 ミニマップ・F1 レベル連動の服

すでに Web 版にあるサーバー権威の枠組み（`ClassRoom` / `economy.js` / `judge.js`）に
そのまま乗ります。判定と報酬をサーバーが確定する設計は Roblox 版と同じ思想です。

### 置き換えが要る

| Roblox | Web での置き換え | 理由 |
|---|---|---|
| B2 DataStore | Google スプレッドシート（実装済み）／`FileStore` | DataStore は Roblox 専用。**保存項目の対応表を作る必要があります** |
| G2 SheetSync | 実装済みの `SheetsStore` に統合 | 二重に持つ意味がない |
| G1 AccessGate | クラスコード＋名簿照合。三重化の設計思想はそのまま移植 | Roblox の PlayerId が無いので、本人特定の軸を決め直す必要あり |
| G3 保護者レポートQR | Web ならQRを介さず直接URLでよい | ブラウザからは共有が容易 |
| C1 釣り | Web 版に既に釣りがあります（100種・`fishing-data.js`） | **Roblox の100種と Web の100種が同じものか、突き合わせが要ります** |
| A1 AI英会話 | **すでにおつかい島で実装済み** | ただし人格が違います。Roblox は「ウーピー（フクロウ先生）」、Web は Emma/Oliver/Luna/Finn。統一するか決めてください |
| A5 NPC会話 | おつかい島の仕組みを流用 | |
| D1 建築 | Three.js でグリッド設置は作れる | ただし**同期と永続化のコストが最も高い**機能です |
| D2 マイルーム | インスタンス方式はそのまま踏襲できる | Roblox 版の設計が優秀なので、考え方ごと移せます |
| E3 乗り物 | 物理が別物。見た目と解放条件は移せる | Roblox の VehicleSeat 挙動は再現しない |
| F2 きせかえ | Web 版のアバター（`avatars.js`）を拡張 | Roblox の Shirt/Pants アセットは使えません |

### 落とすしかない（Roblox プラットフォーム機能）

| 項目 | 理由 |
|---|---|
| Roblox アバター・マーケットプレイス | 別プラットフォームの資産 |
| Robux 課金 | |
| Roblox チャット・モデレーション（TextService フィルタ） | **要注意。** A1 の安全設計は TextService に依存しています。Web 版では自前でフィルタを用意する必要があります |
| `TeleportService` による別プレイス移動（D3, E4） | Web では単に別の島／別URLになります |
| Roblox 物理エンジン（乗り物の挙動、ネットワークオーナーシップ） | |
| `InsertService`（F2 が使用） | |
| E6 の Roblox アセット音源 | 音源を用意し直す必要あり |

---

## 3. 島割り案

**まず前提を1つ。** 38 系統のうち **13 は「島」ではなく「世界の仕組み」** です
（B群のXP・コイン・永続化・ログイン・ランキング、C6 空腹、C7 持ち物、E1 時間帯、E5 ミニマップ、
F1 服、G群の運用）。これらは島を作るのではなく、いまの `ClassRoom` と `net-client` に足す層です。

残りを島にすると、こうなります。

### 既存の島に足すもの

| 島 | 足す機能 |
|---|---|
| **Willow Island**（既存） | C1 釣り（実装済み）、C3 魚の買取屋、C2 魚図鑑、F2 きせかえ店、F3 写真館 |
| **おつかい島**（既存） | A1 AI英会話（実装済み）、A5 NPC会話・キャラ図鑑 |
| **Wonder Park**（既存） | E3 乗り物のうち遊具寄りのもの |
| **10のRPG地域**（既存） | E2 夜のおばけ（夜だけ湧く）、C4 わざ習得 |

### 新しく作る島

| 島 | 機能 | 規模感 |
|---|---|---|
| **ことばの学校島** | A2 単語の小屋（Easy/Medium/Hard）、A3 聞く話すジム、A8 宿題 | 大 |
| **えいごアリーナ島** | A4 バトル（CPU3難易度＋PvP）、わざ4種 | 大 |
| **ペット島** | C5 ペット（たまご・孵化・ごはん・なでる） | 中 |
| **まちづくり島** | D1 建築、D2 マイルーム、ブロックショップ | 特大 |
| **のりもの島** | E3 乗り物の解放とコース | 中 |

## 4. 順番の提案

依存関係で決まります。**経済と永続化が全部の土台**なので、そこから始めないと
どの島も「作ったのに保存されない」状態になります。

1. **土台**（B1 XP・B3 コイン・B2 永続化の対応表・C7 持ち物）— 島ではないが最優先
2. **ことばの学校島**（A2 単語クイズ・A3 ジム）— 学習の本体。いちばん価値が高い
3. **えいごアリーナ島**（A4）— 学習の本体その2
4. **収集ループ**（C2 図鑑・C3 買取・C4 わざ）— Willow に足す。既存の釣りと繋がる
5. **ペット島**（C5）
6. **日課**（B4 ログイン・B5 ランキング・B6 シーズン）
7. **世界の演出**（E1 時間帯・E2 おばけ・E6 音）
8. **のりもの島**（E3）
9. **まちづくり島**（D1・D2）— 最も重く、他に依存しないので最後
10. **運用**（G1 入場ゲート・G3 保護者レポート）— 教室で使う直前に

## 5. 正直な工数感

**これは1回の作業では終わりません。** いまの Web 版に入っているマルチプレイ層と
おつかい島だけで、このセッション全部を使いました。上の1〜10は、それぞれが
同じかそれ以上の規模です。

なので**1つずつ、動くところまで作って確認してもらう**進め方を提案します。
「全部まとめて」にすると、動かないものが積み上がるだけになります。
