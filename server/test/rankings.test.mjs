// クラスの ランキング：いろいろな 指標で 順位。先生と 0 の 子は ならべない。保護者には その 子の 順位だけ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';

const { rankings, boardPayload, standingOf, classRankingHtml, METRICS } = await import('../src/game/rankings.js');
const { periodStats, periodRanks } = await import('../src/parent-report/aggregate.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

const rec = (name, o = {}) => ({ name, role: 'student', week_key: 7, week_xp: 0, level: 1, xp: 0, correct: 0, attempts: 0, ...o });

test('同じ 数は 同じ 順位、0 と 先生は ならばない、今週の XP は 今週の 子だけ', () => {
  const b = rankings([
    rec('Aki', { week_xp: 40, correct: 30, attempts: 40 }),
    rec('Bo', { week_xp: 40, correct: 10, attempts: 12 }),
    rec('Cy', { week_key: 6, week_xp: 99, correct: 50, attempts: 60 }),
    rec('Sensei', { role: 'teacher', correct: 999, attempts: 999 }),
    rec('Dan'),
  ], { weekKey: 7 });
  const by = Object.fromEntries(b.map((x) => [x.key, x]));
  assert.deepEqual(by.week_xp.rows.map((r) => [r.name, r.rank]), [['Aki', 1], ['Bo', 1]], 'last week does not count, ties share a rank');
  assert.deepEqual(by.correct.rows.map((r) => r.name), ['Cy', 'Aki', 'Bo'], 'the teacher and Dan (nothing yet) are not listed');
  assert.deepEqual(by.accuracy.rows.map((r) => r.name), ['Cy', 'Aki'], 'accuracy needs 20 answers');
  assert.ok(METRICS.length >= 20, 'many measures');
});

test('ラップは はやい ほうが 上。ゲームには 上の 10 人と じぶん、保護者には じぶんの 順位だけ', () => {
  const rows = Array.from({ length: 14 }, (_, i) => rec(`K${String(i).padStart(2, '0')}`, { lap_best: 40000 + i * 1000, correct: 100 - i, attempts: 120 }));
  const b = rankings(rows, { weekKey: 7 });
  const lap = b.find((x) => x.key === 'lap');
  assert.equal(lap.rows[0].name, 'K00');
  assert.equal(lap.rows[0].value, 40);
  const pay = boardPayload(b, 'K13').find((x) => x.key === 'correct');
  assert.equal(pay.top.length, 10);
  assert.deepEqual([pay.me.name, pay.me.rank, pay.of], ['K13', 14, 14], 'my row comes along even outside the top 10');
  const mine = standingOf(b, 'K02');
  assert.ok(mine.every((x) => !('rows' in x) && !('top' in x)), 'a parent never gets the other children');
  assert.ok(mine.find((x) => x.key === 'correct').rank === 3);
  assert.match(classRankingHtml(b), /🥇 K00/);
});

test('LINE の 週の 順位：その 期間の 数で ならべる', () => {
  const ev = (u, ts, extra = {}) => ({ id: `${u}${ts}${Math.random()}`, ts, type: 'quiz', username: u, data_json: JSON.stringify({ word: 'apple', correct: true, ...extra }) });
  const r = { start: 1000, end: 999999999 };
  const all = [
    { username: 'a', stats: periodStats([ev('a', 2000), ev('a', 3000)], r) },
    { username: 'b', stats: periodStats([ev('b', 2000)], r) },
    { username: 'c', stats: periodStats([], r) },
  ];
  const mine = periodRanks(all, 'b');
  assert.deepEqual(mine.find((x) => x.key === 'answers'), { key: 'answers', ja: 'こたえた 問題', unit: '問', value: 1, rank: 2, of: 2 });
  assert.deepEqual(periodRanks(all, 'c'), [], 'nothing yet, nothing shown');
});

let server; let url;
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋: ♛ で すべての 指標の ならびが とどく（前の 形も のこる）', async () => {
  await server.store.savePlayer({ ...rec('Mio', { correct: 12, attempts: 20, study_ms: 30 * 60000 }), class: 'rk1' });
  const room = await new Client(url).joinOrCreate('class', { classCode: 'rk1', name: 'Kai' });
  room.onMessage('*', () => {});
  await nextMessage(room, 'welcome');
  room.send('rank', {});
  const m = await nextMessage(room, 'rank');
  assert.ok(Array.isArray(m.top) && 'mine' in m, 'the old shape is still there');
  const correct = m.boards.find((b) => b.key === 'correct');
  assert.equal(correct.top[0].name, 'Mio', 'a child who is not online is ranked too');
  assert.equal(m.boards.find((b) => b.key === 'study_min').top[0].value, 30);
  await room.leave();
});
