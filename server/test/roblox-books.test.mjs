// 絵本を Roblox へ：PNG に する・1 回だけ 上げる・つづきから・絵が かわったら 上げなおす・429 は 待つ・審査の けっか・鍵なしは 何も しない・
// Roblox 版に わたす 口（合言葉が いる・答えは 入らない・Open Cloud の 鍵は 出ない・記録は Web と 同じ 形）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const OC_KEY = 'oc-test-key-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
const WEB_KEY = 'web-key-0123456789abcdef0123456789abcdef';
process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.USPEAK_ROBLOX_KEY = WEB_KEY;

const R = await import('../src/game/reading.js');
const { BookAssets, moderationOf } = await import('../src/roblox/book-assets.js');
const { renderPng, pngSize, artHash, PNG_WIDTH, PNG_HEIGHT } = await import('../src/roblox/book-png.js');

// ---- にせの Open Cloud ------------------------------------------------------------------------
const fake = { posts: [], keys: new Set(), fail429: 0, moderation: () => 'MODERATION_STATE_APPROVED', opDone: true, nextId: 1000, ops: new Map(), assets: new Map(), reject401: false };
let fakeServer; let fakeUrl;
before(async () => {
  fakeServer = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    fake.keys.add(String(req.headers['x-api-key'] || ''));
    const send = (code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
    if (fake.reject401) { send(401, { message: 'Invalid API Key' }); return; }
    if (req.method === 'POST' && req.url === '/assets/v1/assets') {
      if (fake.fail429 > 0) { fake.fail429 -= 1; send(429, { message: 'Too many requests' }, { 'retry-after': '1' }); return; }
      const text = body.toString('latin1');
      const request = JSON.parse(/name="request"\r\n\r\n([\s\S]*?)\r\n--/.exec(text)[1]);
      const isPng = text.includes('Content-Type: image/png') && text.includes('\x89PNG');
      const id = String(fake.nextId += 1);
      fake.posts.push({ request, isPng, bytes: body.length, id });
      const asset = { path: `assets/${id}`, assetId: id, assetType: 'ASSET_TYPE_IMAGE', moderationResult: { moderationState: fake.moderation(fake.posts.length) } };
      fake.ops.set(`op${id}`, asset); fake.assets.set(id, asset);
      send(200, { path: `operations/op${id}`, done: false });
      return;
    }
    let m = /^\/assets\/v1\/operations\/(.+)$/.exec(req.url);
    if (req.method === 'GET' && m) { const a = fake.ops.get(m[1]); send(a ? 200 : 404, a ? (fake.opDone ? { path: `operations/${m[1]}`, done: true, response: a } : { path: `operations/${m[1]}`, done: false }) : {}); return; }
    m = /^\/assets\/v1\/assets\/(\d+)/.exec(req.url);
    if (req.method === 'GET' && m) { const a = fake.assets.get(m[1]); send(a ? 200 : 404, a || {}); return; }
    send(404, {});
  });
  await new Promise((r) => fakeServer.listen(0, '127.0.0.1', r));
  fakeUrl = `http://127.0.0.1:${fakeServer.address().port}`;
});
after(async () => { await new Promise((r) => fakeServer.close(r)); });

