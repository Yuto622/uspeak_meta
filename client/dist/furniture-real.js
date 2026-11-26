// かぐの リアルな 3D モデル（かぐ屋の 31 しゅるい：はじめの 11・パソコン・2026-11 の 15・ベッド 4 つ）。マイルーム（room-world.js）と かぐ屋の カードの 絵が 使う。
//
// ・モデルの ファイルは 読まない：まるい 角の クッション（Extrude）・ろくろで ひいた 脚（Lathe）・つつ・球と、
//   canvas で かいた もよう（木目・ぬの・ラグ・時計の 文字ばん・テレビの 画面・けんばん・本の せ）。
// ・**大きさは town.json の w × d マスの まま**（サーバーが 同じ 数で 判定する）。モデルは まんなかが 原点・底が y = 0・
//   うしろが −z。むきは 置く がわ（room-world.js）が 90° ずつ 回す。
// ・重く しない：1 しゅるいを 1 回だけ 組み立て、**材質ごとに 1 つの 形に まとめて** おぼえる（かぐ 1 つ＝数回の 描画）。
//   置く たびに 作るのは 入れ物（Group）だけで、形と 材質は みんなで つかう。光は 足さない（ランプ・画面は emissive）。
// ・絵が かけない とき（検査の Node など）は 色だけの 材質に なる。形は そのまま。
import * as THREE from './three.module.js';

// ---- もよう（1 回 かいて おぼえる） ---------------------------------------------------

