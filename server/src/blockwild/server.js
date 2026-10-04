// BLOCKWILD, together — the room server for the block sandbox a class opens from まちづくり島.
//
// BLOCKWILD is vendored whole and unedited (client/dist/blockwild/), and it SHIPS a
// multiplayer client: src/net.js speaks a small JSON protocol (plus one binary blob: the
// world's edits) to a WebSocket at `/ws`. What it never had on this server was the other
// end, because Colyseus's transport takes every upgrade on the port. This file is that
// other end, written to the protocol the vendored client already speaks, so the game's own
// code is still untouched (SOURCE.json still hashes clean).
//
// One world per class, up to 20 children in it at once: the same seed for everyone, and
// the blocks anyone placed or dug kept as a list of edits that a newcomer receives before
// anything else. The world survives restarts (DATA_DIR/blockwild/<class>.json — on Fly
// that is the mounted volume). Nothing here touches coins or learning records: this is a
// sandbox, and what a child builds in it is theirs to show, not something that is marked.
//
// Protocol (client → server): join {name} · pos {x,y,z,yaw,pitch,f,h,hp} · block {x,y,z,id,m}
//   · time {sleep} · pvp {id,dmg} · chat {text} · mobhit / needmob (ignored: no server mobs).
// (server → client): [binary delta] then welcome {id,seed,time,weather,spawn,players,mobs,max}
//   · full · join {id,name} · leave {id} · roster {a:[[id,name]]} · players {a:[[id,x,y,z,yaw,pitch,f,h,hp]]}
//   · block · time {time,weather} · weather {weather} · hurt {dmg,from} · chat {from,text} · sys {text}.
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

