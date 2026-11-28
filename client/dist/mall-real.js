// ショッピングモール（外がわ と 中の 吹きぬけ）— 2026-11「この ショッピングモールの 3D モデル 作っといて」→「超リアルに。でも重くならないように」。
//
// 写真は 本物の チェーンの モール。**名前・ロゴ・字体は まねしない**：ここは つくった 名前「U-SPEAK MALL／ユースピーク モール」と、
// ふつうの お店の 看板（BOOKS ほん・CAFE カフェ・TOYS おもちゃ …）だけ。形の 雰囲気（かどの ガラスの 円筒・看板の たて列・木の 吹きぬけ）を もらう。
//
// リアルに 見せる しかけ（どれも 1 回 作って 使いまわす・光は 足さない・毎フレームの 計算は ほぼ なし）：
// ・ガラス＝自前の シェーダー 1 つ（ShaderMaterial）。① 空の 絵（正距円筒の canvas）を フレネルで うつす（ななめほど 鏡）、
//   ② ガラスの 向こうに「部屋の 箱」を 計算で 描く（インテリア マッピング：床・天井の あかり・横の かべ・おくの かべ＝部屋の 絵）。
//   ループなし・テクスチャ 2〜3 回。外の ガラスは ぜんぶ 1 回の 描画（店・レストラン・オフィス・アトリウムは 頂点色で えらぶ）。
// ・かべ・床・木・石＝もようの 帯（512×256 を 4 本 たてに ならべた canvas）を 1 まいの 材質で。帯は UV の 100 の くらいで えらぶ。
//   もようの 明るさから でこぼこ（法線）と つや（roughness）を つくる。かどの かげ・かべの 足もとの よごれは 位置の 式（AO）。
// ・金属・つやの ある ものは 空の 絵を envMap に（three が 1 回だけ PMREM に する）。
// ・木は real-trees.js（葉の 絵の 板・風で ゆれる）。たれる みどりは 葉の 絵の 板。人は ふつうの 頭身（はだ・服・かみを 分けて、
//   1 体ずつ 色を かえる／歩く 足と うでは 頂点シェーダー）。
// ・光の けはい：あしもとの かげ（ぼかしの 円）・ダウンライトの 光の 輪・天窓の 光の すじ（加算の 板）。
// ・もようは canvas の 絵（try/catch）。document が ない（Node の テスト）ときは もようなしで 形だけ 作る。
// ・どの 島にも まだ 置いて いない（置く 場所は あとで きめる）。見本は /dev-mall.html。
//
// buildMallExterior() … はば 70・おく 20（+ かどの 円筒が 前へ 5.5・前の 歩道 11）・高さ 約 24。原点は 正面の 地面の まんなか、+z が 正面（道の がわ）。
//   左から：ガラスの アトリウム（まるい 屋根）→ ベージュの しまの 棟（看板の たて列 3 本・RESTAURANT）→ かどの ガラスの 円筒（入口）→ 金色の 塔 → 青い ガラスの 棟。
// buildMallInterior() … 40 × 30 の ゆか・3 階（ゆか y 0 / 5.5 / 11・天井 16.5）。原点は 1 階の ゆかの まんなか、+z が 入口。
//   まんなかに 26 × 14 の 吹きぬけ（フードコート）、木の 大きな 柱 8 本・木の はり・ながい 天窓・白い ルーバーの 天井、
//   ガラスの てすりの バルコニー（植えこみ・たれさがる みどり）、ラタンの いすと まるい テーブル、まんなかの 大きな 木、おくに エスカレーター 2 本。
// obstacles は island-kit と 同じ { x, z, w, d }（w・d は 半分の はば・おくゆき、group から 見た 位置）。
import * as THREE from './three.module.js';
import { tex, rng, createBatch, box, cyl, beam, mat4 } from './library-real.js';
import { createRealTrees, singleBroad } from './real-trees.js';

const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif';
const rotY = (a, x = 0, y = 0, z = 0) => new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const now = () => (globalThis.performance?.now?.() ?? Date.now());
const hash = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/* ───────── 小さな 道具 ───────── */

function uvCell(g, c) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, c[0] + uv.getX(i) * (c[2] - c[0]), c[1] + uv.getY(i) * (c[3] - c[1]));
  return g;
}
function panel(c, w, h) { return uvCell(new THREE.PlaneGeometry(w, h).toNonIndexed(), c); }
// ふたの ない 筒の 一部。θ＝0 が +z、ふえると +x へ。UV は u＝弧の 長さ（m）× ku、v＝高さ（m）× kv。
function drum(cx, cz, r, y0, h, { seg = 48, ku = 1, kv = 1, t0 = 0, tl = Math.PI * 2, cell = null } = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, t0, tl).toNonIndexed(); const uv = g.attributes.uv;
  if (cell) uvCell(g, cell); else for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * tl * r * ku, uv.getY(i) * h * kv);
  g.translate(cx, y0 + h / 2, cz); return g;
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
// 木目の 向き（axis）を u に する UV（はしらは y、はりは x か z）。
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
// もようの 帯の えらびかた：v に 100 × 帯の 番号を 足す（シェーダーが もどす）。
function strip(g, s) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) + s * 100); return g; }
// 頂点色に 数を つめる（ガラスの しゅるい・反射）。Color(r, g, b) は 色空間の 変換を しない。
const code = (style, f0 = 0.08, blue = 0) => new THREE.Color((style + 0.5) / 16, f0, blue);

function fit(g, text, x, y, maxW, size, color, weight = 900, align = 'center') {
  g.font = `${weight} ${size}px ${FONT}`; const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function logo(g, cx, cy, r) {
  g.fillStyle = '#f08a24'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r * 0.78, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1e8f8a'; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.fill();
  fit(g, 'U', cx, cy + r * 0.04, r * 1.1, r * 1.05, '#ffffff');
}
// やわらかい しみ・こまかい ざらつき（canvas）。
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
// テクスチャの 大きさ（MB・ミップマップ込み）。
const TEXLOG = new Map();
function track(name, t, mips = true) { if (t?.image) TEXLOG.set(name, (t.image.width * t.image.height * 4 * (mips ? 4 / 3 : 1)) / 1048576); return t; }
const texMB = (names) => +names.reduce((s, n) => s + (TEXLOG.get(n) || 0), 0).toFixed(2);

/* ───────── 看板の ことば（英語 ＋ かんたんな 日本語）───────── */

const TENANTS = [
  ['BOOKS', 'ほん', '#c9406e', '#ffffff'], ['CAFE', 'カフェ', '#6f8f2a', '#ffffff'], ['SHOES', 'くつ', '#2a69ad', '#ffffff'],
  ['TOYS', 'おもちゃ', '#e08a22', '#ffffff'], ['KIDS', 'こども', '#f2c230', '#3a2a10'], ['SPORTS', 'スポーツ', '#178a74', '#ffffff'],
  ['MUSIC', 'おんがく', '#c23a36', '#ffffff'], ['FLOWERS', 'はな', '#f3d3dc', '#9a2a4f'], ['BAKERY', 'パン', '#a8703a', '#ffffff'],
  ['PETS', 'ペット', '#4aa6d2', '#ffffff'], ['CINEMA', 'えいが', '#26262a', '#f2c230'], ['GAMES', 'ゲーム', '#3c9a40', '#ffffff'],
  ['SWEETS', 'おかし', '#ea7a9c', '#ffffff'], ['CLOTHES', 'ふく', '#f4f2ee', '#c9406e'], ['ABC', 'えいご', '#f4f2ee', '#2a69ad'],
  ['GROCERY', 'スーパー', '#e8d846', '#2f5a1a'], ['GLASSES', 'めがね', '#35607e', '#ffffff'], ['BIKES', 'じてんしゃ', '#d9572a', '#ffffff'],
  ['RAMEN', 'ラーメン', '#b8322a', '#ffffff'], ['PIZZA', 'ピザ', '#d9661c', '#ffffff'], ['SUSHI', 'すし', '#24507a', '#ffffff'], ['CURRY', 'カレー', '#c9921c', '#ffffff'],
];
// 内照式の 看板（中から 光る 箱）：まんなかが 明るい・ふちに 光の 線。
function tenantSign(g, x, y, w, h, [en, ja, bg, fg]) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.62); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const r = h * 0.28, ix = x + h * 0.42; g.fillStyle = fg; g.globalAlpha = 0.95; g.beginPath(); g.arc(ix, y + h / 2, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  fit(g, en[0], ix, y + h / 2 + 1, r * 1.3, r * 1.25, bg);
  fit(g, en, x + h * 0.78 + (w - h * 0.85) / 2, y + h * 0.4, w - h * 0.98, h * 0.4, fg, 800);
  fit(g, ja, x + h * 0.78 + (w - h * 0.85) / 2, y + h * 0.76, w - h * 0.98, h * 0.22, fg, 700);
}

/* ───────── そとと なかで 使う もよう（1 回だけ 作る）───────── */

let SH = null;
function shared() {
  if (SH) return SH;
  SH = { envExt: envExterior(), envInt: envInterior(), rooms: roomsAtlas(), ...signAtlas(), decal: decalTexture() };
  return SH;
}
function equirect(t) { if (t) { t.mapping = THREE.EquirectangularReflectionMapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; } return t; }

