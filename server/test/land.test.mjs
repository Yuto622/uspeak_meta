// 土地島: six islands in order, coins the only gate, and a saved tier that cannot lie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LAND, LAND_ISLAND, TIERS, loadLand, DATA_PATH, tierOf, nextTier, sanitizeLand, landPayload, priceOfNext, LandError } from '../src/game/land.js';

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'land-'));
const write = (data) => { const f = join(dir, 'l.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const clone = () => JSON.parse(JSON.stringify(raw));

test('six islands, each dearer and bigger than the last, the first within a first day', () => {
  assert.equal(TIERS.length, 6);
  assert.deepEqual(TIERS.map((t) => t.tier), [1, 2, 3, 4, 5, 6]);
  assert.ok(TIERS[0].price <= 100, 'the login bonus of day one buys the first island');
  for (let i = 1; i < TIERS.length; i += 1) {
    assert.ok(TIERS[i].price > TIERS[i - 1].price);
    assert.ok(TIERS[i].grid >= TIERS[i - 1].grid);
    // Each step is a goal that can be seen from the step before (docs/uspeak-land-research.md).
    const ratio = TIERS[i].price / TIERS[i - 1].price;
    assert.ok(ratio >= 2 && ratio <= 6, `tier ${i + 1} is ${ratio}× tier ${i}`);
  }
  assert.equal(new Set(TIERS.map((t) => t.theme)).size, 6, 'six different looks, not six sizes');
  for (const t of TIERS) { assert.ok(t.name && t.en && t.ja && t.blurb && t.emoji, t.id); assert.equal(t.level, undefined, 'coins only: no level gate'); }
});

test('the hub has an office, a ferry and a board, far enough apart to stand at one at a time', () => {
  assert.equal(LAND_ISLAND.id, 'land');
  for (const kind of ['office', 'ferry', 'board']) assert.ok(LAND_ISLAND.spots.some((s) => s.kind === kind), kind);
  for (const s of LAND_ISLAND.spots) assert.equal(LAND.spotById.get(s.id).wx, LAND_ISLAND.x + s.x);
});

test('a saved tier is kept only if it exists; anything else is "no island"', () => {
  assert.deepEqual(sanitizeLand(null), { tier: 0 });
  assert.deepEqual(sanitizeLand({ tier: 3 }), { tier: 3 });
  assert.deepEqual(sanitizeLand({ tier: 99 }), { tier: 0 });
  assert.deepEqual(sanitizeLand({ tier: -1 }), { tier: 0 });
  assert.deepEqual(sanitizeLand({ tier: '2.7' }), { tier: 2 });
});

test('the next island costs what land.json says, in order, and the top has no next', () => {
  assert.equal(tierOf(0), null);
  assert.equal(nextTier(0).tier, 1);
  assert.equal(nextTier(6), null);
  assert.equal(priceOfNext({ tier: 0 }, 100).id, 'sand');
  assert.throws(() => priceOfNext({ tier: 0 }, 99), /not enough coins/);
  assert.equal(priceOfNext({ tier: 1 }, 600).id, 'grass', 'order: the second comes after the first');
  assert.throws(() => priceOfNext({ tier: 6 }, 1e9), /biggest already/);
  assert.throws(() => priceOfNext({ tier: 6 }, 1e9), LandError);
  const p = landPayload({ tier: 2 });
  assert.equal(p.island.id, 'grass'); assert.equal(p.next.id, 'forest'); assert.equal(p.tiers.length, 6);
  assert.equal(landPayload({ tier: 0 }).island, null);
});

test('a broken land.json is refused at boot rather than half-loaded', () => {
  const bad1 = clone(); bad1.tiers[2].price = 10; assert.throws(() => loadLand(write(bad1)), /not above/);
  const bad2 = clone(); bad2.tiers[1].tier = 5; assert.throws(() => loadLand(write(bad2)), /numbered in order/);
  const bad3 = clone(); bad3.island.spots = bad3.island.spots.filter((s) => s.kind !== 'ferry'); assert.throws(() => loadLand(write(bad3)), /ferry|at least|island block/);
  const bad4 = clone(); bad4.tiers[3].id = bad4.tiers[2].id; assert.throws(() => loadLand(write(bad4)), /unique/);
  assert.equal(loadLand(write(clone())).tiers.length, 6);
});
