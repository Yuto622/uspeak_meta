// プラネタリウム（外がわ と 中の ホール）— メインの島の 北西、前は「バトルアリーナ 🔜」の 箱が あった 場所（2026-11）。
//
// library-real.js と 同じ 考えかた：形は 手続きで 作る（Sphere・Cylinder・Ring）、**材質ごとに 1 メッシュ**、光は 足さない。
// ・外がわ：グリフィス天文台の 形（白い よこ長の 建物・黒い 銅の ドーム 3 つ・緑青の 円堂・高い 玄関・オベリスク）。
//   夜は `setNight(n)`：まどと 玄関が こはく色に 灯る・白い かべが うっすら 光る・玄関の 足もとに あたたかい 光の 輪。
// ・中：くらい まるい ホール。まんなかに 投影機、その まわりに たおれる いすの 輪、上は 全天の ドーム（星は planetarium.js が starfield.js で のせる）。
// ・document が ない（Node の テスト）ときは もようなしで 形だけ 作る。
import * as THREE from './three.module.js';
import { tex, rng, createBatch, box, cyl } from './library-real.js';

const rotY = (a, x = 0, y = 0, z = 0) => new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);
// ふたの ない 筒（ホールの かべ：ふたが あると ドームが かくれる）。UV は まわり＝周の 長さ × k。
function tube(r, y0, h, seg = 64, k = 0.25) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true).toNonIndexed();
  const uv = g.attributes.uv, c = Math.PI * 2 * r; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * c * k, uv.getY(i) * h * k);
  g.translate(0, y0 + h / 2, 0); return g;
}

function poolTex() {
  return tex(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    gr.addColorStop(0, 'rgba(255,196,120,0.9)'); gr.addColorStop(0.45, 'rgba(255,170,90,0.35)'); gr.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }, { repeat: false });
}
/* ───────── 外がわ（グリフィス天文台の 形）───────── */
//
// 2026-11：「ロサンゼルスの グリフィス天文台に そっくりに」。よこに 長い 白い アールデコの 建物（たての 柱がた・たいらな 屋根と ふち・だんの ある 土台）、
// ドームは 3 つ とも 黒に 近い 銅（リブ つき）：まんなかの 奥に 大きい ドーム、左右の はしの まるい 塔に 小さい ドーム。
// 玄関の 上の 屋根に 緑青の ひくい 円堂。まんなかに 高い 玄関（夜は 黄色く 光る）と ひろい だん。両がわに ほそ長い まどが 6 つずつ。
// 右の 塔を まく カーブの 階段、前の しばふに 白い オベリスク（天文学者の 記念碑）と 小さな まるい 売店。
// 大きさは 土地に 合わせて ちぢめて ある（はば 20.6・本物は 約 100 m）。原点は 建物の まんなか、+z が 正面（南）。
export const PLANETARIUM = { half: 8.4, front: 4.4, steps: 5.7, door: 6.6 };   // そでの 半分の はば・玄関の 前の 面・だんの 先・戸口（spot）

