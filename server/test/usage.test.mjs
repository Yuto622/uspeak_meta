// 使用履歴（/admin/usage）：部屋の tick → 日ごとの 箱、学習中と 接続の ちがい、場所の 分、保持期間、1 人ぶんの 削除、
// 管理画面の 口（ログイン・入力の 検査・CSV の 式の 守り）、部屋に 入ると 記録される こと。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'usage-'));
process.env.STORE_BACKEND = 'memory';
process.env.DATA_DIR = dir;
process.env.ADMIN_KEY = 'throwaway-usage-test-key';
process.env.LOG_LEVEL = 'error';
process.env.TASKS = 'off';
process.env.TEACHER_KEY = 'usage-teacher-key-1';
process.env.REPORT_SECRET = 'usage-test-report-secret-0123';
delete process.env.ACCESS_MODE;

const { UsageStore } = await import('../src/usage/store.js');
const { deviceOf, spaceKey, overview, studentRow, studentDetail, toCsv, csvCell, KEEP_DAYS } = await import('../src/usage/usage.js');
const { parseQuery } = await import('../src/usage/service.js');
const { eraseStudent, startRetention } = await import('../src/privacy.js');
const { FileStore } = await import('../src/store/FileStore.js');
const { seedUsage } = await import('./usage-seed.mjs');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

// 2026-11-25（水）10:00 JST
const T0 = Date.parse('2026-11-25T10:00:00+09:00');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('ticks become daily buckets: online vs active, minutes per space, logins and devices', async () => {
  const u = await new UsageStore(null).init();
  u.join('s1', 'demo', 'Aoi', { device: 'tablet', now: T0 });
  for (let i = 0; i < 120; i += 1) u.sample('s1', 'demo', 'Aoi', { active: true, space: 'willow', now: T0 + i * 1000 });
  for (let i = 120; i < 180; i += 1) u.sample('s1', 'demo', 'Aoi', { active: false, space: '', now: T0 + i * 1000 });
  for (let i = 180; i < 200; i += 1) u.sample('s1', 'demo', 'Aoi', { active: true, space: 'in:home.x9', now: T0 + i * 1000 });
  u.count('s1', { mode: 'quiz', correct: true, xp: 3 }, T0 + 5000);
  u.count('s1', { mode: 'quiz', correct: false }, T0 + 6000);
  u.count('s1', { mode: 'conv-free', correct: true }, T0 + 6500); // 会話は 正誤に 入れない
  u.count('s1', { ai: 1 }, T0); u.count('s1', { ch: 1 }, T0); u.count('s1', { buy: 1 }, T0); u.count('s1', { coin: 12 }, T0);
  u.end('s1', T0 + 200_000);
  const d = u.peek('demo', 'Aoi').d['2026-11-25'];
  assert.equal(d.on, 200);
  assert.equal(d.act, 140, 'only the seconds with something done count as active');
  assert.deepEqual(d.sp, { willow: 120, main: 60, 'in:home': 20 }, 'a home id is folded into one key');
  assert.equal(d.h['10'], 200);
  assert.equal(d.lg, 1); assert.deepEqual(d.dv, { tablet: 1 });
  assert.equal(d.r, 1); assert.equal(d.w, 1); assert.deepEqual(d.md.quiz, [1, 1]); assert.deepEqual(d.md['conv-free'], [1, 0]);
  assert.equal(d.xp, 3); assert.equal(d.ai, 1); assert.equal(d.ch, 1); assert.equal(d.buy, 1); assert.equal(d.coin, 12);
  assert.equal(d.f, T0); assert.ok(d.l >= T0 + 199_000);
  const [sess] = u.peek('demo', 'Aoi').s;
  assert.equal(sess.on, 200); assert.equal(sess.act, 140); assert.equal(sess.dv, 'tablet');
  assert.deepEqual(sess.p, ['willow', 'main', 'in:home']);
  // count without an open session (a teacher, or after leaving) is ignored
  assert.equal(u.count('s1', { ai: 1 }), false);
});

test('days are cut in Japan time, and a reconnect without join still opens a session', async () => {
  const u = await new UsageStore(null).init();
  const late = Date.parse('2026-11-25T23:59:30+09:00');
  for (let i = 0; i < 60; i += 1) u.sample('x', 'demo', 'Ben', { active: true, space: 'farm', now: late + i * 1000 });
  const st = u.peek('demo', 'Ben');
  assert.equal(st.d['2026-11-25'].on, 30); assert.equal(st.d['2026-11-26'].on, 30);
  assert.equal(st.d['2026-11-25'].h['23'], 30); assert.equal(st.d['2026-11-26'].h['0'], 30);
  assert.equal(st.d['2026-11-25'].lg, 0, 'not a login'); assert.equal(st.s.length, 1);
});

