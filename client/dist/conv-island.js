// 英会話島 — the island where you just talk.
//
// Every other island here asks a child for an answer. This one asks them for a sentence,
// and the only person listening is ウーピー, who is patient, never marks anything wrong,
// and is on a screen inside each of the four houses.
//
// So the architecture is about talking: two chairs facing each other wherever there is
// room, a bandstand in the middle of the square with nothing on it but a microphone, and
// a lighthouse at the back whose light turns over the whole island — because the last
// house is where a child says what they want to be when they grow up, and that deserves a
// building you can see from the water.
//
// Terrain, dock, collision, doorways, beacon and minimap come from the shared island kit;
// what is here is the town. Coordinates come from conv.json, the same file the server
// judges positions against — a house that moves in one moves in both.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadConvData() {
  if (!promise) {
    promise = fetch('conv.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`conv.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[conv] conv.json failed to load', err); return null; });
  }
  return promise;
}

// The island's own palette: a warm seaside town at the end of the afternoon.
const T = {
  stone: 0xe4d6b4,
  beam: 0x9a7b52,
  roof: 0xd98e6a,
  accent: 0xf5b944,
  lamp: 0xffe0a3,
  water: 0x6fb7d9,
  blossom: 0xf3a6c0,
  glass: 0x9fd8ef,
  sign: 0x2e5d63,
};

// Two chairs and a small table, facing each other. The island is covered in these: a
// child should be able to point at where a conversation would happen.
function talkSeat({ D, obstacles }, x, z, colour, turn = 0) {
  const sx = turn ? 0 : 1;
  const sz = turn ? 1 : 0;
  for (const side of [-1, 1]) {
    const cx = x + sx * side * 1.9;
    const cz = z + sz * side * 1.9;
    D(cx, 0.55, cz, 1.1, 0.24, 1.1, colour);
    D(cx + sx * side * 0.45, 1.15, cz + sz * side * 0.45, sx ? 0.2 : 1.1, 1.2, sz ? 0.2 : 1.1, shadeOf(colour, -0.15));
    for (const lx of [-0.4, 0.4]) for (const lz of [-0.4, 0.4]) D(cx + lx, 0.25, cz + lz, 0.16, 0.5, 0.16, T.beam);
  }
  D(x, 0.62, z, 1.3, 0.2, 1.3, shadeOf(T.beam, 0.25));
  D(x, 0.3, z, 0.4, 0.6, 0.4, T.beam);
  obstacles.push({ x, z, w: 0.6, d: 0.6 });
}

// island-kit exports shade(), but the seat helper above runs before the kit is handed in.
const shadeOf = (hex, amount) => {
  const r = (hex >> 16) & 255; const g = (hex >> 8) & 255; const b = hex & 255;
  const to = (v) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return (to(r) << 16) | (to(g) << 8) | to(b);
};

// A speech bubble, drawn as blocks: the island's own sign, and the thing a child sees
// first from the dock.
function bubble({ D }, x, y, z, colour) {
  D(x, y, z, 6.4, 3.4, 0.9, colour, 0.5);
  D(x, y + 1.9, z, 5.2, 0.6, 0.9, colour, 0.5);
  D(x, y - 1.9, z, 5.2, 0.6, 0.9, colour, 0.5);
  D(x - 1.6, y - 2.4, z, 1.2, 1.2, 0.9, colour, 0.5);
  for (let i = 0; i < 3; i += 1) D(x - 1.6 + i * 1.6, y, z + 0.5, 0.7, 0.7, 0.3, T.sign);
}

