// じぶんの しま — the island a child owns: twelve worlds, one builder, two uses.
//
// `buildIslandModel` turns what the server says a child owns (`land:island`: step, size,
// look) into a THREE.Group — hills and beach, sea and jetty, and the look's own world —
// plus the obstacles a walk has to respect, the ground's height under any point, and the
// bits that move. The private scene below (`createLand`, like マイルーム in room-world.js)
// walks the child round that group; the estate office (land.js) draws the very same group
// on its cards and on its turntable, so what a child buys is exactly what they then stand
// on. Nothing here decides anything: the step and the look are the server's.
//
// The pieces: land-kit.js (shapes, instancing, the heightfield, shared props) and
// land-themes-a/b.js (the twelve worlds). A seeded random makes every build of a look
// identical, so the card in the office and the island under a child's feet agree.
import * as THREE from './three.module.js';
import { say, live } from './canvas-say.js';
import { t as tr, isJa } from './i18n.js';
import { makeKit, seeded, mat, geo, BEACH, SEA_Y, JETTY_Y } from './land-kit.js';
import { THEMES_A, BUILD_A } from './land-themes-a.js';
import { THEMES_B, BUILD_B } from './land-themes-b.js';

export const THEMES = { ...THEMES_A, ...THEMES_B };
const BUILD = { ...BUILD_A, ...BUILD_B };
const BOX = new THREE.BoxGeometry(1, 1, 1);

