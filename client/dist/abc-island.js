// ABC の 島 — 大きな つみきの いえが 1 つ。歩いて 入ると「ABC と おと」（abc.js）が ひらく。
//
// 文字・音・問題・正解は この 島にも client/dist にも 無い（部屋の server/src/game/abc.js が 作って 判定する）。
// 地形・さんばし・当たり判定・看板・ミニマップ・光の 柱は ほかの 島と 同じ island-kit。ここは 建物と 目じるし（つみき）だけ。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadAbcIslandData() {
  if (!promise) {
    promise = fetch('abc-island.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`abc-island.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[abc] abc-island.json failed to load', err); return { island: null }; });
  }
  return promise;
}

const BLOCKS = [0xe2574c, 0x5aae78, 0x4f86d9, 0xf0b43c, 0xb06fc4, 0x3baacb, 0xff8f5a, 0xe0668e];

export function createAbcIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 31415,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles }) {
      const yard = data.courtyard;
      // ひろば：クリーム色の 石だたみ と 色の タイル（つみきの 色）
      B(yard.x, 0.12, yard.z, 20, 0.15, 13, 0xf3e6c4);
      B(yard.x, 0.2, yard.z, 15, 0.14, 9, 0xfff6dc);
      BLOCKS.forEach((c, i) => B(yard.x - 6.1 + i * 1.75, 0.3, yard.z + 3.2, 1.3, 0.08, 1.3, c));
      bunting(yard.x - 9, yard.z + 6, yard.x + 9, yard.z + 6, 3.8);
      sprite({ en: data.en, ja: data.name }, yard.x, 5.2, yard.z + 2, { width: 11, size: 30 });

      // 目じるし 1：A・B・C の 大きな つみき（左）。下に 2 つ、上に 1 つ。
      const ox = yard.x - 10.5; const oz = yard.z + 0.5;
      const cube = (x, y, z, s, c) => { D(x, y, z, s, s, s, c); D(x, y, z + s / 2 + 0.03, s * 0.74, s * 0.74, 0.06, 0xfffaf0); };
      cube(ox - 1.25, 1.1, oz, 2.2, 0x5aae78);
      cube(ox + 1.25, 1.1, oz, 2.2, 0x4f86d9);
      cube(ox, 3.3, oz, 2.2, 0xe2574c);
      sprite({ en: 'A', ja: 'A' }, ox, 3.4, oz + 1.25, { width: 2.2, size: 60 });
      sprite({ en: 'B', ja: 'B' }, ox - 1.25, 1.2, oz + 1.25, { width: 2.2, size: 60 });
      sprite({ en: 'C', ja: 'C' }, ox + 1.25, 1.2, oz + 1.25, { width: 2.2, size: 60 });
      obstacles.push({ x: ox, z: oz, w: 5.0, d: 2.6 });

      // 目じるし 2：つみきの 塔（右）。1 つずつ 色が ちがう。
      const tx = yard.x + 10.5; const tz = yard.z + 0.5;
      BLOCKS.slice(0, 6).forEach((c, i) => D(tx + ((i % 2) - 0.5) * 0.3, 0.75 + i * 1.3, tz, 1.5, 1.3, 1.5, c));
      D(tx, 0.75 + 6 * 1.3 + 0.2, tz, 0.9, 0.9, 0.9, 0xffd766, 0.6);
      obstacles.push({ x: tx, z: tz, w: 2.0, d: 2.0 });

      bench(yard.x - 5.5, yard.z + 4.6, 0);
      bench(yard.x + 5.5, yard.z + 4.6, 0);
      flowers(yard.x - 9, yard.z + 12, 0xf2c36b);
      flowers(yard.x + 9, yard.z + 12, 0xff9fb8);

      for (const def of data.spots) {
        // つみきの いえ：きいろい 大きな 家・色の はしら・つみきの まど。
        house(def.x, def.z - 5.2, 15, 8.4, Number(def.color), 0xb5651d, { en: `${def.tone} ${def.en}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 7, 0.16, 6, 0xfff6dc);
        // 正面の かべは def.z - 1.4 あたり。見せたい 物は それより 手前（大きい z）に 置く。
        for (const side of [-1, 1]) {
          BLOCKS.slice(0, 4).forEach((c, i) => D(def.x + side * 2.3, 0.6 + i * 1.1, def.z - 1.05, 0.9, 1.05, 0.9, BLOCKS[(i + (side > 0 ? 4 : 0)) % BLOCKS.length]));
          const wx = def.x + side * 5.0;
          D(wx, 2.3, def.z - 1.2, 2.6, 2.4, 0.18, 0xfffaf0);
          BLOCKS.slice(0, 3).forEach((c, i) => D(wx - 0.8 + i * 0.8, 2.75, def.z - 1.08, 0.66, 0.66, 0.1, BLOCKS[(i + (side > 0 ? 3 : 0)) % BLOCKS.length], 0.2));
          BLOCKS.slice(0, 3).forEach((c, i) => D(wx - 0.8 + i * 0.8, 1.85, def.z - 1.08, 0.66, 0.66, 0.1, BLOCKS[(i + (side > 0 ? 6 : 5)) % BLOCKS.length], 0.2));
        }
        D(def.x, 4.75, def.z - 1.0, 5.6, 0.5, 0.7, 0xfffaf0);
        D(def.x, 5.7, def.z - 1.0, 1.2, 1.2, 0.3, 0xe2574c, 0.5);
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadAbcIslandData().then((d) => { island.receive(d.island); return d; }),
  });
}
