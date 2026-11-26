// 島と 島を つなぐ 橋の 表（2026-11：「ぜんぶの 島を 橋で つなげる。歩いても 行けるように」）。
//
// ・ここは 数字と 計算だけ（three.js も DOM も 読まない）。絵と うごきは bridges.js、検査は tests/regression.mjs。
// ・`from` / `to` は 世界の 座標（rpg-data.js の HUBS / REGIONS の x, z ＋ 島の 中の 位置）。`from` は `a` の 岸、`to` は `b` の 岸。
//   **島を うごかしたら ここも なおす**（島の 位置は rpg-data.js と 各島の json の 2 か所。サーバーは 橋を 知らない：
//   `move` の `s`（いる 島）は 子どもの 画面が 言う とおりに 受けとる ので、まんなかで きりかわれば そのまま 合う）。
// ・つなぎ方は 木（ぜんぶ つながる いちばん 少ない 本数）＋ 近道 1 本（U-Speak島 ⇔ おつかい島）。
//   **入れない ことが ある 島（プレミアム・ぼうけんの ちいき）は 行き止まりか、同じ 錠の 島の 先に だけ 置く**
//   ＝ しまって いる 島の むこうに、入れる 島が のこらない。ことばの草原（meadow）は いつも ひらいて いるので 通り道に 使う。
// ・橋は ほかの 島の 上も ほかの 橋も 横切らない。岸は 船着き場・ひこうきの 道・建物を さけた 場所
//   （場所は ほんものの 当たり判定の 地図から 決めた。scratch の br-solve.mjs の やり方は README では なく ここに：
//    島の まんなか どうしを むすぶ 向きを 5° ずつ ずらして、岸から 3 歩 入った 所まで 何も ない 向きを えらぶ）。
// ・U-Speak島 ⇔ メインの島 の 橋は 前から ある `bridge.js`（絵も 当たり判定も むこう）。ここでは 道しるべと 地図の しるしだけ（`legacy`）。

export const BRIDGE_WIDTH = 3.6;

