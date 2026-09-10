// まちづくり島: what a child owns, what they have built and put in their room, and
// everything a saved room or lot could claim that is not true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TOWN, TOWN_ISLAND, BLOCKS, PROPS, PLAZA, ROOMS, STARTER_BLOCKS, STARTER_PROPS, loadTown, DATA_PATH,
  roomOfTier, nextRoom, sanitizeBlocks, sanitizeProps, sanitizeRoom, sanitizePlaza,
  roomPayload, plazaPayload, place, remove, placeProp, removeProp, propCells, TownError,
} from '../src/game/town.js';

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'town-'));
const write = (data) => { const f = join(dir, 't.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const clone = () => JSON.parse(JSON.stringify(raw));
const lot = () => ({ blocks: [] });
const room = () => ({ tier: 1, furniture: [] });

test('a child can build and furnish on their first visit, with no coins at all', () => {
  assert.deepEqual(STARTER_BLOCKS, ['wood']);
  assert.deepEqual(STARTER_PROPS, ['chair']);
  assert.deepEqual(sanitizeBlocks([]), ['wood'], "the free kind is everyone's");
  assert.deepEqual(sanitizeBlocks(['stone', 'stone', 'gold', 5]), ['wood', 'stone']);
  assert.deepEqual(sanitizeProps(['sofa', 'sofa', 'throne']), ['chair', 'sofa']);
  assert.equal(ROOMS[0].price, 0, 'and the first room is free');
  // Every kind carries an English word, because buying one is how it is learned.
  for (const b of BLOCKS.values()) { assert.ok(b.word.trim()); assert.ok(b.ja.trim()); }
  for (const f of PROPS.values()) { assert.ok(f.word.trim()); assert.ok(f.ja.trim()); }
});

test('rooms grow, and there is always somewhere to move to next', () => {
  assert.deepEqual(ROOMS.map((r) => r.tier), [1, 2, 3]);
  for (let i = 1; i < ROOMS.length; i += 1) {
    assert.ok(ROOMS[i].grid > ROOMS[i - 1].grid);
    assert.ok(ROOMS[i].props > ROOMS[i - 1].props);
    assert.ok(ROOMS[i].price > ROOMS[i - 1].price);
  }
  assert.equal(nextRoom(1).tier, 2);
  assert.equal(nextRoom(ROOMS.length), null, 'the biggest is the biggest');
  assert.equal(roomOfTier(99).tier, 1, 'a nonsense tier is the room you start in');
});

test('a block goes against a surface, and nothing appears in mid-air', () => {
  const owned = sanitizeBlocks([]);
  const state = lot();
  // The ground is a surface, so the first block always goes down.
  assert.deepEqual(place(state, owned, { x: 0, y: 0, z: 0, b: 'wood' }), { x: 0, y: 0, z: 0, b: 'wood' });
  assert.throws(() => place(state, owned, { x: 0, y: 2, z: 0, b: 'wood' }), /nothing to build on/);
  assert.throws(() => place(state, owned, { x: 3, y: 3, z: 3, b: 'wood' }), /nothing to build on/);
  // On top of one is a surface...
  place(state, owned, { x: 0, y: 1, z: 0, b: 'wood' });
  // ...and so is its side, which is how an arch or a roof gets built.
  place(state, owned, { x: 1, y: 1, z: 0, b: 'wood' });
  assert.equal(state.blocks.length, 3);
  // Anything can be dug out, including from underneath: blocks do not fall here either.
  assert.deepEqual(remove(state, { x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0, b: 'wood' });
  assert.equal(state.blocks.length, 2);
  assert.throws(() => remove(state, { x: 0, y: 0, z: 0 }), /nothing there/);
});

test('the lot is the lot: nothing is built outside it, or through itself', () => {
  const owned = sanitizeBlocks(['stone']);
  const state = lot();
  const half = PLAZA.grid / 2;
  assert.throws(() => place(state, owned, { x: half, y: 0, z: 0, b: 'wood' }), /outside the plaza/);
  assert.throws(() => place(state, owned, { x: 0, y: PLAZA.height, z: 0, b: 'wood' }), /outside the plaza/);
  assert.throws(() => place(state, owned, { x: 0, y: -1, z: 0, b: 'wood' }), /outside the plaza/);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: 0, b: 'gold' }), /no such block/);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: 0, b: 'water' }), /not bought/);
  assert.throws(() => place(state, owned, { x: 'over', y: 0, z: 'there', b: 'wood' }), /nowhere/);
  place(state, owned, { x: 1, y: 0, z: 1, b: 'stone' });
  assert.throws(() => place(state, owned, { x: 1, y: 0, z: 1, b: 'wood' }), /something is there/);
  // Fractions are floored rather than trusted, so 0.5 is not a cell of its own.
  place(state, owned, { x: 2.9, y: 0, z: 1.2, b: 'wood' });
  assert.ok(state.blocks.some((c) => c.x === 2 && c.z === 1));
});

