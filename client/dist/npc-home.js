// なかよしの 住民の いえ（2026-11：「なかよしに なると いえに よんで もらえる」）。
//
// ・マイルーム（room-world.js）・じぶんの しま（land-world.js）と 同じ 作り：**自分の シーン 1 つ**を `rpg.attachHome()` で つなぐ。
//   カメラ・当たり判定・ミニマップ・描画（rpg.interiorScene）は その しくみが そのまま 見る。WebGL は ふやさない。
// ・入って いいかは 部屋が きめる（`home:visit` → `home:visit:ok`）。ここは **へんじが 来てから** 呼ばれる。
// ・へやは あたたかい 木の いえ（宇宙の 内装では ない）：板の 床・しっくいの かべ・よろい戸の まど・ラグ・だいどころ・テーブル・ベッド・たな・はっぱ。
//   かぐは furniture-real.js（マイルームと 同じ 形）。せいかくで かべ・ラグ・ふとんの 色と、2〜3 この 小物が かわる。
//   たね（seed）で 左右が 入れかわる。乱数は 使わない＝同じ 人の いえは いつも 同じ。
// ・光は 足さない（半球光と 太陽 1 つ＝ほかの 内装と 同じ）。まどは emissive。形と 材質は ここで 1 回 作って 使いまわす。
// ・出る：下の 戸口を 歩いて 出る か「そとへ」。入る 前に 立って いた 場所に もどる。
import * as THREE from './three.module.js';
import { furnitureModel } from './furniture-real.js';
import { buildVillager } from './villager.js';
import { realFood } from './food-real.js';
import { blockModel } from './town-real.js';
import { isJa, onLangChange } from './i18n.js';
import { personalityOf } from './npc-lines.js';

const HX = 6.2, ZB = -5.2, ZF = 5.4;      // へやの 半分の はば・おくの かべ・戸口の かべ
const DOOR = 1.3;                         // 戸口の 半分の はば
const FS = 1.3;                           // かぐの 大きさ（まるい 体は 2.6 くらい あるので 少し 大きく）
const NEAR_HOST = 3.2;