function copperTex() {
  // 黒ずんだ 銅の ドーム（たての リブ 24 本・うすい 緑と 茶の しみ）。
  return tex(512, 128, (g, W, H) => {
    g.fillStyle = '#171a18'; g.fillRect(0, 0, W, H);
    const rnd = rng(53), cols = 24, pw = W / cols;
    for (let c = 0; c < cols; c += 1) {
      const l = rnd() - 0.5; g.fillStyle = l > 0 ? `rgba(90,130,110,${l * 0.2})` : `rgba(70,48,28,${-l * 0.2})`; g.fillRect(c * pw, 0, pw, H);
      const gr = g.createLinearGradient(c * pw, 0, (c + 1) * pw, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = gr; g.fillRect(c * pw, 0, pw, H);
      g.fillStyle = 'rgba(8,10,9,0.8)'; g.fillRect(c * pw - 1, 0, 2, H);
      g.fillStyle = 'rgba(190,200,180,0.25)'; g.fillRect(c * pw + 1, 0, 1, H);
    }
  }, { aniso: 8 });
}

export function buildPlanetariumExterior() {
  const HX = PLANETARIUM.half, ZF = 2.75, ZB = -2.25, Y0 = 0.25, WH = 3.2, TOP = Y0 + WH;   // そでの 前・うしろの 面、土台の 高さ、かべの 高さ、屋根
  const group = new THREE.Group(); group.name = 'planetarium';
  const B = createBatch({});
  const K = { uv: 'keep' };
  const ct = copperTex(), pt = poolTex();
  if (ct) ct.repeat.set(1, 2);
  const WHITE = 0xf5f2ea, SHADE = 0xe2ddd0, BASE = 0xd6d0c2, BRONZE = 0x5a4326, GREEN = 0x6fae96, HEDGE = 0x3f7a45, PATH = 0xddd6c4;
  const M = {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, emissive: 0xffc98a, emissiveIntensity: 0 }),
    dome: new THREE.MeshStandardMaterial({ map: ct, vertexColors: true, roughness: 0.42, metalness: 0.35, emissive: 0x1c2a26, emissiveIntensity: 0 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x121a20, roughness: 0.22, metalness: 0.3, emissive: 0xffb84d, emissiveIntensity: 0 }),
    globe: new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.5, emissive: 0xffd08a, emissiveIntensity: 0.05 }),
  };
  const W = (g, color = WHITE) => B.add('wall', g, { color, ...K });
  const P = (g, color) => B.add('plain', g, { color, ...K });
  // まるい 塔：ドラム・柱がた・のきの 帯・銅の ドーム。
  function tower(x, z, r, top, n, domeR) {
    W(cyl(x, 0, z, r + 0.18, r + 0.22, Y0 + 0.05, 28), BASE);
    W(cyl(x, Y0, z, r, r, top - Y0, 32));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      W(box(0, Y0 + 0.35, r - 0.02, r * 0.2, top - Y0 - 0.75, 0.14).applyMatrix4(rotY(a, x, 0, z)));
    }
    W(cyl(x, Y0 + 0.02, z, r + 0.07, r + 0.1, 0.34, 32), SHADE);
    W(cyl(x, top - 0.42, z, r + 0.12, r + 0.06, 0.16, 32), SHADE);
    W(cyl(x, top - 0.1, z, r + 0.2, r + 0.1, 0.22, 32));
    W(cyl(x, top + 0.12, z, domeR + 0.04, domeR + 0.12, 0.2, 32), SHADE);
    const d = new THREE.SphereGeometry(domeR, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2); d.translate(x, top + 0.3, z);
    B.add('dome', d, { color: 0xffffff, ...K });
    P(cyl(x, top + 0.3 + domeR - 0.08, z, domeR * 0.06, domeR * 0.1, 0.16, 10), 0x2a2c28);
  }

  // 土台（2 だん）と そでの 建物・屋根の ふち。
  W(box(0, 0, (ZF + ZB) / 2, HX * 2 + 0.9, 0.12, ZF - ZB + 0.9), BASE);
  W(box(0, 0.12, (ZF + ZB) / 2, HX * 2 + 0.5, 0.13, ZF - ZB + 0.5), BASE);
  W(box(0, Y0, (ZF + ZB) / 2, HX * 2, WH, ZF - ZB));
  for (const z of [ZF - 0.11, ZB + 0.11]) W(box(0, TOP, z, HX * 2, 0.3, 0.22));
  W(box(0, TOP - 0.34, ZF + 0.03, HX * 2, 0.1, 0.1), SHADE);
  W(box(0, Y0, ZF + 0.04, HX * 2, 0.42, 0.1), SHADE);
  P(box(0, TOP - 0.02, (ZF + ZB) / 2, HX * 2 - 0.5, 0.05, ZF - ZB - 0.5), 0xcfc8b8);       // 屋根の 面
  // そでの まど 6 つずつ（ほそ長い・夜は こはく色）と たての 柱がた。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      const x = side * (2.72 + i * 0.66);
      B.add('glass', box(x, Y0 + 0.75, ZF + 0.01, 0.26, 1.85, 0.06));
      W(box(x, Y0 + 0.62, ZF + 0.05, 0.4, 0.09, 0.12), SHADE);
      P(box(x, Y0 + 1.66, ZF + 0.045, 0.26, 0.04, 0.03), BRONZE);
    }
    for (let i = 0; i <= 6; i += 1) W(box(side * (2.39 + i * 0.66), Y0 + 0.42, ZF + 0.06, 0.2, WH - 0.86, 0.13));
    // うしろの かべにも まど（空から 見える）。
    for (let i = 0; i < 5; i += 1) B.add('glass', box(side * (4.4 + i * 0.7), Y0 + 0.75, ZB - 0.01, 0.26, 1.85, 0.06));
    // かべに そった ひくい 生けがき。
    P(box(side * 4.5, 0, ZF + 0.75, 4.4, 0.42, 0.5), HEDGE);
  }
  // まんなかの 高い 玄関の ブロック（上は だんだん）・ふかい 戸口・ブロンズの とびら。
  const EZ = PLANETARIUM.front, EH = 4.15;
  W(box(0, Y0, (ZF - 0.6 + EZ) / 2, 4.4, EH, EZ - ZF + 0.6));
  W(box(0, Y0 + EH, (ZF - 0.6 + EZ) / 2, 3.7, 0.28, EZ - ZF + 0.2));
  W(box(0, Y0 + EH + 0.28, (ZF - 0.6 + EZ) / 2 - 0.1, 2.9, 0.2, EZ - ZF - 0.3), SHADE);
  for (const x of [-1.95, -1.3, 1.3, 1.95]) W(box(x, Y0 + 0.3, EZ + 0.05, 0.3, EH - 0.75, 0.14));
  W(box(0, Y0 + 3.35, EZ + 0.05, 2.3, 0.3, 0.14), SHADE);
  P(box(0, Y0, EZ - 0.06, 2.05, 3.3, 0.2), 0x2a2218);                                     // 戸口の おく（くらい）
  B.add('glass', box(0, Y0, EZ - 0.02, 1.7, 3.05, 0.16));                                 // 中の 光
  for (const x of [-0.57, 0, 0.57]) P(box(x, Y0, EZ + 0.07, 0.07, 3.05, 0.06), BRONZE);
  for (const y of [1.05, 2.3]) P(box(0, Y0 + y, EZ + 0.07, 1.7, 0.07, 0.06), BRONZE);
  // ひろい だん（3 だん）。
  for (let i = 0; i < 3; i += 1) W(box(0, 0, EZ + 0.2 + i * 0.2, 5.6 - i * 0.2, 0.24 - i * 0.08, 0.5 + i * 0.4), BASE);
  // 屋根の 上の ひくい 円堂（八角）と 緑青の 屋根。
  W(cyl(0, TOP, 0.9, 1.75, 1.75, 0.85, 8));
  W(cyl(0, TOP + 0.85, 0.9, 1.9, 1.82, 0.12, 8), SHADE);
  P(cyl(0, TOP + 0.97, 0.9, 0.3, 1.86, 0.5, 8), GREEN);
  P(cyl(0, TOP + 1.47, 0.9, 0.12, 0.3, 0.16, 8), 0x4f8f78);
  for (let i = 0; i < 8; i += 1) B.add('glass', box(0, TOP + 0.2, 1.72, 0.5, 0.42, 0.06).applyMatrix4(rotY((i / 8) * Math.PI * 2, 0, 0, 0.9)));
  // 3 つの 塔と ドーム：まんなかの 奥に 大きい、左右の はしに 小さい（少し 前へ 出る）。
  tower(0, -3.9, 3.45, 5.0, 20, 3.4);
  tower(-HX, 1.0, 1.9, 4.2, 12, 1.82);
  tower(HX, 1.0, 1.9, 4.2, 12, 1.82);
  for (const side of [-1, 1]) for (const a of [-0.5, 0, 0.5]) B.add('glass', box(0, Y0 + 1.6, 1.9, 0.22, 1.1, 0.06).applyMatrix4(rotY(a * side + (side > 0 ? 0.35 : -0.35), side * HX, 0, 1.0)));

  // 右の 塔を まく カーブの 階段（白い 手すりの かべ）：正面から 東へ のぼって 屋根の テラスへ。
  const ramp = [];
  {
    const n = 9, r = 2.55;
    for (let i = 0; i < n; i += 1) {
      const a = -0.25 + (i / (n - 1)) * 1.75, h = 0.35 + (i / (n - 1)) * 2.6;      // 0＝正面（+z）→ 東（+x）
      const m = rotY(a, HX, 0, 1.0);
      W(box(0, 0, r, 0.62, h, 0.75).applyMatrix4(m), i % 2 ? WHITE : SHADE);
      W(box(0, h, r + 0.3, 0.62, 0.42, 0.14).applyMatrix4(m));
      ramp.push({ x: HX + Math.sin(a) * r, z: 1.0 + Math.cos(a) * r });
    }
  }
  // 前の しばふ：うすい 色の 道（まんなか・よこ・オベリスクの まわり）。地面（島の y 0.2）の すぐ 上。
  const LAWN = { z0: PLANETARIUM.steps, z1: 15.2 };
  P(box(0, -0.02, (LAWN.z0 + LAWN.z1) / 2, 2.3, 0.05, LAWN.z1 - LAWN.z0), PATH);
  P(box(0, -0.02, PLANETARIUM.door + 0.1, HX * 2 + 2.4, 0.05, 2.0), PATH);
  P(box(0, -0.02, LAWN.z1, 16.4, 0.05, 1.5), PATH);
  for (const side of [-1, 1]) {
    const arc = new THREE.RingGeometry(6.6, 7.9, 28, 1, side > 0 ? Math.PI * 1.5 : Math.PI, Math.PI / 2); arc.rotateX(-Math.PI / 2); arc.translate(side * 0.75, 0.035, LAWN.z1 - 7.2);
    P(arc, PATH);
  }
  // オベリスク（天文学者の 記念碑）：しばふの 左。まるい 土台・白い 柱・上に 小さな 天球。
  const OB = { x: -5.6, z: 11.2 };
  {
    const ring = new THREE.RingGeometry(1.5, 2.3, 28); ring.rotateX(-Math.PI / 2); ring.translate(OB.x, 0.035, OB.z); P(ring, PATH);
    W(cyl(OB.x, 0, OB.z, 1.3, 1.45, 0.3, 24), BASE);
    W(cyl(OB.x, 0.3, OB.z, 0.95, 1.05, 0.25, 24));
    W(cyl(OB.x, 0.55, OB.z, 0.62, 0.7, 1.15, 6));
    const shaft = new THREE.CylinderGeometry(0.2, 0.42, 3.9, 4, 1).toNonIndexed(); shaft.computeVertexNormals(); shaft.rotateY(Math.PI / 4); shaft.translate(OB.x, 1.7 + 1.95, OB.z); W(shaft);
    const ball = new THREE.SphereGeometry(0.26, 14, 10); ball.translate(OB.x, 5.85, OB.z); P(ball, 0x8a6a3a);
    const hoop = new THREE.TorusGeometry(0.36, 0.03, 6, 24); hoop.rotateX(1.1); hoop.translate(OB.x, 5.85, OB.z); P(hoop, 0x8a6a3a);
  }
  // 小さな まるい 売店（右の 前）。
  const KI = { x: 6.6, z: 9.4 };
  W(cyl(KI.x, 0, KI.z, 0.78, 0.82, 1.55, 16));
  W(cyl(KI.x, 1.55, KI.z, 1.0, 0.9, 0.12, 16), SHADE);
  P(cyl(KI.x, 1.67, KI.z, 0.1, 0.95, 0.4, 16), 0x2f332e);
  B.add('glass', box(KI.x, 0.7, KI.z + 0.76, 0.55, 0.5, 0.08));
  // 街灯（ほそい 柱に 白い 玉。夜は あたたかく 光る＝emissive だけ）。
  const lamps = [[-2.1, 8.4], [2.1, 8.4], [-2.1, 12.6], [2.1, 12.6], [-8.8, 7.9], [9.4, 12.4], [-4.6, 6.0], [4.6, 6.0]];
  for (const [x, z] of lamps) {
    P(cyl(x, 0, z, 0.13, 0.17, 0.22, 10), 0x2c3430);
    P(cyl(x, 0.22, z, 0.045, 0.065, 2.25, 8), 0x2c3430);
    P(cyl(x, 2.47, z, 0.12, 0.05, 0.08, 10), 0x2c3430);
    const globe = new THREE.SphereGeometry(0.2, 14, 10); globe.translate(x, 2.74, z); B.add('globe', globe, K);
  }
  B.flush(group, M, { noShadow: ['glass', 'globe'] });

  // 玄関の 足もとの 光の 輪（夜だけ。光は 足さない＝加算の 板 1 まい）。
  let pool = null;
  if (pt) {
    pool = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28), new THREE.MeshBasicMaterial({ map: pt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.3, EZ + 1.2); pool.visible = false; group.add(pool);
  }
  // 夜：まどと 玄関が こはく色に 灯り、白い かべが 下から てらされた ように うっすら 光る（emissive だけ）。
  function setNight(n) {
    const k = Math.max(0, Math.min(1, n || 0));
    M.glass.emissiveIntensity = 1.9 * k; M.globe.emissiveIntensity = 0.05 + 1.7 * k; M.wall.emissiveIntensity = 0.2 * k; M.dome.emissiveIntensity = 0.5 * k;
    if (pool) { pool.material.opacity = 0.55 * k; pool.visible = k > 0.03; }
  }
  // 当たり判定（半分の はば・おくゆき）。玄関の 前（だん）と しばふの 道は あけて ある。
  const obstacles = [
    { x: 0, z: (ZF + ZB) / 2, w: HX + 0.3, d: (ZF - ZB) / 2 + 0.3 },
    { x: 0, z: (ZF + EZ) / 2, w: 2.3, d: (EZ - ZF) / 2 + 0.1 },
    { x: 0, z: -3.9, w: 3.3, d: 3.3 }, { x: 0, z: -3.9, w: 2.4, d: 3.7 }, { x: 0, z: -3.9, w: 3.7, d: 2.4 },
    { x: -HX, z: 1.0, w: 1.75, d: 1.75 }, { x: HX, z: 1.0, w: 1.75, d: 1.75 },
    ...ramp.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z, w: 0.55, d: 0.55 })),
    { x: -4.5, z: ZF + 0.75, w: 2.2, d: 0.25 }, { x: 4.5, z: ZF + 0.75, w: 2.2, d: 0.25 },
    { x: OB.x, z: OB.z, w: 1.35, d: 1.35 }, { x: KI.x, z: KI.z, w: 0.8, d: 0.8 },
    ...lamps.map(([x, z]) => ({ x, z, w: 0.12, d: 0.12 })),
  ];
  return { group, obstacles, setNight, lamps, door: { x: 0, z: PLANETARIUM.door }, lawn: { w: HX * 2 + 4, z0: -7.8, z1: LAWN.z1 + 1 }, obelisk: OB };
}

