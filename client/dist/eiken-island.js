// 英検の島（5級・4級・3級）— three islands, one layout, four halls each.
//
// The layout is the same on all three on purpose: a child who has learned where 読む
// stands on 5級 knows where it stands on 3級, so climbing a grade is about the English
// and nothing else. What changes is everything you can see — the light, the stone, the
// trees, the thing on the skyline — because an island a child wants to be on is an island
// they come back to.
//
// Terrain, dock, collision, doorways, beacon and minimap all come from the shared island
// kit; this file is the architecture. Everything here is drawn from `theme` in
// eiken.json, so the three islands are one builder run three times.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadEikenData() {
  if (!promise) {
    promise = fetch('eiken.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`eiken.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[eiken] eiken.json failed to load', err); return { islands: [] }; });
  }
  return promise;
}

// Two colours, part of the way between. The island kit can lighten and darken a colour;
// what the courtyard needs is a colour taken most of the way towards the stone, so its
// four quarters read as inlaid tiles and not as four tins of paint.
const mix = (a, b, k) => {
  const ar = (a >> 16) & 255; const ag = (a >> 8) & 255; const ab = a & 255;
  const br = (b >> 16) & 255; const bg = (b >> 8) & 255; const bb = b & 255;
  const to = (x, y) => Math.round(x + (y - x) * k) & 255;
  return (to(ar, br) << 16) | (to(ag, bg) << 8) | to(ab, bb);
};

// The numerals, drawn as blocks on a seven-segment frame: a 5 that reads as a 5 from the
// water, without a font or a texture.
const DIGITS = {
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
};

