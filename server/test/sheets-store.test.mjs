import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SheetsStore, SHEETS } from '../src/store/SheetsStore.js';
import { PLAYER_COLUMNS, ROSTER_COLUMNS, blankPlayerRecord } from '../src/store/records.js';

// In-memory fake of the Sheets adapter that mimics ranges/appends closely enough.
function fakeApi({ failAppend = false } = {}) {
  const sheets = new Map();
  const calls = [];
  const rowsOf = (name) => { if (!sheets.has(name)) sheets.set(name, []); return sheets.get(name); };
  const api = {
    sheets, calls, failAppend,
    async getSheetTitles() { calls.push('titles'); return [...sheets.keys()]; },
    async addSheet(title) { calls.push(`add:${title}`); rowsOf(title); },
    async getValues(range) {
      calls.push(`get:${range}`);
      const [name, a1] = range.split('!');
      const rows = rowsOf(name);
      if (a1 === '1:1') return rows.slice(0, 1);
      if (a1.startsWith('A2')) return rows.slice(1);
      return rows;
    },
    async update(range, values) {
      calls.push(`update:${range}`);
      const [name, a1] = range.split('!');
      const row = Number(/\d+/.exec(a1)[0]);
      const rows = rowsOf(name);
      rows[row - 1] = values[0];
    },
    async batchUpdate(data) {
      for (const d of data) { await api.update(d.range, d.values); calls.pop(); }
      calls.push(`batch:${data.length}`);
    },
    async append(range, values) {
      calls.push(`append:${range.split('!')[0]}:${values.length}`);
      if (api.failAppend) throw new Error('quota');
      const name = range.split('!')[0];
      const rows = rowsOf(name);
      const first = rows.length + 1;
      rows.push(...values);
      return `${name}!A${first}:P${first + values.length - 1}`;
    },
  };
  return api;
}

test('init creates missing sheets with headers', async () => {
  const api = fakeApi();
  const store = new SheetsStore(api, { log: { warn() {} } });
  await store.init();
  assert.deepEqual([...api.sheets.keys()], [SHEETS.players, SHEETS.learning, SHEETS.coins, SHEETS.roster]);
  assert.deepEqual(api.sheets.get(SHEETS.players)[0], PLAYER_COLUMNS);
  // The register is a tab a teacher fills in by hand, so it is created with its header.
  assert.deepEqual(api.sheets.get(SHEETS.roster)[0], ROSTER_COLUMNS);
});

test('save/append are batched into few requests and rows become updates after first append', async () => {
  const api = fakeApi();
  const store = new SheetsStore(api, { log: { warn() {} } });
  await store.init();
  api.calls.length = 0;
  const a = { ...blankPlayerRecord('c1', 'Aki'), coins: 5 };
  const b = { ...blankPlayerRecord('c1', 'Ben'), coins: 7 };
  store.savePlayer(a); store.savePlayer(b); store.savePlayer({ ...a, coins: 9 });
  store.appendLearning(['t', 'c1', 'Aki', 'lesson:0:0', 'lesson', '0', 1, 5, 's']);
  store.appendLearning(['t', 'c1', 'Ben', 'lesson:0:0', 'lesson', '1', 0, 0, 's']);
  store.appendCoin(['t', 'c1', 'Aki', 'sell', 'fish-1', 1, 18, 18, 's']);
  await store.flush();
  assert.deepEqual(api.calls, ['append:players:2', 'append:learning_log:2', 'append:coin_log:1']);
  assert.equal(api.sheets.get(SHEETS.players)[1][2], 9, 'last write for Aki wins');
  api.calls.length = 0;
  store.savePlayer({ ...b, coins: 11 });
  await store.flush();
  assert.deepEqual(api.calls, ['batch:1']);
  assert.equal(api.sheets.get(SHEETS.players)[2][2], 11);
  assert.equal((await store.loadPlayer('c1', 'Ben')).coins, 11);
  assert.equal(await store.loadPlayer('c1', 'Nobody'), null);
});

test('failed writes are retried on the next flush', async () => {
  const api = fakeApi({ failAppend: true });
  const store = new SheetsStore(api, { log: { warn() {} } });
  await store.init();
  store.savePlayer(blankPlayerRecord('c1', 'Aki'));
  store.appendCoin(['t', 'c1', 'Aki', 'sell', 'fish-1', 1, 18, 18, 's']);
  await store.flush();
  assert.equal(store.stats.failures, 2);
  assert.equal(store.pendingCount, 2);
  api.failAppend = false;
  await store.flush();
  assert.equal(store.pendingCount, 0);
  assert.equal(api.sheets.get(SHEETS.players).length, 2);
  assert.equal(api.sheets.get(SHEETS.coins).length, 2);
});

test('existing rows are loaded into the cache at init', async () => {
  const api = fakeApi();
  api.sheets.set(SHEETS.players, [PLAYER_COLUMNS, ['c1', 'Aki', '42', '3', '4', '1', 'willow', '1.5', '2', '{}', '[]', '[]', '', '', 't', 't']]);
  api.sheets.set(SHEETS.learning, [['x']]);
  api.sheets.set(SHEETS.coins, [['x']]);
  const store = new SheetsStore(api, { log: { warn() {} } });
  await store.init();
  const rec = await store.loadPlayer('c1', 'Aki');
  assert.equal(rec.coins, 42);
  assert.equal(rec.x, 1.5);
  store.savePlayer({ ...rec, coins: 43 });
  await store.flush();
  assert.equal(api.sheets.get(SHEETS.players)[1][2], 43);
});

// **保存しているのに列に無いフィールドは、Sheets 版で黙って消える。**
// `recordToRow` は列の名前で引くので、`savePlayer({ ... })` に書いただけでは足りない。
// 実際に `months_json` をこれで落としかけた（ファイル保存では動くので気づかない）。
test('ClassRoom が保存する項目は、ぜんぶ PLAYER_COLUMNS にある', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(fileURLToPath(new URL('../src/rooms/ClassRoom.js', import.meta.url)), 'utf8');
  // `this.store.savePlayer({` から、対応する `});` までを切り出す。
  const MARK = 'class: this.classCode, name: priv.name,';
  const mark = src.indexOf(MARK);
  assert.ok(mark > 0, 'persist() の savePlayer が見つからない（中身が変わった？）');
  const open = src.lastIndexOf('this.store.savePlayer({', mark);
  assert.ok(open > 0, 'savePlayer の呼び出しが見つからない（名前が変わった？）');
  // **括弧を数えて終わりを見つける。** 「`\n    });` まで」のような目印にすると、
  // 関係のないところの字下げが変わっただけで別の場所まで飲み込む（実際にそうなった）。
  const start = src.indexOf('{', open);
  let depth = 0; let end = start;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > start, 'savePlayer に渡すオブジェクトの終わりが見つからない');
  const body = src.slice(start, end);
  // いちばん外側の `key:` だけを拾う（入れ子のオブジェクトの中身は列ではない）。
  const keys = [];
  let level = 0;
  for (const line of body.split('\n')) {
    const m = level === 1 ? line.match(/^\s*([a-z_]+):/) : null;
    if (m) keys.push(m[1]);
    for (const ch of line) { if (ch === '{') level += 1; else if (ch === '}') level -= 1; }
  }
  assert.ok(keys.length > 20, `拾えた項目が少なすぎる（${keys.length}）。切り出しが壊れている`);
  const missing = [...new Set(keys)].filter((k) => !PLAYER_COLUMNS.includes(k));
  assert.deepEqual(missing, [], `PLAYER_COLUMNS に足りない: ${missing.join(', ')}`);
});
