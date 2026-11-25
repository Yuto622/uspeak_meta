// 部屋の 役わりに 合わせた 小物（2026-11：「異次元の 内装と いっても、それぞれ 属性に あわせて。よむ 部屋なら 本が つんで ある」）。
// island-interior.js の 部屋（幅 14・カウンター z=-3.2・入口 z=8.4）に 足す。**色は そのまま**（宇宙の 色に よせない＝本は 本の 色）。
// ・まんなかの 通り道（|x| < 2.4）と カウンターの 前は あける。置くのは 左右の かべぞい（z 3〜7.5）と かべの 上。
// ・箱だけ（B を もらう）。光は 足さない。大きい ものは 当たり判定（{x, z, w, d}＝半分の 幅）を 返す。
const BOOKS = [0xd9534f, 0x3f6fd0, 0xf2b04a, 0x2f8f5b, 0x8a5ad0, 0xe27a2d, 0x3aa6a0, 0xc8507a];

// どの 小物を 置くか：まず 建物の しゅるい、なければ 島。
export function themeOf(islandId, spot) {
  const k = String(spot?.kind || '');
  if (k === 'reading') return 'books';
  if (k === 'listening') return 'listening';
  if (k === 'writing') return 'writing';
  if (['speaking', 'booth', 'interview', 'talk_shop'].includes(k)) return 'speaking';
  if (['hut', 'homework', 'word_house'].includes(k)) return 'quiz';
  if (k === 'gym') return 'gym';
  if (['dojo', 'battle_arena', 'stand'].includes(k) && islandId === 'arena') return 'dojo';
  if (['nest', 'kitchen', 'meadow'].includes(k)) return 'pet';
  if (['gate', 'start'].includes(k) && islandId === 'ride') return 'ride';
  if (k === 'shop' || k === 'agent' || k === 'furniture' || k.endsWith('_shop')) return 'shop';
  return { reading: 'books', homework: 'quiz', abc: 'quiz', school: 'quiz', conv: 'speaking', talk: 'speaking', arena: 'dojo', pet: 'pet', ride: 'ride', town: 'shop', wear: 'shop', land: 'shop', farm: 'pet' }[islandId] || (String(islandId).startsWith('eiken') ? 'books' : 'stars');
}