test('a lot fills up, and a saved one is not trusted', () => {
  const owned = sanitizeBlocks([]);
  const state = lot();
  const half = PLAZA.grid / 2;
  let placed = 0;
  for (let x = -half + 1; x < half && placed < PLAZA.cap; x += 1) {
    for (let z = -half + 1; z < half && placed < PLAZA.cap; z += 1) {
      for (let y = 0; y < PLAZA.height && placed < PLAZA.cap; y += 1) {
        place(state, owned, { x, y, z, b: 'wood' });
        placed += 1;
      }
    }
  }
  assert.equal(state.blocks.length, PLAZA.cap);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: -half + 1, b: 'wood' }), /plaza is full|something is there/);
  assert.equal(plazaPayload(state, owned).blocks.length, PLAZA.cap);

  const restored = sanitizePlaza({
    plaza: {
      blocks: [
        { x: 0, y: 0, z: 0, b: 'wood' },
        { x: 0, y: 0, z: 0, b: 'stone' },      // the same cell twice
        { x: 99, y: 0, z: 0, b: 'wood' },      // outside
        { x: 1, y: 99, z: 0, b: 'wood' },      // above the ceiling
        { x: 2, y: 0, z: 0, b: 'water' },      // never bought
        { x: 3, y: 0, z: 0, b: 'nonsense' },   // never existed
        { x: 4, y: 0, z: 0, b: 'stone' },
      ],
    },
  }, sanitizeBlocks(['stone']));
  assert.deepEqual(restored.blocks, [{ x: 0, y: 0, z: 0, b: 'wood' }, { x: 4, y: 0, z: 0, b: 'stone' }]);
  assert.deepEqual(sanitizePlaza(null, owned), { blocks: [] });
  // Blocks used to be built in the room. A save from then keeps them, on the lot.
  const old = sanitizePlaza({ tier: 1, blocks: [{ x: 1, y: 0, z: 1, b: 'wood' }] }, owned);
  assert.deepEqual(old.blocks, [{ x: 1, y: 0, z: 1, b: 'wood' }], 'what a child built is not thrown away');
});

test('furniture stands on the floor, takes up its own squares, and turns', () => {
  const owned = sanitizeProps(['sofa', 'bed']);
  const state = room();
  const half = ROOMS[0].grid / 2;
  assert.deepEqual(placeProp(state, owned, { f: 'chair', x: 0, z: 0, r: 0 }), { f: 'chair', x: 0, z: 0, r: 0 });
  assert.throws(() => placeProp(state, owned, { f: 'chair', x: 0, z: 0, r: 2 }), /something is there/);
  // A sofa is three squares long, and a quarter turn makes it three deep instead.
  placeProp(state, owned, { f: 'sofa', x: -3, z: 2, r: 0 });
  assert.deepEqual(propCells({ f: 'sofa', x: -3, z: 2, r: 0 }).map((c) => c.x), [-3, -2, -1]);
  assert.deepEqual(propCells({ f: 'sofa', x: -3, z: 2, r: 1 }).map((c) => c.z), [2, 3, 4]);
  assert.throws(() => placeProp(state, owned, { f: 'sofa', x: -2, z: 2, r: 0 }), /something is there/);
  // The far side of the room is a wall, and a bed that would go through it does not.
  assert.throws(() => placeProp(state, owned, { f: 'bed', x: half - 1, z: 0, r: 0 }), /outside the room/);
  assert.throws(() => placeProp(state, owned, { f: 'chair', x: -half - 1, z: 0, r: 0 }), /outside the room/);
  assert.throws(() => placeProp(state, owned, { f: 'throne', x: 0, z: 2, r: 0 }), /no such furniture/);
  assert.throws(() => placeProp(state, owned, { f: 'piano', x: 0, z: 2, r: 0 }), /not bought/);
  assert.throws(() => placeProp(state, owned, { f: 'chair', x: 'here', z: 0, r: 0 }), /nowhere/);
  // Taking a piece away is done by pointing at any square of it, not at its corner.
  assert.deepEqual(removeProp(state, { x: -2, z: 2 }), { f: 'sofa', x: -3, z: 2, r: 0 });
  assert.throws(() => removeProp(state, { x: -2, z: 2 }), /nothing there/);
});