// せいかくごとの 色と 小物。wall＝かべ、trim＝こしいた、rug・quilt・sofa＝ぬのの 色、A / B / C＝小物の 場所。
const STYLE = {
  cheerful: { wall: 0xfbe9b8, trim: 0xb9793f, rug: 0xe8703a, quilt: 0xf2b04a, sofa: 0x3f8fd0, A: 'sofa', B: 'ball', C: 'clock' },
  relaxed: { wall: 0xe4ecd4, trim: 0x8a6a45, rug: 0x7fa36a, quilt: 0x9cc7a8, sofa: 0x6f8f5f, A: 'sofa', B: 'plants', C: 'lamp' },
  shy: { wall: 0xf9e3e6, trim: 0xa97858, rug: 0xe9a3b4, quilt: 0xf3c1cf, sofa: 0xd88aa0, A: 'flowers', B: 'plants', C: 'lamp' },
  bookish: { wall: 0xe9e0cc, trim: 0x6f5137, rug: 0x8a4b3a, quilt: 0x5f7fa8, sofa: 0x5f7fa8, A: 'shelf', B: 'books', C: 'clock' },
  foodie: { wall: 0xfde6c8, trim: 0xa8672f, rug: 0xd9534f, quilt: 0xf2994a, sofa: 0xd9534f, A: 'pantry', B: 'crate', C: 'plant', feast: true },
  stylish: { wall: 0xf3e6f0, trim: 0x9a7a62, rug: 0xe86fa0, quilt: 0xf7d6e4, sofa: 0xe86fa0, A: 'rack', B: 'mirror', C: 'lamp' },
  earnest: { wall: 0xe6edf2, trim: 0x7a5a3c, rug: 0x3f6f8f, quilt: 0x86a9c4, sofa: 0x3f6f8f, A: 'desk', B: 'books', C: 'clock' },
  playful: { wall: 0xfff0b8, trim: 0xb9793f, rug: 0x4fae6b, quilt: 0x4fae6b, sofa: 0xf2994a, A: 'blocks', B: 'ball', C: 'toybox' },
};
const WOOD = 0xb07a48, WOOD_DARK = 0x7a5232;
function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- みんなで 使う 形と もよう（1 回だけ 作る）----
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20), ball: new THREE.SphereGeometry(0.5, 20, 14), plane: new THREE.PlaneGeometry(1, 1) };
let floorTex; let windowTex;
function plankTexture() {
  if (floorTex !== undefined) return floorTex;
  floorTex = null;
  try {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    let s = 91; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const tones = ['#c08a52', '#b98149', '#c9955d', '#b27a44', '#c28e58'];
    for (let row = 0; row < 8; row += 1) {
      const y = row * 64; let x = -Math.floor(rnd() * 180);
      while (x < 512) {
        const w = 150 + Math.floor(rnd() * 120);
        g.fillStyle = tones[Math.floor(rnd() * tones.length)]; g.fillRect(x, y, w, 64);
        g.strokeStyle = 'rgba(70,40,18,.10)'; g.lineWidth = 1;
        for (let k = 0; k < 5; k += 1) { const yy = y + 8 + rnd() * 48; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + rnd() * 6 - 3, x + w * 0.7, yy + rnd() * 6 - 3, x + w, yy); g.stroke(); }
        g.fillStyle = 'rgba(60,34,14,.55)'; g.fillRect(x + w - 2, y, 2, 64);
        for (const nx of [x + 8, x + w - 12]) { g.beginPath(); g.arc(nx, y + 14, 2, 0, 7); g.arc(nx, y + 50, 2, 0, 7); g.fill(); }
        x += w;
      }
      g.fillStyle = 'rgba(60,34,14,.55)'; g.fillRect(0, y, 512, 2);
      g.fillStyle = 'rgba(255,240,210,.10)'; g.fillRect(0, y + 2, 512, 2);
    }
    floorTex = new THREE.CanvasTexture(c); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 2.6); floorTex.anisotropy = 4;
  } catch { floorTex = null; }
  return floorTex;
}
// まど：木の わく・十字の さん・ひるの 空・ひらいた よろい戸・花の はこ。
function shutterTexture() {
  if (windowTex !== undefined) return windowTex;
  windowTex = null;
  try {
    const c = document.createElement('canvas'); c.width = 384; c.height = 256; const g = c.getContext('2d');
    g.clearRect(0, 0, 384, 256);
    for (const x of [8, 284]) {                                         // よろい戸（ひらいて いる）
      g.fillStyle = '#3f7a5c'; g.fillRect(x, 20, 92, 196);
      g.fillStyle = '#2f5f47'; for (let y = 32; y < 208; y += 18) g.fillRect(x + 8, y, 76, 8);
    }
    g.fillStyle = '#7a5232'; g.fillRect(96, 12, 192, 212);              // わく
    const sky = g.createLinearGradient(0, 24, 0, 212); sky.addColorStop(0, '#bfe6ff'); sky.addColorStop(0.7, '#eaf7ff'); sky.addColorStop(1, '#d6efc4');
    g.fillStyle = sky; g.fillRect(108, 24, 168, 188);
    g.fillStyle = '#ffffffcc'; g.beginPath(); g.ellipse(160, 70, 30, 12, 0, 0, 7); g.ellipse(184, 62, 24, 12, 0, 0, 7); g.fill();
    g.fillStyle = '#7a5232'; g.fillRect(188, 24, 8, 188); g.fillRect(108, 112, 168, 8);
    g.fillStyle = '#8a5a34'; g.fillRect(92, 216, 200, 30);              // 花の はこ
    for (let i = 0; i < 7; i += 1) { g.fillStyle = '#4f9a5a'; g.beginPath(); g.arc(108 + i * 28, 214, 12, 0, 7); g.fill(); g.fillStyle = ['#ff7f9a', '#ffd246', '#ffffff'][i % 3]; g.beginPath(); g.arc(108 + i * 28, 206, 6, 0, 7); g.fill(); }
    windowTex = new THREE.CanvasTexture(c); windowTex.colorSpace = THREE.SRGBColorSpace;
  } catch { windowTex = null; }
  return windowTex;
}

