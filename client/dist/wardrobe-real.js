// きせかえの 品（ぼうし・かお・せなか・むね）の リアルな 形。箱の 形（wardrobe-models.js の KINDS）の かわりに 使う。
//
// ・モデルの ファイルは 読まない：まわした 形（Lathe）・くだ（Tube）・おしだし（Extrude）・球と、小さな canvas の もよう（あみめ・むぎわら）。
// ・**かるく する**：1 つの 品は「同じ 材質ごとに 1 まいの メッシュ」に まとめる（＝描く 回数は 2〜5 回）。
//   形は `kind:色` ごとに 1 回だけ 作り、あとは clone（形と 材質を 分けあう）。色ちがいは 形も 分けあう。
// ・丸い 体（avatar-chibi.js）に 合わせて ある：ぼうしは 頭に かぶさり、かおの 品は 顔の 丸みに そい、むねの 品は おなかの 丸みに そう。
//   アンカーの 中の 座標で 書く（head ×1.5・face ×1.25・back ×1.1・chest ×1）。
// ・うつりこみは 小さな 6 まいの canvas（金ぞく・つや用）。作れない ときは うつりこみ なし＝少し にぶい 色に なるだけ。
// ・作れなかった kind は null を 返す ＝ wardrobe-models.js が 箱の 形に もどす。
import * as THREE from './three.module.js';

const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX_Y = V(0, 1, 0), AX_Z = V(0, 0, 1);
const GOLD = 0xf2ce72, CREAM = 0xfff4d6, INK = 0x2a2d33, WOOD = 0x6b4a2f, STRAP = 0x6b563f, WHITE = 0xffffff;

// ---- 色 ----
const tone = new THREE.Color(), hsl = {};
function tint(hex, amount) { tone.set(hex); tone.getHSL(hsl); tone.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount))); return tone.getHex(); }

// ---- もよう（canvas）。Node の テストや 古い 端末では null ＝ 色だけ ----
function canvasTex(size, paint, rx = 1, ry = 1) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); paint(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    return t;
  } catch { return null; }
}
const TEX = new Map();
const texOnce = (key, make) => { if (!TEX.has(key)) TEX.set(key, make()); return TEX.get(key); };
const knitTex = () => texOnce('knit', () => canvasTex(64, (g, s) => {            // あみめ：V の 字の ならび
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, s, s); g.strokeStyle = '#b9b9b9'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) { g.beginPath(); g.moveTo(x + 0.5, y + 1); g.lineTo(x + 4, y + 7); g.lineTo(x + 7.5, y + 1); g.stroke(); }
}, 7, 4));
const strawTex = () => texOnce('straw', () => canvasTex(64, (g, s) => {          // むぎわら：あんだ よこ線
  g.fillStyle = '#f6f2e6'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 4) { g.fillStyle = (y / 4) % 2 ? '#d8cfb4' : '#e9e1c8'; for (let x = (y / 4) % 2 ? 0 : 4; x < s; x += 8) g.fillRect(x, y, 6, 3); }
}, 14, 6));
const stripeTex = (a, b) => texOnce(`stripe:${a}:${b}`, () => canvasTex(64, (g, s) => { // ななめの しま（パーティーぼうし）
  const css = (h) => `#${h.toString(16).padStart(6, '0')}`;
  g.fillStyle = css(a); g.fillRect(0, 0, s, s); g.strokeStyle = css(b); g.lineWidth = 11;
  for (let i = -2; i < 4; i += 1) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, s); g.stroke(); }
}, 3, 1));
// うつりこみ：明るい 空・まど・あたたかい 床。three が 自分で ぼかして 使う。
let envDone = false, envTex = null;
function env() {
  if (envDone) return envTex; envDone = true;
  try {
    const face = (i) => {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      if (i === 2) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32); }
      else if (i === 3) { g.fillStyle = '#7d6a58'; g.fillRect(0, 0, 32, 32); }
      else {
        const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#f4f8ff'); gr.addColorStop(0.5, '#aab8c8'); gr.addColorStop(0.56, '#8a7a68'); gr.addColorStop(1, '#6a5a4c');
        g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
        if (i === 0 || i === 4) { g.fillStyle = '#ffffff'; g.fillRect(8, 3, 16, 10); }
      }
      return c;
    };
    const t = new THREE.CubeTexture([0, 1, 2, 3, 4, 5].map(face)); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; envTex = t;
  } catch { envTex = null; }
  return envTex;
}

// ---- 材質。同じ 色・同じ しゅるいは 1 つだけ ----
const MATS = new Map();
function M(c, kind = 'cloth', o = null) {
  const key = `${kind}:${c}:${o ? JSON.stringify(o) : ''}`;
  let m = MATS.get(key); if (m) return m;
  const S = (p) => new THREE.MeshStandardMaterial({ color: c, ...p, ...o });
  const e = () => env();
  switch (kind) {
    case 'felt': m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.84, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(tint(c, 0.3)), ...o }); break;
    case 'knit': m = S({ roughness: 0.95, map: knitTex() }); break;
    case 'straw': m = S({ roughness: 0.82, map: strawTex() }); break;
    case 'leather': m = S({ roughness: 0.5 }); break;
    case 'plastic': m = S({ roughness: 0.34, envMap: e(), envMapIntensity: 0.45 }); break;
    case 'gloss': m = S({ roughness: 0.12, envMap: e(), envMapIntensity: 0.85 }); break;
    case 'metal': m = S({ metalness: e() ? 0.9 : 0.5, roughness: 0.26, envMap: e(), envMapIntensity: 1.15 }); break;
    case 'glass': m = S({ transparent: true, opacity: 0.36, roughness: 0.05, envMap: e(), envMapIntensity: 1.3, depthWrite: false }); break;
    case 'lens': m = S({ transparent: true, opacity: 0.86, roughness: 0.06, metalness: 0.2, envMap: e(), envMapIntensity: 1.2 }); break;
    case 'glow': m = S({ roughness: 0.4, emissive: new THREE.Color(c), emissiveIntensity: 0.85 }); break;
    case 'sheer': m = S({ transparent: true, opacity: 0.6, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false, envMap: e(), envMapIntensity: 0.6 }); break;
    case 'sheet': m = S({ roughness: 0.86, side: THREE.DoubleSide }); break;
    case 'fur': m = S({ roughness: 1 }); break;
    default: m = S({ roughness: 0.86 });
  }
  MATS.set(key, m); return m;
}

// ---- 形の 部品 ----
function put(g, geo, m, p = null, r = null, s = null) {
  const o = new THREE.Mesh(geo, m);
  if (p) o.position.set(p[0], p[1], p[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s != null) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
  g.add(o); return o;
}
function grp(g, p = null, r = null, s = null) {
  const o = new THREE.Group();
  if (p) o.position.set(p[0], p[1], p[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s != null) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
  g.add(o); return o;
}
// 左右 同じ もの：x を うらがえした グループを 2 つ。
const both = (g, fn) => { for (const s of [1, -1]) fn(grp(g, null, null, [s, 1, 1]), s); };
const SPH = new THREE.SphereGeometry(1, 16, 12), SPH_LO = new THREE.SphereGeometry(1, 9, 6);
const ball = (g, m, p, s = 1, r = null) => put(g, SPH, m, p, r, s);
const dot = (g, m, p, s = 1, r = null) => put(g, SPH_LO, m, p, r, s);
// まわした 形。つなぎ目は うしろ。
function latheGeo(pts, seg = 28) { const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg); geo.rotateY(PI); return geo; }
const lat = (g, m, pts, seg, p, r, s) => put(g, latheGeo(pts, seg), m, p, r, s);
// ドームの りんかく（下から 上へ）。e < 1 で 肩が はる。
function dome(R, H, y0, n = 8, e = 1) { const a = []; for (let i = 0; i <= n; i += 1) { const t = (i / n) * HALF; a.push([R * Math.cos(t) ** e, y0 + H * Math.sin(t) ** e]); } return a; }
// くだ。r は 数 か t → 半径 の 関数（先ぼそり）。flat = [軸x, 軸z, つぶす 割合] で リボンのように つぶす。
function tubeGeo(pts, r, { seg = 16, rad = 7, closed = false, flat = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])), closed);
  const geo = new THREE.TubeGeometry(curve, seg, 1, rad, closed);
  const pos = geo.attributes.position, c = V(0, 0, 0), v = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i <= seg; i += 1) {
    curve.getPointAt(closed ? (i % seg) / seg : i / seg, c);
    const k = typeof r === 'function' ? r(i / seg) : r;
    if (flat) n.set(c.x - flat[0], 0, c.z - flat[1]).normalize();
    for (let j = 0; j <= rad; j += 1) {
      const at = i * (rad + 1) + j; v.fromBufferAttribute(pos, at).sub(c).multiplyScalar(k);
      if (flat) v.addScaledVector(n, -(1 - flat[2]) * v.dot(n));
      pos.setXYZ(at, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  return geo;
}
const tube = (g, m, pts, r, o) => put(g, tubeGeo(pts, r, o), m);
// 2 点を むすぶ ぼう。
function rod(g, m, a, b, r, r2 = r, seg = 8) {
  const A = V(a[0], a[1], a[2]), B = V(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length();
  const o = put(g, new THREE.CylinderGeometry(r2, r, len, seg), m);
  o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(AX_Y, d.normalize()); return o;
}
const ring = (g, m, R, t, p, r, s, arc = TAU, ts = 28) => put(g, new THREE.TorusGeometry(R, t, 7, ts, arc), m, p, r, s);
// おしだし（ふちを 丸める）。厚みの まん中が z = 0。
function extGeo(shape, depth, bevel = 0, curve = 5) {
  const d = Math.max(0.002, depth - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: curve, steps: 1 });
  geo.translate(0, 0, -d / 2); return geo;
}
const ext = (g, m, shape, depth, bevel, p, r, s) => put(g, extGeo(shape, depth, bevel), m, p, r, s);
function rrect(w, h, r, x = 0, y = 0, S = THREE.Shape) {
  const s = new S(), a = w / 2, b = h / 2; r = Math.min(r, a, b);
  s.moveTo(x - a + r, y - b); s.lineTo(x + a - r, y - b); s.quadraticCurveTo(x + a, y - b, x + a, y - b + r); s.lineTo(x + a, y + b - r);
  s.quadraticCurveTo(x + a, y + b, x + a - r, y + b); s.lineTo(x - a + r, y + b); s.quadraticCurveTo(x - a, y + b, x - a, y + b - r); s.lineTo(x - a, y - b + r); s.quadraticCurveTo(x - a, y - b, x - a + r, y - b);
  return s;
}
const rbox = (g, m, w, h, d, r, p, rot, s) => ext(g, m, rrect(w, h, r), d, Math.min(r, d * 0.3), p, rot, s);
function star(R, r, n = 5, S = THREE.Shape) { const s = new S(); for (let i = 0; i < n * 2; i += 1) { const a = (i / (n * 2)) * TAU, k = i % 2 ? r : R; const x = Math.sin(a) * k, y = Math.cos(a) * k; if (i) s.lineTo(x, y); else s.moveTo(x, y); } s.closePath(); return s; }
function heart(w, S = THREE.Shape) {
  const s = new S(), k = w / 2;
  s.moveTo(0, -k * 0.9); s.bezierCurveTo(-k * 0.5, -k * 0.45, -k * 1.05, -k * 0.05, -k, k * 0.42); s.bezierCurveTo(-k * 0.95, k * 0.95, -k * 0.2, k * 1.0, 0, k * 0.48);
  s.bezierCurveTo(k * 0.2, k * 1.0, k * 0.95, k * 0.95, k, k * 0.42); s.bezierCurveTo(k * 1.05, -k * 0.05, k * 0.5, -k * 0.45, 0, -k * 0.9);
  return s;
}
function circle(r, x = 0, y = 0, S = THREE.Shape) { const s = new S(); s.absellipse(x, y, r, r, 0, TAU, false, 0); return s; }
function ellipse(rx, ry, x = 0, y = 0, rot = 0) { const s = new THREE.Shape(); s.absellipse(x, y, rx, ry, 0, TAU, false, rot); return s; }
function poly(pts, S = THREE.Shape) { const s = new S(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }
function spline(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); s.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y))); s.closePath(); return s; }
const mirrorPts = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
function leaf(len, w) { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(w, len * 0.45, 0, len); s.quadraticCurveTo(-w, len * 0.45, 0, 0); return s; }
// 頂点を うごかして、法線を 作りなおす（同じ 場所の 頂点は 法線を そろえる ＝ つなぎ目が 見えない）。
function warp(geo, fn) {
  const pos = geo.attributes.position, v = V(0, 0, 0);
  for (let i = 0; i < pos.count; i += 1) { v.fromBufferAttribute(pos, i); fn(v); pos.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, sum = new Map(), key = (i) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  for (let i = 0; i < pos.count; i += 1) { const k = key(i), a = sum.get(k) || [0, 0, 0]; a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); sum.set(k, a); }
  for (let i = 0; i < pos.count; i += 1) { const a = sum.get(key(i)); v.set(a[0], a[1], a[2]).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  return geo;
}
// 面（u: -1〜1・v: 0〜1）を 式で 作る。マント・エプロン。
function sheetGeo(nu, nv, fn) {
  const geo = new THREE.PlaneGeometry(1, 1, nu, nv);
  return warp(geo, (v) => { const [x, y, z] = fn(v.x * 2, 0.5 - v.y); v.set(x, y, z); });
}

// ---- 体の 丸み（アンカーの 中の 座標）。C = 中心・R = 半径 ----
const HAIR = { C: [0, -0.32, -0.09], R: [0.45, 0.375, 0.4] };        // head：かみ・フードの てっぺん（2 つの あいだ）
const FACE = { C: [0, 0.016, -0.464], R: [0.496, 0.448, 0.456] };   // face：頭
const BELLY = { C: [0, -0.08, -0.37], R: [0.44, 0.48, 0.36] };      // chest：どう
const CHIN = { C: [0, 0.74, -0.37], R: [0.62, 0.56, 0.57] };        // chest：頭
const SPINE = { C: [0, -0.118, 0.364], R: [0.4, 0.436, 0.327] };    // back：どう
function surfZ(E, x, y, sign = 1) { const dx = (x - E.C[0]) / E.R[0], dy = (y - E.C[1]) / E.R[1]; return E.C[2] + sign * E.R[2] * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)); }
// 丸みの 上の 1 点と 向き。axis 'z' = シールのように はる・'y' = そこに 立てる。
function stick(E, x, y, lift = 0, sign = 1, axis = 'z') {
  const dx = (x - E.C[0]) / E.R[0], dy = (y - E.C[1]) / E.R[1], dz = sign * Math.sqrt(Math.max(0.03, 1 - dx * dx - dy * dy));
  const n = V(dx / E.R[0], dy / E.R[1], dz / E.R[2]).normalize();
  return { p: V(x, y, E.C[2] + E.R[2] * dz).addScaledVector(n, lift), q: new THREE.Quaternion().setFromUnitVectors(axis === 'y' ? AX_Y : AX_Z, n) };
}
// 頭の 上（x・z から 高さを 出す）。
function stickTop(E, x, z, lift = 0) {
  const dx = (x - E.C[0]) / E.R[0], dz = (z - E.C[2]) / E.R[2], dy = Math.sqrt(Math.max(0.03, 1 - dx * dx - dz * dz));
  const n = V(dx / E.R[0], dy / E.R[1], dz / E.R[2]).normalize();
  return { p: V(x, E.C[1] + E.R[1] * dy, z).addScaledVector(n, lift), q: new THREE.Quaternion().setFromUnitVectors(AX_Y, n) };
}
function sub(g, st, roll = 0, axis = 'z') { const o = new THREE.Group(); o.position.copy(st.p); o.quaternion.copy(st.q); if (roll) { if (axis === 'y') o.rotateY(roll); else o.rotateZ(roll); } g.add(o); return o; }
// 丸みに そう うすい 皮（球の 一部）。k = 少し 大きく。phi は 前（+z）が π/2・theta は 上が 0。
function shell(g, m, E, k, p0, p1, t0, t1, ws = 12, hs = 6) {
  return put(g, new THREE.SphereGeometry(1, ws, hs, p0, p1 - p0, t0, t1 - t0), m, E.C, null, [E.R[0] * k, E.R[1] * k, E.R[2] * k]);
}
// 丸みを ぐるっと まわる 帯（高さ h・厚み t）。tilt = [x, y, z] で かたむける。arc・start で 一部だけ（0 = +x・π/2 = 前）。
function belt(g, m, E, { y = E.C[1], k = 1.03, h = 0.04, t = 0.015, tilt = null, arc = TAU, start = 0, rx = null, rz = null } = {}) {
  const f = Math.sqrt(Math.max(0.05, 1 - ((y - E.C[1]) / E.R[1]) ** 2));
  const sx = rx ?? E.R[0] * f * k, sz = rz ?? E.R[2] * f * k, tau = t / ((sx + sz) / 2);
  const geo = new THREE.TorusGeometry(1, tau, 6, Math.max(8, Math.round(36 * arc / TAU)), arc); geo.rotateX(HALF); geo.rotateY(-start);
  const o = grp(g, [E.C[0], tilt ? E.C[1] : y, E.C[2]], tilt);
  put(o, geo, m, null, null, [sx, h / tau / 2, sz]); return o;
}
// 平たい 形を 丸みに そわせる（z に 表面の 高さを たす）。
const hug = (geo, E, lift = 0.01, sign = 1) => warp(geo, (v) => { v.z = surfZ(E, v.x, v.y, sign) + sign * lift + v.z; });
// くびに かける 輪（むね）。うしろは くびの うしろ・前は yLow まで たれる。体の 中に 入らないように 外へ おす。
function neckLoop(yLow, { rx = 0.22, yBack = 0.3, lift = 0.02, n = 24 } = {}) {
  const pts = [], out = (p, E, k) => { const d = Math.hypot((p[0] - E.C[0]) / E.R[0], (p[1] - E.C[1]) / E.R[1], (p[2] - E.C[2]) / E.R[2]); if (d < k && d > 0.001) for (let i = 0; i < 3; i += 1) p[i] = E.C[i] + (p[i] - E.C[i]) * (k / d); };
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU, f = (Math.cos(a) + 1) / 2, p = [rx * Math.sin(a), yBack + (yLow - yBack) * f ** 1.4, -0.66 + 0.66 * f];
    out(p, BELLY, 1 + lift / 0.4); out(p, CHIN, 1.02); pts.push(p);
  }
  return pts;
}

