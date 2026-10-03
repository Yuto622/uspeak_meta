// おはなし — the call that is a room.
//
// There is no room list, no invitation and no hang-up button: the building a child walked
// into is the call they are in, everyone inside it hears everyone else, and walking out
// ends it. That is the same rule as everything else on these islands, and the only one a
// seven-year-old has to learn.
//
// The voices go browser to browser (WebRTC). The server is only the introduction service
// — it decides who may be introduced to whom (same class, same room, a teacher having
// opened it) and passes the offers along; it never carries or records the audio.
//
// Two things gate a microphone: the teacher opening 通話 for the class, and the child
// tapping to allow it. Both, every time.
//
// 2026-10: the classroom said the call was noisy, small, and stuck in its corner. So:
//   * the microphone is cleaned before it is sent (browser AEC/NS/AGC, then a high-pass,
//     a soft gate that closes between words, and a gentle compressor — `cleanMic()`),
//     and the island's music ducks while a call is open (hooks 'call' → ambience);
//   * the panel has a full-screen layout (⛶) with a Meet-style grid, a tile a child can
//     tap to pin, a talking outline, and a leave button; and in its corner form it can be
//     dragged by its head and resized by its grip, the box remembered;
//   * the room may hand the page TURN relays (`ice` on voice:room) for school networks.
import { hooks } from './net-hooks.js';
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// おはなし島 is the one island that is itself a room: standing on its grass is being in
// the call with everyone else on it. Everywhere else, a room is one you walked into —
// in:<island>:<building> — because a child's own マイルーム and their building lot are
// theirs alone, and an island is not a call.
export const TALK_ISLAND = 'talk';
export const isTalkSpace = (space) => space === TALK_ISLAND || String(space || '').startsWith(`in:${TALK_ISLAND}:`);
export const isCallRoom = (space) => space === TALK_ISLAND || /^in:[^:]+:[^:]+$/.test(String(space || ''));

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
// Big enough to read a face on a full screen; the bitrate (tuneSenders) is what keeps a
// classroom Wi-Fi alive, not the frame size.
const CAMERA = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } };
// Everything the browser itself can do against noise, asked for up front. Unknown keys
// (voiceIsolation on an older browser) are ignored, not refused. One channel: a stereo
// microphone doubles the bytes and halves nothing.
const MIC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: true, channelCount: 1, sampleRate: 48000 };
// The gate between words. RMS of the band-passed signal: open above OPEN at once, close
// after QUIET ms below CLOSE. Closed is not silent (FLOOR) — a hard cut sounds broken, a
// soft one just sounds like a quiet room.
const GATE = { OPEN: 0.015, CLOSE: 0.007, QUIET: 450, FLOOR: 0.08, ATTACK: 0.012, RELEASE: 0.22, TICK: 40 };
// What a video sender may spend, by how many are in the room: the mesh sends one copy
// per peer, so six faces at 900 kbps would be five megabits up from one iPad.
const VIDEO_KBPS = (peers) => (peers <= 2 ? 900 : peers <= 4 ? 500 : 300);
const RETRY_MS = 12000;  // how long a connection may stay unconnected before it is tried again
// A shared screen is read, not watched: small and slow keeps a classroom of iPads on one
// Wi-Fi, and a worksheet does not move.
const SCREEN = { frameRate: { ideal: 6, max: 12 }, width: { max: 1280 }, height: { max: 800 } };
const LOG_MAX = 12;      // how many written messages the panel keeps
const NAMES_MAX = 11;    // names shown in a big room before the rest become a number

