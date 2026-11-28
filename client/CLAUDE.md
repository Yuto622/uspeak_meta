# Claude Code 引き継ぎメモ

## 構成

静的HTML/CSS/ES Modules。dist/はビルド出力でなく手書きソースです。削除・上書きを避けてください。
依頼されない限りフレームワークへの全面移行は不要です。日本語UIと既存機能を維持してください。

| 対象 | dist/配下のファイル |
|---|---|
| HTML・初期化・メインループ | index.html / game.js / style.css |
| 画面の言語（英語／日本語） | i18n.js（t / translate / setLang）/ i18n-dom.js（画面ぜんぶ・LEARNING）/ canvas-say.js（canvas の文字）/ lang.json / bilingual.js（label()）/ style.css の .en .ja |
| あそびかたガイド（「?」） | guide.js / guide.css / guide.json / assets/guide/ |
| 光・昼夜・カメラ・描画 | atmosphere.js |
| 環境音・昼と夜のBGM | ambience.js / assets/bgm/（day.mp3 / night.mp3 / SOURCE.json） |
| 読み上げ（日本語・英語） | speech.js（forSpeech / createSpeech） |
| テーマパーク・飛行機・乗り物 | themepark.js |
| アバター | avatars.js |
| 釣り・魚・経済 | fishing.js / fishing-state.js / fishing-data.js / fishing-models.js / fish-species.js / assets/fish/ |
| メインの島（2D のホーム）・英単語ハウス | main-island.js / main-island.css / main_island.json / wordhouse.js / wordhouse.css |
| RPG・地域・図鑑・地図 | rpg.js / rpg-state.js / rpg-data.js / world-picker.js + world-picker.css（しまの ちず） / rpg-map.js（もとの海図・検査だけが使う） |
| 地形・キャラモデル | rpg-world.js / rpg-models.js |
| 物語・育成・リーグ・復習 | adventure.js / adventure-state.js / adventure-data.js / adventure-quiz.js |
| RPG演出・UI | adventure-effects.js / adventure.css |
| 杖・伝説・回復 | magic.js / magic-data.js / magic-world.js / magic.css |
| 建物入口・屋内 | buildings.js / park-interior.js / building-room.js |
| AI英会話（英会話島） | conv.js / conv.css / conv-island.js / conv.json / assets/character/*.mp4 |
| ウーピー（動画と声） | character.js（会話島と英検の面接で共有） |
| 英検の面接（めんせつの間） | interview.js / interview.css（島は eiken-island.js / eiken.json） |
| メッセージ（定型文・自由入力） | chat.js / net.css / voice.js（部屋の中） |
| のりもの島・カートレース | ride.js / ride-island.js / vehicles.json / kart.js / race.js / race.css |
| グランプリ（べつのゲーム） | kart-game.js / kart.css / tracks.json / kart-track-data.js / kart-track.js / kart-drive.js / kart-ai.js / kart-models.js |
| コインの見える化・マイページ | coin-hud.js / coin.css / dashboard.js / dashboard.css（サーバーは server/src/game/skills.js） |
| きせかえ（アバターの店・きせかえ島） | wardrobe.js / wardrobe.css / wardrobe.json / wardrobe-data.js / wardrobe-models.js / wardrobe-island.js（サーバーは server/src/game/wardrobe.js） |
| 同梱した外部ゲーム（共通の席） | arcade.js / arcade.css |
| AURORA KART（のりもの島から） | racers.js / racers/（丸ごと同梱・無改変） |
| BLOCKWILD（まちづくり島から） | blockwild.js / blockwild-blocks.js / blockwild/（丸ごと同梱・無改変） |
| PUYO U-SPEAK / えいごスイカゲーム（ミニゲーム島から） | puyo.js / suika.js / puyo/ / suika/ / mini-island.js / minigames.json |
| 宝箱・鍵・秘宝 | treasure-data.js / treasure.js / adventure-state.js |

## 軽くする（2026-10）— 見た目と 体験は 変えずに
- **`three.module.js` は 公式の 小さく した 版**（r160 の `build/three.module.min.js` を 同じ名前で 置いた。1.27MB → 670KB、中身は 同じ）。
  差し替えるときも npm の 公式の min を 使う（自分で 小さく しない）。`tests/regression.mjs` は この ファイルを 文の 検査から 外している。
- **日本語の ときは 辞書（lang.json・約250KB）を 起動で 読まない。** 6 秒後の 手が すいた ときに 読む（`game.js` の `startEnglish`）。その前に「A」が 押されたら その場で。
- **日本語の あいだは 画面の 訳の 見張り（MutationObserver）を 止める**（`i18n-dom.js`）。英語に したら 引きなおしてから 見張る。

## すがた えらび（はじめて）は スキップ できる（2026-11）
- はじめての 人の すがた えらびに「スキップ（あとで えらぶ）」（`#avatar-cancel` を はじめてだけ この 文に する・`avatars.js` の `cancelLabel()`）。いまの すがた（Kai）で 保存して はじめる。2 回目からは いつもの「キャンセル」。

- **はじめに えらぶ すがたは きぐるみ 8 ぴき＋前からの 8 人**（2026-11）：うさぎ・くま・きょうりゅう・ペンギン・きつね・かえる・ひよこ・さめ（`avatars.js` の `AVATARS` の `cut:'kigu'`・形は `kigurumi()`）。はじめの すがた（スキップ）は うさぎ。
  きせかえ島で 買う すがたとは べつの どうぶつに して ある（お店の 品を ただに しない）。id を 足したら 部屋の `AVATAR_IDS`（`ClassRoom.js`）にも 足す（足さないと となりの 子には Kai に 見える）。
  なまえは 辞書に 入れない（うさぎ・くま は クイズの 答え）：`name`／`en` を `.ja`／`.en` で 両方 書く。画面の 見た目は `cosmic-panels.css` の さいごの かたまり（宇宙の 形・**色は ブランドの 深緑・オレンジ・クリーム**）。16 まいが 1 画面に 入る こと（PC・iPad・横もちの スマホ）。

## 幼児モード（`kids.js` / `kids.css`／2026-11）
- **先生が きりかえる**：教室の 先生は `/teacher/kids`、運営は `/admin/kids`（同じ 画面・`server/src/classroom/kids.js`）。クラスごとの スイッチ＋子どもごとの 上書き（クラスと おなじ・オン・オフ）。
  置き場は `DATA_DIR/kids-mode.json`（`classroom/kids-store.js`）。**名簿の 列では ない**（3 つの 状態が いるので べつの 置き場に した）。
- **きめるのは 部屋**：`welcome.kids` と、かわった ときの `kids` メッセージ（`ClassRoom.recheckRole`・置き場の 版が 上がると すぐ、おそくても 1 分）。先生は いつも ふつう。
  判定・コイン・記録は ふつうの モードと 同じ。部屋が ちがう ことを するのは 1 つだけ：幼児モードの 子の 自由入力の チャットを 通さない（`chat:blocked` reason `kids`）。
- **画面**：`body[data-mode=kids]`。`kids.css` が ふだんの 道具（右の レール・`.top-dock`・つぎに やること・ホットバー・🗣・ビデオ通話・復習の カード）を しまい、上は コインと ♫ だけ。
  しまう ものを 足す ときは `kids.css` の いちばん 上の 一覧に 1 行（ほかの CSS は さわらない）。
- **こどもの ホーム（`#kids-home`）**：入ると まず 出る。大きな ボタン 5 つ（きょうの がくしゅう＝宿題が あれば 宿題・なければ 本だな／ほんだな／しまの ちず／きせかえ／あそぶ）。どれにも 🔊。
  宿題・本だな・きせかえは dialog なので ホームの 上に ひらき、とじると ホームに もどる。`body[data-kids-home]` の 間は 右下の 道具も しまう。
- **行き先ボタン（`#kids-dock`）**：島の 上で 下に 出る。🏠 ホーム＋その 島の 建物（メインの島は えいたんご・つり・ふくや の 3 つ）。おすと 戸口へ（メインの島は そのまま 中の 画面）。
- **行ける 島**：`KIDS_ISLANDS`（main・reading・fishworld・wear・land）。しまの ちず（`world-picker.js`）は これだけ 出し、メインの島の ほかの ゲートと BLOCKWILD は「せんせいに きいてね」。
  **画面で しぼって いるだけ**（部屋は 止めない）。スティック・WASD は のこして ある（行き先ボタンの ない 場所で 動けなく ならない ように）。
- 検査：`server/test/kids-mode.test.mjs`（置き場の きまり・welcome・入ったままの 子に とどく・先生は ふつう・よその 教室の クラスは かえられない）。

## 読みこみ画面（`#loading`／2026-11 に 作りなおし）

`index.html` の `#loading` と `loading.css`（`loading.js` は から＝index.html が 読むので のこして ある）。
**ブランドの 色（深緑・オレンジ・クリーム）の 平らな 画面**：まわる オレンジの 輪 1 本・上下する「u」の ロゴ・のびる バー。部品は 10 こ。
前の「次元の とびら」（CSS の 3D で 島・輪・英字の 立方体・ワープの 星）は むらさきで ブランドと 関係が なく、かくかく して 重いと 言われて やめた。
- うごかすのは transform と opacity だけ。CSS の 3D（preserve-3d）・filter・大きな box-shadow・たくさんの 星を **足さない** こと。星は 背景の 絵（動かない）。
- `game.js` の 準備が おわると `#loading` ごと 消える。3D が 出せない ときは `game.js` が 中身を 文に 書きかえる。`prefers-reduced-motion` では 止まる。

## ひこうきの ワープ（`warp.css` / `warp.js`／2026-10 追加）

島から 島へ 飛ぶ 間（`rpg.js` の `fly()` → `finishFlight()`、テーマパーク行きの `themepark.js` の 飛行）は `startWarp()` / `stopWarp()` が
`body[data-warp]` を 立てる。`#warp-fx`（`pointer-events: none`・z-index 14）が 3D の 上に **ひろがる 輪 3 本と 動かない 暗い ふち**だけ かぶせ、`#rpg-flight-hud` / `#travel-hud` は こい 色の 板（ぼかし なし）。
**2026-11 に 重いと 言われて 軽くした**（光の すじ・つぶ・まんなかの 光・走査線・色ずれ・パネルの すりガラス・まわる 虹の ふち・虹色の 文字を やめた）。動かすのは transform と opacity だけ。画面いっぱいの 動く もの・filter・backdrop-filter・光の box-shadow を 足さない こと。強さは `setWarp(u)`（`--warp` = sin(πu)、下限 0.5）で
とちゅうが いちばん 強い。飛んでいる 間は 島の 道具（おなか・🏠・チャット・ビデオ通話・ランキング・左下の 入口）を しまう。
**相棒ショー（`adventure.js`）は 同じ パネルを 使うが ワープは 出さない**（`startWarp` を 呼ばない）。

## 一人称（じぶんの め／`fp.css` / `fp-hand.js`／2026-10 更新）

**BLOCKWILD（同梱の `blockwild/game.js`）と 同じ 作り・同じ 数字**に そろえてある。変えるときは あちらを 見てから。
- **入口は 下の ホットバーの 「👁 じぶんの め」（キー 4 / V）**。ホットバーは ぼうけん・たんごちょう・しまの ちず・じぶんの め の 4 つ（「ひろばへ」は 2026-10 に なくした）。前は 右の バーの `#view-toggle` だけで、700px 以下と 横向きの 携帯では
  消えて いたので スマホでは 入れなかった。`#fp-button` は `#view-toggle` を 押すだけ（切りかえの 中身は `atmosphere.js` の 1 か所）。
- **見回す**：パソコンは 画面を クリックすると マウスで 見わたせる（Pointer Lock・感度 0.002・Esc で はなす・`body.fp-locked`）。
  固定できない ときは ドラッグ（0.0052）。指は なぞる。上下は 一人称の 間だけ ±1.5（ふつうは ±0.9）。
- **カメラ**：FOV 76（走ると 85）、`fpView()` が dt×9 で なめらかに。歩くと 上下 0.035 と ころがり 0.008 で ゆれる（`fpBob`、走ると 速く）。
  向きは `camera.rotation`（順番 `YXZ`）＝ pitch・yaw で 直接 決める。**スペースで ジャンプ**（`jumpY` / `jumpV`、重さ 22。どの 視点でも とぶ）。
- **手元（`fp-hand.js`）**：右下に 自分の 腕（はだと 服の 色は アバターから）。歩くと ゆれ、E や「はなす」で ふる。
  **島と 同じ renderer で、別の 小さな シーンを 深さだけ 消して 上に 描く**（WebGL を 増やさない）。
- **画面（`#fp-hud`）**：まんなかに 白い ＋ だけ。ちかくに 入れる／話せる ものが あると 1.15 倍（`body.fp-near`・`game.js` が 毎フレーム
  `#near` を 見て つける）。マウスを 固定して いない ときは ＋ に 輪（BLOCKWILD の freelook と 同じ）。「話す」ボタンは ＋ の すぐ下。
  操作の ヒントは 9 秒で きえる。ひこうき・つり・レース・全画面の 間は 出さない。

## 授業モード（Class Mode）と 苦手単語の 復習（Review）／2026-10 追加

Roblox 版（USpeakTeacherLive / USpeakReviewServer）と 同じ 動き・同じ ルール。画面は `class-mode.js` + `class-mode.css`、
部屋は `server/src/game/class-mode.js`（決まりと 行き先の 表）・`server/src/game/review.js`（復習の ルール）と `ClassRoom` の `class:*` / `review:*`。

- **先生の 判定は サーバー**：講師キー、または **admin（/admin）の 名簿で「先生か」が true ＋ その 行の あいことば（`pin`）が 合った** 名前。
  `gate.isTeacher({name, pin})` が 名簿を 見て、`onAuth` が role を 決める。ロビーの「先生用」の 1 つの 欄が 講師キーにも 先生の あいことばにも なる。
  **2026-10-20 から 名前だけでは 先生に なれない**（あいことばの ない 先生の 行は 講師キーで 入る）。
  **ロビーは なまえ・クラスコード・先生パスワード の 3 つだけ**（先生パスワードは 2026-11 から たたまず いつも 見せる。「先生だけ・こどもは いらない」の 札つき。id `#net-teacher-details` は のこした）（2026-11 に「じぶんの あいことば」を なくした。そこに 入れた 先生が だまって 生徒に なり、🎓 が 出なかった）。部屋は 古い ページの `pin` も 先生の あいことばとして 見る。**先生の 行は 先生パスワード（名簿の pin 列）が 一致しないと 入室も できない**（4005 `wrong password`。空の 先生の 行も 入れない・admin も 空では 保存させない）。
  **名簿の「クラスコード」列**（2026-11）：書いた 人は その クラスコードでしか 入れない（名簿で 制限 ON の とき。空＝どの クラスでも・大文字小文字は 区別しない）。CSV の 読みこみは 同じ 名前の 行を 書きかえる。
  **pin は roster.json の 読みなおしで 消えていた**（FileStore の `rosterRowsFromJson`。デプロイの たびに 空に なり 🎓 が 出なかった・`test/roster-pin.test.mjs`）。
  子どもの 行の あいことばは 見ない（先生の 行だけ、名前で 先生の 席に すわらせない ために あいことばが いる）。
- **名簿を かえたら 入ったままの 人にも すぐ 効く**（`ClassRoom.recheckRole`）。admin で 保存すると 名簿の 版が あがり、
  tick が 全員の「先生か」を 読みなおして かわった 人に `role` を おくる（ボタン・先生コンソールが 消える／出る）。
  トークンでの つなぎなおし（`onAuth` を 通らない）でも 読みなおす。1 分ごとにも 読む（名簿が スプレッドシートの とき）。
  講師キーで 入った 人（`priv.byKey`）は 名簿に かかわらず 先生の まま。前は 入った ときの 1 回だけで、false に しても 出たままだった。
- **停止（2026-11）**：名簿の「停止」列（`stopped` / `停止`）が true の アカウントは 入れない（4008 `account stopped`・open でも roster でも・先生の 行も）。入ったままの 人も 名簿の 読みなおし（保存の すぐ あと・1 分ごと）で 出て、ロビーに「この アカウントは いま つかえません」。記録は のこり、false に もどせば 入れる。講師キーで 入る 人（運営）だけは 止まらない。
- **ログアウト**：上の バーの ⏏（`#logout-button`、クラスに いる 間だけ）。クラスから でて、この ブラウザの なまえ・クラス
  （`uspeak-net-prefs-v1`）と つなぎなおしの 情報を 消し、からの ロビーを 出す。共用の iPad で つぎの 子が つかえる。
- **先生だけ**に 左上の「🎓 Class Mode」（`#class-mode-button`、`body.cm-teacher` で クエスト一覧を 下げる）。パネル（`#class-mode-panel`）は
  生徒の 一覧（`class:get` → `class:state`、開いている 間 4 秒ごと）と 4 つの ボタン。どれも 確認つき（英語＋小さく 日本語）。
  - 📣 Gather：`class:gather {space,x,z}` → 生徒に「📣 ○○ せんせいの ところに あつまるよ！」→ 1.5 秒後 `teleport`（先生の まわりに 円く）→「✨ ついたよ！」。**5 秒に 1 回**。
  - ⏸ Freeze ↔ ▶ Resume：`class:freeze {on}`。生徒は 全画面「✋ Listen to your teacher!」（`#class-mode-cover`・`body[data-class-pause]` で
    `game.js` の 移動と キーを 止める）。**部屋も 答え・買い物などを 捨てる**（`blockedWhilePaused()`、onMessage を 1 枚 つつんでいる）。
    **10 分で 自動再開**、**途中参加にも ストップ**（welcome の `classPaused` と `class:pause`）。
  - 📚 Review weak words：`class:review` → 生徒 1 人ずつ 自分の 苦手（最大 5 問・時期前も 足す）。苦手の ない 子は「🌟 No weak words!」。
    約 75 秒後か 全員 終わったら 先生に `class:result`（正解数と 多く まちがえた 3 語）。
  - 🌍 Move together：行き先カード（`DESTINATIONS`、今いる 場所は のぞく）→ 全員（先生も）に 5 秒の カウントダウン → `goPlace()`（net-client）で
    その 島へ。英単語ハウスは その 戸口の 前。**15 秒に 1 回**。失敗しても 25 秒で 表示が 閉じる。
  - 先生の 操作は **1 秒に 1 回**まで（部屋が 捨てる）。結果は `class:toast`。Web の 先生が 動かせるのは Web の 生徒だけ。
- **保護者レポートの 箱（roblox_events）には Web の ぜんぶの 正解・不正解が のる（2026-11）**：`ClassRoom.appendLearning` が `quizEventOf(row)` で 1 行 足す（U-Speak島の つり＝単語と 級つき・レッスン・ことばの学校・ジム（聞く・書く）・アリーナ・ぼくじょう・レースの 📦）。
  じぶんで 書いて いる あそび（英検・つり島・宿題・英単語ハウス・復習）と、正解・不正解では ない もの（チャット・AI英会話・おつかい・面接の 1 問ずつ・声の 判定）は 足さない（二重に 数えない）。あそびを 足したら `quizEventOf` に 1 行。
- **復習の 箱は 1 つ**：`review.js` が roblox_events の quiz（Roblox と Web。Web は `robloxEvent` が source=web で 書く）を 古い 順に たたんで
  毎回 計算する（別の 表は 持たない＝同期が いらない）。まちがい→1 日後、時期後 or level=Review で 正解→3 日後→7 日後→卒業、60 語まで、英単語だけ。
  出題は「🔊 を 聞いて 4 つから」（`#review-dialog`）。**読み上げるので 単語（`say`）は ページに 送る**（つり島の listen と 同じ）。判定・+3 コインは 部屋。
  記録は world=review・level=Review で、それが また 箱を 進める。
- **1 日 1 回の カード**（`#review-offer`）：入って 20 秒後（`REVIEW_OFFER_DELAY_MS`）、時期の 単語が 3 つ 以上なら。出した 日は 保存の `review_day`。
- 保護者ページ（Roblox の レポート）に「次に覚える単語」（`review_next`）と「復習待ちの単語数」、「覚えた単語」に 卒業した 単語。
  先生の クラス一覧（/class の Roblox の 表）に「復習待ちの単語数」の 列。`GET /api/roblox/review/:username`（X-USpeak-Key）で 時期の 単語と 選択肢。
- 画面の 中身は 英語と 日本語を 両方 いつも 出すので、入れ物は `translate="no"`（訳の 層が 日本語を 英語に 変えて 2 重に しない）。
- 検査：`server/test/class-mode.test.mjs`（実ソケット。先生だけ・ストップ中は 答えを 捨てる・途中参加・自動再開・1/5/15 秒・クラス結果・コイン）、
  `server/test/review.test.mjs`（日付を 進めて 1/3/7 日と 卒業、60 語、Roblox と Web が 同じ 箱、レポートの 数字）、`server/test/admin.test.mjs`（先生か の 列）。

## 島の音（環境音と、昼と夜のBGM／2026-09 更新）

`ambience.js` に全部ある。鳴るのは**風と BGM**、それに **足音と とびらの 音**（2026-10）。風・足音・とびらは**ブラウザーが自分で作る**
（音のファイルは無い）。BGM は `assets/bgm/day.mp3` `night.mp3`（渡された音源・無改変）。

- **足音**（`ambience.step(dt, {moving, running, sneaking, indoors})`・`game.js` の tick から 毎フレーム）：白い ノイズ 90ms を 帯域で 絞った つぶ。
  外は 420Hz（土）、家の 中は 1100Hz（木の 床）。歩き 0.42 秒・走り 0.28 秒・そっと 0.7 秒に 1 歩。止まると 時計を 0.3 に 戻し、次の 1 歩目が すぐ 鳴る。
- **とびら**（`ambience.door(opening)`）：`game.js` が `indoors`（`rpg.inRoom || rpg.insideBuilding`）の 切りかわりを 見て 呼ぶので、どの 建物でも 1 か所。
  あける＝110Hz の コトッ＋ド→ソ、しめる＝コトッ＋ソ 1 音。
- どちらも `master` を 通る＝ミュート・全画面（`setBusy`）・通話中の 下げ が そのまま 効く。`ctx` が `running` で ない あいだ（最初の タッチの 前）は 鳴らない。

- **鳥と虫の鳴き声は作っていない。** 以前はオシレーターで鳴らしていた（昼は鳥、夜は虫）が、
  どちらも結局は電子音で、後ろで「ピピピ」と鳴り続けるのが耳につく。**戻さないこと。**
  時間帯を伝える仕事は BGM のクロスフェードのほうが上手にやる。

- **2曲は同時に流して音量だけで混ぜる。** 時間帯で鳴らし分けると、夕方のその一瞬で曲が
  変わってそこだけ場面転換になる。世界の時計はなめらかに動くので、音もそう動かす。
  混ぜかたは**等電力**（cos / sin）。足して1にすると、ちょうど半分で音が痩せる。
- **`<audio>` の `volume` を使わないこと。** **iPad Safari は無視する**（読めるが効かない）。
  全部 `createMediaElementSource → GainNode → master` に通してある。**つなげなかった曲は
  鳴らさない**（そこで諦めずに `play()` すると、♫ もつまみも効かない BGM が全開で出る）。
- **風は曲の10分の1**（`WIND_LEVEL = 0.05`）。曲が入る前は 0.5 だった。単体では気に
  ならなくても、**曲と重なると後ろの「ゴー」が曲を塗りつぶす**（うるさいと言われて落とした）。
  ここは「聞こえる音」ではなく「静かすぎないための音」。`browser-bgm.mjs` が
  「風は曲より一桁小さい」を検査しているので、上げ直すとそこで落ちる。
- **2曲を同時に落とさない。** 1曲2.85MBで、実測すると入室のところで流れるバイトの
  ほとんどがこれだった（ページ全体 2.6MB に対して 5.7MB）。いま鳴るほうだけを落とし、
  **もう片方は空が変わりはじめてから**（`setNight` が唯一の取りに行くところ）。
  夕方は120秒あるので間に合う。**夜に入ってきた子は最初のタッチのほうが時計より早い**
  ことがあるので、`setNight` は「いま鳴るべきほう」も必ず確かめる。
  測りかたは `server/test/e2e/measure-weight.mjs`。
- **読みに行くのは最初のタッチのあと**（`arm()`）。1曲2.8MB を、音を切っている教室に
  黙って落とさせない。`game.js` は `pointerdown` / `keydown` のたびに `arm()` を呼ぶ
  （1回目で音の許可が下りるとは限らない端末があるため）。鳴っていれば即座に戻る。
- **全画面のもの（同梱ゲーム・グランプリ）が上がっている間は黙る**（`setBusy()`）。
  呼んでいるのは `game.js` のフレームループ、**島の描画を止めているのと同じ1行**。
  片方だけ足すと、絵は止まっているのに音だけ鳴り続ける。曲は**止める**（gain 0 のまま
  流しても音は出ないが、iPad は mp3 を解き続けて電池が減る）。
- **差し替えは同じ名前で上書きし、`assets/bgm/SOURCE.json` のバイト数と sha256 も直す。**
  `tests/regression.mjs` が突き合わせ、**`ambience.js` がその名前を指しているかも見る**
  （曲名を変えて島を無音にしたまま出るのを防ぐ）。同梱ゲームと同じ扱い。
- 検査は `server/test/e2e/browser-bgm.mjs`（実ブラウザ・13項目）。**測るのは GainNode の値**。
  時刻は `game.js` の `worldClock(net.night.update(…))` に差し込んで動かす
  （`ambience.setNight()` を外から呼んでも、次のフレームで本物の時計に戻される）。

## 下の バー と 上の バー（2026-10）

- **2 たんごちょう**は `wordbook.js` + `wordbook.css`：うちゅうの 中の うらがえる カード（表＝英語・裏＝日本語・🔊）、
  たんご／フレーズの タブ、さがす。中身は `game.js` の `words`（`uspeak-willow-v1`）。**数字だけの 語は 読む ときに すてる**
  （英検の 島が 4 たくの 番号を 入れていた。`eiken.js` は いま えらんだ ことばを 入れる）。
- **3 しまの ちず**は どこでも `rpg.openMap()`（右の ✈ と 同じ）。前は U-Speak島の 古い「つぎは どこへ」が 出ていた。
- **上の バーの 札**は `topbar.js`（`data-cap` → CSS の `::after`、幅 1000px 以上だけ）。スマホは 絵だけ（入らない）。

## 「?」は あそびかたガイド（2026-09 追加）

右上の `?` は、**全部の島と 全部のきのうを、写真つきで1ページずつ**見せる画面。
前は長い文章が1つのダイアログに入っていて、はじめての子には読み切れなかった。

- **中身は `guide.json` が唯一の定義元**で、`guide.js` は並べるだけ。文言を直す人が
  JavaScript を読まなくていいように分けてある（`missions.json` / `town.json` と同じ）。
  いまは 7章98ページ（はじめの 6ステップ → メインの島 → U-Speak島 → 15の島 → べつのゲーム → きろく・授業モード → そうさ）。
- **1ページに1つのこと。** 写真1枚＋3行。`tests/regression.mjs` が「本文4行まで」を検査する
  （長い文は写真の横に入りきらず、結局読まれない）。
- **写真は `docs/figures` と同じもの。** 紙の資料（`docs/uspeak-guide.pdf`）と同じ図を、
  `python3 docs/make-guide-images.py` が 960px・画質78 に落として
  `client/dist/assets/guide/` に置く。**撮り直すのは `capture-figures.mjs` の1か所だけ。**
  40枚で 2.4MB あるが、**guide.js は開いているページと次のページしか読まない。**
- **`shot` を足したら写真も足すこと。** `tests/regression.mjs` が guide.json と
  `assets/guide/` を突き合わせ、無ければ落ちる（文だけのページは、はじめての子には
  いちばん役に立たない）。`guide-avatar` / `guide-lobby` の2枚は **島に入る前の画面**。
- **はじめの 流れと あとから 入った 画面**（`guide-avatar` / `guide-lobby` / `main-*` / `screen-fp` /
  `screen-warp` / `screen-teacher` / `screen-classmode` / `screen-classfreeze` / `screen-review` / `screen-dashboard`）は
  `server/test/e2e/capture-guide.mjs` が 撮る（日本語の 画面・先生と 生徒の 2 ページ・Roblox の まちがいを 入れて 復習を 出す）。
  島ごとの 写真は いままでどおり `capture-figures.mjs`。どちらも `CHROMIUM_PATH=… node test/e2e/<名前>.mjs [写真の名前]`。
  **ゲームの 流れが かわったら（はじめに 立つ 島・下の バー など）ここを 撮り直して `start` 章を 直す。**
- `guide.open('ride')` のように章のidを渡すと、その章から開く。
- レイアウト検査（`browser-layout.mjs`）の `SCREENS` に `guide` として入れてある。

## 画面の文字は 日本語が主、「A」ボタンで英語（2026-10 更新）

**ふだんは日本語**（小学1年生が読める ひらがな）。ヘッダーの「A」を押すと、画面ぜんぶが英語になる。
選んだ言語は `localStorage` の `uspeak-lang-v2` に残る。**v1（英語が 既定だった ころの 選択）は 読まない**ので、日本語を 既定に した とき 全員 1回 日本語から はじまる。
2026-09〜10 は 英語が既定だった。下の「理由」は そのときの もの — 英語の 先生が 進める 教室では「A」で 英語に する。

**理由が2つある。**

1. **レッスンは外国人の先生が進める。** 画面が英語なら先生はそのまま読める。
2. **読むのは小学1年生。** 自分で日本語に切り替えられる。日本語は**ひらがな**で書く。

**前は英語と日本語を2行ならべて出していた**（`<b class=en>` の下に `<i class=ja>`）。
バーの高さを2倍食うのと、どちらを読めばいいのか子どもが迷うのでやめた。
**2行を書く仕組みはそのまま残っている** — 出すほうを CSS が選ぶだけになった。

### 仕組みは2つだけ

| 書きかた | 切り替えるもの | いつ使う |
|---|---|---|
| `<b class="en">Map</b><i class="ja">しまの ちず</i>` | **CSS**（`html[data-lang]`） | ボタンの見出しのように、両方その場に書けるもの |
| `t('つぎへ →')` / `data-t="つぎへ →"` | **辞書**（`lang.json`） | JavaScript が組み立てる文、HTML に直接書いてある文 |

- **鍵はいまの日本語の文そのもの。** `t('やめる')` と書くと、英語のときは `lang.json` の
  `"やめる"` を引いて `"Quit"` を返し、日本語のときはそのまま返す。
  **英語を鍵にしなかった理由**は `i18n.js` の頭に書いてある（要は、1,800か所ある日本語を
  全部書き換える差分に見合う利益が無く、訳が抜けたときに**日本語がそのまま出る**ほうが安全）。
- **訳が抜けても画面は壊れない。** 日本語が出るだけ。だから抜けたことに誰も気づかない。
  `tests/regression.mjs` が「HTML の印が全部 辞書にあるか」「訳が日本語のままになって
  いないか」を数えている。
- **`.en` / `.ja` の行に `data-t` を付けないこと。** あちらは CSS が切り替えるので、
  印が付いていると 英語のときに*日本語の行*へ英語が書き込まれる（見えないが無意味）。
  これも `tests/regression.mjs` が見ている。
- **`t` という名前が使えないファイルがある。** `game.js` の `tick()` には
  `const t = clock.elapsedTime` があり、`{ t }` で import すると**フレームループの中の訳が
  そこに当たって画面が白いまま止まる**（実際にそうなった）。ぶつかるファイルでは
  `import { t as tr }` と書く（いまは `game.js` と `avatars.js`）。
  `tests/regression.mjs` が「時間の t を持っているのに `{ t }` で import している」を落とす。
- **JavaScript で建てる画面は、建てたあとに `applyDom(その要素)` を1回呼ぶ。**
  `data-t` を書いても、`applyDom()` が走ったときに document に居なければ訳されない
  （`lobby.js` がそう）。
- **切り替えたときに描き直すのは、JavaScript が毎回書いている文字だけ。**
  `onLangChange()` を使う。`data-t` と `.en`/`.ja` は i18n.js と CSS が自分でやる。
  **まる／ばつを出している途中には触らない**（描き直すと 正解の色も 次へ進むタイマーも
  巻き戻る）。`eiken.js` は `!locked` のときだけ描き直している。

### **学習の中身は訳さない**

英検の「かく」の日本語文、釣りの4択の意味、会話の訳は、**日本語であることが問題そのもの**。
訳してしまうと問題が成立しない。`lang.json` に入れるのは
**画面の文字（ボタン・見出し・説明・お知らせ）だけ**。
`tests/regression.mjs` が `eiken-bank.json` / `gym-words.json` と突き合わせて、
もんだいの文が辞書に混ざっていないか見ている。

- **島の名前は `rpg-data.js` の HUBS が定義元**で、`en`（Eiken 5 Island）・
  `name`（英検5級の島）・`yomi`（えいけん5きゅうのしま）の3つを持つ。**辞書には入れない**
  — `rpg.js` は `<b class=en>${r.en}</b><i class=ja>${r.name}</i>` を書くので CSS が選ぶ。
  **id（`willow` など）は絶対に変えない** — セーブとサーバーの判定がこの文字列で書かれている。
- ガイド（`guide.json`）も章とページに `en` を持つ。
- **3Dの名札（sprite）は HTML ではない**ので、CSS も `data-t` も効かない。
  **3つめの仕組みがある**：`island-kit.js` の `sprite()` に文字列のかわりに
  **`{en, ja}` を渡す**と、いまの言語のほうを canvas に焼き、`onLangChange` で
  **焼き直す**（`s.userData.repaint`）。詳しくは下の「島の看板」。
- **通したところ**：`index.html` / `bilingual.js` の2行ぜんぶ / `eiken.js`（英検の4技能）/
  `lobby.js`（クラスに入る枠）/ `avatars.js`（キャラえらび）/ `game.js`（はじまりの島）/
  `net-client.js`（つながり・先生の合図）/ `rpg.js`（しまの ちず・ずかん・であい・`#area`）/
  **島の看板ぜんぶ**（11島）/ **えいご スイカゲーム**。
- ~~まだ日本語のまま~~ → **2026-10 から、画面ぜんぶを下の「4つめの仕組み」が訳している。**

### 4つめの仕組み：画面ぜんぶを訳す層（`i18n-dom.js`／2026-10 追加）

教室から「英語に切り替えたら、**画面に映るものは本当に全部英語に**」と言われた
（クエスト・RPGのタブ・リーグの画面に日本語が残っていた）。1,800か所の文に `t()` を
足して回るかわりに、**画面に出た文字そのものを訳す**層を1枚かぶせた。

- **`startDomTranslation()`**（`game.js` が辞書を読んだあと1回呼ぶ）が MutationObserver で
  document を見て、**日本語を含む文字（と `placeholder` `title` `aria-label` `alt`）**を
  `translate()` で英語に置き替える。もとの日本語は WeakMap に取っておき、**日本語に戻すと
  書き戻す**。自分の書き替えで自分が起きないよう `takeRecords()` で捨てている。
- **`translate()`（`i18n.js`）の引きかた**。上から順に試して、最初に当たったもの：
  1. 辞書そのまま（`"やめる": "Quit"`）。
  2. **型**：鍵に `{0}` を書いた行（`"{0} に到着しました！": "You arrived at {0}!"`）。
     穴に入った日本語も辞書で訳す。**決まった文字が3文字以下の型は、穴の日本語が訳せないと
     使わない**（「オオ{0}」が「オオカミ」を「Great カミ」にしない／「{0}問」が「質問」に
     当たらない）。長い型の穴は**子どもの名前**のことがあるので、訳せなくても通す。
  3. 改行と字下げの入った文は、空白を1つにして引き直す。
  4. 頭の絵文字・記号（`☕ であいのカフェ`）は残して、あとを訳す。
  5. 話す人「話したこと」（`リオ「…」`）→ `Rio: “…”`。
  6. **` · ` でつないだ文**（`No.001 · まだ`）は区切りごとに訳す。訳せたところだけ英語。
  7. **2文以上の段落**は1文ずつ訳す。**全部訳せたときだけ**英語にする。
- **「・」（中黒）は日本語に数えない。** `Grade 5・4` は英語の文。
- **canvas に描く文字**（3Dの看板・ミニマップの場所名）は HTML ではないので、
  `canvas-say.js` の `say(text)` で訳してから描き、`live(paint)` で**言語が変わったら描き直す**。
  看板を描く関数を足すときは、この2つを通すこと。
- **サーバーが2つの言語で送ってくるもの**（マイページのカード名・5技能・月）は辞書を
  引かずに `<span class="ja">…</span><span class="en">…</span>` で両方書く（`dashboard.js` の `bi()`）。

### **学習の中身は、この層でも訳さない**（`LEARNING`）

英検の問題・4択・クイズ・ジム・つりの意味・会話の訳・ゲートのことばは**日本語であることが
問題そのもの**。`i18n-dom.js` の **`LEARNING`（33か所のセレクター）** と
**`translate="no"`** の中には触らない。

- **学習の画面を足したら、その入れ物を `LEARNING` に足すか `translate="no"` を付けること。**
  付け忘れると、英語モードで答えが画面に出る。
- 地の文の中に学習の語がまざる行（`Bicycle · ride（のる）`・`apple = りんご`）は、
  学習の部分だけを `<span translate="no">` で包む（`ride.js` / `rpg.js` / `adventure.js`）。
- `tests/regression.mjs` が、**学習の中身（`learning-strings.mjs` が英検・クイズ・ジム・面接・
  つり・おばけ・ゲート・定型文から集める）が辞書で訳せてしまわないか**を数える。
  画面の言葉としても使う語（「先生」「雨」「ペンギン」など21語）だけは名指しで許してある
  （`BOTH`）。新しくぶつかったら、辞書から外すか・`LEARNING` に足すか・`BOTH` に理由つきで
  足すかを**人が決める**。`LEARNING` の名前が画面のどこにも無ければ、それも落ちる。

### 検査：英語モードで全画面を開いて、日本語を数える

`server/test/e2e/browser-english.mjs`（`npm run test:english`）。英語モードで
アバター・ロビー・はじまりの島・**RPGの全タブ・つりの全タブ・ガイドの全ページ**・
レイアウト検査と同じ22画面を開き、**見えている文字に日本語が残っていないか**を数える
（`LEARNING` と `translate="no"` の中は数えない）。最後に「あ」で日本語に戻り、
もう一度押すと英語に戻るかも見る。`REPORT=path` で残った文字を JSON に書き出す。
**1つでも残れば落ちる。** 文を足したら `lang.json` に訳を足すこと。

### 島の看板は `{en, ja}` を渡して 焼き直す（2026-09 追加）

島に立っている木の札（島の名前・お店の名前・住人の名前）は **canvas に描いた絵**を
板に貼ったもの。**文字ではないので、CSS で切り替わらない。**

- **`sprite(text, …)` の `text` に `{en, ja}` を渡す**と、そのときの言語のほうを描き、
  **`onLangChange` で自分を描き直す**。ふつうの文字列を渡したときは今までどおり
  （切り替えても変わらない）ので、**看板を足すときは必ず両方書くこと。**
- **札の幅は 長いほうの言語で決める**（`house()` の `longest`）。いまの言語で決めると、
  「あ」を押した瞬間に看板の板だけ伸び縮みして、島がガタつく。
- **名前の定義元は島のデータ**（`rpg-data.js` の HUBS、各 `*.json` の `spots` / 住人）で、
  **`lang.json` には入れない**。もんだい文と同じで、島の名前は「訳」ではなく**別の名前**。
- 焼き直せるかは `island.repaintLabels()` で外からも呼べる。
  **レース中は看板を消している**（`setLabels(false)`）ので、言語を変えても
  `label.visible` を書き戻さないこと。
- **毎フレーム描き直す canvas には、この仕掛けは要らない**：ミニマップ
  （`island-kit.js` の `drawMap()`）は その場で `isJa()` を見るだけでよい。
- **ミニマップは 全島 2D の 地図の 絵**（2026-10）。`island-kit.js` の `drawMap()` が、`ground()` が 記録した マス（`mapTiles`）・
  `path()` の 線（`mapPaths`）・建物の 当たり判定（`obstacles` の 大きい物）・船着き場・つり島の `water` を **1 回だけ 下絵（`mapBase`）に** 描き、
  毎フレームは 場所の 色の まる＋絵（`KIND_ICON` / `KIND_COLOR`、無ければ spot の `icon` / `color`）と オレンジの 自分と 島の名前だけ 描く。
  **spot の kind を 足したら `KIND_ICON` にも 1 行**（無いと 💬）。縮尺は 島の 大きさ（`HX`/`HZ`）から 決まる。
  U-Speak島（`game.js` の `minimap()`）も 同じ まると 名前。メインの島だけは `main-world.js` の 自前の `drawMap`。
  **ワールドマップはもう canvas ではない**（下の「しまの ちず」）。
- **1秒に数コマしか描かない端末では、切り替えてもミニマップが数秒古いまま出る。**
  壊れているのではなく、次のフレームを待っている（スクリーンショットを撮るときは
  待つこと。実際に「直っていない」と勘違いした）。

### 検査

- `tests/regression.mjs`：印と辞書の突き合わせ、訳し忘れ、もんだい文の混入、
  **島の看板に日本語を そのまま渡していないか**（`{en, ja}` で渡すこと）。
- `server/test/e2e/browser-lang.mjs`：実ブラウザ。**最初が英語**か、「あ」で日本語に
  なるか、**空のボタンが出ないか**（いちばん怖い壊れかた）、開き直しても残るか。
- `server/test/e2e/browser-signs.mjs`（`npm run test:signs`）：HTML の外がわ2つ。
  **島の看板に焼かれた文字そのもの**（`island.signs`）と、**えいご スイカゲーム**
  （英語で出るか・遊んでも戻らないか・中のボタンと島の「あ」の両方で切り替わるか）。

### 日本語は ひらがな寄りに（小学1年生が ひとりで読める文に）

**この教材を読むのは小学1年生**だと想定する。漢字は「小1で習うもの」＋固有名詞
（英検・先生・島・人の名前）までにして、それ以外は ひらがな／カタカナで書く。

- **やめた言いかたの例**：俯瞰→うえから 見る／購入する→かう／試着する→きて みる／
  装備→もちもの／未発見→まだ／再接続中→つなぎ なおしています／満員→いっぱい／
  復習完了→おさらい ずみ／進捗→すすみぐあい／音声→おと。
- **分かち書きする。** 「さかなを うる みせ」のように、文節で空けると小1が読める。
  詰めて書くと ひらがなだけの壁になって、かえって読めない。
- 新しい文言を足すときも同じ。**漢字を足したくなったら、まず言いかえを探すこと。**

## さかなは 写真になった（2026-09 更新）

**100匹の見た目は `assets/fish/<id>.jpg` の写真**（渡された1024pxの絵を320pxに落としたもの）。
もとは three.js で 箱を組み立てて描いていたが、本物の絵のほうが子どもには はるかに分かる。

- **`fish-species.js` が唯一の定義元。** 133しゅるい（池23・川19・海84・どこでも7）。
  **枠は100なので、海は40枠に入りきらない分が余る。** 表から消さずに置いてあるのは、
  釣り場の割りあてを変えたくなったときに1行直すだけで済むから。
  `id` / `ja` / `en` / `zone` / `tier` だけを持ち、値段も判定も持たない。
  **JSON ではなく JS**なのは、`server/src/game/` の judge・economy・fish-moves が
  `fishing-data.js` を**同期で** import するから（途中に fetch を挟めない）。
- **枠は100のまま、id も `fish-1`〜`fish-100` のまま。** 子どものセーブ（図鑑・持ち物）が
  このidで書かれているので、ここを変えると続きが消える。**ことばも100語のまま。**
- **名前は「大きさの言いかた＋しゅるい」**（メダカ／オオメダカ／ヒメメダカ）。
  **川と海はぜんぶ ちがう写真。池だけ枠40にしゅるい30**なので、10匹は同じ写真が2回出る。8つの言いかた
  （オオ・ヒメ・ニジイロ・コガネ・ギンイロ・ホシゾラ・マボロシ）で分けている。
  **名前は世界でひとつ**（図鑑に同じ名前が2行あると、どちらを釣ったか分からない）。
- **「もの」（ながぐつ・あきカン・タイヤ・ボトルメール・たからばこ・かぎ・かい・
  きんかい・にんぎょの うろこ）は `item: true`。1つの釣り場で1回しか出さない**
  （印がないと、しゅるいの少ない池では たからばこ ばかり かかる）。
  `zone: 'any'` は どの釣り場でも出る。
- 写真を足すときは `assets/fish/` に置いて `fish-species.js` に1行。
  `tests/regression.mjs` が「100匹ぜんぶに写真があるか」「名前が重なっていないか」
  「釣り場ごとに8しゅるい以上あるか」を検査する。
- **水から とび出す 演出（splash）だけは、まだ `fishing-models.js` の3Dモデル。**
  あそこは板の絵より立体のほうが気持ちいいので残してある。

## 読み上げは 日本語と英語で分ける（2026-09 追加）

**前は どんな文でも `lang = 'en-US'` で読んでいた。** 英語の学習ゲームなので英語だけ読む
つもりだったが、実際は日本語も読んでいる（ことばの学校のもんだい文、英検の日本語、訳）。
英語の声に日本語を渡すと**かなを一文字ずつ英語読みする**ので、教室から「ロボットみたい」
「『？』まで読み上げる」と言われた。

- **入口は `speech.js` の1か所。** `game.js` が `createSpeech()` で作り、そこから
  fishing / quiz / eiken / net-client へ渡っている。`character.js`（ウーピー）も
  同じ `forSpeech()` を通す。**ここを通さずに `SpeechSynthesisUtterance` を作らないこと。**
- **言語は文字で決める。** ひらがな・カタカナ・漢字が1文字でもあれば `ja-JP`。
  「みかん は orange です」のような混ざった文は日本語あつかい（そのほうが自然に読む）。
- **記号は声に出る。** 日本語からは `？ ！ 「」 （） … → ✦` などを落とす。
  **英語からは落とさない** — `?` と `,` が抑揚を作るので、消すと棒読みになる。
  **日本語の読点（、。）は残す**（あそこで息を継ぐので、むしろ自然）。
- **速さを変える。** 英語 0.84（聞き取って まねるための音なので遅く）、日本語 1.0
  （ただの説明なので、遅いと間延びして機械っぽい）。
- **声は名前ではなく lang で拾う**（端末で名前が違う）。知っている良い声
  （iPad の Kyoko、Chrome の Google 日本語）があれば優先。`getVoices()` は
  1回目に空で返ることがあるので、取れたときだけ覚えて毎回聞き直す。
- 検査は `tests/regression.mjs`（文の作りかた・7件）と
  `server/test/e2e/browser-speech.mjs`（実ブラウザ9項目・lang と 声と 速さ）。
  **このコンテナには音声エンジンが無い**ので、e2e は `speechSynthesis` を置き替えて
  「何が渡ったか」を見ている。**実際に聞くのは iPad でやること。**

## 夜の明かり（2026-10 追加）

教室から「夜が暗すぎる」と言われたので、`atmosphere.js` に **自分のアバターについてくる暖かい点光源**
（`lamp`・`PointLight`）を置いた。`game.js` が `atmosphere.state.follow = player` を入れ、`update()` が毎フレーム
位置を合わせる。**強さは `n * LAMP`（夜だけ）** なので昼の絵は変わらない。一人称のときは少し弱める。
夜の底（半球光 .58→.85、太陽 .7→1.0、露出 1.03→1.08）も上げた。**夜の雰囲気を消さないこと** — おばけと
提灯の見せ場なので、さらに明るくしたくなったら、まずこの光源の `distance`/`LAMP` から。

## ホーム画面に 追加（PWA／2026-10）

アプリは 出さず、**ホーム画面に アイコンを 置ける Web アプリ**に した（`manifest.webmanifest` / `assets/app/` の アイコン / `index.html` の head）。
- **start_url は サーバーが 決める**（`server/src/index.js` の `/manifest.webmanifest`）。`index.html` の 小さな script が `?class=` を つけて
  manifest を 取り、サーバーが `start_url: /?class=…` を 入れて かえす。教室の URL から 追加した アイコンは そのクラスで 開く。
  Chrome は start_url が ないと 追加させないので、消さないこと。
- **iPhone で ブラウザの まま あそんでいる 子に 1 回だけ「ホーム画面に 追加すると 全画面」**（`install-hint.js`・見た目は `mobile.css` の 13）。島で 10 秒 なにも 開いていない ときに 出し、`uspeak-ios-a2hs-v1` に 覚えて 二度と 出さない。iPad・Android・パソコン・アイコンから ひらいた ときは 出さない。保護者・教室むけの 説明は `docs/install/iPhoneで全画面にする案内.pdf`。
- **Service Worker は 置いていない。** ファイル名に 版が 入っていないので、キャッシュを 持つと 直した ものが 教室に 出なくなる（上の no-cache と 同じ 理由）。
- iPad・iPhone の ホーム画面の アイコンは Safari と 保存場所が 別。はじめて 開くと 名前と あいことばを 1 回 入れなおす（記録は サーバーに ある）。
- 教室に 配る 手順は `docs/install/ホーム画面に追加_教室向けガイド.pdf`（元は 同じ 名前の html。直したら PDF も 作りなおす）。
- 検査は `server/test/static.test.mjs` の「ホーム画面に 追加できる」。

## 個人情報の 守り（2026-10）

公開の ポリシーは `dist/privacy.html`（ロビーの 下の 「プライバシーポリシー」と LINE の 同意画面から）。運用は `docs/PRIVACY.md`。
- **`?server=` は localhost と LAN の IP でしか 効かない**（`net-config.js`）。本番の URL に `?server=wss://よそ` を つけた リンクで 名前・クラス・先生の 鍵が よそへ 行かないため。
- **先生の 鍵は localStorage に 書かない・読まない**（`lobby.js`）。共用の iPad で 次の 子に 見えない ように。sessionStorage（タブを 閉じると 消える）には 再読みこみの ために 残る。
- サーバー側（ログの 札・AI へ わたす 前の そうじ・1 人ぶんの 削除・保持期間・安全の 頭・総当たりの 守り）は `docs/PRIVACY.md` と `server/src/privacy.js`。

## 保存互換性

localStorageのキー:
- uspeak-willow-v1
- uspeak-avatar-v1
- uspeak-fishing-v1
- uspeak-rpg-v1
- uspeak-adventure-v1

フィールド追加時は初期値とsanitizeの両方を更新すること。
サーバーDB・アカウント同期は未実装。単独ブラウザーで遊ぶゲームです。

## 屋内

park-interior.jsが独立したTHREE.Sceneへプレイヤーと相棒を移します。
state.insideParkは全建物の屋内状態を表します。
rpg.interiorSceneをatmosphere.render()へ渡し、屋外と屋内を切り替えます。
地域変更・飛行機・乗り物への移動は先に屋内から退出すること。
buildings.jsが入口と帰還位置の定義元です。セーブに屋内の一時座標を混ぜないこと。

## 宝箱・鍵

12エリア×3個=36個。鍵は非消耗、対応する種類の箱を開けます。上位鍵による下位鍵代用はありません。
- bronze: canyonの物語クリア後、北端祭壇で取得。
- silver: ruinsの物語・同地域リーダーを攻略後、北端祭壇で取得。
- celestial: skyの物語・同地域リーダー攻略、紋章6個以上で北端祭壇から取得。

claimTreasure / claimTreasureKeyが同じadventure保存領域へ取得状態と報酬を同時保存。
失敗時は巻き戻し。treasureOpened / treasureKeysはRPGバックアップにも含みます。
報酬は星のかけらと手帳の秘宝。釣りコインとは別通貨です。
UI側でもnearby()で現地にいることを再確認します。

## スマホ・iPad（レスポンシブ）

`mobile.css` が最後に読み込まれ、タッチ端末（`pointer: coarse`）だけを上書きする。
デスクトップは触っていない。検査は `server/test/e2e/browser-layout.mjs`
（`npm run test:layout`）で、**5サイズ×16画面**を実際に開いて測る。

- **測っているのは4つ**：画面からはみ出していないか／横スクロールが出ていないか／
  ボタンが指で押せる大きさ（28px以上、`min-height: 34px` を敷いてある）か／
  文字が11px未満になっていないか。**目で見て「だいたい大丈夫」ではなく数字で落とす。**
- **文字の下限は11px**（`mobile.css` の「8. A floor under the type」）。
  7〜10pxの指定を全部拾って、タッチ端末でだけ11pxに持ち上げている。
  **新しく11px未満を書くと `tests/regression.mjs` が落ちる**ので、その時はこの一覧に足すこと。
- **押せる大きさの下限は34px**（同「9. A floor under the tap targets」）。
  ラベルの大きさは変えず、高さだけ上げている。
- **チャットは入力欄を下に固定**（フレーズが中でスクロールする）。`#net-chat:not([hidden])`
  と書いてあるのは、`display` を id だけに書くと `hidden` 属性に勝ってしまうから。
- 画面を1つ足したら **`browser-layout.mjs` の `SCREENS` に足す**こと。開き方（`go`）と
  測る要素（`sel`）を書くだけで、5サイズぶん検査される。
- **右のバーの4つの飾りボタンは、役割が違う。** 見た目が同じなので一度まとめて
  消してしまい、教室から「時計と軽量化が消えた」と言われた。捨てていいのは下2つだけ：

  | ボタン | 役割 | 狭い画面で |
  |---|---|---|
  | `#time-toggle`（☀ ひるま 4:12） | **世界の時計**。いま何時で、あと何秒で夜かを出す唯一の場所 | **残す** |
  | `#quality-toggle`（描画：高品質） | **重い端末を軽くする唯一の手**。古い iPad では命綱 | **残す** |
  | `#view-toggle`（⌖ 俯瞰） | カメラの角度。無くても遊べる | 700px以下で消す |
  | `#cinema-toggle`（景色に集中） | まわりの まどを消す。無くても遊べる | 700px以下で消す |

  **横向きの携帯（`max-height: 560px`）だけは4つとも消す。** そこではバーの高さが
  178px しかなく、飾りを2つ残すと 46px を食って **いちばん下の 📹 がはみ出す**
  （実測 288 > 252）。クラスを探している子が 📹 を見つけられないほうが、時計が
  無いより悪い。`browser-layout.mjs` の `has scrolled off the rail` がここを見ている。

- **右のバーは「スクロールできる」＝「見えなくていい」ではない。** バーに入るボタンは
  スクロールせずに全部見えていること（`browser-layout.mjs` の
  `has scrolled off the rail`）。入りきらなくなったら**古い飾りから捨てる**：
  ミニマップ（高さ780px以下）→ カメラの角度（700px以下）→ 横向きでは
  ラベルと数字を1行に並べる。**ボタンそのものは減らさない**（✈ 🎣 📖 📹）。
- **横向きのタブレット（1180×820）だけは別扱い**：カメラの角度を消し、バーの下を
  190px まで伸ばして**ミニマップを残す**。下の 250px は「先生のドックが2段に折り返す
  ぶん」で、1180px 幅では折り返さない。地図が残るのはタブレットだけ。

### スマホと iPad の 横もち（高さ 1100px 以下／2026-10）

`mobile.css` の「12」「14」と `phone-menu.js`。844x390 で 数えたら 島の 上に ボタンが 28 こ のり、右の バーの 文字が 切れていたので 減らした。はじめは スマホ（500px 以下）だけ だったが、**iPad の 横もちにも 同じ 収納式を 当てる**ことに なり、条件を `(pointer: coarse) and (orientation: landscape) and (max-height: 1100px)` に 広げた。iPad だけの 大きさ（字 13〜15px・まるい ボタン 54px・ミニマップは 出す）は「16」。**パソコンは pointer: fine で 入らない。iPad の 縦もちも 入らない。**
- 上の バーは コイン・LV・**⋯**。きせかえ・アバター・おと・？・A・⏏ は ⋯ を 押すと 2 だん目に 出る（`body[data-more]`）。
- 右は ふだん **☰ 1 つ**（`#rail-toggle`・`body[data-rail]`、mobile.css の 14）。押すと ☰ の 左に 絵だけの まるい ボタンが 横 1 列（🏠 ✈ 🎣 📖 📹 🏆、`::before` の 絵文字）。どれかを 押すか ほかを さわると しまう。下の つうしんは 人数の 札を 出さない。ミニマップ・時計・Roblox の きろく は 出さない。
- ホットバーは たんごちょう・🌍 せかいを えらぶ（`#mapbtn`＝`rpg.openMap()`・2026-11 に もどした：✈ が ☰ の 中で 見つからない）・じぶんの め の 3 つ。🎒 おなかは ロゴの となり（めもりだけ）。
- **全画面は `fullscreen.js`**（2026-11）：どの 端末でも、さわった ときに（`pointerup`・`touchend`・`keydown`。**`pointerdown` は Chrome が「ユーザーの 操作では ない」と ことわる**）全画面を たのむ。ぬけても つぎに さわると もどる。全画面で ない あいだは「⛶ ぜんがめんに する」ボタン（島の 上の まんなか `#fs-button`・すがた えらびの 左 `#avatar-fs`・ロビーの「クラスに はいる」の 下 `#net-fs`）。iPhone は ページの 全画面が ない（Apple が みとめていない）ので、ボタンは「ホーム画面に 追加」の 案内（`install-hint.js` の `showInstallHint`）。ボタンは **いつも 全画面**（2026-11）。Chrome・Edge が インストールの 画面（`beforeinstallprompt`）を 出せる ときは、そのあと 小さな カード「デスクトップ（ホーム画面）に アイコンを つくる？」（`#install-offer`・popover で いちばん 上・modal の dialog が ひらいて いれば その 中に 入れる＝inert に ならない）。［アイコンを つくる］の タップで `prompt()`（1 回の タップで 全画面と prompt の 両方は できない）。［いまは しない］は 30 日（`uspeak-install-later-v1`）。Chrome は ページを しばらく（30 秒ほど）つかう まで beforeinstallprompt を 出さないので、まだ 来て いない ときは ボタンを「じゅんび ちゅう…」で 待たせ、来たら［アイコンを つくる］に もどす（`ready`）。45 秒 待っても 来ない とき（もう インストール ずみ・前に とじた・Firefox など）だけ［やりかたを 見る］＝`showInstallHint(kind)`（パソコンは デスクトップの 文・Edge は「…」→「アプリ」の 道）。案内も popover＋modal の dialog の 中に 出す。全画面の たのみは pointerup・touchend・click・keydown（iPad の Safari の ため click も）。
- **同じ むきに 1.5 びょう すすむと はしる**（2026-11 に 3 → 1.5）（`game.js` の `RUN_AFTER`・`autoRun`。むきは 8 ほうこうに まるめる。Shift・スティックを 外まで も そのまま）。ホーム画面の アイコンから ひらいた とき（standalone）と 自動の 検査（`navigator.webdriver`・`?fs=1` で 出す）は 何も 出さない。
- 右の 列に ボタンを 足したら、ここにも `order` と 絵文字を 1 行 足す（足さないと 空の まるが 出る）。#hunger は この 列の 規則から 外してある。
- **タスクは 消さない。左上に 1 行の 札**（`.quest-panel.tasks-folded` ＋ `#task-card.folded`）。`tasks.js` は この 画面幅では **保存を 読まず いつも たたんで はじめ**（PC で ひらいた 覚えが 効くと 画面の 半分が カードに なった）、札を 押すと 220px の 小さい カード（いまの 1 つ・つぎの 一覧と 章の ごほうびは 出さない）。カードの そとを さわると たたむ。先生（`body.cm-teacher`）は 🎓 の まるい ボタンの 下に 同じ 札（tasks.css / class-mode.css の 「先生は 隠す」を `!important` で 上書き）。
- **光の 道の 行き先の 光は ☰ にも のる**（`task-guide.js` の `.task-glow` は `#flight-button, #mapbtn, #rail-toggle`）。✈ が しまわれている あいだ、子は ☰ が 光るのを 見て ひらく。
- **走るのは スティックを 外まで 押す**（`game.js`：`stick.state.mag >= .97`＝Shift と 同じ）。スマホには Shift が ないので、これが ないと 走れない。
- **大きな 画面（あそびかたガイド・RPG の ノート）は 画面いっぱい**（`#guide-dialog` / `#rpg-dialog`。ノッチの ぶんは `safe-area-inset-left/right` の padding）。頭 47px・タブ 38px・字は 12〜15px。`#guide-stage` の `flex: 1` は Safari が 本文を 0px に つぶしたので `flex: 1 1 auto`（guide.css）。
- **すがた えらび・たんごちょう も 画面いっぱい**（左の 3D は 30%・8 人は 4 列・ボタンは 下の 帯／頭と 道具を 1 だんずつ・カードは 140px）。**ロビーは 幅 640px で なまえ と クラスコード を となりどうし**、ボタン 2 つは 横ならび。
- `#rail-toggle` は `.right-rail` の 中に ある（`phone-menu.js` が append）。スマホでは `position: fixed` で 右上、iPad では 列の 中に ならぶ（下）。

### スマホは いつも 横（「17」／2026-10）
- **iPhone は ページの 向きを 固定 できない**（Apple が みとめていない）。縦に もっている 間は `html.sideways-only` で 画面を ぜんぶ かくし、
  まわる 📱 と「スマホを よこに してね／まわらない ときは がめんの むきの ロックを オフに」だけ 出す。横に すれば その場で もどる。
- Android は 全画面に した ときと ホーム画面の アイコンの ときに `screen.orientation.lock('landscape')`（`phone-menu.js`）。manifest は `"orientation": "landscape"`。
- クラスは `phone-menu.js` が スマホ（短い 辺 500px 以下・指）の ときだけ つける。**`navigator.webdriver`（Playwright）と `?portrait=1` では つけない**（縦の レイアウト検査が ある）。
- 画面を 90° まわして 見せる 方法は とらない：top layer の ダイアログは まわらず、スティック・指で 見回す・スイカの 落とす 位置が 90° ずれる。

### iPad の 横もち（「16」／2026-10）

12・14 が そのまま 効く（右は ☰ 1 つ、上は ⋯、タスクは 札、ガイド・RPG・すがた・たんごちょうは 画面いっぱい、ロビーは 2 列）。
「16」（`(min-height: 501px) and (max-height: 1100px)`）は 大きさだけ：まるい ボタン 54px・ダイアログの 字 13〜15px・カード 170px・ロビー 720px。
**ミニマップだけは 出す**（`.map-panel` を 右上の ☰ の 下に 固定。☰ を ひらいている あいだは 消す）。
前の「15」（iPad だけ 縦の 引き出し）は この ときに なくした。

### 横向き（この教材が実際に持たれる向き）

**iPad も iPhone も横で使う。** 高さが 390px しかない前提で作ること。

- **`<header>` を ダイアログの中に置くときは `position: static` を書く。**
  `style.css` の `header{position:fixed}` が**ページの全 `<header>` に効く**ので、
  書かないとパネルの外（画面の左上）に飛ぶ。横向きだと題名と進み具合バーが丸ごと消える。
  釣りと図鑑は昔これを踏んで `!important` で直してある（`.fish-header` / `.rpg-header`）。
  英会話島と面接も同じ穴に落ちていたので直した。
- **チャットと先生コンソールは、横向きでは右側の縦長パネルになる**
  （`max-height: 560px` のとき）。上に積むと 160px しか残らず、フレーズが2行しか見えない。
- **面接の画面は横向きだと ウーピーを 34% に細くする**（`interview.css` の
  `@media (max-height: 560px)`）。質問・ボタン・入力欄が1画面に収まることを優先する。
- **`display: flex` の縦並びでは、頭と足に `flex: none` を書く。** 書かないと
  高さが足りないときに頭が潰れて消える（面接とチャットで実際に消えた）。
- **`scrollIntoView()` を入力欄のフォーカスで呼ばないこと。** 祖先を全部スクロールするので、
  ダイアログ自身がスクロールして頭が画面外に出る。自分の列（`.iv-side` / `#net-chat-log`）を
  `scrollTop` で動かす。

### 左下は十字キーではなくスティック（`stick.js`／2026-09 更新）

**タッチ端末の移動は、まるいスティックを指で倒す**（Roblox のモバイルと同じ形）。
以前は ↑←↓→ の4つのボタンだった。

- **十字キーをやめた理由は2つ。** ①**斜めに歩けない**（2つ同時押しは子どもの指では無理で、
  島の道は斜めに走っている）。②**速さが押すか押さないかの2段階しかない**（そっと近づけない）。
- **返すのは向きと「倒した量」だけで、キーには変換しない**（`{x, z, mag}`）。
  8方向のキーに丸めると、せっかくの倒した量が捨てられて十字キーに戻ってしまう。
  `game.js` は `dx`/`dz` にそのまま入れ、`mag` を `pace` に掛ける＝**analog に歩く**。
- **画面の座標そのままで返す**（右が +x、**下が +z**）。`game.js` の `dz` は奥がマイナスなので、
  上に倒す＝ `dy` がマイナス＝奥、で向きが合う。ここをひっくり返すと前後が逆になる。
- **遊び（デッドゾーン）は 0.14**、そこから 0→1 に引き伸ばす。引き伸ばさないと、
  歩き始めがいきなり時速14%になる。
- **「◯◯と話す」（`.near`）は狭い縦画面では右下に寄せる**（`mobile.css` の 4c）。
  実測（390x844）で、真ん中にあると左端 x127 がスティックの右端 x146 とぶつかる。
  上げると右のレール（y84..594）に刺さるので、**空いている帯（y594..756）の右側**へ。
  **十字キーの頃から重なっていた**（あちらは 156px 幅でもっと重なる）ので、いま直した。
- 中身は `.mobile-pad > .stick > i`。**入れ物の class 名（`.mobile-pad`）は変えていない**：
  `arcade.css` / `kart.css` / `race.css` / `themepark.js` の「全画面の間は消す」規則と、
  `browser-layout.mjs` の PROBES が全部この名前で書いてある。
- **ダイアログが開いたら `release()` する**（`game.js`）。指を置いたまま画面が変わることが
  あるので、つまみを真ん中に戻さないと、閉じた瞬間に歩き出す。
- キーボード（WASD・矢印）はそのまま。パソコンでは出ない（`pointer: coarse` でだけ出る）。

### 指で押している間、文字を選ばせない（iPad）

**タッチ端末では画面の文字は選べない**（`mobile.css` の「10. No text selection on the
controls」）。iPadOS は文字を含むものの長押しを「この語を調べる」と読むので、
↓ を押して歩いているだけで **コピー / Google で検索 / 調べる / 共有…** が
ゲームの上に出て、矢印に選択のつまみが付いてしまう。

- 例外は **`input` / `textarea` / `[contenteditable]` だけ**（書いた英文を直せなくなるため）。
  新しく文字を書き込む枠を足すときは、この3つのどれかで作るか、この一覧に足すこと。
- 移動パッド（`[data-key]`）は **CSS に加えて `oncontextmenu` も止める**（`game.js`）。
  CSS だけでは端末によってメニューが出る。
- **変えるのはタッチ端末だけ。** パソコンではフレーズを選んでコピーするのは普通の操作なので
  触らない。
- 検査は `browser-layout.mjs` の `probe()`（`select: {body, pad, input}`）。
  body かパッドが選べる状態に戻ると、全画面で落ちる。

## 検証と留意点

node tests/regression.mjs はNode.js 24で確認済み。DOM/rendererを模擬し、実際のThree.jsモデルを使用。
**`<dialog>` に `display` を直接書かないこと**（`#id[open]` の側に書く）。閉じたダイアログが
画面の隅に居座ってタップを吸う。おつかい島と英会話島で2回やっているので、
`tests/regression.mjs` が全 CSS を読んで検査するようにした。
GPU・実ブラウザー描画・タッチ操作の実機QAは未実施です。今後の変更時はこれらも確認してください。
長い行にまとまったコードが多いため、整形する場合は機能変更と差分を分けると確認しやすくなります。
元の公開コミットとファイルハッシュはSOURCE_MANIFEST.json参照。
実プレイヤーのセーブや認証トークンは同梱していません。

## マルチプレイ層（2026-09 追加）

`net-config.js`（調整定数）/ `net-hooks.js`（ゲーム→通信のイベント）/ `net-client.js`（Colyseus 接続・再接続・20Hz送信）/
`remote-players.js`（他プレイヤー描画・100ms補間）/ `chat.js` / `teacher.js` / `lobby.js` / `net.css` / `phrases.json`。
サーバーは `../server/`。ルート README を参照。

- 既存モジュールは `hooks.emit('answer', {q, c})`（game.js / fishing.js / adventure.js）と
  `hooks.emit('economy', …)`（fishing-state.js）で通信層に通知するだけで、通信層に依存しない。
- 正誤・コイン・捕獲・購入はオンライン時サーバーが確定し、`fishing.store.reconcile()` で上書きされる。
- `rpg.activate(id, placePlayer, force)` の `force` は講師の集合で未解放地域へ移動するために追加。
- `globalThis.uspeak` は実機デバッグ用の参照（`net`, `player`, `rpg`, `fishing`）。
- 判定データ（`*-data.js`, `lesson-data.js`, `adventure-quiz.js`, `phrases.json`）はサーバーも import する。
  これらのファイルの形を変えるときは `server/test` を実行すること。

## 異次元 UI（`cosmic-panels.css`／2026-11）
- **色は U-Speak の ブランド**（2026-11 に むらさき・水色・ピンクから かえた）：地＝深緑（#0c241c〜#1b3a2f）、光＝オレンジ（#ffb066・#e27a2d）、さし色＝ミント（#8ff0c8）、字＝クリーム（#fff4d6）。星・光の わく・ネオンの 帯 という 形は そのまま。おつかい・たいせん（3D の 舞台も）・内装（`cosmic-kit.js`）・すがた えらび・動画の わく（`docs/make-tour.py`）・サインイン動画の カード（`capture-setup.mjs`）が 同じ 色。足す ときも この 色で（むらさきに もどさない）。
- おつかいクエスト（`#mission-dialog`）と えいごアリーナ（`#battle-dialog`）を 宇宙の 見た目に（紺〜むらさきの 地・星・ネオンの 小見出し・光る カード・グラデーションの HP）。**色と 形だけの 上書き**で、`mission.css`・`battle.css`・JS は そのまま（もとに もどすなら index.html の 1 行を 外す）。
- 重く しない：backdrop-filter・filter・画面いっぱいの 動く もの は 使わない。動くのは 小さな 光だけ（`prefers-reduced-motion` で 止まる）。字は 11px 以上。ほかの 画面に ひろげる ときは 同じ 変数（`--c-*`）で セレクターを 足す。
- **えいごアリーナは 3D の たいせんがめん**（`battle-stage.js`・`#battle-dialog.staged`）：宇宙に うかぶ ネオンの 舞台で、じぶんの なかま（ペット・なければ きつね）が 手前の ひだり、マスターウーピー（ふくろう＝`creatureModel`）が おくの みぎ。メッセージは 左下・わざは 右下・HP の 札は 上。
  島と 同じ renderer に べつの シーンを 描いて、ダイアログの 2D の canvas に うつす（WebGL を ふやさない）。ひらいて いる あいだ `game.js` は 島を 描かない（`net.battleStage.running`）。**見せるだけ**：ダメージ・勝ち負けは 部屋。battle.js の `act(events)` が とびこむ・ゆれる・かいふく・よける・たおれる を わたす。描けない 端末は いままでの カードの 画面。

- **内装は ぜんぶ 異次元**（2026-11）：共通の 部品は `cosmic-kit.js`（`SPACE_BG`・`cosmicColor()`・`addStars()`）。みんなの 部屋・お店＝`island-interior.js`、公園の ロビーと U-Speak島の 建物の 中＝`park-interior.js` の `material()`（`building-room.js` も ここを 通る）、じぶんの へや＝`room-world.js`、ひろば＝`plaza-world.js`。
  **へやと ひろばは 床・かべ・さくだけ**（子どもが 買った かぐ・置いた ブロックの 色は かえない）。はだの 色は `KEEP` で そのまま。光は ふやさない（emissive と 星の Points 1 つ）。bloom が あるので emissive は 0.5 まで。

- **サインインだけの セットアップ動画**（2026-11）：台本は `docs/setup-web-cuts.json`・`docs/setup-roblox-cuts.json`（`python3 docs/make-tour.py --script <台本>`）。写真は `server/test/e2e/capture-setup.mjs [cards|web|roblox]`（ネオンの わくと 番号を ページに かさねて 撮る。Roblox の ぶんは roblox.com と アプリストアへ 出られる 環境だけ・サインインは しない）。配る ファイルは `docs/Web版_サインインガイド.mp4`・`docs/Roblox版_サインインガイド.mp4`。

## おつかい島（2026-09 追加）

`errand-data.js`（missions.json の共有ローダー）/ `errand-island.js`（島の地形・お店・住人・
光の柱・当たり判定）/ `mission.js`（掲示板・トラッカー・会話）/ `mission.css`。

- `missions.json` の `island` が唯一の座標定義元。クライアントはここから島を建て、
  サーバーは同じ座標で「その場に立っているか」を判定する。片方だけ動かさないこと。
- おつかいは3段階（広場で受ける → お店で英語 → 広場にとどける）。
  コインが出るのは3段階目だけで、`mission:deliver` をサーバーが位置つきで確認してから。
- 島は `rpg-data.js` の HUBS に `errand` として登録。`rpg.errand` が島本体、
  `rpg.errandNearby()` が「いま立っている場所」、`rpg.onErrandIsland` が滞在判定。
- `<dialog>` に `display` を直接書かないこと。UA の `dialog:not([open]){display:none}` に勝ってしまい、
  閉じたダイアログが画面中央でタップを吸う（`#mission-dialog[open]` の側に書く）。
- 島に宝箱と U-Speak park の入口は置かない（`treasure-data.js` と `magic-data.js` で除外済み）。
- 装飾（岸の岩・道タイル・草花）は色ごとに `InstancedMesh` へまとめている。増やすときも `D()` を使うこと。

## 学習の島（2026-09 追加）

おつかい島 / ことばの学校島 / えいごアリーナ島。共通の作りは `island-kit.js`。

## ことばの学校島・えいごアリーナ島

`island-kit.js`（地形・桟橋・当たり判定・光の柱・ミニマップ＝全島共通）/
`school-island.js` + `school.json`（3つの小屋）/ `quiz.js` + `quiz.css`（出題画面）。

- **島を足すときは `island-kit.js` の `createIsland({scene, build})` を使うこと。** 建物と住人だけ書けばよい。
- 返ってきた island を**スプレッドしないこと**（`{...island}`）。`visible` `data` `spots` `target` は
  getter なので、スプレッドすると値が固定される。`Object.assign(island, {...})` で足す。
- **建物を置いたら道が通るか確認すること。** 各スポットは `path: {x,z}`（道の起点）を
  データに持ち、`school-island.js` はその線に石畳を敷く。`tests/regression.mjs` が同じ線を
  歩いて建物に当たらないか検査する。ジムの道が「ふつうの小屋」を貫通していたのを
  ブラウザで5分かけて見つけた経緯があるので、まず `node tests/regression.mjs` を回すこと。
- 学習用の島は `rpg-data.js` の `ACTIVITY_HUBS` に登録すること。宝箱と U-Speak park の入口が
  勝手に生えるのを防いでいる（`treasure-data.js` / `magic-data.js` が参照）。
- ジムは `gym.js`（画面）と `server/src/game/gym.js` + `gym-words.json`（110語・判定）。
  **はなすモードでクライアントが送るのは「マイクが聞き取った文字列」だけ**で、正解可否は送らない
  （Roblox 版はクライアントが正解を申告してサーバーが無検査で払っていた）。
- アリーナは `battle.js`（画面）と `server/src/game/battle.js` + `battle-bank.json`（249問）。
  **強いわざは英語のもんだいに正解しないと出ない**のが設計の核。ダメージも相手の行動も
  全部サーバーが決める。PvP（たいせん台）は未実装で「じゅんび中」と出る。
- 道場は `dojo.js` と `server/src/game/fish-moves.js`。魚→わざは**レア度×釣り場**の表で決まる
  （Roblox は日本語の魚名の部分一致だったが、Web版の魚名は架空なので一致しない）。
  保存されるのは魚のIDだけで、わざはそこから組み立て直す＝改ざんで強いわざは作れない。
- ペットは `pet.js` と `server/src/game/pets.js`。**おなか・ごきげんは「最後に見た時刻」からの
  経過で減らす**（ティックを回さない）ので、オフラインの時間もそのまま数える。
  世話は3か所に分かれている（巣＝たまご／ごはん処＝ごはん／ふれあい広場＝なでる）。
- ウォレットの `dex` は「これまでに釣った種類」で、`inventory`（いま持っている魚）とは別物。
  **売っても図鑑からは消さないこと。** 初ゲットで +10🪙（`DEX_BONUS`）。
- **単語クイズの問題バンクは `server/src/game/word-quiz.json` にあり、クライアントには来ない。**
  他の判定データ（`*-data.js`）と扱いが違うので注意。サーバーは問題文と4択だけを送り、
  正解は回答後にしか返さない。

## まちづくり島（2026-09 更新）

`town-island.js` + `town.json`（島）/ `town.js`（買い物とHUD）/ `room-world.js`（マイルーム＝かぐ）/
`plaza-world.js`（ひろば＝ブロック）。サーバーは `server/src/game/town.js`。

- **置き場所が2つある。** かぐはマイルーム、ブロックはひろばの自分の区画。混ぜないこと。
- **入口は押さない。** 戸口に入った瞬間に入る。`rpg.setDoorHandler()` を通信層が握っていて、
  `town` の `door` / `plaza` だけを自分で処理し、それ以外は今まで通り `island-interior.js` の部屋になる。
- かぐは footprint（w×d マス）と向き r（0〜3）を持つ。**同じ計算をサーバーもする**ので、
  `town.json` の `w`/`d` を変えたら `server/test` を回すこと。
- `room_json` は `{tier, furniture, plaza}`。古いセーブの `blocks` はひろばへ読み替える（消さない）。

## 英検の島（5級・4級・3級／2026-09 追加・準2級〜1級は 2026-10）

`eiken-island.js` + `eiken.json`（3島・同じ間取り）/ `eiken.js` + `eiken.css`（4技能の画面）。
サーバーは `server/src/game/eiken.js` と `eiken-bank.json`。

- **島は3つ、間取りは1つ。** 5級で「読むの館はここ」と覚えたら3級でも同じ場所。
  変わるのは英語と、見た目（`eiken.json` の `theme` だけで3つの世界を作っている）。
- **4館 = 4技能。** 立っている館がそのまま出題の種類になる（メニューで選ばせない）。
  読む=文＋4択／聞く=読み上げ＋4択／書く=単語を並べる／話す=マイクの聞き取りを送る。
- **答えはクライアントに来ない。** 読む・聞くは選択肢だけ、書くは「単語」だけで順番は送らない、
  話すは文だけ（音読するため）。採点はすべてサーバー。`eiken-bank.json` を `client/dist` に置かないこと。
- 建物の前は歩いて入る場所なので、**装飾は建物の横（`def.z - 4.6`）に置く**。
  正面に置くと道をふさぎ、`tests/regression.mjs` が落ちる。
- コインは日次上限（`EIKEN_CAP`＝150）。XPは上限なし（学習記録なので削らない）。

### はんていの きびしさは 3段階、決めるのは先生（2026-09 追加）

教室から上がった具体例：**「`I would like a hamburger.` を `I want a hamburger.` と
言った子を ○ にしたい」**。編集距離では2語ちがうので、いままでは落ちていた。

| | 話す・面接 | 書く（ならべかえ） | 読む・聞く（4たく） |
|---|---|---|---|
| **きびしい** | 1語も ちがえられない | お手本と 完全に 同じ順 | 4たく・ことばの ヒントなし |
| **ふつう**（既定） | 5語に1語まで | お手本と 完全に 同じ順 | 4たく・ヒントあり |
| **やさしい** | **言いかえを そろえてから** 4語に1語まで | となりどうしの 入れかえ 1か所まで | **2たく**・ヒントあり |

- **決めるのは先生だけ。** 先生コンソールの `📝 英検：…` を押すと
  きびしい → ふつう → やさしい と まわる（`RoomState.eikenLevel`）。
  **子どもには変えられない。** 同じ答えが子どもによって ○ になったり × になったり
  すると、コインも学習の記録も比べられなくなる。クラスで1つ。
- **採点するのはサーバー。** ページは札を出すだけで、`eiken:answer` に `level` を
  付けても読まれない（`server/test/room.test.mjs` がそれを見ている）。
- **きびしさは セットを作るときに 焼きつける。** 途中で先生が変えても、いま解いて
  いる5問の採点は動かない。画面の札は その場で変わるので、「つぎのセットから」の
  予告にもなっている。
- **言いかえの表は `server/src/game/eiken.js` の `SAME_MEANING`。**
  長いほうから先に並べること（`would like to` を `would like` より先に見ないと
  `to` が残る）。`easy` のときだけ、お手本と 言ったことの**両方**を通してから比べる。
- **打ち消しは 言いかえでは ない。** `I like apples.` と `I do not like apples.` は
  1語しかちがわないので、幅だけで見ると やさしいでは通ってしまった。どちらか片方に
  だけ 打ち消しがあれば、幅を見る前に 落とす（`negated()`）。
- **ならべかえは 編集距離では見ない。** となりどうしの入れかえは 編集距離では2つ分に
  数えられて「1語ちがい」と区別がつかない。`oneSwapApart()` で 入れかえだけを名指しで
  見る。**ばらばらの順は どの きびしさでも 通さない。**
- **4たくには ゆるい採点が入る余地が無い**（正解は1つ）ので、きびしさは**選べる数**で
  効かせる。やさしいでは まちがいを2つ 取り除いて2たくにする。**取り除くのはサーバー側**
  なので、消えた選択肢はブラウザーに届かない＝正解の手がかりにもならない。
- **学習ログに きびしさが残る**（`eiken:g5:speaking:easy:3`）。保護者が読む数字なので、
  「やさしい判定で満点」と「きびしい判定で満点」が同じに見えてはいけない。
- **面接（めんせつの間）も同じ きびしさ**を使う。館で通る言いかたが面接で落ちると、
  子どもは何を練習すればいいのか分からなくなる。
- 検査は `server/test/eiken.test.mjs`（8項目・判定そのもの。**would like → want が
  やさしいで通り、ふつうで通らない**ことが いちばん上にある）/
  `server/test/room.test.mjs`（実ソケット・**子どもは変えられない**・先生が変えると
  全員に降りる・セットが きびしさを 持ちつづける）/ `browser-eiken.mjs`（実ブラウザ・
  先生がボタンを押す → 子どもの画面の札が変わる → つぎのセットが本当にゆるくなる）。

### 準2級・2級・準1級・1級の 島と 面接の 形（2026-10 追加）

- 島は **7つ**（`eiken5` `eiken4` `eiken3` `eikenp2` `eiken2` `eikenp1` `eiken1`）。間取りは 同じ、`eiken.json` の
  `theme` と 位置だけ ちがう。級の 並びは `server/src/game/eiken.js` の `GRADES`（g5 g4 g3 gp2 g2 gp1 g1）が 正本。
  島を 足すときは `rpg.js`（作る・`EIKEN_IDS`・`ISLANDS`・返す オブジェクト）/ `rpg-data.js`（HUBS）/
  `world-picker.js`（LOOK）/ `net-client.js`（PREMIUM_DEFAULT）/ サーバーの `config.js`（premiumIslands）/
  `class-mode.js` / `tasks/engine.js` / `progression.js`（GRADE_RATE）/ `tests/regression.mjs` を そろえる。
- **島は ひろげて ある**（2026-10・つめつめ だった）：`eiken-island.js` の `SIZE`（40×34）・`K`（1.35＝建物の 間だけ ひろげる）・
  `FRONT`（8＝船着き場・大通り・門を 前へ）。館は ±20、うしろの 館は z −17.5、面接の間は z −23（`eiken.json`）。
  まわりの 木・岩・灯ろうは `onLand()` で 陸の 上だけ。`island-kit.js` の `scatter` も `size` に あわせる（ほかの 島は そのまま）。
- **面接の 形（`interview.js` の `KINDS`）**：`passage` `picture` `self` に 加えて `narrate`（3〜4コマの 絵を 話す・2級/準1級）・
  `opinion`（意見＋理由・準2級〜）・`speech`（1級の スピーチ）。長く 話す 形は **`minWords`**（無ければ `MIN_WORDS`）より
  短いと ×。準1級・1級は 本番に 音読が ないので カードに `noRead: true`（`passage` なし、`ask` から 始まる）。
- **面接の 画面**：大きい 🎤 を 押して 話す → もう一度 押して 送る（`continuous` で 長い 答えも 切れない）。
  話して いる あいだ 聞きとった 文と 語数が 出る。音読は 読めた 語が 光る。日本語は 最初 かくす（`#iv-jabtn`）。
  ⌨（`#iv-kbd`）で 書いて 答える ことも できる（マイクが 無い 端末は さいしょから 書く）。長い 形は 考える 時間（`PREP`）の
  カウントダウンつき。答えた あとに お手本と 🔊。
- **問題DB（/admin/qbank）にも 入る**：起動の とき `server/src/qbank/seed-speaking.js` が 面接カード（1 質問 1 行・`IV-…`）と 話すの館（`SP-…`）を
  `QBankStore.seed()` で 1 回だけ 足す（`SEED_TAG` ごと。もう ある 行は 同じ ID か 同じ 級・問題・正解で とばす。admin で 消した 行は もどらない）。
- **問題は U-Speak Lab の オリジナル**（CC BY 4.0）。英検の 面接を そのまま 使える オープンな データセットは 無いので、
  協会が 公開して いる 形（音読→質問の 順・コマ数・意見の 型）に 合わせて 作った。過去問の 文は 入れない。

## 英会話島（AI英会話・キャラクター動画／2026-09 追加）

`conv-island.js` + `conv.json`（島と4つの家・8つの場面）/ `conv.js` + `conv.css`（会話画面）/
`assets/character/idle.mp4` `talking.mp4`（ウーピーの動画）。
サーバーは `server/src/game/conv.js` と、**おつかい島と共有の** `server/src/ai/tutor.js`。

- **家＝場面。** 入った家がそのまま話す場面になる（メニューで選ぶのは家の中の2つだけ）。
  であいのカフェ（5級）/ おかいものストリート（5級）/ がっこうテラス（4級）/ ゆめのとうだい（3級）。
- **できたこと（aims）はサーバーが判定する。** 各場面に2〜3個、「名前を つたえる」「ねだんを たずねる」など。
  ページは**マイクが聞き取った文字列（または入力した文）だけ**を送り、達成の申告はしない。
  aim ごとに XP、場面を全部達成すると **+40🪙**（日次上限 `dailyCoinCap`＝200）。
- **AI は共通**。`asMission(topic)` で場面をおつかいと同じ mission の形にしてから `tutor.turn()` に渡す。
  ペルソナ（ウーピー）・安全ルール・JSON スキーマ・**APIキー無しの台本モード**が丸ごと共有される。
  `mission.scene` だけ新設（プロンプトの「どの島の話か」）。
- **APIキーが無くても動く**（`OPENAI_API_KEY` 未設定＝台本モード）。台本モードの aim 判定は
  「長い語2つ、または見本文の半分以上の語が一致」。1語だけでは達成にしない（"please" だけで
  「2つと伝える」が達成になっていたのを直した経緯がある）。
- **キャラクター動画は2本だけ**（idle / talking、各10秒・1280x720・H.264）。
  リップシンクはしない：**読み上げ（speechSynthesis）が鳴っている間だけ talking を出す**。
  `#conv-stage` の `data-mouth` が唯一の信号で、`onend` が来ない環境（Safari のバックグラウンド等）に
  そなえて時間の保険もかけてある。2本は最初と最後のフレームが同じなので、0.14秒のクロスフェードで
  切れ目が見えない。**動画は家に入って初めて読み込む**（島に来ない子は3MBを落とさない）。
- **デコードできない環境では絵のフクロウに落ちる**（`data-video="off"`）。会話は動画に依存しない。
  このコンテナの Chromium は H.264 を持たないので、e2e はこのフォールバックで通している。
  **実際の再生確認は実機（iPad/Safari）でやること。**
- 制限は3つ：一度に1ターン・`AI_MIN_INTERVAL_MS`・`AI_DAILY_TURNS_PER_STUDENT`（おつかいと合算）。
  1つの場面は `turnLimit`（14往復）で打ち切る。
- 島は `rpg-data.js` の HUBS と `ACTIVITY_HUBS` に `conv` として登録。`rpg.convNearby()` が
  「いまいる家」、`net.convInteract()` が画面を開く。
- **広場の真ん中に物を置かないこと。** 前列2軒への道が広場を斜めに横切るので、置くと
  `tests/regression.mjs` の「paved path runs through a building」で落ちる（実際に落として直した）。
  ステージ（マイクのある東屋）は家の裏（z=-11.5）に置いてある。

### 会話の 画面（話す 練習の 作り／2026-10 更新）

似た アプリ（Duolingo の Lily・Speak・Buddy.ai・Ello・Google Read Along・Alexa Reading Sidekick・Praktika・Gliglish・Mondly）と
研究（子どもの 声と 日本人の 英語は 音声認識が まちがえやすい・待つ 時間は 3〜5 秒・会話中は 言いなおしで 見せ、説明は おわってから）を 見て 決めた。
- **まんなかに 大きな「🎤 おして はなす」**（押すと 聞く、もう一度 押すと おわる）。聞こえて いる ことばは その場で ログに 出る（`interimResults`）。
  聞いて いる 間は ボタンが 赤く、ウーピーの 耳（`.conv-ear`）が 光る。**キーボードは ⌨️ を おした ときだけ**（マイクの ない 端末は 最初から）。
- **こたえの れい（💡 れい）**：サーバーが 送る `suggestions`（AI＝つぎに 言える 短い 英語 2〜3 こ、台本＝まだの 目あての お手本の 文）。
  おすと ウーピーが その 文を いう → 子どもが まねして 🎤。**おしただけでは おくらない**（言うのは 子ども・目あての 判定は サーバー）。
  自分で 出るのは 2 回 つづけて 聞きとれなかった とき と、ウーピーが 話しおわって 9 秒 なにも しなかった とき。
- 自信の ない 聞きとり（confidence 0〜0.5）だけ「この 文で おくる？」と たしかめる（iPad は いつも 0 なので たしかめない）。
- 🔊 もう一度・🐢 ゆっくりで（声を 0.75 倍。`playVoice({slow})`・`character.say(text, {slow, keepLine})`）・🇯🇵 いみ（AI の `replyJa`、台本の ときは ボタンが 出ない）。ログの ウーピーの 行にも 🔊。
- へんじを 待つ 間は ログに「…」。**会話中は まちがいを なおさない**（ウーピーが 正しい 言いかたで 返すだけ）。AI の `better`（子どもの 文の 正しい 言いかた）は 部屋が `state.tips` に ためて、
  おわり（ぜんぶ できた・14 回）に **ふりかえり**（`recap`：言えた 文・「こう いうと もっと いいよ」3 つまで・🔁 もう一度 はなす＝`conv:start {again:true}`・🏠 ほかの はなし）。
- 新しい 3 つ（suggestions・better・replyJa）は `tutor.js` の schema と `sanitizeTurn`（英語だけ・3 つまで・「AI」を 言わない）。おつかい島も 同じ tutor なので 送られて くるが 使って いない。

## のりもの島（カートレース／2026-09 更新）

`ride-island.js` + `vehicles.json`（島・サーキット・グリッド・パッド・箱・ライバル）/
`ride.js`（ガレージとスタートライン）/ `kart.js`（走りの感触）/ `race.js` + `race.css`（HUD・
📦の出題・リザルト）。サーバーは `server/src/game/race.js` と `server/src/game/vehicles.js`。

- **`vehicles.json` が唯一の座標定義元。** 島・ゲート・チェックポイント・グリッド・
  ブーストパッド・アイテムボックスが全部ここにあり、クライアントは島を建て、サーバーは
  同じ座標で「その場にいるか」を見る。片方だけ動かさないこと。`server/test/vehicles.test.mjs`
  が「パッドも箱もグリッドも道の上か」を点と線分の距離で検査する。
- **走りは歩きと別物**（`kart.js`）。W＝アクセル、A/D＝ハンドル、スペース＝ドリフト。
  上限速度・芝生・ドリフトの溜め・ミニターボはここだけにあり、`tests/regression.mjs` が
  実際にこのモジュールを回して検査する。**ここは賞金を決めない**。
- **賞金・順位・ラップはサーバー**（`game/race.js`）。ページが送るのは「このチェックポイントに
  いる」だけで、部屋が本人の座標と突き合わせる（`COURSE.reach + SPOT_SLACK`）。
  順番違いは「つぎは○○」、`minLapMs` より速い1周は**受け付けずラインで待たせる**。
- **`lap` は「いま何周目か」、`completed` は「いま終わった周」**。両方送っているのは、
  HUD が2周目に入った子に LAP 1 と出していたのを直したから。片方だけ使わないこと。
- **レース中のメッセージは位置を先に送る**（`net-client.js` の `createRaceUI({send})`）。
  ブースト中のカートは1フレームで数メートル進むので、先に言わないとサーバーは
  「まだ手前にいる」と答えて、子どもは理由も分からずラップを失う。
- **拒まれたチェックポイントは、離れればもう一度取れる**（`race.js` の `hit`）。
  取り消さないと「速すぎ」で1周やり直しになった子が、二度とラインを越えられなくなる。
- **完走した子の画面は `race:field` で running に戻さない。** 部屋は他の子のために
  1秒ごとに「まだ走っている」と言い続けるので、そのままだとリザルトが消える。
- ライバル（ミドリ・モモ・クッパ風）は**カートではなく目標ラップタイム**。順位表には
  一緒に並び、ページ側は `standings` の progress からリングの上を補間して描くだけ。
- **📦はサーバーが出題**（`gym-words.json`・110語）。日本語1語と英語3択だけが飛び、
  正解はサーバーにしかない。正解でダッシュ＋XP、外れは答えを見せるだけ。
- スタートラインだけは**建物のないスポット**（ゲート4つは家）。`tests/regression.mjs` の
  「1スポット1ドア」検査はここを明示的に例外にしてある。ガントリーの脚も当たり判定なし。
- e2e は `server/test/e2e/browser-race.mjs`（実ブラウザ2画面）。**カートは運転ではなく
  ワープで走らせている**：このコンテナは3fps しか出ず、ハンドルを切れないため。
  走りそのものは `tests/regression.mjs` が同じ `kart.js` で見ている。

### レースは「別の画面」（2026-09 更新）

**スタートした瞬間から、ゴールの結果を閉じるまで、島は消える。** 右のバー・ドック・
ホットバー・クエスト一覧・移動パッド・世界のラベル——全部 `body[data-race]` が
`display: none` にする（`race.css` の「1. The island steps aside」）。
**画面に残ってはいけない物が残っていたら、まずここを見る。**

- **`body[data-race]` が唯一のスイッチ**（値は `grid` / `countdown` / `running` / `done`）。
  `race.js` の `showScreen()` だけが書き替える。新しい HUD を足したら、この一覧にも足すこと。
- **カメラはカートの後ろ**（`race.js` の `chase()`・`game.js` から呼ぶ）。
  速度で下がり、ドリフトで傾き、ブーストでもう一段下がる。島の周回カメラは歩く用で、
  時速200kmでは何も見えない。**レースが終われば元のカメラに戻る**（分岐は1か所だけ）。
- **島の看板と名札は消す**（`island-kit.js` の `setLabels()` / `remote-players.js` の
  `setTags()`、`net-client.js` の `onScreen`）。30m 先から読める大きさで書いてあるので、
  8m のカメラでは道をふさぐ。**`update()` が毎フレーム `label.visible` を書き戻すので、
  `labelsOn` を見るようにしてある**（ここを忘れると消えない。実際に一度ハマった）。
  島は遅れて建つので、**レース中に生まれた看板も最初から非表示**で作る。
- **指で運転できる**（`.race-key`）。左が ◀ ▶、右が ▲（アクセル）・▼・ドリフト。
  押している間 `touch` に同じキー（`w` / `a` / `d` / `s` / スペース）を入れるだけなので、
  **`kart.js` は「キーボードか指か」を知らない**。パソコンでは出ない（`pointer: fine`）。
- **コースの地図は `gates` から描く**（`race.js` の `drawMap()`）。サーバーがラップを
  判定するのと同じ点の列なので、地図と実際のコースがずれようがない。自分の印だけは
  順位表ではなく**実際の座標**から描く（順位表は0.25秒ごとで、そこだけ遅れると気持ち悪い）。
- **信号は5灯**。1秒ごとに2つずつ点いて、`race:go` で消える。
- レース画面も `browser-layout.mjs` の `SCREENS` に入っている（`uspeak.__layout.race()` が
  `vehicles.json` から本物の `race:grid` を組み立てて開く）。5サイズで測っている。

## U-SPEAK GRAND PRIX（べつのゲーム／2026-09 追加）

**のりもの島のレースとは別のゲーム。** 島を1周するのが `race.js`、**自分のサーキットを
走る本気のカートゲーム**が `kart-game.js`。スタートラインの「レースに でる」を押すと
**後者が開く**。

`tracks.json`（コース定義）/ `kart-track-data.js`（中心線の数学・共有）/ `kart-drive.js`
（走り・共有）/ `kart-ai.js`（ライバルの運転・共有）/ `kart-track.js`（3Dのコース）/
`kart-models.js`（カート）/ `kart-game.js` + `kart.css`（ゲーム本体）。
サーバーは `server/src/game/gp.js`。

- **`tracks.json` が唯一のコース定義元**で、**クライアントとサーバーが同じファイルを読む**。
  22個の制御点から中心線を作り（Catmull-Rom）、そこから**距離で引ける表**（位置・進行方向・
  法線・幅・バンク・曲率・勾配）を作る。チェックポイント・グリッド・箱・パッド・ジャンプ台は
  全部 **(t, 横のずれ)** で書いてあるので、コースの形を変えれば全部ついてくる。
  1周860m・3周。`server/test/track.test.mjs` が寸法を測っている。
- **走りは `kart-drive.js` にしかない**（`kart.js` は島のレース用で別物）。向いている方向と
  進んでいる方向を別々に持ち、ドリフトで3段階チャージ→ミニターボ。**1/120秒の固定ステップ**を
  呼び出し側が刻む（`advance`）ので、3fpsのiPadでも60fpsのPCでも同じ走り。
  `server/test/kart-drive.test.mjs` が9項目。
- **ライバルはサーバーが走らせる**。`kart-ai.js` の運転をサーバーの `gp.js` が回し、
  10Hz で位置を配る（`gp:field`）。ページは**100ms 過去を描くだけ**（`followRivals()`）で、
  自分ではAIを回さない。**クラス全員が同じミドリと走る**ためで、ここを崩すと
  「わたしのミドリ」と「となりの子のミドリ」が別の場所にいる。オフラインのときだけ
  ページが自分でAIを回す（`state.online` の分岐）。
- **順位・ラップ・賞金はサーバー**（`server/src/game/gp.js`）。ページが送るのは
  「チェックポイントnを通った、その時コースのここにいた」だけ。部屋は**順番どおりか・
  一度きりか・その場所か（26m）・その時間で走れる距離か（boostTop×1.3）**を見る。
  **賞金はのりもの島と同じ日次上限**（`COURSE_CAP`＝220）から出るので、2つを行き来しても
  二重取りにならない。
- **ライバルの強さは「壁」にしないこと。** 全開で3周99秒のコースで、ミドリは約103秒、
  最後尾のクモは約151秒。**前が速すぎると誰も勝てず、後ろが速すぎると全員最下位になる**
  （実際に両方やった）。`server/test/gp.test.mjs` が「限界の周回なら勝てる」ことと
  「1位と最下位が30秒以上離れている」ことを検査している。**skill を 0.9 以下にすると
  ドリフトしなくなる**（`kart-ai.js`）ので、ホシとクモは曲がり方が目に見えて違う。
- **📦はサーバーが出題**（`gym-words.json`）。箱は**1周に1回だけ**。位置（`s`）を
  claim につけて送る。正解でダッシュ＋XP。
- **チェックポイントは「近さ」ではなく「通った線」で数える**（`checkpoints()`）。
  「ゲートの先1/4周のどこかにいる」で判定すると、**ワープ・コース復帰・落ちたフレーム**の
  向こう側からでも発火し、いっしょに送る位置がゲートから100m離れて **`too far` で永久に
  拒まれる**（実際に1回の実行で1100回拒まれ、3周走った子が1周しか認められなかった）。
  いまは「前のフレームの `s` と今の `s` のあいだにゲートがあったか」を見るので、
  claim の位置は**最大でも1フレームぶん先**。40m を超える移動は「跳んだ」として数えない。
- **claim は行列で持って、部屋が受け取るまで再送する**（`me.log` / `me.claimed`）。
  再送するのは**そのとき本当にいた位置**。いま位置で送り直すと `too far` の無限ループになる。
  `too far` が返ったら行列を捨てて**そのゲートまで戻って通り直す**（島のレースと同じ）。
- **部屋のティックは1秒に1回**（Colyseus は `room.clock` を simulation interval の中でしか
  進めない）。だから**ライバルの運転は `tickGP` の中で1/30秒に刻む**。刻まないと
  「1秒に1回だけハンドルを切る」運転になり、34秒で1周するはずのミドリが2分半かけても
  1周できない（実際になった）。**10Hz の配信は素の `setInterval`**（`onDispose` で止める）。
- **ライバルの補間は壁時計（`performance.now()`）で回す**。物理の時計（`state.now`）は
  遅い端末でわざとゆっくり進むので、それで補間するとライバルが**毎フレーム過去へ遅れていく**
  （テスト環境で実速度の1/4になった）。物理のフレーム上限は0.5秒（部屋のライバルは
  実時間で走るので、1/4速の子どもをぶつけるのは勝負ではない）。
- **画面は `body[data-gp]` が唯一のスイッチ**。島のバー・ドック・移動パッド・クエスト一覧が
  全部消える。`#gp` は **`pointer-events: none` の HUD 層**で、絵そのものは**島と同じ
  WebGLRenderer** に別のシーンを描いている（**2つ目のGLコンテキストはiPadで数百MB**かかり、
  Safari には本数制限もある）。
- 検査は `server/test/gp.test.mjs`（11項目）/ `server/test/room.test.mjs` の
  「the grand prix」（部屋の拒否を全部）/ `server/test/e2e/browser-gp.mjs`
  （実ブラウザ2枚。**両方のミドリが同じ場所にいること**を測るのがこのe2eの主目的）。
  レイアウト検査（`browser-layout.mjs`）にも `gp` 画面として入れてある。
- **e2eではライバルのAIで自動運転させている**（`setAutoDrive`）。このコンテナは3fpsで
  ハンドルを切れないが、物理が固定ステップなので**本当にコースを走る**（ワープではない）。
- **島のレース（`race.js` / `server/src/game/race.js`）はまだ生きているが、スタートラインからは
  開かない。** テストとレイアウト検査で動かし続けている。消すなら別の変更として。

## コインの見える化・マイページ（DreaMagic 参考／2026-09 追加）

お客さま（ツリーベル英語教室）から参考として渡された DreaMagic（smile-english.online）
の3画面のうち、**コインまわり**と**学習ダッシュボード**を取り込んだもの。

### コインの見える化（`coin-hud.js` / `coin.css`）

- **残高は常にヘッダーにある**（`header .stats` の先頭）。以前は「釣り」ボタンの中の
  小さな ◈ 120 だけで、増えたことはトーストで流れて消えていた。
- **もらった瞬間、コインが降る**。画面の上から落ちて、**下辺に一列に並び**、数えられる
  だけ留まってから、残高へ吸い上げられる（数字はその間にカウントアップ）。
  「+15🪙」と告げるのと、15枚が財布に入るのを見せるのは別のこと。
- **入口は1つ**。`fishing-state.js` の `commit()` は釣果・売却・購入・杖、そして
  **サーバーからの reconcile** まで全ての残高変更が通る唯一の場所なので、そこに
  `onChange` を足してある。オンラインでもオフラインでも同じ道を通る。
- **1回の支払いは1回の演出**。オンラインでは「ページの先行更新」と「部屋の確定」で同じ
  報酬が2回届く。降っている最中の2回目は数字だけ動かす（実測で28枚→14枚）。
- コインは**画像ではなく CSS で描く**（18pxでも30pxでも潰れない・初回から出る・30人が
  同時に開いても1バイトも落ちてこない）。
- **`.stats button{width:32px;height:32px}` に負ける**。クラス1＋要素1なので素の
  `.coin-hud`（クラス1）より強く、バッジが32px角に潰れて数字が消える。`.stats .coin-hud`
  と書いてある。`#voice-button` が `.right-rail > *` で踏んだのと同じ穴。
- コインの中の ◈ は装飾なので11px未満にはしない（`mobile.css` の型下限は「読む文字」の
  ためのルールで、飾りを小さくして回避するのは規則の回避になる）。

### マイページ（`dashboard.js` / `dashboard.css` / `server/src/game/skills.js`）

コインバッジをタップすると開く。参考画面と同じ3点セット：**レベルバー**・**3つの実績
カード**・**5技能のレーダーチャート**。

- **中身はすべてサーバーが決める**（`dash:get` → `dash:state`）。保護者が読む数字なので、
  コインと同じ理由でページには計算させない。
- **5技能への振り分けは `skills.js` の1か所**。学習ログの `mode` から
  きく／はなす／よむ／かく／りかい に落とす。`appendLearning()` を ClassRoom の
  メソッドに変えて、**11か所ある学習ログの書き込みが全部そこを通る**ようにしてあるので、
  12個目の活動を足した人がこのファイルを知らなくても数えられる。
- **チャートの1本の長さは「量 × 質」**。正解率だけだと2問正解で満点になり、量だけだと
  当てずっぽうが得をする。`min(1, 回答数/60) × (0.4 + 0.6×正解率)`。**やっていない技能は
  0**で、それが一番言いたいこと（「つぎは◯◯をやってみよう」を出す根拠）。
- **総学習時間は「何かした時間」**。接続しているだけでは増えず、直近2分以内に動いたか
  答えた子だけ1秒ずつ積む（`tickStudy`・`STUDY_IDLE_MS`）。タブを開きっぱなしの通学時間が
  学習時間になると、保護者に見せる数字として意味がなくなる。
- **総学習日数は「答えた日」**の数（ログインしただけでは増えない）。
- チャートは canvas に直接描く（5軸の多角形に90KBのライブラリは要らない）。
- 検査は `server/test/skills.test.mjs`（5項目・振り分けと採点）と
  `browser-layout.mjs` の `dash` 画面（5サイズ）。

## つづけてもらうための表示（2026-09 追加）

**サーバーが決めて、ページは並べるだけ。** 中身は `server/src/game/retention.js`、
なぜそうしたかの調べものは `docs/uspeak-retention.md`（出典つき）。

| 出るところ | 出るもの | ファイル |
|---|---|---|
| 先生コンソール | **きょうの気づき**（声をかける子・気にする子・伸びている子） | `teacher.js` / `net.css` |
| マイページ | **◯かげつ つづいてるよ** と **きょねんの同じ月** | `dashboard.js` / `dashboard.css` |
| 保護者レポート | 去年の同じ月とのくらべ、つづけた月数 | `server/src/game/report.js` |

- **気づきはボタンのすぐ下**（`#net-t-notices`）。**探させると読まれない**ので、
  レポートのリンクと同じく開いた瞬間に目に入るところに置いてある。
- **順位ではない。** 出るのは全部「その子の先月とくらべて」で、教室の中で子どもを
  並べてはいない（順位は、下にいる子の保護者に見せられない）。
- **色だけに意味を持たせない。** 印（● ○ ✦）と言葉（「声をかけましょう」）を
  必ず一緒に出す。赤緑が見分けにくい先生の端末でも読める。
- **連続は煽らない。** マイページの「◯かげつ つづいてるよ」は**答えた月の連続**で、
  切れても何も言わない（「あと3時間で消えます」は出さない）。日の連続にしないのは、
  週1〜2回の教室の子に毎日を求めるのが設計のまちがいだから。
  調べた根拠は `docs/uspeak-retention.md` の3（Duolingo の研究と、その批判）。
- **先生コンソールはもともとスクロールする**（`max-height:min(60vh,520px)`）ので、
  気づきが増えても名簿が画面から消えることはない。

## ぼくじょう島（牧場物語 × 英語／2026-10 追加）

`farm-island.js` + `farm.json`（島・作物・動物・レシピ・値段）/ `farm.js` + `farm.css`（画面）。
サーバーは `server/src/game/farm.js` と **`farm-bank.json`（英語。クライアントには来ない）**。

- **体力の代わりに英語を払う**のが設計の一行。`farm:act` で「これをしたい」→ `farm:ask` で問題
  （答えなし）→ `farm:answer` → サーバーが判定して効果を適用。**ページは何も決めない。**
- **1 日＝世界時計の 1 周**（`world-clock.js` の `CYCLE_SEC`）。季節＝本物の季節（`daily.js seasonFor`）。
- **屋外の畑と柵は `island.setFarm(state)` で描き直す**（`net-client.js` が `farm:state` / `farm:result` のたびに呼ぶ）。
  到着時に描けるよう `welcome` で `farm:peek` を送っている（位置ゲートなし・読むだけ）。
- **5 つの建物の道は広場の真ん中から扇状に出る**ので、広場の中心に物を置かないこと。井戸は広場の東の端、
  畑と柵は南側（道の外）。`tests/regression.mjs` の「paved path runs through a building」で落ちて直した。
- **学習の中身は `.farm-q` / `.farm-en` / `.farm-ja` / `.farm-dex`**（`i18n-dom.js` の `LEARNING`）で、
  `translate="no"` も付けてある。作物・動物の英語名は訳さない（それが単語そのもの）。
- 住人の名前（Hana / Gramps / Taro / Zack / Mia）は `farm.json` の `character` が定義元。
- **問題は英検5級・1 問 1 画面**（2026-10 に全面的に落とした）。買う＝3 枚のカード、植える＝絵と 4 択、水やり＝絵つき穴うめ、
  エサ＝鳴き声、出荷＝文字タイル（6 文字以下）か 3 つのつづり、料理＝材料。**長い文を作らないこと** — 小1は読めない。
  `farm.js` の `nextStep(f)` が「つぎに する こと」を 1 つ返し、帯（`#farm-next-step`）と屋外の光の柱（`island.setTarget`）の
  両方がそれを使う。各画面の ①②③ は `HOWTO`。問題と正解は `speak` で読み上げる。
- **畑と柵は「場所」**（2026-10）。`farm-island.js` の `nearField(player)` が「どのマスの上か／柵の中か」を返し、
  `rpg.farmFieldNearby()` → `net.farmFieldInteract()` → `farm.openAt()` で**小さいカード**（`#farm-dialog.mini`）が開く。
  開いた瞬間に そのマスの用事（みずやり・しゅうかく・かたづけ）を `act()` する（`state.auto`）。あいているマスだけ
  たねを選ばせる。OK でカードは閉じる（畑を見せるため）。畑と柵の**当たり判定は柵の線だけ**（四角で塞ぐと入れない）。
  光の柱は `island-kit` の `setTarget(id, at)` で建物以外にも立つ（`places.field` / `places.pen`）。
  マスが変わると `pops` で はねる（`paint()` が前回の段階と比べる）。
- **暦・おまつり・親密度（2026-10）。** 季節は **サーバーの暦**（`calendarOf()`、`farm:state` の `calendar`）で、ページは `season` を
  自分で計算しない。`farm-island.js` の `dress()` が 4 季の小物（さくら・ひまわり・紅葉とかぼちゃ・雪と雪だるま、各 1 Group＋舞う Points）
  と おまつりの提灯・屋台を一度だけ作り、`paint()` が `setSeason()` / `setEvent()` で見せる。画面は `#farm-calendar` の帯、
  住人カード（`farm-level` / `farm-likes` / `farm-fest` / `#farm-event` → act `event`）。おまつり・誕生日は `nextStep()` の先頭近くに来る
  （待ってくれないので）。`villagers[spot]` に hearts / level / likes / dislikes / birthday / festival が入っている。
- **天気と水おけ（2026-10）。** `farm:state` の `weather`（`'sun' | 'rain'`）/ `rainIn` / `dryDays` はサーバーが決める
  （`rainyDay(day)` はハッシュ。ページで天気を作らないこと）。雨の日はサーバーが先に `watered` / `wet` を立てて送ってくるので、
  `nextStep()` は自然に水やりを飛ばす。家畜のカードは **エサ・みず（`data-do="trough"`）・ブラシ・とる** の 4 つで、
  「とる」は `fed && wet` まで無効（文言は「エサが さき」→「みずが さき」）。エラーは `thirsty` / `already watered` / `rain did it`。
  島の雨は `farm-island.js` の `setWeather()`（`paint()` が毎回呼ぶ。雨粒は `THREE.Points` 1 つ）。
- **さくの画面（2026-10）。** `renderBarn()` は 畑の `renderPlot` と同じ考え：**次に する 1 つ**を大きいボタンにする。
  動物カードの 3 ステップは `button.farm-step[data-do]`（e2e が `[data-animal][data-do=...]` で押すので data 属性は残すこと）。
  牧草地（`#farm-stage`）は動物がいなくても出す（`.empty`）。動物の購入カードはさくにも出る（サーバーが barn で `buy` を許す）。
  島の家畜のふきだしは `farm-island.js` の `bubble(emoji)`（CanvasTexture の Sprite）で、`paint()` が fed / wet / got から決める。
- **家畜の 3D は 1 か所。** `farm-animals.js` の `buildAnimal()` / `animateAnimal()` を、柵（`farm-island.js`）と画面
  （`farm-preview.js` の `createAnimalStage()`）が共有する。画面は描画器 1 つ：カードの写真は `img[data-shot="kind:hearts"]` を
  `fill(root)` が offscreen target から焼いて差し込み（ハートは 0 / 3 / 6 の 3 段で丸める）、`#farm-stage` の牧草地だけが生の canvas
  （`show(el, animals)`、dialog の `close` で `stop()`）。カードに canvas を 1 つずつ置かないこと（iPad の WebGL コンテキスト数）。
- **E キーの連鎖（`game.js` の keydown）とクリックの連鎖は別々に書いてある。** 島を足したら両方に `xxxNearby()` を足すこと。
  ぼくじょう島はクリック側にしか無く、E で開かなかった。
- 買い物の効果は `{ spend, id }` を返すこと（`onFarmAnswer` がそれで請求する）。返し忘れると店がタダになる。
- 検査は上の README の「ぼくじょう島」に書いた 4 つ。e2e は戸口の掛け金（`doorLatch`）の都合で
  **建物から建物へ移るときは一度広場へ出る**（実機の子どもと同じ動き）。

## 土地島（じぶんだけの しま／2026-10 追加）

`land-island.js` + `land.json`（島と 6 段 × 2 種類）/ `land.js` + `land.css`（ふどうさん・みんなの しま）/
`land-world.js`（`buildIslandModel` と 自分の島＝独立シーン）。サーバーは `server/src/game/land.js`。
調べものは `docs/uspeak-land-research.md`。

- **`land.json` が唯一の定義元**（島・6 段・値段・広さ・各段の `looks`・もようがえの割合 `restyle`）。ページとサーバーが同じく読む。
- **3 つの建物は全部 戸口で開く**（`net-client.js` の `setDoorHandler` が `islandId === 'land'` を `land.enter(spot)` に渡す）。
  office → `land:open` でカード、board → `land:board`、ferry → `land:enter` → `land:island` → `myLand.enter()`。
- **島の形は `buildIslandModel(island, {owner, sign, liveSign, sea})` 1 つ**。`{group, obstacles, H, floorY, animate(t), theme, dispose()}` を返す。
  中身は 3 つ：`land-kit.js` の `makeKit()`（形・地形・共通の小物）、`land-themes-a.js` / `-b.js` の `BUILD[theme](K, half)`
  （12 の世界）、`land-world.js`（海・崖・さんばし・看板を足して組み立て、`terrain()` → `flush()`）。
  - **`B/cone/ball/cyl` は mesh を返さない**。インスタンスの記録（position/rotation/scale）を返し、`flush()` で
    形×色ごとに 1 つの InstancedMesh にまとめる。返り値の `.rotation.y =` などは flush 時に反映されるので今までどおり書ける。
    **毎フレーム動かす物・光る物・透ける物は `M.B()` など実 mesh**（glow か opacity<1 なら自動で実 mesh）。
  - **地面は高さ**：`H(x,z)`（ノイズの丘 + `hill()` + `pad()` の平地、ふちは浜へ下る）。`B()` などは y に自動で `H` を足す（`lift`）。
    海・崖・さんばしは `K.lift(() => …)` の中で絶対座標。子どもの足は `floorY()`（`rpg.floorY()` 経由で `game.js` が足す）。
    建物は必ず `pad()`（`house()`/`tower()`/`pond()` は中でやる）。置き場所は `spot(w,d,{rMin,rMax,slopeMax})` で探す。
  - 動くものは `anim(fn)` に登録し、`animate(t)` が全部回す。当たり判定は `block()` で登録した箱だけ。
    乱数は **種つき**（`seeded(theme:grid)`）なので、カードの絵と歩く島が同じ形になる。`Math.random` を使わないこと。
- **自分の島は マイルームと同じ作り**：`createLand` が `buildIslandModel(..., {sea:'wide', liveSign:true})` を自分のシーンに置く。
  `rpg.attachLand(myLand)` で `builtIn()` に入り、`interiorScene` / `interiorCamera` / `mapSmall` / `blocked` がそのまま効く。
  `currentSpace()` は `in:land`（通話にはならない）。出るのは **さんばしを下る**（`update()` が `z > half + 2` を見る）。
- **ふどうさんの 3D は `land.js` の自前 `WebGLRenderer` 1 つ**（`#land-canvas`）。台の上の島は `requestAnimationFrame` で回す
  （dialog が開いている間だけ。`spinning` で 1 本に）。12 枚のカードの絵は同じ renderer で `WebGLRenderTarget` に 1 回焼いて
  data URL にする（`bake()` → `shots`。きせかえの店と同じ作り。カードごとにキャンバスを持たないこと：Safari が 12 個の
  WebGL を許さない）。WebGL が無いときは絵文字が立つ（`failed`）。モデルは `models` に見た目ごとに 1 つだけ建てて、
  台とカードで使い回す（同じ Group を 2 つのシーンに同時に入れないこと：`bake()` が `wasShown` で戻している）。
- **カードの立場は `standing(look)`**：`mine` / `restyle`（同じ段のもう片方、`step.restyle` の値段）/ `next`（`next.price`）/
  `passed` / `later`。買うのは 2 タップ（`data-ask` → `data-buy`、`data-kind` が buy か restyle か）。
  値段の表示は `land.json`、請求はサーバー（`land:buy {look}` / `land:restyle {look}`）。
- **行き帰りは船**（`createLand` の `startRide(dir)` / `endRide()` / `skip()`）。`enter(payload)` は島を建てて船に乗せるだけで、
  着くのは `endRide('in')`（`cooldown` 1.5 秒）。乗っている間は `blocked()` が全部 true、`update()` が毎フレーム
  player を甲板に置き、`updateCamera()` が船を追う。桟橋の先（`z > half + 2`）に出たら `startRide('out')` → `leave()`。
  **`enter(payload, {ride:false})` で船なし**（検査や急ぐときに）。遠くの土地島（`hub`）は `half + 58` に置き、船は その桟橋（`half + 44`）から出る。
- **みんなの しま は名前順**。段で並べ替えないこと（順位表にしない。`docs/uspeak-retention.md`）。
  「⛵ いく」→ `land:visit {name}` → 同じ `land:island`（`visiting: true`）→ 同じ船。見るだけ。
- 見た目を足す／段を変えるときは `land.test.mjs`（比率 2〜6 倍・順番・12 の世界が全部ちがう・もようがえ）を通し、
  `land-world.js` の `THEMES` と `BUILD` に同じ名前で足し、`land.css` の `[data-theme=…]` の色も足すこと。

## メインの島（3D の島 ＋ 2D の しまの ちず／2026-10 追加・更新）

**島そのものは 3D**（`main-world.js`、ほかの島と同じ island-kit）。HUBS の `main`（ACTIVITY_HUBS にも）。
配置は `main_island.json` の `island`（Roblox の pois を、場所どうし 10 以上はなして並べなおしたもの）。
ふつうの島より大きいので `createIsland` に `size` / `power`（4＝角の丸い四角）/ `land`（入り江を抜く）/ `dock` を渡す
（どれも省けば いままでの島。`arrival` が着く場所で、`rpg.activate` が使う）。

- **U-Speak島の すぐ北に ある（2026-10）。** 位置は `rpg-data.js` の HUBS と `main_island.json` の `island`（x -26, z -79。部屋の 位置チェックも これを 読む）。
  U-Speak島の 北の 道（x=5）から メインの島の 船着き場まで **木の 橋**（`bridge.js`）で 歩いて わたれる。橋の 上は どちらの 当たり判定より 先に 歩ける（`game.js` の `blocked`）、
  まんなか（z -28）を こえると `rpg.activate(id, false)` で いる 島が きりかわる（ひこうきは 飛ばない）。U-Speak島に いる 間も メインの島は 見えている
  （`main.show(id==='main'||id==='willow')`）が、話しかけ・戸口・ミニマップは いる 島だけ。島を 動かすときは 2 つの 位置と `BRIDGE` を いっしょに。
  **U-Speak島の 北の「遠くの 山」2 列（`game.js` と `atmosphere.js`）は メインの島に かさなる ものを 立てない**（前は 島の 上に 山が つき出て こわれて 見えた）。島を 動かしたら この 範囲も なおす。
- **スタート（⭐）は 島の まんなか**（2026-11・`main_island.json` の `start` ＝ `main-world.js` の `START`＝(10.5, 21)、さんばしの 入口の よこ）。ひこうき・🏠・はじめての 入室は ここに あらわれる（`island.arrival` を 上書き）。**橋が つくのは 船着き場（`dock` 31, 37）の まま**。うごかすときは 2 か所を いっしょに。
- **配置は スタートから 近い 順に よく つかう 場所**（2026-11）：屋台 3 つ（x 17.5・28・38.5, z 21）→ ふくや・ブロックや・いえの おみせ・かいとりや（z 8 の 列）→ 英単語ハウス（z -4）。
  **つりの ものは さんばしの 入口（x 4, z 16〜24）に 1 か所**：つり島への ゲートは 入口の すぐ 西（-4, 21）、さかなの かいとりやは 入口の 真正面（4, 8）。
  ほかの ゲートの列と 英会話の お店は 西。場所を うごかすときは 戸口どうし 10 より はなし、英単語ハウスへの 道（x 22・33・44）と かんばんの 道（x 11）を 建物で ふさがない（`tests/regression.mjs`）。
- 入れるのは 17 か所（英単語ハウス 3・看板・かいとりや・つり場・ゲート 5・屋台 3・ふくや・ブロックや・いえの おみせ）。**戸口を歩いて入ると** `setDoorHandler` →
  `main-island.js` の `walkIn(spot)`。ゲートは そのまま飛ぶ。P2 / P3 は 建物だけで 札に 🔜。
- **はじめてクラスに入ったときだけ** その場でメインの島に立たせる（`goHome({first:true})`、飛ばない）。
  右のバーの 🏠 は 島の外なら ひこうきで帰る、島の上なら 下の 2D の地図を開く。
- **e2e は `uspeak.net.main.homed` を待って `skipHome()`**（入ったときの場所＝U-Speak島に戻す）。
- 島にいた時間（`main:enter` / `main:leave`）は 3D の島に立っている間（1 秒ごとに見る）。
- **右上の ミニマップは 2D の地図と 同じ 絵**（`main-world.js` の `drawMap`：海・砂浜・草・入り江・道・さんばし・建物の床・
  色つきの丸に 絵文字・⭐ スタート・自分＝オレンジ）。座標は `90 + x*1.5`, `70 + z*1.5`（180×140）。場所を足したら `ICON` / `COLORS` も足す。

- **英検の つり場（2026-10）**：まんなかの さんばしの とちゅう（z 29）から 東西に 板の 道、そこから 級ごとの さんばしを 平行に（`main_island.json` の `eikenPiers` と spots の `kind: "eiken_pier"`）。
  **東（スタートがわ）から** 5級・4級・3級・（まんなかの つり場）・準2級・2級・準1級（2026-11 に 逆に した：はじめての 子が つかう 級を スタートの 近くに）。**さきの 戸口どうしを 10 以上 はなすため、さんばしは 長い・短いの こうご**（`end`。`tests/regression.mjs` の「overlap」）。
  水の 当たり判定は 歩ける 板（さんばし・板の 道・英検の さんばし）を のぞいた 水を 格子の 箱で うめる。板は 整数の 座標を ふくむ はばに（検査の 歩きが 整数の マスで 見る）。
  問題は サーバーの `game/eiken-pier.js`：英検の 形（問題DB の その級の よむ 問題、無ければ eiken-bank の 5・4・3級）と ことば（つり島の いけ・かわ・うみ、U-Speak島の つりの 準2・2級）を はんぶんずつ。
  準1級は 問題DB に 入れるまで「じゅんび ちゅう」。記録に `grade` と `eiken` が のるので ロードマップの 単語と 合格見込みが すすむ。魚は つり島の ゾーンの 魚。
- **ぜんぶの つり場の 待ちは 3D の うき**（`cast-fx.js`：さお・糸・うき・「！」・魚が はねる。つり島と 同じ 見た目）。メインの島は `main-world.js` の `startCast / bite / endCast / splash / chase / casting`、
  `fishworld.enter(spot, { stage: rpg.main })` で 使う（`flat` は 2D の 地図から ひらく ときだけ）。`game.js` の 肩ごしカメラと 一人称の 手は `rpg.main?.chase` / `rpg.main?.casting` も 見る。
- **お店の 外がわは `main-world.js` の `facade(kind, …)`**（2026-10）。どの家も island-kit の 同じ `house()` なので、屋根の 上の
  大きな しるし（スマホ・いなずま・本の 山・ピザ・ハンバーガー・Tシャツ・ブロックの 階段・家の 看板・さかな・ABC）と 戸口の
  両わきの 小物で「なんの お店か」を 見せる。**`D()`（まとめて 描く 箱）だけ**で 作る＝描く 回数は ふえない。
  戸口の 前（x ±1.4）と 道は あける。お店を 足したら `decor`（または kind）の case を 1 つ 足す。

### しまの ちず（2D）

`main-island.js` + `main-island.css` + `main_island.json`（Roblox のメインワールドの配置）/ `wordhouse.js` + `wordhouse.css`（英単語ハウス）。
サーバーは `server/src/game/wordhouse.js` と `ClassRoom` の `wh:*` / `main:*`、つり場は `fw:*` の `spot: "main"`。

- **3D の上に全面でかぶせる `<div id="main-island">`**（`<header>` は使わない：style.css の `header{position:fixed}`）。
  開いている間は `body[data-main]`。**3D は描かない**（`game.js` のフレームループが `net.main.isOpen` で早く帰る）が、
  BGM は止めない（同梱ゲームと違い、ここは島の中の画面）。
- **座標は main_island.json の x, z をそのまま**（`fx/fz` で frame を 0〜100%）。場所は大きい物だけ床（`.mi-foot`）を描き、
  全部に丸いマーカー（`.mi-poi`）。ラベルの向きは `SIDE`（近い物どうしがぶつからないように）。地図は横 1100px 以上で、はみ出す分は指でスクロール。
- **子ども向けの文は `COPY`**（main_island.json の `action` は作る人のメモ）。ゲートの行き先は `GATE_TO`、
  じゅんびちゅうの場所の「にている島」は `ALT`。リストのカードは world-picker と同じ `.wm-card`。
- **英単語ハウスの問題は `server/src/game/hut-quiz.json`**（Roblox の小屋の書き出しを `server/scripts/import-hut-quiz.mjs` で取りこんだもの・サーバーだけ）。
- **英単語ハウスの SUPER EASY ⇔ EASY は この端末に覚える**（`uspeak-wordhouse-easy-v1`）。部屋は届いた level を家ごとに確かめる。
- **つり場は 3D が無い**：`fishworld.enter({id:'main', zone:1}, {flat:true})`。flat のときは さお・うきの演出を
  ダイアログの中の池（`.fw-wait`）でやり、釣果の前に画面を閉じない。
- 検査は README の「メインの島」。

## おなか（空腹ゲージ・全島）と メインの島の 屋台（2026-10 追加）

- **2026-11：Web 版では おなかは へらない**（「どうぶつの森にも ない」）。サーバーの `food.js` の `HUNGER_ON`（`FOOD_HUNGER=on` か 検査の `FOOD_RATE_MS` の ときだけ へる）。ふだんは つなぐと まんぷく・まんぷくでも たべられる・`hungerOn:false` を 送る。
  ページは `#hunger.no-hunger`（🍗 の めもりを 出さず「🎒 もちもの」の 札だけ）・帯なし・はやさ 1・かばんの めもりなし。屋台と たべる（英語の なまえ）は のこした。下の 説明は へる しくみを もどす ときの ため。

`food.js` + `food.css`。サーバーは `server/src/game/food.js` と `ClassRoom` の `food:*`（保存は `food_json`）。

- **おなかは 0〜20 点**（右のバーの いちばん上に 🍗 10 こ。上の だんに「🎒 もちもの ›」の 札＝押すと かばん。横向きの 携帯だけ 1 だん）。**クラスに つながっている間だけ** 4 分に 1 点へる（80 分で 0。授業ストップ中は へらない。はじめは りんご 2 こ）
  （`RATE_MS`。welcome / 再接続で `resume`、切れたら `pause`）。家にいる間は へらない。
- **0 でも しなない。歩くのが おそく なるだけ**（`food.speedFactor()` が `net.speed()` に かかる＝どの島でも）。
- 屋台は メインの島の 3 つ（くだものや・スイーツ・のみもの＝`main_island.json` の spots の `kind: "food_shop"`）。
  戸口に入ると `food.openShop(shop)` → `food:open`（**部屋が 屋台の前か 確かめる**）→ メニュー → `food:buy`（部屋が コインを取る）。
  買った物は かばんへ。**たべるのは どこでも**（ゲージを おす → かばん → `food:eat`）。値段と ふえる量は サーバーの `SHOPS`。
- **少なく なったら 帯**（`#hunger-notice`。パソコン・iPad は 下の まんなか、スマホは 上）。0 の 間は 赤で 出しっぱなし
  「おなかが すいてるよ。ごはんを かって、あるく スピードを あげよう！」、3 割以下は クリームで「すいてきたよ」。
  ボタンは かばんに たべものが あれば「🎒 たべる」、なければ「🏠 かいに いく」（`onGoFood` → `main.goHome()`）。
  ✕ で その だんかいの 間だけ 消える。レース・ゲスト・2D の地図・ワープ・旅の 間は 出さない。
  （前は 1 回だけの トーストで、何が おきて おそいのか 分からなかった。）
- 食べ物の 英語の名前は 学習の中身（`translate="no"`、買う・たべるときに 英語で 読み上げる）。
- 横向きの携帯では ゲージと 🏠 を バーの 流れから 出して すぐ左に 固定（バーの 高さが 足りず 📹 が はみ出すため）。
- 検査は `server/test/food.test.mjs`（へりかた・とまりかた・たべる・屋台の前でしか 買えない）。
  e2e で へるのを 見るときは サーバーを `FOOD_RATE_MS=400` で 起こす。

## 持ち物（🎒）と メインの島の お店（2026-10 追加）

- **右のバーの 🎒🍗 を おすと 持ち物**（`bag.js`、`#bag-dialog`）。タブは たべもの・ふく・いえ・ブロック。中身は 部屋の `bag:get` → `bag:state`。
  たべもの＝おすと たべる（`food:eat`）、ふく＝おすと 着る／ぬぐ（`wear:put`）、いえ＝おすと「いえの しまに いどうしますか？」→
  `land:enter {from:'bag'}`（**かばんからは 位置を 見ない**。土地島の ⛵ は いままでどおり 位置を 見る）、ブロック＝見るだけ。
- **メインの島の ふくや・ブロックや・いえの おみせ**（spots の `wear_shop` / `block_shop` / `land_shop`）は、専用の島と 同じ 画面を 開く
  （`wardrobe.open()` / `town.enter({kind:'shop'})` / `land.enter({kind:'office'})`）。部屋は `atMainShop()` で、
  メインの島の ブロックや＝まちづくり島の `shop`、いえの おみせ＝土地島の `office` と 同じに あつかう。
- 2D の地図からは「おみせへ いく」で その戸口の 手前に つれていく（`toStall`）。
- **持ち物の 見た目は お店と 同じ 3D**（`bag-preview.js`）：上に えらんだ物が まわる プレビュー、下に 3D の 絵の カード。
  **WebGL は 増やさず 島の renderer を 借りる**（オフスクリーンに 描いて 読み戻す。借りたら 戻す）。カードの 絵は 1 物 1 回だけ 焼く、
  まわる プレビューは 1 秒 10 こま（読み戻しが 重い）。形は ふく＝`wardrobe-models.js`、いえ＝`buildIslandModel`、ブロック＝立方体、
  たべもの＝`foodModel()`（ここの ボクセル）。カードを おす ＝ えらぶ、プレビューの 下の ボタンで つかう（たべる・きる／ぬぐ・⛵）。

## メインの島の 英会話の お店（けいたいや・でんきや・ほんや・ピザや・バーガーや／2026-10 追加）

- `main_island.json` の spots の `kind: "talk_shop"`。英会話島の 家と 同じ形で `topics`（2 つずつ）を 持つ。
  **サーバーの `conv.js` が 英会話島の 家と いっしょに 読む**（`spot.home` が その家の 島。部屋は その島の 座標で「家の中か」を見る）。
- 戸口に 入ると いつもの 部屋（`island-interior.js`）。**内装は `shop-interiors.js` の `furnish(spot.decor)`**（バーガー・石窯・本だな・
  けいたいの たな・せんたくき…）で、当たり判定の 箱も 返す。まんなかの 通り道（x が -2〜2）は あけておくこと。
- 中の カウンターで E → `main.walkIn(spot)` → `conv.enter(spot)`（家そのものを 渡せる）。話す 相手は 英会話島と 同じ ウーピー。

## しまの ちず（Choose a World／2026-10 更新）

右の「✈ World Map」は **色つきのカードを並べた「Choose a World」**（Roblox のワールド選びと同じ形）。
前は海図（`rpg-map.js` の canvas）に島を置いていたが、島が 19 になって名前が読めなくなった。

- **U-Speak島（`willow`）の カードは 出さない（2026-10）。** メインの島と 橋で つながったので、メインの島の カードに「はしで U-Speak島へ」と 書き、U-Speak島に いる ときも メインの島の カードが「いま ここ」。id・`fly('willow')`・セーブは そのまま。光の 道も、行き先が U-Speak島で メインの島に いる ときは ✈ を 光らせず、船着き場（橋の たもと）に 光の 柱と 道を 出す（`task-guide.js` の `neighbours` / `bridgeEnd`）。
- **並べるのは `world-picker.js`、決めるのは `rpg.js` の `renderMap()`**（ひらいているか・とぶ・ずかんへ）。
  島（HUBS）が上、ぼうけんの ちいき（REGIONS）が下。押すと `fly(id)`、いまの島なら閉じる、
  ひらいていなければ「ひらく じょうけん」をトーストで。
- **絵と色は `world-picker.js` の `LOOK` に1行**。島を足したら ここにも足す（無ければ 🏝 と島の色）。
  名前は rpg-data.js の `en`（「Island」を落として短く）と `yomi`（無ければ `name`）。
- カードの日本語名は**どちらの言語でも出す**（参考の画面がそう）。島の名前は訳ではないので `translate="no"`。
- このあいだ `#rpg-dialog` は `data-page="map"` になり、**ダイアログの頭とタブは隠れる**（`world-picker.css`）。
  ほかの画面が中身を描きかえると `MutationObserver` が外す。ずかんへは下の「📖」から。
- `rpg-map.js` は もう画面に出ないが、`tests/regression.mjs` が島どうしが重ならない配置を検査しているので残してある。

## つり島（Roblox の釣りワールド／2026-10 追加）

`fishworld-island.js` + `fishworld.json`（島・魚 70 種・出やすさ。**問題は `server/src/game/fishworld-quiz.json`＝サーバーだけ**）/ `fishworld.js` + `fishworld.css`（画面）/
**`formats-core.js`（7 形式の問題部品・DOM なし・サーバーと共有）** / `formats-ui.js`（7 形式の見た目と操作）/ `dev-formats.html`（`/dev/formats`）。
サーバーは `server/src/game/fishworld.js`。

- **小屋はない。3 つの水辺＝3 つのゾーン**（★いけ 5 級＝池のさお置き場・★★かわ 4 級＝川岸の砂利・★★★うみ 3 級＝さんばし）。
  水は `fishworld.json` の `island.water`（池の楕円・川の中心線・さんばし）、うきの落ちる点は各 spot の `cast`。
  **戸口は無い**：**水辺に立つと すぐ さおを なげる**（`net.fishworldAuto()` を game.js が毎フレーム呼ぶ → `fishworld.enter(spot, {auto:true})`。
  つり場の ページ（つる／ずかん／うる）は 出さない。1 回 来るごとに 1 回で、はなれると また）。E /「🎣 ここで つる」も同じ。
  **ずかん と うる は 左下の 📖**（`.fw-dexdock`、つり島に いる間だけ。位置のいらない つり場 `main` で開く）。
  `tests/regression.mjs` のドア検査は つり島だけ空にしてある。
- **流れは U-Speak島の釣りと同じ**：「さおを なげる」→ **画面が閉じて島の上で さお・糸・うき**（`island.startCast`）→
  `fw:cast` → `fw:ask` が届いても **うきが しずむまで出さない**（`WAIT_MIN`、`island.bite()` で「！」）→ 問題 →
  正解でタイミングバー → `fw:reel {grade}` → `fw:catch` → **画面を閉じて 魚の写真が水から はねる**（`island.splash`）→ つれた！のカード。
  投げている間は歩けない（`game.js` の `menus` に `rpg.fishworld.casting`）、カメラは肩越しに うきを見る（`island.chase`）。
- **水は当たり判定が形**（`fishworld-island.js` の `blocked`）：池は楕円、川は中心線からの距離。箱で囲むと斜めの川岸に立てない。
  池の上の さお置き場と 川の橋の上だけは歩ける。
- **問題を足すときは `formats-core.js` の build / public / check を足す**（画面と判定が同じ関数）。`publicFormat` は答えを抜く：
  mc は選択肢の中に答えがあるが、match は `pairs` を出さない、spell / type は `word` を出さない。
- **学習の中身は `.fmt-learn` / `.fw-learn`**（`i18n-dom.js` の `LEARNING`、`translate="no"` も付けてある）。英単語・意味・魚の名前は訳さない。
- `formats-ui.js` の type は `window` の keydown を取る（`destroy()` で外す）。画面を閉じるときは必ず `ctl.destroy()`。
- **魚の絵は `assets/fish/<photo>.jpg`**（U-Speak島の釣りと同じ写真）。`fishworld.json` の各魚の `photo` が名前で、
  サーバーの `fishPayload` がそのまま渡す。`server/test/fishworld.test.mjs` が「全部の魚に写真のファイルがあるか」を見る。
  `emoji` は写真が無いときの予備。

## 左の「つぎに やること」（タスク／2026-10）
- **中身は /admin/tasks の「はじめの100」**。ページは `tasks.js` + `tasks.css` で 3 つ ならべるだけ。すんだか・コイン・XP・章の ごほうびは 部屋（`server/src/tasks/engine.js`・`ClassRoom.taskRun`）。
- 行の「完了の しらべかた」（check 列）：`near:<メインの島の 場所>` / `<できごと>:<数>` / `$<数字>:<数>`。読めない 行は 出さない。
- ページにしか 分からない こと（画面を ひらいた・話しかけた）は `task:ui {name}`。名前は engine.js の `UI_EVENTS` だけ。
- 置き場所は `.quest-panel` の いちばん 上。U-Speak島以外（`.on-errand-island`）は 入れ物ごと 出して カードだけ。
- はじまりは メインの島（つなぎはじめに `homeNow()`）。
- **光の道（`task-guide.js`）**：いちばん 上の タスクの 行き先（部屋が 送る `go = {island, spot?}`、`engine.js` の `goOf`）へ、足もとから 矢じるしを 道（main_island.json の roads）に そって 流し、光の柱（`rpg.main.setTarget`）を 立てる。
  行き先が ほかの 島なら 右の ✈ と 下の 3 を 光らせる（`.task-glow`）。出すのは 1 章は いつも、2 章からは 30 秒 すすまない ときだけ。カードの「🧭 みちを けす／出す」は `uspeak-task-guide-v1` に 覚える。
  つぶの 高さは 地面（y=0.2）＋道の タイルより 上（0.4）。それより 低いと 道に かくれて 見えない。
- **スキップ（2026-11）**：カードの「⏭ スキップ」（2 回 おして きめる）→ `task:skip {id}`。部屋が `tasks.skipped` に 入れて かくす だけ（**すんだ ことには しない・コインも XP も 出ない**。見えて いる タスクだけ・1 秒に 1 回）。
  スキップが のこる 章は ごほうびを 出さない（`engine.js` の `settle`）。「↩ スキップした ○こ を もどす」＝`task:unskip` で ぜんぶ もどる（もどして すませば 章の ごほうびも 出る）。
- サーバーの テスト（node --test）では タスクを 切る（ほかの 検査の コインが ずれる）。タスクの 検査は `TASKS=on`。
- **宿題の ピン（2026-10）**：先生が くばった 宿題が のこって いる 子は、カードの 1 わくめが 宿題（`engine.js` の `homeworkPin`：しめきりを すぎた もの → ちかい もの → しめきり なし の 1 つ）。アクティビティは 1 つ へらして 下の 小さい 一覧に（ならぶ 数は 3 の まま。`ClassRoom.taskRules` が settle にも 同じ 数を わたすので 見えない タスクは すまない）。
  宿題が ない 日は いままでどおり あそびの タスクだけ（やらされ感を ふやさない）。「はじめの100」を ぜんぶ おえても 宿題は 出る。先生には 出さない。「▶ しゅくだいを する」で 宿題の 画面が ひらき、光の 道は しゅくだいの いえへ。
  とどく とき：入室・宿題の 1 問ごと・おわり・1 分ごとの 見なおし（先生が くばった とき）。しめきりを すぎても 赤で せめない（オレンジ）。
  考えかた：Khan Academy（先生の 課題を しめきり順で 上に）・Prodigy（先生の 課題を ゲームの 中に）・自己決定理論（えらべる 感じを のこす）。ロードマップは 長い 目標の まま 右に（宿題の 答えも roblox_events の quiz なので ロードマップに かぞえる）。

## クラスコードが ないと 入れない（ひとりで あそぶ＝オフラインは 2026-10 に なくした）
- ロビーに「ひとりで あそぶ」は ない。なまえ と クラスコード の 両方が いる（`lobby.js`）。部屋も クラスコードが からっぽ（`sanitizeClassCode` が `default` に する もの）を 4007 `class required` で ことわる（`ClassRoom.onAuth`）。
- つながって いない あいだは いつも ロビー（`cancel` を 止めて あるので Esc でも とじない）。つなぎなおしに 失敗・ログアウト・つうしんの ぶひんが ない ときも ロビー。クラスを でるのは `leaveClass()` だけ（前の `goOffline` と `offline-pass.js` は 消した）。
- 右下の つうしんの 札は、つながって いる ときは 押しても なにも しない（でるのは ⏏）。
- ゲームの 中の「オフラインでも うごく」分かれ道（`state.mode === 'online'` の 外がわ）は そのまま のこって いるが、ロビーを とおらないと 島で 遊べないので 使われない。消すなら べつの 変更で。
- 検査は `server/test/admin.test.mjs` の「クラスコードが ないと 入れない」。

## プレミアムの 島（英会話島・みんなで はなす しま・英検の 島・英会話の お店／2026-10）
- **admin の 名簿（/admin）の「プレミアム」列が true の 人だけ**（先生も 同じ） 入れる（英会話島・みんなで はなす しま・英検の 3 島・メインの島の 英会話の お店 5 けん）。CSV・Google シート・はりつけ でも `premium`（または `プレミアム`）の 列。
- 部屋（`ClassRoom.lockedIslands`）が welcome と `premium` で `locked`（島の id）を おしえる。名簿を かえると 入ったままの 子にも 1 分以内に とどく（`recheckRole`）。
- 画面は `rpg.setPremiumLock()`：しまの ちずの カードに 🔒 と ⭐ プレミアム、とぼうと すると「🔒 プレミアムの しまです」。右の 📹 も「🔒 みんなで はなす しま」。
- 守るのは 部屋：英会話島の 家の `conv:start` と みんなで はなす しまの `voice:join` は `premium` で ことわる。メインの島の 英会話の お店は 入れる。
- **オフラインでは プレミアムの 島を いつも しめる**（`net-client.js` の `lockPremiumOffline()`。`connecting` の 間も）。名簿を 知って いるのは サーバーだけで、採点・AI・通話も サーバーが いないと うごかないため。いま その 島に いたら メインの島へ。お知らせは「クラスに はいって いる ときだけ 行けるよ」。
- 入れない 島の タスクは とばす（`engine.js` の `skip`）。**おはなし島は 2026-10 に「みんなで はなす しま」に 名前を かえた**（id は `talk` の まま）。

## 宿題（/admin/homework → しゅくだい島 → 保護者レポート／2026-10）
- **先生が 入れる → AI か きまりで 読みとる → 先生が たしかめて「くばる」→ 子どもが しゅくだい島で 7 形式で とく → 部屋が 判定 → 保護者レポート。**
  **くばるまで 子どもには 出ない**（AI は 答えを まちがえる ことが ある）。問題（答えつき）は `DATA_DIR/homework.json` だけ（`server/src/homework/store.js`）。client/dist にも リポジトリにも 置かない。
- **入れられる 形式**（`server/src/homework/files.js`）。形の きまった ものは AI を 通さない（答えが 1 字も かわらない）：
  CSV・TSV・Excel(.xlsx)・.ods／Kahoot の テンプレート・Blooket の CSV・Quizlet（ことば ⇥ 意味）・列の 名前（英語・日本語・英文・あな・形式・まちがい）／Moodle の GIFT・Aiken・Moodle XML／JSON。
  形の ない ものは AI（`extract.js`。`OPENAI_API_KEY`、モデルは `OPENAI_HOMEWORK_MODEL` で かえられる）：写真（JPEG・PNG・WebP・iPhone の HEIC は 画面が JPEG に して 送る）・PDF（そのまま わたす。文字の 層は `pdftotext` でも 読む＝Dockerfile に poppler-utils）・Word(.docx)・PowerPoint(.pptx)・.odt・テキスト。
  キーが ない ときは きまり（`parseRules`：「apple = りんご」「I (play) soccer.」「I ( ) tennis. [play, run]」「英文 訳」）。古い .doc/.xls/.ppt は ことわる。zip は 自前（`unzip()`、依存を ふやさない）。
- **7 形式への ふりわけは `items.js`**：形を 書いて いない ことばの 行は えらぶ・つづり・きいて えらぶ・タイピング・せんつなぎ に まぜる（`assignKinds`。できない 形は とばす）。英文＋訳＝ならべかえ、あなの ある 文＝あなうめ、問題文＋選択肢＝問題文つきの えらぶ（`prompt` / `answer`）。
  `problemOf()` が「出せない 理由」を 返し、admin の 表で 赤く なる。出せない 問題が 1 つでも あれば くばれない。出題の たびに formats-core の build* で 作りなおし、判定も `checkFormat`（つり島と 同じ `answer()`：1 回 まちがえたら もう 1 回）。
- **部屋**（`ClassRoom` の `hw:list` / `hw:start {aid, redo}` / `hw:answer` / `hw:next` / `hw:quit`）。1 回目で 正解＝○、答えを 見てから・2 回 まちがい＝×（「まちがえた ところを もう いちど」で ○ に なる）。
  1 問 3 XP、はじめて ぜんぶ おわったら 20 コイン（1 日 60 まで、caps の `homework`）。**上限の 日に おえた 宿題は「はらった」に しない**（`payHomework`）ので、つぎに 一覧・宿題を ひらいた ときに はらう（`payOwedHomework` → `wallet`）。記録は 学習ログ（`hw-<形>`）と `robloxEvent('quiz', 'homework', {level:'Homework', format, word})`＝苦手単語の 復習・先生の /class にも のる。
  welcome の `homework`（のこりの 数）で 1 回 おしらせ。**とちゅうで やめた 宿題が あれば** welcome の `homeworkResume`（いちばん 新しく さわった もの）で「📚 まえの つづき ○/○ もん つづける →」の カード（`homework.offerResume`・30 秒で きえる）。おすと その場で つづきから（しゅくだい島へ 行かなくて いい）。
  **保存**：1 問 おえる たびに `DATA_DIR/homework.json` に 書く（とちゅうで ぬけても・サーバーが 再起動しても のこる）。書きこみは `store/write-json.js` が 同じ ファイルごとに 1 本ずつ 順番に する（前は 同時に 答えると 同じ 一時ファイルを 2 つが 書いて こわれる おそれが あった。ロードマップ・教室・タスク・問題DB も 同じ）。
- **admin の 一覧は クラスごと**（`/admin/homework` の「クラス」。名簿の クラスと 宿題に 書いた クラスを `classKeyOf` で そろえて ならべる）。えらんだ クラスは この ブラウザに 覚え（`uspeak-admin-hw-class`）、新しく 読みとった 宿題の クラスにも 入る。**クラスは かならず**（`store.js` の create/update/publish が クラス なしを ことわる・admin でも 止める）。宿題は 書いた クラスの 子にだけ 出る（`forClass` は クラスが 入って いる ものだけ。前の「クラス なし＝全員」は もう ない）。クラス なしの 古い 宿題は 一覧の「⚠ クラスが きまって いない」に 出るので「なおす」で クラスを 入れる。
- **しゅくだい島**（`homework-island.js` + `homework.json`、HUBS の `homework`）：いえ 1 けん（戸口で `homework.open()`）・黒板・本の 山・えんぴつ。画面は `homework.js` + `homework.css`（一覧 → 1 問 → おわり）。オンラインの ときだけ。
- **宿題の 画面（運営 /admin/homework と 教室 /teacher/homework で 同じ・2026-10 作りなおし）**：`server/src/homework/page.js`（形と CSS）＋ `page-client.js`（動き・ふつうの JS を そのまま 入れる）。
  はじめての 先生にも わかる ように（Google Classroom・Seesaw・Kahoot・Wordwall・Blooket・NN/g の 調べ）：タブで「✏️ つくる」と「📋 くばった 宿題」を わける。つくるは 3 ステップ（① 入れる → ② たしかめる → ③ しめきり・くばる）、1 ステップに 大きな ボタン 1 つ・下書きは 小さな リンク。
  ① は 大きな ドロップ・「ファイルを えらぶ」「写真を とる」・はりつけと ほかの アプリ（Kahoot など・CSV の ひな形）は たたむ・🧪 サンプルで ためす。② は「AI が 読んだ ので たしかめて」の 帯・ゲームの 形 7 つを 絵の ボタンで まとめて かえる（できない 問題は そのまま）・赤い 問題だけ なおす・👀 せいとの 画面で みる（`POST /homework/preview` → formats-ui で 子どもと 同じ 画面・○× も ためせる・記録なし）。
  ③ は しめきりの かんたんボタン（あした・3 日ご・1・2 しゅうかんご・なし）と まとめ。一覧は 状態の 札（下書き・くばっています・しめきり すぎ）・はじめた／おわった 人の バー・消すは「… ほか」の 中で **10 秒 もとに もどせる**（はじめた 子が いる ときだけ たしかめる）。字は 16px・ボタンは 48px 以上。
  **使い方の 動画**（`assets/guide/teacher-homework.mp4`・1 分・実際の この 画面の 録画に 字幕）：右上の「❓ 使い方の 動画」と、はじめての 人には ① の 上の 案内（とじると この ブラウザでは 出ない）。章（① 入れる・② たしかめる・③ くばる・④ すすみぐあい）で とべる。撮りなおしは `server/test/e2e/capture-teacher-video.mjs`。
- **英会話教室の 先生の 画面 `/teacher/homework`**（運営の /admin とは べつ・`server/src/classroom/teacher.js`）：教室の **パスワード 1 つ** で 入る。パスワードで 教室（＝クラスコード）が きまり、その 教室の クラスの 宿題だけ 見えて・作れて・くばれる（クラスコードは 入れない。1 クラスの 教室は 欄も 出ない）。どの クラスを さわれるかは サーバーが きめる（`mountHomeworkApi` の scope。よその 宿題は 403、ほかの 教室と まざった 宿題は 見るだけ）。読みとり（AI）は 1 教室 1 時間 40 回まで。
  - パスワードの 表は **`/admin/classrooms`**（運営だけ。列：教室の 名前・クラスコード・パスワード）。
  - **👥 アカウント（2026-11）**：教室の 行の「👥 アカウント」で、その 教室の クラスごとの 名簿の 子と クラスの ない 子が ならび、クラスを えらびなおせる（`GET /admin/api/classrooms/accounts?room=`＋ いつもの 名簿の 口 `PUT /admin/api/roster` で「クラスコード」列だけ 書きかえ）。**記録は クラスコード＋なまえ で のこる**ので、口は 行ごとに `hasRecord`（いまの クラスに 記録が ある）・`recordIn`（クラスの ない 子は どの クラスに ある）を 返し、画面は うつす 前に「はじめから に なる」と たしかめる。子どもの 画面は かわらない。検査：`server/test/classroom-accounts.test.mjs`。パスワードは のこさず HMAC（REPORT_SECRET）だけ 保存（`DATA_DIR/classrooms.json`）するので、作った ときに 1 回だけ 見える。かえると 前の ログインは 使えなく なる。教室ごとに ちがう パスワード・1 クラスは 1 教室だけ・8 文字 以上。
  - **保護者レポート（QR カード）は べつの ページ `/teacher/reports`**（宿題画面の 右上「📨 保護者レポート・QR →」）。その 教室の クラスごとに `/class/<クラス>/parents?t=…`（QR カードの 印刷・登録・先生の ひとこと）と `/class/<クラス>?t=…`（教室の ようす）を `signClass(REPORT_SECRET)` で 作って わたす。よその クラスの リンクは 作らない。
  - 検査：`server/test/classroom.test.mjs`。
- **保護者レポート**：`report.homework`（`homework.listFor`）を `homeworkBlock()` が「宿題（n / m おわり）」として 出す（その 子の ぶんだけ）。1 人ぶんの 削除（privacy.js・erase-student.mjs）でも 消える。
- **LINE の 週・月 レポート**：`homework.periodSummary(クラス, 名前, 期間)`（提出・しめきりまでに・おくれて・しめきり すぎ・答えた 数・正解率・1 回で 正解・やり直し・時間・日数・形ごと・まちがえた ことば・宿題ごとの 行）を `service.js` の dataFor が `d.homework` に 入れる。画像（1 まいめ）に 1 行（`homeworkLine`）、PDF の 2 まいめに くわしく（`homeworkPage`・テンプレートの `{{{ homeworkPage }}}`）、LINE に 吹き出し 1 つ（`line.js` の `homeworkText`）、通知の 文に 件数。**名前は Web の 名前**（Roblox の 子は `roblox.childFor` で ひく）。
  毎週版の 1 まいめは 入りきらない ときだけ ぜんたいを 小さく する（`weekly.tex.j2` の `\bodybox`。LINE の 画像は 1 まいめだけ なので、あふれた 分は 見えなく なる）。
- 検査は `server/test/homework.test.mjs`（読みとり・各形式・7 形式の 判定・くばるまで 出ない・部屋の 流れ・コイン 1 回・やりなおし・レポート）。

## パソコンの 右がわを 1 つの 列に（`pc-tidy.css` / `pc-tidy.js`／2026-10）
- **マウス・幅 1001px 以上だけ**（タッチの 端末は mobile.css の まま）。`.right-rail.pc-tidy` を 2 列の grid に して、`.top-dock`（おなか・🏠・ランキング・ロードマップ）を 地図の すぐ下へ うつす（`display: contents`）。
- 「しまの ちず」（#flight-button）は ホットバーの 3 と 同じ なので 右からは けす。ひるま・カメラ・え・けしき は「⚙ みえかた」の 中（`body.pc-view-open`）。
- 上の バーの おと・あそびかた・ログアウト は「⋯」の 中（phone-menu.js の `body[data-more]` を そのまま 使う）。WASD の ヒントは うごいたら（20 秒で）きえる（`body.pc-moved`）。
- 右の 列に ボタンを 足したら pc-tidy.css に `order` と 絵（`::before`）を 1 行。

## 🗺 ロードマップ（A・B・C・1〜9 の 12 段階／2026-10）
- **計算は `server/src/game/roadmap.js` の 1 か所**（保存は `server/src/roadmap/store.js`＝DATA_DIR/roadmap.json、窓口は `roadmap/service.js`）。入力は roblox_events（Roblox と Web の 両方）＝保護者レポートと 同じ 箱。
- 段階：A・B・C＝英検Jr. BRONZE・SILVER・GOLD くらい、1・2＝5級、3・4＝4級、5・6＝3級、7＝準2級、8＝2級、9＝準1級。名前・中身・単語・はじめの 段階は **/admin/roadmap**（クラスごと、`*` は 既定）。
- **進む 条件**：その 段階の 単語の 8 割を 覚えた（2 日以上に 分けて 3 回 つづけて 正解＝`aggregate.js` の masteryTimeline）＋ **その 段階に 入ってから** その 級の クイズ 20 問 以上・正解率 8 割（はじめての 答えだけ）。8 割は 英検Jr. の「80% で 次の グレード」と 同じ。
  1 問の 級は `gradeOfEvent`（data.grade → つり島の zone → 英単語ハウスの level → 単語の 段階 → level の 文字）。