export const BW_MAX_PLAYERS = 20;
export const BW_W = 256;            // the vendored world is 256 × 256 × 64 (src/world.js)
export const BW_H = 64;
export const BW_DAY = 720;          // seconds per day (game.js DAY_LEN)
const PATH = /^\/(?:bw\/([^/?#]+)\/)?ws(?:[?#].*)?$/;
const TICK_MS = 100;                // positions go out ten times a second, like the client sends them
const TIME_SYNC_MS = 20000;
const SAVE_DEBOUNCE_MS = 2000;
const BLOCKS_PER_SEC = 300;         // more than a child can click; less than a loop can flood

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const num = (v, lo, hi, fb = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
const safeName = (v) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'ぼうけんしゃ';
export const idxOf = (x, y, z) => x + BW_W * (z + BW_W * y);
export const fileFor = (dataDir, code) => path.join(dataDir, 'blockwild', `${encodeURIComponent(code).replace(/%/g, '_')}.json`);

// The edits as the vendored client reads them: one header byte, then six bytes an edit
// (uint32 little-endian index, block id, meta). See createWorld() in blockwild/game.js.
export function encodeDelta(edits) {
  const buf = Buffer.alloc(1 + edits.size * 6);
  buf[0] = 1;
  let o = 1;
  for (const [i, [id, m]] of edits) { buf.writeUInt32LE(i, o); buf[o + 4] = id; buf[o + 5] = m; o += 6; }
  return buf;
}

// Where a newcomer stands: the vendored generator's own spawn, computed once per world in
// a worker (the generator fills three 4 MB arrays and takes a second or two; the room must
// not stop answering other classes meanwhile). If it fails, the middle of the map, high
// up — the client's unstick() lifts a child out of anything solid.
export function computeSpawn(seed, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    let worker;
    try {
      worker = new Worker(new URL('./spawn-worker.mjs', import.meta.url), { workerData: { seed } });
    } catch { finish(null); return; }
    const timer = setTimeout(() => { worker.terminate(); finish(null); }, timeoutMs);
    worker.once('message', (m) => { finish(Array.isArray(m?.spawn) ? m.spawn : null); worker.terminate(); });
    worker.once('error', () => finish(null));
    worker.once('exit', () => finish(null));
  });
}

export function createBlockwildServer({ server, dataDir, log = console, maxPlayers = BW_MAX_PLAYERS, originAllowed = () => true, spawnFor = computeSpawn, now = Date.now } = {}) {
  const worlds = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
  let closed = false;

  // ---- worlds ------------------------------------------------------------------------
  function freshWorld(code) {
    return {
      code, seed: (Math.random() * 0xffffffff) >>> 0, timeBase: 300, timeAt: now(), weather: 0, weatherLeft: 400 + Math.random() * 600,
      spawn: null, edits: new Map(), players: new Map(), nextId: 1, dirty: false, saveTimer: null, ready: null,
    };
  }
  function load(code) {
    const w = freshWorld(code);
    const file = fileFor(dataDir, code);
    if (!existsSync(file)) return w;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (raw?.v !== 1) throw new Error('unknown save version');
      w.seed = raw.seed >>> 0; w.timeBase = Number(raw.time) || 300; w.weather = raw.weather ? 1 : 0;
      w.spawn = Array.isArray(raw.spawn) && raw.spawn.length === 3 ? raw.spawn : null;
      for (const e of raw.edits || []) { const i = int(e[0], 0, BW_W * BW_W * BW_H - 1); if (i !== null) w.edits.set(i, [int(e[1], 0, 255) ?? 0, int(e[2], 0, 255) ?? 0]); }
    } catch (err) {
      log.warn(`[blockwild] ${file} could not be read (${err.message}); starting the class a new world`);
      try { renameSync(file, `${file}.broken-${Date.now()}`); } catch { /* best effort */ }
      return freshWorld(code);
    }
    return w;
  }
  function world(code) {
    let w = worlds.get(code);
    if (!w) { w = load(code); worlds.set(code, w); }
    if (!w.ready) w.ready = w.spawn ? Promise.resolve(w.spawn) : spawnFor(w.seed).then((s) => { w.spawn = s || [BW_W / 2 + 0.5, 40, BW_W / 2 + 0.5]; w.dirty = true; scheduleSave(w); return w.spawn; });
    return w;
  }
  const timeOf = (w) => w.timeBase + (now() - w.timeAt) / 1000;
  const setTime = (w, t) => { w.timeBase = t; w.timeAt = now(); w.dirty = true; };

  function save(w) {
    if (w.saveTimer) { clearTimeout(w.saveTimer); w.saveTimer = null; }
    if (!w.dirty) return false;
    const file = fileFor(dataDir, w.code);
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      const data = { v: 1, code: w.code, seed: w.seed, time: Math.round(timeOf(w)), weather: w.weather, spawn: w.spawn, edits: [...w.edits].map(([i, [id, m]]) => [i, id, m]), savedAt: new Date(now()).toISOString() };
      writeFileSync(`${file}.tmp`, JSON.stringify(data));
      renameSync(`${file}.tmp`, file);
      w.dirty = false;
      return true;
    } catch (err) {
      log.warn(`[blockwild] could not save ${file}: ${err.message}`);
      return false;
    }
  }
  function scheduleSave(w) {
    w.dirty = true;
    if (w.saveTimer || closed) return;
    w.saveTimer = setTimeout(() => { w.saveTimer = null; save(w); }, SAVE_DEBOUNCE_MS);
  }

  // ---- talking ------------------------------------------------------------------------
  const send = (p, obj) => { if (p.ws.readyState === 1) p.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  const broadcast = (w, obj, except = null) => { const s = JSON.stringify(obj); for (const p of w.players.values()) if (p !== except) send(p, s); };
  const roster = (w) => broadcast(w, { t: 'roster', a: [...w.players.values()].map((p) => [p.id, p.name]) });

  function attach(ws, code) {
    const w = world(code);
    let me = null;
    let blockBudget = BLOCKS_PER_SEC;
    let budgetAt = now();
    const timer = setTimeout(() => { if (!me) ws.close(1000, 'no join'); }, 12000);

    ws.on('message', async (data, isBinary) => {
      if (isBinary) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (!me) {
        if (m.t !== 'join') return;
        clearTimeout(timer);
        if (w.players.size >= maxPlayers) { ws.send(JSON.stringify({ t: 'full', max: maxPlayers })); ws.close(1000, 'full'); return; }
        const spawn = await w.ready;
        if (ws.readyState !== 1) return;
        me = { ws, id: w.nextId++, name: safeName(m.name), x: spawn[0], y: spawn[1], z: spawn[2], yaw: 0, pitch: 0, f: 0, h: 0, hp: 20 };
        // The edits first, then the welcome: the client keeps the one binary frame it saw
        // before `welcome` and lays it over the freshly generated terrain.
        ws.send(encodeDelta(w.edits));
        ws.send(JSON.stringify({
          t: 'welcome', id: me.id, seed: w.seed, time: timeOf(w), weather: w.weather, spawn, max: maxPlayers, mobs: [],
          players: [...w.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z })),
        }));
        w.players.set(me.id, me);
        broadcast(w, { t: 'join', id: me.id, name: me.name }, me);
        roster(w);
        log.info(`[blockwild] "${me.name}" joined the ${code} world (${w.players.size}/${maxPlayers}, ${w.edits.size} edits)`);
        return;
      }
      switch (m.t) {
        case 'pos':
          me.x = num(m.x, -8, BW_W + 8, me.x); me.y = num(m.y, -16, BW_H + 32, me.y); me.z = num(m.z, -8, BW_W + 8, me.z);
          me.yaw = num(m.yaw, -100, 100); me.pitch = num(m.pitch, -4, 4); me.f = int(m.f, 0, 255) ?? 0; me.h = int(m.h, 0, 65535) ?? 0; me.hp = int(m.hp, 0, 20) ?? 20;
          break;
        case 'block': {
          const x = int(m.x, 0, BW_W - 1); const y = int(m.y, 0, BW_H - 1); const z = int(m.z, 0, BW_W - 1);
          const id = int(m.id, 0, 255); const meta = int(m.m, 0, 255) ?? 0;
          if (x === null || y === null || z === null || id === null) return;
          const t = now();
          blockBudget = Math.min(BLOCKS_PER_SEC, blockBudget + (t - budgetAt) * BLOCKS_PER_SEC / 1000); budgetAt = t;
          if (blockBudget < 1) return;
          blockBudget -= 1;
          w.edits.set(idxOf(x, y, z), [id, meta]);
          scheduleSave(w);
          broadcast(w, { t: 'block', x, y, z, id, m: meta }, me);
          break;
        }
        case 'time':
          if (m.sleep) {
            // Someone slept in a bed: morning for everyone, the way the client computes it.
            const t = timeOf(w);
            setTime(w, Math.ceil(t / BW_DAY) * BW_DAY + BW_DAY * 0.27);
            broadcast(w, { t: 'time', time: timeOf(w), weather: w.weather });
            broadcast(w, { t: 'sys', text: `${me.name} が ねむって、あさに なった` });
          }
          break;
        case 'pvp': {
          const target = w.players.get(int(m.id, 1, 1e9) ?? -1);
          if (target && target !== me) send(target, { t: 'hurt', dmg: num(m.dmg, 0, 10, 1), from: me.name });
          break;
        }
        case 'chat': {
          const text = String(m.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
          if (text) broadcast(w, { t: 'chat', from: me.name, text });
          break;
        }
        default: break;          // mobhit / needmob: this server keeps no mobs
      }
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (!me) return;
      w.players.delete(me.id);
      broadcast(w, { t: 'leave', id: me.id });
      roster(w);
      log.info(`[blockwild] "${me.name}" left the ${code} world (${w.players.size}/${maxPlayers})`);
      if (w.dirty) scheduleSave(w);
      me = null;
    });
    ws.on('error', () => { /* closed by the other side; 'close' follows */ });
  }

  // ---- the clock ----------------------------------------------------------------------
  const tick = setInterval(() => {
    for (const w of worlds.values()) {
      if (w.players.size < 2) continue;
      broadcast(w, { t: 'players', a: [...w.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), p.yaw, p.pitch, p.f, p.h, p.hp]) });
    }
  }, TICK_MS);
  let lastSync = now();
  const clock = setInterval(() => {
    const t = now(); const dt = (t - lastSync) / 1000; lastSync = t;
    for (const w of worlds.values()) {
      w.weatherLeft -= dt;
      if (w.weatherLeft <= 0) {
        w.weather = w.weather ? 0 : 1;
        w.weatherLeft = w.weather ? 90 + Math.random() * 260 : 300 + Math.random() * 700;
        w.dirty = true;
        broadcast(w, { t: 'weather', weather: w.weather });
      }
      if (w.players.size) broadcast(w, { t: 'time', time: timeOf(w), weather: w.weather });
    }
  }, TIME_SYNC_MS);
  tick.unref?.(); clock.unref?.();

  // ---- the door ------------------------------------------------------------------------
  //
  // Colyseus's transport already listens to this server's 'upgrade' and would answer
  // every socket in its own protocol. So its listeners are taken off and put behind ours:
  // `/ws` and `/bw/<class>/ws` are BLOCKWILD's, everything else is handed on untouched.
  const others = server.listeners('upgrade').slice();
  server.removeAllListeners('upgrade');
  server.on('upgrade', (req, socket, head) => {
    const m = PATH.exec(req.url || '');
    if (!m) {
      if (!others.length) { socket.destroy(); return; }
      for (const l of others) l.call(server, req, socket, head);
      return;
    }
    if (closed || !originAllowed(req.headers.origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    let code = 'default';
    try { code = decodeURIComponent(m[1] || 'default').trim().slice(0, 40) || 'default'; } catch { /* keep default */ }
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws, code));
  });

  function close() {
    closed = true;
    clearInterval(tick); clearInterval(clock);
    for (const w of worlds.values()) { save(w); for (const p of w.players.values()) { try { p.ws.close(1001, 'server closing'); } catch { /* gone */ } } }
    wss.close();
  }

  return {
    worlds, close, save: (code) => (code ? save(world(code)) : [...worlds.values()].map(save).some(Boolean)),
    world, encodeDelta,
    stats: () => [...worlds.values()].map((w) => ({ code: w.code, players: w.players.size, edits: w.edits.size })),
    get maxPlayers() { return maxPlayers; },
  };
}
