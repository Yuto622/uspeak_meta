// だいくさん（大工）と 増築 — メインの島の じぶんの いえの となり（2026-11）。
//
// 「自分の家の 隣に 大工さんが いて、話しかけると 増築を たのめる」。牧場ゲームの 大工屋の メニューを 手本に：
// 建物の 絵・名前・値段・工事の 日数・下に 説明。この ゲームに 材料は 無いので **コイン だけ**、工事は **ゲームの 中の 1 日**
// （世界の 時計の ひとまわり＝705 秒）。
//
// ・**きめるのは 部屋（サーバー）**：`build:order {tier}` → コインを 引いて `{tier, doneAt}` を おぼえる → `build:state`。
//   できあがりも 部屋が きめる（時計は 回さない＝この 子の へやを さわる ときに 見る）。ここは 見せるのと たのむ だけ。
// ・**道は 1 つ**：まちづくり島の ふどうさん（town.js）も この メニューを ひらく。値段も 結果も 同じ。
// ・へやの 大きさの 表は `town.json` の `rooms`（サーバーが 読んで `build:state` で 送る）。ここに 数字は 書かない。
// ・家の 外がわ（そでの へや・とう・ベランダ・3 がい）は **じぶんの 画面だけ**：ほかの 子は そこに じぶんの 家を 見る。
//
// 2 つの 部品：
//   buildCarpenterYard(…)  main-world.js が 島を 建てる ときに 呼ぶ（大工さん・作業台・材木・増築の 形・足場）。
//   createCarpenter(…)     net-client.js が 作る（そばの ボタン・メニュー・部屋との やりとり）。
import * as THREE from './three.module.js';
import { chibiMaker, chibiBody, CHIBI_ARM } from './island-cast.js';
import { createHouseBatch } from './real-house.js';
import { isJa, onLangChange } from './i18n.js';

export const CARPENTER = { id: 'carpenter_ken', name: { en: 'Carpenter Ken', ja: 'だいくの ケンさん' } };
// 大工さんの 立つ 場所（家の まんなか から。+x ＝東、+z ＝道がわ）。戸口（家の 前の まんなか）から 8 ほど 東。
const STAND = { x: 8.4, z: 4.5 };
const REACH = 3.6;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (en, ja) => (isJa() ? ja : en);
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// 段ごとの 説明（名前・大きさ・値段は 部屋から 来る）。英語は 学ぶ ことば なので いつも 両方 出す。
const ABOUT = {
  small: { en: 'The little house you start in.', ja: 'はじめの 小さな いえ。' },
  medium: { en: 'A new room on the side. Space for a sofa and a big bed.', ja: 'よこに へやを たして ひろく する。ソファや 大きな ベッドも おけるよ。' },
  large: { en: 'The side room gets a second floor. Lots of space for furniture.', ja: 'よこの へやが 2 かいだてに なる。かぐを たくさん ならべられるよ。' },
  grand: { en: 'A tall tower behind the house. You can see it from far away.', ja: 'うしろに 高い とうを たてる。とおくからも 見えるよ。' },
  villa: { en: 'A veranda in front and windows in the roof. A house for a party!', ja: 'まえに ベランダ、やねに まど。パーティーも できる いえ。' },
  mansion: { en: 'A third floor and a flag. The biggest house on the island!', ja: '3 がいと はたが つく。しまで いちばん 大きな いえ！' },
};

// ---- 形（箱と 三角の やね）を 1 つに まとめる ------------------------------------------------

