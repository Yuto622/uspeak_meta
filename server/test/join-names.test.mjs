// なまえを えらんで 入る（クラスの QR）：はじめは オフ・先生が オンに した クラスだけ・署名が 合う ときだけ、
// その クラスの 子どもの なまえ だけ 返る（先生・停止・クラスなしの 行は 出ない）。ほかの クラスの 署名・レポートの 署名では 出ない。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = mkdtempSync(pathJoin(tmpdir(), 'join-'));
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';

const SECRET = process.env.REPORT_SECRET;
const { signJoin, verifyJoin, namesFor, joinPath } = await import('../src/classroom/join.js');
const { signClass, verifyClass, signReport, signExport } = await import('../src/game/report.js');
const { KidsStore } = await import('../src/classroom/kids-store.js');
const { Client } = await import('colyseus.js');
let server; let http; let ws; let admin = '';
const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const adminApi = (path, opts = {}) => fetch(`${http}/admin/api${path}`, { ...opts, headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json', ...(opts.headers || {}) } });
const teacherApi = (cookie, path, opts = {}) => fetch(`${http}/teacher/api${path}`, { ...opts, headers: { cookie, 'x-requested-with': 'uspeak-teacher', 'content-type': 'application/json', ...(opts.headers || {}) } });
const login = async (password) => cookieOf(await fetch(`${http}/teacher/login`, form(`password=${encodeURIComponent(password)}`)));
const put = (body) => ({ method: 'PUT', body: JSON.stringify(body) });
const names = (cls, k) => fetch(`${http}/api/join/names?class=${encodeURIComponent(cls)}&k=${encodeURIComponent(k)}`);

before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  const port = server.server.address().port;
  http = `http://127.0.0.1:${port}`; ws = `ws://127.0.0.1:${port}`;
  admin = cookieOf(await fetch(`${http}/admin/login`, form('password=owner-password-123')));
  let r = await adminApi('/classrooms', put({ rows: [{ name: 'さくら', classes: 'sakura', password: 'sakura-pass-1' }, { name: 'もみじ', classes: 'momiji', password: 'momiji-pass-1' }] }));
  assert.equal(r.status, 200);
  r = await adminApi('/roster', put({ rows: [
    { class: 'sakura', name: 'Mio' }, { class: 'Sakura', name: 'Ken' }, { class: 'sakura', name: 'Sensei', teacher: 'TRUE', pin: 'sensei-pin-1' },
    { class: 'sakura', name: 'Yame', stopped: 'TRUE' }, { class: '', name: 'Dare' }, { class: 'momiji', name: 'Aoi' },
  ] }));
  assert.equal(r.status, 200);
});
after(async () => { await server.shutdown('test'); });

test('きまり：署名は クラスごと・レポートの 署名とは べつ・なまえは その クラスの 子だけ', async () => {
  const k = signJoin(SECRET, 'sakura');
  assert.ok(verifyJoin(SECRET, 'sakura', k) && verifyJoin(SECRET, 'SAKURA', k), 'クラスコードは 大文字小文字を 区別しない');
  assert.equal(verifyJoin(SECRET, 'momiji', k), false);
  assert.equal(verifyJoin('', 'sakura', k), false);
  for (const other of [signClass(SECRET, 'sakura'), signExport(SECRET, 'sakura'), signReport(SECRET, 'sakura', 'Mio'), '', 'x.y']) assert.equal(verifyJoin(SECRET, 'sakura', other), false);
  assert.equal(verifyClass(SECRET, 'sakura', k), false, '入り口の 署名で 教室の ようすは ひらけない');
  assert.ok(joinPath(SECRET, 'sakura').startsWith('/?class=sakura&k='));
  const rows = [{ class: 'a', name: 'Mio' }, { class: 'A', name: 'mio' }, { class: 'a', name: 'T', teacher: true }, { class: 'a', name: 'S', stopped: true }, { class: '*', name: 'Any' }, { class: 'b', name: 'Other' }];
  assert.deepEqual(namesFor(rows, 'a'), ['Mio']);
  const s = await new KidsStore(null).init();
  assert.equal(s.pickOf('a'), false);
  await s.setPick('A', true); assert.equal(s.pickOf('a'), true); assert.equal(s.isKids('a', 'Mio'), false, '幼児モードとは べつの スイッチ');
  await s.setPick('a', false); assert.equal(s.pickOf('a'), false);
});

