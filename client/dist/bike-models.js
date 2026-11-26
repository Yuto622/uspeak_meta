// じてんしゃの 3D モデル（じてんしゃや の 6 台・bikes-data.js）。モデルの ファイルは 読まない。
//
// ・向き：前が +z（アバターと 同じ）。原点は 地面・サドルの ま下あたり。サドルの 上は y ≈ SADDLE_Y、ハンドルの にぎりは BAR。
// ・形：タイヤ（Torus）＋リム＋スポーク、フレームの くだ（Cylinder を 2 点の あいだに）、ハンドル、サドル、クランクと ペダル。
//   6 台は 形が ちがう（こども＝ほじょりん・まち＝かごと どろよけ・BMX＝たかい ハンドル・マウンテン＝ふとい タイヤと サスペンション・
//   ロード＝ドロップハンドルと ほそい タイヤ・きん＝金の フレームと 星の ライト）。
// ・**重く しない**：同じ 材質の 部品は 1 つの メッシュに まとめる（車体 4・くるま 2 × 2・クランク 2 ＝ 1 台 10 メッシュ）。光は 足さない。
// ・車輪と クランクは 別の Group（`userData.spin(すすんだ 長さ)` で まわる）。
import * as THREE from './three.module.js';
import { BIKE_BY_ID } from './bikes-data.js';

export const SADDLE_Y = 0.8;                       // サドルの 上（のる 人の おしりが のる 高さ）
export const BAR = { y: 1.14, z: 0.4, x: 0.27 };   // ハンドルの にぎり（左右 ±x）
const REAR_Z = -0.56, FRONT_Z = 0.64;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// 2 点の あいだの くだ。
function tube(a, b, r, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  return g;
}
const put = (g, p, r = null, s = null) => {
  const e = new THREE.Euler(...(r || [0, 0, 0]));
  g.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(e), V(...(s || [1, 1, 1]))));
  return g;
};
// 同じ 材質の 部品を 1 つの 形に（index なしに そろえて つなぐ）。
function merge(list) {
  const parts = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); return n; });
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
const mesh = (list, mat) => { const m = new THREE.Mesh(merge(list), mat); m.castShadow = true; return m; };

// 形ごとの 数字。R＝車輪の 半径、tyre＝タイヤの 太さ、tube＝フレームの 太さ。
const SHAPE = {
  kids: { R: 0.3, tyre: 0.05, tube: 0.04, spokes: 8 },
  city: { R: 0.4, tyre: 0.04, tube: 0.032, spokes: 12 },
  bmx: { R: 0.32, tyre: 0.06, tube: 0.04, spokes: 10 },
  mountain: { R: 0.43, tyre: 0.07, tube: 0.042, spokes: 12 },
  road: { R: 0.44, tyre: 0.026, tube: 0.026, spokes: 14 },
  gold: { R: 0.42, tyre: 0.04, tube: 0.036, spokes: 16 },
};

function wheelParts(sh, knobs) {
  const { R, tyre } = sh, rr = R - tyre;
  const dark = [put(new THREE.TorusGeometry(rr, tyre, 10, 28), [0, 0, 0], [0, Math.PI / 2, 0])];
  if (knobs) for (let i = 0; i < 18; i += 1) { const a = (i / 18) * Math.PI * 2; dark.push(put(new THREE.BoxGeometry(tyre * 1.9, 0.035, 0.07), [0, Math.cos(a) * (R - 0.004), Math.sin(a) * (R - 0.004)], [a, 0, 0])); }
  const metal = [put(new THREE.TorusGeometry(rr - tyre * 0.75, 0.016, 6, 28), [0, 0, 0], [0, Math.PI / 2, 0]), put(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), [0, 0, 0], [0, 0, Math.PI / 2])];
  const sr = rr - tyre * 0.75;
  for (let i = 0; i < sh.spokes; i += 1) { const a = (i / sh.spokes) * Math.PI; metal.push(put(new THREE.CylinderGeometry(0.006, 0.006, sr * 2, 4), [((i % 2) - 0.5) * 0.03, 0, 0], [a, 0, 0])); }
  return { dark, metal };
}

