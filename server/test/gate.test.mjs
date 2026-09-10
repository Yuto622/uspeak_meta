// 入場ゲート and 保護者レポート. The gate's whole purpose is a pair of promises: never
// lock out a child who belongs here, never let in someone who does not. Each tier of its
// fallback is one of those promises being kept while something else is broken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGate, OPEN, ROSTER } from '../src/game/gate.js';
import { reportFor, reportHtml, signReport, verifyReport, reportPath } from '../src/game/report.js';

const quiet = { info() {}, warn() {} };
const makeStore = ({ roster = { '6-1': ['Aki', 'Ben'] }, records = {}, fail = false } = {}) => ({
  calls: 0,
  async listRoster(classCode) {
    this.calls += 1;
    if (fail) throw new Error('sheets is down');
    return (roster[classCode] || []).map((name) => ({ class: classCode, name }));
  },
  async loadPlayer(classCode, name) { return records[`${classCode}|${name}`] || null; },
});

test('an open door is an open door: nothing is read, nobody is refused', async () => {
  const store = makeStore();
  const gate = createGate({ store, mode: OPEN, log: quiet });
  assert.deepEqual(await gate.allow({ classCode: '6-1', name: 'Anyone', role: 'student' }), { ok: true, reason: 'open' });
  assert.equal(store.calls, 0, 'the register is not even consulted');
});

test('with a register, the register decides — and spelling is not a test', async () => {
  const store = makeStore();
  const gate = createGate({ store, mode: ROSTER, log: quiet });
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' })).ok, true);
  // A child typing their own name in lower case, or with a space, is still that child.
  assert.equal((await gate.allow({ classCode: '6-1', name: '  aki ', role: 'student' })).ok, true);
  const no = await gate.allow({ classCode: '6-1', name: 'Stranger', role: 'student' });
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'not on the register');
  // A teacher holds the key; the key is the authorisation.
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Stranger', role: 'teacher' })).ok, true);
});

test('the register is read once for a class, not once per child', async () => {
  const store = makeStore();
  const gate = createGate({ store, mode: ROSTER, ttlMs: 60000, log: quiet });
  for (let i = 0; i < 25; i += 1) await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' });
  assert.equal(store.calls, 1, 'a class of 25 arriving at once is one read');
  gate.forget('6-1');
  await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' });
  assert.equal(store.calls, 2, 'and a teacher can ask for it again');
});

test('an outage mid-lesson changes nothing for the children', async () => {
  const store = makeStore();
  const gate = createGate({ store, mode: ROSTER, ttlMs: 0, log: quiet });
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' })).ok, true);
  store.listRoster = async () => { throw new Error('sheets is down'); };
  const during = await gate.allow({ classCode: '6-1', name: 'Ben', role: 'student' });
  assert.equal(during.ok, true);
  assert.equal(during.reason, 'register', 'the last good copy still stands');
  // And a stranger is still a stranger while it is down.
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Stranger', role: 'student' })).ok, false);
});

test('a child who has been here before is let in even with nothing to check against', async () => {
  const store = makeStore({ roster: {}, records: { '6-1|Chika': { name: 'Chika' } } });
  store.listRoster = async () => { throw new Error('sheets is down'); };
  const gate = createGate({ store, mode: ROSTER, log: quiet });
  const back = await gate.allow({ classCode: '6-1', name: 'Chika', role: 'student' });
  assert.equal(back.ok, true);
  assert.equal(back.reason, 'returning', 'somebody admitted them once');
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Nobody', role: 'student' })).ok, false);
});

test('a class with no register at all is not a class anyone can walk into', async () => {
  // listRoster returning null means "no register is kept here" - which under
  // ACCESS_MODE=roster is a school that meant to have one.
  const store = { async listRoster() { return null; }, async loadPlayer() { return null; } };
  const gate = createGate({ store, mode: ROSTER, log: quiet });
  assert.deepEqual(await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' }), { ok: false, reason: 'no register' });
});

test('the last good register survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const snapshotPath = join(dir, 'roster-snapshot.json');
  const store = makeStore();
  const gate = createGate({ store, mode: ROSTER, snapshotPath, log: quiet });
  await gate.allow({ classCode: '6-1', name: 'Aki', role: 'student' });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(existsSync(snapshotPath), 'it was written');
  assert.deepEqual(JSON.parse(readFileSync(snapshotPath, 'utf8')).classes['6-1'], ['aki', 'ben']);
  // A fresh process, with the register unreachable from the first moment.
  const broken = { async listRoster() { throw new Error('down'); }, async loadPlayer() { return null; } };
  const after = createGate({ store: broken, mode: ROSTER, snapshotPath, log: quiet });
  assert.equal((await after.allow({ classCode: '6-1', name: 'Ben', role: 'student' })).ok, true);
  assert.equal((await after.allow({ classCode: '6-1', name: 'Stranger', role: 'student' })).ok, false);
});

test('a report is derived from the record, and says nothing it cannot support', () => {
  const r = reportFor({
    name: 'Aki', class: '6-1', level: 4, xp: 12, correct: 31, attempts: 40, chats: 12, coins: 520,
    dex_json: '["a","b"]', garage_json: '["kick"]', room_json: '{"tier":2,"blocks":[{},{}]}',
    pet_json: '{"name":"モコ","xp":60}', missions_json: '["x"]', lap_best: 114300, login_streak: 3,
  });
  assert.equal(r.accuracy, 78);
  assert.equal(r.totalXp, 132);
  assert.equal(r.fishKinds, 2);
  assert.equal(r.blocks, 2);
  assert.equal(r.pet.level, 3);
  // A child who has not answered anything has no percentage, rather than nought per cent.
  assert.equal(reportFor({ name: 'New', class: '6-1', attempts: 0, correct: 0 }).accuracy, null);
  // Rubbish in a record does not become a number in front of a parent.
  const junk = reportFor({ name: 'X', class: '6-1', level: 'many', xp: '??', correct: 9, attempts: 2, dex_json: 'not json' });
  assert.equal(junk.level, 1);
  assert.equal(junk.xp, 0);
  assert.equal(junk.correct, 2, 'more correct than attempted is not possible');
  assert.equal(junk.fishKinds, 0);
});

test('a report link cannot be edited into somebody else\'s child', () => {
  const secret = 'a-very-long-report-secret';
  const token = signReport(secret, '6-1', 'Aki');
  assert.equal(verifyReport(secret, '6-1', 'Aki', token), true);
  assert.equal(verifyReport(secret, '6-1', 'Ben', token), false, 'another child in the same class');
  assert.equal(verifyReport(secret, '6-2', 'Aki', token), false, 'the same name in another class');
  assert.equal(verifyReport('another-very-long-secret', '6-1', 'Aki', token), false);
  assert.equal(verifyReport(secret, '6-1', 'Aki', ''), false);
  assert.equal(verifyReport(secret, '6-1', 'Aki', `${token}x`), false);
  // Names with spaces and Japanese survive the round trip through a URL.
  assert.ok(reportPath(secret, '6-1', 'あき さん').includes('%20'));
});

test('the report page is a page, not an application', () => {
  const html = reportHtml(reportFor({ name: '<script>x</script>', class: '6-1', level: 2, xp: 5, correct: 1, attempts: 2 }));
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/<script/i.test(html.replace(/&lt;script/g, '')), 'the name is escaped, not run');
  assert.ok(html.includes('noindex'));
  // No third party is contacted when a family opens it.
  assert.ok(!/https?:\/\//i.test(html.replace(/http-equiv/gi, '')));
});
