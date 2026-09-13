// カートの走り — the handling, and nothing else.
//
// This is the part a child feels. Everything in the genre that makes a kart a kart rather
// than a car lives here: the kart turns by pointing itself and dragging its momentum round
// after it, a corner taken on the brakes is slower than a corner taken on a drift, and a
// drift held to the end of the corner pays a boost. Get this wrong and no amount of
// scenery makes it a racing game.
//
// Two rules the rest of the code depends on:
//
//   1. **A fixed step.** step() is called with the same dt every time (1/120s) and the
//      caller sub-steps to catch up. A kart that behaves differently at 30fps and 120fps
//      is a kart that is unfair on the school's older iPads, and a lap time that depends
//      on the frame rate is not a lap time.
//   2. **No screen and no scene.** It takes numbers and the track's maths, and returns
//      numbers and a list of what happened. That is why a whole race can be driven in a
//      test in a few milliseconds, and why the rival drivers can use the very same code as
//      the child rather than a cheap imitation of it.

export const KART = {
  // Straight line. Top speed is in metres a second: 26 is about 94km/h at this scale, and
  // the circuit's straights are long enough to reach it.
  top: 26,
  accel: 26,             // m/s² at a standstill, tapering off near the top
  brake: 42,
  reverseTop: -7,
  drag: 3.2,             // what a coasting kart loses per second
  engineBrake: 7,        // and what it loses off the throttle while still in gear

  // Turning. A kart barely turns standing still and turns best at speed, which is what
  // makes the corner entry a decision rather than a formality.
  steer: 2.35,           // radians a second at full lock
  steerLowSpeed: 6,      // m/s below which the steering fades out
  driftSteer: 3.45,
  driftBias: 0.42,       // how far into the corner a drift keeps pointing
  grip: 7.5,             // how fast the direction of travel catches the way the kart faces
  driftGrip: 2.6,        // …and how much it does not, in a drift

  // The drift. Three charges, the way the genre has done it for twenty years, because a
  // child who has played one of those knows what the sparks mean without being told.
  driftMin: 3.5,         // m/s below which a drift will not start
  charge: [700, 1500, 2600],   // ms held for a blue, an orange, a purple
  boostMs: [520, 900, 1350],   // and what each one pays
  boostTop: 34,
  boostAccel: 60,
  padMs: 1200,           // a boost pad
  itemMs: 1800,          // an item box answered right

  // Off the road, and into the wall.
  grassTop: 0.44,        // fraction of top speed the grass allows
  grassDrag: 9,
  wallBounce: 0.42,      // how much speed survives a wall
  wallPush: 0.7,         // and how far out of it the kart is put

  // Air. The ramp throws the kart up; gravity brings it back; a landing lined up with the
  // road pays a small boost, which is the trick every kart game rewards.
  gravity: 26,
  landBoostMs: 420,
  landAngle: 0.35,       // radians of misalignment still counted as a clean landing
};

export function createKart(opts = {}) {
  return {
    // What this kart is: the garage's vehicle, as one number. A hoverboard is quicker
    // everywhere than a kick scooter, and a rival on a slower machine is a rival a child
    // can actually catch. Without it every kart on the grid has the same top speed and the
    // finishing order is decided by who made fewer mistakes on the two corners that matter
    // — which, measured, was one second across the whole field.
    power: 1,
    x: 0, y: 0, z: 0,
    heading: 0,          // where the kart points
    course: 0,           // where it is actually going — the two differ in a drift
    speed: 0,
    vy: 0,
    air: false,
    slip: 0,             // the visible angle between the two, for the model and the camera
    drift: 0,            // ms the drift has been held
    driftWay: 0,         // -1 left, +1 right, 0 not drifting
    sparks: 0,           // 0..3
    boostUntil: 0,
    boostKind: '',
    hint: -1,            // last known frame on the track, so project() stays cheap
    s: 0, offset: 0, lap: 0, cp: 0,
    onRoad: true,
    // Long ago, so the first wall a kart touches is announced. Starting this at 0 and
    // guarding with "more than 400ms since the last one" quietly swallows any contact in
    // the first four hundred milliseconds of a race — which is exactly when the grid is
    // three wide going into turn one.
    hitAt: -1e9,
    ...opts,
  };
}