test('the space cap folds the 25th space into "other"; spaceKey and deviceOf are coarse', async () => {
  const u = await new UsageStore(null).init();
  for (let i = 0; i < 30; i += 1) u.sample('y', 'demo', 'Cho', { space: `isle${i}`, now: T0 + i * 1000 });
  const sp = u.peek('demo', 'Cho').d['2026-11-25'].sp;
  assert.equal(Object.keys(sp).length, 25); assert.equal(sp.other, 6);
  assert.equal(spaceKey(''), 'main'); assert.equal(spaceKey('in:home.abc'), 'in:home'); assert.equal(spaceKey('in:main:books'), 'in:main:books'); assert.equal(spaceKey('<script>'), 'script');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-T870) AppleWebKit Safari'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'phone');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'phone');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'pc');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh)', 'tablet'), 'tablet', 'the page hint wins (iPadOS says Macintosh)');
  assert.equal(deviceOf('', 'toaster'), 'pc');
});

test('overview: DAU, minutes, weekday x hour heatmap, devices, spaces', async () => {
  const u = await new UsageStore(null).init();
  u.join('a', 'demo', 'Aoi', { device: 'pc', now: T0 }); for (let i = 0; i < 600; i += 1) u.sample('a', 'demo', 'Aoi', { active: i < 300, space: 'willow', now: T0 + i * 1000 });
  u.join('b', 'demo', 'Ben', { device: 'phone', now: T0 }); for (let i = 0; i < 120; i += 1) u.sample('b', 'demo', 'Ben', { active: true, space: 'talk', now: T0 + i * 1000 });
  const yesterday = T0 - 86400000; u.join('c', 'demo', 'Aoi', { device: 'pc', now: yesterday }); for (let i = 0; i < 60; i += 1) u.sample('c', 'demo', 'Aoi', { active: true, now: yesterday + i * 1000 });
  const o = overview(u.list(), { days: 7, now: T0 + 3600e3 });
  assert.equal(o.series.length, 7); assert.equal(o.to, '2026-11-25');
  const today = o.series.at(-1); assert.equal(today.users, 2); assert.equal(today.onMin, 12); assert.equal(today.actMin, 7);
  assert.equal(o.series.at(-2).users, 1);
  assert.equal(o.kpi.users, 2);
  assert.equal(o.heat[3][10], 12, 'Wednesday 10:00 holds the 12 minutes'); // 0=日 … 3=水
  assert.deepEqual(o.devices.map((x) => x.logins), [2, 0, 1]);
  assert.equal(o.spaces[0].key, 'willow'); assert.equal(o.spaces[0].min, 10);
});

test('student rows and details; a child with only older records is estimated from months_json', async () => {
  const u = await new UsageStore(null).init();
  const now = Date.parse('2026-11-28T12:00:00+09:00');
  seedUsage(u, { classes: { demo: ['Aoi'] }, days: 60, now });
  const st = u.list()[0];
  const row = studentRow(st, { login_streak: 4, last_seen: '' }, { days: 30, now });
  assert.equal(row.name, 'Aoi'); assert.equal(row.spark.length, 30); assert.equal(row.streak, 4); assert.ok(row.onMin >= row.actMin);
  assert.ok(row.answers > 0 && row.accuracy >= 0 && row.accuracy <= 100);
  const det = studentDetail(st, null, { days: 90, now });
  assert.equal(det.calendar.length, 365); assert.equal(det.daily.length, 90);
  assert.ok(det.sessions.length > 0 && det.sessions[0].start >= det.sessions.at(-1).start, 'newest first');
  assert.equal(det.totals.onMin, det.daily.reduce((s, d) => s + d.onMin, 0));
  const legacy = studentRow(null, { class: 'demo', name: 'Old', months_json: JSON.stringify({ '2026-11': { answers: 10, correct: 7, days: ['2026-11-20', '2026-11-21'] } }) }, { days: 30, now });
  assert.equal(legacy.answers, 10); assert.equal(legacy.accuracy, 70); assert.equal(legacy.activeDays, 2); assert.equal(legacy.approx, true);
  const legacyDet = studentDetail(null, { months_json: JSON.stringify({ '2026-11': { seconds: 600, days: ['2026-11-20'] } }) }, { days: 30, now });
  assert.equal(legacyDet.calendar.find((c) => c.day === '2026-11-20').studied, true);
  assert.equal(legacyDet.months[0].min, 10);
});

