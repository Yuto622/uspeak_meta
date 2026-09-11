// 大広間 — the big room, through an SFU.
//
// voice.js has two ways of putting children in a call and the room decides which: six in
// a building talk browser to browser (a mesh, no server in the middle), and a hundred in
// おはなし島's plaza talk through LiveKit, which takes each voice once and forwards it to
// whoever is listening. This file is only the second one, and it is loaded — all 600KB of
// the SDK with it — the first time a child actually walks into a big room. A class of six
// never downloads it.
//
// What this file does not do is decide anything: the room, the ticket and what a child may
// publish all come from the server, signed. A page cannot ask for a camera it was not
// given, or for another class's room.

let LK = null;   // the SDK, once it has been fetched

async function sdk() {
  if (!LK) LK = await import('./vendor/livekit.js');
  return LK;
}

// A hundred people in a list is not a list anyone reads, and a hundred cameras is not a
// lesson. The panel shows whoever is speaking and whoever is being seen; the rest are a
// number. Those decisions live in voice.js — what comes out of here is the whole truth.
export function createStage({ onChange, onError, onLeft }) {
  const state = {
    live: false,
    url: '',
    can: { camera: false, screen: false },
    me: '',
    name: '',
    people: new Map(),   // identity -> { id, name, speaking, stream, screen, mine }
    count: 0,
  };
  let room = null;

  const person = (id, name = '') => {
    let p = state.people.get(id);
    if (!p) {
      p = { id, name, speaking: false, stream: new MediaStream(), screen: new MediaStream(), mine: false };
      state.people.set(id, p);
    }
    if (name) p.name = name;
    return p;
  };

  const nameOf = (participant) => participant?.name || participant?.identity || '…';

  function wire(r, LiveKit) {
    const { RoomEvent, Track } = LiveKit;
    r.on(RoomEvent.ParticipantConnected, (p) => { person(p.identity, nameOf(p)); bump(); });
    r.on(RoomEvent.ParticipantDisconnected, (p) => { state.people.delete(p.identity); bump(); });
    r.on(RoomEvent.TrackSubscribed, (track, pub, p) => {
      const who = person(p.identity, nameOf(p));
      // A screen and a face arrive as different sources, so nothing has to be guessed.
      const into = pub.source === Track.Source.ScreenShare ? who.screen : who.stream;
      try { into.addTrack(track.mediaStreamTrack); } catch { /* already there */ }
      bump();
    });
    r.on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
      const who = state.people.get(p.identity);
      if (!who) return;
      for (const stream of [who.stream, who.screen]) { try { stream.removeTrack(track.mediaStreamTrack); } catch { /* gone */ } }
      bump();
    });
    r.on(RoomEvent.TrackMuted, bump);
    r.on(RoomEvent.TrackUnmuted, bump);
    // Who is talking, decided by the SFU rather than by every browser measuring everyone.
    r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const loud = new Set(speakers.map((p) => p.identity));
      for (const p of state.people.values()) p.speaking = loud.has(p.id);
      bump();
    });
    r.on(RoomEvent.Disconnected, () => { state.live = false; onLeft?.(); bump(); });
    r.on(RoomEvent.ConnectionStateChanged, bump);
  }

  // How many are in the hall, counted from the room itself rather than from our own map:
  // people arrive before their tracks do, and the number on the panel should say so.
  function bump() {
    const others = room?.remoteParticipants?.size;
    state.count = (typeof others === 'number' ? others : Math.max(0, state.people.size - 1)) + 1;
    onChange?.();
  }

  // Joining. The microphone track is the one voice.js already opened on the child's tap —
  // handing it over keeps the browser's "this was a gesture" promise, which is what iOS
  // wants before it will play anybody's voice back.
  async function connect({ url, token, can, mic }) {
    const LiveKit = await sdk();
    await leave();
    state.url = url;
    state.can = { camera: !!can?.camera, screen: !!can?.screen };
    room = new LiveKit.Room({
      // adaptiveStream decides what to send from what is on screen, and it learns that
      // from elements the SDK attached itself. The panel builds its own tiles out of the
      // tracks, so it would see nothing on screen and pause the picture: off.
      adaptiveStream: false,
      dynacast: true,            // nothing is sent up that nobody has subscribed to
      stopLocalTrackOnUnpublish: false,
    });
    wire(room, LiveKit);
    await room.connect(url, token);
    state.live = true;
    state.me = room.localParticipant.identity;
    state.name = room.localParticipant.name || '';
    const mine = person(state.me, 'じぶん');
    mine.mine = true;
    if (mic) await room.localParticipant.publishTrack(mic, { source: LiveKit.Track.Source.Microphone });
    for (const p of room.remoteParticipants?.values?.() || []) person(p.identity, nameOf(p));
    bump();
    return true;
  }

  async function leave() {
    const r = room;
    room = null;
    state.live = false;
    state.people.clear();
    state.count = 0;
    if (r) { try { await r.disconnect(); } catch { /* already gone */ } }
  }

  // The microphone is muted, never unpublished: coming back has to be instant, and the
  // room should keep knowing the child is there.
  async function setMic(on) {
    const pub = [...(room?.localParticipant?.audioTrackPublications?.values?.() || [])][0];
    if (!pub) return;
    try { on ? await pub.unmute() : await pub.mute(); } catch (err) { onError?.(err); }
    bump();
  }

  // A camera or a screen this child may not publish is not attempted: the server said so
  // in the ticket, and the SFU would refuse it anyway.
  async function publish(track, source) {
    if (!room?.localParticipant) return false;
    const LiveKit = await sdk();
    const want = source === 'screen' ? LiveKit.Track.Source.ScreenShare : LiveKit.Track.Source.Camera;
    if (source === 'screen' ? !state.can.screen : !state.can.camera) return false;
    await room.localParticipant.publishTrack(track, { source: want });
    const mine = person(state.me, 'じぶん');
    try { (source === 'screen' ? mine.screen : mine.stream).addTrack(track); } catch { /* already there */ }
    bump();
    return true;
  }

  async function unpublish(track, source) {
    if (!room?.localParticipant || !track) return;
    try { await room.localParticipant.unpublishTrack(track, false); } catch { /* already gone */ }
    const mine = state.people.get(state.me);
    if (mine) { try { (source === 'screen' ? mine.screen : mine.stream).removeTrack(track); } catch { /* gone */ } }
    bump();
  }

  // A teacher putting a child on the stage sends a new ticket. Reconnecting with it is a
  // blink of silence, and the simplest thing that cannot be faked by the page.
  async function retoken({ url, token, can, mic }) {
    if (!state.live) return false;
    return connect({ url, token, can, mic });
  }

  return {
    state,
    connect,
    retoken,
    leave,
    setMic,
    publish,
    unpublish,
    get live() { return state.live; },
    get people() { return [...state.people.values()]; },
  };
}
