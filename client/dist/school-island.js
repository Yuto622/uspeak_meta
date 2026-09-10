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
    build({ island: data, B, sprite, house, path, resident, door, scatter }) {
      // A courtyard with the school bell, so the middle of the island is a place and not
      // just the gap between three huts.
      const yard = data.courtyard;
      B(yard.x, 0.12, yard.z, 12, 0.14, 12, 0xd8cfa8);
      B(yard.x, 0.2, yard.z, 8, 0.14, 8, 0xe6ddba);
      for (const sx of [-2.6, 2.6]) B(yard.x + sx, 2.4, yard.z, 0.4, 4.6, 0.4, 0x7a6448);
      B(yard.x, 4.6, yard.z, 6.2, 0.5, 0.5, 0xb8703f);
      B(yard.x, 3.9, yard.z, 1.1, 1.3, 1.1, 0xd9b45c);
      sprite(`${data.name} · ことばの小屋`, yard.x, 5.8, yard.z, { width: 10, size: 30 });

      for (const def of data.spots) {
        if (def.kind === 'gym') {
          // The gym is a hall, not a hut: wider, taller, with a pair of speaker stacks
          // either side of the door so it reads as the place you go to listen.
          house(def.x, def.z - 5.6, 11, 8, Number(def.color), 0x4c6f86, `${def.tone} ${def.name}`);
          door(def, 5.6, 8);
          for (const sx of [-4.2, 4.2]) {
            B(def.x + sx, 1.5, def.z - 1.4, 1.5, 3, 1.2, 0x3f5566);
            B(def.x + sx, 2.6, def.z - 1.9, 1.1, 0.9, 0.3, 0xd9e6ee);
          }
        } else {
          // Each hut is coloured and starred by its difficulty, so a child reads the
          // island rather than a label.
          house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, `${def.tone} ${def.name}`);
          door(def);
        }
        // Each building says in the data where its path starts, and therefore the line
        // a child walks to it. The huts open on to the courtyard, the gym on to the
        // landing; drawing every path from the courtyard sent the gym's straight through
        // the middle hut, which the regression test now refuses.
        path(def.path.x, def.path.z, def.x, def.z);
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
