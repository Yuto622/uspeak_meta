// じぶんの しま — the island a child owns, walked around in a scene of its own.
//
// Like マイルーム (room-world.js): an independent THREE.Scene the child is moved into
// from the ferry, built from what the server says they own (`land:island`: tier, size,
// theme), and left by walking back onto the jetty. Nothing here decides anything —
// the tier is the server's — this file only knows how each of the six islands looks.
//
// Six themes, each a different world rather than a bigger square (that is what the
// research said children remember: docs/uspeak-land-research.md). Everything is boxes,
// cones and spheres, so a class of iPads can walk six islands without downloading one
// model, and the sign at the jetty carries the child's own name.
import * as THREE from './three.module.js';
import { say, live } from './canvas-say.js';

const THEMES = {
  sand:   { ground: 0xf0dca0, edge: 0xd9bf7e, sky: 0x9fd3ea, water: 0x3b9ab8, fog: 0xbfe3f0 },
  grass:  { ground: 0x8fb36a, edge: 0x6f8f4a, sky: 0x9fd3ea, water: 0x3b9ab8, fog: 0xbfe3f0 },
  forest: { ground: 0x5f8a4a, edge: 0x4a6e3a, sky: 0x8fc3dc, water: 0x2f7f98, fog: 0xa9d2df },
  flower: { ground: 0xa6cf74, edge: 0x7f9f55, sky: 0xaee0f2, water: 0x4aa7c2, fog: 0xcdeaf3 },
  snow:   { ground: 0xf2f4f8, edge: 0xc9d6e2, sky: 0xc7dcea, water: 0x6fa3c0, fog: 0xdce8f0 },
  sky:    { ground: 0xe8eef7, edge: 0xffd766, sky: 0x4a6fb0, water: null, fog: 0x7e9ccf },
};