// ---- ぼうしの 部品（head）。頭の まん中は 少し うしろ（z = -0.05）----
const HZ = -0.05;
const hat = (g, p = [0, -0.05, HZ], r = null) => grp(g, p, r);
// 耳から 耳への カチューシャ。
function headband(g, m, r = 0.022, { rx = 0.465, ry = 0.365, cy = -0.3, z = -0.08, a0 = -0.25, a1 = PI + 0.25 } = {}) {
  const pts = []; for (let i = 0; i <= 12; i += 1) { const a = a0 + ((a1 - a0) * i) / 12; pts.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, z]); }
  return tube(g, m, pts, r, { seg: 20, rad: 6 });
}
const coneR = (r, h) => [[r, 0], [r * 0.86, h * 0.3], [r * 0.52, h * 0.72], [r * 0.2, h * 0.95], [0.0005, h]];
// 花（y が 外向き）。
function blossom(g, c, heartC = 0xf7d354, R = 0.085, n = 5) {
  const m = M(c, 'cloth', { roughness: 0.6 });
  for (let i = 0; i < n; i += 1) { const a = (i / n) * TAU; dot(g, m, [Math.sin(a) * R, 0.012, Math.cos(a) * R], [R * 0.72, R * 0.2, R * 0.72]); }
  dot(g, M(heartC, 'cloth', { roughness: 0.6 }), [0, 0.03, 0], [R * 0.5, R * 0.34, R * 0.5]);
}
// めがねの つると ブリッジ。
function specs(g, m, { reach = 0.27, y = 0.01, r = 0.011 } = {}) {
  tube(g, m, [[-0.07, y + 0.012, 0.045], [0, y + 0.03, 0.06], [0.07, y + 0.012, 0.045]], r, { seg: 8, rad: 6 });
  for (const s of [-1, 1]) tube(g, m, [[s * reach, y, 0.03], [s * 0.38, y + 0.012, -0.1], [s * 0.485, y + 0.02, -0.3], [s * 0.5, y, -0.43]], r, { seg: 10, rad: 6 });
}
const EYE = (s) => ({ p: [s * 0.172, 0, 0.04], r: [0, s * 0.16, 0] });
const lensGrp = (g, s) => { const e = EYE(s); return grp(g, e.p, e.r); };
const diskZ = (g, m, r, t, p, seg = 24) => put(g, new THREE.CylinderGeometry(r, r, t, seg), m, p, [HALF, 0, 0]);
// 丸い バッジの 台（z が 前）。
function coin(g, m, r, t, p = null) { const geo = latheGeo([[0.0005, -t / 2], [r * 0.94, -t / 2], [r, -t * 0.1], [r * 0.94, t * 0.38], [r * 0.6, t * 0.5], [0.0005, t * 0.56]], 24); geo.rotateX(HALF); return put(g, geo, m, p); }
// はねの 形（右がわ・つけねが 原点）。下の ふちは 羽の なみなみ。
function featherShape(k = 1) {
  const s = new THREE.Shape(), top = [[0, 0.06], [0.22, 0.34], [0.58, 0.44], [0.9, 0.3]], low = [[0.76, 0.04], [0.6, -0.12], [0.44, -0.24], [0.28, -0.3], [0.12, -0.28], [0, -0.12]];
  s.moveTo(0, 0.06); s.bezierCurveTo(0.08 * k, 0.3 * k, 0.4 * k, 0.5 * k, 0.9 * k, 0.3 * k);
  let prev = top[3];
  for (const p of low) { const mx = (prev[0] + p[0]) / 2, my = (prev[1] + p[1]) / 2; s.quadraticCurveTo((mx + 0.07) * k, (my - 0.09) * k, p[0] * k, p[1] * k); prev = p; }
  s.lineTo(0, 0.06 * k); return s;
}