const BEAM = 0x6b5138, STONE = 0xa39a88, TRIM = 0xf7f1e1, BRICK = 0xa5654c, GOLD = 0xf2c14e, WOOD = 0xc9a26b, TARP = 0x3f7fd0;
const tmpColor = new THREE.Color();
const shadeHex = (hex, k) => { tmpColor.set(hex); const h = {}; tmpColor.getHSL(h); tmpColor.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + k))); return tmpColor.getHex(); };
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  tmpColor.set(hex);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) tmpColor.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
function boxGeo(x, y, z, w, h, d, color, rot = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(x, y, z);
  return paint(g, color);
}
// 三角の 柱（切妻の かべ）。底の まんなかが (x, y, z)・はば w・高さ h・長さ len。axis 'z' ＝むねが z に そう。
function prismGeo(x, y, z, w, h, len, color, axis = 'z') {
  const a = w / 2, l = len / 2;
  const A0 = [-a, 0, -l], B0 = [a, 0, -l], C0 = [0, h, -l], A1 = [-a, 0, l], B1 = [a, 0, l], C1 = [0, h, l];
  const tris = [A1, B1, C1, B0, A0, C0, A0, A1, C1, A0, C1, C0, B1, B0, C0, B1, C0, C1, A0, B0, B1, A0, B1, A1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  g.computeVertexNormals();
  if (axis === 'x') g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}
function pyramidGeo(x, y, z, side, h, color) {
  const g = new THREE.ConeGeometry(side / Math.SQRT2, h, 4);
  g.rotateY(Math.PI / 4); g.translate(x, y + h / 2, z);
  return paint(g, color);
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// まど 1 まい（わく・ガラス・さん・まどだい）。face：'f'＝前（+z）・'b'＝うしろ・'e'＝東（+x）・'w'＝西。
function windowAt(S, G, x, y, z, face, size = 1.1) {
  const side = face === 'e' || face === 'w', sign = face === 'f' || face === 'e' ? 1 : -1;
  const put = (list, off, w, h, t, color, dy = 0) => {
    if (side) list.push(boxGeo(x + sign * off, y + dy, z, t, h, w, color));
    else list.push(boxGeo(x, y + dy, z + sign * off, w, h, t, color));
  };
  put(S, 0.04, size + 0.24, size + 0.24, 0.12, BEAM);
  put(G, 0.09, size, size, 0.06, 0xffffff);
  put(S, 0.13, size + 0.02, 0.07, 0.04, TRIM); put(S, 0.13, 0.07, size + 0.02, 0.04, TRIM);
  put(S, 0.16, size + 0.4, 0.12, 0.3, BEAM, -size / 2 - 0.16);
}

// 増築の 形。家の まんなかが 原点・前（戸口）が +z。もとの 家は 7 × 6（かべの 上 4.4・むね 6.56）と して 作って ある。
// 返すもの：solid（かべ・やね）・glass（まど）・blocks（歩けない 場所。家の まんなか からの x, z と 半分の はば）。
export function extensionParts(tier, wall, roof) {
  const S = [], G = [], blocks = [];
  const dark = shadeHex(wall, -0.2), ridge = shadeHex(roof, -0.12);
  if (tier >= 2 && tier < 3) {
    // 2：東に 1 かいの へや（かたながれの やね）。
    const cx = 4.9, cz = 1.55;
    S.push(boxGeo(cx, 0.35, cz, 3.0, 0.7, 3.1, STONE));
    S.push(boxGeo(cx, 1.9, cz, 2.8, 2.4, 2.9, wall));
    S.push(boxGeo(cx - 0.6, 3.35, cz, 1.6, 0.6, 2.9, wall));
    S.push(boxGeo(cx, 1.15, cz, 2.86, 0.9, 2.96, dark));
    for (const sz of [-1.45, 1.45]) S.push(boxGeo(cx + 1.4, 1.9, cz + sz, 0.3, 2.4, 0.3, BEAM));
    S.push(boxGeo(cx, 3.05, cz, 2.96, 0.2, 3.06, BEAM));
    S.push(boxGeo(cx + 0.1, 3.62, cz, 3.6, 0.2, 3.7, roof, [0, 0, -0.3]));
    S.push(boxGeo(cx + 1.78, 3.1, cz, 0.16, 0.22, 3.8, ridge, [0, 0, -0.3]));
    windowAt(S, G, cx, 2.15, cz + 1.45, 'f');
    windowAt(S, G, cx + 1.4, 2.15, cz, 'e');
    blocks.push({ x: cx, z: cz, w: 1.5, d: 1.55 });
  }
  if (tier >= 3) {
    // 3：東の へやが 2 かいだてに（前を むいた 切妻）。
    const cx = 5.2, cz = 1.7, w = 3.4, d = 3.8, top = 4.6, rise = 1.6, over = 0.45;
    S.push(boxGeo(cx, 0.35, cz, w + 0.3, 0.7, d + 0.3, STONE));
    S.push(boxGeo(cx, 2.65, cz, w, 3.9, d, wall));
    S.push(boxGeo(cx, 1.15, cz, w + 0.06, 0.9, d + 0.06, dark));
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) S.push(boxGeo(cx + sx, 2.65, cz + sz, 0.32, 3.9, 0.32, BEAM));
    S.push(boxGeo(cx, 2.86, cz, w + 0.14, 0.18, d + 0.14, BEAM));
    S.push(boxGeo(cx, top - 0.1, cz, w + 0.2, 0.24, d + 0.2, BEAM));
    S.push(prismGeo(cx, top, cz, w, rise, d, wall, 'z'));
    const ang = Math.atan2(rise, w / 2), run = w / 2 + over, len = run / Math.cos(ang);
    for (const s of [-1, 1]) S.push(boxGeo(cx + s * (run / 2), top + rise - (run / 2) * Math.tan(ang) + 0.1, cz, len, 0.2, d + 0.9, roof, [0, 0, -s * ang]));
    S.push(boxGeo(cx, top + rise + 0.16, cz, 0.42, 0.2, d + 1.0, ridge));
    for (const y of [2.0, 3.85]) { windowAt(S, G, cx, y, cz + d / 2, 'f', 1.0); windowAt(S, G, cx + w / 2, y, cz, 'e', 1.0); }
    G.push(boxGeo(cx, top + 0.62, cz + d / 2 + 0.03, 0.6, 0.6, 0.06, 0xffffff));
    S.push(boxGeo(cx, top + 0.62, cz + d / 2 + 0.05, 0.72, 0.1, 0.06, BEAM)); S.push(boxGeo(cx, top + 0.62, cz + d / 2 + 0.05, 0.1, 0.72, 0.06, BEAM));
    blocks.push({ x: cx, z: cz, w: w / 2 + 0.15, d: d / 2 + 0.15 });
  }
  if (tier >= 4) {
    // 4：うしろに 高い とう（四角・とんがり やね）。6 では もっと 高く、はたが つく。
    const tx = -2.0, tz = -4.3, side = 2.8, top = tier >= 6 ? 10.6 : 8.8;
    S.push(boxGeo(tx, 0.35, tz, side + 0.4, 0.7, side + 0.4, STONE));
    S.push(boxGeo(tx, (0.7 + top) / 2, tz, side, top - 0.7, side, wall));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.push(boxGeo(tx + sx * side / 2, (0.7 + top) / 2, tz + sz * side / 2, 0.3, top - 0.7, 0.3, BEAM));
    for (const y of [4.4, top - 1.9, top - 0.1]) S.push(boxGeo(tx, y, tz, side + 0.16, 0.2, side + 0.16, BEAM));
    S.push(pyramidGeo(tx, top, tz, side + 1.0, 2.6, roof));
    S.push(boxGeo(tx, top + 2.9, tz, 0.1, 0.9, 0.1, GOLD)); S.push(boxGeo(tx, top + 2.6, tz, 0.3, 0.3, 0.3, GOLD));
    for (const f of ['f', 'b', 'e', 'w']) {
      const ox = f === 'e' ? side / 2 : f === 'w' ? -side / 2 : 0, oz = f === 'f' ? side / 2 : f === 'b' ? -side / 2 : 0;
      windowAt(S, G, tx + ox, top - 1.0, tz + oz, f, 0.9);
      if (f !== 'f') windowAt(S, G, tx + ox, 2.7, tz + oz, f, 0.9);
    }
    if (tier >= 6) {
      S.push(boxGeo(tx, top + 4.0, tz, 0.08, 1.6, 0.08, 0x6f5b3e));
      S.push(boxGeo(tx + 0.55, top + 4.45, tz, 1.0, 0.6, 0.05, 0xe27a2d));
    }
    blocks.push({ x: tx, z: tz, w: side / 2 + 0.2, d: side / 2 + 0.2 });
  }
  if (tier >= 5) {
    // 5：前に ベランダ（白い 柱と ひさし）と、やねの まど 2 つ。戸口の 前（x ±1.4）は あける。
    S.push(boxGeo(0, 3.78, 3.95, 7.5, 0.16, 2.1, roof, [0.26, 0, 0]));
    S.push(boxGeo(0, 3.5, 4.86, 7.5, 0.2, 0.16, TRIM));
    for (const x of [-3.35, -1.65, 1.65, 3.35]) { S.push(boxGeo(x, 1.86, 4.8, 0.22, 3.3, 0.22, TRIM)); S.push(boxGeo(x, 0.3, 4.8, 0.4, 0.2, 0.4, STONE)); }
    for (const s of [-1, 1]) {
      S.push(boxGeo(s * 2.5, 1.0, 4.8, 1.7, 0.1, 0.1, TRIM)); S.push(boxGeo(s * 2.5, 0.5, 4.8, 1.7, 0.08, 0.08, TRIM));
      for (let i = 0; i < 4; i += 1) S.push(boxGeo(s * (1.95 + i * 0.37), 0.72, 4.8, 0.07, 0.56, 0.07, TRIM));
      blocks.push({ x: s * 2.5, z: 4.8, w: 0.85, d: 0.06 });
      // やねの まど（ドーマー）。
      const dx = s * 1.75;
      S.push(boxGeo(dx, 5.3, 1.75, 1.2, 1.1, 1.5, wall));
      S.push(prismGeo(dx, 5.85, 1.75, 1.5, 0.62, 1.8, roof, 'z'));
      S.push(boxGeo(dx, 5.3, 2.52, 1.0, 0.9, 0.08, BEAM)); G.push(boxGeo(dx, 5.3, 2.56, 0.8, 0.7, 0.05, 0xffffff));
      S.push(boxGeo(dx, 5.3, 2.6, 0.06, 0.72, 0.03, TRIM));
    }
  }
  if (tier >= 6) {
    // 6：うしろ半分に 3 がい（もとの やねの 上に 出る）・高い えんとつ・むねの かざり。
    const cz = -1.65, w = 6.4, d = 2.7, y0 = 4.4, top = 7.5, rise = 1.4, over = 0.5;
    S.push(boxGeo(0, (y0 + top) / 2, cz, w, top - y0, d, wall));
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) S.push(boxGeo(sx, (y0 + top) / 2, cz + sz, 0.3, top - y0, 0.3, BEAM));
    S.push(boxGeo(0, top - 0.1, cz, w + 0.2, 0.24, d + 0.2, BEAM));
    S.push(prismGeo(0, top, cz, d, rise, w, wall, 'x'));
    const ang = Math.atan2(rise, d / 2), run = d / 2 + over, len = run / Math.cos(ang);
    for (const s of [-1, 1]) S.push(boxGeo(0, top + rise - (run / 2) * Math.tan(ang) + 0.1, cz + s * (run / 2), w + 1.0, 0.2, len, roof, [s * ang, 0, 0]));
    S.push(boxGeo(0, top + rise + 0.16, cz, w + 1.1, 0.2, 0.42, ridge));
    for (const x of [-2.1, 0, 2.1]) windowAt(S, G, x, 6.95, cz + d / 2, 'f', 0.7);
    for (const s of [-1, 1]) { windowAt(S, G, s * w / 2, 6.3, cz, s > 0 ? 'e' : 'w', 0.9); S.push(boxGeo(s * (w / 2 + 0.5), top + rise + 0.5, cz, 0.14, 0.6, 0.14, GOLD)); }
    S.push(boxGeo(2.5, 8.9, cz - 0.6, 0.85, 2.4, 0.85, BRICK)); S.push(boxGeo(2.5, 10.2, cz - 0.6, 1.08, 0.22, 1.08, shadeHex(BRICK, -0.12)));
  }
  return { solid: S, glass: G, blocks };
}

