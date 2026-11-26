// メインの島の 高層ビルの まち（2026-11：「プラネタリウムの 左の スペースを 拡張し 高層ビル群を」）。
//
// 場所：島の 北西。プラネタリウム（-28, -31.2）の 西と 北に 土地を 足して（`CITY.rects` ＝ main-plaza.js の `PLAZA.annex.also`）、
// ロサンゼルスの ダウンタウンの ような ガラスの 高い ビルを 14 本・低い ビルを 8 けん 建てる。夜は まどが 何千も 光る。
//   通り … たて 3 本（x -63・-46・-30）と よこ 3 本（z -13.5・-31・-49）。アスファルト（はば 4）と 歩道（1.4）。
//           入口は z -13.5 の 通りの 東の はし（x -41）＝ main_island.json の `roads` の 6 本目（x -40〜-6）に つながる。
//   ビル … いちばん 高い ものは 北西（カメラは 南から 見るので、プラネタリウムを かくさない）。
//   公園 … 南東の かど（x -60〜-50, z -27〜-17）は 石の かこいの ある 丘の 公園。島の 丘（`CITY.hills`）は ここと 南の 小さな もりあがり。
// 作りかた：
//   ・形は ぜんぶ 手で 頂点を ならべて **材質ごとに 1 メッシュ**（ガラス 4 しゅるい・コンクリートと 道・光る 小物・光の 輪 ＝ 描画 7 回）。
//   ・まどは 「まど 1 ますの 絵」（canvas）を くりかえす。どの ますが 光るか・色（あたたかい 黄・つめたい 白）・ゆっくり かわる 点滅は
//     シェーダーが ますの 番号から 決める（絵は 1 ますだけ・ビルごとに ちがう もよう）。光は 足さない（emissive だけ）。
//   ・ガラスは 空の 色を うつす（にせの 反射：scene.environment は 使わない・共有の 材質も さわらない）。
//   ・カメラと 自分の あいだに ある かべは まるく 切りぬく（`uCityCut`）：通りを 歩いても ビルで 自分が かくれない。
//   ・canvas の 絵は try/catch（検査は Node の にせの DOM で 走る＝もようなしで 形だけ 作る）。
// ビルは いまは かざり（入れない）。当たり判定は 足もとの 四角（`obstacles`）。
import * as THREE from './three.module.js';

// ---- 土地・丘・道（島を 建てる 前に 要る 数字）----
const WX = -63, CX = -46, EX = -30;      // たての 通りの まんなか（西・中央・東）
const AZ = -13.5, BZ = -31, CZ = -49;    // よこの 通りの まんなか（A＝入口・B・C）
const RW = 2, SW = 1.4;                  // アスファルトの 半分の はば・歩道の はば
const X0 = -76, X1 = -16, ZN = -73;      // しき石の 西・東・北の はし（その 外は すなはま）
const Y_ROAD = 0.24, Y_WALK = 0.34;      // 島の 地面は y 0.2

export const CITY = {
  // 土地（かどの まるい 四角 2 まい＝L の 形）。西の 1 まいは じてんしゃやの 土地（z -2〜）に つながる。
  rects: [{ x0: -78, x1: -40, z0: -74, z1: -1, r: 9 }, { x0: -78, x1: -14, z0: -74, z1: -40, r: 9 }],
  // 島の 丘。前は (-46, -32, r 7) に 1 つ（いまは 通りの 上）。**もりあがる マスの 数は 前と 同じ 25**＝島の 乱数（木・草花の 場所）が ずれない。
  hills: [{ x: -55, z: -22, r: 5.5 }, { x: -72, z: -5, r: 1.9 }],
  // 島の 道に つなぐ 道（main_island.json の roads と 同じ 数字）。
  road: { x0: -40, x1: -6, z: AZ, w: 3 },
  sign: { x: -42, z: AZ },
  park: { x0: -60.3, x1: -49.7, z0: -27.3, z1: -16.7 },
};

// まちの しき地か（木・草花を まかない／カメラの 切りぬきを 使う）。
export function inCity(x, z, pad = 0) {
  return (x < -39.2 + pad && z < -2.5 + pad && x > -79 - pad && z > -75 - pad) || (z < -44.5 + pad && x < -13 + pad && x > -79 - pad && z > -75 - pad);
}
// 島の 草花を まく 輪（main-world.js）が とばす 場所：まちと、つなぐ 道。
export function cityFlora(x, z) {
  const r = CITY.road;
  return inCity(x, z, 1) || (x > r.x0 - 2.2 && x < r.x1 + 2.2 && Math.abs(z - r.z) < r.w / 2 + 2.2);
}

// 通り（アスファルト）。たて＝{x, z0, z1}／よこ＝{z, x0, x1}。
const STREETS = [
  { id: 'west', x: WX, z0: ZN, z1: AZ + RW },
  { id: 'central', x: CX, z0: ZN, z1: AZ + RW },
  { id: 'east', x: EX, z0: ZN, z1: CZ - RW },
  { id: 'a', z: AZ, x0: X0, x1: -41 },
  { id: 'b', z: BZ, x0: X0, x1: CX + RW },
  { id: 'c', z: CZ, x0: X0, x1: X1 },
];
// 歩道の 高さの しき石（四角 [x0, x1, z0, z1] か、かどを 切った 多角形）。
const SLABS = [
  { poly: [[-76, -51], [-65, -51], [-65, -73], [-71.5, -73], [-76, -67.5]] },
  [-61, -48, -73, -51], [-44, -32, -73, -51],
  { poly: [[-28, -51], [-16, -51], [-16, -67.5], [-21.5, -73], [-28, -73]] },
  [-76, -65, -47, -33], [-61, -48, -47, -33],
  [-76, -65, -29, -15.5],
  [-61, -48, -29, -27.3], [-61, -48, -16.7, -15.5], [-61, -60.3, -27.3, -16.7], [-49.7, -48, -27.3, -16.7],   // 公園の まわり
  [-44, -42.6, -47, -15.5], [-42.6, -39.4, -26.6, -17.4],
  [-44, -16, -47, -45.6],
  [-44, -41, -16.9, -15.5],
  [-76, -41, -11.5, -10.1], [-67.5, -42.4, -10.1, -3.6],
];
// 草むらを 生やさない 四角（地面の 下の 見えない 箱に する）。
const NO_GRASS = [
  [-76, -16, -73, -45.6], [-76, -42.6, -45.6, -29], [-76, -61, -29, -10.1], [-49.7, -42.6, -29, -10.1],
  [-61, -49.7, -16.7, -10.1], [-61, -49.7, -29, -27.3], [-67.5, -42.4, -10.1, -3.6], [-42.6, -39.4, -26.6, -17.4], [-42.6, -41, -16.9, -10.1],
];

