// おなかと 屋台 — へりかた・とまりかた・たべる・買う（本物の部屋で：屋台の前でしか買えない、コインは部屋が取る）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { MAX, RATE_MS, SHOPS, STALLS, blankFood, sanitizeFood, hungerNow, pause, resume, eat, buy, addToBag, forSave, FoodError } = await import('../src/game/food.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

test('おなかは つながっている間だけ へり、0 で とまる', () => {
  const f = blankFood();
  const T = 1_700_000_000_000;
  assert.equal(hungerNow(f, T), MAX, 'not connected: it does not go down');
  resume(f, T);
  assert.equal(hungerNow(f, T + RATE_MS * 5), MAX - 5);
  pause(f, T + RATE_MS * 5);
  assert.equal(hungerNow(f, T + RATE_MS * 500), MAX - 5, 'paused while away');
  resume(f, T + RATE_MS * 500);
  assert.equal(hungerNow(f, T + RATE_MS * 600), 0, 'never below zero');
  assert.deepEqual(sanitizeFood(forSave(f, T + RATE_MS * 600)), { h: 0, at: 0, bag: {} });
});

test('たべると ふえる（満タンまで）、かばんから へる、ないものは たべられない', () => {
  const f = sanitizeFood({ h: 4, bag: { cake: 1, apple: 2, nope: 3 } });
  assert.deepEqual(f.bag, { cake: 1, apple: 2 }, 'unknown food is dropped');
  const out = eat(f, 'cake', 0);
  assert.equal(out.after, 4 + SHOPS.sweets.items.find((i) => i.id === 'cake').fill);
  assert.equal(f.bag.cake, undefined);
  assert.throws(() => eat(f, 'cake'), FoodError);
  f.h = MAX;
  assert.throws(() => eat(f, 'apple'), /full/);
  assert.throws(() => buy(f, 'fruit', 'cake', 99), /not sold here/, 'each stall sells its own');
  assert.throws(() => buy(f, 'fruit', 'watermelon', 1), /not enough coins/);
  for (let i = 0; i < 20; i += 1) addToBag(f, 'apple');
  assert.throws(() => buy(f, 'fruit', 'apple', 99), /bag full/);
});

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('屋台: 前に立たないと 買えない、部屋が コインを取って かばんへ、どこでも たべられる', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'food1', name: 'Kai' });
  const welcome = await nextMessage(room, 'welcome');
  assert.equal(welcome.food.hunger, MAX);
  assert.ok(welcome.food.rateMs > 0, 'it goes down while connected');
  room.send('food:open', { shop: 'fruit' });
  assert.equal((await nextMessage(room, 'food:error')).reason, 'too far');
  room.send('food:buy', { shop: 'fruit', id: 'apple' });
  assert.equal((await nextMessage(room, 'food:error')).reason, 'too far');

  const st = STALLS.stalls.get('fruit');
  room.send('move', { s: STALLS.island.id, x: st.wx, z: st.wz, r: 0, a: 'idle', t: 1 });
  await waitFor(() => { const p = room.state.players.get(room.sessionId); return Math.abs(p.x - st.wx) < 0.01 && p.space === STALLS.island.id; });
  room.send('food:open', { shop: 'fruit' });
  const menu = await nextMessage(room, 'food:menu');
  assert.deepEqual(menu.items.map((i) => i.id), ['apple', 'banana', 'watermelon']);
  room.send('food:buy', { shop: 'fruit', id: 'apple' });
  const bought = await nextMessage(room, 'food:bought');
  assert.equal(bought.wallet.coins, welcome.wallet.coins - 6);
  assert.deepEqual(bought.bag.map((b) => [b.id, b.n]), [['apple', 1]]);
  room.send('food:buy', { shop: 'sweets', id: 'cake' });
  assert.equal((await nextMessage(room, 'food:error')).reason, 'too far', 'the sweets stall is somewhere else');

  room.send('food:eat', { id: 'apple' });
  assert.equal((await nextMessage(room, 'food:error')).reason, 'full', 'a full child cannot eat');
  await room.leave();
});
