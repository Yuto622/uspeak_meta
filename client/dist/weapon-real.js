// ぶきの リアルな 3D モデル（ぶきや の 100 本：形 10 × 素材 10）。箱を つんだ 形の かわり。
//
// ・モデルの ファイルは 読まない：まわした 形（Lathe）・ふちを けずった 板（Extrude の bevel）・くだ（Tube）・カプセルと、
//   canvas で かいた もよう（木目・石・革の まき）。金ぞくは metalness / roughness、水晶と 氷は clearcoat と 面の カット。
// ・**重く しない 作り**：形は 10 こ だけ 作って おぼえる（同じ 材質の 部品は 1 つの メッシュに まとめる ＝ 1 本は 3〜5 メッシュ）。
//   材質は 素材（だん）ごとに 1 組 だけ。100 本 ならべても 形 10 ＋ 材質 10 組を 使いまわす。光は 足さない。
// ・うつりこみは 小さな 絵 6 まい（32px）の 部屋を 材質に つける（シーンに environment が なくても 金ぞくが 黒く ならない）。
//   canvas が 使えない ところ（テスト）では もようも うつりこみも なし＝ただの 色に なる。
// ・向きと 大きさは 前の 箱の ぶきと 同じ：にぎる ところが 原点、上（+y）へ のびる、うすい 方向が z。
//   ゆみ だけは にぎりを 原点に 下げた（前は 手の 上に ういて いた）。
import * as THREE from './three.module.js';

// ---- もよう（canvas）。作れなければ null ＝ ただの 色 ----
function tex(size, paint, rx = 1, ry = 1) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); paint(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    return t;
  } catch { return null; }
}
let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
let shared = null;
function textures() {
  if (shared) return shared;
  // 木目：たての すじ（v の 方向に のびる）と ふし。明るい 灰色で かいて、色は 材質の color で かける。
  const wood = tex(128, (g, S) => {
    g.fillStyle = '#e9e1d2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i += 1) {
      g.strokeStyle = `rgba(${rnd() > 0.45 ? '95,66,38' : '255,250,235'},${0.1 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd() * 2;
      const x = rnd() * S; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 9, S * 0.3, x + (rnd() - 0.5) * 9, S * 0.7, x, S); g.stroke();
    }
    for (let i = 0; i < 2; i += 1) { g.fillStyle = 'rgba(80,52,30,0.4)'; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 2.6, 6, 0, 0, 7); g.fill(); }
  }, 2, 1);
  // 石：つぶつぶと うすい しみ。
  const stone = tex(128, (g, S) => {
    g.fillStyle = '#dcdcd6'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i += 1) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '60,60,58'},${0.08 + rnd() * 0.22})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.5 + rnd() * 2.2, 0, 7); g.fill(); }
    for (let i = 0; i < 9; i += 1) { g.fillStyle = `rgba(70,70,66,${0.05 + rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 8 + rnd() * 16, 0, 7); g.fill(); }
  }, 2, 2);
  // 革の まき：ななめに かさなる ひも。
  const wrap = tex(64, (g, S) => {
    g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, S, S);
    for (const dir of [1, -1]) for (let i = -2; i < 4; i += 1) {
      g.strokeStyle = 'rgba(40,28,20,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(i * S / 2, dir > 0 ? 0 : S); g.lineTo(i * S / 2 + S, dir > 0 ? S : 0); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(i * S / 2 + 4, dir > 0 ? 0 : S); g.lineTo(i * S / 2 + S + 4, dir > 0 ? S : 0); g.stroke();
    }
    for (let i = 0; i < 160; i += 1) { g.fillStyle = `rgba(60,40,30,${rnd() * 0.12})`; g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
  }, 2, 5);
  // うつりこみの 部屋（6 面）：明るい 天井・まどの ある かべ・あたたかい ゆか。renderer が 1 回だけ ぼかして 使う。
  let env = null;
  try {
    const face = (paint) => { const c = document.createElement('canvas'); c.width = c.height = 32; paint(c.getContext('2d'), 32); return c; };
    const wall = (win) => face((g, S) => {
      const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#cfd9e2'); gr.addColorStop(0.6, '#8f979f'); gr.addColorStop(1, '#b3a48e'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      if (win) { g.fillStyle = '#ffffff'; g.fillRect(S * 0.18, S * 0.1, S * 0.3, S * 0.4); g.fillRect(S * 0.6, S * 0.1, S * 0.22, S * 0.4); }
    });
    const flat = (col) => face((g, S) => { g.fillStyle = col; g.fillRect(0, 0, S, S); });
    env = new THREE.CubeTexture([wall(true), wall(false), flat('#ffffff'), flat('#b9a88f'), wall(true), wall(false)]);
    env.colorSpace = THREE.SRGBColorSpace; env.needsUpdate = true;
  } catch { env = null; }
  shared = { wood, stone, wrap, env };
  return shared;
}

