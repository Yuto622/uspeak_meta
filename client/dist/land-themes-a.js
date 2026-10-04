// The first six worlds of じぶんの しま: sand, rock, grass, lake, forest, desert.
//
// Each builder gets the kit (land-kit.js) and the island's `half` width, and fills the
// island as a place: a few set pieces at anchors, more things found by `spot()`, and the
// small life (`scatter`) last, so it never lands on a building. Everything scales with
// `half` — a 28-grid first island and a 60-grid last one are both full.
import * as THREE from './three.module.js';

export const THEMES_A = {
  sand:   { ground: 0xf0dca0, edge: 0xd9bf7e, cliff: 0xb89a62, sky: 0x9fd3ea, water: 0x3b9ab8, foam: 0xd8f0f4, fog: 0xbfe3f0, sun: 0xfff0d0, relief: 0.6, tuft: 0xb9c76a,
    palette: { low: 0xf0dca0, lowMix: 0xe6cf92, mid: 0xead9a2, high: 0xb9c76a, steep: 0xd9bf7e } },
  rock:   { ground: 0x8f8b80, edge: 0x6f6b61, cliff: 0x4f4b45, sky: 0xa6c3d3, water: 0x2d7590, foam: 0xdbeef2, fog: 0xbed0d8, sun: 0xfff4e0, relief: 1.7, tuft: 0x8aa06a,
    palette: { low: 0x9a9388, lowMix: 0x8f8b80, mid: 0x7f9a66, high: 0x9a9a92, steep: 0x6f6b61 } },
  grass:  { ground: 0x8fb36a, edge: 0x6f8f4a, cliff: 0x8a6a45, sky: 0x9fd3ea, water: 0x3b9ab8, foam: 0xd8f0f4, fog: 0xbfe3f0, sun: 0xfff0d0, relief: 1.0, tuft: 0x6fae4a,
    palette: { low: 0xe8d9a8, lowMix: 0xa8c070, mid: 0x8fb36a, high: 0x7faa5a, steep: 0x8a6a45 } },
  lake:   { ground: 0x93b86e, edge: 0x6f8f4a, cliff: 0x7f6244, sky: 0xa8d8ee, water: 0x3f9fc0, foam: 0xdaf0f4, fog: 0xc4e4f0, sun: 0xfff2d8, relief: 0.9, tuft: 0x6fae4a,
    palette: { low: 0xe4d6a6, lowMix: 0x9fc27a, mid: 0x93b86e, high: 0x86b062, steep: 0x7f6244 } },
  forest: { ground: 0x5f8a4a, edge: 0x4a6e3a, cliff: 0x5a4330, sky: 0x8fc3dc, water: 0x2f7f98, foam: 0xcfe6ee, fog: 0xa9d2df, sun: 0xffe8c0, relief: 1.3, tuft: 0x4e8a3f,
    palette: { low: 0xcdb98a, lowMix: 0x6f9a55, mid: 0x5f8a4a, high: 0x4f7a40, steep: 0x5a4330 } },
  desert: { ground: 0xe9c37c, edge: 0xcfa75f, cliff: 0xa8803f, sky: 0xf6dcae, water: 0x3fa8c0, foam: 0xf6ecd0, fog: 0xf0d8b0, sun: 0xffe6a8, relief: 1.1, tuft: 0xb9b06a,
    palette: { low: 0xe9c37c, lowMix: 0xe2b96e, mid: 0xe9c37c, high: 0xd6a85c, steep: 0xb8914e } },
};