- **単語は ゲームで 実際に 出る ことばから**（出ない 単語を 条件に すると 進めない）：A〜C＝ことばの ジムの 絵の ことば（英単語ハウス SUPER EASY）、1〜6＝つり島の いけ・かわ・うみ と U-Speak島の つり、7〜9＝U-Speak島の つり（準2・2級）＋ 問題DB の 1 語の 答え（`setQbankWords`、80 語まで）。admin で 単語を かえるときも 出る ことばに。
- **段階を 上げるのは サーバーだけ**：部屋は `rm:get` と 10 問 ごと・入室 8 秒後に 見て、みたせば 1 段階 上げて `rm:up`（コイン `STAGE_COINS`＝100、1 段階 1 回＝store の `paid`）。先生が /class で かえても コインは 出ない。Roblox は `GET /api/roadmap/:username`（X-USpeak-Key）で 同じ 計算（上がれば コインは Roblox の さいふへ）。
- **英検の 合格見込み（`passChance`）**：協会の 公開情報（一次の 問題数・CSE は 技能ごと 同じ 満点・「2 級 以下 各技能 6 割 程度、準1級 7 割 程度で 多くが 合格」）＋ その子の その級の 正解・不正解（ベータ分布）。英検の 形（英検の島・`eiken: true`）が 1 技能 10 問 あれば それだけ、なければ 単語クイズも（`basis: 'all'`）。作文・面接は 入れない。「あと ◯ 問ずつ」「正解率を ◯% に」は `planFor`。**合格の 約束では ない と 画面にも レポートにも 書く。**
  英検の島・きょうの5ふん の 答えは `ClassRoom.eikenEvent` が roblox_events に 書く（やさしい 判定と 話すは 書かない）。
