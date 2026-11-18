// えほんの 宿題（F10）：生徒を えらんで くばる・本が ✓ に なると おわり・棚の 外の 本も ひらける・先生の API（本の 一覧・クラスの 名前）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';
process.env.ADMIN_KEY = 'owner-password-123';

const R = await import('../src/game/reading.js');
const { HomeworkStore } = await import('../src/homework/store.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

const bookOf = (stage) => [...R.allBooks().values()].find((b) => b.stage === stage);
const WORDS = [{ kind: 'mc', en: 'apple', ja: 'りんご' }, { kind: 'mc', en: 'dog', ja: 'いぬ' }, { kind: 'mc', en: 'cat', ja: 'ねこ' }, { kind: 'mc', en: 'sun', ja: 'たいよう' }];

test('置き場：生徒を えらんだ 宿題は その 子にだけ・空なら クラス ぜんいん・えほんは 問題なしで くばれて ✓ で おわる', async () => {
  const hw = await new HomeworkStore(null).init();
  const book = bookOf('A');
  const all = (await hw.create({ title: 'ことば', classes: 'k1', items: WORDS })).assignment;
  const some = (await hw.create({ title: '📖 本', classes: 'k1', book: book.id, students: ['Mio', ' Ken '] })).assignment;
  assert.deepEqual([some.book, some.students, some.items.length], [book.id, ['Mio', 'Ken'], 0]);
  assert.equal((await hw.publish(all.id, true)).ok, true);
  assert.equal((await hw.publish(some.id, true)).ok, true, 'えほんは 問題が なくても くばれる');
  assert.deepEqual(hw.listFor('k1', 'Mio').map((h) => h.id).sort(), [all.id, some.id].sort());
  assert.deepEqual(hw.listFor('k1', 'mio').length, 2, '大文字小文字は 区別しない');
  assert.deepEqual(hw.listFor('k1', 'Yui').map((h) => h.id), [all.id], 'えらばれて いない 子には 出ない');
  assert.deepEqual(hw.listFor('k2', 'Mio'), [], 'ほかの クラスには 出ない');
  const row = hw.listFor('k1', 'Mio').find((h) => h.id === some.id);
  assert.deepEqual([row.book, row.bookTitle, row.total, row.done, row.kinds], [book.id, book.title, 1, false, ['book']]);
  assert.deepEqual(await hw.markBookDone('k1', 'Yui', book.id), [], 'えらばれて いない 子の ✓ は 数えない');
  assert.deepEqual(await hw.markBookDone('k1', 'Mio', book.id), [some.id]);
  assert.deepEqual(await hw.markBookDone('k1', 'Mio', book.id), [], '2 回目は なにも しない');
  const done = hw.listFor('k1', 'Mio').find((h) => h.id === some.id);
  assert.deepEqual([done.done, done.answered, done.score], [true, 1, 100]);
  // 期間の まとめ（LINE の 週・月）にも その 子の ぶんだけ のる。
  const period = { start: Date.now() - 86400e3, end: Date.now() + 86400e3 };
  assert.equal(hw.periodSummary('k1', 'Mio', period).total, 2);
  assert.equal(hw.periodSummary('k1', 'Yui', period).total, 1);
  // ない 本は 入らない（ふつうの 宿題として あつかい、問題が なければ くばれない）。
  const bad = (await hw.create({ title: 'x', classes: 'k1', book: 'rd-A-nope' })).assignment;
  assert.equal(bad.book, '');
  assert.equal((await hw.publish(bad.id, true)).ok, false);
  // 前からの 宿題（book・students の ない 行）は そのまま 動く。
  hw.assignments.push({ id: 'old1', title: 'old', classes: ['k1'], due: '', status: 'published', items: all.items, createdAt: 1, publishedAt: 1 });
  assert.ok(hw.listFor('k1', 'Yui').some((h) => h.id === 'old1'));
});

let server; let url; let http;
const nextMessage = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); const port = server.server.address().port; url = `ws://127.0.0.1:${port}`; http = `http://127.0.0.1:${port}`; });
after(async () => { await server.shutdown('test'); });

async function readToCheck(room, id) {
  room.send('read:step', { id, step: 'listen' }); await nextMessage(room, 'read:progress');
  room.send('read:step', { id, step: 'read' }); await nextMessage(room, 'read:progress');
  room.send('read:quiz', { id });
  let q = await nextMessage(room, 'read:ask');
  const answers = Object.fromEntries(R.bookById(id).quiz.map((x) => [x.q, x.answer]));
  let last;
  for (let i = 0; i < 5; i += 1) { room.send('read:answer', { id, choice: answers[q.q] }); last = await nextMessage(room, 'read:result'); q = last.next; }
  return last;
}

