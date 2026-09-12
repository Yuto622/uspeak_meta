// のりもの島のレース — a real race, decided here.
//
// What used to be on this island was a time trial: drive through six words, get a clock.
// This is a race: a grid, a countdown, three laps of a circuit, rivals to beat, a running
// order, and a finishing order that pays.
//
// Everything a child could get wrong on the wire is decided in this file and nowhere else:
// which checkpoint is next, whether a lap was possible in the time claimed, who is in
// front, and what a place is worth. A page can send "I crossed the finish line" as often
// as it likes; a lap only counts when every checkpoint before it was crossed, in order,
// in a plausible time. The page's job is to say where the kart is — the room already
// checks that against the player's own position.
//
// The rivals are here too, for the child who is alone on the island: they are not karts
// anywhere, they are a target lap time advancing on the room's tick, and they appear in
// the same standings as everyone else. A page cannot make them slower.
import { COURSE, RIDE } from './vehicles.js';

export const LAPS = COURSE.laps || 3;
export const MIN_LAP_MS = COURSE.minLapMs || 9000;
export const GRID_MS = 12000;        // how long the grid waits for the class to gather
export const COUNTDOWN_MS = 3200;    // 3 · 2 · 1 · GO
export const RACE_MAX_MS = 6 * 60 * 1000;   // a race nobody finishes still has to end
export const MAX_RACERS = 12;

const GATES = COURSE.gates;
const LAST = GATES.length;

// Where a racer is, as one number: laps × checkpoints + checkpoints crossed. Two racers on
// the same number are separated by who got there first, which is what a photo finish is.
const progressOf = (r) => r.lap * LAST + r.next;

// A rival's progress at a moment, from its target lap time. Rivals do not drive; they are
// a promise about when they will pass each checkpoint, and the page draws them along the
// road between those points.
function rivalProgress(rival, elapsedMs) {
  const perGate = rival.lapMs / LAST;
  const crossed = Math.max(0, Math.floor(elapsedMs / perGate));
  return Math.min(crossed, LAPS * LAST);
}

export function createRace({ classCode = '', now = Date.now() } = {}) {
  return {
    classCode,
    phase: 'grid',          // grid → countdown → running → done
    openedAt: now,
    startsAt: 0,
    startedAt: 0,
    endedAt: 0,
    racers: new Map(),      // sessionId -> racer
    rivals: (COURSE.rivals || []).map((r) => ({ ...r, kind: 'rival', progress: 0, finishedAt: 0 })),
    finished: [],           // sessionIds in the order they crossed the line
  };
}

export function joinRace(race, { id, name, vehicle, speed = 1 }, now = Date.now()) {
  if (race.phase !== 'grid') return { ok: false, reason: 'race already started' };
  if (race.racers.size >= MAX_RACERS) return { ok: false, reason: 'grid is full' };
  if (!race.racers.has(id)) {
    race.racers.set(id, {
      id, name, vehicle, speed, kind: 'child',
      lap: 0, next: 0, lapStartedAt: 0, laps: [], best: 0,
      boosts: 0, items: 0, item: null,
      place: 0, finishedAt: 0, at: now,
    });
  }
  return { ok: true, racer: race.racers.get(id) };
}

export const leaveRace = (race, id) => race.racers.delete(id);

// The lights. A race starts when the grid time is up, or as soon as the grid is full.
export function maybeStart(race, now = Date.now()) {
  if (race.phase !== 'grid') return false;
  const full = race.racers.size >= MAX_RACERS;
  if (!full && now - race.openedAt < GRID_MS) return false;
  if (!race.racers.size) return false;
  race.phase = 'countdown';
  race.startsAt = now + COUNTDOWN_MS;
  return true;
}

export function beginIfDue(race, now = Date.now()) {
  if (race.phase !== 'countdown' || now < race.startsAt) return false;
  race.phase = 'running';
  race.startedAt = now;
  for (const r of race.racers.values()) r.lapStartedAt = now;
  return true;
}

