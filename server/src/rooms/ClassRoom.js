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
import { cleanSay, MAX_CHARS } from '../game/say.js';
import { MISSIONS } from '../game/missions.js';
import { blankProgress, sanitizeProgress, grantXp, totalXp, xpToNext, REWARDS, eikenReward } from '../game/progression.js';
import { SCHOOL, createSession, questionPayload, answerSession, QUESTIONS_PER_SESSION } from '../game/wordquiz.js';
import { MODES as GYM_MODES, WORDS, createSet, questionPayload as gymPayload, answerSet } from '../game/gym.js';
import { ARENA, createBattle, statePayload, quizPayload, chooseWaza, answerQuiz, BattleError, DAILY_CAP } from '../game/battle.js';
import { moveForFish, sanitizeMove } from '../game/fish-moves.js';
import { PET_ISLAND, EGG_COST, hatch, sanitizePet, petPayload, act as petAct, PetError } from '../game/pets.js';
import { phaseAt } from '../../../client/dist/world-clock.js';
import { NIGHT, REACH as GHOST_REACH, COINS as GHOST_COINS, DAILY_CAP as GHOST_CAP, RESPAWN_MS, ghostPayload, sanitizeCaps, roomLeft } from '../game/night.js';
// 月ごとの学習記録。**答えた瞬間にその月の箱へ1つ足す**（学習ログは追記専用で
// 読み返せないので、月末に数え直すことができない）。詳しくは game/months.js の頭。
import { sanitizeMonths, bump as bumpMonth, recentMonths } from '../game/months.js';
import { noticesFor, monthsInARow, lastYear } from '../game/retention.js';
// 英検の目安と準会場（`eiken-ready.js`）、先生のメモと声かけ（`notes.js`）、今日の5分（`quick5.js`）。
import { sanitizeReady, recordEiken, readinessOf, classExamPlan, GRADES as READY_GRADES } from '../game/eiken-ready.js';
import { sanitizeNotes, addNote, removeNote, lastCall, cleanText as cleanNote, FOLLOW_DAYS } from '../game/notes.js';
import { createQuick, quickPayload, answerQuick, QuickError } from '../game/quick5.js';
import { EIKEN, ISLANDS as EIKEN_ISLANDS, EIKEN_CAP, INTERVIEW_ROOM, createSession as createEikenSet, questionPayload as eikenPayload, answerSession as answerEikenSet, EikenError, LEVELS as EIKEN_LEVELS, levelOf as eikenLevelOf } from '../game/eiken.js';
import {
  startInterview, interviewStep, interviewPayload, interviewResult, scriptedLine,
  INTERVIEW_XP, InterviewError,
} from '../game/interview.js';
import { TALK, isTalkSpace } from '../game/talk.js';
import { CONV, asMission as convMission, topicPayload as convPayload, convSpots } from '../game/conv.js';
import {
  createRace, joinRace, leaveRace, maybeStart, beginIfDue, crossCheckpoint, standings,
  raceOver, prizeFor, itemXp, coursePayload, LAPS, GRID_MS, MAX_RACERS,
} from '../game/race.js';
import {
  createGP, joinGP, leaveGP, tickGP, claimCp, claimItem, raceOverGP, gpPayload,
  standings as gpStandings, placeOf as gpPlaceOf, prizeFor as gpPrizeFor,
  MAX_RACERS as GP_MAX, XP_ITEM, GP_TICK_MS,
} from '../game/gp.js';
import { mintToken, stageReady, stageRoomName, stageUrl, STAGE_MAX } from '../game/stage.js';
import { TOWN_ISLAND, BLOCKS, PROPS, PLAZA, ROOMS, roomOfTier, nextRoom, blockPayload, propPayload, sanitizeBlocks, sanitizeProps, sanitizeRoom, sanitizePlaza, roomPayload, plazaPayload, place as placeBlock, remove as removeBlock, placeProp, removeProp, TownError } from '../game/town.js';
import { GEAR, gearPayload } from '../game/blockwild-shop.js';
import { LAND, LAND_ISLAND, sanitizeLand, landPayload, islandPayload as landIslandPayload, priceOfNext as landPriceOfNext, priceOfRestyle as landPriceOfRestyle, LandError } from '../game/land.js';
import { RIDE, ISLAND as RIDE_ISLAND, COURSE, COURSE_CAP, vehiclePayload, sanitizeGarage, sanitizeRiding } from '../game/vehicles.js';
import { claimLogin, sanitizeLogin, sanitizeWeek, addWeekXp, weekIndex, daysLeftInWeek, seasonFor, dayIndex, LOGIN_REWARDS, CYCLE } from '../game/daily.js';
import { SKILLS, blankSkills, sanitizeSkills, addAnswer, radarOf, weakestOf, FULL as SKILL_FULL } from '../game/skills.js';
import { WARDROBE, shopPayload, priceOf, wear as wearItem, sanitizeOwned as sanitizeWardrobe, sanitizeWorn, WardrobeError } from '../game/wardrobe.js';
import { createGate } from '../game/gate.js';
import { FARM, sanitizeFarm, settle as settleFarm, statePayload as farmPayload, prepare as prepareFarm, judge as judgeFarm, askPayload as farmAsk, spotForAct, FarmError } from '../game/farm.js';
import { reportPath, exportPath, classPath } from '../game/report.js';
import { createTutor } from '../ai/tutor.js';
import { log } from '../log.js';