- おすすめの 場所は `placesFor`（級 × いちばん 弱い 力）。画面の「いく」は `rpg.fly(island)`、苦手単語の 復習は `review:start`。
- 画面：`roadmap.js` + `roadmap.css`（右の バーの「🗺 Roadmap ロードマップ」、オンラインだけ。スマホは ☰ の 中の 🗺️）。英語を 大きく・日本語を 小さく 両方 出すので 入れ物は `translate="no"`（lang.json に 入れない）。
- 先生：/class の「🗺 ロードマップ」（段階・次まで・今週の 学習日・英検の 見込み・段階を かえる）。保護者：web レポート（`roadmapBlock`）・PDF（report-tex）・LINE（画像の 1 行・PDF の 2 まいめの カード・吹き出し `roadmapText`）。
- 検査は `server/test/roadmap.test.mjs`（条件・見込み・保存・API・レポート）と `roadmap-room.test.mjs`（部屋・コイン 1 回）、レイアウトは screens.mjs の `roadmap`。
- **2026-10 の 見なおし**（mastery learning・Khan Academy の 習熟・Duolingo の 単元・英検 Can-do・すぐ 先の 目標＝Bandura & Schunk・goal-gradient）：
  ① 正解率は **さいきんの 30 問**（`QUIZ_RECENT`。前は 段階に 入ってからの ぜんぶで、10/20 だと 30 問 つづけて 正解が いった）。8 割・20 問・単語の 覚えた の 決まりは そのまま。
  ② 段階ごとの **めざす こと**（`cando {en, ja}`・英検の Can-do リストの 考えかた）を 画面・段階アップ・LINE の 文に。
  ③ 単語の とちゅうの **スタンプ**（`checkpoints` 25・50・75%。はじめて とった ときに 1 回 おしらせ・この 端末の `uspeak-rm-stamps-v1`）。
  ④ **つぎは これ を 1 つだけ 大きく**（`places.list[0]`・`.rm-go-top`）、のこりは「ほかの ばしょ」。⑤ 話す の 力は その 段階に 入ってからの 数。
  ⑥ **わすれかけ**：覚えた 単語でも さいごの 正解から 45 日（`FADE_DAYS`）あくと 覚えた に かぞえない（1 回 正解で もどる）。
  ⑦ **前の 段階の 見なおし**：前の 段階で 覚えて 45 日 あいた ことば（`refresh`）が 3 つ 以上なら「🔁 わすれかけの ことば」が いちばん 先。`review:start {refresh:true}` で 部屋が その ことばを 出す（どの ことばかは サーバー）。
  ⑧ **とびきゅう**：単語 8 割 ＋ この 段階に 入ってから 10 問 以上・9 割（`FAST_N` / `FAST_RATE`）なら 20 問を 待たない（先生が もどした あとも 0 から なので、すぐ こえない）。
