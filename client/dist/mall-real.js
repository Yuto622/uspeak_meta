// ショッピングモール（外がわ と 中の 吹きぬけ）— 2026-11「この ショッピングモールの 3D モデル 作っといて」。
//
// 写真は 本物の チェーンの モール。**名前・ロゴ・字体は まねしない**：ここは つくった 名前「U-SPEAK MALL／ユースピーク モール」と、
// ふつうの お店の 看板（BOOKS ほん・CAFE カフェ・TOYS おもちゃ …）だけ。形の 雰囲気（かどの ガラスの 円筒・看板の たて列・木の 吹きぬけ）を もらう。
//
// library-real.js / planetarium-real.js と 同じ 考えかた：
// ・形は 手続きで 作る（Box・Cylinder・Lathe）、**材質ごとに 1 メッシュ**（外 8 回・中 13 回の 描画）、光は 足さない（emissive だけ・≦ 1.2）。
// ・くりかえす 小物（いす・テーブル・人・てすりの 柱）は InstancedMesh。かげは 大きい 部品だけ。
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
import { tex, rng, createBatch, worldUV, box, cyl, beam, mat4 } from './library-real.js';

const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif';
const rotY = (a, x = 0, y = 0, z = 0) => new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

/* ───────── 小さな 道具 ───────── */

// UV（0〜1）を アトラスの ます [u0, v0, u1, v1] に よせる。
function uvCell(g, c) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, c[0] + uv.getX(i) * (c[2] - c[0]), c[1] + uv.getY(i) * (c[3] - c[1]));
  return g;
}
// 看板の 板（XY・+z むき・まんなかが 原点）。
function panel(c, w, h) { return uvCell(new THREE.PlaneGeometry(w, h).toNonIndexed(), c); }
// ふたの ない 筒の 一部。θ＝0 が +z、ふえると +x へ（外から 見て 左 → 右）。UV は u＝弧の 長さ × ku、v＝高さ × kv。
function drum(cx, cz, r, y0, h, { seg = 48, ku = 1, kv = 1 / h, t0 = 0, tl = Math.PI * 2, cell = null } = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, t0, tl).toNonIndexed(); const uv = g.attributes.uv;
  if (cell) uvCell(g, cell); else for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * tl * r * ku, uv.getY(i) * h * kv);
  g.translate(cx, y0 + h / 2, cz); return g;
}
// 字を はばに おさめて かく。
function fit(g, text, x, y, maxW, size, color, weight = 900, align = 'center') {
  g.font = `${weight} ${size}px ${FONT}`; const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// アトラス：items を たなに つめる（ますの 計算は canvas が なくても できる＝Node でも UV は 同じ）。
function atlas(W, H, items, pad = 4) {
  const cells = {}; let x = pad, y = pad, row = 0;
  for (const it of items) {
    if (x + it.w + pad > W) { x = pad; y += row + pad; row = 0; }
    it.x = x; it.y = y; x += it.w + pad; row = Math.max(row, it.h);
    if (y + it.h > H) throw new Error(`atlas overflow: ${it.id}`);
    cells[it.id] = [(it.x + 1) / W, 1 - (it.y + it.h - 1) / H, (it.x + it.w - 1) / W, 1 - (it.y + 1) / H];
  }
  const t = tex(W, H, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); for (const it of items) { g.save(); it.paint(g, it.x, it.y, it.w, it.h); g.restore(); } }, { repeat: false, aniso: 8 });
  return { tex: t, cells };
}
// ロゴ：オレンジの まるに 白い U（つくった しるし。本物の ブランドとは かんけい ない）。
function logo(g, cx, cy, r) {
  g.fillStyle = '#f08a24'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r * 0.78, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1e8f8a'; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.fill();
  fit(g, 'U', cx, cy + r * 0.04, r * 1.1, r * 1.05, '#ffffff');
}

/* ───────── 看板の ことば（英語 ＋ かんたんな 日本語）───────── */

const TENANTS = [
  ['BOOKS', 'ほん', '#e85a8c', '#ffffff'], ['CAFE', 'カフェ', '#a6c83a', '#1f3318'], ['SHOES', 'くつ', '#2f7fd1', '#ffffff'],
  ['TOYS', 'おもちゃ', '#f2a23a', '#ffffff'], ['KIDS', 'こども', '#ffd23f', '#3a2a10'], ['SPORTS', 'スポーツ', '#1fa58a', '#ffffff'],
  ['MUSIC', 'おんがく', '#d9433f', '#ffffff'], ['FLOWERS', 'はな', '#f7c8d8', '#a0284f'], ['BAKERY', 'パン', '#c98a4b', '#ffffff'],
  ['PETS', 'ペット', '#6cc3e8', '#13364f'], ['CINEMA', 'えいが', '#2b2b2b', '#ffd23f'], ['GAMES', 'ゲーム', '#47b44a', '#ffffff'],
  ['SWEETS', 'おかし', '#ff8fb1', '#ffffff'], ['CLOTHES', 'ふく', '#ffffff', '#e85a8c'], ['ABC', 'えいご', '#ffffff', '#2f7fd1'],
  ['GROCERY', 'スーパー', '#f0e14a', '#2f5a1a'], ['GLASSES', 'めがね', '#3c6e91', '#ffffff'], ['BIKES', 'じてんしゃ', '#e8632b', '#ffffff'],
];
function tenantSign(g, x, y, w, h, [en, ja, bg, fg]) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  const r = h * 0.3; g.fillStyle = fg; g.globalAlpha = 0.95; g.beginPath(); g.arc(x + h * 0.42, y + h / 2, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  fit(g, en[0], x + h * 0.42, y + h / 2 + 1, r * 1.3, r * 1.25, bg === '#ffffff' ? '#ffffff' : bg);
  fit(g, en, x + h * 0.78 + (w - h * 0.85) / 2, y + h * 0.38, w - h * 0.95, h * 0.42, fg);
  fit(g, ja, x + h * 0.78 + (w - h * 0.85) / 2, y + h * 0.76, w - h * 0.95, h * 0.24, fg, 700);
}

/* ───────── 外がわの もよう ───────── */

