// おはなし島 — the island that is a call.
//
// Every other island is a set of buildings with something to do inside them. This one is
// a place to stand in: the grass itself is the room, so the middle of it is an open ring
// of benches around a lantern rather than a hut, and the four booths round the edge are
// for when two children want to talk away from the ring.
//
// Terrain, dock, collision, doorways, beacon and minimap come from the shared island kit.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadTalkData() {
  if (!promise) {
    promise = fetch('talk.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`talk.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[talk] talk.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createTalkIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 71110007,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, obstacles, tree, bench, flowers, lamp, bush, bunting, fence, shade, rand }) {
      const yard = data.courtyard;
      const stone = 0xe2d9bd;
      const warm = 0xf0a860;

      // ---- the ring ------------------------------------------------------------------
      // The call is the island, so the island has a middle: a paved circle you walk into
      // and a lantern you can see from the water.
      for (let i = 0; i < 40; i += 1) {
        const a = (i / 40) * Math.PI * 2;
        D(yard.x + Math.cos(a) * 10.4, 0.16, yard.z + Math.sin(a) * 10.4, 1.8, 0.22, 1.8, shade(stone, -0.1));
        D(yard.x + Math.cos(a) * 8.6, 0.22, yard.z + Math.sin(a) * 8.6, 1.7, 0.2, 1.7, stone);
      }
      B(yard.x, 0.2, yard.z, 15, 0.22, 15, shade(stone, 0.05));
      B(yard.x, 0.3, yard.z, 12.4, 0.16, 12.4, stone);
      // A compass of four colours, one per booth, so the ring points at all of them.
      for (const def of data.spots) {
        const a = Math.atan2(def.z - yard.z, def.x - yard.x);
        D(yard.x + Math.cos(a) * 5, 0.4, yard.z + Math.sin(a) * 5, 2.4, 0.14, 2.4, Number(def.color));
      }

      // The lantern in the middle: stone base, timber frame, a light that stays on.
      D(yard.x, 0.6, yard.z, 3.4, 0.8, 3.4, shade(stone, -0.14));
      D(yard.x, 1.1, yard.z, 2.6, 0.4, 2.6, stone);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) D(yard.x + sx * 1.1, 3, yard.z + sz * 1.1, 0.34, 4, 0.34, 0x8a6f4a);
      D(yard.x, 2.9, yard.z, 2.2, 2.6, 2.2, 0xfff0c4, 1.5);
      D(yard.x, 4.4, yard.z, 3.4, 0.5, 3.4, 0x8a6f4a);
      for (let i = 0; i < 4; i += 1) D(yard.x, 4.8 + i * 0.42, yard.z, 3 - i * 0.7, 0.42, 3 - i * 0.7, i % 2 ? warm : shade(warm, -0.12));
      D(yard.x, 6.7, yard.z, 0.4, 1.1, 0.4, warm, 0.8);
      obstacles.push({ x: yard.x, z: yard.z, w: 1.9, d: 1.9 });
      sprite('おはなし島 · みんなで 話そう', yard.x, 8.4, yard.z, { width: 12, size: 30 });

      // Benches facing the lantern, because that is what a ring of people is.
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        bench(yard.x + Math.cos(a) * 6.6, yard.z + Math.sin(a) * 6.6, a + Math.PI / 2);
      }
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        flowers(yard.x + Math.cos(a) * 12.4, yard.z + Math.sin(a) * 12.4, [0xef8fa0, 0xf7d774, 0xdfe4ef][i % 3]);
      }
      bunting(yard.x - 9, yard.z + 9, yard.x + 9, yard.z + 9, 4.4);
      bunting(yard.x - 9, yard.z - 9, yard.x + 9, yard.z - 9, 4.4);
      for (const sx of [-11, 11]) { lamp(yard.x + sx, yard.z); obstacles.push({ x: yard.x + sx, z: yard.z, w: 0.3, d: 0.3 }); }

      // ---- the four booths -------------------------------------------------------------
      for (const def of data.spots) {
        const colour = Number(def.color);
        house(def.x, def.z - 4.6, 7.6, 6, colour, 0xc2703f, `${def.tone} ${def.name}`);
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, shade(stone, -0.04));
        B(def.x, 0.28, def.z, 5, 0.14, 5, stone);
        // Two chairs outside each booth, facing each other: what the booth is for, in
        // furniture, before a child has read the sign.
        const side = def.z - 4.6;
        const out = Math.sign(def.x) || 1;
        for (const [cx, cz, face] of [[-6.4, 0.9, 1], [-6.4, -0.9, -1]]) {
          const bx = def.x + out * cx;
          D(bx, 0.45, side + cz, 1, 0.9, 1, shade(colour, -0.15));
          D(bx, 1.1, side + cz - face * 0.44, 1.1, 1.1, 0.24, colour);
        }
        D(def.x + out * 6.4, 0.5, side, 1.4, 1, 1.4, shade(stone, 0.06));
        obstacles.push({ x: def.x + out * 6.4, z: side, w: 1.2, d: 1.4 });
        resident(def);
      }

      // ---- the shore ---------------------------------------------------------------------
      // A sunset island: warm trees, a jetty of lanterns down to the water, quiet edges.
      for (let i = 0; i < 9; i += 1) {
        const z = 12 + i * 1.6;
        if (i % 3 === 0) { for (const sx of [-3.2, 3.2]) { D(sx, 1.4, z, 0.26, 2.8, 0.26, 0x8a6f4a); D(sx, 3, z, 0.7, 0.6, 0.7, 0xfff0c4, 1.2); } }
      }
      for (let i = 0; i < 14; i += 1) {
        const a = rand() * Math.PI * 2;
        const r = 19 + rand() * 6;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * 0.82;
        if (Math.abs(x) < 6 && z > 6) continue;
        tree(x, z, 0.85 + rand() * 0.5, 0);
      }
      for (let i = 0; i < 12; i += 1) {
        const x = (rand() - 0.5) * 44;
        const z = -24 + rand() * 5;
        if (Math.abs(x) > 7) bush(x, z, 0.8 + rand() * 0.5);
      }
      fence(0, 23.5, 9, 'x');
      scatter(data, 70);
    },
  });

  return Object.assign(island, {
    ready: loadTalkData().then((d) => { island.receive(d.island); return d; }),
  });
}