- **画面（2026-10 作りなおし・宇宙の 旅）**：`hero()` の 上に 研究ごとの 説明。つぎまでの 輪（goal-gradient）・🚩スタートは さいしょから ✓（endowed progress）・きょうの 1 歩 と 大きな ▶（すぐ 先の 目標）・1 本の 旅の 道（Duolingo の path。つぎの 段階は 霧の 中で めざす ことだけ）・できる ように なった ことの コレクション（自己効力感）・くわしい 数字と 英検は「くわしく」の 中。
  その 2：スタンプは 輪と 同じ ものさし（`progressOf`）・「あと ◯% で 🎖」・ゴールの ごほうび 🎁（◈100・🏅）・バッジ 12 まいの わく（とった・いま ❔・🔒）・今週の ★ 7 つ・輪は ひらくと 0 から のびる（`@property --p`）。
  「つぎは これ」は その 場所の 戸口の 前へ **ワープ**（net-client.js の roadmap の `go`：プレミアム・ひらいて いない 島は とばない）。
  `.rm-head` は `<header>` なので、`position: relative` に するときは `inset: auto`（style.css の header の top/left が 効いて ずれた）。道を 中央に よせるのは `scrollLeft`（scrollIntoView は ダイアログ ごと ずらす）。

## ランキング（あらゆる 指標／2026-10）
- **中身は `server/src/game/rankings.js` の 1 か所**（`METRICS`：今週の XP・ぜんぶの XP・レベル・せいかい・せいかいりつ（20 問から）・学習時間・学習日・連続ログイン・コイン・さかな・ずかん・フレーズ・おつかい・タスク・じぶんの島・ベストラップ・5 技能）。行を 足せば ぜんぶに 出る。
- 先生と 0 の 子は ならべない。同じ 数は 同じ 順位。保存の 行から 毎回 計算（ランキングの 表は 持たない）。
- ゲーム：右の「♛ ランキング」→ `rank` → 部屋が 入って いる 子を 保存してから クラス全員を ならべて `boards`（上の 10 人＋じぶん）。画面は `daily.js` の タブ。
- 保護者の web レポートと PDF：**その 子の 順位と 人数だけ**（`standingOf`。ほかの 子の 名前と 数は 出さない）。先生の /class：指標ごとに 上の 3 人（`classRankingHtml`）。
- LINE の 週・月 レポート：その 期間の Roblox の 記録で 教室の 子どうし（`aggregate.js` の `periodStats` / `periodRanks`）。よい ほうから 2 つを 画像に、1 つを 通知の 文に。
- **ゲームの ランキング画面は「宇宙」（2026-10 作りなおし・`daily.js` の onRank・`rank.css`・`#daily-dialog.cosmic`）。** やる気の 研究（ランキングの 下の 子は やる気を なくす・幼い 子は 前の じぶんと くらべる・すぐ 上の 目標が 効く・週の リセット・きょうりょく）に そって：
  ① いちばん上は じぶんくらべ（`self`：今週の XP・先週より ▲・じこベスト・**宇宙の 段階**＝今週の XP だけで きまる 6 段 `TIERS`・さがらない・だれとも くらべない）、② クラス みんなで ワープ（`classGoal`：今週の XP の 合計 ÷ 1 人 `GOAL_PER_KID`）、
  ③ 指標ごとに 表彰台（上の 3 人・名前だけ）と「きみの まわり」（`near`：上 2・じぶん・下 1、**ほかの 子の 数は 送らない**）と「あと ○ で △ さんに おいつく」（`gap`・`ahead`）。
  **下がった ことは 見せない**（前に 見た 順位より 上がった ときだけ ▲。この 端末の `uspeak-rank-seen-v1`）。あたらしい 段階に 来たら 1 回 お祝い。指標に「🚀 のびた XP」（今週 − 先週）を 足した（はじめたばかりの 子も 1 位に なれる）。
  週ごとの XP は 列 `week_hist_json`（さいきん 12 週）。
