// ことばの学校島 — three huts, one per difficulty.
//
// A child walks into the hut they want and answers ten questions there. The hut is the
// difficulty: there is no menu to pick from, which is why the island exists rather than
// a dialog. Terrain, dock, collision and beacon come from the shared island kit.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadSchoolData() {
  if (!promise) {
    promise = fetch('school.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`school.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[school] school.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createSchoolIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 30414159,
    build({ island: data, B, sprite, house, path, resident, scatter }) {
      // A courtyard with the school bell, so the middle of the island is a place and not
      // just the gap between three huts.
      B(0, 0.12, 12, 12, 0.14, 12, 0xd8cfa8);
      B(0, 0.2, 12, 8, 0.14, 8, 0xe6ddba);
      for (const sx of [-2.6, 2.6]) B(sx, 2.4, 12, 0.4, 4.6, 0.4, 0x7a6448);
      B(0, 4.6, 12, 6.2, 0.5, 0.5, 0xb8703f);
      B(0, 3.9, 12, 1.1, 1.3, 1.1, 0xd9b45c);
      sprite(`${data.name} · ことばの小屋`, 0, 5.8, 12, { width: 10, size: 30 });

      for (const def of data.spots) {
        // Each hut is coloured and starred by its difficulty, so a child reads the
        // island rather than a label.
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, `${def.tone} ${def.name}`);
        path(0, 12, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe0d6b0);
        resident(def);
      }
      scatter(data);
    },
  });

  return Object.assign(island, {
    ready: loadSchoolData().then((d) => { island.receive(d.island); return d; }),
  });
}