export function createEikenIsland({ scene, id }) {
  const island = createIsland({
    scene,
    seed: 19850000 + id.length * 7919,
    build(kit) {
      const { island: data, B, D, sprite, house, path, resident, door, scatter, obstacles, tree, bench, flowers, lamp, rock, fence, bunting, shade, rand } = kit;
      const t = data.theme || {};
      const yard = data.courtyard;
      const halls = Object.fromEntries(data.spots.map((s) => [s.skill, s]));

      // ---- the avenue -----------------------------------------------------------------
      // One straight walk from the dock to the fork, so a child arriving sees all four
      // halls without being told where to go. Everything else is built beside it.
      B(0, 0.1, 6, 5.4, 0.18, 26, shade(t.stone, -0.06));
      B(0, 0.2, 6, 4.2, 0.16, 25, t.stone);
      for (let z = 17; z > -6; z -= 3.2) {
        B(0, 0.29, z, 3.4, 0.1, 1.9, shade(t.stone, 0.08));
      }
      for (const z of [13.6, 6.4, 0.8]) {
        for (const sx of [-3.4, 3.4]) {
          D(sx, 1.5, z, 0.3, 3, 0.3, t.beam);
          D(sx, 3.2, z, 0.75, 0.7, 0.75, t.lamp, 1.35);
          D(sx, 3.62, z, 0.95, 0.18, 0.95, t.beam);
          obstacles.push({ x: sx, z, w: 0.3, d: 0.3 });
        }
      }

      // ---- the gate -------------------------------------------------------------------
      // The grade, in numerals you can read from the dock, on an arch you walk under.
      const gz = 16;
      for (const sx of [-4.6, 4.6]) {
        D(sx, 0.5, gz, 2.2, 1, 2.2, shade(t.stone, -0.12));
        D(sx, 3.4, gz, 1.5, 6.8, 1.5, t.stone);
        D(sx, 7, gz, 2, 0.5, 2, shade(t.stone, -0.1));
        D(sx, 7.4, gz, 1.1, 0.5, 1.1, t.accent, 0.8);
        obstacles.push({ x: sx, z: gz, w: 1.1, d: 1.1 });
      }
      D(0, 7.1, gz, 10.4, 1.1, 1.4, t.stone);
      D(0, 7.85, gz, 11, 0.5, 1.8, shade(t.stone, -0.12));
      const digit = DIGITS[data.badge?.[0]] || DIGITS[5];
      digit.forEach((row, ry) => {
        [...row].forEach((cell, rx) => {
          if (cell !== '#') return;
          D(-1.1 + rx * 1.1, 12.3 - ry * 1.1, gz, 1, 1, 0.9, t.accent, 1.1);
        });
      });
      D(2.6, 10.1, gz, 1.6, 1.6, 0.8, t.accent, 0.6);          // 級, as a seal beside it
      D(0, 8.6, gz, 12, 0.4, 0.5, t.beam);
      D(0, 14.4, gz, 4.4, 0.5, 1.2, t.roof);
      sprite(`${data.badge} ${data.name}`, 0, 16.4, gz, { width: 13, size: 34 });

      // ---- the courtyard --------------------------------------------------------------
      // Four quarters, one per skill, in the colours of the four halls: the island tells
      // a child what it is for before anybody says a word.
      B(yard.x, 0.14, yard.z, 17, 0.2, 12, shade(t.stone, -0.08));
      B(yard.x, 0.26, yard.z, 15.4, 0.16, 10.6, t.stone);
      const quarters = [
        [-4.1, -2.6, 'reading'], [4.1, -2.6, 'listening'],
        [-4.1, 2.6, 'writing'], [4.1, 2.6, 'speaking'],
      ];
      for (const [qx, qz, skill] of quarters) {
        const tile = mix(Number(halls[skill].color), t.stone, 0.58);
        B(yard.x + qx, 0.35, yard.z + qz, 6.4, 0.12, 4.4, shade(tile, -0.08));
        B(yard.x + qx, 0.42, yard.z + qz, 5.4, 0.1, 3.4, tile);
        // A stripe of the hall's own colour along the edge that points at it, so the
        // quarter says which hall it belongs to without shouting it.
        B(yard.x + qx, 0.46, yard.z + qz + Math.sign(qz) * 1.9, 5.4, 0.1, 0.5, Number(halls[skill].color));
      }
      // The compass in the middle, pointing four ways at four halls.
      D(yard.x, 0.5, yard.z, 3.4, 0.3, 3.4, shade(t.stone, 0.14));
      D(yard.x, 0.72, yard.z, 1.2, 0.5, 1.2, t.accent, 0.5);
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        D(yard.x + ax * 1.9, 0.62, yard.z + az * 1.9, ax ? 1.6 : 0.5, 0.24, az ? 1.6 : 0.5, shade(t.accent, -0.2));
      }
      for (const sx of [-8.6, 8.6]) {
        bench(yard.x + sx, yard.z - 1.4, 0);
        flowers(yard.x + sx, yard.z + 3.4, t.blossom);
      }
      bunting(yard.x - 7.6, yard.z - 5.4, yard.x + 7.6, yard.z - 5.4, 4.6);

      // ---- the four halls -------------------------------------------------------------
      for (const def of data.spots) {
        const colour = Number(def.color);
        const wide = def.skill === 'speaking' || def.skill === 'listening';
        house(def.x, def.z - 4.6, wide ? 10 : 8.6, 6.4, colour, t.roof, `${def.tone} ${def.name}`);
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6.6, 0.16, 6.6, shade(t.stone, 0.05));
        B(def.x, 0.28, def.z, 5.4, 0.14, 5.4, t.stone);
        dressHall(kit, t, def);
        resident(def);
      }

      // The back plaza, between the four halls: the island's own quiet corner.
      backPlaza(kit, t, data);

      // ---- what this island is, and nowhere else ---------------------------------------
      if (t.key === 'starter') buildStarter(kit, t, data);
      else if (t.key === 'learner') buildLearner(kit, t, data);
      else buildVoyager(kit, t, data);

      // Trees last, so they fill whatever the architecture left.
      scatter(data, 80);
      for (let i = 0; i < 7; i += 1) {
        const x = (rand() - 0.5) * 46;
        const z = -24 + rand() * 4;
        if (Math.abs(x) < 6) continue;
        tree(x, z, 0.8 + rand() * 0.5, t.key === 'voyager' ? 1 : -1);
      }
      fence(0, 23.5, 9, 'x');
      for (const sx of [-19, 19]) { rock(sx, 19, 1.1); rock(sx + 2.4, 20.4, 0.7); }
    },
  });

  return Object.assign(island, {
    ready: loadEikenData().then((d) => {
      const mine = (d.islands || []).find((i) => i.id === id) || null;
      island.receive(mine);
      return mine;
    }),
  });
}

