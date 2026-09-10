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
process.env.AI_MIN_INTERVAL_MS = '0';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { FISH } = await import('../../client/dist/fishing-data.js');
const { WILLOW_LESSONS } = await import('../../client/dist/lesson-data.js');
const { MISSIONS } = await import('../src/game/missions.js');
const { REWARDS, xpToNext } = await import('../src/game/progression.js');
const { SCHOOL } = await import('../src/game/wordquiz.js');
const { ARENA, WAZA, REWARD, DAILY_CAP } = await import('../src/game/battle.js');
const { DEX_BONUS } = await import('../src/game/economy.js');
const { moveForFish } = await import('../src/game/fish-moves.js');
const { PET_ISLAND, EGG_COST, FEED_COST } = await import('../src/game/pets.js');

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
  assert.equal(r.correct, true);
  assert.equal(r.xp, REWARDS.lesson.xp, 'the rate card decides what a right answer is worth');
  assert.deepEqual(r.stats, { correct: 1, attempts: 1 });
  // XP is banked, not just reported: level 1 costs 30, so 10 leaves us short of level 2.
  assert.deepEqual(r.progress, { level: 1, xp: 10, need: 30, total: 10, chats: 0 });
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
  // 10 + 10 = 20, still inside level 1.
  assert.equal(r.progress.level, 1);
  assert.equal(r.progress.total, REWARDS.lesson.xp + REWARDS.fishWord.xp);
  a.room.send('economy', { op: 'sell', id: FISH[0].id, quantity: 1 });
  w = await nextMessage(a.room, 'wallet');
  // The catch also paid the dex bonus, because it was the first of its species.
  assert.equal(w.ok, true); assert.equal(w.wallet.coins, FISH[0].price + DEX_BONUS);
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
  assert.equal(again.welcome.wallet.coins, FISH[0].price + DEX_BONUS);
  assert.deepEqual(again.welcome.wallet.dex, [FISH[0].id], 'the species stays discovered after selling it');
  assert.deepEqual(again.welcome.stats, { correct: 2, attempts: 3 });
  // Level and XP survive the round trip through the store, like coins do.
  assert.equal(again.welcome.progress.level, 1);
  assert.equal(again.welcome.progress.total, REWARDS.lesson.xp + REWARDS.fishWord.xp);
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
  // A connected name cannot be joined twice while it is alive (heartbeats within 3 s)...
  fresh.room.send('move', { s: 'forest', x: 1, z: 1 });
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'test-1', name: 'Dai' }), /name in use/);
  // ...but a seat silent for >3 s (dead iPad socket the server has not noticed) is evicted and taken over.
  await sleep(3200);
  const takeover = await join('Dai');
  assert.equal(takeover.welcome.restored, true);
  assert.equal(takeover.welcome.position.space, 'forest');
  await waitFor(() => b.room.state.players.size === 2 && b.room.state.players.get(takeover.room.sessionId)?.connected === true);
  fresh.room.removeAllListeners();
  await sleep(100);
  await takeover.room.leave();
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'test-1', name: '   ' }), /name required/);
  await b.room.leave();
  await sleep(100);
});

