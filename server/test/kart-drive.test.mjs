// カートの走り、実際に走らせて確かめる。
//
// A handling model is an opinion until something drives it. These tests put a kart on the
// circuit and race it: a lap has to be possible, and possible in a time that makes a
// three-lap race about as long as a race should be. Then the pieces on their own — the
// throttle stops at the ceiling, the grass is slower, a drift pays and a wall does not
// swallow the kart.
//
// It all runs headless, at a fixed step, so a lap time here is the lap time on an iPad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tracksFrom } from '../../client/dist/kart-track-data.js';
import { createKart, gridKart, advance, boostKart, KART, TICK } from '../../client/dist/kart-drive.js';
import { createDriver, driveAI } from '../../client/dist/kart-ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(here, '../../client/dist/tracks.json'), 'utf8'));
const track = tracksFrom(data).tracks[0];

// A test oval: one long gentle curve, wide, flat, no walls. The circuit is where lap times
// come from; this is where the model's own numbers come from, because "flat out on the
// straight" is not a thing a real circuit lets you do for twelve seconds.
const oval = tracksFrom({
  version: 1,
  tracks: [{
    id: 'oval',
    laps: 3,
    width: 24,
    checkpoints: 8,
    points: Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return { x: Math.sin(a) * 240, y: 0, z: Math.cos(a) * 240 };
    }),
    grid: [{ t: 0.0, o: 0 }, { t: 0.99, o: 0 }],
  }],
}).tracks[0];

// Drive one kart for a while and report what happened. `hands` decides the input each
// step, so the same rig drives an AI, a child holding the throttle, or nothing at all.
function drive(hands, { seconds = 60, kart = null, from = 0, on = track } = {}) {
  const k = kart || createKart();
  if (!kart) {
    gridKart(k, on.grid[from]);
    k.s = on.project(k.x, k.z).s;
  }
  let now = 0;
  const laps = [];
  const events = [];
  // The grid sits behind the line, so the first crossing starts the race rather than
  // ending a lap — the same rule a real starter's flag follows.
  let lapStart = null;
  let fastest = 0;
  const step = 1 / 60;      // the caller's frame; advance() sub-steps it
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    const evs = advance(k, { seconds: step, input: hands(k, now), track: on, now });
    for (const e of evs) {
      events.push(e);
      if (e.type === 'line' && e.forward) {
        if (lapStart !== null) laps.push(now - lapStart);
        lapStart = now;
      }
    }
    if (k.speed > fastest) fastest = k.speed;
    now += step * 1000;
  }
  return { kart: k, laps, events, now, fastest };
}

const flatOut = () => ({ throttle: true, brake: false, steer: 0, drift: false });
// Flat out and still on the road: a driver good enough to steer, on a curve wide enough
// that steering costs nothing. Anything else spends twelve seconds driving into a field.
const ovalDriver = createDriver({ id: 'oval', name: 'oval', skill: 1.1 });
const roundTheOval = (k, now) => ({ ...driveAI(ovalDriver, k, { track: oval, now }), throttle: true, brake: false, drift: false });

test('the throttle reaches the top speed and stops there', () => {
  const { kart, fastest } = drive(roundTheOval, { seconds: 16, on: oval });
  assert.ok(fastest > KART.top * 0.97, `reached ${fastest.toFixed(1)} of ${KART.top}`);
  assert.ok(fastest <= KART.top + 0.2, `did not run past it: ${fastest.toFixed(2)}`);
  assert.ok(kart.onRoad, 'and stayed on the road doing it');
});

test('the grass is slower than the road, and lets a kart back out', () => {
  const k = createKart();
  gridKart(k, track.grid[0]);
  // Put it well off the side, where there is no wall to bounce off.
  const off = track.placeT(0.9, 26);
  k.x = off.x; k.z = off.z;
  k.hint = -1;
  const { kart } = drive(flatOut, { seconds: 8, kart: k });
  assert.equal(kart.onRoad, false, 'still on the grass');
  assert.ok(kart.speed < KART.top * (KART.grassTop + 0.08), `grass held it to ${kart.speed.toFixed(1)}`);
  assert.ok(kart.speed > 3, 'but it is still moving');
});

test('a drift charges three times and each one pays', () => {
  const seen = [];
  const k = createKart();
  gridKart(k, track.grid[0]);
  let now = 0;
  // Hold a drift on an empty stretch: throttle, one way, drift down.
  for (let i = 0; i < 60 * 6; i += 1) {
    const evs = advance(k, { seconds: 1 / 60, input: { throttle: true, brake: false, steer: 1, drift: true }, track, now });
    for (const e of evs) if (e.type === 'spark') seen.push(e.level);
    now += 1000 / 60;
  }
  assert.deepEqual(seen, [1, 2, 3], `sparks came in order: ${seen.join(',')}`);
  // Let go: a boost, and the kart is quicker for it.
  const before = k.speed;
  const evs = advance(k, { seconds: 1 / 60, input: { throttle: true, brake: false, steer: 0, drift: false }, track, now });
  const turbo = evs.find((e) => e.type === 'turbo');
  assert.ok(turbo && turbo.level === 3, 'a purple turbo');
  assert.ok(k.boostUntil > now, 'the boost is running');
  assert.ok(k.speed >= before, 'and it did not slow down for it');
});