// 外の 空（512×256・正距円筒）。上＝天頂・まんなか＝地平線（遠くの 木と 建物）・下＝地面。太陽は (-0.47, 0.74, 0.40) の むき。
function envExterior() {
  const rnd = rng(5);
  const t = tex(512, 256, (g, W, H) => {
    const sky = g.createLinearGradient(0, 0, 0, H / 2); sky.addColorStop(0, '#2f6db6'); sky.addColorStop(0.45, '#5f98d4'); sky.addColorStop(0.85, '#a9c9e6'); sky.addColorStop(1, '#dbe7ee');
    g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
    const sx = 0.888 * W, sy = 0.235 * H, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 90); sg.addColorStop(0, 'rgba(255,250,235,0.95)'); sg.addColorStop(0.12, 'rgba(255,245,220,0.5)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H / 2);
    // 雲：地平線に ちかいほど ひらたく 小さく。
    for (let i = 0; i < 70; i += 1) {
      const y = 18 + Math.pow(rnd(), 0.7) * 100, x = rnd() * W, k = 1 - y / 128, rx = 14 + rnd() * 40 * (0.5 + k), ry = rx * (0.22 + k * 0.3);
      for (const ox of [-W, 0, W]) { const cg = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx); cg.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.4})`); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(x + ox, y); g.scale(1, ry / rx); g.translate(-(x + ox), -y); g.fillStyle = cg; g.fillRect(x + ox - rx, y - rx, rx * 2, rx * 2); g.restore(); }
    }
    // 地面
    const gr = g.createLinearGradient(0, H / 2, 0, H); gr.addColorStop(0, '#8c8d84'); gr.addColorStop(0.25, '#6d6c63'); gr.addColorStop(1, '#4a4943'); g.fillStyle = gr; g.fillRect(0, H / 2, W, H / 2);
    // 遠くの 建物と 木（かすんで いる）。
    for (let i = 0; i < 26; i += 1) { const x = rnd() * W, w = 10 + rnd() * 30, h = 4 + rnd() * 14; g.fillStyle = `rgba(${150 + rnd() * 30},${158 + rnd() * 25},${165 + rnd() * 20},0.9)`; g.fillRect(x, H / 2 - h, w, h + 2); }
    for (let x = -4; x < W + 4; x += 2) { const h = 6 + Math.sin(x * 0.05) * 3 + Math.sin(x * 0.17 + 1) * 2 + rnd() * 3; g.fillStyle = `rgba(${74 + rnd() * 20},${96 + rnd() * 20},${78 + rnd() * 16},0.95)`; g.beginPath(); g.arc(x, H / 2 - h + 4, 3 + rnd() * 4, 0, Math.PI * 2); g.fill(); g.fillRect(x - 2, H / 2 - h + 4, 5, h); }
    const hz = g.createLinearGradient(0, H / 2 - 16, 0, H / 2 + 6); hz.addColorStop(0, 'rgba(220,232,238,0)'); hz.addColorStop(0.7, 'rgba(220,232,238,0.35)'); hz.addColorStop(1, 'rgba(200,210,214,0)'); g.fillStyle = hz; g.fillRect(0, H / 2 - 16, W, 22);
  }, { repeat: false });
  return track('envExt', equirect(t), false);
}
// 中の まわり（512×256）：上＝天窓の 光・天井の ルーバー・まわり＝明るい お店と 木の 柱・下＝オークの 床。
function envInterior() {
  const rnd = rng(8);
  const t = tex(512, 256, (g, W, H) => {
    const up = g.createLinearGradient(0, 0, 0, H * 0.42); up.addColorStop(0, '#fbfdff'); up.addColorStop(0.25, '#eef3f6'); up.addColorStop(0.6, '#e6dfd2'); up.addColorStop(1, '#d6c9b4');
    g.fillStyle = up; g.fillRect(0, 0, W, H * 0.42);
    for (let x = 0; x < W; x += 64) { g.fillStyle = 'rgba(150,95,50,0.55)'; g.fillRect(x + 20, 30, 10, H * 0.4); }
    const mid = g.createLinearGradient(0, H * 0.42, 0, H * 0.58); mid.addColorStop(0, '#efe9df'); mid.addColorStop(1, '#d9cdbb'); g.fillStyle = mid; g.fillRect(0, H * 0.42, W, H * 0.16);
    const pal = ['#f5f1e8', '#ffffff', '#f0e6d2', '#e9eef2'];
    for (let x = 0; x < W; x += 22) { g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.fillRect(x, H * 0.44, 18, 20); g.fillStyle = ['#c9406e', '#2a69ad', '#e08a22', '#178a74', '#f2c230'][Math.floor(rnd() * 5)]; g.fillRect(x + 2, H * 0.42, 14, 4); }
    for (let x = 30; x < W; x += 96) { g.fillStyle = '#b07a48'; g.fillRect(x, H * 0.3, 12, H * 0.32); }
    const fl = g.createLinearGradient(0, H * 0.58, 0, H); fl.addColorStop(0, '#cdb08a'); fl.addColorStop(1, '#a07e58'); g.fillStyle = fl; g.fillRect(0, H * 0.58, W, H * 0.42);
    for (let i = 0; i < 20; i += 1) { const x = rnd() * W, y = H * 0.62 + rnd() * H * 0.3; const rg = g.createRadialGradient(x, y, 0, x, y, 18); rg.addColorStop(0, 'rgba(255,248,230,0.4)'); rg.addColorStop(1, 'rgba(255,248,230,0)'); g.fillStyle = rg; g.fillRect(x - 18, y - 18, 36, 36); }
  }, { repeat: false });
  return track('envInt', equirect(t), false);
}

// ガラスの 向こうの 部屋の おくの かべ（1024×512・256 の ます 8 こ）。上＝天井がわ、下＝床がわ。
// 0 服の 店 / 1 本と 雑貨 / 2 レストラン / 3 オフィス / 4 アトリウム（おくの 吹きぬけ）/ 5 フードの カウンター / 6 カフェ / 7 くつと スポーツ。
function roomsAtlas() {
  const rnd = rng(23);
  const person = (g, x, y, s, top, rnd2) => {     // y＝足もと
    g.fillStyle = ['#2b2b30', '#3b4e6e', '#5b5149', '#1f2022'][Math.floor(rnd2() * 4)]; g.fillRect(x - 4 * s, y - 24 * s, 3.4 * s, 24 * s); g.fillRect(x + 0.6 * s, y - 24 * s, 3.4 * s, 24 * s);
    g.fillStyle = top; rrect(g, x - 6.5 * s, y - 46 * s, 13 * s, 24 * s, 3 * s); g.fill();
    g.fillStyle = ['#e9c09c', '#c68a62', '#8c5a3a', '#f1d0b0'][Math.floor(rnd2() * 4)]; g.beginPath(); g.ellipse(x, y - 52 * s, 4.2 * s, 5.2 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = ['#1c1512', '#4a3324', '#2e2018', '#9a7a50'][Math.floor(rnd2() * 4)]; g.beginPath(); g.ellipse(x, y - 55 * s, 4.4 * s, 3.4 * s, 0, Math.PI, Math.PI * 2); g.fill();
  };
  const TOPS = ['#f2f0ea', '#222326', '#2b3550', '#8a8d91', '#c8b59a', '#6e2a33', '#9fb8d0', '#c9a13b', '#3f6b55', '#d9a3a8'];
  const light = (g, x, y, w, h, warm = false) => {   // 天井から 下へ 明るい → 床へ 暗い
    const v = g.createLinearGradient(0, y, 0, y + h); v.addColorStop(0, warm ? 'rgba(255,220,160,0.28)' : 'rgba(255,255,250,0.3)'); v.addColorStop(0.5, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = v; g.fillRect(x, y, w, h);
  };
  const cells = [
    (g, x, y, w, h) => {   // 0 服
      g.fillStyle = '#efe9df'; g.fillRect(x, y, w, h); g.fillStyle = '#d9d0c2'; g.fillRect(x, y + h - 36, w, 36);
      for (let i = 0; i < 4; i += 1) { const sg = g.createRadialGradient(x + 32 + i * 64, y + 10, 2, x + 32 + i * 64, y + 40, 60); sg.addColorStop(0, 'rgba(255,250,235,0.9)'); sg.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = sg; g.fillRect(x + i * 64 - 30, y, 124, 110); }
      g.fillStyle = '#8a8d91'; g.fillRect(x + 10, y + 92, w - 20, 3);
      for (let i = 0; i < 26; i += 1) { g.fillStyle = TOPS[Math.floor(rnd() * TOPS.length)]; rrect(g, x + 14 + i * 9, y + 96, 8, 54 + rnd() * 22, 2); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 20 + i * 9, y + 96, 2, 60); }
      g.fillStyle = '#c9b8a0'; g.fillRect(x + 70, y + 190, 110, 28); for (let i = 0; i < 6; i += 1) { g.fillStyle = TOPS[Math.floor(rnd() * TOPS.length)]; g.fillRect(x + 74 + i * 17, y + 180, 14, 10); }
      person(g, x + 40, y + h - 18, 1.6, TOPS[3], rnd); person(g, x + 215, y + h - 14, 1.7, TOPS[6], rnd);
      light(g, x, y, w, h);
    },
    (g, x, y, w, h) => {   // 1 本と 雑貨
      g.fillStyle = '#e8e2d6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#8a6a4a'; g.fillRect(x + 8, y + 40, w - 16, 170);
      const pal = ['#c9406e', '#2a69ad', '#e08a22', '#3c9a40', '#f2c230', '#c23a36', '#f4f2ee', '#26262a', '#35607e', '#a8703a'];
      for (let r = 0; r < 5; r += 1) { let bx = x + 12; g.fillStyle = '#5b4632'; g.fillRect(x + 8, y + 72 + r * 34, w - 16, 4); while (bx < x + w - 14) { const bw = 4 + rnd() * 6; g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.fillRect(bx, y + 46 + r * 34 + rnd() * 6, bw - 1, 26); bx += bw; } }
      g.fillStyle = '#d6cbb8'; g.fillRect(x, y + h - 30, w, 30); g.fillStyle = '#efe6d4'; g.fillRect(x + 60, y + h - 58, 130, 22);
      person(g, x + 200, y + h - 10, 1.7, TOPS[0], rnd);
      light(g, x, y, w, h);
    },
    (g, x, y, w, h) => {   // 2 レストラン（あたたかい）
      const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#5a3a24'); bg.addColorStop(0.35, '#b77a46'); bg.addColorStop(1, '#6a442a'); g.fillStyle = bg; g.fillRect(x, y, w, h);
      for (let i = 0; i < 5; i += 1) { g.fillStyle = 'rgba(255,240,220,0.12)'; g.fillRect(x + 10 + i * 50, y + 40, 34, 60); }
      for (let i = 0; i < 5; i += 1) { const lx = x + 26 + i * 50; g.strokeStyle = '#2a1a10'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, y); g.lineTo(lx, y + 64); g.stroke(); const rg = g.createRadialGradient(lx, y + 70, 1, lx, y + 70, 46); rg.addColorStop(0, 'rgba(255,236,190,1)'); rg.addColorStop(0.2, 'rgba(255,214,150,0.6)'); rg.addColorStop(1, 'rgba(255,200,130,0)'); g.fillStyle = rg; g.fillRect(lx - 46, y + 24, 92, 92); g.fillStyle = '#fff3d6'; g.beginPath(); g.ellipse(lx, y + 68, 8, 5, 0, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 4; i += 1) { const tx = x + 36 + i * 62; person(g, tx - 14, y + h - 40, 1.4, TOPS[Math.floor(rnd() * TOPS.length)], rnd); person(g, tx + 16, y + h - 40, 1.4, TOPS[Math.floor(rnd() * TOPS.length)], rnd); g.fillStyle = '#f6efe2'; g.fillRect(tx - 18, y + h - 70, 36, 6); g.fillStyle = '#3a2618'; g.fillRect(tx - 2, y + h - 64, 4, 24); }
      g.fillStyle = '#4a2e1c'; g.fillRect(x, y + h - 26, w, 26);
      for (let i = 0; i < 3; i += 1) { g.fillStyle = '#3f6a32'; g.beginPath(); g.arc(x + 10 + i * 118, y + h - 70, 16, 0, Math.PI * 2); g.fill(); }
    },
    (g, x, y, w, h) => {   // 3 オフィス
      g.fillStyle = '#e9ebec'; g.fillRect(x, y, w, h); g.fillStyle = '#c9ccce'; g.fillRect(x, y + h - 40, w, 40);
      g.fillStyle = '#f7f7f5'; g.fillRect(x + 150, y + 60, 80, 50); g.strokeStyle = '#9aa0a4'; g.strokeRect(x + 150, y + 60, 80, 50);
      for (let i = 0; i < 3; i += 1) { const dx = x + 12 + i * 80; g.fillStyle = '#d8d2c6'; g.fillRect(dx, y + 160, 70, 8); g.fillStyle = '#25292e'; g.fillRect(dx + 18, y + 128, 34, 26); g.fillStyle = 'rgba(120,170,230,0.6)'; g.fillRect(dx + 20, y + 130, 30, 22); g.fillStyle = '#3a3d42'; g.fillRect(dx + 26, y + 170, 18, 34); }
      g.fillStyle = '#4f7a3f'; g.beginPath(); g.arc(x + 236, y + 170, 18, 0, Math.PI * 2); g.fill();
      person(g, x + 110, y + h - 30, 1.5, TOPS[2], rnd);
      light(g, x, y, w, h);
    },
    (g, x, y, w, h) => {   // 4 アトリウム（おくの 階と みどり）
      g.fillStyle = '#d8d2c6'; g.fillRect(x, y, w, h);
      const sk = g.createLinearGradient(0, y, 0, y + 60); sk.addColorStop(0, '#f4f8fb'); sk.addColorStop(1, '#d8d2c6'); g.fillStyle = sk; g.fillRect(x, y, w, 60);
      for (const by of [y + 70, y + 140]) { g.fillStyle = '#f4f2ee'; g.fillRect(x, by, w, 14); g.fillStyle = 'rgba(80,110,60,0.9)'; for (let i = 0; i < 40; i += 1) g.fillRect(x + rnd() * w, by + 14, 3, 6 + rnd() * 22); g.fillStyle = '#f0e6d2'; for (let i = 0; i < 6; i += 1) g.fillRect(x + i * 44 + 6, by - 40, 34, 36); }
      for (let i = 0; i < 6; i += 1) { g.fillStyle = '#a8743f'; g.fillRect(x + 20 + i * 44, y + 30, 8, h - 30); }
      for (let i = 0; i < 9; i += 1) { g.fillStyle = `rgba(${60 + rnd() * 30},${100 + rnd() * 40},${50 + rnd() * 20},0.95)`; g.beginPath(); g.arc(x + rnd() * w, y + h - 40 - rnd() * 40, 14 + rnd() * 16, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 8; i += 1) person(g, x + 12 + rnd() * (w - 24), y + h - 6 - rnd() * 10, 1.0 + rnd() * 0.3, TOPS[Math.floor(rnd() * TOPS.length)], rnd);
      g.fillStyle = '#c8a77c'; g.fillRect(x, y + h - 8, w, 8);
    },
    (g, x, y, w, h) => {   // 5 フード（光る メニュー・カウンター）
      g.fillStyle = '#d9d4cc'; g.fillRect(x, y, w, h); g.fillStyle = '#2a2826'; g.fillRect(x + 8, y + 30, w - 16, 62);
      for (let i = 0; i < 4; i += 1) { const mx = x + 14 + i * 60; g.fillStyle = '#fff4dc'; g.fillRect(mx, y + 36, 52, 50); g.fillStyle = ['#d9661c', '#b8322a', '#c9921c', '#6f8f2a'][i]; g.beginPath(); g.ellipse(mx + 26, y + 62, 18, 12, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(mx + 6, y + 40, 26, 4); }
      g.fillStyle = '#b9bcc0'; g.fillRect(x, y + 120, w, 44); g.fillStyle = '#e2e4e6'; g.fillRect(x, y + 118, w, 6);
      for (let i = 0; i < 6; i += 1) { g.fillStyle = '#7b8086'; g.fillRect(x + 10 + i * 42, y + 128, 30, 26); }
      g.fillStyle = '#f2efe8'; g.fillRect(x, y + h - 70, w, 70); g.fillStyle = '#8a6a4a'; g.fillRect(x, y + h - 72, w, 6);
      person(g, x + 90, y + h - 66, 1.3, '#ffffff', rnd); person(g, x + 180, y + h - 66, 1.3, '#ffffff', rnd);
      light(g, x, y, w, h);
    },
    (g, x, y, w, h) => {   // 6 カフェ・パン
      g.fillStyle = '#d7c3a4'; g.fillRect(x, y, w, h); g.fillStyle = '#2f3430'; g.fillRect(x + 20, y + 30, 120, 70);
      g.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 6; i += 1) g.fillRect(x + 30, y + 40 + i * 10, 40 + rnd() * 50, 3);
      g.fillStyle = '#7a5434'; g.fillRect(x + 150, y + 30, 96, 110); for (let r = 0; r < 4; r += 1) for (let i = 0; i < 6; i += 1) { g.fillStyle = ['#e8c48a', '#c98a4b', '#f3e2c4', '#a8703a'][Math.floor(rnd() * 4)]; g.beginPath(); g.ellipse(x + 160 + i * 15, y + 50 + r * 26, 6, 4, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#5a3c26'; g.fillRect(x, y + 160, w, 60); g.fillStyle = 'rgba(220,235,240,0.35)'; g.fillRect(x + 10, y + 150, w - 20, 14);
      for (let i = 0; i < 8; i += 1) { g.fillStyle = ['#e8c48a', '#c98a4b', '#f3e2c4'][i % 3]; g.beginPath(); g.arc(x + 20 + i * 28, y + 156, 9, Math.PI, 0); g.fill(); }
      person(g, x + 120, y + h - 30, 1.5, '#3f6b55', rnd);
      light(g, x, y, w, h, true);
    },
    (g, x, y, w, h) => {   // 7 くつ・スポーツ
      g.fillStyle = '#f1efea'; g.fillRect(x, y, w, h); g.fillStyle = '#2b2d30'; g.fillRect(x, y, w, 26);
      for (let r = 0; r < 5; r += 1) { g.fillStyle = '#c9c4ba'; g.fillRect(x + 10, y + 70 + r * 28, w - 20, 3); for (let i = 0; i < 10; i += 1) { g.fillStyle = ['#f4f2ee', '#26262a', '#c23a36', '#2a69ad', '#e08a22', '#9aa0a4'][Math.floor(rnd() * 6)]; rrect(g, x + 14 + i * 23, y + 56 + r * 28, 18, 12, 4); g.fill(); } }
      g.fillStyle = '#9aa0a4'; g.fillRect(x, y + h - 30, w, 30); g.fillStyle = '#2a69ad'; g.fillRect(x + 90, y + h - 62, 70, 30);
      person(g, x + 50, y + h - 20, 1.6, TOPS[1], rnd); person(g, x + 210, y + h - 16, 1.7, TOPS[7], rnd);
      light(g, x, y, w, h);
    },
  ];
  const t = tex(1024, 512, (g) => { cells.forEach((paint, i) => { const x = (i % 4) * 256, y = Math.floor(i / 4) * 256; g.save(); g.beginPath(); g.rect(x, y, 256, 256); g.clip(); paint(g, x, y, 256, 256); g.restore(); }); }, { repeat: false });
  return track('rooms', t);
}

// 看板の アトラス（1024×1024・そとと なかで 共用）。ますの 場所は 手で きめる（Node でも UV は 同じ）。
function signAtlas() {
  const W = 1024, H = 1024, items = [];
  const at = (id, x, y, w, h, paint) => items.push({ id, x, y, w, h, paint });
  at('name', 8, 8, 1008, 120, (g, x, y, w, h) => {
    const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eceae4'); g.fillStyle = bg; g.fillRect(x, y, w, h);
    logo(g, x + 150, y + h / 2, 46); fit(g, 'U-SPEAK MALL', x + 470, y + h / 2 + 2, 520, 84, '#16696a'); fit(g, 'ユースピーク モール', x + 860, y + h / 2 + 2, 250, 40, '#e0761c', 800);
  });
  at('rest', 8, 136, 600, 108, (g, x, y, w, h) => {
    g.fillStyle = '#8e1f1a'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    fit(g, 'RESTAURANT', x + w * 0.4, y + h / 2 + 2, w * 0.66, 72, '#fff6e6'); fit(g, 'レストラン', x + w * 0.85, y + h / 2 + 2, w * 0.25, 34, '#ffd79a', 800);
  });
  at('fc', 616, 136, 400, 108, (g, x, y, w, h) => {
    g.fillStyle = '#e07a1c'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    fit(g, 'FOOD COURT', x + w * 0.38, y + h / 2 + 2, w * 0.64, 60, '#ffffff'); fit(g, 'フードコート', x + w * 0.84, y + h / 2 + 2, w * 0.27, 28, '#fff3dc', 800);
  });
  at('entr', 8, 252, 300, 68, (g, x, y, w, h) => { g.fillStyle = '#16696a'; g.fillRect(x, y, w, h); fit(g, 'ENTRANCE', x + w * 0.38, y + h / 2 + 1, w * 0.6, 38, '#ffffff'); fit(g, 'いりぐち', x + w * 0.83, y + h / 2 + 1, w * 0.28, 22, '#bff0e4', 800); });
  at('bike', 316, 252, 68, 68, (g, x, y, w, h) => {
    g.clearRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(x, y, w, h); g.strokeStyle = '#f4f4f0'; g.lineWidth = 4; const s = w / 128;
    for (const cx of [34, 94]) { g.beginPath(); g.arc(x + cx * s, y + 84 * s, 22 * s, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(x + 34 * s, y + 84 * s); g.lineTo(x + 58 * s, y + 52 * s); g.lineTo(x + 84 * s, y + 52 * s); g.lineTo(x + 94 * s, y + 84 * s); g.moveTo(x + 58 * s, y + 52 * s); g.lineTo(x + 64 * s, y + 84 * s); g.lineTo(x + 84 * s, y + 52 * s); g.stroke();
  });
  at('white', 392, 252, 60, 60, (g, x, y, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); });
  at('lamp', 460, 252, 60, 60, (g, x, y, w, h) => { g.fillStyle = '#9a9a96'; g.fillRect(x, y, w, h); const r = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2); r.addColorStop(0, '#ffffff'); r.addColorStop(0.62, '#fff8e8'); r.addColorStop(0.7, '#c9c6be'); r.addColorStop(1, '#e8e6e0'); g.fillStyle = r; g.fillRect(x, y, w, h); });
  at('dark', 528, 252, 60, 60, (g, x, y, w, h) => { g.fillStyle = '#1d1f22'; g.fillRect(x, y, w, h); });
  TENANTS.forEach((t, i) => at(`t${i}`, 8 + (i % 4) * 206, 328 + Math.floor(i / 4) * 104, 200, 100, (g, x, y, w, h) => tenantSign(g, x, y, w, h, t)));
  at('tower', 840, 328, 130, 600, (g, x, y, w, h) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(x, y, w, h); logo(g, x + w / 2, y + 70, 50);
    g.save(); g.translate(x + w / 2, y + 360); g.rotate(Math.PI / 2); fit(g, 'U-SPEAK MALL', 0, 4, 420, 76, '#16696a'); g.restore();
  });
  const cells = {};
  for (const it of items) cells[it.id] = [(it.x + 1) / W, 1 - (it.y + it.h - 1) / H, (it.x + it.w - 1) / W, 1 - (it.y + 1) / H];
  const t = tex(W, H, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); for (const it of items) { g.save(); g.beginPath(); g.rect(it.x, it.y, it.w, it.h); g.clip(); it.paint(g, it.x, it.y, it.w, it.h); g.restore(); } }, { repeat: false, aniso: 8 });
  return { signs: track('signs', t), cells };
}

// あしもとの かげ・光の 輪（左半分＝まるい ぼかし）と、かべの 足もとの 帯・光の すじ（右半分＝上が こい たての ぼかし）。白＋アルファ。
function decalTexture() {
  const t = tex(128, 64, (g) => {
    g.scale(0.5, 0.5); g.clearRect(0, 0, 256, 128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 62); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const v = g.createLinearGradient(0, 2, 0, 126); v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.3, 'rgba(255,255,255,0.45)'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(130, 0, 124, 128);
  }, { repeat: false });
  return track('decal', t);
}
const BLOB = [0.02, 0.02, 0.48, 0.98], STREAK = [0.53, 0.02, 0.97, 0.98];
// 床に ねかせた 板（uv は 0〜1 → cell）。rot＝y 軸の まわり。v＝1 が おく（−z）。
function floorQuad(x, y, z, w, d, cell, rot = 0) { const g = new THREE.PlaneGeometry(w, d).toNonIndexed(); g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(x, y, z); return uvCell(g, cell); }

/* ───────── 材質 ───────── */

// もようの 帯（4 本）＋ でこぼこ ＋ つや ＋ 位置の AO。rough・bump は 帯ごと。ao は GLSL（vLP＝物体の 位置・vON＝物体の 法線・ao に かける）。
function surfMaterial(map, { rough = [0.8, 0.8, 0.8, 0.8], bump = [0.6, 0.6, 0.6, 0.6], ao = '', env = null, envI = 0.35, key = 'a' } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 0, envMap: env, envMapIntensity: envI, color: map ? 0xffffff : 0xdedad2 });
  const f = (v) => v.toFixed(3), pick = (a) => `(sSel < 0.5 ? ${f(a[0])} : sSel < 1.5 ? ${f(a[1])} : sSel < 2.5 ? ${f(a[2])} : ${f(a[3])})`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying vec3 vLP;\nvarying vec3 vON;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLP = transformed; vON = normal;');
    sh.fragmentShader = `varying vec3 vLP;\nvarying vec3 vON;\n${sh.fragmentShader}`
      .replace('#include <map_fragment>', `float sSel = 0.0; float sH = 0.5;
        #ifdef USE_MAP
          sSel = floor(vMapUv.y / 100.0 + 0.5); float sLv = vMapUv.y - sSel * 100.0;
          vec2 sUv = vec2(vMapUv.x, (fract(sLv) + 3.0 - sSel) * 0.25);
          #if __VERSION__ >= 300
            vec4 sTex = textureGrad(map, sUv, dFdx(vec2(vMapUv.x, sLv * 0.25)), dFdy(vec2(vMapUv.x, sLv * 0.25)));
          #else
            vec4 sTex = texture2D(map, sUv);
          #endif
          diffuseColor *= sTex; sH = dot(sTex.rgb, vec3(0.3333));
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float ao = 1.0; vec3 p = vLP; vec3 n = normalize(vON); ${ao} diffuseColor.rgb *= ao; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(${pick(rough)} * mix(1.2, 0.85, sH), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 dh = vec2(dFdx(sH), dFdy(sH)) * ${pick(bump)};
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2)); }`);
  };
  m.customProgramCacheKey = () => `uspeak-mall-surf-${key}`;
  return m;
}

// ガラス（反射＋部屋の 箱）。頂点色：r＝しゅるい、g＝F0（まっすぐ 見た ときの 反射）、b＝青い 色ガラス。uv＝m（よこ・高さ）。
// しゅるい：0 外の 1 階の 店 / 1 円筒の 店の 階 / 2 レストラン / 3 オフィス（ブラインド）/ 4 アトリウム（おくが 深い）/
//          5 中の 店 / 6 フードコート / 7 外が 見える（天窓・入口）/ 8 アーチの 屋根（反射だけ）
const GLASS_VS = `varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
  #ifdef USE_COLOR
    vP = color;
  #else
    vP = vec3(0.03, 0.08, 0.0);
  #endif
  vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLASS_FS = `uniform sampler2D uEnv; uniform sampler2D uSky; uniform sampler2D uRooms; uniform float uNight; uniform vec3 uSun;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vP;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 envAt(sampler2D t, vec3 d) { return texture2D(t, vec2(atan(d.z, d.x) * 0.1591549 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183099 + 0.5)).rgb; }
void main() {
  float s = floor(vP.r * 16.0);
  float F0 = vP.g, blue = vP.b;
  vec3 N = normalize(vN), V = normalize(vW - cameraPosition);
  if (dot(V, N) > 0.0) N = -N;
  float cosT = clamp(-dot(V, N), 0.0, 1.0);
  vec3 T = cross(vec3(0.0, 1.0, 0.0), N); float tl = length(T); T = tl > 0.001 ? T / tl : vec3(1.0, 0.0, 0.0); vec3 U = cross(N, T);
  // ガラスの 板ごとに ほんの 少し ゆがむ（うつりこみが 板で ずれる＝本物の ガラス）。
  vec2 pane = floor(vUv / vec2(1.55, 2.3));
  vec2 wob = (vec2(h21(pane + s), h21(pane.yx + 3.7)) - 0.5) * 0.035;
  vec3 R = reflect(V, normalize(N + T * wob.x + U * wob.y));
  vec3 inner;
  if (s > 6.5 && s < 7.5) {
    inner = envAt(uSky, V) * mix(1.1, 0.05, uNight);
  } else if (s > 7.5) {
    inner = vec3(0.12, 0.15, 0.14) * mix(1.0, 2.2, uNight);
  } else {
    vec3 sz = vec3(4.0, 4.8, 6.0); vec3 cells = vec3(0.0, 1.0, 7.0); float open = 0.0, imgW = 4.0, blinds = 0.0, dayK = 0.4, nightK = 0.5;
    vec3 litD = vec3(1.0, 0.98, 0.93), litN = vec3(1.5, 1.4, 1.2), flo = vec3(0.5, 0.48, 0.45), wal = vec3(0.66, 0.64, 0.6);
    if (s > 0.5 && s < 1.5) { sz = vec3(3.1, 4.58, 7.0); litD = vec3(0.8, 0.78, 0.74); dayK = 0.3; }
    else if (s > 1.5 && s < 2.5) { sz = vec3(6.2, 4.58, 8.0); cells = vec3(2.0, 2.0, 6.0); litD = vec3(1.05, 0.76, 0.5); dayK = 0.55; litN = vec3(1.8, 1.25, 0.75); flo = vec3(0.36, 0.22, 0.13); wal = vec3(0.7, 0.46, 0.3); }
    else if (s > 2.5 && s < 3.5) { sz = vec3(3.2, 3.6, 5.0); cells = vec3(3.0); litD = vec3(0.55, 0.57, 0.6); litN = vec3(1.2, 1.2, 1.1); flo = vec3(0.4, 0.42, 0.44); blinds = 1.0; dayK = 0.3; }
    else if (s > 3.5 && s < 4.5) { sz = vec3(2.5, 6.2, 16.0); cells = vec3(4.0); open = 1.0; imgW = 9.0; litD = vec3(0.85, 0.86, 0.82); dayK = 0.35; flo = vec3(0.7, 0.6, 0.48); }
    else if (s > 4.5 && s < 5.5) { sz = vec3(6.0, 3.7, 5.0); cells = vec3(0.0, 1.0, 7.0); open = 1.0; imgW = 3.4; litD = vec3(1.15, 1.1, 1.02); litN = vec3(1.35, 1.25, 1.1); flo = vec3(0.75, 0.72, 0.68); dayK = 0.85; nightK = 0.75; wal = vec3(0.86, 0.84, 0.8); }
    else if (s > 5.5) { sz = vec3(6.6, 3.7, 4.0); cells = vec3(5.0, 5.0, 6.0); open = 1.0; imgW = 3.3; litD = vec3(1.1, 1.05, 0.95); litN = vec3(1.35, 1.25, 1.1); dayK = 0.85; nightK = 0.75; }
    vec3 d = vec3(dot(V, T), dot(V, U), max(-dot(V, N), 0.02));
    d.x = abs(d.x) < 0.0001 ? 0.0001 : d.x; d.y = abs(d.y) < 0.0001 ? 0.0001 : d.y;
    vec2 cell = floor(vUv / sz.xy); vec2 f = vUv - cell * sz.xy;
    vec3 ro = vec3(f, 0.0);
    vec3 tt = (vec3(d.x > 0.0 ? sz.x : 0.0, d.y > 0.0 ? sz.y : 0.0, sz.z) - ro) / d;
    if (open > 0.5) tt.x = 10000.0;
    float t = min(tt.x, min(tt.y, tt.z));
    vec3 hp = ro + d * t;
    float rh = h21(cell + vec2(s * 7.13, s * 1.7)), depth = clamp(hp.z / sz.z, 0.0, 1.0);
    vec3 c;
    if (tt.z <= t + 0.0001) {
      float ub = open > 0.5 ? (vUv.x + d.x * t) / imgW : hp.x / sz.x;
      float pick = open > 0.5 ? h21(vec2(floor(ub), s + cell.y * 3.1)) : rh;
      float ci = pick < 0.4 ? cells.x : (pick < 0.75 ? cells.y : cells.z);
      vec2 q = clamp(vec2(fract(ub), hp.y / sz.y), 0.01, 0.99);
      float row = floor(ci / 4.0), col = ci - row * 4.0;
      c = texture2D(uRooms, vec2((col + q.x) * 0.25, (q.y + 1.0 - row) * 0.5)).rgb;
    } else if (tt.x <= t + 0.0001) {
      c = wal * (0.78 + 0.16 * rh) * (0.8 + 0.2 * hp.y / sz.y);
    } else if (d.y < 0.0) {
      c = flo * (0.85 + 0.15 * rh) * (1.15 - 0.4 * depth);
    } else {
      vec2 lp = fract(hp.xz / vec2(1.5, 1.8));
      float lamp = step(0.35, lp.x) * step(lp.x, 0.65) * step(0.4, lp.y) * step(lp.y, 0.6);
      c = mix(vec3(0.42, 0.42, 0.41), vec3(2.4, 2.25, 2.0), lamp);
    }
    c *= mix(1.0, 0.55, depth);
    float on = (s > 2.5 && s < 3.5) ? step(0.35, rh) * (0.6 + 0.6 * rh) : 1.0;
    inner = c * mix(litD * dayK, litN * on * nightK, uNight);
    if (blinds > 0.5) { float bl = 0.15 + 0.6 * h21(cell + 9.1); if (f.y / sz.y > 1.0 - bl) { float sl = 0.82 + 0.18 * step(0.45, fract(f.y * 16.0)); inner = vec3(0.74, 0.75, 0.74) * sl * mix(vec3(0.42), litN * 0.55 * on + 0.04, uNight); } }
    if (open < 0.5) inner *= 0.78 + 0.22 * smoothstep(0.0, 0.1, min(min(f.x, sz.x - f.x), min(f.y, sz.y - f.y)));
  }
  vec3 tint = mix(vec3(0.84, 0.93, 0.91), vec3(0.3, 0.5, 0.78), blue);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosT, 5.0);
  vec3 refl = envAt(uEnv, R) * mix(vec3(1.0), vec3(0.07, 0.09, 0.15), uNight) * mix(vec3(1.0), tint, 0.85 * blue);
  float sp = pow(max(dot(R, normalize(uSun)), 0.0), 900.0) * 8.0 * (1.0 - uNight);
  gl_FragColor = vec4(inner * tint * (1.0 - F) + refl * F + sp, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function glassMaterial(env, sky, rooms) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNight: { value: 0 }, uSun: { value: new THREE.Vector3(-0.47, 0.74, 0.4) } }]),
    vertexShader: GLASS_VS, fragmentShader: GLASS_FS, vertexColors: true, fog: true,
  });
  // テクスチャは merge の あとで（merge は テクスチャを 複製して しまう）。
  m.uniforms.uEnv = { value: env }; m.uniforms.uSky = { value: sky }; m.uniforms.uRooms = { value: rooms };
  return m;
}

// 人：はだ・上の 服・下の 服・かみ・くつを 頂点の part で 分け、色は 1 体ずつ（instanced attribute）。歩く 足と うでは 頂点シェーダー。
function peopleMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = `uniform float uTime; attribute float part; attribute vec2 swing; attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iBot; attribute vec3 iHair; attribute vec3 iWalk; varying vec3 vTint;\n${sh.vertexShader}`
      .replace('#include <beginnormal_vertex>', `float pAng = (sin(uTime * 5.5 + iWalk.x) * iWalk.y + iWalk.z) * swing.x; float pc = cos(pAng), ps = sin(pAng);
        vec3 objectNormal = vec3(normal); objectNormal.yz = vec2(objectNormal.y * pc - objectNormal.z * ps, objectNormal.y * ps + objectNormal.z * pc);`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); { float yy = transformed.y - swing.y; transformed.yz = vec2(swing.y + yy * pc - transformed.z * ps, yy * ps + transformed.z * pc); }
        vTint = part < 0.5 ? iSkin : part < 1.5 ? iTop : part < 2.5 ? iBot : part < 3.5 ? iHair : iBot * 0.3 + 0.015;`);
    sh.fragmentShader = `varying vec3 vTint;\n${sh.fragmentShader}`.replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;');
  };
  m.customProgramCacheKey = () => 'uspeak-mall-people';
  return m;
}
const SKIN = [0xf1c7a5, 0xe0ac85, 0xc68a62, 0x9c6644, 0x6e452d, 0xf5d3b8, 0xe8b894];
const TOPC = [0xf2f0ea, 0x222326, 0x2b3550, 0x8a8d91, 0xc8b59a, 0x5f6440, 0x6e2a33, 0x9fb8d0, 0xc9a13b, 0xa5532f, 0xd9a3a8, 0x3f6b55, 0xe9e2d0, 0x4a4f58];
const BOTC = [0x3b4e6e, 0x262f42, 0x1f2022, 0xb49f7a, 0x55585c, 0xd8cbb2, 0x2f3238, 0x5a4a3a];
const HAIR = [0x1c1512, 0x2e2018, 0x4a3324, 0x6b4a2e, 0xb08850, 0x8a8580, 0x161210];
let HUMAN = null;
function humanGeometry(sit) {
  HUMAN ||= {};
  const key = sit ? 'sit' : 'stand'; if (HUMAN[key]) return HUMAN[key];
  const parts = [];
  // part: 0 はだ・1 上・2 下・3 かみ・4 くつ。swing: (向き × 強さ, 回る 高さ)。
  const add = (g, part, sw = 0, pv = 0) => { const n = g.index ? g.toNonIndexed() : g; const c = n.attributes.position.count; n.setAttribute('part', new THREE.BufferAttribute(new Float32Array(c).fill(part), 1)); const s = new Float32Array(c * 2); for (let i = 0; i < c; i += 1) { s[i * 2] = sw; s[i * 2 + 1] = pv; } n.setAttribute('swing', new THREE.BufferAttribute(s, 2)); n.deleteAttribute('uv'); parts.push(n); };
  const limb = (a, b, r0, r1, seg = 7) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv); const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false); g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize())); g.translate(A.x, A.y, A.z); return g; };
  const ell = (x, y, z, rx, ry, rz, ws = 9, hs = 7, th = Math.PI) => { const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, th); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
  const HIP = sit ? 0.47 : 0.9;
  if (!sit) {
    for (const s of [-1, 1]) {
      add(limb([s * 0.09, 0.07, 0], [s * 0.095, 0.5, 0.01], 0.05, 0.065), 2, s * 1, HIP);
      add(limb([s * 0.095, 0.5, 0.01], [s * 0.1, 0.9, 0], 0.066, 0.085), 2, s * 1, HIP);
      add(ell(s * 0.09, 0.05, 0.05, 0.055, 0.05, 0.13, 7, 5), 4, s * 1, HIP);
    }
  } else {
    for (const s of [-1, 1]) {
      add(limb([s * 0.1, HIP, -0.02], [s * 0.11, HIP + 0.02, 0.4], 0.085, 0.07), 2);
      add(limb([s * 0.11, HIP - 0.02, 0.4], [s * 0.1, 0.07, 0.42], 0.065, 0.05), 2);
      add(ell(s * 0.1, 0.05, 0.47, 0.055, 0.05, 0.13, 7, 5), 4);
    }
  }
  const y0 = HIP;
  add(ell(0, y0 + 0.02, 0, 0.17, 0.12, 0.12, 9, 5), 2);                                             // こし
  { const g = new THREE.CylinderGeometry(0.19, 0.155, 0.52, 10, 2); g.scale(1, 1, 0.62); g.translate(0, y0 + 0.3, 0); add(g, 1); }   // むね
  add(ell(0, y0 + 0.56, 0, 0.19, 0.07, 0.12, 10, 4, Math.PI / 2), 1);                                // かた
  add(limb([0, y0 + 0.58, 0], [0, y0 + 0.68, 0.005], 0.045, 0.042, 6), 0);                           // くび
  add(ell(0, y0 + 0.77, 0.008, 0.088, 0.112, 0.1, 10, 8), 0);                                         // あたま
  add(ell(0, y0 + 0.8, -0.006, 0.094, 0.1, 0.104, 10, 6, Math.PI * 0.6), 3);                         // かみ
  for (const s of [-1, 1]) {
    const sh = [s * 0.205, y0 + 0.54, 0];
    if (!sit) {
      add(limb(sh, [s * 0.235, y0 + 0.25, 0], 0.055, 0.047), 1, -s * 0.75, y0 + 0.54);
      add(limb([s * 0.235, y0 + 0.25, 0], [s * 0.245, y0 - 0.02, 0.02], 0.045, 0.036), 0, -s * 0.75, y0 + 0.54);
      add(ell(s * 0.247, y0 - 0.07, 0.025, 0.035, 0.06, 0.03, 6, 5), 0, -s * 0.75, y0 + 0.54);
    } else {
      add(limb(sh, [s * 0.23, y0 + 0.27, 0.05], 0.055, 0.047), 1);
      add(limb([s * 0.23, y0 + 0.27, 0.05], [s * 0.17, y0 + 0.3, 0.32], 0.045, 0.036), 0);
      add(ell(s * 0.16, y0 + 0.3, 0.37, 0.035, 0.03, 0.06, 6, 5), 0);
    }
  }
  // まとめる（色は 1 体ずつ なので vertexColors は 使わない）。
  let nv = 0; for (const p of parts) nv += p.attributes.position.count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), part = new Float32Array(nv), sw = new Float32Array(nv * 2); let v = 0;
  for (const p of parts) { if (!p.attributes.normal) p.computeVertexNormals(); pos.set(p.attributes.position.array, v * 3); nor.set(p.attributes.normal.array, v * 3); part.set(p.attributes.part.array, v); sw.set(p.attributes.swing.array, v * 2); v += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('part', new THREE.BufferAttribute(part, 1)); g.setAttribute('swing', new THREE.BufferAttribute(sw, 2));
  g.computeBoundingSphere();
  HUMAN[key] = g; return g;
}
// list＝[{ x, y, z, ry, s, walk:[phase, amp, stride] }]
function crowd(list, sit, rnd, mat, name) {
  const n = Math.max(1, list.length), m = new THREE.InstancedMesh(humanGeometry(sit).clone(), mat, n); m.count = list.length;
  const at = (k) => new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const A = { iSkin: at(), iTop: at(), iBot: at(), iHair: at(), iWalk: at() };
  const o = new THREE.Object3D(), c = new THREE.Color(), pickC = (arr) => c.setHex(arr[Math.floor(rnd() * arr.length)]);
  list.forEach((p, i) => {
    o.position.set(p.x, p.y || 0, p.z); o.rotation.set(0, p.ry || 0, 0); const s = p.s || (0.93 + rnd() * 0.14); o.scale.set(s * (0.95 + rnd() * 0.1), s, s); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    A.iSkin.setXYZ(i, ...pickC(SKIN).toArray()); A.iTop.setXYZ(i, ...pickC(TOPC).toArray()); A.iBot.setXYZ(i, ...pickC(BOTC).toArray()); A.iHair.setXYZ(i, ...pickC(HAIR).toArray());
    const w = p.walk || [0, 0, 0]; A.iWalk.setXYZ(i, w[0], w[1], w[2]);
  });
  for (const [k, a] of Object.entries(A)) m.geometry.setAttribute(k, a);
  m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = name;
  return m;
}
const crowdOf = crowd;

