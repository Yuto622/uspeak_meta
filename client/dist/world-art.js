// 異次元の 島の かたちと 絵（2026-11：「一つ一つの島のデザインを異次元に」）。world-paint.js が 1 回だけ 使う。
//
// ・`shapeQ(r, x, z)`：島の りんかく（1 で 岸、小さいほど 内がわ）。まるい かたまりを やめて、とがった かけら（多角形）・だんだん・わ
//   （テーマパーク・アリーナ・のりもの・聖域）に する。world-paint.js の「陸らしさ」が これを つかう。
// ・`AURA[id]`：島の まわりの 光の 色（宇宙に にじむ）。
// ・`drawIslandArt(g, r, water)`：その 島の テーマを 異次元ふうに かく 2D の 絵（世界の 座標・canvas の 2D だけ）。
//   光は 'lighter'（たしざん）で 重ねる。色は ブランド（深緑・ミント・オレンジ・クリーム・金）だけ。
// ・どの 島も：光る すじ（ルーン）・まわりに うかぶ 岩の かけら・下に ぶらさがる 結晶。
import { MX, MZ } from './world-map.js';

const MINT = '#8ff0c8', ORANGE = '#ffb066', DEEPO = '#e27a2d', GOLD = '#f2b04a', CREAM = '#fff4d6', TEAL = '#3fc7a8', LIME = '#c6f28a', AMBER = '#ffcf6b';
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const seedOf = (id) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ── かたち ─────────────────────────────────────────────────────
const RING = { park: [0.68, 0.3], arena: [0.66, 0.3], ride: [0.68, 0.28], sky: [0.66, 0.3] };   // [わの 半径, わの はば]（島の 大きさに たいして）
const polys = new Map();
function poly(r) {   // 6〜9 角の とがった かけら（島ごとに きまった かたち）
  if (polys.has(r.id)) return polys.get(r.id);
  const R = rnd(seedOf(r.id) + 3), n = 6 + Math.floor(R() * 4), pl = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + R() * 0.5; const d = 0.82 + R() * 0.3; pl.push([Math.cos(a), Math.sin(a), d]); }
  polys.set(r.id, pl); return pl;
}
export function shapeQ(r, x, z) {
  const dx = (x - r.x) / r.rx, dz = (z - r.z) / r.rz;
  const ring = RING[r.id];
  if (ring) { const d = Math.hypot(dx, dz); return Math.abs(d - ring[0]) / ring[1] * 0.95 + (d < 0.15 ? 0 : 0); }
  let q = 0;
  for (const [nx, nz, d] of poly(r)) q = Math.max(q, (dx * nx + dz * nz) / d);   // 多角形（とがった かど）
  const round = Math.hypot(dx, dz);
  return q * 0.7 + round * 0.3;
}

// 島の まわりの 光（宇宙に にじむ 色）
export const AURA = {
  main: ORANGE, willow: ORANGE, park: AMBER, errand: GOLD, school: MINT, arena: DEEPO, pet: AMBER, ride: MINT, town: GOLD,
  eiken5: MINT, eiken4: ORANGE, eiken3: TEAL, eikenp2: AMBER, eiken2: GOLD, eikenp1: LIME, eiken1: CREAM, talk: MINT, conv: ORANGE,
  wear: AMBER, mini: ORANGE, farm: LIME, land: GOLD, reading: MINT, abc: AMBER, homework: ORANGE, fishworld: MINT,
  meadow: LIME, forest: MINT, reef: TEAL, canyon: DEEPO, snow: CREAM, storm: AMBER, desert: GOLD, ruins: MINT, moon: CREAM, sky: GOLD,
};

