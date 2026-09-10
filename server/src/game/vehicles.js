// のりもの島 — vehicles, and the course you drive them round.
//
// Ported from Roblox's VehicleGate. What carries over is the shape of it: each vehicle
// has its own gate somewhere on the island, and the gate only opens for a child who has
// reached the level and saved the coins. The sign turns gold when it will open, which is
// how a Roblox child learned what to aim for, and it is a better teacher than a menu.
//
// What does not carry over is the physics. Roblox handed the driver network ownership of
// a real vehicle body; here a vehicle is a speed and a shape, and the course is six
// checkpoints in a ring, each carrying an English direction word. Driving it is reading
// them in order.
import { readFileSync } from 'node:fs';

export class VehicleError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/vehicles.json', import.meta.url);

// Matches the island kit's own extents, so a gate can never be placed off the land.
const HALF_X = 30;
const HALF_Z = 25;

export function loadVehicles(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const island = raw.island;
  if (!island) throw new Error('vehicles.json: no island block');
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(island[key])) throw new Error(`vehicles.json: island is missing a numeric ${key}`);
  }

  const byId = new Map();
  let tier = 0;
  let price = 0;
  let level = 0;
  for (const v of raw.vehicles || []) {
    if (!v.id || byId.has(v.id)) throw new Error(`vehicles.json: duplicate or missing vehicle id "${v.id}"`);
    if (!v.name || !v.en || !v.word || !v.ja) throw new Error(`vehicles.json: ${v.id} is missing its wording`);
    if (!(v.speed > 1) || v.speed > 3) throw new Error(`vehicles.json: ${v.id} has an unreasonable speed`);
    if (!(v.price > 0) || !(v.level >= 1)) throw new Error(`vehicles.json: ${v.id} has no price or level`);
    // Tiers must climb together, or the island tells a child a lie about what is next.
    if (v.tier !== tier + 1) throw new Error(`vehicles.json: ${v.id} is tier ${v.tier}, expected ${tier + 1}`);
    if (v.price <= price || v.level < level) throw new Error(`vehicles.json: ${v.id} is not dearer than the tier below it`);
    tier = v.tier; price = v.price; level = v.level;
    byId.set(v.id, { ...v });
  }
  if (byId.size < 2) throw new Error('vehicles.json: an island of one vehicle is not a choice');

  const spotById = new Map();
  for (const spot of island.spots || []) {
    if (!['gate', 'start'].includes(spot.kind)) throw new Error(`vehicles.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (spotById.has(spot.id)) throw new Error(`vehicles.json: two spots called ${spot.id}`);
    if (spot.kind === 'gate' && !byId.has(spot.vehicle)) throw new Error(`vehicles.json: gate ${spot.id} sells nothing`);
    if (Math.abs(spot.x) > HALF_X || Math.abs(spot.z) > HALF_Z) throw new Error(`vehicles.json: ${spot.id} is off the island`);
    for (const other of spotById.values()) {
      if (Math.hypot(spot.x - other.x, spot.z - other.z) <= island.radius * 2) {
        throw new Error(`vehicles.json: ${spot.id} and ${other.id} can be stood at together`);
      }
    }
    spotById.set(spot.id, { ...spot, wx: island.x + spot.x, wz: island.z + spot.z });
  }
  for (const v of byId.values()) {
    if (![...spotById.values()].some((s) => s.vehicle === v.id)) throw new Error(`vehicles.json: ${v.id} has no gate to buy it at`);
  }
  const start = [...spotById.values()].find((s) => s.kind === 'start');
  if (!start) throw new Error('vehicles.json: the course has no start line');

  const course = raw.course || {};
  if (!(course.reach > 0)) throw new Error('vehicles.json: the course needs a reach');
  if (!(course.dailyCap > 0)) throw new Error('vehicles.json: the course needs a daily cap');
  const gates = [];
  for (const g of course.gates || []) {
    if (!g.id || gates.some((o) => o.id === g.id)) throw new Error(`vehicles.json: duplicate checkpoint "${g.id}"`);
    if (!g.word || !g.ja) throw new Error(`vehicles.json: checkpoint ${g.id} carries no word`);
    if (g.order !== gates.length + 1) throw new Error(`vehicles.json: checkpoint ${g.id} is out of order`);
    if (Math.abs(g.x) > HALF_X || Math.abs(g.z) > HALF_Z) throw new Error(`vehicles.json: checkpoint ${g.id} is off the island`);
    // Two checkpoints within one reach of each other could be crossed together, and the
    // lap would count a corner nobody drove.
    for (const other of gates) {
      if (Math.hypot(g.x - other.x, g.z - other.z) <= course.reach * 2) {
        throw new Error(`vehicles.json: checkpoints ${g.id} and ${other.id} overlap`);
      }
    }
    gates.push({ ...g, wx: island.x + g.x, wz: island.z + g.z });
  }
  if (gates.length < 3) throw new Error('vehicles.json: a course needs at least three checkpoints');

  return {
    island: { ...island, spotById, start },
    vehicles: byId,
    order: [...byId.keys()],
    course: { ...course, gates, gateById: new Map(gates.map((g) => [g.id, g])) },
  };
}

export const RIDE = loadVehicles();
export const ISLAND = RIDE.island;
export const COURSE = RIDE.course;
export const COURSE_CAP = COURSE.dailyCap;

// What the client is told about a vehicle. Prices and levels are not secrets — a child
// should be able to see what to save for — but owning one is the server's to say.
export const vehiclePayload = (v, { owned = false, riding = false, level = 1, coins = 0 } = {}) => ({
  id: v.id, name: v.name, en: v.en, word: v.word, ja: v.ja, tier: v.tier,
  level: v.level, price: v.price, speed: v.speed, color: v.color,
  owned, riding,
  // Roblox turned the sign gold the moment a gate would open. Same idea, same purpose:
  // it says "this one is yours next" without anyone having to explain it.
  ready: owned || (level >= v.level && coins >= v.price),
  needLevel: Math.max(0, v.level - level),
  needCoins: Math.max(0, v.price - coins),
});

export function sanitizeGarage(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const owned = [];
  for (const id of list) {
    if (typeof id === 'string' && RIDE.vehicles.has(id) && !owned.includes(id)) owned.push(id);
  }
  return owned;
}

// A vehicle nobody bought is not a vehicle anyone is riding.
export const sanitizeRiding = (id, owned) => (typeof id === 'string' && owned.includes(id) ? id : '');

export const speedOf = (id) => RIDE.vehicles.get(id)?.speed || 1;

// ---- the course ------------------------------------------------------------------

export function startLap(now = Date.now()) {
  return { at: now, next: 0, gates: [] };
}

export const nextGate = (lap) => (lap ? COURSE.gates[lap.next] || null : COURSE.gates[0]);

// Crossing a checkpoint. Out of order is not a mistake worth a scolding — it just is not
// the next one, and the lap carries on waiting for the right one.
export function crossGate(lap, id, now = Date.now()) {
  const want = COURSE.gates[lap.next];
  if (!want || want.id !== id) return { ok: false, reason: 'not next', want };
  lap.gates.push({ id, at: now });
  lap.next += 1;
  const done = lap.next >= COURSE.gates.length;
  return { ok: true, done, want: COURSE.gates[lap.next] || null, ms: now - lap.at };
}
