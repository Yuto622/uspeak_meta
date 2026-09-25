// きせかえ島 — four shops round a courtyard, one for each thing you can wear.
//
// The island exists so that shopping is somewhere you go rather than a button you press.
// The shop a child walks into IS the kind of thing they are shopping for — hats at the
// hat shop, glasses at the face shop — so nobody has to read a tab to buy a cap. The
// header button still opens the whole shop from anywhere; this is the other way in, and
// it is the nicer one.
//
// Terrain, dock, collision, labels, minimap and beacon all come from the shared island
// kit, as they do for every other walkable island. Only the buildings are written here.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadWardrobeIsland() {
  if (!promise) {
    promise = fetch('wardrobe.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`wardrobe.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[wear] wardrobe.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createWardrobeIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 60712,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles }) {
      const yard = data.courtyard;
      // A paved square with a low stage in the middle: somewhere to stand and be looked at,
      // which is the whole point of new clothes.
      B(yard.x, 0.12, yard.z, 15, 0.15, 13, 0xe3d8bd);
      B(yard.x, 0.2, yard.z, 10, 0.14, 9, 0xefe6cd);
      B(yard.x, 0.3, yard.z, 5.4, 0.16, 5.4, 0xd9c9e2);
      B(yard.x, 0.4, yard.z, 4.2, 0.14, 4.2, 0xe7dcee);
      sprite({ en: `${data.en} · try it on`, ja: `${data.name} · きて みよう` }, yard.x, 4.6, yard.z, { width: 10, size: 30 });
      // Bunting over the square, because a shopping street reads as one from the water.
      bunting(yard.x - 7, yard.z - 5, yard.x + 7, yard.z - 5, 3.6);
      bunting(yard.x - 7, yard.z + 6, yard.x + 7, yard.z + 6, 3.6);

      // The landmark: a great standing mirror, north-west of the square where no path
      // runs. It is what the island looks like from the sea, and it is a mirror because
      // that is the one thing every changing room in the world has.
      const mx = yard.x - 13;
      const mz = yard.z + 6;
      D(mx, 0.5, mz, 6.2, 0.7, 3.6, 0xbcb49a);
      D(mx, 0.95, mz, 5.4, 0.3, 3.0, 0xd3cbb0);
      for (const side of [-1, 1]) D(mx + side * 2.1, 4.2, mz, 0.6, 6.4, 0.6, 0xa4784f);
      D(mx, 7.5, mz, 5.2, 0.7, 0.9, 0xa4784f);
      D(mx, 8.1, mz, 3.0, 0.6, 0.8, 0xd9b45c);
      D(mx, 4.2, mz - 0.15, 3.9, 6.0, 0.35, 0x8a6a45);
      D(mx, 4.2, mz + 0.08, 3.4, 5.5, 0.2, 0xcfe6ea, 0.35);   // the glass, catching the light
      D(mx, 5.6, mz + 0.2, 2.4, 1.6, 0.06, 0xe8f4f6, 0.5);    // …and the highlight on it
      obstacles.push({ x: mx, z: mz, w: 5.2, d: 2.2 });

      // A rail of clothes and three dressed dummies on the other side, so the square has
      // two things in it and the shops are not the only made objects.
      const rx = yard.x + 12.5;
      const rz = yard.z + 6;
      D(rx, 0.45, rz, 7.6, 0.6, 3.2, 0xbcb49a);
      for (const side of [-1, 1]) D(rx + side * 3.1, 2.4, rz - 0.6, 0.28, 3.4, 0.28, 0x9a9a86);
      D(rx, 4.0, rz - 0.6, 6.6, 0.24, 0.24, 0x9a9a86);
      const rack = [0xd7776e, 0x6fa8c4, 0x7fae6a, 0xd4a94f, 0xb98ac4];
      rack.forEach((c, i) => {
        const hx = rx - 2.4 + i * 1.2;
        D(hx, 3.7, rz - 0.6, 0.5, 0.5, 0.1, 0xd8cfae);
        D(hx, 2.7, rz - 0.6, 1.0, 1.7, 0.4, c);
      });
      // Three dummies wearing the island's own hats, so the rack has somebody at it.
      const dressed = [0xd7776e, 0x6fa8c4, 0xd4a94f];
      const linen = [0xefe2cc, 0xe4cdb4, 0xf3ead6];
      for (let i = 0; i < 3; i += 1) {
        const dx = rx - 2.2 + i * 2.2;
        D(dx, 0.9, rz + 1.1, 0.5, 0.6, 0.5, 0x8a7a62);       // the stand
        D(dx, 1.9, rz + 1.1, 0.9, 1.5, 0.6, linen[i]);        // the torso
        D(dx, 2.9, rz + 1.1, 0.55, 0.6, 0.5, 0xe8d3b4);       // the head block
        D(dx, 3.32, rz + 1.1, 0.82, 0.2, 0.74, dressed[i]);   // …and a hat on it
        D(dx, 3.24, rz + 1.42, 0.6, 0.1, 0.34, dressed[i]);   // with a peak
      }
      obstacles.push({ x: rx, z: rz, w: 6.4, d: 2.4 });

      bench(yard.x - 4.5, yard.z + 5.5, 0);
      bench(yard.x + 4.5, yard.z + 5.5, 0);
      flowers(yard.x - 8, yard.z + 12, 0xe89bb0);
      flowers(yard.x + 8, yard.z + 12, 0xdfe4ef);

      // The four shops. Each one is painted its own colour and wears its own sign, so a
      // child reads the island instead of a menu.
      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, { en: `${def.tone} ${def.en || def.name}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        // A lit shop window either side of the door, with a striped awning over each.
        // `house()` puts the front wall at def.z - 1.4, so anything meant to be SEEN goes
        // at a larger z than that; smaller is inside the shop.
        for (const side of [-1, 1]) {
          const wx = def.x + side * 2.6;
          D(wx, 1.95, def.z - 1.44, 1.9, 1.8, 0.18, 0x8a6a4a);           // the frame
          D(wx, 1.95, def.z - 1.32, 1.6, 1.5, 0.14, 0xf3ecd8, 0.45);     // the glass, lit at night
          D(wx, 1.95, def.z - 1.26, 0.14, 1.5, 0.08, 0x8a6a4a);          // …divided in two
          for (let i = 0; i < 4; i += 1) {
            D(wx - 0.9 + i * 0.6, 3.05, def.z - 1.05, 0.6, 0.26, 0.9, i % 2 ? Number(def.color) : 0xf7f1e1);
          }
        }
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadWardrobeIsland().then((d) => { island.receive(d.island); return d; }),
  });
}