// ---- ビルの 一覧 ----
// face：0＝青い カーテンウォール／1＝白い おびと 青緑の ガラス／2＝ブロンズの たての ひれ／3＝石の かべに 四角い まど。
// kind：tower（高さ 18 から）／mid（それより 低い）。steps＝[はば, おくゆき, 上の 高さ] を 下から。
const BUILDINGS = [
  // 北の 奥の 列（いちばん 高い 4 本。西ほど 高い）
  { id: 'crown', kind: 'tower', face: 0, x: -70.6, z: -66.4, tint: [0.96, 1.0, 1.06], steps: [[8.2, 8.2, 30], [7, 7, 42]], crown: { r: 3.2, top: 52, spire: 68 }, en: 'Crown Tower', ja: 'クラウン タワー' },
  { id: 'sail', kind: 'tower', face: 0, x: -54.5, z: -66.5, tint: [0.86, 1.02, 1.0], steps: [[8.6, 8, 44]], slant: 54, spire: 63, en: 'Sail Tower', ja: 'セイル タワー' },
  { id: 'round', kind: 'tower', face: 1, x: -38, z: -66.3, tint: [1, 1, 1], cyl: [[4.3, 38], [3.1, 42]], mast: 47, en: 'Round Tower', ja: 'まるい タワー' },
  { id: 'heli', kind: 'tower', face: 2, x: -21.8, z: -66.2, tint: [1, 1, 1], steps: [[8, 8, 32]], helipad: true, en: 'Heliport Tower', ja: 'ヘリポート タワー' },
  // 北の 手前の 列
  { id: 'n1', kind: 'tower', face: 2, x: -73.4, z: -57, tint: [1.05, 1, 0.94], steps: [[4, 7, 30]], mast: 35 },
  { id: 'n2', kind: 'tower', face: 0, x: -68.6, z: -57, tint: [1.04, 1.0, 0.96], steps: [[4, 7, 24]] },
  { id: 'twin_w', kind: 'tower', face: 0, x: -57.2, z: -57, tint: [0.92, 0.98, 1.08], steps: [[4.2, 6.6, 34]], mast: 38, en: 'Twin Towers', ja: 'ふたごの タワー' },
  { id: 'twin_e', kind: 'tower', face: 0, x: -51.8, z: -57, tint: [0.92, 0.98, 1.08], steps: [[4.2, 6.6, 34]], mast: 38 },
  { id: 'n3', kind: 'tower', face: 3, x: -40.4, z: -57, tint: [1.0, 0.95, 0.88], steps: [[4.2, 7, 15], [3.4, 5.6, 22]] },
  { id: 'n4', kind: 'tower', face: 1, x: -35.6, z: -57, tint: [1.0, 1.02, 0.98], steps: [[4.2, 7, 18]] },
  { id: 'n5', kind: 'tower', face: 0, x: -24.2, z: -57, tint: [1.0, 1.0, 1.0], steps: [[4.2, 7, 20]] },
  { id: 'n6', kind: 'mid', face: 3, x: -19.3, z: -57, tint: [0.96, 0.84, 0.76], steps: [[4.4, 7, 12]], shops: true },
  // まんなかの 列
  { id: 'hall', kind: 'tower', face: 3, x: -71, z: -40, tint: [1.06, 1.05, 1.02], steps: [[8.4, 9.6, 14], [6.4, 7, 28], [4.6, 4.6, 38]], pyramid: 43.2, en: 'City Hall', ja: 'しやくしょ' },
  { id: 'slab', kind: 'tower', face: 0, x: -54.5, z: -42.6, tint: [1.0, 1.0, 1.0], steps: [[9.6, 5, 38]] },
  { id: 'm1', kind: 'mid', face: 3, x: -54.5, z: -37, tint: [0.9, 0.88, 0.9], steps: [[9.6, 4.6, 12]], shops: true },
  // 南の 列
  { id: 's1', kind: 'tower', face: 1, x: -71, z: -24.8, tint: [1.0, 0.99, 0.96], steps: [[8.4, 5, 28]] },
  { id: 's2', kind: 'mid', face: 3, x: -71, z: -19.5, tint: [1.0, 0.9, 0.8], steps: [[8.4, 4.4, 10]], shops: true },
  { id: 's3', kind: 'mid', face: 3, x: -41, z: -22, tint: [0.98, 0.93, 0.84], steps: [[2.8, 8, 7]], shops: true },
  // 入口の 通りの 南（ひくい お店の ならび）
  { id: 'p1', kind: 'mid', face: 3, x: -64.5, z: -6.6, tint: [0.92, 0.95, 1.0], steps: [[5, 4.6, 8]], shops: true },
  { id: 'p2', kind: 'mid', face: 3, x: -58, z: -6.6, tint: [1.0, 0.86, 0.78], steps: [[5, 4.6, 9]], shops: true },
  { id: 'p3', kind: 'mid', face: 1, x: -52, z: -6.6, tint: [1.0, 1.0, 1.0], steps: [[5, 4.6, 6]], shops: true },
  { id: 'p4', kind: 'mid', face: 3, x: -45.5, z: -6.6, tint: [1.02, 0.97, 0.86], steps: [[5.4, 4.6, 11]], shops: true },
];
// まど 1 ますの 大きさ（はば・階の 高さ）と、夜に 光る ますの 割合。
const FACE = [
  { bay: 1.25, floor: 1.5, lit: 0.5, rough: 0.22, metal: 0.25 },
  { bay: 1.6, floor: 1.5, lit: 0.46, rough: 0.3, metal: 0.15 },
  { bay: 0.9, floor: 1.6, lit: 0.42, rough: 0.28, metal: 0.3 },
  { bay: 1.5, floor: 1.7, lit: 0.38, rough: 0.8, metal: 0 },
];

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
function canvasTex(w, h, paint, srgb = true) {
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (!g?.fillRect || !g.createLinearGradient) return null;
    paint(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  } catch { return null; }
}
// まど 1 ますの 絵（色）と、光の 絵（赤＝へやの 明かりの 強さ・緑＝ガラスの ところ）。上が 天井。
function facadeMaps(kind) {
  const grad = (g, x, y, w, h, a, b) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  const light = (g, x, y, w, h) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgb(255,255,0)'); gr.addColorStop(0.35, 'rgb(215,255,0)'); gr.addColorStop(1, 'rgb(130,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  const P = [
    // 0：青い カーテンウォール（ほそい アルミの たてざん・下に こい スパンドレル）
    [(g, W, H) => { grad(g, 0, 0, W, H, '#7fb2d8', '#4a7da8'); g.fillStyle = '#2b4c6b'; g.fillRect(0, H * 0.8, W, H * 0.2); g.fillStyle = '#a9c0cf'; g.fillRect(0, H * 0.8 - 2, W, 3); g.fillStyle = '#c3ccd2'; g.fillRect(0, 0, 3, H); g.fillRect(W - 3, 0, 3, H); },
      (g, W, H) => { g.fillStyle = 'rgb(0,60,0)'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgb(0,200,0)'; g.fillRect(4, H * 0.8, W - 8, H * 0.2); light(g, 5, 3, W - 10, H * 0.8 - 6); }],
    // 1：白い コンクリートの おびと、青緑の ガラスの おび
    [(g, W, H) => { g.fillStyle = '#e4e6df'; g.fillRect(0, 0, W, H); grad(g, 0, H * 0.08, W, H * 0.5, '#4f918c', '#2f6a69'); g.fillStyle = '#c7cbc4'; g.fillRect(0, H * 0.58, W, 3); g.fillRect(0, H * 0.08 - 3, W, 3); g.fillStyle = '#213f41'; g.fillRect(0, H * 0.08, 2, H * 0.5); g.fillRect(W - 2, H * 0.08, 2, H * 0.5); g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, H * 0.94, W, H * 0.06); },
      (g, W, H) => { g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, W, H); light(g, 3, H * 0.08 + 2, W - 6, H * 0.5 - 4); }],
    // 2：ブロンズ色の ガラスと、太い たての ひれ
    [(g, W, H) => { grad(g, 0, 0, W, H, '#7b6850', '#55452f'); g.fillStyle = '#2a211a'; g.fillRect(0, H * 0.86, W, H * 0.14); g.fillStyle = '#3b2f24'; g.fillRect(0, 0, W * 0.14, H); g.fillRect(W * 0.86, 0, W * 0.14, H); g.fillStyle = '#6f5c46'; g.fillRect(W * 0.14 - 2, 0, 2, H); g.fillRect(W * 0.86, 0, 2, H); },
      (g, W, H) => { g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgb(0,170,0)'; g.fillRect(W * 0.14, 0, W * 0.72, H); light(g, W * 0.14 + 3, 3, W * 0.72 - 6, H * 0.86 - 6); }],
    // 3：石の かべに 四角い まど（わくと まど台）
    [(g, W, H) => { g.fillStyle = '#e9e3d7'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 2, H); g.fillStyle = '#8f897c'; g.fillRect(W * 0.2 - 3, H * 0.18 - 3, W * 0.6 + 6, H * 0.6 + 6); grad(g, W * 0.2, H * 0.18, W * 0.6, H * 0.6, '#5b7890', '#3c5468'); g.fillStyle = '#8f897c'; g.fillRect(W * 0.5 - 1.5, H * 0.18, 3, H * 0.6); g.fillStyle = '#f6f2ea'; g.fillRect(W * 0.16, H * 0.78 + 3, W * 0.68, 5); },
      (g, W, H) => { g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, W, H); light(g, W * 0.2, H * 0.18, W * 0.6, H * 0.6); g.fillStyle = 'rgb(0,0,0)'; g.fillRect(W * 0.5 - 1.5, H * 0.18, 3, H * 0.6); }],
  ][kind];
  return { map: canvasTex(128, 128, P[0]), mask: canvasTex(128, 128, P[1], false) };
}
// コンクリートと 道の こまかい つぶ（明るさを 少し ゆらす）。
function grainTex() {
  return canvasTex(128, 128, (g, W, H) => {
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, H);
    const r = rng(77);
    for (let i = 0; i < 1500; i += 1) { const v = 214 + Math.floor(r() * 41); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2.5); }
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, 0, W, 1.5); g.fillRect(0, 0, 1.5, H);
  });
}
function poolTex() {
  return canvasTex(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    gr.addColorStop(0, 'rgba(255,220,160,0.9)'); gr.addColorStop(0.4, 'rgba(255,200,125,0.36)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
}

// ---- 頂点を ためて 1 メッシュに する 入れ物 ----
function bucket() { return { p: [], n: [], u: [], c: [] }; }
// 四角（P0→P1→P2→P3 が 表から 見て 左まわり）。色は 1 つか、頂点ごと 4 つ。法線は 面から（nn を わたせば 頂点ごと）。
function quad(b, P, uv, col, nn = null) {
  let nx, ny, nz;
  if (!nn) {
    const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
    nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  }
  for (const i of [0, 1, 2, 0, 2, 3]) {
    b.p.push(P[i][0], P[i][1], P[i][2]);
    if (nn) b.n.push(nn[i][0], nn[i][1], nn[i][2]); else b.n.push(nx, ny, nz);
    b.u.push(uv[i][0], uv[i][1]);
    const c = Array.isArray(col[0]) ? col[i] : col; b.c.push(c[0], c[1], c[2]);
  }
}
function toMesh(b, material, { cast = false, receive = true } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.n), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.u), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.c), 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, material); m.castShadow = cast; m.receiveShadow = receive; return m;
}
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---- 材質（シェーダーに まど・反射・切りぬきを 足す）----
const SKY_DAY = [new THREE.Color(0.58, 0.72, 0.88), new THREE.Color(0.2, 0.44, 0.82)];
const SKY_NIGHT = [new THREE.Color(0.012, 0.02, 0.045), new THREE.Color(0.004, 0.008, 0.02)];
function hook(material, U, mode, lit = 0.45) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uCityNight = U.night; sh.uniforms.uCityTime = U.time; sh.uniforms.uCityCut = U.cut;
    sh.uniforms.uCitySkyH = U.skyH; sh.uniforms.uCitySkyZ = U.skyZ; sh.uniforms.uCityLit = { value: lit }; sh.uniforms.uCityGlow = U.glow;
    sh.vertexShader = `varying vec3 vCityWp;\n${sh.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\n vCityWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let f = `uniform float uCityNight; uniform float uCityTime; uniform float uCityLit; uniform float uCityGlow; uniform vec4 uCityCut; uniform vec3 uCitySkyH; uniform vec3 uCitySkyZ;
