// リアルな 木（メインの島）。箱の 木の かわりに、えだわかれ する 幹と、葉の 絵を はった 板の かたまりで 作る。
//
// ・モデルの ファイルは 読まない（three だけ）。形は たねつきの 乱数で 3 しゅるい（ひろい 木・もみの 木・ほそい 木）を 1 回だけ 作り、
//   InstancedMesh で ならべる ＝ 1 しゅるい 2 回の 描画（幹・葉）。木が 何本でも 描く 回数は 6 回。
// ・葉と 樹皮の 絵は canvas で かく（白っぽい 明るさだけ）。色は 季節ごとに 木 1 本ずつ かける（setSeason）。
// ・葉は 風で ゆれる（頂点シェーダーに 1 行）。動かすのは それだけ。
import * as THREE from './three.module.js';

const UP = new THREE.Vector3(0, 1, 0);

function seeded(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ---- 絵（canvas）。検査（DOM の ない Node）では 作れないので、その ときは 絵なし。----
function canvasTexture(size, paint) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    paint(g, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  } catch { return null; }
}
function leafTexture(rand) {
  return canvasTexture(256, (g, S) => {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 95; i += 1) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * S * 0.4;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      const len = 26 + rand() * 20, wid = len * (0.38 + rand() * 0.14);
      const l = 52 + rand() * 44;
      g.save(); g.translate(x, y); g.rotate(rand() * Math.PI * 2);
      g.fillStyle = `hsl(0,0%,${l}%)`;
      g.beginPath(); g.moveTo(0, -len / 2); g.quadraticCurveTo(wid, 0, 0, len / 2); g.quadraticCurveTo(-wid, 0, 0, -len / 2); g.fill();
      g.strokeStyle = `hsl(0,0%,${l - 16}%)`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -len / 2); g.lineTo(0, len / 2); g.stroke();
      g.restore();
    }
  });
}
function needleTexture(rand) {
  return canvasTexture(256, (g, S) => {
    g.clearRect(0, 0, S, S);
    // 板の 長い 向き（u）に えだ、そこから 針の 葉。
    for (const [y0, k] of [[S * 0.5, 1], [S * 0.3, 0.7], [S * 0.7, 0.7]]) {
      for (let x = 10; x < S - 8; x += 3) {
        const taper = 1 - x / S;
        const len = (16 + rand() * 20) * (0.45 + taper * 0.75) * k;
        const l = 46 + rand() * 46;
        g.strokeStyle = `hsl(0,0%,${l}%)`; g.lineWidth = 2.2;
        for (const side of [-1, 1]) {
          g.beginPath(); g.moveTo(x, y0 + (x / S) * 14 * (y0 < S / 2 ? -1 : y0 > S / 2 ? 1 : 0));
          g.lineTo(x + 9 + rand() * 6, y0 + side * len + (x / S) * 14 * (y0 < S / 2 ? -1 : y0 > S / 2 ? 1 : 0)); g.stroke();
        }
      }
    }
  });
}
function barkTexture(rand) {
  const tex = canvasTexture(128, (g, S) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i += 1) {
      const x = rand() * S, y = rand() * S, h = 10 + rand() * 46;
      g.fillStyle = `hsla(0,0%,${28 + rand() * 60}%,0.5)`;
      g.fillRect(x, y, 1 + rand() * 3, h);
    }
  });
  if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  return tex;
}

// ---- 形を あつめて 1 つの geometry に。----
function merge(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.attributes.position.count; ni += p.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let v = 0, i = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, v * 3); nor.set(p.attributes.normal.array, v * 3); uv.set(p.attributes.uv.array, v * 2);
    const src = p.index.array;
    for (let k = 0; k < src.length; k += 1) idx[i + k] = src[k] + v;
    v += p.attributes.position.count; i += src.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
const q = new THREE.Quaternion();
function limb(parts, from, dir, len, r0, r1, sides = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(q.setFromUnitVectors(UP, dir));
  g.translate(from.x, from.y, from.z);
  // 樹皮の 絵を 長さに あわせて くりかえす。
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) * len * 0.5);
  parts.push(g);
}
// 葉の 板 1 まい。法線は「かたまりの まんなかから 外」＝ まるく 光が あたる。
function card(parts, at, size, rand, centre, normalUp = 0.35) {
  const g = new THREE.PlaneGeometry(size, size);
  g.applyQuaternion(q.setFromEuler(new THREE.Euler((rand() - 0.5) * Math.PI, rand() * Math.PI * 2, (rand() - 0.5) * Math.PI)));
  g.translate(at.x, at.y, at.z);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    v.set(p.getX(i) - centre.x, p.getY(i) - centre.y, p.getZ(i) - centre.z).normalize(); v.y += normalUp; v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  parts.push(g);
}