let extTex = null;
function exteriorTextures() {
  if (extTex) return extTex;
  const rnd = rng(31);
  // 円筒の ガラス（1 まい＝たての わく 4 こま・1 階ぶん）：空の うつりこみ ＋ うっすら 中の お店。
  const glass = tex(256, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#dcebf2'); gr.addColorStop(0.45, '#9dbfd0'); gr.addColorStop(1, '#5f8597');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(45,60,70,0.45)'; g.fillRect(0, 0, W, 22);                       // 天井の かげ
    for (let i = 0; i < 8; i += 1) { g.fillStyle = 'rgba(255,250,232,0.55)'; g.fillRect(i * 32 + 10, 28, 12, 4); }
    for (let i = 0; i < 9; i += 1) { g.fillStyle = `rgba(35,50,60,${0.15 + rnd() * 0.15})`; const w = 18 + rnd() * 30; g.fillRect(rnd() * W, 120 + rnd() * 40, w, H - 150); }
    for (let i = 0; i < 4; i += 1) { g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); const x = i * 70 + 20; g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 50, H); g.lineTo(x - 90, H); g.fill(); }
    g.fillStyle = 'rgba(30,45,55,0.35)'; g.fillRect(0, H - 8, W, 8);
  });
  const glassE = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 40, 0, H); gr.addColorStop(0, 'rgba(255,214,150,0.25)'); gr.addColorStop(1, 'rgba(255,190,120,0.7)');
    g.fillStyle = gr; g.fillRect(0, 34, W, H - 40);
    for (let i = 0; i < 8; i += 1) { g.fillStyle = '#fff4d8'; g.fillRect(i * 32 + 10, 28, 12, 5); }
    for (let i = 0; i < 9; i += 1) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(rnd() * W, 130 + rnd() * 40, 18 + rnd() * 30, H - 150); }
  });
  // いちばん 上の 階：あたたかい レストラン（ペンダントの 明かり・テーブル・人）。昼も 少し 光る。
  const warm = tex(512, 256, (g, W, H) => {
    g.fillStyle = '#4e3524'; g.fillRect(0, 0, W, 46);
    const gr = g.createLinearGradient(0, 46, 0, 210); gr.addColorStop(0, '#f6cf8e'); gr.addColorStop(1, '#d99a58'); g.fillStyle = gr; g.fillRect(0, 46, W, 164);
    g.fillStyle = '#9a6a3e'; g.fillRect(0, 210, W, 46);
    for (let i = 0; i < 6; i += 1) { g.fillStyle = ['#c0563c', '#3e7a5a', '#d8b04a', '#5a7fa8', '#8a5a3a', '#e07a5a'][i]; g.fillRect(i * 88 + 14, 70, 56, 28); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(i * 88 + 20, 80, 44, 6); }
    for (let i = 0; i < 8; i += 1) {
      const x = i * 64 + 32; g.strokeStyle = '#2a1a10'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 66); g.stroke();
      const rg = g.createRadialGradient(x, 72, 2, x, 72, 30); rg.addColorStop(0, 'rgba(255,248,215,1)'); rg.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = rg; g.fillRect(x - 30, 42, 60, 60);
      g.fillStyle = '#fff6d8'; g.beginPath(); g.ellipse(x, 70, 10, 6, 0, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 5; i += 1) { g.fillStyle = '#3f7a3a'; g.beginPath(); g.arc(i * 110 + 60, 150, 16, 0, Math.PI * 2); g.fill(); }
    const tops = ['#7a3a2a', '#2f5a7a', '#f0ece2', '#c0504a', '#4f6b2f', '#d8a03a', '#3a3a48', '#e88aa0'];
    for (let i = 0; i < 16; i += 1) {
      const x = 16 + i * 31 + rnd() * 10, y = 150 + rnd() * 18;
      g.fillStyle = tops[i % tops.length]; rrect(g, x - 11, y, 22, 40, 8); g.fill();
      g.fillStyle = '#e8c39e'; g.beginPath(); g.arc(x, y - 9, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(x, y - 12, 9, Math.PI, Math.PI * 2); g.fill();
      if (i % 2) { g.fillStyle = '#fbf6ec'; g.beginPath(); g.ellipse(x + 16, y + 34, 18, 5, 0, 0, Math.PI * 2); g.fill(); }
    }
    const rf = g.createLinearGradient(0, 0, W, H); rf.addColorStop(0, 'rgba(255,255,255,0.16)'); rf.addColorStop(0.5, 'rgba(255,255,255,0)'); rf.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = rf; g.fillRect(0, 0, W, H);
  });
  // 1 階の お店の ガラス（1 まい＝はば 4・高さ 4.8）。中は 明るい。
  const shop = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#f7f2e6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e3ddd0'; g.fillRect(0, 200, W, 56);
    for (let i = 0; i < 6; i += 1) { g.fillStyle = '#ffffff'; g.fillRect(i * 44 + 8, 18, 26, 5); }
    const pal = ['#e85a8c', '#2f7fd1', '#f2a23a', '#47b44a', '#ffd23f', '#d9433f', '#6cc3e8'];
    for (let s = 0; s < 2; s += 1) for (let r = 0; r < 3; r += 1) for (let i = 0; i < 9; i += 1) {
      g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.fillRect(s * 128 + 10 + i * 12, 96 + r * 34, 9, 22 + rnd() * 6);
    }
    for (let s = 0; s < 2; s += 1) { g.fillStyle = '#b9b2a4'; for (let r = 0; r < 4; r += 1) g.fillRect(s * 128 + 6, 124 + r * 34, 116, 4); }
    const rf = g.createLinearGradient(0, 0, W * 0.6, H); rf.addColorStop(0, 'rgba(170,205,225,0.35)'); rf.addColorStop(1, 'rgba(170,205,225,0.05)'); g.fillStyle = rf; g.fillRect(0, 0, W, H);
    g.fillStyle = '#4a5054'; g.fillRect(0, 0, W, 8); g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H); g.fillRect(125, 0, 6, H);
    g.fillRect(0, H - 6, W, 6);
  });
  // 青い ガラスの 棟（1 まい＝はば 3.2・1 階ぶん 3.6）。下に こい 腰の おび。
  const blue = tex(256, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#7fb0dc'); gr.addColorStop(0.75, '#2c5f93'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(110, 0); g.lineTo(20, 200); g.lineTo(-50, 200); g.fill();
    g.fillStyle = '#1a3554'; g.fillRect(0, 200, W, 56);
    g.fillStyle = '#d7e4ee'; g.fillRect(0, 0, 6, H); g.fillRect(125, 0, 5, 200); g.fillRect(0, 196, W, 6);
  });
  const blueE = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // 左の まどは あかるい へや、右は ほそい あかりの 列だけ（ぜんぶの まどが 同じに 光らない ように）。
    g.fillStyle = 'rgba(255,226,176,0.62)'; g.fillRect(8, 12, 116, 182);
    g.fillStyle = 'rgba(255,244,220,0.85)'; for (let i = 0; i < 3; i += 1) g.fillRect(16 + i * 36, 18, 22, 5);
    g.fillStyle = 'rgba(40,70,110,0.5)'; g.fillRect(131, 12, 120, 182);
    g.fillStyle = 'rgba(255,240,210,0.8)'; for (let i = 0; i < 3; i += 1) g.fillRect(140 + i * 36, 18, 22, 5);
  });
  // 看板の アトラス。
  const items = [
    { id: 'name', w: 1000, h: 120, paint(g, x, y, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
      logo(g, x + 150, y + h / 2, 46);
      fit(g, 'U-SPEAK MALL', x + 470, y + h / 2 + 2, 520, 84, '#16696a');
      fit(g, 'ユースピーク モール', x + 860, y + h / 2 + 2, 250, 40, '#e0761c', 800);
    } },
    { id: 'rest', w: 640, h: 110, paint(g, x, y, w, h) {
      g.fillStyle = '#5b2e1e'; g.fillRect(x, y, w, h);
      fit(g, 'RESTAURANT', x + w * 0.4, y + h / 2 + 2, w * 0.66, 74, '#fff3dc');
      fit(g, 'レストラン', x + w * 0.85, y + h / 2 + 2, w * 0.25, 36, '#ffc879', 800);
    } },
    { id: 'fc', w: 600, h: 110, paint(g, x, y, w, h) {
      g.fillStyle = '#f08a24'; g.fillRect(x, y, w, h);
      fit(g, 'FOOD COURT', x + w * 0.38, y + h / 2 + 2, w * 0.66, 72, '#ffffff');
      fit(g, 'フードコート', x + w * 0.84, y + h / 2 + 2, w * 0.27, 34, '#fff3dc', 800);
    } },
    { id: 'tower', w: 130, h: 600, paint(g, x, y, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); logo(g, x + w / 2, y + 70, 50);
      g.translate(x + w / 2, y + 360); g.rotate(Math.PI / 2); fit(g, 'U-SPEAK MALL', 0, 4, 420, 76, '#16696a');
    } },
    { id: 'entr', w: 300, h: 70, paint(g, x, y, w, h) {
      g.fillStyle = '#16696a'; g.fillRect(x, y, w, h); fit(g, 'ENTRANCE', x + w * 0.38, y + h / 2 + 1, w * 0.6, 40, '#ffffff'); fit(g, 'いりぐち', x + w * 0.83, y + h / 2 + 1, w * 0.28, 24, '#bff0e4', 800);
    } },
    { id: 'white', w: 24, h: 24, paint(g, x, y, w, h) { g.fillStyle = '#fbfaf6'; g.fillRect(x, y, w, h); } },
    { id: 'bike', w: 128, h: 128, paint(g, x, y, w, h) {
      g.fillStyle = '#3d7fc1'; g.fillRect(x, y, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 7;
      for (const cx of [x + 34, x + 94]) { g.beginPath(); g.arc(cx, y + 84, 22, 0, Math.PI * 2); g.stroke(); }
      g.beginPath(); g.moveTo(x + 34, y + 84); g.lineTo(x + 58, y + 52); g.lineTo(x + 84, y + 52); g.lineTo(x + 94, y + 84); g.moveTo(x + 58, y + 52); g.lineTo(x + 64, y + 84); g.lineTo(x + 84, y + 52); g.moveTo(x + 50, y + 44); g.lineTo(x + 64, y + 44); g.moveTo(x + 84, y + 52); g.lineTo(x + 80, y + 38); g.lineTo(x + 92, y + 36); g.stroke();
    } },
    ...TENANTS.map((t, i) => ({ id: `t${i}`, w: 236, h: 112, paint: (g, x, y, w, h) => tenantSign(g, x, y, w, h, t) })),
  ];
  // 高い 看板（塔）は さいごに（たなの 高さを ふやさない）。
  items.push(items.splice(items.findIndex((it) => it.id === 'tower'), 1)[0]);
  const A = atlas(1024, 2048, items);
  extTex = { glass, glassE, warm, shop, blue, blueE, sign: A.tex, cells: A.cells };
  return extTex;
}

/* ───────── 人（シルエット・InstancedMesh）───────── */

function personGeometry(sitting = false) {
  const B = createBatch({});
  if (sitting) {
    B.add('p', box(0, 0.42, 0.12, 0.34, 0.14, 0.42), { color: 0x4a4a52 });        // もも
    B.add('p', cyl(0, 0.5, -0.02, 0.17, 0.21, 0.58, 8), { color: 0xffffff });       // からだ（instanceColor で 色）
  } else {
    B.add('p', box(-0.09, 0, 0, 0.14, 0.78, 0.17), { color: 0x4a4a52 });
    B.add('p', box(0.09, 0, 0, 0.14, 0.78, 0.17), { color: 0x4a4a52 });
    B.add('p', cyl(0, 0.76, 0, 0.18, 0.22, 0.62, 8), { color: 0xffffff });
  }
  const hy = sitting ? 1.24 : 1.52;
  const head = new THREE.SphereGeometry(0.14, 10, 8); head.translate(0, hy, 0); B.add('p', head, { color: 0xf0c8a0 });
  const hair = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.translate(0, hy + 0.01, -0.01); B.add('p', hair, { color: 0x3a2a20 });
  return B.geometry('p');
}
const CLOTHES = [0xe85a5a, 0x3f7fd1, 0xf2b43a, 0x58b46a, 0xf0ece2, 0x2f3a4a, 0xe88ab0, 0x7ac8e0, 0xc98a4b, 0x9ad04a];
function people(points, sitting, rnd, mat) {
  const m = new THREE.InstancedMesh(personGeometry(sitting), mat, Math.max(1, points.length)); m.count = points.length;
  const o = new THREE.Object3D(), c = new THREE.Color();
  points.forEach((p, i) => { o.position.set(p.x, p.y || 0, p.z); o.rotation.set(0, p.ry || 0, 0); const s = p.s || (0.9 + rnd() * 0.18); o.scale.set(s, s, s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.setHex(CLOTHES[Math.floor(rnd() * CLOTHES.length)])); });
  m.castShadow = false; m.receiveShadow = false; return m;
}
function leafBlob(B, x, y, z, r, rnd, base = [0.25, 0.5, 0.22]) {
  const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, 0.8 + rnd() * 0.3, 1); g.rotateY(rnd() * 3); g.translate(x, y, z);
  const c = new THREE.Color(base[0] * (0.8 + rnd() * 0.4), base[1] * (0.85 + rnd() * 0.3), base[2] * (0.8 + rnd() * 0.4));
  B.add('leaf', g, { color: c.getHex() });
}

