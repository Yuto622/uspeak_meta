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
import { weekIndex } from './daily.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FARM_PATH = path.resolve(here, '../../../client/dist/farm.json');
const BANK_PATH = path.resolve(here, 'farm-bank.json');

export class FarmError extends Error {}

const need = (ok, msg) => { if (!ok) throw new Error(`farm.json: ${msg}`); };
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
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
  // Two places that are not buildings: the field and the pen, out in the open. A child
  // stands on a plot to plant or water it, and beside an animal to feed it (2026-10:
  // the classroom said a 2D grid in a greenhouse was no farm). They are position-checked
  // like a building, from the centre of the fenced square the page draws from the same
  // numbers.
  const plots = island.plots; const pen = island.pen;
  need(plots && Number.isFinite(plots.x) && Number.isFinite(plots.z) && plots.cols >= 1 && plots.rows >= 1 && plots.gap > 0, 'plots block');
  need(pen && Number.isFinite(pen.x) && Number.isFinite(pen.z), 'pen block');
  const fieldAt = { x: plots.x + ((plots.cols - 1) * plots.gap) / 2, z: plots.z + ((plots.rows - 1) * plots.gap) / 2 };
  const placeById = new Map(spotById);
  for (const [id, at] of [['field', fieldAt], ['pen', { x: pen.x, z: pen.z }]]) {
    need(!placeById.has(id), `a spot is already called ${id}`);
    placeById.set(id, { id, x: at.x, z: at.z, wx: island.x + at.x, wz: island.z + at.z, open: true });
  }
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
  const dislikes = raw.dislikes || {};
  for (const [spot, list] of Object.entries(dislikes)) { need(spotById.has(spot), `dislikes for ${spot}`); for (const id of list) need(items.has(id) && !(likes[spot] || []).includes(id), `${spot} dislikes ${id}`); }
  // Every villager has a birthday on the farm's calendar (season, day of the season);
  // the festivals are the four days a season the island dresses up (one per season).
  for (const sp of island.spots) need(sp.birthday && SEASONS.includes(sp.birthday.season) && sp.birthday.day >= 1, `birthday of ${sp.id}`);
  const events = new Map();
  for (const ev of raw.events || []) {
    need(ev.id && ev.ja && ev.en && ev.emoji && SEASONS.includes(ev.season) && ev.from >= 1 && ev.to >= ev.from && spotById.has(ev.host) && Array.isArray(ev.wants) && ev.wants.length && ev.bonus >= 0, `event ${ev.id}`);
    for (const id of ev.wants) need(items.has(id), `event ${ev.id} wants ${id}`);
    need(!events.has(ev.id) && ![...events.values()].some((o) => o.season === ev.season), `one festival per season (${ev.id})`);
    events.set(ev.id, ev);
  }
  need(events.size === 4, 'four festivals');
  return {
    id: island.id, island, spotById, placeById, plots, pen, crops, animals, products, tools, recipes, items, likes, dislikes, events,
    plotCount: Math.max(1, Math.min(16, num(raw.plotCount, 9))),
    animalLimit: Math.max(1, num(raw.animalLimit, 4)),
    dailyCoinCap: Math.max(0, num(raw.dailyCoinCap, 150)),
    xp: { word: 3, fill: 3, order: 5, spell: 5, reply: 4, ...(raw.xp || {}) },
  };
}

function loadBank() {
  const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  need(Array.isArray(bank.water) && bank.water.length >= 10, 'bank water');
  need(Array.isArray(bank.talk) && bank.talk.length >= 10, 'bank talk');
  for (const f of bank.water) need(f.pic && f.q && f.q.includes('___') && f.a && f.d?.length === 3 && !f.d.includes(f.a), `water "${f.q}"`);
  for (const r of bank.talk) need(r.says && r.a && r.d?.length === 3 && !r.d.includes(r.a), `talk "${r.says}"`);
  for (const id of ['chicken', 'sheep', 'cow']) need(bank.sounds?.[id] && bank.soundsAll.includes(bank.sounds[id]), `sound for ${id}`);
  const reply = (r, what) => need(r && r.says && r.a && r.d?.length === 3 && !r.d.includes(r.a), what);
  for (const [id, lines] of Object.entries(bank.festival || {})) { need(Array.isArray(lines) && lines.length >= 2, `festival ${id}`); for (const r of lines) reply(r, `festival ${id} "${r?.says}"`); }
  reply(bank.birthday, 'birthday line');
  return bank;
}

export const FARM = loadFarm();
export const BANK = loadBank();
for (const spot of FARM.spotById.keys()) need(BANK.talk.some((x) => x.spot === spot || x.spot === 'any'), `talk lines for ${spot}`);
for (const id of FARM.events.keys()) need(BANK.festival?.[id], `festival lines for ${id}`);

