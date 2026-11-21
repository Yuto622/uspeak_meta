// 教室の アカウント（/admin/classrooms の 👥）：教室の クラスごとの 名簿・クラスの ない 行・記録が どこに あるか。
// 書きかえは 画面が いつもの 名簿の 口で する（ここでは 口の 返す 中身と、名簿を 書きかえた あと その クラスで 入れる ことを 見る）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = mkdtempSync(pathJoin(tmpdir(), 'cacct-'));
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.LOG_LEVEL = 'error';

const { Client } = await import('colyseus.js');
let server; let http; let ws; let admin = '';
const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const api = (path, opts = {}) => fetch(`${http}/admin/api${path}`, { ...opts, headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json', ...(opts.headers || {}) } });
const put = (body) => ({ method: 'PUT', body: JSON.stringify(body) });

before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  const port = server.server.address().port;
  http = `http://127.0.0.1:${port}`; ws = `ws://127.0.0.1:${port}`;
  admin = cookieOf(await fetch(`${http}/admin/login`, form('password=owner-password-123')));
  assert.equal((await api('/classrooms', put({ rows: [{ name: 'IAC', classes: 'iac1, iac2', password: 'iac-pass-123' }, { name: 'よそ', classes: 'other', password: 'other-pass-1' }] }))).status, 200);
  assert.equal((await api('/roster', put({ rows: [
    { class: 'iac1', name: 'Hana' }, { class: 'iac2', name: 'Riku' }, { class: '', name: 'Sora' }, { class: 'other', name: 'Aoi' },
    { class: 'iac1', name: 'Sensei', teacher: 'TRUE', pin: 'sensei-pin-1' },
  ] }))).status, 200);
});
after(async () => { await server.shutdown('test'); });

test('教室の アカウント：クラスごと・クラスなし・記録の ある ところ', async () => {
  // Hana は iac1 で、Sora（クラスなし）は iac2 で あそぶ → 記録が できる。
  for (const [name, classCode] of [['Hana', 'iac1'], ['Sora', 'iac2']]) {
    const room = await new Client(ws).joinOrCreate('class', { name, classCode });
    await new Promise((r) => setTimeout(r, 300)); await room.leave(); await new Promise((r) => setTimeout(r, 300));
  }
  const { rooms } = await (await api('/classrooms')).json();
  const iac = rooms.find((r) => r.name === 'IAC');
  const d = await (await api(`/classrooms/accounts?room=${iac.id}`)).json();
  assert.ok(d.ok); assert.deepEqual(d.room.classes, ['iac1', 'iac2']);
  const by = Object.fromEntries(d.accounts.map((a) => [a.name, a]));
  assert.equal(by.Aoi, undefined, 'よその 教室の 子は 出ない');
  assert.equal(by.Hana.class, 'iac1'); assert.equal(by.Hana.hasRecord, true);
  assert.equal(by.Riku.hasRecord, false);
  assert.equal(by.Sora.class, ''); assert.deepEqual(by.Sora.recordIn, ['iac2'], 'クラスの ない 子は 記録の ある クラスを おしえる');
  assert.equal(by.Sensei.teacher, true);
  assert.equal((await api('/classrooms/accounts?room=nope')).status, 404);
  assert.equal((await fetch(`${http}/admin/api/classrooms/accounts?room=${iac.id}`)).status, 401, 'ログイン して いないと 見えない');
});