const builds = new Map();   // 形 → 部品の ならび を 作る 関数は 下の build() 1 つ。ここは できた 形（geometry）の おぼえ。

// 1 台ぶんの 形（geometry）を 作る。材質とは べつに おぼえて、同じ 形の 2 台目からは 使いまわす（dispose しない）。
function geometry(style) {
  if (builds.has(style)) return builds.get(style);
  const sh = SHAPE[style] || SHAPE.city, { R } = sh, t = sh.tube;
  const frame = [], dark = [], metal = [], accent = [];
  const A = V(0, R, REAR_Z), F = V(0, R, FRONT_Z);
  const bbY = Math.max(0.26, R * 0.82);
  const BB = V(0, bbY, -0.06);                 // クランクの じく
  const S = V(0, SADDLE_Y - 0.05, -0.2);       // サドルの ま下
  const ST = V(0, style === 'bmx' ? 0.56 : style === 'kids' ? 0.56 : 0.68, -0.165);   // トップチューブが つく ところ
  const H1 = V(0, style === 'road' ? 0.98 : 0.94, 0.36), H2 = V(0, Math.max(R + 0.22, 0.66), 0.45);
  const barY = BAR.y, barZ = BAR.z;

  // フレーム：シートチューブ・ダウンチューブ・トップチューブ・チェーンステー・シートステー・ヘッド。
  frame.push(tube(BB, V(0, ST.y + 0.04, ST.z - 0.01), t));
  frame.push(tube(BB, H2, t * 1.1));
  if (style === 'city') {                       // またぎやすい ひくい フレーム（2 本）
    frame.push(tube(V(0, bbY + 0.16, -0.085), V(0, H2.y + 0.06, 0.43), t * 0.9));
  } else frame.push(tube(ST, V(0, H1.y - 0.07, H1.z + 0.02), t));
  for (const s of [-1, 1]) {
    frame.push(tube(V(s * 0.05, BB.y, BB.z), V(s * 0.065, A.y, A.z), t * 0.6));
    frame.push(tube(V(s * 0.04, ST.y, ST.z), V(s * 0.065, A.y, A.z), t * 0.55));
  }
  frame.push(tube(H2, H1, t * 1.25));
  // フォーク。マウンテンは 太い サスペンション、ほかは ほそい 2 本。
  const forkR = style === 'mountain' ? t * 0.95 : t * 0.6;
  for (const s of [-1, 1]) (style === 'mountain' ? dark : frame).push(tube(V(s * 0.075, H2.y, H2.z), V(s * 0.075, F.y, F.z), forkR));
  if (style === 'mountain') { for (const s of [-1, 1]) metal.push(tube(V(s * 0.075, H2.y - 0.02, H2.z + 0.005), V(s * 0.075, H2.y - 0.2, H2.z + 0.06), forkR * 0.72)); frame.push(tube(V(-0.1, H2.y, H2.z), V(0.1, H2.y, H2.z), t * 0.9)); }
  else frame.push(tube(V(-0.085, H2.y, H2.z), V(0.085, H2.y, H2.z), t * 0.7));
  // シートポストと サドル。
  metal.push(tube(V(0, ST.y, ST.z - 0.005), S, 0.02));
  const wide = style === 'city' || style === 'kids' ? 1.25 : style === 'road' ? 0.8 : 1;
  dark.push(put(new THREE.SphereGeometry(0.14, 14, 10), [0, SADDLE_Y - 0.035, -0.2], null, [0.85 * wide, 0.3, 1.3]));
  dark.push(put(new THREE.SphereGeometry(0.07, 10, 8), [0, SADDLE_Y - 0.04, -0.04], null, [0.7, 0.4, 1.3]));
  // ステムと ハンドル。
  const stemTop = V(0, barY - (style === 'bmx' ? 0.2 : 0.03), barZ - 0.02);
  metal.push(tube(H1, stemTop, 0.022));
  if (style === 'bmx') {                        // たかい U の 字の ハンドルと よこぼう
    for (const s of [-1, 1]) { metal.push(tube(V(s * 0.08, stemTop.y, stemTop.z), V(s * 0.2, barY, barZ), 0.02)); metal.push(tube(V(s * 0.2, barY, barZ), V(s * BAR.x, barY, barZ - 0.03), 0.02)); }
    metal.push(tube(V(-0.085, stemTop.y, stemTop.z), V(0.085, stemTop.y, stemTop.z), 0.022));
    metal.push(tube(V(-0.14, barY - 0.09, barZ - 0.008), V(0.14, barY - 0.09, barZ - 0.008), 0.016));
  } else if (style === 'road') {                // ドロップハンドル（前へ 出て 下へ まく）
    metal.push(tube(V(-0.2, barY, barZ), V(0.2, barY, barZ), 0.018));
    for (const s of [-1, 1]) { const arc = new THREE.TorusGeometry(0.075, 0.018, 6, 12, Math.PI); dark.push(put(arc, [s * 0.2, barY - 0.075, barZ + 0.06], [0, Math.PI / 2, -Math.PI / 2])); dark.push(tube(V(s * 0.2, barY, barZ), V(s * 0.2, barY, barZ + 0.07), 0.02)); }
  } else {
    const sweep = style === 'city' || style === 'kids' ? 0.1 : 0.03, rise = style === 'mountain' ? 0 : 0.02;
    for (const s of [-1, 1]) metal.push(tube(V(0, barY - rise, barZ + 0.02), V(s * (BAR.x - 0.08), barY, barZ - sweep * 0.5), 0.019));
    for (const s of [-1, 1]) dark.push(tube(V(s * (BAR.x - 0.09), barY, barZ - sweep * 0.5), V(s * (BAR.x + 0.05), barY, barZ - sweep), 0.027));
  }
  if (style === 'bmx') for (const s of [-1, 1]) dark.push(tube(V(s * (BAR.x - 0.02), barY, barZ - 0.03), V(s * (BAR.x + 0.1), barY, barZ - 0.03), 0.027));
  // チェーン（うすい 板 2 まい）と 大きい はぐるま。
  metal.push(put(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20), [0.07, BB.y, BB.z], [0, 0, Math.PI / 2]));
  metal.push(put(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), [0.07, A.y, A.z], [0, 0, Math.PI / 2]));
  for (const dy of [0.095, -0.095]) dark.push(tube(V(0.07, BB.y + dy, BB.z), V(0.07, A.y + dy * 0.45, A.z), 0.008, 4));

  // ---- 形ごとの かざり ----
  const fender = (z, a0, a1) => put(new THREE.TorusGeometry(R + 0.035, 0.03, 4, 14, a1 - a0), [0, R, z], [a0, Math.PI / 2, 0], [1, 1, 2.2]);
  if (style === 'city') {
    accent.push(put(new THREE.CylinderGeometry(0.17, 0.13, 0.2, 12, 1, true), [0, H1.y + 0.02, FRONT_Z - 0.02]));      // かご
    accent.push(put(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 12), [0, H1.y - 0.08, FRONT_Z - 0.02]));
    metal.push(tube(V(0, H1.y - 0.06, H1.z), V(0, H1.y - 0.06, FRONT_Z - 0.14), 0.014));
    frame.push(fender(REAR_Z, 0.2, 2.5)); frame.push(fender(FRONT_Z, 0.9, 2.6));
    metal.push(put(new THREE.BoxGeometry(0.16, 0.015, 0.34), [0, R + 0.34, REAR_Z - 0.02]));                             // にだい
    for (const s of [-1, 1]) metal.push(tube(V(s * 0.07, R + 0.33, REAR_Z - 0.16), V(s * 0.065, R, REAR_Z), 0.008, 4));
    metal.push(put(new THREE.SphereGeometry(0.035, 10, 8), [-0.14, barY + 0.035, barZ - 0.03]));                          // ベル
  }
  if (style === 'kids') {
    for (const s of [-1, 1]) {                   // ほじょりん
      metal.push(tube(V(s * 0.065, R, REAR_Z), V(s * 0.2, 0.1, REAR_Z - 0.02), 0.012, 5));
      dark.push(put(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), [s * 0.21, 0.1, REAR_Z - 0.02], [0, 0, Math.PI / 2]));
      accent.push(put(new THREE.CylinderGeometry(0.05, 0.05, 0.056, 10), [s * 0.21, 0.1, REAR_Z - 0.02], [0, 0, Math.PI / 2]));
      accent.push(tube(V(s * (BAR.x + 0.05), barY, barZ - 0.1), V(s * (BAR.x + 0.13), barY - 0.1, barZ - 0.14), 0.012, 4));   // にぎりの リボン
    }
    accent.push(put(new THREE.BoxGeometry(0.2, 0.15, 0.02), [0, H1.y - 0.12, H1.z + 0.09], [-0.25, 0, 0]));               // ゼッケンの 板
    frame.push(fender(REAR_Z, 0.5, 2.3));
  }
  if (style === 'bmx') {
    for (const s of [-1, 1]) for (const z of [REAR_Z, FRONT_Z]) metal.push(tube(V(s * 0.075, R, z), V(s * 0.17, R, z), 0.022));   // ペグ
    accent.push(put(new THREE.BoxGeometry(0.1, 0.07, 0.24), [0, ST.y + 0.1, 0.1], [0.34, 0, 0]));                           // フレームの パッド
  }
  if (style === 'mountain') {
    accent.push(tube(V(0, ST.y - 0.1, ST.z + 0.02), V(0, ST.y - 0.24, REAR_Z + 0.32), 0.03));                              // うしろの ばね
    accent.push(put(new THREE.BoxGeometry(0.03, 0.05, 0.3), [0, (BB.y + H2.y) / 2 + 0.03, 0.2], [-0.72, 0, 0]));
  }
  if (style === 'road') {
    accent.push(put(new THREE.CapsuleGeometry(0.035, 0.14, 3, 10), [0, (BB.y + H2.y) / 2 + 0.07, 0.19], [0.75, 0, 0]));     // ボトル
    accent.push(put(new THREE.BoxGeometry(0.012, 0.05, 0.3), [0.03, (ST.y + H1.y) / 2 - 0.03, 0.1], [-0.38, 0, 0]));
  }
  if (style === 'gold') {
    frame.push(fender(REAR_Z, 0.3, 2.4)); frame.push(fender(FRONT_Z, 0.9, 2.5));
    accent.push(put(new THREE.OctahedronGeometry(0.075, 0), [0, H1.y + 0.02, H1.z + 0.13], [0.2, 0.6, 0]));                 // 星の ライト
    accent.push(put(new THREE.SphereGeometry(0.035, 8, 6), [0, R + 0.4, REAR_Z - 0.06]));
    for (const s of [-1, 1]) accent.push(put(new THREE.SphereGeometry(0.03, 8, 6), [s * (BAR.x + 0.06), barY, barZ - 0.03]));
  }
  if (!accent.length) accent.push(put(new THREE.SphereGeometry(0.03, 8, 6), [0, H1.y, H1.z + 0.08]));
  // スタンド（とめて ある とき 用。まとめて かいて おく：のって いる ときも 小さくて 目だたない）。
  metal.push(tube(V(-0.06, BB.y - 0.02, BB.z - 0.1), V(-0.13, 0.03, BB.z - 0.26), 0.012, 5));

  // クランクと ペダル（じくで まわる）。
  const crankMetal = [], crankDark = [];
  for (const s of [-1, 1]) {
    crankMetal.push(tube(V(s * 0.085, 0, 0), V(s * 0.085, s * 0.15, 0), 0.016, 6));
    crankDark.push(put(new THREE.BoxGeometry(0.12, 0.035, 0.09), [s * 0.155, s * 0.15, 0]));
  }
  crankMetal.push(put(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), [0, 0, 0], [0, 0, Math.PI / 2]));

  const w = wheelParts(sh, style === 'mountain' || style === 'bmx');
  const geo = {
    sh, bb: BB, frame: merge(frame), dark: merge(dark), metal: merge(metal), accent: merge(accent),
    wheelDark: merge(w.dark), wheelMetal: merge(w.metal), crankMetal: merge(crankMetal), crankDark: merge(crankDark),
  };
  builds.set(style, geo);
  return geo;
}

