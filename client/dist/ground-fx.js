// 地面の 手ざわり（2026-11：「地面の草、道路も 超リアルに。でも 重く ならない ように」）。
//
// 島の 地面は 色つきの 箱の タイル（InstancedMesh・色ごとに 1 回の 描画）。その 材質に、世界の 位置（x・z）で ひく もようを かける。
// 4 しゅるい：grass（草の 葉の すじ・クローバー・色の むら）／asphalt（つぶ・ひび・つぎあて）／cobble（石だたみ・目地）／sand（すな・土の つぶと 風の あと）。
// もようは 明るさ（かけ算）と でこぼこ（法線を 少し かたむける＝光が あたると 石や 葉が うきあがる）の 両方に 使う。
// 描く 回数も 頂点も ふやさない。絵は 1 しゅるい 512px の canvas 1 まいを みんなで 使う（もようは はしで つながる）。
// grassTufts()：草の 上に 立つ 小さな 草むら（板 3 まい × 数百・InstancedMesh 1 つ・影は 落とさない・風で ゆれる）。
import * as THREE from './three.module.js';

const S = 512;
const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
// はしで つながる ように、はしに 近い ものは 反対がわにも かく。
const wrap = (x, y, r, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -r || x + ox > S + r || y + oy < -r || y + oy > S + r) continue; fn(x + ox, y + oy); } };
const grey = (l, a) => `rgba(${l},${l},${l},${a})`;
function blotches(g, rnd, n, r0, r1, a) {
  for (let i = 0; i < n; i += 1) { const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0), l = rnd() > 0.5 ? 255 : 0; wrap(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, grey(l, a)); gr.addColorStop(1, grey(l, 0)); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
}
const PAINT = {
  grass(g, rnd) {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
    blotches(g, rnd, 60, 30, 90, 0.2);
    // 葉：根もとが 暗く 先が 明るい、少し まがった すじ。向きは 上むきに かたよらせる（芝の 目）。
    g.lineCap = 'round';
    for (let i = 0; i < 9000; i += 1) {
      const x = rnd() * S, y = rnd() * S, t = -1.57 + (rnd() - 0.5) * 2.4, len = 7 + rnd() * 13, bend = (rnd() - 0.5) * 8, l = 90 + Math.floor(rnd() * 165);
      wrap(x, y, 24, (px, py) => { g.strokeStyle = grey(l, 0.5 + rnd() * 0.4); g.lineWidth = 1 + rnd() * 1.4; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(t) * len * 0.5 + bend, py + Math.sin(t) * len * 0.5, px + Math.cos(t) * len, py + Math.sin(t) * len); g.stroke(); });
    }
    // 暗い すきま（土が のぞく）と クローバーの 明るい 点。
    for (let i = 0; i < 700; i += 1) { g.fillStyle = grey(20, 0.25 + rnd() * 0.3); g.fillRect(rnd() * S, rnd() * S, 2, 3); }
    for (let i = 0; i < 90; i += 1) { const x = rnd() * S, y = rnd() * S; wrap(x, y, 6, (px, py) => { g.fillStyle = grey(245, 0.75); for (let k = 0; k < 3; k += 1) { g.beginPath(); g.arc(px + Math.cos(k * 2.09) * 2.6, py + Math.sin(k * 2.09) * 2.6, 2.4, 0, 7); g.fill(); } }); }
  },
  asphalt(g, rnd) {
    g.fillStyle = '#7c7c7c'; g.fillRect(0, 0, S, S);
    blotches(g, rnd, 40, 40, 120, 0.14);
    // 骨材の つぶ（明るい 小石・暗い あな）。
    for (let i = 0; i < 26000; i += 1) { const l = rnd() > 0.45 ? 150 + Math.floor(rnd() * 105) : Math.floor(rnd() * 70); g.fillStyle = grey(l, 0.25 + rnd() * 0.5); const r = 0.6 + rnd() * 1.5; g.fillRect(rnd() * S, rnd() * S, r, r); }
    // つぎあて（少し 暗い 四角）と ひび。
    for (let i = 0; i < 3; i += 1) { const x = rnd() * S, y = rnd() * S, w = 60 + rnd() * 90, h = 40 + rnd() * 70; wrap(x, y, 160, (px, py) => { g.fillStyle = grey(0, 0.13); g.fillRect(px, py, w, h); g.strokeStyle = grey(0, 0.25); g.lineWidth = 1.5; g.strokeRect(px, py, w, h); }); }
    for (let i = 0; i < 7; i += 1) {
      const pts = []; let x = rnd() * S, y = rnd() * S, t = rnd() * 6.28;
      for (let k = 0; k < 14; k += 1) { pts.push([x, y]); t += (rnd() - 0.5) * 1.2; x += Math.cos(t) * 16; y += Math.sin(t) * 16; }
      wrap(pts[0][0], pts[0][1], 240, (px, py) => { g.strokeStyle = grey(0, 0.55); g.lineWidth = 1.3; g.beginPath(); pts.forEach(([qx, qy], k) => g[k ? 'lineTo' : 'moveTo'](qx - pts[0][0] + px, qy - pts[0][1] + py)); g.stroke(); });
    }
  },
  cobble(g, rnd) {
    g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, S, S);                     // 目地（暗い）
    const rows = 8, h = S / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = (r % 2) * 30 - rnd() * 20; const y = r * h;
      while (x < S) {
        const w = 44 + rnd() * 50, l = 120 + Math.floor(rnd() * 110), gap = 5, rad = 9 + rnd() * 6, jy = (rnd() - 0.5) * 3;
        for (const ox of [-S, 0, S]) {
          const px = x + ox + gap / 2, py = y + gap / 2 + jy, pw = w - gap, ph = h - gap;
          if (px > S || px + pw < 0) continue;
          g.fillStyle = grey(l, 1); g.beginPath(); g.moveTo(px + rad, py); g.arcTo(px + pw, py, px + pw, py + ph, rad); g.arcTo(px + pw, py + ph, px, py + ph, rad); g.arcTo(px, py + ph, px, py, rad); g.arcTo(px, py, px + pw, py, rad); g.fill();
          // 石の ふちは 暗く（まるみ）、上の ふちは 明るく。
          g.strokeStyle = grey(0, 0.28); g.lineWidth = 3; g.stroke();
          g.strokeStyle = grey(255, 0.22); g.lineWidth = 1.5; g.beginPath(); g.moveTo(px + rad, py + 3); g.lineTo(px + pw - rad, py + 3); g.stroke();
        }
        x += w;
      }
    }
    for (let i = 0; i < 9000; i += 1) { g.fillStyle = grey(rnd() > 0.5 ? 255 : 0, 0.05 + rnd() * 0.12); g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
    blotches(g, rnd, 30, 30, 80, 0.1);
  },
  sand(g, rnd) {
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    blotches(g, rnd, 50, 30, 100, 0.13);
    // 風の あと（ゆるい 波の すじ）。
    for (let k = 0; k < 16; k += 1) { const y0 = (k / 16) * S, ph = rnd() * 6; for (const oy of [-S, 0, S]) { g.strokeStyle = grey(k % 2 ? 255 : 0, 0.1); g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= S; x += 8) g[x ? 'lineTo' : 'moveTo'](x, y0 + oy + Math.sin((x / S) * 6.283 * 2 + ph) * 7); g.stroke(); } }
    for (let i = 0; i < 30000; i += 1) { g.fillStyle = grey(rnd() > 0.5 ? 255 : 0, 0.06 + rnd() * 0.2); g.fillRect(rnd() * S, rnd() * S, 1.2, 1.2); }
    for (let i = 0; i < 120; i += 1) { const x = rnd() * S, y = rnd() * S; g.fillStyle = grey(rnd() > 0.5 ? 230 : 60, 0.5); g.beginPath(); g.ellipse(x, y, 1.5 + rnd() * 2, 1 + rnd() * 1.5, rnd() * 3, 0, 7); g.fill(); }   // 小石
  },
};
// しゅるいごとの かけかた：scale＝世界の 1 が 絵の どれだけか、lo..hi＝明るさの はば、bump＝でこぼこの 強さ、wide＝大きな むら。
const KIND = {
  grass: { scale: 0.085, lo: 0.8, hi: 1.22, bump: 0, wide: 0.16, warm: 1, soft: 2.4 },
  asphalt: { scale: 0.07, lo: 0.9, hi: 1.1, bump: 0, wide: 0.08, warm: 0, soft: 3.2 },
  cobble: { scale: 0.15, lo: 0.7, hi: 1.16, bump: 0.6, wide: 0.06, warm: 0, soft: 1.5 },
  sand: { scale: 0.065, lo: 0.9, hi: 1.1, bump: 0, wide: 0.08, warm: 0, soft: 3.2 },
};
const textures = {};
function textureOf(kind) {
  if (kind in textures) return textures[kind];
  try {
    const c = document.createElement('canvas'); c.width = c.height = S; PAINT[kind](c.getContext('2d'), rng(99 + kind.length * 7));
    // こまかい つぶは 画面で ざらざらの 砂ぼこりに 見える（教室から 言われた）。いちど 小さく して もどし、やわらかい むらだけ のこす。
    const soft = KIND[kind].soft || 1, n = Math.round(S / soft), tmp = document.createElement('canvas'); tmp.width = tmp.height = n;
    const tg = tmp.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(c, 0, 0, n, n);
    const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(tmp, 0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; textures[kind] = t;
  } catch { textures[kind] = false; }
  return textures[kind];
}
// 色から しゅるいを 決める（みどり＝草・くらい 灰色＝アスファルト・ほかは すな）。
export function groundKind(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255, max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (g >= r * 1.04 && g > b * 1.12) return 'grass';
  if (max - min < 0.06 && max < 0.7 && max > 0.25) return 'asphalt';
  return 'sand';
}

const made = new Map();
// base（色つきの MeshStandardMaterial）から、もようつきの 材質を 1 つ 作る（同じ 色・同じ しゅるいは 使いまわす）。kind を 書かなければ 色から 決める。
export function groundMaterial(base, kind) {
  const hex = base.color.getHex(); const k = KIND[kind] ? kind : groundKind(hex);
  const tex = textureOf(k); if (!tex) return base;
  const key = `${k}:${hex}`; if (made.has(key)) return made.get(key);
  const o = KIND[k], f = (n) => n.toFixed(3);
  const m = base.clone(); m.map = tex; m.extensions = { derivatives: true };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying vec2 vWxz;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 gwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #else
        vec4 gwp = modelMatrix * vec4(transformed, 1.0);
      #endif
      vWxz = gwp.xz;`);
    sh.fragmentShader = `varying vec2 vWxz;\n${sh.fragmentShader}`
      .replace('#include <map_fragment>',
        `float gfine = texture2D(map, vWxz * ${f(o.scale)}).r;
         float gwide = texture2D(map, vWxz * 0.031 + 0.31).r;
         float gpatch = texture2D(map, vWxz * 0.0083 + 0.67).r;
         diffuseColor.rgb *= mix(${f(o.lo)}, ${f(o.hi)}, gfine) * mix(${f(1 - o.wide)}, ${f(1 + o.wide)}, gwide);
         ${o.warm ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.06, 0.62), smoothstep(0.42, 0.62, gpatch) * 0.55);' : ''}`)
      .replace('#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         { vec2 gdh = vec2(dFdx(gfine), dFdy(gfine)) * ${f(o.bump)};
           vec3 gsx = dFdx(-vViewPosition), gsy = dFdy(-vViewPosition);
           vec3 gr1 = cross(gsy, normal), gr2 = cross(normal, gsx); float gdet = dot(gsx, gr1);
           normal = normalize(abs(gdet) * normal - sign(gdet) * (gdh.x * gr1 + gdh.y * gr2)); }`);
  };
  m.customProgramCacheKey = () => `uspeak-ground-${k}`;
  made.set(key, m);
  return m;
}

// 草むら：tufts = [{ x, y, z, s, color }]。板 3 まいを 星の 形に くんだ 草を InstancedMesh 1 つで。影は 落とさない。
let bladeTex = null;
function bladeTexture() {
  if (bladeTex !== null) return bladeTex;
  try {
    const W = 128, c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'), rnd = rng(31);
    // 葉は 太めに 9 まい（細い 葉は 遠くで ちらちら して 砂ぼこりに 見える）。根もとは 地面の 色に とけこむ 明るさ。
    for (let i = 0; i < 9; i += 1) {
      const x = 18 + rnd() * 92, h = 56 + rnd() * 66, lean = (rnd() - 0.5) * 50, w = 13 + rnd() * 9;
      const gr = g.createLinearGradient(0, W, 0, W - h); gr.addColorStop(0, '#b9c4a8'); gr.addColorStop(0.55, '#e4ecd6'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w / 2, W); g.quadraticCurveTo(x - w / 3 + lean * 0.3, W - h * 0.6, x + lean, W - h); g.quadraticCurveTo(x + w / 3 + lean * 0.3, W - h * 0.6, x + w / 2, W); g.fill();
      g.strokeStyle = 'rgba(120,135,100,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, W); g.quadraticCurveTo(x + lean * 0.3, W - h * 0.6, x + lean, W - h); g.stroke();   // 葉の すじ
    }
    bladeTex = new THREE.CanvasTexture(c); bladeTex.colorSpace = THREE.SRGBColorSpace;
  } catch { bladeTex = false; }
  return bladeTex;
}
export function grassTufts(tufts) {
  const map = bladeTexture(); if (!map || !tufts.length) return null;
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = k * 4;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    // 板の 向きに かかわらず 地面と 同じ 明るさ（上むきの 法線）。うらがえった 面が 黒く ならない。
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vec3 nonPerturbedNormal = normal;');
    sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float gph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        transformed.x += sin(uTime * 1.7 + gph) * 0.12 * position.y * position.y;
        transformed.z += cos(uTime * 1.3 + gph * 1.3) * 0.08 * position.y * position.y;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'uspeak-tufts';
  const mesh = new THREE.InstancedMesh(geo, mat, tufts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  tufts.forEach((t, i) => {
    q.setFromAxisAngle(up, t.turn || 0); m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * (t.tall || 0.7), t.s)); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setHex(t.color).multiplyScalar(t.tint || 1.1));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.userData.update = (t) => { time.value = t; };
  return mesh;
}
