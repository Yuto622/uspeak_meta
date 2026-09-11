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

// A room a child can talk in is one they walked into: in:<island>:<building>. Their own
// マイルーム and their building lot are theirs alone, and an island is not a call.
export const isCallRoom = (space) => /^in:[^:]+:[^:]+$/.test(String(space || ''));

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const CAMERA = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } };

export function createVoice({ send, toast, roomLabel = () => '' }) {
  const state = {
    open: false,        // the teacher has opened 通話 for the class
    space: '',          // where the child is standing
    room: '',           // the call they are in, if any
    me: '',
    joined: false,
    muted: false,
    camera: false,
    peers: new Map(),   // sessionId -> { id, name, role, pc, stream, polite, making, ignoring, level, el }
    error: '',
  };
  let local = null;         // MediaStream: the microphone, and the camera if it is on
  let meter = null;         // { ctx, nodes: Map(id -> analyser) }
  let levelTimer = 0;

  // ---- the panel ------------------------------------------------------------------------

  const panel = document.createElement('aside');
  panel.id = 'voice-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="voice-head"><b id="voice-room"></b><small id="voice-count"></small></div>
    <div id="voice-people" class="voice-people"></div>
    <video id="voice-me" class="voice-tile" muted playsinline autoplay hidden></video>
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

  function render() {
    const inRoom = isCallRoom(state.space);
    panel.hidden = !(state.open && inRoom);
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
    $('#voice-cam', panel).textContent = state.camera ? '📷 オン' : '📷 オフ';
    $('#voice-me', panel).hidden = !state.camera;
    $('#voice-note', panel).textContent = state.error || (state.joined ? '部屋を 出ると おわります。' : '同じ 部屋の 人と 話せます。');
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

  async function setCamera(on) {
    if (!state.joined) return;
    if (on) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: CAMERA, audio: false });
        for (const track of cam.getVideoTracks()) {
          local.addTrack(track);
          // Every connection gets the new track, and each one renegotiates itself.
          for (const peer of state.peers.values()) peer.pc?.addTrack(track, local);
        }
        $('#voice-me', panel).srcObject = local;
        state.camera = true;
      } catch { state.error = 'カメラを ひらけませんでした。'; }
    } else {
      for (const track of local?.getVideoTracks() || []) {
        track.stop();
        local.removeTrack(track);
        for (const peer of state.peers.values()) {
          const sender = peer.pc?.getSenders().find((s) => s.track === track);
          if (sender) peer.pc.removeTrack(sender);
        }
      }
      state.camera = false;
    }
    render();
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
      render();
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peer.id);
    };
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
    if (peer.stream.getVideoTracks().length && !peer.video) {
      peer.video = document.createElement('video');
      peer.video.className = 'voice-tile';
      peer.video.autoplay = true;
      peer.video.playsInline = true;
      peer.video.srcObject = peer.stream;
      panel.insertBefore(peer.video, $('#voice-me', panel));
    }
  }

  function closePeer(id) {
    const peer = state.peers.get(id);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* already closed */ }
    peer.el?.remove();
    peer.video?.remove();
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
    $('#voice-me', panel).srcObject = null;
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
    setOpen(on) {
      if (state.open === !!on) return;
      state.open = !!on;
      if (!state.open && state.joined) leave(true);
      render();
    },
    setSpace(space) {
      if (state.space === space) return;
      const was = state.space;
      state.space = space;
      // Walking out of the room is hanging up.
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
    get joined() { return state.joined; },
    get panel() { return panel; },
  };
}
