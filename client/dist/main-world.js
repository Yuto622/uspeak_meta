// メインの島（3D）— Roblox の メインワールドを、ほかの島と同じ 島の部品（island-kit）で建てたもの。
//
// 並びは main_island.json の `island`（Roblox の pois を Web の島の大きさに並べなおしたもの）。
// スタート（⭐・大通りの まんなか、さんばしの 入口の よこ）の まわりに よく つかう 場所を あつめて ある（2026-11）：大通りぞいに 屋台 3 つ、
// その 北に ふくや・ブロックや・いえの おみせ・さかなの かいとりや、奥に 英単語ハウス 3 軒と レベルの かんばん。
// 入り江の さんばしは スタートに 近い 東から 英検 5・4・3級。つりの ものは さんばしの 入口に 1 か所（すぐ 西に つり島への ゲート、真正面に かいとりや）。
// 西は ほかの ゲートの列と 英会話の お店（プレミアム）。
//
// 入れるのは P1 の 11 か所だけ（戸口を歩いて入る → net-client の setDoorHandler が main-island.js の walkIn() へ）。
// P2 / P3 の建物は 建っているだけで、札に 🔜 が付く（戸口は無い）。
// ふつうの島より大きいので、createIsland に size / power / land / dock を渡している。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';
import { createRealTrees } from './real-trees.js';
import { waterPatch } from './water-fx.js';
import { createMainSeasons, seasonNow } from './main-seasons.js';
import { isJa } from './i18n.js';
import { createCastFx } from './cast-fx.js';
import { roofSign, gateModel } from './roof-signs.js';
import { SHOP_KINDS, shopsOpen } from './shop-hours.js';
import { PLAZA, LIBRARY, buildPlaza, drawPlazaMap } from './main-plaza.js';
import { buildLibraryExterior } from './library-real.js';
import { buildPlanetariumExterior } from './planetarium-real.js';
import { createPlazaWalkers } from './plaza-walkers.js';
import { parkedBike } from './bike-models.js';

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
// スタート（⭐）＝ひこうき・🏠・はじめての 入室で あらわれる 場所。島の まんなか（さんばしの 入口の よこ・大通りの 南）。
// 橋が つくのは 船着き場（dock）の まま。main_island.json の `start` と 同じ 数字。
const START = { x: 10.5, z: 21 };
const inBay = (x, z) => x > BAY.minX && x < BAY.maxX && z > BAY.minZ;
// プラネタリウム（planetarium-real.js）の 建物の まんなか。北西（前は かざりの「バトルアリーナ 🔜」の 箱）。南むき。
// 玄関の 前の 戸口は main_island.json の spots の `planetarium`（-28, -24.6）。うごかす ときは 2 か所を いっしょに。
const PLANETARIUM_AT = { x: -28, z: -31.2 };

