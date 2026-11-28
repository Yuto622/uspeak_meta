// 高級な お店の 3D（2026-11）— 「こういう 高級服屋、家具屋。も 3D モデル 作成」（「超リアル」「重く ならない ように」）。
//
// buildBoutique()          … 「MAISON U ふくの おみせ」。石の 外かべ・アーチの 木の 戸・ランタン・大きな ショーウインドー（シャンデリア・
//                             黒い ドレスの マネキン・バッグの たな・-50% の 札）・ツタの プランター・鉢の 木・かさたて・ポスターの 台・石だたみと 街灯。
//                             中は 2 かい（おくに 中2かい・こげ茶の 木の かいだん）。右＝エレガント（ドレス・バッグ・くつ・鏡・試着室）、
//                             左＝ストリート（れんがと グラフィティ・黒い ラック・たたんだ Tシャツの たな・ぼうしの 頭・ガラスの ケース・レジ）。
// buildFurnitureShowroom() … 「ROYAL HOME かぐの おみせ」。黒い みかげ石と 金の 外がわ・ひさし・金の 文字・赤い じゅうたんと ロープ。
//                             中は 黒と 金の かべ・赤い じゅうたん・チェスターフィールドの ソファ・金の がく・たんす・シャンデリア・まるい カウンター・
//                             リビング／しんしつ（天がいの ベッド）／ダイニングの 見本の へや。
// どちらも { group, obstacles, door, entrance, setNight(n), update(t), triangles, materials } を かえす。原点は 建物の まんなかの 地面、+z が 正面（道）。
// obstacles は island-kit と 同じ { x, z, w, d }（w・d は 半分）。**どの 島にも まだ 置いて いない**。見本は /dev-shops.html。
//
// 重く しない きまり（client/CLAUDE.md）：材質ごとに 1 メッシュ（createBatch）、たくさんの 同じ 形は InstancedMesh、光は 0（emissive と 加算の 板だけ）、
// もようは canvas（try/catch＝Node の テストでは もようなしで 形だけ）、もようは 2 つの お店で 共有して 1 回だけ 作る、毎フレーム 何も 作らない、
// シェーダーに 回数の かわる ループは なし、鏡・映りこみの 描画は しない（映りこみは 焼いた 景色の 絵）。
// リアルに 見せる しかけ：
// ・かべ・床・石＝12 本の もようの 帯（1 まいの 絵）。明るさから でこぼこと つや、ダマスクの 金の もようだけ 金属に（ぴかっと 光る）。
//   部屋の あかり（ダウンライトの 光の 輪・かべの 光の 弧）と かどの くらさ（AO）は 位置の 式で（光を 足さない）。
// ・金・真鍮＝金属の 材質に 焼いた 部屋の 景色（ランプの 光の 点）＝するどい ハイライト。黒い うるし＝つやの 材質。
// ・ぬの＝ビロードの ふち光り（角度で 明るく）、チェスターフィールドの ボタンじめ（ひし形の ふくらみ・ボタンの くぼみ）は 式で。
//   つるした 服は ひだの ある 形、ドレスは すその ひだ、たたんだ Tシャツは InstancedMesh で 色ちがい。
// ・ガラス＝1 回で 描く シェーダー（フレネル・外は 道の 景色・夜は くらく、中は 部屋の 景色、鏡、クリスタル、ランタンの ガラス）。
// ・シャンデリアの きらめき＝加算の 点（Points・時間で またたく）。人は mall-real.js と 同じ つくりの 人（ここで 小さく 作りなおし）。
import * as THREE from './three.module.js';
import { tex, rng, createBatch, box, cyl, beam, prism, plate, archRing, archShape, archPath, rectShape, paintBricks } from './library-real.js';

const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif';
const SERIF = '"Cormorant Garamond","Playfair Display",Georgia,"Times New Roman","Noto Serif JP",serif';
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const now = () => (globalThis.performance?.now?.() ?? Date.now());
const hash = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/* ───────── 形の 道具 ───────── */

function uvCell(g, c) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, c[0] + uv.getX(i) * (c[2] - c[0]), c[1] + uv.getY(i) * (c[3] - c[1]));
  return g;
}
// 世界の UV（m）：よこの 面は (x, z)、たての 面は（かべに そった 長さ, 高さ − v0）。
function wuv(g, ku, kv = ku, v0 = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    if (Math.abs(ny) > 0.75) { uv[i * 2] = x * ku; uv[i * 2 + 1] = z * kv; } else {
      const h = Math.hypot(nx, nz) || 1; uv[i * 2] = ((x * nz - z * nx) / h) * ku; uv[i * 2 + 1] = (y - v0) * kv;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// 木目の 向き（axis）を u に する UV。
function grainUV(g, axis, ku, kv) {
  const A = { x: 0, y: 1, z: 2 }[axis], p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < p.count; i += 1) {
    P[0] = p.getX(i); P[1] = p.getY(i); P[2] = p.getZ(i); Nn[0] = Math.abs(n.getX(i)); Nn[1] = Math.abs(n.getY(i)); Nn[2] = Math.abs(n.getZ(i));
    const na = Nn[0] > Nn[1] ? (Nn[0] > Nn[2] ? 0 : 2) : (Nn[1] > Nn[2] ? 1 : 2);
    let ca = [0, 1, 2].find((k) => k !== A && k !== na); if (na === A) ca = (A + 1) % 3;
    uv[i * 2] = P[A] * ku; uv[i * 2 + 1] = P[ca] * kv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
const strip = (g, s) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) + s * 100); return g; };
const shiftU = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) + k); return g; };
const ni = (g) => { if (g.index) { const f = g.toNonIndexed(); g.dispose(); return f; } return g; };
function ell(x, y, z, rx, ry, rz, ws = 10, hs = 6, th = Math.PI) { const g = new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, th); g.scale(rx, ry, rz); g.translate(x, y, z); return ni(g); }
function limb(a, b, r0, r1, seg = 8, open = false) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize())); g.translate(A.x, A.y, A.z); return ni(g);
}
// ろくろ（[r, y] の ならび）。sz＝おくゆきの つぶし。
function lathe(pts, seg = 16, sz = 1, { closeTop = false } = {}) {
  const P = pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  if (closeTop) P.push(new THREE.Vector2(0.0001, pts[pts.length - 1][1]));
  const g = ni(new THREE.LatheGeometry(P, seg)); if (sz !== 1) { g.scale(1, 1, sz); g.computeVertexNormals(); } return g;
}
function torus(R, r, rs = 6, ts = 24, arc = TAU) { return ni(new THREE.TorusGeometry(R, r, rs, ts, arc)); }
// 曲がった 棒（点の ならび）。
function tube(points, r, seg = 12, rs = 5) { return ni(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, rs, false)); }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x = 0, y = 0, z = 0, ry = 0, s = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ry), V3(s, s, s));
// 床に ねかせた 板（uv 0〜1 → cell）。
function floorQuad(x, y, z, w, d, cell, rot = 0) { const g = new THREE.PlaneGeometry(w, d).toNonIndexed(); g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(x, y, z); return uvCell(g, cell); }
// たての 板（+z むき・下が y0）。
function wallQuad(w, h, cell) { const g = new THREE.PlaneGeometry(w, h).toNonIndexed(); g.translate(0, h / 2, 0); return cell ? uvCell(g, cell) : g; }

/* ───────── もようの 道具 ───────── */

function fit(g, text, x, y, maxW, size, color, weight = 900, align = 'center', font = FONT) {
  g.font = `${weight} ${size}px ${font}`; const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((size * maxW) / w)}px ${font}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function soft(g, X, Y, W, H, n, rnd, a, r0 = 0.08, r1 = 0.25) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  for (let i = 0; i < n; i += 1) {
    const x = X + rnd() * W, y = Y + rnd() * H, r = (r0 + rnd() * (r1 - r0)) * Math.max(W, H), l = rnd() > 0.5 ? 255 : 0;
    for (const ox of [-W, 0, W]) { const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r); gr.addColorStop(0, `rgba(${l},${l},${l},${a})`); gr.addColorStop(1, `rgba(${l},${l},${l},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2); }
  }
  g.restore();
}
function grain(g, X, Y, W, H, n, rnd, a, size = 1.6) {
  for (let i = 0; i < n; i += 1) { const l = rnd() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${l},${l},${l},${a * rnd()})`; const s = 0.6 + rnd() * size; g.fillRect(X + rnd() * W, Y + rnd() * H, s, s); }
}
const goldGrad = (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff1bf'); gr.addColorStop(0.35, '#e3b960'); gr.addColorStop(0.55, '#a8762c'); gr.addColorStop(0.8, '#e6c071'); gr.addColorStop(1, '#8a5e22'); return gr; };

const TEXLOG = new Map();
function track(name, t, mips = true) { if (t?.image) TEXLOG.set(name, (t.image.width * t.image.height * 4 * (mips ? 4 / 3 : 1)) / 1048576); return t; }
// 見本の ページ用：いま 作って ある もようの 合計（MB・ミップマップ込み）。
export function shopTextureMB() { return +[...TEXLOG.values()].reduce((a, b) => a + b, 0).toFixed(2); }

/* ───────── 共有の もよう（2 つの お店で 1 回だけ）───────── */

// もようの 帯（512 × 256 が 12 本）：番号と 1 まいの 大きさ（m）は 使う がわの UV で きめる。
const NSTRIP = 12;
export const STRIP = { stone: 0, brick: 1, walnut: 2, oak: 3, checker: 4, cobble: 5, plaster: 6, marble: 7, damask: 8, carpet: 9, granite: 10, slab: 11 };
// 帯ごとの つや（roughness）と でこぼこの 強さ。
const ROUGH = [0.92, 0.86, 0.38, 0.3, 0.16, 0.7, 0.88, 0.09, 0.55, 0.97, 0.07, 0.72];
const BUMP = [1.5, 1.0, 0.25, 0.3, 0.25, 1.3, 0.15, 0.08, 0.35, 0.6, 0.06, 0.55];

// アトラス（1024 × 512・128 の ます 8 × 4）。[u0, v0, u1, v1]
const cell = (cx, cy, w = 1, h = 1, pad = 0.004) => [cx / 8 + pad, 1 - (cy + h) / 4 + pad * 2, (cx + w) / 8 - pad, 1 - cy / 4 - pad * 2];
const A = {
  mural: cell(0, 0, 4, 2), signB: cell(4, 0, 4, 1), signF: cell(4, 1, 4, 1),
  rose: cell(0, 2, 1, 2), land: cell(1, 2, 2, 1), poster: cell(1, 3, 1, 1), abstract: cell(2, 3, 1, 1), rug: cell(3, 2, 2, 2),
  sale: cell(5, 2), plaque: [5 / 8 + 0.004, 1 - 4 / 4 + 0.135, 6 / 8 - 0.004, 1 - 3 / 4 - 0.008], screen: [5 / 8 + 0.004, 0.008, 6 / 8 - 0.004, 0.115],
  white: cell(6, 2, 1, 1, 0.03), warm: cell(6, 3, 1, 1, 0.03), blob: cell(7, 2, 1, 1, 0.0), streak: cell(7, 3, 1, 1, 0.0),
};

let SH = null;
function shared() {
  if (SH) return SH;
  SH = { surf: surfAtlas(), art: artAtlas(), envI: envInterior(), envE: envExterior(), leaves: leafTexture() };
  return SH;
}
function equirect(t) { if (t) { t.mapping = THREE.EquirectangularReflectionMapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; } return t; }

function surfAtlas() {
  const rnd = rng(311);
  const t = tex(512, 256 * NSTRIP, (g) => {
    const S = (i, paint) => { g.save(); g.beginPath(); g.rect(0, i * 256, 512, 256); g.clip(); g.translate(0, i * 256); paint(512, 256); g.restore(); };
    const wrapX = (W, x, w, draw) => { draw(x); if (x < 0) draw(x + W); if (x + w > W) draw(x - W); };
    const woodLines = (x, y, w, h, n, a, wave = 3, col = '90,50,20') => { for (let k = 0; k < n; k += 1) { const yy = y + rnd() * h, ph = rnd() * 6, amp = rnd() * wave; g.strokeStyle = `rgba(${col},${a * (0.4 + rnd())})`; g.lineWidth = 0.6 + rnd() * 1.2; g.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const v = yy + Math.sin(xx * 0.02 + ph) * amp + Math.sin(xx * 0.07 + ph * 2) * amp * 0.3; if (xx === 0) g.moveTo(x + xx, v); else g.lineTo(x + xx, v); } g.stroke(); } };
    // 0 あらい 石づみ（1.8 × 0.9 m）：大きさの ちがう 石・くぼんだ 目地・ふくらんだ 面。
    S(0, (W, H) => {
      g.fillStyle = '#4e463d'; g.fillRect(0, 0, W, H);
      const rows = [0, 94, 176, 256];
      for (let r = 0; r < 3; r += 1) {
        const y0 = rows[r], y1 = rows[r + 1]; let x = -rnd() * 60; const x0 = x;
        while (x < x0 + W) {
          const w = Math.min(70 + rnd() * 120, x0 + W - x < 90 ? x0 + W - x : 999), base = [[170, 158, 140], [152, 142, 126], [184, 172, 152], [142, 130, 114], [162, 148, 128], [134, 126, 114], [176, 160, 136]][Math.floor(rnd() * 7)];
          const j = () => (rnd() - 0.5) * 6, yA = y0 + 3 + j() * 0.5, yB = y1 - 3 + j() * 0.5, c1 = j(), c2 = j(), c3 = j(), c4 = j();
          wrapX(W, x, w, (xx) => {
            g.save(); g.beginPath();
            g.moveTo(xx + 4 + c1, yA + 2); g.lineTo(xx + w - 4 + c2, yA + c3 * 0.3); g.quadraticCurveTo(xx + w - 1, yA + 1, xx + w - 2 + c2 * 0.3, yA + 8);
            g.lineTo(xx + w - 3 + c3, yB - 6); g.quadraticCurveTo(xx + w - 2, yB, xx + w - 9, yB - 1 + c4 * 0.3); g.lineTo(xx + 7 + c4, yB);
            g.quadraticCurveTo(xx + 2, yB, xx + 3 + c1 * 0.3, yB - 7); g.lineTo(xx + 2 + c4 * 0.5, yA + 8); g.quadraticCurveTo(xx + 2, yA + 2, xx + 4 + c1, yA + 2); g.closePath();
            const k = 0.92 + rnd() * 0.16; g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; g.fill(); g.clip();
            const sh = g.createLinearGradient(xx, yA, xx + w * 0.4, yB); sh.addColorStop(0, 'rgba(255,248,230,0.2)'); sh.addColorStop(0.5, 'rgba(255,248,230,0)'); sh.addColorStop(1, 'rgba(20,14,8,0.28)'); g.fillStyle = sh; g.fillRect(xx, yA, w, yB - yA);
            soft(g, xx, yA, w, yB - yA, 3, rnd, 0.1, 0.15, 0.5); grain(g, xx, yA, w, yB - yA, 260, rnd, 0.16, 1.8);
            for (let q = 0; q < 4; q += 1) { g.strokeStyle = `rgba(40,30,20,${0.08 + rnd() * 0.1})`; g.lineWidth = 1; g.beginPath(); const sx = xx + rnd() * w, sy = yA + rnd() * (yB - yA); g.moveTo(sx, sy); g.lineTo(sx + (rnd() - 0.5) * 18, sy + (rnd() - 0.5) * 8); g.stroke(); }
            g.restore();
          });
          x += w;
        }
      }
      soft(g, 0, 0, W, H, 8, rnd, 0.05);
    });
    // 1 赤い れんが（2 × 1 m）＋ すす。
    S(1, (W, H) => { paintBricks(g, 0, 0, W, H, 14, 9, ['#8e3b28', '#9c4630', '#7f3324', '#a5513a', '#8a3a2a', '#6f2c20', '#99442c', '#b0583e'], '#a99a88', { seed: 9 }); soft(g, 0, 0, W, H, 14, rnd, 0.07); grain(g, 0, 0, W, H, 3500, rnd, 0.12); });
    // 2 こげ茶の くるみ（2 × 1 m・木目は u）：2 まいの 板。
    S(2, (W, H) => {
      for (let r = 0; r < 2; r += 1) {
        const c = [[112, 72, 44], [104, 66, 40]][r]; g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(0, r * 128, W, 128);
        g.save(); g.beginPath(); g.rect(0, r * 128, W, 128); g.clip(); woodLines(0, r * 128, W, 128, 26, 0.2, 5, '50,26,12');
        for (let k = 0; k < 3; k += 1) { const cx = rnd() * W, cy = r * 128 + 20 + rnd() * 88; for (let a = 0; a < 7; a += 1) { g.strokeStyle = `rgba(45,22,10,${0.05 + a * 0.015})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy, 34 + a * 16, 5 + a * 2.6, 0, 0, 7); g.stroke(); } }
        g.restore(); g.fillStyle = 'rgba(30,15,6,0.55)'; g.fillRect(0, r * 128, W, 1.5);
      }
      soft(g, 0, 0, W, H, 8, rnd, 0.05);
    });
    // 3 あかるい オークの 床板（2 × 1 m）。
    S(3, (W, H) => {
      const rows = 6, rh = H / rows, pal = [[196, 160, 118], [186, 150, 108], [204, 170, 128], [178, 142, 102], [192, 156, 112]];
      for (let r = 0; r < rows; r += 1) {
        let x = -((r * 157) % 260);
        while (x < W) {
          const len = 170 + rnd() * 140, c = pal[Math.floor(rnd() * pal.length)];
          g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, r * rh, len, rh);
          g.save(); g.beginPath(); g.rect(x, r * rh, len, rh); g.clip(); woodLines(x, r * rh, len, rh, 9, 0.1, 2.5);
          const sh = g.createLinearGradient(0, r * rh, 0, r * rh + rh); sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(0,0,0,0.06)'); g.fillStyle = sh; g.fillRect(x, r * rh, len, rh);
          g.restore(); g.fillStyle = 'rgba(80,50,25,0.45)'; g.fillRect(x, r * rh, 1.5, rh); x += len;
        }
        g.fillStyle = 'rgba(80,50,25,0.4)'; g.fillRect(0, r * rh, W, 1.2);
      }
      soft(g, 0, 0, W, H, 10, rnd, 0.04);
    });
    // 4 白と うすい 灰色の いちまつ（1 × 0.5 m・0.25 m の タイル）。
    S(4, (W, H) => {
      g.fillStyle = '#9d9a94'; g.fillRect(0, 0, W, H);
      for (let r = 0; r < 2; r += 1) for (let c = 0; c < 4; c += 1) {
        const l = (r + c) % 2 ? [204, 202, 197] : [238, 236, 230], k = 0.97 + rnd() * 0.05; g.fillStyle = `rgb(${l[0] * k | 0},${l[1] * k | 0},${l[2] * k | 0})`; g.fillRect(c * 128 + 1.5, r * 128 + 1.5, 125, 125);
        soft(g, c * 128 + 2, r * 128 + 2, 124, 124, 3, rnd, 0.05, 0.2, 0.5); grain(g, c * 128 + 2, r * 128 + 2, 124, 124, 200, rnd, 0.05);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(c * 128 + 2, r * 128 + 2, 124, 1.5);
      }
    });
    // 5 石だたみ（2 × 1 m）：小さな 四角い 石・ぬれた ような 目地。
    S(5, (W, H) => {
      g.fillStyle = '#2e2b28'; g.fillRect(0, 0, W, H);
      const rows = 10, rh = H / rows;
      for (let r = 0; r < rows; r += 1) {
        let x = (r % 2) * -26 - rnd() * 10; const x0 = x;
        while (x < x0 + W) {
          const w = Math.min(42 + rnd() * 22, Math.max(20, x0 + W - x)), l = 92 + rnd() * 60, w2 = rnd() * 14 - 7;
          wrapX(W, x, w, (xx) => {
            rrect(g, xx + 2, r * rh + 2, w - 4, rh - 4, 6); g.fillStyle = `rgb(${l + w2 | 0},${l - 3 | 0},${l - 8 - w2 | 0})`; g.fill();
            const gr = g.createLinearGradient(0, r * rh, 0, r * rh + rh); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)'); g.fillStyle = gr; g.fill();
          });
          x += w;
        }
      }
      grain(g, 0, 0, W, H, 4000, rnd, 0.15); soft(g, 0, 0, W, H, 10, rnd, 0.06);
    });
    // 6 クリームの ぬりかべ。
    S(6, (W, H) => { g.fillStyle = '#efe8dc'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 14, rnd, 0.035); grain(g, 0, 0, W, H, 2500, rnd, 0.03); });
    // 7 白い 大理石（1.2 × 0.6 m・0.6 m の 板 2 まい）。
    S(7, (W, H) => {
      for (let k = 0; k < 2; k += 1) {
        const X = k * 256; g.fillStyle = '#efede8'; g.fillRect(X, 0, 256, 256);
        g.save(); g.beginPath(); g.rect(X, 0, 256, 256); g.clip();
        soft(g, X, 0, 256, 256, 8, rnd, 0.06, 0.15, 0.4);
        for (let v = 0; v < 9; v += 1) {
          const y0 = rnd() * 256, a = 0.08 + rnd() * 0.25; g.strokeStyle = `rgba(${110 + rnd() * 40},${110 + rnd() * 40},${118 + rnd() * 40},${a})`; g.lineWidth = 0.6 + rnd() * (v < 3 ? 3 : 1.2);
          g.beginPath(); g.moveTo(X - 10, y0); g.bezierCurveTo(X + 60 + rnd() * 40, y0 + (rnd() - 0.5) * 140, X + 150 + rnd() * 40, y0 + (rnd() - 0.5) * 160, X + 266, y0 + (rnd() - 0.5) * 120); g.stroke();
        }
        g.restore(); g.fillStyle = 'rgba(150,145,138,0.55)'; g.fillRect(X, 0, 256, 1.2); g.fillRect(X, 0, 1.2, 256);
      }
    });
    // 8 黒い かべの 金の もよう（1 × 0.5 m）：ゆりの 紋章と 小さな 星。
    S(8, (W, H) => {
      g.fillStyle = '#151214'; g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 16) { g.fillStyle = x % 32 ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 8, H); }
      const fleur = (cx, cy, s) => {
        g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = goldGrad(g, -36, 36); g.strokeStyle = 'rgba(70,45,10,0.8)'; g.lineWidth = 1.4 / s;
        g.beginPath(); g.moveTo(0, -36); g.bezierCurveTo(10, -24, 10, -8, 3, 4); g.lineTo(-3, 4); g.bezierCurveTo(-10, -8, -10, -24, 0, -36); g.fill(); g.stroke();
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 3, 4); g.bezierCurveTo(sx * 10, -6, sx * 24, -14, sx * 26, -2); g.bezierCurveTo(sx * 27, 6, sx * 20, 10, sx * 15, 6); g.bezierCurveTo(sx * 19, 2, sx * 16, -4, sx * 10, 2); g.lineTo(sx * 5, 10); g.closePath(); g.fill(); g.stroke(); }
        g.fillRect(-14, 6, 28, 6); g.strokeRect(-14, 6, 28, 6);
        g.beginPath(); g.moveTo(-6, 12); g.lineTo(0, 30); g.lineTo(6, 12); g.closePath(); g.fill(); g.stroke();
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 4, 12); g.quadraticCurveTo(sx * 16, 16, sx * 14, 26); g.quadraticCurveTo(sx * 9, 18, sx * 2, 16); g.fill(); }
        g.restore();
      };
      const star = (cx, cy, r) => { g.fillStyle = goldGrad(g, cy - r, cy + r); g.beginPath(); for (let i = 0; i < 8; i += 1) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.32 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
      for (let j = 0; j < 2; j += 1) for (let i = 0; i < 4; i += 1) { fleur(64 + i * 128, 64 + j * 128, 1.05); star(i * 128, j * 128, 9); star(i * 128, j * 128 + 256, 9); star(i * 128 + 512, j * 128, 9); }
      grain(g, 0, 0, W, H, 1500, rnd, 0.06);
    });
    // 9 赤い じゅうたん（2 × 1 m）：毛足の ざらつき・同じ 色の ひし形。
    S(9, (W, H) => {
      g.fillStyle = '#7a0f17'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(40,0,4,0.12)'; g.lineWidth = 2; for (let k = -4; k < 8; k += 1) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 256, H); g.stroke(); g.beginPath(); g.moveTo(k * 64 + 256, 0); g.lineTo(k * 64, H); g.stroke(); }
      for (let i = 0; i < 9000; i += 1) { const l = rnd(); g.fillStyle = l > 0.5 ? `rgba(200,60,60,${0.05 + rnd() * 0.08})` : `rgba(30,0,0,${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 2); }
      soft(g, 0, 0, W, H, 12, rnd, 0.05);
    });
    // 10 みがいた 黒い みかげ石（1.2 × 0.6 m）。
    S(10, (W, H) => {
      g.fillStyle = '#1b1a1e'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 10, rnd, 0.05, 0.1, 0.3);
      for (let i = 0; i < 2600; i += 1) { const c = rnd(); g.fillStyle = c < 0.6 ? `rgba(90,88,96,${0.3 + rnd() * 0.4})` : c < 0.9 ? `rgba(10,10,12,0.6)` : `rgba(210,205,200,${0.3 + rnd() * 0.3})`; const s = 0.6 + rnd() * 2.2; g.fillRect(rnd() * W, rnd() * H, s, s); }
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, 1.5); g.fillRect(0, 0, 1.5, H); g.fillRect(256, 0, 1.5, H);
    });
    // 11 歩道の 平らな 石（1.2 × 0.6 m）。
    S(11, (W, H) => {
      g.fillStyle = '#6f6b64'; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 2; k += 1) {
        const l = 158 + rnd() * 18; g.fillStyle = `rgb(${l | 0},${l - 3 | 0},${l - 9 | 0})`; g.fillRect(k * 256 + 2, 2, 252, 252);
        soft(g, k * 256 + 2, 2, 252, 252, 4, rnd, 0.07, 0.15, 0.5); grain(g, k * 256 + 2, 2, 252, 252, 1400, rnd, 0.14, 1.4);
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(k * 256 + 2, 2, 252, 2);
      }
    });
  });
  if (t) { t.anisotropy = 8; }
  return track('surf', t);
}

