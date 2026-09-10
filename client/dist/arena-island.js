// えいごアリーナ島 — four challenge stands round a ring.
//
// Difficulty is a place again: らくらく / ふつう / つよい each have their own stand, and
// the たいせん台 by the landing is where players face each other. Terrain, dock,
// collision and beacon come from the shared island kit.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadArenaData() {
  if (!promise) {
    promise = fetch('arena.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`arena.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[arena] arena.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createArenaIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 51413,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, obstacles, shade }) {
      const yard = data.courtyard;
      // The ring: a raised stone floor with rope posts, so the middle of the island is
      // the arena rather than the gap between four buildings.
      B(yard.x, 0.12, yard.z - 6, 20, 0.2, 14, 0xcbb896);
      B(yard.x, 0.26, yard.z - 6, 17, 0.2, 11, 0xdccba8);
      for (const sx of [-8.4, 8.4]) for (const sz of [-6.6, 6.6]) {
        B(yard.x + sx, 1.3, yard.z - 6 + sz, 0.45, 2.4, 0.45, 0x7a6448);
        B(yard.x + sx, 2.4, yard.z - 6 + sz, 0.7, 0.3, 0.7, 0xd9b45c);
      }
      for (const sx of [-2.8, 2.8]) B(yard.x + sx, 3.2, yard.z, 0.4, 6, 0.4, 0x7a6448);
      B(yard.x, 6.4, yard.z, 6.8, 0.5, 0.5, 0x9a6ba0);
      sprite(`${data.name} · ${data.en}`, yard.x, 5.5, yard.z, { width: 11, size: 30 });

      // Tiered seating down both sides of the ring, so a fight has somewhere to be
      // watched from, with banners on poles above it.
      for (const side of [-1, 1]) {
        for (let row = 0; row < 3; row += 1) {
          const dx = side * (11 + row * 1.6);
          D(yard.x + dx, 0.45 + row * 0.55, yard.z - 6, 1.5, 0.9 + row * 1.1, 15, row % 2 ? 0xc7bda0 : 0xbdb294);
          D(yard.x + dx, 0.95 + row * 1.1, yard.z - 6, 1.6, 0.2, 15, 0xd9d1b6);
          for (let seat = 0; seat < 5; seat += 1) {
            D(yard.x + dx, 1.2 + row * 1.1, yard.z - 12 + seat * 3, 1.2, 0.35, 1.6, [0x9a6ba0, 0x4a7a6a, 0x6a4a7a][row]);
          }
        }
        for (const dz of [-12, -6, 0]) {
          D(yard.x + side * 15.5, 3.2, yard.z + dz, 0.3, 6.4, 0.3, 0x7b6647);
          D(yard.x + side * 15.5, 5.6, yard.z + dz, 0.24, 1.8, 1.6, side > 0 ? 0x9a6ba0 : 0x4a7a6a);
        }
        // Only the northern half of each stand is solid: the paths to the three challenge
        // stands cut across the southern half, and a stand you cannot walk past is a wall.
        obstacles.push({ x: yard.x + side * 13, z: yard.z - 1.5, w: 2.6, d: 2.5 });
      }
      // The scoreboard at the head of the ring.
      for (const sx of [-3.4, 3.4]) D(yard.x + sx, 3.4, yard.z - 14.5, 0.5, 6.8, 0.5, 0x7b6647);
      D(yard.x, 6.4, yard.z - 14.5, 8.4, 3.4, 0.4, 0x2f3f4a);
      D(yard.x, 6.4, yard.z - 14.3, 7.6, 2.6, 0.2, 0x1d2a33);
      for (const sx of [-1.8, 1.8]) {
        for (let i = 0; i < 3; i += 1) D(yard.x + sx, 7.2 - i * 0.8, yard.z - 14.15, 1.5, 0.5, 0.1, 0xffd166, 1.6);
      }
      D(yard.x, 8.3, yard.z - 14.5, 9.0, 0.4, 0.8, 0x9a6ba0);
      // No collision: the board stands over the way to the middle stand, and a child
      // walks under it.

      for (const def of data.spots) {
        if (def.kind === 'pvp' || def.kind === 'dojo') {
          house(def.x, def.z - 5.6, 11, 8, Number(def.color), def.kind === 'dojo' ? 0x4a7a6a : 0x6a4a7a, `${def.tone} ${def.name}`);
          door(def, 5.6, 8);
        } else {
          house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, `${def.tone} ${def.name}`);
          door(def);
        }
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe0d6b0);
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadArenaData().then((d) => { island.receive(d.island); return d; }),
  });
}