export function createMainWorld({ scene }) {
  let seasons = null, realTrees = null; // 季節の かざり（main-seasons.js）と リアルな 木（real-trees.js）。島が 建ったあと。
  let spinGates = null;
  let shopHouses = [];
  let shopsLit = null;
  let fx = null; // つりの 3D の 演出（cast-fx.js）。島が 建ったあと。
  let plaza = null, walkers = null; // 東の ひろば（main-plaza.js）と 歩く 人たち（plaza-walkers.js）。島が 建ったあと。
  let planetarium = null;           // 北西の プラネタリウム（planetarium-real.js の 外がわ）。中は planetarium.js（別の シーン）。
  let library = null;               // ひろばの 北の としょかん（library-real.js の 外がわ）。中は library.js（別の シーン）。
  const island = createIsland({
    scene,
    seed: 4242,
    size: { x: 54, z: 43 },
    power: 4,
    dock: { x: 31, z: 37 },
    hills: [{ x: -46, z: -32, r: 7 }],
    land: (x, z) => !inBay(x, z),
    annex: PLAZA.annex,   // 東の ひろば：島の 形の 外へ つき出す 土地（island-kit.js）
    build({ island: data, B, D, sprite, house, path, resident, door, tree, bush, flowers, rock, bench, lamp, fence, bunting, obstacles, rand, root }) {
      const boxD = D;
      const gates = [];
      spinGates = (t) => { for (const g of gates) g.userData.spin(t); };
      const boxes = [];          // 木や花を置かない場所（建物・道・水）
      const keep = (x, z, w, d) => boxes.push({ x, z, w, d });

      // 入り江：海の色の浅瀬と、さんばし。水の上は さんばしの板だけ歩ける。
      const bay = data.bay || BAY;
      const pier = data.pier || PIER;
      const bw = bay.maxX - bay.minX;
      // 入り江の 水：海と 同じ 水（water-fx.js）の 浅い 色。下に 砂の 底。
      D((bay.minX + bay.maxX) / 2, -1.2, bay.minZ + 10, bw, 0.2, 20, 0xd9c79a, 0, true);
      root.add(waterPatch((bay.minX + bay.maxX) / 2, -0.46, bay.minZ + 10, bw, 20));
      for (let i = 0; i <= Math.round((pier.maxZ - pier.minZ) / 1.1); i += 1) D(pier.x, 0.2, pier.minZ + i * 1.1, pier.w, 0.22, 0.95, i % 2 ? 0xc0a077 : 0xb79768);
      for (const side of [-1, 1]) for (let z = pier.minZ + 2; z <= pier.maxZ; z += 3) D(pier.x + side * (pier.w / 2 + 0.1), -0.4, z, 0.3, 1.6, 0.3, 0x8a7350);
      lamp(pier.x + pier.w / 2 + 0.4, pier.maxZ - 1);
      // 英検の つり場：さんばしの とちゅうから 東西に 板の 道、そこから 級ごとの さんばしを 平行に（main_island.json の eikenPiers）。
      const ep = data.eikenPiers;
      const fingers = ep ? data.spots.filter((sp) => sp.kind === 'eiken_pier') : [];
      if (ep) {
        for (let x = ep.x0; x <= ep.x1; x += 1.1) D(x, 0.2, ep.z, 1.05, 0.22, ep.w, (Math.round(x / 1.1) % 2) ? 0xc0a077 : 0xb79768);
        for (let x = ep.x0 + 1; x <= ep.x1; x += 3) for (const side of [-1, 1]) D(x, -0.4, ep.z + side * (ep.w / 2 + 0.1), 0.3, 1.6, 0.3, 0x8a7350);
        for (const sp of fingers) {
          for (let z = ep.z + ep.w / 2; z <= (sp.end ?? ep.end); z += 1.1) D(sp.x, 0.2, z, ep.fw, 0.22, 0.95, (Math.round(z / 1.1) % 2) ? 0xc0a077 : 0xb79768);
          for (const side of [-1, 1]) for (let z = ep.z + 2; z <= (sp.end ?? ep.end); z += 3) D(sp.x + side * (ep.fw / 2 + 0.1), -0.4, z, 0.3, 1.6, 0.3, 0x8a7350);
        }
      }
      // 水の 当たり判定：歩ける 板（さんばし・板の 道・英検の さんばし）を のぞいた 水を 箱で うめる。
      const margin = 0.35;
      const top = bay.minZ + margin;
      const bottom = bay.minZ + 24;
      const walk = [{ x0: pier.x - pier.w / 2 + 0.05 - margin, x1: pier.x + pier.w / 2 - 0.05 + margin, z0: top - 1, z1: pier.maxZ - margin }];
      if (ep) {
        walk.push({ x0: ep.x0 - 0.5 + margin, x1: ep.x1 + 0.5 - margin, z0: ep.z - ep.w / 2 + margin, z1: ep.z + ep.w / 2 - margin });
        for (const sp of fingers) walk.push({ x0: sp.x - ep.fw / 2 + margin, x1: sp.x + ep.fw / 2 - margin, z0: ep.z, z1: (sp.end ?? ep.end) - margin });
      }
      const xs = [...new Set([bay.minX, bay.maxX, ...walk.flatMap((w) => [w.x0, w.x1])])].filter((x) => x >= bay.minX && x <= bay.maxX).sort((a, b) => a - b);
      const zs = [...new Set([top, bottom, ...walk.flatMap((w) => [w.z0, w.z1])])].filter((z) => z >= top && z <= bottom).sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i += 1) {
        for (let j = 0; j < zs.length - 1; j += 1) {
          const cx = (xs[i] + xs[i + 1]) / 2; const cz = (zs[j] + zs[j + 1]) / 2;
          if (walk.some((w) => cx > w.x0 && cx < w.x1 && cz > w.z0 && cz < w.z1)) continue;
          obstacles.push({ x: cx, z: cz, w: (xs[i + 1] - xs[i]) / 2, d: (zs[j + 1] - zs[j]) / 2 });
        }
      }
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

      // スタートの ほし（Roblox のスポーン）。島の まんなか（2026-11：前は 南東の 船着き場の 上で、西の 場所が 遠かった）。
      const st = data.start || START;
      B(st.x, 0.2, st.z, 5, 0.2, 5, 0xf2d27a);
      D(st.x, 0.36, st.z, 3, 0.12, 3, 0xf2b630, 0.6);
      sprite({ en: '⭐ START', ja: '⭐ スタート' }, st.x, 2.6, st.z, { width: 5, size: 30 });
      keep(st.x, st.z, 3.5, 3.5);
      path(st.x, st.z, st.x, 16);

      // よるは しまる お店の 家（shop-hours.js）。しまって いる あいだ まどの 光を 消す。
      shopHouses = data.spots.filter((d) => SHOP_KINDS.has(d.kind) && d.kind !== 'food_shop').map((d) => (d.kind === 'fish_buy' ? [d.x, d.z - 4.6] : [d.x, d.z - 1.1 - d.d / 2]));
      // 入れる場所（P1）。
      for (const def of data.spots) {
        const color = Number(def.color);
        if (def.kind === 'library') {
          // としょかん：建物は 下の buildLibraryExterior。戸口は だんの 上（だんを 2 つ のぼると 入る）、あんないの 人は だんの 下の 右。
          door(def, 1.65, 0);
          resident({ ...def, x: def.x + 2.8, z: def.z + 3.3 });
          continue;
        }
        if (def.kind === 'planetarium') {
          // プラネタリウム：建物は 下の buildPlanetariumExterior。戸口は 玄関の 柱の 前、あんないの 人は その 右。
          door(def, 0.75, 0);
          keep((def.x + def.path.x) / 2, (def.z + def.path.z) / 2, Math.abs(def.x - def.path.x) / 2 + 1.5, 1.5);
          path(def.path.x, def.path.z, def.x, def.z);
          resident({ ...def, x: def.x + 2.7, z: def.z + 0.7 });
          continue;
        }
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
        } else if (def.kind === 'eiken_pier') {
          // 英検の つり場：さきに 級の 色の 旗と 看板、さおかけ。
          D(def.x - 1.1, 1.4, def.z + 0.6, 0.16, 2.8, 0.16, 0x6f5b3e);
          D(def.x - 0.55, 2.4, def.z + 0.6, 1.0, 0.7, 0.06, color, 0.25);
          D(def.x + 1.0, 0.8, def.z + 0.4, 0.2, 1.2, 0.2, 0x8a7350);
          D(def.x + 1.0, 1.5, def.z + 0.7, 0.08, 0.08, 2.2, 0x6d543a);
          // 札は 1 まいだけ（級を 級の 色で。住人の 名前は 近づくと 出る 一言に まかせる）。前は さんばしの 名前・入口の 札・住人の 名前が かさなって 読めなかった。
          // 幅は さんばしの 間（5）より せまく。入口は 文字の ない 級の 色の 柱 2 本（遠くから 色で どの さんばしか わかる）。
          const ez = (data.eikenPiers?.z || 28.5) + 1.4;
          for (const sx of [-1.25, 1.25]) { D(def.x + sx, 0.9, ez, 0.22, 1.4, 0.22, color, 0.2); D(def.x + sx, 1.7, ez, 0.36, 0.2, 0.36, 0xf7f1e1); }
        } else if (def.kind === 'wear_shop' || def.kind === 'block_shop' || def.kind === 'land_shop' || def.kind === 'weapon_shop' || def.kind === 'bike_shop' || def.kind === 'talk_shop' || def.kind === 'homework') {
          // 専用の島と 同じ お店（中に入ると その島の 3D の メニュー）。
          house(def.x, def.z - 1.1 - def.d / 2, def.w, def.d, color, Number(def.roof), { en: `${def.icon} ${def.en}`, ja: `${def.icon} ${def.ja}` });
          facade(def.decor || def.kind, def.x, def.z - 1.1 - def.d / 2, def.w, def.d, color);
          keep(def.x, def.z - 1.1 - def.d / 2, def.w / 2 + 1.5, def.d / 2 + 2);
        } else if (def.kind === 'my_home') {
          // じぶんの いえ：だれでも はじめから もっている。戸口に 入ると マイルーム（まちづくり島の door と 同じ へや）。
          const hz = def.z - 1.1 - def.d / 2;
          house(def.x, hz, def.w, def.d, color, Number(def.roof), { en: `${def.icon} ${def.en}`, ja: `${def.icon} ${def.ja}` });
          // 戸口の 左に 赤い ポスト、右に 花の はち（戸口の 前 x ±1.4 は あける）。
          D(def.x - 2.4, 0.6, def.z - 0.6, 0.16, 1.2, 0.16, 0x6f5b3e); D(def.x - 2.4, 1.35, def.z - 0.6, 0.6, 0.45, 0.4, 0xd9483b);
          D(def.x + 2.4, 0.3, def.z - 0.6, 0.7, 0.6, 0.7, 0xb5603a); D(def.x + 2.4, 0.75, def.z - 0.6, 0.55, 0.3, 0.55, 0xf08fb0);
          keep(def.x, hz, def.w / 2 + 1.5, def.d / 2 + 2);
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
        if (def.kind !== 'fishing' && def.kind !== 'gate' && def.kind !== 'eiken_pier') path(def.path.x, def.path.z, def.x, def.z);
        else if (def.kind === 'gate' && def.path.x !== def.x) path(def.path.x, def.path.z, def.x, def.z);
        if (def.kind === 'eiken_pier') {
          const g = def.ja.replace('の つり場', ''); const ge = def.en.replace(' Pier', '').replace('Grade ', '');
          resident({ ...def, label: { en: `🎣 ${ge}`, ja: `🎣 ${g}` }, labelWidth: 4.8, labelSize: 60, labelAlways: true, labelBg: `#${color.toString(16).padStart(6, '0')}` });
        } else if (def.kind === 'my_home') resident({ ...def, label: { en: 'Welcome home!', ja: 'おかえり！' } });   // るすばんの 人が むかえる
        else resident(def);
      }
      fx = createCastFx({ root, B });

      // お店の 外がわ（2026-10）。どの家も 同じ 形（island-kit の house）なので、屋根の 上の 大きな しるしと
      // 戸口の 両わきの 小物で「なんの お店か」を 遠くから 分かるように する。D（まとめて 描く 箱）だけで 作る＝重くならない。
      // 戸口の 前（x が ±1.4）と 道は あけておく。大きい 物だけ 当たり判定。
      function facade(kind, x, z, w, d, color) {
        // 屋根の かんばんは なめらかな 形（roof-signs.js）。あれば 屋根の 上の 箱（y が 7 より 上）は 置かない。わきの 小物は そのまま。
        const sign = roofSign(kind, color);
        if (sign) { sign.position.set(x, 4.4 + Math.min(2.7, Math.max(1.5, d * 0.36)) + 0.2, z); sign.scale.multiplyScalar(1.2); root.add(sign); }
        const D = (...a) => (sign && a[1] > 7 ? null : boxD(...a));
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
          case 'homework': {
            // 屋根に 大きな えんぴつと ノート。わきに 黒板と ランドセル（宿題の いえ と 分かる）。
            D(x, roofY + 0.25, front - 1.4, 3.0, 0.3, 2.2, 0xfffbf0); D(x, roofY + 0.42, front - 1.4, 0.12, 0.05, 2.2, 0xd9483b);
            for (let i = 0; i < 4; i += 1) D(x - 1.1 + i * 0.7, roofY + 0.42, front - 1.4, 0.5, 0.04, 1.8, 0x9fc3e6);
            D(x + 0.9, roofY + 1.6, front - 1.4, 0.45, 2.4, 0.45, 0xf0c84a); D(x + 0.9, roofY + 3.0, front - 1.4, 0.45, 0.45, 0.45, 0xe9b48a);
            D(x + 0.9, roofY + 3.3, front - 1.4, 0.18, 0.2, 0.18, 0x333333); D(x + 0.9, roofY + 0.32, front - 1.4, 0.48, 0.25, 0.48, 0xe58fa0);
            D(L, 1.1, fz, 1.4, 1.2, 0.12, 0x2f5d48); D(L, 1.1, fz + 0.07, 1.2, 1.0, 0.02, 0x3c6b55);
            for (const sx of [-0.55, 0.55]) D(L + sx, 0.5, fz - 0.25, 0.08, 1, 0.08, 0x6f5b3e);
            D(R, 0.55, fz, 0.9, 1.0, 0.6, 0xc8423a); D(R, 1.0, fz + 0.32, 0.9, 0.3, 0.06, 0x8f2a24);
            solid(L, fz, 0.8, 0.4); solid(R, fz, 0.6, 0.4);
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
            // わき：そとの テーブルと パラソル。道（spot.path）は 東から 来るので、2 つとも 西がわに 置く（東に 置くと 道を ふさぐ）。
            for (const sx of [L, L - 1.5]) {
              const tz = fz + 0.2;
              D(sx, 0.75, tz, 1.2, 0.12, 1.2, 0xf7f1e1); D(sx, 0.4, tz, 0.15, 0.7, 0.15, 0x6f5b3e);
              D(sx, 1.6, tz, 0.1, 1.8, 0.1, 0xb0b0b0); D(sx, 2.5, tz, 2, 0.16, 2, sx === L ? 0xd9483b : 0x2f9e5b);
              solid(sx, tz, 0.6, 0.6);
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
          case 'bike_shop': {
            // じてんしゃや（西の はま）：屋根に 大きな じてんしゃ（roof-signs.js）。戸口の 両わきに とめて ある じてんしゃ（本物の 形＝bike-models.js）と
            // 木の スタンド、東の 台の 上に 金の じてんしゃ。戸口の 前（x ±1.4）は あける。
            awning(0xe27a2d, 0xfff4d6);
            const park = (id, px, pz, yaw, k = 1.15) => { const b = parkedBike(id, px, pz, yaw); if (b) { b.scale.setScalar(k); root.add(b); } };
            for (const [sx, ids] of [[L, ['bike-kids', 'bike-city']], [R, ['bike-bmx', 'bike-mountain']]]) {
              D(sx, 0.5, fz - 0.75, 1.9, 0.1, 0.12, 0x8a6a45); for (const dx of [-0.9, 0.9]) D(sx + dx, 0.35, fz - 0.75, 0.12, 0.4, 0.12, 0x6f5b3e);
              ids.forEach((id, i) => park(id, sx - 0.5 + i * 1.0, fz, 0.12 - i * 0.24));
              solid(sx, fz, 1.1, 0.75);
            }
            const gx = x + hx + 2.4, gz = front - 1.2;
            D(gx, 0.42, gz, 2.6, 0.45, 1.5, 0x1b3a2f); D(gx, 0.67, gz, 2.3, 0.08, 1.2, 0xffb066, 0.25);
            park('bike-gold', gx, gz, Math.PI / 2 - 0.25, 1.2); root.children[root.children.length - 1].position.y = 0.71;
            park('bike-road', x - hx - 1.6, front - 1.4, -0.5);
            solid(gx, gz, 1.3, 0.75); solid(x - hx - 1.6, front - 1.4, 0.5, 0.9);
            // タイヤの 山と くうきいれ。
            for (let k = 0; k < 3; k += 1) D(x - hx - 1.5, 0.32 + k * 0.22, front + 0.6, 0.9, 0.2, 0.9, 0x23262b);
            D(x + hx + 0.9, 0.55, front + 0.7, 0.16, 0.7, 0.16, 0xd9483b); D(x + hx + 0.9, 0.95, front + 0.7, 0.4, 0.08, 0.1, 0x2a2a2a);
            break;
          }
          case 'weapon_shop': {
            // 屋根に 大きな けんが 2 本 ×に。戸口の わきに たてと やりの たな。
            for (const sgn of [-1, 1]) {
              const ty = roofY + 2.0; const tz = front - 1.3;
              for (let k = 0; k < 6; k += 1) D(x + sgn * (k * 0.32 - 0.8), ty + k * 0.32 - 0.8, tz, 0.3, 0.3, 0.2, 0xd8e4ea, 0.15);
              D(x - sgn * 1.0, ty - 1.0, tz, 0.7, 0.18, 0.24, 0xf1ce76); D(x - sgn * 1.25, ty - 1.25, tz, 0.2, 0.4, 0.2, 0x756043);
            }
            D(L, 1.0, fz, 1.1, 1.3, 0.16, 0x9b6a3c); D(L, 1.0, fz + 0.1, 0.8, 1.0, 0.06, 0xf1ce76); D(L, 1.0, fz + 0.14, 0.26, 0.26, 0.04, 0x9b6a3c);
            for (const sx of [R - 0.4, R + 0.4]) { D(sx, 1.2, fz, 0.1, 2.4, 0.1, 0x8a6a45); D(sx, 2.5, fz, 0.18, 0.36, 0.18, 0xbacfd8, 0.2); }
            D(R, 0.3, fz, 1.3, 0.2, 0.5, 0x6f5b3e);
            solid(L, fz, 0.6, 0.3); solid(R, fz, 0.7, 0.3);
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
        const gm = gateModel(color); gm.position.set(gx, 0.1, gz); if (westward) gm.rotation.y = Math.PI / 2; root.add(gm); gates.push(gm);
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

      // プラネタリウム（北西）＝グリフィス天文台の 形。外がわは 材質ごとに 1 メッシュ（4 回の 描画）。夜は まど・玄関が 灯り、白い かべが うっすら 光る（下の setNight）。
      // 木を まく 前に 建てる（keep で 建物と 前の しばふから 木と 草花を よける）。
      try {
        const P = PLANETARIUM_AT;
        const ext = buildPlanetariumExterior();
        ext.group.position.set(P.x, 0.2, P.z);            // 島の 地面は y 0.2
        root.add(ext.group);
        for (const o of ext.obstacles) obstacles.push({ x: P.x + o.x, z: P.z + o.z, w: o.w, d: o.d });
        for (const [lx, lz] of ext.lamps) lamp(P.x + lx, P.z + lz);
        // 建物と しばふの 道の 下に 見えない 箱（地面より 下）：草むら（plantTufts）が 床や 道から 生えない ように マスを ふさぐ。
        D(P.x, 0.1, P.z - 1.6, 21.6, 0.1, 13, 0x8a8478, 0, 'cobble');
        D(P.x, 0.1, P.z + 10.4, 2.6, 0.1, 10.4, 0x8a8478, 0, 'cobble');
        D(P.x, 0.1, P.z + 6.7, 19.4, 0.1, 2.2, 0x8a8478, 0, 'cobble');
        D(P.x, 0.1, P.z + 15.2, 16.6, 0.1, 1.7, 0x8a8478, 0, 'cobble');
        D(P.x + ext.obelisk.x, 0.1, P.z + ext.obelisk.z, 4.8, 0.1, 4.8, 0x8a8478, 0, 'cobble');
        keep(P.x, P.z + (ext.lawn.z0 + ext.lawn.z1) / 2, ext.lawn.w / 2, (ext.lawn.z1 - ext.lawn.z0) / 2);
        sprite({ en: '🔭 Planetarium', ja: '🔭 プラネタリウム' }, P.x, 5.9, P.z + 4.7, { width: 6.6, size: 40 });
        planetarium = { ...ext, x: P.x, z: P.z };
      } catch (err) { console.warn('[main] プラネタリウムが 建てられない', err); planetarium = null; }

      // 広場の小物：大通りの ベンチと 旗。
      // 大通りの 旗と、ひろばの 見せ場（やぐら・クリスマスツリー…）は 季節ごと（main-seasons.js）。場所は 屋台の 南の しばふ。
      const FEST = { x: -23, z: 23.5 };
      keep(FEST.x, FEST.z, 4.5, 4.5);
      bench(26, 12.5, 0);
      bench(-20, 12.5, 0);

      // 木と花：建物・道・水と、入れる場所の近くには 置かない。
      const free = (x, z, pad = 1.2) => !boxes.some((b) => Math.abs(x - b.x) < b.w + pad && Math.abs(z - b.z) < b.d + pad)
        && !data.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < 6)
        && Math.hypot(x - st.x, z - st.z) > 6 && !(Math.abs(x - 31) < 5 && z > 30);
      const onLand = (x, z) => Math.abs(x / 52) ** 4 + Math.abs(z / 41) ** 4 < 0.9 && !inBay(x, z);
      const woods = [];
      for (let i = 0; i < 420; i += 1) {
        const x = (rand() - 0.5) * 104;
        const z = (rand() - 0.5) * 84;
        if (!onLand(x, z) || !free(x, z)) continue;
        const roll = rand();
        // スタートと 屋台の 南（カメラの 手前）には 木を 立てない：葉が 画面を かくす。
        if (roll > 0.8) { const kind = Math.floor(rand() * 3), scale = 0.62 + rand() * 0.4; if (!(z > 17 && z < 32 && x > -12 && x < 48)) woods.push({ x, z, scale, kind }); }
        else if (roll > 0.62) bush(x, z, 0.7 + rand() * 0.6);
        else if (roll > 0.56) rock(x, z, 0.5 + rand() * 0.5);
        else flowers(x, z, [0xf0d98a, 0xe89bb0, 0xdfe4ef, 0xe7b06a][Math.floor(rand() * 4)]);
      }
      // 東の ひろば（時計台・ふんすい・ぶたい・フリーマーケット）と、そこを 歩く 人たち。木は 下の リアルな 木に まぜる。
      try {
        plaza = buildPlaza({ root, D, lamp, bench, sprite, obstacles, woods, keep });
        walkers = createPlazaWalkers({ root, sprite, plaza });
      } catch (err) { console.warn('[main] ひろばが 建てられない', err); }
      // としょかん（ひろばの 北）。外がわは 材質ごとに 1 メッシュ（7 回の 描画）。まどは 夜に 灯る（下の setNight）。
      try {
        const L = LIBRARY;
        const lib = buildLibraryExterior({ w: L.w, d: L.d, forecourt: L.forecourt });
        lib.group.position.set(L.x, 0.22, L.z);          // 島の 地面は y 0.2。しき石の 上の 面が 0.23（ひろばの 石だたみは 0.24）
        root.add(lib.group);
        for (const o of lib.obstacles) obstacles.push({ x: L.x + o.x, z: L.z + o.z, w: o.w, d: o.d });
        // しき石と だんの 下に 見えない 箱（地面より 下）：草むら（plantTufts）が しき石から 生えない ように マスを ふさぐ。
        D(L.x, 0.1, L.z + (lib.steps.z0 + L.d / 2 + L.forecourt) / 2, L.w, 0.1, L.d / 2 + L.forecourt - lib.steps.z0, 0x8a6f5a, 0, 'cobble');
        keep(L.x, L.z + L.forecourt / 2, L.w / 2 + 2, L.d / 2 + L.forecourt / 2 + 2);
        sprite({ en: '📚 Library', ja: '📚 としょかん' }, L.x, 4.9, L.z + lib.steps.z1 + 0.4, { width: 6.2, size: 40 });
        library = { ...lib, x: L.x, z: L.z };
      } catch (err) { console.warn('[main] としょかんが 建てられない', err); library = null; }
      // 木は リアルな 木（えだわかれの 幹＋葉の 板）。葉の 色は 季節で かわる。
      const now = seasonNow();
      realTrees = createRealTrees({ root, trees: woods, seed: 4242 });
      realTrees.setSeason(now.season);
      seasons = createMainSeasons({ root, spot: FEST, street: { ax: -6, az: 13.2, bx: 20, bz: 13.2, h: 3.8 },
        onObstacle: (o) => obstacles.push(o), clear: (x, z) => onLand(x, z) && !boxes.some((b) => b.x !== FEST.x && Math.abs(x - b.x) < b.w + 0.3 && Math.abs(z - b.z) < b.d + 0.3) });
      seasons.setSeason(now);
    },
  });

  // 右上の ちいさな 地図：点ではなく 2D の 地図（main-island.js）と 同じ 見た目 ─ 草・入り江・灰色の 道・
  // 建物の タイル・場所ごとの 色の まるに 絵・オレンジの「きみ」。島の 外では ほかの 島と 同じく 描かない。
  const baseDraw = island.drawMap;
  function drawMap(ctx, player) {
    const d = island.data;
    if (!d || !island.visible) return baseDraw(ctx, player);
    const o = island.origin();
    // 2026-11：東に ひろばが ついたので、島ぜんたい（x -56〜88）が 入るように 1.5 倍 → 1.2 倍、まんなかを x 16 に（前は `90 + x*1.5`）。
    // 2026-11 その 2：西に じてんしゃやの 土地（x -70 まで）が ついたので 1.2 倍 → 1.1 倍、まんなかを x 9 に（x -72〜90 が 入る）。
    const k = 1.1;
    const px = (x) => 90 + (x - 9) * k;
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
    {
      // 東の ひろば：すなはまの ふち → 草 → 石だたみ（main-plaza.js）。
      const a = PLAZA.annex;
      ctx.fillStyle = '#e8d6a8'; ctx.beginPath(); ctx.roundRect(px(a.x0), py(a.z0), (a.x1 - a.x0) * k, (a.z1 - a.z0) * k, a.r * k); ctx.fill();
      for (const b of a.also || []) { ctx.beginPath(); ctx.roundRect(px(b.x0), py(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k, b.r * k); ctx.fill(); }
      land(54, 43, '#a9cf7c');
      ctx.fillStyle = '#a9cf7c'; ctx.beginPath(); ctx.roundRect(px(a.x0), py(a.z0 + 2), (a.x1 - a.x0 - 2) * k, (a.z1 - a.z0 - 4) * k, (a.r - 2) * k); ctx.fill();
      for (const b of a.also || []) { ctx.beginPath(); ctx.roundRect(px(b.x0 + 2), py(b.z0 + 2), (b.x1 - b.x0 - 4) * k, (b.z1 - b.z0 - 2) * k, (b.r - 2) * k); ctx.fill(); }
    }
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
    const ep = d.eikenPiers;
    if (ep) {
      ctx.fillRect(px(ep.x0), py(ep.z - ep.w / 2), (ep.x1 - ep.x0) * k, ep.w * k);
      for (const sp of d.spots) if (sp.kind === 'eiken_pier') ctx.fillRect(px(sp.x - ep.fw / 2), py(ep.z), ep.fw * k, ((sp.end ?? ep.end) - ep.z) * k);
    }
    ctx.fillRect(px(31 - 3.5), py(37), 7 * k, 7 * k);
    // 建物（飾り）の タイル。
    const tile = (x, z, w, dd, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(px(x - w / 2), py(z - dd / 2), w * k, dd * k, 2); ctx.fill(); };
    for (const dec of d.deco || []) {
      if (dec.type === 'plot') { ctx.fillStyle = '#c9e0a2'; ctx.fillRect(px(dec.x - dec.w / 2), py(dec.z - dec.d / 2), dec.w * k, dec.d * k); continue; }
      tile(dec.x, dec.z, dec.w || 3, dec.d || 2.4, '#e9dcc0');
    }
    // 入れる場所：建物の タイル ＋ 色の まるに 絵。
    const COLORS = { word_house: '#e27a2d', level_sign: '#1b3a2f', fish_buy: '#2f9e8f', fishing: '#1f8aa6', gate: '#7a5cc8', food_shop: '#e0a526', wear_shop: '#d9668d', block_shop: '#8a9a4a', land_shop: '#5a7fb0', weapon_shop: '#6b4c9c', bike_shop: '#e27a2d', talk_shop: '#4fae6b', blockwild: '#b5603a', homework: '#d9763a', my_home: '#d9483b', library: '#a9532c', planetarium: '#2f6f8f' };
    const GATE = { park: '🎡', ride: '🏁', town: '🧱', meadow: '🏰', fishworld: '🌊' };
    const ICON = { bike_shop: '🚲', word_house: '📖', level_sign: '🔁', fish_buy: '🐟', fishing: '🎣', eiken_pier: '🎣', homework: '📚', library: '🏛', planetarium: '🔭' };
    for (const sp of d.spots) {
      if (sp.kind === 'word_house') tile(sp.x, sp.z - 4.6, 8.4, 6.4, '#f2b98a');
      else if (sp.w && sp.d) tile(sp.x, sp.z - 1.1 - sp.d / 2, sp.w, sp.d, '#efe2c6');
    }
    {
      // としょかん：しき石（うすい れんが色）と 建物（れんが色）。
      const L = LIBRARY;
      tile(L.x, L.z + L.d / 2 + L.forecourt / 2, L.w, L.forecourt, '#dcc3a4');
      tile(L.x, L.z - 2.2, L.w, 11.6, '#c9744a');
      tile(L.x, L.z + 4.6, 9, 2.2, '#c9744a');
    }
    {
      // プラネタリウム：よこに 長い 白い 建物と、黒い ドーム 3 つ。
      const P = PLANETARIUM_AT;
      tile(P.x, P.z + 0.25, 16.8, 5, '#f1ece0'); tile(P.x, P.z + 3.4, 4.4, 2.2, '#f1ece0');
      for (const [dx, dz, r] of [[0, -3.9, 3.4], [-8.4, 1, 1.9], [8.4, 1, 1.9]]) { ctx.fillStyle = '#3a3d38'; ctx.beginPath(); ctx.arc(px(P.x + dx), py(P.z + dz), r * k, 0, Math.PI * 2); ctx.fill(); }
    }
    const target = island.target;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sp of d.spots) {
      const x = px(sp.x); const y = py(sp.z);
      const r = sp.id === target ? 5.8 : 4.4;
      ctx.fillStyle = sp.id === target ? '#ffd246' : '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sp.kind === 'eiken_pier' ? `#${Number(sp.color).toString(16).padStart(6, '0')}` : COLORS[sp.kind] || '#4fae6b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = '7px sans-serif';
      ctx.fillText(sp.kind === 'gate' ? (GATE[sp.to] || '🌀') : (ICON[sp.kind] || sp.icon || '•'), x, y + 0.5);
    }
    drawPlazaMap(ctx, px, py, k);
    // スタートの ほし。
    const st = d.start || START;
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

  // ---- つりの 3D の 演出（つり島と 同じ：さお・うき・「！」・魚が はねる）----
  // spotId は つり場の id（`main` ＝ まんなかの さんばし、`pier_g5` などの 英検の つり場）。
  function castPoint(spotId) {
    const d = island.data; if (!d) return null;
    if (spotId === 'main' || spotId === 'fishing_pier') { const p = d.pier || PIER; return { x: p.x, z: p.maxZ + 2.6 }; }
    const sp = d.spots.find((s) => s.id === spotId);
    return sp ? { x: sp.x, z: (sp.end ?? d.eikenPiers?.end ?? sp.z + 1) + 2.4 } : null;
  }
  function startCast(spotId) {
    const at = castPoint(spotId);
    if (!fx || !at) return false;
    return fx.start({ cast: at, waterY: -0.42 });
  }
  const baseUpdate = island.update;
  function update(t, player) {
    baseUpdate(t, player);
    if (fx && island.visible) fx.update(t, player);
    if (island.visible) { realTrees?.update(t); seasons?.update(t, player); spinGates?.(t); plaza?.update(t); walkers?.update(t, player); }
    const open = shopsOpen(); if (open !== shopsLit && shopHouses.length) { shopsLit = open; for (const [hx, hz] of shopHouses) island.setHouseLit?.(hx, hz, open); }
  }
  const baseNight = island.setNight;
  function setNight(n) {
    baseNight(n); seasons?.setNight(n); plaza?.setNight(n);
    // としょかんの まど（お店では ない＝よるも あいて いるので、夜は いつも 灯る）。
    if (library) { const k = Math.max(0, Math.min(1, n || 0)); for (const { material, glow } of library.lit) material.emissiveIntensity = glow * k; }
    planetarium?.setNight(n);   // プラネタリウムも お店では ない＝夜は いつも 灯る
  }
  // としょかんの だん（4 だん・高さ 0.8）と げんかんの 上の ゆかの 高さ。世界の 座標。ほかは 0。
  function floorY(x, z) {
    if (!library || !island.visible) return 0;
    const o = island.origin(), s = library.steps;
    const lx = x - o.x - library.x - s.x, lz = z - o.z - library.z;
    if (Math.abs(lx) > s.w / 2 + 0.3 || lz >= s.z1 || lz < s.z0 - 2.6) return 0;
    if (lz <= s.z0) return s.h;
    return Math.min(s.count, Math.ceil(((s.z1 - lz) / (s.z1 - s.z0)) * s.count)) * (s.h / s.count);
  }
  // 検査・写真用：季節を その場で かえる（'spring' | 'summer' | 'autumn' | 'winter' | 'xmas'）。当たり判定は 入りなおすまで 前の まま。
  function setSeason(id) { const s = id === 'xmas' ? { season: 'winter', xmas: true } : { season: id, xmas: false }; realTrees?.setSeason(s.season); seasons?.setSeason(s); }

  // あらわれる 場所は スタートの ほし（island-kit の 既定は 船着き場）。
  island.arrival = { x: START.x, z: START.z };
  const out = Object.assign(island, {
    drawMap, update, setNight, setSeason, floorY,
    ready: loadMainWorld().then((d) => { island.receive(d.island); return d; }),
    startCast,
    bite: () => fx?.bite(),
    endCast: () => fx?.end(),
    splash: (fish) => fx?.splash(fish),
    chase: (camera, player, dt) => (fx && island.visible ? fx.chase(camera, player, dt) : false),
    // ひろばの 人に 話しかける つなぎ口（plaza-walkers.js）。nearestNpc → { id, name, personality, lines, object3D, distance, role } か null。
    nearestNpc: (player) => walkers?.nearest(player) || null,
    talkNpc: (id) => walkers?.talk(id) ?? false,
    sayNpc: (id, text, seconds) => walkers?.say(id, text, seconds) ?? false,
  });
  Object.defineProperty(out, 'npcs', { get: () => walkers?.npcs || [], enumerable: true });
  Object.defineProperty(out, 'plaza', { get: () => plaza, enumerable: true });
  // としょかん（外がわ）：{ x, z, door, steps, obstacles, lit … }。出た ときに 立つ 場所は library.js が ここから 決める。
  Object.defineProperty(out, 'library', { get: () => library, enumerable: true });
  // プラネタリウム（外がわ）：{ x, z, door, obstacles, setNight … }。出た ときに 立つ 場所は planetarium.js が ここから 決める。
  Object.defineProperty(out, 'planetarium', { get: () => planetarium, enumerable: true });
  // Object.assign は getter を 値に して しまうので defineProperty で。
  Object.defineProperty(out, 'casting', { get: () => !!fx?.casting, enumerable: true });
  return out;
}
