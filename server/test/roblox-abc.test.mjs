// Roblox 版の「ABC と おと」：Web と 同じ きまり（abc.js）・答えは 先に 出ない・記録は Web の 子と 同じ 1 つ・判定した 答えは 記録に のる・
// Roblox に 出さない ことばは 上げない／問題に 使わない・絵が そろうまで はじめられない・絵カードは 絵本と 同じ 道具で 1 回だけ 上げる・口は 合言葉が いる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const WEB_KEY = 'web-key-0123456789abcdef0123456789abcdef';
const OC_KEY = 'oc-test-key-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.USPEAK_ROBLOX_KEY = WEB_KEY;

const abcGame = await import('../src/game/abc.js');
const { AbcStore } = await import('../src/abc/store.js');
const { createRobloxAbc } = await import('../src/roblox/abc-api.js');
const { ROBLOX_BLOCKED, robloxWords, abcBooks, abcBookId, abcPng, abcHash, withAbc } = await import('../src/roblox/abc-assets.js');
const { BookAssets } = await import('../src/roblox/book-assets.js');
const { pngSize } = await import('../src/roblox/book-png.js');
const { startServer } = await import('../src/index.js');

const blocked = new Set(Object.keys(ROBLOX_BLOCKED));
// ぜんぶの 絵が 審査を 通った ことに する にせの 道具。
const allApproved = { imageFor: (id) => (id.startsWith('abc-') && !blocked.has(id.slice(4)) ? `rbxassetid://${id.length}${id.charCodeAt(4)}` : '') };
const wordsIn = (q) => [q.word, q.kind === 'sound' ? q.say : '', ...(q.kind === 'picture' || q.kind === 'blend' ? q.choices || [] : []), ...(q.lines || []).map((l) => l.word)].filter(Boolean);
const seeded = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

test('ことばを しぼる（withWords）：外した ことばは 問題に 出ない・きまりの ならびは かわらない・Web は もとの まま', () => {
  const before = abcGame.units().map((u) => `${u.id}:${u.words.length}`).join(' ');
  const ids = abcGame.units().map((u) => u.id).join(' ');
  abcGame.withWords(blocked, () => {
    assert.equal(abcGame.units().map((u) => u.id).join(' '), ids, 'きまりの id は 同じ');
    for (const u of abcGame.units()) for (const w of u.words) assert.ok(!blocked.has(w.w), `${u.id}: ${w.w}`);
    for (const [l, v] of Object.entries(abcGame.data().letters)) { assert.ok(v.words.length >= 1, l); for (const w of v.words) assert.ok(!blocked.has(w.w), w.w); }
  });
  assert.equal(abcGame.units().map((u) => `${u.id}:${u.words.length}`).join(' '), before, 'おわったら もとに もどる');
  // 外すと 足りなく なる グループは もとの ことばが のこる（ならびを こわさない）。
  const sh = new Set(abcGame.data().digraphs.sh.map((x) => x.w));
  abcGame.withWords(sh, () => assert.equal(abcGame.units().find((u) => u.id === 'sh').words.length, sh.size));
  // 中で 例外が 出ても もとに もどる。
  assert.throws(() => abcGame.withWords(blocked, () => { throw new Error('x'); }));
  assert.equal(abcGame.units().map((u) => `${u.id}:${u.words.length}`).join(' '), before);
});

