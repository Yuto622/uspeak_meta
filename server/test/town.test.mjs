// まちづくり島: what a child owns, what they have built, and everything a saved room
// could claim that is not true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TOWN, TOWN_ISLAND, BLOCKS, ROOMS, STARTER_BLOCKS, loadTown, DATA_PATH, roomOfTier, nextRoom,
  sanitizeBlocks, sanitizeRoom, roomPayload, place, remove, TownError,
} from '../src/game/town.js';

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'town-'));
const write = (data) => { const f = join(dir, 't.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const clone = () => JSON.parse(JSON.stringify(raw));
const fresh = () => ({ tier: 1, blocks: [] });

test('a child can build on their first visit, with no coins at all', () => {
  assert.deepEqual(STARTER_BLOCKS, ['wood']);
  assert.deepEqual(sanitizeBlocks([]), ['wood'], "the free kind is everyone's");
  assert.deepEqual(sanitizeBlocks(['stone', 'stone', 'gold', 5]), ['wood', 'stone']);
  assert.equal(ROOMS[0].price, 0, 'and the first room is free');
  // Every kind carries an English word, because buying one is how it is learned.
  for (const b of BLOCKS.values()) { assert.ok(b.word.trim()); assert.ok(b.ja.trim()); }
});

test('rooms grow, and there is always somewhere to move to next', () => {
  assert.deepEqual(ROOMS.map((r) => r.tier), [1, 2, 3]);
  for (let i = 1; i < ROOMS.length; i += 1) {
    assert.ok(ROOMS[i].grid > ROOMS[i - 1].grid);
    assert.ok(ROOMS[i].cap > ROOMS[i - 1].cap);
    assert.ok(ROOMS[i].price > ROOMS[i - 1].price);
  }
  assert.equal(nextRoom(1).tier, 2);
  assert.equal(nextRoom(ROOMS.length), null, 'the biggest is the biggest');
  assert.equal(roomOfTier(99).tier, 1, 'a nonsense tier is the room you start in');
});

test('a block rests on the floor or on another block', () => {
  const owned = sanitizeBlocks([]);
  const state = fresh();
  assert.deepEqual(place(state, owned, { x: 0, y: 0, z: 0, b: 'wood' }), { x: 0, y: 0, z: 0, b: 'wood' });
  assert.throws(() => place(state, owned, { x: 0, y: 2, z: 0, b: 'wood' }), /nothing underneath/);
  place(state, owned, { x: 0, y: 1, z: 0, b: 'wood' });
  assert.equal(state.blocks.length, 2);
  // And a stack cannot be pulled out from underneath.
  assert.throws(() => remove(state, { x: 0, y: 0, z: 0 }), /something is on top/);
  assert.deepEqual(remove(state, { x: 0, y: 1, z: 0 }), { x: 0, y: 1, z: 0, b: 'wood' });
  assert.deepEqual(remove(state, { x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0, b: 'wood' });
  assert.throws(() => remove(state, { x: 0, y: 0, z: 0 }), /nothing there/);
});

test('the room is the room: nothing is built outside it, or through itself', () => {
  const owned = sanitizeBlocks(['stone']);
  const state = fresh();
  const half = ROOMS[0].grid / 2;
  assert.throws(() => place(state, owned, { x: half, y: 0, z: 0, b: 'wood' }), /outside the room/);
  assert.throws(() => place(state, owned, { x: 0, y: ROOMS[0].height, z: 0, b: 'wood' }), /outside the room/);
  assert.throws(() => place(state, owned, { x: 0, y: -1, z: 0, b: 'wood' }), /outside the room/);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: 0, b: 'gold' }), /no such block/);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: 0, b: 'water' }), /not bought/);
  assert.throws(() => place(state, owned, { x: 'over', y: 0, z: 'there', b: 'wood' }), /nowhere/);
  place(state, owned, { x: 1, y: 0, z: 1, b: 'stone' });
  assert.throws(() => place(state, owned, { x: 1, y: 0, z: 1, b: 'wood' }), /something is there/);
  // Fractions are floored rather than trusted, so 0.5 is not a cell of its own.
  place(state, owned, { x: 2.9, y: 0, z: 1.2, b: 'wood' });
  assert.ok(state.blocks.some((c) => c.x === 2 && c.z === 1));
});

