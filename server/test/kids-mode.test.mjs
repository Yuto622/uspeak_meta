// 幼児モード：クラスの 既定と 子どもごとの 上書き・welcome に のる・かえると 入ったままの 子に とどく・
// 先生は いつも ふつう・教室の 先生は じぶんの クラスだけ かえられる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'kids-'));
process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = dir;
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';
process.env.KIDS_MODE = 'on'; // 幼児モードは ふだん オフ（config.kidsMode）。この 検査は しくみが 生きて いる ことを 見る。

const { KidsStore } = await import('../src/classroom/kids-store.js');
const { Client } = await import('colyseus.js');
let server; let http; let ws; let admin = '';
const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const adminApi = (path, opts = {}) => fetch(`${http}/admin/api${path}`, { ...opts, headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json', ...(opts.headers || {}) } });
const teacherApi = (cookie, path, opts = {}) => fetch(`${http}/teacher/api${path}`, { ...opts, headers: { cookie, 'x-requested-with': 'uspeak-teacher', 'content-type': 'application/json', ...(opts.headers || {}) } });
const login = async (password) => cookieOf(await fetch(`${http}/teacher/login`, form(`password=${encodeURIComponent(password)}`)));
const put = (body) => ({ method: 'PUT', body: JSON.stringify(body) });
const nextMessage = (room, type, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});

before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  const port = server.server.address().port;
  http = `http://127.0.0.1:${port}`; ws = `ws://127.0.0.1:${port}`;
  admin = cookieOf(await fetch(`${http}/admin/login`, form('password=owner-password-123')));
  const r = await adminApi('/classrooms', { method: 'PUT', body: JSON.stringify({ rows: [{ name: 'さくら', classes: 'sakura', password: 'sakura-pass-1' }, { name: 'もみじ', classes: 'momiji', password: 'momiji-pass-1' }] }) });
  assert.equal(r.status, 200);
});
after(async () => { await server.shutdown('test'); });

test('きまり：クラスの 既定・子どもの 上書き（オン・オフ・クラスと おなじ）・版が 上がる', async () => {
  const s = await new KidsStore(null).init();
  assert.equal(s.isKids('a', 'Mio'), false);
  await s.setClass('A', true);
  assert.equal(s.isKids('a', 'Mio'), true, 'クラスコードは 大文字小文字を 区別しない');
  await s.setStudent('a', 'Mio', 'off');
  assert.equal(s.isKids('a', 'mio'), false); assert.equal(s.isKids('a', 'Ken'), true);
  await s.setClass('a', false); await s.setStudent('a', 'Ken', 'on');
  assert.equal(s.isKids('a', 'Ken'), true); assert.equal(s.isKids('a', 'Mio'), false);
  await s.setStudent('a', 'Ken', 'inherit');
  assert.equal(s.isKids('a', 'Ken'), false); assert.equal(s.modeOf('a', 'Ken'), 'inherit');
  assert.equal(await s.setStudent('a', 'Ken', 'maybe'), false);
  assert.equal(s.version, 5);
});

test('教室の 先生：じぶんの クラスだけ かえられる。ログインと ヘッダーが いる', async () => {
  const sakura = await login('sakura-pass-1');
  let r = await fetch(`${http}/teacher/api/kids`);
  assert.equal(r.status, 401);
  r = await teacherApi(sakura, '/kids');
  const d = await r.json();
  assert.deepEqual(d.classes.map((c) => c.code), ['sakura']);
  r = await teacherApi(sakura, '/kids', put({ classCode: 'momiji', on: true }));
  assert.equal(r.status, 403, 'よその 教室の クラスは かえられない');
  r = await teacherApi(sakura, '/kids', { ...put({ classCode: 'sakura', on: true }), headers: { 'x-requested-with': '' } });
  assert.equal(r.status, 403, 'ヘッダーの ない 書きこみは 通さない');
  r = await teacherApi(sakura, '/kids', put({ classCode: 'sakura', name: 'Mio', mode: 'banana' }));
  assert.equal(r.status, 400);
  const page = await fetch(`${http}/teacher/kids`, { headers: { cookie: sakura } });
  assert.equal(page.status, 200); assert.match(await page.text(), /幼児モード/);
  assert.equal((await fetch(`${http}/teacher/kids`, { redirect: 'manual' })).status, 303);
  assert.equal((await fetch(`${http}/admin/kids`, { headers: { cookie: admin } })).status, 200);
});

test('部屋：welcome に のる・かえると 入ったままの 子に とどく・先生は いつも ふつう', async () => {
  const sakura = await login('sakura-pass-1');
  const kid = await new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Mio' });
  const w = await nextMessage(kid, 'welcome');
  assert.equal(w.kids, false);
  const coins0 = w.wallet.coins;
  const teacher = await new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Sensei', teacherKey: 'testkey12345' });
  const tw = await nextMessage(teacher, 'welcome');
  assert.equal(tw.role, 'teacher'); assert.equal(tw.kids, false);
  let got = nextMessage(kid, 'kids');
  let teacherGot = false; teacher.onMessage('kids', () => { teacherGot = true; });
  let r = await teacherApi(sakura, '/kids', put({ classCode: 'sakura', on: true }));
  assert.equal(r.status, 200);
  assert.deepEqual(await got, { kids: true });
  // 子どもごとの 上書きで もどす
  got = nextMessage(kid, 'kids');
  r = await teacherApi(sakura, '/kids', put({ classCode: 'sakura', name: 'Mio', mode: 'off' }));
  assert.equal((await r.json()).mode, 'off');
  assert.deepEqual(await got, { kids: false });
  assert.equal(teacherGot, false, '先生には おくらない');
  // あとから 入る 子は welcome で うけとる
  const kid2 = await new Client(ws).joinOrCreate('class', { classCode: 'sakura', name: 'Ken' });
  const w2 = await nextMessage(kid2, 'welcome');
  assert.equal(w2.kids, true);
  assert.equal(w2.wallet.coins, coins0, 'コインは ふつうの モードと 同じ');
  // 運営は どの クラスも かえられる・ファイルに のこる
  r = await adminApi('/kids', put({ classCode: 'momiji', on: true }));
  assert.equal(r.status, 200);
  const saved = JSON.parse(readFileSync(pathJoin(dir, 'kids-mode.json'), 'utf8'));
  assert.equal(saved.classes.sakura.on, true); assert.equal(saved.classes.sakura.students.mio, 'off'); assert.equal(saved.classes.momiji.on, true);
  await Promise.all([kid.leave(), kid2.leave(), teacher.leave()]);
});
