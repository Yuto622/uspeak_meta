// レースの ことばの ゲート：問題は 部屋が くばり（正解は 送らない）、くぐった レーンで 部屋が 正解・コイン・学習記録を 決める。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';

process.env.STORE_BACKEND = 'file';
process.env.DATA_DIR = mkdtempSync(pathJoin(tmpdir(), 'kart-'));
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';

const { Client } = await import('colyseus.js');
let server; let ws;
const nextMessage = (room, type, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  ws = `ws://127.0.0.1:${server.server.address().port}`;
});
after(async () => { await server.shutdown('test'); });

test('kart: the room deals the questions without answers and pays only for a right lane', async () => {
  const room = await new Client(ws).joinOrCreate('class', { classCode: 'kart', name: 'Racer' });
  room.onMessage('*', () => {});
  const welcome = await nextMessage(room, 'welcome');
  const coins0 = welcome.wallet?.coins ?? 0;

  room.send('kart:start', { grade: 5, count: 3, ref: 'r1' });
  const quiz = await nextMessage(room, 'kart:quiz');
  assert.equal(quiz.ref, 'r1');
  assert.equal(quiz.questions.length, 3);
  assert.ok(!/"answer"|"en"/.test(JSON.stringify(quiz)), 'no answer in the payload');

  // 1問目：3つの レーンを 順に ためす ことは できない（1問 1回）。
  room.send('kart:answer', { id: quiz.id, i: 0, choice: 0 });
  const first = await nextMessage(room, 'kart:result');
  assert.equal(first.i, 0);
  assert.equal(typeof first.correct, 'boolean');
  assert.equal(first.wallet.coins, coins0 + (first.correct ? 5 : 0));
  await sleep(1300);
  room.send('kart:answer', { id: quiz.id, i: 0, choice: first.answer });
  assert.equal((await nextMessage(room, 'kart:error')).reason, 'answered');

  // 速すぎる 答えは ことわる。
  room.send('kart:answer', { id: quiz.id, i: 1, choice: 0 });
  const second = await nextMessage(room, 'kart:result');
  room.send('kart:answer', { id: quiz.id, i: 2, choice: 0 });
  assert.equal((await nextMessage(room, 'kart:error')).reason, 'too fast');

  // くぐれなかった（-1）は まちがい：コインは ふえない。
  await sleep(1300);
  room.send('kart:answer', { id: quiz.id, i: 2, choice: -1 });
  const third = await nextMessage(room, 'kart:result');
  assert.equal(third.correct, false);
  assert.equal(third.wallet.coins, coins0 + 5 * [first, second].filter((r) => r.correct).length);

  // ちがう レースの id は うけつけない。
  room.send('kart:answer', { id: 'nope', i: 0, choice: 0 });
  assert.equal((await nextMessage(room, 'kart:error')).reason, 'no race');
  await room.leave();
});
