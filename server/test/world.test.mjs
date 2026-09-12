// The world's clock and the night's ghosts. The clock is a pure function of the wall
// clock — that is the property worth testing, because it is what keeps a class of
// children in the same sky without anything being sent between them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, CYCLE_SEC, phaseAt, isNight, untilNight } from '../../client/dist/world-clock.js';
import { NIGHT, REACH, COINS, DAILY_CAP, ghostPayload, sanitizeCaps, roomLeft, loadNight } from '../src/game/night.js';
import { dayIndex } from '../src/game/daily.js';
import * as fs from 'node:fs';
import * as pathMod from 'node:path';
import * as osMod from 'node:os';

test('the cycle is Roblox\'s: a long day, a slow dusk, a night, a short morning', () => {
  assert.deepEqual(PHASES.map((p) => [p.id, p.seconds]), [['day', 300], ['dusk', 120], ['night', 240], ['dawn', 45]]);
  assert.equal(CYCLE_SEC, 705);
  // Under twelve minutes, so a lesson sees the world turn three or four times.
  assert.ok(CYCLE_SEC < 12 * 60);
});

test('the same moment is the same sky, anywhere', () => {
  // No state, no drift: two callers a cycle apart agree exactly.
  for (const at of [0, 90, 299.5, 300, 420, 700]) {
    const now = at * 1000;
    assert.deepEqual(phaseAt(now), phaseAt(now + CYCLE_SEC * 1000), `at ${at}s`);
  }
  // Negative moments (a browser clock behind the epoch) still land inside the cycle.
  assert.ok(PHASES.some((p) => p.id === phaseAt(-5000).id));
});

test('the dark comes on gradually and lifts gradually', () => {
  assert.equal(phaseAt(0).night, 0, 'noon is broad daylight');
  assert.equal(phaseAt(360 * 1000).night, 0.5, 'halfway through dusk is halfway dark');
  assert.equal(phaseAt(500 * 1000).night, 1, 'the middle of the night is full dark');
  // Dusk only ever gets darker, dawn only ever gets lighter.
  for (let t = 300; t < 420; t += 5) assert.ok(phaseAt((t + 5) * 1000).night > phaseAt(t * 1000).night);
  for (let t = 660; t < 704; t += 5) assert.ok(phaseAt((t + 5) * 1000).night < phaseAt(t * 1000).night);
});

test('dusk is not night: the ghosts wait for the dark', () => {
  assert.equal(isNight(360 * 1000), false, 'the sky is still turning');
  assert.equal(isNight(430 * 1000), true);
  assert.equal(isNight(670 * 1000), false, 'and they are gone by morning');
  // The countdown lands exactly on nightfall, from anywhere in the cycle.
  for (const at of [0, 200, 310, 665, 704]) {
    const now = at * 1000;
    assert.equal(isNight(now + untilNight(now) + 500), true, `from ${at}s`);
  }
  assert.equal(untilNight(430 * 1000), 0, 'it is already night');
});

test('the ghosts are twelve, one in four wears a pumpkin, and none share a swing', () => {
  assert.equal(NIGHT.ids.length, 12);
  const pumpkins = [...NIGHT.ghosts.values()].filter((g) => g.pumpkin).length;
  assert.equal(pumpkins, 3, 'Roblox: 4体に1体');
  const all = [...NIGHT.ghosts.values()];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > REACH * 2, `${all[i].id}/${all[j].id}`);
    }
  }
  // Every ghost carries an English word and its Japanese, because that is the point.
  for (const g of all) { assert.ok(g.word.trim()); assert.ok(g.ja.trim()); }
  // And they all stand on the island the data says they do.
  for (const g of all) { assert.ok(Math.abs(g.x) < 25 && Math.abs(g.z) < 20, `${g.id} is off the island`); }
  assert.deepEqual(Object.keys(ghostPayload(all[0])).sort(), ['ja', 'id', 'pumpkin', 'word', 'x', 'z'].sort());
});

test('broken ghost data is refused rather than half-loaded', () => {
  const { writeFileSync, mkdtempSync } = fs;
  const { join } = pathMod;
  const { tmpdir } = osMod;
  const dir = mkdtempSync(join(tmpdir(), 'night-'));
  const write = (data) => { const f = join(dir, 'n.json'); writeFileSync(f, JSON.stringify(data)); return f; };
  const good = { space: 'willow', reach: 3, respawnSec: 25, coins: 3, dailyCap: 60, ghosts: [...NIGHT.ghosts.values()] };
  assert.equal(loadNight(write(good)).ids.length, 12);
  assert.throws(() => loadNight(write({ ...good, coins: 0 })), /coins/);
  assert.throws(() => loadNight(write({ ...good, space: '' })), /space/);
  assert.throws(() => loadNight(write({ ...good, ghosts: good.ghosts.slice(0, 2) })), /more than a few/);
  assert.throws(() => loadNight(write({ ...good, ghosts: [...good.ghosts, { ...good.ghosts[0] }] })), /duplicate/);
  assert.throws(() => loadNight(write({ ...good, ghosts: good.ghosts.map((g) => ({ ...g, ja: '' })) })), /no word/);
  // Two ghosts close enough to swing at together would make a miss look like a bug.
  const crowded = good.ghosts.map((g, i) => (i === 1 ? { ...g, x: good.ghosts[0].x + 1, z: good.ghosts[0].z } : g));
  assert.throws(() => loadNight(write({ ...good, ghosts: crowded })), /within one swing/);
});

test("a night's coins are capped, and the cap survives a rejoin", () => {
  const now = Date.now();
  const caps = sanitizeCaps({ day: dayIndex(now), battle: 40, ghost: 12 }, now);
  assert.deepEqual(caps, { day: dayIndex(now), battle: 40, ghost: 12, course: 0, eiken: 0, conv: 0 }, 'what was spent is remembered');
  assert.equal(roomLeft(caps, 'ghost', DAILY_CAP), DAILY_CAP - 12);
  // Yesterday's spending is not today's.
  const stale = sanitizeCaps({ day: dayIndex(now) - 1, battle: 150, ghost: 60 }, now);
  assert.deepEqual(stale, { day: dayIndex(now), battle: 0, ghost: 0, course: 0, eiken: 0, conv: 0 });
  assert.deepEqual(sanitizeCaps(null, now), { day: dayIndex(now), battle: 0, ghost: 0, course: 0, eiken: 0, conv: 0 });
  assert.deepEqual(sanitizeCaps({ day: dayIndex(now), ghost: -5 }, now).ghost, 0, 'negatives never buy room back');
  // The day rolls over on its own, without anything having to reset it.
  const rolling = sanitizeCaps({ day: dayIndex(now), ghost: DAILY_CAP }, now);
  assert.equal(roomLeft(rolling, 'ghost', DAILY_CAP, now), 0);
  assert.equal(roomLeft(rolling, 'ghost', DAILY_CAP, now + 86400 * 1000), DAILY_CAP);
  assert.equal(COINS * 20, DAILY_CAP, 'twenty ghosts is a full night');
});
