# ぼくじょう島 設計 — 牧場の一手一手が、英語の一言になる

牧場物語のリサーチ（`uspeak-farm-research.md`）で「毎日つづく理由」として抜き出した 9 つを、
そのまま英語学習の仕掛けにする。**体力の代わりに英語を払う**のがこの島の一行の設計。
牧場物語は道具を振るたびに体力が減る。ぼくじょう島は作業をするたびに英語を一つ出す。
正解すれば作業が進み、間違えれば進まない（種もコインも減らない。もう一度やればいい）。

## 1. 島（`client/dist/farm.json` の `island`）

| 建物 | id | 住人 | 中でやること | 英語の型 |
|---|---|---|---|---|
| 🌱 たねや | `seeds` | Hana | 種・動物・ジョウロを買う | 注文の文を並べる（I'd like three turnip seeds, please.） |
| 🌿 ビニールハウス | `house` | Gramps | 9 マスの畑：植える・水やり・収穫・片づけ | 植える＝作物の英単語を選ぶ／水やり＝穴うめ文／収穫＝複数形と数の文を並べる |
| 🐄 どうぶつ小屋 | `barn` | Taro | エサ・ブラシ・卵と牛乳と羊毛をとる | エサ＝命令文を並べる／ブラシ＝動物への一言を選ぶ／とる＝What does a cow give us? |
| 📦 しゅっか小屋 | `ship` | Zack | 出荷して コインにする、クラスの収穫祭 | 出荷伝票に品名を**つづる**（タイピング） |
| 🍳 だいどころ | `kitchen` | Mia | レシピで料理（売値 2 倍、贈り物） | 手順を First / Then / Next / Finally で並べる |

どの建物でも **住人と話す**（1 日 1 回、受け答えの選択）と **贈り物**（I brought you a strawberry.）ができ、
ハート（好感度）が上がる。ハートが店の品ぞろえ・小屋の動物・台所のレシピを解放する。

屋外には自分の畑（9 マス、芽→葉→実の 3 段階）と柵の中の動物が見える：牧場物語の「目に見える成長」。

## 2. 時間

- **1 日 = 世界時計の 1 周（705 秒）**。昼→夕→夜→朝。水やりは 1 日 1 回、エサも 1 日 1 回。
  授業 45 分で 3〜4 日まわるので、カブ（2 日）は 1 回の授業で収穫できる。
- **季節 = 本物の季節**（`daily.js seasonFor`：3〜5 月が春…）。季節の種しか店に並ばず、季節が変わると畑の作物は枯れる
  （片づける＝ Pull the weeds. も英語の一手）。春夏秋冬 4 つずつ、16 の作物。
- 週（`weekIndex`）ごとに **クラスの収穫祭**：クラス全員の出荷額を合算して しゅっか小屋の掲示板に出す。

## 3. 作物・動物・道具（`farm.json` の `crops` / `animals` / `tools` / `recipes`）

牧場物語の段差をそのまま：早くて安いカブ → 連作できるキュウリ・トマト → ニワトリ → ウシ → 金のジョウロ。

- 作物：`{id, en, ja, emoji, season, days, regrow, seed, sell}`。`days` は水をやった日数。`regrow` があるものは収穫後その日数で次がなる。
- 動物：ニワトリ（卵）、ヒツジ（羊毛）、ウシ（牛乳）。エサ・ブラシでハート。ハートで副産物の値段が上がる（卵 50→80→150G の段差を縮尺）。エサを忘れた日は副産物なし。
- ジョウロ：Lv1 は 1 問で 1 マス、Lv2 で 2 マス、Lv3 で 3 マス（牧場物語の銅→銀→金）。
- レシピ：材料 2 つ、売値は材料の 2 倍。贈り物にすると ハート +2。

## 4. 英語（`server/src/game/farm-bank.json`、サーバーの外に出ない）

| 型 | 中身 | 技能 |
|---|---|---|
| `word` | 日本語（と絵文字）→ 英単語を 4 択 | read |
| `fill` | 牧場の文の穴うめ 4 択（I ___ the plants every morning.） | read |
| `order` | 単語カードを並べて文を作る（注文・収穫の報告・エサの命令文・料理の手順） | write |
| `spell` | 日本語とヒントから英単語をつづる（出荷伝票） | write |
| `reply` | 住人の一言に 受け答えを選ぶ（How's your farm? → It's going well, thank you.） | speak |

- 答えはサーバーだけが持つ。クライアントには問題文・選択肢・カードだけ（`farm:ask`）。
- 判定は `farm:answer` でサーバー。正解で作業が進み、学習ログ（`appendLearning`、mode `farm-<型>`）・XP・コインが入る。
  コインは出荷でしか増えず、1 日の上限は `dailyCoinCap`。
- 不正解は作業が進まないだけ。正解が表示され、もう一度できる（種は減らない）。

## 5. プロトコル（すべて位置ゲートつき、`ClassRoom.atPlace`）

```
farm:peek                      → farm:state  （どこからでも。屋外の畑を描くため）
farm:open  {spot}              → farm:state  （その建物にいること）
farm:act   {act, ...}          → farm:ask {qid, act, kind, prompt, choices|tokens|hint}  or farm:error
farm:answer{qid, answer}       → farm:result {correct, answer, effect, farm, wallet, progress}
farm:board                     → farm:board {week, total, top[]}
```
`act`: `buy(item, qty)` `plant(plot, crop)` `water` `harvest(plot)` `clear(plot)` `feed(animal)` `brush(animal)`
`collect(animal)` `ship(item, qty)` `cook(recipe)` `talk` `gift(item)`。

## 6. 保存

`farm_json` 1 列（append-only の末尾）。`{plots[], seeds{}, items{}, animals[], can, hearts{}, talked{}, dex[], shipped, week{key,coins}}`。
`farm_coins` で 1 日の上限。保護者レポートに「ぼくじょう：出荷 N 回・ことば M 個」。

## 7. 入れないもの

恋愛・結婚、鉱山の落とし穴、リアルタイム 1 秒＝1 分の時計、家の増築（コインの行き先は きせかえ島にある）。
