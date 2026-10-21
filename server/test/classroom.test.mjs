// 教室の パスワード（/admin/classrooms）と 英会話教室の 先生の 宿題の 画面（/teacher/homework）。
// パスワードで 教室が きまり、その 教室の クラスの 宿題だけ さわれる。ぜんぶ サーバーで 判定する。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'classroom-'));
process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = dir;
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';

const { ClassroomStore } = await import('../src/classroom/store.js');
let server; let http; let admin = '';
const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const adminApi = (path, opts = {}) => fetch(`${http}/admin/api${path}`, { ...opts, headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json', ...(opts.headers || {}) } });
const teacherApi = (cookie, path, opts = {}) => fetch(`${http}/teacher/api${path}`, { ...opts, headers: { cookie, 'x-requested-with': 'uspeak-teacher', 'content-type': 'application/json', ...(opts.headers || {}) } });
const login = async (password) => { const r = await fetch(`${http}/teacher/login`, form(`password=${encodeURIComponent(password)}`)); return { r, cookie: cookieOf(r) }; };

before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  http = `http://127.0.0.1:${server.server.address().port}`;
  admin = cookieOf(await fetch(`${http}/admin/login`, form('password=owner-password-123')));
});
after(async () => { await server.shutdown('test'); });

test('表の きまり：名前・クラス・パスワード（8 文字 以上・教室ごとに ちがう・1 クラスは 1 教室）', async () => {
  const s = new ClassroomStore(null, { secret: 'x'.repeat(20) });
  let r = await s.saveAll([{ name: 'A', classes: 'a1', password: 'short' }]);
  assert.equal(r.ok, false); assert.match(r.problems[0].reason, /8 文字/);
  r = await s.saveAll([{ name: 'A', classes: 'a1', password: 'samesame123' }, { name: 'B', classes: 'b1', password: 'samesame123' }]);
  assert.match(r.problems[0].reason, /同じ/);
  r = await s.saveAll([{ name: 'A', classes: 'a1', password: 'aaaaaaaa1' }, { name: 'B', classes: 'A1', password: 'bbbbbbbb1' }]);
  assert.match(r.problems[0].reason, /クラス「a1」/);
  r = await s.saveAll([{ name: 'A', classes: 'a1, a2', password: 'aaaaaaaa1' }, { name: '', classes: '', password: '' }]);
  assert.equal(r.ok, true); assert.equal(r.rooms.length, 1);
  assert.ok(!JSON.stringify(s.rooms).includes('aaaaaaaa1'), 'パスワードは そのまま のこさない');
  assert.equal(s.byPassword('aaaaaaaa1').name, 'A');
  assert.equal(s.byPassword('nope'), null);
  // 空の パスワードは 前の まま
  const id = s.rooms[0].id;
  r = await s.saveAll([{ id, name: 'A2', classes: 'a1', password: '' }]);
  assert.equal(r.ok, true); assert.equal(s.byPassword('aaaaaaaa1').name, 'A2');
});

