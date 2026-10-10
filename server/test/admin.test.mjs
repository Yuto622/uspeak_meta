// 管理ページ: one password, a register the owner edits in a browser, a switch that turns
// the gate on and off — and every one of those judged on the server, over a real socket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'admin-'));
process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = dir;
delete process.env.ACCESS_MODE;            // the switch decides
process.env.TEACHER_KEY = 'testkey12345';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { parseDelimited, rosterFromText, decodeUpload, rosterToCsv } = await import('../src/store/roster-text.js');

let server; let url; let http; let cookie = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = (name, classCode = '6-1', extra = {}) => new Client(url).joinOrCreate('class', { classCode, name, ...extra });
const api = (path, { method = 'GET', body, type = 'application/json', auth = true, xrw = true } = {}) => fetch(`${http}/admin/api${path}`, {
  method,
  headers: { ...(auth ? { cookie } : {}), ...(xrw ? { 'x-requested-with': 'uspeak-admin' } : {}), ...(body !== undefined ? { 'content-type': type } : {}) },
  body: body === undefined ? undefined : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)),
  redirect: 'manual',
});

before(async () => {
  server = await startServer({ port: 0 });
  const addr = server.server.address();
  url = `ws://127.0.0.1:${addr.port}`;
  http = `http://127.0.0.1:${addr.port}`;
});
after(async () => { await server.shutdown('test'); });

test('CSV, TSV and a paste all become the same rows', () => {
  assert.deepEqual(parseDelimited('a,b\n"c,d","e ""q"""\r\n'), [['a', 'b'], ['c,d', 'e "q"']]);
  assert.deepEqual(parseDelimited('6-1\tAki\n6-1\tBen\n'), [['6-1', 'Aki'], ['6-1', 'Ben']]);
  assert.deepEqual(rosterFromText('﻿class,name,note\n6-1,Aki,\n,Sora,every\n'), [
    { class: '6-1', name: 'Aki', note: '' }, { class: '*', name: 'Sora', note: 'every' },
  ]);
  // Excel on Windows: Shift_JIS.
  const sjis = Buffer.from([0x83, 0x4e, 0x83, 0x89, 0x83, 0x58, 0x2c, 0x96, 0xbc, 0x91, 0x4f, 0x0a, 0x36, 0x2d, 0x31, 0x2c, 0x82, 0xa0, 0x82, 0xab, 0x0a]);
  assert.deepEqual(rosterFromText(decodeUpload(sjis)), [{ class: '6-1', name: 'あき', note: '' }]);
  // And the download (names only) reads back as every-class rows.
  const csv = rosterToCsv([{ class: '6-1', name: 'A, "B"', note: '' }, { class: '*', name: 'Sora', note: 'x' }]);
  assert.deepEqual(rosterFromText(csv), [{ class: '*', name: 'A, "B"', note: '' }, { class: '*', name: 'Sora', note: '' }]);
});

test('the page is behind the password, and the API behind the cookie', async () => {
  const page = await fetch(`${http}/admin`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /管理パスワード/, 'the login form, not the editor');
  assert.equal((await api('/roster', { auth: false })).status, 401);
  const wrong = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=nope', redirect: 'manual' });
  assert.equal(wrong.status, 303);
  assert.match(wrong.headers.get('location'), /bad/);
  assert.ok(!wrong.headers.get('set-cookie'), 'no cookie for a wrong password');
  const ok = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  assert.equal(ok.status, 303);
  const set = ok.headers.get('set-cookie');
  assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Strict/);
  cookie = set.split(';')[0];
  const editor = await fetch(`${http}/admin`, { headers: { cookie } });
  assert.match(await editor.text(), /名簿で制限する/, 'the editor');
  // A write without the page's own header is refused even with the cookie.
  assert.equal((await api('/roster', { method: 'PUT', body: { rows: [] }, xrw: false })).status, 403);
});