test('retention: never more than 400 days, a shorter RETENTION_DAYS trims more, empty students go', async () => {
  let now = Date.parse('2026-11-28T12:00:00+09:00');
  const u = await new UsageStore(null, { now: () => now }).init({ autosave: false });
  const old = now - 450 * 86400000; const mid = now - 100 * 86400000;
  for (const [sid, name, t] of [['1', 'Old', old], ['2', 'Mid', mid], ['3', 'Mid', now]]) { u.join(sid, 'demo', name, { now: t }); u.sample(sid, 'demo', name, { now: t }); u.end(sid, t + 1000); }
  const n = u.trim({ now });
  assert.equal(n.students, 1, 'the child seen only 450 days ago is gone'); assert.equal(u.peek('demo', 'Old'), null);
  assert.equal(Object.keys(u.peek('demo', 'Mid').d).length, 2);
  const m = await u.prune({ maxAgeMs: 30 * 86400000, now });
  assert.equal(m.days, 1); assert.equal(Object.keys(u.peek('demo', 'Mid').d).length, 1); assert.equal(u.peek('demo', 'Mid').s.length, 1);
  // RETENTION_DAYS longer than 400 still keeps only 400
  u.join('4', 'demo', 'Far', { now: now - 401 * 86400000 }); u.sample('4', 'demo', 'Far', { now: now - 401 * 86400000 }); u.end('4');
  await u.prune({ maxAgeMs: 900 * 86400000, now }); assert.equal(u.peek('demo', 'Far'), null);
  assert.equal(KEEP_DAYS, 400);
  // startRetention passes usage along (store prune + usage prune)
  const store = new FileStore(null, { log: { info() {}, warn() {} } });
  const stop = startRetention({ store, usage: u, days: 10, log: { info() {}, warn() {} } });
  stop();
});

test('per-student erase removes the usage history (and only that child), file survives a reload', async () => {
  const file = pathJoin(dir, 'usage-erase.json');
  const u = await new UsageStore(file).init({ autosave: false });
  for (const name of ['Aoi', 'Ben']) { u.join(name, 'demo', name, { now: T0 }); for (let i = 0; i < 5; i += 1) u.sample(name, 'demo', name, { active: true, now: T0 + i * 1000 }); }
  await u.save();
  const again = await new UsageStore(file).init({ autosave: false });
  assert.equal(again.peek('demo', 'Aoi').d['2026-11-25'].on, 5, 'reloaded from disk');
  const store = new FileStore(null, { log: { info() {}, warn() {} } });
  const out = await eraseStudent({ store, usage: again, log: { info() {} } }, { classCode: 'demo', name: 'Aoi' });
  assert.equal(out.usage, 1);
  assert.equal(again.peek('demo', 'Aoi'), null); assert.ok(again.peek('demo', 'Ben'));
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /Aoi/); assert.match(text, /Ben/);
  // junk in the file does not crash the reader
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, JSON.stringify({ students: { 'demo|X': { d: { '2026-11-25': { on: 'lots', act: 99, sp: { '<b>': 3, ok: 4 }, h: { 25: 1, 3: 2 } }, bad: {} }, s: [{ a: 'x' }, { a: T0, b: T0 + 9000, on: 4, act: 9 }] }, nobar: {} } }));
  const junk = await new UsageStore(file).init({ autosave: false });
  const d = junk.peek('demo', 'X').d['2026-11-25'];
  assert.equal(d.on, 0); assert.equal(d.act, 0); assert.deepEqual(d.sp, { ok: 4 }); assert.deepEqual(d.h, { 3: 2 });
  assert.equal(junk.peek('demo', 'X').s.length, 1); assert.equal(junk.peek('demo', 'X').s[0].act, 4);
});