export function buildIslandModel(island, opts = {}) {
  const { owner = '', sign = true, liveSign = false, sea = 'wide' } = opts;
  const theme = THEMES[island.theme] || THEMES.grass;
  const grid = island.grid;
  const half = grid / 2;
  const rnd = seeded(`${island.theme}:${grid}`);
  const group = new THREE.Group();
  const obstacles = [];
  const anims = [];
  let unlive = null;
  const K = makeKit({ group, theme, grid, rnd, obstacles, anims });
  const { B, ball, cyl, M } = K;

  // ---- the sea, the cliff under the island, the jetty: nothing of these follows the hills.
  K.lift(() => {
    B(0, -1.55, 0, grid, 1.2, grid, theme.edge);
    B(0, -2.6, 0, grid - 1.2, 1.2, grid - 1.2, theme.cliff);
    B(0, -3.8, 0, grid - 3, 1.4, grid - 3, theme.cliff);
    if (theme.space) { const r = ball(0, -half * 0.6, 0, half * 0.95, theme.cliff); r.scale.y = 0.7; }
    // Rocks along the waterline, part sunk, in two greys; none across the jetty.
    const per = Math.round(grid * 1.6);
    for (let i = 0; i < per; i += 1) {
      const t = i / per * 4; const side = Math.floor(t); const u = (t - side) * grid - half;
      const r = half + 0.1 + rnd() * 0.5;
      const [x, z] = [[u, -r], [r, u], [-u, r], [-r, -u]][side];
      if (z > half - 1 && Math.abs(x) < 2.2) continue;
      const m = ball(x, BEACH - 0.25 + rnd() * 0.3, z, 0.3 + rnd() * 0.35, K.pick([0x8c917c, 0x6e7266, 0xa09a8c])); m.scale.y = 0.7; m.rotation.y = rnd() * 3;
    }
    if (theme.water) {
      if (sea === 'wide') B(0, SEA_Y - 0.15, 0, grid * 8, 0.3, grid * 8, theme.water, 0.05);
      else cyl(0, SEA_Y - 0.15, 0, grid * 1.3, 0.3, theme.water, 48, 0.05);
      // Foam where the sea meets the beach, a fainter ring further out, and the shallows.
      B(0, SEA_Y + 0.01, 0, grid + 1.2, 0.03, grid + 1.2, theme.foam, 0.1, 0.7);
      B(0, SEA_Y + 0.005, 0, grid + 3.0, 0.03, grid + 3.0, theme.foam, 0.1, 0.28);
      B(0, SEA_Y, 0, grid + 5.5, 0.02, grid + 5.5, theme.foam, 0.1, 0.12);
      for (let i = 0; i < 16; i += 1) { const a = rnd() * Math.PI * 2; const r = half + 3 + rnd() * (sea === 'wide' ? half * 2 : half * 0.4); const w = M.B(Math.cos(a) * r, SEA_Y + 0.02, Math.sin(a) * r, 1.0 + rnd() * 1.6, 0.02, 0.14, theme.foam, 0.1, 0.35); w.rotation.y = rnd() * 3; K.anim((t) => { w.material.opacity = 0.25 + Math.sin(t * 1.3 + i) * 0.15; }); }
    }
    if (theme.clouds) for (let i = 0; i < 18; i += 1) { const a = i * 0.35; const r = half + 1.5 + (i % 3) * 1.4; const c = M.ball(Math.cos(a) * r, -1.6 - (i % 2) * 0.8, Math.sin(a) * r, 2.0 + (i % 3) * 0.7, 0xffffff, 0.05, 0.9); c.scale.y = 0.5; const y0 = c.position.y; K.anim((t) => { c.position.y = y0 + Math.sin(t * 0.5 + i) * 0.25; }); }
    // The jetty: where a child arrives, and where they leave. Planks, posts, a rope, a lamp.
    B(0, JETTY_Y - 0.1, half + 1.5, 2.4, 0.2, 4.0, 0xb49a6a);
    for (let i = 0; i < 7; i += 1) B(0, JETTY_Y + 0.005, half - 0.2 + i * 0.6, 2.42, 0.02, 0.05, 0x8a6a45);
    for (const sx of [-1, 1]) for (const zz of [half + 0.3, half + 3.2]) { cyl(sx * 1.15, JETTY_Y - 0.6, zz, 0.1, 1.8, 0x8a6a45, 6); ball(sx * 1.15, JETTY_Y + 0.42, zz, 0.13, 0x6d543a); }
    for (const sx of [-1, 1]) B(sx * 1.15, JETTY_Y + 0.25, half + 1.75, 0.04, 0.04, 2.9, 0xd9c7a8);
    cyl(1.15, JETTY_Y + 0.9, half + 3.2, 0.06, 1.6, 0x3b3b40, 6); ball(1.15, JETTY_Y + 1.8, half + 3.2, 0.2, 0xffe08a, 1.6);
  });
  // The step from the beach onto the planks, on the island side.
  B(0, JETTY_Y - 0.3 - K.H(0, half - 1.2), half - 1.2, 2.4, 0.16, 1.2, 0xb49a6a);

  // ---- the world itself, then the ground it stands on (last: it reads every pad). ------
  (BUILD[island.theme] || BUILD.grass)(K, half);
  if (sign) makeSign(2.6, half - 2.6);
  K.terrain();
  K.flush();

  // The sign with the child's own name on it, re-painted when the language changes.
  function makeSign(x, z) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    let mesh = null;
    const paint = () => {
      const c = canvas.getContext('2d');
      c.fillStyle = '#f7f1e1'; c.fillRect(0, 0, 512, 160);
      c.strokeStyle = '#c9b98a'; c.lineWidth = 8; c.strokeRect(8, 8, 496, 144);
      c.fillStyle = '#1b3a2f'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center';
      c.fillText(say(`${owner}の しま`), 256, 70);
      c.font = '30px sans-serif'; c.fillStyle = '#7a5a3e';
      c.fillText(`${owner}'s Island`, 256, 122);
      if (mesh) mesh.material.map.needsUpdate = true;
    };
    paint();
    const tex = new THREE.CanvasTexture(canvas);
    const h = K.H(x, z);
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, h + 2.1, z); group.add(mesh);
    B(x, 1.0, z - 0.06, 0.16, 2.0, 0.16, 0x6d543a); B(x, 2.65, z - 0.06, 3.4, 0.12, 0.2, 0x6d543a);
    if (liveSign) unlive = live(paint);
  }

  return {
    group, obstacles, theme, half, grid,
    H: K.H,
    floorY: (x, z) => (z > half - 0.2 ? JETTY_Y : K.H(x, z)),
    animate(t) { for (const fn of anims) fn(t); },
    dispose() { unlive?.(); unlive = null; },
  };
}