/* ───────── 外がわ ───────── */

export const MALL = {
  width: 70, depth: 20, height: 24,
  rotunda: { x: 6, z: -3, r: 8.5 },            // かどの ガラスの 円筒
  door: { x: 6, z: 5.6, ry: 0 },                // 円筒の 下の 入口（前に 立つ 点）
  interior: { w: 40, d: 30, levels: [0, 5.5, 11], ceiling: 16.5, entrance: { x: 0, z: 13.2, ry: Math.PI } },
};

export function buildMallExterior(opts = {}) {
  const { shadows = true } = opts;
  const group = new THREE.Group(); group.name = 'mall-exterior';
  const T = exteriorTextures(), C = T.cells, rnd = rng(11);
  const glassMat = (map, emap, ei, extra = {}) => new THREE.MeshStandardMaterial({ map, emissive: emap ? 0xffffff : 0x000000, emissiveMap: emap, emissiveIntensity: ei, roughness: 0.18, metalness: 0.25, ...extra });
  const M = {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }),
    glass: glassMat(T.glass, T.glassE, 0),
    warm: glassMat(T.warm, T.warm, 0.45),
    shop: glassMat(T.shop, T.shop, 0.35),
    blue: glassMat(T.blue, T.blueE, 0),
    sign: new THREE.MeshStandardMaterial({ map: T.sign, emissive: T.sign ? 0xffffff : 0x000000, emissiveMap: T.sign, emissiveIntensity: 0.22, roughness: 0.5 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  };
  if (!T.glass) { M.glass.color.setHex(0x8fb3c6); M.warm.color.setHex(0xe8b878); M.shop.color.setHex(0xf0ece0); M.blue.color.setHex(0x3a6a9c); }
  const B = createBatch({});
  const K = { uv: 'keep' };
  const W = (g, color) => B.add('wall', g, { color });
  const S = (cell, w, h, m) => B.add('sign', panel(C[cell], w, h).applyMatrix4(m), K);
  const WHITE = 0xf4f3ee, CREAM = 0xf1e6cf, BEIGE = 0xd8c6a3, GREY = 0xb9b6ae, DARK = 0x3a3d40, GOLD = 0xe6b235;
  const GF = 4.8;                                  // 1 階の ガラスの 高さ
  // 平らな ガラス（+z むき）に 世界の UV（はば ku・高さ kv）。
  const flatGlass = (key, x0, x1, y0, y1, z, ku, kv, v0 = y0) => B.add(key, worldUV(new THREE.PlaneGeometry(x1 - x0, y1 - y0).toNonIndexed().translate((x0 + x1) / 2, (y0 + y1) / 2, z), ku, kv, v0), K);

  /* 歩道・自転車の みち・ボラード・木 */
  const ZP = 11;
  W(box(0, -0.06, ZP / 2 - 1, 73, 0.2, ZP + 2), 0xd9d4ca);
  for (let x = -36; x <= 36; x += 1.5) W(box(x, 0.135, ZP / 2 - 0.7, 0.05, 0.01, ZP - 1.4), 0xc8c2b6);
  for (let z = 0.8; z < 9; z += 1.5) W(box(0, 0.135, z, 72.6, 0.01, 0.05), 0xc8c2b6);
  W(box(0, 0.14, 10, 72.6, 0.02, 1.6), 0x3d7fc1);
  for (const z of [9.24, 10.76]) W(box(0, 0.16, z, 72.6, 0.01, 0.08), 0xffffff);
  for (let x = -30; x <= 30; x += 12) { const g = panel(C.bike, 1.2, 1.2); g.rotateX(-Math.PI / 2); g.translate(x, 0.17, 10); B.add('sign', g, K); }
  W(box(0, 0, ZP + 0.25, 73, 0.24, 0.5), 0xbdbab3);
  const trees = [-33, -27, -21, -15, -9, -3.5, 16.5, 22, 28, 33.5];
  const obstacles = [];
  for (const x of trees) {
    const z = 7.3;
    W(box(x, 0, z, 1.7, 0.4, 1.7), 0x9a958c); W(box(x, 0.38, z, 1.45, 0.05, 1.45), 0x5b4632);
    W(cyl(x, 0.4, z, 0.13, 0.18, 3.0, 8), 0x6a5040);
    for (let k = 0; k < 4; k += 1) leafBlob(B, x + (rnd() - 0.5) * 1.2, 3.4 + rnd() * 1.6, z + (rnd() - 0.5) * 1.2, 1.1 + rnd() * 0.5, rnd);
    obstacles.push({ x, z, w: 0.9, d: 0.9 });
  }
  for (let x = -35; x <= 35; x += 2.4) {
    if (trees.some((t) => Math.abs(t - x) < 1.3) || Math.abs(x - MALL.door.x) < 3) continue;
    W(cyl(x, 0.1, 8.6, 0.11, 0.13, 0.8, 8), 0x5a5f63); W(cyl(x, 0.72, 8.6, 0.115, 0.115, 0.08, 8), 0xffffff);
    obstacles.push({ x, z: 8.6, w: 0.18, d: 0.18 });
  }

  /* 左：ガラスの アトリウム（まるい 屋根） x -35〜-25 */
  {
    const X0 = -35, X1 = -25, cx = -30, ZB = -16, H = 11;
    W(box(cx, 0, (ZB - 0.6) / 2, X1 - X0, H, -ZB - 0.6), BEIGE);                     // 中の 箱（見えない うら）
    flatGlass('shop', X0 + 0.3, X1 - 0.3, 0, GF, -0.55, 1 / 4, 1 / GF);
    flatGlass('glass', X0, X1, GF + 0.4, H, 0.02, 1 / 4.45, 1 / 4.6, GF + 0.4);
    W(box(cx, GF, 0.25, X1 - X0, 0.4, 1.4), WHITE);                                   // 1 階の ひさし
    for (let x = X0; x <= X1 + 0.01; x += 2.5) W(box(x, GF + 0.4, 0.06, 0.16, H - GF - 0.4, 0.16), WHITE);
    for (const y of [GF + 3.6, H - 0.15]) W(box(cx, y, 0.06, X1 - X0, 0.16, 0.16), WHITE);
    for (const x of [X0, X1]) W(box(x, 0, 0, 0.5, GF, 0.5), WHITE);
    // まるい 屋根（前から 見て アーチ）。
    const R = (X1 - X0) / 2, vault = new THREE.CylinderGeometry(R, R, -ZB, 24, 1, true, -Math.PI / 2, Math.PI).toNonIndexed();
    { const uv = vault.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.PI * R / 4.45, uv.getY(i) * -ZB / 4.6); }
    vault.rotateX(-Math.PI / 2); vault.translate(cx, H, ZB / 2); B.add('glass', vault, K);
    const gable = new THREE.CircleGeometry(R, 24, 0, Math.PI).toNonIndexed(); gable.translate(cx, H, 0.02); B.add('glass', worldUV(gable, 1 / 4.45, 1 / 4.6, H), K);
    for (let z = 0; z >= ZB; z -= 2) { const t = new THREE.TorusGeometry(R + 0.05, 0.1, 4, 24, Math.PI); t.translate(cx, H, z + 0.05); W(t, WHITE); }
    for (let k = 1; k < 6; k += 1) { const a = (k / 6) * Math.PI; W(box(cx + Math.cos(a) * R, H + Math.sin(a) * R, ZB / 2, 0.12, 0.12, -ZB), WHITE); W(box(cx + Math.cos(a) * R * 0.98, H + Math.sin(a) * R * 0.98, 0.04, 0.1, 0.1, 0.1), WHITE); }
    for (let k = 1; k < 4; k += 1) W(box(cx - R + k * 2.5, H, 0.06, 0.12, Math.sqrt(Math.max(0, R * R - (k * 2.5 - R) ** 2)), 0.12), WHITE);
    S('entr', 3.6, 0.84, mat4(cx, GF + 0.2, 0.96));
    obstacles.push({ x: cx, z: -8, w: 5, d: 8 });
  }

  /* ベージュの しまの 棟（看板の たて列） x -25〜0 */
  {
    const X0 = -25, X1 = 0, cx = (X0 + X1) / 2, H = 18, ZB = -20, L = X1 - X0;
    W(box(cx, 0, (ZB - 0.8) / 2, L, H, -ZB - 0.8), BEIGE);
    W(box(cx, GF, -0.4, L, H - GF, 0.8), BEIGE);
    W(box(X0 + 0.01, GF, -10, 0.02, H - GF, 20), BEIGE);
    // よこの しま（クリームの ルーバー が でっぱる）。
    for (let y = GF + 0.55; y < H - 0.4; y += 0.62) W(box(cx, y, 0.06, L, 0.34, 0.14), CREAM);
    W(box(cx, H - 0.1, -0.2, L + 0.2, 0.7, 1.0), WHITE);                               // 屋上の ふち
    // 1 階：ガラスの お店・白い 柱・ひさし。
    flatGlass('shop', X0, X1, 0, GF, -0.79, 1 / 4, 1 / GF);
    for (let x = X0 + 0.25; x <= X1; x += 5) W(box(x, 0, -0.2, 0.5, GF, 0.5), WHITE);
    W(box(cx, GF, 0.5, L, 0.35, 2.6), WHITE); W(box(cx, GF - 0.08, 1.75, L, 0.1, 0.1), DARK);
    // 看板の たて列 3 本（ほそい 黒の わくに 6 まいずつ）。
    const cols = [-21, -14.5, -8]; let k = 0;
    for (const x of cols) {
      W(box(x, GF + 0.7, 0.3, 3.7, 10.9, 0.3), 0x4a4d52);
      for (let j = 0; j < 6; j += 1) { S(`t${k % TENANTS.length}`, 3.3, 1.56, mat4(x, GF + 1.5 + j * 1.8 + 0.78, 0.47)); k += 1; }
    }
    W(box(-2.6, GF + 0.7, 0.3, 2.0, 8.6, 0.3), 0x4a4d52);
    for (let j = 0; j < 5; j += 1) S(`t${(j * 5 + 3) % TENANTS.length}`, 1.7, 0.8, mat4(-2.6, GF + 1.1 + j * 1.65 + 0.4, 0.47));
    W(box(-14.5, H - 1.6, 0.35, 10.2, 1.4, 0.3), 0x3a2418);
    S('rest', 9.6, 1.25, mat4(-14.5, H - 0.9, 0.52));
    obstacles.push({ x: cx, z: -10, w: L / 2, d: 10 });
    for (let x = X0 + 0.25; x <= X1; x += 5) obstacles.push({ x, z: -0.2, w: 0.3, d: 0.3 });
  }

  /* かどの ガラスの 円筒 */
  {
    const { x: RX, z: RZ, r: R } = MALL.rotunda;
    W(box(RX, 0, -13, 18, 17, 14), BEIGE);                                              // うしろの 体
    // 1 階：おくに ひっこんだ ガラスの お店・白い まるい 柱・ひさし・名前の おび。
    B.add('shop', drum(RX, RZ, R - 1, 0, GF, { ku: 1 / 4, kv: 1 / GF }), K);
    for (let i = -5; i <= 5; i += 1) { const a = (i / 12) * Math.PI * 2, x = RX + Math.sin(a) * (R - 0.3), z = RZ + Math.cos(a) * (R - 0.3); W(cyl(x, 0, z, 0.3, 0.3, GF, 12), WHITE); obstacles.push({ x, z, w: 0.32, d: 0.32 }); }
    W(cyl(RX, GF, RZ, R + 1.7, R + 1.7, 0.32, 56), WHITE);
    const soffit = (r, y) => { const g = new THREE.CircleGeometry(r, 56).toNonIndexed(); g.rotateX(Math.PI / 2); g.translate(RX, y, RZ); uvCell(g, [C.white[0] + 0.004, C.white[1] + 0.002, C.white[2] - 0.004, C.white[3] - 0.002]); B.add('sign', g, K); };
    soffit(R + 1.69, GF - 0.01);
    W(cyl(RX, GF + 0.32, RZ, R + 0.25, R + 0.25, 1.3, 56), WHITE);
    B.add('sign', drum(RX, RZ, R + 0.3, GF + 0.42, 1.1, { seg: 24, t0: -0.62, tl: 1.24, cell: C.name }), K);
    S('entr', 2.6, 0.6, mat4(RX, GF - 0.55, RZ + R - 0.95));
    // ガラスの おび 3 本（下 2 本は 空の うつりこみ、上は あたたかい レストラン）と 白い わく。
    const Y = [GF + 1.62, GF + 6.2, GF + 10.78, GF + 15.36];
    B.add('glass', drum(RX, RZ, R, Y[0], Y[1] - Y[0], { ku: 12 / (Math.PI * 2 * R) }), K);
    B.add('glass', drum(RX, RZ, R, Y[1], Y[2] - Y[1], { ku: 12 / (Math.PI * 2 * R) }), K);
    B.add('warm', drum(RX, RZ, R, Y[2], Y[3] - Y[2], { ku: 6 / (Math.PI * 2 * R) }), K);
    for (const y of Y) W(cyl(RX, y - 0.2, RZ, R + 0.14, R + 0.14, 0.4, 56), WHITE);
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; if (Math.cos(a) < -0.45) continue; W(box(0, Y[0], R + 0.04, 0.14, Y[3] - Y[0], 0.14).applyMatrix4(rotY(a, RX, 0, RZ))); }
    // うすい まるい 屋根（大きく はりだす）と 上の こい リブ。
    const TOP = Y[3] + 0.2, RR = R + 2.7;
    W(cyl(RX, TOP, RZ, RR, RR, 0.34, 64), WHITE);
    W(cyl(RX, TOP + 0.34, RZ, RR - 0.15, RR, 0.08, 64), 0xd8d8d2);
    soffit(RR - 0.01, TOP - 0.01);
    for (let i = 0; i < 36; i += 1) { const a = (i / 36) * Math.PI * 2; W(box(0, TOP + 0.38, (RR - 1.4) / 2 + 1.2, 0.22, 0.42, RR - 1.5).applyMatrix4(rotY(a, RX, 0, RZ)), DARK); }
    W(cyl(RX, TOP + 0.38, RZ, 1.4, 1.6, 0.7, 24), DARK);
    W(cyl(RX, TOP + 0.38, RZ, RR - 0.05, RR - 0.05, 0.44, 64), 0x4a4d50);
    W(cyl(RX, TOP + 0.36, RZ, RR - 0.35, RR - 0.35, 0.02, 64), 0x8a8d90);
    obstacles.push({ x: RX, z: RZ, w: (R - 1) * 0.92, d: (R - 1) * 0.92 }, { x: RX, z: RZ, w: (R - 1) * 0.62, d: R - 1 }, { x: RX, z: RZ, w: R - 1, d: (R - 1) * 0.62 });
    obstacles.push({ x: RX, z: -13, w: 9, d: 7 });
  }

  /* 金色の 塔 x 13〜19 */
  {
    const X0 = 13, X1 = 19, cx = 16, ZF = 1.2, ZB = -8, H = 23.5;
    W(box(cx, 0, (ZF + ZB) / 2 - 0.4, X1 - X0, H, ZF - ZB - 0.8), 0xcf9e2e);
    flatGlass('shop', X0 + 0.3, X1 - 0.3, 0, GF, ZF - 0.78, 1 / 4, 1 / GF);
    for (let i = 0; i < 6; i += 1) {
      const x = X0 + 0.5 + i * 1.0, c = new THREE.Color(GOLD).multiplyScalar(0.88 + ((i * 7) % 5) * 0.05);
      W(box(x, GF, ZF - 0.3, 0.92, H - GF, 0.3 + (i % 2) * 0.12), c.getHex());
    }
    for (let y = GF + 3.6; y < H; y += 3.6) W(box(cx, y, ZF - 0.05, X1 - X0, 0.12, 0.3), 0xb8892a);
    W(box(X1 - 0.01, GF, ZB / 2, 0.02, H - GF, -ZB), 0xd8a836);
    W(box(cx, H, (ZF + ZB) / 2, X1 - X0 + 0.3, 0.5, ZF - ZB + 0.3), 0xf0f0ea);
    W(box(cx, GF, ZF + 0.4, X1 - X0, 0.3, 1.6), WHITE);
    W(box(cx, H - 8.6, ZF + 0.12, 1.75, 7.9, 0.2), 0xffffff);
    S('tower', 1.6, 7.4, mat4(cx, H - 4.65, ZF + 0.24));
    obstacles.push({ x: cx, z: (ZF + ZB) / 2, w: 3, d: (ZF - ZB) / 2 });
  }

  /* 青い ガラスの 棟 x 19〜35 */
  {
    const X0 = 19, X1 = 35, cx = 27, H = 16, ZB = -20, L = X1 - X0;
    W(box(cx, 0, (ZB - 0.8) / 2, L, H, -ZB - 0.8), BEIGE);
    W(box(cx, GF, -0.4, L, H - GF - 0.6, 0.78), 0x24476c);
    flatGlass('blue', X0, X1, GF + 0.2, H - 0.6, 0.0, 1 / 3.2, 1 / 3.6, GF + 0.2);
    flatGlass('shop', X0, X1, 0, GF, -0.79, 1 / 4, 1 / GF);
    for (let x = X0 + 0.3; x <= X1; x += 4) W(box(x, 0, -0.2, 0.45, GF, 0.45), WHITE);
    W(box(cx, GF - 0.1, 0.4, L, 0.32, 2.2), WHITE);
    W(box(cx, H - 0.6, -0.3, L + 0.1, 0.9, 1.0), WHITE);
    W(box(X1 + 0.01, GF, -10, 0.02, H - GF, 20), 0xd0c6b0);
    S('fc', 6.4, 1.17, mat4(29, H - 2.4, 0.06));
    S('name', 7.6, 0.91, mat4(25.5, GF + 0.5, 1.52).multiply(new THREE.Matrix4().makeRotationX(0)));
    obstacles.push({ x: cx, z: -10, w: L / 2, d: 10 });
  }
  /* 屋上の 機械・屋根の 面 */
  W(box(0, 0, -20.6, 70, 15, 0.6), BEIGE);
  for (const [x, z, w, d, h] of [[-12, -12, 4, 3, 1.4], [-4, -15, 3, 2.5, 1.1], [27, -12, 5, 3, 1.2], [21, -16, 2.5, 2.5, 1.6], [8, -16, 4, 3, 1.3]]) {
    const y = x > 18 ? 16 : x > -3 ? 17 : 18; W(box(x, y, z, w, h, d), 0xa9a69e);
  }
  for (const [x0, x1, y] of [[-25, -0.1, 18.02], [-3, 15, 17.02], [19, 35, 16.02]]) W(box((x0 + x1) / 2, y, -10.4, x1 - x0, 0.03, 18.8), GREY);

  B.flush(group, M, { noShadow: shadows ? ['sign', 'leaf', 'shop'] : Object.keys(M) });

  /* 歩道の 人（InstancedMesh 1 回） */
  const walkers = [];
  for (let i = 0; i < 16; i += 1) { const x = -33 + rnd() * 66; if (Math.abs(x - MALL.door.x) < 1.5) continue; walkers.push({ x, z: 1.6 + rnd() * 5.4, ry: rnd() * Math.PI * 2 }); }
  walkers.push({ x: MALL.door.x - 1.2, z: 6.2, ry: Math.PI }, { x: MALL.door.x + 1.4, z: 5.8, ry: -2.6 });
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const crowd = people(walkers, false, rnd, pm); crowd.name = 'mall-people'; group.add(crowd);

  function setNight(n) {
    const k = clamp01(n);
    M.warm.emissiveIntensity = 0.45 + 0.75 * k;
    M.glass.emissiveIntensity = 0.95 * k;
    M.shop.emissiveIntensity = 0.35 + 0.8 * k;
    M.blue.emissiveIntensity = 0.75 * k;
    M.sign.emissiveIntensity = 0.22 + 0.9 * k;
  }
  setNight(0);
  let tris = 0; group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  group.userData.mall = { triangles: Math.round(tris) };
  return { group, obstacles: obstacles.map(roundOb), door: { ...MALL.door }, setNight, update() {}, materials: M, triangles: Math.round(tris) };
}
const roundOb = (o) => ({ x: +o.x.toFixed(2), z: +o.z.toFixed(2), w: +o.w.toFixed(2), d: +o.d.toFixed(2) });

