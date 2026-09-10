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
    build({ island: data, B, sprite, house, path, resident, scatter }) {
      const yard = data.courtyard;
      // A grassy ring with a little fence, so the middle reads as a place pets run about.
      B(yard.x, 0.12, yard.z, 16, 0.16, 12, 0xbcd39a);
      B(yard.x, 0.22, yard.z, 12, 0.14, 9, 0xcadfa8);
      for (let i = 0; i < 9; i += 1) {
        B(yard.x - 8 + i * 2, 0.9, yard.z + 6, 0.22, 1.5, 0.22, 0xd4c49b);
        B(yard.x - 8 + i * 2, 0.9, yard.z - 6, 0.22, 1.5, 0.22, 0xd4c49b);
      }
      sprite(`${data.name} · ${data.en}`, yard.x, 4.4, yard.z, { width: 9, size: 30 });

      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x9a7a5a, `${def.tone} ${def.name}`);
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
