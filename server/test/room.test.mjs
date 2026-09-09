// End-to-end protocol test: real Colyseus server + real colyseus.js clients over WebSocket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.RECONNECT_GRACE_SEC = '5';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.CHAT_MIN_INTERVAL_MS = '0';
process.env.MAX_CLIENTS = '3';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { FISH } = await import('../../client/dist/fishing-data.js');
const { WILLOW_LESSONS } = await import('../../client/dist/lesson-data.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
async function join(name, extra = {}) {
  const client = new Client(url);
  const room = await client.joinOrCreate('class', { classCode: 'test-1', name, ...extra });
  const w = await nextMessage(room, 'welcome');
  return { client, room, welcome: w };
}

before(async () => { server = await startServer({ port: 0 }); const addr = server.server.address(); url = `ws://127.0.0.1:${addr.port}`; });
after(async () => { await server.shutdown('test'); });

test('students see each other move and the teacher role is server-decided', async () => {
  const a = await join('Aki', { avatar: { id: 'mia', skin: 1 } });
  const b = await join('Ben', { teacherKey: 'wrong-key' });
  const t = await join('Sensei', { teacherKey: 'testkey12345' });
  assert.equal(a.welcome.role, 'student');
  assert.equal(b.welcome.role, 'student', 'wrong key must not grant teacher');
  assert.equal(t.welcome.role, 'teacher');
  assert.equal(t.welcome.restored, false);
  await waitFor(() => a.room.state.players.size === 3);
  assert.equal(a.room.state.players.get(t.room.sessionId).role, 'teacher');
  assert.equal(a.room.state.players.get(a.room.sessionId).avatar, '{"id":"mia","skin":1}');
  a.room.send('move', { s: 'willow', x: 12.5, z: -3, r: 1.2, a: 'run', t: 1234 });
  await waitFor(() => Math.abs(b.room.state.players.get(a.room.sessionId).x - 12.5) < 0.01);
  const pa = b.room.state.players.get(a.room.sessionId);
  assert.equal(pa.anim, 'run');
  assert.equal(pa.ts, 1234);
  // Teacher gather teleports the others but not the teacher.
  const tpA = nextMessage(a.room, 'teleport');
  const tpB = nextMessage(b.room, 'teleport');
  t.room.send('move', { s: 'meadow', x: 1, z: 2 });
  await sleep(50);
  t.room.send('teacher', { cmd: 'gather' });
  const ack = await nextMessage(t.room, 'teacher:ack');
  assert.equal(ack.count, 2);
  assert.deepEqual((await tpA).space, 'meadow');
  assert.equal((await tpB).x, 1);
  // Students cannot issue teacher commands.
  let leaked = false;
  const off = b.room.onMessage('teleport', () => { leaked = true; });
  a.room.send('teacher', { cmd: 'gather' });
  await sleep(150);
  off();
  assert.equal(leaked, false);
  // Chat pause blocks students only.
  t.room.send('teacher', { cmd: 'chat', paused: true });
  await waitFor(() => a.room.state.chatPaused === true);
  a.room.send('chat', { id: 'hello' });
  assert.equal((await nextMessage(a.room, 'chat:blocked')).reason, 'paused');
  const chat = nextMessage(b.room, 'chat');
  t.room.send('chat', { id: 'hello' });
  assert.equal((await chat).id, 'hello');
  t.room.send('teacher', { cmd: 'chat', paused: false });
  await waitFor(() => a.room.state.chatPaused === false);
  const chat2 = nextMessage(t.room, 'chat');
  a.room.send('chat', { id: 'not-a-phrase' });
  a.room.send('chat', { id: 'lets-go' });
  assert.equal((await chat2).id, 'lets-go');
  // Call + move target.
  const call = nextMessage(b.room, 'call');
  t.room.send('teacher', { cmd: 'call', target: b.room.sessionId });
  assert.equal((await call).by, 'Sensei');
  const mv = nextMessage(b.room, 'teleport');
  t.room.send('teacher', { cmd: 'move', target: b.room.sessionId, space: 'willow', x: 3, z: 8 });
  assert.equal((await mv).reason, 'move');
  // Roster carries server-side stats.
  t.room.send('teacher', { cmd: 'roster' });
  const roster = await nextMessage(t.room, 'roster');
  assert.equal(roster.players.length, 3);
  // Room is full at MAX_CLIENTS=3.
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'test-1', name: 'Dan' }), /class is full/);
  await Promise.all([a.room.leave(), b.room.leave(), t.room.leave()]);
  await sleep(100);
});

