// The classroom end of things, over the wire: only children on the register get in, a
// teacher gets the family links, and a link opens a page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(pathJoin(tmpdir(), 'access-'));
writeFileSync(pathJoin(dir, 'roster.json'), JSON.stringify({ classes: { '6-1': ['Aki', 'Ben'], '6-2': ['Chika'] } }));

process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = dir;
process.env.ACCESS_MODE = 'roster';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'a-report-secret-long-enough';
process.env.LOG_LEVEL = 'error';
process.env.ANSWER_MIN_INTERVAL_MS = '0';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { signReport } = await import('../src/game/report.js');

let server; let url; let http;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = (name, classCode = '6-1', extra = {}) => new Client(url).joinOrCreate('class', { classCode, name, ...extra });

before(async () => {
  server = await startServer({ port: 0 });
  const addr = server.server.address();
  url = `ws://127.0.0.1:${addr.port}`;
  http = `http://127.0.0.1:${addr.port}`;
});
after(async () => { await server.shutdown('test'); });

test('the register is the door: on it you come in, off it you do not', async () => {
  const a = await join('Aki');
  assert.equal((await nextMessage(a, 'welcome')).classCode, '6-1');
  // Case and stray spaces are how a nine-year-old types their own name.
  const again = await join(' ben ');
  assert.equal((await nextMessage(again, 'welcome')).name ?? 'Ben', 'Ben');
  await assert.rejects(() => join('Stranger'), /register|4004/i);
  // The right name in the wrong class is still the wrong class.
  await assert.rejects(() => join('Aki', '6-2'), /register|4004/i);
  // A teacher's key is the teacher's authorisation; no register is consulted.
  const t = await join('Sensei', '6-1', { teacherKey: 'testkey12345' });
  assert.equal((await nextMessage(t, 'welcome')).role, 'teacher');
  await Promise.all([a.leave(), again.leave(), t.leave()]);
  await sleep(150);
});

test('a child who has played before is let in when the register cannot be read', async () => {
  // Aki has a record by now. Break the register underneath a live server.
  const room = await join('Aki');
  await nextMessage(room, 'welcome');
  await room.leave();
  await sleep(150);
  writeFileSync(pathJoin(dir, 'roster.json'), '{ this is not json');
  const back = await join('Aki');
  assert.equal((await nextMessage(back, 'welcome')).classCode, '6-1');
  await back.leave();
  // Somebody with no record is still refused while it is broken.
  await assert.rejects(() => join('Nobody'), /register|4004/i);
  writeFileSync(pathJoin(dir, 'roster.json'), JSON.stringify({ classes: { '6-1': ['Aki', 'Ben'], '6-2': ['Chika'] } }));
  await sleep(50);
});

test('the teacher gets one signed link per child, and it opens a page', async () => {
  const t = await join('Sensei', '6-1', { teacherKey: 'testkey12345' });
  await nextMessage(t, 'welcome');
  t.send('teacher', { cmd: 'reports' });
  const ack = await nextMessage(t, 'teacher:ack');
  assert.equal(ack.ok, true);
  const mine = ack.links.find((l) => l.name === 'Aki');
  assert.ok(mine, `no link for Aki in ${ack.links.map((l) => l.name).join(',')}`);
  assert.ok(!ack.links.some((l) => l.name === 'Sensei'), 'a teacher is not a child with a report');

  const path = mine.url.replace(/^.*?(\/report\/)/, '$1');
  const page = await fetch(http + path);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('Aki'));
  assert.ok(html.includes('レポート'));
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(page.headers.get('cache-control'), 'no-store');

  // The same page as data, for a school that wants to do its own thing with it.
  const json = await (await fetch(`${http + path}&format=json`)).json();
  assert.equal(json.name, 'Aki');
  assert.equal(json.classCode, '6-1');

  // Editing the link into another child's is a 404, not another child's report.
  const swapped = `/report/6-1/Ben?t=${new URL(http + path).searchParams.get('t')}`;
  assert.equal((await fetch(http + swapped)).status, 404);
  assert.equal((await fetch('/report/6-1/Aki?t=wrong'.replace('/report', `${http}/report`))).status, 404);
  // A child with a valid link but no record yet is told so, not shown an empty report.
  const fresh = `/report/6-1/Ben?t=${signReport('a-report-secret-long-enough', '6-1', 'Ben')}`;
  const notYet = await fetch(http + fresh);
  assert.equal(notYet.status, 404);
  assert.match(await notYet.text(), /まだ記録がありません/);
  await t.leave();
  await sleep(150);
});
