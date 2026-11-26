// かぐの リアルな 3D モデル（かぐ屋の 50 の 形：前からの 31・2026-11 の おわりの 22。スタイルちがいは furniture-data.js）。マイルーム（room-world.js）と かぐ屋の カードの 絵が 使う。
//
// ・モデルの ファイルは 読まない：まるい 角の クッション（Extrude）・ろくろで ひいた 脚（Lathe）・つつ・球と、
//   canvas で かいた もよう（木目・ぬの・ラグ・時計の 文字ばん・テレビの 画面・けんばん・本の せ）。
// ・**大きさは town.json の w × d マスの まま**（サーバーが 同じ 数で 判定する）。モデルは まんなかが 原点・底が y = 0・
//   うしろが −z。むきは 置く がわ（room-world.js）が 90° ずつ 回す。
// ・重く しない：1 しゅるいを 1 回だけ 組み立て、**材質ごとに 1 つの 形に まとめて** おぼえる（かぐ 1 つ＝数回の 描画）。
//   置く たびに 作るのは 入れ物（Group）だけで、形と 材質は みんなで つかう。光は 足さない（ランプ・画面は emissive）。
// ・絵が かけない とき（検査の Node など）は 色だけの 材質に なる。形は そのまま。
import * as THREE from './three.module.js';
import { styleById, designById } from './furniture-data.js';

// ---- もよう（1 回 かいて おぼえる） ---------------------------------------------------

const texCache = new Map();
function tex(key, w, h, paint, repeat = false, times = 1) {
  if (texCache.has(key)) return texCache.get(key);
  let t = null;
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (times !== 1) t.repeat.set(times, times); }
  } catch { t = null; }
  texCache.set(key, t);
  return t;
}
const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
const hexCss = (hex, f = 1, a = 1) => `rgba(${[16, 8, 0].map((n) => Math.max(0, Math.min(255, Math.round(((hex >> n) & 255) * f)))).join(',')},${a})`;
const tint = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();

// 木目：白に 近い 地に 茶色の すじ。材質の 色と かけ算 するので、どの 色の 木にも 使える。すじは u（よこ）むき。
const woodTex = () => tex('wood', 128, 128, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = '#f4ece2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i += 1) {
    const y = r() * h, amp = 0.5 + r() * 2.5, ph = r() * 6, k = 0.5 + r() * 1.5;
    g.strokeStyle = `rgba(${90 + r() * 50},${60 + r() * 40},${36 + r() * 30},${0.1 + r() * 0.22})`; g.lineWidth = 0.5 + r() * 1.3;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) { const py = y + Math.sin((x / w) * Math.PI * 2 * Math.round(k) + ph) * amp; if (x) g.lineTo(x, py); else g.moveTo(x, py); }
    g.stroke();
  }
  for (let i = 0; i < 2; i += 1) {
    const x = 20 + r() * 88, y = 20 + r() * 88;
    for (let q = 4; q > 0; q -= 1) { g.strokeStyle = 'rgba(96,62,36,.26)'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(x, y, q * 3.4, q * 1.5, 0, 0, Math.PI * 2); g.stroke(); }
  }
}, true);

// ぬの：たてよこの 織り目。これも 白に 近く、色と かけ算。
const fabricTex = () => tex('fabric', 64, 64, (g, w, h) => {
  const r = rng(23);
  g.fillStyle = '#f1efec'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const v = ((x / 2 + y / 2) % 2 ? 228 : 250) + (r() - 0.5) * 22;
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 40; i += 1) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(r() * w, r() * h, 3 + r() * 5, 1); }
}, true);

// ラグ：ふち・内がわの わく・まんなかの ひし形。色は その ラグの 色。
const rugTex = (c) => tex(`rug:${c}`, 256, 256, (g, w, h) => {
  const r = rng(31);
  const cream = '#f1e3c4', deep = hexCss(c, 0.55), mid = hexCss(c), light = hexCss(c, 1.3);
  g.fillStyle = deep; g.fillRect(0, 0, w, h);
  g.fillStyle = cream; g.fillRect(12, 12, w - 24, h - 24);
  g.fillStyle = mid; g.fillRect(20, 20, w - 40, h - 40);
  // ふちの くりかえし もよう。
  for (let i = 0; i < 12; i += 1) {
    const t = 30 + i * ((w - 60) / 11);
    for (const [x, y] of [[t, 32], [t, h - 32], [32, t], [w - 32, t]]) { g.fillStyle = cream; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill(); }
  }
  g.strokeStyle = deep; g.lineWidth = 3; g.strokeRect(44, 44, w - 88, h - 88);
  g.fillStyle = hexCss(c, 0.82); g.fillRect(46, 46, w - 92, h - 92);
  // まんなかの メダル。
  const cx = w / 2, cy = h / 2;
  for (const [s, col] of [[78, deep], [68, cream], [56, light], [36, deep], [24, cream], [10, mid]]) { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); g.fill(); }
  for (const [x, y] of [[70, 70], [w - 70, 70], [70, h - 70], [w - 70, h - 70]]) { g.fillStyle = cream; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = deep; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  // 織り目の ざらつき。
  for (let i = 0; i < 5000; i += 1) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.07)'; g.fillRect(r() * w, r() * h, 2, 1); }
});

// 時計の 文字ばん。
const clockTex = (c) => tex(`clock:${c}`, 128, 128, (g, w) => {
  const m = w / 2;
  g.fillStyle = hexCss(c, 1.08); g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  const sh = g.createRadialGradient(m, m, m * 0.5, m, m, m); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(90,60,20,.28)');
  g.fillStyle = sh; g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2b2118'; g.lineCap = 'round';
  for (let i = 0; i < 60; i += 1) {
    const a = i * Math.PI / 30, big = i % 5 === 0, r0 = m * (big ? 0.76 : 0.84), r1 = m * 0.9;
    g.lineWidth = big ? 3.4 : 1; g.beginPath(); g.moveTo(m + Math.sin(a) * r0, m - Math.cos(a) * r0); g.lineTo(m + Math.sin(a) * r1, m - Math.cos(a) * r1); g.stroke();
  }
  // 10 時 10 分。
  const hand = (a, len, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(m - Math.sin(a) * 6, m + Math.cos(a) * 6); g.lineTo(m + Math.sin(a) * len, m - Math.cos(a) * len); g.stroke(); };
  hand(-Math.PI / 3 + 0.09, m * 0.46, 5); hand(Math.PI / 3, m * 0.68, 3.4);
  g.fillStyle = '#b8862e'; g.beginPath(); g.arc(m, m, 5, 0, Math.PI * 2); g.fill();
});

// テレビの 画面：空・山・おひさま（ついて いる 画面）。
const tvTex = () => tex('tv', 256, 128, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5fb4ea'); sky.addColorStop(0.7, '#cdeeff'); sky.addColorStop(1, '#fff3cf');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff7c2'; g.beginPath(); g.arc(w * 0.74, h * 0.3, 16, 0, Math.PI * 2); g.fill();
  for (const [x, y, s] of [[50, 30, 1], [120, 22, 0.7]]) { g.fillStyle = 'rgba(255,255,255,.9)'; for (const [dx, rr] of [[0, 10], [12, 13], [26, 9]]) { g.beginPath(); g.arc(x + dx * s, y, rr * s, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = '#6fae7e'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 86); g.lineTo(60, 52); g.lineTo(120, 90); g.lineTo(170, 62); g.lineTo(w, 96); g.lineTo(w, h); g.closePath(); g.fill();
  g.fillStyle = '#4c9460'; g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w * 0.3, 78, w * 0.6, 108); g.quadraticCurveTo(w * 0.85, 92, w, 104); g.lineTo(w, h); g.closePath(); g.fill();
  // ガラスの うつりこみ。
  g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.18, h); g.lineTo(0, h); g.closePath(); g.fill();
});

// ピアノの けんばん（白 14・黒は 2 つ 3 つの ならび）。
const keysTex = () => tex('keys', 256, 64, (g, w, h) => {
  g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, w, h);
  const n = 21, kw = w / n;
  for (let i = 0; i <= n; i += 1) { g.fillStyle = 'rgba(40,36,30,.55)'; g.fillRect(i * kw - 0.5, 0, 1, h); }
  g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, h - 4, w, 4);
  for (let i = 0; i < n; i += 1) { if ([0, 1, 3, 4, 5].includes(i % 7)) { g.fillStyle = '#15151a'; g.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.62); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect((i + 1) * kw - kw * 0.2, 2, kw * 0.14, h * 0.5); } }
});

// 本の せ：高さも 色も ばらばら。うしろは 暗い（たなの おく）。
const booksTex = () => tex('books', 256, 128, (g, w, h) => {
  const r = rng(47);
  g.fillStyle = '#1c130d'; g.fillRect(0, 0, w, h);
  const cols = [0xc4553f, 0x3f6ac4, 0xd0a02c, 0x4aa06a, 0x8b5fb0, 0xe8dcc0, 0x2f4f5f, 0xb0523a, 0x7a8f3a, 0xd98a9a, 0x35568a, 0xe0b46a];
  let x = 0;
  while (x < w) {
    const bw = 9 + r() * 12, bh = h * (0.68 + r() * 0.3), c = cols[Math.floor(r() * cols.length)];
    const gr = g.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, hexCss(c, 0.7)); gr.addColorStop(0.3, hexCss(c, 1.12)); gr.addColorStop(1, hexCss(c, 0.6));
    g.fillStyle = gr; g.fillRect(x, h - bh, bw - 0.8, bh);
    g.fillStyle = 'rgba(255,240,200,.75)'; g.fillRect(x + 1.5, h - bh + 8 + r() * 10, bw - 4, 2.2);
    if (r() < 0.6) g.fillRect(x + 1.5, h - 16 - r() * 8, bw - 4, 1.6);
    if (r() < 0.4) { g.fillStyle = 'rgba(20,20,20,.5)'; g.fillRect(x + bw * 0.3, h - bh * 0.62, bw * 0.3, bh * 0.3); }
    x += bw;
  }
  // いちばん 下の 帯は 紙の 色：本の 上・よこの 面が ここを 使う。
  g.fillStyle = '#e9dfc8'; g.fillRect(0, h - 6, w, 6);
}, true);

const booksMat = () => { const bt = booksTex(); return M('books', () => std({ color: bt ? 0xffffff : 0xb0523a, map: bt, roughness: 0.8 })); };

// ---- 材質（色＋しゅるいごとに 1 つ） ----------------------------------------------------

const mats = new Map();
function M(key, make) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key);
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o });
const wood0 = (c, rough = 0.6) => M(`wood:${c}:${rough}`, () => std({ color: c, map: woodTex(), roughness: rough }));
const cloth0 = (c) => M(`cloth:${c}`, () => std({ color: c, map: fabricTex(), roughness: 0.96 }));
const flat = (c, rough = 0.7, extra = null) => M(`flat:${c}:${rough}:${extra ? JSON.stringify(extra) : ''}`, () => std({ color: c, roughness: rough, ...extra }));
// 金ぞく：この 部屋には うつりこむ 空が ないので、metalness は ひかえめ（高いと まっ黒に なる）。
const brass0 = () => M('brass', () => std({ color: 0xd4a84a, roughness: 0.3, metalness: 0.35 }));
// スタイルの きんぞく：へやには うつりこむ 空が ないので metalness を 下げ、その 色で 少し 光らせる（金が からし色に しずまない ように）。
const metalMat = (c) => M(`metal:${c}`, () => std({ color: c, roughness: 0.3, metalness: 0.2, emissive: c, emissiveIntensity: 0.2 }));
const glow = (c, k, map = null) => M(`glow:${c}:${k}:${map ? map.uuid : ''}`, () => std({ color: map ? 0x111111 : c, emissive: map ? 0xffffff : c, emissiveMap: map, emissiveIntensity: k, roughness: 0.5 }));

// ---- スタイル（2026-11 の おわり：かぐ 1000 しゅるい） ------------------------------------
// あたらしい 品は「形 × スタイル」（furniture-data.js）。組み立てて いる 間だけ LOOK に スタイルが 入り、
// 下の wood()・cloth()・brass() などが **その スタイルの 素材に 読みかえる**（わく＝木の しゅるい／ぬり／きんぞく、ぬの＝色と もよう、
// かなぐ＝金・銀…）。前から ある 31 しゅるいは LOOK が null の まま＝材質も 色も 前と 1 つも かわらない。
let LOOK = null;        // いま 組み立てて いる 品の スタイル（furniture-data.js の FURNITURE_STYLES の 1 つ）
let REF_FAB = 0;        // ぬのが 主役の 形：builder に わたした 色（こい・うすいを その 色との 比で 決める）
let REF_WOOD = 0;       // 木が 主役の 形：同じく

