// BLOCKWILD together: the vendored block game's own multiplayer protocol, answered by this
// server. One world per class, twenty children at once, every edit kept and handed to the
// next child in, and Colyseus still answering on the same port.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'bw-data-'));

const { startServer } = await import('../src/index.js');
const { createBlockwildServer, encodeDelta, idxOf, fileFor, BW_MAX_PLAYERS } = await import('../src/blockwild/server.js');
const { Client } = await import('colyseus.js');

// The spawn worker runs the real generator (a second or two); the tests stand in a fixed
// spawn so twenty joins do not wait on twenty generations.
const quickSpawn = async () => [128.5, 40, 128.5];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A client that speaks what blockwild/src/net.js speaks: join, then a binary delta and a
// JSON welcome, then messages.
function bwClient(url, name) {
  const ws = new WebSocket(url);
  const c = { ws, msgs: [], delta: null, welcome: null, closedWith: null, waiters: [] };
  const settle = () => { for (const w of [...c.waiters]) { const m = c.msgs.find(w.pick); if (m) { c.waiters.splice(c.waiters.indexOf(w), 1); w.resolve(m); } } };
  c.ready = new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name })));
    ws.on('message', (data, isBinary) => {
      if (isBinary) { c.delta = new Uint8Array(data); return; }
      const m = JSON.parse(data.toString());
      if (m.t === 'welcome') { c.welcome = m; resolve(m); return; }
      if (m.t === 'full') { c.closedWith = m; reject(new Error('full')); return; }
      c.msgs.push(m); settle();
    });
    ws.on('error', reject);
    ws.on('close', () => { if (!c.welcome && !c.closedWith) reject(new Error('closed')); });
  });
  c.send = (obj) => ws.send(JSON.stringify(obj));
  c.next = (pick, timeout = 4000) => new Promise((resolve, reject) => {
    const fn = typeof pick === 'string' ? (m) => m.t === pick : pick;
    const have = c.msgs.find(fn); if (have) { resolve(have); return; }
    const w = { pick: fn, resolve }; c.waiters.push(w);
    setTimeout(() => { if (c.waiters.includes(w)) { c.waiters.splice(c.waiters.indexOf(w), 1); reject(new Error(`no ${typeof pick === 'string' ? pick : 'match'} within ${timeout}ms; saw ${c.msgs.map((m) => m.t).join(',')}`)); } }, timeout);
  });
  c.take = (fn) => { const i = c.msgs.findIndex(fn); return i < 0 ? null : c.msgs.splice(i, 1)[0]; };
  c.close = () => new Promise((r) => { ws.once('close', r); ws.close(); });
  return c;
}
const decodeDelta = (bytes) => { const out = []; const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); for (let o = 1; o + 5 < bytes.length; o += 6) out.push([dv.getUint32(o, true), bytes[o + 4], bytes[o + 5]]); return out; };

let app; let base;
before(async () => {
  app = await startServer({ port: 0 });
  // Swap the spawn finder for the tests (the real one is exercised on its own below).
  const real = app.blockwild;
  app.bw = createBlockwildServer({ server: http.createServer(), dataDir: process.env.DATA_DIR, log: { info() {}, warn() {} }, spawnFor: quickSpawn });
  void real;
  base = `ws://127.0.0.1:${app.server.address().port}`;
});
after(async () => { app.bw.close(); await app.shutdown('test'); });

// The server mounted in startServer uses the real spawn worker; this standalone one, on a
// bare http server, is what most tests drive so the generator is not run twenty times.
let standalone; let sbase;
before(async () => {
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  standalone = createBlockwildServer({ server: srv, dataDir: process.env.DATA_DIR, log: { info() {}, warn() {} }, spawnFor: quickSpawn });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  sbase = `ws://127.0.0.1:${srv.address().port}`;
  standalone.httpServer = srv;
});
after(async () => { standalone.close(); await new Promise((r) => standalone.httpServer.close(r)); });

