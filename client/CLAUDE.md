# Claude Code 引き継ぎメモ

## 構成

静的HTML/CSS/ES Modules。dist/はビルド出力でなく手書きソースです。削除・上書きを避けてください。
依頼されない限りフレームワークへの全面移行は不要です。日本語UIと既存機能を維持してください。

| 対象 | dist/配下のファイル |
|---|---|
| HTML・初期化・メインループ | index.html / game.js / style.css |
| 光・昼夜・カメラ・描画 | atmosphere.js |
| テーマパーク・飛行機・乗り物 | themepark.js |
| アバター | avatars.js |
| 釣り・魚・経済 | fishing.js / fishing-state.js / fishing-data.js / fishing-models.js |
| RPG・地域・図鑑・地図 | rpg.js / rpg-state.js / rpg-data.js / rpg-map.js |
| 地形・キャラモデル | rpg-world.js / rpg-models.js |
| 物語・育成・リーグ・復習 | adventure.js / adventure-state.js / adventure-data.js / adventure-quiz.js |
| RPG演出・UI | adventure-effects.js / adventure.css |
| 杖・伝説・回復 | magic.js / magic-data.js / magic-world.js / magic.css |
| 建物入口・屋内 | buildings.js / park-interior.js / building-room.js |
| AI英会話（英会話島） | conv.js / conv.css / conv-island.js / conv.json / assets/character/*.mp4 |
| メッセージ（定型文・自由入力） | chat.js / net.css / voice.js（部屋の中） |
| のりもの島・カートレース | ride.js / ride-island.js / vehicles.json / kart.js / race.js / race.css |
| 宝箱・鍵・秘宝 | treasure-data.js / treasure.js / adventure-state.js |

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

## 英検の島（5級・4級・3級／2026-09 追加）

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

## おはなし（部屋の中の通話／2026-09 追加）

`voice.js` + `voice.css` + `stage.js`（大広間）。サーバーは `ClassRoom` の `voice:join` /
`voice:leave` / `voice:msg` / `voice:token` / `rtc:signal` と `src/game/stage.js`。

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
- **画面の大きさは子どもが変えられる**。`.voice-head` のボタンが 小→中→大→特大 と順に変わり、
  `#voice-panel` の `data-size` を書き替えるだけ（幅は CSS の `--voice-w`）。選んだ大きさは
  `localStorage` の `uspeak-voice-size-v1` に残る。幅はすべて `min(px, vw)` なので、
  特大でもスマホの画面からはみ出さない。狭い画面（560px 以下）では中・大・特大だけ上書きする。
- **つながらないまま放っておかない**。offer する側が 12 秒たってもつながって
  いなければ最大2回 `restartIce()` する（`RETRY_MS`）。学校のネットワークではこれが普通の
  失敗の形で、黙って無音のままにすると先生には原因が分からない。
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
