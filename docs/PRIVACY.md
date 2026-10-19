# 個人情報の 守り（運用メモ）

公開している ポリシーは `client/dist/privacy.html`（`/privacy.html`。ロビーと LINE の 同意画面から リンク）。
ここは **運用する 人の ための メモ**：どこに 何が あり、どう 消し、どう 守っているか。2026-10 の 監査で 入れた もの。

## 1. どこに 何が あるか

| 情報 | 置き場所 | 消しかた |
|---|---|---|
| 子どもの 記録（名前・クラス・コイン・進み具合・先生の メモ `notes_json`） | `DATA_DIR/store.json` の `players`（Sheets なら `players` タブ） | /admin「この 子の 記録を 消す」または `node server/scripts/erase-student.mjs <クラス> <名前> [Roblox名]` |
| 学習ログ（答え・正誤・チャット・AI 会話の 文）・コインログ | `store.json` の `learning` / `coins`（Sheets なら `learning_log` / `coin_log`） | 同上（Sheets の 行は シートで 名前で しぼって 消す）。**400 日で 自動で 消える**（`RETENTION_DAYS`） |
| Roblox の できごと・ウォレット・紐づけ | `store.json` の `roblox_events` / `wallet_*` / `roblox_links` | 同上（Roblox 名を 渡す） |
| 保護者の LINE の 紐づけ・QR・レポート・送信の 記録・👏 | `DATA_DIR/parent-reports.json`、PDF/PNG は `DATA_DIR/parent-reports/` | 同上。止めた 紐づけは 30 日、ブロックは 30 日、レポートは 60 日、送信の 記録は 400 日で 自動で 消える |
| 名簿（入れる 人・先生か・プレミアムか） | `DATA_DIR/roster.json` か Google シート、写しが `roster-snapshot.json` | /admin の 名簿で 行を 消す（写しは 次の 読みこみで 入れかわる） |
| サーバーの ログ | Fly の ログ（数日） | 名前は `who()` の 札（HMAC・6 文字）、IP は `ipTag()`。`LOG_PII=1` の ときだけ 生の 名前 |

`eraseStudent()`（`server/src/privacy.js`）が 上の 1〜4 を まとめて 消す。**名簿は 消さない**（教室が「入れる 人」として 持つ 表なので、先生が 画面で 消す）。

## 2. 環境変数

| 変数 | 既定 | 意味 |
|---|---|---|
| `RETENTION_DAYS` | 400 | 学習ログ・コインログ・配った ウォレットの 行・送信の 記録を 消す までの 日数。0 で 消さない。起動 1 分後と 24 時間ごと |
| `LOG_SALT` | （`REPORT_SECRET`、なければ 起動ごとの 乱数） | ログの 札の 鍵。再起動を またいで 同じ 子を 追いたいなら 設定する |
| `LOG_PII` | 未設定 | `1` で ログに 生の 名前（調査の あいだだけ） |

## 3. 外に 出る もの

- **OpenAI**：子どもの 英文と 会話の 履歴だけ。名前・クラスは 入れない（`ai/tutor.js`）。電話番号・メール・URL・SNS の ID は `scrubContact()` が 送る 前に 消す（`conv:say` / `mission:say`）。
- **LiveKit**：大きな 部屋の 声と 映像の 中継と 名前。6 人までの 部屋は P2P。
- **LINE**：保護者の userId・子の ニックネーム・レポートの 画像/PDF。Webhook は 署名を 確かめる。
- **Google**：Sheets（教室が 選んだ ときだけ）、Fonts、STUN、Chrome の 音声認識。
- ブラウザーの `?server=` は localhost と LAN の IP でしか 効かない（本番の URL に つけても よそへ つながらない）。

## 4. 守り（サーバー）

- 全部の へんじに：HSTS（https の とき）・`X-Content-Type-Options: nosniff`・`X-Frame-Options: SAMEORIGIN`・`Referrer-Policy: no-referrer`・`Permissions-Policy`（カメラ・マイクは 自分だけ）・COOP。
- `trust proxy` は 1（Fly の 前段だけ）。前は `true` で、`X-Forwarded-For` の 左はし（利用者が 書ける）が `req.ip` に なり、admin の しめ出しが すり抜けられた。
- `/api/liff` `/r` `/report` `/class` `/export` は 1 IP 1 分 120 回まで（`rateLimit()`）。
- 先生の 鍵は localStorage に 書かない・読まない（共用の iPad）。sessionStorage には 再読みこみの ために 残る（タブを 閉じると 消える）。

## 5. まだ 決めて いない こと（人が 決める）

1. **名簿の「先生か」だけで 先生に なれる**（鍵なし）。先生の 名前を 知っている 子が 先生に なれて、クラス全員の レポートの リンク・メモが 見える。直すなら「先生の あいことば」の 列を 名簿に 足す（1 行の 追加・UI の 1 列）。
2. **`TEACHER_KEY` は 全クラス 共通**。教室が 1 つの あいだは よいが、複数の 教室を 同じ サーバーに 乗せるなら クラスごとの 鍵に する。
3. **署名つき リンク（保護者レポート・教室の ようす・CSV）に 期限が ない**。期限を 入れると いま 配っている リンクが 切れるので、切りかえの 日を 決めて 教室に 知らせてから。
4. **ACCESS_MODE の 既定が open**。クラスの あいことばと 名前だけで その 子として 入れる。名簿モード＋子どもの あいことば を 既定に するかは 教室の 運用しだい。
5. **CSP** は まだ ない（インラインの script が あるので、入れるなら 報告だけの モードから）。
6. **Google Fonts と 公開 STUN** は IP が Google に わたる。フォントの 自前 配信と TURN の 用意。
