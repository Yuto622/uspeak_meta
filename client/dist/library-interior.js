// としょかんの 中（2026-11）— 八角の 大広間・としょしつ（西）・じしゅうしつ（東）・げんかん（南）。
//
// ゲームの カメラは プレイヤーの うしろ 上（南）から 見おろす。だから：
// - **北がわ 5 面（東・北東・北・北西・西）の かべは 上まで**、南がわ 3 面と 部屋の 南の かべは **ひくい こしかべ**（切りとった 模型の ように 見せる）。
// - てんじょうは はらない。黄土色の ドームは **すその まるみ（コーブ）だけ** 北がわ 5 面に のせ、まんなかから シャンデリアを つるす。
// - のこり（ドーム ぜんぶ・南がわの 高い かべ・部屋の てんじょう）は `group.userData.ceiling`（ふだんは 見えない）。一人称の ときに `visible = true`。
// 光は 足さない（まど・ランプ・シャンデリアは 自分で 光る 材質、アーチの おくの あかりは 加算の 板）。材質ごとに 1 メッシュ。
// 座標：ゆか y＝0・+z が 南（出口）・まんなかが 原点。当たり判定は { x, z, w, d }（半分の はば）＝ island-interior.js と 同じ 形。
import * as THREE from './three.module.js';
import { tex, rng, paintBricks, blotches, createBatch, archPath, archRing, rectShape, plate, box, cyl, prism, beam, mat4 } from './library-real.js';

const A = 13;                                       // 八角の まんなかから かべまで
const FW = 2 * A * Math.tan(Math.PI / 8);           // 1 面の はば（10.77）
const WT = 1.0;                                     // 大広間の かべの あつみ（アーチの おくゆき）
const Y = { arc: 6.6, str: 6.9, cl: 9.9, top: 10.3 };   // アーチの だん・おび・上の まどの だん・コーニス
const ARCH = { w: 4.0, h: 5.5, off: 2.55 };         // 大アーチ（1 面に 2 つ）
const ROOM = { x0: 14.0, x1: 24.6, z: 6.6, h: 6.4 };    // 東西の 部屋（x は 東の 部屋。西は うらがえし）
const VEST = { hw: 2.0, z1: 17.8 };                 // げんかん
const AW = 1024, AH = 512;                          // 小物の 絵の 大きさ

