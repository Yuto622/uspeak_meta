// ひろば — the lot a child stacks blocks on, and the only place blocks are placed.
//
// An independent scene, like the park's interior: the island, the weather and everyone
// else stay outside. The lot is built from what the server sends when a child walks into
// the square, and every block placed or dug is a request the server may refuse — this
// module draws the answer, it never decides it.
//
// A room is furniture (room-world.js); the plaza is blocks. That split is the whole
// difference between the two, and everything else here is the same crosshair.
import * as THREE from './three.module.js';

const CELL = 1;                 // one block, one metre
const REACH = 6;                // how far the crosshair carries, in blocks

export function createPlaza({ player, camera, view, send, toast, speak, learn, onLeave }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
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
  let wasFirstPerson = false;
  let floor = null;

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

  // The lot: grass, a marked-out grid, and a fence with one gap in it. It is rebuilt
  // whenever the size changes, which for the plaza is never — but the room next door
  // grows, and the two are built the same way on purpose.
  function buildShell(area) {
    shell.clear();
    const half = area.grid / 2;
    floor = new THREE.Mesh(new THREE.BoxGeometry(area.grid + 4, 0.4, area.grid + 4), mat(0x7ba05b));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    shell.add(floor);
    // The buildable squares, marked out on the grass so a child can see the lot.
    for (let x = -half + 1; x < half; x += 1) {
      for (let z = -half + 1; z < half; z += 1) {
        const tile = new THREE.Mesh(geo, mat((x + z) % 2 ? 0x8bb069 : 0x9dbd78));
        tile.position.set(x, 0.006, z);
        tile.scale.set(0.98, 0.02, 0.98);
        shell.add(tile);
      }
    }
    // A fence, so the lot has an edge without having a ceiling. The gap is the way out.
    for (const [ax, az] of [[1, 0], [-1, 0], [0, -1]]) {
      for (let i = -half; i <= half; i += 1) {
        const post = new THREE.Mesh(geo, mat(0xb08655));
        post.position.set(ax ? ax * half : i, 0.6, az ? az * half : i);
        post.scale.set(0.22, 1.2, 0.22);
        post.castShadow = true;
        shell.add(post);
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 2; i <= half; i += 1) {
        const post = new THREE.Mesh(geo, mat(0xb08655));
        post.position.set(side * i, 0.6, half);
        post.scale.set(0.22, 1.2, 0.22);
        shell.add(post);
      }
    }
    // The gateway, straight ahead as a child arrives, so the way out is never hunted for.
    for (const side of [-1.6, 1.6]) {
      const pillar = new THREE.Mesh(geo, mat(0xd8cdb4));
      pillar.position.set(side, 1.4, half);
      pillar.scale.set(0.5, 2.8, 0.5);
      shell.add(pillar);
    }
    const arch = new THREE.Mesh(geo, mat(0xd8cdb4));
    arch.position.set(0, 2.9, half);
    arch.scale.set(3.8, 0.5, 0.5);
    shell.add(arch);
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
    player.rotation.y = 0;                 // facing into the room, not back out of it
    state.active = true;
    cooldown = 1;
    document.body.classList.add('in-plaza');
    // Building is done down a crosshair, so the view goes to the child's own eyes, and
    // whatever they were using outside is put back when they leave.
    wasFirstPerson = !!view?.firstPerson;
    if (view) view.firstPerson = true;
    document.body.classList.add('first-person');
    // Look into the room and a little down, so the very first thing under the crosshair
    // is a piece of floor a block can go on.
    view?.look?.(0, -0.42);
    const where = document.querySelector('.location');
    if (where) where.innerHTML = `<span>✦</span> ${payload.en || 'BUILD PLAZA'} <small>${payload.name} · まちづくり島</small>`;
    const mapTitle = document.querySelector('.map-panel>div b');
    if (mapTitle) mapTitle.textContent = payload.en || 'BUILD PLAZA';
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    state.active = false;
    (parent || null)?.add(player);
    document.body.classList.remove('in-plaza');
    if (view) view.firstPerson = wasFirstPerson;
    document.body.classList.toggle('first-person', wasFirstPerson);
    cursor.visible = false;
    onLeave(silent);
    return true;
  }

  // ---- building --------------------------------------------------------------------

  // What the crosshair is pointing at. This is the Minecraft rule a child already knows:
  // aim at a face, and the block goes on that face — or the block itself is dug out.
  const raycaster = new THREE.Raycaster();
  raycaster.far = REACH;
  const centre = new THREE.Vector2(0, 0);

  function aimed() {
    if (!state.active || !state.room) return null;
    raycaster.setFromCamera(centre, camera);
    const hits = raycaster.intersectObjects([...built.children, floor].filter(Boolean), false);
    const hit = hits[0];
    if (!hit) return null;
    const half = state.room.grid / 2;
    // The face that was hit, as a whole-block step away from what was hit.
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round() : new THREE.Vector3(0, 1, 0);
    const inside = hit.object === floor
      ? { x: Math.round(hit.point.x), y: -1, z: Math.round(hit.point.z) }
      : { x: Math.round(hit.object.position.x), y: Math.round(hit.object.position.y - 0.5), z: Math.round(hit.object.position.z) };
    const onto = { x: inside.x + normal.x, y: inside.y + normal.y, z: inside.z + normal.z };
    const within = (c) => Math.abs(c.x) < half && Math.abs(c.z) < half && c.y >= 0 && c.y < state.room.height;
    return {
      dig: hit.object === floor ? null : inside,
      place: within(onto) ? onto : null,
      point: hit.point,
    };
  }

  // The two cells a child is standing in. Building into yourself is how you end up
  // inside a block looking at the inside of it, so it is refused here — the server
  // cannot know, because where a child is standing is something the page declares.
  // A child is two blocks tall and the camera sits in the upper one. A block placed in
  // their own column, or close enough to their eyes to fill the screen, is a block
  // placed inside them — which is how you end up looking at the inside of one.
  function standingIn(cell) {
    if (Math.round(player.position.x) === cell.x && Math.round(player.position.z) === cell.z && cell.y <= 2) return true;
    const eye = camera.position;
    return Math.hypot(cell.x - eye.x, cell.y + 0.5 - eye.y, cell.z - eye.z) < 1.2;
  }

  function placeHere() {
    const at = aimed();
    if (!state.hand) { toast('ブロック屋で ブロックを かってね。'); return; }
    if (!at || !at.place) { toast('おける ところを ねらってね。'); return; }
    if (standingIn(at.place)) { toast('じぶんの いる ところには おけません。'); return; }
    send('plaza:place', { x: at.place.x, y: at.place.y, z: at.place.z, b: state.hand });
  }

  function removeHere() {
    const at = aimed();
    if (!at || !at.dig) { toast('ほれる ブロックを ねらってね。'); return; }
    send('plaza:remove', { x: at.dig.x, y: at.dig.y, z: at.dig.z });
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
      'not inside': 'ひろばの 中で つくれます。',
      'nothing to build on': 'ブロックは 下から つみます。',
      'something is there': 'そこには もう あります。',
      'outside the plaza': 'ひろばの そとには おけません。',
      'not bought': 'そのブロックは まだ かっていません。',
      'plaza is full': 'ひろばが ブロックで いっぱいです。いらないものを ほってね。',
      'nothing there': 'そこには ブロックが ありません。',
      'too far': 'ひろばまで あるいて いこう。',
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
    // A block is something to walk round: both the one on the floor and the one at
    // chest height above it, or a child walks through their own wall.
    return state.cells.has(key(Math.round(x), 0, Math.round(z))) || state.cells.has(key(Math.round(x), 1, Math.round(z)));
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) { cursor.visible = false; return; }
    const at = aimed();
    state.cursor = at;
    const cell = at?.place || at?.dig || null;
    cursor.visible = !!cell;
    if (cell) {
      cursor.position.set(cell.x, cell.y + CELL / 2, cell.z);
      cursor.material.color.setHex(at.place ? 0xffe08a : 0xff8a7a);
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
