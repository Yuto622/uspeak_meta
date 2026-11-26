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
  assert.deepEqual(STARTER_PROPS, ['chair', 'pc'], 'the chair, and the computer every room has');
  assert.deepEqual(sanitizeBlocks([]), ['wood'], "the free kind is everyone's");
  assert.deepEqual(sanitizeBlocks(['stone', 'stone', 'gold', 5]), ['wood', 'stone']);
  assert.deepEqual(sanitizeProps(['sofa', 'sofa', 'throne']), ['chair', 'pc', 'sofa']);
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
  for (const f of noFreeProp.furniture) if (f.price === 0) f.price = 50;
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

// ---- じぶんの いえ（メインの島）と はじめの かぐ ----

test('はじめの かぐ：からっぽの へやに 1 回だけ、いつもの 置きかたの きまりで', async () => {
  const { starterRoom, STARTER_ROOM, footprint } = await import('../src/game/town.js');
  assert.deepEqual(STARTER_ROOM.map((p) => p.f).sort(), ['bed', 'chair', 'pc', 'plant', 'rug', 'table']);
  // はじめての 子：保存が ない。
  const owned = sanitizeProps([]);
  const room = starterRoom(sanitizeRoom(null, owned), owned, null);
  assert.equal(room.starter, true);
  assert.deepEqual(room.furniture.map((p) => p.f).sort(), ['bed', 'chair', 'pc', 'plant', 'rug', 'table']);
  assert.deepEqual([...owned].sort(), ['bed', 'chair', 'pc', 'plant', 'rug', 'table'], 'the pieces are owned, so they can be put back');
  // 置き場所は へやの 中・かさならない・戸口の 前（x -1〜0, z 2〜3）を ふさがない。
  const half = ROOMS[0].grid / 2;
  const seen = new Set();
  for (const p of room.furniture) {
    const { w, d } = footprint(PROPS.get(p.f), p.r);
    assert.ok(p.x >= -half && p.z >= -half && p.x + w <= half && p.z + d <= half, `${p.f} is inside the room`);
    for (const c of propCells(p)) {
      const k = `${c.x},${c.z}`;
      assert.ok(!seen.has(k), `${p.f} overlaps at ${k}`);
      seen.add(k);
      assert.ok(!(c.z >= 2 && c.x >= -1 && c.x <= 0), `${p.f} blocks the doorway`);
    }
  }
  // 保存した ものを 読みなおしても 同じ（サーバーの sanitize を 通る）・ふえない。
  assert.equal(room.pc, true);
  const saved = JSON.parse(JSON.stringify({ tier: room.tier, furniture: room.furniture, starter: room.starter, pc: room.pc }));
  const owned2 = sanitizeProps(JSON.parse(JSON.stringify(owned)));
  const again = starterRoom(sanitizeRoom(saved, owned2), owned2, saved);
  assert.deepEqual(again.furniture, room.furniture);
  // うごかせる：かたづけて べつの マスに むきを かえて 置く。
  const bed = removeProp(again, { x: -4, z: -3 });
  assert.equal(bed.f, 'bed');
  assert.deepEqual(placeProp(again, owned2, { f: 'bed', x: 1, z: 1, r: 1 }), { f: 'bed', x: 1, z: 1, r: 1 });
});

test('はじめの かぐ：ぜんぶ かたづけた 子に 二度と わたさない・前から ある へやには さわらない', async () => {
  const { starterRoom } = await import('../src/game/town.js');
  // かたづけた あと：starter の しるしが のこって いる。
  const emptied = { tier: 1, furniture: [], starter: true, pc: true };
  const owned = sanitizeProps(['bed', 'table', 'rug', 'plant']);
  const room = starterRoom(sanitizeRoom(emptied, owned), owned, emptied);
  assert.deepEqual(room.furniture, []);
  assert.equal(room.starter, true);
  // 前から かぐを 置いて いた 子（しるし なし）：そのまま。かぐも ふえない。しるしだけ つく。
  const old = { tier: 1, furniture: [{ f: 'chair', x: 0, z: 0, r: 0 }], pc: true };
  const ownedOld = sanitizeProps([]);
  const kept = starterRoom(sanitizeRoom(old, ownedOld), ownedOld, old);
  assert.deepEqual(kept.furniture, [{ f: 'chair', x: 0, z: 0, r: 0 }]);
  assert.deepEqual(ownedOld, ['chair', 'pc']);
  assert.equal(kept.starter, true);
  // しるしが うそ（true で ない）なら 読まない：からっぽなら わたす。
  const fake = { tier: 1, furniture: [], starter: 'yes' };
  const ownedFake = sanitizeProps([]);
  assert.equal(starterRoom(sanitizeRoom(fake, ownedFake), ownedFake, fake).furniture.length, 6);
});