export function createVoice({ send, toast, roomLabel = () => '', onGoToHall = null }) {
  const state = {
    mode: 'all',        // 'all' どの島の どの部屋でも（既定）/ 'rooms' おはなし島だけ / 'off' 止まっている
    busyCamera: false,  // one camera switch at a time, or two taps race each other
    space: '',          // where the child is standing
    room: '',           // the call they are in, if any
    me: '',
    joined: false,
    muted: false,
    camera: false,
    screen: false,      // 画面共有: this child is showing their screen to the room
    busyScreen: false,
    kind: 'mesh',       // 'mesh' = browser to browser (six) / 'sfu' = 大広間 (a hundred)
    max: 6,             // what this room holds, as the server counts it
    can: { camera: true, screen: true },   // what this child may publish here
    stageOpen: false,   // this server has an SFU behind it, so a hall can hold a hundred
    heads: 0,           // how many are in a big room (the SFU counts, not us)
    log: [],            // the last few written messages in this room
    available: false,   // online at all: the rail button hides itself offline
    saying: false,      // the phrase list is open
    free: true,         // whether the class may type its own words (the teacher's switch)
    peers: new Map(),   // sessionId -> { id, name, role, pc, stream, polite, making, ignoring, level, el }
    size: 'm',          // how big the panel (and so the faces) are drawn
    full: false,        // the whole screen, Meet-style
    pinned: '',         // the tile a child tapped to make big ('' = the grid)
    clean: true,        // the microphone goes through cleanMic() before it is sent
    ice: null,          // relays the room handed us (TURN), or null for the public STUN
    error: '',
  };
  let local = null;         // MediaStream: the microphone (as sent), and the camera if it is on
  let rawMic = null;        // MediaStream: the microphone as the browser gave it
  let gate = null;          // the cleaning chain over rawMic, when state.clean
  let shared = null;        // MediaStream: the shared screen, kept apart from the face
  let meter = null;         // { ctx, nodes: Map(id -> analyser) }
  let levelTimer = 0;
  let phrases = null;       // phrases.json, fetched the first time a child writes
  let phrasesById = new Map();
  let stage = null;         // the 大広間 client, built the first time one is walked into
  let ticket = null;        // the last ticket the server minted for this child

  // ---- the panel ------------------------------------------------------------------------

  const panel = document.createElement('aside');
  panel.id = 'voice-panel';
  panel.hidden = true;
  // The order here is the full-screen order (faces, then the side column, then the bar
  // of buttons at the bottom); in the corner the CSS `order`s the same pieces the way
  // they always were.
  panel.innerHTML = `<div class="voice-head"><b id="voice-room"></b><small id="voice-count"></small>
      <button type="button" id="voice-size" class="voice-size" title="がめんの 大きさ">⤢ 中</button>
      <button type="button" id="voice-full" class="voice-size" title="ぜんがめん" hidden>⛶ ぜんがめん</button></div>
    <div id="voice-tiles" class="voice-tiles" hidden></div>
    <div class="voice-side">
      <div id="voice-people" class="voice-people"></div>
      <ol id="voice-log" class="voice-log" aria-live="polite" hidden></ol>
      <div class="voice-say">
        <button type="button" id="voice-say-open">💬 フレーズ</button>
      </div>
      <form id="voice-write" class="voice-write" autocomplete="off">
        <input id="voice-text" type="text" maxlength="120" placeholder="この へやの みんなに かく" aria-label="この部屋にメッセージを書く">
        <button type="submit">おくる</button>
      </form>
      <div id="voice-phrases" class="voice-phrases" hidden></div>
      <p id="voice-note" class="voice-note"></p>
    </div>
    <div class="voice-acts">
      <button type="button" id="voice-join" class="primary">🎙 おはなしに はいる</button>
      <button type="button" id="voice-mute" hidden>マイク</button>
      <button type="button" id="voice-cam" hidden>カメラ</button>
      <button type="button" id="voice-share" hidden>がめん</button>
      <button type="button" id="voice-clean" hidden>ノイズカット</button>
      <button type="button" id="voice-leave" class="leave" hidden>🚪 おわる</button>
    </div>
    <i class="voice-grip" aria-hidden="true"></i>`;
  document.body.append(panel);

  // ---- the button on the rail --------------------------------------------------------
  //
  // The panel appears by itself in a room, which is right — a call is a place, not a menu.
  // But a child who wants to see their friends has to know where to go, and on the rail is
  // where this game puts "the thing you can do from here". So: one button, always in the
  // same spot, that does the obvious thing wherever it is pressed — join with the camera
  // on, turn the camera off again, or take you to おはなし島 when there is nobody to call
  // where you are standing.
  const railButton = document.createElement('button');
  railButton.type = 'button';
  railButton.id = 'voice-button';
  railButton.className = 'voice-button';
  railButton.hidden = true;
  railButton.innerHTML = '<span id="voice-button-label" class="en">📹 Video call</span><small id="voice-button-note" class="ja"></small>';
  (document.querySelector('.right-rail') || document.body).append(railButton);

  const audio = document.createElement('div');
  audio.id = 'voice-audio';
  audio.hidden = true;
  document.body.append(audio);

  $('#voice-join', panel).onclick = () => join();
  $('#voice-mute', panel).onclick = () => setMuted(!state.muted);
  $('#voice-cam', panel).onclick = () => setCamera(!state.camera);
  $('#voice-share', panel).onclick = () => setScreen(!state.screen);
  $('#voice-clean', panel).onclick = () => setClean(!state.clean);
  $('#voice-leave', panel).onclick = () => leave();
  $('#voice-full', panel).onclick = () => setFull(!state.full);
  $('#voice-say-open', panel).onclick = () => openSay(!state.saying);
  // One button, three obvious things.
  railButton.onclick = async () => {
    if (state.joined) { setCamera(!state.camera); return; }
    if (openHere()) {
      await join();
      // A video call, since that is what the button says: the camera goes on with the
      // microphone. In a hall where only the teacher and the stage may show a picture,
      // join() succeeds and this quietly does not — the panel says why.
      if (state.joined) await setCamera(true);
      return;
    }
    // A teacher can stop every call in the class. Flying somewhere to find that out again
    // is not an answer, so say it here instead.
    if (state.mode === 'off') { toast('いまは 先生が おはなしを とめています。'); return; }
    // Nobody to call from a beach. おはなし島 is where a class meets, so go there — but
    // only claim the journey if it actually began (a flight already in the air, an open
    // dialog, or a lesson in progress all refuse it).
    if (onGoToHall?.()) toast('おはなし島に とびます。');
    else toast('いまは とべません。もういちど ためしてね。');
  };
  $('#voice-write', panel).addEventListener('submit', (e) => { e.preventDefault(); write(); });
  // WASD belongs to the world, except inside this box.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    $('#voice-text', panel).addEventListener(type, (e) => e.stopPropagation());
  }
  // An on-screen keyboard covers the bottom of the page, which is where this box is.
  $('#voice-text', panel).addEventListener('focus', () => setTimeout(() => $('#voice-text', panel).scrollIntoView({ block: 'nearest' }), 250));

  // ---- how big the faces are -------------------------------------------------------------
  //
  // An iPad held by one child wants the faces big; the same panel on a shared screen next
  // to the game wants them out of the way. Rather than a slider a seven-year-old has to
  // aim at, the button simply steps 小 → 中 → 大 → 特大 → 小, and the choice is remembered
  // so it is not re-chosen at every lesson. The widths are min(px, vw), so 特大 on a phone
  // is still a phone-sized panel.
  const SIZES = [
    { id: 's', label: '小' },
    { id: 'm', label: '中' },
    { id: 'l', label: '大' },
    { id: 'xl', label: '特大' },
  ];
  const SIZE_KEY = 'uspeak-voice-size-v1';
  const readSize = () => { try { return localStorage.getItem(SIZE_KEY) || ''; } catch { return ''; } };

  function setSize(id) {
    const size = SIZES.find((s) => s.id === id) || SIZES[1];
    state.size = size.id;
    panel.dataset.size = size.id;
    const btn = $('#voice-size', panel);
    btn.textContent = `⤢ ${size.label}`;
    btn.setAttribute('aria-label', `がめんの 大きさ ${size.label}`);
    // Private browsing throws on write; the size then simply lasts the lesson.
    try { localStorage.setItem(SIZE_KEY, size.id); } catch { /* not worth a word to the child */ }
  }

  $('#voice-size', panel).onclick = () => {
    const at = SIZES.findIndex((s) => s.id === state.size);
    setSize(SIZES[(at + 1) % SIZES.length].id);
    // A preset is a fresh start: the dragged-out width goes, the position stays.
    panel.style.width = ''; panel.style.maxHeight = '';
    saveBox();
  };
  setSize(readSize() || 'm');

  // ---- the whole screen ------------------------------------------------------------------
  //
  // ⛶ turns the corner panel into the screen: a grid of faces that fills it, the written
  // side on the right, the buttons along the bottom — the shape every video call a child
  // has seen has. Where the browser allows it the panel also goes properly full screen
  // (no address bar); iPad Safari does not, and there the layout alone is the answer.
  // While it is up the island does not take the WASD keys (game.js looks at body[data-call])
  // — a child who taps a key mid-call must not walk out of the room and hang up on it.
  function setFull(on) {
    const next = !!on && state.joined;
    if (state.full === next) return;
    state.full = next;
    panel.dataset.full = next ? '1' : '';
    document.body.dataset.call = next ? 'full' : '';
    if (next) { panel.requestFullscreen?.().catch?.(() => { /* a layout is enough */ }); }
    else if (document.fullscreenElement === panel) { document.exitFullscreen?.().catch?.(() => {}); }
    render();
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.full) setFull(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.full) setFull(false); });

  // ---- drag it, stretch it -----------------------------------------------------------------
  //
  // The head is a handle and the corner is a grip, the way every window a grown-up has
  // used works; the box a child made is kept for next time. Buttons in the head are still
  // buttons. In full screen there is nothing to drag.
  const BOX_KEY = 'uspeak-voice-box-v1';
  const readBox = () => { try { return JSON.parse(localStorage.getItem(BOX_KEY) || 'null'); } catch { return null; } };
  const saveBox = () => {
    const box = { x: panel.style.left ? parseFloat(panel.style.left) : null, y: panel.style.top ? parseFloat(panel.style.top) : null,
      w: panel.style.width ? parseFloat(panel.style.width) : null, h: panel.style.maxHeight ? parseFloat(panel.style.maxHeight) : null };
    try { localStorage.setItem(BOX_KEY, JSON.stringify(box)); } catch { /* the box lasts the lesson */ }
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function applyBox(box) {
    if (!box) return;
    if (box.w) panel.style.width = `${clamp(box.w, 160, innerWidth - 20)}px`;
    if (box.h) panel.style.maxHeight = `${clamp(box.h, 150, innerHeight - 20)}px`;
    if (box.x != null && box.y != null) {
      panel.style.left = `${clamp(box.x, 0, innerWidth - 120)}px`;
      panel.style.top = `${clamp(box.y, 0, innerHeight - 80)}px`;
      panel.style.bottom = 'auto';
    }
  }
  function grab(handle, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      if (state.full || e.target.closest('button, input, a')) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, rect: panel.getBoundingClientRect() };
      const move = (ev) => onMove(ev.clientX - start.x, ev.clientY - start.y, start.rect);
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); saveBox(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }
  grab($('.voice-head', panel), (dx, dy, rect) => {
    panel.style.left = `${clamp(rect.left + dx, 0, innerWidth - rect.width)}px`;
    panel.style.top = `${clamp(rect.top + dy, 0, innerHeight - 60)}px`;
    panel.style.bottom = 'auto';
  });
  grab($('.voice-grip', panel), (dx, dy, rect) => {
    panel.style.width = `${clamp(rect.width + dx, 160, innerWidth - rect.left - 8)}px`;
    panel.style.maxHeight = `${clamp(rect.height + dy, 150, innerHeight - rect.top - 8)}px`;
  });
  applyBox(readBox());
  addEventListener('resize', () => applyBox(readBox()));

  // The noise gate is on unless a child (or a teacher) turned it off: a singing lesson, say,
  // where the quiet tail of a note is the point.
  const CLEAN_KEY = 'uspeak-voice-clean-v1';
  try { state.clean = localStorage.getItem(CLEAN_KEY) !== 'off'; } catch { /* on */ }

  // A face, with the name on it. One per camera that is on — the child's own included,
  // mirrored, because a picture of yourself that moves the wrong way is unsettling.
  function tileFor(key, name, stream, mine = false, wide = false) {
    const tiles = $('#voice-tiles', panel);
    let box = tiles.querySelector(`[data-tile="${CSS.escape(key)}"]`);
    if (!box) {
      box = document.createElement('div');
      // A shared screen is not a face: it is wide, it is not mirrored, and it takes the
      // whole width of the panel, because the point of it is that it can be read.
      box.className = `voice-tile ${wide ? 'screen' : mine ? 'mine' : ''}`;
      box.dataset.tile = key;
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;             // the sound comes through the audio element, once
      const label = document.createElement('small');
      box.append(video, label);
      // A shared screen goes to the top — it is what everyone is looking at. Then the
      // child's own face, then everyone else in the order they arrived.
      if (wide || mine) tiles.prepend(box); else tiles.append(box);
      // Tap a face to make it the big one; tap it again for the grid.
      box.onclick = () => { state.pinned = state.pinned === key ? '' : key; render(); };
    }
    box.querySelector('small').textContent = name;
    const video = box.querySelector('video');
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play?.().catch(() => { /* the join tap was the gesture iOS wanted */ });
    tiles.hidden = false;
    return box;
  }

  function dropTile(key) {
    const tiles = $('#voice-tiles', panel);
    tiles.querySelector(`[data-tile="${CSS.escape(key)}"]`)?.remove();
    tiles.hidden = !tiles.children.length;
  }

  // Cameras come and go while a call is running, so the grid is rebuilt from what is
  // actually arriving rather than from what was asked for.
  const showing = (stream) => !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);

  function renderTiles() {
    const tiles = $('#voice-tiles', panel);
    if (!state.joined) { tiles.innerHTML = ''; tiles.hidden = true; tiles.dataset.pin = ''; return; }
    if (state.screen && showing(shared)) tileFor('me:screen', 'じぶんの がめん', shared, false, true);
    else dropTile('me:screen');
    if (state.camera && local?.getVideoTracks().length) tileFor('me', 'じぶん', local, true).classList.toggle('talking', !state.muted && state.level > 0.06);
    else dropTile('me');
    for (const peer of state.peers.values()) {
      if (showing(peer.screen)) tileFor(`${peer.id}:screen`, `${peer.name || '…'}の がめん`, peer.screen, false, true);
      else dropTile(`${peer.id}:screen`);
      if (showing(peer.stream)) tileFor(peer.id, peer.name || '…', peer.stream).classList.toggle('talking', peer.level > 0.06);
      else dropTile(peer.id);
    }
    // The pin holds only while that face is still there.
    const pinned = state.pinned && tiles.querySelector(`[data-tile="${CSS.escape(state.pinned)}"]`);
    if (state.pinned && !pinned) state.pinned = '';
    for (const box of tiles.children) box.classList.toggle('pinned', box === pinned);
    tiles.dataset.pin = pinned ? '1' : '';
    // How many across, on the full screen: one face fills it, four are a 2×2, nine a 3×3.
    const n = tiles.children.length;
    tiles.style.setProperty('--cols', String(n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4));
    tiles.hidden = !n;
  }

  // Where this child may talk, right now: any room on any island, unless a teacher has
  // narrowed it to おはなし島 ('rooms') or closed it ('off'). おはなし島 itself is always a
  // room — standing on it is being in the call — for as long as talking is open at all.
  const openHere = () => (state.mode === 'off' ? false : state.mode === 'all' ? isCallRoom(state.space) : isTalkSpace(state.space));

  function render() {
    renderRailButton();
    panel.hidden = !openHere();
    if (panel.hidden) { if (state.full) setFull(false); return; }
    $('#voice-room', panel).textContent = `🎧 ${roomLabel(state.space) || 'この部屋'}`;
    const people = [...state.peers.values()];
    const heads = state.kind === 'sfu' ? Math.max(state.heads, people.length + 1) : people.length + 1;
    $('#voice-count', panel).textContent = state.joined ? `${heads}人` : '';
    // A hundred names is not a list a child reads. Whoever is talking comes first, the
    // rest fill the space that is left, and the remainder is a number.
    const shown = state.kind === 'sfu'
      ? [...people].sort((a, b) => (b.level > 0.06 ? 1 : 0) - (a.level > 0.06 ? 1 : 0)).slice(0, NAMES_MAX)
      : people;
    const rest = people.length - shown.length;
    $('#voice-people', panel).innerHTML = state.joined
      ? [`<span class="voice-me ${state.muted ? 'off' : ''} ${state.level > 0.06 ? 'on' : ''}">じぶん</span>`]
        .concat(shown.map((p) => `<span class="${p.level > 0.06 ? 'on' : ''}" data-peer="${esc(p.id)}">${esc(p.name || '…')}${p.role === 'teacher' ? ' 先生' : ''}</span>`))
        .concat(rest > 0 ? [`<span class="voice-rest">ほか ${rest}人</span>`] : [])
        .join('')
      : '';
    $('#voice-join', panel).hidden = state.joined;
    $('#voice-mute', panel).hidden = !state.joined;
    $('#voice-cam', panel).hidden = !state.joined;
    // No button for something this browser cannot do: iPads have no 画面共有 at all, and a
    // button that always fails is worse than no button.
    $('#voice-share', panel).hidden = !state.joined || !canShare();
    $('#voice-mute', panel).textContent = state.muted ? '🔇 ミュート中' : '🎙 オン';
    $('#voice-mute', panel).classList.toggle('off', state.muted);
    $('#voice-cam', panel).textContent = state.camera ? '📷 カメラ オン' : '📷 カメラ オフ';
    $('#voice-cam', panel).classList.toggle('on', state.camera);
    $('#voice-share', panel).textContent = state.screen ? '🖥 がめん 見せている' : '🖥 がめんを 見せる';
    $('#voice-share', panel).classList.toggle('on', state.screen);
    $('#voice-clean', panel).hidden = !state.joined;
    $('#voice-clean', panel).textContent = state.clean ? '🧹 ノイズカット オン' : '🧹 ノイズカット オフ';
    $('#voice-clean', panel).classList.toggle('on', state.clean);
    $('#voice-leave', panel).hidden = !state.joined;
    $('#voice-full', panel).hidden = !state.joined;
    $('#voice-full', panel).textContent = state.full ? '⤡ もどす' : '⛶ ぜんがめん';
    renderTiles();
    renderSay();
    $('#voice-note', panel).textContent = state.error || note();
  }

  // The rail button, in the three states it can be in. The label says what it is; the
  // small line under it says what pressing it will do, because a child should never have
  // to find out by pressing.
  function renderRailButton() {
    railButton.hidden = !state.available;
    if (railButton.hidden) return;
    const here = openHere();
    const people = state.kind === 'sfu' ? Math.max(state.heads, state.peers.size + 1) : state.peers.size + 1;
    const label = $('#voice-button-label', railButton);
    const note2 = $('#voice-button-note', railButton);
    // 英語が主、ひらがなが読みの助け（`bilingual.js` と同じ並び）。
    if (state.joined) {
      label.textContent = state.camera ? '📹 Camera on' : '🎙 In a call';
      note2.textContent = `${state.camera ? 'カメラ オン' : 'つうわ中'}・${people}人`;
    } else if (here) {
      label.textContent = '📹 Video call';
      note2.textContent = 'ここで はなす';
    } else {
      label.textContent = '📹 Video call';
      note2.textContent = 'おはなし島へ';
    }
    railButton.classList.toggle('on', state.joined);
  }

  // What the panel says under the buttons: where this is, how many it holds, and — when a
  // hall has to make do with a mesh because no SFU is configured — that it is only six.
  function note() {
    const hall = state.space === TALK_ISLAND;
    if (state.joined) {
      if (state.kind === 'sfu') {
        return state.can.camera
          ? `島を はなれると おわります（${state.max}人まで）。`
          : `島を はなれると おわります。カメラは 先生が ステージに 上げたら。`;
      }
      return hall ? '島を はなれると おわります。' : '部屋を 出ると おわります。';
    }
    // The number comes from the server once a child is in; before that all that is known
    // is whether this server has a hall behind it at all.
    if (hall && state.stageOpen) return 'この島に いる みんなと 話せます。';
    if (hall) return 'この島に いる 人と 話せます（いまは 6人まで）。';
    return 'この 部屋に いる 人と 話せます。';
  }

  // The written half of the room: what has been said, and the list to say something from.
  function renderSay() {
    const log = $('#voice-log', panel);
    log.hidden = !state.log.length;
    log.innerHTML = state.log.map((m) => {
      const said = m.text ? null : phrasesById.get(m.id);
      return `<li class="${m.mine ? 'mine' : ''}"><b>${esc(m.mine ? 'じぶん' : m.name || '…')}</b>`
        + `<span>${esc(m.text || said?.en || '')}</span><small>${esc(said?.ja || '')}</small></li>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
    $('#voice-say-open', panel).textContent = state.saying ? '× とじる' : '💬 フレーズ';
    $('#voice-write', panel).hidden = !state.free;
    const list = $('#voice-phrases', panel);
    list.hidden = !state.saying;
    if (!state.saying) return;
    list.innerHTML = sayCategories().map((c) => `<b>${esc(c.label)}</b>`
      + (c.phrases || []).map((ph) => `<button type="button" data-say="${esc(ph.id)}"><span>${esc(ph.en)}</span><small>${esc(ph.ja)}</small></button>`).join('')).join('');
    list.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => say(b.dataset.say); });
  }

  // ---- the microphone --------------------------------------------------------------------

  async function join() {
    if (state.joined) return;
    // A microphone needs a secure page. On a plain http:// address on the school Wi-Fi the
    // browser refuses before we ever ask, so say so rather than showing a dead button.
    if (!globalThis.isSecureContext) {
      state.error = 'この アドレスでは マイクが つかえません（https が ひつようです）。';
      render();
      toast('おはなしは https の アドレスで つかえます。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { state.error = 'この端末では マイクが つかえません。'; render(); return; }
    try {
      rawMic = await navigator.mediaDevices.getUserMedia({ audio: MIC, video: false });
    } catch (err) {
      // Worth a line in the console: "the microphone did not open" is the same sentence
      // for a refused permission, a device in use by another app, and a browser that does
      // not have one at all, and a teacher will be asked which it was.
      console.warn('[voice] microphone', err?.name || err);
      state.error = err?.name === 'NotAllowedError' ? 'マイクが きょかされていません。' : `マイクを ひらけませんでした（${err?.name || 'エラー'}）。`;
      render();
      return;
    }
    for (const track of rawMic.getAudioTracks()) { try { track.contentHint = 'speech'; } catch { /* older browser */ } }
    gate = cleanMic(rawMic);
    local = new MediaStream([micTrack()]);
    state.error = '';
    state.joined = true;
    state.muted = false;
    watchLevel('me', local);
    send('voice:join', {});
    hooks.emit('call', { joined: true });
    render();
  }

  // ---- the microphone, cleaned ---------------------------------------------------------
  //
  // What the browser hands over has had its own echo cancelling and noise suppression,
  // which handle a fan and a hum. What they do not handle is a classroom: six iPads in one
  // room, chairs, the child next door, the island's own music out of the speaker. So the
  // signal goes through a short chain before it is sent — a high-pass to drop the rumble,
  // a low-pass over the hiss, a soft gate that closes between words (the rest of the room
  // is only heard while this child speaks), and a gentle compressor so a quiet child and a
  // loud one arrive at the same level. Everything is in the browser's own audio graph: no
  // library, ~10 ms. It reuses the level meter's AudioContext, so there is still one.
  // A browser without the pieces (or a child who turned ノイズカット off) sends the raw mic.
  function cleanMic(raw) {
    try {
      const ctx = meterCtx();
      if (!ctx) return null;
      const src = ctx.createMediaStreamSource(raw);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.7;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7600; lp.Q.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
      const gain = ctx.createGain(); gain.gain.value = GATE.FLOOR;
      const tap = ctx.createAnalyser(); tap.fftSize = 512;
      const dest = ctx.createMediaStreamDestination();
      src.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(gain); gain.connect(dest);
      lp.connect(tap);
      const data = new Float32Array(tap.fftSize);
      let open = false; let quietSince = 0;
      const timer = setInterval(() => {
        // A hidden tab's timers run once a second: do not let the gate chop words there.
        if (document.hidden) { if (!open) { open = true; gain.gain.setTargetAtTime(1, ctx.currentTime, GATE.ATTACK); } return; }
        tap.getFloatTimeDomainData(data);
        let sum = 0; for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > GATE.OPEN) { quietSince = 0; if (!open) { open = true; gain.gain.setTargetAtTime(1, ctx.currentTime, GATE.ATTACK); } }
        else if (rms < GATE.CLOSE && open) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince > GATE.QUIET) { open = false; gain.gain.setTargetAtTime(GATE.FLOOR, ctx.currentTime, GATE.RELEASE); }
        } else quietSince = 0;
      }, GATE.TICK);
      return {
        stream: dest.stream,
        get open() { return open; },
        stop() { clearInterval(timer); for (const node of [src, hp, lp, comp, gain, tap]) { try { node.disconnect(); } catch { /* gone */ } } for (const t of dest.stream.getTracks()) t.stop(); },
      };
    } catch (err) {
      console.warn('[voice] cleanMic', err?.name || err);
      return null;
    }
  }

  // The audio track that goes out: the cleaned one when there is one and it is wanted.
  const micTrack = () => ((state.clean && gate) ? gate.stream.getAudioTracks()[0] : rawMic?.getAudioTracks()[0]) || null;

  // Switching the cleaning on or off mid-call swaps the track in every connection rather
  // than rejoining: the other side hears a different microphone and nothing else changes.
  async function setClean(on) {
    state.clean = !!on;
    try { localStorage.setItem(CLEAN_KEY, state.clean ? 'on' : 'off'); } catch { /* lasts the lesson */ }
    if (state.joined && rawMic) {
      const was = local?.getAudioTracks()[0];
      const next = micTrack();
      if (next && was !== next) {
        next.enabled = !state.muted;
        local.removeTrack(was); local.addTrack(next);
        state.swapError = '';
        try {
          if (state.kind === 'sfu') await stage?.replaceMic(next);
          else for (const peer of state.peers.values()) {
            const sender = peer.pc?.getSenders().find((sn) => sn.track === was || sn.track?.kind === 'audio');
            if (sender) await sender.replaceTrack(next);
          }
        } catch (err) {
          // Worth keeping: "the swap did not take" is otherwise invisible from outside.
          state.swapError = `${err?.name || 'Error'}: ${err?.message || err}`;
          console.warn('[voice] replaceTrack', state.swapError);
        }
        meter?.nodes.delete('me');
        watchLevel('me', local);
      }
    }
    toast(state.clean ? 'ノイズカットを つけました。' : 'ノイズカットを けしました。');
    render();
  }

  function setMuted(on) {
    state.muted = !!on;
    for (const track of [...(local?.getAudioTracks() || []), ...(rawMic?.getAudioTracks() || [])]) track.enabled = !state.muted;
    // In a big room the voice goes up to the SFU, so silence has to be declared there too
    // — and being muted is something the room can then see.
    if (state.kind === 'sfu') stage?.setMic(!state.muted);
    render();
  }

  // The camera is the child's own switch, and it moves while the call is running: adding
  // or removing the track makes each connection renegotiate itself (the polite/impolite
  // rule below settles who offers), and the other side's grid follows what arrives.
  async function setCamera(on) {
    if (!state.joined || state.busyCamera) return;
    state.busyCamera = true;
    try {
      if (on) {
        // In a big room the picture belongs to the teacher and to whoever the teacher has
        // put on the stage: a hundred cameras at once is not a lesson.
        if (!state.can.camera) { state.error = '先生が ステージに 上げると カメラが つかえます。'; return; }
        const cam = await navigator.mediaDevices.getUserMedia({ video: CAMERA, audio: false });
        for (const track of cam.getVideoTracks()) {
          track.onended = () => { if (state.camera) setCamera(false); };
          local.addTrack(track);
          if (state.kind === 'sfu') await stage?.publish(track, 'camera');
          else for (const peer of state.peers.values()) peer.pc?.addTrack(track, local);
        }
        state.camera = true;
        state.error = '';
        tuneSenders();
      } else {
        for (const track of local?.getVideoTracks() || []) {
          if (state.kind === 'sfu') await stage?.unpublish(track, 'camera');
          else {
            for (const peer of state.peers.values()) {
              const sender = peer.pc?.getSenders().find((sn) => sn.track === track);
              if (sender) peer.pc.removeTrack(sender);
            }
          }
          track.stop();
          local.removeTrack(track);
        }
        state.camera = false;
      }
    } catch (err) {
      console.warn('[voice] camera', err?.name || err);
      state.error = err?.name === 'NotAllowedError' ? 'カメラが きょかされていません。' : `カメラを ひらけませんでした（${err?.name || 'エラー'}）。`;
      state.camera = false;
    } finally {
      state.busyCamera = false;
      render();
    }
  }

  // ---- 画面共有 ---------------------------------------------------------------------------
  //
  // A second video track, kept in a MediaStream of its own so the other side can tell a
  // screen from a face — the receiving browser sees the same stream id, and a small
  // 'screen' note over the signalling channel says which id that is. The picture is small
  // and slow on purpose: a worksheet or a drawing has to be readable, not smooth, and a
  // classroom of iPads shares one Wi-Fi.
  const canShare = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  async function setScreen(on) {
    if (!state.joined || state.busyScreen) return;
    state.busyScreen = true;
    try {
      if (on) {
        if (!canShare()) { state.error = 'この端末では がめんを 見せられません。'; return; }
        if (!state.can.screen) { state.error = '先生が ステージに 上げると がめんを 見せられます。'; return; }
        shared = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN, audio: false });
        state.screen = true;
        state.error = '';
        for (const track of shared.getVideoTracks()) {
          // The browser's own "stop sharing" bar is the other way out of this, and it has
          // to end the share here too.
          track.onended = () => { if (state.screen) setScreen(false); };
          if (state.kind === 'sfu') await stage?.publish(track, 'screen');
          else for (const peer of state.peers.values()) peer.pc?.addTrack(track, shared);
        }
        if (state.kind === 'mesh') for (const peer of state.peers.values()) tellScreen(peer);
      } else {
        for (const track of shared?.getVideoTracks() || []) {
          if (state.kind === 'sfu') await stage?.unpublish(track, 'screen');
          else {
            for (const peer of state.peers.values()) {
              const sender = peer.pc?.getSenders().find((sn) => sn.track === track);
              if (sender) peer.pc.removeTrack(sender);
            }
          }
          track.stop();
        }
        shared = null;
        state.screen = false;
        if (state.kind === 'mesh') for (const peer of state.peers.values()) tellScreen(peer);
      }
    } catch (err) {
      // Cancelling the browser's own picker lands here, and is not an error worth saying.
      console.warn('[voice] screen', err?.name || err);
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') state.error = `がめんを 見せられませんでした（${err?.name || 'エラー'}）。`;
      state.screen = false;
      shared = null;
    } finally {
      state.busyScreen = false;
      render();
    }
  }

  // Which of the streams arriving from this browser is the screen. Sent whenever it starts
  // or stops, and to anyone who joins while it is already running.
  const tellScreen = (peer) => signal(peer, 'screen', { id: state.screen ? shared?.id || '' : '', on: !!state.screen });

  // ---- メッセージ ---------------------------------------------------------------------------
  //
  // Written words in the room, for when a microphone is not the way: a child on a muted
  // iPad, a network that will not carry a voice, a name nobody caught. Only the preset
  // phrases travel — an id from phrases.json — so nothing a child typed can reach another
  // child, which is the same rule the class chat has always had.
  async function loadPhrases() {
    if (phrases) return phrases;
    try {
      phrases = await (await fetch('phrases.json', { cache: 'no-cache' })).json();
    } catch (err) {
      console.warn('[voice] phrases.json', err);
      phrases = { categories: [] };
    }
    phrasesById = new Map();
    for (const c of phrases.categories || []) for (const ph of c.phrases || []) phrasesById.set(ph.id, ph);
    return phrases;
  }

  // おはなし first: they are the phrases this panel is for. The rest follow in file order.
  const sayCategories = () => [...(phrases?.categories || [])].sort((a, b) => (a.id === 'talk' ? -1 : b.id === 'talk' ? 1 : 0));

  async function openSay(open) {
    state.saying = open;
    if (open) await loadPhrases();
    render();
  }

  function say(id) {
    if (!phrasesById.has(id)) return;
    send('voice:msg', { id });
    state.saying = false;
    render();
  }

  // The child's own words, to the room. What may be written is the server's to say — the
  // same rules as the class chat, checked in the same place.
  function write() {
    const box = $('#voice-text', panel);
    const text = box.value.trim();
    if (!text) return;
    send('voice:msg', { text });
    box.value = '';
  }

  // A message from the room — the child's own included, echoed back by the server so that
  // everyone sees the same list in the same order.
  function onMsg(m) {
    const typed = typeof m?.text === 'string' && m.text;
    const said = typed ? null : phrasesById.get(m?.id);
    if (!typed && !said) { loadPhrases().then(() => { if (phrasesById.has(m?.id)) onMsg(m); }); return; }
    state.log.push({ id: m.id, text: typed ? m.text : '', name: m.name || '', mine: m.from === state.me, at: Date.now() });
    if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
    render();
  }

  // ---- 大広間 ------------------------------------------------------------------------------
  //
  // Six children in a building connect to each other. A hundred on おはなし島 cannot: each
  // browser would hold ninety-nine connections. A room that size runs through an SFU
  // instead, and the server says which kind of room a child has walked into. The code for
  // it — and the 600KB SDK behind it — is fetched the first time that happens.
  async function stageFor() {
    if (stage) return stage;
    const { createStage } = await import('./stage.js');
    stage = createStage({
      onChange: () => { syncStage(); render(); },
      onError: (err) => console.warn('[voice] 大広間', err?.name || err),
      onLeft: () => { if (state.joined && state.kind === 'sfu') { state.error = 'おはなしが きれました。'; render(); } },
    });
    return stage;
  }

  // The panel draws one list of people whichever kind of room this is, so the big room's
  // participants are copied into the same map the mesh fills in.
  function syncStage() {
    if (state.kind !== 'sfu' || !stage) return;
    const seen = new Set();
    for (const p of stage.people) {
      if (p.mine) { state.level = p.speaking ? 1 : 0; continue; }
      seen.add(p.id);
      const was = state.peers.get(p.id) || {};
      state.peers.set(p.id, { ...was, id: p.id, name: p.name, stream: p.stream, screen: p.screen, level: p.speaking ? 1 : 0 });
    }
    for (const id of [...state.peers.keys()]) if (!seen.has(id)) state.peers.delete(id);
    state.heads = stage.state.count;
  }

  // The ticket: minted by the server for this child, this room and this long, saying what
  // they may publish. It arrives on joining, and again when a teacher puts a child on the
  // stage or takes them off it.
  async function onToken(m) {
    if (!state.joined || state.kind !== 'sfu') return;
    ticket = m;
    state.can = { camera: !!m?.can?.camera, screen: !!m?.can?.screen };
    const mic = local?.getAudioTracks?.()[0] || null;
    try {
      const st = await stageFor();
      const again = st.live;
      await (again ? st.retoken({ url: m.url, token: m.token, can: state.can, mic }) : st.connect({ url: m.url, token: m.token, can: state.can, mic }));
      // A camera that was on before a re-ticket is republished; one this child may no
      // longer publish is put away.
      if (state.camera && !state.can.camera) await setCamera(false);
      if (state.screen && !state.can.screen) await setScreen(false);
      state.error = '';
    } catch (err) {
      console.warn('[voice] 大広間 connect', err?.name || err);
      state.error = 'おはなしに つなげませんでした。';
    }
    syncStage();
    render();
  }

  // ---- one connection per person in the room ---------------------------------------------

  // The standard "perfect negotiation" dance: both sides may offer at once, and the polite
  // one gives way. Which is which is decided by the ids, so both browsers agree without
  // asking anybody.
  function peerFor(info) {
    let peer = state.peers.get(info.id);
    if (peer) { peer.name = info.name ?? peer.name; peer.role = info.role ?? peer.role; return peer; }
    // The public STUN always, plus whatever relays the room handed us (a school's TURN).
    const pc = new RTCPeerConnection({ iceServers: state.ice ? [...ICE, ...state.ice] : ICE });
    peer = {
      ...info, pc, level: 0, polite: state.me < info.id, making: false, ignoring: false,
      stream: new MediaStream(),   // their microphone and their face
      screen: new MediaStream(),   // their shared screen, if they are showing one
      screenId: '',                // which arriving stream that is (they tell us)
      from: new Map(),             // track id -> the stream id it arrived on
    };
    state.peers.set(info.id, peer);
    for (const track of local?.getTracks() || []) pc.addTrack(track, local);
    // Someone joining a room where a screen is already up gets it too, and is told which
    // of the two streams it is.
    if (state.screen && shared) {
      for (const track of shared.getVideoTracks()) pc.addTrack(track, shared);
      queueMicrotask(() => tellScreen(peer));
    }
    pc.onicecandidate = (e) => { if (e.candidate) signal(peer, 'ice', e.candidate.toJSON()); };
    pc.onnegotiationneeded = async () => {
      try {
        peer.making = true;
        await pc.setLocalDescription();
        signal(peer, 'sdp', pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      } catch { /* the connection is going away */ } finally { peer.making = false; }
    };
    pc.ontrack = (e) => {
      // Which stream it came in on decides whether it is a face or a screen. The note
      // saying which is which can arrive either side of the track, so the id is kept and
      // the tracks are sorted again whenever it changes.
      peer.from.set(e.track.id, e.streams[0]?.id || '');
      sortTracks(peer);
      attach(peer);
      if (e.track.kind === 'audio') watchLevel(peer.id, peer.stream);
      // A camera switched off at the other end arrives here as a track going quiet, and
      // the tile has to go with it.
      const forget = () => {
        peer.from.delete(e.track.id);
        for (const stream of [peer.stream, peer.screen]) { try { stream.removeTrack(e.track); } catch { /* gone */ } }
        render();
      };
      e.track.onended = forget;
      e.track.onmute = () => render();
      e.track.onunmute = () => render();
      render();
    };
    pc.onconnectionstatechange = () => {
      if (['connected', 'completed'].includes(pc.connectionState)) { clearInterval(peer.watchdog); peer.watchdog = 0; tuneSenders(); }
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peer.id);
    };
    // A connection that never gets through would otherwise sit there silently for the whole
    // lesson: the child sees the name and hears nothing. School networks drop UDP often
    // enough that this is the normal failure, so the side that offers tries the connection
    // again a couple of times (ICE restart) before leaving it alone.
    peer.tries = 0;
    peer.since = Date.now();
    peer.watchdog = setInterval(() => {
      if (['connected', 'completed', 'closed'].includes(pc.connectionState)) { clearInterval(peer.watchdog); peer.watchdog = 0; return; }
      // Only the side that offers restarts, and only once the connection has had a fair
      // while to come up on its own — a slow school Wi-Fi is not a failure yet.
      if (peer.polite || peer.tries >= 2 || Date.now() - peer.since < RETRY_MS) return;
      peer.tries += 1;
      peer.since = Date.now();
      try { pc.restartIce(); } catch { /* too late: the connection is going away */ }
    }, 3000);
    return peer;
  }

  // What each connection may spend. The voice first: audio is marked high priority so a
  // congested link drops picture before words. The picture by head-count: a mesh sends
  // one copy per peer, so the more there are the less each copy gets. setParameters is
  // best-effort — a browser that refuses a field keeps its defaults.
  function tuneSenders() {
    if (state.kind !== 'mesh') return;
    const kbps = VIDEO_KBPS(state.peers.size);
    for (const peer of state.peers.values()) {
      for (const sender of peer.pc?.getSenders() || []) {
        const track = sender.track;
        if (!track) continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          if (track.kind === 'audio') { params.encodings[0].priority = 'high'; params.encodings[0].networkPriority = 'high'; }
          else {
            const screen = shared && shared.getVideoTracks().includes(track);
            params.encodings[0].maxBitrate = (screen ? 700 : kbps) * 1000;
            params.encodings[0].maxFramerate = screen ? 12 : 24;
            params.degradationPreference = screen ? 'maintain-resolution' : 'maintain-framerate';
          }
          sender.setParameters(params).catch(() => { /* defaults, then */ });
        } catch { /* defaults, then */ }
      }
    }
  }

  // Put every track this peer has sent into the right one of their two streams: the screen
  // if it came in on the stream they named as their screen, their face and voice otherwise.
  function sortTracks(peer) {
    for (const receiver of peer.pc.getReceivers()) {
      const track = receiver.track;
      if (!track) continue;
      const isScreen = peer.screenId && peer.from.get(track.id) === peer.screenId;
      const want = isScreen ? peer.screen : peer.stream;
      const other = isScreen ? peer.stream : peer.screen;
      try { other.removeTrack(track); } catch { /* was not in it */ }
      if (!want.getTracks().includes(track)) { try { want.addTrack(track); } catch { /* gone */ } }
    }
  }

  const signal = (peer, kind, data) => send('rtc:signal', { to: peer.id, kind, data: JSON.stringify(data) });

  async function onSignal(m) {
    const peer = state.peers.get(m.from) || (state.joined ? peerFor({ id: m.from, name: '' }) : null);
    if (!peer) return;
    let payload;
    try { payload = JSON.parse(m.data); } catch { return; }
    const pc = peer.pc;
    try {
      if (m.kind === 'sdp') {
        const offerCollision = payload.type === 'offer' && (peer.making || pc.signalingState !== 'stable');
        peer.ignoring = !peer.polite && offerCollision;
        if (peer.ignoring) return;
        await pc.setRemoteDescription(payload);
        if (payload.type === 'offer') {
          await pc.setLocalDescription();
          signal(peer, 'sdp', { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
        }
      } else if (m.kind === 'ice') {
        try { await pc.addIceCandidate(payload); } catch { if (!peer.ignoring) throw new Error('ice'); }
      } else if (m.kind === 'screen') {
        // "the stream with this id is my screen" — or, with no id, "I have stopped".
        peer.screenId = payload?.on ? String(payload.id || '') : '';
        sortTracks(peer);
        render();
      }
    } catch { /* a failed negotiation closes itself through onconnectionstatechange */ }
  }

  // The sound itself. A hidden <audio> per person, and a tile if they turned a camera on.
  function attach(peer) {
    if (!peer.el) {
      peer.el = document.createElement('audio');
      peer.el.autoplay = true;
      peer.el.playsInline = true;
      audio.append(peer.el);
    }
    peer.el.srcObject = peer.stream;
    peer.el.play?.().catch(() => { /* iOS wants a gesture; the join tap was one */ });
  }

  function closePeer(id) {
    const peer = state.peers.get(id);
    if (!peer) return;
    clearInterval(peer.watchdog);
    try { peer.pc.close(); } catch { /* already closed */ }
    peer.el?.remove();
    dropTile(id);
    meter?.nodes.delete(id);
    state.peers.delete(id);
    tuneSenders();
    render();
  }

  function leave(quiet = false) {
    const was = state.joined;
    if (state.full) setFull(false);
    if (state.kind === 'sfu') { stage?.leave(); state.peers.clear(); state.heads = 0; ticket = null; }
    for (const id of [...state.peers.keys()]) closePeer(id);
    for (const track of local?.getTracks() || []) track.stop();
    for (const track of rawMic?.getTracks() || []) track.stop();
    for (const track of shared?.getTracks() || []) track.stop();
    gate?.stop();
    gate = null;
    rawMic = null;
    local = null;
    shared = null;
    state.pinned = '';
    meter?.nodes.clear();
    state.joined = false;
    state.camera = false;
    state.screen = false;
    state.room = '';
    state.level = 0;
    $('#voice-tiles', panel).innerHTML = '';
    $('#voice-tiles', panel).hidden = true;
    if (!quiet) send('voice:leave', {});
    if (was) hooks.emit('call', { joined: false });
    render();
  }

  // ---- who is talking ---------------------------------------------------------------------

  // A dot beside a name, so a child can see that the room heard them. Cheap: one analyser
  // per stream, read five times a second.
  // One AudioContext for the whole panel: the level dots and the microphone cleaning
  // share it. Made on the join tap, which is the gesture iOS wants before it will run.
  function meterCtx() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return null;
    if (!meter) meter = { ctx: new Ctx(), nodes: new Map() };
    if (meter.ctx.state === 'suspended') meter.ctx.resume().catch(() => {});
    return meter.ctx;
  }

  function watchLevel(id, stream) {
    try {
      if (!meterCtx()) return;
      const source = meter.ctx.createMediaStreamSource(stream);
      const analyser = meter.ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      meter.nodes.set(id, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      if (!levelTimer) levelTimer = setInterval(readLevels, 200);
    } catch { /* no audio context: the names just do not light up */ }
  }

  function readLevels() {
    if (!meter) return;
    let changed = false;
    for (const [id, node] of meter.nodes) {
      node.analyser.getByteTimeDomainData(node.data);
      let peak = 0;
      for (const v of node.data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      const level = Math.round(peak * 100) / 100;
      if (id === 'me') { if (Math.abs((state.level || 0) - level) > 0.03) { state.level = level; changed = true; } continue; }
      const peer = state.peers.get(id);
      if (peer && Math.abs(peer.level - level) > 0.03) { peer.level = level; changed = true; }
    }
    if (changed) render();
  }

  return {
    state,
    // The class's switch, and where the child is standing: both come from the network layer.
    setMode(mode) {
      const next = ['rooms', 'all', 'off'].includes(mode) ? mode : 'all';
      if (state.mode === next) return;
      state.mode = next;
      if (state.joined && !openHere()) leave(true);
      render();
    },
    // Online or not. The rail button is the only part of the call that is visible when a
    // child is not in a room, so it is the only part that has to know.
    setAvailable(v) {
      const next = !!v;
      if (state.available === next) return;
      state.available = next;
      render();
    },
    setStage(on) {
      const next = !!on;
      if (state.stageOpen === next) return;
      state.stageOpen = next;
      render();
    },
    // Free typing, as the class has it set. Off means the box goes away here too: one
    // switch, both places to write.
    setFree(on) {
      const next = on !== false;
      if (state.free === next) return;
      state.free = next;
      render();
    },
    setSpace(space) {
      if (state.space === space) return;
      const was = state.space;
      state.space = space;
      // Walking out of the room — or off the island — is hanging up. What was written in
      // that room stays in it: a new room starts with an empty page.
      if (was !== space) { state.log = []; state.saying = false; }
      if (state.joined && was !== space) leave(true);
      render();
    },
    // ---- what the server says
    onRoom(m) {
      state.room = m.room;
      state.me = m.me;
      state.ice = Array.isArray(m.ice) && m.ice.length ? m.ice : null;
      state.kind = m.kind === 'sfu' ? 'sfu' : 'mesh';
      state.max = Number(m.max) || 6;
      // A small room has never asked permission for a camera, and walking out of the hall
      // into one has to give it back.
      if (state.kind === 'mesh') state.can = { camera: true, screen: true };
      // A mesh introduces everyone to everyone. A big room has nobody to introduce: the
      // SFU is the only connection each browser makes, and the ticket follows this message.
      if (state.kind === 'mesh') for (const info of m.peers || []) peerFor(info);
      render();
    },
    onToken,
    onPeer(m) {
      if (!state.joined || state.kind !== 'mesh') return;
      if (m.joined) peerFor(m); else closePeer(m.id);
      render();
    },
    onSignal,
    onMsg,
    // A normal onClosed (left the room, moved, disconnected) says nothing — those are
    // expected. 'daily limit' is different: the child is mid-call and the room just hung
    // up on them without being asked, so the one case worth a word is this one.
    onClosed(m) {
      if (m?.reason === 'daily limit') toast('きょうの つうわの じかんが おわりました。またあした！');
      if (state.joined) leave(true);
    },
    onError(m) {
      const said = {
        closed: 'おはなしは まだ ひらいていません。',
        'not in a room': '部屋の 中で 話せます。',
        'room is full': 'この 部屋は いっぱいです。',
        'too fast': 'つうしんが こみあっています。',
        'daily limit': 'きょうの つうわの じかんを つかいきりました。またあした！',
      }[m?.reason];
      if (said) { state.error = said; toast(said); }
      if (['closed', 'not in a room', 'room is full', 'daily limit'].includes(m?.reason) && state.joined) leave(true);
      render();
    },
    leave,
    setSize,
    setFull,
    setClean,
    pin(key) { state.pinned = key || ''; render(); },
    setScreen,
    say,
    get gate() { return gate; },
    get sent() { return local?.getAudioTracks()[0] || null; },
    get joined() { return state.joined; },
    get panel() { return panel; },
  };
}