// ---- the private scene ------------------------------------------------------------------
//
// Getting there is a boat ride. The ferry house on 土地島 does not teleport: the child is
// put on a boat out by the hub's jetty, the boat sails in across the water to the island's
// own jetty, and only then do they step off (⏭ skips to the stepping off). Leaving is the
// same ride the other way. The ride is presentation only — the room decided whose island
// this is before the boat moved — so nothing here is gated and nothing can be cheated.
const RIDE_IN = 9;      // seconds, hub to island
const RIDE_OUT = 5.5;   // seconds, island to hub
const BERTH_X = 2.9;    // the boat moors beside the jetty, not across it
const BOAT_Y = SEA_Y + 0.55;
const DECK = 0.78;      // where a child stands on the boat, above BOAT_Y

export function createLand({ player, camera, view, toast, onLeave }) {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x6a7a55, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(14, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 120 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const state = { active: false, island: null, obstacles: [], ride: null };
  let model = null;
  let parent = null;
  let cooldown = 0;
  let wasFirstPerson = false;
  let camSnap = false;              // the first frame of a ride puts the camera there at once

  // ---- the boat, and the hub it comes from --------------------------------------------
  const boat = new THREE.Group();
  const bm = (g, color, glow = 0, opacity = 1) => { const m = new THREE.Mesh(g, mat(color, glow, opacity)); m.castShadow = opacity === 1; boat.add(m); return m; };
  const CYL = geo('cyl10:1', () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const BALL = geo('ball', () => new THREE.SphereGeometry(1, 12, 9));
  const hull = bm(BOX, 0x4e7fa8); hull.scale.set(2.2, 0.8, 5.0); hull.position.y = 0.3;
  const bow = bm(geo('cone6', () => new THREE.ConeGeometry(1, 1, 6)), 0x4e7fa8); bow.scale.set(1.1, 1.6, 0.8); bow.rotation.x = -Math.PI / 2; bow.position.set(0, 0.3, -3.3);
  const deck = bm(BOX, 0xd9b45c); deck.scale.set(2.0, 0.12, 4.6); deck.position.y = 0.72;
  const rail = bm(BOX, 0xf3ecd8); rail.scale.set(2.3, 0.08, 5.2); rail.position.y = 0.78;
  const cabin = bm(BOX, 0xf3ecd8); cabin.scale.set(1.5, 1.1, 1.4); cabin.position.set(0, 1.3, 1.1);
  const roof = bm(BOX, 0xe0566a); roof.scale.set(1.8, 0.14, 1.7); roof.position.set(0, 1.9, 1.1);
  for (const sx of [-1, 1]) { const w = bm(BOX, 0x9fd6e8, 0.4); w.scale.set(0.06, 0.5, 0.8); w.position.set(sx * 0.76, 1.35, 1.1); }
  const frontWin = bm(BOX, 0x9fd6e8, 0.4); frontWin.scale.set(1.0, 0.5, 0.06); frontWin.position.set(0, 1.35, 0.38);
  const funnel = bm(CYL, 0x3b3b40); funnel.scale.set(0.2, 0.7, 0.2); funnel.position.set(0.4, 2.2, 1.4);
  const mast = bm(BOX, 0x6d543a); mast.scale.set(0.1, 2.4, 0.1); mast.position.set(0, 1.9, -1.2);
  const flag = bm(BOX, 0xe0566a); flag.scale.set(0.7, 0.4, 0.05); flag.position.set(0.4, 2.9, -1.2);
  for (const sx of [-1, 1]) { const ring = bm(CYL, 0xf3ecd8); ring.scale.set(0.35, 0.1, 0.35); ring.rotation.z = Math.PI / 2; ring.position.set(sx * 1.14, 0.55, 0.2); }
  const lamp = bm(BALL, 0xffe08a, 1.4); lamp.scale.set(0.12, 0.12, 0.12); lamp.position.set(0, 3.2, -1.2);
  const wake = []; for (let i = 0; i < 4; i += 1) { const w = bm(BOX, 0xffffff, 0.1, 0.5); w.scale.set(1.6 + i * 0.6, 0.04, 0.5); w.position.set(0, -0.02, 2.8 + i * 0.9); wake.push(w); }
  const puffs = []; for (let i = 0; i < 3; i += 1) { const pf = bm(BALL, 0xf3efe6, 0, 0.4); pf.scale.set(0.25, 0.25, 0.25); pf.position.set(0.4, 2.6, 1.4); puffs.push(pf); }
  boat.visible = false;
  scene.add(boat);
  // 土地島 itself, small and far, where the boat comes from and goes back to.
  const hub = new THREE.Group();
  const hm = (color, x, y, z, w, h, d) => { const m = new THREE.Mesh(BOX, mat(color)); m.position.set(x, y, z); m.scale.set(w, h, d); hub.add(m); return m; };
  hm(0x9ebd66, 0, -0.4, 0, 34, 0.8, 18); hm(0x8a9a52, 0, -1.3, 0, 32, 1.2, 16); hm(0xe8dcb8, 0, 0.08, 4, 16, 0.14, 8);
  for (const [x, c] of [[-10, 0xf2d8b2], [0, 0xcac3cc], [10, 0x78a7bc]]) { hm(c, x, 1.4, -2, 7, 2.8, 5.5); hm(0x7a5a3e, x, 3.1, -2, 7.8, 0.5, 6.2); hm(0x7a5a3e, x, 3.7, -2, 5, 0.8, 4); }
  for (const x of [-15, 14, -4, 6]) { hm(0x8a6a45, x, 1.2, 6, 0.4, 2.4, 0.4); hm(0x4e9a3f, x, 2.9, 6, 2.2, 1.6, 2.2); }
  hm(0xb49a6a, BERTH_X - 2.4, -0.1, -10.5, 2.2, 0.2, 5);
  for (const z of [-9, -12.5]) hm(0x8a6a45, BERTH_X - 1.4, 0.4, z, 0.2, 1.2, 0.2);
  scene.add(hub);

  const ui = document.createElement('div');
  ui.id = 'land-ride';
  ui.hidden = true;
  ui.innerHTML = `<span id="land-ride-text"></span><button type="button" id="land-ride-skip">⏭ <i>スキップ</i></button>`;
  document.body.append(ui);
  ui.querySelector('#land-ride-skip').addEventListener('click', () => skip());

  function build(island) {
    if (model) { scene.remove(model.group); model.dispose(); }
    model = buildIslandModel(island, { owner: island.owner || '', sign: true, liveSign: true, sea: 'wide' });
    scene.add(model.group);
    state.obstacles = model.obstacles;
    const theme = model.theme;
    const half = island.grid / 2;
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, half * 2.5, theme.space ? half * 12 : Math.max(half * 6, half + 75));
    sun.color.set(theme.sun);
    sun.intensity = theme.space ? 2.0 : island.theme === 'volcano' ? 1.2 : 1.6;
    hemi.intensity = theme.space ? 0.9 : 1.7;
    hemi.groundColor.set(theme.ground);
    const s = half + 4; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s }); sun.shadow.camera.updateProjectionMatrix();
    hub.position.set(0, theme.water ? -0.6 : -3, half + 58);
    hub.visible = !theme.space;
  }

  // Where the boat is at a point of the ride: a straight run between the hub's jetty and
  // this island's berth, eased so it slows into the berth and pulls away from it gently.
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
  function rideZ(ride) {
    const half = state.island.grid / 2;
    const far = half + 44; const near = half + 2.4;
    const u = ease(Math.min(1, ride.t / ride.dur));
    return ride.dir === 'in' ? far + (near - far) * u : near + (far - near) * u;
  }
  function startRide(dir) {
    state.ride = { dir, t: 0, dur: dir === 'in' ? RIDE_IN : RIDE_OUT };
    boat.visible = true;
    boat.position.set(BERTH_X, BOAT_Y, rideZ(state.ride));
    boat.rotation.set(0, dir === 'in' ? 0 : Math.PI, 0);
    player.position.set(BERTH_X, BOAT_Y + DECK, boat.position.z + 0.2);
    player.rotation.y = dir === 'in' ? Math.PI : 0;
    document.body.classList.add('on-ferry');
    ui.hidden = false;
    const isle = state.island;
    ui.querySelector('#land-ride-text').textContent = dir === 'in'
      ? tr('⛵ {name}へ…', { name: isle.visiting ? tr('{name}の しま', { name: isle.owner }) : (isJa() ? isle.name : isle.en) })
      : tr('⛵ 土地島へ もどる…');
    camSnap = true;
  }
  function endRide() {
    const ride = state.ride;
    if (!ride) return;
    state.ride = null;
    ui.hidden = true;
    document.body.classList.remove('on-ferry');
    const half = state.island.grid / 2;
    if (ride.dir === 'in') {
      // Moored beside the jetty; the child steps onto it.
      boat.position.set(BERTH_X, BOAT_Y, half + 2.4);
      player.position.set(0, JETTY_Y, half + 1.4);
      player.rotation.y = Math.PI;
      cooldown = 1.5;
      const isle = state.island;
      toast(isle.visiting
        ? tr('{emoji} {name}の しまに ついた！ さんばしに もどると かえれるよ。', { emoji: isle.emoji || '', name: isle.owner })
        : tr('{emoji} {name}に ついた！ さんばしに もどると かえれるよ。', { emoji: isle.emoji || '', name: isJa() ? isle.name : isle.en }));
    } else {
      boat.visible = false;
      leave();
    }
  }
  function skip() { if (state.ride) { state.ride.t = state.ride.dur; endRide(); } }

  function enter(payload, { ride = true } = {}) {
    state.island = payload;
    build(payload);
    parent = player.parent;
    scene.add(player);
    player.position.set(0, JETTY_Y, payload.grid / 2 - 1.4);
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
    if (ride) startRide('in');
    else toast(tr('{emoji} {name}に ついた！ さんばしに もどると かえれるよ。', { emoji: payload.emoji || '', name: isJa() ? payload.name : payload.en }));
    return true;
  }

  function leave(silent = false) {
    if (!state.active) return false;
    state.active = false;
    state.ride = null;
    ui.hidden = true;
    boat.visible = false;
    document.body.classList.remove('on-ferry');
    (parent || null)?.add(player);
    player.position.y = 0;
    document.body.classList.remove('on-own-island');
    if (view) view.firstPerson = wasFirstPerson;
    document.body.classList.toggle('first-person', wasFirstPerson);
    onLeave(silent);
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !state.island) return null;
    if (state.ride) return true;                      // on the boat, the boat does the moving
    const half = state.island.grid / 2;
    // The jetty is the way out; the water is not walked on.
    if (z > half) return !(Math.abs(x) < 1.1 && z < half + 3.5);
    if (Math.abs(x) > half - 0.4 || z < -half + 0.4) return true;
    return state.obstacles.some((o) => Math.abs(x - o.x) < o.w + 0.35 && Math.abs(z - o.z) < o.d + 0.35);
  }

  // Where a child's feet are: on the boat's deck, on the planks, or on the ground's hills.
  function floorY(x, z) {
    if (!state.active || !model) return 0;
    if (state.ride) return boat.position.y + DECK;
    return model.floorY(x, z);
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    model?.animate(t);
    if (boat.visible) {
      boat.position.y = BOAT_Y + Math.sin(t * 1.6) * 0.07;
      boat.rotation.z = Math.sin(t * 1.3) * 0.035;
      boat.rotation.x = Math.sin(t * 1.1 + 1) * 0.02;
      flag.rotation.y = Math.sin(t * 5) * 0.4;
      const moving = !!state.ride;
      wake.forEach((w, i) => { w.visible = moving; w.material.opacity = 0.45 - i * 0.1 + Math.sin(t * 6 + i) * 0.08; });
      puffs.forEach((pf, i) => { pf.visible = moving; const k = (t * 0.8 + i * 0.45) % 1.3; pf.position.set(0.4 + Math.sin(t + i) * 0.2, 2.6 + k * 1.6, 1.4 + k * 1.2); const sc = 0.2 + k * 0.3; pf.scale.set(sc, sc, sc); pf.material.opacity = Math.max(0, 0.4 - k * 0.3); });
    }
    if (state.ride) {
      state.ride.t += dt;
      boat.position.z = rideZ(state.ride);
      player.position.set(BERTH_X, boat.position.y + DECK, boat.position.z + 0.2);
      player.rotation.y = state.ride.dir === 'in' ? Math.PI : 0;
      if (state.ride.t >= state.ride.dur) endRide();
      return;
    }
    // Walking back out along the jetty is boarding: the boat takes the child home.
    const half = state.island.grid / 2;
    if (!cooldown && !document.querySelector('dialog[open]') && player.position.z > half + 2.2) startRide('out');
  }

  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    if (state.ride) {
      // Off the quarter, a little high: the boat in the frame and the island ahead of it.
      const b = boat.position; const dir = state.ride.dir === 'in' ? -1 : 1;
      const desired = new THREE.Vector3(b.x + 8, b.y + 8.5, b.z - dir * 8);
      if (camSnap) { camera.position.copy(desired); camSnap = false; } else camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
      camera.lookAt(b.x, b.y + 1.0, b.z + dir * 7);
      return true;
    }
    const py = player.position.y;
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + py, player.position.z);
      camera.lookAt(player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10);
    } else {
      // Over the shoulder and a little high: the island is the point, so the camera keeps
      // more of it in view than the room's does, and rides the hills with the child.
      const distance = THREE.MathUtils.clamp(zoom * 0.75, 12, 24);
      const focus = new THREE.Vector3(player.position.x * 0.75, py + 1.4, player.position.z * 0.75 - 1);
      const desired = new THREE.Vector3(focus.x + Math.sin(yaw) * distance, py + 1.5 + distance * 0.6, focus.z + Math.cos(yaw) * distance);
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
    ctx.fillStyle = theme.water ? '#2f7f98' : theme.space ? '#0a0c18' : '#4a6fb0';
    ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = `#${theme.ground.toString(16).padStart(6, '0')}`;
    ctx.fillRect(90 - half * scale, 70 - half * scale, state.island.grid * scale, state.island.grid * scale);
    ctx.fillStyle = '#b49a6a';
    ctx.fillRect(90 - 1.2 * scale, 70 + half * scale, 2.4 * scale, 3.5 * scale);
    ctx.fillStyle = '#3c5a4a';
    for (const o of state.obstacles) ctx.fillRect(90 + (o.x - o.w) * scale, 70 + (o.z - o.d) * scale, Math.max(1, o.w * 2 * scale), Math.max(1, o.d * 2 * scale));
    if (boat.visible) { ctx.fillStyle = '#f3ecd8'; ctx.fillRect(90 + (boat.position.x - 1) * scale, 70 + Math.min(half + 4, boat.position.z - 2.5) * scale, 2 * scale, 5 * scale); }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(90 + player.position.x * scale, 70 + Math.min(half + 6, player.position.z) * scale, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.font = '10px sans-serif';
    ctx.fillText(`${state.island.emoji || ''} ${say(state.island.name)}`, 10, 16);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, floorY, update, updateCamera, minimap, skip, boat,
    get active() { return state.active; },
    get riding() { return !!state.ride; },
  };
}
