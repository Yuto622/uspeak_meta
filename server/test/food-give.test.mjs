// 住民に たべものを あげる（なかよし）— 1 こ へる・点が ふえる・すきな たべもの・持っていない・はやすぎ・1 日 3 回・上限・古い 保存。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { ITEMS, HEARTS_MAX, POINTS_PER_HEART, FRIEND_CAP, GIFTS_PER_DAY, GIFT_GAP_MS, blankFood, sanitizeFood, forSave, give, favouriteOf, friendKey, foodPayload, FoodError } = await import('../src/game/food.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

const T = Date.UTC(2026, 10, 26, 3, 0, 0);   // 日本の 昼
const DAY = 86_400_000;
const KEY = friendKey('farm', 'mia');
const FAV = favouriteOf(KEY);
const OTHER = [...ITEMS.keys()].find((id) => id !== FAV);

test('あげると 1 こ へって 1 点、すきな たべものは 2 点。❤ は 3 点で 1 こ', () => {
  const f = sanitizeFood({ bag: { [FAV]: 2, [OTHER]: 3 } });
  const a = give(f, 'farm', 'mia', OTHER, T);
  assert.equal(a.key, 'farm:mia');
  assert.deepEqual([a.points, a.gained, a.hearts, a.favourite, a.left], [1, 1, 0, false, GIFTS_PER_DAY - 1]);
  assert.equal(f.bag[OTHER], 2, 'one is taken from the bag');
  const b = give(f, 'farm', 'mia', FAV, T + GIFT_GAP_MS);
  assert.deepEqual([b.points, b.gained, b.hearts, b.favourite, b.heartUp], [3, 2, 1, true, true], 'the favourite is worth one more');
  assert.equal(POINTS_PER_HEART, 3);
  const pay = foodPayload(f, T + GIFT_GAP_MS);
  assert.deepEqual(pay.friends['farm:mia'], { points: 3, hearts: 1, left: 1, favourite: FAV }, 'the favourite is told once it has been found');
  assert.equal(pay.friendRules.max, HEARTS_MAX);
  assert.equal(favouriteOf(KEY), FAV, 'the favourite never changes');
  assert.ok(ITEMS.has(favouriteOf('school:library')));
});

test('持っていない・知らない たべもの・へんな 名前は ことわる（かばんは そのまま）', () => {
  const f = sanitizeFood({ bag: { apple: 1 } });
  assert.throws(() => give(f, 'farm', 'mia', 'cake', T), /none left/);
  assert.throws(() => give(f, 'farm', 'mia', 'sushi', T), /no such food/);
  assert.throws(() => give(f, 'farm', '../x', 'apple', T), /no such villager/);
  assert.throws(() => give(f, 'FARM', 'mia', 'apple', T), /no such villager/);
  assert.throws(() => give(f, 'farm', 'a'.repeat(41), 'apple', T), /no such villager/);
  assert.throws(() => give(f, undefined, { toString: () => 'mia' }, 'apple', T), FoodError);
  assert.deepEqual(f.bag, { apple: 1 });
  assert.deepEqual(f.friends, {});
});

test('1 秒に 1 回、1 人に 1 日 3 回まで。つぎの 日は また あげられる', () => {
  const f = sanitizeFood({ bag: { [OTHER]: 9 } });
  give(f, 'farm', 'mia', OTHER, T);
  assert.throws(() => give(f, 'farm', 'mia', OTHER, T + GIFT_GAP_MS - 1), /too fast/);
  assert.throws(() => give(f, 'farm', 'taro', OTHER, T + GIFT_GAP_MS - 1), /too fast/, 'the gap is per child, not per villager');
  give(f, 'farm', 'mia', OTHER, T + 2000);
  give(f, 'farm', 'mia', OTHER, T + 4000);
  assert.throws(() => give(f, 'farm', 'mia', OTHER, T + 6000), /enough today/);
  assert.equal(f.bag[OTHER], 6, 'a refused gift costs nothing');
  give(f, 'farm', 'taro', OTHER, T + 8000);
  assert.equal(foodPayload(f, T + 9000).friends['farm:mia'].left, 0);
  assert.equal(foodPayload(f, T + DAY).friends['farm:mia'].left, GIFTS_PER_DAY);
  assert.equal(give(f, 'farm', 'mia', OTHER, T + DAY).points, 4);
});

