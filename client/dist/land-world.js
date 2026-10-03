// じぶんの しま — the island a child owns: twelve looks, one builder, two uses.
//
// `buildIslandModel` turns what the server says a child owns (`land:island`: step, size,
// look) into a THREE.Group — ground, sea, jetty and the look's own world — plus the
// obstacles a walk has to respect and the bits that move. The private scene below
// (`createLand`, like マイルーム in room-world.js) walks the child round that group; the
// estate office (land.js) draws the very same group on its cards and on its turntable,
// so what a child buys is exactly what they then stand on. Nothing here decides anything:
// the step and the look are the server's, and this file only knows how each one looks.
//
// Everything is boxes, cones, spheres and cylinders — not one model to download, so a
// class of iPads can walk twelve islands — but each is built like a place rather than a
// diorama: a cliff under the grass, rocks and foam at the waterline, tufts and pebbles
// on the ground, one sun and its shadows. A seeded random makes every build of a look
// identical, so the card in the office and the island under a child's feet agree.
import * as THREE from './three.module.js';
import { say, live } from './canvas-say.js';

export const THEMES = {
  sand:    { ground: 0xf0dca0, edge: 0xd9bf7e, cliff: 0xb89a62, sky: 0x9fd3ea, water: 0x3b9ab8, foam: 0xd8f0f4, fog: 0xbfe3f0, sun: 0xfff0d0 },
  rock:    { ground: 0x8f8b80, edge: 0x6f6b61, cliff: 0x4f4b45, sky: 0xa6c3d3, water: 0x2d7590, foam: 0xdbeef2, fog: 0xbed0d8, sun: 0xfff4e0 },
  grass:   { ground: 0x8fb36a, edge: 0x6f8f4a, cliff: 0x8a6a45, sky: 0x9fd3ea, water: 0x3b9ab8, foam: 0xd8f0f4, fog: 0xbfe3f0, sun: 0xfff0d0 },
  lake:    { ground: 0x93b86e, edge: 0x6f8f4a, cliff: 0x7f6244, sky: 0xa8d8ee, water: 0x3f9fc0, foam: 0xdaf0f4, fog: 0xc4e4f0, sun: 0xfff2d8 },
  forest:  { ground: 0x5f8a4a, edge: 0x4a6e3a, cliff: 0x5a4330, sky: 0x8fc3dc, water: 0x2f7f98, foam: 0xcfe6ee, fog: 0xa9d2df, sun: 0xffe8c0 },
  desert:  { ground: 0xe9c37c, edge: 0xcfa75f, cliff: 0xa8803f, sky: 0xf6dcae, water: 0x3fa8c0, foam: 0xf6ecd0, fog: 0xf0d8b0, sun: 0xffe6a8 },
  flower:  { ground: 0xa6cf74, edge: 0x7f9f55, cliff: 0x8a6a45, sky: 0xaee0f2, water: 0x4aa7c2, foam: 0xdcf2f6, fog: 0xcdeaf3, sun: 0xfff4e0 },
  autumn:  { ground: 0xa89a5c, edge: 0x7f7040, cliff: 0x6a5436, sky: 0xf3c99a, water: 0x3d87a0, foam: 0xf0e2d0, fog: 0xe8c8a8, sun: 0xffc98a },
  snow:    { ground: 0xf2f4f8, edge: 0xc9d6e2, cliff: 0x7e8a96, sky: 0xc7dcea, water: 0x6fa3c0, foam: 0xeaf4f8, fog: 0xdce8f0, sun: 0xeef4ff },
  volcano: { ground: 0x4c4642, edge: 0x332f2c, cliff: 0x221f1d, sky: 0x6a5570, water: 0x27607a, foam: 0xb8b0b8, fog: 0x7d6778, sun: 0xffb088 },
  sky:     { ground: 0xe8eef7, edge: 0xffd766, cliff: 0xcfd6e0, sky: 0x4a6fb0, water: null, clouds: true, fog: 0x7e9ccf, sun: 0xffffff },
  space:   { ground: 0xbfbfc6, edge: 0x8e8e96, cliff: 0x62626a, sky: 0x05070f, water: null, space: true, fog: 0x0a0c18, sun: 0xffffff },
};

