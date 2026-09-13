// U-SPEAK GRAND PRIX — the race, decided here.
//
// The kart game runs in the child's browser because that is the only place a kart can feel
// like a kart: sixty frames a second of steering with no network in between. Everything
// that a page must not be allowed to decide for itself is decided in this file.
//
//   **The rivals are the room's.** They are not five bots in each child's tab agreeing to
//   differ; the room drives them, with the same handling model and the same racing-line
//   code the page uses, and broadcasts where they are. Every child in the class is racing
//   the same ミドリ, in the same place on the road, and no page can slow her down.
//
//   **A lap is a lap.** Checkpoints count only in order, only once, only if the position
//   claimed with them is actually near that checkpoint, and only if the time since the
//   last one was possible at a kart's top speed. A page that reports the finish line
//   sixteen times gets one lap.
//
//   **The prizes are the room's**, from the finishing order the room worked out, inside a
//   daily cap. This is what a parent's report is built from.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracksFrom } from '../../../client/dist/kart-track-data.js';
import { createKart, gridKart, advance, KART } from '../../../client/dist/kart-drive.js';
import { createDriver, driveAI, rubberFor, maybeSlip } from '../../../client/dist/kart-ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, '../../../client/dist');

// The circuits, from the same file the page builds its scenery out of.
export const TRACKS = tracksFrom(JSON.parse(readFileSync(path.join(CLIENT, 'tracks.json'), 'utf8'))).tracks;
export const TRACK = TRACKS[0];

// The rivals of the grand prix. The same five the page draws, because the page is told
// where they are rather than deciding.
export const RIVALS = [
  // A field, not a wall. Three laps of this circuit take about 99 seconds flat out with no
  // boosts, so the front of the grid has to be a little slower than that or no child could
  // ever win however well they drove — ミドリ was lapping in 31 and then in 33, and both
  // times she was a wall. She now takes about 103. Just as important is the back: クモ
  // takes about 151, which is a pace a child still learning to hold a line can beat, so
  // finishing sixth of six is something you have to drive badly to do rather than the
  // ordinary result of being seven years old. In between the field is spread wide on
  // purpose — a child should be able to see, every race, which rival they are racing.
  //
  // Below 0.9 skill a driver stops drifting (kart-ai.js), so ホシ and クモ are visibly
  // driving a different way round the corners, not just a slower version of the same way.
  { id: 'ai-midori', name: 'ミドリ', skill: 1.0, power: 0.96, style: -0.6, colour: 0x7bc86c },
  { id: 'ai-sora', name: 'ソラ', skill: 0.95, power: 0.9, style: 0, colour: 0x4fa8e0 },
  { id: 'ai-momo', name: 'モモ', skill: 0.91, power: 0.85, style: 0.5, colour: 0xef6f8a },
  { id: 'ai-hoshi', name: 'ホシ', skill: 0.82, power: 0.77, style: -0.3, colour: 0xffd166 },
  { id: 'ai-kumo', name: 'クモ', skill: 0.72, power: 0.66, style: 0.8, colour: 0xb08ae0 },
];

export const GRID_MS = 9000;          // how long the grid waits for the class to gather
export const LIGHTS_MS = 4200;        // and how long the lights take after that
export const MAX_RACERS = 12;
// The room drives the rivals and tells the pages where they are. Ten a second is the rate
// the room patches everything else at, and one packet of slack is what the page's 100 ms
// interpolation is built on — see net-config.js. Slower than this and ミドリ teleports.
export const GP_TICK_MS = 100;
// How often a rival looks at the road, however often the room gets round to calling in.
// Thirty times a second is a driver; once a tick is a passenger.
const AI_STEP = 1 / 30;
export const RACE_MAX_MS = 7 * 60 * 1000;
export const DAILY_CAP = 240;         // coins a child can win from racing in a day
// The prize, by where they finished. Everybody who finishes is paid something: a child who
// came sixth still drove three laps and answered the boxes on the way round.
export const PRIZE = [0, 60, 45, 34, 26, 20, 16, 14, 12, 10, 9, 8, 7];
export const XP_PLACE = [0, 30, 25, 21, 18, 16, 14, 13, 12, 11, 10, 9, 8];
export const XP_LAP = 6;
export const XP_ITEM = 4;

