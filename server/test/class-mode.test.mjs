// 授業モードと 苦手の 復習 — 実ソケット。Roblox で まちがえた 単語が Web の 復習に 出る、先生だけが 動かせる、
// ストップ中は 部屋が 答えを 受けつけない、途中参加にも 効く、自動再開、制限（1 秒・5 秒・15 秒）、クラス結果。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.USPEAK_ROBLOX_KEY = 'roblox-test-key-0123456789abcdef-XYZ';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.REVIEW_OFFER_DELAY_MS = '300';
process.env.CLASS_AUTO_RESUME_MS = '2500';
process.env.CLASS_RESULT_MS = '60000';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const KEY = process.env.USPEAK_ROBLOX_KEY;
const DAY = 86400 * 1000;

let server; let url; let http;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const next = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const none = (room, type, ms = 1200) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { off(); resolve(true); }, ms);
  const off = room.onMessage(type, () => { clearTimeout(timer); off(); reject(new Error(`unexpected ${type}`)); });
});
const join = async (name, extra = {}) => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'cm', name, ...extra });
  room.seen = [];
  room.onMessage('*', (type) => room.seen.push(type));
  const welcome = await next(room, 'welcome');
  return { room, welcome };
};
const robloxEvents = (events) => fetch(`${http}/api/roblox/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-uspeak-key': KEY }, body: JSON.stringify({ events }) });

before(async () => {
  server = await startServer({ port: 0 });
  const addr = server.server.address();
  url = `ws://127.0.0.1:${addr.port}`;
  http = `http://127.0.0.1:${addr.port}`;
  // Roblox で 2 日前に 4 つ まちがえた（Aki）。Web の 記録と 同じ 箱に 入る。
  const ts = Date.now() - 2 * DAY;
  const res = await robloxEvents(['river', 'kitchen', 'library', 'window'].map((w, i) => ({ id: `rb-${w}`, ts: ts + i, type: 'quiz', username: 'Aki', classCode: 'cm', data: { word: w, correct: false, level: 'Easy' } })));
  assert.equal(res.status, 200);
});
after(async () => { await server.shutdown('test'); });

test('the review API returns the due words and choices (Roblox and Web share one box)', async () => {
  const r = await (await fetch(`${http}/api/roblox/review/Aki`, { headers: { 'x-uspeak-key': KEY } })).json();
  assert.equal(r.ok, true);
  assert.equal(r.due, 4);
  assert.deepEqual(r.items.map((x) => x.word), ['river', 'kitchen', 'library', 'window']);
  for (const it of r.items) { assert.equal(it.options.length, 4); assert.ok(it.options.includes(it.word)); }
  assert.equal((await fetch(`${http}/api/roblox/review/Aki`)).status, 401);
});

