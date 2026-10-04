// じぶんの しま の道具箱 — the shapes, the ground and the small things every island is made of.
//
// land-world.js builds an island by calling what this file returns from `makeKit()`: a
// box, a cone, a ball, a cylinder, and out of those the trees, houses, fences and animals
// the twelve worlds share. Two things make a big island cheap enough for an iPad:
//
//   * Everything static is INSTANCED. `B()` and friends do not make a mesh; they make a
//     small record (position / rotation / scale) in a batch keyed by shape and colour, and
//     `flush()` turns each batch into one InstancedMesh. A forest of a hundred trees is
//     three draw calls. Call sites may still set `.rotation.y` or `.scale.y` on what they
//     get back — the matrices are composed at flush time, after those edits.
//   * Only what moves or glows is a real mesh (`M.B()` …): flames, flags, fish, lamps.
//
// The ground is a heightfield: gentle hills inland, a beach sloping to the water at the
// rim, flat pads under buildings. Props are lifted onto it automatically (`lift`), and the
// scene asks `H(x, z)` for where a child's feet go.
import * as THREE from './three.module.js';

export const BEACH = -0.9;         // the rim's height, where sand meets water
export const SEA_Y = -1.85;        // the water's surface
export const JETTY_Y = -0.45;      // the top of the jetty's planks