test('❤ 10 こ（30 点）で とまる。いっぱいの 住民には もう へらない', () => {
  const f = sanitizeFood({ bag: { [FAV]: 2 }, friends: { 'farm:mia': { p: FRIEND_CAP - 1, d: '2026-01-01', n: 3 } } });
  const out = give(f, 'farm', 'mia', FAV, T);
  assert.deepEqual([out.points, out.gained, out.hearts], [FRIEND_CAP, 1, HEARTS_MAX], 'the bonus cannot pass the cap');
  assert.throws(() => give(f, 'farm', 'mia', FAV, T + 5000), /best friends/);
  assert.equal(f.bag[FAV], 1);
});

test('古い 保存（friends なし）も 読める。こわれた 中身は すてる。保存して 読みなおしても 同じ', () => {
  assert.deepEqual(sanitizeFood({ h: 7, bag: { apple: 1 } }).friends, {});
  assert.deepEqual(sanitizeFood(null).friends, {});
  assert.deepEqual(blankFood().friends, {});
  const dirty = sanitizeFood({ bag: {}, friends: { 'farm:mia': { p: 999, d: 'x', n: 99, f: true }, 'bad key': { p: 3 }, 'farm:taro': 'nope', 'farm:zack': { p: -4 } } });
  assert.deepEqual(dirty.friends, { 'farm:mia': { p: FRIEND_CAP, d: '', n: GIFTS_PER_DAY, f: 1 } });
  const f = sanitizeFood({ bag: { [FAV]: 1 } });
  give(f, 'farm', 'mia', FAV, T);
  const back = sanitizeFood(JSON.parse(JSON.stringify(forSave(f, T))));
  assert.deepEqual(back.friends, { 'farm:mia': { p: 2, d: '2026-11-26', n: 1, f: 1 } });
  assert.equal(back.gaveAt, undefined, 'the one-second gap is not saved');
});

let server; let url;
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋: food:give → food:gave（かばんが へる・コインは うごかない）、だめなら food:give:error。入りなおしても のこる', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'give1', name: 'Kai' });
  const welcome = await nextMessage(room, 'welcome');
  assert.deepEqual(welcome.food.friends, {}, 'a new child has no friends yet');
  room.onMessage('*', () => {});
  room.send('food:give', { island: 'farm', spot: 'mia', id: 'cake' });
  assert.equal((await nextMessage(room, 'food:give:error')).reason, 'none left');
  room.send('food:give', { island: 'farm', spot: 'mia; drop', id: 'apple' });
  assert.equal((await nextMessage(room, 'food:give:error')).reason, 'no such villager');
  room.send('food:give', { island: 'farm', spot: 'mia', id: 'apple' });
  const gave = await nextMessage(room, 'food:gave');
  const want = favouriteOf('farm:mia') === 'apple' ? 2 : 1;
  assert.deepEqual([gave.ok, gave.key, gave.id, gave.points, gave.hearts, gave.max], [true, 'farm:mia', 'apple', want, 0, HEARTS_MAX]);
  assert.deepEqual(gave.bag.map((b) => [b.id, b.n]), [['apple', 1]], 'two to start with, one given');
  assert.equal(gave.friends['farm:mia'].points, want);
  assert.equal(gave.wallet, undefined, 'no coins move');
  room.send('food:give', { island: 'farm', spot: 'mia', id: 'apple' });
  assert.equal((await nextMessage(room, 'food:give:error')).reason, 'too fast');
  room.send('bag:get', {});
  assert.equal((await nextMessage(room, 'bag:state')).food.friends['farm:mia'].points, want);
  const token = room.reconnectionToken;
  await room.leave();
  assert.ok(token);
  const again = await new Client(url).joinOrCreate('class', { classCode: 'give1', name: 'Kai' });
  const w2 = await nextMessage(again, 'welcome');
  assert.equal(w2.food.friends['farm:mia'].points, want, 'saved in food_json');
  assert.equal(w2.wallet.coins, welcome.wallet.coins);
  await again.leave();
});

