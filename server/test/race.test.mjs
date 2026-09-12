// のりもの島のレース — the rules of a race, decided on the server.
//
// The page draws karts and reads a HUD. What a place is worth, who is in front, whether a
// lap was driven or claimed, and when the lights go out are all in game/race.js, and this
// is where those are held to account.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
const { COURSE } = await import('../src/game/vehicles.js');
const {
  createRace, joinRace, leaveRace, maybeStart, beginIfDue, crossCheckpoint, standings,
  raceOver, prizeFor, coursePayload, LAPS, MIN_LAP_MS, GRID_MS, COUNTDOWN_MS, MAX_RACERS,
} = await import('../src/game/race.js');

const GATES = COURSE.gates.map((g) => g.id);
// A lap driven at a believable pace, so the server's "nobody is that fast" rule is not
// what is being tested every time.
function driveLap(race, id, from) {
  let t = from;
  let last = null;
  for (const gate of GATES) {
    t += Math.ceil(MIN_LAP_MS / GATES.length) + 200;
    last = crossCheckpoint(race, id, gate, t);
  }
  return { out: last, at: t };
}

test('レース: the lights go out on the room\'s clock, not when a page says so', () => {
  const race = createRace({ now: 0 });
  assert.equal(race.phase, 'grid');
  assert.equal(maybeStart(race, GRID_MS - 1), false, 'the grid waits for the class');
  joinRace(race, { id: 'a', name: 'Aki', vehicle: 'kart' }, 0);
  assert.equal(maybeStart(race, GRID_MS - 1), false);
  assert.equal(maybeStart(race, GRID_MS + 1), true);
  assert.equal(race.phase, 'countdown');
  assert.equal(beginIfDue(race, race.startsAt - 1), false, 'three, two, one');
  assert.equal(beginIfDue(race, race.startsAt), true);
  assert.equal(race.phase, 'running');
  assert.ok(COUNTDOWN_MS >= 3000);

  // Joining after the lights is joining the next race, not this one.
  assert.deepEqual(joinRace(race, { id: 'b', name: 'Ben', vehicle: 'kick' }, race.startsAt + 10),
    { ok: false, reason: 'race already started' });
});

test('レース: a lap is every checkpoint, in order, at a possible speed', () => {
  const race = createRace({ now: 0 });
  joinRace(race, { id: 'a', name: 'Aki', vehicle: 'kart' }, 0);
  maybeStart(race, GRID_MS);
  beginIfDue(race, race.startsAt);
  const t0 = race.startedAt;

  // The third checkpoint is not the first one.
  const skipped = crossCheckpoint(race, 'a', GATES[2], t0 + 100);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.reason, 'not next');
  assert.equal(skipped.want, GATES[0]);

  // Every checkpoint crossed in a heartbeat is a claim, not a lap: the line refuses it and
  // waits, with the checkpoints behind it still counted.
  let t = t0;
  for (const gate of GATES.slice(0, -1)) { t += 50; assert.equal(crossCheckpoint(race, 'a', gate, t).ok, true); }
  const tooFast = crossCheckpoint(race, 'a', GATES[GATES.length - 1], t + 50);
  assert.equal(tooFast.ok, false);
  assert.equal(tooFast.reason, 'too fast');
  assert.equal(race.racers.get('a').lap, 0, 'and the lap has not counted');
  // Crossing the line once the lap has taken a real amount of time does count.
  const line = crossCheckpoint(race, 'a', GATES[GATES.length - 1], t0 + MIN_LAP_MS + 500);
  assert.equal(line.ok, true);
  assert.equal(line.lapDone, true);
  assert.equal(line.completed, 1, 'one lap driven');
  assert.equal(line.lap, 2, 'and the child is on the second: the HUD never says LAP 1 twice');
  assert.equal(line.laps, LAPS);
  assert.equal(line.done, false, 'one lap of three');
});

