// かぐの リアルな 3D モデル（かぐ屋の 11 しゅるい）。マイルーム（room-world.js）と かぐ屋の カードの 絵が 使う。
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
