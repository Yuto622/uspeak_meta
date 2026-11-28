// すいぞくかん（中）— 2026-11「こういう 水族館の 3D モデル 作っといて。超リアル」「でも 重く ならない ように」。
//
// 写真 2 まい（大きな まるい まどの ホール・ペンギンの 水そうの ろうか）の ふんいきを もらった **オリジナル**の
// 「U-SPEAK AQUARIUM／ユースピーク すいぞくかん」。本物の 館の 名前・ロゴは 使わない。看板は 英語＋ひらがな（canvas に 焼く）。
//
// 作り（光は 1 つも 足さない・後処理なし・うつりこみ用の 2 回目の 描画なし・シェーダーに ループなし）：
// ・部屋は「水そうの 光だけ」で 照らす：かべ・床・金属・人の シェーダーが、まるい まど（円の 光）と ペンギンの ガラス（四角の 光）から
//   とどく 明るさを 式で 出す（距離・向き・コースティクスの 絵を 2 回 引いて 小さい ほう）。天井の スポットは 格子の 式。
// ・床の うつりこみは にせもの：見る 向きを 床で はね返し、まどの 面（z＝-25）と ぶつかる 所が 円の 中なら 水の 色（遠いほど ぼかす）。
// ・ホールの 空気の もや：目から 床・かべまでの 線が まどの 中心に どれだけ 近づくかで 足す（体積の けはいを 1 行で）。
// ・水の 中：ガラスから その 点まで 水の 中を 通った 長さで 深い 青に しずむ（ペンギンは 水面より 上の 区間を のぞく）。赤から きえる。
//   上からの 光・底の コースティクス・水面を 下から 見た ゆれ（スネルの まど＋全反射の きらめき）・光の すじ（加算の 板）・ただよう 粒（Points）。
// ・魚・エイ・カメ・サメ・ペンギン・クラゲは **頂点シェーダーが 動かす**（道は 円と sin の 式・尾びれ・つばさ・ヒレ）。update(t) は 時計を 書く だけ＝毎フレームの 計算も 配列も なし。
// ・材質ごとに 1 メッシュ（描画は 約 17 回）。もようは 1 回だけ 作って 使いまわす（ノイズと コースティクスは DataTexture＝Node でも 作れる、看板と 床の もようは canvas＝try/catch）。
// ・どの 島にも まだ 置いて いない。見本は /dev-aquarium.html。
//
// buildAquarium() … 原点は 1 階の ゆか（ホールの まんなか あたり）、+z が 入口。
//   入口の ホール（x -8…8, z 15…25・クラゲの 柱）→ まるい まどの ホール（x -13…13, z -25…15・高さ 12・2 階の バルコニー）→
//   ペンギンの ろうか（x 13.3…20, z -21…12・高さ 3.4・東がわが ぜんぶ ガラス）。水そうは ホールの おく（z -25 より おく）と ろうかの 東（x 20 より 東）。
// obstacles は island-kit と 同じ { x, z, w, d }（w・d は 半分）。
import * as THREE from './three.module.js';
import { tex, rng, box, cyl } from './library-real.js';

const now = () => (globalThis.performance?.now?.() ?? Date.now());
const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif';
const TAU = Math.PI * 2;

/* ───────── 間取り ───────── */
export const AQUARIUM = {
  hall: { x0: -13, x1: 13, z0: -25, z1: 15, top: 12, balcony: 5 },
  foyer: { x0: -8, x1: 8, z0: 15, z1: 25, top: 5 },
  corridor: { x0: 13.3, x1: 20, z0: -21, z1: 12, top: 3.4 },
  window: { x: 0, y: 5.5, z: -25, r: 4.5, R: 5.6 },
  penguinGlass: { x: 20, z0: -20, z1: 11, y0: 0.15, y1: 3.3, waterline: 2.25 },
  jelly: { x: 4.6, z: 19.6, r: 0.85, y0: 0.65, y1: 3.95 },
  entrance: { x: 0, z: 23.2, ry: Math.PI },
};
const W = AQUARIUM.window, PG = AQUARIUM.penguinGlass, J = AQUARIUM.jelly;

/* ───────── もよう（1 回だけ） ───────── */
const TEXLOG = new Map();
const track = (k, t, mip = true) => { const im = t?.image; if (im?.width) TEXLOG.set(k, (im.width * im.height * 4 * (mip ? 4 / 3 : 1)) / 1048576); };
export function aquariumTextureMB() { return +[...TEXLOG.values()].reduce((a, b) => a + b, 0).toFixed(2); }

// 256² RGBA：R こまかい ざらつき・G 大きな しみ・B ヘアライン（x は ゆっくり・y は こまかく）・A コースティクス（ボロノイの ふち）。どれも つながる。
let NOISE = null;
function noiseTexture() {
  if (NOISE) return NOISE;
  const N = 256, d = new Uint8Array(N * N * 4), rnd = rng(911);
  const lattice = (L) => { const a = new Float32Array(L * L); for (let i = 0; i < a.length; i += 1) a[i] = rnd(); return a; };
  const vn = (lat, L, x, y) => { // x, y は 0..L
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i0 = ((xi % L) + L) % L, j0 = ((yi % L) + L) % L, i1 = (i0 + 1) % L, j1 = (j0 + 1) % L;
    const a = lat[j0 * L + i0], b = lat[j0 * L + i1], c = lat[j1 * L + i0], e = lat[j1 * L + i1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy;
  };
  const L1 = [lattice(32), lattice(64), lattice(128)], L2 = [lattice(4), lattice(8), lattice(16)], LB = [lattice(4), lattice(128)], LB2 = [lattice(8), lattice(256)];
  // ボロノイ（8×8 の 区画に 1 点ずつ）
  const G = 8, pts = new Float32Array(G * G * 2); for (let i = 0; i < G * G; i += 1) { pts[i * 2] = rnd(); pts[i * 2 + 1] = rnd(); }
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const u = x / N, v = y / N, o = (y * N + x) * 4;
    const r = 0.5 * vn(L1[0], 32, u * 32, v * 32) + 0.3 * vn(L1[1], 64, u * 64, v * 64) + 0.2 * vn(L1[2], 128, u * 128, v * 128);
    const g = 0.55 * vn(L2[0], 4, u * 4, v * 4) + 0.3 * vn(L2[1], 8, u * 8, v * 8) + 0.15 * vn(L2[2], 16, u * 16, v * 16);
    // ヘアライン：よこに 長い すじ（x は 4 / 8、y は 128 / 256 の こまかさ）
    const bx = 0.55 * vn(LB[1], 128, u * 4 * 1, v * 128) ; const b = 0.5 * bx / 0.55 * 0.6 + 0.4 * vn(LB2[1], 256, u * 8, v * 256) * 0.9 + 0.1 * vn(LB[0], 4, u * 4, v * 4);
    const gx = u * G, gy = v * G, cx = Math.floor(gx), cy = Math.floor(gy); let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j += 1) for (let i = -1; i <= 1; i += 1) {
      const qi = ((cx + i) % G + G) % G, qj = ((cy + j) % G + G) % G, px = cx + i + pts[(qj * G + qi) * 2], py = cy + j + pts[(qj * G + qi) * 2 + 1];
      const dd = Math.hypot(px - gx, py - gy); if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
    const edge = f2 - f1, caus = Math.exp(-edge * 9) * 0.85 + Math.exp(-edge * 30) * 0.4;
    d[o] = Math.min(255, r * 255); d[o + 1] = Math.min(255, g * 255); d[o + 2] = Math.min(255, b * 255); d[o + 3] = Math.min(255, caus * 255);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  NOISE = t; TEXLOG.set('noise', (N * N * 4 * 4 / 3) / 1048576); return t;
}

// ホールの ゆか（26 × 40 m）：くらい 石・1 m の 目地・まどの 前の 同心円・まんなかの はしごの もよう（うすい 青みどり）。
let FLOOR = undefined;
function floorTexture() {
  if (FLOOR !== undefined) return FLOOR;
  const rnd = rng(77);
  FLOOR = tex(1024, 1024, (g, w, h) => {
    const X = (x) => ((x + 13) / 26) * w, Z = (z) => ((z + 25) / 40) * h, M = w / 26; // 1 m の 画素（よこ）
    g.fillStyle = '#20282c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i += 1) { const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 120; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rnd() > 0.5 ? '60,72,78' : '8,12,14'},0.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 9000; i += 1) { g.fillStyle = `rgba(${rnd() > 0.5 ? '120,140,145' : '0,0,0'},${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 1.4, 1.4); }
    // 目地（1.33 m の 板）
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
    for (let x = -13; x <= 13; x += 1.3) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), h); g.stroke(); }
    for (let z = -25; z <= 15; z += 1.3) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(w, Z(z)); g.stroke(); }
    const cx = X(0), cz = Z(-13.5), sx = w / 26, sz = h / 40;
    const ring = (r, lw, a) => { g.save(); g.translate(cx, cz); g.scale(sx, sz); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.restore(); g.lineWidth = lw; g.strokeStyle = `rgba(126,186,180,${a})`; g.stroke(); };
    // うすい 内がわの 円盤
    g.save(); g.translate(cx, cz); g.scale(sx, sz); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 9); gr.addColorStop(0, 'rgba(90,140,140,0.20)'); gr.addColorStop(0.7, 'rgba(70,120,120,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); g.restore();
    ring(2.4, 5, 0.75); ring(3.0, 2, 0.55); ring(4.6, 7, 0.7); ring(5.3, 2, 0.45); ring(7.2, 4, 0.6); ring(9.4, 2.5, 0.5); ring(10.2, 7, 0.55);
    // 円の 目もり
    g.save(); g.translate(cx, cz); g.scale(sx, sz); g.strokeStyle = 'rgba(126,186,180,0.5)'; g.lineWidth = 0.07;
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 7.4, Math.sin(a) * 7.4); g.lineTo(Math.cos(a) * 9.2, Math.sin(a) * 9.2); g.stroke(); }
    g.restore();
    // はしご（まどから 入口へ）
    g.fillStyle = 'rgba(132,192,186,0.72)';
    for (const s of [-1, 1]) g.fillRect(X(s * 0.85) - 0.09 * M, Z(-24.5), 0.18 * M, Z(13.5) - Z(-24.5));
    for (let z = -24; z <= 13; z += 1.1) g.fillRect(X(-0.85), Z(z) - 0.07 * sz, X(0.85) - X(-0.85), 0.14 * sz);
    // まんなかの ひし形
    g.save(); g.translate(cx, cz); g.scale(sx, sz); g.fillStyle = 'rgba(140,200,192,0.65)'; g.beginPath(); g.moveTo(0, -1.4); g.lineTo(1.1, 0); g.lineTo(0, 1.4); g.lineTo(-1.1, 0); g.closePath(); g.fill();
    g.fillStyle = '#20282c'; g.beginPath(); g.moveTo(0, -0.9); g.lineTo(0.7, 0); g.lineTo(0, 0.9); g.lineTo(-0.7, 0); g.closePath(); g.fill(); g.restore();
  }, { repeat: false, aniso: 8 });
  if (FLOOR) track('floor', FLOOR);
  return FLOOR;
}

// 看板・画面・ラベルの 絵（1024²）。
const ATLAS_RECT = {
  main: [0, 0, 1024, 256], ocean: [0, 256, 1024, 128], penguin: [0, 384, 1024, 128],
  screenA: [0, 512, 512, 320], screenB: [512, 512, 512, 320],
  label0: [0, 832, 256, 128], label1: [256, 832, 256, 128], label2: [512, 832, 256, 128], label3: [768, 832, 256, 128],
  way: [0, 960, 512, 64], exit: [512, 960, 256, 64], day: [768, 960, 192, 64], white: [976, 976, 32, 32],
  tickets: [0, 1024, 512, 128], info: [512, 1024, 512, 256], hours: [0, 1152, 512, 128],
};
const ATLAS_H = 1280;
let ATLAS = undefined;
function atlasTexture() {
  if (ATLAS !== undefined) return ATLAS;
  ATLAS = tex(1024, ATLAS_H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, ATLAS_H);
    const R = ATLAS_RECT;
    const text = (s, x, y, size, color, glow, weight = 800, align = 'center') => { g.save(); g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.shadowColor = glow; g.shadowBlur = size * 0.35; g.fillStyle = color; g.fillText(s, x, y); g.shadowBlur = 0; g.fillText(s, x, y); g.restore(); };
    // 1 大看板：波の マーク＋名前
    { const [x, y, w, h] = R.main; g.fillStyle = '#03080b'; g.fillRect(x, y, w, h);
      g.save(); g.translate(x + 130, y + 128); g.strokeStyle = '#8ff0e0'; g.shadowColor = '#3fd0ff'; g.shadowBlur = 18; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 78, 0, TAU); g.stroke();
      g.lineWidth = 7; for (let k = 0; k < 3; k += 1) { g.beginPath(); for (let i = 0; i <= 40; i += 1) { const px = -58 + i * 2.9, py = -18 + k * 22 + Math.sin(i * 0.33 + k) * 9; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
      g.restore();
      text('U-SPEAK AQUARIUM', x + 600, y + 92, 84, '#e8fbff', '#40c8ff', 800);
      text('ユースピーク すいぞくかん', x + 600, y + 186, 58, '#bff3ea', '#2fb8c8', 700); }
    const bar = (rect, en, ja, accent) => { const [x, y, w, h] = rect; g.fillStyle = '#04090c'; g.fillRect(x, y, w, h); g.fillStyle = accent; g.fillRect(x + 18, y + 20, 10, h - 40);
      text(en, x + 60, y + h * 0.36, 52, '#f2fbff', accent, 800, 'left'); text(ja, x + 60, y + h * 0.76, 34, '#cfeff0', accent, 700, 'left'); };
    bar(R.ocean, 'OCEAN WINDOW', 'うみの まど', '#3fc8ff');
    bar(R.penguin, 'PENGUIN COVE', 'ペンギンの いりえ', '#ffb066');
    // 画面 A：さんごしょう
    { const [x, y, w, h] = R.screenA; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0b4a6e'); gr.addColorStop(1, '#03182a'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      for (let i = 0; i < 6; i += 1) { g.fillStyle = ['#ff8a4a', '#ffd04a', '#ff6f9a', '#b07ae0', '#ffb066', '#ff7a5a'][i]; g.beginPath(); g.ellipse(x + 60 + i * 75, y + h - 40, 30, 22 + (i % 3) * 10, 0, Math.PI, 0); g.fill(); }
      const fish = (fx, fy, s, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(fx, fy, 34 * s, 18 * s, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(fx - 28 * s, fy); g.lineTo(fx - 56 * s, fy - 18 * s); g.lineTo(fx - 56 * s, fy + 18 * s); g.fill(); g.fillStyle = '#012'; g.beginPath(); g.arc(fx + 20 * s, fy - 4 * s, 4 * s, 0, TAU); g.fill(); };
      fish(x + 360, y + 150, 1.3, '#ffd23a'); fish(x + 250, y + 200, 0.9, '#2f7cff'); fish(x + 420, y + 220, 0.7, '#ff8a3a');
      text('CORAL REEF', x + 26, y + 54, 46, '#ffffff', '#40c8ff', 800, 'left'); text('さんごしょう', x + 26, y + 104, 32, '#d6f6ff', '#40c8ff', 700, 'left'); }
    // 画面 B：魚を かぞえよう
    { const [x, y, w, h] = R.screenB; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0d3e5c'); gr.addColorStop(1, '#021422'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(210,235,245,0.9)'; for (let i = 0; i < 40; i += 1) { const a = i * 0.7, r = 40 + (i % 5) * 12; g.beginPath(); g.ellipse(x + 360 + Math.cos(a) * r, y + 190 + Math.sin(a) * r * 0.5, 9, 4, a + 1.6, 0, TAU); g.fill(); }
      text("LET'S COUNT!", x + 26, y + 54, 44, '#ffffff', '#ffb066', 800, 'left'); text('さかなを かぞえよう', x + 26, y + 104, 30, '#ffe6c6', '#ffb066', 700, 'left');
      text('1, 2, 3 …', x + 40, y + 250, 40, '#8ff0c8', '#2fb8a0', 700, 'left'); }
    // ラベル 4 まい
    const LBL = [['GENTOO PENGUIN', 'ジェンツーペンギン'], ['SWIM FAST!', 'はやく およぐよ'], ['BLACK & WHITE', 'くろと しろ'], ['FISH FOR LUNCH', 'ごはんは さかな']];
    LBL.forEach(([en, ja], i) => { const [x, y, w, h] = R[`label${i}`]; g.fillStyle = '#e9eef0'; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.fillStyle = '#16232a'; g.fillRect(x + 4, y + 4, 10, h - 8);
      g.fillStyle = '#16232a'; g.beginPath(); g.ellipse(x + 48, y + 64, 16, 30, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + 52, y + 70, 9, 21, 0, 0, TAU); g.fill(); g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(x + 58, y + 42); g.lineTo(x + 72, y + 46); g.lineTo(x + 58, y + 50); g.fill();
      g.save(); g.font = `800 26px ${FONT}`; g.fillStyle = '#10202a'; g.textBaseline = 'middle'; g.fillText(en, x + 82, y + 46, w - 92); g.font = `700 22px ${FONT}`; g.fillStyle = '#2b4a58'; g.fillText(ja, x + 82, y + 84, w - 92); g.restore(); });
    { const [x, y, w, h] = R.way; g.fillStyle = '#04090c'; g.fillRect(x, y, w, h); text('PENGUIN COVE  →', x + 24, y + 22, 30, '#ffe0b8', '#ffb066', 800, 'left'); text('ペンギンは こちら', x + 24, y + 50, 20, '#ffd6a8', '#ffb066', 700, 'left'); }
    { const [x, y, w, h] = R.exit; g.fillStyle = '#0a7a46'; g.fillRect(x, y, w, h); text('EXIT でぐち', x + w / 2, y + h / 2, 32, '#ffffff', '#5fffb0', 800); }
    { const [x, y, w, h] = R.day; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#dff2ff'); gr.addColorStop(0.55, '#f6f3ea'); gr.addColorStop(0.6, '#b8c4a0'); gr.addColorStop(1, '#8c9478'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
    { const [x, y, w, h] = R.white; g.fillStyle = '#fff'; g.fillRect(x - 8, y - 8, w + 16, h + 16); }
    // きっぷ うりば
    { const [x, y, w, h] = R.tickets; g.fillStyle = '#0a1418'; g.fillRect(x, y, w, h); g.strokeStyle = '#3fd0d0'; g.lineWidth = 4; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      g.save(); g.translate(x + 70, y + 64); g.rotate(-0.25); g.fillStyle = '#ffb066'; g.fillRect(-36, -22, 72, 44); g.fillStyle = '#0a1418'; g.beginPath(); g.arc(-36, 0, 9, 0, TAU); g.arc(36, 0, 9, 0, TAU); g.fill(); g.restore();
      text('TICKETS', x + 140, y + 46, 50, '#f2fbff', '#3fd0ff', 800, 'left'); text('きっぷ うりば', x + 142, y + 96, 32, '#cfeff0', '#3fd0ff', 700, 'left'); }
    // フロアの あんない
    { const [x, y, w, h] = R.info; g.fillStyle = '#0b1a20'; g.fillRect(x, y, w, h); text('FLOOR GUIDE  あんない', x + 24, y + 30, 30, '#ffffff', '#3fd0ff', 800, 'left');
      const zone = (zx, zy, zw, zh, c, en, ja) => { g.fillStyle = c; g.fillRect(x + zx, y + zy, zw, zh); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + zx, y + zy + zh - 46, zw, 46); text(en, x + zx + 10, y + zy + zh - 32, 20, '#fff', c, 800, 'left'); text(ja, x + zx + 10, y + zy + zh - 12, 16, '#e8fbff', c, 700, 'left'); };
      zone(24, 58, 250, 120, '#1d6f9a', 'OCEAN WINDOW', 'うみの まど'); zone(290, 58, 190, 120, '#b8661e', 'PENGUIN COVE', 'ペンギン'); zone(24, 190, 456, 52, '#2e6a52', 'ENTRANCE', 'いりぐち');
      g.fillStyle = '#ff5a5a'; g.beginPath(); g.arc(x + 250, y + 216, 10, 0, TAU); g.fill(); text('YOU ARE HERE', x + 300, y + 216, 18, '#ffd0d0', '#ff5a5a', 800, 'left'); }
    // あいている じかん
    { const [x, y, w, h] = R.hours; g.fillStyle = '#0a1418'; g.fillRect(x, y, w, h); text('OPEN  9:30 – 17:00', x + 30, y + 46, 44, '#f2fbff', '#ffb066', 800, 'left'); text('あいている じかん', x + 32, y + 96, 30, '#ffe6c6', '#ffb066', 700, 'left'); }
  }, { repeat: false, aniso: 8 });
  if (ATLAS) track('atlas', ATLAS);
  return ATLAS;
}
const atlasUV = (k) => { const [x, y, w, h] = ATLAS_RECT[k]; return [x / 1024, 1 - (y + h) / ATLAS_H, (x + w) / 1024, 1 - y / ATLAS_H]; };

