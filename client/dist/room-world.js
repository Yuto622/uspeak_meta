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
import { SPACE_BG, addStars } from './cosmic-kit.js';
import { say, live } from './canvas-say.js';
import { furnitureModel } from './furniture-real.js';

const CELL = 1;                 // one floor square, one metre
const REACH = 8;                // how far the crosshair carries, in squares

export function createRoom({ player, camera, view, send, toast, speak, learn, onLeave }) {
  const scene = new THREE.Scene();
  // 異次元の へや：宇宙に うかぶ。かべ・床だけ かえる（子どもが 買った かぐの 色は そのまま）。
  scene.background = new THREE.Color(SPACE_BG);
  addStars(scene);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x2f6b55, 2.0));
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

  // かぐの 形は furniture-real.js（まるい クッション・ろくろの 脚・木目・ぬの）。大きさは お店が 売った w × d マスの まま。
  // モデルは w × d で 1 回 作って あり、むき r は **90° ずつ 回す**だけ：しめる マス（turned）は 前と 同じで、
  // サーバーの 計算とも 同じ。前は 回さずに たてよこを 入れかえた 箱だった（ソファの 背が いつも 同じ むき）。
  // 知らない 形・作れない ときは 前と 同じ 色の 箱。
  function model(item, rot) {
    const g = new THREE.Group();
    let real = null;
    try { real = furnitureModel(item); } catch { real = null; }
    if (real) {
      real.rotation.y = (rot % 4) * Math.PI / 2;
      g.add(real);
      return g;
    }
    const { w, d } = turned(item, rot);
    const h = item.h || 1;
    const m = new THREE.Mesh(geo, mat(Number(item.color) || 0xb0a08a));
    m.position.set(0, h / 2, 0);
    m.scale.set(w - 0.15, h, d - 0.15);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
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
    floor = new THREE.Mesh(new THREE.BoxGeometry(room.grid, 0.4, room.grid), mat(0xe0a060, 0.16));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    shell.add(floor);
    // A checkerboard so the squares a child is furnishing are visible without a shader.
    for (let x = -half; x < half; x += 1) {
      for (let z = -half; z < half; z += 1) {
        const tile = new THREE.Mesh(geo, mat((x + z) % 2 ? 0x143528 : 0x1b4a39, 0.06));
        tile.position.set(x, 0.005, z);
        tile.scale.set(0.96, 0.02, 0.96);
        shell.add(tile);
      }
    }
    const wallH = room.height + 0.5;
    for (const [dx, dz, w, d] of [[0, -half, room.grid, 0.3], [-half, 0, 0.3, room.grid], [half, 0, 0.3, room.grid]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat(0x143a2c, 0.2));
      wall.position.set(dx, wallH / 2, dz);
      shell.add(wall);
    }
    // The fourth wall has the doorway in it, so a child can always see the way out.
    for (const side of [-1, 1]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(half - 1, wallH, 0.3), mat(0x143a2c, 0.2));
      piece.position.set(side * (half + 1) / 2, wallH / 2, half);
      shell.add(piece);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, wallH - 2.4, 0.3), mat(0x143a2c, 0.2));
    lintel.position.set(0, wallH - (wallH - 2.4) / 2, half);
    shell.add(lintel);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(room.grid, 0.18, 0.36), mat(0x8ff0c8, 0.5));
    rail.position.set(0, 1.15, -half + 0.1);
    shell.add(rail);
    const window = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 0.16), mat(0xf2b04a, 0.5));
    window.position.set(0, 2.6, -half + 0.05);
    shell.add(window);
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), mat(0xffffff, 0.8));
    light.position.set(0, room.height - 0.3, 0);
    light.rotation.set(0.62, 0.78, 0);
    shell.add(light);
    // ネオンの ふち：かべの 上に 光の 帯。
    for (const [dx, dz, w, d] of [[0, -half + 0.2, room.grid, 0.12], [-half + 0.2, 0, 0.12, room.grid], [half - 0.2, 0, 0.12, room.grid]]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat(0xffb066, 0.5));
      trim.position.set(dx, wallH - 0.2, dz);
      shell.add(trim);
    }
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
    ctx.fillStyle = '#08160f';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#163f31';
    ctx.fillRect(90 - half * scale, 70 - half * scale, state.room.grid * scale, state.room.grid * scale);
    ctx.fillStyle = '#ffb066';
    for (const { prop } of state.props.values()) {
      for (const c of cellsOf(prop)) ctx.fillRect(90 + (c.x - 0.5) * scale, 70 + (c.z - 0.5) * scale, scale, scale);
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(90 + player.position.x * scale, 70 + player.position.z * scale, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${say(state.room.name)} ${state.used} / ${state.cap}`, 10, 16);
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
