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

## おはなし（部屋の中の通話／2026-09 追加）

`voice.js` + `voice.css`。サーバーは `ClassRoom` の `voice:join` / `voice:leave` / `rtc:signal`。

- **部屋＝通話。** `in:<島>:<建物>` に入っている人どうしが同じ通話。部屋を出れば切れる。
  マイルーム（`in:room`）とひろば（`in:plaza`）は一人の場所なので通話にならない。
- **おはなし島（`talk`）だけは島そのものが1つの部屋**。`space === 'talk'` で通話になり、
  定員は `talk.json` の `plaza.max`（8人）。島のブース（`in:talk:*`）は普通の部屋（6人）。
- **スイッチは3択**（`RoomState.voice`）：`'rooms'`＝おはなし島だけ（既定・先生の操作不要）／
  `'all'`＝どの島のどの部屋でも／`'off'`＝おはなし島も含めて全部止める。先生コンソールのボタンが順に切り替える。
- **声はサーバーを通らない。** ブラウザー同士の直結（WebRTC）で、サーバーがするのは
  「誰と誰を引き合わせてよいか」の判断と仲介だけ。録音もしない。
- **他の島では2つの鍵が要る**：先生が `'all'` に開くことと、子どもが自分でマイクをタップすること。
  おはなし島では前者が要らない（島に行けば開いている）。マイクのタップはどこでも要る。
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
- メッシュ接続なので1部屋 **6人** まで（`VOICE_MAX`）。クラス全員で1つの通話はしない設計。
- 学校のネットワークが UDP を塞いでいると P2P がつながらないことがある。その場合は
  TURN サーバー（TCP/443）が要る。まだ入れていない（`restartIce()` は UDP が全部
  塞がれている場合には効かない）。
- e2e（`server/test/e2e/browser-voice.mjs`）はこのコンテナでは ICE の候補収集が
  たまに空になる（mDNS 応答なし・STUN に届かない）。テスト側で入り直しを繰り返すのと、
  Chromium に `--disable-features=WebRtcHideLocalIpsWithMdns` を渡すのはそのため。
  実機・実ネットワークの話ではない。
