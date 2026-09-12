// のりもの島 — four gates round the shore, and a racing circuit between them.
//
// Each vehicle stands at its own gate, so choosing one is a walk. Round them runs a real
// circuit: tarmac with kerbs, a start/finish line under a lit gantry, a grid painted on
// the road, boost pads, item boxes, and an arch over every checkpoint carrying an English
// direction word big enough to read at speed. Terrain, dock, collision and beacon come
// from the shared island kit.
//
// The road's shape is the checkpoint ring from vehicles.json — the same list the server
// counts laps with and kart.js decides grass by, so what is drawn is what is driven.
import * as THREE from './three.module.js';
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadRideData() {
  if (!promise) {
    promise = fetch('vehicles.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`vehicles.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[ride] vehicles.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createRideIsland({ scene }) {
  let course = null;
  const arches = new Map();     // checkpoint id -> { group, ring, plate }
  const boxes = [];             // the item boxes, which spin
  let nextId = '';

  const island = createIsland({
    scene,
    seed: 31415,
    build({ island: data, B, D, house, path, resident, door, scatter, obstacles, bunting }) {
      const yard = data.courtyard;
      // ---- the road ------------------------------------------------------------------
      // Tarmac laid in short tiles along the checkpoint ring, with a kerb down both edges
      // so the racing line is visible from a kart rather than only from above.
      if (course) {
        const gates = course.gates;
        const half = (course.road?.width || 9) / 2;
        for (let i = 0; i < gates.length; i += 1) {
          const from = gates[i];
          const to = gates[(i + 1) % gates.length];
          const len = Math.hypot(to.x - from.x, to.z - from.z);
          const nx = (to.z - from.z) / (len || 1);
          const nz = -(to.x - from.x) / (len || 1);
          const steps = Math.max(1, Math.ceil(len / 1.5));
          for (let k = 0; k < steps; k += 1) {
            const u = k / steps;
            const x = from.x + (to.x - from.x) * u;
            const z = from.z + (to.z - from.z) * u;
            D(x, 0.3, z, half * 2, 0.34, half * 2, k % 2 ? 0x585b60 : 0x54575c);
            if (k % 3 === 0) D(x, 0.48, z, 0.9, 0.1, 0.9, 0xe8e2c6);          // centre line
            // Red and white kerbs, which is what tells a child where the road ends.
            for (const side of [-1, 1]) {
              D(x + nx * side * half, 0.36, z + nz * side * half, 1.5, 0.3, 1.5, k % 2 ? 0xd9534f : 0xf3ecd8);
            }
          }
        }
        // Boost pads: chevrons pointing the way round, and they are on the road because
        // the data says so — vehicles.json refuses one that is not.
        for (const pad of course.boosts || []) {
          D(pad.x, 0.5, pad.z, 4.6, 0.14, 4.6, 0x2f6b7f);
          for (let i = 0; i < 3; i += 1) D(pad.x, 0.6, pad.z - 1.4 + i * 1.4, 3.4 - i * 0.4, 0.12, 0.7, 0x8fe0ff);
        }
        // The grid, painted: one box per starting place, numbered down the straight.
        (course.grid || []).forEach((place, i) => {
          D(place.x, 0.5, place.z, 2.8, 0.12, 4.2, i % 2 ? 0xf3ecd8 : 0xe8e2c6);
          D(place.x, 0.56, place.z + 1.6, 2.2, 0.1, 0.4, 0x33332f);
        });
      }

      // ---- the pit ---------------------------------------------------------------------
      // The middle of the island is the pit: a flat apron with a flag, so the ring reads
      // as a course rather than as the gap between four shops.
      B(yard.x, 0.12, yard.z, 14, 0.16, 10, 0xcfc7a8);
      B(yard.x, 0.26, yard.z, 11, 0.14, 7.5, 0xdedaba);
      B(yard.x, 2.6, yard.z, 0.3, 5, 0.3, 0x8a8378);
      B(yard.x + 1.4, 4.6, yard.z, 2.6, 1.5, 0.12, 0xd9534f);

      // ---- the start and finish -----------------------------------------------------
      // A gantry across the line, its legs outside the kerbs, and the chequers under it.
      // The line is where the grid is and where the dock path comes down, so nothing here
      // may stand on the tarmac itself.
      const gz = 17.3;
      // The legs stand clear of the kerbs and are deliberately not solid: the walk down
      // from the dock comes through here, and a post a child cannot see themselves
      // bumping into is a post that has them stuck at the top of the island.
      for (const sz of [-6.2, 6.2]) {
        D(0, 3.6, gz + sz, 0.8, 7.2, 0.8, 0x8a8378);
        D(0, 7.1, gz + sz, 1.2, 0.6, 1.2, 0x6f6a60);
      }
      D(0, 7.4, gz, 1.1, 1.2, 12.8, 0x2f3f4a);
      // Five lights along it, the way a grid is started.
      for (let i = 0; i < 5; i += 1) D(0.1, 7.4, gz - 4 + i * 2, 0.4, 0.9, 0.9, 0xd9534f, 0.9);
      bunting(0, gz - 6.2, 0, gz + 6.2, 8.6);
      for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 10; j += 1) D(-1.4 + i * 0.95, 0.52, gz - 4.5 + j * 0.95, 0.9, 0.16, 0.9, (i + j) % 2 ? 0xf3ecd8 : 0x33332f);
      }
      // Tyre stacks and a marshal's post outside the kerbs, well clear of the racing line.
      for (const sz of [-7.6, 7.6]) {
        for (let i = 0; i < 3; i += 1) D(0, 0.35 + i * 0.55, gz + sz, 1.5, 0.5, 1.5, i % 2 ? 0x2a2a28 : 0x333330);
        D(0, 2.05, gz + sz, 1.6, 0.2, 1.6, 0xd9534f);
      }
      // A grandstand along the top straight, on both sides of the dock path, with a crowd.
      for (const sx of [-15, 15]) {
        for (let row = 0; row < 3; row += 1) {
          D(sx, 0.6 + row * 0.7, 23.4 + row * 1.1, 11, 0.7, 1.1, row % 2 ? 0xd7cfae : 0xc7bf9e);
          for (let i = 0; i < 5; i += 1) {
            D(sx - 4 + i * 2, 1.35 + row * 0.7, 23.4 + row * 1.1, 0.8, 0.9, 0.7, [0xef6f6c, 0x6fb7d9, 0xf7d774, 0x8ac96f, 0xc9a3d4][(i + row) % 5]);
          }
        }
        obstacles.push({ x: sx, z: 24.6, w: 5.5, d: 2.4 });
      }

      for (const def of data.spots) {
        // The start line is a line, not a building: a child drives onto the grid rather
        // than walking into a shop, and nothing may stand on the tarmac. Its marshal
        // stands beside the road instead.
        if (def.kind === 'start') {
          D(-7.5, 1.4, 22.6, 3.4, 2.8, 2.6, 0x4a6a8a);
          D(-7.5, 3, 22.6, 4, 0.5, 3.2, 0x2f3f4a);
          D(-7.5, 2.1, 21.3, 2.4, 1.2, 0.2, 0x8fe0ff, 0.5);
          obstacles.push({ x: -7.5, z: 22.6, w: 1.9, d: 1.5 });
          // The marshal stands on the line itself — which is also what makes the start
          // line a place a child can walk up to and press E at.
          resident(def);
          continue;
        }
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), 0x8a6a4a, `${def.tone} ${def.name}`);
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe2dab6);
        resident(def);
      }
      scatter(data, 90);
    },
  });

  // The arches are built after the island, because they belong to the course rather than
  // to the land: one gate per checkpoint, each with its word on the crossbar.
  function buildArches(scene3, origin, data) {
    if (!course || arches.size) return;
    // 📦 The item boxes, spinning on the road. They are the island's own English: driving
    // through one asks for a word, and the boost is what answering it buys.
    for (const spot of course.items || []) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.7, 1.7),
        new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb347, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }),
      );
      cube.position.set(origin.x + spot.x, 1.5, origin.z + spot.z);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.2), new THREE.MeshBasicMaterial({ color: 0x2f3f4a }));
      mark.position.set(0, 0, 0.9);
      cube.add(mark);
      cube.visible = false;
      scene3.add(cube);
      boxes.push(cube);
    }
    for (const gate of course.gates) {
      // The line already has its gantry; a second arch on top of it would be one too many.
      if (gate.id === 'finish') continue;
      const group = new THREE.Group();
      group.position.set(origin.x + gate.x, 0, origin.z + gate.z);
      const post = new THREE.BoxGeometry(0.5, 5, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: 0xf0f0e4, roughness: 0.8 });
      for (const sx of [-2.6, 2.6]) {
        const p = new THREE.Mesh(post, mat);
        p.position.set(sx, 2.5, 0);
        p.castShadow = true;
        group.add(p);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.4), mat);
      bar.position.y = 5.2;
      group.add(bar);
      // The word, on a canvas rather than a texture file, so it stays crisp at any size.
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1d2a3a';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#ffe6a2';
      ctx.font = '700 66px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gate.word, 256, 52);
      ctx.font = '600 30px sans-serif';
      ctx.fillStyle = '#c9d6e4';
      ctx.fillText(gate.ja, 256, 100);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), new THREE.MeshBasicMaterial({ map: tex }));
      plate.position.set(0, 5.2, 0.22);
      group.add(plate);
      const back = plate.clone();
      back.position.z = -0.22;
      back.rotation.y = Math.PI;
      group.add(back);
      // A ring on the ground that lights up when this is the checkpoint to head for.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 8, 28), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 0 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.25;
      group.add(ring);
      group.visible = false;
      scene3.add(group);
      arches.set(gate.id, { group, ring, gate });
    }
  }

  const baseShow = island.show;
  const baseUpdate = island.update;

  return Object.assign(island, {
    ready: loadRideData().then((d) => {
      course = d.course || null;
      island.receive(d.island);
      if (d.island) buildArches(scene, { x: d.island.x, z: d.island.z }, d.island);
      return d;
    }),
    get course() { return course; },
    // Only the checkpoint being driven to is lit; the rest of the ring stays quiet so a
    // child always knows which way to go.
    setNext(id) { nextId = id || ''; },
    show(on) {
      baseShow(on);
      for (const a of arches.values()) a.group.visible = !!on;
      for (const b of boxes) b.visible = !!on;
    },
    update(t, player) {
      baseUpdate(t, player);
      for (let i = 0; i < boxes.length; i += 1) {
        boxes[i].rotation.y = t * 1.4 + i;
        boxes[i].position.y = 1.5 + Math.sin(t * 2 + i) * 0.18;
      }
      for (const [id, a] of arches) {
        const lit = id === nextId;
        a.ring.material.emissiveIntensity = lit ? 0.8 + Math.sin(t * 3) * 0.3 : 0;
        a.ring.scale.setScalar(lit ? 1 + Math.sin(t * 3) * 0.04 : 1);
      }
    },
    // Which checkpoint the player is standing in, if any. The server decides whether
    // that counts; this only says where the avatar is.
    inGate(player) {
      if (!course) return null;
      const o = island.origin();
      for (const gate of course.gates) {
        if (Math.hypot(player.position.x - o.x - gate.x, player.position.z - o.z - gate.z) <= course.reach) return gate;
      }
      return null;
    },
  });
}
