// のりもの島のレース — the grid, the lights, three laps and the flag.
//
// This file is the race as a child experiences it: the countdown across the screen, the
// place and the lap in the corner, the item box that asks for an English word before it
// gives a boost, the rivals' karts on the road ahead, and the board at the end.
//
// It decides none of it. Checkpoints are claimed to the server and the server says whether
// they counted; the running order arrives four times a second; the item box's answer is
// never in the page. What is local is the feel — the kart (see kart.js), the pads, and the
// sparks off a drift.
import * as THREE from './three.module.js';
import { createKart, driveKart, boostKart, onRoad, placeOnGrid } from './kart.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (v) => (v > 0 ? `${(v / 1000).toFixed(2)}秒` : '—');
const th = (n) => ['', '1st', '2nd', '3rd'][n] || `${n}th`;

export function createRaceUI({ send, toast, isOnline, scene, player, rpg, onScreen = null }) {
  const state = {
    phase: 'off',       // off | grid | countdown | running | done
    course: null,
    laps: 3,
    lap: 1,
    place: 0,
    next: null,         // the checkpoint to drive to
    startsAt: 0,
    standings: [],
    box: null,          // the item question on screen
    boostUntil: 0,
    best: 0,
  };
  const kart = createKart();
  let hit = new Set();          // pads and boxes already taken this lap
  let mapAt = 0;                // seconds since the course map was last drawn
  let rivalGroup = null;
  let lightsTimer = 0;
  const rivalKarts = new Map();

  // ---- the screen ------------------------------------------------------------------
  //
  // A race is not the island with some numbers on top of it: from the lights to the flag
  // it is its own screen. Everything the island normally shows — the rail, the dock, the
  // quest list, the hotbar, the walking pad — is taken away by `body[data-race]` (see
  // race.css) and what is left is this: the corners a kart game puts things in, and the
  // controls under the thumbs of a child holding an iPad sideways.
  const screen = document.createElement('div');
  screen.id = 'race-screen';
  screen.hidden = true;
  screen.innerHTML = `<div id="race-hud" class="race-hud">
      <div class="race-corner race-tl">
        <div class="race-place"><b id="race-place">–</b><small id="race-of"></small></div>
        <div class="race-lap"><span>LAP</span><b id="race-lap">1/3</b></div>
      </div>
      <div class="race-corner race-tc">
        <div class="race-next"><small>つぎは</small><span id="race-next-word"></span><small id="race-next-ja"></small></div>
      </div>
      <div class="race-corner race-tr">
        <div id="race-slot" class="race-slot" data-state="empty"><span id="race-slot-face">📦</span></div>
        <canvas id="race-map" class="race-map" width="160" height="160" aria-label="コースの地図"></canvas>
        <ol id="race-board" class="race-board"></ol>
      </div>
      <div class="race-corner race-bl">
        <div class="race-steer">
          <button type="button" class="race-key" data-race-key="a" aria-label="ひだりへ">◀</button>
          <button type="button" class="race-key" data-race-key="d" aria-label="みぎへ">▶</button>
        </div>
      </div>
      <div class="race-corner race-bc">
        <div class="race-speed"><b id="race-speed">0</b><small>km/h</small></div>
        <p class="race-keys-hint">W アクセル · A / D ハンドル · スペース ドリフト</p>
      </div>
      <div class="race-corner race-br">
        <button type="button" class="race-key race-brake" data-race-key="s" aria-label="ブレーキ">▼</button>
        <button type="button" class="race-key race-drift" data-race-key=" " aria-label="ドリフト">ドリフト</button>
        <button type="button" class="race-key race-gas" data-race-key="w" aria-label="アクセル">▲</button>
      </div>
      <div id="race-boost" class="race-boost" hidden>DASH!</div>
    </div>
    <div id="race-lights" class="race-lights" hidden><i></i><i></i><i></i><i></i><i></i></div>
    <div id="race-flash" hidden></div>
    <div id="race-box" hidden>
      <div class="race-box-word"><span id="race-box-emoji"></span><b id="race-box-ja"></b></div>
      <div id="race-box-choices" class="race-box-choices"></div>
    </div>`;
  document.body.append(screen);
  const hud = $('#race-hud', screen);
  const flash = $('#race-flash', screen);
  const box = $('#race-box', screen);
  const lights = $('#race-lights', screen);
  const mapCanvas = $('#race-map', screen);

  // The thumbs. A kart game on a tablet cannot be played with a keyboard, and the walking
  // pad is the wrong shape for one: an accelerator is held, not tapped. These buttons hold
  // the same keys the keyboard does, so kart.js never learns there are two ways to drive.
  const touch = new Set();
  for (const b of screen.querySelectorAll('[data-race-key]')) {
    const key = b.dataset.raceKey;
    const down = (e) => { e.preventDefault(); touch.add(key); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch { /* not captured */ } };
    const up = () => { touch.delete(key); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.oncontextmenu = (e) => e.preventDefault();
  }

  const board = document.createElement('dialog');
  board.id = 'race-result';
  board.innerHTML = `<div class="quiz-head"><div><span class="eyebrow">RACE RESULT</span><h2 id="race-result-title">ゴール！</h2></div>
      <button type="button" id="race-result-close" aria-label="閉じる">×</button></div>
    <div id="race-result-body"></div>`;
  document.body.append(board);
  // Closing the board is how a child gets the island back: the race screen stays up
  // behind the result, so the last thing they see is still the race.
  const closeBoard = () => { try { board.close(); } catch { /* closed */ } showScreen(false); };
  $('#race-result-close', board).onclick = closeBoard;
  board.addEventListener('cancel', (e) => { e.preventDefault(); closeBoard(); });

  function showFlash(text, ms2 = 900, cls = '') {
    flash.className = cls;
    flash.textContent = text;
    flash.hidden = false;
    clearTimeout(showFlash.timer);
    showFlash.timer = setTimeout(() => { flash.hidden = true; }, ms2);
  }

  // The screen is on from the grid to the flag. `body[data-race]` is what takes the island
  // away — one attribute, so there is one place to look when something is still on screen
  // that should not be.
  function showScreen(on) {
    const was = !screen.hidden;
    screen.hidden = !on;
    if (on) document.body.dataset.race = state.phase;
    else delete document.body.dataset.race;
    // The world is told too, once: an island covered in signs written to be read from
    // thirty metres is a wall of text at eight.
    if (was !== !!on) onScreen?.(!!on);
  }

  function render() {
    const on = state.phase !== 'off';
    showScreen(on);
    if (!on || state.phase === 'done') return;
    $('#race-place', hud).textContent = state.place ? th(state.place) : '–';
    $('#race-of', hud).textContent = state.standings.length ? `/${state.standings.length}` : '';
    $('#race-lap', hud).textContent = `${Math.min(state.lap, state.laps)}/${state.laps}`;
    $('#race-next-word', hud).textContent = state.next?.word || '';
    $('#race-next-ja', hud).textContent = state.next?.ja || '';
    $('#race-board', hud).innerHTML = state.standings.slice(0, 6).map((r) => (
      `<li class="${r.kind === 'child' ? 'me' : ''}"><b>${r.place}</b>${esc(r.name)}</li>`
    )).join('');
    drawMap();
  }

  // The course, from above, with everyone on it. The same gate list the server judges laps
  // by, so the map cannot drift away from the race it is a map of.
  function drawMap() {
    const ctx = mapCanvas?.getContext?.('2d');
    const gates = state.course?.gates || [];
    if (!ctx || gates.length < 3) return;
    const w = mapCanvas.width;
    const pad = 16;
    const xs = gates.map((g) => g.x);
    const zs = gates.map((g) => g.z);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const at = (x, z) => [pad + ((x - minX) / span) * (w - pad * 2), pad + ((z - minZ) / span) * (w - pad * 2)];
    ctx.clearRect(0, 0, w, w);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b201dcc';
    ctx.lineWidth = 13;
    ctx.beginPath();
    gates.forEach((g, i) => { const [px, py] = at(g.x, g.z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#f3efe144';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const row of state.standings) {
      const p = rivalAt(row.progress);
      if (!p) continue;
      const [px, py] = at(p.x, p.z);
      ctx.fillStyle = row.kind === 'child' ? '#8fe0b4' : '#ffb877';
      ctx.beginPath();
      ctx.arc(px, py, row.kind === 'child' ? 5 : 4, 0, 7);
      ctx.fill();
    }
    // The child's own kart is drawn from where it actually is, not from the standings: the
    // standings arrive four times a second and this is the dot they are looking for.
    const island = state.course?.island;
    if (island && player) {
      const [px, py] = at(player.position.x - island.x, player.position.z - island.z);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#12302c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ---- the rivals, drawn from the standings ------------------------------------------
  //
  // A rival is a number from the server: how many checkpoints it has passed. The kart is
  // put at that point on the road and slid along it, so what a child sees ahead of them is
  // exactly what the running order says.
  function rivalAt(progress) {
    const gates = state.course?.gates || [];
    if (!gates.length) return null;
    const step = Math.max(0, progress) % gates.length;
    const i = Math.floor(step);
    const a = gates[i % gates.length];
    const b = gates[(i + 1) % gates.length];
    const t = step - i;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, r: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  function ensureRivals() {
    if (!scene) return;
    if (!rivalGroup) { rivalGroup = new THREE.Group(); scene.add(rivalGroup); }
    for (const row of state.standings) {
      if (row.kind !== 'rival') continue;
      if (rivalKarts.has(row.id)) continue;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.4), new THREE.MeshStandardMaterial({ color: row.colour || 0xdd6f5c }));
      body.position.y = 0.65;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0xf3efe1 }));
      seat.position.set(0, 1.2, -0.2);
      for (const [wx, wz] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
        const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x2f2b26 }));
        wheel.position.set(wx, 0.4, wz);
        g.add(wheel);
      }
      g.add(body, seat);
      rivalGroup.add(g);
      rivalKarts.set(row.id, g);
    }
    for (const [id, g] of rivalKarts) {
      if (state.standings.some((r) => r.id === id)) continue;
      rivalGroup.remove(g);
      rivalKarts.delete(id);
    }
  }

  function moveRivals(dt) {
    const island = state.course?.island;
    if (!island) return;
    for (const row of state.standings) {
      const g = rivalKarts.get(row.id);
      if (!g) continue;
      const at = rivalAt(row.progress);
      if (!at) continue;
      const wx = island.x + at.x;
      const wz = island.z + at.z;
      // Eased rather than snapped: the standings arrive four times a second and a kart
      // that teleported every 250ms would look like a bug rather than a rival.
      const k = Math.min(1, dt * 4);
      g.position.x += (wx - g.position.x) * (g.position.lengthSq() ? k : 1);
      g.position.z += (wz - g.position.z) * (g.position.lengthSq() ? k : 1);
      g.rotation.y = at.r;
      g.visible = state.phase === 'running' || state.phase === 'countdown';
    }
  }

  // ---- driving ------------------------------------------------------------------------

  const driving = () => state.phase === 'countdown' || state.phase === 'running';

  // Called from the game's own frame, in place of the walking code. The keys are the
  // game's own Set plus whatever the thumbs are holding down — kart.js is given one Set
  // and never learns which buttons a child is using.
  function drive(dt, keys, blocked, speed) {
    const now = performance.now();
    const island = state.course?.island;
    if (!island) return;
    const lx = player.position.x - island.x;
    const lz = player.position.z - island.z;
    kart.onRoad = onRoad(state.course, lx, lz);
    const locked = state.phase !== 'running' || !!state.box;
    const held = touch.size ? new Set([...keys, ...touch]) : keys;
    driveKart(kart, { dt, keys: held, player, blocked, course: state.course, speed, now, locked });
    // km/h is a lie a racing game tells: the kart moves in metres a second, and 0–15.5 of
    // those reads as a speed a child recognises when it is multiplied up.
    $('#race-speed', hud).textContent = String(Math.round(Math.abs(kart.speed) * 13));
    hud.dataset.boost = now < kart.boostUntil ? '1' : '';
    if (state.phase !== 'running') return;

    const here = { x: player.position.x - island.x, z: player.position.z - island.z };
    // The checkpoint the server is waiting for. Claiming it is all the page does; whether
    // it counted comes back.
    const want = state.next;
    const reach = state.course.reach || 4.5;
    // A checkpoint stays claimed only while the kart is on top of it. Driving away and
    // coming back has to be able to claim it again: the server refuses a lap driven
    // faster than the circuit allows and leaves the kart on the line, and without this
    // the page would have decided it had already crossed and the race would quietly
    // stop counting.
    for (const g of state.course.gates || []) {
      if (Math.hypot(here.x - g.x, here.z - g.z) > reach * 1.6) hit.delete(`gate:${g.id}`);
    }
    if (want && Math.hypot(here.x - want.x, here.z - want.z) < reach) {
      if (!hit.has(`gate:${want.id}`)) { hit.add(`gate:${want.id}`); send('race:gate', { id: want.id }); }
    }
    // The pads and the boxes: local for the feel, and the box's question comes back.
    (state.course.boosts || []).forEach((pad, i) => {
      if (Math.hypot(here.x - pad.x, here.z - pad.z) > 2.6) { hit.delete(`pad:${i}`); return; }
      if (hit.has(`pad:${i}`)) return;
      hit.add(`pad:${i}`);
      boostKart(kart, 'pad', now);
      showFlash('BOOST!', 700, 'race-boost-flash');
    });
    (state.course.items || []).forEach((it, i) => {
      if (Math.hypot(here.x - it.x, here.z - it.z) > 2.6) { hit.delete(`item:${i}`); return; }
      if (hit.has(`item:${i}`) || state.box) return;
      hit.add(`item:${i}`);
      send('race:item', { at: i });
    });
    $('#race-boost', hud).hidden = now >= kart.boostUntil;
    hud.dataset.drift = kart.sparks ? String(kart.sparks) : '';
  }

  function askBox(m) {
    state.box = m;
    const slot = $('#race-slot', hud);
    slot.dataset.state = 'ask';
    $('#race-slot-face', hud).textContent = m.emoji || '📦';
    $('#race-box-emoji', box).textContent = m.emoji || '📦';
    $('#race-box-ja', box).textContent = m.ja || '';
    $('#race-box-choices', box).innerHTML = (m.choices || []).map((c) => `<button type="button" data-pick="${esc(c)}">${esc(c)}</button>`).join('');
    box.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => answerBox(b.dataset.pick); });
    box.hidden = false;
    // A race does not wait: an unanswered box closes itself and the kart drives on.
    clearTimeout(askBox.timer);
    askBox.timer = setTimeout(() => answerBox(''), m.ms || 6000);
  }

  function answerBox(pick) {
    if (!state.box) return;
    clearTimeout(askBox.timer);
    state.box = null;
    box.hidden = true;
    $('#race-slot', hud).dataset.state = 'empty';
    $('#race-slot-face', hud).textContent = '📦';
    send('race:item', { pick });
  }

  function reset() {
    state.phase = 'off';
    state.course = null;
    state.standings = [];
    state.place = 0;
    state.lap = 1;
    state.next = null;
    state.box = null;
    hit = new Set();
    box.hidden = true;
    flash.hidden = true;
    lights.hidden = true;
    touch.clear();
    for (const b of screen.querySelectorAll('[data-race-key]')) b.classList.remove('on');
    showScreen(false);
    for (const [, g] of rivalKarts) g.visible = false;
  }

  return {
    state,
    kart,
    get driving() { return driving(); },
    drive,
    // The rivals and the sparks, from the game's frame.
    update(dt) {
      if (!driving()) return;
      moveRivals(dt);
      // The map is redrawn about ten times a second rather than every frame: the dot has
      // to keep up with the kart, and nothing else on it moves faster than the standings.
      mapAt += dt;
      if (mapAt > 0.1) { mapAt = 0; drawMap(); }
    },
    // The camera, for as long as the race owns the screen. A kart game is played from
    // behind the kart: the island's own orbit camera is looking at a child from across the
    // field, which is fine for walking and useless at 20 metres a second. It sits back and
    // low, leans with the drift, and pulls back when a boost is running, which is the only
    // way a screen can say "faster" without a number.
    chase(cam, dt) {
      const back = 8.4 + Math.min(4.2, Math.abs(kart.speed) * 0.22) + (performance.now() < kart.boostUntil ? 2.2 : 0);
      const lean = kart.slip * 2.6;
      const dir = kart.heading + lean;
      const want = {
        x: player.position.x - Math.sin(dir) * back,
        y: 3.9 + Math.min(1.2, Math.abs(kart.speed) * 0.05),
        z: player.position.z - Math.cos(dir) * back,
      };
      // Eased, and harder when the kart is slow: a kart spun round on the spot should not
      // drag the camera round with it a frame later.
      const k = 1 - Math.exp(-dt * (6 + Math.abs(kart.speed) * 0.25));
      cam.position.x += (want.x - cam.position.x) * k;
      cam.position.y += (want.y - cam.position.y) * k;
      cam.position.z += (want.z - cam.position.z) * k;
      cam.lookAt(
        player.position.x + Math.sin(kart.heading) * 7,
        player.position.y + 1.5,
        player.position.z + Math.cos(kart.heading) * 7,
      );
    },
    join() {
      if (!isOnline()) { toast('レースは オンラインで はしれます。'); return; }
      send('race:join', {});
    },
    quit() { send('race:leave', {}); reset(); },
    // ---- what the server says
    onGrid(m) {
      state.course = { gates: m.gates, road: m.road, reach: m.reach, boosts: m.boosts, items: m.items, island: m.island };
      state.laps = m.laps;
      state.lap = 1;
      state.phase = 'grid';
      state.standings = m.standings || [];
      state.next = m.gates[0];
      hit = new Set();
      placeOnGrid(kart, player, m.island, m.you?.grid);
      rpg?.holdDoors?.(true);
      ensureRivals();
      render();
      showFlash(`グリッド ${m.you?.place || 1}番手 · ${Math.ceil((m.opensIn || 0) / 1000)}秒で スタート`, 2200);
    },
    onField(m) {
      state.standings = m.standings || [];
      const me = state.standings.find((r) => r.kind === 'child' && r.id === m.you) || state.standings.find((r) => r.kind === 'child');
      if (me) state.place = me.place;
      // A child who has already taken the flag stays finished. The room keeps saying the
      // race is running once a second — it is, for everyone still out there — and without
      // this the result board would be shoved aside and the HUD would come back.
      if (m.phase === 'running' && (state.phase === 'grid' || state.phase === 'countdown')) state.phase = 'running';
      ensureRivals();
      render();
    },
    onLights(m) {
      state.phase = 'countdown';
      state.startsAt = m.startsAt;
      state.standings = m.standings || state.standings;
      render();
      // Five lamps, one a second, and the race starts when they go out — the thing every
      // child already knows the meaning of, in place of a number counting down.
      let n = 3;
      let lit = 0;
      lights.hidden = false;
      lights.dataset.lit = '0';
      showFlash('3', 900, 'race-count');
      clearInterval(lightsTimer);
      lightsTimer = setInterval(() => {
        n -= 1;
        lit = Math.min(5, lit + 2);
        lights.dataset.lit = String(lit);
        if (n <= 0) { clearInterval(lightsTimer); return; }
        showFlash(String(n), 900, 'race-count');
      }, 1000);
    },
    onGo(m) {
      state.phase = 'running';
      state.standings = m.standings || state.standings;
      clearInterval(lightsTimer);
      lights.dataset.lit = '5';
      setTimeout(() => { lights.hidden = true; }, 700);
      showFlash('GO!', 1100, 'race-go');
      render();
    },
    onGate(m) {
      state.lap = m.lap || state.lap;
      const gates = state.course?.gates || [];
      state.next = gates.find((g) => g.id === m.next) || null;
      if (m.lapDone) {
        hit = new Set();
        showFlash(`LAP ${Math.min(m.completed || m.lap, state.laps)}/${state.laps} · ${ms(m.lapMs)}`, 1400, 'race-lap-flash');
      }
      render();
    },
    onBox(m) { askBox(m); },
    onBoost(m) {
      if (m.ok) { boostKart(kart, 'item', performance.now()); showFlash('DASH!', 900, 'race-boost-flash'); }
      else showFlash(`${m.answer} だったよ`, 1200, 'race-miss');
    },
    onFinished(m) {
      state.phase = 'done';
      state.place = m.place;
      rpg?.holdDoors?.(false);
      const rows = (m.standings || []).map((r) => `<li class="${r.kind === 'child' ? 'me' : ''}"><b>${r.place}</b><span>${esc(r.name)}</span><small>${r.kind === 'rival' ? 'ライバル' : ''}</small></li>`).join('');
      $('#race-result-title', board).textContent = m.place ? `${th(m.place)}！` : 'おつかれさま！';
      $('#race-result-body', board).innerHTML = `<p class="race-result-line">
          ${m.place ? `<b>${th(m.place)}</b>` : '<b>完走ならず</b>'}
          <span>ベストラップ ${ms(m.best)}</span></p>
        <p class="race-result-prize">◈ +${m.coins || 0}　✧ +${m.xp || 0} XP${m.capped ? '（今日のコインは 上限です）' : ''}</p>
        <p class="race-result-prize">📦 アイテム ${m.items || 0}回 せいかい</p>
        <ol class="race-result-board">${rows}</ol>
        <p class="race-fine">もう一度 はしるなら スタートラインで E。</p>`;
      render();
      if (!board.open) board.showModal();
    },
    onOver() { state.phase = 'done'; showScreen(false); rpg?.holdDoors?.(false); },
    onClosed(m) {
      if (state.phase !== 'off') toast(m?.reason === 'left the island' ? 'レースから ぬけました。' : 'レースを やめました。');
      reset();
    },
    onError(m) {
      const said = {
        'too far': 'スタートラインで レースに でられます。',
        'on foot': 'のりものに のってから。',
        'race running': 'いまは レース中。つぎの レースを まってね。',
        'grid full': 'グリッドが いっぱいです。',
        'too fast': 'はやすぎ！ ちゃんと 1しゅう しよう。',
      }[m?.reason];
      if (said) toast(said);
      // A checkpoint claimed too early simply waits; the HUD already says which one.
      if (m?.reason === 'not next' && m.want) {
        const gates = state.course?.gates || [];
        state.next = gates.find((g) => g.id === m.want) || state.next;
        render();
      }
    },
    hud,
  };
}
