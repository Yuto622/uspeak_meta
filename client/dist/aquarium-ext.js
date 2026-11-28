// すいぞくかんの 外がわ（2026-11：「水族館、モールを ビル群の 左側の 土地に 横並びで」）。中は aquarium-real.js の buildAquarium()。
//
// オリジナルの「U-SPEAK AQUARIUM／ユースピーク すいぞくかん」（本物の 館の 名前・ロゴは 使わない）。
// 形：まえに ふくらむ 大きな まるい ガラスの かべ（中に 水そうの 絵＝青い 水・光の すじ・魚の かげ）、
//     その 上に 波の 形の 白い 屋根、うしろは 青緑の パネルの 箱、屋根の 上に 大きな クジラの かげ絵の かんばん（夜は 光る）、
//     入口の ひさしと ガラスの とびら、前の ひろばに あさい 水の 池と うえこみ。
// 作り：材質ごとに 1 メッシュ（ガラス・白い かべと 屋根・かんばん・クジラ・池・光の 線＝描画 6 回）。光は 足さない（emissive だけ）。
//       もようは canvas（try/catch＝Node の 検査では 色だけ）。1 回だけ 作る。
// 原点は 正面の 地面の まんなか（ガラスの いちばん 前が z 0）、+z が 正面（道）。obstacles は island-kit と 同じ { x, z, w, d }（半分）。
import * as THREE from './three.module.js';
import { tex, createBatch, box, cyl } from './library-real.js';

const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif';
const R = 14, CZ = -14, HALF = 12.6;           // ガラスの 円（半径・中心の z・はしの x）
const arcZ = (x) => CZ + Math.sqrt(Math.max(0, R * R - x * x));
const ROOF_Y = 9.2;
const roofY = (x, z) => ROOF_Y + 0.55 * Math.sin(x * 0.42 + 0.4) + 0.18 * Math.sin(z * 0.55 + x * 0.15);
export const AQUARIUM_EXT = { w: 26, d: 18, door: { x: 0, z: 1.8 } };

let glassTex, signTex;
function textures() {
  if (glassTex !== undefined) return;
  glassTex = tex(1024, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#5fd2e6'); gr.addColorStop(0.45, '#1f86b4'); gr.addColorStop(1, '#0a3a66');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 光の すじ（上から）
    for (let i = 0; i < 14; i += 1) { const x = (i * 97) % W; const l = g.createLinearGradient(0, 0, 0, H * 0.8); l.addColorStop(0, 'rgba(220,250,255,0.28)'); l.addColorStop(1, 'rgba(220,250,255,0)'); g.fillStyle = l; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 26, 0); g.lineTo(x + 60, H * 0.8); g.lineTo(x + 18, H * 0.8); g.fill(); }
    // 魚の かげ（大小）と エイ
    const fish = (x, y, s, dir) => { g.save(); g.translate(x, y); g.scale(dir * s, s); g.beginPath(); g.ellipse(0, 0, 10, 4, 0, 0, 7); g.moveTo(8, 0); g.lineTo(15, -5); g.lineTo(15, 5); g.closePath(); g.fill(); g.restore(); };
    g.fillStyle = 'rgba(6,30,52,0.55)';
    for (let i = 0; i < 46; i += 1) fish((i * 211) % W, 40 + ((i * 53) % 170), 0.6 + ((i * 7) % 5) * 0.25, i % 3 ? 1 : -1);
    g.save(); g.translate(640, 150); g.fillStyle = 'rgba(6,26,46,0.6)'; g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(0, -36, 60, 0); g.quadraticCurveTo(0, 22, -60, 0); g.fill(); g.fillRect(50, -2, 60, 3); g.restore();
    // 底の 岩と サンゴ
    g.fillStyle = '#0b2a44'; for (let x = 0; x < W; x += 34) { g.beginPath(); g.ellipse(x + 10, H, 26, 18 + ((x * 13) % 16), 0, 0, 7); g.fill(); }
    for (let x = 20; x < W; x += 90) for (let i = 0; i < 6; i += 1) { g.fillStyle = i % 2 ? '#e06a5a' : '#f29a6a'; g.beginPath(); g.arc(x + (i - 2.5) * 5, H - 18 - (i % 3) * 7, 5 - (i % 3), 0, 7); g.fill(); }
    // あわ
    g.fillStyle = 'rgba(230,252,255,0.5)'; for (let i = 0; i < 70; i += 1) { g.beginPath(); g.arc((i * 149) % W, (i * 37) % H, 1.5 + (i % 3), 0, 7); g.fill(); }
  }, { repeat: false });
  signTex = tex(1024, 256, (g, W, H) => {
    g.fillStyle = '#0d2f4a'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 46); g.fill();
    g.strokeStyle = '#8ff0e8'; g.lineWidth = 6; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 38); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = `900 104px ${FONT}`; g.fillText('U-SPEAK AQUARIUM', W / 2, 102, W - 80);
    g.fillStyle = '#8ff0e8'; g.font = `800 58px ${FONT}`; g.fillText('ユースピーク すいぞくかん', W / 2, 190, W - 120);
  }, { repeat: false });
}

