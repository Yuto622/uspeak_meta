// JSON の ファイルを こわさずに 書く：同じ ファイルへの 書きこみが 同時に 来ても、さいごの 中身が 正しい JSON で のこる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const { writeJsonFile } = await import('../src/store/write-json.js');
const { HomeworkStore } = await import('../src/homework/store.js');

test('同時に 50 回 書いても こわれず、さいごに たのんだ 中身に なる', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wj-'));
  const file = path.join(dir, 'x.json');
  const big = 'y'.repeat(200000);
  await Promise.all(Array.from({ length: 50 }, (_, i) => writeJsonFile(file, { i, big })));
  const got = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(got.i, 49);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['x.json'], '一時ファイルは のこらない');
});

test('宿題：同時に 答えても DATA_DIR の 記録は 読みなおせる（再起動しても のこる）', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwf-'));
  const file = path.join(dir, 'homework.json');
  const hw = await new HomeworkStore(file, { log: { warn() {} } }).init();
  const { assignment: a } = await hw.create({ title: 't', classes: 'c1', items: Array.from({ length: 30 }, (_, i) => ({ en: `w${i}x`, ja: `ことば${i}` })) });
  await Promise.all(a.items.map((it, i) => hw.record('c1', `kid${i % 6}`, a.id, it.id, true)));
  const again = await new HomeworkStore(file, { log: { warn() {} } }).init();
  const n = Object.values(again.progress).reduce((s, p) => s + Object.keys(p.answers).length, 0);
  assert.equal(n, 30);
});