/* ───────── もよう と 材質 ───────── */
let shared = null;
function materials() {
  if (shared) return shared;
  const rnd = rng(41);
  // もようづみの オレンジの れんが（ひし形の もよう）：512px ＝ 4.4 × 4.08。
  const BR = ['#d97a40', '#d06e39', '#de8748', '#cf713c', '#d67c44', '#ca6832'];
  const hsh = (a, b) => { const v = Math.sin(a * 91.7 + b * 47.3) * 43758.5453; return v - Math.floor(v); };
  const brick = tex(512, 512, (g, W, H) => {
    paintBricks(g, 0, 0, W, H, 24, 8, BR, '#e3caa3', { seed: 4, pattern: (r, px) => {
      const a = (px + r) % 8, b = (((px - r) % 8) + 8) % 8;
      if (a === 0 || b === 0) return '#a9532c';
      if (a === 4 && b === 4) return '#f0b274';
      return BR[Math.floor(hsh(r, px) * BR.length)];
    } });
    blotches(g, 0, 0, W, H, 8, rnd, '90,40,15', '255,225,180', 0.06);
  });
  const stone = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#efe1c4'; g.fillRect(0, 0, W, H); blotches(g, 0, 0, W, H, 14, rnd, '150,115,75', '255,250,235', 0.09);
    g.fillStyle = 'rgba(120,95,60,0.18)'; for (let r = 0; r < 4; r += 1) { g.fillRect(0, r * 64, W, 2); for (let c = 0; c < 2; c += 1) g.fillRect(c * 128 + (r % 2 ? 64 : 0), r * 64, 2, 64); }
  });
  // しっくい（こまかすぎない ひし形の こうし）：256px ＝ 1.6 × 1.6。ドームは 頂点の 色で 黄土色に そめる。
  const plaster = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#f4e6c6'; g.fillRect(0, 0, W, H); blotches(g, 0, 0, W, H, 10, rnd, '170,120,60', '255,250,230', 0.08);
    g.strokeStyle = 'rgba(150,95,35,0.20)'; g.lineWidth = 5;
    for (let i = -1; i <= 2; i += 1) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i * 128 + 256, 0); g.lineTo(i * 128, 256); g.stroke(); }
    g.fillStyle = 'rgba(150,90,30,0.28)'; for (const [x, y] of [[0, 0], [128, 0], [256, 0], [64, 128], [192, 128], [0, 256], [128, 256], [256, 256]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
  });
  // 黒と テラコッタの 市松の ゆか：512px ＝ 4 × 4 まい（1 まい 1.15）。
  const floor = tex(512, 512, (g, W, H) => {
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
      const x = c * 128, y = r * 128, dark = (r + c) % 2 === 0, l = hsh(r + 3, c) * 14;
      g.fillStyle = dark ? `rgb(${30 + l},${27 + l},${28 + l})` : `rgb(${150 + l},${66 + l * 0.6},${40 + l * 0.4})`; g.fillRect(x, y, 128, 128);
      const gr = g.createLinearGradient(x, y, x + 128, y + 128); gr.addColorStop(0, 'rgba(255,240,220,0.10)'); gr.addColorStop(0.5, 'rgba(255,240,220,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = gr; g.fillRect(x, y, 128, 128);
      g.strokeStyle = 'rgba(70,45,30,0.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 126, 126);
    }
  });
  // オークの 木目（やわらかい すじ）：256px ＝ 2 × 2。
  const wood = tex(256, 256, (g, W, H) => {
    g.fillStyle = '#b98248'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i += 1) { g.strokeStyle = `rgba(${rnd() > 0.5 ? '95,55,22' : '240,200,140'},${0.07 + rnd() * 0.12})`; g.lineWidth = 1.5 + rnd() * 3.5; const y = rnd() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * 10, W * 0.7, y + (rnd() - 0.5) * 10, W, y); g.stroke(); }
    g.fillStyle = 'rgba(70,40,15,0.22)'; g.fillRect(0, 0, W, 2); g.fillRect(0, 128, W, 2);
  });
  // 小物の 絵 1 まい：上＝本の せ（48 さつ）／下＝けいじばん・とけい・ひらいた 本。
  const props = tex(AW, AH, (g) => {
    const C = ['#8c2f2a', '#2f5d48', '#2c4a78', '#b88a3e', '#6a3d24', '#d9c9a0', '#7a2f4f', '#3f6f7a', '#a8552c', '#40513a', '#c0a268', '#5a2a2a', '#23405a', '#94703a'];
    const sw = AW / 48;
    for (let i = 0; i < 48; i += 1) {
      const x = i * sw, c = C[Math.floor(hsh(i, 7) * C.length)];
      g.fillStyle = c; g.fillRect(x, 0, sw, 256);
      const gr = g.createLinearGradient(x, 0, x + sw, 0); gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = gr; g.fillRect(x, 0, sw, 256);
      g.fillStyle = 'rgba(232,196,110,0.85)'; const b = 30 + hsh(i, 2) * 40; g.fillRect(x + 3, b, sw - 6, 5); g.fillRect(x + 3, 220 - hsh(i, 5) * 30, sw - 6, 4);
      if (hsh(i, 9) > 0.4) { g.fillStyle = 'rgba(245,235,205,0.85)'; g.fillRect(x + 4, 96 + hsh(i, 4) * 40, sw - 8, 44); }
    }
    // けいじばん（コルクと 紙）。字は 書かない（線だけ）。
    g.fillStyle = '#b88955'; g.fillRect(0, 256, 384, 256); blotches(g, 0, 256, 384, 256, 12, rnd, '110,70,30', '240,200,140', 0.12);
    const papers = [[24, 280, 96, 120, '#fff7e0'], [140, 276, 110, 84, '#d9f0e0'], [270, 284, 92, 130, '#fff0c8'], [130, 380, 120, 104, '#ffe0d6'], [28, 420, 84, 70, '#e0ecff'], [268, 430, 96, 62, '#fff7e0']];
    for (const [x, y, w, h, c] of papers) {
      g.fillStyle = 'rgba(60,35,10,0.25)'; g.fillRect(x + 4, y + 5, w, h); g.fillStyle = c; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(60,70,80,0.45)'; for (let l = 0; l < Math.floor(h / 16) - 1; l += 1) g.fillRect(x + 10, y + 16 + l * 16, (w - 20) * (0.55 + hsh(x, l) * 0.45), 5);
      g.fillStyle = '#d9534f'; g.beginPath(); g.arc(x + w / 2, y + 8, 6, 0, 7); g.fill();
    }
    // とけいの かお。
    g.fillStyle = '#fbf3df'; g.fillRect(384, 256, 256, 256); g.strokeStyle = '#3a2a1c'; g.lineCap = 'round';
    for (let i = 0; i < 12; i += 1) { const a = (i * Math.PI) / 6; g.lineWidth = i % 3 ? 5 : 10; g.beginPath(); g.moveTo(512 + Math.sin(a) * 96, 384 - Math.cos(a) * 96); g.lineTo(512 + Math.sin(a) * 112, 384 - Math.cos(a) * 112); g.stroke(); }
    // ひらいた 本の ページ（左右）。
    g.fillStyle = '#fbf4e2'; g.fillRect(640, 256, 384, 256);
    const sh = g.createLinearGradient(780, 0, 884, 0); sh.addColorStop(0, 'rgba(120,90,50,0)'); sh.addColorStop(0.5, 'rgba(120,90,50,0.45)'); sh.addColorStop(1, 'rgba(120,90,50,0)'); g.fillStyle = sh; g.fillRect(780, 256, 104, 256);
    g.fillStyle = 'rgba(50,50,60,0.5)';
    for (let l = 0; l < 11; l += 1) { g.fillRect(662, 290 + l * 19, 150 * (0.7 + hsh(l, 1) * 0.3), 7); if (l > 4) g.fillRect(852, 290 + l * 19, 150 * (0.7 + hsh(l, 3) * 0.3), 7); }
    g.fillStyle = '#e9a23b'; g.fillRect(856, 284, 70, 70); g.fillStyle = '#6fb08a'; g.fillRect(934, 284, 64, 70); g.fillStyle = '#c94f3d'; g.beginPath(); g.arc(891, 319, 20, 0, 7); g.fill();
  }, { repeat: false });
  const lead = tex(128, 128, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 2; c += 1) { g.fillStyle = `rgba(200,140,60,${0.08 + hsh(r, c) * 0.22})`; g.fillRect(c * 64, r * 32, 64, 32); }
    g.fillStyle = '#5a4630'; for (let i = 0; i < 2; i += 1) g.fillRect(i * 64 - 3, 0, 6, H); for (let i = 0; i < 4; i += 1) g.fillRect(0, i * 32 - 2, W, 4);
  });
  // 光の 板（加算）：左＝下から 上へ うすく なる あかり／右＝まるい あかり。
  const glow = tex(256, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
    const v = g.createLinearGradient(0, 128, 0, 0); v.addColorStop(0, '#ffffff'); v.addColorStop(0.35, '#8a8a8a'); v.addColorStop(1, '#000000'); g.fillStyle = v; g.fillRect(0, 0, 128, 128);
    const e = g.createLinearGradient(0, 0, 128, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.2, 'rgba(0,0,0,0)'); e.addColorStop(0.8, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = e; g.fillRect(0, 0, 128, 128);
    const r = g.createRadialGradient(192, 64, 0, 192, 64, 62); r.addColorStop(0, '#ffffff'); r.addColorStop(0.4, '#7a7a7a'); r.addColorStop(1, '#000000'); g.fillStyle = r; g.fillRect(128, 0, 128, 128);
  }, { repeat: false });
  // みがいた ゆかの うつりこみ（にせもの）：アーチの あかりと シャンデリアが ゆかに のびる。512px ＝ 30 × 30。
  const sheen = tex(512, 512, (g, W) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    const P = (x, z) => [(x / 30 + 0.5) * W, (z / 30 + 0.5) * W], k = W / 30;
    const blob = (x, z, rx, rz, rot, a) => { const [px, py] = P(x, z); g.save(); g.translate(px, py); g.rotate(rot); g.scale(rx * k, rz * k); const r = g.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, `rgba(255,205,140,${a})`); r.addColorStop(1, 'rgba(255,205,140,0)'); g.fillStyle = r; g.fillRect(-1, -1, 2, 2); g.restore(); };
    g.globalCompositeOperation = 'lighter';
    blob(0, 0, 4.6, 4.6, 0, 0.5);
    for (const i of [2, 3, 4, 5, 6]) { const th = (i * Math.PI) / 4, dx = Math.sin(th), dz = Math.cos(th); for (const s of [-1, 1]) blob(dx * 9.6 + dz * s * ARCH.off, dz * 9.6 - dx * s * ARCH.off, 1.5, 3.6, -th, 0.55); }
  }, { repeat: false });
  const S = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...o });
  shared = {
    brick: S({ map: brick, roughness: 0.9, color: brick ? 0xffffff : 0xd4763e }),
    stone: S({ map: stone, roughness: 0.85, color: stone ? 0xffffff : 0xece0c4 }),
    plaster: S({ map: plaster, roughness: 0.95, side: THREE.DoubleSide, color: plaster ? 0xffffff : 0xf0dfb8 }),
    // ドーム：下を 向く 面は 半球光の 地面の 色（みどり）に そまるので、自分でも 少し 光らせて 黄土色を たもつ（下からの あかりの つもり）。
    vault: new THREE.MeshStandardMaterial({ color: 0x9a7a4a, map: plaster, roughness: 1, side: THREE.DoubleSide, emissive: new THREE.Color(0xd9963c), emissiveMap: plaster, emissiveIntensity: 0.5 }),
    floor: new THREE.MeshPhysicalMaterial({ vertexColors: true, map: floor, color: floor ? 0xffffff : 0x8a5238, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.16 }),
    wood: S({ map: wood, roughness: 0.6, color: wood ? 0xffffff : 0xb07c46 }),
    plain: S({ roughness: 0.6 }),
    props: S({ map: props, roughness: 0.8, color: props ? 0xffffff : 0x8a6a4a }),
    win: new THREE.MeshStandardMaterial({ color: 0xc9a468, map: lead, roughness: 0.45, emissive: new THREE.Color(0xffc56e), emissiveMap: lead, emissiveIntensity: 0.5 }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glow: glow ? new THREE.MeshBasicMaterial({ map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6, side: THREE.DoubleSide }) : null,
    sheen: sheen ? new THREE.MeshBasicMaterial({ map: sheen, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }) : null,
    hand: new THREE.MeshBasicMaterial({ color: 0x2a211b }),
  };
  return shared;
}
const RULES = { brick: [1 / 4.4, 1 / 4.08], stone: [1 / 3, 1 / 3], plaster: [1 / 1.6, 1 / 1.6], floor: [1 / 4.6, 1 / 4.6], wood: [1 / 2, 1 / 2] };

const OAK = 0xffffff, OAK_D = 0xb89a78, WALNUT = 0x7d6248, IRON = 0x26221f, BRASS = 0xc9a24a, CREAM = 0xf3e7cc, LEATHER = 0x6e3b24, OCHRE = 0xf2bc6c, WARM = 0xffe0a6, GREEN = 0x3fca8c;

/* ───────── 形の 道具 ───────── */

