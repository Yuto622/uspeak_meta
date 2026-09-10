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
import { blankProgress, sanitizeProgress, grantXp, totalXp, xpToNext, REWARDS } from '../game/progression.js';
import { SCHOOL, createSession, questionPayload, answerSession, QUESTIONS_PER_SESSION } from '../game/wordquiz.js';
import { MODES as GYM_MODES, createSet, questionPayload as gymPayload, answerSet } from '../game/gym.js';
import { ARENA, createBattle, statePayload, quizPayload, chooseWaza, answerQuiz, BattleError, DAILY_CAP } from '../game/battle.js';
import { moveForFish, sanitizeMove } from '../game/fish-moves.js';
import { createTutor } from '../ai/tutor.js';
import { log } from '../log.js';

export const ERR = { NAME_REQUIRED: 4000, NAME_IN_USE: 4001, ROOM_FULL: 4002 };
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
    this.onMessage('battle:start', (client, msg) => this.onBattleStart(client, msg));
    this.onMessage('battle:waza', (client, msg) => this.onBattleWaza(client, msg));
    this.onMessage('battle:answer', (client, msg) => this.onBattleAnswer(client, msg));
    this.onMessage('battle:quit', (client) => this.onBattleQuit(client));
    this.onMessage('fish:feed', (client, msg) => this.onFishFeed(client, msg));
    this.onMessage('profile', (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.avatar = sanitizeAvatar(msg?.avatar);
    });
    this.onMessage('wallet:get', (client) => client.send('wallet', { ok: true, op: 'get', ...this.walletPayload(client.sessionId) }));
    this.onMessage('ping', (client, t) => client.send('pong', { t, server: Date.now() }));

    this.tutor = options.tutor || createTutor();
    this.lastPersistAll = Date.now();
    this.setSimulationInterval(() => this.tick(), 1000);
    log.info(`[room ${this.roomId}] created class=${this.classCode} max=${this.maxClients} patch=${config.patchRateMs}ms`);
  }

  // ---- lifecycle -------------------------------------------------------------

  async onAuth(client, options) {
    const name = sanitizeName(options?.name);
    if (!name) throw new ServerError(ERR.NAME_REQUIRED, 'name required');
    const role = isTeacherKey(options?.teacherKey) ? 'teacher' : 'student';
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

    client.send('welcome', this.welcomePayload(client.sessionId, restored, position));
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
    if (op.type === 'catch' || op.type === 'award') { client.send('wallet', { ok: false, op: op.type, error: 'this reward is granted by the server', ...this.walletPayload(client.sessionId) }); return; }
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
      default:
        client.send('teacher:ack', { cmd, ok: false, error: 'unknown command' });
    }
  }

  // ---- helpers ------------------------------------------------------------------

  tick() {
    const now = Date.now();
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
      battle: null,
      battleDay: '',
      battleCoins: 0,
      move: sanitizeMove(record.move),
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
  atHut(sessionId, hutId) {
    const player = this.state.players.get(sessionId);
    const hut = SCHOOL.spotById.get(hutId);
    if (!player || !hut) return false;
    if (player.space !== SCHOOL.id) return false;
    return Math.hypot(player.x - hut.wx, player.z - hut.wz) <= SCHOOL.radius + SPOT_SLACK;
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
    const player = this.state.players.get(sessionId);
    const stand = ARENA.spotById.get(standId);
    if (!player || !stand) return false;
    if (player.space !== ARENA.id) return false;
    return Math.hypot(player.x - stand.wx, player.z - stand.wz) <= ARENA.radius + SPOT_SLACK;
  }

  // Roblox capped what a day of battling could pay, so the arena stays a game rather
  // than a coin tap. The cap is per child per day and survives a rejoin through the same
  // record everything else does.
  battleRoom(priv) {
    const day = new Date().toISOString().slice(0, 10);
    if (priv.battleDay !== day) { priv.battleDay = day; priv.battleCoins = 0; }
    return Math.max(0, DAILY_CAP - priv.battleCoins);
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
        priv.battleCoins += paid;
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
    const player = this.state.players.get(sessionId);
    const spot = MISSIONS.island.spotById.get(spotId);
    if (!player || !spot) return false;
    if (player.space !== MISSIONS.island.id) return false;
    return Math.hypot(player.x - spot.wx, player.z - spot.wz) <= MISSIONS.island.radius + SPOT_SLACK;
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
      battle: priv.battle ? { ...statePayload(priv.battle), stand: priv.battle.stand, quiz: quizPayload(priv.battle) } : null,
      chatPaused: this.state.chatPaused, teacherId: this.state.teacherId, missionId: this.state.missionId, maxClients: this.maxClients,
      patchRateMs: config.patchRateMs, serverTime: Date.now(),
    };
  }
}