// Between the four halls, where a child walking from 読む to 話す passes through. One
// shape per island, built out of the same three ideas: water, lamplight, and the sky.
function backPlaza({ D, B, obstacles, shade, rand }, t, data) {
  // Far enough back that the two lanes to 書く and 話す run in front of it, not through
  // it: everything here is built inside a box the paths never enter.
  const z = -11.5;
  B(0, 0.12, z, 11.6, 0.18, 8, shade(t.stone, -0.08));
  B(0, 0.24, z, 10.2, 0.14, 6.8, t.stone);
  if (t.key === 'starter') {
    // A paddling pool with buckets round it, and stepping stones across.
    B(0, 0.3, z, 7.6, 0.16, 5.2, shade(t.water, 0.15));
    D(0, 0.38, z, 6.6, 0.12, 4.2, t.water, 0.25);
    for (let i = 0; i < 5; i += 1) D(-2.6 + i * 1.3, 0.5, z, 0.9, 0.24, 0.9, shade(t.stone, 0.12));
    for (const [bx, bz, c] of [[-4.4, -2.9, 0xef6f6c], [4.4, -2.9, 0x6fb7d9], [-4.4, 2.9, 0xf7d774], [4.4, 2.9, 0x8ac96f]]) {
      D(bx, 0.55, z + bz, 1.1, 1.1, 1.1, c);
      D(bx, 1.15, z + bz, 1.2, 0.16, 1.2, shade(c, -0.2));
    }
  } else if (t.key === 'learner') {
    // A study pavilion: four posts, a lamp, and a table with a book left open on it.
    for (const sx of [-3.4, 3.4]) for (const sz of [-2.6, 2.6]) {
      D(sx, 2.1, z + sz, 0.45, 4.2, 0.45, t.beam);
      obstacles.push({ x: sx, z: z + sz, w: 0.4, d: 0.4 });
    }
    for (let i = 0; i < 4; i += 1) D(0, 4.3 + i * 0.45, z, 8.8 - i * 1.7, 0.45, 7.2 - i * 1.4, i % 2 ? t.roof : shade(t.roof, -0.1));
    D(0, 6.3, z, 0.5, 1, 0.5, t.accent, 0.9);
    D(0, 3.9, z, 1.1, 0.9, 1.1, t.lamp, 1.3);
    D(0, 0.9, z, 3.4, 0.3, 2.2, shade(t.beam, 0.15));
    D(0, 0.5, z, 0.6, 0.8, 0.6, t.beam);
    D(-0.7, 1.1, z, 1.5, 0.16, 1.7, 0xf5efdd);
    D(0.7, 1.1, z, 1.5, 0.16, 1.7, 0xfffaf0);
    obstacles.push({ x: 0, z, w: 1.8, d: 1.2 });
  } else {
    // A star map, cut into the stone, with an orrery turning above it.
    B(0, 0.34, z, 8.4, 0.14, 6.4, shade(t.stone, -0.2));
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      D(Math.cos(a) * 3.2, 0.44, z + Math.sin(a) * 2.4, 0.5, 0.12, 0.5, t.accent, 0.9);
    }
    D(0, 1, z, 1.2, 1.6, 1.2, shade(t.stone, 0.1));
    D(0, 2.1, z, 1.6, 0.5, 1.6, t.beam);
    D(0, 3, z, 1.1, 1.1, 1.1, t.accent, 1.4);
    for (const [ox, oz, r] of [[2.1, 0, 0.5], [-1.6, 1.4, 0.42], [0.4, -2, 0.36]]) {
      D(ox, 3, z + oz, r, r, r, t.blossom, 1);
      D(ox * 0.5, 3, z + oz * 0.5, 0.14, 0.14, 0.14, t.accent, 0.8);
    }
    obstacles.push({ x: 0, z, w: 1.1, d: 1.1 });
  }
}

