// ほんものの ような 星空（2026-11：「これを 超リアルの 星空に」）。
//
// ・前は 空の シェーダーの 四角い 点（まばら）と、内装の PointsMaterial（四角）だった。
// ・ここは **Points 1 つ ＋ 天の川の 球 1 つ＝描画 2 回**。光も 後処理も 足さない。
//   - 星：等級の 分布は ほんものと 同じ（暗い 星が たくさん・明るい 星は 少し＝ 1 等級 明るく なると 数が 約 1/3）。
//     色は 星の 温度（青白 → 白 → 黄 → オレンジ）。まるく やわらかい 点（gl_PointCoord）。大きさは 画面の ピクセル。
//     またたきは 頂点シェーダーの sin 2 つ（地平線に 近いほど 強い）。1.6px より 小さい 星は 大きさを とめて うすく する。
//   - 明るい 星と 星座（オリオン・ほくとしちせい・カシオペヤ・さそり・はくちょう）は **ほんものの 位置**（赤経・赤緯）。
//   - 天の川：銀河の 座標で 星を こく まく ＋ canvas の 絵（もや・暗い 帯）。canvas が ない（Node の テスト）ときは 星だけ。
// ・座標：天の 北極が +Y。`tilt`（緯度）と `spin`（恒星時）で 空を まわす（`setSky`）。北は -Z。
// ・使う ところ：atmosphere.js（外の 夜空）・cosmic-kit.js の addStars（内装）・planetarium.js（ドーム）。
import * as THREE from './three.module.js';

const DEG = Math.PI / 180;
// 赤経（時）・赤緯（度）→ むき（北極＝+Y。中から 見て 赤経は 左＝東へ ふえる）。
export function starVector(raHours, decDeg, out = new THREE.Vector3()) {
  const a = raHours * 15 * DEG, d = decDeg * DEG;
  return out.set(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a));
}

