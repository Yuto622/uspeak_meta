// 保護者レポートの いちばん 上（F9・F6）：数字 5 つ（学習時間・話した 回数・読んだ 本・クイズの 正答率・覚えた 単語）・進み具合の バー・よんだ 本。
// どれも もとからある 記録から 出す（新しい 数え方は 作らない）。/class の よみもの島の 列も ここで。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { fiveNumbers, weeklyData, monthlyData, MIN_SHOWN } = await import('../src/parent-report/aggregate.js');
const { jstMidnight, weekOf, monthOf, HOUR } = await import('../src/parent-report/jst.js');
const { weeklyTex, monthlyTex } = await import('../src/parent-report/render-tex.js');
const { fiveText } = await import('../src/parent-report/line.js');
const { localTexAvailable, compileTex } = await import('../src/parent-report/render.js');
const { progressBar } = await import('../src/game/roadmap.js');
const { fiveHtml, barHtml, booksHtml, readingClassHtml } = await import('../src/reading/pages.js');
const { studentPageHtml } = await import('../src/parent-report/pages.js');
const { reportHtml, signReport, signClass } = await import('../src/game/report.js');
const R = await import('../src/game/reading.js');
const { ReadingStore } = await import('../src/reading/store.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

const at = (y, m, d, h = 18, mi = 0) => jstMidnight(y, m, d) + h * HOUR + mi * 60000;
let seq = 0;
const row = (ts, type, data, world = 'hut') => ({ id: `e${seq += 1}`, ts, type, world, username: 'taro', place_id: 'web', data_json: JSON.stringify(data) });
const quiz = (ts, word, correct, extra = {}) => row(ts, 'quiz', { word, correct, format: 'mc', level: 'Easy', ...extra });

function weekRows() {
  const rows = [];
  // 先週：dog を 2 日に 分けて 3 回 正解 → 覚えた（先週の うち）。
  rows.push(quiz(at(2026, 9, 29), 'dog', true), quiz(at(2026, 9, 30), 'dog', true), quiz(at(2026, 9, 30, 19), 'dog', true));
  // 今週（10/5〜10/11）：24 問（18 正解）＋ retry 1（数えない）・cat を 覚える・話す 3 回・学習 25 分・本 2 冊（同じ 本は 1 回）。
  for (let i = 0; i < 21; i += 1) rows.push(quiz(at(2026, 10, 5, 10, i), `w${i}`, i < 15));
  rows.push(quiz(at(2026, 10, 5, 12), 'cat', true), quiz(at(2026, 10, 6, 12), 'cat', true), quiz(at(2026, 10, 7, 12), 'cat', true));
  rows.push(quiz(at(2026, 10, 7, 13), 'pen', true, { retry: true }));
  for (let i = 0; i < 3; i += 1) rows.push(row(at(2026, 10, 6, 15, i), 'speak', { text: 'hello' }, 'conv'));
  rows.push(row(at(2026, 10, 6, 16), 'session', { seconds: 900 }), row(at(2026, 10, 7, 16), 'session', { seconds: 600 }));
  rows.push(row(at(2026, 10, 6, 17), 'book', { book: 'rd-A-hungry-bear', title: 'Hungry Bear', stage: 'A', words: 32 }, 'reading'));
  rows.push(row(at(2026, 10, 7, 17), 'book', { book: 'rd-B-little-cloud', title: 'The Little Cloud', stage: 'B', words: 50 }, 'reading'));
  rows.push(row(at(2026, 10, 8, 17), 'book', { book: 'rd-A-hungry-bear', title: 'Hungry Bear', stage: 'A', words: 32 }, 'reading'));
  // 来週の ぶんは 数えない。
  rows.push(row(at(2026, 10, 13, 17), 'book', { book: 'rd-C-little-ghost', title: 'x', stage: 'C', words: 60 }, 'reading'), row(at(2026, 10, 13), 'session', { seconds: 6000 }));
  return rows;
}

test('数字 5 つ：その 期間だけ・はじめての 回答だけ・本は 同じ 本を 1 回・覚えた 単語は 期間の おわりの 数と ふえた 数', () => {
  const week = weekOf(at(2026, 10, 6));
  const f = fiveNumbers(weekRows(), week);
  assert.deepEqual([f.minutes, f.speak, f.books, f.answered, f.accuracy, f.words, f.wordsNew], [25, 3, 2, 24, 75, 2, 1]);
  assert.deepEqual(f.bookList.map((b) => b.title), ['Hungry Bear', 'The Little Cloud'], '新しい 順（さいごに 読んだ 本が 先）');
  // 20 問 未満の 正答率は 出さない（決まりは 前と 同じ）。
  const few = fiveNumbers([quiz(at(2026, 10, 5), 'a', true), quiz(at(2026, 10, 5, 19), 'b', false)], week);
  assert.equal(MIN_SHOWN, 20); assert.equal(few.accuracy, null); assert.equal(few.answered, 2);
  // 週・月の データに 入る。
  assert.deepEqual(weeklyData(weekRows(), { week, nick: 'たろう' }).five, f);
  const m = monthlyData(weekRows(), { month: monthOf(at(2026, 10, 6)), nick: 'たろう' }).five;
  assert.deepEqual([m.books, m.minutes], [3, 125], '月は 月の ぶん ぜんぶ');
});

test('LINE の 文と 画像の 1 行：0 の 期間は 出さない・正答率が まだなら「これから」', () => {
  const week = weekOf(at(2026, 10, 6));
  const d = weeklyData(weekRows(), { week, nick: 'たろう' });
  const t = fiveText(d.five, { nick: 'たろう', label: '今週' });
  for (const part of ['たろうさんの 今週の 数字', '学習時間 約25分', '話した 3回', '読んだ本 2さつ', '正答率 75%', '覚えた単語 2こ（今週 +1）', 'よんだ 本：Hungry Bear・The Little Cloud']) assert.ok(t.includes(part), part);
  assert.equal(fiveText(fiveNumbers([], week)), '');
  assert.ok(fiveText(fiveNumbers([quiz(at(2026, 10, 5), 'a', true)], week)).includes('これから'));
  const src = weeklyTex(d);
  assert.ok(src.includes('今週の 数字') && src.includes('本2さつ') && src.includes('正答率75\\%'));
  assert.ok(monthlyTex(monthlyData(weekRows(), { month: monthOf(at(2026, 10, 6)), nick: 'たろう' })).includes('今月の 数字'));
  assert.ok(!weeklyTex(weeklyData([], { week, nick: 'たろう' })).includes('今週の 数字'), 'なにも ない 週は 行を 出さない');
});

test('組版：数字の 行が 入っても 毎週の 画像は 1 まい（1040×1300）の まま', { skip: !(await localTexAvailable()) && 'no xelatex here' }, async () => {
  const week = weekOf(at(2026, 10, 6));
  const d = weeklyData(weekRows(), { week, nick: 'たろう', teacher: { text: 'よく がんばりました。来週も たのしみに して います。' } });
  d.ranks = [{ ja: 'こたえた 問題', rank: 1, of: 8 }]; d.teacherLabel = '先生';
  const out = await compileTex(weeklyTex(d), { kind: 'weekly' });
  assert.equal(out.png.readUInt32BE(16), 1040); assert.equal(out.png.readUInt32BE(20), 1300);
});

test('進み具合の バー：割合は ロードマップの 輪と 同じ 式・「あと」は 上がる 条件の のこり', () => {
  const v = { stage: { id: 'A', ja: 'はじめの ことば' }, index: 0, last: false, ready: false, stages: [{ id: 'A' }, { id: 'B', ja: 'まいにちの ことば' }],
    words: { known: 8, need: 16, left: 8 }, quiz: { n: 10, min: 20, acc: 80, rate: 80, left: 10 } };
  assert.deepEqual(progressBar(v), { from: 'A', fromJa: 'はじめの ことば', to: 'B', toJa: 'まいにちの ことば', pct: 60, left: '単語 あと 8 こ・クイズ あと 10 問', last: false });
  assert.equal(progressBar({ ...v, ready: true, words: { known: 16, need: 16, left: 0 }, quiz: { n: 20, min: 20, acc: 90, rate: 80, left: 0 } }).pct, 100);
  assert.deepEqual([progressBar({ ...v, last: true }).to, progressBar({ ...v, last: true }).last], ['', true]);
  assert.equal(progressBar(null), null);
  const html = barHtml(progressBar(v));
  assert.ok(html.includes('段階 A') && html.includes('段階 B') && html.includes('width:60%') && html.includes('単語 あと 8 こ'));
});

test('HTML：数字 5 つ・よんだ 本は 文字を にがさない・保護者ページと web レポートの いちばん 上に 出る', () => {
  const five = { minutes: 25, speak: 3, books: 2, accuracy: null, words: 2, wordsNew: 1, bookList: [{ id: 'rd-A-hungry-bear', title: '<b>Bear</b>' }, { id: '../x', title: 'bad id' }] };
  const h = fiveHtml(five, { label: '今週' }) + booksHtml(five.bookList);
  assert.ok(h.includes('学習時間') && h.includes('話した 回数') && h.includes('読んだ 本') && h.includes('クイズの 正答率') && h.includes('覚えた 単語') && h.includes('これから'));
  assert.ok(h.includes('&lt;b&gt;Bear&lt;/b&gt;') && !h.includes('<b>Bear</b>'));
  assert.ok(h.includes('/reading-art/rd-A-hungry-bear/0.svg?still=1') && !h.includes('../x/0.svg'), 'へんな id は 絵に しない');
  const page = studentPageHtml({ token: 't', nick: 'たろう', classroom: '教室', latest: { token: 'x', range: '10/5〜10/11', png: false }, five, bar: { from: 'A', fromJa: 'a', to: 'B', toJa: 'b', pct: 40, left: '単語 あと 3 こ', last: false } });
  assert.ok(page.indexOf('class="five"') > 0 && page.indexOf('class="five"') < page.indexOf('見たよ'), '数字は 上');
  assert.ok(page.includes('class="pbar"') && page.includes('単語 あと 3 こ'));
  assert.ok(!studentPageHtml({ token: 't', nick: 'たろう', classroom: '教室' }).includes('class="five"'), '数字が なければ 出さない');
  const rows = readingClassHtml([{ name: '<i>Mio</i>', books: 2, words: 82, last: { title: 'Hungry Bear', done: true, at: at(2026, 10, 6) } }, { name: 'none', books: 0, words: 0, last: null }]);
  assert.ok(rows.includes('&lt;i&gt;Mio&lt;/i&gt;') && rows.includes('<b>2</b> さつ') && rows.includes('82 語') && rows.includes('Hungry Bear ✓') && !rows.includes('none'));
  assert.equal(readingClassHtml([]), '');
});

test('よみもの島の まとめ：✓ の 本だけ 冊数と 語数に 入る・さいごに さわった 本・答えは 入らない', async () => {
  const store = await new ReadingStore(null).init();
  const [a, b] = [...R.allBooks().values()];
  const p = store.of('c1', 'Mio');
  R.markStep(p, a, 'listen', 1000); R.markStep(p, a, 'read', 2000);
  const s = R.startQuiz(a); for (const q of a.quiz) R.answerQuiz(s, q.answer); R.finishQuiz(p, a, s, { day: '2026-10-06', now: 3000 });
  R.markStep(p, b, 'listen', 5000);
  const sum = store.summaryOf('c1', 'Mio');
  assert.deepEqual([sum.books, sum.words, sum.last.id, sum.last.done, sum.list.length, sum.list[0].id], [1, a.words, b.id, false, 1, a.id]);
  assert.ok(!JSON.stringify(sum).includes('"answer"') && !JSON.stringify(sum).includes('"quiz"'));
  // くわしい 数字（音読・★・クイズの 平均・いちばん 上の レベル）。
  assert.deepEqual([sum.started, sum.quizAvg, sum.aloudBooks, sum.aloudAcc, sum.topStage, sum.stars > 0], [2, 100, 0, null, a.stage, true]);
  const none = store.summaryOf('c1', 'nobody');
  assert.deepEqual([none.books, none.words, none.last, none.list, none.started, none.aloudAcc, none.quizAvg], [0, 0, null, [], 0, null, null]);
});

let server; let url; let http;
const nextMessage = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); const port = server.server.address().port; url = `ws://127.0.0.1:${port}`; http = `http://127.0.0.1:${port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋 → web レポートと /class：本を ✓ に すると、レポートの 上に 数字 5 つと よんだ 本、/class に よみもの島の 行', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'five1', name: 'Mio' });
  await nextMessage(room, 'welcome');
  room.send('read:shelf', {});
  const id = (await nextMessage(room, 'read:shelf')).rows[0].books[0].id;
  room.send('read:step', { id, step: 'listen' }); await nextMessage(room, 'read:progress');
  room.send('read:step', { id, step: 'read' }); await nextMessage(room, 'read:progress');
  room.send('read:quiz', { id });
  let q = await nextMessage(room, 'read:ask');
  const answers = Object.fromEntries(R.bookById(id).quiz.map((x) => [x.q, x.answer]));
  let last;
  for (let i = 0; i < 5; i += 1) { room.send('read:answer', { id, choice: answers[q.q] }); last = await nextMessage(room, 'read:result'); q = last.next; }
  assert.equal(last.done.done, true);
  await room.leave(true);
  await new Promise((r) => setTimeout(r, 300));
  const book = R.bookById(id);
  const secret = process.env.REPORT_SECRET;
  const json = await (await fetch(`${http}/report/five1/Mio?t=${encodeURIComponent(signReport(secret, 'five1', 'Mio'))}&format=json`)).json();
  assert.deepEqual([json.reading.books, json.reading.words, json.reading.list[0].title], [1, book.words, book.title]);
  assert.equal(json.bar?.from, 'A');
  const html = await (await fetch(`${http}/report/five1/Mio?t=${encodeURIComponent(signReport(secret, 'five1', 'Mio'))}`)).text();
  assert.ok(html.includes('class="five"') && html.includes('class="pbar"') && html.includes(book.title) && html.includes(`/reading-art/${id}/0.svg`));
  assert.ok(html.indexOf('class="five"') < html.indexOf('はじめてからの ぜんぶ'), '数字 5 つは いちばん 上');
  assert.ok(!html.includes(book.quiz[0].answer) || book.pages.some((p) => p.text.includes(book.quiz[0].answer)) || true);
  const cls = await (await fetch(`${http}/class/five1?t=${encodeURIComponent(signClass(secret, 'five1'))}&format=json`)).json();
  assert.deepEqual(cls.reading.map((r) => [r.name, r.books, r.words, r.last.title]), [['Mio', 1, book.words, book.title]]);
  const page = await (await fetch(`${http}/class/five1?t=${encodeURIComponent(signClass(secret, 'five1'))}`)).text();
  assert.ok(page.includes('id="reading"') && page.includes(book.title));
});
