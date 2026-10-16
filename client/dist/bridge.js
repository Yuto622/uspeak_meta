// U-Speak島と メインの島を つなぐ 木の 橋（2026-10）。
//
// メインの島は U-Speak島の すぐ北（rpg-data.js の HUBS と main_island.json の island が 同じ 位置）。
// U-Speak島の 北の 道（x=5）から、メインの島の 船着き場（ローカル 31, 37）まで 歩いて わたれる。
// 橋の 上は どちらの 島の 当たり判定よりも 先に「歩ける」（game.js の blocked）。
// まんなかを こえると いる 島が きりかわる（ひこうきは とばない。rpg.activate(id, false)）。
import * as THREE from './three.module.js';

export const BRIDGE = { x: 5, south: -18.5, north: -44, half: 1.7, mid: -28 };

export function onBridge(x, z) {
  return Math.abs(x - BRIDGE.x) < BRIDGE.half && z < BRIDGE.south && z > BRIDGE.north;
}

// いまの 島と 足もとから、つぎに いる べき 島。かわらなければ null。行き来が ちらつかないよう 2 だけ あそびを とる。
export function crossing(current, x, z) {
  if (Math.abs(x - BRIDGE.x) > 4) return null;
  if (current === 'willow' && z < BRIDGE.mid - 1 && z > BRIDGE.north - 4) return 'main';
  if (current === 'main' && z > BRIDGE.mid + 1 && z < BRIDGE.south + 3) return 'willow';
  return null;
}

export function buildBridge(scene) {
  const g = new THREE.Group();
  g.name = 'main-bridge';
  const wood = new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6b4826, roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84d, emissiveIntensity: 0.9 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const put = (m, x, y, z, w, h, d) => { const o = new THREE.Mesh(box, m); o.position.set(x, y, z); o.scale.set(w, h, d); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const { x, south, north, half } = BRIDGE;
  const len = south - north;
  // 板（すこし ずつ 色を かえて、すきまを あける）。まんなかが ほんの すこし 高い 弓なり。
  for (let z = north + 0.4; z < south; z += 0.9) {
    const u = (z - north) / len;
    const y = 0.22 + Math.sin(u * Math.PI) * 0.35;
    put(Math.round(z * 3) % 2 ? wood : dark, x, y, z, half * 2 + 0.3, 0.16, 0.78);
  }
  // 手すりの 柱・なわ・あかり。
  for (const sx of [-1, 1]) {
    for (let z = north + 0.6; z <= south; z += 3.2) {
      const u = (z - north) / len;
      const y = 0.22 + Math.sin(u * Math.PI) * 0.35;
      put(dark, x + sx * (half + 0.1), y - 1.2, z, 0.28, 3.2, 0.28);
      put(dark, x + sx * (half + 0.1), y + 0.55, z, 0.22, 0.9, 0.22);
    }
    const segs = 18;
    for (let i = 0; i < segs; i++) {
      const z = north + (i + 0.5) / segs * len;
      const u = (z - north) / len;
      put(rope, x + sx * (half + 0.1), 0.22 + Math.sin(u * Math.PI) * 0.35 + 0.85, z, 0.08, 0.08, len / segs + 0.05);
    }
    for (const z of [north + 1, south - 0.6]) {
      put(dark, x + sx * (half + 0.1), 1.4, z, 0.3, 2.6, 0.3);
      put(glow, x + sx * (half + 0.1), 2.85, z, 0.42, 0.42, 0.42);
    }
  }
  scene.add(g);
  return g;
}
