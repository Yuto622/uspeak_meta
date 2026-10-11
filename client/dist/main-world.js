// メインの島（3D）— Roblox の メインワールドを、ほかの島と同じ 島の部品（island-kit）で建てたもの。
//
// 並びは main_island.json の `island`（Roblox の pois を Web の島の大きさに並べなおしたもの）。
// 東に 英単語ハウス 3 軒と レベルの かんばん、まんなかに さかなの かいとりや、西に ゲートの列、
// 南の入り江に つり場の さんばしと つり島への ゲート。入り江の東が 船着き場（スタート）。
//
// 入れるのは P1 の 11 か所だけ（戸口を歩いて入る → net-client の setDoorHandler が main-island.js の walkIn() へ）。
// P2 / P3 の建物は 建っているだけで、札に 🔜 が付く（戸口は無い）。
// ふつうの島より大きいので、createIsland に size / power / land / dock を渡している。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';
import { isJa } from './i18n.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadMainWorld() {
  if (!promise) {
    promise = fetch('main_island.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`main_island.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[main] main_island.json failed to load', err); return { island: null }; });
  }
  return promise;
}

// 入り江とさんばしは データで決まるが、島を建てる前（createIsland）に要るので 先に読む値を持つ。
const BAY = { minX: -16, maxX: 22, minZ: 25 };
const PIER = { x: 4, minZ: 24, maxZ: 35, w: 3.4 };
const inBay = (x, z) => x > BAY.minX && x < BAY.maxX && z > BAY.minZ;