test('絵が そろうまで はじめられない・そろったら Web と 同じ 形の 問題（答えは 入らない・絵の 番号つき）', async () => {
  const none = createRobloxAbc({ assets: { imageFor: () => '' } });
  const st = none.state({ username: 'Mio', classCode: 'c1' });
  assert.equal(st.state.pictures.playable, false);
  assert.equal(st.state.pictures.total, robloxWords().length);
  assert.deepEqual(await none.start({ username: 'Mio', classCode: 'c1' }).then((r) => [r.ok, r.error]), [false, 'pictures']);

  const api = createRobloxAbc({ assets: allApproved, rng: seeded(7) });
  assert.equal(api.state({ username: 'Mio', classCode: 'c1' }).state.pictures.playable, true);
  const s = await api.start({ username: 'Mio', classCode: 'c1' });
  assert.ok(s.ok && s.sid && s.q);
  assert.equal(s.q.mode, 'place');
  const json = JSON.stringify(s);
  assert.ok(!json.includes('"answer"') && !json.includes('"key"') && !json.includes('"items"'), '答え・中の 記録は 出ない');
  for (const w of wordsIn(s.q)) assert.match(s.q.images[w], /^rbxassetid:\/\//, w);
  assert.deepEqual(await api.start({ username: '' }).then((r) => r.error), 'no user');
  assert.deepEqual(await api.answer({ sid: 'nope', choice: 'a' }).then((r) => r.error), 'no round');
  assert.deepEqual(await api.answer({ sid: s.sid, choice: 'a', username: 'Someone' }).then((r) => r.error), 'no round', 'ほかの 子の sid は 使えない');
});

test('記録は Web の 子と 同じ 1 つ・判定した 答えは quiz（source=roblox）、おわると abc の 行・8 割で つぎの もじへ', async () => {
  const abc = await new AbcStore(null).init();
  const events = [];
  const store = { appendRobloxEvents: (rows) => events.push(...rows) };
  // Roblox の 名前 MioRbx は Web の クラス sakura の「みお」。
  const childFor = (u) => (u === 'MioRbx' ? { class: 'sakura', name: 'みお' } : null);
  const api = createRobloxAbc({ abc, assets: allApproved, store, childFor, stageOf: async () => 'A', rng: seeded(11) });
  // はじめの 数問（もじ 4 問）。ぜんぶ まちがえる → もじの はじめから。
  let s = await api.start({ username: 'MioRbx', userId: '42', classCode: 'rbxclass' });
  let q = s.q; let last;
  while (q) { last = await api.answer({ sid: s.sid, choice: '?', placeId: '99', ms: 1200 }); assert.ok(last.ok); if (!last.teach) assert.equal(typeof last.answer, 'string'); q = last.next; }
  assert.equal(last.over, true);
  assert.equal(last.summary.mode, 'place');
  const web = abc.of('sakura', 'みお');
  assert.equal(web.placed, true, 'Web と 同じ 記録（クラス sakura・みお）に 入る');
  assert.equal(web.track, 'kinder');
  assert.equal(abc.peek('rbxclass', 'MioRbx'), null, 'Roblox の 名前の 別の 記録は 作らない');
  const quiz = events.filter((e) => e.type === 'quiz');
  assert.equal(quiz.length, 4);
  assert.ok(quiz.every((e) => e.source === 'roblox' && e.world === 'abc' && e.username === 'MioRbx' && e.user_id === '42' && e.place_id === '99'));
  const d = JSON.parse(quiz[0].data_json);
  assert.deepEqual([d.correct, d.level, d.source, typeof d.abc, typeof d.grade], [false, 'ABC', 'roblox', 'string', 'string']);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'id は かさならない');
  const sum = events.filter((e) => e.type === 'abc');
  assert.equal(sum.length, 1);
  assert.deepEqual(JSON.parse(sum[0].data_json).lettersTotal, 26);

  // つぎは もじ 1 つ（Web で つづきを しても 同じ 記録）。ただしく 答える → その もじが できた ことに なる。
  const first = abcGame.orderOf(abc.settingsOf('sakura'))[0];
  s = await api.start({ username: 'MioRbx', classCode: 'rbxclass' });
  assert.equal(s.q.kind, 'show'); assert.equal(s.q.letter, first);
  q = s.q; let judged = 0;
  while (q) {
    // 正解は サーバーの 中の 記録から（テストだけ：Roblox には 出ない）。ここでは「まちがい → 返って きた 正解」を 使わず、きまりから 出す。
    let body;
    if (q.teach) body = { seen: true };
    else if (q.kind === 'name') body = { choice: q.say.toLowerCase() };
    else if (q.kind === 'sound') body = { choice: q.end ? q.say.slice(-1) : q.say[0] };
    else body = { choice: q.choices.find((c) => (q.end ? c.endsWith(q.letter) : c[0] === q.letter)) };
    last = await api.answer({ sid: s.sid, ...body });
    if (!last.teach) { judged += 1; assert.equal(last.correct, true, `${q.kind} ${JSON.stringify(body)}`); }
    q = last.next;
  }
  assert.equal(judged, 5);
  assert.deepEqual(last.summary.advanced, { letter: first });
  assert.equal(abc.of('sakura', 'みお').letters[first].done, true);
  assert.equal(last.state.lettersDone, 1);
  // 学年の かわり：ロードマップの 段階が 高い 子は「つなげて よむ」から。
  const hi = createRobloxAbc({ assets: allApproved, stageOf: async () => '3', rng: seeded(5) });
  assert.equal((await hi.start({ username: 'Ken', classCode: 'c2' })).q.kind, 'blend');
});

test('Roblox に 出さない ことばは 何回 まわしても 問題に 出ない（もじ・きまり・ふくしゅう）', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const abc = await new AbcStore(null).init();
    const api = createRobloxAbc({ abc, assets: allApproved, rng: seeded(seed * 97) });
    for (let round = 0; round < 14; round += 1) {
      const s = await api.start({ username: 'Aoi', classCode: 'c3', review: round % 5 === 4 });
      if (!s.ok) continue;
      let q = s.q;
      while (q) {
        for (const w of wordsIn(q)) assert.ok(!blocked.has(w), `seed ${seed}: ${w} in ${q.kind}`);
        if (q.blocks) assert.ok(!blocked.has(q.word));
        const r = await api.answer({ sid: s.sid, ...(q.teach ? { seen: true } : q.blocks ? { order: q.blocks.map((b) => b.id) } : { choice: q.choices[0] }) });
        q = r.next;
      }
    }
  }
});

