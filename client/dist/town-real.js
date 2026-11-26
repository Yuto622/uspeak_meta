// ひろばの ブロックの 3D — 色だけの 箱では なく、石・レンガ・木の いた・ガラス などの 質感を はる。
//
// ・もようは `town-block-tex.js` の 絵（256×128：左＝よこの 面、右＝上の 面）。お店の カードの 絵と 同じ 絵。
// ・**箱は 1 つ、材質は ブロック 1 しゅるいに 1 つ**（みんなで つかう）。箱の UV で 左右を ふりわけるので
//   1 ブロック＝1 回の 描画の まま（材質を 6 まいに わけない）。
// ・光は 足さない：ランプは emissive（bloom が あるので 0.5 まで）。ガラスと 水は 絵の すけぐあいで すける。
// ・絵が かけない とき（検査の Node など）は、前と 同じ 色だけの 材質。
import * as THREE from './three.module.js';
import { blockTexture, BLOCK_LOOK } from './town-block-tex.js';

let geo = null;
// 1×1×1 の 箱。上と 下の 面は 絵の 右 半分、よこの 4 面は 左 半分を 使う。
export function blockGeometry() {
  if (geo) return geo;
  geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv;
  const e = 1 / 256;                       // となりの 半分の 色が にじまない ように 少し 内がわ
  for (let i = 0; i < uv.count; i += 1) {
    const face = Math.floor(i / 4);        // +x -x +y -y +z -z
    const top = face === 2 || face === 3;
    uv.setX(i, (top ? 0.5 : 0) + e + uv.getX(i) * (0.5 - e * 2));
  }
  uv.needsUpdate = true;
  return geo;
}

const mats = new Map();
// その ブロックの 材質（しゅるい＋色ごとに 1 つ）。
export function blockMaterial(id, colour) {
  const c = Number(colour) || 0xaaaaaa;
  const key = `${id}:${c}`;
  if (mats.has(key)) return mats.get(key);
  const look = BLOCK_LOOK[id] || {};
  let map = null;
  try {
    const cv = blockTexture(id, c);
    if (cv) { map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
  } catch { map = null; }
  const m = new THREE.MeshStandardMaterial(map
    ? { map, color: 0xffffff, roughness: look.rough ?? 0.82, metalness: 0 }
    : { color: c, roughness: 0.82 });
  if (map && look.alpha) { m.transparent = true; m.alphaTest = 0.02; }
  if (look.glow) {
    m.emissive = new THREE.Color(map ? 0xffffff : c);
    m.emissiveMap = map;
    m.emissiveIntensity = look.glow;
  }
  mats.set(key, m);
  return m;
}

// かばんの プレビュー用：底が y = 0 の ブロック 1 こ。
export function blockModel(id, colour) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(blockGeometry(), blockMaterial(id, colour));
  m.position.y = 0.5;
  g.add(m);
  return g;
}