test('口：オフなら 何も 出ない・オンで 署名が 合えば なまえ だけ・ほかの 署名は 同じ 404', async () => {
  const k = signJoin(SECRET, 'sakura');
  let r = await names('sakura', k);
  assert.equal(r.status, 404, 'はじめは オフ');
  assert.deepEqual(await r.json(), { ok: false });

  // 教室の 先生が じぶんの クラスで オンに する（ほかの 教室の クラスは かえられない）。
  const sakura = await login('sakura-pass-1');
  assert.equal((await teacherApi(sakura, '/kids', put({ classCode: 'momiji', pick: true }))).status, 403);
  assert.equal((await teacherApi(sakura, '/kids', { ...put({ classCode: 'sakura', pick: true }), headers: { 'x-requested-with': 'nope' } })).status, 403);
  r = await teacherApi(sakura, '/kids', put({ classCode: 'sakura', pick: true }));
  assert.equal(r.status, 200);
  const set = await r.json();
  assert.equal(set.pick, true);
  assert.ok(set.join.startsWith('/?class=sakura&k='));
  assert.equal(set.on, false, '幼児モードは かわらない');

  r = await names('sakura', k);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
  const body = await r.json();
  assert.deepEqual(body, { ok: true, names: ['Mio', 'Ken'] }, 'なまえ だけ：先生・停止・クラスなしの 行・ほかの クラスは 出ない');
  // 先生の 画面の リンクで そのまま ひらける。
  const viaLink = new URL(http + set.join);
  assert.equal((await names(viaLink.searchParams.get('class'), viaLink.searchParams.get('k'))).status, 200);

  // ちがう 署名は ぜんぶ 同じ 404（クラスが あるか どうかも 分からない）。
  for (const [cls, token] of [['sakura', signJoin(SECRET, 'momiji')], ['momiji', k], ['sakura', signClass(SECRET, 'sakura')], ['sakura', ''], ['nope', signJoin(SECRET, 'nope')], ['sakura', `${k}x`]]) {
    const bad = await names(cls, token);
    assert.equal(bad.status, 404, `${cls} ${token.slice(0, 8)}`);
    assert.deepEqual(await bad.json(), { ok: false });
  }
  // もみじは オフの まま：正しい 署名でも 出ない。
  assert.equal((await names('momiji', signJoin(SECRET, 'momiji'))).status, 404);

  // 先生の 一覧：オンの クラスだけ リンクが 出る・QR は じぶんの クラスだけ。
  const list = (await (await teacherApi(sakura, '/kids')).json()).classes;
  assert.equal(list.length, 1);
  assert.equal(list[0].pick, true); assert.equal(list[0].pickCount, 2); assert.ok(list[0].join);
  let qr = await teacherApi(sakura, `/kids/qr?classCode=sakura&origin=${encodeURIComponent('https://example.test')}`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /image\/svg\+xml/);
  assert.ok((await qr.text()).includes('<svg'));
  qr = await teacherApi(sakura, `/kids/qr?classCode=momiji&origin=${encodeURIComponent('https://example.test')}`);
  assert.equal(qr.status, 404);
  assert.equal((await teacherApi(sakura, '/kids/qr?classCode=sakura&origin=javascript:alert(1)')).status, 404);
  assert.equal((await fetch(`${http}/teacher/api/kids/qr?classCode=sakura&origin=${encodeURIComponent('https://example.test')}`)).status, 401);

  // オフに もどすと すぐ 出なく なる。
  assert.equal((await teacherApi(sakura, '/kids', put({ classCode: 'sakura', pick: false }))).status, 200);
  assert.equal((await names('sakura', k)).status, 404);
  const off = (await (await teacherApi(sakura, '/kids')).json()).classes[0];
  assert.equal(off.pick, false); assert.equal(off.join, '');
});

test('一覧は 入力の かわり：入れるか どうかは いつもの 部屋が きめる（停止の 子・先生の 行は 入れない）', async () => {
  const room = await new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Mio' });
  const welcome = await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('no welcome')), 5000); room.onMessage('welcome', (m) => { clearTimeout(t); resolve(m); }); });
  assert.equal(welcome.role, 'student');
  await room.leave();
  await assert.rejects(() => new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Yame' }), 'とめた アカウントは 入れない');
  // 2026-11：先生パスワードは なくした。先生の 行は ユーザーネームだけで 先生として 入る（一覧には 先生の なまえを 出さない）。
  const sensei = await new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Sensei' });
  const sw = await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('no welcome')), 5000); sensei.onMessage('welcome', (m) => { clearTimeout(t); resolve(m); }); });
  assert.equal(sw.role, 'teacher');
  await sensei.leave();
});

