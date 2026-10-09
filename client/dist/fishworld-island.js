// つり島 — Roblox の釣りワールドの島。三つの小屋が三つのゾーン：★いけ（5級）・★★かわ（4級）・
// ★★★うみ（3級）。小屋の戸口に歩いて入ると、その水辺の問題が出る。
//
// 地形・桟橋・当たり判定・看板・ミニマップ・光の柱は island-kit。ここは水辺と小屋だけ。
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadFishworldData() {
  if (!promise) {
    promise = fetch('fishworld.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`fishworld.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[fishworld] fishworld.json failed to load', err); return { island: null, zones: {}, fish: [] }; });
  }
  return promise;
}

export function createFishworldIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 70707,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles, lamp, barrel, crate }) {
      const yard = data.courtyard;
      // A wooden deck in the middle, like a lakeside jetty, with bunting over it.
      B(yard.x, 0.12, yard.z, 15, 0.15, 11, 0xd6b98a);
      B(yard.x, 0.2, yard.z, 9, 0.14, 6, 0xe3c89c);
      sprite({ en: `${data.en} · pond · river · sea`, ja: `${data.name} · いけ · かわ · うみ` }, yard.x, 4.6, yard.z, { width: 11, size: 30 });
      bunting(yard.x - 7, yard.z + 4.5, yard.x + 7, yard.z + 4.5, 3.4);

      // The landmark: a big fish sign on two posts, a rod leaning on it, a bucket.
      const sx = yard.x + 6.5; const sz = yard.z + 2;
      for (const dx of [-1.3, 1.3]) D(sx + dx, 1.5, sz, 0.16, 3, 0.16, 0x6d543a);
      D(sx, 2.6, sz, 3.2, 1.3, 0.12, 0xf7f1e1);
      D(sx - 0.4, 2.6, sz + 0.08, 1.4, 0.5, 0.06, 0x58a0dc);
      D(sx + 0.7, 2.6, sz + 0.08, 0.5, 0.5, 0.06, 0x58a0dc);
      D(sx + 1.9, 1.6, sz + 0.3, 0.08, 3.2, 0.08, 0x8a6a45);
      D(sx - 1.9, 0.35, sz + 0.5, 0.7, 0.7, 0.7, 0x9fb8c8);
      obstacles.push({ x: sx, z: sz, w: 1.8, d: 0.6 });

      bench(yard.x - 5, yard.z + 3, 0);
      lamp(yard.x - 7.5, yard.z - 1.5);
      barrel(yard.x + 8.4, yard.z - 2.5);
      crate(yard.x - 8.6, yard.z + 1.5);
      flowers(yard.x - 9, yard.z + 12, 0xf0d98a);
      flowers(yard.x + 9, yard.z + 13, 0xe89bb0);

      // The three waters. Flat slabs of water (D with flat=true receives shadows and never
      // casts them), lily pads on the pond, a current on the river, waves on the sea.
      const water = (x, z, w, d, color) => D(x, 0.06, z, w, 0.08, d, color, 0, true);
      // ★ The pond: a rough circle west of the pond hut, frogs and lily pads.
      const px = -21; const pz = 5;
      for (const [dx, dz, w, d] of [[0, 0, 6.5, 5.5], [-1.5, -2.2, 4, 2.6], [1.8, 2.3, 3.6, 2.4], [2.6, -1.4, 2.6, 2.2]]) water(px + dx, pz + dz, w, d, 0x5fa9a0);
      for (const [dx, dz] of [[-1.2, 0.6], [1.4, -0.8], [0.3, 1.9], [-2.2, -1.5]]) D(px + dx, 0.12, pz + dz, 0.7, 0.04, 0.7, 0x5e9a3f);
      D(px - 2.6, 0.3, pz + 2.6, 0.5, 0.5, 0.5, 0x78c882);
      D(px + 3.4, 0.5, pz - 2.6, 0.9, 1, 0.9, 0x8e8a7c);
      obstacles.push({ x: px, z: pz, w: 3.2, d: 2.6 });
      // ★★ The river: a bend behind the river hut, stones along its banks.
      for (let i = 0; i < 9; i += 1) {
        const rx = -12 + i * 3; const rz = -19.2 + Math.sin(i * 0.9) * 0.8;
        water(rx, rz, 3.4, 2.6, 0x58a0dc);
        D(rx, 0.08, rz - 1.5, 2.6, 0.12, 0.5, 0x9ba7a3);
      }
      for (const [rx, rz] of [[-9, -17.2], [-2, -17.5], [6, -17.3], [11, -17.6]]) D(rx, 0.25, rz, 0.6, 0.5, 0.6, 0x8e8a7c);
      // ★★★ The sea: the east edge, three bands of blue and a line of foam, a buoy.
      for (const [dx, w, color] of [[20, 4, 0x4f86b8], [23.5, 3.5, 0x3f6fa3], [26.5, 3, 0x325b8a]]) water(dx, -2, w, 16, color);
      for (let i = 0; i < 5; i += 1) D(18.2, 0.1, -9 + i * 3.5, 0.5, 0.06, 1.6, 0xf3f6f8);
      D(24, 0.5, 3, 0.7, 0.9, 0.7, 0xe0566a);
      D(24, 1.15, 3, 0.1, 0.5, 0.1, 0xf7f1e1);
      obstacles.push({ x: 23.5, z: -2, w: 5.5, d: 8 });

      // The three huts. Each wears its stars and what it is, and a touch of its water.
      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x7a5a3e, { en: `${def.tone} ${def.en || def.name}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        const front = def.z - 1.3;
        // A fishing rod and a bucket by every door; the stars of the zone on a board.
        D(def.x + 3, 1.4, front + 0.6, 0.08, 2.8, 0.08, 0x8a6a45);
        D(def.x - 2.9, 0.4, front + 0.6, 0.7, 0.8, 0.7, 0x9fb8c8);
        D(def.x - 2.9, 0.82, front + 0.6, 0.5, 0.06, 0.5, Number(def.color));
        D(def.x, 2.9, front + 0.25, 2.2, 0.7, 0.08, 0xf7f1e1);
        const stars = def.zone;
        for (let i = 0; i < stars; i += 1) D(def.x - (stars - 1) * 0.35 + i * 0.7, 2.9, front + 0.3, 0.42, 0.42, 0.04, 0xffd246);
        if (def.kind === 'pond') { D(def.x + 2.6, 0.3, front + 1.2, 0.45, 0.4, 0.45, 0x78c882); }
        if (def.kind === 'river') { for (let i = 0; i < 3; i += 1) D(def.x - 2.4 + i * 0.6, 0.12, front + 1.3, 0.4, 0.2, 0.4, 0x9ba7a3); }
        if (def.kind === 'sea') { D(def.x + 2.4, 0.75, front + 1.2, 0.6, 0.6, 0.6, 0xf3ecd8); D(def.x + 2.4, 0.75, front + 1.52, 0.26, 0.26, 0.08, 0x3f6fa3); }
        resident(def);
      }
      scatter(data, 70);
    },
  });

  return Object.assign(island, {
    ready: loadFishworldData().then((d) => { island.receive(d.island); return d; }),
  });
}