- 検査は `server/test/rankings.test.mjs`。

## よみもの島（多読・えほん／2026-11）
要件は `docs/reading-island-spec.pdf`（Raz-Kids の しくみを 参考に、中身は ぜんぶ オリジナル）。
- **島**：`reading-island.js` + `reading.json`（HUBS / ACTIVITY_HUBS の `reading`・としょかん 1 つ・戸口で `reading.open()`）。しまの ちずの「おすすめ」に 入れた（6 まい）。
- **本は サーバー**：`server/src/game/reading-bank/<id>.json`（1 冊 1 ファイル：本文・日本語・絵の 場面・ことば・クイズ 5 問）。いま 36 冊（12 段階 × 3）。
  **クイズの 正解は ページに 来ない**（`publicBook` は クイズを ぬく。1 問ずつ 選択肢だけ・答えた あとに 正解）。たしかめるのは `node server/scripts/check-reading-bank.mjs`。
- **レベル＝ロードマップの 段階**（A・B・C・1〜9）。棚は いまの 段階＋ 1 つ 下（かんたん）＋ 1 つ 上（ちょうせん）。先生は どの 段階も 見られる。
- **1 冊**：👂 きく（`playVoice` の `onstart(audio)` で 再生の 時間を 見て ことばを 光らせる）→ 📖 よむ（ことばを おすと 発音と いみ）→ 🎤 こえに だす（音声認識の 文字を 部屋へ・正確さと 1 分の 語数は 部屋）→ ❓ クイズ（1 画面 1 問・ぜんぶに 🔊）。
  ✓＝きく・よむ・クイズ 8 割（音読は ★ だけ：マイクの ない 端末でも ✓）。★ は 4 つまで。✓ で 20 コイン（1 冊 1 回・1 日 80 まで）。
- **絵は サーバーが かく（2026-11・`server/src/game/reading-art/`）**：本の JSON は「場面」（背景 1 つ＋絵文字の 登場人物：位置・大きさ・うごき）の まま。
  `render.js` が それを 1 まいの SVG（800×600）に する：`backgrounds.js`＝4 そうの 背景 20 まい（＋よるの はまべ）、`people.js`＝**体の ある 人物**（人の 絵文字 35 しゅるい。
  同じ 本の 同じ 人は 同じ 見た目・子どもより 大人が 高い・顔の 絵文字（😢 😲 など）は 近くの 人の 気持ちに うつして 消す）、顔だけの どうぶつ（🐻 🦊 🐰 …）と 🤖 は 体を かく、
  小物は `emoji/` の Twemoji（CC-BY 4.0・フォントに たよらない＝古い 端末でも 四角に ならない・本だなに クレジット）。場面に ☀️ 🌙 が あれば 背景の 太陽・月は かかない。
  口は `/reading-art/<本>/<ページ>.svg`（0＝表紙・`?still=1`＝うごかない・`?v=ART_VERSION` で 1 年 キャッシュ）。**画像生成の API は 使わない（お金 0）**。1 まい 0.1ms・平均 16KB。
  ページは `<img class="rd-art">`（`artHtml`）。読めなければ 前の 絵文字の 場面（`sceneHtml`）に もどる。本だなの 表紙は「色の 表紙＋題名＋絵」（`.rd-cover` / `.rd-ct` / `.rd-cpic`）。
  新しい 絵文字を 本に 使う ときは `emoji/` に その SVG を 足す（`check-reading-bank.mjs` が「かけない 絵文字」を 教える）。かき方を 変えたら `reading.js` の `ART_VERSION` を 上げる。検査は `server/test/reading-art.test.mjs`。
- **記録**：`DATA_DIR/reading.json`（`server/src/reading/store.js`）。クイズの 答えは 学習ログ（mode `reading`）と roblox_events の quiz（world=reading・その 段階の 級）＝ロードマップ・英検の 見込み・保護者レポートに のる。音読は mode `speak`。録音は のこさない（文字の 判定だけ）。
- 画面は `reading.js` + `reading.css`（`#reading-dialog`・入れ物は `translate="no"`・説明は `.en`/`.ja`）。検査は `server/test/reading.test.mjs`。
- まだ：先生が 本を 宿題で 出す（3 ステップ配信）・/class の 列・LINE レポートの「よんだ 本」・幼児モード。

## えほんの 宿題・レポートの 数字 5 つ・進み具合の バー（F10・F9・F6／2026-11）
- **えほんの 宿題**：宿題に `book`（よみもの島の 本の id・`items` は 空）と `students`（名前の 一覧・空＝クラス ぜんいん）が 足せる（`server/src/homework/store.js`）。
  子どもに 出るのは `forStudent(class, name)`（`listFor`・`periodSummary`・部屋の `hw:start` も これ）。**その 本が ✓ に なると おわり**（`markBookDone`：部屋の `onRead` の `hwBook()`。
  くばる 前に ✓ だった 本は `hw:list` の ときに おわりに する）。宿題に 出た 本は **棚の 外（±1 段階より 遠い）でも ひらける**。ごほうびは ふつうの 宿題と 同じ（`payHomework`・1 回）。
- **先生の 画面**（/teacher/homework・/admin/homework）：タブ「📚 えほんを くばる」＝ **えらぶ → 生徒を えらぶ → おくる**（`server/src/homework/book-client.js`・page.js が page-client.js の あとに 入れる）。
  口は `GET /homework/books`（段階ごとの 本・答えなし）と `GET /homework/students?class=`（名簿の 子ども。教室の 先生は その 教室の クラスだけ＝403）。
- **子どもの 画面**（`homework.js`）：えほんの カードは 表紙（`/reading-art/<id>/0.svg?still=1`）と「よむ →」。おすと `reading.openBook(id)`（`reading.js` が 出す）。部屋が `hw:book` を 返した ときも 同じ。
- **/class**：「📚 よみもの島」の 表（よんだ 本 ✓・よんだ 語数・さいごに 読んだ 本）。`ReadingStore.summaryOf` と `server/src/reading/pages.js` の `readingClassHtml`。`?format=json` の `reading`。
- **数字 5 つ**（学習時間・話した 回数・読んだ 本・クイズの 正答率・覚えた 単語）：週・月は `parent-report/aggregate.js` の `fiveNumbers`（roblox_events の session・speak・book・quiz。**前からの 決まりの まま**：
  正答率は はじめての 回答だけ・20 問 未満は 出さない、覚えた 単語は 2 日ルール）。`weeklyData` / `monthlyData` の `five`。出る 場所：LINE の 画像（`render-tex.js` の `fiveLine`・1 行）、
  LINE の 吹き出し（`line.js` の `fiveText`。**吹き出しが もう ある ときだけ** 上に 足す＝通数を ふやさない）、保護者の 専用ページ `/r/<合言葉>` の いちばん 上、web の `/report/<クラス>/<名前>` の いちばん 上
  （こちらは はじめてからの 合計：study_ms・chats・よみもの島の ✓・correct/attempts・ロードマップの `mastered`）。HTML は `reading/pages.js` の `fiveHtml` / `booksHtml`。
- **進み具合の バー**：`game/roadmap.js` の `progressBar(v)`（割合は ロードマップの 輪と 同じ 式・「あと」は 上がる 条件の のこり。新しい 決まりなし）。出る 場所：web レポートと 保護者ページの 上（`barHtml`）、
  ロードマップの 画面（`roadmap.js` の `stageBar`・`.rm2-bar`）。LINE の カード（`roadmapFlex`）には 前から バーが ある。
- 検査：`server/test/homework-book.test.mjs`（生徒を えらぶ・✓ で おわり・棚の 外の 本・先生の API）、`server/test/report-five.test.mjs`（数字・文・組版 1040×1300・バー・HTML・/class）。

## ぶきや（メインの島・100 本／2026-11）
- **品は `weapons-data.js`**（形 10 × 素材 10）。`fishing-data.js` の ITEMS に `kind: 'weapon'` で 足すので、値段と 買う 判定は サーバーの `economy.js`（表の 値段）。ページの 値段は 使わない。
- **前からの 6 本（wood-sword・steel-sword・bow・trident・staff・sunblade）は id と 値段を かえない**（セーブが その id）。表の その マスに 入る（`LEGACY`）。
- 画面は `weapon-shop.js` + `weapon-shop.css`（島の renderer を 借りる `bag-preview.js` の `weapon:<id>`。カードの 絵は 1 本 1 回 焼く）。形は `fishing-models.js` の `equipmentModel`。手に もつのは `store.equip`（fishing.js が 毎コマ 見る）。
- 島の お店は `main_island.json` の `weapon_shop`（`main-world.js` の facade）。戸口で `main-island.js` の walkIn → `shops.weapons.open()`。
- 見た目だけ：つりや 英語の むずかしさは かわらない。検査は `server/test/weapons.test.mjs`。

## テーマパークの のりもの代（2026-10）
- **のる たびに U-Speak コイン**（メリーゴーランド 10・かんらんしゃ 15・ジェットコースター 25）。値段は `park-rides.json`（部屋の `server/src/game/themepark.js` も 同じ ものを 読む）。
- オンラインは `park:ride {id}` → 部屋が `applyOp spend` → `park:ride:ok`（さいふ つき）／`park:ride:error`（`not enough coins` / `too fast`＝3 秒の 2 度おし / `unknown ride`）。ページは へんじが 来るまで のせない（`net.parkPay`）。
- オフラインは この ページの さいふ（`fishing.store.spend`）。「入口まで 歩いて 見る」は ただ。
- 検査は `server/test/themepark.test.mjs`。

## ペットは 3D で、いつも 横を 歩く（2026-10）
- **形は `pet-models.js` の `buildPet(kind)` / `animatePet()`**（こいぬ・こねこ・うさぎ・かえる・パンダ・きつね。球・カプセル・円すい・輪だけの ちびキャラ：大きい頭・ひかりが 2 つの 目・首わと すず・まばたき・いき）。
  小さい ぶひん（0.09 以下）は 影を 落とさない（となりの 子の ペットが ふえても 重く しない）。足もとの まるい かげは buddy だけ。
  `createPetBuddy(holder)` が プレイヤーの Group の 子に なって 右横を 歩く（歩くと 少し うしろ、止まると 横で 見上げる）。
  子に しているので 島・家の 中・自分の 島の どこでも いっしょ。うさぎと かえるは はねる。
- **自分の ペット**は `net-client.js` が `state.pet` の たびに `petBuddy.set(species)`、毎フレーム `petBuddy.update(dt, moving)`。
- **となりの 子の ペット**は 姿の 文字（`player.avatar`）の `pet`。部屋の `sanitizeAvatar` が 本物の しゅるいだけ 通し、
  `priv.pet` から 入れる（入室・`profile`・`pushOutfit`・たまごが かえった とき）。`remote-players.js` が 同じ buddy を 付ける。
- **ペット島の 画面の 絵も 3D**：`pet.js` が `createBagPreview(renderer)` の `show(canvas, 'pet:<kind>')` で 回す（島の renderer を 借りる）。描けない ときは 絵文字。

## きせかえ（アバターの店／2026-09 追加）

`wardrobe.json`（16 アイテム・4 スロット）/ `wardrobe-data.js`（読み込みと検証・**サーバーと共有**）/
`wardrobe-models.js`（1 アイテム 1 モデル）/ `wardrobe.js` + `wardrobe.css`（お店の画面）/
`avatars.js` の `dressAvatar()` と アンカー。サーバーは `server/src/game/wardrobe.js`。

- **`wardrobe.json` が唯一の定義元**で、**ページとサーバーが同じファイルを読む**（`wardrobe-data.js` の
  `tableFrom()`）。値段もレベルもスロットも 1 か所にしかないので、お店の値札と部屋の請求が食い違いようがない。
  色は**16進の文字列**で書く（7桁の10進数が並んだ JSON は誰も校正できない）。
  形が壊れていれば `tableFrom()` が**起動時に落ちる**。半分だけ読み込まない。
- **買うのも着るのも部屋が決める**（`wear:list` / `wear:buy` / `wear:put`）。ページが送るのは
  「これがほしい」「これを着る」だけ。**財布・持ち物・レベルはすべてサーバー側**で、
  `applyOp(priv.wallet, {type:'spend'})` を通るのでコインの出入りは他の買い物と同じ 1 か所。
- **`profile` メッセージの `wear` は無視する**（`ClassRoom.onMessage('profile')` が `priv.worn` で上書き）。
  ページは自分の画面に王冠を描いてよいが、王冠を**持つ**ことはできない。
- **着ているものは `player.avatar` に入れる**（`pushOutfit()`）。他の子のブラウザーは元から
  この文字列からアバターを組み立てているので、**クラス全員に見える**のはそのため。
  帽子が自分にしか見えないなら、それは誰もいない部屋のために買った帽子。
- **1 スロット 1 個**。帽子の上に帽子は載らない（`wear()` が同じスロットの物を外す）。
  **脱ぐのは持っていなくても許す**：古いセーブに今は持っていない物が残っていることがあり、
  それを頭から下ろせないと詰む。
- **アンカーは `buildAvatar()` が作る**（`head` / `face` / `chest` / `back` / `hand`）。
  アバターは骨のない箱の積み重ねなので、ボーン名ではなく**空の Group を置く場所**で持つ。
  `dressAvatar(model, items, build)` は**冪等**：もう一度呼ぶと、着ていない物を外してから着せる。
- **アバターを作り直したら着せ直す**（`setupAvatars().setOutfit()`）。顔や色を変えると
  `apply()` が体を建て直すので、書いておかないと服が黙って消える。
- **アイテムの見た目も箱**（`wardrobe-models.js`）。glTF の帽子は別のゲームから来たように見えるし、
  30 人が同時に開いて 16 個のモデルを落とすのは授業ではない。
  **知らない `kind` は `null` を返す**ので、データがコードより先に進んでも「着ていない」に落ちるだけ。
- **押して試着、もう一度押して購入**。子どもが眺めているだけでコインを使うことはない。
  買えない理由は 2 種類あり、**言い分けること**（「あと 60 コイン」＝貯めればよい／
  「レベル 6 から」＝遊べばよい）。鍵のかかったアイテムも**値段ごと見せる**（欲しがるのがお店の役目）。
- **お店のボタン（👕）は `.stats .wear-button` と書く。** `style.css` の
  `.stats button{width:32px;height:32px}` はクラス1＋要素1で、素の `.wear-button` より強い。
  コインバッジが同じ穴で 32px 角に潰れている。
- **プレビューのループは開いている間だけ回す**（`spinning` / `spinUp()`）。閉じると `draw()` が
  止まるので、フラグを持たないと**2 回目に開いたときアバターが固まる**。
  裏では島が描画されているので、2 本目のフレームループを回しっぱなしにしない。
- **在庫は4スロット × 10点前後**（全41点）。1スロットに2点しか無いと、子どもはタブを
  1回開いて終わる。**どのスロットにも「レベル1・100コイン以下」を必ず1つ置く**こと
  （初日に何も買えない棚は棚ではない）。`wardrobe.test.mjs` がこの2つを検査している。
- **カードの絵は本物の3Dモデル**（`bake()`）。40枚のカードに canvas を40枚は置けない
  （＝WebGLコンテキスト40個。Safari は本数を制限するし、iPad のメモリが持たない）ので、
  **ステージが持っている1つのレンダラー**で各アイテムを `WebGLRenderTarget` に1回だけ描き、
  読み戻して `<img>` の data URL にして貼る。焼くのは1アイテム1回だけで、以降はタダ。
  - **カメラはモデルの bounding box から決める。** まほうつかいの帽子は1m、バッジは2cm。
    同じカメラで撮るとバッジが点になる。
  - **レンダラーの状態は必ず戻す**（`setRenderTarget` / `setClearColor` / `getClearAlpha`）。
    裏でステージが描画中で、戻さないとダイアログのプレビューが真っ黒になる。
  - **GL は下から読む**ので、行を逆順に `putImageData` する。
  - 焼くのは**いま開いているスロットだけ**を数枚ずつ（`bakeVisible`）。開いた瞬間に41個の
    モデルを描くと、タブレットでは何も出ないまま数秒固まる。焼けるまではアイテムの色が出る。
- 検査は `server/test/wardrobe.test.mjs`（11項目・値段とレベルとスロットの規則、
  **全アイテムに描ける形があること**、島の座標）/ `server/test/room.test.mjs` の「きせかえ」
  （実ソケット・部屋の拒否と、他の子から見えること）/ `server/test/e2e/browser-wear.mjs`
  （実ブラウザ2画面・**本当に頭に載ること**・**となりの子に見えること**・**カードに絵が出ること**・
  **島の店が自分のスロットで開くこと**）/ `client/tests/regression.mjs` の島の検査 /
  `browser-layout.mjs` の `wear` 画面（5サイズ）。

### きせかえ島（2026-09 追加）

`wardrobe-island.js` と `wardrobe.json` の `island`。**4つの店＝4つのスロット**で、
入った店がそのまま「いま買えるもの」になる（ぼうしや / めがねや / かばんや / アクセサリーや）。

- **座標は `wardrobe.json` の `island` が唯一の定義元。** アイテムの色は16進の文字列だが、
  **島の色は10進**（`island-kit.js` が数値として読むため）。同じファイルで書き分けている理由は
  そこにしかないので、足すときは間違えないこと。
- **ヘッダーの 👕 は残す。** 島は「もう1つの入口」であって置き換えではない。
  どこにいても着替えられることと、買い物に行けることは別の楽しさ。
- **店に入ると `open({slot})` でそのスロットを開く**（`net.wearInteract()`）。
  子どもに「ぼうしやに入ったのにタブを押す」をさせない。
- 建物の**正面の壁は `def.z - 1.4`**（`house()` の作り）。ショーウィンドウや日よけは
  それより**大きい z** に置く。小さい z は店の中で、外からは見えない。
- 島の広場の**南半分は4本の道が通る**ので何も置かない。鏡（島の目印）と洋服ラックは
  広場の**北側**（`yard.z + 6`）に置いてある。`tests/regression.mjs` の
  「the paved path runs through a building」がここを検査する。
- `rpg-data.js` の HUBS と **ACTIVITY_HUBS の両方**に `wear` を登録すること
  （宝箱と U-Speak park の入口が勝手に生えるのを防いでいる）。

## 同梱した外部のゲーム（AURORA KART / BLOCKWILD／2026-09 追加）

**この世界のコードではない。** 別に作られた2本のゲームを**1バイトも直さずに**
置き、島のパネルから **iframe で開いている**。席は共通で `arcade.js` / `arcade.css`。

| ゲーム | 置き場所 | 入口 | どの島から |
|---|---|---|---|
| AURORA KART · Zenith Edition（3Dカートレース） | `racers/` | `racers.js` | のりもの島・スタートライン／**左下のボタン** |
| BLOCKWILD（ブロックの世界・サンドボックス） | `blockwild/` | `blockwild.js` | まちづくり島・**ブロックの とびら**（歩いて入る建物）／**左下のボタン** |
| PUYO U-SPEAK（ぷよ×英単語） | `puyo/` | `puyo.js` | **ミニゲーム島**・左の家 |
| えいご スイカゲーム（スイカ×英単語） | `suika/` | `suika.js` | **ミニゲーム島**・右の家 |

### 左下の入口（`guest-dock.js`／2026-09 追加）

**島の中の扉だけだと、初めて来た子には見えない。** AURORA KART はガレージのパネルを
開くまで、BLOCKWILD はまちづくり島の6軒のうちどれか近づいて札を読むまで、
あることが分からない。そこで**島に降りた時点で押せるボタン**を左下に出す。
島の扉は残してある（歩いて行き当たる楽しみはそこにある）。押せば同じ物が開く。

- **出すのは のりもの島（`ride`）と まちづくり島（`town`）だけ。**
  一覧は `guest-dock.js` の `GUESTS`。3本目を同じ形で足すならここに1行。
- **ミニゲーム島には出していない。** 家2軒がそのまま看板で、降りた時点で名前が見える。
  ここに足すと「島にボタン、家にも扉」で二重になる。
- **判定は `currentSpace()` の値そのもの。** 建物の中は `in:town:shop` の形になるので、
  店の中では自動的に引っ込む（カウンターの前の子に、島から出るボタンは要らない）。
- **オンライン判定より前に呼ぶこと。** `net.update()` の中で、`if (!room …) return` の
  **上**に置いてある。同梱ゲームはこのページの中だけで完結するので、オフラインでも開ける。
- 見た目は `.arcade-door`（パネルの中のカード）と同じ色。あとでガレージを開いた子が
  「これと同じやつだ」と分かる。右のレールに置かないのは、**あちらは島の道具、
  これは島から出るボタン**だから。
- 置き場所は左下。下から順に WASD の説明（`.bottom`、25px）、その上。スマホでは WASD が
  消えて**まるいスティック**（`.mobile-pad`、bottom:104px・132px 角）が出るので、その上まで上げる。
  **`browser-layout.mjs` の `PROBES` に入れてある**ので、5サイズすべてで重なりを見ている。

**3本目を足すときは `arcade.js` の `createArcade()` を使い、そのゲーム固有のことだけを
`settle(doc)` に書く。** ランチャーを2つ書くと必ず片方が腐る（1本目のあと実際にそうなりかけた）。

- **なぜ iframe か。** 気持ちの問題ではなく、3つとも実際に壊れるから：
  1. **three.js のバージョンが違う**（どちらも r170、こちらは r160）。1つのページに
     2つ載せるとモジュール登録とグローバルを取り合い、負けるのは子どもが立っている島。
  2. あちらの CSS は `header{}` `main{}` `button{}` と**素の要素セレクタ**を使う
     （画面を丸ごと持っているページの当然の書き方）。`style.css` の隣に置くと
     こちらのゲームが塗り替わる。
  3. あちらは矢印キー・WASD・Space・Shift・Esc を使い、BLOCKWILD は**ポインタも
     ロックする**。こちらもだいたい使う。