test('class mode: only the teacher, freeze blocks answers (also for late joiners), resume, auto-resume, limits', async () => {
  const aki = await join('Aki');
  const offer = await next(aki.room, 'review:offer', 4000);
  assert.equal(offer.n, 4, 'the once-a-day card offers the due words');
  const t = await join('Sensei', { teacherKey: 'testkey12345' });
  assert.equal(t.welcome.role, 'teacher');

  // 生徒は 先生の 操作を 使えない。
  aki.room.send('class:freeze', { on: true });
  await none(aki.room, 'class:pause', 800);
  aki.room.send('class:get');
  await none(aki.room, 'class:state', 800);

  t.room.send('class:get');
  const st = await next(t.room, 'class:state');
  assert.equal(st.paused, false);
  assert.deepEqual(st.students.map((s) => s.name), ['Aki']);
  assert.ok(st.destinations.some((d) => d.id === 'fishworld'));

  t.room.send('class:freeze', { on: true });
  assert.equal((await next(aki.room, 'class:pause')).by, 'Sensei');
  // ストップ中は 部屋が 答えを 受けつけない（復習も はじまらない）。
  aki.room.send('review:start');
  await none(aki.room, 'review:start', 900);
  // 途中で 入ってきた 子にも ストップ。
  const ben = await join('Ben');
  assert.equal(ben.welcome.classPaused, true);
  await sleep(300);
  assert.ok(ben.room.seen.includes('class:pause'), 'a late joiner is stopped too');
  // 10 分（検査では 2.5 秒）で 自動再開。
  await next(aki.room, 'class:resume', 5000);
  await sleep(1100);

  // 1 秒に 1 回：すぐ 2 回 押しても 2 回目は 捨てる。
  t.room.send('class:freeze', { on: true });
  t.room.send('class:freeze', { on: false });
  await next(aki.room, 'class:pause');
  await none(aki.room, 'class:resume', 700);
  await sleep(400);
  t.room.send('class:freeze', { on: false });
  await next(aki.room, 'class:resume');
  await sleep(1100);

  // Gather：あつまる帯 → 先生の まわりへ。5 秒の あいだは 2 回目を ことわる。
  t.room.send('class:gather', { space: 'main', x: 10, z: 20 });
  assert.equal((await next(aki.room, 'class:incoming')).by, 'Sensei');
  const tp = await next(aki.room, 'teleport', 5000);
  assert.equal(tp.space, 'main');
  assert.ok(Math.hypot(tp.x - 10, tp.z - 20) < 6);
  await sleep(200);
  assert.ok(aki.room.seen.includes('class:arrived'));
  await sleep(1100);
  t.room.send('class:gather', { space: 'main', x: 10, z: 20 });
  assert.match((await next(t.room, 'class:toast')).text, /Wait/);
  await sleep(1100);

  // Move together：全員（先生も）に 5 秒の カウントダウン。15 秒の あいだは 2 回目を ことわる。
  t.room.send('class:move', { to: 'fishworld' });
  const go = await next(aki.room, 'class:goto');
  assert.deepEqual([go.to, go.sec], ['fishworld', 5]);
  await next(t.room, 'class:goto');
  await sleep(1100);
  t.room.send('class:move', { to: 'main' });
  assert.match((await next(t.room, 'class:toast')).text, /Wait/);
  await sleep(1100);
  t.room.send('class:move', { to: 'nowhere' });
  assert.match((await next(t.room, 'class:toast')).text, /Unknown/);
  await sleep(1100);

  // Review weak words：1 人ずつ 自分の 苦手。苦手の ない 子には「No weak words」。クラス結果は 先生へ。
  t.room.send('class:review');
  const [set, empty, started] = await Promise.all([next(aki.room, 'review:start'), next(ben.room, 'review:none'), next(t.room, 'class:reviewStarted')]);
  assert.deepEqual(started, { started: 1, none: 1 });
  assert.equal(set.items.length, 4);
  assert.equal(JSON.stringify(set).includes('river'), true, 'the choices carry the words');
  assert.equal(set.items.some((it) => 'word' in it), false, 'judged on the server');
  assert.equal(empty.mode, 'teacher');
  const order = ['river', 'kitchen', 'library', 'window'];
  const coinsBefore = aki.welcome.wallet.coins;
  let coins = coinsBefore;
  let doneP; let resultP;
  for (let i = 0; i < 4; i += 1) {
    const choice = i === 1 ? set.items[i].options.find((o) => o !== order[i]) : order[i];
    const rP = next(aki.room, 'review:result');
    if (i === 3) { doneP = next(aki.room, 'review:done'); resultP = next(t.room, 'class:result'); }
    aki.room.send('review:answer', { i, choice });
    const r = await rP;
    assert.equal(r.ok, i !== 1);
    assert.equal(r.word, order[i]);
    coins = r.wallet.coins;
  }
  assert.equal(coins - coinsBefore, 9, '+3 coins for each correct answer');
  assert.deepEqual(await doneP, { correct: 3, total: 4 });
  const result = await resultP;
  assert.deepEqual(result, { correct: 3, total: 4, weak: ['kitchen'] });

  // 記録（world=review・level=Review）が 箱を 進めた：正解した 3 つは 3 日後へ、まちがえた kitchen は 明日。
  const r = await (await fetch(`${http}/api/roblox/review/Aki`, { headers: { 'x-uspeak-key': KEY } })).json();
  assert.equal(r.due, 0);
  await aki.room.leave(); await ben.room.leave(); await t.room.leave();
});
