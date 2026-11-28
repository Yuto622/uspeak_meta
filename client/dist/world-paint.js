// せかいの ちずの「え」（2026-11：「こういう感じで。超リアルに。」— ななめ上から 見た、ぬった ような 地形の ちず）。
//
// ・**ページの 中で 1 回だけ かく**（`paintWorld()` は Promise を とっておく）。かきおわったら JPEG の blob URL に して
//   world-map.js が SVG の <image> に はる（名前の 札・番号・押せる ところは SVG の まま＝くっきり）。
// ・かきかた：島ごとに「陸らしさ」L（海岸で 0・まんなかで 1・海は マイナス）と 地形の しゅるいを 格子に 書く →
//   しゅるいごとの 高さ（ノイズ）→ 光（左上から）・かげ（光の ほうへ 高い 所が あれば かげ）・がけ・雪 → 色 →
//   その 上に 2D の 絵（橋・メインの島の まち・村の やね・コース・かんらんしゃ…）→ まわりの 雲。
// ・島の 位置・形は world-map.js（rpg-data.js の x, z）、橋は bridges-data.js。地理は ほんものの 座標の まま。
// ・とちゅうで 何度も 手を はなす（`slice`）ので、iPad でも 画面が かたまらない。WebGL は つかわない。
// ・2 まい かく：せかい ぜんぶ（1 単位 1.6 px）と、ちかづいた とき 用の メインの島（1 単位 6 px）。
import { MAP_ISLANDS, MAIN_RECTS, MAIN_BAY, MAIN_ROADS, MX, MZ } from './world-map.js';
import { LINKS } from './bridges-data.js';

export const WORLD_TILE = { x0: -780, x1: 760, z0: -660, z1: 560, ppu: 1.3, clouds: true };
export const MAIN_TILE = { x0: MX - 92, x1: MX + 100, z0: MZ - 86, z1: MZ + 58, ppu: 5, clouds: false };

// ぬった えの 島は ほんとうの 大きさより 大きく かく（位置と 橋は ほんものの まま。海が ひろすぎて 地形が 見えない ため）。
export const VS = 1.6;

// ── ノイズ（決まった 乱数・value noise と fbm）──────────────────
const PERM = new Uint8Array(512);
{ let s = 1234567; const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const GRAD = new Float32Array(256); for (let i = 0; i < 256; i++) GRAD[i] = ((PERM[i] * 7919) % 1000) / 500 - 1;
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = GRAD[PERM[X + PERM[Y]]], b = GRAD[PERM[X + 1 + PERM[Y]]], c = GRAD[PERM[X + PERM[Y + 1]]], d = GRAD[PERM[X + 1 + PERM[Y + 1]]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;   // -1..1
}
function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
function ridged(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f)); s += a * n * n; f *= 2.1; a *= 0.5; } return s; }
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ── 島の 地形の しゅるい ───────────────────────────────────────
// 0 hub（なだらかな 丘・村）1 town（メインの島・たいら）2 snow 3 highland（だんだんの 台地・まんなかに クレーター）4 canyon（赤い がけ）
// 5 desert 6 reef（さんごの わ・中が ラグーン）7 forest 8 meadow 9 ruins 10 moon 11 sky（高い 台地と 滝）12 farm 13 lake（みずうみと 川）14 plateau（英検：台地）
const KIND = { main: 1, snow: 2, storm: 3, canyon: 4, desert: 5, reef: 6, forest: 7, meadow: 8, ruins: 9, moon: 10, sky: 11, farm: 12, fishworld: 13,
  eiken5: 14, eiken4: 14, eiken3: 14, eikenp2: 14, eiken2: 14, eikenp1: 14, eiken1: 2, pet: 8, wear: 8, land: 0 };
const kindOf = (r) => KIND[r.id] ?? 0;
const RGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// しゅるいごとの 色：[ひくい くさ, たかい くさ, がけ, とくべつ]
const PAL = [
  ['#6aa645', '#4d8a36', '#8d7a62', '#9cc45a'], ['#7cae52', '#6a9e48', '#8d8576', '#a7c96a'], ['#5f7f5a', '#7b8a7e', '#6f6d72', '#f4f8fb'],
  ['#7aa94e', '#5f8f3e', '#b0704a', '#3d4a3c'], ['#c98a52', '#b8673e', '#9a4e32', '#e8b077'], ['#e6c27e', '#d9ad66', '#b88a4e', '#f2d79a'],
  ['#9ad07a', '#77b65e', '#cfc39a', '#e9e0b8'], ['#2f6a34', '#24572b', '#6f6a55', '#4d8f45'], ['#86bd55', '#6aa846', '#8d7a62', '#e8e07a'],
  ['#8fa27a', '#7c8f6a', '#9a978c', '#c9c4b2'], ['#4f7a74', '#3f6670', '#6d6a86', '#c6b8ec'], ['#b9cf84', '#9fbf72', '#d9c9a0', '#fff0c0'],
  ['#8cbb52', '#6e9e40', '#8d7a62', '#d8c26a'], ['#6fae4c', '#4f8d3a', '#8d7a62', '#9cc45a'], ['#78b04e', '#5e9840', '#a57d5c', '#a9cf6a'],
].map((p) => p.map(RGB));
const SAND = RGB('#ecd9a2'), SAND_WET = RGB('#d6bd84'), FOAM = RGB('#ffffff');
const DEEP = RGB('#0f4f8c'), MID = RGB('#1a7fbe'), SHAL = RGB('#25bccc'), LAGOON = RGB('#5fdccf'), NEAR = RGB('#9af0df'), REEF = RGB('#2a9e9a');

// メインの島の 陸らしさ：角まるの 四角（54×43）と つき出した 土地（四角の 角まる）。
function mainL(x, z) {
  const lx = x - MX, lz = z - MZ;
  const q = (Math.abs(lx / 54) ** 4 + Math.abs(lz / 43) ** 4) ** 0.25;
  let l = (1 - q) * 3.2;
  for (const a of MAIN_RECTS) {
    const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2, hx = (a.x1 - a.x0) / 2 - a.r, hz = (a.z1 - a.z0) / 2 - a.r;
    const dx = Math.max(Math.abs(lx - cx) - hx, 0), dz = Math.max(Math.abs(lz - cz) - hz, 0);
    const sd = Math.hypot(dx, dz) - a.r + Math.min(Math.max(Math.abs(lx - cx) - hx, Math.abs(lz - cz) - hz), 0);
    l = Math.max(l, -sd / 18);
  }
  if (lx > MAIN_BAY.x0 && lx < MAIN_BAY.x1 && lz > MAIN_BAY.z0) l = Math.min(l, -Math.min(lx - MAIN_BAY.x0, MAIN_BAY.x1 - lx, lz - MAIN_BAY.z0) / 18 - 0.02);
  return l;
}

