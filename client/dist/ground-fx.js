// 地面の 手ざわり（2026-11：「道路も、草も 超リアルに。でも 重く ならない ように」）。
//
// 島の 地面は 色つきの 箱の タイル（InstancedMesh・色ごとに 1 回の 描画）。その 材質に、世界の 位置（x・z）で ひく
// こまかい もよう（草の すじ・土の つぶ・明るい ところと 暗い ところ）を **かけ算** する。タイルの さかい目を またいで つながる。
// 描く 回数も 頂点も ふやさない。絵は 256px の canvas 1 まいを みんなで 使う。
import * as THREE from './three.module.js';

let noise = null;
function noiseTexture() {
  if (noise !== null) return noise;
  try {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    let s = 99; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    // 大きな むら（明るい ところ・暗い ところ）。はしで つながる ように 4 すみにも かく。
    for (let i = 0; i < 46; i += 1) { const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 44, l = rnd() > 0.5 ? 255 : 0; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(${l},${l},${l},0.16)`); gr.addColorStop(1, `rgba(${l},${l},${l},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } }
    // 草の すじ・つぶ。
    for (let i = 0; i < 5200; i += 1) { const x = rnd() * S, y = rnd() * S, l = rnd() > 0.5 ? 255 : 0, a = 0.05 + rnd() * 0.16, len = 2 + rnd() * 5, t = rnd() * 6.283; g.strokeStyle = `rgba(${l},${l},${l},${a})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * len, y + Math.sin(t) * len); g.stroke(); }
    for (let i = 0; i < 2600; i += 1) { const l = rnd() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${l},${l},${l},${0.06 + rnd() * 0.14})`; g.fillRect(rnd() * S, rnd() * S, 1.2, 1.2); }
    noise = new THREE.CanvasTexture(c); noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.anisotropy = 4;
  } catch { noise = false; }
  return noise;
}

const made = new Map();
// base（色つきの MeshStandardMaterial）から、もようつきの 材質を 1 つ 作る（同じ 色は 使いまわす）。
export function groundMaterial(base) {
  const tex = noiseTexture(); if (!tex) return base;
  const key = base.color.getHex();
  if (made.has(key)) return made.get(key);
  const m = base.clone(); m.map = tex;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying vec2 vWxz;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 gwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #else
        vec4 gwp = modelMatrix * vec4(transformed, 1.0);
      #endif
      vWxz = gwp.xz;`);
    sh.fragmentShader = `varying vec2 vWxz;\n${sh.fragmentShader}`.replace('#include <map_fragment>',
      `float gfine = texture2D(map, vWxz * 0.21).r; float gwide = texture2D(map, vWxz * 0.037 + 0.31).r;
       diffuseColor.rgb *= mix(0.74, 1.22, gfine) * mix(0.86, 1.12, gwide);`);
  };
  m.customProgramCacheKey = () => 'uspeak-ground';
  made.set(key, m);
  return m;
}
