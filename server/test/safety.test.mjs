// こどもの 安全と コインの 抜け道（2026-10 の 点検）。
//  ・先生が いない 時間は、通話と じぶんで かいた 文は 止まる（フレーズは 送れる）。
//  ・U-Speak島の つりは 部屋が 引いた 魚にだけ 答えられる（前は 問題の 名前に 答えが 入っていた）。
//  ・さかなを うって もらえる コインは 1日 SELL_CAP まで。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';
process.env.CHAT_MIN_INTERVAL_MS = '0';

const { startServer } = await import('../src/index.js');
const { SELL_CAP } = await import('../src/rooms/ClassRoom.js');
const { FISH, FISH_BY_ID } = await import('../../client/dist/fishing-data.js');
const { Client } = await import('colyseus.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (classCode, name, extra = {}) => {
  const room = await new Client(url).joinOrCreate('class', { classCode, name, ...extra });
  room.onMessage('*', () => {});
  const welcome = await nextMessage(room, 'welcome');
  return { room, welcome };
};
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('先生が いない あいだ：じぶんで かいた 文と 通話は 止まり、フレーズは とどく。先生が くると ひらく', async () => {
  const a = await join('safe1', 'Aki');
  a.room.send('chat', { text: 'hello friends' });
  assert.equal((await nextMessage(a.room, 'chat:blocked')).reason, 'no teacher');
  a.room.send('move', { s: 'talk', x: 0, z: 0, r: 0, a: 'idle', t: 1 });
  await sleep(100);
  a.room.send('voice:join');
  assert.equal((await nextMessage(a.room, 'voice:error')).reason, 'no teacher');
  const b = await join('safe1', 'Bo');
  const heard = nextMessage(b.room, 'chat');
  a.room.send('chat', { id: 'hello' });
  assert.ok(await heard, 'a preset phrase still goes through');

  const t = await join('safe1', 'Sensei', { teacherKey: 'testkey12345' });
  await sleep(1200);
  const sent = nextMessage(b.room, 'chat');
  a.room.send('chat', { text: 'hello friends' });
  assert.ok(await sent, 'with a teacher in the room, typing is allowed');
  await t.room.leave(); await b.room.leave(); await a.room.leave();
});

test('つり：なげて いない 魚・ちがう 魚には 答えられない。1 投げに 2 回まで', async () => {
  const a = await join('safe2', 'Ren');
  a.room.send('answer', { q: `fish:${FISH[99].id}`, c: FISH[99].id });
  assert.equal((await nextMessage(a.room, 'answer:result')).error, 'no cast', 'naming the rarest fish no longer catches it');
  a.room.send('fish:cast', { zone: 'pond', grade: 'all' });
  const fish = FISH_BY_ID[(await nextMessage(a.room, 'fish:cast')).fish];
  assert.equal(fish.zone, 'pond', 'the room rolls the fish for the zone');
  const other = FISH.find((f) => f.id !== fish.id);
  a.room.send('answer', { q: `fish:${other.id}`, c: other.id });
  assert.equal((await nextMessage(a.room, 'answer:result')).error, 'no cast');
  a.room.send('answer', { q: `fish:${fish.id}`, c: other.id });
  assert.equal((await nextMessage(a.room, 'answer:result')).correct, false);
  a.room.send('answer', { q: `fish:${fish.id}`, c: fish.id });
  const second = await nextMessage(a.room, 'answer:result');
  assert.equal(second.correct, true, 'the second try is still allowed');
  a.room.send('answer', { q: `fish:${fish.id}`, c: fish.id });
  assert.equal((await nextMessage(a.room, 'answer:result')).error, 'no cast', 'one catch per cast');
  await a.room.leave();
});

test('さかなを うって もらえる コインは 1日 SELL_CAP まで（入りなおしても もどらない）', async () => {
  let a = await join('safe3', 'Mio');
  let sold = 0; let refused = false;
  for (let i = 0; i < 80 && !refused; i += 1) {
    a.room.send('fish:cast', { zone: 'sea', grade: 'all' });
    const fish = FISH_BY_ID[(await nextMessage(a.room, 'fish:cast')).fish];
    a.room.send('answer', { q: `fish:${fish.id}`, c: fish.id });
    await nextMessage(a.room, 'answer:result');
    a.room.send('economy', { op: 'sellAll' });
    const w = await nextMessage(a.room, 'wallet');
    if (w.ok) sold += 1; else { assert.equal(w.error, 'sell cap'); refused = true; }
    if (i === 1) { await a.room.leave(); await sleep(100); a = await join('safe3', 'Mio'); }
  }
  assert.ok(refused, 'selling stops at the cap');
  assert.ok(sold >= 1);
  await a.room.leave();
  assert.ok(SELL_CAP > 0);
});
