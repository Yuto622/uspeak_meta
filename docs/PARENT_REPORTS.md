# 保護者レポート（LaTeX → PDF・画像 → LINE で 個別配信）

生徒ごとの 学習レポートを LaTeX で 組み、**教室名義で 保護者の LINE に 1 人ずつ 届ける** 仕組み。
運営は 1 人なので、**ふだんは 何も しなくても 回り、問題が あるときだけ 運営者（`OPS_LINE_USER_ID`）に 通知が 来る** ように してある。

```
【登録（最初の 1 回）】
/class/<code>/parents で QR カードを 印刷 → 保護者が スマホで 読む → LIFF（LINE の 中の 登録ページ）
 → 同意 → 友だち追加 → 「LINE ユーザー ID ↔ 生徒」を 保存

【配信（自動）】
教室ごとの 頻度（毎週・隔週・毎月）・曜日・時刻（JST）に
 生徒ごとに 集計 → LaTeX → PDF と 画像 → 保存（推測できない URL・60 日）
 → 生徒に 紐づく 保護者 全員へ LINE で 個別送信（きょうだいは 1 回に まとめる）→ 記録
 → 失敗・異常の ときだけ 運営者に 通知、配信の 翌朝に 1 行の まとめ
```

## コードの 場所

| 役割 | ファイル |
|---|---|
| 日付（JST の 週・月） | `server/src/parent-report/jst.js` |
| 集計（数字の 定義） | `server/src/parent-report/aggregate.js` |
| 単語の 日本語（既存の 問題データから） | `server/src/parent-report/dictionary.js` |
| テンプレート | `server/templates/report/weekly.tex.j2` / `monthly.tex.j2` / `preamble.tex` / **`texts.json`（文はここ）** |
| .tex を 作る（エスケープ） | `server/src/parent-report/render-tex.js` |
| 組版（PDF・PNG・キュー） | `server/src/parent-report/render.js` ／ worker：`server/worker/render-server.js`・`worker/Dockerfile`・`worker/fly.toml` |
| LINE（送信・署名・ID トークン・通数） | `server/src/parent-report/line.js` |
| 配信・スケジューラー・通知・登録 | `server/src/parent-report/service.js` |
| 記録（表 7 つ） | `server/src/parent-report/store.js` → `DATA_DIR/parent-reports.json`、ファイルは `DATA_DIR/parent-reports/` |
| 口（Webhook・LIFF・/r・教室の タブ） | `server/src/parent-report/routes.js`・`pages.js` |
| /admin/reports | `server/src/parent-report/admin.js` |
| テスト | `server/test/parent-report.test.mjs` |

**記録は 本体の store とは 別**（ボリュームの JSON）。本体が Google スプレッドシートでも、LINE の ユーザー ID を シートに 書かない ため。
表は `parent_links` / `link_tokens` / `report_settings` / `teacher_comments` / `reports` / `deliveries` / `report_runs`（＋全体の スイッチ `meta`）。

## 1. LINE 側の 初期設定（最初の 1 回・手作業）

> ⚠ **LINE の ユーザー ID は プロバイダーごとに ちがいます。**
> Messaging API の チャネルと LINE ログインの チャネル（LIFF）は **必ず 同じ プロバイダーの 下に** 作ってください。
> ちがう プロバイダーだと、LIFF で 登録した ID に 送っても 届きません（エラーにも ならず 黙って 失敗します）。

1. **LINE 公式アカウント**（既存のもの）で **Messaging API を 有効化**。LINE Developers に できた チャネルで
   - チャネルアクセストークン（長期）を 発行 → `LINE_CHANNEL_ACCESS_TOKEN`
   - チャネルシークレット → `LINE_CHANNEL_SECRET`
   - Webhook URL：`https://uspeak-multiplayer.fly.dev/api/line/webhook`（「Webhook の 利用」を オン、「検証」で 成功を 確認）
   - ボットの ベーシック ID（`@xxxx`）→ `LINE_BOT_BASIC_ID`（登録ページの「友だちに追加」ボタン用・任意）
2. **同じ プロバイダーの 下に「LINE ログイン」チャネルを 作る** → チャネル ID → `LINE_LOGIN_CHANNEL_ID`
   - その チャネルで **LIFF アプリを 追加**：サイズ Full、エンドポイント URL `https://uspeak-multiplayer.fly.dev/liff/link`、
     スコープ `openid` と `profile`、**友だち追加オプション：On（aggressive）**、リンクされた LINE 公式アカウント＝上の アカウント
   - LIFF ID → `LIFF_ID`