test('部屋：えほんの 宿題が 一覧に 出る → 棚の 外の 本でも ひらける → ✓ で おわり・ごほうび 1 回。えらばれて いない 子には 出ない', async () => {
  const hw = server.homework;
  const far = bookOf('9'); // はじめての 子（段階 A）の 棚には ない 本
  const a = (await hw.create({ title: `📖 ${far.title}`, classes: 'bk1', book: far.id, students: ['Mio'] })).assignment;
  await hw.publish(a.id, true);
  const mio = await new Client(url).joinOrCreate('class', { classCode: 'bk1', name: 'Mio' });
  const welcome = await nextMessage(mio, 'welcome');
  assert.equal(welcome.homework, 1, 'のこりの 宿題に 数える');
  const yui = await new Client(url).joinOrCreate('class', { classCode: 'bk1', name: 'Yui' });
  await nextMessage(yui, 'welcome');
  yui.send('hw:list', {});
  assert.deepEqual((await nextMessage(yui, 'hw:list')).items, [], 'えらばれて いない 子には 出ない');
  yui.send('hw:start', { aid: a.id });
  assert.equal((await nextMessage(yui, 'hw:error')).reason, 'no such homework');
  yui.send('read:open', { id: far.id });
  assert.equal((await nextMessage(yui, 'read:error')).reason, 'not on your shelf', '宿題に 出て いない 子は 棚の 外の 本を ひらけない');

  mio.send('hw:list', {});
  const list = (await nextMessage(mio, 'hw:list')).items;
  assert.deepEqual([list.length, list[0].book, list[0].done, list[0].bookTitle], [1, far.id, false, far.title]);
  assert.ok(!JSON.stringify(list).includes('"answer"'));
  mio.send('hw:start', { aid: a.id });
  assert.equal((await nextMessage(mio, 'hw:book')).id, far.id, 'えほんの 宿題は 本を ひらく 合図');
  mio.send('read:open', { id: far.id });
  assert.equal((await nextMessage(mio, 'read:book')).id, far.id, '宿題に 出た 本は 棚の 外でも ひらける');
  const last = await readToCheck(mio, far.id);
  assert.equal(last.done.done, true);
  const paidMsg = nextMessage(mio, 'wallet');
  mio.send('hw:list', {});
  const after1 = (await nextMessage(mio, 'hw:list')).items[0];
  assert.deepEqual([after1.done, after1.score], [true, 100]);
  const wallet = await paidMsg;
  assert.equal(wallet.reason, 'homework', '宿題の ごほうびは 1 回');
  assert.equal(hw.progressOf('bk1', 'Mio', a.id).paid, true);
  await mio.leave(); await yui.leave();
});

test('部屋：くばる 前に もう ✓ だった 本は、宿題の 一覧を ひらいた ときに「おわり」に なる', async () => {
  const hw = server.homework;
  const book = bookOf('A');
  const room = await new Client(url).joinOrCreate('class', { classCode: 'bk2', name: 'Ken' });
  await nextMessage(room, 'welcome');
  room.send('read:open', { id: book.id }); await nextMessage(room, 'read:book');
  await readToCheck(room, book.id);
  const a = (await hw.create({ title: '📖', classes: 'bk2', book: book.id })).assignment;
  await hw.publish(a.id, true);
  room.send('hw:list', {});
  const row = (await nextMessage(room, 'hw:list')).items.find((h) => h.id === a.id);
  assert.equal(row.done, true);
  await room.leave();
});

test('先生の API：本の 一覧に 答えは 入らない・クラスの 名前は その 教室の クラスだけ・ほかの 教室の クラスには くばれない', async () => {
  await server.store.saveRoster([{ class: 'tk1', name: 'Mio' }, { class: 'tk1', name: 'Ken' }, { class: 'tk1', name: 'Sensei', teacher: true, pin: 'abcd1234' }, { class: 'other', name: 'Aki' }]);
  const form = (body) => ({ method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const cookieOf = (r) => String(r.headers.get('set-cookie') || '').split(';')[0];
  const admin = cookieOf(await fetch(`${http}/admin/login`, form('password=owner-password-123')));
  const saved = await (await fetch(`${http}/admin/api/classrooms`, { method: 'PUT', headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ name: 'テスト教室', classes: 'tk1', password: 'book-pass-123' }] }) })).json();
  assert.equal(saved.ok, true);
  const cookie = cookieOf(await fetch(`${http}/teacher/login`, form('password=book-pass-123')));
  assert.ok(cookie.startsWith('uspeak_teacher='));
  const H = { cookie, 'x-requested-with': 'uspeak-teacher', 'content-type': 'application/json' };
  const books = await (await fetch(`${http}/teacher/api/homework/books`, { headers: H })).json();
  assert.ok(books.ok && books.stages.length === 12 && books.stages[0].books.length >= 3);
  assert.ok(!/"answer"|"quiz"/.test(JSON.stringify(books)));
  assert.match(books.stages[0].books[0].cover, /^\/reading-art\/rd-A-.*\/0\.svg\?v=\d+&still=1$/);
  const names = await (await fetch(`${http}/teacher/api/homework/students?class=tk1`, { headers: H })).json();
  assert.deepEqual(names.names, ['Ken', 'Mio'], '先生の 行は 出さない');
  assert.equal((await fetch(`${http}/teacher/api/homework/students?class=other`, { headers: H })).status, 403);
  const book = books.stages[0].books[0];
  const made = await (await fetch(`${http}/teacher/api/homework`, { method: 'POST', headers: H, body: JSON.stringify({ title: `📖 ${book.title}`, classes: 'tk1', book: book.id, students: ['Mio'] }) })).json();
  assert.equal(made.ok, true);
  const pub = await (await fetch(`${http}/teacher/api/homework/${made.assignment.id}/publish`, { method: 'POST', headers: H, body: JSON.stringify({ on: true }) })).json();
  assert.equal(pub.ok, true);
  assert.equal(server.homework.listFor('tk1', 'Mio').length, 1);
  assert.equal(server.homework.listFor('tk1', 'Ken').length, 0);
  assert.equal((await fetch(`${http}/teacher/api/homework`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'x', classes: 'other', book: book.id }) })).status, 403);
  const listed = await (await fetch(`${http}/teacher/api/homework`, { headers: H })).json();
  assert.equal(listed.items.find((x) => x.id === made.assignment.id).bookTitle, book.title);
  const page = await (await fetch(`${http}/teacher/homework`, { headers: { cookie } })).text();
  assert.ok(page.includes('id="tab-book"') && page.includes('id="bk-send"'));
});
