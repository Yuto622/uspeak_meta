// つり島 — Roblox 版の「釣り専用ワールド」を Web に移したもの（docs/ROBLOX_SYNC.md の隣）。
//
// 流れは Roblox と同じ：ゾーン（★いけ / ★★かわ / ★★★うみ）→ 問題（ゾーンごとに形式を抽選）
// → 正解ならタイミングのミニゲーム → くじで魚 → 図鑑とコイン。不正解は同じ問題をもう一度、
// 2回目も外せば魚は逃げる。
//
// ここが決めること：どの問題を どの形式で出すか、答えが合っているか、何が釣れるか、
// 売値、図鑑の初回ボーナス。**ページは答えも確率も知らない。** 問題の部品
// （client/dist/formats-core.js）はページと同じファイルで、判定もそれで行う。
import { readFileSync } from 'node:fs';
import {
  FORMATS, buildFor, pickFormat, publicFormat, checkFormat, revealFormat, diffFormat, makeRng,
} from '../../../client/dist/formats-core.js';

export class FishworldError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/fishworld.json', import.meta.url);
const need = (ok, msg) => { if (!ok) throw new Error(`fishworld.json: ${msg}`); };
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

// レア度の順（くじの「いちばんレア／いちばんコモン」を決める）。
export const RARITY_ORDER = ['C', 'U', 'R', 'S', 'L'];
export const RARITY_LABEL = { C: { en: 'GET!', ja: 'ゲット！' }, U: { en: 'NICE!', ja: 'いいね！' }, R: { en: 'RARE!', ja: 'レア！' }, S: { en: 'SUPER RARE!', ja: 'スーパーレア！' }, L: { en: 'LEGEND!!', ja: 'レジェンド！！' } };
// 「はやい」＝出題から2秒以内に答えた（あてずっぽう率の材料。Roblox と同じ閾値）。
export const FAST_MS = 2000;
export const XP_PER_CATCH = 6;

export function loadFishworld(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const island = raw.island;
  need(island && island.id === 'fishworld' && Array.isArray(island.spots) && island.spots.length === 3, 'island block with 3 spots');
  need(Number.isFinite(island.x) && Number.isFinite(island.z) && Number.isFinite(island.radius), 'island x/z/radius');
  const spotById = new Map();
  const spotByZone = new Map();
  for (const sp of island.spots) {
    need(sp.id && sp.kind && sp.name && Number.isFinite(sp.x) && Number.isFinite(sp.z) && sp.path && [1, 2, 3].includes(sp.zone), `spot ${sp.id}`);
    need(!spotById.has(sp.id) && !spotByZone.has(sp.zone), `duplicate spot ${sp.id}`);
    sp.wx = island.x + sp.x; sp.wz = island.z + sp.z;
    spotById.set(sp.id, sp); spotByZone.set(sp.zone, sp);
    for (const other of island.spots) if (other !== sp) need(Math.hypot(sp.x - other.x, sp.z - other.z) > 10, `${sp.id} and ${other.id} overlap`);
  }
  const zones = raw.zones;
  const quiz = raw.quiz;
  const formats = raw.formats;
  const catchRates = raw.catchRates;
  for (const z of ['1', '2', '3']) {
    need(zones?.[z]?.en && zones[z].ja && zones[z].stars, `zone ${z}`);
    need(Array.isArray(quiz?.[z]) && quiz[z].length >= 10, `zone ${z} needs questions`);
    for (const q of quiz[z]) need(q.q && q.a && Array.isArray(q.o) && q.o.includes(q.a), `question ${q?.q} of zone ${z}`);
    need(Array.isArray(formats?.[z]) && formats[z].every((f) => FORMATS.includes(f)), `formats of zone ${z}`);
    need(catchRates?.[z] && Object.keys(catchRates[z]).length >= 5, `catchRates of zone ${z}`);
  }
  const fish = Array.isArray(raw.fish) ? raw.fish : [];
  need(fish.length >= 20, 'fish list');
  const fishByJa = new Map(); const fishByEn = new Map();
  for (const f of fish) {
    need(f.en && f.ja && RARITY_ORDER.includes(f.rarity) && [0, 1, 2, 3].includes(f.zone) && Number.isFinite(f.sell) && ['creature', 'treasure', 'trash'].includes(f.kind), `fish ${f?.en}`);
    need(!fishByEn.has(f.en.toLowerCase()) && !fishByJa.has(f.ja), `duplicate fish ${f.en}`);
    fishByJa.set(f.ja, f); fishByEn.set(f.en.toLowerCase(), f);
  }
  for (const z of ['1', '2', '3']) for (const ja of Object.keys(catchRates[z])) need(fishByJa.has(ja), `catchRates ${z}: unknown fish ${ja}`);
  const dexBonus = Math.max(0, Math.floor(num(raw.dexBonus, 10)));
  return { id: island.id, island, spotById, spotByZone, zones, quiz, formats, catchRates, fish, fishByJa, fishByEn, dexBonus, rarity: raw.rarity || {} };
}

