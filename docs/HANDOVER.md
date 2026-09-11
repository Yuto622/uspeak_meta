# 引き継ぎ資料 — U-Speak Lab マルチプレイ版

この文書だけで、別の開発者（または別のAI）が続きを書けるように書いてあります。
コードの全文は `handover-*.txt`（このリポジトリの外に出力）にまとめてあります。

- リポジトリ: `Yuto622/uspeak_meta`
- 作業ブランチ: **`claude/colyseus-multiplayer-review-w81c37`**（`main` ではありません）
- 対象: 小学校の英語学習。英検5級〜3級。教室の iPad、1クラス最大25人。

---

## 0. 渡したファイル

コード全文を5つのテキストにまとめてあります。区切りは `===== FILE: <パス> =====` の行で、
そこからそのままファイルに戻せます（159ファイル）。

| ファイル | 中身 |
|---|---|
| `uspeak-meta.txt` | 設定・スクリプト・ドキュメント（この文書もこの中） |
| `uspeak-server.txt` | サーバー全部。**判定はすべてここにあります** |
| `uspeak-client.txt` | ブラウザ側全部（ビルド不要の ES modules と CSS） |
| `uspeak-data.txt` | 島のデータ JSON（クライアントとサーバーが共有） |
| `uspeak-tests.txt` | テスト全部（ユニット・通信・3D回帰・実ブラウザ） |

**入っていないもの**: `client/dist/three.module.js`（three.js 本体・1.3MB）、
`client/dist/vendor/colyseus.js`（colyseus.js 本体）、`server/package-lock.json`。
どれも配布物そのままなので、リポジトリから取ってください。
`server/src/game/word-quiz.json`（1,501問）は形式がわかる分だけ抜粋してあります。

---

## 0.5 まず動かす

```bash
cd server && npm ci && npm start          # http://localhost:2567
cd server && npm test                     # 108 件（ユニット＋実サーバー通信）
cd client && node tests/regression.mjs    # 10 件（3Dワールドの不変条件）
```

実機テスト用のトンネル（Windows）:

```powershell
.\scripts\start-tunnel.ps1 -TeacherKey '8文字以上のパスワード'
```

ブラウザ e2e（`npm test` には入っていません。Playwright が要ります）:

```bash
cd server
PLAYWRIGHT_MODULE_DIR=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome \
  node test/e2e/browser-school.mjs      # 他に -arena -eiken -errand -night -ride -town -inside -daily -sync -layout -scale
```

---

## 1. この設計で絶対に崩してはいけない線

ここを崩すと、保護者に出す数字が信用できなくなります。**新しい機能を足すときも同じ線を守ってください。**

1. **サーバーが決めるもの**: コイン・XP・正誤判定・捕獲・購入・所持品・ラップタイム・日次上限。
   クライアントは「何を選んだか」を送るだけで、「正しかったか」は送りません。
2. **クライアントが決めてよいもの**: 位置・向き・アニメーション。
   これは*ゲームの規則*であって不正対策ではありません（宣言制です）。
3. **位置ゲート**: 何かを受け取る操作は、その場所に立っていることが条件です
   （`ClassRoom.atPlace()`）。建物の中にいる場合は `in:<島>:<建物>` という space 名で、
   **その名前が今問われている建物と一致するか**をサーバーが照合します。
4. **答えはクライアントに送らない**: 単語の小屋（`word-quiz.json`）とアリーナ（`battle-bank.json`）は
   サーバー専用。選択肢だけ送ります。逆に、レッスンと魚の語彙はクライアントにあります（設計上の区別）。
5. **共有データファイル**: 島の座標・NPC・文言は `client/dist/*.json` に1つだけ置き、
   **サーバーもそれを読みます**（`server/src/game/*.js` の loader）。二重定義を作らないでください。
6. **秘密はコードに書かない**: すべて環境変数（`.env.example` 参照）。`.env` は `.gitignore` 済み。
7. **オフライン単独プレイを壊さない**: 接続しなくても遊べる部分（Willowの会話・釣り・RPG）は
   そのまま動く必要があります。

---

## 2. 全体像

```
client/dist/           ブラウザ（ビルド不要。素の ES modules + three.js）
  game.js              エントリ。ワールド生成・入力・カメラ・毎フレーム更新
  net-client.js        Colyseus クライアント。20Hz送信・補間・再接続・全UIの配線
  rpg.js               島とワールドマップ。島の表示切替・当たり判定・屋内の分岐
  island-kit.js        島の共通部品（地形・家・道・住人・入口・ミニマップ）
  island-interior.js   島の建物の中（1部屋を作り替えて使い回す）
  room-world.js        マイルーム（かぐを置く部屋）
  plaza-world.js       ひろば（マインクラフト式のブロック建築）
  *-island.js          各島の見た目（errand/school/arena/pet/ride/town）
  eiken-island.js      英検の島3つ（同じ間取り・3つの世界）／ eiken.js は4技能の画面
  *.json               島のデータ（座標・文言）＝サーバーと共有
server/src/
  index.js             HTTP + Colyseus。/healthz /config.js /report/:class/:name
  rooms/ClassRoom.js   1クラス=1部屋。すべての判定がここに集まる（約1400行）
  game/*.js            判定の中身（quiz, gym, battle, pets, vehicles, town, eiken, night, daily…）
  game/eiken-bank.json 英検の問題と答え。**クライアントには来ない**（word-quiz.json と同じ）
  store/               永続化（Google スプレッドシート / ローカルJSON）
  ai/tutor.js          AI英会話（ウーピー）。キーはサーバーから出ません
```