varying vec3 vCityWp; float cityMask = 0.0;
float cityHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
${sh.fragmentShader}`;
    // カメラと 自分を むすぶ 線の まわり（半径 4.6）を 切りぬく。地面（y 0.5 より 下）は 切らない。
    f = f.replace('void main() {', `void main() {
  if (uCityCut.w > 0.5 && vCityWp.y > 0.5) {
    vec3 cba = uCityCut.xyz - cameraPosition; vec3 cpa = vCityWp - cameraPosition; float cbl = dot(cba, cba);
    if (cbl > 9.0) { float ch = dot(cpa, cba) / cbl; if (ch > 0.0 && ch < 0.97) {
      float cdd = length(cpa - cba * ch); float cn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (cdd < 4.6 * (0.82 + 0.18 * cn)) discard; } }
  }`);
    if (mode === 'glass') {
      f = f.replace('#include <map_fragment>', `#include <map_fragment>
  #ifdef USE_MAP
    diffuseColor.rgb *= 0.84 + 0.22 * cityHash(floor(vMapUv) + 3.3);   // ブラインドの 上げ下げ＝ますごとに 少し ちがう
  #endif
  #ifdef USE_EMISSIVEMAP
    diffuseColor.rgb *= 1.0 - 0.55 * texture2D(emissiveMap, vEmissiveMapUv).g;   // ガラスは 地の 色が うすい（空を うつす 分を のこす）＝昼に 白っぽく とばない
  #endif`);
      // 遠くの ガラスが 霧で ベージュに ならない ように、霧を 少し うすく（遠景の シルエットを のこす）。
      f = f.replace('#include <fog_fragment>', `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * 0.6 );
  #endif`);
      f = f.replace('#include <emissivemap_fragment>', `
  #ifdef USE_EMISSIVEMAP
    vec4 cm = texture2D(emissiveMap, vEmissiveMapUv);
    cityMask = cm.g;
    vec2 cell = floor(vEmissiveMapUv);
    float r1 = cityHash(cell), r2 = cityHash(cell + 71.7), r3 = cityHash(cell + 13.1);
    float cphase = floor(uCityTime * 0.007 + r2 * 9.0);                  // ますごとに べつの ときに、2 分ほどで くじを ひきなおす
    float croll = cityHash(cell + vec2(cphase * 3.7, cphase * 1.3));
    float cfl = cityHash(vec2(cell.y, 5.0 + floor(cell.x / 48.0)));     // 階ごと：ぜんぶ ついて いる 階・ほとんど 消えて いる 階
    float cp = uCityLit + (cfl > 0.86 ? 0.4 : 0.0) - (cfl < 0.16 ? 0.3 : 0.0);
    if (cell.y < -40.0) cp = 0.88;                                      // 1 階の ロビーと お店
    float con = step(croll, cp);
    vec3 ctint = r3 < 0.6 ? vec3(1.0, 0.68, 0.30) : (r3 < 0.9 ? vec3(0.74, 0.87, 1.0) : vec3(1.0, 0.50, 0.17));
    totalEmissiveRadiance = ctint * cm.r * con * (0.38 + 0.62 * r1) * uCityNight;
  #endif`);
      f = f.replace('#include <opaque_fragment>', `
  #ifdef USE_EMISSIVEMAP
    vec3 cN = inverseTransformDirection(normal, viewMatrix); vec3 cV = normalize(vCityWp - cameraPosition); vec3 cR = reflect(cV, cN);
    float cF = 0.24 + 0.76 * pow(1.0 - clamp(dot(-cV, cN), 0.0, 1.0), 4.0);
    outgoingLight += mix(uCitySkyH, uCitySkyZ, smoothstep(-0.05, 0.8, cR.y)) * cF * cityMask * 0.75;
  #endif
  #include <opaque_fragment>`);
    } else if (mode === 'glow') {
      f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * uCityGlow;');
    }
    sh.fragmentShader = f;
  };
  material.customProgramCacheKey = () => `city-${mode}`;
  return material;
}