export const FW = loadFishworld();

// 図鑑に数える魚（ゴミは数えない）。ゾーンごとの「n / m」の m。
export const dexTotal = (zone) => FW.fish.filter((f) => f.zone === zone && f.kind !== 'trash').length;

// ---- 子どもの記録 ---------------------------------------------------------------------------
export function blankFw() { return { dex: [], bag: {}, caught: 0, q: null, pending: null }; }
export function sanitizeFw(raw) {
  const fw = blankFw();
  if (!raw || typeof raw !== 'object') return fw;
  if (Array.isArray(raw.dex)) fw.dex = [...new Set(raw.dex.map(String).filter((en) => FW.fishByEn.has(en.toLowerCase())))];
  if (raw.bag && typeof raw.bag === 'object') {
    for (const [en, n] of Object.entries(raw.bag)) if (FW.fishByEn.has(String(en).toLowerCase()) && num(n) > 0) fw.bag[en] = Math.min(999, Math.floor(num(n)));
  }
  fw.caught = Math.max(0, Math.floor(num(raw.caught)));
  return fw;
}

// ---- 出題 ---------------------------------------------------------------------------------
let seq = 0;
export function prepare(zone, { rng = Math.random, now = Date.now() } = {}) {
  const z = String(zone);
  const pool = FW.quiz[z];
  if (!pool) throw new FishworldError('no such zone');
  const q = pool[Math.floor(rng() * pool.length)];
  const kind = pickFormat(FW.formats[z], q, rng);
  const fmt = buildFor(kind, q, pool, rng);
  return { id: `fw${now.toString(36)}${(seq += 1).toString(36)}`, zone: Number(z), word: q.q, ja: q.a, kind, fmt, attempt: 1, askedAt: now };
}

export const zoneInfo = (zone) => {
  const z = FW.zones[String(zone)];
  return { zone: Number(zone), key: z.key, stars: z.stars, en: z.en, ja: z.ja, grade: z.grade, gradeEn: z.gradeEn, color: z.color };
};

export function askPayload(q) {
  return { qid: q.id, ...zoneInfo(q.zone), attempt: q.attempt, format: publicFormat(q.fmt, { attempt: q.attempt }) };
}

// 判定。1回目の不正解は「もういちど」（同じ問題を同じ形式で）、2回目は答えを見せて魚は逃げる。
export function answer(q, given) {
  const correct = checkFormat(q.fmt, given);
  if (correct) return { correct: true };
  if (q.attempt >= 2) return { correct: false, escaped: true, reveal: revealFormat(q.fmt), diff: diffFormat(q.fmt, given) };
  q.attempt = 2;
  // えらぶ・せんつなぎ・あなうめ・きいて えらぶ・ならべかえ は1回目から正しい線（答え）を見せる（Roblox と同じ）。
  // つづり・タイピングは枠の色だけ（タイピングは2回目に「さいしょの もじ」）。
  const show = ['mc', 'match', 'fill', 'listen', 'order'].includes(q.kind);
  return { correct: false, escaped: false, diff: diffFormat(q.fmt, given), ...(show ? { reveal: revealFormat(q.fmt) } : {}), format: publicFormat(q.fmt, { attempt: 2 }) };
}

