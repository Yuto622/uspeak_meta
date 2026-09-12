// カート — how a kart drives, and why it feels different from walking.
//
// Everywhere else on these islands a child walks: press a direction, move that way, stop
// when you let go. A kart does not do that, and the difference is the whole point of the
// island. Here W is a throttle, A and D turn the kart rather than sliding it sideways,
// there is speed to lose and to keep, the grass is slow, and a drift held round a corner
// pays a boost when it is released.
//
// Nothing here decides anything a child is paid for. Checkpoints, laps, places and prizes
// are the server's; this is the feel of the thing between them.

// A kart's numbers. Multiplied by the vehicle's own speed, so a hoverboard is quicker
// everywhere rather than only in a straight line.
export const KART = {
  accel: 15,             // how hard the throttle bites, in units per second squared
  brake: 22,
  top: 15.5,             // flat out on tarmac
  reverse: -4.2,
  drag: 1.9,             // what a coasting kart loses per second
  offRoad: 0.42,         // the grass, as a fraction of top speed
  offRoadDrag: 7.5,
  turn: 2.05,            // radians per second at speed
  driftTurn: 3.1,        // a drift turns harder, which is what it is for
  driftSlip: 0.28,       // and slides, which is what it looks like
  minTurnSpeed: 1.2,     // a stationary kart does not spin on the spot
  boostTop: 24,          // what a boost lets a kart reach
  boostAccel: 46,
  boostMs: 1500,         // a mini-turbo
  padMs: 1900,           // a boost pad on the road
  itemMs: 2400,          // the dash from answering an item box
  chargeMs: [900, 1900], // how long a drift has to be held for one boost, and for two
};

// The state a kart carries between frames. One per child; the rivals are drawn from the
// server's standings rather than driven here.
export const createKart = () => ({
  speed: 0,
  heading: 0,          // where the kart points, in radians
  slip: 0,             // how far the body is turned out of the direction of travel
  drift: 0,            // how long the drift key has been held, in ms
  driftWay: 0,         // which way the drift is going
  boostUntil: 0,
  boostLevel: 0,       // 1 = mini-turbo, 2 = the long one, 3 = an item dash
  onRoad: true,
  sparks: 0,           // 0, 1 or 2: what the drift has charged so far
});

// Is this point on the tarmac? The road is the closed ring through the checkpoints, so the
// same list the server judges laps by also decides where the grass starts. A kart that
// cuts the corner is not cheating the lap — the checkpoints see to that — it is just slow.
export function onRoad(course, x, z) {
  const gates = course?.gates || [];
  if (gates.length < 3) return true;
  const half = (course.road?.width || 9) / 2;
  for (let i = 0; i < gates.length; i += 1) {
    const a = gates[i];
    const b = gates[(i + 1) % gates.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / len2));
    if (Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)) <= half) return true;
  }
  return false;
}