/* ───────── 形の 道具 ───────── */
const col = new THREE.Color();
// 材質ごとの たば。extra＝{ 名前: 数 か [数…] }（その 形の 頂点 ぜんぶ 同じ 値）。
function batch() {
  const parts = {};
  function add(key, geo, color = 0xffffff, extra = null) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    if (Array.isArray(color)) col.setRGB(color[0], color[1], color[2]); else col.set(color);
    for (let i = 0; i < n; i += 1) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (extra) for (const [k, v] of Object.entries(extra)) {
      const arr = Array.isArray(v) ? v : [v], s = arr.length, a = new Float32Array(n * s);
      for (let i = 0; i < n; i += 1) for (let j = 0; j < s; j += 1) a[i * s + j] = arr[j];
      g.setAttribute(k, new THREE.BufferAttribute(a, s));
    }
    (parts[key] ||= []).push(g); return g;
  }
  function build(key) {
    const list = parts[key]; if (!list?.length) return null;
    const sizes = {}; for (const p of list) for (const [k, a] of Object.entries(p.attributes)) sizes[k] = a.itemSize;
    let nv = 0; for (const p of list) nv += p.attributes.position.count;
    const out = {}; for (const [k, s] of Object.entries(sizes)) out[k] = new Float32Array(nv * s);
    let v = 0;
    for (const p of list) {
      const c = p.attributes.position.count;
      for (const [k, s] of Object.entries(sizes)) { const a = p.attributes[k]; if (a) out[k].set(a.array.length === c * s ? a.array : Float32Array.from({ length: c * s }, (_, i) => a.getComponent(Math.floor(i / s), i % s)), v * s); }
      v += c; p.dispose();
    }
    const g = new THREE.BufferGeometry();
    for (const [k, s] of Object.entries(sizes)) g.setAttribute(k, new THREE.BufferAttribute(out[k], s));
    g.computeBoundingSphere(); parts[key] = []; return g;
  }
  return { add, build };
}
const yAxis = new THREE.Vector3(0, 1, 0);
function limb(a, b, r0, r1, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(yAxis, B.clone().sub(A).normalize())); g.translate(A.x, A.y, A.z); return g;
}
function ell(x, y, z, rx, ry, rz, ws = 10, hs = 7, th0 = 0, th = Math.PI) { const g = new THREE.SphereGeometry(1, ws, hs, 0, TAU, th0, th); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
// 2 点を むすぶ 細い 角材。
function beamBox(a, b, w, h) { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv), g = new THREE.BoxGeometry(w, h, len).toNonIndexed(); const m = new THREE.Matrix4().lookAt(A, Bv, new THREE.Vector3(0, 1, 0)); m.setPosition(A.clone().add(Bv).multiplyScalar(0.5)); g.applyMatrix4(m); return g; }
// 4 点の 板（a→b→c→d が 反時計回り＝表）。uv は [u0,v0,u1,v1]（a＝左下）。
function quad4(a, b, c, d, uv = [0, 0, 1, 1]) {
  const g = new THREE.BufferGeometry(), [u0, v0, u1, v1] = uv;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1]), 2));
  g.computeVertexNormals(); return g;
}
// たての 板：まんなか (x, y, z)、はば w・高さ h、ry＝表の 向き（0 で +z）。
function panel(x, y, z, w, h, ry = 0, uv) { const g = new THREE.PlaneGeometry(w, h).toNonIndexed(); if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i += 1) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1])); } g.rotateY(ry); g.translate(x, y, z); return g; }
function flatPanel(x, y, z, w, d, up = true) { const g = new THREE.PlaneGeometry(w, d).toNonIndexed(); g.rotateX(up ? -Math.PI / 2 : Math.PI / 2); g.translate(x, y, z); return g; }
// 多角形の 板（XZ）：上の 面・下の 面・ふち。
function slab(poly, yTop, t) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, z)); if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const tri = THREE.ShapeUtils.triangulateShape(pts, []), pos = [];
  for (const f of tri) { const [a, b, c] = f.map((i) => pts[i]); pos.push(a.x, yTop, a.y, c.x, yTop, c.y, b.x, yTop, b.y); pos.push(a.x, yTop - t, a.y, b.x, yTop - t, b.y, c.x, yTop - t, c.y); }
  for (let i = 0; i < pts.length; i += 1) { const a = pts[i], b = pts[(i + 1) % pts.length]; pos.push(a.x, yTop, a.y, b.x, yTop, b.y, b.x, yTop - t, b.y, a.x, yTop, a.y, b.x, yTop - t, b.y, a.x, yTop - t, a.y); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals(); return g;
}
// なめらかな 3D の 値ノイズ（岩を でこぼこに）。
function noise3(x, y, z, seed = 0) {
  const h = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453; return v - Math.floor(v); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
function rock(x, y, z, sx, sy, sz, seed, { detail = 2, rough = 0.38, flat = -0.35, cap = 9 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    let px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const n = (noise3(px * 1.7 + seed, py * 1.7, pz * 1.7, seed) - 0.5) * rough * 2 + (noise3(px * 4.1, py * 4.1 + seed, pz * 4.1, seed + 3) - 0.5) * rough * 0.6;
    px *= 1 + n; py *= 1 + n; pz *= 1 + n; if (py < flat) py = flat + (py - flat) * 0.2; if (py > cap) py = cap + (py - cap) * 0.22;
    p.setXYZ(i, px * sx + x, py * sy + y, pz * sz + z);
  }
  return smoothNormals(g);
}
// なめらかな 法線：同じ 位置の 頂点（ポリヘドロンは ばらばら）の 面の 法線を たして わける。
function smoothNormals(g) {
  g.computeVertexNormals(); const p = g.attributes.position, nr = g.attributes.normal, acc = new Map();
  const key = (i) => (Math.round(p.getX(i) * 500) * 73856093) ^ (Math.round(p.getY(i) * 500) * 19349663) ^ (Math.round(p.getZ(i) * 500) * 83492791);
  for (let i = 0; i < p.count; i += 1) { const k = key(i); let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]); a[0] += nr.getX(i); a[1] += nr.getY(i); a[2] += nr.getZ(i); }
  for (let i = 0; i < p.count; i += 1) { const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; nr.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return g;
}

/* ───────── シェーダー ───────── */
const U = { uTime: { value: 0 }, uNoise: { value: null }, uCam: { value: new THREE.Vector3(0, 1.6, 10) }, uH: { value: 800 } };

const COMMON = `
uniform float uTime; uniform sampler2D uNoise; uniform vec3 uCam;
#define WC vec3(0.,${W.y.toFixed(2)},${W.z.toFixed(2)})
#define WR ${W.r.toFixed(2)}
#define PGX ${PG.x.toFixed(2)}
#define WLV ${PG.waterline.toFixed(2)}
float caus(vec2 p){
  float a=texture2D(uNoise,p*.11+vec2(uTime*.011,uTime*.006)).a;
  float b=texture2D(uNoise,p*.137+vec2(.37-uTime*.008,.71+uTime*.010)).a;
  return min(a,b);
}
float inHall(vec3 p){return 1.-smoothstep(13.05,13.4,p.x);}
float inFoyer(vec3 p){return smoothstep(14.9,15.3,p.z);}
vec3 roomLight(vec3 p,vec3 n){
  vec3 c=vec3(.003,.007,.011)+vec3(.004,.022,.04)*inHall(p)*(1.-inFoyer(p))*(.6+.4*max(n.z,0.));
  vec3 L=WC-p; float d2=dot(L,L); vec3 l=L*inversesqrt(d2);
  float k=max(dot(n,l),0.)*clamp(-l.z*1.15+.08,0.,1.)*(WR*WR)/(d2*.38+WR*WR);
  float near=exp(-max(p.z+25.,0.)*.085);
  float cz=caus(vec2(p.x+p.z*.55,p.y+p.z*.45)*1.25);
  float hl=inHall(p)*(1.-inFoyer(p)*.6);
  c+=vec3(.045,.30,.58)*k*(.55+2.2*cz*near)*hl*4.6;
  // まどから はねかえる 青みどりの 光（部屋 ぜんたい・向きに あまり よらない）
  float fall=1./(1.+max(p.z+25.,0.)*.055+abs(p.x)*.03);
  c+=vec3(.010,.085,.125)*(.55+.45*dot(n,l))*fall*hl*3.2;
  // ゆかの 光が 天井・バルコニーの うらを てらす
  c+=vec3(.012,.075,.11)*max(-n.y,0.)*exp(-max(p.z+25.,0.)*.045)*(1.-exp(-p.y*.25))*hl*2.2;
  vec3 q=vec3(PGX,clamp(p.y,.3,3.2),clamp(p.z,-20.,11.)); vec3 Lp=q-p; float dp=length(Lp)+1e-3;
  vec3 lp=normalize(Lp/dp+vec3(.45,0.,0.));
  float kp=max(dot(n,lp),0.)*1.5/(1.+dp*dp*.16)*(1.-inHall(p));
  float cp=caus(vec2(p.z+p.x*.5,p.y+p.x*.35)*1.7);
  c+=vec3(.10,.42,.62)*kp*(.5+2.2*cp*exp(-dp*.3));
  // ろうかの スポット（x 16・3.5 m おき）
  float zc=(floor(p.z/3.5)+.5)*3.5; vec3 Ls=vec3(16.,3.35,zc)-p; float ds=length(Ls)+1e-3; vec3 ls=Ls/ds;
  c+=vec3(1.,.82,.62)*max(dot(n,ls),0.)*smoothstep(.72,.96,ls.y)*.55/(1.+ds*ds*.35)*(1.-inHall(p));
  // 入口の ダウンライト（4 × 3.33 m）
  vec3 Lf=vec3((floor(p.x/4.)+.5)*4.,4.95,(floor((p.z-15.)/3.34)+.5)*3.34+15.)-p; float df=length(Lf)+1e-3; vec3 lf=Lf/df;
  c+=vec3(1.,.84,.66)*(max(dot(n,lf),0.)*smoothstep(.55,.95,lf.y)*1.5/(1.+df*df*.2)+.035)*inFoyer(p)*inHall(p);
  // かべを なでる 光（かべの 上の ほうが 明るい ほたての 形）
  float wall=1.-abs(n.y); float sc=smoothstep(4.9,3.2,p.y)*smoothstep(.2,2.6,p.y)*(.55+.45*cos((p.x+p.z)*1.57));
  c+=vec3(1.,.8,.6)*wall*sc*.12*inFoyer(p)*inHall(p);
  c+=vec3(.16,.14,.12)*max(-n.y,0.)*inFoyer(p)*inHall(p)*(.6+.4*smoothstep(7.5,4.,abs(p.x)));
  // クラゲの 柱の あおい 光
  vec3 Lj=vec3(${J.x.toFixed(2)},2.3,${J.z.toFixed(2)})-p; float dj=dot(Lj,Lj);
  c+=vec3(.12,.30,.70)*max(dot(n,normalize(Lj)),0.)*1.2/(1.+dj*.35)*inFoyer(p);
  // 入口の 外の 光
  vec3 Ld=vec3(0.,1.6,25.6)-p; float dd=dot(Ld,Ld);
  c+=vec3(.9,.92,.95)*max(dot(n,normalize(Ld)),0.)*3.0/(1.+dd*.12)*inFoyer(p);
  return c;
}
vec3 haze(vec3 p){
  vec3 v=p-uCam; float len=length(v); vec3 vd=v/max(len,1e-3);
  float t=clamp(dot(WC-uCam,vd),0.,len); vec3 c=uCam+vd*t-WC;
  float h=exp(-dot(c,c)*.016)*(1.-exp(-len*.05))*inHall(uCam)*(1.-inFoyer(uCam)*.5);
  float hc=(1.-inHall(uCam))*(1.-exp(-len*.035))*.35;
  return vec3(.03,.17,.28)*h*.85+vec3(.03,.10,.15)*hc;
}
float waterLen(vec3 p,float tank){
  vec3 v=uCam-p; float L=length(v);
  if(tank<.5){ return L*clamp((-25.3-p.z)/max(uCam.z-p.z,1e-3),0.,1.); }
  if(tank<1.5){ float f=clamp((p.x-PGX)/max(p.x-uCam.x,1e-3),0.,1.); vec3 g=p+v*f; float lo=min(g.y,p.y),hi=max(g.y,p.y);
    float uw=clamp((WLV-lo)/max(hi-lo,1e-3),0.,1.); return L*f*uw; }
  return 1.2;
}
vec3 fogCol(vec3 p,float tank){
  vec3 vd=normalize(p-uCam);
  if(tank<.5){ float h=clamp(p.y/14.*.55+vd.y*.75+.12,0.,1.); return mix(vec3(.001,.016,.05),vec3(.03,.25,.46),h*h); }
  if(tank<1.5){ float h=clamp(p.y/WLV*.55+vd.y*.6+.15,0.,1.); return mix(vec3(.008,.07,.14),vec3(.09,.42,.60),h); }
  return mix(vec3(.003,.02,.07),vec3(.03,.13,.32),clamp((p.y-.6)/3.4,0.,1.));
}
float fogK(float tank){return tank<.5?.072:tank<1.5?.095:.35;}
vec3 waterShade(vec3 alb,vec3 p,vec3 n,float tank,vec3 extra){
  float surf=tank<.5?14.:tank<1.5?WLV:4.;
  float depth=max(surf-p.y,0.); float dw=waterLen(p,tank);
  vec3 col;
  if(tank>.5&&tank<1.5&&p.y>WLV){
    col=alb*(vec3(.78,.86,.95)*(.38+.72*max(n.y,0.))+vec3(.16,.26,.34)*max(-n.x,0.)+vec3(.10,.22,.30)*caus(p.zx*1.3)*max(n.y,0.))+extra*.6;
    return col*(1.-.15*smoothstep(0.,6.,dw));
  }
  float cz=caus(p.xz*(tank<.5?1.:1.7)+p.y*.2);
  vec3 sun=(tank<.5?vec3(.55,.82,1.05):vec3(.55,.86,1.05))*exp(-depth*.04);
  float up=max(n.y,0.);
  col=alb*sun*(.20+.55*up+.18*max(dot(n,normalize(uCam-p)),0.)+2.4*cz*up*exp(-depth*.035))+extra;
  col*=exp(-vec3(.19,.05,.022)*(depth*.2+dw));
  float f=1.-exp(-dw*fogK(tank));
  return mix(col,fogCol(p,tank),f);
}
`;
const OUT = `#include <tonemapping_fragment>
#include <colorspace_fragment>`;

function shader(name, vertexShader, fragmentShader, opts = {}) {
  const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...(opts.uniforms || {}) }, vertexShader, fragmentShader, vertexColors: opts.vertexColors ?? true, side: opts.side ?? THREE.DoubleSide, ...(opts.extra || {}) });
  m.name = `aqua-${name}`; return m;
}
const VBASIC = `attribute float aA; attribute float aB; varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 p=position; vP=p; vN=normal; vC=color; vA=aA; vB=aB; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;

// かべ・天井・台：アルベド（頂点色 × ノイズ）× 部屋の 光。
const ROOM_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 a=abs(n);
  vec2 uv=a.y>.7?vP.xz:(a.x>a.z?vP.zy:vP.xy);
  float g=texture2D(uNoise,uv*.31).r, b=texture2D(uNoise,uv*.045).g;
  vec3 alb=vC*(.72+.45*g)*(.75+.5*b);
  vec3 c=alb*roomLight(vP,n)+haze(vP);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// ゆか：ホールは もようの 絵、ほかは 頂点色。にせの うつりこみ（まど・ペンギンの ガラス・天井の スポット）。
const FLOOR_FRAG = `${COMMON} uniform sampler2D uFloor; uniform float uHasFloor; varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 p=vP; vec3 n=vec3(0.,1.,0.);
  vec2 nz=texture2D(uNoise,p.xz*.11).gg-.5;
  vec3 alb; float gl=1.;
  if(vA>.5&&vA<1.5&&uHasFloor>.5){ alb=texture2D(uFloor,vec2((p.x+13.)/26.,1.-(p.z+25.)/40.)).rgb; }
  else if(vA>1.5){ // 入口：テラゾー（石の つぶ）＋ 1.2 m の 目地 ＋ クラゲの 柱を かこむ 青い 帯
    vec2 tq=p.xz/1.2; vec2 tf=abs(fract(tq)-.5); float joint=smoothstep(.492,.499,max(tf.x,tf.y));
    float tone=step(.5,fract((floor(tq.x)+floor(tq.y))*.5));
    float ch=texture2D(uNoise,p.xz*2.7).r, ch2=texture2D(uNoise,p.xz*5.3+.3).r;
    alb=mix(vec3(.50,.49,.46),vec3(.40,.40,.39),tone)*(.92+.16*texture2D(uNoise,p.xz*.3).g);
    alb=mix(alb,vec3(.14,.15,.16),smoothstep(.70,.74,ch)*.8); alb=mix(alb,vec3(.78,.76,.70),smoothstep(.72,.76,ch2)*.6);
    float rj=length(p.xz-vec2(${J.x.toFixed(2)},${J.z.toFixed(2)})); float band=smoothstep(.06,.0,abs(rj-1.75)-.07)+smoothstep(.03,.0,abs(rj-2.05)-.02)*.7;
    alb=mix(alb,vec3(.10,.42,.44),band*.85);
    alb*=1.-joint*.45; gl=1.-joint*.8;
  }
  else alb=vC*(.8+.4*texture2D(uNoise,p.xz*.45).r)*(.85+.3*texture2D(uNoise,p.xz*.05).g);
  vec3 c=alb*roomLight(p,n);
  vec3 v=normalize(p-uCam); vec3 r=vec3(v.x,-v.y,v.z); r.xz+=nz*.006; r=normalize(r);
  float fr=.06+.94*pow(1.-abs(v.y),5.);
  float gloss=vB*gl;
  vec3 refl=vec3(0.);
  if(r.z<-.01&&p.x<13.2&&p.z<15.){ float t=(-25.-p.z)/r.z; vec3 h=p+r*t; vec2 q=h.xy-WC.xy; float d=length(q);
    // みがいた 床：よこは くっきり、たて（手前へ）は のびて ぼける
    float bl=.02+t*.006; float da=length(vec2(q.x,q.y*.5)); float dm=mix(d,da,smoothstep(.0,3.,q.y));
    float lo=max(q.y-WR*.8,0.); float fade=exp(-lo*.5);
    float disk=smoothstep(WR+bl+max(q.y,0.)*.06,WR-bl,dm)*fade;
    float rim=exp(-pow((dm-WR-.04)/(.05+bl+max(q.y,0.)*.04),2.))*exp(-lo*1.6);
    float ringM=smoothstep(WR+.1,WR+.2,d)*smoothstep(${W.R.toFixed(2)}+.25,${W.R.toFixed(2)}-.05,d);
    vec3 tc=mix(vec3(.004,.05,.13),vec3(.07,.46,.74),pow(clamp((h.y-1.)/9.,0.,1.),1.3));
    tc*=.75+.6*caus(h.xy*.7);
    tc+=vec3(.10,.35,.45)*pow(max(1.-abs(q.x+q.y*.18-1.2)*.9,0.),3.)*smoothstep(-2.,4.,q.y)*.6;
    float st=exp(-abs(q.x)*.5)*exp(-max(q.y-WR,0.)*.2)*step(0.,q.y)*(1.-disk); // みがいた 床の たての にじみ
    float pol=.7+.6*texture2D(uNoise,vec2(p.x*.9,p.z*.04)).b;
    refl+=(tc*disk*2.+vec3(.35,1.,1.15)*rim*1.6)*pol+vec3(.015,.05,.06)*ringM+vec3(.03,.18,.28)*st*.8+vec3(.02,.11,.2)*exp(-max(d-WR,0.)*.5)*.5; }
  if(r.x>.01&&p.x>13.2){ float t=(PGX-p.x)/r.x; vec3 h=p+r*t; float bl=.03+t*.02;
    float m=smoothstep(-bl,bl,h.y-.15)*smoothstep(-bl,bl,3.3-h.y)*smoothstep(-bl,bl,h.z+20.)*smoothstep(-bl,bl,11.-h.z);
    vec3 tc=mix(vec3(.03,.2,.34),vec3(.25,.58,.72),smoothstep(1.2,2.8,h.y));
    tc=mix(tc,vec3(.75,.85,.92),smoothstep(WLV+.02,WLV+.1,h.y));
    refl+=tc*m*1.3*(.8+.5*caus(h.zy*1.5)); }
  if(r.y>.02&&(p.x>13.2||p.z>15.)){ float top=p.x>13.2?3.4:5.; float tt=(top-p.y)/r.y; vec3 h=p+r*tt;
    vec2 gq=p.x>13.2?vec2(h.x-16.,mod(h.z,3.5)-1.75):vec2(mod(h.x,4.)-2.,mod(h.z-15.,3.34)-1.67);
    float inside=p.x>13.2?step(-21.,h.z)*step(h.z,12.):step(abs(h.x),8.)*step(15.,h.z)*step(h.z,25.);
    refl+=vec3(1.,.88,.72)*smoothstep(.16+tt*.02,.0,length(gq))*2.2*inside;
    if(p.z>15.){ // 入口：ドアの 外の 光・クラゲの 柱
      float tz=(25.-p.z)/max(r.z,1e-3); vec3 hd=p+r*tz; refl+=vec3(.9,.92,.95)*step(0.,r.z)*step(abs(hd.x),2.4)*step(hd.y,3.)*.9;
      vec2 jq=p.xz-vec2(${J.x.toFixed(2)},${J.z.toFixed(2)}); float jb=dot(jq,r.xz/length(r.xz)); float jd=length(jq-r.xz/length(r.xz)*jb);
      float jt=-jb/max(length(r.xz),1e-3); float jy=p.y+r.y*jt; refl+=vec3(.08,.25,.65)*step(jd,${J.r.toFixed(2)})*step(jb,0.)*step(${J.y0.toFixed(2)},jy)*step(jy,${J.y1.toFixed(2)})*1.2; } }
  c+=refl*(fr*.85+.14)*gloss;
  c+=haze(p);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// みがいた ステンレス：まど・ガラス・スポットの うつりこみ（向きだけの 式）× ヘアライン。