const now = () => globalThis.performance?.now?.() ?? Date.now();
// ひと休み（ほかの 仕事を 先に させる）。MessageChannel は setTimeout の 4ms の 待ちが ない。
// （かく ときに はじめて 作る：読みこんだ だけで ポートを 開くと Node の 検査が おわらなく なる）
let chan = null; const waiting = [];
const slice = () => new Promise((r) => {
  if (!chan && globalThis.MessageChannel && globalThis.document) { chan = new MessageChannel(); chan.port1.onmessage = () => waiting.shift()?.(); }
  if (chan) { waiting.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0);
});

// ひとつの 四角（tile）を かく。かえすのは canvas。
async function paintTile(T) {
  const W = Math.round((T.x1 - T.x0) * T.ppu), H = Math.round((T.z1 - T.z0) * T.ppu), N = W * H, u = 1 / T.ppu;
  const L = new Float32Array(N).fill(-2.4), K = new Uint8Array(N), I = new Uint8Array(N), Hh = new Float32Array(N);
  let t0 = now(); const tStart = t0;
  const yieldIf = async () => { if (now() - t0 > 24) { await slice(); t0 = now(); } };
  // 1. 陸らしさ（島ごとに まわり だけ）
  for (let ii = 0; ii < MAP_ISLANDS.length; ii++) {
    const r = MAP_ISLANDS[ii], main = r.id === 'main';
    const ex = main ? 140 : r.rx * VS * 2.1, ez = main ? 120 : r.rz * VS * 2.1;
    const px0 = Math.max(0, Math.floor((r.x - ex - T.x0) * T.ppu)), px1 = Math.min(W, Math.ceil((r.x + ex - T.x0) * T.ppu));
    const py0 = Math.max(0, Math.floor((r.z - ez - T.z0) * T.ppu)), py1 = Math.min(H, Math.ceil((r.z + ez - T.z0) * T.ppu));
    const sx = (ii * 37.7) % 100, k = kindOf(r);
    for (let py = py0; py < py1; py++) {
      const z = T.z0 + (py + 0.5) * u;
      for (let px = px0; px < px1; px++) {
        const x = T.x0 + (px + 0.5) * u, i = py * W + px;
        let l;
        if (main) l = mainL(x, z) + fbm(x / 22 + 40, z / 22, 3) * 0.12;
        else {
          const dx = (x - r.x) / (r.rx * VS), dz = (z - r.z) / (r.rz * VS);
          const q = (Math.abs(dx) ** 2.6 + Math.abs(dz) ** 2.6) ** (1 / 2.6);
          l = 1 - q + fbm(x / 34 + sx, z / 34 + sx, q > 1.6 ? 2 : 4) * 0.3;
        }
        if (l > L[i]) { L[i] = l; K[i] = main ? 1 : k; I[i] = ii; }
      }
      if ((py & 7) === 0) await yieldIf();
    }
  }
  const tm = [tStart, now()];
  // 2. 高さ（しゅるいごと）
  for (let py = 0; py < H; py++) {
    const z = T.z0 + (py + 0.5) * u;
    for (let px = 0; px < W; px++) {
      const i = py * W + px, l = L[i];
      if (l < -0.02) { Hh[i] = 0; continue; }
      const x = T.x0 + (px + 0.5) * u, s = sstep(0, 0.3, l), r = MAP_ISLANDS[I[i]];
      let h = 0;
      switch (K[i]) {
        case 1: h = s * (1.2 + fbm(x / 30, z / 30, 3) * 0.8); break;
        case 2: { const c = sstep(0.05, 0.9, l); h = s * 2 + c * c * (6 + ridged(x / 22, z / 22, 5) * 26); break; }
        case 3: { let b = s * (4 + fbm(x / 26, z / 26, 4) * 8 + sstep(0.2, 0.7, l) * 8); b = Math.floor(b / 4) * 4 + sstep(0.55, 1, (b / 4) % 1) * 4; const d = Math.hypot(x - r.x, z - (r.z + 2)) / 17; h = d < 1 ? b * 0.15 + (1 - (1 - d) ** 2) * 6 : b + Math.max(0, 1.6 - d) * 6; break; }
        case 4: { let b = s * (3 + (fbm(x / 18, z / 18, 4) + 0.5) * 18 * sstep(0.1, 0.5, l)); h = Math.floor(b / 3.2) * 3.2 + sstep(0.7, 1, (b / 3.2) % 1) * 3.2; break; }
        case 5: h = s * (1 + (Math.sin((x * 0.6 + z * 0.35) / 3.2 + fbm(x / 14, z / 14, 2) * 4) * 0.5 + 0.5) ** 2 * 2.4 + fbm(x / 30, z / 30, 2) * 2); break;
        case 6: { const ring = sstep(0, 0.18, l) * (1 - sstep(0.32, 0.46, l)); h = ring * (0.8 + fbm(x / 10, z / 10, 3) * 0.6); if (l > 0.38) h = -0.6; break; }
        case 7: h = s * (2 + (fbm(x / 20, z / 20, 4) + 0.5) * 6); break;
        case 8: h = s * (1 + (fbm(x / 28, z / 28, 4) + 0.5) * 3.4); break;
        case 9: h = s * (2 + (fbm(x / 16, z / 16, 4) + 0.5) * 5); break;
        case 10: h = s * (1.5 + (fbm(x / 22, z / 22, 4) + 0.5) * 4); break;
        case 11: { const b = s * (3 + sstep(0.15, 0.3, l) * 12 + fbm(x / 20, z / 20, 3) * 3); const rv = Math.abs((x - r.x) - Math.sin((z - r.z) / 12) * 8); h = rv < 2.2 && l > 0.12 ? b - 2.5 : b; if (rv < 2.2 && l > 0.12) h = -0.4; break; }
        case 12: h = s * (1 + fbm(x / 40, z / 40, 3) * 1.2); break;
        case 13: { const lk = Math.hypot((x - r.x + 6) / 18, (z - r.z) / 12); const rv = Math.abs((z - r.z) - Math.sin((x - r.x) / 9) * 5); h = s * (2 + (fbm(x / 22, z / 22, 4) + 0.5) * 5); if (lk < 1 || (rv < 2.2 && x > r.x + 8)) h = -0.5; break; }
        case 14: { let b = s * (2 + (fbm(x / 22, z / 22, 4) + 0.5) * 9 * sstep(0.1, 0.5, l)); h = Math.floor(b / 3) * 3 + sstep(0.6, 1, (b / 3) % 1) * 3; break; }
        default: h = s * (1.5 + (fbm(x / 24, z / 24, 4) + 0.5) * 6); break;
      }
      Hh[i] = h;
    }
    if ((py & 15) === 0) await yieldIf();
  }
  tm.push(now());
  // 3. 光・かげ・色
  const cgrid = T.clouds ? cloudField(T) : null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); const img = g.createImageData(W, H), D = img.data;
  const ex = 1.6;   // 高さを 強めに 見せる
  const sh = Math.max(1, Math.round(T.ppu * 0.9));
  for (let py = 0; py < H; py++) {
    const z = T.z0 + (py + 0.5) * u;
    for (let px = 0; px < W; px++) {
      const i = py * W + px, l = L[i], x = T.x0 + (px + 0.5) * u;
      let c, cd = 0, cloud = null;
      let cshadow = 0;
      if (cgrid) {   // まわりの 雲（もこもこの 積雲：光の 側は 白く、右下の かげは 青灰色。海に 雲の かげ）。こい ところは 下を かかない。
        const base = cgrid(x, z);
        if (base > 0.15) {
          const F = (bx, bz) => cgrid(bx, bz) + (1 - Math.abs(noise(bx / 15, bz / 15))) * 0.32 + (1 - Math.abs(noise(bx / 6.5 + 7, bz / 6.5))) * 0.16 - 0.36;
          const dn = F(x, z);
          cd = sstep(0.42, 0.56, dn);
          if (cd > 0) {   // 雲を「高さ」と みて 光を あてる（もこもこが まるく 見える）
            const hc = (v) => sstep(0.4, 0.95, v) * 9;
            const e = 1.6, gx = hc(F(x + e, z)) - hc(F(x - e, z)), gz = hc(F(x, z + e)) - hc(F(x, z - e));
            const n = 1 / Math.hypot(gx, 2 * e, gz), lit = Math.max(0, (gx * 0.5 + 2 * e * 0.72 + gz * 0.48) * n);
            const t = Math.max(0, Math.min(1, 0.25 + lit * 0.85));
            cloud = mixc([122, 145, 176], [255, 255, 255], t ** 0.9);
          }
          if (cd > 0.995) { const o = i * 4; D[o] = cloud[0]; D[o + 1] = cloud[1]; D[o + 2] = cloud[2]; D[o + 3] = 255; continue; }
          if (F(x - 12, z - 14) > 0.5) cshadow = 0.28;   // 海や 島に おちる 雲の かげ
        }
      }
      const h = Hh[i];
      if (l <= -2.3) { const k = noise(x / 13, z / 6) * 9; c = [DEEP[0] + k, DEEP[1] + k, DEEP[2] + k]; }   // とおい ふかい 海（はやい 道）
      else if (l < -0.02 || h < 0) {
        // 海（ふかさで 色）と 波・あわ
        const d = l < -0.02 ? -l : 0.05 + Math.min(0.2, -h * 0.1);
        const inner = h < 0 && l >= -0.02;
        c = inner ? mixc(NEAR, LAGOON, sstep(0, 0.6, -h)) : d < 0.22 ? mixc(NEAR, SHAL, sstep(0.02, 0.22, d)) : d < 0.6 ? mixc(SHAL, MID, sstep(0.22, 0.6, d)) : mixc(MID, DEEP, sstep(0.6, 1.1, d));
        if (!inner && d > 0.05 && d < 0.4) { const rf = noise(x / 5 + 3, z / 5) + noise(x / 2.1, z / 2.1) * 0.4; if (rf > 0.35) c = mixc(c, REEF, Math.min(0.55, (rf - 0.35) * 1.6) * (1 - d / 0.4)); }   // さんごの あさせ
        const w = noise(x / 3 + z / 9, z / 2.2) * 0.5 + noise(x / 13, z / 6) * 0.5;
        const k = (w * (d > 0.9 ? 0.035 : 0.06) + (hash(px, py) - 0.5) * 0.015) * 255;
        c = [c[0] + k, c[1] + k, c[2] + k];
        if (!inner && d < 0.07) { const f = (1 - d / 0.07) * (0.55 + 0.45 * noise(x / 2, z / 2)); c = mixc(c, FOAM, Math.max(0, Math.min(0.85, f))); }
        else if (!inner && Math.abs(d - 0.12 - noise(x / 9, z / 9) * 0.03) < 0.012) c = mixc(c, FOAM, 0.45 * (0.5 + 0.5 * noise(x / 1.5, z / 1.5)));   // 2 本目の あわの 線
        else if (!inner && d < 0.3 && noise(x / 2.4 + 9, z / 2.4) > 0.6) c = mixc(c, FOAM, 0.25);
      } else {
        const ia = py > 0 ? i - W : i, ib = py < H - 1 ? i + W : i, il = px > 0 ? i - 1 : i, ir = px < W - 1 ? i + 1 : i;
        const gx = (Hh[ir] - Hh[il]) * ex * T.ppu / 2, gz = (Hh[ib] - Hh[ia]) * ex * T.ppu / 2;
        const nl = 1 / Math.hypot(gx, 1, gz);
        let lit = (gx * 0.55 + 0.75 + gz * 0.55) * nl;   // 左上・上からの 光
        // かげ：光の ほう（左上）に 自分より 高い 所が あれば
        let shade = 1;
        for (let s2 = 1; s2 <= 7; s2++) { const qx = px - s2 * sh, qy = py - s2 * sh; if (qx < 0 || qy < 0) break; const q = qy * W + qx; if (Hh[q] * ex - h * ex > s2 * sh * u * 1.1) { shade = 0.62; break; } }
        const slope = Math.hypot(gx, gz), k = K[i], P = PAL[k], hn = Math.min(1, h / 14);
        let base = mixc(P[0], P[1], sstep(0.1, 0.8, hn + fbm(x / 9, z / 9, 2) * 0.25));
        // しゅるいごとの もよう
        if (k === 7 || (k === 0 || k === 8 || k === 14 || k === 13) && fbm(x / 7 + 3, z / 7, 3) > 0.12) {   // 森の こずえ
          const cn = noise(x / 1.3, z / 1.3) * 0.6 + noise(x / 0.55, z / 0.55) * 0.4;
          base = mixc(k === 7 ? P[0] : RGB('#3d7a35'), RGB('#1f4a24'), Math.max(0, -cn) * 0.9);
          lit += cn * 0.25;
        }
        if (k === 12) { const fx = Math.floor((x + 300) / 9), fz = Math.floor((z + 300) / 7), hv = hash(fx, fz); base = hv < 0.33 ? RGB('#d8c26a') : hv < 0.66 ? RGB('#7cb04a') : RGB('#a8834e'); if (((x + 300) % 9) < 0.5 || ((z + 300) % 7) < 0.4) base = RGB('#4f7a35'); base = mixc(base, RGB('#000000'), ((Math.floor((x + z) * 1.2) & 1) ? 0.04 : 0)); }
        if (k === 1) base = mixc(base, RGB('#5e9440'), Math.max(0, fbm(x / 7, z / 7, 3)) * 0.9);
        if (k === 5) base = mixc(P[0], P[3], noise(x / 4, z / 4) * 0.5 + 0.5);
        if (k === 10 && noise(x / 1.6, z / 1.6) > 0.55) base = P[3];
        if (k === 8 && noise(x / 1.2 + 5, z / 1.2) > 0.62) base = hash(px >> 1, py >> 1) > 0.5 ? RGB('#f2e27a') : RGB('#f5f5f5');
        if (k === 3 && Hh[i] < 3 && Math.hypot(x - MAP_ISLANDS[I[i]].x, z - (MAP_ISLANDS[I[i]].z + 2)) < 17) base = P[3];   // クレーターの そこ
        // がけ（急な ところ）：しましまの 地層
        const cliff = sstep(0.55, 1.2, slope / (ex * 1.2));
        if (cliff > 0) { const strata = (Math.sin(h * 2.6 + noise(x / 6, z / 6) * 2) * 0.5 + 0.5) * 0.25; base = mixc(base, mixc(P[2], RGB('#5a3a2a'), strata), cliff); }
        // 雪（高い ところ）
        if (k === 2 && h > 6 + noise(x / 6, z / 6) * 3) base = mixc(base, P[3], sstep(0, 0.6, 1 - slope * 0.25));
        // すなはま
        const beach = 1 - sstep(0.015, 0.07 + noise(x / 7, z / 7) * 0.02, l);
        if (beach > 0 && k !== 2) base = mixc(base, l < 0.025 ? SAND_WET : SAND, beach);
        const tex = (hash(px, py) - 0.5) * 14;
        const f = Math.max(0.35, Math.min(1.35, 0.42 + lit * 0.78)) * shade;
        c = [base[0] * f + tex, base[1] * f + tex, base[2] * f + tex];
      }
      if (cshadow) c = [c[0] * (1 - cshadow), c[1] * (1 - cshadow * 0.9), c[2] * (1 - cshadow * 0.7)];
      if (cd > 0) c = mixc(c, cloud, cd);
      const o = i * 4; D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
    }
    if ((py & 7) === 0) await yieldIf();
  }
  tm.push(now());
  g.putImageData(img, 0, 0);
  await slice();
  // 4. 2D の 絵（世界の 座標で かく）
  g.save(); g.scale(T.ppu, T.ppu); g.translate(-T.x0, -T.z0);
  const water = (x, z) => { const px = Math.floor((x - T.x0) * T.ppu), py = Math.floor((z - T.z0) * T.ppu); if (px < 0 || py < 0 || px >= W || py >= H) return true; const i = py * W + px; return L[i] < 0.005 || Hh[i] < 0; };
  const spans = new Map(LINKS.map((l) => [l, spanOf(l, water)]));
  drawRoadsAndVillages(g, spans); await slice();
  drawBridges(g, spans); await slice();
  drawMain(g); await slice();
  g.restore();
  tm.push(now()); cv.timing = tm.map((v, i) => (i ? Math.round(v - tm[i - 1]) : 0)).slice(1);
  return cv;
}

