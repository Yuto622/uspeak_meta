// メインの島の ひろば（2026-11：「メインの島を 東へ ひろげて 広場を。きせつの イベント・時計台・フリーマーケット・歩く 村人」）。
//
// 場所：大通り（z 16）を 東へ のばした 先。石だたみは x 57〜85・z 3〜29（まんなか 71, 16）。島の 形の 外なので、
// main-world.js が createIsland に `annex`（PLAZA.annex）を わたして 土地を つき出して いる（island-kit.js）。
//   北 … 時計台（71, 6.5）。はりは 世界の 時計（shop-hours.js の worldHour：あさ 7 時に ひるまが はじまる）。
//   まんなか … ふんすいと まるい もようの 石だたみ。
//   東 … きせつの イベントの ぶたい（まだ 空っぽ。`eventSpot` に 後で かざる）。
//   南 … フリーマーケット 6 けん（かざり。売り買いは まだ ない。お店の 人は plaza-walkers.js が 立たせる）。
// 作りかた：地面・台・柱・ひさしは island-kit の `D`（まとめて 描く 箱）。時計台と ふんすいだけ なめらかな 形（lathe・円・まとめた 形）。
// 光は 足さない（emissive だけ）。canvas の 絵は try/catch（検査は Node の にせの DOM で 走る）。品物は ほかの 画面の リアルな 形を かりる
// （food-real・wardrobe-real・furniture-real・town-real。形と 材質は 共有＝ dispose しない・envMap を 上書きしない）。
import * as THREE from './three.module.js';
import { worldHour } from './shop-hours.js';
import { realFood } from './food-real.js';
import { realModel } from './wardrobe-real.js';
import { furnitureModel } from './furniture-real.js';
import { blockModel } from './town-real.js';

// 島を 建てる 前（createIsland）に 要る 数字。annex は 土地（まわりに 草と すなはまの ふち）。
export const PLAZA = {
  cx: 71, cz: 16, x0: 57, x1: 85, z0: 3, z1: 29,
  annex: { x0: 52, x1: 88, z0: -1, z1: 33, r: 7 },
};

// フリーマーケットの 6 けん（西から）。type：'table'＝ひさしの ある 台 ／ 'blanket'＝しきものと パラソル。
export const STALLS = [
  { id: 'fruit', type: 'table', x: 59.8, color: 0xd9483b },
  { id: 'hats', type: 'table', x: 64.3, color: 0x6b4c9c },
  { id: 'toys', type: 'blanket', x: 68.8, color: 0xf2b630 },
  { id: 'furniture', type: 'blanket', x: 73.2, color: 0x5a7fb0 },
  { id: 'books', type: 'table', x: 77.7, color: 0x2f8f5b },
  { id: 'music', type: 'blanket', x: 82.2, color: 0xc8553d },
];
const STALL_Z = 25.6;

