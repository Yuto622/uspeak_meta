// 合言葉なしの 絵本の 口（/api/public/books…）：答えが 入らない・こたえ合わせが できる・回数の 上限・ない 本は 404・絵は 審査を 通った ものだけ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.PUBLIC_BOOKS_PER_MIN = '12';

const R = await import('../src/game/reading.js');
const { createPublicBooks, mountPublicBooks } = await import('../src/roblox/books-public.js');
const { startServer } = await import('../src/index.js');

let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

const first = [...R.allBooks().values()][0];
const answers = (b) => b.quiz.map((q) => q.answer);

test('一覧と 1 冊：合言葉なしで 読める・答えも トークンも 入らない・少しの あいだ おぼえて よい', async () => {
  const list = await fetch(`${base}/api/public/books`);
  assert.equal(list.status, 200);
  assert.match(list.headers.get('cache-control'), /max-age=60/);
  const lj = await list.json();
  assert.equal(lj.books.length, R.allBooks().size);
  assert.ok(lj.stages.length >= 12);
  assert.ok(!/"answer"|"token"|"quiz"/.test(JSON.stringify(lj)));
  const a = await (await fetch(`${base}/api/public/books?stage=A`)).json();
  assert.ok(a.books.length > 0 && a.books.every((b) => b.stage === 'A'));

  const one = await fetch(`${base}/api/public/books/${first.id}`);
  assert.equal(one.status, 200);
  const text = await one.text(); const oj = JSON.parse(text);
  assert.ok(!/"answer"|"token"|"correct"/.test(text), '答えの キーが ある');
  assert.equal(oj.book.pages.length, first.pages.length);
  assert.equal(oj.book.quiz.length, first.quiz.length);
  for (const [i, q] of oj.book.quiz.entries()) {
    assert.deepEqual(Object.keys(q).sort(), ['choices', 'ja', 'n', 'q']);
    assert.deepEqual([...q.choices].sort(), [...first.quiz[i].choices].sort());
  }
  // 鍵が ない サーバーでは 絵は 1 まいも 出ない（審査を 通った ものだけ）。
  assert.equal(oj.book.cover, ''); assert.ok(oj.book.pages.every((p) => p.image === ''));
});

test('選択肢の ならびから 答えは わからない（毎回 まぜる）', () => {
  let n = 0; const rng = () => { n += 1; return (n * 0.37) % 1; };
  const pb = createPublicBooks({ rng });
  const firsts = new Set();
  for (let i = 0; i < 30; i += 1) firsts.add(pb.one(first.id).book.quiz[0].choices.indexOf(first.quiz[0].answer));
  assert.ok(firsts.size > 1, '正解が いつも 同じ 場所');
});

test('絵は 審査を 通った ものだけ（assets.imageFor の へんじを そのまま）', () => {
  const assets = { imageFor: (id, n) => (id === first.id && n === 1 ? 'rbxassetid://42' : '') };
  const pb = createPublicBooks({ assets });
  const b = pb.one(first.id).book;
  assert.equal(b.cover, ''); assert.equal(b.pages[0].image, 'rbxassetid://42'); assert.equal(b.pages[1].image, '');
  const row = pb.list().books.find((x) => x.id === first.id);
  assert.equal(row.image, ''); assert.equal(row.ready, 1);
});

test('こたえ合わせ：1 問ずつ・正解は こたえた あとに だけ・ない 本は 404・へんな 入力は 400', async () => {
  const post = (id, body) => fetch(`${base}/api/public/books/${id}/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await post(first.id, { n: 1, choice: answers(first)[0] });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ok.json(), { ok: true, correct: true, answer: answers(first)[0], n: 1, of: first.quiz.length });
  const wrong = first.quiz[0].choices.find((c) => c !== answers(first)[0]);
  const no = await (await post(first.id, { n: 1, choice: wrong })).json();
  assert.equal(no.correct, false); assert.equal(no.answer, answers(first)[0]);
  assert.equal((await post(first.id, { n: 99, choice: 'x' })).status, 400);
  assert.equal((await post(first.id, { n: 1 })).status, 400);
  assert.equal((await post('rd-nope-000', { n: 1, choice: 'x' })).status, 404);
  assert.equal((await fetch(`${base}/api/public/books/rd-nope-000`)).status, 404);
  assert.equal((await fetch(`${base}/api/public/books/..%2F..%2Fetc`)).status, 404);
});

test('回数の 上限：1 分に きまった 回数を こえると 429（読む 口と こたえる 口は べつに 数える）', async () => {
  const { rateLimit } = await import('../src/privacy.js');
  const app = express();
  mountPublicBooks(app, { express, readLimiter: rateLimit({ windowMs: 60_000, max: 3 }), checkLimiter: rateLimit({ windowMs: 60_000, max: 2 }) });
  const s = http.createServer(app); await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const u = `http://127.0.0.1:${s.address().port}`;
  try {
    const gets = []; for (let i = 0; i < 5; i += 1) gets.push((await fetch(`${u}/api/public/books/${first.id}`)).status);
    assert.deepEqual(gets, [200, 200, 200, 429, 429]);
    const posts = []; for (let i = 0; i < 4; i += 1) posts.push((await fetch(`${u}/api/public/books/${first.id}/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n: 1, choice: 'x' }) })).status);
    assert.deepEqual(posts, [200, 200, 429, 429]);
  } finally { await new Promise((r) => s.close(r)); }
  // 本番の つなぎ（index.js）でも 上限が きいて いる（この テストでは 1 分 12 回）。
  const seen = []; for (let i = 0; i < 16; i += 1) seen.push((await fetch(`${base}/api/public/books?stage=A`)).status);
  assert.ok(seen.includes(429) && seen[0] !== undefined, seen.join(','));
});