const METAL_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 v=normalize(vP-uCam); vec3 r=reflect(v,n);
  float br;
  if(vA<.5) br=texture2D(uNoise,vec2(vP.z*.04,(vP.y+vP.x)*2.3)).b;
  else if(vA<1.5){ float ang=atan(vP.y-WC.y,vP.x); float rad=length(vP.xy-WC.xy); br=texture2D(uNoise,vec2(ang*.7,rad*3.)).b; }
  else br=texture2D(uNoise,vec2(vP.x*.04,(vP.y+vP.z)*2.3)).b;
  vec3 env=vec3(.004,.007,.01)+vec3(.01,.03,.05)*max(-r.y,0.);
  vec3 dw=normalize(WC-vP); float wv=dot(r,dw);
  env+=vec3(.05,.33,.6)*(pow(max(wv,0.),5.)*.9+smoothstep(.9,.985,wv)*2.2)*inHall(vP);
  env+=vec3(.12,.46,.66)*pow(max(r.x,0.),2.)*1.5*(1.-inHall(vP))*smoothstep(.85,.2,abs(r.y));
  if(r.y>.02){ float top=vP.x>13.2?3.4:(vP.z>15.?5.:12.); vec3 h=vP+r*((top-vP.y)/r.y);
    vec2 gq=vP.x>13.2?vec2(h.x-16.,mod(h.z,3.5)-1.75):vec2(mod(h.x,4.)-2.,mod(h.z-15.,3.34)-1.67);
    env+=vec3(1.,.9,.75)*smoothstep(.22,.05,length(gq))*2.5*(vP.x>13.2||vP.z>15.?1.:0.); }
  float wd=length(vP.xy-WC.xy)-WR;
  if(vA>.5&&vA<1.5){ float ang=atan(vP.y-WC.y,vP.x); vec3 tg=vec3(-sin(ang),cos(ang),0.); vec2 vv=normalize(v.xy+1e-4);
    float an=pow(abs(dot(tg.xy,vv)),14.); env+=vec3(.10,.42,.62)*an*.55*exp(-max(wd,0.)*.6)+vec3(.04,.22,.38)*exp(-max(wd,0.)*2.2)*.9; }
  if(vA>.5&&vA<1.5){ // まどの 輪：くらい みがいた 青銅。ホールの 上の スポット・まどの ふちの 光が するどく うつる
    vec3 s1=normalize(vec3(-4.,12.,-19.)-vP), s2=normalize(vec3(4.,12.,-19.)-vP), s3=normalize(vec3(0.,12.,-14.)-vP);
    env+=vec3(1.,.86,.66)*(pow(max(dot(r,s1),0.),90.)+pow(max(dot(r,s2),0.),90.)+pow(max(dot(r,s3),0.),60.)*.7)*6.;
    env+=vec3(.25,.85,1.)*exp(-max(wd,0.)*5.)*smoothstep(.2,.9,dot(n,normalize(vec3(WC.xy-vP.xy,.6))))*1.4;
    env+=vec3(.6,.45,.3)*pow(max(r.y,0.),3.)*.06;
  }
  float fr=.55+.45*pow(1.-abs(dot(n,v)),3.);
  vec3 c=vC*(roomLight(vP,n)*.35+env*fr*(.55+.9*br));
  c+=haze(vP);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// 水そうの 中の かべ・砂・水面（vA＝水そう 0 まど 1 ペンギン 2 クラゲ、vB＝ばしょ）。