export function createConvIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 20260912,
    build(kit) {
      const { island: data, B, D, sprite, house, path, resident, door, scatter, obstacles, tree, bench, flowers, rock, fence, bunting, shade, rand } = kit;
      const yard = data.courtyard;
      const spots = data.spots;
      const spotById = Object.fromEntries(spots.map((s) => [s.id, s]));

      // ---- the promenade ---------------------------------------------------------------
      // One boardwalk from the dock to the square, laid in planks rather than flagstones:
      // this is a seaside town, and it should sound different underfoot.
      B(0, 0.1, 6, 6.2, 0.18, 26, shade(T.beam, 0.35));
      for (let z = 18; z > -6; z -= 1.4) B(0, 0.22, z, 5.4, 0.12, 1.1, z % 2.8 < 1.4 ? shade(T.beam, 0.5) : shade(T.beam, 0.42));
      // Not level with the gate: a lamp beside a gatepost makes one wide obstacle across
      // the way a child walks in, and they end up stuck against it with nothing to show
      // why. The browser walk found this before any child did.
      for (const z of [12.5, 6.5, 0.5]) {
        for (const sx of [-3.6, 3.6]) {
          D(sx, 1.4, z, 0.3, 2.8, 0.3, T.beam);
          D(sx, 3.1, z, 0.8, 0.7, 0.8, T.lamp, 1.5);
          D(sx, 3.5, z, 1, 0.2, 1, T.beam);
          obstacles.push({ x: sx, z, w: 0.3, d: 0.3 });
        }
        // A gull on every other lamp, because a seaside town has gulls.
        if (z === 6.5) { D(3.6, 3.9, z, 0.5, 0.35, 0.7, 0xf6f2e6); D(3.6, 4.05, z + 0.35, 0.2, 0.16, 0.2, 0xf0a44a); }
      }

      // ---- the gate ---------------------------------------------------------------------
      // A speech bubble on an arch: what this island is, in one shape, from the water.
      const gz = 16.5;
      for (const sx of [-6.4, 6.4]) {
        D(sx, 0.5, gz, 2.2, 1, 2.2, shade(T.stone, -0.14));
        D(sx, 3.6, gz, 1.4, 7.2, 1.4, T.stone);
        D(sx, 7.4, gz, 1.9, 0.6, 1.9, shade(T.stone, -0.1));
        obstacles.push({ x: sx, z: gz, w: 1.1, d: 1.1 });
      }
      D(0, 7.5, gz, 14.2, 1.2, 1.4, T.stone);
      D(0, 8.3, gz, 14.8, 0.5, 1.8, shade(T.stone, -0.14));
      bubble(kit, 0, 11.6, gz, 0xfff6e2);
      sprite(`${data.name} · ${data.en}`, 0, 15.4, gz, { width: 15, size: 34 });

      // ---- the square --------------------------------------------------------------------
      // Flat, and deliberately empty in the middle: the two lanes to the front houses run
      // diagonally across it, and anything standing here would be in the way of both.
      // What it has instead is a speech bubble inlaid in the paving, big enough to stand in.
      B(yard.x, 0.14, yard.z, 18, 0.2, 13, shade(T.stone, -0.08));
      B(yard.x, 0.26, yard.z, 16.4, 0.16, 11.4, T.stone);
      for (const [qx, qz] of [[-4.4, -2.8], [4.4, -2.8], [-4.4, 2.8], [4.4, 2.8]]) {
        B(yard.x + qx, 0.34, yard.z + qz, 6.2, 0.12, 4.2, shade(T.stone, 0.07));
      }
      B(yard.x, 0.36, yard.z, 7.4, 0.12, 4.4, 0xfff6e2);
      B(yard.x, 0.4, yard.z, 6.4, 0.1, 3.4, shade(0xfff6e2, -0.06));
      B(yard.x - 2.2, 0.36, yard.z + 3, 1.8, 0.12, 1.8, 0xfff6e2);
      for (let i = 0; i < 3; i += 1) B(yard.x - 1.8 + i * 1.8, 0.44, yard.z, 0.8, 0.1, 0.8, T.sign);
      for (const sx of [-7.4, 7.4]) {
        talkSeat(kit, yard.x + sx, yard.z, 0xe0b587, 1);
        flowers(yard.x + sx, yard.z - 4.6, T.blossom);
      }
      bunting(yard.x - 8, yard.z - 5.8, yard.x + 8, yard.z - 5.8, 4.4);

      // ---- the four houses ----------------------------------------------------------------
      for (const def of spots) {
        const colour = Number(def.color);
        house(def.x, def.z - 4.6, 9.2, 6.4, colour, T.roof, `${def.tone} ${def.name}`);
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6.8, 0.16, 6.8, shade(T.stone, 0.04));
        B(def.x, 0.28, def.z, 5.6, 0.14, 5.6, T.stone);
        // A pair of chairs outside every door, facing each other — but off to the side,
        // away from the island's centre. The front of a house is the way in: a child walks
        // at the door from the square, and anything standing on that line stops them a
        // couple of paces short with no way to tell why. (It did, until the walking e2e
        // caught it: "closest 3.29".)
        talkSeat(kit, def.x + Math.sign(def.x) * 4.8, def.z + 0.6, colour);
        dressHouse(kit, def);
        resident(def);
        // What this house is for, on a board by the door, in Japanese.
        sprite(def.ja, def.x, 2.2, def.z + 3.4, { width: 7.5, size: 30, background: '#2e5d63' });
      }

      // ---- the bandstand -----------------------------------------------------------------
      // Behind the four houses, where no lane runs: a stage with a microphone on it and
      // nothing else, for the child who wants to try a sentence out loud before going in.
      const bz = -11.5;
      B(0, 0.14, bz, 12, 0.2, 8.4, shade(T.stone, -0.08));
      B(0, 0.26, bz, 10.6, 0.16, 7, T.stone);
      D(0, 0.5, bz, 6.4, 0.5, 5.4, shade(T.beam, 0.35));
      for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        D(ax * 2.6, 2.5, bz + az * 2.1, 0.34, 4.2, 0.34, T.beam);
        obstacles.push({ x: ax * 2.6, z: bz + az * 2.1, w: 0.34, d: 0.34 });
      }
      for (let i = 0; i < 4; i += 1) {
        D(0, 4.7 + i * 0.4, bz, 7.6 - i * 1.3, 0.4, 6.6 - i * 1.2, i % 2 ? T.roof : shade(T.roof, -0.08));
      }
      D(0, 6.5, bz, 0.5, 1.1, 0.5, T.accent, 1);
      D(0, 1.1, bz, 0.3, 1.4, 0.3, 0x4a4a4a);
      D(0, 1.95, bz, 0.5, 0.5, 0.5, 0x2f2f2f);
      D(0, 2.25, bz, 0.36, 0.36, 0.36, 0xb9c2c8, 0.4);
      obstacles.push({ x: 0, z: bz, w: 0.6, d: 0.6 });
      for (const sx of [-7.6, 7.6]) bench(sx, bz, 1);

      // ---- the lighthouse ------------------------------------------------------------------
      // Behind the two far houses, where the paths do not run. It is the island's landmark
      // and the reason the last house is called ゆめのとうだい.
      const lx = 0;
      const lz = -22;
      D(lx, 0.6, lz, 7.4, 1.2, 7.4, shade(T.stone, -0.14));
      for (let i = 0; i < 7; i += 1) {
        D(lx, 1.6 + i * 1.9, lz, 4.6 - i * 0.34, 1.9, 4.6 - i * 0.34, i % 2 ? 0xf6f1e4 : 0xe36f5c);
      }
      D(lx, 15.2, lz, 4.6, 0.5, 4.6, shade(T.stone, -0.1));
      D(lx, 16.6, lz, 3.2, 2.4, 3.2, T.glass, 0.6);
      D(lx, 18.1, lz, 4, 0.6, 4, 0xe36f5c);
      D(lx, 19, lz, 0.5, 1.2, 0.5, T.accent, 1.2);
      D(lx, 16.6, lz + 2.2, 1.6, 1.2, 0.6, 0xfff3cf, 2.4);      // the beam, pointing to sea
      obstacles.push({ x: lx, z: lz, w: 3.2, d: 3.2 });
      for (const sx of [-5.4, 5.4]) { rock(lx + sx, lz + 2.6, 1.2); rock(lx + sx * 1.3, lz - 1.4, 0.8); }

      // ---- the rest of the town --------------------------------------------------------------
      // A row of little market stalls along the east edge, and a shelter with benches on
      // the west: places that look like somewhere a conversation already happened.
      for (let i = 0; i < 3; i += 1) {
        const sx = 22;
        const sz = 8 - i * 6.5;
        D(sx, 1.3, sz, 4.6, 0.3, 3.4, [0xe36f5c, 0x6fb7d9, 0xf5c451][i]);
        for (const cx of [-2, 2]) for (const cz of [-1.4, 1.4]) D(sx + cx, 0.65, sz + cz, 0.24, 1.3, 0.24, T.beam);
        D(sx, 0.5, sz, 3.4, 0.9, 2.2, shade(T.beam, 0.3));
        obstacles.push({ x: sx, z: sz, w: 2.4, d: 1.8 });
        flowers(sx - 3.4, sz, T.blossom);
      }
      for (const sz of [4, -4]) { bench(-22, sz, 1); }
      D(-22, 3.4, 0, 7.4, 0.4, 9.4, T.roof);
      for (const sz of [-4.2, 4.2]) { D(-24.6, 1.7, sz, 0.36, 3.4, 0.36, T.beam); D(-19.4, 1.7, sz, 0.36, 3.4, 0.36, T.beam); }
      for (const sz of [-4.2, 4.2]) { obstacles.push({ x: -24.6, z: sz, w: 0.36, d: 0.36 }); obstacles.push({ x: -19.4, z: sz, w: 0.36, d: 0.36 }); }

      // Trees last, filling whatever is left.
      scatter(data, 78);
      for (let i = 0; i < 8; i += 1) {
        const x = (rand() - 0.5) * 44;
        const z = -26 + rand() * 5;
        if (Math.abs(x) < 7) continue;
        tree(x, z, 0.8 + rand() * 0.5, 0);
      }
      fence(0, 23.5, 9, 'x');
      void spotById;
    },
  });

  return Object.assign(island, {
    ready: loadConvData().then((d) => {
      const mine = d?.island || null;
      island.receive(mine);
      return mine;
    }),
  });
}