test('じぶんの いえ：メインの島の データに あり、まちづくり島の door と 同じ 戸口として 読む', async () => {
  const { MAIN_HOME, loadMainHome } = await import('../src/game/town.js');
  const main = JSON.parse(readFileSync(new URL('../../client/dist/main_island.json', import.meta.url), 'utf8')).island;
  const spot = main.spots.find((sp) => sp.kind === 'my_home');
  assert.ok(spot, 'main_island.json has the my_home spot');
  assert.equal(main.spots.filter((sp) => sp.kind === 'my_home').length, 1);
  assert.equal(MAIN_HOME.island.id, 'main');
  assert.equal(MAIN_HOME.spot.wx, main.x + spot.x);
  assert.equal(MAIN_HOME.spot.wz, main.z + spot.z);
  // スタートから 大通りを 歩いて すぐ（35 より 近い）。
  assert.ok(Math.hypot(spot.x - main.start.x, spot.z - main.start.z) < 35);
  // 場所が 無い データ・読めない ファイルでは null（起動は 止めない）。
  assert.equal(loadMainHome(write({ island: { id: 'main', x: 0, z: 0, spots: [] } })), null);
  assert.equal(loadMainHome(join(dir, 'nope.json')), null);
});

// ---- パソコン（オンライン ショップ）・あたらしい かぐ・ベッド（2026-11） ----

test('パソコン：あたらしい へやにも 前から ある へやにも 1 回だけ', async () => {
  const { starterRoom, grantPc, footprint } = await import('../src/game/town.js');
  const count = (room) => room.furniture.filter((p) => p.f === 'pc').length;
  // あたらしい へや：はじめの かぐと いっしょに 置いて ある。
  const ownedNew = sanitizeProps([]);
  const fresh = starterRoom(sanitizeRoom(null, ownedNew), ownedNew, null);
  assert.equal(count(fresh), 1);
  assert.equal(fresh.pc, true);
  // 前から ある へや（starter は もう true・pc の しるしは ない）：あいて いる ゆかに 1 台。ほかの かぐは そのまま。
  const before = { tier: 1, starter: true, furniture: [{ f: 'bed', x: -4, z: -4, r: 0 }, { f: 'chair', x: -2, z: -4, r: 0 }, { f: 'rug', x: -1, z: -1, r: 0 }] };
  const owned = sanitizeProps(['bed', 'rug']);
  const moved = starterRoom(sanitizeRoom(before, owned), owned, before);
  assert.equal(count(moved), 1);
  assert.equal(moved.pc, true);
  assert.deepEqual(moved.furniture.slice(0, 3), before.furniture, 'what the child put down is untouched');
  const pc = moved.furniture.find((p) => p.f === 'pc');
  const half = ROOMS[0].grid / 2, { w, d } = footprint(PROPS.get('pc'), pc.r);
  assert.ok(pc.x >= -half && pc.z >= -half && pc.x + w <= half && pc.z + d <= half, 'inside the room');
  const taken = new Set(before.furniture.flatMap((p) => propCells(p).map((c) => `${c.x},${c.z}`)));
  for (const c of propCells(pc)) {
    assert.ok(!taken.has(`${c.x},${c.z}`), 'on free floor');
    assert.ok(!(c.z >= half - 2 && c.x >= -2 && c.x <= 1), 'not in front of the door');
  }
  // 保存して 読みなおしても ふえない。かたづけた あとも もどって こない（もちものには のこる）。
  const saved = JSON.parse(JSON.stringify({ tier: moved.tier, furniture: moved.furniture, starter: true, pc: moved.pc }));
  const owned2 = sanitizeProps(JSON.parse(JSON.stringify(owned)));
  const again = starterRoom(sanitizeRoom(saved, owned2), owned2, saved);
  assert.equal(count(again), 1);
  removeProp(again, { x: pc.x, z: pc.z });
  const cleared = JSON.parse(JSON.stringify({ tier: 1, furniture: again.furniture, starter: true, pc: true }));
  const owned3 = sanitizeProps([]);
  const later = starterRoom(sanitizeRoom(cleared, owned3), owned3, cleared);
  assert.equal(count(later), 0, 'given once');
  assert.ok(owned3.includes('pc'), 'but still owned, so it can be put back');
  // いっぱいの へや：置かずに もちものに 入れるだけ。しるしは つく。
  const full = { tier: 1, starter: true, furniture: [] };
  for (let i = 0; i < ROOMS[0].props; i += 1) full.furniture.push({ f: 'chair', x: -half + i % ROOMS[0].grid, z: -half + Math.floor(i / ROOMS[0].grid), r: 0 });
  const ownedFull = sanitizeProps([]);
  const packed = grantPc(sanitizeRoom(full, ownedFull), ownedFull, full);
  assert.equal(count(packed), 0);
  assert.equal(packed.furniture.length, ROOMS[0].props);
  assert.equal(packed.pc, true);
  assert.ok(ownedFull.includes('pc'));
  // しるしが うそなら 読まない。
  const fake = { tier: 1, starter: true, pc: 'yes', furniture: [] };
  const ownedFake = sanitizeProps([]);
  assert.equal(count(starterRoom(sanitizeRoom(fake, ownedFake), ownedFake, fake)), 1);
});