// ---- the halls -------------------------------------------------------------------------

// What stands outside each hall. A child should be able to tell 話す from 書く across the
// island, in the dark, at four frames a second on a classroom iPad.
function dressHall({ D, B, obstacles, shade }, t, def) {
  const x = def.x;
  const z = def.z;
  const colour = Number(def.color);
  // Everything stands beside the building, level with its middle, never in front of it:
  // the ground in front is the ground a child walks in on, and a plinth there is a wall
  // they cannot see. `out` is the side away from the avenue.
  const side = z - 4.6;
  const out = Math.sign(x) || 1;
  if (def.skill === 'reading') {
    // An open book on a plinth either side, and a stack of them laid on the roof.
    for (const sx of [-6.5, 6.5]) {
      D(x + sx, 0.6, side, 3, 1.2, 2.4, shade(t.stone, -0.05));
      D(x + sx, 1.5, side, 2.6, 0.7, 2, 0xf5efdd);
      D(x + sx + 0.8, 1.75, side, 1.2, 0.4, 1.9, 0xfffaf0);
      D(x + sx - 0.8, 1.75, side, 1.2, 0.4, 1.9, 0xfffaf0);
      D(x + sx, 1.95, side, 0.28, 0.5, 2.1, shade(colour, -0.2));
      obstacles.push({ x: x + sx, z: side, w: 1.5, d: 1.2 });
    }
    for (let i = 0; i < 4; i += 1) D(x + out * 6.5, 2.4 + i * 0.42, side + 2.6, 2.6 - i * 0.22, 0.4, 2 - i * 0.18, i % 2 ? shade(colour, 0.1) : 0xf0e6cc);
    D(x, 6.6, side, 5.4, 0.4, 3.4, shade(colour, -0.25));          // a book laid on the roof
    D(x - 1.4, 7, side, 2.4, 0.5, 3, 0xfaf3e2);
    D(x + 1.4, 7, side, 2.4, 0.5, 3, 0xfaf3e2);
    D(x, 7.15, side, 0.3, 0.6, 3.2, shade(colour, -0.3));
  } else if (def.skill === 'listening') {
    // Speaker stacks either side, and notes rising out of the roof.
    for (const sx of [-7, 7]) {
      D(x + sx, 1.6, side, 1.8, 3.2, 1.5, shade(t.beam, -0.1));
      D(x + sx, 2.5, side + 0.75, 1.2, 1.1, 0.2, shade(colour, 0.25));
      D(x + sx, 1.3, side + 0.75, 1.3, 1.3, 0.2, 0xe8e2d0);
      D(x + sx, 3.45, side, 2.1, 0.3, 1.8, t.accent, 0.5);
      obstacles.push({ x: x + sx, z: side, w: 1, d: 0.9 });
    }
    for (const [nx, ny] of [[-1.8, 7.4], [0.6, 8.4], [2.4, 7.6]]) {
      D(x + nx, ny, side, 0.9, 0.9, 0.6, t.accent, 0.9);
      D(x + nx + 0.5, ny + 0.9, side, 0.24, 1.5, 0.4, t.accent, 0.9);
    }
    D(x, 6.5, side, 3.4, 0.5, 3.4, shade(colour, -0.2));
  } else if (def.skill === 'writing') {
    // A pencil the size of a mast on one side, an inkwell on the other, and paper pegged
    // out to dry along the roof.
    const px = x - out * 6.8;
    D(px, 3.4, side, 0.9, 6.4, 0.9, 0xf0c05a);
    D(px, 6.9, side, 0.95, 0.7, 0.95, 0xe8a8a0);
    D(px, 0.5, side, 1.3, 1, 1.3, shade(t.stone, -0.1));
    D(px, 7.5, side, 0.5, 0.5, 0.5, 0x3d4a44);                     // the graphite tip
    obstacles.push({ x: px, z: side, w: 0.8, d: 0.8 });
    const ix = x + out * 6.8;
    D(ix, 0.75, side, 2.4, 1.5, 2.4, shade(colour, -0.25));
    D(ix, 1.6, side, 2, 0.4, 2, 0x2f3a44, 0.3);                    // ink
    obstacles.push({ x: ix, z: side, w: 1.3, d: 1.3 });
    for (let i = 0; i < 4; i += 1) D(x - 3 + i * 2, 6.2, side + 2.4, 1.4, 1.8, 0.1, 0xfaf3e2);
    D(x, 7.2, side + 2.4, 9, 0.08, 0.08, t.beam);
    D(x, 6.8, side, 4.2, 0.4, 2.6, shade(colour, -0.2));
  } else {
    // A stage, out on the seaward side: steps up, a canopy, spotlights, and a microphone
    // waiting on its stand for whoever walks out of the hall.
    const sx = x + out * 8.6;
    B(sx, 0.45, side, 6.4, 0.5, 7.4, shade(t.beam, 0.1));
    B(sx, 0.72, side, 5.8, 0.2, 6.8, shade(colour, 0.3));
    for (const sz of [-3, 3]) {
      D(sx, 2.6, side + sz, 0.45, 4, 0.45, t.beam);
      D(sx, 4.8, side + sz, 0.9, 0.6, 0.9, t.accent, 0.7);
      obstacles.push({ x: sx, z: side + sz, w: 0.4, d: 0.4 });
    }
    D(sx, 4.8, side, 6.6, 0.4, 7.6, shade(colour, -0.15));
    for (let i = 0; i < 5; i += 1) D(sx, 4.45, side - 3.4 + i * 1.7, 0.5, 0.5, 1.4, i % 2 ? t.accent : shade(colour, 0.2));
    D(sx, 1.55, side, 0.22, 1.4, 0.22, 0x3d4a44);
    D(sx, 2.35, side, 0.5, 0.42, 0.5, 0xd8d2c4, 0.4);              // the microphone
    for (const sz of [-2, 2]) D(sx - out * 2.8, 4.55, side + sz, 0.6, 0.6, 0.6, 0xfff2c8, 1.2);
    D(x, 6.6, side, 4.6, 0.5, 3.2, shade(colour, -0.2));
  }
}