// ---- 材質：素材（だん）ごとに 1 組（main＝刃・頭 / trim＝かざり金具 / grip＝にぎり / haft＝え / gem＝石） ----
// kind: wood（木目＋ニス）/ stone（石・面の カット）/ metal / gemstone（水晶・氷：つや＋面の カット）/ glow（光る 金ぞく）
const TIER_LOOK = {
  wood: { main: { kind: 'wood', rough: 0.58 }, trim: { kind: 'wood', rough: 0.7 }, grip: 0x8a5a36, haft: 0x9a7448, gem: 0x7ac74f },
  stone: { main: { kind: 'stone', rough: 0.9 }, trim: { kind: 'stone', rough: 0.8 }, grip: 0x6b5540, haft: 0x86694a, gem: 0x58a6c9 },
  copper: { main: { kind: 'metal', rough: 0.3 }, trim: { kind: 'metal', rough: 0.45 }, grip: 0x5b3a24, haft: 0x7a5334, gem: 0x3fc7a4 },
  iron: { main: { kind: 'metal', rough: 0.44, dim: 0.78 }, trim: { kind: 'metal', rough: 0.55 }, grip: 0x33363c, haft: 0x6b4a2e, gem: 0x4a7fd6 },
  silver: { main: { kind: 'metal', rough: 0.12 }, trim: { kind: 'metal', rough: 0.24 }, grip: 0x25405e, haft: 0x40302b, gem: 0x53e0e0 },
  gold: { main: { kind: 'metal', rough: 0.2, tint: [1, 0.84, 0.5] }, trim: { kind: 'metal', rough: 0.3 }, grip: 0x8a2030, haft: 0x55291b, gem: 0xe0243c },
  crystal: { main: { kind: 'gemstone', rough: 0.06, tint: [0.72, 0.6, 0.95] }, trim: { kind: 'metal', rough: 0.2 }, grip: 0x54408a, haft: 0x5d5170, gem: 0xe8dcff },
  fire: { main: { kind: 'glow', rough: 0.34, metal: 0.3, tint: [0.95, 0.5, 0.4] }, trim: { kind: 'metal', rough: 0.42, color: 0x4a3530 }, grip: 0x2a2020, haft: 0x33292a, gem: 0xffd23a },
  ice: { main: { kind: 'gemstone', rough: 0.08, tint: [0.55, 0.85, 1] }, trim: { kind: 'metal', rough: 0.2, metal: 0.7 }, grip: 0xdfeaf2, haft: 0xb9d3e0, gem: 0xffffff },
  star: { main: { kind: 'glow', rough: 0.16, metal: 0.8, tint: [1, 0.9, 0.55] }, trim: { kind: 'metal', rough: 0.25, metal: 0.75, glow: 0.3 }, grip: 0x5a3fa0, haft: 0x34317a, gem: 0xff8be4 },
};
const OTHER_LOOK = { main: { kind: 'metal', rough: 0.35, metal: 0.6 }, trim: { kind: 'metal', rough: 0.4, metal: 0.6 }, grip: 0x756043, haft: 0x8a6a45, gem: 0xfff1c0 };
const lit = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
function surface(def, hex, glow, T) {
  const env = T.env, noEnv = env ? 1 : 0.3;                   // うつりこみが ない ときは 金ぞくを 弱める（黒く なる）
  const color = new THREE.Color(def.color ?? hex); if (def.tint) color.multiply(new THREE.Color(...def.tint)); if (def.dim) color.multiplyScalar(def.dim);
  const bright = color.clone().multiplyScalar(1.12);          // もようの 絵が 少し 暗く するぶん
  if (def.kind === 'wood') return new THREE.MeshPhysicalMaterial({ color: T.wood ? bright : color, map: T.wood, roughness: def.rough, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, envMap: env, envMapIntensity: 0.6 });
  if (def.kind === 'stone') return new THREE.MeshStandardMaterial({ color: T.stone ? bright : color, map: T.stone, roughness: def.rough, metalness: 0, flatShading: true, envMap: env, envMapIntensity: 0.5 });
  if (def.kind === 'gemstone') return new THREE.MeshPhysicalMaterial({ color, roughness: def.rough, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true, emissive: color, emissiveIntensity: 0.1 + glow * 0.3, envMap: env, envMapIntensity: 1.6 });
  if (def.kind === 'glow') return new THREE.MeshStandardMaterial({ color, roughness: def.rough, metalness: (def.metal ?? 0.5) * noEnv, emissive: color, emissiveIntensity: 0.12 + glow * 0.4, envMap: env, envMapIntensity: 1.2 });
  // 金ぞく：色が うつりこみに 負けない ように、ほんの 少し 自分の 色を 足す。
  return new THREE.MeshStandardMaterial({ color, roughness: def.rough, metalness: (def.metal ?? 0.92) * noEnv, emissive: color, emissiveIntensity: 0.06 + (def.glow ?? 0) + glow * 0.25, envMap: env, envMapIntensity: 1.25 });
}
const tierMats = new Map();
function materialsFor(item) {
  const main = item.color ?? 0xbacfd8, accent = item.accent ?? 0xe0c68d, glow = item.glow ?? (item.id === 'sunblade' ? 0.35 : 0);
  const key = `${item.material}:${main}:${accent}:${glow}`;
  if (tierMats.has(key)) return tierMats.get(key);
  const T = textures(), look = TIER_LOOK[item.material] || OTHER_LOOK;
  const set = {
    main: surface(look.main, main, glow, T),
    trim: surface(look.trim, accent, glow, T),
    grip: new THREE.MeshStandardMaterial({ color: T.wrap ? lit(look.grip, 1.15) : look.grip, map: T.wrap, roughness: 0.82, metalness: 0 }),
    haft: new THREE.MeshPhysicalMaterial({ color: T.wood ? lit(look.haft, 1.12) : look.haft, map: T.wood, roughness: 0.6, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4, envMap: T.env, envMapIntensity: 0.5 }),
    gem: new THREE.MeshPhysicalMaterial({ color: look.gem, roughness: 0.08, metalness: 0, clearcoat: 1, emissive: look.gem, emissiveIntensity: 0.45 + glow * 0.6, envMap: T.env, envMapIntensity: 1.4 }),
    string: stringMat(),
  };
  tierMats.set(key, set);
  return set;
}
let stringShared = null;
const stringMat = () => (stringShared ||= new THREE.MeshStandardMaterial({ color: 0xe9e4c8, roughness: 0.7 }));

