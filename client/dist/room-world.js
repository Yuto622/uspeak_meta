// マイルーム — the room a child furnishes, and the only place furniture is placed.
//
// An independent scene, like the park's interior: the island, the weather and everyone
// else stay outside. The room is built from what the server sends the moment a child
// walks into the doorway, and every piece put down or taken away is a request the server
// may refuse — this module draws the answer, it never decides it.
//
// Furniture here, blocks on the plaza (plaza-world.js). A room is somewhere to live in,
// not a quarry, so what goes in it is bought at the かぐ屋 and stands on the floor.
import * as THREE from './three.module.js';

const CELL = 1;                 // one floor square, one metre
const REACH = 8;                // how far the crosshair carries, in squares

export function createRoom({ player, camera, view, send, toast, speak, learn, onLeave }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2a33);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5b6a55, 1.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  const shell = new THREE.Group();       // floor and walls
  const built = new THREE.Group();       // what the child has put in it
  scene.add(shell, built);

  const geo = new THREE.BoxGeometry(CELL, CELL, CELL);
  const materials = new Map();
  const mat = (color, emissive = 0) => {
    const key = `${color}:${emissive}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color, roughness: 0.8, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive,
      }));
    }
    return materials.get(key);
  };

  // The piece under the crosshair, drawn where it would land. Yellow is "here", red is
  // "not here" — the same two answers the plaza's cursor gives.
  const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.34 }));
  ghost.renderOrder = 5;
  scene.add(ghost);

  const state = {
    active: false, room: null, owned: [], hand: '', used: 0, cap: 0, rot: 0,
    props: new Map(),        // "x,z" of the anchor -> { prop, group }
    palette: new Map(),      // furniture id -> { word, ja, price, color, w, d, h, shape }
    cursor: null,            // { place, dig } — where a piece would go, what is aimed at
  };
  let parent = null;
  let cooldown = 0;
  let wasFirstPerson = false;
  let floor = null;

  const key = (x, z) => `${x},${z}`;
  const sized = (id) => state.palette.get(id) || { w: 1, d: 1, h: 1, color: 0xaaaaaa, shape: 'box' };
  // A quarter turn swaps the two sides. That is all rotation means here, and the server
  // works it out the same way from the same number.
  const turned = (item, rot) => ({ w: rot % 2 ? item.d : item.w, d: rot % 2 ? item.w : item.d });

  // ---- the furniture itself ----------------------------------------------------------

  // One recipe per kind, built out of boxes in the footprint the shop sold. Everything is
  // drawn in a w × d box anchored at its near corner, so a sofa turned sideways is the
  // same sofa.
  function model(item, rot) {
    const g = new THREE.Group();
    const { w, d } = turned(item, rot);
    const color = Number(item.color) || 0xb0a08a;
    const dark = new THREE.Color(color).multiplyScalar(0.72).getHex();
    const B = (x, y, z, sx, sy, sz, c = color, glow = 0) => {
      const m = new THREE.Mesh(geo, mat(c, glow));
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const legs = (top, thick = 0.14) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(sx * (w / 2 - 0.22), top / 2, sz * (d / 2 - 0.22), thick, top, thick, dark);
      }
    };
    switch (item.shape) {
      case 'rug': B(0, 0.03, 0, w - 0.1, 0.06, d - 0.1); B(0, 0.05, 0, w - 0.6, 0.04, d - 0.6, dark); break;
      case 'chair':
        legs(0.45); B(0, 0.5, 0, w - 0.2, 0.12, d - 0.2);
        B(0, 0.85, -(d / 2 - 0.16), w - 0.24, 0.6, 0.12);
        break;
      case 'table': legs(0.7); B(0, 0.76, 0, w - 0.1, 0.14, d - 0.1); break;
      case 'sofa':
        B(0, 0.28, 0, w - 0.1, 0.5, d - 0.1);
        B(0, 0.62, -(d / 2 - 0.2), w - 0.3, 0.28, 0.34, dark);
        B(0, 0.85, -(d / 2 - 0.12), w - 0.1, 0.8, 0.22);
        for (const sx of [-1, 1]) B(sx * (w / 2 - 0.16), 0.7, 0, 0.3, 0.5, d - 0.2);
        break;
      case 'bed':
        B(0, 0.22, 0, w - 0.1, 0.4, d - 0.1, dark);
        B(0, 0.5, 0.2, w - 0.2, 0.22, d - 0.9);
        B(0, 0.58, -(d / 2 - 0.5), w - 0.35, 0.24, 0.7, 0xf3ece0);
        B(0, 0.95, -(d / 2 - 0.06), w - 0.1, 1.1, 0.16, dark);
        break;
      case 'shelf':
        B(0, 1, 0, w - 0.1, 2, 0.34, dark);
        for (let i = 0; i < 3; i += 1) B(0, 0.45 + i * 0.55, 0.06, w - 0.28, 0.1, 0.3, color);
        for (let i = 0; i < 5; i += 1) B(-w / 2 + 0.4 + i * ((w - 0.8) / 4), 1.15, 0.1, 0.16, 0.42, 0.2, [0xc4553f, 0x3f6ac4, 0xd0a02c, 0x4aa06a, 0x8b5fb0][i]);
        break;
      case 'lamp':
        B(0, 0.06, 0, 0.5, 0.12, 0.5, dark);
        B(0, 0.8, 0, 0.12, 1.5, 0.12, dark);
        B(0, 1.7, 0, 0.7, 0.5, 0.7, color, 1.1);
        break;
      case 'plant':
        B(0, 0.28, 0, 0.6, 0.56, 0.6, 0xb07b52);
        B(0, 0.7, 0, 0.45, 0.4, 0.45, color);
        B(0, 1.1, 0, 0.8, 0.5, 0.8, color);
        B(0, 1.45, 0, 0.5, 0.4, 0.5, color);
        break;
      case 'clock':
        B(0, 0.9, 0, 0.5, 1.8, 0.35, 0x8d6642);
        B(0, 1.55, 0.2, 0.42, 0.42, 0.06, color, 0.5);
        break;
      case 'tv':
        B(0, 0.25, 0, 0.5, 0.5, 0.4, dark);
        B(0, 0.95, 0, w - 0.2, 0.9, 0.16, color);
        B(0, 0.95, 0.1, w - 0.4, 0.68, 0.06, 0x9fd0dc, 0.6);
        break;
      case 'piano':
        B(0, 0.55, -(d / 2 - 0.3), w - 0.2, 1.1, 0.5, color);
        B(0, 0.62, 0.1, w - 0.24, 0.16, d - 0.6, color);
        B(0, 0.72, 0.16, w - 0.5, 0.06, 0.4, 0xf3ece0);
        legs(0.5, 0.16);
        break;
      default: B(0, (item.h || 1) / 2, 0, w - 0.15, item.h || 1, d - 0.15);
    }
    return g;
  }

  function clearBuilt() {
    for (const { group } of state.props.values()) built.remove(group);
    state.props.clear();
  }

  function addProp(prop) {
    const item = sized(prop.f);
    const { w, d } = turned(item, prop.r);
    const group = model(item, prop.r);
    // The anchor is the near corner of the footprint, so the model sits at its middle.
    group.position.set(prop.x + w / 2 - 0.5, 0, prop.z + d / 2 - 0.5);
    built.add(group);
    state.props.set(key(prop.x, prop.z), { prop, group });
  }

  // Which floor squares a piece covers. The server works this out the same way, from the
  // same numbers, and refuses anything that disagrees.
  function cellsOf(prop) {
    const { w, d } = turned(sized(prop.f), prop.r);
    const cells = [];
    for (let x = 0; x < w; x += 1) for (let z = 0; z < d; z += 1) cells.push({ x: prop.x + x, z: prop.z + z });
    return cells;
  }

  const propAt = (x, z) => {
    for (const entry of state.props.values()) {
      if (cellsOf(entry.prop).some((c) => c.x === x && c.z === z)) return entry;
    }
    return null;
  };

  // ---- the room ----------------------------------------------------------------------

  // The shell is rebuilt whenever the room changes size, which is when a child moves.
  function buildShell(room) {
    shell.clear();
    const half = room.grid / 2;
    floor = new THREE.Mesh(new THREE.BoxGeometry(room.grid, 0.4, room.grid), mat(0x8b7f68));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    shell.add(floor);
    // A checkerboard so the squares a child is furnishing are visible without a shader.
    for (let x = -half; x < half; x += 1) {
      for (let z = -half; z < half; z += 1) {
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
    const rail = new THREE.Mesh(new THREE.BoxGeometry(room.grid, 0.18, 0.36), mat(0xc0b394));
    rail.position.set(0, 1.15, -half + 0.1);
    shell.add(rail);
    const window = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 0.16), mat(0x9fd0dc, 0.35));
    window.position.set(0, 2.6, -half + 0.05);
    shell.add(window);
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), mat(0xffe1a1, 1.1));
    light.position.set(0, room.height - 0.3, 0);
    shell.add(light);
  }

  function enter(payload, furniture) {
    state.room = payload;
    state.owned = payload.owned || [];
    state.cap = payload.cap;
    state.palette = new Map((furniture || []).map((f) => [f.id, f]));
    if (!state.hand || !state.owned.includes(state.hand)) state.hand = state.owned[0] || '';
    buildShell(payload);
    clearBuilt();
    for (const prop of payload.furniture || []) addProp(prop);
    state.used = state.props.size;
    parent = player.parent;
    scene.add(player);
    const half = payload.grid / 2;
    player.position.set(0, 0, half - 1.4);
    player.rotation.y = 0;                 // facing into the room, not back out of it
    state.active = true;
    cooldown = 1;
    document.body.classList.add('in-room');
    // Furnishing is done down a crosshair, so the view goes to the child's own eyes, and
    // whatever they were using outside is put back when they leave.
    wasFirstPerson = !!view?.firstPerson;
    if (view) view.firstPerson = true;
    document.body.classList.add('first-person');
    // Look into the room and a little down, so the very first thing under the crosshair
    // is a piece of floor something can stand on.
    view?.look?.(0, -0.42);
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
    if (view) view.firstPerson = wasFirstPerson;
    document.body.classList.toggle('first-person', wasFirstPerson);
    ghost.visible = false;
    onLeave(silent);
    return true;
  }

  // ---- furnishing ---------------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  raycaster.far = REACH;
  const centre = new THREE.Vector2(0, 0);

  // What the crosshair is pointing at: a floor square to put something on, and the piece
  // that is already there to take away.
  function aimed() {
    if (!state.active || !state.room) return null;
    raycaster.setFromCamera(centre, camera);
    const hits = raycaster.intersectObjects([floor, ...built.children].filter(Boolean), true);
    const hit = hits[0];
    if (!hit) return null;
    const cell = { x: Math.round(hit.point.x), z: Math.round(hit.point.z) };
    const on = propAt(cell.x, cell.z);
    const half = state.room.grid / 2;
    const item = sized(state.hand);
    const { w, d } = turned(item, state.rot);
    // Anchored at the square under the crosshair, so a child sees where the near corner
    // of the sofa is going and the rest follows to the right and away.
    const fits = state.hand && cell.x >= -half && cell.z >= -half && cell.x + w <= half && cell.z + d <= half
      && !cellsOf({ f: state.hand, x: cell.x, z: cell.z, r: state.rot }).some((c) => propAt(c.x, c.z));
    return { place: fits ? cell : null, at: cell, dig: on ? on.prop : null, point: hit.point };
  }

  // Standing where a piece is going is how a child ends up inside the wardrobe. The
  // server cannot know where anyone is standing — that is something the page declares —
  // so it is refused here.
  function standingOn(cells) {
    const px = Math.round(player.position.x);
    const pz = Math.round(player.position.z);
    return cells.some((c) => c.x === px && c.z === pz);
  }

  function placeHere() {
    const at = aimed();
    if (!state.hand) { toast('かぐ屋で かぐを かってね。'); return; }
    if (!at || !at.place) { toast('おける ゆかを ねらってね。'); return; }
    const cells = cellsOf({ f: state.hand, x: at.place.x, z: at.place.z, r: state.rot });
    if (standingOn(cells)) { toast('じぶんの いる ところには おけません。'); return; }
    send('room:place', { f: state.hand, x: at.place.x, z: at.place.z, r: state.rot });
  }

  function removeHere() {
    const at = aimed();
    if (!at || !at.dig) { toast('かたづける かぐを ねらってね。'); return; }
    send('room:remove', { x: at.at.x, z: at.at.z });
  }

  function rotate() {
    state.rot = (state.rot + 1) % 4;
    return state.rot;
  }

  // ---- what the server says ---------------------------------------------------------

  function onPlaced(m) {
    addProp(m);
    state.used = m.used;
    const item = state.palette.get(m.f);
    if (item) { speak(item.word); learn(item.word, item.ja); }
  }

  function onRemoved(m) {
    const entry = state.props.get(key(m.x, m.z));
    if (entry) { built.remove(entry.group); state.props.delete(key(m.x, m.z)); }
    state.used = m.used;
  }

  function onError(m) {
    const said = {
      'not inside': 'へやの 中で おけます。',
      'something is there': 'そこには もう かぐが あります。',
      'outside the room': 'へやの そとには おけません。',
      'not bought': 'その かぐは まだ かっていません。',
      'no such furniture': 'その かぐは ありません。',
      'room is full': 'へやが いっぱいです。ふどうさんで ひろい へやに ひっこせます。',
      'nothing there': 'そこには かぐが ありません。',
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
    // A rug is walked over; a sofa is walked round.
    const on = propAt(Math.round(x), Math.round(z));
    return !!on && (sized(on.prop.f).h || 1) > 0.35;
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) { ghost.visible = false; return; }
    const at = aimed();
    state.cursor = at;
    const item = sized(state.hand);
    const { w, d } = turned(item, state.rot);
    const cell = at?.at || null;
    ghost.visible = !!cell && !!state.hand;
    if (ghost.visible) {
      const height = Math.max(0.2, item.h || 1);
      ghost.scale.set(w - 0.06, height, d - 0.06);
      ghost.position.set(cell.x + w / 2 - 0.5, height / 2, cell.z + d / 2 - 0.5);
      ghost.material.color.setHex(at.place ? 0xffe08a : 0xff8a7a);
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
      // see the wall they are furnishing as well as the chair in front of them.
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
    for (const { prop } of state.props.values()) {
      for (const c of cellsOf(prop)) ctx.fillRect(90 + (c.x - 0.5) * scale, 70 + (c.z - 0.5) * scale, scale, scale);
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
    onPlaced, onRemoved, onError, placeHere, removeHere, rotate,
    setHand(id) { if (state.owned.includes(id)) state.hand = id; },
    get active() { return state.active; },
    get hand() { return state.hand; },
    get rot() { return state.rot; },
  };
}