export const BUILD_A = {
  sand(K, half) {
    const { B, cone, ball, cyl, disc, palm, campfire, house, boatAt, dolphin, crab, starfish, scatter, spot, tuft, pebble, bird, block, hill, pad, rnd, anim, M, flagpole, bench } = K;
    hill(-half * 0.45, -half * 0.4, half * 0.5, 1.6); hill(half * 0.5, half * 0.3, half * 0.35, 0.9);
    // The camp: a big tent, a small one, the fire, a beach bar with its own palms.
    pad(0, -half * 0.3, 3.4, 3.4);
    cone(0, 1.5, -half * 0.3, 3.0, 3.0, 0xe0566a, 4).rotation.y = Math.PI / 4; cone(0, 2.6, -half * 0.3, 0.7, 1.2, 0xf3ecd8, 4).rotation.y = Math.PI / 4; B(0, 0.6, -half * 0.3 + 2.0, 1.0, 1.2, 0.1, 0x3b2a1a); block(0, -half * 0.3, 2.0, 2.0);
    for (const [px, pz] of [[-2.8, 2.4], [2.8, 2.4], [-2.8, -2.4], [2.8, -2.4]]) cyl(px, 0.1, -half * 0.3 + pz, 0.04, 0.3, 0x6d543a, 4);
    cone(-6, 1.0, -half * 0.3 + 2, 2.0, 2.0, 0x6fd0ff, 4).rotation.y = Math.PI / 4; cone(-6, 1.7, -half * 0.3 + 2, 0.45, 0.8, 0xf3ecd8, 4).rotation.y = Math.PI / 4; block(-6, -half * 0.3 + 2, 1.3, 1.3);
    campfire(5, -half * 0.3 + 3); bench(5, -half * 0.3 + 5.4, 0);
    // The beach bar: thatched roof on posts, a counter, stools, a sign, coconuts.
    const bx = half * 0.45; const bz = half * 0.35; pad(bx, bz, 3.4, 2.6);
    B(bx, 0.15, bz, 6.4, 0.3, 4.6, 0xd9c7a8); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(bx + sx * 2.8, 1.6, bz + sz * 1.9, 0.12, 3.2, 0x8a6a45, 6);
    cone(bx, 3.9, bz, 4.8, 1.6, 0xc9a85a, 4).rotation.y = Math.PI / 4; cone(bx, 4.2, bz, 3.4, 1.2, 0xb9984a, 4).rotation.y = Math.PI / 4;
    B(bx, 0.7, bz + 1.0, 4.4, 1.1, 0.7, 0x8a6a45); B(bx, 1.3, bz + 1.0, 4.6, 0.12, 0.9, 0xd9b45c); for (let i = 0; i < 4; i += 1) { cyl(bx - 1.6 + i * 1.07, 0.4, bz + 2.0, 0.22, 0.8, 0x6d543a, 8); disc(bx - 1.6 + i * 1.07, 0.84, bz + 2.0, 0.3, 0xe0566a); }
    for (let i = 0; i < 5; i += 1) { cyl(bx - 1.8 + i * 0.9, 1.5, bz + 1.0, 0.1, 0.3, [0xffd766, 0xe0566a, 0x6fd0ff, 0xf08a2a, 0x4e9a3f][i], 8); ball(bx - 1.8 + i * 0.9, 1.7, bz + 1.0, 0.09, 0xf3ecd8); }
    B(bx, 2.4, bz + 2.2, 2.4, 0.5, 0.08, 0xf7f1e1); B(bx, 2.4, bz + 2.24, 1.8, 0.1, 0.03, 0xe0566a); block(bx, bz, 3.2, 2.3);
    palm(bx - 4.5, bz + 1, 1); palm(bx + 4.2, bz - 1.5, -1); palm(-half + 4, -half + 5, 1); palm(-half + 6.5, -half + 3.5, -1, 0x4e8a3f); palm(half - 5, -half + 6, -1); palm(-half + 5, half - 6, 1);
    // Parasols and towels along the south beach, a sandcastle, a volleyball net.
    for (let i = 0; i < 3; i += 1) { const ux = -half * 0.6 + i * half * 0.3 + 2; const uz = half * 0.72; cyl(ux, 1.2, uz, 0.05, 2.4, 0x9a8f7a, 6); cone(ux, 2.5, uz, 1.5, 0.5, [0xe0566a, 0xf0c84a, 0x6fd0ff][i], 10); cone(ux, 2.52, uz, 1.0, 0.36, 0xf3ecd8, 10); B(ux + 1.2, 0.03, uz + 0.6, 1.1, 0.05, 2.0, [0x6fd0ff, 0xe0566a, 0xf0c84a][i]); for (let k = 0; k < 4; k += 1) B(ux + 1.2, 0.04, uz - 0.2 + k * 0.5, 1.1, 0.05, 0.2, 0xf3ecd8); }
    const cx = half * 0.2; const cz = half * 0.6; for (let i = 0; i < 4; i += 1) { cyl(cx + Math.cos(i * 1.57) * 0.9, 0.4, cz + Math.sin(i * 1.57) * 0.9, 0.34, 0.8, 0xe3cc8e, 10); cone(cx + Math.cos(i * 1.57) * 0.9, 1.0, cz + Math.sin(i * 1.57) * 0.9, 0.38, 0.5, 0xd9bf7e, 10); } B(cx, 0.35, cz, 1.5, 0.7, 1.5, 0xe3cc8e); B(cx, 0.9, cz, 0.03, 0.6, 0.03, 0x6d543a); B(cx + 0.15, 1.1, cz, 0.3, 0.2, 0.03, 0xe0566a); block(cx, cz, 1.1, 1.1);
    const vx = -half * 0.45; const vz = half * 0.25; for (const sx of [-1, 1]) cyl(vx + sx * 3, 1.1, vz, 0.06, 2.2, 0x9a8f7a, 6); B(vx, 1.7, vz, 6, 0.8, 0.04, 0xf3ecd8, 0, 0.6); B(vx, 2.1, vz, 6, 0.04, 0.04, 0xe0566a); ball(vx + 1, 0.3, vz + 1.5, 0.3, 0xf3ecd8);
    // A hammock between two palms, a treasure chest half dug up, a shipwreck bow off the shore.
    palm(-half * 0.75, 0, 1); palm(-half * 0.75 + 4.4, 0, -1); const hm = B(-half * 0.75 + 2.2, 1.2, 0, 3.2, 0.1, 1.1, 0xf0c84a); hm.rotation.z = 0; B(-half * 0.75 + 2.2, 1.0, 0, 2.8, 0.25, 0.9, 0xe0566a);
    B(half * 0.7, 0.3, -half * 0.1, 1.2, 0.6, 0.8, 0x8a5a3a); B(half * 0.7, 0.7, -half * 0.1 - 0.3, 1.2, 0.25, 0.3, 0x8a5a3a).rotation.x = -0.9; B(half * 0.7, 0.62, -half * 0.1, 0.9, 0.08, 0.5, 0xffd766, 0.6); block(half * 0.7, -half * 0.1, 0.7, 0.5);
    K.lift(() => { const wx = -half - 3; const wz = -half * 0.3; const hull = B(wx, -1.2, wz, 2.4, 2.2, 6.0, 0x6d4a33); hull.rotation.z = 0.5; hull.rotation.y = 0.4; cyl(wx + 0.6, 1.4, wz - 0.5, 0.12, 4.5, 0x5a4330, 6).rotation.z = 0.5; B(wx + 1.6, 2.6, wz - 0.5, 1.6, 1.0, 0.08, 0xd9c7a8).rotation.z = 0.5; });
    boatAt(half + 2.5, half * 0.1, 0.3); dolphin(-half - 6, half * 0.5, 5);
    scatter(Math.round(half * 1.2), (x, z) => starfish(x, z, pick3(rnd)), { rMin: half * 0.55 }); scatter(Math.round(half * 0.8), (x, z) => crab(x, z), { rMin: half * 0.5 });
    scatter(Math.round(half * 1.4), (x, z) => { const s = ball(x, 0.1, z, 0.14, 0xf3ecd8); s.scale.y = 0.6; }); scatter(Math.round(half * 3), (x, z) => pebble(x, z, 0xe6d3a0)); scatter(Math.round(half * 2.5), (x, z) => tuft(x, z), { rMin: half * 0.3 });
    for (let i = 0; i < 4; i += 1) bird(0, 8 + i, 0, half * 0.8 + i, 0xffffff, 0.3 + i * 0.08);
    flagpole(bx + 3.6, bz + 2.6, 0x6fd0ff);
  },
  rock(K, half) {
    const { B, cone, ball, cyl, disc, house, boulder, outcrop, crab, starfish, scatter, spot, tuft, pebble, bird, block, hill, pad, rnd, anim, M, fence, path, lantern, tower, bench, boatAt, dolphin, flagpole } = K;
    hill(-half * 0.45, -half * 0.45, half * 0.5, 3.4); hill(half * 0.4, -half * 0.3, half * 0.3, 1.6); hill(0, half * 0.25, half * 0.3, -0.5);
    // The lighthouse on the high corner: stone foot, striped tower, lamp, a turning beam.
    const lx = -half * 0.45; const lz = -half * 0.45; pad(lx, lz, 2.6, 2.6);
    cyl(lx, 0.3, lz, 2.0, 0.6, 0x7a766c, 14); cyl(lx, 3.9, lz, 1.2, 6.6, 0xf3ecd8, 14, 0, 1, 0.72);
    for (const y of [1.8, 4.0, 6.0]) cyl(lx, y, lz, 1.18 - (y - 0.6) * 0.05, 0.7, 0xe0564a, 14, 0, 1, 0.94);
    cyl(lx, 7.3, lz, 1.15, 0.3, 0x3b3b40, 14); cyl(lx, 7.95, lz, 0.7, 1.0, 0x9fd6e8, 10, 0.5, 0.8); ball(lx, 7.95, lz, 0.36, 0xffe08a, 2.2);
    cone(lx, 8.85, lz, 0.95, 0.8, 0xe0564a, 10); B(lx, 9.4, lz, 0.05, 0.5, 0.05, 0x3b3b40); ball(lx, 9.7, lz, 0.09, 0xffd766, 1);
    const pivot = new THREE.Group(); pivot.position.set(lx, K.H(lx, lz) + 7.95, lz); K.M.mesh && pivot.add((() => { const beam = K.M.mesh('box', 0xffe9a8, 0.9, 0.22); beam.scale.set(7, 0.3, 0.6); beam.position.set(3.5, 0, 0); return beam; })()); K.M.mesh && (K.anim((t) => { pivot.rotation.y = t * 1.1; }), K.group?.add(pivot));
    B(lx + 1.2, 0.95, lz + 1.5, 0.8, 1.6, 0.1, 0x5a3a22); block(lx, lz, 1.8, 1.8);
    // Steps and a path down from it; the keeper's cottage; a bell; a stone wall.
    path(lx, lz + 3, 0, half * 0.1, 0x8a8478); path(0, half * 0.1, 0, half - 2, 0x8a8478);
    house(half * 0.25, -half * 0.15, 4.4, 3.4, 0x9a948a, 0x5a5a66, { roofH: 1.0, chimney: true, trim: 0xd9c7a8 }); fence(half * 0.25 - 4, -half * 0.15 + 3.5, half * 0.25 + 4, -half * 0.15 + 3.5, 0x8a8478);
    cyl(half * 0.1, 1.1, -half * 0.35, 0.08, 2.2, 0x3b3b40, 6); B(half * 0.1, 2.3, -half * 0.35, 0.9, 0.1, 0.1, 0x3b3b40); cone(half * 0.1, 1.8, -half * 0.35, 0.3, 0.55, 0xd9a040, 10); ball(half * 0.1, 1.5, -half * 0.35, 0.1, 0x6d543a);
    tower(half * 0.5, half * 0.45, 1.3, 4.0, 0x7a766c, 0x5a5a66); bench(half * 0.5 - 3, half * 0.45, 1.2, 0x8a8478);
    // Tide pools with crabs and starfish, a sea arch, boulders, driftwood, a pebble beach.
    for (let i = 0; i < 4; i += 1) { const p = spot(2, 2, { rMin: half * 0.55, slopeMax: 0.6 }); if (!p) continue; const r = 1.2 + rnd() * 1.0; disc(p[0], -0.03, p[1], r + 0.35, 0x6e6a60); disc(p[0], 0.0, p[1], r, 0x3fa8c0, 0.35); starfish(p[0] - r * 0.4, p[1] + r * 0.3, [0xf08a2a, 0xe0566a, 0xc47ad8][i % 3]); crab(p[0] + r * 0.5, p[1] - r * 0.3); for (let k = 0; k < 7; k += 1) { const s = ball(p[0] + Math.cos(k * 0.9) * (r + 0.3), 0.05, p[1] + Math.sin(k * 0.9) * (r + 0.3), 0.22, K.pick([0x8c917c, 0x6e7266])); s.scale.y = 0.6; } }
    K.lift(() => { const ax = half + 2; const az = -half * 0.5; for (const sz of [-2.2, 2.2]) B(ax, -0.2, az + sz, 1.6, 4.4, 1.4, 0x6e6a60); B(ax, 2.2, az, 1.8, 1.2, 5.8, 0x6e6a60); boulder(ax + 1.5, az + 3.5, 1.0, 0x5d5952); });
    outcrop(-half * 0.1, -half * 0.6, 3, 0x6e6a60); outcrop(half * 0.7, half * 0.05, 2.5, 0x7d7a72); for (let i = 0; i < Math.round(half * 0.5); i += 1) { const p = spot(1, 1, { rMin: half * 0.3 }); if (p) boulder(p[0], p[1], 0.6 + rnd() * 1.1, K.pick([0x6e6a60, 0x7d7a72, 0x5d5952])); }
    for (let i = 0; i < 3; i += 1) { const p = spot(1, 1, { rMin: half * 0.5 }); if (p) cyl(p[0], 0.2, p[1], 0.2, 2.6, 0xb0a08a, 6).rotation.z = Math.PI / 2; }
    for (let i = 0; i < 6; i += 1) { const px = half - 3 + (i % 2) * 0.6; const pz = -half + 3 + i * 1.3; cyl(px, 0.6, pz, 0.06, 1.2, 0x8a6a45, 5); const g = ball(px, 1.3, pz, 0.14, 0xffffff); g.scale.set(0.14, 0.18, 0.22); }
    lantern(-2, half - 4, 0xffe9a8); lantern(2, half - 4, 0xffe9a8); flagpole(lx + 3, lz - 1, 0x4e7fa8);
    boatAt(half + 3, half * 0.3, 0.2, 0x4e7fa8); dolphin(-half - 6, 0, 6);
    scatter(Math.round(half * 4), (x, z) => pebble(x, z)); scatter(Math.round(half * 1.2), (x, z) => tuft(x, z, 0x8aa06a)); scatter(Math.round(half * 0.5), (x, z) => bush(K, x, z, 0.8, 0x6f8f4a));
    for (let i = 0; i < 5; i += 1) bird(lx, 8 + i * 0.8, lz, 5 + i * 1.5, 0xffffff, 0.4 + i * 0.1);
  },
  grass(K, half) {
    const { B, cone, ball, cyl, house, tree, fence, fenceRect, path, flowerbed, well, bench, dog, sheep, chicken, scatter, spot, tuft, flower, pebble, bird, block, hill, pad, rnd, pond, butterfly, signpost, flagpole, bush } = K;
    hill(-half * 0.5, -half * 0.35, half * 0.45, 2.2); hill(half * 0.45, half * 0.4, half * 0.3, 1.2);
    // The farmhouse with its porch, a barn, a windmill-less yard: fence, well, flower beds.
    house(0, -half * 0.3, 5.0, 4.0, 0xd9b45c, 0x8a4a3a, { roofH: 1.6, chimney: true, porch: true });
    path(0, half - 2, 0, -half * 0.3 + 3.2); fenceRect(0, -half * 0.3 + 1, 7, 6, 0xd4c49b);
    const bx = half * 0.45; const bz = -half * 0.05; pad(bx, bz, 3.6, 2.8); B(bx, 1.6, bz, 6.2, 3.2, 4.6, 0xb04a3a); B(bx, 3.4, bz, 6.8, 0.3, 5.2, 0x5a4330); B(bx, 3.9, bz, 4.6, 0.9, 3.6, 0x5a4330); B(bx, 4.6, bz, 2.0, 0.6, 1.6, 0x5a4330); B(bx, 1.1, bz + 2.33, 2.2, 2.2, 0.1, 0x6d543a); B(bx, 1.1, bz + 2.36, 0.08, 2.2, 0.06, 0xf3ecd8); B(bx, 2.6, bz + 2.33, 0.9, 0.7, 0.08, 0xf3ecd8); block(bx, bz, 3.1, 2.3);
    well(-half * 0.35, -half * 0.05); flowerbed(-half * 0.25, half * 0.15, 4, 2); flowerbed(half * 0.25, half * 0.2, 4, 2, [0xf0c84a, 0xf3ecd8]);
    // The pasture: sheep behind a fence; a dog house and a dog; chickens by the barn.
    const px = -half * 0.5; const pz = half * 0.35; fenceRect(px, pz, half * 0.22, half * 0.18, 0xd4c49b, 'none'); for (let i = 0; i < 4 + Math.floor(half / 10); i += 1) sheep(px + (rnd() - 0.5) * half * 0.36, pz + (rnd() - 0.5) * half * 0.3, rnd() * 6);
    B(half * 0.2, 0.6, half * 0.45, 1.3, 1.2, 1.3, 0xb4703f); cone(half * 0.2, 1.6, half * 0.45, 1.1, 0.9, 0x8a4a3a, 4).rotation.y = Math.PI / 4; B(half * 0.2, 0.45, half * 0.45 + 0.7, 0.6, 0.8, 0.1, 0x3b3b40); block(half * 0.2, half * 0.45, 0.7, 0.7); dog(half * 0.2 + 2, half * 0.45);
    for (let i = 0; i < 5; i += 1) chicken(bx - 1 + rnd() * 2, bz + 3.5 + rnd() * 1.5);
    // An orchard on the hill, a pond with ducks, haystacks, a scarecrow in a pumpkin patch.
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) tree(-half * 0.6 + c * 3.2, -half * 0.55 + r * 3.2, { leaf: 0x4e9a3f, s: 0.9 + rnd() * 0.3 });
    for (let i = 0; i < Math.round(half * 0.4); i += 1) { const p = spot(1, 1, { rMin: half * 0.5 }); if (p) tree(p[0], p[1], { leaf: K.pick([0x4e9a3f, 0x3f7a35, 0x6fae4a]), s: 1 + rnd() * 0.5 }); }
    pond(half * 0.55, half * 0.6 - 2, 2.6 + half * 0.03, { fish: 0 }); for (let i = 0; i < 3; i += 1) K.duckOn(half * 0.55, half * 0.6 - 2, 1.4, i);
    for (let i = 0; i < 3; i += 1) { cone(half * 0.6 + i * 2.2 - 2, 0.9, -half * 0.5, 1.2, 1.8, 0xe3cc8e, 9); block(half * 0.6 + i * 2.2 - 2, -half * 0.5, 0.7, 0.7); }
    const sx = -half * 0.1; const sz = half * 0.55; for (let i = 0; i < 6; i += 1) { ball(sx - 2 + (i % 3) * 1.4, 0.22, sz + Math.floor(i / 3) * 1.2, 0.28, 0xf08a2a).scale.y = 0.75; cyl(sx - 2 + (i % 3) * 1.4, 0.5, sz + Math.floor(i / 3) * 1.2, 0.04, 0.2, 0x4e9a3f, 4); }
    cyl(sx, 1.1, sz - 1.5, 0.06, 2.2, 0x6d543a, 5); B(sx, 1.5, sz - 1.5, 1.4, 0.08, 0.08, 0x6d543a); B(sx, 1.3, sz - 1.5, 0.6, 0.9, 0.3, 0x4e7fa8); ball(sx, 2.05, sz - 1.5, 0.3, 0xe3cc8e); cone(sx, 2.45, sz - 1.5, 0.5, 0.3, 0xd9b45c, 8);
    bench(-half * 0.1, half * 0.72, 0); signpost(2, half - 6, [0xd9c7a8, 0xd9c7a8]); flagpole(-half * 0.25, -half * 0.3 + 4, 0x4e9a3f);
    cyl(half * 0.35, 0.6, half * 0.75, 0.05, 1.2, 0x3b3b40, 5); B(half * 0.35, 1.3, half * 0.75, 0.5, 0.36, 0.3, 0xe0566a);
    for (let i = 0; i < 5; i += 1) butterfly((rnd() - 0.5) * half, (rnd() - 0.5) * half, K.pick([0xf0c84a, 0xe0566a, 0x6fd0ff]));
    scatter(Math.round(half * 5), (x, z) => tuft(x, z)); scatter(Math.round(half * 2), (x, z) => flower(x, z, K.pick([0xf3ecd8, 0xf0c84a, 0xe0566a]))); scatter(Math.round(half * 0.4), (x, z) => bush(x, z, 0.9 + rnd() * 0.5));
    bird(0, 7, 0, half * 0.7, 0xffffff, 0.4);
  },
  lake(K, half) {
    const { B, cone, ball, cyl, disc, house, tree, fence, path, bench, scatter, spot, tuft, flower, pebble, bird, block, hill, pad, rnd, pond, duckOn, boatAt, lantern, campfire, bush, flagpole } = K;
    hill(-half * 0.5, -half * 0.45, half * 0.4, 2.0); hill(half * 0.5, -half * 0.4, half * 0.35, 1.5);
    // The lake in the middle, a boathouse and a long pier with a rowboat tied up.
    const r = half * 0.36; pond(0, -2, r, { water: 0x3f9fc0, rim: 0xb9a97a, fish: 6, lilies: true });
    for (let i = 0; i < 3; i += 1) duckOn(0, -2, r * 0.55, i);
    const px0 = r - 0.5; for (let i = 0; i < 6; i += 1) B(px0 - i * 0.7, 0.14, -2 + r * 0.1, 0.66, 0.1, 1.3, 0xb49a6a); for (const dx of [0.2, -3.6]) cyl(px0 + dx, -0.2, -2 + r * 0.1 + 0.8, 0.08, 1.2, 0x8a6a45, 6);
    cyl(px0 - 4.0, 0.9, -2 + r * 0.1, 0.03, 2.2, 0x3b2a1a, 4).rotation.z = -0.6; B(px0 - 5.2, 1.2, -2 + r * 0.1 - 0.8, 0.015, 1.9, 0.015, 0xf3ecd8); ball(px0 - 5.2, 0.08, -2 + r * 0.1 - 0.8, 0.08, 0xe0566a);
    const inner = boatAt(-r * 0.45, -2 - r * 0.3, 0.5); inner.position.y = K.H(0, -2) + 0.0;
    house(-half * 0.5, half * 0.45, 4.4, 3.4, 0xb48a5a, 0x5a6e7a, { roofH: 1.0, porch: true }); house(half * 0.5, -half * 0.05, 3.8, 3.2, 0xd9c7a8, 0x8a4a3a, { roofH: 1.4, chimney: true });
    path(0, half - 2, -half * 0.5 + 2, half * 0.45 + 3); path(0, half - 2, half * 0.5 - 2, -half * 0.05 + 3);
    // A waterfall from the hill into the lake, a wooden bridge over the stream, a mill wheel.
    const wx = -half * 0.42; const wz = -half * 0.38; for (let i = 0; i < 4; i += 1) { const s = B(wx + 2.5 + i * 1.5, 2.6 - i * 0.6, wz + 2 + i * 1.6, 1.6, 0.25, 2.0, 0x7fc6d8, 0.3, 0.75); s.rotation.x = -0.6; } for (let i = 0; i < 6; i += 1) K.puff(wx + 2.5 + (i % 3) * 1.5, 0.4, wz + 2 + i * 1.0, i, 0xffffff, 0.2);
    const wheel = new THREE.Group(); wheel.position.set(wx + 7.5, K.H(wx + 7.5, wz + 7) + 1.6, wz + 7); K.group?.add(wheel); for (let i = 0; i < 8; i += 1) { const sp = K.M.mesh('box', 0x8a6a45); sp.scale.set(0.12, 2.8, 0.3); sp.rotation.z = i * Math.PI / 8; wheel.add(sp); const pd = K.M.mesh('box', 0xa58c62); pd.scale.set(0.5, 0.2, 0.4); pd.position.set(Math.cos(i * Math.PI / 4) * 1.4, Math.sin(i * Math.PI / 4) * 1.4, 0); wheel.add(pd); } K.anim((t) => { wheel.rotation.z = -t * 0.8; });
    B(wx + 8.4, 1.0, wz + 7, 1.6, 2.0, 1.8, 0x8a6a45); cone(wx + 8.4, 2.4, wz + 7, 1.5, 1.0, 0x5a6e7a, 4).rotation.y = Math.PI / 4; block(wx + 8.4, wz + 7, 1.0, 1.0); block(wx + 7.5, wz + 7, 0.5, 1.5);
    for (let k = 0; k <= 8; k += 1) { const a = k / 8 * Math.PI; B(half * 0.1 + Math.cos(a) * 2.6, 0.3 + Math.sin(a) * 0.8, -2 + r + 1.2, 0.7, 0.12, 1.0, 0xb49a6a).rotation.z = -Math.cos(a) * 0.3; } for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(half * 0.1 + sx * 2.6, 0.9, -2 + r + 1.2 + sz * 0.5, 0.08, 1.2, 0.08, 0x8a6a45);
    // Cattails, willows, a campsite on the shore, a lantern path.
    for (let i = 0; i < Math.round(half * 0.5); i += 1) { const p = spot(1, 1, { rMin: half * 0.5 }); if (p) tree(p[0], p[1], { leaf: K.pick([0x4e9a3f, 0x3f7a35, 0x7fb86a]), s: 1 + rnd() * 0.6 }); }
    for (const [tx, tz] of [[half * 0.6, half * 0.55], [-half * 0.7, -half * 0.1]]) { cyl(tx, 1.3, tz, 0.3, 2.6, 0x6d543a, 7); const top = ball(tx, 3.0, tz, 1.6, 0x7fb86a); top.scale.y = 0.8; for (let i = 0; i < 12; i += 1) { const a = i * 0.52; B(tx + Math.cos(a) * 1.5, 2.0, tz + Math.sin(a) * 1.5, 0.12, 2.2, 0.12, 0x8fc37a); } block(tx, tz, 0.5, 0.5); }
    campfire(half * 0.25, half * 0.6); cone(half * 0.25 + 3.5, 1.0, half * 0.6, 1.8, 2.0, 0x4e9a3f, 4).rotation.y = Math.PI / 4; block(half * 0.25 + 3.5, half * 0.6, 1.2, 1.2);
    for (let i = 0; i < 4; i += 1) lantern(1.6, half - 4 - i * 3, 0xffd98a);
    bench(-half * 0.2, half * 0.3, 0.5); flagpole(-half * 0.5 + 3, half * 0.45 - 3, 0x3f9fc0);
    scatter(Math.round(half * 5), (x, z) => tuft(x, z)); scatter(Math.round(half * 1.5), (x, z) => flower(x, z, K.pick([0xf3ecd8, 0xf0c84a, 0xf8c6d8]))); scatter(Math.round(half * 0.5), (x, z) => bush(x, z, 0.8 + rnd() * 0.6));
    bird(0, 6, -2, half * 0.6, 0xffffff, 0.45); K.dolphin(half + 6, 0, 4);
  },
  forest(K, half) {
    const { B, cone, ball, cyl, disc, tree, pine, path, bench, scatter, spot, tuft, pebble, bird, block, hill, pad, rnd, pond, lantern, campfire, deer, bush, sparkle, fence, flagpole } = K;
    hill(-half * 0.4, -half * 0.5, half * 0.5, 3.0); hill(half * 0.5, half * 0.1, half * 0.3, 1.4); hill(half * 0.1, -half * 0.3, half * 0.25, 1.0);
    // The log house, a treehouse with a rope ladder, a woodshed; a clearing between them.
    const hx = 0; const hz = -half * 0.3; pad(hx, hz, 4.2, 3.4);
    for (let i = 0; i < 6; i += 1) { cyl(hx, 0.3 + i * 0.5, hz, 0.26, 6.2, i % 2 ? 0x8a6a45 : 0x7a5a3a, 8).rotation.z = Math.PI / 2; cyl(hx, 0.3 + i * 0.5, hz, 0.26, 4.6, i % 2 ? 0x8a6a45 : 0x7a5a3a, 8).rotation.x = Math.PI / 2; }
    B(hx, 1.6, hz, 5.6, 3.0, 4.0, 0x7a5a3a); B(hx, 3.4, hz, 7.0, 0.3, 5.4, 0x5a4330); B(hx, 3.9, hz, 5.0, 0.8, 3.8, 0x5a4330); B(hx, 4.6, hz, 2.4, 0.7, 1.8, 0x5a4330);
    B(hx + 2.0, 4.4, hz - 1.0, 0.7, 1.8, 0.7, 0x9a8f7a); for (let i = 0; i < 4; i += 1) K.puff(hx + 2.0, 5.4, hz - 1.0, i, 0xe8e4dc);
    B(hx, 0.95, hz + 2.05, 1.0, 1.9, 0.1, 0x3b2a1a); for (const sx of [-1, 1]) B(hx + sx * 1.8, 1.7, hz + 2.05, 0.9, 0.7, 0.08, 0xffd98a, 0.9); block(hx, hz, 2.9, 2.1);
    path(0, half - 2, 0, hz + 2.4, 0x9a8f7a);
    const tx = -half * 0.45; const tz = half * 0.2; cyl(tx, 2.2, tz, 0.6, 4.4, 0x5a4330, 8); ball(tx, 6.0, tz, 2.6, 0x3f7a35); ball(tx + 1.5, 5.4, tz + 1, 1.8, 0x4e9a3f); ball(tx - 1.4, 6.4, tz - 1, 1.9, 0x4e9a3f);
    B(tx, 3.6, tz, 3.6, 0.2, 3.6, 0xa58c62); B(tx, 4.6, tz - 1.2, 2.6, 1.8, 1.2, 0xb49a6a); B(tx, 5.7, tz - 1.2, 3.0, 0.3, 1.6, 0x8a4a3a); for (let i = 0; i < 4; i += 1) B(tx + 1.8, 3.6, tz + 1.8 - i * 0.5 + 0.3, 0.1, 0.1, 0.5, 0xd9c7a8); for (let i = 0; i < 6; i += 1) B(tx + 2.1, 0.5 + i * 0.6, tz + 1.8, 0.6, 0.08, 0.08, 0xd9c7a8); for (const sx of [-1, 1]) B(tx + 2.1 + sx * 0.3, 1.9, tz + 1.8, 0.04, 3.6, 0.04, 0xf3ecd8); block(tx, tz, 1.0, 1.0);
    for (let i = 0; i < 8; i += 1) cyl(half * 0.3 + (i % 4) * 0.5, 0.25 + Math.floor(i / 4) * 0.45, -half * 0.55, 0.22, 1.6, 0x8a6a45, 7).rotation.x = Math.PI / 2; B(half * 0.3 + 0.75, 1.4, -half * 0.55, 3.0, 0.15, 2.2, 0x5a4330); for (const sx of [-1, 1]) cyl(half * 0.3 + 0.75 + sx * 1.3, 0.7, -half * 0.55 + 1.0, 0.08, 1.4, 0x6d543a, 6); block(half * 0.3 + 0.75, -half * 0.55, 1.4, 1.0);
    // The woods themselves: rings of trees and pines, denser on the hill.
    const n = Math.round(half * 1.3); for (let i = 0; i < n; i += 1) { const p = spot(1, 1, { rMin: half * 0.3, slopeMax: 0.9 }); if (!p) continue; if (i % 3 === 2) pine(p[0], p[1], 1 + rnd() * 0.6); else tree(p[0], p[1], { trunk: 0x5a4330, leaf: K.pick([0x3f7a35, 0x4e9a3f, 0x2f6a3a]), s: 1 + rnd() * 0.5 }); }
    // The pond and its jetty, mushrooms, a stump with an axe, a swing, a deer, lanterns.
    pond(half * 0.45, half * 0.4, 2.6 + half * 0.03, { fish: 3 }); for (let i = 0; i < 4; i += 1) B(half * 0.45 - 2.4 - i * 0.7, 0.3, half * 0.4, 0.66, 0.12, 1.2, 0xb49a6a);
    for (let i = 0; i < Math.round(half * 0.4); i += 1) { const p = spot(0.5, 0.5, { rMin: 3 }); if (!p) continue; cyl(p[0], 0.18, p[1], 0.08, 0.36, 0xf3ecd8, 6); const cap = ball(p[0], 0.4, p[1], 0.26, K.pick([0xe0563a, 0xf08a2a, 0xd9b45c])); cap.scale.y = 0.6; for (let k = 0; k < 3; k += 1) ball(p[0] + (rnd() - 0.5) * 0.3, 0.5, p[1] + (rnd() - 0.5) * 0.3, 0.04, 0xffffff); }
    cyl(-half * 0.2, 0.3, -half * 0.05, 0.5, 0.6, 0x8a6a45, 9); disc(-half * 0.2, 0.61, -half * 0.05, 0.48, 0xd9b45c); B(-half * 0.2 + 0.2, 0.9, -half * 0.05, 0.06, 0.7, 0.06, 0x6d543a).rotation.z = 0.4; B(-half * 0.2 + 0.45, 1.2, -half * 0.05, 0.3, 0.2, 0.08, 0x9a9a9a); block(-half * 0.2, -half * 0.05, 0.5, 0.5);
    const sx = half * 0.15; const sz = half * 0.65; for (const dx of [-1, 1]) cyl(sx + dx * 1.2, 1.3, sz, 0.08, 2.6, 0x6d543a, 6); B(sx, 2.6, sz, 2.6, 0.14, 0.14, 0x6d543a); const swing = new THREE.Group(); swing.position.set(sx, K.H(sx, sz) + 2.6, sz); K.group?.add(swing); for (const dx of [-1, 1]) { const rope = K.M.mesh('box', 0xf3ecd8); rope.scale.set(0.04, 1.6, 0.04); rope.position.set(dx * 0.45, -0.8, 0); swing.add(rope); } const seat = K.M.mesh('box', 0xd9b45c); seat.scale.set(1.0, 0.1, 0.4); seat.position.y = -1.6; swing.add(seat); K.anim((t) => { swing.rotation.x = Math.sin(t * 1.6) * 0.35; }); block(sx, sz, 0.6, 0.4);
    for (let i = 0; i < 2; i += 1) { const p = spot(1, 1, { rMin: half * 0.4 }); if (p) deer(p[0], p[1]); }
    for (let i = 0; i < 5; i += 1) lantern(-1.8 + (i % 2) * 3.6, half - 4 - i * 2.4);
    campfire(half * 0.2, half * 0.15); bench(half * 0.2, half * 0.15 + 2.6, 0); flagpole(hx + 4, hz + 3, 0x3f7a35);
    scatter(Math.round(half * 0.8), (x, z) => { for (let k = 0; k < 4; k += 1) cone(x + Math.cos(k * 1.57) * 0.25, 0.3, z + Math.sin(k * 1.57) * 0.25, 0.12, 0.6, 0x3f7a35, 4).rotation.z = Math.cos(k * 1.57) * 0.5; });
    scatter(Math.round(half * 3), (x, z) => tuft(x, z)); scatter(Math.round(half * 0.6), (x, z) => bush(x, z, 0.7 + rnd() * 0.6, 0x3f7a35)); scatter(Math.round(half * 0.5), (x, z) => pebble(x, z));
    sparkle(0, 0, 0xd9f06a, Math.round(half * 0.8)); bird(0, 8, 0, half * 0.6, 0x3b3b40, 0.35);
  },
  desert(K, half) {
    const { B, cone, ball, cyl, disc, palm, path, bench, scatter, spot, tuft, pebble, bird, block, hill, pad, rnd, well, signpost, torch, flagpole, boatAt } = K;
    hill(-half * 0.4, half * 0.35, half * 0.4, 2.6); hill(half * 0.5, -half * 0.5, half * 0.3, 1.8); hill(half * 0.3, half * 0.5, half * 0.25, 1.4);
    // The pyramid with a doorway and a sphinx, a smaller one beside; the oasis with palms.
    const px = -half * 0.4; const pz = -half * 0.4; pad(px, pz, half * 0.2 + 1, half * 0.2 + 1);
    const ps = half * 0.18; cone(px, ps * 0.6, pz, ps, ps * 1.2, 0xd8b474, 4).rotation.y = Math.PI / 4; cone(px, ps * 1.22, pz, ps * 0.12, ps * 0.14, 0xffd766, 4, 0.6).rotation.y = Math.PI / 4; B(px, 0.9, pz + ps * 0.98, 1.4, 1.8, 0.4, 0x3b2a1a); block(px, pz, ps * 0.7, ps * 0.7);
    cone(px + ps * 1.6, ps * 0.3, pz + 1, ps * 0.5, ps * 0.6, 0xd8b474, 4).rotation.y = Math.PI / 4; block(px + ps * 1.6, pz + 1, ps * 0.35, ps * 0.35);
    const sx = px + 2; const sz = pz + ps + 3.5; B(sx, 0.8, sz, 1.4, 1.2, 3.4, 0xd8b474); B(sx, 1.9, sz + 1.3, 1.0, 1.2, 1.0, 0xd8b474); B(sx, 2.3, sz + 1.3, 1.3, 0.3, 0.6, 0x4e7fa8); for (const dx of [-1, 1]) B(sx + dx * 0.5, 0.4, sz + 1.6, 0.4, 0.5, 1.2, 0xd8b474); block(sx, sz, 0.8, 1.8);
    const ox = half * 0.3; const oz = half * 0.1; K.pond(ox, oz, 3 + half * 0.04, { water: 0x3fa8c0, rim: 0xc7a35a, lilies: false, fish: 2 }); palm(ox + 4.5, oz + 2.4, -1); palm(ox - 2.2, oz + 4.6, 1); palm(ox + 5.2, oz - 2.5, -1, 0x4e8a3f); palm(ox - 4.8, oz - 1.5, 1);
    // A market by the oasis: awnings, rugs, pots, a camel train, a tent.
    for (let i = 0; i < 3; i += 1) { const mx = ox - 8 + i * 4; const mz = oz - half * 0.3; pad(mx, mz, 1.8, 1.4); for (const [dx, dz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) cyl(mx + dx, 1.3, mz + dz, 0.07, 2.6, 0x8a6a45, 6); B(mx, 2.6, mz, 3.4, 0.1, 2.6, [0xe0566a, 0xf0c84a, 0x4e7fa8][i]); for (let k = 0; k < 3; k += 1) B(mx - 1.2 + k * 1.2, 2.5, mz + 1.3, 0.5, 0.15, 0.3, 0xf3ecd8); B(mx, 0.5, mz, 2.8, 1.0, 1.2, 0x8a6a45); for (let k = 0; k < 4; k += 1) { cyl(mx - 1.0 + k * 0.7, 1.25, mz, 0.22, 0.5, [0xb8904e, 0xe0566a, 0x4e9a3f, 0xf0c84a][k], 8, 0, 1, 0.8); } block(mx, mz, 1.7, 1.2); }
    B(ox, 0.03, oz - half * 0.3 + 3.5, 6, 0.05, 2.4, 0xc8302a); B(ox, 0.04, oz - half * 0.3 + 3.5, 5, 0.05, 1.6, 0xf0c84a);
    for (let i = 0; i < 3; i += 1) camel(K, half * 0.55 + i * 2.8 - 2, half * 0.55 - i * 0.6, 0.4);
    cone(-half * 0.45, 1.4, half * 0.5, 2.8, 2.8, 0xe0566a, 8); cone(-half * 0.45, 2.3, half * 0.5, 1.3, 1.2, 0xf3ecd8, 8); B(-half * 0.45, 0.6, half * 0.5 + 2.6, 0.8, 1.2, 0.1, 0x3b2a1a); block(-half * 0.45, half * 0.5, 1.8, 1.8);
    well(0, half * 0.2, 0xb8904e, 0xe0566a); path(0, half - 2, 0, half * 0.2 + 1.5, 0xd9bf7e); path(0, half * 0.2 - 1.5, px + ps, pz + ps, 0xd9bf7e);
    // Cacti in flower, a rolling tumbleweed, a skull, lizards, an obelisk, torches.
    for (let i = 0; i < Math.round(half * 0.5); i += 1) { const p = spot(0.6, 0.6, { rMin: 4 }); if (!p) continue; const [kx, kz] = p; const h = 1.2 + rnd() * 1.2; cyl(kx, h / 2, kz, 0.22, h, 0x4e8a3f, 8); for (const dx of [-1, 1]) { if (rnd() < 0.5) continue; B(kx + dx * 0.45, h * 0.55, kz, 0.5, 0.16, 0.16, 0x4e8a3f); B(kx + dx * 0.6, h * 0.55 + 0.35, kz, 0.16, 0.7, 0.16, 0x4e8a3f); } ball(kx, h + 0.05, kz, 0.12, K.pick([0xf8c6d8, 0xf0c84a])); block(kx, kz, 0.3, 0.3); }
    const tw = new THREE.Group(); K.group?.add(tw); for (let i = 0; i < 9; i += 1) { const s = K.M.mesh('box', 0xb8a070); s.scale.set(0.04, 0.04, 0.8); s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); tw.add(s); } K.anim((t) => { const k = ((t * 1.2) % (half * 1.6)) - (half * 0.8); tw.position.set(k, K.H(k, half * 0.35) + 0.4, half * 0.35); tw.rotation.z = -t * 2.5; });
    ball(half * 0.6, 0.18, half * 0.25, 0.22, 0xf3ecd8); for (const dx of [-1, 1]) ball(half * 0.6 + dx * 0.08, 0.2, half * 0.25 + 0.18, 0.05, 0x3b3b40);
    B(half * 0.7, 1.6, -half * 0.1, 0.6, 3.2, 0.6, 0xd8b474); cone(half * 0.7, 3.4, -half * 0.1, 0.45, 0.5, 0xffd766, 4, 0.5); for (let i = 0; i < 4; i += 1) B(half * 0.7, 0.6 + i * 0.7, -half * 0.1 + 0.31, 0.3, 0.3, 0.02, 0x4e7fa8);
    torch(px + ps * 0.9, pz + ps * 1.1); torch(px - ps * 0.9, pz + ps * 1.1); signpost(2, half - 6, [0xd9c7a8, 0xe0566a]); flagpole(ox + 7, oz - half * 0.3, 0xf0c84a); bench(ox, oz + 5, 0, 0xb8904e);
    boatAt(half + 2.5, half * 0.2, 0.4, 0xb8904e);
    scatter(Math.round(half * 4), (x, z) => pebble(x, z, K.pick([0xd9bf7e, 0xc7a35a, 0xb08a4a]))); scatter(Math.round(half * 1.2), (x, z) => tuft(x, z, 0xb9b06a)); scatter(Math.round(half * 0.3), (x, z) => { const d = ball(x, -0.2, z, 2 + rnd() * 2, 0xf0cc88); d.scale.y = 0.25; });
    bird(0, 10, 0, half * 0.9, 0x6a4a2a, 0.3);
  },
};

