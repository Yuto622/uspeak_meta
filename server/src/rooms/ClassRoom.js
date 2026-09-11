// One ClassRoom = one class. Positions are client-declared; coins, catches, answers
// and learning logs are decided here and only here.
import { timingSafeEqual } from 'node:crypto';
import { Room, ServerError, matchMaker } from '../colyseus.js';
import { RoomState, Player, ANIMS } from '../schema.js';
import { config } from '../config.js';
import { judge, JudgeError } from '../game/judge.js';
import { applyOp, sanitizeWallet, EconomyError } from '../game/economy.js';
import { blankPlayerRecord } from '../store/records.js';
import { PHRASE_IDS } from '../phrases.js';
import { MISSIONS } from '../game/missions.js';
import { blankProgress, sanitizeProgress, grantXp, totalXp, xpToNext, REWARDS, eikenReward } from '../game/progression.js';
import { SCHOOL, createSession, questionPayload, answerSession, QUESTIONS_PER_SESSION } from '../game/wordquiz.js';
import { MODES as GYM_MODES, createSet, questionPayload as gymPayload, answerSet } from '../game/gym.js';
import { ARENA, createBattle, statePayload, quizPayload, chooseWaza, answerQuiz, BattleError, DAILY_CAP } from '../game/battle.js';
import { moveForFish, sanitizeMove } from '../game/fish-moves.js';
import { PET_ISLAND, EGG_COST, hatch, sanitizePet, petPayload, act as petAct, PetError } from '../game/pets.js';
import { phaseAt } from '../../../client/dist/world-clock.js';
import { NIGHT, REACH as GHOST_REACH, COINS as GHOST_COINS, DAILY_CAP as GHOST_CAP, RESPAWN_MS, ghostPayload, sanitizeCaps, roomLeft } from '../game/night.js';
import { EIKEN, ISLANDS as EIKEN_ISLANDS, EIKEN_CAP, createSession as createEikenSet, questionPayload as eikenPayload, answerSession as answerEikenSet, EikenError } from '../game/eiken.js';
import { TOWN_ISLAND, BLOCKS, PROPS, PLAZA, ROOMS, roomOfTier, nextRoom, blockPayload, propPayload, sanitizeBlocks, sanitizeProps, sanitizeRoom, sanitizePlaza, roomPayload, plazaPayload, place as placeBlock, remove as removeBlock, placeProp, removeProp, TownError } from '../game/town.js';
import { RIDE, ISLAND as RIDE_ISLAND, COURSE, COURSE_CAP, vehiclePayload, sanitizeGarage, sanitizeRiding, startLap, crossGate } from '../game/vehicles.js';
import { claimLogin, sanitizeLogin, sanitizeWeek, addWeekXp, weekIndex, daysLeftInWeek, seasonFor, LOGIN_REWARDS, CYCLE } from '../game/daily.js';
import { createGate } from '../game/gate.js';
import { reportPath } from '../game/report.js';
import { createTutor } from '../ai/tutor.js';
import { log } from '../log.js';

export const ERR = { NAME_REQUIRED: 4000, NAME_IN_USE: 4001, ROOM_FULL: 4002, NOT_ON_ROSTER: 4004 };
const POSITION_RESTORE_MS = 2 * 60 * 60 * 1000; // restore last position only within a lesson window
// A little more room than the client shows the prompt in, so a position that arrived a
// frame late never refuses a child who is visibly standing at the counter.
const SPOT_SLACK = 1.5;
const PERFECT_BONUS_COINS = 10;   // Roblox: COIN_PERFECT_BONUS, for a clean ten
const STALE_MOVE_MS = 5000;
const GHOST_MS = 3000; // silent connected seat considered dead (heartbeat is 500 ms)
const PERSIST_ALL_MS = 30000;
const WORLD_LIMIT = 600;
const AVATAR_IDS = ['kai', 'mia', 'ren', 'leo', 'aya', 'noa', 'nova', 'bolt'];

