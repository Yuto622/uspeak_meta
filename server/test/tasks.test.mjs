// タスクの 表：/admin/tasks で 入れかえ・書きかえ、/api/tasks は 採用の 行だけ。保存は DATA_DIR/tasks.json。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'tasks-'));
process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = dir;
process.env.TEACHER_KEY = 'testkey12345';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { validateTable, rowsFromTsv, rowsToTsv, loadSeed } = await import('../src/tasks/store.js');

let server; let http; let cookie = '';
const api = (path, { method = 'GET', body, xrw = true } = {}) => fetch(`${http}/admin/api${path}`, {
  method, redirect: 'manual',
  headers: { cookie, ...(xrw ? { 'x-requested-with': 'uspeak-admin' } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

before(async () => {
  server = await startServer({ port: 0 });
  http = `http://127.0.0.1:${server.server.address().port}`;
  const ok = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  cookie = ok.headers.get('set-cookie').split(';')[0];
});
after(async () => { await server.shutdown('test'); });

test('the seed matches the design sheet (100 + 130 + 60 + 30 rows)', () => {
  const s = loadSeed();
  assert.equal(s.onboarding.length, 100);
  assert.equal(s.ladders.length, 130);
  assert.equal(s.roadmap.length, 60);
  assert.equal(s.daily.length, 30);
  assert.equal(s.onboarding[0].ja, 'つりばに いってみよう');
  assert.equal(s.onboarding[3].ja, 'さかなを うってみよう');
  assert.equal(s.ladders.reduce((n, r) => n + r.tiers.split(',').length, 0), 1025);
});

test('rows are cleaned: ids filled, duplicates refused, tiers keep only numbers', () => {
  const v = validateTable('ladders', [{ id: '', ja: 'a', tiers: "'1, 3、x,10", coins: '1,200', on: 'TRUE' }, { id: 'L001', ja: 'b', on: false }]);
  assert.equal(v.rows[0].id, 'L002');
  assert.equal(v.rows[0].tiers, '1,3,10');
  assert.equal(v.rows[0].coins, 1200);
  assert.equal(v.rows[0].on, true);
  assert.match(validateTable('ladders', [{ id: 'X' }, { id: 'X' }]).error, /2回/);
  assert.match(validateTable('nope', []).error, /表/);
});

test('a paste from Google Sheets maps columns by header (順番・段数 are ignored)', () => {
  const tsv = '順番\tID\t採用\t島\t分類\t画面の文（日本語・{n} に 数が 入る）\t画面の文（英語）\t段（{n} に 入る 数）\t段数\t1段ごとの コイン（案）\n1\tL001\tTRUE\tつり島\tあそぶ\tさかなを {n}ぴき\tCatch {n}\t1,5,10\t3\t20\n';
  const rows = rowsFromTsv('ladders', tsv);
  assert.deepEqual(validateTable('ladders', rows).rows[0], { on: true, id: 'L001', island: 'つり島', kind: 'あそぶ', ja: 'さかなを {n}ぴき', en: 'Catch {n}', tiers: '1,5,10', coins: 20, learn: '', when: '', memo: '' });
  const back = rowsFromTsv('ladders', rowsToTsv('ladders', validateTable('ladders', rows).rows));
  assert.equal(validateTable('ladders', back).rows[0].tiers, '1,5,10');
});

test('the editor is behind the admin login', async () => {
  const page = await fetch(`${http}/admin/tasks`, { redirect: 'manual' });
  assert.equal(page.status, 303);
  const res = await fetch(`${http}/admin/api/tasks`);
  assert.equal(res.status, 401);
  const inside = await fetch(`${http}/admin/tasks`, { headers: { cookie } });
  assert.match(await inside.text(), /タスクの 表/);
});

test('reorder, switch off and save: the game sees only adopted rows, in the saved order', async () => {
  const all = await (await api('/tasks')).json();
  const rows = all.tables.onboarding.rows;
  assert.equal(rows.length, 100);
  const moved = [rows[3], rows[0], ...rows.slice(1, 3), ...rows.slice(4)];
  moved[1] = { ...moved[1], on: false };
  const noHeader = await api('/tasks/onboarding', { method: 'PUT', body: { rows: moved }, xrw: false });
  assert.equal(noHeader.status, 403);
  const saved = await (await api('/tasks/onboarding', { method: 'PUT', body: { rows: moved } })).json();
  assert.equal(saved.ok, true);
  const pub = await (await fetch(`${http}/api/tasks`)).json();
  assert.equal(pub.onboarding.length, 97, 'S065 and S068 (not in the game yet) start switched off');
  assert.equal(pub.onboarding[0].id, 'S004');
  assert.ok(!pub.onboarding.some((r) => r.id === 'S001'));
  assert.ok(existsSync(pathJoin(dir, 'tasks.json')));
  assert.equal(JSON.parse(readFileSync(pathJoin(dir, 'tasks.json'), 'utf8')).tables.onboarding[0].id, 'S004');
  const bad = await api('/tasks/onboarding', { method: 'PUT', body: { rows: [{ id: 'A' }, { id: 'A' }] } });
  assert.equal(bad.status, 400);
  const reset = await (await api('/tasks/onboarding/reset', { method: 'POST' })).json();
  assert.equal(reset.rows[0].id, 'S001');
});
