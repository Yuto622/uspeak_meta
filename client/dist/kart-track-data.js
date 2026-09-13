// コースの数学 — the circuit as numbers, with no scene and no browser in sight.
//
// One file answers every question anybody asks about the track: where is the road at this
// distance round the lap, how wide is it there, which way does it lean, and — the question
// the whole race is built on — given a kart at (x, z), how far round is it and how far off
// the middle. The page builds its meshes from these frames, the rival drivers steer by
// them, and the server judges laps by them. They cannot disagree, because there is only
// one of them.
//
// Nothing in here imports THREE, so it runs in a test with no screen: `node --test` drives
// a whole race through it.

// ---- the curve ---------------------------------------------------------------------
//
// A closed centripetal Catmull-Rom through the control points. Centripetal rather than the
// uniform kind because a uniform spline overshoots when the points are unevenly spaced —
// which is exactly what a hand-drawn circuit is — and an overshoot here is a road that
// bulges out through a wall.
function catmull(p0, p1, p2, p3, t, alpha = 0.5) {
  const d = (a, b) => (((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2) ** 0.5) ** alpha || 1e-4;
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb, k) => {
    const f = (k - ta) / ((tb - ta) || 1e-4);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  };
  const a1 = mix(p0, p1, t0, t1, tt);
  const a2 = mix(p1, p2, t1, t2, tt);
  const a3 = mix(p2, p3, t2, t3, tt);
  const b1 = mix(a1, a2, t0, t2, tt);
  const b2 = mix(a2, a3, t1, t3, tt);
  return mix(b1, b2, t1, t2, tt);
}

const STEP = 1.4;          // metres between frames: fine enough for a kerb, cheap enough to walk
const MAX_BANK = 0.20;     // radians a corner may lean, about 11 degrees
const BANK_PER_CURV = 9;   // how much of the corner's tightness becomes lean

// Build the frames: one every STEP metres round the lap, each carrying where it is, which
// way the road runs, which way is sideways, how wide it is and how far it leans.
function buildFrames(track) {
  const pts = track.points;
  const n = pts.length;
  const raw = [];
  // Walk each span of the spline finely, then re-sample by distance so the frames are
  // evenly spaced no matter how far apart the control points are.
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const sub = 24;
    for (let k = 0; k < sub; k += 1) {
      const q = catmull(p0, p1, p2, p3, k / sub);
      // Width is a property of the control points, carried along the span between them.
      const w0 = p1.w || track.width;
      const w1 = p2.w || track.width;
      raw.push({ ...q, w: w0 + (w1 - w0) * (k / sub) });
    }
  }
  // Re-sample by arc length.
  const seg = [];
  let total = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
    seg.push(d);
    total += d;
  }
  const count = Math.max(24, Math.round(total / STEP));
  const frames = [];
  let at = 0;          // distance along raw
  let idx = 0;
  let acc = 0;
  for (let i = 0; i < count; i += 1) {
    const want = (i / count) * total;
    while (acc + seg[idx] < want && idx < raw.length - 1) { acc += seg[idx]; idx += 1; }
    const f = seg[idx] ? (want - acc) / seg[idx] : 0;
    const a = raw[idx];
    const b = raw[(idx + 1) % raw.length];
    frames.push({
      s: want,
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      w: a.w + (b.w - a.w) * f,
    });
    at = want;
  }
  // Tangents, sideways, curvature and lean, from the neighbours of each frame.
  for (let i = 0; i < frames.length; i += 1) {
    const p = frames[(i - 1 + frames.length) % frames.length];
    const q = frames[(i + 1) % frames.length];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dz) || 1e-4;
    frames[i].tx = dx / len;
    frames[i].tz = dz / len;
    frames[i].grade = dy / (Math.hypot(dx, dz, dy) || 1e-4);
    // Right of the direction of travel, on the flat.
    frames[i].nx = frames[i].tz;
    frames[i].nz = -frames[i].tx;
  }
  for (let i = 0; i < frames.length; i += 1) {
    const p = frames[(i - 1 + frames.length) % frames.length];
    const q = frames[(i + 1) % frames.length];
    // Signed curvature: how much the direction turned over this stretch.
    const cross = p.tx * q.tz - p.tz * q.tx;
    const ds = (q.s - p.s + total) % total || 1e-4;
    const curv = Math.asin(Math.max(-1, Math.min(1, cross))) / ds;
    frames[i].curv = curv;
    frames[i].bank = Math.max(-MAX_BANK, Math.min(MAX_BANK, -curv * BANK_PER_CURV * 10));
  }
  // Smooth the lean, or the road creases where the curvature jumps.
  for (let pass = 0; pass < 3; pass += 1) {
    const before = frames.map((f) => f.bank);
    for (let i = 0; i < frames.length; i += 1) {
      const a = before[(i - 1 + frames.length) % frames.length];
      const b = before[i];
      const c = before[(i + 1) % frames.length];
      frames[i].bank = (a + b * 2 + c) / 4;
    }
  }
  return { frames, length: total };
}

// ---- the track object ----------------------------------------------------------------