- **同梱フォルダの中身は編集しないこと。** 直したくなったらそれは vendor ではなく fork。
  必要な手当て（つながらないオンラインを外す／メニューに帰り道を足す）は、**同一オリジンの
  iframe に外から手を入れる**（各ゲームの `settle()`）ことでやっていて、ファイルは無傷の
  まま。だから `SOURCE.json` の SHA-256 が意味を持つ。
  - 差し替えるときは新しいビルドをフォルダごと置いて
    `node client/tests/guests-manifest.mjs --write <racers|blockwild>`。
  - `tests/regression.mjs` が毎回ハッシュを照合する（半分だけ差し替えたビルドを止める）。
    **サブフォルダも見る**（BLOCKWILD は半分が `src/` にある）。
- **BLOCKWILD のオンラインは、このサーバーが相手になる（2026-10）。** あちらの `src/net.js` が話す
  プロトコル（join / pos / block / time / pvp ＋ 差分のバイナリ 1 本）を `server/src/blockwild/server.js`
  がそのまま受ける。Colyseus の `WebSocketTransport({server})` は `path` を持たず **このポートの upgrade を
  全部取る**ので、その listener をいったん外して後ろに置き、`/bw/<class>/ws` と `/ws` だけこちらで受けている
  （`createBlockwildServer` の「the door」）。**同じポートに 2 つ目の ws サーバーを素で足さないこと**（二重に
  handleUpgrade して落ちる）。
  - 入口は `blockwild.js` の `settle()`：`session()`（net-client から `online / classCode / name`）が
    オンラインなら `#netName` `#netCode` を埋めて `#netJoin` を押す。**入力は消さずに隠す**（あちらが id で読む）。
    `新しい世界 / 再開 / 読み込み` は共有の世界にいる間は隠す（ローカルの世界で上書きしてしまう）。
  - 世界はクラスごと（`DATA_DIR/blockwild/<class>.json`）。20 人まで（`BW_MAX_PLAYERS`）。生き物はなし。
  - スポーンは `spawn-worker.mjs` が同梱の `worldgen.js` を Node で回して出す（同じ seed なら同じ地形）。
- **AURORA KART のオンラインは外したまま。** あちらは `ws://location.host` の**ルート**へつなぎに行く
  （Colyseus の口）。「みんなで走るのは のりもの島の『レースに でる』から」と書いてある。
- **コインも学習記録も、こちらには入らない。** AURORA KART の英単語モードは**答えを
  クライアントが持っている**（`racers/vocab.js` がブラウザに来る）。そこから出た正解数で
  コインを払うのは、この世界がずっと避けてきた穴そのもの。あちらの成績は `localStorage` の
  `aurora-*` / `blockwild-*` に別で貯まる。**保護者に見せる数字と混ぜないこと。**
- **開いている間、島は描かない**（`game.js` の `net.arcadeOpen()` で
  グランプリと同じ止め方）。不透明なフレームの後ろで島を描くのは電池を捨てているのと同じ。
- **閉じるときはフレームを消す**（隠すのではなく）。WebGL コンテキストと WebAudio と
  60Hz のループを抱えたまま隠れているタブは、隠れているだけで iPad を減らす。
  次に開くと読み込み直しになるが、それは「出ていったゲーム」に子どもが期待する動き。
- **入口はガレージのいちばん上**（`ride.js` の `.ride-arcade`）。のりものカードと
  見た目を変えてあるのは、行き先が違うから：下は「のりものを買う」、これは
  「島から出て別のゲームへ行く」。同じ形にすると、押した子は出たことに気づかない。
- **スタートラインは「どっちのレース？」を聞くようになった。** 以前は、のりものに乗った子が
  スタートラインで E を押すと**そのままカウントダウンに入っていた**（1タップ速いかわりに、
  うっかり線に乗っただけでレースが始まり、そして**この島でいちばんレースらしい場所から
  別のゲームに行けなかった**）。いまは乗っていてもパネルが開き、上に2つ並ぶ：
  **🚦 クラスの レースに でる**（島の色・本命）と **🕹 AURORA KART**。
  **レース中だけは今までどおりパネルを出さない**（時速200kmでダイアログを出すと、
  子どもは必ず違うほうを押す）。
- **のりもの島に6軒目は建たない。** 外周のコースが島をぐるりと囲んでいて（ゲートは半径
  約20〜23、道幅9）、内側に残る空きはどのスポットからも10m離すという条件を満たさない。
  AURORA KART の入口をパネルに置いてあるのはそのため。増やしたくなったら、まず
  `tests/regression.mjs` の「のりもの島のコース」を読むこと。
- **`body[data-arcade]` が唯一のスイッチ**（値はゲームの id。`race.css` の
  `body[data-race]` と同じ役割）。画面に残ってはいけない物が残っていたら、まず
  `arcade.css` のこの一覧を見る。
- **帰り道のボタンは、そのゲームのボタンの見た目を借りる**（`homeButton()` が、置き場所に
  すでにあるボタンの `className` をコピーする）。こちらが読んだことのない CSS の中でも
  浮かないし、ビルドを差し替えても浮かないままでいる。
- **借りたボタンが画面から消える瞬間がある。** PUYO はメニュー中ツールバーを出さない。
  そこで **0.5秒ごとに見えているかを確かめて、見えていなければ隅の `.arcade-exit` を出す**
  （`arcade.js`）。**出口は常にちょうど1つ**——0個（詰む）でも2つ（迷う）でもない。
  `browser-arcade.mjs` がこれを4本とも検査する。
- レイアウト検査（`browser-layout.mjs`）には**入れていない**。あちらの中身に
  11px の下限や 34px の下限を当てるのは筋が違う（こちらの規則ではない）。かわりに
  `browser-arcade.mjs` が**こちらの席**だけを測っている（横向きスマホで画面ちょうどか、
  横スクロールが出ないか）。
- **入口は「建物」が第一。** BLOCKWILD は最初、ブロック屋のパネルの中にカードで置いて
  いて、**「行きづらい」と言われた**（そのとおりだった）。いまは まちづくり島の
  **ブロックの とびら** という建物で、他の入口と同じく**戸口に入った瞬間に開く**
  （`net-client.js` の `setDoorHandler` が `kind === 'blockwild'` を拾う）。
  この世界でいちばん見つけやすいのは、見えて・歩いて入れるものである。
  - **まちづくり島には建てられて、のりもの島には建てられない。** あちらは外周のコースが
    島を囲んでいて（ゲートは半径 約20〜23・道幅9）、内側に「どのスポットからも10m」を
    満たす空きが残っていない。だから AURORA KART だけパネルのカード（`.arcade-door`）。
  - 建物を足したら `town.json` の `spots` に書き、**`server/src/game/town.js` の
    `PAGE_KINDS` にも足す**こと。サーバーは知らない `kind` を見ると起動時に落ちる
    （タイポ避け）。`PAGE_KINDS` は「位置も買い物も部屋の管轄外だが、島には建っている」
    という意味で、重なりと島からのはみ出しだけは他の建物と同じに検査される。
- **入口カードは `.arcade-door`**（`arcade.css`）。まわりのカードと見た目を変えてあるのは、
  行き先が違うから：まわりは「ここで買う」、これは「島から出て別のゲームへ行く」。
  同じ形にすると、押した子は出たことに気づかない。
- 検査は `client/tests/guests-manifest.mjs`（同梱物が無改変か・サブフォルダも）と
  `server/test/e2e/browser-arcade.mjs`（実ブラウザ・**4本まとめて**。中のゲームが本当に
  起動するか＝キャンバスとメニューが出ているか、島が消えて戻るか、**後ろの島が止まるか**、
  出口が常に1つ見えているか、2度目も開くか、**4本とも席はひとつ**か）。

### スマホの 横もち（`arcade-fit/`／2026-10）
- **スイカ・PUYO・AURORA KART は `arcade-fit/<id>.css` を iframe に 差しこむ**（`arcade.js` の `fitPhone()`、ランチャーで `fit: true`）。
  同梱フォルダは 触らない（ハッシュは そのまま）。中身は どれも `(pointer: coarse) and (orientation: landscape) and (max-height: 560px)` の 中だけ。
- スイカ：3 れつ（左＝スコア・つぎ・ミッション・ことば／まんなか＝ゲームばん 高さ いっぱい／右＝しんかの じゅんばん）。`.board-area` を `display: contents` に して grid に のせている。
- PUYO：メニューは 1 画面（モード 3 つ・せってい 3 れつ）。ゲームは「スコア｜ばん｜つぎ」を 1 れつ、ボタンは ばらして 左下（いどう）と 右下（まわす・おとす）。
- AURORA KART：左の メニューは 自分の 中で スクロール、「レースを はじめる」は sticky で いつも 下。レース中は あちらの もとからの 規則（max-height 600px）。
- 字は 11px より 小さく しない（あちらの 9px も ここで 11px に 上げる）。

### 出てきた戸口では、もう一度開かない（2026-09 修正）

**戸口を歩いて入ると開く作りなので、別ゲームから帰ってきた子が立っているのは必ずその戸口。**
以前は「出た直後の1.4秒だけ待つ」（`rpg.js` の `doorHold`）で止めていたが、**その時計は
別ゲームが開いている間ごと止まっている**（`game.js` のフレームループが丸ごと早く帰るので
`rpg.update` が呼ばれない）。だから戻った1.4秒後に、指一本ふれていないのに同じゲームが
また開いた。教室から上がった不具合はこれ。

- **時間ではなく場所で止める**（`rpg.js` の `doorLatch`）。開けた戸口を `島:id` で覚えて、
  **そこから歩いて離れるまで**二度目は開けない。離れれば掛け金は自分で外れる。
- **掛け金は `holdDoors(false)` でもかける。** 別ゲームは扉だけでなく、パネルのカード
  （AURORA KART）や左下のボタン（`guest-dock.js`）からも開く。どの道から開いても、
  戻ってきたときに立っているのは同じ戸口なので、離すところ1か所でまとめてかけている。
- 検査は `browser-arcade.mjs` の「戻ってきた子は、まだ戸口に立っている」。
  **待ち時間は長めに取ってある**：このコンテナは1秒に数コマしか描かないので、昔の1.4秒の
  猶予が切れるまで実時間で15秒近くかかる。短く待つと、直っていなくても通ってしまう。
  **「また開かない」だけでなく「一度離れれば、ちゃんとまた開く」も測ること**
  （開かなくなったら、それはただの故障）。

### ブロック屋 → BLOCKWILD（2026-09 追加）

**U-Speak コインで買ったブロックだけが、BLOCKWILD のクリエイティブに出る。**
英語をやって貯めたコインが、向こうの世界の材料になる — というのがこの接続の全部。

- **対応表は `blockwild-blocks.js` の1か所**（ブロック屋の id → BLOCKWILD の数字 id）。
  ブロック屋に品を足したら、ここにも足すこと。**足し忘れても何も壊れない**（向こうに
  出てこないだけ）ので、`server/test/blockwild.test.mjs` が
  「店の品が全部表にあるか」「番号が BLOCKWILD の `ID` と一致するか」を検査している。
- **持ち主はサーバー**（`block:shop` / `block:bought` の `owned`）。ページが持っているのは
  その写しで、`localStorage` にも書いておく（オフライン用）。**写しを書き換えれば一人用の
  砂場でブロックは増える** — それでよい。コインは減らず、学習の記録も動かない。
- **同梱のゲームは1バイトも触っていない。** 使っているのは、あちらが自分で公開している
  開発用フック `window.BLOCKWILD` と、あちらが描いた DOM だけ（`blockwild.js` の `gate()`）。
  - 全ブロック一覧（`#creativeGrid`）は**持ち物画面を描くたびに作り直される**ので、
    MutationObserver で作り直しに反応して消す（ポーリングしない）。
  - クリエイティブは最初から9個を手に持たせるので、`BLOCKWILD.bag` から取り除く。
- **サバイバルは触っていない。** あちらは「掘って手に入れる」ゲームで、掘ったものまで
  取り上げると成立しない。ブロック屋が面倒を見るのはクリエイティブ＝買って建てる世界。
  ここを変えるなら**あちらのコードを直す＝fork する**ことになる（別の判断）。
- 検査は `server/test/blockwild.test.mjs`（6項目・表そのもの）と
  `browser-arcade.mjs` の「ブロック屋 → BLOCKWILD」（実ブラウザ。買っていない子の
  パレットが1つ → 店で いし を買う → 部屋がコインを取る → **向こうのパレットに いし が出る**）。

### BLOCKWILD の中の店と、1 ファイルだけの fork（2026-10）

- **U-Speak コインのバッジと店は `blockwild.js` の `shopUI()` が iframe の document に差し込む**（CSS も `<style>` で）。
  ゲームの `index.html` / `game.js` は触っていない。開くのは `#uspeakShop`、中身は `#uspeakShopBox`。
  棚は net-client の `shelf`（`block:shop` / `bw:shop` が届くたび更新）、残高は `session().coins` を 1 秒ごとに読む。
  買う → `send('bw:buy')` → 部屋が払う → `bw:bought` → `onBought()` が `win.BLOCKWILD.give(id, n)`。
  **ページは値段も在庫も決めない**（押せないボタンは親切のためだけ）。
- **`gate()` の許可集合は毎回計算する**（`allowOf()`）。店で買った直後に `refresh()` でパレットに出すため。
- **`blockwild/src/entities.js` だけは fork**（動物の顔が宙に浮いていた。`SOURCE.json` の `forked`）。
  それ以外は無改変のまま。**顔のパーツは `onHead()` で頭の中心から測って置くこと**（頭は `Mobs.update` が回す）。
  ビルドを差し替えたら entities.js の修正を当て直してから `guests-manifest.mjs --write blockwild`。

### ブロック屋の 3D プレビュー（`town-block-icon.js`）

棚のカードは**色の四角ではなく、そのブロックを等角投影で描いた立方体**。

- **WebGL は使っていない。** ブロックは立方体なので、等角投影の絵と three.js で描いた絵は
  48px では見分けがつかない。一方でレンダラーを1つ増やすのは iPad では本当に高い
  （このページには既に world / アバター / 魚 / 図鑑 / きせかえ のレンダラーがある）。
  **きせかえの店が本物の 3D を焼いているのは、帽子やマントは形が全部ちがうから。**
  立方体は立方体で、そこが違う。
- BLOCKWILD 側のドット絵を借りることもできるが、あちらの `textures.js` は three.js を
  import しているので、**この世界に2本目の three.js を持ち込む**ことになる。しない。
- 面の明るさは上・右・左で変え、ブロックごとに手触りを足す（ガラスと水は半透明、
  ランプは光る、レンガは目地、木は板目、石と砂はざらつき）。**同じ色の四角が10個**
  並ぶのを避けるのがこの絵の仕事。

### ミニゲーム島（2026-09 追加）

`mini-island.js` + `minigames.json`。**家がふたつ、それだけの島。** 入った家がそのまま
ゲームで、メニューは「ドアの上の名前」しかない。

- **サーバー側のモジュールは無い。** コインも位置判定も無く、部屋の管轄外だから
  （`minigames.json` を読むサーバーコードは存在しない）。**オフラインでも開く**。
- 家を足すときは `minigames.json` の `spots` に `game` を書き、`net-client.js` の
  `arcades` に同じ id で足す（`setDoorHandler` が `spot.game` で引く）。
- **島の検査は2スポットから通る。** `tests/regression.mjs` の島ループは最低3スポットを
  要求していたので、島ごとに下限を渡せるようにした（この島だけ 2）。

### えいご スイカゲームを 英語で出す（`suika-en.js`／2026-09 追加）

**同梱フォルダ（`suika/`）は1バイトも触っていない。** 中の日本語は、席の側
（`suika.js` の `settle(doc)`）から**外して英語に書き替えている**。

- **辞書は `suika-en.js` の1か所。** そのまま引く語（`WORDS`）と、形で当てる規則
  （`RULES`＝「さくらんぼ を つくろう！」→ `Make a cherry!`、「レベル 3」→ `Level 3`）。
  **`a` と `an` は頭の文字で決める**（`an apple`）。
- **くだものの名前と「ことば」は 学習の中身**。`suika/words.js` の英単語も、
  `fruits.js` の日本語の意味も**訳さない**（訳すと ゲームそのものが成立しない）。
- **書き替えるのは TreeWalker で文字のところだけ**。`title` と `aria-label` も見る。
  もとの日本語は `node.__suikaJa` に置いておくので、**日本語に戻すときは書き戻すだけ**。
- **あちらは画面を作り直す**ので、`MutationObserver` で作り直しを拾って塗り直す。
  **自分の書き替えで自分が起きないように `busy` の掛け金**を持つ（無限ループになる）。
- **ゲームの中にも切り替えボタンを出す**（`.arcade-lang`・ツールバーの先頭）。
  **島の「あ」にも従う**（`onLangChange`）。全画面なので、島のヘッダーは押せない。
  ボタンの見た目は `homeButton()` と同じで、**そこにあるボタンの class を借りる**。
  ただし**帰り道のボタンからは借りないこと**：`arcade-home` まで付いてきて、
  `arcade.js` の「出口はどれか」にこのボタンが先に当たり、**押しても島に戻らなくなる**
  （`browser-arcade.mjs` が落ちて分かった）。`arcade-` で始まる class を持たない
  ボタンから借りている。
- 差し替えたときに訳が外れても**日本語が出るだけ**（`toEnglish()` が `null` を返す）。
  `client/tests/guests-manifest.mjs` が「同梱物が無改変か」を見ているので、
  **suika/ を直して訳すのは禁止**。

## メッセージ（定型文＋じゆうにゅうりょく／2026-09 更新）

`chat.js` + `net.css`（クラス全体・💬 ボタン）/ `voice.js` の `#voice-write`（部屋の中）。
サーバーは `ClassRoom.onChat` / `onVoiceMsg` / `acceptSay` と **`server/src/game/say.js`**
＋ `server/src/game/ng-words.json`。

- **どの島でも、通話に入らなくても書ける。** 💬 は `net-dock` にあり、オンラインなら
  常に出ている（`chat.setAvailable(mode === 'online')`）。部屋（`in:*`）に入っている時は
  通話パネルの中にも入力欄が出て、そちらは**その部屋の人にだけ**届く。
- **2種類ある。** 定型文（`phrases.json` の id）と、自分で書いた文。
  **XPが出るのは定型文だけ。** 書いた文でXPを出すと「XPのために書く」子が出る。
- **判定はサーバーだけ**（`say.js`）。長さ（120文字）・同じ文の連投・同じ文字の連打・
  電話番号やURL・**言われたら傷つくことば**を見て、通らなかった理由を `chat:blocked` で返す。
  ページは「送っていいか」を自分で判断しない（`maxlength` は親切のためだけ）。
- **ことばの一覧は `ng-words.json`**。学校ごとに足していい。日本語は部分一致なので、
  「ばかり」のような**巻き添えになる語は `safe` に入れて先に消してから**照合する。
  英語は単語境界つき（`assist` が引っかからない）。全角・大文字は NFKC で揃える。
- **単語リストは「柵」であって「見張り」ではない。** 本当に効くのは他の3つ：
  先生が**じゆうにゅうりょくをオフ**にできる（`RoomState.freeChat`・先生コンソールの ✏ ボタン）、
  先生が**チャットを一時停止**できる、そして**書いた文も止められた文も学習ログに残る**
  （`mode: 'chat'`、`question_id` は `chat:chat` / `chat:room` / `chat:blocked:<理由>`）。
  この3つを外すと、この機能は子ども向けではなくなる。
- **入力欄のキーは世界に流さない**（`stopPropagation`）。流すと "we walk" と書いた子が
  歩き出す。フォーカス時に `scrollIntoView` するのは、iPad のキーボードが下半分を隠すから。
- 吹き出し（`remotes.showBubble`）は定型文と同じように出る。**部屋のメッセージは部屋を出ると消える**
  （`voice.setSpace()` がログを捨てる）。クラスのチャットは24件まで残る。

## めんせつの間（英検の面接練習／2026-09 追加）

`eiken.json` の5つめのスポット（`kind: "interview"`・3島とも同じ場所）/ `eiken-island.js` の
`interviewRoom()` / `interview.js` + `interview.css`（画面）/ `character.js`（ウーピーの動画と声・
英会話島と共有）。サーバーは `server/src/game/interview.js` と **`interview-bank.json`**。

- **5つめの建物は技能ではない。** 4つの館は 読む・聞く・書く・話す。めんせつの間は
  二次試験そのもので、島のいちばん奥（`z=-17`）に立っている。中庭の4分割はそのまま4技能。
  サーバー側は `INTERVIEW_ROOM` で区別し、`loadIslands()` は**3島すべてに在ることを検査する**。
- **順番が本番と同じ。** 音読 → パッセージの質問 → イラストの質問 → 自分のことの質問。
  5級は3問、3級は5問（最後は「もっと話して」の追い質問つき）。
- **答えは答えたあとにしか来ない。** ページに送るのは「いまの質問1つ」だけ。
  お手本（`model`）と採点用のことば（`keys`）は `interview-bank.json` にあり、
  **`client/dist` には置かない**。音読は `judgeSpoken`（話す館と同じ判定）。
- **採点は keys のグループ全部にヒットしたら○**。「soccer か football」かつ「play か plays」。
  自分のことの質問は正解が無いので、**形（Yes/No で始まる・○語以上）だけ**を見る。
- **AIは1回だけ呼ぶ。** 質問と質問のあいだの「Good!」は台本（examiner は本番でも同じことしか
  言わない）。最後の講評だけ `tutor.comment()` が書く（キーが無ければ台本の講評）。
  これで**面接1回のAI予算は1ターン**で済み、おつかい・英会話島の予算を食わない。
- **コインは完走したときだけ**（30🪙×級レート、英検の島の日次上限 `EIKEN_CAP` を共有）。
  XPは各パートごと。途中でやめた子にはXPだけ出る。
- **位置で守る**。`interview:start` も `interview:say` も、その島の めんせつの間 に
  立っていないと通らない（部屋を出ると採点が止まり、戻れば続きから）。
  ページ側は送信の前に必ず位置を送る（`net-client.js` の `createInterviewUI({send})`）。
- **画面は「会話」ではなく「試験」の形にしてある**：上に進み具合のバー、真ん中に1問だけ、
  下にマイク。まちがえても最後まで進む（本番と同じ）。
- **動画は英会話島と同じ2本**（`assets/character/idle.mp4` / `talking.mp4`・H.264・1280x720・
  各10秒）。ウーピーは1人なので、面接官のために別のファイルは持たない。差し替えるときは
  **この2本を置き換えれば両方の画面が変わる**（同じ構図・同じ照明・最初と最後のフレームを
  揃えること）。
- e2e は `server/test/e2e/browser-interview.mjs`（歩いて入り、音読して、間違えて、
  最後まで受けて、結果カードとコインを確認する）。**面接の画面が実際にその2本を
  取りに行くこと**もネットワークで見ている。動画はこのコンテナでは絵のフクロウに落ちる。

## おはなし（部屋の中の通話／2026-09 追加）

`voice.js` + `voice.css` + `stage.js`（大広間）。サーバーは `ClassRoom` の `voice:join` /
`voice:leave` / `voice:msg` / `voice:token` / `rtc:signal` と `src/game/stage.js`。

- **右のバーに 📹 ビデオ通話 のボタンがある**（`voice.js` の `#voice-button`・
  オンラインの間ずっと出ている）。押した時にすることは、いまいる場所で決まる：
  通話できる場所なら**入ってカメラを点ける**、通話中なら**カメラの入切**（人数も出す）、
  それ以外の島にいるなら **おはなし島へ飛ぶ**（`net-client.js` の `onGoToHall`）。
  子どもに「どこなら話せるか」を覚えさせないための入口なので、
  **文言は場所ごとに変える**（おはなし島へ / ここで はなす / 🎙 つうわ中）。
- **このボタンの見た目は class（`.voice-button`）に書くこと。** `#voice-button` に
  `position: fixed` を書くと `mobile.css` の `.right-rail > *` に勝ってしまい、
  スマホでバーの外に置き去りになる（実際になった）。
- **部屋＝通話。** `in:<島>:<建物>` に入っている人どうしが同じ通話。部屋を出れば切れる。
  マイルーム（`in:room`）とひろば（`in:plaza`）は一人の場所なので通話にならない。
- **おはなし島（`talk`）だけは島そのものが1つの部屋**。`space === 'talk'` で通話になり、
  定員は `talk.json` の `plaza.max`（**100人**）。島のブース（`in:talk:*`）は普通の部屋（6人）。
- **スイッチは3択**（`RoomState.voice`）：`'all'`＝どの島のどの部屋でも（**既定**・先生の操作不要）／
  `'rooms'`＝おはなし島だけ（授業を静かにしたい時に先生が絞る）／`'off'`＝おはなし島も含めて全部止める。
  先生コンソールのボタンが `all → rooms → off → all` と順に切り替える。
- **声はサーバーを通らない。** ブラウザー同士の直結（WebRTC）で、サーバーがするのは
  「誰と誰を引き合わせてよいか」の判断と仲介だけ。録音もしない。
- **鍵は子どものタップだけ**。既定が `'all'` なので、どの島でも部屋に入れば通話になる。
  マイクのタップはどこでも必ず要る（ブラウザーの許可と、子ども自身の意思の両方）。
  先生が `'rooms'` に絞った時だけ、おはなし島以外が閉じる。
- **島の外（屋外）は通話にならない**（おはなし島だけが例外）。クラス全員で話すなら
  おはなし島に集合する＝そこが大広間。`voiceRoomOf()` が唯一の判定元。
- **https でないとマイクは開かない**（ブラウザーの決まり）。`http://192.168.x.x` の
  LAN 配信では使えないので、トンネル版か本番（Fly.io）で使うこと。画面にもそう出る。
- **カメラは通話中に入切できる**。トラックを足す／外すと各接続が自分で再交渉する
  （perfect negotiation。どちらが offer するかは id の大小で決まる）。相手が切ると
  こちらには track の mute として届くので、その時点でタイルを消している。
- **マイクは送る前に掃除する**（`cleanMic()`・2026-10）。getUserMedia にはブラウザーの AEC/NS/AGC/音声分離を
  全部要求し、そのうえで ハイパス→ローパス→**言葉の合間に閉じるゲート**→コンプレッサー を AudioContext で通す。
  **AudioContext はレベルメーターと共用の1つ**（`meterCtx()`・join のタップで作る＝iOS の gesture）。
  送るトラックは `micTrack()` が決める（掃除後 or 生）。🧹 で切り替えると `replaceTrack` で**その場で入れ替える**
  （メッシュは sender、大広間は `stage.replaceMic()`）。**隠れたタブではゲートを開けっぱなしにする**
  （タイマーが1秒に1回になり、言葉が切れる）。
- **通話中は BGM を下げる**。`voice.js` が hooks の `'call'` を出し、`game.js` が `ambience.setDucked()` に
  つなぐ。スピーカーの曲をマイクが拾って「雑音」になっていた。`browser-bgm.mjs` が測る 0.5 は通話していないとき。
- **⛶ ぜんがめん**は `panel.dataset.full` と `body.dataset.call='full'` の2つ。後者を `game.js` の `menus` が
  見て WASD を止める（全画面中に歩いて部屋を出ると通話が切れる）。CSS は `#voice-panel[data-full="1"]` で、
  **つかんで伸ばした inline の width を `!important` で上書き**している。markup は全画面の順（顔→横→ボタン）で、
  隅では `.voice-side{display:contents}` と `order` で元の並びに戻す。
- **つかんで動かす・伸ばす**は `grab()`（ヘッダー＝移動、`.voice-grip`＝大きさ）。箱は `uspeak-voice-box-v1`。
  プリセット（小中大特大）を押すと幅と高さの指定は消える（位置は残す）。
- **TURN は部屋からもらう**（`voice:room` の `ice`）。ページに埋め込まない。公開 STUN は常に足す。
- **送る量は人数で決める**（`tuneSenders()`・`VIDEO_KBPS`）。接続できたときと人数が変わったときに掛け直す。
- **画面の大きさは子どもが変えられる**。`.voice-head` のボタンが 小→中→大→特大 と順に変わり、
  `#voice-panel` の `data-size` を書き替えるだけ（幅は CSS の `--voice-w`）。選んだ大きさは
  `localStorage` の `uspeak-voice-size-v1` に残る。幅はすべて `min(px, vw)` なので、
  特大でもスマホの画面からはみ出さない。狭い画面（560px 以下）では中・大・特大だけ上書きする。
- **つながらないまま放っておかない**。offer する側が 12 秒たってもつながって
  いなければ最大2回 `restartIce()` する（`RETRY_MS`）。学校のネットワークではこれが普通の
  失敗の形で、黙って無音のままにすると先生には原因が分からない。
- **通話にも1日の上限がある**（`VOICE_DAILY_MINUTES_PER_STUDENT`・既定120分／2026-09追加）。
  AI英会話には元から `AI_DAILY_TURNS_PER_STUDENT` があったが、通話は無かった。開いたままの
  マイクは閉じ忘れたタブでも毎秒コストが積み上がり、大広間なら LiveKit の分課金になる。
  **上限に達したら、部屋の側から通話を切る**（`ClassRoom.tickVoice()`・1秒ごと）。子どもが
  自分から出るのを待つと、上限を超えた分だけ課金され続ける。先生はこの上限の対象外
  （`priv.caps.voice`・`night.js` の `blankCaps`/`sanitizeCaps`/`roomLeft` を共有）。
  検査は `server/test/voice-cap.test.mjs`（実ソケット、上限を数秒に縮めて実際に切れることを見る）。
- **画面共有**（`getDisplayMedia`）は顔とは別の MediaStream で送り、`rtc:signal` の
  `kind:'screen'` で「どの stream id が画面か」を相手に伝える。受け側は `ontrack` の
  `e.streams[0].id` と突き合わせて `peer.stream`（顔）と `peer.screen`（画面）に振り分ける
  （`sortTracks()`）。順序はどちらが先でもよい。**iPad/iPhone の Safari には
  `getDisplayMedia` が無い**ので、その端末ではボタン自体を出さない。
- **メッセージは定型文だけ**（`phrases.json` の id しか飛ばない）。`voice:msg` を
  サーバーが同じ部屋の全員に配る。**マイクを入れていなくても読み書きできる**（声が
  つながらない時の逃げ道）。クラス全体チャット（`chat`）とは別チャンネルだが、
  レート制限と XP は同じ `priv.lastChatAt` / `REWARDS.phrase.xp` を共有する（二重取り防止）。
  先生の「チャット一時停止」はこちらも止める。部屋を移るとログは消える（部屋の会話は部屋のもの）。
- **部屋は2種類**。`voiceKindOf()` がサーバーで決める。
  - `mesh`＝建物の中（**6人**まで・`VOICE_MAX`）。ブラウザー同士の直結でサーバー費用ゼロ。
  - `sfu`＝おはなし島のひろば（**100人**まで・`talk.json` の `plaza.max`／`STAGE_MAX`）。
    LiveKit が声を1本ずつ受けて必要な人に配る（`client/dist/stage.js` + `vendor/livekit.js`）。
    SDK は**大広間に入った時だけ**動的 import するので、6人の授業では 1 バイトも落ちてこない。
- **大広間の鍵（`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`）はサーバーだけが持つ。**
  ブラウザーに渡るのは「この子・この部屋・2時間・何を出してよいか」を書いて署名した
  トークンだけ（`server/src/game/stage.js`、HS256 の JWT を `node:crypto` で自作＝依存ゼロ）。
  3つが未設定ならおはなし島も 6 人メッシュに落ちる（サーバーは普通に動く）。画面にもそう出る。
- **大広間ではカメラは先生と「ステージ」の子だけ**（`canPublishSources`）。100台のカメラは
  授業ではなく通信障害なので、声は全員・映像は選ばれた人だけ。先生コンソールの名簿に
  🎙 ボタンがあり、押すとその子に新しいトークンが飛んで、カメラと画面共有が開く。
- LiveKit サーバーは **1.10 以降**が要る（2.x の SDK は `/rtc/v1` でサインインするので、
  古いサーバーだと 404 になり「つながったように見えて実はつながらない」）。
- 学校のネットワークが UDP を塞いでいると P2P がつながらないことがある。メッシュには
  TURN サーバー（TCP/443）が要る（まだ無い）。**大広間は LiveKit が TCP/TLS 443 に
  フォールバックできる**ので、UDP が塞がれた学校ではむしろこちらのほうが通る。
- e2e は `server/test/e2e/browser-stage.mjs`（本物の LiveKit を1バイナリ起動して
  実ブラウザー3枚で通す）。`LIVEKIT_BIN` が無ければ SKIP して落とさない。
- e2e（`server/test/e2e/browser-voice.mjs`）はこのコンテナでは ICE の候補収集が
  たまに空になる（mDNS 応答なし・STUN に届かない）。テスト側で入り直しを繰り返すのと、
  Chromium に `--disable-features=WebRtcHideLocalIpsWithMdns` を渡すのはそのため。
  実機・実ネットワークの話ではない。

### 教室の運営に入り込む記録（きょうの5ふん・先生のメモ・声かけ・英検の準会場）

**サーバーが決めて、ページは並べるだけ**（上と同じ）。なぜ入れたかは `docs/uspeak-moat-2.md`。

| 出るところ | 出るもの | ファイル |
|---|---|---|
| マイページのいちばん上 | **きょうの 5ふん**（英検の読む3・聞く2、どこからでも）と、届いた級の一言 | `dashboard.js` / `quick5.js` / `dashboard.css` |
| 先生コンソール | 気づきの**「声をかけた」**、**英検の準会場**の見込み、名前を押すと**その子のメモと英検の目安** | `teacher.js` / `net.css`（`#net-t-exam`・`#net-t-child`） |
| 先生コンソール → レポートのリンク | **🏫 教室のようす**（オーナー向け）、子どもごとの **🗣 面談メモ** | `teacher.js` |

- **きょうの5ふんの画面は答えを知らない**（英検の島と同じ）。4つ見せて、押したものを送り、
  ○×はサーバーが返す。級もサーバーが決める。部品は英検の島のもの（`.eiken-choices` など）。
- **「声をかけた」は1押し。** 押したら2週間は「✓ 声かけ済み」に変わる（同じ子に毎日押させない）。
  いいこと（✦）には出さない。**ボタンの class は `net-t-callbtn`**：`net-t-call` は気づきの
  強さ（● 声をかけましょう）の色で使っているので、ぶつけると行ごと赤くなる（実際になった）。
- **メモは既定で「先生だけ」。** 「保護者のレポートに『先生から』としてのせる」に印を付けた
  ものだけが保護者に出る。けすときは確認を出す。

## 自然な 声（/api/tts）と 正解・不正解の 効果音（2026-10 追加）

- **声**：`speech.js` の `playVoice()` が さきに サーバーの 声（`GET /api/tts?lang=en|ja&t=…`、`server/src/tts/service.js`）を 鳴らす。だめなとき（鍵なし＝503・オフライン・file:・4 秒 こない・再生 できない）は いつもの 端末の 声（speechSynthesis）。`createSpeech` の speak も、ウーピー（`character.js` の say）も これを とおる。♫ を 切ると `stopVoice()`。
  - サーバー：OpenAI の TTS（`OPENAI_API_KEY`・`OPENAI_TTS_MODEL` 既定 gpt-4o-mini-tts・`OPENAI_TTS_VOICE` 既定 coral）。作った mp3 は `DATA_DIR/tts/<hash>.mp3` に のこり、同じ 文は 2 回目から ファイルを 返す（ブラウザにも `immutable` で のこる）。文は 300 字まで・1 IP 1 分 60 回・新しく 作るのは 1 日 `TTS_DAILY_NEW`（既定 3000）回まで。鍵は サーバーだけ。
  - iPad：さいしょの タップで 同じ Audio に 無音を ならして 解錠（fetch の あとでも 鳴る）。
  - 動画の ナレーション用：`&voice=`（`VOICES` の 一覧だけ。ほかは いつもの 声）と `&style=narr`（大人むけの 落ちついた 語り）。ゲームは つけないので キャッシュも いつもの まま。
  - 検査：`server/test/tts.test.mjs`、`server/test/e2e/browser-speech.mjs`（503 → 端末の 声、/api/tts が あれば そちら）。
- **効果音**：`sfx.js`。音は 木琴（マリンバ）を 物理モデルで 鳴らした 自作の 音（`docs/make-sfx.py` が 作る `assets/sfx/correct.mp3`・`wrong.mp3`。正解＝ソ→ド、不正解＝ミ→ド の 低め。ハッシュは `assets/sfx/SOURCE.json`）。前の uisfx「glass」は 不自然 と 言われて やめた。さいしょの タップで 読んで おき、読めない とき（file:・オフラインで まだ 読んで いない）は WebAudio で 作る 音で 代わりに 鳴らす。`sfx.judge(correct)` … true ＝ピンポン、false ＝ブッブー、それ以外は 鳴らさない。
  - オンライン：`net-client.js` の `quiz/gym/eiken/quick/farm/fw/hw/wh:result`・`interview:turn`・`review:result`（ok）・`battle:turn`（quiz.correct）で 鳴らす（判定は サーバー）。
  - オフラインでも 判定する 画面：game.js の レッスン・fishing.js・adventure.js の バトル。`answer:result` では 鳴らさない（その 3 つと 二重に なるので）。
  - ♫ を 切ると 鳴らない（game.js が `configureSfx({ isMuted })`）。

## なまえを えらんで 入る（クラスの QR／2026-11）
クラスコードと なまえを 打たずに 入る 入り口（要件の F7）。**はじめは オフ**：子どもの なまえを 一覧で 見せるかは 教室が きめる。
- **スイッチ**：先生の `/teacher/kids`（運営は `/admin/kids`）の クラスの カードの 下「📱 なまえを えらんで 入る」。置き場は 幼児モードと 同じ `kids-mode.json` の `pick`（`kids-store.js` の `pickOf` / `setPick`・幼児モードとは べつの スイッチ）。
  オンに すると 入り口の URL（`/?class=<コード>&k=<署名>`）と QR（サーバーが `qrcode` で かく SVG・`/teacher/api/kids/qr`。外の サービスは 使わない）・「QR を 印刷」。
