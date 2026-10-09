// つり島 — 本物の部屋と本物のソケットで：小屋の戸口でしか出題されない、答えは部屋が判定する、
// 2回目も外すと魚は逃げる、正解 → タイミング → くじ → 図鑑のボーナスは部屋が払う、売る、
// 記録は Roblox と同じ形で roblox_events に入る。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { FW } = await import('../src/game/fishworld.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (name) => { const room = await new Client(url).joinOrCreate('class', { classCode: 'fw1', name }); const welcome = await nextMessage(room, 'welcome'); return { room, welcome }; };

before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

// The right answer, worked out from what the room sent and the bank it sent it from:
// the test knows the bank the way a child knows the words.
function solve(ask) {
  const f = ask.format;
  const pool = FW.quiz[String(ask.zone)];
  if (f.kind === 'mc') return pool.find((q) => q.q === f.word).a;
  if (f.kind === 'match') return f.left.map((en) => pool.find((q) => q.q === en).a);
  if (f.kind === 'spell') return pool.find((q) => q.a === f.ja && q.q.length === f.letters.length).q;
  if (f.kind === 'type') return pool.find((q) => q.a === f.ja && q.q.length === f.length).q;
  if (f.kind === 'listen') return f.word;
  throw new Error(`unexpected format ${f.kind}`);
}

test('つり島: 戸口でしか出題されない、部屋が判定する、2回目も外すと逃げる、正解 → くじ → 図鑑 → 売る', async () => {
  const { room, welcome } = await join('Umi');
  const coins0 = welcome.wallet.coins;
  const stand = async (spotId) => {
    const sp = FW.spotById.get(spotId);
    const x = FW.island.x + sp.x; const z = FW.island.z + sp.z;
    room.send('move', { s: FW.id, x, z, r: 0, a: 'idle', t: 1 });
    await waitFor(() => { const p = room.state.players.get(room.sessionId); return Math.abs(p.x - x) < 0.01 && p.space === FW.id; });
  };
  // Not at a hut: nothing opens, nothing is asked.
  room.send('fw:open', { spot: 'pond' });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'too far');
  room.send('fw:cast', { spot: 'sea' });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'too far');

  await stand('pond');
  room.send('fw:open', { spot: 'pond' });
  const st = await nextMessage(room, 'fw:state');
  assert.equal(st.zone, 1);
  assert.equal(st.counts[1].total, FW.fish.filter((f) => f.zone === 1 && f.kind !== 'trash').length);
  assert.ok(st.dex.every((d) => d.have === false), 'empty dex');
  assert.equal(JSON.stringify(st).includes('catchRates'), false, 'the odds never leave the room');

  // Cast: a question in one of the pond's formats, with no answer in it.
  room.send('fw:cast', { spot: 'pond' });
  const ask = await nextMessage(room, 'fw:ask');
  assert.ok(['mc', 'match'].includes(ask.format.kind), ask.format.kind);
  assert.equal(ask.attempt, 1);
  assert.equal(ask.en, 'Pond');
  if (ask.format.kind === 'match') assert.equal(ask.format.pairs, undefined);

  // Wrong twice: "one more time" with the same question, then the fish escapes.
  room.send('fw:answer', { qid: ask.qid, answer: 'ぜったい ちがう' });
  const r1 = await nextMessage(room, 'fw:result');
  assert.equal(r1.correct, false); assert.equal(r1.escaped, false); assert.equal(r1.format.attempt, 2); assert.equal(r1.format.kind, ask.format.kind);
  assert.ok(r1.reveal, 'mc / match show the right answer after the first miss');
  room.send('fw:answer', { qid: ask.qid, answer: 'ぜったい ちがう' });
  const r2 = await nextMessage(room, 'fw:result');
  assert.equal(r2.escaped, true);
  // Reeling without a bite is refused.
  room.send('fw:reel', { grade: 'perfect' });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'nothing on the line');

  // Cast again and answer right: the room knows the bank, so the test can too.
  room.send('fw:cast', { spot: 'pond' });
  const ask2 = await nextMessage(room, 'fw:ask');
  room.send('fw:answer', { qid: ask2.qid, answer: solve(ask2) });
  const ok = await nextMessage(room, 'fw:result');
  assert.equal(ok.correct, true);
  assert.ok(ok.xp > 0);
  // The lottery runs only on the room, only after a right answer, and never hands out trash.
  room.send('fw:reel', { grade: 'perfect' });
  const c = await nextMessage(room, 'fw:catch');
  assert.equal(c.grade, 'perfect');
  assert.notEqual(c.fish.kind, 'trash');
  assert.equal(c.fish.zone === 1 || c.fish.zone === 0, true);
  assert.equal(c.first, true);
  assert.equal(c.coins, FW.dexBonus, 'first catch pays the dex bonus');
  assert.equal(c.wallet.coins, coins0 + FW.dexBonus);
  assert.equal(c.counts[1].have, 1);
  assert.equal(c.bag.length, 1);
  // A second catch of the same fish is not "first" (so the bonus is paid once per species).
  // Selling: the room pays the price from the file, and the dex keeps the fish.
  room.send('fw:sell', { spot: 'pond', en: c.fish.en });
  const sold = await nextMessage(room, 'fw:sold');
  assert.equal(sold.coins, c.fish.sell);
  assert.equal(sold.wallet.coins, coins0 + FW.dexBonus + c.fish.sell);
  assert.equal(sold.bag.length, 0);
  assert.equal(sold.counts[1].have, 1, 'sold fish stay in the dex');
  room.send('fw:sell', { spot: 'pond', all: true });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'nothing to sell');

  // Records: every answer is a Roblox-shaped quiz event with world=fishing and source=web.
  const events = await server.store.listRobloxEvents({ username: 'Umi' });
  const quiz = events.filter((e) => e.type === 'quiz');
  assert.equal(quiz.length, 3);
  const data = quiz.map((e) => JSON.parse(e.data_json));
  assert.ok(quiz.every((e) => e.world === 'fishing' && e.class_code === 'fw1'));
  assert.deepEqual(data.map((d) => [d.correct, d.retry]), [[false, false], [false, true], [true, false]]);
  assert.ok(data.every((d) => d.source === 'web' && d.level === 'Fishing' && d.zone === 1 && ['mc', 'match'].includes(d.format) && typeof d.fast === 'boolean'));
  assert.equal(events.filter((e) => e.type === 'catch').length, 1);
  // Coins moved through the one choke point: the coin log has the dex bonus and the sale.
  const coinRows = server.store.data.coins.filter((r) => r[2] === 'Umi');
  assert.ok(coinRows.some((r) => String(r[4]).startsWith('fishdex_first:')));
  assert.ok(coinRows.some((r) => String(r[4]).startsWith('fish_sell:')));
  await room.leave(true);
});