const P = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.6, metalness: 0, ...o });
const S = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
function tex(w, h, paint) {
  try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g?.fillRect || !g.arc) return null; paint(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; } catch { return null; }
}
// いくつかの 形を 1 つに まとめる（同じ 材質の 小物を 1 回で 描く）。
function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = name === 'uv' ? 2 : 3, total = parts.reduce((n, g) => n + g.attributes.position.count, 0), arr = new Float32Array(total * size);
    let at = 0;
    for (const g of parts) { const a = g.attributes[name]; if (a) arr.set(a.array, at); at += g.attributes.position.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
const at = (geo, x, y, z, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, y, z); return geo; };
// 底を y = 0・まんなかを 原点に して、いちばん 長い 辺を size に そろえる。
function fit(obj, size) {
  const g = new THREE.Group(); g.add(obj);
  const box = new THREE.Box3().setFromObject(obj), dim = box.getSize(new THREE.Vector3()), k = size / (Math.max(dim.x, dim.y, dim.z) || 1);
  obj.scale.multiplyScalar(k); box.setFromObject(obj); const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

// ---- 時計台 ----
// Group（底が y = 0・戸口が +z）。高さ 17 くらい・22 メッシュ。`userData.setHour(h)`＝はりを 合わせる、`userData.lit`＝夜に 光る 材質。
export function clockTower() {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o; };
  const sq = (rt, rb, h) => { const c = new THREE.CylinderGeometry(rt * Math.SQRT1_2 * 2 / 2 * Math.SQRT2, rb * Math.SQRT1_2 * 2 / 2 * Math.SQRT2, h, 4); c.rotateY(Math.PI / 4); return c; };   // 上の 辺 rt×2・下の 辺 rb×2 の 四角い 台
  const stone = P({ color: 0xb9b3a4, roughness: 0.9 });
  const brickMap = tex(256, 256, (c, W, H) => {
    c.fillStyle = '#c9b79c'; c.fillRect(0, 0, W, H);
    const cols = ['#b5654a', '#a8583f', '#c07355', '#b86a4c', '#9c5139'];
    for (let r = 0; r < 16; r += 1) for (let i = -1; i < 8; i += 1) { c.fillStyle = cols[(r * 3 + i * 5 + 40) % 5]; c.fillRect(i * 32 + (r % 2 ? 16 : 0) + 1.5, r * 16 + 1.5, 29, 13); }
  });
  if (brickMap) { brickMap.wrapS = brickMap.wrapT = THREE.RepeatWrapping; brickMap.repeat.set(1.4, 3.4); }
  const brick = P({ color: brickMap ? 0xffffff : 0xb5654a, map: brickMap, roughness: 0.85 });
  const plaster = P({ color: 0xf3ead6, roughness: 0.8 });
  const slate = P({ color: 0x3f6f7a, roughness: 0.45, clearcoat: 0.3 });
  const gold = P({ color: 0xe8b93c, roughness: 0.3, metalness: 0.8 });
  const wood = P({ color: 0x6a4a32, roughness: 0.7 });
  const ink = S({ color: 0x1d2433, roughness: 0.5 });

  add(sq(1.75, 1.95, 0.9), stone, 0, 0.45, 0);                               // 石の 台
  add(new THREE.BoxGeometry(2.7, 7.0, 2.7), brick, 0, 0.9 + 3.5, 0);         // レンガの どう
  add(merge([at(new THREE.BoxGeometry(3.0, 0.3, 3.0), 0, 4.2, 0), at(new THREE.BoxGeometry(3.1, 0.34, 3.1), 0, 7.9 + 0.17, 0)]), stone);   // 石の おび 2 本
  add(new THREE.BoxGeometry(3.2, 3.2, 3.2), plaster, 0, 8.24 + 1.6, 0);      // 時計の はこ（しっくい）
  add(new THREE.BoxGeometry(3.7, 0.28, 3.7), stone, 0, 11.44 + 0.14, 0);     // のき
  // かねの へや：4 本の 柱と はり。
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push(at(new THREE.BoxGeometry(0.34, 1.5, 0.34), sx * 1.3, 11.72 + 0.75, sz * 1.3));
  posts.push(at(new THREE.BoxGeometry(3.2, 0.26, 3.2), 0, 13.22 + 0.13, 0));
  add(merge(posts), plaster);
  const bell = new THREE.LatheGeometry([[0.02, 0.62], [0.16, 0.6], [0.26, 0.42], [0.32, 0.16], [0.46, 0.02], [0.5, -0.04]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  add(merge([bell, at(new THREE.SphereGeometry(0.1, 10, 8), 0, -0.02, 0), at(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), 0, 0.8, 0)]), P({ color: 0xd9a43a, roughness: 0.32, metalness: 0.85, side: THREE.DoubleSide }), 0, 12.25, 0);
  const roof = new THREE.ConeGeometry(2.75, 3.4, 4); roof.rotateY(Math.PI / 4);
  add(roof, slate, 0, 13.48 + 1.7, 0);                                       // とんがり 屋根
  add(merge([at(new THREE.SphereGeometry(0.2, 14, 10), 0, 17.2, 0), at(new THREE.ConeGeometry(0.07, 0.7, 8), 0, 17.7, 0)]), gold);
  // 戸口（南）と、どうの 小さな まど（4 面・夜に 灯る）。
  add(merge([at(new THREE.BoxGeometry(1.2, 2.0, 0.14), 0, 0.9 + 1.0, 1.36), at(new THREE.BoxGeometry(1.5, 0.16, 0.2), 0, 2.98, 1.38)]), wood);
  const win = S({ color: 0x9cc4d8, roughness: 0.2, emissive: 0xffd68a, emissiveIntensity: 0 });
  const wins = [];
  for (let k = 0; k < 4; k += 1) for (const y of [5.6, 6.9]) { if (k === 0 && y < 3) continue; wins.push(at(at(new THREE.BoxGeometry(0.5, 0.8, 0.08), 0, y, 1.36), 0, 0, 0, k * Math.PI / 2)); }
  add(merge(wins), win, 0, 0, 0, false);

  // 時計の 面 4 つ（1 メッシュ）・ふち（1 メッシュ）・はり（面ごとに 2 本）。
  const faceMap = tex(256, 256, (c, W) => {
    const m = W / 2;
    c.fillStyle = '#f3ead6'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(m, m, m - 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1d2433'; c.lineWidth = 7; c.beginPath(); c.arc(m, m, m - 8, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0, r0 = m - (big ? 30 : 20), r1 = m - 13;
      c.lineWidth = big ? 6 : 2; c.beginPath(); c.moveTo(m + Math.sin(a) * r0, m - Math.cos(a) * r0); c.lineTo(m + Math.sin(a) * r1, m - Math.cos(a) * r1); c.stroke();
    }
    c.fillStyle = '#1d2433'; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    [['12', 0], ['3', 1], ['6', 2], ['9', 3]].forEach(([s, q]) => { const a = q * Math.PI / 2; c.fillText(s, m + Math.sin(a) * (m - 52), m - Math.cos(a) * (m - 52) + 2); });
  });
  const face = S({ color: 0xffffff, map: faceMap, roughness: 0.5, emissive: 0xffe2a6, emissiveMap: faceMap, emissiveIntensity: 0.04 });
  if (!faceMap) face.color.set(0xfffaf0);
  const Y = 9.84, R = 1.62, faces = [], rims = [], caps = [], hands = [];
  for (let k = 0; k < 4; k += 1) {
    const a = k * Math.PI / 2;
    faces.push(at(at(new THREE.CircleGeometry(1.24, 40), 0, Y, R), 0, 0, 0, a));
    rims.push(at(at(new THREE.TorusGeometry(1.27, 0.08, 8, 40), 0, Y, R), 0, 0, 0, a));
    const cap = new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12); cap.rotateX(Math.PI / 2); caps.push(at(at(cap, 0, Y, R + 0.1), 0, 0, 0, a));
    const pivot = new THREE.Group(); pivot.position.set(Math.sin(a) * R, Y, Math.cos(a) * R); pivot.rotation.y = a; g.add(pivot);
    const hg = new THREE.BoxGeometry(0.15, 0.72, 0.04); hg.translate(0, 0.28, 0.04);
    const mg = new THREE.BoxGeometry(0.09, 1.08, 0.04); mg.translate(0, 0.44, 0.08);
    const h = new THREE.Mesh(hg, ink), m = new THREE.Mesh(mg, ink); pivot.add(h, m); hands.push({ h, m });
  }
  add(merge(faces), face, 0, 0, 0, false);
  add(merge(rims), gold, 0, 0, 0, false);
  add(merge(caps), gold, 0, 0, 0, false);

  g.userData.setHour = (hour) => {
    const hr = -((hour % 12) / 12) * Math.PI * 2, mn = -(hour % 1) * Math.PI * 2;   // 正面から 見て 右まわり
    for (const p of hands) { p.h.rotation.z = hr; p.m.rotation.z = mn; }
  };
  g.userData.setNight = (n) => { face.emissiveIntensity = 0.04 + n * 0.8; win.emissiveIntensity = n * 1.1; };
  g.userData.setHour(10 + 10 / 60);
  return g;
}

