// 島ごとの「かお」に なる キャラクター（デザイン案・2026-11）。まだ 島には 立たせて いない：/dev-cast.html で 見る。
//
// デザインの きまり（どの 子にも 同じ ものさし）：
//   1. シルエット … 黒く ぬりつぶしても だれか わかる。頭の 上（ぼうし・かみ）と 手の 道具で 形を かえる。
//   2. 2.4 頭身 … 頭を 大きく・手足を みじかく（遠くの カメラでも 顔が 読める／小さい 子が「かわいい」と 感じる 比率）。
//   3. 色は 60・30・10 … 服＝島の 色（60）、さし色（30）、道具や かざりの 光る 色（10）。となりの 島と 色相を はなす。
//   4. 役わりは 道具 1 つで … つりざお・レンチ・本。文字を 読めなくても 何の 島か わかる。
//   5. 目は 大きく、ひかりを 2 つ … 目が 合う 感じ。口は 小さく 上向き（いつも きげんが いい）。
// 形は 球・カプセル・円柱・円すい・箱・輪だけ（three だけ・モデルの ファイルなし）。1 人 40〜60 部品。
import * as THREE from './three.module.js';

const G = {
  S: new THREE.SphereGeometry(0.5, 24, 16),
  C: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  K: new THREE.ConeGeometry(0.5, 1, 24),
  B: new THREE.BoxGeometry(1, 1, 1),
  T: new THREE.TorusGeometry(0.5, 0.09, 10, 28),
  A: new THREE.TorusGeometry(0.5, 0.11, 8, 14, Math.PI),       // 半分の 輪（口・取っ手）
  P: new THREE.CapsuleGeometry(0.5, 1, 6, 14),
  D: new THREE.SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), // ドーム（ぼうし）
  O: new THREE.OctahedronGeometry(0.5),
};
const INK = 0x2a2320, WHITE = 0xffffff, BLUSH = 0xf59aa0, GOLD = 0xf2c14e;

function maker(group) {
  const mats = new Map();
  const mat = (color, glow) => {
    const key = `${color}:${glow || 0}`;
    if (!mats.has(key)) { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 }); if (glow) { m.emissive = new THREE.Color(color); m.emissiveIntensity = glow; } mats.set(key, m); }
    return mats.get(key);
  };
  return (g, color, p, s = [1, 1, 1], r = null, glow = 0, parent = group) => {
    const m = new THREE.Mesh(G[g], mat(color, glow));
    m.position.set(p[0], p[1], p[2]); m.scale.set(s[0], s[1], s[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true; m.receiveShadow = true; (parent || group).add(m); return m;
  };
}

// どの 子にも 同じ 体。spec：skin・hair・style・top・pants・shoe・eye（'round' | 'smile' | 'star'）・coat（すその ひろがり）。
const LEG = { x: 0.2, y: 0.56 }, ARM = { x: 0.46, y: 1.18 };
function body(add, c, group = null) {
  // 手足は つけねを 中心に ふれる Group（歩く うごき・手に もつ もの）。順番は 左あし・右あし・左うで・右うで（avatars.js と 同じ 約束）。
  const limbs = [];
  if (group) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * LEG.x, LEG.y, 0); group.add(leg); limbs.push(leg);
      add('C', c.pants, [0, 0.32 - LEG.y, 0], [0.27, 0.5, 0.3], null, 0, leg);
      add('S', c.shoe ?? 0x4a3b34, [0, 0.09 - LEG.y, 0.07], [0.34, 0.2, 0.48], null, 0, leg);
    }
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * ARM.x, ARM.y, 0); group.add(arm); limbs.push(arm);
      add('P', c.sleeve ?? c.top, [s * (0.5 - ARM.x), 0.98 - ARM.y, 0.02], [0.2, 0.2, 0.2], [0, 0, s * 0.42], 0, arm);
      add('S', c.hand ?? c.skin, [s * (0.63 - ARM.x), 0.74 - ARM.y, 0.04], [0.2, 0.2, 0.2], null, 0, arm);
    }
  }
  add('S', c.top, [0, 0.92, 0], [0.88, 0.96, 0.72]);
  if (c.coat) add('K', c.coat === true ? c.top : c.coat, [0, 0.74, 0], [1.12, 0.78, 0.94]);
  // 頭と 顔。
  add('S', c.skin, [0, 1.74, 0], [1.24, 1.12, 1.14]);
  if (!c.noEars) for (const s of [-1, 1]) add('S', c.skin, [s * 0.62, 1.7, -0.02], [0.2, 0.26, 0.16]);
  for (const s of [-1, 1]) {
    if (c.noEyes) { /* その 子だけの 目を build が かく */ }
    else if (c.eye === 'smile') add('A', INK, [s * 0.21, 1.7, 0.53], [0.2, 0.2, 0.2], [0, s * 0.3, 0]);
    else {
      add('S', c.eyeColor ?? INK, [s * 0.21, 1.72, 0.5], [0.17, 0.23, 0.1], [0, s * 0.32, 0]);
      add('S', WHITE, [s * 0.21 + 0.035, 1.78, 0.545], [0.07, 0.08, 0.03]);
      add('S', WHITE, [s * 0.21 - 0.03, 1.67, 0.55], [0.035, 0.04, 0.02]);
    }
    if (!c.noBlush) add('S', BLUSH, [s * 0.38, 1.58, 0.44], [0.17, 0.09, 0.05], [0, s * 0.6, 0]);
  }
  if (!c.noMouth) add('A', 0xa5483f, [0, 1.56, 0.555], [0.13, 0.11, 0.13], [Math.PI, 0, 0]);
  hair(add, c);
  return limbs;
}
function hair(add, c) {
  const h = c.hair, st = c.style || 'short';
  if (st === 'none') return;
  add('S', h, [0, 1.9, -0.13], [1.3, 0.98, 1.2]);                       // 頭の うしろと 上
  if (st !== 'up') { add('S', h, [-0.2, 2.08, 0.3], [0.7, 0.34, 0.5], [0, 0, 0.25]); add('S', h, [0.24, 2.1, 0.28], [0.56, 0.3, 0.46], [0, 0, -0.3]); }
  if (st === 'bob') for (const s of [-1, 1]) add('S', h, [s * 0.53, 1.62, -0.06], [0.36, 0.72, 0.74]);
  if (st === 'twin') for (const s of [-1, 1]) { add('S', h, [s * 0.76, 1.52, -0.1], [0.36, 0.66, 0.36]); add('S', c.accent, [s * 0.66, 1.84, -0.08], [0.2, 0.2, 0.2]); }
  if (st === 'bun' || st === 'up') add('S', h, [0, 2.42, -0.18], [0.46, 0.42, 0.46]);
  if (st === 'buns') for (const s of [-1, 1]) add('S', h, [s * 0.5, 2.3, -0.1], [0.4, 0.4, 0.4]);
  if (st === 'spiky') for (let i = 0; i < 5; i += 1) add('K', h, [(i - 2) * 0.2, 2.34 - Math.abs(i - 2) * 0.05, 0.02 - (i % 2) * 0.14], [0.26, 0.42, 0.26], [0.2, 0, (2 - i) * 0.22]);
  if (st === 'long') { add('S', h, [0, 1.36, -0.34], [1.14, 1.3, 0.52]); for (const s of [-1, 1]) add('S', h, [s * 0.52, 1.5, -0.1], [0.3, 0.9, 0.5]); }
  if (st === 'pony') { add('S', h, [0, 1.74, -0.74], [0.34, 0.8, 0.34], [0.5, 0, 0]); add('S', c.accent, [0, 2.02, -0.58], [0.22, 0.22, 0.22]); }
  if (st === 'curly') for (let i = 0; i < 9; i += 1) { const a = (i / 9) * Math.PI * 2; add('S', h, [Math.cos(a) * 0.56, 2.02 + Math.sin(i * 2.1) * 0.08, Math.sin(a) * 0.5 - 0.1], [0.4, 0.4, 0.4]); }
  if (st === 'side') add('S', h, [0.5, 1.7, 0.12], [0.3, 0.7, 0.5]);
}