export function makeTrack(def) {
  const { frames, length } = buildFrames(def);
  const count = frames.length;

  // The frame at a distance round the lap, with the bits between frames filled in.
  const at = (s) => {
    const d = ((s % length) + length) % length;
    const i = Math.min(count - 1, Math.floor((d / length) * count));
    const a = frames[i];
    const b = frames[(i + 1) % count];
    const span = ((b.s - a.s + length) % length) || 1e-4;
    const f = Math.max(0, Math.min(1, (d - a.s) / span));
    const lerp = (k) => a[k] + (b[k] - a[k]) * f;
    // Directions are interpolated then re-normalised: halfway round a corner the average
    // of two unit vectors is shorter than one, and a short tangent is a slow kart.
    const tx = lerp('tx'); const tz = lerp('tz');
    const tl = Math.hypot(tx, tz) || 1e-4;
    return {
      s: d,
      x: lerp('x'), y: lerp('y'), z: lerp('z'), w: lerp('w'),
      tx: tx / tl, tz: tz / tl, nx: tz / tl, nz: -tx / tl,
      bank: lerp('bank'), curv: lerp('curv'), grade: lerp('grade'),
      index: i,
    };
  };

  // A point on the road: s round the lap, o metres to the right of the middle.
  const place = (s, o = 0) => {
    const f = at(s);
    return { x: f.x + f.nx * o, y: f.y, z: f.z + f.nz * o, f };
  };
  const placeT = (t, o = 0) => place(t * length, o);

  // Where is this kart? Answered from the last answer when there is one: a kart moves a
  // few metres a frame, so a handful of frames either side is the whole search. Without
  // the hint it walks the lot, which is what the first frame and the server's checks do.
  const project = (x, z, hint = -1) => {
    let bi = 0;
    let bd = Infinity;
    const scan = (i) => {
      const k = ((i % count) + count) % count;
      const f = frames[k];
      const d = (f.x - x) ** 2 + (f.z - z) ** 2;
      if (d < bd) { bd = d; bi = k; }
    };
    if (hint >= 0) for (let i = hint - 14; i <= hint + 14; i += 1) scan(i);
    else for (let i = 0; i < count; i += 1) scan(i);
    // Refine against the two neighbouring segments, so `s` is continuous rather than
    // stepping frame to frame — a lap time built from steps is a lap time that lies.
    let best = { s: frames[bi].s, o: 0, d2: Infinity };
    for (const j of [bi - 1, bi]) {
      const a = frames[((j % count) + count) % count];
      const b = frames[(((j + 1) % count) + count) % count];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1e-4;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / len2));
      const px = a.x + vx * t;
      const pz = a.z + vz * t;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 < best.d2) {
        const span = ((b.s - a.s + length) % length);
        const s = (a.s + span * t) % length;
        const f = at(s);
        best = { s, o: (x - f.x) * f.nx + (z - f.z) * f.nz, d2, index: a.index ?? ((j % count) + count) % count };
      }
    }
    return { s: best.s, t: best.s / length, offset: best.o, index: bi, off: Math.abs(best.o) > at(best.s).w / 2 };
  };

  // The checkpoints, evenly spaced round the lap. They are not decoration: this is the
  // list the server counts, and the only way past one is through it.
  const cps = [];
  const nCp = def.checkpoints || 12;
  for (let i = 0; i < nCp; i += 1) {
    const s = (i / nCp) * length;
    const f = at(s);
    cps.push({ id: i, s, t: i / nCp, x: f.x, y: f.y, z: f.z, w: f.w, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz });
  }

  const spread = (list) => list.flatMap((row) => (Array.isArray(row.o) ? row.o : [row.o]).map((o, i) => {
    const p = placeT(row.t, o);
    return { id: `${row.t}:${i}`, t: row.t, o, x: p.x, y: p.y, z: p.z, s: row.t * length };
  }));

  return {
    def,
    id: def.id,
    name: def.name,
    laps: def.laps || 3,
    length,
    frames,
    at,
    place,
    placeT,
    project,
    checkpoints: cps,
    items: spread(def.items || []),
    boosts: spread(def.boosts || []),
    grid: (def.grid || []).map((g, i) => {
      const p = placeT(g.t, g.o);
      const f = at(g.t * length);
      return { place: i + 1, x: p.x, y: p.y, z: p.z, heading: Math.atan2(f.tx, f.tz) };
    }),
    jumps: (def.jumps || []).map((j) => ({ ...j, s: j.t * length })),
    walls: (def.walls || []).map((w) => ({ from: w.from * length, to: w.to * length })),
    decor: (def.decor || []).map((d) => ({ ...d, ...placeT(d.t, d.o) })),
    // Is this stretch of road walled? Used by the driving code and by the builder, so a
    // wall a kart bounces off is always a wall a child can see.
    walled(s) {
      const d = ((s % length) + length) % length;
      return (def.walls || []).some((w) => {
        const a = w.from * length;
        const b = w.to * length;
        return a <= b ? d >= a && d <= b : d >= a || d <= b;
      });
    },
    // How high the jump throws a kart that leaves the ramp here, and 0 everywhere else.
    jumpAt(s) {
      const d = ((s % length) + length) % length;
      for (const j of def.jumps || []) {
        const a = j.t * length;
        if (d >= a && d <= a + 6) return j.lift;
      }
      return 0;
    },
  };
}

// The file, loaded once. The page fetches it; the server reads it off disk. Both end up
// with the same numbers because it is the same file.
let cache = null;
export async function loadTracks(fetchJson) {
  if (cache) return cache;
  const data = await fetchJson();
  cache = { version: data.version, tracks: data.tracks.map(makeTrack) };
  return cache;
}
export function tracksFrom(data) {
  return { version: data.version, tracks: data.tracks.map(makeTrack) };
}
