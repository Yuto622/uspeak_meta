// おなか（空腹ゲージ）と メインの島の 3 つの屋台 — マインクラフトの おなかと同じ考え。
//
// ・おなかは 0〜20 点（画面は 🍗 10 こ。1 こ＝2 点）。**クラスに つながっている間だけ** 減る（RATE_MS ごとに 1 点）。
//   家に帰っている間は減らない（月曜に来たら へっていた、は 子どもに 理不尽）。
// ・0 になっても しなない。歩くのが おそくなるだけ（SLOW。きめるのは ページの net.speed）。
// ・屋台（くだものや・スイーツ・のみもの）で U-Speak コインで 買う → かばんに 入る → いつでも どの島でも たべる。
// 値段・おなかの ふえかた・残りは 全部ここ（部屋）が決める。ページは 並べて、押されたら 頼むだけ。
import { readFileSync } from 'node:fs';

export const MAX = 20;
export const RATE_MS = Number(process.env.FOOD_RATE_MS) || 60_000; // 1 点へるのに 1 分（まんぷくから 0 まで 20 分）。検査だけ 縮める
export const SLOW = 0.6;            // 0 のときの 歩く はやさ
export const BAG_MAX = 9;           // 1 しゅるい 9 こまで

export class FoodError extends Error {}

// 屋台と 食べ物。英語の名前は ことばの学習でもある（画面は 英語を大きく、読み上げも 英語）。
export const SHOPS = {
  fruit: { en: 'Fruit Stand', ja: 'くだものや', icon: '🍎', items: [
    { id: 'apple', icon: '🍎', en: 'apple', ja: 'りんご', price: 6, fill: 3 },
    { id: 'banana', icon: '🍌', en: 'banana', ja: 'バナナ', price: 8, fill: 4 },
    { id: 'watermelon', icon: '🍉', en: 'watermelon', ja: 'すいか', price: 15, fill: 8 },
  ] },
  sweets: { en: 'Sweets', ja: 'スイーツ', icon: '🍰', items: [
    { id: 'cookie', icon: '🍪', en: 'cookie', ja: 'クッキー', price: 5, fill: 2 },
    { id: 'donut', icon: '🍩', en: 'donut', ja: 'ドーナツ', price: 10, fill: 5 },
    { id: 'cake', icon: '🍰', en: 'cake', ja: 'ケーキ', price: 18, fill: 9 },
  ] },
  drinks: { en: 'Drinks', ja: 'のみもの', icon: '🧃', items: [
    { id: 'milk', icon: '🥛', en: 'milk', ja: 'ぎゅうにゅう', price: 5, fill: 2 },
    { id: 'juice', icon: '🧃', en: 'orange juice', ja: 'オレンジジュース', price: 8, fill: 4 },
    { id: 'smoothie', icon: '🥤', en: 'smoothie', ja: 'スムージー', price: 12, fill: 6 },
  ] },
};
export const ITEMS = new Map(Object.entries(SHOPS).flatMap(([shop, s]) => s.items.map((it) => [it.id, { ...it, shop }])));

// 屋台の場所は メインの島の データ（main_island.json の island.spots の kind "food_shop"）。部屋は そこに立っているかを見る。
export function loadStalls(file = new URL('../../../client/dist/main_island.json', import.meta.url)) {
  const island = JSON.parse(readFileSync(file, 'utf8')).island;
  if (!island) throw new Error('main_island.json: no island');
  const stalls = new Map();
  for (const sp of island.spots) {
    if (sp.kind !== 'food_shop') continue;
    if (!SHOPS[sp.shop]) throw new Error(`main_island.json: unknown food shop ${sp.shop}`);
    stalls.set(sp.shop, { ...sp, wx: island.x + sp.x, wz: island.z + sp.z });
  }
  for (const shop of Object.keys(SHOPS)) if (!stalls.has(shop)) throw new Error(`main_island.json: no stall for ${shop}`);
  return { island: { id: island.id, x: island.x, z: island.z, radius: island.radius ?? 5 }, stalls };
}
export const STALLS = loadStalls();

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

export function blankFood() { return { h: MAX, at: 0, bag: {} }; }

// 保存から読む。`at` は保存しない（つながった ときに 動きはじめる）。
export function sanitizeFood(raw) {
  const f = blankFood();
  if (!raw || typeof raw !== 'object') return f;
  if (Number.isFinite(Number(raw.h))) f.h = Math.max(0, Math.min(MAX, Number(raw.h)));
  if (raw.bag && typeof raw.bag === 'object') {
    for (const [id, n] of Object.entries(raw.bag)) if (ITEMS.has(id)) { const k = clampInt(n, 0, BAG_MAX); if (k) f.bag[id] = k; }
  }
  return f;
}

export function hungerNow(f, now = Date.now()) {
  if (!f.at) return f.h;
  return Math.max(0, f.h - (now - f.at) / RATE_MS);
}
// 減っている時間を 止める（きれたとき）・動かす（つながったとき）。
export function pause(f, now = Date.now()) { f.h = hungerNow(f, now); f.at = 0; return f; }
export function resume(f, now = Date.now()) { if (!f.at) f.at = now; return f; }
export const forSave = (f, now = Date.now()) => ({ h: Math.round(hungerNow(f, now) * 100) / 100, bag: f.bag });

export function buy(f, shop, id, coins) {
  const s = SHOPS[shop];
  if (!s) throw new FoodError('no such shop');
  const it = s.items.find((x) => x.id === id);
  if (!it) throw new FoodError('not sold here');
  if ((f.bag[id] || 0) >= BAG_MAX) throw new FoodError('bag full');
  if (coins < it.price) throw new FoodError('not enough coins');
  return it;
}
export function addToBag(f, id) { f.bag[id] = Math.min(BAG_MAX, (f.bag[id] || 0) + 1); }

export function eat(f, id, now = Date.now()) {
  const it = ITEMS.get(id);
  if (!it) throw new FoodError('no such food');
  if (!f.bag[id]) throw new FoodError('none left');
  const before = hungerNow(f, now);
  if (before >= MAX - 0.01) throw new FoodError('full');
  f.bag[id] -= 1;
  if (!f.bag[id]) delete f.bag[id];
  f.h = Math.min(MAX, before + it.fill);
  if (f.at) f.at = now;
  return { item: it, before, after: f.h };
}

export function foodPayload(f, now = Date.now()) {
  return {
    hunger: Math.round(hungerNow(f, now) * 100) / 100, max: MAX, rateMs: f.at ? RATE_MS : 0, slow: SLOW,
    bag: Object.entries(f.bag).map(([id, n]) => { const it = ITEMS.get(id); return { id, n, icon: it.icon, en: it.en, ja: it.ja, fill: it.fill }; }),
  };
}

export function menuPayload(shop) {
  const s = SHOPS[shop];
  return { shop, en: s.en, ja: s.ja, icon: s.icon, items: s.items.map((it) => ({ ...it })) };
}
