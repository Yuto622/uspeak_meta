// 異次元の 内装の 共通の 部品（2026-11：「内装の のこりも 異次元に」）。
// island-interior.js と 同じ 考え：宇宙の 背景・星・色を 宇宙に よせる。光は ふやさない（emissive と Points 1 つだけ）。
import * as THREE from './three.module.js';

export const SPACE_BG = 0x08160f;
const SPACE = new THREE.Color(0x1f5a45);
const cache = new Map();
// はだ・かみの 色は そのまま（顔が むらさきに ならない ように）。
const KEEP = new Set([0xe4bc98, 0xe6be9a, 0xe6c299, 0xffffff]);

export function cosmicColor(color, amount = 0.42) {
  if (KEEP.has(color)) return color;
  const key = color + ':' + amount;
  if (!cache.has(key)) cache.set(key, new THREE.Color(color).lerp(SPACE, amount).offsetHSL(0, 0.12, 0).getHex());
  return cache.get(key);
}

export function addStars(scene, { count = 420, radius = 60, seed = 5 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = rnd() * Math.PI * 2; const e = (rnd() - 0.5) * 2.6; const r = radius + rnd() * radius * 0.5;
    pts.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff4d6, size: 0.5, sizeAttenuation: true }));
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}