// 星座（学ぶ 中身＝英語と 日本語を いつも 両方 見せる。lang.json には 入れない）。
// stars＝[赤経 h, 赤緯 °, 等級, 色（0＝青白 … 1＝オレンジ）]。lines＝stars の 番号の 組。
export const CONSTELLATIONS = [
  { id: 'orion', en: 'Orion', ja: 'オリオンざ',
    stars: [[5.919, 7.41, 0.5, 0.95], [5.242, -8.2, 0.13, 0.05], [5.419, 6.35, 1.64, 0.1], [5.796, -9.67, 2.06, 0.1], [5.679, -1.94, 1.77, 0.08], [5.604, -1.2, 1.69, 0.08], [5.533, -0.3, 2.23, 0.08], [5.585, 9.93, 3.4, 0.1]],
    lines: [[0, 2], [0, 4], [2, 6], [4, 5], [5, 6], [4, 3], [6, 1], [3, 1], [7, 0], [7, 2]] },
  { id: 'big_dipper', en: 'Big Dipper', ja: 'ほくとしちせい',
    stars: [[11.062, 61.75, 1.79, 0.7], [11.031, 56.38, 2.37, 0.3], [11.897, 53.69, 2.44, 0.3], [12.257, 57.03, 3.31, 0.32], [12.9, 55.96, 1.77, 0.3], [13.399, 54.93, 2.27, 0.3], [13.792, 49.31, 1.86, 0.12]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
  { id: 'cassiopeia', en: 'Cassiopeia', ja: 'カシオペヤざ',
    stars: [[0.153, 59.15, 2.27, 0.45], [0.675, 56.54, 2.23, 0.75], [0.945, 60.72, 2.47, 0.1], [1.43, 60.24, 2.68, 0.35], [1.907, 63.67, 3.38, 0.12]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { id: 'scorpius', en: 'Scorpius', ja: 'さそりざ',
    stars: [[16.49, -26.43, 0.96, 1], [16.091, -19.81, 2.62, 0.1], [16.006, -22.62, 2.32, 0.1], [15.981, -26.11, 2.89, 0.1], [16.353, -25.59, 2.89, 0.1], [16.598, -28.22, 2.82, 0.1],
      [16.836, -34.29, 2.29, 0.75], [16.864, -38.05, 3.04, 0.1], [16.91, -42.36, 3.62, 0.8], [17.203, -43.24, 3.33, 0.5], [17.622, -43.0, 1.87, 0.5], [17.793, -40.13, 3.03, 0.5], [17.708, -39.03, 2.41, 0.1], [17.56, -37.1, 1.63, 0.1], [17.513, -37.3, 2.69, 0.1]],
    lines: [[1, 2], [2, 3], [2, 4], [4, 0], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]] },
  { id: 'cygnus', en: 'Cygnus', ja: 'はくちょうざ',
    stars: [[20.69, 45.28, 1.25, 0.3], [20.37, 40.26, 2.2, 0.55], [20.77, 33.97, 2.46, 0.75], [19.75, 45.13, 2.87, 0.25], [19.512, 27.96, 3.08, 0.8], [19.938, 35.08, 3.89, 0.75], [21.216, 30.23, 3.2, 0.7], [19.495, 51.73, 3.79, 0.3], [19.285, 53.37, 3.77, 0.7]],
    lines: [[0, 1], [1, 5], [5, 4], [3, 1], [1, 2], [2, 6], [3, 7], [7, 8]] },
];
// 星座の ほかの 明るい 星（シリウス・カノープス・アークトゥルス・ベガ・カペラ・プロキオン・アルタイル・アルデバラン・スピカ・
// ポルックス・フォーマルハウト・レグルス・カストル・北極星・アケルナル）。
const BRIGHT = [[6.752, -16.72, -1.46, 0.2], [6.399, -52.7, -0.74, 0.35], [14.261, 19.18, -0.05, 0.85], [18.616, 38.78, 0.03, 0.22], [5.278, 46.0, 0.08, 0.6], [7.655, 5.22, 0.34, 0.4],
  [19.846, 8.87, 0.76, 0.3], [4.599, 16.51, 0.86, 0.95], [13.42, -11.16, 0.97, 0.05], [7.755, 28.03, 1.14, 0.75], [22.961, -29.62, 1.16, 0.25], [10.14, 11.97, 1.35, 0.1], [7.577, 31.89, 1.58, 0.22], [2.53, 89.26, 1.98, 0.5], [1.629, -57.24, 0.46, 0.05]];

// 星の 色（0＝青白 … 1＝オレンジ）。
const TINT = [[0.66, 0.78, 1.0], [0.86, 0.91, 1.0], [1.0, 0.98, 0.94], [1.0, 0.9, 0.72], [1.0, 0.74, 0.5]];
function tint(t, out, o) {
  const f = Math.max(0, Math.min(0.9999, t)) * (TINT.length - 1), i = Math.floor(f), k = f - i, a = TINT[i], b = TINT[i + 1];
  out[o] = a[0] + (b[0] - a[0]) * k; out[o + 1] = a[1] + (b[1] - a[1]) * k; out[o + 2] = a[2] + (b[2] - a[2]) * k;
}
// 等級 → 画面の 大きさ（px）と 明るさ。
function look(mag) {
  const v = Math.max(0, Math.min(1, (6.6 - mag) / 8));
  return [1.05 + 6.2 * v ** 1.7, 0.42 + 0.58 * v ** 0.75];
}

// 銀河の 座標 → 赤道の 座標（銀河の 北極と 中心の むき）。
const GZ = starVector(12.857, 27.128).normalize();
const GX = starVector(17.761, -28.936); GX.addScaledVector(GZ, -GX.dot(GZ)).normalize();
const GY = new THREE.Vector3().crossVectors(GZ, GX).normalize();
const galactic = (l, b, out) => out.set(0, 0, 0).addScaledVector(GX, Math.cos(b) * Math.cos(l)).addScaledVector(GY, Math.cos(b) * Math.sin(l)).addScaledVector(GZ, Math.sin(b));

const VERT = `
attribute vec4 aStar;   // 大きさ(px)・明るさ・またたきの たね・星座の 番号（-1＝なし）
attribute vec3 aTint;
uniform float uTime, uFade, uPx, uScale, uTwinkle, uHi, uHiK, uGain;
uniform vec2 uHorizon;
varying vec3 vTint; varying float vAlpha;
void main(){
  vec3 dir = normalize(mat3(modelMatrix) * position);
  float up = smoothstep(uHorizon.x, uHorizon.y, dir.y);
  float low = 1. - clamp(dir.y, 0., 1.);
  float tw = sin(uTime * (1.7 + aStar.z * 2.6) + aStar.z * 61.) * .6 + sin(uTime * (4.3 + aStar.z * 3.1) + aStar.z * 17.) * .4;
  float flick = 1. + uTwinkle * (.16 + .34 * low * low) * tw;
  float hi = uHiK * step(abs(aStar.w - uHi), .5);
  float s = aStar.x * uScale * (1. + hi * .7);
  float k = min(1., s / 1.6);
  vAlpha = min(1.6, aStar.y * uGain * (1. + hi * .8)) * k * k * flick * up * uFade;
  vTint = mix(aTint, vec3(1.), .25 * aStar.y);
  gl_PointSize = max(s, 1.6) * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;
const FRAG = `
precision mediump float;
varying vec3 vTint; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float a = exp(-d * d * 4.2) * smoothstep(1., .72, d);   // まるい しん ＋ やわらかい ふち
  if (a * vAlpha < .004) discard;
  gl_FragColor = vec4(vTint * a * vAlpha, 1.);
}`;

const MW_VERT = `varying vec3 vLocal; varying float vUp; uniform vec2 uHorizon;
void main(){ vLocal = position; vec3 dir = normalize(mat3(modelMatrix) * position); vUp = smoothstep(uHorizon.x, uHorizon.y + .1, dir.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const MW_FRAG = `precision mediump float;
varying vec3 vLocal; varying float vUp; uniform sampler2D uMap; uniform mat3 uGal; uniform float uFade, uGain;
void main(){
  vec3 g = uGal * normalize(vLocal);
  float b = asin(clamp(g.z, -1., 1.));
  float v = b / 1.5708 + .5;                       // 銀緯 ±45° が 絵の 上下
  if (v < 0. || v > 1.) discard;
  float u = atan(g.y, g.x) / 6.2831853 + .5;
  vec3 c = texture2D(uMap, vec2(u, v)).rgb;
  gl_FragColor = vec4(c * uGain * uFade * vUp, 1.);
}`;

// 天の川の 絵（銀河の 座標：よこ＝銀経 360°・まんなかが 銀河の 中心、たて＝銀緯 ±45°）。
function milkyTexture(seed, size) {
  try {
    const W = size, H = size / 4, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); if (!g || !g.createRadialGradient) return null;
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const blob = (x, y, r, rgb, a) => {
      for (const ox of [0, W, -W]) {
        if (x + ox + r < 0 || x + ox - r > W) continue;
        const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
      }
    };
    g.globalCompositeOperation = 'lighter';
    // うすい 光の 帯（ぜんたい）＋ 中心の ふくらみ ＋ 星の 雲。
    for (let i = 0; i < 420; i += 1) blob(rnd() * W, H / 2 + gauss() * H * 0.085, H * (0.1 + rnd() * 0.16), '150,165,205', 0.035);
    for (let i = 0; i < 260; i += 1) { const x = W / 2 + gauss() * W * 0.13; blob(x, H / 2 + gauss() * H * 0.1, H * (0.08 + rnd() * 0.2), '255,226,186', 0.022); }
    for (let i = 0; i < 520; i += 1) {
      const x = W / 2 + gauss() * W * 0.3, near = Math.exp(-(((x - W / 2) / (W * 0.2)) ** 2));
      blob(x, H / 2 + gauss() * H * (0.045 + 0.03 * near), H * (0.03 + rnd() * 0.07), near > 0.5 ? '255,236,206' : '206,218,255', 0.045 + 0.012 * near);
    }
    // 暗い 帯（ちりの 雲）：まんなかを うねって 走る。
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 300; i += 1) {
      const t = rnd(), x = W * (0.28 + t * 0.5), y = H / 2 + Math.sin(t * 9 + 1.3) * H * 0.022 + Math.sin(t * 23) * H * 0.012 + gauss() * H * 0.012;
      blob(x, y, H * (0.012 + rnd() * 0.04), '0,0,0', 0.12 + rnd() * 0.2);
    }
    for (let i = 0; i < 70; i += 1) blob(rnd() * W, H / 2 + gauss() * H * 0.06, H * (0.02 + rnd() * 0.05), '0,0,0', 0.25);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  } catch { return null; }
}

/**
 * 星空を 作る。
 *   count＝ちらばる 星の 数、band＝天の川に そって まく 星の 数、radius＝球の 半径、
 *   catalog＝ほんものの 明るい 星と 星座を 入れる、milkyWay＝天の川の 絵（canvas）、
 *   horizon＝[消える 高さ, 見える 高さ]（むきの y。地平線の かすみ）、scale＝星の 大きさ、gain＝明るさ、twinkle＝またたき、
 *   auto＝描く たびに 時計を 自分で すすめる（update を 呼ばない 内装むけ）。
 * 返す：{ group, points, milky, uniforms, update(t), setFade(n), setSky(緯度°, 恒星時 h), highlight(番号, 強さ) }
 */
export function createStarfield({ count = 5200, band = 3200, radius = 200, seed = 11, catalog = true, milkyWay = true, milkySize = 2048,
  horizon = [0.015, 0.2], scale = 1, gain = 1, milkyGain = 0.26, twinkle = 1, auto = false } = {}) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;
  const named = catalog ? CONSTELLATIONS.reduce((n, c) => n + c.stars.length, 0) + BRIGHT.length : 0;
  const n = count + band + named;
  const pos = new Float32Array(n * 3), star = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  let i = 0;
  const put = (mag, t, group = -1) => {
    pos[i * 3] = v.x * radius; pos[i * 3 + 1] = v.y * radius; pos[i * 3 + 2] = v.z * radius;
    const [size, alpha] = look(mag);
    star[i * 4] = size; star[i * 4 + 1] = alpha; star[i * 4 + 2] = rnd(); star[i * 4 + 3] = group;
    tint(t, col, i * 3); i += 1;
  };
  // 色の 分布：白〜黄が 多く、青白と オレンジは 少し。
  const anyTint = () => { const r = rnd(); return r < 0.16 ? rnd() * 0.22 : r < 0.3 ? 0.78 + rnd() * 0.22 : 0.3 + rnd() * 0.42; };
  // ちらばる 星：等級 m より 明るい 星の 数は 10^(0.5 m) に 比例（ほんものの 空と 同じ かたむき）。
  for (let k = 0; k < count; k += 1) {
    const y = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    v.set(Math.cos(a) * r, y, Math.sin(a) * r);
    put(Math.max(catalog ? 2.3 : 0.6, 6.6 + 2 * Math.log10(Math.max(1e-6, rnd()))), anyTint());
  }
  // 天の川：銀河の 面に そって、中心（いて座の ほう）ほど こく。暗い 星が ほとんど。
  for (let k = 0; k < band; k += 1) {
    const core = rnd() < 0.45;
    const l = core ? gauss() * 0.75 : rnd() * Math.PI * 2;
    const b = gauss() * (core ? 0.12 : 0.1) * (rnd() < 0.25 ? 2.2 : 1);
    galactic(l, b, v).normalize();
    put(Math.max(3.4, 7.4 + 2 * Math.log10(Math.max(1e-6, rnd()))), core ? 0.45 + rnd() * 0.4 : anyTint());
  }
  if (catalog) {
    CONSTELLATIONS.forEach((c, ci) => { for (const [ra, dec, mag, t] of c.stars) { starVector(ra, dec, v); put(mag, t, ci); } });
    for (const [ra, dec, mag, t] of BRIGHT) { starVector(ra, dec, v); put(mag, t); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(col, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.01);
  const uniforms = {
    uTime: { value: 0 }, uFade: { value: 1 }, uPx: { value: 1 }, uScale: { value: scale }, uTwinkle: { value: twinkle }, uGain: { value: gain },
    uHi: { value: -9 }, uHiK: { value: 0 }, uHorizon: { value: new THREE.Vector2(horizon[0], horizon[1]) },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  points.frustumCulled = false; points.renderOrder = -2; points.name = 'stars';
  // 画面の ピクセルの 比（iPad は 2）と、update を 呼ばない ところの 時計。
  points.onBeforeRender = (renderer) => {
    try { uniforms.uPx.value = renderer.getPixelRatio(); } catch { /* */ }
    if (auto) uniforms.uTime.value = (globalThis.performance?.now?.() || 0) / 1000;
  };
  const group = new THREE.Group(); group.name = 'starfield';
  let milky = null;
  const map = milkyWay ? milkyTexture(seed + 5, milkySize) : null;
  if (map) {
    const mu = { uMap: { value: map }, uFade: uniforms.uFade, uGain: { value: milkyGain }, uHorizon: uniforms.uHorizon,
      uGal: { value: new THREE.Matrix3().set(GX.x, GX.y, GX.z, GY.x, GY.y, GY.z, GZ.x, GZ.y, GZ.z) } };
    milky = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 40, 20),
      new THREE.ShaderMaterial({ uniforms: mu, vertexShader: MW_VERT, fragmentShader: MW_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    milky.frustumCulled = false; milky.renderOrder = -3; milky.name = 'milky-way';
    group.add(milky);
  }
  group.add(points);

  const qTilt = new THREE.Quaternion(), qSpin = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  // 緯度（°）と 恒星時（h）から 空の むき。恒星時と 同じ 赤経の 星が 南の 空の まんなかに 来る。
  function skyQuaternion(latitude, siderealHours, out = new THREE.Quaternion()) {
    qTilt.setFromAxisAngle(X, (latitude - 90) * DEG);
    qSpin.setFromAxisAngle(Y, -(Math.PI / 2 + siderealHours * 15 * DEG));
    return out.copy(qTilt).multiply(qSpin);
  }
  return {
    group, points, milky, uniforms, skyQuaternion,
    update(t) { uniforms.uTime.value = t; },
    setFade(k) { uniforms.uFade.value = k; group.visible = k > 0.004; },
    setSky(latitude, siderealHours) { skyQuaternion(latitude, siderealHours, group.quaternion); },
    highlight(index, k = 1) { uniforms.uHi.value = index; uniforms.uHiK.value = k; },
  };
}