test('絵カード：出さない ことばは 上げる 一覧に ない・512×512 の PNG・絵本と 同じ 道具で 1 回だけ 上がり 1 行に まとまる', async () => {
  const books = abcBooks();
  assert.equal(books.size, robloxWords().length);
  for (const w of blocked) assert.ok(!books.has(abcBookId(w)), w);
  const cat = books.get('abc-cat');
  const png = await abcPng(cat);
  assert.deepEqual(pngSize(png), { width: 512, height: 512 });
  assert.ok(png.length > 3000);
  assert.match(abcHash(cat), /^[0-9a-f]{32}$/);
  assert.notEqual(abcHash(cat), abcHash(books.get('abc-dog')));

  // にせの Open Cloud。
  const posts = []; const ops = new Map(); let next = 500;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'POST' && req.url === '/assets/v1/assets') {
      const text = Buffer.concat(chunks).toString('latin1');
      const request = JSON.parse(/name="request"\r\n\r\n([\s\S]*?)\r\n--/.exec(text)[1]);
      const id = String(next += 1); posts.push(request);
      ops.set(`op${id}`, { path: `assets/${id}`, assetId: id, moderationResult: { moderationState: 'MODERATION_STATE_APPROVED' } });
      send(200, { path: `operations/op${id}`, done: false }); return;
    }
    const m = /^\/assets\/v1\/operations\/(.+)$/.exec(req.url);
    if (m && ops.has(m[1])) { send(200, { path: `operations/${m[1]}`, done: true, response: ops.get(m[1]) }); return; }
    send(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const three = () => new Map([...abcBooks()].filter(([k]) => ['abc-cat', 'abc-dog', 'abc-sun'].includes(k)));
    const assets = await new BookAssets(null, { apiKey: OC_KEY, userId: '1', baseUrl: `http://127.0.0.1:${server.address().port}`, perMin: 6000, wait: async () => {}, log: { warn() {}, info() {} },
      ...withAbc({ books: () => new Map(), render: async () => null, hash: () => '' }), books: three, render: (b) => abcPng(b), hash: (b) => abcHash(b) }).init();
    const r = await assets.run({ limit: 10 });
    assert.equal(r.ok, true); assert.equal(posts.length, 3);
    assert.ok(posts.every((p) => /^USpeak ABC (cat|dog|sun)$/.test(p.displayName) && p.creationContext.creator.userId === '1'));
    assert.match(assets.imageFor('abc-cat', 0), /^rbxassetid:\/\/\d+$/);
    await assets.run({ limit: 10 });
    assert.equal(posts.length, 3, '同じ 絵は 2 回 上げない');
    const rows = assets.summary().rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].group, 'abc'); assert.equal(rows[0].total, 3); assert.equal(rows[0].approved, 3);
    assert.equal(assets.summary().totals.books, 0, 'ABC は 本の 数に 入れない');
    // この 道具の 絵で あそべる（3 まいでは 足りない → pictures）。
    const api = createRobloxAbc({ assets });
    assert.equal((await api.start({ username: 'Mio' })).error, 'pictures');
  } finally { await new Promise((r) => server.close(r)); }
});

let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('/api/roblox/abc：合言葉が いる・絵が まだなら「じゅんびちゅう」・へんじに 鍵や 答えは 入らない', async () => {
  for (const [method, p] of [['GET', '/api/roblox/abc/state?username=Mio'], ['POST', '/api/roblox/abc/start'], ['POST', '/api/roblox/abc/answer']]) {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    assert.equal(r.status, 401, p);
  }
  const H = { 'content-type': 'application/json', 'x-uspeak-key': WEB_KEY };
  const st = await fetch(`${base}/api/roblox/abc/state?username=Mio&classCode=demo`, { headers: H });
  assert.equal(st.status, 200);
  const body = await st.json();
  assert.equal(body.state.lettersTotal, 26); assert.equal(body.state.pictures.playable, false);
  const text = JSON.stringify(body);
  assert.ok(!text.includes(WEB_KEY) && !text.includes('"answer"'));
  const start = await fetch(`${base}/api/roblox/abc/start`, { method: 'POST', headers: H, body: JSON.stringify({ username: 'Mio', classCode: 'demo' }) });
  assert.equal(start.status, 400);
  assert.equal((await start.json()).error, 'pictures');
  const ans = await fetch(`${base}/api/roblox/abc/answer`, { method: 'POST', headers: H, body: JSON.stringify({ sid: 'x', choice: 'a' }) });
  assert.equal((await ans.json()).error, 'no round');
});
