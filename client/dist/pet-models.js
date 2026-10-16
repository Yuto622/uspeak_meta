// ペット島の ペット — 6 しゅるいの 3D モデルと、いつも 横を 歩く 相棒。
//
// 形は 球・カプセル・円すい・輪だけ（モデルは 1 つも 落とさない）。頭を 大きく、目を つややかに した ちびキャラ。
// 1 つの 作り方を 3 か所で 使う：自分の 横を 歩く ペット、となりの 子の ペット（remote-players.js）、
// ペット島の 画面と 持ち物の 回る 絵（bag-preview.js の 'pet:<しゅるい>'）。
import * as THREE from './three.module.js';

const BALL = new THREE.SphereGeometry(1, 24, 16);
const CAP = new THREE.CapsuleGeometry(0.5, 1, 4, 12);
const CONE = new THREE.ConeGeometry(1, 1, 16);
const RING = new THREE.TorusGeometry(1, 0.22, 8, 24);
const ARC = new THREE.TorusGeometry(1, 0.28, 6, 12, Math.PI);
const DISC = new THREE.CircleGeometry(1, 24);
const mats = new Map();
const mat = (c, rough = 0.62, metal = 0) => {
  const key = `${c}:${rough}:${metal}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return mats.get(key);
};
// 小さい ぶひんは 影を 落とさない（となりの 子の ペットが ふえても 重く しない）。
const part = (g, geo, x, y, z, sx, sy, sz, m) => {
  const mesh = new THREE.Mesh(geo, typeof m === 'number' ? mat(m) : m);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
  mesh.castShadow = Math.max(sx, sy, sz) > 0.09;
  g.add(mesh); return mesh;
};
const S = (g, x, y, z, rx, ry, rz, c) => part(g, BALL, x, y, z, rx, ry, rz, c);
const C = (g, x, y, z, r, h, c) => part(g, CONE, x, y, z, r, h, r, c);
// カプセル：w は 太さ、h は 高さ（はしの 丸みを ふくむ）。
const K = (g, x, y, z, w, h, c) => part(g, CAP, x, y, z, w, h / 2, w, c);

const INK = mat(0x1d1720, 0.18);
const SHINE = mat(0xffffff, 0.3);
const NOSE = mat(0x2a1d1a, 0.25);

export const PET_KINDS = ['dog', 'cat', 'rabbit', 'frog', 'panda', 'fox'];

// 目：大きい 黒の だ円に ひかりを 2 つ。まばたき できるよう 1 つずつ Group。かわいさの ほとんどは ここ。
function eyes(parts, head, y, z, gap, r = 0.065) {
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * gap, y, z); head.add(e);
    S(e, 0, 0, 0, r, r * 1.2, r * 0.6, INK);
    S(e, r * 0.3, r * 0.42, r * 0.45, r * 0.36, r * 0.36, r * 0.2, SHINE);
    S(e, -r * 0.3, -r * 0.38, r * 0.5, r * 0.16, r * 0.16, r * 0.1, SHINE);
    parts.eyes.push(e);
  }
}
const cheeks = (head, y, z, gap, c = 0xff9db0) => { for (const sx of [-1, 1]) S(head, sx * gap, y, z, 0.05, 0.03, 0.02, mat(c, 0.9)); };
// 口：小さい「ω」。
function mouth(head, y, z, w = 0.022, c = INK) {
  for (const sx of [-1, 1]) { const m = part(head, ARC, sx * w, y, z, w, w, w, c); m.rotation.z = Math.PI; }
}
// 首わと 金の すず。
function collar(g, y, z, r, c) {
  const ring = part(g, RING, 0, y, z, r, r, r * 0.9, mat(c, 0.45)); ring.rotation.x = Math.PI / 2 - 0.35;
  S(g, 0, y - 0.03, z + r * 0.95, 0.032, 0.032, 0.032, mat(0xffc93c, 0.25, 0.6));
}
function legs(g, parts, { color, x = 0.11, zf = 0.09, zb = -0.11, h = 0.15, w = 0.085, paw = null }) {
  for (const [sx, sz] of [[-1, zf], [1, zf], [-1, zb], [1, zb]]) {
    const leg = new THREE.Group(); leg.position.set(sx * x, h, sz); g.add(leg);
    K(leg, 0, -h / 2, 0, w, h + w * 0.5, color);
    if (paw) S(leg, 0, -h + w * 0.25, w * 0.15, w * 0.55, w * 0.32, w * 0.62, paw);
    parts.legs.push(leg);
  }
}
// しっぽ：球を つないで まがった しっぽ。
function chain(grp, pts, c, tip = null) {
  pts.forEach(([x, y, z, r], i) => S(grp, x, y, z, r, r, r, i === pts.length - 1 && tip != null ? tip : c));
}

// 1 ぴきの モデル。足元が y=0、前が +z。
export function buildPet(kind) {
  const g = new THREE.Group();
  g.userData.kind = kind;
  const body = new THREE.Group(); g.add(body);
  const head = new THREE.Group(); g.add(head);
  const parts = { legs: [], head, body, tail: null, ears: [], eyes: [], hop: false, seed: PET_KINDS.indexOf(kind) * 1.37 };
  const tail = () => { parts.tail = new THREE.Group(); g.add(parts.tail); return parts.tail; };

  if (kind === 'dog') {
    const fur = 0xe2a766; const cream = 0xfbe8cf; const dark = 0x9a6136;
    S(body, 0, 0.27, -0.02, 0.17, 0.15, 0.21, fur);
    S(body, 0, 0.26, 0.09, 0.11, 0.11, 0.09, cream);
    collar(body, 0.37, 0.08, 0.12, 0xe8455a);
    head.position.set(0, 0.55, 0.12);
    S(head, 0, 0, 0, 0.22, 0.2, 0.2, fur);
    S(head, 0, -0.065, 0.14, 0.12, 0.085, 0.09, cream);
    for (const sx of [-1, 1]) S(head, sx * 0.085, 0.115, 0.15, 0.03, 0.022, 0.02, cream);
    S(head, 0, -0.025, 0.225, 0.038, 0.03, 0.028, NOSE);
    mouth(head, -0.085, 0.215);
    S(head, 0, -0.12, 0.2, 0.03, 0.022, 0.02, 0xf07088);
    eyes(parts, head, 0.04, 0.165, 0.09);
    cheeks(head, -0.045, 0.16, 0.135);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.18, 0.08, -0.01); head.add(ear);
      S(ear, 0, -0.09, 0, 0.06, 0.13, 0.095, dark); ear.rotation.z = sx * 0.32; parts.ears.push(ear);
    }
    legs(g, parts, { color: fur, paw: cream });
    const t = tail(); t.position.set(0, 0.33, -0.2);
    chain(t, [[0, 0.03, -0.02, 0.05], [0, 0.09, -0.05, 0.045], [0, 0.15, -0.04, 0.042]], fur, cream);
  } else if (kind === 'cat') {
    const fur = 0xf3a552; const cream = 0xfff3e2; const stripe = 0xc9772c;
    S(body, 0, 0.26, -0.02, 0.15, 0.14, 0.21, fur);
    S(body, 0, 0.25, 0.08, 0.1, 0.1, 0.08, cream);
    for (const z of [-0.12, -0.03]) S(body, 0, 0.38, z, 0.1, 0.022, 0.03, stripe);
    collar(body, 0.35, 0.08, 0.11, 0x3d8bff);
    head.position.set(0, 0.53, 0.11);
    S(head, 0, 0, 0, 0.22, 0.19, 0.19, fur);
    S(head, 0, -0.065, 0.13, 0.1, 0.065, 0.07, cream);
    for (const [x, w] of [[-0.05, 0.016], [0, 0.02], [0.05, 0.016]]) S(head, x, 0.15, 0.1, w, 0.04, 0.02, stripe);
    S(head, 0, -0.03, 0.19, 0.026, 0.02, 0.02, 0xf07088);
    mouth(head, -0.07, 0.185, 0.02);
    eyes(parts, head, 0.035, 0.155, 0.088, 0.062);
    cheeks(head, -0.05, 0.15, 0.13);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.12, 0.15, 0); head.add(ear);
      C(ear, 0, 0.05, 0, 0.075, 0.12, fur); C(ear, 0, 0.045, 0.02, 0.045, 0.08, 0xffb8c8);
      ear.rotation.z = -sx * 0.2; parts.ears.push(ear);
      for (const dy of [-0.055, -0.08]) { const w = part(head, CAP, sx * 0.2, dy, 0.11, 0.006, 0.06, 0.006, 0x7a5a44); w.rotation.z = Math.PI / 2 + sx * (dy + 0.07) * 3; }
    }
    legs(g, parts, { color: fur, w: 0.078, paw: cream });
    const t = tail(); t.position.set(0, 0.3, -0.21);
    chain(t, [[0, 0.02, -0.03, 0.04], [0, 0.08, -0.08, 0.038], [0, 0.15, -0.09, 0.036], [0, 0.22, -0.06, 0.036], [0, 0.27, -0.01, 0.038]], fur, stripe);
  } else if (kind === 'rabbit') {
    const fur = 0xfbf8f3; const pink = 0xffb3c6;
    S(body, 0, 0.24, -0.03, 0.17, 0.17, 0.19, fur);
    head.position.set(0, 0.5, 0.1);
    S(head, 0, 0, 0, 0.2, 0.18, 0.18, fur);
    for (const sx of [-1, 1]) S(head, sx * 0.04, -0.06, 0.15, 0.045, 0.04, 0.035, fur);
    S(head, 0, -0.035, 0.175, 0.025, 0.02, 0.018, pink);
    eyes(parts, head, 0.03, 0.155, 0.085, 0.06);
    cheeks(head, -0.045, 0.15, 0.125);
    [[-1, 0], [1, 0.55]].forEach(([sx, bend]) => {
      const ear = new THREE.Group(); ear.position.set(sx * 0.075, 0.13, -0.02); head.add(ear);
      K(ear, 0, 0.08, 0, 0.085, 0.2, fur); S(ear, 0, 0.08, 0.03, 0.026, 0.075, 0.012, pink);
      const tip = new THREE.Group(); tip.position.y = 0.17; ear.add(tip); tip.rotation.z = -sx * bend;
      K(tip, 0, 0.06, 0, 0.08, 0.15, fur); S(tip, 0, 0.055, 0.03, 0.024, 0.05, 0.012, pink);
      ear.rotation.z = -sx * 0.14; parts.ears.push(ear);
    });
    legs(g, parts, { color: fur, h: 0.09, w: 0.08, zf: 0.09, zb: -0.1, paw: fur });
    for (const sx of [-1, 1]) S(body, sx * 0.13, 0.08, -0.06, 0.06, 0.06, 0.11, fur);
    const t = tail(); t.position.set(0, 0.22, -0.21);
    S(t, 0, 0, 0, 0.07, 0.07, 0.07, 0xffffff);
    parts.hop = true;
  } else if (kind === 'frog') {
    const skin = 0x72c84e; const belly = 0xe2f5b4; const spot = 0x58a83a;
    S(body, 0, 0.17, 0, 0.21, 0.14, 0.2, skin);
    S(body, 0, 0.14, 0.07, 0.16, 0.1, 0.14, belly);
    for (const [x, z] of [[-0.09, -0.08], [0.1, -0.03], [0.02, -0.14]]) S(body, x, 0.29, z, 0.035, 0.012, 0.035, spot);
    head.position.set(0, 0.29, 0.08);
    S(head, 0, 0, 0.02, 0.2, 0.12, 0.16, skin);
    for (const sx of [-1, 1]) {
      S(head, sx * 0.1, 0.1, 0.03, 0.085, 0.085, 0.085, skin);
      const e = new THREE.Group(); e.position.set(sx * 0.1, 0.105, 0.09); head.add(e);
      S(e, 0, 0, 0, 0.055, 0.06, 0.03, mat(0xffffff, 0.4));
      S(e, 0, 0, 0.012, 0.038, 0.045, 0.024, INK);
      S(e, 0.012, 0.016, 0.03, 0.014, 0.014, 0.008, SHINE);
      parts.eyes.push(e);
    }
    const smile = part(head, ARC, 0, -0.03, 0.165, 0.07, 0.04, 0.04, mat(0x3d7a2b, 0.5)); smile.rotation.z = Math.PI;
    cheeks(head, -0.035, 0.14, 0.13, 0xff8fa8);
    for (const [sx, sz, h, big] of [[-1, 0.12, 0.07, false], [1, 0.12, 0.07, false], [-1, -0.1, 0.06, true], [1, -0.1, 0.06, true]]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.19, h, sz); g.add(leg);
      if (big) S(leg, 0, 0.02, 0, 0.08, 0.07, 0.11, skin); else K(leg, 0, -h / 2 + 0.01, 0, 0.07, h + 0.03, skin);
      S(leg, sx * 0.02, -h + 0.012, 0.04, 0.065, 0.016, 0.07, skin);
      parts.legs.push(leg);
    }
    parts.hop = true;
  } else if (kind === 'panda') {
    const white = 0xf8f6f1; const black = 0x262428;
    S(body, 0, 0.29, -0.01, 0.2, 0.19, 0.22, white);
    for (const sx of [-1, 1]) S(body, sx * 0.15, 0.33, 0.07, 0.085, 0.13, 0.1, black);
    S(body, 0, 0.42, 0.02, 0.16, 0.06, 0.12, black);
    head.position.set(0, 0.58, 0.12);
    S(head, 0, 0, 0, 0.23, 0.2, 0.2, white);
    for (const sx of [-1, 1]) {
      const patch = S(head, sx * 0.085, 0.02, 0.15, 0.06, 0.075, 0.035, black); patch.rotation.z = sx * 0.5;
      const ear = new THREE.Group(); ear.position.set(sx * 0.15, 0.15, -0.02); head.add(ear); S(ear, 0, 0, 0, 0.07, 0.065, 0.045, black); parts.ears.push(ear);
    }
    eyes(parts, head, 0.025, 0.175, 0.085, 0.04);
    S(head, 0, -0.05, 0.185, 0.035, 0.025, 0.02, NOSE);
    mouth(head, -0.09, 0.18);
    cheeks(head, -0.07, 0.165, 0.13);
    legs(g, parts, { color: black, x: 0.13, w: 0.1, h: 0.15 });
    const t = tail(); t.position.set(0, 0.28, -0.22);
    S(t, 0, 0, 0, 0.05, 0.05, 0.04, white);
  } else {
    // fox
    const fur = 0xf07a2c; const white = 0xfff6ea; const dark = 0x3b2a22;
    S(body, 0, 0.27, -0.02, 0.15, 0.14, 0.21, fur);
    S(body, 0, 0.25, 0.09, 0.095, 0.1, 0.085, white);
    head.position.set(0, 0.52, 0.13);
    S(head, 0, 0, 0, 0.21, 0.18, 0.18, fur);
    for (const sx of [-1, 1]) S(head, sx * 0.08, -0.06, 0.1, 0.09, 0.07, 0.08, white);
    S(head, 0, -0.06, 0.16, 0.07, 0.055, 0.08, white);
    S(head, 0, -0.04, 0.235, 0.03, 0.024, 0.022, NOSE);
    mouth(head, -0.09, 0.2, 0.018);
    eyes(parts, head, 0.04, 0.15, 0.085, 0.058);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.11, 0.15, -0.01); head.add(ear);
      C(ear, 0, 0.065, 0, 0.08, 0.16, fur); C(ear, 0, 0.055, 0.025, 0.045, 0.1, white); C(ear, 0, 0.125, 0, 0.035, 0.04, dark);
      ear.rotation.z = -sx * 0.22; parts.ears.push(ear);
    }
    legs(g, parts, { color: dark, w: 0.072, h: 0.16 });
    const t = tail(); t.position.set(0, 0.29, -0.22);
    chain(t, [[0, 0.03, -0.05, 0.08], [0, 0.07, -0.14, 0.1], [0, 0.12, -0.23, 0.09], [0, 0.17, -0.29, 0.065]], fur, white);
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
  // いき（体が すこし ふくらむ）と まばたき（4 秒に 1 回くらい）。
  const breath = 1 + Math.sin(t * 2.6) * (moving ? 0.01 : 0.025);
  p.body.scale.set(1, breath, 1);
  const blink = ((t + p.seed) % 3.9) < 0.13 ? 0.12 : 1;
  for (const e of p.eyes) e.scale.y = blink;
  if (p.tail) p.tail.rotation.y = Math.sin(t * (moving ? 14 : 5)) * (k === 'dog' ? 0.6 : k === 'fox' ? 0.2 : 0.3);
  p.head.rotation.x = moving ? Math.sin(t * 12) * 0.04 : 0;
  p.head.rotation.y = moving ? 0 : Math.sin(t * 0.7) * 0.35;
  p.head.rotation.z = moving ? 0 : Math.sin(t * 0.45 + 1) * 0.1;
  p.ears.forEach((ear, i) => { ear.rotation.x = Math.sin(t * 3 + i) * (moving ? 0.15 : 0.05); });
}

// 足もとの まるい かげ（影の ない 画面でも 地面に 立って 見える）。
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });

// いつも 横を 歩く 相棒。holder（プレイヤーの Group）の 子に なるので、島・家の 中・自分の 島の どこへ 行っても いっしょ。
// 歩くと 少し うしろへ さがって ついてくる、止まると 横に もどって こちらを 見上げる。
export function createPetBuddy(holder) {
  const root = new THREE.Group();
  root.name = 'pet-buddy';
  const shadow = new THREE.Mesh(DISC, SHADOW);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(0.3); shadow.renderOrder = 1;
  root.add(shadow);
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
    shadow.scale.setScalar(0.3 - model.position.y * 0.6);
  }
  return { set, update, get kind() { return kind; }, root };
}