const pick3 = (rnd) => [0xf08a2a, 0xe0566a, 0xc47ad8][Math.floor(rnd() * 3)];
const bush = (K, x, z, s, c) => K.bush(x, z, s, c);
function camel(K, x, z, ry) {
  const { B, ball, block } = K;
  B(x, 1.15, z, 1.0, 0.9, 1.8, 0xc9a05a).rotation.y = ry; ball(x, 1.8, z - 0.1, 0.5, 0xc9a05a); ball(x + 0.3, 1.75, z + 0.4, 0.42, 0xc9a05a);
  B(x, 1.7, z + 1.0, 0.4, 1.0, 0.4, 0xc9a05a).rotation.x = -0.4; B(x, 2.3, z + 1.35, 0.42, 0.42, 0.7, 0xc9a05a); for (const sx of [-1, 1]) B(x + sx * 0.18, 2.55, z + 1.2, 0.08, 0.18, 0.08, 0xc9a05a);
  for (const [lx, lz] of [[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]]) B(x + lx, 0.35, z + lz, 0.18, 0.7, 0.18, 0xb8904e);
  B(x, 1.0, z - 1.0, 0.08, 0.6, 0.08, 0xb8904e); B(x, 1.3, z, 1.1, 0.12, 1.0, 0xe0566a); B(x - 0.6, 1.0, z, 0.3, 0.5, 0.6, 0x8a6a45); B(x + 0.6, 1.0, z, 0.3, 0.5, 0.6, 0x8a6a45);
  block(x, z, 0.6, 1.0);
}
