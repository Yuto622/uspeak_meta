// One ClassRoom = one class. Positions are client-declared; coins, catches, answers
// and learning logs are decided here and only here.
import { timingSafeEqual } from 'node:crypto';
import { Room, ServerError, matchMaker } from '../colyseus.js';
import { RoomState, Player, ANIMS } from '../schema.js';
import { config } from '../config.js';
import { judge, xpFor, JudgeError } from '../game/judge.js';
import { applyOp, sanitizeWallet, EconomyError } from '../game/economy.js';
import { blankPlayerRecord } from '../store/records.js';
import { PHRASE_IDS } from '../phrases.js';
import { log } from '../log.js';

export const ERR = { NAME_REQUIRED: 4000, NAME_IN_USE: 4001, ROOM_FULL: 4002 };
const POSITION_RESTORE_MS = 2 * 60 * 60 * 1000; // restore last position only within a lesson window
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
    this.onMessage('profile', (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.avatar = sanitizeAvatar(msg?.avatar);
    });
    this.onMessage('wallet:get', (client) => client.send('wallet', { ok: true, op: 'get', ...this.walletPayload(client.sessionId) }));
    this.onMessage('ping', (client, t) => client.send('pong', { t, server: Date.now() }));

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
    const xp = xpFor(result);
    let walletChanged = false;
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
      ...(walletChanged ? this.walletPayload(client.sessionId) : {}),
    });
  }

  onEconomy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || !msg || typeof msg !== 'object') return;
    const op = { type: String(msg.op || ''), id: typeof msg.id === 'string' ? msg.id.slice(0, 40) : undefined, quantity: msg.quantity };
    if (op.type === 'catch') { client.send('wallet', { ok: false, op: op.type, error: 'catches are awarded by answers', ...this.walletPayload(client.sessionId) }); return; }
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
    this.broadcast('chat', { from: client.sessionId, name: player.name, id, t: now });
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
      case 'roster': {
        const roster = [];
        for (const [id, p] of this.state.players) {
          const priv = this.priv.get(id);
          roster.push({ id, name: p.name, role: p.role, connected: p.connected, space: p.space, coins: priv?.wallet.coins ?? 0, correct: priv?.stats.correct ?? 0, attempts: priv?.stats.attempts ?? 0 });
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
      }),
      stats: { correct: Math.max(0, Math.floor(num(record.correct))), attempts: Math.max(0, Math.floor(num(record.attempts))) },
      progressJson: typeof record.progress_json === 'string' ? record.progress_json : '',
      progressAt: 0,
      lastAnswerAt: 0,
      lastChatAt: 0,
      lastMoveAt: 0,
      lastSeen: null,
      reconnect: null,
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
      progress_json: priv.progressJson, updated_at: iso, last_seen: priv.lastSeen,
    });
  }

  coinRow(sessionId, entry) {
    const priv = this.priv.get(sessionId);
    return [new Date().toISOString(), this.classCode, priv?.name || '', entry.op, entry.item, entry.quantity, entry.delta, entry.balance, sessionId];
  }

  walletPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    if (!priv) return { wallet: null };
    const w = priv.wallet;
    return { wallet: { coins: w.coins, inventory: { ...w.inventory }, owned: [...w.owned], wands: [...w.wands], wand: w.wand, catches: w.catches } };
  }

  welcomePayload(sessionId, restored, position) {
    const priv = this.priv.get(sessionId);
    const player = this.state.players.get(sessionId);
    return {
      sessionId, role: player.role, classCode: this.classCode, restored, position,
      ...this.walletPayload(sessionId), stats: { ...priv.stats }, progressJson: priv.progressJson,
      chatPaused: this.state.chatPaused, teacherId: this.state.teacherId, maxClients: this.maxClients,
      patchRateMs: config.patchRateMs, serverTime: Date.now(),
    };
  }
}