test('CSV cells cannot become formulas; query input is validated', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+1'), `"'+1"`); assert.equal(csvCell('-1'), `"'-1"`); assert.equal(csvCell('@a'), `"'@a"`);
  assert.equal(csvCell(-5), '-5', 'numbers stay numbers');
  assert.equal(csvCell('a,b'), '"a,b"');
  const csv = toCsv(['a', 'b'], [['=1+1', 2]]);
  assert.ok(csv.startsWith('\uFEFFa,b\r\n')); assert.match(csv, /^"'=1\+1",2$/m);
  assert.deepEqual(parseQuery({ days: '30', class: 'Demo-A', name: ' Aoi ', q: 'ao' }), { days: 30, cls: 'demo-a', name: 'Aoi', q: 'ao' });
  assert.equal(parseQuery({}).days, 30);
  assert.equal(parseQuery({ days: '31' }).error, 'days');
  assert.equal(parseQuery({ days: 'abc' }).error, 'days');
  assert.equal(parseQuery({ class: '../etc' }).error, 'class');
  assert.equal(parseQuery({ class: 'a'.repeat(25) }).error, 'class');
  assert.equal(parseQuery({ name: 'a|b' }).error, 'name');
  assert.equal(parseQuery({ name: 'x'.repeat(41) }).error, 'name');
  assert.equal(parseQuery({ class: 'demo' }, { needName: true }).error, 'name');
  assert.equal(parseQuery({ q: '\u0000' }).error, 'q');
});

// ---- サーバー（本物の 口・部屋） -------------------------------------------------------------
let server; let http; let ws; let cookie = '';
before(async () => {
  server = await startServer({ port: 0 });
  const port = server.server.address().port;
  http = `http://127.0.0.1:${port}`; ws = `ws://127.0.0.1:${port}`;
});
after(async () => { await server.shutdown('test'); });

const api = (path, opts = {}) => fetch(`${http}/admin/api${path}`, { headers: { ...(opts.auth === false ? {} : { cookie }) }, redirect: 'manual' });

test('the usage page and API need the admin login', async () => {
  const page = await fetch(`${http}/admin/usage`, { redirect: 'manual' });
  assert.equal(page.status, 303); assert.equal(page.headers.get('location'), '/admin');
  for (const p of ['/usage/overview', '/usage/class', '/usage/class.csv', '/usage/student?class=demo&name=Aoi']) {
    const r = await api(p, { auth: false });
    assert.equal(r.status, 401, p);
  }
  const bad = await fetch(`${http}/admin/login`, { method: 'POST', body: new URLSearchParams({ password: 'nope' }), redirect: 'manual' });
  assert.match(bad.headers.get('location'), /bad/);
  const ok = await fetch(`${http}/admin/login`, { method: 'POST', body: new URLSearchParams({ password: process.env.ADMIN_KEY }), redirect: 'manual' });
  cookie = (ok.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^uspeak_admin=/);
  const p2 = await fetch(`${http}/admin/usage`, { headers: { cookie } });
  assert.equal(p2.status, 200);
  assert.equal(p2.headers.get('cache-control'), 'no-store');
  assert.match(p2.headers.get('content-security-policy') || '', /default-src 'self'/);
  const html = await p2.text();
  assert.match(html, /使用履歴/); assert.doesNotMatch(html, /__API__|__HOME__/);
  assert.doesNotMatch(html, /<script[^>]+src=/, 'no external chart library');
  const top = await (await fetch(`${http}/admin`, { headers: { cookie } })).text();
  assert.match(top, /href="\/admin\/usage"/, 'linked from the admin top page');
});

