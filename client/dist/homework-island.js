// しゅくだい島 — 1 けんの「しゅくだいの いえ」。歩いて 入ると、先生が くばった 宿題が ひらく。
//
// 問題（答えつき）は この 島にも client/dist にも 無い（サーバーの DATA_DIR/homework.json。/admin/homework で 入れる）。
// 地形・さんばし・当たり判定・看板・ミニマップ・光の 柱は ほかの 島と 同じ island-kit。ここは 建物だけ。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadHomeworkData() {
  if (!promise) {
    promise = fetch('homework.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`homework.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[homework] homework.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createHomeworkIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 31415,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles }) {
      const yard = data.courtyard;
      // 校庭：土の 広場と、白い 線
      B(yard.x, 0.12, yard.z, 18, 0.15, 12, 0xd9c9a3);
      B(yard.x, 0.2, yard.z, 13, 0.14, 8, 0xe8dbb8);
      for (const side of [-1, 1]) B(yard.x + side * 6.4, 0.29, yard.z, 0.18, 0.02, 7.6, 0xffffff);
      bunting(yard.x - 8, yard.z + 5.5, yard.x + 8, yard.z + 5.5, 3.6);
      sprite({ en: data.en, ja: data.name }, yard.x, 4.6, yard.z, { width: 11, size: 30 });

      // 目じるし：大きな 黒板・本の 山・えんぴつ（海から 見て「宿題の 島」と 分かる）
      const bx = yard.x - 9.5; const bz = yard.z + 1;
      D(bx, 0.6, bz, 0.5, 1.2, 0.5, 0x6f5b3e); D(bx + 3.4, 0.6, bz, 0.5, 1.2, 0.5, 0x6f5b3e);
      D(bx + 1.7, 2.6, bz, 4.4, 2.8, 0.3, 0x6f5b3e);
      D(bx + 1.7, 2.6, bz + 0.1, 4.0, 2.4, 0.2, 0x2f5d48);
      [[0.8, 3.2, 1.2], [1.5, 2.6, 1.6], [2.5, 2.0, 0.9]].forEach(([x, y, w]) => D(bx + x, y, bz + 0.22, w, 0.12, 0.05, 0xf3f0e6, 0.4));
      obstacles.push({ x: bx + 1.7, z: bz, w: 2.6, d: 0.8 });
      const sx = yard.x + 9.5; const sz = yard.z + 1;
      [[0xd65a4a, 0], [0x4a7fd6, 0.9], [0xf0c84a, 1.8], [0x5ab86f, 2.7]].forEach(([c, y], i) => D(sx + (i % 2) * 0.25, 0.45 + y, sz, 2.6, 0.85, 1.8, c));
      D(sx, 4.7, sz, 0.45, 2.6, 0.45, 0xf0c84a); D(sx, 6.2, sz, 0.45, 0.5, 0.45, 0xe9b48a); D(sx, 6.55, sz, 0.18, 0.25, 0.18, 0x333333);
      obstacles.push({ x: sx, z: sz, w: 1.8, d: 1.4 });

      bench(yard.x - 5.5, yard.z + 3.5, 0);
      bench(yard.x + 5.5, yard.z + 3.5, 0);
      flowers(yard.x - 9, yard.z + 12, 0xf2c36b);
      flowers(yard.x + 9, yard.z + 12, 0xa7c7ef);

      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 11, 7, Number(def.color), 0x8a5a3a, { en: `${def.tone} ${def.en}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        // clock and windows: the front wall is at def.z - 1.4, so anything meant to be seen sits in front of it
        D(def.x, 4.6, def.z - 1.3, 1.3, 1.3, 0.2, 0xffffff); D(def.x, 4.6, def.z - 1.18, 0.12, 0.5, 0.06, 0x333333);
        for (const side of [-1, 1]) {
          const wx = def.x + side * 3.2;
          D(wx, 2.0, def.z - 1.44, 2.0, 1.8, 0.18, 0x8a5a3a);
          D(wx, 2.0, def.z - 1.32, 1.7, 1.5, 0.14, 0xf3ecd8, 0.5);
        }
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadHomeworkData().then((d) => { island.receive(d.island); return d; }),
  });
}