// One geometry and one material per shape and colour, shared by every island built in
// this page — the office builds twelve at once, and twelve copies of a box is twelve too many.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const geos = new Map();
const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const mats = new Map();
const mat = (color, glow = 0, opacity = 1) => {
  const key = `${color}:${glow}:${opacity}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.82, metalness: 0, emissive: glow ? color : 0x000000, emissiveIntensity: glow,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 0.5,
    }));
  }
  return mats.get(key);
};
// A small seeded random: the same look builds the same island every time, everywhere.
const seeded = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

export function buildIslandModel(island, opts = {}) {
  const { owner = '', sign = true, liveSign = false, sea = 'wide' } = opts;
  const theme = THEMES[island.theme] || THEMES.grass;
  const grid = island.grid;
  const half = grid / 2;
  const rnd = seeded(`${island.theme}:${grid}`);
  const group = new THREE.Group();
  const obstacles = [];
  const anims = [];
  let unlive = null;

  // ---- shapes --------------------------------------------------------------------------
  const add = (m, x, y, z, solid) => { m.position.set(x, y, z); m.castShadow = solid; m.receiveShadow = true; group.add(m); return m; };
  const B = (x, y, z, w, h, d, color, glow = 0, opacity = 1) => { const m = add(new THREE.Mesh(BOX, mat(color, glow, opacity)), x, y, z, opacity === 1); m.scale.set(w, h, d); return m; };
  const cone = (x, y, z, r, h, color, sides = 8, glow = 0, opacity = 1) => { const m = add(new THREE.Mesh(geo(`cone${sides}`, () => new THREE.ConeGeometry(1, 1, sides)), mat(color, glow, opacity)), x, y, z, opacity === 1); m.scale.set(r, h, r); return m; };
  const ball = (x, y, z, r, color, glow = 0, opacity = 1) => { const m = add(new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(color, glow, opacity)), x, y, z, opacity === 1); m.scale.set(r, r, r); return m; };
  const cyl = (x, y, z, r, h, color, sides = 14, glow = 0, opacity = 1, taper = 1) => { const m = add(new THREE.Mesh(geo(`cyl${sides}:${taper}`, () => new THREE.CylinderGeometry(taper, 1, 1, sides)), mat(color, glow, opacity)), x, y, z, opacity === 1); m.scale.set(r, h, r); return m; };
  const disc = (x, y, z, r, color, glow = 0, opacity = 1) => cyl(x, y, z, r, 0.08, color, 28, glow, opacity);
  const block = (x, z, w, d) => obstacles.push({ x, z, w, d });
  const anim = (fn) => anims.push(fn);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const clear = (x, z, pad = 0.6) => !obstacles.some((o) => Math.abs(x - o.x) < o.w + pad && Math.abs(z - o.z) < o.d + pad);
  // Sprinkle n things on open ground, never inside a building or in the jetty's way.
  const scatter = (n, fn, margin = 1.2) => {
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries += 1) {
      const x = (rnd() * 2 - 1) * (half - margin); const z = (rnd() * 2 - 1) * (half - margin);
      if (!clear(x, z) || (z > half - 2.5 && Math.abs(x) < 1.6)) continue;
      fn(x, z); i += 1;
    }
  };

  // ---- the things most islands share ---------------------------------------------------
  const tuft = (x, z, c = 0x6fae4a) => { for (let i = 0; i < 3; i += 1) cone(x + (rnd() - 0.5) * 0.36, 0.17, z + (rnd() - 0.5) * 0.36, 0.09, 0.34, c, 4); };
  const pebble = (x, z, c = pick([0xb9b3a3, 0x8e8a80, 0xd0c8b4])) => { ball(x, 0.03, z, 0.07 + rnd() * 0.09, c).scale.y = 0.45; };
  const boulder = (x, z, s, c = 0x7d7a72) => { const m = ball(x, s * 0.3, z, s, c); m.scale.y = 0.6; m.rotation.y = rnd() * 3; block(x, z, s * 0.8, s * 0.8); return m; };
  const tree = (x, z, trunk = 0x6d543a, leaf = 0x4e9a3f, s = 1) => {
    cyl(x, 0.9 * s, z, 0.22 * s, 1.8 * s, trunk, 7);
    ball(x, 2.3 * s, z, 1.0 * s, leaf); ball(x + 0.5 * s, 2.0 * s, z + 0.3 * s, 0.7 * s, leaf); ball(x - 0.4 * s, 2.6 * s, z - 0.3 * s, 0.75 * s, leaf);
    block(x, z, 0.35 * s, 0.35 * s);
  };
  const pine = (x, z, s = 1, lit = false, c = 0x2f6a3a) => {
    cyl(x, 0.5 * s, z, 0.17 * s, 1.0 * s, 0x5a4330, 6);
    for (let i = 0; i < 3; i += 1) cone(x, (1.3 + i * 0.9) * s, z, (1.4 - i * 0.35) * s, 1.3 * s, c, 7);
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
  const house = (x, z, w, d, wall, roof, roofH = 1.4, lit = 0.4) => {
    B(x, 1.4, z, w, 2.8, d, wall);
    B(x, 0.15, z, w + 0.4, 0.3, d + 0.4, 0x8a8478);
    B(x, 2.95, z, w + 0.7, 0.3, d + 0.7, roof);
    B(x, 3.3, z, w * 0.74, 0.5, d * 0.74, roof);
    B(x, 3.3 + roofH * 0.5, z, w * 0.38, roofH, d * 0.38, roof);
    B(x, 0.95, z + d / 2 + 0.03, 1.0, 1.9, 0.1, 0x5a3a22); ball(x + 0.32, 0.95, z + d / 2 + 0.1, 0.06, 0xffd766, 0.6);
    for (const sx of [-1, 1]) { B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.03, 0.9, 0.8, 0.08, 0x9fd6e8, lit); B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.06, 1.0, 0.08, 0.05, 0xf3ecd8); B(x + sx * w * 0.3, 1.7, z + d / 2 + 0.06, 0.08, 0.9, 0.05, 0xf3ecd8); }
    block(x, z, w / 2, d / 2);
  };
  const lantern = (x, z, c = 0xffd98a) => { cyl(x, 0.9, z, 0.07, 1.8, 0x3b3b40, 6); B(x, 1.95, z, 0.4, 0.46, 0.4, c, 1.4); B(x, 2.24, z, 0.5, 0.08, 0.5, 0x3b3b40); };
  const flowerbed = (x, z, w, d, cols = [0xe0566a, 0xf0c84a, 0xf3ecd8, 0xc47ad8]) => {
    B(x, 0.1, z, w, 0.2, d, 0x6b5a40);
    for (let i = 0; i < w * d * 1.6; i += 1) { const fx = x - w / 2 + 0.3 + rnd() * (w - 0.6); const fz = z - d / 2 + 0.3 + rnd() * (d - 0.6); cyl(fx, 0.32, fz, 0.03, 0.3, 0x4e9a3f, 4); ball(fx, 0.5, fz, 0.12, cols[i % cols.length]); }
  };
  const puff = (x, y, z, i, c = 0xf3efe6, drift = 0.25) => {
    const s = ball(x, y, z, 0.26 + (i % 3) * 0.08, c, 0, 0.42);
    anim((t) => { const k = (t * 0.55 + i * 0.6) % 2.6; s.position.y = y + k; s.position.x = x + Math.sin(t + i) * drift; const sc = 0.22 + k * 0.16; s.scale.set(sc, sc, sc); s.material.opacity = Math.max(0, 0.42 - k * 0.14); });
  };
  const fire = (x, y, z, s = 1) => {
    const f = cone(x, y + 0.45 * s, z, 0.38 * s, 0.9 * s, 0xff9a3c, 6, 1.8); const g = cone(x, y + 0.3 * s, z, 0.22 * s, 0.6 * s, 0xffe08a, 6, 2.2);
    anim((t) => { f.rotation.y = t * 3; f.scale.y = (0.9 + Math.sin(t * 9) * 0.12) * s; g.scale.y = (0.6 + Math.cos(t * 11) * 0.1) * s; });
  };
  const crab = (x, z) => { const b = B(x, 0.14, z, 0.42, 0.18, 0.3, 0xe0563a); b.rotation.y = rnd() * 3; for (const sx of [-1, 1]) { B(x + sx * 0.28, 0.16, z + 0.14, 0.12, 0.1, 0.16, 0xe0563a); ball(x + sx * 0.1, 0.26, z + 0.12, 0.035, 0x1b1b1b); } };
  const starfish = (x, z, c = 0xf08a2a) => { for (let i = 0; i < 5; i += 1) { const a = B(x, 0.05, z, 0.5, 0.08, 0.14, c); a.rotation.y = i * Math.PI * 2 / 5; a.position.x += Math.cos(i * Math.PI * 2 / 5) * 0.15; a.position.z -= Math.sin(i * Math.PI * 2 / 5) * 0.15; } };
  const bird = (x, y, z, r, c = 0xffffff, k = 0.5) => {
    const g = new THREE.Group(); group.add(g);
    const w1 = new THREE.Mesh(BOX, mat(c)); w1.scale.set(0.5, 0.05, 0.14); w1.position.x = -0.25; g.add(w1);
    const w2 = new THREE.Mesh(BOX, mat(c)); w2.scale.set(0.5, 0.05, 0.14); w2.position.x = 0.25; g.add(w2);
    const ph = rnd() * 6;
    anim((t) => { const a = t * k + ph; g.position.set(x + Math.cos(a) * r, y + Math.sin(t * 2 + ph) * 0.3, z + Math.sin(a) * r); g.rotation.y = -a; w1.rotation.z = Math.sin(t * 8 + ph) * 0.6; w2.rotation.z = -w1.rotation.z; });
  };
  const path = (x1, z1, x2, z2, c = 0xb8b3a3, n = 0) => {
    const steps = n || Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.9);
    for (let i = 0; i <= steps; i += 1) { const t = i / steps; disc(x1 + (x2 - x1) * t + (rnd() - 0.5) * 0.2, 0.02, z1 + (z2 - z1) * t, 0.3 + rnd() * 0.1, c); }
  };
  const fence = (x1, z1, x2, z2, c = 0xd4c49b) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1)));
    for (let i = 0; i <= n; i += 1) { const t = i / n; B(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t, 0.14, 1.0, 0.14, c); }
    for (const y of [0.45, 0.8]) { const r = B((x1 + x2) / 2, y, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), 0.1, 0.1, c); r.rotation.y = -Math.atan2(z2 - z1, x2 - x1); }
  };

  // The sign with the child's own name on it, re-painted when the language changes.
  function makeSign(x, z) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    let mesh = null;
    const paint = () => {
      const c = canvas.getContext('2d');
      c.fillStyle = '#f7f1e1'; c.fillRect(0, 0, 512, 160);
      c.strokeStyle = '#c9b98a'; c.lineWidth = 8; c.strokeRect(8, 8, 496, 144);
      c.fillStyle = '#1b3a2f'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center';
      c.fillText(say(`${owner}の しま`), 256, 70);
      c.font = '30px sans-serif'; c.fillStyle = '#7a5a3e';
      c.fillText(`${owner}'s Island`, 256, 122);
      if (mesh) mesh.material.map.needsUpdate = true;
    };
    paint();
    const tex = new THREE.CanvasTexture(canvas);
    mesh = add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: tex })), x, 2.1, z, false);
    B(x, 1.0, z - 0.06, 0.16, 2.0, 0.16, 0x6d543a); B(x, 2.65, z - 0.06, 3.4, 0.12, 0.2, 0x6d543a);
    if (liveSign) unlive = live(paint);
  }

  // ---- the ground every island stands on ---------------------------------------------
  function ground() {
    B(0, -0.4, 0, grid, 0.8, grid, theme.ground);
    B(0, -1.1, 0, grid - 0.5, 0.7, grid - 0.5, theme.edge);
    B(0, -1.95, 0, grid - 1.4, 1.1, grid - 1.4, theme.cliff);
    if (theme.space) { const r = ball(0, -half * 0.55, 0, half * 0.92, theme.cliff); r.scale.y = 0.75; }
    // Rocks along the waterline, part sunk, in two greys; none across the jetty.
    const per = Math.round(grid * 1.5);
    for (let i = 0; i < per; i += 1) {
      const t = i / per * 4; const side = Math.floor(t); const u = (t - side) * grid - half;
      const r = half + 0.05 + rnd() * 0.4;
      const [x, z] = [[u, -r], [r, u], [-u, r], [-r, -u]][side];
      if (z > half - 1 && Math.abs(x) < 1.8) continue;
      const m = ball(x, -0.45 + rnd() * 0.35, z, 0.28 + rnd() * 0.3, pick([0x8c917c, 0x6e7266, 0xa09a8c])); m.scale.y = 0.7; m.rotation.y = rnd() * 3;
    }
    if (theme.water) {
      if (sea === 'wide') B(0, -2.0, 0, grid * 8, 0.3, grid * 8, theme.water, 0.05);
      else cyl(0, -2.0, 0, grid * 1.3, 0.3, theme.water, 48, 0.05);
      // Foam where the sea meets the cliff, a fainter ring further out, and the shallows.
      B(0, -1.84, 0, grid + 1.0, 0.03, grid + 1.0, theme.foam, 0.1, 0.72);
      B(0, -1.845, 0, grid + 2.4, 0.03, grid + 2.4, theme.foam, 0.1, 0.3);
      B(0, -1.85, 0, grid + 4.4, 0.02, grid + 4.4, theme.foam, 0.1, 0.12);
      for (let i = 0; i < 12; i += 1) { const a = rnd() * Math.PI * 2; const r = half + 3 + rnd() * (sea === 'wide' ? half * 2 : half * 0.4); const w = B(Math.cos(a) * r, -1.83, Math.sin(a) * r, 0.9 + rnd() * 1.2, 0.02, 0.12, theme.foam, 0.1, 0.35); w.rotation.y = rnd() * 3; anim((t) => { w.material.opacity = 0.25 + Math.sin(t * 1.3 + i) * 0.15; }); }
    }
    if (theme.clouds) for (let i = 0; i < 16; i += 1) { const a = i * 0.4; const r = half + 1.5 + (i % 3) * 1.2; const c = ball(Math.cos(a) * r, -1.4 - (i % 2) * 0.7, Math.sin(a) * r, 1.6 + (i % 3) * 0.6, 0xffffff, 0.05, 0.9); c.scale.y = 0.55; anim((t) => { c.position.y = -1.4 - (i % 2) * 0.7 + Math.sin(t * 0.5 + i) * 0.2; }); }
    // The jetty: where a child arrives, and where they leave. Planks, posts, a rope.
    B(0, -0.1, half + 1.5, 2.2, 0.2, 3.4, 0xb49a6a);
    for (let i = 0; i < 6; i += 1) B(0, 0.005, half + 0.2 + i * 0.62, 2.22, 0.02, 0.05, 0x8a6a45);
    for (const sx of [-1, 1]) for (const zz of [half + 0.5, half + 2.9]) { cyl(sx * 1.05, -0.5, zz, 0.1, 1.8, 0x8a6a45, 6); ball(sx * 1.05, 0.42, zz, 0.13, 0x6d543a); }
    for (const sx of [-1, 1]) B(sx * 1.05, 0.25, half + 1.7, 0.04, 0.04, 2.4, 0xd9c7a8);
    if (sign) makeSign(2.3, half - 1.3);
  }

  // ---- the twelve islands -------------------------------------------------------------
  const BUILD = {
    sand() {
      palm(-half + 3.5, -half + 3.5); palm(half - 4, -half + 5, -1); palm(-half + 3, 2);
      // The tent: a four-sided cone, a flap, pegs and a rope.
      cone(0, 1.3, -2, 2.4, 2.6, 0xe0566a, 4).rotation.y = Math.PI / 4; cone(0, 2.1, -2, 0.55, 1.0, 0xf3ecd8, 4).rotation.y = Math.PI / 4;
      B(0, 0.55, -0.35, 0.9, 1.1, 0.1, 0x3b2a1a); block(0, -2, 1.6, 1.6);
      for (const [px, pz] of [[-2.2, -0.2], [2.2, -0.2], [-2.2, -3.8], [2.2, -3.8]]) cyl(px, 0.1, pz, 0.04, 0.3, 0x6d543a, 4);
      // The campfire: stones, logs, a flame that flickers, and a log to sit on.
      for (let i = 0; i < 8; i += 1) { const s = ball(4 + Math.cos(i * 0.785) * 0.9, 0.12, 2 + Math.sin(i * 0.785) * 0.9, 0.24, 0x8c917c); s.scale.y = 0.6; }
      B(4, 0.3, 2, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = 0.7; B(4, 0.4, 2, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = -0.7;
      fire(4, 0.4, 2); block(4, 2, 0.9, 0.9); cyl(4, 0.25, 3.8, 0.25, 1.8, 0x8a6a45, 7).rotation.z = Math.PI / 2;
      // A parasol and a towel, a sandcastle, a bucket and a surfboard against a palm.
      cyl(-4, 1.2, 4, 0.05, 2.4, 0x9a8f7a, 6); cone(-4, 2.5, 4, 1.5, 0.5, 0xe0566a, 10); cone(-4, 2.52, 4, 1.0, 0.36, 0xf3ecd8, 10);
      B(-4.2, 0.03, 5.6, 1.1, 0.05, 2.0, 0x6fd0ff); for (let i = 0; i < 4; i += 1) B(-4.2, 0.04, 4.8 + i * 0.5, 1.1, 0.05, 0.2, 0xf3ecd8);
      for (let i = 0; i < 4; i += 1) { cyl(-1 + Math.cos(i * 1.57) * 0.7, 0.35, 4.5 + Math.sin(i * 1.57) * 0.7, 0.3, 0.7, 0xe3cc8e, 10); cone(-1 + Math.cos(i * 1.57) * 0.7, 0.9, 4.5 + Math.sin(i * 1.57) * 0.7, 0.33, 0.5, 0xd9bf7e, 10); }
      B(-1, 0.3, 4.5, 1.2, 0.6, 1.2, 0xe3cc8e); B(-1, 0.75, 4.5, 0.03, 0.5, 0.03, 0x6d543a); B(-0.85, 0.9, 4.5, 0.3, 0.2, 0.03, 0xe0566a); block(-1, 4.5, 0.9, 0.9);
      cyl(0.8, 0.22, 5, 0.22, 0.44, 0xf0c84a, 10, 0, 1, 0.8); B(1.4, 0.05, 5.2, 0.5, 0.06, 0.12, 0x4e7fa8);
      const board = B(-half + 4.1, 1.1, -half + 3.3, 0.5, 2.3, 0.1, 0x6fd0ff); board.rotation.x = 0.25; B(-half + 4.1, 1.1, -half + 3.28, 0.12, 2.3, 0.1, 0xf3ecd8).rotation.x = 0.25;
      for (const [sx, sz] of [[-3, 2], [2, -4.5], [-4.5, -2.5], [3.5, -1]]) starfish(sx, sz, pick([0xf08a2a, 0xe0566a, 0xc47ad8]));
      for (const [sx, sz] of [[3.5, 4.5], [-2, -3.5], [5, -3], [1.5, 1.2]]) ball(sx, 0.1, sz, 0.14, 0xf3ecd8).scale.y = 0.6;
      ball(-3.5, 0.5, 1.5, 0.5, 0xe0566a); B(-3.5, 0.5, 1.5, 0.3, 1.0, 1.02, 0xf3ecd8); B(-3.5, 0.5, 1.5, 1.02, 1.0, 0.3, 0x6fd0ff); block(-3.5, 1.5, 0.4, 0.4);
      crab(2.5, 3.8); crab(-5, -4.5); tuft(half - 2, half - 3, 0xb9c76a); tuft(-half + 2, -half + 6, 0xb9c76a);
      scatter(Math.round(grid * 0.8), pebble); for (let i = 0; i < 3; i += 1) bird(0, 7 + i, 0, half * 0.8 + i, 0xffffff, 0.35 + i * 0.1);
    },
    rock() {
      // The lighthouse on the far corner: stone foot, striped tower, lamp, a turning beam.
      const lx = -half + 4.2; const lz = -half + 4.2;
      cyl(lx, 0.3, lz, 1.5, 0.6, 0x7a766c, 14); cyl(lx, 2.9, lz, 1.05, 4.6, 0xf3ecd8, 14, 0, 1, 0.75);
      for (const y of [1.6, 3.4]) cyl(lx, y, lz, 1.0 - (y - 0.6) * 0.055, 0.6, 0xe0564a, 14, 0, 1, 0.94);
      cyl(lx, 5.3, lz, 1.0, 0.25, 0x3b3b40, 14); cyl(lx, 5.85, lz, 0.6, 0.9, 0x9fd6e8, 10, 0.5, 0.8); ball(lx, 5.85, lz, 0.32, 0xffe08a, 2.2);
      cone(lx, 6.65, lz, 0.85, 0.7, 0xe0564a, 10); B(lx, 7.15, lz, 0.05, 0.4, 0.05, 0x3b3b40); ball(lx, 7.4, lz, 0.08, 0xffd766, 1);
      const pivot = new THREE.Group(); pivot.position.set(lx, 5.85, lz); group.add(pivot);
      const beam = new THREE.Mesh(BOX, mat(0xffe9a8, 0.9, 0.22)); beam.scale.set(5.2, 0.28, 0.5); beam.position.set(2.6, 0, 0); pivot.add(beam);
      anim((t) => { pivot.rotation.y = t * 1.1; });
      B(lx + 1.0, 0.95, lz + 1.25, 0.7, 1.4, 0.1, 0x5a3a22); block(lx, lz, 1.4, 1.4);
      // The keeper's hut, a bell on a post, a stacked-stone wall.
      house(3, -3.5, 3.6, 3.0, 0x9a948a, 0x5a5a66, 1.0); fence(0.5, -5.5, 0.5, -1.4, 0x8a8478);
      cyl(-3, 1.1, -5, 0.08, 2.2, 0x3b3b40, 6); B(-3, 2.3, -5, 0.8, 0.1, 0.1, 0x3b3b40); cone(-3, 1.85, -5, 0.28, 0.5, 0xd9a040, 10); ball(-3, 1.6, -5, 0.09, 0x6d543a);
      // Tide pools with crabs and starfish, boulders big and small, driftwood.
      for (const [px, pz, r] of [[3.5, 3.5, 1.6], [-4, 3, 1.2], [1, half - 4.5, 0.9]]) { disc(px, -0.02, pz, r + 0.3, 0x6e6a60); disc(px, 0.0, pz, r, 0x3fa8c0, 0.35); starfish(px - r * 0.4, pz + r * 0.3, 0xf08a2a); for (let i = 0; i < 6; i += 1) { const s = ball(px + Math.cos(i * 1.05) * (r + 0.25), 0.05, pz + Math.sin(i * 1.05) * (r + 0.25), 0.22, pick([0x8c917c, 0x6e7266])); s.scale.y = 0.6; } }
      crab(3.0, 2.2); crab(-5.2, 3.6); crab(0.4, half - 3.8);
      boulder(-2, 1.5, 1.4, 0x6e6a60); boulder(half - 3, -1, 1.1, 0x7d7a72); boulder(half - 2.6, 1, 0.7); boulder(-half + 2.5, -1, 0.8, 0x5d5952);
      cyl(0, 0.2, 2.5, 0.2, 2.6, 0xb0a08a, 6).rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i += 1) { cyl(half - 2 + (i % 2) * 0.5, 0.6, -half + 2 + i * 1.1, 0.06, 1.2, 0x8a6a45, 5); ball(half - 2 + (i % 2) * 0.5, 1.3, -half + 2 + i * 1.1, 0.14, 0xffffff).scale.set(0.14, 0.18, 0.22); }
      scatter(Math.round(grid * 1.4), pebble); scatter(6, (x, z) => tuft(x, z, 0x8aa06a));
      for (let i = 0; i < 4; i += 1) bird(lx, 6 + i * 0.8, lz, 4 + i * 1.5, 0xffffff, 0.4 + i * 0.1);
    },
    grass() {
      house(-2, -3, 4.2, 3.4, 0xd9b45c, 0x8a4a3a);
      path(0, half - 1, -2, -1.1);
      // A fence round a little yard with a gate, three trees, a flower bed, a well.
      fence(-0.5, half - 3.5, 6, half - 3.5); fence(6, half - 3.5, 6, half - 7.5);
      tree(half - 3, -half + 3); tree(-half + 3, half - 4); tree(half - 3.5, 2.5, 0x6d543a, 0x4e9a3f, 1.2);
      flowerbed(3.5, -2, 3, 2);
      cyl(-5, 0.5, 2.5, 0.75, 1.0, 0x9a8f7a, 10); cyl(-5, 0.5, 2.5, 0.55, 1.04, 0x3b6f8a, 10, 0.2); for (const sx of [-1, 1]) B(-5 + sx * 0.7, 1.4, 2.5, 0.12, 1.6, 0.12, 0x6d543a); cone(-5, 2.45, 2.5, 1.1, 0.7, 0x8a4a3a, 4).rotation.y = Math.PI / 4; B(-5, 1.9, 2.5, 1.5, 0.08, 0.08, 0x6d543a); cyl(-5, 1.6, 2.5, 0.12, 0.26, 0x8a6a45, 8, 0, 1, 0.8); block(-5, 2.5, 0.8, 0.8);
      // The dog house, and a dog whose tail wags.
      B(-5, 0.6, 5, 1.3, 1.2, 1.3, 0xb4703f); cone(-5, 1.6, 5, 1.1, 0.9, 0x8a4a3a, 4).rotation.y = Math.PI / 4; B(-5, 0.45, 5.7, 0.6, 0.8, 0.1, 0x3b3b40); block(-5, 5, 0.7, 0.7);
      B(-3.6, 0.45, 5.2, 0.9, 0.5, 0.45, 0xd9b45c); ball(-3.0, 0.75, 5.2, 0.27, 0xd9b45c); B(-2.85, 0.68, 5.2, 0.28, 0.18, 0.2, 0x8a6a45); for (const sx of [-1, 1]) B(-3.05, 0.95, 5.2 + sx * 0.18, 0.12, 0.26, 0.08, 0x8a6a45);
      for (const [lx, lz] of [[-3.9, 5.0], [-3.9, 5.4], [-3.3, 5.0], [-3.3, 5.4]]) B(lx, 0.1, lz, 0.14, 0.26, 0.14, 0xd9b45c);
      const tail = B(-4.1, 0.6, 5.2, 0.4, 0.08, 0.08, 0xd9b45c); anim((t) => { tail.rotation.y = Math.sin(t * 12) * 0.6; });
      // A haystack, a mailbox, a pumpkin patch, a bird on the fence, and grass everywhere.
      cone(4.5, 0.9, half - 5.5, 1.2, 1.8, 0xe3cc8e, 9); block(4.5, half - 5.5, 0.7, 0.7);
      cyl(2, 0.6, half - 2.2, 0.05, 1.2, 0x3b3b40, 5); B(2, 1.3, half - 2.2, 0.5, 0.36, 0.3, 0xe0566a); B(2.3, 1.45, half - 2.2, 0.06, 0.2, 0.04, 0xf3ecd8);
      for (let i = 0; i < 4; i += 1) { const px = 1.5 + i * 0.9; ball(px, 0.22, 2.5 + (i % 2) * 0.4, 0.26, 0xf08a2a).scale.y = 0.75; cyl(px, 0.5, 2.5 + (i % 2) * 0.4, 0.04, 0.2, 0x4e9a3f, 4); }
      ball(-3.5, 0.3, 4, 0.3, 0xf3ecd8); ball(1, 1.3, half - 3.5, 0.12, 0x4e7fa8); cone(1.14, 1.3, half - 3.5, 0.05, 0.12, 0xf0c84a, 4).rotation.z = -Math.PI / 2;
      scatter(Math.round(grid * 1.8), (x, z) => tuft(x, z)); scatter(6, (x, z) => ball(x, 0.08, z, 0.08, pick([0xf3ecd8, 0xf0c84a])));
      bird(0, 7, 0, half * 0.7, 0xffffff, 0.4);
    },
    lake() {
      // The lake in the middle, its shallows, reeds and lily pads; a pier, a rowboat.
      const r = half * 0.4;
      disc(0, -0.05, -1, r + 0.5, 0xb9a97a); disc(0, -0.03, -1, r + 0.2, 0x7fc6d8, 0.2); disc(0, -0.01, -1, r - 0.3, theme.water, 0.2); block(0, -1, r - 0.4, r - 0.4);
      for (let i = 0; i < 14; i += 1) { const a = i / 14 * Math.PI * 2; if (a > 1.1 && a < 2.0) continue; const cx = Math.cos(a) * (r + 0.25); const cz = -1 + Math.sin(a) * (r + 0.25); for (let k = 0; k < 3; k += 1) { const h = 1.0 + rnd() * 0.6; cyl(cx + (rnd() - 0.5) * 0.4, h / 2, cz + (rnd() - 0.5) * 0.4, 0.03, h, 0x5f8a4a, 4); ball(cx + (rnd() - 0.5) * 0.4, h + 0.1, cz + (rnd() - 0.5) * 0.4, 0.07, 0x6d543a).scale.y = 2; } }
      for (let i = 0; i < 7; i += 1) { const a = rnd() * 6.28; const d = rnd() * (r - 1); disc(Math.cos(a) * d, 0.02, -1 + Math.sin(a) * d, 0.3, 0x4e9a3f); if (i % 3 === 0) ball(Math.cos(a) * d, 0.12, -1 + Math.sin(a) * d, 0.12, 0xf8c6d8); }
      for (let i = 0; i < 5; i += 1) B(0.6 + i * 0.66, 0.12, r + 0.2, 0.6, 0.1, 1.1, 0xb49a6a); for (const sx of [0.4, 3.2]) cyl(sx, -0.2, r + 0.75, 0.08, 1.2, 0x8a6a45, 6);
      cyl(3.6, 0.9, r + 0.4, 0.03, 2.2, 0x3b2a1a, 4).rotation.z = -0.6; B(2.3, 1.2, r - 0.6, 0.015, 1.9, 0.015, 0xf3ecd8); ball(2.3, 0.08, r - 0.6, 0.08, 0xe0566a);
      const boat = new THREE.Group(); boat.position.set(-r * 0.4, -0.02, -1 - r * 0.3); group.add(boat);
      const hull = new THREE.Mesh(BOX, mat(0x8a5a3a)); hull.scale.set(1.0, 0.5, 2.4); hull.position.y = 0.25; hull.castShadow = true; boat.add(hull);
      const inner = new THREE.Mesh(BOX, mat(0xd9b45c)); inner.scale.set(0.8, 0.3, 2.1); inner.position.y = 0.42; boat.add(inner);
      for (const z of [-0.5, 0.5]) { const seat = new THREE.Mesh(BOX, mat(0x8a5a3a)); seat.scale.set(1.0, 0.08, 0.3); seat.position.set(0, 0.56, z); boat.add(seat); }
      for (const sx of [-1, 1]) { const oar = new THREE.Mesh(BOX, mat(0xd9c7a8)); oar.scale.set(0.06, 0.06, 1.6); oar.position.set(sx * 0.7, 0.55, 0); oar.rotation.y = sx * 0.4; boat.add(oar); }
      anim((t) => { boat.position.y = -0.02 + Math.sin(t * 1.4) * 0.05; boat.rotation.z = Math.sin(t * 1.1) * 0.05; boat.rotation.y = 0.5 + Math.sin(t * 0.3) * 0.1; });
      // Ducks on the water, going round; a boathouse and a willow on the shore.
      for (let i = 0; i < 3; i += 1) { const d = new THREE.Group(); group.add(d); const body = new THREE.Mesh(BOX, mat(i ? 0xf0c84a : 0x4e7fa8)); body.scale.set(0.3, 0.2, 0.45); body.position.y = 0.1; d.add(body); const head = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(i ? 0xf0c84a : 0x2f6a3a)); head.scale.set(0.13, 0.13, 0.13); head.position.set(0, 0.3, 0.2); d.add(head); const beak = new THREE.Mesh(BOX, mat(0xf08a2a)); beak.scale.set(0.08, 0.05, 0.12); beak.position.set(0, 0.28, 0.33); d.add(beak); anim((t) => { const a = t * 0.3 + i * 2.1; d.position.set(Math.cos(a) * (r * 0.55), 0, -1 + Math.sin(a) * (r * 0.55)); d.rotation.y = -a; }); }
      house(-half + 3.6, half - 4.6, 3.4, 2.8, 0xb48a5a, 0x5a6e7a, 1.0); cyl(-half + 3.6, 0.5, half - 2.4, 0.12, 1.0, 0x8a6a45, 6); B(-half + 3.6, 1.05, half - 2.4, 0.6, 0.4, 0.06, 0xf3ecd8);
      cyl(half - 3.5, 1.2, -half + 3.5, 0.26, 2.4, 0x6d543a, 7); ball(half - 3.5, 2.8, -half + 3.5, 1.3, 0x7fb86a).scale.y = 0.8; for (let i = 0; i < 10; i += 1) { const a = i * 0.63; B(half - 3.5 + Math.cos(a) * 1.3, 2.0, -half + 3.5 + Math.sin(a) * 1.3, 0.12, 1.8, 0.12, 0x8fc37a); } block(half - 3.5, -half + 3.5, 0.5, 0.5);
      tree(half - 3, 3, 0x6d543a, 0x4e9a3f, 0.9); tree(-half + 3, -half + 4, 0x6d543a, 0x3f7a35, 1.1);
      B(half - 2.8, 0.25, half - 3, 1.0, 0.1, 1.6, 0xb49a6a); B(half - 2.8, 0.5, half - 3.6, 1.0, 0.5, 0.1, 0xb49a6a);
      scatter(Math.round(grid * 1.6), (x, z) => tuft(x, z, 0x6fae4a)); scatter(8, (x, z) => ball(x, 0.08, z, 0.08, pick([0xf3ecd8, 0xf0c84a, 0xf8c6d8])));
      bird(0, 6, -1, half * 0.6, 0xffffff, 0.45);
    },
    forest() {
      // Logs stacked into a house, a stone chimney with smoke, and trees all round.
      for (let i = 0; i < 5; i += 1) { cyl(0, 0.3 + i * 0.5, -3, 0.26, 5.2, i % 2 ? 0x8a6a45 : 0x7a5a3a, 8).rotation.z = Math.PI / 2; cyl(0, 0.3 + i * 0.5, -3, 0.26, 3.8, i % 2 ? 0x8a6a45 : 0x7a5a3a, 8).rotation.x = Math.PI / 2; }
      B(0, 1.4, -3, 4.6, 2.6, 3.2, 0x7a5a3a);
      B(0, 3.0, -3, 5.8, 0.3, 4.4, 0x5a4330); B(0, 3.5, -3, 4.0, 0.7, 3.0, 0x5a4330); B(0, 4.2, -3, 1.8, 0.7, 1.4, 0x5a4330);
      B(1.6, 3.9, -3.8, 0.7, 1.6, 0.7, 0x9a8f7a); for (let i = 0; i < 4; i += 1) puff(1.6, 4.8, -3.8, i, 0xe8e4dc);
      B(0, 0.9, -1.35, 1.0, 1.8, 0.1, 0x3b2a1a); B(1.6, 1.6, -1.35, 0.8, 0.7, 0.08, 0xffd98a, 0.9); B(-1.6, 1.6, -1.35, 0.8, 0.7, 0.08, 0xffd98a, 0.9); block(0, -3, 2.6, 1.9);
      path(0, half - 1, 0, -1.2, 0x9a8f7a);
      for (let i = 0; i < 10; i += 1) { const a = i * 0.63 + 0.3; const r = half - 2.6; if (Math.abs(Math.cos(a) * r) < 1.6 && Math.sin(a) > 0.5) continue; if (i % 3 === 2) pine(Math.cos(a) * r, Math.sin(a) * r, 1.1); else tree(Math.cos(a) * r, Math.sin(a) * r, 0x5a4330, i % 2 ? 0x3f7a35 : 0x4e9a3f, 1 + (i % 2) * 0.25); }
      // The pond and its jetty, lanterns along the way, mushrooms, a stump and an axe.
      disc(4.5, -0.03, 3.5, 2.6, 0x8a7a5a); disc(4.5, 0, 3.5, 2.3, 0x4aa7c2, 0.25); block(4.5, 3.5, 2.0, 2.0); for (let i = 0; i < 3; i += 1) disc(4.5 + Math.cos(i * 2) * 1.2, 0.03, 3.5 + Math.sin(i * 2) * 1.2, 0.25, 0x4e9a3f);
      for (let i = 0; i < 4; i += 1) B(2.4 + i * 0.7, 0.3, 3.5, 0.66, 0.12, 1.2, 0xb49a6a);
      for (let i = 0; i < 3; i += 1) lantern(-4 + i * 2.2, half - 3.2);
      for (let i = 0; i < 6; i += 1) { const mx = -half + 2 + rnd() * (grid - 4); const mz = -half + 2 + rnd() * (grid - 6); if (!clear(mx, mz, 0.4)) continue; cyl(mx, 0.18, mz, 0.08, 0.36, 0xf3ecd8, 6); const cap = ball(mx, 0.4, mz, 0.26, pick([0xe0563a, 0xf08a2a])); cap.scale.y = 0.6; for (let k = 0; k < 3; k += 1) ball(mx + (rnd() - 0.5) * 0.3, 0.5, mz + (rnd() - 0.5) * 0.3, 0.04, 0xffffff); }
      cyl(-3.5, 0.3, -half + 4, 0.5, 0.6, 0x8a6a45, 9); disc(-3.5, 0.61, -half + 4, 0.48, 0xd9b45c); B(-3.3, 0.9, -half + 4, 0.06, 0.7, 0.06, 0x6d543a).rotation.z = 0.4; B(-3.05, 1.2, -half + 4, 0.3, 0.2, 0.08, 0x9a9a9a); block(-3.5, -half + 4, 0.5, 0.5);
      for (let i = 0; i < 6; i += 1) cyl(-5.5 + (i % 3) * 0.5, 0.25 + Math.floor(i / 3) * 0.45, -half + 2.5, 0.22, 1.6, 0x8a6a45, 7).rotation.x = Math.PI / 2;
      // A swing that swings, a deer that stands still, ferns, fireflies at dusk-height.
      for (const sx of [-1, 1]) cyl(-4.5 + sx * 1.2, 1.3, 1, 0.08, 2.6, 0x6d543a, 6); B(-4.5, 2.6, 1, 2.6, 0.14, 0.14, 0x6d543a);
      const swing = new THREE.Group(); swing.position.set(-4.5, 2.6, 1); group.add(swing);
      for (const sx of [-1, 1]) { const rope = new THREE.Mesh(BOX, mat(0xf3ecd8)); rope.scale.set(0.04, 1.6, 0.04); rope.position.set(sx * 0.45, -0.8, 0); swing.add(rope); } const seat = new THREE.Mesh(BOX, mat(0xd9b45c)); seat.scale.set(1.0, 0.1, 0.4); seat.position.y = -1.6; swing.add(seat); anim((t) => { swing.rotation.x = Math.sin(t * 1.6) * 0.35; }); block(-4.5, 1, 0.6, 0.4);
      const dx = half - 4; const dz = half - 4.5; B(dx, 0.9, dz, 0.6, 0.6, 1.2, 0xa07850); for (const [lx, lz] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) B(dx + lx, 0.3, dz + lz, 0.12, 0.6, 0.12, 0x8a6a45); B(dx, 1.35, dz + 0.7, 0.4, 0.5, 0.3, 0xa07850); B(dx, 1.75, dz + 0.78, 0.3, 0.4, 0.3, 0xa07850); for (const sx of [-1, 1]) { B(dx + sx * 0.18, 2.1, dz + 0.78, 0.04, 0.4, 0.04, 0x6d543a); B(dx + sx * 0.28, 2.25, dz + 0.78, 0.2, 0.04, 0.04, 0x6d543a); } block(dx, dz, 0.5, 0.8);
      scatter(10, (x, z) => { for (let k = 0; k < 4; k += 1) cone(x + Math.cos(k * 1.57) * 0.25, 0.3, z + Math.sin(k * 1.57) * 0.25, 0.12, 0.6, 0x3f7a35, 4).rotation.z = Math.cos(k * 1.57) * 0.5; });
      for (let i = 0; i < 10; i += 1) { const fx = (rnd() * 2 - 1) * (half - 2); const fz = (rnd() * 2 - 1) * (half - 2); const f = ball(fx, 1.2, fz, 0.05, 0xd9f06a, 2.2); anim((t) => { f.position.y = 1.2 + Math.sin(t * 1.3 + i) * 0.5; f.position.x = fx + Math.cos(t * 0.7 + i) * 0.6; f.material.emissiveIntensity = 1 + Math.sin(t * 5 + i) * 1; }); }
      scatter(Math.round(grid * 0.8), (x, z) => tuft(x, z, 0x4e8a3f));
    },
    desert() {
      // Dunes, a small pyramid and its smaller twin, the oasis with its palms.
      for (const [dx, dz, s] of [[-3, 3, 2.6], [half - 5, -2, 2.0], [2, half - 5, 1.6]]) { const d = ball(dx, -0.2, dz, s, 0xf0cc88); d.scale.y = 0.28; }
      cone(-half + 4.5, 1.6, -half + 4.5, 2.8, 3.2, 0xd8b474, 4).rotation.y = Math.PI / 4; cone(-half + 4.5, 3.25, -half + 4.5, 0.3, 0.3, 0xffd766, 4, 0.6).rotation.y = Math.PI / 4; block(-half + 4.5, -half + 4.5, 1.9, 1.9);
      cone(-half + 8, 0.9, -half + 3.5, 1.5, 1.8, 0xd8b474, 4).rotation.y = Math.PI / 4; block(-half + 8, -half + 3.5, 1.0, 1.0);
      disc(3.5, -0.04, 2, 3.3, 0xc7a35a); disc(3.5, -0.02, 2, 3.0, 0x7fc6d8, 0.2); disc(3.5, 0, 2, 2.4, theme.water, 0.3); block(3.5, 2, 1.9, 1.9);
      palm(5.8, 4.4, -1); palm(1.2, 4.6, 1); palm(6.2, 0.2, -1, 0x4e8a3f);
      for (let i = 0; i < 8; i += 1) { const a = i * 0.785; const h = 0.7 + rnd() * 0.5; cyl(3.5 + Math.cos(a) * 2.7, h / 2, 2 + Math.sin(a) * 2.7, 0.03, h, 0x6fae4a, 4); }
      // The camel, a striped tent with its rug, cacti in flower, a well and a signpost.
      const cx = -3.5; const cz = half - 4.5;
      B(cx, 1.15, cz, 1.0, 0.9, 1.8, 0xc9a05a); ball(cx, 1.8, cz - 0.1, 0.5, 0xc9a05a); B(cx, 1.7, cz + 1.0, 0.4, 1.0, 0.4, 0xc9a05a).rotation.x = -0.4; B(cx, 2.3, cz + 1.35, 0.42, 0.42, 0.7, 0xc9a05a); for (const sx of [-1, 1]) B(cx + sx * 0.18, 2.55, cz + 1.2, 0.08, 0.18, 0.08, 0xc9a05a);
      for (const [lx, lz] of [[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]]) B(cx + lx, 0.35, cz + lz, 0.18, 0.7, 0.18, 0xb8904e); B(cx, 1.0, cz - 1.0, 0.08, 0.6, 0.08, 0xb8904e); B(cx, 1.3, cz, 1.1, 0.12, 1.0, 0xe0566a); block(cx, cz, 0.6, 1.0);
      cone(half - 4, 1.2, half - 4.5, 2.2, 2.4, 0xe0566a, 8); cone(half - 4, 1.9, half - 4.5, 1.0, 1.0, 0xf3ecd8, 8); B(half - 4, 0.5, half - 2.4, 0.7, 1.0, 0.1, 0x3b2a1a); block(half - 4, half - 4.5, 1.4, 1.4);
      B(half - 4, 0.03, half - 1.8, 2.0, 0.05, 1.2, 0xc8302a); B(half - 4, 0.04, half - 1.8, 1.6, 0.05, 0.8, 0xf0c84a);
      for (const [kx, kz] of [[half - 3, -half + 4], [-half + 3, 1], [1, -2], [-half + 7, half - 3]]) { cyl(kx, 0.8, kz, 0.22, 1.6, 0x4e8a3f, 8); for (const sx of [-1, 1]) { B(kx + sx * 0.45, 0.9, kz, 0.5, 0.16, 0.16, 0x4e8a3f); B(kx + sx * 0.6, 1.25, kz, 0.16, 0.7, 0.16, 0x4e8a3f); } ball(kx, 1.65, kz, 0.12, 0xf8c6d8); block(kx, kz, 0.3, 0.3); }
      cyl(0, 0.5, 4.5, 0.7, 1.0, 0xb8904e, 10); cyl(0, 0.5, 4.5, 0.5, 1.04, 0x3b6f8a, 10, 0.2); for (const sx of [-1, 1]) B(sx * 0.7, 1.4, 4.5, 0.12, 1.6, 0.12, 0x6d543a); B(0, 2.0, 4.5, 1.6, 0.1, 0.1, 0x6d543a); cyl(0, 1.6, 4.5, 0.12, 0.26, 0x8a6a45, 8); block(0, 4.5, 0.8, 0.8);
      cyl(1.5, 0.9, half - 2.5, 0.05, 1.8, 0x8a6a45, 5); B(1.8, 1.6, half - 2.5, 0.7, 0.2, 0.05, 0xd9c7a8); B(1.2, 1.3, half - 2.5, 0.6, 0.2, 0.05, 0xd9c7a8);
      // A rolling tumbleweed, a skull, a lizard, and the heat shimmering over the sand.
      const tw = new THREE.Group(); group.add(tw); for (let i = 0; i < 7; i += 1) { const s = new THREE.Mesh(BOX, mat(0xb8a070)); s.scale.set(0.04, 0.04, 0.7); s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); tw.add(s); } anim((t) => { const k = ((t * 0.8) % (grid - 4)) - (half - 2); tw.position.set(k, 0.35, -half + 6); tw.rotation.z = -t * 2.5; });
      ball(half - 3, 0.18, 2.5, 0.22, 0xf3ecd8); for (const sx of [-1, 1]) ball(half - 3 + sx * 0.08, 0.2, 2.68, 0.05, 0x3b3b40);
      B(-1, 0.06, -5, 0.5, 0.08, 0.14, 0x8aa06a); B(-0.7, 0.06, -5, 0.3, 0.05, 0.06, 0x8aa06a);
      scatter(Math.round(grid * 1.2), (x, z) => pebble(x, z, pick([0xd9bf7e, 0xc7a35a, 0xb08a4a]))); scatter(5, (x, z) => tuft(x, z, 0xb9b06a));
      bird(0, 9, 0, half * 0.9, 0x6a4a2a, 0.3);
    },
    flower() {
      house(-3, -3.5, 4.4, 3.6, 0xf7f1e1, 0xe0566a, 1.6); path(0, half - 1, -3, -1.6);
      // Flower fields in stripes, the way they are grown, and tulips in rows between.
      for (let r = 0; r < 4; r += 1) flowerbed(4, -half + 3 + r * 2.4, 6, 1.6, [[0xe0566a], [0xf0c84a], [0xc47ad8], [0xf3ecd8]][r]);
      for (let i = 0; i < 6; i += 1) { cyl(-half + 2.5 + i * 0.6, 0.3, 0, 0.03, 0.6, 0x4e9a3f, 4); cone(-half + 2.5 + i * 0.6, 0.72, 0, 0.14, 0.3, [0xe0566a, 0xf0c84a][i % 2], 6); }
      // The windmill: a tower, and four blades that turn.
      cyl(-half + 4, 2.2, half - 5, 1.0, 4.4, 0xd9c7a8, 10, 0, 1, 0.75); cone(-half + 4, 4.9, half - 5, 1.3, 1.2, 0x8a4a3a, 8); B(-half + 4, 0.9, half - 4.1, 0.7, 1.4, 0.1, 0x5a3a22);
      const blades = new THREE.Group(); blades.position.set(-half + 4, 3.6, half - 4.0); group.add(blades);
      for (let i = 0; i < 4; i += 1) { const b = new THREE.Mesh(BOX, mat(0xf3ecd8)); b.scale.set(0.34, 3.4, 0.08); b.position.set(0, 1.5, 0); b.castShadow = true; const f = new THREE.Mesh(BOX, mat(0xd9b45c)); f.scale.set(0.06, 3.4, 0.06); f.position.set(-0.2, 1.5, 0); const g = new THREE.Group(); g.rotation.z = i * Math.PI / 2; g.add(b, f); blades.add(g); }
      anim((t) => { blades.rotation.z = t * 1.2; }); block(-half + 4, half - 5, 1.0, 1.0);
      // A fountain in the middle, benches, bunting, a greenhouse, a scarecrow, a beehive.
      cyl(2, 0.3, 2, 2.0, 0.6, 0x9a8f7a, 16); disc(2, 0.62, 2, 1.7, 0x6fd0ff, 0.5); cyl(2, 1.2, 2, 0.25, 1.6, 0x9a8f7a, 10); disc(2, 2.1, 2, 0.7, 0x9a8f7a); const jet = cone(2, 2.6, 2, 0.2, 0.9, 0x9fd6e8, 6, 1.2); anim((t) => { jet.position.y = 2.6 + Math.sin(t * 4) * 0.15; jet.rotation.y = t * 2; }); block(2, 2, 1.9, 1.9);
      for (let i = 0; i < 6; i += 1) { const d = ball(2 + Math.cos(i * 1.05) * 1.2, 1.4, 2 + Math.sin(i * 1.05) * 1.2, 0.06, 0xbfe3f0, 0.6, 0.8); anim((t) => { const k = (t * 1.5 + i) % 1; d.position.y = 2.4 - k * k * 1.8; d.position.x = 2 + Math.cos(i * 1.05) * (0.3 + k * 1.2); d.position.z = 2 + Math.sin(i * 1.05) * (0.3 + k * 1.2); }); }
      for (const [bx, bz] of [[-2, 3.5], [6, 3.5]]) { B(bx, 0.55, bz, 2.0, 0.14, 0.7, 0xa58c62); B(bx, 0.95, bz - 0.3, 2.0, 0.6, 0.12, 0xa58c62); for (const sx of [-1, 1]) B(bx + sx * 0.85, 0.25, bz, 0.1, 0.5, 0.6, 0x6d543a); }
      for (let i = 0; i < 9; i += 1) { const f = B(-6 + i * 1.5, 3.2 - Math.abs(i - 4) * 0.08, half - 1.8, 0.5, 0.4, 0.06, [0xe0566a, 0xf0c84a, 0x6fd0ff][i % 3]); anim((t) => { f.rotation.y = Math.sin(t * 3 + i) * 0.3; }); }
      B(0, 3.35, half - 1.8, 12.5, 0.03, 0.03, 0x6d543a); for (const sx of [-6, 6]) cyl(sx, 1.7, half - 1.8, 0.07, 3.4, 0x6d543a, 6);
      B(half - 3.5, 1.0, -half + 3.5, 3.0, 2.0, 2.4, 0xbfe3f0, 0.1, 0.45); B(half - 3.5, 2.4, -half + 3.5, 3.2, 0.8, 2.6, 0xbfe3f0, 0.1, 0.45).rotation.z = 0; for (let i = 0; i < 4; i += 1) B(half - 4.5 + i * 0.7, 1.0, -half + 3.5, 0.06, 2.0, 2.5, 0xf3ecd8); for (let i = 0; i < 5; i += 1) { const px = half - 4.6 + i * 0.55; cyl(px, 0.4, -half + 3.5, 0.03, 0.8, 0x4e9a3f, 4); ball(px, 0.6, -half + 3.5, 0.12, 0xe0563a); } block(half - 3.5, -half + 3.5, 1.5, 1.2);
      cyl(half - 2.5, 1.1, 0, 0.06, 2.2, 0x6d543a, 5); B(half - 2.5, 1.5, 0, 1.4, 0.08, 0.08, 0x6d543a); B(half - 2.5, 1.3, 0, 0.6, 0.9, 0.3, 0x4e7fa8); ball(half - 2.5, 2.05, 0, 0.3, 0xe3cc8e); cone(half - 2.5, 2.45, 0, 0.5, 0.3, 0xd9b45c, 8); ball(half - 2.3, 2.2, 0, 0.1, 0x3b3b40);
      for (let i = 0; i < 3; i += 1) cyl(-half + 2.5, 0.3 + i * 0.3, 3, 0.45 - i * 0.05, 0.3, 0xe3cc8e, 10); ball(-half + 2.5, 1.25, 3, 0.1, 0xf0c84a); block(-half + 2.5, 3, 0.4, 0.4);
      cyl(-1, 0.4, half - 4, 0.08, 0.8, 0x9a8f7a, 8); disc(-1, 0.85, half - 4, 0.5, 0x9a8f7a); disc(-1, 0.9, half - 4, 0.4, 0x6fd0ff, 0.5); ball(-1.2, 1.0, half - 4, 0.08, 0xf08a2a);
      for (let i = 0; i < 6; i += 1) { const g = new THREE.Group(); group.add(g); for (const sx of [-1, 1]) { const w = new THREE.Mesh(BOX, mat([0xf0c84a, 0xe0566a, 0x6fd0ff][i % 3], 0.3)); w.scale.set(0.22, 0.02, 0.16); w.position.x = sx * 0.11; g.add(w); anim((t) => { w.rotation.z = sx * Math.sin(t * 14 + i) * 0.9; }); } const ox = (rnd() * 2 - 1) * (half - 3); const oz = (rnd() * 2 - 1) * (half - 3); anim((t) => { g.position.set(ox + Math.cos(t * 0.8 + i) * 1.5, 1.0 + Math.sin(t * 2.2 + i) * 0.3, oz + Math.sin(t * 0.6 + i) * 1.5); g.rotation.y = -t * 0.8; }); }
      tree(half - 3, half - 3.5, 0x8a6a45, 0xf8c6d8, 1.1); tree(-half + 3, -half + 3.5, 0x8a6a45, 0xf8c6d8, 0.9);
      scatter(Math.round(grid * 1.4), (x, z) => tuft(x, z, 0x8fc37a)); scatter(12, (x, z) => ball(x, 0.08, z, 0.07, pick([0xf3ecd8, 0xf0c84a, 0xe0566a, 0xc47ad8])));
      bird(0, 7, 0, half * 0.7, 0xffffff, 0.4);
    },
    autumn() {
      // Through the torii from the jetty, up a lantern path to the shrine house.
      const gz = half - 4;
      for (const sx of [-1, 1]) { cyl(sx * 1.5, 1.7, gz, 0.17, 3.4, 0xc8302a, 10); cyl(sx * 1.5, 0.15, gz, 0.26, 0.3, 0x3b3b40, 10); }
      B(0, 3.5, gz, 4.4, 0.26, 0.34, 0x2a2a2e); for (const sx of [-1, 1]) B(sx * 2.0, 3.65, gz, 0.5, 0.2, 0.34, 0x2a2a2e).rotation.z = sx * 0.25; B(0, 3.25, gz, 4.0, 0.12, 0.2, 0xc8302a); B(0, 2.75, gz, 3.4, 0.18, 0.2, 0xc8302a); B(0, 3.0, gz, 0.3, 0.32, 0.22, 0x2a2a2e);
      for (const sx of [-1, 1]) block(sx * 1.5, gz, 0.25, 0.25);
      path(0, gz - 0.8, 0, -2.2, 0x8a8478, 7);
      for (let i = 0; i < 3; i += 1) for (const sx of [-1, 1]) { const lx = sx * 1.6; const lz = gz - 2 - i * 2.2; B(lx, 0.2, lz, 0.6, 0.4, 0.6, 0x8a8478); cyl(lx, 0.8, lz, 0.14, 0.8, 0x8a8478, 8); B(lx, 1.4, lz, 0.5, 0.5, 0.5, 0x9a948a); B(lx, 1.4, lz + 0.26, 0.26, 0.26, 0.04, 0xffd98a, 1.3); B(lx, 1.75, lz, 0.75, 0.14, 0.75, 0x8a8478); ball(lx, 1.9, lz, 0.1, 0x8a8478); block(lx, lz, 0.3, 0.3); }
      // The shrine house: dark wood, a grey-blue tiled roof with upturned ends, a bell rope.
      B(0, 1.3, -4, 4.6, 2.6, 3.4, 0x5a3a2a); B(0, 0.15, -4, 5.4, 0.3, 4.2, 0x8a8478); B(0, 2.75, -4, 6.0, 0.3, 4.8, 0x4e5a6a); B(0, 3.1, -4, 4.6, 0.45, 3.6, 0x4e5a6a); B(0, 3.6, -4, 2.6, 0.55, 2.0, 0x4e5a6a); B(0, 4.0, -4, 0.6, 0.3, 2.2, 0x3b3b40);
      for (const sx of [-1, 1]) B(sx * 3.0, 2.95, -4, 0.5, 0.3, 4.8, 0x4e5a6a).rotation.z = sx * 0.35;
      B(0, 0.9, -2.25, 1.2, 1.8, 0.1, 0x2a2a2e); for (const sx of [-1, 1]) B(sx * 1.6, 1.5, -2.25, 1.0, 1.0, 0.08, 0xf3ecd8, 0.5); B(0, 2.4, -2.25, 0.05, 1.0, 0.05, 0xe0566a); ball(0, 2.95, -2.25, 0.2, 0xd9a040);
      for (const sx of [-1, 1]) { B(sx * 2.9, 0.45, -2.1, 0.5, 0.9, 0.5, 0x8a8478); B(sx * 2.9, 1.2, -2.1, 0.32, 0.6, 0.6, 0xf3ecd8); ball(sx * 2.9, 1.65, -2.1 + 0.2, 0.2, 0xf3ecd8); B(sx * 2.9, 1.5, -2.1 + 0.1, 0.3, 0.1, 0.3, 0xe0566a); }
      block(0, -4, 2.5, 1.9);
      // Maples in three colours, leaves drifting down under them, a koi pond and a bridge.
      const leaf = [0xd94a2a, 0xe8882a, 0xf0c04a];
      for (let i = 0; i < 8; i += 1) { const a = i * 0.785 + 0.4; const r = half - 2.8; const tx = Math.cos(a) * r; const tz = Math.sin(a) * r; if (tz > half - 6 && Math.abs(tx) < 2.5) continue; tree(tx, tz, 0x5a4330, leaf[i % 3], 1 + (i % 2) * 0.3); for (let k = 0; k < 8; k += 1) B(tx + (rnd() - 0.5) * 2.6, 0.03, tz + (rnd() - 0.5) * 2.6, 0.2, 0.03, 0.14, leaf[(i + k) % 3]).rotation.y = rnd() * 3; }
      for (let i = 0; i < 12; i += 1) { const tx = (rnd() * 2 - 1) * (half - 2); const tz = (rnd() * 2 - 1) * (half - 2); const l = B(tx, 2 + rnd() * 2, tz, 0.18, 0.03, 0.12, leaf[i % 3]); anim((t) => { const k = (t * 0.5 + i * 0.7) % 4; l.position.y = 4 - k; l.position.x = tx + Math.sin(t * 2 + i) * 0.4; l.rotation.y = t * 2 + i; l.rotation.z = Math.sin(t * 3 + i) * 0.5; }); }
      const px = half - 5; const pz = 1.5;
      disc(px, -0.03, pz, 3.0, 0x7f7040); disc(px, 0, pz, 2.6, 0x3d87a0, 0.25); block(px, pz, 2.2, 2.2); for (let i = 0; i < 10; i += 1) { const s = ball(px + Math.cos(i * 0.63) * 2.8, 0.1, pz + Math.sin(i * 0.63) * 2.8, 0.3, pick([0x8c917c, 0x6e7266])); s.scale.y = 0.6; }
      for (let i = 0; i < 4; i += 1) { const f = new THREE.Group(); group.add(f); const body = new THREE.Mesh(BOX, mat([0xf08a2a, 0xf3ecd8, 0xf08a2a, 0x2a2a2e][i])); body.scale.set(0.2, 0.1, 0.5); f.add(body); const tl = new THREE.Mesh(BOX, mat([0xf08a2a, 0xf3ecd8, 0xf08a2a, 0x2a2a2e][i])); tl.scale.set(0.14, 0.08, 0.22); tl.position.z = -0.33; f.add(tl); const spot = new THREE.Mesh(BOX, mat(i % 2 ? 0xf08a2a : 0xf3ecd8)); spot.scale.set(0.12, 0.11, 0.14); spot.position.z = 0.1; f.add(spot); anim((t) => { const a = t * 0.5 + i * 1.57; f.position.set(px + Math.cos(a) * 1.4, 0.03, pz + Math.sin(a) * 1.4); f.rotation.y = -a - 1.57; tl.rotation.y = Math.sin(t * 6 + i) * 0.5; }); }
      for (let k = 0; k <= 8; k += 1) { const a = k / 8 * Math.PI; B(px + Math.cos(a) * 2.9, 0.3 + Math.sin(a) * 0.9, pz, 0.8, 0.12, 1.0, 0xc8302a).rotation.z = -Math.cos(a) * 0.3; } for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(px + sx * 2.9, 0.9, pz + sz * 0.5, 0.08, 1.2, 0.08, 0xc8302a); for (const sz of [-1, 1]) B(px, 1.3, pz + sz * 0.5, 5.8, 0.06, 0.06, 0xc8302a);
      // Bamboo, pampas grass, a stone basin, and a cat asleep on the step.
      for (let i = 0; i < 7; i += 1) { const bx = -half + 2.5 + (i % 4) * 0.5; const bz = -half + 2.5 + Math.floor(i / 4) * 0.5 + (i % 2) * 0.3; const h = 3 + rnd() * 1.5; cyl(bx, h / 2, bz, 0.09, h, 0x8fb36a, 6); for (let k = 1; k < h; k += 0.8) cyl(bx, k, bz, 0.11, 0.08, 0x6f8f4a, 6); B(bx + 0.3, h - 0.5, bz, 0.5, 0.04, 0.2, 0x8fb36a).rotation.z = 0.3; }
      block(-half + 3.2, -half + 3, 1.0, 0.8);
      cyl(-3.5, 0.3, half - 2.5, 0.5, 0.6, 0x8a8478, 10); disc(-3.5, 0.62, half - 2.5, 0.38, 0x3d87a0, 0.3); cyl(-3.5, 1.0, half - 2.5, 0.03, 0.9, 0x8fb36a, 4).rotation.z = 0.5;
      B(1.8, 0.2, -2.0, 0.5, 0.25, 0.3, 0xf3ecd8); ball(2.05, 0.3, -2.0, 0.14, 0xf3ecd8); for (const sx of [-1, 1]) cone(2.05 + sx * 0.08, 0.45, -2.0, 0.04, 0.1, 0xf3ecd8, 4);
      scatter(8, (x, z) => tuft(x, z, 0xe3cc8e)); scatter(Math.round(grid * 0.7), (x, z) => tuft(x, z, 0xa8a860));
      bird(0, 7, 0, half * 0.8, 0x3b3b40, 0.3);
    },
    snow() {
      house(-2, -3.5, 5.0, 3.8, 0x7a5a3e, 0xf2f4f8, 1.2, 0.9);
      B(-0.2, 4.3, -4.2, 0.7, 1.4, 0.7, 0x9a8f7a); for (let i = 0; i < 4; i += 1) puff(-0.2, 5.2, -4.2, i);
      for (let i = 0; i < 5; i += 1) B(-2, 3.0 + i * 0.001, -1.65, 5.6 - i, 0.08, 0.1, 0xffffff); path(0, half - 1, -2, -1.5, 0x9fb0c0);
      // The snowman, lit pines, a frozen pond with a bench, an igloo and a sled.
      ball(4, 0.7, 2, 0.75, 0xf7f9fc); ball(4, 1.75, 2, 0.55, 0xf7f9fc); ball(4, 2.55, 2, 0.4, 0xf7f9fc);
      cone(4, 2.55, 2.5, 0.08, 0.4, 0xf08a2a, 6).rotation.x = Math.PI / 2; B(4, 3.0, 2, 0.9, 0.12, 0.9, 0x3b3b40); cyl(4, 3.3, 2, 0.3, 0.5, 0x3b3b40, 10); B(4, 2.05, 2, 1.3, 0.12, 0.18, 0xe0566a); B(4.3, 1.9, 2.3, 0.18, 0.5, 0.12, 0xe0566a);
      for (const sx of [-1, 1]) { ball(4 + sx * 0.14, 2.65, 2.36, 0.05, 0x1b1b1b); B(4 + sx * 0.6, 1.9, 2, 0.9, 0.06, 0.06, 0x6d543a).rotation.z = sx * 0.6; } for (let i = 0; i < 3; i += 1) ball(4, 1.95 - i * 0.3, 2.5, 0.05, 0x1b1b1b); block(4, 2, 0.8, 0.8);
      for (let i = 0; i < 7; i += 1) { const a = i * 0.9; const r = half - 2.6; if (Math.sin(a) > 0.5 && Math.abs(Math.cos(a) * r) < 2) continue; pine(Math.cos(a) * r, Math.sin(a) * r, 1 + (i % 2) * 0.3, true); for (let k = 0; k < 3; k += 1) cone(Math.cos(a) * r, (1.9 + k * 0.9) * (1 + (i % 2) * 0.3) + 0.3, Math.sin(a) * r, (1.0 - k * 0.3) * (1 + (i % 2) * 0.3), 0.3, 0xffffff, 7); }
      disc(-4, -0.03, 4, 2.9, 0xc9d6e2); disc(-4, 0, 4, 2.6, 0xbfe3f0, 0.4); block(-4, 4, 2.2, 2.2); for (let i = 0; i < 3; i += 1) B(-4 + (i - 1) * 0.8, 0.045, 4 + (i % 2) * 0.5, 0.05, 0.02, 1.4, 0xffffff).rotation.y = 0.4 * i;
      B(-4, 0.55, 1.0, 2.0, 0.14, 0.6, 0xa58c62); B(-4, 0.95, 0.7, 2.0, 0.6, 0.12, 0xa58c62); B(-4, 0.68, 1.0, 2.0, 0.1, 0.6, 0xffffff);
      const ix = half - 4; const iz = half - 4.5; const ig = ball(ix, 0, iz, 1.6, 0xf7f9fc); ig.scale.y = 0.9; cyl(ix, 0.5, iz + 1.5, 0.6, 1.0, 0xf7f9fc, 10).rotation.x = Math.PI / 2; B(ix, 0.5, iz + 2.0, 0.8, 0.9, 0.1, 0x3b4a5a); block(ix, iz, 1.4, 1.4);
      for (let i = 0; i < 4; i += 1) for (let k = 0; k < 6; k += 1) B(ix + Math.cos(k * 1.05 + i * 0.5) * (1.55 - i * 0.3), 0.3 + i * 0.4, iz + Math.sin(k * 1.05 + i * 0.5) * (1.55 - i * 0.3), 0.5, 0.04, 0.5, 0xe0e8f0).rotation.y = k * 1.05;
      B(1.5, 0.3, half - 4, 0.8, 0.12, 1.6, 0xe0566a); for (const sx of [-1, 1]) { B(1.5 + sx * 0.35, 0.12, half - 4, 0.08, 0.1, 1.8, 0x3b3b40); B(1.5 + sx * 0.35, 0.3, half - 4.9, 0.08, 0.3, 0.08, 0x3b3b40); } B(1.5, 0.45, half - 3.5, 0.8, 0.2, 0.08, 0xe0566a).rotation.x = 0.4;
      // A penguin by the pond, a warm lantern, snow-capped rocks, and snow falling.
      ball(-1.5, 0.5, 4.5, 0.4, 0x1b1b1b).scale.y = 1.2; ball(-1.5, 0.45, 4.78, 0.25, 0xf3ecd8).scale.set(0.25, 0.32, 0.12); cone(-1.5, 0.75, 4.9, 0.08, 0.25, 0xf08a2a, 4).rotation.x = Math.PI / 2; for (const sx of [-1, 1]) B(-1.5 + sx * 0.22, 0.02, 4.6, 0.18, 0.04, 0.3, 0xf08a2a);
      lantern(1.5, 1.0, 0xffb060); lantern(-half + 2.5, half - 2.5, 0xffb060);
      for (let i = 0; i < 4; i += 1) { const bx = (rnd() * 2 - 1) * (half - 3); const bz = (rnd() * 2 - 1) * (half - 3); if (!clear(bx, bz)) continue; boulder(bx, bz, 0.7 + rnd() * 0.5, 0x6e7266); ball(bx, 0.55, bz, 0.6, 0xffffff).scale.y = 0.35; }
      for (let i = 0; i < 10; i += 1) ball(-half + 2 + rnd() * (grid - 4), 0.1, -half + 2 + rnd() * (grid - 4), 0.14, 0xffffff);
      for (let i = 0; i < 36; i += 1) { const fx = (rnd() * 2 - 1) * (half + 2); const fz = (rnd() * 2 - 1) * (half + 2); const f = ball(fx, 0, fz, 0.06, 0xffffff, 0.3); const sp = 0.6 + rnd() * 0.6; anim((t) => { f.position.y = 8 - ((t * sp + i * 0.9) % 8); f.position.x = fx + Math.sin(t + i) * 0.4; }); }
    },
    volcano() {
      // The mountain: a dark cone, a glowing mouth, lava streaks, smoke and embers.
      const vx = -2.5; const vz = -half * 0.42; const vr = half * 0.44;
      cone(vx, 3.2, vz, vr, 6.4, 0x3a3430, 9); cone(vx, 3.3, vz, vr * 0.9, 6.5, 0x2e2926, 9).rotation.y = 0.3; cyl(vx, 6.3, vz, vr * 0.22, 0.4, 0xff5a1a, 9, 1.8); ball(vx, 6.4, vz, vr * 0.16, 0xffa040, 2.4).scale.y = 0.4;
      for (let i = 0; i < 4; i += 1) { const a = i * 1.6 + 0.4; const s = B(vx + Math.cos(a) * vr * 0.45, 4.2, vz + Math.sin(a) * vr * 0.45, 0.4, 3.4, 0.3, 0xff6a2a, 1.6); s.rotation.y = -a + Math.PI / 2; s.rotation.z = Math.cos(a) * 0.8 * (vr / 4); s.rotation.x = -Math.sin(a) * 0.8 * (vr / 4); anim((t) => { s.material.emissiveIntensity = 1.3 + Math.sin(t * 3 + i) * 0.5; }); }
      for (let i = 0; i < 6; i += 1) puff(vx, 6.6, vz, i, 0x4a4548, 0.5); block(vx, vz, vr * 0.8, vr * 0.8);
      disc(vx + vr * 0.6, 0.02, vz + vr * 0.95, 1.6, 0xff6a2a, 1.4); for (let i = 0; i < 7; i += 1) { const s = ball(vx + vr * 0.6 + Math.cos(i * 0.9) * 1.6, 0.1, vz + vr * 0.95 + Math.sin(i * 0.9) * 1.6, 0.3, 0x1a1a1e); s.scale.y = 0.6; } block(vx + vr * 0.6, vz + vr * 0.95, 1.3, 1.3);
      for (let i = 0; i < 12; i += 1) { const ex = (rnd() * 2 - 1) * (half - 2); const ez = (rnd() * 2 - 1) * (half - 2); const e = ball(ex, 1, ez, 0.05, 0xff8a3a, 2.4); anim((t) => { e.position.y = 0.5 + ((t * 0.5 + i) % 3); e.position.x = ex + Math.sin(t + i) * 0.4; e.material.emissiveIntensity = 1.5 + Math.sin(t * 6 + i); }); }
      // The hot spring with its stone rim and steam, the black-stone house with warm windows.
      const sx = half - 5; const sz = 2.5;
      disc(sx, -0.03, sz, 2.8, 0x5a5550); disc(sx, 0.01, sz, 2.4, 0x9fd6e8, 0.45); block(sx, sz, 2.0, 2.0); for (let i = 0; i < 12; i += 1) { const s = ball(sx + Math.cos(i * 0.52) * 2.6, 0.12, sz + Math.sin(i * 0.52) * 2.6, 0.32, pick([0x6e7266, 0x8c917c])); s.scale.y = 0.6; } for (let i = 0; i < 5; i += 1) puff(sx + (i - 2) * 0.6, 0.2, sz + (i % 2) * 0.8, i, 0xffffff, 0.3);
      B(sx + 2.5, 0.2, sz - 0.5, 0.6, 0.4, 1.2, 0x8a6a45); B(sx - 2.9, 0.5, sz, 0.1, 1.0, 1.0, 0xd9b45c); cyl(sx - 3.1, 0.6, sz, 0.05, 1.2, 0x6d543a, 4); cyl(sx + 1.2, 0.35, sz + 2.4, 0.3, 0.5, 0xd9b45c, 10, 0, 1, 0.8);
      B(-half + 4.2, 1.4, half - 5, 4.2, 2.8, 3.2, 0x2a2a2e); B(-half + 4.2, 0.15, half - 5, 4.6, 0.3, 3.6, 0x1a1a1e); B(-half + 4.2, 2.95, half - 5, 5.0, 0.3, 4.0, 0x6a2a2a); B(-half + 4.2, 3.4, half - 5, 3.2, 0.6, 2.2, 0x6a2a2a); B(-half + 4.2, 3.9, half - 5, 1.4, 0.5, 1.0, 0x6a2a2a);
      B(-half + 4.2, 0.95, half - 3.37, 1.0, 1.9, 0.1, 0x5a3a22); for (const dx of [-1, 1]) B(-half + 4.2 + dx * 1.3, 1.7, half - 3.37, 0.9, 0.8, 0.08, 0xffa040, 1.2); block(-half + 4.2, half - 5, 2.1, 1.6);
      for (let r = 0; r < 4; r += 1) for (let c = 0; c < 6; c += 1) B(-half + 2.3 + c * 0.76, 1.42 + r * 0.7 + 0.0, half - 3.36, 0.7, 0.62, 0.02, r % 2 ? 0x34343a : 0x2e2e34);
      for (const [tx, tz] of [[-half + 6.5, half - 3], [-half + 2, half - 3]]) { cyl(tx, 0.9, tz, 0.07, 1.8, 0x6d543a, 6); cyl(tx, 1.85, tz, 0.16, 0.3, 0x3b3b40, 8); fire(tx, 1.9, tz, 0.5); }
      path(0, half - 1, -half + 4.2, half - 3.2, 0x8a6a45);
      // Ferns and dark palms, obsidian boulders, and a wooden sign warning of the heat.
      palm(half - 3, -half + 4, -1, 0x3f7a35); palm(2, half - 3.5, 1, 0x3f7a35);
      scatter(10, (x, z) => { for (let k = 0; k < 5; k += 1) cone(x + Math.cos(k * 1.26) * 0.3, 0.35, z + Math.sin(k * 1.26) * 0.3, 0.14, 0.7, 0x2f6a3a, 4).rotation.z = Math.cos(k * 1.26) * 0.6; });
      for (let i = 0; i < 5; i += 1) { const bx = (rnd() * 2 - 1) * (half - 3); const bz = (rnd() * 2 - 1) * (half - 3); if (!clear(bx, bz)) continue; boulder(bx, bz, 0.5 + rnd() * 0.6, 0x1a1a1e); }
      cyl(2.5, 0.8, half - 2.6, 0.05, 1.6, 0x6d543a, 5); B(2.5, 1.5, half - 2.6, 0.8, 0.5, 0.06, 0xd9b45c); B(2.5, 1.5, half - 2.56, 0.5, 0.06, 0.02, 0xe0563a); B(2.5, 1.4, half - 2.56, 0.3, 0.06, 0.02, 0xe0563a);
      scatter(Math.round(grid * 1.2), (x, z) => pebble(x, z, pick([0x1a1a1e, 0x3a3430, 0x5a5550])));
      bird(vx, 9, vz, half * 0.8, 0x1b1b1b, 0.3);
    },
    sky() {
      // Stars above, and smaller islets drifting round this one on their own clouds.
      for (let i = 0; i < 28; i += 1) { const s = ball(-half + rnd() * grid, 9 + rnd() * 7, -half + rnd() * grid, 0.14, 0xffe9a8, 1.6); anim((t) => { s.material.emissiveIntensity = 1.0 + Math.sin(t * 2 + i) * 0.8; }); }
      for (let i = 0; i < 4; i += 1) { const g = new THREE.Group(); group.add(g); const rock = new THREE.Mesh(BOX, mat(0xcfd6e0)); rock.scale.set(2.2, 1.2, 2.0); rock.position.y = -0.6; g.add(rock); const top = new THREE.Mesh(BOX, mat(0x8fb36a)); top.scale.set(2.3, 0.2, 2.1); top.position.y = 0.1; g.add(top); const tr = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(0xf8c6d8)); tr.scale.set(0.6, 0.6, 0.6); tr.position.y = 0.9; g.add(tr); const cl = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(0xffffff, 0.05, 0.9)); cl.scale.set(1.8, 0.7, 1.6); cl.position.y = -1.5; g.add(cl); const a0 = i * 1.57; anim((t) => { const a = a0 + t * 0.08; g.position.set(Math.cos(a) * (half + 6), 1.5 + Math.sin(t * 0.7 + i) * 0.6 + (i % 2) * 2, Math.sin(a) * (half + 6)); }); }
      // The castle: a keep with four towers, flags that flutter, and a golden gate; a
      // rainbow bridge to it, white-blossom trees and a golden fountain.
      B(0, 2.5, -3, 7.0, 5.0, 5.0, 0xe4e8ef); for (let r = 0; r < 5; r += 1) for (let c = 0; c < 7; c += 1) B(-3 + c * 1.0, 0.5 + r * 1.0, -0.49, 0.9, 0.9, 0.02, r % 2 === c % 2 ? 0xdfe3ea : 0xe9edf3);
      B(0, 5.2, -3, 7.6, 0.4, 5.6, 0xffd766, 0.3); for (let i = 0; i < 6; i += 1) B(-3 + i * 1.2, 5.65, -0.5, 0.5, 0.5, 0.4, 0xe4e8ef);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { cyl(sx * 3.5, 3.5, -3 + sz * 2.5, 0.85, 7.0, 0xd4dbe6, 12); cyl(sx * 3.5, 7.0, -3 + sz * 2.5, 1.0, 0.3, 0xffd766, 12); cone(sx * 3.5, 8.1, -3 + sz * 2.5, 1.05, 1.9, 0x4e7fa8, 10); B(sx * 3.5, 9.2, -3 + sz * 2.5, 0.05, 0.6, 0.05, 0x6d543a); const fl = B(sx * 3.5 + 0.22, 9.35, -3 + sz * 2.5, 0.45, 0.3, 0.04, [0xe0566a, 0xffd766, 0x6fd0ff, 0xe0566a][(sx + 1) + (sz + 1) / 2]); anim((t) => { fl.rotation.y = Math.sin(t * 5 + sx + sz) * 0.35; }); B(sx * 3.5, 4.0, -3 + sz * 2.5 + 0.86, 0.5, 0.9, 0.05, 0x9fd6e8, 0.5); }
      cone(0, 6.6, -3, 1.6, 2.4, 0x4e7fa8, 10); B(0, 8.2, -3, 0.08, 1.2, 0.08, 0x6d543a); const bigFlag = B(0.3, 8.5, -3, 0.6, 0.35, 0.06, 0xe0566a); anim((t) => { bigFlag.rotation.y = Math.sin(t * 4) * 0.4; });
      B(0, 1.4, -0.45, 1.6, 2.8, 0.14, 0xffd766, 0.6); B(0, 2.6, -0.45, 1.8, 0.4, 0.2, 0xd9a040); ball(0.35, 1.3, -0.35, 0.06, 0xffffff, 1); block(0, -3, 3.5, 2.5);
      for (const sx of [-1, 1]) cyl(sx * 1.4, 1.8, 3.5, 0.3, 3.6, 0xffd766, 10, 0.5); B(0, 3.8, 3.5, 3.4, 0.5, 0.5, 0xffd766, 0.5); for (const sx of [-1, 1]) ball(sx * 1.4, 3.85, 3.5, 0.35, 0xffe9a8, 0.9);
      const rainbow = [0xe0566a, 0xf08a2a, 0xf0c84a, 0x4e9a3f, 0x4e7fa8, 0x6a4ab0, 0xc47ad8];
      rainbow.forEach((c, i) => { for (let k = 0; k <= 14; k += 1) { const a = (k / 14) * Math.PI; const m = B(half - 3 + Math.cos(a) * (4.8 - i * 0.32), 0.5 + Math.sin(a) * (4.8 - i * 0.32), 3, 0.42, 0.3, 0.6, c, 0.6, 0.85); m.rotation.z = a; } });
      for (const sx of [-1, 1]) { B(sx * 4.5, 0.4, 2, 1.0, 0.8, 1.0, 0xb8c0cc); B(sx * 4.5, 1.6, 2, 0.6, 1.6, 0.6, 0xcfd6e0); ball(sx * 4.5, 2.7, 2, 0.35, 0xcfd6e0); for (const w of [-1, 1]) B(sx * 4.5 + w * 0.6, 2.0, 2, 0.5, 1.0, 0.1, 0xe4e8ef).rotation.z = w * 0.4; block(sx * 4.5, 2, 0.5, 0.5); }
      cyl(-half + 4, 0.3, half - 5, 1.6, 0.6, 0xffd766, 14, 0.3); disc(-half + 4, 0.62, half - 5, 1.35, 0x9fd6e8, 0.5); cyl(-half + 4, 1.1, half - 5, 0.22, 1.2, 0xffd766, 8, 0.3); ball(-half + 4, 1.9, half - 5, 0.4, 0xffe9a8, 0.9); const jet = cone(-half + 4, 2.5, half - 5, 0.18, 0.8, 0x9fd6e8, 6, 1.2); anim((t) => { jet.position.y = 2.5 + Math.sin(t * 4) * 0.15; }); block(-half + 4, half - 5, 1.5, 1.5);
      tree(half - 3.5, -half + 3.5, 0xcfd6e0, 0xf7f1e1, 1.2); tree(-half + 3.5, -half + 3.5, 0xcfd6e0, 0xf8c6d8, 1.1); tree(half - 3, half - 4, 0xcfd6e0, 0xf7f1e1, 0.9);
      path(0, half - 1, 0, 0.2, 0xffd766, 6);
      scatter(10, (x, z) => tuft(x, z, 0xbfe3f0)); scatter(14, (x, z) => ball(x, 0.08, z, 0.08, pick([0xffffff, 0xffe9a8, 0xf8c6d8])));
      for (let i = 0; i < 4; i += 1) bird(0, 6 + i, 0, half * 0.9 + i, 0xffffff, 0.3 + i * 0.1);
    },
    space() {
      // The moon's craters, a sky of stars, and the Earth hanging in it, turning slowly.
      for (const [cx, cz, r] of [[-half + 4, 2, 1.8], [3.5, -half + 4, 1.4], [half - 3.5, half - 5, 1.0], [-2, half - 4.5, 0.8], [1, -1, 0.6]]) { disc(cx, 0.0, cz, r, 0x9a9aa2); disc(cx, 0.01, cz, r * 0.8, 0x7e7e86); for (let k = 0; k < 10; k += 1) { const s = ball(cx + Math.cos(k * 0.63) * r, 0.1, cz + Math.sin(k * 0.63) * r, 0.18 + rnd() * 0.1, 0xcfcfd6); s.scale.y = 0.6; } }
      for (let i = 0; i < 90; i += 1) { const a = rnd() * Math.PI * 2; const e = rnd() * Math.PI * 0.5; const R = half * 2.6; const s = ball(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R + 1, Math.sin(a) * Math.cos(e) * R, 0.08 + rnd() * 0.08, pick([0xffffff, 0xffe9a8, 0x9fd6e8]), 2); anim((t) => { s.material.emissiveIntensity = 1.2 + Math.sin(t * 2 + i) * 0.8; }); }
      const earth = new THREE.Group(); earth.position.set(half * 0.8, 11, -half * 1.3); group.add(earth);
      const sea = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(0x3d7bd6, 0.35)); sea.scale.set(3, 3, 3); earth.add(sea);
      for (let i = 0; i < 9; i += 1) { const a = rnd() * 6.28; const e = (rnd() - 0.5) * 2.4; const land = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(0x4e9a3f, 0.3)); land.scale.set(0.7 + rnd() * 0.6, 0.5 + rnd() * 0.5, 0.4); land.position.set(Math.cos(a) * Math.cos(e) * 2.9, Math.sin(e) * 2.9, Math.sin(a) * Math.cos(e) * 2.9); land.lookAt(0, 0, 0); earth.add(land); }
      for (let i = 0; i < 6; i += 1) { const a = rnd() * 6.28; const e = (rnd() - 0.5) * 2.8; const cl = new THREE.Mesh(geo('ball', () => new THREE.SphereGeometry(1, 14, 11)), mat(0xffffff, 0.4, 0.85)); cl.scale.set(0.9, 0.35, 0.35); cl.position.set(Math.cos(a) * Math.cos(e) * 3.15, Math.sin(e) * 3.15, Math.sin(a) * Math.cos(e) * 3.15); cl.lookAt(0, 0, 0); earth.add(cl); }
      anim((t) => { earth.rotation.y = t * 0.15; });
      // The dome house: glass over a warm room, a tube door, a dish on the roof.
      const dx = -half + 4.5; const dz = -half + 4.5;
      cyl(dx, 0.2, dz, 2.7, 0.4, 0x8e8e96, 20); cyl(dx, 0.5, dz, 2.5, 0.2, 0xe4e8ef, 20); disc(dx, 0.62, dz, 2.3, 0xd9b45c);
      B(dx, 1.0, dz - 0.5, 1.4, 0.6, 0.8, 0xe0566a); B(dx - 1.2, 0.9, dz + 0.4, 0.6, 0.6, 0.6, 0x4e7fa8); cyl(dx + 1.0, 1.0, dz + 0.6, 0.12, 0.8, 0x9a8f7a, 6); ball(dx + 1.0, 1.55, dz + 0.6, 0.3, 0xffe08a, 1.4);
      ball(dx, 0.6, dz, 2.5, 0x9fd6e8, 0.08, 0.38); cyl(dx, 0.6, dz, 2.52, 0.1, 0xe4e8ef, 20); cyl(dx, 1.9, dz, 1.65, 0.08, 0xe4e8ef, 20); ball(dx, 3.1, dz, 0.2, 0xe4e8ef);
      cyl(dx + 1.2, 0.7, dz + 2.6, 0.7, 1.6, 0xe4e8ef, 12).rotation.x = Math.PI / 2; B(dx + 1.2, 0.7, dz + 3.4, 1.0, 1.2, 0.1, 0x3b4a5a); B(dx + 1.2, 0.7, dz + 3.42, 0.5, 0.7, 0.06, 0x9fd6e8, 0.6);
      cyl(dx - 1.5, 3.1, dz - 1.5, 0.06, 1.2, 0x9a8f7a, 5); const dish = cyl(dx - 1.5, 3.7, dz - 1.5, 0.6, 0.15, 0xe4e8ef, 14, 0, 1, 0.3); dish.rotation.x = -0.9; anim((t) => { dish.rotation.y = t * 0.4; });
      block(dx, dz, 2.6, 2.6); block(dx + 1.2, dz + 2.8, 0.8, 1.0);
      // The rocket on its pad, flame flickering under it; a rover; a flag; an astronaut.
      const rx = half - 4.5; const rz = -half + 5;
      cyl(rx, 0.2, rz, 2.2, 0.4, 0x62626a, 12); for (let i = 0; i < 4; i += 1) B(rx + Math.cos(i * 1.57) * 1.9, 0.5, rz + Math.sin(i * 1.57) * 1.9, 0.3, 0.3, 0.3, 0xffd766, 1);
      cyl(rx, 2.9, rz, 0.8, 4.4, 0xf3ecd8, 16); cyl(rx, 2.0, rz, 0.82, 0.5, 0xe0566a, 16); cone(rx, 5.7, rz, 0.8, 1.4, 0xe0566a, 16); ball(rx + 0.72, 3.4, rz, 0.3, 0x9fd6e8, 0.5); ball(rx + 0.74, 3.4, rz, 0.34, 0x3b3b40).scale.set(0.1, 0.34, 0.34);
      for (let i = 0; i < 3; i += 1) { const a = i * 2.09; const f = B(rx + Math.cos(a) * 1.05, 1.2, rz + Math.sin(a) * 1.05, 0.7, 1.4, 0.12, 0xe0566a); f.rotation.y = -a; f.rotation.z = 0; }
      const flame = cone(rx, 0.55, rz, 0.5, 0.9, 0xffa040, 8, 2); flame.rotation.x = Math.PI; const inner = cone(rx, 0.6, rz, 0.3, 0.6, 0xfff0a0, 8, 2.4); inner.rotation.x = Math.PI; anim((t) => { flame.scale.y = 0.9 + Math.sin(t * 20) * 0.25; inner.scale.y = 0.6 + Math.cos(t * 17) * 0.15; });
      block(rx, rz, 1.5, 1.5);
      const ro = new THREE.Group(); group.add(ro); const body = new THREE.Mesh(BOX, mat(0xe4e8ef)); body.scale.set(1.4, 0.5, 1.0); body.position.y = 0.6; ro.add(body); for (const sx of [-1, 1]) for (let k = -1; k <= 1; k += 1) { const w = new THREE.Mesh(geo('cyl10:1', () => new THREE.CylinderGeometry(1, 1, 1, 10)), mat(0x3b3b40)); w.scale.set(0.25, 0.2, 0.25); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.8, 0.3, k * 0.4); ro.add(w); } const mast = new THREE.Mesh(BOX, mat(0x9a8f7a)); mast.scale.set(0.05, 0.8, 0.05); mast.position.set(0.3, 1.2, 0); ro.add(mast); const cam = new THREE.Mesh(BOX, mat(0x3b3b40)); cam.scale.set(0.3, 0.2, 0.2); cam.position.set(0.3, 1.6, 0); ro.add(cam); const panel = new THREE.Mesh(BOX, mat(0x4e7fa8, 0.3)); panel.scale.set(1.0, 0.04, 0.6); panel.position.set(-0.2, 0.9, 0); ro.add(panel);
      anim((t) => { const a = t * 0.12; ro.position.set(Math.cos(a) * (half - 4), 0, 1 + Math.sin(a) * 2.5); ro.rotation.y = -a + Math.PI / 2; });
      cyl(2.5, 1.0, half - 4, 0.04, 2.0, 0xe4e8ef, 5); const fg = B(2.85, 1.75, half - 4, 0.7, 0.45, 0.04, 0xe0566a); for (let i = 0; i < 3; i += 1) B(2.85, 1.6 + i * 0.12, half - 4.01, 0.7, 0.04, 0.02, 0xffffff); anim((t) => { fg.rotation.y = Math.sin(t * 3) * 0.2; });
      const ax = -2; const az = 2.5; for (const sx of [-1, 1]) B(ax + sx * 0.16, 0.4, az, 0.22, 0.8, 0.24, 0xf3ecd8); B(ax, 1.2, az, 0.7, 0.8, 0.45, 0xf3ecd8); B(ax, 1.25, az - 0.3, 0.5, 0.6, 0.2, 0xe4e8ef); for (const sx of [-1, 1]) B(ax + sx * 0.5, 1.2, az, 0.2, 0.7, 0.22, 0xf3ecd8).rotation.z = sx * 0.3; ball(ax, 1.95, az, 0.36, 0xf3ecd8); ball(ax, 1.95, az + 0.12, 0.3, 0xffd766, 0.3).scale.set(0.3, 0.26, 0.26); block(ax, az, 0.4, 0.3);
      for (let i = 0; i < 6; i += 1) { const bx = (rnd() * 2 - 1) * (half - 3); const bz = (rnd() * 2 - 1) * (half - 3); if (!clear(bx, bz)) continue; boulder(bx, bz, 0.5 + rnd() * 0.7, pick([0x8e8e96, 0xa8a8b0])); }
      for (let i = 0; i < 8; i += 1) { const t0 = (rnd() * 2 - 1) * (half - 2); disc(t0, 0.005, half - 2 - i * 0.5, 0.12, 0x8e8e96); } B(half - 3, 0.3, 3, 1.0, 0.6, 0.8, 0x9a8f7a); B(half - 3, 0.65, 3, 0.9, 0.1, 0.7, 0xffd766, 0.5);
      scatter(Math.round(grid * 1.4), (x, z) => pebble(x, z, pick([0xa8a8b0, 0x8e8e96, 0xd0d0d6])));
    },
  };

  ground();
  (BUILD[island.theme] || BUILD.grass)();

  return {
    group, obstacles, theme, half, grid,
    animate(t) { for (const fn of anims) fn(t); },
    dispose() { unlive?.(); unlive = null; },
  };
}

