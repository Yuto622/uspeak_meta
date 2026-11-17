# よみもの島（えいごの えほん島）— 要件定義 v0.1（2026-11）

Raz-Kids（Learning A-Z）の **しくみ** を 参考に、U-Speak の 島として つくる 多読（たどく）の 島。
**まねるのは 学び方の 流れだけ**。Raz-Kids の 名前・キャラクター・本・絵・音声・レベルの 呼び名は つかわない
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
| ⭐ ほしの ひろば | 読んだ 本の かず・レベルの バッジを かざる（ごほうび） |
- 戸口に 入ると その 画面（ほかの 島と 同じ）。島は `HUBS` と `ACTIVITY_HUBS` に `reading`。しまの ちずの「おすすめ」候補。
- 1 冊を どこからでも つづけられる（島に 来なくても 右の バーから ひらける）ことも 検討。

## 4. 1 冊の 流れ（いちばん だいじ）
1. **👂 きく**：1 ページずつ。サーバーの 声（/api/tts）で 読み、**いま 読んでいる ことばを 光らせる**（文ごとの 音声＋語の 時間わり）。ゆっくり ボタン（0.75 倍）。
2. **📖 よむ**：じぶんの ペースで ページを めくる。ことばを おすと その ことばだけ 読む＋日本語の いみ（本ごとの ことばリスト）。
3. **🎤 おんどく**：ページの 文を 読む → 音声認識で **読めた ことばの わりあい（正確さ）** と **1 分の 語数（WPM）**。読めた 語は 緑、とばした 語は 灰色。録音は 先生が 聞ける（§7）。
4. **❓ クイズ**：5 問（4 択が 中心・7 形式の 部品 `formats-core` を つかう）。**答えは サーバーだけ**（本の 本文は 送るが、クイズの 正解は 送らない）。
- 3 つ すべて おわると その 本は ✓。★ は 「きく」「よむ」「おんどく」「クイズ（80% 以上）」で 1 つずつ（最大 4）。

## 5. レベル（U-Speak の 呼び名で）
- **R1〜R20 の 20 段階**（Reader 1〜20）。呼び名・数は 材料が 来たら きめなおす。
- めやす：R1〜R4 ＝ ロードマップの A〜C（英検Jr.）、R5〜R8 ＝ 5級、R9〜R11 ＝ 4級、R12〜R14 ＝ 3級、R15〜R17 ＝ 準2級、R18〜R20 ＝ 2級。
- **上がる 条件（サーバーが きめる）**：その レベルの 本を 8 冊 以上 ✓、さいきん 5 冊の クイズ 平均 80% 以上、音読の 正確さ 平均 95% 以上（Learning A-Z の 公開の めやすに あわせる）。
- **先生は レベルを 手で かえられる**（はじめの レベル・上げる・下げる）。はじめては「レベル チェック」（短い 文 1 つの 音読＋クイズ）で きめても よい。
- 本の レベルは 語数・文の 長さ・語の むずかしさ（NGSL/英検の 級の 語）で 自動の めやすを 出し、先生・運営が きめる。

## 6. ごほうび・やる気
- U-Speak コイン（ほかの 島と 同じ さいふ・1 日の 上限つき）：本 1 冊 ✓ で ◈20、レベル アップ ◈100。
- ★ は 本ごとの「読んだ しるし」（ためて ほしの ひろばの かざりが ふえる）。**順位は 出さない**（じぶんくらべ：今週 読んだ 本・語数）。
- ロードマップの 単語・合格見込みに つながる（クイズの 答えは roblox_events の quiz に world=reading で 書く）。

## 7. 先生・保護者
- **先生の 画面（/teacher/reading）**：クラスの 子の レベル・今週の 冊数・語数・クイズ・正確さ。**レベルを かえる・本を 出す（子どもごと／クラスごと）**。録音を 聞いて「よめた／もう いちど」を つける。
- **保護者レポート・LINE**：「今週 読んだ 本 ○ 冊・○ 語・いまの レベル・つぎまで あと ○ 冊」。
- **録音の あつかい**：子どもの 声は 個人情報。保存は DATA_DIR に 30 日（設定で かえる）、先生だけ 聞ける、1 人ぶんの 削除に ふくめる（`docs/PRIVACY.md`）。録音を とらない 設定（文字の 判定だけ）も もつ。

## 8. 本の データ（材料の 入れかた）
```
{ id, title, level: "R5", words: 128, source: "U-Speak オリジナル" | "GDL CC BY 4.0（作者名）",
  pages: [ { text, image, audio? } ], glossary: [ { en, ja } ],
  quiz: [ { q, choices[4], answer, kind } ]  ← サーバーだけ（client/dist に 置かない） }
```
- 置き場所：本文と 絵＝`client/dist/assets/books/<id>/`、クイズ＝`server/src/game/reading-bank/`（宿題・英検と 同じ「答えは サーバーだけ」）。
- **admin の 入れ口（/admin/reading）**：本の 一覧・レベル・オンオフ・出典。PDF・画像＋文・CSV から 読みとる（宿題の 読みとり `homework/files.js`・AI 読みとりを つかう）。クイズが ない 本は AI が 下書き → 運営が たしかめて 公開。
- 絵が ない 本は 絵を つくる（`vocab-flow-illustration` の 流れ）か、オープンな 絵本（CC BY）を つかう。ライセンスと 作者名を 本ごとに のこし、本の さいごの ページに 出す。

## 9. つかう 部品（いまある もの）
島＝`island-kit.js`／声＝`/api/tts`＋`speech.js`／音読の 判定＝面接と 同じ 音声認識・`judgeSpoken`／クイズ＝`formats-core.js`・`formats-ui.js`／コイン＝`economy.js`／先生の 画面＝`/teacher` の しくみ（教室の パスワード）／レポート＝`roblox_events`・`aggregate.js`・LINE／絵の まとめ焼き＝`bag-preview.js`。

## 10. 画面の きまり（いつもと 同じ）
- iPad 横もち・スマホ 横もちで 1 画面に おさまる。字は 11px 以上・ボタンは 34px 以上。
- **本文・ことば・クイズは 学習の 中身 → `translate="no"`**（英語モードでも 訳さない）。説明は ひらがな・分かち書き。
- 本の 絵は 1 ページずつ 読みこむ（つぎの ページだけ さきよみ）。

## 11. つくる じゅんばん
| 段 | 中身 | めやす |
|---|---|---|
| P1 | 島・としょかん・本だな・👂きく（光る）・📖よむ・❓クイズ・レベル（先生が かえる）・コイン・ロードマップ | 材料が きたら すぐ |
| P2 | 🎤 おんどく（正確さ・WPM）・録音と 先生の 評価・レベルの 自動アップ・保護者レポート / LINE | P1 の あと |
| P3 | /admin/reading の 入れ口（PDF・画像・CSV・AI の クイズ下書き）・本を 出す（課題）・ほしの ひろばの かざり | P2 の あと |

## 12. 材料で きめたい こと（まって います）
1. 本の 材料：何冊・どの 形（PDF／画像＋文／テキスト）・権利（自作か・オープンか）
2. レベルの 数と 呼び名（R1〜R20 で よいか）・はじめの 子の レベル
3. 録音を のこすか（のこす なら 何日）
4. ごほうびは コインだけで よいか（★ の かざりも つくるか）
5. 島の 名前（案：よみもの島／Book Island）