test('a room holds what a room holds, and moving house keeps it', () => {
  const owned = sanitizeProps([]);
  const state = room();
  const first = ROOMS[0];
  const half = first.grid / 2;
  for (let i = 0; i < first.props; i += 1) {
    placeProp(state, owned, { f: 'chair', x: -half + (i % first.grid), z: -half + Math.floor(i / first.grid), r: 0 });
  }
  assert.throws(() => placeProp(state, owned, { f: 'chair', x: 0, z: 3, r: 0 }), /room is full/);
  state.tier = 2;
  const payload = roomPayload(state, owned);
  assert.equal(payload.grid, ROOMS[1].grid);
  assert.equal(payload.cap, ROOMS[1].props);
  assert.equal(payload.furniture.length, first.props, 'what was put down stays put down');
  assert.equal(payload.next.tier, 3);
});

test('a saved room is not trusted: only what can be checked is restored', () => {
  const owned = sanitizeProps(['sofa']);
  const restored = sanitizeRoom({
    tier: 2,
    furniture: [
      { f: 'chair', x: 0, z: 0, r: 0 },
      { f: 'sofa', x: 0, z: 0, r: 0 },        // on top of the chair
      { f: 'chair', x: 99, z: 0, r: 0 },      // outside
      { f: 'piano', x: 2, z: 0, r: 0 },       // never bought
      { f: 'throne', x: 3, z: 0, r: 0 },      // never existed
      { f: 'sofa', x: 3, z: 3, r: 1 },
    ],
  }, owned);
  assert.equal(restored.tier, 2);
  assert.deepEqual(restored.furniture, [{ f: 'chair', x: 0, z: 0, r: 0 }, { f: 'sofa', x: 3, z: 3, r: 1 }]);
  assert.deepEqual(sanitizeRoom(null, owned), { tier: 1, furniture: [] });
  assert.deepEqual(sanitizeRoom({ tier: 'huge', furniture: 'lots' }, owned), { tier: 1, furniture: [] });
  // A saved room from a bigger house is cut down to the room it says it is in.
  const shrunk = sanitizeRoom({ tier: 1, furniture: [{ f: 'chair', x: 5, z: 0, r: 0 }] }, owned);
  assert.deepEqual(shrunk.furniture, [], 'tier 1 is eight wide, so x=5 is in the garden');
});

test('broken town data is refused rather than half-loaded', () => {
  assert.equal(loadTown(write(clone())).blockIds.length, 10);
  const noDoor = clone();
  noDoor.island.spots = noDoor.island.spots.filter((s) => s.kind !== 'door');
  assert.throws(() => loadTown(write(noDoor)), /no door/);
  const noPlaza = clone();
  noPlaza.island.spots = noPlaza.island.spots.filter((s) => s.kind !== 'plaza');
  assert.throws(() => loadTown(write(noPlaza)), /no plaza/);
  const noShop = clone();
  noShop.island.spots = noShop.island.spots.filter((s) => s.kind !== 'furniture');
  assert.throws(() => loadTown(write(noShop)), /no furniture/);
  const noFree = clone();
  noFree.blocks[0].price = 50;
  assert.throws(() => loadTown(write(noFree)), /no block a child starts with/);
  const noFreeProp = clone();
  noFreeProp.furniture[0].price = 50;
  assert.throws(() => loadTown(write(noFreeProp)), /no furniture a child starts with/);
  const shapeless = clone();
  shapeless.furniture[2].w = 0;
  assert.throws(() => loadTown(write(shapeless)), /whole footprint/);
  const paidStart = clone();
  paidStart.rooms[0].price = 200;
  assert.throws(() => loadTown(write(paidStart)), /so it is free/);
  const shrinking = clone();
  shrinking.rooms[2].grid = 6;
  assert.throws(() => loadTown(write(shrinking)), /not bigger/);
  const odd = clone();
  odd.rooms[0].grid = 7;
  assert.throws(() => loadTown(write(odd)), /even grid/);
  const oddLot = clone();
  oddLot.plaza.grid = 9;
  assert.throws(() => loadTown(write(oddLot)), /plaza needs an even grid/);
  const wordless = clone();
  wordless.blocks[3].ja = '';
  assert.throws(() => loadTown(write(wordless)), /carries no word/);
  const stacked = clone();
  stacked.island.spots[1].x = stacked.island.spots[0].x;
  stacked.island.spots[1].z = stacked.island.spots[0].z;
  assert.throws(() => loadTown(write(stacked)), /stood at together/);
});

test('the island is a place before it is a menu', () => {
  const spots = [...TOWN_ISLAND.spotById.values()];
  assert.deepEqual(spots.map((s) => s.kind).sort(), ['agent', 'door', 'furniture', 'plaza', 'shop']);
  for (const s of spots) assert.ok(Math.abs(s.x) <= 30 && Math.abs(s.z) <= 25, `${s.id} is off the island`);
  assert.equal(TOWN.blockIds.length, BLOCKS.size);
  assert.equal(TOWN.propIds.length, PROPS.size);
});
