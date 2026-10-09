// つり島 — Roblox の釣りワールドの島。**小屋はない。水辺そのものが釣り場。**
//
//   ★ いけ（5級）  島の西にある本物の池。すいれんと あしと カエル。東の岸に さお置き場。
//   ★★ かわ（4級） 北の泉から池へ流れこむ川。石の岸・小さな橋・白い流れ。東の岸の砂利に立つ。
//   ★★★ うみ（3級）東の岸から海へ突き出た さんばし。先に立つと、足もとは本物の海。
//
// U-Speak島の釣りと同じで、立っているところから さおを投げ、うきが沈んだら問題。釣れた魚は
// 水から跳ねて出る（写真つき）。地形・さんばし・当たり判定・看板・ミニマップは island-kit、
// ここは水と岸と、さお・うき・糸・しぶきの演出だけ。
import * as THREE from './three.module.js';
import { createIsland, NEAR_DISTANCE } from './island-kit.js';
import { isJa, onLangChange } from './i18n.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadFishworldData() {
  if (!promise) {
    promise = fetch('fishworld.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`fishworld.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[fishworld] fishworld.json failed to load', err); return { island: null, zones: {}, fish: [] }; });
  }
  return promise;
}

// 水面。頂点を 時間で揺らす（fishing.js の池と同じ仕掛け）。
const waterTime = { value: 0 };
function waterMaterial(color, opacity = 0.93) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.32, roughness: 0.22, transparent: true, opacity, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = waterTime;
    s.vertexShader = `uniform float uTime;\n${s.vertexShader}`.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y += sin(position.x * 1.7 + uTime * 1.5) * 0.03 + cos(position.z * 2.1 + uTime * 1.1) * 0.025;');
  };
  return m;
}

// 川のような帯：中心線の点の列から、幅のある面を作る。
function ribbon(points, width, y) {
  const pos = []; const idx = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, z] = points[i];
    const [px, pz] = points[Math.max(0, i - 1)];
    const [nx, nz] = points[Math.min(points.length - 1, i + 1)];
    const dx = nx - px; const dz = nz - pz; const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * width / 2; const oz = (dx / len) * width / 2;
    pos.push(x - ox, y, z - oz, x + ox, y, z + oz);
    if (i < points.length - 1) { const n = i * 2; idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const distToPolyline = (pts, x, z) => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1];
    const vx = bx - ax; const vz = bz - az; const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
};