test('the switch is off by default, and the register is empty and editable', async () => {
  const r = await (await api('/roster')).json();
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'open');
  assert.equal(r.envModeSet, false);
  assert.equal(r.editable, true);
  assert.deepEqual(r.rows, []);
  // Anyone gets in while it is off.
  const a = await join('Anyone');
  await nextMessage(a, 'welcome');
  await a.leave(); await sleep(100);
});

test('a CSV is parsed on the server, saved from the page, and the door closes at once', async () => {
  const parsed = await (await api('/parse', { method: 'POST', body: '﻿クラス,名前,メモ\n6-1,Aki,\n6-1, aki ,dup\n6-2,Chika,\n,Sora,\n', type: 'application/octet-stream' })).json();
  assert.equal(parsed.rows.length, 4);
  const saved = await (await api('/roster', { method: 'PUT', body: { rows: parsed.rows } })).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.count, 3, 'the same name twice is one row');
  const onDisk = JSON.parse(readFileSync(pathJoin(dir, 'roster.json'), 'utf8'));
  assert.deepEqual(onDisk.rows.map((r) => r.name), ['Aki', 'Chika', 'Sora']);
  assert.ok(onDisk.rows.every((r) => r.class === '*'), 'a name on the list may enter any class');
  // Still open: the switch has not been turned on.
  const open = await join('Stranger'); await nextMessage(open, 'welcome'); await open.leave(); await sleep(100);
  const on = await (await api('/enforce', { method: 'PUT', body: { enforce: true } })).json();
  assert.equal(on.mode, 'roster');
  const aki = await join('aki'); assert.equal((await nextMessage(aki, 'welcome')).classCode, '6-1'); await aki.leave();
  const sora = await join('Sora', '6-2'); await nextMessage(sora, 'welcome'); await sora.leave();
  const chika = await join('Chika', '6-1'); await nextMessage(chika, 'welcome'); await chika.leave();
  await assert.rejects(() => join('Stranger'), /register|4004/i);
  const t = await join('Sensei', '6-1', { teacherKey: 'testkey12345' });
  assert.equal((await nextMessage(t, 'welcome')).role, 'teacher');
  await t.leave(); await sleep(100);
  // healthz says so, without a name.
  const h = await (await fetch(`${http}/healthz`)).json();
  assert.deepEqual(h.gate, { mode: 'roster', register: `file:${pathJoin(dir, 'store.json')}`, admin: true });
});

test('a save while the gate is on takes effect immediately, and the download is the register', async () => {
  const cur = await (await api('/roster')).json();
  const rows = cur.rows.concat([{ name: 'Ben' }]);
  await api('/roster', { method: 'PUT', body: { rows } });
  const ben = await join('Ben'); await nextMessage(ben, 'welcome'); await ben.leave();
  // Taking a name off closes the door for it, old record or not.
  await api('/roster', { method: 'PUT', body: { rows: rows.filter((r) => r.name !== 'Aki') } });
  await assert.rejects(() => join('Aki'), /register|4004/i);
  // Bytes, not text(): fetch's text() quietly strips the BOM Excel needs.
  const bytes = Buffer.from(await (await api('/roster.csv')).arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'a BOM for Excel');
  const csv = bytes.toString('utf8').slice(1);
  assert.ok(csv.startsWith('name,teacher\r\n'));
  assert.match(csv, /^Ben,FALSE$/m);
  assert.ok(!/Aki/.test(csv));
  // Off again: anyone, and the setting survives in its file.
  await api('/enforce', { method: 'PUT', body: { enforce: false } });
  const back = await join('Aki'); await nextMessage(back, 'welcome'); await back.leave(); await sleep(100);
  assert.equal(JSON.parse(readFileSync(pathJoin(dir, 'roster-settings.json'), 'utf8')).enforce, false);
});