**部屋の状態**: `RoomState`（全員に配る）には名前・位置・アニメだけ。
財布・所持品・学習記録は `priv`（サーバー内 Map）に置き、本人にだけメッセージで送ります。

**永続化**: `PLAYER_COLUMNS` は**追記のみ**（列の意味を変えない）。
Google シートのヘッダは短ければ自動で伸ばし、食い違えば警告して触りません。

---

## 3. いま入っているもの（Roblox からの移管 38系統）

詳細と設計判断は `docs/ROBLOX_MIGRATION.md`（0a〜0m）にあります。

| 島 / 層 | 中身 |
|---|---|
| おつかい島 | 英語で受けて、店で話して、届ける3段階。全部歩く |
| ことばの学校島 | 1,501問の4択（易/中/難＝建物で分かれる）＋ 聞く・話すジム |
| えいごアリーナ島 | わざ4種のCPU戦（3難易度）＋ 魚をわざに変える道場。日次150🪙上限 |
| ペット島 | たまご→孵化→ごはん→なでる。時間で減衰（オフライン時間も数える） |
| のりもの島 | 4台（レベル＋コインで解放）＋ 方向の英単語アーチ6つのコース |
| まちづくり島 | ブロック屋・かぐ屋・ふどうさん・マイルーム（かぐ）・ひろば（ブロック建築） |
| 英検の島 ×3 | 5級・4級・3級。島ごとに 読む・聞く・書く・話す の4館（1セット5問） |
| 日課 | ログインボーナス（日本時間12時切替・7日100→400🪙）・週間ランキング・シーズン |
| 世界の演出 | 昼300/夕120/夜240/朝45秒の共有時計・夜のおばけ12体・環境音 |
| 運用 | 入場ゲート（名簿・3段フォールバック）・保護者レポート（署名付きURL） |
| 建物 | 島の全25棟が**入れる部屋**。中のカウンターで操作 |

---

## 4. まだ終わっていない / 次にやること

1. **アリーナのPvP**（Roblox にはあった。マッチング・両者接続・中断処理の設計が要ります）
2. **実機テスト**（iPad/スマホ・25台同時・スリープ復帰3秒以内）
3. **Fly.io デプロイ**（`scripts/deploy-fly.ps1`。東京 nrt・`wss://`・スリープ無効）
4. **Google スプレッドシート接続**（`.env` に service account。`roster` タブが名簿）
5. **A7 読み上げ / A8 宿題 / A9 フレーズ図鑑 / F2 きせかえ**（未着手）
6. **D3 共有建築エリア**（Roblox では別プレイス。同期コストが桁違いなので見送り中）

**利用者の判断待ち**: 会話に平文で出た OpenAI キーの失効。旧GAS URLの再発行可否。

---

## 5. 踏んだ罠（同じ穴に落ちないために）

- **閉じた `<dialog>` が画面中央でタップを食う**。`display:flex` は必ず `#id[open]` に付ける。
  素の `#id { display:flex }` はブラウザ既定の `dialog:not([open]){display:none}` に勝ってしまう。
- **島オブジェクトを `{...island}` で複製すると getter が固定される**。`Object.assign(island, {...})` を使う。
- **新しい島を足すと宝箱・遺物が勝手に増減する**（配列の位置で対応付けていたため）。
  `ACTIVITY_HUBS` を見て除外する。
- **石畳が建物を貫通していても、迂回路があると経路テストは通る**。
  データに `path` を持たせ、その直線上を歩いて検査すること（`client/tests/regression.mjs`）。
- **屋内はアバターの座標が Willow と重なる**。屋内では屋外の近接プロンプトを止める（`indoors` フラグ）。
- **Lua のテーブルは同じキーを後勝ちで潰す**。Roblox のクイズ8問がこれで壊れていた（3問は正解が消えていた）。移植時に修復済み。
- **`RandomNumberGenerator::Fill` は .NET Core 専用**。Windows PowerShell 5.1 では落ちる。
- **BOMなしUTF-8の .ps1 は cp932 として読まれる**。PowerShell の出力は ASCII で書く。
- **ブラウザ e2e は3fps程度**。時間ではなく状態を待つ（`waitForFunction`）。歩行の方角は
  「キーを押した後の向き」ではなく**実際に動いた量**から測る（押下が丸ごと落ちるため）。

---

## 6. テストの考え方

- `server/test/*.test.mjs` — 判定の中身と、実サーバー＋実クライアントの通信（108件）。
  **新しい「もらえるもの」を足したら、必ず「その場所にいないと断られる」テストを書いてください。**
- `client/tests/regression.mjs` — 3Dワールドの不変条件（立てる・歩いて行ける・道が建物を貫通しない・
  2か所に同時に立てない・全建物に入口がある）。ヘッドレスで速いので、島を足したらここに1行。
- `server/test/e2e/browser-*.mjs` — 本物のブラウザで本物のアバターを歩かせる。
  **仕様の最終確認はこれ**（「歩かないと達成できない」は、歩かせないと確認できません）。
