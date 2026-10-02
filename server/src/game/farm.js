// ぼくじょう島 — the farm, as the room sees it.
//
// 牧場物語 runs on stamina: every swing of a tool costs some, so a day is a budget of
// swings. This island runs on English: every piece of farm work costs one English act, so
// a day is a budget of things said and written. A wrong answer costs nothing but the
// work does not happen; a right one makes the plant grow, the hen fed, the box shipped.
//
// What this file owns:
//   * the shape of a farm (plots, seeds, items, animals, hearts) and its sanitizer;
//   * time: a farm day is one turn of the world clock (705 s), the season is the real
//     season, so a turnip (two waterings) is ready inside one lesson and the shop's
//     shelves change with the calendar;
//   * `prepare()`: the question an action costs, with its answer, and the effect that
//     runs if the answer is right. The answer never leaves this process (`askPayload`).
//   * `judge()`: the comparison, tolerant of case and spacing and nothing else.
// Coins, XP and the learning log are the room's job (ClassRoom), as everywhere else.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { CYCLE_SEC } from '../../../client/dist/world-clock.js';
import { seasonFor, weekIndex } from './daily.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FARM_PATH = path.resolve(here, '../../../client/dist/farm.json');
const BANK_PATH = path.resolve(here, 'farm-bank.json');

export class FarmError extends Error {}

const need = (ok, msg) => { if (!ok) throw new Error(`farm.json: ${msg}`); };
const str = (v) => (typeof v === 'string' ? v : '');
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

function loadFarm() {
  const raw = JSON.parse(readFileSync(FARM_PATH, 'utf8'));
  const island = raw.island;
  need(island && island.id === 'farm' && Array.isArray(island.spots), 'island block');
  need(Number.isFinite(island.x) && Number.isFinite(island.z) && Number.isFinite(island.radius), 'island x/z/radius');
  const spotById = new Map();
  for (const sp of island.spots) {
    need(sp.id && sp.kind && sp.name && Number.isFinite(sp.x) && Number.isFinite(sp.z) && sp.path, `spot ${sp.id}`);
    need(!spotById.has(sp.id), `duplicate spot ${sp.id}`);
    sp.wx = island.x + sp.x;
    sp.wz = island.z + sp.z;
    spotById.set(sp.id, sp);
    for (const other of island.spots) {
      if (other !== sp) need(Math.hypot(sp.x - other.x, sp.z - other.z) > 10, `${sp.id} and ${other.id} overlap`);
    }
  }
  for (const kind of ['shop', 'field', 'barn', 'ship', 'kitchen']) need(island.spots.some((s) => s.kind === kind), `a ${kind} spot`);
  const byId = (list, what) => {
    const m = new Map();
    for (const it of list) { need(it.id && it.en && it.ja, `${what} ${it.id}`); need(!m.has(it.id), `duplicate ${what} ${it.id}`); m.set(it.id, it); }
    return m;
  };
  const crops = byId(raw.crops, 'crop');
  for (const c of crops.values()) need(['spring', 'summer', 'autumn', 'winter'].includes(c.season) && c.days >= 1 && c.seed > 0 && c.sell > 0, `crop ${c.id} numbers`);
  for (const season of ['spring', 'summer', 'autumn', 'winter']) need([...crops.values()].some((c) => c.season === season && c.hearts === 0), `a first crop for ${season}`);
  const animals = byId(raw.animals, 'animal');
  const products = byId(raw.products, 'product');
  for (const a of animals.values()) need(products.has(a.product) && a.price > 0 && ['corn', 'hay'].includes(a.feed), `animal ${a.id}`);
  const tools = byId(raw.tools, 'tool');
  const recipes = byId(raw.recipes, 'recipe');
  for (const r of recipes.values()) for (const ing of Object.keys(r.needs)) need(crops.has(ing) || products.has(ing), `recipe ${r.id} needs ${ing}`);
  // Everything a child can hold, by id: crops, products, dishes. One table for prices.
  const items = new Map();
  for (const c of crops.values()) items.set(c.id, { id: c.id, en: c.en, ja: c.ja, emoji: c.emoji, sell: c.sell, kind: 'crop' });
  for (const p of products.values()) items.set(p.id, { id: p.id, en: p.en, ja: p.ja, emoji: p.emoji, sell: p.sell, kind: 'product' });
  for (const r of recipes.values()) {
    const base = Object.entries(r.needs).reduce((s, [id, n]) => s + items.get(id).sell * n, 0);
    items.set(r.id, { id: r.id, en: r.en, ja: r.ja, emoji: r.emoji, sell: base * 2, kind: 'dish' });
  }
  const likes = raw.likes || {};
  for (const [spot, list] of Object.entries(likes)) { need(spotById.has(spot), `likes for ${spot}`); for (const id of list) need(items.has(id), `${spot} likes ${id}`); }
  return {
    id: island.id, island, spotById, crops, animals, products, tools, recipes, items, likes,
    plotCount: Math.max(1, Math.min(16, num(raw.plotCount, 9))),
    animalLimit: Math.max(1, num(raw.animalLimit, 4)),
    dailyCoinCap: Math.max(0, num(raw.dailyCoinCap, 150)),
    xp: { word: 3, fill: 3, order: 5, spell: 5, reply: 4, ...(raw.xp || {}) },
  };
}

