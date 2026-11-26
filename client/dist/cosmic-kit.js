// 異次元の 内装の 共通の 部品（2026-11：「内装の のこりも 異次元に」）。
// island-interior.js と 同じ 考え：宇宙の 背景・星・色を 宇宙に よせる。光は ふやさない（emissive と Points 1 つだけ）。
import * as THREE from './three.module.js';
import { createStarfield } from './starfield.js';

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

// 星は starfield.js（まるく やわらかい 点・ほんものと 同じ 明るさの 分布・色・またたき・天の川の 帯）。
// 前は 四角い PointsMaterial 420 こ。呼び方は 同じ（count は「目だつ 星」の 数の 目安＝じっさいは 暗い 星を たくさん 足す）。描画は 1 回の まま。
export function addStars(scene, { count = 420, radius = 60, seed = 5 } = {}) {
  const sky = createStarfield({ count: count * 6, band: count * 4, radius, seed, catalog: false, milkyWay: false, horizon: [-3, -2], scale: 1.15, gain: 1.1, twinkle: 0.8, auto: true });
  const stars = sky.points;
  stars.rotation.set(0.9, 0.4, 0.5);   // 天の川の 帯を ななめに
  scene.add(stars);
  return stars;
}