// 工事中の 足場（家の 前の 東がわ）。戸口の 前は あける。
function scaffoldParts() {
  const S = [];
  const POLE = 0x8c8f93, xs = [2.0, 4.6, 7.2], zs = [4.0, 5.2];
  for (const x of xs) for (const z of zs) S.push(boxGeo(x, 3.0, z, 0.14, 6.0, 0.14, POLE));
  for (const y of [2.2, 4.3]) {
    S.push(boxGeo(4.6, y, 4.6, 5.5, 0.1, 1.3, WOOD));
    for (const z of zs) S.push(boxGeo(4.6, y + 0.9, z, 5.3, 0.1, 0.1, POLE));
  }
  for (const z of zs) S.push(boxGeo(4.6, 5.9, z, 5.3, 0.1, 0.1, POLE));
  for (const x of xs) S.push(boxGeo(x, 5.9, 4.6, 0.1, 0.1, 1.3, POLE));
  for (const [x, a] of [[3.3, 0.7], [5.9, -0.7]]) S.push(boxGeo(x, 1.1, 5.2, 3.3, 0.08, 0.08, POLE, [0, 0, a]));
  // 青い シート（東の はしと、やねの 上）。
  S.push(boxGeo(7.3, 3.4, 4.6, 0.06, 3.6, 1.3, TARP));
  S.push(boxGeo(1.9, 5.56, 1.5, 2.8, 0.08, 2.6, TARP, [0.62, 0, 0]));
  // 三角コーンと、材木。
  for (const [x, z] of [[1.9, 6.2], [7.4, 6.2]]) { const c = new THREE.ConeGeometry(0.26, 0.7, 10); c.translate(x, 0.55, z); S.push(paint(c, 0xe27a2d)); S.push(boxGeo(x, 0.2, z, 0.6, 0.08, 0.6, 0xe27a2d)); S.push(boxGeo(x, 0.62, z, 0.3, 0.1, 0.3, TRIM)); }
  for (let i = 0; i < 3; i += 1) S.push(boxGeo(4.6, 2.34 + i * 0.13, 4.5 + i * 0.1, 2.6, 0.12, 0.3, i % 2 ? 0xd8b47c : WOOD));
  return S;
}

