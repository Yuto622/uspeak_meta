// ぼくじょう島の どうぶつ — the three animals a child can own, as 3D models.
//
// One builder, two uses: the pen on the island stands them in the grass, and the farm's
// screens draw the very same model on the shop's cards, the pen's cards and the little
// turntable, so a child sees in 3D what they are buying and what they are feeding. Boxes
// and spheres only (the island downloads no models); a seeded wobble makes each animal
// stand a little differently so a pen of three chickens is not three copies.
import * as THREE from './three.module.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BALL = new THREE.SphereGeometry(1, 12, 9);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })); return mats.get(c); };
const part = (g, geo, x, y, z, sx, sy, sz, c) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
const B = (g, x, y, z, w, h, d, c) => part(g, BOX, x, y, z, w, h, d, c);
const S = (g, x, y, z, r, c) => part(g, BALL, x, y, z, r, r, r, c);

export const ANIMAL_KINDS = ['chicken', 'sheep', 'cow'];

// `hearts` adds the small things love shows: a ribbon, a bell, a heart over the head.
export function buildAnimal(kind, { hearts = 0, seed = 0 } = {}) {
  const g = new THREE.Group();
  g.userData.kind = kind; g.userData.seed = seed;
  const parts = { legs: [], head: null, tail: null };
  if (kind === 'chicken') {
    const body = S(g, 0, 0.5, 0, 0.36, 0xf7f1e1); body.scale.set(0.34, 0.32, 0.42);
    const wing1 = S(g, -0.3, 0.52, 0, 0.16, 0xf3ecd8); wing1.scale.set(0.08, 0.2, 0.3);
    const wing2 = S(g, 0.3, 0.52, 0, 0.16, 0xf3ecd8); wing2.scale.set(0.08, 0.2, 0.3);
    const tailF = part(g, CONE, 0, 0.72, -0.42, 0.12, 0.34, 0.12, 0xe8e0cc); tailF.rotation.x = -1.0;
    parts.head = new THREE.Group(); parts.head.position.set(0, 0.86, 0.3); g.add(parts.head);
    S(parts.head, 0, 0, 0, 0.19, 0xf7f1e1);
    const beak = part(parts.head, CONE, 0, -0.03, 0.22, 0.07, 0.16, 0.07, 0xf0a030); beak.rotation.x = Math.PI / 2;
    B(parts.head, 0, 0.2, 0, 0.08, 0.14, 0.2, 0xe0434f); B(parts.head, 0, -0.14, 0.12, 0.06, 0.1, 0.06, 0xe0434f);
    for (const sx of [-1, 1]) S(parts.head, sx * 0.11, 0.04, 0.13, 0.03, 0x1b1b1b);
    for (const sx of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(sx * 0.1, 0.2, 0); g.add(leg); B(leg, 0, -0.1, 0, 0.05, 0.22, 0.05, 0xf0a030); B(leg, 0, -0.2, 0.06, 0.16, 0.03, 0.2, 0xf0a030); parts.legs.push(leg); }
    g.userData.size = 0.9;
  } else if (kind === 'sheep') {
    const body = S(g, 0, 0.78, 0, 0.62, 0xf1ece0); body.scale.set(0.62, 0.52, 0.78);
    for (let i = 0; i < 7; i += 1) { const a = i * 0.9 + seed; S(g, Math.cos(a) * 0.42, 0.9 + Math.sin(a * 1.7) * 0.18, Math.sin(a) * 0.55, 0.22 + (i % 3) * 0.04, 0xf7f3e8); }
    parts.head = new THREE.Group(); parts.head.position.set(0, 0.95, 0.78); g.add(parts.head);
    const face = S(parts.head, 0, 0, 0, 0.26, 0x3b3b40); face.scale.set(0.24, 0.26, 0.3);
    S(parts.head, 0, 0.18, -0.05, 0.2, 0xf7f3e8);
    for (const sx of [-1, 1]) { const ear = B(parts.head, sx * 0.24, 0.02, -0.02, 0.18, 0.08, 0.1, 0x3b3b40); ear.rotation.z = sx * 0.4; S(parts.head, sx * 0.1, 0.03, 0.22, 0.035, 0xffffff); }
    for (const [lx, lz] of [[-0.3, -0.42], [0.3, -0.42], [-0.3, 0.42], [0.3, 0.42]]) { const leg = new THREE.Group(); leg.position.set(lx, 0.4, lz); g.add(leg); B(leg, 0, -0.2, 0, 0.16, 0.4, 0.16, 0x3b3b40); parts.legs.push(leg); }
    parts.tail = S(g, 0, 0.9, -0.78, 0.12, 0xf7f3e8);
    if (hearts >= 3) { B(g, 0, 1.25, 0.35, 0.5, 0.08, 0.08, 0xe0434f); B(g, 0, 1.3, 0.35, 0.16, 0.16, 0.08, 0xe0434f); }
    g.userData.size = 1.4;
  } else {
    const body = B(g, 0, 1.05, 0, 1.2, 0.95, 1.9, 0xf3efe6);
    for (const [px, py, pz, w, h, d] of [[0.3, 1.2, 0.5, 0.62, 0.5, 0.7], [-0.45, 0.9, -0.5, 0.4, 0.5, 0.6], [0.2, 1.4, -0.7, 0.5, 0.3, 0.5]]) B(g, px, py, pz, w, h, d, 0x3b3b40);
    B(g, 0, 0.5, 0.2, 0.7, 0.3, 0.6, 0xf3c9b8); for (const [ux, uz] of [[-0.15, 0.05], [0.15, 0.05], [-0.15, 0.35], [0.15, 0.35]]) B(g, ux, 0.36, uz, 0.08, 0.14, 0.08, 0xf3c9b8);
    parts.head = new THREE.Group(); parts.head.position.set(0, 1.35, 1.1); g.add(parts.head);
    B(parts.head, 0, 0, 0, 0.66, 0.6, 0.62, 0xf3efe6); B(parts.head, 0, -0.14, 0.34, 0.52, 0.3, 0.2, 0xe8b4a0);
    for (const sx of [-1, 1]) { B(parts.head, sx * 0.18, -0.1, 0.45, 0.06, 0.06, 0.02, 0x8a5a4a); S(parts.head, sx * 0.17, 0.12, 0.3, 0.05, 0x1b1b1b); B(parts.head, sx * 0.44, 0.08, -0.05, 0.3, 0.1, 0.16, 0xf3efe6); B(parts.head, sx * 0.25, 0.36, -0.05, 0.08, 0.22, 0.08, 0xd9c7a8); }
    if (hearts >= 3) { B(parts.head, 0, -0.42, 0.1, 0.6, 0.08, 0.08, 0xe0434f); S(parts.head, 0, -0.5, 0.34, 0.1, 0xd9a040); }
    for (const [lx, lz] of [[-0.42, -0.65], [0.42, -0.65], [-0.42, 0.65], [0.42, 0.65]]) { const leg = new THREE.Group(); leg.position.set(lx, 0.6, lz); g.add(leg); B(leg, 0, -0.3, 0, 0.26, 0.6, 0.26, 0xf3efe6); B(leg, 0, -0.56, 0, 0.28, 0.1, 0.28, 0x3b3b40); parts.legs.push(leg); }
    parts.tail = B(g, 0, 1.2, -0.98, 0.08, 0.7, 0.08, 0xf3efe6); S(g, 0, 0.82, -0.98, 0.1, 0x3b3b40);
    g.userData.size = 2.2;
    void body;
  }
  if (hearts >= 6) { const h = B(g, 0, g.userData.size + 0.3, 0, 0.26, 0.26, 0.08, 0xe0434f); h.rotation.z = Math.PI / 4; g.userData.heart = h; }
  g.userData.parts = parts;
  return g;
}

// A little life: a bob when standing, legs swinging when "walking", the head looking
// about, the tail flicking. `moving` is a 0..1 the caller sets from how far it strolled.
export function animateAnimal(g, t, moving = 0) {
  const s = g.userData.seed || 0;
  const { legs, head, tail } = g.userData.parts;
  const sw = Math.sin(t * 7 + s) * 0.5 * moving;
  legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  if (head) { head.rotation.y = Math.sin(t * 0.7 + s) * 0.4; head.rotation.x = Math.max(0, Math.sin(t * 0.4 + s * 2)) * 0.35; }
  if (tail) tail.rotation.y = Math.sin(t * 5 + s) * 0.5;
  if (g.userData.heart) g.userData.heart.position.y = g.userData.size + 0.3 + Math.sin(t * 2 + s) * 0.08;
  g.position.y = Math.abs(Math.sin(t * 2 + s)) * 0.04 * (1 - moving) + Math.abs(Math.sin(t * 7 + s)) * 0.06 * moving;
}