const CF = { x0: -455, x1: 450, z0: -535, z1: 445 };   // 雲の 内がわ（ぜんぶの 島の わく）
// 雲の こさ：わくの まわりに まるい かたまり（大・小）を ならべ、4 単位の あらい 格子に 足しこむ（1 回だけ）。かえすのは (x, z) → こさ。
function cloudField(T) {
  const R = rnd(91), blobs = [];
  const edge = (t, side) => side === 0 ? [lerp(CF.x0, CF.x1, t), CF.z0] : side === 1 ? [CF.x1, lerp(CF.z0, CF.z1, t)] : side === 2 ? [lerp(CF.x0, CF.x1, t), CF.z1] : [CF.x0, lerp(CF.z0, CF.z1, t)];
  const out = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let side = 0; side < 4; side++) for (let t = -0.1; t < 1.1; t += 0.035 + R() * 0.03) {
    const [ex, ez] = edge(t, side), o = -20 + R() * 120, big = 26 + R() * 34;
    const cx = ex + out[side][0] * o, cz = ez + out[side][1] * o;
    blobs.push([cx, cz, big]);
    for (let k = 0; k < 3; k++) blobs.push([cx + (R() - 0.5) * big * 1.6, cz + (R() - 0.5) * big * 1.6, big * (0.4 + R() * 0.35)]);
  }
  for (let k = 0; k < 260; k++) blobs.push([lerp(T.x0, T.x1, R()), lerp(T.z0, T.z1, R()), 45 + R() * 50]);   // わくの ずっと 外は うめる
  const C = 2.5, GW = Math.ceil((T.x1 - T.x0) / C) + 2, GH = Math.ceil((T.z1 - T.z0) / C) + 2, G = new Float32Array(GW * GH);
  for (const [bx, bz, br] of blobs) {
    const inside = Math.max(CF.x0 - bx, bx - CF.x1, CF.z0 - bz, bz - CF.z1) < -br * 0.6 && false;
    if (inside) continue;
    const gx0 = Math.max(0, Math.floor((bx - br * 1.6 - T.x0) / C)), gx1 = Math.min(GW - 1, Math.ceil((bx + br * 1.6 - T.x0) / C));
    const gz0 = Math.max(0, Math.floor((bz - br * 1.6 - T.z0) / C)), gz1 = Math.min(GH - 1, Math.ceil((bz + br * 1.6 - T.z0) / C));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const dx = T.x0 + gx * C - bx, dz = T.z0 + gz * C - bz, q = (dx * dx + dz * dz) / (br * br);
      if (q < 2.6) G[gz * GW + gx] += Math.exp(-q * 1.6);
    }
  }
  // 島の 上には かからない ように（わくの 中は うすく）
  for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) { const x = T.x0 + gx * C, z = T.z0 + gz * C, od = Math.max(CF.x0 - x, x - CF.x1, CF.z0 - z, z - CF.z1); G[gz * GW + gx] *= sstep(-60, 30, od + fbm(x / 70 + 5, z / 70, 4) * 110); }
  return (x, z) => {
    const fx = (x - T.x0) / C, fz = (z - T.z0) / C, ix = Math.max(0, Math.min(GW - 2, Math.floor(fx))), iz = Math.max(0, Math.min(GH - 2, Math.floor(fz))), tx = fx - ix, tz = fz - iz, o = iz * GW + ix;
    return lerp(lerp(G[o], G[o + 1], tx), lerp(G[o + GW], G[o + GW + 1], tx), tz);
  };
}

