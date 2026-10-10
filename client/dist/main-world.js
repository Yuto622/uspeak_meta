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
          keep(def.x, def.z - 4.6, 5.5, 4.5);
        } else if (def.kind === 'fish_buy') {
          house(def.x, def.z - 4.6, 8, 6.4, 0x6fb8c8, 0x2f5f78, { en: '🐟 Fish Market', ja: '🐟 さかなの かいとりや' });
          for (let i = 0; i < 4; i += 1) D(def.x - 2.4 + i * 1.6, 3.15, def.z - 1.05, 1.6, 0.3, 0.9, i % 2 ? 0x2f9e8f : 0xf7f1e1);
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
