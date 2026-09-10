// 島の建物のなか — one room, built for whichever island building a child walks into.
//
// Until now the islands' buildings were fronts: you stood on the doorstep and a screen
// opened. Now they are rooms. Walking to the door takes you in, the counter is a place
// inside to walk up to, and everything that happens there is the same as it was — the
// server is told which building you are in (`in:<island>:<spot>`) rather than where you
// are standing on the grass, and checks that name against the very building it is being
// asked about.
//
// One scene, rebuilt on entry: a child is only ever inside one building at a time, and a
// classroom iPad should not carry twenty rooms it is not looking at.
import * as THREE from './three.module.js';

const COUNTER_Z = -3.2;         // the counter, across the room from the door
const DOOR_Z = 8.4;             // walking past this on the way out leaves
const HALF_X = 7.2;
const NEAR_COUNTER = 3.4;

export function createIslandInteriors({ player, camera, toast }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14232b);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a705c, 1.75));
  const sun = new THREE.DirectionalLight(0xffeccd, 1.35);
  sun.position.set(5, 12, 7);
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);

  const geo = new THREE.BoxGeometry();
  const materials = new Map();
  const mat = (color, emissive = 0) => {
    const key = `${color}:${emissive}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color, roughness: 0.78, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive,
      }));
    }
    return materials.get(key);
  };
  const B = (x, y, z, w, h, d, color, emissive = 0) => {
    const m = new THREE.Mesh(geo, mat(color, emissive));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  function sign(text, sub, x, y, z) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#183946';
    ctx.beginPath(); ctx.roundRect(4, 4, 760, 192, 22); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3dfaa';
    ctx.font = '700 62px sans-serif';
    ctx.fillText(text, 384, 88, 700);
    ctx.fillStyle = '#bcd7d0';
    ctx.font = '600 38px sans-serif';
    ctx.fillText(sub, 384, 150, 700);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.position.set(x, y, z);
    s.scale.set(6.4, 6.4 * 200 / 768, 1);
    root.add(s);
    return s;
  }

  // The same voxel villager as outside, so the person behind the counter is the person
  // who was standing in front of the building.
  function person(color, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const P = (px, py, pz, w, h, d, c) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(px, py, pz); m.scale.set(w, h, d); m.castShadow = true; g.add(m); };
    P(-0.23, 0.51, 0, 0.33, 0.85, 0.42, 0x505a4b);
    P(0.23, 0.51, 0, 0.33, 0.85, 0.42, 0x505a4b);
    P(0, 1.26, 0, 0.92, 0.8, 0.5, color);
    P(-0.6, 1.26, 0, 0.24, 0.73, 0.34, color);
    P(0.6, 1.26, 0, 0.24, 0.73, 0.34, color);
    P(0, 1.96, 0, 0.72, 0.65, 0.65, 0xe6c299);
    P(0, 2.3, 0, 0.8, 0.2, 0.73, 0x73604b);
    for (const x2 of [-0.17, 0.17]) P(x2, 2, 0.332, 0.065, 0.07, 0.025, 0x3a4339);
    return g;
  }

  const state = { active: false, islandId: '', spot: null, counterAt: null };
  let parent = null;
  let cooldown = 0;
  let npc = null;

  // What each kind of building has in it. The counter is always in the same place, so a
  // child learns one shape and then knows every building on every island.
  const DRESSING = {
    hut: [[0, 1.1, -6.2, 5.4, 2.2, 0.5, 0xb9c4a0], [-4.6, 1.2, -4, 1.6, 2.4, 1.6, 0x9c8b6a]],
    gym: [[-4.8, 1.1, -4.4, 2.2, 2.2, 2.2, 0x7f9aa8], [4.8, 1.1, -4.4, 2.2, 2.2, 2.2, 0x7f9aa8]],
    stand: [[0, 0.2, 0.5, 8.4, 0.3, 7, 0xcbb896], [0, 0.36, 0.5, 7.2, 0.24, 5.8, 0xdccba8]],
    dojo: [[-4.9, 1.3, -3.2, 1.4, 2.6, 1.4, 0x5f7a6a], [4.9, 1.3, -3.2, 1.4, 2.6, 1.4, 0x5f7a6a]],
    nest: [[0, 0.55, -0.4, 4.6, 1.1, 3.4, 0xd8c9a4], [0, 1.15, -0.4, 3.4, 0.4, 2.4, 0xc2ab7f]],
    kitchen: [[-4.7, 1, -4.2, 2.4, 2, 1.6, 0xb08c62], [4.7, 0.9, -4.2, 2.4, 1.8, 1.6, 0x9aa77f]],
    meadow: [[0, 0.14, 1, 9, 0.2, 8, 0xa9c283], [-4.4, 0.8, -1.6, 1, 1.6, 1, 0x7f9a5a]],
    gate: [[-4.9, 0.8, -3.6, 2.6, 1.6, 1.8, 0x8f9aa6], [4.9, 0.8, -3.6, 2.6, 1.6, 1.8, 0x8f9aa6]],
    start: [[0, 2.9, -6.4, 7.6, 0.5, 0.5, 0xd9534f], [-3.6, 1.5, -6.4, 0.4, 3, 0.4, 0x8a8378], [3.6, 1.5, -6.4, 0.4, 3, 0.4, 0x8a8378]],
    shop: [[-4.8, 0.9, -3.8, 2.4, 1.8, 1.8, 0xb08655], [4.8, 0.6, -3.8, 2.2, 1.2, 1.8, 0x9a9a92]],
    agent: [[-4.8, 1.2, -4, 2.2, 2.4, 1.4, 0xc9d8e4], [4.8, 1.2, -4, 2.2, 2.4, 1.4, 0xc9d8e4]],
    // かぐ屋: a showroom, so what is for sale is standing about in it.
    furniture: [[-4.6, 0.45, -3.4, 2.4, 0.9, 1.2, 0x5f7f9a], [-4.6, 0.9, -4, 2.4, 0.8, 0.3, 0x5f7f9a],
      [4.6, 0.38, -3.6, 1.8, 0.16, 1.2, 0xa97c4e], [4.6, 0.2, -3.6, 0.2, 0.6, 0.2, 0x8d6642],
      [4.9, 1.2, 1.4, 1.4, 2.4, 0.5, 0x8d6642]],
    plaza: [[0, 0.5, 0, 4, 1, 4, 0xd6cfae]],
  };

  function build(islandId, spot) {
    root.clear();
    npc = null;
    const wall = 0xe4dcc2;
    const accent = Number(spot.color) || 0xcbbb95;
    // Floor, walls, and a doorway that is always behind you as you come in.
    B(0, -0.2, 0, HALF_X * 2 + 1.2, 0.4, 19, 0x6f6a58);
    for (let x = -HALF_X + 1; x < HALF_X; x += 2) {
      for (let z = -7; z < 9; z += 2) B(x, 0.03, z, 1.94, 0.1, 1.94, (x + z) % 4 === 0 ? 0xece6d3 : 0xdcd5bd);
    }
    B(0, 2.6, -7.4, HALF_X * 2 + 1.2, 5.2, 0.4, wall);
    for (const x of [-HALF_X - 0.3, HALF_X + 0.3]) B(x, 2.6, 0.6, 0.4, 5.2, 17, wall);
    for (const side of [-1, 1]) B(side * (HALF_X / 2 + 1.4), 2.6, DOOR_Z + 0.5, HALF_X - 1.4, 5.2, 0.4, wall);
    B(0, 4.4, DOOR_Z + 0.5, 3.2, 1.6, 0.4, wall);
    // A window on each side so it is not a box, and a lamp so it is not dark.
    for (const x of [-HALF_X - 0.05, HALF_X + 0.05]) {
      B(x, 3, 1.4, 0.15, 1.9, 3.4, 0x9fd0dc, 0.35);
      B(x, 3, 1.4, 0.2, 0.14, 3.5, 0x8a7a58);
    }
    B(0, 5.1, 0.4, 1.1, 0.25, 1.1, 0xffe1a1, 1.1);
    const lamp = new THREE.PointLight(0xffe0a8, 12, 20, 2);
    lamp.position.set(0, 4.8, 0.4);
    root.add(lamp);

    // The counter, in the same place in every building.
    B(0, 0.95, COUNTER_Z, 7.4, 1.5, 1.6, accent);
    B(0, 1.78, COUNTER_Z, 7.8, 0.18, 1.9, 0xf5ead0);
    for (const [x, y, z, w, h, d, c] of DRESSING[spot.kind] || DRESSING.plaza) B(x, y, z, w, h, d, c);
    npc = person(accent, 0, COUNTER_Z - 1.5);
    npc.rotation.y = Math.PI;
    sign(`${spot.tone || ''} ${spot.name}`.trim(), spot.character || '', 0, 4.2, -6.9);
    sign('でぐち · EXIT', '歩いて そとへ', 0, 3.5, DOOR_Z + 0.2);
    state.counterAt = { x: 0, z: COUNTER_Z + 1.4 };
  }

  function enter(islandId, spot) {
    if (state.active || !spot) return false;
    build(islandId, spot);
    state.islandId = islandId;
    state.spot = spot;
    state.active = true;
    parent = player.parent;
    scene.add(player);
    player.position.set(0, 0, DOOR_Z - 1.2);
    player.rotation.y = Math.PI;
    cooldown = 0.9;
    document.body.classList.add('in-building');
    const where = document.querySelector('.location');
    if (where) where.innerHTML = `<span>✦</span> ${spot.en || spot.name} <small>${spot.name} · 屋内</small>`;
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    const spot = state.spot;
    const islandId = state.islandId;
    state.active = false;
    state.spot = null;
    (parent || null)?.add(player);
    document.body.classList.remove('in-building');
    onLeave?.(islandId, spot, silent);
    return true;
  }

  let onLeave = null;

  // Inside, the counter is the place. The prompt and the screen are the same ones the
  // doorstep used to show, because it is the same activity.
  function nearest() {
    if (!state.active || !state.counterAt) return null;
    const dist = Math.hypot(player.position.x - state.counterAt.x, player.position.z - state.counterAt.z);
    return dist <= NEAR_COUNTER ? { spot: state.spot, dist } : null;
  }

  function blocked(x, z) {
    if (!state.active) return null;
    if (Math.abs(x) > HALF_X - 0.4 || z < -6.8) return true;
    if (z > DOOR_Z + 1.2) return true;
    // The counter is furniture, not a wall you can walk through.
    return Math.abs(x) < 4 && Math.abs(z - COUNTER_Z) < 1.3;
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    if (npc) {
      npc.position.y = Math.sin(t * 1.4) * 0.04;
      npc.rotation.y = Math.PI + Math.atan2(player.position.x - npc.position.x, player.position.z - npc.position.z) * 0.35;
    }
    // Walking out of the doorway is how you leave, the same as every other door here.
    if (!cooldown && !document.querySelector('dialog[open]') && Math.abs(player.position.x) < 1.6 && player.position.z > DOOR_Z) leave();
  }

  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + player.position.y, player.position.z);
      camera.lookAt(
        player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10,
        camera.position.y + Math.sin(pitch) * 10,
        player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10,
      );
    } else {
      const distance = THREE.MathUtils.clamp(zoom * 0.52, 11, 19);
      const focus = new THREE.Vector3(player.position.x * 0.5, 1.1, player.position.z * 0.5 - 1);
      const desired = new THREE.Vector3(focus.x + Math.sin(yaw) * distance, 1.2 + distance * 0.8, focus.z + Math.cos(yaw) * distance);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      camera.lookAt(focus);
    }
    return true;
  }

  function minimap(ctx) {
    if (!state.active) return false;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#22333d';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#ded7bf';
    ctx.fillRect(28, 14, 124, 112);
    ctx.fillStyle = '#b9a97e';
    ctx.fillRect(46, 26, 88, 12);            // the counter
    ctx.fillStyle = '#7fd4a0';
    ctx.fillRect(80, 118, 20, 8);            // the way out
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(90 + player.position.x * 8, 70 + player.position.z * 6, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.font = '10px sans-serif';
    ctx.fillText(state.spot?.name || '', 10, 12);
    return true;
  }

  return {
    scene, state, enter, leave, nearest, blocked, update, updateCamera, minimap,
    get active() { return state.active; },
    get islandId() { return state.islandId; },
    get spot() { return state.spot; },
    // Where the child stood before going in, so leaving puts them back at the door.
    setOnLeave(fn) { onLeave = fn; },
  };
}