// 文字を焼いた小さな札（！ や 看板）。
function textSprite(text, { size = 64, color = '#fffbf5', background = '', width = 1.2 } = {}) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(8, 8, 240, 240, 60); ctx.fill(); }
  ctx.fillStyle = color; ctx.font = `900 ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 136);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(width, width, 1); s.renderOrder = 4;
  return s;
}

export function createFishworldIsland({ scene }) {
  // 演出の状態（さお・うき・糸・波紋・しぶき）。島が建ったあと `fx.root` に入る。
  const fx = { root: null, rod: null, line: null, bobber: null, bang: null, ripples: [], splashes: [], cast: null, player: null, t: 0, lastRings: 0 };
  const loader = new THREE.TextureLoader();
  const photoCache = new Map();

  const island = createIsland({
    scene,
    seed: 70707,
    build({ island: data, B, D, sprite, path, tree, bush, rock, flowers, bench, lamp, barrel, crate, bunting, resident, obstacles, rand, root, shade }) {
      fx.root = root;
      const yard = data.courtyard;
      const water = data.water;
      const SAND = 0xdcc9a0; const STONE = 0x9ba7a3; const DARK = 0x7f8a86; const WOOD = 0xb8946a; const WOOD2 = 0x9c7a52; const POST = 0x7a5f44;

      // ---- 広場：木のデッキと島の名前、さおの台 ----
      B(yard.x, 0.12, yard.z, 13, 0.15, 9, 0xd6b98a);
      B(yard.x, 0.2, yard.z, 8, 0.14, 5, 0xe3c89c);
      sprite({ en: `${data.en} · pond · river · sea`, ja: `${data.name} · いけ · かわ · うみ` }, yard.x, 4.8, yard.z, { width: 11, size: 30 });
      bunting(yard.x - 6.5, yard.z + 4, yard.x + 6.5, yard.z + 4, 3.4);
      // 大きな魚の看板（島の目印）
      const sx = yard.x + 5.5; const sz = yard.z - 1.5;
      for (const dx of [-1.3, 1.3]) D(sx + dx, 1.6, sz, 0.16, 3.2, 0.16, POST);
      D(sx, 2.8, sz, 3.4, 1.4, 0.12, 0xf7f1e1);
      D(sx - 0.5, 2.8, sz + 0.08, 1.5, 0.55, 0.06, 0x58a0dc);
      D(sx + 0.65, 2.8, sz + 0.08, 0.5, 0.55, 0.06, 0x58a0dc);
      D(sx + 1.0, 2.9, sz + 0.1, 0.12, 0.12, 0.04, 0x1b3a2f);
      obstacles.push({ x: sx, z: sz, w: 1.9, d: 0.5 });
      // さおの台（3本のさお）とバケツ
      for (let i = 0; i < 3; i += 1) { const rx = yard.x - 5 + i * 0.7; D(rx, 1.5, yard.z - 2.2, 0.08, 3, 0.08, 0x8a6a45); D(rx, 2.95, yard.z - 2.2, 0.05, 0.35, 0.05, 0xe27a2d); }
      D(yard.x - 4.3, 0.5, yard.z - 2.2, 2.4, 0.12, 0.3, POST);
      D(yard.x + 4.5, 0.55, yard.z + 2.6, 0.8, 0.8, 0.8, 0x9fb8c8);
      bench(yard.x - 4.5, yard.z + 3, 0);
      lamp(yard.x + 6.6, yard.z + 3);
      barrel(yard.x - 7, yard.z - 1);
      crate(yard.x + 7.2, yard.z - 2.5);

      // ---- ★ いけ ----
      const P = water.pond;
      const sandDisc = new THREE.Mesh(new THREE.CylinderGeometry(P.rx + 0.9, P.rx + 0.9, 0.1, 48), new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.95 }));
      sandDisc.position.set(P.x, 0.25, P.z); sandDisc.scale.z = (P.rz + 0.9) / (P.rx + 0.9); sandDisc.receiveShadow = true; root.add(sandDisc);
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(P.rx, P.rx, 0.1, 56), waterMaterial(0x4fa39b));
      pond.position.set(P.x, 0.31, P.z); pond.scale.z = P.rz / P.rx; pond.receiveShadow = true; root.add(pond);
      // 岸の石と あし
      for (let a = 0; a < Math.PI * 2; a += 0.21) {
        const cx = P.x + Math.cos(a) * (P.rx + 0.9 + rand() * 0.5); const cz = P.z + Math.sin(a) * (P.rz + 0.9 + rand() * 0.5);
        if (Math.hypot(cx - (-8), cz - 3) < 2.4) continue;            // さお置き場の前は空ける
        const s = 0.35 + rand() * 0.45;
        D(cx, 0.32, cz, s * 1.4, s * 0.7, s * 1.2, rand() > 0.5 ? STONE : DARK);
        if (rand() > 0.6) for (let i = 0; i < 3; i += 1) { D(cx + (rand() - 0.5) * 0.8, 0.9, cz + (rand() - 0.5) * 0.8, 0.07, 1.4, 0.07, 0x6d9a4e); D(cx + (rand() - 0.5) * 0.8, 1.55, cz + (rand() - 0.5) * 0.8, 0.14, 0.4, 0.14, 0x8a6a45); }
      }
      // すいれんの葉と花、カエル、小さな島
      for (const [dx, dz, s] of [[-2.2, 1.4, 1], [1.6, -2.1, 0.8], [0.4, 2.6, 0.9], [-3.6, -1.8, 0.7], [2.9, 1.2, 0.7], [-0.8, -0.4, 0.6]]) {
        D(P.x + dx, 0.39, P.z + dz, 0.95 * s, 0.05, 0.95 * s, 0x5e9a3f);
        D(P.x + dx + 0.3 * s, 0.39, P.z + dz + 0.2, 0.3 * s, 0.06, 0.3 * s, 0x4fa39b);
        if (s >= 0.9) { D(P.x + dx - 0.15, 0.52, P.z + dz - 0.1, 0.3, 0.22, 0.3, 0xf2a4c2); D(P.x + dx - 0.15, 0.66, P.z + dz - 0.1, 0.16, 0.12, 0.16, 0xffe08a); }
      }
      D(P.x - 2.2, 0.56, P.z + 1.4, 0.42, 0.3, 0.4, 0x78c882); D(P.x - 2.05, 0.74, P.z + 1.25, 0.1, 0.1, 0.1, 0x1b3a2f); D(P.x - 2.35, 0.74, P.z + 1.25, 0.1, 0.1, 0.1, 0x1b3a2f);
      D(P.x - 3.8, 0.55, P.z + 3.1, 1.2, 0.6, 1.0, STONE); D(P.x - 3.8, 1.1, P.z + 3.1, 0.3, 0.6, 0.3, 0x8a6a45); D(P.x - 3.8, 1.55, P.z + 3.1, 1.0, 0.5, 1.0, 0x6d9d5e);

      // ---- ★★ かわ ----
      const R = water.river;
      const riverSand = new THREE.Mesh(ribbon(R, 5.2, 0.25), new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.95, side: THREE.DoubleSide }));
      riverSand.receiveShadow = true; root.add(riverSand);
      const river = new THREE.Mesh(ribbon(R, 3.4, 0.31), waterMaterial(0x4f97d8, 0.9));
      river.receiveShadow = true; root.add(river);
      for (let i = 0; i < R.length - 1; i += 1) {
        const [ax, az] = R[i]; const [bx, bz] = R[i + 1];
        const dx = bx - ax; const dz = bz - az; const len = Math.hypot(dx, dz);
        const nx = -dz / len; const nz = dx / len;
        for (let k = 0; k < 4; k += 1) {
          const t = k / 4; const x = ax + dx * t; const z = az + dz * t;
          for (const side of [-1, 1]) { const s = 0.3 + rand() * 0.4; D(x + nx * side * (2.4 + rand() * 0.4), 0.33, z + nz * side * (2.4 + rand() * 0.4), s * 1.3, s * 0.7, s * 1.2, rand() > 0.5 ? STONE : DARK); }
          if (k % 2 === 0) D(x + nx * (rand() - 0.5) * 1.6, 0.37, z + nz * (rand() - 0.5) * 1.6, 0.5, 0.04, 0.26, 0xeef6f8);  // 白い流れ
        }
      }
      // 泉（川のはじまり）：岩の山と こぼれる水
      const [qx, qz] = R[0];
      D(qx, 0.7, qz - 1.4, 2.4, 1.2, 1.6, DARK); D(qx + 0.6, 1.3, qz - 1.6, 1.3, 0.9, 1.1, STONE); D(qx - 0.7, 1.2, qz - 1.2, 1.0, 0.8, 0.9, STONE);
      D(qx, 1.0, qz - 0.7, 0.9, 0.7, 0.25, 0x8fd0f0); D(qx, 0.5, qz - 0.3, 1.4, 0.2, 0.5, 0xeef6f8);
      obstacles.push({ x: qx, z: qz - 1.4, w: 1.4, d: 1.0 });
      // 小さな橋（かざり）
      { const [bx, bz] = R[4]; const [cx, cz] = R[5]; const dx = cx - bx; const dz = cz - bz; const len = Math.hypot(dx, dz); const nx = -dz / len; const nz = dx / len;
        for (let i = -3; i <= 3; i += 1) D(bx + nx * i * 0.95, 0.72 + (3 - Math.abs(i)) * 0.07, bz + nz * i * 0.95, 0.9, 0.14, 1.8, i % 2 ? WOOD : WOOD2);
        for (const side of [-0.95, 0.95]) for (const e of [-3, 3]) { D(bx + nx * e * 0.95 + (dx / len) * side, 1.1, bz + nz * e * 0.95 + (dz / len) * side, 0.14, 0.9, 0.14, POST); }
        for (const side of [-0.95, 0.95]) D(bx + (dx / len) * side, 1.45, bz + (dz / len) * side, Math.abs(nx) * 5.9 + 0.12, 0.1, Math.abs(nz) * 5.9 + 0.12, POST); }
      // 川岸の砂利の釣り場（立つところ）
      const rs = data.spots.find((s) => s.id === 'river');
      D(rs.x, 0.22, rs.z, 3.4, 0.1, 3.0, 0xcdbf9a);
      for (let i = 0; i < 9; i += 1) D(rs.x + (rand() - 0.5) * 3, 0.3, rs.z + (rand() - 0.5) * 2.6, 0.3, 0.12, 0.3, i % 2 ? STONE : 0xb9ad8c);
      D(rs.x + 1.6, 0.45, rs.z + 1.3, 0.7, 0.7, 0.7, 0x9fb8c8);                       // バケツ
      D(rs.x - 1.5, 1.4, rs.z + 1.2, 0.08, 2.6, 0.08, 0x8a6a45);                       // 立てかけた さお

      // ---- ★ いけ の さお置き場（木のデッキ） ----
      const ps = data.spots.find((s) => s.id === 'pond');
      for (let i = 0; i < 5; i += 1) D(ps.x - 2.6 + i * 0.5, 0.2, ps.z, 0.48, 0.22, 3.0, i % 2 ? WOOD : WOOD2);
      D(ps.x - 3.8, 0.2, ps.z, 1.8, 0.22, 3.0, WOOD2);                                 // 池の上に出た先
      for (const [dx, dz] of [[-4.6, -1.4], [-4.6, 1.4], [-0.6, -1.4], [-0.6, 1.4]]) D(ps.x + dx, 0.0, ps.z + dz, 0.3, 1.2, 0.3, POST);
      D(ps.x + 1.5, 0.45, ps.z - 1.2, 0.7, 0.7, 0.7, 0x9fb8c8);
      D(ps.x + 1.6, 1.4, ps.z + 1.2, 0.08, 2.6, 0.08, 0x8a6a45);

      // ---- ★★★ うみ の さんばし ----
      const pier = water.pier;
      for (let x = pier.x0; x <= pier.x1; x += 1.05) D(x, 0.2, pier.z, 1.0, 0.22, 3.4, Math.round(x) % 2 ? WOOD : WOOD2);
      for (let x = pier.x0 + 1; x <= pier.x1; x += 3) for (const side of [-1.5, 1.5]) { D(x, -0.8, pier.z + side, 0.34, 2.6, 0.34, POST); D(x, 0.95, pier.z + side, 0.3, 1.3, 0.3, POST); }
      for (const side of [-1.55, 1.55]) D((pier.x0 + pier.x1) / 2, 1.5, pier.z + side, pier.x1 - pier.x0, 0.1, 0.1, 0xb9a075);
      D(pier.x1 + 0.6, 0.6, pier.z + 1.1, 0.7, 0.7, 0.7, 0x9fb8c8);                   // バケツ
      D(pier.x1 - 1.5, 1.3, pier.z - 1.3, 0.08, 2.6, 0.08, 0x8a6a45);                  // さお
      lamp(pier.x0 + 0.5, pier.z + 2.4);
      // ブイと、灯台（島の東の目印）
      D(pier.x1 + 3.5, -0.9, pier.z - 5, 0.9, 1.1, 0.9, 0xe0566a); D(pier.x1 + 3.5, -0.1, pier.z - 5, 0.12, 0.6, 0.12, 0xf7f1e1); D(pier.x1 + 3.5, 0.25, pier.z - 5, 0.3, 0.3, 0.3, 0xffd246);
      const L = { x: 20, z: 16.5 };
      for (let i = 0; i < 6; i += 1) D(L.x, 0.5 + i * 1.0, L.z, 2.4 - i * 0.18, 1.0, 2.4 - i * 0.18, i % 2 ? 0xf5efe2 : 0xe0566a);
      D(L.x, 6.9, L.z, 1.6, 0.8, 1.6, 0x1b3a2f); D(L.x, 6.9, L.z, 1.2, 0.6, 1.2, 0xffe6ad, 2.2); D(L.x, 7.6, L.z, 2.0, 0.3, 2.0, 0x8c3a3a); D(L.x, 8.0, L.z, 0.5, 0.5, 0.5, 0x8c3a3a);
      obstacles.push({ x: L.x, z: L.z, w: 1.3, d: 1.3 });
      rock(23.5, 13, 0.8); rock(29, 13.5, 0.6);

      // ---- 道と、釣り場ごとの看板と案内の人 ----
      for (const def of data.spots) {
        path(def.path.x, def.path.z, def.x, def.z);
        const stars = '★'.repeat(def.zone);
        sprite({ en: `${stars} ${def.en}`, ja: `${stars} ${def.name}` }, def.x, 5.6, def.z - 1.2, { width: 7, size: 34, background: ['#2f7d4e', '#2e6ea8', '#1f4d7a'][def.zone - 1] });
        // 案内の人（Pip / Rin / Captain Mo）は釣り場のとなりに立つ。釣り場そのものには立たない：
        // そこは子どもが立つところ。resident() が置く人と札を、作られたあとで横へずらす。
        const before = root.children.length;
        resident(def);
        const aside = def.kind === 'sea' ? { x: -3.2, z: -2.6 } : def.kind === 'river' ? { x: 2.6, z: 2.4 } : { x: 2.6, z: -2.6 };
        for (const o of root.children.slice(before)) o.position.set(def.x + aside.x, o.position.y, def.z + aside.z);
      }

      // ---- 木と草花：水と道と釣り場をよけて ----
      const nearPath = (x, z) => data.spots.some((sp) => distToPolyline([[sp.path.x, sp.path.z], [sp.x, sp.z]], x, z) < 2.4);
      const inWater = (x, z) => ((x - P.x) / (P.rx + 1.6)) ** 2 + ((z - P.z) / (P.rz + 1.6)) ** 2 < 1 || distToPolyline(R, x, z) < 3.6 || (x > 22 && Math.abs(z - pier.z) < 3.5);
      const clear = (x, z, r = 6) => !inWater(x, z) && !nearPath(x, z) && !data.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < r)
        && !(Math.abs(x - yard.x) < 8 && Math.abs(z - yard.z) < 6) && !(Math.abs(x) < 5 && z > 8) && Math.hypot(x - L.x, z - L.z) > 3;
      for (const [gx, gz, k] of [[-22, -16, 1], [20, -12, 0], [-24, 12, 2], [14, 18, 0], [-6, -22, 1]]) {
        for (let i = 0; i < 6; i += 1) { const x = gx + (rand() - 0.5) * 9; const z = gz + (rand() - 0.5) * 8; if ((x / 28) ** 2 + (z / 23) ** 2 > 1 || !clear(x, z)) continue; tree(x, z, 0.75 + rand() * 0.55, k); }
      }
      for (let i = 0; i < 90; i += 1) {
        const x = (rand() - 0.5) * 54; const z = (rand() - 0.5) * 44;
        if ((x / 27) ** 2 + (z / 22) ** 2 > 1 || !clear(x, z)) continue;
        const roll = rand();
        if (roll > 0.9) tree(x, z, 0.7 + rand() * 0.5);
        else if (roll > 0.72) bush(x, z, 0.7 + rand() * 0.6);
        else if (roll > 0.64) rock(x, z, 0.5 + rand() * 0.5);
        else flowers(x, z, [0xf0d98a, 0xe89bb0, 0xdfe4ef, 0xe7b06a][Math.floor(rand() * 4)]);
      }

      // ---- 演出の道具：さお・糸・うき・！ ----
      const rod = new THREE.Group();
      const tilt = new THREE.Group(); tilt.rotation.x = 0.95; rod.add(tilt);
      B(0, 0.8, 0, 0.05, 1.75, 0.05, 0x857455, tilt); B(0, -0.12, 0, 0.1, 0.3, 0.1, 0x484e46, tilt); B(0, 0.3, 0.05, 0.14, 0.14, 0.08, 0x6b7c86, tilt);
      rod.visible = false; root.add(rod); fx.rod = rod; fx.rodTip = new THREE.Object3D(); fx.rodTip.position.set(0, 1.68, 0); tilt.add(fx.rodTip);
      const bobber = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe0566a })); top.position.y = 0.08; bobber.add(top);
      const bot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf7f1e1 })); bot.position.y = -0.06; bobber.add(bot);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xffd246 })); stem.position.y = 0.3; bobber.add(stem);
      bobber.visible = false; root.add(bobber); fx.bobber = bobber;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf7f1e1, transparent: true, opacity: 0.75 }));
      line.visible = false; root.add(line); fx.line = line;
      const bang = textSprite('！', { size: 150, color: '#fff', background: '#e0566a', width: 1.5 }); bang.visible = false; root.add(bang); fx.bang = bang;
      fx.ringGeo = new THREE.TorusGeometry(0.5, 0.05, 6, 32);
    },
  });

  // ---- 演出 ----
  const spotOf = (id) => island.data?.spots.find((s) => s.id === id);
  const local = (v) => ({ x: v.x - fx.root.position.x, z: v.z - fx.root.position.z });
  function startCast(spotId) {
    const sp = spotOf(spotId); if (!sp || !fx.root) return false;
    fx.cast = { spot: sp, since: fx.t, bite: false };
    fx.waterY = sp.kind === 'sea' ? -1.35 : 0.4;
    fx.bobber.position.set(sp.cast.x, fx.waterY, sp.cast.z); fx.bobber.visible = true; fx.rod.visible = true; fx.line.visible = true; fx.bang.visible = false;
    if (fx.player) fx.player.rotation.y = Math.atan2(sp.cast.x - sp.x, sp.cast.z - sp.z);
    ring(sp.cast.x, sp.cast.z, 0x9fe0ff);
    return true;
  }
  function bite() {
    if (!fx.cast) return;
    fx.cast.bite = true; fx.cast.biteAt = fx.t;
    fx.bang.position.set(fx.bobber.position.x, 1.6, fx.bobber.position.z); fx.bang.visible = true;
    ring(fx.bobber.position.x, fx.bobber.position.z, 0xffffff); setTimeout(() => ring(fx.bobber.position.x, fx.bobber.position.z, 0xffffff), 180);
  }
  function endCast() {
    fx.cast = null;
    if (fx.rod) { fx.rod.visible = false; fx.bobber.visible = false; fx.line.visible = false; fx.bang.visible = false; }
  }
  function ring(x, z, color) {
    if (!fx.root) return;
    const m = new THREE.Mesh(fx.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, (fx.waterY ?? 0.4) - 0.02, z); fx.root.add(m);
    fx.ripples.push({ m, born: fx.t });
  }
  // 釣れた魚が水から跳ねる：写真を板に貼って、弧を描いて飛び、しぶきが散る。
  function splash(fish) {
    if (!fx.root) return;
    const at = fx.cast ? { x: fx.bobber.position.x, z: fx.bobber.position.z } : null;
    if (!at) return;
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, color: 0xffffff });
    const s = new THREE.Sprite(mat); s.scale.set(1.9, 1.9, 1); s.renderOrder = 5; s.position.set(at.x, fx.waterY, at.z); fx.root.add(s);
    const key = fish?.photo ? `assets/fish/${fish.photo}.jpg` : '';
    if (key) {
      if (!photoCache.has(key)) photoCache.set(key, loader.load(key, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; }));
      mat.map = photoCache.get(key); mat.needsUpdate = true;
    } else { const t = textSprite(fish?.emoji || '🐟', { size: 160, width: 1.9 }); mat.map = t.material.map; mat.needsUpdate = true; }
    fx.splashes.push({ s, born: fx.t, x: at.x, z: at.z, y: fx.waterY });
    for (let i = 0; i < 14; i += 1) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x9fe0ff : 0xffffff, transparent: true }));
      d.position.set(at.x, fx.waterY, at.z); fx.root.add(d);
      fx.splashes.push({ s: d, born: fx.t, x: at.x, z: at.z, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, y: fx.waterY, drop: true });
    }
    ring(at.x, at.z, 0xffffff); setTimeout(() => ring(at.x, at.z, 0x9fe0ff), 220);
    for (let i = 0; i < 3; i += 1) setTimeout(() => ring(at.x, at.z, 0xffffff), 120 * i);
  }

  // 水と さんばしの当たり判定。川は斜めに流れるので箱では囲めない：中心線からの距離で見る。
  // 池の上の さお置き場と、川の橋の上だけは歩ける。
  const baseBlocked = island.blocked;
  function blocked(x, z) {
    if (baseBlocked(x, z)) return true;
    const d = island.data; if (!d?.water || !fx.root) return false;
    const lx = x - fx.root.position.x; const lz = z - fx.root.position.z;
    const P = d.water.pond; const ps = d.spots.find((s) => s.id === 'pond');
    const onDeck = ps && lx <= ps.x + 0.2 && lx >= ps.x - 4.6 && Math.abs(lz - ps.z) < 1.4;
    if (!onDeck && ((lx - P.x) / (P.rx + 0.3)) ** 2 + ((lz - P.z) / (P.rz + 0.3)) ** 2 < 1) return true;
    const R = d.water.river;
    if (distToPolyline(R, lx, lz) < 2.0) {
      const [bx, bz] = R[4]; const [cx, cz] = R[5]; const tx = cx - bx; const tz = cz - bz; const len = Math.hypot(tx, tz);
      const along = ((lx - bx) * tx + (lz - bz) * tz) / len; const across = ((lx - bx) * -tz + (lz - bz) * tx) / len;
      if (!(Math.abs(along) < 0.85 && Math.abs(across) < 3.3)) return true;
    }
    return false;
  }
  const camAt = new THREE.Vector3(); const camLook = new THREE.Vector3();
  function chase(camera, player, dt) {
    if (!fx.cast || !fx.root) return false;
    const r = fx.root.position; const b = fx.bobber.position;
    const bx = b.x + r.x; const bz = b.z + r.z;
    const dx = bx - player.position.x; const dz = bz - player.position.z; const len = Math.hypot(dx, dz) || 1;
    camAt.set(player.position.x - (dx / len) * 6.5 + (dz / len) * 3, 5.2, player.position.z - (dz / len) * 6.5 - (dx / len) * 3);
    camera.position.lerp(camAt, 1 - Math.exp(-dt * 2.5));
    camLook.set((player.position.x + bx) / 2, 0.6, (player.position.z + bz) / 2);
    camera.lookAt(camLook);
    return true;
  }

  const baseUpdate = island.update;
  const tipWorld = new THREE.Vector3();
  function update(t, player) {
    baseUpdate(t, player);
    fx.t = t; fx.player = player; waterTime.value = t;
    if (!fx.root || !island.visible) return;
    const r = fx.root;
    if (fx.cast) {
      // さおは右手に。子どもの向きについてくる。
      const yaw = player.rotation.y;
      fx.rod.position.set(player.position.x - r.position.x + Math.cos(yaw) * 0.42 + Math.sin(yaw) * 0.25, player.position.y + 1.05, player.position.z - r.position.z - Math.sin(yaw) * 0.42 + Math.cos(yaw) * 0.25);
      fx.rod.rotation.y = yaw;
      const age = t - fx.cast.since;
      const bob = fx.cast.bite ? Math.sin((t - fx.cast.biteAt) * 22) * 0.12 - 0.18 : Math.sin(t * 5) * 0.05;
      fx.bobber.position.y = fx.waterY + bob;
      // 糸：さおの先から、少し たるんで うきへ。
      fx.rodTip.getWorldPosition(tipWorld); r.worldToLocal(tipWorld);
      const a = fx.line.geometry.attributes.position; const bx = fx.bobber.position.x; const bz = fx.bobber.position.z; const by = fx.bobber.position.y + 0.3;
      a.setXYZ(0, tipWorld.x, tipWorld.y, tipWorld.z); a.setXYZ(1, (tipWorld.x + bx) / 2, Math.min(tipWorld.y, by) + 0.25, (tipWorld.z + bz) / 2); a.setXYZ(2, bx, by, bz); a.needsUpdate = true; fx.line.geometry.computeBoundingSphere();
      if (fx.cast.bite) { fx.bang.position.y = 1.5 + Math.abs(Math.sin((t - fx.cast.biteAt) * 9)) * 0.3; if (t - fx.lastRings > 0.5) { fx.lastRings = t; ring(bx, bz, 0xffffff); } }
      else if (age > 0.4 && t - fx.lastRings > 1.6) { fx.lastRings = t; ring(bx, bz, 0x9fe0ff); }
    }
    for (let i = fx.ripples.length - 1; i >= 0; i -= 1) {
      const rp = fx.ripples[i]; const age = t - rp.born; const k = 1 + age * 2.4;
      rp.m.scale.set(k, k, 1); rp.m.material.opacity = Math.max(0, 0.8 - age * 0.7);
      if (age > 1.2) { r.remove(rp.m); rp.m.material.dispose(); fx.ripples.splice(i, 1); }
    }
    for (let i = fx.splashes.length - 1; i >= 0; i -= 1) {
      const sp = fx.splashes[i]; const age = t - sp.born;
      if (sp.drop) { sp.s.position.set(sp.x + sp.vx * age, sp.y + sp.vy * age - 6 * age * age, sp.z + sp.vz * age); sp.s.material.opacity = Math.max(0, 1 - age); if (age > 1) { r.remove(sp.s); sp.s.geometry.dispose(); sp.s.material.dispose(); fx.splashes.splice(i, 1); } }
      else { sp.s.position.set(sp.x, sp.y + Math.sin(Math.min(1, age / 1.3) * Math.PI) * 2.6, sp.z); sp.s.material.rotation = Math.sin(age * 3) * 0.3; sp.s.material.opacity = age < 1.3 ? 1 : Math.max(0, 1 - (age - 1.3) * 3); if (age > 1.7) { r.remove(sp.s); sp.s.material.dispose(); fx.splashes.splice(i, 1); } }
    }
  }

  Object.assign(island, {
    update, blocked, chase,
    ready: loadFishworldData().then((d) => { island.receive(d.island); return d; }),
    startCast, bite, endCast, splash,
  });
  // Object.assign は getter を値にして写してしまう（いつも false になる）。だから defineProperty で。
  Object.defineProperty(island, 'casting', { get: () => !!fx.cast, enumerable: true });
  return island;
}