// ---- くじ -------------------------------------------------------------------------------------
// Roblox で 20,000 回引いて測った確率（catchRates）どおりに引く。正解のあとは生き物だけ
// （タイヤ・ながぐつ・あきカンは引き直し。お宝はそのまま）。タイミングが良いほどレア：
// PERFECT は3回引いて いちばんレア、おしい は3回引いて いちばんコモン、NICE は1回。
export const GRADES = ['perfect', 'nice', 'ok'];
function rollOnce(zone, rng) {
  const rates = FW.catchRates[String(zone)];
  const r = rng();
  let acc = 0;
  let last = null;
  for (const [ja, p] of Object.entries(rates)) { acc += p; last = ja; if (r < acc) return FW.fishByJa.get(ja); }
  return FW.fishByJa.get(last);
}
export function lottery(zone, grade = 'nice', { rng = Math.random, noTrash = true } = {}) {
  const roll = () => {
    let f = rollOnce(zone, rng);
    for (let i = 0; i < 25 && noTrash && f.kind === 'trash'; i += 1) f = rollOnce(zone, rng);
    if (noTrash && f.kind === 'trash') f = FW.fish.find((x) => x.zone === Number(zone) && x.kind !== 'trash') || f;
    return f;
  };
  const rank = (f) => RARITY_ORDER.indexOf(f.rarity);
  if (grade === 'perfect') { const rolls = [roll(), roll(), roll()]; return rolls.sort((a, b) => rank(b) - rank(a))[0]; }
  if (grade === 'ok') { const rolls = [roll(), roll(), roll()]; return rolls.sort((a, b) => rank(a) - rank(b))[0]; }
  return roll();
}

// ---- 釣果・図鑑・売る ----------------------------------------------------------------------
export function catchFish(fw, fish) {
  const first = !fw.dex.includes(fish.en) && fish.kind !== 'trash';
  if (first) fw.dex.push(fish.en);
  if (fish.kind !== 'trash') fw.bag[fish.en] = Math.min(999, (fw.bag[fish.en] || 0) + 1);
  fw.caught += 1;
  return { first, bonus: first ? FW.dexBonus : 0 };
}

export function sellFrom(fw, en) {
  if (en === '*') {
    let total = 0; let count = 0;
    for (const [name, n] of Object.entries(fw.bag)) { const f = FW.fishByEn.get(name.toLowerCase()); if (!f) continue; total += f.sell * n; count += n; }
    if (!count) throw new FishworldError('nothing to sell');
    fw.bag = {};
    return { coins: total, count, item: '*' };
  }
  const f = FW.fishByEn.get(String(en || '').toLowerCase());
  const have = f ? fw.bag[f.en] || 0 : 0;
  if (!f || !have) throw new FishworldError('nothing to sell');
  fw.bag[f.en] = have - 1;
  if (!fw.bag[f.en]) delete fw.bag[f.en];
  return { coins: f.sell, count: 1, item: f.en };
}

export const fishPayload = (f) => ({ en: f.en, ja: f.ja, rarity: f.rarity, stars: FW.rarity[f.rarity]?.stars || '', color: FW.rarity[f.rarity]?.color || '#78C882', label: RARITY_LABEL[f.rarity], zone: f.zone, sell: f.sell, emoji: f.emoji, kind: f.kind });

export function statePayload(fw) {
  const counts = {};
  for (const z of [1, 2, 3]) counts[z] = { have: fw.dex.filter((en) => FW.fishByEn.get(en.toLowerCase())?.zone === z).length, total: dexTotal(z) };
  return {
    dex: FW.fish.filter((f) => f.kind !== 'trash').map((f) => ({ ...fishPayload(f), have: fw.dex.includes(f.en) })),
    bag: Object.entries(fw.bag).map(([en, n]) => ({ ...fishPayload(FW.fishByEn.get(en.toLowerCase())), n })),
    bagValue: Object.entries(fw.bag).reduce((s, [en, n]) => s + (FW.fishByEn.get(en.toLowerCase())?.sell || 0) * n, 0),
    counts, caught: fw.caught, zones: [1, 2, 3].map(zoneInfo), dexBonus: FW.dexBonus,
  };
}

export { makeRng };