// ---- time ----------------------------------------------------------------------------
// One farm day is one turn of the world clock. FARM_DAY_SEC shortens it for a demo or a
// test (a turnip in a minute instead of a lesson); a classroom leaves it unset.
const DAY_SEC = Math.max(5, Number(process.env.FARM_DAY_SEC) || CYCLE_SEC);
export const DAY_MS = DAY_SEC * 1000;
export const farmDay = (now = Date.now()) => Math.floor(now / DAY_MS);

// ---- the calendar ------------------------------------------------------------------
// Four seasons that turn as the farm's own days pass — not the real calendar, which
// would show a child one season a term. A season is SEASON_DAYS farm days (seven: about
// 80 minutes of world time, so a class that comes once a week sees a new season every
// other lesson and a whole year in two months). Spring, summer, autumn, winter, round
// again; the season's day counts from 1. FARM_SEASON_DAYS shortens it for a demo.
// (With the default of seven, day 2540542 — 4 Oct 2026 — falls in autumn, like the real sky.)
export const SEASON_DAYS = Math.max(2, Math.floor(Number(process.env.FARM_SEASON_DAYS)) || 7);
export function calendarOf(now = Date.now()) {
  const day = farmDay(now);
  const si = Math.floor(day / SEASON_DAYS);
  const seasonDay = day - si * SEASON_DAYS + 1;
  return { day, season: SEASONS[((si % 4) + 4) % 4], seasonDay, seasonDays: SEASON_DAYS, left: SEASON_DAYS - seasonDay + 1, year: Math.floor(si / 4) };
}
export const seasonId = (now = Date.now()) => calendarOf(now).season;
// Days until (season, day) next comes round: 0 when it is today.
export function daysUntil(season, dayOfSeason, now = Date.now()) {
  const c = calendarOf(now);
  const si = SEASONS.indexOf(season);
  const want = Math.min(SEASON_DAYS, Math.max(1, dayOfSeason));
  let d = ((si - SEASONS.indexOf(c.season) + 4) % 4) * SEASON_DAYS + (want - c.seasonDay);
  if (d < 0) d += 4 * SEASON_DAYS;
  return d;
}

// ---- festivals and birthdays -------------------------------------------------------
// One festival a season, on the days farm.json says, at the host's house: the island
// dresses up, the host asks a festival question, the season's crops ship for more, and a
// gift the festival wants is loved three times over. FARM_FESTIVAL_DAYS=all makes every
// day a festival day (a demo or a test); a classroom leaves it unset.
const FESTIVAL_ALL = process.env.FARM_FESTIVAL_DAYS === 'all';
const eventOn = (ev, c) => ev.season === c.season && (FESTIVAL_ALL || (c.seasonDay >= ev.from && c.seasonDay <= ev.to));
export function eventAt(now = Date.now()) {
  const c = calendarOf(now);
  for (const ev of FARM.events.values()) if (eventOn(ev, c)) return { ...ev, daysLeft: FESTIVAL_ALL ? c.left : ev.to - c.seasonDay + 1 };
  return null;
}
// The next festival that is not today's: when, and whose.
export function nextEvent(now = Date.now()) {
  const c = calendarOf(now);
  let best = null;
  for (const ev of FARM.events.values()) {
    if (eventOn(ev, c)) continue;
    let d = daysUntil(ev.season, ev.from, now);
    if (d === 0) d = 4 * SEASON_DAYS;
    if (!best || d < best.inDays) best = { id: ev.id, emoji: ev.emoji, ja: ev.ja, en: ev.en, host: ev.host, inDays: d };
  }
  return best;
}
export const birthdayOf = (spot) => FARM.spotById.get(spot)?.birthday || null;
export const isBirthday = (spot, now = Date.now()) => { const b = birthdayOf(spot); return !!b && daysUntil(b.season, b.day, now) === 0; };
// How close a child and a villager are, in words a card can show.
export const FORGET_DAYS = 30;     // this many farm days without a word, and a heart fades
export const friendship = (hearts) => (hearts >= 10 ? 'best' : hearts >= 6 ? 'close' : hearts >= 3 ? 'friend' : 'new');

// ---- weather -------------------------------------------------------------------------
// Some farm days it rains. The day decides, not the child, so a whole class sees the same
// sky (the island draws it): a hash of the day index, about three days in ten. On a rainy
// day the rain does the watering — every plot and every trough — and the plants grow as
// if a child had done it. FARM_RAIN_PCT tunes how often (a demo can make it 0 or 100).
const RAIN_PCT = Math.max(0, Math.min(100, Number(process.env.FARM_RAIN_PCT ?? 30)));
export const DRY_DAYS = 3;        // a plot left this many days without water or rain wilts
export function rainyDay(day) {
  let h = (Math.floor(day) + 7919) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 100) < RAIN_PCT;
}
export const isRainy = (now = Date.now()) => rainyDay(farmDay(now));
export const weatherOf = (now = Date.now()) => (isRainy(now) ? 'rain' : 'sun');
// The next rainy day on the calendar, so the page can say "rain in two days".
export function daysToRain(now = Date.now(), limit = 14) {
  const d0 = farmDay(now);
  for (let k = 1; k <= limit; k += 1) if (rainyDay(d0 + k)) return k;
  return null;
}