test('a room fills up, and its capacity is the room it is in', () => {
  const owned = sanitizeBlocks([]);
  const state = fresh();
  const room = ROOMS[0];
  const half = room.grid / 2;
  let placed = 0;
  for (let x = -half + 1; x < half && placed < room.cap; x += 1) {
    for (let z = -half + 1; z < half && placed < room.cap; z += 1) {
      for (let y = 0; y < room.height && placed < room.cap; y += 1) {
        place(state, owned, { x, y, z, b: 'wood' });
        placed += 1;
      }
    }
  }
  assert.equal(state.blocks.length, room.cap);
  assert.throws(() => place(state, owned, { x: 0, y: 0, z: -half + 1, b: 'wood' }), /room is full|something is there/);
  // Moving up a tier keeps what was built and gives more room around it.
  state.tier = 2;
  const payload = roomPayload(state, owned);
  assert.equal(payload.grid, ROOMS[1].grid);
  assert.equal(payload.blocks.length, room.cap, 'what was built stays built');
  assert.equal(payload.next.tier, 3);
});

test('a saved room is not trusted: only what can be checked is restored', () => {
  const owned = sanitizeBlocks(['stone']);
  const restored = sanitizeRoom({
    tier: 2,
    blocks: [
      { x: 0, y: 0, z: 0, b: 'wood' },
      { x: 0, y: 0, z: 0, b: 'stone' },      // the same cell twice
      { x: 99, y: 0, z: 0, b: 'wood' },      // outside
      { x: 1, y: 99, z: 0, b: 'wood' },      // above the ceiling
      { x: 2, y: 0, z: 0, b: 'water' },      // never bought
      { x: 3, y: 0, z: 0, b: 'nonsense' },   // never existed
      { x: 4, y: 0, z: 0, b: 'stone' },
    ],
  }, owned);
  assert.equal(restored.tier, 2);
  assert.deepEqual(restored.blocks, [{ x: 0, y: 0, z: 0, b: 'wood' }, { x: 4, y: 0, z: 0, b: 'stone' }]);
  assert.deepEqual(sanitizeRoom(null, owned), { tier: 1, blocks: [] });
  assert.deepEqual(sanitizeRoom({ tier: 'huge', blocks: 'lots' }, owned), { tier: 1, blocks: [] });
  // A saved room from a bigger house is cut down to the room it says it is in.
  const shrunk = sanitizeRoom({ tier: 1, blocks: [{ x: 5, y: 0, z: 0, b: 'wood' }] }, owned);
  assert.deepEqual(shrunk.blocks, [], 'tier 1 is eight wide, so x=5 is in the garden');
});

test('broken town data is refused rather than half-loaded', () => {
  assert.equal(loadTown(write(clone())).blockIds.length, 10);
  const noDoor = clone();
  noDoor.island.spots = noDoor.island.spots.filter((s) => s.kind !== 'door');
  assert.throws(() => loadTown(write(noDoor)), /no door/);
  const noFree = clone();
  noFree.blocks[0].price = 50;
  assert.throws(() => loadTown(write(noFree)), /no block a child starts with/);
  const paidStart = clone();
  paidStart.rooms[0].price = 200;
  assert.throws(() => loadTown(write(paidStart)), /so it is free/);
  const shrinking = clone();
  shrinking.rooms[2].grid = 6;
  assert.throws(() => loadTown(write(shrinking)), /not bigger/);
  const odd = clone();
  odd.rooms[0].grid = 7;
  assert.throws(() => loadTown(write(odd)), /even grid/);
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
  assert.deepEqual(spots.map((s) => s.kind).sort(), ['agent', 'door', 'shop']);
  for (const s of spots) assert.ok(Math.abs(s.x) <= 30 && Math.abs(s.z) <= 25, `${s.id} is off the island`);
  assert.equal(TOWN.blockIds.length, BLOCKS.size);
});
