// ペット島の ペット — 6 しゅるいの 3D モデルと、いつも 横を 歩く 相棒。
//
// 形は ぼくじょうの どうぶつ（farm-animals.js）と 同じ作り：箱と 球だけ（モデルは 1 つも 落とさない）。
// 1 つの 作り方を 3 か所で 使う：自分の 横を 歩く ペット、となりの 子の ペット（remote-players.js）、
// ペット島の 画面と 持ち物の 回る 絵（bag-preview.js の 'pet:<しゅるい>'）。
import * as THREE from './three.module.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BALL = new THREE.SphereGeometry(1, 14, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); return mats.get(c); };
const part = (g, geo, x, y, z, sx, sy, sz, c) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
const B = (g, x, y, z, w, h, d, c) => part(g, BOX, x, y, z, w, h, d, c);
const S = (g, x, y, z, rx, ry, rz, c) => part(g, BALL, x, y, z, rx, ry, rz, c);
const C = (g, x, y, z, r, h, c) => part(g, CONE, x, y, z, r, h, r, c);

export const PET_KINDS = ['dog', 'cat', 'rabbit', 'frog', 'panda', 'fox'];

// 目（黒い 玉に 白い ひかり）。かわいさの ほとんどは ここ。
function eyes(head, y, z, gap, r = 0.055) {
  for (const sx of [-1, 1]) {
    S(head, sx * gap, y, z, r, r * 1.15, r * 0.7, 0x1b1b1b);
    S(head, sx * gap + 0.015, y + 0.02, z + r * 0.55, r * 0.35, r * 0.35, r * 0.2, 0xffffff);
  }
}
function cheeks(head, y, z, gap, c = 0xff9db0) { for (const sx of [-1, 1]) S(head, sx * gap, y, z, 0.05, 0.03, 0.02, c); }
function legs(g, parts, { color, x = 0.13, zf = 0.12, zb = -0.12, h = 0.16, w = 0.09, paw = null }) {
  for (const [sx, sz] of [[-1, zf], [1, zf], [-1, zb], [1, zb]]) {
    const leg = new THREE.Group(); leg.position.set(sx * x, h, sz); g.add(leg);
    B(leg, 0, -h / 2, 0, w, h, w, color);
    if (paw) B(leg, 0, -h + 0.015, 0.01, w * 1.1, 0.03, w * 1.2, paw);
    parts.legs.push(leg);
  }
}