// What stands beside each house, never in front of it. Four scenes, four things a child
// can point at: a coffee cart, a shop awning, a school bell, a telescope.
function dressHouse({ D, obstacles, shade }, def) {
  const x = def.x;
  const z = def.z - 4.6;      // beside the building, which is set back from its spot
  const side = x < 0 ? -1 : 1;
  const ox = x + side * 7.4;
  if (def.id === 'cafe') {
    D(ox, 1.1, z, 2.6, 1.4, 1.8, 0xd9a066);                       // the cart
    D(ox, 1.95, z, 3, 0.35, 2.2, 0xe36f5c);
    D(ox, 2.6, z, 0.7, 1, 0.7, 0xf6f1e4);                          // the pot
    D(ox, 3.3, z, 0.5, 0.5, 0.5, 0xfff3cf, 1.4);                   // steam, lit
    for (const cx of [-1, 1]) D(ox + cx, 0.4, z + 1.4, 0.5, 0.8, 0.5, 0xf6f1e4);
    obstacles.push({ x: ox, z, w: 1.6, d: 1.2 });
  } else if (def.id === 'market') {
    for (let i = 0; i < 3; i += 1) D(ox, 1.2 + i * 0.5, z - 1.6 + i * 1.6, 3.4, 0.3, 1.2, [0xe36f5c, 0xf5c451, 0x6fb7d9][i]);
    D(ox, 0.6, z, 2.6, 1.2, 4.4, shade(0xd9a066, -0.1));
    obstacles.push({ x: ox, z, w: 1.6, d: 2.4 });
  } else if (def.id === 'school') {
    D(ox, 1.6, z, 0.4, 3.2, 0.4, T.beam);                          // the bell post
    D(ox, 3.4, z, 2.2, 0.3, 0.4, T.beam);
    D(ox + 0.8, 2.9, z, 0.9, 0.9, 0.9, 0xd9b25a);
    obstacles.push({ x: ox, z, w: 0.5, d: 0.5 });
  } else {
    D(ox, 0.7, z, 1.6, 1.4, 1.6, shade(T.stone, -0.1));            // the telescope
    D(ox, 1.9, z, 0.34, 1.4, 0.34, 0x4a4a4a);
    D(ox + 0.5, 2.7, z, 2.2, 0.5, 0.5, 0x2f2f2f);
    D(ox + 1.6, 2.7, z, 0.6, 0.7, 0.7, T.glass, 0.7);
    obstacles.push({ x: ox, z, w: 1, d: 1 });
  }
}