// ---- 形の 表。build(g, c)：g に 部品を 足す。c は 品の 色 ----
export const REAL = {
  // ======== ぼうし ========
  cap(g, c) {
    const h = hat(g), m = M(c, 'cloth');
    lat(h, m, dome(0.47, 0.33, -0.1, 8, 0.85));
    ring(h, M(tint(c, -0.1), 'cloth'), 0.467, 0.016, [0, -0.095, 0], [HALF, 0, 0]);
    ball(h, M(tint(c, -0.12), 'cloth'), [0, 0.232, 0], [0.04, 0.02, 0.04]);
    const s = new THREE.Shape(); s.moveTo(-0.37, 0); s.bezierCurveTo(-0.37, 0.52, 0.37, 0.52, 0.37, 0); s.lineTo(-0.37, 0);
    put(h, warp(extGeo(s, 0.03, 0.012), (v) => { v.z += v.x * v.x * 0.35; }), M(tint(c, -0.05), 'cloth'), [0, -0.075, 0.29], [HALF + 0.16, 0, 0]);   // つば
  },
  beanie(g, c) {
    const h = hat(g);
    lat(h, M(c, 'knit'), dome(0.462, 0.42, -0.05, 9, 0.8));
    lat(h, M(tint(c, -0.1), 'knit'), [[0.44, -0.175], [0.488, -0.165], [0.503, -0.1], [0.49, -0.03], [0.45, -0.02]]);     // おりかえし
    put(h, warp(new THREE.SphereGeometry(0.1, 12, 9), (v) => { v.multiplyScalar(1 + 0.09 * Math.sin(v.x * 70) * Math.sin(v.y * 64 + 1) * Math.sin(v.z * 58 + 2)); }), M(tint(c, 0.22), 'fur'), [0, 0.42, 0]);   // ぼんぼん
  },
  bow(g, c) {
    headband(g, M(tint(c, -0.08), 'plastic'), 0.024);
    const b = grp(g, [0, 0.13, 0.02], [0.35, 0, 0]), m = M(c, 'plastic', { roughness: 0.42 });
    for (const s of [-1, 1]) {
      ball(b, m, [s * 0.17, 0.04, 0], [0.16, 0.115, 0.07], [0, 0, s * 0.3]);
      ball(b, M(tint(c, -0.1), 'plastic', { roughness: 0.42 }), [s * 0.12, 0.035, 0.045], [0.075, 0.05, 0.03], [0, 0, s * 0.3]);
      ball(b, M(tint(c, -0.05), 'plastic', { roughness: 0.42 }), [s * 0.11, -0.1, -0.01], [0.055, 0.13, 0.03], [0, 0, s * 0.55]);  // たれた はし
    }
    ball(b, M(tint(c, -0.14), 'plastic', { roughness: 0.42 }), [0, 0.03, 0.02], [0.06, 0.07, 0.06]);
  },
  brim(g, c) {
    const h = hat(g), m = M(c, 'straw');
    lat(h, m, dome(0.45, 0.33, -0.08, 8, 0.75));
    put(h, warp(latheGeo([[0.43, -0.09], [0.58, -0.105], [0.7, -0.115], [0.715, -0.105], [0.7, -0.092], [0.58, -0.08], [0.43, -0.06]], 32), (v) => { const r = Math.hypot(v.x, v.z); if (r > 0.44) v.y += Math.sin(Math.atan2(v.x, v.z) * 2) * (r - 0.44) * 0.12; }), m);
    lat(h, M(0xb8834a, 'cloth', { roughness: 0.6 }), [[0.454, -0.062], [0.46, -0.055], [0.447, 0.04], [0.44, 0.046]]);       // リボン
    const b = grp(h, [0.16, -0.01, 0.43], [0, 0.36, 0]);
    for (const s of [-1, 1]) ball(b, M(0xb8834a, 'cloth', { roughness: 0.6 }), [s * 0.06, 0, 0], [0.06, 0.04, 0.025], [0, 0, s * 0.3]);
  },
  wreath(g, c) {
    const h = hat(g, [0, -0.1, -0.085]), R = [0.39, 0.355], at = (a, k = 1) => [Math.sin(a) * R[0] * k, 0, Math.cos(a) * R[1] * k];
    tube(h, M(0x6a4a2c, 'cloth'), Array.from({ length: 16 }, (_, i) => at((i / 16) * TAU)), 0.022, { seg: 28, rad: 5, closed: true });
    for (let i = 0; i < 16; i += 1) { const a = (i / 16) * TAU, p = at(a, 1.03); dot(h, M(i % 2 ? c : tint(c, -0.1), 'cloth', { roughness: 0.6 }), [p[0], 0.015 + (i % 3) * 0.01, p[2]], [0.1, 0.028, 0.055], [0.3 * (i % 2 ? 1 : -1), a + HALF + (i % 2 ? 0.5 : -0.5), 0.25]); }
    const petals = [0xf2a2c0, 0xfff0b0, 0xffffff, 0xe0a8e8, 0xffc48a];
    for (let i = 0; i < 5; i += 1) { const a = ((i + 0.4) / 5) * TAU, p = at(a, 1.06); blossom(grp(h, [p[0], 0.035, p[2]], [0.5 * Math.cos(a), 0, -0.5 * Math.sin(a)]), petals[i], 0xf7d354, 0.075); }
  },
  ears(g, c) {
    headband(g, M(tint(c, -0.06), 'cloth'), 0.024);
    for (const s of [-1, 1]) {
      const e = grp(g, [s * 0.25, 0.03, -0.08], [0, 0, -s * 0.3]);
      lat(e, M(c, 'fur'), coneR(0.13, 0.3), 14, null, null, [1, 1, 0.5]);
      lat(e, M(0xe9a2ae, 'cloth'), coneR(0.08, 0.2), 12, [0, 0.03, 0.042], null, [1, 1, 0.3]);
    }
  },
  helmet(g, c) {
    const h = hat(g), m = M(c, 'plastic', { roughness: 0.5 });
    lat(h, m, dome(0.45, 0.36, -0.06, 9, 0.86));
    lat(h, M(tint(c, -0.05), 'plastic', { roughness: 0.5 }), [[0.43, -0.05], [0.55, -0.1], [0.66, -0.175], [0.672, -0.162], [0.56, -0.078], [0.43, -0.025]], 32, null, null, [1, 1, 1.1]);
    lat(h, M(0x8a6a45, 'leather'), [[0.453, -0.045], [0.461, -0.04], [0.452, 0.03], [0.444, 0.035]]);
    ring(h, M(tint(c, -0.08), 'plastic', { roughness: 0.5 }), 1, 0.016, [0, -0.06, 0], [0, HALF, 0], [0.452, 0.362, 0.452], PI, 14);
    ball(h, M(0xb9c2cc, 'metal'), [0, 0.305, 0], [0.045, 0.035, 0.045]);
  },
  pirate(g, c) {
    const h = hat(g), m = M(c, 'felt'), gold = M(GOLD, 'metal');
    lat(h, m, dome(0.45, 0.3, -0.08, 8, 0.8));
    const flap = [0.94, 1, 0.64];
    const peak = (v) => { const r = Math.hypot(v.x, v.z); if (r > 0.45) v.y += ((r - 0.45) / 0.27) * 0.2 * (v.z / r) ** 2; };          // 前と うしろが 高い
    put(h, warp(latheGeo([[0.4, -0.09], [0.6, -0.07], [0.69, 0.03], [0.72, 0.16]], 32), peak), M(c, 'felt', { side: THREE.DoubleSide }), null, null, flap);          // そりあがった つば
    put(h, warp(latheGeo([[0.708, 0.14], [0.732, 0.155], [0.722, 0.18], [0.702, 0.165], [0.708, 0.14]], 32), peak), gold, null, null, flap);
    const k = grp(h, [0, 0.12, 0.45], [-0.3, 0, 0]), bone = M(0xfff4e0, 'plastic', { roughness: 0.6 }), ink = M(0x16181d, 'cloth');
    for (const s of [-1, 1]) { rod(k, bone, [-0.1, s * 0.07, -0.005], [0.1, -s * 0.07, -0.005], 0.014, 0.014, 6); for (const e of [-1, 1]) dot(k, bone, [e * 0.1, -e * s * 0.07, -0.005], 0.022); }
    ball(k, bone, [0, 0.015, 0.01], [0.062, 0.058, 0.04]); ball(k, bone, [0, -0.035, 0.01], [0.036, 0.03, 0.03]);
    for (const s of [-1, 1]) dot(k, ink, [s * 0.024, 0.018, 0.043], [0.016, 0.018, 0.008]);
  },
  wizard(g, c) {
    const h = hat(g), m = M(c, 'felt'), gold = M(0xf7e08a, 'glow', { emissiveIntensity: 0.55 });
    const bend = (v) => { const t = Math.max(0, (v.y + 0.08) / 1.2); v.z -= 0.34 * t ** 3; v.x += 0.1 * t * t; v.y -= 0.1 * t ** 4; };
    put(h, warp(latheGeo([[0.44, -0.04], [0.6, -0.085], [0.77, -0.09], [0.785, -0.08], [0.77, -0.068], [0.6, -0.06], [0.44, -0.01]], 32), (v) => { const r = Math.hypot(v.x, v.z); if (r > 0.45) v.y += Math.sin(Math.atan2(v.x, v.z) * 3 + 1) * (r - 0.45) * 0.1; }), M(tint(c, -0.08), 'felt'));
    put(h, warp(latheGeo([[0.452, -0.08], [0.41, 0.08], [0.33, 0.34], [0.24, 0.6], [0.15, 0.84], [0.07, 1.02], [0.02, 1.1], [0.0005, 1.12]], 24), bend), m);
    lat(h, M(tint(c, -0.16), 'felt'), [[0.455, -0.07], [0.462, -0.06], [0.436, 0.045], [0.428, 0.05]]);
    rbox(h, M(GOLD, 'metal'), 0.11, 0.1, 0.03, 0.02, [0, -0.01, 0.452], [-0.25, 0, 0]);
    for (const [x, y, z, k, rz] of [[0.05, 0.34, 0.335, 1, 0.2], [-0.14, 0.58, 0.2, 0.72, -0.4], [0.13, 0.72, 0.13, 0.6, 0.6]]) ext(h, gold, star(0.06, 0.027), 0.02, 0.006, [x, y, z], [-0.32, x * 1.6, rz], k);
    const tip = V(0, 1.12, 0); bend(tip); ball(h, gold, [tip.x, tip.y, tip.z], 0.05);
  },
  crown(g, c) {
    const h = hat(g, [0, -0.06, -0.09]), m = M(c, 'metal'), R = 0.3;
    const geo = new THREE.CylinderGeometry(R * 1.1, R, 0.2, 40, 2, true); geo.translate(0, 0.1, 0);
    warp(geo, (v) => { if (v.y > 0.15) { const a = ((Math.atan2(v.x, v.z) / TAU + 1) * 5) % 1; v.y += 0.14 * (1 - Math.abs(a * 2 - 1) * 2); v.y = Math.max(v.y, 0.14); } });
    put(h, geo, M(c, 'metal', { side: THREE.DoubleSide }));
    lat(h, m, [[R - 0.012, -0.012], [R + 0.022, -0.012], [R + 0.03, 0.022], [R + 0.012, 0.045], [R - 0.012, 0.045]], 32);
    lat(h, M(0xb3243f, 'felt'), dome(R * 1.02, 0.22, 0.04, 6, 0.9), 20);                                                                     // ビロードの 中
    const gems = [0xe0526a, 0x3d8fd1, 0x4fb05a, 0xe0526a, 0x9a6ad0];
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU, b = ((i + 0.5) / 5) * TAU;
      dot(h, m, [Math.sin(b) * R * 1.1, 0.345, Math.cos(b) * R * 1.1], 0.03);
      dot(h, M(gems[i], 'gloss'), [Math.sin(a) * (R + 0.03), 0.085, Math.cos(a) * (R + 0.03)], [0.034, 0.042, 0.024], [0, a, 0]);
    }
  },
  tophat(g, c) {
    const h = hat(g, [0, -0.06, -0.08], [0, 0, -0.06]), m = M(c, 'felt');
    put(h, warp(latheGeo([[0.3, 0], [0.5, -0.008], [0.545, 0.004], [0.552, 0.03], [0.52, 0.04], [0.34, 0.036]], 32), (v) => { v.y += 0.07 * (v.x / 0.55) ** 2 - 0.02 * (v.z / 0.55) ** 2; }), m);
    lat(h, m, [[0.345, 0.02], [0.33, 0.26], [0.365, 0.54], [0.352, 0.57], [0.0005, 0.575]], 32);
    lat(h, M(0xc0453f, 'plastic', { roughness: 0.45 }), [[0.349, 0.04], [0.356, 0.046], [0.342, 0.165], [0.334, 0.17]], 32);
  },
  chef(g, c) {
    const h = hat(g), m = M(c, 'cloth');
    lat(h, m, [[0.4, -0.1], [0.412, -0.09], [0.408, 0.2], [0.39, 0.22]]);
    put(h, warp(new THREE.SphereGeometry(1, 28, 12), (v) => { const a = Math.atan2(v.x, v.z), k = 1 + 0.06 * Math.sin(a * 9) * (1 - v.y * v.y); v.x *= 0.52 * k; v.z *= 0.5 * k; v.y *= 0.25; }), m, [0, 0.38, 0]);
    put(h, warp(new THREE.CylinderGeometry(0.45, 0.405, 0.2, 28, 2, true), (v) => { const a = Math.atan2(v.x, v.z), k = 1 + 0.035 * Math.sin(a * 9) * (v.y + 0.1) * 5; v.x *= k; v.z *= k; }), M(tint(c, -0.03), 'cloth'), [0, 0.28, 0]);
  },
  party(g, c) {
    const h = hat(g, [0, -0.05, -0.07], [0.12, 0, -0.1]), t = stripeTex(c, CREAM);
    lat(h, t ? M(WHITE, 'plastic', { map: t, roughness: 0.55 }) : M(c, 'plastic', { roughness: 0.55 }), [[0.27, 0], [0.2, 0.17], [0.11, 0.4], [0.03, 0.6], [0.0005, 0.65]], 24);
    for (let i = 0; i < 14; i += 1) { const a = (i / 14) * TAU; dot(h, M(i % 2 ? CREAM : 0xf2b544, 'fur'), [Math.sin(a) * 0.275, 0.005, Math.cos(a) * 0.275], 0.04); }
    put(h, warp(new THREE.SphereGeometry(0.075, 10, 8), (v) => { v.multiplyScalar(1 + 0.12 * Math.sin(v.x * 90) * Math.sin(v.y * 80 + 1) * Math.sin(v.z * 70)); }), M(0xf2b544, 'fur'), [0, 0.68, 0]);
  },
  santa(g, c) {
    const h = hat(g), fur = M(WHITE, 'fur');
    const bend = (v) => { const t = Math.max(0, (v.y + 0.06) / 0.78); v.x += 0.5 * t ** 2.2; v.z -= 0.1 * t * t; v.y -= 0.42 * t ** 3; };
    put(h, warp(latheGeo([[0.45, -0.06], [0.43, 0.08], [0.33, 0.28], [0.2, 0.46], [0.1, 0.6], [0.04, 0.69], [0.0005, 0.72]], 24), bend), M(c, 'felt'));
    put(h, warp(new THREE.TorusGeometry(0.455, 0.085, 8, 28), (v) => { v.multiplyScalar(1 + 0.02 * Math.sin(v.x * 60) * Math.sin(v.y * 60)); }), fur, [0, -0.075, 0], [HALF, 0, 0], [1, 1, 0.85]);
    const tip = V(0, 0.72, 0); bend(tip); ball(h, fur, [tip.x + 0.02, tip.y - 0.04, tip.z], 0.095);
  },
  horns(g, c) {
    const h = hat(g), m = M(c, 'metal'), dark = M(tint(c, -0.14), 'metal'), ivory = M(0xfff4e0, 'plastic', { roughness: 0.4 });
    lat(h, m, dome(0.465, 0.34, -0.1, 8, 0.9));
    lat(h, dark, [[0.46, -0.12], [0.485, -0.115], [0.488, -0.05], [0.462, -0.04]]);
    ring(h, dark, 1, 0.04, [0, -0.1, 0], [0, HALF, 0], [0.475, 0.35, 0.475], PI, 14);
    for (let i = 0; i < 8; i += 1) { const a = ((i + 0.5) / 8) * TAU; dot(h, m, [Math.sin(a) * 0.488, -0.082, Math.cos(a) * 0.488], 0.02); }
    for (const s of [-1, 1]) {
      tube(h, ivory, [[s * 0.38, 0.0, 0], [s * 0.54, 0.05, 0], [s * 0.66, 0.2, 0.02], [s * 0.66, 0.42, 0.04]], (t) => 0.095 * (1 - t) ** 0.8 + 0.004, { seg: 12, rad: 8 });
      ring(h, dark, 0.1, 0.022, [s * 0.435, 0.015, 0], [0, HALF, -s * 0.25]);
    }
  },
  halo(g, c) {
    ring(g, M(c, 'glow', { emissiveIntensity: 0.7, roughness: 0.3 }), 0.28, 0.032, [0, 0.4, -0.08], [HALF + 0.14, 0, 0], null, TAU, 32);
  },
  antenna(g, c) {
    headband(g, M(tint(c, -0.2), 'plastic'), 0.024);
    for (const s of [-1, 1]) {
      tube(g, M(0x9aa3ad, 'metal'), [[s * 0.2, 0.05, -0.08], [s * 0.21, 0.24, -0.08], [s * 0.27, 0.4, -0.07], [s * 0.34, 0.47, -0.06]], 0.013, { seg: 10, rad: 5 });
      ball(g, M(c, 'glow', { emissiveIntensity: 0.45, roughness: 0.25 }), [s * 0.36, 0.49, -0.06], 0.075);
    }
  },
  flower(g, c) {
    const f = sub(g, stickTop(HAIR, 0.24, 0.16, -0.02), 0, 'y');
    rod(f, M(0x5aa45a, 'cloth'), [0, 0, 0], [0, 0.07, 0], 0.014, 0.014, 6);
    ext(f, M(0x5aa45a, 'cloth', { roughness: 0.6 }), leaf(0.17, 0.07), 0.012, 0.004, [0, 0.04, 0], [HALF, 0, 2.2]);
    blossom(grp(f, [0, 0.06, 0]), c, 0xf7d354, 0.105);
  },
  phones(g, c) {
    const dark = M(tint(c, -0.2), 'plastic'), m = M(c, 'plastic');
    headband(g, dark, 0.03, { rx: 0.49, ry: 0.44, cy: -0.33, a0: 0.05, a1: PI - 0.05, z: -0.06 });
    headband(g, M(0x2a2d33, 'cloth'), 0.036, { rx: 0.486, ry: 0.436, cy: -0.33, a0: 1.1, a1: PI - 1.1, z: -0.06 });       // クッション
    for (const s of [-1, 1]) {
      const cup = grp(g, [s * 0.5, -0.36, -0.06], [0, 0, -s * HALF]);
      lat(cup, m, [[0.0005, -0.02], [0.13, -0.02], [0.15, 0.01], [0.14, 0.07], [0.09, 0.095], [0.0005, 0.1]], 20);
      ring(cup, M(0x2a2d33, 'cloth'), 0.115, 0.04, [0, -0.03, 0], [HALF, 0, 0], null, TAU, 18);
      ball(cup, M(tint(c, 0.16), 'plastic'), [0, 0.095, 0], [0.05, 0.012, 0.05]);
    }
  },
  propeller(g, c) {
    const h = hat(g), seg = [0xd13a43, 0xf2b544, c, 0x4aa85a];
    for (let i = 0; i < 4; i += 1) put(h, new THREE.SphereGeometry(1, 7, 8, i * HALF, HALF, 0, HALF), M(seg[i], 'cloth'), [0, -0.1, 0], null, [0.475, 0.34, 0.475]);
    ring(h, M(c, 'cloth'), 0.472, 0.02, [0, -0.095, 0], [HALF, 0, 0]);
    const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.bezierCurveTo(-0.3, 0.4, 0.3, 0.4, 0.3, 0); s.lineTo(-0.3, 0);
    ext(h, M(c, 'cloth'), s, 0.03, 0.012, [0, -0.08, 0.32], [HALF + 0.14, 0, 0]);
    rod(h, M(0x9aa3ad, 'metal'), [0, 0.22, 0], [0, 0.37, 0], 0.014, 0.014, 6);
    const p = grp(h, [0, 0.37, 0], [0, 0.5, 0]);
    ball(p, M(0xf2b544, 'plastic'), [0.17, 0, 0], [0.17, 0.012, 0.055], [0.35, 0, 0]);
    ball(p, M(0xd13a43, 'plastic'), [-0.17, 0, 0], [0.17, 0.012, 0.055], [-0.35, 0, 0]);
    ball(p, M(0xd13a43, 'plastic'), [0, 0.005, 0], 0.035);
  },
  cowboy(g, c) {
    const h = hat(g), m = M(c, 'felt');
    lat(h, m, [[0.44, -0.08], [0.435, 0.06], [0.39, 0.25], [0.31, 0.33], [0.17, 0.3], [0.0005, 0.27]], 28, null, null, [0.94, 1, 1]);
    put(h, warp(latheGeo([[0.42, -0.085], [0.6, -0.1], [0.74, -0.09], [0.756, -0.078], [0.74, -0.066], [0.6, -0.074], [0.42, -0.05]], 32), (v) => { v.y += 0.2 * Math.abs(v.x / 0.75) ** 2.6 - 0.035 * (v.z / 0.75) ** 2; }), m, null, null, [1, 1, 0.94]);
    lat(h, M(0x4a3324, 'leather'), [[0.446, -0.06], [0.453, -0.054], [0.445, 0.012], [0.437, 0.018]], 28, null, null, [0.94, 1, 1]);
    rbox(h, M(0xd8dde3, 'metal'), 0.07, 0.06, 0.02, 0.015, [0, -0.02, 0.45]);
  },
  bunny(g, c) {
    headband(g, M(c, 'fur'), 0.026);
    for (const s of [-1, 1]) {
      const e = grp(g, [s * 0.2, 0.05, -0.08], [0, 0, -s * 0.16]);
      ball(e, M(c, 'fur'), [0, 0.32, 0], [0.09, 0.33, 0.05]);
      ball(e, M(0xf5b5c5, 'cloth'), [0, 0.32, 0.036], [0.048, 0.25, 0.022]);
    }
  },
  sprout(g, c) {
    const f = sub(g, stickTop(HAIR, 0, -0.06, -0.03), 0, 'y');
    tube(f, M(tint(c, -0.12), 'cloth', { roughness: 0.6 }), [[0, 0, 0], [0.012, 0.12, 0], [0, 0.24, 0.01]], 0.017, { seg: 8, rad: 6 });
    for (const s of [-1, 1]) ext(f, M(s > 0 ? c : tint(c, 0.06), 'cloth', { roughness: 0.55 }), leaf(0.24, 0.11), 0.018, 0.007, [0, 0.235, 0.01], [HALF - 0.5, 0, s * HALF], null);
  },
  tiara(g, c) {
    const h = hat(g, [0, -0.3, -0.09], [-0.3, 0, 0]), m = M(c, 'metal'), R = [0.42, 0.4], Y = 0.25;
    const at = (a, k = 1) => [Math.sin(a) * R[0] * k, Y, Math.cos(a) * R[1] * k];
    tube(h, m, Array.from({ length: 9 }, (_, i) => at(-1.5 + (3 * i) / 8)), 0.016, { seg: 20, rad: 6 });
    [[-0.62, 0.07], [-0.31, 0.12], [0, 0.2], [0.31, 0.12], [0.62, 0.07]].forEach(([a, hh], i) => {
      const p = at(a), s = grp(h, p, [0, a, 0]);
      lat(s, m, [[0.036, 0], [0.02, hh * 0.6], [0.0005, hh]], 8);
      dot(s, i === 2 ? M(0x6fd0e8, 'gloss') : m, [0, hh + (i === 2 ? 0.02 : 0.008), 0], i === 2 ? 0.036 : 0.018);
    });
    for (const a of [-0.47, -0.155, 0.155, 0.47]) { const p = at(a); dot(h, M(0xf2a2c0, 'gloss'), [p[0], Y + 0.03, p[2]], 0.02); }
  },

  // ======== かお ========
  round(g, c) {
    const m = M(c, 'plastic');
    for (const s of [-1, 1]) { const e = lensGrp(g, s); ring(e, m, 0.1, 0.014, null, null, null, TAU, 24); diskZ(e, M(0xbfe4ef, 'glass'), 0.097, 0.006); }
    specs(g, m);
  },
  shades(g, c) {
    const m = M(c, 'gloss'), outer = () => rrect(0.26, 0.19, 0.07);
    for (const s of [-1, 1]) {
      const e = lensGrp(g, s), f = outer(); f.holes.push(rrect(0.21, 0.14, 0.05, 0, 0, THREE.Path));
      ext(e, m, f, 0.03, 0.008, [0, -0.012, 0]); ext(e, M(tint(c, -0.3), 'lens'), rrect(0.215, 0.145, 0.05), 0.01, 0, [0, -0.012, 0]);
    }
    specs(g, m, { reach: 0.29, y: 0.04, r: 0.013 });
  },
  hearts(g, c) {
    const m = M(c, 'gloss');
    for (const s of [-1, 1]) {
      const e = lensGrp(g, s), f = heart(0.27); f.holes.push(heart(0.19, THREE.Path));
      ext(e, m, f, 0.03, 0.008); ext(e, M(tint(c, 0.12), 'lens', { opacity: 0.7 }), heart(0.2), 0.008, 0);
    }
    specs(g, m, { reach: 0.28, y: 0.03 });
  },
  stars(g, c) {
    const m = M(c, 'gloss');
    for (const s of [-1, 1]) {
      const e = lensGrp(g, s), f = star(0.155, 0.08); f.holes.push(star(0.105, 0.054, 5, THREE.Path));
      ext(e, m, f, 0.03, 0.008); ext(e, M(tint(c, 0.1), 'lens', { opacity: 0.7 }), star(0.11, 0.057), 0.008, 0);
    }
    specs(g, m, { reach: 0.28, y: 0.03 });
  },
  monocle(g, c) {
    const m = M(c, 'metal'), e = lensGrp(g, 1);
    ring(e, m, 0.11, 0.014, null, null, null, TAU, 24); diskZ(e, M(0xbfe4ef, 'glass'), 0.107, 0.006);
    tube(g, m, [[0.285, -0.03, 0.03], [0.35, -0.2, -0.02], [0.4, -0.36, -0.14], [0.37, -0.5, -0.3]], 0.007, { seg: 12, rad: 5 });
  },
  cinema(g, c) {
    const m = M(c, 'cloth', { roughness: 0.7 });
    for (const s of [-1, 1]) {
      const e = grp(g, [s * 0.155, 0, 0.035], [0, s * 0.2, 0]), f = rrect(0.33, 0.2, 0.04); f.holes.push(rrect(0.21, 0.12, 0.02, s * 0.015, 0, THREE.Path));
      ext(e, m, f, 0.02, 0.005); ext(e, M(s < 0 ? 0xd13a43 : 0x3d8fd1, 'lens', { opacity: 0.62 }), rrect(0.215, 0.125, 0.02, s * 0.015, 0), 0.006, 0);
      tube(g, m, [[s * 0.3, 0.01, 0.01], [s * 0.4, 0.015, -0.12], [s * 0.49, 0.02, -0.3], [s * 0.5, 0, -0.43]], 0.02, { seg: 10, rad: 6, flat: [0, -0.464, 0.25] });
    }
  },
  goggles(g, c) {
    const m = M(c, 'plastic'), strap = M(tint(c, -0.3), 'cloth');
    belt(g, strap, FACE, { y: 0.02, k: 1.03, h: 0.1, t: 0.014, arc: PI * 1.5, start: PI * 0.75 });
    for (const s of [-1, 1]) {
      const e = grp(g, [s * 0.175, 0, 0.03], [HALF, 0, -s * 0.16]);
      lat(e, m, [[0.105, -0.02], [0.135, -0.01], [0.14, 0.045], [0.125, 0.07], [0.105, 0.07]], 22);
      put(e, new THREE.CylinderGeometry(0.108, 0.108, 0.006, 22), M(0xbfe4ef, 'glass'), [0, 0.062, 0]);
      ring(e, M(tint(c, -0.18), 'plastic'), 0.118, 0.014, [0, 0.07, 0], [HALF, 0, 0], null, TAU, 22);
    }
    rbox(g, m, 0.1, 0.06, 0.05, 0.02, [0, 0, 0.05]);
  },
  snorkel(g, c) {
    const m = M(c, 'plastic'), f = rrect(0.54, 0.26, 0.11); f.holes.push(rrect(0.45, 0.17, 0.075, 0, 0, THREE.Path));
    const bend = (v) => { v.z -= v.x * v.x * 0.9; };
    put(g, warp(extGeo(f, 0.09, 0.015), bend), m, [0, 0.02, 0.05]);
    put(g, warp(extGeo(rrect(0.46, 0.18, 0.08), 0.008, 0), bend), M(0xbfe4ef, 'glass'), [0, 0.02, 0.07]);
    ball(g, m, [0, -0.11, 0.035], [0.06, 0.06, 0.05]);                                                    // 鼻の ところ
    belt(g, M(tint(c, -0.25), 'cloth'), FACE, { y: 0.03, k: 1.03, h: 0.07, t: 0.014, arc: PI * 1.44, start: PI * 0.78 });
    tube(g, m, [[0.06, -0.19, 0.03], [0.26, -0.2, -0.02], [0.47, -0.1, -0.2], [0.53, 0.2, -0.3], [0.53, 0.56, -0.32]], 0.036, { seg: 18, rad: 8 });
    lat(g, M(0xf2903c, 'plastic'), [[0.037, 0], [0.045, 0.01], [0.045, 0.09], [0.037, 0.1]], 12, [0.53, 0.5, -0.32]);
    ball(g, M(0x2a2d33, 'cloth'), [0.04, -0.19, 0.03], [0.05, 0.035, 0.035]);
  },
  patch(g, c) {
    const p = sub(g, stick(FACE, -0.175, 0.005, 0.012));
    ball(p, M(c, 'leather'), [0, 0, 0], [0.125, 0.115, 0.03]);
    belt(g, M(c, 'leather'), FACE, { y: 0.11, k: 1.025, h: 0.02, t: 0.008, tilt: [0, 0, 0.42] });
  },
  nose(g, c) {
    ball(g, M(c, 'gloss'), [0, -0.085, 0.05], [0.09, 0.09, 0.085]);
  },
  paint(g, c) {
    const m = M(c, 'cloth', { roughness: 0.55 });
    for (const s of [-1, 1]) {
      ext(sub(g, stick(FACE, s * 0.27, -0.1, 0.006), s * 0.2), m, star(0.085, 0.04), 0.012, 0.004);
      dot(sub(g, stick(FACE, s * 0.36, -0.01, 0.003)), M(tint(c, 0.12), 'cloth', { roughness: 0.55 }), [0, 0, 0], [0.022, 0.022, 0.006]);
    }
  },
  mask(g, c) {
    const m = M(c, 'sheet'), dark = M(tint(c, -0.07), 'sheet');
    shell(g, m, FACE, 1.04, HALF - 0.86, HALF + 0.86, 1.84, 2.76, 14, 8);
    for (const t of [2.12, 2.42]) shell(g, dark, FACE, 1.05, HALF - 0.84, HALF + 0.84, t, t + 0.05, 12, 1);
    shell(g, M(tint(c, 0.06), 'sheet'), FACE, 1.047, HALF - 0.86, HALF + 0.86, 1.83, 1.88, 12, 1);
    for (const s of [-1, 1]) for (const t of [1.9, 2.62]) shell(g, M(tint(c, 0.04), 'sheet'), FACE, 1.03, s > 0 ? HALF + 0.86 : HALF - 1.72, s > 0 ? HALF + 1.72 : HALF - 0.86, t, t + 0.03, 6, 1);   // 耳の ひも
  },
  stache(g, c) {
    const s = new THREE.Shape(); s.moveTo(-0.005, -0.012); s.bezierCurveTo(0.07, -0.075, 0.21, -0.085, 0.28, 0.05); s.bezierCurveTo(0.2, -0.005, 0.1, 0.05, -0.005, 0.04); s.lineTo(-0.005, -0.012);
    both(grp(g, [0, -0.105, 0.012]), (h) => put(h, warp(extGeo(s, 0.06, 0.022), (v) => { v.z -= v.x * v.x * 1.1; }), M(c, 'fur')));
  },
  beard(g, c) {
    const m = M(c, 'fur', { side: THREE.DoubleSide });
    shell(g, m, FACE, 1.07, HALF - 1.25, HALF + 1.25, 2.02, 3.0, 16, 6);
    for (const s of [-1, 1]) shell(g, m, FACE, 1.05, s > 0 ? HALF + 1.0 : HALF - 1.45, s > 0 ? HALF + 1.45 : HALF - 1.0, 1.5, 2.1, 5, 4);     // もみあげ
    const fluff = M(c, 'fur'), tip = M(tint(c, 0.05), 'fur');
    for (let i = -3; i <= 3; i += 1) { const a = i * 0.36; ball(g, fluff, [Math.sin(a) * 0.4, -0.3 - 0.06 * Math.cos(a), -0.464 + Math.cos(a) * 0.35], [0.11, 0.11 + 0.04 * Math.cos(a), 0.1]); }
    ball(g, fluff, [0, -0.42, -0.14], [0.2, 0.15, 0.14]); ball(g, tip, [0, -0.53, -0.12], [0.12, 0.11, 0.1]);
  },
  blush(g, c) {
    for (const s of [-1, 1]) ball(sub(g, stick(FACE, s * 0.3, -0.11, 0.004)), M(c, 'cloth', { transparent: true, opacity: 0.78, roughness: 0.6 }), [0, 0, 0], [0.09, 0.055, 0.01]);
  },
  whiskers(g, c) {
    ball(g, M(0xe9a2ae, 'plastic'), [0, -0.082, 0.012], [0.042, 0.032, 0.03]);
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) rod(g, M(c, 'plastic'), [s * 0.13, -0.115 + k * 0.022, -0.005], [s * 0.45, -0.1 + k * 0.085, -0.09], 0.007, 0.003, 5);
  },
  plaster(g, c) {
    const p = grp(g, null, [0, 0, 0.22]);
    put(p, hug(extGeo(rrect(0.27, 0.085, 0.04), 0.012, 0.004), FACE, 0.006), M(c, 'cloth', { roughness: 0.7 }), [0, 0, 0]);
    put(p, hug(extGeo(rrect(0.09, 0.07, 0.015), 0.012, 0.004), FACE, 0.011), M(tint(c, 0.12), 'cloth', { roughness: 0.7 }), [0, 0, 0]);
  },
  vr(g, c) {
    const m = M(c, 'plastic');
    belt(g, M(tint(c, -0.25), 'cloth'), FACE, { y: 0.02, k: 1.03, h: 0.09, t: 0.014, arc: PI * 1.4, start: PI * 0.8 });
    const bend = (v) => { v.z -= v.x * v.x * 0.55; };
    put(g, warp(extGeo(rrect(0.6, 0.23, 0.09), 0.06, 0.02), bend), M(0x2a2d33, 'cloth'), [0, 0, 0.035]);          // 顔に あたる クッション
    put(g, warp(extGeo(rrect(0.64, 0.27, 0.11), 0.17, 0.05), bend), m, [0, 0, 0.14]);
    put(g, warp(extGeo(rrect(0.54, 0.17, 0.08), 0.02, 0.006), bend), M(0x16181d, 'gloss'), [0, 0, 0.228]);
    put(g, warp(extGeo(rrect(0.4, 0.035, 0.017), 0.012, 0.003), bend), M(0x6fe0f0, 'glow'), [0, -0.03, 0.238]);
  },
  tears(g, c) {
    const m = M(c, 'lens', { opacity: 0.78 }), drop = [[0.0005, -0.05], [0.03, -0.04], [0.042, -0.012], [0.03, 0.025], [0.012, 0.06], [0.0005, 0.085]];
    for (const s of [-1, 1]) { lat(sub(g, stick(FACE, s * 0.2, -0.13, 0.012)), m, drop, 12, null, null, [1, 1, 0.6]); lat(sub(g, stick(FACE, s * 0.225, -0.25, 0.01)), m, drop, 10, null, null, [0.65, 0.65, 0.4]); }
  },
  freckles(g, c) {
    for (const s of [-1, 1]) for (let i = 0; i < 4; i += 1) dot(sub(g, stick(FACE, s * (0.2 + i * 0.05), -0.085 - (i % 2) * 0.04, 0.002)), M(c, 'cloth'), [0, 0, 0], [0.02, 0.02, 0.006]);
  },
  visor(g, c) {
    const dark = M(0x2a2f38, 'plastic');
    belt(g, dark, FACE, { y: 0.03, k: 1.035, h: 0.1, t: 0.016 });
    shell(g, M(0x353b45, 'plastic', { side: THREE.DoubleSide }), FACE, 1.075, HALF - 1.15, HALF + 1.15, 1.33, 1.75, 16, 3);
    shell(g, M(c, 'glow', { emissiveIntensity: 1.0, roughness: 0.25 }), FACE, 1.09, HALF - 1.02, HALF + 1.02, 1.42, 1.68, 16, 2);
  },

  // ======== せなか ========
  cape(g, c) {
    const m = M(c, 'felt', { side: THREE.DoubleSide });
    put(g, sheetGeo(14, 12, (u, v) => {
      const x = u * (0.36 + 0.14 * v), y = 0.2 - 1.0 * v;
      return [x, y, Math.min(surfZ(SPINE, x, y, -1) - 0.035, 0.09) - 0.2 * v ** 1.5 + 0.03 * Math.sin(u * 8) * v];
    }), m);
    belt(g, m, SPINE, { y: 0.16, rx: 0.33, rz: 0.29, h: 0.09, t: 0.03 });
    ball(g, M(GOLD, 'metal'), [0, 0.15, 0.364 + 0.3], [0.045, 0.045, 0.03]);
  },
  wings(g, c) { featherWings(g, c, 0.78, [0.1, 0.0, -0.07], 0.5, 0.15); },
  angel(g, c) { featherWings(g, c, 1.2, [0.08, 0.06, -0.08], 0.6, 0.38); },
  bat(g, c) {
    const s = new THREE.Shape(); s.moveTo(0, 0.02); s.bezierCurveTo(0.1, 0.25, 0.3, 0.42, 0.55, 0.36); s.lineTo(0.92, 0.44);
    s.quadraticCurveTo(0.86, 0.2, 0.74, 0.02); s.quadraticCurveTo(0.6, 0.12, 0.5, -0.12); s.quadraticCurveTo(0.36, 0.0, 0.26, -0.22); s.quadraticCurveTo(0.14, -0.08, 0, -0.18); s.lineTo(0, 0.02);
    both(g, (h) => {
      const w = grp(h, [0.08, 0.0, -0.08], [0, 0.5, 0.1]);
      ext(w, M(c, 'leather', { roughness: 0.7 }), s, 0.025, 0.01);
      const bone = M(tint(c, 0.12), 'leather');
      tube(w, bone, [[0, 0.03, -0.015], [0.25, 0.3, -0.015], [0.55, 0.37, -0.015], [0.92, 0.44, -0.015]], (t) => 0.024 * (1 - t * 0.7), { seg: 10, rad: 5 });
      for (const e of [[0.74, 0.02], [0.5, -0.12], [0.26, -0.22]]) rod(w, bone, [0.55, 0.37, -0.015], [e[0], e[1], -0.015], 0.012, 0.005, 5);
    });
  },
  butterfly(g, c) {
    both(g, (h) => {
      const w = grp(h, [0.04, 0.0, -0.07], [0, 0.42, 0]);
      ext(w, M(c, 'plastic', { roughness: 0.5 }), ellipse(0.34, 0.26, 0.36, 0.24, 0.6), 0.022, 0.009);
      ext(w, M(tint(c, -0.08), 'plastic', { roughness: 0.5 }), ellipse(0.23, 0.2, 0.26, -0.24, -0.5), 0.022, 0.009, [0, 0, 0.004]);
      for (const z of [-0.015, 0.02]) {
        ext(w, M(tint(c, 0.2), 'plastic', { roughness: 0.5 }), ellipse(0.19, 0.13, 0.36, 0.25, 0.6), 0.006, 0, [0, 0, z]);
        ext(w, M(CREAM, 'plastic', { roughness: 0.5 }), circle(0.07, 0.27, -0.25), 0.006, 0, [0, 0, z]);
        ext(w, M(CREAM, 'plastic', { roughness: 0.5 }), circle(0.035, 0.56, 0.38), 0.006, 0, [0, 0, z]);
      }
    });
    ball(g, M(0x3b3b40, 'cloth'), [0, -0.02, -0.07], [0.045, 0.3, 0.045]);
  },
  fairy(g, c) {
    both(g, (h) => {
      const w = grp(h, [0.04, 0.02, -0.06], [0, 0.45, 0]);
      ext(w, M(c, 'sheer'), leaf(0.82, 0.34), 0.008, 0, null, [0, 0, -0.9]);
      ext(w, M(tint(c, 0.08), 'sheer'), leaf(0.52, 0.24), 0.008, 0, [0, -0.02, 0.004], [0, 0, -2.1]);
      tube(w, M(tint(c, -0.2), 'plastic'), [[0, 0, 0], [0.3, 0.26, 0], [0.62, 0.5, 0]], (t) => 0.011 * (1 - t * 0.8), { seg: 8, rad: 4 });
      tube(w, M(tint(c, -0.2), 'plastic'), [[0, -0.02, 0], [0.22, -0.14, 0], [0.42, -0.26, 0]], (t) => 0.009 * (1 - t * 0.8), { seg: 6, rad: 4 });
    });
  },
  pack(g, c) {
    const m = M(c, 'cloth'), dark = M(tint(c, -0.09), 'cloth'), strap = M(STRAP, 'leather');
    rbox(g, m, 0.58, 0.66, 0.3, 0.14, [0, -0.2, -0.16]);
    rbox(g, dark, 0.4, 0.26, 0.1, 0.07, [0, -0.34, -0.31]);
    tube(g, M(0xd8dde3, 'metal'), [[-0.23, -0.02, -0.3], [-0.12, 0.07, -0.315], [0.12, 0.07, -0.315], [0.23, -0.02, -0.3]], 0.011, { seg: 12, rad: 5 });   // ファスナー
    rbox(g, strap, 0.44, 0.05, 0.03, 0.02, [0, -0.18, -0.312]);
    ring(g, strap, 0.07, 0.016, [0, 0.13, -0.14], [0, HALF, 0], null, PI, 10);
    for (const s of [-1, 1]) put(g, new THREE.TorusGeometry(1, 0.085, 6, 24), strap, [s * 0.23, -0.1, 0.33], [0, HALF, 0], [0.33, 0.41, 0.4]);
  },
  tail(g, c) {
    const path = [[0, -0.42, 0.06], [0, -0.52, -0.14], [0, -0.44, -0.36], [0, -0.22, -0.5], [0, 0.0, -0.5]];
    tube(g, M(c, 'fur'), path, (t) => 0.05 + 0.11 * Math.sin(Math.min(1, t * 1.25) * PI * 0.62), { seg: 16, rad: 9 });
    tube(g, M(0xfff4e2, 'fur'), [[0, -0.1, -0.512], [0, 0.0, -0.5], [0, 0.11, -0.46], [0, 0.17, -0.42]], (t) => 0.148 * Math.cos(t * HALF) ** 0.7 + 0.003, { seg: 8, rad: 9 });
  },
  balloon(g, c) {
    tube(g, M(0xe4dcc0, 'cloth'), [[0.1, -0.06, -0.02], [0.2, 0.4, -0.2], [0.42, 0.85, -0.3], [0.52, 1.08, -0.32]], 0.007, { seg: 12, rad: 4 });
    const b = grp(g, [0.56, 1.4, -0.33], [0, 0, -0.12]), m = M(c, 'gloss', { roughness: 0.18 });
    lat(b, m, [[0.0005, -0.31], [0.03, -0.295], [0.1, -0.23], [0.2, -0.09], [0.25, 0.05], [0.228, 0.2], [0.14, 0.3], [0.0005, 0.335]], 24);
    lat(b, M(tint(c, -0.14), 'gloss'), [[0.04, -0.345], [0.012, -0.3], [0.0005, -0.3]], 10);
  },
  shell(g, c) {
    const E = { C: [0, -0.14, 0.03], R: [0.46, 0.5, 0.3] }, lite = M(tint(c, 0.1), 'plastic', { roughness: 0.45 });
    ball(g, M(c, 'plastic', { roughness: 0.45 }), E.C, E.R);
    ring(g, M(0xe0cf9a, 'plastic', { roughness: 0.5 }), 1, 0.07, [0, -0.14, 0.02], null, [0.46, 0.5, 0.6], TAU, 28);
    for (const [x, y, k] of [[0, 0, 1.15], [0, 0.29, 0.85], [0, -0.29, 0.85], [0.26, 0.15, 0.85], [-0.26, 0.15, 0.85], [0.26, -0.15, 0.85], [-0.26, -0.15, 0.85]]) {
      put(sub(g, stick(E, x, -0.14 + y, 0.004, -1)), new THREE.CylinderGeometry(0.105 * k, 0.125 * k, 0.03, 6), lite, null, [HALF, 0, 0]);
    }
  },
  guitar(g, c) {
    const G = grp(g, [-0.06, -0.3, -0.2], [-0.14, 0, -0.62], 0.92), wood = M(c, 'gloss', { roughness: 0.22 }), neck = M(WOOD, 'plastic'), dark = M(0x3a2a1c, 'plastic');
    const body = spline(mirrorPts([[0, -0.4], [0.2, -0.37], [0.29, -0.2], [0.26, -0.02], [0.19, 0.08], [0.2, 0.2], [0.2, 0.3], [0.11, 0.39], [0, 0.4]]));
    put(G, extGeo(body, 0.13, 0.03, 2), wood);
    put(G, extGeo(body, 0.01, 0, 2), M(tint(c, 0.14), 'gloss', { roughness: 0.22 }), [0, 0, -0.064], null, [0.9, 0.92, 1]);
    diskZ(G, dark, 0.085, 0.012, [0, 0.06, -0.068], 18); ring(G, M(CREAM, 'plastic'), 0.092, 0.008, [0, 0.06, -0.07], null, null, TAU, 18);
    rbox(G, dark, 0.2, 0.045, 0.03, 0.012, [0, -0.2, -0.075]);
    rbox(G, neck, 0.075, 0.78, 0.05, 0.02, [0, 0.74, -0.055]);
    rbox(G, dark, 0.11, 0.18, 0.04, 0.025, [0, 1.2, -0.05]);
    for (const s of [-1, 1]) for (const y of [1.15, 1.24]) dot(G, M(0xd8dde3, 'metal'), [s * 0.07, y, -0.05], 0.02);
    for (const x of [-0.02, 0, 0.02]) rod(G, M(0xe8e8e8, 'metal'), [x, -0.2, -0.085], [x, 1.14, -0.085], 0.003, 0.003, 4);
    belt(g, M(0x4a3a2a, 'leather'), SPINE, { k: 1.04, h: 0.08, t: 0.014, tilt: [0, 0, -0.62], rx: 0.44, rz: 0.345 });
  },
  sword(g, c) {
    const G = grp(g, [0.04, -0.1, -0.16], [-0.12, 0, 0.56]), steel = M(c, 'metal'), gold = M(0xb08040, 'metal');
    ext(G, steel, poly([[-0.055, 0.22], [0.055, 0.22], [0.05, -0.62], [0, -0.78], [-0.05, -0.62]]), 0.03, 0.013);
    rod(G, M(tint(c, -0.12), 'metal'), [0, 0.2, -0.016], [0, -0.55, -0.016], 0.008, 0.008, 4);
    rbox(G, gold, 0.36, 0.06, 0.07, 0.028, [0, 0.25, 0]);
    for (const s of [-1, 1]) dot(G, gold, [s * 0.18, 0.25, 0], 0.04);
    dot(G, M(0xe0526a, 'gloss'), [0, 0.25, -0.036], [0.028, 0.028, 0.016]);
    rod(G, M(WOOD, 'leather'), [0, 0.28, 0], [0, 0.52, 0], 0.04, 0.036, 10);
    for (const y of [0.33, 0.39, 0.45]) ring(G, M(0x3a2a1c, 'leather'), 0.04, 0.008, [0, y, 0], [HALF, 0, 0], null, TAU, 10);
    ball(G, gold, [0, 0.56, 0], 0.06);
    belt(g, M(0x5a4632, 'leather'), SPINE, { k: 1.04, h: 0.07, t: 0.014, tilt: [0, 0, 0.56], rx: 0.44, rz: 0.345 });
  },
  jet(g, c) {
    const m = M(c, 'gloss', { roughness: 0.25 }), steel = M(0x9aa3ad, 'metal'), strap = M(STRAP, 'leather');
    rbox(g, M(0xd8d2c4, 'plastic'), 0.3, 0.5, 0.16, 0.06, [0, -0.08, -0.12]);
    for (const s of [-1, 1]) {
      const t = grp(g, [s * 0.24, -0.1, -0.2]);
      lat(t, m, [[0.0005, -0.36], [0.1, -0.35], [0.135, -0.28], [0.135, 0.26], [0.1, 0.36], [0.0005, 0.4]], 20);
      for (const y of [-0.2, 0.18]) ring(t, steel, 0.136, 0.014, [0, y, 0], [HALF, 0, 0], null, TAU, 20);
      lat(t, M(0x4a4a52, 'metal'), [[0.07, -0.34], [0.11, -0.47], [0.09, -0.47], [0.05, -0.36]], 16);
      lat(t, M(0xffb347, 'glow', { emissive: new THREE.Color(0xff7a2a), emissiveIntensity: 1.2 }), [[0.0005, -0.72], [0.045, -0.6], [0.08, -0.47], [0.0005, -0.44]], 12);
      put(g, new THREE.TorusGeometry(1, 0.085, 6, 24), strap, [s * 0.23, -0.1, 0.33], [0, HALF, 0], [0.33, 0.41, 0.4]);
    }
  },
  rocket(g, c) {
    const R = grp(g, [0, -0.16, -0.25]), red = M(0xd13a43, 'gloss', { roughness: 0.25 });
    lat(R, M(c, 'gloss', { roughness: 0.25 }), [[0.0005, -0.56], [0.11, -0.56], [0.15, -0.5], [0.185, -0.3], [0.19, -0.05], [0.172, 0.16]], 22);
    lat(R, red, [[0.172, 0.16], [0.14, 0.3], [0.08, 0.44], [0.025, 0.51], [0.0005, 0.52]], 22);
    ring(R, red, 0.18, 0.016, [0, 0.16, 0], [HALF, 0, 0], null, TAU, 22);
    for (let i = 0; i < 3; i += 1) ext(grp(R, null, [0, PI + (i * TAU) / 3, 0]), red, poly([[0.15, -0.28], [0.34, -0.56], [0.34, -0.66], [0.13, -0.52]]), 0.03, 0.012, null, [0, -HALF, 0]);
    ring(R, M(0xd8dde3, 'metal'), 0.075, 0.018, [0, -0.08, -0.185], null, null, TAU, 18); diskZ(R, M(0x7fc8e8, 'gloss'), 0.07, 0.02, [0, -0.08, -0.18], 18);
    lat(R, M(0x4a4a52, 'metal'), [[0.08, -0.54], [0.12, -0.64], [0.1, -0.64], [0.06, -0.55]], 16);
    lat(R, M(0xffb066, 'glow', { emissive: new THREE.Color(0xe27a2d), emissiveIntensity: 1.2 }), [[0.0005, -0.9], [0.05, -0.78], [0.09, -0.64], [0.0005, -0.6]], 12);
    for (const s of [-1, 1]) put(g, new THREE.TorusGeometry(1, 0.085, 6, 24), M(STRAP, 'leather'), [s * 0.2, -0.1, 0.33], [0, HALF, 0], [0.33, 0.41, 0.4]);
  },
  quiver(g, c) {
    const Q = grp(g, [0.06, -0.14, -0.16], [-0.1, 0, -0.42]), wood = M(0xd8c9a0, 'cloth');
    lat(Q, M(c, 'leather'), [[0.0005, -0.38], [0.095, -0.38], [0.108, -0.34], [0.122, 0.32], [0.105, 0.32], [0.095, -0.3]], 18);
    for (const y of [-0.26, 0.26]) ring(Q, M(tint(c, -0.14), 'leather'), 0.118, 0.016, [0, y, 0], [HALF, 0, 0], null, TAU, 18);
    [[-0.045, 0, 0xd13a43], [0.045, 0.02, CREAM], [0, -0.04, 0x3d8fd1]].forEach(([x, z, col], i) => {
      rod(Q, wood, [x, 0.2, z], [x * 1.5, 0.62 + i * 0.03, z * 1.5], 0.01, 0.01, 5);
      for (const a of [0, HALF]) dot(Q, M(col, 'cloth'), [x * 1.45, 0.56 + i * 0.03, z * 1.45], [0.035, 0.075, 0.006], [0, a, 0]);
    });
    belt(g, M(tint(c, -0.1), 'leather'), SPINE, { k: 1.04, h: 0.06, t: 0.014, tilt: [0, 0, -0.5], rx: 0.44, rz: 0.345 });
  },
  shield(g, c) {
    const s = new THREE.Shape(); s.moveTo(-0.36, 0.32); s.quadraticCurveTo(0, 0.38, 0.36, 0.32); s.bezierCurveTo(0.38, -0.15, 0.24, -0.42, 0, -0.56); s.bezierCurveTo(-0.24, -0.42, -0.38, -0.15, -0.36, 0.32);
    const curve = (v) => { v.z += v.x * v.x * 0.5; }, G = grp(g, [0, -0.18, -0.16]);
    put(G, warp(extGeo(s, 0.06, 0.022), curve), M(c, 'metal'));
    put(G, warp(extGeo(s, 0.012, 0), curve), M(tint(c, -0.18), 'metal'), [0, 0.0, -0.036], null, [0.86, 0.87, 1]);
    const cross = M(CREAM, 'plastic');
    put(G, warp(extGeo(rrect(0.11, 0.62, 0.02), 0.02, 0.006), curve), cross, [0, -0.06, -0.045]);
    put(G, warp(extGeo(rrect(0.5, 0.11, 0.02), 0.02, 0.006), curve), cross, [0, 0.06, -0.045]);
    ball(G, M(GOLD, 'metal'), [0, 0.06, -0.06], [0.05, 0.05, 0.03]);
  },
  surf(g, c) {
    const G = grp(g, [0, -0.2, -0.2], [-0.2, 0, 0.18]);
    const s = spline(mirrorPts([[0, 0.78], [0.1, 0.62], [0.19, 0.32], [0.215, -0.1], [0.185, -0.48], [0.1, -0.7], [0, -0.74]]));
    ext(G, M(c, 'gloss', { roughness: 0.2 }), s, 0.055, 0.026);
    for (const z of [-0.03, 0.03]) ext(G, M(CREAM, 'gloss', { roughness: 0.2 }), rrect(0.05, 1.3, 0.025), 0.006, 0, [0, 0, z]);
    for (const z of [-0.03, 0.03]) ext(G, M(tint(c, -0.16), 'gloss', { roughness: 0.2 }), rrect(0.3, 0.05, 0.02), 0.006, 0, [0, 0.36, z]);
    ext(G, M(tint(c, -0.2), 'plastic'), poly([[0, 0], [0.13, 0], [0.02, 0.15]]), 0.012, 0.004, [0, -0.6, -0.03], [0, HALF, -HALF]);
  },
  pom(g, c) {
    put(g, warp(new THREE.SphereGeometry(0.15, 14, 10), (v) => { v.multiplyScalar(1 + 0.07 * Math.sin(v.x * 60) * Math.sin(v.y * 56 + 1) * Math.sin(v.z * 52 + 2)); }), M(c, 'fur'), [0, -0.42, 0.02]);
  },
  spikes(g, c) {
    for (let i = 0; i < 5; i += 1) {
      const k = 1 - Math.abs(i - 1.6) * 0.16, s = sub(g, stick(SPINE, 0, 0.2 - i * 0.16, -0.02, -1, 'y'));
      lat(s, M(i % 2 ? tint(c, 0.08) : c, 'plastic', { roughness: 0.5 }), coneR(0.085 * k, 0.2 * k), 10, null, null, [0.6, 1, 1.25]);
    }
  },
  kite(g, c) {
    tube(g, M(0xe4dcc0, 'cloth'), [[0.1, -0.06, -0.02], [0.24, 0.45, -0.2], [0.5, 0.95, -0.36], [0.64, 1.22, -0.42]], 0.006, { seg: 12, rad: 4 });
    const K = grp(g, [0.68, 1.5, -0.44], [-0.2, -0.25, -0.3]);
    ext(K, M(c, 'plastic', { roughness: 0.6 }), poly([[0, 0.3], [0.23, 0.06], [0, -0.34], [-0.23, 0.06]]), 0.012, 0.004);
    rod(K, M(CREAM, 'cloth'), [0, 0.3, 0.01], [0, -0.34, 0.01], 0.01, 0.01, 4); rod(K, M(CREAM, 'cloth'), [-0.23, 0.06, 0.01], [0.23, 0.06, 0.01], 0.01, 0.01, 4);
    tube(K, M(0xe4dcc0, 'cloth'), [[0, -0.34, 0], [0.06, -0.48, 0], [-0.05, -0.62, 0], [0.04, -0.76, 0]], 0.006, { seg: 10, rad: 4 });
    [[0.05, -0.47, 0xd13a43], [-0.04, -0.61, 0xf2b544], [0.03, -0.75, 0x3d8fd1]].forEach(([x, y, col]) => { for (const s of [-1, 1]) dot(K, M(col, 'cloth'), [x + s * 0.035, y, 0], [0.04, 0.026, 0.008], [0, 0, s * 0.4]); });
  },
  rod(g, c) {
    const G = grp(g, [0.04, -0.1, -0.2], [-0.16, 0, -0.32]), steel = M(0x9aa3ad, 'metal');
    rod(G, M(c, 'gloss', { roughness: 0.3 }), [0, -0.5, 0], [0, 0.95, 0], 0.02, 0.006, 8);
    rod(G, M(0xd8b88a, 'cloth'), [0, -0.72, 0], [0, -0.46, 0], 0.03, 0.028, 10);
    rod(G, steel, [-0.03, -0.4, -0.05], [0.03, -0.4, -0.05], 0.06, 0.06, 14); rod(G, steel, [0.03, -0.4, -0.05], [0.07, -0.4, -0.05], 0.012, 0.012, 5); dot(G, M(0x2a2d33, 'plastic'), [0.08, -0.37, -0.05], 0.02);
    for (const y of [0.0, 0.4, 0.75]) ring(G, steel, 0.02, 0.005, [0, y, -0.03], [HALF, 0, 0], null, TAU, 8);
    rod(G, M(0xe4dcc0, 'cloth'), [0, 0.95, 0], [0.05, 0.56, -0.06], 0.004, 0.004, 4);
    ball(G, M(0xd13a43, 'gloss'), [0.05, 0.5, -0.06], [0.05, 0.06, 0.05]); ball(G, M(WHITE, 'gloss'), [0.05, 0.46, -0.06], [0.047, 0.04, 0.047]);
  },

  // ======== むね ========
  badge(g, c) {
    const p = sub(g, stick(BELLY, 0.16, 0.06, 0.016));
    coin(p, M(c, 'gloss'), 0.1, 0.035); ext(p, M(0xfff6d8, 'plastic'), star(0.052, 0.024), 0.012, 0.004, [0, 0, 0.02]);
  },
  heart(g, c) {
    ext(sub(g, stick(BELLY, 0.16, 0.06, 0.028), -0.15), M(c, 'gloss'), heart(0.2), 0.055, 0.024);
  },
  star(g, c) {
    ext(sub(g, stick(BELLY, 0.16, 0.06, 0.026), 0.1), M(c, 'metal'), star(0.125, 0.06), 0.05, 0.02);
  },
  sheriff(g, c) {
    const p = sub(g, stick(BELLY, 0.16, 0.06, 0.022)), m = M(c, 'metal');
    ext(p, m, star(0.135, 0.078, 6), 0.036, 0.013);
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * TAU; dot(p, m, [Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0], 0.022); }
    ring(p, m, 0.058, 0.008, [0, 0, 0.02], null, null, TAU, 16); coin(p, M(0xfff6d8, 'plastic'), 0.045, 0.02, [0, 0, 0.018]);
  },
  rosette(g, c) {
    const p = sub(g, stick(BELLY, 0.16, 0.08, 0.02)), m = M(c, 'plastic', { roughness: 0.45 }), lite = M(tint(c, 0.1), 'plastic', { roughness: 0.45 });
    const frill = (R, n) => { const s = new THREE.Shape(); for (let i = 0; i <= n * 4; i += 1) { const a = (i / (n * 4)) * TAU, k = R * (1 + 0.1 * Math.cos(a * n)); if (i) s.lineTo(Math.sin(a) * k, Math.cos(a) * k); else s.moveTo(Math.sin(a) * k, Math.cos(a) * k); } return s; };
    for (const s of [-1, 1]) ext(p, M(tint(c, -0.08), 'plastic', { roughness: 0.45 }), poly([[-0.035, 0], [0.035, 0], [0.04, -0.24], [0, -0.2], [-0.04, -0.24]]), 0.012, 0.004, [s * 0.03, -0.03, -0.012], [0, 0, s * 0.24]);
    ext(p, m, frill(0.115, 12), 0.022, 0.008); ext(p, lite, frill(0.082, 10), 0.02, 0.007, [0, 0, 0.016]);
    coin(p, M(CREAM, 'gloss'), 0.048, 0.03, [0, 0, 0.034]);
  },
  corsage(g, c) {
    const p = sub(g, stick(BELLY, 0.16, 0.1, 0.012)), green = M(0x4f8f5a, 'cloth', { roughness: 0.6 });
    for (const a of [2.4, -2.6]) ext(p, green, leaf(0.17, 0.065), 0.012, 0.004, [0, -0.02, 0], [0, 0, a]);
    const f = grp(p, [0, 0.02, 0.012], [HALF, 0, 0]);
    blossom(f, c, 0xfff0b0, 0.085, 6); blossom(grp(f, [0, 0.02, 0], [0, 0.5, 0]), tint(c, 0.08), 0xfff0b0, 0.05, 5);
  },
  pocket(g, c) {
    const p = sub(g, stick(BELLY, 0.16, 0.0, 0.016));
    rbox(p, M(c, 'cloth'), 0.21, 0.21, 0.03, 0.035, [0, -0.02, 0]);
    rbox(p, M(tint(c, -0.12), 'cloth'), 0.22, 0.06, 0.036, 0.02, [0, 0.065, 0.004]);
    rod(p, M(0xf2b544, 'plastic'), [-0.045, 0.05, 0.012], [-0.045, 0.19, 0.012], 0.016, 0.016, 6); rod(p, M(0xf4d9b0, 'cloth'), [-0.045, 0.19, 0.012], [-0.045, 0.22, 0.012], 0.016, 0.003, 6); dot(p, M(INK, 'cloth'), [-0.045, 0.222, 0.012], 0.006);
    rod(p, M(0x3d8fd1, 'plastic'), [0.03, 0.05, 0.012], [0.03, 0.18, 0.012], 0.014, 0.014, 6); dot(p, M(0x3d8fd1, 'plastic'), [0.03, 0.18, 0.012], 0.014); rbox(p, M(0xd8dde3, 'metal'), 0.012, 0.08, 0.008, 0.004, [0.03, 0.12, 0.028]);
  },
  medal(g, c) {
    const loop = neckLoop(-0.02, { rx: 0.2, lift: 0.014 }), end = loop[0], m = M(c, 'metal');
    tube(g, M(0xc0453f, 'plastic', { roughness: 0.5 }), loop, 0.04, { seg: 40, rad: 6, closed: true, flat: [0, -0.37, 0.22] });
    const p = grp(g, [0, end[1] - 0.11, end[2] + 0.025]);
    ring(p, m, 0.03, 0.008, [0, 0.11, -0.005], null, null, TAU, 12);
    coin(p, m, 0.115, 0.04); ring(p, m, 0.105, 0.012, [0, 0, 0.012], null, null, TAU, 24);
    ext(p, M(tint(c, 0.14), 'metal'), star(0.06, 0.028), 0.014, 0.005, [0, 0, 0.022]);
  },
  pendant(g, c) {
    const loop = neckLoop(0.0, { rx: 0.2, lift: 0.012 }), end = loop[0], gold = M(0xd8c070, 'metal');
    tube(g, gold, loop, 0.008, { seg: 40, rad: 5, closed: true });
    const p = grp(g, [0, end[1] - 0.08, end[2] + 0.02]);
    ring(p, gold, 0.018, 0.006, [0, 0.07, 0], null, null, TAU, 10);
    put(p, new THREE.OctahedronGeometry(1), M(c, 'gloss', { flatShading: true }), null, null, [0.07, 0.09, 0.04]);
    ring(p, gold, 1, 0.14, null, null, [0.074, 0.094, 0.05], TAU, 4);
  },
  beads(g, c) {
    const curve = new THREE.CatmullRomCurve3(neckLoop(0.02, { rx: 0.23, lift: 0.03 }).map((p) => V(p[0], p[1], p[2])), true), n = 30;
    for (let i = 0; i < n; i += 1) { const p = curve.getPointAt(i / n); dot(g, M(i % 2 ? c : tint(c, 0.18), 'gloss'), [p.x, p.y, p.z], 0.036); }
  },
  lei(g, c) {
    const curve = new THREE.CatmullRomCurve3(neckLoop(-0.1, { rx: 0.3, lift: 0.05, yBack: 0.26 }).map((p) => V(p[0], p[1], p[2])), true), n = 22;
    const petals = [c, 0xfff0b0, tint(c, 0.15), 0xffffff];
    for (let i = 0; i < n; i += 1) {
      const p = curve.getPointAt(i / n), m = M(petals[i % 4], 'cloth', { roughness: 0.6 });
      dot(g, m, [p.x, p.y, p.z], [0.075, 0.062, 0.062]);
      dot(g, M(0xf7d354, 'cloth', { roughness: 0.6 }), [p.x * 1.07, p.y + 0.012, -0.37 + (p.z + 0.37) * 1.1 + (p.z > -0.37 ? 0.03 : -0.03)], 0.026);
    }
  },
  whistle(g, c) {
    const loop = neckLoop(0.02, { rx: 0.2, lift: 0.012 }), end = loop[0], m = M(c, 'metal');
    tube(g, M(0x3d8fd1, 'cloth'), loop, 0.011, { seg: 40, rad: 5, closed: true });
    const p = grp(g, [0, end[1] - 0.085, end[2] + 0.05]);
    ring(p, m, 0.022, 0.006, [-0.03, 0.065, 0], null, null, TAU, 10);
    rod(p, m, [-0.03, 0, -0.04], [-0.03, 0, 0.04], 0.062, 0.062, 16);
    rbox(p, m, 0.16, 0.05, 0.07, 0.02, [0.06, 0.036, 0]);
    rbox(p, M(INK, 'cloth'), 0.05, 0.012, 0.05, 0.005, [0.03, 0.062, 0]);
  },
  camera(g, c) {
    const loop = neckLoop(0.0, { rx: 0.21, lift: 0.014 }), end = loop[0], m = M(c, 'plastic', { roughness: 0.5 }), steel = M(0xd8dde3, 'metal');
    tube(g, M(0x2a2d33, 'cloth'), loop, 0.03, { seg: 40, rad: 6, closed: true, flat: [0, -0.37, 0.25] });
    const p = grp(g, [0, end[1] - 0.12, end[2] + 0.075]);
    rbox(p, m, 0.36, 0.23, 0.13, 0.05, null); rbox(p, steel, 0.36, 0.05, 0.132, 0.02, [0, 0.08, 0]);
    rbox(p, m, 0.12, 0.06, 0.1, 0.02, [0, 0.135, 0]);
    lat(p, M(0x2a2d33, 'plastic'), [[0.0005, 0], [0.095, 0], [0.095, 0.07], [0.08, 0.1], [0.07, 0.1]], 20, [0, -0.01, 0.06], [HALF, 0, 0]);
    ring(p, steel, 0.085, 0.01, [0, -0.01, 0.15], null, null, TAU, 20); diskZ(p, M(0x3a5f8a, 'gloss'), 0.068, 0.01, [0, -0.01, 0.155], 18);
    rod(p, M(0xd13a43, 'plastic'), [0.12, 0.11, 0], [0.12, 0.135, 0], 0.024, 0.024, 10);
    rbox(p, M(0xfff6d8, 'gloss'), 0.06, 0.035, 0.01, 0.01, [-0.12, 0.075, 0.068]);
  },
  binoculars(g, c) {
    const loop = neckLoop(0.0, { rx: 0.21, lift: 0.014 }), end = loop[0], m = M(c, 'plastic', { roughness: 0.5 }), dark = M(tint(c, -0.14), 'plastic');
    tube(g, M(STRAP, 'leather'), loop, 0.026, { seg: 40, rad: 6, closed: true, flat: [0, -0.37, 0.25] });
    const p = grp(g, [0, end[1] - 0.14, end[2] + 0.07], [0.5, 0, 0]);
    for (const s of [-1, 1]) {
      const b = grp(p, [s * 0.085, 0, 0], [HALF, 0, 0]);
      lat(b, m, [[0.0005, -0.1], [0.05, -0.1], [0.055, -0.02], [0.08, 0.04], [0.082, 0.13], [0.07, 0.14]], 16);
      ring(b, dark, 0.052, 0.012, [0, -0.1, 0], [HALF, 0, 0], null, TAU, 14); ring(b, dark, 0.078, 0.012, [0, 0.13, 0], [HALF, 0, 0], null, TAU, 16);
      put(b, new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), M(0x7fc8e8, 'gloss'), [0, 0.13, 0]);
    }
    rbox(p, dark, 0.1, 0.07, 0.08, 0.02, [0, 0.0, 0]); rod(p, dark, [0, 0, -0.04], [0, 0, 0.05], 0.024, 0.024, 10);
  },
  bell(g, c) {
    const m = M(c, 'metal'), z = BELLY.C[2] + 0.31;
    belt(g, M(0xc0453f, 'leather'), BELLY, { y: 0.21, rx: 0.33, rz: 0.3, h: 0.075, t: 0.022 });
    ring(g, m, 0.028, 0.008, [0, 0.17, z + 0.02], null, null, TAU, 10);
    ball(g, m, [0, 0.1, z + 0.03], [0.09, 0.085, 0.085]);
    ring(g, M(tint(c, -0.1), 'metal'), 0.09, 0.008, [0, 0.1, z + 0.03], [HALF, 0, 0], null, TAU, 20);
    rbox(g, M(0x2a2d33, 'cloth'), 0.1, 0.016, 0.03, 0.006, [0, 0.055, z + 0.096]); dot(g, M(0x2a2d33, 'cloth'), [0, 0.055, z + 0.1], 0.016);
  },
  scarf(g, c) {
    const m = M(c, 'knit'), dark = M(tint(c, -0.07), 'knit');
    belt(g, m, BELLY, { y: 0.2, rx: 0.34, rz: 0.31, h: 0.17, t: 0.085 });
    belt(g, dark, BELLY, { y: 0.27, rx: 0.3, rz: 0.275, h: 0.12, t: 0.07 });
    const z = surfZ(BELLY, 0.16, 0.1);
    ball(g, dark, [0.15, 0.17, z + 0.075], [0.085, 0.075, 0.06]);
    put(g, warp(extGeo(rrect(0.17, 0.4, 0.03), 0.055, 0.02), (v) => { v.z += surfZ(BELLY, v.x + 0.17, v.y - 0.03) + 0.035; }), m, [0.17, -0.03, 0]);
    for (let i = 0; i < 5; i += 1) rod(g, dark, [0.11 + i * 0.03, -0.22, surfZ(BELLY, 0.17, -0.22) + 0.035], [0.11 + i * 0.03, -0.285, surfZ(BELLY, 0.17, -0.28) + 0.035], 0.011, 0.011, 5);
  },
  bowtie(g, c) {
    const s = new THREE.Shape(); s.moveTo(0, 0.035); s.bezierCurveTo(0.08, 0.05, 0.16, 0.13, 0.21, 0.11); s.quadraticCurveTo(0.235, 0, 0.21, -0.11); s.bezierCurveTo(0.16, -0.13, 0.08, -0.05, 0, -0.035);
    s.bezierCurveTo(-0.08, -0.05, -0.16, -0.13, -0.21, -0.11); s.quadraticCurveTo(-0.235, 0, -0.21, 0.11); s.bezierCurveTo(-0.16, 0.13, -0.08, 0.05, 0, 0.035);
    const p = grp(g, [0, 0.185, surfZ(BELLY, 0, 0.185) + 0.045], [-0.3, 0, 0]);
    put(p, warp(extGeo(s, 0.055, 0.022), (v) => { v.z -= v.x * v.x * 0.9; }), M(c, 'plastic', { roughness: 0.45 }));
    rbox(p, M(tint(c, -0.14), 'plastic', { roughness: 0.45 }), 0.075, 0.095, 0.085, 0.03, [0, 0, 0.004]);
  },
  tie(g, c) {
    const m = M(c, 'plastic', { roughness: 0.5 });
    put(g, hug(extGeo(poly([[-0.036, 0.15], [0.036, 0.15], [0.078, -0.2], [0, -0.3], [-0.078, -0.2]]), 0.024, 0.009), BELLY, 0.02), m);
    const y = 0.19, p = grp(g, [0, y, surfZ(BELLY, 0, y) + 0.035], [-0.3, 0, 0]);
    ext(p, M(tint(c, -0.12), 'plastic', { roughness: 0.5 }), poly([[-0.062, 0.045], [0.062, 0.045], [0.04, -0.05], [-0.04, -0.05]]), 0.05, 0.02);
  },
  apron(g, c) {
    const m = M(c, 'sheet'), dark = M(tint(c, -0.16), 'cloth');
    const zAt = (x, y) => surfZ(BELLY, x, Math.max(y, -0.14)) + 0.022 + Math.max(0, -0.14 - y) * 0.12;
    put(g, sheetGeo(12, 14, (u, v) => {
      const w = 0.17 + 0.21 * Math.min(1, Math.max(0, (v - 0.26) / 0.1)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (v - 0.26) / 0.1))) + 0.04 * v;
      const x = u * w, y = 0.24 - 0.84 * v; return [x, y, zAt(x, y) + 0.008 * Math.sin(u * 7) * Math.max(0, v - 0.5)];
    }), m);
    belt(g, dark, BELLY, { y: -0.04, k: 1.075, h: 0.07, t: 0.014 });
    put(g, warp(extGeo(rrect(0.24, 0.17, 0.04), 0.012, 0.004), (v) => { v.z += zAt(v.x, v.y - 0.36) + 0.012; }), M(tint(c, -0.09), 'cloth'), [0, -0.36, 0]);
    tube(g, M(c, 'cloth'), neckLoop(0.22, { rx: 0.17, lift: 0.02 }), 0.02, { seg: 32, rad: 5, closed: true });
  },
  zip(g, c) {
    const m = M(c, 'sheet'), steel = M(0xd8dde3, 'metal', { side: THREE.DoubleSide });
    shell(g, m, BELLY, 1.06, HALF - 1.4, HALF + 1.4, 0.72, 2.25, 20, 10);
    shell(g, M(tint(c, -0.1), 'sheet'), BELLY, 1.07, HALF - 1.4, HALF + 1.4, 2.12, 2.27, 20, 1);
    shell(g, M(tint(c, -0.1), 'sheet'), BELLY, 1.085, HALF - 1.1, HALF + 1.1, 0.66, 0.84, 16, 2);            // えり
    shell(g, steel, BELLY, 1.068, HALF - 0.035, HALF + 0.035, 0.84, 2.14, 1, 10);
    for (const s of [-1, 1]) shell(g, M(tint(c, -0.1), 'sheet'), BELLY, 1.07, HALF + s * 0.62 - 0.26, HALF + s * 0.62 + 0.26, 1.78, 1.84, 6, 1);
    rbox(g, M(0xd8dde3, 'metal'), 0.035, 0.07, 0.014, 0.012, [0, 0.2, surfZ(BELLY, 0, 0.2) + 0.05]);
  },
  sash(g, c) {
    belt(g, M(c, 'plastic', { roughness: 0.5 }), BELLY, { k: 1.045, h: 0.17, t: 0.012, tilt: [0, 0, -0.78], rx: 0.48, rz: 0.378 });
    belt(g, M(GOLD, 'metal'), BELLY, { k: 1.05, h: 0.19, t: 0.008, tilt: [0, 0, -0.78], rx: 0.482, rz: 0.38 }).scale.set(1, 0.12, 1);
    const p = sub(g, stick(BELLY, 0.26, -0.34, 0.04));
    coin(p, M(GOLD, 'metal'), 0.105, 0.04); ext(p, M(0xfff1c2, 'plastic'), star(0.055, 0.026), 0.014, 0.005, [0, 0, 0.022]);
  },
};