export function createLand({ player, camera, view, toast, onLeave }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a7a55, 1.7));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(12, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun);
  const built = new THREE.Group();
  scene.add(built);

  const state = { active: false, island: null, obstacles: [], spin: [], smoke: [], stars: [] };
  let parent = null;
  let cooldown = 0;
  let wasFirstPerson = false;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const mat = (color, glow = 0, opacity = 1) => {
    const key = `${color}:${glow}:${opacity}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color, roughness: 0.85, emissive: glow ? color : 0x000000, emissiveIntensity: glow,
        transparent: opacity < 1, opacity,
      }));
    }
    return materials.get(key);
  };
  const B = (x, y, z, w, h, d, color, glow = 0, opacity = 1) => {
    const m = new THREE.Mesh(geo, mat(color, glow, opacity));
    m.position.set(x, y, z); m.scale.set(w, h, d);
    m.castShadow = opacity === 1; m.receiveShadow = true;
    built.add(m); return m;
  };
  const cone = (x, y, z, r, h, color, sides = 8, glow = 0) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, sides), mat(color, glow));
    m.position.set(x, y, z); m.castShadow = true; built.add(m); return m;
  };
  const ball = (x, y, z, r, color, glow = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat(color, glow));
    m.position.set(x, y, z); m.castShadow = true; built.add(m); return m;
  };
  const block = (x, z, w, d) => state.obstacles.push({ x, z, w, d });

  // The sign with the child's own name on it, re-painted when the language changes.
  let sign = null;
  function makeSign(owner, x, z) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    const paint = () => {
      const c = canvas.getContext('2d');
      c.fillStyle = '#f7f1e1'; c.fillRect(0, 0, 512, 160);
      c.fillStyle = '#1b3a2f'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center';
      c.fillText(say(`${owner}の しま`), 256, 70);
      c.font = '30px sans-serif'; c.fillStyle = '#7a5a3e';
      c.fillText(`${owner}'s Island`, 256, 122);
      if (sign) sign.material.map.needsUpdate = true;
    };
    paint();
    const tex = new THREE.CanvasTexture(canvas);
    sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(x, 2.1, z); built.add(sign);
    B(x, 1.0, z - 0.05, 0.16, 2.0, 0.16, 0x6d543a);
    live(paint);
  }

  // ---- the six islands ------------------------------------------------------------
  const tree = (x, z, trunk = 0x6d543a, leaf = 0x4e9a3f, s = 1) => {
    B(x, 0.9 * s, z, 0.4 * s, 1.8 * s, 0.4 * s, trunk);
    B(x, 2.2 * s, z, 1.8 * s, 1.4 * s, 1.8 * s, leaf); B(x, 3.1 * s, z, 1.1 * s, 0.9 * s, 1.1 * s, leaf);
    block(x, z, 0.4 * s, 0.4 * s);
  };
  const pine = (x, z, s = 1, lit = false) => {
    B(x, 0.5 * s, z, 0.34 * s, 1.0 * s, 0.34 * s, 0x5a4330);
    for (let i = 0; i < 3; i += 1) cone(x, (1.3 + i * 0.9) * s, z, (1.4 - i * 0.35) * s, 1.3 * s, 0x2f6a3a, 6);
    if (lit) for (let i = 0; i < 6; i += 1) ball(x + Math.cos(i * 1.05) * 0.7 * s, (1.1 + (i % 3) * 0.8) * s, z + Math.sin(i * 1.05) * 0.7 * s, 0.1, [0xffd766, 0xe0566a, 0x6fd0ff][i % 3], 1.5);
    block(x, z, 0.4 * s, 0.4 * s);
  };
  const palm = (x, z) => {
    for (let i = 0; i < 5; i += 1) B(x + i * 0.12, 0.4 + i * 0.7, z, 0.34, 0.75, 0.34, 0x9a7a4a);
    for (let i = 0; i < 4; i += 1) { const a = i * Math.PI / 2 + 0.4; B(x + 0.6 + Math.cos(a) * 0.9, 4.1, z + Math.sin(a) * 0.9, i % 2 ? 2.0 : 0.5, 0.14, i % 2 ? 0.5 : 2.0, 0x4e9a3f); }
    B(x + 0.6, 3.75, z, 0.5, 0.4, 0.5, 0x7a4a2a);
    block(x, z, 0.3, 0.3);
  };
  const house = (x, z, w, d, wall, roof, roofH = 1.4) => {
    B(x, 1.4, z, w, 2.8, d, wall);
    B(x, 2.95, z, w + 0.6, 0.3, d + 0.6, roof);
    B(x, 3.3, z, w * 0.72, 0.5, d * 0.72, roof);
    B(x, 3.3 + roofH * 0.5, z, w * 0.36, roofH, d * 0.36, roof);
    B(x, 0.95, z + d / 2 + 0.02, 1.0, 1.9, 0.1, 0x5a3a22);
    B(x - w * 0.3, 1.7, z + d / 2 + 0.02, 0.9, 0.8, 0.08, 0x9fd6e8, 0.4);
    B(x + w * 0.3, 1.7, z + d / 2 + 0.02, 0.9, 0.8, 0.08, 0x9fd6e8, 0.4);
    block(x, z, w / 2, d / 2);
  };
  const lantern = (x, z) => { B(x, 0.9, z, 0.14, 1.8, 0.14, 0x3b3b40); B(x, 1.9, z, 0.4, 0.4, 0.4, 0xffd98a, 1.4); };
  const flowerbed = (x, z, w, d) => {
    B(x, 0.12, z, w, 0.2, d, 0x6b5a40);
    const cols = [0xe0566a, 0xf0c84a, 0xf3ecd8, 0xc47ad8];
    for (let i = 0; i < w * d * 1.5; i += 1) B(x - w / 2 + 0.3 + Math.random() * (w - 0.6), 0.4, z - d / 2 + 0.3 + Math.random() * (d - 0.6), 0.22, 0.3, 0.22, cols[i % 4]);
  };

  const BUILD = {
    sand(half) {
      palm(-half + 3.5, -half + 3.5); palm(half - 4, -half + 5);
      // The tent: a four-sided cone, and a flap.
      cone(0, 1.3, -2, 2.4, 2.6, 0xe0566a, 4).rotation.y = Math.PI / 4;
      B(0, 0.55, 0.2, 0.9, 1.1, 0.1, 0xf3ecd8); block(0, -2, 1.6, 1.6);
      // The campfire and its stones, a flame that glows.
      for (let i = 0; i < 8; i += 1) B(4 + Math.cos(i * 0.785) * 0.9, 0.25, 2 + Math.sin(i * 0.785) * 0.9, 0.4, 0.3, 0.4, 0x8c917c);
      B(4, 0.32, 2, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = 0.7; B(4, 0.42, 2, 1.0, 0.22, 0.26, 0x6c553c).rotation.y = -0.7;
      const fire = cone(4, 0.95, 2, 0.4, 1.0, 0xff9a3c, 6, 1.8); state.spin.push({ m: fire, k: 3 }); block(4, 2, 0.9, 0.9);
      // Starfish and shells on the sand, a beach ball.
      for (const [sx, sz] of [[-3, 3], [2, -4], [-4.5, -2]]) { B(sx, 0.12, sz, 0.7, 0.12, 0.22, 0xf08a2a); B(sx, 0.12, sz, 0.22, 0.12, 0.7, 0xf08a2a); }
      for (const [sx, sz] of [[3.5, 4.5], [-2, -3.5], [5, -3]]) ball(sx, 0.18, sz, 0.18, 0xf3ecd8);
      ball(-3.5, 0.5, 4.5, 0.5, 0xe0566a); B(-3.5, 0.5, 4.5, 0.3, 1.0, 1.02, 0xf3ecd8);
    },
    grass(half) {
      house(-2, -3, 4.2, 3.4, 0xd9b45c, 0x8a4a3a);
      // A fence round a little yard, three trees, a flower bed and a dog house.
      for (let i = -3; i <= 3; i += 1) { B(2.5 + i * 1.0, 0.5, half - 3.5, 0.14, 1.0, 0.14, 0xd4c49b); if (i < 3) B(3.0 + i * 1.0, 0.7, half - 3.5, 1.0, 0.1, 0.1, 0xddcda5); }
      tree(half - 3, -half + 3); tree(-half + 3, half - 4); tree(half - 3.5, 2.5);
      flowerbed(3.5, -2, 3, 2);
      B(-5, 0.6, 3.5, 1.3, 1.2, 1.3, 0xb4703f); cone(-5, 1.6, 3.5, 1.1, 0.9, 0x8a4a3a, 4).rotation.y = Math.PI / 4; B(-5, 0.45, 4.2, 0.6, 0.8, 0.1, 0x3b3b40); block(-5, 3.5, 0.7, 0.7);
      ball(-3.5, 0.35, 4.5, 0.35, 0xf3ecd8);
    },
    forest(half) {
      // Logs stacked into a house, and trees all round.
      for (let i = 0; i < 5; i += 1) { B(0, 0.35 + i * 0.5, -3, 5.0, 0.48, 3.6, i % 2 ? 0x8a6a45 : 0x7a5a3a); }
      B(0, 3.0, -3, 5.8, 0.3, 4.4, 0x5a4330); B(0, 3.5, -3, 4.0, 0.7, 3.0, 0x5a4330); B(0, 4.2, -3, 1.8, 0.7, 1.4, 0x5a4330);
      B(0, 0.9, -1.15, 1.0, 1.8, 0.1, 0x3b2a1a); B(1.6, 1.6, -1.15, 0.8, 0.7, 0.08, 0xffd98a, 0.9); block(0, -3, 2.6, 1.9);
      for (let i = 0; i < 9; i += 1) { const a = i * 0.7 + 0.3; const r = half - 2.6; tree(Math.cos(a) * r, Math.sin(a) * r, 0x5a4330, i % 3 ? 0x3f7a35 : 0x4e9a3f, 1 + (i % 2) * 0.25); }
      // The pond and its jetty, and lanterns along the way.
      B(4.5, 0.06, 3.5, 5.0, 0.1, 3.6, 0x4aa7c2, 0.25); block(4.5, 3.5, 2.5, 1.8);
      for (let i = 0; i < 4; i += 1) B(2.4 + i * 0.7, 0.3, 3.5, 0.66, 0.12, 1.2, 0xb49a6a);
      for (let i = 0; i < 3; i += 1) lantern(-4 + i * 2.2, half - 3.2);
      // A swing between two posts.
      for (const sx of [-1, 1]) B(-4.5 + sx * 1.2, 1.3, 1, 0.16, 2.6, 0.16, 0x6d543a);
      B(-4.5, 2.6, 1, 2.6, 0.14, 0.14, 0x6d543a); B(-4.5, 1.0, 1, 1.0, 0.1, 0.4, 0xd9b45c);
      for (const sx of [-1, 1]) B(-4.5 + sx * 0.45, 1.8, 1, 0.04, 1.6, 0.04, 0xf3ecd8);
    },
    flower(half) {
      house(-3, -3.5, 4.4, 3.6, 0xf7f1e1, 0xe0566a, 1.6);
      // Flower fields in stripes, the way they are grown.
      for (let r = 0; r < 4; r += 1) flowerbed(4, -half + 3 + r * 2.4, 6, 1.6);
      // The windmill: a tower, and four blades that turn.
      B(-half + 4, 2.2, half - 5, 1.6, 4.4, 1.6, 0xd9c7a8); cone(-half + 4, 4.9, half - 5, 1.3, 1.2, 0x8a4a3a, 4).rotation.y = Math.PI / 4;
      const blades = new THREE.Group(); blades.position.set(-half + 4, 3.6, half - 4.1);
      for (let i = 0; i < 4; i += 1) { const b = new THREE.Mesh(geo, mat(0xf3ecd8)); b.scale.set(0.34, 3.4, 0.08); b.position.set(0, 1.5, 0); const g = new THREE.Group(); g.rotation.z = i * Math.PI / 2; g.add(b); blades.add(g); }
      built.add(blades); state.spin.push({ m: blades, k: 1.2, axis: 'z' }); block(-half + 4, half - 5, 1.0, 1.0);
      // A fountain in the middle, benches, bunting.
      B(2, 0.3, 2, 3.6, 0.6, 3.6, 0x9a8f7a); B(2, 0.62, 2, 2.8, 0.12, 2.8, 0x6fd0ff, 0.5); B(2, 1.2, 2, 0.5, 1.6, 0.5, 0x9a8f7a); B(2, 2.1, 2, 1.2, 0.2, 1.2, 0x9a8f7a); const jet = B(2, 2.6, 2, 0.3, 0.8, 0.3, 0x9fd6e8, 1.2); state.spin.push({ m: jet, k: 4, bob: true }); block(2, 2, 1.9, 1.9);
      for (const [bx, bz] of [[-2, 3.5], [6, 3.5]]) { B(bx, 0.55, bz, 2.0, 0.14, 0.7, 0xa58c62); B(bx, 0.95, bz - 0.3, 2.0, 0.6, 0.12, 0xa58c62); }
      for (let i = 0; i < 9; i += 1) B(-6 + i * 1.5, 3.2 - Math.abs(i - 4) * 0.08, half - 1.8, 0.5, 0.4, 0.06, [0xe0566a, 0xf0c84a, 0x6fd0ff][i % 3]);
      for (const sx of [-6, 6]) B(sx, 1.7, half - 1.8, 0.12, 3.4, 0.12, 0x6d543a);
    },
    snow(half) {
      house(-2, -3.5, 5.0, 3.8, 0x7a5a3e, 0xf2f4f8, 1.2);
      B(-0.2, 4.3, -4.2, 0.7, 1.4, 0.7, 0x9a8f7a);
      for (let i = 0; i < 4; i += 1) { const s = B(-0.2, 5.3 + i * 0.7, -4.2, 0.5 + i * 0.12, 0.5 + i * 0.12, 0.5 + i * 0.12, 0xf3efe6, 0, 0.35); state.smoke.push({ m: s, base: 5.3 + i * 0.7, i }); }
      // The snowman, lit pines, and a frozen pond with a bench.
      ball(4, 0.7, 2, 0.75, 0xf7f9fc); ball(4, 1.75, 2, 0.55, 0xf7f9fc); ball(4, 2.55, 2, 0.4, 0xf7f9fc);
      B(4, 2.55, 2.42, 0.1, 0.1, 0.3, 0xf08a2a); B(4, 3.0, 2, 0.9, 0.12, 0.9, 0x3b3b40); B(4, 3.3, 2, 0.6, 0.5, 0.6, 0x3b3b40); B(4, 2.05, 2, 1.3, 0.12, 0.18, 0xe0566a); block(4, 2, 0.8, 0.8);
      for (let i = 0; i < 7; i += 1) { const a = i * 0.9; const r = half - 2.6; pine(Math.cos(a) * r, Math.sin(a) * r, 1 + (i % 2) * 0.3, true); }
      B(-4, 0.06, 4, 5.0, 0.1, 3.4, 0xbfe3f0, 0.35); block(-4, 4, 2.5, 1.7);
      for (let i = 0; i < 10; i += 1) ball(-half + 2 + Math.random() * (half * 2 - 4), 0.12, -half + 2 + Math.random() * (half * 2 - 4), 0.14, 0xffffff);
    },
    sky(half) {
      // Clouds under and around the island; stars above.
      for (let i = 0; i < 14; i += 1) { const a = i * 0.45; const r = half + 1.5 + (i % 3); B(Math.cos(a) * r, -1.2 - (i % 2) * 0.6, Math.sin(a) * r, 3 + (i % 3), 1.4, 2.2 + (i % 2), 0xffffff, 0, 0.85); }
      for (let i = 0; i < 24; i += 1) { const s = B(-half + Math.random() * half * 2, 9 + Math.random() * 6, -half + Math.random() * half * 2, 0.18, 0.18, 0.18, 0xffe9a8, 1.6); state.stars.push({ m: s, i }); }
      // The castle: a keep with four towers and a golden gate; a rainbow bridge to it.
      B(0, 2.5, -3, 7.0, 5.0, 5.0, 0xe4e8ef);
      B(0, 5.2, -3, 7.6, 0.4, 5.6, 0xffd766, 0.3);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { B(sx * 3.5, 3.5, -3 + sz * 2.5, 1.6, 7.0, 1.6, 0xd4dbe6); cone(sx * 3.5, 7.9, -3 + sz * 2.5, 1.1, 1.8, 0x4e7fa8, 8); }
      cone(0, 6.6, -3, 1.6, 2.4, 0x4e7fa8, 8); B(0, 8.2, -3, 0.08, 1.2, 0.08, 0x6d543a); B(0.3, 8.5, -3, 0.6, 0.35, 0.06, 0xe0566a);
      B(0, 1.4, -0.45, 1.6, 2.8, 0.14, 0xffd766, 0.6); block(0, -3, 3.5, 2.5);
      for (const sx of [-1, 1]) B(sx * 1.4, 1.8, 3.5, 0.5, 3.6, 0.5, 0xffd766, 0.5); B(0, 3.8, 3.5, 3.4, 0.5, 0.5, 0xffd766, 0.5);
      const rainbow = [0xe0566a, 0xf08a2a, 0xf0c84a, 0x4e9a3f, 0x4e7fa8, 0x6a4ab0, 0xc47ad8];
      rainbow.forEach((c, i) => { for (let k = 0; k <= 10; k += 1) { const a = (k / 10) * Math.PI; B(half - 3 + Math.cos(a) * (4.5 - i * 0.35), 0.5 + Math.sin(a) * (4.5 - i * 0.35), 3, 0.5, 0.3, 0.5, c, 0.5); } });
      // Two statues flanking the way.
      for (const sx of [-1, 1]) { B(sx * 4.5, 0.4, 2, 1.0, 0.8, 1.0, 0xb8c0cc); B(sx * 4.5, 1.6, 2, 0.6, 1.6, 0.6, 0xcfd6e0); ball(sx * 4.5, 2.7, 2, 0.35, 0xcfd6e0); block(sx * 4.5, 2, 0.5, 0.5); }
    },
  };

  function build(island) {
    while (built.children.length) built.remove(built.children[0]);
    state.obstacles = []; state.spin = []; state.smoke = []; state.stars = []; sign = null;
    const theme = THEMES[island.theme] || THEMES.grass;
    const half = island.grid / 2;
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, half * 2.5, half * 7);
    // The ground, its edge, and the water (or the clouds) it stands in.
    B(0, -0.4, 0, island.grid, 0.8, island.grid, theme.ground);
    B(0, -1.3, 0, island.grid - 1.5, 1.2, island.grid - 1.5, theme.edge);
    if (theme.water) B(0, -1.9, 0, island.grid * 8, 0.3, island.grid * 8, theme.water, 0.05);
    // The jetty: where a child arrives, and where they leave.
    B(0, -0.1, half + 1.5, 2.2, 0.2, 3.4, 0xb49a6a);
    for (const sx of [-1, 1]) B(sx * 0.9, -0.6, half + 2.8, 0.2, 1.4, 0.2, 0x8a6a45);
    makeSign(island.owner || '', 2.2, half - 1.2);
    (BUILD[island.theme] || BUILD.grass)(half);
  }

  function enter(payload) {
    state.island = payload;
    build(payload);
    parent = player.parent;
    scene.add(player);
    player.position.set(0, 0, payload.grid / 2 - 1.2);
    player.rotation.y = Math.PI;
    state.active = true;
    cooldown = 1.2;
    document.body.classList.add('on-own-island');
    wasFirstPerson = !!view?.firstPerson;
    if (view) view.firstPerson = false;
    document.body.classList.remove('first-person');
    const where = document.querySelector('.location');
    if (where) where.innerHTML = `<span>✦</span><b class="en">${payload.en}</b><i class="ja">${payload.name}</i>`;
    const mapTitle = document.querySelector('.map-panel>div b');
    if (mapTitle) mapTitle.textContent = `${payload.owner || ''}'s ${payload.en}`;
    toast(say(`${payload.emoji} ${payload.name}に ついた！ さんばしに もどると かえれるよ。`));
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    state.active = false;
    (parent || null)?.add(player);
    document.body.classList.remove('on-own-island');
    if (view) view.firstPerson = wasFirstPerson;
    document.body.classList.toggle('first-person', wasFirstPerson);
    onLeave(silent);
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !state.island) return null;
    const half = state.island.grid / 2;
    // The jetty is the way out; the water is not walked on.
    if (z > half) return !(Math.abs(x) < 1.0 && z < half + 3.2);
    if (Math.abs(x) > half - 0.4 || z < -half + 0.4) return true;
    return state.obstacles.some((o) => Math.abs(x - o.x) < o.w + 0.35 && Math.abs(z - o.z) < o.d + 0.35);
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    for (const s of state.spin) { if (s.axis === 'z') s.m.rotation.z = t * s.k; else if (s.bob) s.m.position.y = 2.6 + Math.sin(t * s.k) * 0.15; else s.m.rotation.y = t * s.k; }
    for (const s of state.smoke) { s.m.position.y = s.base + ((t * 0.6 + s.i * 0.5) % 2.4); s.m.position.x = -0.2 + Math.sin(t + s.i) * 0.25; }
    for (const s of state.stars) s.m.material.emissiveIntensity = 1.0 + Math.sin(t * 2 + s.i) * 0.8;
    // Walking back out along the jetty is leaving.
    const half = state.island.grid / 2;
    if (!cooldown && !document.querySelector('dialog[open]') && player.position.z > half + 2.0) leave();
  }

  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + player.position.y, player.position.z);
      camera.lookAt(player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10);
    } else {
      // Over the shoulder and a little high, like the islands outside: the point is to
      // see the island, so the camera keeps more of it in view than the room's does.
      const distance = THREE.MathUtils.clamp(zoom * 0.7, 11, 22);
      const focus = new THREE.Vector3(player.position.x * 0.6, 1.4, player.position.z * 0.6 - 1);
      const desired = new THREE.Vector3(focus.x + Math.sin(yaw) * distance, 1.5 + distance * 0.62, focus.z + Math.cos(yaw) * distance);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
      camera.lookAt(focus);
    }
    return true;
  }

  function minimap(ctx) {
    if (!state.active || !state.island) return false;
    const half = state.island.grid / 2;
    const scale = 110 / state.island.grid;
    const theme = THEMES[state.island.theme] || THEMES.grass;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = theme.water ? '#2f7f98' : '#4a6fb0';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = `#${theme.ground.toString(16).padStart(6, '0')}`;
    ctx.fillRect(90 - half * scale, 70 - half * scale, state.island.grid * scale, state.island.grid * scale);
    ctx.fillStyle = '#b49a6a';
    ctx.fillRect(90 - 1.1 * scale, 70 + half * scale, 2.2 * scale, 3 * scale);
    ctx.fillStyle = '#3c5a4a';
    for (const o of state.obstacles) ctx.fillRect(90 + (o.x - o.w) * scale, 70 + (o.z - o.d) * scale, o.w * 2 * scale, o.d * 2 * scale);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(90 + player.position.x * scale, 70 + player.position.z * scale, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.font = '10px sans-serif';
    ctx.fillText(`${state.island.emoji || ''} ${say(state.island.name)}`, 10, 16);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap,
    get active() { return state.active; },
  };
}