- **署名**：`server/src/classroom/join.js` の `signJoin`（REPORT_SECRET の HMAC・クラスに むすぶ・`join|` を まぜる＝レポートや 教室の ようすの リンクとは 読みかえられない・400 日）。REPORT_SECRET が ないと 使えない。
- **口**：`GET /api/join/names?class=&k=`（1 分 30 回・no-store）。返すのは **その クラスの 子の なまえ だけ**（先生の 行・停止の 行・クラスコードの 書いて いない 行は 出さない・60 人まで）。
  署名ちがい・オフ・知らない クラス・だれも いない は どれも 同じ 404 `{ok:false}`。
- **ロビー**（`lobby.js`）：`?class=` と `&k=` が あって なまえが 返った ときだけ `#net-lobby.pick`（大きな なまえの ボタン `#net-pick-list`。入力の 欄と 先生パスワードは しまう）。
  「なまえが ない とき」で いつもの 入力に もどる（先生は ここから 先生パスワードで）。**一覧は 入力の かわり**：入れるか どうかは いつもの `onAuth`（名簿・停止・クラスコード・先生パスワード）。
- 気を つける こと：QR を 持つ 人は クラスの 子の なまえを 見られ、どの 子としても 入れる（なまえを 打って 入るのと 同じ 強さ。本人の たしかめは ない）。QR を かえたい ときは いまは REPORT_SECRET を かえる しか ない（オフに すれば すぐ 止まる）。
- 検査：`server/test/join-names.test.mjs`。
- **教室 まとめての QR（2026-11）**：教室（`/admin/classrooms` の 1 行＝いくつかの クラス。IAC の iac202601〜 など）を 1 つの QR に。`/teacher/kids`・`/admin/kids` の 上の「🏫 教室 まとめての QR」で オン（`kids-mode.json` の `rooms`・これも はじめは オフ）。
  URL は `/?room=<教室の id>&k=<署名>`（`join.js` の `signJoinRoom`・`joinroom|`＝クラスの QR とは べつの 署名）。口は 同じ `/api/join/names?room=`：教室の クラス ぜんぶの 子を `entries`（`{name, class}`）で 返す。
  ロビーは なまえを おすと **その 子の クラス**で 入る。同じ なまえが 2 クラスに いる ときだけ クラスを 小さく そえる。教室の 先生は じぶんの 教室だけ。
- **ホーム画面の アイコンも QR を おぼえる**：`index.html` が `class`・`room`・`k` を manifest へ わたし、サーバーが start_url に のこす。QR から 追加した アイコンは ひらくと なまえの 一覧が 出る。

## 「ABC と おと」の 材料（中身・絵・うた／2026-11）
- **中身**：`server/src/game/abc-data.json`（`order`＝音の 順 s a t p i n …、`letters`＝文字ごとの 絵の ことば 3 つ、`cvc`・`digraphs`・`magicE`＝ことばと `parts`）。
  1 つの ことばに 1 つの 絵・1 つの 絵に 1 つの ことば。たしかめるのは `node server/scripts/check-abc-data.mjs`（`abc-art.js` の `abcProblems`）。
- **絵は サーバーが かく**（`server/src/game/abc-art.js`・口は `server/src/reading/abc-art-route.js`）：`/abc-art/letter/<a-z>.svg?case=both|upper|lower`（つみき。
  **文字は じぶんで かいた 線**＝端末の フォントに たよらない・a と g は 1 かいだて）、`/abc-art/word/<ことば>.svg`（絵だけ・字なし）、`/abc-art/cover.svg`。
  `?v=ABC_ART_VERSION` で 1 年 キャッシュ。絵文字は `reading-art/emoji/`（Twemoji・CC-BY 4.0）。
- **うた**：`abc-chant.js` の `playChant(lines, { accent, slow, onLine, onEnd })` / `stopChant()`。はくの 音は WebAudio（`sfx.js` の `sfxContext`・♫ を 切ると 音も 声も 出さず 行だけ 進む）。
  声は `playVoice`。**サーバーの 声は アメリカ式だけ**。`accent: 'uk'` は 端末に イギリスの 声（en-GB）が ある ときだけ それで 読む。
- 検査：`server/test/abc-data.test.mjs`。

## ABC と おと（幼児モードの カード／2026-11）
IAC（アイエイシー英会話）むけ。幼児モードの ホームの 2 ばんめの カード（きょうの がくしゅう → **ABC と おと** → ほんだな → しまの ちず → きせかえ → あそぶ。6 まいまで・iPad の はばは 3 × 2）。
**オン・オフの スイッチは ない**（幼児モードで いつも 出る）。先生の 画面にも 設定は ない。
- **きまりは サーバー**：`server/src/game/abc.js`（中身は `abc-data.json`・絵は `abc-art.js` → `/abc-art/…`）。置き場は `DATA_DIR/abc.json`（`server/src/abc/store.js`：子どもの 記録と、教室ごとの 設定）。
  部屋は `abc:open` → `abc:state`、`abc:start {review?}` → `abc:ask`、`abc:answer {choice | order | seen}` → `abc:result`（`ClassRoom.onAbc`）。**正解は 答えた あとの へんじで はじめて とどく**（つづるは ブロックを ばらばらの 順で 送る）。
- **2 つの 段階**。ちいさい 子（もじ 1 つずつ・`order` の 順）：① 見て きく（show）② みじかい うた（chant）③ きいて 3 つの もじから（name・sound）④ おなじ おとで はじまる 絵（picture）。
  小学生（ルール 1 つずつ）：① 3 もじを つなげて よむ（cvc-a/e/i/o/u・blend）② 2 もじの おと（sh ch th ck ng・pair）③ ながい ぼいん（a_e i_e o_e u_e・word）④ もじの つみきを ならべて つづる（spell・おすだけ）。
  **8 割で つぎへ**（判定の ある 5 問の うち 4 問）。26 もじ ぜんぶで 小学生の 段階へ。ぜんぶ おわったら「ほんだなへ」（`reading.open()`。**ABC・おとの 専用の 本は まだ ない**ので いつもの 本だな）。
- **どこから はじめるか は 自動**（学年の 欄が ないので）：ロードマップの 段階が A・B・C＝もじの 問題 4 問（順番を 4 つに わけて 1 問ずつ。**はじめから つづけて できた ぶんだけ** とばす）、ぜんぶ できたら つなげて よむ 3 問。
  段階 1 から 上＝つなげて よむ 3 問から（1 問 以下なら もじの 4 問を 足す）。つなげて よむ 3 問が ぜんぶ できたら cvc の ルールも とばす。
- **にがて**：まちがえた もじ・ルールを `weak` に ためる（5 まで）。「にがてを まとめて ふくしゅう」（`abc:start {review:true}`・8 問まで）で できたら へる。段階は すすまない。
- **記録は いつもの 道**：1 問 1 行の 学習ログ（`abc:<形>:<もじ／ルール>:<n>`・きく＝`listen`・つづる＝`writing`・ほか＝`reading`）、roblox_events の quiz（world=`abc`・level=`ABC`。**ことば（cat など）だけ** `word` を のせる＝苦手単語の 箱に 入る。もじ 1 つは 入れない）、XP 1 問 2。
  **コインは 出さない**（新しい コインの きまりを 作らない）。`quizEventOf` は `abc` を とばす（二重に 数えない）。1 回ぶん おわる たびに `type: 'abc'` の 1 行（もじ・ルールの 数）＝レポートが 読む。
- **保護者レポート**：`aggregate.js` の `fiveNumbers` の `abc`（その 期間の おわりまでの いちばん 新しい 数・記録の ない 子は null）。LINE の 画像に「ABC と おと　おぼえた もじ ○/26・よめる ルール ○こ」の 1 行（`render-tex.js`）、
  吹き出し（`line.js` の `fiveText`）、保護者ページ（`reading/pages.js` の `fiveHtml`）。
- **設定は 運営だけ**：`/admin/abc`（`server/src/abc/admin.js`）。教室（クラスコード）ごとに もじの 見せ方（いっしょに＝初期値／大文字から／小文字から）・発音（アメリカ式＝初期値／イギリス式）・おとの 順番（初期値＝s a t p i n …）。先生の 画面には 口が ない。
- **画面**：`abc.js` + `abc.css`（`#abc-dialog`・`translate="no"`）。1 がめん 1 もん・おすだけ。**ぜんぶの 文に 🔊**（もんだい・えらぶ もの・ボタンの なまえ・せつめい・うたの 行）。
  **こどもに 見せる 文字は ひらがな＋えいご＋アイコンだけ**（かんじ・カタカナを 入れない。「ルール」は 画面では「きまり」）。すすみぐあい：ちいさい 子＝A〜Z の ます、小学生＝「よめる きまり ○ こ」。
- **声の かぎり**：合成の 声は もじの「おと」だけを 正しく 言えない。おとは かならず ことばで きかせる（うた＝"S, s, sun"、きく 問題＝ことばを きいて はじめの もじを えらぶ）。
  イギリス式は たんまつの イギリス英語の 声（なければ いつもの アメリカ式の 声）。**実機で 聞いて たしかめること。**
- 検査：`server/test/abc.test.mjs`（とばす・8 割・答えは 先に 送らない・記録・にがて・設定は 運営だけ・レポート）。

## 絵本を Roblox 版へ（自動アップロード／2026-11）
くわしくは `docs/ROBLOX_BOOKS.md`。
- **Secrets なしの 一発（2026-11）**：Windows で `.\scripts\roblox-books.ps1`（鍵を fly secrets へ → サーバーの 中で `server/scripts/roblox-books-run.mjs` が ぜんぶ おくって 審査を 見はる → 貼る 1 行を クリップボードへ）、Studio に `roblox/oneline/books-open-all.txt`。本は 合言葉なしの `/api/public/books…`（`server/src/roblox/books-public.js`・答えは 入らない・記録と コインは つかない）。
- **絵を PNG に**：`server/src/roblox/book-png.js`（@resvg/resvg-js・1024×768・`still`）。`artHash` ＝ 場面＋`ART_VERSION`＋大きさ。
- **上げる 係**：`server/src/roblox/book-assets.js`（`BookAssets`）。Open Cloud の `POST /assets/v1/assets`（multipart）→ `operations/<id>` を 見て assetId と 審査。
  記録は `DATA_DIR/roblox-book-assets.json`（絵ごとに hash・op・assetId・state）。同じ 絵は 1 回・かわった 絵だけ 上げなおす・rejected は 上げなおさない・429 は Retry-After で 待つ。
  **鍵は 環境変数だけ**（`ROBLOX_OPEN_CLOUD_KEY`・`ROBLOX_CREATOR_GROUP_ID` か `ROBLOX_CREATOR_USER_ID`）。なければ 何も しない。エラーの 文は `scrub()` を 通す（鍵を 出さない）。
- **運営**：`/admin/roblox-books`（数・はじめる／つづける・止める）と `server/scripts/roblox-upload-books.mjs`（`--dry-run`）。先生の 画面には ない。
- **Roblox へ わたす**：`server/src/roblox/books-api.js`（`/api/roblox/books`・`/books/<id>`・`/books/check`。合言葉は sync.js）。絵は 審査を 通った ものだけ（まだは `image: ""`）。
  クイズは 英検ドリルと 同じ：答えは 署名つき token の 中・判定と 記録は Web（`quiz` world=`reading`／ ✓ で `book`。Web と 同じ 形）。Roblox は クイズ 8 割で ✓。
- **Roblox 側**：`roblox/USpeakBooks.server.luau`・`USpeakBooksClient.client.luau`（タグ `USpeakBookShelf`・属性 `Stage`）。**Studio では まだ 動かして いない。**
- 検査：`server/test/roblox-books.test.mjs`（にせの Open Cloud）。本物の Roblox には つないで いない。

## Roblox 版の「ABC と おと」と 一発 セットアップ（2026-11）
- **問題・判定は Web と 同じ `server/src/game/abc.js`**。口は `server/src/roblox/abc-api.js`（`/api/roblox/abc/state|start|answer`・X-USpeak-Key）。1 回ぶんは サーバーが おぼえ、Roblox には sid と 選択肢だけ（答えは 先に 出ない）。
  記録は Web の 子と 同じ `AbcStore`（Roblox の 名前 → `childFor` で Web の クラス・名前）。判定した 答えは `quiz`（world=abc・source=roblox）、おわると `abc` の 行。
- **Roblox 用に ことばを しぼる**：`abc.js` の `withWords(exclude, fn)`（同期の あいだだけ 中身を さしかえる。もじ・きまりの id は かえない）。外すのは `abc-assets.js` の `ROBLOX_BLOCKED`（bath・underwear・mouth・hug・leg・foot）と、まだ 審査を 通って いない 絵の ことば。そろうまで `start` は `pictures`。
- **絵カード**は 絵本と 同じ `BookAssets` で 上げる（`withAbc()`：1 ことば＝ページの ない 1 冊 `abc-<ことば>`・管理ページでは 1 行に まとまる）。もじは 上げない（Roblox で 字として 出す）。
- **Roblox の スクリプト**：`roblox/USpeakAbc.server.luau`・`USpeakAbcClient.client.luau`（こえは 出ない＝「きく」問題は 絵と もじを 見せる 形。型の 注釈なしの ふつうの Lua で 書いて あり、luaparse で 文法だけ 検査）。Studio では 動かして いない。
- **一発 セットアップ**（Studio の コマンドバーに はる）：`roblox/setup-abc-place.lua`（ABC の place）・`roblox/setup-books-place.lua`（えほんの place・本だな 12 こ）。作るのは `scripts/make-roblox-abc-setup.py`・`make-roblox-books-setup.py`。スクリプトを なおしたら 作りなおす（`server/test/roblox-setup.test.mjs` が 見つける）。手順は `docs/ROBLOX_ABC.md`・`docs/ROBLOX_BOOKS.md`。
- **Roblox だけで うごく「ABC と おと」**：`roblox/USpeakAbcLocal.server.luau`（`abc.js` の きまりを Lua に うつした もの・HTTP も Secrets も なし・絵は emoji・きろくは DataStore）。貼るのは `roblox/oneline/abc-local-all.txt`（1 行）。中の ことばは `node server/scripts/make-roblox-abc-local.mjs` → `python3 scripts/make-roblox-oneline.py` で 作りなおす。`abc.js` の きまりを かえたら こちらも 合わせる（`docs/ROBLOX_ABC.md`・`server/test/roblox-abc-local.test.mjs`）。

## 入ったら すぐ「せかいを えらぼう」・えらんだら すぐ はじまる（2026-11）
- **幼児モードは やめた**（`config.kidsMode`＝`KIDS_MODE=on` で もどる。コードは のこして ある：`kids.js`・`kids-store.js`・`/teacher/kids`）。オフの あいだは 部屋が だれも 幼児モードに せず、🧸 も よみあげ ボタン（`read-aloud.js`）も 出ない。`/teacher/kids`・`/admin/kids` は「なまえを えらんで 入る（QR）」だけ のこる。
- **だれでも、入った とき（この ページで はじめての welcome）に しまの ちずが ひらく**（`net-client.js` の welcome：`rpg.openMap()`。つなぎなおしでは 出さない・ほかの 画面が ひらいて いたら 出さない）。
- **カードを おすと、その 島の「だいひょうの 場所」が すぐ ひらく**（`net-client.js` の `QUICK_SPOT`。`rpg.js` の 地図が `uspeak:mappick` を 出し、島に ついたら 戸口の 前に 立たせる＝いつもの 戸口の しくみで ひらく）。
  メイン＝英単語ハウス（やさしい）・ABC＝つみきの いえ・よみもの＝本だな・しゅくだい＝一覧・つり＝池・ことばの学校＝やさしい 小屋・アリーナ＝やさしい 台の バトル・英検＝リーディング・のりもの＝AURORA KART（`racers.open()`）・まちづくり＝ブロックの ひろば。
  「はなす」で ひらく 場所（のりもの・アリーナ）は そばに 立たせて `enter()` を 呼ぶ。**つり島は `spot.x/z`（立つ 場所）。`cast` は 水の 中**（そこに 立たせて 出られなく した ことが ある。`fishworld-island.js` に たすけ舟）。
  島を 足したら `QUICK_SPOT` に 1 行（書かなければ 何も ひらかない＝歩いて さがす）。
- **ABC の 島**（`abc-island.js` + `abc-island.json`・HUBS / ACTIVITY_HUBS の `abc`・おすすめの 2 ばんめ）：つみきの いえに 入ると `abc.open()`。

## 2026-11 の まとめて（住民・小物・パネル・カートの メニュー）
- **住民は 人ごとに ちがう 見た目**（`villager.js`）：たね（`villagerSeed(spot)`＝なまえ＋id）から はだ・かみの 色と 形（12）・ぼうし・こもの（めがね・マフラー・エプロン・ひげ…）・せの 高さ・ズボンを 決める。服の 色は データの まま。乱数は 使わない＝同じ 人は いつも 同じ。島（`island-kit.js` の `person`）・家の 中（`island-interior.js`）・U-Speak島（`game.js`）が 同じ 関数。
- **内装の 小物は 部屋の 役わり**（`interior-props.js`）：`themeOf(島, spot)` → books（本だな・本の 山）/ listening（スピーカー・音符）/ writing（つくえ・紙・えんぴつ）/ speaking（マイク・ふきだし）/ quiz（黒板・つくえ）/ gym / dojo / pet（たまご）/ ride（タイヤ・コーン）/ shop（たな・木箱）/ stars。色は 宇宙に よせない。通り道（|x| < 2.4）は あける。`decor` の ある お店（shop-interiors.js）には 足さない。
- **島に ついたら えらぶ パネル**（`mini-pick.js` の `createIslandPick`・`net-client.js` の `PICKS`・見た目は `world-picker.css` の さいご）：ミニゲーム島＝どっちの ゲーム、英会話島＝どの 家、英検の 7 島＝どの 館。しまの ちずで えらんだ とき（`uspeak:mappick`）だけ 出る。とじれば 島を 歩ける。**英検の 島は もう すぐ 部屋に 入らない**。島を 足す ときは `QUICK_SPOT` に `'*'` と `PICKS` に 1 行。
- **AURORA KART の かんたん メニュー**（`racers.js` の `simpleMenu`・`arcade-fit/racers.css` の `body.uspeak-simple`）：① コース ② くるま ③ えいごの レベル → ▶ スタート。ほかは「⚙ せってい」の 中（消して いない）。
- **ランキング・ロードマップも ブランド色**（`rank.css`・`roadmap.css`）。

- **すがたやは 40 体**（2026-11）：前の 8 体＋ `avatar-bodies.js` の `SPECS`（とくちょうの 表）から 組み立てる 32 体。足す ときは 表に 1 行＋ `wardrobe.json` に 1 行（300 コイン 以上は レベル 5 から）。
- **土地島・ぼくじょう島にも えらぶ パネル**（`PICKS.land`・`PICKS.farm`）。
- **つりばの 3D**（`fishing-zone-preview.js`）：U-Speak島の つりの 画面の 左で、えらんだ 池・川・海の もけいが まわる（魚の プレビューと 同じ renderer）。ずかん・つれた さかなでは 魚の 写真に もどる。
- **おうちの ひとの LINE の QR の 横に 見本**（`parent-qr.js` の `sample()`・`assets/guide/line-sample.jpg`＝じっさいの LINE の 画面・名前は ぼかし ずみ）。差しかえる ときも 名前と 教室名を ぼかす こと。
- **もちもの（#bag-dialog）も 異次元・ブランド色**（`cosmic-panels.css` の さいご）。

- **なかま 100 ぴきは ひとり ひとり ちがう**（`rpg-models.js` の「ひとり ひとりの とくちょう」）：形（10）× 地域（10）に、こもの（地域ごとに 10：むぎわらぼうし・ちょうネクタイ・はなかんむり・めがね・マフラー…）・かお（4）・もよう（5）を 重ねる。頭の 場所は 形ごとの 表 `H`。形を 足したら 表にも 足す。
- **ぼうけんの ノート（#rpg-dialog）も 異次元・ブランド色**：わくは ぜんぶの タブ、中身を くらく するのは なかま ずかんだけ（`#rpg-content:has(.rpg-cards)`）。ほかの タブを くらく する ときは 明るい カードの 字の 色を たしかめる こと。
- **ミニマップは 2 倍の こまかさ**（`game.js` が canvas を 360×280 に して `setTransform(2,…)`。描く がわは 180×140 の 座標の まま）。島の 下絵（`island-kit.js` の `paintBase`）も 2 倍。海は こい 緑・場所の まるは 大きく・行き先と 自分は ふわふわ 光る。わくは `cosmic-panels.css` の `.map-panel`。

- **先生コンソールは 番号つきの まとまり**（`teacher.js` の `.net-t-group`・見た目は `cosmic-panels.css`）：① あつめる ② クラスの ルール ③ どうぐ ④ 今日の おつかい ⑤ いま いる 生徒。ボタンの id は そのまま。
- **おつかいクエストの 板は かんたんに**（`mission.js` の `renderBoard`）：3 つの しるし（うけとる → えいごで はなす → とどける）・「つぎの おつかい」を 1 つ 大きく・島の 外で カードを おすと そのまま おつかい島へ とぶ（`choose` が `goToIsland()`）。`#mission-travel` は のこして ある（e2e が 押す）。

- **じどうで あるく**（`task-guide.js` の `walk / steer / stopWalk`・カードの `.task-walk-btn`）：光の 道の つぎの 角への 向きを `game.js` が 毎フレーム もらって 歩く（当たり判定は いつもの まま）。引っかかったら よこに よけ、4.5 秒 すすまなければ つぎの 角まで はこぶ。自分で うごかす・画面が ひらく・家に 入る・つく で 止まる。行き先が ほかの 島なら ひこうき。
- **メインの島の 🏠 は スタートに もどる**（前は 2D の 地図）。2D の 地図（`main-island.js` の `open`）は 消して いない（検査・写真用）。
- **冒険ノートの はじめの ページ**（`adventure.js` の `renderJourney`）：物語と 大きな「すすめる」が 上、数字が 下、ほかは `<details class="ad-more">`「もっと 見る」。
- **つり島の 問題も 異次元・ブランド色**（`cosmic-panels.css` の `#fw-dialog[data-view="ask"]`。宿題の 同じ 部品は かえて いない）。
- **AURORA KART は 前へ じどう**：`simpleMenu` が あちらの「オート加速」を 入れ、指の ボタンは 左右だけ（`arcade-fit/racers.css`）。

## きせかえ島で 買える すがた（アバター／2026-11）
- **5 つめの スロット `avatar`（すがた）**：`wardrobe.json` の 先頭に 8 人（ねこ・パンダ・にんじゃ・ひめ・ヒーロー・きし・ドラゴン・ユニコーン。`kind` ＝ 体の id `av-…`）。島には 5 けんめの 店「すがたや」（`avatar-shop`）。
- **体は `avatar-bodies.js`**（three だけ・サーバーの 検査からも 読める）。`buildPremiumAvatar(id)` は `buildAvatar` と 同じ 約束（`userData.limbs`・`anchors`）で 返すので、歩く うごきも ぼうし・めがね・かばんも そのまま。
- **買う・きるは ほかの きせかえと 同じ 道**（`wear:buy` / `wear:put`・部屋が コインと レベルを 見る）。サーバーの コードは 足して いない：きて いる すがたは `player.avatar` の `wear` に 入って くばられる。
- **体を きめるのは `avatars.js` の `bodyConfig(config, items)`**：`wear` に すがたが あれば 体は それ、なければ はじめに えらんだ 体。じぶん（`setupAvatars` の `apply`）・となりの 子（`remote-players.js` の `bodyOf`）・店の プレビュー（`wardrobe.js` の `redress`）が 同じ 関数を 使う。
  部屋へ 送る `avatars.config` は はじめに えらんだ 体の まま（`avatars.body` が いま 見えて いる 体）。「ぬぐ」と はじめの 体に もどる。
- 値段の きまり（`wardrobe.test.mjs`）：300 コイン 以上は レベル 5 から・どの スロットにも レベル 1 で 100 コイン 以下が 1 つ。

## フォニックス（もじの「おと」／2026-11）
- **フォニックス＝もじの なまえ（エー・ビー）では なく、ことばの 中の おと（/æ/ /b/）を おぼえ、つなげて よむ きまり**（c-a-t → /k/ /æ/ /t/ → cat）。合成の 声は おと 1 つだけを 正しく 言えないので、**おとは 音の ファイル**。
- 表は `phonics.js`（ページと サーバーが 同じ ものを 読む）：`PHONEMES`（37 の おと）・`letterSound(l)`・`soundsOf(word, parts)`（さいごの e で ぼいんが ながく なり e は だまる＝null、やわらかい c・nose の s＝/z/・u_e の /uː/ と /juː/ は ことばごとの 例外）。
- 音は `assets/phonics/<id>.mp3`（`docs/make-phonics.py` の フォルマント合成・U-Speak Lab の 自作・ハッシュは `SOURCE.json`）。口は `/phonics/<id>?v=<版>`（`server/src/abc/phonics-voices.js`）。**運営が /admin/abc で ろくおん した 声（DATA_DIR/phonics/<id>.wav）が あれば そちら**。版は `abc:state` の `phonicsV`（ろくおんが かわると かわる）。
- 鳴らすのは `phonics-play.js`（WebAudio で ならべて 予約・♫ オフでは 鳴らさず 光だけ すすむ）：`playSounds(ids, {gap, onStep})`・`blendSounds`（1 つずつ → かさねて つなげる）。
- 画面（`abc.js`）：もじの カード＝「🔊 なまえ」と「🔉 おと」、うた＝なまえ → おと 2 かい → ことば（`abc-chant.js` の 行の `steps`）、つなげて よむ・きまり＝つみきを おすと その おと・「🔉 つなげて きく」で 光りながら つなげる（こたえの あとに ことば）、きいて えらぶ もじ・2 もじの 🔉 は おと、つみきを ならべる＝おすと その おと。
- 部屋は もんだいに `sounds`（つみきごと）・`sound`（もじ）・ブロックの `s` を のせる（答えは のせない）。検査：`server/test/phonics.test.mjs`。
- **合成の 音は 人の 声に かなわない。実機で 聞き、できれば /admin/abc で 先生の 声を ろくおん する こと。**

## タスクの 光の みち：ぜんぶの 行き先（2026-11）
- **行き先は 3 しゅるい**（部屋の `engine.js` の `goOf`）：メインの島の 場所（道に そった 矢じるし）・ほかの 島（✈ が 光る → ついたら その 島の 建物まで まっすぐの 矢じるしと 光の柱）・画面の ボタン（`{ ui: 名前 }`＝その ボタンが 光る。名前は `task-guide.js` の `UI` の 表と そろえる）。
- 「じどうで あるく」は どれでも 動く：メインの島＝歩く、ほかの 島＝ひこうきで とんで ついたら そのまま 入口まで 歩く（`pending`）、ボタン＝かわりに おす。行き先の すぐ そばは「ついた」（`closeBy`）。
- フォトブース・きせつの クイズ（Web 版に ない）の 行は 出さない（`plan`）。入れない 島の タスク だけの 章は ごほうびを 出さない（`settle`）。
- **テーマパークだけは 島の 中の みちが 出ない**（island-kit の 島では ない）。✈ の 光と ひこうきまで。
- たしかめた こと：はじめの100 の 行き先 40 しゅるいを 実ブラウザで 1 つずつ（みちが 出る・自動で つく）。プレミアムの 島は 🔒 の 画面で 止まる（部屋が タスクを とばす）。

## きせかえの 品（2026-11 に ふやした）
- ぼうし 43・かお 40・せなか 41・むね 43（＋すがた 40）。新しい 形 49 こは `wardrobe-models.js` の「2026-11 に ふやした 形」。色ちがいは `wardrobe.json` に 1 行。棚は スロットの 中で 安い 順。

## メインの島の 季節（かざり と リアルな 木／2026-11）
- **季節は 日本の 月**（3〜5 春・6〜8 夏・9〜11 秋・12〜2 冬。サーバーの `daily.js` の `seasonFor` と 同じ 分けかた）。見た目だけ なので ページが 決める（`main-seasons.js` の `seasonNow()`）。
  ためしに 見る：URL に `?season=spring|summer|autumn|winter|xmas`、または `uspeak.rpg.main.setSeason('summer')`。
- **かざり（`main-seasons.js`）**：大通りの 旗（前の `bunting`）と、屋台の 南の しばふ（`main-world.js` の `FEST`＝34.5, 28）の 見せ場を 季節ごとに。
  **見せ場は どの 季節も 大きな 木**（`real-trees.js` の `singleBroad` / `singleFir`）：春＝さくら（花びら・根もとの 花）／夏＝みどりの 木から ちょうちんの ひも・たいこ・夜は 花火／秋＝もみじ（わらと かぼちゃ・落ち葉）／
  冬＝イルミネーション（またたく）・雪。**12 月は クリスマスツリー**（かざり・らせんの あかり・星・プレゼント）、1〜2 月は 雪の もみの 木と 雪だるま。
  作るのは いまの 季節の 分だけ。光は 夜に 強く（`island.setNight` を `main-world.js` が つつむ）。動くのは 点（花びら・雪・花火）と 光の 強さ だけ。当たり判定は 見せ場の まんなか 1 つ。
- **木（`real-trees.js`）**：メインの島の 木は 箱では なく、えだわかれの 幹＋葉の 絵を はった 板。3 しゅるい（ひろい 木・もみ・ほそい 木）を 1 回 作って InstancedMesh（描く 回数は 6）。
  葉の 色は 季節で 木 1 本ずつ（春は さくら色が まざる・秋は 赤 だいだい 黄・冬は 落葉樹が はだか）。葉は 風で ゆれる（頂点シェーダー）。**モデルの ファイルは 読んで いない**（three だけ・絵は canvas）。
  ほかの 島の 木は まだ 箱（`island-kit.js` の `tree`）。ひろげる ときは 同じ `createRealTrees({ root, trees })` に 場所を わたす。

## 島の キャラクター（デザイン案／2026-11）
- `island-cast.js`：島ごとの「かお」に なる 20 人（`CAST`・`buildCastMember(id)`）。球・カプセルなどの まるい 形の 2.4 頭身。デザインの きまり 5 つは ファイルの 頭。
- **島に 立って いる**（`placeHost`）：island-kit の 島は ついた 場所の よこ（船着き場の 右・メインの島は スタートの 左）、U-Speak島は `game.js`、テーマパークは `themepark.js`。英検の 7 島は 同じ 先生（`castIdOf`）。
  その 場で ゆれて、近づくと こちらを 向いて はねる・名札は 近くで 出る。**当たり判定も 話しかけも まだ ない**（かざり）。一覧は `/dev-cast.html`（1 人ずつ 描いて 右上に シルエット。`?only=main,pet` で しぼる）。

## アバターの デザイン案（まるい 体・56 体／2026-11）
- `avatar-chibi.js`：はじめの すがた 16（きぐるみ 8・人 8）と すがたやの 40 体を、島の キャラクターと 同じ まるい 2.4 頭身で（`CHIBI`・`buildChibiAvatar(id)`・とくちょうの 部品は `FEAT`）。id は いまの アバターと 同じ。
- **ゲームの アバターは これに おきかえた**（2026-11）：`avatars.js` の `buildAvatar` が さいしょに `buildChibiAvatar(id, {skin, shirt})` を 呼ぶ（すがた えらび・じぶん・となりの 子・お店の プレビュー・つりの 画面は ぜんぶ ここを 通る）。お店の カードの 絵（`wardrobe-models.js`）も 同じ。
  前の 箱の 体（`buildAvatar` の のこり・`avatar-bodies.js`）は 消して いない：表に ない id の ときの 予備。もどすなら `buildAvatar` の 1 行目を 外す。
- 約束は 前と 同じ：`userData.limbs`（左あし・右あし・左うで・右うで の Group・つけねで ふれる）・`anchors`（head・face・chest・back・hand）・`worn`。きせかえの 品は 箱の 体の 大きさで 作って あるので、anchor を 大きく して ある（頭 1.5 倍・顔 1.25 倍）。
  手に もつ もの・うでの はね（`HELD`・`inArm`）は うでの Group の 中＝うでと いっしょに ふれる。一覧は `/dev-cast.html?set=avatars`。

## 2026-11 の おわりに かえた 見た目（住人・たべもの・水・走る）
- **住人も まるい 体**（`villager.js` の `buildVillager`）：島・家の 中・U-Speak島の 人は ぜんぶ island-cast の 体。たねから きまる 見た目（はだ・かみ・こもの・せ）は 前と 同じ 考えかた。`box` の 引数は もう 使わない。
- **たべものは リアルな 3D**（`food-real.js`）：屋台の 9 しゅるい。`foodShots()` が 小さな レンダラーで 1 回だけ 絵に して すぐ 捨てる（WebGL を 持ちつづけない）。屋台と かばんの 絵文字と 入れかわる（`food.js` の `realPictures`）。かばんの 3D（`bag-preview.js` の `foodModel`）も 同じ 形。一覧は `/dev-food.html`。
- **水**（`water-fx.js`）：海・メインの島の 入り江・つり島の 池と 川が 同じ シェーダー（波・空の うつりこみ・太陽の きらめき・浅い ところの 光の あみ）。絵も 2 回目の 描画も 使わない。海の 頂点は 180×180 → 96×96 に へらした。時間・夜・太陽は `SEA`（atmosphere.js が 書く）。
- **走る**：同じ むきに **1.5 秒** すすむと 走る（`game.js` の `RUN_AFTER`。前は 3 秒）。
- メインの島の 木は スタートと 屋台の 南（カメラの 手前）には 立てない（葉が 画面を かくした）。
- **家**（`real-house.js`）：island-kit の `house()` は かわらの 切妻屋根・しっくいと 木の ほねぐみ・ガラスの まど（夜に 灯る）・よろい戸と 花の はこ・ひさしの ある 戸口。**島の 家を ぜんぶ まとめて 材質ごとに 1 メッシュ**（かべ・屋根・木・ガラス＝島 1 つで 4 回の 描画）。色と 大きさは データの まま。屋根の 上の かんばん（`main-world.js` の `facade`）は まだ 箱。
- **地面**（`ground-fx.js`）：草・土・道の タイル（flat の 箱）に、世界の 位置で ひく こまかい もようを かけ算（描く 回数・頂点は そのまま）。
- **きせかえの タブの 絵**（`wear-real.js`）：すがた・ぼうし・かお・せなか・むねの 5 つを リアルな 3D の 絵に（`food-real.js` の `renderShots` を 使う）。**きせかえの 品 167 点・ぶき 100 本・ブロック・かぐは まだ 箱の まま。**
- 季節の 大きな 木（`FEST`）は 西の しばふ（-23, 23.5）へ うつした：屋台の 南だと カメラの 手前に 入って 画面を かくした。

## 2026-11 の おわり その 2（かんばん・ゲート・島の 木・ぶき・きせかえの 品・ブロック・かぐ）
- **屋根の かんばん と ゲート**（`roof-signs.js`）：`roofSign(kind, color)` が 12 しゅるいの なめらかな かんばん（さかな・スマホ・いなずま・えんぴつと ノート・本・ピザ・バーガー・Tシャツ・ブロック・たてと けん・家と かぎ・ABC）。`main-world.js` の `facade` は かんばんが あれば 屋根の 上の 箱（y が 7 より 上）を 置かない（わきの 小物は 箱の まま）。お店を 足したら `SIGN` に 1 つ。
  `gateModel(color)`＝石の 柱と アーチ・うずを まく 光の まく（`userData.spin(t)` を `main-world.js` の update が 回す）。当たり判定・立つ 場所は 前と 同じ。
- **ほかの 島の 木も リアル**：`island-kit.js` の `tree()` は 場所を ためるだけで、`flushDeco` が 島 1 つぶんを `createRealTrees` に わたす（季節は `seasonNow()`）。ぼくじょう島・土地島・U-Speak島の 木は じぶんの 箱の まま。
- **ぶき 100 本**（`weapon-real.js` の `realWeapon(item)`）：`fishing-models.js` の `equipmentModel` が さきに 呼ぶ（だめなら 前の 箱）。形 10 × 素材 10。形と 材質は 共有（**dispose しない・envMap を 上書きしない**）。弓は にぎりが 原点。一覧は `/dev-weapons.html`。
- **きせかえの 品 87 しゅるい**（`wardrobe-real.js` の `realModel(kind, colour)`）：`wardrobe-models.js` の `itemModel` が さきに 呼ぶ。まるい 体に 合わせて ある（ぼうしは 頭に かぶさる・バッジは 左むね）。一覧は `/dev-wear.html`。フードの 体では ぼうしが 少し 高い。
- **ブロックと かぐ**：ブロックの もよう＝`town-block-tex.js`（canvas）、3D＝`town-real.js`、棚の 絵＝`town-block-icon.js`（2D の まま）。かぐ 11 こ＝`furniture-real.js`（`room-world.js` の `model()`・お店の 絵は `furnitureShots()`）。
  **かぐは 向きを かえると 形ごと 回る**（前は はばと おくゆきを 入れかえた 箱）。しめる マスは 前と 同じ（サーバーと 同じ 計算）。一覧は `/dev-town.html`。
- **地面（2026-11 の 作りなおし・`ground-fx.js`）**：もようは 4 しゅるい（grass・asphalt・cobble・sand＝512px の canvas を 1 まいずつ）。色から 決める（`groundKind`：みどり＝草・くらい 灰色＝アスファルト・ほか＝すな）。`D(…, flat)` の `flat` に `'cobble'` などを わたすと 名ざし（`island-kit.js` の `path()` の 石だたみ）。
  明るさの かけ算＋法線を 少し かたむける でこぼこ。**強さは `KIND` の 表**（強く しすぎると 遠くで ざらつく）。草むら（`grassTufts`）は 草の タイルの 上に 道・小物・建物を さけて 900 まで（InstancedMesh 1 つ・影なし・風で ゆれる・`island-kit.js` の `plantTufts`）。

