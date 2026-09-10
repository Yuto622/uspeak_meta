// まちづくり島 — a block shop, an estate agent, and a room of your own.
//
// Ported from Roblox's BuildManager and HousingService. The part of the Roblox design
// worth keeping exactly is the instancing: only the door stands in the town, and the room
// is built when a child walks in. Nothing about a room costs anything until someone is
// inside it, so a school of six hundred children costs the same as a class of twenty-five.
//
// Blocks are bought by kind, once, exactly as Roblox's USpeakOwnedBlocks did — so what
// has to be stored per child is a short list of kinds and a list of cells, not a
// purchase history. Every cell is checked here: inside the room, on the grid, a kind
// that was bought, and within the room's capacity.
import { readFileSync } from 'node:fs';

export class TownError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/town.json', import.meta.url);
const HALF_X = 30;
const HALF_Z = 25;

export function loadTown(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const island = raw.island;
  if (!island) throw new Error('town.json: no island block');
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(island[key])) throw new Error(`town.json: island is missing a numeric ${key}`);
  }
  const spotById = new Map();
  for (const spot of island.spots || []) {
    if (!['shop', 'agent', 'door'].includes(spot.kind)) throw new Error(`town.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (spotById.has(spot.kind)) throw new Error(`town.json: two ${spot.kind} buildings`);
    if (Math.abs(spot.x) > HALF_X || Math.abs(spot.z) > HALF_Z) throw new Error(`town.json: ${spot.id} is off the island`);
    for (const other of spotById.values()) {
      if (Math.hypot(spot.x - other.x, spot.z - other.z) <= island.radius * 2) {
        throw new Error(`town.json: ${spot.id} and ${other.id} can be stood at together`);
      }
    }
    spotById.set(spot.kind, { ...spot, wx: island.x + spot.x, wz: island.z + spot.z });
  }
  for (const kind of ['shop', 'agent', 'door']) {
    if (!spotById.has(kind)) throw new Error(`town.json: the island has no ${kind}`);
  }

  const blocks = new Map();
  let free = 0;
  for (const b of raw.blocks || []) {
    if (!b.id || blocks.has(b.id)) throw new Error(`town.json: duplicate or missing block id "${b.id}"`);
    if (!b.word || !b.ja) throw new Error(`town.json: block ${b.id} carries no word`);
    if (!Number.isFinite(b.price) || b.price < 0) throw new Error(`town.json: block ${b.id} has no price`);
    if (b.price === 0) free += 1;
    blocks.set(b.id, { ...b });
  }
  if (blocks.size < 4) throw new Error('town.json: a shop of three blocks is not a shop');
  // A child with no coins must still be able to build something on their first visit.
  if (free < 1) throw new Error('town.json: no block a child starts with');

  const rooms = [];
  let tier = 0;
  for (const r of raw.rooms || []) {
    if (r.tier !== tier + 1) throw new Error(`town.json: room ${r.id} is tier ${r.tier}, expected ${tier + 1}`);
    if (!(r.grid >= 4) || r.grid % 2) throw new Error(`town.json: room ${r.id} needs an even grid`);
    if (!(r.height >= 2) || !(r.cap > 0) || !(r.level >= 1)) throw new Error(`town.json: room ${r.id} is not a room`);
    if (tier && (r.grid <= rooms[tier - 1].grid || r.cap <= rooms[tier - 1].cap || r.price <= rooms[tier - 1].price)) {
      throw new Error(`town.json: room ${r.id} is not bigger than the one below it`);
    }
    tier = r.tier;
    rooms.push({ ...r });
  }
  if (rooms.length < 2) throw new Error('town.json: there is nowhere to move to');
  if (rooms[0].price !== 0) throw new Error('town.json: the first room is where a child starts, so it is free');

  return { island: { ...island, spotById }, blocks, blockIds: [...blocks.keys()], rooms, starters: [...blocks.values()].filter((b) => b.price === 0).map((b) => b.id) };
}

export const TOWN = loadTown();
export const TOWN_ISLAND = TOWN.island;
export const BLOCKS = TOWN.blocks;
export const ROOMS = TOWN.rooms;
export const STARTER_BLOCKS = TOWN.starters;

export const roomOfTier = (tier) => ROOMS.find((r) => r.tier === tier) || ROOMS[0];
export const nextRoom = (tier) => ROOMS.find((r) => r.tier === tier + 1) || null;

export const blockPayload = (b, owned) => ({ id: b.id, word: b.word, ja: b.ja, price: b.price, color: b.color, owned });

// ---- what a child owns and has built -----------------------------------------------

export function sanitizeBlocks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const owned = [...STARTER_BLOCKS];    // the free kinds are everyone's from the start
  for (const id of list) {
    if (typeof id === 'string' && BLOCKS.has(id) && !owned.includes(id)) owned.push(id);
  }
  return owned;
}

export const cellKey = (x, y, z) => `${x},${y},${z}`;

// A saved room is only as good as it can be checked: anything off the grid, above the
// ceiling, of a kind that is not owned, or past the capacity is simply not restored.
export function sanitizeRoom(raw, owned) {
  const tierIn = Number(raw?.tier);
  const room = roomOfTier(Number.isFinite(tierIn) ? Math.floor(tierIn) : 1);
  const half = room.grid / 2;
  const blocks = [];
  const seen = new Set();
  for (const cell of Array.isArray(raw?.blocks) ? raw.blocks : []) {
    const x = Math.floor(Number(cell?.x));
    const y = Math.floor(Number(cell?.y));
    const z = Math.floor(Number(cell?.z));
    const b = String(cell?.b || '');
    if (![x, y, z].every(Number.isFinite)) continue;
    if (Math.abs(x) >= half || Math.abs(z) >= half || y < 0 || y >= room.height) continue;
    if (!BLOCKS.has(b) || !owned.includes(b)) continue;
    const key = cellKey(x, y, z);
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ x, y, z, b });
    if (blocks.length >= room.cap) break;
  }
  return { tier: room.tier, blocks };
}

export function roomPayload(state, owned) {
  const room = roomOfTier(state.tier);
  return {
    tier: room.tier, name: room.name, en: room.en, grid: room.grid, height: room.height, cap: room.cap,
    blocks: state.blocks.map((c) => ({ ...c })),
    owned: [...owned],
    next: nextRoom(room.tier),
  };
}

// Placing one block. Everything a client could get wrong is a named refusal, because
// each one is something the page should be able to explain to a child.
export function place(state, owned, cell) {
  const room = roomOfTier(state.tier);
  const half = room.grid / 2;
  const x = Math.floor(Number(cell?.x));
  const y = Math.floor(Number(cell?.y));
  const z = Math.floor(Number(cell?.z));
  const b = String(cell?.b || '');
  if (![x, y, z].every(Number.isFinite)) throw new TownError('nowhere');
  if (Math.abs(x) >= half || Math.abs(z) >= half || y < 0 || y >= room.height) throw new TownError('outside the room');
  if (!BLOCKS.has(b)) throw new TownError('no such block');
  if (!owned.includes(b)) throw new TownError('not bought');
  if (state.blocks.length >= room.cap) throw new TownError('room is full');
  const key = cellKey(x, y, z);
  if (state.blocks.some((c) => cellKey(c.x, c.y, c.z) === key)) throw new TownError('something is there');
  // Minecraft's own rule, because that is the game these children already know: a block
  // goes against a surface. The floor is a surface, and so is any face of a block that
  // is already there — so a wall can be built outwards, but nothing appears in mid-air.
  const touching = state.blocks.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) + Math.abs(c.z - z) === 1);
  if (y > 0 && !touching) throw new TownError('nothing to build on');
  const placed = { x, y, z, b };
  state.blocks.push(placed);
  return placed;
}

export function remove(state, cell) {
  const x = Math.floor(Number(cell?.x));
  const y = Math.floor(Number(cell?.y));
  const z = Math.floor(Number(cell?.z));
  const at = state.blocks.findIndex((c) => c.x === x && c.y === y && c.z === z);
  if (at < 0) throw new TownError('nothing there');
  // Anything can be dug out, including from under a stack. Blocks do not fall, exactly
  // as they do not in the game this is modelled on.
  const [gone] = state.blocks.splice(at, 1);
  return gone;
}