// ---- the private scene ------------------------------------------------------------------
export function createLand({ player, camera, view, toast, onLeave }) {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x6a7a55, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(12, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun);

  const state = { active: false, island: null, obstacles: [] };
  let model = null;
  let parent = null;
  let cooldown = 0;
  let wasFirstPerson = false;

  function build(island) {
    if (model) { scene.remove(model.group); model.dispose(); }
    model = buildIslandModel(island, { owner: island.owner || '', sign: true, liveSign: true, sea: 'wide' });
    scene.add(model.group);
    state.obstacles = model.obstacles;
    const theme = model.theme;
    const half = island.grid / 2;
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, half * 2.5, theme.space ? half * 12 : half * 7);
    sun.color.set(theme.sun);
    sun.intensity = theme.space ? 2.0 : island.theme === 'volcano' ? 1.2 : 1.6;
    hemi.intensity = theme.space ? 0.9 : 1.7;
    hemi.groundColor.set(theme.ground);
  }

  function enter(payload) {
    state.island = payload;
    build(payload);
    parent = player.parent;
    scene.add(player);
    player.position.set(0, 0, payload.grid / 2 - 1.2);
    player.rotation.y = Math.PI;
    state.active = true;
    cooldown = 1.2;
    document.body.classList.add('on-own-island');
    wasFirstPerson = !!view?.firstPerson;
    if (view) view.firstPerson = false;
    document.body.classList.remove('first-person');
    const where = document.querySelector('.location');
    if (where) where.innerHTML = `<span>✦</span><b class="en">${payload.en}</b><i class="ja">${payload.name}</i>`;
    const mapTitle = document.querySelector('.map-panel>div b');
    if (mapTitle) mapTitle.textContent = `${payload.owner || ''}'s ${payload.en}`;
    toast(say(`${payload.emoji} ${payload.name}に ついた！ さんばしに もどると かえれるよ。`));
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    state.active = false;
    (parent || null)?.add(player);
    document.body.classList.remove('on-own-island');
    if (view) view.firstPerson = wasFirstPerson;
    document.body.classList.toggle('first-person', wasFirstPerson);
    onLeave(silent);
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !state.island) return null;
    const half = state.island.grid / 2;
    // The jetty is the way out; the water is not walked on.
    if (z > half) return !(Math.abs(x) < 1.0 && z < half + 3.2);
    if (Math.abs(x) > half - 0.4 || z < -half + 0.4) return true;
    return state.obstacles.some((o) => Math.abs(x - o.x) < o.w + 0.35 && Math.abs(z - o.z) < o.d + 0.35);
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    model?.animate(t);
    // Walking back out along the jetty is leaving.
    const half = state.island.grid / 2;
    if (!cooldown && !document.querySelector('dialog[open]') && player.position.z > half + 2.0) leave();
  }

  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + player.position.y, player.position.z);
      camera.lookAt(player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10);
    } else {
      // Over the shoulder and a little high, like the islands outside: the point is to
      // see the island, so the camera keeps more of it in view than the room's does.
      const distance = THREE.MathUtils.clamp(zoom * 0.7, 11, 22);
      const focus = new THREE.Vector3(player.position.x * 0.6, 1.4, player.position.z * 0.6 - 1);
      const desired = new THREE.Vector3(focus.x + Math.sin(yaw) * distance, 1.5 + distance * 0.62, focus.z + Math.cos(yaw) * distance);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
      camera.lookAt(focus);
    }
    return true;
  }

  function minimap(ctx) {
    if (!state.active || !state.island) return false;
    const half = state.island.grid / 2;
    const scale = 110 / state.island.grid;
    const theme = THEMES[state.island.theme] || THEMES.grass;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = theme.water ? '#2f7f98' : theme.space ? '#0a0c18' : '#4a6fb0';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = `#${theme.ground.toString(16).padStart(6, '0')}`;
    ctx.fillRect(90 - half * scale, 70 - half * scale, state.island.grid * scale, state.island.grid * scale);
    ctx.fillStyle = '#b49a6a';
    ctx.fillRect(90 - 1.1 * scale, 70 + half * scale, 2.2 * scale, 3 * scale);
    ctx.fillStyle = '#3c5a4a';
    for (const o of state.obstacles) ctx.fillRect(90 + (o.x - o.w) * scale, 70 + (o.z - o.d) * scale, o.w * 2 * scale, o.d * 2 * scale);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(90 + player.position.x * scale, 70 + player.position.z * scale, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.font = '10px sans-serif';
    ctx.fillText(`${state.island.emoji || ''} ${say(state.island.name)}`, 10, 16);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap,
    get active() { return state.active; },
  };
}
