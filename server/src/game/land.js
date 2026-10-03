// 土地島 — the island a child owns, bought in six steps with coins alone.
//
// What this file decides: which step a child is on, which look they chose at that step,
// what the next step costs, and that nothing but coins and order gates it (no level: the
// user asked for coins only). Each step offers a few looks — different worlds at one price
// — and swapping to another look of the same step costs a fraction (`restyle`). The page
// reads the same land.json and draws the same cards; it never knows a price this file did
// not read from that file. Why six, and why these prices: docs/uspeak-land-research.md.
//
// The island itself is cosmetic. It changes no answer, no reward and no record — it is a
// place to walk around in and show, which is the whole of what it is for.
import { readFileSync } from 'node:fs';

export class LandError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/land.json', import.meta.url);

const need = (ok, msg) => { if (!ok) throw new Error(`land.json: ${msg}`); };
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

export function loadLand(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const island = raw.island;
  need(island && island.id === 'land' && Array.isArray(island.spots) && island.spots.length >= 3, 'island block');
  need(Number.isFinite(island.x) && Number.isFinite(island.z) && Number.isFinite(island.radius), 'island x/z/radius');
  const spotById = new Map();
  for (const sp of island.spots) {
    need(sp.id && sp.kind && sp.name && Number.isFinite(sp.x) && Number.isFinite(sp.z) && sp.path, `spot ${sp.id}`);
    need(!spotById.has(sp.id), `duplicate spot ${sp.id}`);
    sp.wx = island.x + sp.x;
    sp.wz = island.z + sp.z;
    spotById.set(sp.id, sp);
    for (const other of island.spots) if (other !== sp) need(Math.hypot(sp.x - other.x, sp.z - other.z) > 10, `${sp.id} and ${other.id} overlap`);
  }
  for (const kind of ['office', 'ferry', 'board']) need(island.spots.some((s) => s.kind === kind), `a ${kind} spot`);
  const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  need(tiers.length >= 2, 'at least two tiers');
  const lookById = new Map();
  tiers.forEach((t, i) => {
    need(t.id && t.name && t.en && Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.grid) && t.grid >= 8, `tier ${i + 1}`);
    need(t.tier === i + 1, `tiers are numbered in order (${t.id})`);
    // Each step costs more and is bigger than the last: the ladder only goes up.
    if (i) need(t.price > tiers[i - 1].price && t.grid >= tiers[i - 1].grid, `tier ${t.tier} is not above tier ${t.tier - 1}`);
    need(Array.isArray(t.looks) && t.looks.length >= 1, `tier ${t.tier} has no looks`);
    for (const look of t.looks) {
      need(look.id && look.theme && look.name && look.en && look.ja && look.blurb && look.emoji, `look ${look.id} of tier ${t.tier}`);
      need(!lookById.has(look.id), `look ids are unique (${look.id})`);
      look.tier = t.tier;
      lookById.set(look.id, look);
    }
  });
  const ids = new Set(tiers.map((t) => t.id));
  need(ids.size === tiers.length, 'tier ids are unique');
  need(new Set([...lookById.values()].map((l) => l.theme)).size === lookById.size, 'every look is a different world');
  const restyle = num(raw.restyle, 0.2);
  need(restyle > 0 && restyle < 1, 'restyle is a fraction of the price');
  return { id: island.id, island, spotById, tiers, lookById, restyle };
}

export const LAND = loadLand();
export const LAND_ISLAND = LAND.island;
export const TIERS = LAND.tiers;
export const LOOKS = LAND.lookById;

export const tierOf = (n) => TIERS.find((t) => t.tier === n) || null;
export const nextTier = (n) => TIERS.find((t) => t.tier === n + 1) || null;
export const lookOf = (id) => LOOKS.get(String(id || '')) || null;
export const restylePrice = (tier) => Math.max(1, Math.round(tier.price * LAND.restyle));

// What a saved record may claim: a step that exists and a look of that step, or none.
// A look that is not of the step (or an old save with none) becomes the step's first.
export function sanitizeLand(raw) {
  const t = Math.floor(num(raw?.tier, 0));
  const tier = t >= 1 ? tierOf(t) : null;
  if (!tier) return { tier: 0, look: '' };
  const look = lookOf(raw?.look);
  return { tier: tier.tier, look: look && look.tier === tier.tier ? look.id : tier.looks[0].id };
}

const lookPayload = (l) => (l ? { id: l.id, tier: l.tier, theme: l.theme, name: l.name, en: l.en, emoji: l.emoji, ja: l.ja, blurb: l.blurb } : null);
const tierPayload = (t) => (t ? { tier: t.tier, id: t.id, name: t.name, en: t.en, price: t.price, grid: t.grid, restyle: restylePrice(t), looks: t.looks.map(lookPayload) } : null);

// The step and look as the page sees them, with the price of the next step and of a
// change of look, so the office shows buttons that say exactly what the room will charge.
export function landPayload(state) {
  const cur = tierOf(state.tier);
  const next = nextTier(state.tier);
  return {
    tier: state.tier, look: state.look || '',
    island: lookPayload(lookOf(state.look)), step: tierPayload(cur), next: tierPayload(next),
    tiers: TIERS.map(tierPayload),
  };
}

// What the ferry hands the page to build: the step's size and the look's world.
export function islandPayload(state, owner) {
  const tier = tierOf(state.tier); const look = lookOf(state.look);
  if (!tier || !look) return null;
  return { tier: tier.tier, id: look.id, name: look.name, en: look.en, grid: tier.grid, theme: look.theme, emoji: look.emoji, owner };
}

// Buying the next step, in one of its looks. Order is the rule (no skipping, no going
// back), coins the only other check. Returns what to charge and what to become; the
// caller moves the coins and then the state.
export function priceOfNext(state, coins, lookId) {
  const next = nextTier(state.tier);
  if (!next) throw new LandError('biggest already');
  const look = lookId ? lookOf(lookId) : next.looks[0];
  if (!look || look.tier !== next.tier) throw new LandError('no such look');
  if (coins < next.price) throw new LandError('not enough coins');
  return { tier: next, look, price: next.price };
}

// Another look of the step already owned, for a fraction of its price.
export function priceOfRestyle(state, coins, lookId) {
  const tier = tierOf(state.tier);
  if (!tier) throw new LandError('no island');
  const look = lookOf(lookId);
  if (!look || look.tier !== tier.tier) throw new LandError('no such look');
  if (look.id === state.look) throw new LandError('same look');
  const price = restylePrice(tier);
  if (coins < price) throw new LandError('not enough coins');
  return { tier, look, price };
}
