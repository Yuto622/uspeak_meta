// 先生パスワード（名簿の pin）は roster.json に 書いて、読みなおしても のこる。
// 前は 読みなおしの とき pin だけ 捨てて いたので、デプロイ（再起動）の たびに 先生の パスワードが 空に なり、
// 先生が 名前だけで 生徒として 入って 授業モードの ボタンが 出なかった。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStore } from '../src/store/FileStore.js';

test('the 先生パスワード survives a fresh read of roster.json (a restart)', async () => {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'roster-pin-'));
  const quiet = { info() {}, warn() {}, error() {} };
  const a = new FileStore(pathJoin(dir, 'store.json'), { log: quiet });
  await a.saveRoster([{ class: '*', name: 'IACteacher1', teacher: true, premium: true, pin: 'pw-123456', stopped: false }, { class: '*', name: 'Ken' }]);
  const b = new FileStore(pathJoin(dir, 'store.json'), { log: quiet });   // 再起動の あと
  const rows = await b.listAllRoster();
  assert.deepEqual(rows.find((r) => r.name === 'IACteacher1'), { class: '*', name: 'IACteacher1', note: '', teacher: true, premium: true, pin: 'pw-123456' });
  assert.equal(rows.find((r) => r.name === 'Ken').pin, undefined);
  utimesSync(pathJoin(dir, 'roster.json'), new Date(), new Date(Date.now() + 5000));    // ファイルが かわった とき（読みなおし）も
  assert.equal((await a.listAllRoster()).find((r) => r.name === 'IACteacher1').pin, 'pw-123456');
});
