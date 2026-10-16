// タスクの エンジン：左の「つぎに やること」。数えるのも はらうのも 部屋（ページは ならべるだけ）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';
process.env.TASKS = 'on';

const { parseCheck, blankTasks, readRules, plan, settle, view, onOp, onSpace, onAnswer, MAIN_SPOTS } = await import('../src/tasks/engine.js');
const { loadSeed } = await import('../src/tasks/store.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

test('しらべかたの 3 つの 形が 読める。読めない ものは null（その 行は 出さない）', () => {
  assert.deepEqual(parseCheck('near:fishing_pier'), { near: 'fishing_pier', n: 1 });
  assert.equal(parseCheck('near:nowhere'), null, 'a place that is not on the island');
  assert.deepEqual(parseCheck('$fish:3'), { stat: 'fish', n: 3 });
  assert.equal(parseCheck('$magic:3'), null);
  assert.deepEqual(parseCheck('a:wh:Medium:5'), { key: 'a:wh:Medium', n: 5 });
  assert.deepEqual(parseCheck('sell'), { key: 'sell', n: 1 });
  assert.equal(parseCheck(''), null);
  assert.equal(parseCheck('two words'), null);
});

test('seed の 100 行は ぜんぶ 読める しらべかたを 持つ', () => {
  const rows = loadSeed().onboarding;
  const bad = rows.filter((r) => !parseCheck(r.check)).map((r) => r.id);
  assert.deepEqual(bad, []);
  assert.equal(rows[0].check, 'near:fishing_pier');
  assert.ok(MAIN_SPOTS.has('fishing_pier'));
});

test('見えるのは 3 つ。すむと つぎが 見え、もう すんで いれば つづけて すむ。章を おえると 1 回だけ ごほうび', () => {
  const rows = [
    { id: 'A', chapter: '1 はじめ', ja: 'a', check: 'enter:main', coins: 5 },
    { id: 'B', chapter: '1 はじめ', ja: 'b', check: 'sell', coins: 5 },
    { id: 'C', chapter: '1 はじめ', ja: 'c', check: '$coins:100' },
    { id: 'D', chapter: '1 はじめ', ja: 'd', check: 'a:wh:2' },
    { id: 'E', chapter: '2 つぎ', ja: 'e', check: 'enter:pet' },
    { id: 'X', chapter: '2 つぎ', ja: 'x', check: 'nope:bad words' },
  ];
  const rules = readRules([{ key: 'visible', value: '3' }, { key: 'chapter_reward', value: '100' }, { key: 'endowed', value: 'TRUE' }]);
  const p = plan(rows, rules);
  assert.equal(p.list.length, 5, 'the unreadable row is skipped');
  assert.equal(p.chapters.length, 2);
  const prog = blankTasks();
  let v = view(prog, p, rules, { coins: 0 });
  assert.deepEqual(v.tasks.map((t) => t.id), ['A', 'B', 'C']);
  assert.equal(v.chapter.done, 1, 'the first step is given (endowed progress)');
  assert.equal(v.chapter.size, 5);
  assert.equal(v.framing, 'done');

  // D は まだ 見えないが、答えは 数えて おく。見えた とき すでに すんで いれば すぐ すむ。
  onAnswer(prog, { qid: 'wh:Easy:mc:apple', mode: 'wh-mc', correct: true });
  onAnswer(prog, { qid: 'wh:Easy:mc:dog', mode: 'wh-mc', correct: true });
  assert.deepEqual(settle(prog, p, rules, { coins: 0 }).finished, []);
  onSpace(prog, 'main');
  onOp(prog, { type: 'award', id: 'fish_sell:fish-3' });
  const out = settle(prog, p, rules, { coins: 0 });
  assert.deepEqual(out.finished.map((r) => r.id), ['A', 'B', 'D'], 'D shows up behind them and is already done');
  assert.deepEqual(out.chaptersDone, []);
  v = view(prog, p, rules, { coins: 40 });
  assert.deepEqual(v.tasks.map((t) => t.id), ['C', 'E']);
  assert.deepEqual([v.tasks[0].have, v.tasks[0].need], [40, 100]);
  assert.equal(v.framing, 'left', 'past half way it counts down');
  const two = settle(prog, p, rules, { coins: 120 });
  assert.deepEqual(two.finished.map((r) => r.id), ['C']);
  assert.deepEqual(two.chaptersDone, [0]);
  assert.deepEqual(settle(prog, p, rules, { coins: 120 }).chaptersDone, [], 'the chapter pays once');
  assert.equal(view(prog, p, rules, {}).chapter.n, 2);
});

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋: はいると 3 つ 届く。つりばに 近づくと 部屋が すませて コインを はらう。ページの 名前は 一覧の ものだけ', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'tasks1', name: 'Kai' });
  room.onMessage('*', () => {});
  const welcome = await nextMessage(room, 'welcome');
  assert.deepEqual(welcome.tasks.tasks.map((t) => t.id), ['S001', 'S002', 'S003']);
  assert.equal(welcome.tasks.tasks[0].ja, 'つりばに いってみよう');
  assert.equal(welcome.tasks.chapter.name, 'はじめの いっぽ');
  const coins = welcome.wallet.coins;

  const pier = MAIN_SPOTS.get('fishing_pier');
  const done = nextMessage(room, 'tasks:done');
  const next = new Promise((resolve) => { const off = room.onMessage('tasks:state', (m) => { if (m.done >= 1) { off(); resolve(m); } }); });
  room.send('move', { s: 'main', x: pier.wx, z: pier.wz + 2, r: 0, a: 'idle', t: 1 });
  const msg = await done;
  assert.deepEqual(msg.tasks.map((t) => t.id), ['S001']);
  assert.equal(msg.coins, 20);
  assert.equal(msg.wallet.coins, coins + 20, 'the room pays');
  const state = await next;
  assert.deepEqual(state.tasks.map((t) => t.id), ['S002', 'S003', 'S004']);

  // ページが 言える できごとは 一覧の ものだけ。
  room.send('task:ui', { name: 'coins' });
  room.send('task:ui', { name: 'fishdex' });
  await sleep(150);
  room.send('tasks:get');
  const again = await nextMessage(room, 'tasks:state');
  assert.equal(again.done, 1, 'fishdex is not on screen yet, so nothing else is done');
  await room.leave();
});

test('部屋: 先生には タスクを 出さない', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'tasks2', name: 'Sensei', teacherKey: 'testkey12345' });
  const welcome = await nextMessage(room, 'welcome');
  assert.equal(welcome.tasks, null);
  await room.leave();
});