// ひろい 木・ほそい 木：えだわかれ。
function broadleaf(rand, o) {
  const wood = [], leaves = [], tips = [];
  const grow = (pos, dir, len, rad, depth) => {
    const end = pos.clone().addScaledVector(dir, len);
    limb(wood, pos, dir, len, rad, rad * o.taper, depth >= o.depth - 1 ? 7 : 5);
    if (depth <= 1) tips.push(end);
    if (depth === 0) return;
    const n = depth >= 2 ? o.fork : 2;
    const turn = rand() * Math.PI * 2;
    for (let i = 0; i < n; i += 1) {
      const a = turn + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.8;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const d = dir.clone().multiplyScalar(1 - o.spread).addScaledVector(side, o.spread * (0.7 + rand() * 0.6)).addScaledVector(UP, o.lift).normalize();
      grow(end, d, len * (o.shrink + rand() * 0.1), rad * o.taper, depth - 1);
    }
    if (o.leader && depth >= 2) grow(end, dir.clone().addScaledVector(side0(rand), 0.12).normalize(), len * 0.8, rad * o.taper, depth - 1);
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3((rand() - 0.5) * 0.08, 1, (rand() - 0.5) * 0.08).normalize(), o.trunk, o.radius, o.depth);
  // 根もとの ひろがり。
  limb(wood, new THREE.Vector3(0, -0.15, 0), UP, 0.5, o.radius * 1.7, o.radius * 1.02, 7);
  const centre = tips.reduce((c, t) => c.add(t), new THREE.Vector3()).multiplyScalar(1 / tips.length);
  for (const t of tips) {
    for (let i = 0; i < o.cards; i += 1) {
      const at = t.clone().add(new THREE.Vector3((rand() - 0.5) * o.puff, (rand() - 0.3) * o.puff, (rand() - 0.5) * o.puff));
      card(leaves, at, o.leaf * (0.8 + rand() * 0.5), rand, centre);
    }
  }
  return { wood: merge(wood), leaves: merge(leaves), height: centre.y + o.puff };
}
const side0 = (rand) => new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5);

// もみの 木：まっすぐな 幹に、だんだんの えだ。えだ 1 本に 針の 葉の 板を 2 まい（十字）。
export function conifer(rand, o = {}) {
  const H = o.height ?? 7.4, wood = [], leaves = [];
  limb(wood, new THREE.Vector3(0, -0.15, 0), UP, H * 0.5 + 0.15, 0.3, 0.17, 7);
  limb(wood, new THREE.Vector3(0, H * 0.5, 0), UP, H * 0.5, 0.17, 0.03, 6);
  const rows = o.rows ?? 13;
  for (let r = 0; r < rows; r += 1) {
    const u = r / (rows - 1), y = H * (0.2 + u * 0.78);
    const reach = (1 - u) * (o.reach ?? 2.5) + 0.35;
    const n = Math.max(4, Math.round(7 - u * 3)), turn = rand() * Math.PI;
    for (let i = 0; i < n; i += 1) {
      const a = turn + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const droop = -0.22 - (1 - u) * 0.2;
      const dir = new THREE.Vector3(Math.cos(a), droop, Math.sin(a)).normalize();
      const len = reach * (0.82 + rand() * 0.3);
      const from = new THREE.Vector3(0, y + (rand() - 0.5) * 0.2, 0);
      limb(wood, from, dir, len * 0.9, 0.05, 0.012, 4);
      for (const roll of [0.25, Math.PI / 2 + 0.25]) {
        const g = new THREE.PlaneGeometry(len, len * 0.62);
        g.translate(len / 2, 0, 0);                    // 板の 左はしが 幹
        g.rotateX(roll);
        g.applyQuaternion(q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir));
        g.translate(from.x, from.y, from.z);
        const p = g.attributes.position, nn = g.attributes.normal, v = new THREE.Vector3();
        for (let k = 0; k < p.count; k += 1) { v.set(p.getX(k), 0, p.getZ(k)).normalize(); v.y = 0.9; v.normalize(); nn.setXYZ(k, v.x, v.y, v.z); }
        leaves.push(g);
      }
    }
  }
  return { wood: merge(wood), leaves: merge(leaves), height: H };
}

