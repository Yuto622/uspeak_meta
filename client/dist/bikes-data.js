// じてんしゃや（メインの島の 西の はま・2026-11）の 品ぞろえ 6 台。
// ここは 定義だけ（名前・値段・はやさ・色）。fishing-data.js の ITEMS に `kind: 'bike'` で 足すので、
// 買う 判定と 値段は サーバー（server/src/game/economy.js の buy）＝ぶきや と 同じ 道。持ち主は wallet.owned。
// のる・おりる は 部屋の `bike:ride`（もって いる じてんしゃ だけ）。ほかの 子には 姿の 文字（avatar）の `bike` で とどく。
//
// はやさ：`speed` は「走る はやさ（1 秒に 8）」の なんばいか。ぜんぶ 走るより 速い（1.5〜2.2 ばい）。
// あやつれる 速さに おさえて ある（いちばん 速い 金の じてんしゃで 1 秒に 17.6 ＝ のりもの島の ホバーボードと 同じ）。
// 英語の 名前は 学習の 中身（translate="no"・lang.json には 入れない）。
export const RUN_PACE = 8;      // game.js の 走る はやさ（dash）と 同じ 数字
export const BIKES = [
  { id: 'bike-kids', style: 'kids', en: "Kids' Bike", ja: 'こどもの じてんしゃ', price: 150, speed: 1.5, color: 0xff7a59, accent: 0xfff4d6, word: 'small', wordJa: 'ちいさい' },
  { id: 'bike-city', style: 'city', en: 'City Bike', ja: 'かごつき じてんしゃ', price: 350, speed: 1.65, color: 0x4fb3a5, accent: 0xc9a56a, word: 'basket', wordJa: 'かご' },
  { id: 'bike-bmx', style: 'bmx', en: 'BMX Bike', ja: 'ビーエムエックス', price: 600, speed: 1.8, color: 0xe2452f, accent: 0x1c1f24, word: 'jump', wordJa: 'とぶ' },
  { id: 'bike-mountain', style: 'mountain', en: 'Mountain Bike', ja: 'マウンテンバイク', price: 1000, speed: 1.9, color: 0x3d8b46, accent: 0xffb066, word: 'mountain', wordJa: 'やま' },
  { id: 'bike-road', style: 'road', en: 'Road Bike', ja: 'ロードバイク', price: 1600, speed: 2.05, color: 0x2f6fd8, accent: 0xffffff, word: 'fast', wordJa: 'はやい' },
  { id: 'bike-gold', style: 'gold', en: 'Golden Bike', ja: 'きんの じてんしゃ', price: 2500, speed: 2.2, color: 0xf2c14e, accent: 0xfff1a8, word: 'gold', wordJa: 'きん' },
].map((b) => ({ ...b, kind: 'bike', name: b.ja, description: b.en }));

export const BIKE_BY_ID = Object.assign(Object.create(null), Object.fromEntries(BIKES.map((b) => [b.id, b])));
export const isBike = (id) => typeof id === 'string' && !!BIKE_BY_ID[id];
// 1 秒に すすむ 長さ（いちばん 速い とき）。
export const bikePace = (id) => RUN_PACE * (BIKE_BY_ID[id]?.speed || 1);