test('the 先生か column: true makes a teacher without the key, in either gate mode, and round-trips', async () => {
  // A CSV with a teacher column (either language) is read on the server.
  const parsed = await (await api('/parse', { method: 'POST', body: 'name,先生か\nMs Sato,true\nKen,false\nYumi,\n', type: 'text/plain' })).json();
  assert.deepEqual(parsed.rows, [{ name: 'Ms Sato', teacher: true }, { name: 'Ken', teacher: false }, { name: 'Yumi', teacher: false }]);
  const saved = await (await api('/roster', { method: 'PUT', body: { rows: parsed.rows } })).json();
  assert.ok(saved.ok);
  assert.deepEqual(saved.rows, [{ name: 'Ms Sato', teacher: true }, { name: 'Ken', teacher: false }, { name: 'Yumi', teacher: false }]);
  assert.deepEqual((await (await api('/roster')).json()).rows.find((r) => r.name === 'Ms Sato'), { name: 'Ms Sato', teacher: true });
  const csv = Buffer.from(await (await api('/roster.csv')).arrayBuffer()).toString('utf8');
  assert.match(csv, /^Ms Sato,TRUE$/m);
  assert.match(csv, /^Ken,FALSE$/m);
  // Gate open (the default): the teacher row still decides the role.
  const t = await join('ms sato'); assert.equal((await nextMessage(t, 'welcome')).role, 'teacher'); await t.leave(); await sleep(100);
  const k = await join('Ken'); assert.equal((await nextMessage(k, 'welcome')).role, 'student'); await k.leave(); await sleep(100);
  // Gate on: same.
  await api('/enforce', { method: 'PUT', body: { enforce: true } });
  const t2 = await join('Ms Sato'); assert.equal((await nextMessage(t2, 'welcome')).role, 'teacher'); await t2.leave(); await sleep(100);
  // Unticked again: back to a student at the next join.
  await api('/roster', { method: 'PUT', body: { rows: [{ name: 'Ms Sato', teacher: false }, { name: 'Ken', teacher: false }] } });
  const t3 = await join('Ms Sato'); assert.equal((await nextMessage(t3, 'welcome')).role, 'student'); await t3.leave(); await sleep(100);
  await api('/enforce', { method: 'PUT', body: { enforce: false } });
});

test('先生か false: a teacher who is already in the room becomes a student at once (no rejoin needed)', async () => {
  await api('/roster', { method: 'PUT', body: { rows: [{ name: 'Ms Kato', teacher: true }, { name: 'Ken', teacher: false }] } });
  const t = await join('Ms Kato', '6-2');
  assert.equal((await nextMessage(t, 'welcome')).role, 'teacher');
  const roleP = nextMessage(t, 'role', 4000);
  await api('/roster', { method: 'PUT', body: { rows: [{ name: 'Ms Kato', teacher: false }, { name: 'Ken', teacher: false }] } });
  assert.equal((await roleP).role, 'student');
  // The room agrees: a class-mode command from her is ignored now.
  t.send('class:freeze', { on: true });
  await sleep(400);
  assert.equal([...t.state.players.values()].find((p) => p.name === 'Ms Kato')?.role, 'student');
  // …and true again gives it back.
  const backP = nextMessage(t, 'role', 4000);
  await api('/roster', { method: 'PUT', body: { rows: [{ name: 'Ms Kato', teacher: true }] } });
  assert.equal((await backP).role, 'teacher');
  await t.leave(); await sleep(100);
  // A key teacher keeps the role whatever the register says.
  const k = await join('Ms Kato', '6-3', { teacherKey: 'testkey12345' });
  assert.equal((await nextMessage(k, 'welcome')).role, 'teacher');
  await api('/roster', { method: 'PUT', body: { rows: [{ name: 'Ms Kato', teacher: false }] } });
  await sleep(1600);
  assert.equal([...k.state.players.values()].find((p) => p.name === 'Ms Kato')?.role, 'teacher');
  await k.leave(); await sleep(100);
});

test('eight wrong passwords lock the door for a while', async () => {
  for (let i = 0; i < 8; i += 1) await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=nope', redirect: 'manual' });
  const locked = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  assert.match(locked.headers.get('location'), /locked/, 'even the right password waits');
});