// はね（wings・angel）。羽を 2 まい かさねる。
function featherWings(g, c, k, root, sweep, lift) {
  both(g, (h) => {
    const w = grp(h, root, [0, sweep, lift], k), m = M(c, 'plastic', { roughness: 0.62 });
    put(w, extGeo(featherShape(1), 0.045, 0.02, 3), m);
    put(w, extGeo(featherShape(0.68), 0.04, 0.018, 3), M(tint(c, -0.05), 'plastic', { roughness: 0.62 }), [0, 0.03, -0.03]);
    put(w, extGeo(featherShape(0.4), 0.04, 0.018, 2), M(tint(c, -0.09), 'plastic', { roughness: 0.62 }), [0, 0.04, -0.055]);
  });
}

// ---- 1 つの 品を「材質ごとに 1 まい」に まとめる ----
function compact(root) {
  root.updateMatrixWorld(true);
  const by = new Map();
  root.traverse((o) => { if (o.isMesh) { if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(o); } });
  const out = [], v = V(0, 0, 0), nm = new THREE.Matrix3();
  for (const [material, list] of by) {
    let nv = 0, ni = 0;
    for (const m of list) { const q = m.geometry; nv += q.attributes.position.count; ni += q.index ? q.index.count : q.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const m of list) {
      const q = m.geometry, P = q.attributes.position, N = q.attributes.normal, U = q.attributes.uv, mw = m.matrixWorld, flip = mw.determinant() < 0;
      nm.getNormalMatrix(mw);
      for (let i = 0; i < P.count; i += 1) {
        v.fromBufferAttribute(P, i).applyMatrix4(mw); pos.set([v.x, v.y, v.z], (vo + i) * 3);
        if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3); }
        if (U) uv.set([U.getX(i), U.getY(i)], (vo + i) * 2);
      }
      const n = q.index ? q.index.count : P.count, at = (k) => (q.index ? q.index.getX(k) : k);
      for (let k = 0; k + 2 < n; k += 3) { idx[io] = vo + at(k); idx[io + 1] = vo + at(k + (flip ? 2 : 1)); idx[io + 2] = vo + at(k + (flip ? 1 : 2)); io += 3; }
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingBox(); geo.computeBoundingSphere();
    out.push({ geo, material });
  }
  return out;
}