const CP_REACH = 26;                  // metres a claim may be from its checkpoint
export const ITEM_REACH = 22;         // …and from an item box
export const ITEM_COOLDOWN_MS = 1200; // no kart drives through two boxes faster than this
// The quickest a kart can cover ground, with every boost in the game running at once, plus
// a margin. Anything faster than this between two checkpoints did not happen.
const MAX_SPEED = KART.boostTop * 1.3;

export function createGP({ classCode = '', trackId = TRACK.id, now = Date.now() } = {}) {
  const track = TRACKS.find((t) => t.id === trackId) || TRACK;
  const race = {
    classCode,
    track,
    phase: 'grid',        // grid → lights → running → done
    openedAt: now,
    startsAt: 0,
    startedAt: 0,
    endedAt: 0,
    tickedAt: now,
    laps: track.laps,
    racers: new Map(),
    rivals: [],
    finished: [],         // ids in the order they took the flag
  };
  // The rivals start on the back of the grid, so a class of two is still a race of seven.
  RIVALS.forEach((r, i) => {
    const kart = createKart({ power: r.power });
    gridKart(kart, track.grid[Math.min(track.grid.length - 1, 6 + i)]);
    kart.s = track.project(kart.x, kart.z).s;
    race.rivals.push({
      ...r, kind: 'rival', driver: createDriver(r), kart, cp: 0, lap: 0, finished: 0,
    });
  });
  return race;
}

export function joinGP(race, { id, name, power = 1 }, now = Date.now()) {
  if (race.phase !== 'grid') return { ok: false, reason: 'race already started' };
  if (race.racers.size >= MAX_RACERS) return { ok: false, reason: 'grid full' };
  if (!race.racers.has(id)) {
    const slot = race.track.grid[Math.min(race.racers.size, race.track.grid.length - 1)];
    race.racers.set(id, {
      id, name, kind: 'child', power,
      grid: race.racers.size + 1,
      cp: 0, lap: 0, finished: 0, items: 0, best: 0, lastCpAt: 0, lastItemAt: 0,
      boxes: new Set(),   // "lap:box" — a box is worth one question per lap, not one per frame
      s: race.track.project(slot.x, slot.z).s,
      joinedAt: now,
    });
  }
  return { ok: true, racer: race.racers.get(id), grid: race.track.grid[race.racers.get(id).grid - 1] };
}

export function leaveGP(race, id) {
  race.racers.delete(id);
}

// Where everybody is, as one number, so a running order is a sort.
const cpCount = (race) => race.track.checkpoints.length;
const progressOf = (race, r) => r.lap * cpCount(race) + (r.cp % cpCount(race) || (r.cp && r.cp % cpCount(race) === 0 ? 0 : r.cp % cpCount(race)));
const rawProgress = (r) => r.cp;

