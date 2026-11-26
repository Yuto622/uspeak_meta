// おなか（空腹ゲージ）と メインの島の 3 つの屋台 — マインクラフトの おなかと同じ考え。
//
// ・おなかは 0〜20 点（画面は 🍗 10 こ。1 こ＝2 点）。**クラスに つながっている間だけ** 減る（RATE_MS ごとに 1 点）。
//   家に帰っている間は減らない（月曜に来たら へっていた、は 子どもに 理不尽）。
// ・0 になっても しなない。歩くのが おそくなるだけ（SLOW。きめるのは ページの net.speed）。
// ・屋台（くだものや・スイーツ・のみもの）で U-Speak コインで 買う → かばんに 入る → いつでも どの島でも たべる。
// 値段・おなかの ふえかた・残りは 全部ここ（部屋）が決める。ページは 並べて、押されたら 頼むだけ。
import { readFileSync } from 'node:fs';

export const MAX = 20;
export const RATE_MS = Number(process.env.FOOD_RATE_MS) || 240_000; // 1 点へるのに 4 分（まんぷくから 0 まで 80 分＝授業 1 回では まず 0 に ならない）。検査だけ 縮める
// 2026-11：Web 版では おなかが へらない（「どうぶつの森にも ない」）。たべものは 買って たべる たのしみだけ のこす。
// へる しくみは FOOD_HUNGER=on（または 検査の FOOD_RATE_MS）の ときだけ うごく。
export const HUNGER_ON = process.env.FOOD_HUNGER === 'on' || !!process.env.FOOD_RATE_MS;
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
  const shops = new Map();      // ほかの お店（wear_shop / block_shop / land_shop）。部屋が 位置を 見るのに使う
  for (const sp of island.spots) {
    if (/_shop$/.test(sp.kind) && sp.kind !== 'food_shop') shops.set(sp.kind, { ...sp, wx: island.x + sp.x, wz: island.z + sp.z });
    if (sp.kind !== 'food_shop') continue;
    if (!SHOPS[sp.shop]) throw new Error(`main_island.json: unknown food shop ${sp.shop}`);
    stalls.set(sp.shop, { ...sp, wx: island.x + sp.x, wz: island.z + sp.z });
  }
  for (const shop of Object.keys(SHOPS)) if (!stalls.has(shop)) throw new Error(`main_island.json: no stall for ${shop}`);
  return { island: { id: island.id, x: island.x, z: island.z, radius: island.radius ?? 5 }, stalls, shops };
}
export const STALLS = loadStalls();

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

// はじめての 子は りんごを 2 こ もって くる（おなかが へっても すぐ たべられる）。
export function blankFood() { return { h: MAX, at: 0, bag: { apple: 2 }, friends: {} }; }

// 保存から読む。`at` は保存しない（つながった ときに 動きはじめる）。
export function sanitizeFood(raw) {
  const f = blankFood();
  if (!raw || typeof raw !== 'object') return f;
  if (Number.isFinite(Number(raw.h))) f.h = Math.max(0, Math.min(MAX, Number(raw.h)));
  if (raw.bag && typeof raw.bag === 'object') {
    for (const [id, n] of Object.entries(raw.bag)) if (ITEMS.has(id)) { const k = clampInt(n, 0, BAG_MAX); if (k) f.bag[id] = k; }
  }
  // なかよし（住民に たべものを あげた 点）。古い 保存には ない ＝ からの まま。
  if (raw.friends && typeof raw.friends === 'object') {
    for (const [key, v] of Object.entries(raw.friends).slice(0, FRIENDS_MAX)) {
      if (!FRIEND_KEY.test(key) || !v || typeof v !== 'object') continue;
      const p = clampInt(v.p, 0, FRIEND_CAP);
      const n = clampInt(v.n, 0, GIFTS_PER_DAY);
      if (!p && !n) continue;
      f.friends[key] = { p, d: typeof v.d === 'string' && /^\d{4}-\d\d-\d\d$/.test(v.d) ? v.d : '', n, ...(v.f ? { f: 1 } : {}) };
    }
  }
  return f;
}

export function hungerNow(f, now = Date.now()) {
  if (!f.at) return f.h;
  return Math.max(0, f.h - (now - f.at) / RATE_MS);
}
// 減っている時間を 止める（きれたとき）・動かす（つながったとき）。
export function pause(f, now = Date.now()) { f.h = hungerNow(f, now); f.at = 0; return f; }
export function resume(f, now = Date.now()) { if (!HUNGER_ON) { f.h = MAX; return f; } if (!f.at) f.at = now; return f; }
export const forSave = (f, now = Date.now()) => ({ h: Math.round(hungerNow(f, now) * 100) / 100, bag: f.bag, friends: f.friends || {} });

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
  if (HUNGER_ON && before >= MAX - 0.01) throw new FoodError('full');
  f.bag[id] -= 1;
  if (!f.bag[id]) delete f.bag[id];
  f.h = Math.min(MAX, before + it.fill);
  if (f.at) f.at = now;
  return { item: it, before, after: f.h };
}