const texCache = new Map();
function tex(key, w, h, paint, repeat = false) {
  if (texCache.has(key)) return texCache.get(key);
  let t = null;
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

// ---- 材質（色＋しゅるいごとに 1 つ） ----------------------------------------------------

const mats = new Map();
function M(key, make) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key);
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o });
const wood = (c, rough = 0.6) => M(`wood:${c}:${rough}`, () => std({ color: c, map: woodTex(), roughness: rough }));
const cloth = (c) => M(`cloth:${c}`, () => std({ color: c, map: fabricTex(), roughness: 0.96 }));
const flat = (c, rough = 0.7, extra = null) => M(`flat:${c}:${rough}:${extra ? JSON.stringify(extra) : ''}`, () => std({ color: c, roughness: rough, ...extra }));
// 金ぞく：この 部屋には うつりこむ 空が ないので、metalness は ひかえめ（高いと まっ黒に なる）。
const brass = () => M('brass', () => std({ color: 0xd4a84a, roughness: 0.3, metalness: 0.35 }));
const glow = (c, k, map = null) => M(`glow:${c}:${k}:${map ? map.uuid : ''}`, () => std({ color: map ? 0x111111 : c, emissive: map ? 0xffffff : c, emissiveMap: map, emissiveIntensity: k, roughness: 0.5 }));

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

  const cyl = (r0, r1, h, mat, x, y, z, seg = 12) => add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z);
  const ball = (r, mat, x, y, z, seg = 12) => add(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), mat, x, y, z);
  // まわした 形。pts は [半径, 高さ] の ならび（下から 上）。
  const lathe = (pts, mat, x, y, z, seg = 12) => add(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(0.0005, r), yy)), seg), mat, x, y, z);
  // ろくろで ひいた 脚：足先の たま・くびれ・ふくらみ・上の 四角い 受け。
  const leg = (h, r, mat, x, z) => lathe([[0, 0], [r * 0.5, 0], [r * 0.66, h * 0.03], [r * 0.46, h * 0.1], [r * 0.62, h * 0.14], [r * 0.48, h * 0.18], [r * 0.8, h * 0.5], [r, h * 0.7], [r * 0.66, h * 0.76], [r, h * 0.81], [r, h]], mat, x, 0, z, 10);

  return { root, add, box, soft, cyl, ball, lathe, leg };
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
const drapeMat = (c) => M(`drape:${c}`, () => std({ color: c, map: fabricTex(), roughness: 0.95, side: THREE.DoubleSide }));
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
    const bt = booksTex(), books = M('books', () => std({ color: bt ? 0xffffff : 0xb0523a, map: bt, roughness: 0.8 }));
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
    const metal = brass();
    K.lathe([[0, 0], [0.2, 0], [0.2, 0.02], [0.13, 0.045], [0.035, 0.07], [0.02, 0.11]], metal, 0, 0, 0, 20);
    K.cyl(0.016, 0.016, 1.42, metal, 0, 0.8, 0, 8);
    K.ball(0.03, metal, 0, 1.5, 0, 8);
    K.ball(0.07, glow(0xfff3d0, 1), 0, 1.6, 0, 10);
    const shade = M(`shade:${c}`, () => std({ color: c, emissive: c, emissiveIntensity: 0.85, roughness: 0.9, side: THREE.DoubleSide }));
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
    const pillow = K.soft(0.34, 0.34, 0.12, 0.055, cloth(0xe6b655), -inner / 2 + 0.2, 0.69, 0.02);
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
    const W = wood(0xa97c50), D = wood(0x7a5636), white = cloth(0xf6f1e7), F = cloth(c);
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
    K.soft(fw - 0.04, 0.05, 0.5, 0.024, cloth(0x7fa9c4), 0, 0.5, dz + dl / 2 - 0.36);
  },

  // ピアノ：つやの ある アップライト。けんばん・ふた・ふめん台・ペダル。
  piano(K, c, w, d) {
    const P = flat(c, 0.16), z = -(d / 2 - 0.23), bw = w - 0.14;
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
    K.soft(0.26, 0.26, 0.1, 0.045, cloth(0xfff4d6), 0.08, 0.66, -0.02).rotation.set(Math.PI / 2 - 0.35, 0, -0.3);
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
    const shade = M(`drum:${c}`, () => std({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.9, side: THREE.DoubleSide }));
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
    const W = flat(c, 0.45), P = cloth(0xf59ab5), z = -(d / 2 - 0.26), dw = w - 0.16;
    K.soft(dw, 0.05, 0.44, 0.018, W, 0, 0.74, z);
    for (const s of [-1, 1]) {
      K.box(0.5, 0.42, 0.4, W, s * (dw / 2 - 0.27), 0.5, z, { plain: true });
      for (const y of [0.4, 0.6]) { K.box(0.44, 0.17, 0.015, flat(tint(c, 0.94), 0.5), s * (dw / 2 - 0.27), y, z + 0.205, { plain: true }); K.ball(0.02, brass(), s * (dw / 2 - 0.27), y, z + 0.22, 8); }
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
    const F = cloth(c), L = cloth(tint(c, 1.32)), dark = flat(0x2a1c14, 0.4), S = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const b = K.ball(r, m, x, y, z, 14); b.scale.set(sx, sy, sz); return b; };
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
    const R = cloth(0xf59ab5);
    for (const s of [-1, 1]) { const b = S(0.06, R, s * 0.07, 0.44, 0.17, 1.2, 0.8, 0.5); b.rotation.z = s * 0.3; }
    S(0.03, R, 0, 0.44, 0.18);
  },

  // おもちゃばこ：ふたの あいた はこ。ほしの かざり・ボール・つみき・あひる。
  toybox(K, c, w, d) {
    const P = flat(c, 0.6), W = wood(0xd9b98a), bw = w - 0.2, bd = 0.62, z = -(d / 2 - bd / 2 - 0.12), hh = 0.5;
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
    const p = K.soft(0.26, 0.26, 0.09, 0.04, cloth(0x8ff0c8), -0.16, 0.6, -0.14); p.rotation.set(Math.PI / 2 - 0.6, 0.5, 0.2);
  },

  // クッション：ゆかの まるい クッションに ハートと ほし。
  cushion(K, c) {
    K.lathe([[0, 0], [0.3, 0], [0.4, 0.05], [0.42, 0.1], [0.4, 0.15], [0.3, 0.2], [0, 0.2]], cloth(0xfff4d6), 0, 0, 0, 24);
    K.ball(0.03, cloth(0xffb066), 0, 0.2, 0, 8).scale.y = 0.5;
    const h = puff(K, heartShape(0.24), 0.07, 0.055, cloth(c), -0.06, 0.38, -0.1); h.rotation.set(-0.5, 0.25, 0.1);
    const s = puff(K, starShape(0.2, 0.11), 0.06, 0.045, cloth(0xf7d774), 0.14, 0.27, 0.14); s.rotation.set(-1.2, 0, 0.3);
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
    const W = flat(0xfffaf3, 0.5), z = -(d / 2 - 0.12), bw = w - 0.12, y0 = 0.92, wh = 1.16;
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
      K.add(new THREE.TorusGeometry(0.075, 0.016, 6, 14), cloth(0xffb066), s * (bw / 2 - 0.13), ry - ch * 0.58, cz).rotation.x = Math.PI / 2;
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
    const W = flat(c, 0.45), tiltG = new THREE.Group(); tiltG.position.set(0, 0.16, -0.02); tiltG.rotation.x = -0.1; K.root.add(tiltG);
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
    const W = flat(0xfffaf3, 0.45), white = cloth(0xfbf7ef), F = cloth(c), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.05, pz = fd / 2 - 0.05, H = 2.24;
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
    puff(K, heartShape(0.13), 0.07, 0.05, cloth(0xf59ab5), 0, 0.78, -pz + 0.62).rotation.x = -0.9;
    const S = sheer(0xfffdf8, 0.5), dh = H - 0.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = ribbon(0.62, dh, { waves: 4, amp: 0.035, pinch: 0.7, pinchAt: 0.5, anchor: sz, segs: 20 }); g.rotateY(-Math.PI / 2);
      K.add(g, S, sx * (px - 0.012), H - 0.03 - dh / 2, sz * (pz - 0.33));
      K.add(new THREE.TorusGeometry(0.06, 0.014, 6, 12), cloth(0xf59ab5), sx * (px - 0.012), H - 0.03 - dh * 0.5, sz * (pz - 0.07)).rotation.x = Math.PI / 2;
    }
    const V = sheer(tint(c, 1.0), 0.7);
    for (const sz of [-1, 1]) K.add(ribbon(fw - 0.1, 0.26, { waves: 8, amp: 0.025, scallop: 0.5, scallops: 4 }), V, 0, H - 0.15, sz * (pz - 0.012));
    for (const sx of [-1, 1]) { const g = ribbon(fd - 0.1, 0.26, { waves: 12, amp: 0.025, scallop: 0.5, scallops: 6 }); g.rotateY(Math.PI / 2); K.add(g, V, sx * (px - 0.012), H - 0.15, 0); }
  },

  // プリンセス ベッド：ピンク。ハートの ヘッドボード・金の かんむり・フリルの すそ。
  bed_princess(K, c, w, d) {
    const W = flat(0xfffaf3, 0.45), white = cloth(0xfffaf5), F = cloth(c), deep = cloth(tint(c, 0.86)), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.05, pz = fd / 2 - 0.05;
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
    K.add(new THREE.CylinderGeometry(0.11, 0.1, 0.07, 12, 1, true), M('crown', () => std({ color: 0xd4a84a, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide })), 0, 1.6, -pz + 0.03);
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
    const V = cloth(c), V2 = cloth(tint(c, 1.25)), G = brass(), cream = cloth(0xf6efdf), gold = cloth(0xcfa64a), fw = w - 0.14, back = -d / 2 + 0.06, bl = 2.32, bz = back + 0.2 + bl / 2;
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
    K.soft(mw + 0.1, 0.06, 0.34, 0.028, cloth(0xfffaf3), 0, top + 0.125, dz - dl / 2 + 0.16);
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
    const W = wood(0xc79a63), D = wood(0x9a7245), white = cloth(0xf6f1e7), F = cloth(c), F2 = cloth(0xffb066), fw = w - 0.12, fd = d - 0.12, px = fw / 2 - 0.045, pz = fd / 2 - 0.045;
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
};