// まるい ガラスの かべ（円の 弧・外むき）。uv は よこ 0→1・たて 0→1。
function arcWall(y0, y1, seg = 40, inset = 0) {
  const a0 = Math.asin(HALF / R), pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = -a0 + (2 * a0 * i) / seg, s = Math.sin(a), c = Math.cos(a), r = R - inset;
    for (const [y, v] of [[y0, 0], [y1, 1]]) { pos.push(r * s, y, CZ + r * c); nor.push(s, 0, c); uv.push(i / seg, v); }
  }
  for (let i = 0; i < seg; i += 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
// 波の 屋根：x の 列ごとに、うしろ（z -18.8）から ガラスの 前＋1.4 まで。上の 面と 前の ふち。
function roofGeometry() {
  const NX = 44, NZ = 10, X0 = -14.6, X1 = 14.6, pos = [], idx = [];
  const front = (x) => (Math.abs(x) <= HALF ? arcZ(x) : arcZ(HALF) - (Math.abs(x) - HALF) * 0.8) + 1.4;
  for (let i = 0; i <= NX; i += 1) { const x = X0 + ((X1 - X0) * i) / NX; for (let j = 0; j <= NZ; j += 1) { const z = -18.8 + ((front(x) + 18.8) * j) / NZ; pos.push(x, roofY(x, z), z); } }
  for (let i = 0; i < NX; i += 1) for (let j = 0; j < NZ; j += 1) { const a = i * (NZ + 1) + j, b = a + NZ + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  // 前の ふち（たての 帯）
  const base = pos.length / 3;
  for (let i = 0; i <= NX; i += 1) { const x = X0 + ((X1 - X0) * i) / NX, z = front(x), y = roofY(x, z); pos.push(x, y, z, x, y - 0.7, z); }
  for (let i = 0; i < NX; i += 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return { geometry: g, front };
}
// クジラの かげ絵（横から・はば 約 10）。
function whaleGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.2); s.bezierCurveTo(0, 2.6, 2.5, 3.2, 5, 2.6); s.quadraticCurveTo(6.8, 2.1, 7.8, 1.5);
  s.lineTo(8.6, 2.6); s.quadraticCurveTo(9.4, 2.95, 9.9, 2.5); s.lineTo(8.9, 1.25); s.lineTo(9.9, 0.15); s.quadraticCurveTo(9.3, -0.15, 8.5, 0.5);
  s.lineTo(7.6, 1.0); s.quadraticCurveTo(5.5, -0.05, 3, 0.1); s.bezierCurveTo(1.2, 0.15, 0, 0.4, 0, 1.2);
  const eye = new THREE.Path(); eye.absarc(1.3, 1.55, 0.16, 0, Math.PI * 2, true); s.holes.push(eye);
  const fin = new THREE.Shape(); fin.moveTo(2.6, 0.7); fin.quadraticCurveTo(3.4, -0.4, 4.4, -0.9); fin.quadraticCurveTo(3.9, 0.2, 3.5, 0.8); fin.lineTo(2.6, 0.7);
  const g = new THREE.ExtrudeGeometry([s, fin], { depth: 0.32, bevelEnabled: false, curveSegments: 10 });
  g.translate(-5, 0, -0.16); return g;
}
function fishGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(1.0, 0.75, 2.0, 0.1); s.lineTo(2.7, 0.55); s.lineTo(2.55, -0.05); s.lineTo(2.7, -0.6); s.lineTo(2.0, -0.15); s.quadraticCurveTo(1.0, -0.75, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false, curveSegments: 6 }); g.translate(-1.35, 0, -0.1); return g;
}