function artAtlas() {
  const rnd = rng(77);
  const t = tex(1024, 512, (g) => {
    g.clearRect(0, 0, 1024, 512);
    const C = (cx, cy, w, h, paint) => { const X = cx * 128, Y = cy * 128, W = w * 128, H = h * 128; g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.translate(X, Y); paint(W, H); g.restore(); };
    // グラフィティの かべ（れんがの 上に スプレー）。
    C(0, 0, 4, 2, (W, H) => {
      paintBricks(g, 0, 0, W, H, 22, 13, ['#8e3b28', '#9c4630', '#7f3324', '#a5513a', '#8a3a2a', '#6f2c20'], '#a99a88', { seed: 4 });
      const spray = (x, y, r, c, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(0.7, `rgba(${c},${a * 0.5})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
      for (let i = 0; i < 9; i += 1) spray(40 + rnd() * 430, 40 + rnd() * 170, 60 + rnd() * 70, ['24,170,170', '250,140,40', '250,210,60', '60,150,230', '240,90,120'][i % 5], 0.55);
      g.save(); g.translate(256, 128); g.rotate(-0.08);
      g.font = `900 112px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 26; g.strokeStyle = '#0d3a44'; g.strokeText('FRESH', 10, 12);
      g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText('FRESH', 0, 0);
      const gr = g.createLinearGradient(0, -50, 0, 50); gr.addColorStop(0, '#ffe45c'); gr.addColorStop(0.5, '#ff9a2e'); gr.addColorStop(1, '#ff4f6a'); g.fillStyle = gr; g.fillText('FRESH', 0, 0);
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText('FRESH', -3, -4);
      g.fillStyle = '#ff9a2e'; for (let i = 0; i < 12; i += 1) { const x = -200 + rnd() * 400, l = 10 + rnd() * 40; g.fillRect(x, 40, 3.5, l); g.beginPath(); g.arc(x + 1.7, 40 + l, 3.2, 0, 7); g.fill(); }
      g.restore();
      g.save(); g.translate(400, 200); g.rotate(-0.15); g.font = `italic 800 40px ${FONT}`; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#111'; g.strokeText('style', 0, 0); g.fillStyle = '#4fe0d0'; g.fillText('style', 0, 0); g.restore();
      g.save(); g.translate(96, 200); g.rotate(0.1); g.font = `900 34px ${FONT}`; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#111'; g.strokeText('U-SPEAK', 0, 0); g.fillStyle = '#ffffff'; g.fillText('U-SPEAK', 0, 0); g.restore();
      for (let i = 0; i < 14; i += 1) { const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 8; g.fillStyle = '#ffffff'; g.beginPath(); for (let k = 0; k < 8; k += 1) { const a = (k / 8) * TAU, rr = k % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
      for (let i = 0; i < 2500; i += 1) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`; g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
      g.globalAlpha = 0.22; paintBricks(g, 0, 0, W, H, 22, 13, ['rgba(0,0,0,0)'], 'rgba(120,108,96,1)', { seed: 4 }); g.globalAlpha = 1;
    });
    // 看板：MAISON U ふくの おみせ（こげ茶の 板・金の 字）。
    const sign = (W, H, en, ja, bg) => {
      const b = g.createLinearGradient(0, 0, 0, H); b.addColorStop(0, bg[0]); b.addColorStop(1, bg[1]); g.fillStyle = b; g.fillRect(0, 0, W, H);
      g.strokeStyle = goldGrad(g, 0, H); g.lineWidth = 4; g.strokeRect(7, 7, W - 14, H - 14); g.lineWidth = 1.5; g.strokeRect(14, 14, W - 28, H - 28);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
      g.font = `700 60px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const sp = en.split('').join(' '); let w = g.measureText(sp).width; if (w > W - 80) g.font = `700 ${Math.floor(60 * (W - 80) / w)}px ${SERIF}`;
      g.fillStyle = goldGrad(g, 22, 82); g.fillText(sp, W / 2, H * 0.43); g.restore();
      g.fillStyle = goldGrad(g, 88, 112); g.fillRect(W / 2 - 120, H * 0.66, 70, 1.5); g.fillRect(W / 2 + 50, H * 0.66, 70, 1.5);
      fit(g, ja, W / 2, H * 0.79, W * 0.5, 22, '#ead7a4', 700);
    };
    C(4, 0, 4, 1, (W, H) => sign(W, H, 'MAISON U', 'ふくの おみせ', ['#2a1d15', '#140d09']));
    C(4, 1, 4, 1, (W, H) => {
      sign(W, H, 'ROYAL HOME', 'かぐの おみせ', ['#141316', '#050506']);
      const cx = 40, cy = 64; g.fillStyle = goldGrad(g, 44, 84); g.beginPath(); g.moveTo(cx - 18, cy + 14); g.lineTo(cx - 20, cy - 10); g.lineTo(cx - 9, cy); g.lineTo(cx, cy - 16); g.lineTo(cx + 9, cy); g.lineTo(cx + 20, cy - 10); g.lineTo(cx + 18, cy + 14); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W - cx - 18, cy + 14); g.lineTo(W - cx - 20, cy - 10); g.lineTo(W - cx - 9, cy); g.lineTo(W - cx, cy - 16); g.lineTo(W - cx + 9, cy); g.lineTo(W - cx + 20, cy - 10); g.lineTo(W - cx + 18, cy + 14); g.closePath(); g.fill();
    });
    // バラの 油絵。
    C(0, 2, 1, 2, (W, H) => {
      const b = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.5, H * 0.7); b.addColorStop(0, '#3b2a1c'); b.addColorStop(1, '#0d0806'); g.fillStyle = b; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i += 1) { g.strokeStyle = `rgba(${60 + rnd() * 40},${40 + rnd() * 30},${20 + rnd() * 20},0.12)`; g.lineWidth = 2 + rnd() * 4; g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20); g.stroke(); }
      g.fillStyle = '#5a4128'; g.beginPath(); g.moveTo(44, 250); g.bezierCurveTo(30, 200, 40, 180, 54, 170); g.lineTo(74, 170); g.bezierCurveTo(88, 180, 98, 200, 84, 250); g.fill();
      g.fillStyle = 'rgba(255,220,160,0.25)'; g.fillRect(52, 180, 4, 60);
      for (let i = 0; i < 22; i += 1) { g.fillStyle = `rgb(${30 + rnd() * 30},${70 + rnd() * 40},${30 + rnd() * 20})`; g.beginPath(); g.ellipse(20 + rnd() * 88, 90 + rnd() * 90, 10, 4, rnd() * 3, 0, 7); g.fill(); }
      const rose = (x, y, r) => {
        g.fillStyle = `rgb(${150 + rnd() * 50},${10 + rnd() * 20},${20 + rnd() * 20})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        for (let k = 0; k < 5; k += 1) { g.strokeStyle = `rgba(${60 + rnd() * 30},0,8,0.7)`; g.lineWidth = 1.4; g.beginPath(); g.arc(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, r * (0.25 + k * 0.15), rnd() * 6, rnd() * 6 + 3.5); g.stroke(); }
        g.fillStyle = 'rgba(255,170,170,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, 7); g.fill();
      };
      for (let i = 0; i < 12; i += 1) rose(28 + rnd() * 72, 70 + rnd() * 90, 11 + rnd() * 6);
    });
    // 風景の 油絵（ゆうぐれ）。
    C(1, 2, 2, 1, (W, H) => {
      const s = g.createLinearGradient(0, 0, 0, H * 0.6); s.addColorStop(0, '#3e4a6a'); s.addColorStop(0.5, '#c98a5a'); s.addColorStop(1, '#f3c27a'); g.fillStyle = s; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(W * 0.62, H * 0.5, 9, 0, 7); g.fill();
      g.fillStyle = '#4a4a3a'; g.beginPath(); g.moveTo(0, H * 0.62); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.55 - Math.sin(x * 0.03) * 10 - rnd() * 4); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = '#2c3424'; g.beginPath(); g.moveTo(0, H * 0.75); for (let x = 0; x <= W; x += 10) g.lineTo(x, H * 0.7 - Math.sin(x * 0.05 + 1) * 6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      for (let i = 0; i < 6; i += 1) { const x = rnd() * W; g.fillStyle = '#1e2618'; g.beginPath(); g.ellipse(x, H * 0.66, 9, 20, 0, 0, 7); g.fill(); }
      for (let i = 0; i < 400; i += 1) { g.strokeStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.lineWidth = 2; g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + 8, y + (rnd() - 0.5) * 3); g.stroke(); }
    });
    // ポスター（あたらしい ふく）。
    C(1, 3, 1, 1, (W, H) => {
      g.fillStyle = '#efe6d6'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.beginPath(); g.arc(64, 26, 8, 0, 7); g.fill();
      g.beginPath(); g.moveTo(58, 36); g.lineTo(70, 36); g.lineTo(88, 92); g.lineTo(40, 92); g.closePath(); g.fill();
      fit(g, 'NEW SEASON', 64, 104, 110, 15, '#111', 800, 'center', SERIF); fit(g, 'あたらしい ふく', 64, 119, 100, 11, '#7a5a2a', 700);
      g.strokeStyle = '#b08a4a'; g.lineWidth = 2; g.strokeRect(3, 3, W - 6, H - 6);
    });
    // 金と 黒の 抽象画。
    C(2, 3, 1, 1, (W, H) => {
      g.fillStyle = '#ece6da'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i += 1) { g.strokeStyle = i % 2 ? '#141414' : '#c99a3e'; g.lineWidth = 6 + rnd() * 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(rnd() * W, rnd() * H); g.bezierCurveTo(rnd() * W, rnd() * H, rnd() * W, rnd() * H, rnd() * W, rnd() * H); g.stroke(); }
    });
    // はちかく もようの ラグ（金・黒・赤）。
    C(3, 2, 2, 2, (W, H) => {
      g.fillStyle = '#5a0c12'; g.fillRect(0, 0, W, H); g.fillStyle = '#c39a48'; g.fillRect(10, 10, W - 20, H - 20); g.fillStyle = '#16110f'; g.fillRect(16, 16, W - 32, H - 32);
      g.fillStyle = '#7d1219'; g.fillRect(24, 24, W - 48, H - 48);
      const s = 28, k = s * 0.2929;
      g.save(); g.beginPath(); g.rect(30, 30, W - 60, H - 60); g.clip();
      for (let y = 30; y < H - 30; y += s) for (let x = 30; x < W - 30; x += s) {
        g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + s - k, y); g.lineTo(x + s, y + k); g.lineTo(x + s, y + s - k); g.lineTo(x + s - k, y + s); g.lineTo(x + k, y + s); g.lineTo(x, y + s - k); g.lineTo(x, y + k); g.closePath();
        g.fillStyle = '#1a1412'; g.fill(); g.strokeStyle = '#c9a050'; g.lineWidth = 1.6; g.stroke();
        g.fillStyle = '#b8903e'; g.beginPath(); g.arc(x + s / 2, y + s / 2, 3, 0, 7); g.fill();
      }
      g.restore(); for (let i = 0; i < 4000; i += 1) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * W, rnd() * H, 1, 1.5); }
    });
    // -50% の 札。
    C(5, 2, 1, 1, (W, H) => {
      g.fillStyle = '#f7f3ea'; rrect(g, 8, 14, W - 16, H - 22, 8); g.fill(); g.strokeStyle = '#c0392b'; g.lineWidth = 3; rrect(g, 14, 20, W - 28, H - 34, 6); g.stroke();
      fit(g, '-50%', W / 2, 62, 100, 46, '#c0392b', 900); fit(g, 'SALE  セール', W / 2, 96, 96, 14, '#333', 800);
      g.fillStyle = '#999'; g.beginPath(); g.arc(W / 2, 24, 4, 0, 7); g.fill();
    });
    // 小さな 札（しちゃくしつ）と レジの 画面。
    C(5, 3, 1, 1, (W, H) => {
      const b = g.createLinearGradient(0, 0, 0, 64); b.addColorStop(0, '#2a1d15'); b.addColorStop(1, '#120c08'); g.fillStyle = b; g.fillRect(0, 0, W, 64);
      g.strokeStyle = '#c9a050'; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, 56);
      fit(g, 'FITTING ROOM', W / 2, 24, 108, 15, '#e8c878', 700, 'center', SERIF); fit(g, 'きがえる へや', W / 2, 44, 100, 12, '#e8d8b0', 700);
      const s = g.createLinearGradient(0, 64, 0, 128); s.addColorStop(0, '#20344a'); s.addColorStop(1, '#0c1622'); g.fillStyle = s; g.fillRect(0, 64, W, 64);
      g.fillStyle = 'rgba(120,200,255,0.8)'; g.fillRect(10, 74, 60, 6); g.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 4; i += 1) g.fillRect(10, 86 + i * 8, 40 + rnd() * 50, 3);
      g.fillStyle = '#e27a2d'; g.fillRect(84, 100, 34, 18);
    });
    C(6, 2, 1, 1, (W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); });
    C(6, 3, 1, 1, (W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7); gr.addColorStop(0, '#fff8e8'); gr.addColorStop(1, '#f0c890'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
    // ぼかしの 円（かげ・光の 輪）と 光の すじ。
    C(7, 2, 1, 1, (W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
    C(7, 3, 1, 1, (W, H) => {
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const u = x / (W - 1), v = y / (H - 1), a = Math.pow(Math.sin(u * Math.PI), 1.6) * Math.pow(1 - v, 1.3) * 255, i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a; }
      g.putImageData(img, 7 * 128, 3 * 128);
    });
  }, { repeat: false });
  if (t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; }
  return track('art', t);
}

// 中の 景色（512 × 256・正距円筒）：天井の ダウンライトと シャンデリアの 光の 点（金に するどい ハイライト）・まわりの かべと 光る まど・赤い 床。
function envInterior() {
  const rnd = rng(15);
  const t = tex(512, 256, (g, W, H) => {
    const up = g.createLinearGradient(0, 0, 0, H * 0.45); up.addColorStop(0, '#f6e7c8'); up.addColorStop(0.5, '#a88a64'); up.addColorStop(1, '#5a4636');
    g.fillStyle = up; g.fillRect(0, 0, W, H * 0.45);
    const dot = (x, y, r, c, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.25, `rgba(${c},${a * 0.8})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (let i = 0; i < 40; i += 1) dot(rnd() * W, 12 + rnd() * 90, 3 + rnd() * 4, '255,226,170');
    for (let i = 0; i < 5; i += 1) { const x = rnd() * W, y = 40 + rnd() * 40; dot(x, y, 26, '255,210,140', 0.9); for (let k = 0; k < 12; k += 1) dot(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 16, 2.5, '255,240,210'); }
    const mid = g.createLinearGradient(0, H * 0.45, 0, H * 0.6); mid.addColorStop(0, '#3a2c22'); mid.addColorStop(1, '#22180f'); g.fillStyle = mid; g.fillRect(0, H * 0.45, W, H * 0.15);
    for (let x = 0; x < W; x += 64) { g.strokeStyle = 'rgba(220,180,90,0.7)'; g.lineWidth = 1.5; g.strokeRect(x + 8, H * 0.46, 46, H * 0.12); }
    for (let i = 0; i < 4; i += 1) { const x = 40 + i * 128 + rnd() * 30; g.fillStyle = '#fff1d6'; g.fillRect(x, H * 0.44, 40, H * 0.13); }
    for (let i = 0; i < 10; i += 1) dot(rnd() * W, H * 0.48, 6, '255,200,130');
    const fl = g.createLinearGradient(0, H * 0.6, 0, H); fl.addColorStop(0, '#5a2a20'); fl.addColorStop(1, '#22100c'); g.fillStyle = fl; g.fillRect(0, H * 0.6, W, H * 0.4);
    for (let i = 0; i < 16; i += 1) { const x = rnd() * W, y = H * 0.64 + rnd() * H * 0.3; const rg = g.createRadialGradient(x, y, 0, x, y, 16); rg.addColorStop(0, 'rgba(255,230,190,0.3)'); rg.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = rg; g.fillRect(x - 16, y - 16, 32, 32); }
  }, { repeat: false });
  return track('envI', equirect(t), false);
}
// 外の 景色（512 × 512）：上半分＝昼（空・道の むこうの 石の 建物）、下半分＝夜（くらい 空・あかりの ついた まど・街灯）。ガラスの シェーダーだけが 使う。
function envExterior() {
  const rnd = rng(29);
  const t = tex(512, 512, (g, W) => {
    const half = (Y, night) => {
      const H = 256; g.save(); g.beginPath(); g.rect(0, Y, W, H); g.clip(); g.translate(0, Y);
      const sky = g.createLinearGradient(0, 0, 0, H / 2);
      if (night) { sky.addColorStop(0, '#050913'); sky.addColorStop(0.7, '#111a2c'); sky.addColorStop(1, '#2a2a34'); } else { sky.addColorStop(0, '#3d74b8'); sky.addColorStop(0.7, '#9cc0e0'); sky.addColorStop(1, '#e4e8e6'); }
      g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
      const r2 = rng(5);
      for (let x = -10; x < W + 10;) {
        const w = 22 + r2() * 40, h = 18 + r2() * 26, c = night ? [26 + r2() * 14, 22 + r2() * 10, 20 + r2() * 8] : [180 + r2() * 30, 164 + r2() * 26, 140 + r2() * 20];
        g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(x, H / 2 - h, w, h + 2);
        for (let yy = H / 2 - h + 4; yy < H / 2 - 3; yy += 6) for (let xx = x + 3; xx < x + w - 4; xx += 6) {
          const lit = night && rnd() < 0.45; g.fillStyle = lit ? `rgba(255,${190 + rnd() * 40 | 0},110,0.95)` : night ? 'rgba(10,10,14,0.9)' : 'rgba(50,60,70,0.7)'; g.fillRect(xx, yy, 3, 3.5);
        }
        x += w + r2() * 3;
      }
      if (night) for (let x = 12; x < W; x += 48) { const gr = g.createRadialGradient(x, H / 2 - 10, 0, x, H / 2 - 10, 12); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,120,0.6)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = gr; g.fillRect(x - 12, H / 2 - 22, 24, 24); }
      const gr = g.createLinearGradient(0, H / 2, 0, H); gr.addColorStop(0, night ? '#2a2420' : '#8f8a82'); gr.addColorStop(1, night ? '#0e0c0b' : '#4a4743'); g.fillStyle = gr; g.fillRect(0, H / 2, W, H / 2);
      if (night) for (let i = 0; i < 20; i += 1) { const x = rnd() * W; g.fillStyle = 'rgba(255,190,110,0.18)'; g.fillRect(x, H / 2 + 2, 3, 30 + rnd() * 40); }
      g.restore();
    };
    half(0, false); half(256, true);
  }, { repeat: false });
  if (t) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return track('envE', t, false);
}
// 葉（256 × 256）：左＝たれる ツタ、右上＝フィドルリーフの 大きな 葉、右下＝まるい しげみ。
function leafTexture() {
  const rnd = rng(61);
  const t = tex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    const ivy = (x, y, s, ang, l) => {
      g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = `rgb(${30 + l * 40 | 0},${70 + l * 60 | 0},${26 + l * 24 | 0})`;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-s * 0.9, -s * 0.1, -s * 0.9, s * 0.7, -s * 0.35, s * 0.6); g.lineTo(0, s * 1.1); g.lineTo(s * 0.35, s * 0.6); g.bezierCurveTo(s * 0.9, s * 0.7, s * 0.9, -s * 0.1, 0, 0); g.fill();
      g.strokeStyle = 'rgba(200,230,170,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s); g.stroke(); g.restore();
    };
    for (let k = 0; k < 3; k += 1) {
      const cx = 22 + k * 42; g.strokeStyle = '#3a4a22'; g.lineWidth = 1.4; g.beginPath(); const pts = [];
      for (let y = 0; y <= 256; y += 4) { const x = cx + Math.sin(y * 0.04 + k) * 8; pts.push([x, y]); if (y) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      for (let i = 0; i < 46; i += 1) { const [px, py] = pts[Math.floor(Math.pow(rnd(), 1.2) * (pts.length - 1))]; ivy(px + (rnd() - 0.5) * 10, py, 8 + rnd() * 6 - py * 0.015, (rnd() - 0.5) * 2.4, rnd()); }
    }
    // フィドルリーフ（バイオリンの 形・太い 葉脈）。
    g.save(); g.translate(192, 6);
    const lg = g.createLinearGradient(-50, 0, 50, 0); lg.addColorStop(0, '#1f4a1c'); lg.addColorStop(0.5, '#3f7a2e'); lg.addColorStop(1, '#25541e'); g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, 116); g.bezierCurveTo(-30, 112, -30, 80, -42, 60); g.bezierCurveTo(-60, 30, -40, 0, 0, 2); g.bezierCurveTo(40, 0, 60, 30, 42, 60); g.bezierCurveTo(30, 80, 30, 112, 0, 116); g.fill();
    g.strokeStyle = 'rgba(190,220,140,0.6)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 116); g.lineTo(0, 8); g.stroke();
    g.lineWidth = 1; for (let y = 20; y < 108; y += 12) { g.beginPath(); g.moveTo(0, y + 8); g.quadraticCurveTo(-18, y + 2, -34, y - 4); g.moveTo(0, y + 8); g.quadraticCurveTo(18, y + 2, 34, y - 4); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(-14, 40, 10, 26, 0.2, 0, 7); g.fill(); g.restore();
    // しげみ。
    for (let i = 0; i < 260; i += 1) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 56; ivy(192 + Math.cos(a) * r, 192 + Math.sin(a) * r * 0.95, 7 + rnd() * 6, a + Math.PI / 2 + (rnd() - 0.5), (1 - r / 56) * 0.5 + rnd() * 0.5); }
  }, { repeat: false });
  return track('leaves', t);
}
const LEAF = { ivy: [0.01, 0.0, 0.49, 1.0], fiddle: [0.53, 0.53, 0.97, 0.99], bush: [0.51, 0.01, 0.99, 0.49] };