3. **応答設定**（LINE Official Account Manager）：チャット **オフ**、Webhook **オン**、自動応答メッセージ **オン** にして
   「このアカウントは配信専用です。ご質問は通っている教室へお願いします。」を 1 つ 登録。
4. 運営者（自分）の LINE ユーザー ID → `OPS_LINE_USER_ID`（LINE Developers の チャネル基本設定の「あなたのユーザー ID」）。
   **自分の LINE で 公式アカウントを 友だち追加**しておく（しないと 通知も テスト送信も 届かない）。
5. 秘密は **チャットに 貼らず** `fly secrets set` で：
   ```sh
   fly secrets set -a uspeak-multiplayer \
     LINE_CHANNEL_ACCESS_TOKEN=... LINE_CHANNEL_SECRET=... LINE_LOGIN_CHANNEL_ID=... LIFF_ID=... \
     OPS_LINE_USER_ID=... REPORT_BASE_URL=https://uspeak-multiplayer.fly.dev \
     RENDER_URL=http://uspeak-report-worker.flycast/render RENDER_SECRET=<長い乱数>
   ```
   `LINE_CHANNEL_ACCESS_TOKEN` が 無い 間は **dry-run**（送らずに ログだけ）。`LINE_DRY_RUN=1` でも dry-run に できる。

## 2. TeX の 実行環境（どちらに したか と 理由）

**同じ アプリの 別プロセスではなく、別の Fly アプリ（`uspeak-report-worker`）** に した。

- TeX Live（XeLaTeX・tcolorbox・TikZ・qrcode）＋ Noto Sans CJK JP ＋ poppler は **約 1GB**。本体の イメージに 入れると、
  授業中に 動いている 本体の デプロイと 起動が 毎回 重くなる。Fly の プロセスグループは **同じ イメージ**を 使うので、
  別プロセスに しても イメージは 軽くならない。
- 配信は 週に 1 回なので、worker は **Flycast（内部だけ）・使わない 間は 止まる**（`auto_stop_machines`）。呼ばれたら 起きる。
- 本体 → worker は Fly の 内部ネットワークだけ。`RENDER_SECRET`（Bearer）で 守る。公開の 口は 持たない。

作りかた（リポジトリの いちばん上で）：
```sh
fly apps create uspeak-report-worker
fly secrets set -a uspeak-report-worker RENDER_SECRET=<本体と 同じ 値>
fly deploy . -c worker/fly.toml --dockerfile worker/Dockerfile   # . ＝ リポジトリ全体を 材料に（ないと server/ が 見えない）
fly ips allocate-v6 --private -a uspeak-report-worker     # Flycast の アドレス
# 本体側：RENDER_URL=http://uspeak-report-worker.flycast/render（上の secrets）
```
`RENDER_URL` が 無ければ、本体の マシンの `xelatex` で 組む（開発・テスト）。Debian/Ubuntu なら
`apt-get install -y --no-install-recommends texlive-xetex texlive-latex-extra texlive-pictures fonts-noto-cjk poppler-utils fontconfig`。

組むときの 決まり（`render.js`）：`xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error`、使い捨ての 作業フォルダ、
**1 件 30 秒まで**（`REPORT_TEX_TIMEOUT_MS`）、TikZ の 位置合わせの ため 2 回 組む、**並列 2・失敗したら 1 回だけ やりなおす**。
画像：毎週版は `pdftoppm -png -scale-to-x 1040 -scale-to-y 1300`、サムネイルは 幅 240（LINE の previewImageUrl・1MB 以下）。

## 3. 保存と URL

PDF・画像は **ボリューム（`DATA_DIR/parent-reports/`）**に 置き、**本体が `/r/<access_token>` で 配る**
（`.png`・`/thumb.png`）。オブジェクトストレージ（Tigris）ではなく ボリューム に した 理由：期限（60 日）・教室の 停止・
`noindex` を **配る ときに サーバーが 毎回 確かめられる**（URL が 外に 出ても 止めれば 止まる）ため。
access_token は 32 文字（24 バイトの 乱数）。容量は 1 枚 約 0.2〜0.3MB × 生徒数 × 9 週。生徒 100 人で 約 300MB なので、
ボリュームは 3GB を すすめる（`fly volumes extend <id> -s 3`）。期限切れの ファイルは 毎日 03:00 すぎに 消える。

## 4. 数字の 定義（`aggregate.js`）

