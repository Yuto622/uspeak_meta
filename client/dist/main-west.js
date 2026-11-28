// メインの島の 西の 通り（2026-11：「とりあえず、水族館、モールを ビル群の 左側の 土地を 拡張し そこに 横並びで 配置」
//                         ＋「高級服屋、高級家具屋も 同じく 横並びで」）。
//
// 場所：ビルの まち（main-city.js）の 西。B どおり（z -31）を そのまま 西へ のばした「ウエスト アベニュー」の 北がわに、
// 西から 水族館 → ショッピングモール → MAISON U（ふくの おみせ）→ ROYAL HOME（かぐの おみせ）を 1 列に。どれも 南（道）むき。
//   土地 … `WEST.land`（main-plaza.js の `PLAZA.annex.also` に 入れる。じてんしゃやの 四角は いつも いちばん 後ろ）。
//   道   … main_island.json の `roads` の さいご（x -244〜-76, z -31）。東の はしで ビルの まちの B どおりに つながる。
//   橋   … 道の 南の 岸から えいごアリーナ島へ（bridges-data.js の main–arena）、モールと ふくやの 間の 北の 岸から ささやきの森へ（main–forest）。
// 外がわは この ファイルで 置き、中は venue.js（べつの シーン）。戸口は main_island.json の spots（kind mall / aquarium / boutique / furniture）。
// ふくや・かぐやの 3D（boutique-real.js）は 外と 中が 1 つの 形なので、外に 1 つ（入れない＝足もとは 当たり判定で ふさぐ）、
// 中に もう 1 つ（venue.js）を 作る。もようは 2 つで 共有なので ふえない。
// 光は 足さない（どれも emissive だけ）。夜は main-world.js の setNight から `west?.setNight(n)`。
import { buildMallExterior } from './mall-real.js';
import { buildBoutique, buildFurnitureShowroom } from './boutique-real.js';
import { buildAquariumExterior } from './aquarium-ext.js';

// 建物の 置き場所（島の 中の 座標・原点は どれも 正面の 地面）。`door` は 戸口（main_island.json の spot と 同じ 数字）。
export const WEST = {
  land: { x0: -246, x1: -74, z0: -74, z1: -20, r: 9 },
  avenue: { x0: -244, x1: -76, z: -31, w: 4 },
  aquarium: { x: -227, z: -46, y: 0.2 },
  mall: { x: -175, z: -46, y: 0.2 },
  boutique: { x: -120, z: -50, y: 0.44 },
  furniture: { x: -93, z: -50, y: 0.44 },
};
// 戸口（spot の x, z）。うごかす ときは main_island.json も。
export const WEST_DOORS = {
  aquarium: { x: -227, z: -44.2 },
  mall: { x: -169, z: -39.6 },
  boutique: { x: -124.6, z: -41.6 },
  furniture: { x: -93, z: -41.6 },
};
const SIGNS = {
  aquarium: { en: '🐋 U-SPEAK Aquarium', ja: '🐋 ユースピーク すいぞくかん', y: 12.6, dz: 3 },
  mall: { en: '🛍 U-SPEAK MALL', ja: '🛍 ユースピーク モール', y: 11.5, dz: 9.5 },
  boutique: { en: '👗 MAISON U', ja: '👗 MAISON U ふくの おみせ', y: 10.4, dz: 7.6 },
  furniture: { en: '🛋 ROYAL HOME', ja: '🛋 ROYAL HOME かぐの おみせ', y: 8.4, dz: 7.6 },
};

// 西の 通りの しき地か（木・草花を まかない）。
export function inWest(x, z, pad = 0) {
  const a = WEST.land;
  return x > a.x0 - pad && x < a.x1 + pad && z > a.z0 - pad && z < a.z1 + pad;
}