// ── 部品 ──────────────────────────────────────────────────────
function glow(g, x, z, rad, col, a = 0.5) {
  const gr = g.createRadialGradient(x, z, 0, x, z, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, z, rad, 0, 6.283); g.fill();
}
const add = (g, fn) => { g.save(); g.globalCompositeOperation = 'lighter'; fn(); g.restore(); };
function shadowE(g, x, z, rx, rz = rx * 0.4) { g.fillStyle = 'rgba(4,16,12,.45)'; g.beginPath(); g.ellipse(x + rx * 0.25, z + rz * 0.6, rx, rz, 0, 0, 6.283); g.fill(); }
// 結晶（ななめ上から：左が あかるい・右が くらい・先が 光る）
function crystal(g, x, z, h, w, col, a = 1) {
  shadowE(g, x, z + 0.5, w * 0.7, w * 0.25);
  g.globalAlpha = a;
  g.fillStyle = col; g.beginPath(); g.moveTo(x, z - h); g.lineTo(x - w / 2, z - h * 0.3); g.lineTo(x - w * 0.35, z); g.lineTo(x, z + w * 0.18); g.closePath(); g.fill();
  g.fillStyle = 'rgba(6,30,22,.42)'; g.beginPath(); g.moveTo(x, z - h); g.lineTo(x + w / 2, z - h * 0.3); g.lineTo(x + w * 0.35, z); g.lineTo(x, z + w * 0.18); g.closePath(); g.fill();
  g.fillStyle = col; g.globalAlpha = a * 0.55; g.beginPath(); g.moveTo(x, z - h); g.lineTo(x + w / 2, z - h * 0.3); g.lineTo(x + w * 0.35, z); g.lineTo(x, z + w * 0.18); g.closePath(); g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(0.12, w * 0.06); g.beginPath(); g.moveTo(x, z - h); g.lineTo(x, z + w * 0.18); g.stroke();
  add(g, () => glow(g, x, z - h * 0.85, w * 1.4, col, 0.45));
}
function beam(g, x, z, h, w, col) {   // 光の はしら
  add(g, () => { const gr = g.createLinearGradient(0, z, 0, z - h); gr.addColorStop(0, rgba(col, 0.75)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(x - w / 2, z - h, w, h); glow(g, x, z, w * 2.2, col, 0.5); });
}
function ringE(g, x, z, rx, rz, col, lw, rot = 0) {   // 光る わ
  add(g, () => {
    g.strokeStyle = rgba(col, 0.28); g.lineWidth = lw * 3.2; g.beginPath(); g.ellipse(x, z, rx, rz, rot, 0, 6.283); g.stroke();
    g.strokeStyle = rgba(col, 0.9); g.lineWidth = lw; g.beginPath(); g.ellipse(x, z, rx, rz, rot, 0, 6.283); g.stroke();
  });
}
function cube(g, x, z, s, col, letter) {   // うかぶ 立方体（文字つき）
  shadowE(g, x + s * 0.6, z + s * 1.6, s * 0.7, s * 0.25);
  const ox = s * 0.45, oz = -s * 0.4;
  g.fillStyle = col; g.fillRect(x - s / 2, z - s / 2, s, s);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x - s / 2, z - s / 2); g.lineTo(x + s / 2, z - s / 2); g.lineTo(x + s / 2 + ox, z - s / 2 + oz); g.lineTo(x - s / 2 + ox, z - s / 2 + oz); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.moveTo(x + s / 2, z - s / 2); g.lineTo(x + s / 2 + ox, z - s / 2 + oz); g.lineTo(x + s / 2 + ox, z + s / 2 + oz); g.lineTo(x + s / 2, z + s / 2); g.closePath(); g.fill();
  g.strokeStyle = rgba(CREAM, 0.8); g.lineWidth = s * 0.05; g.strokeRect(x - s / 2, z - s / 2, s, s);
  if (letter) { g.fillStyle = CREAM; g.font = `900 ${s * 0.72}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, x, z + s * 0.04); }
  add(g, () => glow(g, x, z, s * 1.3, col, 0.35));
}
function shard(g, x, z, s, R, top = '#3f7a4a') {   // うかぶ 岩の かけら（上は くさ・下は 岩と 結晶）
  const pts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + R() * 0.5; pts.push([x + Math.cos(a) * s * (0.7 + R() * 0.4), z + Math.sin(a) * s * 0.55 * (0.7 + R() * 0.4)]); }
  g.fillStyle = 'rgba(4,16,12,.35)'; g.beginPath(); g.ellipse(x + s * 0.4, z + s * 1.6, s * 0.8, s * 0.3, 0, 0, 6.283); g.fill();
  g.fillStyle = '#4a3324'; g.beginPath(); g.moveTo(x - s * 0.75, z); g.lineTo(x, z + s * 1.4); g.lineTo(x + s * 0.75, z); g.closePath(); g.fill();
  g.fillStyle = top; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(x - s * 0.2, z - s * 0.15, s * 0.4, s * 0.18, 0, 0, 6.283); g.fill();
  add(g, () => glow(g, x, z + s * 1.3, s * 0.5, MINT, 0.5));
}
function runes(g, r, col, R) {   // 地面に 光る すじ（ルーン）
  add(g, () => {
    g.strokeStyle = rgba(col, 0.55); g.lineWidth = 0.35; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      let x = r.x + (R() - 0.5) * r.rx * 0.9, z = r.z + (R() - 0.5) * r.rz * 0.9; g.beginPath(); g.moveTo(x, z);
      for (let j = 0; j < 5; j++) { x += (R() - 0.5) * 7; z += (R() - 0.5) * 5; g.lineTo(x, z); }
      g.stroke();
    }
  });
}
function speech(g, x, z, w, h, col) {   // ふきだしの 結晶
  shadowE(g, x, z + h * 0.9, w * 0.5, h * 0.2);
  g.fillStyle = rgba(col, 0.85); g.beginPath(); g.ellipse(x, z, w / 2, h / 2, 0, 0, 6.283); g.fill();
  g.beginPath(); g.moveTo(x - w * 0.1, z + h * 0.35); g.lineTo(x - w * 0.3, z + h * 0.85); g.lineTo(x + w * 0.1, z + h * 0.4); g.fill();
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(x - w * 0.15, z - h * 0.18, w * 0.25, h * 0.15, 0, 0, 6.283); g.fill();
  add(g, () => glow(g, x, z, w * 0.9, col, 0.35));
}
function book(g, x, z, s, col) {   // つばさの ように ひらいた 本
  shadowE(g, x, z + s * 1.4, s * 0.8, s * 0.2);
  g.fillStyle = CREAM; g.beginPath(); g.moveTo(x, z); g.quadraticCurveTo(x - s * 0.6, z - s * 0.6, x - s * 1.2, z - s * 0.2); g.lineTo(x - s * 1.1, z + s * 0.35); g.quadraticCurveTo(x - s * 0.5, z, x, z + s * 0.4); g.closePath(); g.fill();
  g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(x, z); g.quadraticCurveTo(x + s * 0.6, z - s * 0.6, x + s * 1.2, z - s * 0.2); g.lineTo(x + s * 1.1, z + s * 0.35); g.quadraticCurveTo(x + s * 0.5, z, x, z + s * 0.4); g.closePath(); g.fill();
  g.strokeStyle = col; g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(x, z); g.lineTo(x, z + s * 0.4); g.stroke();
  add(g, () => glow(g, x, z, s * 1.6, col, 0.3));
}
function gear(g, x, z, rad, col) {
  g.save(); g.translate(x, z);
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, rr = i % 2 ? rad : rad * 1.18; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(6,30,22,.7)'; g.beginPath(); g.ellipse(0, 0, rad * 0.5, rad * 0.4, 0, 0, 6.283); g.fill();
  g.restore();
  ringE(g, x, z, rad * 0.75, rad * 0.6, MINT, 0.3);
}

// ── 島ごとの 絵 ───────────────────────────────────────────────
export function drawIslandArt(g, r) {
  const R = rnd(seedOf(r.id) + 21), s = r.rx / 31, x = r.x, z = r.z, au = AURA[r.id] || MINT;
  // まわりに うかぶ かけら（島の 外がわ）
  for (let i = 0; i < 4; i++) { const a = R() * 6.283, d = 1.12 + R() * 0.25; shard(g, x + Math.cos(a) * r.rx * d, z + Math.sin(a) * r.rz * d, (1.4 + R() * 1.6) * s, R, R() > 0.5 ? '#3f7a4a' : '#6b5a3a'); }
  if (r.id !== 'main') {   // まんなかの 光る 台（絵が うかんで 見える）
    if (!RING[r.id]) { g.fillStyle = 'rgba(6,30,22,.55)'; g.beginPath(); g.ellipse(x, z + 2 * s, r.rx * 0.52, r.rz * 0.44, 0, 0, 6.283); g.fill(); }
    ringE(g, x, z + 2 * s, r.rx * (RING[r.id] ? 0.68 : 0.52), r.rz * (RING[r.id] ? 0.68 : 0.44), au, 0.35 * s);
    runes(g, r, au, R);
  }
  const at = (fx, fz) => [x + fx * r.rx, z + fz * r.rz];
  switch (r.id) {
    case 'main': return mainGlow(g);
    case 'willow': {   // 光る「U」の モノリスと まわる 文字
      add(g, () => glow(g, x, z - 8 * s, 18 * s, ORANGE, 0.4));
      g.save(); g.translate(x, z - 2 * s); g.scale(s, s);
      g.fillStyle = 'rgba(4,16,12,.45)'; g.beginPath(); g.ellipse(4, 6, 10, 3, 0, 0, 6.283); g.fill();
      const U = new Path2D('M-7 2V-16H-3V-1A3 3 0 0 0 3 -1V-16H7V2A7 7 0 0 1 -7 2Z');
      g.fillStyle = '#2a5a48'; g.translate(1.2, -1); g.fill(U); g.translate(-1.2, 1);
      const gr = g.createLinearGradient(-7, -16, 7, 4); gr.addColorStop(0, CREAM); gr.addColorStop(0.5, ORANGE); gr.addColorStop(1, DEEPO); g.fillStyle = gr; g.fill(U);
      g.strokeStyle = MINT; g.lineWidth = 0.5; g.stroke(U);
      g.restore();
      ringE(g, x, z - 6 * s, 20 * s, 7 * s, MINT, 0.4 * s, -0.15);
      'SPEAK'.split('').forEach((c, i) => { const a = -0.6 + i * 0.55; cube(g, x + Math.cos(a) * 20 * s, z - 6 * s + Math.sin(a) * 7 * s, 3.4 * s, [ORANGE, TEAL, GOLD, DEEPO, MINT][i], c); });
      return;
    }
    case 'park': {   // 光の かんらんしゃの わ・あめ色の 結晶
      ringE(g, x, z - 4 * s, 15 * s, 15 * s, ORANGE, 0.7 * s);
      add(g, () => { g.strokeStyle = rgba(CREAM, 0.6); g.lineWidth = 0.25 * s; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.moveTo(x, z - 4 * s); g.lineTo(x + Math.cos(a) * 15 * s, z - 4 * s + Math.sin(a) * 15 * s); g.stroke(); } });
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; add(g, () => glow(g, x + Math.cos(a) * 15 * s, z - 4 * s + Math.sin(a) * 15 * s, 2.2 * s, [ORANGE, MINT, GOLD, CREAM][i % 4], 0.9)); }
      [[-0.5, 0.45, ORANGE], [0.45, 0.5, MINT], [0.1, 0.62, AMBER], [-0.2, -0.55, CREAM]].forEach(([fx, fz, c]) => crystal(g, ...at(fx, fz), 9 * s, 3.4 * s, c));
      return;
    }
    case 'fishworld': {   // うかぶ 水の 玉・宇宙へ おちる 滝・光る こい
      const [wx, wz] = at(0, -0.1);
      const gr = g.createRadialGradient(wx - 4 * s, wz - 5 * s, 1, wx, wz, 13 * s); gr.addColorStop(0, '#d8fff0'); gr.addColorStop(0.5, 'rgba(79,208,180,.85)'); gr.addColorStop(1, 'rgba(20,110,95,.9)');
      g.fillStyle = gr; g.beginPath(); g.arc(wx, wz, 13 * s, 0, 6.283); g.fill();
      ringE(g, wx, wz, 13 * s, 13 * s, MINT, 0.3 * s);
      [[-3, 1], [3, -2], [1, 4]].forEach(([a, b], i) => add(g, () => { glow(g, wx + a * s, wz + b * s, 2.6 * s, i % 2 ? ORANGE : GOLD, 0.9); }));
      const [fx, fz] = at(0.15, 0.95);
      add(g, () => { const wf = g.createLinearGradient(0, fz - 4 * s, 0, fz + 30 * s); wf.addColorStop(0, 'rgba(160,250,220,.85)'); wf.addColorStop(1, 'rgba(143,240,200,0)'); g.fillStyle = wf; g.fillRect(fx - 4 * s, fz - 4 * s, 8 * s, 34 * s); });
      return;
    }
    case 'arena': {   // うかぶ わの スタジアムと エネルギーの はしら
      ringE(g, x, z, r.rx * 0.62, r.rz * 0.62, DEEPO, 1.2 * s);
      for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + 0.4; beam(g, x + Math.cos(a) * r.rx * 0.62, z + Math.sin(a) * r.rz * 0.62, 22 * s, 2.4 * s, i % 2 ? ORANGE : MINT); }
      add(g, () => glow(g, x, z, 10 * s, ORANGE, 0.5));
      return;
    }
    case 'ride': {   // ういて いる 光の コース（8 の じ）
      add(g, () => { g.strokeStyle = rgba(MINT, 0.3); g.lineWidth = 3 * s; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * 9 * s, z, 9 * s, 6 * s, 0, 0, 6.283); g.stroke(); } g.strokeStyle = rgba(ORANGE, 0.95); g.lineWidth = 0.9 * s; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * 9 * s, z, 9 * s, 6 * s, 0, 0, 6.283); g.stroke(); } });
      cube(g, x - 14 * s, z - 3 * s, 2.4 * s, DEEPO); cube(g, x + 6 * s, z + 5 * s, 2.4 * s, TEAL);
      return;
    }
    case 'sky': {   // 天空の 聖域：光の わと 白い 神殿
      for (let i = 0; i < 3; i++) ringE(g, x, z - (10 + i * 5) * s, (9 - i * 2) * s, (3 - i * 0.6) * s, i ? CREAM : GOLD, 0.45 * s);
      crystal(g, x, z + 2 * s, 14 * s, 6 * s, CREAM); add(g, () => glow(g, x, z - 8 * s, 16 * s, GOLD, 0.35));
      return;
    }
    case 'school': case 'reading': {   // 図書の 塔と つばさの 本
      crystal(g, x, z + 4 * s, 22 * s, 7 * s, r.id === 'school' ? '#4fa38a' : '#3f8a6e');
      add(g, () => { g.strokeStyle = rgba(ORANGE, 0.85); g.lineWidth = 0.35 * s; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(x - 2.8 * s, z + 4 * s - k * 4 * s); g.lineTo(x + 2.8 * s, z + 4 * s - k * 4 * s); g.stroke(); } });
      [[-14, -8], [13, -12], [-10, 8], [15, 6]].forEach(([a, b], i) => book(g, x + a * s, z + b * s, 3 * s, i % 2 ? MINT : ORANGE));
      return;
    }
    case 'homework': {   // 大きな えんぴつの 結晶と うかぶ ページ
      g.save(); g.translate(x, z); g.rotate(0.5); g.scale(s, s);
      g.fillStyle = GOLD; g.fillRect(-2.4, -18, 4.8, 22); g.fillStyle = '#ff9f8a'; g.fillRect(-2.4, -18, 4.8, 3.2); g.fillStyle = CREAM; g.beginPath(); g.moveTo(-2.4, 4); g.lineTo(0, 9); g.lineTo(2.4, 4); g.fill(); g.restore();
      add(g, () => glow(g, x, z, 12 * s, ORANGE, 0.35));
      [[-14, -6], [12, 8], [-8, 10]].forEach(([a, b]) => { g.fillStyle = CREAM; g.save(); g.translate(x + a * s, z + b * s); g.rotate(a * 0.03); g.fillRect(-3 * s, -2 * s, 6 * s, 4 * s); g.strokeStyle = rgba(TEAL, 0.7); g.lineWidth = 0.25 * s; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-2.4 * s, k * s); g.lineTo(2.4 * s, k * s); g.stroke(); } g.restore(); });
      return;
    }
    case 'abc': {   // まわる ABC の 立方体
      ringE(g, x, z - 3 * s, 16 * s, 6 * s, AMBER, 0.35 * s, 0.1);
      [['A', DEEPO], ['B', TEAL], ['C', GOLD], ['D', MINT], ['E', ORANGE]].forEach(([c, col], i) => { const a = i / 5 * 6.283; cube(g, x + Math.cos(a) * 16 * s, z - 3 * s + Math.sin(a) * 6 * s, 4.6 * s, col, c); });
      return;
    }
    case 'farm': {   // だんだんの 畑と 光る 作物
      for (let k = 0; k < 4; k++) { g.fillStyle = ['#7aa83a', '#a8c84a', '#6e9a3a', '#c8b84a'][k]; g.fillRect(x - 16 * s + k * 2 * s, z - 12 * s + k * 6 * s, (32 - k * 4) * s, 4.2 * s); }
      add(g, () => { for (let i = 0; i < 40; i++) glow(g, x + (R() - 0.5) * 28 * s, z - 10 * s + R() * 22 * s, 1.2 * s, i % 3 ? LIME : GOLD, 0.8); });
      return;
    }
    case 'wear': {   // 結晶の ハンガーと リボン
      add(g, () => { g.lineWidth = 1.4 * s; for (const [c, o] of [[ORANGE, 0], [MINT, 6], [AMBER, -6]]) { g.strokeStyle = rgba(c, 0.8); g.beginPath(); g.moveTo(x - 18 * s, z + o * s); g.bezierCurveTo(x - 6 * s, z - 16 * s + o * s, x + 6 * s, z + 16 * s + o * s, x + 18 * s, z - 4 * s + o * s); g.stroke(); } });
      [[-8, -4], [6, 2]].forEach(([a, b]) => { g.strokeStyle = CREAM; g.lineWidth = 0.6 * s; g.beginPath(); g.moveTo(x + a * s - 5 * s, z + b * s + 2 * s); g.lineTo(x + a * s, z + b * s - 2 * s); g.lineTo(x + a * s + 5 * s, z + b * s + 2 * s); g.closePath(); g.stroke(); crystal(g, x + a * s, z + b * s - 2 * s, 4 * s, 1.6 * s, MINT); });
      return;
    }
    case 'land': case 'town': case 'errand': {   // うかぶ 土地の かけらと 小さな いえ
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + R(), d = 10 * s + R() * 6 * s, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d * 0.8; shard(g, px, pz, 4 * s, R, '#5f9a4a'); g.fillStyle = [ORANGE, CREAM, TEAL, DEEPO, GOLD][i]; g.fillRect(px - 1.2 * s, pz - 2.2 * s, 2.4 * s, 2 * s); g.fillStyle = '#7a3a2a'; g.beginPath(); g.moveTo(px - 1.6 * s, pz - 2.2 * s); g.lineTo(px, pz - 3.6 * s); g.lineTo(px + 1.6 * s, pz - 2.2 * s); g.fill(); add(g, () => glow(g, px, pz - 1.4 * s, 2.4 * s, GOLD, 0.55)); }
      if (r.id === 'town') beam(g, x, z, 16 * s, 1.6 * s, GOLD);
      return;
    }
    case 'pet': {   // 光る 足あとの くぼみと たまご
      add(g, () => { glow(g, x, z + 2 * s, 9 * s, AMBER, 0.6); for (const [a, b] of [[-7, -8], [-2, -11], [3, -11], [8, -8]]) glow(g, x + a * s, z + b * s, 3 * s, AMBER, 0.75); });
      g.fillStyle = CREAM; g.beginPath(); g.ellipse(x + 12 * s, z + 6 * s, 3.6 * s, 4.6 * s, 0, 0, 6.283); g.fill(); g.fillStyle = rgba(TEAL, 0.6); g.beginPath(); g.ellipse(x + 11 * s, z + 5 * s, 1.2 * s, 1 * s, 0, 0, 6.283); g.fill();
      return;
    }
    case 'talk': case 'conv': {   // ふきだしの 結晶
      speech(g, x - 7 * s, z - 6 * s, 14 * s, 9 * s, r.id === 'talk' ? MINT : ORANGE); speech(g, x + 8 * s, z + 2 * s, 11 * s, 7 * s, r.id === 'talk' ? CREAM : AMBER); speech(g, x - 2 * s, z + 10 * s, 8 * s, 5 * s, TEAL);
      return;
    }
    case 'mini': {   // うかぶ サイコロ・ブロック
      [[-10, -6, DEEPO, '⚀'], [2, -12, TEAL, ''], [10, 0, GOLD, ''], [-4, 6, MINT, ''], [12, -10, ORANGE, '']].forEach(([a, b, c], i) => cube(g, x + a * s, z + b * s, (4 + (i % 2) * 1.5) * s, c, ['?', '★', '!', '♪', '+'][i]));
      return;
    }
    case 'meadow': { add(g, () => { for (let i = 0; i < 60; i++) glow(g, x + (R() - 0.5) * r.rx * 1.4, z + (R() - 0.5) * r.rz * 1.4, 1.1 * s, [LIME, GOLD, CREAM, MINT][i % 4], 0.85); }); for (let i = 0; i < 6; i++) crystal(g, x + (R() - 0.5) * 24 * s, z + (R() - 0.5) * 18 * s, 3 * s, 1.4 * s, LIME); return; }
    case 'forest': { add(g, () => { for (let i = 0; i < 80; i++) glow(g, x + (R() - 0.5) * r.rx * 1.5, z + (R() - 0.5) * r.rz * 1.5, (0.6 + R()) * s, i % 5 ? MINT : AMBER, 0.75); }); beam(g, x, z, 18 * s, 3 * s, MINT); return; }
    case 'desert': {   // うかぶ 砂丘から 宇宙へ ながれる 砂
      const [fx, fz] = at(0.2, 0.9);
      add(g, () => { for (let i = 0; i < 120; i++) { const t = R(); glow(g, fx + (R() - 0.5) * 10 * s + t * 6 * s, fz + t * 40 * s, (0.5 + (1 - t)) * 0.6 * s, GOLD, 0.6 * (1 - t)); } });
      crystal(g, x - 4 * s, z - 2 * s, 12 * s, 9 * s, AMBER);
      return;
    }
    case 'canyon': {   // 赤い 渓谷に 光る すじ
      add(g, () => { g.strokeStyle = rgba(ORANGE, 0.85); g.lineWidth = 0.6 * s; for (let k = 0; k < 6; k++) { let px = x + (R() - 0.5) * 30 * s, pz = z + (R() - 0.5) * 24 * s; g.beginPath(); g.moveTo(px, pz); for (let j = 0; j < 6; j++) { px += (R() - 0.5) * 8 * s; pz += (R() - 0.2) * 5 * s; g.lineTo(px, pz); } g.stroke(); } });
      return;
    }
    case 'snow': case 'eiken1': { for (let i = 0; i < 7; i++) crystal(g, x + (R() - 0.5) * 30 * s, z + (R() - 0.3) * 22 * s, (8 + R() * 10) * s, (3 + R() * 2) * s, i % 3 ? CREAM : MINT); if (r.id === 'eiken1') eiken(g, r, s, 7, CREAM); return; }
    case 'reef': {   // 水の あわに つつまれた サンゴ
      const gr = g.createRadialGradient(x - 6 * s, z - 6 * s, 2, x, z, 22 * s); gr.addColorStop(0, 'rgba(216,255,240,.35)'); gr.addColorStop(0.8, 'rgba(79,208,180,.25)'); gr.addColorStop(1, 'rgba(143,240,200,.05)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, z, 22 * s, 0, 6.283); g.fill(); ringE(g, x, z, 22 * s, 22 * s, MINT, 0.35 * s);
      for (let i = 0; i < 8; i++) crystal(g, x + (R() - 0.5) * 26 * s, z + (R() - 0.5) * 20 * s, (4 + R() * 5) * s, 2 * s, i % 2 ? ORANGE : AMBER);
      return;
    }
    case 'ruins': {   // 星時計の 遺跡：うかぶ 歯車と ルーンの わ
      gear(g, x - 6 * s, z - 4 * s, 9 * s, '#c9c4b2'); gear(g, x + 9 * s, z + 4 * s, 6 * s, GOLD);
      ringE(g, x, z, 20 * s, 9 * s, MINT, 0.3 * s);
      for (let i = 0; i < 5; i++) shard(g, x + (R() - 0.5) * 34 * s, z + (R() - 0.5) * 24 * s, 2 * s, R, '#9a978c');
      return;
    }
    case 'moon': {   // 月影の 庭：三日月の アーチと ちょうちん
      add(g, () => glow(g, x, z - 8 * s, 18 * s, CREAM, 0.35));
      g.fillStyle = CREAM; g.beginPath(); g.arc(x, z - 6 * s, 12 * s, 3.3, 6.1); g.arc(x + 3 * s, z - 3 * s, 10 * s, 6.0, 3.4, true); g.closePath(); g.fill();
      for (let i = 0; i < 5; i++) add(g, () => glow(g, x - 12 * s + i * 6 * s, z + 8 * s, 2 * s, ORANGE, 0.9));
      return;
    }
    case 'storm': {   // 風鳴りの 高原：うかぶ 台地と いなずまの 結晶
      for (let i = 0; i < 4; i++) shard(g, x + (R() - 0.5) * 30 * s, z + (R() - 0.5) * 20 * s, 4 * s, R, '#6f9a6a');
      add(g, () => { g.strokeStyle = rgba(AMBER, 0.95); g.lineWidth = 0.7 * s; g.beginPath(); g.moveTo(x - 2 * s, z - 18 * s); g.lineTo(x + 3 * s, z - 8 * s); g.lineTo(x - 1 * s, z - 6 * s); g.lineTo(x + 4 * s, z + 4 * s); g.stroke(); glow(g, x + 2 * s, z - 6 * s, 8 * s, AMBER, 0.4); });
      return;
    }
    default:
      if (/^eiken/.test(r.id)) { const lv = { eiken5: 1, eiken4: 2, eiken3: 3, eikenp2: 4, eiken2: 5, eikenp1: 6 }[r.id] || 1; eiken(g, r, s, lv, AURA[r.id]); }
  }
}
// 英検：うかぶ だんだんの 台と 結晶の 神殿（級が 上がるほど 結晶が ふえ、光が 大きい）
function eiken(g, r, s, lv, col) {
  const x = r.x, z = r.z;
  for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? 'rgba(255,244,214,.22)' : 'rgba(6,30,22,.25)'; g.beginPath(); g.ellipse(x, z + 6 * s - k * 4 * s, (18 - k * 4) * s, (8 - k * 1.6) * s, 0, 0, 6.283); g.fill(); }
  add(g, () => glow(g, x, z - 6 * s, (12 + lv * 3) * s, col, 0.3 + lv * 0.04));
  crystal(g, x, z - 4 * s, (10 + lv * 1.5) * s, 5 * s, col);
  for (let i = 0; i < lv; i++) { const a = i / Math.max(1, lv) * 6.283 + 0.3; crystal(g, x + Math.cos(a) * 12 * s, z - 2 * s + Math.sin(a) * 6 * s, (5 + lv * 0.6) * s, 2.2 * s, i % 2 ? CREAM : col); }
}
// メインの島：光る 未来の まち（道の 光の すじ・ビルの 光・プラネタリウムの 光・ポータルの わ）
function mainGlow(g) {
  add(g, () => {
    glow(g, MX - 28, MZ - 24.6, 12, MINT, 0.45);   // プラネタリウム
    glow(g, MX + 71, MZ + 16, 14, ORANGE, 0.3);   // ひろば
    for (const [x, z] of [[-71, -62], [-55, -62], [-38, -58], [-22, -60], [-71, -42], [-55, -41], [-71, -22], [-55, -22], [-55, -5], [-38, -42]]) glow(g, MX + x + 2, MZ + z - 6, 5, ORANGE, 0.35);
  });
  ringE(g, MX - 6, MZ - 46, 6, 2.4, MINT, 0.5);   // ポータルの わ（ふねの 北の さんばし）
  ringE(g, MX + 71, MZ + 16, 16, 13, ORANGE, 0.35);
}