// One frame of driving. `keys` is the same Set the walking code reads, `blocked` the same
// collision test, and the kart is moved in place — so a race changes how the island is
// driven without changing anything about how it is drawn.
export function driveKart(kart, {
  dt, keys, player, blocked, course, speed = 1, now = performance.now(), locked = false,
}) {
  const throttle = !locked && (keys.has('w') || keys.has('arrowup'));
  const braking = !locked && (keys.has('s') || keys.has('arrowdown'));
  const left = !locked && (keys.has('a') || keys.has('arrowleft'));
  const right = !locked && (keys.has('d') || keys.has('arrowright'));
  const drifting = !locked && keys.has(' ') && kart.speed > 4;

  const boosting = now < kart.boostUntil;
  const top = (boosting ? KART.boostTop : KART.top) * speed * (kart.onRoad ? 1 : KART.offRoad);
  const accel = (boosting ? KART.boostAccel : KART.accel) * speed;

  // The throttle accelerates up to the ceiling and never past it. A kart already above the
  // ceiling — a boost that has just ended, or a kart that has run onto the grass — keeps
  // what it has and bleeds it off below, rather than stopping dead: that bleed is what
  // makes a boost feel like a boost and the grass feel like grass.
  if (throttle) kart.speed = kart.speed > top ? kart.speed : Math.min(kart.speed + accel * dt, top);
  else if (braking) kart.speed -= KART.brake * dt;
  else kart.speed -= Math.sign(kart.speed) * KART.drag * dt * (kart.onRoad ? 1 : KART.offRoadDrag);
  if (kart.speed > top) kart.speed = Math.max(top, kart.speed - (kart.onRoad ? 8 : 26) * dt);
  kart.speed = Math.max(KART.reverse * speed, kart.speed);
  if (!throttle && !braking && Math.abs(kart.speed) < 0.25) kart.speed = 0;

  // Steering, which only works when the kart is moving — and harder in a drift.
  const way = (left ? 1 : 0) - (right ? 1 : 0);
  const grip = Math.min(1, Math.abs(kart.speed) / (KART.minTurnSpeed * 4));
  const rate = drifting && kart.driftWay ? KART.driftTurn : KART.turn;
  if (way && Math.abs(kart.speed) > KART.minTurnSpeed) {
    kart.heading += way * rate * grip * dt * Math.sign(kart.speed);
  }

  // The drift: hold the key through a corner, and let go with a boost in hand. The charge
  // is what makes a corner worth taking well, which is the whole game inside the game.
  if (drifting) {
    if (!kart.driftWay && way) kart.driftWay = way;
    if (kart.driftWay) {
      kart.drift += dt * 1000;
      kart.slip += (kart.driftWay * KART.driftSlip - kart.slip) * Math.min(1, dt * 6);
      kart.sparks = kart.drift >= KART.chargeMs[1] ? 2 : kart.drift >= KART.chargeMs[0] ? 1 : 0;
    }
  } else {
    if (kart.sparks) {
      kart.boostUntil = now + KART.boostMs * kart.sparks;
      kart.boostLevel = kart.sparks;
      kart.speed = Math.max(kart.speed, KART.top * speed * 0.9);
    }
    kart.drift = 0;
    kart.driftWay = 0;
    kart.sparks = 0;
    kart.slip += (0 - kart.slip) * Math.min(1, dt * 7);
  }

  // Where that puts the kart. The body points slightly out of the direction of travel in a
  // drift, and the collision test is the island's own.
  const dir = kart.heading;
  const nx = player.position.x + Math.sin(dir) * kart.speed * dt;
  const nz = player.position.z + Math.cos(dir) * kart.speed * dt;
  let hit = false;
  if (!blocked(nx, player.position.z)) player.position.x = nx; else hit = true;
  if (!blocked(player.position.x, nz)) player.position.z = nz; else hit = true;
  if (hit) kart.speed *= 0.35;
  player.rotation.y = dir + kart.slip;
  if (!boosting) kart.boostLevel = 0;
  return { speed: kart.speed, boosting, hit };
}

// A boost, from a pad or from an answered item box. Kept here so the HUD, the pads and the
// item all mean the same thing to the kart.
export function boostKart(kart, kind = 'pad', now = performance.now()) {
  const ms = kind === 'item' ? KART.itemMs : KART.padMs;
  kart.boostUntil = Math.max(kart.boostUntil, now + ms);
  kart.boostLevel = kind === 'item' ? 3 : 2;
  kart.speed = Math.max(kart.speed, KART.top);
}

// Where a kart is put on the grid, facing down the road: the first corner is to the right,
// so the grid faces that way and a child does not start by driving into the sea.
export function placeOnGrid(kart, player, island, grid) {
  player.position.set(island.x + (grid?.x || 0), 0, island.z + (grid?.z || 0));
  kart.speed = 0;
  kart.slip = 0;
  kart.drift = 0;
  kart.sparks = 0;
  kart.boostUntil = 0;
  kart.heading = Math.PI / 2;      // +x, towards the first checkpoint
  player.rotation.y = kart.heading;
}
