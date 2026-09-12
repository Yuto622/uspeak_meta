// Multiplayer client layer. Owns the Colyseus room, the 20 Hz position stream, remote
// avatars, reconnection (iPad background / lock / reload), server-authoritative wallet
// mirroring, chat and teacher commands. Offline mode = this module stays idle.
import { NET, STORAGE_KEYS, resolveServerUrl, defaultClassCode, storage } from './net-config.js';
import { hooks } from './net-hooks.js';
import { createRemotePlayers } from './remote-players.js';
import { createChat } from './chat.js';
import { createTeacherPanel } from './teacher.js';
import { createLobby } from './lobby.js';
import { createMissionUI } from './mission.js';
import { createQuizUI } from './quiz.js';
import { createGymUI } from './gym.js';
import { createEikenUI } from './eiken.js';
import { createInterviewUI } from './interview.js';
import { createConvUI } from './conv.js';
import { createVoice, TALK_ISLAND } from './voice.js';
import { createBattleUI } from './battle.js';
import { createDojoUI } from './dojo.js';
import { createPetUI } from './pet.js';
import { createDailyUI } from './daily.js';
import { createNight } from './night-world.js';
import { createRideUI } from './ride.js';
import { createRaceUI } from './race.js';
import { createRoom } from './room-world.js';
import { createPlaza } from './plaza-world.js';
import { createTownUI } from './town.js';

