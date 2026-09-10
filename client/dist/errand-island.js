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
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bunting, crate, barrel, bench, flowers, obstacles }) {
      const plaza = data.spots.find((s) => s.kind === 'plaza');
      // The plaza: a stone circle, the errand board, and the person who hands them out.
      if (plaza) {
        for (let i = 0; i < 3; i += 1) B(plaza.x, 0.12 + i * 0.06, plaza.z, 13 - i * 3, 0.14, 13 - i * 3, i % 2 ? 0xd6c9a4 : 0xe3d8b6);
        for (const sx of [-3.4, 3.4]) B(plaza.x + sx, 1.6, plaza.z - 1.6, 0.3, 3, 0.3, 0x7a6448);
        B(plaza.x, 2.6, plaza.z - 1.6, 7.4, 2.6, 0.24, 0xf0e3bd);
        B(plaza.x, 4.1, plaza.z - 1.6, 8, 0.4, 0.6, 0xb8703f);
        sprite('ERRAND BOARD · おつかい掲示板', plaza.x, 5.4, plaza.z - 1.6, { width: 11, size: 30 });

        // A market: four stalls with striped awnings, bunting overhead, a well in the
        // middle and the day's goods stacked around it. This is the square a child is
        // sent out from, so it should look like somewhere worth coming back to.
        const stall = (sx, sz, cloth) => {
          D(sx, 1.05, sz, 3.6, 0.24, 2.2, 0xa58c62);
          for (const dx of [-1.6, 1.6]) for (const dz of [-0.9, 0.9]) D(sx + dx, 1.3, sz + dz, 0.18, 2.6, 0.18, 0x7b6647);
          // The awning: stripes you can see, with only a thin ridge pole over them.
          for (let i = 0; i < 5; i += 1) D(sx - 1.6 + i * 0.85, 2.8, sz, 0.85, 0.3, 3.0, i % 2 ? cloth : 0xf3ecd8);
          D(sx, 3.05, sz, 4.2, 0.18, 0.3, 0x8a6a45);
          for (const dz of [-1.5, 1.5]) D(sx, 2.62, sz + dz, 4.2, 0.22, 0.22, 0x8a6a45);
          for (let i = 0; i < 4; i += 1) D(sx - 1.2 + i * 0.8, 1.32, sz + (i % 2 ? 0.4 : -0.4), 0.5, 0.36, 0.5, [0xd89d46, 0xbc7152, 0x90a354, 0xe4708a][i]);
          obstacles.push({ x: sx, z: sz, w: 1.9, d: 1.3 });
        };
        // The market stands north of the square, between it and the landing, and never
        // in the lane a child walks down from the dock or along to a shop: an island
        // that cannot be walked is not decorated, it is blocked.
        stall(plaza.x - 8.5, plaza.z + 5.5, 0xd9534f);
        stall(plaza.x + 8.5, plaza.z + 5.5, 0x4a90a4);
        stall(plaza.x - 8.5, plaza.z + 9.5, 0x7ec98a);
        stall(plaza.x + 8.5, plaza.z + 9.5, 0xe0a94a);
        bunting(plaza.x - 8.5, plaza.z + 5.5, plaza.x - 8.5, plaza.z + 9.5, 4.6);
        bunting(plaza.x + 8.5, plaza.z + 5.5, plaza.x + 8.5, plaza.z + 9.5, 4.6);
        // The well, off to one side of the square for the same reason.
        const wx = plaza.x - 6.5;
        const wz = plaza.z + 1.5;
        D(wx, 0.75, wz, 3.0, 1.1, 3.0, 0xa9a290);
        D(wx, 1.35, wz, 2.4, 0.3, 2.4, 0xbdb6a2);
        D(wx, 1.5, wz, 1.7, 0.2, 1.7, 0x3f6c74);
        for (const dx of [-1.2, 1.2]) D(wx + dx, 2.6, wz, 0.24, 2.6, 0.24, 0x7b6647);
        for (let i = 0; i < 3; i += 1) D(wx, 3.9 + i * 0.4, wz, 3.2 - i * 0.8, 0.4, 3.2 - i * 0.8, 0xb8703f);
        D(wx, 3.1, wz, 0.7, 0.7, 0.7, 0x8a6a45);
        obstacles.push({ x: wx, z: wz, w: 1.6, d: 1.6 });
        for (const [cx, cz] of [[-10.5, 6], [-9.6, 7.2], [10.5, 6], [9.6, 7.2]]) crate(plaza.x + cx, plaza.z + cz, 0.9);
        barrel(plaza.x + 11.5, plaza.z + 8);
        barrel(plaza.x - 11.5, plaza.z + 8);
        bench(plaza.x - 4.5, plaza.z + 4, 0);
        bench(plaza.x + 4.5, plaza.z + 4, 0);
        flowers(plaza.x - 5.5, plaza.z + 8.5, 0xe89bb0);
        flowers(plaza.x + 5.5, plaza.z + 8.5, 0xf0d98a);
      }
      for (const def of data.spots) {
        if (def.kind === 'shop') {
          house(def.x, def.z - 4.6, 7.4, 6, Number(def.color), 0xb8703f, def.name);
          door(def, 4.6, 6);
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
