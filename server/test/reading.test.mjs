// よみもの島：本の 形・クイズの 正解が ページに 行かない・✓ と コインは 部屋が きめる（1 冊 1 回）・記録が ロードマップの 箱に のる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const R = await import('../src/game/reading.js');
const { STAGE_IDS } = await import('../src/game/roadmap.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

test('本だな：12 段階 ぜんぶに 3 冊ずつ・形が ただしい・正解の 位置が かたよらない', () => {
  const books = [...R.allBooks().values()];
  for (const b of books) assert.equal(R.problemOf(b), null, b.id);
  for (const id of STAGE_IDS) assert.ok(books.filter((b) => b.stage === id).length >= 3, `stage ${id}`);
  const pos = [0, 0, 0, 0]; for (const b of books) for (const q of b.quiz) pos[q.choices.indexOf(q.answer)] += 1;
  assert.ok(pos[0] / books.length / 5 < 0.5, `first choice is the answer too often: ${pos}`);
});

test('ページに 送る 本に クイズの 正解は 入らない', () => {
  const book = R.allBooks().values().next().value;
  const pub = R.publicBook(book, R.blankProgress());
  assert.equal(pub.quiz, undefined);
  assert.ok(!JSON.stringify(pub).includes('"answer"'));
  assert.equal(pub.pages.length, book.pages.length);
});

test('✓ は きく・よむ・クイズ 8 割。コインは 1 冊 1 回・1 日の 上限', () => {
  const book = R.allBooks().values().next().value; const p = R.blankProgress();
  const run = (right) => { const s = R.startQuiz(book, () => 0.3); for (const it of s.items) R.answerQuiz(s, right-- > 0 ? it.answer : '×'); return R.finishQuiz(p, book, s, { day: 'd1' }); };
  let r = run(5);
  assert.equal(r.passed, true); assert.equal(r.done, false, 'まだ きく・よむ が のこる'); assert.equal(r.coins, 0);
  R.markStep(p, book, 'listen'); R.markStep(p, book, 'read');
  const s = R.settle(p, book, { day: 'd1' });
  assert.equal(s.done, true); assert.equal(s.coins, R.BOOK_COINS);
  r = run(5); assert.equal(r.coins, 0, '2 回目は コインなし');
  assert.equal(R.starsOf(p.books[book.id]), 3, '音読を して いないので ★3');
  // 1 日の 上限
  const q = R.blankProgress(); q.day = 'd1'; q.dayCoins = R.DAILY_COIN_CAP;
  R.markStep(q, book, 'listen'); R.markStep(q, book, 'read');
  const s2 = R.startQuiz(book); for (const it of s2.items) R.answerQuiz(s2, it.answer);
  const capped = R.finishQuiz(q, book, s2, { day: 'd1' });
  assert.equal(capped.coins, 0); assert.equal(capped.capped, true);
  assert.equal(R.settle(q, book, { day: 'd2' }).coins, R.BOOK_COINS, 'つぎの 日に はらう');
});

test('音読：読めた 語の わりあい（順番どおり）と 1 分の 語数', () => {
  const book = R.allBooks().values().next().value;
  const all = R.judgeAloud(book, book.pages.map((p) => p.text), 60);
  assert.equal(all.acc, 1);
  const none = R.judgeAloud(book, [], 60);
  assert.equal(none.acc, 0);
  const half = R.judgeAloud(book, book.pages.map((p, i) => (i % 2 ? p.text : '')), 30);
  assert.ok(half.acc > 0.2 && half.acc < 0.8);
});

let server; let url;
const nextMessage = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋：本だな → 本 → きく・よむ → クイズ。正解は 答えた あとだけ・✓ で コイン 1 回・記録が のる', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'read1', name: 'Mio' });
  const welcome = await nextMessage(room, 'welcome');
  const coins0 = welcome.wallet.coins;
  room.send('read:shelf', {});
  const shelf = await nextMessage(room, 'read:shelf');
  assert.equal(shelf.stage, 'A', 'はじめての 子は ロードマップの はじめの 段階');
  assert.ok(shelf.rows[0].books.length >= 3);
  const id = shelf.rows[0].books[0].id;
  room.send('read:open', { id });
  const book = await nextMessage(room, 'read:book');
  assert.ok(book.pages.length >= 6 && !JSON.stringify(book).includes('"answer"'));
  // 棚に ない 本（ずっと 上の 段階）は ひらけない
  const far = [...R.allBooks().values()].find((b) => b.stage === '9');
  room.send('read:open', { id: far.id });
  assert.equal((await nextMessage(room, 'read:error')).reason, 'not on your shelf');
  room.send('read:step', { id, step: 'listen' }); await nextMessage(room, 'read:progress');
  room.send('read:step', { id, step: 'read' }); assert.equal((await nextMessage(room, 'read:progress')).done, false);
  room.send('read:quiz', { id });
  let q = await nextMessage(room, 'read:ask');
  assert.equal(q.answer, undefined, '正解は 来ない');
  const answers = Object.fromEntries(R.bookById(id).quiz.map((x) => [x.q, x.answer]));
  let last;
  for (let i = 0; i < 5; i += 1) {
    room.send('read:answer', { id, choice: answers[q.q] });
    last = await nextMessage(room, 'read:result');
    assert.equal(last.correct, true);
    q = last.next;
  }
  assert.equal(last.over, true); assert.equal(last.done.done, true); assert.equal(last.done.coins, R.BOOK_COINS);
  assert.equal(last.wallet.coins, coins0 + R.BOOK_COINS);
  // もう一度 やっても コインは ふえない
  room.send('read:quiz', { id }); q = await nextMessage(room, 'read:ask');
  for (let i = 0; i < 5; i += 1) { room.send('read:answer', { id, choice: answers[q.q] }); last = await nextMessage(room, 'read:result'); q = last.next; }
  assert.equal(last.done.coins, 0); assert.equal(last.wallet.coins, coins0 + R.BOOK_COINS);
  // ロードマップ・保護者レポートの 箱に world=reading の quiz が のる
  const events = (await server.store.listRobloxEvents?.({ classCode: 'read1' })) || server.store.robloxEvents || [];
  const mine = events.filter((e) => e.world === 'reading' && e.type === 'quiz');
  if (events.length) assert.ok(mine.length >= 5, `reading quiz events: ${mine.length}`);
  await room.leave();
});