test('a boost is faster than the top speed, and wears off', () => {
  const k = createKart();
  gridKart(k, oval.grid[0]);
  drive(roundTheOval, { seconds: 14, kart: k, on: oval });
  boostKart(k, 'item', 0);
  const fast = drive(roundTheOval, { seconds: 1.2, kart: k, on: oval });
  assert.ok(fast.fastest > KART.top + 1, `boosted to ${fast.fastest.toFixed(1)}`);
  const after = drive(roundTheOval, { seconds: 4, kart: k, on: oval });
  assert.ok(after.kart.speed <= KART.top + 0.2, `back to ${after.kart.speed.toFixed(1)}`);
});

test('a rival gets round the circuit, three laps, at a racing pace', () => {
  const driver = createDriver({ id: 'r1', name: 'ミドリ', skill: 1.0 });
  const { kart, laps } = drive((k, now) => driveAI(driver, k, { track, now }), { seconds: 200 });
  assert.ok(laps.length >= 3, `completed ${laps.length} laps in 200s`);
  for (const [i, ms] of laps.slice(0, 3).entries()) {
    // A lap this circuit's length should take 35-60 seconds: quicker means the kart is
    // cutting across the grass somewhere, slower means it is stuck on something.
    assert.ok(ms > 25000 && ms < 62000, `lap ${i + 1} took ${(ms / 1000).toFixed(1)}s`);
  }
  assert.ok(kart.onRoad, 'and finished on the road');
});

test('a quick rival is quicker than a slow one, on the same circuit', () => {
  const lapOf = (skill) => {
    const d = createDriver({ id: 's', name: 's', skill });
    const { laps } = drive((k, now) => driveAI(d, k, { track, now }), { seconds: 200 });
    return laps.length ? Math.min(...laps) : Infinity;
  };
  const quick = lapOf(1.1);
  const slow = lapOf(0.82);
  assert.ok(quick < slow, `1.1 lapped in ${(quick / 1000).toFixed(1)}s, 0.82 in ${(slow / 1000).toFixed(1)}s`);
});

test('a wall turns a kart along itself and never traps it', () => {
  // Aim at the barrier on the walled stretch, hard.
  const walled = track.def.walls[0];
  const s = (walled.from + 0.02) * track.length;
  const k = createKart();
  const p = track.place(s, 0);
  const f = track.at(s);
  k.x = p.x; k.z = p.z; k.y = p.y;
  k.heading = Math.atan2(f.nx, f.nz);   // straight at the wall
  k.course = k.heading;
  k.speed = KART.top * 0.8;
  // Watch every step while the kart is on the walled stretch: the barrier has to hold it,
  // not merely be somewhere nearby.
  let worst = 0;
  let hitWall = false;
  let now = 0;
  for (let i = 0; i < 60 * 3; i += 1) {
    const evs = advance(k, { seconds: 1 / 60, input: flatOut(), track, now });
    if (evs.some((e) => e.type === 'wall')) hitWall = true;
    const at = track.project(k.x, k.z, k.hint);
    if (track.walled(at.s)) worst = Math.max(worst, Math.abs(at.offset) - track.at(at.s).w / 2);
    now += 1000 / 60;
  }
  assert.ok(hitWall, 'it hit the wall');
  assert.ok(worst < 1, `the wall held it: worst was ${worst.toFixed(2)}m past the edge`);
  assert.ok(k.speed > 2, `and it is still moving at ${k.speed.toFixed(1)}`);
});

test('the same seconds give the same lap however the frames fall', () => {
  // The whole point of the fixed step: a lap on a 30fps iPad and a 120fps laptop are the
  // same lap. Drive the identical inputs at three frame rates and compare where it ends.
  const run = (fps) => {
    const d = createDriver({ id: 'x', name: 'x', skill: 1 });
    const k = createKart();
    gridKart(k, track.grid[0]);
    let now = 0;
    for (let i = 0; i < Math.round(40 * fps); i += 1) {
      advance(k, { seconds: 1 / fps, input: driveAI(d, k, { track, now }), track, now });
      now += 1000 / fps;
    }
    return k.s;
  };
  const a = run(120);
  const b = run(60);
  const c = run(24);
  assert.ok(Math.abs(a - b) < 12, `120fps and 60fps ended ${Math.abs(a - b).toFixed(1)}m apart`);
  assert.ok(Math.abs(a - c) < 25, `120fps and 24fps ended ${Math.abs(a - c).toFixed(1)}m apart`);
});

test('the fixed step is small enough that a boosted kart cannot skip a checkpoint', () => {
  // A checkpoint is a line across the road; a kart that moves further than the gap between
  // two frames in one step could pass one without being seen.
  const gap = track.length / track.checkpoints.length;
  const furthest = KART.boostTop * TICK;
  assert.ok(furthest < gap / 4, `a step moves ${furthest.toFixed(2)}m, checkpoints are ${gap.toFixed(1)}m apart`);
});
