// 部屋の セキュリティの みなおし（2026-11）— 実ソケット。
// - 上限の なかった コインの 口（ことばの 答え など）に 1 日の 上限、入りなおしても もどらない
// - AI の 1 日の 回数は 入りなおしても もどらない
// - 苦手の 復習の コインにも 1 日の 上限（わざと まちがえて 箱を ふやす ループを 止める）
// - 位置の 名前は id の 文字だけ・メッセージの あふれは 入口で すてる・ping は 数だけ かえす
// - 大文字の クラスコードで 2 つ目の 部屋を 作らせない
// - 通話の 合図の 回数は 5 秒ごとに もどる（前は 通話の 時計と まざって もどらなかった）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.USPEAK_ROBLOX_KEY = 'roblox-test-key-0123456789abcdef-XYZ';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.CHAT_MIN_INTERVAL_MS = '0';
process.env.AI_MIN_INTERVAL_MS = '0';
process.env.AI_DAILY_TURNS_PER_STUDENT = '2';
process.env.PRACTICE_COIN_CAP = '30';
process.env.REVIEW_COIN_CAP = '6';
process.env.PHRASE_XP_CAP = '3';
process.env.MSG_RATE_PER_SEC = '20';
process.env.MSG_BURST = '60';
process.env.PREMIUM_ISLANDS = '';
process.env.CALLS_NEED_TEACHER = 'off';
process.env.RECONNECT_GRACE_SEC = '5';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { CONV } = await import('../src/game/conv.js');
const { PHRASE_IDS } = await import('../src/phrases.js');
const KEY = process.env.USPEAK_ROBLOX_KEY;

let server; let url; let http;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const next = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (name, classCode = 'sec', extra = {}) => {
  const room = await new Client(url).joinOrCreate('class', { classCode, name, ...extra });
  const welcome = await next(room, 'welcome');
  return { room, welcome };
};
const settle = () => sleep(150);

before(async () => {
  server = await startServer({ port: 0 });
  const addr = server.server.address();
  url = `ws://127.0.0.1:${addr.port}`;
  http = `http://127.0.0.1:${addr.port}`;
});
after(async () => { await server.shutdown('test'); });

test('ことばの 答えの コインは 1 日の 上限まで（XP は つづく）・入りなおしても もどらない', async () => {
  const a = await join('Cap');
  const start = a.welcome.wallet.coins;
  let last = null;
  for (let i = 0; i < 6; i += 1) {
    const r = next(a.room, 'answer:result');
    a.room.send('answer', { q: 'word:fish-1:meaning', c: 'fish-1' });
    last = await r;
    assert.equal(last.correct, true);
    assert.equal(last.xp > 0, true, 'XP is still paid past the cap');
  }
  // 10 コイン × 6 問 ＝ 60 だが、上限は 30。
  assert.equal(last.progress.total > 0, true);
  const w = await (async () => { const p = next(a.room, 'wallet'); a.room.send('wallet:get'); return p; })();
  assert.equal(w.wallet.coins - start, 30);
  await a.room.leave(true);
  await settle();
  const b = await join('Cap');
  const before = b.welcome.wallet.coins;
  const r = next(b.room, 'answer:result');
  b.room.send('answer', { q: 'word:fish-1:meaning', c: 'fish-1' });
  await r;
  const p = next(b.room, 'wallet'); b.room.send('wallet:get');
  assert.equal((await p).wallet.coins, before, 'leaving and joining again does not refill the day');
  await b.room.leave(true);
});

test('AI の 1 日の 回数は 入りなおしても もどらない', async () => {
  const topic = [...CONV.topicById.values()].find((t) => !t.free);
  const house = CONV.spotById.get(topic.spot);
  const space = `in:${(house.home || CONV.island).id}:${house.id}`;
  const talk = async (who) => {
    who.room.send('move', { s: space, x: 0, z: 0 });
    who.room.send('conv:start', { topic: topic.id });
    await next(who.room, 'conv:opened');
  };
  const a = await join('Talker');
  await talk(a);
  for (let i = 0; i < 2; i += 1) {
    const r = next(a.room, 'conv:reply');
    a.room.send('conv:say', { text: `Hello, I would like some juice ${i}` });
    await r;
  }
  let e = next(a.room, 'conv:error');
  a.room.send('conv:say', { text: 'One more please' });
  assert.equal((await e).reason, 'daily limit');
  await a.room.leave(true);
  await settle();
  const b = await join('Talker');
  await talk(b);
  e = next(b.room, 'conv:error');
  b.room.send('conv:say', { text: 'Hello again' });
  assert.equal((await e).reason, 'daily limit', 'a new seat is not a new day');
  await b.room.leave(true);
});

