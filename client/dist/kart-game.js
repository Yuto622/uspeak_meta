// U-SPEAK GRAND PRIX — the kart game.
//
// This is not a screen laid over the island. It is its own game: its own scene, its own
// camera, its own lights, its own frame loop and its own controls. Opening it stops the
// island's loop dead and hands the renderer over; closing it hands the renderer back and
// the island carries on from the frame it was on, in the same place, with the same weather.
//
// What lives here is the running of a race — the grid, the lights, twelve karts, the
// camera, the boxes, the laps, the flag. What does not live here: how a kart drives
// (kart-drive.js), how a rival decides (kart-ai.js), what the circuit is (tracks.json and
// kart-track-data.js), and — the important one — what a race is worth. Coins, XP and the
// finishing order come back from the room. A page that can award itself a first place is
// not a page a parent's report can be built on.
import * as THREE from './three.module.js';
import { tracksFrom } from './kart-track-data.js';
import { buildTrack, itemBoxes } from './kart-track.js';
import { buildKart, buildSparks, buildBoostFlame, COLOURS } from './kart-models.js';
import { createKart, gridKart, advance, boostKart, KART } from './kart-drive.js';
import { createDriver, driveAI, rubberFor, maybeSlip } from './kart-ai.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (ms) => (ms > 0 ? `${Math.floor(ms / 60000)}'${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}"${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}` : "--'--\"--");
const th = (n) => ['', '1st', '2nd', '3rd'][n] || `${n}th`;

// The rivals of the U-Speak Grand Prix. Ours, not anybody else's: four characters from
// this game's own world, with their own machines and their own way of driving.
export const RIVALS = [
  { id: 'ai-midori', name: 'ミドリ', skill: 1.06, power: 1.04, style: -0.6, colour: 0x7bc86c },
  { id: 'ai-momo', name: 'モモ', skill: 0.98, power: 1.0, style: 0.5, colour: 0xef6f8a },
  { id: 'ai-sora', name: 'ソラ', skill: 1.0, power: 0.98, style: 0, colour: 0x4fa8e0 },
  { id: 'ai-kumo', name: 'クモ', skill: 0.88, power: 0.94, style: 0.8, colour: 0xb08ae0 },
  { id: 'ai-hoshi', name: 'ホシ', skill: 0.92, power: 1.02, style: -0.3, colour: 0xffd166 },
];