test('つり島: ✕ でやめると魚は逃げる。うみの小屋は type / spell / mc', async () => {
  const { room } = await join('Sora');
  const sp = FW.spotById.get('sea');
  room.send('move', { s: FW.id, x: FW.island.x + sp.x, z: FW.island.z + sp.z, r: 0, a: 'idle', t: 1 });
  await waitFor(() => room.state.players.get(room.sessionId)?.space === FW.id);
  const kinds = new Set();
  for (let i = 0; i < 12; i += 1) {
    room.send('fw:cast', { spot: 'sea' });
    const ask = await nextMessage(room, 'fw:ask');
    kinds.add(ask.format.kind);
    assert.equal(ask.zone, 3);
    if (ask.format.kind === 'type') { assert.equal(ask.format.hint, undefined, 'no hint on the first try'); assert.equal(ask.format.word, undefined); }
    if (ask.format.kind === 'spell') assert.equal(ask.format.word, undefined);
  }
  assert.ok([...kinds].every((k) => ['type', 'spell', 'mc'].includes(k)), [...kinds].join());
  // The type hint shows up on the second try only.
  for (let i = 0; i < 30; i += 1) {
    room.send('fw:cast', { spot: 'sea' });
    const ask = await nextMessage(room, 'fw:ask');
    if (ask.format.kind !== 'type') continue;
    room.send('fw:answer', { qid: ask.qid, answer: 'zzzz' });
    const r = await nextMessage(room, 'fw:result');
    assert.equal(r.format.hint, solve(ask)[0]);
    assert.equal(r.reveal, undefined, 'type keeps the word for the second miss');
    break;
  }
  // ✕: the question is dropped; answering it afterwards is "no question".
  room.send('fw:cast', { spot: 'sea' });
  const ask = await nextMessage(room, 'fw:ask');
  room.send('fw:cancel', {});
  await sleep(50);
  room.send('fw:answer', { qid: ask.qid, answer: solve(ask) });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'no question');
  await room.leave(true);
});
