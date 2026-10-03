// 土地島 — the island a child owns, bought in six steps with coins alone.
//
// What this file decides: which tier a child is on, what the next one costs, and that
// nothing but coins and order gates it (no level: the user asked for coins only). The page
// reads the same land.json and draws the same six cards; it never knows a price this file
// did not read from that file. Why six, and why these prices, is docs/uspeak-land-research.md.
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
  tiers.forEach((t, i) => {
    need(t.id && t.name && t.en && t.theme && Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.grid) && t.grid >= 8, `tier ${i + 1}`);
    need(t.tier === i + 1, `tiers are numbered in order (${t.id})`);
    // Each island costs more and is bigger than the last: the ladder only goes up.
    if (i) need(t.price > tiers[i - 1].price && t.grid >= tiers[i - 1].grid, `tier ${t.tier} is not above tier ${t.tier - 1}`);
  });
  const ids = new Set(tiers.map((t) => t.id));
  need(ids.size === tiers.length, 'tier ids are unique');
  return { id: island.id, island, spotById, tiers };
}

export const LAND = loadLand();
export const LAND_ISLAND = LAND.island;
export const TIERS = LAND.tiers;

export const tierOf = (n) => TIERS.find((t) => t.tier === n) || null;
export const nextTier = (n) => TIERS.find((t) => t.tier === n + 1) || null;

// What a saved record may claim: a tier that exists, or none (0). Anything else is none.
export function sanitizeLand(raw) {
  const t = Math.floor(num(raw?.tier, 0));
  return { tier: t >= 1 && tierOf(t) ? t : 0 };
}

// The tier as the page sees it. The price of the next island travels with it, so the
// office can show a button that says exactly what the room will charge.
const tierPayload = (t) => (t ? { tier: t.tier, id: t.id, name: t.name, en: t.en, price: t.price, grid: t.grid, theme: t.theme, emoji: t.emoji, ja: t.ja, blurb: t.blurb } : null);
export function landPayload(state) {
  const cur = tierOf(state.tier);
  const next = nextTier(state.tier);
  return { tier: state.tier, island: tierPayload(cur), next: tierPayload(next), tiers: TIERS.map(tierPayload) };
}

// Buying the next island. Order is the rule (no skipping, no going back), coins the only
// other check. Returns what to charge; the caller moves the coins and then the tier.
export function priceOfNext(state, coins) {
  const next = nextTier(state.tier);
  if (!next) throw new LandError('biggest already');
  if (coins < next.price) throw new LandError('not enough coins');
  return next;
}