// A checkpoint, crossed. The room has already checked that the child is standing there;
// what is checked here is that it is the right one, and that the lap it completes was not
// driven faster than the circuit allows.
export function crossCheckpoint(race, id, gateId, now = Date.now()) {
  const racer = race.racers.get(id);
  if (!racer) return { ok: false, reason: 'not racing' };
  if (race.phase !== 'running') return { ok: false, reason: 'not started' };
  if (racer.finishedAt) return { ok: false, reason: 'finished' };
  const want = GATES[racer.next];
  if (!want || want.id !== gateId) return { ok: false, reason: 'not next', want: want?.id || '' };

  racer.next += 1;
  if (racer.next < LAST) {
    return { ok: true, next: GATES[racer.next].id, lap: racer.lap + 1, completed: racer.lap, laps: LAPS };
  }
  // The line. A lap that arrives too soon is not a lap: something crossed the checkpoints
  // without driving between them.
  const lapMs = now - (racer.lapStartedAt || race.startedAt);
  if (lapMs < MIN_LAP_MS) {
    racer.next = LAST - 1;      // stay on the line, waiting for a lap that was driven
    return { ok: false, reason: 'too fast', lapMs };
  }
  racer.next = 0;
  racer.lap += 1;
  racer.laps.push(lapMs);
  racer.lapStartedAt = now;
  if (!racer.best || lapMs < racer.best) racer.best = lapMs;
  const done = racer.lap >= LAPS;
  if (done) {
    racer.finishedAt = now;
    race.finished.push(id);
    racer.place = placeOf(race, racer, now);
  }
  // `lap` is always the lap the child is on now, so the HUD never says LAP 1 to a child
  // driving their second; `completed` is the one just driven, which is what the banner and
  // the lap time are about.
  return {
    ok: true, lapDone: true, lapMs, lap: Math.min(racer.lap + 1, LAPS), completed: racer.lap,
    laps: LAPS, done, place: racer.place, next: GATES[0].id,
  };
}

// Where a racer came, counting the rivals they beat as well as the children.
function placeOf(race, racer, now) {
  const ahead = [...race.racers.values()].filter((r) => r !== racer && r.finishedAt && r.finishedAt <= now).length
    + race.rivals.filter((r) => r.finishedAt && r.finishedAt <= now).length;
  return ahead + 1;
}

// The running order, for the corner of the screen. Rivals are advanced here rather than on
// a timer of their own, so a paused room does not leave them driving.
export function standings(race, now = Date.now()) {
  if (race.phase === 'running') {
    const elapsed = now - race.startedAt;
    for (const rival of race.rivals) {
      const p = rivalProgress(rival, elapsed);
      rival.progress = p;
      if (p >= LAPS * LAST && !rival.finishedAt) rival.finishedAt = now;
    }
  }
  const rows = [
    ...[...race.racers.values()].map((r) => ({
      id: r.id, name: r.name, kind: 'child', vehicle: r.vehicle,
      lap: Math.min(r.lap + 1, LAPS), progress: progressOf(r), finishedAt: r.finishedAt, best: r.best,
    })),
    ...race.rivals.map((r) => ({
      id: r.id, name: r.name, kind: 'rival', colour: r.colour,
      lap: Math.min(Math.floor(r.progress / LAST) + 1, LAPS), progress: r.progress, finishedAt: r.finishedAt, best: 0,
    })),
  ];
  rows.sort((a, b) => {
    if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
    if (a.finishedAt) return -1;
    if (b.finishedAt) return 1;
    return b.progress - a.progress;
  });
  rows.forEach((row, i) => { row.place = i + 1; });
  return rows;
}

// Over when every child has finished, or when the clock runs out on the ones who have not.
export function raceOver(race, now = Date.now()) {
  if (race.phase !== 'running') return false;
  const racers = [...race.racers.values()];
  if (!racers.length) return true;
  if (racers.every((r) => r.finishedAt)) return true;
  return now - race.startedAt > RACE_MAX_MS;
}

// What a place is worth. Everyone who started is paid something: a child who came last in
// their first race should still have driven three laps of English for a reason.
export function prizeFor(place, finished) {
  const table = COURSE.reward?.place || [];
  const rest = COURSE.reward?.rest || { coins: 0, xp: 0 };
  if (!finished) return { coins: Math.floor((rest.coins || 0) / 2), xp: Math.floor((rest.xp || 0) / 2) };
  return table[place - 1] || rest;
}

export const itemXp = () => COURSE.reward?.item?.xp || 0;

// What the page is told when the grid opens: the circuit itself. None of it is secret —
// the island is drawn from the same file — and having it in the message means a page that
// joined late still knows where the boxes are.
export const coursePayload = () => ({
  laps: LAPS,
  reach: COURSE.reach,
  road: COURSE.road,
  gates: GATES.map((g) => ({ id: g.id, word: g.word, ja: g.ja, order: g.order, x: g.x, z: g.z })),
  grid: COURSE.grid || [],
  boosts: COURSE.boosts || [],
  items: COURSE.items || [],
  island: { id: RIDE.island.id, x: RIDE.island.x, z: RIDE.island.z },
});