// ---- ふんすい ----（底が y = 0・半径 1.9）
function fountain() {
  const g = new THREE.Group();
  const stone = P({ color: 0xc9c2b2, roughness: 0.85 });
  const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const add = (geo, m, y = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(lathe([[0, 0.3], [1.55, 0.3], [1.62, 0.62], [1.9, 0.62], [1.95, 0.5], [1.9, 0], [0, 0]]), stone);
  add(lathe([[0, 0.3], [0.5, 0.3], [0.34, 0.5], [0.2, 1.2], [0.3, 1.45], [0.85, 1.62], [0.9, 1.74], [0.78, 1.74], [0.16, 1.6], [0.12, 1.95], [0, 2.02]], 24), stone);
  const water = P({ color: 0x5fb6d9, roughness: 0.08, transparent: true, opacity: 0.82, clearcoat: 1, emissive: 0x2f8fb8, emissiveIntensity: 0.12 });
  const disc = new THREE.CircleGeometry(1.58, 36); disc.rotateX(-Math.PI / 2);
  const top = new THREE.CircleGeometry(0.76, 24); top.rotateX(-Math.PI / 2); top.translate(0, 1.2, 0);
  add(merge([disc, top]), water, 0.52).castShadow = false;
  // 水の はしら（ゆれる）。
  const jet = add(new THREE.CylinderGeometry(0.05, 0.16, 0.8, 8), P({ color: 0xcfeefa, roughness: 0.1, transparent: true, opacity: 0.7 }), 2.3); jet.castShadow = false;
  g.userData.update = (t) => { jet.scale.y = 1 + Math.sin(t * 5.3) * 0.14; jet.position.y = 2.02 + 0.4 * jet.scale.y; };
  return g;
}

// ---- ひろばを 建てる ----
// D・lamp・bench・sprite・obstacles は island-kit の 道具（main-world.js の build から）。woods は リアルな 木の 場所（createRealTrees に わたる）。keep は 木や 花を 置かない 四角。
export function buildPlaza({ root, D, lamp, bench, sprite, obstacles, woods = [], keep = () => {} }) {
  const { cx, cz, x0, x1, z0, z1 } = PLAZA;
  const solid = (x, z, w, d) => obstacles.push({ x, z, w, d });
  keep((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 4, (z1 - z0) / 2 + 4);

  // 石だたみ：2×2 の 石を 市松に。まんなか（半径 7.2）は 1×1 の 石で まるい わの もよう。かどは まるく。
  const BASE = [0xd6ccb6, 0xcbbfa5], RING = [0xe6dcc6, 0xc98f66, 0xa9a59a];
  const corner = (x, z) => { const dx = Math.abs(x - cx) - ((x1 - x0) / 2 - 4), dz = Math.abs(z - cz) - ((z1 - z0) / 2 - 4); return dx > 0 && dz > 0 && dx * dx + dz * dz > 16.5; };
  for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) {
    if (corner(x, z)) continue;
    if (Math.hypot(x - cx, z - cz) < 7.2) {
      for (const ox of [-0.5, 0.5]) for (const oz of [-0.5, 0.5]) {
        const r = Math.hypot(x + ox - cx, z + oz - cz);
        const tone = r < 2.4 ? RING[2] : r < 3.5 ? RING[0] : r < 4.6 ? RING[1] : r < 6.4 ? RING[0] : RING[1];
        D(x + ox, 0.17, z + oz, 1.01, 0.14, 1.01, tone, 0, 'cobble');
      }
    } else D(x, 0.17, z, 2.02, 0.14, 2.02, BASE[((x + z) / 2 & 1)], 0, 'cobble');
  }

  // ふんすい（まんなか）。
  let fount = null;
  try { fount = fountain(); fount.position.set(cx, 0.22, cz); root.add(fount); } catch { fount = null; }
  solid(cx, cz, 1.75, 1.75);

  // 時計台（北）。
  const CLOCK = { x: cx, z: 6.5 };
  let tower = null;
  try { tower = clockTower(); tower.position.set(CLOCK.x, 0.2, CLOCK.z); root.add(tower); } catch (err) { console.warn('[plaza] 時計台が 作れない', err); tower = null; }
  solid(CLOCK.x, CLOCK.z, 1.95, 1.95);
  sprite({ en: '🕰 Clock Tower', ja: '🕰 とけいだい' }, CLOCK.x, 4.3, CLOCK.z + 2.3, { width: 5.4, size: 38 });
  // 入口の 立てふだ（大通りから 入って すぐ 左）。
  D(58.4, 1.5, 10.6, 0.2, 2.6, 0.2, 0x6f5b3e);
  sprite({ en: '⛲ Plaza', ja: '⛲ ひろば' }, 58.4, 3.3, 10.6, { width: 4.4, size: 40 });

  // ベンチ（北・南むき）、街灯、花の はち、ふちの 木。
  bench(63.5, 4.7, 0); bench(78.5, 4.7, 0);
  for (const [lx, lz] of [[57.8, 12.3], [57.8, 19.7], [67, 7.5], [75, 7.5], [84.2, 4.4], [84.3, 22.6], [57.9, 4.6]]) lamp(lx, lz);
  const PETAL = [0xf08fb0, 0xf2c94c, 0xffffff, 0xe86f6f];
  [[67.2, 4.4], [74.8, 4.4], [60, 4.4], [82, 4.4], [78.6, 10], [78.6, 22]].forEach(([px, pz], i) => {
    D(px, 0.5, pz, 1.5, 0.56, 1.5, 0xb9b3a4); D(px, 0.8, pz, 1.3, 0.1, 1.3, 0x6b5238);
    D(px, 0.98, pz, 1.05, 0.34, 1.05, 0x5d8b4f);
    for (const [ox, oz] of [[-0.3, -0.25], [0.28, -0.2], [0, 0.3], [-0.25, 0.25], [0.32, 0.22]]) D(px + ox, 1.2, pz + oz, 0.22, 0.2, 0.22, PETAL[(i + Math.round(ox * 10 + 9)) % 4]);
    solid(px, pz, 0.75, 0.75);
  });
  for (const [tx, tz, scale, kind] of [[60.5, 1.4, 0.8, 0], [66.5, 1.2, 0.7, 2], [75.5, 1.2, 0.72, 2], [81.5, 1.4, 0.82, 0], [55, 6.5, 0.78, 0], [54.6, 25.5, 0.74, 2], [86.4, 8, 0.6, 2]]) woods.push({ x: tx, z: tz, scale, kind });

  // ---- きせつの イベントの ぶたい（東・西むき）----
  const STAGE = { x: 82, z: 16, w: 5, d: 9, y: 0.76 };
  {
    const { x, z, w, d } = STAGE, top = 0.2 + 0.5;
    D(x, 0.2 + 0.24, z, w, 0.48, d, 0x8a6a45);
    for (let i = 0; i < d; i += 1) D(x, top + 0.02, z - d / 2 + 0.5 + i, w + 0.16, 0.08, 0.94, i % 2 ? 0xc49a66 : 0xb88d5a);
    D(x - w / 2 - 0.32, 0.2 + 0.13, z, 0.6, 0.26, 2.4, 0xb88d5a);                       // 西の だん
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D(x + sx * (w / 2 - 0.2), top + 2.0, z + sz * (d / 2 - 0.2), 0.22, 4.0, 0.22, 0x6f5b3e);
    for (const sz of [-1, 1]) D(x, top + 3.95, z + sz * (d / 2 - 0.2), w - 0.2, 0.16, 0.16, 0x6f5b3e);
    for (const sx of [-1, 1]) D(x + sx * (w / 2 - 0.2), top + 3.95, z, 0.16, 0.16, d - 0.2, 0x6f5b3e);
    for (let i = 0; i < 8; i += 1) D(x + w / 2 - 0.12, top + 1.9, z - d / 2 + 0.75 + i * ((d - 1.5) / 7), 0.1, 3.7, (d - 1.5) / 7 + 0.02, i % 2 ? 0xd9483b : 0xf7f1e1);   // うしろの まく
    // 旗の ひも：正面（南北）と 両わき（東西）。
    const FLAG = [0xe4708a, 0xf0c05a, 0x7ec98a, 0x6aa9d4];
    const line = (ax, az, bx, bz, h) => {
      const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.05)), alongZ = Math.abs(bz - az) > Math.abs(bx - ax);
      for (let i = 1; i < n; i += 1) { const t = i / n, sag = Math.sin(t * Math.PI) * 0.45; D(ax + (bx - ax) * t, h - sag, az + (bz - az) * t, alongZ ? 0.08 : 0.4, 0.48, alongZ ? 0.4 : 0.08, FLAG[i % 4]); }
    };
    line(x - w / 2 + 0.2, z - d / 2 + 0.2, x - w / 2 + 0.2, z + d / 2 - 0.2, top + 3.75);
    line(x - w / 2 + 0.2, z - d / 2 + 0.2, x + w / 2 - 0.2, z - d / 2 + 0.2, top + 3.75);
    line(x - w / 2 + 0.2, z + d / 2 - 0.2, x + w / 2 - 0.2, z + d / 2 - 0.2, top + 3.75);
    for (const sz of [-1, 1]) D(x - w / 2 + 0.2, top + 3.4, z + sz * (d / 2 - 0.2), 0.3, 0.36, 0.3, 0xffc56a, 1.2);   // ちょうちん（夜に 灯る）
    solid(x, z, w / 2, d / 2);
    sprite({ en: '🎪 Seasonal events (coming soon)', ja: '🎪 きせつの イベント（じゅんび ちゅう）' }, x - 0.6, top + 5.0, z, { width: 9.6, size: 34 });
  }

  // ---- フリーマーケット（南）----
  const goods = new THREE.Group(); root.add(goods);
  const put = (make, size, x, y, z, ry = 0) => { try { const o = make(); if (!o) return null; const f = fit(o, size); f.position.set(x, y, z); f.rotation.y = ry; goods.add(f); return f; } catch { return null; } };
  const CREAM = 0xf7f1e1, POST = 0x6f5b3e, BOOK = [0xd9483b, 0x2f6fbf, 0xf2b630, 0x2f9e5b];
  const stalls = [];
  for (const st of STALLS) {
    const x = st.x, z = STALL_Z;
    if (st.type === 'table') {
      D(x, 0.2 + 0.42, z, 3.0, 0.84, 1.2, 0xa8835a);
      D(x, 1.07, z, 3.16, 0.07, 1.34, CREAM); D(x, 0.86, z - 0.66, 3.16, 0.44, 0.04, st.color);
      for (const sx of [-1.48, 1.48]) { D(x + sx, 1.55, z + 0.86, 0.14, 2.7, 0.14, POST); D(x + sx, 1.4, z - 0.84, 0.14, 2.4, 0.14, POST); }
      for (let i = 0; i < 5; i += 1) { D(x - 1.28 + i * 0.64, 2.92, z + 0.45, 0.64, 0.1, 1.0, i % 2 ? st.color : CREAM); D(x - 1.28 + i * 0.64, 2.72, z - 0.45, 0.64, 0.1, 1.0, i % 2 ? st.color : CREAM); D(x - 1.28 + i * 0.64, 2.5, z - 0.98, 0.64, 0.3, 0.06, i % 2 ? CREAM : st.color); }
      for (const sx of [-1.48, 1.48]) D(x + sx, 2.2, z - 0.98, 0.26, 0.32, 0.26, 0xffc56a, 1.2);
      solid(x, z, 1.55, 0.65);
    } else {
      D(x, 0.27, z - 0.2, 3.0, 0.05, 2.2, st.color);
      for (const sx of [-1.0, 0, 1.0]) D(x + sx, 0.285, z - 0.2, 0.34, 0.05, 2.2, CREAM);
      // パラソル（うしろ）と ちょうちん。
      D(x + 1.25, 1.6, z + 0.85, 0.1, 2.8, 0.1, 0x9aa4b0);
      for (const [ox, oz, c] of [[-0.55, -0.55, st.color], [0.55, -0.55, CREAM], [-0.55, 0.55, CREAM], [0.55, 0.55, st.color]]) D(x + 1.25 + ox, 3.0, z + 0.85 + oz, 1.1, 0.1, 1.1, c);
      D(x + 1.25, 3.1, z + 0.85, 0.5, 0.12, 0.5, st.color);
      D(x + 1.25, 2.5, z + 0.6, 0.26, 0.32, 0.26, 0xffc56a, 1.2);
      solid(x, z - 0.2, 1.5, 1.05);
    }
    const T = 1.11, G = 0.3;     // 台の 上・しきものの 上の 高さ
    if (st.id === 'fruit') {
      ['apple', 'banana', 'watermelon', 'cookie', 'donut'].forEach((id, i) => put(() => realFood(id), id === 'watermelon' ? 0.62 : 0.42, x - 1.1 + i * 0.56, T, z + (i % 2 ? 0.2 : -0.18), i * 0.9));
      D(x - 1.9, 0.5, z + 0.3, 0.7, 0.6, 0.7, 0xb08655); for (const [ox, oz] of [[-0.14, -0.12], [0.14, 0.1], [-0.1, 0.16]]) D(x - 1.9 + ox, 0.88, z + 0.3 + oz, 0.22, 0.2, 0.22, 0xd9483b);
    } else if (st.id === 'hats') {
      [['cowboy', 0xa9744a], ['tophat', 0x2a2a33], ['cap', 0x3f6fd0], ['wreath', 0x5fc04a], ['party', 0xe86fa0]].forEach(([k, c], i) => {
        D(x - 1.16 + i * 0.58, T + 0.14, z + 0.12, 0.2, 0.28, 0.2, 0xe6d9bd);
        put(() => realModel(k, c), 0.5, x - 1.16 + i * 0.58, T + 0.26, z + 0.12, 0);
      });
    } else if (st.id === 'toys') {
      [['brick', 0xb5603a, -0.9, 0], ['wood', 0xb08655, -0.42, 0], ['grass', 0x6fa84a, -0.66, 0.45], ['glass', 0x9fd8ee, 0.5, 0], ['stone', 0x9a9a96, 0.98, 0]].forEach(([id, c, ox, oy]) => put(() => blockModel(id, c), 0.44, x + ox, G + oy, z - 0.5, 0.2));
      for (const [ox, oz, c] of [[-0.9, 0.35, 0xe86f6f], [-0.3, 0.3, 0x6aa9d4], [0.3, 0.38, 0xf2c94c], [0.9, 0.3, 0x7ec98a]]) D(x + ox, G + 0.15, z - 0.2 + oz, 0.3, 0.3, 0.3, c);
    } else if (st.id === 'furniture') {
      [['chair', 0xc98a5e, -0.95, 0.9, 0.2], ['lamp', 0xf2c94c, -0.1, 1.2, 0], ['plant', 0x5d8b4f, 0.55, 0.9, 0], ['clock', 0x8a6a45, 1.1, 0.8, -0.3]].forEach(([shape, c, ox, size, ry]) => put(() => furnitureModel({ shape, color: c, w: 1, d: 1 }), size, x + ox, G, z - 0.35, ry));
    } else if (st.id === 'books') {
      for (let s = 0; s < 4; s += 1) for (let k = 0; k < 3 + (s % 2); k += 1) D(x - 1.05 + s * 0.7, T + 0.07 + k * 0.13, z + 0.05 + (k % 2) * 0.04, 0.5, 0.12, 0.68, BOOK[(s + k) % 4]);
      for (let i = 0; i < 6; i += 1) D(x - 1.2 + i * 0.16, T + 0.28, z - 0.42, 0.13, 0.5, 0.36, BOOK[(i * 3) % 4]);
      D(x + 1.9, 0.5, z + 0.3, 0.7, 0.6, 0.7, 0xb08655); for (let i = 0; i < 4; i += 1) D(x + 1.68 + i * 0.15, 0.95, z + 0.3, 0.12, 0.46, 0.5, BOOK[i]);
    } else if (st.id === 'music') {
      put(() => realModel('guitar', 0xc98a5e), 1.15, x - 0.85, G, z - 0.3, 0.3);
      put(() => realModel('camera', 0x2a2a33), 0.42, x - 0.05, G, z - 0.55, -0.3);
      put(() => realModel('bell', 0xe8b93c), 0.4, x + 0.5, G, z - 0.2, 0);
      put(() => realModel('crown', 0xe8b93c), 0.46, x + 1.05, G, z - 0.6, 0);
      put(() => realModel('binoculars', 0x39445e), 0.4, x + 0.1, G, z + 0.3, 0.5);
    }
    stalls.push({ id: st.id, x, z, type: st.type, keeper: { x, z: z + 1.25, face: Math.PI }, front: { x, z: 23.2 } });
  }
  sprite({ en: '🧺 Flea Market', ja: '🧺 フリーマーケット' }, cx, 4.5, STALL_Z + 2.2, { width: 7.4, size: 38 });

  let lastHour = -1;
  return {
    center: { x: cx, z: cz }, bounds: { x0, x1, z0, z1 },
    clock: CLOCK, stage: STAGE, stalls,
    // きせつの イベントを 置く 場所（ぶたいの 前の ひらけた 石だたみ）。ぶたいの 上は `stage`（x, z, w, d・上の 面の 高さ y）。
    eventSpot: { x: 76.6, z: 16, r: 2.6 },
    setNight(n) { tower?.userData.setNight(Math.max(0, Math.min(1, n || 0))); },
    update(t) {
      fount?.userData.update(t);
      if (!tower) return;
      const h = worldHour();
      if (Math.abs(h - lastHour) > 0.004) { lastHour = h; tower.userData.setHour(h); }
    },
  };
}

