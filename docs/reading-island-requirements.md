# よみもの島（えいごの えほん島）— 要件定義 v0.1（2026-11）

Raz-Kids（Learning A-Z）の **しくみ** を 参考に、U-Speak の 島として つくる 多読（たどく）の 島。
**まねるのは 学び方の 流れだけ**。**U-Speak に すでに ある 機能は ぜんぶ つかう**（§9。新しい レベル・通貨・先生の 画面は つくらない）。Raz-Kids の 名前・キャラクター・本・絵・音声・レベルの 呼び名は つかわない
（すべて U-Speak の オリジナルか、権利の はっきりした 材料だけ）。

---

## 1. しらべた こと（Raz-Kids の しくみ）
| しくみ | Raz-Kids | 出典 |
|---|---|---|
| 本 | レベルわけした 電子の 絵本（800 冊 以上）。1 冊ごとに 理解の クイズ | [公式](https://literacy.learninga-z.com/raz-kids)・[概要 PDF](https://www.learninga-z.com/user_area/content_media/raw/raz-kids-overview.pdf) |
| レベル | 29 段階（本の むずかしさ）。読んで クイズに 受かると つぎの レベルへ | [Common Sense](https://www.commonsense.org/education/reviews/raz-kids)・[Help](https://help.learninga-z.com/en/articles/7026146-what-is-raz-kids) |
| 1 冊の 流れ | 聞く → 読む → クイズ（＋ 書きこみ・ハイライト・スタンプ） | [公式](https://literacy.learninga-z.com/raz-kids) |
| 録音 | 子どもが 音読を 録音 → 先生が 聞いて 評価 | [5 benefits](https://www.learninga-z.com/site/resources/breakroom-blog/5-razkids-benefits)・[review](https://pastory.app/articles/is-raz-kids-good-and-safe-for-kids/) |
| 先生 | レベル・本を 子どもごと／グループごとに 出す。進み・録音を 見る | [公式](https://literacy.learninga-z.com/raz-kids) |
| ごほうび | ★ を ためて じぶんの 部屋などを かざる（ゲーム化） | [review](https://pastory.app/articles/is-raz-kids-good-and-safe-for-kids/) |
| レベルの きめかた | ランニングレコード（音読の 正確さ）＋ 再話（リテリング）＋ 理解クイズ。**正確さ 95% 以上 かつ クイズ 100% → 1 つ 上げる／95%＋80% → その レベルで 練習／クイズ 80% 未満 → 1 つ 下げる** | [Assessing a Student's Level](https://www.readinga-z.com/learninga-z-levels/assessing-a-students-level/)・[About Running Records](https://www.readinga-z.com/helpful-tools/about-running-records/) |
| 本の レベル | 質（予測しやすさ・文の 形）と 量（語数・語の 種類）で きめる | [Text leveling summary](https://LearningA-Z.com/site/resources/download-library/text-leveling-system-summary) |

**オープンな 絵本の 材料（えらぶ ときは 1 冊ずつ ライセンスを たしかめる）**
- Global Digital Library：CC BY 4.0（5,000 冊・72 言語）[World Bank](https://blogs.worldbank.org/education/five-steps-get-open-source-books-right-0)
- StoryWeaver（Pratham Books）：おもに CC BY 4.0（本ごとに ちがう ことが ある）[Publishing Perspectives](https://publishingperspectives.com/?p=82844)
- African Storybook：CC BY と CC BY-NC が まざる（NC は 商用 不可）[about](https://my.africanstorybook.org/about.php)
- Book Dash：CC ライセンス

---

## 2. つくる もの（ひとことで）
**「レベルに あった 英語の えほんを、聞いて・読んで・音読して・クイズに こたえる。受かると つぎの レベル」** を
U-Speak の 3D の 島の 中で、ほかの 島と 同じ コイン・ロードマップ・保護者レポートに つなげて やる。

## 3. 島の すがた（3D・island-kit）
| 場所 | なにを する |
|---|---|
| 📚 としょかん（大きい 建物・まんなか） | いまの レベルの 本だなを ひらく。本を えらぶ |
| 👂 きく ベンチ | えほんを 読み上げで 聞く（ことばが 光る） |
| 🎤 おんどく ブース | じぶんで 音読して 録音（マイク） |
| ❓ クイズの いえ | 1 冊ごとの 理解クイズ |
| ⭐ ほしの ひろば | 読んだ 本の かず・ロードマップの バッジを 見せる（ごほうびは いまの コイン・バッジ） |
- 戸口に 入ると その 画面（ほかの 島と 同じ）。島は `HUBS` と `ACTIVITY_HUBS` に `reading`。しまの ちずの「おすすめ」候補。
- 1 冊を どこからでも つづけられる（島に 来なくても 右の バーから ひらける）ことも 検討。

## 4. 1 冊の 流れ（いちばん だいじ）
1. **👂 きく**：1 ページずつ。サーバーの 声（/api/tts）で 読み、**いま 読んでいる ことばを 光らせる**（文ごとの 音声＋語の 時間わり）。ゆっくり ボタン（0.75 倍）。
2. **📖 よむ**：じぶんの ペースで ページを めくる。ことばを おすと その ことばだけ 読む＋日本語の いみ（本ごとの ことばリスト）。
3. **🎤 おんどく**：ページの 文を 読む → 音声認識で **読めた ことばの わりあい（正確さ）** と **1 分の 語数（WPM）**。読めた 語は 緑、とばした 語は 灰色。録音は 先生が 聞ける（§7）。
4. **❓ クイズ**：5 問（4 択が 中心・7 形式の 部品 `formats-core` を つかう）。**答えは サーバーだけ**（本の 本文は 送るが、クイズの 正解は 送らない）。
- 3 つ すべて おわると その 本は ✓。★ は 「きく」「よむ」「おんどく」「クイズ（80% 以上）」で 1 つずつ（最大 4）。

## 5. レベル ＝ U-Speak の ロードマップ（新しい レベルは つくらない）
- **本の レベルは ロードマップの 12 段階（A・B・C・1〜9）を そのまま つかう**。島で 別の レベル（R1〜R20 など）は 持たない。
  めやす：A〜C＝英検Jr.、1・2＝5級、3・4＝4級、5・6＝3級、7＝準2級、8＝2級、9＝準1級（`server/src/game/roadmap.js`）。
- 本だなに 出るのは **その 子の いまの 段階の 本**（＋ 1 つ 下の 段階の 本は「かんたん」として 読める）。先生が 段階を かえれば 本だなも かわる（/class の ロードマップ と 同じ）。
- **段階を 上げるのも ロードマップ**：本の クイズの 答えは roblox_events の quiz（world=reading・その 段階の 級）に 書くので、
  そのまま ロードマップの「その 級の クイズ 20 問・8 割」と 英検の 合格見込みに 入る。本の ことば（glossary）を その 段階の 単語に 足す ことも できる。
- 島だけの 目あては「この 段階の 本を ○ 冊 ✓」と「音読の 正確さ」（Learning A-Z の めやす 95%）。これは ロードマップの 画面に「📚 よんだ 本」として 足す（段階アップの 条件に するかは 運営が きめる・はじめは 表示だけ）。
- 本の 段階は 語数・文の 長さ・語の むずかしさ（NGSL・英検の 級の 語）で 自動の めやすを 出し、運営が きめる。

## 6. ごほうび・やる気（いまの しくみで）
- **新しい 通貨・新しい ★ は つくらない。** U-Speak コイン（`economy.js`・1 日の 上限 `caps`）：本 1 冊 ✓ で ◈20。段階アップの ◈100 は ロードマップが 出す（二重に 出さない）。
- 「読んだ しるし」は **ロードマップの スタンプ・バッジ**、**ランキングの 指標**（`rankings.js` の METRICS に「📚 よんだ 本」「よんだ 語数」を 1 行ずつ）、**タスクの カード**（「はじめの100」に 本の タスク・`task:ui`）、**ずかん的な 本の コレクション**は 本だなの ✓ で 見せる。順位で せめない（じぶんくらべ）は ランキング画面の きまりの まま。
- 本の ことばは **たんごちょう**（`words`）に 入り、まちがえた ことばは **苦手単語の 復習**（`review.js`。roblox_events の quiz から 自動で）に のる。

## 7. 先生・保護者（いまの 画面に 足す）
- **新しい 先生の 画面は つくらない。**
  - 段階を かえる ＝ /class の **ロードマップ**（いまの まま）。
  - 本を 出す ＝ **宿題**（/admin/homework・/teacher/homework）に「えほん」の 形を 1 つ 足す（本 ＋ その クイズ・しめきり・クラスごと・すすみぐあい・保護者レポートの 宿題の 行が そのまま 使える）。
  - クラスの 冊数・語数・クイズ・正確さ ＝ /class の 表に 列を 足す。授業モードの「🌍 Move together」の 行き先に この 島を 足す。
  - 録音を 聞く ＝ /class の 子どもの 行から（先生の メモ・声かけと 同じ 場所）。
- **保護者レポート・LINE**：いまの 週・月 レポート（`service.js` の dataFor・画像・PDF・吹き出し）に「📚 よんだ 本 ○ 冊・○ 語・音読の 正確さ」を 1 ブロック 足す。
- **録音の あつかい**：子どもの 声は 個人情報。保存は DATA_DIR に 30 日（設定で かえる）、先生だけ 聞ける、1 人ぶんの 削除（`privacy.js`・`erase-student.mjs`）に ふくめる。録音を とらない 設定（文字の 判定だけ）も もつ。

## 8. 本の データ（材料の 入れかた）
```
{ id, title, stage: "3"（ロードマップの 段階）, words: 128, source: "U-Speak オリジナル" | "GDL CC BY 4.0（作者名）",
  pages: [ { text, image, audio? } ], glossary: [ { en, ja } ],
  quiz: [ { q, choices[4], answer, kind } ]  ← サーバーだけ（client/dist に 置かない） }
```
- 置き場所：本文と 絵＝`client/dist/assets/books/<id>/`、クイズ＝`server/src/game/reading-bank/`（宿題・英検と 同じ「答えは サーバーだけ」）。
- **入れ口は いまの 管理画面に 足す**：本の クイズは **問題DB（/admin/qbank）** に 級・技能 reading・形式「えほん」で 入れる（オンオフ・書きかえ・CSV が そのまま 使える）。本の 本文と 絵の 読みとりは **宿題の 読みとり**（`homework/files.js`・AI）を つかう。本の 一覧・段階・出典だけ /admin に 1 ページ。クイズが ない 本は AI が 下書き → 運営が たしかめて 公開。
- 絵が ない 本は 絵を つくる（`vocab-flow-illustration` の 流れ）か、オープンな 絵本（CC BY）を つかう。ライセンスと 作者名を 本ごとに のこし、本の さいごの ページに 出す。

## 9. いまある U-Speak の 機能を フルに つかう（新しく つくるのは 本の 画面と 音読の 判定だけ）
| 要件 | つかう もの（すでに ある） |
|---|---|
| 島・建物・戸口・ミニマップ・光の 柱 | `island-kit.js`（`createIsland`）・`rpg-data.js` の HUBS／ACTIVITY_HUBS・しまの ちずの「おすすめ」 |
| 読み上げ・ゆっくり | `/api/tts`（自然な 声・キャッシュ）・`speech.js` の `playVoice({slow})`・`character.js`（ウーピーが 読む） |
| 音読の 判定 | 面接・話すの館の 音声認識と `judgeSpoken`・読めた 語が 光る 面接の 音読画面 |
| クイズ | 問題DB（qbank）＋ `formats-core.js` / `formats-ui.js`（7 形式）・正解・不正解の 効果音（`sfx.js`） |
| 段階・上がる 条件・英検の 見込み | ロードマップ（`roadmap.js`）・roblox_events の quiz |
| コイン | `economy.js`・1 日の 上限 |
| ことば | たんごちょう（`wordbook.js`）・苦手単語の 復習（`review.js`） |
| やる気 | ロードマップの スタンプ・バッジ・ランキング（指標を 足す）・タスク（はじめの100） |
| 本を 出す・しめきり | 宿題（`homework/*`・/teacher/homework）に 形を 1 つ 足す |
| 先生 | /class（ロードマップ・表・メモ）・授業モード（Move together・Review） |
| 保護者 | web レポート・LINE の 週・月 レポート・宿題の 行 |
| 本の 読みとり | 宿題の 読みとり（PDF・画像・CSV・AI）・問題DB の 入れ口 |
| 絵の 表示 | 本の 絵は ふつうの 画像（1 ページずつ）。3D の 小物は `bag-preview.js` |
| プレミアム・名簿・クラスコード | いまの 名簿の しくみ（プレミアムの 島に するかは 運営が きめる） |
| 英語／日本語・ひらがな・11px・横もち | いまの きまり（`translate="no"`・lang.json・mobile.css） |

## 10. 画面の きまり（いつもと 同じ）
- iPad 横もち・スマホ 横もちで 1 画面に おさまる。字は 11px 以上・ボタンは 34px 以上。
- **本文・ことば・クイズは 学習の 中身 → `translate="no"`**（英語モードでも 訳さない）。説明は ひらがな・分かち書き。
- 本の 絵は 1 ページずつ 読みこむ（つぎの ページだけ さきよみ）。

## 11. つくる じゅんばん
| 段 | 中身 | めやす |
|---|---|---|
| P1 | 島・としょかん・本だな（ロードマップの 段階で）・👂きく（光る）・📖よむ・❓クイズ・コイン・ロードマップへの 記録 | 材料が きたら すぐ |
| P2 | 🎤 おんどく（正確さ・WPM）・録音と 先生の 評価・ロードマップの「📚 よんだ 本」・保護者レポート / LINE | P1 の あと |
| P3 | 入れ口（宿題の 読みとり・問題DB）・本を 宿題で 出す・ランキング／タスクの 指標 | P2 の あと |

## 12. 材料で きめたい こと（まって います）
1. 本の 材料：何冊・どの 形（PDF／画像＋文／テキスト）・権利（自作か・オープンか）
2. 本ごとの 段階（A〜C・1〜9 の どれか）が 材料に 書いて あるか（なければ こちらで めやすを 出す）
3. 録音を のこすか（のこす なら 何日）
4. 本を 宿題として 先生が 出す 使い方を するか
5. 島の 名前（案：よみもの島／Book Island）
