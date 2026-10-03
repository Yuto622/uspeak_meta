// 土地島 — the estate office, the ferry to your own island, and the board of everyone's.
//
// Three buildings round a yard, and that is the hub: the island a child actually owns is
// not here (it is a scene of its own, land-world.js, reached from the ferry). Walking into
// a doorway is what opens each — the office to buy, the ferry to go, the board to look —
// so nothing on this island asks a child to press anything.
//
// Terrain, dock, collision, labels, minimap and beacon come from the shared island kit.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadLandData() {
  if (!promise) {
    promise = fetch('land.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`land.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[land] land.json failed to load', err); return { island: null, tiers: [] }; });
  }
  return promise;
}

export function createLandIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 60613,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles, lamp, barrel, crate, fence }) {
      const yard = data.courtyard;
      // A sandy forecourt by the water, with bunting: a place where islands are sold
      // should look like a holiday.
      B(yard.x, 0.12, yard.z, 17, 0.15, 13, 0xe8dcb8);
      B(yard.x, 0.2, yard.z, 11, 0.14, 8, 0xf0e6c8);
      sprite({ en: `${data.en} · your own island`, ja: `${data.name} · じぶんの しまを かおう` }, yard.x, 4.6, yard.z, { width: 11, size: 30 });
      bunting(yard.x - 8, yard.z + 5.5, yard.x + 8, yard.z + 5.5, 3.6);

      // The landmark, off the paths (they fan out from the yard's middle): a model of the
      // six islands on a table, smallest to grandest, the way the office sells them.
      const tx = yard.x + 7.5; const tz = yard.z + 1.5;
      D(tx, 0.55, tz, 3.4, 0.2, 2.2, 0x8a6a45);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) D(tx + sx * 1.4, 0.25, tz + sz * 0.8, 0.16, 0.5, 0.16, 0x6d543a);
      const colors = [0xf0dca0, 0x8fb36a, 0x5f8a4a, 0xe8a5c8, 0xf2f4f8, 0xffd766];
      colors.forEach((c, i) => { const s = 0.35 + i * 0.07; D(tx - 1.3 + i * 0.52, 0.72 + s / 2, tz, 0.44, s, 0.44, c); });
      D(tx + 1.3, 1.45, tz, 0.3, 0.5, 0.3, 0xd9b45c, 0.4);
      obstacles.push({ x: tx, z: tz, w: 1.8, d: 1.2 });

      // A ferry boat moored at the water's edge, so the ferry house is obviously a ferry.
      const bx = yard.x + 11.5; const bz = yard.z + 9.5;
      D(bx, 0.35, bz, 4.4, 0.7, 2.0, 0x4e7fa8);
      D(bx, 0.8, bz, 3.6, 0.3, 1.5, 0xf3ecd8);
      D(bx - 0.6, 1.5, bz, 1.6, 1.2, 1.2, 0xf3ecd8);
      D(bx - 0.6, 1.5, bz + 0.62, 1.2, 0.7, 0.08, 0x9fd6e8, 0.4);
      D(bx + 1.2, 1.7, bz, 0.18, 1.5, 0.18, 0x6d543a);
      D(bx + 1.2, 2.3, bz, 0.9, 0.5, 0.06, 0xe0566a);
      obstacles.push({ x: bx, z: bz, w: 2.3, d: 1.1 });

      bench(yard.x - 5.5, yard.z + 3.5, 0);
      flowers(yard.x - 9, yard.z + 12, 0xf0d98a);
      flowers(yard.x + 9, yard.z + 13, 0xe89bb0);
      lamp(yard.x - 7.5, yard.z - 1.5);
      barrel(yard.x - 8.4, yard.z + 8);
      crate(yard.x + 8.6, yard.z - 4.6);

      // The three buildings. Each wears its name and a touch of what it is for.
      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x7a5a3e, { en: `${def.tone} ${def.en || def.name}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        const front = def.z - 1.3;
        if (def.kind === 'office') {
          // A "FOR SALE" board on a post, and a little palm in a pot.
          D(def.x + 2.8, 1.5, front + 0.8, 0.14, 2.6, 0.14, 0x6d543a);
          D(def.x + 2.8, 2.5, front + 0.8, 1.8, 0.9, 0.1, 0xf7f1e1);
          D(def.x + 2.8, 2.5, front + 0.86, 1.4, 0.18, 0.04, 0xe0566a);
          D(def.x - 2.8, 0.5, front + 0.8, 0.9, 0.9, 0.9, 0xb4703f);
          D(def.x - 2.8, 1.6, front + 0.8, 0.18, 1.4, 0.18, 0x8a6a45);
          // (D() is instanced and returns nothing, so the fronds are two crossed slabs.)
          D(def.x - 2.8, 2.3, front + 0.8, 1.6, 0.12, 0.4, 0x4e9a3f);
          D(def.x - 2.8, 2.3, front + 0.8, 0.4, 0.12, 1.6, 0x4e9a3f);
        } else if (def.kind === 'ferry') {
          // A life ring either side of the door and a rope.
          for (const side of [-1, 1]) {
            D(def.x + side * 2.6, 2.0, front, 1.2, 1.2, 0.18, 0xf3ecd8);
            D(def.x + side * 2.6, 2.0, front + 0.02, 0.5, 0.5, 0.2, Number(def.color));
            D(def.x + side * 2.6, 2.0, front + 0.1, 1.24, 0.18, 0.1, 0xe0566a);
          }
          D(def.x, 3.4, front + 0.3, 6.4, 0.08, 0.08, 0xd9c7a8);
        } else if (def.kind === 'board') {
          // A big map pinned on the wall: six little islands and a flag.
          D(def.x, 2.2, front, 4.6, 2.6, 0.16, 0xf7f1e1);
          D(def.x, 2.2, front + 0.02, 4.2, 2.2, 0.14, 0x9fd6e8);
          colors.forEach((c, i) => D(def.x - 1.5 + (i % 3) * 1.5, 2.6 - Math.floor(i / 3) * 0.9, front + 0.1, 0.7, 0.45, 0.1, c));
          D(def.x + 1.6, 3.3, front + 0.12, 0.08, 0.7, 0.08, 0x6d543a);
          D(def.x + 1.85, 3.5, front + 0.12, 0.5, 0.3, 0.06, 0xe0566a);
        }
        resident(def);
      }
      scatter(data, 90);
    },
  });

  return Object.assign(island, {
    ready: loadLandData().then((d) => { island.receive(d.island); return d; }),
  });
}