// mustLeave()：ひこうき・ほかの 島へ とぶ など、へやに いられなく なった とき true（その こまで しずかに 出る）。
export function createNpcHome({ player, camera, toast = () => {}, onLeave = () => {}, onEnter = () => {}, mustLeave = () => false }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x4a3626);                         // へやの 外＝あたたかい こげ茶（宇宙では ない）
  scene.add(new THREE.HemisphereLight(0xfff3df, 0x8a6a4a, 2.1));
  const sun = new THREE.DirectionalLight(0xffe9c8, 1.6);
  sun.position.set(4, 12, 8); scene.add(sun);
  const root = new THREE.Group(); scene.add(root);

  const materials = new Map();
  const mat = (color, glow = 0, rough = 0.82) => {
    const key = `${color}:${glow}:${rough}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
    return materials.get(key);
  };
  const put = (geo, color, x, y, z, w, h, d, { glow = 0, parent = root, shadow = true, rough = 0.82 } = {}) => {
    const m = new THREE.Mesh(GEO[geo], mat(color, glow, rough));
    m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };
  const B = (x, y, z, w, h, d, color, o) => put('box', color, x, y, z, w, h, d, o);

  const state = { active: false, info: null, hostAt: null, style: null, mirror: 1 };
  let solid = [];                 // { x, z, hw, hd }
  let floorMat = null; let winMat = null;
  let host = null; let parent = null; let back = null; let cooldown = 0; let whereWas = null;

  // かぐ 1 つ（furniture-real.js）。rot は 90° の 回数。当たり判定も 足す。
  function furn(shape, color, w, d, x, z, rot = 0, { solidH = true, scale = FS } = {}) {
    let g = null;
    try { g = furnitureModel({ shape, color, w, d }); } catch { g = null; }
    const fw = (rot % 2 ? d : w) * scale, fd = (rot % 2 ? w : d) * scale;
    if (g) { g.scale.setScalar(scale); g.position.set(x, 0, z); g.rotation.y = -rot * Math.PI / 2; root.add(g); }
    else B(x, 0.4, z, fw * 0.9, 0.8, fd * 0.9, color);
    if (solidH) solid.push({ x, z, hw: fw / 2 - 0.12, hd: fd / 2 - 0.12 });
    return g;
  }
  const block = (x, z, hw, hd) => solid.push({ x, z, hw, hd });

  function shell(st) {
    const tex = plankTexture();
    const fm = floorMat || (floorMat = new THREE.MeshStandardMaterial(tex ? { map: tex, roughness: 0.86 } : { color: 0xc08a52, roughness: 0.86 }));
    const floor = new THREE.Mesh(GEO.plane, fm); floor.rotation.x = -Math.PI / 2; floor.scale.set(HX * 2 + 0.4, ZF - ZB + 0.4, 1); floor.position.set(0, 0, (ZF + ZB) / 2); floor.receiveShadow = true; root.add(floor);
    B(0, -0.3, (ZF + ZB) / 2, HX * 2 + 1.2, 0.56, ZF - ZB + 1.2, WOOD_DARK, { shadow: false });           // 床の ふち（土台）
    // かべ：しっくい＋こしいた＋はり。手前の かべは ひくく（カメラが 中を 見る）。
    B(0, 1.9, ZB - 0.2, HX * 2 + 0.8, 3.8, 0.4, st.wall);
    for (const s of [-1, 1]) B(s * (HX + 0.2), 1.35, (ZF + ZB) / 2, 0.4, 2.7, ZF - ZB + 0.8, st.wall);
    B(0, 0.5, ZB + 0.06, HX * 2, 1.0, 0.12, st.trim);
    for (const s of [-1, 1]) B(s * (HX - 0.06), 0.5, (ZF + ZB) / 2, 0.12, 1.0, ZF - ZB, st.trim);
    B(0, 3.86, ZB - 0.02, HX * 2 + 0.9, 0.28, 0.6, WOOD_DARK);
    for (const s of [-1, 1]) B(s * (HX / 2 + DOOR / 2 + 0.25), 0.5, ZF + 0.2, HX - DOOR + 0.5, 1.0, 0.4, st.trim);
    for (const s of [-1, 1]) B(s * (DOOR + 0.14), 1.5, ZF + 0.2, 0.28, 3.0, 0.44, WOOD_DARK);             // 戸口の 柱
    B(0, 3.1, ZF + 0.2, DOOR * 2 + 0.56, 0.3, 0.44, WOOD_DARK);
    B(0, 0.03, ZF - 0.5, DOOR * 2 - 0.3, 0.06, 0.9, 0x8ff0c8, { glow: 0.25, shadow: false });             // でぐちの マット
    // まど（emissive＝ひるの 光）。
    const wt = shutterTexture();
    const wm = winMat || (winMat = wt ? new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 0.42, transparent: true, alphaTest: 0.05, roughness: 0.7 }) : mat(0xcfeaff, 0.4));
    const win = (x, y, z, ry) => { const m = new THREE.Mesh(GEO.plane, wm); m.position.set(x, y, z); m.rotation.y = ry; m.scale.set(2.7, 1.8, 1); root.add(m); };
    win(-state.mirror * 3.6, 2.55, ZB + 0.02, 0);
    win(state.mirror * 1.2, 2.75, ZB + 0.02, 0);
    win(-state.mirror * (HX - 0.01), 1.75, 1.2, state.mirror * Math.PI / 2);
  }

  // だいどころ：木の 台・しろい 天板・おなべ・まないた。
  function kitchen(x, z) {
    B(x, 0.55, z, 4.4, 1.1, 1.1, WOOD);
    B(x, 1.14, z, 4.6, 0.1, 1.24, 0xf3ead8);
    put('cyl', 0x6a6f78, x - 1.2, 1.42, z, 0.72, 0.46, 0.72, { rough: 0.4 });
    put('cyl', 0x4c5058, x - 1.2, 1.68, z, 0.76, 0.06, 0.76, { rough: 0.4 });
    put('ball', 0x2a2a2e, x - 1.2, 1.74, z, 0.14, 0.12, 0.14, { shadow: false });
    B(x + 0.4, 1.22, z + 0.05, 0.8, 0.06, 0.5, 0xd8b07a, { shadow: false });
    put('ball', 0xd9534f, x + 0.3, 1.33, z + 0.05, 0.2, 0.2, 0.2, { shadow: false });
    put('cyl', 0x8ff0c8, x + 1.5, 1.34, z - 0.1, 0.3, 0.3, 0.3, { shadow: false });
    block(x, z, 2.2, 0.55);
  }
  // テーブルの 上：かびん と 花。たべものが すきな 人は ごちそう。
  function tableTop(x, z, st) {
    const y = 0.8 * FS;
    if (st.feast) {
      // リアルな たべもの（food-real.js）。ドーナツは 36 ぶひん あるので 置かない。
      const ids = ['watermelon', 'cake', 'apple', 'juice'];
      ids.forEach((id, i) => { try { const f = realFood(id); if (f) { f.scale.setScalar(i < 2 ? 0.55 : 0.4); f.position.set(x + (i - 1.5) * 0.62, y, z + (i % 2 ? 0.14 : -0.12)); root.add(f); } } catch { /* 絵が なくても へやは 立つ */ } });
      return;
    }
    put('cyl', 0x8fc7e8, x, y + 0.2, z, 0.26, 0.4, 0.26, { rough: 0.3 });
    for (const [dx, dz, c] of [[-0.12, 0, 0xff7f9a], [0.12, 0.06, 0xffd246], [0, -0.1, 0xffffff]]) put('ball', c, x + dx, y + 0.56, z + dz, 0.2, 0.2, 0.2, { shadow: false });
    put('cyl', 0x4f9a5a, x, y + 0.42, z, 0.06, 0.26, 0.06, { shadow: false });
  }
  const PILE = [0xd9534f, 0x3f6fd0, 0xf2b04a, 0x2f8f5b, 0x7a5232];
  const PROPS = {
    sofa: (x, z, st, side) => furn('sofa', st.sofa, 3, 1, x, z - 0.2, side > 0 ? 1 : 3),
    shelf: (x, z, st, side) => furn('shelf', 0x8d6642, 2, 1, x, z, side > 0 ? 1 : 3),
    desk: (x, z, st, side) => { furn('table', 0xa97c4e, 2, 1, x, z, 1); furn('chair', st.sofa, 1, 1, x - side * 1.5, z, side > 0 ? 3 : 1); B(x, 0.8 * FS + 0.05, z - 0.4, 0.5, 0.06, 0.7, 0xfaf6ea, { shadow: false }); B(x, 0.8 * FS + 0.12, z + 0.5, 0.4, 0.2, 0.3, 0x3f6f8f); },
    pantry: (x, z, st, side) => { furn('shelf', 0xa8672f, 2, 1, x, z, side > 0 ? 1 : 3); B(x - side * 1.2, 0.18, z, 0.8, 0.36, 1.7, 0xc9a06a); for (const [dz, c] of [[-0.55, 0xd9534f], [-0.15, 0xf2b04a], [0.25, 0xd9534f], [0.6, 0x8fc15a]]) put('ball', c, x - side * 1.2, 0.5, z + dz, 0.34, 0.34, 0.34, { shadow: false }); block(x - side * 1.2, z, 0.4, 0.85); },
    rack: (x, z) => { for (const s of [-1, 1]) put('cyl', 0x9a8a78, x, 1.1, z + s * 1.1, 0.1, 2.2, 0.1); put('cyl', 0x9a8a78, x, 2.16, z, 0.08, 2.3, 0.08).rotation.x = Math.PI / 2; [0xe86fa0, 0x3f8fd0, 0xf2b04a, 0x8ff0c8].forEach((c, i) => B(x, 1.5, z - 0.75 + i * 0.5, 0.12, 1.1, 0.38, c)); block(x, z, 0.3, 1.2); },
    mirror: (x, z, st, side) => { B(x, 1.3, z, 0.16, 2.3, 1.2, 0xd9b36a); B(x - side * 0.09, 1.3, z, 0.04, 2.0, 0.96, 0xdff4ff, { glow: 0.35, shadow: false, rough: 0.1 }); B(x, 0.1, z, 0.5, 0.2, 1.3, 0xb9905a); block(x, z, 0.3, 0.65); },
    books: (x, z) => { PILE.slice(0, 4).forEach((c, i) => { const m = B(x + (i % 2) * 0.06, 0.09 + i * 0.17, z, 0.7, 0.16, 0.5, c); m.rotation.y = i * 0.5; }); PILE.slice(2, 5).forEach((c, i) => { const m = B(x + 0.2, 0.09 + i * 0.17, z - 0.9, 0.62, 0.16, 0.46, c); m.rotation.y = 1 + i * 0.4; }); block(x, z - 0.4, 0.45, 0.8); },
    ball: (x, z) => { put('ball', 0xd9534f, x, 0.4, z, 0.8, 0.8, 0.8, { rough: 0.5 }); put('cyl', 0xfff4d6, x, 0.4, z, 0.82, 0.14, 0.82, { shadow: false, rough: 0.5 }); block(x, z, 0.35, 0.35); },
    plants: (x, z, st) => { furn('plant', 0x5f9a52, 1, 1, x, z); furn('plant', 0x7fb86a, 1, 1, x + 0.2, z - 1.3, 0, { scale: 1.0 }); },
    plant: (x, z) => furn('plant', 0x5f9a52, 1, 1, x, z, 0, { scale: 1.0 }),
    flowers: (x, z) => { for (let i = 0; i < 3; i += 1) { const zz = z - 1.1 + i * 1.1; put('cyl', 0xc9805a, x, 0.25, zz, 0.6, 0.5, 0.6); put('ball', 0x4f9a5a, x, 0.72, zz, 0.72, 0.6, 0.72); for (const [dx, dz] of [[0.18, 0.1], [-0.16, 0.14], [0, -0.2]]) put('ball', [0xff7f9a, 0xffd246, 0xffffff][i], x + dx, 1.02, zz + dz, 0.2, 0.2, 0.2, { shadow: false }); } block(x, z, 0.4, 1.5); },
    lamp: (x, z) => furn('lamp', 0xffe3a1, 1, 1, x, z, 0, { scale: 1.1 }),
    clock: (x, z) => furn('clock', 0xd9d2be, 1, 1, x, z, 0, { scale: 1.15 }),
    crate: (x, z) => { B(x, 0.3, z, 1.0, 0.6, 0.8, 0xc9a06a); for (const [dx, dz, c] of [[-0.25, 0.1, 0xd9534f], [0.2, -0.1, 0xf2b04a], [0, 0.2, 0xd9534f], [0.25, 0.2, 0x8fc15a]]) put('ball', c, x + dx, 0.68, z + dz, 0.3, 0.3, 0.3, { shadow: false }); block(x, z, 0.5, 0.4); },
    blocks: (x, z) => {
      const kinds = [['brick', 0xc9583f], ['wood', 0xb98149], ['lamp', 0xffd246], ['grass', 0x5fae5a], ['snow', 0xf4f8fb], ['stone', 0x8f959c]];
      const at = [[0, 0, 0], [0.8, 0, 0.1], [0.4, 0.7, 0.05], [-0.1, 0, 0.95], [0.75, 0, -0.9], [0.35, 0, -1.6]];
      at.forEach(([dx, dy, dz], i) => { let m = null; try { m = blockModel(kinds[i][0], kinds[i][1]); } catch { m = null; } if (m) { m.scale.setScalar(0.7); m.position.set(x + dx - 0.3, dy, z + dz); m.rotation.y = i * 0.35; root.add(m); } else B(x + dx - 0.3, dy + 0.35, z + dz, 0.7, 0.7, 0.7, kinds[i][1]); });
      block(x, z - 0.3, 0.75, 1.5);
    },
    toybox: (x, z) => { B(x, 0.35, z, 1.1, 0.7, 0.7, 0x3f8fd0); B(x, 0.74, z - 0.2, 1.14, 0.08, 0.34, 0x2f6fb0); put('ball', 0xffd246, x - 0.2, 0.86, z + 0.1, 0.34, 0.34, 0.34, { shadow: false }); put('ball', 0xd9534f, x + 0.25, 0.82, z + 0.12, 0.26, 0.26, 0.26, { shadow: false }); block(x, z, 0.55, 0.35); },
  };

  // 同じ 材質の 形を 1 つに まとめる（描く 回数＝材質の 数）。へやは 動かないので 入る ときに 1 回だけ。
  let baked = [];
  function bake() {
    root.updateMatrixWorld(true);
    const by = new Map();
    root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !Array.isArray(o.material)) { if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(o); } });
    for (const [material, list] of by) {
      if (list.length < 2) continue;
      const parts = list.map((m) => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; });
      const n = parts.reduce((sum, g) => sum + g.attributes.position.count, 0);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let at = 0;
      for (const g of parts) {
        const c = g.attributes.position.count;
        pos.set(g.attributes.position.array.subarray(0, c * 3), at * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, c * 3), at * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), at * 2);
        at += c; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.castShadow = list.some((m) => m.castShadow);
      for (const m of list) m.removeFromParent();
      root.add(mesh); baked.push(geo);
    }
  }

  function build(info) {
    for (const g of baked) g.dispose();
    baked = [];
    root.clear(); solid = []; host = null;
    const personality = personalityOf(info.seed ?? info.key, info.personality);
    const st = STYLE[personality] || STYLE.cheerful;
    const m = hash(info.seed ?? info.key) & 1 ? 1 : -1;       // 左右の 入れかえ
    state.style = st; state.mirror = m;
    shell(st);
    furn('rug', st.rug, 2, 2, m * 0.8, 0.9, 0, { solidH: false, scale: FS * 1.5 });
    furn('bed', st.quilt, 2, 3, m * 4.75, -3.05);
    furn('shelf', 0x8d6642, 2, 1, m * 1.6, -4.5);
    kitchen(-m * 3.6, -4.55);
    furn('table', 0xa97c4e, 2, 1, -m * 3.6, 0.2);
    furn('chair', 0xb98a5a, 1, 1, -m * 3.6, -1.25, 0);
    furn('chair', 0xb98a5a, 1, 1, -m * 3.6, 1.65, 2);
    tableTop(-m * 3.6, 0.2, st);
    furn('lamp', 0xffe3a1, 1, 1, m * 5.5, -0.4, 0, { scale: 1.1 });
    furn('plant', 0x5f9a52, 1, 1, -m * 5.5, 4.6, 0, { scale: 1.1 });
    furn('plant', 0x6fae5f, 1, 1, m * 3.0, 4.7, 0, { scale: 1.0 });
    try { PROPS[st.A]?.(m * 5.2, 2.3, st, m); } catch { /* 小物 1 つ なくても へやは 立つ */ }
    try { PROPS[st.B]?.(-m * 5.3, 2.4, st, -m); } catch { /* */ }
    try { PROPS[st.C]?.(-m * 0.55, -4.6, st, m); } catch { /* */ }
    try { bake(); } catch (err) { try { console.warn('[npc-home] まとめられない（そのまま 描く）', err); } catch { /* */ } }
    // いえの 人（外と 同じ 体・同じ たね）。ラグの おくに 立つ。
    host = new THREE.Group();
    try { buildVillager(null, host, { color: Number(info.color) || 0xcbbb95, seed: info.seed ?? info.key }); } catch { /* 体が 作れなくても 入れる */ }
    host.position.set(m * 0.9, 0, -1.0);
    root.add(host);
    state.hostAt = { x: host.position.x, z: host.position.z };
    block(host.position.x, host.position.z, 0.35, 0.35);
  }

  // ---- 上の 帯：だれの いえか と「そとへ」----
  let bar = null;
  try {
    bar = document.createElement('div'); bar.id = 'home-bar'; bar.hidden = true; bar.setAttribute('translate', 'no');
    document.body.appendChild(bar);
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) bar.addEventListener(ev, (e) => e.stopPropagation());
    onLangChange(() => paintBar());
  } catch { bar = null; }
  function paintBar() {
    if (!bar) return;
    if (!state.active || !state.info) { bar.hidden = true; return; }
    const name = String((isJa() ? state.info.name?.ja : state.info.name?.en) || state.info.name?.ja || state.info.name?.en || '').replace(/[<>&"]/g, '');
    bar.innerHTML = `<span>🏠 ${isJa() ? `<b>${name}</b> の いえ` : `<b>${name}</b>'s house`}</span><button type="button">🚪 ${isJa() ? 'そとへ' : 'Go out'}</button>`;
    bar.querySelector('button').onclick = () => leave();
    bar.hidden = false;
  }

  function enter(info) {
    if (state.active || !info?.key) return false;
    try { build(info); } catch (err) { try { console.warn('[npc-home] へやが 作れない', err); } catch { /* */ } toast(isJa() ? 'いまは 入れないよ。' : 'You cannot go in now.'); return false; }
    state.info = info; state.active = true;
    parent = player.parent;
    back = { x: player.position.x, y: player.position.y, z: player.position.z, r: player.rotation.y };
    scene.add(player);
    player.position.set(0, 0, ZF - 1.3);
    player.rotation.y = Math.PI;             // へやの おくを 向く
    cooldown = 1.2;
    document.body.classList.add('in-building', 'in-npc-home');
    const where = document.querySelector('.location');
    whereWas = where ? where.innerHTML : null;
    if (where) { const n = String(info.name?.en || info.name?.ja || '').replace(/[<>&"]/g, ''); const j = String(info.name?.ja || info.name?.en || '').replace(/[<>&"]/g, ''); where.innerHTML = `<span>✦</span> <b class="en">${n}'s house</b><i class="ja">${j} の いえ</i>`; }
    paintBar();
    try { onEnter(info); } catch { /* */ }
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    const info = state.info;
    state.active = false; state.info = null;
    (parent || null)?.add(player);
    if (back) { player.position.set(back.x, back.y, back.z); player.rotation.y = back.r; }
    document.body.classList.remove('in-building', 'in-npc-home');
    const where = document.querySelector('.location');
    if (where && whereWas !== null) where.innerHTML = whereWas;      // 上の 札を 入る 前の 島の 名前に もどす
    whereWas = null;
    paintBar();
    try { onLeave(info, silent); } catch { /* */ }
    return true;
  }

  function blocked(x, z) {
    if (!state.active) return null;
    if (Math.abs(x) > HX - 0.45 || z < ZB + 0.45) return true;
    if (z > ZF - 0.4) return Math.abs(x) > DOOR - 0.35 || z > ZF + 1.4;       // 戸口だけ あいて いる
    return solid.some((o) => Math.abs(x - o.x) < o.hw + 0.34 && Math.abs(z - o.z) < o.hd + 0.34);
  }

  // いえの 人の そばに いるか（はなす・あげる）。
  function nearest() {
    if (!state.active || !state.hostAt) return null;
    const dist = Math.hypot(player.position.x - state.hostAt.x, player.position.z - state.hostAt.z);
    return dist <= NEAR_HOST ? { info: state.info, dist, x: state.hostAt.x, z: state.hostAt.z } : null;
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    let out = false; try { out = !!mustLeave(); } catch { out = false; }
    if (out) { leave(true); return; }
    if (host) {
      host.position.y = Math.abs(Math.sin(t * 1.6)) * 0.035;
      const want = Math.atan2(player.position.x - host.position.x, player.position.z - host.position.z);
      const d = Math.atan2(Math.sin(want - host.rotation.y), Math.cos(want - host.rotation.y));
      host.rotation.y += d * Math.min(1, dt * 6);
    }
    const busy = !!document.querySelector('dialog[open]') || !!document.body.dataset.npcTalk;
    if (!cooldown && !busy && Math.abs(player.position.x) < DOOR && player.position.z > ZF + 0.25) leave();
  }

  const focus = new THREE.Vector3(); const desired = new THREE.Vector3();
  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + player.position.y, player.position.z);
      camera.lookAt(player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10);
    } else {
      // 手前から 見下ろす。向きは 世界の カメラと 同じ yaw（歩く 向きが カメラに 合わせて あるので、ここだけ かえると 操作が ずれる）。
      const a = yaw;
      const wide = camera.aspect > 1.9;                 // 横長の スマホは 少し 引く
      const distance = THREE.MathUtils.clamp(zoom * 0.5, 12.5, 17) * (wide ? 0.92 : 1);
      focus.set(player.position.x * 0.35, 0.9, player.position.z * 0.3 - 0.9);
      desired.set(focus.x + Math.sin(a) * distance, 1 + distance * 0.86, focus.z + Math.cos(a) * distance * 0.9);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      camera.lookAt(focus);
    }
    return true;
  }

  function minimap(ctx) {
    if (!state.active) return false;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#2a1c13'; ctx.fillRect(0, 0, 180, 140);
    const sx = 9, sz = 9, ox = 90, oz = 66;
    ctx.fillStyle = '#c08a52'; ctx.fillRect(ox - HX * sx, oz + ZB * sz, HX * 2 * sx, (ZF - ZB) * sz);
    ctx.fillStyle = '#7a5232';
    for (const o of solid) ctx.fillRect(ox + (o.x - o.hw) * sx, oz + (o.z - o.hd) * sz, o.hw * 2 * sx, o.hd * 2 * sz);
    ctx.fillStyle = '#8ff0c8'; ctx.fillRect(ox - DOOR * sx, oz + ZF * sz - 3, DOOR * 2 * sx, 6);
    if (state.hostAt) { ctx.fillStyle = '#ffb066'; ctx.beginPath(); ctx.arc(ox + state.hostAt.x * sx, oz + state.hostAt.z * sz, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox + player.position.x * sx, oz + player.position.z * sz, 3.4, 0, Math.PI * 2); ctx.fill();
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap, nearest, bar,
    get active() { return state.active; },
    get info() { return state.info; },
    get host() { return host; },
    get solid() { return solid; },
    // 検査用：へやの 形の 数（いえの 人を のぞく）。
    drawCalls() { let n = 0; root.traverse((o) => { if (o.isMesh && !(host && (o === host || isUnder(o, host)))) n += 1; }); return n; },
  };
  function isUnder(o, top) { for (let p = o.parent; p; p = p.parent) if (p === top) return true; return false; }
}