export const REAL_FURNITURE = Object.keys(BUILD);

const templates = new Map();
// その かぐの 見本（まとめた 形）。1 しゅるい＋色に 1 つ。
function template(item) {
  const shape = item?.shape;
  const make = BUILD[shape];
  if (!make) return null;
  const c = Number(item.color) || 0xb0a08a, w = Number(item.w) || 1, d = Number(item.d) || 1;
  const key = `${shape}:${c}:${w}:${d}`;
  if (!templates.has(key)) {
    const K = kit();
    make(K, c, w, d);
    templates.set(key, bake(K.root));
  }
  return templates.get(key);
}

// かぐ 1 つ。まんなかが 原点・底が y = 0・うしろが −z、大きさは item.w × item.d マス。
// 形と 材質は 見本と 同じ もの（みんなで つかう）。知らない 形は null。
export function furnitureModel(item) {
  const t = template(item);
  if (!t) return null;
  const g = new THREE.Group();
  for (const m of t.children) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = m.castShadow; c.receiveShadow = true; g.add(c); }
  return g;
}

// かぐ屋の カードの 絵（data URL）。小さな レンダラーで 1 回だけ 描いて おぼえる（food-real.js の renderShots）。
// かけなければ null ＝ カードは 前の 色の 四角の まま。
let shots = null;
export function furnitureShots(list) {
  if (shots) return shots;
  shots = import('./food-real.js').then(({ renderShots, fitUnit }) => {
    const byId = new Map((list || []).map((f) => [f.id, f]));
    return renderShots([...byId.keys()], (id) => {
      const item = byId.get(id), inner = furnitureModel(item);
      if (!inner) return null;
      // ひらたい もの（ラグ）は 少し おこして、上から 見た もようが わかる ように。
      if ((Number(item.h) || 1) < 0.2) { const lift = new THREE.Group(); inner.rotation.x = 0.55; lift.add(inner); const u = fitUnit(lift); u.position.y = 0.12; return u; }
      // 絵の 中の うつりこみは シーンの 環境から もらう（材質は みんなで つかうので、絵の ための 環境を 書きこまない）。
      const u = fitUnit(inner);
      // ひくくて よこに 長い もの（ソファ・ベッド）は 少し 大きく して、絵の まんなかへ 上げる。
      const hh = new THREE.Box3().setFromObject(u).getSize(new THREE.Vector3()).y;
      const k = hh < 0.6 ? 1.2 : 0.96;
      u.scale.setScalar(k);
      u.position.y = Math.max(0, (0.88 - hh * k) / 2) * 0.85;
      return u;
    }, { size: 256, look: 0.44, turn: -0.62 });
  }).catch(() => null);
  return shots;
}