// ---- the farm ------------------------------------------------------------------------
export function blankFarm() {
  return {
    plots: Array.from({ length: FARM.plotCount }, () => null),   // null or { crop, growth, last, planted }
    seeds: {},        // crop id -> count
    items: {},        // crop / product / dish id -> count
    animals: [],      // { kind, name, hearts, fed, brushed, wet, got }  (days)
    can: 1,           // plots watered per right answer
    hearts: {},       // spot id -> hearts with that villager
    talked: {},       // spot id -> farm day last talked
    gifted: {},       // spot id -> farm day last gifted
    missed: {},       // spot id -> farm day a heart last faded for silence
    events: {},       // event id -> the farm year the child joined it
    dex: [],          // words used right, in the order they were first used
    shipped: 0,       // shipments, ever
    earned: 0,        // coins from shipping, ever
    week: { key: 0, coins: 0 },
    q: null,          // the question on the table, if any
    settled: -1,      // the last farm day the weather was applied up to
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
      fed: Math.floor(num(a.fed)), brushed: Math.floor(num(a.brushed)), wet: Math.floor(num(a.wet)), got: Math.floor(num(a.got)),
    }));
  }
  farm.can = Math.max(1, Math.min(3, Math.floor(num(raw.can, 1))));
  for (const key of ['hearts', 'talked', 'gifted', 'missed']) {
    const src = raw[key];
    if (!src || typeof src !== 'object') continue;
    for (const [spot, v] of Object.entries(src)) if (FARM.spotById.has(spot)) farm[key][spot] = Math.max(0, Math.floor(num(v)));
  }
  if (raw.events && typeof raw.events === 'object') for (const [id, y] of Object.entries(raw.events)) if (FARM.events.has(id)) farm.events[id] = Math.max(0, Math.floor(num(y)));
  for (const spot of Object.keys(farm.hearts)) farm.hearts[spot] = Math.min(10, farm.hearts[spot]);
  farm.dex = [...new Set((Array.isArray(raw.dex) ? raw.dex : []).map(str).filter(Boolean))].slice(0, 300);
  farm.shipped = Math.max(0, Math.floor(num(raw.shipped)));
  farm.earned = Math.max(0, Math.floor(num(raw.earned)));
  farm.week = { key: Math.floor(num(raw.week?.key)), coins: Math.max(0, Math.floor(num(raw.week?.coins))) };
  farm.settled = Math.floor(num(raw.settled, -1));
  return farm;
}