const mats = new Map();
function materials(item) {
  const key = item.id;
  if (mats.has(key)) return mats.get(key);
  const gold = item.style === 'gold';
  const m = {
    frame: new THREE.MeshStandardMaterial({ color: item.color, roughness: gold ? 0.25 : 0.35, metalness: gold ? 0.55 : 0.2, emissive: gold ? 0x6a4a00 : 0x000000, emissiveIntensity: gold ? 0.35 : 0 }),
    dark: new THREE.MeshStandardMaterial({ color: gold ? 0xfbf6e6 : 0x23262b, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: gold ? 0xf7dc8a : 0xcfd6dc, roughness: 0.3, metalness: 0.35 }),
    accent: new THREE.MeshStandardMaterial({ color: item.accent ?? 0xffffff, roughness: 0.5, emissive: gold ? 0xfff1a8 : 0x000000, emissiveIntensity: gold ? 0.5 : 0 }),
    tyre: new THREE.MeshStandardMaterial({ color: gold ? 0xfbf6e6 : item.style === 'kids' ? 0xfbf6e6 : 0x1c1e22, roughness: 0.9 }),
  };
  mats.set(key, m);
  return m;
}

// じてんしゃ 1 台。id（'bike-city'）か 品（bikes-data.js の 1 行）。知らない id は null。
export function bikeModel(idOrItem) {
  const item = typeof idOrItem === 'string' ? BIKE_BY_ID[idOrItem] : idOrItem;
  if (!item || !SHAPE[item.style]) return null;
  const geo = geometry(item.style), m = materials(item), R = geo.sh.R;
  const g = new THREE.Group();
  for (const [k, mat] of [['frame', m.frame], ['dark', m.dark], ['metal', m.metal], ['accent', m.accent]]) { const o = new THREE.Mesh(geo[k], mat); o.castShadow = true; g.add(o); }
  const wheels = [];
  for (const z of [REAR_Z, FRONT_Z]) {
    const w = new THREE.Group(); w.position.set(0, R, z);
    const a = new THREE.Mesh(geo.wheelDark, m.tyre); a.castShadow = true; w.add(a); w.add(new THREE.Mesh(geo.wheelMetal, m.metal));
    g.add(w); wheels.push(w);
  }
  const crank = new THREE.Group(); crank.position.copy(geo.bb);
  crank.add(new THREE.Mesh(geo.crankMetal, m.metal)); crank.add(new THREE.Mesh(geo.crankDark, m.dark));
  g.add(crank);
  g.userData.bike = item.id; g.userData.wheels = wheels; g.userData.crank = crank; g.userData.R = R;
  // d だけ 前へ すすんだ ぶん 車輪と ペダルを まわす。
  g.userData.spin = (d) => { const a = d / R; for (const w of wheels) w.rotation.x += a; crank.rotation.x += d / 0.9; };
  return g;
}

// とめて ある じてんしゃ（お店の 前の かざり）：スタンドの がわへ 少し かたむける。
export function parkedBike(id, x, z, yaw = 0) {
  const b = bikeModel(id); if (!b) return null;
  const holder = new THREE.Group(); holder.position.set(x, 0.2, z); holder.rotation.y = yaw;
  b.rotation.z = 0.14; b.userData.wheels[1].rotation.y = 0.35;
  holder.add(b); return holder;
}
export const BIKE_STYLES = Object.keys(SHAPE);
