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

export function createRaceUI({ send, toast, isOnline, scene, player, rpg }) {
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
  let rivalGroup = null;
  let lightsTimer = 0;
  const rivalKarts = new Map();

  // ---- the screen ------------------------------------------------------------------

  const hud = document.createElement('div');
  hud.id = 'race-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="race-place"><b id="race-place">–</b><small id="race-of"></small></div>
    <div class="race-lap"><span>LAP</span><b id="race-lap">1/3</b></div>
    <div class="race-next"><span id="race-next-word"></span><small id="race-next-ja"></small></div>
    <ol id="race-board" class="race-board"></ol>
    <div id="race-boost" class="race-boost" hidden>DASH!</div>`;
  document.body.append(hud);

  const flash = document.createElement('div');
  flash.id = 'race-flash';
  flash.hidden = true;
  document.body.append(flash);

  const box = document.createElement('div');
  box.id = 'race-box';
  box.hidden = true;
  box.innerHTML = `<div class="race-box-word"><span id="race-box-emoji"></span><b id="race-box-ja"></b></div>
    <div id="race-box-choices" class="race-box-choices"></div>`;
  document.body.append(box);

  const board = document.createElement('dialog');
  board.id = 'race-result';
  board.innerHTML = `<div class="quiz-head"><div><span class="eyebrow">RACE RESULT</span><h2 id="race-result-title">ゴール！</h2></div>
      <button type="button" id="race-result-close" aria-label="閉じる">×</button></div>
    <div id="race-result-body"></div>`;
  document.body.append(board);
  $('#race-result-close', board).onclick = () => { try { board.close(); } catch { /* closed */ } };
  board.addEventListener('cancel', (e) => { e.preventDefault(); try { board.close(); } catch { /* closed */ } });

  function showFlash(text, ms2 = 900, cls = '') {
    flash.className = cls;
    flash.textContent = text;
    flash.hidden = false;
    clearTimeout(showFlash.timer);
    showFlash.timer = setTimeout(() => { flash.hidden = true; }, ms2);
  }

  function render() {
    hud.hidden = state.phase === 'off';
    if (hud.hidden) return;
    $('#race-place', hud).textContent = state.place ? th(state.place) : '–';
    $('#race-of', hud).textContent = state.standings.length ? `/${state.standings.length}` : '';
    $('#race-lap', hud).textContent = `${Math.min(state.lap, state.laps)}/${state.laps}`;
    $('#race-next-word', hud).textContent = state.next?.word || '';
    $('#race-next-ja', hud).textContent = state.next?.ja || '';
    $('#race-board', hud).innerHTML = state.standings.slice(0, 6).map((r) => (
      `<li class="${r.kind === 'child' ? 'me' : ''}"><b>${r.place}</b>${esc(r.name)}</li>`
    )).join('');
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

  // Called from the game's own frame, in place of the walking code.
  function drive(dt, keys, blocked, speed) {
    const now = performance.now();
    const island = state.course?.island;
    if (!island) return;
    const lx = player.position.x - island.x;
    const lz = player.position.z - island.z;
    kart.onRoad = onRoad(state.course, lx, lz);
    const locked = state.phase !== 'running' || !!state.box;
    driveKart(kart, { dt, keys, player, blocked, course: state.course, speed, now, locked });
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
    hud.hidden = true;
    for (const [, g] of rivalKarts) g.visible = false;
  }

  return {
    state,
    kart,
    get driving() { return driving(); },
    drive,
    // The rivals and the sparks, from the game's frame.
    update(dt) { if (driving()) moveRivals(dt); },
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
      let n = 3;
      showFlash('3', 900, 'race-count');
      clearInterval(lightsTimer);
      lightsTimer = setInterval(() => {
        n -= 1;
        if (n <= 0) { clearInterval(lightsTimer); return; }
        showFlash(String(n), 900, 'race-count');
      }, 1000);
    },
    onGo(m) {
      state.phase = 'running';
      state.standings = m.standings || state.standings;
      clearInterval(lightsTimer);
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
      if (!board.open) board.showModal();
      hud.hidden = true;
      render();
    },
    onOver() { state.phase = 'done'; hud.hidden = true; rpg?.holdDoors?.(false); },
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