test('two children in one class share one world: same seed, each other on the roster, a block from one lands on the other', async () => {
  const a = bwClient(`${sbase}/bw/1A/ws`, 'Sora');
  const wa = await a.ready;
  assert.ok(Number.isInteger(wa.id) && wa.id >= 1);
  assert.equal(typeof wa.seed, 'number'); assert.deepEqual(wa.spawn, [128.5, 40, 128.5]); assert.equal(wa.max, BW_MAX_PLAYERS);
  assert.deepEqual(wa.players, []); assert.deepEqual(wa.mobs, []);
  assert.ok(a.delta && a.delta.length === 1, 'an untouched world is a one-byte delta');
  const b = bwClient(`${sbase}/bw/1A/ws`, 'Rin');
  const wb = await b.ready;
  assert.equal(wb.seed, wa.seed, 'same class, same world');
  assert.deepEqual(wb.players.map((p) => p.name), ['Sora']);
  const joined = await a.next('join'); assert.equal(joined.name, 'Rin');
  const ro = await a.next((m) => m.t === 'roster' && m.a.length === 2); assert.deepEqual(ro.a.map((r) => r[1]).sort(), ['Rin', 'Sora']);
  // A block placed by Sora reaches Rin, not Sora (she already drew it), and is kept.
  a.send({ t: 'block', x: 10, y: 30, z: 12, id: 5, m: 0 });
  const blk = await b.next('block'); assert.deepEqual([blk.x, blk.y, blk.z, blk.id, blk.m], [10, 30, 12, 5, 0]);
  await sleep(50);
  assert.equal(a.msgs.some((m) => m.t === 'block'), false, 'the sender is not told their own block');
  assert.deepEqual(standalone.world('1A').edits.get(idxOf(10, 30, 12)), [5, 0]);
  // Positions go round ten times a second once two are in.
  a.send({ t: 'pos', x: 10.5, y: 31, z: 12.5, yaw: 1.2, pitch: 0, f: 2, h: 5, hp: 20 });
  const pl = await b.next((m) => m.t === 'players' && m.a.some((r) => r[0] === wa.id && r[1] === 10.5));
  assert.ok(pl);
  // A third child in gets the edits first, then the welcome with both names.
  const c = bwClient(`${sbase}/bw/1A/ws`, 'Umi');
  const wc = await c.ready;
  assert.deepEqual(decodeDelta(c.delta), [[idxOf(10, 30, 12), 5, 0]]);
  assert.deepEqual(wc.players.map((p) => p.name).sort(), ['Rin', 'Sora']);
  // Hitting a friend reaches only that friend, with the hitter's name.
  c.send({ t: 'pvp', id: wa.id, dmg: 2 });
  const hurt = await a.next('hurt'); assert.equal(hurt.from, 'Umi'); assert.equal(hurt.dmg, 2);
  await sleep(50); assert.equal(b.msgs.some((m) => m.t === 'hurt'), false);
  // Sleeping makes it morning for everyone.
  b.send({ t: 'time', sleep: 1 });
  const tm = await a.next('time'); assert.ok((tm.time % 720) / 720 > 0.26 && (tm.time % 720) / 720 < 0.3, `morning: ${tm.time}`);
  // Leaving: the others hear it and the roster shrinks.
  await c.close();
  const left = await a.next('leave'); assert.equal(left.id, wc.id);
  await a.next((m) => m.t === 'roster' && m.a.length === 2);
  await a.close(); await b.close();
});

test('different classes are different worlds', async () => {
  const a = bwClient(`${sbase}/bw/2B/ws`, 'Sora'); await a.ready;
  const b = bwClient(`${sbase}/bw/3C/ws`, 'Rin'); await b.ready;
  a.send({ t: 'block', x: 1, y: 1, z: 1, id: 1, m: 0 });
  await sleep(150);
  assert.equal(b.msgs.some((m) => m.t === 'block'), false);
  assert.equal(standalone.world('3C').edits.size, 0);
  assert.equal(standalone.world('2B').edits.size, 1);
  // The bare `/ws` the vendored client dials by default is the "default" class.
  const d = bwClient(`${sbase}/ws`, 'Kai'); await d.ready;
  assert.ok(standalone.worlds.has('default'));
  await a.close(); await b.close(); await d.close();
});

