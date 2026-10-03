// 土地島: six steps in order, two looks a step, coins the only gate, and a saved island
// that cannot lie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LAND, LAND_ISLAND, TIERS, LOOKS, loadLand, DATA_PATH, tierOf, nextTier, lookOf, restylePrice,
  sanitizeLand, landPayload, islandPayload, priceOfNext, priceOfRestyle, LandError,
} from '../src/game/land.js';

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'land-'));
const write = (data) => { const f = join(dir, 'l.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const clone = () => JSON.parse(JSON.stringify(raw));

test('six steps, each dearer and bigger than the last, the first within a first day', () => {
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
  for (const t of TIERS) { assert.ok(t.name && t.en, t.id); assert.equal(t.level, undefined, 'coins only: no level gate'); }
});

test('twelve looks — two a step, every one a different world, all with words and a picture', () => {
  assert.equal(LOOKS.size, 12);
  for (const t of TIERS) {
    assert.equal(t.looks.length, 2, `${t.id} offers two looks`);
    for (const l of t.looks) { assert.equal(l.tier, t.tier); assert.ok(l.name && l.en && l.ja && l.blurb && l.emoji && l.theme, l.id); }
  }
  assert.equal(new Set([...LOOKS.values()].map((l) => l.theme)).size, 12, 'twelve different worlds, not twelve sizes');
  // Changing to the other look of a step costs a fraction of the step, never nothing.
  for (const t of TIERS) { assert.ok(restylePrice(t) >= 1 && restylePrice(t) < t.price, t.id); assert.equal(restylePrice(t), Math.round(t.price * LAND.restyle)); }
});

test('the hub has an office, a ferry and a board, far enough apart to stand at one at a time', () => {
  assert.equal(LAND_ISLAND.id, 'land');
  for (const kind of ['office', 'ferry', 'board']) assert.ok(LAND_ISLAND.spots.some((s) => s.kind === kind), kind);
  for (const s of LAND_ISLAND.spots) assert.equal(LAND.spotById.get(s.id).wx, LAND_ISLAND.x + s.x);
});

test('a saved island is kept only if it exists; a look that is not of the step becomes the first', () => {
  assert.deepEqual(sanitizeLand(null), { tier: 0, look: '' });
  assert.deepEqual(sanitizeLand({ tier: 3, look: 'desert' }), { tier: 3, look: 'desert' });
  assert.deepEqual(sanitizeLand({ tier: 3 }), { tier: 3, look: 'forest' }, 'an older save with no look');
  assert.deepEqual(sanitizeLand({ tier: 3, look: 'sand' }), { tier: 3, look: 'forest' }, 'a look of another step');
  assert.deepEqual(sanitizeLand({ tier: 99, look: 'sand' }), { tier: 0, look: '' });
  assert.deepEqual(sanitizeLand({ tier: -1 }), { tier: 0, look: '' });
  assert.deepEqual(sanitizeLand({ tier: '2.7', look: 'lake' }), { tier: 2, look: 'lake' });
});

test('the next step costs what land.json says, in the look asked for, in order; the top has no next', () => {
  assert.equal(tierOf(0), null);
  assert.equal(nextTier(0).tier, 1);
  assert.equal(nextTier(6), null);
  const first = priceOfNext({ tier: 0, look: '' }, 100, 'rock');
  assert.equal(first.look.id, 'rock'); assert.equal(first.tier.tier, 1); assert.equal(first.price, TIERS[0].price);
  assert.equal(priceOfNext({ tier: 0, look: '' }, 100).look.id, 'sand', 'no look asked for: the first of the step');
  assert.throws(() => priceOfNext({ tier: 0, look: '' }, 99, 'sand'), /not enough coins/);
  assert.throws(() => priceOfNext({ tier: 0, look: '' }, 1e9, 'grass'), /no such look/, 'a look of a later step is not for sale yet');
  assert.throws(() => priceOfNext({ tier: 0, look: '' }, 1e9, 'nope'), /no such look/);
  assert.equal(priceOfNext({ tier: 1, look: 'sand' }, 600, 'lake').look.id, 'lake', 'order: the second comes after the first');
  assert.throws(() => priceOfNext({ tier: 6, look: 'sky' }, 1e9), /biggest already/);
  assert.throws(() => priceOfNext({ tier: 6, look: 'sky' }, 1e9), LandError);
});

test('a change of look stays on the same step, costs the restyle price, and never buys the same look twice', () => {
  const r = priceOfRestyle({ tier: 2, look: 'grass' }, 1e9, 'lake');
  assert.equal(r.look.id, 'lake'); assert.equal(r.price, restylePrice(tierOf(2)));
  assert.throws(() => priceOfRestyle({ tier: 0, look: '' }, 1e9, 'sand'), /no island/);
  assert.throws(() => priceOfRestyle({ tier: 2, look: 'grass' }, 1e9, 'grass'), /same look/);
  assert.throws(() => priceOfRestyle({ tier: 2, look: 'grass' }, 1e9, 'forest'), /no such look/, 'another step is a purchase, not a restyle');
  assert.throws(() => priceOfRestyle({ tier: 2, look: 'grass' }, r.price - 1, 'lake'), /not enough coins/);
});

test('what the page is told: the step, the look, the next step with its looks, and the island to build', () => {
  const p = landPayload({ tier: 2, look: 'lake' });
  assert.equal(p.island.id, 'lake'); assert.equal(p.step.id, 'step2'); assert.equal(p.next.id, 'step3');
  assert.deepEqual(p.next.looks.map((l) => l.id), ['forest', 'desert']);
  assert.equal(p.step.restyle, restylePrice(tierOf(2)));
  assert.equal(p.tiers.length, 6); assert.equal(p.tiers.flatMap((t) => t.looks).length, 12);
  assert.equal(landPayload({ tier: 0, look: '' }).island, null);
  assert.equal(landPayload({ tier: 6, look: 'space' }).next, null);
  const isle = islandPayload({ tier: 5, look: 'volcano' }, 'Rin');
  assert.equal(isle.theme, 'volcano'); assert.equal(isle.grid, tierOf(5).grid); assert.equal(isle.owner, 'Rin'); assert.equal(isle.id, 'volcano');
  assert.equal(islandPayload({ tier: 0, look: '' }, 'Rin'), null);
  assert.equal(lookOf('nope'), null);
});

test('a broken land.json is refused at boot rather than half-loaded', () => {
  const bad1 = clone(); bad1.tiers[2].price = 10; assert.throws(() => loadLand(write(bad1)), /not above/);
  const bad2 = clone(); bad2.tiers[1].tier = 5; assert.throws(() => loadLand(write(bad2)), /numbered in order/);
  const bad3 = clone(); bad3.island.spots = bad3.island.spots.filter((s) => s.kind !== 'ferry'); assert.throws(() => loadLand(write(bad3)), /ferry|at least|island block/);
  const bad4 = clone(); bad4.tiers[3].id = bad4.tiers[2].id; assert.throws(() => loadLand(write(bad4)), /unique/);
  const bad5 = clone(); bad5.tiers[3].looks[1].id = 'sand'; assert.throws(() => loadLand(write(bad5)), /look ids are unique/);
  const bad6 = clone(); bad6.tiers[3].looks[1].theme = 'sand'; assert.throws(() => loadLand(write(bad6)), /different world/);
  const bad7 = clone(); bad7.tiers[0].looks = []; assert.throws(() => loadLand(write(bad7)), /no looks/);
  const bad8 = clone(); bad8.restyle = 1.5; assert.throws(() => loadLand(write(bad8)), /fraction/);
  assert.equal(loadLand(write(clone())).tiers.length, 6);
});
