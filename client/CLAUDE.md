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