export function setupNet({ scene, camera, view, player, rpg, fishing, avatars, park, toast, speak, learn }) {
  const Colyseus = globalThis.Colyseus;
  const $ = (s) => document.querySelector(s);
  const state = {
    mode: 'offline', // offline | connecting | online | reconnecting
    role: 'student', sessionId: null, name: '', classCode: '', teacherKey: '',
    attempts: 0, intentionalLeave: false, chatPaused: false, freeChat: true, teacherId: '',
    progress: null, wallet: null, move: null, pet: null, lastSpace: '', lastSendAt: 0, lastSent: { s: '', x: NaN, z: NaN, r: NaN, a: '' }, lastProgressJson: '', lastProgressAt: 0,
    pendingTeleport: null, hiddenAt: 0, resumedAt: 0, lastAvatarJson: '',
    // How far this device's clock is from the server's, measured once on joining. The
    // sky then runs locally: it is a function of the time, so it needs no updates.
    skew: 0,
    riding: '', speed: 1,
  };
  let client = null;
  let room = null;
  let reconnectTimer = null;
  let probeTimer = null;
  const prefs = storage.get(localStorage, STORAGE_KEYS.prefs) || {};
  const remotes = createRemotePlayers({ worldScene: scene, getInteriorScene: () => rpg.interiorScene, getLocalPosition: () => player.position });
  const chip = createStatusChip();
  // Every island screen asks the server something it answers from where the child is
  // standing — start a set, buy a vehicle, hand in an errand. A child taps the moment they
  // arrive, and the position only goes up twenty times a second, so the room would answer
  // from where they were a frame ago and refuse them. Say where they are first: the socket
  // keeps the order, so the move lands before the question.
  const atSend = (type, payload) => { if (room && state.mode === 'online') sendMove(); room?.send(type, payload); };
  const chat = createChat({
    onSend: (id) => room?.send('chat', { id }),
    // Free text: the page sends the words and nothing else. Whether they may be sent —
    // the length, the words, the teacher's switch — is decided on the server, and this
    // never pretends to know the answer in advance.
    onSay: (text) => room?.send('chat', { text }),
    speak, toast,
    isPaused: () => state.chatPaused && state.role !== 'teacher',
    isFree: () => state.freeChat !== false || state.role === 'teacher',
  });
  const teacher = createTeacherPanel({
    send: (msg) => room?.send('teacher', msg), toast,
    getPoint: () => ({ x: round(player.position.x, 2), z: round(player.position.z, 2) }),
    getSpace: currentSpace, isInsideBuilding: () => currentSpace().startsWith('in:'),
    getMissions: () => mission.missions,
  });
  const mission = createMissionUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
    here: () => rpg.state.current === 'errand',
    travel: (id) => rpg.fly(id),
    setBeacon: (spotId) => rpg.errand.setTarget(spotId),
  });
  const quiz = createQuizUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  const gym = createGymUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  // 英検の島. Four halls on each of three islands, and the hall a child walked into is
  // the skill they are practising — the page never picks it, and never marks it either.
  const eiken = createEikenUI({
    send: atSend,
    speak, toast, learn, isOnline: () => state.mode === 'online',
  });
  // めんせつの間. The fifth building on the same islands, and the only one that talks
  // back: the 英検 interview, with ウーピー asking and the server marking.
  const interview = createInterviewUI({
    // Sitting down and every answer are both answered from where the child is standing,
    // so say where that is first — a child who has just walked through the door would
    // otherwise be told they are not in the room.
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
  });
  // おはなし. The room a child walks into is the call they are in: the voices go browser
  // to browser and this layer only carries the introductions.
  const voice = createVoice({
    send: atSend,
    toast,
    roomLabel: (space) => (space === TALK_ISLAND ? 'おはなし島の ひろば' : rpg.insideBuilding?.spot?.name || ''),
    // Pressing the rail's call button where no call is possible takes the child to the
    // island where one always is. Flying is the game's own way of going somewhere, so it
    // is the game's own flight, not a teleport — and, like every other flight in this
    // game, it has to leave the building first. Returns whether it set off, so the button
    // does not announce a journey the game refused.
    onGoToHall: () => {
      if (rpg.state.current === TALK_ISLAND) return true;
      rpg.inside?.leave?.(true);
      return rpg.fly(TALK_ISLAND);
    },
  });
  // 英会話島: ウーピー on a screen, and a child talking back. What the page sends is what
  // the microphone heard; the aims, the coins and the XP all come back from the server.
  const conv = createConvUI({
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
  });
  const battle = createBattleUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  const dojo = createDojoUI({
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
    getWallet: () => state.wallet, getMove: () => state.move,
  });
  const petUI = createPetUI({
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
    getPet: () => state.pet, getWallet: () => state.wallet,
  });
  const daily = createDailyUI({
    send: atSend,
    isOnline: () => state.mode === 'online',
  });
  // まちづくり島. The room a child builds in is an interior scene of its own, like the
  // park's: the island, the weather and everyone else stay outside. (`room` is already
  // the Colyseus room in this file, so the child's own room is `myRoom`.)
  const myRoom = createRoom({
    player, camera, view, toast, speak, learn,
    send: atSend,
    onLeave: () => { town.hideHud(); rpg.activate('town', true); },
  });
  // ひろば. Blocks are stacked on the child's own lot in the square, which is its own
  // scene for the same reason the room is: nothing of it exists until they walk in.
  const myPlaza = createPlaza({
    player, camera, view, toast, speak, learn,
    send: atSend,
    onLeave: () => { town.hideHud(); rpg.activate('town', true); },
  });
  rpg.attachRoom(myRoom, myPlaza);
  // Walking into the doorway is what opens both of them. There is no counter inside and
  // nothing to press: the island reports the doorway, and this asks the server for what
  // is behind it.
  rpg.setDoorHandler((islandId, spot) => {
    if (islandId !== 'town' || (spot.kind !== 'door' && spot.kind !== 'plaza')) return false;
    if (state.mode !== 'online') { toast('まちづくり島は オンラインで あそべます。'); return false; }
    // Say where we are before asking to come in: the doorway was reached this frame, and
    // the server would otherwise answer from the position it was last told about.
    sendMove();
    room?.send(spot.kind === 'door' ? 'room:enter' : 'plaza:enter', {});
    return true;
  });
  const town = createTownUI({
    send: atSend,
    toast, speak, learn, isOnline: () => state.mode === 'online', room: myRoom, plaza: myPlaza,
  });
  // のりもの島. The speed a vehicle gives is applied by the world; what it is worth and
  // whether it is yours are the server's to say.
  // のりもの島のレース. The kart, the HUD and the rivals live here; the order and the
  // prizes come back from the room.
  const race = createRaceUI({
    // Everything a race asks is answered from where the kart is: the checkpoint claimed
    // this frame, the box driven over this frame, the place on the grid. Say where that
    // is before asking, or the server answers from the position it was last told about —
    // at boost speed on a slow tablet that is several kart lengths back, and the child
    // loses the lap without ever being told why.
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
    scene, player, rpg,
  });
  const ride = createRideUI({
    send: atSend,
    toast, speak, learn, isOnline: () => state.mode === 'online',
    onRiding: (id, speed) => { state.riding = id; state.speed = id ? speed : 1; },
    // The start line hands over to the race, and the race hands the best lap back.
    onRace: (what) => (what === 'quit' ? race.quit() : race.join()),
    racing: () => race.state.phase !== 'off',
  });
  // The night belongs to the world, not to the network, but its ghosts pay coins — so
  // it is created here, where the room is, and asks the server for every one of them.
  const night = createNight({
    scene, player, toast, speak, learn,
    send: atSend,
    isOnline: () => state.mode === 'online',
    serverNow: () => Date.now() + state.skew,
  });
  const lobby = createLobby({ onJoin: (opts) => connect(opts), onOffline: () => goOffline(true), defaultClass: defaultClassCode(), prefs });
  // Collect the controls into one dock so the layout is decided by flexbox, not by
  // four separately maintained offsets.
  const dock = document.createElement('div');
  dock.className = 'net-dock';
  document.body.append(dock);
  for (const sel of ['#net-status', '#net-teacher-button', '#mission-button', '#net-chat-button']) {
    const el = document.querySelector(sel);
    if (el) dock.append(el);
  }

  let ownBubble = null;
  let ownBubbleUntil = 0;

  if (!Colyseus) {
    console.warn('[net] vendor/colyseus.js is missing; multiplayer disabled');
    chip.set('offline', 'オフライン');
  }

  // ---- helpers -----------------------------------------------------------------

  function round(v, d) { const p = 10 ** d; return Math.round(v * p) / p; }
  function currentSpace() {
    if (myRoom.active) return 'in:room';
    if (myPlaza.active) return 'in:plaza';
    // Inside an island building. The name says which building on which island, and the
    // server checks it against the very place it is being asked about.
    const building = rpg.insideBuilding;
    if (building) return `in:${building.island}:${building.spot.id}`;
    const interior = rpg.adventure?.magic?.interior;
    if (interior?.active) return `in:${interior.building?.id || 'room'}`;
    return rpg.state.current || 'willow';
  }
  function joinOptions() {
    return { classCode: state.classCode, name: state.name, teacherKey: state.teacherKey || undefined, avatar: avatars.config };
  }
  function setMode(mode) {
    state.mode = mode;
    const count = room?.state?.players?.size || 0;
    if (mode === 'online') chip.set('online', 'オンライン');
    else if (mode === 'reconnecting') chip.set('reconnecting', '再接続中…');
    else if (mode === 'connecting') chip.set('reconnecting', '接続中…');
    else chip.set('offline', 'オフライン');
    chat.setAvailable(mode === 'online' || mode === 'reconnecting');
    voice.setAvailable(mode === 'online' || mode === 'reconnecting');
    daily.setOnline(mode === 'online' || mode === 'reconnecting');
    mission.setAvailable(mode === 'online' || mode === 'reconnecting');
    if (mode === 'offline') { state.progress = null; state.skew = 0; night.setGhosts([]); state.riding = ''; state.speed = 1; race.quit(); if (myRoom.active) myRoom.leave(true); if (myPlaza.active) myPlaza.leave(true); town.hideHud(); voice.setMode('off'); }
    teacher.setAvailable((mode === 'online' || mode === 'reconnecting') && state.role === 'teacher');
  }
  function saveSession() {
    storage.set(sessionStorage, STORAGE_KEYS.session, { name: state.name, classCode: state.classCode, teacherKey: state.teacherKey, token: room?.reconnectionToken || '', sessionId: state.sessionId });
    storage.set(localStorage, STORAGE_KEYS.prefs, { name: state.name, classCode: state.classCode });
  }
  function clearSession() { storage.remove(sessionStorage, STORAGE_KEYS.session); }

  // ---- connection lifecycle ---------------------------------------------------------

  async function connect({ name, classCode, teacherKey }, { silent = false } = {}) {
    if (!Colyseus) { lobby.error('通信ライブラリが読み込めませんでした。'); return; }
    state.name = name; state.classCode = classCode || 'default'; state.teacherKey = teacherKey || '';
    state.intentionalLeave = false;
    state.attempts = 0;
    lobby.busy(true);
    setMode('connecting');
    try {
      client = client || new Colyseus.Client(resolveServerUrl());
      const r = await client.joinOrCreate('class', joinOptions());
      bind(r, false);
      lobby.close();
    } catch (err) {
      setMode('offline');
      const msg = friendlyError(err);
      if (silent) toast(msg); else lobby.open({ error: msg });
    }
  }

  function friendlyError(err) {
    const code = err?.code;
    const text = String(err?.message || err || '');
    if (code === 4001 || /name in use/.test(text)) return 'その名前はもう使われています。別の名前にしてね。';
    if (code === 4000 || /name required/.test(text)) return 'なまえを入れてね。';
    if (code === 4002 || /class is full/.test(text)) return 'このクラスは満員です。先生に伝えてください。';
    // 入場ゲート: the class register did not have this name. Say what to check, not what
    // went wrong - a child cannot fix a register.
    if (code === 4004 || /register/.test(text)) return 'この名前は このクラスの めいぼに ありません。クラスコードと なまえを たしかめて、先生に 聞いてください。';
    if (/Failed to fetch|NetworkError|Load failed|ECONN|timeout/i.test(text)) return 'サーバーにつながりません。Wi-Fi を確認してください。';
    return `接続できませんでした（${text.slice(0, 80)}）`;
  }

  function bind(r, viaToken) {
    room = r;
    state.sessionId = r.sessionId;
    state.attempts = 0;
    let welcomed = false;

    r.onMessage('welcome', (m) => {
      if (m.world) { state.skew = m.world.now - Date.now(); night.setPhase(m.world); }
      // The block list is also the palette's colours, so it is worth the one message.
      town.prime();
      welcomed = true;
      state.role = m.role;
      state.chatPaused = !!m.chatPaused;
      state.teacherId = m.teacherId || '';
      setMode('online');
      saveSession();
      chat.setPaused();
      teacher.setChatPaused(state.chatPaused);
      teacher.setVoice(r.state?.voice);
      if (m.wallet) applyWallet(m.wallet);
      applyProgress(m.progress);
      mission.setClassMission(m.missionId);
      mission.setDone(m.missionsDone);
      mission.restore(m.errand);
      quiz.restore(m.quiz);
      gym.restore(m.gym);
      battle.restore(m.battle);
      state.move = m.move || null;
      state.pet = m.pet || null;
      if (!viaToken) {
        restoreProgress(m.progressJson);
        if (m.position && m.restored) teleportTo(m.position, 'restore');
        toast(m.role === 'teacher' ? `先生としてクラス「${m.classCode}」に参加しました。` : `クラス「${m.classCode}」に参加しました！`);
      } else {
        toast('再接続しました。');
      }
      state.lastSent.s = ''; // force a fresh position sample
    });
    r.onMessage('wallet', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.ok === false && m.error) toast(walletError(m.error)); });
    r.onMessage('answer:result', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress, m.levels); if (m.ok === false && m.error !== 'too fast') console.warn('[net] answer rejected', m); });
    r.onMessage('teleport', (m) => { teleportTo(m, m.reason); toast(m.reason === 'gather' ? `${m.by} 先生のところに集合！` : `${m.by} 先生が移動させました。`); });
    r.onMessage('call', (m) => showCall(m));
    r.onMessage('notice', (m) => toast(m.text));
    r.onMessage('chat', (m) => onChat(m));
    r.onMessage('chat:blocked', (m) => chat.blocked(m.reason, m.max));
    r.onMessage('roster', (m) => teacher.onRoster(m));
    r.onMessage('teacher:ack', (m) => teacher.onAck(m));
    r.onMessage('xp', (m) => applyProgress(m, m.levels));
    r.onMessage('quiz:question', (m) => quiz.onQuestion(m));
    r.onMessage('quiz:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); quiz.onResult(m); });
    r.onMessage('quiz:closed', (m) => quiz.onClosed(m));
    r.onMessage('quiz:error', (m) => quiz.onError(m));
    r.onMessage('gym:question', (m) => gym.onQuestion(m));
    r.onMessage('gym:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); gym.onResult(m); });
    r.onMessage('gym:closed', (m) => gym.onClosed(m));
    r.onMessage('gym:error', (m) => gym.onError(m));
    r.onMessage('eiken:question', (m) => eiken.onQuestion(m));
    r.onMessage('eiken:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); eiken.onResult(m); });
    r.onMessage('eiken:closed', (m) => eiken.onClosed(m));
    r.onMessage('eiken:error', (m) => eiken.onError(m));
    r.onMessage('interview:card', (m) => interview.onCard(m));
    r.onMessage('interview:turn', (m) => { applyProgress(m.progress); interview.onTurn(m); });
    r.onMessage('interview:done', (m) => { applyWallet(m.wallet); applyProgress(m.progress); interview.onDone(m); });
    r.onMessage('interview:closed', (m) => interview.onClosed(m));
    r.onMessage('interview:error', (m) => interview.onError(m));
    r.onMessage('conv:opened', (m) => conv.onOpened(m));
    r.onMessage('conv:reply', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); conv.onReply(m); });
    r.onMessage('conv:closed', (m) => conv.onClosed(m));
    r.onMessage('conv:error', (m) => conv.onError(m));
    r.onMessage('race:grid', (m) => { race.onGrid(m); rpg.ride.setNext(m.gates?.[0]?.id || ''); });
    r.onMessage('race:field', (m) => race.onField({ ...m, you: state.sessionId }));
    r.onMessage('race:lights', (m) => race.onLights(m));
    r.onMessage('race:go', (m) => race.onGo(m));
    r.onMessage('race:gate', (m) => { race.onGate(m); rpg.ride.setNext(m.next || ''); });
    r.onMessage('race:box', (m) => race.onBox(m));
    r.onMessage('race:boost', (m) => { applyProgress(m.progress); race.onBoost(m); });
    r.onMessage('race:finished', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); ride.setBest(m.bestMs || m.best || 0); rpg.ride.setNext(''); race.onFinished(m); });
    r.onMessage('race:over', (m) => race.onOver(m));
    r.onMessage('race:closed', (m) => { race.onClosed(m); rpg.ride.setNext(''); });
    r.onMessage('race:error', (m) => race.onError(m));
    r.onMessage('voice:room', (m) => voice.onRoom(m));
    r.onMessage('voice:peer', (m) => voice.onPeer(m));
    r.onMessage('voice:closed', (m) => voice.onClosed(m));
    r.onMessage('voice:error', (m) => voice.onError(m));
    r.onMessage('voice:msg', (m) => voice.onMsg(m));
    r.onMessage('voice:token', (m) => voice.onToken(m));
    r.onMessage('rtc:signal', (m) => voice.onSignal(m));
    r.onMessage('battle:state', (m) => battle.onState(m));
    r.onMessage('battle:quiz', (m) => battle.onQuiz(m));
    r.onMessage('battle:turn', (m) => { if (m.wallet) applyWallet(m.wallet); battle.onTurn(m); });
    r.onMessage('battle:closed', (m) => battle.onClosed(m));
    r.onMessage('battle:error', (m) => battle.onError(m));
    r.onMessage('fish:learned', (m) => { state.move = m.move; if (m.wallet) applyWallet(m.wallet); dojo.onLearned(m); });
    r.onMessage('fish:error', (m) => dojo.onError(m));
    r.onMessage('pet:hatched', (m) => { state.pet = m.pet; if (m.wallet) applyWallet(m.wallet); petUI.onHatched(m); });
    r.onMessage('pet:acted', (m) => { state.pet = m.pet; if (m.wallet) applyWallet(m.wallet); petUI.onActed(m); });
    r.onMessage('pet:error', (m) => petUI.onError(m));
    r.onMessage('block:shop', (m) => town.onShop(m));
    r.onMessage('block:bought', (m) => { if (m.wallet) applyWallet(m.wallet); town.onBought(m); });
    r.onMessage('block:error', (m) => town.onError(m));
    r.onMessage('room:state', (m) => town.onRoomState(m));
    r.onMessage('room:placed', (m) => town.onPlaced(m));
    r.onMessage('room:removed', (m) => town.onRemoved(m));
    r.onMessage('room:moved', (m) => { if (m.wallet) applyWallet(m.wallet); town.onMoved(m); });
    r.onMessage('room:error', (m) => town.onError(m));
    r.onMessage('prop:shop', (m) => town.onPropShop(m));
    r.onMessage('prop:bought', (m) => { if (m.wallet) applyWallet(m.wallet); town.onPropBought(m); });
    r.onMessage('prop:error', (m) => town.onError(m));
    r.onMessage('plaza:state', (m) => town.onPlazaState(m));
    r.onMessage('plaza:placed', (m) => town.onPlazaPlaced(m));
    r.onMessage('plaza:removed', (m) => town.onPlazaRemoved(m));
    r.onMessage('plaza:error', (m) => town.onPlazaError(m));
    r.onMessage('ride:garage', (m) => ride.onGarage(m));
    r.onMessage('ride:bought', (m) => { if (m.wallet) applyWallet(m.wallet); ride.onBought(m); });
    r.onMessage('ride:error', (m) => ride.onError(m));
    r.onMessage('world:phase', (m) => night.setPhase(m));
    r.onMessage('night:ghosts', (m) => { night.setGhosts(m.ghosts); if (m.caught) night.pop(m.caught); });
    r.onMessage('ghost:caught', (m) => { if (m.wallet) applyWallet(m.wallet); night.onCaught(m); });
    r.onMessage('ghost:error', (m) => night.onError(m));
    r.onMessage('login:bonus', (m) => { if (m.wallet) applyWallet(m.wallet); daily.onBonus(m); });
    r.onMessage('rank', (m) => daily.onRank(m));
    r.onMessage('levelup', (m) => toast(`${m.name} が レベル ${m.level} になりました！`));
    r.onMessage('mission:opened', (m) => mission.onOpened(m));
    r.onMessage('mission:arrived', (m) => mission.onArrived(m));
    r.onMessage('mission:turn', (m) => { applyProgress(m.progress, m.levels); mission.onTurn(m); });
    r.onMessage('mission:delivered', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); mission.onDelivered(m); });
    r.onMessage('mission:closed', (m) => mission.onClosed(m));
    r.onMessage('mission:error', (m) => mission.onError(m));
    r.onMessage('progress:ack', () => {});
    r.onMessage('pong', () => { clearTimeout(probeTimer); probeTimer = null; });

    const seen = new Map();
    r.state.players.onAdd((p, id) => {
      if (id === r.sessionId) { chip.count(r.state.players.size); return; }
      remotes.upsert(id, snapshot(p));
      remotes.pushSample(id, { x: p.x, z: p.z, yaw: p.yaw });
      seen.set(id, { x: p.x, z: p.z, yaw: p.yaw });
      p.onChange(() => {
        remotes.upsert(id, snapshot(p));
        const prev = seen.get(id);
        if (!prev || prev.x !== p.x || prev.z !== p.z || prev.yaw !== p.yaw) {
          remotes.pushSample(id, { x: p.x, z: p.z, yaw: p.yaw });
          seen.set(id, { x: p.x, z: p.z, yaw: p.yaw });
        }
      });
      chip.count(r.state.players.size);
    });
    r.state.players.onRemove((p, id) => { remotes.remove(id); seen.delete(id); chip.count(r.state.players.size); });
    r.state.listen('chatPaused', (v) => { state.chatPaused = !!v; chat.setPaused(); teacher.setChatPaused(!!v); });
    r.state.listen('freeChat', (v) => { state.freeChat = v !== false; chat.setFree(); voice.setFree(state.freeChat); teacher.setFree(state.freeChat); });
    r.state.listen('voice', (v) => { voice.setMode(v); teacher.setVoice(v); });
    r.state.listen('stageOpen', (v) => voice.setStage(v));
    r.state.listen('teacherId', (v) => { state.teacherId = v || ''; });
    r.state.listen('missionId', (v) => { mission.setClassMission(v); teacher.setMission(v); });

    r.onError((code, message) => console.warn('[net] room error', code, message));
    r.onLeave((code) => {
      clearTimeout(probeTimer); probeTimer = null;
      if (room !== r) return;
      room = null;
      if (state.intentionalLeave) { setMode('offline'); return; }
      console.info('[net] connection lost', code);
      setMode('reconnecting');
      scheduleReconnect(0);
    });
    // Safety net: if no welcome arrives (should not happen), do not stay "connecting" forever.
    setTimeout(() => { if (room === r && !welcomed) { console.warn('[net] no welcome received; retrying'); r.leave(false); } }, 8000);
  }

  function snapshot(p) { return { name: p.name, avatar: p.avatar, role: p.role, space: p.space, x: p.x, z: p.z, yaw: p.yaw, anim: p.anim, connected: p.connected }; }

  function scheduleReconnect(delay) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(attemptReconnect, delay);
  }

  async function attemptReconnect() {
    if (state.mode !== 'reconnecting' || room) return;
    const session = storage.get(sessionStorage, STORAGE_KEYS.session) || {};
    try {
      let r = null;
      if (session.token) {
        try { r = await client.reconnect(session.token); } catch (err) { console.info('[net] token reconnect failed, joining by name:', err?.message || err); }
      }
      const viaToken = !!r;
      if (!r) r = await client.joinOrCreate('class', joinOptions());
      bind(r, viaToken);
    } catch (err) {
      state.attempts += 1;
      if (state.attempts >= NET.RECONNECT_MAX_ATTEMPTS) {
        setMode('offline');
        lobby.open({ error: '再接続できませんでした。もう一度参加してください。' });
        return;
      }
      const delay = NET.RECONNECT_DELAYS_MS[Math.min(state.attempts, NET.RECONNECT_DELAYS_MS.length - 1)];
      console.info(`[net] reconnect attempt ${state.attempts} failed (${err?.message || err}); retry in ${delay}ms`);
      scheduleReconnect(delay);
    }
  }

  // Called when the page becomes visible / online again. Proves the socket within
  // RESUME_PROBE_TIMEOUT_MS or forces a reconnect, so resume-after-lock stays under 3 s.
  function resume() {
    state.resumedAt = performance.now();
    if (state.mode === 'reconnecting') { scheduleReconnect(0); return; }
    if (state.mode !== 'online' || !room) return;
    if (!room.connection?.isOpen) { room.leave(false); return; }
    if (probeTimer) return;
    room.send('ping', Date.now());
    probeTimer = setTimeout(() => {
      probeTimer = null;
      console.info('[net] resume probe timed out; forcing reconnect');
      room?.leave(false);
    }, NET.RESUME_PROBE_TIMEOUT_MS);
  }

  function goOffline(fromLobby = false) {
    state.intentionalLeave = true;
    clearTimeout(reconnectTimer);
    clearSession();
    const r = room; room = null;
    r?.leave(true);
    remotes.clear();
    setMode('offline');
    if (fromLobby) toast('オフラインで遊びます。右上のボタンからいつでも参加できます。');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
    else { state.hiddenAt = performance.now(); syncProgress(true); }
  });
  addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  addEventListener('pagehide', () => { syncProgress(true); });
  addEventListener('online', () => resume());
  addEventListener('offline', () => { if (state.mode === 'online') chip.set('reconnecting', 'オフライン検出…'); });

  // ---- server-authoritative wallet & progress ---------------------------------------

  // Level and XP are the server's, for the same reason coins are: they end up on a
  // parent's report. Offline the local reckoning still runs; online this wins.
  function applyProgress(p, levels = 0) {
    if (!p || typeof p !== 'object') return;
    state.progress = p;
    writeProgress();
    if (levels > 0) toast(`レベル ${p.level} になった！`);
  }

  function writeProgress() {
    const p = state.progress;
    if (!p || state.mode === 'offline') return;
    const level = document.querySelector('#level');
    const xp = document.querySelector('#xp');
    // Rewritten every frame because the offline reckoning in game.js and rpg.js also
    // owns these two elements and repaints them on its own schedule.
    if (level && level.textContent !== String(p.level)) level.textContent = String(p.level);
    const total = p.total.toLocaleString();
    if (xp && xp.textContent !== total) xp.textContent = total;
  }

  function applyWallet(w) {
    state.wallet = w;
    try {
      fishing.store.reconcile?.(w);
      fishing.refreshWallet?.();
    } catch (err) { console.warn('[net] wallet reconcile failed', err); }
  }
  function walletError(e) {
    return { 'not enough coins': 'コインが足りません（サーバー確認）。', 'already owned': 'すでに持っています。', 'nothing to sell': '売れる魚がありません（サーバー確認）。' }[e] || `サーバーが処理できませんでした: ${e}`;
  }
  function restoreProgress(json) {
    if (!json) return;
    try {
      const local = rpg.adventure?.progress?.state;
      if (local?.starter) return; // this device already has a journey; keep it
      const data = JSON.parse(json);
      rpg.adventure.progress.restore(data);
      rpg.activate('willow', true, true);
      rpg.syncBuddy?.(true);
      toast('前回の冒険の記録をサーバーから復元しました。');
    } catch (err) { console.warn('[net] progress restore failed', err); }
  }
  function syncProgress(force = false) {
    if (!room || state.mode !== 'online' || !rpg.adventure?.progress) return;
    const now = performance.now();
    if (!force && now - state.lastProgressAt < NET.PROGRESS_SYNC_MS) return;
    let json = '';
    try { json = JSON.stringify(rpg.adventure.progress.backup()); } catch { return; }
    state.lastProgressAt = now;
    if (json === state.lastProgressJson) return;
    state.lastProgressJson = json;
    room.send('progress', { json });
  }
  hooks.on('answer', ({ q, c }) => { if (room && state.mode === 'online') room.send('answer', { q, c }); });
  hooks.on('economy', (op) => { if (room && state.mode === 'online') room.send('economy', op); });

  // ---- teleport (teacher commands, restore) -----------------------------------------

  function teleportTo(target, reason = 'move') {
    if (!target || typeof target.space !== 'string' || target.space.startsWith('in:')) return false;
    state.pendingTeleport = { space: target.space, x: Number(target.x) || 0, z: Number(target.z) || 0, reason };
    return applyPendingTeleport();
  }
  function applyPendingTeleport() {
    const t = state.pendingTeleport;
    if (!t) return false;
    if (park.state.busy) return false; // mid-ride: applied on the next frame it is free
    try {
      for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby') d.close();
      if (rpg.isOpen) rpg.close();
      if (fishing.state.busy) fishing.cancel?.();
      if (rpg.adventure?.magic?.interior?.active) rpg.leaveSanctuary();
      if (rpg.state.mode === 'flight') rpg.finishFlight();
      if (rpg.state.current !== t.space) rpg.activate(t.space, true, true);
      player.position.set(t.x, 0, t.z);
      state.lastSent.s = '';
    } catch (err) { console.warn('[net] teleport failed', err); }
    state.pendingTeleport = null;
    return true;
  }
  function showCall(m) {
    let el = $('#net-call');
    if (!el) { el = document.createElement('div'); el.id = 'net-call'; document.body.append(el); }
    el.innerHTML = `<span>📢 ${escapeHtml(m.by)} 先生が呼んでいます</span><button type="button" id="net-call-go">先生のところへ行く</button><button type="button" class="secondary" id="net-call-later">あとで</button>`;
    $('#net-call-go').onclick = () => { teleportTo(m, 'call'); el.remove(); };
    $('#net-call-later').onclick = () => el.remove();
    speak?.('Please come here!');
  }

  // ---- chat -----------------------------------------------------------------------

  function onChat(m) {
    const mine = m.from === state.sessionId;
    chat.receive({ name: m.name, id: m.id, text: m.text, mine });
    // Over the head as well as in the panel — a written word belongs to the child who
    // wrote it, whether they tapped a phrase or typed their own.
    const bubble = typeof m.text === 'string' && m.text ? m.text : chat.phrase(m.id)?.en;
    if (!bubble) return;
    if (mine) {
      if (ownBubble) player.remove(ownBubble);
      ownBubble = remotes.textSprite(bubble, { bg: '#fffaf0', color: '#263d33', size: 28, width: 640, scale: 0.62 });
      ownBubble.position.set(0, 3.95, 0);
      player.add(ownBubble);
      ownBubbleUntil = performance.now() + NET.CHAT_BUBBLE_MS;
    } else {
      remotes.showBubble(m.from, bubble);
    }
  }

  // Where the child is, now. Sent twenty times a second by the frame below, and by hand
  // just before anything that the server answers by asking where they are standing: the
  // socket keeps the order, so the position lands first and the question is asked from
  // the right place rather than from wherever they were a tenth of a second ago.
  function sendMove(anim = 'idle') {
    if (!room || state.mode !== 'online') return;
    const s = currentSpace();
    const x = round(player.position.x, 2), z = round(player.position.z, 2), r = round(player.rotation.y, 3);
    room.send('move', { s, x, z, r, a: anim, t: Date.now() % 4294967296 });
    state.lastSent = { s, x, z, r, a: anim };
    state.lastSendAt = performance.now();
  }

  // ---- per-frame ----------------------------------------------------------------

  function update(t, dt, { moving = false, running = false } = {}) {
    const now = performance.now();
    if (state.pendingTeleport) applyPendingTeleport();
    if (ownBubble && now > ownBubbleUntil) { player.remove(ownBubble); ownBubble = null; }
    remotes.update(t, currentSpace());
    writeProgress();
    if (!room || state.mode !== 'online') return;
    const anim = rpg.state.mode === 'flight' ? 'fly' : moving ? (running ? 'run' : 'walk') : 'idle';
    // Arriving on (or leaving) the island changes what the errand tracker has to say.
    const space = currentSpace();
    if (space !== state.lastSpace) { state.lastSpace = space; mission.refreshHud(); }
    voice.setMode(room.state?.voice);
    voice.setSpace(space);
    if (now - state.lastSendAt >= 1000 / NET.SEND_HZ) {
      const s = currentSpace();
      const x = round(player.position.x, 2), z = round(player.position.z, 2), r = round(player.rotation.y, 3);
      const last = state.lastSent;
      const changed = s !== last.s || x !== last.x || z !== last.z || r !== last.r || anim !== last.a;
      if (changed || now - state.lastSendAt >= NET.HEARTBEAT_MS) sendMove(anim);
    }
    const avatarJson = JSON.stringify(avatars.config);
    if (avatarJson !== state.lastAvatarJson) { state.lastAvatarJson = avatarJson; room.send('profile', { avatar: avatars.config }); }
    syncProgress(false);
  }

  // ---- boot ---------------------------------------------------------------------

  function createStatusChip() {
    const el = document.createElement('button');
    el.id = 'net-status';
    el.type = 'button';
    el.className = 'offline';
    el.innerHTML = '<i></i><b class="net-count" hidden></b><span class="net-label">オフライン</span>';
    el.onclick = () => {
      if (state.mode === 'online' || state.mode === 'reconnecting') {
        if (confirm('クラスから退出してオフラインで遊びますか？')) goOffline(true);
      } else lobby.open({ name: state.name });
    };
    document.body.append(el);
    // The count lives in its own element so narrow screens can hide the words
    // and still show how many people are in the room (see mobile.css).
    const write = (cls, label, n) => {
      el.className = cls;
      el.querySelector('.net-label').textContent = label;
      const b = el.querySelector('.net-count');
      b.textContent = n == null ? '' : `${n}人`;
      b.hidden = n == null;
    };
    return {
      set(cls, text) { write(cls, text, cls === 'online' ? (room?.state?.players?.size ?? 1) : null); },
      count(n) { if (state.mode === 'online') write('online', 'オンライン', n); },
      refresh() { if (state.mode === 'online' && room) write('online', 'オンライン', room.state.players.size); },
    };
  }

  function boot() {
    if (!Colyseus) return;
    const session = storage.get(sessionStorage, STORAGE_KEYS.session);
    const start = () => {
      if (session?.name) {
        // Same tab reloaded (or restored by Safari): rejoin automatically.
        state.name = session.name; state.classCode = session.classCode || 'default'; state.teacherKey = session.teacherKey || '';
        client = new Colyseus.Client(resolveServerUrl());
        setMode('reconnecting');
        scheduleReconnect(0);
      } else {
        lobby.open();
      }
    };
    if (avatars.first) $('#avatar-dialog')?.addEventListener('close', start, { once: true });
    else start();
  }
  boot();

  return {
    update, teleportTo, currentSpace,
    get online() { return state.mode === 'online'; },
    get role() { return state.role; },
    get mode() { return state.mode; },
    get sessionId() { return state.sessionId; },
    get room() { return room; },
    get remotes() { return remotes; },
    openLobby: () => lobby.open({ name: state.name }),
    openMission: () => mission.open(),
    errandInteract: () => { const near = rpg.errandNearby(); if (near) mission.interact(near.spot); },
    errandLabel: (spot) => mission.label(spot) || `${spot.character} と 話す`,
    schoolInteract: () => {
      const near = rpg.schoolNearby();
      if (!near) return;
      if (near.spot.kind === 'gym') gym.enter(near.spot); else quiz.enter(near.spot);
    },
    schoolLabel: (spot) => (spot.kind === 'gym' ? gym.label(spot) : quiz.label(spot)),
    convInteract: () => {
      const near = rpg.convNearby();
      if (near) conv.enter(near.spot.id);
    },
    convLabel: (spot) => conv.label(spot),
    eikenInteract: () => {
      const near = rpg.eikenNearby();
      // Four of the five buildings are a skill; the fifth is the interview room, and
      // which one a child walked into is which screen opens. There is no menu.
      if (near?.spot?.kind === 'interview') interview.enter(near.island);
      else if (near) eiken.enter(near.spot, near.island);
    },
    eikenLabel: (spot) => (spot?.kind === 'interview' ? interview.label() : eiken.label(spot)),
    arenaInteract: () => {
      const near = rpg.arenaNearby();
      if (!near) return;
      if (near.spot.kind === 'dojo') dojo.enter(near.spot); else battle.enter(near.spot);
    },
    arenaLabel: (spot) => (spot.kind === 'dojo' ? dojo.label(spot) : battle.label(spot)),
    petInteract: () => { const near = rpg.petNearby(); if (near) petUI.enter(near.spot); },
    petLabel: (spot) => petUI.label(spot),
    town, myRoom, myPlaza, voice, conv, race,
    // Whichever of the two a child is standing in. The page's E and Q keys work on it.
    get builder() { return myRoom.active ? myRoom : myPlaza.active ? myPlaza : null; },
    townInteract: () => { const near = rpg.townNearby(); if (near) town.enter(near.spot); },
    townLabel: (spot) => town.label(spot),
    ride,
    rideInteract: () => { const near = rpg.rideNearby(); if (near) ride.enter(near.spot); },
    rideLabel: (spot) => ride.label(spot),
    // The world tells us when the avatar drives into a checkpoint ring.
    // How fast this child moves: 1 on foot, more on a vehicle they own.
    speed: () => (state.mode === 'online' ? state.speed : 1),
    night,
    // The world's own time. Offline this is simply the device's clock, so the sky still
    // turns for a child playing alone.
    serverNow: () => Date.now() + state.skew,
    ghostNearby: () => night.nearby(currentSpace()),
    ghostLabel: (near) => night.label(near),
    ghostSwing: () => night.swing(currentSpace()),
    leave: () => goOffline(true),
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