// ---- 20 人。build(add, c) は その 子だけの ぼうし・道具・かざり。右手は x = +0.63, y = 0.74。----
export const CAST = [
  { id: 'main', island: 'メインの島', name: 'キャプテン・マリン', en: 'Captain Marine', role: 'みなとの あんないにん', note: '白い ぼうしの 三角と 金の ボタン。ぼうえんきょうで「あっちだよ」',
    skin: 0xf1c9a2, hair: 0x3a2a22, style: 'short', top: 0x1f4e79, pants: 0xf4efe2, accent: GOLD, bg: 0x8fd3e8, coat: true,
    build(add) { add('C', WHITE, [0, 2.32, -0.02], [1.02, 0.2, 0.98]); add('D', WHITE, [0, 2.4, -0.02], [1.2, 0.5, 1.14]); add('C', 0x16324f, [0, 2.26, 0.3], [0.78, 0.07, 0.6]); add('O', GOLD, [0, 2.44, 0.5], [0.2, 0.2, 0.08], null, 0.3);
      for (const y of [1.1, 0.86]) for (const s of [-1, 1]) add('S', GOLD, [s * 0.14, y, 0.36], [0.09, 0.09, 0.06]); add('C', 0xd94f3d, [0, 1.3, 0.02], [0.66, 0.1, 0.56]);
      add('C', 0x8a5a2b, [0.74, 0.96, 0.3], [0.13, 0.62, 0.13], [1.1, 0, 0]); add('C', GOLD, [0.74, 1.12, 0.6], [0.18, 0.1, 0.18], [1.1, 0, 0]); } },
  { id: 'willow', island: 'U-Speak島', name: 'リリー', en: 'Lily', role: 'つりの めいじん', note: 'きいろい レインコートと むぎわらぼうし。さおの 先の 赤い うきが 目じるし',
    skin: 0xe8c39a, hair: 0x7a4a2a, style: 'twin', top: 0xf6c63c, pants: 0x3f6f8f, shoe: 0x2f7a6a, accent: 0xe5533d, bg: 0x9fd9c8, coat: true,
    build(add) { add('C', 0xe6cd86, [0, 2.3, 0], [1.9, 0.06, 1.8]); add('D', 0xe6cd86, [0, 2.3, 0], [1.1, 0.62, 1.04]); add('C', 0xe5533d, [0, 2.37, 0], [1.12, 0.12, 1.06]);
      add('C', 0x8a5a2b, [0.72, 1.5, 0.2], [0.06, 2.2, 0.06], [0.35, 0, -0.12]); add('C', 0xe8e8e8, [0.98, 1.72, 0.94], [0.015, 1.4, 0.015]); add('S', 0xe5533d, [0.98, 1.02, 0.94], [0.2, 0.24, 0.2]); add('S', WHITE, [0.98, 0.94, 0.94], [0.2, 0.14, 0.2]); } },
  { id: 'errand', island: 'おつかい島', name: 'ポスティ', en: 'Posty', role: 'ゆうびんやさん', note: '大きな かたかけ かばんと 手紙。走りだしそうな 赤',
    skin: 0xdba57e, hair: 0x2b2622, style: 'spiky', top: 0xd9453a, pants: 0x34425a, accent: 0xfff4d6, bg: 0xf7c9a0,
    build(add) { add('D', 0xd9453a, [0, 2.26, -0.02], [1.2, 0.56, 1.14]); add('C', 0xd9453a, [0, 2.25, 0.42], [0.76, 0.06, 0.5]); add('B', 0xfff4d6, [0, 2.4, 0.5], [0.22, 0.16, 0.05]);
      add('B', 0x9a6a3a, [-0.5, 0.78, 0.22], [0.52, 0.46, 0.3]); add('B', 0x7a4f28, [-0.5, 0.96, 0.24], [0.56, 0.14, 0.34]); add('B', 0x7a4f28, [0, 1.12, 0.3], [1.0, 0.08, 0.06], [0, 0, -0.55]);
      add('B', 0xfff4d6, [0.7, 0.86, 0.22], [0.36, 0.26, 0.04], [0, 0, 0.2]); add('O', 0xd9453a, [0.7, 0.86, 0.25], [0.12, 0.12, 0.03]); } },
  { id: 'school', island: 'ことばの学校島', name: 'ペン先生', en: 'Mr. Pen', role: 'ことばの 先生', note: 'まるめがねと 四角い ぼうし。ふさが ゆれる。えんぴつは 魔法の つえ',
    skin: 0xf1c9a2, hair: 0xc9ccd2, style: 'short', top: 0x3d7a5a, pants: 0x4a3f36, accent: GOLD, bg: 0xbfe3b0, coat: true,
    build(add) { add('C', 0x22303a, [0, 2.3, -0.02], [0.8, 0.22, 0.78]); add('B', 0x22303a, [0, 2.44, -0.02], [1.34, 0.06, 1.34], [0, 0.6, 0]); add('C', GOLD, [0.5, 2.26, 0.36], [0.05, 0.4, 0.05]); add('S', GOLD, [0.5, 2.04, 0.36], [0.14, 0.18, 0.14]);
      for (const s of [-1, 1]) add('T', 0x3a2a22, [s * 0.22, 1.72, 0.56], [0.36, 0.36, 0.3]); add('C', 0x3a2a22, [0, 1.72, 0.58], [0.03, 0.12, 0.03], [0, 0, Math.PI / 2]);
      add('C', 0xf2b04a, [0.72, 1.14, 0.16], [0.11, 0.8, 0.11], [0.2, 0, -0.25]); add('K', 0xf4d9b0, [0.83, 1.6, 0.25], [0.11, 0.2, 0.11], [0.2, 0, -0.25]); add('C', 0xf08a8a, [0.62, 0.74, 0.08], [0.115, 0.1, 0.115], [0.2, 0, -0.25]);
      add('B', 0xfff4d6, [0, 1.06, 0.36], [0.18, 0.3, 0.04]); for (const s of [-1, 1]) add('S', 0xc9ccd2, [s * 0.12, 1.6, 0.56], [0.24, 0.1, 0.08], [0, 0, s * -0.3]); } },
  { id: 'arena', island: 'えいごアリーナ島', name: 'アリア', en: 'Aria', role: 'アリーナの チャンピオン', note: '赤い はねかざりと マント。たての 星は 正解の しるし',
    skin: 0xdba57e, hair: 0xd9453a, style: 'pony', top: 0x5a6f8f, pants: 0x3a3f55, accent: GOLD, bg: 0xf0b0a0,
    build(add) { add('D', 0xc9d1d9, [0, 2.0, -0.04], [1.36, 0.9, 1.3]); for (const s of [-1, 1]) add('S', 0xc9d1d9, [s * 0.56, 1.66, 0.12], [0.2, 0.5, 0.5]); add('C', 0xf2c14e, [0, 2.02, -0.04], [1.38, 0.08, 1.32]); add('S', 0xe5533d, [0, 2.6, -0.2], [0.26, 0.6, 0.6], [0.5, 0, 0]);
      add('B', 0xc0392b, [0, 0.9, -0.42], [1.1, 1.3, 0.06], [0.16, 0, 0]); add('C', GOLD, [0, 1.3, 0], [0.74, 0.1, 0.64]);
      add('C', 0x3d6fb0, [-0.78, 0.86, 0.26], [0.74, 0.1, 0.74], [Math.PI / 2, 0, 0]); add('O', GOLD, [-0.78, 0.86, 0.33], [0.36, 0.36, 0.08], null, 0.35);
      add('B', 0xe8eef2, [0.74, 1.24, 0.2], [0.1, 0.95, 0.04], [0.25, 0, -0.1]); add('B', GOLD, [0.7, 0.78, 0.1], [0.34, 0.07, 0.08], [0.25, 0, -0.1]); } },
  { id: 'pet', island: 'ペット島', name: 'モコ', en: 'Moko', role: 'ペットの おせわがかり', note: 'くまの 耳の フードと みずたまの たまご。まるい 形だけで できた やさしい 子',
    skin: 0xf1c9a2, hair: 0x8a5a3a, style: 'none', top: 0xf0a060, pants: 0x8a6a55, shoe: 0xf0a060, accent: 0xfff4d6, bg: 0xffe1b8,
    build(add) { add('S', 0xf0a060, [0, 1.82, -0.2], [1.42, 1.3, 1.22]); add('S', 0x8a5a3a, [-0.16, 2.1, 0.3], [0.6, 0.3, 0.44], [0, 0, 0.25]); add('S', 0x8a5a3a, [0.22, 2.12, 0.28], [0.5, 0.26, 0.4], [0, 0, -0.3]); for (const s of [-1, 1]) { add('S', 0xf0a060, [s * 0.5, 2.36, -0.06], [0.42, 0.42, 0.3]); add('S', 0xfff4d6, [s * 0.5, 2.36, 0.04], [0.24, 0.24, 0.16]); }
      add('S', 0xfff4d6, [0, 0.86, 0.3], [0.5, 0.56, 0.2]); add('S', 0xfdf6e4, [0.3, 0.98, 0.52], [0.5, 0.64, 0.5]); for (const [x, y] of [[0.2, 1.08], [0.42, 0.92], [0.3, 0.78]]) add('S', 0x7ec8d8, [x, y, 0.74], [0.12, 0.12, 0.05]); } },
  { id: 'ride', island: 'のりもの島', name: 'ジェット', en: 'Jet', role: 'レースの メカニック', note: 'ゴーグルつき ヘルメットと しまの スーツ。チェッカーの はた',
    skin: 0xc68d65, hair: 0x2b2622, style: 'none', top: 0xe8483a, pants: 0xe8483a, shoe: 0x2a2a2e, accent: WHITE, bg: 0xc9d6f0,
    build(add) { add('S', 0xf4f4f4, [0, 1.86, -0.08], [1.4, 1.18, 1.3]); add('B', 0xe8483a, [0, 2.36, -0.08], [0.18, 0.14, 1.1]); add('C', 0x2a2a2e, [0, 2.02, 0.38], [0.98, 0.2, 0.6]); for (const s of [-1, 1]) add('S', 0x7ed0ff, [s * 0.22, 2.02, 0.62], [0.32, 0.22, 0.12], null, 0.25);
      add('B', WHITE, [0, 0.92, 0.33], [0.16, 0.7, 0.06]); add('C', 0x2a2a2e, [0, 0.6, 0], [0.82, 0.1, 0.7]);
      add('C', 0x8a8f96, [0.74, 1.3, 0.1], [0.05, 1.3, 0.05]); for (let i = 0; i < 3; i += 1) for (let j = 0; j < 2; j += 1) add('B', (i + j) % 2 ? WHITE : 0x1c1c1f, [0.9 + i * 0.2, 1.84 - j * 0.2, 0.1], [0.2, 0.2, 0.03]); } },
  { id: 'town', island: 'まちづくり島', name: 'ブロック', en: 'Brick', role: 'だいくさん', note: 'きいろい ヘルメットと オーバーオール。四角い ものは この 子だけ',
    skin: 0xa9714d, hair: 0x2b2622, style: 'short', top: 0xf4efe2, pants: 0x3f6fb0, accent: 0xf6c63c, bg: 0xf5e0a0,
    build(add) { add('D', 0xf6c63c, [0, 2.2, -0.02], [1.36, 0.74, 1.3]); add('C', 0xf6c63c, [0, 2.2, 0.1], [1.5, 0.06, 1.5]); add('B', 0xe0a82a, [0, 2.56, -0.02], [0.16, 0.12, 1.0]);
      add('B', 0x3f6fb0, [0, 0.9, 0.3], [0.56, 0.6, 0.14]); for (const s of [-1, 1]) { add('B', 0x3f6fb0, [s * 0.24, 1.24, 0.24], [0.1, 0.36, 0.08]); add('S', GOLD, [s * 0.24, 1.14, 0.37], [0.08, 0.08, 0.05]); }
      add('B', 0x9a6a3a, [0.74, 1.0, 0.16], [0.09, 0.8, 0.09], [0, 0, -0.2]); add('B', 0x8a8f96, [0.84, 1.42, 0.16], [0.46, 0.22, 0.22], [0, 0, -0.2]);
      add('B', 0xe5533d, [-0.74, 0.5, 0.3], [0.36, 0.36, 0.36]); add('B', 0x4aa3ff, [-0.7, 0.86, 0.3], [0.3, 0.3, 0.3], [0, 0.4, 0]); } },
  { id: 'talk', island: 'みんなで はなす しま', name: 'ミミ', en: 'Mimi', role: 'おしゃべりの しかいしゃ', note: '大きな ヘッドホンと マイク。ふきだしの バッジ',
    skin: 0xe8c39a, hair: 0x3a3f8f, style: 'bob', top: 0x8fe0c8, pants: 0x3a3f55, accent: 0xff7fa8, bg: 0xc8f0e0,
    build(add) { add('A', 0x2a2a2e, [0, 1.9, -0.04], [1.5, 1.3, 1.5], [0, 0, 0]); for (const s of [-1, 1]) { add('C', 0xff7fa8, [s * 0.7, 1.72, -0.02], [0.5, 0.2, 0.5], [0, 0, Math.PI / 2]); add('C', 0x2a2a2e, [s * 0.76, 1.72, -0.02], [0.36, 0.12, 0.36], [0, 0, Math.PI / 2]); }
      add('C', 0x4a4a52, [0.7, 1.0, 0.2], [0.09, 0.5, 0.09], [0.3, 0, -0.2]); add('S', 0xd0d4da, [0.76, 1.3, 0.3], [0.24, 0.26, 0.24]);
      add('S', WHITE, [-0.28, 1.1, 0.36], [0.3, 0.24, 0.08]); add('K', WHITE, [-0.36, 0.96, 0.36], [0.1, 0.14, 0.04], [0, 0, 2.6]); } },
  { id: 'wear', island: 'きせかえ島', name: 'リボン', en: 'Ribbon', role: 'スタイリスト', note: 'ななめの ベレーぼうと 大きな リボン。手には はさみ',
    skin: 0xf1c9a2, hair: 0xf0b6c8, style: 'long', top: 0xff8fb4, pants: 0x6a4a8a, shoe: 0x6a4a8a, accent: 0x7a4ab0, bg: 0xffd0e0, coat: 0xffa8c6,
    build(add) { add('S', 0x7a4ab0, [0.14, 2.3, -0.02], [1.2, 0.4, 1.14], [0, 0, -0.22]); add('S', 0x7a4ab0, [0.2, 2.5, -0.02], [0.14, 0.16, 0.14]);
      for (const s of [-1, 1]) add('K', 0x7a4ab0, [s * 0.2, 1.24, 0.4], [0.3, 0.36, 0.14], [0, 0, s * Math.PI / 2]); add('S', 0xffd84a, [0, 1.24, 0.42], [0.14, 0.14, 0.1]);
      add('B', 0xc9d1d9, [0.74, 0.96, 0.2], [0.05, 0.6, 0.02], [0, 0, 0.3]); add('B', 0xc9d1d9, [0.74, 0.96, 0.2], [0.05, 0.6, 0.02], [0, 0, -0.3]); for (const s of [-1, 1]) add('T', 0xff7fa8, [0.74 + s * 0.12, 0.66, 0.2], [0.18, 0.18, 0.18]); } },
  { id: 'mini', island: 'ミニゲーム島', name: 'ピコ', en: 'Pico', role: 'ゲームの たつじん', note: 'うしろむきの キャップと ゲームき。ほっぺの ばんそうこう',
    skin: 0xdba57e, hair: 0xf2b04a, style: 'spiky', top: 0x6a5acd, pants: 0x2f8f8f, shoe: 0xffd84a, accent: 0xffd84a, bg: 0xd8d0ff,
    build(add) { add('D', 0x2fb5a0, [0, 2.2, -0.06], [1.3, 0.6, 1.24]); add('C', 0x2fb5a0, [0, 2.2, -0.6], [0.8, 0.06, 0.56]); add('B', 0xfff4d6, [0.36, 1.58, 0.5], [0.16, 0.07, 0.03], [0, 0.5, 0.3]);
      add('B', 0x3a3f55, [0, 0.82, 0.5], [0.7, 0.4, 0.12]); add('B', 0x8fe0c8, [0, 0.84, 0.57], [0.3, 0.22, 0.03], null, 0.4); for (const s of [-1, 1]) add('S', s > 0 ? 0xe5533d : 0xffd84a, [s * 0.26, 0.82, 0.57], [0.1, 0.1, 0.05]);
      add('O', 0xffd84a, [0, 1.12, 0.36], [0.26, 0.26, 0.06], null, 0.3); } },
  { id: 'homework', island: 'しゅくだい島', name: 'ノート', en: 'Note', role: 'しゅくだいの おてつだい', note: 'えんぴつの ぼうしと ランドセル。チェックの ✓ を むねに',
    skin: 0xf1c9a2, hair: 0x4a3426, style: 'bob', top: 0xfff4d6, pants: 0x3d7a5a, accent: 0xf2b04a, bg: 0xd6efc0,
    build(add) { add('C', 0xf2b04a, [0, 2.44, -0.02], [0.7, 0.5, 0.7]); add('K', 0xf4d9b0, [0, 2.84, -0.02], [0.7, 0.34, 0.7]); add('K', 0x3a3a3a, [0, 2.96, -0.02], [0.24, 0.12, 0.24]); add('C', 0xf08a8a, [0, 2.2, -0.02], [0.74, 0.1, 0.74]);
      add('B', 0xd9453a, [0, 0.96, -0.42], [0.72, 0.8, 0.3]); add('B', 0xb8382f, [0, 1.26, -0.4], [0.76, 0.24, 0.36]);
      add('B', 0x3d7a5a, [-0.12, 1.0, 0.36], [0.07, 0.2, 0.03], [0, 0, 0.7]); add('B', 0x3d7a5a, [0.08, 1.06, 0.36], [0.07, 0.36, 0.03], [0, 0, -0.6]);
      add('B', 0x7ec8d8, [0.74, 0.9, 0.2], [0.42, 0.52, 0.06], [0, 0, -0.15]); add('B', WHITE, [0.74, 0.9, 0.24], [0.34, 0.42, 0.02], [0, 0, -0.15]); } },
  { id: 'reading', island: 'よみもの島', name: 'ページ', en: 'Paige', role: 'としょかんの ししょ', note: 'おだんごに 本の しおり。ひらいた 本から 星が 出る',
    skin: 0xc68d65, hair: 0x2b2622, style: 'up', top: 0x7a4ab0, pants: 0x4a3f55, accent: 0xffd84a, bg: 0xdcc8f5, coat: true,
    build(add) { add('B', 0xe5533d, [0.1, 2.5, -0.18], [0.08, 0.5, 0.03], [0, 0, -0.3]);
      for (const s of [-1, 1]) add('T', 0xd9453a, [s * 0.22, 1.72, 0.56], [0.38, 0.3, 0.3]);
      add('S', 0xf2e3b8, [0, 1.3, 0.04], [0.9, 0.3, 0.8]); add('B', 0xf2e3b8, [-0.26, 0.98, 0.36], [0.18, 0.6, 0.06]);
      for (const s of [-1, 1]) add('B', 0x3d6fb0, [0.3 + s * 0.2, 0.86, 0.5], [0.4, 0.05, 0.5], [0.5, 0, s * 0.3]); for (const s of [-1, 1]) add('B', WHITE, [0.3 + s * 0.19, 0.89, 0.5], [0.34, 0.03, 0.44], [0.5, 0, s * 0.3]);
      add('O', 0xffd84a, [0.3, 1.3, 0.56], [0.2, 0.2, 0.06], null, 0.6); add('O', 0xffd84a, [0.52, 1.52, 0.5], [0.12, 0.12, 0.04], null, 0.6); } },
  { id: 'abc', island: 'ABC の 島', name: 'アビー', en: 'Abby', role: 'もじと おとの おともだち', note: 'あたまに つみき 3 こ。赤・あお・きいろの 3 色だけ',
    skin: 0xe8c39a, hair: 0xf2b04a, style: 'buns', top: 0x4aa3ff, pants: 0xe5533d, shoe: 0xffd84a, accent: 0xe5533d, bg: 0xfff0b0,
    build(add) { add('B', 0xe5533d, [-0.2, 2.52, 0.02], [0.4, 0.4, 0.4], [0, 0.3, 0]); add('B', 0xffd84a, [0.22, 2.5, 0.0], [0.36, 0.36, 0.36], [0, -0.2, 0]); add('B', 0x4aa3ff, [0.02, 2.88, 0.0], [0.34, 0.34, 0.34], [0, 0.6, 0.1]);
      add('B', 0xe5533d, [0, 0.86, 0.32], [0.5, 0.5, 0.1]); add('S', 0xffd84a, [0, 0.9, 0.39], [0.16, 0.16, 0.05]);
      add('B', 0x5fc27a, [0.74, 0.86, 0.22], [0.44, 0.44, 0.44], [0.2, 0.5, 0]); add('K', WHITE, [0.74, 0.9, 0.46], [0.22, 0.26, 0.03], [0.2, 0.5, 0]); } },
  { id: 'farm', island: 'ぼくじょう島', name: 'ハナ', en: 'Hana', role: 'ぼくじょうの むすめ', note: 'むぎわらぼうしに 花。大きな にんじんを かかえる',
    skin: 0xdba57e, hair: 0xc9703a, style: 'twin', top: 0xf4efe2, pants: 0x5a8f4a, shoe: 0x7a5a3a, accent: 0xe5533d, bg: 0xcdeaa8,
    build(add) { add('C', 0xe6cd86, [0, 2.28, 0], [2.0, 0.06, 1.9]); add('D', 0xe6cd86, [0, 2.28, 0], [1.14, 0.6, 1.08]); add('C', 0x5a8f4a, [0, 2.34, 0], [1.16, 0.1, 1.1]); for (let i = 0; i < 5; i += 1) { const a = (i / 5) * 6.283; add('S', 0xff8fb4, [0.5 + Math.cos(a) * 0.1, 2.4 + Math.sin(a) * 0.1, 0.36], [0.12, 0.12, 0.06]); } add('S', 0xffd84a, [0.5, 2.4, 0.39], [0.1, 0.1, 0.06]);
      add('B', 0x5a8f4a, [0, 0.9, 0.3], [0.56, 0.56, 0.14]); for (const s of [-1, 1]) add('B', 0x5a8f4a, [s * 0.24, 1.24, 0.24], [0.1, 0.36, 0.08]);
      add('K', 0xf08a2a, [0.5, 0.9, 0.46], [0.34, 0.9, 0.34], [Math.PI - 0.5, 0, 0.5]); for (const s of [-1, 0, 1]) add('K', 0x4f9a3a, [0.74 + s * 0.08, 1.34, 0.3], [0.12, 0.4, 0.12], [0.2, 0, -0.4 + s * 0.3]); } },
  { id: 'land', island: '土地島', name: 'ミスター・キー', en: 'Mr. Key', role: 'しまの ふどうさんやさん', note: 'せの 高い シルクハットと ちょうネクタイ。金の かぎが 光る',
    skin: 0xf1c9a2, hair: 0x4a3426, style: 'short', top: 0x2f4a3f, pants: 0x2a2f3a, accent: GOLD, bg: 0xb8e0d0, coat: true,
    build(add) { add('C', 0x1f2a26, [0, 2.3, -0.02], [1.5, 0.06, 1.44]); add('C', 0x1f2a26, [0, 2.7, -0.02], [0.86, 0.8, 0.82]); add('C', 0xe27a2d, [0, 2.4, -0.02], [0.88, 0.12, 0.84]);
      add('S', 0x6a4a36, [0, 1.52, 0.52], [0.5, 0.12, 0.1]); for (const s of [-1, 1]) add('K', 0xe27a2d, [s * 0.16, 1.26, 0.4], [0.24, 0.3, 0.12], [0, 0, s * Math.PI / 2]);
      add('T', GOLD, [0.76, 1.3, 0.2], [0.44, 0.44, 0.6], null, 0.3); add('B', GOLD, [0.76, 0.84, 0.2], [0.1, 0.62, 0.08], null, 0.3); for (const y of [0.62, 0.78]) add('B', GOLD, [0.88, y, 0.2], [0.18, 0.08, 0.08], null, 0.3); } },
  { id: 'fishworld', island: 'つり島', name: 'ゴンじい', en: 'Old Gon', role: 'つり島の ぬし', note: '白い ひげと あおい ぼうし。かたに のった 大きな さかな',
    skin: 0xc68d65, hair: 0xf0f0f0, style: 'none', top: 0x2f6f8f, pants: 0x4a4436, shoe: 0x2a2a2e, accent: 0xf2b04a, bg: 0xa8d8f0, eye: 'smile',
    build(add) { add('D', 0x1f4e79, [0, 2.16, -0.02], [1.3, 0.66, 1.24]); add('C', 0x1f4e79, [0, 2.17, 0.36], [0.9, 0.06, 0.66]); add('S', 0xf2b04a, [0, 2.4, 0.46], [0.16, 0.16, 0.06]);
      add('S', 0xf4f4f4, [0, 1.42, 0.36], [0.9, 0.66, 0.46]); for (const s of [-1, 1]) { add('S', 0xf4f4f4, [s * 0.5, 1.62, 0.2], [0.3, 0.5, 0.4]); add('S', 0xf4f4f4, [s * 0.24, 1.9, 0.5], [0.3, 0.1, 0.08], [0, 0, s * 0.3]); }
      add('S', 0x5fb0d8, [-0.7, 1.26, 0.1], [0.5, 0.9, 0.3], [0, 0, 0.5]); add('K', 0x5fb0d8, [-0.98, 0.72, 0.1], [0.44, 0.36, 0.12], [0, 0, 0.5]); add('S', WHITE, [-0.5, 1.5, 0.24], [0.1, 0.1, 0.05]); add('S', INK, [-0.5, 1.5, 0.27], [0.05, 0.05, 0.03]); } },
  { id: 'conv', island: '英会話島', name: 'ラテ', en: 'Latte', role: 'カフェの バリスタ', note: 'エプロンと ゆげの たつ カップ。ハートの ラテアート',
    skin: 0xa9714d, hair: 0x2b2622, style: 'curly', top: 0xfff4d6, pants: 0x4a3426, accent: 0x8a5a3a, bg: 0xf0d8b8,
    build(add) { add('B', 0x6a4a36, [0, 0.88, 0.34], [0.66, 0.8, 0.06]); add('B', 0x6a4a36, [0, 1.28, 0.3], [0.3, 0.2, 0.05]); add('B', 0xfff4d6, [0, 0.8, 0.38], [0.3, 0.2, 0.03]);
      add('C', WHITE, [0.72, 0.9, 0.24], [0.4, 0.36, 0.4]); add('C', 0xb07a4a, [0.72, 1.07, 0.24], [0.34, 0.03, 0.34]); add('S', 0xfff4d6, [0.72, 1.09, 0.24], [0.14, 0.02, 0.12]); add('T', WHITE, [0.94, 0.9, 0.24], [0.24, 0.24, 0.3]);
      for (const [x, y] of [[0.66, 1.3], [0.78, 1.5]]) add('S', WHITE, [x, y, 0.24], [0.1, 0.2, 0.06]);
      add('S', 0xe27a2d, [0, 2.36, 0.1], [0.24, 0.14, 0.2]); } },
  { id: 'eiken', island: '英検の島', name: 'ゴール先生', en: 'Ms. Goal', role: '英検の しけんかん', note: 'はかまと サクラの かんざし。合格の メダルを さしだす',
    skin: 0xf1c9a2, hair: 0x2b2622, style: 'bun', top: 0xf4efe2, pants: 0x7a2f4a, shoe: 0xf4efe2, accent: 0xf0b6c8, bg: 0xf5c8d8, coat: 0x7a2f4a,
    build(add) { for (let i = 0; i < 5; i += 1) { const a = (i / 5) * 6.283; add('S', 0xf7a8c4, [0.36 + Math.cos(a) * 0.1, 2.34 + Math.sin(a) * 0.1, 0.1], [0.13, 0.13, 0.07]); } add('S', 0xffd84a, [0.36, 2.34, 0.14], [0.08, 0.08, 0.06]);
      add('B', 0xf4efe2, [0.12, 1.14, 0.34], [0.5, 0.1, 0.05], [0, 0, 0.7]); add('B', 0xf4efe2, [-0.12, 1.14, 0.34], [0.5, 0.1, 0.05], [0, 0, -0.7]); add('C', 0xe27a2d, [0, 0.94, 0.02], [0.86, 0.14, 0.72]);
      add('B', 0x3d6fb0, [0.72, 1.06, 0.26], [0.08, 0.4, 0.03], [0, 0, 0.3]); add('B', 0xe5533d, [0.8, 1.06, 0.26], [0.08, 0.4, 0.03], [0, 0, -0.3]); add('C', GOLD, [0.76, 0.8, 0.28], [0.34, 0.06, 0.34], [Math.PI / 2, 0, 0], 0.35); add('O', 0xfff4d6, [0.76, 0.8, 0.32], [0.16, 0.16, 0.04]); } },
  { id: 'park', island: 'テーマパーク', name: 'パレード', en: 'Parade', role: 'パークの だんちょう', note: 'しましまの 高い ぼうしと 赤い はな。ふうせん 3 つ',
    skin: 0xe8c39a, hair: 0xe27a2d, style: 'curly', top: 0xe5533d, pants: 0xfff4d6, shoe: 0x3d6fb0, accent: GOLD, bg: 0xffe0a8, coat: true,
    build(add) { for (let i = 0; i < 4; i += 1) add('C', i % 2 ? WHITE : 0x3d6fb0, [0, 2.44 + i * 0.2, -0.02], [0.72 - i * 0.03, 0.2, 0.7 - i * 0.03]); add('C', 0x3d6fb0, [0, 2.34, -0.02], [1.2, 0.06, 1.16]); add('O', GOLD, [0, 3.26, -0.02], [0.2, 0.2, 0.2], null, 0.4);
      add('S', 0xe5533d, [0, 1.64, 0.6], [0.16, 0.16, 0.16]); for (const y of [1.12, 0.9, 0.68]) add('S', GOLD, [0, y, 0.37], [0.1, 0.1, 0.06]);
      [[0xff7fa8, 0.6, 2.5], [0x7ed0ff, 0.96, 2.76], [0xffd84a, 1.2, 2.38]].forEach(([c, x, y]) => { add('S', c, [x, y, 0.1], [0.44, 0.52, 0.44]); add('C', 0xe8e8e8, [(x + 0.66) / 2, (y + 0.8) / 2, 0.1], [0.012, Math.hypot(x - 0.66, y - 0.8), 0.012], [0, 0, -Math.atan2(x - 0.66, y - 0.8)]); }); } },
];

