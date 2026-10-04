// ぼくじょう島 — a seed shop, a greenhouse, a barn, a shipping house and a kitchen round a
// yard, with the child's own field and animal pen out in the open.
//
// The island is what 牧場物語 keeps saying matters more than any number: the farm you can
// SEE. Nine plots in front of the greenhouse show the child's own crops at three stages,
// and the pen beside the barn holds the animals they have bought. Both are redrawn from
// the state the server sends (`setFarm`), never from anything the page decided itself.
//
// Terrain, dock, collision, labels, minimap and beacon all come from the shared island
// kit, as they do for every other walkable island. Only the buildings are written here.
import { buildAnimal, animateAnimal } from './farm-animals.js';
import * as THREE from './three.module.js';
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadFarmData() {
  if (!promise) {
    promise = fetch('farm.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`farm.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[farm] farm.json failed to load', err); return { island: null }; });
  }
  return promise;
}

// Crop colours by stage, so a bed of turnips and a bed of tomatoes read differently
// from the jetty: sprout (pale green), leaves (the plant's green), ripe (the fruit).
const RIPE = {
  turnip: 0xf2f0e6, potato: 0xc9a86a, cucumber: 0x4e9a3f, strawberry: 0xe0434f, tomato: 0xe2452f, corn: 0xf1d24b, watermelon: 0x2f7d3a, pepper: 0x3f9a46,
  pumpkin: 0xe8862c, carrot: 0xf08a2a, 'sweet-potato': 0xa05a8a, eggplant: 0x5b2f73, cabbage: 0x9fcf7a, onion: 0xe8d7b0, spinach: 0x3c8a3c, radish: 0xf4f1ea,
};

