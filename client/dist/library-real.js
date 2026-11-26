// としょかん（外がわ）— メインの島の ひろばの となりに 立つ、れんがの 大きな 図書館（2026-11）。
//
// 「超リアル。でも 重く しない」：real-house.js と 同じ 考えかた。
// - もようは canvas の 絵（れんが・しまの 石・かわら・石）。**れんが 1 こより こまかい もようは かかない**（ひくい 解像度だと 砂ぼこりに 見える）。
// - アーチは ほんものの 形（Shape の absarc を 板に して、あなを あける）。箱で ごまかさない。
// - 材質ごとに 1 メッシュ（れんが・しまの かべ・石・かわら・ガラス・木や 鉄・しき石＝7 回の 描画）。光は 足さない。
//   まどの ガラスは emissive（ふだんは 0）。`lit` を island-kit の setNight に わたすと 夜に 灯る。
// - モデルの ファイルは 読まない。document が ない（Node の テスト）ときは もようなしで 形だけ 作る。
//
// 下の ほうの 部品（tex・plate・createBatch など）は library-interior.js も 使う。
import * as THREE from './three.module.js';

/* ───────── 小さな 道具 ───────── */

export function tex(w, h, paint, { repeat = true, aniso = 4 } = {}) {
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); paint(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso; return t;
  } catch { return null; }
}
export function rng(seed = 7) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