/* ───────── 材質 ───────── */

const f3 = (v) => (+v).toFixed(3);
// 部屋の あかり（光は 足さない）：床＝ダウンライトの 光の 輪（ならびの 式）、かべ＝天井ちかくの 光の 弧（スカラップ）、
// 外＝ランタンの まわりの かべの 明るさ（夜だけ）。p＝group の 中の 位置・n＝法線。L に 足す。ループなし（JS が 1 つずつ 書く）。
function lightGLSL(c) {
  let s = `float inside = step(${f3(c.x0)}, p.x) * step(p.x, ${f3(c.x1)}) * step(${f3(c.z0)}, p.z) * step(p.z, ${f3(c.z1)}) * step(p.y, ${f3(c.top + 0.3)});
    float top = ${f3(c.top)};`;
  if (c.mezz) s += `\n    if (p.z < ${f3(c.mezz.z)} && p.y < ${f3(c.mezz.y - 0.2)}) top = ${f3(c.mezz.y - 0.32)};`;
  s += `
    if (n.y > 0.5) { vec2 q = (fract((p.xz - vec2(${f3(c.ox)}, ${f3(c.oz)})) / ${f3(c.sp)}) - 0.5) * ${f3(c.sp)}; L += inside * (exp(-dot(q, q) * 1.7) * 0.85 + 0.12); }
    else if (n.y > -0.5) { float al = p.x * n.z - p.z * n.x; float q = (fract(al / ${f3(c.wsp)} + 0.5) - 0.5) * ${f3(c.wsp)}; float h = top - p.y;
      L += inside * (smoothstep(0.0, 0.45, h - 0.2 - q * q * 2.4) * exp(-h * 0.32) * 0.95 + 0.1); }
    else { L += inside * 0.12; }`;
  for (const [x, y, z, r, k, zMin = -99] of c.lamps || []) s += `\n    { vec3 d = p - vec3(${f3(x)}, ${f3(y)}, ${f3(z)}); L += uNight * ${f3(k)} * step(${f3(zMin)}, p.z) * exp(-dot(d, d) / ${f3(r * r)}); }`;
  return s;
}
// かどの くらさ（AO）：床は かべ ぞい、かべは 床ぎわと 天井ぎわ。外の かべの 足もとも。
function aoGLSL(c) {
  let s = `float inA = step(${f3(c.x0)}, p.x) * step(p.x, ${f3(c.x1)}) * step(${f3(c.z0)}, p.z) * step(p.z, ${f3(c.z1)});
    float fl = ${f3(c.floor)};`;
  if (c.mezz) s += `\n    if (p.z < ${f3(c.mezz.z)} && p.y > ${f3(c.mezz.y - 0.08)}) fl = ${f3(c.mezz.y)};`;
  s += `
    if (n.y > 0.5) { float dw = min(min(p.x - ${f3(c.x0)}, ${f3(c.x1)} - p.x), min(p.z - ${f3(c.z0)}, ${f3(c.z1)} - p.z)); ao *= mix(1.0, mix(0.58, 1.0, smoothstep(0.0, 1.5, dw)), inA); }
    else if (n.y > -0.5) { ao *= mix(0.55, 1.0, smoothstep(0.0, 0.9, p.y - mix(0.0, fl, inA))); ao *= mix(1.0, mix(0.75, 1.0, smoothstep(0.0, 0.9, ${f3(c.top)} - p.y)), inA); }
    else { ao *= 0.8; }`;
  return s;
}
// MeshStandardMaterial に あかり・AO・つや・でこぼこを 足す 共通の しかけ。
function enhance(m, { key, light = '', ao = '', strips = false, fabric = false, night }) {
  const pick = (a) => { let s = f3(a[a.length - 1]); for (let i = a.length - 2; i >= 0; i -= 1) s = `(sSel < ${i}.5 ? ${f3(a[i])} : ${s})`; return s; };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night.n; sh.uniforms.uPool = night.pool;
    sh.vertexShader = `varying vec3 vLP;\nvarying vec3 vON;\nvarying vec2 vFU;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLP = transformed; vON = normal; vFU = uv;');
    let fs = `uniform float uNight;\nuniform float uPool;\nvarying vec3 vLP;\nvarying vec3 vON;\nvarying vec2 vFU;\n${sh.fragmentShader}`;
    let pre = 'float sSel = 0.0; float sH = 0.5; float sGold = 0.0; float hT = 1.0; float fk = 0.0;';
    if (strips) {
      pre += `
        #ifdef USE_MAP
          sSel = floor(vMapUv.y / 100.0 + 0.5); float sLv = vMapUv.y - sSel * 100.0;
          vec2 sUv = vec2(vMapUv.x, (fract(sLv) + ${NSTRIP - 1}.0 - sSel) / ${NSTRIP}.0);
          #if __VERSION__ >= 300
            vec4 sTex = textureGrad(map, sUv, dFdx(vec2(vMapUv.x, sLv / ${NSTRIP}.0)), dFdy(vec2(vMapUv.x, sLv / ${NSTRIP}.0)));
          #else
            vec4 sTex = texture2D(map, sUv);
          #endif
          diffuseColor *= sTex; sH = dot(sTex.rgb, vec3(0.3333));
          if (sSel > 7.5 && sSel < 8.5) sGold = smoothstep(0.06, 0.2, sTex.r - sTex.b);
        #endif`;
      fs = fs.replace('#include <map_fragment>', pre);
    } else fs = fs.replace('#include <map_fragment>', `#include <map_fragment>\n ${pre}`);
    if (fabric) {
      // ぬの：uv.x の 100 の くらい＝しゅるい（0 ぬの・1 ボタンじめの 革・2 ボタンじめの ビロード・3 ビロード・4 革・5 ニット）。
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        fk = floor(vFU.x / 100.0); vec2 fu = vec2(vFU.x - fk * 100.0, vFU.y);
        if (fk > 0.5 && fk < 2.5) {
          vec2 a = vec2(fu.x + fu.y, fu.x - fu.y) * 4.16; vec2 fq = fract(a) - 0.5;
          float puff = (0.5 - abs(fq.x)) * (0.5 - abs(fq.y)) * 4.0; hT = sqrt(max(puff, 0.0));
          float btn = smoothstep(0.1, 0.05, length(fract(a + 0.5) - 0.5));
          diffuseColor.rgb *= mix(0.42, 1.0, hT) * (1.0 - 0.55 * btn);
        } else if (fk > 4.5) { diffuseColor.rgb *= 0.86 + 0.14 * step(0.5, fract(fu.y * 22.0)); }`);
    }
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        { float ao = 1.0; vec3 p = vLP; vec3 n = normalize(vON); ${ao} diffuseColor.rgb *= ao; }`);
    if (strips) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(clamp(${pick(ROUGH)} * mix(1.2, 0.85, sH), 0.05, 1.0), 0.22, sGold);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = max(metalnessFactor, sGold);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 dh = vec2(dFdx(sH), dFdy(sH)) * ${pick(BUMP)};
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2)); }`);
    if (fabric) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = (fk > 0.5 && fk < 1.5) || (fk > 3.5 && fk < 4.5) ? 0.36 : (fk > 1.5 && fk < 3.5 ? 1.0 : 0.88);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (fk > 0.5 && fk < 2.5) { vec2 dh = vec2(dFdx(hT), dFdy(hT)) * 0.9;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2)); }`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 p = vLP; vec3 n = normalize(vON); float L = 0.0; ${light}
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.84, 0.62) * L * uPool;
          ${fabric ? `float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.6);
          totalEmissiveRadiance += diffuseColor.rgb * rim * (fk > 1.5 && fk < 3.5 ? 1.1 : (fk > 0.5 ? 0.25 : 0.4)) * (0.35 + uPool);` : ''} }`);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `uspeak-shop-${key}`;
  return m;
}

// ガラス（1 回で 描く）。頂点色：r＝しゅるい/8、g＝F0、b＝こさ。0 外の まど（外は 道の 景色・中は 部屋の 景色）/ 1 ショーケース /
// 2 鏡 / 3 クリスタル / 4 ランタンの ガラス（中から 光る）/ 5 くもりガラス（中が あかるい・夜に 灯る）。
const GLASS_VS = `varying vec3 vW; varying vec3 vN; varying vec3 vC;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  #ifdef USE_COLOR
    vC = color;
  #else
    vC = vec3(0.06, 0.06, 0.2);
  #endif
  vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLASS_FS = `uniform sampler2D uEnvI; uniform sampler2D uEnvE; uniform float uNight; uniform float uTime;
varying vec3 vW; varying vec3 vN; varying vec3 vC;
#include <common>
#include <fog_pars_fragment>
vec2 eq(vec3 d) { return vec2(atan(d.z, d.x) * 0.1591549 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183099 + 0.5); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  float kind = floor(vC.r * 8.0 + 0.01); float F0 = vC.g; float dk = vC.b;
  vec3 N0 = normalize(vN); vec3 V = normalize(vW - cameraPosition);
  float side = dot(V, N0); vec3 N = side > 0.0 ? -N0 : N0;
  float outside = step(side, 0.0);
  float cosT = clamp(-dot(V, N), 0.0, 1.0);
  vec3 R = reflect(V, N);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosT, 5.0);
  vec2 e = eq(R);
  vec3 envE = mix(texture2D(uEnvE, vec2(e.x, 0.5 + e.y * 0.5)).rgb, texture2D(uEnvE, vec2(e.x, e.y * 0.5)).rgb * 1.3, uNight);
  vec3 envI = texture2D(uEnvI, e).rgb;
  vec3 col; float a;
  if (kind < 0.5) {
    vec3 refl = mix(envI * 0.6, envE, outside);
    float dim = outside * dk * mix(0.55, 0.1, uNight);
    col = refl * F * mix(1.0, 0.7, uNight) + vec3(0.02, 0.025, 0.03) * dim;
    a = clamp(F * 0.9 + dim + 0.04, 0.0, 1.0);
  } else if (kind < 1.5) {
    col = envI * F * 1.2 + vec3(0.55, 0.75, 0.7) * 0.05; a = clamp(F * 0.85 + 0.05, 0.0, 0.92);
  } else if (kind < 2.5) {
    col = envI * vec3(0.88, 0.9, 0.9) * mix(1.0, 0.75, uNight) + pow(1.0 - cosT, 4.0) * 0.08; a = 1.0;
  } else if (kind < 3.5) {
    float tw = pow(h31(floor(vW * 40.0) + floor(uTime * 3.0)), 30.0);
    col = envI * 1.6 * (0.4 + F) + vec3(1.0, 0.92, 0.8) * tw * 2.5 + vec3(0.35, 0.33, 0.3) * uNight; a = clamp(0.45 + F * 0.5, 0.0, 1.0);
  } else if (kind < 4.5) {
    vec3 warm = vec3(1.0, 0.72, 0.36);
    col = mix(envE * F, warm * mix(0.55, 2.6, uNight), 0.85); a = 0.92;
  } else {
    vec3 warm = vec3(1.0, 0.86, 0.66);
    col = mix(envE * F * 0.8 + vec3(0.12, 0.11, 0.1), warm * mix(0.35, 1.9, uNight), 0.8); a = 0.96;
  }
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function glassMaterial(SHT, night) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: GLASS_VS, fragmentShader: GLASS_FS, vertexColors: true, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  m.uniforms.uEnvI = { value: SHT.envI }; m.uniforms.uEnvE = { value: SHT.envE }; m.uniforms.uNight = night.n;
  if (!SHT.envI || !SHT.envE) { const black = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255]), 1, 1); black.needsUpdate = true; m.uniforms.uEnvI.value ||= black; m.uniforms.uEnvE.value ||= black; }
  return m;
}
// 加算の 光（光の 輪・ランタンの ぼかし・光の すじ）：頂点色＝色と 強さ、uv.x の 10 の くらい＝1 なら 夜だけ。
const GLOW_VS = `varying vec2 vUv; varying vec3 vC; varying float vMode;
#include <fog_pars_vertex>
void main() { vMode = floor(uv.x / 10.0); vUv = vec2(uv.x - vMode * 10.0, uv.y);
  #ifdef USE_COLOR
    vC = color;
  #else
    vC = vec3(1.0);
  #endif
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLOW_FS = `uniform sampler2D uMap; uniform float uNight; varying vec2 vUv; varying vec3 vC; varying float vMode;
void main() { float a = texture2D(uMap, vUv).a; float k = vMode > 0.5 ? uNight : mix(0.55, 1.25, uNight); gl_FragColor = vec4(vC * a * k, 1.0); }`;
function glowMaterial(SHT, night) {
  const m = new THREE.ShaderMaterial({ uniforms: { uMap: { value: SHT.art } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.uniforms.uNight = night.n;
  if (!SHT.art) { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1); t.needsUpdate = true; m.uniforms.uMap.value = t; }
  return m;
}
// 絵（看板・油絵・ラグ・グラフィティ・電球）：uv.x の 10 の くらい＝1 いつも 光る（電球）・2 夜に 光る（看板）。
function artMaterial(SHT, night, light, key) {
  const m = new THREE.MeshStandardMaterial({ map: SHT.art, vertexColors: true, roughness: 0.6, metalness: 0, color: SHT.art ? 0xffffff : 0xd8d0c0, envMap: SHT.envI, envMapIntensity: 0.25 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night.n; sh.uniforms.uPool = night.pool;
    sh.vertexShader = `varying float vGlow;\nvarying vec3 vLP;\nvarying vec3 vON;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLP = transformed; vON = normal; vGlow = floor(uv.x / 10.0);')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n #ifdef USE_MAP\n vMapUv.x -= floor(uv.x / 10.0) * 10.0;\n #endif');
    sh.fragmentShader = `uniform float uNight;\nuniform float uPool;\nvarying float vGlow;\nvarying vec3 vLP;\nvarying vec3 vON;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float k = vGlow > 1.5 ? mix(0.12, 1.1, uNight) : (vGlow > 0.5 ? mix(1.1, 1.8, uNight) : 0.0);
        totalEmissiveRadiance += diffuseColor.rgb * k;
        vec3 p = vLP; vec3 n = normalize(vON); float L = 0.0; ${light} totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.84, 0.62) * L * uPool * step(vGlow, 0.5); }`);
  };
  m.customProgramCacheKey = () => `uspeak-shop-art-${key}`;
  return m;
}
// シャンデリアの きらめき（加算の 点・時間で またたく）。
function sparkleMaterial(night, time) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uNight: night.n },
    vertexShader: `attribute float aPh; uniform float uTime; uniform float uNight; varying float vK;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float tw = pow(0.5 + 0.5 * sin(uTime * (1.3 + fract(aPh * 7.3) * 2.4) + aPh * 40.0), 10.0);
        vK = (0.25 + tw) * mix(0.6, 1.2, uNight); gl_PointSize = clamp((0.08 + tw * 0.2) * 700.0 / -mv.z, 1.0, 26.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vK; void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c);
      float core = exp(-r * r * 90.0); float rays = (exp(-abs(c.x) * 60.0) + exp(-abs(c.y) * 60.0)) * smoothstep(0.5, 0.0, r) * 0.5;
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * (core + rays) * vK, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return m;
}

/* ───────── 人（mall-real.js と 同じ つくり・ここで 小さく）───────── */
// はだ・上の 服・下の 服・かみ・くつ・かばん・目・くちを 頂点の part で わけ、色は 1 体ずつ（instanced attribute）。歩く 足と うでは 頂点シェーダー。
function peopleMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = `uniform float uTime; attribute vec3 pv; attribute vec2 swing; attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iBot; attribute vec3 iHair; attribute vec3 iWalk; attribute vec4 iVar; attribute vec3 iBag; varying vec3 vTint;\n${sh.vertexShader}`
      .replace('#include <beginnormal_vertex>', `float pAng = (sin(uTime * 5.5 + iWalk.x) * iWalk.y + iWalk.z) * swing.x; float pc = cos(pAng), ps = sin(pAng);
        float keep = 1.0; float vr = pv.y;
        if (vr > 0.5) { float hs = iVar.x, bg = iVar.y;
          keep = vr < 1.5 ? step(hs, 0.5) : vr < 2.5 ? step(0.5, hs) * step(hs, 1.5) : vr < 3.5 ? step(1.5, hs) : vr < 4.5 ? step(0.5, bg) * step(bg, 1.5) : vr < 5.5 ? step(1.5, bg) : vr < 6.5 ? step(1.5, iVar.w) : 1.0 - step(0.5, hs) * step(hs, 1.5); }
        vec3 objectNormal = vec3(normal); objectNormal.yz = vec2(objectNormal.y * pc - objectNormal.z * ps, objectNormal.y * ps + objectNormal.z * pc);`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        if (pv.z > 0.0) transformed = vec3(0.0, pv.z, 0.0) + (transformed - vec3(0.0, pv.z, 0.0)) * (1.0 + 0.24 * iVar.z);
        { float yy = transformed.y - swing.y; transformed.yz = vec2(swing.y + yy * pc - transformed.z * ps, yy * ps + transformed.z * pc); }
        transformed *= keep;
        float part = pv.x; float white = mod(iVar.w, 2.0);
        vTint = part < 0.5 ? iSkin : part < 1.5 ? iTop : part < 2.5 ? iBot : part < 3.5 ? iHair : part < 4.5 ? mix(iBot * 0.3 + 0.015, vec3(0.78, 0.78, 0.76), white)
          : part < 5.5 ? iBag : part < 6.5 ? vec3(0.025, 0.02, 0.018) : mix(iSkin, vec3(0.55, 0.22, 0.22), 0.35) * 0.85;`);
    sh.fragmentShader = `varying vec3 vTint;\n${sh.fragmentShader}`.replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;');
  };
  m.customProgramCacheKey = () => 'uspeak-shop-people';
  return m;
}
const SKIN = [0xf1c7a5, 0xe0ac85, 0xc68a62, 0x9c6644, 0x6e452d, 0xf5d3b8, 0xe8b894, 0xd9a27c];
const TOPC = [0xf2f0ea, 0x222326, 0x2b3550, 0x8a8d91, 0xc8b59a, 0x6e2a33, 0x9fb8d0, 0xc9a13b, 0xd9a3a8, 0x3f6b55, 0xe9e2d0, 0x4a4f58, 0x1b1b1d];
const BOTC = [0x3b4e6e, 0x262f42, 0x1f2022, 0xb49f7a, 0x55585c, 0xd8cbb2, 0x2f3238, 0x5a4a3a];
const HAIR = [0x1c1512, 0x2e2018, 0x4a3324, 0x6b4a2e, 0xb08850, 0x161210, 0x1c1512, 0x8a8580];
const BAGC = [0xe8dcc4, 0x2b2420, 0x8a5a32, 0x9a1f2c, 0xf4f2ee, 0xd9b26a, 0x111111];
let HUMAN = null;
function humanGeometry(sit) {
  HUMAN ||= {};
  const key = sit ? 'sit' : 'stand'; if (HUMAN[key]) return HUMAN[key];
  const parts = [];
  const add = (g, part, sw = 0, pvt = 0, vr = 0, head = 0) => {
    const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); const c = n.attributes.position.count;
    const p = new Float32Array(c * 3), s = new Float32Array(c * 2); for (let i = 0; i < c; i += 1) { p[i * 3] = part; p[i * 3 + 1] = vr; p[i * 3 + 2] = head; s[i * 2] = sw; s[i * 2 + 1] = pvt; }
    n.setAttribute('pv', new THREE.BufferAttribute(p, 3)); n.setAttribute('swing', new THREE.BufferAttribute(s, 2)); parts.push(n);
  };
  const lb = (a, b, r0, r1, seg = 6) => { const A2 = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A2.distanceTo(Bv); const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false); g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A2).normalize())); g.translate(A2.x, A2.y, A2.z); return g; };
  const el = (x, y, z, rx, ry, rz, ws = 8, hs = 5, th = Math.PI) => { const g = new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, th); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
  const bx = (x, y, z, w, h, d) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const HIP = sit ? 0.47 : 0.9, y0 = HIP, NECK = y0 + 0.64;
  if (!sit) {
    for (const s of [-1, 1]) {
      add(lb([s * 0.09, 0.07, 0], [s * 0.095, 0.5, 0.01], 0.05, 0.065), 2, s * 1, HIP);
      add(lb([s * 0.095, 0.5, 0.01], [s * 0.1, 0.9, 0], 0.066, 0.085), 2, s * 1, HIP);
      add(el(s * 0.09, 0.05, 0.05, 0.056, 0.05, 0.135, 7, 4), 4, s * 1, HIP);
    }
    { const g = new THREE.CylinderGeometry(0.19, 0.27, 0.46, 10, 1, true); g.translate(0, y0 - 0.2, 0.0); add(g, 2, 0, 0, 6); }
  } else {
    for (const s of [-1, 1]) {
      add(lb([s * 0.1, HIP, -0.02], [s * 0.11, HIP + 0.02, 0.4], 0.085, 0.07), 2);
      add(lb([s * 0.11, HIP - 0.02, 0.4], [s * 0.1, 0.07, 0.42 + s * 0.03], 0.065, 0.05), 2);
      add(el(s * 0.1, 0.05, 0.47 + s * 0.03, 0.056, 0.05, 0.135, 7, 4), 4);
    }
  }
  add(el(0, y0 + 0.02, 0, 0.17, 0.12, 0.12, 8, 4), 2);
  { const g = new THREE.CylinderGeometry(0.19, 0.155, 0.52, 10, 1); g.scale(1, 1, 0.62); g.translate(0, y0 + 0.3, 0); add(g, 1); }
  add(el(0, y0 + 0.56, 0, 0.19, 0.07, 0.12, 8, 3, Math.PI / 2), 1);
  add(lb([0, y0 + 0.58, 0], [0, y0 + 0.68, 0.005], 0.045, 0.042, 6), 0, 0, 0, 0, NECK);
  const H = (g, part, vr = 0) => add(g, part, 0, 0, vr, NECK);
  H(el(0, y0 + 0.77, 0.008, 0.088, 0.112, 0.1, 10, 8), 0);
  for (const s of [-1, 1]) {
    H(el(s * 0.089, y0 + 0.765, -0.002, 0.016, 0.028, 0.02, 5, 3), 0);
    H(el(s * 0.032, y0 + 0.784, 0.091, 0.012, 0.008, 0.006, 4, 3), 6);
    H(el(s * 0.034, y0 + 0.808, 0.094, 0.019, 0.0045, 0.006, 4, 2), 3);
  }
  H(el(0, y0 + 0.758, 0.104, 0.012, 0.021, 0.016, 5, 3), 0);
  H(el(0, y0 + 0.722, 0.094, 0.021, 0.006, 0.007, 4, 2), 7);
  H(el(0, y0 + 0.8, -0.008, 0.096, 0.104, 0.106, 10, 6, Math.PI * 0.56), 3);
  H(el(0, y0 + 0.758, -0.035, 0.09, 0.085, 0.078, 8, 5), 3, 7);
  H(el(0, y0 + 0.66, -0.05, 0.102, 0.18, 0.072, 8, 6), 3, 2);
  for (const s of [-1, 1]) H(el(s * 0.078, y0 + 0.705, 0.012, 0.03, 0.12, 0.06, 5, 4), 3, 2);
  H(el(0, y0 + 0.845, -0.098, 0.046, 0.044, 0.046, 6, 5), 3, 3);
  for (const s of [-1, 1]) {
    const shd = [s * 0.205, y0 + 0.54, 0];
    if (!sit) {
      add(lb(shd, [s * 0.235, y0 + 0.25, 0], 0.055, 0.047), 1, -s * 0.75, y0 + 0.54);
      add(lb([s * 0.235, y0 + 0.25, 0], [s * 0.245, y0 - 0.02, 0.025], 0.045, 0.036), 0, -s * 0.75, y0 + 0.54);
      add(el(s * 0.248, y0 - 0.075, 0.028, 0.032, 0.062, 0.03, 5, 4), 0, -s * 0.75, y0 + 0.54);
    } else {
      add(lb(shd, [s * 0.23, y0 + 0.27, 0.05], 0.055, 0.047), 1);
      add(lb([s * 0.23, y0 + 0.27, 0.05], [s * 0.17, y0 + 0.3, 0.32], 0.045, 0.036), 0);
      add(el(s * 0.16, y0 + 0.3, 0.37, 0.035, 0.03, 0.062, 5, 4), 0);
    }
  }
  if (!sit) {
    add(lb([-0.16, y0 + 0.56, 0.05], [0.2, y0 + 0.04, 0.075], 0.012, 0.012, 4), 5, 0, 0, 4);
    add(bx(0.235, y0 - 0.02, 0.01, 0.07, 0.22, 0.27), 5, 0, 0, 4);
    add(bx(0.27, y0 - 0.33, 0.03, 0.08, 0.32, 0.3), 5, -0.75, y0 + 0.54, 5);
    add(lb([0.265, y0 - 0.17, -0.06], [0.255, y0 - 0.06, 0.03], 0.008, 0.008, 4), 6, -0.75, y0 + 0.54, 5);
  } else {
    add(bx(0.42, 0.14, 0.12, 0.09, 0.28, 0.3), 5, 0, 0, 4);
  }
  let nv = 0; for (const p of parts) nv += p.attributes.position.count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), pv = new Float32Array(nv * 3), sw = new Float32Array(nv * 2); let v = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, v * 3); nor.set(p.attributes.normal.array, v * 3); pv.set(p.attributes.pv.array, v * 3); sw.set(p.attributes.swing.array, v * 2); v += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('pv', new THREE.BufferAttribute(pv, 3)); g.setAttribute('swing', new THREE.BufferAttribute(sw, 2));
  g.computeBoundingSphere();
  HUMAN[key] = g; return g;
}
// list＝[{ x, y, z, ry, s, top, bot, hair, bag, skirt }]
function crowd(list, sit, rnd, mat, name) {
  const n = Math.max(1, list.length), m = new THREE.InstancedMesh(humanGeometry(sit).clone(), mat, n); m.count = list.length;
  const at = (k = 3) => new THREE.InstancedBufferAttribute(new Float32Array(n * k), k);
  const Aa = { iSkin: at(), iTop: at(), iBot: at(), iHair: at(), iWalk: at(), iVar: at(4), iBag: at() };
  const o = new THREE.Object3D(), c = new THREE.Color(), pickC = (arr) => c.setHex(arr[Math.floor(rnd() * arr.length)]);
  list.forEach((p, i) => {
    const s = p.s || 0.94 + rnd() * 0.14;
    o.position.set(p.x, p.y || 0, p.z); o.rotation.set(0, p.ry || 0, 0); o.scale.set(s * (0.94 + rnd() * 0.12), s, s * (0.95 + rnd() * 0.1)); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    Aa.iSkin.setXYZ(i, ...pickC(SKIN).toArray());
    Aa.iTop.setXYZ(i, ...(p.top != null ? c.setHex(p.top) : pickC(TOPC)).toArray()); Aa.iBot.setXYZ(i, ...(p.bot != null ? c.setHex(p.bot) : pickC(BOTC)).toArray());
    Aa.iHair.setXYZ(i, ...pickC(HAIR).toArray()); Aa.iBag.setXYZ(i, ...(p.bagC != null ? c.setHex(p.bagC) : pickC(BAGC)).toArray());
    const hr = rnd(), hair = p.hair ?? (hr < 0.4 ? 0 : hr < 0.8 ? 1 : 2), bag = p.bag ?? (rnd() < 0.5 ? 1 : rnd() < 0.5 ? 2 : 0);
    const skirt = p.skirt ?? (!sit && hair > 0 && rnd() < 0.45) ? 2 : 0, white = rnd() < 0.3 ? 1 : 0;
    Aa.iVar.setXYZW(i, hair, bag, 0, white + skirt);
    const w = p.walk || [0, 0, 0]; Aa.iWalk.setXYZ(i, w[0], w[1], w[2]);
  });
  for (const [k, a] of Object.entries(Aa)) m.geometry.setAttribute(k, a);
  m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = name;
  return m;
}

/* ───────── 部品を ためる 道具 ───────── */

// B＝createBatch。材質ごとの 入れ口と、UV の きまり（もようの 帯・木目・ぬのの しゅるい・絵の ます）。
function makeKit(B) {
  const K = {
    S: (g, color, s, ku = 0.5, kv = ku, v0 = 0) => B.add('surf', strip(wuv(g, ku, kv, v0), s), { color, uv: 'keep' }),
    stone: (g, c = 0xffffff) => K.S(g, c, STRIP.stone, 1 / 1.8, 1 / 0.9),
    brick: (g, c = 0xffffff) => K.S(g, c, STRIP.brick, 1 / 2, 1),
    plaster: (g, c = 0xffffff) => K.S(g, c, STRIP.plaster, 1 / 2, 1),
    marble: (g, c = 0xffffff) => K.S(g, c, STRIP.marble, 1 / 1.2, 1 / 0.6),
    oak: (g, c = 0xffffff) => K.S(g, c, STRIP.oak, 1 / 2, 1),
    checker: (g, c = 0xffffff) => K.S(g, c, STRIP.checker, 1, 2),
    cobble: (g, c = 0xffffff) => K.S(g, c, STRIP.cobble, 1 / 2, 1),
    slab: (g, c = 0xffffff) => K.S(g, c, STRIP.slab, 1 / 1.2, 1 / 0.6),
    damask: (g, c = 0xffffff) => K.S(g, c, STRIP.damask, 1, 2),
    carpet: (g, c = 0xffffff) => K.S(g, c, STRIP.carpet, 1 / 2, 1),
    granite: (g, c = 0xffffff) => K.S(g, c, STRIP.granite, 1 / 1.2, 1 / 0.6),
    W: (g, axis = 'x', color = 0xffffff) => B.add('surf', strip(grainUV(g, axis, 1 / 2, 1), STRIP.walnut), { color, uv: 'keep' }),
    MT: (g, color = GOLD) => B.add('metal', g, { color }),
    GS: (g, color) => B.add('gloss', g, { color }),
    FB: (g, color, kind = 0) => B.add('fabric', shiftU(wuv(g, 1, 1), kind * 100 + 50), { color, uv: 'keep' }),
    GL: (g, kind, F0 = 0.05, dark = 0.6) => B.add('glass', g, { color: new THREE.Color(kind / 8 + 0.01, F0, dark), uv: 'keep' }),
    AR: (g, c, glow = 0, color = 0xffffff) => B.add('art', shiftU(uvCell(g, c), glow * 10), { color, uv: 'keep' }),
    GW: (g, c, rgb, nightOnly = false) => B.add('glow', shiftU(uvCell(g, c), nightOnly ? 10 : 0), { color: new THREE.Color(...rgb), uv: 'keep' }),
    SH: (g) => B.add('shadow', uvCell(g, A.blob), { uv: 'keep' }),
    LF: (g, c, color) => B.add('leaf', uvCell(g, c), { color, uv: 'keep' }),
    SP: [], TEES: [],
  };
  return K;
}
const GOLD = 0xd9ad55, BRASS = 0xc9a060, IRON = 0x1c1c1e, EBONY = 0x3a2216, CREAMW = 0xefe9df;
const tf = (m) => (g) => g.applyMatrix4(m);
// 床の まるい かげ。
const shadowAt = (K, m, w, d, y = 0.012) => K.SH(new THREE.PlaneGeometry(w, d).toNonIndexed().rotateX(-Math.PI / 2).translate(0, y, 0).applyMatrix4(m));
// 十字に 3 まい（どこから 見ても まるい ぼかしの 光）。
function haloAt(K, x, y, z, s, rgb, nightOnly = false) {
  for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [Math.PI / 2, 0]]) K.GW(new THREE.PlaneGeometry(s, s).toNonIndexed().rotateX(rx).rotateY(ry).translate(x, y, z), A.blob, rgb, nightOnly);
}

/* ───────── 部品 ───────── */

// シャンデリア（真鍮の わ・うで・ろうそくの 電球・クリスタルの しずく・きらめきの 点）。y＝天井。
function chandelier(K, x, y, z, { r = 0.7, drop = 1.5, tiers = 2, floorY = 0 } = {}) {
  const yb = y - drop;
  K.MT(cyl(x, y - 0.06, z, 0.12, 0.16, 0.06, 16));
  for (let k = 0; k < 6; k += 1) K.MT(torus(0.03, 0.007, 4, 8).rotateY(k * 1.2).translate(x, y - 0.1 - k * (drop - 0.6) / 6, z));
  K.MT(limb([x, y - 0.1, z], [x, yb + 0.55, z], 0.006, 0.006, 4));
  K.MT(lathe([[0.02, -0.3], [0.06, -0.24], [0.035, -0.12], [0.07, 0.0], [0.04, 0.12], [0.08, 0.22], [0.03, 0.35], [0.02, 0.5]], 12).translate(x, yb, z));
  const crystal = (px, py, pz, s = 1) => { K.GL(ni(new THREE.OctahedronGeometry(0.022 * s, 0)).scale(1, 1.6, 1).translate(px, py, pz), 3, 0.3); if (hash(px * 9.1, py * 7.7 + pz) < 0.55) K.SP.push(px, py, pz); };
  for (let i = 0; i < tiers; i += 1) {
    const R = r * (1 - i * 0.42), yi = yb + i * 0.36, n = i === 0 ? 8 : 5;
    K.MT(torus(R, 0.016, 5, 28).rotateX(Math.PI / 2).translate(x, yi, z));
    K.MT(torus(R * 0.92, 0.008, 4, 24).rotateX(Math.PI / 2).translate(x, yi - 0.05, z));
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * TAU + i * 0.3, cx = x + Math.cos(a) * R, cz = z + Math.sin(a) * R;
      K.MT(tube([[x, yi - 0.12, z], [x + Math.cos(a) * R * 0.5, yi - 0.16, z + Math.sin(a) * R * 0.5], [cx, yi - 0.02, cz], [cx, yi + 0.06, cz]], 0.011, 8, 4));
      K.MT(lathe([[0.01, 0], [0.04, 0.02], [0.045, 0.05], [0.03, 0.06]], 8).translate(cx, yi + 0.05, cz));
      K.GS(cyl(cx, yi + 0.1, cz, 0.016, 0.016, 0.1, 8), 0xf4efe2);
      K.AR(ell(cx, yi + 0.235, cz, 0.022, 0.04, 0.022, 7, 5), A.white, 1, 0xffe4b8);
      crystal(cx, yi - 0.1, cz, 1.6);
      // 花づな（となりの うでまで たれる しずく）
      const a2 = ((k + 1) / n) * TAU + i * 0.3, nx = x + Math.cos(a2) * R, nz = z + Math.sin(a2) * R;
      for (let q = 1; q < 6; q += 1) { const t = q / 6; crystal(cx + (nx - cx) * t, yi - 0.03 - Math.sin(t * Math.PI) * 0.13, cz + (nz - cz) * t, 0.8); }
    }
  }
  for (let k = 0; k < 6; k += 1) { const a = (k / 6) * TAU; for (let q = 0; q < 4; q += 1) crystal(x + Math.cos(a) * 0.09, yb - 0.32 - q * 0.07, z + Math.sin(a) * 0.09, 1.1); }
  K.GL(ell(x, yb - 0.66, z, 0.05, 0.07, 0.05, 8, 6), 3, 0.3); K.SP.push(x, yb - 0.66, z);
  haloAt(K, x, yb + 0.15, z, r * 3.6, [0.42, 0.3, 0.16]);
  K.GW(floorQuad(x, floorY + 0.015, z, r * 6, r * 6, A.blob), A.blob, [0.16, 0.11, 0.06]);
}

// つるした 服（ひだの ある 体・そで・ハンガー）。ハンガーの かぎが 原点、+z が 服の 前。
function garment(K, m, { color, len = 0.78, w = 0.48, type = 'jacket', seed = 1, hanger = IRON }) {
  const T = tf(m);
  const g = new THREE.BoxGeometry(w, len, 0.07, 7, 5, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = 0.5 - y / len;
    let k = 1; if (type === 'dress') k = 0.55 + t * 0.85; else if (type === 'coat') k = 1 + t * 0.12;
    x *= k; if (t < 0.18) y -= Math.abs(x) * 0.32 * (1 - t / 0.18);
    z = z * (1 + t * 0.6) + Math.sin(p.getX(i) * 24 + seed * 3.1) * 0.013 * (0.25 + t) * (type === 'dress' ? 2.2 : 1) + Math.sin(p.getX(i) * 9 + seed) * 0.01 * t;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); g.translate(0, -len / 2 - 0.09, 0);
  K.FB(T(ni(g)), color, type === 'knit' ? 5 : 0);
  if (type !== 'dress') {
    for (const s of [-1, 1]) {
      const sl = ni(new THREE.BoxGeometry(0.11, len * 0.86, 0.075, 1, 3, 1)); sl.rotateZ(s * 0.05); sl.translate(s * (w / 2 + 0.045), -0.09 - len * 0.45, 0.005);
      K.FB(T(sl), new THREE.Color(color).multiplyScalar(0.9), type === 'knit' ? 5 : 0);
    }
    if (type === 'hoodie') K.FB(T(ell(0, -0.12, -0.05, 0.13, 0.11, 0.06, 8, 5)), new THREE.Color(color).multiplyScalar(0.85));
    if (type === 'jacket' || type === 'coat') { K.FB(T(box(-w * 0.18, -0.09 - len * 0.32, 0.045, 0.08, len * 0.4, 0.01).rotateZ(0.0)), new THREE.Color(color).multiplyScalar(0.75)); K.MT(T(cyl(0, -0.09 - len * 0.45, 0.05, 0.008, 0.008, 0.006, 6).rotateX(0)), GOLD); }
  } else K.FB(T(box(0, -0.12, 0, w * 0.5, 0.06, 0.06)), color);
  K.MT(T(torus(0.025, 0.004, 3, 8, Math.PI * 1.3).rotateZ(-0.3).translate(0, 0.02, 0)), hanger);
  K.MT(T(beam([-w / 2 + 0.03, -0.1, 0], [0, -0.04, 0], 0.012, 0.01)), hanger); K.MT(T(beam([0, -0.04, 0], [w / 2 - 0.03, -0.1, 0], 0.012, 0.01)), hanger);
}
// 服の ラック（黒い 鉄・金）。原点は ゆかの まんなか、レールは x むき。
function rack(K, m, { len = 1.6, h = 1.55, color = IRON, items = [], gap = 0.13, rnd, base = true }) {
  const T = tf(m);
  for (const s of [-1, 1]) { K.MT(T(cyl(s * len / 2, 0, 0, 0.016, 0.016, h, 8)), color); if (base) K.MT(T(box(s * len / 2, 0, 0, 0.04, 0.03, 0.5)), color); }
  K.MT(T(cyl(0, 0, 0, 0.014, 0.014, len, 8).rotateZ(Math.PI / 2).translate(0, h, 0)), color);
  let x = -len / 2 + 0.12; let i = 0;
  while (x < len / 2 - 0.08 && items.length) {
    const it = items[i % items.length], c = new THREE.Color(it.color).multiplyScalar(0.9 + rnd() * 0.2);
    garment(K, m.clone().multiply(M(x, h, 0, Math.PI / 2 + (rnd() - 0.5) * 0.12)), { ...it, color: c, seed: i * 1.7 + rnd(), len: (it.len || 0.78) * (0.95 + rnd() * 0.1), hanger: color });
    x += gap * (0.85 + rnd() * 0.3); i += 1;
  }
  shadowAt(K, m, len + 0.5, 0.9);
}
// マネキン（つやの ある 体・たまごの 頭・台）＋ ドレス／コート。+z が 前。
function mannequin(K, m, { body = 0xf2efe9, dress = 0x111111, style = 'gown', pose = 0 }) {
  const T = tf(m), G = (g) => K.GS(T(g), body);
  for (const s of [-1, 1]) {
    const kx = s * 0.085 + (pose && s > 0 ? 0.05 : 0);
    G(limb([s * 0.08, 0.9, 0], [kx, 0.48, 0.02], 0.062, 0.047, 10)); G(limb([kx, 0.48, 0.02], [s * 0.075 + (pose && s > 0 ? 0.08 : 0), 0.09, -0.01], 0.044, 0.03, 10));
    G(ell(s * 0.075 + (pose && s > 0 ? 0.08 : 0), 0.06, 0.04, 0.035, 0.03, 0.08, 7, 5));
    G(ell(s * 0.08, 0.48, 0.02, 0.05, 0.05, 0.05, 8, 5));
  }
  G(lathe([[0.02, 0.86], [0.15, 0.9], [0.168, 0.98], [0.124, 1.13], [0.15, 1.24], [0.158, 1.3], [0.15, 1.36], [0.11, 1.42], [0.05, 1.46], [0.044, 1.56], [0.02, 1.58]], 18, 0.7));
  for (const s of [-1, 1]) {
    G(ell(s * 0.155, 1.4, 0, 0.055, 0.045, 0.05, 8, 5));
    G(limb([s * 0.17, 1.4, 0], [s * 0.215, 1.12, -0.01 + pose * 0.05], 0.042, 0.033, 8)); G(limb([s * 0.215, 1.12, -0.01 + pose * 0.05], [s * 0.2, 0.88, 0.06], 0.031, 0.024, 8));
    G(ell(s * 0.198, 0.83, 0.07, 0.022, 0.05, 0.035, 6, 4));
  }
  G(ell(0, 1.68, 0.01, 0.083, 0.108, 0.092, 12, 9));
  K.MT(T(cyl(0.05, 0.02, -0.06, 0.009, 0.009, 0.5, 6)), BRASS); K.MT(T(cyl(0, 0, -0.02, 0.2, 0.22, 0.02, 24)), 0x2b2b2d);
  shadowAt(K, m, 0.8, 0.8);
  const D = (pts, folds, hemY) => {
    const g = lathe(pts, 28, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + Math.sin(a * folds) * 0.06 * clamp01((1.0 - y) / (1.0 - hemY)); p.setXYZ(i, x * k, y, z * k * (y > 1.0 ? 0.74 : 0.86)); }
    g.computeVertexNormals(); return g;
  };
  if (style === 'gown') { K.FB(T(D([[0.4, 0.015], [0.33, 0.25], [0.24, 0.62], [0.18, 0.92], [0.13, 1.12], [0.165, 1.28], [0.15, 1.36], [0.06, 1.37]], 11, 0.0)), dress, 3); for (const s of [-1, 1]) K.FB(T(beam([s * 0.08, 1.36, 0.05], [s * 0.12, 1.43, 0.0], 0.012, 0.012)), dress); }
  else if (style === 'mini') { K.FB(T(D([[0.25, 0.62], [0.2, 0.8], [0.16, 0.98], [0.13, 1.12], [0.168, 1.28], [0.155, 1.37], [0.05, 1.38]], 9, 0.62)), dress, 3); }
  else if (style === 'coat') {
    K.FB(T(D([[0.27, 0.45], [0.23, 0.7], [0.2, 0.95], [0.17, 1.12], [0.19, 1.28], [0.18, 1.38], [0.12, 1.45], [0.07, 1.48]], 6, 0.45)), dress);
    for (const s of [-1, 1]) { K.FB(T(limb([s * 0.18, 1.41, 0], [s * 0.225, 1.12, 0.0], 0.06, 0.05, 8)), dress); K.FB(T(limb([s * 0.225, 1.12, 0.0], [s * 0.205, 0.9, 0.06], 0.05, 0.045, 8)), dress); }
    for (let k = 0; k < 3; k += 1) K.MT(T(cyl(0.03, 1.05 + k * 0.12, 0.175, 0.012, 0.012, 0.01, 8).rotateX(0)), GOLD);
    K.FB(T(beam([-0.06, 1.42, 0.12], [0.02, 1.15, 0.18], 0.06, 0.012)), new THREE.Color(dress).multiplyScalar(0.8));
  }
}
// トルソー（腕の ない マネキン）＋ Tシャツ・パーカー。台は 鉄の ぼう。
function torsoForm(K, m, { color, form = 0x1a1a1a, type = 'tee' }) {
  const T = tf(m);
  K.GS(T(lathe([[0.03, 0.92], [0.16, 0.96], [0.17, 1.02], [0.13, 1.16], [0.16, 1.3], [0.175, 1.38], [0.12, 1.47], [0.05, 1.5], [0.045, 1.58], [0.06, 1.6], [0.0, 1.61]], 16, 0.72)), form);
  const top = lathe(type === 'hoodie' ? [[0.19, 0.95], [0.185, 1.12], [0.19, 1.3], [0.2, 1.4], [0.14, 1.49], [0.06, 1.52]] : [[0.18, 1.0], [0.16, 1.16], [0.175, 1.3], [0.188, 1.39], [0.13, 1.48], [0.055, 1.5]], 18, 0.76);
  K.FB(T(top), color, type === 'knit' ? 5 : 0);
  for (const s of [-1, 1]) K.FB(T(limb([s * 0.17, 1.4, 0], [s * 0.25, 1.22, 0], 0.075, 0.06, 8)), color);
  if (type === 'hoodie') { K.FB(T(ell(0, 1.5, -0.08, 0.15, 0.12, 0.08, 8, 5)), new THREE.Color(color).multiplyScalar(0.88)); K.FB(T(box(0, 1.08, 0.13, 0.22, 0.13, 0.02)), new THREE.Color(color).multiplyScalar(0.9)); }
  K.MT(T(cyl(0, 0.03, 0, 0.012, 0.012, 0.9, 6)), IRON);
  for (let k = 0; k < 3; k += 1) K.MT(T(beam([0, 0.2, 0], [Math.cos(k * 2.1) * 0.25, 0.01, Math.sin(k * 2.1) * 0.25], 0.02, 0.02)), IRON);
  shadowAt(K, m, 0.7, 0.7);
}
// バッグ（0 トート・1 かたかけ・2 クラッチ）。底が 原点。
function handbag(K, m, color, kind = 0) {
  const T = tf(m), w = kind === 2 ? 0.26 : 0.3, h = kind === 2 ? 0.13 : kind === 0 ? 0.24 : 0.18, d = kind === 2 ? 0.04 : 0.12;
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - (y / h + 0.5) * (kind === 0 ? 0.12 : 0.04))); }
  g.computeVertexNormals(); g.translate(0, h / 2, 0); K.FB(T(ni(g)), color, 4);
  if (kind !== 2) K.FB(T(torus(kind === 0 ? 0.075 : 0.11, 0.008, 4, 12, Math.PI).translate(0, h, 0)), new THREE.Color(color).multiplyScalar(0.8), 4);
  K.FB(T(box(0, h * 0.55, d / 2, w * 0.98, h * 0.45, 0.012)), new THREE.Color(color).multiplyScalar(0.92), 4);
  K.MT(T(box(0, h * 0.56, d / 2 + 0.008, 0.035, 0.022, 0.008)), GOLD);
}
// ハイヒール（つまさきが +z）。
function shoe(K, m, color) {
  const T = tf(m);
  K.FB(T(ell(0, 0.03, 0.05, 0.035, 0.035, 0.075, 8, 5, Math.PI / 2)), color, 4);
  K.FB(T(beam([0, 0.072, -0.06], [0, 0.012, 0.09], 0.06, 0.012)), new THREE.Color(color).multiplyScalar(0.7), 4);
  K.GS(T(cyl(0, 0, -0.07, 0.008, 0.012, 0.075, 6)), 0x111111);
  K.FB(T(box(0, 0.05, -0.065, 0.06, 0.05, 0.012)), color, 4);
}
// ぼうしの 頭（台＋頭＋キャップ）。
function capHead(K, m, color, headC = 0xd9d3c9) {
  const T = tf(m);
  K.MT(T(cyl(0, 0, 0, 0.06, 0.07, 0.02, 14)), IRON); K.MT(T(cyl(0, 0.02, 0, 0.01, 0.01, 0.18, 6)), IRON);
  K.GS(T(ell(0, 0.3, 0, 0.085, 0.105, 0.095, 10, 8)), headC);
  K.FB(T(ell(0, 0.33, -0.005, 0.098, 0.085, 0.104, 12, 6, Math.PI / 2)), color);
  K.FB(T(cyl(0, 0.33, 0.1, 0.075, 0.075, 0.01, 14).scale(1, 1, 1).translate(0, 0, 0)), new THREE.Color(color).multiplyScalar(0.8));
  K.FB(T(ell(0, 0.418, 0, 0.012, 0.008, 0.012, 5, 3)), color);
}
// ガラスの ケース（中に 小物・上の ふちに 光の 線）。原点は ゆかの まんなか。
function glassCase(K, m, { w = 1.6, d = 0.6, h = 0.95, base = 0x1a1a1a, frame = IRON, rnd, items = 'acc' }) {
  const T = tf(m);
  K.GS(T(box(0, 0, 0, w, 0.32, d)), base); K.MT(T(box(0, 0.32, 0, w + 0.01, 0.02, d + 0.01)), frame);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.MT(T(box(sx * (w / 2 - 0.01), 0.32, sz * (d / 2 - 0.01), 0.022, h - 0.32, 0.022)), frame);
  K.MT(T(box(0, h - 0.015, 0, w, 0.02, d)), frame);
  for (const s of [-1, 1]) { K.GL(T(new THREE.PlaneGeometry(w - 0.02, h - 0.35).toNonIndexed().translate(0, (h + 0.32) / 2, s * d / 2)), 1, 0.05); K.GL(T(new THREE.PlaneGeometry(d - 0.02, h - 0.35).toNonIndexed().rotateY(Math.PI / 2).translate(s * w / 2, (h + 0.32) / 2, 0)), 1, 0.05); }
  K.GL(T(new THREE.PlaneGeometry(w, d).toNonIndexed().rotateX(-Math.PI / 2).translate(0, h, 0)), 1, 0.05);
  K.GS(T(box(0, 0.5, 0, w - 0.06, 0.02, d - 0.06)), 0xf1ece2);
  K.AR(T(box(0, h - 0.04, -d / 2 + 0.03, w - 0.06, 0.012, 0.012)), A.white, 1, 0xfff0d0);
  for (let i = 0; i < Math.floor(w / 0.2); i += 1) {
    const x = -w / 2 + 0.14 + i * 0.2, z = (rnd() - 0.5) * (d - 0.2);
    if (items === 'acc') {
      if (i % 3 === 0) { K.MT(T(torus(0.03, 0.006, 4, 12).rotateX(Math.PI / 2).translate(x, 0.53, z)), GOLD); K.GS(T(cyl(x, 0.52, z, 0.02, 0.02, 0.012, 10)), 0x111111); }
      else if (i % 3 === 1) { K.GS(T(box(x, 0.52, z, 0.13, 0.02, 0.04)), 0x0e0e0e); }
      else K.FB(T(box(x, 0.52, z, 0.1, 0.018, 0.08)), [0x7a3f20, 0x1a1a1a, 0x8a1c26][i % 3 === 2 ? Math.floor(rnd() * 3) : 0], 4);
    } else { K.FB(T(box(x, 0.52, z, 0.14, 0.03, 0.14)), [0xf2f0ea, 0x1a1a1a, 0xc9402e, 0x2a5aa8][Math.floor(rnd() * 4)]); }
  }
  shadowAt(K, m, w + 0.4, d + 0.4);
}
// 金の がく（何重もの ふち・かどの かざり）＋ 絵。原点は 絵の 下の まんなか（かべに つく）、+z が 前。
function gildedFrame(K, m, w, h, cell, { lamp = true, glow = 0 } = {}) {
  const T = tf(m), F = 0.13;
  const ring = (inset, t, dz, c = GOLD) => {
    const W2 = w + 2 * F - inset * 2, H2 = h + 2 * F - inset * 2;
    K.MT(T(box(0, -F + inset, dz, W2, t, 0.05)), c); K.MT(T(box(0, h + F - inset - t, dz, W2, t, 0.05)), c);
    K.MT(T(box(-W2 / 2 + t / 2, -F + inset, dz, t, H2, 0.05)), c); K.MT(T(box(W2 / 2 - t / 2, -F + inset, dz, t, H2, 0.05)), c);
  };
  ring(0, 0.05, 0.02); ring(0.04, 0.04, 0.045, 0xc79a45); ring(0.085, 0.03, 0.035, 0xe8c170); ring(0.12, 0.012, 0.02, 0x8a6424);
  for (const [sx, sy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) K.MT(T(ell(sx * (w / 2 + F * 0.55), sy * (h + F * 0.1) - F * 0.45 + sy * F, 0.07, 0.05, 0.05, 0.03, 8, 5)));
  K.MT(T(ell(0, h + F, 0.06, 0.16, 0.1, 0.03, 10, 5, Math.PI / 2)));
  K.AR(T(new THREE.PlaneGeometry(w, h).toNonIndexed().translate(0, h / 2, 0.025)), cell, glow);
  if (lamp) {
    K.MT(T(cyl(0, h + F + 0.1, 0.05, 0.015, 0.015, 0.04, 6)), BRASS); K.MT(T(cyl(0, 0, 0, 0.03, 0.03, w * 0.55, 10).rotateZ(Math.PI / 2).translate(0, h + F + 0.16, 0.16)), BRASS);
    K.MT(T(beam([0, h + F + 0.12, 0.05], [0, h + F + 0.16, 0.16], 0.015, 0.015)), BRASS);
    K.GW(T(new THREE.PlaneGeometry(w * 1.1, h * 0.9).toNonIndexed().translate(0, h * 0.55, 0.03)), A.streak, [0.28, 0.2, 0.1]);
  }
}
// 金の 鏡（うえに かざり）。
function mirror(K, m, w, h) {
  const T = tf(m);
  K.MT(T(box(0, -0.06, 0, w + 0.12, 0.06, 0.06))); K.MT(T(box(0, h, 0, w + 0.12, 0.06, 0.06)));
  for (const s of [-1, 1]) K.MT(T(box(s * (w / 2 + 0.03), -0.06, 0, 0.06, h + 0.12, 0.06)));
  K.MT(T(ell(0, h + 0.06, 0.02, 0.22, 0.14, 0.03, 10, 5, Math.PI / 2)));
  K.GL(T(new THREE.PlaneGeometry(w, h).toNonIndexed().translate(0, h / 2, 0.01)), 2, 0.95, 1);
}
// カーテン（ひだの ある ビロード）。原点は レールの まんなか、下へ h。
function curtain(K, m, w, h, color, { open = 0, kind = 3 } = {}) {
  const T = tf(m), g = new THREE.PlaneGeometry(w, h, 28, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), y = p.getY(i), t = (x / w + 0.5); p.setXYZ(i, x * (1 - open * (0.5 + 0.5 * (y / h + 0.5)) * 0.0), y - h / 2, Math.sin(t * Math.PI * 2 * (w / 0.16)) * 0.035 * (1.1 - (y / h + 0.5) * 0.3)); }
  g.computeVertexNormals(); const gg = ni(g); K.FB(T(gg), color, kind);
  K.MT(T(cyl(0, 0, 0, 0.015, 0.015, w + 0.2, 8).rotateZ(Math.PI / 2).translate(0, 0.04, 0)), BRASS);
}
// チェスターフィールドの ソファ（ボタンじめ・ころがる うで・金の あし・クッション）。+z が 前、原点は ゆかの まんなか。
function chesterfield(K, m, { len = 2.2, color = 0x8c1420, cushions = [0xc9a14a, 0x151515], kind = 1 } = {}) {
  const T = tf(m), d = 0.9, dk = new THREE.Color(color).multiplyScalar(0.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.MT(T(lathe([[0.03, 0], [0.045, 0.03], [0.03, 0.08], [0.04, 0.11], [0.03, 0.13]], 10).translate(sx * (len / 2 - 0.12), 0, sz * (d / 2 - 0.1))));
  K.FB(T(box(0, 0.13, 0, len, 0.24, d)), dk, 4);
  const seat = (x, w) => { const g = new THREE.BoxGeometry(w, 0.15, d - 0.3, 3, 1, 3), p = g.attributes.position; for (let i = 0; i < p.count; i += 1) if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.03 * Math.cos(p.getX(i) / w * Math.PI) * Math.cos(p.getZ(i) / (d - 0.3) * Math.PI)); g.computeVertexNormals(); g.translate(x, 0.44, 0.1); K.FB(T(ni(g)), color, 4); };
  const inner = len - 0.48; for (let k = 0; k < 3; k += 1) seat(-inner / 2 + inner / 6 + (k * inner) / 3, inner / 3 - 0.015);
  K.FB(T(box(0, 0.37, -d / 2 + 0.13, len - 0.04, 0.5, 0.24)), color, kind);
  K.FB(T(cyl(0, 0, 0, 0.13, 0.13, len - 0.04, 14).rotateZ(Math.PI / 2).translate(0, 0.86, -d / 2 + 0.14)), color, kind);
  for (const s of [-1, 1]) {
    K.FB(T(box(s * (len / 2 - 0.12), 0.37, 0, 0.24, 0.4, d)), color, kind);
    K.FB(T(cyl(0, 0, 0, 0.15, 0.15, d, 14).rotateX(Math.PI / 2).translate(s * (len / 2 - 0.12), 0.78, 0)), color, kind);
    K.FB(T(cyl(0, 0, 0, 0.152, 0.152, 0.01, 14).rotateX(Math.PI / 2).translate(s * (len / 2 - 0.12), 0.78, d / 2 + 0.002)), dk, 4);
  }
  cushions.forEach((c, i) => { const x = (i - (cushions.length - 1) / 2) * 0.55; const g = ni(new THREE.BoxGeometry(0.44, 0.44, 0.12, 2, 2, 1)); g.rotateX(-0.25); g.rotateZ(i % 2 ? 0.08 : -0.08); g.translate(x, 0.76, -0.17); K.FB(T(g), c, 2); });
  shadowAt(K, m, len + 0.6, d + 0.5);
}
// ひじかけ いす（ビロード・ボタンじめの 高い せ・金の あし）。
function armchair(K, m, { color = 0x8c1420, frame = GOLD } = {}) {
  const T = tf(m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.MT(T(tube([[sx * 0.3, 0.42, sz * 0.28], [sx * 0.33, 0.25, sz * 0.31], [sx * 0.31, 0.08, sz * 0.3], [sx * 0.33, 0.0, sz * 0.33]], 0.02, 6, 4)), frame);
  K.MT(T(box(0, 0.36, 0, 0.7, 0.07, 0.68)), frame);
  K.FB(T(box(0, 0.42, 0.02, 0.66, 0.14, 0.62)), color, 3);
  const back = plate(archShape(0, 0, 0.6, 0.72), 0.1, { seg: 10 }); back.translate(0, 0.5, -0.24); back.rotateX(-0.1); K.FB(T(back), color, 2);
  K.MT(T(torus(0.3, 0.014, 4, 18, Math.PI).translate(0, 0.92, -0.2).rotateX(-0.1)), frame);
  for (const s of [-1, 1]) { K.FB(T(box(s * 0.32, 0.56, 0.0, 0.08, 0.06, 0.5)), color, 3); K.MT(T(beam([s * 0.33, 0.43, 0.24], [s * 0.33, 0.6, 0.26], 0.03, 0.03)), frame); }
  shadowAt(K, m, 1.0, 1.0);
}
// ひくい テーブル（黒い うるし・金の あし）。
function coffeeTable(K, m, { w = 1.3, d = 0.7, top = 0x0b0b0c } = {}) {
  const T = tf(m);
  K.GS(T(box(0, 0.4, 0, w, 0.05, d)), top); K.MT(T(box(0, 0.38, 0, w + 0.03, 0.025, d + 0.03)));
  K.GS(T(box(0, 0.08, 0, w - 0.2, 0.025, d - 0.2)), top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.MT(T(tube([[sx * (w / 2 - 0.06), 0.38, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.02), 0.26, sz * (d / 2 - 0.02)], [sx * (w / 2 - 0.08), 0.1, sz * (d / 2 - 0.08)], [sx * (w / 2 - 0.05), 0.0, sz * (d / 2 - 0.05)]], 0.022, 8, 5)));
  K.MT(T(lathe([[0.01, 0], [0.12, 0.02], [0.15, 0.06], [0.14, 0.07]], 16).translate(0.2, 0.425, 0)));
  for (let k = 0; k < 3; k += 1) K.FB(T(box(-0.32, 0.425 + k * 0.035, 0.05, 0.3 - k * 0.03, 0.033, 0.22 - k * 0.02)), [0x1d2a44, 0x7a1c22, 0xe8e0cc][k]);
  shadowAt(K, m, w + 0.4, d + 0.4);
}
// 金と 赤の 一本あしの テーブル。
function pedestal(K, m, { top = 0x8a1214, r = 0.32 } = {}) {
  const T = tf(m);
  K.MT(T(lathe([[0.2, 0], [0.2, 0.03], [0.1, 0.06], [0.05, 0.12], [0.08, 0.2], [0.035, 0.32], [0.05, 0.42], [0.03, 0.52], [0.06, 0.6], [0.09, 0.64]], 16)));
  K.GS(T(cyl(0, 0.64, 0, r, r, 0.04, 28)), top); K.MT(T(torus(r, 0.014, 5, 28).rotateX(Math.PI / 2).translate(0, 0.66, 0)));
  K.GS(T(lathe([[0.01, 0], [0.07, 0.01], [0.09, 0.08], [0.05, 0.2], [0.035, 0.26], [0.05, 0.3]], 12).translate(0, 0.68, 0)), 0x0f0f10);
  for (let k = 0; k < 7; k += 1) K.FB(T(ell(Math.cos(k) * 0.06, 1.02 + Math.sin(k * 2) * 0.04, Math.sin(k) * 0.06, 0.04, 0.035, 0.04, 6, 4)), [0xa0101a, 0xf2ece2, 0xb8202a][k % 3], 3);
  for (let k = 0; k < 4; k += 1) K.FB(T(limb([0, 0.96, 0], [Math.cos(k * 1.6) * 0.1, 1.04, Math.sin(k * 1.6) * 0.1], 0.004, 0.004, 3)), 0x2f5a2a);
  shadowAt(K, m, 0.8, 0.8);
}
// たんす（こげ茶・かんむりの かざり・パネルの とびら・金の とって）。+z が 前、原点は ゆかの まんなか。
function armoire(K, m, { w = 1.3, h = 2.3, d = 0.62, color = EBONY } = {}) {
  const T = tf(m), W2 = (g, a = 'y') => K.W(T(g), a, color);
  W2(box(0, 0.12, 0, w, h - 0.3, d), 'y'); W2(box(0, 0, 0, w + 0.08, 0.14, d + 0.06), 'x');
  W2(box(0, h - 0.18, 0, w + 0.1, 0.08, d + 0.08), 'x'); W2(box(0, h - 0.1, 0, w + 0.16, 0.1, d + 0.12), 'x');
  const crest = plate(archShape(0, 0, w * 0.7, 0.35), 0.05, { seg: 12 }); crest.translate(0, h, d / 2 - 0.02); W2(crest, 'x');
  K.MT(T(ell(0, h + 0.2, d / 2 + 0.005, 0.07, 0.07, 0.02, 8, 5)));
  for (const s of [-1, 1]) {
    W2(box(s * w / 4, 0.32, d / 2, w / 2 - 0.12, h - 0.85, 0.03), 'y');
    W2(box(s * w / 4, 0.42, d / 2 + 0.02, w / 2 - 0.26, h - 1.05, 0.02), 'y');
    K.MT(T(cyl(s * 0.05, 1.1, d / 2 + 0.04, 0.012, 0.012, 0.16, 8)), GOLD);
    for (const sz of [-1, 1]) K.W(T(ell(s * (w / 2 - 0.05), 0.04, sz * (d / 2 - 0.05), 0.06, 0.06, 0.06, 8, 5)), 'y', color);
  }
  K.W(T(box(0, 0.12, d / 2 + 0.002, 0.012, h - 0.42, 0.01)), 'y', 0x140a06);
  shadowAt(K, m, w + 0.5, d + 0.5);
}
// ランタン（かべ・街灯）：黒い わく・4 まいの ガラス（中から 光る）・電球。原点は ランタンの まんなか。
function lantern(K, m, s = 1, IRON = 0x1c1c1e) {
  const T = tf(m), q = (v) => v * s;
  K.MT(T(prism(4, 0, q(0.18), 0, q(0.15), q(0.02), q(0.16))), IRON); K.MT(T(ell(0, q(0.36), 0, q(0.025), q(0.03), q(0.025), 6, 4)), IRON);
  K.MT(T(prism(4, 0, q(-0.24), 0, q(0.09), q(0.13), q(0.05))), IRON); K.MT(T(prism(4, 0, q(0.15), 0, q(0.13), q(0.15), q(0.03))), IRON);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.MT(T(box(sx * q(0.11), q(-0.2), sz * q(0.11), q(0.018), q(0.36), q(0.018))), IRON);
  for (let k = 0; k < 4; k += 1) K.GL(T(new THREE.PlaneGeometry(q(0.21), q(0.34)).toNonIndexed().translate(0, q(-0.02), q(0.105)).rotateY(k * Math.PI / 2)), 4, 0.1);
  K.AR(T(ell(0, q(-0.04), 0, q(0.035), q(0.06), q(0.035), 7, 5)), A.white, 1, 0xffe0a8);
  const c = V3(0, q(-0.03), 0).applyMatrix4(m); haloAt(K, c.x, c.y, c.z, q(1.5), [0.95, 0.62, 0.26], true); haloAt(K, c.x, c.y, c.z, q(0.5), [0.5, 0.36, 0.18]);
}
// 鉢の フィドルリーフ（大きな 葉の 板）。
function fiddleFig(K, m, rnd, h = 1.7) {
  const T = tf(m);
  K.GS(T(lathe([[0.16, 0], [0.2, 0.05], [0.22, 0.38], [0.2, 0.42], [0.0, 0.42]], 16)), 0xd9d4ca);
  K.S(T(cyl(0, 0.38, 0, 0.19, 0.19, 0.02, 14)), 0x3a2a1e, STRIP.cobble, 2, 2);
  K.W(T(limb([0, 0.38, 0], [0.03, h * 0.75, 0.02], 0.025, 0.015, 6)), 'y', 0x5a4030);
  for (let i = 0; i < 26; i += 1) {
    const t = 0.35 + (i / 26) * 0.65, y = 0.4 + (h - 0.4) * t, a = i * 2.39, out = 0.08 + (1 - t) * 0.12, s = 0.3 + rnd() * 0.12;
    const g = new THREE.PlaneGeometry(s * 0.75, s).toNonIndexed(); g.translate(0, s / 2, 0); g.rotateX(-0.5 - rnd() * 0.5); g.rotateY(a); g.translate(Math.cos(a) * out, y - 0.1, -Math.sin(a) * out);
    K.LF(T(g), LEAF.fiddle, new THREE.Color(0.85 + rnd() * 0.3, 0.9 + rnd() * 0.2, 0.85 + rnd() * 0.2));
  }
  shadowAt(K, m, 0.9, 0.9);
}
// しげみの 玉（葉の 板を 6 まい いろいろな むきに）。
function bushBall(K, m, r, rnd) {
  const T = tf(m);
  for (let i = 0; i < 7; i += 1) { const g = new THREE.PlaneGeometry(r * 2.2, r * 2.2).toNonIndexed(); g.rotateX(rnd() * Math.PI); g.rotateY(rnd() * Math.PI); K.LF(T(g), LEAF.bush, new THREE.Color(0.8 + rnd() * 0.3, 0.85 + rnd() * 0.25, 0.8 + rnd() * 0.2)); }
}
// 花びん と バラ。
function vaseRoses(K, m, { vase = 0xf2eee6, rose = 0xa0101a, s = 1 } = {}) {
  const T = tf(m), q = (v) => v * s;
  K.GS(T(lathe([[q(0.05), 0], [q(0.09), q(0.06)], [q(0.1), q(0.16)], [q(0.05), q(0.28)], [q(0.07), q(0.34)]], 14)), vase);
  for (let k = 0; k < 9; k += 1) { const a = k * 2.4, r2 = q(0.05 + (k % 3) * 0.035); K.FB(T(ell(Math.cos(a) * r2, q(0.44) + (k % 2) * q(0.04), Math.sin(a) * r2, q(0.038), q(0.032), q(0.038), 7, 5)), rose, 3); }
  for (let k = 0; k < 6; k += 1) { const g = new THREE.PlaneGeometry(q(0.18), q(0.18)).toNonIndexed(); g.rotateX(-0.9); g.rotateY(k); g.translate(Math.cos(k) * q(0.07), q(0.36), Math.sin(k) * q(0.07)); K.LF(T(g), LEAF.bush, 0x9fb88f); }
}
// テーブル ランプ（金の 台・布の かさ・光）。
function tableLamp(K, m, shade = 0xf1e3c2) {
  const T = tf(m);
  K.MT(T(lathe([[0.08, 0], [0.08, 0.02], [0.03, 0.05], [0.05, 0.15], [0.02, 0.32], [0.015, 0.42]], 12)));
  K.FB(T(lathe([[0.17, 0.36], [0.1, 0.58]], 16)), shade);
  K.AR(T(lathe([[0.165, 0.37], [0.098, 0.575]], 16).scale(0.99, 1, 0.99)), A.warm, 1, 0xffd9a0);
  K.GW(T(new THREE.PlaneGeometry(0.9, 0.9).toNonIndexed().translate(0, 0.5, 0)), A.blob, [0.3, 0.22, 0.12]);
}
// ゆかに 立つ ランプ。
function floorLamp(K, m) {
  const T = tf(m);
  K.MT(T(lathe([[0.16, 0], [0.16, 0.02], [0.04, 0.05], [0.02, 0.3], [0.015, 1.45]], 12)));
  K.FB(T(lathe([[0.24, 1.32], [0.15, 1.6]], 18)), 0xefe0c0);
  K.AR(T(lathe([[0.235, 1.33], [0.148, 1.595]], 18).scale(0.99, 1, 0.99)), A.warm, 1, 0xffd9a0);
  K.GW(T(new THREE.PlaneGeometry(1.2, 1.2).toNonIndexed().translate(0, 1.45, 0)), A.blob, [0.32, 0.24, 0.13]);
  shadowAt(K, m, 0.7, 0.7);
}

/* ───────── まとめて 1 つの group に ───────── */

function makeMaterials(SHT, key, lightCfg, aoCfg, night, time) {
  const light = lightGLSL(lightCfg), ao = aoGLSL(aoCfg);
  const M2 = {
    surf: enhance(new THREE.MeshStandardMaterial({ map: SHT.surf, vertexColors: true, roughness: 1, metalness: 0, envMap: SHT.envI, envMapIntensity: 0.5, color: SHT.surf ? 0xffffff : 0xdedad2 }), { key: `${key}-surf`, light, ao, strips: true, night }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 1, envMap: SHT.envI, envMapIntensity: 1.35 }),
    gloss: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.13, metalness: 0, envMap: SHT.envI, envMapIntensity: 0.95 }), { key: `${key}-gloss`, light, night }),
    fabric: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMap: SHT.envI, envMapIntensity: 0.3 }), { key: `${key}-fab`, light, ao, fabric: true, night }),
    glass: glassMaterial(SHT, night),
    art: artMaterial(SHT, night, light, key),
    glow: glowMaterial(SHT, night),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, map: SHT.art, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    leaf: new THREE.MeshStandardMaterial({ map: SHT.leaves, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, color: SHT.leaves ? 0xffffff : 0x3f7a2e }),
  };
  M2.glass.uniforms.uTime = time;
  return M2;
}
// 材質ごとの 形を 1 メッシュずつ・たたんだ Tシャツ（InstancedMesh）・きらめき（Points）・人（InstancedMesh）。
function assemble(group, B, K, M2, { people = [], sitters = [], walkers = [], rnd, time, shadows = true }) {
  const order = { glass: 5, glow: 6, shadow: 2 };
  const { meshes } = B.flush(group, M2, { noShadow: ['glass', 'glow', 'shadow', 'art', 'leaf'] });
  for (const [k, ms] of Object.entries(meshes)) { ms.name = `shop-${k}`; if (order[k]) ms.renderOrder = order[k]; if (!shadows) { ms.castShadow = false; } }
  if (meshes.glass) meshes.glass.receiveShadow = false;
  // たたんだ Tシャツ・ニット（色ちがい）。
  if (K.TEES.length) {
    const g = new THREE.BoxGeometry(0.3, 0.034, 0.25, 2, 1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) if (p.getY(i) > 0 && Math.abs(p.getX(i)) < 0.01 && Math.abs(p.getZ(i)) < 0.01) p.setY(i, p.getY(i) + 0.006);
    for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * (1 - 0.06 * Math.abs(z) / 0.125), p.getY(i) - Math.abs(x) * 0.03, z); }
    g.computeVertexNormals(); const gg = ni(g); gg.translate(0, 0.017, 0);
    gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 3).fill(1), 3));
    const im = new THREE.InstancedMesh(gg, M2.fabric, K.TEES.length), o = new THREE.Object3D(), c = new THREE.Color();
    K.TEES.forEach((t, i) => { o.position.set(t.x, t.y, t.z); o.rotation.set(0, t.ry || 0, 0); o.scale.set(t.s || 1, 1, t.s || 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.setHex(t.color)); });
    im.name = 'shop-folded'; im.castShadow = false; im.receiveShadow = true; group.add(im);
  }
  // きらめき。
  if (K.SP.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(K.SP, 3));
    const ph = new Float32Array(K.SP.length / 3); for (let i = 0; i < ph.length; i += 1) ph[i] = hash(i * 1.37, 3.1);
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const pts = new THREE.Points(g, M2.sparkle); pts.name = 'shop-sparkle'; pts.renderOrder = 7; pts.frustumCulled = false; group.add(pts);
  }
  const pm = M2.people;
  if (people.length || walkers.length) {
    const list = people.concat(walkers.map((w) => ({ ...w.look, x: w.x ?? 0, y: w.y, z: w.z ?? 0, walk: [rnd() * 6.28, w.amp, 0] })));
    group.add(crowd(list, false, rnd, pm, 'shop-people'));
  }
  if (sitters.length) group.add(crowd(sitters, true, rnd, pm, 'shop-sitters'));
}
function walkUpdater(group, walkers, nStand, time) {
  const people = group.getObjectByName('shop-people'), o3 = new THREE.Object3D();
  walkers.forEach((w) => { const len = (w.x1 ?? w.z1) - (w.x0 ?? w.z0), speed = 0.7 + hash(w.y + len, w.x0 ?? w.z0) * 0.4; w.v = speed / len; w.s ||= 0.97; w.amp = Math.asin(Math.min(0.6, speed / (4 * 0.9 * w.s * 0.875))); w.p ||= hash(len, 2) * 2; });
  return (t) => {
    time.value = t; if (!people) return;
    for (let i = 0; i < walkers.length; i += 1) {
      const w = walkers[i], ph = (w.p + t * w.v) % 2, f = ph < 1 ? ph : 2 - ph, dir = ph < 1 ? 1 : -1;
      const e = Math.min(f, 1 - f) < 0.03 ? 0 : 1;
      if (w.x0 !== undefined) { o3.position.set(w.x0 + (w.x1 - w.x0) * f, w.y, w.z); o3.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
      else { o3.position.set(w.x, w.y, w.z0 + (w.z1 - w.z0) * f); o3.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); }
      o3.scale.set(w.s * 0.97, w.s, w.s * e + w.s * (1 - e)); o3.updateMatrix(); people.setMatrixAt(nStand + i, o3.matrix);
    }
    people.instanceMatrix.needsUpdate = true;
  };
}
function countTris(group) { let tris = 0; group.traverse((o) => { if (o.isMesh) tris += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); }); return Math.round(tris); }
const roundOb = (o) => ({ x: +o.x.toFixed(2), z: +o.z.toFixed(2), w: +o.w.toFixed(2), d: +o.d.toFixed(2) });

// 前の 歩道・ふち石・石だたみの 道。
function street(K, { x0, x1, zWall, zKerb, zEnd }) {
  K.slab(box((x0 + x1) / 2, -0.06, (zWall + zKerb) / 2, x1 - x0, 0.06, zKerb - zWall), 0xf4f0ea);
  K.granite(box((x0 + x1) / 2, -0.2, zKerb + 0.1, x1 - x0, 0.2, 0.2), 0x9a968e);
  K.cobble(box((x0 + x1) / 2, -0.24, (zKerb + 0.2 + zEnd) / 2, x1 - x0, 0.06, zEnd - zKerb - 0.2), 0xd8d2ca);
}
// 街灯（鉄の 柱・ランタン・足もとの 光の 輪）。
function streetLamp(K, x, z, { h = 3.9, color = IRON } = {}) {
  const m = M(x, 0, z);
  K.MT(lathe([[0.16, 0], [0.16, 0.06], [0.11, 0.12], [0.08, 0.5], [0.06, 0.62], [0.05, 1.0], [0.04, h - 0.4], [0.06, h - 0.3]], 12).applyMatrix4(m), color);
  for (const s of [-1, 1]) K.MT(tube([[0, h - 0.6, 0], [s * 0.25, h - 0.45, 0], [s * 0.42, h - 0.32, 0]], 0.022, 8, 4).applyMatrix4(m), color);
  for (const s of [-1, 1]) lantern(K, M(x + s * 0.42, h - 0.55, z), 0.95, color);
  K.GW(floorQuad(x, 0.02, z, 5.5, 5.5, A.blob), A.blob, [0.4, 0.27, 0.12], true);
  K.SH(floorQuad(x, 0.015, z, 0.6, 0.6, A.blob));
}

/* ───────── MAISON U（服の お店）───────── */

export const BOUTIQUE = { w: 16, d: 14, height: 9.3, floor: 0.15, ceiling: 7.6, mezz: { y: 3.75, z: -2.4 }, door: { x: -4.6, z: 7.9 }, entrance: { x: -4.6, z: 5.6, ry: Math.PI } };

export function buildBoutique(opts = {}) {
  const t0 = now(), { shadows = true } = opts;
  const SHT = shared(), rnd = rng(1201), time = { value: 0 }, night = { n: { value: 0 }, pool: { value: 0.3 } };
  const group = new THREE.Group(); group.name = 'boutique';
  const HX = 8, HZ = 7, IX = 7.65, IZB = -6.65, IZF = 6.45, FL = BOUTIQUE.floor, CE = BOUTIQUE.ceiling, MZ = BOUTIQUE.mezz, TOP = 8.6, DX = -4.6;
  const LANT = [[DX - 1.45, 2.6, 7.3], [DX + 1.45, 2.6, 7.3], [7.15, 3.3, 7.25]];
  const M2 = makeMaterials(SHT, 'boutique',
    { x0: -IX, x1: IX, z0: IZB, z1: IZF, top: CE, mezz: MZ, sp: 2.2, ox: 0.0, oz: 0.3, wsp: 1.8, lamps: LANT.map(([x, y, z]) => [x, y + 0.2, z - 0.25, 1.5, 1.8, 6.9]).concat([[2.4, 4.2, 7.1, 3.6, 0.5, 6.9]]) },
    { x0: -IX, x1: IX, z0: IZB, z1: IZF, floor: FL, mezz: MZ, top: CE }, night, time);
  M2.sparkle = sparkleMaterial(night, time); M2.people = peopleMaterial(time);
  const B = createBatch({}), K = makeKit(B), obstacles = [], ob = (x, z, w, d) => obstacles.push(roundOb({ x, z, w, d }));

  /* 外：歩道・道・建物の 箱 */
  street(K, { x0: -12, x1: 12, zWall: HZ, zKerb: 11, zEnd: 17 });
  K.stone(box(-HX + 0.175, 0, 0, 0.35, TOP, HZ * 2 - 0.02), 0xc8bca8); K.stone(box(HX - 0.175, 0, 0, 0.35, TOP, HZ * 2 - 0.02), 0xc8bca8);
  K.stone(box(0, 0, -HZ + 0.175, HX * 2, TOP, 0.35), 0xc8bca8);
  K.stone(box(0, CE + 0.05, 0, HX * 2 - 0.4, TOP - CE - 0.05, HZ * 2 - 0.4), 0x6a645c);
  K.plaster(box(0, CE, -0.1, IX * 2, 0.05, IZF - IZB), 0xf3ecdf);
  K.stone(box(0, TOP, 0, HX * 2 + 0.3, 0.12, HZ * 2 + 0.3), 0xb9ad98);
  // 正面の かべ（あなの あいた 石の 板）：入口の アーチ・ショーウインドー・2 かいの アーチの まど 3 つ。
  const UPW = [-4.6, 0.8, 4.8], WIN = { x0: -1.8, x1: 6.6, y0: 0.78, y1: 4.1 };
  const front = (mx) => {
    const s = rectShape(-HX, 0, HX, TOP + 0.65);
    s.holes.push(archPath(mx * DX, FL, 1.8, 3.25));
    { const h = new THREE.Path(); const a = mx > 0 ? WIN.x0 : -WIN.x1, b = mx > 0 ? WIN.x1 : -WIN.x0; h.moveTo(a, WIN.y0); h.lineTo(b, WIN.y0); h.lineTo(b, WIN.y1); h.lineTo(a, WIN.y1); h.lineTo(a, WIN.y0); s.holes.push(h); }
    for (const x of UPW) s.holes.push(archPath(mx * x, 5.55, 1.5, 2.4));
    return s;
  };
  { const g = plate(front(1), 0.55, { seg: 12 }); g.translate(0, 0, HZ); K.stone(g, 0xd6cab4); }
  { const g = plate(front(-1), 0.01, { seg: 12, rim: false }); g.rotateY(Math.PI); g.translate(0, 0, IZF + 0.005); K.plaster(g, 0xefe6d6); }
  // 石の かざり：台石・おび・コーニス・パラペット・すみ石・アーチの 石・かなめ石。
  K.stone(box(-HX / 2 - 0.1 + 0.0, 0, HZ + 0.05, HX - 0.2 - 0.9 * 2 + 1.6, 0.0001, 0.1), 0x8a8070);
  for (const [a, b] of [[-HX, DX - 1.02], [DX + 1.02, WIN.x0], [WIN.x1, HX]]) K.stone(box((a + b) / 2, 0, HZ + 0.05, b - a, 0.72, 0.12), 0x9e9282);
  K.stone(box(2.4, WIN.y0 - 0.12, HZ + 0.1, WIN.x1 - WIN.x0 + 0.4, 0.12, 0.3), 0xb2a690);
  K.stone(box(0, 5.15, HZ + 0.07, HX * 2 + 0.1, 0.24, 0.16), 0xc9bda6);
  K.stone(box(0, TOP - 0.3, HZ + 0.12, HX * 2 + 0.3, 0.18, 0.26), 0xd0c4ae); K.stone(box(0, TOP - 0.12, HZ + 0.2, HX * 2 + 0.45, 0.14, 0.42), 0xd6cab4);
  for (let x = -HX + 0.1; x < HX; x += 0.32) K.stone(box(x, TOP - 0.42, HZ + 0.12, 0.14, 0.12, 0.18), 0xc8bca6);
  for (const s of [-1, 1]) for (let i = 0; i < 18; i += 1) { const w = i % 2 ? 0.55 : 0.85; K.stone(box(s * (HX - w / 2 + 0.03), i * 0.47, HZ + 0.03, w, 0.44, 0.08), 0xd8ccb6); K.stone(box(s * (HX + 0.03), i * 0.47, HZ - w / 2 + 0.02, 0.08, 0.44, w), 0xd8ccb6); }
  { const g = plate(archRing(DX, FL, 1.8, 3.25, 0.34), 0.08, { seg: 14 }); g.translate(0, 0, HZ + 0.08); K.stone(g, 0xe2d6c0); }
  K.stone(box(DX, 3.12 + FL, HZ + 0.1, 0.32, 0.5, 0.14), 0xe8dcc6);
  K.stone(box(DX, 0, HZ + 0.35, 2.4, FL, 0.7), 0xb8ad9a);
  for (const x of UPW) {
    const g = plate(archRing(x, 5.55, 1.5, 2.4, 0.22), 0.06, { seg: 12 }); g.translate(0, 0, HZ + 0.06); K.stone(g, 0xe0d4be);
    K.stone(box(x, 5.42, HZ + 0.12, 1.9, 0.13, 0.3), 0xc8bca6);
    // 鉄の バルコネット
    K.MT(box(x, 5.95, HZ + 0.3, 1.7, 0.03, 0.03), IRON); K.MT(box(x, 5.56, HZ + 0.3, 1.7, 0.03, 0.03), IRON);
    for (let k = 0; k <= 10; k += 1) K.MT(cyl(x - 0.8 + k * 0.16, 5.56, HZ + 0.3, 0.008, 0.008, 0.4, 4), IRON);
    for (let k = 0; k < 5; k += 1) K.MT(torus(0.07, 0.008, 3, 10).translate(x - 0.64 + k * 0.32, 5.78, HZ + 0.3), IRON);
    for (const s of [-1, 1]) K.MT(box(x + s * 0.85, 5.56, HZ + 0.15, 0.03, 0.03, 0.3), IRON);
    // ガラスと まどわく・中の カーテン（あたたかい 光）
    const gl = new THREE.ShapeGeometry(archShape(x, 5.55, 1.5, 2.4), 12).toNonIndexed(); gl.translate(0, 0, HZ - 0.3); K.GL(gl, 0, 0.06, 0.7);
    K.W(box(x, 5.55, HZ - 0.3, 0.06, 2.1, 0.06), 'y', 0x2a1a10); K.W(box(x, 6.6, HZ - 0.3, 1.5, 0.06, 0.06), 'x', 0x2a1a10);
    for (const s of [-1, 1]) curtain(K, M(x + s * 0.56, 7.35, HZ - 0.5), 0.42, 1.8, 0xe9dcc4, { kind: 0 });
  }
  // 入口の アーチの とびら（こげ茶の 木・パネル・真鍮の とって・上は 光る ガラス）。
  {
    for (const s of [-1, 1]) {
      const x = DX + s * 0.43;
      K.W(box(x, FL, HZ - 0.36, 0.84, 2.42, 0.07), 'y', 0x3a2416);
      for (const [y, h] of [[0.25, 0.9], [1.3, 1.1]]) { K.W(box(x, FL + y, HZ - 0.32, 0.6, h, 0.025), 'y', 0x4a3020); K.W(box(x, FL + y + 0.06, HZ - 0.305, 0.48, h - 0.12, 0.02), 'y', 0x3a2416); }
      K.MT(cyl(DX + s * 0.1, FL + 1.1, HZ - 0.29, 0.014, 0.014, 0.32, 8), BRASS); K.MT(box(x, FL + 0.02, HZ - 0.31, 0.76, 0.18, 0.012), BRASS);
    }
    K.W(box(DX, FL + 2.42, HZ - 0.36, 1.8, 0.1, 0.1), 'x', 0x2a1a10);
    const fan = new THREE.ShapeGeometry(archShape(DX, FL + 2.52, 1.8, 0.73), 14).toNonIndexed(); fan.translate(0, 0, HZ - 0.38); K.GL(fan, 5, 0.05);
    for (let k = 1; k < 6; k += 1) { const a = (k / 6) * Math.PI; K.W(beam([DX, FL + 2.52, HZ - 0.37], [DX + Math.cos(a) * 0.88, FL + 2.52 + Math.sin(a) * 0.88, HZ - 0.37], 0.04, 0.04), 'x', 0x2a1a10); }
    K.GW(floorQuad(DX, 0.03, HZ + 0.9, 2.6, 1.8, A.blob), A.blob, [0.3, 0.2, 0.09], true);
  }
  // ショーウインドー：こげ茶の わく・たての さん・上の 欄間・ガラス・中の 光が 歩道へ。
  {
    const FR = 0x241710, wx = (WIN.x0 + WIN.x1) / 2, ww = WIN.x1 - WIN.x0;
    K.W(box(wx, WIN.y0, HZ - 0.28, ww, 0.12, 0.3), 'x', FR); K.W(box(wx, WIN.y1 - 0.12, HZ - 0.28, ww, 0.12, 0.3), 'x', FR); K.W(box(wx, 3.45, HZ - 0.28, ww, 0.08, 0.12), 'x', FR);
    for (const x of [WIN.x0 + 0.06, 1.0, 3.8, WIN.x1 - 0.06]) K.W(box(x, WIN.y0, HZ - 0.28, 0.12, WIN.y1 - WIN.y0, 0.16), 'y', FR);
    for (const x of [-0.4, 2.4, 5.2]) for (const s of [-1, 1]) K.MT(box(x + s * 0.0, 3.53, HZ - 0.2, 1.2, 0.012, 0.012), BRASS);
    const g = new THREE.PlaneGeometry(ww - 0.1, WIN.y1 - WIN.y0 - 0.1).toNonIndexed(); g.translate(wx, (WIN.y0 + WIN.y1) / 2, HZ - 0.3); K.GL(g, 0, 0.06, 0.85);
    K.GW(floorQuad(wx, 0.025, HZ + 1.8, ww + 1, 3.4, A.blob), A.blob, [0.32, 0.22, 0.12], true);
    // 看板の 板（金の ふち）と 絵の 看板。
    K.W(box(wx, 4.26, HZ + 0.03, ww + 0.4, 0.86, 0.12), 'x', 0x1e140e);
    K.MT(box(wx, 4.26, HZ + 0.1, ww + 0.4, 0.035, 0.04)); K.MT(box(wx, 5.09, HZ + 0.1, ww + 0.4, 0.035, 0.04));
    K.AR(new THREE.PlaneGeometry(3.2, 0.8).toNonIndexed().translate(wx, 4.69, HZ + 0.095), A.signB, 2);
    for (const s of [-1, 1]) { K.MT(cyl(wx + s * 2.3, 5.2, HZ + 0.15, 0.015, 0.015, 0.1, 6), BRASS); K.MT(beam([wx + s * 2.3, 5.25, HZ + 0.1], [wx + s * 2.3, 5.3, HZ + 0.55], 0.025, 0.025), BRASS); K.MT(lathe([[0.02, 0], [0.12, -0.12], [0.13, -0.14]], 12).translate(wx + s * 2.3, 5.3, HZ + 0.55), BRASS); K.AR(ell(wx + s * 2.3, 5.18, HZ + 0.55, 0.04, 0.02, 0.04, 6, 3), A.white, 1, 0xffe8c0); }
    K.GW(new THREE.PlaneGeometry(ww + 0.6, 1.2).toNonIndexed().translate(wx, 4.5, HZ + 0.12), A.streak, [0.3, 0.22, 0.12], true);
  }
  for (const [x, y, z] of LANT) { K.MT(tube([[x, y + 0.2, HZ], [x, y + 0.35, z - 0.1], [x, y + 0.42, z]], 0.02, 8, 4), IRON); K.MT(box(x, y + 0.05, HZ + 0.01, 0.14, 0.32, 0.04), IRON); lantern(K, M(x, y, z), 1.0); }
  // ツタの プランター（ショーウインドーの 下）。
  {
    const x0 = WIN.x0 + 0.1, x1 = WIN.x1 - 0.1, cx = (x0 + x1) / 2;
    K.W(box(cx, 0.05, HZ + 0.3, x1 - x0, 0.55, 0.5), 'x', 0x3a2618); K.W(box(cx, 0.6, HZ + 0.3, x1 - x0 + 0.08, 0.05, 0.56), 'x', 0x2e1d12);
    K.S(box(cx, 0.6, HZ + 0.3, x1 - x0 - 0.1, 0.02, 0.4), 0x3a2a1e, STRIP.cobble, 2, 2);
    for (let i = 0; i < 46; i += 1) { const x = x0 + 0.1 + rnd() * (x1 - x0 - 0.2), z = HZ + 0.18 + rnd() * 0.26, s = 0.28 + rnd() * 0.22; const g = new THREE.PlaneGeometry(s, s).toNonIndexed(); g.rotateX(-0.3 - rnd() * 0.6); g.rotateY((rnd() - 0.5) * 1.6); g.translate(x, 0.66 + s * 0.3, z); K.LF(g, LEAF.bush, new THREE.Color(0.8 + rnd() * 0.3, 0.85 + rnd() * 0.25, 0.8 + rnd() * 0.25)); }
    for (let i = 0; i < 22; i += 1) { const x = x0 + 0.1 + rnd() * (x1 - x0 - 0.2), h = 0.4 + rnd() * 0.45; const g = new THREE.PlaneGeometry(0.2, h).toNonIndexed(); g.translate(x, 0.66 - h / 2, HZ + 0.57 + rnd() * 0.03); K.LF(g, [LEAF.ivy[0] + 0.33 * Math.floor(rnd() * 3) * 0.5, 0.2, LEAF.ivy[0] + 0.33 * Math.floor(rnd() * 3) * 0.5 + 0.15, 1.0], new THREE.Color(0.85 + rnd() * 0.2, 0.9, 0.85)); }
    ob(cx, HZ + 0.3, (x1 - x0) / 2, 0.3);
  }
  fiddleFig(K, M(-2.75, 0, HZ + 0.55), rnd, 1.9); ob(-2.75, HZ + 0.55, 0.3, 0.3);
  // かさたて。
  { const x = DX - 1.55, z = HZ + 0.4; K.MT(cyl(x, 0, z, 0.13, 0.12, 0.55, 14), 0x2a2a2c); K.MT(torus(0.13, 0.012, 4, 14).rotateX(Math.PI / 2).translate(x, 0.55, z), BRASS);
    for (const [c, a] of [[0x14213d, 0.3], [0x7a1c22, 2.4], [0x1a1a1a, 4.4]]) { const dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05; K.FB(cyl(x + dx, 0.15, z + dz, 0.035, 0.01, 0.65, 8), c); K.W(tube([[x + dx, 0.8, z + dz], [x + dx, 0.92, z + dz], [x + dx + 0.04, 0.95, z + dz], [x + dx + 0.07, 0.9, z + dz]], 0.012, 6, 4), 'y', 0x4a2e1a); }
    ob(x, z, 0.15, 0.15); }
  // 入口の よこの まるい うえこみ。
  for (const s of [-1, 1]) { const x = DX + s * 1.25, z = HZ + 0.55; if (s > 0) continue; K.GS(lathe([[0.16, 0], [0.2, 0.42], [0.22, 0.45], [0.0, 0.45]], 14).translate(x, 0, z), 0x1b1b1c); bushBall(K, M(x, 0.82, z), 0.34, rnd); }
  // ポスターの 台（A 形・黒い わく）。
  { const x = -0.6, z = 9.1, ry = 0.5, m = M(x, 0, z, ry), T = tf(m);
    for (const s of [-1, 1]) { const g = new THREE.Group(); const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, s * 0.18)).multiply(new THREE.Matrix4().makeRotationX(s * 0.16));
      K.MT(box(0, 0, 0, 0.66, 1.15, 0.04).applyMatrix4(mm), IRON); K.AR(new THREE.PlaneGeometry(0.56, 0.84).toNonIndexed().translate(0, 0.64, 0.021).rotateY(s < 0 ? Math.PI : 0).applyMatrix4(mm), A.poster, 0); g.clear(); }
    K.SH(T(floorQuad(0, 0.015, 0, 1.0, 0.8, A.blob))); ob(x, z, 0.4, 0.35); }
  streetLamp(K, 7.3, 10.55); ob(7.3, 10.55, 0.2, 0.2);
  // 前の かべの 当たり判定（入口だけ あける）・まわりの かべ。
  ob((-HX + DX - 0.95) / 2, HZ - 0.28, (DX - 0.95 + HX) / 2, 0.3); ob((DX + 0.95 + HX) / 2, HZ - 0.28, (HX - DX - 0.95) / 2, 0.3);
  ob(-HX + 0.18, 0, 0.18, HZ); ob(HX - 0.18, 0, 0.18, HZ); ob(0, -HZ + 0.18, HX, 0.18);

  /* 中：床・かべ・中2かい */
  const SX = -1.6;   // ストリート ｜ エレガント の さかい
  K.checker(box((-IX + SX) / 2, FL - 0.06, (IZB + IZF) / 2, SX + IX, 0.06, IZF - IZB), 0xffffff);
  K.marble(box((SX + IX) / 2, FL - 0.06, (IZB + IZF) / 2, IX - SX, 0.06, IZF - IZB), 0xffffff);
  K.MT(box(SX, FL - 0.001, (IZB + IZF) / 2, 0.04, 0.005, IZF - IZB), BRASS);
  K.stone(box(0, 0, 0, HX * 2 - 0.4, FL - 0.06, HZ * 2 - 0.4), 0x8a8070);
  K.brick(box(-IX + 0.01, FL, (IZB + IZF) / 2, 0.02, CE - FL, IZF - IZB), 0xffffff);
  K.plaster(box(IX - 0.01, FL, (IZB + IZF) / 2, 0.02, CE - FL, IZF - IZB), 0xf1e8d8);
  K.plaster(box(0, FL, IZB + 0.01, IX * 2, CE - FL, 0.02), 0xf3ede2);
  // グラフィティ（れんがの かべ）。
  K.AR(new THREE.PlaneGeometry(6.4, 3.2).toNonIndexed().rotateY(Math.PI / 2).translate(-IX + 0.025, 3.55, 1.3), A.mural, 0);
  // 右の かべの はめこみパネル・こしいた・天井の まわりぶち。
  for (let z = 3.6; z > IZB; z -= 1.65) { if (z < MZ.z + 0.8 && z > MZ.z - 0.8) continue; for (const [y0, h] of z > MZ.z ? [[1.25, 2.0], [4.3, 2.6]] : [[4.3, 2.6]]) { const yy = y0 + FL; for (const [dy, hh] of [[0, 0.035], [h - 0.035, 0.035]]) K.GS(box(IX - 0.04, yy + dy, z, 0.03, hh, 1.2), 0xf6efe2); for (const s of [-1, 1]) K.GS(box(IX - 0.04, yy, z + s * 0.6, 0.03, h, 0.035), 0xf6efe2); } }
  K.GS(box(IX - 0.03, FL, (IZB + IZF) / 2 + 1, 0.04, 0.95, IZF - IZB - 2), 0xefe6d6); K.MT(box(IX - 0.05, FL + 0.95, (IZB + IZF) / 2 + 1, 0.03, 0.03, IZF - IZB - 2), BRASS);
  for (const [x, z, w, d] of [[IX - 0.12, (IZB + IZF) / 2, 0.24, IZF - IZB], [0, IZB + 0.12, IX * 2, 0.24], [0, IZF - 0.12, IX * 2, 0.24], [-IX + 0.12, (IZB + IZF) / 2, 0.24, IZF - IZB]]) { K.GS(box(x, CE - 0.22, z, w, 0.22, d), 0xf6efe2); K.MT(box(x, CE - 0.26, z, w + 0.01, 0.025, d + 0.01), BRASS); }
  // 天井の ダウンライト（光の 輪の 式と 同じ ならび）。
  const can = (x, y, z) => { K.MT(cyl(x, y - 0.02, z, 0.09, 0.09, 0.02, 14), 0xe6dcc8); K.AR(cyl(x, y - 0.025, z, 0.065, 0.065, 0.006, 12), A.white, 1, 0xfff0d8); };
  for (let x = -IX + 1.1; x < IX; x += 2.2) for (let z = IZB + 0.15 + 1.1 * 0 + ((0.3 - IZB) % 2.2) - 1.1 + 2.2; z < IZF; z += 2.2) { if (z < MZ.z) can(x, MZ.y - 0.3, z); else can(x, CE, z); }
  // 中2かい：床・ふちの 木・ガラスの てすり・はしら。
  K.plaster(box(0, MZ.y - 0.32, (IZB + MZ.z) / 2, IX * 2, 0.27, MZ.z - IZB), 0xf2ebde);
  K.oak(box(0, MZ.y - 0.05, (IZB + MZ.z) / 2, IX * 2, 0.05, MZ.z - IZB), 0xb08a68);
  K.W(box(0, MZ.y - 0.34, MZ.z + 0.02, IX * 2, 0.36, 0.06), 'x', 0x2a1a10); K.MT(box(0, MZ.y - 0.1, MZ.z + 0.06, IX * 2, 0.03, 0.02), BRASS);
  const RAIL1 = 5.95;
  K.GL(new THREE.PlaneGeometry(RAIL1 + IX, 1.0).toNonIndexed().translate((RAIL1 - IX) / 2, MZ.y + 0.52, MZ.z + 0.04), 1, 0.06);
  K.W(box((RAIL1 - IX) / 2, MZ.y + 1.02, MZ.z + 0.04, RAIL1 + IX, 0.07, 0.1), 'x', 0x2a1a10);
  for (let x = -IX + 0.3; x < RAIL1; x += 1.2) K.MT(cyl(x, MZ.y, MZ.z + 0.04, 0.02, 0.02, 1.02, 8), BRASS);
  for (const x of [-4.0, 1.6]) { K.GS(cyl(x, FL, MZ.z + 0.15, 0.16, 0.18, MZ.y - 0.34 - FL, 16), 0xf3ede2); K.MT(cyl(x, MZ.y - 0.55, MZ.z + 0.15, 0.2, 0.16, 0.22, 16)); K.MT(cyl(x, FL, MZ.z + 0.15, 0.22, 0.22, 0.12, 16)); ob(x, MZ.z + 0.15, 0.2, 0.2); }
  // こげ茶の 木の かいだん（右の かべ ぞい・前から おくへ のぼる）。
  {
    const N = 20, z0 = 3.05, z1 = MZ.z, x0 = RAIL1, x1 = IX - 0.02, rise = (MZ.y - FL) / N, run = (z0 - z1) / N, cx = (x0 + x1) / 2;
    for (let i = 0; i < N; i += 1) { const y = FL + (i + 1) * rise, z = z0 - (i + 0.5) * run; K.W(box(cx, y - 0.045, z - 0.01, x1 - x0, 0.045, run + 0.03), 'x', 0x2b1a10); K.GS(box(cx, y - rise, z + run / 2 - 0.01, x1 - x0 - 0.02, rise - 0.045, 0.015), 0xf1ebe0); K.MT(cyl(x0 + 0.05, y, z, 0.012, 0.012, 0.92, 6), 0x2a2a2a); }
    K.W(beam([x0, FL + 0.25, z0], [x0, MZ.y, z1], 0.08, 0.42), 'z', 0x24160d);
    K.W(beam([x0 + 0.05, FL + 0.95, z0 - 0.1], [x0 + 0.05, MZ.y + 0.95, z1], 0.07, 0.06), 'z', 0x2b1a10);
    K.W(box(x0 + 0.05, FL, z0 + 0.02, 0.14, 1.2, 0.14), 'y', 0x24160d); K.MT(ell(x0 + 0.05, FL + 1.25, z0 + 0.02, 0.07, 0.06, 0.07, 8, 5), BRASS);
    const dz = Math.hypot(z0 - z1, MZ.y - FL), sl = box(0, -0.06, 0, x1 - x0, 0.06, dz); sl.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.atan2(MZ.y - FL, z0 - z1))); sl.translate(cx, FL + 0.02, (z0 + z1) / 2 + 0.0); sl.translate(0, (MZ.y - FL) / 2 - 0.16, 0); K.W(sl, 'z', 0x2b1a10);
    K.FB(box(cx, FL + 0.002, z0 + 0.5, x1 - x0 - 0.1, 0.01, 0.8), 0x5c1018, 3);
    ob(cx, (z0 + z1) / 2 + 0.6, (x1 - x0) / 2 + 0.05, (z0 - z1) / 2 + 0.4);
  }

  /* エレガントな がわ（右） */
  // ウインドーの 台と マネキン（黒い ドレス・クリームの コート・ボルドーの ミニ）。
  K.GS(box(2.4, FL, 5.85, 7.6, 0.24, 1.15), 0xf0e9dc); K.MT(box(2.4, FL + 0.24, 6.43, 7.6, 0.02, 0.02), BRASS); ob(2.4, 5.85, 3.8, 0.6);
  mannequin(K, M(2.5, FL + 0.24, 5.85, 0.05), { dress: 0x0b0b0d, style: 'gown' });
  mannequin(K, M(4.9, FL + 0.24, 5.75, -0.35), { dress: 0xd9c9ad, style: 'coat', pose: 1 });
  mannequin(K, M(0.3, FL + 0.24, 5.8, 0.4), { dress: 0x6e0f1e, style: 'mini', body: 0x1a1a1a });
  for (const [x, c, k] of [[-1.05, 0x7a1c22, 0], [-0.55, 0xd8c6a6, 1], [6.0, 0x141414, 0], [5.9, 0xc9a26a, 2]]) { K.GS(box(x, FL + 0.24, k === 2 ? 5.5 : 5.95, 0.42, 0.42, 0.42), 0x161616); K.MT(box(x, FL + 0.66, k === 2 ? 5.5 : 5.95, 0.43, 0.012, 0.43)); handbag(K, M(x, FL + 0.67, k === 2 ? 5.5 : 5.95, 0.2), c, k); }
  // -50% の 札（ガラスの すぐ 中に つるす）。
  K.AR(new THREE.PlaneGeometry(0.42, 0.42).toNonIndexed().translate(5.7, 2.9, IZF - 0.08), A.sale, 0); K.MT(cyl(5.7, 3.1, IZF - 0.08, 0.002, 0.002, 1.0, 3), 0x888888);
  // 右の かべの バッグの たな（うしろが 光る）。
  {
    const z0 = 3.4, z1 = 6.2, cz = (z0 + z1) / 2, x = IX - 0.25;
    K.W(box(x, FL, cz, 0.5, 3.2, z1 - z0), 'y', 0x2a1a10);
    K.AR(new THREE.PlaneGeometry(z1 - z0 - 0.16, 2.7).toNonIndexed().rotateY(-Math.PI / 2).translate(x - 0.24, FL + 0.35 + 1.35, cz), A.warm, 1, 0x7a6450);
    for (let k = 0; k < 4; k += 1) { const y = FL + 0.35 + k * 0.7; K.W(box(x - 0.02, y, cz, 0.46, 0.04, z1 - z0 - 0.12), 'z', 0x3a2416); K.AR(box(x - 0.2, y - 0.012, cz, 0.02, 0.01, z1 - z0 - 0.3), A.white, 1, 0xfff0d0);
      for (let j = 0; j < 3; j += 1) { const kk = (k + j) % 3; handbag(K, M(x - 0.05, y + 0.04, z0 + 0.5 + j * 0.9, -Math.PI / 2 + (rnd() - 0.5) * 0.3), [0x141414, 0x7a1c22, 0xd9c6a4, 0x8a5a32, 0x1f3550, 0xf1ece2][(k * 3 + j) % 6], kk); } }
    ob(x, cz, 0.3, (z1 - z0) / 2);
  }
  // シャンデリア 3 つ（ウインドーの 上・まんなか・中2かいの 上）。
  for (const [x, z, r, d] of [[2.4, 3.6, 0.85, 2.3], [-0.2, 0.2, 0.6, 2.4], [2.0, -4.6, 0.55, 1.6]]) {
    const y = CE; chandelier(K, x, y, z, { r, drop: d, tiers: 2, floorY: z < MZ.z ? MZ.y : FL });
    K.GS(lathe([[0.45 * r / 0.6, 0], [0.38 * r / 0.6, -0.03], [0.2, -0.05], [0.05, -0.07]], 20).translate(x, y, z), 0xf6efe2);
  }
  // くつの まるい 台（2 だん）。
  { const x = 2.8, z = 1.3; K.GS(cyl(x, FL, z, 0.75, 0.8, 0.42, 32), 0xf1eadc); K.MT(torus(0.75, 0.015, 4, 32).rotateX(Math.PI / 2).translate(x, FL + 0.42, z)); K.GS(cyl(x, FL + 0.42, z, 0.15, 0.15, 0.4, 16), 0xf1eadc); K.GS(cyl(x, FL + 0.82, z, 0.45, 0.45, 0.06, 28), 0xf1eadc); K.MT(torus(0.45, 0.012, 4, 28).rotateX(Math.PI / 2).translate(x, FL + 0.88, z));
    for (let k = 0; k < 7; k += 1) { const a = (k / 7) * TAU; shoe(K, M(x + Math.cos(a) * 0.55, FL + 0.42, z + Math.sin(a) * 0.55, -a + Math.PI / 2), [0x0b0b0c, 0xb0102a, 0xe9dcc8, 0xc9a050, 0x1f3550, 0x7a4a2a, 0xf2f0ea][k]); }
    for (let k = 0; k < 4; k += 1) { const a = (k / 4) * TAU + 0.4; shoe(K, M(x + Math.cos(a) * 0.28, FL + 0.88, z + Math.sin(a) * 0.28, -a + Math.PI / 2), [0xc9a050, 0x0b0b0c, 0xb0102a, 0xe8c8c0][k]); }
    vaseRoses(K, M(x, FL + 0.88, z), { vase: 0xf6f2ea, rose: 0xe8d8d0, s: 1.1 });
    shadowAt(K, M(x, FL, z), 2.0, 2.0); ob(x, z, 0.8, 0.8); }
  // ビロードの まるい スツール と 金の ドレスの ラック。
  { const x = 0.5, z = 2.6; K.FB(cyl(x, FL + 0.05, z, 0.42, 0.42, 0.38, 24), 0x1e4a3a, 2); K.FB(cyl(x, FL + 0.43, z, 0.4, 0.42, 0.04, 24), 0x1e4a3a, 3); for (let k = 0; k < 4; k += 1) K.MT(cyl(x + Math.cos(k * 1.57 + 0.78) * 0.3, FL, z + Math.sin(k * 1.57 + 0.78) * 0.3, 0.025, 0.02, 0.06, 6)); shadowAt(K, M(x, FL, z), 1.2, 1.2); ob(x, z, 0.45, 0.45); }
  rack(K, M(3.3, FL, -1.4), { len: 2.6, h: 1.75, color: GOLD, rnd, gap: 0.2, items: [{ type: 'dress', color: 0x0d0d0f, len: 1.25, w: 0.42 }, { type: 'dress', color: 0x7a1424, len: 1.3, w: 0.42 }, { type: 'dress', color: 0xe9dfcc, len: 1.2, w: 0.42 }, { type: 'dress', color: 0x1f3a5a, len: 1.25, w: 0.42 }, { type: 'dress', color: 0xc9a46a, len: 1.15, w: 0.42 }] }); ob(3.3, -1.4, 1.35, 0.35);
  // 試着室（2 つ・ビロードの カーテン・札）。
  {
    const z = -5.0, x0 = 1.6, x1 = 5.8;
    for (const x of [x0, (x0 + x1) / 2, x1]) K.W(box(x, FL, (z + IZB) / 2, 0.1, 2.6, IZB - z < 0 ? z - IZB : 1), 'y', 0x2a1a10);
    K.W(box((x0 + x1) / 2, FL + 2.6, z, x1 - x0 + 0.1, 0.25, 0.12), 'x', 0x2a1a10);
    for (const cx of [(x0 + (x0 + x1) / 2) / 2, ((x0 + x1) / 2 + x1) / 2]) { curtain(K, M(cx, FL + 2.5, z + 0.05), 1.95, 2.35, 0x5a0f1c); K.AR(new THREE.PlaneGeometry(0.5, 0.25).toNonIndexed().translate(cx, FL + 2.72, z + 0.07), A.plaque, 2); K.AR(cyl(cx, MZ.y - 0.33, z - 0.8, 0.06, 0.06, 0.01, 10), A.white, 1, 0xfff0d8); }
    K.FB(box((x0 + x1) / 2, FL + 0.001, z + 0.7, x1 - x0, 0.01, 1.0), 0x5c1018, 3);
    ob((x0 + x1) / 2, (z + IZB) / 2, (x1 - x0) / 2 + 0.05, (z - IZB) / 2 + 0.05);
  }
  mirror(K, M(0.2, FL + 0.25, IZB + 0.05), 1.0, 2.2); K.FB(box(0.2, FL, IZB + 0.9, 0.9, 0.42, 0.5), 0xd9c9b0, 2); ob(0.2, IZB + 0.9, 0.5, 0.3);
  gildedFrame(K, M(IX - 0.04, FL + 4.6, -4.4, -Math.PI / 2), 1.0, 1.0, A.abstract, { lamp: false });
  // 中2かいの 上：ドレスの ラック・マネキン・ソファ。
  rack(K, M(-3.5, MZ.y, -6.0), { len: 4.8, h: 1.7, color: GOLD, rnd, gap: 0.16, items: [{ type: 'dress', color: 0x0d0d0f, len: 1.2, w: 0.42 }, { type: 'coat', color: 0xd8c8ac, len: 1.05 }, { type: 'dress', color: 0x8a1a2a, len: 1.25, w: 0.42 }, { type: 'jacket', color: 0x2a2a2e }, { type: 'dress', color: 0xf0e8da, len: 1.2, w: 0.42 }] });
  mannequin(K, M(-0.6, MZ.y, -3.2, 0.3), { dress: 0x8c1426, style: 'gown' });
  mannequin(K, M(4.2, MZ.y, -3.3, -0.4), { dress: 0x0e0e10, style: 'coat', body: 0x1a1a1a });
  chesterfield(K, M(2.2, MZ.y, -6.0), { len: 2.0, color: 0x1e4a3a, cushions: [0xc9a14a], kind: 2 });
  for (let x = -IX + 1.1; x < IX; x += 2.2) can(x, CE, -4.65);

  /* ストリートの がわ（左） */
  // れんがの かべの 前の 黒い ラック（ジャケット・パーカー）。
  rack(K, M(-IX + 0.6, FL, 1.3, Math.PI / 2), { len: 4.8, h: 1.6, color: IRON, rnd, gap: 0.14, items: [{ type: 'jacket', color: 0x1d1f24 }, { type: 'hoodie', color: 0xe5842e }, { type: 'jacket', color: 0x3c5a7a }, { type: 'hoodie', color: 0x2b2b2b }, { type: 'jacket', color: 0x6b7a4a }, { type: 'hoodie', color: 0xe9e6dd }, { type: 'jacket', color: 0x8a2a2a }] }); ob(-IX + 0.6, 1.3, 0.35, 2.45);
  rack(K, M(-4.4, FL, 3.9), { len: 1.9, h: 1.5, color: IRON, rnd, gap: 0.12, items: [{ type: 'shirt', color: 0xf2f0ea, len: 0.72 }, { type: 'knit', color: 0x2a4a8a, len: 0.7 }, { type: 'shirt', color: 0x111111, len: 0.72 }, { type: 'knit', color: 0xd94a3a, len: 0.7 }, { type: 'shirt', color: 0xf0c84a, len: 0.72 }] }); ob(-4.4, 3.9, 1.0, 0.3);
  // たたんだ Tシャツの たな（白い かべ・ぼうしの 頭）。
  {
    const x0 = -IX + 0.15, x1 = SX - 0.4, z = IZB + 0.22, bays = 5, bw = (x1 - x0) / bays, TEEC = [0xf4f2ec, 0x161616, 0xd9442e, 0x2b5aa8, 0xf2c23a, 0x3a8a5a, 0xe98aa8, 0x8a8f96, 0xf08a2a, 0x2a2a4a, 0x9ad0e0, 0xc8b89a];
    K.GS(box((x0 + x1) / 2, FL, z - 0.17, x1 - x0, MZ.y - 0.34 - FL, 0.02), 0xf7f6f2);
    for (let b = 0; b <= bays; b += 1) K.GS(box(x0 + b * bw, FL, z, 0.035, 2.8, 0.42), 0xf2f1ec);
    for (const y of [0.35, 0.95, 1.55, 2.15, 2.75]) { K.GS(box((x0 + x1) / 2, FL + y - 0.03, z, x1 - x0, 0.03, 0.42), 0xf2f1ec); K.AR(box((x0 + x1) / 2, FL + y - 0.035, z + 0.17, x1 - x0, 0.006, 0.02), A.white, 1, 0xfff6e8); }
    for (let b = 0; b < bays; b += 1) for (const [k, y] of [0.35, 0.95, 1.55, 2.15].entries()) for (let j = 0; j < 3; j += 1) {
      const cx = x0 + b * bw + bw * (j + 0.5) / 3, n = 3 + Math.floor(rnd() * 4), c0 = TEEC[(b * 5 + k * 3 + j) % TEEC.length];
      for (let q = 0; q < n; q += 1) K.TEES.push({ x: cx + (rnd() - 0.5) * 0.015, y: FL + y + q * 0.034, z: z + 0.02, ry: (rnd() - 0.5) * 0.06, s: 0.95, color: rnd() < 0.7 ? c0 : TEEC[Math.floor(rnd() * TEEC.length)] });
    }
    for (let b = 0; b < bays; b += 1) for (let j = 0; j < 2; j += 1) capHead(K, M(x0 + b * bw + bw * (j + 0.5) / 2, FL + 2.75, z + 0.02, 0), [0x161616, 0xd9442e, 0xf4f2ec, 0x2b5aa8, 0x3a8a5a, 0xf2c23a, 0xe98aa8, 0x2a2a4a, 0xf08a2a, 0x8a8f96][(b * 2 + j) % 10]);
    ob((x0 + x1) / 2, z, (x1 - x0) / 2, 0.25);
  }
  // ガラスの ケース・レジ・トルソー・ぼうしの 台。
  glassCase(K, M(-4.6, FL, 0.6), { w: 1.9, d: 0.62, rnd }); ob(-4.6, 0.6, 1.0, 0.35);
  glassCase(K, M(-6.2, FL, -2.4, Math.PI / 2), { w: 1.4, d: 0.6, rnd, items: 'tee' }); ob(-6.2, -2.4, 0.35, 0.75);
  {
    const x = -3.2, z = -1.55; K.W(box(x, FL, z, 2.4, 1.0, 0.7), 'x', 0x2a1a10); K.marble(box(x, FL + 1.0, z, 2.5, 0.05, 0.78), 0xffffff); K.MT(box(x, FL + 0.08, z + 0.355, 2.4, 0.03, 0.01), BRASS);
    K.GS(box(x + 0.5, FL + 1.05, z - 0.1, 0.12, 0.25, 0.12), 0x1a1a1a); K.AR(box(x + 0.5, FL + 1.3, z - 0.1, 0.38, 0.26, 0.03).rotateY(0), A.screen, 1); K.GS(box(x - 0.3, FL + 1.05, z, 0.16, 0.06, 0.1), 0x222222);
    for (const [dx, c] of [[-0.85, 0xf4f0e6], [-0.6, 0x111111]]) { K.FB(box(x + dx, FL + 1.05, z + 0.05, 0.22, 0.28, 0.1), c); K.FB(torus(0.05, 0.005, 3, 8, Math.PI).translate(x + dx, FL + 1.33, z + 0.05), 0x222222); }
    ob(x, z, 1.25, 0.4);
  }
  torsoForm(K, M(-6.1, FL, 5.3, 0.3), { color: 0xe5842e, type: 'hoodie' }); ob(-6.1, 5.3, 0.3, 0.3);
  torsoForm(K, M(-5.2, FL, 5.7, -0.2), { color: 0xf4f2ec, form: 0xe8e4dc }); ob(-5.2, 5.7, 0.3, 0.3);
  { const x = -2.7, z = 2.6; K.W(box(x, FL, z, 1.1, 0.75, 0.7), 'x', 0x3a2416); K.GS(box(x, FL + 0.75, z, 1.14, 0.03, 0.74), 0x121212); for (let k = 0; k < 3; k += 1) capHead(K, M(x - 0.35 + k * 0.35, FL + 0.78, z, 0.2 - k * 0.2), [0x161616, 0xd9442e, 0x2b5aa8][k]); shadowAt(K, M(x, FL, z), 1.5, 1.1); ob(x, z, 0.6, 0.4); }
  torsoForm(K, M(-2.6, FL, 4.9, 0.4), { color: 0x161616 }); ob(-2.6, 4.9, 0.3, 0.3);
  // ストリートの がわの つりさげ ライト（黒い かさ）。
  for (const [x, z] of [[-5.8, 3.2], [-3.4, 3.2], [-5.8, 0.4], [-3.4, 0.4]]) { K.MT(cyl(x, 3.9, z, 0.005, 0.005, CE - 3.9, 3), 0x111111); K.MT(lathe([[0.03, 0.16], [0.08, 0.12], [0.22, 0.0], [0.23, -0.01]], 16).translate(x, 3.75, z), 0x161616); K.AR(ell(x, 3.76, z, 0.06, 0.05, 0.06, 7, 4), A.white, 1, 0xffe4b8); K.GW(new THREE.PlaneGeometry(1.4, 3.6).toNonIndexed().translate(x, 2.0, z).rotateY(0), A.streak, [0.18, 0.13, 0.07]); K.GW(floorQuad(x, FL + 0.012, z, 2.2, 2.2, A.blob), A.blob, [0.14, 0.1, 0.05]); }

  /* 人：お客さん・店の 人 */
  const people = [
    { x: 1.9, y: FL, z: 2.0, ry: 2.3, top: 0xe9e2d0, bot: 0x2a2a2e, hair: 1, skirt: true, bag: 1, bagC: 0x7a1c22 },
    { x: -4.9, y: FL, z: -5.2, ry: Math.PI + 0.2, top: 0x2b3550, bot: 0x3b4e6e, hair: 0, bag: 0 },
    { x: -3.2, y: FL, z: -2.1, ry: 0.1, top: 0x161616, bot: 0x161616, hair: 2, bag: 0 },
    { x: -1.6, y: MZ.y, z: -4.6, ry: 2.6, top: 0xc9a13b, bot: 0x1f2022, hair: 1, skirt: true, bag: 2 },
    { x: 4.4, y: FL, z: -2.4, ry: Math.PI - 0.3, top: 0x6e2a33, bot: 0x262f42, hair: 2, skirt: true, bag: 1 },
  ];
  const walkers = [
    { y: FL, z: 3.0, x0: -0.6, x1: 5.0, look: { top: 0x1b1b1d, bot: 0x1b1b1d, hair: 1, skirt: true, bag: 1, bagC: 0xd9b26a } },
    { y: FL, x: -5.75, z0: 1.6, z1: 4.9, look: { top: 0xe5842e, bot: 0x3b4e6e, hair: 0, bag: 0 } },
    { y: 0, z: 9.9, x0: -10, x1: 10, look: { top: 0x2b2b30, bot: 0x2f3238, hair: 0, bag: 1 } },
  ];
  M2.people.side = THREE.FrontSide;
  assemble(group, B, K, M2, { people, walkers, rnd, time, shadows });
  const update = walkUpdater(group, walkers, people.length, time);
  update(0);
  function setNight(n) { const k = clamp01(n); night.n.value = k; night.pool.value = 0.3 + 0.65 * k; M2.metal.envMapIntensity = 1.35 - 0.3 * k; }
  setNight(0);
  const triangles = countTris(group);
  group.userData.shop = { triangles, textureMB: shopTextureMB(), buildMs: Math.round(now() - t0) };
  return { group, obstacles, door: { ...BOUTIQUE.door }, entrance: { ...BOUTIQUE.entrance }, setNight, update, materials: M2, triangles };
}
export function buildFurnitureShowroom(o) { return buildBoutique(o); } // TEMP