test('かぐ 31 しゅるい：ベッドは ねられる 形で、どの へやにも 置ける', async () => {
  const { propPayload, footprint } = await import('../src/game/town.js');
  assert.equal(PROPS.size, 31);
  const beds = [...PROPS.values()].filter((f) => f.bed === true).map((f) => f.id).sort();
  assert.deepEqual(beds, ['bed', 'bed_bunk', 'bed_canopy', 'bed_king', 'bed_princess']);
  const small = ROOMS[0].grid / 2;
  for (const id of beds) {
    const f = PROPS.get(id), pay = propPayload(f, true);
    assert.equal(pay.bed, true, `${id} is sent as a bed`);
    assert.ok(pay.sleepY > 0.5 && pay.sleepY < 2.2, `${id} has a height to lie at`);
    assert.ok(pay.sleepZ > 0 && pay.sleepZ < f.d / 2, `${id}: the feet are on the mattress`);
    assert.ok(f.d >= 3, `${id} is long enough to lie on`);
    // 4 つの むきで いちばん 小さい へやに 置ける。
    for (const r of [0, 1, 2, 3]) {
      const state = room(), { w, d } = footprint(f, r);
      assert.deepEqual(placeProp(state, [id], { f: id, x: -small, z: -small, r }), { f: id, x: -small, z: -small, r });
      assert.throws(() => placeProp(state, [id], { f: id, x: -small + w - 1, z: -small + d - 1, r }), /something is there/);
    }
  }
  // ベッドで ない ものは ベッドとして 送らない。
  assert.equal(propPayload(PROPS.get('sofa'), true).bed, undefined);
  // 形は ぜんぶ ちがう・ねだんは 0〜3000・あたらしい 品にも やすい ものが ある。
  const shapes = [...PROPS.values()].map((f) => f.shape);
  assert.equal(new Set(shapes).size, shapes.length);
  for (const f of PROPS.values()) assert.ok(f.price >= 0 && f.price <= 3000 && f.h > 0, `${f.id} is priced and has a height`);
  assert.equal(PROPS.get('bed_king').price, 3000);
  assert.ok([...PROPS.values()].filter((f) => f.price > 0 && f.price <= 100).length >= 3);
  // こわれた ベッド（ねる 高さが ない）は 読まない。
  const broken = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  delete broken.furniture.find((f) => f.id === 'bed_king').sleepY;
  const file = join(dir, 'bad-bed.json');
  writeFileSync(file, JSON.stringify(broken));
  assert.throws(() => loadTown(file), /not somewhere to lie down/);
});