test('the twenty-first child is told the world is full', async () => {
  const kids = [];
  for (let i = 0; i < BW_MAX_PLAYERS; i += 1) kids.push(bwClient(`${sbase}/bw/FULL/ws`, `K${i}`));
  await Promise.all(kids.map((k) => k.ready));
  assert.equal(standalone.world('FULL').players.size, BW_MAX_PLAYERS);
  const extra = bwClient(`${sbase}/bw/FULL/ws`, 'Late');
  await assert.rejects(extra.ready, /full/);
  assert.equal(extra.closedWith?.t, 'full');
  await kids[0].close();
  await sleep(50);
  const again = bwClient(`${sbase}/bw/FULL/ws`, 'Late'); await again.ready;
  await Promise.all([again, ...kids.slice(1)].map((k) => k.close()));
});

test('bad blocks are dropped, not stored; names are trimmed; a flood is throttled', async () => {
  const a = bwClient(`${sbase}/bw/4D/ws`, '  <b>Sora</b>' + 'x'.repeat(40)); await a.ready;
  const w = standalone.world('4D');
  assert.equal([...w.players.values()][0].name.length, 16);
  assert.equal([...w.players.values()][0].name.includes('<'), false);
  a.send({ t: 'block', x: 256, y: 1, z: 1, id: 1 }); a.send({ t: 'block', x: 1, y: 64, z: 1, id: 1 });
  a.send({ t: 'block', x: 1.5, y: 1, z: 1, id: 1 }); a.send({ t: 'block', x: 1, y: 1, z: 1, id: 999 }); a.send({ t: 'block', x: 1, y: 1, z: 1 });
  a.send('not json');
  await sleep(100);
  assert.equal(w.edits.size, 0);
  for (let i = 0; i < 1000; i += 1) a.send({ t: 'block', x: i % 256, y: 2, z: 7, id: 3, m: 0 });
  await sleep(300);
  assert.ok(w.edits.size >= 250 && w.edits.size <= 320, `throttled to a second's worth: ${w.edits.size}`);
  await a.close();
});

test('the world survives a restart: seed, time and every edit come back from the file', async () => {
  const a = bwClient(`${sbase}/bw/5E/ws`, 'Sora'); const w1 = await a.ready;
  a.send({ t: 'block', x: 3, y: 40, z: 4, id: 7, m: 2 }); a.send({ t: 'block', x: 3, y: 41, z: 4, id: 8, m: 0 });
  await sleep(50);
  await a.close();
  assert.equal(standalone.save('5E'), true);
  const file = fileFor(process.env.DATA_DIR, '5E');
  assert.ok(existsSync(file));
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(raw.seed, w1.seed); assert.equal(raw.edits.length, 2);
  // A second server over the same folder: same world.
  const srv = http.createServer();
  const again = createBlockwildServer({ server: srv, dataDir: process.env.DATA_DIR, log: { info() {}, warn() {} }, spawnFor: quickSpawn });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = bwClient(`ws://127.0.0.1:${srv.address().port}/bw/5E/ws`, 'Rin'); const w2 = await b.ready;
  assert.equal(w2.seed, w1.seed);
  assert.deepEqual(decodeDelta(b.delta).sort((x, y) => x[0] - y[0]), [[idxOf(3, 40, 4), 7, 2], [idxOf(3, 41, 4), 8, 0]]);
  await b.close(); again.close(); await new Promise((r) => srv.close(r));
  assert.equal(encodeDelta(new Map()).length, 1);
});

test('on the real server the door is shared: BLOCKWILD at /bw/…/ws, Colyseus for everything else, same port', async () => {
  // Colyseus first, so a broken hand-off would show here rather than in room.test.
  const client = new Client(base);
  const room = await client.joinOrCreate('class', { name: 'Door', classCode: 'bwdoor' });
  assert.ok(room.sessionId);
  await room.leave();
  // The real server's own BLOCKWILD server, with the real spawn worker: the generator runs
  // once and the spawn it finds is on the map.
  const a = bwClient(`${base}/bw/bwdoor/ws`, 'Sora');
  const w = await a.ready;
  assert.ok(w.spawn[0] > 0 && w.spawn[0] < 256 && w.spawn[2] > 0 && w.spawn[2] < 256 && w.spawn[1] > 20, JSON.stringify(w.spawn));
  assert.ok(app.blockwild.stats().some((s) => s.code === 'bwdoor' && s.players === 1));
  await a.close();
});
