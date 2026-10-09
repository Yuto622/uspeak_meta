// メインの島 — 本物の部屋と本物のソケットで：英単語ハウスは部屋が判定してコインを払い、記録は Roblox と同じ形
// （world="hut"）。つり場は位置なしで釣れる（spot "main"）。島にいた時間は session（world="main"）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { BANK } = await import('../src/game/wordhouse.js');
const { FW } = await import('../src/game/fishworld.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (name) => { const room = await new Client(url).joinOrCreate('class', { classCode: 'wh1', name }); const welcome = await nextMessage(room, 'welcome'); return { room, welcome }; };

before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

// The right answer, from the bank the room drew it from — the way a child knows the words.
function solve(level, f) {
  const b = BANK[level];
  if (f.kind === 'mc' && f.prompt) return b.choice.find((x) => x.q === f.prompt).a;
  if (f.kind === 'mc') return b.pool.find((q) => q.q === f.word).a;
  if (f.kind === 'match') return f.left.map((en) => b.pool.find((q) => q.q === en).a);
  if (f.kind === 'listen') return f.word;
  if (f.kind === 'type') return b.pool.find((q) => q.a === f.ja && q.q.length === f.length).q;
  if (f.kind === 'fill') return b.blanks.find((x) => { const [l, r] = x.q.split(/_{2,}/); return l.trim() === f.before && r.trim() === f.after; }).a;
  if (f.kind === 'order') return b.sentences.find((x) => x.ja === f.ja).en;
  throw new Error(`unexpected ${f.kind}`);
}

test('英単語ハウス: 部屋が判定して払う、まちがい → 同じ問題、2回目は半分、Roblox と同じ記録', async () => {
  const { room, welcome } = await join('Hana');
  const coins0 = welcome.wallet.coins;
  room.send('main:enter', {});
  room.send('wh:start', { house: 'hut_medium', level: 'Medium' });
  let ask = await nextMessage(room, 'wh:ask');
  assert.equal(ask.level, 'Medium'); assert.equal(ask.n, 10); assert.equal(ask.i, 0);
  // Miss once: same question, attempt 2, the answer shown, no coins.
  room.send('wh:answer', { qid: ask.qid, answer: '___nope___' });
  const miss = await nextMessage(room, 'wh:result');
  assert.equal(miss.retry, true); assert.equal(miss.coins, 0); assert.equal(miss.format.attempt, 2); assert.ok(miss.reveal);
  // Right on the second try: half the coins, no XP, then the next question arrives with the result.
  room.send('wh:answer', { qid: ask.qid, answer: solve('Medium', miss.format) });
  const half = await nextMessage(room, 'wh:result');
  assert.equal(half.correct, true); assert.equal(half.coins, 2); assert.equal(half.xp, undefined);
  assert.equal(half.wallet.coins, coins0 + 2);
  ask = half.next;
  let done = null;
  while (!done) {
    room.send('wh:answer', { qid: ask.qid, answer: solve('Medium', ask.format) });
    const r = await nextMessage(room, 'wh:result');
    assert.equal(r.correct, true, `${ask.format.kind} judged wrong`); assert.equal(r.coins, 4); assert.equal(r.xp, 5);
    if (r.done) done = r; else ask = r.next;
  }
  assert.equal(done.done.correct, 10); assert.equal(done.done.bonus, 0, 'a retry means no perfect bonus');
  assert.equal(done.wallet.coins, coins0 + 2 + 9 * 4);
  // The set is over: answering again is refused.
  room.send('wh:answer', { qid: ask.qid, answer: 'x' });
  assert.equal((await nextMessage(room, 'wh:error')).reason, 'no question');
  room.send('main:leave', {});
  await sleep(150);
  const events = await server.store.listRobloxEvents({ username: 'Hana' });
  const hut = events.filter((e) => e.world === 'hut' && e.type === 'quiz');
  assert.equal(hut.length, 11, 'every answer recorded (10 questions + the miss)');
  const data = hut.map((e) => (typeof e.data === 'object' ? e.data : JSON.parse(e.data_json || e.data || '{}')));
  assert.ok(data.every((d) => d.source === 'web' && d.level === 'Medium'), JSON.stringify(data[0]));
  assert.equal(data.filter((d) => d.retry).length, 1, 'only the second try is a retry (same as the fishing records)');
  const session = events.find((e) => e.type === 'session' && e.world === 'main');
  assert.ok(!session || (typeof session.data === 'object' ? session.data : JSON.parse(session.data_json || '{}')).coinsEarned === 38, 'session carries what was earned');
  room.leave();
});

test('メインの島の つり場: 位置なしで釣れて、Pond と同じ単語', async () => {
  const { room } = await join('Kai');
  room.send('fw:open', { spot: 'main' });
  const st = await nextMessage(room, 'fw:state');
  assert.equal(st.zone, 1);
  room.send('fw:cast', { spot: 'main' });
  const ask = await nextMessage(room, 'fw:ask');
  assert.equal(ask.en, 'Pond');
  const word = ask.format.word || ask.format.left?.[0];
  assert.ok(FW.quiz['1'].some((q) => q.q === word), 'a pond word');
  room.send('fw:cancel', {});
  room.leave();
});
