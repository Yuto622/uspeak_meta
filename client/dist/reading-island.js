// よみもの島 — 大きな「えほんの としょかん」が 1 つ。歩いて 入ると じぶんの 本だなが ひらく。
//
// 本（本文・絵の 場面・ことば・クイズの 正解）は この 島にも client/dist にも 無い（サーバーの reading-bank）。
// 地形・さんばし・当たり判定・看板・ミニマップ・光の 柱は ほかの 島と 同じ island-kit。ここは 建物と 目じるしだけ。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadReadingData() {
  if (!promise) {
    promise = fetch('reading.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`reading.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[reading] reading.json failed to load', err); return { island: null }; });
  }
  return promise;
}

const SPINES = [0xd65a4a, 0x4a7fd6, 0xf0c84a, 0x5ab86f, 0xb06fc4, 0xe27a2d, 0x3baacb, 0xe0668e];

export function createReadingIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 27182,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles }) {
      const yard = data.courtyard;
      // ひろば：クリーム色の 石だたみと、本の ページの ような 白い 道
      B(yard.x, 0.12, yard.z, 20, 0.15, 13, 0xe9dfc6);
      B(yard.x, 0.2, yard.z, 15, 0.14, 9, 0xf6efdc);
      bunting(yard.x - 9, yard.z + 6, yard.x + 9, yard.z + 6, 3.8);
      sprite({ en: data.en, ja: data.name }, yard.x, 5.2, yard.z + 2, { width: 11, size: 30 });

      // 目じるし 1：ひらいた 大きな 本（左）。海から 見て「本の 島」と 分かる。
      const ox = yard.x - 10.5; const oz = yard.z + 0.5;
      D(ox, 0.5, oz, 5.4, 0.5, 3.6, 0x7a4a2c);
      for (const side of [-1, 1]) {
        D(ox + side * 1.35, 0.95, oz, 2.5, 0.4, 3.2, 0xfffaf0);
        for (let i = 0; i < 4; i += 1) D(ox + side * 1.35, 1.17, oz - 1.0 + i * 0.6, 1.9, 0.04, 0.12, 0x9aa7b0);
      }
      D(ox, 1.0, oz, 0.2, 0.55, 3.3, 0xc98a3a);
      D(ox + 1.1, 1.6, oz - 1.2, 0.5, 0.9, 0.12, 0xd65a4a);
      obstacles.push({ x: ox, z: oz, w: 3.0, d: 2.0 });

      // 目じるし 2：本の 塔（右）。1 さつずつ 色が ちがう。
      const tx = yard.x + 10.5; const tz = yard.z + 0.5;
      SPINES.forEach((c, i) => D(tx + ((i % 3) - 1) * 0.22, 0.45 + i * 0.72, tz + ((i % 2) - 0.5) * 0.2, 2.9 - (i % 3) * 0.3, 0.7, 2.0, c));
      SPINES.forEach((c, i) => D(tx + ((i % 3) - 1) * 0.22, 0.45 + i * 0.72, tz + 1.02 + ((i % 2) - 0.5) * 0.2, 2.2 - (i % 3) * 0.3, 0.5, 0.06, 0xfffaf0));
      D(tx, 0.45 + SPINES.length * 0.72 + 0.3, tz, 0.9, 0.9, 0.9, 0xffd766, 0.6);
      obstacles.push({ x: tx, z: tz, w: 2.0, d: 1.6 });

      bench(yard.x - 5.5, yard.z + 4, 0);
      bench(yard.x + 5.5, yard.z + 4, 0);
      flowers(yard.x - 9, yard.z + 12, 0xf2c36b);
      flowers(yard.x + 9, yard.z + 12, 0xd9a7ef);

      for (const def of data.spots) {
        // としょかん：ひろい 家・はしら・本の まど・時計の かわりに 大きな 星。
        house(def.x, def.z - 5.2, 15, 8.4, Number(def.color), 0x4a2f6e, { en: `${def.tone} ${def.en}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 7, 0.16, 6, 0xf6efdc);
        // 正面の かべは def.z - 1.4 あたり。見せたい 物は それより 手前（大きい z）に 置く。
        for (const side of [-1, 1]) {
          D(def.x + side * 2.3, 2.2, def.z - 1.05, 0.55, 4.4, 0.55, 0xfffaf0);
          D(def.x + side * 2.3, 4.5, def.z - 1.05, 0.9, 0.3, 0.9, 0xe9dfc6);
          const wx = def.x + side * 5.0;
          D(wx, 2.3, def.z - 1.2, 2.6, 2.4, 0.18, 0x4a2f6e);
          // まどの 中の 本だな（色の せなか）
          SPINES.slice(0, 6).forEach((c, i) => D(wx - 0.95 + i * 0.38, 2.7, def.z - 1.08, 0.3, 0.9, 0.1, c, 0.25));
          SPINES.slice(2, 8).forEach((c, i) => D(wx - 0.95 + i * 0.38, 1.7, def.z - 1.08, 0.3, 0.8, 0.1, c, 0.25));
        }
        D(def.x, 4.75, def.z - 1.0, 5.6, 0.5, 0.7, 0xfffaf0);
        D(def.x, 5.7, def.z - 1.0, 1.1, 1.1, 0.25, 0xffd766, 0.7);
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadReadingData().then((d) => { island.receive(d.island); return d; }),
  });
}