すべて **日本時間**。週は 月曜 0:00〜日曜 23:59。

| 項目 | 定義 |
|---|---|
| 英語をした日 | `type=quiz` が 1 件 以上の 日 |
| つづけて英語 | その 週の いちばん 長い 連続が 3 日 以上の ときだけ |
| クイズに 答えた 数 | `type=quiz` の 件数（Roblox・Web）。先週より **増えた ときだけ ↑**。減った ときは 数字だけ（赤・↓ は 使わない） |
| 覚えた単語 | **2 日以上に 分けて 3 回 つづけて 正解**（retry・fast は 数えない）。その後 まちがえたら はずれる |
| 次に覚える単語 | 苦手復習の 箱で 時期が いちばん 近い もの。無ければ さいきん まちがえた 単語 |
| 4 つの力 | 聞く＝`listen`、読む＝`mc`・`match`・`fill`・`order`（形なしも）、書く＝`type`・`spell`、話す＝`type=speak` の 回数 |
| 正解 | はじめての 回答だけ（`retry=true` と `fast=true` を のぞく）。**20 問 未満は「これから」で 数字を 出さない** |
| 載せない | 順位・ほかの 子との 比較・あてずっぽう率・コイン・レベル |

**「話す」の 記録**：Web で 声に出す 練習（英会話島・面接・英検の 話す・おつかい・ぼくじょうの 受け答え）は、学習ログを 書く 1 か所
（`ClassRoom.appendLearning`）で `roblox_events` にも `type=speak` を 1 行 足す。Roblox 側も `type=speak` を 送れば 合算される。

文（状況別の 1 行・先生の ひとこと候補・Can-do・来月の 一歩・数字の見方）は **`server/templates/report/texts.json`**。
直したら `version` を 上げる（`reports.template_version` に「t<version>-<テンプレートの ハッシュ>」が 残る）。
**先生の ひとことは 先生が えらんだ 回だけ**（無ければ 欄ごと 出さない。自動で 先生名義の 文は 作らない）。

## 5. 画面

- **/class/<code>/parents**（教室ページの「📨 保護者レポート」から。教室ページと 同じ 署名つき リンク）
  オン／オフ（**既定オフ**）・頻度・曜日・時刻・ゼロの 週・月次 PDF・教室名・先生の よびかた／生徒ごとの 登録状況・
  **QR カード印刷（A4 に 8 人）**・QR 作り直し・この 生徒の 配信を 止める・プレビュー／**先生の ひとこと**（締め切り＝配信の 前日 23:59）／
  教室全体を 停止（クラスコードを 打って 確認）。
- **/admin/reports**（名簿の 管理ページと 同じ ログイン）
  全体の 緊急停止・教室ごとの 登録率と 直近の 結果・失敗の 再送・**テスト送信（自分の LINE へ）**・実行ログ・テンプレートの 版・
  LINE の 今月の 送信数（上限に 対する %）。

## 6. 運営者への 通知（`OPS_LINE_USER_ID`）

- **失敗したときだけ**：生成・送信の 失敗が 1 件でも 出たら、件数と 教室名（配信の 直後）
- **データが 届かない**：Roblox からの `roblox_events` が 24 時間 ゼロ（毎朝 9 時に 見る・どこかの 教室が オンの とき）
- **通数**：今月の 送信数が プラン上限の 80% を 超えた（月に 1 回）
- **毎週 1 行の まとめ**（配信の 翌朝 8:30 すぎ）：「今週：62通送信・失敗0・新規登録3・停止0」

## 7. 個人情報・安全

- 同意の 記録（`consent_version`・日時）。同意文を 変えたら `service.js` の `CONSENT_VERSION` を 上げる。
- 教室が 停止したら：配信停止・レポート URL 無効化・紐づけを stopped（**30 日後に 完全削除**）。
- LINE ユーザー ID・トークンは ログに 出さない（`mask()`）。/admin の 画面でも 伏せる。
- レポートには 本名を 載せない（ニックネーム＝ゲームの 名前だけ）。ID トークンは **サーバーで LINE に 確かめてから** 紐づける。

## 8. 複数マシンに した ときの 注意

スケジューラーは 本体の プロセスの 中（1 分ごと）。いまの 構成は **マシン 1 台**（`fly.toml` の 注記どおり）なので 二重には 動かない。
台数を 増やすなら `PARENT_REPORT_SCHEDULER=0` を 1 台 以外に 設定する（push は Retry-Key つきなので、万一 重なっても 二重には 届かない）。