export const ERR = { NAME_REQUIRED: 4000, NAME_IN_USE: 4001, ROOM_FULL: 4002, NOT_ON_ROSTER: 4004 };
const POSITION_RESTORE_MS = 2 * 60 * 60 * 1000; // restore last position only within a lesson window
// A little more room than the client shows the prompt in, so a position that arrived a
// frame late never refuses a child who is visibly standing at the counter.
const SPOT_SLACK = 1.5;
const PERFECT_BONUS_COINS = 10;
// 通話. A mesh call is every browser connected to every other one, so a room holds a
// handful rather than a class; the rest of the class is in the other rooms.
const VOICE_MAX = 6;
// How long after a child's last move or answer their time still counts as study.
const STUDY_IDLE_MS = 2 * 60 * 1000;
const VOICE_MODES = ['all', 'rooms', 'off'];   // どこでも（既定）/ おはなし島だけ / ぜんぶ止める
const SIGNAL_MAX_BYTES = 8192;     // an SDP offer is ~4KB; a candidate is a line
const SIGNAL_BURST = 120;          // per five seconds, per child   // Roblox: COIN_PERFECT_BONUS, for a clean ten
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
  // きせかえ. Only real items, one per slot — this string is what every other browser in
  // the class builds this child's body from, so a page cannot dress itself in something
  // that does not exist by sending it here.
  const wear = sanitizeWorn(WARDROBE, a.wear);
  if (wear.length) out.wear = wear;
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
    this.state.stageOpen = stageReady();
    this.setPatchRate(config.patchRateMs);
    this.priv = new Map(); // sessionId -> private server-side record

    this.onMessage('move', (client, msg) => this.onMove(client, msg));
    this.onMessage('answer', (client, msg) => this.onAnswer(client, msg));
    this.onMessage('economy', (client, msg) => this.onEconomy(client, msg));
    this.onMessage('progress', (client, msg) => this.onProgress(client, msg));
    this.onMessage('chat', (client, msg) => this.onChat(client, msg));
    this.onMessage('teacher', (client, msg) => {
      // **投げっぱなしにしない。** `carryover` は保存を読み書きするので失敗しうる。
      // 捕まえないと unhandled rejection になり、授業中のクラス全員が切れる。
      this.onTeacher(client, msg).catch((err) => {
        log.warn(`[room ${this.roomId}] teacher command failed:`, err?.message || err);
        try { client.send('teacher:ack', { cmd: msg?.cmd || '', ok: false, error: 'server error' }); } catch { /* 切れている */ }
      });
    });
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
    this.onMessage('interview:start', (client, msg) => this.onInterviewStart(client, msg));
    this.onMessage('interview:say', (client, msg) => this.onInterviewSay(client, msg));
    this.onMessage('interview:quit', (client) => this.onInterviewQuit(client));
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
    // BLOCKWILD の中の店（U-Speak コイン）：ブロックは同じ棚から、武器などは blockwild-gear.json から。
    this.onMessage('bw:shop', (client) => client.send('bw:shop', { gear: [...GEAR.values()].map(gearPayload), ...this.shopPayload(client.sessionId) }));
    this.onMessage('bw:buy', (client, msg) => this.onBwBuy(client, msg));
    this.onMessage('room:enter', (client) => this.onRoomEnter(client));
    this.onMessage('room:place', (client, msg) => this.onRoomPlace(client, msg));
    this.onMessage('room:remove', (client, msg) => this.onRoomRemove(client, msg));
    this.onMessage('room:move', (client) => this.onRoomMove(client));
    this.onMessage('land:open', (client) => this.onLandOpen(client));
    this.onMessage('land:buy', (client, msg) => this.onLandBuy(client, msg));
    this.onMessage('land:restyle', (client, msg) => this.onLandRestyle(client, msg));
    this.onMessage('land:enter', (client) => this.onLandEnter(client));
    this.onMessage('land:board', (client) => this.onLandBoard(client));
    this.onMessage('land:visit', (client, msg) => this.onLandVisit(client, msg));
    this.onMessage('prop:list', (client) => client.send('prop:shop', this.propShopPayload(client.sessionId)));
    this.onMessage('prop:buy', (client, msg) => this.onPropBuy(client, msg));
    this.onMessage('plaza:enter', (client) => this.onPlazaEnter(client));
    this.onMessage('plaza:place', (client, msg) => this.onPlazaPlace(client, msg));
    this.onMessage('plaza:remove', (client, msg) => this.onPlazaRemove(client, msg));
    this.onMessage('ride:list', (client) => client.send('ride:garage', this.garagePayload(client.sessionId)));
    this.onMessage('ride:buy', (client, msg) => this.onRideBuy(client, msg));
    this.onMessage('ride:equip', (client, msg) => this.onRideEquip(client, msg));
    this.onMessage('race:join', (client) => this.onRaceJoin(client));
    this.onMessage('race:leave', (client) => this.onRaceLeave(client, 'left'));
    this.onMessage('race:gate', (client, msg) => this.onRaceGate(client, msg));
    this.onMessage('race:item', (client, msg) => this.onRaceItem(client, msg));
    this.onMessage('gp:join', (client) => this.onGpJoin(client));
    this.onMessage('gp:leave', (client) => this.onGpLeave(client, 'left'));
    this.onMessage('gp:cp', (client, msg) => this.onGpCp(client, msg));
    this.onMessage('gp:item', (client, msg) => this.onGpItem(client, msg));
    this.onMessage('dash:get', (client) => this.onDashboard(client));
    this.onMessage('quick:start', (client, msg) => this.onQuickStart(client, msg));
    this.onMessage('quick:answer', (client, msg) => this.onQuickAnswer(client, msg));
    this.onMessage('quick:quit', (client) => { const priv = this.priv.get(client.sessionId); if (priv) priv.quick = null; client.send('quick:closed', { reason: 'quit' }); });
    this.onMessage('wear:list', (client) => this.onWearList(client));
    // ぼくじょう島. One question at a time, every answer judged here (game/farm.js).
    this.onMessage('farm:peek', (client) => this.onFarmPeek(client));
    this.onMessage('farm:open', (client, msg) => this.onFarmOpen(client, msg));
    this.onMessage('farm:act', (client, msg) => this.onFarmAct(client, msg));
    this.onMessage('farm:answer', (client, msg) => this.onFarmAnswer(client, msg));
    this.onMessage('farm:board', (client) => this.onFarmBoard(client));
    this.onMessage('wear:buy', (client, msg) => this.onWearBuy(client, msg));
    this.onMessage('wear:put', (client, msg) => this.onWearPut(client, msg));
    this.onMessage('profile', (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      const priv = this.priv.get(client.sessionId);
      if (!player) return;
      // Choosing a different face does not undress you, and a page cannot dress itself by
      // putting `wear` in a profile message: the outfit is whatever the room has recorded.
      player.avatar = sanitizeAvatar({ ...(msg?.avatar && typeof msg.avatar === 'object' ? msg.avatar : {}), wear: priv?.worn || [] });
    });
    this.onMessage('wallet:get', (client) => client.send('wallet', { ok: true, op: 'get', ...this.walletPayload(client.sessionId) }));
    this.onMessage('conv:list', (client) => client.send('conv:spots', { island: CONV.id, spots: convSpots() }));
    this.onMessage('conv:start', (client, msg) => this.onConvStart(client, msg));
    this.onMessage('conv:say', (client, msg) => this.onConvSay(client, msg));
    this.onMessage('conv:end', (client) => this.onConvEnd(client, 'quit'));
    this.onMessage('voice:join', (client) => this.onVoiceJoin(client));
    this.onMessage('voice:leave', (client) => this.onVoiceLeave(client, 'left'));
    this.onMessage('voice:msg', (client, msg) => this.onVoiceMsg(client, msg));
    this.onMessage('rtc:signal', (client, msg) => this.onRtcSignal(client, msg));
    this.onMessage('ping', (client, t) => client.send('pong', { t, server: Date.now() }));

    this.tutor = options.tutor || createTutor();
    // The register is read once per class and cached; the gate below decides who is let
    // in, and in the default 'open' mode it never even looks.
    this.gate = options.gate || createGate({
      store: this.store, roster: options.roster || this.store, ttlMs: config.rosterTtlMs,
      // ACCESS_MODE when set; otherwise the admin page's switch, read on every check.
      mode: options.access ? () => options.access.mode() : config.accessMode,
      version: () => options.access?.version ?? 0,
      snapshotPath: `${config.dataDir.replace(/\/$/, '')}/roster-snapshot.json`, log,
    });
    // Who has a microphone open, and where they were standing when they opened it.
    this.voice = new Map();          // sessionId -> { room, at }
    this.race = null;                // のりもの島: one race per class, or none
    this.gp = null;                  // the grand prix: one per class, on its own circuit
    this.gpTimer = null;             // …and its own 10 Hz clock, only while one is running
    this.stage = new Set();          // sessionIds a teacher has put on the stage (big rooms)
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
    // The outfit is the record's, not the joining page's: a child who bought a crown last
    // week is wearing it when they come back, on everyone's screen.
    player.avatar = sanitizeAvatar({ ...parseJson(auth.avatar, {}), wear: priv.worn });
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
    this.dropVoice(id, 'gone');
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
    // A plain timer outlives the room unless it is cleared, and a leaked one keeps the
    // process alive after the last class has gone home.
    this.gpClockOff();
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
    if (typeof msg.s === 'string' && msg.s.length <= 48) {
      // Walking out of the room is hanging up. Nobody presses anything to leave a call
      // here, the same way nobody presses anything to leave a building.
      if (player.space !== msg.s && this.voice.has(client.sessionId)) this.dropVoice(client.sessionId, 'moved');
      player.space = msg.s;
    }
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
    this.appendLearning([
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

  // A message to the class: either a preset phrase (an id from phrases.json) or the
  // child's own words. Both go through the same pause, the same clock and the same log;
  // only the phrase earns XP, because a child who is paid for typing types anything.
  onChat(client, msg) {
    const player = this.state.players.get(client.sessionId);
    const priv = this.priv.get(client.sessionId);
    if (!player || !priv) return;
    const typed = typeof msg?.text === 'string';
    const id = typeof msg?.id === 'string' ? msg.id : '';
    if (!typed && !PHRASE_IDS.has(id)) return;
    if (this.state.chatPaused && player.role !== 'teacher') { client.send('chat:blocked', { reason: 'paused' }); return; }
    const now = Date.now();
    if (now - priv.lastChatAt < config.chatMinIntervalMs) { client.send('chat:blocked', { reason: 'rate' }); return; }
    priv.lastChatAt = now;
    if (typed) {
      const text = this.acceptSay(client, msg.text, 'chat');
      if (!text) return;
      this.broadcast('chat', { from: client.sessionId, name: player.name, text, t: now });
      return;
    }
    priv.progress.chats += 1;
    const level = this.awardXp(client.sessionId, REWARDS.phrase.xp, `phrase:${id}`);
    this.broadcast('chat', { from: client.sessionId, name: player.name, id, t: now });
    // Named 'xp', not 'progress': the client already sends 'progress' upward for the
    // adventure save blob, and two meanings on one name is how bugs get planted.
    client.send('xp', { ...this.progressPayload(client.sessionId), levels: level?.levels || 0 });
  }

  // The one place a typed message is judged, for the class chat and the room's written
  // channel alike: the teacher's switch, the length, the words, and the log line. Returns
  // the text to pass on, or nothing — having already told the child why.
  acceptSay(client, raw, where) {
    const player = this.state.players.get(client.sessionId);
    const priv = this.priv.get(client.sessionId);
    if (!player || !priv) return '';
    if (!this.state.freeChat && player.role !== 'teacher') {
      client.send('chat:blocked', { reason: 'free off' });
      return '';
    }
    const out = cleanSay(raw, { last: priv.lastSayText });
    const row = (what, text, ok) => this.appendLearning([
      new Date().toISOString(), this.classCode, priv.name, what, 'chat',
      String(text).slice(0, 80), ok, 0, client.sessionId,
    ]);
    if (!out.ok) {
      client.send('chat:blocked', { reason: out.reason, max: MAX_CHARS });
      // A refused message is kept as well as refused. A teacher told "somebody typed
      // something unkind" should be able to see what and when, rather than having to
      // take one child's word against another's.
      if (out.reason === 'word' || out.reason === 'contact') row(`chat:blocked:${out.reason}`, raw, 0);
      return '';
    }
    priv.lastSayText = out.text;
    row(`chat:${where}`, out.text, 1);
    return out.text;
  }

  // `carryover` だけが保存を読みに行くので async。ほかのコマンドはその場で終わる。
  async onTeacher(client, msg) {
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
      case 'voice': {
        // 'all' is the default the class starts in, so a teacher never has to do anything
        // for a call to work anywhere; the command is for narrowing it to おはなし島 when a
        // lesson needs quiet, or closing everything at once.
        const mode = VOICE_MODES.includes(msg.mode) ? msg.mode : (msg.on === true ? 'all' : msg.on === false ? 'off' : 'all');
        this.state.voice = mode;
        // Anyone now standing somewhere that is no longer open is taken out of their call.
        for (const [id] of [...this.voice]) {
          const player = this.state.players.get(id);
          if (!player || !this.voiceOpenFor(player.space)) this.dropVoice(id, 'closed');
        }
        this.broadcast('notice', { text: {
          all: 'おはなしを ひらきました。どの島の どの部屋でも 話せます。',
          rooms: 'おはなしは おはなし島だけに なりました。',
          off: 'おはなしは 先生が とじました。',
        }[mode] }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, mode, on: mode === 'all' });
        log.info(`[room ${this.roomId}] voice mode "${mode}" by "${me.name}"`);
        return;
      }
      // ステージ. In a big room only the teacher is seen; this is how a child gets to show
      // the class their face, their screen and their English. The child's browser is given
      // a new ticket saying so — a page cannot put itself on the stage, because the ticket
      // is signed here.
      case 'stage': {
        const target = typeof msg?.target === 'string' ? msg.target : '';
        const student = this.state.players.get(target);
        if (!student) { client.send('teacher:ack', { cmd, ok: false, error: 'no such student' }); return; }
        const room = this.voiceRoomOf(target);
        if (!room || this.voiceKindOf(room) !== 'sfu') {
          client.send('teacher:ack', { cmd, ok: false, error: 'not in a big room' });
          return;
        }
        const on = msg.on !== false;
        if (on) this.stage.add(target); else this.stage.delete(target);
        this.sendStageToken(target, on ? 'stage' : 'unstage');
        this.clients.find((c) => c.sessionId === target)?.send('notice', {
          text: on ? 'ステージに 上がりました。カメラと がめんが つかえます。' : 'ステージから おりました。',
        });
        client.send('teacher:ack', { cmd, ok: true, target, on });
        log.info(`[room ${this.roomId}] "${student.name}" ${on ? 'on' : 'off'} the stage in ${room}`);
        return;
      }
      case 'eiken': {
        // 英検の はんていの きびしさ。**先生だけ**が変えられる（このコマンドは
        // すでに講師キーで守られている枠の中にある）。クラスで1つなのは、同じ答えが
        // 子どもによって ○ になったり × になったりすると比べられなくなるから。
        const want = eikenLevelOf(msg.level);
        if (!EIKEN_LEVELS.includes(msg.level)) { client.send('teacher:ack', { cmd, ok: false, error: 'unknown level' }); return; }
        this.state.eikenLevel = want;
        const said = { strict: 'きびしい', normal: 'ふつう', easy: 'やさしい' }[want];
        this.broadcast('notice', { text: `英検の はんていは「${said}」に なりました。` }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, level: want });
        log.info(`[room ${this.roomId}] eiken judging set to ${want}`);
        return;
      }
      case 'free': {
        // Free typing off: the chat falls back to the preset phrases, which is where it
        // started. Nothing else changes — the panel, the log and the phrases stay.
        this.state.freeChat = !!msg.on;
        this.broadcast('notice', { text: this.state.freeChat ? 'じゆうに かけるように なりました。' : 'いまは えらんだ フレーズだけ 送れます。' }, { except: client });
        client.send('teacher:ack', { cmd, ok: true, free: this.state.freeChat });
        break;
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
        // **気づき。** 名簿は「いま繋がっている子」しか映さないので、辞めかけている子は
        // そもそも出てこない。クラスの記録ぜんぶから、本人の過去と比べて
        // 「声をかけたほうがいい子」「伸びている子」を出す（`game/retention.js`）。
        // 塾向けの Comiru で継続に効いているのがこの「退塾予備軍の早期発見」だった。
        // 英検の準会場の見込みも、ここで一緒に返す（名簿と同じ間隔で新しくなる）。
        const rows = this.classRows();
        const plan = classExamPlan(rows);
        client.send('roster', {
          players: roster, chatPaused: this.state.chatPaused, freeChat: this.state.freeChat,
          eikenLevel: this.state.eikenLevel, notices: this.noticeRows(rows),
          exam: {
            readyTotal: plan.readyTotal, closeTotal: plan.closeTotal, outlook: plan.outlook,
            open: plan.open, likely: plan.likely, short: plan.short, min: plan.min,
            byGrade: Object.fromEntries(READY_GRADES.map((g) => [g, { label: plan.byGrade[g].label, ready: plan.byGrade[g].ready, close: plan.byGrade[g].close }])),
          },
        });
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
        // クラスぜんぶを1枚の CSV に落とすリンクも一緒に返す。**教室が自分の記録を
        // いつでも持ち出せる**ことを、探さずに見えるところに置いておく。
        client.send('teacher:ack', {
          cmd, ok: true, links, csv: base + exportPath(config.reportSecret, this.classCode),
          // 教室のようす（オーナー向け）。継続率・声かけの結果・英検の準会場。
          classUrl: base + classPath(config.reportSecret, this.classCode),
        });
        return;
      }
      case 'note':
      case 'called':
      case 'unnote': {
        // **先生のメモ・声かけ。** 書けるのは先生だけ（この枠がすでに講師キーで守られている）。
        // いま部屋にいない子にも書ける：保存を直接書きかえる。いる子は部屋の側に書く
        // （保存に書くと、次の persist で部屋の古い側に上書きされるため）。
        const name = sanitizeName(msg.name);
        if (!name) { client.send('teacher:ack', { cmd, ok: false, error: 'no name' }); return; }
        const result = await this.editNotes(name, (notes) => {
          if (cmd === 'unnote') return removeNote(notes, String(msg.id || '')) ? { removed: String(msg.id) } : null;
          const entry = addNote(notes, {
            kind: cmd === 'called' ? 'call' : 'note',
            text: cmd === 'called' ? cleanNote(msg.why || '声をかけました') : msg.text,
            share: cmd === 'note' && msg.share === true,
            by: me.name,
          });
          return entry ? { entry } : null;
        });
        if (!result) { client.send('teacher:ack', { cmd, ok: false, error: cmd === 'note' ? 'empty note' : 'not found' }); return; }
        if (result.error) { client.send('teacher:ack', { cmd, ok: false, error: result.error }); return; }
        client.send('teacher:ack', { cmd, ok: true, name, ...result.value, notes: result.notes });
        return;
      }
      case 'notes': {
        // 1人ぶんのメモ（保護者に見せないものも含めて全部）と、英検の目安。
        const name = sanitizeName(msg.name);
        const record = name ? await this.recordOf(name) : null;
        if (!record) { client.send('teacher:ack', { cmd, ok: false, error: 'not found' }); return; }
        client.send('teacher:ack', {
          cmd, ok: true, name,
          notes: record.notes, exam: readinessOf(record.ready),
        });
        return;
      }
      case 'carryover': {
        // **年度またぎ。** 記録は `クラス|なまえ` で引いているので、4月にクラス名が
        // 変わると、その子は0から始まってしまう。3年つづけた子の3年分が消えるのは、
        // このサービスがいちばん失ってはいけないもの。
        //
        // 先生は**新しいクラスに入った状態で**、前のクラス名を指定して引き継ぐ。
        // - **上書きはしない。** 新しいクラスで既に遊んでいる子は、混ぜかたが一意に
        //   決まらないので飛ばす（どちらが正しいかを機械が決めてはいけない）。
        // - **前の記録は消さない。** 取り消せるようにしておく。
        // - **前のレポートのリンクは生かす。** 保護者に配ったURLは変えられないので、
        //   前の記録に「引っ越し先」を書いて、そちらを見せる（index.js の /report）。
        const from = typeof msg.from === 'string' ? msg.from.trim() : '';
        const names = Array.isArray(msg.names) ? msg.names.map((n) => String(n ?? '').trim()).filter(Boolean).slice(0, 200) : [];
        if (!from || from === this.classCode) { client.send('teacher:ack', { cmd, ok: false, error: 'from must be another class' }); return; }
        if (!names.length) { client.send('teacher:ack', { cmd, ok: false, error: 'no names' }); return; }
        const moved = []; const skipped = [];
        for (const name of names) {
          let old = null; let here = null;
          try {
            old = await this.store.loadPlayer(from, name);
            here = await this.store.loadPlayer(this.classCode, name);
          } catch (err) { skipped.push({ name, why: 'could not read' }); continue; }
          if (!old) { skipped.push({ name, why: 'not in the old class' }); continue; }
          if (here) { skipped.push({ name, why: 'already played in this class' }); continue; }
          // いま部屋にいる子は、置いたそばから上書きされてしまう。降りてから。
          if ([...this.priv.values()].some((p) => p.name === name)) { skipped.push({ name, why: 'is online right now' }); continue; }
          try {
            await this.store.savePlayer({ ...old, class: this.classCode, name, moved_from: from, updated_at: new Date().toISOString() });
            await this.store.savePlayer({ ...old, moved_to: this.classCode, updated_at: new Date().toISOString() });
            moved.push(name);
          } catch (err) { skipped.push({ name, why: 'could not write' }); }
        }
        client.send('teacher:ack', { cmd, ok: true, from, to: this.classCode, moved, skipped });
        log.info(`[room ${this.roomId}] carried over ${moved.length} from ${from} (skipped ${skipped.length})`);
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

  // 先生に出す「気づき」。クラスの記録ぜんぶを、**その子の過去のペース**と比べる。
  //
  // **いま部屋にいる子は、保存より部屋のほうが新しい。** 保存は折々にしか走らないので、
  // 目の前で遊んでいる子に「3週間来ていません」と出しかねない。繋がっている子は
  // 部屋の側（`priv`）で上書きしてから数える。
  //
  // **他人とは比べない。** ここで出るのは全部その子自身の過去との差で、
  // 教室の中の順位は作らない（順位は、下にいる子の保護者に見せられない）。
  // クラスの記録ぜんぶ。**いま部屋にいる子は部屋の側（`priv`）で上書き**する。
  // 気づき・準会場・声かけ済みの印は、全部これを読む。
  classRows(now = Date.now()) {
    const iso = new Date(now).toISOString();
    const live = new Map();
    for (const [id, player] of this.state.players) {
      const priv = this.priv.get(id);
      if (priv && player.role !== 'teacher') live.set(priv.name, priv);
    }
    let stored = [];
    try { stored = this.store.listClass?.(this.classCode) || []; } catch (err) {
      log.warn(`[room ${this.roomId}] class list failed:`, err.message);
    }
    const fromPriv = (priv) => ({ last_seen: iso, first_seen: priv.firstSeen, months: priv.months, ready: priv.ready, notes: priv.notes });
    const rows = [];
    const seen = new Set();
    for (const record of stored) {
      if (!record?.name) continue;
      seen.add(record.name);
      const priv = live.get(record.name);
      rows.push(priv ? { ...record, ...fromPriv(priv) } : record);
    }
    // 初日の子は、まだ保存に現れていないことがある。
    for (const [name, priv] of live) {
      if (seen.has(name)) continue;
      rows.push({ name, role: 'student', ...fromPriv(priv) });
    }
    return rows;
  }

  noticeRows(rows = this.classRows()) {
    const now = Date.now();
    const notices = noticesFor(rows, { now, sanitize: sanitizeMonths });
    // **声かけ済みの印。** 2週間以内に「声をかけた」を押した子には、その日を添える
    // （同じ子に毎日声をかけるボタンを押させない）。
    const byName = new Map(rows.map((r) => [r.name, r]));
    return notices.map((n) => {
      const r = byName.get(n.name);
      const call = lastCall(Array.isArray(r?.notes) ? r.notes : sanitizeNotes(r?.notes_json));
      const fresh = call && (now - Date.parse(call.at)) / 86400000 < FOLLOW_DAYS;
      return fresh ? { ...n, called: call.at } : n;
    });
  }

  // 1人ぶんの記録を、メモと英検の目安を読める形で。部屋にいればそちら、いなければ保存。
  livePriv(name) {
    for (const [id, player] of this.state.players) {
      const priv = this.priv.get(id);
      if (priv && priv.name === name && player.role !== 'teacher') return { id, priv };
    }
    return null;
  }

  async recordOf(name) {
    const live = this.livePriv(name);
    if (live) return { name, notes: live.priv.notes, ready: live.priv.ready, online: true, id: live.id };
    let record = null;
    try { record = await this.store.loadPlayer(this.classCode, name); } catch (err) { log.warn(`[room ${this.roomId}] load for notes failed:`, err.message); }
    // **読んでいるあいだに、その子が部屋に入ってきたかもしれない。** そのときは保存ではなく
    // 部屋の側に書く（保存に書くと、その子の次の persist で古いメモに上書きされる）。
    const joined = this.livePriv(name);
    if (joined) return { name, notes: joined.priv.notes, ready: joined.priv.ready, online: true, id: joined.id };
    if (!record || record.role === 'teacher' || record.moved_to) return null;
    return { name, notes: sanitizeNotes(record.notes_json), ready: sanitizeReady(record.eiken_json), online: false, record };
  }

  // メモを書きかえる。`fn(notes)` が null を返したら何も書かない。
  async editNotes(name, fn) {
    const found = await this.recordOf(name);
    if (!found) return { error: 'not found' };
    const value = fn(found.notes);
    if (!value) return null;
    if (found.online) {
      this.persist(found.id);
    } else {
      try {
        await this.store.savePlayer({ ...found.record, notes_json: JSON.stringify(found.notes), updated_at: new Date().toISOString() });
      } catch (err) {
        log.warn(`[room ${this.roomId}] could not save notes:`, err.message);
        return { error: 'could not write' };
      }
    }
    return { value, notes: found.notes };
  }

  // 部屋に先生がいるか。**おうちの日**（先生のいない時間に自分で答えた日）を決めるのに使う。
  teacherPresent() {
    for (const p of this.state.players.values()) if (p.role === 'teacher' && p.connected) return true;
    return false;
  }


  tick() {
    const now = Date.now();
    this.tickWorld(now);
    this.tickRace(now);
    this.tickVoice(now);
    this.tickStudy(now);
    for (const [id, player] of this.state.players) {
      const priv = this.priv.get(id);
      if (player.connected && priv && now - priv.lastMoveAt > STALE_MOVE_MS && player.anim !== 'idle') player.anim = 'idle';
    }
    if (now - this.lastPersistAll >= PERSIST_ALL_MS) {
      this.lastPersistAll = now;
      for (const id of this.priv.keys()) this.persist(id);
    }
  }

  // 総学習時間, a second at a time. Only for a child who is connected AND has done
  // something recently: the number on their page has to be time spent learning, not time
  // spent with the tab open, or it is worth nothing to the parent reading it.
  tickStudy(now) {
    for (const [id, player] of this.state.players) {
      if (!player.connected) continue;
      const priv = this.priv.get(id);
      if (!priv) continue;
      const last = Math.max(priv.study.activeAt, priv.lastMoveAt);
      if (last && now - last < STUDY_IDLE_MS) {
        priv.study.ms += 1000;
        bumpMonth(priv.months, { seconds: 1 }, { now });
      }
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
      lastSayText: '',      // the last thing they typed, so the same line twice is one line
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
      interview: null,        // 面接の間: one sitting at a time, and only while standing in it
      lastInterviewAt: 0,
      lastInterviewCard: '',  // so the next sitting is a different card
      // 英会話島: the scene being talked through, and the two limits that keep a day of
      // talking from becoming a bill.
      conv: null,
      lastConvAt: 0,
      convDay: '',
      convTurnsToday: 0,
      battle: null,
      // What today's caps have already paid, kept in the record so that leaving and
      // rejoining is not a way to start the day over.
      caps: sanitizeCaps({
        day: record.cap_day, battle: record.battle_coins, ghost: record.ghost_coins, course: record.course_coins,
        eiken: record.eiken_coins, conv: record.conv_coins, voice: record.voice_minutes, farm: record.farm_coins,
      }),
      // ぼくじょう島: the farm itself. Grows only when watered, so nothing to tick.
      farm: sanitizeFarm(parseJson(record.farm_json, null)),
      garage,
      riding: sanitizeRiding(record.riding, garage),
      bricks,
      props,
      room: sanitizeRoom(town, props),
      land: sanitizeLand(parseJson(record.land_json, null)),
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
      // きせかえ: what they have bought, and what they have on.
      wardrobe: sanitizeWardrobe(parseJson(record.wardrobe_json, [])),
      worn: sanitizeWorn(WARDROBE, parseJson(record.worn_json, [])),
      // 5技能: what has been practised, counted on the way past appendLearning().
      skills: sanitizeSkills(parseJson(record.skills_json, null)),
      // 月ごとのまとめ。保護者レポートの「今月」はここから出る。累計とは別に持つ
      // のは、累計からは今月ぶんを引き算できないから（去年の分が混ざる）。
      months: sanitizeMonths(record.months_json),
      // はじめてこのクラスで遊んだ日。沈黙期（最初の3か月）の子を名指しで拾うのに要る。
      // **古い記録には入っていない**ので、その場合はいま入れる——「この日より前から
      // 居る」は分かっても、何月何日かは分からないため、これが言える中でいちばん近い。
      firstSeen: typeof record.first_seen === 'string' && record.first_seen ? record.first_seen : new Date().toISOString(),
      // 英検の島の直近の正誤（級×技能で20問ずつ）。「練習で目安に届いたか」を出す。
      ready: sanitizeReady(record.eiken_json),
      // 先生のメモと声かけ。子どもの画面には一度も出ない（保護者にも、先生が選んだものだけ）。
      notes: sanitizeNotes(record.notes_json),
      // 今日の5分（どこからでも答えられる5問）。
      quick: null,
      lastQuickAt: 0,
      // 総学習時間 and 総学習日数. `activeAt` is the last thing they actually did, so a
      // tab left open on the bus does not become an hour of study.
      study: {
        ms: Math.max(0, Math.floor(num(record.study_ms))),
        days: Math.max(0, Math.floor(num(record.study_days))),
        day: Math.max(0, Math.floor(num(record.study_day))),
        activeAt: 0,
      },
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
      conv_coins: priv.caps.conv,
      voice_minutes: Math.floor(priv.caps.voice),
      wardrobe_json: JSON.stringify(priv.wardrobe), worn_json: JSON.stringify(priv.worn),
      skills_json: JSON.stringify(priv.skills),
      months_json: JSON.stringify(priv.months),
      eiken_json: JSON.stringify(priv.ready),
      notes_json: JSON.stringify(priv.notes),
      farm_json: JSON.stringify({ ...priv.farm, q: null }), farm_coins: priv.caps.farm,
      study_ms: Math.floor(priv.study.ms), study_days: priv.study.days, study_day: priv.study.day,
      garage_json: JSON.stringify(priv.garage), riding: priv.riding, lap_best: priv.lapBest,
      blocks_json: JSON.stringify(priv.bricks), props_json: JSON.stringify(priv.props),
      room_json: JSON.stringify({ tier: priv.room.tier, furniture: priv.room.furniture, plaza: priv.plaza }),
      land_json: JSON.stringify(priv.land),
      // Kept so a teacher's own row is not mistaken for a child's when the family
      // report links are drawn up.
      role: player.role,
      updated_at: iso, last_seen: priv.lastSeen, first_seen: priv.firstSeen,
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

  // マイページ. Everything a child's own page shows, worked out here: the room is the only
  // thing that knows what was actually answered, so the page is told the shape rather than
  // being trusted to compute it from anything it holds.
  //
  // The three counters are the ones the reference uses, and each carries "how much further
  // to the next one" — a number on its own is a fact, a number with a distance to the next
  // one is a reason to keep going, which for a seven-year-old is the whole difference.
  onDashboard(client) {
    const priv = this.priv.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!priv || !player) return;
    const minutes = Math.floor(priv.study.ms / 60000);
    const answers = priv.stats.attempts;
    const weak = weakestOf(priv.skills);
    client.send('dash:state', {
      name: priv.name,
      coins: priv.wallet.coins,
      progress: this.progressPayload(client.sessionId),
      streak: priv.login.streak,
      // 5技能. `full` is how many answers fill an axis, so the page can explain the shape
      // rather than just drawing it.
      skills: radarOf(priv.skills),
      full: SKILL_FULL,
      weakest: weak ? { id: weak.id, ja: weak.ja, en: weak.en, attempts: weak.attempts } : null,
      // `per` is how much of a thing earns the next ✧, and `toNext` how much of it is
      // left. Same unit as the value in all three, so "あと4分" and "あと7問" mean what
      // they say without the child converting anything.
      cards: [
        { id: 'time', ja: '総学習時間', en: 'Study time', value: minutes, unit: '分', per: 5, toNext: 5 - (minutes % 5) },
        { id: 'answers', ja: '総正解数', en: 'Answers right', value: priv.stats.correct, unit: '問', per: 25, toNext: 25 - (priv.stats.correct % 25) },
        { id: 'days', ja: '総学習日数', en: 'Days studied', value: priv.study.days, unit: '日', per: 30, toNext: 30 - (priv.study.days % 30) },
      ],
      accuracy: answers ? Math.round((priv.stats.correct / answers) * 100) : null,
      attempts: answers,
      // 今月のまとめ。**保護者レポートとまったく同じ数字**（同じ `recentMonths()` から
      // 出している）ので、家で見た数字と自分の画面が食い違うことがない。
      // 子どもにとっての意味は累計とは別で、累計は増えるいっぽうだが、今月は
      // **毎月0から始まる**。今日やれば今日増えるのが見えるのは、こちらのほう。
      months: recentMonths(priv.months, 4),
      // 何か月つづけているか。**日の連続ではなく「答えた月」の連続**で、
      // 途切れても煽らない（`docs/uspeak-retention.md`）。子どもに見せたいのは
      // 「自分はこれを続けている人だ」で、「切れるぞ」ではない。
      inARow: monthsInARow(priv.months),
      // 去年の同じ月。1年たった子にしか出ない。
      lastYear: lastYear(priv.months),
      // 英検の目安と、今日の5分の級（次にめざす級から出す）。
      exam: readinessOf(priv.ready),
    });
  }

  // ---- 今日の5分 ----------------------------------------------------------------------
  //
  // 島まで歩かなくても答えられる5問（英検の読む3・聞く2）。**位置で縛らない**のが
  // 他の島との違いで、そのぶんコインは英検の島と同じ1日の上限（EIKEN_CAP）に入れる
  // （どこからでも稼げる口を別に作らない）。採点・記録・英検の目安への反映は島と同じ。
  onQuickStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const want = typeof msg?.grade === 'string' && READY_GRADES.includes(msg.grade) ? msg.grade : null;
    const grade = want || readinessOf(priv.ready).aim || 'g5';
    try {
      priv.quick = createQuick(grade, Math.random, this.state.eikenLevel);
    } catch (err) {
      if (!(err instanceof QuickError)) throw err;
      client.send('quick:error', { reason: err.message });
      return;
    }
    client.send('quick:question', quickPayload(priv.quick));
  }

  onQuickAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const session = priv?.quick;
    if (!priv || !session) return;
    const now = Date.now();
    if (now - priv.lastQuickAt < config.answerMinIntervalMs) { client.send('quick:error', { reason: 'too fast' }); return; }
    priv.lastQuickAt = now;
    const result = answerQuick(session, msg);
    if (!result) return;
    priv.stats.attempts += 1;
    if (result.correct) priv.stats.correct += 1;
    const payload = { ...result };
    if (result.correct) {
      const rate = eikenReward(result.skill, session.grade);
      const paid = Math.min(rate.coins, roomLeft(priv.caps, 'eiken', EIKEN_CAP));
      if (paid > 0) {
        const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `quick:${session.grade}:${result.skill}` });
        priv.caps.eiken += paid;
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
      }
      payload.coins = paid;
      payload.capped = paid < rate.coins;
      const level = this.awardXp(client.sessionId, rate.xp, `quick:${session.grade}:${result.skill}`);
      payload.xp = rate.xp;
      payload.levels = level?.levels || 0;
    }
    if (recordEiken(priv.ready, session.grade, result.skill, result.correct, session.level) && result.correct) {
      bumpMonth(priv.months, { eg: session.grade });
    }
    this.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `quick:${session.grade}:${result.skill}:${session.level}:${result.index}`, result.skill,
      String(result.picked ?? '').slice(0, 80), result.correct ? 1 : 0, result.correct ? (payload.xp || 0) : 0, client.sessionId,
    ]);
    if (result.done) priv.quick = null;
    payload.progress = this.progressPayload(client.sessionId);
    payload.wallet = this.walletPayload(client.sessionId).wallet;
    payload.next = priv.quick ? quickPayload(priv.quick) : null;
    this.persist(client.sessionId);
    client.send('quick:result', payload);
  }

  // ---- きせかえ --------------------------------------------------------------------
  //
  // A shop, so the shop rules apply: the page asks and the room decides. What a page may
  // do on its own is put a hat on its own screen; what it may not do is own one, and the
  // avatar everyone else sees is built from `player.avatar`, which is written here.
  wornPayload(sessionId) {
    const priv = this.priv.get(sessionId);
    return { owned: [...priv.wardrobe], worn: [...priv.worn] };
  }

  // The outfit goes into the avatar string, because that is what every other child's
  // browser already reads to draw this one. A hat nobody else can see is a hat bought for
  // an empty room.
  pushOutfit(sessionId) {
    const player = this.state.players.get(sessionId);
    const priv = this.priv.get(sessionId);
    if (!player || !priv) return;
    player.avatar = sanitizeAvatar({ ...parseJson(player.avatar, {}), wear: priv.worn });
  }

  onWearList(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    client.send('wear:shop', {
      ...shopPayload({ owned: priv.wardrobe, worn: priv.worn, coins: priv.wallet.coins, level: priv.progress.level }),
      ...this.wornPayload(client.sessionId),
    });
  }

  onWearBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    try {
      const item = priceOf({
        id: msg?.id, owned: priv.wardrobe, coins: priv.wallet.coins, level: priv.progress.level,
      });
      const entry = applyOp(priv.wallet, { type: 'spend', amount: item.price, id: `wear:${item.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
      priv.wardrobe.push(item.id);
      // Bought is worn: a child who just paid for a hat wants to see it on, not to be
      // asked a second question.
      priv.worn = wearItem({ owned: priv.wardrobe, worn: priv.worn, id: item.id });
      this.pushOutfit(client.sessionId);
      this.persist(client.sessionId);
      client.send('wear:bought', {
        id: item.id, ...this.walletPayload(client.sessionId), ...this.wornPayload(client.sessionId),
      });
      this.onWearList(client);
      log.info(`[room ${this.roomId}] "${priv.name}" bought ${item.id} for ${item.price}`);
    } catch (err) {
      if (!(err instanceof WardrobeError)) throw err;
      client.send('wear:error', { reason: err.message });
    }
  }

  onWearPut(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    try {
      priv.worn = wearItem({ owned: priv.wardrobe, worn: priv.worn, id: msg?.id, off: !!msg?.off });
      this.pushOutfit(client.sessionId);
      this.persist(client.sessionId);
      client.send('wear:on', this.wornPayload(client.sessionId));
    } catch (err) {
      if (!(err instanceof WardrobeError)) throw err;
      client.send('wear:error', { reason: err.message });
    }
  }


  // ---- ぼくじょう島 ------------------------------------------------------------------
  //
  // 牧場物語's stamina, paid in English. The page asks to do something (`farm:act`), the
  // room answers with a question (`farm:ask`) and keeps the answer; the page sends what
  // the child chose, typed or arranged (`farm:answer`); the room judges, and only then
  // does the seed go in, the plot get watered, the box get shipped. Every action is
  // checked against the building the child is standing in, like every other island.
  // A building, or one of the two open places (the field, the pen): both are "stand here".
  atFarmSpot(sessionId, spotId) {
    const spot = FARM.placeById.get(spotId);
    return !!spot && this.atPlace(sessionId, FARM.island, spot);
  }

  farmState(sessionId) {
    const priv = this.priv.get(sessionId);
    settleFarm(priv.farm, Date.now());
    return { farm: farmPayload(priv.farm, Date.now()), ...this.walletPayload(sessionId) };
  }

  onFarmPeek(client) {
    if (!this.priv.get(client.sessionId)) return;
    client.send('farm:state', { spot: '', ...this.farmState(client.sessionId) });
  }

  onFarmOpen(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const spot = typeof msg?.spot === 'string' ? msg.spot : '';
    if (!FARM.placeById.has(spot)) { client.send('farm:error', { reason: 'no such spot' }); return; }
    if (!this.atFarmSpot(client.sessionId, spot)) { client.send('farm:error', { reason: 'too far', spot }); return; }
    client.send('farm:state', { spot, ...this.farmState(client.sessionId) });
  }

  onFarmAct(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const act = typeof msg?.act === 'string' ? msg.act : '';
    const spot = typeof msg?.spot === 'string' ? msg.spot : '';
    const where = spotForAct(act, spot);
    if (!where || !FARM.placeById.has(where)) { client.send('farm:error', { reason: 'unknown action' }); return; }
    if (!this.atFarmSpot(client.sessionId, where)) { client.send('farm:error', { reason: 'too far', spot: where }); return; }
    try {
      const q = prepareFarm(priv.farm, act, msg?.params || {}, { now: Date.now(), coins: priv.wallet.coins, spot: where });
      priv.farm.q = q;
      client.send('farm:ask', farmAsk(q));
    } catch (err) {
      if (!(err instanceof FarmError)) throw err;
      client.send('farm:error', { reason: err.message, act });
    }
  }

  onFarmAnswer(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const q = priv.farm.q;
    if (!q || q.id !== msg?.qid) { client.send('farm:error', { reason: 'no question' }); return; }
    const where = spotForAct(q.act, q.spot || '');
    if (!this.atFarmSpot(client.sessionId, where)) { client.send('farm:error', { reason: 'too far', spot: where }); return; }
    const now = Date.now();
    if (now - (priv.lastFarmAt || 0) < config.answerMinIntervalMs) { client.send('farm:error', { reason: 'too fast' }); return; }
    priv.lastFarmAt = now;
    priv.farm.q = null;
    const correct = judgeFarm(q, msg?.answer);
    const mode = `farm-${q.kind}`;
    const xp = correct ? (FARM.xp[q.kind] || 3) : 0;
    this.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `farm:${q.act}:${q.id}`, mode,
      String(Array.isArray(msg?.answer) ? msg.answer.join(' ') : msg?.answer ?? '').slice(0, 80), correct ? 1 : 0, xp, client.sessionId,
    ]);
    priv.stats.attempts += 1;
    const payload = { qid: q.id, act: q.act, kind: q.kind, correct, answer: q.answer, xp };
    if (correct) {
      priv.stats.correct += 1;
      // The cost is checked again now: coins may have gone elsewhere since the question.
      if (q.cost && priv.wallet.coins < q.cost) {
        client.send('farm:error', { reason: 'not enough coins', act: q.act });
        return;
      }
      let effect;
      try {
        effect = q.effect(priv.farm);
      } catch (err) {
        if (!(err instanceof FarmError)) throw err;
        client.send('farm:error', { reason: err.message, act: q.act });
        return;
      }
      if (effect.spend) {
        const entry = applyOp(priv.wallet, { type: 'spend', amount: effect.spend, id: effect.id });
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
      }
      if (effect.award) {
        // Shipping is the only way the farm pays, and it stops at the day's ceiling —
        // the English still counts (XP above) when the coins have run out.
        const left = roomLeft(priv.caps, 'farm', FARM.dailyCoinCap);
        const paid = Math.min(effect.award, left);
        if (paid > 0) {
          const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: effect.id });
          priv.caps.farm += paid;
          priv.farm.earned += paid;
          priv.farm.week.coins += paid;
          this.store.appendCoin(this.coinRow(client.sessionId, entry));
        }
        payload.coins = paid;
        payload.capped = paid < effect.award;
      }
      if (effect.prize) {
        // A festival's prize: once a season, outside the shipping day's ceiling.
        const entry = applyOp(priv.wallet, { type: 'award', amount: effect.prize, id: effect.id });
        priv.farm.earned += effect.prize;
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
        payload.coins = (payload.coins || 0) + effect.prize;
      }
      payload.effect = { en: effect.en, ja: effect.ja };
      const level = this.awardXp(client.sessionId, xp, `farm:${q.act}`);
      payload.levels = level?.levels || 0;
    }
    Object.assign(payload, this.farmState(client.sessionId), { progress: this.progressPayload(client.sessionId) });
    client.send('farm:result', payload);
    this.persist(client.sessionId);
  }

  // The class harvest festival: everyone's shipping this week, side by side. Read from
  // the records so children who are not online count too.
  onFarmBoard(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const wk = weekIndex();
    const rows = new Map();
    let records = [];
    try { records = this.store.listClass?.(this.classCode) || []; } catch (err) { log.warn(`[room ${this.roomId}] listClass failed:`, err.message); }
    for (const r of records) {
      if (r.role === 'teacher') continue;
      const f = sanitizeFarm(parseJson(r.farm_json, null));
      rows.set(r.name, { name: r.name, coins: f.week.key === wk ? f.week.coins : 0, shipped: f.shipped });
    }
    for (const [id, p] of this.priv) {
      const player = this.state.players.get(id);
      if (!player || player.role === 'teacher') continue;
      rows.set(p.name, { name: p.name, coins: p.farm.week.key === wk ? p.farm.week.coins : 0, shipped: p.farm.shipped });
    }
    const all = [...rows.values()];
    client.send('farm:board', {
      week: wk, total: all.reduce((s, r) => s + r.coins, 0), farmers: all.filter((r) => r.shipped > 0).length,
      top: all.sort((a, b) => b.coins - a.coins).slice(0, 5),
      me: { name: priv.name, coins: priv.farm.week.key === wk ? priv.farm.week.coins : 0 },
    });
  }

  // ---- 学習の記録 ------------------------------------------------------------------
  //
  // Every answer in the game passes through here on its way to the store. The row itself
  // is unchanged — it is the same nine columns a teacher has always been able to read —
  // but on the way past it is also counted towards one of the five skills, and towards
  // the two things a child cannot see from a coin balance: how long they have been at it
  // and how many days they have come back.
  //
  // Doing it here rather than at the eleven places that write a row means one map from
  // activity to skill, and a twelfth activity added later is counted whether or not
  // whoever adds it remembers this file exists.
  appendLearning(row) {
    try {
      const sessionId = row[8];
      const priv = this.priv.get(sessionId);
      if (priv) {
        addAnswer(priv.skills, row[4], Number(row[6]) === 1);
        this.markStudied(priv);
        // **11か所ある学習ログの書き込みは全部ここを通る**ので、月の箱もここで足す。
        // 12個目の活動を足した人が months.js を知らなくても数えられる。
        // **おうちの日**：先生が部屋にいない時間に答えたら、その日を「おうち」にも数える。
        // 端末の申告ではなく、部屋に先生がいたかをサーバーが見て決める。
        bumpMonth(priv.months, { answers: 1, correct: Number(row[6]) === 1 ? 1 : 0, xp: Number(row[7]) || 0 }, { day: true, home: !this.teacherPresent() });
      }
    } catch (err) {
      // A miscounted skill must never cost a child the record of the answer itself.
      log.warn('[skills] could not count an answer:', err.message);
    }
    return this.store.appendLearning(row);
  }

  // A day is "studied" the first time something is answered in it, not by logging in and
  // walking around: 総学習日数 on a child's page has to mean days they did some English.
  markStudied(priv, now = Date.now()) {
    const today = dayIndex(now);
    if (priv.study.day !== today) { priv.study.day = today; priv.study.days += 1; }
    priv.study.activeAt = now;
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
    // An open place (the farm's pen, its field) can say how far it reaches; a door uses the island's.
    return Math.hypot(player.x - spot.wx, player.z - spot.wz) <= (spot.reach ?? island.radius) + SPOT_SLACK;
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
    this.appendLearning([
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
    this.appendLearning([
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
    this.appendLearning([
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

  // ---- おはなし（部屋の中の通話）-------------------------------------------------------

  // The room a child walked into is the call they are in. There is no room list and no
  // invitation: everyone standing inside the same building hears everyone else, and
  // walking out is hanging up — which is the same rule as every other thing on these
  // islands, and the only one a seven-year-old needs.
  //
  // The media itself never comes here. Browsers talk to each other directly (WebRTC) and
  // this server only passes the introductions along, so a classroom's voices do not cost
  // the server bandwidth and are not recorded anywhere. What this server does decide is
  // who is allowed to be introduced to whom: the same class, the same room, a teacher
  // having opened it, and no more than a roomful.
  static get VOICE_MAX() { return VOICE_MAX; }

  // Where talking is open. The default is everywhere ('all'): a child who walks into a
  // building on any island is in the call with whoever else is inside, and おはなし島 is
  // a call by standing on it. A teacher can narrow it to that island alone ('rooms') when
  // a lesson needs quiet, or close all of it ('off').
  voiceOpenFor(space) {
    if (this.state.voice === 'off') return false;
    if (this.state.voice === 'all') return true;
    return isTalkSpace(space);
  }

  // The room a child is in. おはなし島 itself counts as one — that is the whole point of it
  // — and everywhere else it is a building walked into: "in:<island>:<building>". A child's
  // own マイルーム and their building lot are theirs alone, and an island is not a call.
  voiceRoomOf(sessionId) {
    const player = this.state.players.get(sessionId);
    const space = player?.space || '';
    if (space === TALK.id) return space;
    return /^in:[^:]+:[^:]+$/.test(space) ? space : '';
  }

  // How many the room is meant to hold, from the island's own data. おはなし島's plaza is
  // where a whole school gathers; every other room is a handful of children in a building.
  voiceRoomMax(room) {
    return room === TALK.id ? Math.min(TALK.plaza.max, STAGE_MAX) : VOICE_MAX;
  }

  // Which of the two kinds of call this room is. A mesh is every browser connected to
  // every other one — fine for six, impossible for a hundred — so a room meant for more
  // than a handful runs through the SFU instead. With no SFU configured there is no
  // second kind: the big room falls back to a six-child mesh, and the panel says so.
  voiceKindOf(room) {
    if (!stageReady()) return 'mesh';
    return this.voiceRoomMax(room) > VOICE_MAX || config.voice.sfuAll ? 'sfu' : 'mesh';
  }

  // The hall: the one room built for more than a handful, where cameras are rationed.
  voiceIsHall(room) {
    return this.voiceRoomMax(room) > VOICE_MAX;
  }

  // What the room actually holds right now, which is the smaller of what it was built for
  // and what this server can carry.
  voiceCapOf(room) {
    return this.voiceKindOf(room) === 'sfu' ? this.voiceRoomMax(room) : Math.min(this.voiceRoomMax(room), VOICE_MAX);
  }

  // Who may be seen, not just heard. A hundred cameras at once is not a lesson, so in a
  // big room the picture belongs to the teacher and to whoever the teacher has put on the
  // stage; in a small room everyone has always had a camera and keeps it.
  voiceCanPublish(sessionId, room) {
    const player = this.state.players.get(sessionId);
    // A six-child room routed through the SFU (VOICE_SFU_ALL) is still a six-child room:
    // everyone keeps their camera. Only the hall rations them.
    if (this.voiceKindOf(room) !== 'sfu' || !this.voiceIsHall(room)) return { camera: true, screen: true };
    const staged = player?.role === 'teacher' || this.stage.has(sessionId);
    return { camera: staged, screen: staged };
  }

  // The ticket into a big room: minted here, for this child, for this room, saying what
  // they may publish. Sent on joining and again whenever a teacher changes that.
  sendStageToken(sessionId, reason = 'join') {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    const player = this.state.players.get(sessionId);
    const room = this.voiceRoomOf(sessionId);
    if (!client || !player || !room || this.voiceKindOf(room) !== 'sfu') return false;
    const can = this.voiceCanPublish(sessionId, room);
    const token = mintToken({
      room: stageRoomName(this.state.classCode, room),
      identity: sessionId,
      name: player.name,
      camera: can.camera,
      screen: can.screen,
    });
    if (!token) return false;
    client.send('voice:token', { room, url: stageUrl(), token, can, max: this.voiceCapOf(room), reason });
    return true;
  }

  voicePeers(room, except = '') {
    const peers = [];
    for (const [id, seat] of this.voice) {
      if (seat.room !== room || id === except) continue;
      const player = this.state.players.get(id);
      if (player?.connected) peers.push({ id, name: player.name, role: player.role });
    }
    return peers;
  }

  onVoiceJoin(client) {
    const id = client.sessionId;
    const player = this.state.players.get(id);
    if (!player) return;
    const room = this.voiceRoomOf(id);
    if (!room) { client.send('voice:error', { reason: 'not in a room' }); return; }
    if (!this.voiceOpenFor(player.space)) { client.send('voice:error', { reason: 'closed' }); return; }
    // A microphone open all day is the same exposure a runaway AI conversation would be,
    // and it had no guard at all: a tab left in a call room, forgotten overnight, would
    // simply run — and on the big room, run up a real LiveKit bill. A teacher is exempt,
    // the same as the room-full check above exempts them.
    const priv = this.priv.get(id);
    if (priv && player.role !== 'teacher' && this.voiceMinutesLeft(priv) <= 0) {
      client.send('voice:error', { reason: 'daily limit' });
      return;
    }
    const peers = this.voicePeers(room, id);
    const cap = this.voiceCapOf(room);
    // A teacher is always let in: the one grown-up in the room is not an optional guest.
    if (peers.length >= cap && player.role !== 'teacher') {
      client.send('voice:error', { reason: 'room is full', max: cap });
      return;
    }
    const kind = this.voiceKindOf(room);
    // Which relays the browsers may use to reach each other (a TURN server, when the
    // school has one): the page gets them here, with the room, never from a file it
    // could fetch on its own.
    const ice = config.voice.iceServers.length ? { ice: config.voice.iceServers } : {};
    if (this.voice.get(id)?.room === room) { client.send('voice:room', { room, kind, peers, me: id, max: cap, ...ice }); return; }
    this.dropVoice(id, 'moved');
    this.voice.set(id, { room, at: Date.now(), signals: 0, since: Date.now() });
    // The newcomer is told who is already here and calls them; everyone here is told
    // someone arrived and waits to be called. One offer per pair, decided by arrival.
    // In a big room there is nobody to call: the SFU is the one connection each browser
    // makes, and who is in the room comes from it rather than from here.
    client.send('voice:room', { room, kind, peers: kind === 'sfu' ? [] : peers, me: id, max: cap, ...ice });
    if (kind === 'sfu') this.sendStageToken(id, 'join');
    else {
      for (const peer of peers) {
        this.clients.find((c) => c.sessionId === peer.id)
          ?.send('voice:peer', { id, name: player.name, role: player.role, joined: true });
      }
    }
    log.info(`[room ${this.roomId}] "${player.name}" opened a microphone in ${room} (${kind}, ${peers.length + 1} of ${cap})`);
  }

  onVoiceLeave(client, reason = 'left') {
    this.dropVoice(client.sessionId, reason);
  }

  // Taking one child out of a call: the ones still in it are told, so their browsers can
  // close the connection rather than waiting on a voice that is never coming back.
  dropVoice(sessionId, reason = 'left') {
    const seat = this.voice.get(sessionId);
    if (!seat) return;
    this.settleVoice(sessionId);
    this.voice.delete(sessionId);
    this.stage.delete(sessionId);
    // In a mesh the others have to be told, so their browsers can close the connection
    // rather than wait on a voice that is never coming. In a hall the SFU tells them, and
    // a hundred children leaving would otherwise be ten thousand messages.
    if (this.voiceKindOf(seat.room) !== 'sfu') {
      for (const peer of this.voicePeers(seat.room)) {
        this.clients.find((c) => c.sessionId === peer.id)
          ?.send('voice:peer', { id: sessionId, joined: false, reason });
      }
    }
    this.clients.find((c) => c.sessionId === sessionId)?.send('voice:closed', { reason });
  }

  // Minutes of open microphone this student has left today.
  voiceMinutesLeft(priv) {
    return roomLeft(priv.caps, 'voice', config.voice.dailyMinutesPerStudent);
  }

  // Banks whatever time has passed since this seat's clock was last reset, and resets it.
  // Safe to call more than once on the same seat — a mid-call checkpoint from tickVoice
  // and the eventual dropVoice both call this, and nothing is double-counted because the
  // clock always moves forward to "now" rather than back to when the call began.
  settleVoice(sessionId) {
    const seat = this.voice.get(sessionId);
    if (!seat) return;
    const now = Date.now();
    const minutes = (now - seat.since) / 60000;
    seat.since = now;
    const player = this.state.players.get(sessionId);
    const priv = this.priv.get(sessionId);
    if (!priv || player?.role === 'teacher' || minutes <= 0) return;
    this.voiceMinutesLeft(priv); // rolls the day over first, if it has turned since the join
    priv.caps.voice += minutes;
  }

  // Once a second: bank the time every open microphone has run so far, and close any that
  // have used up today's minutes. Banking mid-call, not only when a child happens to
  // leave, is the point — a call already past the cap must not simply keep running until
  // someone hangs up.
  tickVoice(now) {
    for (const id of [...this.voice.keys()]) {
      if (this.state.players.get(id)?.role === 'teacher') continue;
      this.settleVoice(id);
      const priv = this.priv.get(id);
      if (priv && this.voiceMinutesLeft(priv) <= 0) this.dropVoice(id, 'daily limit');
    }
  }

  // Writing to the room. Some things are easier typed than said — a child on a muted iPad,
  // a name nobody caught, a network that will not carry a voice — so the call has a written
  // channel too. It carries the same preset phrases as the class chat and nothing else: an
  // id from phrases.json, never a word a child wrote. It reaches the room they are standing
  // in, whether or not they turned a microphone on, and a teacher pausing チャット pauses
  // this with it.
  onVoiceMsg(client, msg) {
    const id = client.sessionId;
    const player = this.state.players.get(id);
    const priv = this.priv.get(id);
    if (!player || !priv) return;
    const typed = typeof msg?.text === 'string';
    const phrase = typeof msg?.id === 'string' ? msg.id : '';
    if (!typed && !PHRASE_IDS.has(phrase)) return;
    const room = this.voiceRoomOf(id);
    if (!room) { client.send('voice:error', { reason: 'not in a room' }); return; }
    if (!this.voiceOpenFor(player.space)) { client.send('voice:error', { reason: 'closed' }); return; }
    if (this.state.chatPaused && player.role !== 'teacher') { client.send('chat:blocked', { reason: 'paused' }); return; }
    const now = Date.now();
    // The same clock as the class chat, deliberately: two ways to say a phrase must not be
    // two ways to earn for it.
    if (now - priv.lastChatAt < config.chatMinIntervalMs) { client.send('chat:blocked', { reason: 'rate' }); return; }
    priv.lastChatAt = now;
    const toRoom = (said) => {
      for (const client2 of this.clients) {
        if (this.voiceRoomOf(client2.sessionId) === room) client2.send('voice:msg', said);
      }
    };
    if (typed) {
      const text = this.acceptSay(client, msg.text, 'room');
      if (!text) return;
      toRoom({ from: id, name: player.name, text, room, t: now });
      return;
    }
    priv.progress.chats += 1;
    const level = this.awardXp(id, REWARDS.phrase.xp, `phrase:${phrase}`);
    toRoom({ from: id, name: player.name, id: phrase, room, t: now });
    client.send('xp', { ...this.progressPayload(id), levels: level?.levels || 0 });
  }

  // The introduction itself: an offer, an answer, or a network address. The server reads
  // none of it — it checks who it is from and who it is for, and passes it on.
  onRtcSignal(client, msg) {
    const from = client.sessionId;
    const seat = this.voice.get(from);
    if (!seat) { client.send('voice:error', { reason: 'not in a call' }); return; }
    const to = typeof msg?.to === 'string' ? msg.to : '';
    const other = this.voice.get(to);
    // Never across rooms, never across classes (a class is a room here), never to a
    // child who is not in a call.
    if (!other || other.room !== seat.room || to === from) { client.send('voice:error', { reason: 'no such peer' }); return; }
    const data = typeof msg?.data === 'string' ? msg.data : JSON.stringify(msg?.data ?? null);
    if (data.length > SIGNAL_MAX_BYTES) { client.send('voice:error', { reason: 'too big' }); return; }
    // Offers and answers are a handful; ICE candidates are chatty but finite. A flood is
    // something else, and it stops here.
    const now = Date.now();
    if (now - seat.since > 5000) { seat.since = now; seat.signals = 0; }
    seat.signals += 1;
    if (seat.signals > SIGNAL_BURST) { client.send('voice:error', { reason: 'too fast' }); return; }
    this.clients.find((c) => c.sessionId === to)?.send('rtc:signal', { from, kind: String(msg?.kind || '').slice(0, 16), data });
  }

  // ---- 英会話島 -------------------------------------------------------------------------
  //
  // Four houses, and the house a child walks into is the scene they talk in. There is no
  // errand to finish and no right answer to pick: they simply talk to ウーピー, and what is
  // recorded is which of the scene's two or three aims they managed to say. The page never
  // reports success — it sends what the microphone heard, and the AI's judgement, taken
  // here, is what reaches a parent's report.
  //
  // Cost and noise are held down by the same three limits the errand uses: one turn at a
  // time, a pause between turns, and a daily ceiling of turns per child.
  atConvHouse(sessionId, houseId) {
    const house = CONV.spotById.get(houseId);
    return !!house && this.atPlace(sessionId, CONV.island, house);
  }

  convSpotPayload(houseId) {
    const house = CONV.spotById.get(houseId);
    return house ? { id: house.id, island: CONV.id, name: house.name, ja: house.ja } : null;
  }

  onConvStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const topic = CONV.topicById.get(typeof msg?.topic === 'string' ? msg.topic : '');
    if (!topic) { client.send('conv:error', { reason: 'unknown topic' }); return; }
    if (!this.atConvHouse(client.sessionId, topic.spot)) {
      client.send('conv:error', { reason: 'too far', spot: this.convSpotPayload(topic.spot) });
      return;
    }
    // Walking back into the same conversation picks it up where it was left; choosing a
    // different scene starts a new one.
    const had = priv.conv;
    if (!had || had.topic !== topic.id) {
      priv.conv = { topic: topic.id, spot: topic.spot, turns: [], goalsMet: [], done: false, at: Date.now() };
    }
    const state = priv.conv;
    client.send('conv:opened', {
      ...convPayload(topic),
      opening: state.turns.length ? state.turns[state.turns.length - 1].reply : topic.opening,
      aimsMet: [...state.goalsMet],
      turn: state.turns.length,
      done: state.done,
      resumed: !!had && had.topic === topic.id && state.turns.length > 0,
    });
  }

  onConvEnd(client, reason = 'quit') {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.conv) return;
    priv.conv = null;
    client.send('conv:closed', { reason });
  }

  async onConvSay(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const state = priv?.conv;
    if (!priv || !state) return;
    const topic = CONV.topicById.get(state.topic);
    if (!topic) { priv.conv = null; return; }
    // Walking out of the house does not end the conversation, it only stops the talking
    // until the child walks back in — the same rule the errand's shop has.
    if (!this.atConvHouse(client.sessionId, state.spot)) {
      client.send('conv:error', { reason: 'too far', spot: this.convSpotPayload(state.spot) });
      return;
    }
    const utterance = typeof msg?.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!utterance) return;

    const now = Date.now();
    if (now - priv.lastConvAt < config.ai.minIntervalMs) { client.send('conv:error', { reason: 'too fast' }); return; }
    if (state.turns.length >= CONV.turnLimit) { client.send('conv:error', { reason: 'turn limit' }); return; }
    const day = new Date(now).toISOString().slice(0, 10);
    if (priv.convDay !== day) { priv.convDay = day; priv.convTurnsToday = 0; }
    // One budget for every AI conversation a child has in a day, wherever they have it.
    if (priv.convTurnsToday + (priv.missionTurnsToday || 0) >= config.ai.dailyTurnsPerStudent) {
      client.send('conv:error', { reason: 'daily limit' });
      return;
    }
    priv.lastConvAt = now;
    priv.convTurnsToday += 1;

    let result;
    try {
      result = await this.tutor.turn({ mission: convMission(topic), history: state.turns, utterance, previousGoals: state.goalsMet });
    } catch (err) {
      log.warn(`[room ${this.roomId}] conv tutor failed:`, err.message);
      client.send('conv:error', { reason: 'ai unavailable' });
      return;
    }
    // The child may have walked out, or started another scene, while the model was thinking.
    if (this.priv.get(client.sessionId) !== priv || priv.conv !== state) return;

    const gained = result.goalsMet.filter((id) => !state.goalsMet.includes(id));
    state.goalsMet = result.goalsMet;
    state.turns.push({ child: utterance, reply: result.reply });

    const xp = gained.length * CONV.reward.aimXp;
    this.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `conv:${topic.id}`, 'conv',
      utterance.slice(0, 80), gained.length ? 1 : 0, xp, client.sessionId,
    ]);
    priv.stats.attempts += 1;
    if (gained.length) priv.stats.correct += 1;
    const level = this.awardXp(client.sessionId, xp, `conv:${topic.id}`);

    const payload = {
      reply: result.reply, hint: result.hint, aimsMet: state.goalsMet, gained,
      turn: state.turns.length, turnLimit: CONV.turnLimit, xp,
      levels: level?.levels || 0, done: false,
    };

    // Finishing a scene pays once, the first time, and stops at the day's ceiling. Talking
    // is the point of the island, so the XP for each aim is paid whether or not the coins
    // have run out.
    if (result.complete && !state.done) {
      state.done = true;
      const left = roomLeft(priv.caps, 'conv', CONV.dailyCoinCap);
      const paid = Math.min(CONV.reward.topicCoins, left);
      if (paid > 0) {
        const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `conv:${topic.id}` });
        priv.caps.conv += paid;
        this.store.appendCoin(this.coinRow(client.sessionId, entry));
      }
      const bonus = this.awardXp(client.sessionId, CONV.reward.topicXp, `conv:${topic.id}:done`);
      payload.done = true;
      payload.coins = paid;
      payload.capped = paid < CONV.reward.topicCoins;
      payload.bonusXp = CONV.reward.topicXp;
      payload.levels = (level?.levels || 0) + (bonus?.levels || 0);
      log.info(`[room ${this.roomId}] "${priv.name}" finished ${topic.id} in ${state.turns.length} turns`);
    }
    payload.wallet = this.walletPayload(client.sessionId).wallet;
    payload.progress = this.progressPayload(client.sessionId);
    client.send('conv:reply', payload);
    this.persist(client.sessionId);
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
    // **きびしさはクラスのもの**（`RoomState.eikenLevel`・先生だけが変えられる）。
    // セットを作るときに1回だけ読んで、そのセットの最後まで同じもので採点する。
    // 途中で先生が変えても、いま解いている問題の採点が動かないようにするため。
    try { session = createEikenSet(island.grade, hall.skill, Math.random, this.state.eikenLevel); } catch (err) {
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
    // 英検の目安。やさしい判定の答えは数えない（`eiken-ready.js`）。
    // 正解なら、その級の月の正解にも足す（「中学1年生くらいの問題に◯問」のため）。
    if (recordEiken(priv.ready, session.grade, session.skill, result.correct, session.level) && result.correct) {
      bumpMonth(priv.months, { eg: session.grade });
    }
    this.appendLearning([
      // **どのきびしさで ○ になったのかも残す。** 保護者が読む数字なので、
      // 「やさしい判定で満点」と「きびしい判定で満点」が同じに見えてはいけない。
      new Date(now).toISOString(), this.classCode, priv.name, `eiken:${session.grade}:${session.skill}:${session.level}:${result.index}`, session.skill,
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

  // ---- 面接の間（英検の二次試験の練習） ------------------------------------------------
  //
  // The fifth building on each 英検 island. The four halls ask a child to choose or to
  // build; this one sits them down opposite ウーピー and asks them to speak — the passage
  // read aloud, then questions about it, about a picture, and about themselves.
  //
  // Everything that decides anything is in game/interview.js: which question comes next,
  // whether what the microphone heard is an answer, and what the sitting is worth. What
  // reaches the page is the question it is on and nothing else, and the model answer only
  // ever arrives after the child has answered. ウーピー's manner between questions is a
  // script; the AI, when there is one, writes the comment at the end and marks nothing.

  atInterviewRoom(sessionId, islandId) {
    const island = EIKEN_ISLANDS.get(islandId);
    if (!island) return false;
    return this.atPlace(sessionId, island, island.spotById.get(INTERVIEW_ROOM));
  }

  onInterviewStart(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const island = EIKEN_ISLANDS.get(typeof msg?.island === 'string' ? msg.island : '');
    if (!island) { client.send('interview:error', { reason: 'unknown island' }); return; }
    if (!this.atInterviewRoom(client.sessionId, island.id)) {
      client.send('interview:error', { reason: 'too far', spot: this.eikenSpotPayload(island.id, INTERVIEW_ROOM) });
      return;
    }
    let session;
    try {
      // 面接も 館と同じ きびしさで採点する（先生がクラスに1つ決めたもの）。
      session = startInterview(island.grade, { avoid: priv.lastInterviewCard, level: this.state.eikenLevel });
    } catch (err) {
      if (err instanceof InterviewError) { client.send('interview:error', { reason: err.message }); return; }
      throw err;
    }
    session.island = island.id;
    priv.interview = session;
    priv.lastInterviewCard = session.cardId;
    client.send('interview:card', {
      ...interviewPayload(session),
      island: island.id,
      badge: island.badge,
      room: roomLeft(priv.caps, 'eiken', EIKEN_CAP),
      opening: 'Hello! May I have your card, please? ... Thank you. Please read the passage aloud.',
    });
    log.info(`[room ${this.roomId}] "${priv.name}" sat down for a ${island.grade} interview (${session.cardId})`);
  }

  async onInterviewSay(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const session = priv?.interview;
    if (!priv || !session) return;
    // Walking out is walking out of an exam: the sitting waits where it is, and nothing
    // more is marked until the child is back in the room.
    if (!this.atInterviewRoom(client.sessionId, session.island)) {
      client.send('interview:error', { reason: 'too far', spot: this.eikenSpotPayload(session.island, INTERVIEW_ROOM) });
      return;
    }
    const heard = typeof msg?.heard === 'string' ? msg.heard.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    if (!heard) { client.send('interview:error', { reason: 'nothing heard' }); return; }
    const now = Date.now();
    if (now - priv.lastInterviewAt < config.answerMinIntervalMs) { client.send('interview:error', { reason: 'too fast' }); return; }
    priv.lastInterviewAt = now;

    const out = interviewStep(session, heard, { now });
    if (!out.ok) {
      priv.interview = null;
      client.send('interview:closed', { reason: out.reason });
      return;
    }
    const level = out.xp ? this.awardXp(client.sessionId, out.xp, `interview:${session.grade}`) : null;
    priv.stats.attempts += 1;
    if (out.correct) priv.stats.correct += 1;
    this.appendLearning([
      new Date(now).toISOString(), this.classCode, priv.name, `interview:${session.grade}:${session.cardId}:${out.kind}`,
      'interview', heard.slice(0, 80), out.correct ? 1 : 0, out.xp || 0, client.sessionId,
    ]);
    client.send('interview:turn', {
      kind: out.kind,
      correct: out.correct,
      close: !!out.close,
      model: out.model || '',
      hint: out.hint || '',
      // ウーピー's line between questions. Written here, not by a model: an examiner says
      // the same few things, and a child should hear them every time.
      line: scriptedLine(out.kind === 'read' ? 'read' : out.done ? 'end' : 'answer', out.correct),
      next: out.next,
      done: out.done,
      xp: out.xp || 0,
      // Nested, not spread: the child's own XP total is also called `xp`, and one of them
      // would quietly overwrite the other.
      progress: this.progressPayload(client.sessionId),
      levels: level?.levels || 0,
    });
    if (!out.done) return;

    // The end of the sitting: the marks, the coins (once, for finishing), and a comment.
    const result = interviewResult(session);
    priv.interview = null;
    const left = roomLeft(priv.caps, 'eiken', EIKEN_CAP);
    const paid = Math.min(result.coins, left);
    if (paid > 0) {
      priv.caps.eiken += paid;
      const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `interview:${session.grade}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    const done = this.awardXp(client.sessionId, INTERVIEW_XP.finish, `interview:${session.grade}:finish`);
    this.persist(client.sessionId);
    // What to practise, named as a part of the exam rather than as the question itself:
    // "the picture question" is something a child can go and practise, and a sentence of
    // English quoted back at them in the middle of a Japanese one is not.
    const PART = {
      read: { en: 'reading the passage aloud', ja: 'パッセージの 音読' },
      passage: { en: 'the question about the passage', ja: 'パッセージの しつもん' },
      picture: { en: 'the question about the picture', ja: '絵の しつもん' },
      self: { en: 'the question about themselves', ja: '自分のことを 話す しつもん' },
    };
    const missed = session.marks.filter((m) => !m.correct).map((m) => PART[m.kind] || PART.passage);
    let comment = null;
    try {
      comment = await this.tutor.comment({ grade: session.grade, right: result.right, total: result.total, missed });
    } catch (err) {
      log.warn(`[room ${this.roomId}] interview comment failed:`, err.message);
    }
    client.send('interview:done', {
      ...result,
      coins: paid,
      capped: paid < result.coins,
      comment: comment || null,
      room: roomLeft(priv.caps, 'eiken', EIKEN_CAP),
      ...this.walletPayload(client.sessionId),
      progress: this.progressPayload(client.sessionId),
      levels: done?.levels || 0,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" finished a ${session.grade} interview ${result.right}/${result.total} for ${paid}`);
  }

  onInterviewQuit(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv?.interview) return;
    priv.interview = null;
    client.send('interview:closed', { reason: 'quit' });
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

  onBlockBuy(client, msg) { this.buyBlock(client, msg, { channel: 'block', gate: true }); }

  // The shop inside BLOCKWILD: the same shelf of blocks, and the gear — swords, tools,
  // armour, food, torches — priced in U-Speak coins. No doorway to stand in (the child is
  // inside a game they opened from an island), so the only check is the one that matters:
  // the price is paid here, from the wallet this room keeps, before anything is handed over.
  onBwBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const kind = msg?.kind === 'block' ? 'block' : 'gear';
    if (kind === 'block') { this.buyBlock(client, msg, { channel: 'bw', gate: false }); return; }
    const fail = (reason, extra = {}) => client.send('bw:error', { reason, ...extra });
    const item = GEAR.get(String(msg?.id || ''));
    if (!item) return fail('no such item');
    if (priv.wallet.coins < item.price) return fail('not enough coins', { need: item.price, coins: priv.wallet.coins });
    if (item.price > 0) {
      const entry = applyOp(priv.wallet, { type: 'spend', amount: item.price, id: `bw:${item.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    priv.bwBought = (priv.bwBought || 0) + 1;
    this.persist(client.sessionId);
    // `kind` on the wire says what was bought (gear or block); the gear's own kind (weapon, food…) travels as `category`.
    client.send('bw:bought', { ...gearPayload(item), category: item.kind, kind: 'gear', ...this.walletPayload(client.sessionId) });
    log.info(`[room ${this.roomId}] "${priv.name}" bought ${item.id} in BLOCKWILD for ${item.price}`);
  }

  buyBlock(client, msg, { channel, gate }) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send(`${channel}:error`, { reason, ...extra });
    const block = BLOCKS.get(String(msg?.id || ''));
    if (!block) return fail('no such block');
    // Blocks are bought at the block shop, like everything else is bought where it is —
    // or from the shop inside BLOCKWILD, which has no doorway.
    if (gate && !this.atTownSpot(client.sessionId, 'shop')) return fail('too far', { spot: this.townSpotPayload('shop') });
    if (priv.bricks.includes(block.id)) return fail('already yours');
    if (priv.wallet.coins < block.price) return fail('not enough coins', { need: block.price, coins: priv.wallet.coins });
    if (block.price > 0) {
      const entry = applyOp(priv.wallet, { type: 'spend', amount: block.price, id: `block:${block.id}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    priv.bricks.push(block.id);
    this.persist(client.sessionId);
    // Both doors answer on `block:bought` (the shelf the page keeps is the same one); the
    // in-game shop also hears `bw:bought` so it can say so where the child is looking.
    client.send('block:bought', {
      id: block.id, word: block.word, ja: block.ja,
      ...this.shopPayload(client.sessionId), ...this.walletPayload(client.sessionId),
    });
    if (channel === 'bw') client.send('bw:bought', { kind: 'block', id: block.id, word: block.word, ja: block.ja, price: block.price, ...this.walletPayload(client.sessionId) });
    log.info(`[room ${this.roomId}] "${priv.name}" bought the ${block.id} block${channel === 'bw' ? ' (in BLOCKWILD)' : ''}`);
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

  // ---- 土地島 -------------------------------------------------------------------------
  //
  // The island a child owns: bought at the estate office, visited from the ferry, shown
  // on the board. The page draws the same six cards from land.json; the tier, the price
  // and the coins are decided here (docs/uspeak-land-research.md for why six and why
  // these prices). An island changes nothing about how English is judged or paid.
  atLandSpot(sessionId, spotId) {
    return this.atPlace(sessionId, LAND_ISLAND, LAND.spotById.get(spotId));
  }

  landSpotPayload(spotId) {
    const s = LAND.spotById.get(spotId);
    return s ? { id: s.id, kind: s.kind, name: s.name, en: s.en } : null;
  }

  onLandOpen(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atLandSpot(client.sessionId, 'office')) { client.send('land:error', { reason: 'too far', spot: this.landSpotPayload('office') }); return; }
    client.send('land:state', { ...landPayload(priv.land), ...this.walletPayload(client.sessionId) });
  }

  // The next step, in order, in the look the child picked, for the step's price. The page
  // asked with a button that showed exactly this price, read from the same file; the
  // charge still happens only here.
  onLandBuy(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('land:error', { reason, ...extra });
    if (!this.atLandSpot(client.sessionId, 'office')) return fail('too far', { spot: this.landSpotPayload('office') });
    let deal;
    try { deal = landPriceOfNext(priv.land, priv.wallet.coins, typeof msg?.look === 'string' ? msg.look : ''); } catch (err) {
      if (!(err instanceof LandError)) throw err;
      return fail(err.message, { coins: priv.wallet.coins });
    }
    const entry = applyOp(priv.wallet, { type: 'spend', amount: deal.price, id: `land:${deal.look.id}` });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    priv.land.tier = deal.tier.tier;
    priv.land.look = deal.look.id;
    this.persist(client.sessionId);
    client.send('land:bought', { ...landPayload(priv.land), ...this.walletPayload(client.sessionId) });
    log.info(`[room ${this.roomId}] "${priv.name}" bought the ${deal.look.id} island (step ${deal.tier.tier})`);
  }

  // Another look of the step already owned (もようがえ), for a fraction of its price.
  onLandRestyle(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('land:error', { reason, ...extra });
    if (!this.atLandSpot(client.sessionId, 'office')) return fail('too far', { spot: this.landSpotPayload('office') });
    let deal;
    try { deal = landPriceOfRestyle(priv.land, priv.wallet.coins, typeof msg?.look === 'string' ? msg.look : ''); } catch (err) {
      if (!(err instanceof LandError)) throw err;
      return fail(err.message, { coins: priv.wallet.coins });
    }
    const entry = applyOp(priv.wallet, { type: 'spend', amount: deal.price, id: `land:restyle:${deal.look.id}` });
    this.store.appendCoin(this.coinRow(client.sessionId, entry));
    priv.land.look = deal.look.id;
    this.persist(client.sessionId);
    client.send('land:bought', { ...landPayload(priv.land), restyled: true, ...this.walletPayload(client.sessionId) });
    log.info(`[room ${this.roomId}] "${priv.name}" restyled their island to ${deal.look.id}`);
  }

  // Walking onto the ferry is walking onto the island: the page builds it from this.
  onLandEnter(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atLandSpot(client.sessionId, 'ferry')) { client.send('land:error', { reason: 'too far', spot: this.landSpotPayload('ferry') }); return; }
    const isle = landIslandPayload(priv.land, priv.name);
    if (!isle) { client.send('land:error', { reason: 'no island' }); return; }
    client.send('land:island', isle);
  }

  // A classmate's island, to sail to from the board. What is handed over is only what
  // the board already shows (step, look, name): nothing private, nothing to change.
  onLandVisit(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atLandSpot(client.sessionId, 'board')) { client.send('land:error', { reason: 'too far', spot: this.landSpotPayload('board') }); return; }
    const name = typeof msg?.name === 'string' ? msg.name.trim() : '';
    let land = null; let found = false;
    for (const [id, p] of this.priv) {
      const player = this.state.players.get(id);
      if (!player || player.role === 'teacher' || p.name !== name) continue;
      land = p.land; found = true; break;
    }
    if (!found) {
      let records = [];
      try { records = this.store.listClass?.(this.classCode) || []; } catch (err) { log.warn(`[room ${this.roomId}] listClass failed:`, err.message); }
      const r = records.find((x) => x.name === name && x.role !== 'teacher');
      if (r) { land = sanitizeLand(parseJson(r.land_json, null)); found = true; }
    }
    if (!found) { client.send('land:error', { reason: 'no such child' }); return; }
    const isle = landIslandPayload(land, name);
    if (!isle) { client.send('land:error', { reason: 'no island', name }); return; }
    client.send('land:island', { ...isle, visiting: name !== priv.name });
  }

  // Everyone's islands, by name — not by tier. A class board that sorts children by
  // what they could afford is a thing a parent should never see (docs/uspeak-retention.md).
  onLandBoard(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    if (!this.atLandSpot(client.sessionId, 'board')) { client.send('land:error', { reason: 'too far', spot: this.landSpotPayload('board') }); return; }
    const rows = new Map();
    let records = [];
    try { records = this.store.listClass?.(this.classCode) || []; } catch (err) { log.warn(`[room ${this.roomId}] listClass failed:`, err.message); }
    for (const r of records) {
      if (r.role === 'teacher') continue;
      const l = sanitizeLand(parseJson(r.land_json, null));
      rows.set(r.name, { name: r.name, tier: l.tier, look: l.look });
    }
    for (const [id, p] of this.priv) {
      const player = this.state.players.get(id);
      if (!player || player.role === 'teacher') continue;
      rows.set(p.name, { name: p.name, tier: p.land.tier, look: p.land.look });
    }
    const all = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    client.send('land:board', { rows: all, owners: all.filter((r) => r.tier > 0).length, me: { name: priv.name, tier: priv.land.tier, look: priv.land.look } });
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

  // ---- レース ---------------------------------------------------------------------------
  //
  // A circuit, three laps, and whoever else on the island got on the grid. One race per
  // class at a time: children who walk up while it is on the grid join it, and children
  // who walk up after the lights are told to wait for the next one. Rivals fill the field
  // for a child racing alone.
  //
  // The room's job here is the same as everywhere else: it checks that the child is
  // actually standing at the checkpoint they claim, and game/race.js decides the rest.
  raceBroadcast(type, payload) {
    for (const id of this.race?.racers.keys() || []) {
      this.clients.find((c) => c.sessionId === id)?.send(type, payload);
    }
  }

  raceRow(now = Date.now()) {
    return { phase: this.race.phase, laps: LAPS, standings: standings(this.race, now), in: this.race.racers.size };
  }

  onRaceJoin(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('race:error', { reason, ...extra });
    if (!this.atRideSpot(client.sessionId, RIDE_ISLAND.start.id)) {
      return fail('too far', { spot: this.rideSpotPayload(RIDE_ISLAND.start.id) });
    }
    if (!priv.riding) return fail('on foot');
    const now = Date.now();
    // A finished race is yesterday's: the next child to walk up opens a new grid.
    if (!this.race || this.race.phase === 'done') this.race = createRace({ classCode: this.classCode, now });
    const out = joinRace(this.race, {
      id: client.sessionId, name: priv.name, vehicle: priv.riding, speed: RIDE.vehicles.get(priv.riding)?.speed || 1,
    }, now);
    if (!out.ok) return fail(out.reason === 'grid is full' ? 'grid full' : 'race running');
    const place = (COURSE.grid || [])[this.race.racers.size - 1] || COURSE.grid[0];
    client.send('race:grid', {
      ...coursePayload(),
      you: { grid: place, vehicle: priv.riding, place: this.race.racers.size },
      opensIn: Math.max(0, GRID_MS - (now - this.race.openedAt)),
      max: MAX_RACERS,
      ...this.raceRow(now),
    });
    this.raceBroadcast('race:field', this.raceRow(now));
    log.info(`[room ${this.roomId}] "${priv.name}" is on the grid (${this.race.racers.size} racing)`);
  }

  onRaceLeave(client, reason = 'left') {
    if (!this.race?.racers.has(client.sessionId)) return;
    leaveRace(this.race, client.sessionId);
    client.send('race:closed', { reason });
    this.raceBroadcast('race:field', this.raceRow());
  }

  onRaceGate(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!priv || !player || !this.race) return;
    const fail = (reason, extra = {}) => client.send('race:error', { reason, ...extra });
    if (!this.race.racers.has(client.sessionId)) return fail('not racing');
    if (!priv.riding) { this.onRaceLeave(client, 'on foot'); return fail('on foot'); }
    const gate = COURSE.gateById.get(String(msg?.id || ''));
    if (!gate) return fail('no such checkpoint');
    if (player.space !== RIDE_ISLAND.id) return fail('elsewhere');
    // The one thing a page cannot be trusted about: where the kart is.
    if (Math.hypot(player.x - gate.wx, player.z - gate.wz) > COURSE.reach + SPOT_SLACK) return fail('too far');

    const out = crossCheckpoint(this.race, client.sessionId, gate.id, Date.now());
    if (!out.ok) return fail(out.reason, { want: out.want || '' });
    client.send('race:gate', {
      id: gate.id, word: gate.word, ja: gate.ja, order: gate.order, of: COURSE.gates.length,
      next: out.next, lap: out.lap, completed: out.completed || 0, laps: LAPS,
      lapDone: !!out.lapDone, lapMs: out.lapMs || 0, done: !!out.done,
    });
    if (out.done) this.finishRacer(client, out.place);
    this.raceBroadcast('race:field', this.raceRow());
  }

  // An item box, and the English that opens it. The box is only worth something to a child
  // who answers, which is the same bargain the arena makes: the speed comes from the words.
  onRaceItem(client, msg) {
    const priv = this.priv.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!priv || !player || !this.race?.racers.has(client.sessionId)) return;
    const racer = this.race.racers.get(client.sessionId);
    const fail = (reason) => client.send('race:error', { reason });
    if (this.race.phase !== 'running' || racer.finishedAt) return fail('not started');

    // Picking one up: the box has to be one of the boxes, and the kart has to be at it.
    if (msg?.at !== undefined) {
      const box = (COURSE.items || [])[Number(msg.at)];
      if (!box) return fail('no such box');
      const wx = RIDE_ISLAND.x + box.x;
      const wz = RIDE_ISLAND.z + box.z;
      if (Math.hypot(player.x - wx, player.z - wz) > COURSE.reach + SPOT_SLACK) return fail('too far');
      const now = Date.now();
      if (now - (priv.lastItemAt || 0) < 1200) return fail('too fast');
      priv.lastItemAt = now;
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      const wrong = WORDS.filter((w) => w.en !== word.en && w.group !== word.group);
      const choices = [word.en, wrong[Math.floor(Math.random() * wrong.length)].en, wrong[Math.floor(Math.random() * wrong.length)].en]
        .filter((v, i, all) => all.indexOf(v) === i);
      while (choices.length < 3) {
        const extra = WORDS[Math.floor(Math.random() * WORDS.length)].en;
        if (!choices.includes(extra)) choices.push(extra);
      }
      // Shuffled here, answered here: the page is told three words and no more.
      for (let i = choices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      racer.item = { answer: word.en, at: now, box: Number(msg.at) };
      client.send('race:box', { ja: word.ja, emoji: word.emoji || '', choices, ms: 6000 });
      return;
    }

    // Answering it.
    const item = racer.item;
    if (!item) return fail('no box');
    racer.item = null;
    const picked = typeof msg?.pick === 'string' ? msg.pick : '';
    const right = picked === item.answer;
    if (right) {
      racer.boosts += 1;
      racer.items += 1;
      this.awardXp(client.sessionId, itemXp(), 'race:item');
    }
    this.appendLearning([
      new Date().toISOString(), this.classCode, priv.name, `race:item:${item.answer}`, 'race',
      picked.slice(0, 40), right ? 1 : 0, right ? itemXp() : 0, client.sessionId,
    ]);
    priv.stats.attempts += 1;
    if (right) priv.stats.correct += 1;
    client.send('race:boost', { ok: right, answer: item.answer, xp: right ? itemXp() : 0, progress: this.progressPayload(client.sessionId) });
  }

  finishRacer(client, place) {
    const priv = this.priv.get(client.sessionId);
    const racer = this.race.racers.get(client.sessionId);
    if (!priv || !racer) return;
    const prize = prizeFor(place, true);
    const left = roomLeft(priv.caps, 'course', COURSE_CAP);
    const paid = Math.min(prize.coins, left);
    if (paid > 0) {
      priv.caps.course += paid;
      const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: `race:${place}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    const best = racer.best;
    if (!priv.lapBest || (best && best < priv.lapBest)) priv.lapBest = best;
    const level = this.awardXp(client.sessionId, prize.xp, `race:${place}`);
    this.persist(client.sessionId);
    client.send('race:finished', {
      place, laps: racer.laps, best, bestMs: priv.lapBest, boosts: racer.boosts, items: racer.items,
      coins: paid, xp: prize.xp, capped: paid < prize.coins, room: roomLeft(priv.caps, 'course', COURSE_CAP),
      standings: standings(this.race), ...this.walletPayload(client.sessionId),
      progress: this.progressPayload(client.sessionId), levels: level?.levels || 0,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" finished ${place}${['st', 'nd', 'rd'][place - 1] || 'th'} (best lap ${(best / 1000).toFixed(1)}s)`);
  }

  // Called once a second from the room's own tick: the lights, the running order, and the
  // end of a race nobody finished.
  tickRace(now = Date.now()) {
    const race = this.race;
    if (!race || race.phase === 'done') return;
    // Anyone who walked off the island, or off their vehicle, is out of the race.
    for (const id of [...race.racers.keys()]) {
      const player = this.state.players.get(id);
      const priv = this.priv.get(id);
      if (!player?.connected || !priv?.riding || player.space !== RIDE_ISLAND.id) {
        leaveRace(race, id);
        this.clients.find((c) => c.sessionId === id)?.send('race:closed', { reason: 'left the island' });
      }
    }
    if (!race.racers.size) { race.phase = 'done'; return; }
    if (maybeStart(race, now)) this.raceBroadcast('race:lights', { startsAt: race.startsAt, in: race.startsAt - now, ...this.raceRow(now) });
    if (beginIfDue(race, now)) this.raceBroadcast('race:go', { startedAt: race.startedAt, ...this.raceRow(now) });
    if (race.phase === 'running') {
      this.raceBroadcast('race:field', this.raceRow(now));
      if (raceOver(race, now)) {
        race.phase = 'done';
        race.endedAt = now;
        // Whoever ran out of time still drove: they are paid for having been in the race.
        for (const racer of race.racers.values()) {
          if (racer.finishedAt) continue;
          const client = this.clients.find((c) => c.sessionId === racer.id);
          const prize = prizeFor(0, false);
          const priv = this.priv.get(racer.id);
          if (client && priv) {
            const left = roomLeft(priv.caps, 'course', COURSE_CAP);
            const paid = Math.min(prize.coins, left);
            if (paid > 0) {
              priv.caps.course += paid;
              const entry = applyOp(priv.wallet, { type: 'award', amount: paid, id: 'race:dnf' });
              this.store.appendCoin(this.coinRow(racer.id, entry));
            }
            this.awardXp(racer.id, prize.xp, 'race:dnf');
            client.send('race:finished', {
              place: 0, laps: racer.laps, best: racer.best, coins: paid, xp: prize.xp,
              standings: standings(race, now), ...this.walletPayload(racer.id),
              progress: this.progressPayload(racer.id), levels: 0,
            });
          }
        }
        this.raceBroadcast('race:over', { standings: standings(race, now) });
      }
    }
  }

  // ---- the grand prix ------------------------------------------------------------
  //
  // A different thing from the island circuit above. のりもの島's race is a lap of the
  // island a child drives in the island's own world; the grand prix is a game of its own —
  // its own circuit, its own scene, its own five rivals — that the start line opens.
  //
  // What that costs the room is a faster clock. The rivals are driven here, with the
  // child's own physics, so the class is racing one ミドリ rather than twelve local copies
  // of her who all disagree; and the page has to be told where she is often enough to draw
  // her smoothly. So a grand prix runs its own 10 Hz interval — the same rate the room
  // patches positions at — and that interval exists only while a race does.
  gpBroadcast(type, payload) {
    for (const id of this.gp?.racers.keys() || []) {
      this.clients.find((c) => c.sessionId === id)?.send(type, payload);
    }
  }

  gpRow(now = Date.now()) {
    return { phase: this.gp.phase, laps: this.gp.laps, standings: gpStandings(this.gp), in: this.gp.racers.size, now };
  }

  // The 10 Hz clock, started when a grid opens and stopped when the race is over. A room
  // with no grand prix in it does no work for one.
  //
  // A plain timer, not this.clock. Colyseus only advances room.clock inside the simulation
  // interval, and this room's is once a second — so clock.setInterval(…, 100) fires once a
  // second, which is not 10 Hz and is not a race. gp.js sub-steps its drivers so a late or
  // sparse tick still drives the same race; this is only about how often the class is told
  // where the rivals are.
  gpClockOn() {
    if (this.gpTimer) return;
    this.gpTimer = setInterval(() => this.tickGrandPrix(), GP_TICK_MS);
  }

  gpClockOff() {
    if (this.gpTimer) clearInterval(this.gpTimer);
    this.gpTimer = null;
  }

  onGpJoin(client) {
    const priv = this.priv.get(client.sessionId);
    if (!priv) return;
    const fail = (reason, extra = {}) => client.send('gp:error', { reason, ...extra });
    // The way in is the start line on のりもの島, on a kart. Everything after that happens
    // in the grand prix's own world, where the room cannot see the child — which is why
    // every claim it accepts from there carries a position on the circuit.
    if (!this.atRideSpot(client.sessionId, RIDE_ISLAND.start.id)) {
      return fail('too far', { spot: this.rideSpotPayload(RIDE_ISLAND.start.id) });
    }
    if (!priv.riding) return fail('on foot');
    const now = Date.now();
    if (!this.gp || raceOverGP(this.gp, now)) this.gp = createGP({ classCode: this.classCode, now });
    const out = joinGP(this.gp, { id: client.sessionId, name: priv.name }, now);
    if (!out.ok) return fail(out.reason === 'grid full' ? 'grid full' : 'race running');
    this.gpClockOn();
    client.send('gp:grid', {
      ...gpPayload(this.gp, out.racer),
      you: { id: client.sessionId, name: priv.name, grid: out.racer.grid },
      max: GP_MAX,
      ...this.gpRow(now),
    });
    this.gpBroadcast('gp:field', this.gpRow(now));
    log.info(`[room ${this.roomId}] "${priv.name}" is on the grand prix grid (${this.gp.racers.size} racing)`);
  }

  onGpLeave(client, reason = 'left') {
    if (!this.gp?.racers.has(client.sessionId)) return;
    leaveGP(this.gp, client.sessionId);
    client.send('gp:closed', { reason });
    if (this.gp.racers.size) this.gpBroadcast('gp:field', this.gpRow());
    else { this.gp.phase = 'done'; this.gpClockOff(); }
  }

  // "I passed checkpoint n, and here is where I was." gp.js decides whether both are true.
  onGpCp(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || !this.gp) return;
    const fail = (reason, extra = {}) => client.send('gp:error', { reason, ...extra });
    if (!this.gp.racers.has(client.sessionId)) return fail('not racing');
    const out = claimCp(this.gp, client.sessionId, { cp: Number(msg?.cp), s: Number(msg?.s) }, Date.now());
    if (!out.ok) return fail(out.reason, out.want ? { want: out.want } : {});
    client.send('gp:cp', {
      cp: Number(msg.cp), of: this.gp.track.checkpoints.length, next: out.next || 0,
      lap: out.lap || 0, laps: this.gp.laps, lapMs: out.lapMs || 0, finished: !!out.finished,
    });
    if (out.finished) this.finishGrandPrix(client, out.place);
    this.gpBroadcast('gp:field', this.gpRow());
  }

  // 📦 the item boxes. The same bargain as the arena and the island circuit: the speed
  // comes from the English, and the answer is never sent to the page before it is given.
  onGpItem(client, msg) {
    const priv = this.priv.get(client.sessionId);
    if (!priv || !this.gp?.racers.has(client.sessionId)) return;
    const racer = this.gp.racers.get(client.sessionId);
    const fail = (reason) => client.send('gp:error', { reason });

    if (msg?.box !== undefined) {
      const out = claimItem(this.gp, client.sessionId, { box: msg.box, s: Number(msg?.s) }, Date.now());
      if (!out.ok) return fail(out.reason);
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      const wrong = WORDS.filter((w) => w.en !== word.en && w.group !== word.group);
      const choices = [word.en];
      while (choices.length < 3) {
        const extra = wrong[Math.floor(Math.random() * wrong.length)]?.en || WORDS[Math.floor(Math.random() * WORDS.length)].en;
        if (!choices.includes(extra)) choices.push(extra);
      }
      for (let i = choices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      racer.quiz = { answer: word.en, box: out.box };
      client.send('gp:box', { box: out.box, ja: word.ja, emoji: word.emoji || '', choices, ms: 6000 });
      return;
    }

    const quiz = racer.quiz;
    if (!quiz) return fail('no box');
    racer.quiz = null;
    const picked = typeof msg?.pick === 'string' ? msg.pick : '';
    const right = picked === quiz.answer;
    if (right) {
      racer.items += 1;
      this.awardXp(client.sessionId, XP_ITEM, 'gp:item');
    }
    this.appendLearning([
      new Date().toISOString(), this.classCode, priv.name, `gp:item:${quiz.answer}`, 'race',
      picked.slice(0, 40), right ? 1 : 0, right ? XP_ITEM : 0, client.sessionId,
    ]);
    priv.stats.attempts += 1;
    if (right) priv.stats.correct += 1;
    client.send('gp:boost', {
      ok: right, answer: quiz.answer, xp: right ? XP_ITEM : 0,
      progress: this.progressPayload(client.sessionId),
    });
  }

  // The flag. The prize comes from the place the room worked out, out of the same daily
  // purse as the island circuit — a child cannot earn twice by alternating between them.
  finishGrandPrix(client, place) {
    const priv = this.priv.get(client.sessionId);
    const racer = this.gp?.racers.get(client.sessionId);
    if (!priv || !racer) return;
    const spent = priv.caps.course || 0;
    const prize = gpPrizeFor({ place, laps: racer.lap, items: racer.items, spentToday: spent, cap: COURSE_CAP });
    if (prize.coins > 0) {
      priv.caps.course = spent + prize.coins;
      const entry = applyOp(priv.wallet, { type: 'award', amount: prize.coins, id: `gp:${place}` });
      this.store.appendCoin(this.coinRow(client.sessionId, entry));
    }
    if (racer.best && (!priv.lapBest || racer.best < priv.lapBest)) priv.lapBest = racer.best;
    const level = this.awardXp(client.sessionId, prize.xp, `gp:${place}`);
    this.persist(client.sessionId);
    client.send('gp:finished', {
      place, laps: racer.lap, best: racer.best, bestMs: priv.lapBest, items: racer.items,
      coins: prize.coins, xp: prize.xp, capped: prize.capped,
      room: roomLeft(priv.caps, 'course', COURSE_CAP),
      standings: gpStandings(this.gp), ...this.walletPayload(client.sessionId),
      progress: this.progressPayload(client.sessionId), levels: level?.levels || 0,
    });
    log.info(`[room ${this.roomId}] "${priv.name}" finished the grand prix ${place}${['st', 'nd', 'rd'][place - 1] || 'th'}`);
  }

  // 10 Hz: the rivals drive, the lights go out, and the race ends.
  tickGrandPrix() {
    const race = this.gp;
    if (!race) { this.gpClockOff(); return; }
    const now = Date.now();
    // A child who closed the tab, or was disconnected, is off the grid. Unlike the island
    // circuit there is nothing to check about where they are standing: the grand prix is
    // its own world, and a child in it is somewhere the room's coordinates do not reach.
    for (const id of [...race.racers.keys()]) {
      if (!this.state.players.get(id)?.connected) {
        leaveGP(race, id);
        this.clients.find((c) => c.sessionId === id)?.send('gp:closed', { reason: 'disconnected' });
      }
    }
    if (!race.racers.size) { race.phase = 'done'; this.gpClockOff(); return; }
    const was = race.phase;
    tickGP(race, now);
    if (was !== race.phase && race.phase === 'lights') {
      this.gpBroadcast('gp:lights', { startsAt: race.startsAt, in: race.startsAt - now, ...this.gpRow(now) });
    }
    if (was !== race.phase && race.phase === 'running') {
      this.gpBroadcast('gp:go', { startedAt: race.startedAt, ...this.gpRow(now) });
    }
    if (race.phase === 'running') this.gpBroadcast('gp:field', this.gpRow(now));
    if (race.phase === 'done' || raceOverGP(race, now)) {
      race.phase = 'done';
      // Whoever ran out of time still drove three quarters of a circuit and answered the
      // boxes on the way round: they are paid for the race they were in.
      for (const racer of race.racers.values()) {
        if (racer.finished) continue;
        const client = this.clients.find((c) => c.sessionId === racer.id);
        if (client) this.finishGrandPrix(client, gpPlaceOf(race, racer.id));
      }
      this.gpBroadcast('gp:over', { standings: gpStandings(race) });
      this.gpClockOff();
    }
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

    this.appendLearning([
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

  // コインの出入りが全部通る1か所。**もらった分だけ**を月の箱に足す（使った分は
  // 引かない — 保護者が見たいのは「今月いくら稼いだか」で、財布の残高は累計の側にある）。
  coinRow(sessionId, entry) {
    const priv = this.priv.get(sessionId);
    if (priv && entry.delta > 0) bumpMonth(priv.months, { coins: entry.delta });
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
      chatPaused: this.state.chatPaused, freeChat: this.state.freeChat, eikenLevel: this.state.eikenLevel, teacherId: this.state.teacherId, missionId: this.state.missionId, maxClients: this.maxClients,
      patchRateMs: config.patchRateMs, serverTime: Date.now(),
    };
  }
}