/* ───────── 中の ホール ───────── */

export const HALL = { R: 13, wall: 3, door: 1.25 };   // ホールの 半径・かべの 高さ（ドームの 足もと）・戸口の 半分の はば

export function buildPlanetariumInterior() {
  const { R, wall: WH, door: DW } = HALL;
  const group = new THREE.Group(); group.name = 'planetarium-hall';
  const B = createBatch({});
  const K = { uv: 'keep' };
  const floorT = tex(512, 512, (g, W, H) => {
    g.fillStyle = '#12261f'; g.fillRect(0, 0, W, H);
    const c = W / 2, k = W / 2 / R;
    for (const [rr, a] of [[12.4, 0.5], [9.3, 0.28], [6.8, 0.28], [4.2, 0.28], [2.2, 0.6]]) { g.strokeStyle = `rgba(143,240,200,${a})`; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, rr * k, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#1b3a2f'; g.beginPath(); g.arc(c, c, 2.2 * k, 0, Math.PI * 2); g.fill();
    // 南の 通路（戸口 → まんなか）。CircleGeometry の UV は x → u、z → 1 - v（板を ねかせた あと）。
    g.fillStyle = '#1d3a30'; g.fillRect(c - 1.3 * k, c, 2.6 * k, c);
    g.strokeStyle = 'rgba(255,176,102,0.55)'; g.lineWidth = 2; g.strokeRect(c - 1.3 * k, c + 2.2 * k, 2.6 * k, c);
  }, { repeat: false });
  const wallT = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#17302a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i += 1) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,244,214,0.03)'; g.fillRect(i * (W / 8), 0, W / 8 - 2, H); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 8; i += 1) g.fillRect(i * (W / 8) - 1, 0, 2, H);
  });
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: floorT, color: floorT ? 0xffffff : 0x12261f, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ map: wallT, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };

  // 床（1 まいの 円）。
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.2, 56), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'plan-floor'; group.add(floor);
  // かべ（内がわを 見る）・はばき・上の ふち。南（+z）に 戸口。
  B.add('wall', tube(R, 0, WH), { color: 0xffffff, ...K });
  B.add('wall', tube(R - 0.06, 0, 0.3), { color: 0x6a8a7c, ...K });
  B.add('wall', tube(R - 0.1, WH - 0.14, 0.14), { color: 0x5a7a6c, ...K });
  // 足もとの あかり（かべの ふち・通路）と ドームの 足もとの うすい 光の 帯。
  B.add('glow', tube(R - 0.14, WH - 0.2, 0.06), { color: 0x2c6a56, ...K });
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2; if (Math.abs(Math.sin(a) * (R - 0.4)) < DW + 0.5 && Math.cos(a) > 0) continue;
    const d = new THREE.SphereGeometry(0.07, 6, 4); d.translate(Math.sin(a) * (R - 0.25), 0.36, Math.cos(a) * (R - 0.25)); B.add('glow', d, { color: 0x8ff0c8, ...K });
  }
  for (let z = 3.2; z < R - 0.8; z += 1.3) for (const x of [-1.3, 1.3]) { const d = new THREE.SphereGeometry(0.06, 6, 4); d.scale(1, 0.4, 1); d.translate(x, 0.03, z); B.add('glow', d, { color: 0xffb066, ...K }); }
  // 戸口（南）：わく と、外の 光が もれる とびら。
  B.add('wall', box(-DW - 0.14, 0, R - 0.12, 0.28, 2.75, 0.4), { color: 0xd8c8a8 });
  B.add('wall', box(DW + 0.14, 0, R - 0.12, 0.28, 2.75, 0.4), { color: 0xd8c8a8 });
  B.add('wall', box(0, 2.6, R - 0.12, DW * 2 + 0.56, 0.28, 0.4), { color: 0xd8c8a8 });
  B.add('glow', box(0, 0, R - 0.04, DW * 2, 2.6, 0.06), { color: 0xc98a4c });
  B.add('glow', box(0, 2.95, R - 0.3, 1.5, 0.3, 0.06), { color: 0x8ff0c8 });   // 出口の しるし

  // たおれる いす（3 つの 輪・まんなかを 向く）。南の 通路は あける。
  const seats = [];
  for (const [rr, n] of [[5.4, 14], [8.0, 20], [10.6, 26]]) {
    for (let i = 0; i < n; i += 1) {
      const a = ((i + 0.5) / n) * Math.PI * 2, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (Math.abs(x) < 2.0 && z > 0) continue;
      const m = rotY(a, x, 0, z);
      const P = (key, g, o) => B.add(key, g.applyMatrix4(m), o);
      P('metal', box(0, 0, 0.05, 0.16, 0.34, 0.5), { color: 0x2a3238 });
      P('seat', box(0, 0.3, -0.05, 0.92, 0.2, 0.86), { color: 0x24543f });
      const back = new THREE.BoxGeometry(0.9, 1.25, 0.18); back.translate(0, 0.62, 0); back.rotateX(0.72); back.translate(0, 0.42, 0.36);
      P('seat', back, { color: 0x2b644b });
      const head = new THREE.BoxGeometry(0.6, 0.3, 0.2); head.translate(0, 1.32, 0.04); head.rotateX(0.72); head.translate(0, 0.42, 0.36);
      P('seat', head, { color: 0x347a5b });
      for (const sx of [-0.5, 0.5]) P('seat', box(sx, 0.42, 0.0, 0.1, 0.22, 0.72), { color: 0x1b3a2f });
      seats.push({ x, z });
    }
  }
  // 投影機（まんなか）：台・うで・星を うつす 玉（レンズの 点が 光る）。玉だけ ゆっくり まわる。
  B.add('metal', cyl(0, 0, 0, 0.75, 0.95, 0.25, 24), { color: 0x3a4a50, ...K });
  B.add('metal', cyl(0, 0.25, 0, 0.34, 0.5, 1.0, 16), { color: 0x56666c, ...K });
  for (const sx of [-0.92, 0.92]) { B.add('metal', box(sx, 1.2, 0, 0.12, 1.15, 0.3), { color: 0x56666c }); }
  B.add('metal', box(0, 1.15, 0, 1.96, 0.14, 0.34), { color: 0x56666c });
  B.add('glow', cyl(0, 0.26, 0, 0.78, 0.78, 0.04, 24), { color: 0xe27a2d, ...K });
  B.flush(group, M, { noShadow: ['glow'] });

  const ball = new THREE.Group(); ball.position.set(0, 2.05, 0); ball.name = 'plan-projector';
  {
    const bb = createBatch({});
    bb.add('metal', new THREE.SphereGeometry(0.72, 28, 18), { color: 0x2c383e, ...K });
    const band = new THREE.TorusGeometry(0.73, 0.045, 6, 32); band.rotateX(Math.PI / 2); bb.add('metal', band, { color: 0x8c9aa0, ...K });
    const rnd = rng(9), v = new THREE.Vector3();
    for (let i = 0; i < 54; i += 1) {
      const y = rnd() * 1.9 - 0.95, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - y * y); v.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const lens = new THREE.SphereGeometry(0.035 + rnd() * 0.04, 6, 4); lens.translate(v.x * 0.72, v.y * 0.72, v.z * 0.72);
      bb.add('glow', lens, { color: rnd() > 0.3 ? 0xfff4d6 : 0x8ff0c8, ...K });
    }
    bb.flush(ball, M, { noShadow: ['glow'] });
  }
  ball.rotation.z = 0.41; group.add(ball);

  // ドームの スクリーン（内がわ）。星は planetarium.js が この 上に のせる。
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x03070c, side: THREE.BackSide, fog: false }));
  dome.position.y = WH; dome.name = 'plan-dome'; dome.frustumCulled = false; group.add(dome);

  // 当たり判定：かべ（戸口の ところだけ 外へ ぬける）・いす・投影機。
  function blocked(x, z, pad = 0.34) {
    const d = Math.hypot(x, z);
    if (d > R - 0.25 - pad) { if (!(Math.abs(x) < DW - 0.1 && z > 0 && z < R + 1.2)) return true; }
    if (d < 1.05 + pad) return true;
    for (const s of seats) if (Math.abs(x - s.x) < 0.5 + pad * 0.6 && Math.abs(z - s.z) < 0.5 + pad * 0.6) return true;
    return false;
  }
  return {
    group, blocked, seats, ball, dome,
    center: new THREE.Vector3(0, WH, 0), radius: R,
    spawn: { x: 0, z: R - 2.2, ry: Math.PI },       // 戸口の 内がわ（北＝まんなかを 向く）
    exit: { x: 0, z: R - 0.75, r: DW },
    projector: { x: 0, z: 0, r: 4.6 },
    update(t) { ball.rotation.y = t * 0.12; },
  };
}
