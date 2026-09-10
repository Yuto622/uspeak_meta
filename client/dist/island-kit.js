// Voxel island construction, shared by every walkable island in the world.
//
// おつかい島 and ことばの学校島 are the same island with different buildings on it: the
// same layered terrain, the same dock, the same signposting, the same collision and the
// same "am I standing at a place" question. Only the buildings and what happens at them
// differ, so that is all each island module writes.
import * as THREE from './three.module.js';

export const HALF_X = 30;
export const HALF_Z = 25;
export const NEAR_DISTANCE = 5;          // must match `radius` in the island's data file
const LABEL_DISTANCE = 16;

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
export function mat(color, emissive = 0) {
  const key = `${color}:${emissive}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, emissive: color, emissiveIntensity: emissive }));
  return mats.get(key);
}

// One island's worth of building tools. `build` is called once, with these, when the
// island's data has arrived.
export function createIsland({ scene, build, seed = 20250910 }) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  let data = null;
  let built = false;
  let wanted = false;           // asked to be shown, possibly before the data arrived
  const spots = [];             // { def, npc, label, ja }
  const doors = [];             // { def, x, z } - the doorway of a building you can enter
  const obstacles = [];
  let beacon = null;
  let targetId = '';
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  // Shore rocks, path tiles and greenery are hundreds of identical boxes. They are
  // collected by colour and drawn as one instanced mesh each, so the island costs a
  // couple of dozen draw calls instead of several hundred on a classroom iPad.
  const deco = new Map();
  const D = (x, y, z, w, h, d, color) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    if (!deco.has(color)) deco.set(color, []);
    deco.get(color).push(m);
  };
  function flushDeco() {
    for (const [color, list] of deco) {
      const mesh = new THREE.InstancedMesh(geo, mat(color), list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    deco.clear();
  }

  const B = (x, y, z, w, h, d, color, parent = root, emissive = 0) => {
    const m = new THREE.Mesh(geo, mat(color, emissive));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // depthTest defaults on: a place sign belongs to the world and should go behind the
  // hill it is behind. Only the nameplates over people opt out, so a child can always
  // read who is where.
  function sprite(text, x, y, z, { width = 8, background = '#183946', color = '#f3dfaa', weight = 600, size = 36, depthTest = true } = {}) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 100;
    const ctx = c.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(4, 4, 760, 92, 18); ctx.fill(); }
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, 53, 720);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest, transparent: true }));
    s.position.set(x, y, z);
    s.scale.set(width, width / 7.68, 1);
    s.renderOrder = depthTest ? 1 : 3;
    root.add(s);
    return s;
  }

  // A voxel villager in the same style as the islanders on Willow.
  function person(color, skin, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    B(-0.23, 0.51, 0, 0.33, 0.85, 0.42, 0x4a4436, g);
    B(0.23, 0.51, 0, 0.33, 0.85, 0.42, 0x4a4436, g);
    B(0, 1.32, 0, 0.92, 0.92, 0.62, color, g);
    for (const side of [-1, 1]) B(side * 0.62, 1.3, 0, 0.3, 0.82, 0.38, color, g);
    B(0, 2.05, 0, 0.78, 0.62, 0.66, skin, g);
    B(0, 2.36, -0.03, 0.86, 0.28, 0.74, 0x5a4632, g);
    for (const side of [-1, 1]) B(side * 0.19, 2.08, 0.34, 0.1, 0.12, 0.06, 0x2b2b28, g);
    return g;
  }

  function house(x, z, w, d, wall, roof, name) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    B(0, 0.4, 0, w + 0.6, 0.6, d + 0.6, 0xa89d84, g);
    B(0, 2.4, 0, w, 3.8, d, wall, g);
    for (let i = 0; i < 5; i += 1) B(0, 4.4 + i * 0.42, 0, w + 1.1 - i * 0.42, 0.42, d + 1.1 - i * 0.42, roof, g);
    B(0, 1.4, d / 2 + 0.06, 1.25, 2.5, 0.12, 0x50412f, g);          // door, facing the path
    B(0.42, 1.42, d / 2 + 0.16, 0.12, 0.12, 0.1, 0xf1d489, g);
    for (const sx of [-w / 4 - 0.5, w / 4 + 0.5]) B(sx, 2.6, d / 2 + 0.06, 0.9, 0.9, 0.1, 0x9fd3d8, g);
    obstacles.push({ x, z, w: w / 2 + 0.4, d: d / 2 + 0.4 });
    sprite(name, x, 5.9, z + d / 2 + 0.7, { width: Math.max(6, name.length * 0.52) });
    return g;
  }

  function path(ax, az, bx, bz) {
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.1));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      D(ax + (bx - ax) * t, 0.16, az + (bz - az) * t, 1.7, 0.12, 1.7, i % 2 ? 0xd9c9a2 : 0xd0bf95);
    }
  }

  function tree(x, z, scale = 1) {
    D(x, 1.5, z, 0.5 * scale, 3 * scale, 0.5 * scale, 0x7a6448);
    D(x, 3.2 * scale, z, 3 * scale, 1.5 * scale, 3 * scale, 0x6d9d5e);
    D(x, 4.2 * scale, z, 2.1 * scale, 1.1 * scale, 2.1 * scale, 0x7fb069);
  }


  // The terrain, the dock and the shore every island starts from.
  function ground(island) {
    root.position.set(island.x, 0, island.z);
    B(0, -3.6, 0, 64, 5.4, 54, 0x9a9270);
    B(0, -1.8, 0, 66, 1.5, 56, 0xe0cfa4);
    B(0, -0.7, 0, 61, 1.6, 51, island.grass ?? 0x8fa65c);
    B(0, 0.05, 0, 59, 0.3, 49, island.grassTop ?? 0x9cb266);
    for (let i = 0; i < 90; i += 1) {
      const a = (i / 90) * Math.PI * 2;
      D(Math.cos(a) * 31, -1.4 - rand() * 0.6, Math.sin(a) * 26.5, 1.4 + rand() * 2.4, 1.2 + rand() * 1.6, 1.4 + rand() * 2.4, i % 2 ? 0xb3a888 : 0xc7bb96);
    }
    B(0, 0.2, 24, 7, 0.24, 8, 0xc0a077);
    for (let i = 0; i < 5; i += 1) B(-2.4 + i * 1.2, -0.6, 27, 0.34, 2, 0.34, 0x8a7350);
    for (const sx of [-3.2, 3.2]) B(sx, 1.4, 21.5, 0.28, 2.8, 0.28, 0x8a7350);
    // A board on a post beside the landing, not a banner standing on the spot a child
    // lands on: the first building begins where the dock ends.
    B(6.8, 1.7, 21.5, 0.34, 3.4, 0.34, 0x8a7350);
    B(6.8, 3.5, 21.5, 0.9, 0.3, 0.9, 0xb8703f);
    sprite(`${island.name} · ${island.en}`, 6.8, 4.3, 21.5, { width: 8, size: 31 });
  }

  // Greenery, kept off the paths and away from every place a child has to stand.
  function scatter(island, count = 120) {
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * 56;
      const z = (rand() - 0.5) * 46;
      if (island.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < 9)) continue;
      if (Math.abs(x) < 4 && z > 8) continue;
      if (i % 4 === 0) tree(x, z, 0.7 + rand() * 0.6);
      else { D(x, 0.4, z, 0.06, 0.5, 0.06, 0x5f7a52); D(x, 0.7, z, 0.3, 0.22, 0.3, i % 3 ? 0xf0d98a : 0xe89bb0); }
    }
  }

  // The beam over wherever the island says to go next.
  function makeBeacon() {
    beacon = new THREE.Group();
    beacon.visible = false;
    root.add(beacon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    ring.renderOrder = 2;
    beacon.add(ring);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    column.position.y = 6;
    beacon.add(column);
    beacon.userData.ring = ring;
  }

  // The doorway of a building, recorded where the island draws one. A child who walks
  // into it goes inside; islands that only put a person on the grass never call this, so
  // there is nothing to walk into and nothing to promise.
  //
  // Takes the same two numbers the island gave `house()` - how far back it was drawn and
  // how deep it is - and works out where its front wall is. The doorway is the strip
  // just in front of that wall, which is exactly as close as the wall's own collision
  // lets a child get, and therefore where they end up when they walk to the place.
  function door(def, backset = 4.6, depth = 6.4) {
    doors.push({ def, x: def.x, z: def.z - backset + depth / 2 + 0.75 });
  }

  // The doorway the player is standing in, if any.
  function doorNear(playerObject) {
    const lx = playerObject.position.x - root.position.x;
    const lz = playerObject.position.z - root.position.z;
    for (const d of doors) {
      if (Math.abs(lx - d.x) < 1.4 && Math.abs(lz - d.z) < 1.4) return d.def;
    }
    return null;
  }

  // A resident with a nameplate, at one of the island's spots.
  function resident(def) {
    const npc = person(Number(def.color), 0xe8c39a, def.x, def.z);
    const label = sprite(def.character, def.x, 3.5, def.z, { width: 4.4, size: 40, depthTest: false });
    const ja = sprite(def.ja, def.x, 2.95, def.z, { width: 6.6, size: 30, background: '#1c3b2fdd', color: '#dff0d4', depthTest: false });
    ja.visible = false;
    spots.push({ def, npc, label, ja });
  }

  function construct() {
    if (built || !data) return;
    built = true;
    ground(data);
    build({ island: data, B, D, sprite, person, house, path, tree, resident, door, ground, scatter, rand, obstacles });
    makeBeacon();
    flushDeco();
    setTarget(targetId);
  }

  function setTarget(spotId) {
    targetId = spotId || '';
    if (!beacon) return;
    const spot = data?.spots.find((sp) => sp.id === targetId);
    beacon.visible = !!spot;
    if (spot) beacon.position.set(spot.x, 0, spot.z);
  }

  function update(t, player) {
    if (!root.visible || !built) return;
    for (const sp of spots) {
      const dist = Math.hypot(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      sp.npc.position.y = Math.sin(t * 1.4 + sp.def.x) * 0.05;
      if (dist < 14) sp.npc.rotation.y = Math.atan2(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      sp.label.visible = dist < LABEL_DISTANCE;
      sp.ja.visible = dist < NEAR_DISTANCE + 2;
      sp.label.position.y = 3.5 + Math.sin(t * 1.6 + sp.def.z) * 0.06;
    }
    if (beacon?.visible) {
      beacon.userData.ring.rotation.z = t * 0.8;
      beacon.userData.ring.position.y = 0.4 + Math.sin(t * 1.8) * 0.12;
    }
  }

  // Nearest spot the child is actually standing at, or null.
  function nearest(player) {
    if (!built || !root.visible) return null;
    let best = null;
    for (const sp of spots) {
      const dist = Math.hypot(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      if (dist <= NEAR_DISTANCE && (!best || dist < best.dist)) best = { spot: sp.def, dist };
    }
    return best;
  }

  function blocked(x, z) {
    if (!built) return false;   // nothing to collide with until the island exists
    const lx = x - root.position.x;
    const lz = z - root.position.z;
    if (Math.abs(lx) > HALF_X || Math.abs(lz) > HALF_Z) return true;
    return obstacles.some((o) => Math.abs(lx - o.x) < o.w + 0.35 && Math.abs(lz - o.z) < o.d + 0.35);
  }

  function drawMap(ctx, player) {
    if (!built || !root.visible) return false;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#4b8090';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = data.grassTop ? '#' + Number(data.grassTop).toString(16).padStart(6, '0') : '#9cb266';
    ctx.fillRect(12, 10, 156, 120);
    const px = (x) => 90 + (x / HALF_X) * 76;
    const py = (z) => 70 + (z / HALF_Z) * 58;
    for (const sp of spots) {
      const target = sp.def.id === targetId;
      ctx.fillStyle = target ? '#ffd98a' : sp.def.kind === 'plaza' ? '#f0e3bd' : '#3c5a4a';
      ctx.beginPath();
      ctx.arc(px(sp.def.x), py(sp.def.z), target ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px(player.position.x - root.position.x), py(player.position.z - root.position.z), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12333a';
    ctx.font = '10px sans-serif';
    ctx.fillText(data.name, 16, 24);
    return true;
  }

  return {
    get data() { return data; },
    get spots() { return data?.spots || []; },
    get target() { return targetId; },
    get visible() { return root.visible; },
    // Called once the island's data file has arrived.
    receive(d) { data = d; if (wanted) { construct(); root.visible = true; } },
    show(on) {
      wanted = !!on;
      if (on) construct();
      root.visible = !!on && built;
      if (!on && beacon) beacon.visible = false; else setTarget(targetId);
    },
    setTarget, update, nearest, blocked, drawMap, doorNear,
    get doors() { return doors.map((d) => ({ id: d.def.id, x: d.x, z: d.z })); },
    origin: () => ({ x: root.position.x, z: root.position.z }),
  };
}
