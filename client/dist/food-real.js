// たべものの リアルな 3D モデル（屋台の 9 しゅるい）。絵文字の かわりに 屋台と かばんで 見せる。
//
// ・モデルの ファイルは 読まない：まわした 形（Lathe）・くだ（Tube）・くさび形と、canvas で かいた もよう。
//   つやは MeshPhysicalMaterial（clearcoat）、ガラスは うすい 透明。
// ・**絵に するのは 1 回だけ**：`foodShots()` が 小さな レンダラーを 作って 9 まい 描き、data URL に して **すぐ 捨てる**
//   （WebGL を 持ちつづけない）。うつりこみは 自前の 部屋（PMREM）。失敗したら null ＝ 絵文字の まま。
// ・`realFood(id)` は かばんの 3D プレビュー（bag-preview.js）も 使う。
import * as THREE from './three.module.js';

function tex(size, paint, repeat = false) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); paint(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  } catch { return null; }
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const P = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, ...o });
const mesh = (g, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const lathe = (fn, n = 40, seg = 48) => new THREE.LatheGeometry(Array.from({ length: n + 1 }, (_, i) => { const [r, y] = fn(i / n); return new THREE.Vector2(Math.max(0.0001, r), y); }), seg);
const glassMat = () => P({ color: 0xffffff, transparent: true, opacity: 0.26, roughness: 0.04, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
// コップ：外がわ → ふち → 内がわ。
function cup(g, { r0 = 0.27, r1 = 0.36, h = 0.9, wall = 0.025 } = {}) {
  const pts = [[0.001, 0], [r0, 0], [r1, h], [r1 - wall, h], [r0 - wall, 0.05], [0.001, 0.05]].map(([r, y]) => new THREE.Vector2(r, y));
  const o = mesh(g, new THREE.LatheGeometry(pts, 48), glassMat()); o.castShadow = false; o.renderOrder = 2; return o;
}
function liquid(g, color, { r0 = 0.24, r1 = 0.318, y0 = 0.055, y1 = 0.74, foam = null, rough = 0.25 } = {}) {
  const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, 48); mesh(g, geo, P({ color, roughness: rough, clearcoat: 0.4 }), 0, (y0 + y1) / 2, 0);
  if (foam) mesh(g, new THREE.CylinderGeometry(r1 + 0.003, r1, 0.03, 48), P({ color: foam, roughness: 0.7 }), 0, y1 + 0.012, 0);
}
function straw(g, color, x = 0.1, top = 1.25) {
  const m = P({ color, roughness: 0.35, clearcoat: 0.6 });
  const s = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, top - 0.1, 16), m, x, (top + 0.1) / 2, -0.04); s.rotation.z = -0.14;
  return s;
}

