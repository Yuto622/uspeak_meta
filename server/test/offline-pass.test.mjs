// ひとりで あそぶ（オフライン）の 期限 — 名簿に ない 子は さいしょに ひとりで あそんだ 日から 14 日、名簿に ある 子は ずっと。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { daysLeft, startOffline, noteRoster, OFFLINE_DAYS } = await import('../../client/dist/offline-pass.js');
const { createGate, OPEN } = await import('../src/game/gate.js');
const DAY = 86400000;
const T0 = Date.parse('2026-10-20T00:00:00Z');

test('名簿に ない 子：さいしょに ひとりで あそんだ 日から 14 日。過ぎたら ことわる', () => {
  mem.clear();
  assert.equal(OFFLINE_DAYS, 14);
  assert.equal(daysLeft(T0), 14, 'まだ 一度も あそんで いない');
  assert.equal(startOffline(T0), true);
  assert.equal(daysLeft(T0 + 3 * DAY), 11);
  assert.equal(startOffline(T0 + 13 * DAY + 3600000), true, '14 日目は まだ あそべる');
  assert.equal(startOffline(T0 + 14 * DAY), false, '15 日目から あそべない');
  assert.equal(daysLeft(T0 + 30 * DAY), 0);
});

test('時計を 戻しても のびない（いちばん 新しく 見た 時刻より 前には 戻らない）', () => {
  mem.clear();
  startOffline(T0);
  startOffline(T0 + 14 * DAY);           // ここで 期限ぎれを 見た
  assert.equal(startOffline(T0 + 2 * DAY), false, '日付を 戻しても だめ');
});

test('名簿に ある と サーバーが 言えば ずっと。名簿から 外された 同じ 子は 14 日に もどる', () => {
  mem.clear();
  startOffline(T0);
  assert.equal(startOffline(T0 + 20 * DAY), false);
  noteRoster({ onRoster: true, name: 'Hina', classCode: 'a' }, T0 + 20 * DAY);
  assert.equal(daysLeft(T0 + 20 * DAY), Infinity);
  assert.equal(startOffline(T0 + 400 * DAY), true);
  noteRoster({ onRoster: false, name: 'Ken', classCode: 'a' });          // べつの 子が この 端末で 入っても 消さない
  assert.equal(daysLeft(T0 + 400 * DAY), Infinity);
  noteRoster({ onRoster: false, name: 'Hina', classCode: 'a' });         // 本人が 名簿から 外された
  assert.equal(startOffline(T0 + 401 * DAY), false, 'はじめた 日は のこって いるので すぐ 期限ぎれ');
});

test('gate.onRegister：名簿に 名前が あるか（open の ときも 見る・つづりの ゆれは 同じ 子）', async () => {
  const store = { async listRoster(c) { return c === '6-1' ? [{ class: '6-1', name: 'Aki' }] : []; }, async loadPlayer() { return null; } };
  const gate = createGate({ store, mode: OPEN, log: { info() {}, warn() {} } });
  assert.equal(await gate.onRegister({ classCode: '6-1', name: ' aki ' }), true);
  assert.equal(await gate.onRegister({ classCode: '6-1', name: 'Ben' }), false);
  assert.equal(await gate.onRegister({ classCode: '6-2', name: 'Aki' }), false);
});