// ---- 大工さんの すがた ----------------------------------------------------------------------

// ヘルメット・オーバーオール・道具の ベルト・手に かなづち。`face`＝npc-talk の かおの 絵と 同じ 約束（ここでは 使わない）。
export function carpenterModel(g = new THREE.Group()) {
  const add = chibiMaker(g);
  const DENIM = 0x3f6fa8;
  const c = { skin: 0xe8c39a, hair: 0x4a3426, style: 'short', top: 0xe27a2d, pants: DENIM, accent: 0xffc928, shoe: 0x5b3a22, eye: 'smile' };
  const limbs = chibiBody(add, c, g);
  g.userData.limbs = limbs;
  // オーバーオール：むねあて・かたひも・ボタン。
  add('B', DENIM, [0, 0.9, 0.31], [0.56, 0.5, 0.14]);
  for (const s of [-1, 1]) { add('B', DENIM, [s * 0.22, 1.2, 0.26], [0.1, 0.34, 0.1], [0.2, 0, s * -0.12]); add('S', 0xffc928, [s * 0.2, 1.08, 0.39], [0.08, 0.08, 0.05]); }
  add('C', DENIM, [0, 0.6, 0], [0.86, 0.3, 0.72]);
  // 道具の ベルトと ポーチ。
  add('C', 0x7a5230, [0, 0.62, 0], [0.92, 0.12, 0.78]);
  add('B', 0x8f6238, [-0.34, 0.5, 0.24], [0.24, 0.26, 0.16]);
  add('B', 0xd9b45a, [0, 0.62, 0.39], [0.14, 0.12, 0.04]);
  add('B', 0xc9c9c9, [-0.34, 0.66, 0.26], [0.05, 0.22, 0.05]);
  // ヘルメット（きいろ）。
  add('D', 0xffc928, [0, 2.06, -0.02], [1.4, 0.92, 1.34]);
  add('C', 0xffc928, [0, 2.08, 0.1], [1.56, 0.07, 1.52]);
  add('B', 0xf2b01e, [0, 2.5, -0.02], [0.2, 0.1, 1.0]);
  // ひげ（口の 上）。
  add('S', c.hair, [0, 1.5, 0.56], [0.36, 0.1, 0.1]);
  // かなづち（右手）。
  const arm = limbs[3];
  if (arm) {
    const hx = 0.63 - CHIBI_ARM.x, hy = 0.74 - CHIBI_ARM.y;
    add('B', 0x9a6b3c, [hx, hy + 0.12, 0.22], [0.07, 0.07, 0.6], null, 0, arm);
    add('B', 0x8c8f93, [hx, hy + 0.12, 0.52], [0.16, 0.3, 0.16], null, 0, arm);
    arm.rotation.x = -0.5;
  }
  return g;
}

// ---- 島に 建てる（main-world.js から）---------------------------------------------------------

// 外がわの いま（部屋から 来た 段と 工事）。島が まだ 建って いなくても おぼえて おく。
const want = { tier: 1, building: false };
let yard = null;