test('answers, coins and catches are decided by the server', async () => {
  const a = await join('Chika');
  const step = WILLOW_LESSONS[0].steps[0];
  a.room.send('answer', { q: 'lesson:0:0', c: step[3] });
  let r = await nextMessage(a.room, 'answer:result');
  assert.equal(r.correct, true); assert.equal(r.xp, 5); assert.deepEqual(r.stats, { correct: 1, attempts: 1 });
  a.room.send('answer', { q: 'lesson:0:0', c: (step[3] + 1) % 3 });
  r = await nextMessage(a.room, 'answer:result');
  assert.equal(r.correct, false); assert.deepEqual(r.stats, { correct: 1, attempts: 2 });
  a.room.send('answer', { q: 'bogus', c: 0 });
  r = await nextMessage(a.room, 'answer:result');
  assert.equal(r.ok, false);
  // A correct fish answer awards the catch server-side; selling requires that inventory.
  a.room.send('economy', { op: 'sell', id: FISH[0].id, quantity: 1 });
  let w = await nextMessage(a.room, 'wallet');
  assert.equal(w.ok, false); assert.equal(w.wallet.coins, 0);
  a.room.send('answer', { q: `fish:${FISH[0].id}`, c: FISH[0].id });
  r = await nextMessage(a.room, 'answer:result');
  assert.equal(r.wallet.inventory[FISH[0].id], 1);
  a.room.send('economy', { op: 'sell', id: FISH[0].id, quantity: 1 });
  w = await nextMessage(a.room, 'wallet');
  assert.equal(w.ok, true); assert.equal(w.wallet.coins, FISH[0].price);
  a.room.send('economy', { op: 'catch', id: FISH[0].id });
  w = await nextMessage(a.room, 'wallet');
  assert.equal(w.ok, false, 'clients cannot award themselves catches');
  // Progress blob round-trips.
  a.room.send('progress', { json: JSON.stringify({ kind: 'uspeak-adventure', v: 1 }) });
  assert.equal((await nextMessage(a.room, 'progress:ack')).ok, true);
  a.room.send('progress', { json: 'not json' });
  assert.equal((await nextMessage(a.room, 'progress:ack')).ok, false);
  // Persisted record survives a consented leave and is restored on rejoin (same name).
  await a.room.leave();
  await sleep(100);
  const again = await join('Chika');
  assert.equal(again.welcome.restored, true);
  assert.equal(again.welcome.wallet.coins, FISH[0].price);
  assert.deepEqual(again.welcome.stats, { correct: 2, attempts: 3 });
  assert.equal(JSON.parse(again.welcome.progressJson).kind, 'uspeak-adventure');
  assert.equal(again.welcome.position.space, 'willow');
  await again.room.leave();
  await sleep(100);
});

test('unexpected disconnects keep the seat: token reconnect and same-name takeover', async () => {
  const a = await join('Dai');
  const b = await join('Emi');
  a.room.send('move', { s: 'forest', x: 5, z: 6 });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.space === 'forest');
  const token = a.room.reconnectionToken;
  // Simulate iPad backgrounding: the socket dies without a consented leave.
  const dropA = a.room.connection.transport.ws; (dropA.terminate ? dropA.terminate() : dropA.close());
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.connected === false);
  assert.equal(b.room.state.players.size, 2, 'seat is kept during the grace period');
  const back = await new Client(url).reconnect(token);
  const w = await nextMessage(back, 'welcome');
  assert.equal(w.restored, true);
  assert.equal(back.sessionId, a.room.sessionId);
  await waitFor(() => b.room.state.players.get(back.sessionId)?.connected === true);
  // Same-name join while the seat is disconnected takes it over (page reload lost the token).
  const dropB = back.connection.transport.ws; (dropB.terminate ? dropB.terminate() : dropB.close());
  await waitFor(() => b.room.state.players.get(back.sessionId)?.connected === false);
  const fresh = await join('Dai');
  assert.equal(fresh.welcome.restored, true);
  assert.equal(fresh.welcome.position.space, 'forest');
  await waitFor(() => b.room.state.players.size === 2 && !b.room.state.players.has(back.sessionId));
  // A connected name cannot be joined twice.
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'test-1', name: 'Dai' }), /name in use/);
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'test-1', name: '   ' }), /name required/);
  await Promise.all([fresh.room.leave(), b.room.leave()]);
  await sleep(100);
});