const TANK_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ if(vB>3.5&&vB<4.5&&gl_FrontFacing) discard; vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 p=vP; vec3 c;
  if(vB<.5){ // 砂
    float wv=texture2D(uNoise,p.xz*.045).g; float ph=dot(p.xz,vec2(.55,2.6))+wv*9.+texture2D(uNoise,p.xz*.2).r*2.;
    float rp=.5+.5*sin(ph); float rs=cos(ph); float g=texture2D(uNoise,p.xz*.5).r, gg=texture2D(uNoise,p.xz*2.3).r;
    vec3 alb=vC*(.62+.4*g)*(.82+.3*rp)*(.9+.2*gg);
    alb=mix(alb,vec3(.35,.33,.28),smoothstep(.72,.8,texture2D(uNoise,p.xz*.9+.3).r)*.5);
    c=waterShade(alb,p,normalize(n+vec3(.04,0.,.2)*rs*(.6+wv)),vA,vec3(0.));
  } else if(vB<1.5){ // 水そうの かべ（岩はだ）
    float g=texture2D(uNoise,p.xy*.21+p.z*.1).g;
    c=waterShade(vC*(.6+.8*g),p,n,vA,vec3(0.));
  } else if(vB<2.5){ // 水面を 下から
    vec3 v=normalize(p-uCam);
    vec2 g=(texture2D(uNoise,p.xz*.07+vec2(uTime*.02,uTime*.013)).rg-.5)+(texture2D(uNoise,p.xz*.11-vec2(uTime*.017,-uTime*.021)).rg-.5);
    vec3 sn=normalize(vec3(g.x*.9,-1.,g.y*.9));
    float ci=abs(dot(v,sn));
    float win=smoothstep(.62,.72,ci);
    float cz=caus(p.xz*1.3);
    vec3 sky=vec3(.55,.86,1.)*(1.1+1.2*cz);
    vec3 tir=fogCol(p-vec3(0.,6.,0.),vA)*1.4+vec3(.3,.6,.7)*pow(cz,2.)*.9+vec3(.15,.35,.45)*smoothstep(.2,.45,ci)*.4;
    vec3 cc=mix(tir,sky,win);
    float dw=waterLen(p,vA); c=mix(cc,fogCol(p,vA),1.-exp(-dw*fogK(vA)*.85));
  } else if(vB<3.5){ // ペンギンの 水そう・水より 上の 氷の かべ
    float g=texture2D(uNoise,p.zy*.25).g, r=texture2D(uNoise,p.zy*.9).r;
    vec3 alb=vC*(.75+.35*g)*(.9+.2*r);
    c=alb*mix(vec3(.32,.46,.58),vec3(.70,.80,.90),clamp((p.y-WLV)/1.6,0.,1.));
  } else if(vB<4.5){ // クラゲの 柱の 中
    float h=clamp((p.y-${J.y0.toFixed(2)})/3.3,0.,1.); vec3 v=normalize(p-uCam);
    c=mix(vec3(.004,.02,.08),vec3(.04,.18,.48),h*h)*(1.+.4*caus(vec2(atan(p.x-${J.x.toFixed(2)},p.z-${J.z.toFixed(2)})*1.2,p.y)*1.2));
  } else { // 水より 上の 天井（空の 光）
    vec2 lq=vec2(p.x-24.5,mod(p.z,4.)-2.); float pan=smoothstep(.9,.8,abs(lq.x)/3.2)*smoothstep(1.9,1.6,abs(lq.y));
    c=vC*mix(vec3(.30,.38,.45),vec3(1.25,1.32,1.40),pan)*(.85+.3*texture2D(uNoise,p.xz*.2).g);
  }
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// 岩・さんご・いせき・海そう（vA＝水そう、vB＝ゆれ）。
const PROP_VERT = `${COMMON} attribute float aA; attribute float aB; varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 p=position; float kd=floor((aA-floor(aA+.05))*10.+.5); float s=aB*aB*(kd>1.5&&kd<2.5?.06:kd>.5?0.:1.); p.x+=sin(uTime*.9+p.y*.7+p.z*.5)*.22*s; p.z+=cos(uTime*.7+p.y*.6+p.x*.4)*.14*s;
  vP=p; vN=normal; vC=color; vA=aA; vB=aB; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
// vA＝水そう＋しゅるい/10（0 岩 1 のうさんご 2 えだ 3 テーブル 4 雪の 岩 5 いそぎんちゃくの 台）
const PROP_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 a=abs(n);
  float tank=floor(vA+.05); float kind=floor((vA-tank)*10.+.5);
  vec2 uv=a.y>.6?vP.xz:(a.x>a.z?vP.zy:vP.xy);
  float g=texture2D(uNoise,uv*.6).r, b=texture2D(uNoise,uv*.12).g;
  vec3 alb=vC*(.6+.7*g)*(.75+.5*b);
  vec3 extra=vec3(0.);
  if(kind<.5){ float moss=smoothstep(.55,.95,n.y)*smoothstep(.45,.7,b)*(tank<.5?1.:0.)*(1.-step(.01,vB)); alb=mix(alb,vec3(.16,.24,.12),moss*.55);
    alb=mix(alb,vec3(.55,.30,.40),smoothstep(.62,.7,texture2D(uNoise,uv*.9+.5).r)*.35*(tank<.5?1.:0.)); }
  else if(kind<1.5){ float gr=texture2D(uNoise,uv*1.6).a; alb=vC*(.55+.75*smoothstep(.15,.6,gr)); n=normalize(n+vec3(gr-.5)*.35); }
  else if(kind<2.5){ float tip=smoothstep(.2,1.,vB); float pol=texture2D(uNoise,uv*7.).r; alb=mix(vC*(.8+.4*pol),vec3(.85,.80,.70),tip*.55); extra=vC*.10*tip; }
  else if(kind<3.5){ float rg=texture2D(uNoise,uv*2.2).a; alb=vC*(.7+.5*smoothstep(.1,.5,rg)); alb=mix(alb,vC*1.3+.08,smoothstep(.55,.9,n.y)*.25); }
  else if(kind<4.5){ // 雪を かぶった 岩・氷
    float nn=texture2D(uNoise,vP.xz*.35+vP.y*.2).g, fine=texture2D(uNoise,uv*1.7).r;
    float snow=smoothstep(.38,.72,n.y+(nn-.5)*.55+(fine-.5)*.2)*smoothstep(WLV-.05,WLV+.25,vP.y);
    float crev=smoothstep(.3,.75,texture2D(uNoise,uv*.33+.2).a)*.5*(.4+.6*nn);
    vec3 rk=mix(vec3(.10,.115,.13),vec3(.30,.33,.36),fine)*(.7+.5*nn)*(1.-.45*crev);
    vec3 ice=mix(vec3(.45,.62,.72),vec3(.72,.86,.92),fine);
    float above=smoothstep(WLV-.1,WLV+.1,vP.y);
    alb=mix(mix(rk,ice,smoothstep(.6,.85,nn)*(.15+.5*above)),vec3(.93,.96,.99),snow);
    alb*=.85+.3*texture2D(uNoise,vec2(uv.x*.15,vP.y*1.7)).r;
    n=normalize(n+(vec3(fine,nn,g)-.5)*.5);
  }
  vec3 c=waterShade(alb,vP,n,tank,extra);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// うすい 板の 海の 生きもの（ゆれる・すける）：ウミウチワ・海そう・ウミエラ・いそぎんちゃく。uv.y＝根もと 0 → 先 1、vB＝しゅるい。
const CARD_VERT = `${COMMON} attribute float aA; attribute float aB; varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB; varying vec2 vUv;
void main(){ vec3 p=position; float w=uv.y; float k=aB<.5?.05:aB<1.5?.42:aB<2.5?.10:.06;
  float ph=p.x*.7+p.z*.5;
  p.x+=sin(uTime*.9+p.y*.6+ph)*k*w*w; p.z+=cos(uTime*.7+p.y*.5+ph*1.3)*k*.7*w*w;
  if(aB>2.5){ vec2 d=p.xz-position.xz; p.xz+=normalize(normal.xz+1e-4)*sin(uTime*1.3+ph*4.)*.03*w; }
  vP=p; vN=normal; vC=color; vA=aA; vB=aB; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const CARD_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB; varying vec2 vUv;
void main(){ vec2 u=vUv; float m; vec3 alb=vC; float tr=.25;
  if(vB<.5){ vec2 q=(u-vec2(.5,0.))*vec2(2.,1.05); float d=length(q); float ins=smoothstep(1.,.96,d+texture2D(uNoise,u*1.3).g*.12);
    float ang=atan(q.x,q.y); float vein=smoothstep(.07,.0,abs(fract(ang*2.6+d*.4)-.5))*smoothstep(.15,.4,d);
    float net=max(smoothstep(.22,.42,texture2D(uNoise,u*vec2(2.3,2.)).a),smoothstep(.3,.5,texture2D(uNoise,u*vec2(4.6,4.)+.37).a)); float stem=smoothstep(.04,.0,abs(q.x))*step(d,.45);
    m=ins*max(max(net,vein),stem); alb=vC*(.8+.4*net);
  } else if(vB<1.5){ float wd=(.32+.12*sin(u.y*11.+vC.r*9.))*(1.-u.y*.55); float x=abs(u.x-.5);
    m=smoothstep(wd,wd-.04,x)*smoothstep(.0,.03,u.y)*smoothstep(1.,.96,u.y);
    alb=mix(vC,vC*.55,smoothstep(.04,.0,x))*(.85+.3*texture2D(uNoise,u*vec2(2.,6.)).r); tr=.6;
  } else if(vB<2.5){ float x=abs(u.x-.5); float sideB=smoothstep(.09,.0,abs(fract(u.y*16.-x*2.2)-.5)-.18)*step(x,.42*(1.-u.y*.7))*step(.12,u.y);
    m=max(sideB,smoothstep(.035,.0,x)); alb=mix(vC,vec3(1.,.95,.85),smoothstep(.25,.42,x)*.5); tr=.45;
  } else { float st=abs(fract(u.x*26.)-.5); float wd=.36*(1.-u.y*.55);
    m=smoothstep(wd,wd-.08,st)*step(u.y,.985-texture2D(uNoise,vec2(u.x*3.,0.)).r*.12);
    alb=mix(vC,vC*1.6+vec3(.15,.12,.1),smoothstep(.75,1.,u.y)); tr=.55;
  }
  if(m<.5) discard;
  vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.);
  float tank=floor(vA+.05);
  vec3 c=waterShade(alb,vP,n,tank,alb*vec3(.3,.6,.8)*tr*.35);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// 魚・エイ・カメ・サメ：道は 円＋sin（aPath＝中心・よこの 半径、aPar＝はやさ・位相・上下・しゅるい、aShape＝おくの 半径・長さ・高さ・はば、
// aX＝むれの 位相・むれの ふくらみ・ゆらぎ）。むれの 魚は 同じ はやさ・近い 位相で うごくので いっしょに まがる。
// しゅるい：0 イワシ 1 キイロハギ 2 ナンヨウハギ 3 ツノダシ 4 アジ 5 チョウチョウウオ 6 クマノミ 7 ハタ 8 タテジマキンチャクダイ 9 タカサゴ（10 エイ 11 カメ 13 サメ）
const FISH_VERT = `${COMMON} attribute vec4 aPath; attribute vec4 aPar; attribute vec4 aShape; attribute vec3 aBody; attribute vec4 aX;
varying vec3 vP; varying vec3 vN; varying vec3 vB; varying float vSp; varying float vPart;
vec4 spec(float s){ // 円ばん・せびれ・しりびれ・尾の まるさ
  if(s<.5) return vec4(0.,0.,0.,0.); if(s<1.5) return vec4(.95,.5,.5,.6); if(s<2.5) return vec4(.45,.2,.2,.2); if(s<3.5) return vec4(1.1,2.4,.9,.3);
  if(s<4.5) return vec4(.15,.1,0.,0.); if(s<5.5) return vec4(.9,.35,.35,.7); if(s<6.5) return vec4(.3,.15,.1,1.); if(s<7.5) return vec4(.25,.12,.1,1.);
  if(s<8.5) return vec4(.8,.7,.6,.6); return vec4(.1,0.,0.,0.); }
void main(){
  float G=aX.x; float sp=aPar.w;
  float th=uTime*aPar.x+aPar.y;
  vec3 C=aPath.xyz+vec3(sin(uTime*.05+G)*aX.z,sin(uTime*.083+G*1.7)*aX.z*.4,cos(uTime*.061+G)*aX.z*.5);
  float Rr=aPath.w*(1.+aX.y*sin(uTime*.21+G)); float Rz=aShape.x*(1.+aX.y*sin(uTime*.21+G));
  vec3 P=C+vec3(Rr*cos(th),aPar.z*sin(th*2.+G),Rz*sin(th));
  vec3 T=normalize(vec3(-Rr*sin(th),aPar.z*2.*cos(th*2.+G),Rz*cos(th))*sign(aPar.x));
  vec3 X=normalize(cross(vec3(0.,1.,0.),T)); vec3 Y=cross(T,X);
  vec3 q=position; vec3 nn=normal;
  float w=aBody.x;
  if(sp<9.5){ vec4 S=spec(sp); float ft=aBody.z;
    float hs=1.+S.x*max(0.,1.-pow((q.z-.02)/.44,2.)); q.y*=hs; nn.y/=hs;
    if(ft>1.5&&ft<2.5){ float e=max(q.y-.12*hs,0.); q.y+=e*S.y*1.6; q.z-=e*S.y*1.1; }
    if(ft>2.5&&ft<3.5){ float e=max(-.1*hs-q.y,0.); q.y-=e*S.z*1.5; q.z-=e*S.z*1.0; }
    if(ft>.5&&ft<1.5){ q.z+=S.w*(abs(q.y)>.12?.09:-.03*smoothstep(.07,0.,abs(q.y))); }
    if(ft>3.5){ float sd=ft<4.5?1.:-1.; vec3 piv=vec3(sd*.05,-.03,.15); vec3 d=q-piv; float a=(.5+.4*sin(uTime*7.+aPar.y*5.))*sd; float c=cos(a),s=sin(a); q=piv+vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c); }
  }
  if(sp<9.5||sp>12.5){ // 魚・サメ：尾を ふる
    float f=sp>12.5?2.6:(sp<.5||sp>8.5?9.:6.)+abs(aPar.x)*6.;
    float sw=sin(uTime*f+aPar.y*7.-q.z*5.)*(sp>12.5?.16:.22)*w*w;
    q.x+=sw; nn.x-=sw*2.;
  } else if(sp<10.5){ // エイ：つばさで はばたく
    float ax=abs(q.x); float fl=sin(uTime*1.5+aPar.y*5.-ax*1.6)*.42*ax*ax;
    q.y+=fl; nn.x-=sign(q.x)*fl*1.2;
    q.y+=sin(uTime*1.6+aPar.y-q.z*3.)*.06*w;
  } else { // カメ：ヒレを こぐ
    if(aBody.y>.5){ float side=sign(q.x); float a=sin(uTime*1.4+aPar.y+aBody.z)*.7;
      vec3 piv=vec3(side*.26,0.,aBody.z>.5?.3:-.32); vec3 d=q-piv; float c=cos(a*side),s=sin(a*side);
      q=piv+vec3(d.x*c-d.y*s,d.x*s+d.y*c,d.z); }
  }
  vec3 sc=vec3(aShape.w,aShape.z,1.)*aShape.y;
  vec3 lq=q*sc;
  float bank=clamp(aPar.x*Rr*.15,-.5,.5);
  vec3 Xb=X*cos(bank)+Y*sin(bank), Yb=Y*cos(bank)-X*sin(bank);
  vec3 p=P+Xb*lq.x+Yb*lq.y+T*lq.z;
  vec3 ln=normalize(nn/sc); vN=normalize(Xb*ln.x+Yb*ln.y+T*ln.z);
  vP=p; vB=vec3(position.xy,position.z); vB.y=position.y; vSp=sp; vPart=aBody.y+aBody.z*.01;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const FISH_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vB; varying float vSp; varying float vPart;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 b=vB; float sp=vSp; float fin=step(.5,vPart)*step(vPart,9.5)*step(sp,9.5);
  float top=smoothstep(-.02,.06,b.y); vec3 alb; float silver=0.;
  float nz=texture2D(uNoise,b.zy*2.+sp).r;
  if(sp<.5){ alb=mix(vec3(.70,.74,.78),vec3(.06,.20,.28),top); silver=1.; alb=mix(alb,vec3(.03,.05,.07),smoothstep(.012,.0,abs(b.y-.03))*.5); alb=mix(alb,vec3(.02),smoothstep(.02,.0,length(vec2(b.z-.12,b.y-.04)))); }
  else if(sp<1.5){ alb=vec3(1.,.80,.04)*(.85+.2*nz); alb=mix(alb,vec3(.98,.98,.95),smoothstep(.02,.0,abs(b.z+.36)-.015)*step(abs(b.y),.05)); }
  else if(sp<2.5){ alb=vec3(.05,.25,.85); float st=smoothstep(.03,.0,abs(b.y-.03+b.z*.18)-.03)*step(-.3,b.z)*step(b.z,.32); alb=mix(alb,vec3(.01,.01,.03),st); alb=mix(alb,vec3(1.,.82,.05),smoothstep(-.38,-.45,b.z)); }
  else if(sp<3.5){ alb=mix(vec3(.96,.95,.9),vec3(1.,.88,.25),smoothstep(-.05,-.35,b.z)); float bar=smoothstep(.015,.0,abs(b.z-.20)-.07)+smoothstep(.015,.0,abs(b.z+.13)-.08); alb=mix(alb,vec3(.02,.02,.03),clamp(bar,0.,1.)); alb=mix(alb,vec3(1.,.55,.1),smoothstep(.03,.0,length(vec2(b.z-.44,b.y-.01)))); }
  else if(sp<4.5){ alb=mix(vec3(.80,.82,.82),vec3(.20,.27,.32),top); silver=1.; alb=mix(alb,vec3(.75,.65,.25),fin*.6); }
  else if(sp<5.5){ alb=mix(vec3(.97,.96,.92),vec3(1.,.85,.12),smoothstep(.05,-.3,b.z)); float eb=smoothstep(.025,.0,abs(b.z-.33)-.02); alb=mix(alb,vec3(.03),eb); alb=mix(alb,vec3(.05),smoothstep(.02,.0,length(vec2(b.z+.2,b.y-.06))-.03)); }
  else if(sp<6.5){ alb=vec3(1.,.42,.04); float bz=min(min(abs(b.z-.26),abs(b.z-.0)),abs(b.z+.3)); float wb=smoothstep(.045,.035,bz); float bk=smoothstep(.06,.045,bz)-wb; alb=mix(alb,vec3(.98),wb); alb=mix(alb,vec3(.02),bk*.9); alb=mix(alb,vec3(.02),fin*smoothstep(.0,-.04,-abs(b.y)+.17)*.0); }
  else if(sp<7.5){ alb=mix(vec3(.55,.22,.14),vec3(.35,.17,.12),nz); float sp2=smoothstep(.7,.75,texture2D(uNoise,b.zy*6.).r); alb=mix(alb,vec3(.3,.6,.95),sp2*.8); alb=mix(vec3(.75,.6,.5),alb,top*.7+.3); }
  else if(sp<8.5){ float st=smoothstep(.3,.5,abs(fract((b.y+b.z*.5)*28.)-.5)*2.); alb=mix(vec3(.05,.15,.65),vec3(1.,.85,.15),st); alb=mix(alb,vec3(1.,.8,.1),smoothstep(-.38,-.45,b.z)); alb=mix(alb,vec3(.02,.04,.12),smoothstep(.03,.0,abs(b.z-.33)-.025)); }
  else if(sp<9.5){ alb=mix(vec3(.85,.88,.9),vec3(.10,.30,.70),top); alb=mix(alb,vec3(1.,.85,.1),smoothstep(.015,.0,abs(b.y-.04)-.012)+smoothstep(-.38,-.45,b.z)); silver=.6; }
  else if(sp<10.5){ alb=mix(vec3(.85,.85,.82),vec3(.10,.10,.11)*(.8+.4*nz),smoothstep(-.01,.03,n.y*.5+b.y*8.)); float spot=smoothstep(.72,.8,texture2D(uNoise,b.xz*1.3).r); alb=mix(alb,vec3(.8,.8,.78),spot*top*.7); }
  else if(sp<11.5){ if(vPart>.5) alb=vec3(.36,.34,.22)*(.8+.4*nz); else { float sc=texture2D(uNoise,b.xz*2.2).a; alb=mix(vec3(.30,.24,.12),vec3(.45,.38,.18),nz)*(.7+.6*sc); alb=mix(vec3(.75,.68,.45),alb,top); } }
  else { alb=mix(vec3(.86,.86,.84),vec3(.30,.34,.38)*(.9+.2*nz),top); }
  if(sp<9.5){ alb=mix(alb,alb*.75+vec3(.05,.08,.1),fin*.35); float e=length(vec2(b.z-.36,b.y-.035)); alb=mix(alb,vec3(.85,.8,.6),smoothstep(.036,.03,e)); alb=mix(alb,vec3(.01),smoothstep(.026,.02,e)); }
  vec3 v=normalize(uCam-vP); vec3 r=reflect(-v,n);
  float depth=max(14.-vP.y,0.);
  vec3 spec=vec3(.5,.8,1.)*(pow(max(r.y,0.),6.)*.55+pow(max(dot(n,v),0.),3.)*.12)*(silver+.18)*exp(-depth*.05);
  vec3 c=waterShade(alb,vP,n,0.,spec);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// ペンギン：およぐ（道）か 立つ（岩の 上）。aPath＝中心・よこの 半径（立つ ときは 向き）、aPar＝はやさ・位相・上下・立つ(1)、aShape＝おくの 半径・大きさ。
const PENG_VERT = `${COMMON} attribute vec4 aPath; attribute vec4 aPar; attribute vec4 aShape; attribute vec3 aBody;
varying vec3 vP; varying vec3 vN; varying vec3 vB; varying float vPart; varying float vStand;
vec3 rz(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c-v.y*s,v.x*s+v.y*c,v.z);}
vec3 ry(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c+v.z*s,v.y,-v.x*s+v.z*c);}
void main(){
  float stand=aPar.w; float ph=aPar.y;
  vec3 q=position; vec3 nn=normal; float part=aBody.y;
  if(part>1.5&&part<2.5){ // つばさ
    float side=aBody.z; vec3 piv=vec3(side*.105,.02,.11);
    float spread=stand>.5?.18+.12*sin(uTime*.8+ph):1.05;
    float flap=stand>.5?sin(uTime*.6+ph*3.)*.12*step(.85,sin(uTime*.37+ph)):sin(uTime*9.+ph)*.85;
    vec3 d=q-piv; d=ry(d,spread*side); d=rz(d,flap*side); q=piv+d; nn=rz(ry(nn,spread*side),flap*side);
  }
  if(stand>.5&&q.z>.15){ float a=sin(uTime*.45+ph*2.)*.9*smoothstep(.15,.22,q.z); q=rz(q,a); nn=rz(nn,a); }
  q*=aShape.y; vec3 p; vec3 n;
  if(stand>.5){
    vec3 u=vec3(q.x,q.z,-q.y)+vec3(0.,.455*aShape.y,0.); vec3 un=vec3(nn.x,nn.z,-nn.y);
    float sway=sin(uTime*1.1+ph)*.04; u=vec3(u.x*cos(sway)-u.y*sin(sway),u.x*sin(sway)+u.y*cos(sway),u.z);
    p=aPath.xyz+ry(u,aPath.w); n=ry(un,aPath.w);
  } else {
    float th=uTime*aPar.x+ph;
    vec3 P=aPath.xyz+vec3(aPath.w*cos(th),aPar.z*sin(th*2.3+ph*3.),aShape.x*sin(th));
    vec3 T=normalize(vec3(-aPath.w*sin(th),aPar.z*2.3*cos(th*2.3+ph*3.),aShape.x*cos(th))*sign(aPar.x));
    vec3 X=normalize(cross(vec3(0.,1.,0.),T)); vec3 Y=cross(T,X);
    float roll=sin(uTime*1.3+ph)*.35; vec3 Xb=X*cos(roll)+Y*sin(roll), Yb=Y*cos(roll)-X*sin(roll);
    p=P+Xb*q.x+Yb*q.y+T*q.z; n=Xb*nn.x+Yb*nn.y+T*nn.z;
  }
  vP=p; vN=n; vB=position; vPart=part; vStand=stand;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const PENG_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vB; varying float vPart; varying float vStand;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 b=vB; vec3 alb;
  if(vPart<.5){
    float belly=smoothstep(.015,-.025,b.y+.01*sin(b.z*9.)-.02*smoothstep(.05,-.25,b.z))*smoothstep(.215,.18,b.z);
    alb=mix(vec3(.03,.034,.042),vec3(.90,.91,.90),belly);
    alb=mix(alb,vec3(.10,.11,.13),smoothstep(.3,.7,abs(b.x)/.14)*(1.-belly)*.5);
    float ep=smoothstep(.024,.014,length(vec2((b.z-.29)*.8,abs(b.x)-.055)))*step(.02,b.y)+smoothstep(.012,.0,abs(length(vec2(b.z-.29,b.x))-.055))*step(.06,b.y)*.8;
    ep=clamp(ep,0.,1.);
    alb=mix(alb,vec3(.9),ep);
    float eye=smoothstep(.012,.008,length(vec3(abs(b.x)-.072,b.y-.035,b.z-.29)));
    alb=mix(alb,vec3(.01),eye);
  } else if(vPart<1.5) alb=mix(vec3(.98,.30,.05),vec3(.05),smoothstep(.43,.45,b.z));
  else if(vPart<2.5) alb=mix(vec3(.03,.03,.04),vec3(.8),smoothstep(.0,-.02,b.y)*.6);
  else alb=vec3(.98,.50,.32);
  vec3 v=normalize(uCam-vP); vec3 r=reflect(-v,n);
  float wet=vStand>.5?.35:1.;
  vec3 spec=vec3(.5,.8,1.)*pow(max(r.y,0.),10.)*.5*wet+vec3(.2,.4,.5)*pow(1.-max(dot(n,v),0.),3.)*.25;
  vec3 c=waterShade(alb,vP,n,1.,spec);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// ペンギンの あわの すじ（Points）。aT＝おくれ・ゆらぎの 位相・大きさ・よこの ずれ。
const TRAIL_VERT = `${COMMON} uniform float uH; attribute vec4 aPath; attribute vec4 aPar; attribute vec4 aShape; attribute vec4 aT; varying float vA; varying float vK;
void main(){ float lag=aT.x; float ph=aPar.y; float th=(uTime-lag)*aPar.x+ph;
  vec3 P=aPath.xyz+vec3(aPath.w*cos(th),aPar.z*sin(th*2.3+ph*3.),aShape.x*sin(th));
  P+=vec3(sin(uTime*3.+aT.y)*.03*lag+aT.w*lag,lag*(.42+lag*.12),cos(uTime*2.3+aT.y)*.03*lag);
  vec4 mv=modelViewMatrix*vec4(P,1.);
  float dw=waterLen(P,1.);
  vA=exp(-dw*.09)*(1.-lag/1.8)*step(P.y,WLV-.02)*1.2; vK=1.;
  gl_PointSize=clamp(aT.z*(.6+lag*.5)*projectionMatrix[1][1]*uH*.5/max(-mv.z,.1),1.,24.);
  gl_Position=projectionMatrix*mv; }`;

// クラゲ（加算・ふわふわ）。
const JELLY_VERT = `${COMMON} attribute vec4 aJ; attribute vec4 iJ;
varying vec3 vP; varying vec3 vN; varying float vT; varying float vK; varying vec3 vL;
void main(){
  vec3 q=position; float ph=iJ.w;
  float pulse=sin(uTime*2.1+ph); float k=aJ.x, a=aJ.y;
  if(k<.5){ float rim=1.-clamp(q.y/.18,0.,1.); float sq=.17*pulse*rim; q.xz*=1.+sq; q.y*=1.-.12*pulse; }
  else { float wave=sin(uTime*2.1+ph-a*4.2); float amp=(k<1.5?.10:.05)*a;
    q.xz*=1.+.17*pulse*(1.-a)*.8;
    q.x+=wave*amp+sin(uTime*.6+ph+a*2.)*.08*a*a; q.z+=cos(uTime*1.7+ph*1.3-a*3.3)*amp+cos(uTime*.5+ph)*.06*a*a;
    q.y+=a*.08*(pulse+1.)*.5;
    if(k>1.5){ float tw=a*5.+aJ.z; q.x+=sin(tw+uTime)*.025; } }
  vL=position; q*=iJ.z;
  vec3 c=vec3(${J.x.toFixed(2)},0.,${J.z.toFixed(2)})+vec3(iJ.x,0.,iJ.y);
  c.y=1.3+mod(ph*.9+uTime*.05,2.1)+sin(uTime*2.1+ph-.9)*.025+sin(uTime*.4+ph)*.08;
  vec3 p=c+q; vP=p; vN=normal; vT=a; vK=k;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const JELLY_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying float vT; varying float vK; varying vec3 vL;
void main(){ vec3 n=normalize(vN); vec3 v=normalize(uCam-vP); float f=pow(1.-abs(dot(n,v)),2.2);
  vec3 c;
  if(vK<.5){ float r=length(vL.xz); float an=atan(vL.z,vL.x); float a4=mod(an+.785,1.571)-.785; vec2 pq=vec2(cos(a4),sin(a4))*r;
    float gon=smoothstep(.014,.0,abs(length(pq-vec2(.085,0.))-.032))*step(.1,vL.y+.12);
    float rimL=smoothstep(.02,.0,vL.y-.005)*smoothstep(-.01,.01,vL.y+.0);
    float body=.025+.03*texture2D(uNoise,vL.xz*6.).r;
    c=vec3(.5,.68,1.)*(body+.5*f*f)+vec3(.95,.5,.85)*gon*.4+vec3(.6,.85,1.)*rimL*.45;
  } else if(vK<1.5) c=vec3(.6,.75,1.)*.16*(1.-vT*.8);
  else c=vec3(.95,.8,1.)*(.05+.14*f)*(1.-vT*.6);
  float top=smoothstep(${J.y1.toFixed(2)},${(J.y1 - 0.25).toFixed(2)},vP.y)*smoothstep(${J.y0.toFixed(2)},${(J.y0 + 0.2).toFixed(2)},vP.y);
  gl_FragColor=vec4(c*top,1.);
  ${OUT} }`;

// ただよう 粒・あわ（Points・加算）。aP＝水そう・はやさ・大きさ・位相。
const DOTS_VERT = `${COMMON} uniform float uH; attribute vec4 aP; varying float vA; varying float vK;
void main(){ vec3 p=position; float tank=aP.x;
  if(tank<.5){ p.y=-.5+mod(p.y-uTime*aP.y,14.4); p.x+=sin(uTime*.21+aP.w)*.35; p.z+=cos(uTime*.17+aP.w*1.3)*.3; }
  else if(tank<1.5){ p.y=-.35+mod(p.y+uTime*aP.y,2.55); p.x+=sin(uTime*3.+aP.w)*.025; }
  else { p.y=${(J.y0 + 0.05).toFixed(2)}+mod(p.y+uTime*aP.y,3.2); p.x+=sin(uTime*2.+aP.w)*.02; }
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float dw=waterLen(p,min(tank,1.));
  vA=exp(-dw*(tank<.5?.075:.09))*(tank>1.5?.7:1.);
  vK=tank;
  gl_PointSize=clamp(aP.z*projectionMatrix[1][1]*uH*.5/max(-mv.z,.1),1.,28.);
  gl_Position=projectionMatrix*mv; }`;
const DOTS_FRAG = `varying float vA; varying float vK;
void main(){ vec2 d=gl_PointCoord-.5; float r=length(d); vec3 c;
  if(vK<.5){ c=vec3(.35,.55,.62)*smoothstep(.5,.0,r)*.55; }
  else { float ring=smoothstep(.5,.38,r)*(.25+.75*smoothstep(.2,.42,r)); float hl=smoothstep(.14,.0,length(d-vec2(-.14,-.14))); c=vec3(.6,.85,1.)*(ring*.55+hl*.9); }
  gl_FragColor=vec4(c*vA,1.);
  ${OUT} }`;

// 光の すじ（加算の 板）。aA＝水そう、aB＝番号。uv.y＝1 が 水面。
const RAYS_VERT = `${COMMON} attribute float aA; attribute float aB; varying vec2 vUv; varying vec3 vP; varying float vA; varying float vB;
void main(){ vUv=uv; vP=position; vA=aA; vB=aB; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const RAYS_FRAG = `${COMMON} varying vec2 vUv; varying vec3 vP; varying float vA; varying float vB;
void main(){ float x=vUv.x; float edge=pow(sin(x*3.14159),2.);
  float n=texture2D(uNoise,vec2(x*.6+vB*.13,vUv.y*.12-uTime*.012)).g;
  float fl=.55+.45*sin(uTime*(.35+fract(vB*.37)*.4)+vB*2.1);
  float fade=pow(vUv.y,1.4)*smoothstep(0.,.12,vUv.y);
  float dw=waterLen(vP,vA);
  vec3 c=(vA<.5?vec3(.18,.48,.62):vec3(.22,.5,.62))*edge*fade*fl*(.35+1.2*n*n)*exp(-dw*.035)*(vA<.5?.62:.3);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// アクリル・ガラス：フレネルで 部屋が うっすら うつる（天井の スポットの 光・よごれ）。aA＝0 まど 1 ペンギン 2 クラゲ 3 手すり・ドア。
const GLASS_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB;
void main(){ vec3 v=normalize(vP-uCam); vec3 n=normalize(vN); if(dot(n,v)>0.)n=-n;
  float ci=abs(dot(n,v)); float fr=.04+.96*pow(1.-ci,5.);
  vec3 r=reflect(v,n);
  vec3 refl=vec3(.003,.007,.011)+vec3(.015,.05,.08)*(.3+.7*max(-r.y,0.))*(vA<1.5?1.:.4);
  if(r.y>.02){ float top=vP.x>13.2?3.4:(vP.z>15.?5.:12.); vec3 h=vP+r*((top-vP.y)/r.y);
    vec2 gq=vP.x>13.2?vec2(h.x-16.,mod(h.z,3.5)-1.75):vec2(mod(h.x,4.)-2.,mod(h.z-15.,3.34)-1.67);
    refl+=vec3(1.,.9,.75)*smoothstep(.2,.05,length(gq))*1.6*(vP.x>13.2||vP.z>15.?1.:0.); }
  if(vA>2.5){ vec3 dw=normalize(WC-vP); refl+=vec3(.05,.33,.6)*pow(max(dot(r,dw),0.),12.)*1.2*inHall(vP); }
  vec3 band=vec3(0.);
  if(vA>.5&&vA<1.5){ // 水面の ゆれる 帯（ガラスの 内がわ）
    float wy=WLV+.035*sin(vP.z*2.7+uTime*1.6)+.02*sin(vP.z*6.1-uTime*2.2)+.012*sin(vP.z*13.-uTime*3.1);
    float dy=vP.y-wy; band=vec3(.55,.85,1.)*(smoothstep(.016,.0,abs(dy))*.6+smoothstep(.0,-.12,dy)*smoothstep(-.22,-.05,dy)*.25)+vec3(.30,.45,.55)*smoothstep(.0,.03,dy)*smoothstep(.12,.02,dy)*.5; }
  float sm=texture2D(uNoise,(vP.xy+vP.zz)*.17).g; float sc=texture2D(uNoise,(vP.zy+vP.xx)*.9).b;
  float a=clamp(fr*(.75+.6*sm)+(vA<2.5?.05:.035)+smoothstep(.62,.8,sc)*.025,0.,1.);
  vec3 c=refl*a+(vA<1.5?haze(vP):vec3(0.))+vC*a+band;
  gl_FragColor=vec4(c,a);
  ${OUT} }`;

// 人：part＝0 はだ 1 上 2 下 3 かみ 4 くつ 5 ながい かみ。aArm＝1 右うで 2 左うで、aHead＝あたま。
// iPose＝右うでの 角度・あたまの 大きさ・ゆれの 位相・かみの 形、iPose2＝左うでの 角度・うでを ひらく・あたまの 上むき・せなかの まがり。
const PEOPLE_VERT = `${COMMON} attribute float part; attribute float aArm; attribute float aHead; attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iBot; attribute vec3 iHair; attribute vec4 iPose; attribute vec4 iPose2;
varying vec3 vP; varying vec3 vN; varying vec3 vTint; varying vec3 vL; varying float vPart; varying float vHead;
vec3 rx(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,v.y*c-v.z*s,v.y*s+v.z*c);}
vec3 rz(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c-v.y*s,v.x*s+v.y*c,v.z);}
void main(){ vec3 q=position; vec3 nn=normal;
  if(part>4.5&&iPose.w<.5){ q=vec3(0.,1.6,-.02); }
  if(aArm>.5){ float sd=aArm<1.5?1.:-1.; float a=-(aArm<1.5?iPose.x:iPose2.x); float ab=iPose2.y*sd;
    vec3 sh=vec3(sd*.195,1.42,0.); vec3 d=q-sh; d=rz(rx(d,a),ab); q=sh+d; nn=rz(rx(nn,a),ab);
    float sw=sin(uTime*.9+iPose.z+sd)*.01; q.z+=sw*(1.42-q.y); }
  if(aHead>.5){ vec3 nk=vec3(0.,1.5,0.); vec3 d=(q-nk)*iPose.y; d=rx(d,-iPose2.z+sin(uTime*.5+iPose.z)*.04); q=nk+d; nn=rx(nn,-iPose2.z); }
  if(q.y>.95){ float bend=iPose2.w*(q.y-.95); q=vec3(q.x,.95+(q.y-.95)*cos(iPose2.w),q.z+bend); }
  q.x+=sin(uTime*.8+iPose.z)*.006*q.y;
  vec4 w=instanceMatrix*vec4(q,1.); vP=w.xyz; vN=normalize(mat3(instanceMatrix)*nn);
  vTint=part<.5?iSkin:part<1.5?iTop:part<2.5?iBot:part<3.5?iHair:part<4.5?iBot*.3+vec3(.02):iHair;
  vL=position; vPart=part; vHead=aHead;
  gl_Position=projectionMatrix*modelViewMatrix*w; }`;
const PEOPLE_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vTint; varying vec3 vL; varying float vPart; varying float vHead;
void main(){ vec3 n=normalize(vN)*(gl_FrontFacing?1.:-1.); vec3 v=normalize(vP-uCam);
  float g=texture2D(uNoise,vL.xy*9.1+vL.z*3.).r;
  vec3 alb=vTint*(.88+.24*g);
  if(vPart>.5&&vPart<1.5) alb*=.9+.12*step(.5,fract(vL.y*14.))*step(.5,fract(vTint.g*7.));
  if(vPart>.5&&vPart<2.5) alb*=1.-.25*smoothstep(.02,.0,abs(vL.y-.93))*step(vPart,1.5);
  if(vHead>.5&&vPart<.5&&vL.z>.055){ float ex=abs(vL.x)-.031;
    float eye=smoothstep(.012,.008,length(vec2(ex,(vL.y-1.632)*.85)));
    float brow=smoothstep(.006,.003,abs(vL.y-1.658+ex*ex*4.))*step(abs(ex),.019);
    float mouth=smoothstep(.004,.002,abs(vL.y-1.572-vL.x*vL.x*3.))*step(abs(vL.x),.017);
    alb=mix(alb,vec3(.95,.93,.9),smoothstep(.016,.012,length(vec2(ex*.8,vL.y-1.632)))*.6);
    alb=mix(alb,vec3(.03,.02,.02),eye); alb=mix(alb,vTint*.35,mouth*.6); alb=mix(alb,vec3(.10,.07,.05),brow*.8);
    alb=mix(alb,vec3(.85,.45,.42),smoothstep(.025,.0,length(vec2(abs(vL.x)-.05,vL.y-1.6)))*.18); }
  vec3 L=roomLight(vP,n);
  float rim=pow(1.-abs(dot(n,v)),2.5);
  vec3 Lw=WC-vP; float k=(WR*WR)/(dot(Lw,Lw)*.8+WR*WR)*inHall(vP);
  vec3 rl=vec3(.05,.32,.6)*k*max(dot(n,normalize(Lw)),0.)*1.2+vec3(.08,.35,.55)*(1.-inHall(vP))*max(n.x,0.)*.6;
  vec3 c=alb*(L+vec3(.006,.008,.01))+rim*rl*1.8+haze(vP);
  gl_FragColor=vec4(c,1.);
  ${OUT} }`;