/* ───────── 外がわ ───────── */

export const MALL = {
  width: 70, depth: 20, height: 24,
  rotunda: { x: 6, z: -3, r: 8.5 },            // かどの ガラスの 円筒
  door: { x: 6, z: 5.6, ry: 0 },                // 円筒の 下の 入口（前に 立つ 点）
  interior: { w: 40, d: 30, levels: [0, 5.5, 11], ceiling: 16.5, entrance: { x: 0, z: 13.2, ry: Math.PI } },
};

let extSurf = null;
// そとの もようの 帯（512×1024）：0 ぬった パネル（3×1.5 m・目地）/ 1 歩道の 平板（2.4×1.2 m）/ 2 アスファルト（4×2 m）/ 3 なめらか（2×1 m）。
function exteriorSurfaces() {
  if (extSurf !== null) return extSurf;
  const rnd = rng(41);
  extSurf = tex(512, 1024, (g) => {
    const S = (i, paint) => { g.save(); g.beginPath(); g.rect(0, i * 256, 512, 256); g.clip(); g.translate(0, i * 256); paint(512, 256); g.restore(); };
    S(0, (W, H) => {
      g.fillStyle = '#ece9e2'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 18, rnd, 0.05); grain(g, 0, 0, W, H, 5000, rnd, 0.05);
      for (let i = 0; i < 10; i += 1) { const x = rnd() * W; const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(90,80,70,0.07)'); gr.addColorStop(1, 'rgba(90,80,70,0)'); g.fillStyle = gr; g.fillRect(x, 3, 3 + rnd() * 8, H * (0.3 + rnd() * 0.6)); }
      g.fillStyle = 'rgba(60,55,50,0.55)'; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 3, W, 2); g.fillRect(3, 0, 2, H);
    });
    S(1, (W, H) => {
      g.fillStyle = '#7d7a74'; g.fillRect(0, 0, W, H);
      for (let r = 0; r < 4; r += 1) for (let c = -1; c < 4; c += 1) {
        const x = c * 128 + (r % 2 ? 64 : 0), y = r * 64, l = 146 + rnd() * 30, w = rnd() * 6 - 3;
        g.fillStyle = `rgb(${l + w},${l - 2 + w * 0.5},${l - 8})`; g.fillRect(x + 2, y + 2, 124, 60);
        soft(g, x + 2, y + 2, 124, 60, 2, rnd, 0.06, 0.2, 0.5); grain(g, x + 2, y + 2, 124, 60, 260, rnd, 0.08, 1.2);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 2, y + 2, 124, 2); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 2, y + 60, 124, 2);
      }
      for (let i = 0; i < 6; i += 1) { g.fillStyle = `rgba(40,35,30,${0.08 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 2 + rnd() * 4, 2 + rnd() * 3, 0, 0, 7); g.fill(); }
      soft(g, 0, 0, W, H, 8, rnd, 0.06);
    });
    S(2, (W, H) => { g.fillStyle = '#9a9a98'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 14, rnd, 0.08); grain(g, 0, 0, W, H, 16000, rnd, 0.45, 1.6); });
    S(3, (W, H) => { g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 10, rnd, 0.035); grain(g, 0, 0, W, H, 2500, rnd, 0.04); });
  });
  if (extSurf) extSurf.anisotropy = 8;
  track('extSurf', extSurf);
  extSurf ||= null;
  return extSurf;
}

let extTreeTpl = null;
function exteriorTrees(list) {
  if (!extTreeTpl) {
    const root = new THREE.Group(); const set = createRealTrees({ root, trees: list, seed: 133 });
    extTreeTpl = { meshes: root.children.slice(), set };
    for (const m of extTreeTpl.meshes) if (m.material?.map) track(`tree-${m.uuid}`, m.material.map);
  }
  return { meshes: extTreeTpl.meshes.map((m) => { const c = m.clone(); c.frustumCulled = false; return c; }), update: (t) => extTreeTpl.set.update(t) };
}

export function buildMallExterior(opts = {}) {
  const t0 = now();
  const { shadows = true } = opts;
  const group = new THREE.Group(); group.name = 'mall-exterior';
  const SHT = shared(), C = SHT.cells, rnd = rng(11), surfTex = exteriorSurfaces();
  const time = { value: 0 };
  const AO_EXT = `if (abs(n.y) < 0.5) { float b = smoothstep(0.0, 1.3, p.y); diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.8, 0.77, 0.72), diffuseColor.rgb, b); ao *= mix(0.82, 1.0, b); }
    if (n.y < -0.5) ao *= 0.92;`;
  const M = {
    surf: surfMaterial(surfTex, { rough: [0.78, 0.88, 0.92, 0.6], bump: [0.5, 1.1, 0.9, 0.25], ao: AO_EXT, env: SHT.envExt, envI: 0.3, key: 'ext' }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.7, envMap: SHT.envExt, envMapIntensity: 1.0 }),
    glass: glassMaterial(SHT.envExt, SHT.envExt, SHT.rooms),
    sign: new THREE.MeshStandardMaterial({ map: SHT.signs, emissive: SHT.signs ? 0xffffff : 0x000000, emissiveMap: SHT.signs, emissiveIntensity: 0.25, roughness: 0.35, envMap: SHT.envExt, envMapIntensity: 0.4, transparent: false, alphaTest: 0.5 }),
  };
  if (!SHT.signs) M.sign.color.setHex(0xdedad2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: SHT.decal, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: SHT.decal, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const B = createBatch({});
  const K = { uv: 'keep' };
  // 帯 s の もよう（ku・kv＝1 m あたり）。
  const SF = (g, color, s, ku, kv = ku, v0 = 0) => B.add('surf', strip(wuv(g, ku, kv, v0), s), { color, uv: 'keep' });
  const W = (g, color) => SF(g, color, 0, 1 / 3, 1 / 1.5);           // ぬった パネル
  const TR = (g, color) => SF(g, color, 3, 0.5, 1);                    // なめらか（白い わく・ルーバー）
  const MT = (g, color) => B.add('metal', g, { color });
  const GL = (g, style, f0 = 0.08, blue = 0) => B.add('glass', g, { color: code(style, f0, blue), uv: 'keep' });
  const S = (cell, w, h, m) => B.add('sign', panel(C[cell], w, h).applyMatrix4(m), K);
  const SH = [], GLOW = [];   // 床の かげ・光の 輪
  const WHITE = 0xf4f3ee, CREAM = 0xf3e9d2, BEIGE = 0xdcc9a6, DARK = 0x3a3d40, GOLD = 0xd6a23a, STEEL = 0x8c9196;
  const GF = 4.8;
  const flatGlass = (style, x0, x1, y0, y1, z, f0, blue = 0, v0 = y0) => { const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0).toNonIndexed().translate((x0 + x1) / 2, (y0 + y1) / 2, z); GL(wuv(g, 1, 1, v0), style, f0, blue); };
  // 1 階の 店の まど：ガラス＋こい 色の 枠（はば step ごと）＋ 足もとの 腰。
  const shopFront = (x0, x1, z, step = 2) => {
    flatGlass(0, x0, x1, 0.12, GF - 0.25, z, 0.07);
    const n = Math.max(1, Math.round((x1 - x0) / step)); for (let i = 0; i <= n; i += 1) MT(box(x0 + ((x1 - x0) * i) / n, 0, z + 0.05, 0.09, GF - 0.25, 0.12), 0x4a4e52);
    MT(box((x0 + x1) / 2, 0, z + 0.06, x1 - x0, 0.14, 0.14), 0x4a4e52); MT(box((x0 + x1) / 2, GF - 0.3, z + 0.06, x1 - x0, 0.1, 0.12), 0x4a4e52);
    MT(box((x0 + x1) / 2, 2.6, z + 0.04, x1 - x0, 0.05, 0.06), 0x4a4e52);
    SH.push(floorQuad((x0 + x1) / 2, 0.145, z + 0.6, x1 - x0, 1.2, STREAK));
  };

  /* 歩道・自転車の みち・ボラード・木 */
  const ZP = 11;
  SF(box(0, -0.06, ZP / 2 - 1, 73, 0.2, ZP + 2), 0xffffff, 1, 1 / 2.4, 1 / 1.2);
  SF(box(0, 0.14, 10, 72.6, 0.012, 1.6), 0x5f86b4, 2, 1 / 4, 1 / 2);
  for (const z of [9.24, 10.76]) TR(box(0, 0.152, z, 72.6, 0.008, 0.08), 0xf4f4f0);
  for (let x = -30; x <= 30; x += 12) { const g = panel(C.bike, 1.0, 1.0); g.rotateX(-Math.PI / 2); g.translate(x, 0.162, 10); B.add('sign', g, K); }
  SF(box(0, -0.02, ZP + 0.25, 73, 0.18, 0.4), 0xc9c6c0, 3, 1, 1);                      // 縁石（みかげ石）
  SF(box(0, -0.06, ZP + 0.7, 73, 0.08, 0.5), 0x8a8a86, 2, 1 / 4, 1 / 2);               // 側溝
  const trees = [-33, -27, -21, -15, -9, -3.5, 16.5, 22, 28, 33.5];
  const obstacles = [];
  for (const x of trees) {
    const z = 7.3;
    MT(box(x, 0.138, z, 1.5, 0.012, 1.5), 0x2e3134); MT(box(x, 0.14, z, 1.62, 0.02, 0.06).translate(0, 0, 0.78), STEEL); MT(box(x, 0.14, z, 1.62, 0.02, 0.06).translate(0, 0, -0.78), STEEL);
    obstacles.push({ x, z, w: 0.9, d: 0.9 });
  }
  const treeList = trees.map((x, i) => ({ x, z: 7.3, kind: i % 3 === 1 ? 2 : 0, scale: 0.82 + hash(x) * 0.22 }));
  for (let x = -35; x <= 35; x += 2.4) {
    if (trees.some((t) => Math.abs(t - x) < 1.3) || Math.abs(x - MALL.door.x) < 3) continue;
    MT(cyl(x, 0.1, 8.6, 0.085, 0.1, 0.82, 10), 0x3c4146); MT(cyl(x, 0.72, 8.6, 0.088, 0.088, 0.06, 10), 0xe8e8e4); MT(cyl(x, 0.92, 8.6, 0.06, 0.085, 0.05, 10), 0x3c4146);
    SH.push(floorQuad(x, 0.146, 8.6, 0.5, 0.5, BLOB));
    obstacles.push({ x, z: 8.6, w: 0.18, d: 0.18 });
  }

  /* 左：ガラスの アトリウム（まるい 屋根） x -35〜-25 */
  {
    const X0 = -35, X1 = -25, cx = -30, ZB = -16, H = 11;
    W(box(cx, 0, (ZB - 0.6) / 2, X1 - X0, H, -ZB - 0.6), BEIGE);
    shopFront(X0 + 0.3, X1 - 0.3, -0.55);
    flatGlass(4, X0, X1, GF + 0.4, H, 0.02, 0.1, 0, GF + 0.4);
    TR(box(cx, GF, 0.25, X1 - X0, 0.4, 1.4), WHITE);
    for (let x = X0; x <= X1 + 0.01; x += 2.5) TR(box(x, GF + 0.4, 0.06, 0.14, H - GF - 0.4, 0.2), WHITE);
    for (const y of [GF + 3.6, H - 0.15]) TR(box(cx, y, 0.06, X1 - X0, 0.14, 0.2), WHITE);
    for (const x of [X0, X1]) TR(box(x, 0, 0, 0.5, GF, 0.5), WHITE);
    const R = (X1 - X0) / 2, vault = new THREE.CylinderGeometry(R, R, -ZB, 24, 1, true, -Math.PI / 2, Math.PI).toNonIndexed();
    { const uv = vault.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.PI * R, uv.getY(i) * -ZB); }
    vault.rotateX(-Math.PI / 2); vault.translate(cx, H, ZB / 2); GL(vault, 8, 0.12);
    const gable = new THREE.CircleGeometry(R, 24, 0, Math.PI).toNonIndexed(); gable.translate(cx, H, 0.02); GL(wuv(gable, 1, 1, H - 6.2 + 0.0), 4, 0.1);
    for (let z = 0; z >= ZB; z -= 2) { const t = new THREE.TorusGeometry(R + 0.05, 0.08, 4, 24, Math.PI); t.translate(cx, H, z + 0.05); TR(t, WHITE); }
    for (let k = 1; k < 6; k += 1) { const a = (k / 6) * Math.PI; TR(box(cx + Math.cos(a) * R, H + Math.sin(a) * R, ZB / 2, 0.1, 0.1, -ZB), WHITE); }
    for (let k = 1; k < 4; k += 1) TR(box(cx - R + k * 2.5, H, 0.06, 0.12, Math.sqrt(Math.max(0, R * R - (k * 2.5 - R) ** 2)), 0.12), WHITE);
    S('entr', 3.6, 0.82, mat4(cx, GF + 0.2, 0.96));
    obstacles.push({ x: cx, z: -8, w: 5, d: 8 });
  }

  /* ベージュの しまの 棟（看板の たて列） x -25〜0 */
  {
    const X0 = -25, X1 = 0, cx = (X0 + X1) / 2, H = 18, ZB = -20, L = X1 - X0;
    W(box(cx, 0, (ZB - 0.8) / 2, L, H, -ZB - 0.8), BEIGE);
    W(box(cx, GF, -0.4, L, H - GF, 0.8), BEIGE);
    W(box(X0 + 0.01, GF, -10, 0.02, H - GF, 20), BEIGE);
    for (let y = GF + 0.55; y < H - 0.4; y += 0.62) { TR(box(cx, y, 0.06, L, 0.3, 0.16), CREAM); TR(box(cx, y + 0.3, 0.13, L, 0.03, 0.02), 0xfaf6ea); }
    TR(box(cx, H - 0.1, -0.2, L + 0.2, 0.7, 1.0), WHITE); MT(box(cx, H + 0.58, -0.2, L + 0.24, 0.05, 1.04), 0xb9bcc0);
    shopFront(X0, X1, -0.79, 2.5);
    for (let x = X0 + 0.25; x <= X1; x += 5) TR(box(x, 0, -0.2, 0.5, GF, 0.5), WHITE);
    TR(box(cx, GF, 0.5, L, 0.35, 2.6), WHITE); MT(box(cx, GF - 0.08, 1.75, L, 0.1, 0.1), DARK);
    for (let x = X0 + 1.5; x < X1; x += 2.5) { const g = panel(C.lamp, 0.22, 0.22); g.rotateX(Math.PI / 2); g.translate(x, GF - 0.005, 1.0); B.add('sign', g, K); GLOW.push(floorQuad(x, 0.15, 1.2, 2.6, 2.6, BLOB)); }
    // 看板の たて列 3 本：こい わく＋ 内照式の 箱（あつみ・まわりは 金属）。
    const cols = [-21, -14.5, -8]; let k = 0;
    for (const x of cols) {
      MT(box(x, GF + 0.7, 0.3, 3.7, 10.9, 0.3), 0x34373b);
      for (let j = 0; j < 6; j += 1) { const y = GF + 1.5 + j * 1.8; MT(box(x, y, 0.5, 3.36, 1.6, 0.14), 0x5a5e63); S(`t${k % 18}`, 3.3, 1.54, mat4(x, y + 0.8, 0.575)); k += 1; }
    }
    MT(box(-2.6, GF + 0.7, 0.3, 2.0, 8.6, 0.3), 0x34373b);
    for (let j = 0; j < 5; j += 1) { MT(box(-2.6, GF + 1.1 + j * 1.65, 0.5, 1.76, 0.84, 0.12), 0x5a5e63); S(`t${(j * 5 + 3) % 18}`, 1.7, 0.8, mat4(-2.6, GF + 1.1 + j * 1.65 + 0.42, 0.565)); }
    MT(box(-14.5, H - 1.6, 0.35, 10.2, 1.4, 0.3), 0x3a2418);
    S('rest', 9.6, 1.25, mat4(-14.5, H - 0.9, 0.52));
    obstacles.push({ x: cx, z: -10, w: L / 2, d: 10 });
    for (let x = X0 + 0.25; x <= X1; x += 5) obstacles.push({ x, z: -0.2, w: 0.3, d: 0.3 });
  }

  /* かどの ガラスの 円筒 */
  {
    const { x: RX, z: RZ, r: R } = MALL.rotunda;
    W(box(RX, 0, -13, 18, 17, 14), BEIGE);
    GL(drum(RX, RZ, R - 1, 0.12, GF - 0.4), 0, 0.07);
    for (let i = -14; i <= 14; i += 1) { const a = (i / 40) * Math.PI * 2; MT(box(0, 0.1, R - 0.98, 0.08, GF - 0.4, 0.1).applyMatrix4(rotY(a, RX, 0, RZ)), 0x4a4e52); }
    for (let i = -5; i <= 5; i += 1) { const a = (i / 12) * Math.PI * 2, x = RX + Math.sin(a) * (R - 0.3), z = RZ + Math.cos(a) * (R - 0.3); TR(cyl(x, 0, z, 0.28, 0.28, GF, 16), WHITE); obstacles.push({ x, z, w: 0.32, d: 0.32 }); }
    TR(cyl(RX, GF, RZ, R + 1.7, R + 1.7, 0.32, 64), WHITE);
    const soffit = (r, y) => { const g = new THREE.CircleGeometry(r, 64).toNonIndexed(); g.rotateX(Math.PI / 2); g.translate(RX, y, RZ); TR(g, 0xeeece6); };
    soffit(R + 1.69, GF - 0.005);
    for (let i = 0; i < 22; i += 1) { const a = (i / 22) * Math.PI * 2; if (Math.cos(a) < -0.3) continue; const x = RX + Math.sin(a) * (R + 0.6), z = RZ + Math.cos(a) * (R + 0.6); const g = panel(C.lamp, 0.2, 0.2); g.rotateX(Math.PI / 2); g.translate(x, GF - 0.012, z); B.add('sign', g, K); if (Math.cos(a) > 0) GLOW.push(floorQuad(x, 0.15, z, 2.4, 2.4, BLOB)); }
    TR(cyl(RX, GF + 0.32, RZ, R + 0.25, R + 0.25, 1.3, 64), WHITE);
    B.add('sign', drum(RX, RZ, R + 0.3, GF + 0.42, 1.1, { seg: 24, t0: -0.62, tl: 1.24, cell: C.name }), K);
    S('entr', 2.6, 0.6, mat4(RX, GF - 0.55, RZ + R - 0.95));
    const Y = [GF + 1.62, GF + 6.2, GF + 10.78, GF + 15.36];
    GL(drum(RX, RZ, R, Y[0], Y[1] - Y[0], { seg: 64 }), 1, 0.2);
    GL(drum(RX, RZ, R, Y[1], Y[2] - Y[1], { seg: 64 }), 1, 0.2);
    GL(drum(RX, RZ, R, Y[2], Y[3] - Y[2], { seg: 64 }), 2, 0.08);
    for (const y of Y) { TR(cyl(RX, y - 0.22, RZ, R + 0.16, R + 0.16, 0.44, 64), WHITE); MT(cyl(RX, y + 0.2, RZ, R + 0.03, R + 0.03, 0.05, 64), 0xc9ccd0); }
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; if (Math.cos(a) < -0.45) continue; TR(box(0, Y[0], R + 0.06, 0.12, Y[3] - Y[0], 0.18).applyMatrix4(rotY(a, RX, 0, RZ)), WHITE); }
    const TOP = Y[3] + 0.2, RR = R + 2.7;
    TR(cyl(RX, TOP, RZ, RR, RR, 0.34, 72), WHITE);
    TR(cyl(RX, TOP + 0.34, RZ, RR - 0.15, RR, 0.08, 72), 0xdad9d3);
    soffit(RR - 0.01, TOP - 0.005);
    for (let i = 0; i < 36; i += 1) { const a = (i / 36) * Math.PI * 2; MT(box(0, TOP + 0.38, (RR - 1.4) / 2 + 1.2, 0.2, 0.42, RR - 1.5).applyMatrix4(rotY(a, RX, 0, RZ)), 0x2a2d31); }
    MT(cyl(RX, TOP + 0.38, RZ, 1.4, 1.6, 0.7, 24), 0x2a2d31);
    MT(cyl(RX, TOP + 0.38, RZ, RR - 0.05, RR - 0.05, 0.44, 72), 0x3d4044);
    obstacles.push({ x: RX, z: RZ, w: (R - 1) * 0.92, d: (R - 1) * 0.92 }, { x: RX, z: RZ, w: (R - 1) * 0.62, d: R - 1 }, { x: RX, z: RZ, w: R - 1, d: (R - 1) * 0.62 });
    obstacles.push({ x: RX, z: -13, w: 9, d: 7 });
  }

  /* 金色の 塔 x 13〜19 */
  {
    const X0 = 13, X1 = 19, cx = 16, ZF = 1.2, ZB = -8, H = 23.5;
    W(box(cx, 0, (ZF + ZB) / 2 - 0.4, X1 - X0, H, ZF - ZB - 0.8), 0xc89a3a);
    shopFront(X0 + 0.3, X1 - 0.3, ZF - 0.78, 1.8);
    for (let i = 0; i < 6; i += 1) {
      const x = X0 + 0.5 + i * 1.0, c = new THREE.Color(GOLD).multiplyScalar(0.86 + ((i * 7) % 5) * 0.05);
      for (let y = GF; y < H - 0.1; y += 3.6) MT(box(x, y + 0.03, ZF - 0.3, 0.94, Math.min(3.54, H - y), 0.3 + (i % 2) * 0.12), c.getHex());
    }
    for (let y = GF + 3.6; y < H; y += 3.6) MT(box(cx, y - 0.04, ZF - 0.12, X1 - X0, 0.08, 0.3), 0x8a6a2a);
    MT(box(X1 - 0.01, GF, ZB / 2, 0.02, H - GF, -ZB), 0xc99a36);
    TR(box(cx, H, (ZF + ZB) / 2, X1 - X0 + 0.3, 0.5, ZF - ZB + 0.3), 0xf0f0ea);
    TR(box(cx, GF, ZF + 0.4, X1 - X0, 0.3, 1.6), WHITE);
    MT(box(cx, H - 8.6, ZF + 0.12, 1.75, 7.9, 0.2), 0xd0d3d6);
    S('tower', 1.6, 7.4, mat4(cx, H - 4.65, ZF + 0.24));
    obstacles.push({ x: cx, z: (ZF + ZB) / 2, w: 3, d: (ZF - ZB) / 2 });
  }

  /* 青い ガラスの 棟 x 19〜35 */
  {
    const X0 = 19, X1 = 35, cx = 27, H = 16, ZB = -20, L = X1 - X0;
    W(box(cx, 0, (ZB - 0.8) / 2, L, H, -ZB - 0.8), BEIGE);
    W(box(cx, GF, -0.4, L, H - GF - 0.6, 0.78), 0x24476c);
    flatGlass(3, X0, X1, GF + 0.2, H - 0.6, 0.0, 0.3, 1, GF + 0.2);
    for (let x = X0; x <= X1 + 0.01; x += 3.2) MT(box(x, GF + 0.2, 0.06, 0.1, H - GF - 0.8, 0.14), 0x3a4a5c);
    for (let y = GF + 0.2; y < H - 0.5; y += 3.6) { MT(box(cx, y - 0.06, 0.06, L, 0.12, 0.16), 0x3a4a5c); if (y > GF + 1) MT(box(cx, y - 0.55, 0.035, L, 0.5, 0.05), 0x1e2f44); }
    shopFront(X0, X1, -0.79, 2);
    for (let x = X0 + 0.3; x <= X1; x += 4) TR(box(x, 0, -0.2, 0.45, GF, 0.45), WHITE);
    TR(box(cx, GF - 0.1, 0.4, L, 0.32, 2.2), WHITE);
    for (let x = X0 + 1; x < X1; x += 2) { const g = panel(C.lamp, 0.2, 0.2); g.rotateX(Math.PI / 2); g.translate(x, GF - 0.105, 0.9); B.add('sign', g, K); GLOW.push(floorQuad(x, 0.15, 1.2, 2.4, 2.4, BLOB)); }
    TR(box(cx, H - 0.6, -0.3, L + 0.1, 0.9, 1.0), WHITE);
    W(box(X1 + 0.01, GF, -10, 0.02, H - GF, 20), 0xd0c6b0);
    MT(box(29, H - 2.46, 0.0, 6.6, 1.3, 0.12), 0x5a5e63); S('fc', 6.4, 1.17, mat4(29, H - 2.4 + 0.58, 0.065));
    S('name', 7.6, 0.91, mat4(25.5, GF + 0.5, 1.52));
    obstacles.push({ x: cx, z: -10, w: L / 2, d: 10 });
  }
  /* 屋上の 機械・屋根の 面 */
  W(box(0, 0, -20.6, 70, 15, 0.6), BEIGE);
  for (const [x, z, w, d, h] of [[-12, -12, 4, 3, 1.4], [-4, -15, 3, 2.5, 1.1], [27, -12, 5, 3, 1.2], [21, -16, 2.5, 2.5, 1.6], [8, -16, 4, 3, 1.3]]) {
    const y = x > 18 ? 16 : x > -3 ? 17 : 18; MT(box(x, y, z, w, h, d), 0xa9aaa6);
  }
  for (const [x0, x1, y] of [[-25, -0.1, 18.02], [-3, 15, 17.02], [19, 35, 16.02]]) TR(box((x0 + x1) / 2, y, -10.4, x1 - x0, 0.03, 18.8), 0xb9b6ae);

  /* 歩道の 人（ふつうの 頭身・ポーズは 立つ／歩く） */
  const walkers = [];
  for (let i = 0; i < 22; i += 1) { const x = -33 + rnd() * 66; if (Math.abs(x - MALL.door.x) < 1.5 || trees.some((t) => Math.abs(t - x) < 0.9)) continue; const z = 1.6 + rnd() * 6.6; const stride = rnd() < 0.7 ? (rnd() - 0.5) * 0.9 : 0; walkers.push({ x, z, ry: rnd() < 0.5 ? Math.PI / 2 + (rnd() - 0.5) * 0.5 : -Math.PI / 2 + (rnd() - 0.5) * 0.5, walk: [0, 0, stride] }); }
  walkers.push({ x: MALL.door.x - 1.2, z: 6.2, ry: Math.PI, walk: [0, 0, 0.3] }, { x: MALL.door.x + 1.4, z: 5.8, ry: -2.6, walk: [0, 0, 0] }, { x: MALL.door.x + 0.6, z: 3.8, ry: 0.3, walk: [0, 0, -0.35] });
  for (const p of walkers) SH.push(floorQuad(p.x, 0.15, p.z, 0.8, 0.8, BLOB));
  const people = crowdOf(walkers, false, rnd, peopleMaterial(time), 'mall-people');
  people.position.y = 0.14;

  // 建物の 足もとの かげ（かべ ぞい）。
  for (const [x0, x1, z] of [[-35, -25, 0.3], [-25, 0, 1.0], [13, 19, 1.4], [19, 35, 0.9]]) SH.push(floorQuad((x0 + x1) / 2, 0.146, z + 0.7, x1 - x0, 1.4, STREAK));
  { const { x: RX, z: RZ, r: R } = MALL.rotunda; for (let i = -6; i <= 6; i += 1) { const a = (i / 30) * Math.PI * 2; const g = floorQuad(0, 0.147, 0, 2.0, 1.6, STREAK); g.translate(0, 0, R - 0.2); g.applyMatrix4(rotY(a, RX, 0, RZ)); SH.push(g); } }

  B.flush(group, M, { noShadow: shadows ? ['sign', 'glass'] : Object.keys(M) });
  if (!shadows) group.traverse((o) => { o.castShadow = false; });
  const decals = (list, mat, name) => { if (!list.length) return null; const B2 = createBatch({}); for (const g of list) B2.add('d', g, { uv: 'keep' }); const m = new THREE.Mesh(B2.geometry('d'), mat); m.name = name; m.renderOrder = 2; group.add(m); return m; };
  decals(SH, shadowMat, 'mall-contact-shadows');
  const glow = decals(GLOW, glowMat, 'mall-light-pools');
  group.add(people);
  const T = exteriorTrees(treeList); for (const m of T.meshes) { if (!shadows) m.castShadow = false; group.add(m); }

  function setNight(n) {
    const k = clamp01(n);
    M.glass.uniforms.uNight.value = k;
    M.sign.emissiveIntensity = 0.25 + 0.95 * k;
    M.surf.envMapIntensity = 0.3 * (1 - 0.85 * k); M.metal.envMapIntensity = 1.0 * (1 - 0.85 * k); M.sign.envMapIntensity = 0.4 * (1 - 0.85 * k);
    glowMat.opacity = 0.42 * k; if (glow) glow.visible = k > 0.02;
  }
  setNight(0);
  function update(t = 0) { time.value = t; T.update(t); }
  let tris = 0; group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  const textureMB = texMB(['envExt', 'rooms', 'signs', 'decal', 'extSurf', ...[...TEXLOG.keys()].filter((k) => k.startsWith('tree-'))]);
  group.userData.mall = { triangles: Math.round(tris), textureMB, buildMs: Math.round(now() - t0) };
  return { group, obstacles: obstacles.map(roundOb), door: { ...MALL.door }, setNight, update, materials: M, triangles: Math.round(tris) };
}
const roundOb = (o) => ({ x: +o.x.toFixed(2), z: +o.z.toFixed(2), w: +o.w.toFixed(2), d: +o.d.toFixed(2) });

/* ───────── 中の もよう ───────── */

let intTex = null;
// 中の もようの 帯（512×1024）：0 オークの 床板（4×2 m）/ 1 木の 板張り（はしら・はり：木目は u の むき・2×1 m）/ 2 白い ぬりかべ（3×1.5 m）/ 3 テラゾー（1.2×0.6 m）。
// ほかに ラタンの あみめ（256）と 葉の 板（512×256：左＝たれる つる 2 本・右＝しげみ）。
function interiorTextures() {
  if (intTex) return intTex;
  const rnd = rng(57);
  const woodLines = (x, y, w, h, n, a, wave = 3) => { for (let k = 0; k < n; k += 1) { const yy = y + rnd() * h, ph = rnd() * 6, amp = rnd() * wave; g2.strokeStyle = `rgba(90,50,20,${a * (0.4 + rnd())})`; g2.lineWidth = 0.6 + rnd() * 1.2; g2.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const v = yy + Math.sin(xx * 0.02 + ph) * amp + Math.sin(xx * 0.07 + ph * 2) * amp * 0.3; if (xx === 0) g2.moveTo(x + xx, v); else g2.lineTo(x + xx, v); } g2.stroke(); } };
  let g2 = null;
  const surf = tex(512, 1024, (g) => {
    g2 = g;
    const S = (i, paint) => { g.save(); g.beginPath(); g.rect(0, i * 256, 512, 256); g.clip(); g.translate(0, i * 256); paint(512, 256); g.restore(); };
    S(0, (W, H) => {   // オーク（板の はば 0.18 m）
      const rows = 11, rh = H / rows, pal = [[226, 196, 154], [216, 184, 140], [232, 204, 164], [210, 178, 134], [222, 190, 146], [236, 212, 176]];
      for (let r = 0; r < rows; r += 1) {
        let x = -((r * 157) % 260);
        while (x < W) {
          const len = 150 + rnd() * 130, c = pal[Math.floor(rnd() * pal.length)];
          g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, r * rh, len, rh);
          g.save(); g.beginPath(); g.rect(x, r * rh, len, rh); g.clip(); woodLines(x, r * rh, len, rh, 7, 0.13, 2.5);
          if (rnd() < 0.15) { g.strokeStyle = 'rgba(110,70,35,0.3)'; g.lineWidth = 1; const kx = x + rnd() * len, ky = r * rh + rh / 2; g.beginPath(); g.ellipse(kx, ky, 4, 2, 0, 0, 7); g.stroke(); }
          const sh = g.createLinearGradient(0, r * rh, 0, r * rh + rh); sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(0,0,0,0.05)'); g.fillStyle = sh; g.fillRect(x, r * rh, len, rh);
          g.restore();
          g.fillStyle = 'rgba(95,60,30,0.55)'; g.fillRect(x, r * rh, 1.5, rh); x += len;
        }
        g.fillStyle = 'rgba(95,60,30,0.5)'; g.fillRect(0, r * rh, W, 1.2);
      }
      soft(g, 0, 0, W, H, 10, rnd, 0.04);
    });
    S(1, (W, H) => {   // 板張り（ばんの はば 0.25 m・あたたかい 色・木目 つよめ）
      const pal = [[206, 156, 104], [212, 162, 110], [200, 148, 98], [216, 168, 116], [204, 152, 100]];
      for (let r = 0; r < 4; r += 1) {
        const c = pal[Math.floor(rnd() * pal.length)]; g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(0, r * 64, W, 64);
        g.save(); g.beginPath(); g.rect(0, r * 64, W, 64); g.clip(); woodLines(0, r * 64, W, 64, 12, 0.11, 5);
        for (let k = 0; k < 3; k += 1) { const cx = rnd() * W, cy = r * 64 + 10 + rnd() * 44; for (let a = 0; a < 6; a += 1) { g.strokeStyle = `rgba(100,55,20,${0.06 + a * 0.012})`; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, 30 + a * 14, 4 + a * 2.2, 0, 0, 7); g.stroke(); } }
        g.restore();
        g.fillStyle = 'rgba(70,38,15,0.7)'; g.fillRect(0, r * 64, W, 2); g.fillStyle = 'rgba(255,225,180,0.25)'; g.fillRect(0, r * 64 + 2, W, 1.5);
      }
      soft(g, 0, 0, W, H, 8, rnd, 0.05);
    });
    S(2, (W, H) => { g.fillStyle = '#f4f2ed'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 12, rnd, 0.03); grain(g, 0, 0, W, H, 3000, rnd, 0.035); g.fillStyle = 'rgba(120,115,105,0.25)'; g.fillRect(0, 0, W, 1.5); g.fillRect(0, 0, 1.5, H); });
    S(3, (W, H) => {
      g.fillStyle = '#e7e3db'; g.fillRect(0, 0, W, H); soft(g, 0, 0, W, H, 10, rnd, 0.04);
      for (let i = 0; i < 1300; i += 1) { const c = [[150, 146, 140], [110, 106, 100], [200, 182, 152], [176, 166, 154], [250, 250, 248]][Math.floor(rnd() * 5)]; g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.3 + rnd() * 0.4})`; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 0.8 + rnd() * 2.6, 0.8 + rnd() * 2, rnd() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(110,105,98,0.3)'; g.fillRect(0, 0, W, 1.5); g.fillRect(0, 0, 1.5, H);
    });
  });
  if (surf) surf.anisotropy = 8;
  const weave = tex(128, 128, (g) => {
    const W = 256, H = 256; g.scale(0.5, 0.5);
    g.fillStyle = '#3a2614'; g.fillRect(0, 0, W, H);
    // たて の 芯（スティック）と よこの ラタン（上・下 こうご）。
    for (let x = 0; x < W; x += 16) { g.fillStyle = '#8a5f34'; g.fillRect(x + 6, 0, 5, H); }
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 16) {
      const over = ((x / 16) + (y / 8)) % 2 === 0, gx = x + (over ? 0 : 8);
      const gr = g.createLinearGradient(0, y, 0, y + 7); gr.addColorStop(0, '#e6bf86'); gr.addColorStop(0.5, '#cf9e60'); gr.addColorStop(1, '#8f6234'); g.fillStyle = gr;
      rrect(g, gx - 1, y + 0.5, over ? 18 : 10, 6.5, 3); g.fill();
    }
    grain(g, 0, 0, W, H, 1500, rnd, 0.12);
  });
  const leaves = tex(512, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const leaf = (x, y, s, ang, light) => {
      g.save(); g.translate(x, y); g.rotate(ang); const c = [40 + light * 40 + rnd() * 20, 95 + light * 60 + rnd() * 30, 30 + light * 30 + rnd() * 15];
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-s * 0.75, s * 0.15, -s * 0.55, s * 0.95, 0, s * 1.25); g.bezierCurveTo(s * 0.55, s * 0.95, s * 0.75, s * 0.15, 0, 0); g.fill();
      g.strokeStyle = `rgba(210,230,150,${0.25 + light * 0.2})`; g.lineWidth = Math.max(0.8, s * 0.06); g.beginPath(); g.moveTo(0, s * 0.05); g.lineTo(0, s * 1.15); g.stroke();
      if (rnd() < 0.3) { g.fillStyle = 'rgba(230,225,130,0.25)'; g.beginPath(); g.ellipse(s * 0.18, s * 0.6, s * 0.12, s * 0.35, 0.2, 0, 7); g.fill(); }
      g.restore();
    };
    // 左：たれる つる 2 本（はば 128）。上が ね もと（v＝1）。
    for (let k = 0; k < 2; k += 1) {
      const cx = 64 + k * 128; g.strokeStyle = '#4a6a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 0);
      const pts = []; for (let y = 0; y <= H; y += 4) { const x = cx + Math.sin(y * 0.03 + k * 2) * 14 + Math.sin(y * 0.11) * 4; pts.push([x, y]); g.lineTo(x, y); } g.stroke();
      for (let i = 0; i < 120; i += 1) { const t = Math.pow(rnd(), 0.8), [px, py] = pts[Math.min(pts.length - 1, Math.floor(t * pts.length))], s = (30 - t * 14) * (0.7 + rnd() * 0.5), side = rnd() < 0.5 ? -1 : 1; leaf(px + side * 4, py - s * 0.3, s, side * (0.7 + rnd() * 0.9) + (rnd() - 0.5) * 0.4, rnd()); }
    }
    // 右：しげみ（まるい かたまり）。
    for (let i = 0; i < 150; i += 1) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 100, x = 384 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.9; leaf(x, y, 16 + rnd() * 14, a + Math.PI / 2 + (rnd() - 0.5) * 1.2, (1 - r / 100) * 0.6 + rnd() * 0.4); }
  }, { repeat: false });
  intTex = { surf: track('intSurf', surf), weave: track('weave', weave), leaves: track('leaves', leaves) };
  return intTex;
}
const VINE = [[0.01, 0.0, 0.245, 1.0], [0.255, 0.0, 0.49, 1.0]], BUSH = [0.51, 0.01, 0.99, 0.99];