// `def`＝main_island.json の my_home、`hz`＝家の まんなかの z。D・sprite・obstacles・keep は island-kit の もの。
export function buildCarpenterYard({ root, def, hz, D, sprite, obstacles, keep }) {
  const wall = Number(def.color), roof = Number(def.roof);
  const ax = def.x + STAND.x, az = hz + STAND.z;

  // 大工さん。
  const npc = carpenterModel();
  npc.position.set(ax, 0, az);
  root.add(npc);
  const label = sprite({ en: `🔨 ${CARPENTER.name.en}`, ja: `🔨 ${CARPENTER.name.ja}` }, ax, 3.45, az, { width: 5.4, size: 38, depthTest: false });
  obstacles.push({ x: ax, z: az, w: 0.35, d: 0.35 });

  // 作業台（のこぎり台）と 材木。D ＝島の まとめて 描く 箱。
  const bx = ax + 1.6, bz = az - 1.7;
  D(bx, 1.0, bz, 1.9, 0.14, 0.9, 0xc9a26b);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.35, 0.35]) D(bx + sx, 0.47, bz + sz, 0.12, 0.94, 0.12, 0x8a6a45);
  D(bx, 0.4, bz, 1.7, 0.08, 0.08, 0x8a6a45);
  D(bx - 0.2, 1.14, bz, 1.5, 0.14, 0.22, 0xe0c08a);                       // 切りかけの 板
  D(bx + 0.5, 1.12, bz + 0.1, 0.5, 0.04, 0.16, 0xb9bcc0); D(bx + 0.82, 1.14, bz + 0.1, 0.18, 0.1, 0.14, 0x9a6b3c);   // のこぎり
  D(bx - 0.7, 1.19, bz - 0.25, 0.36, 0.24, 0.24, 0xd9483b);               // 道具ばこ
  obstacles.push({ x: bx, z: bz, w: 1.0, d: 0.5 });
  const tx = ax + 0.2, tz = az - 3.5;
  for (let row = 0; row < 3; row += 1) for (let i = 0; i < 3 - row; i += 1) D(tx, 0.19 + row * 0.3, tz - 0.34 + i * 0.34 + row * 0.17, 2.6, 0.26, 0.3, (i + row) % 2 ? 0xd8b47c : 0xc9a26b);
  for (const sx of [-0.9, 0.9]) D(tx + sx, 0.04, tz, 0.16, 0.08, 1.2, 0x8a6a45);
  obstacles.push({ x: tx, z: tz, w: 1.35, d: 0.6 });
  keep(ax + 0.6, az - 1.6, 2.6, 3.0);

  // 増築の 形（段ごとに 作りなおす）と 足場。家の まんなかを 原点に。
  const home = new THREE.Group();
  home.position.set(def.x, 0, hz);
  root.add(home);
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x86aecb, roughness: 0.12, metalness: 0.55, emissive: new THREE.Color(0xffcf86), emissiveIntensity: 0 });
  let wings = null, night = 0;
  // 歩けない 場所：島の obstacles は 建った ときの 配列を ずっと 使うので、はじめに 入れて おいて 大きさだけ かえる。
  const blocks = Array.from({ length: 6 }, () => { const o = { x: 1e6, z: 1e6, w: 0, d: 0 }; obstacles.push(o); return o; });
  const scaffoldBlock = { x: 1e6, z: 1e6, w: 0, d: 0 }; obstacles.push(scaffoldBlock);
  const scaffold = new THREE.Mesh(merge(scaffoldParts()), solidMat);
  scaffold.castShadow = true; scaffold.visible = false; scaffold.frustumCulled = false;
  home.add(scaffold);
  const sign = sprite({ en: '🚧 Under construction', ja: '🚧 こうじちゅう' }, def.x + 4.6, 6.9, hz + 4.6, { width: 7, size: 40, background: '#e27a2d', color: '#fff4d6', depthTest: false });
  sign.visible = false;

  function setTier(tier) {
    const t = Math.max(1, Math.floor(Number(tier)) || 1);
    if (wings && wings.userData.tier === t) return;
    if (wings) { home.remove(wings); wings.traverse((o) => o.geometry?.dispose()); wings = null; }
    const parts = extensionParts(t, wall, roof);
    wings = new THREE.Group(); wings.userData.tier = t;
    if (parts.solid.length) { const m = new THREE.Mesh(merge(parts.solid), solidMat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; wings.add(m); }
    if (parts.glass.length) { const m = new THREE.Mesh(merge(parts.glass), glassMat); m.frustumCulled = false; wings.add(m); }
    home.add(wings);
    blocks.forEach((o, i) => { const b = parts.blocks[i]; if (b) Object.assign(o, { x: def.x + b.x, z: hz + b.z, w: b.w, d: b.d }); else Object.assign(o, { x: 1e6, z: 1e6, w: 0, d: 0 }); });
  }
  function setBuilding(on) {
    scaffold.visible = !!on; sign.visible = !!on; sign.userData.wanted = !!on;
    if (on) Object.assign(scaffoldBlock, { x: def.x + 4.6, z: hz + 4.6, w: 2.8, d: 0.75 }); else Object.assign(scaffoldBlock, { x: 1e6, z: 1e6, w: 0, d: 0 });
  }
  setTier(want.tier); setBuilding(want.building);

  yard = {
    x: ax, z: az, reach: REACH, npc, label, home,
    setTier, setBuilding,
    get tier() { return wings?.userData.tier || 1; },
    get building() { return scaffold.visible; },
    // 島の 中の 座標 (lx, lz) が 増築や 足場の 中か（できあがった とき 中に 立って いたら 出す）。
    inside: (lx, lz) => [...blocks, scaffoldBlock].some((o) => o.w > 0 && Math.abs(lx - o.x) < o.w + 0.4 && Math.abs(lz - o.z) < o.d + 0.4),
    front: { x: ax - 1.6, z: az + 1.4 },
    setNight(n) { night = Math.max(0, Math.min(1, n || 0)); glassMat.emissiveIntensity = 1.1 * night; },
    // 工事中は かなづちを ふる。ふだんは ゆっくり ゆれる。
    update(t) {
      const arm = npc.userData.limbs?.[3];
      if (arm) arm.rotation.x = scaffold.visible ? -1.0 + Math.sin(t * 7) * 0.55 : -0.5 + Math.sin(t * 1.6) * 0.08;
      npc.rotation.y = Math.sin(t * 0.5) * 0.18;
      if (sign.userData.wanted !== undefined && sign.visible !== sign.userData.wanted) sign.visible = sign.userData.wanted;
    },
  };
  return yard;
}

// ---- メニューの 絵（家と 大工さんの かお）--------------------------------------------------

let shotsAsked = null;
function bakeShots(tiers, wall, roof) {
  if (shotsAsked) return shotsAsked;
  shotsAsked = import('./food-real.js').then(async ({ renderShots, fitUnit }) => {
    const junk = [];
    const houses = await renderShots(tiers.map((t) => `t${t}`), (key) => {
      const tier = Number(key.slice(1));
      const g = new THREE.Group();
      const batch = createHouseBatch(); batch.add(0, 0, 7, 6, wall, roof); batch.flush(g);
      const parts = extensionParts(tier, wall, roof);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
      if (parts.solid.length) g.add(new THREE.Mesh(merge(parts.solid), mat));
      if (parts.glass.length) g.add(new THREE.Mesh(merge(parts.glass), new THREE.MeshStandardMaterial({ color: 0x86aecb, roughness: 0.12, metalness: 0.55 })));
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; junk.push(o.geometry); } });
      const out = fitUnit(g);
      out.traverse = () => {};            // real-house の 材質は 島の 家と 同じ もの：renderShots に 捨てさせない（形は 下で 捨てる）
      return out;
    }, { size: 256, look: 0.42, turn: -0.62 });
    for (const geo of junk) geo.dispose();
    const face = await renderShots(['ken'], () => {
      const body = carpenterModel();
      const k = 0.76, outer = new THREE.Group(), tilt = new THREE.Group();
      body.scale.multiplyScalar(k); body.position.y = -1.7 * k;
      tilt.add(body); tilt.rotation.x = -0.2; tilt.position.y = 0.6; outer.add(tilt);
      // 体の 形（island-cast の G）は みんなで 使う：材質だけ 捨てさせる（npc-talk.js の portraitModel と 同じ）。
      outer.traverse = (fn) => { const seen = new Set(); THREE.Object3D.prototype.traverse.call(outer, (o) => { for (const m of [].concat(o.material || [])) seen.add(m); }); for (const m of seen) fn({ material: m }); };
      return outer;
    }, { size: 256, look: 0.52, turn: -0.2 });
    return { ...(houses || {}), ...(face || {}) };
  }).catch(() => ({}));
  return shotsAsked;
}