// 島を 建てる ときに 1 回（main-world.js の build の 中）。
export function buildWest({ root, D, sprite, obstacles, lamp }) {
  const parts = {};
  const place = (id, built, { solid = null } = {}) => {
    const at = WEST[id];
    built.group.position.set(at.x, at.y, at.z);
    built.group.traverse((o) => { o.userData.noLod = true; });   // 大きな まとまり（detail-lod.js は もともと さわらないが 念の ため）
    root.add(built.group);
    if (solid) obstacles.push(solid);
    else for (const o of built.obstacles) obstacles.push({ x: at.x + o.x, z: at.z + o.z, w: o.w, d: o.d });
    const s = SIGNS[id];
    sprite({ en: s.en, ja: s.ja }, WEST_DOORS[id].x, s.y, at.z + s.dz, { width: 8.4, size: 40 });
    parts[id] = { ...built, x: at.x, z: at.z, y: at.y };
    return built;
  };
  const hide = (x, z, w, d) => D(x, 0.1, z, w, 0.1, d, 0x8a8478, 0, 'cobble');   // 見えない 箱：草むらが 床から 生えない

  try {
    place('aquarium', buildAquariumExterior());
    hide(WEST.aquarium.x, WEST.aquarium.z - 3, 28, 30);
  } catch (err) { console.warn('[main] 水族館が 建てられない', err); }
  try {
    place('mall', buildMallExterior());
    hide(WEST.mall.x, WEST.mall.z - 4, 74, 34);
  } catch (err) { console.warn('[main] モールが 建てられない', err); }
  // ふくや・かぐや：外の 1 つは 中に 入れない（戸口で べつの シーンへ）。足もとは 建物の 四角＋前の 小物（ランタン・うえきばち・街灯）。
  for (const [id, build, hw] of [['boutique', buildBoutique, 8.2], ['furniture', buildFurnitureShowroom, 9.2]]) {
    try {
      const built = build();
      const at = WEST[id];
      place(id, built, { solid: { x: at.x, z: at.z, w: hw, d: 7.2 } });
      for (const o of built.obstacles) if (o.z - o.d > 7.3) obstacles.push({ x: at.x + o.x, z: at.z + o.z, w: o.w, d: o.d });
      hide(at.x, at.z + 2, 26, 30);
    } catch (err) { console.warn(`[main] ${id} が 建てられない`, err); }
  }
  // 道の 南の 歩道の 街灯（道の 南がわ・4 本）。
  for (const x of [-226, -190, -150, -104]) lamp(x, WEST.avenue.z + 3.6);

  function setNight(n) { for (const p of Object.values(parts)) p.setNight?.(n); }
  function update(t) { for (const p of Object.values(parts)) p.update?.(t); }
  // 遠くから（スタート・広場）は 描かない：建物の ふちから 110 より 遠い とき（霧の 中で ほぼ 見えない・描画 約 40 回と 20 万 三角形）。
  const HALFW = { aquarium: 14, mall: 36, boutique: 12, furniture: 13 };
  function near(lx, lz) {
    for (const [id, p] of Object.entries(parts)) { const on = Math.hypot(lx - p.x, lz - p.z) - HALFW[id] < 110; if (p.group.visible !== on) p.group.visible = on; }
  }
  // 歩道の 高さ（見た目の 床。島の 地面 0.2 からの 高さ）。モールの 歩道は +0.14、ふくや・かぐやの 歩道は +0.24。
  function floorY(lx, lz) {
    const m = WEST.mall;
    if (Math.abs(lx - m.x) < 36.5 && lz > m.z - 2 && lz < m.z + 11.1) return 0.14;
    for (const id of ['boutique', 'furniture']) {
      const b = WEST[id];
      if (Math.abs(lx - b.x) < 12.5 && lz > b.z + 7 && lz < b.z + 11) return 0.24;
    }
    return 0;
  }
  // ミニマップ：建物の 足もと（ガラスの 青・白・石・黒）。
  function drawMap(ctx, px, py, k) {
    const r = (x0, z0, x1, z1, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(px(x0), py(z0), (x1 - x0) * k, (z1 - z0) * k, 1.5); ctx.fill(); };
    const A = WEST.aquarium, M = WEST.mall, B = WEST.boutique, F = WEST.furniture;
    r(A.x - 13, A.z - 18, A.x + 13, A.z, '#4fb6d6');
    r(M.x - 35, M.z - 20, M.x + 35, M.z, '#e9e4da'); r(M.x - 35, M.z - 20, M.x - 10, M.z, '#9fd3ea');
    ctx.fillStyle = '#8fc8e8'; ctx.beginPath(); ctx.arc(px(M.x + 6), py(M.z - 3), 8.5 * k, 0, Math.PI * 2); ctx.fill();
    r(B.x - 8, B.z - 7, B.x + 8, B.z + 7, '#d8cbb4');
    r(F.x - 9, F.z - 7, F.x + 9, F.z + 7, '#3a3a40');
  }
  return { parts, setNight, update, near, floorY, drawMap };
}