const BUILD = {
  apple(g) {
    const map = tex(256, (c, S) => {
      const gr = c.createLinearGradient(0, S, 0, 0); gr.addColorStop(0, '#d8b84a'); gr.addColorStop(0.28, '#d2452f'); gr.addColorStop(0.7, '#b3101f'); gr.addColorStop(1, '#8f0d1a'); c.fillStyle = gr; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i += 1) { c.fillStyle = `rgba(${rnd() > 0.5 ? '120,8,18' : '235,170,70'},${0.05 + rnd() * 0.12})`; c.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 30 + rnd() * 90); }
      for (let i = 0; i < 240; i += 1) { c.fillStyle = 'rgba(255,225,170,0.5)'; c.fillRect(rnd() * S, rnd() * S, 1.2, 1.2); }
    });
    const geo = lathe((t) => [0.52 * Math.sin(Math.PI * t) ** 0.78 * (1 - 0.1 * t), 0.5 - 0.46 * Math.cos(Math.PI * t) - 0.12 * Math.exp(-(((1 - t) / 0.13) ** 2)) + 0.07 * Math.exp(-((t / 0.1) ** 2))]);
    const a = mesh(g, geo, P({ map, color: map ? 0xffffff : 0xc4122a, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25 })); a.scale.set(1.04, 1, 1);
    const stem = mesh(g, new THREE.CylinderGeometry(0.018, 0.028, 0.24, 8), P({ color: 0x5a3b1e, roughness: 0.8 }), 0.02, 0.98, 0); stem.rotation.z = -0.25;
    const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.14, 0.12, 0.34, 0.02); leafShape.quadraticCurveTo(0.16, -0.1, 0, 0);
    const leaf = mesh(g, new THREE.ShapeGeometry(leafShape, 10), P({ color: 0x4f9a3a, roughness: 0.5, side: THREE.DoubleSide, clearcoat: 0.3 }), 0.03, 0.93, 0); leaf.rotation.set(-0.5, 0.3, 0.35);
  },
  banana(g) {
    const one = (turn, lift) => {
      const pts = []; for (let i = 0; i <= 10; i += 1) { const a = -1.05 + (i / 10) * 2.1; pts.push(new THREE.Vector3(Math.sin(a) * 0.62, 0.62 - Math.cos(a) * 0.62, 0)); }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.13, 7, false);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
      for (let i = 0; i < pos.count; i += 1) {
        const u = Math.floor(i / 8) / 40, k = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.4 + 0.12);
        const cx = Math.sin(-1.05 + u * 2.1) * 0.62, cy = 0.62 - Math.cos(-1.05 + u * 2.1) * 0.62;
        pos.setXYZ(i, cx + (pos.getX(i) - cx) * k, cy + (pos.getY(i) - cy) * k, pos.getZ(i) * k);
        const end = Math.min(u, 1 - u); c.set(end < 0.035 ? 0x4a3418 : end < 0.09 ? 0x9aa63a : 0xf5d13a); c.toArray(col, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const b = mesh(g, geo, P({ vertexColors: true, roughness: 0.42, clearcoat: 0.25, flatShading: false })); b.rotation.set(Math.PI / 2 - 0.25, turn, 0); b.position.y = lift; return b;
    };
    one(-0.5, 0.2); one(0, 0.26); one(0.5, 0.2);
  },
  watermelon(g) {
    const rind = tex(256, (c, S) => { c.fillStyle = '#2f7a34'; c.fillRect(0, 0, S, S); for (let i = 0; i < 9; i += 1) { c.strokeStyle = '#17451f'; c.lineWidth = 9 + rnd() * 8; c.beginPath(); for (let y = 0; y <= S; y += 8) c.lineTo(i * (S / 9) + 14 + Math.sin(y * 0.09 + i) * 6, y); c.stroke(); } });
    const flesh = tex(256, (c, S) => {
      c.fillStyle = '#2f7a34'; c.fillRect(0, 0, S, S);
      const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, '#f0354a'); gr.addColorStop(0.8, '#e62c40'); gr.addColorStop(0.87, '#f7b7a0'); gr.addColorStop(0.92, '#eef3d0'); gr.addColorStop(0.96, '#8fcf6a'); gr.addColorStop(1, '#2f7a34'); c.fillStyle = gr; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 7); c.fill();
      for (let i = 0; i < 26; i += 1) { const a = rnd() * 6.283, r = (0.25 + rnd() * 0.5) * S / 2; c.save(); c.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); c.rotate(a + 1.57); c.fillStyle = '#1b1210'; c.beginPath(); c.ellipse(0, 0, 3.4, 6, 0, 0, 7); c.fill(); c.restore(); }
    });
    const A = 0.62;                                              // くさびの 角度
    mesh(g, new THREE.SphereGeometry(0.62, 40, 28, -A / 2, A), P({ map: rind, color: rind ? 0xffffff : 0x2f7a34, roughness: 0.35, clearcoat: 0.5 }));
    for (const s of [-1, 1]) { const f = mesh(g, new THREE.CircleGeometry(0.62, 40), P({ map: flesh, color: flesh ? 0xffffff : 0xe62c40, roughness: 0.5, side: THREE.DoubleSide, clearcoat: 0.3 })); f.rotation.y = -Math.PI / 2 + s * (A / 2) + (s > 0 ? 0 : 0); f.rotation.y = s > 0 ? -A / 2 - Math.PI / 2 + Math.PI : A / 2 - Math.PI / 2; }
    g.rotation.set(Math.PI / 2, 0, 0.5); g.position.y = 0.3;
  },
  cookie(g) {
    const map = tex(256, (c, S) => { c.fillStyle = '#c98d4c'; c.fillRect(0, 0, S, S); for (let i = 0; i < 900; i += 1) { c.fillStyle = `rgba(${rnd() > 0.5 ? '120,70,25' : '240,200,140'},${0.08 + rnd() * 0.16})`; c.beginPath(); c.arc(rnd() * S, rnd() * S, 1 + rnd() * 5, 0, 7); c.fill(); } });
    const geo = new THREE.SphereGeometry(0.5, 48, 24); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 14) * Math.cos(z * 13) * 0.012 + Math.sin(x * 31 + z * 27) * 0.006; p.setXYZ(i, x * (1 + n), y * 0.24 + (y > 0 ? n * 2.5 : 0), z * (1 + n)); }
    geo.computeVertexNormals(); mesh(g, geo, P({ map, color: map ? 0xffffff : 0xc98d4c, roughness: 0.85 }), 0, 0.12, 0);
    const chip = P({ color: 0x3a2112, roughness: 0.35, clearcoat: 0.4 });
    for (let i = 0; i < 11; i += 1) { const a = i * 2.39, r = 0.08 + (i % 4) * 0.1; const k = mesh(g, new THREE.DodecahedronGeometry(0.05 + (i % 3) * 0.012), chip, Math.cos(a) * r, 0.225 - r * r * 0.22, Math.sin(a) * r); k.rotation.set(i, i * 2, 0); k.scale.y = 0.7; }
    g.rotation.x = -0.25;
  },
  donut(g) {
    const dough = tex(128, (c, S) => { c.fillStyle = '#d39a55'; c.fillRect(0, 0, S, S); for (let i = 0; i < 300; i += 1) { c.fillStyle = `rgba(150,90,35,${rnd() * 0.14})`; c.beginPath(); c.arc(rnd() * S, rnd() * S, 1 + rnd() * 4, 0, 7); c.fill(); } });
    const t = mesh(g, new THREE.TorusGeometry(0.36, 0.2, 28, 64), P({ map: dough, color: dough ? 0xffffff : 0xd39a55, roughness: 0.75 }), 0, 0.2, 0); t.rotation.x = Math.PI / 2; t.scale.z = 0.82;
    const ig = new THREE.TorusGeometry(0.36, 0.208, 28, 96); const p = ig.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x), cut = -0.01 + Math.sin(a * 7) * 0.035 + Math.sin(a * 3 + 1) * 0.02; if (z < cut) p.setZ(i, cut - (cut - z) * 0.05), p.setXYZ(i, x * 0.985, y * 0.985, p.getZ(i)); }
    ig.computeVertexNormals();
    const icing = mesh(g, ig, P({ color: 0xf47fb0, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1 }), 0, 0.2, 0); icing.rotation.x = -Math.PI / 2; icing.scale.z = 0.84;
    const cols = [0xffffff, 0x6ec6f0, 0xffd84a, 0x8fe08a, 0xff6a6a];
    for (let i = 0; i < 34; i += 1) { const a = i * 2.4, r = 0.25 + ((i * 7) % 10) / 10 * 0.22, h = Math.sqrt(Math.max(0, 0.2 * 0.2 - (r - 0.36) ** 2)) * 0.84; const s = mesh(g, new THREE.CapsuleGeometry(0.012, 0.045, 3, 6), P({ color: cols[i % 5], roughness: 0.3, clearcoat: 0.6 }), Math.cos(a) * r, 0.2 + h + 0.008, Math.sin(a) * r); s.rotation.set(Math.PI / 2, 0, i * 1.7); }
    g.rotation.x = -0.35;
  },
  cake(g) {
    const A = 0.72, slice = (r, y, h, color, o = {}) => mesh(g, new THREE.CylinderGeometry(r, r, h, 40, 1, false, -A / 2, A), P({ color, roughness: 0.8, side: THREE.DoubleSide, ...o }), 0, y, 0);
    const sponge = tex(128, (c, S) => { c.fillStyle = '#f2d79a'; c.fillRect(0, 0, S, S); for (let i = 0; i < 500; i += 1) { c.fillStyle = `rgba(190,140,70,${rnd() * 0.25})`; c.beginPath(); c.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 2.2, 0, 7); c.fill(); } });
    const cream = { roughness: 0.45, clearcoat: 0.3 };
    slice(0.8, 0.11, 0.22, 0xffffff, { map: sponge }); slice(0.805, 0.25, 0.06, 0xfff8ee, cream); slice(0.8, 0.31, 0.06, 0xe23a4e, { roughness: 0.3, clearcoat: 0.8 }); slice(0.8, 0.45, 0.22, 0xffffff, { map: sponge }); slice(0.81, 0.6, 0.08, 0xfffaf2, cream);
    for (const s of [-1, 1]) { const w = mesh(g, new THREE.PlaneGeometry(0.8, 0.64), P({ map: tex(128, (c, S) => { const bands = [['#fffaf2', 0.125], ['#f2d79a', 0.34], ['#e23a4e', 0.1], ['#fff8ee', 0.09], ['#f2d79a', 0.345]]; let y = 0; for (const [col, h] of bands) { c.fillStyle = col; c.fillRect(0, y * S, S, h * S + 1); y += h; } for (let i = 0; i < 300; i += 1) { c.fillStyle = `rgba(190,140,70,${rnd() * 0.18})`; c.beginPath(); c.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 2, 0, 7); c.fill(); } }), color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide })); w.castShadow = false; const a = s * A / 2; w.position.set(Math.sin(a) * 0.4, 0.32, Math.cos(a) * 0.4); w.rotation.y = a - Math.PI / 2; }
    const dol = mesh(g, lathe((t) => [0.13 * (1 - t) ** 0.6 * (1 + 0.12 * Math.sin(t * 28)), 0.64 + t * 0.16], 24, 24), P({ color: 0xfffaf2, ...cream }), 0, 0, 0.52);
    dol.castShadow = true;
    const berry = mesh(g, lathe((t) => [0.1 * Math.sin(Math.PI * t) ** 0.7 * (1.25 - t * 0.6), 0.78 + (1 - t) * 0.19], 20, 24), P({ color: 0xd8182c, roughness: 0.25, clearcoat: 0.9 }), 0, 0, 0.52);
    berry.rotation.z = 0.12; mesh(g, new THREE.ConeGeometry(0.06, 0.03, 6), P({ color: 0x3f8f3a, roughness: 0.6 }), 0.0, 0.975, 0.52);
    g.rotation.y = 0.5;
  },
  milk(g) { liquid(g, 0xfdfcf6, { y1: 0.72, rough: 0.5 }); cup(g); },
  juice(g) {
    liquid(g, 0xf79a1c, { y1: 0.7, foam: 0xffc45a }); cup(g);
    const sl = tex(128, (c, S) => { c.clearRect(0, 0, S, S); c.fillStyle = '#f28a12'; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 7); c.fill(); c.fillStyle = '#fff3d0'; c.beginPath(); c.arc(S / 2, S / 2, S * 0.43, 0, 7); c.fill(); for (let i = 0; i < 9; i += 1) { c.fillStyle = i % 2 ? '#fda52a' : '#f9961c'; c.beginPath(); c.moveTo(S / 2, S / 2); c.arc(S / 2, S / 2, S * 0.4, i * 0.698 + 0.05, (i + 1) * 0.698 - 0.05); c.fill(); } });
    const o = mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.035, 40), [P({ color: 0xf28a12, roughness: 0.5 }), P({ map: sl, color: 0xffffff, roughness: 0.4, clearcoat: 0.5 }), P({ map: sl, color: 0xffffff, roughness: 0.4, clearcoat: 0.5 })], 0.33, 0.9, 0.06); o.rotation.set(Math.PI / 2, 0, 0.2); o.rotation.y = 0.5;
    straw(g, 0x2f9a5a, -0.08, 1.2);
  },
  smoothie(g) {
    liquid(g, 0xf06a9a, { r0: 0.235, r1: 0.33, y1: 0.86, rough: 0.6 }); liquid(g, 0xfbd0de, { r0: 0.31, r1: 0.335, y0: 0.74, y1: 0.87, rough: 0.6 }); cup(g, { h: 0.95, r1: 0.37 });
    const lid = mesh(g, new THREE.SphereGeometry(0.375, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat(), 0, 0.95, 0); lid.scale.y = 0.55; lid.castShadow = false; lid.renderOrder = 3;
    mesh(g, new THREE.TorusGeometry(0.372, 0.014, 8, 48), P({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 0.95, 0).rotation.x = Math.PI / 2;
    straw(g, 0xe5333d, 0.0, 1.5);
  },
};

// 1 つの たべもの。高さ・はばを 1 くらいに そろえ、底を y = 0 に 置く。envMap が あれば つやに うつす。
export function realFood(id, { envMap = null } = {}) {
  const make = BUILD[id]; if (!make) return null;
  seed = 7 + id.length * 131;
  const inner = new THREE.Group(); make(inner);
  const g = new THREE.Group(); g.add(inner);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), k = 1 / Math.max(size.x, size.y, size.z);
  inner.scale.multiplyScalar(k); box.setFromObject(inner); const c = box.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= box.min.y;
  if (envMap) g.traverse((o) => { for (const m of [].concat(o.material || [])) { m.envMap = envMap; m.needsUpdate = true; } });
  return g;
}
export const REAL_FOODS = Object.keys(BUILD);

// 絵（data URL）に する：小さな レンダラーを 作って 描き、すぐ 捨てる。build(id, env) は 底が y = 0・大きさ 1 くらいの Group を 返す。
// ほかの 商品（wear-real.js）も これを 使う。失敗したら null。
export function renderShots(ids, build, { size = 256, look = 0.44, turn = -0.5 } = {}) {
  return new Promise((resolve) => {
    let renderer = null;
    try {
      const S = size; renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(S, S); renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      // うつりこみの 部屋：明るい 天井・大きな まど 2 つ・あたたかい ゆか。
      const room = new THREE.Scene();
      room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x9aa7b4, side: THREE.BackSide })));
      const panel = (x, y, z, w, h, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
      panel(0, 5.5, 0, 8, 8, 0xffffff); panel(-5, 2, 3, 5, 6, 0xffffff); panel(5, 1.5, 2, 3, 5, 0xfff0d8); panel(0, -5.5, 0, 12, 12, 0xcdb89a);
      const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(room, 0.03).texture;
      const out = {};
      for (const id of ids) {
        const model = build(id, env); if (!model) continue;
        const scene = new THREE.Scene(); scene.environment = env;
        const key = new THREE.DirectionalLight(0xfff4e2, 2.4); key.position.set(-2.2, 4, 2.6); key.castShadow = true; key.shadow.mapSize.set(512, 512);
        Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 12 }); key.shadow.radius = 6; key.shadow.bias = -0.002; scene.add(key);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.22 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        model.rotation.y = turn; scene.add(model);
        const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30); cam.position.set(0.2, 1.55, 2.9); cam.lookAt(0, look, 0);
        renderer.render(scene, cam);
        out[id] = renderer.domElement.toDataURL('image/png');
        model.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
      }
      env.dispose(); pm.dispose();
      resolve(out);
    } catch (err) { console.warn('[shots] 3D の 絵が 作れない', err); resolve(null); }
    finally { try { renderer?.dispose(); renderer?.forceContextLoss(); } catch { /* 捨てるだけ */ } }
  });
}
// 形を 1 くらいの 大きさに そろえて 底を y = 0 に（ほかの 商品も 使う）。
export function fitUnit(inner, envMap = null) {
  const g = new THREE.Group(); g.add(inner);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), k = 1 / Math.max(size.x, size.y, size.z);
  inner.scale.multiplyScalar(k); box.setFromObject(inner); const c = box.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= box.min.y;
  if (envMap) g.traverse((o) => { for (const m of [].concat(o.material || [])) { m.envMap = envMap; m.needsUpdate = true; } });
  return g;
}

// たべもの 9 まいの 絵（data URL）。1 回だけ 描いて おぼえる。
let shots = null;
export function foodShots() {
  if (!shots) shots = renderShots(REAL_FOODS, (id, env) => realFood(id, { envMap: env }));
  return shots;
}