function loadBank() {
  const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  need(Array.isArray(bank.fill) && bank.fill.length >= 10, 'bank fill');
  need(Array.isArray(bank.reply) && bank.reply.length >= 10, 'bank reply');
  for (const f of bank.fill) need(f.q && f.q.includes('___') && f.a && f.d?.length === 3, `fill "${f.q}"`);
  for (const r of bank.reply) need(r.says && r.a && r.d?.length === 3, `reply "${r.says}"`);
  for (const b of bank.brush) need(b.animal && b.a && b.d?.length === 3, 'brush');
  return bank;
}

export const FARM = loadFarm();
export const BANK = loadBank();
for (const r of FARM.recipes.values()) need(Array.isArray(BANK.cook[r.id]) && BANK.cook[r.id].length >= 3, `cook steps for ${r.id}`);

// ---- time ----------------------------------------------------------------------------
export const DAY_MS = CYCLE_SEC * 1000;
export const farmDay = (now = Date.now()) => Math.floor(now / DAY_MS);
export const seasonId = (now = Date.now()) => seasonFor(now).id;

// ---- the farm ------------------------------------------------------------------------
export function blankFarm() {
  return {
    plots: Array.from({ length: FARM.plotCount }, () => null),   // null or { crop, growth, last, planted }
    seeds: {},        // crop id -> count
    items: {},        // crop / product / dish id -> count
    animals: [],      // { kind, name, hearts, fed, brushed, got }  (days)
    can: 1,           // plots watered per right answer
    hearts: {},       // spot id -> hearts with that villager
    talked: {},       // spot id -> farm day last talked
    gifted: {},       // spot id -> farm day last gifted
    dex: [],          // words used right, in the order they were first used
    shipped: 0,       // shipments, ever
    earned: 0,        // coins from shipping, ever
    week: { key: 0, coins: 0 },
    q: null,          // the question on the table, if any
  };
}

const cleanCount = (obj, known) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [id, n] of Object.entries(obj)) {
    const v = Math.floor(Number(n));
    if (known.has(id) && v > 0) out[id] = Math.min(999, v);
  }
  return out;
};

export function sanitizeFarm(raw) {
  const farm = blankFarm();
  if (!raw || typeof raw !== 'object') return farm;
  if (Array.isArray(raw.plots)) {
    raw.plots.slice(0, FARM.plotCount).forEach((p, i) => {
      if (!p || !FARM.crops.has(p.crop)) return;
      farm.plots[i] = { crop: p.crop, growth: Math.max(0, Math.floor(num(p.growth))), last: Math.floor(num(p.last)), planted: Math.floor(num(p.planted)) };
    });
  }
  farm.seeds = cleanCount(raw.seeds, FARM.crops);
  farm.items = cleanCount(raw.items, FARM.items);
  if (Array.isArray(raw.animals)) {
    farm.animals = raw.animals.filter((a) => a && FARM.animals.has(a.kind)).slice(0, FARM.animalLimit).map((a) => ({
      kind: a.kind, name: str(a.name).slice(0, 16) || FARM.animals.get(a.kind).en,
      hearts: Math.max(0, Math.min(10, Math.floor(num(a.hearts)))),
      fed: Math.floor(num(a.fed)), brushed: Math.floor(num(a.brushed)), got: Math.floor(num(a.got)),
    }));
  }
  farm.can = Math.max(1, Math.min(3, Math.floor(num(raw.can, 1))));
  for (const key of ['hearts', 'talked', 'gifted']) {
    const src = raw[key];
    if (!src || typeof src !== 'object') continue;
    for (const [spot, v] of Object.entries(src)) if (FARM.spotById.has(spot)) farm[key][spot] = Math.max(0, Math.floor(num(v)));
  }
  for (const spot of Object.keys(farm.hearts)) farm.hearts[spot] = Math.min(10, farm.hearts[spot]);
  farm.dex = [...new Set((Array.isArray(raw.dex) ? raw.dex : []).map(str).filter(Boolean))].slice(0, 300);
  farm.shipped = Math.max(0, Math.floor(num(raw.shipped)));
  farm.earned = Math.max(0, Math.floor(num(raw.earned)));
  farm.week = { key: Math.floor(num(raw.week?.key)), coins: Math.max(0, Math.floor(num(raw.week?.coins))) };
  return farm;
}