const BOX = new THREE.BoxGeometry(1, 1, 1);
const geos = new Map();
export const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const GEO = {
  box: () => BOX,
  ball: () => geo('ball', () => new THREE.SphereGeometry(1, 12, 9)),
  cone: (sides) => geo(`cone${sides}`, () => new THREE.ConeGeometry(1, 1, sides)),
  cyl: (sides, taper) => geo(`cyl${sides}:${taper}`, () => new THREE.CylinderGeometry(taper, 1, 1, sides)),
};
const mats = new Map();
export const mat = (color, glow = 0, opacity = 1, flat = false) => {
  const key = `${color}:${glow}:${opacity}:${flat ? 1 : 0}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.86, metalness: 0, emissive: glow ? color : 0x000000, emissiveIntensity: glow,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 0.5, flatShading: flat,
    }));
  }
  return mats.get(key);
};

// A small seeded random: the same look builds the same island every time, everywhere.
export const seeded = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const seed = h >>> 0;
  const next = () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.seed = seed;
  return next;
};
const hash2 = (x, z, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 144665); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
const vnoise = (x, z, s) => { const x0 = Math.floor(x); const z0 = Math.floor(z); const fx = smooth(x - x0); const fz = smooth(z - z0); const a = hash2(x0, z0, s); const b = hash2(x0 + 1, z0, s); const c = hash2(x0, z0 + 1, s); const d = hash2(x0 + 1, z0 + 1, s); return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz; };
const fbm = (x, z, s) => vnoise(x, z, s) * 0.6 + vnoise(x * 2.1 + 7.3, z * 2.1 + 3.1, s + 1) * 0.3 + vnoise(x * 4.3 + 1.7, z * 4.3 + 9.2, s + 2) * 0.1;
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function makeKit({ group, theme, grid, rnd, obstacles, anims }) {
  const half = grid / 2;
  const seedN = rnd.seed & 0xffff;
  const relief = theme.relief ?? 1;

  // ---- the ground ----------------------------------------------------------------------
  const pads = [];                 // flat ground under buildings: {x,z,w,d,h}
  const bumps = [];                // hills and dents: {x,z,r,h}
  const baseH = (x, z) => {
    const r = Math.max(Math.abs(x), Math.abs(z)) / half;
    const edge = smoothstep(0.78, 1.0, r);
    let h = (fbm(x * 0.085, z * 0.085, seedN) - 0.32) * 2.4 * relief;
    for (const b of bumps) { const d = Math.hypot(x - b.x, z - b.z) / b.r; if (d < 1) h += b.h * (1 - d * d) * (1 - d * d); }
    h = Math.max(h, -0.35);
    return h * (1 - edge) + BEACH * edge;
  };
  const H = (x, z) => {
    let best = null; let bt = 1;
    for (const p of pads) {
      const t = Math.max(Math.abs(x - p.x) - p.w, Math.abs(z - p.z) - p.d) / 1.8;
      if (t < bt) { bt = t; best = p; }
    }
    if (!best) return baseH(x, z);
    if (bt <= 0) return best.h;
    return best.h * (1 - smooth(bt)) + baseH(x, z) * smooth(bt);
  };
  const slope = (x, z) => Math.hypot(H(x + 0.6, z) - H(x - 0.6, z), H(x, z + 0.6) - H(x, z - 0.6)) / 1.2;
  const hill = (x, z, r, h) => bumps.push({ x, z, r, h });
  const pad = (x, z, w, d) => { const h = baseH(x, z); pads.push({ x, z, w, d, h }); return h; };
  let lift = true;
  const noLift = (fn) => { lift = false; try { return fn(); } finally { lift = true; } };
  const Y = (x, y, z) => (lift ? y + H(x, z) : y);

  // ---- shapes: instanced by default ------------------------------------------------------
  const batches = new Map();       // `${geoKey}:${color}` -> { geometry, material, items: [] }
  const rec = (geoKey, geometry, color, x, y, z, sx, sy, sz) => {
    const key = `${geoKey}:${color}`;
    let b = batches.get(key);
    if (!b) { b = { geometry, material: mat(color), items: [] }; batches.set(key, b); }
    const it = { position: new THREE.Vector3(x, Y(x, y, z), z), rotation: new THREE.Euler(), scale: new THREE.Vector3(sx, sy, sz) };
    b.items.push(it);
    return it;
  };
  const real = (geometry, color, glow, opacity, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geometry, mat(color, glow, opacity));
    m.position.set(x, Y(x, y, z), z); m.scale.set(sx, sy, sz);
    m.castShadow = opacity === 1; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Static (glow 0, opaque) → a record in a batch. Glowing or see-through → a mesh of its own.
  const B = (x, y, z, w, h, d, color, glow = 0, opacity = 1) => (glow || opacity < 1 ? real(BOX, color, glow, opacity, x, y, z, w, h, d) : rec('box', BOX, color, x, y, z, w, h, d));
  const cone = (x, y, z, r, h, color, sides = 8, glow = 0, opacity = 1) => (glow || opacity < 1 ? real(GEO.cone(sides), color, glow, opacity, x, y, z, r, h, r) : rec(`cone${sides}`, GEO.cone(sides), color, x, y, z, r, h, r));
  const ball = (x, y, z, r, color, glow = 0, opacity = 1) => (glow || opacity < 1 ? real(GEO.ball(), color, glow, opacity, x, y, z, r, r, r) : rec('ball', GEO.ball(), color, x, y, z, r, r, r));
  const cyl = (x, y, z, r, h, color, sides = 12, glow = 0, opacity = 1, taper = 1) => (glow || opacity < 1 ? real(GEO.cyl(sides, taper), color, glow, opacity, x, y, z, r, h, r) : rec(`cyl${sides}:${taper}`, GEO.cyl(sides, taper), color, x, y, z, r, h, r));
  const disc = (x, y, z, r, color, glow = 0, opacity = 1) => cyl(x, y, z, r, 0.08, color, 24, glow, opacity);
  // Real meshes on demand, for what an animation will move every frame.
  const M = {
    B: (x, y, z, w, h, d, color, glow = 0, opacity = 1) => real(BOX, color, glow, opacity, x, y, z, w, h, d),
    cone: (x, y, z, r, h, color, sides = 8, glow = 0, opacity = 1) => real(GEO.cone(sides), color, glow, opacity, x, y, z, r, h, r),
    ball: (x, y, z, r, color, glow = 0, opacity = 1) => real(GEO.ball(), color, glow, opacity, x, y, z, r, r, r),
    cyl: (x, y, z, r, h, color, sides = 12, glow = 0, opacity = 1, taper = 1) => real(GEO.cyl(sides, taper), color, glow, opacity, x, y, z, r, h, r),
    // A plain mesh for a sub-group (no lift, not added to the island): the caller places it.
    mesh: (kind, color, glow = 0, opacity = 1, sides = 10) => { const g = kind === 'box' ? BOX : kind === 'ball' ? GEO.ball() : kind === 'cone' ? GEO.cone(sides) : GEO.cyl(sides, 1); const m = new THREE.Mesh(g, mat(color, glow, opacity)); m.castShadow = opacity === 1; return m; },
  };
  const flush = () => {
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
    for (const b of batches.values()) {
      const im = new THREE.InstancedMesh(b.geometry, b.material, b.items.length);
      b.items.forEach((it, i) => { q.setFromEuler(it.rotation); m4.compose(it.position, q, it.scale); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      group.add(im);
    }
    batches.clear();
  };

  // ---- placing things -----------------------------------------------------------------
  const block = (x, z, w, d) => obstacles.push({ x, z, w, d });
  const anim = (fn) => anims.push(fn);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const clear = (x, z, padding = 0.6) => !obstacles.some((o) => Math.abs(x - o.x) < o.w + padding && Math.abs(z - o.z) < o.d + padding);
  const onWay = (x, z) => Math.abs(x) < 3.2 && z > half - 9;          // the walk up from the jetty stays open
  // A free place for something w × d, between rMin and rMax from the middle, on ground
  // that is not too steep; null if there is none after a few tries.
  function spot(w, d, { rMin = 0, rMax = half - 3, tries = 40, slopeMax = 0.45, padding = 0.9 } = {}) {
    for (let i = 0; i < tries; i += 1) {
      const a = rnd() * Math.PI * 2; const r = rMin + rnd() * Math.max(0, rMax - rMin);
      const x = Math.cos(a) * r; const z = Math.sin(a) * r;
      if (Math.abs(x) > half - 2.6 - w || Math.abs(z) > half - 2.6 - d) continue;
      if (onWay(x, z) || !clear(x, z, Math.max(w, d) + padding) || slope(x, z) > slopeMax) continue;
      return [x, z];
    }
    return null;
  }
  // Sprinkle n things on open ground, never inside a building or in the jetty's way.
  const scatter = (n, fn, { margin = 1.6, rMin = 0, slopeMax = 0.7 } = {}) => {
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries += 1) {
      const x = (rnd() * 2 - 1) * (half - margin); const z = (rnd() * 2 - 1) * (half - margin);
      if (Math.hypot(x, z) < rMin || !clear(x, z) || onWay(x, z) || slope(x, z) > slopeMax) continue;
      fn(x, z); i += 1;
    }
  };

  // ---- the ground's own mesh --------------------------------------------------------------
  // One heightfield, one unit a cell, flat-shaded and vertex-coloured: sand low, the
  // theme's ground on the flats, something lighter up high, bare earth where it is steep.
  function terrain() {
    const seg = grid;
    const g = new THREE.PlaneGeometry(grid, grid, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const pal = theme.palette;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i); const z = pos.getZ(i);
      const h = H(x, z);
      pos.setY(i, h);
      const s = slope(x, z);
      const n = hash2(Math.round(x * 3), Math.round(z * 3), seedN + 9);
      let col = pal.mid;
      if (h < -0.25) col = pal.low; else if (s > 0.62) col = pal.steep; else if (h > 1.9) col = pal.high;
      if (h >= -0.25 && h < 0.15 && s < 0.4 && n > 0.55) col = pal.lowMix ?? pal.low;
      c.set(col).multiplyScalar(0.93 + n * 0.14);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    m.receiveShadow = true; m.castShadow = false;
    group.add(m);
  }

  // ---- the small things most islands share ---------------------------------------------
  const tuft = (x, z, c = theme.tuft ?? 0x6fae4a) => { for (let i = 0; i < 3; i += 1) cone(x + (rnd() - 0.5) * 0.4, 0.16, z + (rnd() - 0.5) * 0.4, 0.09, 0.34, c, 4).rotation.y = rnd() * 3; };
  const flower = (x, z, c) => { cyl(x, 0.14, z, 0.025, 0.28, 0x4e9a3f, 4); ball(x, 0.3, z, 0.1, c); };
  const pebble = (x, z, c) => { const p = ball(x, 0.03, z, 0.07 + rnd() * 0.1, c ?? pick([0xb9b3a3, 0x8e8a80, 0xd0c8b4])); p.scale.y *= 0.45; p.rotation.y = rnd() * 3; };
  const boulder = (x, z, s, c = 0x7d7a72) => { const m = ball(x, s * 0.25, z, s, c); m.scale.y = 0.6; m.rotation.y = rnd() * 3; const m2 = ball(x + s * 0.5, s * 0.15, z + s * 0.3, s * 0.55, c); m2.scale.y = 0.55; block(x, z, s * 0.8, s * 0.8); return m; };
  const outcrop = (x, z, r, c) => { for (let i = 0; i < 4 + Math.floor(r); i += 1) { const a = rnd() * 6.28; const d = rnd() * r; boulder(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5 + rnd() * 0.9, c); } };
  const tree = (x, z, { trunk = 0x6d543a, leaf = 0x4e9a3f, leaf2 = null, s = 1 } = {}) => {
    cyl(x, 0.9 * s, z, 0.22 * s, 1.8 * s, trunk, 7);
    ball(x, 2.3 * s, z, 1.0 * s, leaf); ball(x + 0.5 * s, 2.0 * s, z + 0.3 * s, 0.7 * s, leaf2 || leaf); ball(x - 0.4 * s, 2.7 * s, z - 0.3 * s, 0.75 * s, leaf);
    block(x, z, 0.35 * s, 0.35 * s);
  };
  const pine = (x, z, s = 1, { lit = false, c = 0x2f6a3a, snow = false } = {}) => {
    cyl(x, 0.5 * s, z, 0.17 * s, 1.0 * s, 0x5a4330, 6);
    for (let i = 0; i < 3; i += 1) { cone(x, (1.3 + i * 0.9) * s, z, (1.4 - i * 0.35) * s, 1.3 * s, c, 7); if (snow) cone(x, (1.6 + i * 0.9) * s, z, (1.0 - i * 0.28) * s, 0.3 * s, 0xffffff, 7); }
    if (lit) for (let i = 0; i < 6; i += 1) ball(x + Math.cos(i * 1.05) * 0.7 * s, (1.1 + (i % 3) * 0.8) * s, z + Math.sin(i * 1.05) * 0.7 * s, 0.1, [0xffd766, 0xe0566a, 0x6fd0ff][i % 3], 1.5);
    block(x, z, 0.4 * s, 0.4 * s);
  };
  const palm = (x, z, lean = 1, leaf = 0x4e9a3f) => {
    for (let i = 0; i < 6; i += 1) cyl(x + i * 0.11 * lean, 0.35 + i * 0.62, z, 0.2 - i * 0.015, 0.66, i % 2 ? 0x9a7a4a : 0x8a6a3e, 7);
    const top = x + 0.66 * lean;
    for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3 + 0.3; const f = B(top + Math.cos(a) * 0.95, 4.2 - 0.1 * (i % 2), z + Math.sin(a) * 0.95, 2.0, 0.1, 0.42, leaf); f.rotation.y = -a; f.rotation.z = 0.35; }
    for (let i = 0; i < 3; i += 1) ball(top + (i - 1) * 0.22, 3.95, z + 0.1, 0.17, 0x7a4a2a);
    block(x, z, 0.3, 0.3);
  };
  const bush = (x, z, s = 1, c = 0x4e9a3f) => { ball(x, 0.45 * s, z, 0.6 * s, c); ball(x + 0.4 * s, 0.35 * s, z + 0.2 * s, 0.45 * s, c); ball(x - 0.35 * s, 0.4 * s, z - 0.2 * s, 0.5 * s, c); };
  const house = (x, z, w, d, wall, roof, { roofH = 1.4, lit = 0.4, chimney = false, porch = false, trim = 0xf3ecd8 } = {}) => {
    pad(x, z, w / 2 + 0.6, d / 2 + 0.6);
    B(x, 0.15, z, w + 0.5, 0.3, d + 0.5, 0x8a8478);
    B(x, 1.4, z, w, 2.8, d, wall);
    B(x, 2.95, z, w + 0.8, 0.3, d + 0.8, roof);
    B(x, 3.3, z, w * 0.76, 0.5, d * 0.76, roof);
    B(x, 3.3 + roofH * 0.5, z, w * 0.4, roofH, d * 0.4, roof);
    B(x, 0.95, z + d / 2 + 0.03, 1.0, 1.9, 0.1, 0x5a3a22); ball(x + 0.32, 0.95, z + d / 2 + 0.1, 0.06, 0xffd766, 0.6);
    for (const sx of [-1, 1]) { B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.03, 0.9, 0.8, 0.08, 0x9fd6e8, lit); B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.06, 1.0, 0.08, 0.05, trim); B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.06, 0.08, 0.9, 0.05, trim); B(x + sx * w * 0.3, 1.2, z + d / 2 + 0.1, 1.0, 0.12, 0.2, 0x8a6a45); }
    for (const sz of [-1, 1]) B(x + sz * w / 2 + 0.03 * sz, 1.7, z - d * 0.1, 0.08, 0.8, 0.9, 0x9fd6e8, lit);
    if (chimney) { B(x + w * 0.3, 4.0, z - d * 0.2, 0.6, 1.4, 0.6, 0x9a8f7a); for (let i = 0; i < 4; i += 1) puff(x + w * 0.3, 4.8, z - d * 0.2, i); }
    if (porch) { B(x, 0.32, z + d / 2 + 1.0, w * 0.8, 0.12, 1.8, 0xb49a6a); for (const sx of [-1, 1]) cyl(x + sx * w * 0.38, 1.6, z + d / 2 + 1.8, 0.08, 2.6, 0x8a6a45, 6); B(x, 2.9, z + d / 2 + 1.0, w * 0.9, 0.12, 2.0, roof); block(x, z + d / 2 + 1.0, w * 0.4, 0.3); }
    block(x, z, w / 2, d / 2);
  };
  const tower = (x, z, r, h, wall, roof, { lit = true } = {}) => { pad(x, z, r + 0.6, r + 0.6); cyl(x, 0.2, z, r + 0.3, 0.4, 0x8a8478, 12); cyl(x, h / 2, z, r, h, wall, 12, 0, 1, 0.9); cyl(x, h + 0.1, z, r + 0.2, 0.25, 0x5a4330, 12); cone(x, h + 1.1, z, r + 0.1, 1.8, roof, 10); B(x, h * 0.6, z + r * 0.9, 0.5, 0.8, 0.08, 0x9fd6e8, lit ? 0.5 : 0); B(x, 0.9, z + r * 0.92, 0.8, 1.7, 0.1, 0x5a3a22); block(x, z, r, r); };
  const lantern = (x, z, c = 0xffd98a) => { cyl(x, 0.9, z, 0.07, 1.8, 0x3b3b40, 6); B(x, 1.95, z, 0.4, 0.46, 0.4, c, 1.4); B(x, 2.24, z, 0.5, 0.08, 0.5, 0x3b3b40); };
  const torch = (x, z) => { cyl(x, 0.9, z, 0.06, 1.8, 0x6d543a, 6); cyl(x, 1.85, z, 0.15, 0.3, 0x3b3b40, 8); fire(x, 1.95, z, 0.5); };
  const puff = (x, y, z, i, c = 0xf3efe6, drift = 0.25) => {
    const s = M.ball(x, y, z, 0.26 + (i % 3) * 0.08, c, 0, 0.42);
    const y0 = s.position.y;
    anim((t) => { const k = (t * 0.55 + i * 0.6) % 2.6; s.position.y = y0 + k; s.position.x = x + Math.sin(t + i) * drift; const sc = 0.22 + k * 0.16; s.scale.set(sc, sc, sc); s.material.opacity = Math.max(0, 0.42 - k * 0.14); });
  };
  const fire = (x, y, z, s = 1) => {
    const f = M.cone(x, y + 0.45 * s, z, 0.38 * s, 0.9 * s, 0xff9a3c, 6, 1.8); const g = M.cone(x, y + 0.3 * s, z, 0.22 * s, 0.6 * s, 0xffe08a, 6, 2.2);
    anim((t) => { f.rotation.y = t * 3; f.scale.y = (0.9 + Math.sin(t * 9) * 0.12) * s; g.scale.y = (0.6 + Math.cos(t * 11) * 0.1) * s; });
  };
  const campfire = (x, z) => { for (let i = 0; i < 8; i += 1) { const s = ball(x + Math.cos(i * 0.785) * 0.9, 0.1, z + Math.sin(i * 0.785) * 0.9, 0.24, 0x8c917c); s.scale.y = 0.6; } B(x, 0.3, z, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = 0.7; B(x, 0.4, z, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = -0.7; fire(x, 0.4, z); for (let i = 0; i < 3; i += 1) puff(x, 1.4, z, i, 0xd8d4cc); block(x, z, 0.9, 0.9); cyl(x, 0.25, z + 1.8, 0.25, 1.8, 0x8a6a45, 7).rotation.z = Math.PI / 2; cyl(x + 1.9, 0.25, z, 0.25, 1.8, 0x8a6a45, 7).rotation.x = Math.PI / 2; };
  const fence = (x1, z1, x2, z2, c = 0xd4c49b) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / 1.1));
    for (let i = 0; i <= n; i += 1) { const t = i / n; B(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t, 0.14, 1.0, 0.14, c); }
    for (let i = 0; i < n; i += 1) for (const y of [0.45, 0.8]) { const t = (i + 0.5) / n; const r = B(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, Math.hypot(x2 - x1, z2 - z1) / n + 0.05, 0.1, 0.1, c); r.rotation.y = -Math.atan2(z2 - z1, x2 - x1); }
  };
  const fenceRect = (x, z, w, d, c, gap = 'south') => { fence(x - w, z - d, x + w, z - d, c); fence(x - w, z - d, x - w, z + d, c); fence(x + w, z - d, x + w, z + d, c); if (gap === 'south') { fence(x - w, z + d, x - 1.2, z + d, c); fence(x + 1.2, z + d, x + w, z + d, c); } else fence(x - w, z + d, x + w, z + d, c); };
  const path = (x1, z1, x2, z2, c = 0xb8b3a3) => { const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.95); for (let i = 0; i <= steps; i += 1) { const t = i / steps; const d = disc(x1 + (x2 - x1) * t + (rnd() - 0.5) * 0.25, 0.03, z1 + (z2 - z1) * t, 0.32 + rnd() * 0.1, c); d.scale.y = 0.5; } };
  const flowerbed = (x, z, w, d, cols = [0xe0566a, 0xf0c84a, 0xf3ecd8, 0xc47ad8]) => { B(x, 0.1, z, w, 0.2, d, 0x6b5a40); for (let i = 0; i < w * d * 1.6; i += 1) flower(x - w / 2 + 0.3 + rnd() * (w - 0.6), z - d / 2 + 0.3 + rnd() * (d - 0.6), cols[i % cols.length]); };
  const well = (x, z, stone = 0x9a8f7a, roof = 0x8a4a3a) => { cyl(x, 0.5, z, 0.75, 1.0, stone, 10); cyl(x, 0.5, z, 0.55, 1.04, 0x3b6f8a, 10, 0.2); for (const sx of [-1, 1]) B(x + sx * 0.7, 1.4, z, 0.12, 1.6, 0.12, 0x6d543a); cone(x, 2.45, z, 1.1, 0.7, roof, 4).rotation.y = Math.PI / 4; B(x, 1.9, z, 1.5, 0.08, 0.08, 0x6d543a); cyl(x, 1.6, z, 0.12, 0.26, 0x8a6a45, 8, 0, 1, 0.8); block(x, z, 0.8, 0.8); };
  const bench = (x, z, ry = 0, c = 0xa58c62) => { const s = B(x, 0.55, z, 2.0, 0.14, 0.7, c); s.rotation.y = ry; const b = B(x - Math.sin(ry) * 0.3, 0.95, z - Math.cos(ry) * 0.3, 2.0, 0.6, 0.12, c); b.rotation.y = ry; for (const sx of [-1, 1]) { const l = B(x + Math.cos(ry) * sx * 0.85, 0.25, z - Math.sin(ry) * sx * 0.85, 0.1, 0.5, 0.6, 0x6d543a); l.rotation.y = ry; } };
  const signpost = (x, z, colors = [0xd9c7a8, 0xd9c7a8]) => { cyl(x, 0.9, z, 0.05, 1.8, 0x8a6a45, 5); B(x + 0.3, 1.6, z, 0.7, 0.2, 0.05, colors[0]); B(x - 0.3, 1.3, z, 0.6, 0.2, 0.05, colors[1]); };
  const flagpole = (x, z, c = 0xe0566a, h = 3.4) => { cyl(x, h / 2, z, 0.05, h, 0xd9c7a8, 6); const f = M.B(x + 0.4, h - 0.3, z, 0.8, 0.5, 0.05, c); anim((t) => { f.rotation.y = Math.sin(t * 4 + x) * 0.4; f.scale.x = 0.8 + Math.sin(t * 7 + z) * 0.08; }); };
  const pond = (x, z, r, { water = 0x4aa7c2, rim = 0x8a7a5a, lilies = true, fish = 0, reeds = true } = {}) => {
    pad(x, z, r + 0.5, r + 0.5);
    disc(x, -0.06, z, r + 0.5, rim); disc(x, -0.02, z, r + 0.15, 0x7fc6d8, 0.2); disc(x, 0.0, z, r - 0.25, water, 0.25);
    for (let i = 0; i < Math.round(r * 5); i += 1) { const a = i / Math.round(r * 5) * 6.283; const s = ball(x + Math.cos(a) * (r + 0.3), 0.08, z + Math.sin(a) * (r + 0.3), 0.22 + rnd() * 0.12, pick([0x8c917c, 0x6e7266])); s.scale.y = 0.6; }
    if (reeds) for (let i = 0; i < Math.round(r * 2); i += 1) { const a = rnd() * 6.283; const h = 0.9 + rnd() * 0.6; const cx = x + Math.cos(a) * (r + 0.5); const cz = z + Math.sin(a) * (r + 0.5); cyl(cx, h / 2, cz, 0.03, h, 0x5f8a4a, 4); const tip = ball(cx, h + 0.1, cz, 0.06, 0x6d543a); tip.scale.y = 2; }
    if (lilies) for (let i = 0; i < Math.round(r * 1.5); i += 1) { const a = rnd() * 6.283; const d = rnd() * (r - 0.8); disc(x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d, 0.28, 0x4e9a3f); if (i % 3 === 0) ball(x + Math.cos(a) * d, 0.12, z + Math.sin(a) * d, 0.1, 0xf8c6d8); }
    for (let i = 0; i < fish; i += 1) { const f = new THREE.Group(); group.add(f); const body = M.mesh('box', [0xf08a2a, 0xf3ecd8, 0xf08a2a, 0x2a2a2e][i % 4]); body.scale.set(0.2, 0.1, 0.5); f.add(body); const tl = M.mesh('box', [0xf08a2a, 0xf3ecd8, 0xf08a2a, 0x2a2a2e][i % 4]); tl.scale.set(0.14, 0.08, 0.22); tl.position.z = -0.33; f.add(tl); const y0 = H(x, z) + 0.03; anim((t) => { const a = t * 0.5 + i * 1.57; f.position.set(x + Math.cos(a) * (r * 0.55), y0, z + Math.sin(a) * (r * 0.55)); f.rotation.y = -a - 1.57; tl.rotation.y = Math.sin(t * 6 + i) * 0.5; }); }
    block(x, z, r - 0.3, r - 0.3);
  };
  const bird = (x, y, z, r, c = 0xffffff, k = 0.5) => {
    const g = new THREE.Group(); group.add(g);
    const w1 = M.mesh('box', c); w1.scale.set(0.5, 0.05, 0.14); w1.position.x = -0.25; g.add(w1);
    const w2 = M.mesh('box', c); w2.scale.set(0.5, 0.05, 0.14); w2.position.x = 0.25; g.add(w2);
    const ph = rnd() * 6; const y0 = y + H(x, z);
    anim((t) => { const a = t * k + ph; g.position.set(x + Math.cos(a) * r, y0 + Math.sin(t * 2 + ph) * 0.3, z + Math.sin(a) * r); g.rotation.y = -a; w1.rotation.z = Math.sin(t * 8 + ph) * 0.6; w2.rotation.z = -w1.rotation.z; });
  };
  const butterfly = (x, z, c = 0xf0c84a) => { const g = new THREE.Group(); group.add(g); for (const sx of [-1, 1]) { const w = M.mesh('box', c, 0.3); w.scale.set(0.22, 0.02, 0.16); w.position.x = sx * 0.11; g.add(w); anim((t) => { w.rotation.z = sx * Math.sin(t * 14 + x) * 0.9; }); } const y0 = H(x, z); anim((t) => { g.position.set(x + Math.cos(t * 0.8 + z) * 1.5, y0 + 1.0 + Math.sin(t * 2.2 + x) * 0.3, z + Math.sin(t * 0.6 + x) * 1.5); g.rotation.y = -t * 0.8; }); };
  const sparkle = (x, z, c = 0xd9f06a, n = 10, y = 1.2) => { for (let i = 0; i < n; i += 1) { const fx = x + (rnd() - 0.5) * 6; const fz = z + (rnd() - 0.5) * 6; const f = M.ball(fx, y, fz, 0.05, c, 2.2); const y0 = f.position.y; anim((t) => { f.position.y = y0 + Math.sin(t * 1.3 + i) * 0.5; f.position.x = fx + Math.cos(t * 0.7 + i) * 0.6; f.material.emissiveIntensity = 1 + Math.sin(t * 5 + i) * 1; }); } };
  // Animals, small and still enough to be boxes.
  const sheep = (x, z, ry = 0) => { const b = ball(x, 0.6, z, 0.55, 0xf3ecd8); b.scale.set(0.55, 0.45, 0.7); b.rotation.y = ry; const h = ball(x + Math.sin(ry) * 0.6, 0.65, z + Math.cos(ry) * 0.6, 0.22, 0x3b3b40); h.scale.z = 1.3; for (const [lx, lz] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]]) B(x + lx, 0.15, z + lz, 0.12, 0.3, 0.12, 0x3b3b40); block(x, z, 0.5, 0.5); };
  const chicken = (x, z) => { const b = ball(x, 0.25, z, 0.2, 0xf7f1e1); b.scale.z = 1.3; ball(x, 0.45, z + 0.2, 0.12, 0xf7f1e1); cone(x, 0.44, z + 0.34, 0.04, 0.12, 0xf08a2a, 4).rotation.x = Math.PI / 2; B(x, 0.52, z + 0.2, 0.06, 0.1, 0.1, 0xe0566a); };
  const dog = (x, z, c = 0xd9b45c) => { B(x, 0.45, z, 0.9, 0.5, 0.45, c); ball(x + 0.6, 0.75, z, 0.27, c); B(x + 0.75, 0.68, z, 0.28, 0.18, 0.2, 0x8a6a45); for (const sx of [-1, 1]) B(x + 0.55, 0.95, z + sx * 0.18, 0.12, 0.26, 0.08, 0x8a6a45); for (const [lx, lz] of [[-0.3, -0.15], [-0.3, 0.15], [0.3, -0.15], [0.3, 0.15]]) B(x + lx, 0.1, z + lz, 0.14, 0.26, 0.14, c); const tail = M.B(x - 0.5, 0.6, z, 0.4, 0.08, 0.08, c); anim((t) => { tail.rotation.y = Math.sin(t * 12) * 0.6; }); block(x, z, 0.5, 0.3); };
  const cat = (x, z, c = 0xf3ecd8) => { B(x, 0.2, z, 0.5, 0.25, 0.3, c); ball(x + 0.25, 0.3, z, 0.14, c); for (const sx of [-1, 1]) cone(x + 0.25 + sx * 0.08, 0.45, z, 0.04, 0.1, c, 4); };
  const crab = (x, z) => { const b = B(x, 0.14, z, 0.42, 0.18, 0.3, 0xe0563a); b.rotation.y = rnd() * 3; for (const sx of [-1, 1]) { B(x + sx * 0.28, 0.16, z + 0.14, 0.12, 0.1, 0.16, 0xe0563a); ball(x + sx * 0.1, 0.26, z + 0.12, 0.035, 0x1b1b1b); } };
  const starfish = (x, z, c = 0xf08a2a) => { for (let i = 0; i < 5; i += 1) { const a = B(x + Math.cos(i * 1.2566) * 0.15, 0.05, z - Math.sin(i * 1.2566) * 0.15, 0.5, 0.08, 0.14, c); a.rotation.y = i * 1.2566; } };
  const deer = (x, z, c = 0xa07850) => { B(x, 0.9, z, 0.6, 0.6, 1.2, c); for (const [lx, lz] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) B(x + lx, 0.3, z + lz, 0.12, 0.6, 0.12, 0x8a6a45); B(x, 1.35, z + 0.7, 0.4, 0.5, 0.3, c); B(x, 1.75, z + 0.78, 0.3, 0.4, 0.3, c); for (const sx of [-1, 1]) { B(x + sx * 0.18, 2.1, z + 0.78, 0.04, 0.4, 0.04, 0x6d543a); B(x + sx * 0.28, 2.25, z + 0.78, 0.2, 0.04, 0.04, 0x6d543a); } block(x, z, 0.5, 0.8); };
  const duckOn = (x, z, r, i) => { const d = new THREE.Group(); group.add(d); const body = M.mesh('box', i ? 0xf0c84a : 0x4e7fa8); body.scale.set(0.3, 0.2, 0.45); body.position.y = 0.1; d.add(body); const head = M.mesh('ball', i ? 0xf0c84a : 0x2f6a3a); head.scale.set(0.13, 0.13, 0.13); head.position.set(0, 0.3, 0.2); d.add(head); const beak = M.mesh('box', 0xf08a2a); beak.scale.set(0.08, 0.05, 0.12); beak.position.set(0, 0.28, 0.33); d.add(beak); const y0 = H(x, z); anim((t) => { const a = t * 0.3 + i * 2.1; d.position.set(x + Math.cos(a) * r, y0, z + Math.sin(a) * r); d.rotation.y = -a; }); };
  const boatAt = (x, z, ry = 0.5, hull = 0x8a5a3a) => { const boat = new THREE.Group(); boat.position.set(x, SEA_Y + 0.15, z); boat.rotation.y = ry; group.add(boat); const h = M.mesh('box', hull); h.scale.set(1.0, 0.5, 2.4); h.position.y = 0.25; boat.add(h); const inner = M.mesh('box', 0xd9b45c); inner.scale.set(0.8, 0.3, 2.1); inner.position.y = 0.42; boat.add(inner); for (const zz of [-0.5, 0.5]) { const seat = M.mesh('box', hull); seat.scale.set(1.0, 0.08, 0.3); seat.position.set(0, 0.56, zz); boat.add(seat); } for (const sx of [-1, 1]) { const oar = M.mesh('box', 0xd9c7a8); oar.scale.set(0.06, 0.06, 1.6); oar.position.set(sx * 0.7, 0.55, 0); oar.rotation.y = sx * 0.4; boat.add(oar); } anim((t) => { boat.position.y = SEA_Y + 0.15 + Math.sin(t * 1.4 + x) * 0.05; boat.rotation.z = Math.sin(t * 1.1 + z) * 0.05; }); return boat; };
  const dolphin = (x, z, r = 4) => { const g = new THREE.Group(); group.add(g); const body = M.mesh('box', 0x7f9fb8); body.scale.set(0.5, 0.5, 1.8); g.add(body); const nose = M.mesh('cone', 0x7f9fb8, 0, 1, 6); nose.scale.set(0.3, 0.8, 0.3); nose.rotation.x = Math.PI / 2; nose.position.z = 1.2; g.add(nose); const fin = M.mesh('cone', 0x6a8aa3, 0, 1, 4); fin.scale.set(0.15, 0.5, 0.3); fin.position.y = 0.4; g.add(fin); const tail = M.mesh('box', 0x6a8aa3); tail.scale.set(0.9, 0.08, 0.4); tail.position.z = -1.0; g.add(tail); anim((t) => { const a = t * 0.9; const u = (a % 6.283) / 6.283; const jump = Math.max(0, Math.sin(u * Math.PI * 2 * 1.0)) ; g.position.set(x + Math.cos(a * 0.5) * r, SEA_Y - 0.6 + jump * 2.6, z + Math.sin(a * 0.5) * r); g.rotation.y = -a * 0.5 + Math.PI / 2; g.rotation.x = -Math.cos(u * Math.PI * 2) * 0.9 * (jump > 0.01 ? 1 : 0); }); };

  return {
    group, rnd, half, H, baseH, slope, hill, pad, lift: noLift, Y,
    B, cone, ball, cyl, disc, M, flush, terrain,
    block, anim, pick, clear, spot, scatter, onWay,
    tuft, flower, pebble, boulder, outcrop, tree, pine, palm, bush, house, tower, lantern, torch, puff, fire, campfire,
    fence, fenceRect, path, flowerbed, well, bench, signpost, flagpole, pond, bird, butterfly, sparkle,
    sheep, chicken, dog, cat, crab, starfish, deer, duckOn, boatAt, dolphin,
  };
}