const lum = (hex) => (((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11) / 255;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const q20 = (f) => Math.round(f * 20) / 20;

// もよう（スタイルごとに 1 まい。どの かぐも 同じ 1 まいを つかう）。128 × 128・くりかえし（1 まい＝0.5 m）。
function patTex(S) {
  if (!S || !S.pat || S.pat === 'plain') return null;
  const A = hexCss(S.fab), B = hexCss(S.pat2 ?? 0xffffff), C = hexCss(S.pat3 ?? 0x6fae6a);
  return tex(`pat:${S.id}`, 128, 128, (g, w, h) => {
    const r = rng(101 + S.id.length * 7);
    g.fillStyle = A; g.fillRect(0, 0, w, h);
    const heart = (x, y, s) => { g.beginPath(); for (let i = 0; i <= 30; i += 1) { const t = (i / 30) * Math.PI * 2, px = 16 * Math.sin(t) ** 3, py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); if (i) g.lineTo(x + px / 17 * s, y - py / 17 * s); else g.moveTo(x + px / 17 * s, y - py / 17 * s); } g.closePath(); g.fill(); };
    const star = (x, y, R, rot = 0) => { g.beginPath(); for (let i = 0; i < 10; i += 1) { const a = i * Math.PI / 5 + rot, qq = i % 2 ? R * 0.45 : R; if (i) g.lineTo(x + Math.sin(a) * qq, y - Math.cos(a) * qq); else g.moveTo(x + Math.sin(a) * qq, y - Math.cos(a) * qq); } g.closePath(); g.fill(); };
    const weave = (k = 0.05) => { for (let i = 0; i < 1400; i += 1) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${k})` : `rgba(255,255,255,${k})`; g.fillRect(r() * w, r() * h, 2, 1); } };
    if (S.pat === 'stripe') {
      g.fillStyle = B; for (let x = 0; x < w; x += 64) g.fillRect(x + 32, 0, 32, h);
      g.fillStyle = hexCss(S.pop ?? 0xe2463c, 1, 0.9); for (let x = 0; x < w; x += 64) g.fillRect(x + 46, 0, 4, h);
      weave();
    } else if (S.pat === 'check') {
      g.fillStyle = B; g.fillRect(0, 0, w, h);
      g.fillStyle = hexCss(S.fab, 1, 0.5); for (let i = 0; i < 4; i += 2) { g.fillRect(i * 32, 0, 32, h); g.fillRect(0, i * 32, w, 32); }
      weave(0.06);
    } else if (S.pat === 'dot') {
      g.fillStyle = B; for (const [x, y] of [[32, 32], [96, 96], [96, 32], [32, 96]]) { g.beginPath(); g.arc(x, y, (x + y) % 128 === 64 ? 15 : 8, 0, Math.PI * 2); g.fill(); }
      weave(0.035);
    } else if (S.pat === 'floral') {
      const flower = (x, y, R, col) => { g.fillStyle = col; for (let k = 0; k < 5; k += 1) { const a = k * 1.2566; g.beginPath(); g.ellipse(x + Math.sin(a) * R * 0.62, y - Math.cos(a) * R * 0.62, R * 0.5, R * 0.42, a, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#f7d774'; g.beginPath(); g.arc(x, y, R * 0.32, 0, Math.PI * 2); g.fill(); };
      g.fillStyle = C; for (const [x, y, a] of [[52, 52, 0.7], [12, 18, -0.6], [116, 116, 0.8], [76, 80, 2.4], [112, 44, -1.9], [20, 84, 2.2]]) { g.beginPath(); g.ellipse(x, y, 11, 5, a, 0, Math.PI * 2); g.fill(); }
      flower(32, 32, 19, B); flower(96, 98, 19, B); flower(98, 26, 10, hexCss(S.pat2, 1.25)); flower(30, 100, 10, hexCss(S.pat2, 1.25));
      weave(0.03);
    } else if (S.pat === 'denim') {
      for (let i = -h; i < w; i += 4) { g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
      for (let i = 0; i < 900; i += 1) { g.fillStyle = r() < 0.6 ? 'rgba(255,255,255,.1)' : 'rgba(10,20,50,.16)'; g.fillRect(r() * w, r() * h, 1, 2 + r() * 5); }
      g.strokeStyle = B; g.lineWidth = 2.4; g.setLineDash([7, 5]); for (const y of [20, 84]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.setLineDash([]);
    } else if (S.pat === 'velvet') {
      for (let i = 0; i < 26; i += 1) { const x = r() * w, y = r() * h, R = 14 + r() * 26, gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, r() < 0.55 ? 'rgba(255,200,220,.2)' : 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); }
      for (let i = 0; i < 700; i += 1) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(r() * w, r() * h, 1, 3); }
    } else if (S.pat === 'heart') {
      g.fillStyle = B; heart(32, 34, 17); heart(96, 98, 17);
      g.fillStyle = hexCss(S.fab, 0.82); heart(96, 32, 8); heart(32, 96, 8);
      weave(0.03);
    } else if (S.pat === 'star') {
      g.fillStyle = B; star(32, 32, 15, 0.2); star(96, 96, 15, -0.2);
      g.fillStyle = hexCss(S.fab, 1.18); star(96, 30, 8); star(30, 98, 8);
      g.fillStyle = B; for (const [x, y] of [[64, 12], [8, 64], [64, 118], [122, 60], [64, 64]]) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }
      weave(0.03);
    } else if (S.pat === 'wave') {
      const band = (y0, amp, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); for (let x = -4; x <= w + 4; x += 4) { const y = y0 + Math.sin((x / w) * Math.PI * 4) * amp; if (x > -4) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
      g.fillStyle = hexCss(S.fab, 1.3); g.fillRect(0, 64, w, 64);
      for (let k = 0; k < 4; k += 1) { band(k * 32 + 10, 6, B, 5); band(k * 32 + 24, 5, hexCss(S.fab, 0.7), 3); }
      weave(0.03);
    } else if (S.pat === 'leaf') {
      const leaf = (x, y, a, L, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * 0.62, L, 0); g.quadraticCurveTo(0, L * 0.62, -L, 0); g.fill(); g.strokeStyle = hexCss(S.fab, 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); g.restore(); };
      for (const [x, y, a, L, k] of [[30, 28, 0.6, 20, 0], [94, 92, 0.6, 20, 0], [92, 32, -0.8, 15, 1], [30, 96, -0.8, 15, 1], [62, 62, 1.5, 11, 2], [118, 120, 0.2, 9, 2], [6, 62, 2.4, 9, 1]]) leaf(x, y, a, L, k === 0 ? B : k === 1 ? hexCss(S.pat2, 0.78) : hexCss(S.fab, 1.45));
      weave(0.04);
    } else if (S.pat === 'candy') {
      const cols = [B, A, C, A, '#f7d774', A, '#8fc7f0', A];
      for (let k = -8; k < 16; k += 1) { g.fillStyle = cols[((k % 8) + 8) % 8]; g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16 + 16, 0); g.lineTo(k * 16 + 16 - h, h); g.lineTo(k * 16 - h, h); g.closePath(); g.fill(); }
      weave(0.025);
    } else if (S.pat === 'checker') {
      g.fillStyle = B; for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32);
      weave(0.03);
    } else if (S.pat === 'royal') {
      g.strokeStyle = hexCss(S.pat2, 1, 0.5); g.lineWidth = 1.6;
      for (let k = -2; k < 4; k += 1) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + h, h); g.stroke(); g.beginPath(); g.moveTo(k * 64 + h, 0); g.lineTo(k * 64, h); g.stroke(); }
      g.fillStyle = B;
      for (const [x, y] of [[32, 32], [96, 96]]) { g.beginPath(); g.moveTo(x, y - 15); g.quadraticCurveTo(x + 4, y - 4, x + 13, y); g.quadraticCurveTo(x + 4, y + 4, x, y + 15); g.quadraticCurveTo(x - 4, y + 4, x - 13, y); g.quadraticCurveTo(x - 4, y - 4, x, y - 15); g.fill(); }
      for (const [x, y] of [[96, 32], [32, 96], [0, 0], [64, 64], [127, 127], [0, 127], [127, 0]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 500; i += 1) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(r() * w, r() * h, 1, 3); }
    }
  }, true, 2);
}

// わくの 素材：木目・ぬり・きんぞく。shade＝こい（<1）・うすい（>1）。
function frameMat(shade = 1, rough = 0.6) {
  const c = tint(LOOK.wood, shade);
  if (LOOK.wk === 'metal') return metalMat(c);
  if (LOOK.wk === 'paint') return flat(c, 0.5);
  return wood0(c, rough);
}
// ぬの：もようの ある スタイルは もようの 絵（色は 絵の 中）、ない スタイルは 色＋織り目。
function fabricMat(shade = 1, double = false) {
  const S = LOOK, t = patTex(S);
  if (!t && S.satin) { const c = tint(S.fab, shade); return M(`satin:${c}:${double ? 2 : 1}`, () => std({ color: c, map: fabricTex(), roughness: 0.42, metalness: 0.3, side: double ? THREE.DoubleSide : THREE.FrontSide })); }
  if (!t) return double ? drape0(tint(S.fab, shade)) : cloth0(tint(S.fab, shade));
  const k = Math.min(1, shade), grey = new THREE.Color(k, k, k).getHex();
  return M(`fab:${S.id}:${k}:${double ? 2 : 1}`, () => std({ color: grey, map: t, roughness: S.pat === 'velvet' ? 1 : 0.93, side: double ? THREE.DoubleSide : THREE.FrontSide }));
}
const fabShade = (c) => (REF_FAB ? q20(clamp(lum(c) / Math.max(0.05, lum(REF_FAB)), 0.7, 1.3)) : 1);
const woodShade = (c) => q20(REF_WOOD ? clamp(lum(c) / Math.max(0.05, lum(REF_WOOD)), 0.6, 1.15) : clamp(0.5 + lum(c) * 0.95, 0.74, 1.1));

// builder が よぶ 素材。LOOK が ない（前からの 31 しゅるい）ときは 前と 同じ もの。
const wood = (c, rough = 0.6) => (LOOK ? frameMat(woodShade(c), rough) : wood0(c, rough));
const cloth = (c) => (LOOK ? fabricMat(fabShade(c)) : cloth0(c));
const linen = (c) => cloth0(c);                                   // シーツ・まくら：どの スタイルでも 白い ぬの
const pop = (c) => cloth0(LOOK ? LOOK.pop : c);                   // さし色（クッション・リボン）
const brass = () => (LOOK ? metalMat(LOOK.metal) : brass0());
const frame = (c, rough = 0.45) => (LOOK ? frameMat(woodShade(c), rough) : flat(c, rough));   // ぬった わく（白い ベッド・かがみ）
// ぬった 本体（ピアノ・れいぞうこ・おもちゃばこ）。もようの スタイルは 本体に もようを ぬる。
function body(c, rough = 0.5) {
  if (!LOOK) return flat(c, rough);
  const S = LOOK;
  if (S.mk === 'wood') return wood0(S.main, 0.5);
  if (S.mk === 'metal') return metalMat(S.main);
  const t = S.mk === 'pattern' ? patTex(S) : null;
  if (!t) return flat(S.main, rough);
  return M(`bodypat:${S.id}:${rough}`, () => std({ color: 0xffffff, map: t, roughness: Math.max(0.3, rough) }));
}
// 光る かさ（ランプ）。もようの スタイルは もようが すけて 光る。
function shadeMat(c, k, kind) {
  const t = LOOK ? patTex(LOOK) : null;
  if (t) return M(`${kind}:pat:${LOOK.id}`, () => std({ color: 0xffffff, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: k * 0.62, roughness: 0.9, side: THREE.DoubleSide }));
  return M(`${kind}:${c}`, () => std({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.9, side: THREE.DoubleSide }));
}
const drapeMat = (c) => (LOOK ? fabricMat(fabShade(c), true) : drape0(c));
// まるい 形（つつ・ろくろ・球）の UV を メートルに する：もようが のびない ように（LOOK の ときだけ。前からの 品は そのまま）。
function metric(g, around, along) {
  if (!LOOK) return g;
  const uv = g.attributes.uv, su = Math.max(0.5, Math.round(around * 2) / 2), sv = Math.max(0.25, along);
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// ---- 形の 部品 ------------------------------------------------------------------------

// 組み立て中の 入れ物。add で 1 つずつ 足して、さいごに bake で 材質ごとに まとめる。
function kit() {
  const root = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, into = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); into.add(m); return m; };

  // 箱。木目が 長い ほうに 流れる ように UV を 面の 大きさで のばし、たてに 長い ものは 90° まわす。
  const box = (w, h, d, mat, x, y, z, { plain = false } = {}) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (!plain) {
      const uv = g.attributes.uv, tall = h > Math.max(w, d);
      const span = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i += 1) {
        const [su, sv] = span[Math.floor(i / 4)], u = uv.getX(i) * su, v = uv.getY(i) * sv;
        if (tall) uv.setXY(i, v, u); else uv.setXY(i, u, v);
      }
    }
    return add(g, mat, x, y, z);
  };

  // 角の まるい 箱（クッション・天板）。r は 角の まるみ。
  const soft = (w, h, d, r, mat, x, y, z) => {
    const b = Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001);
    const hw = w / 2 - b, hd = d / 2 - b, c = Math.min(b * 1.4, hw, hd);
    const s = new THREE.Shape();
    s.moveTo(-hw + c, -hd); s.lineTo(hw - c, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + c);
    s.lineTo(hw, hd - c); s.quadraticCurveTo(hw, hd, hw - c, hd);
    s.lineTo(-hw + c, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - c);
    s.lineTo(-hw, -hd + c); s.quadraticCurveTo(-hw, -hd, -hw + c, -hd);
    const g = new THREE.ExtrudeGeometry(s, { depth: h - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -(h - b * 2) / 2); g.rotateX(-Math.PI / 2);
    return add(g, mat, x, y, z);
  };

  const cyl = (r0, r1, h, mat, x, y, z, seg = 12) => add(metric(new THREE.CylinderGeometry(r0, r1, h, seg), Math.PI * 2 * Math.max(r0, r1), h), mat, x, y, z);
  const ball = (r, mat, x, y, z, seg = 12) => add(metric(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), Math.PI * 2 * r, Math.PI * r), mat, x, y, z);
  // まわした 形。pts は [半径, 高さ] の ならび（下から 上）。
  const lathe = (pts, mat, x, y, z, seg = 12) => add(metric(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(0.0005, r), yy)), seg), Math.PI * 2 * Math.max(...pts.map((q) => q[0])), pts.reduce((n, q, i) => n + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0)), mat, x, y, z);
  // ろくろで ひいた 脚：足先の たま・くびれ・ふくらみ・上の 四角い 受け。
  const leg = (h, r, mat, x, z) => lathe([[0, 0], [r * 0.5, 0], [r * 0.66, h * 0.03], [r * 0.46, h * 0.1], [r * 0.62, h * 0.14], [r * 0.48, h * 0.18], [r * 0.8, h * 0.5], [r, h * 0.7], [r * 0.66, h * 0.76], [r, h * 0.81], [r, h]], mat, x, 0, z, 10);

  // 2 つの 点を むすぶ ぼう（a が 下・b が 上）。
  const rod = (r0, r1, a, b, mat, seg = 6) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = cyl(r1, r0, A.distanceTo(B), mat, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, seg);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
    return m;
  };

  return { root, add, box, soft, cyl, ball, lathe, leg, rod };
}

// 材質ごとに 1 つの 形に まとめる（かぐ 1 つが 数回の 描画に なる）。
function bake(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, list] of groups) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let v = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
      v += g.attributes.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !mat.transparent && !mat.emissiveIntensity;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// ---- 2026-11 に ふやした かぐの 部品（パソコン・15 しゅるい・ベッド 4 つ） --------------------

// パソコンの 画面：オンライン ショップ（オレンジの 帯・カード 6 まい）。
const shopTex = () => tex('pcshop', 256, 144, (g, w, h) => {
  g.fillStyle = '#fff4d6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e27a2d'; g.fillRect(0, 0, w, 24);
  g.fillStyle = '#fff4d6'; g.font = 'bold 15px sans-serif'; g.textBaseline = 'middle'; g.fillText('SHOP', 10, 13);
  g.fillStyle = '#1b3a2f'; g.fillRect(w - 78, 6, 50, 12); g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(w - 14, 12, 7, 0, Math.PI * 2); g.fill();
  const cols = ['#e58f6a', '#8ff0c8', '#f59ab5', '#ffb066', '#6fa8dc', '#f7d774'];
  for (let i = 0; i < 6; i += 1) {
    const x = 10 + (i % 3) * 82, y = 32 + Math.floor(i / 3) * 56;
    g.fillStyle = '#ffffff'; g.fillRect(x, y, 72, 48); g.strokeStyle = 'rgba(27,58,47,.25)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, 71, 47);
    g.fillStyle = cols[i]; g.beginPath(); g.roundRect(x + 14, y + 6, 44, 22, 7); g.fill();
    g.fillStyle = '#1b3a2f'; g.fillRect(x + 8, y + 34, 30, 5); g.fillStyle = '#e27a2d'; g.fillRect(x + 46, y + 32, 18, 9);
  }
});
// ゲームきの 画面：うちゅうの シューティング。
const arcadeTex = () => tex('arcade', 128, 96, (g, w, h) => {
  g.fillStyle = '#10163a'; g.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < 40; i += 1) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  const cols = ['#8ff0c8', '#ffb066', '#f59ab5'];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 6; x += 1) { g.fillStyle = cols[y]; g.fillRect(14 + x * 18, 12 + y * 14, 10, 7); g.fillRect(16 + x * 18, 9 + y * 14, 6, 3); }
  g.fillStyle = '#fff4d6'; g.beginPath(); g.moveTo(64, 72); g.lineTo(74, 88); g.lineTo(54, 88); g.closePath(); g.fill();
  g.fillStyle = '#ffe07a'; g.fillRect(63, 56, 2, 10); g.fillRect(40, 62, 2, 8);
  g.fillStyle = '#fff4d6'; g.font = 'bold 9px sans-serif'; g.fillText('SCORE 1200', 6, 94);
});
// キーボード：キーの ならび。
const kbdTex = () => tex('kbd', 128, 48, (g, w, h) => {
  g.fillStyle = '#d9d5cc'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r += 1) for (let i = 0; i < 12; i += 1) { g.fillStyle = '#fbfaf6'; g.fillRect(4 + i * 10.1 + (r % 2) * 2, 4 + r * 10.4, 8, 8); }
  g.fillStyle = '#fbfaf6'; g.fillRect(36, 4 + 3 * 10.4, 52, 8);
});
// かがみ：うすい 水色の 銀に ななめの 光。
const mirrorTex = () => tex('mirror', 64, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eaf6f4'); gr.addColorStop(0.5, '#b9d6d6'); gr.addColorStop(1, '#dff0ee');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(w * 0.1, h * 0.5); g.lineTo(w * 0.55, 0); g.lineTo(w * 0.8, 0); g.lineTo(w * 0.1, h * 0.78); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(w * 0.5, h); g.lineTo(w, h * 0.45); g.lineTo(w, h * 0.56); g.lineTo(w * 0.62, h); g.closePath(); g.fill();
});
// すいそうの おく：水・水草・さかな・あわ。
const tankTex = () => tex('tank', 256, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fd6e8'); gr.addColorStop(1, '#1f7fa6');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(71);
  for (let i = 0; i < 9; i += 1) { const x = 10 + r() * (w - 20), t = 30 + r() * 50; g.strokeStyle = r() < 0.5 ? '#2f9a5f' : '#58c07a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + 12 * (r() - 0.5) * 3, h - t / 2, x + 8 * (r() - 0.5), h - t); g.stroke(); }
  for (let i = 0; i < 16; i += 1) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(r() * w, r() * h * 0.8, 1.5 + r() * 2.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e9d9a8'; g.fillRect(0, h - 9, w, 9);
});
// まどの そと：ひるの 空と 雲。
const skyTex = () => tex('sky', 128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6cbcf0'); gr.addColorStop(1, '#e3f5ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (const [x, y, s] of [[34, 40, 1.2], [92, 74, 0.9], [70, 22, 0.6]]) { g.fillStyle = 'rgba(255,255,255,.95)'; for (const [dx, rr] of [[0, 10], [13, 14], [28, 10]]) { g.beginPath(); g.arc(x + dx * s, y, rr * s, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = '#74b77c'; g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w * 0.3, h - 34, w * 0.62, h - 12); g.quadraticCurveTo(w * 0.85, h - 26, w, h - 14); g.lineTo(w, h); g.closePath(); g.fill();
});

const glass = (c = 0xcfeef2, o = 0.28) => M(`glass:${c}:${o}`, () => std({ color: c, transparent: true, opacity: o, roughness: 0.1, depthWrite: false }));
const sheer = (c, o = 0.55) => M(`sheer:${c}:${o}`, () => std({ color: c, transparent: true, opacity: o, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
const drape0 = (c) => M(`drape:${c}`, () => std({ color: c, map: fabricTex(), roughness: 0.95, side: THREE.DoubleSide }));
const lit = (c, k = 0.9) => M(`lit:${c}:${k}`, () => std({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.6 }));
const picture = (key, t, c, k = 0.55) => M(`pic:${key}`, () => std({ color: t ? 0x111111 : c, emissive: t ? 0xffffff : c, emissiveMap: t, emissiveIntensity: k, roughness: 0.4 }));

// ハートと ほし（XY の 面に かいて z へ おしだす。まんなかが 原点）。s は だいたいの 半分の はば。
function heartShape(s) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 40; i += 1) {
    const t = (i / 40) * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    if (i) sh.lineTo(x / 17 * s, (y + 2.5) / 17 * s); else sh.moveTo(x / 17 * s, (y + 2.5) / 17 * s);
  }
  return sh;
}
function starShape(R, r = R * 0.48) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i += 1) { const a = i * Math.PI / 5, q = i % 2 ? r : R, x = Math.sin(a) * q, y = Math.cos(a) * q; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
  return sh;
}
function puff(K, shape, depth, bevel, mat, x, y, z) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return K.add(g, mat, x, y, z);
}
// ひだの ある ぬの（カーテン・てんがい・フリル）。x が 長さ・y が 高さ（上が +）・ひだは z。
// pinch＝たばねる つよさ（pinchAt の 高さで anchor がわへ よせる）、scallop＝下の ふちを 波に。
function ribbon(len, h, { segs = 28, waves = 5, amp = 0.03, pinch = 0, pinchAt = 0.45, anchor = 0, scallop = 0, scallops = 4 } = {}) {
  const g = new THREE.PlaneGeometry(len, h, segs, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), u = x / len + 0.5, v = p.getY(i) / h + 0.5;
    const hh = scallop ? 1 - scallop * (1 - Math.abs(Math.sin(u * scallops * Math.PI))) : 1;
    const bell = Math.exp(-((v - pinchAt) ** 2) / 0.03), k = pinch ? 1 - pinch * (v < pinchAt ? 0.5 + 0.5 * bell : bell) : 1;
    const ax = anchor * len / 2;
    p.setXYZ(i, ax + (x - ax) * k, h / 2 - (1 - v) * h * hh, Math.sin(u * waves * Math.PI * 2) * amp * (0.45 + 0.55 * (1 - v)) * (pinch ? 0.6 + 0.4 * k : 1));
  }
  g.computeVertexNormals();
  return g;
}
// ねどこ：マットレス・まくら・かけぶとん（おりかえし）。top＝マットレスの 上の 高さ。かけぶとんの 上の 高さを かえす。
function bedding(K, fw, md, mz, top, F, white, { pillows = 2, thick = 0.24, pillowMat = white } = {}) {
  K.soft(fw, thick, md, 0.07, white, 0, top - thick / 2, mz);
  const pw = fw / pillows - 0.1;
  for (let i = 0; i < pillows; i += 1) { const p = K.soft(pw, 0.13, 0.42, 0.06, pillowMat, -fw / 2 + (i + 0.5) * (fw / pillows), top + 0.05, mz - md / 2 + 0.3); p.rotation.x = 0.12; p.rotation.y = (i % 2 ? 1 : -1) * 0.04; }
  const dl = md * 0.66, dz = mz + md / 2 - dl / 2 + 0.02;
  K.soft(fw + 0.06, 0.15, dl, 0.07, F, 0, top + 0.03, dz);
  K.soft(fw + 0.06, 0.06, 0.3, 0.028, white, 0, top + 0.11, dz - dl / 2 + 0.14);
  return top + 0.105;
}

// ---- かぐ 11 しゅるい -------------------------------------------------------------------
// どれも (K, 色, w, d)。x は −w/2〜w/2、z は −d/2〜d/2（うしろが −z）。

const BUILD = {
  // いす：木の いす。ろくろの 脚・ぬき・背の たてざん・ざぶとん。
  chair(K, c, w, d) {
    const W = wood(c), r = 0.045, sx = w / 2 - 0.2, sz = d / 2 - 0.2;
    for (const x of [-sx, sx]) { K.leg(0.45, r, W, x, sz); K.leg(0.45, r, W, x, -sz); K.cyl(0.032, 0.036, 0.56, W, x, 0.72, -sz - 0.01, 8).rotation.x = -0.06; }
    for (const x of [-sx, sx]) K.cyl(0.016, 0.016, sz * 2, W, x, 0.17, 0, 6).rotation.x = Math.PI / 2;
    K.cyl(0.016, 0.016, sx * 2, W, 0, 0.22, sz, 6).rotation.z = Math.PI / 2;
    K.soft(w - 0.26, 0.055, d - 0.26, 0.02, W, 0, 0.47, 0);
    K.soft(w - 0.34, 0.07, d - 0.36, 0.03, cloth(0xc0564a), 0, 0.525, 0.02);
    K.soft(w - 0.3, 0.13, 0.05, 0.02, W, 0, 0.96, -sz - 0.03).rotation.x = -0.06;
    K.box(w - 0.4, 0.04, 0.03, W, 0, 0.62, -sz - 0.005);
    for (const x of [-0.14, 0, 0.14]) K.cyl(0.015, 0.015, 0.3, W, x, 0.77, -sz - 0.015, 6).rotation.x = -0.06;
  },

  // ラグ：もようの ある しきもの。りょうはしに ふさ。
  rug(K, c, w, d) {
    if (LOOK) {
      // スタイルの ラグ：こい ふち・もようの まんなか・ふさ。
      K.box(w - 0.16, 0.03, d - 0.1, cloth0(tint(LOOK.pat === 'plain' || LOOK.pat === 'velvet' ? LOOK.fab : LOOK.pop, 0.72)), 0, 0.015, 0);
      K.box(w - 0.4, 0.038, d - 0.34, cloth(c), 0, 0.019, 0);
      const fr = linen(0xf1e3c4);
      for (const s of [-1, 1]) for (let i = 0; i < 16; i += 1) K.box(0.05, 0.012, (d - 0.14) / 16 * 0.6, fr, s * (w / 2 - 0.055), 0.008, -(d - 0.14) / 2 + (i + 0.5) * (d - 0.14) / 16);
      return;
    }
    const t = rugTex(c);
    K.box(w - 0.16, 0.035, d - 0.1, M(`rug:${c}`, () => std({ color: t ? 0xffffff : c, map: t, roughness: 1 })), 0, 0.0175, 0, { plain: true });
    const fringe = cloth(0xf1e3c4);
    for (const s of [-1, 1]) for (let i = 0; i < 16; i += 1) K.box(0.05, 0.012, (d - 0.14) / 16 * 0.6, fringe, s * (w / 2 - 0.055), 0.008, -(d - 0.14) / 2 + (i + 0.5) * (d - 0.14) / 16);
  },

  // かんようしょくぶつ：すやきの はち・土・みき・つやの ある はっぱ。
  plant(K, c) {
    const pot = flat(0xb5673f, 0.85);
    K.lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.235, 0.34], [0.265, 0.345], [0.265, 0.4], [0.225, 0.4], [0.215, 0.36], [0, 0.36]], pot, 0, 0, 0, 16);
    K.cyl(0.215, 0.215, 0.01, flat(0x3a2a1c, 1), 0, 0.365, 0, 16);
    K.cyl(0.016, 0.03, 1.0, flat(0x6b5136, 0.9), 0, 0.86, 0, 6);
    const greens = [flat(c, 0.45), flat(tint(c, 0.74), 0.45), flat(tint(c, 1.25), 0.45)];
    const leafGeo = new THREE.SphereGeometry(1, 8, 6);
    const N = 17;
    for (let i = 0; i < N; i += 1) {
      const t = i / (N - 1), len = 0.34 - t * 0.14, ang = i * 2.39996, lift = 0.25 + t * 0.75;
      const turn = new THREE.Group(); turn.position.y = 0.52 + t * 0.82; turn.rotation.y = ang; K.root.add(turn);
      const tilt = new THREE.Group(); tilt.rotation.x = -lift; turn.add(tilt);
      // えと はっぱ。はっぱは うすい だ円で、先が 少し たれる。
      K.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), greens[1], 0, 0, 0.06, tilt).rotation.x = Math.PI / 2;
      const leaf = K.add(leafGeo, greens[i % 3], 0, 0, 0.1 + len * 0.5, tilt);
      leaf.scale.set(len * 0.34, 0.012, len * 0.5); leaf.rotation.x = 0.22;
    }
    const tip = K.add(leafGeo, greens[2], 0, 1.43, 0); tip.scale.set(0.035, 0.11, 0.035);
  },

  // テーブル：まるい 角の 天板・まくいた・ろくろの 脚。
  table(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.8));
    K.soft(w - 0.1, 0.07, d - 0.1, 0.022, W, 0, 0.765, 0);
    const sx = w / 2 - 0.2, sz = d / 2 - 0.19;
    for (const x of [-sx, sx]) for (const z of [-sz, sz]) K.leg(0.73, 0.055, D, x, z);
    for (const z of [-sz, sz]) K.box(sx * 2 - 0.08, 0.1, 0.03, D, 0, 0.67, z);
    for (const x of [-sx, sx]) K.box(0.03, 0.1, sz * 2 - 0.08, D, x, 0.67, 0);
  },

  // ほんだな：わく・たないた 3 まい・本の ならび・かびんと 小さな はち。
  shelf(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.62)), dep = 0.42, z = -(d / 2 - dep / 2 - 0.06);
    for (const s of [-1, 1]) K.box(0.05, 1.9, dep, W, s * (w / 2 - 0.075), 1.0, z);
    K.box(w - 0.06, 0.05, dep + 0.04, W, 0, 1.975, z);
    K.box(w - 0.1, 0.1, dep, D, 0, 0.05, z);
    K.box(w - 0.2, 1.86, 0.02, D, 0, 1.02, z - dep / 2 + 0.01, { plain: true });
    const ys = [0.1, 0.58, 1.05, 1.52];
    for (const y of ys.slice(1)) K.box(w - 0.2, 0.035, dep - 0.03, W, 0, y - 0.0175, z + 0.01);
    // 本：1 だんに 1 つの 箱。前の 面に だけ「せ」の 絵、ほかの 面は 紙の 色（絵の すみ）。
    const books = booksMat();
    const inner = w - 0.2;
    const rows = [[1, 0], [0.62, -1], [0.7, 1], [0.88, -1]];   // [はば, よせる むき]
    ys.forEach((y, i) => {
      const [k, side] = rows[i], bw = inner * k - 0.04, g = new THREE.BoxGeometry(bw, 0.36, 0.25), uv = g.attributes.uv;
      for (let q = 0; q < uv.count; q += 1) {
        if (Math.floor(q / 4) === 4) uv.setXY(q, i * 0.37 + uv.getX(q) * bw * 0.52, 0.06 + uv.getY(q) * 0.94);
        else uv.setXY(q, i * 0.37 + 0.02, 0.02);
      }
      K.add(g, books, side * (inner - bw - 0.04) / 2, y + 0.18, z + 0.02);
    });
    // あいた ところに かざり。
    const vx = inner / 2 - 0.2;
    K.lathe([[0, 0], [0.05, 0], [0.085, 0.08], [0.06, 0.17], [0.03, 0.22], [0.045, 0.26]], flat(0x4f8fb0, 0.3), vx, ys[1], z + 0.03, 12);
    K.lathe([[0, 0], [0.06, 0], [0.08, 0.1], [0, 0.1]], flat(0xb5673f, 0.85), -vx, ys[2], z + 0.03, 10);
    const leaf = flat(0x5f9f52, 0.5);
    for (let i = 0; i < 5; i += 1) { const m = K.ball(1, leaf, -vx + Math.cos(i * 1.26) * 0.05, ys[2] + 0.17, z + 0.03 + Math.sin(i * 1.26) * 0.05, 6); m.scale.set(0.03, 0.09, 0.03); m.rotation.z = Math.cos(i * 1.26) * -0.5; m.rotation.x = Math.sin(i * 1.26) * 0.5; }
  },

  // ランプ：おもい 台・ほそい 柱・光る かさ（中に でんきゅう）。
  lamp(K, c) {
    const metal = LOOK ? wood(0xa97c50) : brass();
    K.lathe([[0, 0], [0.2, 0], [0.2, 0.02], [0.13, 0.045], [0.035, 0.07], [0.02, 0.11]], metal, 0, 0, 0, 20);
    K.cyl(0.016, 0.016, 1.42, metal, 0, 0.8, 0, 8);
    K.ball(0.03, metal, 0, 1.5, 0, 8);
    K.ball(0.07, glow(0xfff3d0, 1), 0, 1.6, 0, 10);
    const shade = shadeMat(c, 0.85, 'shade');
    K.add(new THREE.CylinderGeometry(0.19, 0.33, 0.42, 24, 1, true), shade, 0, 1.64, 0);
    for (const [r, y] of [[0.19, 1.85], [0.33, 1.43]]) K.add(new THREE.TorusGeometry(r, 0.008, 5, 24), metal, 0, y, 0).rotation.x = Math.PI / 2;
    K.cyl(0.003, 0.003, 0.16, metal, 0.1, 1.38, 0.06, 4); K.ball(0.012, metal, 0.1, 1.3, 0.06, 6);
  },

  // とけい：ふりこの ある 大きな のっぽ時計。文字ばんは その かぐの 色。
  clock(K, c, w, d) {
    const W = wood(0x8d6642), D = wood(0x5e422a), z = 0;
    K.box(0.58, 0.06, 0.42, D, 0, 0.03, z); K.box(0.52, 0.28, 0.36, W, 0, 0.2, z); K.box(0.56, 0.04, 0.4, D, 0, 0.36, z);
    K.box(0.4, 0.82, 0.28, W, 0, 0.79, z);
    K.box(0.26, 0.64, 0.02, flat(0x241811, 0.9), 0, 0.79, z + 0.135, { plain: true });
    // ふりこ と おもり。
    K.cyl(0.006, 0.006, 0.42, brass(), 0.02, 0.9, z + 0.15, 5).rotation.z = 0.05;
    K.cyl(0.062, 0.062, 0.012, brass(), 0.01, 0.68, z + 0.152, 16).rotation.x = Math.PI / 2;
    for (const x of [-0.07, 0.08]) K.cyl(0.02, 0.02, 0.12, brass(), x, 1.0, z + 0.15, 8);
    K.box(0.56, 0.04, 0.4, D, 0, 1.22, z); K.box(0.5, 0.46, 0.34, W, 0, 1.47, z); K.box(0.6, 0.05, 0.44, D, 0, 1.725, z);
    K.soft(0.5, 0.1, 0.34, 0.04, W, 0, 1.79, z);
    for (const x of [-0.22, 0, 0.22]) K.lathe([[0, 0], [0.03, 0], [0.018, 0.02], [0.034, 0.05], [0, 0.085]], brass(), x, 1.83, z, 8);
    const face = clockTex(c);
    K.add(new THREE.CircleGeometry(0.19, 28), M(`face:${c}`, () => std({ color: face ? 0xffffff : c, map: face, emissive: face ? 0xffffff : c, emissiveMap: face, emissiveIntensity: 0.3, roughness: 0.5 })), 0, 1.47, z + 0.172);
    K.add(new THREE.TorusGeometry(0.195, 0.014, 6, 28), brass(), 0, 1.47, z + 0.174);
  },

  // ソファ：ひじかけ・ざの クッション・背の クッション・木の 足・クッション 1 つ。
  sofa(K, c, w, d) {
    const F = cloth(c), F2 = cloth(tint(c, 0.84)), foot = wood(0x5e422a);
    const bw = w - 0.1, bd = d - 0.14, arm = 0.26, inner = bw - arm * 2, n = Math.max(1, Math.round(inner / 0.8)), cw = inner / n;
    for (const x of [-bw / 2 + 0.12, 0, bw / 2 - 0.12]) for (const z of [-bd / 2 + 0.1, bd / 2 - 0.1]) K.cyl(0.035, 0.025, 0.1, foot, x, 0.05, z, 8);
    K.soft(bw, 0.26, bd, 0.05, F2, 0, 0.23, 0);
    for (const s of [-1, 1]) K.soft(arm, 0.56, bd, 0.1, F, s * (bw / 2 - arm / 2), 0.38, 0);
    K.soft(inner + 0.04, 0.52, 0.2, 0.08, F2, 0, 0.6, -bd / 2 + 0.1).rotation.x = -0.08;
    for (let i = 0; i < n; i += 1) {
      const x = -inner / 2 + cw * (i + 0.5);
      K.soft(cw - 0.02, 0.17, bd - 0.26, 0.06, F, x, 0.44, 0.1);
      K.soft(cw - 0.03, 0.4, 0.19, 0.085, F, x, 0.71, -bd / 2 + 0.27).rotation.x = -0.2;
    }
    if (LOOK) {   // スタイルの ソファ：下の わく・ひじかけの 上・背の 上に わくの 素材（木・ぬり・きんぞく）が 見える。
      const T = wood(0xa97c50);
      K.box(bw + 0.02, 0.06, bd + 0.02, T, 0, 0.125, 0);
      for (const s of [-1, 1]) K.soft(arm * 0.62, 0.03, bd * 0.86, 0.012, T, s * (bw / 2 - arm / 2), 0.672, 0);
      K.soft(inner + 0.1, 0.035, 0.09, 0.014, T, 0, 0.872, -bd / 2 + 0.075);
    }
    const pillow = K.soft(0.34, 0.34, 0.12, 0.055, pop(0xe6b655), -inner / 2 + 0.2, 0.69, 0.02);
    pillow.rotation.set(Math.PI / 2 - 0.3, 0, 0.5);
  },

  // テレビ：木の テレビだい と、うすい テレビ（画面は ついて いる）。
  tv(K, c, w, d) {
    const W = wood(0x8a6442), D = flat(0x2a2420, 0.6), z = -(d / 2 - 0.3);
    for (const x of [-(w / 2 - 0.26), w / 2 - 0.26]) for (const dz of [-0.14, 0.14]) K.cyl(0.03, 0.018, 0.14, D, x, 0.07, z + dz, 8);
    K.soft(w - 0.16, 0.36, 0.44, 0.02, W, 0, 0.32, z);
    for (const x of [-(w - 0.2) / 6, (w - 0.2) / 6]) K.box(0.008, 0.3, 0.01, D, x, 0.32, z + 0.221, { plain: true });
    for (const x of [-(w - 0.2) / 3, 0, (w - 0.2) / 3]) K.ball(0.016, brass(), x + 0.06, 0.34, z + 0.228, 8);
    const body = flat(c, 0.35);
    K.soft(0.5, 0.02, 0.22, 0.008, body, 0, 0.51, z);
    K.box(0.07, 0.1, 0.035, body, 0, 0.56, z - 0.02, { plain: true });
    K.soft(w - 0.22, 0.64, 0.045, 0.012, body, 0, 0.92, z);
    const st = tvTex();
    K.add(new THREE.PlaneGeometry(w - 0.28, 0.58), st ? glow(0x9fd0dc, 0.6, st) : glow(0x9fd0dc, 0.6), 0, 0.925, z + 0.024);
    K.ball(0.006, glow(0xff5544, 0.9), w / 2 - 0.2, 0.615, z + 0.024, 6);
  },

  // ベッド：木の わくと ヘッドボード・マットレス・まくら 2 つ・かけぶとん（おりかえし つき）。まくらが −z がわ。
  bed(K, c, w, d) {
    const W = wood(0xa97c50), D = wood(0x7a5636), white = linen(0xf6f1e7), F = cloth(c);
    const fw = w - 0.1, fd = d - 0.1;
    for (const x of [-fw / 2 + 0.06, fw / 2 - 0.06]) for (const z of [-fd / 2 + 0.06, fd / 2 - 0.06]) K.box(0.09, 0.16, 0.09, D, x, 0.08, z);
    for (const s of [-1, 1]) K.box(0.05, 0.2, fd - 0.1, W, s * (fw / 2 - 0.025), 0.26, 0);
    K.box(fw - 0.1, 0.06, fd - 0.1, D, 0, 0.2, 0);
    K.soft(fw, 0.36, 0.07, 0.02, W, 0, 0.3, fd / 2 - 0.035);
    K.soft(fw, 1.0, 0.09, 0.035, W, 0, 0.6, -fd / 2 + 0.045);
    K.soft(fw - 0.24, 0.5, 0.02, 0.008, D, 0, 0.76, -fd / 2 + 0.095);
    const md = fd - 0.2, mz = 0.01;
    K.soft(fw - 0.12, 0.22, md, 0.06, white, 0, 0.36, mz);
    for (const s of [-1, 1]) { const p = K.soft(fw / 2 - 0.16, 0.13, 0.42, 0.06, white, s * (fw / 4 - 0.02), 0.52, -fd / 2 + 0.42); p.rotation.x = 0.12; p.rotation.y = s * 0.05; }
    const dl = md * 0.66, dz = mz + md / 2 - dl / 2 + 0.02;
    K.soft(fw - 0.06, 0.15, dl, 0.07, F, 0, 0.43, dz);
    K.soft(fw - 0.06, 0.06, 0.3, 0.028, white, 0, 0.51, dz - dl / 2 + 0.14);
    // 足もとの ひざかけ。
    K.soft(fw - 0.04, 0.05, 0.5, 0.024, pop(0x7fa9c4), 0, 0.5, dz + dl / 2 - 0.36);
  },

  // ピアノ：つやの ある アップライト。けんばん・ふた・ふめん台・ペダル。
  piano(K, c, w, d) {
    const P = body(c, 0.16), z = -(d / 2 - 0.23), bw = w - 0.14;
    K.soft(bw, 1.14, 0.34, 0.015, P, 0, 0.59, z);
    K.soft(bw + 0.04, 0.035, 0.4, 0.012, P, 0, 1.18, z + 0.01);
    K.box(bw, 0.08, 0.36, P, 0, 0.04, z, { plain: true });
    const kz = z + 0.17 + 0.15;
    K.soft(bw, 0.07, 0.32, 0.012, P, 0, 0.635, kz);
    for (const s of [-1, 1]) { K.box(0.07, 0.11, 0.3, P, s * (bw / 2 - 0.035), 0.72, kz - 0.005, { plain: true }); K.box(0.07, 0.6, 0.07, P, s * (bw / 2 - 0.045), 0.3, kz + 0.1, { plain: true }); }
    const kw = bw - 0.16;
    K.box(kw, 0.03, 0.2, flat(0xfbf8f0, 0.35), 0, 0.685, kz + 0.04, { plain: true });
    const kt = keysTex();
    if (kt) K.add(new THREE.PlaneGeometry(kw, 0.2), M('keys', () => std({ map: kt, roughness: 0.3 })), 0, 0.7012, kz + 0.04).rotation.x = -Math.PI / 2;
    K.box(kw, 0.012, 0.03, flat(0x8a1f2a, 0.8), 0, 0.704, kz - 0.062, { plain: true });
    K.box(kw, 0.13, 0.02, P, 0, 0.76, kz - 0.085, { plain: true }).rotation.x = -0.12;
    const desk = K.box(0.74, 0.22, 0.014, P, 0, 0.96, z + 0.2, { plain: true }); desk.rotation.x = -0.22;
    K.box(0.74, 0.02, 0.04, P, 0, 0.86, z + 0.2, { plain: true });
    const sheet = K.add(new THREE.PlaneGeometry(0.34, 0.2), flat(0xfaf6ea, 0.9), 0, 0.965, z + 0.213); sheet.rotation.x = -0.22;
    for (let i = 0; i < 4; i += 1) K.add(new THREE.PlaneGeometry(0.28, 0.004), flat(0x333333, 0.9), 0, 0.92 + i * 0.03, z + 0.2235 - i * 0.0067).rotation.x = -0.22;
    for (const x of [-0.11, 0, 0.11]) K.soft(0.035, 0.016, 0.1, 0.006, brass(), x, 0.03, z + 0.22);
    K.cyl(0.012, 0.012, 0.02, brass(), bw / 2 - 0.2, 1.0, z + 0.171, 8).rotation.x = Math.PI / 2;
  },

  // ---- 2026-11：パソコン・あたらしい かぐ 15・ベッド 4 つ ----------------------------------

  // パソコン：つくえ（ひきだし 3 だん）・モニター（オンライン ショップの 画面が 光る）・キーボード・マウス・マグ。
  pc(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.72)), dark = flat(0x2b3036, 0.4), z = -0.1, dw = w - 0.14, dd = 0.66, mx = -0.14;
    K.soft(dw, 0.05, dd, 0.018, W, 0, 0.745, z);
    K.box(0.05, 0.72, dd - 0.08, D, -dw / 2 + 0.06, 0.36, z);
    K.box(0.46, 0.64, dd - 0.08, D, dw / 2 - 0.27, 0.4, z);
    K.box(0.42, 0.08, dd - 0.14, dark, dw / 2 - 0.27, 0.04, z, { plain: true });
    K.box(dw - 0.5, 0.3, 0.02, D, -0.2, 0.56, z - dd / 2 + 0.08);
    for (let i = 0; i < 3; i += 1) { const y = 0.19 + i * 0.21; K.box(0.4, 0.18, 0.02, W, dw / 2 - 0.27, y, z + dd / 2 - 0.03); K.ball(0.018, brass(), dw / 2 - 0.27, y, z + dd / 2 - 0.012, 8); }
    K.soft(0.28, 0.016, 0.18, 0.006, dark, mx, 0.778, z - 0.14);
    K.box(0.045, 0.2, 0.03, dark, mx, 0.88, z - 0.18, { plain: true });
    K.soft(0.8, 0.47, 0.035, 0.012, dark, mx, 1.13, z - 0.15);
    const st = shopTex();
    K.add(new THREE.PlaneGeometry(0.75, 0.42), picture('pcshop', st, 0xfff4d6, 0.62), mx, 1.135, z - 0.15 + 0.019);
    K.ball(0.006, lit(0x8ff0c8, 1), mx + 0.36, 0.915, z - 0.15 + 0.019, 6);
    K.soft(0.46, 0.018, 0.16, 0.006, flat(0xd9d5cc, 0.5), mx, 0.779, z + 0.1);
    const kt = kbdTex();
    if (kt) K.add(new THREE.PlaneGeometry(0.44, 0.14), M('kbd', () => std({ map: kt, roughness: 0.5 })), mx, 0.7885, z + 0.1).rotation.x = -Math.PI / 2;
    K.box(0.22, 0.004, 0.18, flat(0x1b3a2f, 0.9), mx + 0.42, 0.772, z + 0.1, { plain: true });
    K.ball(1, flat(0xf4f1ea, 0.35), mx + 0.42, 0.786, z + 0.1, 10).scale.set(0.032, 0.018, 0.05);
    K.cyl(0.036, 0.03, 0.085, flat(0xffb066, 0.4), dw / 2 - 0.16, 0.813, z - 0.12, 12);
    K.add(new THREE.TorusGeometry(0.025, 0.007, 5, 10), flat(0xffb066, 0.4), dw / 2 - 0.12, 0.813, z - 0.12);
  },

  // アームチェア：ひとりがけ。まるい ひじかけ・ざと 背の クッション・木の 足。
  armchair(K, c, w, d) {
    const F = cloth(c), F2 = cloth(tint(c, 0.84)), foot = wood(0x5e422a), bw = w - 0.1, bd = d - 0.14, arm = 0.2, inner = bw - arm * 2;
    for (const x of [-bw / 2 + 0.1, bw / 2 - 0.1]) for (const z of [-bd / 2 + 0.1, bd / 2 - 0.1]) K.cyl(0.035, 0.022, 0.12, foot, x, 0.06, z, 8);
    K.soft(bw, 0.24, bd, 0.05, F2, 0, 0.24, 0);
    for (const s of [-1, 1]) K.soft(arm, 0.5, bd - 0.04, 0.095, F, s * (bw / 2 - arm / 2), 0.4, 0.02);
    K.soft(bw - 0.04, 0.7, 0.2, 0.09, F2, 0, 0.62, -bd / 2 + 0.1).rotation.x = -0.1;
    K.soft(inner - 0.01, 0.17, bd - 0.26, 0.07, F, 0, 0.44, 0.1);
    K.soft(inner - 0.02, 0.44, 0.18, 0.085, F, 0, 0.74, -bd / 2 + 0.26).rotation.x = -0.2;
    if (LOOK) {
      const T = wood(0xa97c50);
      K.box(bw + 0.02, 0.06, bd + 0.02, T, 0, 0.145, 0);
      for (const s of [-1, 1]) K.soft(arm * 0.62, 0.03, bd * 0.8, 0.012, T, s * (bw / 2 - arm / 2), 0.662, 0.02);
      K.soft(bw - 0.16, 0.035, 0.09, 0.014, T, 0, 0.985, -bd / 2 + 0.065);
    }
    K.soft(0.26, 0.26, 0.1, 0.045, pop(0xfff4d6), 0.08, 0.66, -0.02).rotation.set(Math.PI / 2 - 0.35, 0, -0.3);
  },

  // スタンドライト：木の 三きゃく・たいこの かたちの かさ（光る）。
  floorlamp(K, c) {
    const W = wood(0x9a6b45), top = 1.34;
    for (let i = 0; i < 3; i += 1) {
      const a = i * Math.PI * 2 / 3 + 0.5, r = 0.33, L = Math.hypot(top, r);
      const m = K.cyl(0.02, 0.026, L, W, Math.sin(a) * r / 2, top / 2 + 0.014, Math.cos(a) * r / 2, 8);
      m.rotation.order = 'YXZ'; m.rotation.y = a; m.rotation.x = -Math.atan2(r, top);
    }
    K.cyl(0.06, 0.07, 0.07, brass(), 0, top, 0, 12);
    K.cyl(0.012, 0.012, 0.3, brass(), 0, top + 0.16, 0, 6);
    K.ball(0.075, lit(0xfff6dc, 1), 0, top + 0.38, 0, 10);
    const shade = shadeMat(c, 0.8, 'drum');
    K.add(new THREE.CylinderGeometry(0.3, 0.33, 0.44, 28, 1, true), shade, 0, top + 0.4, 0);
    for (const [r, y] of [[0.3, top + 0.62], [0.33, top + 0.18]]) K.add(new THREE.TorusGeometry(r, 0.009, 5, 28), brass(), 0, y, 0).rotation.x = Math.PI / 2;
  },

  // かびん：小さな まるい 台・レースの しきもの・やきものの かびんに 花たば。
  vase(K, c) {
    const W = flat(0xfffaf3, 0.5);
    K.lathe([[0, 0], [0.2, 0], [0.2, 0.025], [0.06, 0.06], [0.035, 0.12], [0.05, 0.3], [0.03, 0.42], [0.04, 0.52], [0.1, 0.56], [0, 0.56]], W, 0, 0, 0, 16);
    K.cyl(0.3, 0.3, 0.035, W, 0, 0.577, 0, 24);
    K.cyl(0.2, 0.2, 0.006, flat(0xfff4d6, 0.95), 0, 0.598, 0, 20);
    K.lathe([[0, 0], [0.07, 0], [0.085, 0.02], [0.13, 0.12], [0.125, 0.2], [0.06, 0.3], [0.055, 0.34], [0.075, 0.37]], flat(c, 0.25), 0, 0.6, 0, 18);
    K.add(new THREE.TorusGeometry(0.06, 0.012, 6, 16), flat(0xfff4d6, 0.4), 0, 0.905, 0).rotation.x = Math.PI / 2;
    const stem = flat(0x4f9a55, 0.6), heads = [0xf78fb3, 0xfffaf3, 0xffb066, 0xf7d774, 0xf59ab5, 0xff8f8f, 0xfffaf3];
    heads.forEach((hc, i) => {
      const a = i * 2.4, lean = i ? 0.22 + (i % 3) * 0.09 : 0, len = 0.42 + (i % 2) * 0.1 - lean * 0.2;
      const turn = new THREE.Group(); turn.position.set(0, 0.95, 0); turn.rotation.y = a; K.root.add(turn);
      const tilt = new THREE.Group(); tilt.rotation.x = lean; turn.add(tilt);
      K.add(new THREE.CylinderGeometry(0.008, 0.008, len, 5), stem, 0, len / 2, 0, tilt);
      const leaf = K.add(new THREE.SphereGeometry(1, 6, 5), stem, 0.03, len * 0.45, 0, tilt); leaf.scale.set(0.05, 0.012, 0.022); leaf.rotation.z = 0.5;
      const P = flat(hc, 0.6);
      for (let k = 0; k < 6; k += 1) { const q = K.add(new THREE.SphereGeometry(1, 7, 5), P, Math.cos(k * 1.047) * 0.045, len + 0.01, Math.sin(k * 1.047) * 0.045, tilt); q.scale.set(0.04, 0.018, 0.04); }
      K.add(new THREE.SphereGeometry(0.028, 8, 6), flat(hc === 0xf7d774 ? 0xe27a2d : 0xf7d774, 0.7), 0, len + 0.022, 0, tilt);
    });
  },

  // ドレッサー：白い けしょうだい・だ円の かがみ・ひきだし・びん・まるい スツール。
  dresser(K, c, w, d) {
    const W = frame(c, 0.45), P = cloth(0xf59ab5), z = -(d / 2 - 0.26), dw = w - 0.16;
    K.soft(dw, 0.05, 0.44, 0.018, W, 0, 0.74, z);
    for (const s of [-1, 1]) {
      K.box(0.5, 0.42, 0.4, W, s * (dw / 2 - 0.27), 0.5, z, { plain: true });
      for (const y of [0.4, 0.6]) { K.box(0.44, 0.17, 0.015, frame(tint(c, 0.94), 0.5), s * (dw / 2 - 0.27), y, z + 0.205, { plain: true }); K.ball(0.02, brass(), s * (dw / 2 - 0.27), y, z + 0.22, 8); }
      for (const x of [0.07, 0.47]) K.leg(0.3, 0.03, W, s * (dw / 2 - x), z + 0.14), K.leg(0.3, 0.03, W, s * (dw / 2 - x), z - 0.14);
    }
    K.box(dw - 1.0, 0.1, 0.4, W, 0, 0.67, z, { plain: true });
    const mt = mirrorTex(), mz = z - 0.17;
    for (const s of [-1, 1]) K.box(0.035, 0.26, 0.035, W, s * 0.3, 0.9, mz, { plain: true });
    const m = K.add(new THREE.CircleGeometry(0.36, 32), picture('mirror', mt, 0xcfe6e6, 0.5), 0, 1.4, mz + 0.022); m.scale.set(1, 1.3, 1);
    const fr = K.add(new THREE.TorusGeometry(0.375, 0.03, 8, 36), W, 0, 1.4, mz + 0.01); fr.scale.set(1, 1.3, 1);
    puff(K, heartShape(0.09), 0.03, 0.012, lit(0xf59ab5, 0.25), 0, 1.93, mz + 0.01);
    for (const [x, col, hh] of [[-0.62, 0xf59ab5, 0.1], [-0.5, 0x8ff0c8, 0.07], [0.56, 0xffb066, 0.09]]) { K.cyl(0.03, 0.035, hh, flat(col, 0.2), x, 0.765 + hh / 2, z - 0.04, 10); K.ball(0.018, brass(), x, 0.78 + hh, z - 0.04, 8); }
    K.cyl(0.05, 0.05, 0.012, brass(), 0.4, 0.772, z + 0.06, 12);
    // スツール（前がわ）。
    const sz = d / 2 - 0.26;
    for (let i = 0; i < 4; i += 1) K.leg(0.36, 0.028, W, Math.cos(i * 1.571 + 0.785) * 0.13, sz + Math.sin(i * 1.571 + 0.785) * 0.13);
    K.cyl(0.19, 0.19, 0.04, W, 0, 0.38, sz, 20);
    K.lathe([[0, 0], [0.19, 0], [0.2, 0.04], [0.17, 0.09], [0, 0.1]], P, 0, 0.4, sz, 20);
  },

  // ようふくだんす：かんのんびらき・かざりの わく・しんちゅうの とって・下に ひきだし。
  wardrobe(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.74)), dep = 0.62, z = -(d / 2 - dep / 2 - 0.06), bw = w - 0.14;
    for (const x of [-bw / 2 + 0.08, bw / 2 - 0.08]) for (const dz of [-dep / 2 + 0.08, dep / 2 - 0.08]) K.ball(0.055, D, x, 0.057, z + dz, 8);
    K.box(bw, 1.94, dep, W, 0, 1.06, z);
    K.box(bw + 0.08, 0.06, dep + 0.06, D, 0, 2.06, z); K.box(bw + 0.03, 0.05, dep + 0.03, D, 0, 2.0, z);
    K.box(bw + 0.04, 0.06, dep + 0.04, D, 0, 0.12, z);
    const fz = z + dep / 2;
    for (const s of [-1, 1]) {
      const x = s * (bw / 4 - 0.005), pw = bw / 2 - 0.05;
      K.box(pw, 1.42, 0.03, W, x, 1.24, fz + 0.012);
      for (const [y, hh] of [[1.56, 0.66], [0.86, 0.6]]) { K.box(pw - 0.14, hh, 0.012, D, x, y, fz + 0.03); K.box(pw - 0.2, hh - 0.06, 0.012, W, x, y, fz + 0.036); }
      K.cyl(0.012, 0.012, 0.2, brass(), s * 0.05, 1.24, fz + 0.055, 8);
      K.box(pw, 0.3, 0.03, W, x, 0.33, fz + 0.012); K.box(pw - 0.14, 0.2, 0.012, D, x, 0.33, fz + 0.03);
      K.ball(0.022, brass(), x, 0.33, fz + 0.05, 8);
    }
    // 上に ぼうしの はこ。
    K.cyl(0.2, 0.2, 0.16, flat(0xf59ab5, 0.8), -bw / 4, 2.17, z, 20); K.cyl(0.21, 0.21, 0.04, flat(0xfff4d6, 0.8), -bw / 4, 2.25, z, 20);
  },

  // サイドテーブル：まるい 天板の 一本あし。本と ティーカップ。
  sidetable(K, c) {
    const W = wood(c), D = wood(tint(c, 0.78));
    for (let i = 0; i < 3; i += 1) { const a = i * 2.094; const f = K.soft(0.3, 0.035, 0.06, 0.015, D, Math.sin(a) * 0.14, 0.03, Math.cos(a) * 0.14); f.rotation.y = a + Math.PI / 2; }
    K.lathe([[0, 0.02], [0.06, 0.02], [0.035, 0.1], [0.05, 0.2], [0.03, 0.3], [0.03, 0.44], [0.045, 0.5], [0.09, 0.545], [0, 0.545]], D, 0, 0, 0, 14);
    K.cyl(0.37, 0.37, 0.035, W, 0, 0.562, 0, 28); K.add(new THREE.TorusGeometry(0.37, 0.018, 6, 28), W, 0, 0.562, 0).rotation.x = Math.PI / 2;
    K.box(0.22, 0.035, 0.16, flat(0x3f6ac4, 0.7), -0.1, 0.598, 0.05, { plain: true }).rotation.y = 0.3;
    K.box(0.2, 0.03, 0.15, flat(0xe27a2d, 0.7), -0.1, 0.63, 0.05, { plain: true }).rotation.y = -0.15;
    K.cyl(0.075, 0.075, 0.008, flat(0xfffaf3, 0.3), 0.14, 0.584, -0.06, 16);
    K.lathe([[0, 0], [0.03, 0], [0.05, 0.03], [0.055, 0.065], [0.048, 0.065], [0.044, 0.035], [0, 0.012]], flat(0xfffaf3, 0.3), 0.14, 0.588, -0.06, 14);
    K.cyl(0.044, 0.044, 0.004, flat(0xa0522d, 0.5), 0.14, 0.64, -0.06, 12);
  },

  // おおきな き：あみかごの はち・まがった みき・こんもりした はっぱ。
  tree(K, c) {
    const basket = flat(0xcaa56a, 0.95), trunk = flat(0x7a5a3c, 0.9);
    K.lathe([[0, 0], [0.2, 0], [0.26, 0.2], [0.27, 0.4], [0.25, 0.46], [0.22, 0.46], [0.22, 0.42], [0, 0.42]], basket, 0, 0, 0, 18);
    for (const y of [0.1, 0.2, 0.3]) K.add(new THREE.TorusGeometry(0.2 + y * 0.3 + 0.03, 0.012, 5, 18), flat(0xb08a4f, 0.95), 0, y, 0).rotation.x = Math.PI / 2;
    K.cyl(0.215, 0.215, 0.01, flat(0x3a2a1c, 1), 0, 0.425, 0, 16);
    const seg = [[0, 0.42, 0, 0.05], [0.05, 0.85, 0.02, 0.042], [-0.03, 1.25, -0.03, 0.034], [0.02, 1.62, 0.01, 0.026]];
    for (let i = 0; i < seg.length - 1; i += 1) {
      const a = new THREE.Vector3(...seg[i]), b = new THREE.Vector3(...seg[i + 1]), mid = a.clone().add(b).multiplyScalar(0.5), L = a.distanceTo(b);
      const m = K.cyl(seg[i + 1][3], seg[i][3], L + 0.03, trunk, mid.x, mid.y, mid.z, 8); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    const greens = [flat(c, 0.6), flat(tint(c, 0.76), 0.6), flat(tint(c, 1.22), 0.6)];
    const blobs = [[0, 1.78, 0, 0.36], [0.2, 1.55, 0.1, 0.25], [-0.2, 1.6, -0.08, 0.26], [0.05, 1.5, -0.2, 0.22], [-0.08, 1.52, 0.2, 0.23], [0.13, 2.0, -0.05, 0.24], [-0.14, 2.02, 0.08, 0.22], [0, 2.2, 0, 0.18], [0.22, 1.78, -0.16, 0.2], [-0.24, 1.82, 0.14, 0.19]];
    blobs.forEach(([x, y, z, r], i) => { K.add(new THREE.IcosahedronGeometry(r, 1), greens[i % 3], x, y, z).rotation.set(i, i * 2, 0); });
    const r = rng(5);
    for (let i = 0; i < 26; i += 1) { const a = r() * 6.28, y = 1.42 + r() * 0.85, q = 0.3 + r() * 0.12 - Math.abs(y - 1.8) * 0.12; const l = K.add(new THREE.SphereGeometry(1, 6, 5), greens[i % 3], Math.sin(a) * q, y, Math.cos(a) * q); l.scale.set(0.1, 0.02, 0.06); l.rotation.set(r() - 0.5, a + Math.PI / 2, r() - 0.5); }
  },

  // くまの ぬいぐるみ：すわった くま。くびに リボン。
  teddy(K, c) {
    const F = cloth(c), L = LOOK && LOOK.pat !== 'plain' ? linen(0xf6ead6) : cloth(tint(c, 1.32)), dark = flat(0x2a1c14, 0.4), S = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const b = K.ball(r, m, x, y, z, 14); b.scale.set(sx, sy, sz); return b; };
    S(0.22, F, 0, 0.26, -0.03, 1, 1.1, 0.95); S(0.13, L, 0, 0.25, 0.1, 1, 1.1, 0.6);
    S(0.19, F, 0, 0.6, 0, 1.05, 0.95, 1);
    for (const s of [-1, 1]) {
      S(0.07, F, s * 0.15, 0.76, -0.01, 1, 1, 0.6); S(0.04, L, s * 0.15, 0.76, 0.015, 1, 1, 0.5);
      S(0.02, dark, s * 0.07, 0.64, 0.17);
      const arm = S(0.075, F, s * 0.24, 0.33, 0.08, 1, 1.7, 1); arm.rotation.set(-0.7, 0, s * 0.5);
      const leg = S(0.09, F, s * 0.15, 0.1, 0.2, 1, 1, 1.7); leg.rotation.y = s * 0.3;
      S(0.06, L, s * 0.19, 0.1, 0.345, 1, 1, 0.35).rotation.y = s * 0.3;
    }
    S(0.085, L, 0, 0.56, 0.15, 1, 0.8, 0.8); S(0.028, dark, 0, 0.59, 0.21, 1.2, 0.8, 0.8);
    const R = pop(0xf59ab5);
    for (const s of [-1, 1]) { const b = S(0.06, R, s * 0.07, 0.44, 0.17, 1.2, 0.8, 0.5); b.rotation.z = s * 0.3; }
    S(0.03, R, 0, 0.44, 0.18);
  },

  // おもちゃばこ：ふたの あいた はこ。ほしの かざり・ボール・つみき・あひる。
  toybox(K, c, w, d) {
    const P = body(c, 0.6), W = wood(0xd9b98a), bw = w - 0.2, bd = 0.62, z = -(d / 2 - bd / 2 - 0.12), hh = 0.5;
    K.box(bw, 0.04, bd, W, 0, 0.06, z);
    for (const s of [-1, 1]) { K.box(bw, hh, 0.04, P, 0, 0.08 + hh / 2, z + s * (bd / 2 - 0.02), { plain: true }); K.box(0.04, hh, bd - 0.08, P, s * (bw / 2 - 0.02), 0.08 + hh / 2, z, { plain: true }); }
    for (const x of [-bw / 2 + 0.06, bw / 2 - 0.06]) for (const dz of [-bd / 2 + 0.06, bd / 2 - 0.06]) K.ball(0.05, W, x, 0.052, z + dz, 8);
    K.box(bw + 0.02, 0.03, bd, W, 0, 0.6, z, { plain: false });
    const lid = K.box(bw + 0.04, 0.045, bd + 0.02, P, 0, 0.84, z - bd / 2 + 0.07, { plain: true }); lid.rotation.x = -1.32;
    K.box(bw - 0.3, 0.02, 0.5, flat(0x241811, 0.95), 0, 0.613, z, { plain: true });
    for (const [x, col] of [[-bw / 2 + 0.3, 0xf7d774], [0, 0xfffaf3], [bw / 2 - 0.3, 0xf7d774]]) puff(K, starShape(0.11), 0.012, 0.004, flat(col, 0.5), x, 0.34, z + bd / 2 + 0.008);
    K.ball(0.16, flat(0xe9573f, 0.45), -bw / 2 + 0.34, 0.72, z - 0.02, 16); K.add(new THREE.TorusGeometry(0.161, 0.014, 5, 24), flat(0xfffaf3, 0.5), -bw / 2 + 0.34, 0.72, z - 0.02).rotation.set(0.5, 0, 0.4);
    [[0.05, 0.69, 0.08, 0x6fa8dc, 0.3], [0.24, 0.7, -0.08, 0xf7d774, -0.4], [0.14, 0.86, 0.0, 0x8ff0c8, 0.7]].forEach(([x, y, dz, col, ry]) => { K.box(0.17, 0.17, 0.17, flat(col, 0.55), x, y, z + dz, { plain: true }).rotation.set(0.1, ry, 0.12); });
    const duck = flat(0xffd23f, 0.45), dx = bw / 2 - 0.3;
    K.ball(0.11, duck, dx, 0.7, z + 0.04, 12).scale.set(1, 0.85, 1.25); K.ball(0.075, duck, dx, 0.83, z + 0.12, 12);
    K.ball(0.03, flat(0xe27a2d, 0.5), dx, 0.815, z + 0.2, 8).scale.set(1.1, 0.5, 1.2); for (const s of [-1, 1]) K.ball(0.012, flat(0x241811, 0.3), dx + s * 0.04, 0.855, z + 0.175, 6);
  },

  // ビーズクッション：しずくの かたち。上に ちいさな クッション。
  beanbag(K, c) {
    const F = cloth(c);
    K.lathe([[0, 0], [0.3, 0], [0.4, 0.06], [0.44, 0.18], [0.4, 0.34], [0.3, 0.48], [0.2, 0.56], [0.1, 0.6], [0, 0.6]], F, 0, 0, 0, 22);
    const dent = K.ball(0.26, cloth(tint(c, 0.9)), 0, 0.5, 0.12, 14); dent.scale.set(1.1, 0.5, 0.9); dent.rotation.x = 0.5;
    K.lathe([[0, 0], [0.035, 0], [0.045, 0.03], [0, 0.05]], cloth(tint(c, 0.8)), 0, 0.6, -0.02, 8);
    const p = K.soft(0.26, 0.26, 0.09, 0.04, pop(0x8ff0c8), -0.16, 0.6, -0.14); p.rotation.set(Math.PI / 2 - 0.6, 0.5, 0.2);
  },

  // クッション：ゆかの まるい クッションに ハートと ほし。
  cushion(K, c) {
    K.lathe([[0, 0], [0.3, 0], [0.4, 0.05], [0.42, 0.1], [0.4, 0.15], [0.3, 0.2], [0, 0.2]], linen(0xfff4d6), 0, 0, 0, 24);
    K.ball(0.03, pop(0xffb066), 0, 0.2, 0, 8).scale.y = 0.5;
    const h = puff(K, heartShape(0.24), 0.07, 0.055, cloth(c), -0.06, 0.38, -0.1); h.rotation.set(-0.5, 0.25, 0.1);
    const s = puff(K, starShape(0.2, 0.11), 0.06, 0.045, pop(0xf7d774), 0.14, 0.27, 0.14); s.rotation.set(-1.2, 0, 0.3);
  },

  // すいそう：木の だい・ガラスの 水そう（中が 光る）・さかな・水草・すな。
  fishtank(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.74)), dark = flat(0x23282c, 0.5), bw = w - 0.16, dep = 0.56, z = -(d / 2 - dep / 2 - 0.1);
    K.box(bw, 0.7, dep, W, 0, 0.39, z); K.box(bw + 0.04, 0.05, dep + 0.04, D, 0, 0.765, z); K.box(bw + 0.02, 0.05, dep + 0.02, D, 0, 0.025, z);
    for (const s of [-1, 1]) { K.box(bw / 2 - 0.08, 0.54, 0.014, D, s * bw / 4, 0.4, z + dep / 2 + 0.006); K.ball(0.02, brass(), s * 0.06, 0.42, z + dep / 2 + 0.025, 8); }
    const tw = bw - 0.1, th = 0.62, td = dep - 0.1, y0 = 0.79;
    K.box(tw, 0.03, td, dark, 0, y0 + 0.015, z, { plain: true });
    const tt = tankTex();
    K.add(new THREE.PlaneGeometry(tw - 0.02, th), picture('tank', tt, 0x4fb0cc, 0.6), 0, y0 + 0.03 + th / 2, z - td / 2 + 0.012);
    K.box(tw - 0.03, 0.05, td - 0.03, flat(0xe9d9a8, 1), 0, y0 + 0.055, z, { plain: true });
    for (const [x, col, y, s] of [[-0.45, 0xff8a3c, 0.3, 1], [0.1, 0xf7d774, 0.42, 0.8], [0.5, 0xff6f91, 0.22, 0.9], [-0.1, 0xffffff, 0.2, 0.7]]) {
      const F = lit(col, 0.35); const b = K.ball(0.06 * s, F, x, y0 + y, z + 0.02, 10); b.scale.set(1.6, 1, 0.55);
      const t = K.add(new THREE.ConeGeometry(0.05 * s, 0.09 * s, 4), F, x - 0.12 * s, y0 + y, z + 0.02); t.rotation.z = -Math.PI / 2; t.scale.z = 0.3;
      K.ball(0.01 * s, flat(0x111111, 0.3), x + 0.055 * s, y0 + y + 0.012, z + 0.05, 6);
    }
    for (const [x, hh] of [[-0.7, 0.34], [-0.62, 0.22], [0.7, 0.4], [0.3, 0.2]]) K.add(new THREE.ConeGeometry(0.035, hh, 5), lit(0x3fae6c, 0.25), x, y0 + 0.08 + hh / 2, z - 0.1);
    K.ball(0.07, flat(0x8a8f96, 0.9), 0.36, y0 + 0.11, z + 0.08, 8).scale.set(1.3, 0.8, 1);
    K.box(tw, th, td, glass(0x9fe3f2, 0.22), 0, y0 + 0.03 + th / 2, z, { plain: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.022, th, 0.022, dark, sx * (tw / 2 - 0.011), y0 + 0.03 + th / 2, z + sz * (td / 2 - 0.011), { plain: true });
    K.box(tw + 0.02, 0.05, td + 0.02, dark, 0, y0 + 0.055 + th, z, { plain: true });
    K.box(tw - 0.2, 0.012, 0.1, lit(0xeafcff, 0.9), 0, y0 + 0.026 + th, z, { plain: true });
  },

  // カーテン：白い まど（そとは 青空）・こしかべ・しんちゅうの ぼう・たばねた カーテン。
  curtain(K, c, w, d) {
    const W = frame(0xfffaf3, 0.5), z = -(d / 2 - 0.12), bw = w - 0.12, y0 = 0.92, wh = 1.16;
    K.box(bw, y0, 0.1, W, 0, y0 / 2, z, { plain: true });
    for (const x of [-bw / 4, bw / 4]) K.box(bw / 2 - 0.14, y0 - 0.26, 0.012, flat(0xf1e8dc, 0.6), x, y0 / 2, z + 0.055, { plain: true });
    K.box(bw + 0.06, 0.05, 0.22, W, 0, y0 + 0.025, z + 0.05, { plain: true });
    const st = skyTex();
    K.add(new THREE.PlaneGeometry(bw - 0.3, wh), picture('sky', st, 0xbfe6ff, 0.75), 0, y0 + 0.05 + wh / 2, z);
    K.box(bw - 0.3, wh, 0.02, glass(0xffffff, 0.12), 0, y0 + 0.05 + wh / 2, z + 0.02, { plain: true });
    for (const s of [-1, 1]) K.box(0.07, wh + 0.1, 0.1, W, s * (bw / 2 - 0.12), y0 + 0.05 + wh / 2, z, { plain: true });
    K.box(bw - 0.2, 0.07, 0.1, W, 0, y0 + 0.09 + wh, z, { plain: true });
    K.box(0.04, wh, 0.05, W, 0, y0 + 0.05 + wh / 2, z + 0.01, { plain: true }); K.box(bw - 0.3, 0.04, 0.05, W, 0, y0 + 0.05 + wh / 2, z + 0.01, { plain: true });
    const ry = y0 + wh + 0.24, cz = z + 0.13;
    K.cyl(0.016, 0.016, bw + 0.04, brass(), 0, ry, cz, 8).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) K.ball(0.04, brass(), s * (bw / 2 + 0.02), ry, cz, 10);
    const ch = ry - 0.12, cm = drapeMat(c);
    for (const s of [-1, 1]) {
      K.add(ribbon(bw / 2 - 0.02, ch, { waves: 5, amp: 0.035, pinch: 0.62, pinchAt: 0.42, anchor: s }), cm, s * (bw / 4 + 0.01), ry - ch / 2, cz);
      K.add(new THREE.TorusGeometry(0.075, 0.016, 6, 14), pop(0xffb066), s * (bw / 2 - 0.13), ry - ch * 0.58, cz).rotation.x = Math.PI / 2;
    }
    K.add(ribbon(bw, 0.24, { waves: 9, amp: 0.03, scallop: 0.45, scallops: 4 }), drapeMat(tint(c, 0.88)), 0, ry - 0.1, cz + 0.035);
    // まどべに ちいさな はち。
    K.lathe([[0, 0], [0.04, 0], [0.06, 0.08], [0, 0.08]], flat(0xb5673f, 0.85), 0.28, y0 + 0.05, z + 0.1, 10); K.ball(0.06, flat(0x5f9f52, 0.6), 0.28, y0 + 0.17, z + 0.1, 8);
  },

  // ほしの ライト：大きな 光る ほし・月・ひかりの つぶの ひも。
  starlight(K, c) {
    const W = wood(0xd9b98a);
    K.cyl(0.24, 0.27, 0.05, W, 0, 0.025, 0, 20);
    K.cyl(0.02, 0.025, 0.36, W, 0, 0.23, 0, 8);
    const star = puff(K, starShape(0.38, 0.19), 0.1, 0.05, lit(tint(c, 0.92), 0.5), 0, 0.78, 0); star.rotation.z = 0.12;
    puff(K, starShape(0.15, 0.075), 0.05, 0.025, lit(0xfff4d6, 0.9), -0.27, 1.2, 0.02).rotation.z = -0.3;
    const dots = [0xfff4d6, 0xffb066, 0x8ff0c8, 0xfff4d6, 0xf59ab5, 0xffb066, 0x8ff0c8, 0xfff4d6, 0xf59ab5];
    dots.forEach((col, i) => { const a = i * 0.8 + 0.3, r = 0.3 - i * 0.012; K.ball(0.03, lit(col, 1), Math.sin(a) * r, 0.1 + i * 0.07, Math.cos(a) * r, 8); });
    K.add(new THREE.TorusGeometry(0.29, 0.004, 4, 40, Math.PI * 2), flat(0x5e422a, 0.8), 0, 0.37, 0).rotation.set(Math.PI / 2 - 0.5, 0, 0);
  },

  // かがみ：あしの ついた すがたみ。上が まるい。
  mirror(K, c) {
    const W = frame(c, 0.45), tiltG = new THREE.Group(); tiltG.position.set(0, 0.16, -0.02); tiltG.rotation.x = -0.1; K.root.add(tiltG);
    const sh = new THREE.Shape(); sh.moveTo(-0.26, 0); sh.lineTo(0.26, 0); sh.lineTo(0.26, 1.3); sh.absarc(0, 1.3, 0.26, 0, Math.PI, false); sh.lineTo(-0.26, 0);
    const fr = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.03, bevelSegments: 2, curveSegments: 14 }); fr.translate(0, 0, -0.0175);
    K.add(fr, W, 0, 0, 0, tiltG);
    const gl = new THREE.Shape(); gl.moveTo(-0.225, 0.035); gl.lineTo(0.225, 0.035); gl.lineTo(0.225, 1.3); gl.absarc(0, 1.3, 0.225, 0, Math.PI, false); gl.lineTo(-0.225, 0.035);
    const gg = new THREE.ShapeGeometry(gl, 14), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) + 0.225) / 0.45, uv.getY(i) / 1.53);
    K.add(gg, picture('mirror', mirrorTex(), 0xcfe6e6, 0.5), 0, 0, 0.031, tiltG);
    puff(K, heartShape(0.07), 0.02, 0.01, brass(), 0, 1.63, 0.0, tiltG);
    for (const s of [-1, 1]) { K.box(0.045, 1.0, 0.04, W, s * 0.31, 0.56, -0.02); K.soft(0.07, 0.04, 0.6, 0.015, W, s * 0.31, 0.03, -0.02); K.ball(0.03, brass(), s * 0.31, 0.78, 0.0, 8); K.ball(0.035, W, s * 0.31, 1.08, -0.02, 8); }
    K.box(0.6, 0.035, 0.035, W, 0, 0.12, -0.02);
  },

  // てんがいつき ベッド：4 本の 高い はしら・上の わく・すける ぬの・白い 木の ヘッドボード。まくらが −z がわ。
  bed_canopy(K, c, w, d) {
    const W = frame(0xfffaf3, 0.45), white = linen(0xfbf7ef), F = cloth(c), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.05, pz = fd / 2 - 0.05, H = 2.24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      K.lathe([[0, 0], [0.05, 0], [0.05, 0.56], [0.036, 0.6], [0.048, 0.66], [0.03, 0.74], [0.028, H - 0.3], [0.046, H - 0.24], [0.03, H - 0.18], [0.03, H - 0.04], [0.05, H - 0.02], [0.05, H + 0.03], [0, H + 0.03]], W, sx * px, 0, sz * pz, 12);
      K.ball(0.05, brass(), sx * px, H + 0.08, sz * pz, 10);
    }
    for (const sz of [-1, 1]) K.box(fw - 0.1, 0.05, 0.05, W, 0, H, sz * pz, { plain: true });
    for (const sx of [-1, 1]) { K.box(0.05, 0.05, fd - 0.1, W, sx * px, H, 0, { plain: true }); K.box(0.05, 0.22, fd - 0.1, W, sx * px, 0.3, 0, { plain: true }); }
    K.box(fw - 0.1, 0.06, fd - 0.1, W, 0, 0.22, 0, { plain: true });
    K.soft(fw - 0.1, 0.95, 0.06, 0.03, W, 0, 0.72, -pz); K.soft(fw - 0.36, 0.5, 0.02, 0.008, cloth(tint(c, 0.92)), 0, 0.86, -pz + 0.04);
    K.soft(fw - 0.1, 0.42, 0.05, 0.02, W, 0, 0.4, pz);
    bedding(K, fw - 0.22, fd - 0.26, 0, 0.6, F, white);
    puff(K, heartShape(0.13), 0.07, 0.05, pop(0xf59ab5), 0, 0.78, -pz + 0.62).rotation.x = -0.9;
    const S = sheer(0xfffdf8, 0.5), dh = H - 0.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = ribbon(0.62, dh, { waves: 4, amp: 0.035, pinch: 0.7, pinchAt: 0.5, anchor: sz, segs: 20 }); g.rotateY(-Math.PI / 2);
      K.add(g, S, sx * (px - 0.012), H - 0.03 - dh / 2, sz * (pz - 0.33));
      K.add(new THREE.TorusGeometry(0.06, 0.014, 6, 12), pop(0xf59ab5), sx * (px - 0.012), H - 0.03 - dh * 0.5, sz * (pz - 0.07)).rotation.x = Math.PI / 2;
    }
    const V = sheer(tint(c, 1.0), 0.7);
    for (const sz of [-1, 1]) K.add(ribbon(fw - 0.1, 0.26, { waves: 8, amp: 0.025, scallop: 0.5, scallops: 4 }), V, 0, H - 0.15, sz * (pz - 0.012));
    for (const sx of [-1, 1]) { const g = ribbon(fd - 0.1, 0.26, { waves: 12, amp: 0.025, scallop: 0.5, scallops: 6 }); g.rotateY(Math.PI / 2); K.add(g, V, sx * (px - 0.012), H - 0.15, 0); }
  },

  // プリンセス ベッド：ピンク。ハートの ヘッドボード・金の かんむり・フリルの すそ。
  bed_princess(K, c, w, d) {
    const W = frame(0xfffaf3, 0.45), white = linen(0xfffaf5), F = cloth(c), deep = cloth(tint(c, 0.86)), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.05, pz = fd / 2 - 0.05;
    for (const sx of [-1, 1]) {
      K.lathe([[0, 0], [0.05, 0], [0.05, 0.5], [0.036, 0.55], [0.05, 0.62], [0.034, 0.7], [0.034, 1.05], [0.05, 1.1], [0, 1.14]], W, sx * px, 0, -pz, 12); K.ball(0.05, brass(), sx * px, 1.18, -pz, 10);
      K.lathe([[0, 0], [0.05, 0], [0.05, 0.5], [0.036, 0.55], [0.05, 0.62], [0.034, 0.7], [0.05, 0.76], [0, 0.8]], W, sx * px, 0, pz, 12); K.ball(0.045, brass(), sx * px, 0.83, pz, 10);
      K.box(0.05, 0.2, fd - 0.1, W, sx * px, 0.34, 0, { plain: true });
    }
    K.box(fw - 0.1, 0.06, fd - 0.1, W, 0, 0.26, 0, { plain: true });
    const hb = puff(K, heartShape(0.9), 0.07, 0.045, deep, 0, 0.98, -pz + 0.01);
    puff(K, heartShape(0.6), 0.03, 0.03, F, 0, 1.0, -pz + 0.075);
    for (let i = 0; i < 5; i += 1) K.ball(0.022, brass(), (i - 2) * 0.2, 1.22 - Math.abs(i - 2) * 0.13 + (i === 2 ? -0.12 : 0), -pz + 0.125, 8);
    // かんむり。
    K.add(new THREE.CylinderGeometry(0.11, 0.1, 0.07, 12, 1, true), M(`crown${LOOK ? `:${LOOK.metal}` : ''}`, () => std({ color: LOOK ? LOOK.metal : 0xd4a84a, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide })), 0, 1.6, -pz + 0.03);
    for (let i = 0; i < 5; i += 1) { const a = i * 1.2566; K.add(new THREE.ConeGeometry(0.03, 0.08, 4), brass(), Math.sin(a) * 0.105, 1.67, -pz + 0.03 + Math.cos(a) * 0.105); K.ball(0.016, lit(0xf59ab5, 0.4), Math.sin(a) * 0.105, 1.72, -pz + 0.03 + Math.cos(a) * 0.105, 6); }
    K.soft(fw - 0.1, 0.4, 0.05, 0.02, W, 0, 0.44, pz); puff(K, heartShape(0.13), 0.02, 0.012, deep, 0, 0.45, pz + 0.03);
    const top = bedding(K, fw - 0.22, fd - 0.26, 0, 0.64, F, white);
    K.soft(fw - 0.14, 0.03, 0.34, 0.014, white, 0, top + 0.012, 0.75);
    for (const x of [-0.5, 0, 0.5]) puff(K, heartShape(0.07), 0.012, 0.008, deep, x, top + 0.035, 0.75).rotation.x = -Math.PI / 2;
    puff(K, heartShape(0.15), 0.08, 0.055, deep, 0, 0.84, -pz + 0.6).rotation.x = -0.85;
    const frill = drapeMat(tint(c, 1.08));
    for (const sx of [-1, 1]) { const g = ribbon(fd - 0.2, 0.3, { waves: 16, amp: 0.022, segs: 64 }); g.rotateY(Math.PI / 2); K.add(g, frill, sx * (px + 0.03), 0.2, 0); }
    K.add(ribbon(fw - 0.2, 0.3, { waves: 10, amp: 0.022, segs: 44 }), frill, 0, 0.2, pz + 0.035);
  },

  // キング ベッド：ふかい みどりの ビロード・たてに キルトした 高い ヘッドボード・金の ふち・足もとに ベンチ。
  bed_king(K, c, w, d) {
    const V = cloth(c), V2 = cloth(tint(c, 1.25)), G = brass(), cream = linen(0xf6efdf), gold = pop(0xcfa64a), fw = w - 0.14, back = -d / 2 + 0.06, bl = 2.32, bz = back + 0.2 + bl / 2;
    K.box(fw + 0.02, 0.035, bl + 0.04, G, 0, 0.075, bz, { plain: true });
    K.soft(fw, 0.3, bl, 0.04, V, 0, 0.24, bz);
    for (const sx of [-1, 1]) for (const z of [bz - bl / 2 + 0.12, bz + bl / 2 - 0.12]) K.lathe([[0, 0], [0.03, 0], [0.05, 0.06], [0, 0.06]], G, sx * (fw / 2 - 0.12), 0, z, 10);
    // ヘッドボード。
    K.soft(fw, 1.5, 0.12, 0.05, V, 0, 0.8, back + 0.06);
    const n = 8, cw = (fw - 0.24) / n;
    for (let i = 0; i < n; i += 1) K.soft(cw - 0.012, 1.12, 0.1, 0.045, V2, -(fw - 0.24) / 2 + (i + 0.5) * cw, 0.92, back + 0.13);
    K.box(fw - 0.06, 0.03, 0.15, G, 0, 1.56, back + 0.07, { plain: true });
    for (const sx of [-1, 1]) { K.soft(0.13, 1.4, 0.42, 0.045, V, sx * (fw / 2 - 0.065), 0.76, back + 0.22); K.box(0.02, 1.3, 0.02, G, sx * (fw / 2 - 0.02), 0.78, back + 0.44, { plain: true }); }
    for (let i = 0; i <= n; i += 1) K.ball(0.02, G, -(fw - 0.24) / 2 + i * cw, 1.2 - (i % 2) * 0.5, back + 0.175, 8);
    // ねどこ。
    const mw = fw - 0.3, top = 0.68, mz = bz + 0.06, md = bl - 0.2;
    K.soft(mw, 0.3, md, 0.08, cream, 0, top - 0.15, mz);
    for (let i = 0; i < 3; i += 1) { const p = K.soft(mw / 3 - 0.06, 0.5, 0.16, 0.07, cream, -mw / 2 + (i + 0.5) * mw / 3, top + 0.22, mz - md / 2 + 0.16); p.rotation.x = -0.28; }
    for (const sx of [-1, 1]) { const p = K.soft(0.6, 0.4, 0.15, 0.065, V2, sx * 0.55, top + 0.17, mz - md / 2 + 0.36); p.rotation.x = -0.4; }
    const bol = K.cyl(0.1, 0.1, 0.7, gold, 0, top + 0.1, mz - md / 2 + 0.56, 14); bol.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) K.ball(0.03, G, sx * 0.36, top + 0.1, mz - md / 2 + 0.56, 8);
    const dl = md * 0.62, dz = mz + md / 2 - dl / 2 + 0.03;
    K.soft(mw + 0.1, 0.17, dl, 0.08, cream, 0, top + 0.03, dz);
    K.soft(mw + 0.1, 0.06, 0.34, 0.028, linen(0xfffaf3), 0, top + 0.125, dz - dl / 2 + 0.16);
    K.soft(mw + 0.12, 0.05, 0.5, 0.024, V, 0, top + 0.125, dz + dl / 2 - 0.34);
    K.box(mw + 0.125, 0.012, 0.04, G, 0, top + 0.15, dz + dl / 2 - 0.57, { plain: true }); K.box(mw + 0.125, 0.012, 0.04, G, 0, top + 0.15, dz + dl / 2 - 0.11, { plain: true });
    // 足もとの ベンチ。
    const ez = d / 2 - 0.24, ew = fw - 0.7;
    for (const sx of [-1, 1]) for (const dz2 of [-0.12, 0.12]) K.lathe([[0, 0], [0.018, 0], [0.03, 0.26], [0, 0.26]], G, sx * (ew / 2 - 0.08), 0, ez + dz2, 8);
    K.soft(ew, 0.16, 0.36, 0.06, V2, 0, 0.34, ez);
    for (let i = 0; i < 5; i += 1) K.ball(0.018, G, -ew / 2 + 0.2 + i * (ew - 0.4) / 4, 0.425, ez, 8);
  },

  // にだん ベッド：木の 2 だん。上の だんに てすり・足もとに はしご。
  bed_bunk(K, c, w, d) {
    const W = wood(0xc79a63), D = wood(0x9a7245), white = linen(0xf6f1e7), F = cloth(c), F2 = pop(0xffb066), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.045, pz = fd / 2 - 0.045;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box(0.09, 1.95, 0.09, D, sx * px, 0.975, sz * pz); K.ball(0.05, D, sx * px, 1.97, sz * pz, 8); }
    for (const [y, sl] of [[0.3, 0], [1.22, 1]]) {
      for (const sx of [-1, 1]) K.box(0.04, 0.18, fd - 0.16, W, sx * px, y, 0);
      K.box(fw - 0.12, 0.05, fd - 0.16, D, 0, y - 0.04, 0);
      K.box(fw - 0.14, 0.5, 0.04, W, 0, y + 0.22, -pz); K.box(fw - 0.14, sl ? 0.34 : 0.3, 0.04, W, 0, y + 0.14, pz);
      bedding(K, fw - 0.22, fd - 0.3, 0, y + 0.22, sl ? F : F2, white, { thick: 0.16, pillows: 1 });
    }
    for (const sx of [-1, 1]) { K.box(0.035, 0.06, fd - 0.16, W, sx * px, 1.6, 0); for (const z of [-0.9, -0.3, 0.3, 0.9]) K.box(0.03, 0.26, 0.03, W, sx * px, 1.46, z, { plain: true }); }
    // はしご（足もと・右より）。
    const lz = fd / 2 + 0.01;
    for (const x of [0.2, 0.62]) K.box(0.045, 1.62, 0.04, D, x, 0.81, lz);
    for (let i = 0; i < 5; i += 1) K.cyl(0.018, 0.018, 0.42, W, 0.41, 0.22 + i * 0.3, lz, 8).rotation.z = Math.PI / 2;
  },

  // ---- 2026-11 の おわり：あたらしい 形 22（どれも スタイルつきで 売る） -----------------------

  // べんきょうづくえ：ひきだし 3 だん・うしろに 本だな・デスクライト・ノート。
  desk(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.78)), G = brass(), dw = w - 0.14, dd = 0.7, z = -(d / 2 - dd / 2 - 0.08);
    K.soft(dw, 0.05, dd, 0.018, W, 0, 0.745, z);
    K.box(0.05, 0.72, dd - 0.08, D, -dw / 2 + 0.05, 0.36, z);
    K.box(0.5, 0.72, dd - 0.08, D, dw / 2 - 0.27, 0.36, z);
    for (let i = 0; i < 3; i += 1) { const y = 0.14 + i * 0.22; K.box(0.44, 0.19, 0.02, W, dw / 2 - 0.27, y, z + dd / 2 - 0.03); K.cyl(0.012, 0.012, 0.16, G, dw / 2 - 0.27, y, z + dd / 2 - 0.008, 6).rotation.z = Math.PI / 2; }
    K.box(dw - 0.62, 0.34, 0.02, D, -0.26, 0.54, z - dd / 2 + 0.06);
    const hz = z - dd / 2 + 0.12;
    for (const s of [-1, 1]) K.box(0.04, 0.52, 0.22, W, s * (dw / 2 - 0.02), 1.03, hz);
    K.box(dw, 0.04, 0.24, W, 0, 1.27, hz); K.box(dw - 0.08, 0.03, 0.22, W, 0, 1.02, hz);
    K.box(dw - 0.08, 0.5, 0.015, D, 0, 1.03, hz - 0.1);
    const bw = 0.62, bg = new THREE.BoxGeometry(bw, 0.21, 0.15), uv = bg.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) { if (Math.floor(i / 4) === 4) uv.setXY(i, 0.1 + uv.getX(i) * bw * 0.52, 0.06 + uv.getY(i) * 0.94); else uv.setXY(i, 0.02, 0.02); }
    K.add(bg, booksMat(), -dw / 2 + 0.38, 1.14, hz + 0.01);
    K.ball(0.07, flat(0x4f8fb0, 0.3), dw / 2 - 0.2, 1.105, hz + 0.02, 12);
    // デスクライト。
    const lx = -dw / 2 + 0.2, lz = z + 0.02;
    K.cyl(0.08, 0.09, 0.02, G, lx, 0.78, lz, 14); K.cyl(0.012, 0.012, 0.3, G, lx + 0.05, 0.92, lz, 6).rotation.z = -0.35;
    const sh = K.add(new THREE.ConeGeometry(0.09, 0.11, 14, 1, true), shadeMat(0xfff0c8, 0.8, 'desk'), lx + 0.14, 1.06, lz); sh.rotation.z = -0.5;
    // ノートと えんぴつたて。
    K.box(0.3, 0.012, 0.22, flat(0xfaf6ea, 0.9), 0.02, 0.777, z + 0.12, { plain: true }).rotation.y = 0.12;
    K.box(0.14, 0.004, 0.2, flat(0x3f6ac4, 0.8), -0.06, 0.785, z + 0.13, { plain: true }).rotation.y = 0.12;
    K.cyl(0.04, 0.035, 0.09, pop(0xffb066), 0.42, 0.815, z - 0.12, 10);
    for (const [dx, col] of [[-0.012, 0xe2463c], [0.012, 0xf7d774], [0, 0x3f78c9]]) K.cyl(0.006, 0.006, 0.14, flat(col, 0.6), 0.42 + dx, 0.9, z - 0.12 + dx, 5).rotation.z = dx * 14;
  },

  // キャスターの いす：5 本あし・ガスの 柱・ざと 背の クッション・ひじかけ。
  officechair(K, c) {
    const F = cloth(c), dark = LOOK ? wood(0x8d6642) : flat(0x2b3036, 0.5), G = brass();
    for (let i = 0; i < 5; i += 1) { const a = i * 1.2566 + 0.3; K.box(0.3, 0.035, 0.05, dark, Math.sin(a) * 0.17, 0.085, Math.cos(a) * 0.17, { plain: true }).rotation.y = a - Math.PI / 2; K.ball(0.04, dark, Math.sin(a) * 0.32, 0.04, Math.cos(a) * 0.32, 8); }
    K.cyl(0.05, 0.06, 0.07, dark, 0, 0.1, 0, 10); K.cyl(0.025, 0.03, 0.3, G, 0, 0.28, 0, 8);
    K.box(0.3, 0.04, 0.3, dark, 0, 0.44, 0, { plain: true });
    K.soft(0.54, 0.11, 0.52, 0.05, F, 0, 0.51, 0.02);
    K.box(0.07, 0.36, 0.035, dark, 0, 0.62, -0.27, { plain: true });
    K.soft(0.52, 0.56, 0.1, 0.045, F, 0, 0.9, -0.27).rotation.x = -0.1;
    for (const s of [-1, 1]) { K.box(0.035, 0.2, 0.04, dark, s * 0.3, 0.58, 0.0, { plain: true }); K.soft(0.07, 0.035, 0.3, 0.015, dark, s * 0.3, 0.695, 0); }
  },

  // スツール：まるい クッションと 木の 4 本あし。
  stool(K, c) {
    const W = wood(0xa97c50), F = cloth(c);
    for (let i = 0; i < 4; i += 1) { const a = i * 1.5708 + 0.785; K.leg(0.33, 0.036, W, Math.cos(a) * 0.19, Math.sin(a) * 0.19); }
    K.add(new THREE.TorusGeometry(0.19, 0.013, 6, 20), W, 0, 0.13, 0).rotation.x = Math.PI / 2;
    K.cyl(0.27, 0.27, 0.04, W, 0, 0.345, 0, 22);
    K.lathe([[0, 0], [0.27, 0], [0.3, 0.05], [0.27, 0.11], [0.14, 0.135], [0, 0.14]], F, 0, 0.365, 0, 22);
    K.ball(0.028, pop(0xffb066), 0, 0.5, 0, 8).scale.y = 0.5;
  },

  // ベンチ：木の すのこ・ひじかけ・ながい ざぶとん・クッション 2 つ。
  bench(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.8)), F = cloth(0xc0564a), bw = w - 0.14;
    for (const s of [-1, 1]) {
      const x = s * (bw / 2 - 0.04);
      K.box(0.07, 0.6, 0.07, D, x, 0.3, 0.24); K.box(0.07, 0.88, 0.07, D, x, 0.44, -0.24);
      K.soft(0.09, 0.04, 0.6, 0.015, W, x, 0.62, 0);
    }
    for (let i = 0; i < 4; i += 1) K.box(bw - 0.1, 0.03, 0.115, W, 0, 0.42, -0.21 + i * 0.14);
    for (let i = 0; i < 3; i += 1) K.box(bw - 0.1, 0.09, 0.025, W, 0, 0.58 + i * 0.12, -0.255);
    K.box(bw - 0.14, 0.05, 0.03, D, 0, 0.36, 0.24); K.box(bw - 0.14, 0.05, 0.03, D, 0, 0.36, -0.24);
    K.soft(bw - 0.24, 0.07, 0.46, 0.03, F, 0, 0.47, 0.01);
    K.soft(0.32, 0.32, 0.11, 0.05, pop(0xe6b655), -bw / 2 + 0.36, 0.67, -0.1).rotation.set(Math.PI / 2 - 0.3, 0, 0.18);
    K.soft(0.3, 0.3, 0.11, 0.05, F, bw / 2 - 0.36, 0.66, -0.1).rotation.set(Math.PI / 2 - 0.3, 0, -0.2);
  },

  // ローテーブル：だ円の 天板と 下の たな・ティーポットと カップ・ざっし。
  coffeetable(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.78)), tw = w - 0.2, td = d - 0.24, china = flat(0xfffaf3, 0.3);
    K.cyl(0.5, 0.5, 0.045, W, 0, 0.4, 0, 36).scale.set(tw, 1, td);
    K.cyl(0.5, 0.5, 0.03, D, 0, 0.16, 0, 30).scale.set(tw * 0.72, 1, td * 0.7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(0.032, 0.022, 0.39, D, sx * tw * 0.31, 0.195, sz * td * 0.29, 8);
    K.cyl(0.21, 0.21, 0.012, brass(), -0.28, 0.428, 0, 24);
    K.lathe([[0, 0], [0.05, 0], [0.085, 0.04], [0.085, 0.09], [0.05, 0.125], [0.02, 0.13], [0.025, 0.15], [0, 0.155]], china, -0.32, 0.434, -0.02, 14);
    K.cyl(0.012, 0.018, 0.09, china, -0.22, 0.51, -0.02, 6).rotation.z = -0.9;
    K.add(new THREE.TorusGeometry(0.035, 0.009, 5, 10), china, -0.41, 0.5, -0.02);
    K.add(new THREE.TorusGeometry(0.086, 0.008, 5, 18), pop(0xffb066), -0.32, 0.5, -0.02).rotation.x = Math.PI / 2;
    for (const [x, z] of [[-0.2, 0.12], [-0.16, -0.14]]) { K.lathe([[0, 0], [0.02, 0], [0.036, 0.03], [0.038, 0.05], [0.032, 0.05], [0.03, 0.03], [0, 0.012]], china, x, 0.434, z, 12); K.cyl(0.03, 0.03, 0.004, flat(0xa0522d, 0.5), x, 0.476, z, 10); }
    K.box(0.3, 0.02, 0.22, flat(0x3f6ac4, 0.7), 0.42, 0.432, 0.02, { plain: true }).rotation.y = 0.25;
    K.box(0.28, 0.018, 0.2, pop(0xe27a2d), 0.44, 0.451, 0.02, { plain: true }).rotation.y = -0.1;
    K.box(0.3, 0.05, 0.2, flat(0x4aa06a, 0.7), 0.1, 0.2, 0, { plain: true }).rotation.y = 0.2;
  },

  // たんす：ひきだし 3 だん × 2 れつ・上に たたんだ ふくと しゃしんたて。
  drawers(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.76)), G = brass(), bw = w - 0.16, dep = 0.6, z = -(d / 2 - dep / 2 - 0.08);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.lathe([[0, 0], [0.03, 0], [0.05, 0.1], [0, 0.1]], D, sx * (bw / 2 - 0.08), 0, z + sz * (dep / 2 - 0.08), 10);
    K.box(bw, 0.84, dep, W, 0, 0.52, z);
    K.soft(bw + 0.07, 0.05, dep + 0.06, 0.02, D, 0, 0.965, z);
    K.box(bw + 0.03, 0.04, dep + 0.03, D, 0, 0.12, z);
    const fz = z + dep / 2;
    for (let r = 0; r < 3; r += 1) for (const s of [-1, 1]) {
      const x = s * bw / 4, y = 0.27 + r * 0.26;
      K.box(bw / 2 - 0.06, 0.22, 0.02, D, x, y, fz + 0.008); K.box(bw / 2 - 0.12, 0.16, 0.02, W, x, y, fz + 0.016);
      K.ball(0.024, G, x, y, fz + 0.04, 8);
    }
    const F = cloth(0xc0564a);
    K.soft(0.42, 0.06, 0.3, 0.025, F, -bw / 2 + 0.34, 1.02, z); K.soft(0.4, 0.055, 0.29, 0.025, linen(0xf6f1e7), -bw / 2 + 0.34, 1.078, z); K.soft(0.38, 0.055, 0.28, 0.025, pop(0x7fa9c4), -bw / 2 + 0.34, 1.134, z);
    const ph = K.box(0.22, 0.28, 0.02, G, bw / 2 - 0.34, 1.13, z - 0.06, { plain: true }); ph.rotation.x = -0.14;
    K.add(new THREE.PlaneGeometry(0.17, 0.23), picture('sky', skyTex(), 0xbfe6ff, 0.5), bw / 2 - 0.34, 1.13, z - 0.048).rotation.x = -0.14;
  },

  // かざりだな：下は とびら・上は ガラスの たな（カップ・トロフィー・かびん）。
  cabinet(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.76)), G = brass(), bw = w - 0.14, dep = 0.5, z = -(d / 2 - dep / 2 - 0.08), fz = z + dep / 2;
    K.box(bw + 0.04, 0.08, dep + 0.04, D, 0, 0.04, z);
    K.box(bw, 0.62, dep, W, 0, 0.39, z);
    for (const s of [-1, 1]) { K.box(bw / 2 - 0.06, 0.5, 0.02, D, s * bw / 4, 0.39, fz + 0.008); K.box(bw / 2 - 0.14, 0.4, 0.02, W, s * bw / 4, 0.39, fz + 0.016); K.ball(0.02, G, s * 0.05, 0.42, fz + 0.035, 8); }
    K.box(bw + 0.04, 0.04, dep + 0.04, D, 0, 0.72, z);
    for (const s of [-1, 1]) K.box(0.05, 1.12, dep, W, s * (bw / 2 - 0.025), 1.3, z);
    K.box(bw - 0.1, 1.12, 0.02, D, 0, 1.3, z - dep / 2 + 0.01);
    for (const y of [1.1, 1.47]) K.box(bw - 0.1, 0.025, dep - 0.06, W, 0, y, z);
    K.box(bw + 0.06, 0.07, dep + 0.06, D, 0, 1.895, z); K.soft(bw - 0.1, 0.07, dep - 0.1, 0.03, W, 0, 1.955, z);
    for (const s of [-1, 1]) K.box(0.03, 1.12, 0.03, W, s * 0.0, 1.3, fz - 0.015);
    K.box(bw - 0.1, 1.12, 0.012, glass(0xdff6f8, 0.2), 0, 1.3, fz - 0.01, { plain: true });
    const china = flat(0xfffaf3, 0.3);
    for (const x of [-0.22, -0.08]) K.lathe([[0, 0], [0.02, 0], [0.04, 0.04], [0.042, 0.07], [0, 0.07]], china, x, 0.74, z + 0.04, 10);
    K.cyl(0.1, 0.1, 0.012, pop(0xffb066), 0.2, 0.8, z, 16).rotation.x = Math.PI / 2 - 0.25;
    K.lathe([[0, 0], [0.05, 0], [0.05, 0.02], [0.012, 0.04], [0.012, 0.09], [0.06, 0.16], [0.065, 0.2], [0, 0.2]], G, -0.14, 1.113, z, 12);
    K.ball(0.07, flat(0x4f8fb0, 0.3), 0.18, 1.18, z, 12);
    K.lathe([[0, 0], [0.04, 0], [0.07, 0.07], [0.04, 0.16], [0.025, 0.2], [0.04, 0.23]], pop(0xf59ab5), 0.16, 1.483, z, 12);
    K.box(0.2, 0.16, 0.04, cloth(0xc0564a), -0.14, 1.56, z, { plain: true });
  },

  // れいぞうこ：2 ドア・とって・マグネット・上に かご。
  fridge(K, c, w, d) {
    const B = body(c, 0.3), G = brass(), dark = flat(0x2b3036, 0.6), bw = w - 0.22, dep = 0.72, z = -(d / 2 - dep / 2 - 0.08), fz = z + dep / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(0.03, 0.03, 0.05, dark, sx * (bw / 2 - 0.08), 0.025, z + sz * (dep / 2 - 0.08), 8);
    K.soft(bw, 1.72, dep, 0.04, B, 0, 0.91, z);
    K.soft(bw - 0.02, 0.5, 0.05, 0.02, B, 0, 1.49, fz + 0.01); K.soft(bw - 0.02, 1.12, 0.05, 0.02, B, 0, 0.65, fz + 0.01);
    K.box(bw - 0.02, 0.012, 0.03, dark, 0, 1.225, fz + 0.005, { plain: true });
    for (const [y, hh] of [[1.42, 0.26], [0.98, 0.4]]) { K.cyl(0.016, 0.016, hh, G, -bw / 2 + 0.1, y, fz + 0.075, 8); for (const e of [-1, 1]) K.cyl(0.012, 0.012, 0.05, G, -bw / 2 + 0.1, y + e * (hh / 2 - 0.02), fz + 0.055, 6).rotation.x = Math.PI / 2; }
    puff(K, heartShape(0.045), 0.008, 0.004, flat(0xe2463c, 0.5), 0.16, 1.56, fz + 0.04);
    puff(K, starShape(0.05), 0.008, 0.004, flat(0xf7d774, 0.5), 0.04, 1.42, fz + 0.04);
    K.box(0.16, 0.2, 0.006, flat(0xfaf6ea, 0.9), 0.14, 0.86, fz + 0.04, { plain: true }).rotation.z = 0.06;
    K.box(0.4, 0.1, 0.3, pop(0xffb066), 0, 1.82, z, { plain: true });
    for (const [x, col] of [[-0.1, 0xe2463c], [0.03, 0xf7d774], [0.12, 0x6fae6a]]) K.ball(0.06, flat(col, 0.5), x, 1.88, z + 0.02, 10);
  },

  // キッチン：コンロ（なべ）・ながし（じゃぐち）・オーブン・うしろに タイルと たな。
  kitchen(K, c, w, d) {
    const B = body(c, 0.4), W = wood(0xa97c50), G = brass(), dark = flat(0x23282c, 0.5), steel = metalMat(0xcfd6dc), bw = w - 0.12, dep = 0.66, z = -(d / 2 - dep / 2 - 0.1), fz = z + dep / 2;
    K.box(bw, 0.08, dep - 0.06, dark, 0, 0.04, z, { plain: true });
    K.box(bw, 0.76, dep, B, 0, 0.46, z);
    K.soft(bw + 0.04, 0.05, dep + 0.05, 0.018, W, 0, 0.865, z + 0.01);
    // オーブン（左）と とびら（右）。
    K.soft(0.74, 0.5, 0.03, 0.012, dark, -bw / 4, 0.42, fz + 0.01); K.box(0.56, 0.3, 0.01, lit(0xffb066, 0.35), -bw / 4, 0.4, fz + 0.027, { plain: true });
    K.cyl(0.014, 0.014, 0.6, G, -bw / 4, 0.7, fz + 0.045, 6).rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i += 1) K.cyl(0.026, 0.026, 0.03, G, -bw / 4 - 0.27 + i * 0.18, 0.8, fz + 0.012, 10).rotation.x = Math.PI / 2;
    for (const s of [0, 1]) { const x = 0.08 + s * 0.43 + 0.2; K.box(0.4, 0.62, 0.02, B, x, 0.44, fz + 0.012); K.cyl(0.012, 0.012, 0.18, G, x - 0.14 + s * 0.28, 0.56, fz + 0.04, 6); }
    // コンロと なべ。
    K.box(0.76, 0.012, 0.5, dark, -bw / 4, 0.896, z + 0.02, { plain: true });
    for (const [x, zz] of [[-0.18, 0.12], [0.18, 0.12], [-0.18, -0.12], [0.18, -0.12]]) K.add(new THREE.TorusGeometry(0.08, 0.012, 5, 16), flat(0x555a60, 0.6), -bw / 4 + x, 0.905, z + 0.02 + zz).rotation.x = Math.PI / 2;
    K.cyl(0.11, 0.1, 0.13, pop(0xe2463c), -bw / 4 - 0.18, 0.975, z + 0.14, 16); K.cyl(0.115, 0.115, 0.015, G, -bw / 4 - 0.18, 1.045, z + 0.14, 16); K.ball(0.022, dark, -bw / 4 - 0.18, 1.065, z + 0.14, 8);
    for (const s of [-1, 1]) K.box(0.05, 0.016, 0.03, dark, -bw / 4 - 0.18 + s * 0.13, 1.01, z + 0.14, { plain: true });
    // ながし。
    K.box(0.6, 0.02, 0.4, steel, bw / 4 + 0.02, 0.893, z + 0.04, { plain: true }); K.box(0.5, 0.012, 0.3, flat(0x8a949c, 0.4), bw / 4 + 0.02, 0.906, z + 0.04, { plain: true });
    K.cyl(0.016, 0.02, 0.22, steel, bw / 4 + 0.02, 1.0, z - 0.2, 8); K.cyl(0.014, 0.014, 0.16, steel, bw / 4 + 0.02, 1.1, z - 0.13, 6).rotation.x = Math.PI / 2;
    // うしろの タイルと たな。
    const tz = z - dep / 2 + 0.03;
    K.box(bw, 0.62, 0.04, flat(0xfffaf3, 0.3), 0, 1.2, tz, { plain: true });
    for (let i = 1; i < 8; i += 1) K.box(0.008, 0.62, 0.005, flat(0xd8d2c4, 0.6), -bw / 2 + i * bw / 8, 1.2, tz + 0.021, { plain: true });
    for (const y of [1.1, 1.3]) K.box(bw, 0.008, 0.005, flat(0xd8d2c4, 0.6), 0, y, tz + 0.021, { plain: true });
    K.box(bw, 0.34, 0.3, B, 0, 1.69, tz + 0.13); K.box(bw + 0.02, 0.03, 0.32, W, 0, 1.52, tz + 0.14);
    for (const s of [-1, 0, 1]) K.ball(0.018, G, s * bw / 3 + 0.1, 1.64, tz + 0.29, 6);
    for (const [x, col] of [[-0.7, 0xf7d774], [-0.58, 0x8ff0c8], [-0.46, 0xf59ab5]]) K.cyl(0.04, 0.035, 0.08, flat(col, 0.4), x, 1.575 - 0.04 + 0.04, tz + 0.2, 10);
  },

  // おふろ：ねこあしの バスタブ・あわ・じゃぐち・あひる。
  bathtub(K, c, w, d) {
    const B = body(c, 0.3), G = brass(), white = flat(0xfffaf3, 0.25), sx = (w - 0.16), sz = (d - 0.16);
    const outer = K.lathe([[0, 0.16], [0.3, 0.16], [0.42, 0.3], [0.47, 0.55], [0.5, 0.63], [0.5, 0.66]], B, 0, 0, 0, 30); outer.scale.set(sx, 1, sz);
    const inner = K.lathe([[0.5, 0.66], [0.47, 0.67], [0.45, 0.62], [0.4, 0.34], [0.28, 0.24], [0, 0.23]], white, 0, 0, 0, 30); inner.scale.set(sx, 1, sz);
    K.add(new THREE.TorusGeometry(0.485, 0.022, 6, 36), white, 0, 0.665, 0).rotation.x = Math.PI / 2; K.root.children[K.root.children.length - 1].scale.set(sx, sz, 1);
    for (const ax of [-1, 1]) for (const az of [-1, 1]) K.lathe([[0, 0], [0.05, 0], [0.06, 0.03], [0.03, 0.08], [0.045, 0.16], [0.06, 0.2], [0, 0.22]], G, ax * sx * 0.3, 0, az * sz * 0.26, 10);
    K.cyl(0.45, 0.45, 0.01, M('bathwater', () => std({ color: 0xbfe9f5, roughness: 0.15, emissive: 0x6fbfd8, emissiveIntensity: 0.15 })), 0, 0.56, 0, 30).scale.set(sx, 1, sz);
    const foam = flat(0xffffff, 0.9), r = rng(9);
    for (let i = 0; i < 16; i += 1) K.ball(0.05 + r() * 0.06, foam, -sx * 0.36 + r() * sx * 0.42, 0.58 + r() * 0.05, (r() - 0.5) * sz * 0.5, 8);
    K.cyl(0.02, 0.024, 0.3, G, sx * 0.47, 0.72, 0, 8); K.cyl(0.016, 0.016, 0.16, G, sx * 0.47 - 0.07, 0.86, 0, 6).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) K.ball(0.026, G, sx * 0.47, 0.76, s * 0.07, 8);
    const duck = flat(0xffd23f, 0.45), dx = sx * 0.16;
    K.ball(0.08, duck, dx, 0.6, 0.06, 12).scale.set(1.25, 0.85, 1); K.ball(0.055, duck, dx + 0.07, 0.69, 0.06, 12); K.ball(0.022, flat(0xe27a2d, 0.5), dx + 0.125, 0.68, 0.06, 8).scale.set(1.2, 0.5, 1.1);
  },

  // せんたくき：まるい とびら（中に せんたくもの）・ダイヤル・上に タオル。
  washer(K, c, w, d) {
    const B = body(c, 0.3), G = brass(), dark = flat(0x23282c, 0.5), bw = w - 0.22, dep = 0.7, z = -(d / 2 - dep / 2 - 0.1), fz = z + dep / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(0.035, 0.035, 0.05, dark, sx * (bw / 2 - 0.08), 0.025, z + sz * (dep / 2 - 0.08), 8);
    K.soft(bw, 0.84, dep, 0.035, B, 0, 0.47, z);
    K.box(bw - 0.06, 0.13, 0.012, dark, 0, 0.8, fz + 0.002, { plain: true });
    K.cyl(0.04, 0.04, 0.03, G, bw / 2 - 0.14, 0.8, fz + 0.015, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i += 1) K.ball(0.012, lit([0x8ff0c8, 0xffb066, 0xfff4d6][i], 1), -0.04 + i * 0.07, 0.8, fz + 0.01, 6);
    K.box(0.2, 0.07, 0.012, B, -bw / 2 + 0.16, 0.8, fz + 0.012, { plain: true });
    K.add(new THREE.TorusGeometry(0.23, 0.035, 8, 28), G, 0, 0.42, fz + 0.01);
    K.add(new THREE.CircleGeometry(0.21, 28), M('washdoor', () => std({ color: 0x2f5f86, roughness: 0.15, emissive: 0x3f8fc0, emissiveIntensity: 0.25 })), 0, 0.42, fz + 0.012);
    for (const [x, y, col, s] of [[-0.06, 0.37, 0xf59ab5, 0.09], [0.07, 0.4, 0xfff4d6, 0.08], [0.0, 0.48, 0x8ff0c8, 0.07]]) K.ball(s, flat(col, 0.9), x, y, fz + 0.0, 8).scale.z = 0.3;
    K.box(0.05, 0.1, 0.03, G, 0.25, 0.42, fz + 0.03, { plain: true });
    K.soft(0.44, 0.07, 0.34, 0.03, cloth(0xc0564a), -0.06, 0.925, z); K.soft(0.42, 0.06, 0.32, 0.028, linen(0xf6f1e7), -0.06, 0.975 - 0.012, z);
  },

  // ロフト ベッド：上が ベッド（てすり・はしご）、下は ひみつきち（クッション・ライト・たな）。まくらが −z がわ。
  bed_loft(K, c, w, d) {
    const W = wood(0xc79a63), D = wood(0x9a7245), white = linen(0xf6f1e7), F = cloth(c), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.045, pz = fd / 2 - 0.045, y = 1.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box(0.09, 2.08, 0.09, D, sx * px, 1.04, sz * pz); K.ball(0.05, D, sx * px, 2.1, sz * pz, 8); }
    for (const sx of [-1, 1]) K.box(0.04, 0.18, fd - 0.16, W, sx * px, y, 0);
    K.box(fw - 0.12, 0.05, fd - 0.16, D, 0, y - 0.04, 0);
    K.box(fw - 0.14, 0.56, 0.04, W, 0, y + 0.25, -pz); K.box(fw - 0.14, 0.36, 0.04, W, 0, y + 0.15, pz);
    bedding(K, fw - 0.22, fd - 0.3, 0, y + 0.22, F, white, { thick: 0.16, pillows: 1 });
    for (const sx of [-1, 1]) { K.box(0.035, 0.06, fd - 0.16, W, sx * px, y + 0.42, 0); for (const z of [-0.9, -0.3, 0.3, 0.9]) K.box(0.03, 0.3, 0.03, W, sx * px, y + 0.27, z, { plain: true }); }
    const lz = fd / 2 + 0.01;
    for (const x of [0.2, 0.62]) K.box(0.045, y + 0.42, 0.04, D, x, (y + 0.42) / 2, lz);
    for (let i = 0; i < 5; i += 1) K.cyl(0.018, 0.018, 0.42, W, 0.41, 0.22 + i * 0.3, lz, 8).rotation.z = Math.PI / 2;
    // 下の ひみつきち：うしろに ぬのの かべ・たな・ゆかに クッション・ひかりの つぶ。
    K.add(ribbon(fw - 0.2, 1.1, { waves: 7, amp: 0.02 }), drapeMat(c), 0, 0.68, -pz + 0.06);
    K.box(fw - 0.3, 0.035, 0.26, W, 0, 0.62, -pz + 0.2); K.box(0.26, 0.2, 0.18, booksMat(), -0.4, 0.74, -pz + 0.2, { plain: true });
    K.ball(0.08, lit(0xfff0c8, 0.9), 0.36, 0.72, -pz + 0.2, 10); K.cyl(0.05, 0.06, 0.03, brass(), 0.36, 0.65, -pz + 0.2, 10);
    K.lathe([[0, 0], [0.3, 0], [0.38, 0.06], [0.36, 0.14], [0.2, 0.19], [0, 0.2]], pop(0xffb066), -0.3, 0, 0.1, 18);
    K.soft(0.36, 0.36, 0.12, 0.055, F, 0.34, 0.2, 0.3).rotation.set(Math.PI / 2 - 0.9, 0.4, 0);
    const dots = [0xfff4d6, 0xffb066, 0x8ff0c8, 0xf59ab5, 0xfff4d6, 0xffb066, 0x8ff0c8, 0xf59ab5, 0xfff4d6];
    dots.forEach((col, i) => K.ball(0.028, lit(col, 1), -fw / 2 + 0.2 + i * (fw - 0.4) / 8, 1.16 - Math.sin(i / 8 * Math.PI) * 0.12, pz - 0.04, 6));
  },

  // テント：ティピー。5 本の ぼう・ぬのの かべ（前が あいて いる）・中に クッションと ランタン・はた。
  tent(K, c, w, d) {
    const W = wood(0xc79a63), R = Math.min(w, d) / 2 - 0.16, H = 1.62, gap = 0.5;
    const cone = new THREE.ConeGeometry(R, H, 10, 4, true, gap, Math.PI * 2 - gap * 2);
    metric(cone, Math.PI * 2 * R * 0.6, Math.hypot(R, H));
    K.add(cone, drapeMat(c), 0, H / 2 + 0.02, 0);
    for (let i = 0; i < 5; i += 1) {
      const a = gap + i * (Math.PI * 2 - gap * 2) / 4, bx = Math.sin(a) * (R + 0.02), bz = Math.cos(a) * (R + 0.02);
      K.rod(0.024, 0.018, [bx, 0.02, bz], [-bx * 0.13, H * 1.13, -bz * 0.13], W);
    }
    K.add(new THREE.TorusGeometry(0.07, 0.02, 5, 12), pop(0xffb066), 0, H - 0.12, 0).rotation.x = Math.PI / 2;
    // ひらいた 入口の ぬの（左右に たばねる）。
    for (const s of [-1, 1]) { const g = ribbon(0.5, 1.1, { waves: 3, amp: 0.03, pinch: 0.55, pinchAt: 0.4, anchor: s, segs: 14 }); const m = K.add(g, drapeMat(tint(c, 0.86)), s * 0.42, 0.62, R * 0.72); m.rotation.y = -s * 0.5; m.rotation.x = -0.36; }
    K.lathe([[0, 0], [0.28, 0], [0.36, 0.05], [0.34, 0.12], [0.2, 0.16], [0, 0.17]], pop(0xffb066), -0.12, 0.01, -0.05, 18);
    K.soft(0.3, 0.3, 0.1, 0.045, linen(0xfff4d6), 0.2, 0.16, -0.2).rotation.set(Math.PI / 2 - 0.8, -0.4, 0);
    K.cyl(0.05, 0.06, 0.03, brass(), 0.3, 0.02, 0.2, 10); K.cyl(0.045, 0.045, 0.1, lit(0xfff0c8, 1), 0.3, 0.085, 0.2, 10); K.cyl(0.055, 0.02, 0.04, brass(), 0.3, 0.155, 0.2, 10);
    K.cyl(R + 0.03, R + 0.03, 0.012, linen(0xf1e3c4), 0, 0.006, 0, 24);
    const flags = [0xf7d774, 0x8ff0c8, 0xf59ab5, 0xffb066, 0x6fa8dc];
    flags.forEach((col, i) => { const t = (i + 0.5) / 5, a = -0.42 + t * 0.84; const f = K.add(new THREE.ConeGeometry(0.06, 0.12, 3), flat(col, 0.7), Math.sin(a) * R * 0.5, 1.02 - Math.sin(t * Math.PI) * 0.08, Math.cos(a) * R * 0.5 + 0.02); f.rotation.x = Math.PI; f.scale.z = 0.2; f.rotation.y = a; });
  },

  // もくば：ゆれる 木馬。たてがみ・しっぽ・くら・にぎる ぼう。あたまが +z。
  rockinghorse(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.74)), F = cloth(0xc0564a), mane = pop(0xf1e3c4), R = 1.5, arc = 1.1;
    for (const s of [-1, 1]) {
      const m = K.add(new THREE.TorusGeometry(R, 0.03, 6, 24, arc), D, s * 0.22, R + 0.03, 0);
      m.rotation.order = 'YXZ'; m.rotation.set(0, Math.PI / 2, -Math.PI / 2 - arc / 2);
    }
    for (const z of [-0.5, 0.5]) K.box(0.5, 0.03, 0.07, D, 0, 0.115, z);
    for (const s of [-1, 1]) for (const z of [-0.3, 0.3]) { const l = K.cyl(0.035, 0.03, 0.46, W, s * 0.17, 0.3, z + Math.sign(z) * 0.04, 8); l.rotation.x = Math.sign(z) * 0.18; l.rotation.z = -s * 0.1; }
    K.ball(0.2, W, 0, 0.62, 0, 16).scale.set(0.85, 0.85, 1.75);
    const neck = K.cyl(0.085, 0.12, 0.42, W, 0, 0.84, 0.36, 10); neck.rotation.x = 0.5;
    K.ball(0.1, W, 0, 1.0, 0.52, 12).scale.set(0.85, 0.9, 1.7);
    for (const s of [-1, 1]) { K.add(new THREE.ConeGeometry(0.03, 0.08, 6), W, s * 0.05, 1.11, 0.42); K.ball(0.018, flat(0x241811, 0.3), s * 0.075, 1.02, 0.58, 6); }
    for (let i = 0; i < 6; i += 1) K.ball(0.05, mane, 0, 1.08 - i * 0.07, 0.4 - i * 0.045, 8).scale.set(0.5, 1, 1);
    const tail = K.cyl(0.02, 0.05, 0.3, mane, 0, 0.56, -0.42, 8); tail.rotation.x = -0.6;
    K.soft(0.36, 0.05, 0.3, 0.022, F, 0, 0.8, -0.02); K.box(0.365, 0.2, 0.06, F, 0, 0.7, -0.02);
    K.cyl(0.015, 0.015, 0.34, brass(), 0, 0.93, 0.42, 6).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) K.ball(0.025, pop(0xe2463c), s * 0.17, 0.93, 0.42, 8);
    K.add(new THREE.TorusGeometry(0.115, 0.012, 5, 14), pop(0xe2463c), 0, 0.98, 0.5).rotation.x = Math.PI / 2 - 0.5;
  },

  // ドールハウス：前が あいた 2 かいだて。やね・えんとつ・小さな ベッドと テーブル。
  dollhouse(K, c, w, d) {
    const B = body(c, 0.6), W = wood(0xa97c50), roof = pop(0xe2463c), bw = w - 0.3, dep = 0.6, z = -(d / 2 - dep / 2 - 0.12), wh = 0.92;
    K.box(bw + 0.1, 0.05, dep + 0.08, W, 0, 0.025, z);
    for (const s of [-1, 1]) K.box(0.04, wh, dep, B, s * (bw / 2 - 0.02), 0.05 + wh / 2, z);
    K.box(bw - 0.08, wh, 0.03, B, 0, 0.05 + wh / 2, z - dep / 2 + 0.015);
    K.box(bw - 0.08, 0.03, dep - 0.03, W, 0, 0.05 + wh / 2, z); K.box(0.03, wh / 2, dep - 0.03, W, 0.1, 0.05 + wh / 4, z);
    K.box(bw + 0.02, 0.03, dep, W, 0, 0.05 + wh + 0.015, z);
    const tri = new THREE.Shape(); tri.moveTo(-bw / 2 - 0.08, 0); tri.lineTo(bw / 2 + 0.08, 0); tri.lineTo(0, 0.44); tri.lineTo(-bw / 2 - 0.08, 0);
    const rg = new THREE.ExtrudeGeometry(tri, { depth: dep + 0.06, bevelEnabled: false }); rg.translate(0, 0, -(dep + 0.06) / 2);
    K.add(rg, roof, 0, 0.05 + wh + 0.03, z);
    K.box(0.12, 0.26, 0.12, B, bw / 4, 0.05 + wh + 0.34, z - 0.1); K.box(0.15, 0.03, 0.15, W, bw / 4, 0.05 + wh + 0.48, z - 0.1);
    K.add(new THREE.CircleGeometry(0.09, 16), picture('sky', skyTex(), 0xbfe6ff, 0.6), 0, 0.05 + wh + 0.19, z + dep / 2 + 0.032);
    K.add(new THREE.TorusGeometry(0.09, 0.014, 5, 16), linen(0xfffaf3), 0, 0.05 + wh + 0.19, z + dep / 2 + 0.034);
    for (const y of [0.3, 0.76]) for (const s of [-1, 1]) K.add(new THREE.PlaneGeometry(0.2, 0.2), picture('sky', skyTex(), 0xbfe6ff, 0.6), s * (bw / 2 + 0.001), y, z).rotation.y = s * Math.PI / 2;
    // 中の かぐ。
    K.soft(0.3, 0.07, 0.2, 0.025, linen(0xfffaf3), -bw / 4 - 0.04, 0.125, z); K.soft(0.2, 0.05, 0.2, 0.02, cloth(0xf59ab5), -bw / 4 + 0.02, 0.16, z); K.box(0.03, 0.2, 0.22, W, -bw / 4 - 0.2, 0.17, z);
    K.cyl(0.1, 0.1, 0.015, W, bw / 4 + 0.06, 0.2, z, 12); K.cyl(0.015, 0.03, 0.14, W, bw / 4 + 0.06, 0.12, z, 6);
    K.soft(0.26, 0.12, 0.14, 0.04, cloth(0xf59ab5), -bw / 4, 0.6, z - 0.1); K.soft(0.26, 0.2, 0.05, 0.02, cloth(0xf59ab5), -bw / 4, 0.66, z - 0.18);
    K.ball(0.05, lit(0xfff0c8, 0.9), bw / 4, 0.88, z, 8);
    K.ball(0.06, pop(0xf7d774), bw / 4 + 0.04, 0.6, z + 0.05, 8); K.ball(0.045, linen(0xf6ead6), bw / 4 + 0.04, 0.68, z + 0.05, 8);
  },

  // ギター：スタンドに 立てた アコースティックギター。
  guitar(K, c) {
    const B = body(c, 0.25), N = wood(0x5e422a), dark = flat(0x23282c, 0.5), G = brass();
    for (const s of [-1, 1]) K.rod(0.014, 0.014, [s * 0.26, 0.015, 0.2], [0, 0.42, -0.02], dark);
    K.rod(0.014, 0.014, [0, 0.015, -0.3], [0, 0.42, -0.02], dark);
    K.rod(0.014, 0.014, [0, 0.42, -0.02], [0, 1.0, -0.115], dark); K.box(0.3, 0.02, 0.1, dark, 0, 0.3, 0.05, { plain: true });
    for (const s of [-1, 1]) K.rod(0.012, 0.012, [0, 0.98, -0.11], [s * 0.05, 1.0, -0.02], dark);
    const T = new THREE.Group(); T.position.set(0, 0.32, 0.07); T.rotation.x = -0.16; K.root.add(T);
    const disc = (r, y) => { const m = K.add(metric(new THREE.CylinderGeometry(r, r, 0.1, 24), Math.PI * 2 * r, 0.1), B, 0, y, 0, T); m.rotation.x = Math.PI / 2; return m; };
    disc(0.2, 0.2); disc(0.155, 0.42); disc(0.14, 0.31);
    K.add(new THREE.CircleGeometry(0.055, 18), dark, 0, 0.34, 0.052, T); K.add(new THREE.TorusGeometry(0.06, 0.008, 5, 18), G, 0, 0.34, 0.052, T);
    K.add(new THREE.BoxGeometry(0.14, 0.03, 0.02), N, 0, 0.16, 0.055, T);
    K.add(new THREE.BoxGeometry(0.055, 0.5, 0.03), N, 0, 0.76, 0.045, T);
    K.add(new THREE.BoxGeometry(0.08, 0.14, 0.028), N, 0, 1.06, 0.04, T);
    for (let i = 0; i < 6; i += 1) { K.add(new THREE.BoxGeometry(0.002, 0.9, 0.002), G, -0.02 + i * 0.008, 0.6, 0.063, T); const side = i < 3 ? -1 : 1; K.add(new THREE.SphereGeometry(0.012, 6, 5), G, side * 0.05, 1.02 + (i % 3) * 0.035, 0.04, T); }
    for (let i = 0; i < 5; i += 1) K.add(new THREE.BoxGeometry(0.055, 0.003, 0.004), G, 0, 0.56 + i * 0.09, 0.062, T);
    K.add(new THREE.TorusGeometry(0.02, 0.006, 4, 8), pop(0xe2463c), 0.1, 0.1, 0.05, T);
  },

  // ドラム：バスドラム・スネア・タム 2 つ・フロアタム・シンバル 2 まい・いす。
  drum(K, c, w, d) {
    const B = body(c, 0.3), G = brass(), steel = metalMat(0xcfd6dc), head = flat(0xfbf8f0, 0.6), dark = flat(0x23282c, 0.5);
    const shell = (r, h, x, y, z, tilt = 0) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = tilt; K.root.add(g);
      K.add(metric(new THREE.CylinderGeometry(r, r, h, 22, 1, true), Math.PI * 2 * r, h), B, 0, 0, 0, g);
      for (const s of [-1, 1]) { K.add(new THREE.CylinderGeometry(r - 0.004, r - 0.004, 0.006, 22), head, 0, s * (h / 2 - 0.002), 0, g); K.add(new THREE.TorusGeometry(r, 0.012, 5, 22), steel, 0, s * h / 2, 0, g).rotation.x = Math.PI / 2; }
      return g;
    };
    const bass = shell(0.34, 0.4, 0, 0.36, -0.1, Math.PI / 2);
    puff(K, starShape(0.14), 0.006, 0.003, pop(0xf7d774), 0, 0.36, 0.106);
    for (const s of [-1, 1]) K.rod(0.012, 0.012, [s * 0.36, 0.012, 0.1], [s * 0.26, 0.2, 0.06], steel);
    shell(0.15, 0.16, -0.2, 0.86, -0.08, 0.35); shell(0.17, 0.18, 0.2, 0.87, -0.08, 0.35);
    K.cyl(0.014, 0.014, 0.2, steel, 0, 0.76, -0.1, 6);
    shell(0.17, 0.12, -0.55, 0.62, 0.3, 0.12); for (const a of [0, 2.1, 4.2]) K.rod(0.01, 0.01, [-0.55 + Math.sin(a) * 0.22, 0.01, 0.3 + Math.cos(a) * 0.22], [-0.55 + Math.sin(a) * 0.06, 0.58, 0.3 + Math.cos(a) * 0.06], steel, 5);
    shell(0.21, 0.34, 0.56, 0.42, 0.3, 0); for (const a of [0, 2.1, 4.2]) K.cyl(0.01, 0.01, 0.5, steel, 0.56 + Math.sin(a) * 0.22, 0.25, 0.3 + Math.cos(a) * 0.22, 5);
    for (const [x, z, y, r] of [[-0.74, -0.3, 1.12, 0.2], [0.72, -0.35, 1.16, 0.24]]) {
      K.cyl(0.012, 0.012, y, steel, x, y / 2, z, 6); for (const a of [0.5, 2.6, 4.7]) K.rod(0.009, 0.009, [x + Math.sin(a) * 0.17, 0.01, z + Math.cos(a) * 0.17], [x, 0.24, z], steel, 5);
      const cy = K.add(new THREE.CylinderGeometry(0.03, r, 0.02, 24), G, x, y, z); cy.rotation.set(0.2, 0, x < 0 ? 0.18 : -0.18); K.ball(0.02, steel, x, y + 0.02, z, 6);
    }
    K.cyl(0.16, 0.16, 0.07, cloth(0xc0564a), 0, 0.5, 0.7, 18); K.cyl(0.02, 0.02, 0.46, steel, 0, 0.25, 0.7, 6);
    for (const a of [0, 2.1, 4.2]) K.rod(0.01, 0.01, [Math.sin(a) * 0.17, 0.01, 0.7 + Math.cos(a) * 0.17], [0, 0.26, 0.7], steel, 5);
    K.box(0.1, 0.02, 0.24, dark, 0.02, 0.045, 0.36, { plain: true }).rotation.x = -0.2;
    void bass;
  },

  // キャットタワー：じゅうたんの 台・つめとぎの はしら・はこの いえ・上で ねむる ねこ。
  cattower(K, c) {
    const F = cloth(c), rope = flat(0xcaa56a, 0.95), cat = flat(0xe8964a, 0.8), dark = flat(0x2a1c14, 0.4);
    K.soft(0.84, 0.07, 0.84, 0.03, F, 0, 0.035, 0);
    K.cyl(0.07, 0.07, 1.62, rope, -0.2, 0.86, -0.2, 12); for (let i = 0; i < 14; i += 1) K.add(new THREE.TorusGeometry(0.072, 0.008, 4, 12), flat(0xb08a4f, 0.95), -0.2, 0.12 + i * 0.115, -0.2).rotation.x = Math.PI / 2;
    K.cyl(0.06, 0.06, 0.76, rope, 0.24, 0.44, 0.2, 12);
    K.soft(0.5, 0.05, 0.5, 0.022, F, 0.2, 0.84, 0.16);
    // はこの いえ（まるい 入口）。
    K.soft(0.5, 0.44, 0.48, 0.04, F, -0.12, 1.1, -0.14); K.add(new THREE.CircleGeometry(0.13, 20), dark, -0.12, 1.1, 0.102); K.add(new THREE.TorusGeometry(0.135, 0.02, 6, 20), pop(0xffb066), -0.12, 1.1, 0.1);
    K.soft(0.6, 0.05, 0.56, 0.022, F, -0.1, 1.7, -0.12); K.add(new THREE.TorusGeometry(0.24, 0.035, 6, 20), F, -0.1, 1.74, -0.12).rotation.x = Math.PI / 2;
    // ねこ。
    K.ball(0.15, cat, -0.1, 1.82, -0.12, 14).scale.set(1.25, 0.7, 1); K.ball(0.09, cat, 0.07, 1.86, -0.02, 12);
    for (const s of [-1, 1]) { K.add(new THREE.ConeGeometry(0.03, 0.06, 4), cat, 0.07 + s * 0.05, 1.95, -0.03); K.ball(0.012, dark, 0.1 + s * 0.035, 1.87, 0.06, 6).scale.y = 0.3; }
    K.ball(0.014, flat(0xf59ab5, 0.5), 0.1, 1.845, 0.07, 6);
    const tail = K.add(new THREE.TorusGeometry(0.13, 0.022, 5, 12, 2.2), cat, -0.2, 1.8, 0.0); tail.rotation.x = Math.PI / 2;
    K.cyl(0.003, 0.003, 0.3, dark, 0.42, 0.67, 0.36, 4); K.ball(0.05, pop(0xe2463c), 0.42, 0.5, 0.36, 10);
  },

  // だんろ：木の わく・レンガの 中で もえる 火・まき・上に ろうそくと とけい。
  fireplace(K, c, w, d) {
    const W = wood(c), D = wood(tint(c, 0.78)), brick = flat(0x9a4a36, 0.9), dark = flat(0x1a1412, 1), G = brass(), bw = w - 0.14, dep = 0.5, z = -(d / 2 - dep / 2 - 0.1), fz = z + dep / 2;
    K.box(bw + 0.06, 0.07, dep + 0.2, flat(0x8a8f96, 0.9), 0, 0.035, z + 0.08, { plain: true });
    for (const s of [-1, 1]) { K.box(0.36, 1.1, dep, W, s * (bw / 2 - 0.18), 0.62, z); K.box(0.24, 0.9, 0.02, D, s * (bw / 2 - 0.18), 0.6, fz + 0.008); K.box(0.4, 0.07, dep + 0.04, D, s * (bw / 2 - 0.18), 0.105, z + 0.01); }
    K.box(bw, 0.26, dep, W, 0, 1.04, z); K.box(bw - 0.8, 0.14, 0.02, D, 0, 1.04, fz + 0.008);
    K.soft(bw + 0.12, 0.06, dep + 0.12, 0.022, D, 0, 1.2, z + 0.02);
    K.box(bw - 0.7, 0.86, 0.04, brick, 0, 0.5, z - dep / 2 + 0.06, { plain: true }); for (const s of [-1, 1]) K.box(0.04, 0.86, dep - 0.1, brick, s * (bw / 2 - 0.38), 0.5, z, { plain: true });
    K.box(bw - 0.74, 0.02, dep - 0.08, dark, 0, 0.08, z, { plain: true });
    for (let i = 0; i < 4; i += 1) K.box(bw - 0.74, 0.006, 0.006, flat(0xd8c9b4, 0.9), 0, 0.24 + i * 0.2, z - dep / 2 + 0.082, { plain: true });
    const log = flat(0x6b4a30, 0.95);
    for (const [x, r] of [[-0.14, 0.3], [0.14, -0.3], [0, 0]]) K.cyl(0.055, 0.055, 0.5, log, x, r ? 0.15 : 0.24, z, 8).rotation.set(0, r, Math.PI / 2);
    for (const [x, hh, col, zz] of [[0, 0.5, 0xff7a2d, 0], [-0.14, 0.34, 0xffa53a, 0.03], [0.15, 0.36, 0xffa53a, 0.02], [0.02, 0.28, 0xffe07a, 0.07], [-0.07, 0.2, 0xffe07a, 0.09], [0.1, 0.18, 0xfff2b0, 0.1]]) K.add(new THREE.ConeGeometry(hh * 0.3, hh, 7), lit(col, 1), x, 0.26 + hh / 2, z + zz).scale.z = 0.6;
    for (const s of [-1, 1]) { K.cyl(0.02, 0.03, 0.06, G, s * (bw / 2 - 0.2), 1.26, z, 8); K.cyl(0.014, 0.014, 0.16, linen(0xfffaf3), s * (bw / 2 - 0.2), 1.36, z, 8); K.add(new THREE.ConeGeometry(0.014, 0.04, 6), lit(0xffc45a, 1), s * (bw / 2 - 0.2), 1.46, z); }
    K.soft(0.24, 0.2, 0.08, 0.03, D, 0, 1.33, z); const face = clockTex(0xf1e3c4);
    K.add(new THREE.CircleGeometry(0.075, 20), M('face:mantel', () => std({ color: face ? 0xffffff : 0xf1e3c4, map: face, roughness: 0.5 })), 0, 1.34, z + 0.042);
    K.add(ribbon(bw - 0.3, 0.14, { waves: 6, amp: 0.012, scallop: 0.6, scallops: 5 }), drapeMat(0xc0564a), 0, 1.11, fz + 0.03);
  },

  // ゲームき：アーケードの きかい。光る 画面・レバーと ボタン・かんばん。
  arcade(K, c, w, d) {
    const B = body(c, 0.4), dark = flat(0x1b1e24, 0.5), G = brass(), bw = w - 0.24, dep = 0.74, z = -(d / 2 - dep / 2 - 0.08);
    const side = new THREE.Shape();
    for (const [i, [px, py]] of [[-0.37, 0], [0.33, 0], [0.33, 0.86], [0.37, 0.9], [0.37, 1.0], [0.12, 1.12], [0.06, 1.56], [0.2, 1.6], [0.2, 1.86], [-0.37, 1.86]].entries()) { if (i) side.lineTo(px, py); else side.moveTo(px, py); }
    for (const s of [-1, 1]) { const g = new THREE.ExtrudeGeometry(side, { depth: 0.04, bevelEnabled: false }); g.rotateY(-Math.PI / 2); K.add(g, B, s * (bw / 2 - 0.02) + 0.02, 0, z); }
    K.box(bw - 0.06, 1.84, 0.03, dark, 0, 0.93, z - 0.35, { plain: true });
    K.box(bw - 0.06, 0.86, 0.03, B, 0, 0.43, z + 0.31); K.box(bw - 0.06, 0.03, 0.72, dark, 0, 1.845, z - 0.08, { plain: true });
    K.box(0.2, 0.26, 0.012, dark, 0, 0.36, z + 0.33, { plain: true }); for (const s of [-1, 1]) K.box(0.03, 0.06, 0.012, lit(0xff5544, 0.8), s * 0.04, 0.42, z + 0.338, { plain: true });
    const panel = K.box(bw - 0.06, 0.03, 0.3, dark, 0, 0.95, z + 0.24, { plain: true }); panel.rotation.x = 0.36;
    K.cyl(0.012, 0.012, 0.1, G, -0.16, 1.03, z + 0.2, 6); K.ball(0.035, lit(0xe2463c, 0.5), -0.16, 1.09, z + 0.2, 10);
    for (const [x, zz, col] of [[0.04, 0.2, 0xf7d774], [0.14, 0.17, 0x8ff0c8], [0.22, 0.22, 0x6fa8dc], [0.1, 0.27, 0xf59ab5]]) K.cyl(0.03, 0.03, 0.02, lit(col, 0.7), x, 0.985 - (zz - 0.2) * 0.38, z + zz, 10).rotation.x = 0.36;
    const st = arcadeTex(), scr = K.add(new THREE.PlaneGeometry(bw - 0.14, 0.42), picture('arcade', st, 0x1b2a6b, 0.8), 0, 1.34, z + 0.085); scr.rotation.x = -0.14;
    K.box(bw - 0.06, 0.5, 0.02, dark, 0, 1.34, z + 0.07, { plain: true }).rotation.x = -0.14;
    K.box(bw - 0.06, 0.24, 0.02, lit(LOOK ? LOOK.pop : 0xffb066, 0.7), 0, 1.72, z + 0.19, { plain: true });
    for (let i = 0; i < 3; i += 1) puff(K, starShape(0.05), 0.006, 0.002, lit(0xfff4d6, 1), -0.16 + i * 0.16, 1.72, z + 0.204);
  },

  // ついたて：3 まいの びょうぶ。木の わくに ぬのの パネル。
  screen(K, c, w, d) {
    const W = wood(0xa97c50), F = drapeMat(c), pw = (w - 0.2) / 3 / Math.cos(0.42), H = 1.74;
    for (let i = 0; i < 3; i += 1) {
      const a = (i % 2 ? -1 : 1) * 0.42, g = new THREE.Group(); g.position.set((i - 1) * (w - 0.2) / 3, 0, 0); g.rotation.y = a; K.root.add(g);
      for (const s of [-1, 1]) { const m = K.add(new THREE.BoxGeometry(0.045, H, 0.045), W, s * (pw / 2 - 0.0225), H / 2 + 0.03, 0, g); void m; K.add(new THREE.SphereGeometry(0.03, 8, 6), W, s * (pw / 2 - 0.0225), H + 0.05, 0, g); }
      for (const y of [0.16, H - 0.02, H * 0.36]) K.add(new THREE.BoxGeometry(pw - 0.06, 0.045, 0.035), W, 0, y, 0, g);
      const pg = new THREE.PlaneGeometry(pw - 0.09, H * 0.64 - 0.06); metric(pg, pw - 0.09, H * 0.64 - 0.06); K.add(pg, F, 0, H * 0.68, 0, g);
      const lg = new THREE.PlaneGeometry(pw - 0.09, H * 0.36 - 0.2); K.add(lg, M(`lattice:${LOOK ? LOOK.id : c}`, () => std({ color: LOOK ? tint(LOOK.wood, LOOK.wk === 'paint' ? 0.9 : 1.12) : 0xd9b98a, roughness: 0.8, side: THREE.DoubleSide })), 0, H * 0.36 / 2 + 0.07, 0, g);
      for (const x of [-1, 0, 1]) K.add(new THREE.BoxGeometry(0.02, H * 0.36 - 0.2, 0.03), W, x * (pw - 0.09) / 4, H * 0.36 / 2 + 0.07, 0, g);
    }
  },

  // まるい ラグ：もようの まるい しきもの。ふちに ふさ。
  roundrug(K, c, w, d) {
    const R = Math.min(w, d) / 2 - 0.1, rim = cloth0(LOOK ? tint(LOOK.pat === 'plain' || LOOK.pat === 'velvet' ? LOOK.fab : LOOK.pop, 0.74) : tint(c, 0.7));
    K.cyl(R, R, 0.024, rim, 0, 0.012, 0, 40);
    const top = new THREE.CircleGeometry(R - 0.1, 40), uv = top.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (R - 0.1) * 2, uv.getY(i) * (R - 0.1) * 2);
    K.add(top, cloth(c), 0, 0.027, 0).rotation.x = -Math.PI / 2;
    K.add(new THREE.TorusGeometry(R - 0.1, 0.012, 4, 40), linen(0xf1e3c4), 0, 0.024, 0).rotation.x = Math.PI / 2;
    const fr = linen(0xf1e3c4);
    for (let i = 0; i < 36; i += 1) { const a = i * Math.PI / 18; K.box(0.07, 0.01, 0.03, fr, Math.sin(a) * (R + 0.03), 0.006, Math.cos(a) * (R + 0.03), { plain: true }).rotation.y = a - Math.PI / 2; }
  },
};

export const REAL_FURNITURE = Object.keys(BUILD);

const templates = new Map();
// わくの ない ぬのの 形（ラグ・ぬいぐるみ・クッション）：木と きんぞくの スタイルは その 色の ぬのに する（きんぞくは つやの ある ぬの）。
// furniture-data.js の styleColor と 同じ きまり（品の color が その 色に なって いる）。
const softLooks = new Map();
function softLook(style, design) {
  const soft = design?.soft || 0;
  if (!(style.group === 'metal' ? soft >= 1 : style.group === 'wood' && soft === 1)) return style;
  if (!softLooks.has(style.id)) softLooks.set(style.id, { ...style, fab: style.wood, pat: 'plain', satin: style.group === 'metal' });
  return softLooks.get(style.id);
}
const templateKey = (item) => `${item.shape}:${item.style || ''}:${Number(item.color) || 0xb0a08a}:${Number(item.w) || 1}:${Number(item.d) || 1}`;
// 1 つ 組み立てて 材質ごとに まとめる。スタイルつきの 品は 組み立てて いる 間だけ LOOK を 入れる。
function construct(item) {
  const make = BUILD[item?.shape];
  if (!make) return null;
  const style = item.style ? styleById(item.style) : null;
  if (item.style && !style) return null;
  const c = Number(item.color) || 0xb0a08a, w = Number(item.w) || 1, d = Number(item.d) || 1;
  const design = style ? designById(item.shape) : null, role = design?.role || '';
  LOOK = style ? softLook(style, design) : null; REF_FAB = role === 'fabric' || role === 'glow' ? c : 0; REF_WOOD = role === 'wood' ? c : 0;
  try {
    const K = kit();
    make(K, c, w, d);
    return bake(K.root);
  } finally { LOOK = null; REF_FAB = 0; REF_WOOD = 0; }
}
// その かぐの 見本（まとめた 形）。へやに 置いた ものだけが ここに のこる（1 しゅるい＋色に 1 つ）。
function template(item) {
  if (!BUILD[item?.shape]) return null;
  const key = templateKey(item);
  if (!templates.has(key)) templates.set(key, construct(item));
  return templates.get(key);
}
const instance = (t) => {
  const g = new THREE.Group();
  for (const m of t.children) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = m.castShadow; c.receiveShadow = true; g.add(c); }
  return g;
};

// かぐ 1 つ。まんなかが 原点・底が y = 0・うしろが −z、大きさは item.w × item.d マス。
// 形と 材質は 見本と 同じ もの（みんなで つかう）。知らない 形は null。
export function furnitureModel(item) {
  const t = template(item);
  return t ? instance(t) : null;
}

// ---- お店の カードの 絵 ----------------------------------------------------------------
// 品は 1000 を こえるので **見えて いる カードの 分だけ** 1 まいずつ 焼く（furnitureShot）。小さな レンダラーを 1 つ 借りて、
// 数秒 使わなければ 手ばなす。焼いた 絵（data URL）は 新しい じゅんに SHOT_CAP まいまで おぼえる。
// 絵の ために 組み立てた 形は その場で 捨てる（へやに 置いて ある 形＝templates は さわらない）。材質と もようは みんなで つかう。
const SHOT_SIZE = 192, SHOT_CAP = 420;
const shotCache = new Map();      // id → data URL（古い ものから 捨てる）
const shotWait = new Map();       // id → { item, promise, resolve }
let rig = null, rigIdle = 0, pumping = false;

function makeRig() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SHOT_SIZE, SHOT_SIZE); renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  // うつりこみの 部屋（food-real.js の renderShots と 同じ：明るい 天井・まど 2 つ・あたたかい ゆか）。
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x9aa7b4, side: THREE.BackSide })));
  const panel = (x, y, z, w, h, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  panel(0, 5.5, 0, 8, 8, 0xffffff); panel(-5, 2, 3, 5, 6, 0xffffff); panel(5, 1.5, 2, 3, 5, 0xfff0d8); panel(0, -5.5, 0, 12, 12, 0xcdb89a);
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(room, 0.03).texture;
  room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  const scene = new THREE.Scene(); scene.environment = env;
  const key = new THREE.DirectionalLight(0xfff4e2, 2.4); key.position.set(-2.2, 4, 2.6); key.castShadow = true; key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 12 }); key.shadow.radius = 6; key.shadow.bias = -0.002; scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.22 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30); cam.position.set(0.2, 1.55, 2.9); cam.lookAt(0, 0.44, 0);
  return { renderer, scene, cam, env, pm };
}
function dropRig() {
  if (!rig) return;
  try { rig.env.dispose(); rig.pm.dispose(); rig.renderer.dispose(); rig.renderer.forceContextLoss(); } catch { /* 捨てるだけ */ }
  rig = null;
}
// 1 くらいの 大きさに そろえて 底を y = 0 に。
function fitUnit(inner) {
  const g = new THREE.Group(); g.add(inner);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), k = 1 / Math.max(size.x, size.y, size.z);
  inner.scale.multiplyScalar(k); box.setFromObject(inner); const c = box.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= box.min.y;
  return g;
}
function drawShot(item) {
  const key = templateKey(item), kept = templates.get(key), t = kept || construct(item);
  if (!t) return null;
  const inner = instance(t);
  let u;
  // ひらたい もの（ラグ）は 少し おこして、上から 見た もようが わかる ように。
  if ((Number(item.h) || 1) < 0.2) { const lift = new THREE.Group(); inner.rotation.x = 0.55; lift.add(inner); u = fitUnit(lift); u.position.y = 0.12; } else {
    u = fitUnit(inner);
    // ひくくて よこに 長い もの（ソファ・ベッド）は 少し 大きく して、絵の まんなかへ 上げる。
    const hh = new THREE.Box3().setFromObject(u).getSize(new THREE.Vector3()).y, k = hh < 0.6 ? 1.2 : 0.96;
    u.scale.setScalar(k); u.position.y = Math.max(0, (0.88 - hh * k) / 2) * 0.85;
  }
  u.rotation.y = -0.62;
  rig.scene.add(u);
  let url = null;
  try {
    rig.renderer.render(rig.scene, rig.cam);
    url = rig.renderer.domElement.toDataURL('image/webp', 0.9);
  } finally {
    rig.scene.remove(u);
    if (!kept) for (const m of t.children) m.geometry.dispose();
  }
  return url;
}
function remember(id, url) {
  shotCache.delete(id); shotCache.set(id, url);
  while (shotCache.size > SHOT_CAP) shotCache.delete(shotCache.keys().next().value);
}
function pump() {
  pumping = false;
  const t0 = Date.now();
  while (shotWait.size && Date.now() - t0 < 14) {
    const [id, job] = shotWait.entries().next().value;
    shotWait.delete(id);
    let url = null;
    try {
      if (!rig) rig = makeRig();
      url = drawShot(job.item);
      if (url) remember(id, url);
    } catch (err) {
      // WebGL が ない（検査の Node・古い たんまつ）：この 先も かけないので ぜんぶ あきらめる。カードは 色の 四角の まま。
      try { console.warn('[kagu] 絵が 作れない', err?.message || err); } catch { /* 言えなくても よい */ }
      job.resolve(null); for (const other of shotWait.values()) other.resolve(null); shotWait.clear(); dropRig(); return;
    }
    job.resolve(url);
  }
  clearTimeout(rigIdle);
  if (shotWait.size) schedule(); else rigIdle = setTimeout(() => { if (!shotWait.size) dropRig(); }, 5000);
}
function schedule() {
  if (pumping) return;
  pumping = true;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump); else setTimeout(pump, 0);
}
// もう 焼いて ある 絵（なければ ''）。
export const furnitureShotNow = (id) => shotCache.get(id) || '';
// その 品の 絵（data URL）。かけなければ null。同じ 品を 2 回 たのんでも 焼くのは 1 回。
export function furnitureShot(item) {
  if (!item || !BUILD[item.shape]) return Promise.resolve(null);
  const have = shotCache.get(item.id);
  if (have) { remember(item.id, have); return Promise.resolve(have); }
  const waiting = shotWait.get(item.id);
  if (waiting) return waiting.promise;
  const job = { item };
  job.promise = new Promise((resolve) => { job.resolve = resolve; });
  shotWait.set(item.id, job);
  schedule();
  return job.promise;
}
// まだ 焼いて いない たのみを やめる（ページを めくった・お店を とじた）。keep に ある id は のこす。
export function cancelFurnitureShots(keep = null) {
  for (const [id, job] of [...shotWait]) { if (keep && keep.has(id)) continue; shotWait.delete(id); job.resolve(null); }
}
// 品の ならびを まとめて（一覧の ページ・前からの よびかた）。{ id: data URL }。
export function furnitureShots(list) {
  const out = {};
  return Promise.all((list || []).map((f) => furnitureShot(f).then((url) => { if (url) out[f.id] = url; }))).then(() => (Object.keys(out).length ? out : null));
}
