// 名簿スプレッドシート: a register the teacher keeps in a Google Sheet of their own,
// read by the gate whatever the store backend. The sheet is typed by hand, so the parser
// is forgiving about headers, columns and blanks; the gate is not forgiving about names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRosterRows, rowsForClass, createSheetRoster, ANY_CLASS } from '../src/store/roster-sheet.js';
import { createGate, ROSTER } from '../src/game/gate.js';

const quiet = { info() {}, warn() {} };

test('class | name | note with a header, in either language', () => {
  const rows = parseRosterRows([['class', 'name', 'note'], ['6-1', 'Aki', ''], ['6-1', 'Ben', 'new'], ['6-2', 'Chika']]);
  assert.deepEqual(rows, [
    { class: '6-1', name: 'Aki', note: '' }, { class: '6-1', name: 'Ben', note: 'new' }, { class: '6-2', name: 'Chika', note: '' },
  ]);
  const ja = parseRosterRows([['クラス', '名前', 'メモ'], ['6-1', 'あき', '']]);
  assert.deepEqual(ja, [{ class: '6-1', name: 'あき', note: '' }]);
});

test('the columns are wherever the teacher put them, and a sheet of names alone is for every class', () => {
  const swapped = parseRosterRows([['アカウント名', 'クラス'], ['Aki', '6-1'], ['Ben', '']]);
  assert.deepEqual(swapped, [{ class: '6-1', name: 'Aki', note: '' }, { class: ANY_CLASS, name: 'Ben', note: '' }]);
  const names = parseRosterRows([['Aki'], ['Ben'], [''], ['Chika']]);
  assert.deepEqual(names.map((r) => [r.class, r.name]), [['*', 'Aki'], ['*', 'Ben'], ['*', 'Chika']]);
  // A header on a one-column sheet is a header, not a child called "name".
  assert.deepEqual(parseRosterRows([['name'], ['Aki']]).map((r) => r.name), ['Aki']);
  // No header, two columns: class | name, as the Sheets store's tab has always been.
  assert.deepEqual(parseRosterRows([['6-1', 'Aki'], ['*', 'Sora']]), [{ class: '6-1', name: 'Aki', note: '' }, { class: '*', name: 'Sora', note: '' }]);
  assert.deepEqual(parseRosterRows([]), []);
  assert.deepEqual(parseRosterRows([[], ['', '']]), []);
});

test('a class gets its own rows and the every-class rows, and the class code is not a spelling test', () => {
  const rows = parseRosterRows([['6-1', 'Aki'], ['6-2', 'Chika'], ['', 'Sora'], ['*', 'Sensei-no-ko']]);
  assert.deepEqual(rowsForClass(rows, '6-1').map((r) => r.name), ['Aki', 'Sora', 'Sensei-no-ko']);
  assert.deepEqual(rowsForClass(rows, ' 6-2 ').map((r) => r.name), ['Chika', 'Sora', 'Sensei-no-ko']);
  assert.ok(rowsForClass(rows, '6-1').every((r) => r.class === '6-1'), 'the rows are stamped with the class asked for');
  assert.deepEqual(rowsForClass(rows, '6-3').map((r) => r.name), ['Sora', 'Sensei-no-ko']);
});

const fakeApi = (tabs) => ({
  calls: [],
  async getSheetTitles() { this.calls.push('titles'); return Object.keys(tabs); },
  async getValues(range) { this.calls.push(range); return tabs[/^'(.*)'!/.exec(range)[1].replace(/''/g, "'")] || []; },
});

test('the tab is `roster` if there is one, else the first tab, and a configured tab wins', async () => {
  const api = fakeApi({ 'シート1': [['name'], ['Aki']], roster: [['class', 'name'], ['6-1', 'Ben']] });
  const r = createSheetRoster(api, { log: quiet });
  assert.deepEqual((await r.listRoster('6-1')).map((x) => x.name), ['Ben']);
  assert.equal(r.tab, 'roster');
  const first = createSheetRoster(fakeApi({ 'シート1': [['name'], ['Aki']], other: [] }), { log: quiet });
  assert.deepEqual((await first.listRoster('6-1')).map((x) => x.name), ['Aki']);
  assert.equal(first.tab, 'シート1');
  const chosen = createSheetRoster(api, { tab: 'シート1', log: quiet });
  assert.deepEqual((await chosen.listRoster('6-1')).map((x) => x.name), ['Aki']);
  assert.ok(!chosen.calls, 'no titles lookup when the tab is given');
  // The tab name is looked up once, not on every read.
  await r.listRoster('6-1'); await r.listRoster('6-2');
  assert.equal(api.calls.filter((c) => c === 'titles').length, 1);
});

test('the gate reads the register from the sheet while records stay in the store', async () => {
  const store = {
    rosterCalls: 0,
    async listRoster() { this.rosterCalls += 1; return []; },
    async loadPlayer(cls, name) { return name === 'Old' ? { name } : null; },
  };
  const roster = createSheetRoster(fakeApi({ roster: [['class', 'name'], ['6-1', 'Aki'], ['', 'Sora']] }), { log: quiet });
  const gate = createGate({ store, roster, mode: ROSTER, log: quiet });
  assert.equal((await gate.allow({ classCode: '6-1', name: 'aki', role: 'student' })).ok, true);
  assert.equal((await gate.allow({ classCode: '6-2', name: 'Sora', role: 'student' })).ok, true, 'an every-class row');
  assert.equal(store.rosterCalls, 0, 'the store is not asked for a register');
  // The whole point: a name that is not on the sheet does not get in, even with an old
  // record from the days before the gate was turned on.
  const old = await gate.allow({ classCode: '6-1', name: 'Old', role: 'student' });
  assert.deepEqual(old, { ok: false, reason: 'not on the register' });
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Nobody', role: 'student' })).ok, false);
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Anyone', role: 'teacher' })).ok, true);
});

test('with the sheet unreachable from the start, an old record is still worth something', async () => {
  const store = { async listRoster() { return null; }, async loadPlayer(cls, name) { return name === 'Old' ? { name } : null; } };
  const roster = { async listRoster() { throw new Error('403 the sheet is not shared'); } };
  const gate = createGate({ store, roster, mode: ROSTER, log: quiet });
  assert.equal((await gate.allow({ classCode: '6-1', name: 'Old', role: 'student' })).reason, 'returning');
  assert.equal((await gate.allow({ classCode: '6-1', name: 'New', role: 'student' })).ok, false);
});