## 2026-11 の おわり その 3（夜の 光・お店の 時間・じぶんの 家・たべものを わたす・紅葉・広場・会話・家への まねき）
- **地面は やわらかく**（`ground-fx.js` の `KIND`）：もようは ぼかして（`soft`）うすく・大きく。でこぼこ（bump）は 石だたみ だけ。**こまかくて こい もようは この ゲームの 解像度では「すなぼこり」に 見える**と 言われたので、リアルさは 草むら（3D・`plantTufts` 2400 まで）で 出す。強く しない こと。
- **夜の 光**：街灯の 足もとに うすい 光の 輪（`island-kit.js`・加算の InstancedMesh）。家の まどは 1 まいずつ 明るさが ちがい（2 割は 暗い）、ゆっくり ゆらぐ（`real-house.js` の 頂点色と `uTime`）。
- **お店の 時間**（`shop-hours.js`）：夜（世界の 時計の `night`）は お店が しまる。`SHOP_KINDS`（food_shop・wear_shop・block_shop・land_shop・weapon_shop・fish_buy・talk_shop）。あいて いる あいだだけ まどが 光る（`island.setHouseLit`・`main-world.js` の update）。
  しまって いる 店の 戸口は `main-island.js` の `walkIn` が ことわって トースト。**自動の 検査（`navigator.webdriver`）では いつも あいて いる**（`?hours=1` で 本当の 時間・`?hours=closed` で しめる）。時計の ずれは `setClockSkew(state.skew)`。
  `worldHour()`＝世界の 時計を 0〜24 時に（ひるま 7→17 時・夕方 17→19・夜 19→5:30・夜明け 5:30→7）。時計台の はりが 使う。英単語ハウス・ゲート・図書館・じぶんの 家は しまらない。
- **じぶんの 家は はじめから メインの島に**（`main_island.json` の `my_home`＝(-19.5, 10.5)）。戸口で マイルーム（`town.enter({kind:'door'})`）。部屋は `atTownSpot('door')` を メインの 家でも みとめる。出ると メインの 家の 前。
  はじめての 子には かぐ 5 つ（ベッド・つくえ・いす・うえき・ラグ）を 1 回だけ（`server/src/game/town.js` の `starterRoom`・`room_json.starter`）。かぐを 外すと 手に もつ＝おきなおせる（`room-world.js`）。
- **たべものを 住民に わたす**（`food-give.js`・サーバーは `food.js` の `give()`）：かばんの「🙌 もつ」で 頭の 上に かかげ、住民の そばで「わたす」。`food:give {island, spot, id}` → `food:gave`。
  1 こ 1 点（すきな ものは +1）・3 点で ハート 1 つ・ハートは 10 まで・同じ 人に 1 日 3 こ・1 秒に 1 回。置き場は `food_json` の friends。コインも XP も 出ない。
- **秋は 紅葉が ふる**（`main-seasons.js` の `leaves()`：もみじの 形の 板の InstancedMesh・ひらひら 回る）。前の オレンジの 点は やめた。
- **きせかえの カードの 絵**：384px で 焼いて 192px に ちぢめる。かおの 品は 頭の もけいに つけて 撮る（`wardrobe.js`）。
- **広場**（`main-plaza.js`・`plaza-npcs.js`・`plaza-walkers.js`）：メインの島の 東（石だたみ x 57〜85・z 3〜29）。島の 形の 外なので `createIsland` に `annex`（角の まるい 四角の 土地）を わたす。大通りは x 58 まで のばした。
  時計台（71, 6.5）・ふんすい（71, 16）・きせつの イベントの ぶたい（82, 16。中身は まだ・`plaza.eventSpot`）・フリーマーケット 6 けん（かざり だけ）。歩く 人 8・お店の 人 6（**自分の 画面だけの かざり**＝ほかの 子と 位置は そろわない）。
  `rpg.main.nearestNpc(player)`・`.npcs`・`.talkNpc(id)`・`.sayNpc(id, 文)`・`.plaza`。話しかけると window に `uspeak:npc-talk`（cancelable）。ミニマップは `90 + (x-16)*1.2`, `70 + z*1.2` に かえた。
  U-Speak島の 遠くの 山を 立てない 範囲も ひろげた（`game.js`・`atmosphere.js`）。島を ひろげたら ここも。
- **顔つきの 会話**（`npc-talk.js` + `npc-talk.css`・文は `npc-lines.js`・つなぎは `npc-social.js`）：右に 大きな 顔（3D を 絵に）・左下に ふきだし（日本語＋英語・`translate="no"`・lang.json には 入れない）。
  個性 8 つ（げんき・のんびり・てれや・ものしり・くいしんぼう・おしゃれ・しっかり・いたずら。たねから きまる）。あいさつ・時間・季節・好感度で 文が かわる。入れ物は `#ntk`（`#npc-talk` は 広場の ボタン）・ひらいて いる 間は `body[data-npc-talk]`（歩けない）。
  住民の そばで「💬 はなす」（T）。広場の 人は `uspeak:npc-talk` を 受けて 同じ 画面。好感度の 鍵は `<島>:<spot の id>`（広場の 人は `main:<id>`）。
- **家への まねき**：ハート 3 つ（`INVITE_HEARTS`）で 会話の 中で さそわれる。`home:visit {key}` → 部屋が `home:visit:ok` / `home:visit:error`（`not friends yet`・`too fast`・`no such villager`）。**入れるかは 部屋が 決める**。コイン・XP・保存は なし。
  家の 中は `npc-home.js`（木の あたたかい 部屋・個性で 色と 小物・`rpg.attachHome()`＝マイルームと 同じ 作り）。いる 場所は `in:home.<sessionId>`（通話に ならない）。出口は 戸口か「🚪 そとへ」。
- **会話の ふきだしは 英語が 主役**（`npc-talk.js`）：英語を 大きく・日本語を 下に 小さく。画面の 言語に かかわらず 同じ（英語を 学ぶ ための 会話）。
- **図書館**（広場の 北・`main-plaza.js` の `LIBRARY`＝まんなか (70, -14)・南むき）：外がわ＝`library-real.js`、中＝`library-interior.js`、つなぎと 画面＝`library.js` + `library.css`。土地は `PLAZA.annex.z0` を -30 まで のばした。
  入口は `main_island.json` の spot `library`（70, -8.5＝石だんの 上）。お店では ない＝夜も あいて いる。石だんの 高さは `main.floorY`（`rpg.floorY()` が 島の `floorY` も 見る。**となりの 子には まだ 効かない**＝石だんに うまって 見える）。
  中は `rpg.attachLibrary()`（マイルーム・住民の 家と 同じ 作り）。場所は `in:library`（みんな 同じ 部屋・通話なし）。カメラは 南から・左右 ±0.7 rad まで（天井を かくして 南がわを 切って 見せて いるので）。出口は 玄関か「🚪 そとへ」。
  中で できる こと：西の 読書の 部屋の 本だな → `reading.open()`（よみもの島の 本）／東の 自習室の つくえ → `#library-dialog`（しゅくだい＝`homework.open()`・ふくしゅう＝`review:start`・たんごちょう）／司書に 話しかける（あいさつの トースト）。
  サーバーの 変更は なし。2D の 地図（`main-island.js` の 一覧）には まだ のって いない。
- **自習室の「ふくしゅう」は 出会った ことば ぜんぶ**（`review:start {all:true}`・`review.js` の `metWords` / `makeAllSet`）：つり・英単語ハウス・宿題・Roblox の quiz に 出た 英単語から 1 回 10 問。順は いま 時期の にがて → 時期前の にがて → 出会っただけの ことば。
  **コインは にがての 箱に ある ことば だけ**（`pay`）。出会っただけの ことばは 何回でも 出せるので はらわない。記録は いつもの 復習と 同じ（まちがえると にがての 箱に 入る）。1 日 1 回の カードと 先生の Review は 前の まま（にがて だけ）。
- **時計台は 広場の 北東（79, 6.5）**：まんなかに あると 図書館の 入口が かくれた。広場の 人の 名札と 会話の 名前は いつも 英語（`plaza-walkers.js`・`npc-talk.js`）。歩く 8 人は ぜんぶ 広場の 中。
- **じぶんの へや：床は 茶色の タイル・夜は ベッドで ねる**（`room-world.js`）：世界の 時計が 夜（`shop-hours.js` の `isNight()`＝自動の 検査でも 本当の 時計・`?hours=closed` は 夜あつかい）の あいだ、ベッドの そばで「🛏 ねる」。
  横に なって 画面が くらく なり、あさに なるか「おきる」で おきる。**見た目だけ**（時間は とばない・コインも 記録も なし）。ねて いる 間は `blocked()` が ぜんぶ true・`body[data-sleeping]`。かべは 前の まま（宇宙の みどり）。
- **メインの島の 北東の ならび（2026-11）**：おもちゃや（6, -38）の 右に 1 列：英単語ハウス イージー（20）・ミディアム（31）・ハード（42）・ぶきや（53）・きせつの クイズ（64）、戸口は z -35。前は 島の まんなかで 屋根が かさなって 見にくかった。
  道は z -31.5（`roads` の 3 本目・x -6〜68）。土地は `PLAZA.annex.also`（`island-kit.js` の annex は `also` で 四角を 足せる）。レベルの かんばん（11, -2）は もとの 場所。フードトラックと バトルアリーナ 2（かざり）は 少し ずらした。
- **じぶんの へやの パソコンと オンライン ショップ（2026-11）**：かぐ `pc`（0 コイン）を みんなが 1 台 もつ。はじめての 子は はじめの セット（6 こ）、前から へやの ある 子は 1 回だけ（`server/src/game/town.js` の `grantPc`・`room_json.pc`）。
  そばで「🖥 かいものを する」（`#room-shop`・タップ／E）→ `town.openOnline()`＝かぐ屋と 同じ 画面。**部屋は じぶんの へや（`in:room`）からの かぐの 買いものも みとめる**（`onPropBuy`。ほかの 場所は 前と 同じ `too far`）。買うと すぐ 下の バーと 手に 入る。
- **かぐは 31 しゅるい**（`town.json`・形は `furniture-real.js`・一覧は `/dev-town.html`）。ベッドは 5 つ（bed・bed_bunk・bed_princess・bed_canopy・bed_king）：`bed: true`・`sleepY`（ねる 高さ）・`sleepZ` を `town.json` に 書く（ない ベッドは サーバーの 読みこみで 落ちる）。ねるのは `isBed()`。
  ねて いる 間は `body[data-sleeping]` が かぐの ボタン（おく・かたづけ・むき・そとへ）を かくす。おくと 左の かべは 0.5 外へ（うしろの 列の かぐが かべに うまって いた）。
- **ほんや・ピザや・バーガーやの 前の 道**：z 35.6（x -47〜-18.5）→ x -18.5 で 北へ → 大通り。3 けんの `path` も この 道から。
- **会話は 自動で 読み上げる・会話の 中から たべものを あげる（2026-11）**：行が かわる たびに 英語を 読む（`npc-talk.js` の `state.spoken`。🔊 は もう 一度）。かばんに たべものが あると ふきだしの 下に「🎁 あげる」と たべものの ボタン（6 しゅるいまで）。
  おすと `foodGive.giveTo(info, id)` → いつもの `food:give`（きめるのは 部屋・1 日 3 こ などの きまりも 同じ）→ お礼の ひとことに かわる。頭の 上に かかげる（🙌 もつ）道も のこして ある。
- **じぶんの しまへの ボートのりば（2026-11）**：メインの島の 北の 岸（`main_island.json` の spot `land_boat`・kind `land_ferry`・(-6, -38.8)＝テーマパークの ゲートの 東・たての 道の 先）。入ると `land.boat()`＝`land:enter {from:'bag'}`（部屋は 持ち物からと 同じ 道）。
  しまを もって いない 子には「⛵ いえの おみせで しまを かったら、ここから ボートで 行けるよ。」（土地島へは とばさない）。さんばしと ボートは かざり（`main-world.js`）。
- **リアルな 星空（`starfield.js`・2026-11）**：`createStarfield()`＝まるい 星の Points 1 つ＋天の川の 球 1 つ（光なし・後処理なし）。明るさは 本物に 近い 分布・色温度（青白〜だいだい）・またたき。明るい 星 15 と 星座 5 つは 本物の 位置（`CONSTELLATIONS`）。
  外の 夜空は `atmosphere.js`（前の シェーダーの 四角い 点は やめた・夜の 値で うすく なる・ゆっくり 回る）。内装の `cosmic-kit.js` の `addStars` も これ（呼びかたは 同じ）。`battle-stage.js` の 星だけ 前の まま。天の川の 強さは `milkyGain`。
- **プラネタリウム（グリフィス天文台の 形）**：メインの島の 前の「バトルアリーナ（SOON）」の 場所。spot `planetarium`（戸口 -28, -24.6・道は x -6 から）。外がわ＝`planetarium-real.js`（白い アールデコの 横長・黒い 銅の ドーム 3 つ・みどりの ロタンダ・しばふと 白い オベリスク・描画 5 回・夜は `setNight`）、置く 場所は `main-world.js` の `PLANETARIUM_AT`。
  中＝`planetarium.js` + `planetarium.css`（`rpg.attachPlanetarium()`＝図書館と 同じ 作り・`in:planetarium`・夜も あいて いる）。まるい ホール・リクライニングの 席・まんなかの 投影機・ドームに 同じ 星空。投影機の そばで「⭐ せいざを みる」→ Orion・Big Dipper・Cassiopeia・Scorpius・Cygnus を じゅんに（空が 回って 正面に・線と 星が 明るく・英語の 名前を 読む・英語と 日本語を 両方 出す＝`translate="no"`）。
  石だんは 見た目だけ（`floorY` なし）。もう 1 つの バトルアリーナ 2 は かざりの まま。
- **メインの島の ミニマップは 下絵を とって おく（2026-11）**：`main-world.js` の `drawMap` は 下絵（`paintMap(…, true)`）を 1 回だけ 描き、8 コマごとには はりつけと「きみ」だけ。前は 毎回 絵文字 40 こ ほどを 描きなおして、歩くと かたかた した。場所・道・ひろばの 絵を かえたら 鍵（`mapKey`）に 入って いるか 見る こと。
- **かぐは 1,231 しゅるい（2026-11）**：前からの 31（`town.json`・id も 値段も 見た目も そのまま）＋ 形 50 × スタイル 24 ＝ 1,200（`furniture-data.js`＝ページと サーバーが 同じ ものを 読む・three も DOM も 使わない）。id は `<形>-<スタイル>`（`sofa-pink`・`bed_king-royal`）。**id は かえない**。
  スタイル＝木（pine・oak・white・black・cherry・walnut）・布（red・blue・stripe・check・dots・denim・floral・velvet）・テーマ（mint・pink・sea・forest・mono・candy・royal）・金属（silver・rosegold・gold）。値段＝形の もとの 値段 × スタイルの 倍率（pine 1 〜 royal 5）。ベッドは 149（ぜんぶ ねられる）。
  お店（かぐ屋・へやの パソコン・`town.js`）：しゅるいの タブ・スタイル・さがす・ならべかえ・「もっている」・24 まいずつの ページ。**買うのは 2 回 おす**（カードを えらぶ → 下の「かう」。1,000 しゅるいを スクロール中の おしまちがいで コインが へらない ように）。
  絵は `furnitureShot()` が 見えて いる カードだけ 焼く（1 コマ 14ms まで・420 まいまで とって おく・5 秒 つかわないと レンダラーを はなす）。`prop:shop` は 前からの 31 件＋ `owned`（id）だけ 送る（8KB より 小さい こと を 検査）。へやの 下の バーは 横に スクロール。一覧は `/dev-town.html?sheet=designs&style=pink`・`?sheet=styles&design=sofa`。
- **じてんしゃや（メインの島の 西の 岸・2026-11）**：土地は `PLAZA.annex.also` の 2 つめ（x -70〜-48・z -2〜31）。spot `bike_shop`（戸口 -61, 11）。大通りは x -66 まで。夜は しまる（`SHOP_KINDS`）。ミニマップは `90 + (x-9)*1.1`, `70 + z*1.1`。
  品は `bikes-data.js`（`kind:'bike'`・6 台・150〜2500 コイン・はしるの 1.5〜2.2 倍）＝ぶきと 同じ 道で 買う（値段と 持ち主は 部屋）。形は `bike-models.js`、お店は `bike-shop.js` + `bike-shop.css`、のるのは `bike-ride.js`。
  **のる**：`#bike-toggle`（PC は B）・持ち物の「🚲 のりもの」・お店。`bike:ride {id}` → 部屋が 持って いるか・外か を 見て `bike:on`／`bike:error`。のって いる ことは `player.avatar` の `bike`（部屋が 入れる・`profile` では 入れられない）＝ほかの 子にも 見える。
  **自動で おりる**：戸口・家の 中・ひこうき・つり・レース・全画面の ゲーム・授業の ストップ・会話・ねる。テーマパークでは のれない。のりもの島の のりもの（`ride.js`）とは べつの しくみ。U-Speak島の 遠くの 山を 立てない 範囲も 西へ ひろげた（`game.js`）。

## だいくさん（増築）
- じぶんの いえの となりに だいくの ケンさん（carpenter.js/.css）。はなすと 6 だんかいの いえ（town.json `rooms`: ワンルーム 8 → ひろい へや 12 → おおきな いえ 16 → りっぱな いえ 20 → べっそう 24 → だいごうてい 28 マス、かぐ 10/20/34/50/70/95、800/2,500/6,000/12,000/25,000 コイン）。
- サーバーが きめる：`orderBuild` は つぎの だん だけ・1 つずつ・コイン不足は ことわる。`build:{tier,doneAt}`、こうじは 1 にち（CYCLE_SEC 705 s、テストは BUILD_DAY_SEC）。`settleBuild` は build:peek / build:order / room:enter / prop:list で おわった こうじを はんえい、`build:state` の finished を 1 かい だけ おくる。かぐは そのまま。
- こうじちゅうは あしば・シート・「こうじちゅう m:ss」。外見の 増築は じぶんの がめん だけ。
- まちの しまの ふどうさんも おなじ メニュー（room:move → onBuildOrder）。テスト：server/test/carpenter.test.mjs。

## 島を つなぐ 橋
- bridges-data.js / bridges.js：HUBS と REGIONS の しま ぜんぶを 35 本の 橋で つなぐ（34 本 あたらしい ＋ willow–main）。60 いじょうの ながい 橋は まんなかに ベンチと ライトの 休けい台。
- game.js `blocked` は まず `bridges.blocked`。デッキの 上は 歩ける、海の 上は てすりで 止まる。まんなかを こえると `rpg.activate(next,false,true)`（とばない・ロードなし）。見せる しまは いまの しまと むこうの しま（asPeer）だけ。
- まんなかに ゲート：プレミアムは いつもの 🔒 ダイアログ、まだ ひらいて いない ちいきは じょうけんの トースト。サーバーは 橋を しらない、プレミアムは islandLocked で まもる（server/test/bridges.test.mjs）。
- メインの はし：main→arena は B どおりの 西はし (-77,-31)、main→meadow は East Ave の 北はし (-30,-73)。island-kit `footprint()`。橋の はしの 近くには rpg-world.js で 木を おかない（らんすうの じゅんばんは そのまま）。
- regression.mjs の 橋ブロックが はし・デッキ・てすり・ゲートを 14,700 てんで しらべる。

## ビルの まち（プラネタリウムの 西）
- main-city.js：PLAZA.annex.also に L がたの 土地 {x -78…-40, z -74…-1} と {x -78…-14, z -74…-40}。たての 道 x -63/-46/-30、よこの 道 z -13.5/-31/-49（はば 4、ほどう 1.4、横だんほどう、街灯 21、車 17）。こうえん x -60…-50, z -27…-17（丘を ここへ、タイル数は おなじ）。main_island.json の roads 6 本目が 島の 道と つなぐ。入口に「🏙 ビルの まち」。
- 高い ビル 14 ＋ 中くらい 8。7 メッシュ（ガラス 4・コンクリ 1・光 1・街灯の 光 instanced）＋看板、約 7,500 三角形、影は ガラスだけ。窓の 絵は canvas（try/catch）。
- 夜は main-world.js の setNight から `city?.setNight(n)`。窓は シェーダで 階ごとに つく・きえる（emissive ≦ 1.2）。昼の ガラスは 空の うつりこみ つよめ、きりは ガラスだけ 60%。
- まちの 中では カメラと じぶんの 間の かべを まるく けす（半径 4.6）。ミニマップに 道と ビルを かく（mapKey に まちを ふくむ）。

## 軽くする その 2：遠くの こまかい 物と 影（2026-11・「広場に 行くと かくつく」）
- **原因（はかった こと）**：メインの島で 1 コマ 約 3,000 回 描いて いた。① 影の 絵の まんなかが **島の まんなかに 固定**（`atmosphere.js` の `focus`＝`rpg.activate` の `focusCenter`）で、大きな メインの島では 広場に 影が なく、島の まんなかの 約 1,900 こを 毎コマ 影の ために 描いて いた。
  ② 光が ななめ（高さ 32°）なので 影の 箱（±48）が 地面では 約 180 の 長さに なって いた。③ 1 人 20〜30 部品の 住民・広場の 人・屋台の 品・じてんしゃ・U-Speak島の 小物を、島の どこに いても ぜんぶ 描いて いた。
- **なおした こと**：① 影の まんなかは じぶん（`state.follow`＝player、3 ずつ うごく。ひこうきで じぶんが かくれて いる 間は 前の `focusCenter`）。② 影の 箱の 上下を ±30 に（`game.js` の `sun.shadow.camera`）。
  ③ `detail-lod.js`（`uspeak.lod`）：シーンの 小さな まとまり（半径 6.5 以下で 部品 3 つ 以上の Group）と 1 つだけの 小さな 部品（半径 1.6 以下）を 3 秒ごとに さがし、0.25 秒ごとに じぶんから の 距離で きめる：62（中くらいは 92）より 遠い＝描かない（`layers` 31・visible は さわらない）、30 より 遠い＝影を 落とさない、目・口の ような 0.16 より 小さい 部品は 影を 落とさない。時計は 本当の 時間（`performance.now()`）。
- **結果**（1 コマの 描画・1280×800）：広場 約 2,900 → 約 1,170、スタート 約 3,140 → 約 1,970、ビル街 約 2,340 → 約 420。
- 気を つける こと：遠くの 人が 62 で 出たり 消えたり する（小さく しか 見えない 距離）。描かない だけ なので 当たり判定・話しかけ・動きは そのまま。レイキャストは レイヤー 0 だけ 見る ので、遠くの 物は 当たらない。`userData.noLod = true` で 外せる。`uspeak.lod.setEnabled(false)` で くらべられる。

## ゆぴちゃんの おはなしルーム（フリー会話／2026-11）
- メインの島の ピザやの 通り、ほんやの 西（spot `yupi`・kind `talk_shop`・戸口 (-57, 33.1)・道は x -59.5 まで のばした・土地は `PLAZA.annex.also` の 四角 {x -64…-44, z 20…40}＝じてんしゃやの 四角より 前）。ピンクの 外がわ（`facade` の `yupi`・`roof-signs.js` の ハートと ふきだし）、中は `furnish('yupi')`（この お店だけ 宇宙の みどりに 色を よせない）。
- **ゆぴちゃん**：`island-cast.js` の `yupi`（ピンク・うさみみ・ハート）。戸口と カウンターに 立つ。会話の 画面は ウーピーの 動画の かわりに `yupi.js` が `renderShots` で 1 回だけ 焼いた 絵 2 まい（口が うごく）。
- **フリー会話**：topic の `free: true`（目あて 0・目あてが あると 起動で 落ちる）と `persona: 'yupi'`。`tutor.js` の `buildFreeTalkPrompt`・台本の `scriptedFreeTurn`（キーなしでも 英語＋日本語）。`complete` に ならない・14 回で ふりかえり。**コインなし・XP 0**。学習ログは mode `conv-free`（はなす に 数える・タスクと 正解率には 数えない）。AI の 回数の 上限は いつもと 同じ。プレミアムは ほかの お店と 同じ `talkshops`。
- **安全**：ゆぴちゃんは「きいて くれる ともだち」で カウンセラーでは ない（しんだん・くすり・お金の 話を しない・名前／住所／学校名を きかない・ひみつに しない・外で 会う 話を しない）。いじめ・けが・こわい・しにたい などは `distressOf`（英語と 日本語）で 見つけ、いつも きまった 返事（`SAFE_REPLY`：しんじられる 大人に いますぐ はなしてね）。AI の 返事が それを 言って いなければ `guardFreeTalk` が おきかえる。会話の 保存は ほかの conv と 同じ（学習ログに 1 回 80 字まで）。
- 検査：`server/test/free-talk.test.mjs`。本物の AI・音声・iPad は まだ ためして いない。

## セキュリティの 見なおし（2026-11-27・4 つに わけて しらべた）
- **サーバーの 入口**：署名つきの ページ（/report・/class・/export・/report-live）にも 1 分 120 回の 上限、宿題の 読みとりは ReDoS と zip ばくだんに つよく（`upToLast`・1 ファイル 40MB・ぜんぶで 120MB・2000 こ）、BLOCKWILD の チャットは `cleanSay()`・1.5 秒に 1 行・クラスコードの 形を 見る・せかいは 200 まで・世界を 作るのは 同時に 2 つ、読み上げの 保存は `TTS_CACHE_MAX_MB`（1024）まで、`Fly-Client-IP` は Fly の 上だけ 信じる（`clientIp()`）、店の 設定などの 表は `Object.create(null)`、CSV の 式は `'` で 止める。テスト：`server/test/http-hardening.test.mjs`。
- **ゲームの 部屋**：れんしゅうの コイン（answer・クイズ・カート・ジム・英単語ハウス）は 1 日 `PRACTICE_COIN_CAP`（400）、ふくしゅうは `REVIEW_COIN_CAP`（90）、定型文の XP は `PHRASE_XP_CAP`（100）。AI の 回数は クラス＋名前ごと（`game/day-budget.js`・入りなおしても へらない・サーバーを 起こしなおすと もどる）。大文字・小文字ちがいの クラスコードの 2 つめの 部屋は 4009 で ことわる。AI の 返事は 見えない 文字・`<>`・NG・連絡先を 見て だめなら かわりの 返事。見えない 文字で NG を すりぬけない。幼児モードは `voice:msg` の 文も 止める。プレミアムの 島の 建物では 通話しない。1 人 1 秒 80 メッセージまで。`move.s` は `^[A-Za-z0-9_.:-]{1,48}$`。テスト：`security-room.test.mjs`・`security-ai.test.mjs`。
- **画面**：`?server=` は ページと 行き先の 両方が localhost／LAN の ときだけ（`isDevHost()`）。`.location` の 名前も `esc`。regression に セキュリティの 検査（eval なし・先生の 鍵を localStorage に 書かない・答えの ファイルが dist に ない ほか）。
- **鍵・設定**：git の 記録に 鍵は なかった。body-parser を 1.20.9 に。`.dockerignore` を きびしく。デプロイの スクリプトは 鍵を コマンドの 引数に のせず `fly secrets import`（標準入力）で わたす。
- **わかって いて のこした こと（持ち主が 2026-11-28 に「いまのまま」と きめた）**：① 名簿で 先生の 名前で 入れば だれでも 先生（11/19 に 先生パスワードを なくした ため）。② クラスコードを 知って いれば ほかの 子の 名前で 入れる（その 子の コイン・記録・保護者 QR）。③ BLOCKWILD の せかいも 名前は 自分で 名のる。かえる ときは gate.js の `isTeacher`／`allow` と ロビーに パスワードの 欄を もどす。
- **持ち主が する こと**：OpenAI の 鍵（sk-proj-4A69…）と LINE の チャネルシークレット（41ab…）を 作りなおして `fly secrets set`。`fly ips list -a uspeak-report-worker` で 公開の IP が あれば はずす。
- **案（まだ）**：CSP の `unsafe-inline` を やめる・`connect-src` を しぼる、LiveKit の トークンを みじかく、TeX に `openin_any: 'p'`、colyseus 0.18 への 大きな 上げ、Docker の 画像を digest で 固定。

## ショッピングモールの 3D（`mall-real.js`／2026-11・まだ 島には 置いて いない）
- 写真 2 まい（角の まるい ガラスの 建物・木の 吹きぬけ）を もとに した オリジナルの「U-SPEAK MALL ユースピーク モール」。**本物の 会社の 名前・ロゴは 使わない**。
- `buildMallExterior()`（70×20・高さ 約 23.5・描画 11 回・約 4.3 万 三角形・`door`・当たり判定 50＋ベンチ・ごみばこ）と `buildMallInterior()`（40×30・3 階・描画 16 回・約 14 万 三角形・`entrance`・`update(t)` で 人が 歩く・足は すべらない）。もようは 2 つ あわせて 約 17.9MB（上限 18MB・もう よゆうが ない）（1 回だけ 作って 使いまわす・`mallTextureMB()`）。
- リアルに した しかけ（2026-11）：ガラスは 1 回で 描く シェーダー（空の うつりこみ・角度で 強く・ガラスの 中に おくゆきの ある 部屋の 絵 8 しゅるい）、かべ・床・木・石は 1 つの 材質で 場所の 式から もようと くらさ、木は `real-trees.js`、人は 人らしい 形（はだ・服・かみ を べつに）。光は ふやさない。どちらも `setNight(n)`（emissive だけ）。部品は `library-real.js` の ものを 使う。見る ページは `/dev-mall.html`（`?mode=int&night=1` など）。
- ガラスの 中（2 階の 人・お店の 中）は 絵。当たり判定は 1 階だけ。置く ときは 島の 土地・道・ミニマップ・戸口（`attachLibrary` と 同じ 作りで 中へ）を 足す。

## 水族館の 3D（`aquarium-real.js`／2026-11・まだ 島には 置いて いない）
- オリジナルの「U-SPEAK AQUARIUM ユースピーク すいぞくかん」（本物の 水族館の 名前・かんばんは 使わない）。いりぐち → まるい まどの ホール（直径 9 m・2 かいは かざり）→ ペンギンの ろうか。`buildAquarium()` が `{group, obstacles, entrance, zones, update(t), setQuality('low'|'high'), dispose()}` を かえす。見る ページは `/dev-aquarium.html`。
- 描画 17 回・約 21 万 三角形・もよう 12.3MB（2 回目：サンゴの 板・魚 10 しゅるい・むれ 2 つ・ペンギンの あわ・人 30 人・クラゲの しょくしゅ・ロビー）。**光は 0**：かべ・床は 水そうと 天井の スポットからの 光を シェーダーで 計算、ゆらぐ 光の もようは 生成した もようを 2 つ ずらして。床の うつりこみは にせもの（鏡の 描画は しない）。魚・サメ・エイ・カメ・ペンギンは GPU だけで うごく（`update` は 時間を 書く だけ）。`low` で 魚と つぶを 半分に。
- 人は 顔の ない マネキン。当たり判定は 1 階だけ。かんばんは 英語と ひらがなを 絵に 焼いて ある（言語の きりかえでは かわらない）。

## 高級な 服屋と 家具屋の 3D（`boutique-real.js`／2026-11・まだ 島には 置いて いない）
- `buildBoutique()`＝「MAISON U ふくの おみせ」（16×14・2 かい・石の 外かべ・アーチの とびら・ショーウィンドウ／中は エレガントな ドレスと かばん・シャンデリア・試着室・階段と 2 かい＋ストリート服の コーナー（レンガと らくがき・黒い ラック・たたんだ T シャツ））。`buildFurnitureShowroom()`＝「ROYAL HOME かぐの おみせ」（18×14・黒と 金の 外かべ／中は 黒と 金の かべ・赤い じゅうたん・チェスターフィールド・リビング／ダイニング／天がいの 寝室）。本物の ブランドや ゲームの キャラは 使わない。
- どちらも `{group, obstacles, door, entrance, setNight, update}`・描画 12 回（服屋 約 10.5 万・家具屋 約 6.8 万 三角形）・もようは 2 つで 13MB（1 回だけ 作る）。光は ふやさない。見る ページは `/dev-shops.html`。
- 人と マネキンは 顔なし。当たり判定は 1 階だけ。かんばんは 絵に 焼いて ある。

## せかいの ちず（しまの ちずの 3 つの 見かた／2026-11）
- `#rpg-dialog` の しまの ちずに「🃏 カード（はじめ・2026-11 に もどした）・🗺 ちず・📍 あんない」（この 端末に `uspeak-worldmap-view-v2`）。カード（`[data-world]`）は いつも ページに のこる（検査が おす）。
- 🗺 ちず＝`world-paint.js`：島ごとの 地形（雪山・くぼち・赤い がけ・砂の 丘・サンゴの わ・森・畑・湖と 川・英検の 段々）を canvas に 1 回だけ 小分けに かく。海は あさい 水色 → ふかい 青と 白い 波、ふちに もこもこの 雲。メインの島は べつに こまかく（ビル・ドーム・広場・図書館・ゆぴちゃんの 店・船着き場）。ちかづくと その 島だけ こまかい 絵を 1 回 かいて かさねる。かけるまでは あんないの 地図。おそい 端末は `WORLD_TILE.ppu`（1.2）を 下げる。
- `world-map.js`：SVG（1 回 作って キャッシュ）・名前は クリーム色の 帯（13px）・12 か所の 候補から 重ならない 場所に 置く（だめなら 番号だけ・近づくと 出る）・島は 1.5 倍で かいて 重ならない ように ずらす（メインは 動かさない・橋も つなぎなおす）。きみは ここ・🔒・まだの 島の 雲。島・名前・番号・一覧の 行を おすと `rpg.js` の `onPick`（カードと 同じ きまり）。
- スマホ（はば 900 以下 か 高さ 500 以下）は 説明と 一覧を たたんで はじめる。regression の「せかいの ちず」が 36 島・36 橋・重なり なしを 見る。

- **異次元の 見た目（2026-11）**：まわりは 深い みどりの 宇宙（星・ミント／水色／オレンジの 星雲・軌道の わ）、海は 光る ミント色の「異次元の 海」、島の ふちの 下に 岩と 根が たれる。橋は 光の 橋、番号は オレンジの 光る 玉（カギは 灰色）、名前は こい ガラスの 帯、「きみは ここ」は 広がる 光の わ（transform／opacity だけ・reduced-motion で とまる）。きみは ここの 札も 重ならない 場所に 置く。方位は 地図の 外の 角。
- **島ごとの 異次元デザイン（`world-art.js`）**：島ごとに 地面の 色と もよう（英検＝白い 大理石と 級ごとの 宝石色・アリーナ＝溶岩・テーマパーク＝キャンディ・ABC＝もようの パッチ・しゅくだい＝ノートの 線 など）、形（わ・とげの 星・われた かけら・三日月・かけら）、大きな まんなかの しるし（U の 柱・光の 観覧車・水の 玉と たき・神殿・本の 塔・えんぴつ…）、まわる かけら。番号の 玉は 島の 左上。カギの 島は くらい 霜と ? の しるし。島を 足したら `world-art.js` の 表にも 1 行。
- **3 つの 海（2026-11）**：まんなかの うみ（メインと 毎日の 島）・えいけんの うみ（5→1 級を 1 本の 金の 道・級の 旗）・ぼうけんの うみ（くねくね ならぶ・つぎに ひらく 1〜2 島だけ「？」・のこりは きり＝ひらくたびに きりだけ かきなおす）。ひらくと 海の 名前と マークだけ、海を おすと 近づいて 名前が 出る。番号は やめて 島ごとの マーク、名前は `yomi`（ひらがな・rpg-data.js に ぜんぶ ある）。メインの島 → 5 級に 太い オレンジの 道と 船。一覧は「まんなか／えいけん／ぼうけん」の タブ（地図と 連動・きりの 島は ？？？）。**地図の 英検の 道は じっさいの 橋（bridges-data.js）と じゅんばんが ちがう**（同じは 5–4・準2–2）。

## 使用履歴（`/admin/usage`・`/teacher/usage`／2026-11）
- サーバーの `server/src/usage/`（`store.js`＝`DATA_DIR/usage.json`、`usage.js`＝日ごとの まとめ・集計・CSV）。子ども 1 人 1 日（日本時間）1 つの 箱：つながった 秒・何か した 秒（`tickStudy` と 同じ きまり）・場所ごとの 秒（1 日 24 まで）・時間ごとの 秒・ログイン 回数・端末・答えの 正誤（形ごと）・AI の 回数・チャットの 回数・買いもの・XP／コイン。セッションは さいごの 200。**チャットの 文・AI の 会話・IP・UA の 文は 入れない**。先生は 記録しない。
- ClassRoom の 入る・毎秒の tick・出る・`appendLearning`・`aiSpend`・`onChat`・`coinRow` に つないで ある。端末は UA から（iPad は pc に なりがち・ページが `options.device` を 送れば そちら）。
- 画面は 1 まいの HTML（手書きの SVG の グラフ・外の ライブラリなし）：概要（人数・時間・曜日×時間の 色の 表・端末・場所・正答率）、生徒一覧（並べかえ・小さな グラフ・CSV）、生徒の 記録（1 年の カレンダー・毎日の 時間・場所・時間帯・セッション・答え・ロードマップ・宿題・本）。先生は じぶんの 教室の クラスだけ。API は `/admin/api/usage/*`（1 分 120 回・入力チェック・CSV の 式 止め）。
- 400 日で けす（RETENTION_DAYS が みじかければ そちら）。1 人分を けすと 使用履歴も きえる（`privacy.js`）。デプロイ前の 時間・場所は ない（月の 分・週の XP など 前から ある ものは 出る・「≈」）。テスト：`server/test/usage.test.mjs`。