// 教室 まとめての QR（2026-11）：教室の クラス ぜんぶの 子が 1 つの 一覧に・なまえごとに クラス・その クラスで 入れる。
test('教室 まとめての QR：クラスを またいで なまえが 出て、えらんだ 子の クラスで 入れる', async () => {
  const { signJoinRoom, verifyJoinRoom, joinRoomPath, entriesForRoom } = await import('../src/classroom/join.js');
  let r = await adminApi('/classrooms', put({ rows: [{ name: 'さくら', classes: 'sakura', password: 'sakura-pass-1' }, { name: 'もみじ', classes: 'momiji', password: 'momiji-pass-1' }, { name: 'IAC', classes: 'iac1, iac2', password: 'iac-pass-123' }] }));
  assert.equal(r.status, 200);
  r = await adminApi('/roster', put({ rows: [
    { class: 'sakura', name: 'Mio' }, { class: 'iac1', name: 'Hana' }, { class: 'iac2', name: 'Riku' }, { class: 'iac2', name: 'Hana' },
    { class: 'iac1', name: 'Sensei', teacher: 'TRUE', pin: 'sensei-pin-1' }, { class: 'momiji', name: 'Aoi' },
  ] }));
  assert.equal(r.status, 200);
  assert.deepEqual(entriesForRoom([{ class: 'b', name: 'X' }, { class: 'a', name: 'Y' }], ['a', 'b']).map((e) => e.name), ['Y', 'X'], 'クラスの 順');

  let d = await (await adminApi('/kids')).json();
  const room = d.rooms.find((x) => x.name === 'IAC');
  assert.ok(room && !room.pick && !room.join, 'はじめは オフ');
  const k = signJoinRoom(SECRET, room.id);
  assert.ok(verifyJoinRoom(SECRET, room.id, k));
  assert.equal(verifyJoinRoom(SECRET, room.id, signJoin(SECRET, 'iac1')), false, 'クラスの 署名では 教室は ひらかない');
  assert.equal(verifyJoin(SECRET, room.id, k), false);
  const byRoom = (id, key) => fetch(`${http}/api/join/names?room=${encodeURIComponent(id)}&k=${encodeURIComponent(key)}`);
  assert.equal((await byRoom(room.id, k)).status, 404, 'オフの あいだは 出ない');

  r = await adminApi('/kids', put({ room: room.id, pick: true }));
  const on = await r.json();
  assert.ok(on.ok && on.pick && on.join.startsWith(`/?room=${encodeURIComponent(room.id)}&k=`));
  assert.equal(joinRoomPath(SECRET, room.id).split('&k=')[0], on.join.split('&k=')[0]);
  const got = await (await byRoom(room.id, k)).json();
  assert.deepEqual(got.entries, [{ name: 'Hana', class: 'iac1' }, { name: 'Riku', class: 'iac2' }, { name: 'Hana', class: 'iac2' }], '先生・よその 教室の 子は 出ない・同じ なまえは クラスで 2 つ');
  assert.equal((await byRoom(room.id, 'bad')).status, 404);
  assert.equal((await byRoom('nope', k)).status, 404);
  const qr = await adminApi(`/kids/qr?room=${encodeURIComponent(room.id)}&origin=${encodeURIComponent(http)}`);
  assert.equal(qr.status, 200); assert.match(await qr.text(), /<svg/);

  // 教室の 先生は じぶんの 教室だけ。
  const momiji = await login('momiji-pass-1');
  const tm = await (await teacherApi(momiji, '/kids')).json();
  assert.deepEqual(tm.rooms.map((x) => x.name), ['もみじ']);
  assert.equal((await teacherApi(momiji, '/kids', put({ room: room.id, pick: false }))).status, 403);
  const iac = await login('iac-pass-123');
  const ti = await (await teacherApi(iac, '/kids')).json();
  assert.ok(ti.rooms[0].pick && ti.rooms[0].pickCount === 3);

  // えらんだ 子の クラス（iac2）で 入れる。
  const client = new Client(ws);
  const roomConn = await client.joinOrCreate('class', { name: 'Riku', classCode: 'iac2' });
  assert.ok(roomConn.sessionId);
  await roomConn.leave();

  // ホーム画面の アイコン：room と k も start_url に のこる。
  const m = await (await fetch(`${http}/manifest.webmanifest?room=${encodeURIComponent(room.id)}&k=${encodeURIComponent(k)}`)).json();
  assert.equal(m.start_url, `/?room=${encodeURIComponent(room.id)}&k=${encodeURIComponent(k)}`);
  assert.equal((await (await fetch(`${http}/manifest.webmanifest?k=x`)).json()).start_url, '/');

  r = await adminApi('/kids', put({ room: room.id, pick: false }));
  assert.equal((await r.json()).pick, false);
  assert.equal((await byRoom(room.id, k)).status, 404, 'オフに すると すぐ 止まる');
});
