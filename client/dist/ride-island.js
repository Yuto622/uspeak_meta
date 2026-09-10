// のりもの島 — four gates round the shore, and a course between them.
//
// Each vehicle stands at its own gate, so choosing one is a walk. The road is drawn as a
// real ring of tarmac through six checkpoint arches, each carrying an English direction
// word big enough to read while moving. Terrain, dock, collision and beacon come from
// the shared island kit.
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
  let nextId = '';

  const island = createIsland({
    scene,
    seed: 31415,
    build({ island: data, B, D, house, path, resident, scatter }) {
      const yard = data.courtyard;
      // The road: a ring of tarmac laid as short tiles, wide enough for two children.
      if (course) {
        const gates = course.gates;
        for (let i = 0; i < gates.length; i += 1) {
          const from = gates[i];
          const to = gates[(i + 1) % gates.length];
          const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 1.6);
          for (let k = 0; k < steps; k += 1) {
            const u = k / steps;
            const x = from.x + (to.x - from.x) * u;
            const z = from.z + (to.z - from.z) * u;
            D(x, 0.15, z, 3.6, 0.2, 3.6, 0x585b60);
            if (k % 3 === 0) D(x, 0.27, z, 0.9, 0.1, 0.9, 0xe8e2c6);   // centre line
          }
        }
      }

      // The middle of the island is the pit: a flat apron with a flag, so the ring reads
      // as a course rather than as the gap between four shops.
      B(yard.x, 0.12, yard.z, 14, 0.16, 10, 0xcfc7a8);
      B(yard.x, 0.26, yard.z, 11, 0.14, 7.5, 0xdedaba);
      B(yard.x, 2.6, yard.z, 0.3, 5, 0.3, 0x8a8378);
      B(yard.x + 1.4, 4.6, yard.z, 2.6, 1.5, 0.12, 0xd9534f);

      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 8, 6.4, Number(def.color), def.kind === 'start' ? 0x4a6a8a : 0x8a6a4a, `${def.tone} ${def.name}`);
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
    for (const gate of course.gates) {
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
    },
    update(t, player) {
      baseUpdate(t, player);
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