// ---- いえに よんで もらう（❤ 3 こから）----
test('いえ: ❤ が たりないと ことわる・たりると 入れる・表に invited が のる・1 秒に 1 回', async () => {
  const { INVITE_HEARTS, visitHome } = await import('../src/game/food.js');
  assert.equal(INVITE_HEARTS, 3);
  const need = INVITE_HEARTS * POINTS_PER_HEART;
  const f = sanitizeFood({ bag: {}, friends: { 'farm:mia': { p: need - 1, d: '', n: 0 }, 'farm:taro': { p: need, d: '', n: 0 } } });
  assert.throws(() => visitHome(f, 'farm:mia', T), /not friends yet/);
  assert.throws(() => visitHome(f, 'farm:taro', T + 10), /too fast/);
  assert.deepEqual(visitHome(f, 'farm:taro', T + 2000), { key: 'farm:taro', hearts: INVITE_HEARTS });
  assert.throws(() => visitHome(f, 'farm:nobody', T + 4000), /not friends yet/);
  assert.throws(() => visitHome(f, 'bad key', T + 6000), /no such villager/);
  assert.throws(() => visitHome(f, { toString: () => 'farm:taro' }, T + 8000), /no such villager/);
  const pay = foodPayload(f, T);
  assert.equal(pay.friends['farm:mia'].invited, undefined, 'one point short: no invitation');
  assert.equal(pay.friends['farm:taro'].invited, true);
  assert.equal(pay.friendRules.invite, INVITE_HEARTS);
  assert.equal(forSave(f, T).visitAt, undefined, 'the one-second gap is not saved');
});

test('部屋: home:visit → なかよしで なければ home:visit:error、❤ 3 こで home:visit:ok（コインは うごかない）', async () => {
  const { matchMaker } = (await import('colyseus')).default || (await import('colyseus'));
  const room = await new Client(url).joinOrCreate('class', { classCode: 'home1', name: 'Kai' });
  const welcome = await nextMessage(room, 'welcome');
  room.onMessage('*', () => {});
  room.send('home:visit', { key: 'farm:mia' });
  assert.deepEqual(await nextMessage(room, 'home:visit:error'), { key: 'farm:mia', reason: 'not friends yet' });
  // ❤ 3 こ ぶんの 点を 部屋の 中の 記録に 入れる（1 日 3 回の きまりは ゆるめない）。
  const live = matchMaker.getRoomById(room.roomId) || matchMaker.getLocalRoomById?.(room.roomId);
  const priv = live.priv.get(room.sessionId);
  priv.food.friends['farm:mia'] = { p: 9, d: '', n: 0 };
  priv.food.visitAt = 0;
  room.send('home:visit', { key: 'farm:mia' });
  assert.deepEqual(await nextMessage(room, 'home:visit:ok'), { key: 'farm:mia', hearts: 3 });
  room.send('home:visit', { key: 'farm:mia' });
  assert.equal((await nextMessage(room, 'home:visit:error')).reason, 'too fast');
  room.send('bag:get', {});
  const bag = await nextMessage(room, 'bag:state');
  assert.equal(bag.food.friends['farm:mia'].invited, true);
  assert.equal(bag.wallet?.coins ?? welcome.wallet.coins, welcome.wallet.coins, 'no coins move');
  await room.leave();
});