export const LINKS = [
  { a: 'willow', b: 'main', from: { x: 5, z: -18.5 }, to: { x: 5, z: -44 }, width: 3.4, legacy: true },
  { a: 'willow', b: 'park', from: { x: 25, z: 12 }, to: { x: 102, z: 4 }, width: 3.6 },
  { a: 'willow', b: 'errand', from: { x: -25, z: 4 }, to: { x: -124.8, z: 62.4 }, width: 3.6 },
  { a: 'main', b: 'arena', from: { x: -79.5, z: -99 }, to: { x: -110.8, z: -107.3 }, width: 3.6 },
  { a: 'main', b: 'meadow', from: { x: -67, z: -119.5 }, to: { x: -30.2, z: -157.9 }, width: 3.6 },
  { a: 'arena', b: 'town', from: { x: -158.8, z: -91.2 }, to: { x: -191.2, z: -58.8 }, width: 3.6 },
  { a: 'arena', b: 'forest', from: { x: -146, z: -133.9 }, to: { x: -150, z: -184 }, width: 3.6 },
  { a: 'town', b: 'fishworld', from: { x: -230.7, z: -57.4 }, to: { x: -343.2, z: -170 }, width: 3.6 },
  { a: 'town', b: 'farm', from: { x: -229.7, z: -21.9 }, to: { x: -310.3, z: 51.9 }, width: 3.6 },
  { a: 'town', b: 'errand', from: { x: -196.2, z: -18.4 }, to: { x: -149, z: 50.6 }, width: 3.6 },
  { a: 'town', b: 'canyon', from: { x: -239.1, z: -43.2 }, to: { x: -269.8, z: -46.6 }, width: 3.6 },
  { a: 'errand', b: 'homework', from: { x: -135.6, z: 96.3 }, to: { x: -112.3, z: 142.8 }, width: 3.6 },
  { a: 'homework', b: 'pet', from: { x: -83.4, z: 185.2 }, to: { x: -46.6, z: 229.8 }, width: 3.6 },
  { a: 'homework', b: 'abc', from: { x: -115.4, z: 185.8 }, to: { x: -184.6, z: 279.2 }, width: 3.6 },
  { a: 'homework', b: 'desert', from: { x: -129.4, z: 166.2 }, to: { x: -189.8, z: 168.7 }, width: 3.6 },
  { a: 'abc', b: 'reading', from: { x: -226.7, z: 289.7 }, to: { x: -303.3, z: 260.3 }, width: 3.6 },
  { a: 'farm', b: 'conv', from: { x: -311.2, z: 88.8 }, to: { x: -268.5, z: 146.6 }, width: 3.6 },
  { a: 'pet', b: 'moon', from: { x: -49.8, z: 268 }, to: { x: -56.7, z: 274.3 }, width: 3.6 },
  { a: 'park', b: 'school', from: { x: 140, z: 29 }, to: { x: 163.6, z: 106.2 }, width: 3.6 },
  { a: 'park', b: 'ride', from: { x: 150, z: -29 }, to: { x: 188.2, z: -123.6 }, width: 3.6 },
  { a: 'school', b: 'wear', from: { x: 184.6, z: 151.2 }, to: { x: 181.7, z: 226.6 }, width: 3.6 },
  { a: 'school', b: 'land', from: { x: 198.7, z: 124.6 }, to: { x: 301.3, z: 105.4 }, width: 3.6 },
  { a: 'school', b: 'talk', from: { x: 152.3, z: 149.5 }, to: { x: 103.2, z: 185 }, width: 3.6 },
  { a: 'wear', b: 'sky', from: { x: 178.7, z: 272.5 }, to: { x: 157.9, z: 314.3 }, width: 3.6 },
  { a: 'land', b: 'ruins', from: { x: 320.1, z: 123 }, to: { x: 311, z: 144.3 }, width: 3.6 },
  { a: 'ride', b: 'reef', from: { x: 198.7, z: -162.5 }, to: { x: 190.8, z: -184.3 }, width: 3.6 },
  { a: 'ride', b: 'snow', from: { x: 231.5, z: -123.4 }, to: { x: 289.8, z: -78.3 }, width: 3.6 },
  { a: 'meadow', b: 'mini', from: { x: 30.2, z: -190.1 }, to: { x: 97.1, z: -234.7 }, width: 3.6 },
  { a: 'meadow', b: 'eiken5', from: { x: -19.3, z: -195.7 }, to: { x: -68.9, z: -261.8 }, width: 3.6 },
  { a: 'mini', b: 'storm', from: { x: 112.9, z: -273.7 }, to: { x: 105.9, z: -324.3 }, width: 3.6 },
  { a: 'mini', b: 'eiken3', from: { x: 148.3, z: -256.5 }, to: { x: 212, z: -271.2 }, width: 3.6 },
  { a: 'eiken5', b: 'eiken4', from: { x: -55.1, z: -305.5 }, to: { x: -34.9, z: -314.5 }, width: 3.6 },
  { a: 'eiken5', b: 'eikenp2', from: { x: -127.3, z: -300.7 }, to: { x: -192.7, z: -319.3 }, width: 3.6 },
  { a: 'eikenp2', b: 'eiken2', from: { x: -197.4, z: -348.8 }, to: { x: -155.5, z: -404.5 }, width: 3.6 },
  { a: 'eiken4', b: 'eikenp1', from: { x: 16.2, z: -360.4 }, to: { x: 68.2, z: -417.2 }, width: 3.6 },
  { a: 'eiken3', b: 'eiken1', from: { x: 259.1, z: -312.5 }, to: { x: 253, z: -398.2 }, width: 3.6 },
];

// 計算で 使う 形に しておく：長さ・向き（a → b の 単位ベクトル）・まんなかの 休みどころ（60 より 長い 橋）。
export const REST_MIN = 60;   // これより 長い 橋は まんなかに ひろい 台（ベンチと あかり）
export const REST_HALF = 4.5; // 台の 長さの 半分（橋の 向き）
export const REST_WIDE = 3.4; // 台の はばの 半分
for (const l of LINKS) {
  const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z;
  l.len = Math.hypot(dx, dz);
  l.ux = dx / l.len; l.uz = dz / l.len;
  l.half = l.width / 2;
  l.rest = !l.legacy && l.len >= REST_MIN;
  l.id = `${l.a}-${l.b}`;
}
export const WALKABLE = LINKS.filter((l) => !l.legacy);