// れんがを つむ。色は (だん・列) から きめる＝はしで つながる。pattern(だん, 半れんがの 位置) が 色の 番号を 返せば もようづみ。
export function paintBricks(g, X, Y, W, H, rows, cols, pal, mortar, { pattern = null, seed = 1 } = {}) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  g.fillStyle = mortar; g.fillRect(X, Y, W, H);
  const bh = H / rows, bw = W / cols, m = Math.max(1.6, bh * 0.1);
  for (let r = 0; r < rows; r += 1) for (let c = -1; c < cols; c += 1) {
    const off = r % 2 ? bw / 2 : 0, cc = ((c % cols) + cols) % cols;
    const pick = pattern ? pattern(r, cc * 2 + (r % 2)) : null;
    g.fillStyle = pick != null ? pick : pal[Math.floor(hash(r + seed * 3.1, cc + seed) * pal.length)];
    const x = X + c * bw + off + m / 2, y = Y + r * bh + m / 2;
    g.fillRect(x, y, bw - m, bh - m);
    const l = hash(r * 1.7 + seed, cc * 2.3) - 0.5;
    g.fillStyle = l > 0 ? `rgba(255,236,210,${l * 0.14})` : `rgba(60,20,10,${-l * 0.14})`; g.fillRect(x, y, bw - m, bh - m);
    g.fillStyle = 'rgba(255,240,220,0.07)'; g.fillRect(x, y, bw - m, (bh - m) * 0.3);
    g.fillStyle = 'rgba(40,12,6,0.10)'; g.fillRect(x, y + (bh - m) * 0.78, bw - m, (bh - m) * 0.22);
  }
  g.restore();
}
// 大きく やわらかい しみ（こまかい 点は 打たない）。
export function blotches(g, X, Y, W, H, n, rnd, dark = '70,40,25', light = '255,240,215', a = 0.06) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  for (let i = 0; i < n; i += 1) {
    const x = X + rnd() * W, y = Y + rnd() * H, r = (0.08 + rnd() * 0.16) * Math.max(W, H);
    for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${rnd() > 0.5 ? dark : light},${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  g.restore();
}

const col = new THREE.Color();
function bake(geo, hex) {
  col.set(hex); const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) col.toArray(a, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
const flat = (g) => { const f = g.index ? g.toNonIndexed() : g; if (f !== g) g.dispose(); return f; };

// もようが 建物の 大きさで のびない ように、置いた あとの 位置から UV を ひく（かべ＝よこは かべに そって・たては 高さ）。
export function worldUV(g, ku, kv = ku, v0 = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    if (Math.abs(ny) > 0.75) { uv[i * 2] = x * ku; uv[i * 2 + 1] = z * ku; } else {
      const h = Math.hypot(nx, nz) || 1; uv[i * 2] = ((x * nz - z * nx) / h) * ku; uv[i * 2 + 1] = (y - v0) * kv;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

// 材質ごとに ためて、さいごに 1 メッシュずつに する。
export function createBatch(rules = {}) {
  const parts = {};
  function add(key, geo, { color = 0xffffff, uv = null } = {}) {
    const g = flat(geo), rule = rules[key];
    if (!g.attributes.normal) g.computeVertexNormals();
    if (uv !== 'keep' && rule) worldUV(g, rule[0], rule[1], rule[2] || 0);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    bake(g, color); (parts[key] ||= []).push(g); return g;
  }
  function geometry(key) {
    const list = parts[key]; if (!list?.length) return null;
    let nv = 0; for (const p of list) nv += p.attributes.position.count;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), cl = new Float32Array(nv * 3);
    let v = 0;
    for (const p of list) {
      pos.set(p.attributes.position.array, v * 3); nor.set(p.attributes.normal.array, v * 3); uv.set(p.attributes.uv.array, v * 2); cl.set(p.attributes.color.array, v * 3);
      v += p.attributes.position.count; p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    parts[key] = []; return g;
  }
  // mats＝{ key: material }。shadow に ない key は かげを 落とさない（ガラス・光）。
  function flush(root, mats, { noShadow = [] } = {}) {
    let tris = 0; const meshes = {};
    for (const key of Object.keys(parts)) {
      const g = geometry(key); if (!g || !mats[key]) continue;
      const mesh = new THREE.Mesh(g, mats[key]); const sh = !noShadow.includes(key);
      mesh.castShadow = sh; mesh.receiveShadow = sh; mesh.name = `lib-${key}`; root.add(mesh); meshes[key] = mesh; tris += g.attributes.position.count / 3;
    }
    return { tris, meshes };
  }
  return { add, flush, geometry };
}

/* ───────── 形 ───────── */

// まるい アーチの あな（下の まんなかが (cx, y0)・はば w・高さ h）。
export function archPath(cx, y0, w, h, Ctor = THREE.Path) {
  const r = w / 2, ys = y0 + h - r, p = new Ctor();
  p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, ys); p.absarc(cx, ys, r, 0, Math.PI, false); p.lineTo(cx - r, y0);
  return p;
}
export const archShape = (cx, y0, w, h) => archPath(cx, y0, w, h, THREE.Shape);
// アーチの ふち（石の わく）：はば t。sill が true なら 下も とじる。
export function archRing(cx, y0, w, h, t) {
  const r = w / 2, R = r + t, ys = y0 + h - r, s = new THREE.Shape();
  s.moveTo(cx + R, y0); s.lineTo(cx + R, ys); s.absarc(cx, ys, R, 0, Math.PI, false); s.lineTo(cx - R, y0);
  s.lineTo(cx - r, y0); s.lineTo(cx - r, ys); s.absarc(cx, ys, r, Math.PI, 0, true); s.lineTo(cx + r, y0); s.lineTo(cx + R, y0);
  return s;
}
export function rectShape(x0, y0, x1, y1) { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0); return s; }
export function circlePath(cx, cy, r, Ctor = THREE.Path) { const p = new Ctor(); p.absarc(cx, cy, r, 0, Math.PI * 2, false); return p; }
// 小さな アーチが ならぶ おび（ロンバルディア帯）。上が y＝H、アーチの 足が y＝0。
export function corbelShape(len, pitch = 0.7, band = 0.2, foot = 0.16) {
  const n = Math.max(1, Math.round(len / pitch)), p = len / n, r = (p - foot) / 2, H = r + band, s = new THREE.Shape();
  s.moveTo(0, H); s.lineTo(0, 0);
  for (let i = 0; i < n; i += 1) { const cx = (i + 0.5) * p; s.lineTo(cx - r, 0); s.absarc(cx, 0, r, Math.PI, 0, true); }
  s.lineTo(len, 0); s.lineTo(len, H); s.lineTo(0, H);
  return s;
}

// Shape を あつみの ある 板に する。前の 面は z＝0（+z むき）、ふちと あなの 内がわは z＝-depth まで。うしろの 面は 作らない（見えない）。
export function plate(shape, depth, { seg = 10, rim = true } = {}) {
  const ex = shape.extractPoints(seg);
  const clean = (pts) => {
    const out = []; for (const p of pts) { const q = out[out.length - 1]; if (!q || q.distanceToSquared(p) > 1e-9) out.push(p); }
    if (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < 1e-9) out.pop(); return out;
  };
  const c = clean(ex.shape); if (THREE.ShapeUtils.isClockWise(c)) c.reverse();
  const holes = ex.holes.map(clean).map((h) => { if (!THREE.ShapeUtils.isClockWise(h)) h.reverse(); return h; });
  const faces = THREE.ShapeUtils.triangulateShape(c, holes), all = c.concat(...holes);
  const pos = [], nor = [], uv = [];
  for (const f of faces) for (const i of f) { pos.push(all[i].x, all[i].y, 0); nor.push(0, 0, 1); uv.push(all[i].x, all[i].y); }
  const side = (pts) => {
    const n = pts.length, en = [];
    for (let i = 0; i < n; i += 1) { const a = pts[i], b = pts[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; en.push([dy / l, -dx / l]); }
    const vn = (i, e) => { // かどが ゆるければ なめらかに
      const p = en[(i - 1 + n) % n], q = en[i % n]; if (p[0] * q[0] + p[1] * q[1] < 0.8) return en[e];
      const x = p[0] + q[0], y = p[1] + q[1], l = Math.hypot(x, y) || 1; return [x / l, y / l];
    };
    let run = 0;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i], b = pts[(i + 1) % n], na = vn(i, i), nb = vn(i + 1, i), l = a.distanceTo(b);
      const V = (p, z, nn, u) => { pos.push(p.x, p.y, z); nor.push(nn[0], nn[1], 0); uv.push(u, z); };
      V(a, 0, na, run); V(a, -depth, na, run); V(b, -depth, nb, run + l);
      V(a, 0, na, run); V(b, -depth, nb, run + l); V(b, 0, nb, run + l);
      run += l;
    }
  };
  if (rim) side(c);
  holes.forEach(side);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

// 箱（まんなかが x・z、下が y0）。
export function box(x, y0, z, w, h, d) { const g = flat(new THREE.BoxGeometry(w, h, d)); g.translate(x, y0 + h / 2, z); return g; }
// 円柱（下が y0）。UV は まわり＝周の 長さ・たて＝高さ（k を かける）。
export function cyl(x, y0, z, rTop, rBot, h, seg = 10, k = 0.3) {
  const g = flat(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1));
  const uv = g.attributes.uv, c = Math.PI * (rTop + rBot); for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * c * k, uv.getY(i) * h * k);
  g.translate(x, y0 + h / 2, z); return g;
}
// n 角の 柱（面は たいら）。apo＝まんなかから 面まで。面は +z から 45° きざみ（n＝8 の とき）。
export function prism(n, x, y0, z, apo0, apo1, h, cap = true) {
  const k = 1 / Math.cos(Math.PI / n), c = new THREE.CylinderGeometry(apo1 * k, apo0 * k, h, n, 1, !cap); c.rotateY(Math.PI / n);
  const g = flat(c); g.computeVertexNormals(); g.translate(x, y0 + h / 2, z); return g;
}
// 2 点を むすぶ 角材。
export function beam(a, b, w, h) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv), g = flat(new THREE.BoxGeometry(w, h, len));
  const m = new THREE.Matrix4().lookAt(A, Bv, new THREE.Vector3(0, 1, 0)); m.setPosition(A.clone().add(Bv).multiplyScalar(0.5)); g.applyMatrix4(m); return g;
}
// かたむいた 屋根の 面（3 点か 4 点）。UV は よこ＝水平・たて＝のぼる むき（k＝1 あたりの くりかえし）。
export function slope(points, k) {
  const P = points.map((p) => new THREE.Vector3(...p));
  let n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
  if (n.y < 0) { P.reverse(); n.negate(); }
  const u = new THREE.Vector3(n.z, 0, -n.x).normalize(), v = new THREE.Vector3().crossVectors(u, n); if (v.y < 0) v.negate();
  const pos = [], nor = [], uv = [];
  for (let i = 1; i < P.length - 1; i += 1) for (const p of [P[0], P[i], P[i + 1]]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(p.dot(u) * k, p.dot(v) * k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}
// 四角い 板（XY 面・+z むき）。UV は 大きさ × k。
export function quad(x0, y0, x1, y1, z = 0, k = 1) {
  const g = flat(new THREE.PlaneGeometry(x1 - x0, y1 - y0)); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (x1 - x0) * k, uv.getY(i) * (y1 - y0) * k);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z); return g;
}
export const mat4 = (x, y, z, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);