export function createFarmIsland({ scene }) {
  let plotMeshes = [];      // one group per plot: soil, sprout, leaves, fruit
  let penGroup = null;      // the animals
  let lastFarm = null;
  let rootRef = null;       // the island's group: plots are placed in its coordinates
  let places = null;        // { field: {x,z,...}, pen: {x,z,...} } in island coordinates
  let stages = [];          // the stage each plot was last drawn at, to notice growth
  const pops = [];          // little scale bounces on a plot that just changed
  const geo = new THREE.BoxGeometry();
  const mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })); return mats.get(c); };
  const box = (parent, x, y, z, w, h, d, c) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  const island = createIsland({
    scene,
    seed: 88214,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles, fence, barrel, crate, lamp, root }) {
      const yard = data.courtyard;
      // A packed-earth yard with a well in the middle: the heart of a farm is where the
      // water is.
      B(yard.x, 0.12, yard.z, 15, 0.15, 13, 0xd9c9a3);
      B(yard.x, 0.2, yard.z, 9, 0.14, 8, 0xe3d6b2);
      sprite({ en: `${data.en} · grow it in English`, ja: `${data.name} · えいごで そだてよう` }, yard.x, 4.6, yard.z, { width: 11, size: 30 });
      bunting(yard.x - 7, yard.z - 5, yard.x + 7, yard.z - 5, 3.6);
      // The well, at the yard's edge where no path runs (the five paths fan out from
      // the middle of the yard, so the middle has to stay empty).
      const wx = yard.x + 6; const wz = yard.z - 6;
      D(wx, 0.6, wz, 2.2, 0.9, 2.2, 0x9a8f7a);
      D(wx, 0.95, wz, 1.5, 0.3, 1.5, 0x5a7f98, 0.2);
      for (const side of [-1, 1]) D(wx + side * 0.9, 1.9, wz, 0.18, 2.2, 0.18, 0x8a6a45);
      D(wx, 3.0, wz, 2.6, 0.14, 2.2, 0xb4703f);
      D(wx, 3.3, wz, 2.2, 0.5, 1.8, 0xc17a46);
      D(wx, 2.5, wz, 1.4, 0.1, 0.1, 0x8a6a45);
      D(wx, 2.0, wz, 0.5, 0.5, 0.5, 0x6d543a);
      obstacles.push({ x: wx, z: wz, w: 1.3, d: 1.3 });

      // The field: the child's own nine plots, west of the yard, fenced, with a scarecrow.
      const pl = data.plots;
      const fw = (pl.cols - 1) * pl.gap + 2.4;
      const fd = (pl.rows - 1) * pl.gap + 2.4;
      const fx = pl.x + ((pl.cols - 1) * pl.gap) / 2;
      const fz = pl.z + ((pl.rows - 1) * pl.gap) / 2;
      B(fx, 0.1, fz, fw + 1.2, 0.12, fd + 1.2, 0x8a7a5c);
      fence(fx - fw / 2 - 0.6, fz - fd / 2 - 0.6, Math.ceil((fw + 1.2) / 2), 'x');
      fence(fx - fw / 2 - 0.6, fz + fd / 2 + 0.6, Math.ceil((fw + 1.2) / 2), 'x');
      fence(fx - fw / 2 - 0.6, fz - fd / 2 - 0.6, Math.ceil((fd + 1.2) / 2), 'z');
      // The field is walked into (the east side is open): the fences are what block, not
      // the square — a child stands on a plot and presses E (2026-10). The server checks
      // the same place from farm.json (`FARM.placeById`).
      obstacles.push({ x: fx, z: fz - fd / 2 - 0.6, w: fw / 2 + 0.6, d: 0.12 });
      obstacles.push({ x: fx, z: fz + fd / 2 + 0.6, w: fw / 2 + 0.6, d: 0.12 });
      obstacles.push({ x: fx - fw / 2 - 0.6, z: fz, w: 0.12, d: fd / 2 + 0.6 });
      rootRef = root;
      places = { field: { x: fx, z: fz, w: fw / 2 + 0.6, d: fd / 2 + 0.6 } };
      // Scarecrow at the far corner, so the field has a landmark of its own.
      const sx = fx - fw / 2 - 1.4; const sz = fz - fd / 2 - 1.4;
      D(sx, 1.4, sz, 0.16, 2.8, 0.16, 0x8a6a45);
      D(sx, 2.1, sz, 1.6, 0.14, 0.14, 0x8a6a45);
      D(sx, 2.0, sz, 0.9, 0.9, 0.5, 0x6b8fbf);
      D(sx, 2.75, sz, 0.55, 0.55, 0.5, 0xe8c39a);
      D(sx, 3.12, sz, 0.9, 0.18, 0.9, 0xd9b45c);
      obstacles.push({ x: sx, z: sz, w: 0.3, d: 0.3 });
      sprite({ en: 'MY FIELD', ja: 'わたしの はたけ' }, fx, 3.2, fz + fd / 2 + 1.4, { width: 5, size: 30 });
      plotMeshes = [];
      for (let r = 0; r < pl.rows; r += 1) {
        for (let c = 0; c < pl.cols; c += 1) {
          const g = new THREE.Group();
          g.position.set(pl.x + c * pl.gap, 0, pl.z + r * pl.gap);
          root.add(g);
          const soil = box(g, 0, 0.22, 0, 1.5, 0.22, 1.5, 0x6b5a40);
          const wet = box(g, 0, 0.24, 0, 1.3, 0.22, 1.3, 0x4f4030); wet.visible = false;
          const sprout = box(g, 0, 0.5, 0, 0.18, 0.5, 0.18, 0x9fd37a); sprout.visible = false;
          const leaves = new THREE.Group(); leaves.visible = false; g.add(leaves);
          for (const [lx, lz] of [[-0.35, 0], [0.35, 0], [0, -0.35], [0, 0.35]]) box(leaves, lx, 0.62, lz, 0.5, 0.18, 0.5, 0x5f9f4a);
          box(leaves, 0, 0.8, 0, 0.16, 0.9, 0.16, 0x4e8a3f);
          const fruit = box(g, 0, 1.05, 0, 0.6, 0.6, 0.6, 0xe2452f); fruit.visible = false;
          const dead = box(g, 0, 0.5, 0, 0.9, 0.5, 0.9, 0x8a7a5a); dead.visible = false;
          plotMeshes.push({ g, soil, wet, sprout, leaves, fruit, dead });
        }
      }

      // The pen: east of the yard, fenced on three sides with a trough and a water bowl.
      const pen = data.pen;
      B(pen.x, 0.1, pen.z, pen.w + 1, 0.12, pen.d + 1, 0xc9b98a);
      fence(pen.x - pen.w / 2, pen.z - pen.d / 2, Math.ceil(pen.w / 2), 'x');
      fence(pen.x - pen.w / 2, pen.z + pen.d / 2, Math.ceil(pen.w / 2), 'x');
      fence(pen.x + pen.w / 2, pen.z - pen.d / 2, Math.ceil(pen.d / 2), 'z');
      D(pen.x + pen.w / 2 - 1.2, 0.5, pen.z, 0.7, 0.5, 2.0, 0x8a6a45);
      D(pen.x + pen.w / 2 - 1.2, 0.72, pen.z, 0.5, 0.1, 1.8, 0xd9b45c);
      sprite({ en: 'THE PEN', ja: 'どうぶつの さく' }, pen.x, 3.0, pen.z + pen.d / 2 + 1.2, { width: 4.4, size: 30 });
      // Open on the west side, like the field: walk in among the animals.
      obstacles.push({ x: pen.x, z: pen.z - pen.d / 2, w: pen.w / 2, d: 0.12 });
      obstacles.push({ x: pen.x, z: pen.z + pen.d / 2, w: pen.w / 2, d: 0.12 });
      obstacles.push({ x: pen.x + pen.w / 2, z: pen.z, w: 0.12, d: pen.d / 2 });
      obstacles.push({ x: pen.x + pen.w / 2 - 1.2, z: pen.z, w: 0.4, d: 1.0 });
      places.pen = { x: pen.x, z: pen.z, w: pen.w / 2 + 0.6, d: pen.d / 2 + 0.6 };
      penGroup = new THREE.Group();
      penGroup.position.set(pen.x, 0, pen.z);
      root.add(penGroup);

      bench(yard.x - 4.5, yard.z + 5.5, 0);
      bench(yard.x + 4.5, yard.z + 5.5, 0);
      flowers(yard.x - 8, yard.z + 12, 0xf0d98a);
      flowers(yard.x + 8, yard.z + 12, 0xe89bb0);
      barrel(yard.x + 8.4, yard.z - 2.2);
      crate(yard.x - 6.4, yard.z - 4.0);
      lamp(yard.x - 6.8, yard.z + 6.2);

      // The five buildings. Each wears its own sign and a touch of what it is for, so a
      // child reads the island instead of a menu.
      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, { en: `${def.tone} ${def.en || def.name}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        // `house()` puts the front wall at def.z - 1.4; anything to be SEEN sits past it.
        const front = def.z - 1.3;
        if (def.kind === 'shop') {
          // Seed trays either side of the door.
          for (const side of [-1, 1]) {
            D(def.x + side * 2.5, 0.6, front + 0.6, 1.8, 0.4, 1.0, 0x8a6a45);
            for (let i = 0; i < 3; i += 1) D(def.x + side * 2.5 - 0.55 + i * 0.55, 0.95, front + 0.6, 0.4, 0.3, 0.7, [0x9fd37a, 0xe0434f, 0xf1d24b][i]);
          }
        } else if (def.kind === 'field') {
          // Glass panels along the greenhouse front, lit from inside.
          for (const side of [-1, 1]) {
            D(def.x + side * 2.6, 2.0, front, 2.2, 2.2, 0.16, 0x8a6a4a);
            D(def.x + side * 2.6, 2.0, front + 0.1, 1.9, 1.9, 0.12, 0xcfe6ea, 0.4);
          }
        } else if (def.kind === 'barn') {
          // A hay bale and a crossed-plank barn door look.
          D(def.x + 2.8, 0.55, front + 0.8, 1.4, 0.9, 1.0, 0xd9b45c);
          D(def.x + 2.8, 1.0, front + 0.8, 1.2, 0.2, 0.8, 0xc9a24a);
          D(def.x - 2.6, 1.8, front, 1.8, 2.4, 0.14, 0x8a4a3a);
          D(def.x - 2.6, 1.8, front + 0.08, 0.2, 2.6, 0.08, 0xd9c7a8);
        } else if (def.kind === 'ship') {
          // Stacked crates and a shipping box with a lid, beside the door.
          crate(def.x + 2.6, front + 0.9);
          D(def.x - 2.6, 0.7, front + 0.8, 1.6, 1.1, 1.2, 0xa07a4a);
          D(def.x - 2.6, 1.3, front + 0.8, 1.7, 0.16, 1.3, 0xc49a62);
        } else if (def.kind === 'kitchen') {
          // A chimney with smoke blocks, and a pot on a stool.
          D(def.x + 2.2, 5.6, def.z - 5.5, 0.8, 1.6, 0.8, 0x9a8f7a);
          for (let i = 0; i < 3; i += 1) D(def.x + 2.2 + i * 0.2, 6.8 + i * 0.6, def.z - 5.5, 0.5 - i * 0.1, 0.5 - i * 0.1, 0.5 - i * 0.1, 0xf3efe6, 0.15);
          D(def.x - 2.6, 0.45, front + 0.8, 0.7, 0.5, 0.7, 0x8a6a45);
          D(def.x - 2.6, 0.95, front + 0.8, 0.9, 0.5, 0.9, 0x3b3b40);
        }
        resident(def);
      }
      scatter(data, 90);
      if (lastFarm) paint(lastFarm);
    },
  });

  // Draw the child's farm: each plot at its stage, each animal in the pen.
  function paint(farm) {
    lastFarm = farm;
    if (!plotMeshes.length || !farm) return;
    farm.plots.forEach((p, i) => {
      const m = plotMeshes[i];
      if (!m) return;
      const stage = !p ? 0 : p.wilted ? 4 : p.ready ? 3 : p.growth >= Math.ceil(p.days / 2) ? 2 : 1;
      // Something happened on this plot: a bounce, so the child who just answered sees the
      // field answer back. (Only after the first drawing — arriving is not an event.)
      const wasWet = m.wet.visible;
      if (stages.length && (stage !== stages[i] || (!!p && p.watered && !p.wilted && !wasWet))) pops.push({ g: m.g, at: performance.now() });
      stages[i] = stage;
      m.wet.visible = !!p && p.watered && !p.wilted;
      m.sprout.visible = stage === 1;
      m.leaves.visible = stage === 2 || stage === 3;
      m.fruit.visible = stage === 3;
      m.dead.visible = stage === 4;
      if (stage === 3) m.fruit.material = mat(RIPE[p.crop] || 0xe2452f);
    });
    if (penGroup) {
      while (penGroup.children.length) penGroup.remove(penGroup.children[0]);
      farm.animals.forEach((a, i) => {
        const g = buildAnimal(a.kind, { hearts: a.hearts, seed: i * 1.7 });
        const ax = -1.6 + (i % 2) * 2.4; const az = -1.4 + Math.floor(i / 2) * 2.4;
        g.position.set(ax, 0, az);
        g.userData.home = { x: ax, z: az };
        penGroup.add(g);
      });
    }
    // The sky: rain falls on the whole island on a rainy farm day (the room says which).
    setWeather(farm.weather || 'sun');
  }

  // Rain: a few hundred drops over the island, falling and wrapping, only on a rainy day.
  let rain = null;
  function setWeather(w) {
    if (!rootRef) return;
    if (w !== 'rain') { if (rain) rain.visible = false; return; }
    if (!rain) {
      const n = 700; const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = Math.random() * 18; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
      const geoR = new THREE.BufferGeometry(); geoR.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rain = new THREE.Points(geoR, new THREE.PointsMaterial({ color: 0xcfe6f2, size: 0.18, transparent: true, opacity: 0.75, depthWrite: false }));
      rain.position.y = 0; rootRef.add(rain);
      for (let i = 0; i < 6; i += 1) { const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 1, transparent: true, opacity: 0.85 })); c.scale.set(5 + (i % 3) * 2, 1.6, 3.5 + (i % 2) * 1.5); c.position.set(-20 + i * 8, 15 + (i % 2) * 1.5, -8 + (i % 3) * 7); rain.add(c); }
    }
    rain.visible = true;
  }

  // Where the child is standing, if it is on the farm itself: on one of the nine plots
  // (which one), or in among the animals. Measured in the island's own coordinates.
  function nearField(player) {
    if (!places || !rootRef || !island.visible || !island.data) return null;
    const lx = player.position.x - rootRef.position.x;
    const lz = player.position.z - rootRef.position.z;
    const pl = island.data.plots;
    let best = null;
    for (let r = 0; r < pl.rows; r += 1) {
      for (let c = 0; c < pl.cols; c += 1) {
        const d = Math.hypot(lx - (pl.x + c * pl.gap), lz - (pl.z + r * pl.gap));
        if (d < 1.2 && (!best || d < best.d)) best = { kind: 'plot', index: r * pl.cols + c, d };
      }
    }
    if (best) return best;
    const pen = places.pen;
    if (pen && Math.abs(lx - pen.x) < pen.w && Math.abs(lz - pen.z) < pen.d) return { kind: 'pen', index: -1, d: 0 };
    return null;
  }

  const baseUpdate = island.update;
  const baseSetTarget = island.setTarget;
  return Object.assign(island, {
    ready: loadFarmData().then((d) => { island.receive(d.island); return d; }),
    setFarm: paint,
    nearField,
    // The beacon can stand on the field or at the pen, not only over a door.
    setTarget(id) { baseSetTarget(id, places?.[id] ? { x: places[id].x, z: places[id].z } : null); },
    update(t, player) {
      baseUpdate(t, player);
      if (penGroup?.visible) for (const g of penGroup.children) {
        // Each animal wanders a little round its spot and turns to where it is going.
        const s0 = g.userData.seed; const h = g.userData.home;
        const nx = h.x + Math.sin(t * 0.25 + s0) * 0.7; const nz = h.z + Math.cos(t * 0.17 + s0 * 1.3) * 0.6;
        const dx = nx - g.position.x; const dz = nz - g.position.z; const moving = Math.min(1, Math.hypot(dx, dz) * 40);
        g.position.x = nx; g.position.z = nz;
        if (moving > 0.05) g.rotation.y = Math.atan2(dx, dz);
        animateAnimal(g, t, moving);
      }
      if (rain?.visible) { const a = rain.geometry.attributes.position; for (let i = 0; i < a.count; i += 1) { let y = a.getY(i) - 0.55; if (y < -1) y += 18; a.setY(i, y); } a.needsUpdate = true; }
      if (pops.length) {
        const now = performance.now();
        for (let i = pops.length - 1; i >= 0; i -= 1) {
          const k = (now - pops[i].at) / 520;
          if (k >= 1) { pops[i].g.scale.setScalar(1); pops.splice(i, 1); continue; }
          pops[i].g.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.3);
        }
      }
    },
  });
}