const PROTO = new Map();   // kind:色 → まとめた 品（null ＝ 作れなかった）
const SHAPES = new Map();  // kind → まとめた 形。色ちがいで 分けあう
// kind の リアルな 品。知らない kind・作れなかった ときは null（＝ 箱の 形に もどる）。
export function realModel(kind, colour) {
  if (!Object.prototype.hasOwnProperty.call(REAL, kind)) return null;
  const key = `${kind}:${colour}`;
  if (!PROTO.has(key)) {
    let proto = null;
    try {
      const tmp = new THREE.Group(); REAL[kind](tmp, colour);
      const parts = compact(tmp), known = SHAPES.get(kind);
      const same = known && known.length === parts.length && known.every((q, i) => q.attributes.position.count === parts[i].geo.attributes.position.count && q.index.count === parts[i].geo.index.count);
      if (!same) SHAPES.set(kind, parts.map((p) => p.geo));
      proto = new THREE.Group();
      parts.forEach((p, i) => { const mesh = new THREE.Mesh(same ? known[i] : p.geo, p.material); mesh.castShadow = !p.material.transparent; proto.add(mesh); });
      if (!parts.length) proto = null;
    } catch { proto = null; }
    PROTO.set(key, proto);
  }
  const proto = PROTO.get(key);
  return proto ? proto.clone() : null;
}
export const REAL_KINDS = Object.keys(REAL);