export function createKartGame({ renderer, send, toast, onExit, isOnline }) {
  const state = {
    open: false,
    phase: 'off',        // off | grid | lights | race | done
    track: null,
    startsAt: 0,
    raceStart: 0,
    now: 0,
    lap: 1,
    laps: 3,
    place: 0,
    lapStart: 0,
    lastLap: 0,
    best: 0,
    box: null,           // the English question on screen
    field: [],           // everyone, child and rivals, in running order
    result: null,
  };

  let scene = null;
  let camera = null;
  let trackRoot = null;
  let boxes = null;
  let raf = 0;
  let lastFrame = 0;
  let acc = 0;
  const me = { kart: createKart(), model: null, sparks: null, flame: null, name: 'あなた', id: 'me', cp: 0, lap: 0, finished: 0 };
  const rivals = [];
  const held = new Set();

  // ---- the screen -----------------------------------------------------------------
  const screen = document.createElement('div');
  screen.id = 'gp';
  screen.hidden = true;
  screen.innerHTML = `<div id="gp-hud" class="gp-hud">
      <div class="gp-tl">
        <div class="gp-place"><b id="gp-place">1</b><small id="gp-of">/6</small></div>
        <div class="gp-lap"><span>LAP</span><b id="gp-lap">1/3</b></div>
      </div>
      <div class="gp-tc"><div id="gp-word" class="gp-word" hidden></div></div>
      <div class="gp-tr">
        <div class="gp-times"><span id="gp-time">--'--"--</span><small id="gp-best"></small></div>
        <canvas id="gp-map" class="gp-map" width="180" height="180"></canvas>
        <ol id="gp-order" class="gp-order"></ol>
      </div>
      <div class="gp-bl">
        <button type="button" class="gp-key" data-gp-key="left" aria-label="ひだり">◀</button>
        <button type="button" class="gp-key" data-gp-key="right" aria-label="みぎ">▶</button>
      </div>
      <div class="gp-bc"><div class="gp-speed"><b id="gp-speed">0</b><small>km/h</small></div>
        <p class="gp-keys">W アクセル · A / D ハンドル · スペース ドリフト · S ブレーキ</p></div>
      <div class="gp-br">
        <button type="button" class="gp-key gp-brake" data-gp-key="brake" aria-label="ブレーキ">▼</button>
        <button type="button" class="gp-key gp-drift" data-gp-key="drift" aria-label="ドリフト">ドリフト</button>
        <button type="button" class="gp-key gp-gas" data-gp-key="gas" aria-label="アクセル">▲</button>
      </div>
    </div>
    <div id="gp-lights" class="gp-lights" hidden><i></i><i></i><i></i><i></i><i></i></div>
    <div id="gp-flash" class="gp-flash" hidden></div>
    <div id="gp-quiz" class="gp-quiz" hidden>
      <div class="gp-quiz-word"><span id="gp-quiz-emoji">📦</span><b id="gp-quiz-ja"></b></div>
      <div id="gp-quiz-choices" class="gp-quiz-choices"></div>
    </div>
    <div id="gp-result" class="gp-result" hidden>
      <div class="gp-result-card">
        <span class="gp-eyebrow">RESULT</span>
        <h2 id="gp-result-place">ゴール！</h2>
        <div id="gp-result-body"></div>
        <button type="button" id="gp-exit" class="gp-exit">のりもの島に もどる</button>
      </div>
    </div>
    <button type="button" id="gp-quit" class="gp-quit" aria-label="レースをやめる">✕</button>`;
  document.body.append(screen);

  const hud = $('#gp-hud', screen);
  const lights = $('#gp-lights', screen);
  const flash = $('#gp-flash', screen);
  const quiz = $('#gp-quiz', screen);
  const mapCanvas = $('#gp-map', screen);

  // Thumbs. Held, not tapped: an accelerator you have to tap is not an accelerator.
  for (const b of screen.querySelectorAll('[data-gp-key]')) {
    const key = b.dataset.gpKey;
    const down = (e) => { e.preventDefault(); held.add(key); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch { /* no capture */ } };
    const up = () => { held.delete(key); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.oncontextmenu = (e) => e.preventDefault();
  }
  $('#gp-quit', screen).onclick = () => quit('やめました');
  $('#gp-exit', screen).onclick = () => quit('');

  // The keyboard, only while the race owns the screen — the island's own keys are not
  // listening then, and these must not reach it afterwards.
  const keys = new Set();
  const onKey = (e) => {
    if (!state.open) return;
    const k = e.key.toLowerCase();
    if ([' ', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.type === 'keydown') keys.add(k); else keys.delete(k);
    if (e.type === 'keydown' && k === 'escape') quit('やめました');
  };

  function input() {
    // A stand-in driver, when there is nobody at the wheel: the tests and the screenshots
    // use it because this container renders three frames a second and cannot steer, and
    // the grid before the lights uses it to make the karts look alive. It is the rivals'
    // own code, so it can only do what a child could do.
    if (state.autoDrive) return state.autoDrive(me.kart, state.now);
    const k = (...names) => names.some((n) => keys.has(n));
    return {
      throttle: held.has('gas') || k('w', 'arrowup'),
      brake: held.has('brake') || k('s', 'arrowdown'),
      steer: (held.has('right') || k('d', 'arrowright') ? 1 : 0) - (held.has('left') || k('a', 'arrowleft') ? 1 : 0),
      drift: held.has('drift') || k(' ', 'shift'),
    };
  }

  // ---- building the world once ------------------------------------------------------
  async function build() {
    if (scene) return;
    const data = await (await fetch('tracks.json')).json();
    state.track = tracksFrom(data).tracks[0];
    const def = state.track.def;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(def.sky?.[1] || 0x4a6fa5);
    scene.fog = new THREE.Fog(new THREE.Color(def.sky?.[0] || 0xffb877), 220, 620);
    camera = new THREE.PerspectiveCamera(72, 1, 0.4, 1400);

    // A low sun down the main straight: long shadows, warm side of everything, and a
    // horizon a child recognises as evening without being told.
    // A low sun and a bright sky. The renderer this borrows from is tone-mapped for the
    // island's soft daylight, and the first build came out as a night race on black tarmac
    // — these numbers are what it takes to read as evening rather than midnight.
    const sun = new THREE.DirectionalLight(0xfff0cf, 2.4);
    sun.position.set(-160, 120, -90);
    scene.add(sun, new THREE.HemisphereLight(0xdcefff, 0x8a9a70, 1.5));
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    trackRoot = buildTrack(state.track);
    scene.add(trackRoot);
    boxes = itemBoxes(state.track);
    scene.add(boxes.group);

    me.model = buildKart({ colour: 0xe05a5a });
    me.sparks = buildSparks();
    me.flame = buildBoostFlame();
    me.model.add(me.sparks.group, me.flame);
    scene.add(me.model);

    RIVALS.forEach((r, i) => {
      const model = buildKart({ colour: r.colour });
      const flame = buildBoostFlame();
      model.add(flame);
      scene.add(model);
      rivals.push({
        ...r,
        driver: createDriver(r),
        kart: createKart({ power: r.power }),
        model,
        flame,
        cp: 0,
        lap: 0,
        finished: 0,
        progress: 0,
      });
    });
  }

  // ---- the race ---------------------------------------------------------------------
  function grid() {
    const t = state.track;
    state.laps = t.laps;
    state.lap = 1;
    state.place = 0;
    state.best = 0;
    state.lastLap = 0;
    state.result = null;
    $('#gp-result', screen).hidden = true;
    // The child takes a slot in the middle of the grid; the rivals fill in around them, so
    // there is somebody to pass and somebody passing.
    const slots = t.grid;
    gridKart(me.kart, slots[2]);
    me.kart.power = state.power || 1;
    me.kart.s = t.project(me.kart.x, me.kart.z).s;
    me.cp = 0; me.lap = 0; me.finished = 0;
    const order = [0, 1, 3, 4, 5];
    rivals.forEach((r, i) => {
      gridKart(r.kart, slots[order[i] % slots.length]);
      r.kart.s = t.project(r.kart.x, r.kart.z).s;
      r.cp = 0; r.lap = 0; r.finished = 0; r.progress = 0;
    });
    placeModels();
  }

  const cpCount = () => state.track.checkpoints.length;
  const progressOf = (o) => o.lap * cpCount() + o.cp;

  // A racer passes a checkpoint when their distance round the lap goes past it. Counting
  // them in order is what makes a lap a lap: the corner-cutter who drives across the infield
  // never passes the ones they skipped, so their lap never completes.
  function checkpoints(o, kart) {
    const n = cpCount();
    const next = state.track.checkpoints[o.cp % n];
    const gap = ((kart.s - next.s) + state.track.length) % state.track.length;
    if (gap < state.track.length * 0.25) {
      o.cp += 1;
      if (o.cp % n === 0) {
        o.lap += 1;
        return 'lap';
      }
      return 'cp';
    }
    return '';
  }

  function step(dt) {
    const t = state.track;
    const racing = state.phase === 'race';
    const locked = !racing || !!state.box;
    const ev = advance(me.kart, {
      seconds: dt,
      input: locked ? { throttle: false, brake: false, steer: 0, drift: false } : input(),
      track: t,
      now: state.now,
    });
    for (const e of ev) {
      if (e.type === 'turbo') banner(['', 'ミニターボ！', 'スーパー ミニターボ！', 'ウルトラ ミニターボ！'][e.level], 700);
      if (e.type === 'land' && e.clean) banner('ナイス ジャンプ！', 700);
    }
    if (racing) {
      rescue(me, me.kart, dt);
      const got = checkpoints(me, me.kart);
      if (got === 'lap') lapDone();
      else if (got === 'cp') send?.('gp:cp', { cp: me.cp, s: Math.round(me.kart.s), lap: me.lap });
      padsAndBoxes();
    }

    // Contact. Without it twelve karts share one racing line and drive through each other,
    // which is what the first pack looked like: a stack. A bump moves both of them and
    // costs the one doing the shoving a little speed, so slipstreaming up the inside is
    // worth trying and barging through the field is not.
    if (racing) bumps();

    // The rivals: the same physics, their own hands, and a nudge from how the race is going.
    for (const r of rivals) {
      if (!racing) continue;
      maybeSlip(r.driver, state.now);
      const gap = (progressOf(me) - progressOf(r)) * (t.length / cpCount());
      const hands = driveAI(r.driver, r.kart, { track: t, now: state.now, rubber: rubberFor(gap) });
      advance(r.kart, { seconds: dt, input: hands, track: t, now: state.now });
      rescue(r, r.kart, dt);
      const got = checkpoints(r, r.kart);
      if (got === 'lap' && r.lap >= state.laps && !r.finished) r.finished = state.now;
    }
  }

  const BUMP = 2.5;        // metres between kart centres before they touch
  function bumps() {
    const all = [me, ...rivals];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i].kart;
        const b = all[j].kart;
        if (Math.abs(a.y - b.y) > 3) continue;         // one of them is over the jump
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > BUMP || d < 1e-4) continue;
        const push = (BUMP - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
        // The faster kart loses a little for the contact; the slower one is shoved along.
        // Nobody is stopped by a bump — being stopped by another kart is how a child ends
        // up watching the race from a barrier.
        const fast = a.speed > b.speed ? a : b;
        const slow = fast === a ? b : a;
        fast.speed *= 0.94;
        slow.speed = Math.max(slow.speed, fast.speed * 0.82);
        if (all[i] === me || all[j] === me) me.kart.hitAt = state.now;
      }
    }
  }

  // Fished out. A kart that has left the circuit altogether — over the sand, past the
  // grass, out over the water — is put back on the road at the last checkpoint it passed,
  // facing the right way, having lost the time. Every kart game has somebody who does
  // this, because the alternative is a child driving into the distance until they cry.
  const OUT = 42;          // metres off the centre line before the marshals come out
  const PATIENCE = 1.1;    // seconds of it
  function rescue(o, kart, dt) {
    const half = state.track.at(kart.s).w / 2;
    if (Math.abs(kart.offset) < Math.max(OUT, half + 26)) { o.lost = 0; return; }
    o.lost = (o.lost || 0) + dt;
    if (o.lost < PATIENCE) return;
    o.lost = 0;
    const cp = state.track.checkpoints[o.cp % cpCount()];
    const back = state.track.at(((cp.s - 12) + state.track.length) % state.track.length);
    kart.x = back.x; kart.y = back.y; kart.z = back.z;
    kart.heading = Math.atan2(back.tx, back.tz);
    kart.course = kart.heading;
    kart.speed = 0; kart.slip = 0; kart.drift = 0; kart.driftWay = 0; kart.sparks = 0;
    kart.air = false; kart.vy = 0; kart.boostUntil = 0; kart.hint = -1;
    if (o === me) banner('コースに もどします', 1200, 'gp-miss');
  }

  function padsAndBoxes() {
    const t = state.track;
    for (const b of t.boosts) {
      if (Math.hypot(me.kart.x - b.x, me.kart.z - b.z) < 3.2) {
        if (state.now - (b.tookAt || -9999) > 1200) { b.tookAt = state.now; boostKart(me.kart, 'pad', state.now); banner('ブースト！', 600); }
      }
    }
    for (const b of boxes.boxes) {
      if (b.takenUntil > state.now || state.box) continue;
      if (Math.hypot(me.kart.x - b.def.x, me.kart.z - b.def.z) < 2.6) {
        b.takenUntil = state.now + 6000;
        b.mesh.visible = false;
        send?.('gp:item', {});
      }
    }
  }

  function lapDone() {
    const ms = state.now - state.lapStart;
    state.lapStart = state.now;
    state.lastLap = ms;
    if (!state.best || ms < state.best) state.best = ms;
    send?.('gp:cp', { cp: me.cp, s: Math.round(me.kart.s), lap: me.lap });
    if (me.lap >= state.laps) {
      me.finished = state.now;
      finish();
    } else {
      state.lap = me.lap + 1;
      banner(`LAP ${state.lap}/${state.laps}`, 1200);
      if (state.lap === state.laps) banner('ファイナル ラップ！', 1600);
    }
  }

  // ---- what the screen shows ----------------------------------------------------------
  function banner(text, ms = 900, kind = '') {
    flash.textContent = text;
    flash.className = `gp-flash ${kind}`;
    flash.hidden = false;
    clearTimeout(banner.t);
    banner.t = setTimeout(() => { flash.hidden = true; }, ms);
  }

  function order() {
    const all = [
      { id: 'me', name: state.name || 'あなた', mine: true, p: progressOf(me), fin: me.finished, s: me.kart.s },
      ...rivals.map((r) => ({ id: r.id, name: r.name, mine: false, p: progressOf(r), fin: r.finished, s: r.kart.s })),
    ];
    all.sort((a, b) => {
      if (a.fin && b.fin) return a.fin - b.fin;
      if (a.fin) return -1;
      if (b.fin) return 1;
      if (b.p !== a.p) return b.p - a.p;
      return b.s - a.s;
    });
    return all;
  }

  function paintHud() {
    const list = order();
    state.field = list;
    const mine = list.findIndex((r) => r.mine) + 1;
    state.place = mine;
    $('#gp-place', hud).textContent = String(mine);
    $('#gp-of', hud).textContent = `/${list.length}`;
    $('#gp-lap', hud).textContent = `${Math.min(state.lap, state.laps)}/${state.laps}`;
    $('#gp-speed', hud).textContent = String(Math.round(Math.abs(me.kart.speed) * 3.6 * 1.4));
    $('#gp-time', hud).textContent = clock(state.phase === 'race' ? state.now - state.lapStart : 0);
    $('#gp-best', hud).textContent = state.best ? `BEST ${clock(state.best)}` : '';
    $('#gp-order', hud).innerHTML = list.map((r, i) => (
      `<li class="${r.mine ? 'me' : ''}"><b>${i + 1}</b>${esc(r.name)}</li>`
    )).join('');
    hud.dataset.drift = me.kart.sparks ? String(me.kart.sparks) : '';
    hud.dataset.boost = state.now < me.kart.boostUntil ? '1' : '';
  }

  function paintMap() {
    const ctx = mapCanvas.getContext('2d');
    const t = state.track;
    const w = mapCanvas.width;
    const pad = 14;
    const xs = t.frames.map((f) => f.x);
    const zs = t.frames.map((f) => f.z);
    const minX = Math.min(...xs); const minZ = Math.min(...zs);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ) || 1;
    const at = (x, z) => [pad + ((x - minX) / span) * (w - pad * 2), pad + ((z - minZ) / span) * (w - pad * 2)];
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = '#0b201dcc';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    t.frames.forEach((f, i) => { const [px, py] = at(f.x, f.z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.closePath();
    ctx.stroke();
    for (const r of rivals) {
      const [px, py] = at(r.kart.x, r.kart.z);
      ctx.fillStyle = `#${r.colour.toString(16).padStart(6, '0')}`;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    }
    const [px, py] = at(me.kart.x, me.kart.z);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#12302c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  // ---- drawing -------------------------------------------------------------------------
  function placeOne(model, kart, t) {
    model.position.set(kart.x, kart.y + 0.02, kart.z);
    model.rotation.set(0, kart.heading + kart.slip * 1.25, 0);
    // Lean into the corner, and nose up over a crest — small angles, but they are most of
    // what makes a kart look alive rather than slid along the ground.
    const f = t.at(kart.s);
    model.rotation.z = -kart.slip * 0.35 - f.bank * 0.6;
    model.rotation.x = -f.grade * 0.8;
    const { wheels } = model.userData;
    for (const w of wheels) {
      w.rotation.x -= kart.speed * 0.06;
      if (w.userData.front) w.rotation.y = kart.slip * 0.6;
    }
  }

  function placeModels() {
    const t = state.track;
    placeOne(me.model, me.kart, t);
    me.sparks.set(me.kart.sparks, state.now / 1000);
    me.flame.visible = state.now < me.kart.boostUntil;
    for (const r of rivals) {
      placeOne(r.model, r.kart, t);
      r.flame.visible = state.now < r.kart.boostUntil;
    }
  }

  function look(dt) {
    const k = me.kart;
    if (state.phase === 'grid') {
      // Before the lights: a slow sweep round the grid, which is what a race gives you
      // instead of a loading screen.
      const a = state.now / 2600;
      const r = 26;
      camera.position.set(k.x + Math.sin(a) * r, k.y + 9, k.z + Math.cos(a) * r);
      camera.lookAt(k.x, k.y + 1.4, k.z);
      return;
    }
    const boosting = state.now < k.boostUntil;
    const back = 9.2 + Math.min(4, Math.abs(k.speed) * 0.16) + (boosting ? 2.2 : 0);
    const dir = k.heading + k.slip * 0.9;
    const want = {
      x: k.x - Math.sin(dir) * back,
      y: k.y + 4.7 + Math.min(1.3, Math.abs(k.speed) * 0.045),
      z: k.z - Math.cos(dir) * back,
    };
    const ease = 1 - Math.exp(-dt * (7 + Math.abs(k.speed) * 0.2));
    camera.position.x += (want.x - camera.position.x) * ease;
    camera.position.y += (want.y - camera.position.y) * ease;
    camera.position.z += (want.z - camera.position.z) * ease;
    camera.lookAt(k.x + Math.sin(k.heading) * 8, k.y + 1.6, k.z + Math.cos(k.heading) * 8);
    // Speed is a feeling, and on a screen the feeling is field of view.
    const want2 = 72 + Math.min(16, Math.abs(k.speed) * 0.45) + (boosting ? 6 : 0);
    camera.fov += (want2 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }

  // The race draws into the island's own canvas with the island's own renderer. One WebGL
  // context, not two: a second one costs an iPad another few hundred megabytes and Safari
  // only allows a handful at a time. The island simply stops drawing while this is up.
  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---- the loop --------------------------------------------------------------------------
  const STEP = 1 / 120;
  function frame(ts) {
    if (!state.open) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;
    acc += dt;
    // Fixed steps, so the race is the same race on a slow tablet — and a slow tablet is
    // given a floor rather than a spiral: at worst it simulates a quarter second a frame.
    let guard = 0;
    while (acc >= STEP && guard < 40) {
      step(STEP);
      state.now += STEP * 1000;
      acc -= STEP;
      guard += 1;
    }
    if (guard >= 40) acc = 0;

    if (state.phase === 'lights' && state.now >= state.startsAt) go();
    placeModels();
    look(dt);
    for (const b of boxes.boxes) {
      b.mesh.rotation.y += dt * 2.2;
      b.mesh.position.y = b.def.y + 1.6 + Math.sin(state.now / 320 + b.def.x) * 0.18;
      if (!b.mesh.visible && b.takenUntil && state.now > b.takenUntil) b.mesh.visible = true;
    }
    paintHud();
    if (Math.floor(state.now / 100) !== frame.mapAt) { frame.mapAt = Math.floor(state.now / 100); paintMap(); }
    renderer.render(scene, camera);
  }

  // ---- opening and closing -----------------------------------------------------------------
  async function open({ name = 'あなた', power = 1, laps = 0 } = {}) {
    if (state.open) return;
    await build();
    state.name = name;
    state.power = power;
    if (laps) state.track.laps = laps;
    state.open = true;
    state.phase = 'grid';
    state.now = 0;
    state.startsAt = 4200;
    acc = 0;
    lastFrame = performance.now();
    screen.hidden = false;
    document.body.dataset.gp = 'on';
    grid();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    lights.hidden = false;
    lights.dataset.lit = '0';
    banner(state.track.name, 2200, 'gp-title');
    // The lights run on the game's own clock, which is the clock the karts move on: a
    // tablet that stutters through the countdown still gets three full seconds of it.
    state.phase = 'lights';
    raf = requestAnimationFrame(frame);
    lightsTimer();
  }

  function lightsTimer() {
    clearInterval(lightsTimer.t);
    lightsTimer.t = setInterval(() => {
      if (!state.open || state.phase !== 'lights') { clearInterval(lightsTimer.t); return; }
      const left = state.startsAt - state.now;
      const lit = Math.max(0, Math.min(5, Math.round((1 - left / 3200) * 5)));
      lights.dataset.lit = String(lit);
    }, 60);
  }

  function go() {
    state.phase = 'race';
    state.raceStart = state.now;
    state.lapStart = state.now;
    lights.dataset.lit = '5';
    setTimeout(() => { lights.hidden = true; }, 600);
    banner('GO!', 1100, 'gp-go');
    clearInterval(lightsTimer.t);
    send?.('gp:go', {});
  }

  function finish() {
    state.phase = 'done';
    const list = order();
    const place = list.findIndex((r) => r.mine) + 1;
    banner(`${th(place)}！`, 2000, 'gp-finish');
    send?.('gp:finish', { place, best: Math.round(state.best), laps: me.lap });
    // The card is filled in twice: straight away with what the page knows, and again when
    // the room says what it was worth. The coins on it are always the room's.
    showResult({ place, best: state.best, list, coins: null, xp: null });
  }

  function showResult({ place, best, list, coins, xp, capped }) {
    const box2 = $('#gp-result', screen);
    $('#gp-result-place', screen).textContent = place ? `${th(place)}！` : 'ゴール！';
    $('#gp-result-body', screen).innerHTML = `
      <p class="gp-result-line"><span>ベストラップ</span><b>${clock(best)}</b></p>
      <p class="gp-result-line"><span>もらえるもの</span><b>${coins === null ? '…' : `◈ +${coins}　✧ +${xp} XP`}</b>${capped ? '<small>（今日のコインは上限）</small>' : ''}</p>
      <ol class="gp-result-order">${list.map((r, i) => `<li class="${r.mine ? 'me' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span></li>`).join('')}</ol>`;
    box2.hidden = false;
  }

  function quit(why) {
    if (!state.open) return;
    state.open = false;
    state.phase = 'off';
    cancelAnimationFrame(raf);
    clearInterval(lightsTimer.t);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    keys.clear();
    held.clear();
    for (const b of screen.querySelectorAll('[data-gp-key]')) b.classList.remove('on');
    screen.hidden = true;
    delete document.body.dataset.gp;
    send?.('gp:leave', {});
    if (why) toast?.(why);
    onExit?.();
  }

  return {
    state,
    get running() { return state.open; },
    open,
    quit,
    setAutoDrive(fn) { state.autoDrive = fn; },
    get me() { return me; },
    // The room's word on what the race was worth, and on who really won.
    onResult(m) {
      if (!state.result) state.result = m;
      showResult({
        place: m.place || state.place,
        best: state.best,
        list: state.field,
        coins: m.coins || 0,
        xp: m.xp || 0,
        capped: m.capped,
      });
    },
    // 📦 An item box: one Japanese word, three English answers, and a dash for getting it
    // right. The answer is never in the page.
    onItem(m) {
      state.box = m;
      $('#gp-quiz-emoji', screen).textContent = m.emoji || '📦';
      $('#gp-quiz-ja', screen).textContent = m.ja || '';
      $('#gp-quiz-choices', screen).innerHTML = (m.choices || []).map((c) => `<button type="button" data-pick="${esc(c)}">${esc(c)}</button>`).join('');
      quiz.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => answer(b.dataset.pick); });
      quiz.hidden = false;
      clearTimeout(answer.t);
      answer.t = setTimeout(() => answer(''), m.ms || 5000);
    },
    onBoost(m) {
      if (m.ok) { boostKart(me.kart, 'item', state.now); banner('せいかい！ ダッシュ！', 900, 'gp-go'); }
      else banner(`${m.answer} だったね`, 1200, 'gp-miss');
    },
    onClosed() { quit(''); },
    screen,
  };

  function answer(pick) {
    if (!state.box) return;
    clearTimeout(answer.t);
    state.box = null;
    quiz.hidden = true;
    send?.('gp:item', { pick });
  }
}