export function createMainWorld({ scene }) {
  const island = createIsland({
    scene,
    seed: 4242,
    size: { x: 54, z: 43 },
    power: 4,
    dock: { x: 31, z: 37 },
    hills: [{ x: -46, z: -32, r: 7 }],
    land: (x, z) => !inBay(x, z),
    build({ island: data, B, D, sprite, house, path, resident, door, tree, bush, flowers, rock, bench, lamp, fence, bunting, obstacles, rand }) {
      const boxes = [];          // 木や花を置かない場所（建物・道・水）
      const keep = (x, z, w, d) => boxes.push({ x, z, w, d });

      // 入り江：海の色の浅瀬と、さんばし。水の上は さんばしの板だけ歩ける。
      const bay = data.bay || BAY;
      const pier = data.pier || PIER;
      const bw = bay.maxX - bay.minX;
      D((bay.minX + bay.maxX) / 2, -0.55, bay.minZ + 10, bw, 0.2, 20, 0x5fb6c8, 0, true);
      for (let i = 0; i <= Math.round((pier.maxZ - pier.minZ) / 1.1); i += 1) D(pier.x, 0.2, pier.minZ + i * 1.1, pier.w, 0.22, 0.95, i % 2 ? 0xc0a077 : 0xb79768);
      for (const side of [-1, 1]) for (let z = pier.minZ + 2; z <= pier.maxZ; z += 3) D(pier.x + side * (pier.w / 2 + 0.1), -0.4, z, 0.3, 1.6, 0.3, 0x8a7350);
      lamp(pier.x + pier.w / 2 + 0.4, pier.maxZ - 1);
      const margin = 0.35;
      const westR = pier.x - pier.w / 2 + 0.05 - margin;
      const eastL = pier.x + pier.w / 2 - 0.05 + margin;
      const top = bay.minZ + margin;
      obstacles.push({ x: (bay.minX + westR) / 2, z: top + 12, w: (westR - bay.minX) / 2, d: 12 });
      obstacles.push({ x: (eastL + bay.maxX) / 2, z: top + 12, w: (bay.maxX - eastL) / 2, d: 12 });
      keep((bay.minX + bay.maxX) / 2, bay.minZ + 10, bw / 2 + 1, 11);

      // 道：Roblox の 町の 灰色の道。東西の大通りと、ゲートの列にそう 南北の道。
      for (const r of data.roads || []) {
        if (r.z !== undefined && r.x0 !== undefined) {
          for (let x = r.x0; x <= r.x1; x += 2) D(x, 0.16, r.z, 2.05, 0.12, r.w, 0x9a9a96, 0, true);
          for (let x = r.x0 + 1; x <= r.x1; x += 4) D(x, 0.23, r.z, 1.4, 0.04, 0.25, 0xf3f0e6, 0, true);
          keep((r.x0 + r.x1) / 2, r.z, (r.x1 - r.x0) / 2 + 1, r.w / 2 + 1);
        } else {
          for (let z = r.z0; z <= r.z1; z += 2) D(r.x, 0.15, z, r.w, 0.12, 2.05, 0x9a9a96, 0, true);
          keep(r.x, (r.z0 + r.z1) / 2, r.w / 2 + 1, (r.z1 - r.z0) / 2 + 1);
        }
      }

      // スタートの ほし（Roblox のスポーン）。船着き場から あがった ところ。
      const st = data.start || { x: 31, z: 30 };
      B(st.x, 0.2, st.z, 5, 0.2, 5, 0xf2d27a);
      D(st.x, 0.36, st.z, 3, 0.12, 3, 0xf2b630, 0.6);
      sprite({ en: '⭐ START', ja: '⭐ スタート' }, st.x, 2.6, st.z, { width: 5, size: 30 });
      keep(st.x, st.z, 3.5, 3.5);
      path(st.x, st.z, st.x, 16);

      // 入れる場所（P1）。
      for (const def of data.spots) {
        const color = Number(def.color);
        if (def.kind === 'word_house') {
          house(def.x, def.z - 4.6, 8.4, 6.4, color, 0x5a3e2a, { en: `📖 ${def.short || def.en}`, ja: `📖 ${def.shortJa || def.ja}` });
          // 屋根の上に大きな本（遠くから「ことばの いえ」と分かる）。
          D(def.x, 8.2, def.z - 4.6, 2.6, 1.8, 0.4, 0xf7f1e1);
          D(def.x, 8.2, def.z - 4.4, 0.18, 1.8, 0.5, color);
          facade('word_house', def.x, def.z - 4.6, 8.4, 6.4, color);
          keep(def.x, def.z - 4.6, 5.5, 4.5);
        } else if (def.kind === 'fish_buy') {
          house(def.x, def.z - 4.6, 8, 6.4, 0x6fb8c8, 0x2f5f78, { en: '🐟 Fish Market', ja: '🐟 さかなの かいとりや' });
          for (let i = 0; i < 4; i += 1) D(def.x - 2.4 + i * 1.6, 3.15, def.z - 1.05, 1.6, 0.3, 0.9, i % 2 ? 0x2f9e8f : 0xf7f1e1);
          facade('fish_buy', def.x, def.z - 4.6, 8, 6.4, 0x6fb8c8);
          keep(def.x, def.z - 4.6, 5, 4.5);
        } else if (def.kind === 'level_sign') {
          // 看板：2 本の柱と、SUPER EASY ⇔ EASY の板。
          for (const sx of [-1.4, 1.4]) D(def.x + sx, 1.3, def.z - 2.2, 0.3, 2.6, 0.3, 0x6f5b3e);
          D(def.x, 2.4, def.z - 2.2, 3.6, 1.6, 0.3, 0x1b3a2f);
          D(def.x, 2.4, def.z - 2.02, 3.2, 1.2, 0.08, 0xe27a2d, 0.4);
          obstacles.push({ x: def.x, z: def.z - 2.2, w: 1.9, d: 0.3 });
          sprite({ en: '🔁 SUPER EASY ⇔ EASY', ja: '🔁 レベルを かえる' }, def.x, 4.1, def.z - 2.2, { width: 7, size: 30 });
          keep(def.x, def.z - 2.2, 2.5, 1.5);
        } else if (def.kind === 'fishing') {
          // さんばしの先：さおかけと バケツ。
          D(def.x + 1.2, 0.8, def.z + 2.2, 0.2, 1.2, 0.2, 0x8a7350);
          D(def.x + 1.2, 1.5, def.z + 2.5, 0.08, 0.08, 2.2, 0x6d543a);
          D(def.x - 1.1, 0.55, def.z + 1.6, 0.7, 0.6, 0.7, 0x5a8fb0);
          sprite({ en: '🎣 Fishing Pier', ja: '🎣 つり場' }, def.x, 3.2, def.z + 2.4, { width: 6, size: 30 });
        } else if (def.kind === 'wear_shop' || def.kind === 'block_shop' || def.kind === 'land_shop' || def.kind === 'talk_shop') {
          // 専用の島と 同じ お店（中に入ると その島の 3D の メニュー）。
          house(def.x, def.z - 1.1 - def.d / 2, def.w, def.d, color, Number(def.roof), { en: `${def.icon} ${def.en}`, ja: `${def.icon} ${def.ja}` });
          facade(def.decor || def.kind, def.x, def.z - 1.1 - def.d / 2, def.w, def.d, color);
          keep(def.x, def.z - 1.1 - def.d / 2, def.w / 2 + 1.5, def.d / 2 + 2);
        } else if (def.kind === 'blockwild') {
          // たてる ばしょの 入口：ブロックの アーチ。くぐると BLOCKWILD（ブロックの 世界）へ。
          for (const sx of [-1.8, 1.8]) for (let y = 0; y < 4; y += 1) D(def.x + sx, 0.5 + y, def.z - 0.9, 1, 1, 1, y % 2 ? 0x8a9a4a : 0xb5603a);
          for (let i = -2; i <= 2; i += 1) D(def.x + i * 0.9, 4.5, def.z - 0.9, 0.9, 1, 1, i % 2 ? 0x6fa8dc : 0xf3c33a);
          for (const sx of [-1.8, 1.8]) obstacles.push({ x: def.x + sx, z: def.z - 0.9, w: 0.5, d: 0.5 });
          sprite({ en: `${def.icon} BLOCKWILD`, ja: `${def.icon} BLOCKWILD で たてる` }, def.x, 5.8, def.z - 0.9, { width: 6.5 });
          keep(def.x, def.z - 0.9, 2.6, 1);
        } else if (def.kind === 'food_shop') {
          // 屋台（買える）：しましまの屋根と カウンター。戸口（def）は 道がわ、屋台は その 南。
          const kz = def.z + 2.6;
          D(def.x, 0.6, kz, 3.4, 1.0, 2, 0xa8835a);
          for (const sx of [-1.5, 1.5]) D(def.x + sx, 1.6, kz + 0.8, 0.18, 2.2, 0.18, 0x6f5b3e);
          for (let i = 0; i < 5; i += 1) D(def.x - 1.6 + i * 0.8, 2.75, kz, 0.8, 0.22, 2.6, i % 2 ? color : 0xf7f1e1);
          D(def.x, 1.2, kz - 0.9, 0.9, 0.5, 0.5, 0xf7f1e1);
          obstacles.push({ x: def.x, z: kz, w: 1.8, d: 1.1 });
          sprite({ en: `${def.icon} ${def.en}`, ja: `${def.icon} ${def.ja}` }, def.x, 3.9, kz, { width: 6 });
          keep(def.x, kz, 2.6, 2);
        } else if (def.kind === 'gate') {
          gate(def, color);
        }
        door(def, 0.75, 0);
        keep((def.x + def.path.x) / 2, (def.z + def.path.z) / 2, Math.abs(def.x - def.path.x) / 2 + 1.5, Math.abs(def.z - def.path.z) / 2 + 1.5);
        if (def.kind === 'fishing') path(def.path.x, def.path.z, def.x, (data.pier || PIER).minZ);
        if (def.kind !== 'fishing' && def.kind !== 'gate') path(def.path.x, def.path.z, def.x, def.z);
        else if (def.kind === 'gate' && def.path.x !== def.x) path(def.path.x, def.path.z, def.x, def.z);
        resident(def);
      }

      // お店の 外がわ（2026-10）。どの家も 同じ 形（island-kit の house）なので、屋根の 上の 大きな しるしと
      // 戸口の 両わきの 小物で「なんの お店か」を 遠くから 分かるように する。D（まとめて 描く 箱）だけで 作る＝重くならない。
      // 戸口の 前（x が ±1.4）と 道は あけておく。大きい 物だけ 当たり判定。
      function facade(kind, x, z, w, d, color) {
        const hx = w / 2;
        const front = z + d / 2;
        const fz = front + 1.1;          // 戸口の 両わきに 置く 物の 奥行き
        const L = x - hx + 1.1;          // 左の わき
        const R = x + hx - 1.1;          // 右の わき
        const roofY = 7.6;
        const solid = (px, pz, hw, hd) => obstacles.push({ x: px, z: pz, w: hw, d: hd });
        const awning = (c1, c2) => { for (let i = 0; i < Math.round(w); i += 1) D(x - hx + 0.5 + i, 3.7, front + 0.75, 1, 0.18, 1.3, i % 2 ? c1 : c2); };
        switch (kind) {
          case 'phones': {
            // 屋根に 大きな スマホ（光る 画面に アプリの 四角）と アンテナ。
            D(x, roofY + 1.6, front - 1.2, 2.4, 4.2, 0.4, 0x1d2233);
            D(x, roofY + 1.7, front - 0.98, 2.0, 3.4, 0.08, 0x5fb8ff, 1.2);
            for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) D(x - 0.6 + c * 0.6, roofY + 2.8 - r * 0.6, front - 0.92, 0.4, 0.4, 0.06, [0xff6b6b, 0xffd246, 0x6be3a0, 0xb48cff][(r * 3 + c) % 4], 0.9);
            D(x, roofY - 0.05, front - 0.95, 0.5, 0.12, 0.06, 0x8aa0c8, 0.8);
            D(x - hx * 0.55, roofY + 1.8, z - d * 0.2, 0.18, 4, 0.18, 0x9aa4b0);
            D(x - hx * 0.55, roofY + 3.9, z - d * 0.2, 0.36, 0.36, 0.36, 0xff3b3b, 2);
            // わき：けいたいの 見本の 台。
            for (const sx of [L, R]) { D(sx, 0.6, fz, 1.2, 1.2, 0.8, 0xe8edf5); D(sx, 1.55, fz - 0.15, 0.5, 0.8, 0.08, 0x1d2233); D(sx, 1.55, fz - 0.1, 0.4, 0.64, 0.04, 0x5fb8ff, 1); solid(sx, fz, 0.6, 0.4); }
            awning(0x5fb8ff, 0xf7fbff);
            break;
          }
          case 'electronics': {
            // 屋根に いなずまの 看板と パラボラ。
            D(x, roofY + 1.3, front - 1.2, w * 0.7, 2.6, 0.3, 0x1b2a4a);
            const bolt = [[0.5, 1.0], [0.2, 0.5], [-0.1, 0.5], [0.3, 0], [0, -0.5], [-0.3, -0.5], [-0.6, -1.0]];
            for (const [bx, by] of bolt) D(x + bx, roofY + 1.3 + by, front - 1.02, 0.55, 0.55, 0.1, 0xffd23a, 1.6);
            D(x + hx * 0.5, roofY + 0.7, z - d * 0.2, 0.2, 1.2, 0.2, 0xb0b8c4);
            D(x + hx * 0.5, roofY + 1.6, z - d * 0.2 + 0.2, 1.6, 1.6, 0.25, 0xe8edf5);
            D(x + hx * 0.5, roofY + 1.6, z - d * 0.2 + 0.45, 0.25, 0.25, 0.4, 0x9aa4b0);
            // わき：テレビの かべ（光る）と せんたくき・れいぞうこ。
            for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) {
              D(L - 0.45 + i * 0.95, 1.0 + j * 0.85, fz - 0.3, 0.85, 0.7, 0.16, 0x111418);
              D(L - 0.45 + i * 0.95, 1.0 + j * 0.85, fz - 0.2, 0.72, 0.56, 0.04, [0x4fc3ff, 0xff7ab8, 0x7cf08a, 0xffd246][i * 2 + j], 1.1);
            }
            D(L, 0.3, fz - 0.3, 2, 0.6, 0.6, 0x2a2f38); solid(L, fz - 0.3, 1, 0.35);
            D(R - 0.5, 0.75, fz, 0.9, 1.5, 0.9, 0xf3f5f8); D(R - 0.5, 0.85, fz + 0.46, 0.6, 0.6, 0.04, 0x8ab4d8, 0.6);
            D(R + 0.5, 1.05, fz, 0.8, 2.1, 0.8, 0xdfe6ee); D(R + 0.5, 1.4, fz + 0.41, 0.06, 0.6, 0.04, 0x9aa4b0);
            solid(R, fz, 1, 0.5);
            break;
          }
          case 'books': {
            // 屋根に 本の 山（いろいろな 色の 背表紙）と ひらいた 本。
            const spines = [0xd9483b, 0x2f6fbf, 0xf2b630, 0x2f9e5b, 0x8a5bc8];
            for (let i = 0; i < 4; i += 1) D(x - 0.2 + (i % 2) * 0.4, roofY + 0.3 + i * 0.55, front - 1.4, 3.4 - i * 0.3, 0.5, 2, spines[i]);
            D(x - 0.75, roofY + 2.9, front - 1.4, 1.4, 0.18, 1.8, 0xfffbf0); D(x + 0.75, roofY + 2.9, front - 1.4, 1.4, 0.18, 1.8, 0xfffbf0);
            D(x, roofY + 2.85, front - 1.4, 0.12, 0.24, 1.8, 0x8a5bc8);
            // わき：本だなの ワゴンと 「おすすめ」の 黒板。
            D(L, 0.55, fz, 1.6, 1.1, 0.8, 0x8a6a45);
            for (let i = 0; i < 6; i += 1) D(L - 0.62 + i * 0.25, 1.3, fz, 0.2, 0.5 + (i % 3) * 0.08, 0.6, spines[i % 5]);
            solid(L, fz, 0.8, 0.4);
            D(R, 1.0, fz, 1.1, 1.4, 0.12, 0x2b3a33); D(R, 1.0, fz + 0.07, 0.9, 1.2, 0.02, 0x3c5148);
            for (const sx of [-0.45, 0.45]) D(R + sx, 0.5, fz - 0.25, 0.08, 1, 0.08, 0x6f5b3e);
            break;
          }
          case 'pizza': {
            // 屋根に 大きな ピザ（まるく 見える 3 まいの 板）と レンガの かまどの えんとつ。
            const pz = front - 1.3;
            D(x, roofY + 1.6, pz, 3.2, 1.6, 0.3, 0xe8b35a); D(x, roofY + 1.6, pz, 1.6, 3.2, 0.3, 0xe8b35a); D(x, roofY + 1.6, pz, 2.6, 2.6, 0.3, 0xe8b35a);
            D(x, roofY + 1.6, pz + 0.12, 2.6, 1.2, 0.1, 0xd9483b); D(x, roofY + 1.6, pz + 0.12, 1.2, 2.6, 0.1, 0xd9483b); D(x, roofY + 1.6, pz + 0.12, 2.1, 2.1, 0.1, 0xd9483b);
            for (const [ox, oy] of [[-0.6, 0.5], [0.5, 0.6], [0.1, -0.2], [-0.5, -0.6], [0.7, -0.5]]) D(x + ox, roofY + 1.6 + oy, pz + 0.2, 0.36, 0.36, 0.08, 0xfff1c8);
            D(x - hx * 0.55, roofY + 0.4, z - d * 0.25, 1.4, 2.4, 1.4, 0xa0503a); D(x - hx * 0.55, roofY + 1.7, z - d * 0.25, 1.6, 0.3, 1.6, 0x7a3b2a);
            awning(0xd9483b, 0x2f9e5b);
            // わき：そとの テーブルと パラソル。
            for (const sx of [L, R]) {
              D(sx, 0.75, fz + 0.2, 1.2, 0.12, 1.2, 0xf7f1e1); D(sx, 0.4, fz + 0.2, 0.15, 0.7, 0.15, 0x6f5b3e);
              D(sx, 1.6, fz + 0.2, 0.1, 1.8, 0.1, 0xb0b0b0); D(sx, 2.5, fz + 0.2, 2, 0.16, 2, sx === L ? 0xd9483b : 0x2f9e5b);
              solid(sx, fz + 0.2, 0.6, 0.6);
            }
            break;
          }
          case 'burger': {
            // 屋根に 大きな ハンバーガー（パン・レタス・チーズ・にく・パン）。
            const by = roofY + 0.2;
            const bz = front - 1.4;
            D(x, by, bz, 2.8, 0.45, 2.4, 0xe0a050);
            D(x, by + 0.4, bz, 3.0, 0.25, 2.6, 0x6b3a22);
            D(x, by + 0.62, bz, 3.1, 0.12, 2.7, 0xffd23a);
            D(x, by + 0.78, bz, 3.2, 0.15, 2.8, 0x5fc04a);
            D(x, by + 1.2, bz, 2.9, 0.7, 2.5, 0xe8a856); D(x, by + 1.65, bz, 2.2, 0.3, 1.8, 0xe8a856);
            for (const [ox, oz] of [[-0.6, -0.3], [0.4, 0.2], [0, -0.6], [0.7, -0.4], [-0.3, 0.5]]) D(x + ox, by + 1.82, bz + oz, 0.14, 0.06, 0.24, 0xfff3d6);
            awning(0xffc531, 0xd9483b);
            // わき：ドライブスルーの 看板（光る）と 赤い いす。
            D(R, 1.6, fz, 0.18, 3.2, 0.18, 0x9aa4b0); D(R, 3.1, fz, 1.6, 1.0, 0.25, 0xd9483b); D(R, 3.1, fz + 0.14, 1.3, 0.7, 0.04, 0xffd23a, 1.2);
            for (const sx of [L - 0.45, L + 0.45]) { D(sx, 0.45, fz, 0.6, 0.12, 0.6, 0xd9483b); D(sx, 0.22, fz, 0.12, 0.45, 0.12, 0x9aa4b0); }
            break;
          }
          case 'wear_shop': {
            // 屋根に 大きな Tシャツ。わきに マネキン 2 体と ハンガーラック。
            const ty = roofY + 1.4;
            const tz = front - 1.3;
            D(x, ty, tz, 1.8, 2.2, 0.3, color); D(x - 1.25, ty + 0.65, tz, 0.9, 0.8, 0.3, color); D(x + 1.25, ty + 0.65, tz, 0.9, 0.8, 0.3, color);
            D(x, ty + 1.05, tz + 0.05, 0.6, 0.2, 0.3, 0xfff6f0);
            D(x, ty - 0.1, tz + 0.17, 0.6, 0.6, 0.04, 0xffffff, 0.6);
            for (const [sx, c] of [[L, 0xff7ab8], [L + 0.9, 0x5fb8ff]]) {
              D(sx, 0.3, fz, 0.5, 0.12, 0.5, 0x8a8a8a); D(sx, 0.75, fz, 0.1, 0.9, 0.1, 0x8a8a8a);
              D(sx, 1.45, fz, 0.6, 0.8, 0.36, c); D(sx, 2.0, fz, 0.32, 0.32, 0.32, 0xf3e6d8);
            }
            D(R, 1.9, fz, 1.8, 0.08, 0.08, 0x8a8a8a); for (const sx of [-0.85, 0.85]) D(R + sx, 1.0, fz, 0.08, 1.9, 0.08, 0x8a8a8a);
            for (let i = 0; i < 4; i += 1) D(R - 0.6 + i * 0.4, 1.4, fz, 0.32, 0.9, 0.5, [0xff7ab8, 0xffd246, 0x6be3a0, 0x8a5bc8][i]);
            solid(R, fz, 0.9, 0.3);
            awning(0xff9ac8, 0xfff6fa);
            break;
          }
          case 'block_shop': {
            // 屋根に 色の ブロックの 階段と つるはし。わきに ブロックの つみ木。
            const cols = [0xb5603a, 0x8a9a4a, 0x6fa8dc, 0xf3c33a, 0x9a9a96, 0x5fc04a];
            for (let i = 0; i < 4; i += 1) for (let j = 0; j <= i; j += 1) D(x - 1.5 + i * 1, roofY + 0.2 + j * 1, front - 1.3, 0.96, 0.96, 0.96, cols[(i + j) % cols.length]);
            D(x + 2.0, roofY + 2.4, front - 1.2, 0.2, 2.4, 0.2, 0x8a6a45); D(x + 2.0, roofY + 3.5, front - 1.2, 1.6, 0.3, 0.3, 0x9aa4b0);
            for (const sx of [L, R]) {
              for (let k = 0; k < 3; k += 1) D(sx + (k === 2 ? 0 : (k ? 0.5 : -0.5)), 0.5 + (k === 2 ? 1 : 0), fz, 0.95, 0.95, 0.95, cols[(k + (sx === L ? 0 : 3)) % cols.length]);
              solid(sx, fz, 1, 0.5);
            }
            break;
          }
          case 'land_shop': {
            // 屋根に 家の かたちの 看板。わきに 「うります」の 立てふだと ミニチュアの 家。
            D(x, roofY + 1.0, front - 1.3, 2.6, 1.8, 0.3, 0xfff6e8);
            for (let i = 0; i < 3; i += 1) D(x, roofY + 2.1 + i * 0.35, front - 1.3, 3.2 - i * 1.0, 0.35, 0.34, 0xd9483b);
            D(x, roofY + 0.7, front - 1.13, 0.7, 1.0, 0.08, 0x7a5a3a);
            D(x + 0.8, roofY + 1.25, front - 1.13, 0.5, 0.5, 0.06, 0xffe6ad, 1.1);
            D(L, 0.9, fz, 0.14, 1.8, 0.14, 0x6f5b3e); D(L, 1.7, fz + 0.08, 1.4, 0.9, 0.1, 0xffffff); D(L, 1.7, fz + 0.14, 1.2, 0.25, 0.04, 0xd9483b);
            D(R, 0.5, fz, 1.6, 1, 1.2, 0x8a6a45);
            for (const [ox, c] of [[-0.45, 0x6fa8dc], [0.45, 0xf3c33a]]) { D(R + ox, 1.25, fz, 0.6, 0.5, 0.6, 0xfffbf0); D(R + ox, 1.62, fz, 0.7, 0.25, 0.7, c); }
            solid(R, fz, 0.8, 0.6);
            break;
          }
          case 'word_house': {
            // 戸口の わきに A・B・C の つみ木（色の 立方体に 白い 文字の かわりの 印）と 旗。
            const abc = [0xd9483b, 0x2f6fbf, 0x2f9e5b];
            for (let i = 0; i < 3; i += 1) { D(L - 0.45 + i * 0.45 * (i === 2 ? 1 : 1), 0.4 + (i === 2 ? 0.8 : 0), fz + (i === 2 ? 0 : 0), 0.8, 0.8, 0.8, abc[i]); D(L - 0.45 + i * 0.45, 0.4 + (i === 2 ? 0.8 : 0), fz + 0.41, 0.4, 0.4, 0.02, 0xfffbf0); }
            solid(L, fz, 0.8, 0.45);
            D(R, 2, fz, 0.12, 4, 0.12, 0x9aa4b0); D(R + 0.6, 3.5, fz, 1.1, 0.8, 0.06, color);
            break;
          }
          case 'fish_buy': {
            // 屋根に 大きな さかな。わきに こおりの 箱と さかな。
            const fy = roofY + 1.1;
            const fzz = front - 1.3;
            D(x, fy, fzz, 3.2, 1.3, 0.4, 0x4f9fd0); D(x - 0.4, fy - 0.45, fzz + 0.02, 2.4, 0.4, 0.4, 0xdff2ff);
            D(x + 2.0, fy, fzz, 0.6, 1.8, 0.35, 0x2f78b0); D(x - 1.1, fy + 0.2, fzz + 0.22, 0.25, 0.25, 0.05, 0x111111);
            D(x + 0.2, fy + 0.8, fzz, 0.9, 0.4, 0.3, 0x2f78b0);
            for (const sx of [L, R]) {
              D(sx, 0.5, fz, 1.6, 1, 1, 0x3a7fa8); D(sx, 1.03, fz, 1.4, 0.08, 0.8, 0xe8f6ff);
              for (let i = 0; i < 3; i += 1) D(sx - 0.45 + i * 0.45, 1.12, fz, 0.35, 0.12, 0.7, [0xff9a6b, 0x9ac8e8, 0xf2c46b][i]);
              solid(sx, fz, 0.8, 0.5);
            }
            break;
          }
          default:
        }
      }

      // ゲート：光る わく。ゲートの列は 西むき（道から 西へ くぐる）、つり島のゲートは 南むき（入り江へ）。
      function gate(def, color) {
        const westward = def.path.x > def.x;
        const gx = westward ? def.x - 3.4 : def.x;
        const gz = westward ? def.z : def.z + 3;
        const along = (o, y, h, wid, glow = 0, col = color) => (westward
          ? D(gx, y, gz + o, 0.7, h, wid, col, glow)
          : D(gx + o, y, gz, wid, h, 0.7, col, glow));
        for (const o of [-2.3, 2.3]) along(o, 2.2, 4.4, 0.8, 0, 0xe8e2d0);
        along(0, 4.6, 0.7, 5.4, 0, 0xe8e2d0);
        along(0, 2.2, 3.6, 3.8, 0.9);
        for (const o of [-2.3, 2.3]) obstacles.push(westward ? { x: gx, z: gz + o, w: 0.45, d: 0.45 } : { x: gx + o, z: gz, w: 0.45, d: 0.45 });
        D(def.x, 0.18, def.z, 3.4, 0.12, 3.4, 0xe0d6bd, 0, true);
        sprite({ en: `🌀 ${def.character}`, ja: `🌀 ${def.ja.replace(/への ゲート$/, '')}` }, gx, 5.8, gz, { width: 6.5, size: 30 });
        keep(gx, gz, 3, 3);
        keep(def.x, def.z, 2.5, 2.5);
      }

      // P2 / P3：建っているだけ。札に 🔜（じゅんびちゅう）。
      for (const dec of data.deco || []) {
        const soon = dec.scenery ? '' : ' 🔜';
        const name = { en: `${dec.icon} ${dec.en}${soon}`, ja: `${dec.icon} ${dec.ja}${soon}` };
        const color = Number(dec.color);
        if (dec.type === 'house') {
          house(dec.x, dec.z, dec.w, dec.d, color, Number(dec.roof), name);
          keep(dec.x, dec.z, dec.w / 2 + 1.5, dec.d / 2 + 2.5);
        } else if (dec.type === 'arena') {
          // 石の円形とう技場（低い壁と旗）。
          D(dec.x, 1.2, dec.z, dec.w, 2.4, dec.d, 0xc9b9a0);
          D(dec.x, 2.5, dec.z, dec.w + 0.4, 0.3, dec.d + 0.4, 0xa89880);
          D(dec.x, 1.3, dec.z + dec.d / 2 + 0.02, 2.4, 2.6, 0.2, 0x50412f);
          for (const sx of [-1, 1]) {
            D(dec.x + sx * (dec.w / 2), 4, dec.z - dec.d / 2, 0.2, 3, 0.2, 0x6f5b3e);
            D(dec.x + sx * (dec.w / 2) + 0.7, 5, dec.z - dec.d / 2, 1.2, 0.8, 0.1, color);
          }
          obstacles.push({ x: dec.x, z: dec.z, w: dec.w / 2 + 0.2, d: dec.d / 2 + 0.2 });
          sprite(name, dec.x, 4.6, dec.z + dec.d / 2 + 0.6, { width: 7.5 });
          keep(dec.x, dec.z, dec.w / 2 + 2, dec.d / 2 + 2.5);
        } else if (dec.type === 'plot') {
          // たてる ばしょ：さくで かこった 土地と、つみかけの ブロック。
          D(dec.x, 0.17, dec.z, dec.w, 0.12, dec.d, color, 0, true);
          fence(dec.x - dec.w / 2, dec.z - dec.d / 2, Math.round(dec.w / 2), 'x');
          fence(dec.x - dec.w / 2, dec.z + dec.d / 2, Math.round(dec.w / 2), 'x');
          for (const [bx, bz, h] of [[-3, -2, 1], [-2, -2, 2], [2, 1, 1]]) D(dec.x + bx, 0.2 + h / 2, dec.z + bz, 1, h, 1, 0xb5603a);
          obstacles.push({ x: dec.x, z: dec.z, w: dec.w / 2, d: dec.d / 2 });
          sprite(name, dec.x, 3, dec.z, { width: 7 });
          keep(dec.x, dec.z, dec.w / 2 + 1, dec.d / 2 + 1);
        } else {
          // 屋台：しましまの屋根と カウンター。
          D(dec.x, 0.6, dec.z, 3, 1.0, 2, 0xa8835a);
          for (const sx of [-1.3, 1.3]) D(dec.x + sx, 1.6, dec.z - 0.8, 0.18, 2.2, 0.18, 0x6f5b3e);
          for (let i = 0; i < 4; i += 1) D(dec.x - 1.2 + i * 0.8, 2.75, dec.z, 0.8, 0.22, 2.4, i % 2 ? color : 0xf7f1e1);
          obstacles.push({ x: dec.x, z: dec.z, w: 1.6, d: 1.1 });
          sprite(name, dec.x, 3.8, dec.z, { width: 6 });
          keep(dec.x, dec.z, 2.5, 2);
        }
      }

      // 広場の小物：大通りの ベンチと 旗。
      bunting(-6, 13.2, 20, 13.2, 3.8);
      bench(26, 12.5, 0);
      bench(-20, 12.5, 0);

      // 木と花：建物・道・水と、入れる場所の近くには 置かない。
      const free = (x, z, pad = 1.2) => !boxes.some((b) => Math.abs(x - b.x) < b.w + pad && Math.abs(z - b.z) < b.d + pad)
        && !data.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < 6)
        && Math.hypot(x - st.x, z - st.z) > 6 && !(Math.abs(x - 31) < 5 && z > 30);
      const onLand = (x, z) => Math.abs(x / 52) ** 4 + Math.abs(z / 41) ** 4 < 0.9 && !inBay(x, z);
      for (let i = 0; i < 420; i += 1) {
        const x = (rand() - 0.5) * 104;
        const z = (rand() - 0.5) * 84;
        if (!onLand(x, z) || !free(x, z)) continue;
        const roll = rand();
        if (roll > 0.8) tree(x, z, 0.75 + rand() * 0.55);
        else if (roll > 0.62) bush(x, z, 0.7 + rand() * 0.6);
        else if (roll > 0.56) rock(x, z, 0.5 + rand() * 0.5);
        else flowers(x, z, [0xf0d98a, 0xe89bb0, 0xdfe4ef, 0xe7b06a][Math.floor(rand() * 4)]);
      }
    },
  });

  // 右上の ちいさな 地図：点ではなく 2D の 地図（main-island.js）と 同じ 見た目 ─ 草・入り江・灰色の 道・
  // 建物の タイル・場所ごとの 色の まるに 絵・オレンジの「きみ」。島の 外では ほかの 島と 同じく 描かない。
  const baseDraw = island.drawMap;
  function drawMap(ctx, player) {
    const d = island.data;
    if (!d || !island.visible) return baseDraw(ctx, player);
    const o = island.origin();
    const k = 1.5;
    const px = (x) => 90 + x * k;
    const py = (z) => 70 + z * k;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#6fb7c9'; ctx.fillRect(0, 0, 180, 140);
    // 陸（角の丸い四角）と すなはま。
    const land = (rx, rz, color) => {
      ctx.fillStyle = color; ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const c = Math.cos(a); const sn = Math.sin(a);
        const x = Math.sign(c) * Math.abs(c) ** 0.5 * rx; const z = Math.sign(sn) * Math.abs(sn) ** 0.5 * rz;
        if (a === 0) ctx.moveTo(px(x), py(z)); else ctx.lineTo(px(x), py(z));
      }
      ctx.fill();
    };
    land(56, 45, '#e8d6a8');
    land(54, 43, '#a9cf7c');
    const bay = d.bay || BAY;
    ctx.fillStyle = '#6fb7c9'; ctx.fillRect(px(bay.minX), py(bay.minZ), (bay.maxX - bay.minX) * k, 80);
    // 道。
    ctx.fillStyle = '#9a9a96';
    for (const r of d.roads || []) {
      if (r.x0 !== undefined) ctx.fillRect(px(r.x0), py(r.z - r.w / 2), (r.x1 - r.x0) * k, r.w * k);
      else ctx.fillRect(px(r.x - r.w / 2), py(r.z0), r.w * k, (r.z1 - r.z0) * k);
    }
    // さんばし と 船着き場。
    const pier = d.pier || PIER;
    ctx.fillStyle = '#b7905f';
    ctx.fillRect(px(pier.x - pier.w / 2), py(pier.minZ), pier.w * k, (pier.maxZ - pier.minZ) * k);
    ctx.fillRect(px(31 - 3.5), py(37), 7 * k, 7 * k);
    // 建物（飾り）の タイル。
    const tile = (x, z, w, dd, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(px(x - w / 2), py(z - dd / 2), w * k, dd * k, 2); ctx.fill(); };
    for (const dec of d.deco || []) {
      if (dec.type === 'plot') { ctx.fillStyle = '#c9e0a2'; ctx.fillRect(px(dec.x - dec.w / 2), py(dec.z - dec.d / 2), dec.w * k, dec.d * k); continue; }
      tile(dec.x, dec.z, dec.w || 3, dec.d || 2.4, '#e9dcc0');
    }
    // 入れる場所：建物の タイル ＋ 色の まるに 絵。
    const COLORS = { word_house: '#e27a2d', level_sign: '#1b3a2f', fish_buy: '#2f9e8f', fishing: '#1f8aa6', gate: '#7a5cc8', food_shop: '#e0a526', wear_shop: '#d9668d', block_shop: '#8a9a4a', land_shop: '#5a7fb0', talk_shop: '#4fae6b', blockwild: '#b5603a' };
    const GATE = { park: '🎡', ride: '🏁', town: '🧱', meadow: '🏰', fishworld: '🌊' };
    const ICON = { word_house: '📖', level_sign: '🔁', fish_buy: '🐟', fishing: '🎣' };
    for (const sp of d.spots) {
      if (sp.kind === 'word_house') tile(sp.x, sp.z - 4.6, 8.4, 6.4, '#f2b98a');
      else if (sp.w && sp.d) tile(sp.x, sp.z - 1.1 - sp.d / 2, sp.w, sp.d, '#efe2c6');
    }
    const target = island.target;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sp of d.spots) {
      const x = px(sp.x); const y = py(sp.z);
      const r = sp.id === target ? 6.5 : 5.2;
      ctx.fillStyle = sp.id === target ? '#ffd246' : '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r + 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS[sp.kind] || '#4fae6b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = '7px sans-serif';
      ctx.fillText(sp.kind === 'gate' ? (GATE[sp.to] || '🌀') : (ICON[sp.kind] || sp.icon || '•'), x, y + 0.5);
    }
    // スタートの ほし。
    const st = d.start || { x: 31, z: 30 };
    ctx.font = '8px sans-serif'; ctx.fillText('⭐', px(st.x), py(st.z));
    // きみ（オレンジ）。
    const me = { x: player.position.x - o.x, z: player.position.z - o.z };
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px(me.x), py(me.z), 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e27a2d'; ctx.beginPath(); ctx.arc(px(me.x), py(me.z), 3.2, 0, Math.PI * 2); ctx.fill();
    // 島の 名前。
    ctx.textAlign = 'left'; ctx.fillStyle = '#12333a'; ctx.font = 'bold 9px sans-serif';
    ctx.fillText(isJa() ? d.name : (d.en || d.name), 6, 8);
    return true;
  }

  return Object.assign(island, {
    drawMap,
    ready: loadMainWorld().then((d) => { island.receive(d.island); return d; }),
  });
}
