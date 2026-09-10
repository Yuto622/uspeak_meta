// まちづくり島 — a block shop, a furniture shop, an estate agent, the door to your own
// room, and the square the blocks are built on.
//
// Only the doorways stand here. What is behind one is built when a child walks in, from
// their own save, which is how Roblox's HousingService worked and why a school of six
// hundred costs what a class of twenty-five does.
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
    build({ island: data, B, D, house, path, resident, door, scatter, obstacles, crate, barrel }) {
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

      // A house going up, with scaffolding round it and a crane over it: the island is
      // called まちづくり, so something should be visibly under construction.
      // South of the square, clear of the four lanes that run north to the buildings.
      const bx = yard.x - 12;
      const bz = yard.z + 9;
      for (let x = 0; x < 4; x += 1) {
        for (let z = 0; z < 4; z += 1) {
          const h = (x === 0 || z === 0 || x === 3 || z === 3) ? 3 - Math.floor((x + z) / 3) : 0;
          for (let y = 0; y < h; y += 1) D(bx - 1.5 + x, 0.7 + y, bz - 1.5 + z, 1, 1, 1, (x + y + z) % 3 ? 0xd8cdb4 : 0xc3b79c);
        }
      }
      for (const sx of [-2.6, 2.6]) for (const sz of [-2.6, 2.6]) D(bx + sx, 2.4, bz + sz, 0.22, 4.6, 0.22, 0x9a8a6a);
      for (const y of [1.6, 3.2, 4.6]) {
        for (const sz of [-2.6, 2.6]) D(bx, y, bz + sz, 5.4, 0.16, 0.16, 0x9a8a6a);
        for (const sx of [-2.6, 2.6]) D(bx + sx, y, bz, 0.16, 0.16, 5.4, 0x9a8a6a);
      }
      for (let i = 0; i < 5; i += 1) D(bx - 2.4 + i * 1.2, 4.75, bz + 2.6, 1.1, 0.14, 1.2, 0xb08655);
      obstacles.push({ x: bx, z: bz, w: 3, d: 3 });
      // The crane: mast, jib, counterweight and a block on a line.
      const cx = bx + 7;
      const cz = bz + 1;
      D(cx, 0.5, cz, 2.6, 0.7, 2.6, 0x8d8570);
      for (const sx of [-0.7, 0.7]) for (const sz of [-0.7, 0.7]) D(cx + sx, 5.5, cz + sz, 0.24, 10, 0.24, 0xe0a94a);
      for (let i = 0; i < 5; i += 1) D(cx, 2 + i * 2, cz, 1.7, 0.16, 1.7, 0xe0a94a);
      D(cx - 3.5, 10.6, cz, 9.5, 0.3, 0.3, 0xe0a94a);
      D(cx - 3.5, 10.9, cz, 9.5, 0.3, 0.3, 0xe0a94a);
      for (let i = 0; i < 8; i += 1) D(cx - 7.5 + i * 1.2, 10.75, cz, 0.16, 0.9, 0.16, 0xe0a94a);
      D(cx + 4.2, 10.75, cz, 1.6, 1.2, 1.6, 0x6f6a60);
      D(cx - 6.5, 8.6, cz, 0.1, 4.2, 0.1, 0x4a4a44);
      D(cx - 6.5, 6.2, cz, 1.1, 1.1, 1.1, 0xb08655);
      obstacles.push({ x: cx, z: cz, w: 1.5, d: 1.5 });
      crate(yard.x + 5.5, yard.z + 4, 1.1);
      crate(yard.x + 6.8, yard.z + 4.6, 0.9);
      barrel(yard.x - 9, yard.z + 1.5);

      for (const def of data.spots) {
        // The ひろば is a square, not a shop: a paved yard with a gateway across the
        // front of it, and walking under the gateway is what takes a child to their lot.
        if (def.kind === 'plaza') {
          const px = def.x;
          const pz = def.z - 4.6;
          B(px, 0.16, pz, 11, 0.2, 9, 0xd8d0b0);
          B(px, 0.3, pz, 8.6, 0.16, 6.8, 0xe6dfc2);
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) D(px + sx * 5.2, 0.7, pz + sz * 4.2, 0.7, 1.4, 0.7, 0xb8ad8c);
          }
          // The gateway, on the line a child walks in on.
          for (const sx of [-2.2, 2.2]) D(px + sx, 2.1, pz + 4.6, 0.8, 4.2, 0.8, 0xcfc4a2);
          D(px, 4.4, pz + 4.6, 5.6, 0.8, 1, 0xb8ad8c);
          D(px, 5, pz + 4.6, 3, 0.5, 0.7, Number(def.color));
          // A half-built stack in the middle, so the square reads as somewhere to build.
          for (let i = 0; i < 6; i += 1) D(px - 1.5 + (i % 3) * 1.2, 0.9 + Math.floor(i / 3), pz - 1.4, 1, 1, 1, [0xb08655, 0x9a9a92, 0xa8d8e8][i % 3]);
          obstacles.push({ x: px, z: pz - 1.4, w: 2.2, d: 1.2 });
          // A square has no front wall to stop at, so the way in is the gateway itself,
          // which stands on the spot a child walks to (the two numbers put the doorway
          // there rather than in front of a wall that is not there).
          door(def, 0.75, 0);
          path(def.path.x, def.path.z, def.x, def.z);
          resident(def);
          continue;
        }
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), def.kind === 'door' ? 0x6a7a8a : 0x8a6a4a, `${def.tone} ${def.name}`);
        door(def);
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