/* ───────── 中の もよう ───────── */

const SHOPS = [
  ['BOOKS', 'ほん', '#e85a8c', 'books'], ['TOYS', 'おもちゃ', '#f2a23a', 'toys'], ['SHOES', 'くつ', '#2f7fd1', 'shoes'], ['CAFE', 'カフェ', '#6f9a2a', 'cafe'],
  ['KIDS', 'こども', '#e8b21f', 'clothes'], ['SPORTS', 'スポーツ', '#1fa58a', 'shoes'], ['MUSIC', 'おんがく', '#d9433f', 'books'], ['FLOWERS', 'はな', '#e27aa0', 'flowers'],
  ['BAKERY', 'パン', '#b9783b', 'cafe'], ['PETS', 'ペット', '#3e9bc9', 'toys'], ['SWEETS', 'おかし', '#ff7fa6', 'flowers'], ['ABC', 'えいご', '#2f7fd1', 'books'],
  ['RAMEN', 'ラーメン', '#c8372d', 'food'], ['PIZZA', 'ピザ', '#e0761c', 'food'], ['SUSHI', 'すし', '#2b5d8a', 'food'], ['CURRY', 'カレー', '#d9a21f', 'food'],
];
function shopFront(g, x, y, w, h, [en, ja, bg, kind], rnd) {
  const sh = Math.round(h * 0.2);
  g.fillStyle = '#f6f4ef'; g.fillRect(x, y, w, h);
  // 中（明るい）
  g.fillStyle = '#fbf8f1'; g.fillRect(x + 6, y + sh + 6, w - 12, h - sh - 12);
  g.fillStyle = '#ece5d8'; g.fillRect(x + 6, y + h - 34, w - 12, 28);
  const pal = ['#e85a8c', '#2f7fd1', '#f2a23a', '#47b44a', '#ffd23f', '#d9433f', '#6cc3e8', '#ffffff'];
  const top = y + sh + 22;
  if (kind === 'food') {
    g.fillStyle = '#2d2a28'; g.fillRect(x + 6, top, w - 12, 46);
    for (let i = 0; i < 4; i += 1) { g.fillStyle = '#fff4dc'; g.fillRect(x + 16 + i * 58, top + 6, 48, 34); g.fillStyle = pal[(i * 3) % 7]; g.beginPath(); g.arc(x + 40 + i * 58, top + 26, 11, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = bg; g.fillRect(x + 6, y + h - 74, w - 12, 44); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 6, y + h - 74, w - 12, 6);
  } else if (kind === 'cafe') {
    g.fillStyle = '#8a5a34'; g.fillRect(x + 6, y + h - 80, w - 12, 46);
    for (let i = 0; i < 8; i += 1) { g.fillStyle = ['#f3e2c4', '#c98a4b', '#e8c48a'][i % 3]; g.beginPath(); g.arc(x + 24 + i * 28, y + h - 88, 10, Math.PI, 0); g.fill(); }
    for (let i = 0; i < 5; i += 1) { g.fillStyle = '#6b4a2e'; g.fillRect(x + 20 + i * 46, top + 6, 30, 30); }
  } else if (kind === 'flowers') {
    for (let i = 0; i < 18; i += 1) { g.fillStyle = pal[Math.floor(rnd() * 7)]; g.beginPath(); g.arc(x + 20 + rnd() * (w - 40), top + 30 + rnd() * (h - sh - 110), 8 + rnd() * 6, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 6; i += 1) { g.fillStyle = '#5aa04a'; g.beginPath(); g.arc(x + 24 + i * 40, y + h - 46, 14, 0, Math.PI * 2); g.fill(); }
  } else {
    for (let r = 0; r < 3; r += 1) {
      g.fillStyle = '#c9c0ae'; g.fillRect(x + 12, top + 28 + r * 34, w - 24, 4);
      for (let i = 0; i < (kind === 'books' ? 20 : 8); i += 1) {
        g.fillStyle = pal[Math.floor(rnd() * pal.length)];
        if (kind === 'books') g.fillRect(x + 14 + i * ((w - 28) / 20), top + 6 + r * 34, (w - 28) / 20 - 2, 22);
        else if (kind === 'toys') { g.beginPath(); g.arc(x + 26 + i * ((w - 40) / 8), top + 16 + r * 34, 10, 0, Math.PI * 2); g.fill(); }
        else if (kind === 'shoes') { rrect(g, x + 18 + i * ((w - 36) / 8), top + 14 + r * 34, 20, 12, 5); g.fill(); }
        else { g.fillRect(x + 18 + i * ((w - 36) / 8), top + 2 + r * 34, 16, 26); }
      }
    }
  }
  // ガラスの わくと うつりこみ
  const rf = g.createLinearGradient(x, y + sh, x + w * 0.7, y + h); rf.addColorStop(0, 'rgba(200,225,235,0.32)'); rf.addColorStop(1, 'rgba(200,225,235,0.02)'); g.fillStyle = rf; g.fillRect(x + 6, y + sh + 6, w - 12, h - sh - 12);
  g.fillStyle = '#d9d6cf'; g.fillRect(x, y + sh, w, 6); g.fillRect(x, y + sh, 6, h - sh); g.fillRect(x + w - 6, y + sh, 6, h - sh); g.fillRect(x + w / 2 - 2, y + sh, 4, h - sh);
  // 看板（上の おび）
  g.fillStyle = bg; g.fillRect(x, y, w, sh);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 5);
  fit(g, en, x + w * 0.38, y + sh / 2 + 1, w * 0.56, sh * 0.62, '#ffffff');
  fit(g, ja, x + w * 0.82, y + sh / 2 + 1, w * 0.3, sh * 0.36, '#fff3dc', 800);
}

let intTex = null;
function interiorTextures() {
  if (intTex) return intTex;
  const rnd = rng(57);
  // 木の かべ（たての 板 8 まい・はば 2・高さ 4）。
  const wood = tex(256, 256, (g, W, H) => {
    const pal = ['#c98d52', '#d49a5c', '#be8247', '#d8a466', '#c48a50', '#cf9558', '#b97f45', '#d49e62'];
    for (let i = 0; i < 8; i += 1) {
      g.fillStyle = pal[i]; g.fillRect(i * 32, 0, 32, H);
      for (let k = 0; k < 5; k += 1) { g.strokeStyle = `rgba(110,60,25,${0.08 + rnd() * 0.1})`; g.lineWidth = 1 + rnd() * 1.5; g.beginPath(); const x = i * 32 + 4 + rnd() * 24; g.moveTo(x, 0); g.bezierCurveTo(x + 6 * (rnd() - 0.5), H * 0.3, x + 6 * (rnd() - 0.5), H * 0.7, x, H); g.stroke(); }
      g.fillStyle = 'rgba(80,40,15,0.45)'; g.fillRect(i * 32, 0, 2, H); g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(i * 32 + 2, 0, 2, H);
    }
  });
  // ゆかの 木（よこの 板・ずらして ならぶ）。
  const floor = tex(512, 512, (g, W, H) => {
    const pal = ['#e6c89c', '#dcb98a', '#ead1aa', '#d8b383', '#e2c295', '#efd8b4'];
    const rows = 16, rh = H / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = -((r * 137) % 200);
      while (x < W) { const len = 160 + rnd() * 140; g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.fillRect(x, r * rh, len, rh);
        for (let k = 0; k < 3; k += 1) { g.fillStyle = `rgba(150,100,55,${0.05 + rnd() * 0.06})`; g.fillRect(x + rnd() * len, r * rh + rnd() * rh, 40 + rnd() * 80, 1.5); }
        g.fillStyle = 'rgba(120,80,40,0.35)'; g.fillRect(x, r * rh, 2, rh); x += len; }
      g.fillStyle = 'rgba(120,80,40,0.3)'; g.fillRect(0, r * rh, W, 1.5);
    }
  });
  // 天窓（空 ＋ ガラスの わく）。上の 8px は 白（ダウンライトに 使う）。
  const sky = tex(256, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f4fbff'); gr.addColorStop(1, '#cfe7f8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i += 1) { const rg = g.createRadialGradient(rnd() * W, rnd() * H, 4, rnd() * W, rnd() * H, 60); rg.addColorStop(0, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
  });
  // ラタンの あみめ。
  const weave = tex(128, 128, (g, W, H) => {
    g.fillStyle = '#b8874f'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) {
      const o = ((x + y) / 16) % 2;
      g.fillStyle = o ? '#d9ad72' : '#caa064'; g.fillRect(x + 1, y + 1, o ? 14 : 6, o ? 6 : 14);
      g.fillStyle = o ? '#c99a5e' : '#ddb47c'; g.fillRect(x + (o ? 1 : 8), y + (o ? 8 : 1), o ? 14 : 6, o ? 6 : 14);
    }
    g.fillStyle = 'rgba(90,55,25,0.25)'; for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 1);
  });
  const items = [
    ...SHOPS.map((s, i) => ({ id: `s${i}`, w: 248, h: 200, paint: (g, x, y, w, h) => shopFront(g, x, y, w, h, s, rnd) })),
    { id: 'exit', w: 248, h: 200, paint(g, x, y, w, h) {
      g.fillStyle = '#f6f4ef'; g.fillRect(x, y, w, h);
      const gr = g.createLinearGradient(0, y + 40, 0, y + h); gr.addColorStop(0, '#cfe6f2'); gr.addColorStop(1, '#eaf4f8'); g.fillStyle = gr; g.fillRect(x + 20, y + 44, w - 40, h - 50);
      g.fillStyle = '#6a7378'; for (const fx of [x + 20, x + w / 2 - 3, x + w - 26]) g.fillRect(fx, y + 44, 6, h - 50); g.fillRect(x + 20, y + 44, w - 40, 6);
      g.fillStyle = '#16696a'; g.fillRect(x, y, w, 40); fit(g, 'ENTRANCE', x + w * 0.38, y + 21, w * 0.55, 26, '#ffffff'); fit(g, 'いりぐち', x + w * 0.82, y + 21, w * 0.3, 16, '#bff0e4', 800);
    } },
    { id: 'fc', w: 500, h: 100, paint(g, x, y, w, h) {
      g.fillStyle = '#f08a24'; rrect(g, x, y, w, h, 18); g.fill();
      fit(g, 'FOOD COURT', x + w * 0.4, y + h / 2 + 2, w * 0.64, 62, '#ffffff'); fit(g, 'フードコート', x + w * 0.84, y + h / 2 + 2, w * 0.26, 30, '#fff3dc', 800);
    } },
    { id: 'name', w: 500, h: 100, paint(g, x, y, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); logo(g, x + 60, y + h / 2, 36);
      fit(g, 'U-SPEAK MALL', x + 270, y + h * 0.4, 330, 52, '#16696a'); fit(g, 'ユースピーク モール', x + 270, y + h * 0.8, 260, 22, '#e0761c', 800);
    } },
  ];
  const A = atlas(1024, 2048, items);
  intTex = { wood, floor, sky, weave, shops: A.tex, cells: A.cells };
  return intTex;
}