// One fixed step. `input` is {throttle, brake, steer, drift} with steer in -1..1; `now` is
// milliseconds. Returns the events of this step, which the game turns into sound, sparks
// and messages to the server.
export function stepKart(kart, { dt, input, track, now }) {
  const ev = [];
  const boosting = now < kart.boostUntil;
  const grassed = !kart.onRoad && !kart.air;

  // ---- along the road ------------------------------------------------------------
  const power = kart.power || 1;
  const top = (boosting ? KART.boostTop : KART.top) * power * (grassed ? KART.grassTop : 1);
  const accel = (boosting ? KART.boostAccel : KART.accel) * (0.7 + power * 0.3);
  if (input.throttle && !kart.air) {
    // Acceleration tapers as the kart approaches its ceiling, so the last few km/h take
    // the length of a straight to find — that is what makes a slipstream worth having.
    //
    // The taper never goes to zero, or the last 1% would take forever; that floor is why
    // the throttle must stop pushing AT the ceiling rather than fade into it. A floor of
    // 0.35 is 9.1m/s² of push, and the bleed that brings a boosted kart back down is 9 —
    // leave the throttle on above the ceiling and the two cancel, so a kart that took one
    // boost accelerates for the rest of the race. It did: 26 became 48 and stayed there.
    if (kart.speed < top) {
      const room = 1 - Math.max(0, kart.speed) / (top || 1);
      kart.speed = Math.min(top, kart.speed + accel * (0.35 + 0.65 * room) * dt);
    }
  } else if (input.brake && !kart.air) {
    kart.speed -= KART.brake * dt;
  } else if (!kart.air) {
    kart.speed -= Math.sign(kart.speed) * KART.engineBrake * dt;
  }
  // A kart over its ceiling — a boost that just ended, or one that has run onto the grass
  // — bleeds down to it rather than stopping dead. That bleed is the boost's whole feel.
  if (kart.speed > top) kart.speed = Math.max(top, kart.speed - (grassed ? KART.grassDrag * 3 : 9) * dt);
  kart.speed -= Math.sign(kart.speed) * (grassed ? KART.grassDrag : KART.drag) * dt * (input.throttle ? 0.25 : 1);
  kart.speed = Math.max(KART.reverseTop, kart.speed);
  if (!input.throttle && !input.brake && Math.abs(kart.speed) < 0.3) kart.speed = 0;

  // ---- the drift -------------------------------------------------------------------
  const wantDrift = input.drift && kart.speed > KART.driftMin && !kart.air;
  if (wantDrift) {
    if (!kart.driftWay && input.steer) kart.driftWay = Math.sign(input.steer);
    if (kart.driftWay) {
      kart.drift += dt * 1000;
      const was = kart.sparks;
      kart.sparks = kart.drift >= KART.charge[2] ? 3 : kart.drift >= KART.charge[1] ? 2 : kart.drift >= KART.charge[0] ? 1 : 0;
      if (kart.sparks !== was && kart.sparks) ev.push({ type: 'spark', level: kart.sparks });
    }
  } else if (kart.driftWay) {
    if (kart.sparks) {
      kart.boostUntil = Math.max(kart.boostUntil, now + KART.boostMs[kart.sparks - 1]);
      kart.boostKind = 'turbo';
      kart.speed = Math.max(kart.speed, KART.top * power * 0.92);
      ev.push({ type: 'turbo', level: kart.sparks });
    }
    kart.drift = 0;
    kart.driftWay = 0;
    kart.sparks = 0;
  }

  // ---- steering ---------------------------------------------------------------------
  // Steering authority: none at a standstill, full by walking pace, and never so much at
  // the top end that the kart spins on the spot.
  const fade = Math.min(1, Math.abs(kart.speed) / KART.steerLowSpeed);
  const rate = kart.driftWay ? KART.driftSteer : KART.steer;
  let steer = input.steer;
  if (kart.driftWay) {
    // In a drift the kart keeps turning into the corner even with the stick centred, and
    // steering the other way only straightens it out — the counter-steer that lets a
    // child hold a long drift down a curved straight.
    steer = kart.driftWay * KART.driftBias + input.steer * 0.6;
    steer = Math.max(-1, Math.min(1, steer));
  }
  if (!kart.air) kart.heading += steer * rate * fade * dt * Math.sign(kart.speed || 1);

  // The direction of travel chases the direction the kart faces. Slowly in a drift, which
  // is the slide; quickly otherwise, which is grip.
  const catchUp = 1 - Math.exp(-(kart.driftWay ? KART.driftGrip : KART.grip) * dt);
  let diff = ((kart.heading - kart.course + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  kart.course += diff * catchUp;
  kart.slip = ((kart.heading - kart.course + Math.PI) % (Math.PI * 2)) - Math.PI;

  // ---- where that puts it -------------------------------------------------------------
  const nx = kart.x + Math.sin(kart.course) * kart.speed * dt;
  const nz = kart.z + Math.cos(kart.course) * kart.speed * dt;
  const hit = track.project(nx, nz, kart.hint);
  kart.hint = hit.index;
  const frame = track.at(hit.s);
  const half = frame.w / 2;

  // The wall, where there is one. A wall turns the kart along itself rather than stopping
  // it: a child who brushes the barrier should lose a second, not the race.
  const over = Math.abs(hit.offset) - half;
  if (over > 0 && track.walled(hit.s)) {
    const side = Math.sign(hit.offset);
    const wx = frame.x + frame.nx * (half - KART.wallPush) * side;
    const wz = frame.z + frame.nz * (half - KART.wallPush) * side;
    kart.x = wx;
    kart.z = wz;
    // Slide along the wall: keep the part of the motion that runs down the road.
    const along = Math.sin(kart.course) * frame.tx + Math.cos(kart.course) * frame.tz;
    kart.course = Math.atan2(frame.tx * Math.sign(along || 1), frame.tz * Math.sign(along || 1));
    kart.heading = kart.course;
    kart.speed *= KART.wallBounce;
    kart.drift = 0; kart.driftWay = 0; kart.sparks = 0;
    if (now - kart.hitAt > 400) { ev.push({ type: 'wall' }); kart.hitAt = now; }
  } else {
    kart.x = nx;
    kart.z = nz;
  }

  // Height: the road's own height, unless the kart is in the air over it.
  const groundY = track.at(track.project(kart.x, kart.z, kart.hint).s).y;
  const lift = track.jumpAt(hit.s);
  if (lift && !kart.air && kart.speed > 8) {
    kart.air = true;
    kart.vy = lift * Math.min(1.35, kart.speed / KART.top + 0.35);
    ev.push({ type: 'jump' });
  }
  if (kart.air) {
    kart.vy -= KART.gravity * dt;
    kart.y += kart.vy * dt;
    if (kart.y <= groundY) {
      kart.y = groundY;
      kart.air = false;
      const f2 = track.at(hit.s);
      const face = Math.atan2(f2.tx, f2.tz);
      let miss = ((kart.heading - face + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (miss < -Math.PI) miss += Math.PI * 2;
      if (Math.abs(miss) < KART.landAngle) {
        kart.boostUntil = Math.max(kart.boostUntil, now + KART.landBoostMs);
        kart.boostKind = 'land';
        ev.push({ type: 'land', clean: true });
      } else {
        kart.speed *= 0.8;
        ev.push({ type: 'land', clean: false });
      }
    }
  } else {
    kart.y = groundY;
    kart.vy = 0;
  }

  // ---- where it is on the track --------------------------------------------------------
  const where = track.project(kart.x, kart.z, kart.hint);
  kart.hint = where.index;
  kart.offset = where.offset;
  kart.onRoad = Math.abs(where.offset) <= track.at(where.s).w / 2;
  const wasS = kart.s;
  kart.s = where.s;
  // Crossing the line: from the very end of the lap to the very start of it, going forward.
  if (wasS > track.length * 0.75 && kart.s < track.length * 0.25) ev.push({ type: 'line', forward: true });
  if (wasS < track.length * 0.25 && kart.s > track.length * 0.75) ev.push({ type: 'line', forward: false });
  if (!kart.onRoad && kart.speed > 1) ev.push({ type: 'grass' });
  return ev;
}

// A boost from something other than a drift: a pad, or an item box answered right.
export function boostKart(kart, kind, now) {
  const ms = kind === 'item' ? KART.itemMs : KART.padMs;
  kart.boostUntil = Math.max(kart.boostUntil, now + ms);
  kart.boostKind = kind;
  kart.speed = Math.max(kart.speed, KART.top * (kart.power || 1) * 0.95);
}

// Put a kart on the grid, pointing down the road.
export function gridKart(kart, slot) {
  kart.x = slot.x;
  kart.y = slot.y;
  kart.z = slot.z;
  kart.heading = slot.heading;
  kart.course = slot.heading;
  kart.speed = 0;
  kart.vy = 0;
  kart.air = false;
  kart.slip = 0;
  kart.drift = 0;
  kart.driftWay = 0;
  kart.sparks = 0;
  kart.boostUntil = 0;
  kart.hint = -1;
  kart.lap = 0;
  kart.cp = 0;
}

// The caller's fixed-step loop, in one place so the game, the rivals and the tests all
// advance time the same way. Returns every event from every sub-step.
export const TICK = 1 / 120;
export function advance(kart, { seconds, input, track, now, cap = 0.25 }) {
  const out = [];
  let left = Math.min(seconds, cap);
  let t = now;
  while (left > 1e-6) {
    const dt = Math.min(TICK, left);
    for (const e of stepKart(kart, { dt, input, track, now: t })) out.push(e);
    left -= dt;
    t += dt * 1000;
  }
  return out;
}