// The room's clock. Rivals drive, the lights go out, and a race that nobody finishes ends
// anyway. dt is in seconds.
export function tickGP(race, now = Date.now()) {
  // Two seconds of catching up, sub-stepped. A room that missed a beat — a slow tick, a
  // garbage collection — must not leave the rivals standing still while the class drives
  // on; and a jump bigger than this is a room that stopped, where quietly losing a second
  // of rival progress is better than teleporting five karts down the road.
  const dt = Math.min(2, Math.max(0, (now - race.tickedAt) / 1000));
  race.tickedAt = now;
  if (race.phase === 'grid') {
    if (race.racers.size && now - race.openedAt >= GRID_MS) {
      race.phase = 'lights';
      race.startsAt = now + LIGHTS_MS;
    }
    return;
  }
  if (race.phase === 'lights') {
    if (now >= race.startsAt) { race.phase = 'running'; race.startedAt = now; }
    return;
  }
  if (race.phase !== 'running') return;

  // The rivals: the child's own physics, the child's own racing line, on the room's clock.
  //
  // Sub-stepped, and not only for the physics. A driver who looks at the road once and
  // then holds that steering for the whole of dt is driving blind, and how blind depends
  // on how often the room happens to tick — which is not a thing a race is allowed to
  // depend on. It cost a whole e2e run to find: the room's tick turned out to be once a
  // second (Colyseus only advances room.clock inside the simulation interval), the rivals
  // steered once a second at twenty-five metres a second, and five karts that lap in a
  // hundred seconds spent two and a half minutes not finishing their first lap.
  const leader = Math.max(0, ...[...race.racers.values()].map((r) => r.cp));
  let left = dt;
  let t = now - dt * 1000;
  while (left > 1e-6) {
    const slice = Math.min(AI_STEP, left);
    t += slice * 1000;
    left -= slice;
    for (const r of race.rivals) {
      if (r.finished) continue;
      maybeSlip(r.driver, t);
      const gap = (leader - r.cp) * (race.track.length / cpCount(race));
      const hands = driveAI(r.driver, r.kart, { track: race.track, now: t, rubber: rubberFor(gap) });
      advance(r.kart, { seconds: slice, input: hands, track: race.track, now: t, cap: AI_STEP });
      // Checkpoints, the same way a child's are counted.
      const next = race.track.checkpoints[r.cp % cpCount(race)];
      const along = ((r.kart.s - next.s) + race.track.length) % race.track.length;
      if (along < race.track.length * 0.25) {
        r.cp += 1;
        if (r.cp % cpCount(race) === 0) {
          r.lap += 1;
          if (r.lap >= race.laps) { r.finished = t; race.finished.push(r.id); }
        }
      }
    }
  }
  if (now - race.startedAt > RACE_MAX_MS) race.phase = 'done';
  const everyone = [...race.racers.values()];
  if (everyone.length && everyone.every((r) => r.finished)) race.phase = 'done';
}

// A child says they passed a checkpoint, and says where they were when they did. Both have
// to be true, and the clock has to allow it.
export function claimCp(race, id, { cp, s }, now = Date.now()) {
  const r = race.racers.get(id);
  if (!r) return { ok: false, reason: 'not racing' };
  if (race.phase !== 'running') return { ok: false, reason: 'not started' };
  if (r.finished) return { ok: false, reason: 'finished' };
  const n = cpCount(race);
  // Only the next one, only once. Out of order is not an error a child can see — they are
  // simply still driving towards the one they missed.
  if (cp !== r.cp + 1) return { ok: false, reason: 'not next', want: r.cp + 1 };
  const gate = race.track.checkpoints[r.cp % n];
  const where = Number.isFinite(s) ? ((s % race.track.length) + race.track.length) % race.track.length : null;
  if (where === null) return { ok: false, reason: 'no position' };
  const off = Math.min(Math.abs(where - gate.s), race.track.length - Math.abs(where - gate.s));
  if (off > CP_REACH) return { ok: false, reason: 'too far', off: Math.round(off) };
  // Fast enough to be a kart, not fast enough to be a page. The room knows how long ago the
  // last checkpoint was and how far apart they are.
  //
  // This once read `if (seconds > 0.05 && …)`, meaning to avoid dividing by nothing — and
  // so waved through every claim made inside fifty milliseconds of the last, which is
  // precisely the cheat it exists to stop. A gap takes a minimum time; less than that
  // did not happen, however small the number.
  if (r.lastCpAt) {
    const seconds = (now - r.lastCpAt) / 1000;
    const gap = race.track.length / n;
    if (seconds < gap / MAX_SPEED) return { ok: false, reason: 'too fast', want: r.cp + 1 };
  }
  r.lastCpAt = now;
  r.cp += 1;
  r.s = where;
  const done = r.cp % n === 0;
  if (done) {
    r.lap += 1;
    const lapMs = r.lapAt ? now - r.lapAt : now - race.startedAt;
    r.lapAt = now;
    if (!r.best || lapMs < r.best) r.best = lapMs;
    if (r.lap >= race.laps) {
      r.finished = now;
      race.finished.push(id);
      return { ok: true, lap: r.lap, lapMs, finished: true, place: placeOf(race, id) };
    }
    return { ok: true, lap: r.lap, lapMs, next: r.cp % n };
  }
  return { ok: true, next: r.cp % n };
}