/* ───────── 中（吹きぬけ・フードコート）───────── */

export function buildMallInterior(opts = {}) {
  const { shadows = true } = opts;
  const group = new THREE.Group(); group.name = 'mall-interior';
  const T = interiorTextures(), C = T.cells, rnd = rng(19);
  const HX = 20, HZ = 15, VX = 13, VZ = 7, LV = MALL.interior.levels, TOP = MALL.interior.ceiling, LH = 5.5, SLAB = 0.7;
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.5, color: T.floor ? 0xffffff : 0xe0c195 }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.65, color: T.wood ? 0xffffff : 0xc98d52, emissive: 0x3a1e08, emissiveIntensity: 0 }),
    base: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdff3f2, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    shop: new THREE.MeshStandardMaterial({ map: T.shops, emissive: T.shops ? 0xffffff : 0x000000, emissiveMap: T.shops, emissiveIntensity: 0.4, roughness: 0.4 }),
    sky: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: T.sky, emissiveIntensity: 1.05 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff1d6, emissiveIntensity: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  };
  const B = createBatch({ wood: [0.5, 0.25], floor: [0.25, 0.25] });
  const K = { uv: 'keep' };
  const P = (g, color) => B.add('base', g, { color });
  const WD = (g) => B.add('wood', g);
  const WHITE = 0xf6f4ef, TILE = 0xe9e3d7, DARK = 0x34373b, SILVER = 0xc9ccd0;
  const obstacles = [], ob = (x, z, w, d) => obstacles.push(roundOb({ x, z, w, d }));

  /* ゆか・バルコニー・天井 */
  B.add('floor', box(0, -0.1, 0, HX * 2, 0.1, HZ * 2));
  for (const y of LV.slice(1)) {
    for (const [x, z, w, d] of [[0, (VZ + HZ) / 2, HX * 2, HZ - VZ], [0, -(VZ + HZ) / 2, HX * 2, HZ - VZ], [(VX + HX) / 2, 0, HX - VX, VZ * 2], [-(VX + HX) / 2, 0, HX - VX, VZ * 2]]) {
      P(box(x, y - SLAB, z, w, SLAB, d), WHITE); P(box(x, y, z, w, 0.02, d), TILE);
    }
    // バルコニーの 下の ダウンライト。
    for (let x = -HX + 2.5; x < HX; x += 3.5) for (const z of [-(VZ + HZ) / 2, (VZ + HZ) / 2]) { const c = new THREE.CircleGeometry(0.22, 12); c.rotateX(Math.PI / 2); c.translate(x, y - SLAB - 0.01, z); B.add('lamp', c, K); }
    for (let z = -VZ + 1.5; z < VZ; z += 3.5) for (const x of [-(VX + HX) / 2, (VX + HX) / 2]) { const c = new THREE.CircleGeometry(0.22, 12); c.rotateX(Math.PI / 2); c.translate(x, y - SLAB - 0.01, z); B.add('lamp', c, K); }
  }
  // 天井：白い ルーバー（よこ）と おくの くらい 板、まんなかに ながい 天窓。
  const SKY = { x: 12, z: 2.4, y: 18.3 };
  for (const [x, z, w, d] of [[0, (SKY.z + HZ) / 2, HX * 2, HZ - SKY.z], [0, -(SKY.z + HZ) / 2, HX * 2, HZ - SKY.z], [(SKY.x + HX) / 2, 0, HX - SKY.x, SKY.z * 2], [-(SKY.x + HX) / 2, 0, HX - SKY.x, SKY.z * 2]]) P(box(x, TOP + 0.35, z, w, 0.1, d), 0x7d756a);
  for (let z = -HZ + 0.25; z < HZ; z += 0.42) {
    if (Math.abs(z) < SKY.z) { for (const s of [-1, 1]) P(box(s * (SKY.x + HX) / 2, TOP, z, HX - SKY.x, 0.24, 0.12), WHITE); continue; }
    P(box(0, TOP, z, HX * 2, 0.24, 0.12), WHITE);
  }
  for (const s of [-1, 1]) { P(box(0, TOP, s * SKY.z, SKY.x * 2, SKY.y - TOP, 0.1), WHITE); P(box(s * SKY.x, TOP, 0, 0.1, SKY.y - TOP, SKY.z * 2), WHITE); }
  { const g = new THREE.PlaneGeometry(SKY.x * 2, SKY.z * 2).toNonIndexed(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i)); g.rotateX(Math.PI / 2); g.translate(0, SKY.y, 0); B.add('sky', g, K); }
  for (let x = -SKY.x; x <= SKY.x + 0.01; x += 1.5) P(box(x, SKY.y - 0.16, 0, 0.08, 0.14, SKY.z * 2), 0x5a5f63);
  P(box(0, SKY.y - 0.16, 0, SKY.x * 2, 0.14, 0.08), 0x5a5f63);

  /* 木の はり（天井を わたる）と 木の 柱 */
  const PX = [-13, -4.5, 4.5, 13], BY = 15.0;
  for (const x of PX) WD(box(x, BY, 0, 1.3, TOP - BY + 0.05, HZ * 2));
  for (const z of [-VZ, VZ]) WD(box(0, BY + 0.15, z, HX * 2, TOP - BY - 0.1, 1.2));
  for (const x of PX) for (const z of [-VZ, VZ]) {
    WD(box(x, 0, z, 1.8, BY, 1.8));
    P(box(x, 0, z, 1.9, 0.12, 1.9), 0x6b5038);
    ob(x, z, 1.05, 1.05);
  }

  /* まわりの お店（3 階ぶん） */
  const shopKeys = Object.keys(C).filter((k) => /^s\d+$/.test(k) && +k.slice(1) < 12);
  let si = 0;
  const wallRun = (len, place, y, special = null) => {
    const n = Math.round(len / 6.2), w = len / n;
    for (let i = 0; i < n; i += 1) {
      const key = special?.(i, n) || shopKeys[si++ % shopKeys.length];
      const g = panel(C[key], w - 0.3, 4.8); g.translate(-len / 2 + (i + 0.5) * w, y + 2.4, 0); B.add('shop', g.applyMatrix4(place), K);
      const f = box(-len / 2 + i * w, y, 0.02, 0.3, LH - (y + LH > TOP ? 0 : SLAB), 0.12); P(f.applyMatrix4(place), WHITE);
    }
    const top = box(0, y + 4.8, 0.01, len, LH - 4.8 - (y + LH > TOP ? -0.1 : SLAB) + 0.01, 0.06); P(top.applyMatrix4(place), WHITE);
  };
  const food = ['s12', 's13', 's14', 's15', 's8', 's10'];
  LV.forEach((y, li) => {
    wallRun(HX * 2, mat4(0, 0, -HZ, 0), y, li === 0 ? (i) => food[i % food.length] : null);
    wallRun(HX * 2, mat4(0, 0, HZ, Math.PI), y, li === 0 ? (i, n) => (i === Math.floor(n / 2) ? 'exit' : null) : null);
    wallRun(HZ * 2, mat4(-HX, 0, 0, Math.PI / 2), y);
    wallRun(HZ * 2, mat4(HX, 0, 0, -Math.PI / 2), y);
  });
  // フードコートの カウンター（1 階の おく）と 大きな 看板。
  P(box(0, 0, -HZ + 1.0, HX * 2 - 1, 1.05, 0.9), 0xf2efe8); P(box(0, 1.05, -HZ + 1.0, HX * 2 - 1, 0.06, 1.0), 0x8a6a4a);
  ob(0, -HZ + 0.6, HX, 1.1);
  B.add('shop', panel(C.fc, 6.5, 1.3).applyMatrix4(mat4(0, LV[1] - SLAB - 1.05, -VZ + 0.35)), K);
  P(box(0, LV[1] - SLAB - 1.75, -VZ + 0.28, 6.7, 1.4, 0.1), 0xf08a24);
  for (const s of [-1, 1]) P(box(s * 2.8, LV[1] - SLAB - 0.4, -VZ + 0.28, 0.04, 0.4, 0.04), DARK);
  B.add('shop', panel(C.name, 5, 1).applyMatrix4(mat4(0, LV[2] + 0.6 + 4.2, HZ - 0.08, Math.PI)), K);

  /* バルコニーの ふち：白い 腰・ガラスの てすり・木の 手すり・植えこみ・たれる みどり */
  const posts = [];
  const edges = [];   // { a:[x,z], b:[x,z], n:[nx,nz] }（n＝吹きぬけの がわ）
  const spans = (c0, c1) => { const out = []; let a = c0; for (const p of PX) { if (p - 0.9 > a && p - 0.9 < c1) { out.push([a, p - 0.9]); a = p + 0.9; } } if (a < c1) out.push([a, c1]); return out; };
  for (const s of [-1, 1]) for (const [a, b] of spans(-VX - 0.9, VX + 0.9)) edges.push({ ax: a, bx: b, z: s * VZ, nz: -s });
  for (const s of [-1, 1]) edges.push({ x: s * VX, az: -VZ + 0.9, bz: VZ - 0.9, nx: -s });
  LV.slice(1).forEach((y, li) => {
    for (const e of edges) {
      const along = e.ax !== undefined;
      const segs = [];
      if (along) {
        // 2 階の おくは エスカレーターの 乗り場で あける（x 0.3〜3.3）。
        if (li === 0 && e.z < 0) { for (const [a, b] of [[e.ax, Math.min(e.bx, 0.3)], [Math.max(e.ax, 3.3), e.bx]]) if (b - a > 0.3) segs.push([a, b]); } else segs.push([e.ax, e.bx]);
      } else if (li === 1 && e.x > 0) { segs.push([e.az, -5.7], [-3.9, e.bz]); } else segs.push([e.az, e.bz]);
      for (const [a, b] of segs) {
        const len = b - a, mid = (a + b) / 2;
        const at = (u, off, h, y0, d, t) => along ? box(mid + u, y0, e.z + e.nz * off, len, h, t) : box(e.x + e.nx * off, y0, mid + u, t, h, len);
        P(at(0, 0.02, 0.9, y - 0.8, 0, 0.06), WHITE);                                          // 白い 腰
        B.add('glass', at(0, -0.35, 1.0, y + 0.05, 0, 0.03));                                 // ガラスの てすり
        WD(at(0, -0.35, 0.07, y + 1.06, 0, 0.12));                                            // 木の 手すり
        P(at(0, 0.3, 0.5, y - 0.02, 0, 0.55), 0xf2f0ea);                                     // 植えこみの はこ
        for (let u = 0; u <= len; u += 1.3) posts.push(along ? [a + u, y, e.z - e.nz * 0.35] : [e.x - e.nx * 0.35, y, a + u]);
        for (let u = 0.3; u < len; u += 0.5) {
          const px = along ? a + u : e.x + e.nx * 0.3, pz = along ? e.z + e.nz * 0.3 : a + u;
          leafBlob(B, px, y + 0.5, pz, 0.24 + rnd() * 0.1, rnd, [0.17, 0.4, 0.15]);
          // たれる つる（ほそい 葉の 帯）
          if (rnd() < 0.9) {
            const L = 1.0 + rnd() * 2.8, vx = along ? px + (rnd() - 0.5) * 0.3 : e.x + e.nx * 0.6, vz = along ? e.z + e.nz * 0.6 : pz + (rnd() - 0.5) * 0.3;
            const c = new THREE.Color(0.2 + rnd() * 0.1, 0.42 + rnd() * 0.15, 0.16 + rnd() * 0.08).getHex();
            for (let k = 0; k < L; k += 0.17) { const r = Math.max(0.06, 0.13 - (k / L) * 0.06), g = new THREE.OctahedronGeometry(r, 0); g.scale(1, 1.6, 0.7); g.rotateY(rnd() * 3); g.translate(vx + (rnd() - 0.5) * 0.14, y + 0.05 - k, vz + (rnd() - 0.5) * 0.14); B.add('leaf', g, { color: c }); }
          }
        }
      }
    }
  });

  /* エスカレーター 2 本（1→2 階・2→3 階）。おくの 吹きぬけに ジグザグ */
  const EZ = -4.8;
  function escalator(x0, y0, x1, y1, z) {
    const lift = 0.0, a = [x0, y0 + 0.45, z], b = [x1, y1 + 0.45, z];
    P(beam(a, b, 1.5, 0.95), SILVER);
    P(beam([x0 - 1.0, y0 + 0.45, z], [x0 + 0.2, y0 + 0.45, z], 1.5, 0.95).translate(0, -0.42 + lift, 0), SILVER);
    P(beam([x1 - 0.2, y1 + 0.45, z], [x1 + 1.0, y1 + 0.45, z], 1.5, 0.95).translate(0, -0.42, 0), SILVER);
    P(beam(a, b, 1.0, 0.06).translate(0, 0.5, 0), DARK);
    for (const s of [-1, 1]) {
      B.add('glass', beam(a, b, 0.04, 0.9).translate(0, 0.95, s * 0.62));
      P(beam([x0 - 0.9, y0 + 1.42, z + s * 0.62], [x0, y0 + 1.42, z + s * 0.62], 0.1, 0.1), 0x1e1f22);
      P(beam(a, b, 0.1, 0.1).translate(0, 0.97, s * 0.62), 0x1e1f22);
      P(beam([x1, y1 + 1.42, z + s * 0.62], [x1 + 0.9, y1 + 1.42, z + s * 0.62], 0.1, 0.1), 0x1e1f22);
    }
  }
  escalator(-9.2, LV[0], 0.3, LV[1], EZ);
  escalator(3.3, LV[1], 12.3, LV[2], EZ);
  // 乗り場（2 階・3 階）。
  P(box(1.8, LV[1] - SLAB, -5.25, 3.0, SLAB, 3.5), WHITE); P(box(1.8, LV[1], -5.25, 3.0, 0.02, 3.5), TILE);
  P(box(12.65, LV[2] - SLAB, -4.8, 0.9, SLAB, 1.8), WHITE); P(box(12.65, LV[2], -4.8, 0.9, 0.02, 1.8), TILE);
  ob(-5.2, EZ, 5.6, 0.85);

  /* まんなかの 大きな 木（まるい 植えこみ・木の ベンチ） */
  const TR = { x: 0, z: 1.0 };
  P(cyl(TR.x, 0, TR.z, 2.0, 2.1, 0.75, 32), 0xf2efe8);
  P(cyl(TR.x, 0.74, TR.z, 1.85, 1.85, 0.05, 32), 0x5b4632);
  WD(cyl(TR.x, 0, TR.z, 2.75, 2.75, 0.46, 40));
  P(cyl(TR.x, 0.46, TR.z, 2.78, 2.78, 0.03, 40), 0xd9b483);
  P(cyl(TR.x, 0.78, TR.z, 0.22, 0.42, 5.6, 10), 0x7a5a42);
  for (let k = 0; k < 6; k += 1) { const a = (k / 6) * Math.PI * 2; P(beam([TR.x, 3.6 + k * 0.4, TR.z], [TR.x + Math.sin(a) * 2.2, 5.6 + k * 0.35, TR.z + Math.cos(a) * 2.2], 0.16, 0.16), 0x7a5a42); }
  for (let k = 0; k < 16; k += 1) { const a = rnd() * Math.PI * 2, r = rnd() * 2.6; leafBlob(B, TR.x + Math.sin(a) * r, 6.0 + rnd() * 3.2, TR.z + Math.cos(a) * r, 1.0 + rnd() * 0.7, rnd, [0.24, 0.52, 0.22]); }
  ob(TR.x, TR.z, 2.75, 2.75);
  // すみの 鉢植え。
  for (const [x, z] of [[-11.2, 5.4], [11.2, 5.4], [-11.2, -2.6], [11.2, -2.6], [-17.8, 12.8], [17.8, 12.8]]) {
    P(cyl(x, 0, z, 0.55, 0.42, 0.8, 16), 0xf2efe8); P(cyl(x, 0.8, z, 0.08, 0.1, 1.2, 6), 0x6a5040);
    for (let k = 0; k < 3; k += 1) leafBlob(B, x + (rnd() - 0.5) * 0.6, 1.6 + k * 0.45, z + (rnd() - 0.5) * 0.6, 0.55 - k * 0.1, rnd);
    ob(x, z, 0.55, 0.55);
  }

  B.flush(group, M, { noShadow: shadows ? ['glass', 'sky', 'lamp', 'shop', 'leaf'] : Object.keys(M) });

  /* ラタンの いす・まるい テーブル・人（InstancedMesh） */
  const tables = [], chairs = [], sitters = [];
  const spots = [];
  for (const x of [-10.5, -7.5, 7.5, 10.5]) for (const z of [-1.2, 1.8, 4.8]) spots.push([x, z]);
  for (const [x, z] of [[-4.6, 4.6], [4.6, 4.6], [-4.6, -2.4], [4.6, -2.4], [-1.6, 5.6], [1.6, 5.6], [0, -2.9]]) spots.push([x, z]);
  for (const [x, z] of spots) {
    tables.push({ x, z }); ob(x, z, 0.75, 0.75);
    const n = 3 + Math.floor(rnd() * 2), a0 = rnd() * Math.PI;
    for (let k = 0; k < n; k += 1) {
      const a = a0 + (k / n) * Math.PI * 2, cx = x + Math.sin(a) * 0.95, cz = z + Math.cos(a) * 0.95;
      chairs.push({ x: cx, z: cz, ry: a + Math.PI });
      if (rnd() < 0.42) sitters.push({ x: cx + Math.sin(a) * 0.05, z: cz + Math.cos(a) * 0.05, ry: a + Math.PI });
    }
  }
  // ラタンの いす（つぼの 形の 背もたれ・前が あいて いる・クッション・あし）。
  const CB = createBatch({});
  {
    const pts = [[0.2, 0.36], [0.3, 0.4], [0.36, 0.52], [0.38, 0.7], [0.37, 0.86], [0.33, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
    const shell = new THREE.LatheGeometry(pts, 14, Math.PI * 0.32, Math.PI * 1.36); { const uv = shell.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 1.2); }
    CB.add('c', shell, { color: 0xffffff, uv: 'keep' });
    const seat = new THREE.CylinderGeometry(0.3, 0.32, 0.12, 14); seat.translate(0, 0.43, 0); CB.add('c', seat, { color: 0xffffff, uv: 'keep' });
    const cush = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14); cush.translate(0, 0.52, 0.02); { const uv = cush.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.01, 0.01); } CB.add('c', cush, { color: 0xffffff, uv: 'keep' });
    for (let k = 0; k < 4; k += 1) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4, l = cyl(Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22, 0.018, 0.022, 0.38, 6); { const uv = l.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.5, 0.5); } CB.add('c', l, { color: 0x6a4a2a, uv: 'keep' }); }
  }
  const chairMat = new THREE.MeshStandardMaterial({ map: T.weave, vertexColors: true, roughness: 0.9, color: T.weave ? 0xffffff : 0xc99a5e, side: THREE.DoubleSide });
  const TB = createBatch({});
  TB.add('t', cyl(0, 0.72, 0, 0.5, 0.5, 0.04, 28), { color: 0xf7f5f0 });
  TB.add('t', cyl(0, 0.04, 0, 0.04, 0.04, 0.68, 8), { color: 0x2a2b2e });
  TB.add('t', cyl(0, 0, 0, 0.26, 0.28, 0.04, 16), { color: 0x2a2b2e });
  const inst = (geo, mat, list, name, tint = null) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D(), c = new THREE.Color();
    list.forEach((p, i) => { o.position.set(p.x, p.y || 0, p.z); o.rotation.set(0, p.ry || 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (tint) m.setColorAt(i, c.setHex(tint(i))); });
    m.name = name; m.castShadow = shadows; m.receiveShadow = false; group.add(m); return m;
  };
  // ラタンの こい・うすいを まぜる（色は クッションにも のる＝白い クッションが 少し 色づく だけ）。
  inst(CB.geometry('c'), chairMat, chairs, 'mall-chairs', (i) => [0xffffff, 0xf0e2cc, 0xe6d2b4][i % 3]);
  inst(TB.geometry('t'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), tables, 'mall-tables');
  const postGeo = new THREE.BoxGeometry(0.06, 1.08, 0.06); postGeo.translate(0, 0.56, 0);
  inst(postGeo, new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.35, metalness: 0.5 }), posts.map(([x, y, z]) => ({ x, y, z })), 'mall-posts').castShadow = false;
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const seated = people(sitters, true, rnd, pm); seated.name = 'mall-sitters'; group.add(seated);
  // 歩く 人：1 階の お店の 前・2 階と 3 階の バルコニー。行ったり 来たり（update）。
  const walk = [];
  for (let i = 0; i < 12; i += 1) walk.push({ y: 0, z: rnd() < 0.5 ? 9.5 + rnd() * 3 : -9 - rnd() * 3, x0: -17, x1: 17 });
  for (let i = 0; i < 9; i += 1) walk.push({ y: LV[1], z: (rnd() < 0.5 ? 1 : -1) * (9 + rnd() * 4), x0: -18, x1: 18 });
  for (let i = 0; i < 7; i += 1) walk.push({ y: LV[2], z: (rnd() < 0.5 ? 1 : -1) * (9 + rnd() * 4), x0: -18, x1: 18 });
  for (let i = 0; i < 5; i += 1) walk.push({ y: LV[1 + (i % 2)], x: (i % 2 ? 1 : -1) * (15.5 + rnd() * 3), z0: -12, z1: 12 });
  walk.forEach((w) => { w.p = rnd(); w.v = 0.012 + rnd() * 0.02; });
  const walkers = people(walk.map((w) => ({ x: w.x ?? 0, y: w.y, z: w.z ?? 0 })), false, rnd, pm); walkers.name = 'mall-walkers'; group.add(walkers);
  const o3 = new THREE.Object3D();
  function update(t = 0) {
    walk.forEach((w, i) => {
      const ph = (w.p + t * w.v) % 2, f = ph < 1 ? ph : 2 - ph, dir = ph < 1 ? 1 : -1, bob = Math.abs(Math.sin(t * 6 + i)) * 0.03;
      if (w.x0 !== undefined) { o3.position.set(w.x0 + (w.x1 - w.x0) * f, w.y + bob, w.z); o3.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
      else { o3.position.set(w.x, w.y + bob, w.z0 + (w.z1 - w.z0) * f); o3.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); }
      o3.scale.setScalar(0.95); o3.updateMatrix(); walkers.setMatrixAt(i, o3.matrix);
    });
    walkers.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // まわりの かべ（1 階の 当たり判定）。入口の まえは あけない（入口の 点は かべの 内がわ）。
  ob(0, -HZ - 0.2, HX, 0.4); ob(0, HZ + 0.2, HX, 0.4); ob(-HX - 0.2, 0, 0.4, HZ); ob(HX + 0.2, 0, 0.4, HZ);

  function setNight(n) {
    const k = clamp01(n);
    M.sky.emissive.setRGB(1 - 0.86 * k, 1 - 0.8 * k, 1 - 0.62 * k); M.sky.emissiveIntensity = 1.05;
    M.shop.emissiveIntensity = 0.4 + 0.55 * k;
    M.lamp.emissiveIntensity = 0.8 + 0.4 * k;
    M.wood.emissiveIntensity = 0.25 * k;
  }
  setNight(0);
  let tris = 0; group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  return { group, obstacles, entrance: { ...MALL.interior.entrance }, setNight, update, materials: M, triangles: Math.round(tris) };
}