// ---- 形を 作る 小さな 道具 ----
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S1 = new THREE.Vector3();
// 置く：位置 p・回転 r・大きさ s を 形に やきこむ（あとで 1 つに まとめる ため）。
function put(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  geo.applyMatrix4(M.compose(V.set(...p), Q.setFromEuler(E.set(...r)), S1.set(...s))); return geo;
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
const cyl = (r0, r1, y0, y1, seg = 12) => put(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), [0, (y0 + y1) / 2, 0]);
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => put(new THREE.SphereGeometry(r, 12, 8), [x, y, z], [0, 0, 0], [sx, sy, sz]);
const ring = (r, t, y) => put(new THREE.TorusGeometry(r, t, 6, 16), [0, y, 0], [Math.PI / 2, 0, 0]);
// 板：xy の りんかくを z に うすく のばし、ふちを ななめに けずる（刃の ひし形の 切り口）。
function plate(pts, thick, edge, { round = 1, flat = 0.3 } = {}) {
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  const depth = thick * flat, bevelThickness = (thick - depth) / 2;
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness, bevelSize: edge, bevelOffset: -edge, bevelSegments: round, curveSegments: 4, steps: 1 });
  const pos = geo.attributes.position, uv = geo.attributes.uv;       // けずった 面も 木目が たてに 走る ように uv は xy に そろえる
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i), pos.getY(i));
  return geo.translate(0, 0, -depth / 2);
}
// くだ：点を なめらかに つなぎ、太さを 場所ごとに かえる（rFn(0〜1)）。wz は z 方向の ひらたさ。木目が たてに 走る ように uv を 入れかえる。
function tube(pts, rFn, seg = 20, rad = 7, wz = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)));
  const geo = new THREE.TubeGeometry(curve, seg, 1, rad, false), pos = geo.attributes.position, uv = geo.attributes.uv, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i += 1) {
    curve.getPointAt(i / seg, c); const r = Math.max(0.0005, rFn(i / seg));
    for (let j = 0; j <= rad; j += 1) { const k = i * (rad + 1) + j; pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r * wz); uv.setXY(k, uv.getY(k), uv.getX(k)); }
  }
  return geo;
}
// 帯：まん中の 線 center(t) と はば width(t) から りんかくの 点を 作る（ブーメラン）。
function ribbon(center, width, n, t0 = 0, t1 = 1) {
  const L = [], R = [];
  for (let i = 0; i <= n; i += 1) {
    const t = t0 + (t1 - t0) * (i / n), [x, y] = center(t), [x2, y2] = center(Math.min(1, t + 0.01)), [x1, y1] = center(Math.max(0, t - 0.01));
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, w = width(t);
    L.push([x - dy / d * w, y + dx / d * w]); R.push([x + dy / d * w, y - dx / d * w]);
  }
  return [...L, ...R.reverse()];
}
// 同じ 材質の 部品を 1 つの 形に まとめる（描く 回数を へらす）。
function merge(list) {
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new (n > 65535 ? Uint32Array : Uint16Array)(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.index) for (let k = 0; k < g.index.count; k += 1) idx[oi++] = g.index.array[k] + o; else for (let k = 0; k < c; k += 1) idx[oi++] = o + k;
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// よく 使う 部品。
const gripWrap = (y0, y1, r = 0.046) => put(new THREE.CapsuleGeometry(r, y1 - y0 - r * 2, 3, 12), [0, (y0 + y1) / 2, 0]);
const pommel = (y, r = 0.06) => lathe([[0, y - r], [r * 0.7, y - r * 0.8], [r, y - r * 0.2], [r * 0.85, y + r * 0.5], [r * 0.5, y + r]], 12);
const jewel = (x, y, z, r, sy = 1) => put(new THREE.OctahedronGeometry(r, 1), [x, y, z], [0, 0, 0], [1, sy, 1]);

// ---- 10 この 形。にぎる ところが 原点、上へ のびる。返すのは 材質ごとの 部品の ならび ----
const SHAPES = {
  // けん：まっすぐな もろ刃・十字の つば・革を まいた にぎり・丸い つか頭・つばの 石。
  sword() {
    const blade = plate([[-0.088, 0.26], [0.088, 0.26], [0.078, 1.12], [0.058, 1.33], [0, 1.48], [-0.058, 1.33], [-0.078, 1.12]], 0.05, 0.05);
    const guard = put(lathe([[0, -0.27], [0.045, -0.265], [0.05, -0.22], [0.03, -0.17], [0.034, -0.05], [0.05, 0], [0.034, 0.05], [0.03, 0.17], [0.05, 0.22], [0.045, 0.265], [0, 0.27]], 10), [0, 0.23, 0], [0, 0, Math.PI / 2], [1.15, 1, 1]);
    return { main: [blade], trim: [guard, pommel(-0.21), ring(0.048, 0.012, 0.17)], grip: [gripWrap(-0.19, 0.2)], gem: [ball(0.034, 0, 0.23, 0.04, 1, 1, 0.6), ball(0.034, 0, 0.23, -0.04, 1, 1, 0.6)] };
  },
  // かたな：そりの ある 片刃・丸い つば・ひしまきの つか。
  katana() {
    const pts = [], back = [], n = 14, cx = (t) => 0.2 * t * t, y = (t) => 0.27 + 1.43 * t;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n, k = t > 0.86 ? ((t - 0.86) / 0.14) ** 1.6 : 0, w = 0.052 - 0.012 * t;
      pts.push([cx(t) - w + k * (w + 0.04), y(t)]); if (i < n) back.push([cx(t) + 0.04, y(t)]);
    }
    const blade = plate([...pts, ...back.reverse()], 0.036, 0.034);
    const tsuba = lathe([[0, 0.2], [0.125, 0.2], [0.135, 0.212], [0.125, 0.226], [0, 0.226]], 20);
    const habaki = put(cyl(0.05, 0.046, 0.226, 0.3, 10), [0, 0, 0], [0, 0, 0], [1.15, 1, 0.5]);
    return { main: [blade], trim: [tsuba, habaki, put(pommel(-0.2, 0.048), [0, 0, 0], [0, 0, 0], [1, 1, 0.8])], grip: [put(gripWrap(-0.2, 0.2, 0.042), [0, 0, 0], [0, 0, 0], [1.05, 1, 0.82])] };
  },
  // ゆみ：先が そりかえる 弓・革の にぎり・金具・つる。
  bow() {
    const half = [[0, 0], [-0.012, 0.14], [-0.1, 0.36], [-0.215, 0.55], [-0.27, 0.65], [-0.245, 0.73]];
    const line = [...half.slice(1).reverse().map(([x, y]) => [x, -y]), ...half];
    const limb = tube(line, (u) => 0.036 - 0.02 * Math.abs(2 * u - 1) ** 1.3, 36, 7, 1.5);
    const tips = [-1, 1].map((s) => ball(0.024, -0.245, s * 0.73, 0, 1, 1, 1.4));
    const string = put(new THREE.CylinderGeometry(0.006, 0.006, 1.44, 5), [-0.252, 0, 0]);
    return { main: [limb], trim: [...tips, ring(0.046, 0.013, 0.14), ring(0.046, 0.013, -0.14)], grip: [put(gripWrap(-0.13, 0.13, 0.044), [0, 0, 0], [0, 0, 0], [1, 1, 1.25])], string: [string] };
  },
  // やり：木の え・金具の うけ口・木の葉の 形の 穂先。
  spear() {
    const head = plate([[-0.028, 1.4], [0.028, 1.4], [0.078, 1.53], [0.05, 1.68], [0, 1.82], [-0.05, 1.68], [-0.078, 1.53]], 0.05, 0.045);
    const socket = lathe([[0.04, 1.26], [0.046, 1.28], [0.04, 1.3], [0.036, 1.4], [0.044, 1.42], [0.03, 1.46], [0, 1.47]], 10);
    return { main: [head], trim: [socket, pommel(-0.19, 0.044)], haft: [cyl(0.036, 0.031, -0.17, 1.3)], grip: [gripWrap(-0.12, 0.14, 0.041)] };
  },
  // トライデント：金ぞくの え・外へ ひらく 3 本の 歯・かえしの ある 先。
  trident() {
    const side = (s) => tube([[0, 1.02], [s * 0.16, 1.07], [s * 0.27, 1.2], [s * 0.28, 1.46]], (u) => 0.04 - 0.012 * u, 14, 7);
    const mid = cyl(0.04, 0.03, 1.02, 1.48, 8);
    const tip = (x, y) => put(lathe([[0.03, 0], [0.058, -0.02], [0.03, 0.07], [0, 0.17]], 8), [x, y, 0], [0, 0, 0], [1, 1, 0.7]);
    const shaft = lathe([[0, -0.18], [0.036, -0.175], [0.038, 0.5], [0.04, 1.0], [0.052, 1.04], [0, 1.1]], 10);
    return { main: [shaft, mid, side(-1), side(1)], trim: [tip(0, 1.46), tip(-0.28, 1.44), tip(0.28, 1.44), ring(0.045, 0.014, 0.97), pommel(-0.2, 0.046)], grip: [gripWrap(-0.13, 0.15, 0.044)], gem: [ball(0.036, 0, 1.06, 0.04, 1, 1, 0.6), ball(0.036, 0, 1.06, -0.04, 1, 1, 0.6)] };
  },
  // つえ：すこし うねる え・玉を かかえる 3 本の つめ・光る 玉。
  staff() {
    const shaft = tube([[0, -0.17, 0], [0.012, 0.25, 0.008], [-0.012, 0.65, -0.008], [0, 1.06, 0]], (u) => 0.036 + 0.01 * u, 16, 8);
    const claws = [0, 1, 2].map((i) => { const a = i * 2.094 + 0.5, c = Math.cos(a), s = Math.sin(a); return tube([[c * 0.03, 1.02, s * 0.03], [c * 0.17, 1.12, s * 0.17], [c * 0.2, 1.3, s * 0.2], [c * 0.1, 1.5, s * 0.1]], (u) => 0.03 - 0.022 * u, 12, 6); });
    return { main: [shaft, ball(0.04, 0, -0.17, 0)], trim: [...claws, ring(0.048, 0.014, 1.02), ring(0.042, 0.012, 0.2)], grip: [gripWrap(-0.12, 0.16, 0.043)], gem: [put(new THREE.SphereGeometry(0.165, 16, 12), [0, 1.3, 0])] };
  },
  // まほうの ぼう：ろくろで ひいた 細い ぼう・金の わ・先の 石と 小さな きらめき。
  wand() {
    const body = lathe([[0, -0.17], [0.03, -0.165], [0.044, -0.13], [0.03, -0.09], [0.036, 0], [0.04, 0.1], [0.03, 0.16], [0.026, 0.3], [0.016, 0.84], [0, 0.86]], 10);
    const cup = lathe([[0.014, 0.8], [0.03, 0.84], [0.04, 0.9], [0.034, 0.9], [0.02, 0.85]], 8);
    return { main: [body], trim: [ring(0.036, 0.011, 0.17), ring(0.03, 0.009, 0.22), cup], gem: [jewel(0, 0.97, 0, 0.085, 1.35), jewel(0.14, 1.03, 0, 0.026), jewel(-0.12, 1.1, 0.02, 0.022), jewel(0.03, 1.18, -0.02, 0.026)] };
  },
  // ハンマー：角を 丸めた 金ぞくの 頭・しめる 帯・木の え。
  hammer() {
    const rsq = (h, r) => { const p = []; const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]]; cs.forEach(([sx, sy], k) => { for (let i = 0; i <= 3; i += 1) { const a = k * Math.PI / 2 + (i / 3) * Math.PI / 2; p.push([sx * (h - r) + Math.cos(a) * r, sy * (h - r) + Math.sin(a) * r]); } }); return p; };
    const block = (h, len, x) => put(plate(rsq(h, 0.04), len, 0.022, { flat: 0.84 }), [x, 1.1, 0], [0, Math.PI / 2, 0]);
    const cap = lathe([[0.05, 1.24], [0.055, 1.27], [0.03, 1.3], [0, 1.31]], 10);
    return { main: [block(0.15, 0.56, 0)], trim: [block(0.165, 0.06, -0.17), block(0.165, 0.06, 0.17), cap, ring(0.05, 0.014, 0.93), pommel(-0.2, 0.05)], haft: [cyl(0.042, 0.038, -0.17, 1.0)], grip: [gripWrap(-0.14, 0.16, 0.047)] };
  },
  // たて：ヒーター形。ふち（金具）・ふくらんだ 面・まん中の こぶと 石・びょう。前（+z）を 向く。
  shield() {
    const outline = (k) => { const sh = new THREE.Shape(); sh.moveTo(-0.33, 0.74); sh.quadraticCurveTo(0, 0.7, 0.33, 0.74); sh.lineTo(0.33, 0.36); sh.quadraticCurveTo(0.31, -0.02, 0, -0.25); sh.quadraticCurveTo(-0.31, -0.02, -0.33, 0.36); return sh.getPoints(8).map((p) => [p.x * k, 0.36 + (p.y - 0.36) * k]); };
    const back = put(plate(outline(1), 0.05, 0.012, { flat: 0.6 }), [0, 0, 0.025]);
    const face = put(plate(outline(0.87), 0.05, 0.045, { flat: 0.3, round: 2 }), [0, 0, 0.065]);
    const boss = put(lathe([[0.115, 0], [0.11, 0.012], [0.08, 0.04], [0.045, 0.055], [0, 0.058]], 16), [0, 0.4, 0.085], [Math.PI / 2, 0, 0]);
    const rivets = [[-0.2, 0.6], [0.2, 0.6], [-0.17, 0.2], [0.17, 0.2], [0, -0.03]].map(([x, y]) => ball(0.022, x, y, 0.088, 1, 1, 0.7));
    const strap = put(new THREE.TorusGeometry(0.09, 0.016, 5, 10, Math.PI), [0, 0.36, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 1]);
    return { main: [face], trim: [back, boss, ...rivets], grip: [strap], gem: [ball(0.04, 0, 0.4, 0.14, 1, 1, 0.6)] };
  },
  // ブーメラン：角の まるい「へ」の 字の 板・先の かざり帯・まん中の 石。
  boomerang() {
    const center = (t) => { const x = 0.46 * (2 * t - 1); return [x, 0.47 - Math.hypot(0.66 * x, 0.06)]; };   // ひじの まるい「へ」の 字
    const width = (t) => 0.07 * (1 - Math.abs(2 * t - 1) ** 6) ** 0.5 * (1 - 0.18 * Math.abs(2 * t - 1));
    const body = plate(ribbon(center, width, 28), 0.05, 0.022, { round: 2, flat: 0.4 });
    const band = (t0, t1) => plate(ribbon(center, (t) => width(t) + 0.004, 4, t0, t1), 0.058, 0.01, { flat: 0.6 });
    return { main: [body], trim: [band(0.1, 0.15), band(0.19, 0.22), band(0.85, 0.9), band(0.78, 0.81)], gem: [ball(0.034, 0, 0.41, 0.022, 1, 1, 0.5), ball(0.034, 0, 0.41, -0.022, 1, 1, 0.5)] };
  },
};

const shapeCache = new Map();
function shapeFor(style) {
  if (!shapeCache.has(style)) {
    const parts = SHAPES[style](), out = {};
    for (const [slot, list] of Object.entries(parts)) out[slot] = merge(list);
    shapeCache.set(style, out);
  }
  return shapeCache.get(style);
}

export const REAL_WEAPON_STYLES = Object.keys(SHAPES);
// 1 本の ぶき。知らない 形なら null（よぶ がわが 前の 箱の 形に もどす）。形と 材質は 使いまわし ＝ dispose しない こと。
export function realWeapon(item) {
  if (!item || !SHAPES[item.style]) return null;
  let parts, mats;
  try { parts = shapeFor(item.style); mats = materialsFor(item); } catch (err) { console.warn('[weapon] リアルな 形が 作れない', err); return null; }
  const g = new THREE.Group();
  for (const [slot, geo] of Object.entries(parts)) {
    const m = new THREE.Mesh(geo, mats[slot] || mats.main); m.castShadow = true; m.receiveShadow = slot === 'main'; g.add(m);
  }
  return g;
}