// 葉の 材質：両面・ぬき（alphaTest）・風で ゆれる・うら面でも 法線を うらがえさない（まるい 光を たもつ）。
function foliage(map, sway) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, alphaTest: map ? 0.42 : 0, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sway;
    sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float swayPh = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
      #else
        float swayPh = 0.0;
      #endif
      float swayAmt = max(0.0, position.y - 1.0) * 0.022;
      transformed.x += sin(uTime * 1.25 + swayPh + position.y * 0.6) * swayAmt;
      transformed.z += cos(uTime * 0.95 + swayPh * 1.3 + position.x * 0.8) * swayAmt * 0.8;`);
    const chunk = THREE.ShaderChunk?.normal_fragment_begin;
    if (chunk) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', chunk.replace(/normal \*= faceDirection;/g, ''));
  };
  m.customProgramCacheKey = () => 'uspeak-foliage';
  return m;
}

// 季節ごとの 葉の 色（木 1 本ずつ この 中から えらぶ）。null ＝ 葉を 出さない（冬の はだかの 木）。
const PALETTE = {
  spring: { broad: [0xf7b3cb, 0xf9c6d8, 0xf4a3c0, 0x9ccf6a, 0xa9d873], slim: [0xa6d86c, 0xb7e07e, 0xf7bcd0], fir: [0x5f9e62, 0x6aaa68] },
  summer: { broad: [0x4f9a3f, 0x5aa646, 0x468c3c, 0x64ae4e], slim: [0x6bb84e, 0x5fae4a, 0x78c058], fir: [0x558f5c, 0x5f9a62] },
  autumn: { broad: [0xd9482b, 0xe8742a, 0xf0a52a, 0xc93a2a, 0xe89a2f], slim: [0xf2c230, 0xf0b02c, 0xe8892a], fir: [0x548c5a, 0x5d9660] },
  winter: { broad: null, slim: null, fir: [0x4a7d5a, 0x5a8c68, 0x6a9a78] },
};
const BARK = { broad: 0x8a6b4c, slim: 0xcfc8b8, fir: 0x6e5540 };

export function createRealTrees({ root, trees, seed = 77 }) {
  const rand = seeded(seed);
  const sway = { value: 0 };
  const bark = barkTexture(rand);
  const kinds = {
    broad: { ...broadleaf(seeded(seed + 1), { trunk: 2.3, radius: 0.3, taper: 0.64, depth: 3, fork: 3, spread: 0.6, lift: 0.22, shrink: 0.68, cards: 5, puff: 1.5, leaf: 1.9, leader: false }), map: leafTexture(seeded(seed + 2)) },
    fir: { ...conifer(seeded(seed + 3)), map: needleTexture(seeded(seed + 4)) },
    slim: { ...broadleaf(seeded(seed + 5), { trunk: 3.3, radius: 0.2, taper: 0.66, depth: 3, fork: 2, spread: 0.36, lift: 0.5, shrink: 0.66, cards: 5, puff: 1.1, leaf: 1.5, leader: true }), map: leafTexture(seeded(seed + 6)) },
  };
  const ORDER = ['broad', 'fir', 'slim'];
  const groups = { broad: [], fir: [], slim: [] };
  for (const t of trees) groups[ORDER[(t.kind >= 0 ? t.kind : Math.floor(rand() * 3)) % 3]].push({ ...t, turn: rand() * Math.PI * 2, pick: rand(), tint: 0.9 + rand() * 0.2 });

  const sets = [];
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3();
  for (const id of ORDER) {
    const list = groups[id]; if (!list.length) continue;
    const k = kinds[id];
    const woodMat = new THREE.MeshStandardMaterial({ color: BARK[id], map: bark, roughness: 0.95 });
    const wood = new THREE.InstancedMesh(k.wood, woodMat, list.length);
    const leaves = new THREE.InstancedMesh(k.leaves, foliage(k.map, sway), list.length);
    list.forEach((t, i) => {
      const s = (t.scale || 1) * (id === 'fir' ? 0.95 : 1.05);
      m4.compose(pp.set(t.x, 0, t.z), qq.setFromAxisAngle(UP, t.turn), ss.set(s, s * (0.92 + t.pick * 0.2), s));
      wood.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
    });
    wood.castShadow = true; wood.receiveShadow = true;
    leaves.castShadow = true; leaves.receiveShadow = true;
    // 島ぜんたいに ちらばるので、まとめての 視錐台カリングは しない（はしの 木が 消えない ように）。
    wood.frustumCulled = false; leaves.frustumCulled = false;
    root.add(wood, leaves);
    sets.push({ id, list, wood, leaves });
  }

  const c = new THREE.Color();
  function setSeason(season) {
    const pal = PALETTE[season] || PALETTE.summer;
    for (const set of sets) {
      const colours = pal[set.id];
      set.leaves.visible = !!colours;
      if (!colours) continue;
      set.list.forEach((t, i) => { c.setHex(colours[Math.floor(t.pick * colours.length) % colours.length]).multiplyScalar(t.tint); set.leaves.setColorAt(i, c); });
      if (set.leaves.instanceColor) set.leaves.instanceColor.needsUpdate = true;
    }
  }
  setSeason('summer');
  return { setSeason, update(t) { sway.value = t; }, count: trees.length };
}

// クリスマスツリーなど、1 本だけ 大きく 立てる もみの 木（main-seasons.js が 使う）。
export function singleFir({ height = 7.4, colour = 0x3f7a48, seed = 5 } = {}) {
  const k = conifer(seeded(seed), { height, rows: 16, reach: 2.9 });
  const sway = { value: 0 };
  const group = new THREE.Group();
  const wood = new THREE.Mesh(k.wood, new THREE.MeshStandardMaterial({ color: BARK.fir, roughness: 0.95 }));
  const mat = foliage(needleTexture(seeded(seed + 1)), sway); mat.color.setHex(colour);
  const leaves = new THREE.Mesh(k.leaves, mat);
  for (const m of [wood, leaves]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  return { group, height, update(t) { sway.value = t; } };
}
