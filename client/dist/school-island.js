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
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, obstacles }) {
      // A courtyard with the school bell, so the middle of the island is a place and not
      // just the gap between three huts.
      const yard = data.courtyard;
      B(yard.x, 0.12, yard.z, 12, 0.14, 12, 0xd8cfa8);
      B(yard.x, 0.2, yard.z, 8, 0.14, 8, 0xe6ddba);
      for (const sx of [-2.6, 2.6]) B(yard.x + sx, 2.4, yard.z, 0.4, 4.6, 0.4, 0x7a6448);
      B(yard.x, 4.6, yard.z, 6.2, 0.5, 0.5, 0xb8703f);
      B(yard.x, 3.9, yard.z, 1.1, 1.3, 1.1, 0xd9b45c);
      sprite(`${data.name} · ことばの小屋`, yard.x, 5.8, yard.z, { width: 10, size: 30 });

      // The bell tower: the thing you see from the water, and the reason the courtyard
      // has a middle. Stone base, timber frame, a bell under a little roof.
      // North-east of the courtyard: clear of all four paved lines, and the first thing
      // you see coming up from the landing.
      const tx = yard.x + 10;
      const tz = yard.z + 4.5;
      D(tx, 0.6, tz, 5.2, 0.8, 5.2, 0xbcb49a);
      D(tx, 1.1, tz, 4.4, 0.3, 4.4, 0xd3cbb0);
      for (const sx of [-1.7, 1.7]) for (const sz of [-1.7, 1.7]) D(tx + sx, 5, tz + sz, 0.5, 8, 0.5, 0x8a6f4a);
      for (let i = 0; i < 3; i += 1) D(tx, 2.4 + i * 3, tz, 3.9, 0.35, 3.9, 0x9a7c53);
      D(tx, 9.3, tz, 4.6, 0.5, 4.6, 0x6f5b3e);
      for (let i = 0; i < 4; i += 1) D(tx, 9.7 + i * 0.45, tz, 4.4 - i * 0.9, 0.45, 4.4 - i * 0.9, 0x4c6f86);
      D(tx, 11.7, tz, 0.5, 1.2, 0.5, 0xd9b45c);
      D(tx, 8.2, tz, 1.5, 1.6, 1.5, 0xd9b45c, 0.5);          // the bell, catching the light
      D(tx, 9.05, tz, 0.4, 0.5, 0.4, 0x6f5b3e);
      obstacles.push({ x: tx, z: tz, w: 2.6, d: 2.6 });
      // A clock face on the side that looks at the courtyard.
      D(tx, 6.6, tz + 2.1, 2.2, 2.2, 0.2, 0xf3ecd8);
      D(tx, 6.6, tz + 2.25, 0.16, 1.2, 0.12, 0x3d4a44);
      D(tx + 0.4, 6.6, tz + 2.25, 0.9, 0.16, 0.12, 0x3d4a44);

      // An open book on a plinth: what the island is about, made of blocks.
      const bx = yard.x - 9.5;
      const bz = yard.z + 4;
      D(bx, 0.5, bz, 4.6, 0.6, 3.4, 0xbcb49a);
      D(bx, 1.0, bz, 4.0, 0.4, 2.8, 0xd3cbb0);
      for (const side of [-1, 1]) {
        D(bx + side * 1.15, 1.7, bz, 2.2, 0.9, 2.6, 0xf5efdd);
        D(bx + side * 1.15, 2.2, bz, 2.0, 0.12, 2.4, 0xfffaf0);
        D(bx + side * 2.2, 1.7, bz, 0.24, 1.0, 2.7, 0x9a5f4a);
      }
      D(bx, 1.5, bz, 0.4, 1.3, 2.8, 0x9a5f4a);
      for (let i = 0; i < 4; i += 1) D(bx - 0.7 + (i % 2) * 1.4, 2.3, bz - 0.8 + Math.floor(i / 2) * 1.6, 1.1, 0.06, 0.14, 0x8a9aa5);
      bench(yard.x - 3.5, yard.z + 6, 0);
      bench(yard.x + 3.5, yard.z + 6, 0);
      flowers(yard.x - 6, yard.z + 5, 0xe89bb0);
      flowers(yard.x + 6, yard.z + 5, 0xdfe4ef);

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