// ---- 5級: はじまりの島 ---------------------------------------------------------------

// Bright, low, and full of the alphabet. Everything here is the first thing: the first
// letters, the first colours, a rainbow you can walk under.
function buildStarter({ D, B, sprite, obstacles, tree, flowers, bush, shade, rand }, t, data) {
  // The rainbow over the avenue, wide enough that the walk goes under the middle of it.
  const bands = [0xef6f6c, 0xf2a65a, 0xf7d774, 0x8ac96f, 0x6fb7d9, 0x9b8fd6];
  bands.forEach((colour, i) => {
    const r = 11 - i * 1.15;
    for (let a = 12; a <= 168; a += 6) {
      const rad = (a * Math.PI) / 180;
      D(Math.cos(rad) * r, Math.sin(rad) * r + 0.4, 2, 1.4, 1.2, 1.4, colour, 0.35);
    }
  });
  // ABC blocks, stacked the way a child stacks them: not quite straight.
  const letters = [
    ['A', 0xef6f6c], ['B', 0x6fb7d9], ['C', 0xf7d774], ['D', 0x8ac96f], ['E', 0xf2a65a],
  ];
  letters.forEach(([letter, colour], i) => {
    const bx = 7.5 + (i % 2) * 2.4;
    const by = 1.1 + Math.floor(i / 2) * 2.2;
    const bz = 0 + (i % 3) * 2.2 - 2.2;
    D(bx, by, bz, 2, 2, 2, colour);
    D(bx, by, bz + 1.05, 1.4, 1.4, 0.12, 0xfffaf0);
    sprite(letter, bx, by, bz + 1.25, { width: 1.5, size: 90, background: '#ffffff00', color: '#2f3a44' });
    obstacles.push({ x: bx, z: bz, w: 1.1, d: 1.1 });
  });
  // A kite, tied to a post, because the wind is always up on this island.
  D(-7.5, 1.6, 0, 0.3, 3.2, 0.3, t.beam);
  obstacles.push({ x: -7.5, z: 0, w: 0.4, d: 0.4 });
  for (let i = 0; i < 7; i += 1) D(-7.5 - i * 0.8, 3.6 + i * 1.1, 0.3 + i * 0.35, 0.16, 0.16, 0.16, 0xf5efdd);
  D(-13.2, 11.2, 2.4, 2.4, 2.4, 0.3, 0xef6f6c, 0.5);
  D(-13.2, 11.2, 2.4, 1, 3.4, 0.34, 0xf7d774, 0.5);
  for (let i = 0; i < 4; i += 1) D(-13.2 - 0.4 - i * 0.5, 10.1 - i * 0.9, 2.4, 0.5, 0.5, 0.22, [0x6fb7d9, 0x8ac96f, 0xef6f6c, 0xf7d774][i], 0.5);
  // Sunflowers along the shore, and a sandcastle on the beach by the dock.
  for (let i = 0; i < 26; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 20 + rand() * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.82;
    if (Math.abs(x) < 6 && z > 6) continue;
    D(x, 1.2, z, 0.18, 2.4, 0.18, 0x5f8a4a);
    D(x, 2.5, z, 1, 1, 0.5, 0xf7d774, 0.25);
    D(x, 2.5, z + 0.26, 0.5, 0.5, 0.2, 0x8a6a3a);
  }
  for (const [cx, cz, s] of [[10, 20, 1], [11.6, 21.4, 0.7]]) {
    D(cx, 0.6 * s, cz, 3 * s, 1.2 * s, 3 * s, 0xe6d7ae);
    D(cx, 1.5 * s, cz, 2 * s, 0.8 * s, 2 * s, 0xefe2be);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D(cx + sx * 1.2 * s, 1.5 * s, cz + sz * 1.2 * s, 0.7 * s, 1.6 * s, 0.7 * s, 0xefe2be);
  }
  for (let i = 0; i < 10; i += 1) { const x = (rand() - 0.5) * 40; const z = -20 + rand() * 6; if (Math.abs(x) > 6) { bush(x, z, 0.9); flowers(x + 1.4, z + 1, [0xef6f6c, 0xf7d774, 0xdfe4ef][i % 3]); } }
  for (const sx of [-22, 22]) tree(sx, 6, 1.25, 0);
}

