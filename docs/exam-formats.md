# TOEIC・TOEFL・IELTS の 問題DB（/admin/qbank）— しらべた こと と 作りかた（2026-11）

英検の 問題DB と 同じ やり方で、3 つの 試験の 練習問題を **オリジナルで** 作り、管理画面の 問題データベースに 入れた。
公式の 問題・市販の 問題集の 文は **1 つも 入れていない**（著作権が ETS・British Council / IDP / Cambridge に ある）。
使ったのは「試験の 形（パート・問題数・時間・スコア）」の 公開情報と、オープンな 語い表だけ。

## 1. オープンな 語い表（大学の 研究者が 公開・CC BY-SA 4.0）
| 表 | 作った 人 | 中身 | 使い道 |
|---|---|---|---|
| TOEIC Service List（TSL 1.2） | Charles Browne・Brent Culligan | TOEIC 対策の 150 万語の コーパスから。NGSL と あわせて TOEIC の 約 99% を カバー | TOEIC の 語い問題・本文の 語い |
| New Academic Word List（NAWL） | Browne・Culligan・Phillips | 学術英語の 中心の 約 960 語（NGSL の 外） | TOEFL・IELTS の 語い問題・学術文 |
| （土台）New General Service List（NGSL） | Browne・Culligan・Phillips | 一般語 約 2,800 語 | 上 2 つの 前提 |

出典：newgeneralservicelist.com（TSL・NAWL・NGSL）。表は R パッケージ antdurrant/live.analytics（MIT）の 同梱データから 取りだした。
語い問題の 行には タグ `TSL <語>` / `NAWL <語>` が つく。

## 2. 試験の 形
### TOEIC（ETS）
- **Listening & Reading**：各 100 問・約 2 時間・10〜990 点。Part 1 写真描写 6・Part 2 応答 25・Part 3 会話 39・Part 4 説明文 30・Part 5 短文穴埋め 30・Part 6 長文穴埋め 16・Part 7 読解 54（シングル・ダブル・トリプル）。
- **Speaking & Writing**：Speaking 11 問（音読 2・写真描写 2・応答 3・資料を 見て 応答 3・意見 1、約 20 分）／Writing 8 問（写真で 文 5・Eメール 2・意見の 記述 1（約 300 語）、約 60 分）。
- **入れていない もの**：写真を 使う 問題（Part 1・写真描写・写真で 文）。英検の 面接と 同じく、本物の 絵が ない 問題は 出さない。図表は 文字の 表で のせる。

### TOEFL iBT（ETS・2026 年 1 月の 新形式）
- スコアは **1〜6 の バンド**（0.5 きざみ・CEFR に 対応）。Reading・Listening は アダプティブ。
- Reading：Complete the Words（C テスト）・Read in Daily Life・Read an Academic Passage。
- Listening：Listen and Choose a Response・Listen to a Conversation・Listen to an Announcement・Listen to an Academic Talk。
- Writing：Build a Sentence・Write an Email・Write for an Academic Discussion。
- Speaking：Listen and Repeat・Take an Interview。
- 公式の 仕様書：ETS「TOEFL iBT Test Specifications 2026」（PDF）。細かい 問題数は 回ごとに かわる（アダプティブ）ので、DB は 形ごとに 多めに 用意した。

### IELTS（British Council・IDP・Cambridge）
- バンド 1〜9。Academic と General Training。全体 約 2 時間 45 分。
- Listening 4 パート・40 問・30 分／Reading 3 パッセージ・40 問・60 分（T/F/NG・Y/N/NG・見出し・多肢選択・文/要約完成）／Writing Task 1（150 語〜：Academic＝図表、GT＝手紙）・Task 2（250 語〜・配点 2 倍）／Speaking 3 パート・11〜14 分。
- Writing Task 1 の 図表は 絵の かわりに 表・数字を 文字で のせた。

## 3. レベルの めやす（タグ）
どの 行にも `CEFR:A2〜C1` と 試験ごとの めやす（`TOEIC目安:600`・`TOEFL目安:バンド4`・`IELTS目安:6.5`）が タグで つく。
管理画面の「レベル（CEFR）」で しぼれる。対応は ETS・IELTS が 公開している CEFR 対応表の おおまかな 値。

## 4. 作りかた・入りかた
- 問題ファイル：`server/src/game/exam-bank/<toeic|toefl|ielts>/*.json`（サーバーだけ。client/dist には 置かない）。
- たしかめる：`node server/scripts/check-exam-bank.mjs`（形・正解が 選択肢に あるか・ID の かさなり・正解の 位置の かたより）。
- 入りかた：起動の とき `server/src/qbank/seed-exams.js` が **ファイルごとに 1 回だけ** 問題DB に 足す（印 `exams-2026-11:<試験>/<ファイル>`）。
  ファイルを 足すと 次の 起動で その ファイルだけ 入る。admin で 消した 行は もどらない。
- 出す先：**英検の島・Roblox には 出さない**（web・Roblox は ×）。管理画面で 見る・さがす・書きかえる・CSV で 書き出す ための DB。
- 管理画面：/admin/qbank の 上の タブ（ぜんぶ・英検・TOEIC・TOEFL・IELTS）。タブを えらぶと 試験の 形の 表が 出る。
