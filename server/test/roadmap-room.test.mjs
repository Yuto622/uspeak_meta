// ロードマップ：部屋（rm:get → rm:state、条件を みたすと rm:up と コイン 1 回）・英検の島の 答えが 記録に のる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { stagesFor, STAGE_COINS } = await import('../src/game/roadmap.js');

let server; let url;
const nextMessage = (room, type, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { const { startServer } = await import('../src/index.js'); server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋：ひらくと いまの 段階。条件を みたして いれば 1 段階 上がって お祝いと コイン（2 回目は なし）', async () => {
  const { Client } = await import('colyseus.js');
  const room = await new Client(url).joinOrCreate('class', { classCode: 'rm1', name: 'Ren' });
  const welcome = await nextMessage(room, 'welcome');
  room.send('rm:get');
  let st = await nextMessage(room, 'rm:state');
  assert.equal(st.stage.id, 'A');
  assert.equal(st.stages.length, 12);
  assert.ok(st.words.total > 0 && st.quiz.min === 20);
  assert.ok(!('ups' in st) && !('username' in st));

  // Roblox で A の 単語を ぜんぶ 覚えて、SUPER EASY の クイズも 20 問（記録は 1 つの 箱）
  const now = Date.now(); const DAY = 86400e3; let k = 0;
  const ev = (ts, data) => ({ id: `rm-${k += 1}`, ts, type: 'quiz', world: 'hut', place_id: 'roblox', username: 'Ren', user_id: '', class_code: 'rm1', data_json: JSON.stringify(data), received_at: new Date().toISOString() });
  const rows = [];
  for (const d of [3, 2, 1]) for (const w of stagesFor()[0].words) rows.push(ev(now - d * DAY, { word: w, correct: true, level: 'SuperEasy' }));
  server.store.appendRobloxEvents(rows);
  const up = nextMessage(room, 'rm:up');
  const after = nextMessage(room, 'rm:state');
  room.send('rm:get');
  const u = await up;
  assert.deepEqual([u.from, u.to, u.coins], ['A', 'B', STAGE_COINS]);
  assert.equal(u.wallet.coins, welcome.wallet.coins + STAGE_COINS);
  st = await after;
  assert.equal(st.stage.id, 'B');
  // 先生が A に もどして また 上がっても コインは もう 出ない
  await server.roadmapStore.setStage('rm1', 'Ren', 'A', { by: 'teacher' });
  // もどした あとは その 段階の クイズを また 20 問（もどす 前の クイズは 数えない）
  room.send('rm:get');
  st = await nextMessage(room, 'rm:state');
  assert.deepEqual([st.stage.id, st.quiz.n, st.ready], ['A', 0, false]);
  await new Promise((r) => setTimeout(r, 5));
  const t = Date.now();
  server.store.appendRobloxEvents(Array.from({ length: 20 }, (_, i) => ev(t + i, { word: 'zz', correct: true, level: 'SuperEasy' })));
  await new Promise((r) => setTimeout(r, 30));
  const up2 = nextMessage(room, 'rm:up');
  room.send('rm:get');
  const again = await up2;
  assert.equal(again.coins, 0);
  await room.leave();
});