// ---- 4級: まなびの島 -----------------------------------------------------------------

// Brick, bronze and autumn. The island of the second year: a clock that counts your
// study, a tower of books, lamps for the evenings you stay late.
function buildLearner({ D, B, sprite, obstacles, tree, bench, shade, rand }, t, data) {
  // The clock tower, east of the avenue.
  const cx = 8.4;
  const cz = 0;
  D(cx, 0.7, cz, 6.4, 1.4, 6.4, shade(t.stone, -0.12));
  D(cx, 1.5, cz, 5.4, 0.4, 5.4, t.stone);
  for (let i = 0; i < 5; i += 1) D(cx, 3 + i * 2.4, cz, 4.6 - i * 0.18, 2.4, 4.6 - i * 0.18, i % 2 ? shade(t.roof, -0.1) : shade(t.roof, 0.06));
  for (const sx of [-2.2, 2.2]) for (const sz of [-2.2, 2.2]) D(cx + sx, 8, cz + sz, 0.5, 11, 0.5, t.beam);
  D(cx, 14, cz, 5.6, 0.6, 5.6, t.beam);
  for (let i = 0; i < 4; i += 1) D(cx, 14.6 + i * 0.6, cz, 5.2 - i * 1.2, 0.6, 5.2 - i * 1.2, i % 2 ? t.roof : shade(t.roof, -0.12));
  D(cx, 17.4, cz, 0.5, 1.8, 0.5, t.accent, 0.9);
  // The face, looking down the avenue.
  D(cx - 2.35, 11.4, cz, 0.3, 3.4, 3.4, 0xf5efdd, 0.25);
  D(cx - 2.5, 11.4, cz, 0.16, 3.9, 3.9, t.beam);
  D(cx - 2.55, 11.4, cz + 0.1, 0.12, 0.24, 1.3, 0x3d4a44);
  D(cx - 2.55, 11.9, cz, 0.12, 1, 0.2, 0x3d4a44);
  D(cx, 9.4, cz, 3.2, 1.6, 3.2, t.accent, 0.6);                 // the bell, lit at night
  obstacles.push({ x: cx, z: cz, w: 3.2, d: 3.2 });
  // The book tower: a spiral of open books climbing a post, west of the avenue.
  const bx = -8.4;
  D(bx, 0.6, 0, 4.4, 1.2, 4.4, shade(t.stone, -0.08));
  D(bx, 4, 0, 0.7, 7, 0.7, t.beam);
  for (let i = 0; i < 9; i += 1) {
    const a = (i * Math.PI) / 3.5;
    const r = 1.5 + (i % 3) * 0.35;
    D(bx + Math.cos(a) * r, 1.5 + i * 0.75, Math.sin(a) * r, 2.2, 0.36, 1.7, i % 2 ? 0xf0e6cc : shade(t.roof, 0.15));
    D(bx + Math.cos(a) * r, 1.72 + i * 0.75, Math.sin(a) * r, 1.8, 0.16, 1.4, 0xfffaf0);
  }
  D(bx, 8.4, 0, 2.6, 0.5, 2, t.accent, 0.7);
  obstacles.push({ x: bx, z: 0, w: 2.3, d: 2.3 });
  // Maples down the long edges, and reading benches under them.
  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (20 + rand() * 5);
    const z = -18 + i * 2.4 + rand() * 2;
    if (Math.abs(z) > 22) continue;
    D(x, 1.7, z, 0.55, 3.4, 0.55, 0x7a5a3a);
    D(x, 3.7, z, 3.2, 1.5, 3.2, i % 3 ? 0xd9873f : 0xc2612f);
    D(x, 4.7, z, 2.2, 1, 2.2, 0xe8a44a);
    for (let j = 0; j < 3; j += 1) D(x + (rand() - 0.5) * 3, 0.2, z + (rand() - 0.5) * 3, 0.7, 0.1, 0.7, 0xc2612f);
  }
  for (const [sx, sz] of [[-13, 8], [13, 8]]) bench(sx, sz, 0);
  // A low stone wall along the back, where the island looks out to sea.
  for (let x = -14; x <= 14; x += 2) D(x, 0.8, -23, 1.9, 1.6, 1.2, shade(t.stone, -0.05));
  for (let x = -13; x <= 13; x += 4) D(x, 1.75, -23, 1.1, 0.4, 1.5, t.stone);
}