/* ───────── もよう ───────── */

const BRICK = ['#c9683c', '#c05b34', '#d27745', '#bb5431', '#cc6e40', '#c7623a', '#ad4c2d', '#c96a3e', '#d0703f'];
const MORTAR = '#d9c3a2';
const CREAM = '#ecdcb9';

let shared = null;
function materials() {
  if (shared) return shared;
  const rnd = rng(23);
  // れんが：512px ＝ よこ 4.8（6 こ）× たて 4.0（16 だん）。
  const brick = tex(512, 512, (g, W, H) => { paintBricks(g, 0, 0, W, H, 24, 9, BRICK, MORTAR, { seed: 2 }); blotches(g, 0, 0, W, H, 10, rnd, '80,30,15', '255,225,190', 0.07); });
  // しまの かべ：れんが 3 だん＋クリーム色の 石の おび。512px ＝ よこ 3.2 × たて 2.4（2 くみ）。下から れんが → 石。
  const banded = tex(512, 512, (g, W, H) => {
    for (let i = 0; i < 2; i += 1) {
      const y = H - (i + 1) * 256;                         // この くみの 上
      paintBricks(g, 0, y + 96, W, 160, 4, 6, BRICK, MORTAR, { seed: 5 + i });
      const gr = g.createLinearGradient(0, y, 0, y + 96); gr.addColorStop(0, '#f1e3c3'); gr.addColorStop(0.85, CREAM); gr.addColorStop(1, '#d6c39d');
      g.fillStyle = gr; g.fillRect(0, y, W, 96);
      g.fillStyle = 'rgba(120,95,60,0.22)'; for (let j = 0; j < 2; j += 1) g.fillRect(((j + i * 0.5) * W) / 2 + 40, y + 2, 2.5, 92);
      g.fillStyle = 'rgba(110,80,50,0.25)'; g.fillRect(0, y, W, 2.5);
    }
    blotches(g, 0, 0, W, H, 8, rnd, '90,50,25', '255,235,205', 0.06);
  });
  // 石（クリーム色の 切り石）：256px ＝ 3 × 3。
  const stone = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#f0e3c6'; g.fillRect(0, 0, W, H);
    blotches(g, 0, 0, W, H, 16, rnd, '150,120,80', '255,250,235', 0.09);
    g.fillStyle = 'rgba(120,95,60,0.20)';
    for (let r = 0; r < 4; r += 1) { g.fillRect(0, r * 64, W, 2); for (let c = 0; c < 2; c += 1) g.fillRect(c * 128 + (r % 2 ? 64 : 0), r * 64, 2, 64); }
  });
  // かわら（まるい 素焼きの かわら）：256px ＝ よこ 8 本 × たて 4 だん ＝ 3.6 × 3.6。
  const tile = tex(256, 256, (g, W, H) => {
    const cw = W / 8, rh = H / 4, T = ['#c25a34', '#b84f2e', '#cc6a3d', '#bd5631', '#c9643a', '#b04a2b', '#d27444'];
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 8; c += 1) {
      const x = c * cw, y = r * rh;
      g.fillStyle = T[Math.floor(hash(r + 9, c * 3 + r) * T.length)]; g.fillRect(x, y, cw, rh);
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, 'rgba(50,15,8,0.55)'); gr.addColorStop(0.22, 'rgba(50,15,8,0.05)'); gr.addColorStop(0.5, 'rgba(255,225,190,0.22)'); gr.addColorStop(0.8, 'rgba(50,15,8,0.08)'); gr.addColorStop(1, 'rgba(50,15,8,0.55)');
      g.fillStyle = gr; g.fillRect(x, y, cw, rh);
      const gv = g.createLinearGradient(0, y, 0, y + rh); gv.addColorStop(0, 'rgba(40,12,6,0.0)'); gv.addColorStop(0.8, 'rgba(40,12,6,0.0)'); gv.addColorStop(0.93, 'rgba(255,220,190,0.14)'); gv.addColorStop(1, 'rgba(40,12,6,0.5)');
      g.fillStyle = gv; g.fillRect(x, y, cw, rh);
    }
    blotches(g, 0, 0, W, H, 8, rnd, '60,25,15', '255,215,170', 0.07);
  });
  // ガラスの 鉛の わく（こうし）。夜は この もようの まま 光る。
  const lead = tex(128, 128, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 2; c += 1) { g.fillStyle = `rgba(120,150,170,${0.1 + hash(r, c) * 0.3})`; g.fillRect(c * 64, r * 32, 64, 32); }
    g.fillStyle = '#39424a'; for (let i = 0; i < 2; i += 1) g.fillRect(i * 64 - 3, 0, 6, H); for (let i = 0; i < 4; i += 1) g.fillRect(0, i * 32 - 2, W, 4);
  });
  // しき石：れんがの ますと クリーム色の 石の こうし。512px ＝ 4 × 4。
  const paving = tex(512, 512, (g, W, H) => {
    const P = ['#b9694a', '#ad5f43', '#c27552', '#b56446', '#a85a40'];
    paintBricks(g, 0, 0, W, H, 16, 8, P, '#9c7f68', { seed: 9 });
    g.fillStyle = '#e4d6b8'; g.fillRect(0, 0, W, 36); g.fillRect(0, 0, 36, H);
    g.fillStyle = 'rgba(110,90,60,0.25)'; g.fillRect(0, 36, W, 2); g.fillRect(36, 0, 2, H); for (let i = 1; i < 4; i += 1) { g.fillRect(i * 128 + 36, 0, 2, 36); g.fillRect(0, i * 128 + 36, 36, 2); }
    blotches(g, 0, 0, W, H, 10, rnd, '70,50,35', '255,240,215', 0.06);
  });
  const M = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...o });
  shared = {
    brick: M({ map: brick, roughness: 0.93, color: brick ? 0xffffff : 0xc4663c }),
    banded: M({ map: banded, roughness: 0.92, color: banded ? 0xffffff : 0xd69a6c }),
    stone: M({ map: stone, roughness: 0.88, color: stone ? 0xffffff : 0xece0c4 }),
    tile: M({ map: tile, roughness: 0.78, color: tile ? 0xffffff : 0xbe5a34 }),
    plain: M({ roughness: 0.7 }),
    paving: M({ map: paving, roughness: 0.9, color: paving ? 0xffffff : 0xb9795a }),
    glass: new THREE.MeshStandardMaterial({ color: 0x35454f, map: lead, roughness: 0.22, metalness: 0.35, emissive: new THREE.Color(0xffc56e), emissiveMap: lead, emissiveIntensity: 0 }),
  };
  return shared;
}
// 1 あたりの くりかえし（よこ・たて・たての はじまり）。
const RULES = { brick: [1 / 4.5, 1 / 4.08], banded: [1 / 3.0, 1 / 2.4, 0.8], stone: [1 / 3, 1 / 3], paving: [1 / 4, 1 / 4] };
const TILE_K = 1 / 3.6;