// The running order: whoever has passed the most checkpoints, and among equals whoever got
// there first. A racer who has finished is ahead of everyone still going round.
export function standings(race) {
  const all = [
    ...[...race.racers.values()].map((r) => ({
      id: r.id, name: r.name, kind: 'child', progress: r.cp, lap: r.lap, finished: r.finished,
    })),
    ...race.rivals.map((r) => ({
      id: r.id, name: r.name, kind: 'rival', colour: r.colour, progress: r.cp, lap: r.lap,
      finished: r.finished,
      // Where the page should draw them, in the track's own coordinates.
      x: Math.round(r.kart.x * 10) / 10,
      z: Math.round(r.kart.z * 10) / 10,
      y: Math.round(r.kart.y * 10) / 10,
      h: Math.round(r.kart.heading * 100) / 100,
      slip: Math.round(r.kart.slip * 100) / 100,
      boost: r.kart.boostUntil > Date.now() ? 1 : 0,
    })),
  ];
  all.sort((a, b) => {
    if (a.finished && b.finished) return a.finished - b.finished;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  return all.map((r, i) => ({ ...r, place: i + 1 }));
}

export function placeOf(race, id) {
  const row = standings(race).find((r) => r.id === id);
  return row ? row.place : 0;
}

// A child says they drove through an item box. The room cannot see the kart, so what it
// checks is the same three things it checks for a checkpoint: that the box exists, that the
// position sent with the claim is actually at it, and that the clock allows it. On top of
// that a box pays once per lap — a page that reports the same box sixty times a second gets
// one question, and a lap has fourteen boxes on it, not fourteen thousand.
export function claimItem(race, id, { box, s }, now = Date.now()) {
  const r = race.racers.get(id);
  if (!r) return { ok: false, reason: 'not racing' };
  if (race.phase !== 'running') return { ok: false, reason: 'not started' };
  if (r.finished) return { ok: false, reason: 'finished' };
  const it = race.track.items.find((x) => x.id === String(box));
  if (!it) return { ok: false, reason: 'no such box' };
  const where = Number.isFinite(s) ? ((s % race.track.length) + race.track.length) % race.track.length : null;
  if (where === null) return { ok: false, reason: 'no position' };
  const off = Math.min(Math.abs(where - it.s), race.track.length - Math.abs(where - it.s));
  if (off > ITEM_REACH) return { ok: false, reason: 'too far', off: Math.round(off) };
  if (now - r.lastItemAt < ITEM_COOLDOWN_MS) return { ok: false, reason: 'too fast' };
  const key = `${r.lap}:${it.id}`;
  if (r.boxes.has(key)) return { ok: false, reason: 'already' };
  r.boxes.add(key);
  r.lastItemAt = now;
  return { ok: true, box: it.id };
}

// What a finish is worth. Inside the day's cap, which is the room's to enforce.
export function prizeFor({ place, laps, items, spentToday = 0, cap = DAILY_CAP }) {
  const coins = PRIZE[Math.min(place, PRIZE.length - 1)] || 0;
  const room = Math.max(0, cap - spentToday);
  const paid = Math.min(coins, room);
  const xp = (XP_PLACE[Math.min(place, XP_PLACE.length - 1)] || 0) + laps * XP_LAP + items * XP_ITEM;
  return { coins: paid, xp, capped: paid < coins };
}

// What the page needs to build the race: which circuit, how many laps, where to line up.
export function gpPayload(race, racer) {
  return {
    track: race.track.id,
    laps: race.laps,
    grid: racer ? racer.grid : 1,
    checkpoints: cpCount(race),
    opensIn: Math.max(0, GRID_MS - (Date.now() - race.openedAt)),
  };
}

export function raceOverGP(race, now = Date.now()) {
  return race.phase === 'done' || now - race.openedAt > RACE_MAX_MS + GRID_MS;
}
