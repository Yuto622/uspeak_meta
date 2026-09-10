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
    build({ island: data, B, sprite, house, path, resident, scatter }) {
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

      for (const def of data.spots) {
        if (def.kind === 'pvp') {
          house(def.x, def.z - 5.6, 11, 8, Number(def.color), 0x6a4a7a, `${def.tone} ${def.name}`);
        } else {
          house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, `${def.tone} ${def.name}`);
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