// 1 ぴきの モデル。足元が y=0、前が +z。
export function buildPet(kind) {
  const g = new THREE.Group();
  g.userData.kind = kind;
  const parts = { legs: [], head: null, tail: null, ears: [], hop: false };
  const head = new THREE.Group(); parts.head = head; g.add(head);
  if (kind === 'dog') {
    const fur = 0xd9a06a; const dark = 0x8a5a36;
    S(g, 0, 0.3, 0, 0.2, 0.17, 0.26, fur);
    S(g, 0, 0.28, 0.1, 0.13, 0.12, 0.12, 0xf3dcc0);
    head.position.set(0, 0.5, 0.2);
    S(head, 0, 0, 0, 0.19, 0.17, 0.17, fur);
    S(head, 0, -0.05, 0.13, 0.1, 0.075, 0.08, 0xf3dcc0);
    S(head, 0, -0.01, 0.21, 0.035, 0.03, 0.025, 0x2a1d17);
    B(head, 0, -0.1, 0.17, 0.05, 0.03, 0.05, 0xe8607a);
    eyes(head, 0.04, 0.14, 0.075);
    for (const sx of [-1, 1]) { const ear = new THREE.Group(); ear.position.set(sx * 0.15, 0.08, -0.01); head.add(ear); S(ear, 0, -0.08, 0, 0.05, 0.11, 0.08, dark); ear.rotation.z = sx * 0.25; parts.ears.push(ear); }
    legs(g, parts, { color: fur, paw: 0xf3dcc0 });
    parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.38, -0.24); g.add(parts.tail);
    const t = C(parts.tail, 0, 0.08, 0, 0.04, 0.18, dark); t.rotation.x = -0.4;
  } else if (kind === 'cat') {
    const fur = 0xf0a050; const stripe = 0xc77a2e;
    S(g, 0, 0.28, 0, 0.17, 0.15, 0.25, fur);
    for (const z of [-0.08, 0.04]) B(g, 0, 0.41, z, 0.18, 0.02, 0.04, stripe);
    head.position.set(0, 0.48, 0.18);
    S(head, 0, 0, 0, 0.18, 0.16, 0.15, fur);
    S(head, 0, -0.05, 0.11, 0.09, 0.06, 0.06, 0xfff1dc);
    S(head, 0, -0.02, 0.165, 0.025, 0.02, 0.02, 0xe8607a);
    eyes(head, 0.03, 0.12, 0.075, 0.05);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.1, 0.14, 0); head.add(ear);
      C(ear, 0, 0.04, 0, 0.06, 0.1, fur); C(ear, 0, 0.035, 0.012, 0.035, 0.07, 0xffb8c8);
      ear.rotation.z = -sx * 0.15; parts.ears.push(ear);
      for (const dy of [-0.06, -0.03]) B(head, sx * 0.17, dy, 0.1, 0.12, 0.006, 0.006, 0x6b4a33);
    }
    legs(g, parts, { color: fur, w: 0.08, paw: 0xfff1dc });
    parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.32, -0.23); g.add(parts.tail);
    B(parts.tail, 0, 0.14, -0.03, 0.05, 0.28, 0.05, fur); B(parts.tail, 0, 0.3, 0, 0.05, 0.06, 0.05, stripe);
    parts.tail.rotation.x = -0.35;
  } else if (kind === 'rabbit') {
    const fur = 0xf7f3ee; const pink = 0xffb3c6;
    S(g, 0, 0.26, -0.02, 0.18, 0.18, 0.21, fur);
    head.position.set(0, 0.47, 0.13);
    S(head, 0, 0, 0, 0.16, 0.15, 0.15, fur);
    S(head, 0, -0.04, 0.13, 0.03, 0.025, 0.02, pink);
    eyes(head, 0.03, 0.12, 0.07, 0.05);
    cheeks(head, -0.04, 0.12, 0.1);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.06, 0.12, -0.02); head.add(ear);
      S(ear, 0, 0.13, 0, 0.045, 0.15, 0.03, fur); S(ear, 0, 0.13, 0.015, 0.025, 0.11, 0.01, pink);
      ear.rotation.z = -sx * 0.12; parts.ears.push(ear);
    }
    legs(g, parts, { color: fur, h: 0.1, w: 0.09, zf: 0.1, zb: -0.1 });
    parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.24, -0.22); g.add(parts.tail);
    S(parts.tail, 0, 0, 0, 0.07, 0.07, 0.07, 0xffffff);
    parts.hop = true;
  } else if (kind === 'frog') {
    const skin = 0x6cc04a; const belly = 0xd9f0a8;
    S(g, 0, 0.18, 0, 0.22, 0.14, 0.22, skin);
    S(g, 0, 0.15, 0.06, 0.16, 0.1, 0.15, belly);
    head.position.set(0, 0.28, 0.1);
    for (const sx of [-1, 1]) { S(head, sx * 0.1, 0.07, 0.02, 0.08, 0.08, 0.08, skin); S(head, sx * 0.1, 0.09, 0.08, 0.045, 0.05, 0.03, 0x1b1b1b); S(head, sx * 0.1 + 0.015, 0.11, 0.105, 0.015, 0.015, 0.01, 0xffffff); }
    B(head, 0, -0.07, 0.115, 0.13, 0.012, 0.01, 0x3d7a2b);
    cheeks(head, -0.05, 0.11, 0.12, 0xff8fa8);
    for (const [sx, sz, h] of [[-1, 0.13, 0.08], [1, 0.13, 0.08], [-1, -0.12, 0.06], [1, -0.12, 0.06]]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.2, h, sz); g.add(leg);
      B(leg, 0, -h / 2, 0, 0.08, h, 0.08, skin); B(leg, sx * 0.02, -h + 0.012, 0.03, 0.12, 0.02, 0.12, skin);
      parts.legs.push(leg);
    }
    parts.hop = true;
  } else if (kind === 'panda') {
    const white = 0xf6f4ef; const black = 0x232323;
    S(g, 0, 0.3, 0, 0.21, 0.2, 0.24, white);
    for (const sx of [-1, 1]) S(g, sx * 0.17, 0.33, 0.06, 0.08, 0.13, 0.09, black);
    head.position.set(0, 0.55, 0.16);
    S(head, 0, 0, 0, 0.19, 0.17, 0.17, white);
    for (const sx of [-1, 1]) {
      S(head, sx * 0.075, 0.02, 0.135, 0.05, 0.065, 0.03, black);
      S(head, sx * 0.075, 0.03, 0.16, 0.022, 0.025, 0.012, 0xffffff);
      const ear = new THREE.Group(); ear.position.set(sx * 0.13, 0.14, -0.02); head.add(ear); S(ear, 0, 0, 0, 0.06, 0.06, 0.04, black); parts.ears.push(ear);
    }
    S(head, 0, -0.05, 0.16, 0.035, 0.025, 0.02, black);
    legs(g, parts, { color: black, x: 0.14, w: 0.1, h: 0.15 });
    parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.3, -0.24); g.add(parts.tail);
    S(parts.tail, 0, 0, 0, 0.05, 0.05, 0.04, white);
  } else {
    // fox
    const fur = 0xe8762d; const white = 0xfff6ea; const dark = 0x3b2a22;
    S(g, 0, 0.28, 0, 0.16, 0.15, 0.26, fur);
    S(g, 0, 0.25, 0.11, 0.1, 0.11, 0.1, white);
    head.position.set(0, 0.47, 0.2);
    S(head, 0, 0, 0, 0.17, 0.15, 0.15, fur);
    const snout = C(head, 0, -0.04, 0.16, 0.07, 0.16, white); snout.rotation.x = Math.PI / 2;
    S(head, 0, -0.04, 0.245, 0.025, 0.02, 0.02, dark);
    for (const sx of [-1, 1]) S(head, sx * 0.1, -0.05, 0.08, 0.06, 0.05, 0.05, white);
    eyes(head, 0.04, 0.12, 0.07, 0.045);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.1, 0.14, -0.01); head.add(ear);
      C(ear, 0, 0.05, 0, 0.065, 0.13, fur); C(ear, 0, 0.1, 0, 0.03, 0.04, dark);
      ear.rotation.z = -sx * 0.18; parts.ears.push(ear);
    }
    legs(g, parts, { color: dark, w: 0.075, h: 0.16 });
    parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.3, -0.24); g.add(parts.tail);
    S(parts.tail, 0, 0.06, -0.12, 0.09, 0.09, 0.17, fur); S(parts.tail, 0, 0.09, -0.27, 0.06, 0.06, 0.06, white);
    parts.tail.rotation.x = 0.35;
  }
  g.userData.parts = parts;
  return g;
}