export function addProps(theme, { B }) {
  const solid = []; const block = (x, z, w, d) => solid.push({ x, z, w, d });
  const G = 0.12;   // うすく 光らせる（くらい 部屋で 色が 見える ように）
  const both = (fn) => { fn(-1); fn(1); };
  const stack = (x, z, n, seed = 0) => { for (let i = 0; i < n; i += 1) { const m = B(x + ((i * 7 + seed) % 3 - 1) * 0.06, 0.12 + i * 0.2, z, 0.95, 0.19, 0.68, BOOKS[(i + seed) % BOOKS.length], G); m.rotation.y = ((i * 5 + seed) % 7 - 3) * 0.12; B(x + 0.02, 0.12 + i * 0.2, z + 0.345, 0.86, 0.13, 0.02, 0xfff4e0, G).rotation.y = m.rotation.y; } };
  const shelf = (s, z0 = 5.2, wood = 0x8d6642) => {
    const x = s * 6.55; B(x, 1.75, z0, 0.7, 3.5, 3.6, wood, G); block(x, z0, 0.5, 1.9);
    for (let row = 0; row < 3; row += 1) { B(x - s * 0.05, 0.42 + row * 1.08, z0, 0.74, 0.1, 3.5, 0xe6d3a8, G); for (let j = 0; j < 9; j += 1) { const h = 0.62 + ((j * 3 + row) % 4) * 0.07; B(x - s * 0.32, 0.5 + row * 1.08 + h / 2, z0 - 1.5 + j * 0.37, 0.24, h, 0.3, BOOKS[(j + row * 3) % BOOKS.length], G); } }
  };
  const desk = (x, z, top = 0xd8c9a4) => { B(x, 0.78, z, 1.9, 0.12, 1.1, top, G); for (const dx of [-0.8, 0.8]) B(x + dx, 0.38, z, 0.14, 0.76, 0.9, 0x8d6642, G); block(x, z, 0.95, 0.55); };
  const stool = (x, z, c) => { B(x, 0.46, z, 0.56, 0.1, 0.56, c, G); B(x, 0.22, z, 0.12, 0.44, 0.12, 0x5a4a3a, G); };
  const note = (x, y, z, c) => { B(x, y, z, 0.26, 0.2, 0.08, c, 0.5); B(x + 0.11, y + 0.3, z, 0.05, 0.6, 0.06, c, 0.5); B(x + 0.23, y + 0.56, z, 0.24, 0.1, 0.06, c, 0.5); };
  const bubble = (s, y, z, c = 0xffffff) => { const x = s * 7.05; B(x, y, z, 0.1, 1.0, 1.9, c, 0.3); B(x - s * 0.02, y - 0.62, z + 0.5, 0.1, 0.3, 0.3, c, 0.3); for (let i = 0; i < 3; i += 1) B(x - s * 0.07, y, z - 0.5 + i * 0.5, 0.04, 0.16, 0.16, 0x1b3a2f, 0); };
  const crate = (x, z, c = 0xb08655) => { B(x, 0.45, z, 0.95, 0.9, 0.95, c, G); B(x, 0.45, z + 0.48, 0.8, 0.12, 0.02, 0x7a5a3a, G); };

  if (theme === 'books') {
    both((s) => shelf(s));
    stack(-4.3, 6.6, 6, 1); stack(-3.4, 4.2, 3, 4); stack(4.2, 6.9, 5, 2); stack(3.5, 3.9, 4, 6); stack(5.2, 2.4, 2, 3);
    // ひらいた 本と 読書の 台
    B(-4.6, 0.5, 2.5, 1.0, 1.0, 0.8, 0x8d6642, G); const l = B(-4.86, 1.06, 2.5, 0.5, 0.05, 0.7, 0xfffaf0, G); l.rotation.z = 0.18; const r = B(-4.34, 1.06, 2.5, 0.5, 0.05, 0.7, 0xfffaf0, G); r.rotation.z = -0.18; block(-4.6, 2.5, 0.5, 0.4);
  } else if (theme === 'listening') {
    both((s) => { const x = s * 6.2; B(x, 1.3, 5.2, 1.3, 2.6, 1.5, 0x2a2f38, G); B(x - s * 0.66, 1.85, 5.2, 0.05, 0.9, 0.9, 0x7a8590, 0.3); B(x - s * 0.69, 1.85, 5.2, 0.05, 0.36, 0.36, 0xffb066, 0.6); B(x - s * 0.66, 0.75, 5.2, 0.05, 0.6, 0.6, 0x7a8590, 0.3); block(x, 5.2, 0.65, 0.75); });
    B(4.2, 0.5, 2.6, 0.9, 1.0, 0.9, 0x8d6642, G); B(4.2, 1.5, 2.6, 0.95, 0.1, 0.2, 0x26323c, G); for (const dx of [-0.42, 0.42]) B(4.2 + dx, 1.25, 2.6, 0.2, 0.5, 0.42, 0xe27a2d, 0.3); block(4.2, 2.6, 0.45, 0.45);
    note(-6.9, 3.4, 1.6, 0x8ff0c8); note(-6.9, 4.3, 3.2, 0xffb066); note(6.6, 3.7, 2.4, 0xffd166); note(6.6, 4.4, 0.4, 0x8ff0c8);
    for (let i = 0; i < 7; i += 1) B(-4.6 + i * 0.22, 0.14 + Math.abs(3 - i) * -0.06 + 0.5, 6.6, 0.14, 0.5 + (3 - Math.abs(3 - i)) * 0.32, 0.14, i % 2 ? 0xffb066 : 0x8ff0c8, 0.5);
  } else if (theme === 'writing') {
    desk(-4.6, 5.2); desk(4.6, 5.2); stool(-4.6, 6.4, 0xe27a2d); stool(4.6, 6.4, 0x2f8f5b);
    both((s) => { const x = s * 4.6; B(x - 0.3, 0.86, 5.2, 0.7, 0.02, 0.9, 0xffffff, G); for (let i = 0; i < 4; i += 1) B(x - 0.3, 0.875, 4.9 + i * 0.2, 0.5, 0.01, 0.03, 0x8fb0d0, 0); B(x + 0.6, 1.0, 5.0, 0.26, 0.3, 0.26, 0x3f6fd0, G); for (let i = 0; i < 3; i += 1) B(x + 0.53 + i * 0.07, 1.3, 5.0, 0.05, 0.4, 0.05, [0xf2b04a, 0xd9534f, 0x2f8f5b][i], G); });
    both((s) => { const x = s * 7.05; B(x, 3.1, 4.6, 0.08, 2.4, 1.8, 0xfffaf0, 0.25); for (let i = 0; i < 6; i += 1) B(x - s * 0.05, 3.9 - i * 0.34, 4.6, 0.03, 0.04, 1.4 - (i % 3) * 0.3, 0x3f6fd0, 0); });
    const p = B(3.2, 0.9, 7.2, 0.24, 1.9, 0.24, 0xf2c14a, G); p.rotation.z = -0.5; const tip = B(3.72, 1.76, 7.2, 0.16, 0.24, 0.16, 0x2b2b28, G); tip.rotation.z = -0.5;
  } else if (theme === 'speaking') {
    both((s) => { const x = s * 4.8; B(x, 0.06, 5.4, 0.7, 0.1, 0.7, 0x26323c, G); B(x, 0.95, 5.4, 0.08, 1.8, 0.08, 0x7a8590, G); B(x, 1.95, 5.4, 0.26, 0.34, 0.26, 0xd8d2c4, 0.3); B(x, 1.75, 5.4, 0.3, 0.06, 0.3, 0xe27a2d, 0.4); });
    bubble(-1, 3.2, 4.4); bubble(-1, 4.3, 1.8, 0xffe9c2); bubble(1, 3.4, 3.4, 0xd8ffe9); bubble(1, 4.4, 5.6);
    B(-5.4, 0.25, 2.4, 1.6, 0.5, 1.6, 0xe27a2d, G); B(5.4, 0.25, 2.4, 1.6, 0.5, 1.6, 0x2f8f5b, G); block(-5.4, 2.4, 0.8, 0.8); block(5.4, 2.4, 0.8, 0.8);
  } else if (theme === 'quiz') {
    both((s) => { const x = s * 7.05; B(x, 2.9, 4.6, 0.1, 2.0, 3.6, 0x2f5a44, 0.2); B(x, 2.9, 4.6, 0.14, 2.2, 3.8, 0x8d6642, G).scale.x = 0.06; B(x - s * 0.06, 3.3, 4.6, 0.03, 0.06, 2.4, 0xffffff, 0.4); B(x - s * 0.06, 2.9, 4.2, 0.03, 0.06, 1.6, 0xffe08a, 0.4); B(x - s * 0.06, 2.5, 4.9, 0.03, 0.06, 2.0, 0xffffff, 0.4); B(x - s * 0.2, 1.84, 4.6, 0.3, 0.08, 3.6, 0x8d6642, G); });
    for (const [x, z] of [[-4.6, 3.6], [-4.6, 6.2], [4.6, 3.6], [4.6, 6.2]]) { desk(x, z); stool(x, z + 1.0, 0xe27a2d); }
    const abc = [[0xd9534f, 0], [0x3f6fd0, 1], [0xf2b04a, 2]]; for (const [c, i] of abc) B(3.2 + (i === 2 ? 0.35 : i * 0.7), i === 2 ? 1.05 : 0.35, 7.4, 0.7, 0.7, 0.7, c, G);
    B(-4.6, 0.92, 3.6, 0.5, 0.16, 0.36, 0xd9534f, G); B(4.6, 0.92, 6.2, 0.5, 0.16, 0.36, 0x3f6fd0, G);
  } else if (theme === 'gym') {
    both((s) => { const x = s * 5.6; B(x, 0.5, 5.4, 2.2, 0.1, 0.5, 0x7a8590, G); for (const dx of [-0.8, 0, 0.8]) { B(x + dx, 0.78, 5.4, 0.5, 0.12, 0.12, 0x26323c, G); for (const e of [-0.25, 0.25]) B(x + dx + e, 0.78, 5.4, 0.12, 0.36, 0.36, [0xd9534f, 0xf2b04a, 0x3f6fd0][(dx + 0.8) / 0.8 | 0], G); } for (const dx of [-1, 1]) B(x + dx, 0.25, 5.4, 0.1, 0.5, 0.4, 0x7a8590, G); block(x, 5.4, 1.1, 0.3); });
    B(-4.6, 0.07, 2.6, 2.4, 0.1, 1.4, 0x3aa6a0, G); B(4.6, 0.07, 2.6, 2.4, 0.1, 1.4, 0xe27a2d, G);
    for (let i = 0; i < 3; i += 1) B(4.2 + i * 0.5, 0.3 + i * 0.12, 7.2, 0.44, 0.6 + i * 0.24, 0.44, 0xffd166, G);
  } else if (theme === 'dojo') {
    both((s) => { const x = s * 5.4; B(x, 0.08, 5.2, 1.0, 0.16, 1.0, 0x5a4a3a, G); B(x, 1.0, 5.2, 0.3, 1.7, 0.3, 0xb08655, G); B(x, 1.45, 5.2, 1.3, 0.22, 0.22, 0xb08655, G); B(x, 2.05, 5.2, 0.6, 0.5, 0.6, 0xe6d3a8, G); B(x, 2.05, 5.52, 0.3, 0.3, 0.02, 0xd9534f, 0.4); block(x, 5.2, 0.5, 0.5); });
    both((s) => { const x = s * 7.05; B(x, 3.3, 3.0, 0.08, 2.6, 1.1, s < 0 ? 0xd9534f : 0x3f6fd0, 0.3); B(x - s * 0.05, 3.6, 3.0, 0.03, 0.7, 0.7, 0xffd166, 0.5); B(x, 4.66, 3.0, 0.12, 0.12, 1.4, 0x8d6642, G); });
    B(-4.4, 0.7, 7.4, 2.2, 0.1, 0.3, 0x8d6642, G); for (let i = 0; i < 3; i += 1) { const m = B(-5.1 + i * 0.7, 1.2, 7.4, 0.1, 1.5, 0.1, [0xc0c8d0, 0xffd166, 0x8ff0c8][i], 0.3); m.rotation.z = 0.1; }
  } else if (theme === 'pet') {
    both((s) => { const x = s * 5.2; B(x, 0.2, 5.4, 1.9, 0.4, 1.9, 0xd8b56a, G); B(x, 0.42, 5.4, 1.5, 0.12, 1.5, 0xe9d08a, G); for (const [dx, dz, c] of [[-0.35, -0.2, 0xfff4e0], [0.3, 0.1, 0xffe0ea], [0, 0.42, 0xd8ffe9]]) { B(x + dx, 0.78, 5.4 + dz, 0.42, 0.56, 0.42, c, 0.25); B(x + dx, 0.82, 5.4 + dz + 0.215, 0.14, 0.14, 0.02, 0xe27a2d, 0.3); } block(x, 5.4, 0.95, 0.95); });
    for (const [x, c] of [[-4.6, 0xd9534f], [-3.6, 0x3f6fd0]]) { B(x, 0.14, 2.6, 0.7, 0.28, 0.7, c, G); B(x, 0.3, 2.6, 0.5, 0.06, 0.5, 0xb08655, G); }
    for (let i = 0; i < 5; i += 1) { const z = 7.6 - i * 1.1, x = 3.6 + (i % 2) * 0.5; B(x, 0.085, z, 0.3, 0.02, 0.3, 0xffb066, 0.5); for (const dx of [-0.16, 0, 0.16]) B(x + dx, 0.085, z - 0.26, 0.1, 0.02, 0.1, 0xffb066, 0.5); }
  } else if (theme === 'ride') {
    both((s) => { const x = s * 5.6; for (let i = 0; i < 4; i += 1) { B(x, 0.2 + i * 0.4, 5.4, 1.1, 0.36, 1.1, 0x26323c, G); B(x, 0.2 + i * 0.4, 5.4, 0.5, 0.38, 0.5, 0x7a8590, G); } block(x, 5.4, 0.55, 0.55); });
    for (const x of [-4.2, -3.4, 3.4, 4.2]) { B(x, 0.05, 7.4, 0.5, 0.1, 0.5, 0xe27a2d, G); B(x, 0.42, 7.4, 0.3, 0.64, 0.3, 0xe27a2d, 0.3); B(x, 0.5, 7.4, 0.32, 0.12, 0.32, 0xffffff, 0.3); }
    B(4.6, 0.3, 2.6, 1.1, 0.6, 0.6, 0xd9534f, G); B(4.6, 0.66, 2.6, 0.5, 0.1, 0.1, 0x26323c, G);
    B(-4.6, 0.5, 2.6, 0.7, 1.0, 0.7, 0x8d6642, G); B(-4.6, 1.2, 2.6, 0.5, 0.4, 0.3, 0xffd166, 0.5); for (const dx of [-0.3, 0.3]) B(-4.6 + dx, 1.3, 2.6, 0.12, 0.3, 0.1, 0xffd166, 0.5); block(-4.6, 2.6, 0.35, 0.35);
    for (let i = 0; i < 8; i += 1) for (let j = 0; j < 2; j += 1) B(-7.05, 3.0 + j * 0.4, 2.8 + i * 0.4, 0.06, 0.4, 0.4, (i + j) % 2 ? 0xffffff : 0x26323c, 0.2);
  } else if (theme === 'shop') {
    both((s) => { const x = s * 6.5; B(x, 1.5, 5.2, 0.8, 3.0, 3.4, 0x8d6642, G); block(x, 5.2, 0.5, 1.8); for (let row = 0; row < 3; row += 1) { B(x - s * 0.06, 0.5 + row * 0.95, 5.2, 0.86, 0.08, 3.3, 0xe6d3a8, G); for (let j = 0; j < 6; j += 1) B(x - s * 0.3, 0.76 + row * 0.95, 3.8 + j * 0.56, 0.36, 0.42, 0.36, BOOKS[(j * 2 + row) % BOOKS.length], G); } });
    crate(-4.2, 7.0); crate(-3.2, 7.2, 0x9a7446); B(-3.7, 1.2, 7.1, 0.9, 0.6, 0.9, 0xb08655, G); crate(4.2, 7.0);
    for (let i = 0; i < 5; i += 1) B(3.4, 0.07 + i * 0.1, 3.0, 0.42, 0.09, 0.42, 0xffd166, 0.5);
  } else {
    for (const [x, z, c, h] of [[-5.4, 5.4, 0x8ff0c8, 1.8], [-4.4, 6.6, 0xffb066, 1.1], [5.4, 5.0, 0xffb066, 2.0], [4.6, 6.6, 0xffd166, 1.2]]) { const m = B(x, h / 2, z, 0.5, h, 0.5, c, 0.5); m.rotation.y = 0.78; }
    B(-4.6, 0.5, 2.6, 0.6, 1.0, 0.6, 0x8d6642, G); const globe = B(-4.6, 1.5, 2.6, 0.8, 0.8, 0.8, 0x2f8f5b, 0.3); globe.rotation.set(0.4, 0.6, 0.2); B(-4.6, 1.5, 2.6, 1.3, 0.05, 1.3, 0xffd166, 0.5).rotation.set(0.4, 0.6, 0.2);
  }
  return solid;
}