// ── 2D の 絵 ──────────────────────────────────────────────────
const SUN = [0.7, 0.9];   // かげの 向き（右下へ）
function roof(g, x, z, w, d, col, hgt = 1.2, ang = 0) {   // 上から 見た やね＋かげ
  g.save(); g.translate(x, z); g.rotate(ang);
  g.fillStyle = 'rgba(20,30,20,.35)'; g.fillRect(-w / 2 + SUN[0] * hgt, -d / 2 + SUN[1] * hgt, w, d);
  g.fillStyle = col; g.fillRect(-w / 2, -d / 2, w, d);
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-w / 2, -d / 2, w, d / 2);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-w / 2, 0, w, d / 2);
  g.strokeStyle = 'rgba(40,25,15,.55)'; g.lineWidth = 0.18; g.strokeRect(-w / 2, -d / 2, w, d);
  g.restore();
}
function tower(g, x, z, w, d, hgt, col) {   // ビル：ななめ上から 見た 南の ガラスの かべ・やね・右下へ のびる かげ
  const oz = -hgt * 0.85, ox = hgt * 0.12;
  g.fillStyle = 'rgba(10,25,35,.3)';   // かげ（右下）
  g.beginPath(); g.moveTo(x + w / 2, z - d / 2); g.lineTo(x + w / 2 + hgt * 0.6, z - d / 2 + hgt * 0.5); g.lineTo(x + w / 2 + hgt * 0.6, z + d / 2 + hgt * 0.5); g.lineTo(x - w / 2 + hgt * 0.6, z + d / 2 + hgt * 0.5); g.lineTo(x - w / 2, z + d / 2); g.closePath(); g.fill();
  // 東の かべ（くらい）
  g.fillStyle = '#2f4a5e'; g.beginPath(); g.moveTo(x + w / 2, z + d / 2); g.lineTo(x + w / 2 + ox, z + d / 2 + oz); g.lineTo(x + w / 2 + ox, z - d / 2 + oz); g.lineTo(x + w / 2, z - d / 2); g.closePath(); g.fill();
  // 南の ガラスの かべ（空が うつる）
  const gr = g.createLinearGradient(0, z + d / 2 + oz, 0, z + d / 2); gr.addColorStop(0, '#cfe6f2'); gr.addColorStop(0.35, col); gr.addColorStop(1, '#27485e');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - w / 2, z + d / 2); g.lineTo(x + w / 2, z + d / 2); g.lineTo(x + w / 2 + ox, z + d / 2 + oz); g.lineTo(x - w / 2 + ox, z + d / 2 + oz); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.08;
  for (let k = 0.7; k < hgt; k += 0.7) { const t = k / hgt; g.beginPath(); g.moveTo(x - w / 2 + ox * t, z + d / 2 + oz * t); g.lineTo(x + w / 2 + ox * t, z + d / 2 + oz * t); g.stroke(); }
  g.strokeStyle = 'rgba(20,40,55,.35)'; for (let c = 1; c < 5; c++) { const xx = x - w / 2 + (w * c) / 5; g.beginPath(); g.moveTo(xx, z + d / 2); g.lineTo(xx + ox, z + d / 2 + oz); g.stroke(); }
  // やね（灰色・へりと 室外機）
  const rx = x - w / 2 + ox, rz = z - d / 2 + oz;
  g.fillStyle = '#8b97a1'; g.fillRect(rx, rz, w, d); g.fillStyle = '#a9b4bd'; g.fillRect(rx + 0.5, rz + 0.5, w - 1, d - 1);
  g.fillStyle = '#6f7b85'; g.fillRect(rx + w * 0.2, rz + d * 0.25, w * 0.25, d * 0.22); g.fillRect(rx + w * 0.55, rz + d * 0.55, w * 0.2, d * 0.2);
  g.strokeStyle = 'rgba(30,40,50,.7)'; g.lineWidth = 0.12; g.strokeRect(rx, rz, w, d);
}
const ROOFS = ['#b4553a', '#c96a3c', '#8f4a3a', '#d98b4a', '#5f7fa8', '#7a5a46', '#e2a24a'];
function road(g, pts, w, col = '#e6d5ae', edge = 'rgba(90,70,40,.45)') {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = edge; g.lineWidth = w + 0.8; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
  g.strokeStyle = col; g.lineWidth = w; g.stroke();
}
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// 橋の うち 海の 上の ところ（島を 大きく かいたので、岸から 岸まで）。[s0, s1]。海が なければ null（陸つづき）。
function spanOf(l, water) {
  const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, len = Math.hypot(dx, dz);
  let s0 = -1, s1 = -1;
  for (let s = 0; s <= len; s += 0.5) if (water(l.from.x + dx * s / len, l.from.z + dz * s / len)) { if (s0 < 0) s0 = s; s1 = s; }
  return s0 < 0 ? null : [Math.max(0, s0 - 2.5), Math.min(len, s1 + 2.5)];
}
function drawRoadsAndVillages(g, spans) {
  for (const r of MAP_ISLANDS) {
    if (r.id === 'main') continue;
    const k = kindOf(r), R = rnd([...r.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    // 橋の たもとから まんなかへ 土の 道
    for (const l of LINKS) for (const [id, p0] of [[l.a, l.from], [l.b, l.to]]) {
      if (id !== r.id) continue;
      const sp = spans.get(l), len = Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z), t0 = !sp ? 0.5 : id === l.a ? sp[0] / len : sp[1] / len;
      const p = { x: lerp(l.from.x, l.to.x, t0), z: lerp(l.from.z, l.to.z, t0) };   // 岸（橋の はし）から
      const mx = (p.x + r.x) / 2 + (p.z - r.z) * 0.15, mz = (p.z + r.z) / 2 - (p.x - r.x) * 0.15;
      const pts = []; for (let t = 0; t <= 1.001; t += 0.1) pts.push([(1 - t) ** 2 * p.x + 2 * (1 - t) * t * mx + t * t * r.x, (1 - t) ** 2 * p.z + 2 * (1 - t) * t * mz + t * t * r.z]);
      road(g, pts, 1.6, k === 2 ? '#e8eef2' : '#dcc596');
    }
    if (r.hub && ![5, 6].includes(k)) {   // 村の やね
      const n = 6 + Math.floor(R() * 5);
      for (let j = 0; j < n; j++) { const a = R() * 6.28, d = (6 + R() * 9) * 1.35; roof(g, r.x + Math.cos(a) * d, r.z + Math.sin(a) * d * 0.8, 2.6 + R() * 1.6, 2 + R() * 1.2, ROOFS[Math.floor(R() * ROOFS.length)], 1, (R() - 0.5) * 0.6); }
    }
    feature(g, r);
  }
}
function feature(g, r) { g.save(); g.translate(r.x, r.z); g.scale(1.4, 1.4); g.translate(-r.x, -r.z); feature0(g, r); g.restore(); }
function feature0(g, r) {   // 島の しるし（上から 見た 形）
  const x = r.x, z = r.z;
  const ring = (cx, cz, rx, rz, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.ellipse(cx, cz, rx, rz, 0, 0, 6.283); g.stroke(); };
  switch (r.id) {
    case 'ride': ring(x, z, 13, 7, 3, '#4a4f55'); ring(x, z, 13, 7, 0.25, '#fff'); g.fillStyle = '#7dbd55'; g.beginPath(); g.ellipse(x, z, 10.4, 4.6, 0, 0, 6.283); g.fill(); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : '#222'; g.fillRect(x - 0.5, z + 5.6 + i * 0.4, 1, 0.4); } break;
    case 'park': { ring(x - 6, z - 4, 7, 7, 0.8, '#f4f0e6'); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.fillStyle = ['#e27a2d', '#ffd84a', '#4fa3d9', '#e05a8a'][i % 4]; g.beginPath(); g.arc(x - 6 + Math.cos(a) * 7, z - 4 + Math.sin(a) * 7, 0.9, 0, 6.283); g.fill(); } g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 9, z + 6, 6, 4, 0, 0, 6.283); g.fill(); g.fillStyle = '#d9483b'; g.beginPath(); g.arc(x + 8, z + 5, 5, 0, 6.283); g.fill(); g.fillStyle = '#fff4d6'; for (let i = 0; i < 8; i += 2) { g.beginPath(); g.moveTo(x + 8, z + 5); g.arc(x + 8, z + 5, 5, i / 8 * 6.283, (i + 1) / 8 * 6.283); g.fill(); } road(g, [[x - 16, z + 10], [x - 6, z - 2], [x + 4, z - 12], [x + 15, z - 4]], 0.7, '#e0566a', 'rgba(0,0,0,.3)'); break; }
    case 'arena': g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 1, z + 1.2, 12, 8, 0, 0, 6.283); g.fill(); ring(x, z, 10, 6.6, 3.2, '#e6d2a8'); ring(x, z, 11.4, 7.8, 0.4, '#8a6a40'); g.fillStyle = '#d9b77a'; g.beginPath(); g.ellipse(x, z, 8, 4.8, 0, 0, 6.283); g.fill(); break;
    case 'farm': roof(g, x + 4, z - 2, 7, 5, '#b8382e', 1.6); roof(g, x + 10, z - 5, 2.6, 2.6, '#c9c9c9', 2.6); break;
    case 'school': roof(g, x, z - 3, 16, 5, '#c8573e', 1.6); roof(g, x - 5, z + 2, 5, 6, '#c8573e', 1.6); g.fillStyle = '#c9a46a'; g.fillRect(x + 1, z + 1, 9, 6); break;
    case 'fishworld': roof(g, x + 13, z - 8, 2, 2, '#fff', 4); g.fillStyle = '#d9483b'; g.beginPath(); g.arc(x + 13, z - 8, 0.8, 0, 6.283); g.fill(); break;
    case 'abc': [['#e0566a', -4, 0], ['#3f9a62', 0, 0], ['#3f75c8', 4, 0], ['#ffd84a', 0, -4]].forEach(([c, dx, dz]) => roof(g, x + dx, z + dz, 3.4, 3.4, c, 2)); break;
    case 'land': for (let i = 0; i < 4; i++) { g.strokeStyle = '#fff4d6'; g.lineWidth = 0.3; g.setLineDash([0.8, 0.6]); g.strokeRect(x - 14 + i * 7, z + 4, 6, 5); g.setLineDash([]); } break;
    case 'reading': roof(g, x, z - 2, 14, 7, '#4f7a3c', 1.8); break;
    case 'talk': case 'conv': g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(x, z, 6, 0, 6.283); g.fill(); g.fillStyle = '#4fb9e0'; g.beginPath(); g.arc(x, z, 2, 0, 6.283); g.fill(); break;
    case 'willow': roof(g, x + 8, z - 6, 6, 4, '#e27a2d', 1.2); g.fillStyle = '#c9d6df'; g.fillRect(x + 16, z + 13, 16, 3); break;
    default:
      if (/^eiken/.test(r.id)) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 6, z - 3, 13, 8); g.fillStyle = '#f2ead6'; g.fillRect(x - 7, z - 4, 13, 8); g.fillStyle = '#c9b892'; for (let i = 0; i < 6; i++) g.fillRect(x - 6.4 + i * 2.3, z + 3, 0.8, 0.8); g.fillStyle = '#7a8a6a'; g.fillRect(x - 7, z - 4, 13, 2.2); }
  }
}
function drawBridges(g, spans) {
  for (const l of LINKS) {
    const sp = spans.get(l); if (!sp) continue;
    const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, L0 = Math.hypot(dx, dz), w = 3.6, len = sp[1] - sp[0];
    g.save(); g.translate(l.from.x + dx * sp[0] / L0, l.from.z + dz * sp[0] / L0); g.rotate(Math.atan2(dz, dx));
    g.fillStyle = 'rgba(5,30,50,.35)'; g.fillRect(0, -w / 2 + 1.6, len, w);   // 海の 上の かげ
    g.fillStyle = '#9a6233'; g.fillRect(-0.5, -w / 2, len + 1, w);
    for (let s = 0; s < len; s += 0.9) { g.fillStyle = (Math.floor(s / 0.9) % 3) ? '#b97c46' : '#a86d3b'; g.fillRect(s, -w / 2 + 0.25, 0.75, w - 0.5); }
    g.fillStyle = '#5a3418'; g.fillRect(-0.5, -w / 2, len + 1, 0.35); g.fillRect(-0.5, w / 2 - 0.35, len + 1, 0.35);
    for (let s = 0; s < len; s += 4) { g.fillRect(s, -w / 2 - 0.2, 0.6, 0.6); g.fillRect(s, w / 2 - 0.4, 0.6, 0.6); }
    if (l.rest) { g.fillStyle = '#a86d3b'; g.fillRect(len / 2 - 4.5, -3.4, 9, 6.8); g.strokeStyle = '#5a3418'; g.lineWidth = 0.3; g.strokeRect(len / 2 - 4.5, -3.4, 9, 6.8); }
    g.restore();
  }
}
const MW = (x, z) => [MX + x, MZ + z];
function drawMain(g) {
  // 道（アスファルトと 歩道）
  for (const [[x0, z0], [x1, z1]] of MAIN_ROADS) road(g, [MW(x0, z0), MW(x1, z1)], 3, '#cfc8b8', 'rgba(70,60,50,.5)');
  for (const [[x0, z0], [x1, z1]] of MAIN_ROADS) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.15; g.setLineDash([0.8, 0.8]); g.beginPath(); g.moveTo(...MW(x0, z0)); g.lineTo(...MW(x1, z1)); g.stroke(); g.setLineDash([]); }
  // ビルの まち：舗装と 高い ビル
  g.fillStyle = 'rgba(160,160,155,.55)'; for (const a of [MAIN_RECTS[2], MAIN_RECTS[3]]) { const [x, z] = MW(a.x0 + 3, a.z0 + 3); g.fillRect(x, z, a.x1 - a.x0 - 6, a.z1 - a.z0 - 6); }
  for (const [[x0, z0], [x1, z1]] of MAIN_ROADS.slice(6)) road(g, [MW(x0, z0), MW(x1, z1)], 3, '#8f8f8a', 'rgba(40,40,40,.5)');
  const towers = [[-71, -62, 14], [-55, -62, 20], [-38, -58, 12], [-22, -60, 16], [-71, -42, 18], [-55, -41, 24], [-71, -22, 12], [-55, -22, 16], [-55, -5, 10], [-71, -5, 8], [-38, -42, 10], [-38, -22, 9], [-22, -45, 11]];
  const glass = ['#6a9ec0', '#86b4d0', '#5a8db2', '#9cc2d8'];
  towers.sort((a, b) => a[1] - b[1]).forEach(([x, z, h], i) => { const [wx, wz] = MW(x, z); tower(g, wx, wz + 3, 8, 6.5, h * 0.42, glass[i % 4]); });
  // プラネタリウム（まるい やね）
  { const [x, z] = MW(-28, -24.6); g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(x + 1.5, z + 2, 8, 0, 6.283); g.fill(); const gr = g.createRadialGradient(x - 3, z - 3, 1, x, z, 8); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8e9cb0'); g.fillStyle = gr; g.beginPath(); g.arc(x, z, 7.5, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(80,90,110,.5)'; g.lineWidth = 0.2; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(x, z, i * 2.2, 0, 6.283); g.stroke(); } }
  // ひろば・ふんすい・時計台・フリーマーケット・としょかん
  { const [x, z] = MW(71, 16); g.fillStyle = '#e8d6b0'; g.beginPath(); g.ellipse(x, z, 14, 12, 0, 0, 6.283); g.fill(); g.strokeStyle = '#cdb88c'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(x, z, 9, 7.6, 0, 0, 6.283); g.stroke(); g.fillStyle = '#4fb9e0'; g.beginPath(); g.arc(x, z, 3.2, 0, 6.283); g.fill(); g.fillStyle = '#e6f8ff'; g.beginPath(); g.arc(x, z, 1, 0, 6.283); g.fill();
    for (let i = 0; i < 6; i++) roof(g, MX + 59.8 + i * 4.5, MZ + 25.6, 3.4, 2.4, ['#d9483b', '#e27a2d', '#f2b630', '#3f75c8', '#2f8f5b', '#c8553d'][i], 0.6); }
  { const [x, z] = MW(79, 6.5); tower(g, x, z, 3.6, 3.6, 9, '#efe2c4'); }
  { const [x, z] = MW(70, -14); roof(g, x, z, 26, 13, '#3f8a5a', 2.2); g.fillStyle = '#f2ead6'; for (let i = 0; i < 9; i++) g.fillRect(x - 12 + i * 3, z + 6.4, 1, 1.2); }
  // お店と いえ
  [[20, -35, '#4fae6b'], [31, -35, '#e0a52c'], [42, -35, '#3f6fb8'], [53, -35, '#7a8a96'], [17.5, 21, '#e0566a'], [28, 21, '#f2b04a'], [38.5, 21, '#4fb9e0'],
    [4, 8, '#2f9aa8'], [17, 8, '#3f75c8'], [27.5, 8, '#c0569a'], [38.5, 8, '#26909f'], [-19.5, 10.5, '#e27a2d'], [45, 30, '#cf6a2e'],
    [-44, 10, '#3baacb'], [-30, 10, '#e2a224'], [-46, 33.1, '#4f7a3c'], [-35, 33.1, '#d9483b'], [-24, 33.1, '#c8783e'], [-57, 33.1, '#ff7eb3'], [-61, 11, '#7a9a5a']]
    .forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); roof(g, wx, wz - 2.4, 7, 5.4, c, 1.4); });
  // ゲート
  [[-12, -30, '#e27a2d'], [-12, -19, '#3f75c8'], [-12, -8, '#3f9a62'], [-12, 3, '#c8573e'], [-4, 21, '#2d8fc4']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); g.fillStyle = c; g.fillRect(wx - 2.6, wz - 0.8, 5.2, 1.6); g.fillStyle = '#8ff0c8'; g.fillRect(wx - 1.6, wz - 0.4, 3.2, 0.8); });
  // さんばしと ふなつきば・ふね
  const plank = (x, z, w, d) => { g.fillStyle = 'rgba(5,30,50,.3)'; g.fillRect(x + 0.6, z + 0.8, w, d); g.fillStyle = '#a86d3b'; g.fillRect(x, z, w, d); g.strokeStyle = 'rgba(70,40,20,.6)'; g.lineWidth = 0.12; g.strokeRect(x, z, w, d); };
  { const [px, pz] = MW(4, 24); plank(px - 1.7, pz, 3.4, 11); const [ex0, ez] = MW(-14, 29), [ex1] = MW(21, 29); plank(ex0, ez - 1.2, ex1 - ex0, 2.4);
    for (const [x, end] of [[19.6, 43], [14.6, 33], [9.6, 43], [-2.2, 43], [-7.4, 33], [-12.6, 43]]) { const [wx, wz] = MW(x, 29); plank(wx - 1.2, wz, 2.4, end - 29); } }
  { const [x, z] = MW(31, 37); plank(x - 4, z - 1, 8, 4); boat(g, x + 9, z + 4); }
  { const [x, z] = MW(-6, -38.8); plank(x - 1.4, z - 7, 2.8, 7); boat(g, x + 4, z - 10); }
  // 木（まちの 外の くさに すこし）
  const R = rnd(42);
  for (let i = 0; i < 420; i++) { const lx = -78 + R() * 166, lz = -74 + R() * 117; if (mainL(MX + lx, MZ + lz) < 0.25) continue; if (BUSY.some(([a, b, c, d]) => lx > a && lx < b && lz > c && lz < d)) continue; treeTop(g, MX + lx, MZ + lz, 1.3 + R() * 0.8); }
}
const BUSY = [[-80, -12, -76, 0], [-66, 62, 4, 26], [-34, -20, -30, -18], [-16, 0, -38, 8], [-8, 60, -42, -26], [-70, -14, 4, 40], [52, 90, -30, 34], [40, 50, 24, 36], [-22, -16, 6, 16], [-18, 24, 22, 50]];
function treeTop(g, x, z, r) {
  g.fillStyle = 'rgba(10,30,10,.35)'; g.beginPath(); g.arc(x + r * 0.5, z + r * 0.6, r, 0, 6.283); g.fill();
  const gr = g.createRadialGradient(x - r * 0.4, z - r * 0.4, r * 0.1, x, z, r); gr.addColorStop(0, '#7cc05a'); gr.addColorStop(1, '#2f6a30'); g.fillStyle = gr; g.beginPath(); g.arc(x, z, r, 0, 6.283); g.fill();
}
function boat(g, x, z) {
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(x - 3.5, z, 3, 0.6, 0, 0, 6.283); g.fill();
  g.fillStyle = '#fff4d6'; g.beginPath(); g.ellipse(x, z, 2.6, 1.1, 0, 0, 6.283); g.fill(); g.strokeStyle = '#6b3f1c'; g.lineWidth = 0.15; g.stroke();
  g.fillStyle = '#e27a2d'; g.beginPath(); g.moveTo(x, z); g.lineTo(x + 2, z - 2.6); g.lineTo(x, z - 2.6); g.closePath(); g.fill();
}
// ── 1 回だけ ──────────────────────────────────────────────────
// ちかづいた ときの 島の え（1 島ずつ・はじめて ちかづいた ときに 1 回だけ）。
const detail = new Map();
export const DETAIL_PPU = 4;
export function paintIsland(id) {
  if (detail.has(id)) return detail.get(id);
  const r = MAP_ISLANDS.find((q) => q.id === id);
  if (!r || r.id === 'main') return Promise.resolve(null);
  const T = { x0: r.x - r.rx * 1.9, x1: r.x + r.rx * 1.9, z0: r.z - r.rz * 1.9, z1: r.z + r.rz * 1.9, ppu: DETAIL_PPU, clouds: false, soft: true };
  const p = (job || Promise.resolve()).then(() => paintTile(T)).then((cv) => ({ canvas: cv, ...T, id })).catch(() => null);
  detail.set(id, p);
  return p;
}
let job = null;
// かえす：{ world: {canvas, ...WORLD_TILE}, main: Promise<{canvas, ...MAIN_TILE}>, ms }。かけない 端末（canvas が ない）は null。
// canvas は そのまま 画面に 出す（画像に しなおさない＝JPEG に する 時間が いらない）。せかいが 先、メインの島は あとから。
export function paintWorld() {
  if (job) return job;
  job = (async () => {
    if (!globalThis.document?.createElement('canvas').getContext?.('2d')) return null;
    const t = now();
    const world = await paintTile(WORLD_TILE);
    const out = { world: { canvas: world, ...WORLD_TILE }, ms: Math.round(now() - t), timing: world.timing, main: null };
    out.main = paintTile(MAIN_TILE).then((cv) => ({ canvas: cv, ...MAIN_TILE, ms: Math.round(now() - t) })).catch(() => null);
    return out;
  })().catch((e) => { console.warn('[world-paint]', e); return null; });
  return job;
}