// t は 秒。moving は 歩いている とき。
export function animatePet(g, t, moving = false) {
  const p = g.userData.parts; if (!p) return;
  const k = g.userData.kind;
  if (p.hop) {
    const h = moving ? Math.abs(Math.sin(t * 9)) * 0.14 : Math.max(0, Math.sin(t * 2.2)) ** 8 * 0.06;
    g.position.y = h;
    p.legs.forEach((leg, i) => { leg.rotation.x = moving ? (i < 2 ? -1 : 1) * h * 3 : 0; });
  } else {
    g.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.03 : 0;
    p.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(t * 12 + ((i === 0 || i === 3) ? 0 : Math.PI)) * 0.6 : 0; });
  }
  if (p.tail) p.tail.rotation.y = Math.sin(t * (moving ? 14 : 5)) * (k === 'dog' ? 0.6 : 0.25);
  p.head.rotation.y = moving ? 0 : Math.sin(t * 0.7) * 0.35;
  p.head.rotation.z = moving ? 0 : Math.sin(t * 0.45 + 1) * 0.08;
  p.ears.forEach((ear, i) => { ear.rotation.x = Math.sin(t * 3 + i) * (moving ? 0.15 : 0.05); });
}

// いつも 横を 歩く 相棒。holder（プレイヤーの Group）の 子に なるので、島・家の 中・自分の 島の どこへ 行っても いっしょ。
// 歩くと 少し うしろへ さがって ついてくる、止まると 横に もどって こちらを 見上げる。
export function createPetBuddy(holder) {
  const root = new THREE.Group();
  root.name = 'pet-buddy';
  let model = null; let kind = null;
  let lag = 0; let time = 0;
  function set(next) {
    const want = PET_KINDS.includes(next) ? next : null;
    if (want === kind) return;
    if (model) root.remove(model);
    kind = want; model = want ? buildPet(want) : null;
    if (model) { model.scale.setScalar(1.25); root.add(model); }
    if (want && !root.parent) holder.add(root);
    if (!want && root.parent) root.parent.remove(root);
  }
  function update(dt, moving) {
    if (!model) return;
    time += dt;
    lag += ((moving ? 1 : 0) - lag) * Math.min(1, dt * 4);
    root.position.set(0.95, 0, 0.1 - lag * 0.55);
    root.rotation.y = (1 - lag) * -0.5;
    animatePet(model, time, moving);
  }
  return { set, update, get kind() { return kind; }, root };
}