// 右上の 小さな 地図に ひろばを 描く（main-world.js の drawMap から。px・py は 島の 座標 → 絵の 座標）。
export function drawPlazaMap(ctx, px, py, k) {
  const { x0, x1, z0, z1, cx, cz } = PLAZA;
  ctx.fillStyle = '#d9cfb8'; ctx.beginPath(); ctx.roundRect(px(x0), py(z0), (x1 - x0) * k, (z1 - z0) * k, 4); ctx.fill();
  ctx.fillStyle = '#c98f66'; ctx.beginPath(); ctx.arc(px(cx), py(cz), 4.4 * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6fb7c9'; ctx.beginPath(); ctx.arc(px(cx), py(cz), 1.9 * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b88d5a'; ctx.fillRect(px(79.5), py(11.5), 5 * k, 9 * k);
  for (const s of STALLS) { ctx.fillStyle = `#${s.color.toString(16).padStart(6, '0')}`; ctx.fillRect(px(s.x - 1.5), py(STALL_Z - 0.8), 3 * k, 1.8 * k); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '8px sans-serif';
  ctx.fillText('🕰', px(cx), py(6.5)); ctx.fillText('🎪', px(82), py(16)); ctx.fillText('🧺', px(cx), py(STALL_Z + 0.4));
}