// Time passing. Crops out of season wilt (the shop will not have sold them, so this
// only happens to a plot planted before the calendar turned); the week's shipping
// total starts over on Monday. Nothing else ticks: a plot only grows when watered.
export function settle(farm, now = Date.now()) {
  const season = seasonId(now);
  for (const p of farm.plots) if (p && FARM.crops.get(p.crop).season !== season) p.wilted = true;
  const wk = weekIndex(now);
  if (farm.week.key !== wk) farm.week = { key: wk, coins: 0 };
  return farm;
}

export const unlocked = (farm, spot, hearts) => (farm.hearts[spot] || 0) >= (hearts || 0);

// The shop's shelves right now: this season's seeds, the animals, the cans — each with
// why it is locked, if it is. Nothing here is secret.
export function catalog(farm, now = Date.now()) {
  const season = seasonId(now);
  return {
    seeds: [...FARM.crops.values()].filter((c) => c.season === season).map((c) => ({ ...c, locked: !unlocked(farm, 'seeds', c.hearts) })),
    animals: [...FARM.animals.values()].map((a) => ({ ...a, locked: !unlocked(farm, 'barn', a.hearts), full: farm.animals.length >= FARM.animalLimit })),
    tools: [...FARM.tools.values()].map((t) => ({ ...t, locked: !unlocked(farm, 'seeds', t.hearts), owned: farm.can >= t.can })),
    recipes: [...FARM.recipes.values()].map((r) => ({ ...r, locked: !unlocked(farm, 'kitchen', r.hearts) })),
  };
}

// What the page sees. The whole farm, plus the time it is judged by, minus the answer.
export function statePayload(farm, now = Date.now()) {
  const day = farmDay(now);
  return {
    day, season: seasonId(now), week: farm.week,
    plots: farm.plots.map((p) => (p ? {
      crop: p.crop, growth: p.growth, days: FARM.crops.get(p.crop).days,
      ready: !p.wilted && p.growth >= FARM.crops.get(p.crop).days,
      watered: p.last === day, wilted: !!p.wilted,
    } : null)),
    seeds: { ...farm.seeds }, items: { ...farm.items },
    animals: farm.animals.map((a, i) => ({ i, kind: a.kind, name: a.name, hearts: a.hearts, fed: a.fed === day, brushed: a.brushed === day, got: a.got === day, product: FARM.animals.get(a.kind).product })),
    can: farm.can, hearts: { ...farm.hearts }, talked: Object.fromEntries(Object.entries(farm.talked).map(([k, v]) => [k, v === day])),
    gifted: Object.fromEntries(Object.entries(farm.gifted).map(([k, v]) => [k, v === day])),
    dex: [...farm.dex], shipped: farm.shipped, earned: farm.earned,
    catalog: catalog(farm, now),
    pending: farm.q ? askPayload(farm.q) : null,
  };
}

