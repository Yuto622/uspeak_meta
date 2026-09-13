// ライバルの運転 — the rivals drive. They are not a lap time pretending to be a kart.
//
// Every rival runs the same kart_drive.js the child does, with the same top speed, the same
// grip and the same drift. What they get instead of thumbs is this: a look down the road,
// a line to aim at, a speed the corner will take, and a decision about whether it is worth
// drifting. A child who out-brakes a rival into turn one really has out-braked it.
//
// They are also honest about being beatable: `skill` scales what they dare, and the game
// nudges it with how far ahead or behind the child is, so the last lap is close for a slow
// child and still hard for a fast one. What none of that touches is the finishing order —
// the room decides that from checkpoints, and a page cannot make a rival slower.
import { KART } from './kart-drive.js';

// How hard a driver is willing to corner, in m/s². A real kart tyre is about 12; these are
// arcade karts on a wide track, so they hold more, and the difference between drivers is
// mostly this number.
const GRIP_BASE = 15;
const LOOK_MIN = 12;      // metres of road a driver looks at, at a crawl
const LOOK_SPEED = 0.85;  // …and per metre a second on top of that

export function createDriver({ id, name, colour, skill = 1, style = 0 } = {}) {
  return {
    id,
    name,
    colour,
    skill,                 // 0.8 is a beginner's pace, 1.1 is quick
    style,                 // -1 hugs the inside, +1 runs it wide: what makes them look different
    slipUntil: 0,          // a mistake in progress
    nextThink: 0,
  };
}

// What the driver can see: the road at the distance they are looking, and the tightest
// thing between here and there.
function lookAhead(track, s, distance) {
  let worst = 0;
  let at = 0;
  const step = 4;
  for (let d = 4; d <= distance; d += step) {
    const f = track.at(s + d);
    if (Math.abs(f.curv) > Math.abs(worst)) { worst = f.curv; at = d; }
  }
  return { curv: worst, at };
}

// The speed a corner of this curvature will take, for a driver willing to pull this much.
const cornerSpeed = (curv, grip) => (Math.abs(curv) < 1e-4 ? Infinity : Math.sqrt(grip / Math.abs(curv)));

// One driver's hands and feet for this frame. Returns the same shape the child's thumbs
// produce, so kart-drive.js cannot tell them apart.
export function driveAI(driver, kart, { track, now, rubber = 1 }) {
  const grip = GRIP_BASE * driver.skill * rubber;
  const look = LOOK_MIN + Math.abs(kart.speed) * LOOK_SPEED;
  const ahead = lookAhead(track, kart.s, look);
  const here = track.at(kart.s);

  // The line: aim at a point down the road, pulled towards the inside of whatever corner
  // is coming. Style shifts the whole line a little, so twelve karts are not one kart
  // drawn twelve times.
  const half = here.w / 2;
  const tight = Math.min(1, Math.abs(ahead.curv) * 60);
  const inside = -Math.sign(ahead.curv || 0) * (half - 2.5) * tight;
  const wantOffset = Math.max(-half + 1.6, Math.min(half - 1.6, inside + driver.style * 1.8));
  const aimS = kart.s + Math.max(8, look * 0.55);
  const aim = track.place(aimS, wantOffset);

  // Steering: turn towards the aim point, and let a drift steer harder without asking for
  // more lock than exists.
  let want = Math.atan2(aim.x - kart.x, aim.z - kart.z);
  let turn = ((want - kart.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (turn < -Math.PI) turn += Math.PI * 2;
  let steer = Math.max(-1, Math.min(1, turn * 2.2));

  // A mistake, occasionally, so a rival is a driver rather than a rail. Rare, brief, and
  // never on the last corner of the last lap — losing to a rival's luck is not a lesson.
  if (now < driver.slipUntil) steer += 0.45 * Math.sign(steer || 1);

  // Speed: the tightest corner in sight sets it. Brake early enough to be at that speed
  // when the corner arrives, then get back on the throttle.
  const limit = Math.min(cornerSpeed(ahead.curv, grip),
    KART.top * (kart.power || 1) * Math.min(1, 0.84 + driver.skill * 0.14));
  const stopping = Math.max(0, (kart.speed * kart.speed - limit * limit) / (2 * KART.brake));
  const brake = kart.speed > limit + 0.6 && stopping > ahead.at - 6;
  const throttle = !brake;

  // Drift: worth it when the corner is long and tight enough that the charge will pay, and
  // when the driver is quick enough to hold one. A slow rival never drifts, which is a
  // difference a child can see.
  const drift = driver.skill > 0.9
    && Math.abs(ahead.curv) > 0.012
    && kart.speed > KART.driftMin + 4
    && Math.abs(turn) > 0.06
    && ahead.at < 26;

  return { throttle, brake, steer, drift };
}

// Rubber-banding. Not "the rival is given free speed", which children notice and resent —
// what changes is how hard the rival is willing to corner and how close to its own limit
// it runs. A rival a long way ahead of the class eases off; one that has fallen behind
// drives out of its skin. The band is narrow enough that a good drive still wins.
export function rubberFor(gapMetres) {
  const g = Math.max(-260, Math.min(260, gapMetres));
  return 1 + (g / 260) * 0.14;   // ±14% of cornering grip
}

// Now and then, a mistake.
export function maybeSlip(driver, now, rng = Math.random) {
  if (now < driver.nextThink) return;
  driver.nextThink = now + 2500 + rng() * 4000;
  if (rng() < 0.12 * (1.4 - driver.skill)) driver.slipUntil = now + 260 + rng() * 260;
}
