// マイルーム — the room a child builds in, and the only place blocks are placed.
//
// An independent scene, like the park's interior: the island, the weather and everyone
// else stay outside. The room is built from what the server sends when the door is
// opened, and every block placed or taken is a request the server may refuse — this
// module draws the answer, it never decides it.
import * as THREE from './three.module.js';

const CELL = 1;                 // one block, one metre
const CURSOR_REACH = 1.4;       // how far in front of the avatar the cursor sits

export function createRoom({ player, camera, send, toast, speak, learn, onLeave }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2a33);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5b6a55, 1.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  const shell = new THREE.Group();       // floor and walls
  const built = new THREE.Group();       // what the child has built
  scene.add(shell, built);

  const geo = new THREE.BoxGeometry(CELL, CELL, CELL);
  const materials = new Map();
  const mat = (color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    return materials.get(color);
  };

  const cursor = new THREE.Mesh(new THREE.BoxGeometry(CELL * 1.04, CELL * 1.04, CELL * 1.04), new THREE.MeshBasicMaterial({ color: 0xffe08a, wireframe: true }));
  cursor.renderOrder = 5;
  scene.add(cursor);

  const state = {
    active: false, room: null, owned: [], hand: '', used: 0, cap: 0,
    cells: new Map(),        // "x,y,z" -> mesh
    palette: new Map(),      // block id -> { word, ja, color }
    cursor: null,            // { x, y, z } the cell the cursor is on
  };
  let parent = null;
  let cooldown = 0;

  const key = (x, y, z) => `${x},${y},${z}`;

  function clearBuilt() {
    for (const mesh of state.cells.values()) built.remove(mesh);
    state.cells.clear();
  }

  function addCell(cell) {
    const block = state.palette.get(cell.b);
    const mesh = new THREE.Mesh(geo, mat(block ? Number(block.color) : 0xaaaaaa));
    mesh.position.set(cell.x, cell.y + CELL / 2, cell.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    built.add(mesh);
    state.cells.set(key(cell.x, cell.y, cell.z), mesh);
  }

  // The shell is rebuilt whenever the room changes size, which is when a child moves.
  function buildShell(room) {
    shell.clear();
    const half = room.grid / 2;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(room.grid, 0.4, room.grid), mat(0x8b7f68));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    shell.add(floor);
    // A checkerboard so the grid a child is building on is visible without a shader.
    for (let x = -half + 1; x < half; x += 1) {
      for (let z = -half + 1; z < half; z += 1) {
        if ((x + z) % 2) continue;
        const tile = new THREE.Mesh(geo, mat(0x9a8d74));
        tile.position.set(x, 0.005, z);
        tile.scale.set(0.98, 0.02, 0.98);
        shell.add(tile);
      }
    }
    const wallH = room.height + 0.5;
    for (const [dx, dz, w, d] of [[0, -half, room.grid, 0.3], [-half, 0, 0.3, room.grid], [half, 0, 0.3, room.grid]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat(0xd8cdb4));
      wall.position.set(dx, wallH / 2, dz);
      shell.add(wall);
    }
    // The fourth wall has the doorway in it, so a child can always see the way out.
    for (const side of [-1, 1]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(half - 1, wallH, 0.3), mat(0xd8cdb4));
      piece.position.set(side * (half + 1) / 2, wallH / 2, half);
      shell.add(piece);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, wallH - 2.4, 0.3), mat(0xd8cdb4));
    lintel.position.set(0, wallH - (wallH - 2.4) / 2, half);
    shell.add(lintel);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x2f4a3a, emissive: 0x2f4a3a, emissiveIntensity: 0.4 }));
    sign.position.set(0, 2.65, half - 0.25);
    shell.add(sign);
  }

  function enter(payload, blocks) {
    state.room = payload;
    state.owned = payload.owned || [];
    state.cap = payload.cap;
    state.palette = new Map((blocks || []).map((b) => [b.id, b]));
    if (!state.hand || !state.owned.includes(state.hand)) state.hand = state.owned[0] || '';
    buildShell(payload);
    clearBuilt();
    for (const cell of payload.blocks || []) addCell(cell);
    state.used = state.cells.size;
    parent = player.parent;
    scene.add(player);
    const half = payload.grid / 2;
    player.position.set(0, 0, half - 1.4);
    player.rotation.y = Math.PI;
    state.active = true;
    cooldown = 1;
    document.body.classList.add('in-room');
    const where = document.querySelector('.location');
    if (where) where.innerHTML = `<span>✦</span> ${payload.en || 'YOUR ROOM'} <small>${payload.name} · 屋内</small>`;
    const mapTitle = document.querySelector('.map-panel>div b');
    if (mapTitle) mapTitle.textContent = payload.en || 'YOUR ROOM';
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    state.active = false;
    (parent || null)?.add(player);
    document.body.classList.remove('in-room');
    cursor.visible = false;
    onLeave(silent);
    return true;
  }

  // ---- building --------------------------------------------------------------------

  const stackAt = (x, z) => {
    let y = 0;
    while (state.cells.has(key(x, y, z))) y += 1;
    return y;
  };

  function aimed() {
    if (!state.active || !state.room) return null;
    const half = state.room.grid / 2;
    const fx = player.position.x + Math.sin(player.rotation.y) * CURSOR_REACH;
    const fz = player.position.z + Math.cos(player.rotation.y) * CURSOR_REACH;
    const x = Math.round(fx);
    const z = Math.round(fz);
    if (Math.abs(x) >= half || Math.abs(z) >= half) return null;
    return { x, z, y: stackAt(x, z) };
  }

  function placeHere() {
    const at = aimed();
    if (!at) { toast('部屋の中に むけて おいてね。'); return; }
    if (!state.hand) { toast('ブロック屋で ブロックを かってね。'); return; }
    if (at.y >= state.room.height) { toast('てんじょうに とどきました。'); return; }
    send('room:place', { x: at.x, y: at.y, z: at.z, b: state.hand });
  }

  function removeHere() {
    const at = aimed();
    if (!at || at.y === 0) { toast('とれる ブロックが ありません。'); return; }
    send('room:remove', { x: at.x, y: at.y - 1, z: at.z });
  }

  // ---- what the server says ---------------------------------------------------------

  function onPlaced(m) {
    addCell(m);
    state.used = m.used;
    const block = state.palette.get(m.b);
    if (block) { speak(block.word); learn(block.word, block.ja); }
  }

  function onRemoved(m) {
    const mesh = state.cells.get(key(m.x, m.y, m.z));
    if (mesh) { built.remove(mesh); state.cells.delete(key(m.x, m.y, m.z)); }
    state.used = m.used;
  }

  function onError(m) {
    const said = {
      'not inside': 'へやの 中で つくれます。',
      'nothing underneath': 'ブロックは 下から つみます。',
      'something is there': 'そこには もう あります。',
      'something is on top': '上に のっている ブロックを さきに とってね。',
      'outside the room': 'へやの そとには おけません。',
      'not bought': 'そのブロックは まだ かっていません。',
      'room is full': 'へやが いっぱいです。ふどうさんで ひろい へやに ひっこせます。',
      'nothing there': 'そこには ブロックが ありません。',
    }[m.reason];
    if (said) toast(said);
  }

  // ---- the frame ---------------------------------------------------------------------

  function blocked(x, z) {
    if (!state.active || !state.room) return null;
    const half = state.room.grid / 2;
    // The doorway is the one gap in the walls; walking into it leaves.
    if (Math.abs(x) > half - 0.4 || z < -half + 0.4) return true;
    if (z > half + 0.6) return true;
    // A block on the floor is something to walk round, as a wall of them should be.
    return state.cells.has(key(Math.round(x), 0, Math.round(z)));
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) { cursor.visible = false; return; }
    const at = aimed();
    state.cursor = at;
    cursor.visible = !!at;
    if (at) {
      cursor.position.set(at.x, at.y + CELL / 2, at.z);
      cursor.material.color.setHex(at.y >= state.room.height ? 0xff8a7a : 0xffe08a);
    }
    // Walking out of the doorway is how a child leaves, the same as every other door.
    const half = state.room.grid / 2;
    if (!cooldown && !document.querySelector('dialog[open]') && Math.abs(player.position.x) < 1.2 && player.position.z > half - 0.3) leave();
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
      // Pull back further than the world's camera: a room is small, and a child needs to
      // see the wall they are building as well as the block in front of them.
      const distance = THREE.MathUtils.clamp(zoom * 0.62, 13, 24);
      const focus = new THREE.Vector3(player.position.x * 0.35, 1.2, player.position.z * 0.35);
      const desired = new THREE.Vector3(focus.x + Math.sin(yaw) * distance, 1 + distance * 0.78, focus.z + Math.cos(yaw) * distance);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      camera.lookAt(focus);
    }
    return true;
  }

  function minimap(ctx) {
    if (!state.active || !state.room) return false;
    const half = state.room.grid / 2;
    const scale = 120 / state.room.grid;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#22333d';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#9a8d74';
    ctx.fillRect(90 - half * scale, 70 - half * scale, state.room.grid * scale, state.room.grid * scale);
    ctx.fillStyle = '#e6d9b4';
    for (const k of state.cells.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (y) continue;
      ctx.fillRect(90 + (x - 0.5) * scale, 70 + (z - 0.5) * scale, scale, scale);
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(90 + player.position.x * scale, 70 + player.position.z * scale, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${state.room.name} ${state.used} / ${state.cap}`, 10, 16);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap,
    onPlaced, onRemoved, onError, placeHere, removeHere,
    setHand(id) { if (state.owned.includes(id)) state.hand = id; },
    get active() { return state.active; },
    get hand() { return state.hand; },
  };
}