// ---- 住民に たべものを あげる（なかよし）--------------------------------------------------
// 持っている たべものを 1 こ わたすと、その 住民（`島:場所`）との 点が 1 ふえる。すきな たべものなら もう 1 点。
// 3 点で ❤ 1 こ、❤ は 10 こまで。コインも XP も うごかない。1 秒に 1 回・1 人に 1 日（日本の 日づけ）3 回まで。
// 住民の そばに いるかは 見ない（島ごとに 形が ちがう）。見るのは 名前の 形と、その たべものを 持っているか だけ。
export const HEARTS_MAX = 10;
export const POINTS_PER_HEART = 3;
export const FRIEND_CAP = HEARTS_MAX * POINTS_PER_HEART;
export const GIFTS_PER_DAY = 3;
export const GIFT_GAP_MS = 1000;
const FRIENDS_MAX = 300;
const FRIEND_KEY = /^[a-z0-9_]{1,24}:[a-z0-9_-]{1,40}$/;
const giftDay = (now) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);

export const friendKey = (island, spot) => {
  const key = `${typeof island === 'string' ? island : ''}:${typeof spot === 'string' ? spot : ''}`;
  if (!FRIEND_KEY.test(key)) throw new FoodError('no such villager');
  return key;
};
// その 住民の だいすきな たべもの：名前の ハッシュで きまる（いつも 同じ・データは ふやさない）。
export function favouriteOf(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const ids = [...ITEMS.keys()];
  return ids[(h >>> 0) % ids.length];
}
const heartsOf = (p) => Math.floor(p / POINTS_PER_HEART);

export function give(f, island, spot, id, now = Date.now()) {
  const key = friendKey(island, spot);
  const it = ITEMS.get(id);
  if (!it) throw new FoodError('no such food');
  if (!f.bag[id]) throw new FoodError('none left');
  if (f.gaveAt && now - f.gaveAt < GIFT_GAP_MS) throw new FoodError('too fast');
  if (!f.friends) f.friends = {};
  const today = giftDay(now);
  const cur = f.friends[key] || { p: 0, d: today, n: 0 };
  if (cur.d !== today) { cur.d = today; cur.n = 0; }
  if (cur.p >= FRIEND_CAP) throw new FoodError('best friends');
  if (cur.n >= GIFTS_PER_DAY) throw new FoodError('enough today');
  if (!f.friends[key] && Object.keys(f.friends).length >= FRIENDS_MAX) throw new FoodError('too many friends');
  const favourite = favouriteOf(key) === id;
  const before = cur.p;
  cur.p = Math.min(FRIEND_CAP, cur.p + 1 + (favourite ? 1 : 0));
  cur.n += 1;
  if (favourite) cur.f = 1;
  f.friends[key] = cur;
  f.bag[id] -= 1;
  if (!f.bag[id]) delete f.bag[id];
  f.gaveAt = now;
  return { key, item: it, favourite, gained: cur.p - before, points: cur.p, hearts: heartsOf(cur.p), heartUp: heartsOf(cur.p) > heartsOf(before), left: GIFTS_PER_DAY - cur.n };
}

// 画面に わたす なかよしの 表。だいすきな たべものは、1 回 あてた あとだけ 教える。
export function friendsPayload(f, now = Date.now()) {
  const today = giftDay(now);
  const out = {};
  for (const [key, v] of Object.entries(f.friends || {})) {
    out[key] = { points: v.p, hearts: heartsOf(v.p), left: v.d === today ? Math.max(0, GIFTS_PER_DAY - v.n) : GIFTS_PER_DAY, ...(v.f ? { favourite: favouriteOf(key) } : {}) };
  }
  return out;
}

export function foodPayload(f, now = Date.now()) {
  return {
    friends: friendsPayload(f, now), friendRules: { max: HEARTS_MAX, per: POINTS_PER_HEART, perDay: GIFTS_PER_DAY },
    hunger: Math.round(hungerNow(f, now) * 100) / 100, max: MAX, rateMs: f.at ? RATE_MS : 0, slow: SLOW, hungerOn: HUNGER_ON,
    bag: Object.entries(f.bag).map(([id, n]) => { const it = ITEMS.get(id); return { id, n, icon: it.icon, en: it.en, ja: it.ja, fill: it.fill }; }),
  };
}

export function menuPayload(shop) {
  const s = SHOPS[shop];
  return { shop, en: s.en, ja: s.ja, icon: s.icon, items: s.items.map((it) => ({ ...it })) };
}