// 絵の 中の 四角（px）を はった 板。XY 面・+z むき。
function aquad(x0, y0, x1, y1, z, r) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0).toNonIndexed(), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (r[0] + uv.getX(i) * (r[2] - r[0])) / AW, 1 - (r[3] - uv.getY(i) * (r[3] - r[1])) / AH);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z); return g;
}
// 光の 板：kind 0＝下から 上へ・1＝まるい。
function gquad(w, h, kind) {
  const g = new THREE.PlaneGeometry(w, h).toNonIndexed(), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, (kind + uv.getX(i) * 0.98 + 0.01) * 0.5);
  return g;
}
const flatY = (g) => { g.rotateX(-Math.PI / 2); return g; };       // たてた 板を ねかせる（+y むき）
// 上むきの 多角形（ゆか）。
function poly(points, y) {
  const pos = [], nor = [];
  for (let i = 1; i < points.length - 1; i += 1) for (const p of [points[0], points[i + 1], points[i]]) { pos.push(p[0], y, p[1]); nor.push(0, 1, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.computeVertexNormals(); const n = g.attributes.normal; if (n.getY(0) < 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { const t = [p.getX(i), p.getY(i), p.getZ(i)]; p.setXYZ(i, p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)); p.setXYZ(i + 1, ...t); } g.computeVertexNormals(); }
  return g;
}
// 下が あいた アーケードの かべ（アーチの あいだは 柱が ささえる）。
function arcadeShape(len, y1, arches) {
  const s = new THREE.Shape(), r = ARCH.w / 2, ys = ARCH.h - r;
  s.moveTo(0, 0); s.lineTo(arches[0] - r, 0); s.lineTo(arches[0] - r, ys);
  arches.forEach((cx, i) => { if (i) s.lineTo(cx - r, ys); s.absarc(cx, ys, r, Math.PI, 0, true); });
  s.lineTo(arches[arches.length - 1] + r, 0); s.lineTo(len, 0); s.lineTo(len, y1); s.lineTo(0, y1); s.lineTo(0, 0);
  return s;
}

export function buildLibraryInterior() {
  const M = materials(), group = new THREE.Group(); group.name = 'library-interior';
  const B = createBatch(RULES), U = createBatch(RULES), CH = createBatch(RULES);     // ふだん・上（てんじょう）・シャンデリア
  const obstacles = [], ob = (x, z, w, d) => obstacles.push({ x: +x.toFixed(2), z: +z.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2) });
  const rnd = rng(77);
  const put = (m, T = B) => (key, g, o) => T.add(key, g.applyMatrix4(m), o);
  // 面 i の 置き方：x＝かべに そって（0〜FW）・+z＝へやの 内がわ・-z＝かべの おく。i＝0 南・2 東・4 北・6 西。
  const faceM = (i) => { const th = (i * Math.PI) / 4; return mat4(Math.sin(th) * A, 0, Math.cos(th) * A, th + Math.PI).multiply(mat4(-FW / 2, 0, 0)); };
  const TALL = [2, 3, 4, 5, 6];
  const glowOn = !!M.glow;

  /* ── ゆか ── */
  const oct = (apo) => Array.from({ length: 8 }, (_, k) => { const a = ((k + 0.5) * Math.PI) / 4, r = apo / Math.cos(Math.PI / 8); return [Math.sin(a) * r, Math.cos(a) * r]; });
  B.add('floor', poly(oct(A + 0.02), 0));
  for (const i of TALL) put(faceM(i))('floor', flatY(new THREE.PlaneGeometry(FW + 0.9, WT + 0.1).toNonIndexed()).translate(FW / 2, 0, -WT / 2 - 0.03));   // アーチの 下
  B.add('floor', poly([[-VEST.hw - 0.5, A], [VEST.hw + 0.5, A], [VEST.hw + 0.5, VEST.z1 + 0.6], [-VEST.hw - 0.5, VEST.z1 + 0.6]], 0));
  for (const s of [-1, 1]) B.add('wood', poly([[s * (A + WT - 0.05), -ROOM.z - 0.4], [s * (ROOM.x1 + 0.4), -ROOM.z - 0.4], [s * (ROOM.x1 + 0.4), ROOM.z + 0.4], [s * (A + WT - 0.05), ROOM.z + 0.4]], -0.01), { color: 0xe6c9a0 });
  if (M.sheen) { const g = flatY(new THREE.PlaneGeometry(30, 30).toNonIndexed()); g.translate(0, 0.02, 0); B.add('sheen', g, { uv: 'keep' }); }
  // まんなかの 石の もよう（八つの 星）。
  { const ring = new THREE.RingGeometry(2.05, 2.35, 40).toNonIndexed(); flatY(ring); ring.translate(0, 0.012, 0); B.add('plain', ring, { color: 0xe9dcc0 });
    const disc = new THREE.CircleGeometry(2.05, 40).toNonIndexed(); flatY(disc); disc.translate(0, 0.008, 0); B.add('plain', disc, { color: 0x231f20 });
    for (let k = 0; k < 8; k += 1) { const a = (k * Math.PI) / 4, L = k % 2 ? 1.25 : 1.95, w = 0.42; for (const s of [-1, 1]) B.add('plain', poly([[0, 0], [Math.sin(a) * L, Math.cos(a) * L], [Math.sin(a + s * 0.42) * w, Math.cos(a + s * 0.42) * w]], 0.016), { color: s > 0 ? 0xc0603a : 0xe9dcc0 }); } }
  // 赤い じゅうたん（げんかんから まんなかへ）。
  B.add('plain', box(0, 0.006, 13.1, 2.2, 0.02, 9.0), { color: 0x8c2f2a });
  for (const s of [-1, 1]) B.add('plain', box(s * 1.0, 0.008, 13.1, 0.12, 0.022, 9.0), { color: 0xc9a24a });

  /* ── 大広間の かべ 1 面 ── */
  function face(i, T, { arches = [FW / 2 - ARCH.off, FW / 2 + ARCH.off], kind = 'open' } = {}) {
    const P = put(faceM(i), T), r = ARCH.w / 2, ys = ARCH.h - r;
    // 下の だん：大アーチ。
    P('brick', plate(arcadeShape(FW, Y.arc, arches), WT, { seg: 14 }));
    for (const cx of arches) { const a = plate(archRing(cx, ys, ARCH.w, r, 0.34), 0.12, { seg: 14 }); a.translate(0, 0, 0.07); P('stone', a); }
    // はしの 柱がた と まんなかの 太い 柱。
    const piers = [arches[0] - r, arches[arches.length - 1] + r];
    P('stone', box((piers[0]) / 2, ys - 0.12, -WT / 2 + 0.04, piers[0] + 0.02, 0.26, WT + 0.2)); P('stone', box((piers[1] + FW) / 2, ys - 0.12, -WT / 2 + 0.04, FW - piers[1] + 0.02, 0.26, WT + 0.2));
    P('stone', box(piers[0] / 2, 0, -WT / 2 + 0.04, piers[0] + 0.02, 0.5, WT + 0.16), { color: 0xd8ccb2 }); P('stone', box((piers[1] + FW) / 2, 0, -WT / 2 + 0.04, FW - piers[1] + 0.02, 0.5, WT + 0.16), { color: 0xd8ccb2 });
    if (arches.length === 2) {
      const cx = FW / 2, cz = -WT / 2;
      P('stone', box(cx, 0, cz, 1.12, 0.3, 1.12), { color: 0xd8ccb2 }); P('stone', cyl(cx, 0.3, cz, 0.44, 0.5, 0.22, 14));
      P('stone', cyl(cx, 0.52, cz, 0.36, 0.4, ys - 1.12, 14), { uv: 'keep' });
      P('stone', cyl(cx, ys - 0.6, cz, 0.56, 0.37, 0.36, 14), { uv: 'keep' }); P('stone', box(cx, ys - 0.24, cz, 1.2, 0.24, 1.16));
    }
    // おび・上の だん（2 れんの 小さな アーチの まど）・コーニス。
    P('stone', box(FW / 2, Y.arc, 0.1, FW, Y.str - Y.arc, 0.36));
    const up = rectShape(0, Y.str, FW, Y.cl);
    for (const cx of arches.length === 2 ? arches : [FW / 2 - ARCH.off, FW / 2 + ARCH.off]) {
      for (const dx of [-0.62, 0.62]) {
        up.holes.push(archPath(cx + dx, 7.45, 0.86, 1.95));
        const q = new THREE.PlaneGeometry(1.0, 2.1).toNonIndexed(); { const uv = q.attributes.uv; for (let k = 0; k < uv.count; k += 1) uv.setXY(k, uv.getX(k) * 1.6, uv.getY(k) * 3.2); } q.translate(cx + dx, 8.45, -0.4); P('win', q, { uv: 'keep' });
        const rr = plate(archRing(cx + dx, 7.45, 0.86, 1.95, 0.12), 0.09, { seg: 8 }); rr.translate(0, 0, 0.06); P('stone', rr);
      }
      P('stone', cyl(cx, 7.45, -0.1, 0.1, 0.1, 1.5, 8), { uv: 'keep' }); P('stone', box(cx, 7.28, 0.06, 2.5, 0.17, 0.34));
    }
    P('brick', plate(up, 0.5, { seg: 8, rim: false }));
    P('stone', box(FW / 2, Y.cl, 0.14, FW + 0.2, 0.2, 0.5)); P('stone', box(FW / 2, Y.cl + 0.2, 0.22, FW + 0.4, 0.2, 0.66), { color: 0xe0d2b4 });
    P('stone', box(FW / 2, Y.top, -WT / 2, FW + 0.6, 0.12, WT + 0.3), { color: 0xd8ccb2 });
    P('brick', plate(arcadeShape(FW, Y.top, arches), 0.02, { seg: 14, rim: false }).applyMatrix4(mat4(FW, 0, -WT, Math.PI)), { color: 0xe6d6c6 });   // うらの 面（部屋から 見える）
    if (kind === 'blind') P('brick', box(FW / 2, 0, -WT - 0.1, FW, Y.arc, 0.2), { color: 0xcdb8a6 });
  }

  // アーチの おくの 小部屋（本だな・上からの あかり）。
  function alcove(i) {
    const m = faceM(i), P = put(m), dep = 2.6, z1 = -WT - dep;
    P('plaster', box(FW / 2, 0, z1 - 0.15, FW + 0.3, Y.arc, 0.3), { color: 0xf0d6a8 });
    for (const x of [-0.05, FW + 0.05]) P('plaster', box(x, 0, -WT - dep / 2, 0.3, Y.arc, dep), { color: 0xe6c898 });
    P('plain', box(FW / 2, Y.arc - 0.06, -WT - dep / 2, FW + 0.4, 0.14, dep + 0.5), { color: 0x4a3524 });
    P('wood', flatY(new THREE.PlaneGeometry(FW, dep).toNonIndexed()).translate(FW / 2, 0.004, -WT - dep / 2), { color: 0xd8b98c });
    shelf(put(m.clone().multiply(mat4(FW / 2, 0, z1 + 0.38))), FW - 0.5, { h: 4.3, rows: 6 });
    P('lamp', box(FW / 2, 4.36, z1 + 0.42, FW - 0.9, 0.06, 0.3), { color: 0xffd9a0 });                 // 本だなの 上の あかり
    if (glowOn) { const g = gquad(FW - 0.4, 2.3, 0); g.translate(FW / 2, 5.5, z1 + 0.02); P('glow', g, { color: 0xffb060, uv: 'keep' });
      for (const cx of [FW / 2 - ARCH.off, FW / 2 + ARCH.off]) { const f = flatY(gquad(3.4, 2.4, 1)); f.translate(cx, 0.03, -WT - 0.9); P('glow', f, { color: 0x9a6a38, uv: 'keep' }); } }
  }

  /* ── 家具 ── */
  // 本だな（まんなかが 原点・+z が 前）。本は「せ」の 絵を はった 板（高さと おくゆきが 少しずつ ちがう）。
  function shelf(F, len, { h = 4.3, rows = 6, dep = 0.72 } = {}) {
    F('wood', box(0, 0, -dep / 2 + 0.03, len, h, 0.06), { color: 0x6a5038 });
    for (const s of [-1, 1]) F('wood', box(s * (len / 2 - 0.05), 0, 0, 0.1, h, dep), { color: WALNUT });
    const bays = Math.max(1, Math.round(len / 2.4));
    for (let b = 1; b < bays; b += 1) F('wood', box(-len / 2 + (len * b) / bays, 0, 0, 0.08, h, dep - 0.02), { color: WALNUT });
    F('wood', box(0, 0, 0.02, len, 0.2, dep), { color: WALNUT }); F('wood', box(0, h - 0.1, 0.03, len + 0.12, 0.14, dep + 0.1), { color: WALNUT });
    const rh = (h - 0.32) / rows, sw = AW / 48;
    for (let r = 0; r < rows; r += 1) {
      const y = 0.2 + r * rh;
      if (r) F('wood', box(0, y - 0.05, 0, len - 0.14, 0.05, dep - 0.06), { color: WALNUT });
      for (let b = 0; b < bays; b += 1) {
        let x = -len / 2 + (len * b) / bays + 0.1; const end = -len / 2 + (len * (b + 1)) / bays - 0.1;
        while (x < end - 0.25) {
          if (rnd() < 0.1) { x += 0.18 + rnd() * 0.3; continue; }
          const n = 2 + Math.floor(rnd() * 5), w = Math.min(end - x, n * 0.118), i0 = Math.floor(rnd() * (48 - n)), bh = rh * (0.6 + rnd() * 0.3), l = 0.8 + rnd() * 0.2;
          F('props', aquad(x, y, x + w, y + bh, dep / 2 - 0.1 - rnd() * 0.07, [i0 * sw, 3, (i0 + w / 0.118) * sw, 250]), { color: new THREE.Color(l, l, l).getHex(), uv: 'keep' });
          x += w + 0.012;
        }
      }
    }
  }
  // ミッションふうの いす（+z が 前）。arm＝ひじかけ いす。
  function chair(F, { arm = false, wide = 0.74 } = {}) {
    const w = arm ? 1.05 : wide, d = arm ? 0.95 : 0.74, sh = 0.58, leg = arm ? 0.12 : 0.09, bh = arm ? 1.4 : 1.45, ah = 0.92;
    for (const sx of [-1, 1]) {
      F('wood', box(sx * (w / 2 - leg / 2), 0, d / 2 - leg / 2, leg, arm ? ah : sh, leg), { color: OAK_D });
      F('wood', box(sx * (w / 2 - leg / 2), 0, -d / 2 + leg / 2, leg, bh, leg), { color: OAK_D });
      F('wood', box(sx * (w / 2 - leg / 2), 0.22, 0, leg * 0.6, 0.07, d - leg * 2), { color: OAK_D });
      if (arm) { F('wood', box(sx * (w / 2 - 0.02), ah, 0.02, 0.2, 0.07, d + 0.08)); for (const z of [-0.2, 0.05, 0.3]) F('wood', box(sx * (w / 2 - leg / 2), sh, z, 0.05, ah - sh, 0.1), { color: OAK_D }); }
    }
    F('wood', box(0, sh - 0.08, 0, w - 0.04, 0.09, d - 0.04));
    if (arm) F('plain', box(0, sh, 0.03, w - leg * 2 - 0.06, 0.12, d - 0.2), { color: LEATHER });
    F('wood', box(0, bh - 0.16, -d / 2 + leg / 2, w - leg * 2, 0.16, 0.06)); F('wood', box(0, sh + 0.14, -d / 2 + leg / 2, w - leg * 2, 0.08, 0.06));
    const n = arm ? 5 : 4; for (let k = 0; k < n; k += 1) F('wood', box(-(w - leg * 2) / 2 + ((k + 0.5) * (w - leg * 2)) / n, sh + 0.2, -d / 2 + leg / 2, 0.09, bh - sh - 0.36, 0.04), { color: OAK_D });
  }
  function bench(F, w = 2.6) {
    const d = 0.8, sh = 0.58, bh = 1.4;
    for (const sx of [-1, 1]) { F('wood', box(sx * (w / 2 - 0.07), 0, d / 2 - 0.07, 0.14, 0.92, 0.14), { color: OAK_D }); F('wood', box(sx * (w / 2 - 0.07), 0, -d / 2 + 0.07, 0.14, bh, 0.14), { color: OAK_D }); F('wood', box(sx * (w / 2 - 0.04), 0.92, 0, 0.2, 0.07, d + 0.06)); }
    F('wood', box(0, sh - 0.08, 0, w - 0.06, 0.1, d - 0.04)); F('wood', box(0, bh - 0.18, -d / 2 + 0.07, w - 0.28, 0.18, 0.07)); F('wood', box(0, sh + 0.12, -d / 2 + 0.07, w - 0.28, 0.08, 0.07));
    const n = Math.round(w / 0.24); for (let k = 0; k < n; k += 1) F('wood', box(-(w - 0.3) / 2 + ((k + 0.5) * (w - 0.3)) / n, sh + 0.2, -d / 2 + 0.07, 0.1, bh - sh - 0.38, 0.04), { color: OAK_D });
  }
  // みどりの かさの つくえランプ（バンカーズ ランプ）と、つくえの 上の あかり。
  function bankerLamp(F, x, y, z) {
    F('plain', cyl(x, y, z, 0.13, 0.15, 0.04, 10), { color: BRASS }); F('plain', cyl(x, y + 0.04, z, 0.025, 0.025, 0.34, 6), { color: BRASS });
    const s = new THREE.CylinderGeometry(0.11, 0.11, 0.46, 10, 1, false, 0, Math.PI).toNonIndexed(); s.rotateZ(Math.PI / 2); s.rotateX(-Math.PI / 2); s.translate(x, y + 0.36, z + 0.04); F('lamp', s, { color: GREEN });
    F('lamp', box(x, y + 0.33, z + 0.04, 0.4, 0.03, 0.16), { color: 0xfff0c0 });
    if (glowOn) { const g = flatY(gquad(1.5, 1.1, 1)); g.translate(x, y + 0.012, z + 0.3); F('glow', g, { color: 0xb08a50, uv: 'keep' }); }
  }
  function bookPile(F, x, y, z, n = 3) {
    const C = [0x8c2f2a, 0x2f5d48, 0x2c4a78, 0xb88a3e, 0x7a2f4f];
    for (let k = 0; k < n; k += 1) { const g = box(0, 0, 0, 0.5 - k * 0.03, 0.09, 0.36); g.applyMatrix4(mat4(x, y + k * 0.09, z, (rnd() - 0.5) * 0.7)); F('plain', g, { color: C[Math.floor(rnd() * C.length)] }); }
  }
  // よみものの つくえ（3.4 × 1.5）と いす 4 つ。
  function readingTable(x, z) {
    const F = put(mat4(x, 0, z)), th = 1.0;
    F('wood', box(0, th, 0, 3.4, 0.1, 1.5)); F('wood', box(0, th - 0.16, 0, 3.0, 0.16, 1.14), { color: OAK_D });
    for (const sx of [-1, 1]) { for (const sz of [-1, 1]) F('wood', box(sx * 1.5, 0, sz * 0.56, 0.16, th, 0.16), { color: OAK_D }); F('wood', box(sx * 1.5, 0.22, 0, 0.1, 0.12, 1.0), { color: OAK_D }); }
    F('wood', box(0, 0.24, 0, 3.0, 0.1, 0.12), { color: OAK_D });
    bankerLamp(F, 0, th + 0.1, -0.15); bookPile(F, -1.0, th + 0.1, 0.1, 3); bookPile(F, 1.05, th + 0.1, -0.2, 2);
    F('props', flatY(aquad(-0.4, -0.27, 0.4, 0.27, 0, [640, 256, 1024, 512])).applyMatrix4(mat4(0.35, th + 0.112, 0.38, 0.2)), { uv: 'keep' });
    for (const sx of [-0.85, 0.85]) { chair(put(mat4(x + sx, 0, z - 1.12))); chair(put(mat4(x + sx, 0, z + 1.12, Math.PI))); }
    ob(x, z, 1.8, 1.6);
  }
  // じしゅうしつの しきりつきの つくえ（+z が すわる がわ）。
  function carrel(F, lampSide = 1) {
    const w = 1.8, d = 1.0, th = 1.0, ph = 1.72;
    F('wood', box(0, th, 0, w - 0.08, 0.08, d)); F('wood', box(0, 0, -d / 2 + 0.03, w, ph, 0.06), { color: OAK_D });
    for (const sx of [-1, 1]) F('wood', box(sx * (w / 2 - 0.03), 0, 0, 0.06, ph, d), { color: OAK_D });
    F('wood', box(0, ph - 0.36, -d / 2 + 0.17, w - 0.12, 0.05, 0.28));
    bankerLamp(F, lampSide * 0.5, th + 0.08, -0.04);
    F('plain', box(-lampSide * 0.2, th + 0.08, 0.12, 0.5, 0.012, 0.36), { color: 0xfbf4e2 }); F('plain', box(-lampSide * 0.2 + 0.34, th + 0.08, 0.14, 0.03, 0.03, 0.3), { color: 0xe8b23a });
    bookPile(F, -lampSide * 0.55, ph - 0.31, -d / 2 + 0.17, 2);
    chair(put(mat4(0, 0, d / 2 + 0.36, Math.PI).premultiply(F.m)));
  }
  const putM = (m) => { const f = put(m); f.m = m; return f; };

  /* ── 大広間 ── */
  for (const i of TALL) face(i, B);
  for (const i of [3, 4, 5]) alcove(i);
  // 南がわ 3 面：こしかべ（1.1）。南の まんなかは げんかんへ あいて いる。
  const LOW = 1.1, wallLow = (P, x0, x1, t = 0.6) => { P('brick', box((x0 + x1) / 2, 0, -t / 2, x1 - x0, LOW, t)); P('stone', box((x0 + x1) / 2, LOW, -t / 2, x1 - x0 + 0.1, 0.14, t + 0.16)); };
  for (const i of [1, 7]) wallLow(put(faceM(i)), -0.2, FW + 0.2);
  { const P = put(faceM(0)); wallLow(P, -0.2, FW / 2 - VEST.hw); wallLow(P, FW / 2 + VEST.hw, FW + 0.2); }
  // ドームの すそ（コーブ）と、ドーム ぜんぶ（上の グループ）。
  const N = 6, HD = 4.4, AD = A - 0.1;
  for (let i = 0; i < 8; i += 1) {
    const th = (i * Math.PI) / 4, dx = Math.sin(th), dz = Math.cos(th), tn = Math.tan(Math.PI / 8);
    for (let j = 0; j < N; j += 1) {
      const T = TALL.includes(i) && j < 2 ? B : U, pos = [], nor = [], uv = [];
      const ring = (jj) => { const s = (jj / N) * Math.PI * 0.5, a = AD * Math.cos(s), y = Y.top + 0.1 + HD * Math.sin(s), n = new THREE.Vector2(HD * Math.cos(s), AD * Math.sin(s)).normalize(); return { a, y, n, arc: jj * 3.3 }; };
      const r0 = ring(j), r1 = ring(j + 1);
      const V = (r, side) => { const lat = side * r.a * tn; pos.push(dx * r.a + dz * lat, r.y, dz * r.a - dx * lat); nor.push(-dx * r.n.x, -r.n.y, -dz * r.n.x); uv.push(lat / 1.6, r.arc / 1.6); };
      V(r0, -1); V(r1, -1); V(r0, 1); V(r0, 1); V(r1, -1); V(r1, 1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      T.add('vault', g, { uv: 'keep' });
    }
    // かどの リブ（石の おび）。
    const a0 = th + Math.PI / 8, k = 1 / Math.cos(Math.PI / 8);
    for (let j = 0; j < N; j += 1) {
      const T = TALL.includes(i) && TALL.includes((i + 1) % 8) && j < 2 ? B : U;
      const p = (jj) => { const s = (jj / N) * Math.PI * 0.5, a = (AD - 0.06) * Math.cos(s) * k; return [Math.sin(a0) * a, Y.top + 0.06 + HD * Math.sin(s), Math.cos(a0) * a]; };
      T.add('lamp', beam(p(j), p(j + 1), 0.3, 0.16), { color: 0xcdb98e, uv: 'keep' });
    }
  }
  { const boss = cyl(0, Y.top + HD - 0.25, 0, 0.9, 0.6, 0.3, 16); U.add('lamp', boss, { color: 0xcdb98e, uv: 'keep' }); }

  // つくえと いす（まんなかの 通り道は あける）。
  readingTable(-5.6, -3.2); readingTable(5.6, -3.2); readingTable(-5.6, 3.6); readingTable(5.6, 3.6);
  for (const s of [-1, 1]) {
    // ひじかけ いす 2 つと 小さな まるい つくえ（北東・北西の アーチの 前）。
    chair(put(mat4(s * 6.15, 0, -8.3, s * Math.PI / 2)), { arm: true }); chair(put(mat4(s * 8.65, 0, -8.3, -s * Math.PI / 2)), { arm: true });
    const F = put(mat4(s * 7.4, 0, -8.3)); F('wood', cyl(0, 0.8, 0, 0.5, 0.5, 0.07, 16), { uv: 'keep' }); F('wood', cyl(0, 0, 0, 0.07, 0.1, 0.8, 8), { color: OAK_D, uv: 'keep' }); F('wood', cyl(0, 0, 0, 0.3, 0.34, 0.06, 12), { color: OAK_D, uv: 'keep' }); bookPile(F, 0, 0.87, 0, 2);
    ob(s * 7.4, -8.3, 1.9, 0.62);
    // 南東・南西の こしかべの 前の ベンチ（まんなかを 向く）。
    const bx = s * 8.25, bz = 8.25; bench(put(mat4(bx, 0, bz, Math.atan2(-s, -1)))); ob(bx, bz, 1.25, 1.25);
    // 入り口の わきの うえき。
    const G = put(mat4(s * 3.6, 0, 11.6)); G('plain', cyl(0, 0, 0, 0.42, 0.32, 0.6, 10), { color: 0xa8552c });
    for (const [px, py, pz, r] of [[0, 1.05, 0, 0.5], [0.22, 1.5, 0.1, 0.36], [-0.2, 1.45, -0.12, 0.34], [0, 1.85, 0, 0.26]]) { const b = new THREE.SphereGeometry(r, 8, 6).toNonIndexed(); b.translate(px, py, pz); G('plain', b, { color: 0x3f7a45 }); }
    ob(s * 3.6, 11.6, 0.45, 0.45);
  }

  /* ── げんかん（南）── */
  for (const s of [-1, 1]) {
    B.add('brick', box(s * (VEST.hw + 0.25), 0, (A + VEST.z1) / 2, 0.5, LOW, VEST.z1 - A + 0.5)); B.add('stone', box(s * (VEST.hw + 0.25), LOW, (A + VEST.z1) / 2, 0.66, 0.14, VEST.z1 - A + 0.6));
    B.add('brick', box(s * (VEST.hw + 0.25), 0, VEST.z1, 0.7, 1.7, 0.7)); B.add('stone', box(s * (VEST.hw + 0.25), 1.7, VEST.z1, 0.86, 0.16, 0.86));
    const globe = new THREE.SphereGeometry(0.24, 10, 8).toNonIndexed(); globe.translate(s * (VEST.hw + 0.25), 2.14, VEST.z1); B.add('lamp', globe, { color: WARM }); B.add('plain', cyl(s * (VEST.hw + 0.25), 1.86, VEST.z1, 0.06, 0.1, 0.1, 8), { color: IRON });
    ob(s * (VEST.hw + 0.3), (A + VEST.z1) / 2 + 0.2, 0.36, (VEST.z1 - A) / 2 + 0.5);
    ob(s * (FW / 4 + VEST.hw / 2), A + 0.3, FW / 4 - VEST.hw / 2 + 0.1, 0.4);
  }
  B.add('plain', box(0, 0.012, VEST.z1 - 0.2, 2.6, 0.03, 1.1), { color: 0x2f5d48 });                     // 出口の マット
  if (glowOn) { const g = flatY(gquad(3.4, 2.2, 1)); g.translate(0, 0.05, VEST.z1 - 0.2); B.add('glow', g, { color: 0x6fd0a0, uv: 'keep' }); }
  ob(0, VEST.z1 + 1.3, VEST.hw + 0.6, 0.3);

  /* ── 東西の 部屋（かべ）── */
  for (const s of [-1, 1]) {
    const xm = s * (ROOM.x0 + ROOM.x1) / 2, len = ROOM.x1 - ROOM.x0;
    B.add('plaster', box(xm + s * 0.2, 0, -ROOM.z - 0.2, len + 0.4, ROOM.h, 0.4)); B.add('wood', box(xm, 0, -ROOM.z + 0.03, len, 1.5, 0.06), { color: WALNUT });
    B.add('plaster', box(s * (ROOM.x1 + 0.2), 0, 0, 0.4, ROOM.h, ROOM.z * 2 + 0.8)); B.add('wood', box(s * (ROOM.x1 - 0.03), 0, 0, 0.06, 1.5, ROOM.z * 2), { color: WALNUT });
    B.add('stone', box(xm + s * 0.2, ROOM.h, -ROOM.z - 0.2, len + 0.6, 0.14, 0.56)); B.add('stone', box(s * (ROOM.x1 + 0.2), ROOM.h, 0, 0.56, 0.14, ROOM.z * 2 + 0.9));
    B.add('plaster', box(xm + s * 0.2, 0, ROOM.z + 0.2, len + 0.4, LOW, 0.4)); B.add('wood', box(xm + s * 0.2, LOW, ROOM.z + 0.2, len + 0.5, 0.1, 0.52));
    // 大広間の かべと 部屋の かべの すきま（かど）。
    B.add('plaster', box(s * (ROOM.x0 - 0.1), 0, -(ROOM.z + FW / 2) / 2, 0.5, ROOM.h, ROOM.z - FW / 2 + 0.3)); B.add('plaster', box(s * (ROOM.x0 - 0.1), 0, (ROOM.z + FW / 2) / 2, 0.5, LOW, ROOM.z - FW / 2 + 0.3));
    ob(xm, -ROOM.z - 0.2, len / 2 + 0.4, 0.3); ob(xm, ROOM.z + 0.2, len / 2 + 0.4, 0.3); ob(s * (ROOM.x1 + 0.2), 0, 0.3, ROOM.z + 0.4);
    for (const f of [-1, 1]) ob(s * (ROOM.x0 - 0.3), f * (ROOM.z + FW / 2 - 0.84) / 2, 0.7, (ROOM.z - FW / 2 + 0.84) / 2 + 0.05);
    ob(s * (A + WT / 2), 0, 0.62, 0.62);                                                                  // まんなかの 柱
    // 上（一人称）：南の かべと てんじょう。
    U.add('plaster', box(xm + s * 0.2, LOW, ROOM.z + 0.2, len + 0.4, ROOM.h - LOW, 0.4));
    U.add('plaster', box(xm, ROOM.h, 0, len + 0.8, 0.2, ROOM.z * 2 + 0.8), { color: 0xf4e2c0 });
    U.add('plaster', box(s * (ROOM.x0 - 0.1), LOW, (ROOM.z + FW / 2) / 2, 0.5, ROOM.h - LOW, ROOM.z - FW / 2 + 0.3));
  }

  /* ── としょしつ（西）── */
  {
    const x0 = -ROOM.x1, x1 = -ROOM.x0;
    shelf(put(mat4((x0 + x1) / 2 - 0.1, 0, -ROOM.z + 0.42)), 9.8, { h: 4.6, rows: 6 }); ob((x0 + x1) / 2 - 0.1, -ROOM.z + 0.42, 4.95, 0.42);
    shelf(put(mat4(x0 + 0.42, 0, -2.75, Math.PI / 2)), 6.1, { h: 4.6, rows: 6 }); ob(x0 + 0.42, -2.75, 0.42, 3.1);
    // ひくい 両面の 本だな（2 つの アーチの あいだ）。
    for (const r of [0, Math.PI]) shelf(put(mat4(-17.5, 0, r ? -0.36 : 0.36, r)), 3.6, { h: 2.3, rows: 3, dep: 0.7 }); ob(-17.5, 0, 1.85, 0.72);
    bookPile(put(mat4(-17.5, 0, 0)), 0.6, 2.32, 0, 3);
    // しょけんだい と 大きな ひらいた 本（ここで 本を よむ）。
    { const F = put(mat4(-19.2, 0, -4.1));
      F('wood', box(0, 0, 0, 1.0, 0.16, 0.8), { color: WALNUT }); F('wood', box(0, 0.16, 0, 0.5, 0.95, 0.4), { color: OAK_D }); F('wood', box(0, 1.11, 0, 0.8, 0.08, 0.6), { color: WALNUT });
      const tilt = new THREE.Matrix4().makeRotationX(0.5).setPosition(0, 1.52, 0.05);
      const desk = box(0, -0.06, 0, 1.7, 0.1, 1.15); desk.applyMatrix4(tilt); F('wood', desk);
      const lip = box(0, 0.04, 0.55, 1.7, 0.1, 0.06); lip.applyMatrix4(tilt); F('wood', lip, { color: WALNUT });
      const cover = box(0, 0.04, -0.02, 1.52, 0.05, 1.0); cover.applyMatrix4(tilt); F('plain', cover, { color: 0x8c2f2a });
      const pages = box(0, 0.09, -0.02, 1.44, 0.07, 0.94); pages.applyMatrix4(tilt); F('plain', pages, { color: 0xf3ead2 });
      const top = flatY(aquad(-0.72, -0.47, 0.72, 0.47, 0, [640, 256, 1024, 512])); top.translate(0, 0.165, -0.02); top.applyMatrix4(tilt); F('props', top, { uv: 'keep' });
      if (glowOn) { const g = flatY(gquad(3.6, 3.0, 1)); g.translate(0, 0.04, 1.2); F('glow', g, { color: 0xb88a40, uv: 'keep' }); }
      F('plain', box(0, 0.004, 1.5, 3.6, 0.02, 2.6), { color: 0x7a2f2a }); F('plain', box(0, 0.006, 1.5, 3.1, 0.022, 2.1), { color: 0x9c4a34 });
      ob(-19.2, -4.1, 0.9, 0.62); }
    // ししょの つくえ（西の かべの 前・東を 向く）。
    { const F = put(mat4(-21.6, 0, 3.3, Math.PI / 2));      // この 中では +z が 子どもの がわ（東）
      F('wood', box(0, 1.1, 0, 3.5, 0.1, 1.3)); F('wood', box(0, 0, 0.52, 3.3, 1.1, 0.1), { color: OAK_D });
      for (const sx of [-1, 1]) { F('wood', box(sx * 1.6, 0, 0, 0.1, 1.1, 1.14), { color: OAK_D }); F('wood', box(sx * 0.8, 0.18, 0.58, 1.3, 0.74, 0.03), { color: WALNUT }); }
      F('wood', box(0, 1.2, 0.5, 3.5, 0.16, 0.12), { color: WALNUT });
      bankerLamp(F, -1.15, 1.2, -0.1); bookPile(F, 1.1, 1.2, -0.1, 4); bookPile(F, 0.5, 1.2, 0.0, 2);
      F('plain', cyl(-0.3, 1.2, 0.1, 0.02, 0.11, 0.1, 10), { color: BRASS }); F('plain', box(-0.3, 1.3, 0.1, 0.03, 0.04, 0.03), { color: BRASS });
      ob(-21.6, 3.3, 0.7, 1.8); }
    // ひじかけ いすと ちきゅうぎ。
    chair(put(mat4(-15.5, 0, 5.3, -Math.PI / 2)), { arm: true }); ob(-15.5, 5.3, 0.6, 0.65);
    { const F = put(mat4(-23.6, 0, 5.6)); F('wood', cyl(0, 0, 0, 0.32, 0.36, 0.08, 12), { color: WALNUT, uv: 'keep' }); F('wood', cyl(0, 0.08, 0, 0.05, 0.05, 1.0, 8), { color: WALNUT, uv: 'keep' });
      const gl = new THREE.SphereGeometry(0.42, 14, 10).toNonIndexed(); gl.translate(0, 1.5, 0); F('plain', gl, { color: 0x3f7fa8 });
      for (const [a, b, r] of [[0.6, 0.4, 0.2], [2.4, -0.1, 0.24], [4.2, 0.5, 0.17], [5.2, -0.4, 0.15]]) { const c = new THREE.SphereGeometry(r, 7, 5).toNonIndexed(); c.scale(1, 1, 0.3); c.lookAt(new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b))); c.translate(Math.cos(a) * Math.cos(b) * 0.37, 1.5 + Math.sin(b) * 0.37, Math.sin(a) * Math.cos(b) * 0.37); F('plain', c, { color: 0x6fa860 }); }
      const arc = new THREE.TorusGeometry(0.47, 0.02, 5, 20, Math.PI).toNonIndexed(); arc.rotateZ(-Math.PI / 2); arc.translate(0, 1.5, 0); F('plain', arc, { color: BRASS }); ob(-23.6, 5.6, 0.45, 0.45); }
  }

  /* ── じしゅうしつ（東）── */
  {
    const zN = -ROOM.z + 0.52;
    for (const [k, x] of [16.5, 18.3, 20.1, 21.9].entries()) carrel(putM(mat4(x, 0, zN)), k % 2 ? -1 : 1);
    ob(19.2, zN + 0.5, 3.65, 1.25);
    for (const [k, x] of [17.5, 19.3, 21.1].entries()) { carrel(putM(mat4(x, 0, 0.1, Math.PI)), k % 2 ? 1 : -1); carrel(putM(mat4(x, 0, 1.1)), k % 2 ? -1 : 1); }
    ob(19.3, 0.6, 2.75, 2.2);
    // けいじばん と かべの とけい（北の かべ）。
    const zw = -ROOM.z + 0.07;
    B.add('wood', box(16.6, 3.0, zw - 0.02, 3.0, 2.0, 0.08), { color: WALNUT }); B.add('props', aquad(16.6 - 1.38, 3.12, 16.6 + 1.38, 4.88, zw + 0.03, [0, 256, 384, 512]), { uv: 'keep' });
    const fr = new THREE.TorusGeometry(0.74, 0.09, 8, 28).toNonIndexed(); fr.translate(21.3, 4.1, zw + 0.02); B.add('wood', fr, { color: WALNUT, uv: 'keep' });
    B.add('props', aquad(21.3 - 0.72, 4.1 - 0.72, 21.3 + 0.72, 4.1 + 0.72, zw + 0.03, [400, 272, 624, 496]), { uv: 'keep' });
    // 東の かべの ひくい 本だな と うえき。
    shelf(put(mat4(ROOM.x1 - 0.4, 0, -1.2, -Math.PI / 2)), 4.2, { h: 2.3, rows: 3, dep: 0.66 }); ob(ROOM.x1 - 0.4, -1.2, 0.4, 2.15);
    const G = put(mat4(23.7, 0, 5.7)); G('plain', cyl(0, 0, 0, 0.42, 0.32, 0.6, 10), { color: 0xa8552c });
    for (const [px, py, pz, r] of [[0, 1.05, 0, 0.5], [0.22, 1.5, 0.1, 0.36], [-0.2, 1.45, -0.12, 0.34], [0, 1.85, 0, 0.26]]) { const b = new THREE.SphereGeometry(r, 8, 6).toNonIndexed(); b.translate(px, py, pz); G('plain', b, { color: 0x3f7a45 }); }
    ob(23.7, 5.7, 0.45, 0.45);
  }
  // 東西の 面の うら（部屋から 見える がわ）に 木の こしいた。
  for (const i of [2, 6]) { const P = put(faceM(i)); for (const [a, b] of [[0, FW / 2 - ARCH.off - ARCH.w / 2], [FW / 2 + ARCH.off + ARCH.w / 2, FW]]) P('wood', box((a + b) / 2, 0, -WT - 0.03, b - a, 1.5, 0.06), { color: WALNUT }); }

  /* ── 当たり判定：大広間の かべ ── */
  ob(0, -(A + 0.7), FW / 2 + 0.2, 0.7);                                                                  // 北（アーチの おくは 本だな）
  for (const i of [1, 3, 5, 7]) {                                                                          // ななめの 面は 小さな 箱を ならべる
    const th = (i * Math.PI) / 4, dx = Math.sin(th), dz = Math.cos(th);
    for (let k = 0; k < 9; k += 1) { const t = ((k + 0.5) / 9 - 0.5) * (FW + 0.6); ob(dx * (A + 0.55) + dz * t, dz * (A + 0.55) - dx * t, 0.75, 0.75); }
  }

  /* ── 上の グループ（一人称の とき）：南がわの 高い かべ・げんかんの かべと とびら ── */
  face(1, U, { kind: 'blind' }); face(7, U, { kind: 'blind' }); face(0, U, { arches: [FW / 2] });
  for (const s of [-1, 1]) U.add('plaster', box(s * (VEST.hw + 0.25), LOW, (A + WT + VEST.z1) / 2, 0.5, 5.6 - LOW, VEST.z1 - A - WT + 0.5));
  U.add('plaster', box(0, 5.6, (A + VEST.z1) / 2 + 0.3, VEST.hw * 2 + 1, 0.2, VEST.z1 - A + 0.6), { color: 0xf4e2c0 });
  { const P = put(mat4(-VEST.hw - 0.5, 0, VEST.z1 + 0.5, 0).multiply(mat4(VEST.hw * 2 + 1, 0, 0, Math.PI)), U), L = VEST.hw * 2 + 1;
    const wsh = rectShape(0, 0, L, 5.6); wsh.holes.push(archPath(L / 2, 0.004, 2.6, 3.9)); P('plaster', plate(wsh, 0.3, { seg: 12, rim: false }));
    const rr = plate(archRing(L / 2, 0, 2.6, 3.9, 0.26), 0.1, { seg: 12 }); rr.translate(0, 0, 0.06); P('stone', rr);
    P('wood', box(L / 2, 0, -0.22, 2.7, 4.0, 0.08), { color: 0x6a4428 }); P('plain', box(L / 2, 0, -0.17, 0.05, 3.9, 0.03), { color: 0x2a1a10 });
    for (const sx of [-1, 1]) P('plain', box(L / 2 + sx * 0.16, 1.3, -0.15, 0.06, 0.3, 0.06), { color: BRASS }); }

  /* ── シャンデリア（鉄の 輪・ガラスの かさ）── */
  const chand = new THREE.Group(); chand.name = 'chandelier'; chand.position.set(0, Y.top + HD - 0.3, 0);
  {
    const drop = -(Y.top + HD - 0.3 - 7.9);                    // 輪の 高さ（つりさげる 点から）
    const tor = (R, t, y, seg = 28) => { const g = new THREE.TorusGeometry(R, t, 6, seg).toNonIndexed(); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };
    CH.add('plain', tor(2.0, 0.075, drop), { color: IRON }); CH.add('plain', tor(2.0, 0.04, drop + 0.3), { color: IRON }); CH.add('plain', tor(0.95, 0.06, drop + 1.0, 20), { color: IRON });
    CH.add('plain', cyl(0, drop + 2.3, 0, 0.03, 0.03, -drop - 2.3, 5), { color: IRON }); CH.add('plain', cyl(0, drop + 2.1, 0, 0.1, 0.22, 0.3, 8), { color: IRON });
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4, sx = Math.sin(a), cz = Math.cos(a);
      CH.add('plain', beam([sx * 2.0, drop + 0.3, cz * 2.0], [sx * 0.95, drop + 1.0, cz * 0.95], 0.05, 0.05), { color: IRON });
      CH.add('plain', beam([sx * 0.95, drop + 1.0, cz * 0.95], [0, drop + 2.2, 0], 0.035, 0.035), { color: IRON });
      CH.add('plain', cyl(sx * 2.0, drop + 0.08, cz * 2.0, 0.13, 0.17, 0.06, 8), { color: IRON });
      CH.add('lamp', cyl(sx * 2.0, drop + 0.14, cz * 2.0, 0.15, 0.11, 0.36, 8), { color: WARM });
      CH.add('plain', cyl(sx * 2.0, drop + 0.5, cz * 2.0, 0.02, 0.17, 0.12, 8), { color: IRON });
      const b0 = (k + 0.5) * Math.PI / 4; CH.add('plain', box(Math.sin(b0) * 1.98, drop + 0.05, Math.cos(b0) * 1.98, 0.05, 0.3, 0.05), { color: IRON });
    }
    const bowl = new THREE.SphereGeometry(0.82, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).toNonIndexed(); bowl.scale(1, 0.62, 1); bowl.translate(0, drop + 0.25, 0); CH.add('lamp', bowl, { color: 0xffe9bd });
    CH.add('plain', tor(0.83, 0.05, drop + 0.25, 20), { color: IRON });
    for (let k = 0; k < 4; k += 1) { const a = (k * Math.PI) / 2 + 0.4; CH.add('plain', beam([Math.sin(a) * 0.83, drop + 0.25, Math.cos(a) * 0.83], [Math.sin(a) * 0.95, drop + 1.0, Math.cos(a) * 0.95], 0.03, 0.03), { color: IRON }); }
    if (glowOn) { const g = flatY(gquad(8.5, 8.5, 1)); g.translate(0, drop - 0.2, 0); CH.add('glow', g, { color: 0x9c6c34, uv: 'keep' }); }
  }

  /* ── まとめる ── */
  const mats = { ...M }; if (!M.glow) delete mats.glow; if (!M.sheen) delete mats.sheen;
  const quiet = ['win', 'lamp', 'glow', 'sheen', 'vault'];
  const main = B.flush(group, mats, { noShadow: quiet });
  for (const k of ['floor', 'sheen', 'glow']) if (main.meshes[k]) main.meshes[k].castShadow = false;
  if (main.meshes.sheen) main.meshes.sheen.renderOrder = 2; if (main.meshes.glow) main.meshes.glow.renderOrder = 3;
  const ceiling = new THREE.Group(); ceiling.name = 'library-ceiling'; ceiling.visible = false; group.add(ceiling);
  const up = U.flush(ceiling, mats, { noShadow: quiet }); for (const m of ceiling.children) m.castShadow = false;
  group.add(chand); const ch = CH.flush(chand, mats, { noShadow: quiet }); if (ch.meshes.glow) ch.meshes.glow.renderOrder = 3;
  // とけいの はり（うごく）。
  const clock = new THREE.Group(); clock.position.set(21.3, 4.1, -ROOM.z + 0.12); group.add(clock);
  const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, 0.02); g.translate(0, len / 2 - 0.06, 0); const m = new THREE.Mesh(g, M.hand); clock.add(m); return m; };
  const hour = hand(0.38, 0.07), minute = hand(0.58, 0.045);
  group.userData.ceiling = ceiling; group.userData.chandelier = chand;

  const study = { en: '✏️ Study room', ja: '✏️ じしゅうしつ' };
  const spots = [
    { id: 'books', kind: 'reading', x: -19.2, z: -2.5, r: 2.0, label: { en: '📚 Bookshelf — read a book', ja: '📚 ほんだな — ほんを よむ' } },
    { id: 'librarian', kind: 'npc', x: -23.2, z: 3.3, r: 3.4, ry: Math.PI / 2, label: { en: 'Librarian', ja: 'としょかんの ひと' } },
    { id: 'study1', kind: 'study', x: 18.3, z: -3.9, r: 1.5, label: study },
    { id: 'study2', kind: 'study', x: 20.1, z: -3.9, r: 1.5, label: study },
    { id: 'study3', kind: 'study', x: 19.3, z: 3.3, r: 1.5, label: study },
    { id: 'study4', kind: 'study', x: 17.5, z: -2.0, r: 1.5, label: study },
  ];
  // 歩ける ところ（かべの 内がわ）。家具は obstacles で 見る。r＝体の 半径。
  function walkable(x, z, r = 0.3) {
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax <= A - r && az <= A - r && ax + az <= A * Math.SQRT2 - r * Math.SQRT2) return true;                         // 大広間
    if (ax <= VEST.hw - r && z > 0 && z <= VEST.z1 + 0.6) return true;                                                 // げんかん
    if (ax >= A - r - 0.01 && ax <= ROOM.x0 + r && Math.abs(az - ARCH.off) <= ARCH.w / 2 - r) return true;             // 東西の アーチの 下
    if (ax >= ROOM.x0 + r - 0.01 && ax <= ROOM.x1 - r && az <= ROOM.z - r) return true;                                // 部屋
    return false;
  }
  const blocked = (x, z, r = 0.3) => !walkable(x, z, r) || obstacles.some((o) => Math.abs(x - o.x) < o.w + r && Math.abs(z - o.z) < o.d + r);

  return {
    group, obstacles, spots,
    spawn: { x: 0, z: 15.0, ry: Math.PI },                 // げんかんの 中（北を 向く）
    exit: { x: 0, z: VEST.z1 - 0.1, r: 1.3 },
    bounds: { x0: -ROOM.x1 - 0.6, x1: ROOM.x1 + 0.6, z0: -(A + WT + 3.2), z1: VEST.z1 + 1 },
    lit: [{ material: M.win, glow: 0.5 }],
    walkable, blocked,
    tris: main.tris + ch.tris, trisCeiling: up.tris,
    update(t) {
      chand.rotation.z = Math.sin(t * 0.55) * 0.012; chand.rotation.x = Math.cos(t * 0.43) * 0.01;
      const d = new Date(), mn = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + mn / 60;
      minute.rotation.z = -(mn / 60) * Math.PI * 2; hour.rotation.z = -(hr / 12) * Math.PI * 2;
    },
  };
}
