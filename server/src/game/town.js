// まちづくり島 — a block shop, a furniture shop, an estate agent, a room of your own,
// and the plaza the blocks are built on.
//
// Ported from Roblox's BuildManager and HousingService. The part of the Roblox design
// worth keeping exactly is the instancing: only the doorways stand in the town, and what
// is behind one is built when a child walks in. Nothing about a room or a lot costs
// anything until someone is standing in it, so a school of six hundred children costs
// the same as a class of twenty-five.
//
// Two places, two things to put down. Blocks are stacked on the 広場 — a lot of your own,
// walked into like anywhere else — and furniture bought at the かぐ屋 stands in マイルーム.
// Both are bought by kind, once, exactly as Roblox's USpeakOwnedBlocks did: what has to
// be stored per child is a short list of kinds and a list of where things are. Every
// cell is checked here — inside, on the grid, a kind that was bought, within capacity.
import { readFileSync } from 'node:fs';

export class TownError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/town.json', import.meta.url);
const HALF_X = 30;
const HALF_Z = 25;
const SPOT_KINDS = ['shop', 'agent', 'furniture', 'door', 'plaza'];

export function loadTown(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const island = raw.island;
  if (!island) throw new Error('town.json: no island block');
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(island[key])) throw new Error(`town.json: island is missing a numeric ${key}`);
  }
  const spotById = new Map();
  for (const spot of island.spots || []) {
    if (!SPOT_KINDS.includes(spot.kind)) throw new Error(`town.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (spotById.has(spot.kind)) throw new Error(`town.json: two ${spot.kind} buildings`);
    if (Math.abs(spot.x) > HALF_X || Math.abs(spot.z) > HALF_Z) throw new Error(`town.json: ${spot.id} is off the island`);
    for (const other of spotById.values()) {
      if (Math.hypot(spot.x - other.x, spot.z - other.z) <= island.radius * 2) {
        throw new Error(`town.json: ${spot.id} and ${other.id} can be stood at together`);
      }
    }
    spotById.set(spot.kind, { ...spot, wx: island.x + spot.x, wz: island.z + spot.z });
  }
  for (const kind of SPOT_KINDS) {
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

  const props = new Map();
  let freeProps = 0;
  for (const f of raw.furniture || []) {
    if (!f.id || props.has(f.id)) throw new Error(`town.json: duplicate or missing furniture id "${f.id}"`);
    if (!f.word || !f.ja) throw new Error(`town.json: furniture ${f.id} carries no word`);
    if (!Number.isFinite(f.price) || f.price < 0) throw new Error(`town.json: furniture ${f.id} has no price`);
    if (!(f.w >= 1) || !(f.d >= 1) || f.w % 1 || f.d % 1) throw new Error(`town.json: furniture ${f.id} has no whole footprint`);
    if (f.price === 0) freeProps += 1;
    props.set(f.id, { ...f });
  }
  if (props.size < 4) throw new Error('town.json: a furniture shop of three things is not a shop');
  // The same promise the block shop makes: something to put down on the first visit.
  if (freeProps < 1) throw new Error('town.json: no furniture a child starts with');

  const plaza = raw.plaza || null;
  if (!plaza) throw new Error('town.json: no plaza');
  if (!(plaza.grid >= 4) || plaza.grid % 2) throw new Error('town.json: the plaza needs an even grid');
  if (!(plaza.height >= 2) || !(plaza.cap > 0)) throw new Error('town.json: the plaza is not a place to build');

  const rooms = [];
  let tier = 0;
  for (const r of raw.rooms || []) {
    if (r.tier !== tier + 1) throw new Error(`town.json: room ${r.id} is tier ${r.tier}, expected ${tier + 1}`);
    if (!(r.grid >= 4) || r.grid % 2) throw new Error(`town.json: room ${r.id} needs an even grid`);
    if (!(r.height >= 2) || !(r.cap > 0) || !(r.level >= 1)) throw new Error(`town.json: room ${r.id} is not a room`);
    if (!(r.props > 0)) throw new Error(`town.json: room ${r.id} holds no furniture`);
    if (tier && (r.grid <= rooms[tier - 1].grid || r.props <= rooms[tier - 1].props || r.price <= rooms[tier - 1].price)) {
      throw new Error(`town.json: room ${r.id} is not bigger than the one below it`);
    }
    tier = r.tier;
    rooms.push({ ...r });
  }
  if (rooms.length < 2) throw new Error('town.json: there is nowhere to move to');
  if (rooms[0].price !== 0) throw new Error('town.json: the first room is where a child starts, so it is free');

  return {
    island: { ...island, spotById },
    blocks, blockIds: [...blocks.keys()], props, propIds: [...props.keys()], plaza: { ...plaza }, rooms,
    starters: [...blocks.values()].filter((b) => b.price === 0).map((b) => b.id),
    propStarters: [...props.values()].filter((f) => f.price === 0).map((f) => f.id),
  };
}

export const TOWN = loadTown();
export const TOWN_ISLAND = TOWN.island;
export const BLOCKS = TOWN.blocks;
export const PROPS = TOWN.props;
export const PLAZA = TOWN.plaza;
export const ROOMS = TOWN.rooms;
export const STARTER_BLOCKS = TOWN.starters;
export const STARTER_PROPS = TOWN.propStarters;

export const roomOfTier = (tier) => ROOMS.find((r) => r.tier === tier) || ROOMS[0];
export const nextRoom = (tier) => ROOMS.find((r) => r.tier === tier + 1) || null;

export const blockPayload = (b, owned) => ({ id: b.id, word: b.word, ja: b.ja, price: b.price, color: b.color, owned });
export const propPayload = (f, owned) => ({
  id: f.id, word: f.word, ja: f.ja, price: f.price, color: f.color, w: f.w, d: f.d, h: f.h, shape: f.shape, owned,
});

// ---- what a child owns and has built -----------------------------------------------

const ownedList = (raw, catalogue, starters) => {
  const owned = [...starters];             // the free kinds are everyone's from the start
  for (const id of Array.isArray(raw) ? raw : []) {
    if (typeof id === 'string' && catalogue.has(id) && !owned.includes(id)) owned.push(id);
  }
  return owned;
};

export const sanitizeBlocks = (raw) => ownedList(raw, BLOCKS, STARTER_BLOCKS);
export const sanitizeProps = (raw) => ownedList(raw, PROPS, STARTER_PROPS);

export const cellKey = (x, y, z) => `${x},${y},${z}`;

// ---- the plaza: blocks ---------------------------------------------------------------

// A saved lot is only as good as it can be checked: anything off the grid, above the
// ceiling, of a kind that is not owned, or past the capacity is simply not restored.
export function sanitizePlaza(raw, owned) {
  const half = PLAZA.grid / 2;
  const blocks = [];
  const seen = new Set();
  // A save from before the plaza existed kept its blocks in the room. They were built by
  // a child, so they move to the lot rather than vanishing.
  const list = Array.isArray(raw?.blocks) ? raw.blocks : Array.isArray(raw?.plaza?.blocks) ? raw.plaza.blocks : [];
  for (const cell of list) {
    const x = Math.floor(Number(cell?.x));
    const y = Math.floor(Number(cell?.y));
    const z = Math.floor(Number(cell?.z));
    const b = String(cell?.b || '');
    if (![x, y, z].every(Number.isFinite)) continue;
    if (Math.abs(x) >= half || Math.abs(z) >= half || y < 0 || y >= PLAZA.height) continue;
    if (!BLOCKS.has(b) || !owned.includes(b)) continue;
    const key = cellKey(x, y, z);
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ x, y, z, b });
    if (blocks.length >= PLAZA.cap) break;
  }
  return { blocks };
}

export function plazaPayload(state, owned) {
  return {
    name: 'ひろば', en: 'BUILD PLAZA', grid: PLAZA.grid, height: PLAZA.height, cap: PLAZA.cap,
    blocks: state.blocks.map((c) => ({ ...c })),
    owned: [...owned],
  };
}

// Placing one block. Everything a client could get wrong is a named refusal, because
// each one is something the page should be able to explain to a child.
export function place(state, owned, cell) {
  const half = PLAZA.grid / 2;
  const x = Math.floor(Number(cell?.x));
  const y = Math.floor(Number(cell?.y));
  const z = Math.floor(Number(cell?.z));
  const b = String(cell?.b || '');
  if (![x, y, z].every(Number.isFinite)) throw new TownError('nowhere');
  if (Math.abs(x) >= half || Math.abs(z) >= half || y < 0 || y >= PLAZA.height) throw new TownError('outside the plaza');
  if (!BLOCKS.has(b)) throw new TownError('no such block');
  if (!owned.includes(b)) throw new TownError('not bought');
  if (state.blocks.length >= PLAZA.cap) throw new TownError('plaza is full');
  const key = cellKey(x, y, z);
  if (state.blocks.some((c) => cellKey(c.x, c.y, c.z) === key)) throw new TownError('something is there');
  // Minecraft's own rule, because that is the game these children already know: a block
  // goes against a surface. The ground is a surface, and so is any face of a block that
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

// ---- the room: furniture --------------------------------------------------------------

// Furniture stands on the floor and takes up a rectangle of it. A quarter turn swaps the
// two sides, which is the whole of what rotation means here.
export function footprint(item, rot) {
  const r = ((Math.floor(Number(rot)) % 4) + 4) % 4;
  return { r, w: r % 2 ? item.d : item.w, d: r % 2 ? item.w : item.d };
}

// Which floor cells a piece covers, anchored at its near corner.
export function propCells(prop) {
  const item = PROPS.get(prop.f);
  if (!item) return [];
  const { w, d } = footprint(item, prop.r);
  const cells = [];
  for (let x = 0; x < w; x += 1) for (let z = 0; z < d; z += 1) cells.push({ x: prop.x + x, z: prop.z + z });
  return cells;
}

const overlaps = (a, b) => propCells(a).some((c) => propCells(b).some((o) => o.x === c.x && o.z === c.z));

export function sanitizeRoom(raw, owned) {
  const tierIn = Number(raw?.tier);
  const room = roomOfTier(Number.isFinite(tierIn) ? Math.floor(tierIn) : 1);
  const half = room.grid / 2;
  const furniture = [];
  for (const item of Array.isArray(raw?.furniture) ? raw.furniture : []) {
    const f = String(item?.f || '');
    const x = Math.floor(Number(item?.x));
    const z = Math.floor(Number(item?.z));
    if (!PROPS.has(f) || !owned.includes(f)) continue;
    if (![x, z].every(Number.isFinite)) continue;
    const { r, w, d } = footprint(PROPS.get(f), item?.r);
    if (x < -half || z < -half || x + w > half || z + d > half) continue;
    const prop = { f, x, z, r };
    if (furniture.some((other) => overlaps(other, prop))) continue;
    furniture.push(prop);
    if (furniture.length >= room.props) break;
  }
  return { tier: room.tier, furniture };
}

export function roomPayload(state, owned) {
  const room = roomOfTier(state.tier);
  return {
    tier: room.tier, name: room.name, en: room.en, grid: room.grid, height: room.height, cap: room.props,
    furniture: state.furniture.map((p) => ({ ...p })),
    owned: [...owned],
    next: nextRoom(room.tier),
  };
}

export function placeProp(state, owned, msg) {
  const room = roomOfTier(state.tier);
  const half = room.grid / 2;
  const f = String(msg?.f || '');
  const x = Math.floor(Number(msg?.x));
  const z = Math.floor(Number(msg?.z));
  if (![x, z].every(Number.isFinite)) throw new TownError('nowhere');
  if (!PROPS.has(f)) throw new TownError('no such furniture');
  if (!owned.includes(f)) throw new TownError('not bought');
  if (state.furniture.length >= room.props) throw new TownError('room is full');
  const { r, w, d } = footprint(PROPS.get(f), msg?.r);
  if (x < -half || z < -half || x + w > half || z + d > half) throw new TownError('outside the room');
  const prop = { f, x, z, r };
  if (state.furniture.some((other) => overlaps(other, prop))) throw new TownError('something is there');
  state.furniture.push(prop);
  return prop;
}

// Furniture is taken away by pointing at any square of it, not at the corner it happens
// to be anchored on: a child aims at the sofa, not at the sofa's origin.
export function removeProp(state, msg) {
  const x = Math.floor(Number(msg?.x));
  const z = Math.floor(Number(msg?.z));
  const at = state.furniture.findIndex((p) => propCells(p).some((c) => c.x === x && c.z === z));
  if (at < 0) throw new TownError('nothing there');
  const [gone] = state.furniture.splice(at, 1);
  return gone;
}