// ---- questions -----------------------------------------------------------------------
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const plural = (word) => {
  if (/(sh|ch|s|x|z|o)$/i.test(word) && !/photo$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
};
// The thing a child holds, in English, counted: "three turnips", "two milk", "an egg".
const MASS = new Set(['milk', 'wool', 'corn', 'spinach', 'hay', 'strawberry-jam', 'potato-salad', 'tomato-soup', 'corn-soup']);
const countNoun = (item, n) => (n === 1 ? item.en : MASS.has(item.id) ? item.en : plural(item.en));
const numberWord = (n) => BANK.numbers[n] || String(n);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

const qid = () => randomBytes(6).toString('hex');
const tokensOf = (sentence) => sentence.split(' ');

function orderQ(act, en, ja, extra = {}) {
  return { id: qid(), act, kind: 'order', prompt: { en: '', ja }, tokens: shuffle(tokensOf(en)), answer: en, ...extra };
}
function choiceQ(act, kind, prompt, answer, distractors, extra = {}) {
  return { id: qid(), act, kind, prompt, choices: shuffle([answer, ...distractors]), answer, ...extra };
}
function sentenceFor(key, vars) {
  const t = BANK.templates[key];
  return { en: fill(t.en, vars), ja: fill(t.ja, vars) };
}

// What the page is allowed to see of a question: everything but the answer.
export function askPayload(q) {
  const { answer, effect, ...rest } = q;
  return rest;
}

// Judge an answer the page sent. One rule for every kind: letters and spacing are
// forgiven, words are not.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
export function judge(q, answer) {
  if (!q) return false;
  const given = Array.isArray(answer) ? answer.join(' ') : answer;
  return norm(given) === norm(q.answer);
}

// ---- actions -------------------------------------------------------------------------
//
// prepare() checks the action is possible right now, builds its question, and attaches
// the effect to run when the answer is right. The room holds the question on the farm
// (`farm.q`) until it is answered, so an answer cannot be sent for a question that was
// never asked, and a second action replaces the first.
const SPOT_OF_ACT = {
  buy: 'seeds', tool: 'seeds', plant: 'house', water: 'house', harvest: 'house', clear: 'house',
  feed: 'barn', brush: 'barn', collect: 'barn', ship: 'ship', cook: 'kitchen', talk: null, gift: null,
};
export const spotForAct = (act, spot) => (SPOT_OF_ACT[act] === undefined ? null : SPOT_OF_ACT[act] ?? spot);

export function prepare(farm, act, params = {}, { now = Date.now(), coins = 0, spot = '' } = {}) {
  settle(farm, now);
  const day = farmDay(now);
  const season = seasonId(now);
  const p = params || {};
  switch (act) {
    case 'buy': {
      const crop = FARM.crops.get(str(p.item));
      const animal = FARM.animals.get(str(p.item));
      const qty = Math.max(1, Math.min(10, Math.floor(num(p.qty, 1))));
      if (crop) {
        if (crop.season !== season) throw new FarmError('out of season');
        if (!unlocked(farm, 'seeds', crop.hearts)) throw new FarmError('locked');
        if (coins < crop.seed * qty) throw new FarmError('not enough coins');
        const item = { id: crop.id, en: `${crop.en} seed`, ja: `${crop.ja}の たね` };
        const s = qty === 1
          ? sentenceFor('buyOne', { a: article(item.en), item: item.en, item_ja: item.ja })
          : sentenceFor('buy', { n: numberWord(qty), n_ja: `${qty}つ`, item: plural(item.en), item_ja: item.ja });
        return orderQ('buy', s.en, s.ja, {
          cost: crop.seed * qty,
          effect: (f) => { f.seeds[crop.id] = (f.seeds[crop.id] || 0) + qty; noteWord(f, crop.en); return { spend: crop.seed * qty, id: `farm:seed:${crop.id}`, en: `You bought ${qty} ${countNoun(item, qty)}.`, ja: `${crop.ja}の たねを ${qty}つ かった。` }; },
        });
      }
      if (animal) {
        if (!unlocked(farm, 'barn', animal.hearts)) throw new FarmError('locked');
        if (farm.animals.length >= FARM.animalLimit) throw new FarmError('barn full');
        if (coins < animal.price) throw new FarmError('not enough coins');
        const s = sentenceFor('buyOne', { a: article(animal.en), item: animal.en, item_ja: animal.ja });
        return orderQ('buy', s.en, s.ja, {
          cost: animal.price,
          effect: (f) => {
            const name = str(p.name).replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 12) || animal.en;
            f.animals.push({ kind: animal.kind || animal.id, name, hearts: 0, fed: -1, brushed: -1, got: -1 });
            noteWord(f, animal.en);
            return { spend: animal.price, id: `farm:animal:${animal.id}`, en: `${name} the ${animal.en} joined your farm!`, ja: `${animal.ja}の ${name}が きた！` };
          },
        });
      }
      throw new FarmError('no such item');
    }
    case 'tool': {
      const tool = FARM.tools.get(str(p.item));
      if (!tool) throw new FarmError('no such item');
      if (farm.can >= tool.can) throw new FarmError('already owned');
      if (!unlocked(farm, 'seeds', tool.hearts)) throw new FarmError('locked');
      if (coins < tool.price) throw new FarmError('not enough coins');
      const s = sentenceFor('tool', { item: tool.en, item_ja: tool.ja });
      return orderQ('tool', s.en, s.ja, { cost: tool.price, effect: (f) => { f.can = tool.can; noteWord(f, 'watering can'); return { spend: tool.price, id: `farm:tool:${tool.id}`, en: `You got the ${tool.en}! ${tool.can} plots per answer.`, ja: `${tool.ja}を てにいれた！ 1もんで ${tool.can}マス。` }; } });
    }
    case 'plant': {
      const i = Math.floor(num(p.plot, -1));
      const crop = FARM.crops.get(str(p.crop));
      if (i < 0 || i >= farm.plots.length) throw new FarmError('no such plot');
      if (farm.plots[i]) throw new FarmError('plot taken');
      if (!crop) throw new FarmError('no such crop');
      if (!(farm.seeds[crop.id] > 0)) throw new FarmError('no seeds');
      if (crop.season !== season) throw new FarmError('out of season');
      const others = shuffle([...FARM.crops.values()].filter((c) => c.id !== crop.id)).slice(0, 3).map((c) => c.en);
      return choiceQ('plant', 'word', { en: `${crop.emoji} What is this in English?`, ja: `${crop.emoji} ${crop.ja} は えいごで？` }, crop.en, others, {
        effect: (f) => { f.seeds[crop.id] -= 1; if (!f.seeds[crop.id]) delete f.seeds[crop.id]; f.plots[i] = { crop: crop.id, growth: 0, last: -1, planted: day }; noteWord(f, crop.en); return { en: `You planted ${article(crop.en)} ${crop.en} seed.`, ja: `${crop.ja}の たねを まいた。` }; },
      });
    }
    case 'water': {
      const dry = farm.plots.map((pl, i) => ({ pl, i })).filter(({ pl }) => pl && !pl.wilted && pl.last !== day && pl.growth < FARM.crops.get(pl.crop).days);
      if (!dry.length) throw new FarmError('nothing to water');
      const targets = dry.slice(0, farm.can);
      const f0 = pick(BANK.fill);
      return choiceQ('water', 'fill', { en: f0.q, ja: f0.ja }, f0.a, f0.d, {
        plots: targets.map((t) => t.i),
        effect: (f) => {
          let n = 0;
          for (const { i } of targets) { const pl = f.plots[i]; if (pl && pl.last !== day) { pl.last = day; pl.growth += 1; n += 1; } }
          noteWord(f, f0.a);
          return { en: n === 1 ? 'You watered a plot.' : `You watered ${numberWord(n)} plots.`, ja: `${n}マスに みずを やった。` };
        },
      });
    }
    case 'harvest': {
      const i = Math.floor(num(p.plot, -1));
      const pl = farm.plots[i];
      if (!pl) throw new FarmError('no such plot');
      const crop = FARM.crops.get(pl.crop);
      if (pl.wilted || pl.growth < crop.days) throw new FarmError('not ready');
      const qty = 1;
      const s = sentenceFor('harvestOne', { a: article(crop.en), item: crop.en, item_ja: crop.ja });
      return orderQ('harvest', s.en, s.ja, {
        effect: (f) => {
          f.items[crop.id] = (f.items[crop.id] || 0) + qty;
          if (crop.regrow > 0) f.plots[i] = { crop: crop.id, growth: crop.days - crop.regrow, last: day, planted: pl.planted };
          else f.plots[i] = null;
          noteWord(f, crop.en);
          return { en: `You picked ${article(crop.en)} ${crop.en}!${crop.regrow ? ' It will grow again.' : ''}`, ja: `${crop.ja}を とった！${crop.regrow ? ' また なるよ。' : ''}` };
        },
      });
    }
    case 'clear': {
      const i = Math.floor(num(p.plot, -1));
      const pl = farm.plots[i];
      if (!pl || !pl.wilted) throw new FarmError('nothing to clear');
      const s = sentenceFor('clear', {});
      return orderQ('clear', s.en, s.ja, { effect: (f) => { f.plots[i] = null; return { en: 'The plot is clean again.', ja: 'はたけが きれいに なった。' }; } });
    }
    case 'feed': case 'brush': case 'collect': {
      const i = Math.floor(num(p.animal, -1));
      const a = farm.animals[i];
      if (!a) throw new FarmError('no such animal');
      const kind = FARM.animals.get(a.kind);
      if (act === 'feed') {
        if (a.fed === day) throw new FarmError('already fed');
        const feed = BANK.feeds[kind.feed];
        const s = sentenceFor('feed', { animal: kind.en, animal_ja: kind.ja, feed: feed.en, feed_ja: feed.ja });
        return orderQ('feed', s.en, s.ja, { effect: (f) => { const an = f.animals[i]; an.fed = day; if (an.brushed === day) an.hearts = Math.min(10, an.hearts + 1); noteWord(f, feed.en); return { en: `${an.name} is eating happily.`, ja: `${an.name}は おいしそうに たべている。` }; } });
      }
      if (act === 'brush') {
        if (a.brushed === day) throw new FarmError('already brushed');
        const b = pick(BANK.brush.filter((x) => x.animal === a.kind));
        return choiceQ('brush', 'reply', { en: `Say something kind to ${a.name} the ${kind.en}.`, ja: `${kind.ja}の ${a.name}に やさしい ことばを かけよう。` }, b.a, b.d, {
          effect: (f) => { const an = f.animals[i]; an.brushed = day; if (an.fed === day) an.hearts = Math.min(10, an.hearts + 1); return { en: `${an.name} says "${kind.sound}!" ${an.fed === day ? '❤' : ''}`, ja: `${an.name}は「${kind.sound}！」と いった。` }; },
        });
      }
      if (a.got === day) throw new FarmError('already collected');
      if (a.fed !== day) throw new FarmError('hungry');
      const product = FARM.products.get(kind.product);
      const c = BANK.collect[a.kind];
      const others = shuffle([...[...FARM.products.values()].filter((x) => x.id !== product.id).map((x) => x.en), ...BANK.collectDistractors]).slice(0, 3);
      return choiceQ('collect', 'word', { en: c.says, ja: c.ja }, product.en, others, {
        effect: (f) => { const an = f.animals[i]; an.got = day; f.items[product.id] = (f.items[product.id] || 0) + 1; noteWord(f, product.en); return { en: `You got ${MASS.has(product.id) ? 'some' : article(product.en)} ${product.en} from ${an.name}.`, ja: `${an.name}から ${product.ja}を もらった。` }; },
      });
    }
    case 'ship': {
      const item = FARM.items.get(str(p.item));
      if (!item) throw new FarmError('no such item');
      const have = farm.items[item.id] || 0;
      const qty = Math.max(1, Math.min(have, Math.floor(num(p.qty, 1))));
      if (!have) throw new FarmError('nothing to ship');
      const value = valueOf(farm, item, qty);
      return {
        id: qid(), act: 'ship', kind: 'spell',
        prompt: { en: `Write the item on the slip: ${item.emoji} (${item.en.length} letters)`, ja: `でんぴょうに かこう： ${item.emoji} ${item.ja}（${item.en.length}もじ）` },
        hint: `${item.en[0]}${'_ '.repeat(item.en.length - 1).trim()}`, answer: item.en, qty, value,
        effect: (f) => { f.items[item.id] -= qty; if (!f.items[item.id]) delete f.items[item.id]; f.shipped += qty; noteWord(f, item.en); return { award: value, id: `farm:ship:${item.id}`, en: `Shipped ${numberWord(qty)} ${countNoun(item, qty)}!`, ja: `${item.ja}を ${qty}つ しゅっかした！` }; },
      };
    }
    case 'cook': {
      const r = FARM.recipes.get(str(p.recipe));
      if (!r) throw new FarmError('no such recipe');
      if (!unlocked(farm, 'kitchen', r.hearts)) throw new FarmError('locked');
      for (const [id, n] of Object.entries(r.needs)) if ((farm.items[id] || 0) < n) throw new FarmError('missing ingredients');
      const steps = BANK.cook[r.id];
      return {
        id: qid(), act: 'cook', kind: 'order', prompt: { en: `Put the steps of "${r.en}" in order.`, ja: `${r.ja}の つくりかたを じゅんばんに ならべよう。` },
        tokens: shuffle(steps), answer: steps.join(' '), steps: true,
        effect: (f) => { for (const [id, n] of Object.entries(r.needs)) { f.items[id] -= n; if (!f.items[id]) delete f.items[id]; } f.items[r.id] = (f.items[r.id] || 0) + 1; noteWord(f, r.en); return { en: `You made ${article(r.en)} ${r.en}! ${r.emoji}`, ja: `${r.ja}が できた！ ${r.emoji}` }; },
      };
    }
    case 'talk': {
      if (!FARM.spotById.has(spot)) throw new FarmError('no such spot');
      if (farm.talked[spot] === day) throw new FarmError('already talked');
      const line = pick(BANK.reply.filter((x) => x.spot === spot || x.spot === 'any'));
      const who = FARM.spotById.get(spot).character;
      return choiceQ('talk', 'reply', { en: `${who}: "${line.says}"`, ja: `${who}「${line.ja}」` }, line.a, line.d, {
        spot,
        effect: (f) => { f.talked[spot] = day; f.hearts[spot] = Math.min(10, (f.hearts[spot] || 0) + 1); return { en: `${who} smiles. ❤ ${f.hearts[spot]}`, ja: `${who}が にっこり。❤ ${f.hearts[spot]}` }; },
      });
    }
    case 'gift': {
      if (!FARM.spotById.has(spot)) throw new FarmError('no such spot');
      if (farm.gifted[spot] === day) throw new FarmError('already gifted');
      const item = FARM.items.get(str(p.item));
      if (!item || !(farm.items[item.id] > 0)) throw new FarmError('nothing to give');
      const who = FARM.spotById.get(spot).character;
      const loved = (FARM.likes[spot] || []).includes(item.id);
      const s = MASS.has(item.id) ? sentenceFor('giftPlural', { item: item.en, item_ja: item.ja, name: who }) : sentenceFor('gift', { a: article(item.en), item: item.en, item_ja: item.ja, name: who });
      return orderQ('gift', s.en, s.ja, {
        spot,
        effect: (f) => { f.items[item.id] -= 1; if (!f.items[item.id]) delete f.items[item.id]; f.gifted[spot] = day; f.hearts[spot] = Math.min(10, (f.hearts[spot] || 0) + (loved ? 2 : 1)); noteWord(f, item.en); return { en: loved ? `${who}: "I love ${plural(item.en)}! Thank you!" ❤❤` : `${who}: "Thank you." ❤`, ja: loved ? `${who}「${item.ja}、だいすき！ ありがとう！」❤❤` : `${who}「ありがとう。」❤` }; },
      });
    }
    default:
      throw new FarmError('unknown action');
  }
}

// What a shipment pays: the item's price, times the quantity, lifted by hearts in the
// barn for what the animals gave — 牧場物語's egg that goes 50 → 80 → 150 with care.
export function valueOf(farm, item, qty) {
  let unit = item.sell;
  if (item.kind === 'product') {
    const best = Math.max(0, ...farm.animals.filter((a) => FARM.animals.get(a.kind).product === item.id).map((a) => a.hearts));
    unit = Math.round(unit * (1 + Math.min(10, best) * 0.15));
  }
  return unit * qty;
}

// A word used right goes in the child's own dictionary: the figure on the report that
// says what this island taught.
function noteWord(farm, word) {
  const w = String(word).toLowerCase();
  if (!farm.dex.includes(w)) farm.dex.push(w);
  if (farm.dex.length > 300) farm.dex.shift();
}

// Everything the room needs to say about a child's farm on a report, from the record.
export function farmSummary(raw) {
  const farm = sanitizeFarm(raw);
  return { shipped: farm.shipped, earned: farm.earned, words: farm.dex.length, animals: farm.animals.length, hearts: Object.values(farm.hearts).reduce((a, b) => a + b, 0) };
}