// ---- 建てる ----
// root：島の Group（島の 座標）。D・sprite・obstacles・woods・keep は island-kit／main-world.js の 道具。
export function buildCity({ root, D, sprite, obstacles, woods = [], keep = () => {} }) {
  const group = new THREE.Group(); group.name = 'main-city'; root.add(group);
  const U = { night: { value: 0 }, time: { value: 0 }, cut: { value: new THREE.Vector4(0, 0, 0, 0) }, skyH: { value: SKY_DAY[0].clone() }, skyZ: { value: SKY_DAY[1].clone() }, glow: { value: 0.02 } };
  const glass = [bucket(), bucket(), bucket(), bucket()], matte = bucket(), glow = bucket();
  const solid = (x, z, w, d) => obstacles.push({ x, z, w, d });
  const footprints = [];   // ミニマップ用：[x, z, w, d, まるいか]
  const rand = rng(20261126);
  let serial = 1;          // ビルの 面ごとに まどの ますの 番号を ずらす（同じ もように ならない）

  // コンクリート・金属・道（色は 頂点・UV は 世界の 位置）。
  const GU = 0.3;
  const mq = (P, col, b = matte) => {
    const flat = Math.abs(P[0][1] - P[2][1]) < 1e-6 && Math.abs(P[0][1] - P[1][1]) < 1e-6;
    quad(b, P, P.map((p) => (flat ? [p[0] * GU, p[2] * GU] : [(p[0] + p[2]) * GU, p[1] * GU])), col);
  };
  const topQ = (x0, x1, z0, z1, y, col, b = matte) => mq([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], col, b);
  const wallQ = (ax, az, bx, bz, y0, y1, col, b = matte) => mq([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], col, b);
  // はこ（上と 4 面。下は 描かない）。
  const mbox = (cx, cz, w, d, y0, y1, col, b = matte) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, dark = mul(col, 0.9);
    topQ(x0, x1, z0, z1, y1, col, b);
    wallQ(x0, z1, x1, z1, y0, y1, col, b); wallQ(x1, z1, x1, z0, y0, y1, dark, b); wallQ(x1, z0, x0, z0, y0, y1, dark, b); wallQ(x0, z0, x0, z1, y0, y1, col, b);
  };
  // 多角形の 柱（上と まわり）。pts は 上から 見て 左まわり…では なく どちら向きでも：面の 向きは 中心から 外へ そろえる。
  const prism = (cx, cz, r0, r1, y0, y1, seg, col, b = matte, cap = true, turn = 0) => {
    for (let i = 0; i < seg; i += 1) {
      const a0 = turn + (i / seg) * Math.PI * 2, a1 = turn + ((i + 1) / seg) * Math.PI * 2;
      const p = (a, r, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      mq([p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y1), p(a1, r1, y1)], mul(col, 0.88 + 0.12 * Math.abs(Math.cos(a0 + 0.6))), b);
      if (cap && r1 > 0.01) mq([[cx, y1, cz], p(a1, r1, y1), p(a0, r1, y1), [cx, y1, cz]], col, b);
    }
  };
  // ガラスの かべ 1 まい（ます目の UV：u＝ますの 数・v＝階の 数）。yb は 右はしの 上の 高さ（ななめの 屋根の とき）。
  const gwall = (face, ax, az, bx, bz, y0, y1, tint, opts = {}) => {
    const F = FACE[face], len = Math.hypot(bx - ax, bz - az);
    const bay = opts.bay || F.bay, fl = opts.floor || F.floor;
    const n = Math.max(1, Math.round(len / bay)), uo = (serial * 13) % 400; serial += 1;
    const vo = opts.v0 ?? ((serial * 7) % 300), y1b = opts.yb ?? y1, ref = opts.ref ?? y0;
    const k = (y1 - ref) / fl, rows = opts.rows ?? Math.max(1, Math.round(k)), sv = rows / k;   // 階の 数が 整数に なるよう 少し のばす
    const v = (y) => vo + ((y - ref) / fl) * sv;
    const lo = mul(tint, 0.84), hi = mul(tint, 1.14);
    quad(glass[face], [[ax, y0, az], [bx, y0, bz], [bx, y1b, bz], [ax, y1, az]], [[uo, v(y0)], [uo + n, v(y0)], [uo + n, v(y1b)], [uo, v(y1)]], [lo, lo, hi, hi]);
  };
  const gbox = (face, cx, cz, w, d, y0, y1, tint, opts = {}) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    gwall(face, x0, z1, x1, z1, y0, y1, tint, opts); gwall(face, x1, z1, x1, z0, y0, y1, tint, opts);
    gwall(face, x1, z0, x0, z0, y0, y1, tint, opts); gwall(face, x0, z0, x0, z1, y0, y1, tint, opts);
  };
  const gcyl = (face, cx, cz, r, y0, y1, tint, seg = 36) => {
    const F = FACE[face], n = Math.max(4, Math.round((Math.PI * 2 * r) / F.bay)), per = n / seg;   // ますは 筒を ひとまわりして ぴったり つながる
    const rows = Math.max(1, Math.round((y1 - y0) / F.floor)), uo = (serial * 13) % 400, vo = (serial * 7) % 300; serial += 1;
    const lo = mul(tint, 0.84), hi = mul(tint, 1.14);
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      quad(glass[face], [[cx + c1 * r, y0, cz + s1 * r], [cx + c0 * r, y0, cz + s0 * r], [cx + c0 * r, y1, cz + s0 * r], [cx + c1 * r, y1, cz + s1 * r]],
        [[uo + (seg - i - 1) * per, vo], [uo + (seg - i) * per, vo], [uo + (seg - i) * per, vo + rows], [uo + (seg - i - 1) * per, vo + rows]], [lo, lo, hi, hi],
        [[c1, 0, s1], [c0, 0, s0], [c0, 0, s0], [c1, 0, s1]]);
    }
  };
  const CONC = lin(0xb9b4a8), ROOF = lin(0x4a4d52), STEEL = lin(0x8f969c), DARK = lin(0x2a2d33), WHITE = lin(0xf2efe6), RED = [0.85, 0.03, 0.015], WARM = [1.0, 0.84, 0.58];
  // 屋上：ふち・きかいの はこ・アンテナ（赤い 航空しょうがい灯）。
  const roof = (cx, cz, w, d, y, { boxes = 2, mast = 0, tone = ROOF } = {}) => {
    mbox(cx, cz, w + 0.18, d + 0.18, y - 0.02, y + 0.3, tone);
    for (let i = 0; i < boxes; i += 1) {
      const bw = Math.min(w * 0.5, 0.9 + rand() * 1.5), bd = Math.min(d * 0.5, 0.9 + rand() * 1.4), bh = 0.6 + rand() * 1.1;
      mbox(cx + (rand() - 0.5) * (w - bw - 0.6), cz + (rand() - 0.5) * (d - bd - 0.6), bw, bd, y + 0.3, y + 0.3 + bh, rand() > 0.5 ? STEEL : CONC);
    }
    if (mast) { mbox(cx, cz, 0.13, 0.13, y + 0.3, mast, STEEL); mbox(cx, cz, 0.34, 0.34, mast, mast + 0.34, RED, glow); }
  };
  // 1 階：ガラスの ロビー（お店）と ひさし。ますの v を -50 に する＝シェーダーが「1 階」と わかって ほとんど 灯す。
  const NEON = [[0.8, 0.06, 0.3], [0.05, 0.5, 0.8], [0.1, 0.7, 0.25], [0.85, 0.42, 0.04]];
  const AWN = [lin(0xc8443a), lin(0x2f7f6b), lin(0xd9a23a), lin(0x3d5fa8), lin(0x8a4fa0)];
  const ground = (b, w, d) => {
    const h = b.kind === 'tower' ? 2.9 : 2.5, y0 = Y_WALK, y1 = y0 + h;
    gbox(0, b.x, b.z, w - 0.3, d - 0.3, y0, y1, [1.0, 0.98, 0.94], { bay: 2.3, rows: 1, v0: -50 });
    mbox(b.x, b.z, w + 0.5, d + 0.5, y1, y1 + 0.42, b.kind === 'tower' ? CONC : mul(CONC, 0.92));
    if (b.shops) {   // ひさし（南と、通りに 近い がわ）
      const n = Math.max(1, Math.round(w / 2.3)), step = (w - 0.3) / n;
      for (let i = 0; i < n; i += 1) { const ax = b.x - (w - 0.3) / 2 + step * (i + 0.5), c = AWN[Math.abs(i + Math.round(b.x * 3)) % AWN.length]; mbox(ax, b.z + d / 2 + 0.28, step - 0.3, 0.75, y1 - 0.5, y1 - 0.32, c); mbox(ax, b.z - d / 2 - 0.28, step - 0.3, 0.75, y1 - 0.5, y1 - 0.32, c); }
    } else {         // 玄関の ひさし（南）と かどの 柱
      mbox(b.x, b.z + d / 2 + 0.6, Math.min(3.2, w * 0.5), 1.3, y1 - 0.2, y1, STEEL);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mbox(b.x + sx * (w / 2 - 0.2), b.z + sz * (d / 2 - 0.2), 0.5, 0.5, y0, y1, CONC);
    }
    return y1 + 0.42;
  };

  for (const b of BUILDINGS) {
    const F = b.face, tint = b.tint;
    if (b.cyl) {
      // まるい タワー：1 階も まるい ガラス。
      const [r0] = b.cyl[0];
      let y = Y_WALK;
      prism(b.x, b.z, r0 + 0.3, r0 + 0.3, y + 2.9, y + 3.3, 36, CONC);
      { const seg = 36, per = 1 / 3, uo = 20; for (let i = 0; i < seg; i += 1) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, r = r0 - 0.15; const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        quad(glass[0], [[b.x + c1 * r, y, b.z + s1 * r], [b.x + c0 * r, y, b.z + s0 * r], [b.x + c0 * r, y + 2.9, b.z + s0 * r], [b.x + c1 * r, y + 2.9, b.z + s1 * r]], [[uo + (seg - i - 1) * per, -50], [uo + (seg - i) * per, -50], [uo + (seg - i) * per, -49], [uo + (seg - i - 1) * per, -49]], [1, 0.98, 0.94], [[c1, 0, s1], [c0, 0, s0], [c0, 0, s0], [c1, 0, s1]]); } }
      y += 3.3;
      for (const [r, top] of b.cyl) { gcyl(F, b.x, b.z, r, y, top, tint); prism(b.x, b.z, r + 0.1, r + 0.1, top, top + 0.3, 36, ROOF); y = top + 0.3; }
      const rt = b.cyl[b.cyl.length - 1][0];
      prism(b.x + 0.8, b.z - 0.5, 0.9, 0.9, y, y + 1.1, 10, STEEL);
      if (b.mast) { mbox(b.x - 0.6, b.z + 0.4, 0.14, 0.14, y, b.mast, STEEL); mbox(b.x - 0.6, b.z + 0.4, 0.36, 0.36, b.mast, b.mast + 0.36, RED, glow); }
      // まるい ふちの あかり（夜に ぐるりと 光る）。
      prism(b.x, b.z, rt + 0.14, rt + 0.14, y - 0.34, y - 0.2, 36, mul(WARM, 0.9), glow, false);
      for (const [w, d] of [[r0 * 0.94, r0 * 0.5], [r0 * 0.5, r0 * 0.94], [r0 * 0.76, r0 * 0.76]]) solid(b.x, b.z, w, d);
      footprints.push([b.x, b.z, r0, r0, true]);
      keep(b.x, b.z, r0 + 1, r0 + 1);
      continue;
    }
    const [w0, d0] = b.steps[0];
    let y = ground(b, w0, d0);
    b.steps.forEach(([w, d, top], i) => {
      const last = i === b.steps.length - 1;
      if (b.slant && last) {
        // ななめの 屋根（西が 高い）。南と 北の かべは 台形、屋根も ガラス。
        const x0 = b.x - w / 2, x1 = b.x + w / 2, z0 = b.z - d / 2, z1 = b.z + d / 2, hi = b.slant, lo = top;
        gwall(F, x0, z1, x1, z1, y, hi, tint, { yb: lo }); gwall(F, x1, z1, x1, z0, y, lo, tint);
        { const s = serial; gwall(F, x1, z0, x0, z0, y, lo, tint, { yb: hi, ref: y, rows: Math.round((hi - y) / FACE[F].floor) * (lo - y) / (hi - y) }); serial = s + 1; }
        gwall(F, x0, z0, x0, z1, y, hi, tint);
        const n = Math.round(d / FACE[F].bay), m = Math.round(Math.hypot(w, hi - lo) / FACE[F].floor), c = mul(tint, 1.12);
        quad(glass[F], [[x0, hi, z1], [x1, lo, z1], [x1, lo, z0], [x0, hi, z0]], [[300, 200 + m], [300, 200], [300 + n, 200], [300 + n, 200 + m]], c);
        if (b.spire) { mbox(x0 + 0.5, b.z, 0.5, 0.5, hi - 0.6, hi + 0.9, STEEL); prism(x0 + 0.5, b.z, 0.16, 0.05, hi + 0.9, b.spire, 6, WHITE, matte, false); mbox(x0 + 0.5, b.z, 0.34, 0.34, b.spire, b.spire + 0.34, RED, glow); }
        // 屋根の ふちの ひかりの 線（夜）。
        mq([[x0 - 0.06, hi - 0.2, z1 + 0.06], [x1 + 0.06, lo - 0.2, z1 + 0.06], [x1 + 0.06, lo + 0.12, z1 + 0.06], [x0 - 0.06, hi + 0.12, z1 + 0.06]], mul(WARM, 0.85), glow);
        y = hi; return;
      }
      gbox(F, b.x, b.z, w, d, y, top, tint);
      const tone = F === 3 ? mul([tint[0] * 0.78, tint[1] * 0.76, tint[2] * 0.72], 1) : ROOF;
      const tall = top > 26;
      roof(b.x, b.z, w, d, top, { boxes: last && !b.crown && !b.pyramid && !b.helipad ? (w * d > 30 ? 3 : 2) : 0, mast: last ? (b.mast || 0) : 0, tone });
      if (last && tall && !b.mast && !b.crown && !b.pyramid && !b.helipad) for (const [sx, sz] of [[-1, -1], [1, 1]]) mbox(b.x + sx * (w / 2 - 0.2), b.z + sz * (d / 2 - 0.2), 0.26, 0.26, top + 0.3, top + 0.56, RED, glow);
      y = top + 0.3;
    });
    const [wt, dt, topY] = b.steps[b.steps.length - 1];
    if (b.crown) {
      // まるい かんむりと とがった 先（夜は かんむりが 白く 光る）。
      const c = b.crown;
      gcyl(F, b.x, b.z, c.r, y, c.top, tint, 32);
      prism(b.x, b.z, c.r + 0.16, c.r + 0.16, c.top, c.top + 1.3, 32, mul(WHITE, 0.95), glow, false);
      prism(b.x, b.z, c.r + 0.3, c.r + 0.3, c.top + 1.3, c.top + 1.55, 32, STEEL);
      prism(b.x, b.z, c.r - 0.2, 1.0, c.top + 1.55, c.top + 3.6, 32, STEEL, matte, true);
      prism(b.x, b.z, 0.3, 0.07, c.top + 3.6, c.spire, 8, WHITE, matte, false);
      mbox(b.x, b.z, 0.36, 0.36, c.spire, c.spire + 0.36, RED, glow);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mbox(b.x + sx * (wt / 2 - 0.25), b.z + sz * (dt / 2 - 0.25), 0.26, 0.26, topY + 0.3, topY + 0.56, RED, glow);
    }
    if (b.pyramid) {
      // 石の ピラミッドの 屋根と、てっぺんの あかり（ロサンゼルスの 市役所の ような 白い 塔）。
      prism(b.x, b.z, (wt / 2 + 0.1) * Math.SQRT2, 0.3, y, b.pyramid, 4, mul(WHITE, 0.92), matte, true, Math.PI / 4);
      mbox(b.x, b.z, 0.5, 0.5, b.pyramid, b.pyramid + 0.55, mul(WARM, 1.0), glow);
      // 段の かどの 小さな 柱（アールデコ）。
      for (const [w, d, top] of b.steps.slice(0, -1)) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mbox(b.x + sx * (w / 2 - 0.3), b.z + sz * (d / 2 - 0.3), 0.6, 0.6, top + 0.3, top + 1.5, mul(WHITE, 0.9));
    }
    if (b.helipad) {
      const hy = y + 0.9;
      mbox(b.x, b.z, 3.2, 3.2, y, hy - 0.2, STEEL);
      prism(b.x, b.z, 3.3, 3.3, hy - 0.2, hy, 28, DARK);
      prism(b.x, b.z, 2.75, 2.75, hy, hy + 0.02, 28, lin(0xe8c23a));
      prism(b.x, b.z, 2.45, 2.45, hy + 0.02, hy + 0.04, 28, lin(0x4d5a52));
      for (const [ox, w, d] of [[-0.75, 0.34, 2.2], [0.75, 0.34, 2.2], [0, 1.5, 0.34]]) topQ(b.x + ox - w / 2, b.x + ox + w / 2, b.z - d / 2, b.z + d / 2, hy + 0.06, WHITE);
      for (let i = 0; i < 8; i += 1) { const a = (i / 8) * Math.PI * 2; mbox(b.x + Math.cos(a) * 3.1, b.z + Math.sin(a) * 3.1, 0.2, 0.2, hy, hy + 0.2, i % 2 ? RED : mul(WARM, 0.9), glow); }
      mbox(b.x - wt / 2 + 0.6, b.z - dt / 2 + 0.6, 0.14, 0.14, y, y + 4.2, STEEL); mbox(b.x - wt / 2 + 0.6, b.z - dt / 2 + 0.6, 0.34, 0.34, y + 4.2, y + 4.54, RED, glow);
    }
    if (b.shops && topY >= 8) {   // かどの たての かんばん（夜は ネオンの ように 光る）
      const c = NEON[Math.abs(Math.round(b.x * 7 + b.z)) % NEON.length], sx = b.x + w0 / 2 - 0.45, sz = b.z + d0 / 2 + 0.34;
      mbox(sx, sz, 0.5, 0.16, 4.1, Math.min(topY - 0.6, 6.9), c, glow); mbox(sx, sz - 0.16, 0.1, 0.2, 4.4, 4.6, STEEL); mbox(sx, sz - 0.16, 0.1, 0.2, Math.min(topY - 1.1, 6.4), Math.min(topY - 0.9, 6.6), STEEL);
    }
    solid(b.x, b.z, w0 / 2 + 0.25, d0 / 2 + 0.25);
    footprints.push([b.x, b.z, w0, d0, false]);
    keep(b.x, b.z, w0 / 2 + 1, d0 / 2 + 1);
  }
  // ふたごの タワーを つなぐ 空中の ろうか。
  gbox(0, -54.5, -57, 1.2, 2.2, 19, 21.4, [0.92, 0.98, 1.08], { rows: 1 });
  mbox(-54.5, -57, 1.3, 2.3, 21.4, 21.6, STEEL); mbox(-54.5, -57, 1.3, 2.3, 18.8, 19, STEEL);

  // ---- 道・歩道・しき石 ----
  const ASPH = lin(0x4d5158), WALK = lin(0xb4b0a6), PAVE = lin(0xa39f95), PAINT = lin(0xe9e6da), YELLOW = lin(0xd8b23c);
  for (const s of STREETS) {
    if (s.x !== undefined) topQ(s.x - RW, s.x + RW, s.z0, s.z1, Y_ROAD, ASPH); else topQ(s.x0, s.x1, s.z - RW, s.z + RW, Y_ROAD, ASPH);
  }
  for (const s of SLABS) {
    if (Array.isArray(s)) {
      const [x0, x1, z0, z1] = s, col = (x1 - x0 > 6 && z1 - z0 > 6) ? PAVE : WALK;
      topQ(x0, x1, z0, z1, Y_WALK, col);
      const side = mul(col, 0.8);
      wallQ(x0, z1, x1, z1, 0.18, Y_WALK, side); wallQ(x1, z1, x1, z0, 0.18, Y_WALK, side); wallQ(x1, z0, x0, z0, 0.18, Y_WALK, side); wallQ(x0, z0, x0, z1, 0.18, Y_WALK, side);
    } else {
      const pts = s.poly, c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i], b2 = pts[(i + 1) % pts.length];
        mq([[c[0], Y_WALK, c[1]], [a[0], Y_WALK, a[1]], [b2[0], Y_WALK, b2[1]], [c[0], Y_WALK, c[1]]], PAVE);
        wallQ(a[0], a[1], b2[0], b2[1], 0.18, Y_WALK, mul(PAVE, 0.8));
      }
    }
  }
  // 交差点（たて × よこ）。まんなかの 線は 交差点で 切る。横断歩道は 交差点の 4 つの 口。
  const NS = STREETS.filter((s) => s.x !== undefined), EW = STREETS.filter((s) => s.z !== undefined);
  const cross = [];
  for (const a of NS) for (const b of EW) if (b.z >= a.z0 - 0.1 && b.z <= a.z1 + 0.1 && a.x >= b.x0 - 0.1 && a.x <= b.x1 + 0.1) cross.push({ x: a.x, z: b.z, n: b.z - RW > a.z0 + 1, s: b.z + RW < a.z1 - 1, w: a.x - RW > b.x0 + 1, e: a.x + RW < b.x1 - 1 });
  const nearCross = (x, z, pad) => cross.some((c) => Math.abs(x - c.x) < RW + pad && Math.abs(z - c.z) < RW + pad);
  const YM = Y_ROAD + 0.028;
  for (const s of STREETS) {
    if (s.x !== undefined) { for (let z = s.z0 + 1.2; z < s.z1 - 0.8; z += 2.4) if (!nearCross(s.x, z, 2.6)) topQ(s.x - 0.09, s.x + 0.09, z - 0.6, z + 0.6, YM, YELLOW); }
    else for (let x = s.x0 + 1.2; x < s.x1 - 0.8; x += 2.4) if (!nearCross(x, s.z, 2.6)) topQ(x - 0.6, x + 0.6, s.z - 0.09, s.z + 0.09, YM, YELLOW);
  }
  for (const c of cross) {
    const stripes = (horizontal, at) => { for (let i = 0; i < 6; i += 1) { const o = -RW + 0.28 + i * 0.63; if (horizontal) topQ(c.x + o, c.x + o + 0.36, at - 0.75, at + 0.75, YM, PAINT); else topQ(at - 0.75, at + 0.75, c.z + o, c.z + o + 0.36, YM, PAINT); } };
    if (c.n) stripes(true, c.z - RW - 1.0); if (c.s) stripes(true, c.z + RW + 1.0);
    if (c.w) stripes(false, c.x - RW - 1.0); if (c.e) stripes(false, c.x + RW + 1.0);
  }
  for (const [x0, x1, z0, z1] of NO_GRASS) D((x0 + x1) / 2, 0.1, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0x8a8478, 0, 'cobble');
  keep(-58, -38, 19.5, 36); keep(-30, -59, 15, 15);   // まちの 中には 島の 草花・きせつの かざりを 置かない

  // ---- とめて ある 車（はこ 6 つ・ライトは 光る 小物）----
  const PAINTS = [lin(0xc23b34), lin(0x2f5fa8), lin(0xe6e3da), lin(0x2c2f36), lin(0xd9a528), lin(0x4f8f6a), lin(0x9aa3ad)];
  const car = (x, z, alongX, tone, dir = 1) => {
    const L = 2.3, Wd = 1.05, y = Y_ROAD;
    const bx = (ox, oz, l, w, y0, y1, col, b = matte) => (alongX ? mbox(x + ox, z + oz, l, w, y + y0, y + y1, col, b) : mbox(x + oz, z + ox, w, l, y + y0, y + y1, col, b));
    bx(0, 0, L, Wd, 0.2, 0.62, tone); bx(-0.12 * dir, 0, L * 0.52, Wd * 0.88, 0.62, 0.98, mul(tone, 0.82));
    bx(-0.12 * dir, 0, L * 0.54, Wd * 0.9, 0.66, 0.9, DARK);                                   // まどの おび
    for (const ox of [-0.7, 0.7]) bx(ox, 0, 0.44, Wd + 0.06, 0, 0.42, DARK);                    // タイヤ（左右 つながった はこ）
    for (const oz of [-0.34, 0.34]) { bx(dir * (L / 2 + 0.01), oz, 0.04, 0.2, 0.36, 0.5, mul(WARM, 0.75), glow); bx(-dir * (L / 2 + 0.01), oz, 0.04, 0.2, 0.38, 0.5, mul(RED, 0.7), glow); }
    solid(x, z, alongX ? 1.15 : 0.5, alongX ? 0.5 : 1.15);
  };
  { const o = RW - 0.6; let k = 0;
    for (const [sx, sz, ax] of [[-56, AZ - o, 1], [-70, AZ - o, 1], [-59.5, AZ + o, 1], [-53, BZ - o, 1], [-70, BZ + o, 1], [-55, CZ - o, 1], [-37.5, CZ - o, 1], [-23, CZ - o, 1], [-69.5, CZ + o, 1], [-35, CZ + o, 1],
      [WX - o, -41, 0], [WX - o, -22, 0], [WX + o, -60, 0], [CX + o, -36.5, 0], [CX + o, -58, 0], [CX - o, -23.5, 0], [EX - o, -62, 0]]) { car(sx, sz, !!ax, PAINTS[k % PAINTS.length], k % 2 ? 1 : -1); k += 1; }
  }

  // ---- 街灯（まがった うでの 先に あかり）と 足もとの 光 ----
  const lamps = [];
  const POLE = lin(0x4b5057);
  const lamp = (x, z, dx, dz) => {   // (dx, dz)＝車道の むき
    mbox(x, z, 0.3, 0.3, Y_WALK, Y_WALK + 0.5, POLE); mbox(x, z, 0.13, 0.13, Y_WALK + 0.5, 5.2, POLE);
    mbox(x + dx * 0.75, z + dz * 0.75, dx ? 1.6 : 0.1, dz ? 1.6 : 0.1, 5.1, 5.2, POLE);
    mbox(x + dx * 1.45, z + dz * 1.45, dx ? 0.8 : 0.36, dz ? 0.8 : 0.36, 4.96, 5.1, mul(WARM, 1.0), glow);
    lamps.push([x + dx * 1.7, z + dz * 1.7]);
    solid(x, z, 0.12, 0.12);
  };
  for (const s of STREETS) {
    let k = 0;
    if (s.x !== undefined) { for (let z = s.z0 + 4; z < s.z1 - 2; z += 8.2, k += 1) { const side = k % 2 ? 1 : -1, lx = s.x + side * (RW + 0.4); if (!nearCross(s.x, z, 2.2)) lamp(lx, z, -side, 0); } }
    else for (let x = s.x0 + 5; x < s.x1 - 2; x += 8.2, k += 1) { const side = k % 2 ? 1 : -1, lz = s.z + side * (RW + 0.4); if (!nearCross(x, s.z, 2.2)) lamp(x, lz, 0, -side); }
  }
  // 街路樹（歩道の ふち）と 公園の 木。
  for (const [tx, tz, scale, kind] of [
    [-66.2, -62, 0.55, 2], [-59.8, -44, 0.55, 2], [-66.2, -38, 0.52, 2], [-66.2, -22, 0.55, 2], [-49.2, -64, 0.55, 2], [-42.8, -60, 0.55, 2], [-42.8, -40, 0.58, 2], [-42.8, -31, 0.6, 2],
    [-33.2, -64, 0.52, 2], [-26.8, -61, 0.52, 2], [-70, -52.2, 0.5, 2], [-37, -45.8, 0.55, 2], [-24, -45.8, 0.55, 2], [-56, -34.2, 0.5, 2], [-70, -27.8, 0.5, 2],
    [-59.2, -26.2, 0.62, 0], [-50.8, -26.2, 0.6, 0], [-59.2, -17.8, 0.6, 0], [-50.8, -17.8, 0.64, 0], [-72, -8.4, 0.6, 0], [-74.5, -4.6, 0.55, 0], [-61.5, -5, 0.55, 2], [-48.8, -5, 0.55, 2],
  ]) woods.push({ x: tx, z: tz, scale, kind });
  // 公園の 石の かこい（中は 丘＝入れない）と、入口の 門がた。
  { const p = CITY.park, t = 0.38, top = 0.86, st = lin(0xc9c3b4);
    mbox((p.x0 + p.x1) / 2, p.z0 + t / 2, p.x1 - p.x0, t, 0.18, top, st); mbox((p.x0 + p.x1) / 2, p.z1 - t / 2, p.x1 - p.x0, t, 0.18, top, st);
    mbox(p.x0 + t / 2, (p.z0 + p.z1) / 2, t, p.z1 - p.z0, 0.18, top, st); mbox(p.x1 - t / 2, (p.z0 + p.z1) / 2, t, p.z1 - p.z0, 0.18, top, st);
    solid((p.x0 + p.x1) / 2, p.z0 + t / 2, (p.x1 - p.x0) / 2, t / 2); solid((p.x0 + p.x1) / 2, p.z1 - t / 2, (p.x1 - p.x0) / 2, t / 2);
    solid(p.x0 + t / 2, (p.z0 + p.z1) / 2, t / 2, (p.z1 - p.z0) / 2); solid(p.x1 - t / 2, (p.z0 + p.z1) / 2, t / 2, (p.z1 - p.z0) / 2);
    solid((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, 3.6, 3.6);   // 丘の まんなか（かこいを ぬけても 歩けない）
    solid(-72, -5, 1.7, 1.7);                                  // 南の 小さな もりあがり
  }
  { const g = CITY.sign, zs = [AZ - RW - 0.9, AZ + RW + 0.9];
    for (const z of zs) { mbox(g.x, z, 0.24, 0.24, Y_WALK, 4.9, STEEL); mbox(g.x, z, 0.5, 0.5, Y_WALK, Y_WALK + 0.4, CONC); solid(g.x, z, 0.17, 0.17); }
    mbox(g.x, AZ, 0.2, zs[1] - zs[0] + 0.24, 4.62, 4.9, STEEL);
    mbox(g.x, AZ, 0.26, 4.4, 4.5, 4.58, mul(WARM, 0.9), glow);
    sprite({ en: '🏙 Downtown', ja: '🏙 ビルの まち' }, g.x, 5.75, AZ, { width: 6.4, size: 40 });
  }

  // ---- メッシュ（材質ごとに 1 つ）----
  const lit = [];
  const meshes = {};
  FACE.forEach((F, i) => {
    if (!glass[i].p.length) return;
    let maps = { map: null, mask: null };
    try { maps = facadeMaps(i); } catch { maps = { map: null, mask: null }; }
    const ok = !!(maps.map && maps.mask);
    const m = hook(new THREE.MeshStandardMaterial({ vertexColors: true, color: ok ? 0xffffff : [0x5f88a6, 0x9fb5b0, 0x6a573f, 0xd9d2c4][i], map: ok ? maps.map : null,
      emissive: ok ? 0xffffff : 0xffd08a, emissiveMap: ok ? maps.mask : null, emissiveIntensity: ok ? 1 : 0, roughness: F.rough, metalness: F.metal }), U, 'glass', F.lit);
    if (!ok) lit.push({ material: m, glow: 0.25 });   // 絵が 作れない とき（にせの DOM）：ぜんたいを うっすら 灯すだけ
    meshes[`glass${i}`] = toMesh(glass[i], m, { cast: true }); group.add(meshes[`glass${i}`]);
  });
  const grain = grainTex();
  const matteMat = hook(new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), U, 'matte');
  meshes.matte = toMesh(matte, matteMat); group.add(meshes.matte);
  const glowMat = hook(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 }), U, 'glow');
  meshes.glow = toMesh(glow, glowMat, { receive: false }); group.add(meshes.glow);
  // 街灯の 足もとの 光の 輪（夜だけ・加算・1 回の 描画）。
  let pools = null;
  try {
    const pt = poolTex();
    if (pt && lamps.length) {
      const pm = new THREE.MeshBasicMaterial({ map: pt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      pools = new THREE.InstancedMesh(pg, pm, lamps.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      lamps.forEach(([lx, lz], i) => { m4.compose(new THREE.Vector3(lx, Y_WALK + 0.06, lz), q, new THREE.Vector3(10.5, 1, 10.5)); pools.setMatrixAt(i, m4); });
      pools.frustumCulled = false; pools.renderOrder = 2; pools.visible = false; group.add(pools);
    }
  } catch { pools = null; }

  let nightNow = 0;
  function setNight(night) {
    const n = Math.max(0, Math.min(1, night || 0)); nightNow = n;
    U.night.value = n * 1.05;                 // まどの 明るさ（ブルームが にじむので 1.2 より 下）
    U.glow.value = 0.03 + n * 1.15;           // 街灯・かんむり・赤い 灯
    U.skyH.value.copy(SKY_DAY[0]).lerp(SKY_NIGHT[0], n); U.skyZ.value.copy(SKY_DAY[1]).lerp(SKY_NIGHT[1], n);
    for (const { material, glow: gl } of lit) material.emissiveIntensity = gl * n;
    if (pools) { pools.material.opacity = n * 0.5; pools.visible = n > 0.03; }
  }
  // t：秒。player：自分（世界の 座標）。まちの 中に いる 間だけ、カメラとの 間の かべを 切りぬく。
  function update(t, player) {
    U.time.value = t;
    if (player) {
      const lx = player.position.x - root.position.x, lz = player.position.z - root.position.z;
      const inside = inCity(lx, lz, 2.5);
      U.cut.value.set(player.position.x, player.position.y + 1.3, player.position.z, inside ? 1 : 0);
    }
  }
  setNight(0);
  const tris = (glass.reduce((a, b) => a + b.p.length, 0) + matte.p.length + glow.p.length) / 9 + (pools ? lamps.length * 2 : 0);
  return { group, meshes, setNight, update, buildings: BUILDINGS, footprints, lamps, triangles: tris, get night() { return nightNow; }, uniforms: U };
}

// 右上の ミニマップ：しき石・通り・公園・ビルの 足もと（こい 青ねずみ色）。px / py / k は main-world.js の paintMap と 同じ。
export function drawCityMap(ctx, px, py, k) {
  const rect = (x0, x1, z0, z1) => ctx.fillRect(px(x0), py(z0), (x1 - x0) * k, (z1 - z0) * k);
  ctx.fillStyle = '#c9c6bd';
  for (const s of SLABS) {
    if (Array.isArray(s)) rect(s[0], s[1], s[2], s[3]);
    else { ctx.beginPath(); s.poly.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), py(z)) : ctx.moveTo(px(x), py(z)))); ctx.fill(); }
  }
  { const p = CITY.park; ctx.fillStyle = '#8fbf6a'; rect(p.x0, p.x1, p.z0, p.z1); ctx.fillStyle = '#7aad58'; ctx.beginPath(); ctx.arc(px(-55), py(-22), 3.6 * k, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#5d626b';
  for (const s of STREETS) { if (s.x !== undefined) rect(s.x - RW, s.x + RW, s.z0, s.z1); else rect(s.x0, s.x1, s.z - RW, s.z + RW); }
  for (const b of BUILDINGS) {
    const [w, d] = b.cyl ? [b.cyl[0][0] * 2, b.cyl[0][0] * 2] : b.steps[0];
    ctx.fillStyle = b.kind === 'tower' ? '#34435a' : '#5b6a80';
    ctx.beginPath();
    if (b.cyl) ctx.arc(px(b.x), py(b.z), (w / 2) * k, 0, Math.PI * 2); else ctx.rect(px(b.x - w / 2), py(b.z - d / 2), w * k, d * k);
    ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
  ctx.fillText('🏙', px(-46), py(-40));
}