// ---- 画面と 部屋との やりとり（net-client.js から）------------------------------------------

export function createCarpenter({ player, rpg, send, toast = () => {}, speak = null, isOnline = () => false, getCoins = () => 0, onGrown = null }) {
  const state = {
    tier: 1, rooms: [], build: null, dayMs: 705000, coins: 0, got: 0,       // got＝build:state を 受けた とき（performance.now）
    sel: 0, confirm: false, pending: false, note: '', line: null, said: '', at: 'home', shots: {}, near: false, justDone: false,
  };
  let peekTimer = 0;

  const dialog = document.createElement('dialog');
  dialog.id = 'carpenter-dialog';
  dialog.setAttribute('aria-labelledby', 'cp-title');
  dialog.innerHTML = `<div class="cp-head">
      <div class="cp-face" aria-hidden="true"></div>
      <div class="cp-say"><span class="cp-who" translate="no"></span><p class="cp-en" translate="no"></p><p class="cp-ja"></p></div>
      <button type="button" class="cp-voice" aria-label="Listen again">🔊</button>
      <div class="cp-top"><h2 id="cp-title"></h2><span class="cp-coins">◈ <b>0</b></span></div>
      <button type="button" class="cp-close" aria-label="とじる">×</button>
    </div>
    <div class="cp-body"><ul class="cp-list" role="listbox"></ul><section class="cp-detail" aria-live="polite"></section></div>`;
  const talk = document.createElement('button');
  talk.type = 'button'; talk.id = 'carpenter-talk'; talk.hidden = true;
  document.body.append(dialog, talk);
  const $ = (s) => dialog.querySelector(s);
  const close = () => { try { dialog.close(); } catch { /* もう とじて いる */ } };
  $('.cp-close').onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { state.confirm = false; state.note = ''; });
  $('.cp-voice').onclick = () => sayLine(true);

  const left = () => (state.build ? Math.max(0, state.build.left - (performance.now() - state.got)) : 0);
  const next = () => state.rooms.find((r) => r.tier === state.tier + 1) || null;
  const roomOf = (tier) => state.rooms.find((r) => r.tier === tier) || null;

  // 大工さんの ひとこと（英語が 主役・日本語は 小さく）。
  function pickLine() {
    if (state.line?.sticky) return state.line;
    if (state.build) return { en: `I'm building it now! ${clock(left())} to go.`, ja: `いま つくって いるよ！ あと ${clock(left())}。`, key: 'building' };
    if (state.justDone) return { en: "It's finished! Go and look inside.", ja: 'できたよ！ 中を 見て おいで。', key: 'done' };
    if (!next()) return { en: 'Your house is the biggest on the island!', ja: 'きみの いえは しまで いちばん 大きいよ！', key: 'max' };
    return { en: 'Hello! I can make your house bigger.', ja: 'こんにちは！ いえを 大きく できるよ。', key: 'hello' };
  }
  function sayLine(again = false) {
    const line = pickLine();
    const text = line.key === 'building' ? "I'm building it now!" : line.en;
    if (!again && state.said === line.key) return;
    state.said = line.key;
    try { speak?.(text, { japanese: false }); } catch { /* 声が なくても メニューは 使える */ }
  }

  function rowState(r) {
    if (state.build && state.build.tier === r.tier) return ['building', `${L('Building', 'こうじちゅう')} <b class="cp-left">${clock(left())}</b>`];
    if (r.tier === state.tier) return ['now', L('Your house now', 'いまの いえ')];
    if (r.tier < state.tier) return ['done', L('✓ Built', '✓ できて いる')];
    if (r.tier === state.tier + 1 && !state.build) return ['next', L('Next', 'つぎに できる')];
    return ['later', L('Later', 'まだ')];
  }
  const pic = (tier) => (state.shots[`t${tier}`] ? `<img alt="" src="${state.shots[`t${tier}`]}">` : '<span class="cp-ph">🏠</span>');
  const dayText = () => L('Work: 1 day', 'こうじ：1 にち');

  function paintHead() {
    $('#cp-title').innerHTML = `<span class="cp-t-ja">${L("Carpenter's Shop", 'だいくや')}</span><small translate="no">${isJa() ? "Carpenter's Shop" : 'だいくや'}</small>`;
    $('.cp-who').textContent = CARPENTER.name.en;
    const line = pickLine();
    $('.cp-en').textContent = line.en; $('.cp-ja').textContent = line.ja;
    $('.cp-coins b').textContent = state.coins.toLocaleString('en-US');
    const face = $('.cp-face');
    if (state.shots.ken && !face.firstChild) face.innerHTML = `<img alt="" src="${state.shots.ken}">`;
  }
  function paintList() {
    $('.cp-list').innerHTML = state.rooms.map((r) => {
      const [kind, text] = rowState(r);
      return `<li><button type="button" role="option" class="cp-row cp-${kind}${r.tier === state.sel ? ' on' : ''}" data-tier="${r.tier}" aria-selected="${r.tier === state.sel}">
        <span class="cp-pic">${pic(r.tier)}</span>
        <span class="cp-name"><b>${esc(r.name)}</b><i translate="no">${esc(r.en)}</i></span>
        <span class="cp-cost">${r.price > 0 ? `<b>◈ ${r.price.toLocaleString('en-US')}</b><small>${dayText()}</small>` : `<small>${L('Free', 'はじめから')}</small>`}</span>
        <span class="cp-state">${text}</span>
      </button></li>`;
    }).join('');
    for (const b of dialog.querySelectorAll('.cp-row')) b.onclick = () => { state.sel = Number(b.dataset.tier); state.confirm = false; state.note = ''; paintList(); paintDetail(); };
  }
  function paintDetail() {
    const r = roomOf(state.sel);
    const box = $('.cp-detail');
    if (!r) { box.innerHTML = `<p class="cp-note">${L('Loading…', 'よみこみ中…')}</p>`; return; }
    const about = ABOUT[r.id] || { en: '', ja: '' };
    const [kind] = rowState(r);
    const short = Math.max(0, r.price - state.coins);
    let act = '';
    if (kind === 'next') {
      if (state.confirm) {
        act = `<p class="cp-ask">${L(`Order the ${esc(r.en)} for ◈ ${r.price.toLocaleString('en-US')}?`, `◈ ${r.price.toLocaleString('en-US')} で「${esc(r.name)}」を たのむ？`)}</p>
          <div class="cp-btns"><button type="button" class="cp-yes" ${state.pending ? 'disabled' : ''}>${L('Yes, please!', 'はい、おねがい！')}</button><button type="button" class="cp-no">${L('Not now', 'やめる')}</button></div>`;
      } else if (short > 0) {
        act = `<p class="cp-short">${L(`You need ◈ ${short.toLocaleString('en-US')} more.`, `あと ◈ ${short.toLocaleString('en-US')} たりないよ。`)}</p>
          <div class="cp-btns"><button type="button" class="cp-order" disabled>${L(`Order for ◈ ${r.price.toLocaleString('en-US')}`, `◈ ${r.price.toLocaleString('en-US')} で たのむ`)}</button></div>`;
      } else {
        act = `<div class="cp-btns"><button type="button" class="cp-order">${L(`Order for ◈ ${r.price.toLocaleString('en-US')}`, `◈ ${r.price.toLocaleString('en-US')} で たのむ`)}</button></div>`;
      }
    } else if (kind === 'building') act = `<p class="cp-work">🔨 ${L('Under construction', 'こうじちゅう')}・${L('Time left', 'あと')} <b class="cp-left">${clock(left())}</b></p>`;
    else if (kind === 'now') act = `<p class="cp-work cp-mine">🏠 ${L('This is your house now.', 'いま すんで いる いえだよ。')}</p>`;
    else if (kind === 'done') act = `<p class="cp-work cp-mine">${L('✓ Already built.', '✓ もう できて いるよ。')}</p>`;
    else act = `<p class="cp-work">${state.build ? L('One job at a time. Wait for this one to finish.', 'こうじは 1 つずつ。いまの こうじが おわってからね。') : L('Build the one before it first.', 'ひとつ 前の いえを さきに たのんでね。')}</p>`;
    box.innerHTML = `<div class="cp-big">${pic(r.tier)}</div>
      <div class="cp-info">
        <h3><b>${esc(r.name)}</b> <i translate="no">${esc(r.en)}</i></h3>
        <p class="cp-size">${L(`Floor ${r.grid} × ${r.grid} · up to ${r.props} things`, `ゆか ${r.grid} × ${r.grid} マス・かぐ ${r.props} こまで`)}${r.price > 0 ? ` ・ ${dayText()}` : ''}</p>
        <p class="cp-about"><span translate="no">${esc(about.en)}</span><small>${esc(about.ja)}</small></p>
        ${state.note ? `<p class="cp-flash">${esc(state.note)}</p>` : ''}
        ${act}
        ${kind === 'next' || kind === 'later' ? `<p class="cp-keep">${L('Your furniture stays where it is.', 'いま おいて ある かぐは そのまま のこるよ。')}</p>` : ''}
      </div>`;
    const order = box.querySelector('.cp-order');
    if (order) order.onclick = () => { state.confirm = true; paintDetail(); };
    const no = box.querySelector('.cp-no'); if (no) no.onclick = () => { state.confirm = false; paintDetail(); };
    const yes = box.querySelector('.cp-yes');
    if (yes) yes.onclick = () => {
      if (state.pending) return;
      state.pending = true; paintDetail();
      send('build:order', { tier: r.tier });
      setTimeout(() => { if (state.pending) { state.pending = false; if (dialog.open) paintDetail(); } }, 5000);
    };
  }
  function paint() { paintHead(); paintList(); paintDetail(); }
  // 1 秒ごと：のこり 時間の 数字だけ かえる（画面を 作りなおさない＝おして いる ボタンが 消えない）。
  function tickLeft() {
    const text = clock(left());
    for (const el of dialog.querySelectorAll('.cp-left')) el.textContent = text;
    if (state.build && !state.line?.sticky && dialog.open) { const line = pickLine(); $('.cp-en').textContent = line.en; $('.cp-ja').textContent = line.ja; }
  }

  function loadShots() {
    if (!state.rooms.length) return;
    let wall = 0xf4d9a0, roof = 0xc0503c;
    try { const d = rpg?.main?.data?.spots?.find((s) => s.kind === 'my_home'); if (d) { wall = Number(d.color); roof = Number(d.roof); } } catch { /* 既定の 色で */ }
    bakeShots(state.rooms.map((r) => r.tier), wall, roof).then((shots) => { state.shots = shots || {}; if (dialog.open) paint(); });
  }

  // at：'home'（大工さんの そば）/ 'agent'（まちづくり島の ふどうさん）。
  function open(at = 'home') {
    if (!isOnline()) { toast(L('You can talk to the carpenter when you are in a class.', 'だいくさんとは クラスに はいって いる ときに はなせるよ。')); return false; }
    if (document.querySelector('dialog[open]') || document.body.dataset.npcTalk) return false;
    state.at = at; state.confirm = false; state.note = ''; state.line = null; state.said = '';
    state.sel = state.build ? state.build.tier : (next()?.tier || state.tier);
    paint();
    dialog.showModal();
    sayLine();
    loadShots();
    send('build:peek', {});
    return true;
  }

  function applyYard() {
    want.tier = state.tier; want.building = !!state.build;
    if (!yard) return;
    yard.setTier(state.tier); yard.setBuilding(!!state.build);
    // できあがった とき 増築の 中に 立って いたら、大工さんの 前に 出す（かべの 中に とじこめない）。
    try {
      const m = rpg?.main; if (!m || rpg.state.current !== 'main' || rpg.inRoom) return;
      const o = m.origin(); const lx = player.position.x - o.x, lz = player.position.z - o.z;
      if (yard.inside(lx, lz)) player.position.set(o.x + yard.front.x, player.position.y, o.z + yard.front.z);
    } catch { /* 島が まだ 無い */ }
  }

  function onState(m) {
    if (!m) return;
    const wasBuilding = !!state.build;
    state.tier = Number(m.tier) || 1;
    if (Array.isArray(m.rooms) && m.rooms.length) state.rooms = m.rooms;
    state.build = m.build ? { tier: Number(m.build.tier), left: Math.max(0, Number(m.build.left) || 0) } : null;
    state.dayMs = Number(m.dayMs) || state.dayMs;
    state.coins = Number(m.wallet?.coins ?? m.coins ?? getCoins()) || 0;
    state.got = performance.now();
    state.pending = false;
    clearTimeout(peekTimer);
    // 工事が おわる ころに もう いちど 聞く（部屋は 時計を 回さない＝聞かれた ときに 大きく する）。
    if (state.build) peekTimer = setTimeout(() => send('build:peek', {}), state.build.left + 700);
    if (m.ordered) {
      state.confirm = false; state.justDone = false;
      state.line = { en: 'Thank you! It takes one day.', ja: 'ありがとう！ 1 にち かかるよ。', key: 'thanks', sticky: true };
      state.sel = Number(m.ordered);
      toast(L('🔨 The carpenter has started. It takes one day.', '🔨 だいくさんが こうじを はじめたよ。1 にち かかるよ。'));
      setTimeout(() => { if (state.line?.key === 'thanks') { state.line = null; if (dialog.open) paintHead(); } }, 6000);
    }
    if (m.finished) {
      state.justDone = true; state.line = null;
      const r = roomOf(Number(m.finished));
      toast(L(`🏠 Your house is bigger now! (${r?.en || ''})`, `🏠 いえが ひろく なったよ！（${r?.name || ''}）`));
      try { speak?.('Your house is bigger now!', { japanese: false }); } catch { /* */ }
      try { if (m.room) onGrown?.(m.room); } catch { /* へやの 外なら つぎに 入った ときに 大きい */ }
      if (dialog.open) state.sel = state.tier;
    } else if (wasBuilding && !state.build && !m.ordered) state.justDone = true;
    applyYard();
    if (dialog.open) { if (!roomOf(state.sel)) state.sel = state.tier; paint(); sayLine(); }
    else if (!state.rooms.length) return;
    paintTalk(true);
  }

  function onError(m) {
    state.pending = false;
    const need = Math.max(0, (m?.need || 0) - (m?.coins ?? state.coins));
    const text = {
      'too far': state.at === 'agent' ? L('Come closer to the counter.', 'カウンターの そばで たのんでね。') : L('Come closer to the carpenter.', 'だいくさんの そばで たのんでね。'),
      'not enough coins': L(`You need ◈ ${need} more.`, `あと ◈ ${need} たりないよ。`),
      'already building': L('One job at a time. Wait for this one to finish.', 'こうじは 1 つずつ。いまの こうじが おわってからね。'),
      'biggest already': L('Your house is already the biggest!', 'もう いちばん 大きな いえだよ！'),
      'one step at a time': L('Build the one before it first.', 'ひとつ 前の いえを さきに たのんでね。'),
    }[m?.reason] || L('The carpenter cannot do that now.', 'いまは たのめないよ。');
    state.confirm = false; state.note = text;
    toast(text);
    if (dialog.open) { paintDetail(); send('build:peek', {}); }
  }

  // ---- そばの ボタン（タップ／E）----
  function nearNow() {
    try {
      if (!yard || !isOnline() || rpg?.state?.current !== 'main' || rpg.state.busy || rpg.state.mode === 'flight') return false;
      if (rpg.inRoom || rpg.inPlaza || rpg.insideBuilding || rpg.inside?.active) return false;
      if (document.querySelector('dialog[open]') || document.body.dataset.npcTalk || document.body.dataset.classPause === '1' || document.body.dataset.warp) return false;
      const m = rpg.main; if (!m?.visible) return false;
      const o = m.origin();
      return Math.hypot(player.position.x - o.x - yard.x, player.position.z - o.z - yard.z) <= yard.reach;
    } catch { return false; }
  }
  let talkSig = '';
  function paintTalk(force = false) {
    const near = nearNow();
    state.near = near;
    if (!near) { if (!talk.hidden) { talk.hidden = true; talkSig = ''; } return; }
    const sig = `${isJa()}|${state.build ? clock(left()) : ''}`;
    if (!force && sig === talkSig && !talk.hidden) return;
    talkSig = sig;
    talk.innerHTML = state.build
      ? `🔨 <span>${L('Talk to the carpenter', 'だいくさんと はなす')}</span><small>${L('Building', 'こうじちゅう')} ${clock(left())}</small><kbd>E</kbd>`
      : `🔨 <span>${L('Talk to the carpenter', 'だいくさんと はなす')}</span><kbd>E</kbd>`;
    talk.hidden = false;
  }
  talk.onclick = () => { if (state.near) open('home'); };
  addEventListener('keydown', (e) => {
    if (String(e.key || '').toLowerCase() !== 'e' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || talk.hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    if (nearNow()) { e.preventDefault(); open('home'); }
  });
  setInterval(() => { paintTalk(); if (dialog.open && state.build) tickLeft(); }, 500);
  onLangChange(() => { talkSig = ''; if (dialog.open) paint(); });

  return {
    state, open, close, onState, onError,
    // 入室の あと：いまの 段・工事・できあがりの しらせを 聞く。
    prime() { send('build:peek', {}); },
    label: () => L('🏠 Make my house bigger', '🏠 いえを 大きく する（ぞうちく）'),
    get isOpen() { return dialog.open; },
    get yard() { return yard; },
  };
}