/* ───────── 建物 ───────── */

// 高さ（下から）：土台 0.8・しまの 1 かい 0.8〜4.4・おび・れんがの 2 かい 4.7〜8.3・小アーチの おび・のき 9.1。
const Y = { pl: 0.8, s0: 4.4, s1: 4.7, cb: 8.3, ev: 8.9, top: 9.1 };
const T = 0.45;                 // かべの あつみ（まどの おくゆき）
const STONE_D = 0xd9cdb4, STONE_L = 0xffffff, IRON = 0x2b2a2c, OAK = 0x6b4326, COPPER = 0x5f8f7c;

export function buildLibraryExterior({ w = 30, d = 16, forecourt = 9 } = {}) {
  const M = materials(), B = createBatch(RULES), group = new THREE.Group(); group.name = 'library';
  const hx = w / 2, zb = -d / 2, zf = zb + d * 0.72, zp = zf + 2, zs = d / 2;   // うしろ・そでの 前・げんかんの 前・だんの 先
  const pw = 4.5;                                                                // げんかんの はばの 半分
  const put = (m) => (key, g, o) => B.add(key, g.applyMatrix4(m), o);

  // アーチの まど 1 つ（あな・ガラス・石の わく・まどだい・たての さん）。P＝その かべの 置き方。
  function archWindow(P, wall, cx, y0, ww, hh, { seg = 10, ring = 0.15, bar = true, sill = true } = {}) {
    wall.holes.push(archPath(cx, y0, ww, hh));
    P('glass', quad(cx - ww / 2 - 0.05, y0 - 0.05, cx + ww / 2 + 0.05, y0 + hh + 0.05, -T + 0.06, 1 / 0.62), { uv: 'keep' });
    if (ring) { const r = plate(archRing(cx, y0, ww, hh, ring), 0.09, { seg }); r.translate(0, 0, 0.07); P('stone', r); }
    if (sill) P('stone', box(cx, y0 - 0.16, 0.06, ww + ring * 2 + 0.2, 0.16, 0.34));
    if (bar) { P('plain', box(cx, y0, -T + 0.12, 0.07, hh - 0.05, 0.06), { color: IRON }); P('plain', box(cx, y0 + hh - ww / 2 - 0.04, -T + 0.12, ww, 0.07, 0.06), { color: IRON }); }
  }

  // そでの かべ 1 まい（x＝0〜len、+z が 外）。bays＝まどの 列。
  function wingWall(m, len, { bays, lower = true, upper = true, seg = 8, plainBack = false }) {
    const P = put(m), pitch = len / bays;
    const lo = rectShape(0, Y.pl, len, Y.s0), up = rectShape(0, Y.s1 - 0.02, len, Y.cb + 0.3);
    for (let i = 0; i < bays; i += 1) {
      const cx = (i + 0.5) * pitch;
      if (lower) {       // 2 れんの 小さな アーチ（アーケード）と まんなかの 小さな 柱
        for (const dx of [-0.43, 0.43]) archWindow(P, lo, cx + dx, 2.0, 0.6, 1.65, { seg: 6, ring: 0.1, bar: false, sill: false });
        P('stone', box(cx, 1.84, 0.06, 1.9, 0.16, 0.34));
        P('stone', cyl(cx, 2.0, -0.12, 0.085, 0.085, 1.3, 6)); P('stone', box(cx, 3.3, -0.12, 0.26, 0.1, 0.3));
      }
      if (upper) archWindow(P, up, cx, 5.35, 1.12, 2.45, { seg, bar: !plainBack });
    }
    P('banded', plate(lo, T, { seg: 6, rim: false })); P('brick', plate(up, T, { seg, rim: false }));
    // かべの おく（まどの うら）を ふさぐ くらい 板は ガラスが かねる。はしらがた（れんがの たての おび）。
    for (let i = 0; i <= bays; i += 1) {
      const x = Math.min(len - 0.27, Math.max(0.27, i * pitch));
      P('banded', box(x, Y.pl, 0.08, 0.54, Y.s0 - Y.pl, 0.16)); P('brick', box(x, Y.s1, 0.08, 0.54, Y.cb - Y.s1 + 0.12, 0.16));
    }
    P('stone', box(len / 2, Y.s0, 0.07, len, Y.s1 - Y.s0, 0.3));                         // 1 かいと 2 かいの あいだの 石の おび
    P('stone', box(len / 2, 0, 0.12, len + 0.24, 0.62, 0.3), { color: STONE_D }); P('stone', box(len / 2, 0.62, 0.07, len + 0.14, 0.18, 0.2));   // 土台
    const cb = plate(corbelShape(len, plainBack ? 1.0 : 0.72, 0.24), 0.17, { seg: 4 }); cb.translate(0, Y.cb, 0.17); P('stone', cb);   // 小アーチの おび
    P('brick', box(len / 2, Y.cb - 0.02, 0.005, len, 0.62, 0.02), { color: 0x9a8676 });  // アーチの おくの かげ
    P('stone', box(len / 2, Y.ev, 0.16, len + 0.3, 0.12, 0.42)); P('stone', box(len / 2, Y.ev + 0.1, 0.24, len + 0.5, 0.12, 0.58), { color: STONE_D });   // のきの くりかた
  }

  // ── そで（左右）・よこ・うしろ ──
  wingWall(mat4(pw, 0, zf), hx - pw, { bays: 5 });
  wingWall(mat4(-hx, 0, zf), hx - pw, { bays: 5 });
  wingWall(mat4(hx, 0, zf, Math.PI / 2), zf - zb, { bays: 5 });
  wingWall(mat4(-hx, 0, zb, -Math.PI / 2), zf - zb, { bays: 5 });
  wingWall(mat4(hx, 0, zb, Math.PI), w, { bays: 10, lower: false, seg: 6, plainBack: true });

  // ── そでの 寄棟屋根（かわら）──
  const zc = (zb + zf) / 2, ov = 0.5, run = (zf - zb) / 2 + ov, rise = 2.25, ex = hx + ov, rx = ex - run, ry = Y.top + rise;
  B.add('tile', slope([[-ex, Y.top, zc + run], [ex, Y.top, zc + run], [rx, ry, zc], [-rx, ry, zc]], TILE_K), { uv: 'keep' });
  B.add('tile', slope([[ex, Y.top, zc - run], [-ex, Y.top, zc - run], [-rx, ry, zc], [rx, ry, zc]], TILE_K), { uv: 'keep' });
  for (const s of [-1, 1]) {
    B.add('tile', slope([[s * ex, Y.top, zc + run], [s * ex, Y.top, zc - run], [s * rx, ry, zc]], TILE_K), { uv: 'keep' });
    for (const f of [-1, 1]) B.add('tile', beam([s * ex, Y.top + 0.05, zc + f * run], [s * rx, ry + 0.08, zc], 0.3, 0.2), { color: 0xb8a69a, uv: 'keep' });
  }
  B.add('tile', beam([-rx, ry + 0.08, zc], [rx, ry + 0.08, zc], 0.34, 0.22), { color: 0xb8a69a, uv: 'keep' });
  B.add('stone', box(0, Y.top - 0.08, zc, w + 0.7, 0.1, zf - zb + 0.7), { color: STONE_D });      // のきうら

  // ── まんなかの げんかん（前に 出た 切妻の かべ）──
  const pe = 9.7, pk = 12.1;                              // のきの 高さ・切妻の てっぺん
  {
    const P = put(mat4(-pw, 0, zp)), L = pw * 2, cx = pw;
    // 1 かい：しまの かべに 大きな アーチの 入り口。
    const lo = rectShape(0, Y.pl, L, Y.s0); lo.holes.push(archPath(cx, Y.pl + 0.004, 2.8, 3.346));
    P('banded', plate(lo, T, { seg: 14, rim: false }));
    const r1 = plate(archRing(cx, Y.pl, 2.8, 3.35, 0.32), 0.14, { seg: 14 }); r1.translate(0, 0, 0.1); P('stone', r1);
    // おくへ せばまる アーチ（2 だん）と とびら。
    const o2 = archRing(cx, Y.pl, 2.3, 3.1, 0.5);
    const g2 = plate(o2, 0.4, { seg: 14 }); g2.translate(0, 0, -T); P('stone', g2, { color: 0xf2e6cf });
    const o3 = archRing(cx, Y.pl, 1.9, 2.9, 0.5);
    const g3 = plate(o3, 0.4, { seg: 14 }); g3.translate(0, 0, -T - 0.4); P('brick', g3);
    for (const s of [-1, 1]) for (const [r, zz] of [[1.27, -T + 0.12], [1.05, -T - 0.28]]) {     // わきの 小さな 柱
      P('stone', cyl(cx + s * r, Y.pl, zz, 0.1, 0.1, 1.9, 8)); P('stone', box(cx + s * r, Y.pl + 1.9, zz, 0.3, 0.12, 0.3));
    }
    const dz = -T - 0.78;
    P('plain', quad(cx - 1.0, Y.pl, cx + 1.0, Y.pl + 2.0, dz, 1), { color: OAK });                 // とびら（2 まい）
    for (const s of [-1, 1]) {
      for (const [px, py, pww, ph] of [[0.5, 0.2, 0.7, 0.75], [0.5, 1.1, 0.7, 0.75]]) P('plain', box(cx + s * px, Y.pl + py, dz + 0.02, pww, ph, 0.04), { color: 0x7c5030 });
      P('plain', box(cx + s * 0.1, Y.pl + 1.0, dz + 0.06, 0.07, 0.3, 0.07), { color: 0xd3ac57 });
      for (const hy of [0.35, 1.65]) P('plain', box(cx + s * 0.66, Y.pl + hy, dz + 0.05, 0.6, 0.07, 0.03), { color: IRON });
    }
    P('plain', box(cx, Y.pl, dz + 0.03, 0.06, 2.0, 0.06), { color: 0x3d2616 }); P('stone', box(cx, Y.pl + 2.0, dz + 0.02, 2.1, 0.14, 0.12));
    const fan = new THREE.Shape(); fan.absarc(cx, Y.pl + 2.14, 0.9, 0, Math.PI, false); fan.lineTo(cx + 0.9, Y.pl + 2.14);   // とびらの 上の 半円の まど
    const fg = plate(fan, 0.02, { seg: 12, rim: false }); fg.translate(0, 0, dz); P('glass', fg, { uv: 'keep' });
    for (let i = 1; i < 4; i += 1) { const a = (i * Math.PI) / 4; P('plain', beam([cx, Y.pl + 2.14, dz + 0.03], [cx + Math.cos(a) * 0.9, Y.pl + 2.14 + Math.sin(a) * 0.9, dz + 0.03], 0.05, 0.05), { color: IRON, uv: 'keep' }); }
    P('plain', quad(cx - 1.5, Y.pl, cx + 1.5, Y.pl + 3.5, dz - 0.02), { color: 0x30231c });       // おくの かげ

    // 2 かいから 切妻：3 つの 高い アーチの まど・まるい ばら窓。
    const up = new THREE.Shape(); up.moveTo(0, Y.s1 - 0.02); up.lineTo(L, Y.s1 - 0.02); up.lineTo(L, pe); up.lineTo(cx, pk); up.lineTo(0, pe); up.lineTo(0, Y.s1 - 0.02);
    for (const dx of [-2.05, 0, 2.05]) archWindow(P, up, cx + dx, 5.4, 1.25, 2.95, { seg: 12, ring: 0.18 });
    const ry0 = 9.95, rr = 0.92;
    up.holes.push(circlePath(cx, ry0, rr));
    P('brick', plate(up, T, { seg: 12, rim: false }));
    const rg = flat(new THREE.CircleGeometry(rr + 0.05, 20)); rg.translate(cx, ry0, -T + 0.06);
    { const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3.4, uv.getY(i) * 3.4); }
    P('glass', rg, { uv: 'keep' });
    const ring = new THREE.Shape(); ring.absarc(cx, ry0, rr + 0.22, 0, Math.PI * 2, false); ring.holes.push(circlePath(cx, ry0, rr));
    const rgp = plate(ring, 0.12, { seg: 20 }); rgp.translate(0, 0, 0.09); P('stone', rgp);
    const tr = new THREE.Shape(); tr.absarc(cx, ry0, rr + 0.02, 0, Math.PI * 2, false); tr.holes.push(circlePath(cx, ry0, 0.26));   // ばら窓の 石の ほね
    for (let i = 0; i < 8; i += 1) { const a = (i * Math.PI) / 4 + Math.PI / 8; tr.holes.push(circlePath(cx + Math.cos(a) * 0.62, ry0 + Math.sin(a) * 0.62, 0.21)); }
    const trp = plate(tr, 0.1, { seg: 8, rim: false }); trp.translate(0, 0, -T + 0.2); P('stone', trp);
    P('stone', box(cx, Y.s0, 0.07, L, Y.s1 - Y.s0, 0.3));
    P('stone', box(cx, 8.78, 0.05, L, 0.16, 0.2));                                                 // ばら窓の 下の 石の おび
    P('stone', box(cx, 0, 0.12, L + 0.24, 0.62, 0.3), { color: STONE_D }); P('stone', box(cx, 0.62, 0.07, L + 0.14, 0.18, 0.2));
    // 切妻の ふち：ななめの 小アーチの おび（かたむけた 板）と 石の かさ。
    const sl = (pk - pe) / pw;
    for (const s of [-1, 1]) {
      const c = plate(corbelShape(pw - 0.75, 0.62, 0.2), 0.15, { seg: 5 }); c.translate(0.72, 0, 0);
      const sh = new THREE.Matrix4().set(s, 0, 0, s > 0 ? 0 : L, sl, 1, 0, pe - 0.72, 0, 0, 1, 0.15, 0, 0, 0, 1);
      c.applyMatrix4(sh); if (s < 0) { const p = c.attributes.position, nn = c.attributes.normal; for (let i = 0; i < p.count; i += 3) { for (const a of [p, nn]) { const t = [a.getX(i), a.getY(i), a.getZ(i)]; a.setXYZ(i, a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)); a.setXYZ(i + 1, ...t); } } }
      c.computeVertexNormals(); P('stone', c);
      P('stone', beam([s > 0 ? -0.3 : L + 0.3, pe - 0.12, 0.02], [cx, pk + 0.08, 0.02], 0.62, 0.3), { uv: 'keep' });
    }
    P('stone', box(cx, pk + 0.1, 0.02, 0.5, 0.4, 0.5)); P('stone', cyl(cx, pk + 0.5, 0.02, 0.0, 0.2, 0.7, 4), { uv: 'keep' });   // てっぺんの かざり
    for (const x of [0.36, L - 0.36]) {                                                             // かどの ひかえ柱
      P('banded', box(x, Y.pl, 0.11, 0.72, Y.s0 - Y.pl, 0.22)); P('brick', box(x, Y.s1, 0.11, 0.72, pe - Y.s1 - 0.5, 0.22)); P('stone', box(x, pe - 0.5, 0.11, 0.84, 0.22, 0.3));
    }
  }
  // げんかんの よこの かべ と 屋根（切妻・うしろの とうまで）。
  for (const s of [-1, 1]) {
    B.add('banded', box(s * (pw - 0.25), Y.pl, (zp + zc) / 2 - 0.02, 0.5, Y.s0 - Y.pl, zp - zc));
    B.add('stone', box(s * (pw - 0.2), Y.s0, (zp + zf) / 2, 0.6, Y.s1 - Y.s0, zp - zf));
    B.add('brick', box(s * (pw - 0.25), Y.s1, (zp + zc) / 2 - 0.02, 0.5, pe - Y.s1, zp - zc));
    B.add('stone', box(s * (pw - 0.05), pe - 0.08, (zp + zc) / 2, 0.5, 0.2, zp - zc + 0.2), { color: STONE_D });
    B.add('stone', box(s * (pw + 0.06), 0, (zp + zf) / 2 + 0.1, 0.3, 0.62, zp - zf + 0.2), { color: STONE_D });
    const e = pw + 0.45, ey = pe + 0.1, ky = pe + 0.1 + (e * (pk - pe)) / pw;
    B.add('tile', slope([[s * e, ey, zp - 0.12], [s * e, ey, zc], [0, ky, zc], [0, ky, zp - 0.12]], TILE_K), { uv: 'keep' });
  }
  B.add('tile', beam([0, pe + 0.1 + ((pw + 0.45) * (pk - pe)) / pw + 0.06, zp - 0.1], [0, pe + 0.1 + ((pw + 0.45) * (pk - pe)) / pw + 0.06, zc], 0.34, 0.22), { color: 0xb8a69a, uv: 'keep' });

  // ── 入り口の だん（広い 石の だん・わきの かべ）──
  const sw = 6.6, top = 0.75;
  B.add('stone', box(0, 0, zp + 0.35, sw, Y.pl, top + 0.02));
  B.add('stone', box(0, 0, zp - 0.75, 3.2, Y.pl, 1.5), { color: STONE_D });      // 入り口の おくの ゆか
  const n = 4, sd = (zs - zp - top) / n;
  for (let i = 0; i < n; i += 1) B.add('stone', box(0, 0, zp + top + sd * (i + 0.5), sw, Y.pl - (Y.pl / n) * (i + 1) + 0.0001 + (i === n - 1 ? 0 : 0), sd + 0.02), { color: i % 2 ? 0xf4ecda : STONE_L });
  for (const s of [-1, 1]) {
    const x = s * (sw / 2 + 0.3);
    B.add('banded', box(x, 0, zp + 0.6, 0.6, 1.5, 1.2)); B.add('stone', box(x, 1.5, zp + 0.6, 0.74, 0.16, 1.34));
    B.add('banded', box(x, 0, (zp + 1.2 + zs) / 2, 0.6, 0.85, zs - zp - 1.2)); B.add('stone', box(x, 0.85, (zp + 1.2 + zs) / 2 + 0.02, 0.74, 0.14, zs - zp - 1.2 + 0.1));
    const ball = flat(new THREE.SphereGeometry(0.26, 10, 7)); ball.translate(x, 1.9, zp + 0.6); B.add('stone', ball, { uv: 'keep' });
  }

  // ── 八角の とう（ランタン）──
  const ta = 3.7, tw = 2 * ta * Math.tan(Math.PI / 8), ty0 = 9.0, ty1 = 15.3;
  for (let i = 0; i < 8; i += 1) {
    const th = (i * Math.PI) / 4, m = mat4(0, 0, zc, th).multiply(mat4(-tw / 2, 0, ta)), P = put(m);
    const wall = rectShape(0, ty0, tw, ty1);
    archWindow(P, wall, tw / 2, 11.75, 1.3, 2.6, { seg: 10, ring: 0.16 });
    P('brick', plate(wall, T, { seg: 10, rim: false }));
    P('stone', box(tw / 2, 11.25, 0.05, tw + 0.1, 0.2, 0.2));
    const cb = plate(corbelShape(tw, 0.76, 0.2), 0.15, { seg: 4 }); cb.translate(0, ty1 - 0.56, 0.15); P('stone', cb);
    P('brick', box(tw / 2, ty1 - 0.58, 0.005, tw, 0.58, 0.02), { color: 0x9a8676 });
    P('stone', cyl(0, 11.45, 0.02, 0.17, 0.17, ty1 - 11.45 - 0.5, 6));                              // かどの 小さな 柱
  }
  B.add('stone', prism(8, 0, ty1, zc, ta + 0.34, ta + 0.44, 0.24), { color: STONE_D });
  const rc = (ta + 0.75) / Math.cos(Math.PI / 8), tr0 = ty1 + 0.24, tr1 = tr0 + 2.2;
  for (let i = 0; i < 8; i += 1) {
    const a0 = ((i - 0.5) * Math.PI) / 4, a1 = ((i + 0.5) * Math.PI) / 4;
    B.add('tile', slope([[Math.sin(a0) * rc, tr0, zc + Math.cos(a0) * rc], [Math.sin(a1) * rc, tr0, zc + Math.cos(a1) * rc], [0, tr1, zc]], TILE_K), { uv: 'keep' });
    B.add('tile', beam([Math.sin(a0) * rc, tr0 + 0.04, zc + Math.cos(a0) * rc], [0, tr1 + 0.04, zc], 0.22, 0.16), { color: 0xb8a69a, uv: 'keep' });
  }
  B.add('stone', prism(8, 0, tr0 - 0.02, zc, ta + 0.75, ta + 0.75, 0.06), { color: STONE_D });
  // てっぺんの 小さな あずまや（光る しん・8 本の 柱・とんがり屋根・かざり）。
  const cy = tr1 - 0.45;
  B.add('stone', prism(8, 0, cy, zc, 0.78, 0.74, 0.22));
  B.add('glass', cyl(0, cy + 0.2, zc, 0.36, 0.36, 1.05, 8, 1.6), { uv: 'keep' });
  for (let i = 0; i < 8; i += 1) { const a = (i * Math.PI) / 4 + Math.PI / 8; B.add('stone', cyl(Math.sin(a) * 0.62, cy + 0.2, zc + Math.cos(a) * 0.62, 0.075, 0.075, 1.05, 6)); }
  B.add('stone', prism(8, 0, cy + 1.25, zc, 0.8, 0.86, 0.16));
  const cr = 1.0 / Math.cos(Math.PI / 8), c0 = cy + 1.41, c1 = c0 + 1.0;
  for (let i = 0; i < 8; i += 1) {
    const a0 = ((i - 0.5) * Math.PI) / 4, a1 = ((i + 0.5) * Math.PI) / 4;
    B.add('tile', slope([[Math.sin(a0) * cr, c0, zc + Math.cos(a0) * cr], [Math.sin(a1) * cr, c0, zc + Math.cos(a1) * cr], [0, c1, zc]], TILE_K * 1.6), { uv: 'keep' });
  }
  { const ball = flat(new THREE.SphereGeometry(0.17, 8, 6)); ball.translate(0, c1 + 0.12, zc); B.add('plain', ball, { color: COPPER }); }
  B.add('plain', cyl(0, c1 + 0.2, zc, 0.0, 0.07, 0.75, 6), { color: COPPER });

  // ── わきの 細い とう（1 本だけ）──
  const tx = -(pw + 0.95), tz = zf + 0.75, sa = 0.88, sTop = 12.3;
  B.add('stone', prism(8, tx, 0, tz, sa + 0.14, sa + 0.14, 0.62), { color: STONE_D });
  B.add('banded', prism(8, tx, 0.62, tz, sa, sa, Y.s0 - 0.62, false));
  B.add('brick', prism(8, tx, Y.s0, tz, sa, sa, sTop - Y.s0, false));
  for (const [yy, hh] of [[Y.s0, 0.3], [Y.top - 0.1, 0.22], [10.9, 0.18]]) B.add('stone', prism(8, tx, yy, tz, sa + 0.08, sa + 0.08, hh));
  B.add('stone', prism(8, tx, sTop, tz, sa + 0.1, sa + 0.24, 0.24), { color: STONE_D });
  for (let i = 0; i < 8; i += 1) {                         // 上の かいの 小さな アーチの あな と、前の 面の ほそい まど
    const th = (i * Math.PI) / 4, P = put(mat4(tx, 0, tz, th).multiply(mat4(0, 0, sa)));
    const a = plate(archRing(0, 11.15, 0.3, 0.8, 0.07), 0.05, { seg: 6 }); a.translate(0, 0, 0.04); P('stone', a);
    P('glass', quad(-0.15, 11.15, 0.15, 11.95, 0.02, 2), { uv: 'keep' });
    if (i === 0 || i === 1 || i === 7) for (const yy of [2.3, 5.8, 8.1]) P('plain', box(0, yy, 0.0, 0.16, 0.8, 0.04), { color: 0x2a2623 });
  }
  const sr = (sa + 0.36) / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i += 1) {
    const a0 = ((i - 0.5) * Math.PI) / 4, a1 = ((i + 0.5) * Math.PI) / 4;
    B.add('tile', slope([[tx + Math.sin(a0) * sr, sTop + 0.24, tz + Math.cos(a0) * sr], [tx + Math.sin(a1) * sr, sTop + 0.24, tz + Math.cos(a1) * sr], [tx, sTop + 2.6, tz]], TILE_K * 1.5), { uv: 'keep' });
  }
  { const ball = flat(new THREE.SphereGeometry(0.14, 8, 6)); ball.translate(tx, sTop + 2.66, tz); B.add('plain', ball, { color: COPPER }); }

  // ── 前の ひろば（れんがと 石の こうしの しき石）。forecourt＝おくゆき（0 で なし）──
  if (forecourt > 0) B.add('paving', box(0, -0.04, zs + forecourt / 2, w, 0.1, forecourt));

  const { tris } = B.flush(group, M, { noShadow: ['glass'] });
  if (group.children.length) { const pv = group.children.find((c) => c.name === 'lib-paving'); if (pv) { pv.castShadow = false; group.userData.forecourt = pv; } }
  const glow = 1.25;
  return {
    group,
    lit: [{ material: M.glass, glow }],
    door: { x: 0, z: zp },                                   // とびらの 前（だんの 上）
    footprint: { w, d },
    steps: { x: 0, z0: zp, z1: zs, w: sw, h: Y.pl, count: n },
    // 当たり判定（半分の はば・おくゆき）。入り口の アーチと だんの 上は あけて ある。
    obstacles: [
      { x: 0, z: zc, w: hx + 0.3, d: (zf - zb) / 2 + 0.3 },
      { x: -(pw + 1.5) / 2 - 0.05, z: (zf + zp) / 2, w: (pw - 1.5) / 2 + 0.2, d: 1.2 },
      { x: (pw + 1.5) / 2 + 0.05, z: (zf + zp) / 2, w: (pw - 1.5) / 2 + 0.2, d: 1.2 },
      { x: -(sw / 2 + 0.3), z: (zp + zs) / 2, w: 0.4, d: (zs - zp) / 2 },
      { x: sw / 2 + 0.3, z: (zp + zs) / 2, w: 0.4, d: (zs - zp) / 2 },
      { x: tx, z: tz, w: 1.05, d: 1.05 },
    ],
    height: { wings: ry, pavilion: pk + 0.9, tower: c1 + 0.95 },
    tris,
    update() {},
  };
}