// ---- 3級: たびだちの島 ---------------------------------------------------------------

// Stone, glass and twilight. The island you leave from: a lighthouse for the crossing, an
// observatory for what is beyond it, and light that behaves like the small hours.
function buildVoyager({ D, B, sprite, obstacles, tree, rock, shade, rand }, t, data) {
  // The lighthouse, east of the avenue, with a lamp that burns at night.
  const lx = 8.6;
  const lz = 0;
  D(lx, 0.8, lz, 7, 1.6, 7, shade(t.stone, -0.15));
  D(lx, 1.7, lz, 6, 0.4, 6, t.stone);
  for (let i = 0; i < 8; i += 1) {
    const w = 4.6 - i * 0.35;
    D(lx, 2.6 + i * 1.9, lz, w, 1.9, w, i % 2 ? 0xf0f2f4 : shade(t.roof, 0.1));
  }
  D(lx, 18.2, lz, 4.6, 0.5, 4.6, t.beam);
  D(lx, 19.6, lz, 3.4, 2.4, 3.4, t.accent, 1.4);                 // the lamp room
  D(lx, 21.1, lz, 4.2, 0.6, 4.2, t.beam);
  for (let i = 0; i < 3; i += 1) D(lx, 21.7 + i * 0.5, lz, 3.4 - i * 0.9, 0.5, 3.4 - i * 0.9, shade(t.roof, -0.1));
  D(lx, 23.4, lz, 0.4, 1.4, 0.4, t.accent, 1);
  // The beam, laid flat over the sea so it reads as light rather than a beam of blocks.
  for (let i = 0; i < 7; i += 1) D(lx + 5 + i * 3.4, 19.6, lz + i * 1.2, 3, 0.4, 1.6 + i * 0.35, t.accent, 0.85);
  obstacles.push({ x: lx, z: lz, w: 3.4, d: 3.4 });
  // The observatory, west: a drum, a dome, and the slit the telescope looks through.
  const ox = -8.6;
  D(ox, 0.5, 0, 8, 1, 8, shade(t.stone, -0.12));
  D(ox, 2.6, 0, 6.4, 3.6, 6.4, t.wall);
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4;
    D(ox + Math.cos(a) * 3.2, 2.6, Math.sin(a) * 3.2, 0.5, 3.8, 0.5, t.beam);
  }
  for (let i = 0; i < 5; i += 1) {
    const w = 6.6 - i * 1.1;
    D(ox, 4.7 + i * 0.8, 0, w, 0.9, w, i % 2 ? shade(t.roof, 0.12) : t.roof);
  }
  D(ox, 8.2, 0, 1.6, 0.8, 1.6, t.accent, 0.9);
  D(ox - 0.1, 6.6, 2.6, 1.2, 3.4, 1.2, 0x1b2733, 0.2);           // the slit
  D(ox - 0.1, 7.2, 3.4, 1, 1, 2.4, shade(t.stone, 0.1));         // the telescope, out of it
  obstacles.push({ x: ox, z: 0, w: 3.6, d: 3.6 });
  // Standing stones with a light in them, in a ring behind the halls.
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const x = Math.cos(a) * 9;
    const z = -22 + Math.sin(a) * 3.4;
    D(x, 1.9, z, 1.1, 3.8, 1.1, shade(t.stone, -0.2));
    D(x, 3.9, z, 0.7, 0.7, 0.7, t.accent, 1.1);
  }
  // A pine wood, dark and vertical, and glassy rocks along the shore.
  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (18 + rand() * 8);
    const z = -20 + i * 2.2 + rand() * 2.4;
    if (Math.abs(z) > 22) continue;
    D(x, 2, z, 0.5, 4, 0.5, 0x4a4032);
    for (let j = 0; j < 4; j += 1) D(x, 3.4 + j * 1.05, z, 3 - j * 0.65, 1.1, 3 - j * 0.65, j % 2 ? 0x35604a : 0x2f5542);
  }
  for (let i = 0; i < 12; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 21 + rand() * 5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.82;
    if (Math.abs(x) < 6 && z > 6) continue;
    D(x, 0.7, z, 1.4, 1.4, 1.4, shade(t.stone, -0.25));
    D(x, 1.5, z, 0.7, 0.9, 0.7, t.accent, 0.8);
  }
}
