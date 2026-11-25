// つりばの 3D プレビュー（2026-11：「池・川・海を 3D プレビューで 見られる ように」）。
// つりの 画面の 左の わく（#fish-preview）で、えらんだ 釣り場の 小さな もけいが ゆっくり まわる。
// fishing.js の プレビュー用の renderer・シーンを そのまま 使う（WebGL を ふやさない）。箱と 円柱だけ。
import * as THREE from './three.module.js';

const mats = new Map();
const mat = (c, o = 1, glow = 0) => { const k = `${c}:${o}:${glow}`; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, transparent: o < 1, opacity: o, emissive: glow ? c : 0x000000, emissiveIntensity: glow })); return mats.get(k); };
const box = new THREE.BoxGeometry(); const cyl = new THREE.CylinderGeometry(1, 1, 1, 28); const cone = new THREE.ConeGeometry(1, 1, 8);

export function zoneModel(id) {
  const g = new THREE.Group();
  const B = (x, y, z, w, h, d, c, o = 1, glow = 0) => { const m = new THREE.Mesh(box, mat(c, o, glow)); m.position.set(x, y, z); m.scale.set(w, h, d); g.add(m); return m; };
  const C = (x, y, z, r, h, c, o = 1, glow = 0) => { const m = new THREE.Mesh(cyl, mat(c, o, glow)); m.position.set(x, y, z); m.scale.set(r, h, r); g.add(m); return m; };
  const tree = (x, z, s = 1, leaf = 0x3f8f5b) => { C(x, 0.25 * s, z, 0.07 * s, 0.5 * s, 0x7a5a3a); const m = new THREE.Mesh(cone, mat(leaf)); m.position.set(x, 0.85 * s, z); m.scale.set(0.3 * s, 0.9 * s, 0.3 * s); g.add(m); };
  const fish = (x, y, z, c, r = 0) => { const f = B(x, y, z, 0.26, 0.12, 0.08, c, 1, 0.2); f.rotation.y = r; const t = B(x - Math.cos(r) * 0.17, y, z + Math.sin(r) * 0.17, 0.1, 0.14, 0.05, c, 1, 0.2); t.rotation.y = r; };
  if (id === 'pond') {
    C(0, -0.25, 0, 1.9, 0.5, 0x7fb86a); C(0, 0.01, 0, 1.25, 0.06, 0x4fb8c8, 0.85); C(0, -0.1, 0, 1.25, 0.2, 0x2a7f95);
    for (const [x, z, r] of [[-0.5, 0.3, 0.22], [0.45, -0.4, 0.18], [0.2, 0.6, 0.14]]) { C(x, 0.06, z, r, 0.03, 0x5fae4b); B(x + r * 0.5, 0.1, z, 0.08, 0.06, 0.08, 0xf7a8c8); }
    for (let i = 0; i < 7; i += 1) { const a = 2.4 + i * 0.22; B(Math.cos(a) * 1.4, 0.3, Math.sin(a) * 1.4, 0.04, 0.6, 0.04, 0x5f8a3a); B(Math.cos(a) * 1.4, 0.62, Math.sin(a) * 1.4, 0.07, 0.16, 0.07, 0x7a5a3a); }
    B(1.25, 0.1, 0.5, 0.9, 0.06, 0.4, 0xb08655); for (const dx of [-0.35, 0.35]) B(1.25 + dx, -0.05, 0.5, 0.07, 0.3, 0.07, 0x7a5a3a);
    tree(-1.4, -0.8, 1.2); tree(1.2, -1.1, 1); B(-1.1, 0.12, 1.0, 0.36, 0.24, 0.3, 0x9aa3ad); B(0.6, 0.1, 1.5, 0.26, 0.2, 0.24, 0x8a929c);
    fish(-0.2, 0.09, -0.2, 0xf2b04a, 0.4); fish(0.5, 0.09, 0.2, 0xd9534f, 2.2);
  } else if (id === 'river') {
    B(0, -0.25, 0, 3.6, 0.5, 3.0, 0x7fb86a);
    for (let i = 0; i < 9; i += 1) { const z = -1.4 + i * 0.35; const x = Math.sin(i * 0.7) * 0.45; B(x, 0.02, z, 1.0, 0.06, 0.37, 0x4fa8d8, 0.88); B(x, -0.08, z, 1.0, 0.16, 0.37, 0x2a70a0); if (i % 2) B(x + 0.15, 0.06, z, 0.3, 0.02, 0.06, 0xffffff, 0.8); }
    for (const [x, z, s] of [[-0.25, -0.6, 0.2], [0.35, 0.3, 0.16], [-0.1, 1.0, 0.18]]) B(x, 0.1, z, s, s * 0.8, s, 0x9aa3ad);
    B(0.1, 0.34, 0.05, 1.6, 0.07, 0.44, 0xb08655); for (const dx of [-0.75, 0.75]) { B(0.1 + dx, 0.2, 0.05, 0.08, 0.4, 0.44, 0x8d6642); B(0.1 + dx, 0.5, -0.14, 0.05, 0.28, 0.05, 0x8d6642); B(0.1 + dx, 0.5, 0.24, 0.05, 0.28, 0.05, 0x8d6642); }
    B(0.1, 0.62, -0.14, 1.6, 0.04, 0.05, 0x8d6642); B(0.1, 0.62, 0.24, 1.6, 0.04, 0.05, 0x8d6642);
    tree(-1.4, -1.0, 1.2); tree(-1.2, 0.9, 1); tree(1.4, -0.7, 1.1, 0x5fae4b); tree(1.3, 1.1, 0.9);
    for (const [x, z] of [[-1.5, 0.1], [1.5, 0.4], [-0.9, -1.3]]) B(x, 0.06, z, 0.08, 0.1, 0.08, 0xffd447);
    fish(0.2, 0.09, -1.0, 0xc8d8e8, 1.5); fish(-0.2, 0.09, 0.7, 0xf2b04a, 1.7);
  } else {
    B(0, -0.3, 0, 3.8, 0.5, 3.2, 0x163a6a); B(0, 0, 0, 3.8, 0.1, 3.2, 0x2f6fd0, 0.85);
    for (let i = 0; i < 9; i += 1) B(-1.5 + (i * 0.83) % 3.1, 0.07, -1.3 + (i * 0.57) % 2.7, 0.44, 0.03, 0.07, 0xffffff, 0.7);
    B(-1.5, 0.05, 0.9, 1.0, 0.3, 1.4, 0xe6d3a8);
    for (let i = 0; i < 6; i += 1) { B(-0.85 + i * 0.36, 0.28, 0.5, 0.34, 0.06, 0.5, 0xb08655); if (i % 2 === 0) for (const dz of [-0.2, 0.2]) B(-0.85 + i * 0.36, 0.08, 0.5 + dz, 0.07, 0.4, 0.07, 0x7a5a3a); }
    C(1.05, 0.5, 0.5, 0.03, 0.5, 0x8d6642); C(1.05, 0.78, 0.5, 0.07, 0.1, 0xffd447, 1, 0.8);
    C(-1.55, 0.7, 1.2, 0.2, 1.0, 0xfbfbf7); C(-1.55, 0.55, 1.2, 0.205, 0.2, 0xd9534f); C(-1.55, 1.28, 1.2, 0.16, 0.18, 0xffd447, 1, 0.9); const roof = new THREE.Mesh(cone, mat(0xd9534f)); roof.position.set(-1.55, 1.52, 1.2); roof.scale.set(0.22, 0.3, 0.22); g.add(roof);
    B(0.9, 0.16, -0.8, 0.7, 0.2, 0.34, 0x8d6642); B(0.9, 0.5, -0.8, 0.04, 0.6, 0.04, 0x7a5a3a); B(1.04, 0.52, -0.8, 0.26, 0.4, 0.02, 0xfbfbf7);
    for (const [x, y, z] of [[-1.2, 1.9, -1.2], [0.2, 2.2, -1.4], [1.3, 1.8, -0.9], [0.9, 2.3, 0.4], [-0.4, 2.0, 0.9]]) B(x, y, z, 0.07, 0.07, 0.07, 0xffe9a8, 1, 1);
    fish(0.1, 0.09, -0.3, 0xffb066, 0.3); fish(1.2, 0.09, 0.9, 0x8ff0c8, 2.6); fish(-0.4, 0.09, -1.1, 0xc8b8ff, 1.1);
  }
  g.scale.setScalar(0.92); g.rotation.x = 0.12;
  g.userData.offsetY = -0.45; g.userData.spin = true; g.position.y = -0.45;
  return g;
}
