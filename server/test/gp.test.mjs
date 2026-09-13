// グランプリ、部屋の側。
//
// The page runs the kart because a kart has to be run at sixty frames a second. This file
// is everything the page is therefore not allowed to decide, and the tests are mostly
// about refusing things: a lap claimed out of order, a checkpoint claimed from the other
// side of the circuit, a lap driven faster than a kart can go, a finish claimed twice.
//
// It also races the rivals, on the room's own clock, and checks they get round — the same
// five karts every child in the class is racing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGP, joinGP, leaveGP, tickGP, claimCp, standings, prizeFor, placeOf,
  TRACK, RIVALS, GRID_MS, LIGHTS_MS, MAX_RACERS, DAILY_CAP,
} from '../src/game/gp.js';

// Run the room's clock forward without waiting for it.
function run(race, seconds, from, step = 0.05) {
  let now = from;
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    now += step * 1000;
    tickGP(race, now);
  }
  return now;
}

// Drive a child round honestly: claim each checkpoint, with the position, at a plausible
// pace. This is what the page does when nobody is cheating.
function lap(race, id, now, { pace = 1 } = {}) {
  const n = race.track.checkpoints.length;
  const gap = race.track.length / n;
  let t = now;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = race.racers.get(id);
    const gate = race.track.checkpoints[r.cp % n];
    // Let the room's clock run between checkpoints rather than jumping it, or the rivals
    // are simulated in one lump and this stops being a race against anybody.
    t = run(race, gap / (18 * pace), t);
    out.push(claimCp(race, id, { cp: r.cp + 1, s: gate.s }, t));
  }
  return { now: t, out };
}

test('a grid becomes a race, and the rivals drive it', () => {
  let now = 1_000_000;
  const race = createGP({ classCode: 'a', now });
  assert.equal(race.rivals.length, RIVALS.length);
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  assert.equal(race.phase, 'running', 'the lights went out');
  now = run(race, 40, now);
  for (const r of race.rivals) {
    assert.ok(r.cp > 0, `${r.name} has passed ${r.cp} checkpoints in 40 seconds`);
    assert.ok(r.kart.speed > 4, `${r.name} is moving at ${r.kart.speed.toFixed(1)}`);
  }
  // …and they are on the road, not in a field.
  for (const r of race.rivals) {
    const hit = race.track.project(r.kart.x, r.kart.z);
    assert.ok(Math.abs(hit.offset) < race.track.at(hit.s).w / 2 + 8, `${r.name} is on the circuit`);
  }
});

test('the rivals get round three laps in a plausible time', () => {
  let now = 2_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  const started = now;
  now = run(race, 200, now);
  const done = race.rivals.filter((r) => r.finished);
  assert.equal(done.length, race.rivals.length, `${done.length} of ${race.rivals.length} rivals finished in 200s`);
  const totals = done.map((r) => (r.finished - started) / 1000);
  for (const [i, total] of totals.entries()) {
    assert.ok(total > 60 && total < 200, `${done[i].name} took ${total.toFixed(0)}s for ${race.laps} laps`);
  }
  // And they are a field, not a queue. If the slowest rival is within a few seconds of the
  // quickest then every child in the class either beats all five or none of them, and the
  // race has one difficulty instead of five. Half a minute between first and last is what
  // makes 'I got past モモ this time' a thing a child can say.
  const spread = Math.max(...totals) - Math.min(...totals);
  assert.ok(spread > 30, `only ${spread.toFixed(0)}s between the quickest rival and the slowest`);
});

test('checkpoints only count in order, and only once', () => {
  let now = 3_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  const cps = race.track.checkpoints;
  // Skipping to the finish line is refused, and the room says which one is wanted.
  const skip = claimCp(race, 'kid', { cp: cps.length, s: cps[cps.length - 1].s }, now);
  assert.equal(skip.ok, false);
  assert.equal(skip.reason, 'not next');
  assert.equal(skip.want, 1);
  // The first one counts.
  const first = claimCp(race, 'kid', { cp: 1, s: cps[0].s }, now + 3000);
  assert.equal(first.ok, true);
  // The same one again does not.
  const again = claimCp(race, 'kid', { cp: 1, s: cps[0].s }, now + 4000);
  assert.equal(again.ok, false);
});

test('a checkpoint claimed from the wrong place is refused', () => {
  let now = 4_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  const cps = race.track.checkpoints;
  // The right checkpoint, but the kart says it is halfway round the circuit.
  const far = claimCp(race, 'kid', { cp: 1, s: (cps[0].s + race.track.length / 2) % race.track.length }, now + 3000);
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'too far');
  // With no position at all, nothing counts.
  assert.equal(claimCp(race, 'kid', { cp: 1 }, now + 3000).reason, 'no position');
});

