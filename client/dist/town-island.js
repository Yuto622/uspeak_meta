// まちづくり島 — a block shop, an estate agent, and the door to your own room.
//
// Only the door stands here. What is behind it is built when a child walks in, from
// their own saved blocks, which is how Roblox's HousingService worked and why a school
// of six hundred costs what a class of twenty-five does.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadTownData() {
  if (!promise) {
    promise = fetch('town.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`town.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[town] town.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createTownIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 20260910,
    build({ island: data, B, D, house, path, resident, scatter }) {
      const yard = data.courtyard;
      // A little square of half-built houses, so the island reads as a town being made.
      B(yard.x, 0.12, yard.z, 16, 0.16, 11, 0xcfc9ad);
      B(yard.x, 0.26, yard.z, 13, 0.14, 8, 0xdedaba);
      for (let i = 0; i < 4; i += 1) {
        const x = yard.x - 5 + i * 3.4;
        for (let y = 0; y <= i; y += 1) D(x, 0.5 + y, yard.z - 3.2, 1, 1, 1, [0xb08655, 0x9a9a92, 0xb4614a, 0xa8d8e8][i]);
      }
      // A stack of spare blocks by the shop, which is what a builder's yard looks like.
      for (let i = 0; i < 9; i += 1) D(yard.x - 6.5 + (i % 3) * 1.1, 0.5 + Math.floor(i / 3), yard.z + 3.4, 1, 1, 1, 0xb08655);

      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), def.kind === 'door' ? 0x6a7a8a : 0x8a6a4a, `${def.tone} ${def.name}`);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe2dab6);
        resident(def);
      }
      scatter(data, 90);
    },
  });

  return Object.assign(island, {
    ready: loadTownData().then((d) => { island.receive(d.island); return d; }),
  });
}