export function buildAquariumExterior() {
  textures();
  const group = new THREE.Group(); group.name = 'aquarium-exterior';
  const B = createBatch({});
  const W = (g, color) => B.add('wall', g, { color, uv: 'keep' });
  const L = (g, color = 0xffffff) => B.add('led', g, { color, uv: 'keep' });
  const WHITE = 0xf3f5f4, TEAL = 0x2f8fa8, TEAL2 = 0x58b7c9, DARK = 0x1d2e36, STONE = 0xd5d8d4;

  /* ── ガラスの かべ（1 回の 描画）── */
  const glassMat = new THREE.MeshStandardMaterial({ color: glassTex ? 0xffffff : 0x2f8fb8, map: glassTex || null, emissive: 0xffffff, emissiveMap: glassTex || null, emissiveIntensity: 0.2, roughness: 0.12, metalness: 0.15 });
  if (!glassTex) glassMat.emissive.setHex(0x2f8fb8);
  const glass = new THREE.Mesh(arcWall(0.25, 8.7, 44), glassMat); glass.name = 'aq-glass'; glass.receiveShadow = true; group.add(glass);

  /* ── 白い かべ・屋根・ひさし・ひろば（1 回の 描画）── */
  // うしろの 箱：青緑の パネル（2 色 ちがい）と 白い おび
  W(box(0, 0, -12.9, 26, 8.9, 10.2), WHITE);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i += 1) for (let j = 0; j < 3; j += 1) W(box(sx * 13.03, 0.6 + j * 2.7, -17.2 + i * 2.05, 0.08, 2.4, 1.85), (i + j) % 2 ? TEAL : TEAL2);
  for (let i = 0; i < 12; i += 1) for (let j = 0; j < 3; j += 1) W(box(-11.9 + i * 2.17, 0.6 + j * 2.7, -18.03, 1.95, 2.4, 0.08), (i + j) % 2 ? TEAL : TEAL2);
  // ガラスの たての ほね（白）と よこの おび
  const a0 = Math.asin(HALF / R);
  for (let i = 0; i <= 16; i += 1) { const a = -a0 + (2 * a0 * i) / 16, x = R * Math.sin(a), z = CZ + R * Math.cos(a); const g = box(0, 0.25, 0, 0.16, 8.5, 0.3); g.rotateY(a); g.translate(x, 0, z); W(g, WHITE); }
  { const g = arcWall(3.7, 3.95, 44, -0.12); W(g, WHITE); }
  { const g = arcWall(0.05, 0.3, 44, -0.2); W(g, STONE); }
  // 波の 屋根（白）
  const roof = roofGeometry(); W(roof.geometry, WHITE);
  // 入口の ひさし（まるい 板）と 柱 2 本・ガラスの とびら（こい 色）
  { const s = new THREE.Shape(); s.moveTo(-5.2, -0.6); s.lineTo(5.2, -0.6); s.lineTo(5.2, 3.2); s.quadraticCurveTo(0, 5.4, -5.2, 3.2); s.lineTo(-5.2, -0.6);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: false, curveSegments: 12 }); g.rotateX(Math.PI / 2); g.translate(0, 4.26, 0); W(g, WHITE); }
  for (const sx of [-4.4, 4.4]) W(cyl(sx, 0.05, 3.9, 0.14, 0.14, 4.0, 10), 0xdfe4e6);
  for (const sx of [-1.05, 1.05]) W(box(sx, 0.3, 0.12, 1.95, 3.1, 0.12), DARK);
  W(box(0, 3.4, 0.14, 4.4, 0.18, 0.16), 0xb8c4c8);
  // ひろば：石の 板（2 色の おび）
  for (let i = 0; i < 7; i += 1) W(box(0, 0, 0.6 + i * 1.6 + 0.8, 29, 0.05, 1.58), i % 2 ? 0xd9dcd8 : 0xcfd3cf);
  // 右の 池の ふち・左の うえこみ（ひくい かべ）と 木
  for (const [x, z, w, d] of [[8.4, 3.0, 6.8, 0.4], [8.4, 8.6, 6.8, 0.4], [5.1, 5.8, 0.4, 5.2], [11.7, 5.8, 0.4, 5.2]]) W(box(x, 0, z, w, 0.52, d), STONE);
  W(box(8.4, 0, 5.8, 6.2, 0.2, 5.2), 0x1d5f78);   // 池の 底
  W(box(-8.4, 0, 5.8, 6.6, 0.5, 4.6), STONE); W(box(-8.4, 0.5, 5.8, 6.2, 0.12, 4.2), 0x5b8a3c);
  for (const [x, z, h] of [[-10.2, 4.8, 1.0], [-8.2, 6.6, 1.3], [-6.4, 5.0, 0.9]]) { W(cyl(x, 0.6, z, 0.07, 0.09, h, 6), 0x6b4f34); W(cyl(x, 0.6 + h, z, 0.25, 0.65, 0.9, 8), 0x4f8f45); }
  // ベンチ 2 つ（ひろばの 前）
  for (const x of [-4.6, 4.6]) { W(box(x, 0.42, 9.6, 2.4, 0.1, 0.6), 0xb08a5a); for (const sx of [-0.9, 0.9]) W(box(x + sx, 0.04, 9.6, 0.12, 0.38, 0.5), 0x6e7478); }
  // クジラの かんばんの 足（屋根の 上）
  for (const sx of [-2.6, 2.6]) W(box(-4 + sx, roofY(-4 + sx, -6.5) - 0.2, -6.5, 0.18, 1.6, 0.18), 0xc9d0d2);

  /* ── 光の 線（屋根の ふち・ひさしの ふち・ガラスの 足もと）── */
  for (let i = 0; i < 44; i += 1) { const x = -14.6 + (29.2 * (i + 0.5)) / 44, z = roof.front(x); L(box(x, roofY(x, z) - 0.78, z + 0.02, 29.2 / 44 + 0.02, 0.08, 0.06)); }
  L(box(0, 3.98, 4.0, 10.2, 0.06, 0.06)); L(box(0, 3.2, 0.2, 4.4, 0.06, 0.04));
  { const g = arcWall(0.3, 0.38, 44, -0.22); L(g); }
  for (const x of [-11, -7, 7, 11]) { L(cyl(x, 0.05, 11.6, 0.09, 0.09, 0.9, 8), 0x9fdde6); }

  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0f2d36, emissive: 0x5fe6ff, emissiveIntensity: 0.4, vertexColors: true, roughness: 0.5 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, emissive: 0x9fe8f0, emissiveIntensity: 0 });
  const { tris: batchTris } = B.flush(group, { wall: wallMat, led: ledMat }, { noShadow: ['led'] });

  /* ── かんばん（英語と ひらがな・夜は 光る）── */
  const signMat = new THREE.MeshStandardMaterial({ color: signTex ? 0xffffff : 0x0d2f4a, map: signTex || null, emissive: signTex ? 0xffffff : 0x0d2f4a, emissiveMap: signTex || null, emissiveIntensity: 0.35, roughness: 0.4 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 2.6), signMat); sign.position.set(0, 5.85, 0.42); sign.name = 'aq-sign'; sign.userData.signText = 'U-SPEAK AQUARIUM / ユースピーク すいぞくかん'; group.add(sign);

  /* ── クジラと 魚の かげ絵（屋根の 上）── */
  const whaleMat = new THREE.MeshStandardMaterial({ color: 0x1b4f7a, emissive: 0x47d6ff, emissiveIntensity: 0.12, roughness: 0.35, metalness: 0.2 });
  const parts = [];
  { const g = whaleGeometry(); g.scale(1.05, 1.05, 1); g.translate(-4, roofY(-4, -6.5) + 1.3, -6.5); parts.push(g); }
  for (const [x, y, s, flip] of [[5.2, 2.6, 1.1, 1], [8.6, 3.6, 0.8, 1], [7.0, 1.4, 0.7, -1], [10.6, 2.0, 0.6, 1]]) { const g = fishGeometry(); g.scale(flip * s, s, 1); g.translate(x, roofY(x, -6.5) + y - 1.2, -6.5); parts.push(g); }
  // 潮ふき（3 つの しずく）
  for (const [x, y, r] of [[-8.6, 4.4, 0.32], [-8.9, 5.1, 0.24], [-8.2, 5.0, 0.22]]) { const g = new THREE.SphereGeometry(r, 10, 8); g.translate(x, roofY(-4, -6.5) + y, -6.5); parts.push(g.toNonIndexed()); }
  const whaleGeo = mergeSimple(parts);
  const whale = new THREE.Mesh(whaleGeo, whaleMat); whale.name = 'aq-whale'; whale.castShadow = true; group.add(whale);

  /* ── 池の 水（あさい・波の ゆらぎは 色だけ）── */
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x2aa6c8, emissive: 0x2aa6c8, emissiveIntensity: 0.05, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5.2).rotateX(-Math.PI / 2), poolMat); pool.position.set(8.4, 0.44, 5.8); pool.name = 'aq-pool'; group.add(pool);

  const obstacles = [{ x: 0, z: -12.8, w: 13.1, d: 5.3 }];
  for (let x = -HALF; x < HALF - 0.01; x += 1.8) { const front = Math.max(arcZ(x), arcZ(x + 1.8)); obstacles.push({ x: x + 0.9, z: (front - 7.5) / 2, w: 0.9, d: (front + 7.5) / 2 }); }
  obstacles.push({ x: 8.4, z: 5.8, w: 3.4, d: 2.9 }, { x: -8.4, z: 5.8, w: 3.3, d: 2.3 });
  for (const sx of [-4.4, 4.4]) obstacles.push({ x: sx, z: 3.9, w: 0.2, d: 0.2 });
  for (const x of [-4.6, 4.6]) obstacles.push({ x, z: 9.6, w: 1.2, d: 0.3 });

  function setNight(n) {
    const k = Math.max(0, Math.min(1, n || 0));
    glassMat.emissiveIntensity = 0.2 + 0.95 * k;
    signMat.emissiveIntensity = 0.35 + 0.85 * k;
    whaleMat.emissiveIntensity = 0.12 + 1.0 * k;
    ledMat.emissiveIntensity = 0.4 + 1.8 * k;
    poolMat.emissiveIntensity = 0.05 + 0.5 * k;
    wallMat.emissiveIntensity = 0.05 * k;
  }
  setNight(0);
  let tris = batchTris;
  for (const m of [glass, sign, whale, pool]) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  group.userData.aquariumExt = { triangles: Math.round(tris) };
  return { group, obstacles, door: { ...AQUARIUM_EXT.door }, setNight, update() {}, triangles: Math.round(tris) };
}

// 位置と 法線だけの 形を 1 つに（クジラ・魚・しずく）。
function mergeSimple(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let at = 0;
  for (const p of parts) { if (!p.attributes.normal) p.computeVertexNormals(); pos.set(p.attributes.position.array, at * 3); nor.set(p.attributes.normal.array, at * 3); at += p.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