test('パスワードで 入ると その 教室の クラスの 宿題だけ。クラスは 入れなくて いい', async () => {
  // 運営が 教室を 2 つ つくる
  let r = await adminApi('/classrooms', { method: 'PUT', body: JSON.stringify({ rows: [{ name: 'さくら英会話', classes: 'sakura', password: 'sakura-pass-1' }, { name: 'もみじ英会話', classes: 'momiji1, momiji2', password: 'momiji-pass-1' }] }) });
  assert.equal(r.status, 200);
  const listed = await (await adminApi('/classrooms')).json();
  assert.equal(listed.rooms.length, 2); assert.ok(!JSON.stringify(listed).includes('sakura-pass-1'));
  assert.ok(JSON.parse(readFileSync(pathJoin(dir, 'classrooms.json'), 'utf8')).rooms.every((x) => !JSON.stringify(x).includes('pass-1')));

  // ログイン
  assert.equal((await fetch(`${http}/teacher/homework`)).status, 200); // ログインの 画面
  const bad = await login('wrong-password');
  assert.match(bad.r.headers.get('location'), /bad/);
  const { cookie: sakura } = await login('sakura-pass-1');
  const { cookie: momiji } = await login('momiji-pass-1');
  assert.ok(sakura.startsWith('uspeak_teacher='));
  const pageHtml = await (await fetch(`${http}/teacher/homework`, { headers: { cookie: sakura } })).text();
  assert.match(pageHtml, /さくら英会話/);
  assert.match(pageHtml, /type="hidden" id="classes" value="sakura"/);
  assert.equal((await teacherApi('', '/homework')).status, 401);
  // 運営の 鍵で 先生の 口は ひらかない・先生の 鍵で 運営の 口も ひらかない
  assert.equal((await fetch(`${http}/teacher/api/homework`, { headers: { cookie: admin } })).status, 401);
  assert.equal((await fetch(`${http}/admin/api/homework`, { headers: { cookie: sakura } })).status, 401);

  // クラスを 書かずに 作る → その 教室の クラスに なる
  const items = [{ en: 'red', ja: 'あか' }, { en: 'blue', ja: 'あお' }];
  r = await teacherApi(sakura, '/homework', { method: 'POST', body: JSON.stringify({ title: 'Colors', items }) });
  const a = (await r.json()).assignment;
  assert.deepEqual(a.classes, ['sakura']);
  // よその クラスは 書けない
  r = await teacherApi(sakura, '/homework', { method: 'POST', body: JSON.stringify({ title: 'x', classes: 'momiji1', items }) });
  assert.equal(r.status, 403);
  // クラスが 2 つの 教室は どちらかを 書く（書かないと くばれない）
  r = await teacherApi(momiji, '/homework', { method: 'POST', body: JSON.stringify({ title: 'y', items }) });
  assert.equal(r.status, 400);
  r = await teacherApi(momiji, '/homework', { method: 'POST', body: JSON.stringify({ title: 'y', classes: 'momiji2', items }) });
  const b = (await r.json()).assignment;
  assert.deepEqual(b.classes, ['momiji2']);

  // 一覧は 自分の 教室の ものだけ
  const s1 = await (await teacherApi(sakura, '/homework')).json();
  assert.deepEqual(s1.classes, ['sakura']); assert.deepEqual(s1.items.map((x) => x.title), ['Colors']);
  // よその 宿題は くばれない・消せない・なおせない
  assert.equal((await teacherApi(sakura, `/homework/${b.id}/publish`, { method: 'POST', body: '{"on":true}' })).status, 403);
  assert.equal((await teacherApi(sakura, `/homework/${b.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await teacherApi(sakura, `/homework/${b.id}`, { method: 'PUT', body: JSON.stringify({ title: 'z', items }) })).status, 403);
  // 自分のは くばれる。書きこみは ヘッダーが いる
  assert.equal((await fetch(`${http}/teacher/api/homework/${a.id}/publish`, { method: 'POST', headers: { cookie: sakura, 'content-type': 'application/json' }, body: '{"on":true}' })).status, 403);
  r = await teacherApi(sakura, `/homework/${a.id}/publish`, { method: 'POST', body: '{"on":true}' });
  assert.equal((await r.json()).ok, true);
  assert.equal(server.homework?.get?.(a.id)?.status ?? 'published', 'published');

  // 運営には ぜんぶ 見える
  const all = await (await adminApi('/homework')).json();
  assert.ok(all.items.some((x) => x.id === a.id) && all.items.some((x) => x.id === b.id));

  // 運営が パスワードを かえると 前の ログインは 使えない
  const rooms = (await (await adminApi('/classrooms')).json()).rooms;
  const sk = rooms.find((x) => x.name === 'さくら英会話');
  r = await adminApi('/classrooms', { method: 'PUT', body: JSON.stringify({ rows: rooms.map((x) => ({ id: x.id, name: x.name, classes: x.classes.join(','), password: x.id === sk.id ? 'sakura-pass-2' : '' })) }) });
  assert.equal(r.status, 200);
  assert.equal((await teacherApi(sakura, '/homework')).status, 401);
  assert.equal((await teacherApi(momiji, '/homework')).status, 200, 'ほかの 教室は そのまま');
  assert.match((await login('sakura-pass-1')).r.headers.get('location'), /bad/);
  assert.equal((await teacherApi((await login('sakura-pass-2')).cookie, '/homework')).status, 200);
});