export function buildCastMember(id) {
  const c = CAST.find((m) => m.id === id); if (!c) return null;
  const group = new THREE.Group();
  const add = maker(group);
  body(add, c, group);
  c.build(add, c);
  group.userData.cast = c;
  return group;
}

// 島の id → キャラクターの id（英検の 7 島は 同じ 先生）。
export const castIdOf = (islandId) => (/^eiken/.test(islandId || '') ? 'eiken' : islandId);

// 島に 立たせる：その 場で ゆれて、子どもが 近づくと そちらを 向いて ぴょんと はねる。当たり判定は なし。
export function placeHost(parent, islandId, x, z, { scale = 1.12, face = 0 } = {}) {
  const group = buildCastMember(castIdOf(islandId)); if (!group) return null;
  group.position.set(x, 0, z); group.scale.setScalar(scale); group.rotation.y = face;
  parent.add(group);
  let seen = 0;
  return {
    group, cast: group.userData.cast, x, z,
    // px・pz は parent の 中の 座標での 子どもの 位置。
    update(t, px, pz) {
      const d = Math.hypot(px - x, pz - z), near = d < 9;
      seen += ((near ? 1 : 0) - seen) * 0.08;
      if (d < 16) { const want = Math.atan2(px - x, pz - z); let diff = want - group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); group.rotation.y += diff * 0.12; }
      group.position.y = Math.abs(Math.sin(t * (2.2 + seen * 3.2) + x)) * (0.05 + seen * 0.16);
      group.rotation.z = Math.sin(t * 1.7 + z) * 0.03;
      return d;
    },
  };
}

// アバターの デザイン案（avatar-chibi.js）も 同じ 体・同じ 部品を 使う。
export { maker as chibiMaker, body as chibiBody, INK as CHIBI_INK, ARM as CHIBI_ARM };