// Time passing. Crops out of season wilt (the shop will not have sold them, so this
// only happens to a plot planted before the calendar turned); the week's shipping total
// starts over on Monday. And the weather: every day since the farm was last looked at is
// replayed in order — a rainy day waters every plot (and it grows) and fills every trough;
// a plot that has then gone DRY_DAYS without water or rain wilts. A child who was away for
// a week comes back to what a week did, rain and all, not to a farm frozen on the day they left.
export function settle(farm, now = Date.now()) {
  const season = seasonId(now);
  for (const p of farm.plots) if (p && FARM.crops.get(p.crop).season !== season) p.wilted = true;
  const wk = weekIndex(now);
  if (farm.week.key !== wk) farm.week = { key: wk, coins: 0 };
  const today = farmDay(now);
  // A farm never settled before (new, or saved before the weather existed) starts today:
  // nothing is known of its past days, so nothing wilts for them.
  const first = farm.settled < 0;
  const from = first ? today : Math.max(farm.settled + 1, today - 60);
  for (let d = from; d <= today; d += 1) {
    if (rainyDay(d)) {
      for (const p of farm.plots) {
        if (!p || p.wilted) continue;
        if (p.last !== d && p.growth < FARM.crops.get(p.crop).days) { p.last = d; p.growth += 1; }
      }
      for (const a of farm.animals) a.wet = d;
    } else if (!first) {
      for (const p of farm.plots) {
        if (!p || p.wilted || p.growth >= FARM.crops.get(p.crop).days) continue;
        if (d - Math.max(p.last, p.planted) >= DRY_DAYS) p.wilted = true;
      }
    }
  }
  // Friendship is kept, not banked: a villager not spoken to (or given anything) for
  // FORGET_DAYS loses one heart, once per such silence — a reason to say hello first.
  if (!first) {
    for (const [spot, h] of Object.entries(farm.hearts)) {
      if (!(h > 0)) continue;
      const last = Math.max(farm.talked[spot] ?? -1, farm.gifted[spot] ?? -1, farm.missed[spot] ?? -1);
      if (last >= 0 && today - last >= FORGET_DAYS) { farm.hearts[spot] = h - 1; farm.missed[spot] = today; }
    }
  }
  farm.settled = today;
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
  settle(farm, now);
  const day = farmDay(now);
  const cal = calendarOf(now);
  const ev = eventAt(now);
  const villagers = {};
  for (const sp of FARM.island.spots) {
    const b = sp.birthday;
    const inDays = daysUntil(b.season, b.day, now);
    const h = farm.hearts[sp.id] || 0;
    villagers[sp.id] = {
      character: sp.character, hearts: h, level: friendship(h), talked: farm.talked[sp.id] === day, gifted: farm.gifted[sp.id] === day,
      likes: FARM.likes[sp.id] || [], dislikes: FARM.dislikes[sp.id] || [],
      birthday: { season: b.season, day: b.day, today: inDays === 0, inDays },
      festival: ev && ev.host === sp.id ? { id: ev.id, joined: farm.events[ev.id] === cal.year } : null,
    };
  }
  return {
    day, season: cal.season, calendar: cal, week: farm.week, weather: weatherOf(now), rainIn: daysToRain(now), dryDays: DRY_DAYS,
    event: ev ? { id: ev.id, emoji: ev.emoji, ja: ev.ja, en: ev.en, host: ev.host, hostName: FARM.spotById.get(ev.host).character, wants: ev.wants, bonus: ev.bonus, daysLeft: ev.daysLeft, joined: farm.events[ev.id] === cal.year } : null,
    nextEvent: nextEvent(now), villagers, festivals: Object.keys(farm.events).length,
    plots: farm.plots.map((p) => (p ? {
      crop: p.crop, growth: p.growth, days: FARM.crops.get(p.crop).days,
      ready: !p.wilted && p.growth >= FARM.crops.get(p.crop).days,
      watered: p.last === day, wilted: !!p.wilted,
    } : null)),
    seeds: { ...farm.seeds }, items: { ...farm.items },
    animals: farm.animals.map((a, i) => ({ i, kind: a.kind, name: a.name, hearts: a.hearts, fed: a.fed === day, brushed: a.brushed === day, wet: a.wet === day, got: a.got === day, product: FARM.animals.get(a.kind).product })),
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

// Every question carries a picture (`pic`), a short English line and a Japanese one, so a
// seven-year-old who cannot read the English yet still knows what is being asked.
function orderQ(act, en, ja, pic, extra = {}) {
  let tokens = shuffle(tokensOf(en));
  // Three cards that come out already in order are not a question.
  for (let i = 0; i < 5 && tokens.join(' ') === en && tokens.length > 1; i += 1) tokens = shuffle(tokens);
  return { id: qid(), act, kind: 'order', pic, prompt: { en: '', ja }, tokens, answer: en, ...extra };
}
function choiceQ(act, kind, pic, prompt, answer, distractors, extra = {}) {
  return { id: qid(), act, kind, pic, prompt, choices: shuffle([answer, ...distractors]), answer, ...extra };
}
// Short words are spelt with letter tiles; long ones are picked from three spellings,
// because ten tiles is a puzzle and not a word to a first-grader.
function misspell(word) {
  const w = word.toLowerCase();
  const out = new Set();
  const tries = [
    () => w.slice(0, 1) + w.slice(2, 3) + w.slice(1, 2) + w.slice(3),            // swap 2nd and 3rd
    () => w.replace(/([aeiou])/, (m, v) => ({ a: 'e', e: 'i', i: 'e', o: 'u', u: 'o' }[v])), // one vowel
    () => w.replace(/(.)\1/, '$1') !== w ? w.replace(/(.)\1/, '$1') : `${w.slice(0, -1)}${w.slice(-1)}${w.slice(-1)}`, // drop or double
    () => w.slice(0, -2) + w.slice(-1) + w.slice(-2, -1),                          // swap the last two
  ];
  for (const t of tries) { const m = t(); if (m !== w && /^[a-z ]+$/.test(m)) out.add(m); if (out.size >= 2) break; }
  return [...out];
}
function spellQ(act, item, pic, extra = {}) {
  const word = item.en;
  const prompt = { en: `${pic} Spell it!`, ja: `${item.ja} を えいごで かこう。` };
  if (word.length <= 6 && !word.includes(' ')) {
    let tiles = shuffle(word.split(''));
    for (let i = 0; i < 5 && tiles.join('') === word; i += 1) tiles = shuffle(tiles);
    return { id: qid(), act, kind: 'letters', pic, prompt, tokens: tiles, answer: word, ...extra };
  }
  const wrong = misspell(word);
  while (wrong.length < 2) wrong.push(`${word}${'s'.repeat(wrong.length + 1)}`);
  return choiceQ(act, 'spell', pic, { en: `${pic} Which is right?`, ja: `${item.ja}：ただしい つづりは どれ？` }, word, wrong.slice(0, 2), extra);
}
const others = (list, not, n = 3) => shuffle(list.filter((x) => x !== not)).slice(0, n);
const cropWords = () => [...FARM.crops.values()].map((c) => c.en);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
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
  // Letter tiles are a word, not a sentence: put together without spaces.
  const given = Array.isArray(answer) ? answer.join(q.kind === 'letters' ? '' : ' ') : answer;
  return norm(given) === norm(q.answer);
}

// ---- actions -------------------------------------------------------------------------
//
// prepare() checks the action is possible right now, builds its question, and attaches
// the effect to run when the answer is right. The room holds the question on the farm
// (`farm.q`) until it is answered, so an answer cannot be sent for a question that was
// never asked, and a second action replaces the first.
// Field work is done standing on the field (or, still, from the greenhouse's overview);
// animals are tended at the pen (or in the barn). The first place listed is where a
// request that names nowhere in particular is checked.
const SPOT_OF_ACT = {
  buy: 'seeds', tool: 'seeds', plant: ['field', 'house'], water: ['field', 'house'], harvest: ['field', 'house'], clear: ['field', 'house'],
  feed: ['pen', 'barn'], brush: ['pen', 'barn'], trough: ['pen', 'barn'], collect: ['pen', 'barn'], ship: 'ship', cook: 'kitchen', talk: null, gift: null, event: null,
};
export const spotForAct = (act, spot) => {
  const where = SPOT_OF_ACT[act];
  if (where === undefined) return null;
  if (where === null) return spot;
  if (Array.isArray(where)) return where.includes(spot) ? spot : where[0];
  return where;
};

export function prepare(farm, act, params = {}, { now = Date.now(), coins = 0, spot = '' } = {}) {
  settle(farm, now);
  const day = farmDay(now);
  const season = seasonId(now);
  const p = params || {};
  switch (act) {
    case 'buy': {
      // "Three carrots, please." — three cards, the number and the thing.
      const crop = FARM.crops.get(str(p.item));
      const animal = FARM.animals.get(str(p.item));
      const qty = Math.max(1, Math.min(5, Math.floor(num(p.qty, 1))));
      if (crop) {
        if (crop.season !== season) throw new FarmError('out of season');
        if (!unlocked(farm, 'seeds', crop.hearts)) throw new FarmError('locked');
        if (coins < crop.seed * qty) throw new FarmError('not enough coins');
        const s = qty === 1
          ? sentenceFor('buyOne', { A: cap(article(crop.en)), item: crop.en, item_ja: crop.ja })
          : sentenceFor('buyMany', { N: cap(numberWord(qty)), items: plural(crop.en), item_ja: crop.ja, n_ja: BANK.numbersJa[qty] });
        return orderQ('buy', s.en, s.ja, `${crop.emoji}`.repeat(qty), {
          cost: crop.seed * qty,
          effect: (f) => { f.seeds[crop.id] = (f.seeds[crop.id] || 0) + qty; noteWord(f, crop.en); return { spend: crop.seed * qty, id: `farm:seed:${crop.id}`, en: `You got ${qty} ${countNoun({ ...crop, en: `${crop.en} seed` }, qty)}!`, ja: `${crop.ja}の たねを ${qty}つ かった！` }; },
        });
      }
      if (animal) {
        if (!unlocked(farm, 'barn', animal.hearts)) throw new FarmError('locked');
        if (farm.animals.length >= FARM.animalLimit) throw new FarmError('barn full');
        if (coins < animal.price) throw new FarmError('not enough coins');
        const s = sentenceFor('buyOne', { A: cap(article(animal.en)), item: animal.en, item_ja: animal.ja });
        return orderQ('buy', s.en, s.ja, animal.emoji, {
          cost: animal.price,
          effect: (f) => {
            const name = str(p.name).replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 12) || cap(animal.en);
            f.animals.push({ kind: animal.id, name, hearts: 0, fed: -1, brushed: -1, got: -1 });
            noteWord(f, animal.en);
            return { spend: animal.price, id: `farm:animal:${animal.id}`, en: `${name} the ${animal.en} is here!`, ja: `${animal.ja}の ${name}が きた！` };
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
      return choiceQ('tool', 'word', '🚿', { en: '🚿 What is this?', ja: 'これは えいごで なに？（みずを やる どうぐ）' }, 'watering can', ['frying pan', 'umbrella', 'bucket'], {
        cost: tool.price,
        effect: (f) => { f.can = tool.can; noteWord(f, 'watering can'); return { spend: tool.price, id: `farm:tool:${tool.id}`, en: `New watering can! ${tool.can} plots each time.`, ja: `あたらしい ジョウロ！ 1かいで ${tool.can}マス。` }; },
      });
    }
    case 'plant': {
      // A picture and four words: which one is it?
      const i = Math.floor(num(p.plot, -1));
      const crop = FARM.crops.get(str(p.crop));
      if (i < 0 || i >= farm.plots.length) throw new FarmError('no such plot');
      if (farm.plots[i]) throw new FarmError('plot taken');
      if (!crop) throw new FarmError('no such crop');
      if (!(farm.seeds[crop.id] > 0)) throw new FarmError('no seeds');
      if (crop.season !== season) throw new FarmError('out of season');
      return choiceQ('plant', 'word', crop.emoji, { en: `${crop.emoji} What is this?`, ja: `${crop.emoji} これは えいごで なに？` }, crop.en, others(cropWords(), crop.en), {
        effect: (f) => { f.seeds[crop.id] -= 1; if (!f.seeds[crop.id]) delete f.seeds[crop.id]; f.plots[i] = { crop: crop.id, growth: 0, last: -1, planted: day }; noteWord(f, crop.en); return { en: `You planted the ${crop.en}! 🌱`, ja: `${crop.ja}を うえた！ 🌱` }; },
      });
    }
    case 'water': {
      const dry = farm.plots.map((pl, i) => ({ pl, i })).filter(({ pl }) => pl && !pl.wilted && pl.last !== day && pl.growth < FARM.crops.get(pl.crop).days);
      if (!dry.length) throw new FarmError('nothing to water');
      const targets = dry.slice(0, farm.can);
      const w = pick(BANK.water);
      return choiceQ('water', 'fill', w.pic, { en: `${w.pic} ${w.q}`, ja: w.ja }, w.a, w.d, {
        plots: targets.map((t) => t.i),
        effect: (f) => {
          let n = 0;
          for (const { i } of targets) { const pl = f.plots[i]; if (pl && pl.last !== day) { pl.last = day; pl.growth += 1; n += 1; } }
          noteWord(f, w.a);
          return { en: `💧 Water! ${n === 1 ? 'One plot' : `${cap(numberWord(n))} plots`} grew.`, ja: `💧 ${n}マスに みずを やった。そだった！` };
        },
      });
    }
    case 'harvest': {
      // Count what came up: "How many?" and a number word. A harvest is one to three.
      const i = Math.floor(num(p.plot, -1));
      const pl = farm.plots[i];
      if (!pl) throw new FarmError('no such plot');
      const crop = FARM.crops.get(pl.crop);
      if (pl.wilted || pl.growth < crop.days) throw new FarmError('not ready');
      const qty = 1 + Math.floor(Math.random() * 3);
      const nums = ['one', 'two', 'three', 'four', 'five'];
      return choiceQ('harvest', 'word', crop.emoji.repeat(qty), { en: `${crop.emoji.repeat(qty)} How many?`, ja: `${crop.ja}は いくつ？ かぞえよう。` }, numberWord(qty), others(nums, numberWord(qty)), {
        effect: (f) => {
          f.items[crop.id] = (f.items[crop.id] || 0) + qty;
          if (crop.regrow > 0) f.plots[i] = { crop: crop.id, growth: crop.days - crop.regrow, last: day, planted: pl.planted };
          else f.plots[i] = null;
          noteWord(f, numberWord(qty));
          return { en: `${cap(numberWord(qty))} ${countNoun(crop, qty)}! ${crop.emoji.repeat(qty)}${crop.regrow ? ' It will grow again.' : ''}`, ja: `${crop.ja}が ${qty}こ とれた！${crop.regrow ? ' また なるよ。' : ''}` };
        },
      });
    }
    case 'clear': {
      const i = Math.floor(num(p.plot, -1));
      const pl = farm.plots[i];
      if (!pl || !pl.wilted) throw new FarmError('nothing to clear');
      const pic = BANK.seasonPic[season];
      return choiceQ('clear', 'word', pic, { en: `${pic} What season is it now?`, ja: `${pic} いまの きせつは？` }, BANK.seasons[season], others(Object.values(BANK.seasons), BANK.seasons[season]), {
        effect: (f) => { f.plots[i] = null; return { en: 'The plot is clean. Plant again!', ja: 'はたけが きれいに なった。また うえよう！' }; },
      });
    }
    case 'feed': case 'brush': case 'trough': case 'collect': {
      const i = Math.floor(num(p.animal, -1));
      const a = farm.animals[i];
      if (!a) throw new FarmError('no such animal');
      const kind = FARM.animals.get(a.kind);
      if (act === 'feed') {
        // "What does a cow say?" — Moo.
        if (a.fed === day) throw new FarmError('already fed');
        const sound = BANK.sounds[a.kind];
        // The other two barn animals are always on the card (that is the comparison a
        // child is learning), plus one stray sound from outside the farm.
        const barn = Object.values(BANK.sounds).filter((x) => x !== sound);
        const wrong = [...barn, ...others(BANK.soundsAll.filter((x) => !barn.includes(x)), sound, 1)];
        return choiceQ('feed', 'word', kind.emoji, { en: `${kind.emoji} What does a ${kind.en} say?`, ja: `${kind.ja}は なんて なく？` }, sound, wrong, {
          effect: (f) => { const an = f.animals[i]; an.fed = day; if (an.brushed === day) an.hearts = Math.min(10, an.hearts + 1); noteWord(f, sound.toLowerCase()); return { en: `${an.name}: "${sound}!" Yum! 🌾`, ja: `${an.name}「${sound}！」 おいしそうに たべた。` }; },
        });
      }
      if (act === 'brush') {
        // Which animal is it?
        if (a.brushed === day) throw new FarmError('already brushed');
        const words = ['chicken', 'sheep', 'cow', 'dog', 'cat', 'pig', 'horse', 'rabbit'];
        return choiceQ('brush', 'word', kind.emoji, { en: `${kind.emoji} What animal is this?`, ja: `${kind.emoji} これは なんの どうぶつ？` }, kind.en, others(words, kind.en), {
          effect: (f) => { const an = f.animals[i]; an.brushed = day; if (an.fed === day) an.hearts = Math.min(10, an.hearts + 1); noteWord(f, kind.en); return { en: `${an.name} is happy! ${an.fed === day ? '❤' : ''}`, ja: `${an.name}は うれしそう！${an.fed === day ? ' ❤' : ''}` }; },
        });
      }
      if (act === 'trough') {
        // Water for the animals: the same fill-in-the-blank the field asks. Rain did it already.
        if (a.wet === day) throw new FarmError(rainyDay(day) ? 'rain did it' : 'already watered');
        const w = pick(BANK.water);
        return choiceQ('trough', 'fill', w.pic, { en: `${w.pic} ${w.q}`, ja: w.ja }, w.a, w.d, {
          effect: (f) => { const an = f.animals[i]; an.wet = day; noteWord(f, w.a); return { en: `💧 ${an.name} had a drink!`, ja: `💧 ${an.name}は みずを のんだ！` }; },
        });
      }
      if (a.got === day) throw new FarmError('already collected');
      if (a.fed !== day) throw new FarmError('hungry');
      if (a.wet !== day) throw new FarmError('thirsty');
      const product = FARM.products.get(kind.product);
      const pool = ['egg', 'milk', 'wool', 'bread', 'juice', 'rice', 'cake', 'water'];
      return choiceQ('collect', 'word', `${kind.emoji}➜${product.emoji}`, { en: `${kind.emoji} ➜ ${product.emoji} What is this?`, ja: `${kind.ja}から もらえる もの。えいごで なに？` }, product.en, others(pool, product.en), {
        effect: (f) => { const an = f.animals[i]; an.got = day; f.items[product.id] = (f.items[product.id] || 0) + 1; noteWord(f, product.en); return { en: `You got ${MASS.has(product.id) ? 'some' : article(product.en)} ${product.en}! ${product.emoji}`, ja: `${product.ja}を もらった！ ${product.emoji}` }; },
      });
    }
    case 'ship': {
      const item = FARM.items.get(str(p.item));
      if (!item) throw new FarmError('no such item');
      const have = farm.items[item.id] || 0;
      if (!have) throw new FarmError('nothing to ship');
      const qty = Math.max(1, Math.min(have, Math.floor(num(p.qty, have))));
      const value = valueOf(farm, item, qty, now);
      return spellQ('ship', item, item.emoji, {
        qty, value,
        effect: (f) => { f.items[item.id] -= qty; if (!f.items[item.id]) delete f.items[item.id]; f.shipped += qty; noteWord(f, item.en); return { award: value, id: `farm:ship:${item.id}`, en: `📦 Shipped! ${item.emoji} ×${qty}`, ja: `📦 ${item.ja}を ${qty}こ しゅっか した！` }; },
      });
    }
    case 'cook': {
      // What goes in it? One of the ingredients, among things that do not.
      const r = FARM.recipes.get(str(p.recipe));
      if (!r) throw new FarmError('no such recipe');
      if (!unlocked(farm, 'kitchen', r.hearts)) throw new FarmError('locked');
      for (const [id, n] of Object.entries(r.needs)) if ((farm.items[id] || 0) < n) throw new FarmError('missing ingredients');
      const ing = FARM.items.get(pick(Object.keys(r.needs)));
      const pool = [...FARM.items.values()].filter((it) => it.kind !== 'dish' && !(it.id in r.needs)).map((it) => it.en);
      return choiceQ('cook', 'word', r.emoji, { en: `${r.emoji} ${cap(r.en)}: what do we need?`, ja: `${r.ja}には なにが いる？` }, ing.en, others(pool, ing.en), {
        effect: (f) => { for (const [id, n] of Object.entries(r.needs)) { f.items[id] -= n; if (!f.items[id]) delete f.items[id]; } f.items[r.id] = (f.items[r.id] || 0) + 1; noteWord(f, ing.en); return { en: `Yummy! You made ${article(r.en)} ${r.en}! ${r.emoji}`, ja: `${r.ja}が できた！ ${r.emoji}` }; },
      });
    }
    case 'talk': {
      if (!FARM.spotById.has(spot)) throw new FarmError('no such spot');
      if (farm.talked[spot] === day) throw new FarmError('already talked');
      // On their birthday the villager says so, and the right reply is worth two hearts.
      const bday = isBirthday(spot, now);
      const line = bday ? BANK.birthday : pick(BANK.talk.filter((x) => x.spot === spot || x.spot === 'any'));
      const who = FARM.spotById.get(spot).character;
      const gain = bday ? 2 : 1;
      return choiceQ('talk', 'reply', bday ? '🎂' : '💬', { en: `${who}: "${line.says}"`, ja: `${who}「${line.ja}」` }, line.a, line.d, {
        spot,
        effect: (f) => { f.talked[spot] = day; f.hearts[spot] = Math.min(10, (f.hearts[spot] || 0) + gain); return { en: `${who} smiles. ${'❤'.repeat(gain)} ${f.hearts[spot]}`, ja: `${who}が にっこり。${'❤'.repeat(gain)} ${f.hearts[spot]}` }; },
      });
    }
    case 'event': {
      // The festival: the host's question, once a year each. Two hearts with the host, one
      // with everyone else who came, and the festival's prize in coins (outside the day's cap).
      const ev = eventAt(now);
      if (!ev) throw new FarmError('no festival');
      if (ev.host !== spot) throw new FarmError('wrong house');
      const year = calendarOf(now).year;
      if (farm.events[ev.id] === year) throw new FarmError('already joined');
      const line = pick(BANK.festival[ev.id]);
      const who = FARM.spotById.get(spot).character;
      return choiceQ('event', 'reply', ev.emoji, { en: `${who}: "${line.says}"`, ja: `${who}「${line.ja}」` }, line.a, line.d, {
        spot,
        effect: (f) => {
          f.events[ev.id] = year;
          for (const sp of FARM.spotById.keys()) f.hearts[sp] = Math.min(10, (f.hearts[sp] || 0) + (sp === spot ? 2 : 1));
          noteWord(f, line.a);
          return { prize: ev.bonus, id: `farm:festival:${ev.id}`, en: `${ev.emoji} ${ev.en}! Everyone is happy. ❤❤ +${ev.bonus} ◈`, ja: `${ev.emoji} ${ev.ja}！ みんな よろこんだ。❤❤ +${ev.bonus} ◈` };
        },
      });
    }
    case 'gift': {
      // "This is for you." — four cards, the same every time, and the gift is the picture.
      if (!FARM.spotById.has(spot)) throw new FarmError('no such spot');
      if (farm.gifted[spot] === day) throw new FarmError('already gifted');
      const item = FARM.items.get(str(p.item));
      if (!item || !(farm.items[item.id] > 0)) throw new FarmError('nothing to give');
      const who = FARM.spotById.get(spot).character;
      // What a gift is worth in hearts: a loved thing two, a plain one one, a disliked one
      // takes one away (the card says what each villager likes); what the festival wants,
      // given to its host on the day, three; and on a birthday everything good counts double.
      const loved = (FARM.likes[spot] || []).includes(item.id);
      const hated = (FARM.dislikes[spot] || []).includes(item.id);
      const ev = eventAt(now);
      const festive = !!ev && ev.host === spot && ev.wants.includes(item.id);
      const bday = isBirthday(spot, now);
      let gain = hated ? -1 : festive ? 3 : loved ? 2 : 1;
      if (bday && gain > 0) gain *= 2;
      const hearts = (n) => (n > 0 ? '❤'.repeat(n) : '💔');
      const said = hated ? { en: `${who}: "Oh... thank you." 💔`, ja: `${who}「うーん… ありがとう。」💔` }
        : festive ? { en: `${who}: "Perfect for the ${ev.en}!" ${hearts(gain)}`, ja: `${who}「${ev.ja}に ぴったり！」${hearts(gain)}` }
          : bday ? { en: `${who}: "A birthday present? Thank you!" ${hearts(gain)}`, ja: `${who}「たんじょうびの プレゼント？ ありがとう！」${hearts(gain)}` }
            : loved ? { en: `${who}: "I love it! Thank you!" ❤❤`, ja: `${who}「だいすき！ ありがとう！」❤❤` } : { en: `${who}: "Thank you!" ❤`, ja: `${who}「ありがとう！」❤` };
      const s = sentenceFor('gift', {});
      return orderQ('gift', s.en, `${who}に ${item.ja}を あげよう。${s.ja}`, `🎁${item.emoji}`, {
        spot,
        effect: (f) => { f.items[item.id] -= 1; if (!f.items[item.id]) delete f.items[item.id]; f.gifted[spot] = day; f.hearts[spot] = Math.max(0, Math.min(10, (f.hearts[spot] || 0) + gain)); return said; },
      });
    }
    default:
      throw new FarmError('unknown action');
  }
}

// What a shipment pays: the item's price, times the quantity, lifted by hearts in the
// barn for what the animals gave — 牧場物語's egg that goes 50 → 80 → 150 with care.
// On festival days what the festival wants ships for half as much again.
export function valueOf(farm, item, qty, now = Date.now()) {
  let unit = item.sell;
  if (item.kind === 'product') {
    const best = Math.max(0, ...farm.animals.filter((a) => FARM.animals.get(a.kind).product === item.id).map((a) => a.hearts));
    unit = Math.round(unit * (1 + Math.min(10, best) * 0.15));
  }
  const ev = eventAt(now);
  if (ev && ev.wants.includes(item.id)) unit = Math.round(unit * 1.5);
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
  return { shipped: farm.shipped, earned: farm.earned, words: farm.dex.length, animals: farm.animals.length, hearts: Object.values(farm.hearts).reduce((a, b) => a + b, 0), festivals: Object.keys(farm.events).length };
}