const BY_ISLAND = new Map();
for (const l of LINKS) for (const id of [l.a, l.b]) { if (!BY_ISLAND.has(id)) BY_ISLAND.set(id, []); BY_ISLAND.get(id).push(l); }
export const linksOf = (id) => BY_ISLAND.get(id) || [];
export const otherEnd = (l, id) => (l.a === id ? l.b : l.a);
// 歩いて となりの 島（橋 1 本）。
export const neighboursOf = (id) => linksOf(id).map((l) => otherEnd(l, id));

// 橋の 上の 位置：s ＝ a の 岸からの 道のり、w ＝ まんなかの 線からの 横の ずれ。
export function project(l, x, z) {
  const px = x - l.from.x, pz = z - l.from.z;
  return { s: px * l.ux + pz * l.uz, w: px * l.uz - pz * l.ux };
}
// 板の 上に いるか（手すりの 内がわ）。`pad` は 岸の 外へ 少し のばす 長さ。
export function onDeck(l, x, z, pad = 0.6) {
  const { s, w } = project(l, x, z);
  if (s < -pad || s > l.len + pad) return false;
  if (Math.abs(w) <= l.half) return true;
  return l.rest && Math.abs(s - l.len / 2) <= REST_HALF && Math.abs(w) <= REST_WIDE;
}
// 板の 高さ（まんなかが ほんの すこし 高い）。3D と 足もとで 同じ 式を 使う。
export function deckY(l, s) {
  const u = Math.max(0, Math.min(1, s / l.len));
  return 0.3 + Math.min(0.45, l.len * 0.012) * Math.sin(u * Math.PI);
}
export function pointAt(l, s, w = 0) {
  return { x: l.from.x + l.ux * s + l.uz * w, z: l.from.z + l.uz * s - l.ux * w };
}

// ミニマップの しるし：その 島の 岸から 海へ 出て いく 橋の ねもと。`mx` / `my` は 島の 中の 座標 → 地図の 画素。
// `origin` は 島の 位置（世界）。島の 絵の 下絵に 1 回 描く だけ（island-kit.js / main-world.js）。
export function drawBridgeStubs(g, id, mx, my, origin = { x: 0, z: 0 }, reach = 9) {
  if (!g?.beginPath) return 0;
  let n = 0;
  for (const l of linksOf(id)) {
    const end = l.a === id ? l.from : l.to;
    const sign = l.a === id ? 1 : -1;
    const x0 = end.x - origin.x - l.ux * sign * 1.5, z0 = end.z - origin.z - l.uz * sign * 1.5;
    const x1 = end.x - origin.x + l.ux * sign * reach, z1 = end.z - origin.z + l.uz * sign * reach;
    g.lineCap = 'butt';
    g.strokeStyle = '#5d4326'; g.lineWidth = 4.4; g.beginPath(); g.moveTo(mx(x0), my(z0)); g.lineTo(mx(x1), my(z1)); g.stroke();
    g.strokeStyle = '#d9a866'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(mx(x0), my(z0)); g.lineTo(mx(x1), my(z1)); g.stroke();
    // 板の すじ。
    g.strokeStyle = '#8a6335'; g.lineWidth = 0.7;
    const ax = mx(x0), az = my(z0), bx = mx(x1), bz = my(z1), dl = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / dl, nz = (bx - ax) / dl;
    for (let t = 2.5; t < dl; t += 2.5) { const cx = ax + (bx - ax) * t / dl, cz = az + (bz - az) * t / dl; g.beginPath(); g.moveTo(cx - nx * 1.3, cz - nz * 1.3); g.lineTo(cx + nx * 1.3, cz + nz * 1.3); g.stroke(); }
    n += 1;
  }
  return n;
}