test('the errand is walked: every step is refused away from its place on the island', async () => {
  const a = await join('Mio');
  const t = await join('Sensei2', { teacherKey: 'testkey12345' });
  const mission = MISSIONS.byId.get('bakery-two-drinks');
  const plaza = MISSIONS.island.spotById.get(mission.from);
  const shop = MISSIONS.island.spotById.get(mission.spot);
  // Standing somewhere is declaring a position, exactly as walking does.
  const standAt = async (spot, space = MISSIONS.island.id) => {
    a.room.send('move', { s: space, x: spot.wx, z: spot.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => Math.abs(a.room.state.players.get(a.room.sessionId).x - spot.wx) < 0.01
      && a.room.state.players.get(a.room.sessionId).space === space);
  };

  // The teacher picks today's errand; every client sees it in the shared state.
  t.room.send('teacher', { cmd: 'mission', id: 'bakery-two-drinks' });
  assert.equal((await nextMessage(t.room, 'teacher:ack')).ok, true);
  await waitFor(() => a.room.state.missionId === 'bakery-two-drinks');
  t.room.send('teacher', { cmd: 'mission', id: 'no-such-mission' });
  assert.equal((await nextMessage(t.room, 'teacher:ack')).ok, false);

  // A student cannot invent a mission.
  a.room.send('mission:start', { id: 'no-such-mission' });
  assert.equal((await nextMessage(a.room, 'mission:error')).reason, 'unknown mission');

  // Nor take one from Willow Island, or from the wrong end of おつかい島.
  a.room.send('mission:start', { id: 'bakery-two-drinks' });
  assert.equal((await nextMessage(a.room, 'mission:error')).reason, 'too far');
  await standAt(shop);
  a.room.send('mission:start', { id: 'bakery-two-drinks' });
  let err = await nextMessage(a.room, 'mission:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.spot.id, plaza.id, 'the refusal names where to walk');
  // The same coordinates on another island are still the wrong place.
  await standAt(plaza, 'willow');
  a.room.send('mission:start', { id: 'bakery-two-drinks' });
  assert.equal((await nextMessage(a.room, 'mission:error')).reason, 'too far');

  // ---- leg 1: take the errand at the plaza
  await standAt(plaza);
  a.room.send('mission:start', { id: 'bakery-two-drinks' });
  const opened = await nextMessage(a.room, 'mission:opened');
  assert.equal(opened.stage, 'talk');
  assert.equal(opened.character, 'Oliver');
  assert.equal(opened.goals.length, 3);
  assert.equal(opened.spot.id, 'bakery');
  assert.ok(opened.request.length > 0 && opened.requestJa.length > 0);
  assert.ok(opened.turnLimit >= 2);

  // Talking only works at the shop, and delivering before the errand is done is refused.
  a.room.send('mission:say', { text: "I'd like a juice please" });
  assert.equal((await nextMessage(a.room, 'mission:error')).reason, 'too far');
  a.room.send('mission:deliver', {});
  assert.equal((await nextMessage(a.room, 'mission:error')).reason, 'wrong step');

  // ---- leg 2: walk to the shop and speak English
  await standAt(shop);
  a.room.send('mission:arrive', {});
  const arrived = await nextMessage(a.room, 'mission:arrived');
  assert.equal(arrived.stage, 'talk');
  assert.ok(arrived.opening.length > 0);

  // Without an API key the scripted partner runs, so the flow is deterministic:
  // it credits a goal when the child's words match that goal's example sentence.
  const coinsBefore = a.welcome.wallet.coins;
  a.room.send('mission:say', { text: "I'd like a juice please" });
  let m = await nextMessage(a.room, 'mission:turn');
  assert.deepEqual(m.goalsMet, ['ask']);
  assert.equal(m.stage, 'talk');
  assert.equal(m.turn, 1);
  assert.ok(m.reply.length > 0);

  a.room.send('mission:say', { text: 'Two please' });
  m = await nextMessage(a.room, 'mission:turn');
  assert.deepEqual(m.goalsMet.sort(), ['ask', 'two']);
  assert.equal(m.stage, 'talk');

  a.room.send('mission:say', { text: 'Thank you' });
  m = await nextMessage(a.room, 'mission:turn');
  assert.equal(m.stage, 'deliver', 'saying it all earns the errand, not the coins');
  assert.equal(m.complete, false);
  assert.equal(m.item, mission.item);
  // No coins yet: the errand is in hand, not delivered.
  assert.equal(m.reward, undefined);
  assert.equal(m.wallet, undefined);

  // ---- leg 3: carry it back. Delivering from the shop is refused.
  a.room.send('mission:deliver', {});
  err = await nextMessage(a.room, 'mission:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.spot.id, plaza.id);

  await standAt(plaza);
  a.room.send('mission:deliver', {});
  const delivered = await nextMessage(a.room, 'mission:delivered');
  assert.equal(delivered.reward, 30);
  assert.equal(delivered.wallet.coins, coinsBefore + 30);
  assert.ok(delivered.thanks.length > 0);
  assert.ok(delivered.missionsDone.includes('bakery-two-drinks'), 'the clear is stamped');

  // The reward is the server's to give: a client asking for it is refused.
  a.room.send('economy', { op: 'award', amount: 9999 });
  const w = await nextMessage(a.room, 'wallet');
  assert.equal(w.ok, false);
  assert.equal(w.wallet.coins, coinsBefore + 30);

  // Delivering twice pays once.
  a.room.send('mission:deliver', {});
  a.room.send('mission:say', { text: 'Hello again' });
  await sleep(200);

  // The stamp and the coins survive a rejoin.
  await a.room.leave();
  await sleep(100);
  const again = await join('Mio');
  assert.equal(again.welcome.wallet.coins, coinsBefore + 30);
  assert.ok(again.welcome.missionsDone.includes('bakery-two-drinks'));
  assert.equal(again.welcome.errand, null);
  await again.room.leave();
  await t.room.leave();
});

test('an errand in progress comes back after a disconnect', async () => {
  const a = await join('Rin');
  const mission = MISSIONS.byId.get('square-introduce');
  const plaza = MISSIONS.island.spotById.get(mission.from);
  a.room.send('move', { s: MISSIONS.island.id, x: plaza.wx, z: plaza.wz, r: 0, a: 'idle', t: 1 });
  await waitFor(() => a.room.state.players.get(a.room.sessionId).space === MISSIONS.island.id);
  a.room.send('mission:start', { id: mission.id });
  await nextMessage(a.room, 'mission:opened');

  // Simulate the iPad locking mid-errand: the socket dies without a consented leave.
  const token = a.room.reconnectionToken;
  const drop = a.room.connection.transport.ws; (drop.terminate ? drop.terminate() : drop.close());
  await sleep(150);
  const back = await new Client(url).reconnect(token);
  const w = await nextMessage(back, 'welcome');
  assert.equal(w.restored, true);
  assert.ok(w.errand, 'the tracker knows what was still in hand');
  assert.equal(w.errand.id, mission.id);
  assert.equal(w.errand.stage, 'talk');
  assert.equal(w.errand.spot.id, mission.spot);
  assert.equal(w.errand.from.id, mission.from);
  await back.leave();
});

test('the word huts are entered by walking in, and graded by the server', async () => {
  const a = await join('Sora');
  const easy = SCHOOL.spotById.get('easy');
  const hard = SCHOOL.spotById.get('hard');
  const standAt = async (hut, space = SCHOOL.id) => {
    a.room.send('move', { s: space, x: hut.wx, z: hut.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => {
      const p = a.room.state.players.get(a.room.sessionId);
      return p.space === space && Math.abs(p.x - hut.wx) < 0.01;
    });
  };

  // Not from Willow, and not from the wrong hut.
  a.room.send('quiz:start', { hut: 'easy' });
  assert.equal((await nextMessage(a.room, 'quiz:error')).reason, 'too far');
  await standAt(hard);
  a.room.send('quiz:start', { hut: 'easy' });
  let err = await nextMessage(a.room, 'quiz:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.hut.id, 'easy', 'the refusal names the hut to walk to');
  await standAt(easy, 'willow');
  a.room.send('quiz:start', { hut: 'easy' });
  assert.equal((await nextMessage(a.room, 'quiz:error')).reason, 'too far');
  a.room.send('quiz:start', { hut: 'nowhere' });
  assert.equal((await nextMessage(a.room, 'quiz:error')).reason, 'unknown hut');

  // Inside the hut, a set begins - and the answer is not in the question.
  await standAt(easy);
  a.room.send('quiz:start', { hut: 'easy' });
  const q = await nextMessage(a.room, 'quiz:question');
  assert.equal(q.difficulty, 'easy');
  assert.equal(q.total, 10);
  assert.equal(q.choices.length, 4);
  assert.equal('answer' in q, false, 'the client is never told which one is right');

  const coins0 = a.welcome.wallet.coins;
  // Guessing every question the same way: some land, and the server says which.
  let seen = null;
  let right = 0;
  for (let i = 0; i < 10; i += 1) {
    a.room.send('quiz:answer', { choice: 0 });
    seen = await nextMessage(a.room, 'quiz:result');
    assert.equal(seen.index, i);
    assert.ok(seen.answer >= 0 && seen.answer <= 3, 'the answer arrives after committing');
    if (seen.correct) right += 1;
    assert.equal(seen.score, right);
  }
  assert.equal(seen.done, true);
  assert.equal(seen.next, null);
  assert.equal(seen.wallet.coins, coins0 + right * REWARDS.wordQuiz.coins + (seen.perfectBonus || 0));
  assert.equal(seen.progress.total, right * REWARDS.wordQuiz.xp);

  // Walking out mid-set stops the answering rather than ending it.
  a.room.send('quiz:start', { hut: 'easy' });
  await nextMessage(a.room, 'quiz:question');
  await standAt(hard);
  a.room.send('quiz:answer', { choice: 0 });
  err = await nextMessage(a.room, 'quiz:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.hut.id, 'easy', 'and it names the hut to walk back to');
  await standAt(easy);
  a.room.send('quiz:answer', { choice: 0 });
  assert.equal((await nextMessage(a.room, 'quiz:result')).index, 0, 'the set carried on where it was');

  await a.room.leave();
  await sleep(100);
});

test('the gym judges the speaking, so a client cannot pay itself', async () => {
  const a = await join('Nao');
  const gym = SCHOOL.spotById.get('gym');
  const easy = SCHOOL.spotById.get('easy');
  const standAt = async (spot) => {
    a.room.send('move', { s: SCHOOL.id, x: spot.wx, z: spot.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => Math.abs(a.room.state.players.get(a.room.sessionId).x - spot.wx) < 0.01
      && a.room.state.players.get(a.room.sessionId).space === SCHOOL.id);
  };

  // Standing at a hut is not standing at the gym.
  await standAt(easy);
  a.room.send('gym:start', { mode: 'speak' });
  let err = await nextMessage(a.room, 'gym:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.hut.id, 'gym');

  await standAt(gym);
  a.room.send('gym:start', { mode: 'speak' });
  const q = await nextMessage(a.room, 'gym:question');
  assert.equal(q.mode, 'speak');
  assert.equal(q.total, 5);
  assert.ok(q.say && q.ja && q.emoji, 'a word to read, in both languages, with its picture');
  assert.equal(q.choices, null);

  const coins0 = a.welcome.wallet.coins;
  // Saying a different word does not pay, however confidently the page asserts it.
  a.room.send('gym:answer', { text: 'zzzzzz', correct: true, xp: 999 });
  let r = await nextMessage(a.room, 'gym:result');
  assert.equal(r.correct, false);
  assert.equal(r.wallet.coins, coins0, 'the client claiming it was right changes nothing');
  assert.equal(r.progress.total, 0);

  // Saying the word does.
  a.room.send('gym:answer', { text: r.next.say });
  r = await nextMessage(a.room, 'gym:result');
  assert.equal(r.correct, true);
  assert.equal(r.wallet.coins, coins0 + REWARDS.gym.coins);
  assert.equal(r.progress.total, REWARDS.gym.xp);

  // Walking out stops the drill rather than ending it.
  await standAt(easy);
  a.room.send('gym:answer', { text: 'anything' });
  assert.equal((await nextMessage(a.room, 'gym:error')).reason, 'too far');
  await standAt(gym);
  a.room.send('gym:answer', { text: 'nope' });
  assert.equal((await nextMessage(a.room, 'gym:result')).index, 2, 'the set carried on where it was');

  await a.room.leave();
  await sleep(100);
});

test('the arena decides the damage, and caps what a day can pay', async () => {
  const a = await join('Riku');
  const easy = ARENA.spotById.get('easy');
  const hard = ARENA.spotById.get('hard');
  const standAt = async (spot) => {
    a.room.send('move', { s: ARENA.id, x: spot.wx, z: spot.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => {
      const p = a.room.state.players.get(a.room.sessionId);
      return p.space === ARENA.id && Math.abs(p.x - spot.wx) < 0.01;
    });
  };

  // Not from another island, and not from the wrong stand.
  a.room.send('battle:start', { stand: 'easy' });
  assert.equal((await nextMessage(a.room, 'battle:error')).reason, 'too far');
  await standAt(hard);
  a.room.send('battle:start', { stand: 'easy' });
  let err = await nextMessage(a.room, 'battle:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.stand.id, 'easy');
  a.room.send('battle:start', { stand: 'pvp' });
  assert.equal((await nextMessage(a.room, 'battle:error')).reason, 'unknown stand');

  await standAt(easy);
  a.room.send('battle:start', { stand: 'easy' });
  const start = await nextMessage(a.room, 'battle:state');
  assert.equal(start.difficulty, 'easy');
  assert.equal(start.foe.hp, start.foe.max);
  assert.equal(start.waza.length, 4);
  assert.equal(start.room, DAILY_CAP, 'a fresh day has the whole allowance');

  // A strong move asks a question, and the answer is not in it.
  a.room.send('battle:waza', { waza: 'super' });
  const quiz = await nextMessage(a.room, 'battle:quiz');
  assert.equal('answer' in quiz, false);
  assert.equal(quiz.choices.length, 3);
  assert.equal(quiz.waza, 'super');

  // Answering resolves the turn; the damage is the server's number, not ours.
  a.room.send('battle:answer', { choice: 0, correct: true, damage: 9999 });
  let turn = await nextMessage(a.room, 'battle:turn');
  assert.ok(turn.quiz.answer >= 0 && turn.quiz.answer <= 2, 'the answer comes back after committing');
  const dealt = turn.foe.max - turn.foe.hp;
  assert.ok(dealt === 0 || dealt === WAZA.super.damage, `a client cannot invent damage: ${dealt}`);

  // Fight it out with the safe move until someone falls.
  let guard = 0;
  while (!turn.over && guard < 60) {
    a.room.send('battle:waza', { waza: 'poyon' });
    turn = await nextMessage(a.room, 'battle:turn');
    guard += 1;
  }
  assert.equal(turn.over, true, 'the battle ended');
  assert.equal(turn.paid, turn.won ? REWARD.win : REWARD.lose);
  assert.equal(turn.capped, false);
  assert.equal(turn.room, DAILY_CAP - turn.paid, 'the allowance went down by what was paid');
  assert.equal(turn.wallet.coins, a.welcome.wallet.coins + turn.paid);

  await a.room.leave();
  await sleep(100);
});

test('the dojo trades a fish for a move, and the move joins the battle', async () => {
  const a = await join('Hana');
  const dojo = ARENA.spotById.get('dojo');
  const easy = ARENA.spotById.get('easy');
  const standAt = async (spot) => {
    a.room.send('move', { s: ARENA.id, x: spot.wx, z: spot.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => {
      const p = a.room.state.players.get(a.room.sessionId);
      return p.space === ARENA.id && Math.abs(p.x - spot.wx) < 0.01;
    });
  };

  // Land a fish the honest way, which the server judges.
  const fish = FISH[0];
  a.room.send('answer', { q: `fish:${fish.id}`, c: fish.id });
  let r = await nextMessage(a.room, 'answer:result');
  assert.equal(r.wallet.inventory[fish.id], 1);
  assert.deepEqual(r.wallet.dex, [fish.id], 'and it goes in the dex');

  // Not from a battle stand.
  await standAt(easy);
  a.room.send('fish:feed', { id: fish.id });
  assert.equal((await nextMessage(a.room, 'fish:error')).reason, 'too far');

  await standAt(dojo);
  a.room.send('fish:feed', { id: 'not-a-fish' });
  assert.equal((await nextMessage(a.room, 'fish:error')).reason, 'unknown fish');
  a.room.send('fish:feed', { id: FISH[5].id });
  assert.equal((await nextMessage(a.room, 'fish:error')).reason, 'no fish', 'you cannot eat what you do not have');

  a.room.send('fish:feed', { id: fish.id });
  const learned = await nextMessage(a.room, 'fish:learned');
  assert.deepEqual(learned.move, moveForFish(fish.id));
  assert.equal(learned.forgot, null);
  assert.equal(learned.wallet.inventory[fish.id], undefined, 'the fish was eaten');
  assert.deepEqual(learned.wallet.dex, [fish.id], 'but the dex keeps it');

  // And the move is there in the arena, as a fifth button.
  await standAt(easy);
  a.room.send('battle:start', { stand: 'easy' });
  const start = await nextMessage(a.room, 'battle:state');
  assert.equal(start.waza.length, 5);
  const taught = start.waza.find((w) => w.fish);
  assert.equal(taught.id, learned.move.id);
  assert.equal(taught.damage, learned.move.damage);

  // Using it asks a question like any other strong move, and lands for its own damage.
  a.room.send('battle:waza', { waza: taught.id });
  const quiz = await nextMessage(a.room, 'battle:quiz');
  assert.equal(quiz.waza, taught.id);
  assert.equal(quiz.seconds, taught.seconds);
  a.room.send('battle:answer', { choice: 0 });
  const turn = await nextMessage(a.room, 'battle:turn');
  const dealt = turn.foe.max - turn.foe.hp;
  assert.ok(dealt === 0 || dealt === taught.damage, `${dealt} is not this move's damage`);

  a.room.send('battle:quit', {});
  await a.room.leave();
  await sleep(100);
});

test('a pet is bought, fed and patted in three different places', async () => {
  const a = await join('Yui');
  const nest = PET_ISLAND.spotById.get('nest');
  const kitchen = PET_ISLAND.spotById.get('kitchen');
  const meadow = PET_ISLAND.spotById.get('meadow');
  const standAt = async (spot) => {
    a.room.send('move', { s: PET_ISLAND.id, x: spot.wx, z: spot.wz, r: 0, a: 'idle', t: 1 });
    await waitFor(() => {
      const p = a.room.state.players.get(a.room.sessionId);
      return p.space === PET_ISLAND.id && Math.abs(p.x - spot.wx) < 0.01;
    });
  };

  // No coins, no egg - and a client cannot simply grant itself the price either.
  await standAt(nest);
  a.room.send('pet:hatch', {});
  let err = await nextMessage(a.room, 'pet:error');
  assert.equal(err.reason, 'not enough coins');
  assert.equal(err.need, EGG_COST);
  a.room.send('economy', { op: 'spend', amount: -EGG_COST });
  assert.equal((await nextMessage(a.room, 'wallet')).ok, false, 'spending is the server\'s to do');

  // Earn honestly: win coins in the arena? No - just take the teacher's word for it by
  // catching fish, which the server judges.
  let coins = a.welcome.wallet.coins;
  for (let i = 0; i < 12 && coins < EGG_COST + FEED_COST; i += 1) {
    a.room.send('answer', { q: `fish:${FISH[i].id}`, c: FISH[i].id });
    const r = await nextMessage(a.room, 'answer:result');
    a.room.send('economy', { op: 'sellAll' });
    const w = await nextMessage(a.room, 'wallet');
    coins = w.wallet.coins;
  }
  assert.ok(coins >= EGG_COST, `only earned ${coins}`);

  // The egg only hatches at the nest.
  await standAt(kitchen);
  a.room.send('pet:hatch', {});
  err = await nextMessage(a.room, 'pet:error');
  assert.equal(err.reason, 'too far');
  assert.equal(err.spot.kind, 'nest');

  await standAt(nest);
  a.room.send('pet:hatch', {});
  const hatched = await nextMessage(a.room, 'pet:hatched');
  assert.ok(hatched.pet.name && hatched.pet.emoji);
  assert.equal(hatched.pet.hunger, 100);
  assert.equal(hatched.wallet.coins, coins - EGG_COST, 'the egg was paid for');
  a.room.send('pet:hatch', {});
  assert.equal((await nextMessage(a.room, 'pet:error')).reason, 'already have one');

  // Feeding belongs to the kitchen, patting to the meadow - and neither works elsewhere.
  a.room.send('pet:act', { action: 'feed' });
  assert.equal((await nextMessage(a.room, 'pet:error')).spot.kind, 'kitchen');
  a.room.send('pet:act', { action: 'pat' });
  assert.equal((await nextMessage(a.room, 'pet:error')).spot.kind, 'meadow');

  // A freshly hatched pet is too full to eat, which is a refusal, not a charge.
  await standAt(kitchen);
  const beforeFeed = hatched.wallet.coins;
  a.room.send('pet:act', { action: 'feed' });
  assert.equal((await nextMessage(a.room, 'pet:error')).reason, 'already full');

  await standAt(meadow);
  a.room.send('pet:act', { action: 'pat' });
  const patted = await nextMessage(a.room, 'pet:acted');
  assert.equal(patted.cost, 0, 'patting is free');
  assert.equal(patted.wallet.coins, beforeFeed);
  assert.ok(patted.pet.xp > 0);
  a.room.send('pet:act', { action: 'pat' });
  assert.equal((await nextMessage(a.room, 'pet:error')).reason, 'too soon');

  // The pet comes back with the session.
  await a.room.leave();
  await sleep(100);
  const again = await join('Yui');
  assert.ok(again.welcome.pet, 'the pet was remembered');
  assert.equal(again.welcome.pet.name, hatched.pet.name);
  assert.equal(again.welcome.pet.species, hatched.pet.species);
  await again.room.leave();
});