test('苦手の 復習（ぜんぶの ことば）の コインは 1 日の 上限まで', async () => {
  // Roblox で まちがえた 4 語（箱に 入る）。ぜんぶの ことばの 復習で 正解すると 1 語 3 コイン・上限 6。
  const ts = Date.now() - 2 * 86400000;
  const res = await fetch(`${http}/api/roblox/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-uspeak-key': KEY }, body: JSON.stringify({ events: ['river', 'kitchen', 'library', 'window'].map((w, i) => ({ id: `sec-${w}`, ts: ts + i, type: 'quiz', username: 'Revi', classCode: 'sec', data: { word: w, correct: false, level: 'Easy' } })) }) });
  assert.equal(res.status, 200);
  const a = await join('Revi');
  const start = a.welcome.wallet.coins;
  const s = next(a.room, 'review:start');
  a.room.send('review:start', { all: true });
  const set = await s;
  const words = ['river', 'kitchen', 'library', 'window'];
  let coins = 0; let capped = 0; let wallet = start;
  for (let i = 0; i < set.items.length; i += 1) {
    const r = next(a.room, 'review:result');
    a.room.send('review:answer', { i, choice: set.items[i].say });
    const out = await r;
    assert.equal(out.ok, true);
    coins += out.coins;
    if (out.capped) capped += 1;
    wallet = out.wallet.coins;
    if (!words.includes(out.word)) assert.equal(out.coins, 0);
  }
  assert.equal(coins, 6);
  assert.equal(wallet - start, 6);
  assert.equal(capped, 2);
  await a.room.leave(true);
});

test('位置の 名前は id の 文字だけ・ping は 数だけ・あふれた メッセージは すてる', async () => {
  const a = await join('Mover');
  const b = await join('Watcher');
  a.room.send('move', { s: 'main', x: 1, z: 2 });
  await sleep(200);
  a.room.send('move', { s: '<img src=x onerror=alert(1)>', x: 3, z: 4 });
  await sleep(300);
  const seen = b.room.state.players.get(a.room.sessionId);
  assert.equal(seen.space, 'main', 'a space that is not an id is ignored');
  assert.equal(Math.round(seen.x), 3);
  const pong = next(a.room, 'pong');
  a.room.send('ping', { evil: 'x'.repeat(1000) });
  assert.equal((await pong).t, 0);
  // 1 秒に 20・まとめて 60 まで。200 こ 送っても とどくのは だいたい 60 こ。
  let pongs = 0;
  const off = a.room.onMessage('pong', () => { pongs += 1; });
  for (let i = 0; i < 200; i += 1) a.room.send('ping', i);
  await sleep(600);
  off();
  assert.ok(pongs >= 40 && pongs < 120, `flood dropped (${pongs} answered)`);
  // しばらく まてば また とどく。
  await sleep(1200);
  const again = next(a.room, 'pong');
  a.room.send('ping', 7);
  assert.equal((await again).t, 7);
  await Promise.all([a.room.leave(true), b.room.leave(true)]);
});

test('大文字の クラスコードでは 2 つ目の 部屋を 作らない（同じ 記録を 2 つの 部屋で 書かない）', async () => {
  const a = await join('Lower', 'case-room');
  await assert.rejects(() => new Client(url).joinOrCreate('class', { classCode: 'CASE-ROOM', name: 'Upper' }), /spelled differently|4009/);
  await a.room.leave(true);
});

test('通話の 合図は 5 秒ごとに 数えなおす（長い 通話でも 120 で 止まらない）', async () => {
  const a = await join('Rtc1');
  const b = await join('Rtc2');
  for (const x of [a, b]) x.room.send('move', { s: 'in:main:books', x: 0, z: 0 });
  await sleep(200);
  a.room.send('voice:join'); await next(a.room, 'voice:room');
  b.room.send('voice:join'); await next(b.room, 'voice:room');
  let got = 0;
  b.room.onMessage('rtc:signal', () => { got += 1; });
  const burst = async (n) => { for (let i = 0; i < n; i += 1) { a.room.send('rtc:signal', { to: b.room.sessionId, kind: 'ice', data: 'c' }); if (i % 15 === 14) await sleep(800); } };
  for (let round = 0; round < 3; round += 1) { await burst(45); await sleep(5300); }
  // 部屋の 入口の あふれの 守り（20/秒）に かからない ように ゆっくり 送った。5 秒ごとには 45 なので 上限（5 秒に 120）に とどかない。
  // 前は 数が もどらず、通話の 中の 121 こ目から ずっと「too fast」だった。
  assert.equal(got, 135);
  await Promise.all([a.room.leave(true), b.room.leave(true)]);
});

test('年度またぎ：前の クラスの 名前は 記録の 形に そろえる', async () => {
  const t = await join('Sensei', 'sec', { teacherKey: 'testkey12345' });
  const ack = next(t.room, 'teacher:ack');
  t.room.send('teacher', { cmd: 'carryover', from: '  Old Class!  ', names: ['<b>Nobody</b>', 'Nobody'] });
  const out = await ack;
  assert.equal(out.ok, true);
  assert.equal(out.from, 'oldclass');
  assert.deepEqual(out.skipped.map((s) => s.name), ['bNobodyb', 'Nobody']);
  await t.room.leave(true);
});

test('定型文の XP は 1 日 PHRASE_XP_CAP まで（チャットは そのまま とどく）', async () => {
  const a = await join('Tapper');
  const id = [...PHRASE_IDS][0];
  let first = null; let last = null;
  for (let i = 0; i < 6; i += 1) {
    const x = next(a.room, 'xp');
    a.room.send('chat', { id });
    last = await x;
    if (!first) first = last;
  }
  assert.equal(last.total - first.total, 2, 'three taps pay, the rest do not');
  assert.equal(last.chats - first.chats, 5, 'the phrases are still counted and sent');
  await a.room.leave(true);
});