export function sanitizeName(raw) {
  return String(raw ?? '').normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}|]/gu, '')
    .replace(/[^\p{L}\p{N}\p{M} _\-ー・]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

export function sanitizeClassCode(raw) {
  const s = String(raw ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  return s || 'default';
}

export function sanitizeAvatar(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const out = { id: AVATAR_IDS.includes(a.id) ? a.id : 'kai' };
  for (const k of ['skin', 'shirt']) if (Number.isInteger(a[k]) && a[k] >= 0 && a[k] <= 0xffffff) out[k] = a[k];
  return JSON.stringify(out);
}

function isTeacherKey(candidate) {
  if (!config.teacherKey || typeof candidate !== 'string' || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.teacherKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const parseJson = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };

export class ClassRoom extends Room {
  async onCreate(options) {
    this.store = options.store;
    this.classCode = sanitizeClassCode(options.classCode);
    this.maxClients = config.maxClients;
    // 1 room = 1 class: when the class room is full, joinOrCreate must fail instead of
    // silently opening a second room for the same class.
    const existing = await matchMaker.query({ name: 'class', classCode: options.classCode });
    if (existing.some((r) => r.roomId !== this.roomId)) throw new ServerError(ERR.ROOM_FULL, 'class is full');
    this.setMetadata({ classCode: this.classCode });
    this.setState(new RoomState());
    this.state.classCode = this.classCode;
    this.setPatchRate(config.patchRateMs);
    this.priv = new Map(); // sessionId -> private server-side record

    this.onMessage('move', (client, msg) => this.onMove(client, msg));
    this.onMessage('answer', (client, msg) => this.onAnswer(client, msg));
    this.onMessage('economy', (client, msg) => this.onEconomy(client, msg));
    this.onMessage('progress', (client, msg) => this.onProgress(client, msg));
    this.onMessage('chat', (client, msg) => this.onChat(client, msg));
    this.onMessage('teacher', (client, msg) => this.onTeacher(client, msg));
    this.onMessage('mission:start', (client, msg) => this.onMissionStart(client, msg));
    this.onMessage('mission:arrive', (client) => this.onMissionArrive(client));
    this.onMessage('mission:say', (client, msg) => this.onMissionSay(client, msg));
    this.onMessage('mission:deliver', (client) => this.onMissionDeliver(client));
    this.onMessage('mission:quit', (client) => this.onMissionQuit(client));
    this.onMessage('quiz:start', (client, msg) => this.onQuizStart(client, msg));
    this.onMessage('quiz:answer', (client, msg) => this.onQuizAnswer(client, msg));
    this.onMessage('quiz:quit', (client) => this.onQuizQuit(client));
    this.onMessage('gym:start', (client, msg) => this.onGymStart(client, msg));
    this.onMessage('gym:answer', (client, msg) => this.onGymAnswer(client, msg));
    this.onMessage('gym:quit', (client) => this.onGymQuit(client));
    this.onMessage('eiken:start', (client, msg) => this.onEikenStart(client, msg));
    this.onMessage('eiken:answer', (client, msg) => this.onEikenAnswer(client, msg));
    this.onMessage('eiken:quit', (client) => this.onEikenQuit(client));
    this.onMessage('battle:start', (client, msg) => this.onBattleStart(client, msg));
    this.onMessage('battle:waza', (client, msg) => this.onBattleWaza(client, msg));
    this.onMessage('battle:answer', (client, msg) => this.onBattleAnswer(client, msg));
    this.onMessage('battle:quit', (client) => this.onBattleQuit(client));
    this.onMessage('fish:feed', (client, msg) => this.onFishFeed(client, msg));
    this.onMessage('pet:hatch', (client) => this.onPetHatch(client));
    this.onMessage('pet:act', (client, msg) => this.onPetAct(client, msg));
    this.onMessage('rank', (client) => this.onRank(client));
    this.onMessage('ghost:hit', (client, msg) => this.onGhostHit(client, msg));
    this.onMessage('block:list', (client) => client.send('block:shop', this.shopPayload(client.sessionId)));
    this.onMessage('block:buy', (client, msg) => this.onBlockBuy(client, msg));
    this.onMessage('room:enter', (client) => this.onRoomEnter(client));
    this.onMessage('room:place', (client, msg) => this.onRoomPlace(client, msg));
    this.onMessage('room:remove', (client, msg) => this.onRoomRemove(client, msg));
    this.onMessage('room:move', (client) => this.onRoomMove(client));
    this.onMessage('prop:list', (client) => client.send('prop:shop', this.propShopPayload(client.sessionId)));
    this.onMessage('prop:buy', (client, msg) => this.onPropBuy(client, msg));
    this.onMessage('plaza:enter', (client) => this.onPlazaEnter(client));
    this.onMessage('plaza:place', (client, msg) => this.onPlazaPlace(client, msg));
    this.onMessage('plaza:remove', (client, msg) => this.onPlazaRemove(client, msg));
    this.onMessage('ride:list', (client) => client.send('ride:garage', this.garagePayload(client.sessionId)));
    this.onMessage('ride:buy', (client, msg) => this.onRideBuy(client, msg));
    this.onMessage('ride:equip', (client, msg) => this.onRideEquip(client, msg));
    this.onMessage('course:start', (client) => this.onCourseStart(client));
    this.onMessage('course:gate', (client, msg) => this.onCourseGate(client, msg));
    this.onMessage('profile', (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.avatar = sanitizeAvatar(msg?.avatar);
    });
    this.onMessage('wallet:get', (client) => client.send('wallet', { ok: true, op: 'get', ...this.walletPayload(client.sessionId) }));
    this.onMessage('ping', (client, t) => client.send('pong', { t, server: Date.now() }));

    this.tutor = options.tutor || createTutor();
    // The register is read once per class and cached; the gate below decides who is let
    // in, and in the default 'open' mode it never even looks.
    this.gate = options.gate || createGate({
      store: this.store, mode: config.accessMode, ttlMs: config.rosterTtlMs,
      snapshotPath: `${config.dataDir.replace(/\/$/, '')}/roster-snapshot.json`, log,
    });
    this.lastPersistAll = Date.now();
    // The sky is a function of the wall clock, so there is nothing to start or store —
    // only the moment the phase turns has to be noticed, to put the ghosts out.
    this.phase = phaseAt(this.worldNow()).id;
    this.ghostsOut = new Set(this.phase === 'night' ? NIGHT.ids : []);
    this.ghostBack = new Map();   // id -> when it drifts back, while the night lasts
    this.setSimulationInterval(() => this.tick(), 1000);
    log.info(`[room ${this.roomId}] created class=${this.classCode} max=${this.maxClients} patch=${config.patchRateMs}ms`);
  }

  // ---- lifecycle -------------------------------------------------------------

  async onAuth(client, options) {
    const name = sanitizeName(options?.name);
    if (!name) throw new ServerError(ERR.NAME_REQUIRED, 'name required');
    const role = isTeacherKey(options?.teacherKey) ? 'teacher' : 'student';
    // 入場ゲート. A refusal here is a locked door, so the gate is written never to throw
    // and never to refuse a child it has seen before.
    const pass = await this.gate.allow({ classCode: this.classCode, name, role });
    if (!pass.ok) {
      log.warn(`[room ${this.roomId}] refused "${name}" for class=${this.classCode} (${pass.reason})`);
      throw new ServerError(ERR.NOT_ON_ROSTER, 'not on the class register');
    }
    for (const [id, p] of this.state.players) {
      if (p.name !== name || !p.connected || id === client.sessionId) continue;
      // Live clients send a move/heartbeat at least every 500 ms. A seat that has been
      // silent for GHOST_MS is a dead socket the transport has not noticed yet (iPad
      // suspended mid-connection): evict it so the returning student can take over now
      // instead of waiting for the ping timeout.
      const priv = this.priv.get(id);
      const silentFor = Date.now() - (priv?.lastMoveAt || 0);
      if (silentFor < GHOST_MS) throw new ServerError(ERR.NAME_IN_USE, 'name in use');
      p.connected = false;
      const ghost = this.clients.find((c) => c.sessionId === id);
      log.info(`[room ${this.roomId}] evicting silent seat "${name}" (${id}, ${silentFor}ms)`);
      ghost?.leave(4003);
    }
    return { name, role, avatar: sanitizeAvatar(options?.avatar) };
  }

  async onJoin(client, options, auth) {
    client.userData = { name: auth.name, role: auth.role };
    const now = Date.now();
    let priv = null;
    let restored = false;
    let position = null;

    // 1. Take over a seat that is still waiting for reconnection (page reload lost the token).
    const previousId = this.findDisconnectedByName(auth.name);
    if (previousId) {
      const old = this.state.players.get(previousId);
      priv = this.priv.get(previousId);
      this.priv.delete(previousId);
      this.state.players.delete(previousId);
      priv.reconnect?.reject(new Error('seat taken over by a new connection'));
      priv.reconnect = null;
      restored = true;
      position = { space: old.space, x: old.x, z: old.z };
    } else {
      // 2. Otherwise load the persisted record (Google Sheets / file).
      let record = null;
      try { record = await this.store.loadPlayer(this.classCode, auth.name); } catch (err) { log.warn(`[room ${this.roomId}] loadPlayer failed:`, err.message); }
      priv = this.privFromRecord(record || blankPlayerRecord(this.classCode, auth.name));
      restored = !!record;
      const lastSeen = Date.parse(record?.last_seen || '') || 0;
      if (record && record.space && now - lastSeen < POSITION_RESTORE_MS) position = { space: record.space, x: record.x, z: record.z };
    }
    priv.lastMoveAt = now;
    this.priv.set(client.sessionId, priv);

    const player = new Player();
    player.name = auth.name;
    player.avatar = auth.avatar;
    player.role = auth.role;
    player.connected = true;
    if (position) { player.space = position.space; player.x = position.x; player.z = position.z; }
    player.level = priv.progress.level;
    this.state.players.set(client.sessionId, player);
    if (auth.role === 'teacher') this.state.teacherId = client.sessionId;

    // The day's bonus is banked before `welcome` is built, so the page never shows a coin
    // count it has to correct a moment later. The popup follows the welcome.
    const bonus = this.claimDaily(client.sessionId);
    client.send('welcome', this.welcomePayload(client.sessionId, restored, position));
    if (bonus) client.send('login:bonus', bonus);
    this.persist(client.sessionId);
    log.info(`[room ${this.roomId}] join ${auth.role} "${auth.name}" (${client.sessionId}) restored=${restored} clients=${this.clients.length}`);
  }

  async onLeave(client, consented) {
    const id = client.sessionId;
    const player = this.state.players.get(id);
    const priv = this.priv.get(id);
    if (!player || !priv) return;
    player.connected = false;
    if (this.state.teacherId === id) this.state.teacherId = '';
    this.persist(id);
    if (consented) { this.remove(id); return; }
    try {
      priv.reconnect = this.allowReconnection(client, config.reconnectGraceSec);
      const newClient = await priv.reconnect; // the old client object is stale after this
      priv.reconnect = null;
      priv.lastMoveAt = Date.now();
      player.connected = true;
      if (player.role === 'teacher') this.state.teacherId = id;
      newClient.send('welcome', this.welcomePayload(id, true, null));
      log.info(`[room ${this.roomId}] reconnected "${player.name}" (${id})`);
    } catch {
      this.remove(id);
    }
  }

  onDispose() {
    if (!this.priv) return undefined; // creation was refused before state existed
    for (const id of this.priv.keys()) this.persist(id);
    log.info(`[room ${this.roomId}] disposed class=${this.classCode}`);
    return this.store.flush().catch((err) => log.warn('[room] final flush failed:', err.message));
  }

  remove(id) {
    if (!this.priv.has(id) && !this.state.players.has(id)) return;
    const name = this.state.players.get(id)?.name;
    this.priv.delete(id);
    this.state.players.delete(id);
    if (this.state.teacherId === id) this.state.teacherId = '';
    log.info(`[room ${this.roomId}] left "${name}" (${id}) clients=${this.clients.length}`);
  }

  findDisconnectedByName(name) {
    for (const [id, p] of this.state.players) if (p.name === name && !p.connected) return id;
    return null;
  }

  // ---- messages ----------------------------------------------------------------

  onMove(client, msg) {
    const player = this.state.players.get(client.sessionId);
    const priv = this.priv.get(client.sessionId);
    if (!player || !priv || !msg || typeof msg !== 'object') return;
    if (typeof msg.s === 'string' && msg.s.length <= 48) player.space = msg.s;
    player.x = clamp(num(msg.x, player.x), -WORLD_LIMIT, WORLD_LIMIT);
    player.z = clamp(num(msg.z, player.z), -WORLD_LIMIT, WORLD_LIMIT);
    player.yaw = num(msg.r, player.yaw);
    if (ANIMS.includes(msg.a)) player.anim = msg.a;
    if (Number.isInteger(msg.t) && msg.t >= 0) player.ts = msg.t >>> 0;
    priv.lastMoveAt = Date.now();
  }

  onAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || !msg || typeof msg !== 'object') return;
    const now = Date.now();
    if (now - priv.lastAnswerAt < config.answerMinIntervalMs) {
      client.send('answer:result', { q: msg.q, ok: false, error: 'too fast' });
      return;
    }
    let result;
    try { result = judge(msg.q, msg.c); } catch (err) {
      if (err instanceof JudgeError) { client.send('answer:result', { q: msg.q, ok: false, error: err.message }); return; }
      throw err;
    }
    priv.lastAnswerAt = now;
    priv.stats.attempts += 1;
    if (result.correct) priv.stats.correct += 1;
    // Roblox's rate card: the word huts pay both XP and coins, the island lessons and
    // the word behind a catch pay XP (the fish itself is the catch's reward).
    const rate = result.correct ? (REWARDS[result.kind === 'lesson' ? 'lesson' : result.kind === 'word' ? 'wordQuiz' : 'fishWord'] || { xp: 0, coins: 0 }) : { xp: 0, coins: 0 };
    const xp = rate.xp;
    const level = this.awardXp(client.sessionId, xp, result.questionId);
    let walletChanged = false;
    if (rate.coins > 0) {
      const entry = applyOp(priv.wallet, { type: 'award', amount: rate.coins, id: result.questionId });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      walletChanged = true;
    }
    if (result.fishId && result.correct) {
      const entry = applyOp(priv.wallet, { type: 'catch', id: result.fishId });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      walletChanged = true;
    }
    this.store.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, result.questionId, result.mode,
      String(msg.c).slice(0, 80), result.correct ? 1 : 0, xp, client.sessionId,
    ]);
    this.persist(client.sessionId);
    client.send('answer:result', {
      q: result.questionId, ok: true, correct: result.correct, xp, stats: { ...priv.stats },
      progress: this.progressPayload(client.sessionId), levels: level?.levels || 0,
      ...(walletChanged ? this.walletPayload(client.sessionId) : {}),
    });
  }

  onEconomy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || !msg || typeof msg !== 'object') return;
    const op = { type: String(msg.op || ''), id: typeof msg.id === 'string' ? msg.id.slice(0, 40) : undefined, quantity: msg.quantity };
    // Catches, rewards and prices are the server's to apply; a client asking for one is
    // asking to write its own record.
    if (['catch', 'award', 'spend'].includes(op.type)) { client.send('wallet', { ok: false, op: op.type, error: 'this reward is granted by the server', ...this.walletPayload(client.sessionId) }); return; }
    try {
      const entry = applyOp(priv.wallet, op);
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      this.persist(client.sessionId);
      client.send('wallet', { ok: true, op: op.type, ...this.walletPayload(client.sessionId) });
    } catch (err) {
      if (!(err instanceof EconomyError)) throw err;
      client.send('wallet', { ok: false, op: op.type, error: err.message, ...this.walletPayload(client.sessionId) });
    }
  }

  onProgress(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || typeof msg?.json !== 'string') return;
    if (Buffer.byteLength(msg.json, 'utf8') > config.progressMaxBytes) { client.send('progress:ack', { ok: false, error: 'too large' }); return; }
    if (parseJson(msg.json, null) === null) { client.send('progress:ack', { ok: false, error: 'invalid json' }); return; }
    priv.progressJson = msg.json;
    priv.progressAt = Date.now();
    this.persist(client.sessionId);
    client.send('progress:ack', { ok: true });
  }

  onChat(client, msg) {
    const player = this.state.players.get(client.sessionId);
    const priv = this.priv.get(client.sessionId);
    if (!player || !priv) return;
    const id = typeof msg?.id === 'string' ? msg.id : '';
    if (!PHRASE_IDS.has(id)) return;
    if (this.state.chatPaused && player.role !== 'teacher') { client.send('chat:blocked', { reason: 'paused' }); return; }
    const now = Date.now();
    if (now - priv.lastChatAt < config.chatMinIntervalMs) { client.send('chat:blocked', { reason: 'rate' }); return; }
    priv.lastChatAt = now;
    priv.progress.chats += 1;
    const level = this.awardXp(client.sessionId, REWARDS.phrase.xp, `phrase:${id}`);
    this.broadcast('chat', { from: client.sessionId, name: player.name, id, t: now });
    // Named 'xp', not 'progress': the client already sends 'progress' upward for the
    // adventure save blob, and two meanings on one name is how bugs get planted.
    client.send('xp', { ...this.progressPayload(client.sessionId), levels: level?.levels || 0 });
  }

  onTeacher(client, msg) {
    const me = this.state.players.get(client.sessionId);
    if (!me || me.role !== 'teacher' || !msg || typeof msg !== 'object') return;
    const cmd = msg.cmd;
    const point = () => ({ space: typeof msg.space === 'string' ? msg.space.slice(0, 48) : me.space, x: clamp(num(msg.x, me.x), -WORLD_LIMIT, WORLD_LIMIT), z: clamp(num(msg.z, me.z), -WORLD_LIMIT, WORLD_LIMIT) });
    switch (cmd) {
      case 'gather': {
        const target = point();
        this.broadcast('teleport', { ...target, reason: 'gather', by: me.name }, { except: client });
        this.broadcast('notice', { text: `${me.name} 先生のところに集合！` }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, count: this.clients.length - 1 });
        return;
      }
      case 'move': {
        const target = this.clients.find((c) => c.sessionId === msg.target);
        if (!target) { client.send('teacher:ack', { cmd, ok: false, error: 'student not connected' }); return; }
        target.send('teleport', { ...point(), reason: 'move', by: me.name });
        client.send('teacher:ack', { cmd, ok: true, target: msg.target });
        return;
      }
      case 'call': {
        const target = this.clients.find((c) => c.sessionId === msg.target);
        if (!target) { client.send('teacher:ack', { cmd, ok: false, error: 'student not connected' }); return; }
        target.send('call', { by: me.name, space: me.space, x: me.x, z: me.z });
        client.send('teacher:ack', { cmd, ok: true, target: msg.target });
        return;
      }
      case 'chat': {
        this.state.chatPaused = !!msg.paused;
        this.broadcast('notice', { text: this.state.chatPaused ? 'チャットは先生によって一時停止中です。' : 'チャットが再開しました。' }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, paused: this.state.chatPaused });
        return;
      }
      case 'mission': {
        const id = typeof msg.id === 'string' ? msg.id : '';
        if (id && !MISSIONS.byId.has(id)) { client.send('teacher:ack', { cmd, ok: false, error: 'unknown mission' }); return; }
        this.state.missionId = id;
        const mission = id ? MISSIONS.byId.get(id) : null;
        this.broadcast('notice', { text: mission ? `今日のおつかい：${mission.title}` : 'おつかいの指定を解除しました。' }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, id });
        return;
      }
      case 'roster': {
        const roster = [];
        for (const [id, p] of this.state.players) {
          const priv = this.priv.get(id);
          roster.push({ id, name: p.name, role: p.role, connected: p.connected, space: p.space, coins: priv?.wallet.coins ?? 0, correct: priv?.stats.correct ?? 0, attempts: priv?.stats.attempts ?? 0,
            level: priv?.progress.level ?? 1, xp: priv ? totalXp(priv.progress) : 0 });
        }
        client.send('roster', { players: roster, chatPaused: this.state.chatPaused });
        return;
      }
      case 'reports': {
        // The links a teacher hands to families. Only a teacher can ask, each link is
        // signed, and the report itself is served over HTTP rather than through here.
        if (!config.reportSecret) { client.send('teacher:ack', { cmd, ok: false, error: 'reports are not configured' }); return; }
        const names = new Set();
        for (const p of this.state.players.values()) if (p.role !== 'teacher') names.add(p.name);
        let stored = [];
        try { stored = this.store.listClass?.(this.classCode) || []; } catch (err) { log.warn(`[room ${this.roomId}] report list failed:`, err.message); }
        for (const record of stored) if (record?.name && record.role !== 'teacher') names.add(record.name);
        const base = config.publicServerUrl.replace(/^ws/, 'http').replace(/\/$/, '');
        const links = [...names].sort().map((name) => ({ name, url: base + reportPath(config.reportSecret, this.classCode, name) }));
        client.send('teacher:ack', { cmd, ok: true, links });
        return;
      }
      case 'register': {
        // Re-read the class register now, for a child added to it mid-lesson.
        this.gate.forget(this.classCode);
        client.send('teacher:ack', { cmd, ok: true, mode: this.gate.mode });
        return;
      }
      default:
        client.send('teacher:ack', { cmd, ok: false, error: 'unknown command' });
    }
  }

  // ---- helpers ------------------------------------------------------------------

  tick() {
    const now = Date.now();
    this.tickWorld(now);
    for (const [id, player] of this.state.players) {
      const priv = this.priv.get(id);
      if (player.connected && priv && now - priv.lastMoveAt > STALE_MOVE_MS && player.anim !== 'idle') player.anim = 'idle';
    }
    if (now - this.lastPersistAll >= PERSIST_ALL_MS) {
      this.lastPersistAll = now;
      for (const id of this.priv.keys()) this.persist(id);
    }
  }

  privFromRecord(record) {
    const garage = sanitizeGarage(parseJson(record.garage_json, []));
    const bricks = sanitizeBlocks(parseJson(record.blocks_json, []));
    const props = sanitizeProps(parseJson(record.props_json, []));
    const town = parseJson(record.room_json, null);
    return {
      name: record.name,
      wallet: sanitizeWallet({
        coins: record.coins, inventory: parseJson(record.inventory_json, {}), owned: parseJson(record.owned_json, []),
        wands: parseJson(record.wands_json, []), wand: record.wand, catches: record.catches,
        dex: parseJson(record.dex_json, []),
      }),
      stats: { correct: Math.max(0, Math.floor(num(record.correct))), attempts: Math.max(0, Math.floor(num(record.attempts))) },
      progress: sanitizeProgress({ level: record.level, xp: record.xp, chats: record.chats }),
      progressJson: typeof record.progress_json === 'string' ? record.progress_json : '',
      missionsDone: (parseJson(record.missions_json, []) || []).filter((id) => MISSIONS.byId.has(id)).slice(0, 200),
      progressAt: 0,
      lastAnswerAt: 0,
      lastChatAt: 0,
      lastMoveAt: 0,
      lastSeen: null,
      reconnect: null,
      mission: null,
      quiz: null,
      lastQuizAt: 0,
      gym: null,
      lastGymAt: 0,
      eiken: null,
      lastEikenAt: 0,
      battle: null,
      // What today's caps have already paid, kept in the record so that leaving and
      // rejoining is not a way to start the day over.
      caps: sanitizeCaps({ day: record.cap_day, battle: record.battle_coins, ghost: record.ghost_coins, course: record.course_coins, eiken: record.eiken_coins }),
      garage,
      riding: sanitizeRiding(record.riding, garage),
      bricks,
      props,
      room: sanitizeRoom(town, props),
      // Blocks moved out of the room and onto the plaza; a save from before that keeps
      // them under `blocks`, and sanitizePlaza reads either shape.
      plaza: sanitizePlaza(town, bricks),
      lap: null,
      move: sanitizeMove(record.move),
      pet: sanitizePet(parseJson(record.pet_json, null)),
      lapBest: Math.max(0, Math.floor(num(record.lap_best))),
      login: sanitizeLogin({ day: record.login_day, streak: record.login_streak }),
      week: sanitizeWeek({ key: record.week_key, xp: record.week_xp }),
      missionTurnsToday: 0,
      missionDay: '',
      lastMissionAt: 0,
    };
  }

  persist(id) {
    const priv = this.priv.get(id);
    const player = this.state.players.get(id);
    if (!priv || !player) return;
    const iso = new Date().toISOString();
    if (player.connected) priv.lastSeen = iso; else priv.lastSeen = priv.lastSeen || iso;
    this.store.savePlayer({
      class: this.classCode, name: priv.name,
      coins: priv.wallet.coins, correct: priv.stats.correct, attempts: priv.stats.attempts, catches: priv.wallet.catches,
      space: player.space, x: Math.round(player.x * 100) / 100, z: Math.round(player.z * 100) / 100,
      inventory_json: JSON.stringify(priv.wallet.inventory), owned_json: JSON.stringify(priv.wallet.owned),
      wands_json: JSON.stringify(priv.wallet.wands), wand: priv.wallet.wand,
      progress_json: priv.progressJson, missions_json: JSON.stringify(priv.missionsDone || []),
      level: priv.progress.level, xp: priv.progress.xp, total_xp: totalXp(priv.progress), chats: priv.progress.chats,
      dex_json: JSON.stringify(priv.wallet.dex || []), move: priv.move?.from || '',
      pet_json: priv.pet ? JSON.stringify(priv.pet) : '',
      login_day: priv.login.day, login_streak: priv.login.streak,
      week_key: priv.week.key, week_xp: priv.week.xp,
      cap_day: priv.caps.day, battle_coins: priv.caps.battle, ghost_coins: priv.caps.ghost, course_coins: priv.caps.course,
      eiken_coins: priv.caps.eiken,
      garage_json: JSON.stringify(priv.garage), riding: priv.riding, lap_best: priv.lapBest,
      blocks_json: JSON.stringify(priv.bricks), props_json: JSON.stringify(priv.props),
      room_json: JSON.stringify({ tier: priv.room.tier, furniture: priv.room.furniture, plaza: priv.plaza }),
      // Kept so a teacher's own row is not mistaken for a child's when the family
      // report links are drawn up.
      role: player.role,
      updated_at: iso, last_seen: priv.lastSeen,
    });
  }

  // ---- progression ---------------------------------------------------------------

  // The only way XP is ever awarded. Everything that pays - a quiz, an errand goal, a
  // phrase - comes through here, so there is one place to read when a number on a
  // parent's report is questioned, and one place to change the rates.
  awardXp(sessionId, amount, reason) {
    const priv = this.priv.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!priv || amount <= 0) return null;
    const result = grantXp(priv.progress, amount);
    addWeekXp(priv.week, amount);
    if (player) player.level = priv.progress.level;
    if (result.levels > 0) {
      log.info(`[room ${this.roomId}] "${priv.name}" reached level ${result.level} (${reason})`);
      this.broadcast('levelup', { name: priv.name, level: result.level }, { except: this.clientOf(sessionId) });
    }
    return result;
  }

  clientOf(sessionId) {
    return this.clients.find((c) => c.sessionId === sessionId) || null;
  }

  progressPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return null;
    const { level, xp, chats } = priv.progress;
    return { level, xp, need: xpToNext(level), total: totalXp(priv.progress), chats };
  }

  // ---- word huts ------------------------------------------------------------------

  // Ten questions inside the hut whose difficulty you chose by walking into it. The bank
  // never leaves the server, so unlike the lesson and fish keys there is nothing in the
  // browser to read: the child gets a question and four choices, and the answer arrives
  // only after they have committed to one.
  // Standing at a place on an island now means one of two things: standing on its
  // doorstep, or being inside it. A child indoors declares `in:<island>:<spot>`, which
  // names the very building this is asking about — so it is still checked, not trusted:
  // the space has to name this spot, on this island.
  atPlace(sessionId, island, spot) {
    const player = this.state.players.get(sessionId);
    if (!player || !spot) return false;
    if (player.space === `in:${island.id}:${spot.id}`) return true;
    if (player.space !== island.id) return false;
    return Math.hypot(player.x - spot.wx, player.z - spot.wz) <= island.radius + SPOT_SLACK;
  }

  atHut(sessionId, hutId) {
    return this.atPlace(sessionId, SCHOOL, SCHOOL.spotById.get(hutId));
  }

  onQuizStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const hut = SCHOOL.spotById.get(typeof msg?.hut === 'string' ? msg.hut : '');
    if (!hut) { client.send('quiz:error', { reason: 'unknown hut' }); return; }
    if (!this.atHut(client.sessionId, hut.id)) {
      client.send('quiz:error', { reason: 'too far', hut: { id: hut.id, name: hut.name, ja: hut.ja } });
      return;
    }
    priv.quiz = createSession(hut.difficulty);
    priv.quiz.hut = hut.id;
    client.send('quiz:question', { ...questionPayload(priv.quiz), hut: hut.id, name: hut.name });
    log.info(`[room ${this.roomId}] "${priv.name}" entered the ${hut.difficulty} hut`);
  }

  onQuizAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const session = priv?.quiz;
    if (!priv || !session) return;
    // Walking out ends nothing; it just stops the answering until they walk back in.
    if (!this.atHut(client.sessionId, session.hut)) {
      const hut = SCHOOL.spotById.get(session.hut);
      client.send('quiz:error', { reason: 'too far', hut: hut ? { id: hut.id, name: hut.name, ja: hut.ja } : null });
      return;
    }
    const now = Date.now();
    if (now - priv.lastQuizAt < config.answerMinIntervalMs) { client.send('quiz:error', { reason: 'too fast' }); return; }
    priv.lastQuizAt = now;

    const result = answerSession(session, msg?.choice);
    if (!result) return;
    priv.stats.attempts += 1;
    if (result.correct) priv.stats.correct += 1;

    const payload = { ...result, hut: session.hut };
    if (result.correct) {
      const entry = applyOp(priv.wallet, { type: 'award', amount: REWARDS.wordQuiz.coins, id: `quiz:${session.difficulty}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      const level = this.awardXp(client.sessionId, REWARDS.wordQuiz.xp, `quiz:${session.difficulty}`);
      payload.levels = level?.levels || 0;
    }
    this.store.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `quiz:${session.difficulty}:${result.index}`, 'quiz',
      String(session.answered[result.index]?.q || '').slice(0, 80), result.correct ? 1 : 0,
      result.correct ? REWARDS.wordQuiz.xp : 0, client.sessionId,
    ]);

    if (result.done) {
      // Roblox paid a bonus for a clean ten, and it is the reason children replay a hut.
      if (result.perfect) {
        const bonus = applyOp(priv.wallet, { type: 'award', amount: PERFECT_BONUS_COINS, id: `quiz:${session.difficulty}:perfect` });
        this.store.appendCoin(this.coinRow(client.sessionId, bonus));
        payload.perfectBonus = PERFECT_BONUS_COINS;
      }
      priv.quiz = null;
      log.info(`[room ${this.roomId}] "${priv.name}" finished a ${session.difficulty} set ${result.score}/${result.total}`);
    }
    payload.progress = this.progressPayload(client.sessionId);
    payload.wallet = this.walletPayload(client.sessionId).wallet;
    payload.next = priv.quiz ? questionPayload(priv.quiz) : null;
    this.persist(client.sessionId);
    client.send('quiz:result', payload);
  }

  onQuizQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.quiz) return;
    priv.quiz = null;
    client.send('quiz:closed', { reason: 'quit' });
  }

  // ---- ことばのジム ------------------------------------------------------------------

  // Five questions in the gym: hear a word and pick the picture, or read a word and say
  // it. Roblox let the client decide it was right and fire an XP event the server paid
  // without looking - 15 XP and 5 coins to anyone who called it on a timer. Here the
  // server holds the word and does the judging, and the speaking half is judged from
  // what the microphone heard, not from a verdict the page sent.
  onGymStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const mode = GYM_MODES.includes(msg?.mode) ? msg.mode : 'listen';
    if (!this.atHut(client.sessionId, 'gym')) {
      const gym = SCHOOL.spotById.get('gym');
      client.send('gym:error', { reason: 'too far', hut: gym ? { id: gym.id, name: gym.name, ja: gym.ja } : null });
      return;
    }
    priv.gym = createSet(mode);
    client.send('gym:question', gymPayload(priv.gym));
    log.info(`[room ${this.roomId}] "${priv.name}" started a ${mode} set at the gym`);
  }

  onGymAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const session = priv?.gym;
    if (!priv || !session) return;
    if (!this.atHut(client.sessionId, 'gym')) {
      const gym = SCHOOL.spotById.get('gym');
      client.send('gym:error', { reason: 'too far', hut: gym ? { id: gym.id, name: gym.name, ja: gym.ja } : null });
      return;
    }
    const now = Date.now();
    if (now - priv.lastGymAt < config.answerMinIntervalMs) { client.send('gym:error', { reason: 'too fast' }); return; }
    priv.lastGymAt = now;

    const heard = typeof msg?.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const result = answerSet(session, { choice: msg?.choice, text: heard });
    if (!result) return;
    priv.stats.attempts += 1;
    if (result.correct) priv.stats.correct += 1;

    const payload = { ...result, mode: session.mode };
    if (result.correct) {
      const entry = applyOp(priv.wallet, { type: 'award', amount: REWARDS.gym.coins, id: `gym:${session.mode}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      const level = this.awardXp(client.sessionId, REWARDS.gym.xp, `gym:${session.mode}`);
      payload.levels = level?.levels || 0;
    }
    this.store.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `gym:${session.mode}:${result.word}`, session.mode === 'speak' ? 'speak' : 'listen',
      (session.mode === 'speak' ? heard : String(result.answer)).slice(0, 80), result.correct ? 1 : 0,
      result.correct ? REWARDS.gym.xp : 0, client.sessionId,
    ]);

    if (result.done) {
      priv.gym = null;
      log.info(`[room ${this.roomId}] "${priv.name}" finished a ${session.mode} set ${result.score}/${result.total}`);
    }
    payload.progress = this.progressPayload(client.sessionId);
    payload.wallet = this.walletPayload(client.sessionId).wallet;
    payload.next = priv.gym ? gymPayload(priv.gym) : null;
    this.persist(client.sessionId);
    client.send('gym:result', payload);
  }

  onGymQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.gym) return;
    priv.gym = null;
    client.send('gym:closed', { reason: 'quit' });
  }

  // ---- えいごアリーナ ---------------------------------------------------------------

  // Damage is bought with English. The plain attack always lands for a little; the three
  // strong moves ask a question first and fizzle on a wrong answer. Everything - the
  // question, the answer, the damage, the opponent's turn - is decided here.
  atStand(sessionId, standId) {
    return this.atPlace(sessionId, ARENA, ARENA.spotById.get(standId));
  }

  // Roblox capped what a day of battling could pay, so the arena stays a game rather
  // than a coin tap. The cap is per child per day and survives a rejoin through the same
  // record everything else does.
  battleRoom(priv) {
    return roomLeft(priv.caps, 'battle', DAILY_CAP);
  }

  onBattleStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const stand = ARENA.spotById.get(typeof msg?.stand === 'string' ? msg.stand : '');
    if (!stand || stand.kind !== 'stand') { client.send('battle:error', { reason: 'unknown stand' }); return; }
    if (!this.atStand(client.sessionId, stand.id)) {
      client.send('battle:error', { reason: 'too far', stand: { id: stand.id, name: stand.name, ja: stand.ja } });
      return;
    }
    priv.battle = createBattle({ difficulty: stand.difficulty, level: priv.progress.level, move: priv.move });
    priv.battle.stand = stand.id;
    client.send('battle:state', { ...statePayload(priv.battle), stand: stand.id, name: stand.name, room: this.battleRoom(priv) });
    log.info(`[room ${this.roomId}] "${priv.name}" entered the ${stand.difficulty} arena`);
  }

  onBattleWaza(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const battle = priv?.battle;
    if (!priv || !battle) return;
    if (!this.atStand(client.sessionId, battle.stand)) {
      const stand = ARENA.spotById.get(battle.stand);
      client.send('battle:error', { reason: 'too far', stand: stand ? { id: stand.id, name: stand.name, ja: stand.ja } : null });
      return;
    }
    let out;
    try { out = chooseWaza(battle, msg?.waza); } catch (err) {
      if (err instanceof BattleError) { client.send('battle:error', { reason: err.message }); return; }
      throw err;
    }
    if (out.asked) { client.send('battle:quiz', quizPayload(battle)); return; }
    this.sendBattleTurn(client, priv, battle, out);
  }

  onBattleAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const battle = priv?.battle;
    if (!priv || !battle) return;
    let out;
    try { out = answerQuiz(battle, msg?.choice, { timedOut: !!msg?.timedOut }); } catch (err) {
      if (err instanceof BattleError) { client.send('battle:error', { reason: err.message }); return; }
      throw err;
    }
    priv.stats.attempts += 1;
    if (out.quiz.correct) priv.stats.correct += 1;
    this.store.appendLearning([
      new Date().toISOString(), this.classCode, priv.name, `battle:${battle.difficulty}`, 'battle',
      String(out.quiz.picked), out.quiz.correct ? 1 : 0, 0, client.sessionId,
    ]);
    this.sendBattleTurn(client, priv, battle, out);
  }

  sendBattleTurn(client, priv, battle, out) {
    const payload = { ...out, ...statePayload(battle) };
    if (out.over) {
      // Paid out of what is left of today's allowance, so the last battle of the day can
      // pay part of a prize rather than nothing at all.
      const room = this.battleRoom(priv);
      const paid = Math.min(out.reward, room);
      if (paid > 0) {
        const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `battle:${battle.difficulty}` });
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
        priv.caps.battle += paid;
      }
      payload.paid = paid;
      payload.capped = paid < out.reward;
      payload.room = this.battleRoom(priv);
      payload.wallet = this.walletPayload(client.sessionId).wallet;
      priv.battle = null;
      log.info(`[room ${this.roomId}] "${priv.name}" ${out.won ? 'won' : 'lost'} a ${battle.difficulty} battle for ${paid} coins`);
      this.persist(client.sessionId);
    }
    client.send('battle:turn', payload);
  }

  onBattleQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.battle) return;
    priv.battle = null;
    client.send('battle:closed', { reason: 'quit' });
  }

  // ---- おさかな道場 -----------------------------------------------------------------

  // A fish eaten here teaches its move, and the move becomes the fifth button in the
  // arena. Only one at a time, as Roblox had it: learning a new one forgets the old.
  // The fish is spent, so this is a real trade rather than a free upgrade.
  onFishFeed(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atStand(client.sessionId, 'dojo')) {
      const dojo = ARENA.spotById.get('dojo');
      client.send('fish:error', { reason: 'too far', stand: dojo ? { id: dojo.id, name: dojo.name, ja: dojo.ja } : null });
      return;
    }
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const move = moveForFish(id);
    if (!move) { client.send('fish:error', { reason: 'unknown fish' }); return; }
    if (!priv.wallet.inventory[id]) { client.send('fish:error', { reason: 'no fish' }); return; }

    priv.wallet.inventory[id] -= 1;
    if (priv.wallet.inventory[id] <= 0) delete priv.wallet.inventory[id];
    const forgot = priv.move;
    priv.move = move;
    this.store.appendCoin(this.coinRow(client.sessionId, {
      op: 'feed', item: id, quantity: 1, delta: 0, balance: priv.wallet.coins,
    }));
    this.persist(client.sessionId);
    client.send('fish:learned', {
      move, forgot: forgot && forgot.id !== move.id ? forgot : null,
      ...this.walletPayload(client.sessionId),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" learned ${move.name} from ${move.fishName}`);
  }

  // ---- ペット島 ----------------------------------------------------------------------

  // One pet, cared for over real days. Hunger and mood fall with wall-clock time, so a
  // pet left for a day is hungry whether or not anyone was online - that is the whole
  // point, and it is why the decay is arithmetic on a timestamp rather than a tick.
  atPetSpot(sessionId, kind) {
    return this.atPlace(sessionId, PET_ISLAND, PET_ISLAND.spotById.get(kind));
  }

  petSpotPayload(kind) {
    const s = PET_ISLAND.spotById.get(kind);
    return s ? { id: s.id, kind: s.kind, name: s.name, ja: s.ja } : null;
  }

  onPetHatch(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atPetSpot(client.sessionId, 'nest')) {
      client.send('pet:error', { reason: 'too far', spot: this.petSpotPayload('nest') });
      return;
    }
    if (priv.pet) { client.send('pet:error', { reason: 'already have one' }); return; }
    if (priv.wallet.coins < EGG_COST) { client.send('pet:error', { reason: 'not enough coins', need: EGG_COST }); return; }
    const entry = applyOp(priv.wallet, { type: 'spend', amount: EGG_COST, id: 'pet:egg' });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    priv.pet = hatch();
    this.persist(client.sessionId);
    client.send('pet:hatched', { pet: petPayload(priv.pet), ...this.walletPayload(client.sessionId) });
    log.info(`[room ${this.roomId}] "${priv.name}" hatched a ${priv.pet.species} called ${priv.pet.name}`);
  }

  onPetAct(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const action = msg?.action === 'pat' ? 'pat' : msg?.action === 'feed' ? 'feed' : '';
    if (!action) { client.send('pet:error', { reason: 'unknown action' }); return; }
    // Each kind of care has its own building, so caring for a pet is a walk.
    const kind = action === 'feed' ? 'kitchen' : 'meadow';
    if (!this.atPetSpot(client.sessionId, kind)) {
      client.send('pet:error', { reason: 'too far', spot: this.petSpotPayload(kind) });
      return;
    }
    if (!priv.pet) { client.send('pet:error', { reason: 'no pet' }); return; }
    let out;
    try { out = petAct(priv.pet, action, { coins: priv.wallet.coins }); } catch (err) {
      if (err instanceof PetError) { client.send('pet:error', { reason: err.message }); return; }
      throw err;
    }
    if (out.cost > 0) {
      const entry = applyOp(priv.wallet, { type: 'spend', amount: out.cost, id: `pet:${action}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    this.persist(client.sessionId);
    client.send('pet:acted', {
      action, message: out.message, xp: out.xp, cost: out.cost,
      pet: petPayload(priv.pet), ...this.walletPayload(client.sessionId),
    });
  }

  // ---- the calendar --------------------------------------------------------------

  // Roblox paid a login bonus on a seven-day cycle, with the day turning at noon JST so
  // a lesson never straddles the boundary. Claimed on arrival and again if a child is
  // still playing when noon passes.
  // Banks today's login bonus and returns the payload to announce, or null if today is
  // already claimed. The caller sends it: on join that has to happen after `welcome`.
  claimDaily(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return null;
    const claim = claimLogin(priv.login);
    if (!claim) return null;
    const entry = applyOp(priv.wallet, { type: 'award', amount: claim.coins, id: `login:day${claim.day}` });
    this.store.appendCoin(this.coinRow(sessionId, entry));
    this.persist(sessionId);
    log.info(`[room ${this.roomId}] "${priv.name}" claimed day ${claim.day} (streak ${claim.streak}) for ${claim.coins}`);
    return { ...claim, cycle: CYCLE, rewards: [...LOGIN_REWARDS], ...this.walletPayload(sessionId) };
  }

  // This week's XP, ranked within the class. Roblox ranked per school code; a class code
  // is the same idea and is what this room already is.
  onRank(client) {
    const key = weekIndex();
    const live = new Map();
    for (const [id, priv] of this.priv) {
      if (priv.week.key === key) live.set(priv.name, priv.week.xp);
    }
    // Everyone in the class, not only whoever is online right now.
    let stored = [];
    try { stored = this.store.listClass?.(this.classCode) || []; } catch (err) { log.warn(`[room ${this.roomId}] rank read failed:`, err.message); }
    for (const record of stored) {
      if (Number(record.week_key) !== key) continue;
      if (live.has(record.name)) continue;
      live.set(record.name, Math.max(0, Math.floor(Number(record.week_xp) || 0)));
    }
    const top = [...live.entries()]
      .map(([name, xp]) => ({ name, xp }))
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
      .slice(0, 10);
    const me = this.priv.get(client.sessionId);
    client.send('rank', {
      top,
      name: me ? me.name : '',
      mine: me && me.week.key === key ? me.week.xp : 0,
      daysLeft: daysLeftInWeek(),
      classCode: this.classCode,
      season: seasonFor(),
    });
  }

  // ---- 英検の島（5級・4級・3級）------------------------------------------------------

  // Four halls on each island, one per skill, and the hall a child is standing in is the
  // skill they get. The set of five is held here, so what the page knows is one question
  // at a time and never its answer. Everything a child could get wrong on the wire — a
  // hall on another island, a set they walked out of, an answer sent twice — is a named
  // refusal rather than a payment.
  atEikenHall(sessionId, islandId, hallId) {
    const island = EIKEN_ISLANDS.get(islandId);
    if (!island) return false;
    return this.atPlace(sessionId, island, island.spotById.get(hallId));
  }

  eikenSpotPayload(islandId, hallId) {
    const hall = EIKEN_ISLANDS.get(islandId)?.spotById.get(hallId);
    return hall ? { id: hall.id, island: islandId, name: hall.name, ja: hall.ja, skill: hall.skill } : null;
  }

  onEikenStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const island = EIKEN_ISLANDS.get(typeof msg?.island === 'string' ? msg.island : '');
    const hall = island?.spotById.get(typeof msg?.hall === 'string' ? msg.hall : '');
    if (!island || !hall) { client.send('eiken:error', { reason: 'unknown hall' }); return; }
    if (!this.atEikenHall(client.sessionId, island.id, hall.id)) {
      client.send('eiken:error', { reason: 'too far', spot: this.eikenSpotPayload(island.id, hall.id) });
      return;
    }
    let session;
    try { session = createEikenSet(island.grade, hall.skill); } catch (err) {
      if (err instanceof EikenError) { client.send('eiken:error', { reason: err.message }); return; }
      throw err;
    }
    session.island = island.id;
    session.hall = hall.id;
    priv.eiken = session;
    client.send('eiken:question', {
      ...eikenPayload(session), island: island.id, hall: hall.id, badge: island.badge, name: hall.name,
      room: roomLeft(priv.caps, 'eiken', EIKEN_CAP),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" started a ${island.grade} ${hall.skill} set`);
  }

  onEikenAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const session = priv?.eiken;
    if (!priv || !session) return;
    // Walking out ends nothing; it just stops the answering until they walk back in.
    if (!this.atEikenHall(client.sessionId, session.island, session.hall)) {
      client.send('eiken:error', { reason: 'too far', spot: this.eikenSpotPayload(session.island, session.hall) });
      return;
    }
    const now = Date.now();
    if (now - priv.lastEikenAt < config.answerMinIntervalMs) { client.send('eiken:error', { reason: 'too fast' }); return; }
    priv.lastEikenAt = now;

    const result = answerEikenSet(session, msg);
    if (!result) return;
    priv.stats.attempts += 1;
    if (result.correct) priv.stats.correct += 1;

    const payload = { ...result, island: session.island, hall: session.hall, skill: session.skill, grade: session.grade };
    const rate = eikenReward(session.skill, session.grade);
    if (result.correct) {
      // The coins stop at the day's ceiling; the XP does not, because XP is the record of
      // what a child did and a report that flattens a good afternoon is a worse report.
      const left = roomLeft(priv.caps, 'eiken', EIKEN_CAP);
      const paid = Math.min(rate.coins, left);
      if (paid > 0) {
        const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `eiken:${session.grade}:${session.skill}` });
        priv.caps.eiken += paid;
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
      }
      payload.coins = paid;
      payload.capped = paid < rate.coins;
      const level = this.awardXp(client.sessionId, rate.xp, `eiken:${session.grade}:${session.skill}`);
      payload.xp = rate.xp;
      payload.levels = level?.levels || 0;
    }
    this.store.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `eiken:${session.grade}:${session.skill}:${result.index}`, session.skill,
      String(result.picked ?? '').slice(0, 80), result.correct ? 1 : 0, result.correct ? rate.xp : 0, client.sessionId,
    ]);

    if (result.done) {
      if (result.perfect) {
        const left = roomLeft(priv.caps, 'eiken', EIKEN_CAP);
        const bonus = Math.min(PERFECT_BONUS_COINS, left);
        if (bonus > 0) {
          const entry = applyOp(priv.wallet, { type: 'award', amount: bonus, id: `eiken:${session.grade}:${session.skill}:perfect` });
          priv.caps.eiken += bonus;
          this.store.appendCoin(this.coinRow(client.sessionId, entry));
        }
        payload.perfectBonus = bonus;
      }
      priv.eiken = null;
      log.info(`[room ${this.roomId}] "${priv.name}" finished a ${session.grade} ${session.skill} set ${result.score}/${result.total}`);
    }
    payload.progress = this.progressPayload(client.sessionId);
    payload.wallet = this.walletPayload(client.sessionId).wallet;
    payload.room = roomLeft(priv.caps, 'eiken', EIKEN_CAP);
    payload.next = priv.eiken ? eikenPayload(priv.eiken) : null;
    this.persist(client.sessionId);
    client.send('eiken:result', payload);
  }

  onEikenQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.eiken) return;
    priv.eiken = null;
    client.send('eiken:closed', { reason: 'quit' });
  }

  // ---- まちづくり島 -------------------------------------------------------------

  // Roblox's HousingService kept only the door in the town and built the room when a
  // child walked in. That is what makes this affordable: nothing about a room costs
  // anything until someone is inside it, so the school's size does not matter, only how
  // many children are standing in their rooms right now.
  atTownSpot(sessionId, kind) {
    return this.atPlace(sessionId, TOWN_ISLAND, TOWN_ISLAND.spotById.get(kind));
  }

  townSpotPayload(kind) {
    const s = TOWN_ISLAND.spotById.get(kind);
    return s ? { id: s.id, kind: s.kind, name: s.name, ja: s.ja } : null;
  }

  shopPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return { blocks: [] };
    return {
      blocks: [...BLOCKS.values()].map((b) => blockPayload(b, priv.bricks.includes(b.id))),
      coins: priv.wallet.coins,
    };
  }

  onBlockBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('block:error', { reason, ...extra });
    const block = BLOCKS.get(String(msg?.id || ''));
    if (!block) return fail('no such block');
    // Blocks are bought at the block shop, like everything else is bought where it is.
    if (!this.atTownSpot(client.sessionId, 'shop')) return fail('too far', { spot: this.townSpotPayload('shop') });
    if (priv.bricks.includes(block.id)) return fail('already yours');
    if (priv.wallet.coins < block.price) return fail('not enough coins', { need: block.price, coins: priv.wallet.coins });
    if (block.price > 0) {
      const entry = applyOp(priv.wallet, { type: 'spend', amount: block.price, id: `block:${block.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    priv.bricks.push(block.id);
    this.persist(client.sessionId);
    client.send('block:bought', {
      id: block.id, word: block.word, ja: block.ja,
      ...this.shopPayload(client.sessionId), ...this.walletPayload(client.sessionId),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" bought the ${block.id} block`);
  }

  // かぐ屋. Furniture is bought exactly as blocks are - by kind, at the shop that sells
  // it - and what it costs and whether it is yours are decided here.
  propShopPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return { furniture: [] };
    return {
      furniture: [...PROPS.values()].map((f) => propPayload(f, priv.props.includes(f.id))),
      coins: priv.wallet.coins,
    };
  }

  onPropBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('prop:error', { reason, ...extra });
    const item = PROPS.get(String(msg?.id || ''));
    if (!item) return fail('no such furniture');
    if (!this.atTownSpot(client.sessionId, 'furniture')) return fail('too far', { spot: this.townSpotPayload('furniture') });
    if (priv.props.includes(item.id)) return fail('already yours');
    if (priv.wallet.coins < item.price) return fail('not enough coins', { need: item.price, coins: priv.wallet.coins });
    if (item.price > 0) {
      const entry = applyOp(priv.wallet, { type: 'spend', amount: item.price, id: `prop:${item.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    priv.props.push(item.id);
    this.persist(client.sessionId);
    client.send('prop:bought', {
      id: item.id, word: item.word, ja: item.ja,
      ...this.propShopPayload(client.sessionId), ...this.walletPayload(client.sessionId),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" bought the ${item.id}`);
  }

  // マイルーム. Walking into the doorway is what opens it now - there is no counter to
  // press anything at - so this is asked for the moment a child is at the door.
  onRoomEnter(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atTownSpot(client.sessionId, 'door')) {
      client.send('room:error', { reason: 'too far', spot: this.townSpotPayload('door') });
      return;
    }
    client.send('room:state', roomPayload(priv.room, priv.props));
  }

  // Furniture goes in when the child is inside their own room. Rooms are not shared, so
  // there is nobody else's sofa to stand on.
  inRoom(sessionId) {
    const player = this.state.players.get(sessionId);
    return !!player && player.space === 'in:room';
  }

  onRoomPlace(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.inRoom(client.sessionId)) { client.send('room:error', { reason: 'not inside' }); return; }
    let placed;
    try { placed = placeProp(priv.room, priv.props, msg); } catch (err) {
      if (err instanceof TownError) { client.send('room:error', { reason: err.message }); return; }
      throw err;
    }
    this.persist(client.sessionId);
    const room = roomOfTier(priv.room.tier);
    client.send('room:placed', { ...placed, used: priv.room.furniture.length, cap: room.props });
  }

  onRoomRemove(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.inRoom(client.sessionId)) { client.send('room:error', { reason: 'not inside' }); return; }
    let gone;
    try { gone = removeProp(priv.room, msg); } catch (err) {
      if (err instanceof TownError) { client.send('room:error', { reason: err.message }); return; }
      throw err;
    }
    this.persist(client.sessionId);
    const room = roomOfTier(priv.room.tier);
    client.send('room:removed', { ...gone, used: priv.room.furniture.length, cap: room.props });
  }

  // ひろば. The square is where blocks are stacked, and the lot inside it is the child's
  // own: everyone builds in the same place, nobody builds through anybody.
  onPlazaEnter(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atTownSpot(client.sessionId, 'plaza')) {
      client.send('plaza:error', { reason: 'too far', spot: this.townSpotPayload('plaza') });
      return;
    }
    client.send('plaza:state', plazaPayload(priv.plaza, priv.bricks));
  }

  inPlaza(sessionId) {
    const player = this.state.players.get(sessionId);
    return !!player && player.space === 'in:plaza';
  }

  onPlazaPlace(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.inPlaza(client.sessionId)) { client.send('plaza:error', { reason: 'not inside' }); return; }
    let placed;
    try { placed = placeBlock(priv.plaza, priv.bricks, msg); } catch (err) {
      if (err instanceof TownError) { client.send('plaza:error', { reason: err.message }); return; }
      throw err;
    }
    this.persist(client.sessionId);
    client.send('plaza:placed', { ...placed, used: priv.plaza.blocks.length, cap: PLAZA.cap });
  }

  onPlazaRemove(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.inPlaza(client.sessionId)) { client.send('plaza:error', { reason: 'not inside' }); return; }
    let gone;
    try { gone = removeBlock(priv.plaza, msg); } catch (err) {
      if (err instanceof TownError) { client.send('plaza:error', { reason: err.message }); return; }
      throw err;
    }
    this.persist(client.sessionId);
    client.send('plaza:removed', { ...gone, used: priv.plaza.blocks.length, cap: PLAZA.cap });
  }

  // Roblox called this 引っ越し: a bigger room for a level and a price. What is built
  // stays built - a larger room is the same room with more space around it.
  onRoomMove(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('room:error', { reason, ...extra });
    if (!this.atTownSpot(client.sessionId, 'agent')) return fail('too far', { spot: this.townSpotPayload('agent') });
    const next = nextRoom(priv.room.tier);
    if (!next) return fail('biggest already');
    if (priv.progress.level < next.level) return fail('level too low', { need: next.level, level: priv.progress.level });
    if (priv.wallet.coins < next.price) return fail('not enough coins', { need: next.price, coins: priv.wallet.coins });
    const entry = applyOp(priv.wallet, { type: 'spend', amount: next.price, id: `room:${next.id}` });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    priv.room.tier = next.tier;
    this.persist(client.sessionId);
    client.send('room:moved', {
      room: roomPayload(priv.room, priv.props), ...this.walletPayload(client.sessionId),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" moved into the ${next.id}`);
  }

  // ---- のりもの島 ---------------------------------------------------------------

  // Roblox's VehicleGate. Each vehicle is bought at its own gate, so the island is
  // walked rather than scrolled, and the level and the coins are checked here — the page
  // shows a gold sign, it does not decide what it means.
  atRideSpot(sessionId, spotId) {
    return this.atPlace(sessionId, RIDE_ISLAND, RIDE_ISLAND.spotById.get(spotId));
  }

  rideSpotPayload(spotId) {
    const s = RIDE_ISLAND.spotById.get(spotId);
    return s ? { id: s.id, kind: s.kind, name: s.name, ja: s.ja, vehicle: s.vehicle || '' } : null;
  }

  garagePayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return { vehicles: [], riding: '' };
    const level = priv.progress.level;
    const coins = priv.wallet.coins;
    return {
      vehicles: RIDE.order.map((id) => vehiclePayload(RIDE.vehicles.get(id), {
        owned: priv.garage.includes(id), riding: priv.riding === id, level, coins,
      })),
      riding: priv.riding,
      best: priv.lapBest,
      room: roomLeft(priv.caps, 'course', COURSE_CAP),
    };
  }

  onRideBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('ride:error', { reason, ...extra });
    const vehicle = RIDE.vehicles.get(String(msg?.id || ''));
    if (!vehicle) return fail('no such vehicle');
    const gate = [...RIDE_ISLAND.spotById.values()].find((sp) => sp.vehicle === vehicle.id);
    // Every vehicle is bought where it stands, at its own gate.
    if (!this.atRideSpot(client.sessionId, gate.id)) return fail('too far', { spot: this.rideSpotPayload(gate.id) });
    if (priv.garage.includes(vehicle.id)) return fail('already yours');
    if (priv.progress.level < vehicle.level) return fail('level too low', { need: vehicle.level, level: priv.progress.level });
    if (priv.wallet.coins < vehicle.price) return fail('not enough coins', { need: vehicle.price, coins: priv.wallet.coins });
    const entry = applyOp(priv.wallet, { type: 'spend', amount: vehicle.price, id: `ride:${vehicle.id}` });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    priv.garage.push(vehicle.id);
    priv.riding = vehicle.id;     // a child who just bought one is on it
    this.persist(client.sessionId);
    client.send('ride:bought', {
      id: vehicle.id, name: vehicle.name, word: vehicle.word, ja: vehicle.ja,
      ...this.garagePayload(client.sessionId), ...this.walletPayload(client.sessionId),
    });
    log.info(`[room ${this.roomId}] "${priv.name}" bought the ${vehicle.id} for ${vehicle.price}`);
  }

  onRideEquip(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const id = String(msg?.id || '');
    if (id && !priv.garage.includes(id)) { client.send('ride:error', { reason: 'not yours' }); return; }
    priv.riding = id;
    // Getting off mid-lap ends the lap: the course is driven, not walked.
    if (!id && priv.lap) priv.lap = null;
    this.persist(client.sessionId);
    client.send('ride:garage', this.garagePayload(client.sessionId));
  }

  // The course: six checkpoints in a ring, each carrying a direction word, crossed in
  // order on a vehicle. The order and the standing-there are both checked here.
  onCourseStart(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('course:error', { reason, ...extra });
    if (!this.atRideSpot(client.sessionId, RIDE_ISLAND.start.id)) {
      return fail('too far', { spot: this.rideSpotPayload(RIDE_ISLAND.start.id) });
    }
    if (!priv.riding) return fail('on foot');
    priv.lap = startLap();
    client.send('course:started', {
      gates: COURSE.gates.map((g) => ({ id: g.id, word: g.word, ja: g.ja, order: g.order, x: g.x, z: g.z })),
      next: COURSE.gates[0].id, vehicle: priv.riding, best: priv.lapBest,
    });
  }

  onCourseGate(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!priv || !player) return;
    const fail = (reason, extra = {}) => client.send('course:error', { reason, ...extra });
    if (!priv.lap) return fail('not started');
    if (!priv.riding) { priv.lap = null; return fail('on foot'); }
    const gate = COURSE.gateById.get(String(msg?.id || ''));
    if (!gate) return fail('no such checkpoint');
    if (player.space !== RIDE_ISLAND.id) return fail('elsewhere');
    if (Math.hypot(player.x - gate.wx, player.z - gate.wz) > COURSE.reach + SPOT_SLACK) return fail('too far');
    const out = crossGate(priv.lap, gate.id);
    if (!out.ok) return fail('not next', { want: out.want ? { id: out.want.id, word: out.want.word, ja: out.want.ja, x: out.want.x, z: out.want.z } : null });
    if (!out.done) {
      client.send('course:gate', {
        id: gate.id, word: gate.word, ja: gate.ja, order: gate.order, of: COURSE.gates.length,
        next: out.want ? { id: out.want.id, word: out.want.word, ja: out.want.ja, x: out.want.x, z: out.want.z } : null,
        ms: out.ms,
      });
      return;
    }
    // A finished lap. The coins are capped by the day like every other way of earning.
    const left = roomLeft(priv.caps, 'course', COURSE_CAP);
    const paid = Math.min(COURSE.reward.coins, left);
    const best = !priv.lapBest || out.ms < priv.lapBest;
    priv.lapBest = best ? out.ms : priv.lapBest;
    priv.lap = null;
    if (paid > 0) {
      priv.caps.course += paid;
      const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: 'course:lap' });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    const level = this.awardXp(client.sessionId, COURSE.reward.xp, 'course:lap');
    this.persist(client.sessionId);
    client.send('course:finished', {
      ms: out.ms, best, bestMs: priv.lapBest, coins: paid, xp: COURSE.reward.xp,
      capped: paid < COURSE.reward.coins, room: roomLeft(priv.caps, 'course', COURSE_CAP),
      words: COURSE.gates.map((g) => ({ word: g.word, ja: g.ja })),
      ...this.walletPayload(client.sessionId), progress: this.progressPayload(client.sessionId), levels: level?.levels || 0,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" drove a lap in ${(out.ms / 1000).toFixed(1)}s`);
  }

  // ---- the night ------------------------------------------------------------------

  // Roblox's NightGhostManager, with the coins moved to the server. The ghosts are the
  // same twelve every night, in the same twelve places, because the places are shared
  // data the browser builds from — so "the one by the fountain" means the same thing to
  // every child in the class.
  tickWorld(at) {
    const now = this.worldNow(at);
    const phase = phaseAt(now);
    if (phase.id !== this.phase) {
      this.phase = phase.id;
      if (phase.id === 'night') { this.ghostsOut = new Set(NIGHT.ids); this.ghostBack.clear(); }
      // They are gone by morning, whether or not anyone caught them.
      if (phase.id === 'dawn') { this.ghostsOut.clear(); this.ghostBack.clear(); }
      this.broadcast('world:phase', this.worldPayload(now));
      return;
    }
    if (phase.id !== 'night' || !this.ghostBack.size) return;
    let returned = false;
    for (const [id, at] of this.ghostBack) {
      if (at > now) continue;
      this.ghostBack.delete(id);
      this.ghostsOut.add(id);
      returned = true;
    }
    if (returned) this.broadcast('night:ghosts', { ghosts: [...this.ghostsOut] });
  }

  // The world's own clock: the wall clock, plus whatever shift this server was started
  // with (zero in a classroom).
  worldNow(now = Date.now()) { return now + config.worldOffsetMs; }

  worldPayload(at = Date.now()) {
    const now = this.worldNow(at);
    // `now` travels with the phase so the browser can measure its own clock against the
    // server's once, and then run the sky itself without asking again.
    return { ...phaseAt(now), now, ghosts: [...this.ghostsOut] };
  }

  onGhostHit(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!priv || !player) return;
    const fail = (reason, extra = {}) => client.send('ghost:error', { reason, ...extra });
    const ghost = NIGHT.ghosts.get(String(msg?.id || ''));
    if (!ghost) return fail('no such ghost');
    if (this.phase !== 'night') return fail('not night');
    // Someone else may have got there first; that is a miss, not an error worth a fuss.
    if (!this.ghostsOut.has(ghost.id)) return fail('already gone');
    if (player.space !== NIGHT.space) return fail('elsewhere');
    if (Math.hypot(player.x - ghost.x, player.z - ghost.z) > GHOST_REACH + SPOT_SLACK) {
      return fail('too far', { x: ghost.x, z: ghost.z });
    }
    const left = roomLeft(priv.caps, 'ghost', GHOST_CAP);
    const paid = Math.min(GHOST_COINS, left);
    this.ghostsOut.delete(ghost.id);
    // A caught ghost drifts back while the night lasts, so a class of 25 is not racing
    // for twelve of them.
    this.ghostBack.set(ghost.id, this.worldNow() + RESPAWN_MS);
    if (paid > 0) {
      priv.caps.ghost += paid;
      const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `ghost:${ghost.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      this.persist(client.sessionId);
    }
    client.send('ghost:caught', {
      ...ghostPayload(ghost), coins: paid, capped: paid < GHOST_COINS,
      room: roomLeft(priv.caps, 'ghost', GHOST_CAP), ...this.walletPayload(client.sessionId),
    });
    this.broadcast('night:ghosts', { ghosts: [...this.ghostsOut], caught: ghost.id, by: priv.name });
  }

  // ---- errand quest -------------------------------------------------------------

  // An errand is walked, not clicked. Three legs, each refused unless the child's
  // avatar is standing at the right place on the island:
  //
  //   plaza  --accept-->  spot  --say (English, until every goal is met)-->  plaza --deliver--> paid
  //
  // Positions are declared by the client, as movement always has been, so this is not
  // an anti-cheat measure — it is the rule of the game, enforced in the one place that
  // also hands out the coins. A child cannot finish an errand from the menu, and the
  // walk they make is the same walk their classmates watch them make.
  atSpot(sessionId, spotId) {
    return this.atPlace(sessionId, MISSIONS.island, MISSIONS.island.spotById.get(spotId));
  }

  spotPayload(spotId) {
    const s = MISSIONS.island.spotById.get(spotId);
    return s ? { id: s.id, name: s.name, ja: s.ja, character: s.character, x: s.x, z: s.z } : null;
  }

  missionPayload(mission, stage) {
    return {
      id: mission.id, stage, character: mission.character, place: mission.place,
      item: mission.item, turnLimit: MISSIONS.turnLimit,
      spot: this.spotPayload(mission.spot), from: this.spotPayload(mission.from),
      goals: mission.goals.map((g) => ({ id: g.id, ja: g.ja })),
    };
  }

  // Taking the errand: the child has to be standing in front of the plaza NPC.
  onMissionStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const mission = MISSIONS.byId.get(typeof msg?.id === 'string' ? msg.id : '');
    if (!mission) { client.send('mission:error', { reason: 'unknown mission' }); return; }
    if (!this.atSpot(client.sessionId, mission.from)) {
      client.send('mission:error', { reason: 'too far', spot: this.spotPayload(mission.from) });
      return;
    }
    priv.mission = { id: mission.id, stage: 'talk', turns: [], goalsMet: [], complete: false, startedAt: Date.now() };
    client.send('mission:opened', {
      ...this.missionPayload(mission, 'talk'),
      request: mission.request, requestJa: mission.requestJa,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" took errand ${mission.id}`);
  }

  onMissionQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.mission) return;
    priv.mission = null;
    client.send('mission:closed', { reason: 'quit' });
  }

  // Arriving at the shop. Sending the opening line here, rather than when the errand
  // was taken, is what makes the walk mean something.
  onMissionArrive(client) {
    const priv = this.priv.get(client.sessionId);
    const state = priv?.mission;
    if (!priv || !state) return;
    const mission = MISSIONS.byId.get(state.id);
    if (!mission) { priv.mission = null; return; }
    if (state.stage !== 'talk') { client.send('mission:error', { reason: 'wrong step' }); return; }
    if (!this.atSpot(client.sessionId, mission.spot)) {
      client.send('mission:error', { reason: 'too far', spot: this.spotPayload(mission.spot) });
      return;
    }
    client.send('mission:arrived', {
      ...this.missionPayload(mission, 'talk'),
      opening: state.turns.length ? state.turns[state.turns.length - 1].reply : mission.opening,
      goalsMet: [...state.goalsMet], turn: state.turns.length,
    });
  }

  async onMissionSay(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const state = priv?.mission;
    if (!priv || !state || state.complete) return;
    const mission = MISSIONS.byId.get(state.id);
    if (!mission) { priv.mission = null; return; }
    if (state.stage !== 'talk') { client.send('mission:error', { reason: 'wrong step' }); return; }
    // Walking away mid-conversation ends nothing; it just stops the talking until the
    // child walks back, which is how a real errand behaves.
    if (!this.atSpot(client.sessionId, mission.spot)) {
      client.send('mission:error', { reason: 'too far', spot: this.spotPayload(mission.spot) });
      return;
    }

    const utterance = typeof msg?.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!utterance) return;

    const now = Date.now();
    if (now - priv.lastMissionAt < config.ai.minIntervalMs) { client.send('mission:error', { reason: 'too fast' }); return; }
    if (state.turns.length >= MISSIONS.turnLimit) { this.endMission(client, priv, mission, 'turn limit'); return; }
    const day = new Date(now).toISOString().slice(0, 10);
    if (priv.missionDay !== day) { priv.missionDay = day; priv.missionTurnsToday = 0; }
    if (priv.missionTurnsToday >= config.ai.dailyTurnsPerStudent) { client.send('mission:error', { reason: 'daily limit' }); return; }
    priv.lastMissionAt = now;
    priv.missionTurnsToday += 1;

    let result;
    try {
      result = await this.tutor.turn({ mission, history: state.turns, utterance, previousGoals: state.goalsMet });
    } catch (err) {
      log.warn(`[room ${this.roomId}] tutor failed:`, err.message);
      client.send('mission:error', { reason: 'ai unavailable' });
      return;
    }
    // The room may have moved on while we were waiting on the network.
    if (this.priv.get(client.sessionId) !== priv || priv.mission !== state) return;

    const gained = result.goalsMet.filter((id) => !state.goalsMet.includes(id));
    state.goalsMet = result.goalsMet;
    state.turns.push({ child: utterance, reply: result.reply });

    this.store.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `mission:${mission.id}`, 'mission',
      utterance.slice(0, 80), gained.length ? 1 : 0, gained.length * REWARDS.missionGoal.xp, client.sessionId,
    ]);
    priv.stats.attempts += 1;
    if (gained.length) priv.stats.correct += 1;

    // Speaking English is the thing this whole product exists for, so a goal met by
    // saying it is the best-paid act in the game. Roblox tuned it the same way.
    const level = this.awardXp(client.sessionId, gained.length * REWARDS.missionGoal.xp, `mission:${mission.id}`);
    const payload = {
      reply: result.reply, hint: result.hint, goalsMet: state.goalsMet, gained,
      turn: state.turns.length, turnLimit: MISSIONS.turnLimit,
      complete: false, stage: state.stage,
      progress: this.progressPayload(client.sessionId), levels: level?.levels || 0,
    };
    // Every goal met earns the errand, not the coins. The coins are at the plaza.
    if (result.complete) {
      state.stage = 'deliver';
      payload.stage = 'deliver';
      payload.item = mission.item;
      payload.from = this.spotPayload(mission.from);
      log.info(`[room ${this.roomId}] "${priv.name}" finished talking for ${mission.id} in ${state.turns.length} turns`);
    }
    this.persist(client.sessionId);
    client.send('mission:turn', payload);
  }

  // Handing it over, back at the plaza. This is the only place coins are awarded.
  onMissionDeliver(client) {
    const priv = this.priv.get(client.sessionId);
    const state = priv?.mission;
    if (!priv || !state) return;
    const mission = MISSIONS.byId.get(state.id);
    if (!mission) { priv.mission = null; return; }
    if (state.stage !== 'deliver') { client.send('mission:error', { reason: 'wrong step' }); return; }
    if (!this.atSpot(client.sessionId, mission.from)) {
      client.send('mission:error', { reason: 'too far', spot: this.spotPayload(mission.from) });
      return;
    }
    const entry = applyOp(priv.wallet, { type: 'award', amount: mission.reward, id: `mission:${mission.id}` });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    state.complete = true;
    if (!priv.missionsDone.includes(mission.id)) priv.missionsDone.push(mission.id);
    this.persist(client.sessionId);
    client.send('mission:delivered', {
      id: mission.id, thanks: mission.thanks, item: mission.item, reward: mission.reward,
      progress: this.progressPayload(client.sessionId),
      missionsDone: [...priv.missionsDone], wallet: this.walletPayload(client.sessionId).wallet,
      turns: state.turns.length,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" delivered ${mission.id} for ${mission.reward} coins`);
    priv.mission = null;
  }

  endMission(client, priv, mission, reason) {
    priv.mission = null;
    client.send('mission:closed', { reason, goals: mission.goals.map((g) => g.id) });
  }

  coinRow(sessionId, entry) {
    const priv = this.priv.get(sessionId);
    return [new Date().toISOString(), this.classCode, priv?.name || '', entry.op, entry.item, entry.quantity, entry.delta, entry.balance, sessionId];
  }

  walletPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return { wallet: null };
    const w = priv.wallet;
    return { wallet: { coins: w.coins, inventory: { ...w.inventory }, owned: [...w.owned], wands: [...w.wands], wand: w.wand, catches: w.catches, dex: [...w.dex] } };
  }

  welcomePayload(sessionId, restored, position) {
    const priv = this.priv.get(sessionId);
    const player = this.state.players.get(sessionId);
    return {
      sessionId, role: player.role, classCode: this.classCode, restored, position,
      ...this.walletPayload(sessionId), stats: { ...priv.stats }, progressJson: priv.progressJson,
      progress: this.progressPayload(sessionId),
      missionsDone: [...priv.missionsDone],
      // An errand in progress survives a screen lock, so the tracker comes back too.
      errand: priv.mission && MISSIONS.byId.has(priv.mission.id)
        ? { ...this.missionPayload(MISSIONS.byId.get(priv.mission.id), priv.mission.stage), goalsMet: [...priv.mission.goalsMet], turn: priv.mission.turns.length }
        : null,
      quiz: priv.quiz ? { ...questionPayload(priv.quiz), hut: priv.quiz.hut } : null,
      gym: priv.gym ? gymPayload(priv.gym) : null,
      move: priv.move || null,
      pet: priv.pet ? petPayload(priv.pet) : null,
      season: seasonFor(),
      streak: priv.login.streak,
      world: this.worldPayload(),
      battle: priv.battle ? { ...statePayload(priv.battle), stand: priv.battle.stand, quiz: quizPayload(priv.battle) } : null,
      chatPaused: this.state.chatPaused, teacherId: this.state.teacherId, missionId: this.state.missionId, maxClients: this.maxClients,
      patchRateMs: config.patchRateMs, serverTime: Date.now(),
    };
  }
}