let ficusTpl = null;
function ficus() {
  if (!ficusTpl) { ficusTpl = singleBroad({ colour: 0x4f8a38, seed: 34 }); ficusTpl.group.traverse((o) => { if (o.material?.map) track(`ficus-${o.uuid}`, o.material.map); }); }
  return { group: ficusTpl.group.clone(), update: ficusTpl.update };
}

/* ───────── 中（吹きぬけ・フードコート）───────── */

export function buildMallInterior(opts = {}) {
  const t0 = now();
  const { shadows = true } = opts;
  const group = new THREE.Group(); group.name = 'mall-interior';
  const SHT = shared(), C = SHT.cells, T = interiorTextures(), rnd = rng(19);
  const time = { value: 0 };
  const HX = 20, HZ = 15, VX = 13, VZ = 7, LV = MALL.interior.levels, TOP = MALL.interior.ceiling, LH = 5.5, SLAB = 0.7;
  // 位置の AO：床は かべ ぞい・バルコニーの 下が 暗い。たての 面は 各階の 床ぎわが 暗い。下むきの 面（天井・バルコニーの うら）も 少し。
  const AO_INT = `float lv = p.y >= 10.9 ? 11.0 : (p.y >= 5.4 ? 5.5 : 0.0);
    float dv = max(abs(p.x) - 13.0, abs(p.z) - 7.0);
    if (n.y > 0.5) { float dw = min(20.0 - abs(p.x), 15.0 - abs(p.z)); ao *= mix(0.62, 1.0, smoothstep(0.0, 2.4, dw)); ao *= mix(1.0, 0.78, smoothstep(-0.4, 2.0, dv) * step(p.y, 11.5)); }
    else if (n.y < -0.5) { ao *= 0.86; }
    else { ao *= mix(0.68, 1.0, smoothstep(0.0, 0.7, p.y - lv)); }`;
  const M = {
    surf: surfMaterial(T.surf, { rough: [0.32, 0.55, 0.85, 0.45], bump: [0.7, 0.5, 0.25, 0.3], ao: AO_INT, env: SHT.envInt, envI: 0.35, key: 'int' }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75, envMap: SHT.envInt, envMapIntensity: 1.0 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xd8ece6, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.0, envMap: SHT.envInt, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    glass: glassMaterial(SHT.envInt, SHT.envExt, SHT.rooms),
    sign: new THREE.MeshStandardMaterial({ map: SHT.signs, emissive: SHT.signs ? 0xffffff : 0x000000, emissiveMap: SHT.signs, emissiveIntensity: 0.4, roughness: 0.35, envMap: SHT.envInt, envMapIntensity: 0.3 }),
    leaf: new THREE.MeshStandardMaterial({ map: T.leaves, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, color: T.leaves ? 0xffffff : 0x4f8a38 }),
  };
  M.leaf.onBeforeCompile = (sh) => { const chunk = THREE.ShaderChunk?.normal_fragment_begin; if (chunk) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', chunk.replace(/normal \*= faceDirection;/g, '')); };
  M.leaf.customProgramCacheKey = () => 'uspeak-mall-leaf';
  if (!SHT.signs) M.sign.color.setHex(0xdedad2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: SHT.decal, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8, map: SHT.decal, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const B = createBatch({});
  const K = { uv: 'keep' };
  const SF = (g, color, s, ku, kv = ku, v0 = 0) => B.add('surf', strip(wuv(g, ku, kv, v0), s), { color, uv: 'keep' });
  const FL = (g, color = 0xffffff) => SF(g, color, 0, 1 / 4, 1 / 2);             // オークの 床
  const PL = (g, color = 0xffffff) => SF(g, color, 2, 1 / 3, 1 / 1.5);           // 白い ぬりかべ
  const TZ = (g, color = 0xffffff) => SF(g, color, 3, 1 / 1.2, 1 / 0.6);         // テラゾー
  const WD = (g, axis, color = 0xffffff) => B.add('surf', strip(grainUV(g, axis, 1 / 2, 1), 1), { color, uv: 'keep' });   // 木の 板張り
  const MT = (g, color) => B.add('metal', g, { color });
  const GL = (g, style, f0 = 0.06) => B.add('glass', g, { color: code(style, f0, 0), uv: 'keep' });
  const LF = (g, color) => B.add('leaf', g, { color, uv: 'keep' });
  const SHD = [], GLW = [];
  const WHITE = 0xf6f4ef, DARK = 0x2a2c30, SILVER = 0x868b91;
  const obstacles = [], ob = (x, z, w, d) => obstacles.push(roundOb({ x, z, w, d }));

  /* ゆか・バルコニー・天井 */
  FL(box(0, -0.1, 0, HX * 2, 0.1, HZ * 2));
  const lamps = (y, x, z) => { const g = panel(C.lamp, 0.24, 0.24); g.rotateX(Math.PI / 2); g.translate(x, y, z); B.add('sign', g, K); };
  for (const y of LV.slice(1)) {
    for (const [x, z, w, d] of [[0, (VZ + HZ) / 2, HX * 2, HZ - VZ], [0, -(VZ + HZ) / 2, HX * 2, HZ - VZ], [(VX + HX) / 2, 0, HX - VX, VZ * 2], [-(VX + HX) / 2, 0, HX - VX, VZ * 2]]) {
      PL(box(x, y - SLAB, z, w, SLAB - 0.03, d), WHITE); FL(box(x, y - 0.03, z, w, 0.03, d));
    }
    for (let x = -HX + 2.5; x < HX; x += 3.5) for (const z of [-(VZ + HZ) / 2, (VZ + HZ) / 2]) { lamps(y - SLAB - 0.01, x, z); GLW.push(floorQuad(x, y - LH + 0.012, z, 2.6, 2.6, BLOB)); }
    for (let z = -VZ + 1.5; z < VZ; z += 3.5) for (const x of [-(VX + HX) / 2, (VX + HX) / 2]) { lamps(y - SLAB - 0.01, x, z); GLW.push(floorQuad(x, y - LH + 0.012, z, 2.6, 2.6, BLOB)); }
  }
  for (let x = -HX + 2.5; x < HX; x += 3.5) for (const z of [-(VZ + HZ) / 2, (VZ + HZ) / 2]) { lamps(TOP - 0.01, x, z); GLW.push(floorQuad(x, LV[2] + 0.012, z, 2.6, 2.6, BLOB)); }
  // 天井：白い ルーバー（よこ）・おくの こい 板・まんなかに ながい 天窓（外の 空が 見える ガラス）。
  const SKY = { x: 12, z: 2.4, y: 18.3 };
  for (const [x, z, w, d] of [[0, (SKY.z + HZ) / 2, HX * 2, HZ - SKY.z], [0, -(SKY.z + HZ) / 2, HX * 2, HZ - SKY.z], [(SKY.x + HX) / 2, 0, HX - SKY.x, SKY.z * 2], [-(SKY.x + HX) / 2, 0, HX - SKY.x, SKY.z * 2]]) PL(box(x, TOP + 0.35, z, w, 0.1, d), 0x6d665c);
  for (let z = -HZ + 0.25; z < HZ; z += 0.42) {
    if (Math.abs(z) < SKY.z) { for (const s of [-1, 1]) PL(box(s * (SKY.x + HX) / 2, TOP, z, HX - SKY.x, 0.24, 0.1), WHITE); continue; }
    PL(box(0, TOP, z, HX * 2, 0.24, 0.1), WHITE);
  }
  for (const s of [-1, 1]) { PL(box(0, TOP, s * SKY.z, SKY.x * 2, SKY.y - TOP, 0.1), WHITE); PL(box(s * SKY.x, TOP, 0, 0.1, SKY.y - TOP, SKY.z * 2), WHITE); }
  { const g = new THREE.PlaneGeometry(SKY.x * 2, SKY.z * 2).toNonIndexed(); g.rotateX(Math.PI / 2); g.translate(0, SKY.y, 0); GL(wuv(g, 1, 1), 7, 0.04); }
  for (let x = -SKY.x; x <= SKY.x + 0.01; x += 1.5) MT(box(x, SKY.y - 0.16, 0, 0.07, 0.14, SKY.z * 2), 0x9aa0a6);
  MT(box(0, SKY.y - 0.16, 0, SKY.x * 2, 0.14, 0.07), 0x9aa0a6);
  // 天窓からの 光の すじ（加算の 板・たてに ぼかし）。
  for (let i = 0; i < 7; i += 1) {
    const x = -10 + i * 3.3 + (rnd() - 0.5), len = 15.5, lean = 0.18;
    for (const a of [0.35, 1.9]) { const g = new THREE.PlaneGeometry(1.3 + rnd() * 0.8, len).toNonIndexed(); uvCell(g, STREAK); g.translate(0, -len / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationZ(lean)); g.rotateY(a); g.translate(x, SKY.y - 0.2, (rnd() - 0.5) * 2); GLW.push(g); }
  }

  /* 木の はり（天井を わたる）と 木の 柱 */
  const PX = [-13, -4.5, 4.5, 13], BY = 15.0;
  for (const x of PX) WD(box(x, BY, 0, 1.3, TOP - BY + 0.05, HZ * 2), 'z');
  for (const z of [-VZ, VZ]) WD(box(0, BY + 0.15, z, HX * 2, TOP - BY - 0.1, 1.2), 'x');
  for (const x of PX) for (const z of [-VZ, VZ]) {
    WD(box(x, 0, z, 1.8, BY, 1.8), 'y');
    MT(box(x, 0, z, 1.86, 0.1, 1.86), 0x3a3633);
    SHD.push(floorQuad(x, 0.01, z, 3.6, 3.6, BLOB));
    ob(x, z, 1.05, 1.05);
  }

  /* まわりの お店（3 階ぶん）：ガラス（部屋の 箱）・こい 枠・白い 幕板に 内照式の 看板・ダウンライト */
  const shopKeys = TENANTS.map((_, i) => `t${i}`).filter((k, i) => i < 18 && i !== 10);
  let si = 0;
  const wallRun = (len, place, y, kind = 5, special = null) => {
    const n = Math.round(len / 6.2), w = len / n, top = y + LH > TOP ? TOP : y + LH - SLAB;
    for (let i = 0; i < n; i += 1) {
      const u0 = -len / 2 + i * w + 0.25, u1 = u0 + w - 0.5, um = (u0 + u1) / 2, sp = special?.(i, n);
      const g = new THREE.PlaneGeometry(u1 - u0, 3.7).toNonIndexed(); g.translate(um, y + 1.85 + 0.05, -0.35); g.applyMatrix4(place); GL(wuv(g, 1, 1, y), sp === 'exit' ? 7 : kind);
      for (let k = 0; k <= 4; k += 1) MT(box(u0 + ((u1 - u0) * k) / 4, y, -0.3, 0.07, 3.8, 0.1).applyMatrix4(place), 0x3c3f43);
      MT(box(um, y + 3.75, -0.3, u1 - u0, 0.1, 0.12).applyMatrix4(place), 0x3c3f43);
      MT(box(um, y, -0.3, u1 - u0, 0.06, 0.12).applyMatrix4(place), 0x3c3f43);
      const key = sp && sp !== 'exit' ? sp : (sp === 'exit' ? 'entr' : shopKeys[si++ % shopKeys.length]);
      MT(box(um, y + 4.02, 0.06, sp === 'exit' ? 3.2 : 2.3, sp === 'exit' ? 0.76 : 1.12, 0.12).applyMatrix4(place), 0x4a4d52);
      B.add('sign', (sp === 'exit' ? panel(C.entr, 3.1, 0.7) : panel(C[key], 2.2, 1.1)).translate(um, y + 4.02 + (sp === 'exit' ? 0.38 : 0.56), 0.125).applyMatrix4(place), K);
      SHD.push(floorQuad(um, y + 0.012, 0.75, u1 - u0, 1.5, STREAK).applyMatrix4(place));
    }
    for (let i = 0; i <= n; i += 1) PL(box(-len / 2 + i * w, y, 0.0, 0.5, top - y, 0.3).applyMatrix4(place), WHITE);
    PL(box(0, y + 3.8, -0.05, len, top - y - 3.8 + 0.01, 0.1).applyMatrix4(place), WHITE);
  };
  const food = ['t18', 't19', 't20', 't21', 't8', 't12'];
  LV.forEach((y, li) => {
    wallRun(HX * 2, mat4(0, 0, -HZ, 0), y, li === 0 ? 6 : 5, li === 0 ? (i) => food[i % food.length] : null);
    wallRun(HX * 2, mat4(0, 0, HZ, Math.PI), y, 5, li === 0 ? (i, n) => (i === Math.floor(n / 2) ? 'exit' : null) : null);
    wallRun(HZ * 2, mat4(-HX, 0, 0, Math.PI / 2), y);
    wallRun(HZ * 2, mat4(HX, 0, 0, -Math.PI / 2), y);
  });
  // フードコートの カウンター と 大きな 看板。
  TZ(box(0, 0, -HZ + 1.0, HX * 2 - 1, 1.02, 0.9), 0xf4f1ea); WD(box(0, 1.02, -HZ + 1.0, HX * 2 - 1, 0.06, 1.0), 'x', 0xb98a5a);
  SHD.push(floorQuad(0, 0.012, -HZ + 1.9, HX * 2 - 1, 1.2, STREAK));
  ob(0, -HZ + 0.6, HX, 1.1);
  MT(box(0, LV[1] - SLAB - 1.75, -VZ + 0.28, 6.7, 1.4, 0.1), 0x4a4d52);
  B.add('sign', panel(C.fc, 6.5, 1.3).applyMatrix4(mat4(0, LV[1] - SLAB - 1.05, -VZ + 0.34)), K);
  for (const s of [-1, 1]) MT(box(s * 2.8, LV[1] - SLAB - 0.4, -VZ + 0.28, 0.03, 0.4, 0.03), DARK);
  MT(box(0, LV[2] + 4.3, HZ - 0.12, 5.8, 0.8, 0.1), 0x4a4d52);
  B.add('sign', panel(C.name, 5.6, 0.67).applyMatrix4(mat4(0, LV[2] + 4.7, HZ - 0.18, Math.PI)), K);

  /* バルコニーの ふち：白い 腰・フレームレスの ガラス・ステンレスの 手すり・植えこみ・たれる みどり */
  const edges = [];
  const spans = (c0, c1) => { const out = []; let a = c0; for (const p of PX) { if (p - 0.9 > a && p - 0.9 < c1) { out.push([a, p - 0.9]); a = p + 0.9; } } if (a < c1) out.push([a, c1]); return out; };
  for (const s of [-1, 1]) for (const [a, b] of spans(-VX - 0.9, VX + 0.9)) edges.push({ ax: a, bx: b, z: s * VZ, nz: -s });
  for (const s of [-1, 1]) edges.push({ x: s * VX, az: -VZ + 0.9, bz: VZ - 0.9, nx: -s });
  const vine = (px, py, pz, nx, nz, L) => {
    const w = 0.5 + rnd() * 0.2, cell = VINE[Math.floor(rnd() * 2)], c = new THREE.Color().setHSL(0.27 + rnd() * 0.06, 0.45 + rnd() * 0.2, 0.32 + rnd() * 0.12);
    for (const tw of [-0.45, 0.45]) {
      const g = new THREE.PlaneGeometry(w, L).toNonIndexed(); uvCell(g, cell); g.translate(0, -L / 2, 0);
      g.rotateY(Math.atan2(nx, nz) + tw); g.translate(px + nx * (0.08 + rnd() * 0.06), py, pz + nz * (0.08 + rnd() * 0.06)); LF(g, c);
    }
  };
  const bush = (x, y, z, s, c) => { for (let k = 0; k < 3; k += 1) { const g = new THREE.PlaneGeometry(s, s * 0.8).toNonIndexed(); uvCell(g, BUSH); g.translate(0, s * 0.32, 0); g.rotateY((k / 3) * Math.PI + rnd() * 0.4); g.translate(x, y, z); LF(g, c); } };
  LV.slice(1).forEach((y, li) => {
    for (const e of edges) {
      const along = e.ax !== undefined;
      const segs = [];
      if (along) {
        if (li === 0 && e.z < 0) { for (const [a, b] of [[e.ax, Math.min(e.bx, 0.3)], [Math.max(e.ax, 3.3), e.bx]]) if (b - a > 0.3) segs.push([a, b]); } else segs.push([e.ax, e.bx]);
      } else if (li === 1 && e.x > 0) { segs.push([e.az, -5.7], [-3.9, e.bz]); } else segs.push([e.az, e.bz]);
      for (const [a, b] of segs) {
        const len = b - a, mid = (a + b) / 2;
        const at = (off, h, y0, t, l = len) => along ? box(mid, y0, e.z + e.nz * off, l, h, t) : box(e.x + e.nx * off, y0, mid, t, h, l);
        PL(at(0.02, 0.92, y - 0.82, 0.08), WHITE);                                               // 白い 腰（バルコニーの 小口）
        B.add('rail', at(-0.32, 1.0, y + 0.04, 0.025));                                         // フレームレスの ガラス
        MT(at(-0.32, 0.05, y, 0.07), 0x9aa0a6);                                                  // ガラスの 下の みぞ
        const hr = along ? cyl(0, 0, 0, 0.028, 0.028, len, 10).rotateZ(Math.PI / 2).translate(mid, y + 1.09, e.z - e.nz * 0.32) : cyl(0, 0, 0, 0.028, 0.028, len, 10).rotateX(Math.PI / 2).translate(e.x - e.nx * 0.32, y + 1.09, mid);
        MT(hr, 0xe2e5e8);                                                                         // ステンレスの 手すり
        TZ(at(0.33, 0.42, y - 0.02, 0.5), 0xf2efe8);                                             // 植えこみの はこ
        for (let u = 0.25; u < len; u += 0.34) {
          const px = along ? a + u : e.x + e.nx * 0.33, pz = along ? e.z + e.nz * 0.33 : a + u;
          if (rnd() < 0.55) bush(px, y + 0.36, pz, 0.5 + rnd() * 0.3, new THREE.Color().setHSL(0.26 + rnd() * 0.06, 0.4 + rnd() * 0.2, 0.3 + rnd() * 0.12));
          if (rnd() < 0.82) { const L = 0.9 + Math.pow(rnd(), 1.5) * 2.6; vine(along ? px + (rnd() - 0.5) * 0.2 : e.x + e.nx * 0.56, y + 0.38, along ? e.z + e.nz * 0.56 : pz + (rnd() - 0.5) * 0.2, along ? 0 : e.nx, along ? e.nz : 0, L); }
        }
      }
    }
  });

  /* エスカレーター 2 本（1→2 階・2→3 階）：ステップ・銀の 側板・ガラスの 欄干・黒い 手すり */
  const EZ = -4.8;
  function escalator(x0, y0, x1, y1, z) {
    const a = [x0, y0 + 0.45, z], b = [x1, y1 + 0.45, z];
    MT(beam(a, b, 1.5, 0.95), SILVER);
    MT(beam([x0 - 1.0, y0 + 0.45, z], [x0 + 0.2, y0 + 0.45, z], 1.5, 0.95).translate(0, -0.42, 0), SILVER);
    MT(beam([x1 - 0.2, y1 + 0.45, z], [x1 + 1.0, y1 + 0.45, z], 1.5, 0.95).translate(0, -0.42, 0), SILVER);
    const n = Math.round((y1 - y0) / 0.21), dx = (x1 - x0) / n, dy = (y1 - y0) / n;
    for (let i = 0; i < n; i += 1) MT(box(x0 + dx * (i + 0.5), y0 + 0.45 + dy * i + 0.48 - 0.05, z, dx + 0.01, dy + 0.02, 1.0), i % 2 ? 0x34363a : 0x3c3e42);
    MT(box(x0 - 0.45, y0 + 0.02, z, 1.1, 0.04, 1.0), 0x8a8e92); MT(box(x1 + 0.45, y1 + 0.02, z, 1.1, 0.04, 1.0), 0x8a8e92);
    for (const s of [-1, 1]) {
      B.add('rail', beam(a, b, 0.03, 0.9).translate(0, 0.95, s * 0.6));
      MT(beam([x0 - 0.9, y0 + 1.42, z + s * 0.6], [x0, y0 + 1.42, z + s * 0.6], 0.1, 0.08), 0x141518);
      MT(beam(a, b, 0.1, 0.08).translate(0, 0.97, s * 0.6), 0x141518);
      MT(beam([x1, y1 + 1.42, z + s * 0.6], [x1 + 0.9, y1 + 1.42, z + s * 0.6], 0.1, 0.08), 0x141518);
      MT(beam(a, b, 0.06, 0.12).translate(0, 0.47, s * 0.52), 0xe8eaec);
    }
  }
  escalator(-9.2, LV[0], 0.3, LV[1], EZ);
  escalator(3.3, LV[1], 12.3, LV[2], EZ);
  PL(box(1.8, LV[1] - SLAB, -5.25, 3.0, SLAB - 0.03, 3.5), WHITE); FL(box(1.8, LV[1] - 0.03, -5.25, 3.0, 0.03, 3.5));
  PL(box(12.65, LV[2] - SLAB, -4.8, 0.9, SLAB - 0.03, 1.8), WHITE); FL(box(12.65, LV[2] - 0.03, -4.8, 0.9, 0.03, 1.8));
  SHD.push(floorQuad(-5.2, 0.012, EZ, 11.5, 2.6, BLOB));
  ob(-5.2, EZ, 5.6, 0.85);

  /* まんなかの 大きな 木（まるい 植えこみ・木の ベンチ） */
  const TRE = { x: 0, z: 1.0 };
  TZ(cyl(TRE.x, 0, TRE.z, 2.0, 2.1, 0.75, 40), 0xf4f1ea);
  { const g = new THREE.CircleGeometry(1.86, 32).toNonIndexed(); g.rotateX(-Math.PI / 2); g.translate(TRE.x, 0.72, TRE.z); B.add('surf', strip(wuv(g, 1, 1), 3), { color: 0x4a3a2a, uv: 'keep' }); }
  WD(cyl(TRE.x, 0, TRE.z, 2.75, 2.75, 0.46, 48), 'y');
  MT(cyl(TRE.x, 0.46, TRE.z, 2.77, 2.77, 0.02, 48), 0xb08a5a);
  SHD.push(floorQuad(TRE.x, 0.012, TRE.z, 7.4, 7.4, BLOB));
  for (let k = 0; k < 10; k += 1) { const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 1.0; bush(TRE.x + Math.cos(a) * r, 0.7, TRE.z + Math.sin(a) * r, 0.7 + rnd() * 0.4, new THREE.Color().setHSL(0.27, 0.45, 0.28 + rnd() * 0.1)); }
  ob(TRE.x, TRE.z, 2.75, 2.75);
  const F = ficus(); F.group.position.set(TRE.x, 0.7, TRE.z); F.group.scale.setScalar(1.15); F.group.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = true; } }); group.add(F.group);
  // すみの 鉢植え（テラゾーの はち・葉の 板の しげみ）。
  for (const [x, z] of [[-11.2, 5.4], [11.2, 5.4], [-11.2, -2.6], [11.2, -2.6], [-17.8, 12.8], [17.8, 12.8]]) {
    TZ(cyl(x, 0, z, 0.55, 0.42, 0.8, 20), 0xeeeae2); MT(cyl(x, 0.78, z, 0.5, 0.5, 0.02, 20), 0x2e2620);
    for (let k = 0; k < 4; k += 1) bush(x + (rnd() - 0.5) * 0.4, 0.8 + k * 0.32, z + (rnd() - 0.5) * 0.4, 1.0 - k * 0.12, new THREE.Color().setHSL(0.25 + rnd() * 0.05, 0.42, 0.3 + rnd() * 0.08));
    SHD.push(floorQuad(x, 0.012, z, 1.8, 1.8, BLOB));
    ob(x, z, 0.55, 0.55);
  }

  /* ラタンの いす・まるい テーブル・人（InstancedMesh） */
  const tables = [], chairs = [], sitters = [];
  const spots = [];
  for (const x of [-10.5, -7.5, 7.5, 10.5]) for (const z of [-1.2, 1.8, 4.8]) spots.push([x, z]);
  for (const [x, z] of [[-4.6, 4.6], [4.6, 4.6], [-4.6, -2.4], [4.6, -2.4], [-1.6, 5.6], [1.6, 5.6], [0, -2.9]]) spots.push([x, z]);
  for (const [x, z] of spots) {
    tables.push({ x, z }); ob(x, z, 0.75, 0.75); SHD.push(floorQuad(x, 0.012, z, 2.6, 2.6, BLOB));
    const n = 3 + Math.floor(rnd() * 2), a0 = rnd() * Math.PI;
    for (let k = 0; k < n; k += 1) {
      const a = a0 + (k / n) * Math.PI * 2, cx = x + Math.sin(a) * 0.98, cz = z + Math.cos(a) * 0.98;
      chairs.push({ x: cx, z: cz, ry: a + Math.PI });
      SHD.push(floorQuad(cx, 0.013, cz, 1.0, 1.0, BLOB));
      if (rnd() < 0.42) sitters.push({ x: cx - Math.sin(a) * 0.04, y: 0.0, z: cz - Math.cos(a) * 0.04, ry: a + Math.PI });
    }
  }
  // ラタンの いす（まるい 桶の 形・ひじかけまで つづく 背・あつい クッション・ラタンの 台座）。
  const CB = createBatch({});
  {
    const outer = [[0.27, 0.06], [0.33, 0.12], [0.37, 0.3], [0.385, 0.5], [0.38, 0.66], [0.36, 0.74]].map(([r, y]) => new THREE.Vector2(r, y));
    const shell = new THREE.LatheGeometry(outer, 16, Math.PI * 0.3, Math.PI * 1.4); { const uv = shell.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 1.6); }
    CB.add('c', shell, { color: 0xffffff, uv: 'keep' });
    const inner = [[0.33, 0.74], [0.315, 0.66], [0.31, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const ish = new THREE.LatheGeometry(inner, 16, Math.PI * 0.3, Math.PI * 1.4); { const uv = ish.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 0.5); }
    CB.add('c', ish, { color: 0xe8d8c0, uv: 'keep' });
    const rim = new THREE.TorusGeometry(0.348, 0.03, 5, 18, Math.PI * 1.4); rim.rotateX(Math.PI / 2); rim.rotateY(-Math.PI * 0.2 - Math.PI / 2); rim.translate(0, 0.74, 0); { const uv = rim.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 0.2); } CB.add('c', rim, { color: 0xd8c0a0, uv: 'keep' });
    const base = new THREE.CylinderGeometry(0.3, 0.27, 0.3, 16, 1, false); base.translate(0, 0.21, 0); { const uv = base.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 0.6); } CB.add('c', base, { color: 0xffffff, uv: 'keep' });
    const cush = new THREE.CylinderGeometry(0.3, 0.31, 0.12, 16); cush.translate(0, 0.42, 0.01); { const uv = cush.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.01, 0.01); } CB.add('c', cush, { color: 0x6b6f66, uv: 'keep' });
  }
  const chairMat = new THREE.MeshStandardMaterial({ map: T.weave, bumpMap: T.weave, bumpScale: 2.5, vertexColors: true, roughness: 0.85, color: T.weave ? 0xffffff : 0xc99a5e, side: THREE.DoubleSide });
  const TB = createBatch({});
  TB.add('t', cyl(0, 0.72, 0, 0.45, 0.45, 0.035, 32), { color: 0x221c18 });
  TB.add('t', cyl(0, 0.7, 0, 0.42, 0.42, 0.02, 32), { color: 0x2a2b2e });
  TB.add('t', cyl(0, 0.04, 0, 0.035, 0.035, 0.66, 10), { color: 0x2a2b2e });
  TB.add('t', cyl(0, 0, 0, 0.25, 0.27, 0.04, 20), { color: 0x2a2b2e });
  const inst = (geo, mat, list, name) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(p.x, p.y || 0, p.z); o.rotation.set(0, p.ry || 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.name = name; m.castShadow = false; m.receiveShadow = true; group.add(m); return m;
  };

  B.flush(group, M, { noShadow: shadows ? ['glass', 'sign', 'leaf', 'rail'] : Object.keys(M) });
  if (!shadows) group.traverse((o) => { o.castShadow = false; });
  const decals = (list, mat, name, order) => { if (!list.length) return null; const B2 = createBatch({}); for (const g of list) B2.add('d', g, { uv: 'keep' }); const m = new THREE.Mesh(B2.geometry('d'), mat); m.name = name; m.renderOrder = order; group.add(m); return m; };
  decals(SHD, shadowMat, 'mall-contact-shadows', 2);
  decals(GLW, glowMat, 'mall-light', 3);

  inst(CB.geometry('c'), chairMat, chairs, 'mall-chairs');
  inst(TB.geometry('t'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2, envMap: SHT.envInt, envMapIntensity: 0.8 }), tables, 'mall-tables');
  const pm = peopleMaterial(time);
  const seated = crowdOf(sitters, true, rnd, pm, 'mall-sitters'); group.add(seated);
  // 歩く 人：1 階の お店の 前・2 階と 3 階の バルコニー。行ったり 来たり（update）。
  const walk = [];
  for (let i = 0; i < 14; i += 1) walk.push({ y: 0, z: rnd() < 0.5 ? 9.5 + rnd() * 3 : -9 - rnd() * 3, x0: -17, x1: 17 });
  for (let i = 0; i < 10; i += 1) walk.push({ y: LV[1], z: (rnd() < 0.5 ? 1 : -1) * (9 + rnd() * 4), x0: -18, x1: 18 });
  for (let i = 0; i < 8; i += 1) walk.push({ y: LV[2], z: (rnd() < 0.5 ? 1 : -1) * (9 + rnd() * 4), x0: -18, x1: 18 });
  for (let i = 0; i < 6; i += 1) walk.push({ y: LV[i % 3], x: (i % 2 ? 1 : -1) * (15.5 + rnd() * 3), z0: -12, z1: 12 });
  walk.forEach((w) => { w.p = rnd() * 2; w.v = 0.018 + rnd() * 0.018; w.s = 0.92 + rnd() * 0.15; });
  const walkers = crowdOf(walk.map((w) => ({ x: w.x ?? 0, y: w.y, z: w.z ?? 0, s: w.s, walk: [rnd() * 6.28, 0.42, 0] })), false, rnd, pm, 'mall-walkers'); group.add(walkers);
  const blobGeo = floorQuad(0, 0.014, 0, 0.85, 0.85, BLOB);
  const blobs = new THREE.InstancedMesh(blobGeo, shadowMat, walk.length); blobs.name = 'mall-walker-shadows'; blobs.renderOrder = 2; blobs.frustumCulled = false; group.add(blobs);
  const o3 = new THREE.Object3D();
  function update(t = 0) {
    time.value = t; F.update(t);
    walk.forEach((w, i) => {
      const ph = (w.p + t * w.v) % 2, f = ph < 1 ? ph : 2 - ph, dir = ph < 1 ? 1 : -1;
      if (w.x0 !== undefined) { o3.position.set(w.x0 + (w.x1 - w.x0) * f, w.y, w.z); o3.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
      else { o3.position.set(w.x, w.y, w.z0 + (w.z1 - w.z0) * f); o3.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); }
      o3.scale.setScalar(w.s); o3.updateMatrix(); walkers.setMatrixAt(i, o3.matrix);
      o3.rotation.set(0, 0, 0); o3.scale.setScalar(1); o3.updateMatrix(); blobs.setMatrixAt(i, o3.matrix);
    });
    walkers.instanceMatrix.needsUpdate = true; blobs.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // まわりの かべ（1 階の 当たり判定）。入口の まえは あけない（入口の 点は かべの 内がわ）。
  ob(0, -HZ - 0.2, HX, 0.4); ob(0, HZ + 0.2, HX, 0.4); ob(-HX - 0.2, 0, 0.4, HZ); ob(HX + 0.2, 0, 0.4, HZ);

  function setNight(n) {
    const k = clamp01(n);
    M.glass.uniforms.uNight.value = k;
    M.sign.emissiveIntensity = 0.4 + 0.6 * k;
    M.surf.envMapIntensity = 0.35 * (1 - 0.5 * k); M.metal.envMapIntensity = 1.0 * (1 - 0.5 * k);
    glowMat.opacity = 0.16 + 0.16 * k;
  }
  setNight(0);
  let tris = 0; group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  const textureMB = texMB(['envInt', 'envExt', 'rooms', 'signs', 'decal', 'intSurf', 'weave', 'leaves', ...[...TEXLOG.keys()].filter((k) => k.startsWith('ficus-'))]);
  group.userData.mall = { triangles: Math.round(tris), textureMB, buildMs: Math.round(now() - t0) };
  return { group, obstacles, entrance: { ...MALL.interior.entrance }, setNight, update, materials: M, triangles: Math.round(tris) };
}

// 見本の ページ用：いま 作って ある もようの 合計（MB）。
export function mallTextureMB() { return +[...TEXLOG.values()].reduce((a, b) => a + b, 0).toFixed(2); }