test('endpoints validate input and serve seeded usage; CSV is formula-safe', async () => {
  const now = Date.now();
  seedUsage(server.usage, { store: server.store, classes: { 'demo-a': ['Aoi', 'Ben', '=Evil'], 'demo-b': ['Chika'] }, days: 40, now });
  for (const p of ['/usage/overview?days=12', '/usage/class?class=..%2F', '/usage/class?q=' + 'x'.repeat(50), '/usage/student?class=demo-a', '/usage/student?class=demo-a&name=a%7Cb', '/usage/class.csv?days=2']) {
    const r = await api(p); assert.equal(r.status, 400, p);
  }
  const o = await (await api('/usage/overview?days=30')).json();
  assert.equal(o.ok, true); assert.equal(o.series.length, 30); assert.ok(o.kpi.users >= 3); assert.equal(o.heat.length, 7);
  assert.ok(o.classes.includes('demo-a') && o.classes.includes('demo-b'));
  const oa = await (await api('/usage/overview?days=30&class=demo-b')).json();
  assert.ok(oa.kpi.users <= 1);
  const c = await (await api('/usage/class?days=30&class=demo-a')).json();
  assert.deepEqual(c.rows.map((r) => r.name).sort(), ['=Evil', 'Aoi', 'Ben']);
  const q = await (await api('/usage/class?days=30&q=ao')).json();
  assert.deepEqual(q.rows.map((r) => r.name), ['Aoi']);
  const csvRes = await api('/usage/class.csv?days=30&class=demo-a');
  assert.equal(csvRes.status, 200); assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  assert.match(csvRes.headers.get('content-disposition'), /attachment; filename="uspeak-usage-demo-a-30d-/);
  const csv = await csvRes.text();
  assert.match(csv, /"'=Evil"/); assert.doesNotMatch(csv, /(^|,)=Evil/m);
  const s = await (await api('/usage/student?days=90&class=demo-a&name=Aoi')).json();
  assert.equal(s.ok, true); assert.equal(s.name, 'Aoi'); assert.equal(s.calendar.length, 365); assert.equal(s.daily.length, 90);
  assert.ok(s.sessions.length > 0); assert.ok(s.months.length > 0); assert.equal(s.weeks.length, 12); assert.ok(s.profile.level > 0);
  const nf = await api('/usage/student?class=demo-a&name=Nobody'); assert.equal(nf.status, 404);
  const sc = await (await api('/usage/student.csv?days=7&class=demo-a&name=Aoi')).text();
  assert.match(sc, /^\uFEFF?日付,/); assert.equal(sc.trim().split('\r\n').length, 8);
  // the admin erase also removes usage
  const er = await fetch(`${http}/admin/api/erase`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' }, body: JSON.stringify({ classCode: 'demo-b', name: 'Chika' }) });
  assert.equal((await er.json()).usage, 1);
  assert.equal(server.usage.peek('demo-b', 'Chika'), null);
});

test('a child in a real room is recorded: login, device, seconds, and leaving closes the session', async () => {
  const room = await new Client(ws).joinOrCreate('class', { classCode: 'usage-room', name: 'Rin', device: 'phone' });
  await sleep(2600);
  const st = server.usage.peek('usage-room', 'Rin');
  assert.ok(st, 'the room writes usage');
  const day = Object.values(st.d)[0];
  assert.equal(day.lg, 1); assert.deepEqual(day.dv, { phone: 1 });
  assert.ok(day.on >= 2, `online seconds ${day.on}`);
  assert.ok(day.act >= 1, 'just joined counts as active (the same rule as tickStudy)');
  room.send('chat', { id: [...(await import('../src/phrases.js')).PHRASE_IDS][0] });
  await sleep(300);
  assert.equal(Object.values(server.usage.peek('usage-room', 'Rin').d)[0].ch, 1);
  await room.leave(true);
  await sleep(300);
  assert.equal(server.usage.open.size, 0, 'the session is closed');
  assert.equal(server.usage.peek('usage-room', 'Rin').s.length, 1);
  // a teacher is not recorded
  const t = await new Client(ws).joinOrCreate('class', { classCode: 'usage-room', name: 'Sensei', teacherKey: process.env.TEACHER_KEY });
  await sleep(1500);
  assert.equal(server.usage.peek('usage-room', 'Sensei'), null);
  await t.leave(true);
});

test('the classroom teacher sees only its own classes at /teacher/usage', async () => {
  const put = await fetch(`${http}/admin/api/classrooms`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' }, body: JSON.stringify({ rows: [{ name: 'Demo school', classes: 'demo-a', password: 'demo-teacher-pass-1' }] }) });
  assert.equal(put.status, 200);
  assert.equal((await fetch(`${http}/teacher/api/usage/class`)).status, 401, 'no login, no data');
  const login = await fetch(`${http}/teacher/login`, { method: 'POST', body: new URLSearchParams({ password: 'demo-teacher-pass-1' }), redirect: 'manual' });
  const tcookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(tcookie, /=/);
  const t = (p) => fetch(`${http}/teacher/api${p}`, { headers: { cookie: tcookie } });
  const page = await fetch(`${http}/teacher/usage`, { headers: { cookie: tcookie }, redirect: 'manual' });
  assert.equal(page.status, 200); assert.match(await page.text(), /\/teacher\/api/);
  const c = await (await t('/usage/class?days=30')).json();
  assert.ok(c.rows.length > 0); assert.ok(c.rows.every((r) => r.class === 'demo-a')); assert.deepEqual(c.classes, ['demo-a']);
  const o = await (await t('/usage/overview?days=30')).json(); assert.deepEqual(o.classes, ['demo-a']);
  assert.equal((await t('/usage/class?class=demo-b')).status, 404, 'another class is not visible');
  assert.equal((await t('/usage/student?class=demo-b&name=Fuka')).status, 404);
  assert.equal((await t('/usage/student?class=demo-a&name=Aoi')).status, 200);
  assert.equal((await t('/usage/overview?days=5')).status, 400);
  // the teacher cookie does not open the admin API
  assert.equal((await fetch(`${http}/admin/api/usage/class`, { headers: { cookie: tcookie } })).status, 401);
});
