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
const CAMERA = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } };
const RETRY_MS = 12000;  // how long a connection may stay unconnected before it is tried again

export function createVoice({ send, toast, roomLabel = () => '' }) {
  const state = {
    mode: 'rooms',      // 'rooms' おはなし島だけ / 'all' どこでも / 'off' 止まっている
    busyCamera: false,  // one camera switch at a time, or two taps race each other
    space: '',          // where the child is standing
    room: '',           // the call they are in, if any
    me: '',
    joined: false,
    muted: false,
    camera: false,
    peers: new Map(),   // sessionId -> { id, name, role, pc, stream, polite, making, ignoring, level, el }
    size: 'm',          // how big the panel (and so the faces) are drawn
    error: '',
  };
  let local = null;         // MediaStream: the microphone, and the camera if it is on
  let meter = null;         // { ctx, nodes: Map(id -> analyser) }
  let levelTimer = 0;

  // ---- the panel ------------------------------------------------------------------------

  const panel = document.createElement('aside');
  panel.id = 'voice-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="voice-head"><b id="voice-room"></b><small id="voice-count"></small>
      <button type="button" id="voice-size" class="voice-size" title="がめんの 大きさ">⤢ 中</button></div>
    <div id="voice-tiles" class="voice-tiles" hidden></div>
    <div id="voice-people" class="voice-people"></div>
    <div class="voice-acts">
      <button type="button" id="voice-join" class="primary">🎙 おはなしに はいる</button>
      <button type="button" id="voice-mute" hidden>マイク</button>
      <button type="button" id="voice-cam" hidden>カメラ</button>
    </div>
    <p id="voice-note" class="voice-note"></p>`;
  document.body.append(panel);
  const audio = document.createElement('div');
  audio.id = 'voice-audio';
  audio.hidden = true;
  document.body.append(audio);

  $('#voice-join', panel).onclick = () => join();
  $('#voice-mute', panel).onclick = () => setMuted(!state.muted);
  $('#voice-cam', panel).onclick = () => setCamera(!state.camera);

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
  };
  setSize(readSize() || 'm');

  // A face, with the name on it. One per camera that is on — the child's own included,
  // mirrored, because a picture of yourself that moves the wrong way is unsettling.
  function tileFor(key, name, stream, mine = false) {
    const tiles = $('#voice-tiles', panel);
    let box = tiles.querySelector(`[data-tile="${CSS.escape(key)}"]`);
    if (!box) {
      box = document.createElement('div');
      box.className = `voice-tile ${mine ? 'mine' : ''}`;
      box.dataset.tile = key;
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;             // the sound comes through the audio element, once
      const label = document.createElement('small');
      box.append(video, label);
      // The child's own face goes first; everyone else follows in the order they arrived.
      if (mine) tiles.prepend(box); else tiles.append(box);
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
  function renderTiles() {
    if (!state.joined) { $('#voice-tiles', panel).innerHTML = ''; $('#voice-tiles', panel).hidden = true; return; }
    if (state.camera && local?.getVideoTracks().length) tileFor('me', 'じぶん', local, true);
    else dropTile('me');
    for (const peer of state.peers.values()) {
      const live = peer.stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
      if (live) tileFor(peer.id, peer.name || '…', peer.stream);
      else dropTile(peer.id);
    }
  }

  // Where this child may talk, right now: the island always, everywhere else only if a
  // teacher has opened it.
  const openHere = () => (state.mode === 'off' ? false : state.mode === 'all' ? isCallRoom(state.space) : isTalkSpace(state.space));

  function render() {
    panel.hidden = !openHere();
    if (panel.hidden) return;
    $('#voice-room', panel).textContent = `🎧 ${roomLabel(state.space) || 'この部屋'}`;
    const people = [...state.peers.values()];
    $('#voice-count', panel).textContent = state.joined ? `${people.length + 1}人` : '';
    $('#voice-people', panel).innerHTML = state.joined
      ? [`<span class="voice-me ${state.muted ? 'off' : ''} ${state.level > 0.06 ? 'on' : ''}">じぶん</span>`]
        .concat(people.map((p) => `<span class="${p.level > 0.06 ? 'on' : ''}" data-peer="${esc(p.id)}">${esc(p.name || '…')}${p.role === 'teacher' ? ' 先生' : ''}</span>`))
        .join('')
      : '';
    $('#voice-join', panel).hidden = state.joined;
    $('#voice-mute', panel).hidden = !state.joined;
    $('#voice-cam', panel).hidden = !state.joined;
    $('#voice-mute', panel).textContent = state.muted ? '🔇 ミュート中' : '🎙 オン';
    $('#voice-mute', panel).classList.toggle('off', state.muted);
    $('#voice-cam', panel).textContent = state.camera ? '📷 カメラ オン' : '📷 カメラ オフ';
    $('#voice-cam', panel).classList.toggle('on', state.camera);
    renderTiles();
    $('#voice-note', panel).textContent = state.error
      || (state.joined
        ? (state.space === TALK_ISLAND ? '島を はなれると おわります。' : '部屋を 出ると おわります。')
        : (state.space === TALK_ISLAND ? 'この島に いる みんなと 話せます。' : '同じ 部屋の 人と 話せます。'));
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
      local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (err) {
      // Worth a line in the console: "the microphone did not open" is the same sentence
      // for a refused permission, a device in use by another app, and a browser that does
      // not have one at all, and a teacher will be asked which it was.
      console.warn('[voice] microphone', err?.name || err);
      state.error = err?.name === 'NotAllowedError' ? 'マイクが きょかされていません。' : `マイクを ひらけませんでした（${err?.name || 'エラー'}）。`;
      render();
      return;
    }
    state.error = '';
    state.joined = true;
    state.muted = false;
    watchLevel('me', local);
    send('voice:join', {});
    render();
  }

  function setMuted(on) {
    state.muted = !!on;
    for (const track of local?.getAudioTracks() || []) track.enabled = !state.muted;
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
        const cam = await navigator.mediaDevices.getUserMedia({ video: CAMERA, audio: false });
        for (const track of cam.getVideoTracks()) {
          track.onended = () => { if (state.camera) setCamera(false); };
          local.addTrack(track);
          for (const peer of state.peers.values()) peer.pc?.addTrack(track, local);
        }
        state.camera = true;
        state.error = '';
      } else {
        for (const track of local?.getVideoTracks() || []) {
          for (const peer of state.peers.values()) {
            const sender = peer.pc?.getSenders().find((sn) => sn.track === track);
            if (sender) peer.pc.removeTrack(sender);
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

  // ---- one connection per person in the room ---------------------------------------------

  // The standard "perfect negotiation" dance: both sides may offer at once, and the polite
  // one gives way. Which is which is decided by the ids, so both browsers agree without
  // asking anybody.
  function peerFor(info) {
    let peer = state.peers.get(info.id);
    if (peer) { peer.name = info.name ?? peer.name; peer.role = info.role ?? peer.role; return peer; }
    const pc = new RTCPeerConnection({ iceServers: ICE });
    peer = { ...info, pc, level: 0, polite: state.me < info.id, making: false, ignoring: false, stream: new MediaStream() };
    state.peers.set(info.id, peer);
    for (const track of local?.getTracks() || []) pc.addTrack(track, local);
    pc.onicecandidate = (e) => { if (e.candidate) signal(peer, 'ice', e.candidate.toJSON()); };
    pc.onnegotiationneeded = async () => {
      try {
        peer.making = true;
        await pc.setLocalDescription();
        signal(peer, 'sdp', pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      } catch { /* the connection is going away */ } finally { peer.making = false; }
    };
    pc.ontrack = (e) => {
      peer.stream.addTrack(e.track);
      attach(peer);
      if (e.track.kind === 'audio') watchLevel(peer.id, peer.stream);
      // A camera switched off at the other end arrives here as a track going quiet, and
      // the tile has to go with it.
      const forget = () => { try { peer.stream.removeTrack(e.track); } catch { /* gone */ } render(); };
      e.track.onended = forget;
      e.track.onmute = () => render();
      e.track.onunmute = () => render();
      render();
    };
    pc.onconnectionstatechange = () => {
      if (['connected', 'completed'].includes(pc.connectionState)) { clearInterval(peer.watchdog); peer.watchdog = 0; }
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
    render();
  }

  function leave(quiet = false) {
    for (const id of [...state.peers.keys()]) closePeer(id);
    for (const track of local?.getTracks() || []) track.stop();
    local = null;
    meter?.nodes.clear();
    state.joined = false;
    state.camera = false;
    state.room = '';
    state.level = 0;
    $('#voice-tiles', panel).innerHTML = '';
    $('#voice-tiles', panel).hidden = true;
    if (!quiet) send('voice:leave', {});
    render();
  }

  // ---- who is talking ---------------------------------------------------------------------

  // A dot beside a name, so a child can see that the room heard them. Cheap: one analyser
  // per stream, read five times a second.
  function watchLevel(id, stream) {
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      if (!meter) meter = { ctx: new Ctx(), nodes: new Map() };
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
      const next = ['rooms', 'all', 'off'].includes(mode) ? mode : 'rooms';
      if (state.mode === next) return;
      state.mode = next;
      if (state.joined && !openHere()) leave(true);
      render();
    },
    setSpace(space) {
      if (state.space === space) return;
      const was = state.space;
      state.space = space;
      // Walking out of the room — or off the island — is hanging up.
      if (state.joined && was !== space) leave(true);
      render();
    },
    // ---- what the server says
    onRoom(m) {
      state.room = m.room;
      state.me = m.me;
      for (const info of m.peers || []) peerFor(info);
      render();
    },
    onPeer(m) {
      if (!state.joined) return;
      if (m.joined) peerFor(m); else closePeer(m.id);
      render();
    },
    onSignal,
    onClosed() { if (state.joined) leave(true); },
    onError(m) {
      const said = {
        closed: 'おはなしは まだ ひらいていません。',
        'not in a room': '部屋の 中で 話せます。',
        'room is full': 'この 部屋は いっぱいです。',
        'too fast': 'つうしんが こみあっています。',
      }[m?.reason];
      if (said) { state.error = said; toast(said); }
      if (['closed', 'not in a room', 'room is full'].includes(m?.reason) && state.joined) leave(true);
      render();
    },
    leave,
    setSize,
    get joined() { return state.joined; },
    get panel() { return panel; },
  };
}