test('レース: three laps finishes, and the finish pays by place', () => {
  const race = createRace({ now: 0 });
  joinRace(race, { id: 'a', name: 'Aki', vehicle: 'kart' }, 0);
  joinRace(race, { id: 'b', name: 'Ben', vehicle: 'kick' }, 0);
  maybeStart(race, GRID_MS);
  beginIfDue(race, race.startsAt);
  let at = race.startedAt;
  let out = null;
  for (let lap = 1; lap <= LAPS; lap += 1) ({ out, at } = driveLap(race, 'a', at));
  assert.equal(out.done, true);
  assert.equal(out.place, 1, 'first to the line is first');
  let bAt = at + 1000;                       // Ben set off with the others but drove slower
  for (let lap = 1; lap <= LAPS; lap += 1) ({ out, at: bAt } = driveLap(race, 'b', bAt));
  assert.equal(out.place, 2, 'and the next one is second');

  // The prizes: a place is worth more than a place behind it, and finishing at all is
  // worth more than not.
  const first = prizeFor(1, true);
  const second = prizeFor(2, true);
  const last = prizeFor(9, true);
  const dnf = prizeFor(0, false);
  assert.ok(first.coins > second.coins && second.coins > last.coins);
  assert.ok(last.coins > dnf.coins && dnf.coins > 0, 'nobody who raced goes home with nothing');
  assert.ok(first.xp > dnf.xp);

  assert.equal(raceOver(race, bAt + 1), true, 'everyone home, race over');
});

test('レース: the running order counts the rivals, so nobody races alone', () => {
  const race = createRace({ now: 0 });
  joinRace(race, { id: 'a', name: 'Aki', vehicle: 'kick' }, 0);
  maybeStart(race, GRID_MS);
  beginIfDue(race, race.startsAt);
  const rivals = COURSE.rivals.length;

  const early = standings(race, race.startedAt + 100);
  assert.equal(early.length, 1 + rivals);
  assert.deepEqual(early.map((r) => r.place), [...Array(1 + rivals)].map((_, i) => i + 1));
  assert.equal(early.filter((r) => r.kind === 'rival').length, rivals);

  // A child who has driven a lap is ahead of a rival who has not.
  const { at } = driveLap(race, 'a', race.startedAt);
  const mid = standings(race, at);
  const me = mid.find((r) => r.id === 'a');
  assert.equal(me.lap, 2, 'on the second lap');
  assert.ok(me.progress > 0);
  // Rivals do move on their own clock: given a rival's own lap time, it has passed some.
  const later = standings(race, race.startedAt + COURSE.rivals[0].lapMs);
  assert.ok(later.find((r) => r.id === COURSE.rivals[0].id).progress >= GATES.length,
    'the quickest rival has a lap in by its own lap time');
});

test('レース: leaving is leaving, and the grid has a size', () => {
  const race = createRace({ now: 0 });
  for (let i = 0; i < MAX_RACERS + 3; i += 1) {
    const out = joinRace(race, { id: `k${i}`, name: `K${i}`, vehicle: 'kick' }, 0);
    if (i < MAX_RACERS) assert.equal(out.ok, true);
    else assert.deepEqual(out, { ok: false, reason: 'grid is full' });
  }
  assert.equal(race.racers.size, MAX_RACERS);
  leaveRace(race, 'k0');
  assert.equal(race.racers.size, MAX_RACERS - 1);
  maybeStart(race, 0);   // a full-but-one grid still waits its time
  assert.equal(race.phase, 'grid');

  // A race everyone walked out of is over rather than running for ever.
  for (const id of [...race.racers.keys()]) leaveRace(race, id);
  maybeStart(race, GRID_MS + 1);
  assert.equal(race.phase, 'grid', 'a race of nobody never starts');
});

test('レース: the page is told the circuit, and the circuit is on the road', () => {
  const payload = coursePayload();
  assert.equal(payload.laps, LAPS);
  assert.equal(payload.gates.length, COURSE.gates.length);
  assert.ok(payload.grid.length >= 2 && payload.items.length >= 3 && payload.boosts.length >= 3);
  assert.ok(payload.road.width > 4, 'wide enough for two karts');
  // Nothing in the payload says which answer opens an item box: that is asked for one box
  // at a time, and answered on the server.
  assert.ok(!JSON.stringify(payload).includes('answer'));
});
