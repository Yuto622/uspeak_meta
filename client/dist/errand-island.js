// おつかい島 — where the errand quest is walked.
//
// Only the buildings and the residents are here; the terrain, dock, collision, beacon
// and minimap come from the shared island kit. The spots are the same coordinates the
// server checks a child's position against, read from the same missions.json, so a place
// a child can see is always a place the server agrees they are standing in.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';
import { loadErrandData } from './errand-data.js';

export { NEAR_DISTANCE };

export function createErrandIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 20250910,
    build({ island: data, B, sprite, house, path, resident, scatter }) {
      const plaza = data.spots.find((s) => s.kind === 'plaza');
      // The plaza: a stone circle, the errand board, and the person who hands them out.
      if (plaza) {
        for (let i = 0; i < 3; i += 1) B(plaza.x, 0.12 + i * 0.06, plaza.z, 13 - i * 3, 0.14, 13 - i * 3, i % 2 ? 0xd6c9a4 : 0xe3d8b6);
        for (const sx of [-3.4, 3.4]) B(plaza.x + sx, 1.6, plaza.z - 1.6, 0.3, 3, 0.3, 0x7a6448);
        B(plaza.x, 2.6, plaza.z - 1.6, 7.4, 2.6, 0.24, 0xf0e3bd);
        B(plaza.x, 4.1, plaza.z - 1.6, 8, 0.4, 0.6, 0xb8703f);
        sprite('ERRAND BOARD · おつかい掲示板', plaza.x, 5.4, plaza.z - 1.6, { width: 11, size: 30 });
      }
      for (const def of data.spots) {
        if (def.kind === 'shop') {
          house(def.x, def.z - 4.6, 7.4, 6, Number(def.color), 0xb8703f, def.name);
          path(plaza ? plaza.x : 0, plaza ? plaza.z : 0, def.x, def.z);
        }
        resident(def);
      }
      scatter(data);
    },
  });

  // Assigned onto the island, never spread into a copy: `visible`, `data`, `spots` and
  // `target` are getters, and spreading would freeze them at their value right now.
  return Object.assign(island, {
    ready: loadErrandData().then((d) => { island.receive(d.island); return d; }),
    ensure() { island.show(true); return island.visible; },
  });
}
