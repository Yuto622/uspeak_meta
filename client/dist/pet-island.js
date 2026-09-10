// ペット島 — the nest, the kitchen and the meadow.
//
// Caring for a pet is a walk, like everything else in this world: the egg hatches at the
// nest, food is at the kitchen, and making a fuss of it happens in the meadow. Terrain,
// dock, collision and beacon come from the shared island kit.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadPetData() {
  if (!promise) {
    promise = fetch('pets.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`pets.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[pet] pets.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createPetIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 90210,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, fence, flowers, bench, obstacles }) {
      const yard = data.courtyard;
      // A grassy ring with a little fence, so the middle reads as a place pets run about.
      B(yard.x, 0.12, yard.z, 16, 0.16, 12, 0xbcd39a);
      B(yard.x, 0.22, yard.z, 12, 0.14, 9, 0xcadfa8);
      for (let i = 0; i < 9; i += 1) {
        B(yard.x - 8 + i * 2, 0.9, yard.z + 6, 0.22, 1.5, 0.22, 0xd4c49b);
        B(yard.x - 8 + i * 2, 0.9, yard.z - 6, 0.22, 1.5, 0.22, 0xd4c49b);
      }
      sprite(`${data.name} · ${data.en}`, yard.x, 4.4, yard.z, { width: 9, size: 30 });

      // A great stone egg in a fountain, which is what the island is for; kennels along
      // one side and a paddock rail round the grass, so it reads as a place for animals.
      // West of the yard: the way from the courtyard to the nest runs straight south, and
      // a fountain standing in it would be a wall with a fountain on top.
      const ex = yard.x - 9;
      const ez = yard.z + 6.5;
      D(ex, 0.55, ez, 6.4, 0.7, 6.4, 0xbcb49a);
      D(ex, 1.0, ez, 5.4, 0.3, 5.4, 0xd3cbb0);
      D(ex, 1.2, ez, 4.4, 0.2, 4.4, 0x79bdba);
      for (let i = 0; i < 5; i += 1) {
        const w = [2.6, 3.0, 3.2, 2.8, 1.8][i];
        D(ex, 1.7 + i * 0.85, ez, w, 0.9, w, i % 2 ? 0xf7f1e1 : 0xfffaf0);
      }
      D(ex, 5.9, ez, 1.0, 0.7, 1.0, 0xf7e2a8, 0.8);
      obstacles.push({ x: ex, z: ez, w: 3.4, d: 3.4 });
      // Kennels: four little houses in a row with a bowl outside each.
      for (let i = 0; i < 4; i += 1) {
        const kx = yard.x + 5 + i * 2.6;
        const kz = yard.z + 7;
        D(kx, 0.85, kz, 2.0, 1.5, 1.8, [0xd9a05b, 0xc7885a, 0xb9976a, 0xd0b070][i]);
        for (let r = 0; r < 3; r += 1) D(kx, 1.75 + r * 0.3, kz, 2.3 - r * 0.6, 0.3, 2.1 - r * 0.6, 0x8a6a45);
        D(kx, 0.75, kz + 0.95, 0.9, 1.3, 0.15, 0x5a4632);
        D(kx + 1.5, 0.32, kz + 0.6, 0.7, 0.24, 0.7, 0x6f8f9a);
      }
      // The paddock rail runs round the empty grass behind the kennels, where nobody
      // has to walk.
      fence(yard.x + 5, yard.z + 12, 7, 'x');
      fence(yard.x + 15.5, yard.z + 5, 5, 'z');
      bench(yard.x - 4.5, yard.z + 3.5, 0);
      bench(yard.x + 4.5, yard.z + 3.5, 0);
      flowers(yard.x - 5.5, yard.z + 11, 0xe89bb0);
      flowers(yard.x + 3.5, yard.z + 12.5, 0xf0d98a);

      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x9a7a5a, `${def.tone} ${def.name}`);
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xdfd3ab);
        resident(def);
      }
      scatter(data, 110);
    },
  });

  return Object.assign(island, {
    ready: loadPetData().then((d) => { island.receive(d.island); return d; }),
  });
}
