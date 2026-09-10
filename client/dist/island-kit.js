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

// Lighten or darken a hex colour. Voxel work reads as built rather than blocky when the
// same wood or plaster appears in two or three tones, and one number is cheaper to keep
// consistent than a second palette.
export function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return c.getHex();
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
  const lit = [];               // materials that come on at night: windows, lamps, fires
  const D = (x, y, z, w, h, d, color, glow = 0, flat = false) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    const key = `${color}:${glow}:${flat ? 1 : 0}`;
    if (!deco.has(key)) deco.set(key, { color, glow, flat, list: [] });
    deco.get(key).list.push(m);
  };
  // The ground itself: thousands of tiles that receive shadows but never cast them.
  // Left casting, every blade of the island shadows the one beside it and the whole
  // place goes dark.
  const G = (x, y, z, w, h, d, color) => D(x, y, z, w, h, d, color, 0, true);
  function flushDeco() {
    for (const { color, glow, flat, list } of deco.values()) {
      // Each lit colour gets its own material instance, so turning the lights up at
      // night does not also make the roofs glow.
      const material = glow ? mat(color, 0).clone() : mat(color);
      if (glow) { material.emissive = new THREE.Color(color); material.emissiveIntensity = 0; lit.push({ material, glow }); }
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !flat;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    deco.clear();
  }

  // The islands are lit by the world's clock: the windows and the lamp posts come on as
  // the sky goes over, which is the same number every child in the class is seeing.
  function setNight(night) {
    const n = Math.max(0, Math.min(1, night || 0));
    for (const { material, glow } of lit) material.emissiveIntensity = glow * n;
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

  // A building with a front: plinth, timber framing, shuttered windows that light up at
  // night, a porch over the door, eaves, a ridge, a chimney, and its name hanging from a
  // bracket rather than floating in the air. Everything is instanced, so a house of
  // fifty pieces still costs the island nothing to draw.
  function house(x, z, w, d, wall, roof, name) {
    const hx = w / 2;
    const hz = d / 2;
    const front = z + hz;
    const dark = shade(wall, -0.22);
    const beam = 0x6f5b3e;
    const ridge = shade(roof, -0.18);

    // Plinth and a step up to the door.
    D(x, 0.35, z, w + 0.9, 0.7, d + 0.9, 0xa89d84);
    D(x, 0.2, front + 0.85, 2.6, 0.4, 1.1, 0xbdb193);
    D(x, 0.35, z, w + 0.2, 0.12, d + 0.2, shade(0xa89d84, 0.12));

    // Walls, with corner posts and a beam under the eaves.
    D(x, 2.5, z, w, 3.8, d, wall);
    for (const sx of [-hx, hx]) for (const sz of [-hz, hz]) D(x + sx, 2.5, z + sz, 0.42, 3.9, 0.42, beam);
    D(x, 4.42, z, w + 0.25, 0.3, d + 0.25, beam);
    D(x, 0.75, z, w + 0.12, 0.5, d + 0.12, dark);          // a darker course along the bottom

    // Roof: overhanging eaves, then courses in, then a ridge along the top.
    for (let i = 0; i < 5; i += 1) {
      D(x, 4.75 + i * 0.44, z, w + 1.5 - i * 0.56, 0.44, d + 1.5 - i * 0.56, i % 2 ? roof : shade(roof, -0.07));
    }
    D(x, 6.95, z, Math.max(1, w - 1.6), 0.3, Math.max(1, d - 1.6), ridge);
    // Rafter ends under the front eave: the detail that says "built" rather than "boxed".
    for (let i = 0; i * 1.1 < w - 0.6; i += 1) D(x - hx + 0.6 + i * 1.1, 4.62, front + 0.62, 0.22, 0.22, 0.5, beam);
    // Chimney, on the back half so it never hides the sign.
    D(x + hx * 0.55, 6.4, z - hz * 0.5, 0.9, 2.6, 0.9, 0x8c7b63);
    D(x + hx * 0.55, 7.75, z - hz * 0.5, 1.15, 0.3, 1.15, 0x6f6152);

    // Door, recessed, with a frame, a handle and a porch over it.
    D(x, 1.5, front + 0.02, 1.5, 2.8, 0.3, shade(beam, -0.1));
    D(x, 1.45, front + 0.14, 1.2, 2.5, 0.16, 0x50412f);
    D(x + 0.42, 1.45, front + 0.24, 0.14, 0.14, 0.12, 0xf1d489, 1.4);
    D(x, 3.15, front + 0.55, 2.4, 0.22, 1.1, roof);
    for (const sx of [-1.0, 1.0]) D(x + sx, 2.9, front + 1.0, 0.16, 0.5, 0.16, beam);

    // Windows: frame, glass that lights at night, shutters, and a sill.
    for (const sx of [-hx * 0.55, hx * 0.55]) {
      D(x + sx, 2.75, front + 0.06, 1.35, 1.35, 0.14, beam);
      D(x + sx, 2.75, front + 0.15, 1.05, 1.05, 0.1, 0xffe6ad, 1.25);
      D(x + sx, 2.75, front + 0.2, 1.1, 0.1, 0.06, beam);
      D(x + sx, 2.75, front + 0.2, 0.1, 1.1, 0.06, beam);
      D(x + sx, 2.05, front + 0.22, 1.5, 0.16, 0.42, beam);
      for (const shutter of [-0.78, 0.78]) D(x + sx + shutter, 2.75, front + 0.12, 0.42, 1.4, 0.12, shade(roof, 0.05));
    }
    // A window on each side too, so the building has more than one face.
    for (const side of [-1, 1]) {
      D(x + side * (hx + 0.06), 2.8, z - hz * 0.3, 0.14, 1.2, 1.2, beam);
      D(x + side * (hx + 0.14), 2.8, z - hz * 0.3, 0.1, 0.95, 0.95, 0xffe6ad, 1.1);
    }

    obstacles.push({ x, z, w: hx + 0.4, d: hz + 0.4 });
    // The name hangs from a bracket by the door, at reading height.
    D(x - hx - 0.1, 3.5, front - 0.4, 0.22, 0.22, 1.4, beam);
    sprite(name, x, 5.9, front + 0.7, { width: Math.max(6, name.length * 0.52) });
    return null;
  }

  // A paved way: irregular flagstones, gravel edging, and a lamp post every few paces
  // that comes on with the evening.
  function path(ax, az, bx, bz) {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(length / 1.35));
    const nx = (bz - az) / (length || 1);
    const nz = -(bx - ax) / (length || 1);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const wobble = (rand() - 0.5) * 0.5;
      D(px + nx * wobble, 0.17, pz + nz * wobble, 1.5 + rand() * 0.5, 0.14, 1.5 + rand() * 0.5, i % 3 ? 0xd9c9a2 : 0xcdbc8f);
      // Loose gravel either side, so the path has an edge rather than a border.
      for (const side of [-1, 1]) {
        if (rand() > 0.55) continue;
        D(px + nx * side * (1.1 + rand() * 0.4), 0.14, pz + nz * side * (1.1 + rand() * 0.4), 0.4 + rand() * 0.4, 0.1, 0.4 + rand() * 0.4, rand() > 0.5 ? 0xc6b58c : 0xb8a87f);
      }
      if (i % 5 === 2) lamp(px + nx * 1.9, pz + nz * 1.9);
    }
  }

  // A lamp post. Dark by day, warm at night — the same light the windows use.
  function lamp(x, z) {
    D(x, 0.2, z, 0.8, 0.4, 0.8, 0x8d8570);
    D(x, 1.8, z, 0.26, 3.2, 0.26, 0x6f5b3e);
    D(x, 3.5, z, 0.7, 0.16, 0.7, 0x6f5b3e);
    D(x, 3.22, z, 0.5, 0.5, 0.5, 0xffdda0, 2.2);
    D(x, 3.7, z, 0.34, 0.2, 0.34, 0x6f5b3e);
  }

  // Three kinds of tree, because a wood of one kind reads as wallpaper. The kind is
  // chosen from the position, so an island looks the same every time it is built.
  function tree(x, z, scale = 1, kind = -1) {
    const k = kind >= 0 ? kind : Math.floor(rand() * 3);
    const trunk = 0x7a6448;
    if (k === 0) {                                   // broad and round
      D(x, 1.4 * scale, z, 0.55 * scale, 2.8 * scale, 0.55 * scale, trunk);
      D(x, 3.1 * scale, z, 3.2 * scale, 1.6 * scale, 3.2 * scale, 0x6d9d5e);
      D(x, 4.1 * scale, z, 2.3 * scale, 1.1 * scale, 2.3 * scale, 0x7fb069);
      D(x - 0.7 * scale, 3.4 * scale, z + 0.6 * scale, 1.5 * scale, 1.0 * scale, 1.5 * scale, 0x87b872);
    } else if (k === 1) {                            // a pine, in steps
      D(x, 1.6 * scale, z, 0.5 * scale, 3.2 * scale, 0.5 * scale, shade(trunk, -0.1));
      for (let i = 0; i < 4; i += 1) {
        D(x, (2.9 + i * 0.85) * scale, z, (3.2 - i * 0.7) * scale, 0.9 * scale, (3.2 - i * 0.7) * scale, i % 2 ? 0x4f7850 : 0x5c8854);
      }
    } else {                                         // tall, with a leaning crown
      D(x, 2.1 * scale, z, 0.45 * scale, 4.2 * scale, 0.45 * scale, trunk);
      D(x, 4.3 * scale, z, 2.4 * scale, 1.2 * scale, 2.4 * scale, 0x719453);
      D(x + 0.5 * scale, 5.1 * scale, z - 0.3 * scale, 1.7 * scale, 0.9 * scale, 1.7 * scale, 0x86a95e);
    }
    // A little shadow of undergrowth at the foot, which hides the join with the ground.
    D(x + (rand() - 0.5), 0.25, z + (rand() - 0.5), 1.1 * scale, 0.3, 1.1 * scale, 0x5f7a4a);
  }

  // Small things that make a place look lived in. None of them collide: a child walking
  // through a flowerbed is not a bug worth the frustration of an invisible wall.
  function bush(x, z, s = 1) {
    D(x, 0.5 * s, z, 1.5 * s, 1.0 * s, 1.5 * s, 0x5d8b4f);
    D(x + 0.35 * s, 0.85 * s, z - 0.2 * s, 1.0 * s, 0.7 * s, 1.0 * s, 0x6f9c58);
  }
  function flowers(x, z, colour = 0xf0d98a) {
    for (let i = 0; i < 3; i += 1) {
      const fx = x + (rand() - 0.5) * 1.6;
      const fz = z + (rand() - 0.5) * 1.6;
      D(fx, 0.4, fz, 0.07, 0.5, 0.07, 0x5f7a52);
      D(fx, 0.72, fz, 0.3, 0.24, 0.3, colour);
    }
  }
  function rock(x, z, s = 1) {
    D(x, 0.35 * s, z, 1.6 * s, 0.9 * s, 1.4 * s, 0x9a9585);
    D(x + 0.4 * s, 0.8 * s, z + 0.2 * s, 0.9 * s, 0.7 * s, 0.8 * s, 0xa8a391);
  }
  function barrel(x, z) {
    D(x, 0.55, z, 0.9, 1.1, 0.9, 0x8a6a45);
    D(x, 0.35, z, 0.98, 0.14, 0.98, 0x6d543a);
    D(x, 0.78, z, 0.98, 0.14, 0.98, 0x6d543a);
  }
  function crate(x, z, s = 1) {
    D(x, 0.45 * s, z, 1.1 * s, 0.9 * s, 1.1 * s, 0xb08655);
    D(x, 0.9 * s, z, 1.16 * s, 0.1 * s, 1.16 * s, 0x8d6b44);
  }
  function bench(x, z, facing = 0) {
    const dx = Math.sin(facing);
    const dz = Math.cos(facing);
    D(x, 0.55, z, 2.4 - dz * 0 , 0.16, 0.8, 0xa58c62);
    D(x - dx * 0.35, 1.05, z - dz * 0.35, 2.4, 0.7, 0.16, 0xa58c62);
    for (const side of [-0.9, 0.9]) D(x + side * dz, 0.28, z + side * dx, 0.18, 0.55, 0.6, 0x7b6647);
  }
  function fence(x, z, count, axis = 'x') {
    for (let i = 0; i < count; i += 1) {
      const fx = x + (axis === 'x' ? i * 1.5 : 0);
      const fz = z + (axis === 'z' ? i * 1.5 : 0);
      D(fx, 0.85, fz, 0.18, 1.5, 0.18, 0xd4c49b);
      if (i < count - 1) {
        D(fx + (axis === 'x' ? 0.75 : 0), 1.0, fz + (axis === 'z' ? 0.75 : 0), axis === 'x' ? 1.5 : 0.14, 0.14, axis === 'z' ? 1.5 : 0.14, 0xddcda5);
        D(fx + (axis === 'x' ? 0.75 : 0), 0.55, fz + (axis === 'z' ? 0.75 : 0), axis === 'x' ? 1.5 : 0.14, 0.14, axis === 'z' ? 1.5 : 0.14, 0xddcda5);
      }
    }
  }
  // Bunting between two posts: the cheapest way to make a square feel like an occasion.
  function bunting(ax, az, bx, bz, height = 4.2) {
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
    const colours = [0xe4708a, 0xf0c05a, 0x7ec98a, 0x6aa9d4];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const sag = Math.sin(t * Math.PI) * 0.55;
      D(ax + (bx - ax) * t, height - sag, az + (bz - az) * t, 0.4, 0.5, 0.1, colours[i % colours.length]);
    }
  }


  // The terrain, the dock and the shore every island starts from.
  //
  // The land is laid as tiles inside an ellipse rather than as one slab, so the island
  // has a coastline instead of four corners: grass in the middle, a sand shelf at the
  // edge, rocks and foam where it meets the water. Low rises break the flatness. All of
  // it is instanced, so a few thousand tiles cost a handful of draw calls.
  function ground(island) {
    root.position.set(island.x, 0, island.z);
    const grass = island.grass ?? 0x8fa65c;
    const grassTop = island.grassTop ?? 0x9cb266;
    const sand = 0xe0cfa4;
    const soil = 0x8a7a5c;
    const RX = 31;
    const RZ = 26;

    // Where the ground rises. Kept away from the middle and from the landing, so no
    // building or path ever has to climb.
    const hills = [
      { x: -21, z: -14, r: 9 }, { x: 22, z: -12, r: 8 },
      { x: -24, z: 11, r: 7 }, { x: 19, z: 15, r: 6.5 },
    ];
    const lift = (x, z) => {
      let h = 0;
      for (const hill of hills) {
        const d = Math.hypot(x - hill.x, z - hill.z) / hill.r;
        if (d < 1) h = Math.max(h, Math.cos(d * Math.PI / 2) * 2.2);
      }
      return Math.round(h * 2) / 2;
    };
    ground.lift = lift;

    // Each tile is a face of grass or sand on a column of soil, the way a voxel world
    // shows its ground: the cliff at the shore is then soil, not a slab of lawn.
    for (let x = -RX; x <= RX; x += 2) {
      for (let z = -RZ; z <= RZ; z += 2) {
        const e = (x / RX) ** 2 + (z / RZ) ** 2;
        if (e > 1.04) continue;
        const beach = e > 0.94;
        const y = beach ? 0 : lift(x, z);
        const top = beach ? sand : (x * 7 + z * 3) % 5 === 0 ? grassTop : grass;
        // The top face lands on y = 0.2, which is the ground everything else on the
        // island is built to stand on.
        G(x, -0.15 + y, z, 2.02, 0.7, 2.02, top);
        G(x, -2.1 + y / 2, z, 2.02, 3.2 + y, 2.02, beach ? shade(sand, -0.16) : soil);
        if (!beach && y > 0.4 && rand() > 0.88) rock(x + rand() - 0.5, z + rand() - 0.5, 0.5 + rand() * 0.5);
      }
    }
    // Where the sand meets the water: wet sand, then foam, then rocks standing in it.
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      G(cx * (RX + 1.1), -0.55, cz * (RZ + 1.1), 2.4, 0.8, 2.4, shade(sand, -0.06));
      G(cx * (RX + 2.4), -1.1, cz * (RZ + 2.4), 1.8 + rand(), 0.5, 1.8 + rand(), 0xd8e7dd);
      if (rand() > 0.85) {
        const s = 0.6 + rand() * 0.7;
        D(cx * (RX + 1.6), -0.35, cz * (RZ + 1.6), 1.5 * s, 1.3 * s, 1.4 * s, rand() > 0.5 ? 0x8d9aa0 : 0x9a9585);
      }
    }

    // The landing: planks with gaps, mooring posts with a rope, a lantern and a rowing
    // boat tied alongside — the first thing anyone sees of the island.
    for (let i = 0; i < 7; i += 1) D(0, 0.2, 21 + i * 1.1, 7, 0.22, 0.95, i % 2 ? 0xc0a077 : 0xb79768);
    for (let i = 0; i < 6; i += 1) D(-2.6 + i * 1.05, -0.6, 27, 0.34, 2, 0.34, 0x8a7350);
    for (const sx of [-3.3, 3.3]) {
      D(sx, 1.2, 21.5, 0.34, 2.6, 0.34, 0x8a7350);
      D(sx, 2.5, 21.5, 0.5, 0.3, 0.5, 0x6d543a);
    }
    D(0, 2.35, 21.5, 6.6, 0.12, 0.12, 0xb9a075);          // the rope between the posts
    lamp(3.3, 24.5);
    // A boat: hull, seat, and two oars leaning on the gunwale.
    D(5.2, -0.35, 25.5, 2.0, 0.7, 4.4, 0x8a6a45);
    D(5.2, 0.05, 25.5, 1.5, 0.3, 3.8, 0x6d543a);
    D(5.2, 0.35, 25.5, 1.7, 0.16, 0.7, 0xa58c62);
    D(6.0, 0.7, 25.2, 0.14, 0.14, 2.6, 0xa58c62);

    // The island's name on a post beside the landing, not on the spot a child lands on.
    D(6.8, 1.7, 21.5, 0.34, 3.4, 0.34, 0x8a7350);
    D(6.8, 3.5, 21.5, 0.9, 0.3, 0.9, 0xb8703f);
    sprite(`${island.name} · ${island.en}`, 6.8, 4.3, 21.5, { width: 8, size: 31 });
  }

  // Greenery, kept off the paths and away from every place a child has to stand. Trees
  // gather in loose groups rather than spreading evenly, because an evenly planted
  // island reads as a lawn with obstacles on it.
  function scatter(island, count = 120) {
    const clear = (x, z, r = 9) => !island.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < r)
      && !(Math.abs(x) < 5 && z > 8);
    // A handful of copses, then everything else scattered between them.
    for (let g = 0; g < 5; g += 1) {
      const gx = (rand() - 0.5) * 48;
      const gz = (rand() - 0.5) * 40;
      if (!clear(gx, gz, 12)) continue;
      const kind = Math.floor(rand() * 3);
      for (let i = 0; i < 4 + Math.floor(rand() * 4); i += 1) {
        const x = gx + (rand() - 0.5) * 9;
        const z = gz + (rand() - 0.5) * 9;
        if (!clear(x, z)) continue;
        tree(x, z, 0.75 + rand() * 0.55, kind);
      }
    }
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * 54;
      const z = (rand() - 0.5) * 44;
      if ((x / 27) ** 2 + (z / 22) ** 2 > 1) continue;      // stay on the land
      if (!clear(x, z, 7)) continue;
      const roll = rand();
      if (roll > 0.88) tree(x, z, 0.7 + rand() * 0.6);
      else if (roll > 0.7) bush(x, z, 0.7 + rand() * 0.6);
      else if (roll > 0.62) rock(x, z, 0.5 + rand() * 0.5);
      else flowers(x, z, [0xf0d98a, 0xe89bb0, 0xdfe4ef, 0xe7b06a][Math.floor(rand() * 4)]);
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
    build({ island: data, B, D, sprite, person, house, path, tree, resident, door, ground, scatter, rand, obstacles,
      shade, lamp, bush, flowers, rock, barrel, crate, bench, fence, bunting });
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
    setTarget, update, nearest, blocked, drawMap, doorNear, setNight,
    get doors() { return doors.map((d) => ({ id: d.def.id, x: d.x, z: d.z })); },
    origin: () => ({ x: root.position.x, z: root.position.z }),
  };
}