const twoBooks = () => new Map([...R.allBooks()].slice(0, 2));
const make = async (file, extra = {}) => new BookAssets(file, { apiKey: OC_KEY, groupId: '777', baseUrl: fakeUrl, perMin: 6000, wait: async () => {}, books: twoBooks, log: { warn() {}, info() {} }, ...extra }).init();
const tmp = () => path.join(os.tmpdir(), `rb-assets-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

test('絵は 1024×768 の PNG に なる（どの 本でも・からでは ない）', async () => {
  const books = [...R.allBooks().values()];
  for (const b of [books[0], books[40], books[119]]) for (const n of [0, 1, b.pages.length]) {
    const png = await renderPng(b, n);
    assert.deepEqual(pngSize(png), { width: PNG_WIDTH, height: PNG_HEIGHT }, `${b.id}/${n}`);
    assert.ok(png.length > 20_000 && png.length < 20 * 1024 * 1024, `${b.id}/${n} ${png.length}`);
  }
  assert.equal(await renderPng(books[0], 99), null);
  assert.equal(artHash(books[0], 1), artHash(books[0], 1));
  assert.notEqual(artHash(books[0], 1), artHash(books[0], 2));
});

test('鍵が ないと 何も しない（足りない 設定は 名前だけ）', async () => {
  const a = await new BookAssets(null, { baseUrl: fakeUrl, books: twoBooks }).init();
  assert.equal(a.enabled, false);
  assert.deepEqual(a.missing(), ['ROBLOX_OPEN_CLOUD_KEY', 'ROBLOX_CREATOR_USER_ID または ROBLOX_CREATOR_GROUP_ID']);
  const before = fake.posts.length;
  const r = await a.run({ limit: 5 });
  assert.equal(r.ok, false); assert.equal(fake.posts.length, before);
  assert.equal(a.imageFor([...twoBooks().keys()][0], 0), '');
});

test('1 回だけ 上げる・limit を まもる・つづきから・審査を 通った 絵だけ わたす', async () => {
  const file = tmp(); fake.posts.length = 0; fake.opDone = true; fake.moderation = () => 'MODERATION_STATE_APPROVED';
  const a = await make(file);
  const total = a.plan().length;
  assert.ok(total >= 14);
  const dry = await a.run({ limit: 3, dryRun: true });
  assert.equal(dry.wouldSend.length, 3); assert.equal(fake.posts.length, 0);
  assert.ok(dry.wouldSend.every((k) => k.endsWith('/0')) || dry.wouldSend.filter((k) => k.endsWith('/0')).length === 2, '表紙から');
  const r1 = await a.run({ limit: 5 });
  assert.equal(r1.ok, true); assert.equal(r1.sent, 5); assert.equal(fake.posts.length, 5);
  assert.ok(fake.posts.every((p) => p.isPng && p.request.assetType === 'Image' && p.request.creationContext.creator.groupId === '777' && p.request.displayName.length <= 50));
  assert.equal(r1.approved, 5);
  // 新しい 係（＝サーバーが 立ちあがりなおした）：ファイルから 読んで、のこりだけ おくる。
  const b = await make(file);
  const r2 = await b.run({ limit: 1000 });
  assert.equal(r2.sent, total - 5); assert.equal(fake.posts.length, total);
  const r3 = await (await make(file)).run({ limit: 1000 });
  assert.equal(r3.sent, 0); assert.equal(fake.posts.length, total, '2 回目は 何も おくらない');
  const id = [...twoBooks().keys()][0];
  assert.match(b.imageFor(id, 0), /^rbxassetid:\/\/\d+$/);
  assert.equal(new Set(fake.posts.map((p) => p.id)).size, total);
  // ファイルに 鍵は 入らない。
  assert.ok(!(await fs.readFile(file, 'utf8')).includes(OC_KEY));
  await fs.rm(file, { force: true });
});

test('絵が かわった 本だけ 上げなおす（古い 絵は わたさない）', async () => {
  const file = tmp(); fake.posts.length = 0;
  let version = 'v1';
  const hash = (b, n) => `${version}-${b.id}-${n}`;
  const changed = [...twoBooks().keys()][1];
  const a = await make(file, { hash: (b, n) => (b.id === changed ? hash(b, n) : `same-${b.id}-${n}`) });
  await a.run({ limit: 1000 });
  const total = fake.posts.length;
  version = 'v2';
  assert.equal(a.imageFor(changed, 0), '', 'かわった 絵は もう わたさない');
  assert.match(a.imageFor([...twoBooks().keys()][0], 0), /^rbxassetid/);
  const r = await a.run({ limit: 1000 });
  assert.equal(r.sent, twoBooks().get(changed).pages.length + 1);
  assert.equal(fake.posts.length, total + r.sent);
  await fs.rm(file, { force: true });
});

test('429 は 待って もう一度（同じ 絵を 2 回 かぞえない）・401 は 止まって わけを のこす（鍵は 出ない）', async () => {
  const file = tmp(); fake.posts.length = 0; fake.fail429 = 2;
  const waits = [];
  const a = await make(file, { wait: async (ms) => { waits.push(ms); } });
  const r = await a.run({ limit: 2 });
  assert.equal(r.sent, 2); assert.equal(fake.posts.length, 2);
  assert.ok(waits.filter((ms) => ms === 1000).length >= 2, 'Retry-After（1 秒）を まもる');
  fake.reject401 = true;
  const r2 = await a.run({ limit: 2 });
  fake.reject401 = false;
  assert.equal(r2.ok, false);
  assert.ok(/鍵/.test(r2.error) && !r2.error.includes(OC_KEY));
  assert.ok(!JSON.stringify(a.status()).includes(OC_KEY));
  // 401 で 落ちた 絵は「しっぱい」＝つぎに もう一度 おくる。
  const r3 = await a.run({ limit: 1 });
  assert.equal(r3.sent, 1);
  await fs.rm(file, { force: true });
});

test('審査：だめ（rejected）は 記録して 上げなおさない・審査中は あとで 見なおす・作業が まだの 絵は つぎに 見る', async () => {
  const file = tmp(); fake.posts.length = 0; fake.opDone = true;
  fake.moderation = (n) => (n === 1 ? 'MODERATION_STATE_REJECTED' : n === 2 ? 'MODERATION_STATE_REVIEWING' : 'MODERATION_STATE_APPROVED');
  const a = await make(file);
  const r = await a.run({ limit: 3 });
  assert.deepEqual([r.rejected, r.reviewing, r.approved], [1, 1, 1]);
  const keys = Object.keys(a.pictures);
  const rejected = keys.find((k) => a.pictures[k].state === 'rejected'); const reviewing = keys.find((k) => a.pictures[k].state === 'reviewing');
  assert.equal(a.imageFor(...rejected.split('/').map((v, i) => (i ? Number(v) : v))), '');
  assert.ok(!a.pending().some((p) => p.key === rejected), 'だめだった 絵は 上げなおさない');
  // 審査が おわった。
  fake.assets.get(a.pictures[reviewing].assetId).moderationResult.moderationState = 'MODERATION_STATE_APPROVED';
  const before = fake.posts.length;
  await a.run({ limit: 0 });
  assert.equal(a.pictures[reviewing].state, 'approved'); assert.equal(fake.posts.length, before);
  // 作業が まだ（done=false）の まま → working で のこり、つぎの run で けっかを もらう。
  fake.opDone = false; fake.moderation = () => 'MODERATION_STATE_APPROVED';
  await a.run({ limit: 1 });
  const working = Object.keys(a.pictures).find((k) => a.pictures[k].state === 'working');
  assert.ok(working);
  fake.opDone = true;
  const posts = fake.posts.length;
  await a.run({ limit: 0 });
  assert.equal(a.pictures[working].state, 'approved'); assert.equal(fake.posts.length, posts);
  assert.equal(moderationOf({ moderationResult: { moderationState: 'Approved' } }), 'approved');
  assert.equal(moderationOf({}), 'reviewing');
  await fs.rm(file, { force: true });
});

// ---- サーバーの 口 ------------------------------------------------------------------------------
const { startServer } = await import('../src/index.js');
let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });
const H = { 'x-uspeak-key': WEB_KEY, 'content-type': 'application/json' };

test('/api/roblox/books：合言葉が いる・一覧と 1 冊・答えは 入らない・絵は 審査を 通るまで 空', async () => {
  assert.equal((await fetch(`${base}/api/roblox/books`)).status, 401);
  assert.equal((await fetch(`${base}/api/roblox/books`, { headers: { 'x-uspeak-key': 'x'.repeat(40) } })).status, 401);
  const list = await (await fetch(`${base}/api/roblox/books?stage=A`, { headers: H })).json();
  assert.ok(list.ok && list.books.length >= 3 && list.books.every((b) => b.stage === 'A' && b.image === '' && b.ready === 0));
  assert.equal(list.stages.length, 12);
  const id = list.books[0].id;
  const res = await fetch(`${base}/api/roblox/books/${id}?username=Taro`, { headers: H });
  const text = await res.text(); const { book } = JSON.parse(text);
  const real = R.bookById(id);
  assert.equal(book.pages.length, real.pages.length);
  assert.ok(book.pages.every((p) => p.text && p.ja && p.image === ''));
  assert.equal(book.quiz.length, 5);
  assert.ok(!text.includes('"answer"') && book.quiz.every((q) => q.token && !('answer' in q) && q.choices.length === real.quiz[0].choices.length));
  assert.equal((await fetch(`${base}/api/roblox/books/rd-A-nope`, { headers: H })).status, 404);
  assert.equal((await fetch(`${base}/api/roblox/books/..%2f..`, { headers: H })).status, 404);
});

test('/api/roblox/books/check：判定は サーバー・記録は Web と 同じ 形・✓ は 8 割・コインは 1 冊 1 回', async () => {
  const id = [...R.allBooks().values()].find((b) => b.stage === 'B').id; const real = R.bookById(id);
  const play = async (username, wrong = 0) => {
    const { book } = await (await fetch(`${base}/api/roblox/books/${id}?username=${username}`, { headers: H })).json();
    let last = null;
    for (const [i, q] of book.quiz.entries()) {
      const answer = real.quiz.find((x) => x.q === q.q).answer;
      const choice = i < wrong ? q.choices.find((c) => c !== answer) : answer;
      const r = await fetch(`${base}/api/roblox/books/check`, { method: 'POST', headers: H, body: JSON.stringify({ token: q.token, choice, username, userId: '42', classCode: 'rb1', ms: 900, placeId: '99' }) });
      last = await r.json();
      assert.equal(last.correct, i >= wrong); assert.equal(last.answer, answer);
    }
    return { last, book };
  };
  const a = await play('TaroRB');
  assert.deepEqual([a.last.done, a.last.right, a.last.passed, a.last.firstDone, a.last.coins], [true, 5, true, true, R.BOOK_COINS]);
  // 同じ 答えを もう一度 おくっても 数えない。
  const again = await (await fetch(`${base}/api/roblox/books/check`, { method: 'POST', headers: H, body: JSON.stringify({ token: a.book.quiz[0].token, choice: 'x', username: 'TaroRB' }) })).json();
  assert.equal(again.n, 5); assert.equal(again.done, undefined);
  const b = await play('TaroRB');
  assert.deepEqual([b.last.passed, b.last.firstDone, b.last.coins], [true, false, 0], '2 回目は コインなし');
  const c = await play('JiroRB', 2);
  assert.deepEqual([c.last.right, c.last.passed, c.last.coins], [3, false, 0]);
  assert.equal((await fetch(`${base}/api/roblox/books/check`, { method: 'POST', headers: H, body: JSON.stringify({ token: 'bad.token', choice: 'x' }) })).status, 400);
  const events = await server.store.listRobloxEvents({ username: 'TaroRB' });
  const quiz = events.filter((e) => e.type === 'quiz' && e.world === 'reading');
  assert.equal(quiz.length, 10);
  const d = JSON.parse(quiz[0].data_json);
  assert.deepEqual([d.level, d.format, d.book, d.stage, d.grade, d.source], ['Reading', 'mc', id, 'B', R.gradeOfStage('B'), 'roblox']);
  assert.equal(events.filter((e) => e.type === 'book').length, 1);
  assert.equal(JSON.parse(events.find((e) => e.type === 'book').data_json).book, id);
});

test('/admin/roblox-books：運営だけ・鍵が ないと はじまらない・へんじに 鍵は 入らない', async () => {
  assert.equal((await fetch(`${base}/admin/api/roblox-books`)).status, 401);
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const st = await (await fetch(`${base}/admin/api/roblox-books`, { headers: { cookie } })).json();
  assert.equal(st.enabled, false); assert.equal(st.totals.books, R.allBooks().size); assert.ok(st.totals.total > 1000);
  assert.ok(st.missing.includes('ROBLOX_OPEN_CLOUD_KEY'));
  const page = await (await fetch(`${base}/admin/roblox-books`, { headers: { cookie } })).text();
  assert.ok(page.includes('Roblox に 絵本を 上げる') && !page.includes(WEB_KEY));
  assert.equal((await fetch(`${base}/admin/api/roblox-books`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"action":"start"}' })).status, 403);
  const start = await fetch(`${base}/admin/api/roblox-books`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' }, body: '{"action":"start"}' });
  assert.equal(start.status, 400);
});