// 光の にじみ（加算）：vB＝0 まるい ぼかし・1 リング・2 たての グラデーション。uv の まんなかが 0.5。
const GLOW_FRAG = `${COMMON} varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB; varying vec2 vUv;
void main(){ vec2 d=vUv-.5; float r=length(d)*2.; float a;
  if(vB<.5) a=pow(max(1.-r,0.),2.2);
  else if(vB<1.5){ float r0=vA; a=r<r0?0.:pow(max(1.-(r-r0)/(1.-r0),0.),2.5)*smoothstep(r0,r0+.02,r); a*=.8+.4*caus(vP.xy*1.2); }
  else a=pow(max(1.-abs(d.x)*2.,0.),1.5)*pow(vUv.y,2.);
  gl_FragColor=vec4(vC*a,1.);
  ${OUT} }`;
const GLOW_VERT = `attribute float aA; attribute float aB; varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vA; varying float vB; varying vec2 vUv;
void main(){ vP=position; vN=normal; vC=color; vA=aA; vB=aB; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

/* ───────── いきもの の 形（1 回だけ） ───────── */
// 魚：頭が +z（z -0.5…0.5＋尾びれ -0.67 まで）、たかさ 約 0.3、はば 約 0.11。aBody＝(尾の 重み, 部位 0 からだ 1 ひれ, ひれの しゅるい 1 尾 2 せ 3 しり 4/5 むな)。
function fishGeometry() {
  const pr = [[0.001, -0.43], [0.026, -0.41], [0.045, -0.34], [0.075, -0.24], [0.11, -0.12], [0.138, 0.0], [0.15, 0.1], [0.143, 0.2], [0.122, 0.3], [0.092, 0.38], [0.055, 0.45], [0.02, 0.49], [0.001, 0.5]];
  const lat = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 8); lat.rotateX(Math.PI / 2); lat.scale(0.36, 1, 1);
  lat.computeVertexNormals(); const body = lat.toNonIndexed(); lat.dispose();
  const fan = (c, pts) => { const a = []; for (let i = 0; i < pts.length - 1; i += 1) a.push(...c, ...pts[i], ...pts[i + 1]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a), 3)); g.computeVertexNormals(); return g; };
  const tail = fan([0, 0, -0.42], [[0, 0.03, -0.40], [0, 0.27, -0.68], [0, 0.06, -0.58], [0, 0, -0.56], [0, -0.06, -0.58], [0, -0.27, -0.68], [0, -0.03, -0.40]]);
  const dors = fan([0, 0.1, -0.02], [[0, 0.135, 0.2], [0, 0.22, 0.08], [0, 0.23, -0.06], [0, 0.19, -0.2], [0, 0.12, -0.31], [0, 0.09, -0.26]]);
  const anal = fan([0, -0.08, -0.12], [[0, -0.1, -0.02], [0, -0.18, -0.12], [0, -0.16, -0.25], [0, -0.07, -0.32]]);
  const pect = (s) => fan([s * 0.05, -0.03, 0.15], [[s * 0.05, -0.0, 0.17], [s * 0.15, -0.04, 0.03], [s * 0.12, -0.08, -0.0], [s * 0.05, -0.06, 0.1]]);
  const w = (x, y, z) => Math.min(1, Math.max(0, (0.25 - z) / 0.93));
  return mergeWithBody([withBody(body, 0, 0, 0, w), withBody(tail, 0, 1, 1, w), withBody(dors, 0, 1, 2, w), withBody(anal, 0, 1, 3, w), withBody(pect(1), 0, 1, 4, () => 0), withBody(pect(-1), 0, 1, 5, () => 0)]);
}
function mergeSimple(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let v = 0;
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); v += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}
function withBody(g, w, part, side = 0, wFn = null) {
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) { a[i * 3] = wFn ? wFn(p.getX(i), p.getY(i), p.getZ(i)) : w; a[i * 3 + 1] = part; a[i * 3 + 2] = side; }
  g.setAttribute('aBody', new THREE.BufferAttribute(a, 3)); return g;
}
// エイ（はば 2・頭 +z）。
function rayGeometry() { // マンタ：まるい 頭・とがった つばさ（先が うしろへ）・まんなかが ふくらむ
  const pos = [], N = 18, M = 10;
  const V = (i, j) => { const zn = -1 + (j / M) * 2, hw = 1.02 * Math.pow(Math.max(0, 1 - Math.abs(zn + 0.1) / 1.1), 0.75) * (zn > 0.7 ? 1 - (zn - 0.7) * 1.2 : 1) + 0.02;
    const xn = -1 + (i / N) * 2, x = xn * hw, z = zn * 0.5 - 0.32 * xn * xn * hw; const y = 0.13 * Math.pow(Math.max(0, 1 - Math.abs(xn)), 1.6) * (1 - zn * zn * 0.7); return [x, y, z]; };
  for (let j = 0; j < M; j += 1) for (let i = 0; i < N; i += 1) { const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1); pos.push(...a, ...b, ...c, ...a, ...c, ...d); const ay = (p) => [p[0], -p[1] * 0.35, p[2]]; pos.push(...ay(a), ...ay(c), ...ay(b), ...ay(a), ...ay(d), ...ay(c)); }
  const g = smoothNormals(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)));
  const tail = limb([0, 0, -0.5], [0, 0, -1.5], 0.025, 0.004, 4);
  const lobes = []; for (const s of [-1, 1]) { const l = limb([s * 0.12, 0, 0.5], [s * 0.13, -0.03, 0.66], 0.035, 0.02, 4).toNonIndexed(); lobes.push(withBody(l, 0, 0)); }
  return mergeWithBody([withBody(g, 0, 0, 0, (x, y, z) => Math.max(0, -z)), withBody(tail.toNonIndexed(), 1, 0), ...lobes]);
}
function mergeWithBody(list) {
  const out = mergeSimple(list); let n = out.attributes.position.count; const a = new Float32Array(n * 3); let v = 0;
  for (const g of list) { a.set(g.attributes.aBody.array, v * 3); v += g.attributes.position.count; }
  out.setAttribute('aBody', new THREE.BufferAttribute(a, 3)); return out;
}
function turtleGeometry() {
  const shell = withBody(ell(0, 0, 0, 0.42, 0.2, 0.55, 12, 6, 0, Math.PI / 2).toNonIndexed(), 0, 0);
  const plast = withBody(ell(0, 0, 0, 0.4, 0.07, 0.52, 12, 3, Math.PI / 2, Math.PI / 2).toNonIndexed(), 0, 0);
  const head = withBody(ell(0, 0.02, 0.62, 0.11, 0.09, 0.15, 8, 6).toNonIndexed(), 0, 1);
  const fl = [];
  for (const s of [-1, 1]) {
    const f = new THREE.BoxGeometry(0.55, 0.035, 0.18).toNonIndexed(); f.rotateY(s * 0.5); f.translate(s * 0.5, 0, 0.25); fl.push(withBody(f, 0, 1, 1));
    const r = new THREE.BoxGeometry(0.25, 0.03, 0.14).toNonIndexed(); r.rotateY(-s * 0.6); r.translate(s * 0.33, 0, -0.42); fl.push(withBody(r, 0, 1, 0));
  }
  return mergeWithBody([shell, plast, head, ...fl]);
}
function sharkGeometry() {
  const pr = [[0.001, -0.5], [0.03, -0.44], [0.06, -0.3], [0.1, -0.1], [0.115, 0.08], [0.1, 0.26], [0.07, 0.4], [0.03, 0.48], [0.001, 0.52]];
  const lat = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 9); lat.rotateX(Math.PI / 2); lat.scale(0.85, 1, 1);
  lat.computeVertexNormals(); const body = lat.toNonIndexed(); lat.dispose();
  const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); g.computeVertexNormals(); return g; };
  const fins = tri([0, 0.09, 0.12, 0, 0.27, -0.04, 0, 0.09, -0.08, 0, 0.02, -0.45, 0, 0.3, -0.66, 0, 0.0, -0.52, 0, -0.02, -0.46, 0, 0.0, -0.52, 0, -0.16, -0.6,
    0.08, -0.06, 0.12, 0.34, -0.15, -0.06, 0.08, -0.06, -0.02, -0.08, -0.06, 0.12, -0.08, -0.06, -0.02, -0.34, -0.15, -0.06]);
  const w = (x, y, z) => Math.min(1, Math.max(0, (0.2 - z) / 0.85));
  return mergeWithBody([withBody(body, 0, 0, 0, w), withBody(fins, 0, 1, 0, w)]);
}
// ペンギン（およぐ 形・頭が +z・おなかが -y、長さ 約 0.85）。aBody.y：0 からだ 1 くちばし 2 つばさ 3 足。
function penguinGeometry() {
  const pr = [[0.001, -0.40], [0.03, -0.37], [0.07, -0.30], [0.108, -0.2], [0.133, -0.08], [0.14, 0.02], [0.132, 0.12], [0.112, 0.19], [0.097, 0.235], [0.094, 0.27], [0.09, 0.305], [0.075, 0.34], [0.045, 0.368], [0.001, 0.382]];
  const lat = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 14); lat.rotateX(Math.PI / 2); lat.scale(0.95, 1.0, 1);
  lat.computeVertexNormals(); const body = lat.toNonIndexed(); lat.dispose();
  const beak = limb([0, -0.005, 0.355], [0, -0.018, 0.455], 0.024, 0.005, 6).toNonIndexed();
  const tail = limb([0, 0.01, -0.36], [0, 0.03, -0.46], 0.03, 0.006, 5).toNonIndexed();
  const parts = [withBody(body, 0, 0), withBody(beak, 0, 1), withBody(tail, 0, 0)];
  const fan = (c, pts) => { const a = []; for (let i = 0; i < pts.length - 1; i += 1) a.push(...c, ...pts[i], ...pts[i + 1]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a), 3)); g.computeVertexNormals(); return g; };
  for (const s of [-1, 1]) {
    const f = new THREE.BoxGeometry(0.026, 0.06, 0.29, 1, 1, 4).toNonIndexed(); const p = f.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const z = p.getZ(i), k = Math.max(0, -z); p.setY(i, p.getY(i) * (1 - k * 2.6)); p.setX(i, p.getX(i) * (1 - k * 1.5)); }
    f.computeVertexNormals(); f.translate(s * 0.122, 0.0, -0.01); parts.push(withBody(f, 0, 2, s));
    const ft = fan([s * 0.045, -0.07, -0.33], [[s * 0.07, -0.085, -0.43], [s * 0.05, -0.095, -0.46], [s * 0.02, -0.09, -0.45], [s * 0.01, -0.085, -0.42]]);
    const ft2 = fan([s * 0.045, -0.07, -0.33], [[s * 0.01, -0.085, -0.42], [s * 0.02, -0.09, -0.45], [s * 0.05, -0.095, -0.46], [s * 0.07, -0.085, -0.43]]);
    parts.push(withBody(ft, 0, 3, s), withBody(ft2, 0, 3, s));
  }
  return mergeWithBody(parts);
}
// 人（1.7 m・+z むき）。part：0 はだ 1 上 2 下 3 かみ 4 くつ 5 ながい かみ。aArm 1 右 2 左／aHead。
function humanGeometry() {
  const parts = [];
  const add = (g0, part, arm = 0, head = 0) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); const c = g.attributes.position.count; g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(c).fill(part), 1)); g.setAttribute('aArm', new THREE.BufferAttribute(new Float32Array(c).fill(arm), 1)); g.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(c).fill(head), 1)); if (g.attributes.uv) g.deleteAttribute('uv'); parts.push(g); };
  for (const s of [-1, 1]) {
    add(ell(s * 0.09, 0.045, 0.035, 0.05, 0.042, 0.12, 7, 4), 4); add(box(s * 0.09, 0, 0.03, 0.105, 0.018, 0.25), 4);
    add(limb([s * 0.09, 0.07, 0], [s * 0.093, 0.48, 0.012], 0.042, 0.056, 6), 2);
    add(ell(s * 0.094, 0.49, 0.014, 0.058, 0.05, 0.06, 6, 4), 2);
    add(limb([s * 0.094, 0.5, 0.012], [s * 0.098, 0.9, 0], 0.06, 0.082, 6), 2);
  }
  const y0 = 0.9;
  add(ell(0, y0 + 0.02, 0, 0.17, 0.12, 0.115, 10, 5), 2);
  { const pr = [[0.155, 0.88], [0.165, 0.97], [0.148, 1.08], [0.158, 1.22], [0.185, 1.34], [0.175, 1.42], [0.11, 1.47], [0.045, 1.49]];
    const g = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 10); g.scale(1, 1, 0.62); add(g, 1); }
  add(limb([0, 1.45, 0], [0, 1.53, 0.008], 0.042, 0.038, 7), 0, 0, 1);
  add(ell(0, 1.625, 0.01, 0.084, 0.106, 0.096, 12, 9), 0, 0, 1);
  add(ell(0, 1.6, 0.096, 0.013, 0.02, 0.018, 6, 4), 0, 0, 1);
  for (const s of [-1, 1]) add(ell(s * 0.085, 1.615, 0.0, 0.014, 0.028, 0.02, 6, 4), 0, 0, 1);
  add(ell(0, 1.652, -0.006, 0.091, 0.098, 0.103, 12, 7, 0, Math.PI * 0.56), 3, 0, 1);
  add(ell(0, 1.61, -0.035, 0.089, 0.085, 0.075, 8, 5), 3, 0, 1);
  add(ell(0, 1.47, -0.07, 0.085, 0.16, 0.045, 8, 5), 5, 0, 1);
  for (const [s, arm] of [[1, 1], [-1, 2]]) {
    add(ell(s * 0.19, 1.41, 0, 0.062, 0.062, 0.062, 7, 5), 1, arm);
    add(limb([s * 0.2, 1.42, 0], [s * 0.222, 1.14, 0], 0.052, 0.046, 6), 1, arm);
    add(limb([s * 0.222, 1.14, 0], [s * 0.232, 0.89, 0.025], 0.04, 0.032, 6), 0, arm);
    add(ell(s * 0.235, 0.84, 0.03, 0.026, 0.055, 0.02, 7, 5), 0, arm);
    add(limb([s * 0.225, 0.87, 0.045], [s * 0.215, 0.83, 0.07], 0.012, 0.009, 5), 0, arm);
  }
  const names = ['position', 'normal', 'part', 'aArm', 'aHead'];
  let nv = 0; for (const p of parts) nv += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of names) { const s = parts[0].attributes[k].itemSize, a = new Float32Array(nv * s); let v = 0; for (const p of parts) { a.set(p.attributes[k].array, v * s); v += p.attributes.position.count; } out.setAttribute(k, new THREE.BufferAttribute(a, s)); }
  return out;
}
function jellyGeometry() {
  const parts = [];
  const add = (g0, k, tw = 0) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); const c = g.attributes.position.count, a = new Float32Array(c * 4), p = g.attributes.position; for (let i = 0; i < c; i += 1) { a[i * 4] = k; a[i * 4 + 1] = k ? Math.min(1, Math.max(0, -p.getY(i) / (k === 1 ? 1.05 : 0.55))) : 0; a[i * 4 + 2] = tw; } g.setAttribute('aJ', new THREE.BufferAttribute(a, 4)); parts.push(g); };
  const bell = new THREE.SphereGeometry(0.22, 18, 7, 0, TAU, 0, Math.PI * 0.55); bell.scale(1, 0.8, 1); add(bell, 0);
  for (let i = 0; i < 18; i += 1) { const a = (i / 18) * TAU; const t = new THREE.PlaneGeometry(0.008, 1.05, 1, 10); t.translate(0, -0.525, 0); t.rotateY(-a); t.translate(Math.cos(a) * 0.215, -0.03, Math.sin(a) * 0.215); add(t, 1); }
  for (let i = 0; i < 4; i += 1) { const a = (i / 4) * TAU + 0.4; const t = new THREE.PlaneGeometry(0.075, 0.55, 2, 8); const p = t.attributes.position; for (let j = 0; j < p.count; j += 1) { const y = p.getY(j); p.setX(j, p.getX(j) * (1 + 0.6 * Math.sin(y * 18))); p.setZ(j, Math.sin(y * 14 + p.getX(j) * 40) * 0.015); } t.translate(0, -0.29, 0); t.rotateY(a); t.translate(Math.cos(a) * 0.035, 0.0, Math.sin(a) * 0.035); add(t, 2, i * 1.7); }
  return mergeAttrs(parts, ['position', 'normal', 'aJ']);
}
function mergeAttrs(parts, names) {
  let nv = 0; for (const p of parts) nv += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of names) { const s = parts[0].attributes[k].itemSize, a = new Float32Array(nv * s); let v = 0; for (const p of parts) { a.set(p.attributes[k].array, v * s); v += p.attributes.position.count; } out.setAttribute(k, new THREE.BufferAttribute(a, s)); }
  return out;
}

/* ───────── たてもの ───────── */
export function buildAquarium(opts = {}) {
  const t0 = now(); const rnd = rng(opts.seed || 2026);
  const group = new THREE.Group(); group.name = 'aquarium';
  U.uNoise.value = noiseTexture();
  const B = batch(), obstacles = [], ANEMS = [], LEDGES = [];
  const ob = (x, z, w, d) => obstacles.push({ x, z, w, d });
  const WALL = 0x5a646a, WALL2 = 0x4a545a, CEIL = 0x3a4248, DARK = 0x22282c, SLAB = 0x58626a;
  const room = (g, c = WALL) => B.add('room', g, c, { aA: 0, aB: 0 });
  const metal = (g, mode = 0, c = 0xc9d0d4) => B.add('metal', g, c, { aA: mode, aB: 0 });
  const glass = (g, kind, c = 0x000000) => B.add('glass', g, c, { aA: kind, aB: 0 });
  const emis = (g, c) => B.add('emis', g, c);
  const glow = (g, c, shape, a = 0) => B.add('glow', g, c, { aA: a, aB: shape });
  const tank = (g, t, region, c) => B.add('tank', g, c, { aA: t, aB: region });
  const prop = (g, t, c, sway = 0, kind = 0) => B.add('prop', g, c, { aA: t + kind / 10, aB: sway });
  const card = (g, t, c, kind) => B.add('card', g, c, { aA: t, aB: kind });
  const whiteUV = atlasUV('white'), wu = [(whiteUV[0] + whiteUV[2]) / 2, (whiteUV[1] + whiteUV[3]) / 2];
  const solid = (g) => { const a = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2); for (let i = 0; i < a.count; i += 1) a.setXY(i, wu[0], wu[1]); g.setAttribute('uv', a); return g; };

  /* ── ゆか ── */
  const floorG = [];
  const fl = (x, z, w, d, c, hall, gloss) => B.add('floor', flatPanel(x, 0, z, w, d), c, { aA: hall, aB: gloss });
  fl(0, -5, 26, 40, 0x1f272b, 1, 1); fl(0, 20, 16, 10, 0x5a5e5e, 2, 0.75); fl(16.65, -4.5, 6.7, 33, 0x40484c, 0, 0.9);
  fl(13.15, 8.5, 0.3, 5, 0x40484c, 0, 0.9);

  /* ── ホール ── */
  const H = AQUARIUM.hall;
  // まどの かべ（まるい あな）
  {
    const s = new THREE.Shape(); s.moveTo(-13, 0); s.lineTo(13, 0); s.lineTo(13, 12.7); s.lineTo(-13, 12.7); s.lineTo(-13, 0);
    const hole = new THREE.Path(); hole.absarc(0, W.y, W.R - 0.02, 0, TAU, true); s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 48); g.translate(0, 0, -25); room(g, WALL2);
    // かべの たての リブ（まどの 両がわ）
    for (const x of [-12, -10.6, -9.2, -7.8, 7.8, 9.2, 10.6, 12]) room(box(x, 0, -24.85, 0.28, 12, 0.3), 0x4e585e);
  }
  // 横の かべ（東は ろうかへの 入口 z 6…11, y < 2.9）
  room(box(-13.15, 0, -5, 0.3, 12, 40), WALL);
  room(box(13.15, 0, -9.5, 0.3, 12, 31), WALL); room(box(13.15, 0, 13, 0.3, 12, 4), WALL); room(box(13.15, 2.9, 8.5, 0.3, 9.1, 5), WALL);
  // かべの パネル（たての みぞ・2 階の かべも）
  for (const s of [-1, 1]) for (let z = -23.5; z <= 13.5; z += 2.5) { room(box(s * 12.92, 0.0, z, 0.16, 4.6, 0.12), 0x3a4248); room(box(s * 12.92, 5.0, z, 0.16, 7, 0.12), 0x3a4248); }
  // おくの かべ（入口の ホールへ x -5…5, y < 3.6）
  room(box(-9, 0, 15, 8, 12, 0.3), WALL); room(box(9, 0, 15, 8, 12, 0.3), WALL); room(box(0, 3.6, 15, 10, 8.4, 0.3), WALL);
  // 天井：六角の 格子（ふかい くぼみ）
  room(flatPanel(0, 12.6, -5, 26.4, 40.4, false), 0x2a3136);
  {
    const s = 1.35, seen = new Set(), hx = (q, r) => [1.5 * s * q, Math.sqrt(3) * s * (r + q / 2) - 5];
    for (let q = -12; q <= 12; q += 1) for (let r = -22; r <= 22; r += 1) {
      const [cx, cz] = hx(q, r); if (Math.abs(cx) > 12.4 || cz < -24 || cz > 14.4) continue;
      for (let k = 0; k < 6; k += 1) {
        const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU, ax = cx + Math.cos(a0) * s, az = cz + Math.sin(a0) * s, bx = cx + Math.cos(a1) * s, bz = cz + Math.sin(a1) * s;
        const key = `${Math.round((ax + bx) * 20)},${Math.round((az + bz) * 20)}`; if (seen.has(key)) continue; seen.add(key);
        const len = Math.hypot(bx - ax, bz - az), g = new THREE.BoxGeometry(0.16, 0.6, len + 0.08).toNonIndexed();
        g.rotateY(Math.atan2(bx - ax, bz - az)); g.translate((ax + bx) / 2, 12.3, (az + bz) / 2); room(g, 0x4a545a);
      }
    }
  }
  // 2 階の バルコニー（U の 形：両がわ＋おくの 中2階）。内がわの ふちは まがる。
  const edge = [];
  for (let i = 0; i <= 22; i += 1) { const z = -24.6 + (i / 22) * 31.6; const w = 2.3 + 1.5 * Math.sin(Math.PI * Math.min(1, (z + 24.6) / 34)) ; edge.push([-13 + w + 0.6 * Math.max(0, (z - 2) / 5), z]); }
  const [ex, ez] = edge[edge.length - 1], mez = [];
  for (let i = 1; i < 16; i += 1) { const x = ex * (1 - (i / 16) * 2); mez.push([x, ez - 1.1 * (1 - (x / ex) ** 2)]); }
  const leftEdge = edge, rightEdge = edge.map(([x, z]) => [-x, z]).reverse();
  const inner = [...leftEdge, ...mez, ...rightEdge];
  const poly = [[-13, -24.6], ...inner, [13, -24.6], [13, 15], [-13, 15]];
  room(slab(poly, H.balcony, 0.34), SLAB);
  // ふちの 帯・ガラスの 手すり・手すりの 金属・ふちの 光
  {
    const pts = inner.map(([x, z]) => new THREE.Vector3(x, 0, z));
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L < 1e-3) continue; const nx = -dz / L, nz = dx / L; // 外（ホール）むき
      const off = 0.04;
      glass(quad4([a.x, H.balcony, a.z], [b.x, H.balcony, b.z], [b.x, H.balcony + 1.05, b.z], [a.x, H.balcony + 1.05, a.z]), 3, 0x0b1a1c);
      emis(solid(quad4([a.x + nx * off, H.balcony - 0.3, a.z + nz * off], [b.x + nx * off, H.balcony - 0.3, b.z + nz * off], [b.x + nx * off, H.balcony - 0.27, b.z + nz * off], [a.x + nx * off, H.balcony - 0.27, a.z + nz * off])), [0.12, 0.55, 0.62]);
      emis(solid(quad4([b.x + nx * off, H.balcony - 0.3, b.z + nz * off], [a.x + nx * off, H.balcony - 0.3, a.z + nz * off], [a.x + nx * off, H.balcony - 0.27, a.z + nz * off], [b.x + nx * off, H.balcony - 0.27, b.z + nz * off])), [0.12, 0.55, 0.62]);
      if (i % 2 === 0) metal(box(a.x, H.balcony, a.z, 0.05, 1.1, 0.05), 0);
    }
    const curve = new THREE.CatmullRomCurve3(inner.map(([x, z]) => new THREE.Vector3(x, H.balcony + 1.08, z)));
    metal(new THREE.TubeGeometry(curve, 160, 0.035, 6, false), 0);
    // 下の 柱（中2階の 下）
    for (const x of [-6.5, 6.5]) room(cyl(x, 0, 11.6, 0.22, 0.22, H.balcony - 0.34, 14), 0x1a2024);
  }
  // 2 階の かべ（バルコニーの おく）に うすい 帯の 光
  for (const s of [-1, 1]) emis(solid(panel(s * 12.84, 7.6, -6, 30, 0.04, s > 0 ? -Math.PI / 2 : Math.PI / 2)), [0.05, 0.22, 0.26]);
  // 画面の 台（まどの 両がわ）
  for (const s of [-1, 1]) {
    const x = s * 7.0, z = -22.6, ry = -s * 0.35;
    const ped = box(0, 0, 0, 0.5, 1.0, 0.36); ped.rotateY(ry); ped.translate(x, 0, z); room(ped, 0x14191c);
    const top = box(0, 0, 0, 1.06, 0.66, 0.08); top.rotateX(-0.35); top.rotateY(ry); top.translate(x, 1.0, z); room(top, 0x0c0f11);
    const scr = panel(0, 0, 0, 0.96, 0.58, 0, atlasUV(s < 0 ? 'screenA' : 'screenB')); scr.translate(0, 0.33, 0.045); scr.rotateX(-0.35); scr.rotateY(ry); scr.translate(x, 1.0, z); emis(scr, [1.15, 1.15, 1.15]);
    const gl = panel(0, 0, 0, 2.4, 1.8, 0); gl.translate(0, 0.33, 0.05); gl.rotateX(-0.35); gl.rotateY(ry); gl.translate(x, 1.0, z); glow(solid(gl), [0.06, 0.12, 0.16], 0);
    ob(x, z, 0.4, 0.35);
  }

  /* ── まるい まど：金属の 輪・リベット・アクリル ── */
  {
    // 輪の 断面（r, z）：おくの つつ → 内の かど → 前の 面 → 外の ふち → かべ
    const prof = [[W.r, -25.75], [W.r, -24.62], [W.r + 0.08, -24.42], [W.r + 0.35, -24.36], [W.R - 0.35, -24.36], [W.R - 0.08, -24.42], [W.R + 0.05, -24.7], [W.R + 0.18, -25.0]];
    const lat = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 128);
    lat.rotateX(Math.PI / 2); lat.translate(0, W.y, 0); // lathe の 軸（y＝ここでは z の 値）→ z、まどの 中心へ
    lat.computeVertexNormals(); metal(lat, 1, 0x8a6a4c);
    // 内がわに 2 本目の 細い 段
    const lat2 = new THREE.LatheGeometry([[W.r + 0.42, -24.36], [W.r + 0.46, -24.30], [W.R - 0.46, -24.30], [W.R - 0.42, -24.36]].map(([r, z]) => new THREE.Vector2(r, z)), 128);
    lat2.rotateX(Math.PI / 2); lat2.translate(0, W.y, 0); lat2.computeVertexNormals(); metal(lat2, 1, 0x6c5844);
    // 六角の ボルト（2 れつ）＋ 座金
    for (const [rr, n, sz] of [[W.r + 0.22, 60, 0.05], [W.R - 0.2, 72, 0.055]]) for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU, cx = Math.cos(a) * rr, cy = W.y + Math.sin(a) * rr;
      const h = new THREE.CylinderGeometry(sz, sz, 0.04, 6, 1); h.rotateX(Math.PI / 2); h.rotateZ(a); h.translate(cx, cy, -24.33); metal(h, 1, 0xa08262);
    }
    // 内の ふちの 光（青みどり）
    const rim = new THREE.RingGeometry(W.r - 0.0, W.r + 0.09, 128, 1); rim.translate(0, W.y, -24.41); emis(solid(rim), [0.75, 2.4, 2.6]);
    const rim2 = new THREE.CylinderGeometry(W.r - 0.005, W.r - 0.005, 1.0, 128, 1, true); rim2.rotateX(Math.PI / 2); rim2.translate(0, W.y, -25.15); emis(solid(rim2), [0.04, 0.32, 0.42]);
    // アクリル（まど）
    const disk = new THREE.CircleGeometry(W.r, 96); disk.translate(0, W.y, -25.3); glass(disk, 0);
    // まわりの にじみ
    glow(solid(panel(0, W.y, -24.3, 17, 17, 0)), [0.07, 0.40, 0.55], 1, (W.R + 0.05) / 8.5);
    // 床の 光だまり（まどの 下）
    const pool = flatPanel(0, 0.012, -22.8, 12, 4.4); glow(solid(pool), [0.012, 0.06, 0.08], 0);
  }

  /* ── 水そう 0（まどの おく） ── */
  {
    const z0 = -44, z1 = -25.6, x0 = -14, x1 = 14, top = 14;
    const sand = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 56, 40); sand.rotateX(-Math.PI / 2); sand.translate(0, 0, (z0 + z1) / 2);
    const sp = sand.attributes.position; for (let i = 0; i < sp.count; i += 1) { const x = sp.getX(i), z = sp.getZ(i); sp.setY(i, 0.35 * noise3(x * 0.18, 0, z * 0.18, 5) + 0.15 * Math.sin(x * 0.9 + z * 0.3) * 0.3 - 0.2 + Math.max(0, (-z - 30) * 0.05) * 0 + Math.abs(x) * 0.04); }
    sand.computeVertexNormals(); tank(sand, 0, 0, 0xb9a882);
    tank(panel(0, top / 2 - 0.5, z0, x1 - x0, top + 1, 0), 0, 1, 0x2a3a40);
    tank(panel(x0, top / 2 - 0.5, (z0 + z1) / 2, z1 - z0, top + 1, Math.PI / 2), 0, 1, 0x2a3a40);
    tank(panel(x1, top / 2 - 0.5, (z0 + z1) / 2, z1 - z0, top + 1, -Math.PI / 2), 0, 1, 0x2a3a40);
    const surf = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 6); surf.rotateX(Math.PI / 2); surf.translate(0, top, (z0 + z1) / 2); tank(surf, 0, 2, 0xffffff);
    // 岩の 山（両がわ）
    const rocks = [[-10, -29, 2.6, 2.4, 2.2], [-8, -31.5, 1.8, 3.2, 1.9], [-11.5, -34, 2.4, 4.5, 2.4], [9.5, -29.5, 2.4, 2.0, 2.0], [11, -32.5, 2.3, 5.2, 2.6], [8, -35, 1.8, 1.6, 1.8], [-3.5, -41, 3, 2.0, 2], [4.5, -42, 3.2, 3.0, 2.2], [0.5, -28.6, 1.3, 0.7, 1.0], [-5.5, -27.6, 1.0, 0.6, 0.9], [5.5, -27.4, 0.9, 0.5, 0.8]];
    rocks.forEach(([x, z, sx, sy, sz], i) => prop(rock(x, -0.1, z, sx, sy, sz, i * 3.1, { detail: 2 }), 0, [0x5a5850, 0x4d5450, 0x625c52][i % 3]));
    // いせき：みぞの ある 柱（折れた）・ねた 柱・石の ブロック・アーチ
    const column = (x, z, h, r, broken) => {
      const g = new THREE.CylinderGeometry(r, r * 1.06, h, 20, Math.max(2, Math.round(h * 2)), false); const p = g.attributes.position;
      for (let i = 0; i < p.count; i += 1) { const px = p.getX(i), pz = p.getZ(i), py = p.getY(i), a = Math.atan2(pz, px), k = 1 - 0.07 * Math.abs(Math.cos(a * 8)); p.setX(i, px * k); p.setZ(i, pz * k); if (broken && py > h / 2 - 0.01) p.setY(i, py - (0.35 + 0.35 * Math.sin(a * 3 + x)) ); }
      g.computeVertexNormals(); g.translate(x, h / 2, z); prop(g, 0, 0xb9ab8e);
      prop(box(x, -0.2, z, r * 2.7, 0.55, r * 2.7), 0, 0xa89a7e);
      if (!broken) prop(box(x, h, z, r * 2.6, 0.45, r * 2.6), 0, 0xb3a588);
    };
    column(-6.2, -35, 6.5, 0.55, true); column(-2.4, -38.5, 9, 0.6, false); column(2.4, -38.5, 9, 0.6, false); column(6.4, -34, 4.2, 0.55, true);
    prop(box(0, 9.4, -38.5, 6.4, 0.8, 1.3), 0, 0xb5a78a); // まぐさ石
    { const g = new THREE.CylinderGeometry(0.55, 0.55, 5.2, 20, 1); g.rotateZ(Math.PI / 2); g.rotateY(0.5); g.translate(1.8, 0.35, -31.5); prop(g, 0, 0xb2a487); }
    for (let i = 0; i < 9; i += 1) { const g = box(0, 0, 0, 0.6 + rnd() * 0.9, 0.4 + rnd() * 0.5, 0.5 + rnd() * 0.8); g.rotateY(rnd() * 3); g.rotateZ((rnd() - 0.5) * 0.4); g.translate(-7 + rnd() * 14, -0.15, -30 - rnd() * 10); prop(g, 0, 0xa9997b); }
    // 手前の 岩の 尾根（ガラスの すぐ おく・左右）＝ さんごの 台
    const ridge = [[-8.6, -27.0, 1.9, 2.2, 1.1], [-5.6, -27.0, 1.5, 2.9, 1.0], [-3.6, -26.9, 1.1, 1.9, 0.8], [-10.6, -27.6, 1.5, 3.2, 1.2], [5.4, -27.0, 1.6, 3.2, 1.0], [3.5, -26.8, 1.0, 1.7, 0.8], [8.4, -27.3, 1.9, 2.4, 1.2], [10.8, -27.8, 1.4, 3.4, 1.3], [-1.6, -26.8, 0.8, 0.6, 0.6], [1.8, -27.0, 0.9, 0.7, 0.7]];
    ridge.forEach(([x, z, sx, sy, sz], i) => prop(rock(x, -0.2, z, sx, sy, sz, 40 + i * 2.7, { detail: 2, rough: 0.33 }), 0, [0x5c544a, 0x6a5e50, 0x4e4a44][i % 3]));
    // さんご（色と 形の しゅるい）
    const STAG = [0xb070d0, 0xe8d6b8, 0x6fa0d8, 0xd8a050, 0xf09ab0, 0x9ad0a0], BRAIN = [0x8aa040, 0xc8a050, 0x7a9a7a, 0xd07a50, 0xb0b060], TABLE = [0x9a8a6a, 0x80a090, 0xc0a070, 0x8a7ab0];
    const WHIP = [0xff6a2a, 0xe8c040, 0xd0403a, 0xff9a5a], FAN = [0xa03a8a, 0xd0402a, 0xff8a2a, 0xe8c040, 0x8a4ab0, 0xc85070], ANEM = [0xd890c0, 0x80d0b0, 0xf0b070, 0xb0a0f0];
    const pickc = (a) => a[Math.floor(rnd() * a.length)];
    const branchy = (x, y, z, s, c) => { // えだサンゴ（3 だん）
      const grow = (p0, dir, len, r, depth) => { const e = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len]; prop(limb(p0, e, r, r * 0.72, depth > 2 ? 3 : depth > 1 ? 4 : 5), 0, c, depth / 3, 2);
        if (depth >= 3) return; const nb = 2; for (let m = 0; m < nb; m += 1) { const b = rnd() * TAU, sp = 0.45 + rnd() * 0.35; const d = [dir[0] * 0.6 + Math.cos(b) * sp, dir[1] * 0.75 + 0.25, dir[2] * 0.6 + Math.sin(b) * sp], l = Math.hypot(...d); grow(e, d.map((v) => v / l), len * (0.62 + rnd() * 0.2), r * 0.7, depth + 1); } };
      for (let k = 0; k < 3; k += 1) { const a = rnd() * TAU; const d = [Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45], l = Math.hypot(...d); grow([x, y, z], d.map((v) => v / l), 0.42 * s, 0.055 * s, 1); } };
    const brain = (x, y, z, s, c) => prop(rock(x, y, z, 0.6 * s, 0.42 * s, 0.6 * s, x * 7 + z, { detail: 2, rough: 0.1, flat: -0.2 }), 0, c, 0, 1);
    const table = (x, y, z, s, c) => { prop(cyl(x, y, z, 0.07 * s, 0.1 * s, 0.5 * s, 6), 0, c, 0, 3); const g = new THREE.CylinderGeometry(0.85 * s, 0.25 * s, 0.12 * s, 16, 1); g.translate(x, y + 0.55 * s, z); prop(g, 0, c, 0, 3); };
    const whip = (x, y, z, h, c) => { const n = 5; let px = x, py = y, pz = z; for (let k = 0; k < n; k += 1) { const nx = px + (rnd() - 0.5) * 0.15, ny = py + h / n, nz = pz + (rnd() - 0.5) * 0.15; const g = limb([px, py, pz], [nx, ny, nz], 0.03 * (1 - k / n) + 0.008, 0.03 * (1 - (k + 1) / n) + 0.006, 4); prop(g, 0, c, (k + 0.5) / n * 0.7); px = nx; py = ny; pz = nz; } };
    const fan = (x, y, z, w, h, c) => { const g = new THREE.PlaneGeometry(w, h, 3, 4); g.translate(0, h / 2, 0); g.rotateY(rnd() * 0.9 - 0.45); g.rotateX((rnd() - 0.5) * 0.25); g.translate(x, y, z); card(g, 0, c, 0); };
    const kelp = (x, z, h) => { for (let k = 0; k < 3; k += 1) { const g = new THREE.PlaneGeometry(0.42, h, 1, 12); g.translate(0, h / 2 - 0.2, 0); g.rotateY(rnd() * 3); g.translate(x + (rnd() - 0.5) * 0.4, 0, z + (rnd() - 0.5) * 0.4); card(g, 0, [0x7a8a2a, 0x8a7a30, 0x6a7a2a][k], 1); } };
    const pen = (x, y, z, h, c) => { for (let k = 0; k < 2; k += 1) { const g = new THREE.PlaneGeometry(h * 0.45, h, 1, 4); g.translate(0, h / 2, 0); g.rotateY(k * Math.PI / 2 + rnd()); g.translate(x, y, z); card(g, 0, c, 2); } };
    const anemone = (x, y, z, s, c) => { ANEMS.push([x, y + 0.22 * s, z]); prop(cyl(x, y - 0.05, z, 0.13 * s, 0.16 * s, 0.14 * s, 10), 0, 0x8a5a50); const g = new THREE.CylinderGeometry(0.32 * s, 0.12 * s, 0.3 * s, 16, 3, true); g.translate(x, y + 0.22 * s, z); card(g, 0, c, 3); };
    const reef = [[-10, -29, 2.2], [-8.3, -31.5, 3.0], [9.6, -29.5, 1.9], [10.8, -32.4, 4.9], [-11.2, -33.8, 4.2], [8, -35, 1.5], [0.5, -28.6, 0.6], [-5.5, -27.6, 0.5], [5.5, -27.4, 0.45],
      [-8.6, -27.0, 2.0], [-5.6, -27.0, 2.6], [-3.6, -26.9, 1.7], [5.4, -27.0, 2.9], [3.5, -26.8, 1.55], [8.4, -27.3, 2.2], [-1.6, -26.8, 0.5], [1.8, -27.0, 0.6]];
    reef.forEach(([x, z, h], i) => {
      const n = i >= 9 ? 6 : 4;
      for (let k = 0; k < n; k += 1) {
        const a = rnd() * TAU, rr = 0.15 + rnd() * (i >= 9 ? 0.7 : 1.2), cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr, y = h * (i >= 9 ? 0.78 + rnd() * 0.18 : 0.55 + rnd() * 0.3);
        const kind = (i + k) % 7;
        if (kind === 0 || kind === 4) branchy(cx, y, cz, 0.8 + rnd() * 0.5, pickc(STAG)); else if (kind === 1) brain(cx, y, cz, 0.6 + rnd() * 0.5, pickc(BRAIN)); else if (kind === 2) table(cx, y, cz, 0.7 + rnd() * 0.5, pickc(TABLE));
        else if (kind === 3) fan(cx, y - 0.1, cz, 1.0 + rnd() * 0.9, 0.9 + rnd() * 0.8, pickc(FAN)); else if (kind === 5) anemone(cx, y, cz, 1 + rnd() * 0.6, pickc(ANEM)); else whip(cx, y, cz, 1.0 + rnd() * 1.2, pickc(WHIP));
      }
    });
    for (let i = 0; i < 12; i += 1) kelp(i < 6 ? -12.6 + rnd() * 3.2 : 9.6 + rnd() * 3.2, -28 - rnd() * 13, 5 + rnd() * 7);
    for (let i = 0; i < 34; i += 1) { const x = -9.5 + rnd() * 19, z = -27.3 - rnd() * 15; if (Math.abs(x) < 3 && z > -33) continue; const k = i % 6;
      if (k === 0) brain(x, 0.05, z, 0.5 + rnd() * 0.4, pickc(BRAIN)); else if (k === 1) whip(x, 0, z, 0.6 + rnd(), pickc(WHIP)); else if (k === 2) branchy(x, 0, z, 0.6 + rnd() * 0.4, pickc(STAG)); else if (k === 3) fan(x, 0, z, 0.8 + rnd() * 0.8, 0.8 + rnd() * 0.9, pickc(FAN)); else if (k === 4) pen(x, 0, z, 0.5 + rnd() * 0.5, 0xf0c070); else anemone(x, 0.1, z, 0.9 + rnd() * 0.5, pickc(ANEM)); }
    // とおくの 岩の 影（奥行きの 層）
    for (let i = 0; i < 7; i += 1) prop(rock(-12 + i * 4 + (rnd() - 0.5) * 2, -0.2, -42.5 + rnd() * 1.5, 2.2 + rnd(), 1.6 + rnd() * 2.2, 1.4, 90 + i, { detail: 2, rough: 0.3 }), 0, 0x4a5050);
  }

  /* ── ペンギンの ろうか ── */
  const C = AQUARIUM.corridor;
  room(flatPanel(16.65, C.top, -4.5, 7, 33.4, false), 0x15191c);
  room(box(16.65, 0, -21.15, 7, C.top, 0.3), WALL); room(box(16.65, 0, 12.15, 7, C.top, 0.3), WALL);
  room(box(13.45, 0, -4.5, 0.3, C.top, 33), WALL2); // ろうかの 西の かべ（ホールの かべの うら）
  // ガラスの まわり：下の しきい・上の はり・たての つぎめ
  room(box(20.05, 0, -4.5, 0.12, PG.y0, 31.6), 0x0e1113); room(box(20.05, PG.y1, -4.5, 0.2, C.top - PG.y1, 31.6), 0x0e1113);
  for (let z = PG.z0; z <= PG.z1 + 0.01; z += 6.2) room(box(20.02, PG.y0, z, 0.06, PG.y1 - PG.y0, 0.05), 0x050607);
  glass(panel(PG.x, (PG.y0 + PG.y1) / 2, (PG.z0 + PG.z1) / 2, PG.z1 - PG.z0, PG.y1 - PG.y0, -Math.PI / 2), 1);
  // ななめの 説明の 台（手すりの 下）・手すり
  {
    const z0 = PG.z0 + 0.3, z1 = PG.z1 - 0.3, L = z1 - z0, zc = (z0 + z1) / 2;
    room(quad4([19.95, 0.92, z0], [19.95, 0.92, z1], [19.38, 0.76, z1], [19.38, 0.76, z0]).rotateY(0) , 0x101315);
    room(box(19.42, 0, zc, 0.06, 0.76, L), 0x0f1214); room(box(19.7, 0, zc, 0.55, 0.06, L), 0x0f1214);
    for (let z = z0 + 0.8, i = 0; z < z1 - 0.4; z += 1.55, i += 1) {
      const g = panel(0, 0, 0, 0.36, 0.18, 0, atlasUV(`label${i % 4}`)); g.rotateX(-Math.PI / 2 + 0.27); g.rotateY(-Math.PI / 2); g.translate(19.66, 0.852, z); emis(g, [0.95, 0.95, 0.92]);
      const gg = flatPanel(19.66, 0.86, z, 0.7, 0.9); glow(solid(gg), [0.04, 0.04, 0.035], 0);
    }
    metal(limb([19.25, 1.0, z0], [19.25, 1.0, z1], 0.026, 0.026, 10), 0);
    for (let z = z0; z <= z1 + 0.01; z += 2.2) { metal(cyl(19.25, 0, z, 0.02, 0.02, 1.0, 8), 0); metal(limb([19.25, 0.88, z], [19.4, 0.8, z], 0.012, 0.012, 6), 0); }
    ob(19.6, zc, 0.5, L / 2);
  }
  // 西の かべ：うすく 光る パネル（ペンギンの 絵）と 長い いす
  for (const [z, k] of [[6, 'screenA'], [-3, 'screenB'], [-12, 'screenA']]) {
    room(box(13.62, 1.0, z, 0.06, 1.4, 2.4), 0x15191c);
    emis(panel(13.66, 1.7, z, 2.2, 1.25, Math.PI / 2, atlasUV(k)), [0.32, 0.34, 0.36]);
    glow(solid(panel(13.67, 1.7, z, 4.2, 2.6, Math.PI / 2)), [0.03, 0.06, 0.08], 0);
  }
  for (const z of [1.5, -7.5]) { room(box(14.1, 0, z, 0.5, 0.42, 3.2), 0x2a2f33); room(box(14.1, 0.42, z, 0.55, 0.06, 3.3), 0x6a5a48); }
  // 天井の スポット・床の 足もとの 光
  for (let z = -19.25; z < 12; z += 3.5) { const d = new THREE.CircleGeometry(0.09, 14); d.rotateX(Math.PI / 2); d.translate(16, C.top - 0.01, z); emis(solid(d), [2.4, 2.1, 1.7]); room(cyl(16, C.top - 0.05, z, 0.13, 0.13, 0.05, 14), 0x0b0d0f); }
  for (let z = -20; z < 11.5; z += 1.2) emis(solid(flatPanel(13.66, 0.012, z, 0.05, 0.22)), [0.06, 0.32, 0.34]);
  // 看板（おくの かべ・ホールの 入口の 上）
  emis(panel(16.65, 2.85, -20.98, 4.2, 0.53, 0, atlasUV('penguin')), [1.2, 1.2, 1.2]);
  glow(solid(panel(16.65, 2.85, -20.95, 6.2, 1.6, 0)), [0.10, 0.06, 0.03], 0);
  emis(panel(12.99, 3.35, 8.5, 2.6, 0.33, -Math.PI / 2, atlasUV('way')), [1.1, 1.1, 1.1]);

  /* ── 水そう 1（ペンギン） ── */
  {
    const x0 = 20.05, x1 = 29.5, z0 = -21, z1 = 12, zc = (z0 + z1) / 2, L = z1 - z0, wl = PG.waterline;
    const floor = new THREE.PlaneGeometry(x1 - x0, L, 18, 30); floor.rotateX(-Math.PI / 2); floor.translate((x0 + x1) / 2, -0.4, zc);
    const fp = floor.attributes.position; for (let i = 0; i < fp.count; i += 1) fp.setY(i, -0.4 + 0.18 * noise3(fp.getX(i) * 0.6, 1, fp.getZ(i) * 0.6, 9));
    floor.computeVertexNormals(); tank(floor, 1, 0, 0x9aa8a8);
    tank(panel(x1, (wl - 0.4) / 2, zc, L, wl + 0.4, -Math.PI / 2), 1, 1, 0x4a5c66);
    tank(panel(x1, wl + 1.4, zc, L, 2.8, -Math.PI / 2), 1, 3, 0xdbe9f0);
    for (const z of [z0, z1]) { tank(panel((x0 + x1) / 2, (wl - 0.4) / 2, z, x1 - x0, wl + 0.4, z === z0 ? 0 : Math.PI), 1, 1, 0x4a5c66); tank(panel((x0 + x1) / 2, wl + 1.4, z, x1 - x0, 2.8, z === z0 ? 0 : Math.PI), 1, 3, 0xcfe0ea); }
    const surf = new THREE.PlaneGeometry(x1 - x0, L, 4, 8); surf.rotateX(Math.PI / 2); surf.translate((x0 + x1) / 2, wl, zc); tank(surf, 1, 2, 0xffffff);
    tank(flatPanel((x0 + x1) / 2, 3.9, zc, x1 - x0, L, false), 1, 5, 0x8fb4c8);
    // 雪を かぶった 岩：おくの かべ（天井まで）・水の 上の たな（ペンギンが 立つ）・水の 中の 岩
    for (let z = z0 + 0.6, i = 0; z < z1; z += 1.9 + rnd() * 0.8, i += 1) prop(rock(28.4 + rnd() * 0.6, 1.2, z, 1.5 + rnd() * 0.5, 2.5 + rnd() * 0.4, 1.3 + rnd() * 0.4, 60 + i * 1.7, { detail: 2, rough: 0.42, flat: -0.6 }), 1, 0x8a96a0, 0, 4);
    for (let z = z0 + 1.2, i = 0; z < z1 - 0.8; z += 2.3 + rnd() * 1.1, i += 1) {
      const T = 2.38 + rnd() * 0.35, sy = 0.75 + rnd() * 0.2, cap = 0.55, x = 24.6 + (i % 2 ? 0.9 : 0) + rnd() * 0.6;
      prop(rock(x, T - cap * sy, z, 1.3 + rnd() * 0.6, sy, 1.0 + rnd() * 0.5, 80 + i * 2.3, { detail: 2, rough: 0.42, flat: -0.75, cap }), 1, 0x8a96a0, 0, 4);
      prop(rock(x + 0.5 + rnd() * 0.4, 0.4, z + (rnd() - 0.5) * 0.8, 0.9 + rnd() * 0.5, 1.4 + rnd() * 0.3, 0.8 + rnd() * 0.4, 120 + i * 1.9, { detail: 2, rough: 0.45 }), 1, 0x7a8690, 0, 4);
      LEDGES.push([x, T, z]);
    }
    for (let i = 0; i < 12; i += 1) prop(rock(21.4 + rnd() * 4.5, -0.42, z0 + 1 + rnd() * (L - 2), 0.3 + rnd() * 0.5, 0.25 + rnd() * 0.3, 0.3 + rnd() * 0.5, i * 2.3, { detail: 1, rough: 0.3 }), 1, 0x6f8088);
  }

  /* ── 入口の ホール ── */
  const F = AQUARIUM.foyer;
  room(box(-8.15, 0, 20, 0.3, F.top, 10.6), WALL); room(box(8.15, 0, 20, 0.3, F.top, 10.6), WALL);
  room(box(-5.4, 0, 25.15, 5.8, F.top, 0.3), WALL); room(box(5.4, 0, 25.15, 5.8, F.top, 0.3), WALL); room(box(0, 3.1, 25.15, 5, F.top - 3.1, 0.3), WALL);
  room(flatPanel(0, F.top, 20, 16.4, 10.4, false), 0x9a958c);
  for (let x = -6; x <= 6; x += 4) for (let z = 16.67; z < 25; z += 3.34) { const d = new THREE.CircleGeometry(0.1, 14); d.rotateX(Math.PI / 2); d.translate(x, F.top - 0.01, z); emis(solid(d), [2.4, 2.1, 1.7]); }
  // ドア（ガラス）と 外の 光
  glass(panel(0, 1.5, 25.0, 4.8, 3.0, Math.PI), 3, 0x080c0e);
  for (const x of [-2.4, 0, 2.4]) metal(box(x, 0, 25.0, 0.08, 3.1, 0.1), 2);
  metal(box(0, 3.0, 25.0, 4.9, 0.1, 0.12), 2);
  emis(panel(0, 1.55, 25.6, 5.2, 3.2, Math.PI, atlasUV('day')), [1.8, 1.8, 1.8]);
  glow(solid(flatPanel(0, 0.014, 22.6, 6.5, 5)), [0.16, 0.16, 0.15], 2);
  emis(panel(0, 3.55, 24.98, 1.1, 0.28, Math.PI, atlasUV('exit')), [1.1, 1.1, 1.1]);
  // 大看板（西の かべ）・ホールへの 看板
  room(box(-7.86, 3.27, 19.9, 0.06, 1.5, 5.7), 0x05090b); emis(panel(-7.82, 4.02, 19.9, 5.2, 1.3, Math.PI / 2, atlasUV('main')), [1.3, 1.3, 1.3]);
  glow(solid(panel(-7.8, 4.0, 19.9, 8, 2.8, Math.PI / 2)), [0.04, 0.14, 0.2], 0);
  emis(panel(0, 4.22, 15.17, 4.6, 0.58, 0, atlasUV('ocean')), [1.15, 1.15, 1.15]);
  // うけつけの 台（まがった）
  for (let i = 0; i < 7; i += 1) { const a = -0.7 + (i / 6) * 1.4, x = -5.6 + Math.sin(a) * 2.2, z = 19.6 + Math.cos(a) * 1.0 - 1; const g = box(0, 0, 0, 0.72, 1.05, 0.5); g.rotateY(a); g.translate(x, 0, z); room(g, 0x30383c); const t = box(0, 0, 0, 0.74, 0.05, 0.62); t.rotateY(a); t.translate(x, 1.05, z); metal(t, 2, 0x8a9296); }
  ob(-5.6, 18.6, 2.3, 0.8);
  // うけつけの 前の あかり・きっぷの かんばん・ならぶ 柱と ベルト
  for (let i = 0; i < 6; i += 1) { const a0 = -0.7 + (i / 6) * 1.4, a1 = -0.7 + ((i + 1) / 6) * 1.4; const P = (a, yy) => [-5.6 + Math.sin(a) * 2.47, yy, 18.6 + Math.cos(a) * 1.25]; emis(solid(quad4(P(a0, 0.12), P(a1, 0.12), P(a1, 0.16), P(a0, 0.16))), [0.3, 1.2, 1.2]); emis(solid(quad4(P(a0, 0.96), P(a1, 0.96), P(a1, 1.0), P(a0, 1.0))), [1.0, 0.75, 0.45]); }
  emis(panel(-5.6, 2.45, 19.4, 2.0, 0.5, 0, atlasUV('tickets')), [1.15, 1.15, 1.15]); room(box(-5.6, 2.15, 19.36, 2.1, 0.6, 0.06), 0x0a1418);
  for (const dx of [-0.9, 0.9]) metal(limb([-5.6 + dx, 2.75, 19.36], [-5.6 + dx, 4.98, 19.36], 0.006, 0.006, 4), 2);
  glow(solid(panel(-5.6, 2.45, 19.42, 3.6, 1.4, 0)), [0.03, 0.10, 0.12], 0);
  { const posts = [[-3.2, 21.2], [-3.2, 22.6], [-1.6, 21.2], [-1.6, 22.6]]; posts.forEach(([x, z]) => { metal(cyl(x, 0, z, 0.025, 0.025, 0.95, 8), 2); metal(cyl(x, 0, z, 0.16, 0.18, 0.03, 12), 2); });
    for (const [a, b] of [[0, 2], [1, 3], [0, 1]]) { const [x0, z0] = posts[a], [x1, z1] = posts[b]; room(beamBox([x0, 0.9, z0], [x1, 0.9, z1], 0.012, 0.05), 0x1e3a6a); } }
  // 木の たての ルーバー（西の かべ）・天井の まわりの 光の みぞ・ゆかの マット・あんないの 台・じかんの かんばん
  for (let z = 15.5; z < 24.8; z += 0.16) room(box(-7.96, 0, z, 0.07, F.top - 0.05, 0.06), 0x8a6040);
  for (const [x, z, w, d] of [[0, 15.45, 15.6, 0.05], [0, 24.85, 15.6, 0.05], [-7.85, 20, 0.05, 9.4], [7.85, 20, 0.05, 9.4]]) emis(solid(flatPanel(x, F.top - 0.012, z, w, d, false)), [1.6, 1.3, 0.95]);
  room(flatPanel(0, 0.006, 23.6, 4.6, 2.0), 0x1a1e22);
  { room(box(2.6, 0, 16.4, 1.3, 1.05, 0.25), 0x171c1f); const g = panel(2.6, 1.45, 16.55, 1.25, 0.62, 0, atlasUV('info')); emis(g, [1.0, 1.0, 1.0]); room(box(2.6, 1.05, 16.4, 1.36, 0.8, 0.22), 0x0e1214); ob(2.6, 16.4, 0.7, 0.2); }
  emis(panel(5.4, 2.4, 24.98, 2.2, 0.55, Math.PI, atlasUV('hours')), [1.0, 1.0, 1.0]);
  // ベンチ（クラゲの 柱の まえ）
  room(box(2.4, 0, 19.6, 0.5, 0.42, 2.0), 0x2a2f33); room(box(2.4, 0.42, 19.6, 0.56, 0.06, 2.1), 0x8a6040); ob(2.4, 19.6, 0.3, 1.0);
  // クラゲの 柱
  {
    room(cyl(J.x, 0, J.z, 1.05, 1.1, J.y0, 28), 0x1c2226); room(cyl(J.x, J.y1, J.z, 1.05, 1.0, F.top - J.y1, 28), 0x1c2226);
    metal(cyl(J.x, J.y0 - 0.04, J.z, 0.95, 0.95, 0.06, 40), 2); metal(cyl(J.x, J.y1 - 0.02, J.z, 0.95, 0.95, 0.06, 40), 2);
    const shell = new THREE.CylinderGeometry(J.r - 0.02, J.r - 0.02, J.y1 - J.y0, 32, 1, true); shell.translate(J.x, (J.y0 + J.y1) / 2, J.z); tank(shell, 2, 4, 0xffffff);
    const gc = new THREE.CylinderGeometry(J.r, J.r, J.y1 - J.y0, 40, 1, true); gc.translate(J.x, (J.y0 + J.y1) / 2, J.z); glass(gc, 2);
    glow(solid(flatPanel(J.x, 0.013, J.z, 5, 5)), [0.03, 0.08, 0.2], 0);
    ob(J.x, J.z, 1.1, 1.1);
  }

  /* ── 当たり判定（かべ） ── */
  ob(-13.15, -5, 0.2, 20); ob(0, -25, 13, 0.3); ob(-9, 15, 4, 0.2); ob(9, 15, 4, 0.2);
  ob(13.15, -9.5, 0.2, 15.5); ob(13.15, 13.5, 0.2, 1.6);
  ob(-8.15, 20, 0.2, 5.3); ob(8.15, 20, 0.2, 5.3); ob(-5.4, 25.15, 2.9, 0.2); ob(5.4, 25.15, 2.9, 0.2);
  ob(16.65, -21.15, 3.5, 0.2); ob(16.65, 12.15, 3.5, 0.2); ob(20.1, -4.5, 0.15, 16.5); ob(-6.5, 11.6, 0.3, 0.3); ob(6.5, 11.6, 0.3, 0.3);

  /* ── 光の すじ ── */
  const R = batch();
  for (let i = 0; i < 17; i += 1) {
    const x = -11 + i * 1.35 + (rnd() - 0.5) * 1.0, z = -27 - rnd() * 13, w = i % 3 === 0 ? 1.6 + rnd() * 1.6 : 0.35 + rnd() * 0.7, tilt = 0.18;
    const top = [x, 14, z], bot = [x - tilt * 14, 0, z + 0.5];
    const g = quad4([bot[0] - w / 2, bot[1], bot[2]], [bot[0] + w / 2, bot[1], bot[2]], [top[0] + w * 0.35, top[1], top[2]], [top[0] - w * 0.35, top[1], top[2]], [0, 0, 1, 1]);
    R.add('rays', g, 0xffffff, { aA: 0, aB: i });
  }
  for (let i = 0; i < 9; i += 1) {
    const z = -19 + i * 3.6 + (rnd() - 0.5) * 2, x = 22 + rnd() * 5, w = 0.4 + rnd() * 0.8;
    const g = quad4([x - 0.25, -0.4, z - w / 2], [x - 0.25, -0.4, z + w / 2], [x + 0.25, PG.waterline, z + w * 0.35], [x + 0.25, PG.waterline, z - w * 0.35], [0, 0, 1, 1]);
    R.add('rays', g, 0xffffff, { aA: 1, aB: i + 20 });
  }

  /* ── メッシュに する ── */
  const meshes = {};
  const hook = (m) => { m.onBeforeRender = camHook; return m; };
  const _inv = new THREE.Matrix4(), _sz = new THREE.Vector2();
  function camHook(renderer, scene, camera) { _inv.copy(group.matrixWorld).invert(); U.uCam.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv); renderer.getDrawingBufferSize(_sz); U.uH.value = _sz.y; }
  const put = (key, geo, mat, order = 0) => { if (!geo) return null; const m = hook(new THREE.Mesh(geo, mat)); m.name = `aqua-${key}`; m.renderOrder = order; m.frustumCulled = false; group.add(m); meshes[key] = m; return m; };
  const floorTex = floorTexture(), atlas = atlasTexture();
  put('tank', B.build('tank'), shader('tank', VBASIC, TANK_FRAG));
  put('prop', B.build('prop'), shader('prop', PROP_VERT, PROP_FRAG));
  put('card', B.build('card'), shader('card', CARD_VERT, CARD_FRAG));
  put('room', B.build('room'), shader('room', VBASIC, ROOM_FRAG));
  put('floor', B.build('floor'), shader('floor', VBASIC, FLOOR_FRAG, { uniforms: { uFloor: { value: floorTex }, uHasFloor: { value: floorTex ? 1 : 0 } } }));
  put('metal', B.build('metal'), shader('metal', VBASIC, METAL_FRAG));
  put('emis', B.build('emis'), Object.assign(new THREE.MeshBasicMaterial({ map: atlas || null, vertexColors: true, side: THREE.DoubleSide }), { name: 'aqua-emis' }));
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  put('rays', R.build('rays'), shader('rays', RAYS_VERT, RAYS_FRAG, { vertexColors: false, extra: add }), 1);
  put('glow', B.build('glow'), shader('glow', GLOW_VERT, GLOW_FRAG, { extra: add }), 4);
  put('glass', B.build('glass'), shader('glass', VBASIC, GLASS_FRAG, { extra: { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } }), 3);

  /* ── 魚 ── */
  const fishBase = fishGeometry();
  const fishList = [];
  const F0 = (o) => fishList.push({ G: o.ph * 3, br: 0, dr: 0, ...o });
  // ① イワシの 大きな むれ：みんな 同じ はやさ・位相は 1.3 rad の 中＝ひとかたまりで まわり、ふくらんだり ちぢんだり する
  for (let i = 0; i < 175; i += 1) { const u = rnd(), v = rnd(), w = rnd(); const off = [(u - 0.5) * 1.3, (v - 0.5) * 1.1, (w - 0.5) * 1.3];
    fishList.push({ c: [1.0 + off[0], 7.6 + off[1], -33.2 + off[2]], R: 4.4, Rz: 3.3, sp: 0.36, ph: rnd() * 1.3 + Math.pow(rnd(), 3) * 0.6, A: 0.7, k: 0, L: 0.25 + rnd() * 0.05, D: 0.85, Wd: 0.9, G: 0.8, br: 0.14, dr: 1.4 }); }
  // ② タカサゴの むれ（ぎゃくまわり・ひくい ところ）
  for (let i = 0; i < 110; i += 1) { const off = [(rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 1.2];
    fishList.push({ c: [-1.5 + off[0], 3.6 + off[1], -31.5 + off[2]], R: 3.6, Rz: 2.4, sp: -0.48, ph: rnd() * 1.1, A: 0.45, k: 9, L: 0.3 + rnd() * 0.05, D: 1.0, Wd: 0.8, G: 2.2, br: 0.12, dr: 1.0 }); }
  // ③ さんごの 魚（ひとりずつ）
  const reefSp = [1, 1, 2, 2, 3, 5, 5, 8, 7, 1, 2, 3];
  for (let i = 0; i < 52; i += 1) { const k = reefSp[i % reefSp.length], R0 = 0.6 + rnd() * 2.4, c = [-9 + rnd() * 18, 1.1 + rnd() * 3.6, -28.5 - rnd() * 9.5];
    F0({ c, R: R0, Rz: R0 * (0.5 + rnd() * 0.6), sp: (rnd() > 0.5 ? 1 : -1) * (0.25 + rnd() * 0.25) * 1.4 / (0.6 + R0 * 0.5), ph: rnd() * TAU, A: 0.2 + rnd() * 0.4, k, L: k === 3 ? 0.26 + rnd() * 0.05 : k === 7 ? 0.45 : 0.24 + rnd() * 0.08, D: 1.0, Wd: k === 7 ? 0.85 : 0.6 }); }
  // ④ クマノミ（いそぎんちゃくの まわりを 小さく）
  ANEMS.forEach(([x, y, z], i) => { for (let m = 0; m < (i % 2 ? 1 : 2); m += 1) F0({ c: [x, y + 0.35, z], R: 0.22 + rnd() * 0.12, Rz: 0.18, sp: (m ? -1 : 1) * (0.9 + rnd() * 0.4), ph: rnd() * TAU, A: 0.06, k: 6, L: 0.13, D: 1, Wd: 0.75 }); });
  // ⑤ ガラスの すぐ おくを よこぎる 大きな 魚（くっきり 見える）
  const near = [[7, 2.2], [8, 3.6], [3, 1.6], [1, 4.4], [7, 2.8], [8, 1.4], [5, 3.2], [3, 2.6], [1, 5.0], [7, 4.2]];
  near.forEach(([k, y], i) => F0({ c: [(rnd() - 0.5) * 2, y, -27.0 - rnd() * 0.6], R: 5 + rnd() * 3, Rz: 0.6 + rnd() * 0.6, sp: (i % 2 ? 1 : -1) * (0.09 + rnd() * 0.05), ph: rnd() * TAU, A: 0.25, k, L: k === 7 ? 0.95 : k === 8 ? 0.6 : 0.5, D: 1, Wd: k === 7 ? 0.9 : 0.6 }));
  // ⑥ アジの なかま（大きな 銀色・ゆるい むれ）
  for (let i = 0; i < 12; i += 1) { const R0 = 6.2 + rnd() * 1.0; fishList.push({ c: [0.5, 4.6 + rnd() * 1.6, -33.5], R: R0, Rz: R0 * 0.62, sp: -0.17, ph: 1.0 + rnd() * 0.7, A: 0.5, k: 4, L: 0.75 + rnd() * 0.2, D: 1.0, Wd: 0.8, G: 3.1, br: 0.05, dr: 0.8 }); }
  const NF = fishList.length;
  const fishGeo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aBody']) fishGeo.setAttribute(k, fishBase.attributes[k]);
  const iPath = new Float32Array(NF * 4), iPar = new Float32Array(NF * 4), iShape = new Float32Array(NF * 4), iX = new Float32Array(NF * 4);
  fishList.forEach((f, i) => { iPath.set([...f.c, f.R], i * 4); iPar.set([f.sp, f.ph, f.A, f.k], i * 4); iShape.set([f.Rz, f.L, f.D, f.Wd], i * 4); iX.set([f.G, f.br, f.dr, 0], i * 4); });
  fishGeo.setAttribute('aPath', new THREE.InstancedBufferAttribute(iPath, 4)); fishGeo.setAttribute('aPar', new THREE.InstancedBufferAttribute(iPar, 4)); fishGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(iShape, 4)); fishGeo.setAttribute('aX', new THREE.InstancedBufferAttribute(iX, 4));
  fishGeo.instanceCount = NF;
  const fishMat = shader('fish', FISH_VERT, FISH_FRAG, { vertexColors: false });
  const fish = put('fish', fishGeo, fishMat);

  // 大きな いきもの（エイ 2・カメ 1・サメ 2）：1 つの 形に まとめて、頂点に 道を もたせる。
  {
    const list = [];
    const one = (g, path, par, shape) => { const n = g.attributes.position.count; const a = new Float32Array(n * 4), b = new Float32Array(n * 4), c = new Float32Array(n * 4), x = new Float32Array(n * 4); for (let i = 0; i < n; i += 1) { a.set(path, i * 4); b.set(par, i * 4); c.set(shape, i * 4); x.set([par[1] * 3, 0, 0, 0], i * 4); } g.setAttribute('aPath', new THREE.BufferAttribute(a, 4)); g.setAttribute('aPar', new THREE.BufferAttribute(b, 4)); g.setAttribute('aShape', new THREE.BufferAttribute(c, 4)); g.setAttribute('aX', new THREE.BufferAttribute(x, 4)); list.push(g); };
    one(rayGeometry(), [0, 4.6, -34, 7.2], [0.085, 0.3, 1.1, 10], [5.2, 2.6, 1, 1]);
    one(rayGeometry(), [-1, 2.4, -33, 5.5], [-0.11, 2.4, 0.6, 10], [4.0, 1.7, 1, 1]);
    one(turtleGeometry(), [-3.5, 6.4, -31.5, 4.2], [0.12, 1.1, 0.9, 11], [3.0, 1.25, 1, 1]);
    one(sharkGeometry(), [0.5, 3.4, -35, 8.8], [0.095, 4.0, 0.6, 13], [5.6, 2.3, 1, 1]);
    one(sharkGeometry(), [0, 5.8, -34, 8.0], [-0.08, 1.7, 0.8, 13], [5.0, 1.9, 1, 1]);
    put('big', mergeAttrs(list, ['position', 'normal', 'aBody', 'aPath', 'aPar', 'aShape', 'aX']), fishMat);
  }

  /* ── ペンギン ── */
  {
    const base = penguinGeometry(), list = [];
    for (let i = 0; i < 15; i += 1) { const Rz = 7 + rnd() * 5; list.push({ c: [24.3 + (rnd() - 0.5) * 1.6, 0.85 + rnd() * 0.5, -4.5 + (rnd() - 0.5) * 6], R: 1.6 + rnd() * 1.4, Rz, sp: (rnd() > 0.4 ? 1 : -1) * (1.5 + rnd() * 0.8) / Rz, ph: rnd() * TAU, A: 0.25 + rnd() * 0.3, st: 0, s: 0.95 + rnd() * 0.15 }); }
    LEDGES.forEach(([x, T, z], i) => { const k = i % 3 === 1 ? 2 : 1; for (let m = 0; m < k; m += 1) list.push({ c: [x - 0.55 + m * 0.35 + (rnd() - 0.5) * 0.25, T - 0.02, z + (m - 0.5) * 0.55 + (rnd() - 0.5) * 0.3], R: -Math.PI / 2 + (rnd() - 0.5) * 2.0, Rz: 0, sp: 0, ph: rnd() * TAU, A: 0, st: 1, s: 0.95 + rnd() * 0.15 }); });
    const n = list.length, g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'aBody']) g.setAttribute(k, base.attributes[k]);
    const a = new Float32Array(n * 4), b = new Float32Array(n * 4), c = new Float32Array(n * 4);
    list.forEach((p, i) => { a.set([...p.c, p.R], i * 4); b.set([p.sp, p.ph, p.A, p.st], i * 4); c.set([p.Rz, p.s, 0, 0], i * 4); });
    g.setAttribute('aPath', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(b, 4)); g.setAttribute('aShape', new THREE.InstancedBufferAttribute(c, 4));
    g.instanceCount = n; put('penguins', g, shader('penguins', PENG_VERT, PENG_FRAG, { vertexColors: false }));
    // あわの すじ（およぐ ペンギンの うしろ）：同じ 道を すこし 前の 時間で なぞり、上へ のぼる
    const sw = list.filter((q) => !q.st), per = 22, tn = sw.length * per, tp = new Float32Array(tn * 3), ta = new Float32Array(tn * 4), tb = new Float32Array(tn * 4), tc = new Float32Array(tn * 4), tt = new Float32Array(tn * 4);
    sw.forEach((q, i) => { for (let k = 0; k < per; k += 1) { const j = i * per + k; ta.set([...q.c, q.R], j * 4); tb.set([q.sp, q.ph, q.A, 0], j * 4); tc.set([q.Rz, q.s, 0, 0], j * 4); tt.set([(k / per) * 1.7 + rnd() * 0.06, rnd() * TAU, 0.018 + rnd() * 0.03, (rnd() - 0.5) * 0.12], j * 4); } });
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aPath', new THREE.BufferAttribute(ta, 4)); tg.setAttribute('aPar', new THREE.BufferAttribute(tb, 4)); tg.setAttribute('aShape', new THREE.BufferAttribute(tc, 4)); tg.setAttribute('aT', new THREE.BufferAttribute(tt, 4));
    const trail = hook(new THREE.Points(tg, shader('trail', TRAIL_VERT, DOTS_FRAG, { vertexColors: false, extra: add }))); trail.name = 'aqua-trail'; trail.frustumCulled = false; trail.renderOrder = 2; group.add(trail); meshes.trail = trail;
  }

  /* ── クラゲ ── */
  {
    const base = jellyGeometry(), n = 11, g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'aJ']) g.setAttribute(k, base.attributes[k]);
    const a = new Float32Array(n * 4); for (let i = 0; i < n; i += 1) { const r = Math.sqrt(rnd()) * 0.42, t = rnd() * TAU; a.set([Math.cos(t) * r, Math.sin(t) * r, 0.6 + rnd() * 0.5, i * 0.83 + rnd()], i * 4); }
    g.setAttribute('iJ', new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = n;
    put('jelly', g, shader('jelly', JELLY_VERT, JELLY_FRAG, { vertexColors: false, extra: add }), 2);
  }

  /* ── 粒・あわ ── */
  let dots;
  {
    const n0 = 1400, n1 = 520, n2 = 90, n = n0 + n1 + n2, pos = new Float32Array(n * 3), ap = new Float32Array(n * 4);
    for (let i = 0; i < n0; i += 1) { pos.set([-13 + rnd() * 26, rnd() * 14.4, -26 - rnd() * 17], i * 3); ap.set([0, 0.03 + rnd() * 0.05, 0.02 + rnd() * 0.035, rnd() * TAU], i * 4); }
    // あわの 柱（ペンギンの 水そう）＋ ばらばらの あわ
    const cols = [[22.5, -16], [25.5, -9], [22, -1], [26, 6], [23, 9.5]];
    for (let i = 0; i < n1; i += 1) { const k = i % 6, c = cols[i % cols.length], j = n0 + i; if (k < 4) pos.set([c[0] + (rnd() - 0.5) * 0.25, rnd() * 2.55, c[1] + (rnd() - 0.5) * 0.25], j * 3); else pos.set([20.6 + rnd() * 7, rnd() * 2.55, -20 + rnd() * 31], j * 3); ap.set([1, 0.35 + rnd() * 0.5, 0.025 + rnd() * 0.04, rnd() * TAU], j * 4); }
    for (let i = 0; i < n2; i += 1) { const j = n0 + n1 + i, r = Math.sqrt(rnd()) * 0.7, t = rnd() * TAU; pos.set([J.x + Math.cos(t) * r, rnd() * 3.2, J.z + Math.sin(t) * r], j * 3); ap.set([2, 0.15 + rnd() * 0.25, 0.012 + rnd() * 0.02, rnd() * TAU], j * 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(ap, 4));
    dots = hook(new THREE.Points(g, shader('dots', DOTS_VERT, DOTS_FRAG, { vertexColors: false, extra: add }))); dots.name = 'aqua-dots'; dots.frustumCulled = false; dots.renderOrder = 2; group.add(dots); meshes.dots = dots;
  }

  /* ── 人（こども と おとな） ── */
  {
    const base = humanGeometry();
    const BAL = AQUARIUM.hall.balcony, PI = Math.PI;
    // [x, y, z, 向き, 大きさ, 右うで, 左うで, まえかがみ, 上むき, かみ(0 みじかい 1 ながい), うでを ひらく]
    const P = [
      // ホール（まどの 前）：ゆびさす 子・手を のばす 子・写真を とる 人・親子
      [-1.4, 0, -20.2, PI, 0.66, 2.05, 0.15, 0, 0.42, 1, 0.1], [-0.8, 0, -20.7, PI + 0.1, 0.58, 2.6, 2.5, 0, 0.5, 0, 0.18], [-1.9, 0, -19.4, PI + 0.15, 1.02, 0.15, 0.35, 0, 0.25, 1, 0.05],
      [1.9, 0, -19.6, PI - 0.15, 0.72, 0.2, 0.1, 0, 0.35, 0, 0.05], [2.5, 0, -19.1, PI - 0.25, 1.06, 1.45, 1.4, 0, 0.3, 0, -0.12], [3.3, 0, -20.9, PI - 0.3, 0.98, 0.1, 0.12, 0, 0.3, 1, 0.04],
      [-4.6, 0, -21.4, PI + 0.3, 0.62, 1.9, 0.1, 0.04, 0.5, 1, 0.1], [-3.6, 0, -18.0, PI + 0.2, 1.0, 0.05, 0.1, 0, 0.18, 0, 0.04], [5.6, 0, -18.5, PI - 0.5, 0.74, 0.1, 0.2, 0, 0.3, 0, 0.05],
      [0.4, 0, -16.4, PI + 0.05, 0.95, 0.2, 0.1, 0, 0.2, 1, 0.04], [-6.4, 0, -15.5, PI + 0.6, 1.04, 0.1, 0.1, 0, 0.15, 0, 0.05],
      // バルコニー（手すりに もたれる）
      [-10.0, BAL, -15, PI / 2 + 0.6, 1.0, 0.9, 0.85, 0.12, 0.2, 0, 0.1], [-9.4, BAL, -13.8, PI / 2 + 0.6, 0.7, 1.9, 0.6, 0.06, 0.4, 1, 0.1], [9.6, BAL, -9, -PI / 2 - 0.6, 0.98, 0.85, 0.9, 0.12, 0.2, 1, 0.1], [9.9, BAL, -11, -PI / 2 - 0.5, 1.03, 0.1, 0.1, 0, 0.2, 0, 0.05],
      // ろうか（手すりに もたれる 子・ゆびさす 子・うしろの 大人）
      [18.85, 0, 6.2, PI / 2, 0.7, 1.05, 1.0, 0.12, 0.1, 1, 0.1], [18.85, 0, 5.4, PI / 2 - 0.2, 0.64, 1.9, 0.3, 0.08, 0.25, 0, 0.12], [18.8, 0, 0.8, PI / 2, 0.76, 1.0, 1.05, 0.12, 0.05, 0, 0.1], [17.6, 0, 1.6, PI / 2 + 0.3, 1.0, 0.1, 0.3, 0, 0.05, 1, 0.05],
      [18.85, 0, -4.4, PI / 2 + 0.1, 0.62, 2.3, 2.2, 0.05, 0.45, 1, 0.15], [18.85, 0, -9.8, PI / 2, 0.72, 0.95, 1.0, 0.12, 0.1, 0, 0.1], [18.3, 0, -10.6, PI / 2 - 0.4, 1.03, 0.15, 0.1, 0, 0.05, 0, 0.05], [18.0, 0, -3.6, PI / 2 + 0.2, 1.05, 1.5, 1.45, 0, 0.1, 1, -0.1],
      // 入口（親子・うけつけの 人・ならぶ 人）
      [1.2, 0, 21.5, PI + 0.2, 1.0, 0.1, 0.45, 0, 0.05, 1, 0.06], [0.6, 0, 21.2, PI + 0.2, 0.64, 0.5, 0.1, 0, 0.15, 0, 0.06], [-4.8, 0, 17.6, 0.9, 0.98, 0.3, 0.3, 0.05, 0, 0, 0.05], [-6.6, 0, 18.5, PI / 2 + 0.5, 1.0, 0.6, 0.55, 0, -0.05, 1, 0.08],
      [-2.4, 0, 19.6, PI - 0.4, 1.02, 0.1, 0.1, 0, 0.1, 0, 0.05], [-2.0, 0, 20.1, PI - 0.2, 0.7, 0.1, 1.2, 0, 0.3, 1, 0.06],
    ];
    const n = P.length, m = new THREE.InstancedMesh(base, shader('people', PEOPLE_VERT, PEOPLE_FRAG, { vertexColors: false }), n);
    const at = () => new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const A = { iSkin: at(), iTop: at(), iBot: at(), iHair: at() }, pose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), pose2 = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const SKIN = [0xf1c7a5, 0xe0ac85, 0xc68a62, 0x9c6644, 0xf5d3b8, 0xe8b894, 0x7a4a30], TOPC = [0xe8e6e0, 0x2b3550, 0xc23a3a, 0x3f6b55, 0xe0a030, 0x5a6aa0, 0xd9a3a8, 0x222326, 0x7fb0d8, 0xf0d040, 0x8a5a9a, 0xf2f0ea, 0xe06a40];
    const BOTC = [0x3b4e6e, 0x262f42, 0x1f2022, 0xb49f7a, 0x55585c, 0x2f3238, 0x6a3a3a, 0x8a3a5a], HAIR = [0x1c1512, 0x2e2018, 0x4a3324, 0x6b4a2e, 0x161210, 0xa07848];
    const o = new THREE.Object3D(), cc = new THREE.Color(), pick = (arr) => cc.setHex(arr[Math.floor(rnd() * arr.length)]);
    P.forEach(([x, y, z, ry, sc, ra, la, lean, up, hair, ab], i) => {
      o.position.set(x, y, z); o.rotation.set(0, ry, 0, 'YXZ'); o.scale.set(sc * (0.95 + rnd() * 0.1), sc * (0.97 + rnd() * 0.06), sc); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      A.iSkin.setXYZ(i, ...pick(SKIN).toArray()); A.iTop.setXYZ(i, ...pick(TOPC).toArray()); A.iBot.setXYZ(i, ...pick(BOTC).toArray()); A.iHair.setXYZ(i, ...pick(HAIR).toArray());
      pose.setXYZW(i, ra, sc < 0.8 ? 1.25 : 1.0, rnd() * 6, hair); pose2.setXYZW(i, la, ab, up, lean);
    });
    for (const [k, a] of Object.entries(A)) m.geometry.setAttribute(k, a); m.geometry.setAttribute('iPose', pose); m.geometry.setAttribute('iPose2', pose2);
    hook(m); m.name = 'aqua-people'; m.frustumCulled = false; group.add(m); meshes.people = m;
  }

  /* ── 数 ── */
  let tris = 0, calls = 0;
  group.traverse((o) => { if (!(o.isMesh || o.isPoints)) return; calls += 1; if (o.isPoints) return; const g = o.geometry, base = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += base * (o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1); });
  const buildMs = +(now() - t0).toFixed(1);
  group.userData.aquarium = { buildMs, tris, calls };

  const full = { fish: NF, dots: dots.geometry.attributes.position.count };
  return {
    group, obstacles, meshes, triangles: Math.round(tris), drawCalls: calls, buildMs,
    entrance: { ...AQUARIUM.entrance },
    zones: { window: { x: 0, z: -21 }, penguins: { x: 17.4, z: -4 } },
    update(t) { U.uTime.value = t; },
    setQuality(q) { const low = q === 'low'; fishGeo.instanceCount = low ? Math.round(full.fish * 0.5) : full.fish; dots.geometry.setDrawRange(0, low ? Math.round(full.dots * 0.5) : full.dots); if (meshes.glow) meshes.glow.visible = !low; if (meshes.trail) meshes.trail.visible = !low; },
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); },
  };
}