test('a lap nobody could have driven is refused', () => {
  let now = 5_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  const cps = race.track.checkpoints;
  assert.equal(claimCp(race, 'kid', { cp: 1, s: cps[0].s }, now).ok, true);
  // The next checkpoint, one millisecond later.
  const instant = claimCp(race, 'kid', { cp: 2, s: cps[1].s }, now + 1);
  assert.equal(instant.ok, false);
  assert.equal(instant.reason, 'too fast');
  // The same claim at a kart's pace is fine.
  const gap = race.track.length / cps.length;
  const ok = claimCp(race, 'kid', { cp: 2, s: cps[1].s }, now + (gap / 20) * 1000);
  assert.equal(ok.ok, true);
});

test('three honest laps finish the race and give a place', () => {
  let now = 6_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'kid', name: 'ユウト' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  let last = null;
  for (let i = 0; i < race.laps; i += 1) {
    const r = lap(race, 'kid', now);
    now = r.now;
    last = r.out[r.out.length - 1];
  }
  assert.ok(last.finished, 'the flag');
  assert.ok(last.place >= 1, `finished ${last.place}`);
  const me = race.racers.get('kid');
  assert.equal(me.lap, race.laps);
  assert.ok(me.best > 10000, `a best lap of ${(me.best / 1000).toFixed(1)}s`);
  // And nothing more counts afterwards.
  assert.equal(claimCp(race, 'kid', { cp: me.cp + 1, s: 0 }, now + 5000).reason, 'finished');
});

test('a child who drives well beats the rivals, and one who dawdles does not', () => {
  const finishAt = (pace) => {
    let now = 7_000_000;
    const race = createGP({ classCode: 'a', now });
    joinGP(race, { id: 'kid', name: 'ユウト' }, now);
    now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
    let out = null;
    for (let i = 0; i < race.laps; i += 1) {
      const r = lap(race, 'kid', now, { pace });
      now = r.now;
      out = r.out[r.out.length - 1];
    }
    return out.place;
  };
  // Three paces: driving better has to mean finishing better, and a lap at the kart's
  // limit has to be enough to win. If it is not, the quickest rival is a wall rather than
  // a rival — which is what this test found the first time it was run, and the second:
  // ミドリ was two tenths quicker than a perfect lap, and every rival behind her was
  // quicker than a child driving reasonably, so the three paces came 2nd, 6th and 6th.
  const quick = finishAt(1.44);
  const middling = finishAt(1.0);
  const slow = finishAt(0.6);
  assert.ok(quick < middling && middling < slow, `${quick} / ${middling} / ${slow}`);
  assert.equal(quick, 1, `a lap at the limit wins, but came ${quick}`);
  assert.ok(slow >= 5, `and dawdling round does not: came ${slow}`);
});

test('the running order puts everyone in it, child and rival', () => {
  let now = 8_000_000;
  const race = createGP({ classCode: 'a', now });
  joinGP(race, { id: 'a', name: 'あかり' }, now);
  joinGP(race, { id: 'b', name: 'ベン' }, now);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  now = run(race, 20, now);
  const list = standings(race);
  assert.equal(list.length, 2 + RIVALS.length);
  assert.deepEqual(list.map((r) => r.place), list.map((_, i) => i + 1));
  for (const r of list.filter((x) => x.kind === 'rival')) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.z), `${r.name} has a place on the road`);
  }
});

test('the grid has a limit, and a race that has started does not take latecomers', () => {
  let now = 9_000_000;
  const race = createGP({ classCode: 'a', now });
  for (let i = 0; i < MAX_RACERS; i += 1) {
    assert.equal(joinGP(race, { id: `k${i}`, name: `k${i}` }, now).ok, true);
  }
  assert.equal(joinGP(race, { id: 'late', name: 'late' }, now).reason, 'grid full');
  leaveGP(race, 'k0');
  assert.equal(joinGP(race, { id: 'late', name: 'late' }, now).ok, true);
  now = run(race, (GRID_MS + LIGHTS_MS) / 1000 + 1, now);
  assert.equal(joinGP(race, { id: 'later', name: 'later' }, now).reason, 'race already started');
});

test('the prize follows the finishing order and stops at the daily cap', () => {
  const first = prizeFor({ place: 1, laps: 3, items: 2 });
  const sixth = prizeFor({ place: 6, laps: 3, items: 0 });
  assert.ok(first.coins > sixth.coins, `1st ${first.coins}, 6th ${sixth.coins}`);
  assert.ok(sixth.coins > 0, 'and last still gets something for finishing');
  assert.ok(first.xp > sixth.xp);
  const capped = prizeFor({ place: 1, laps: 3, items: 0, spentToday: DAILY_CAP - 5 });
  assert.equal(capped.coins, 5);
  assert.equal(capped.capped, true);
  assert.equal(prizeFor({ place: 1, laps: 3, items: 0, spentToday: DAILY_CAP }).coins, 0);
});

test('the circuit the room judges on is the circuit the page builds', () => {
  // Not a deep comparison — the point is that both sides read the same file, so if the
  // client's copy were ever swapped for a shorter one this would notice.
  assert.ok(TRACK.length > 500);
  assert.equal(TRACK.checkpoints.length, TRACK.def.checkpoints);
  assert.ok(TRACK.grid.length >= MAX_RACERS - 1 || TRACK.grid.length >= 8);
});
