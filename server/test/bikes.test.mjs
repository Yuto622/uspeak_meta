// じてんしゃや（メインの島の 西）：6 台・サーバーが 表の 値段で 買う・コインが 足りないと 買えない・
// もって いない じてんしゃには のれない・のって いる ことが となりの 子に とどく・かばんに 入る・家の 中では おりる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { BIKES, BIKE_BY_ID, RUN_PACE, bikePace } = await import('../../client/dist/bikes-data.js');
const { ITEMS, ITEM_BY_ID } = await import('../../client/dist/fishing-data.js');
const { blankWallet, applyOp, sanitizeWallet } = await import('../src/game/economy.js');
const { sanitizeAvatar } = await import('../src/rooms/ClassRoom.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { matchMaker } = (await import('colyseus')).default;

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
async function join(name) {
  const client = new Client(url);
  const room = await client.joinOrCreate('class', { classCode: 'bike-1', name });
  room.onMessage('*', () => {});
  await nextMessage(room, 'welcome');
  return room;
}
const privOf = (room) => matchMaker.getRoomById(room.roomId).priv.get(room.sessionId);
const avatarOf = (watcher, room) => { try { return JSON.parse(watcher.state.players.get(room.sessionId).avatar); } catch { return null; } };

before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('じてんしゃは 6 台・ぜんぶ 走るより 速い・高い ほど 速い・ITEMS に kind: bike で 入って いる', () => {
  assert.equal(BIKES.length, 6);
  assert.equal(new Set(BIKES.map((b) => b.id)).size, 6);
  for (const b of BIKES) {
    assert.equal(ITEM_BY_ID[b.id]?.kind, 'bike', b.id);
    assert.ok(Number.isInteger(b.price) && b.price > 0 && b.en && b.ja, b.id);
    assert.ok(b.speed >= 1.5 && b.speed <= 2.2, `${b.id} は 走る はやさの 1.5〜2.2 ばい`);
    assert.ok(bikePace(b.id) > RUN_PACE, `${b.id} は 走るより 速い`);
  }
  const byPrice = [...BIKES].sort((a, b) => a.price - b.price);
  for (let i = 1; i < byPrice.length; i += 1) assert.ok(byPrice[i].speed > byPrice[i - 1].speed, '高い ほど 速い');
  assert.deepEqual([byPrice[0].price, byPrice.at(-1).price], [150, 2500]);
  assert.equal(ITEMS.filter((i) => i.kind === 'bike').length, 6);
  // 走る はやさの 数字は game.js と 同じ（dash ? 8 : 5）。
  assert.match(readFileSync(new URL('../../client/dist/game.js', import.meta.url), 'utf8'), /dash\?8:5/);
  assert.equal(RUN_PACE, 8);
});

test('さいふ：表の 値段で 買う・足りないと ことわる・2 回は 買えない・セーブに のこる', () => {
  const w = blankWallet(); w.coins = 400;
  const r = applyOp(w, { type: 'buy', id: 'bike-city', price: 1 });
  assert.equal(r.delta, -350, 'ページの 言う 値段は 使わない');
  assert.deepEqual([w.coins, w.owned], [50, ['bike-city']]);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'bike-gold' }), /not enough coins/);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'bike-city' }), /already owned/);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'bike-rocket' }), /unknown item/);
  assert.deepEqual(sanitizeWallet({ coins: 5, owned: ['bike-city', 'bike-rocket'] }).owned, ['bike-city']);
});

test('姿の 文字：本物の じてんしゃ だけ 通す', () => {
  assert.equal(JSON.parse(sanitizeAvatar({ id: 'kai', bike: 'bike-bmx' })).bike, 'bike-bmx');
  assert.equal(JSON.parse(sanitizeAvatar({ id: 'kai', bike: 'bike-rocket' })).bike, undefined);
  assert.equal(JSON.parse(sanitizeAvatar({ id: 'kai', bike: 7 })).bike, undefined);
});

test('部屋：買う（コインが へる・もちものに 入る）・コインが ないと 買えない・もって いないと のれない・のると となりの 子に とどく', async () => {
  const a = await join('Rider');
  const b = await join('Watcher');
  const wallet = privOf(a).wallet;

  // コインが 足りない：買えない。
  wallet.coins = 100;
  a.send('economy', { op: 'buy', id: 'bike-kids' });
  let m = await nextMessage(a, 'wallet');
  assert.equal(m.ok, false); assert.equal(m.error, 'not enough coins');
  assert.equal(m.wallet.coins, 100); assert.ok(!m.wallet.owned.includes('bike-kids'));

  // もって いない じてんしゃには のれない（となりの 子にも 出ない）。
  a.send('bike:ride', { id: 'bike-kids' });
  assert.equal((await nextMessage(a, 'bike:error')).reason, 'not yours');
  a.send('bike:ride', { id: 'bike-rocket' });
  assert.equal((await nextMessage(a, 'bike:error')).reason, 'unknown bike');
  // ページが 姿の 文字に 入れて 送っても 部屋は 上書きする。
  a.send('profile', { avatar: { id: 'mia', bike: 'bike-gold' } });
  await sleep(250);
  assert.equal(avatarOf(b, a)?.bike, undefined, 'じてんしゃは 部屋が 決める');
  assert.equal(avatarOf(b, a)?.id, 'mia');

  // 買う：表の 値段ぶん へって、もちものに 入る。
  wallet.coins = 500;
  a.send('economy', { op: 'buy', id: 'bike-kids' });
  m = await nextMessage(a, 'wallet');
  assert.equal(m.ok, true);
  assert.equal(m.wallet.coins, 500 - BIKE_BY_ID['bike-kids'].price);
  assert.ok(m.wallet.owned.includes('bike-kids'));
  a.send('bag:get', {});
  const bag = await nextMessage(a, 'bag:state');
  assert.deepEqual(bag.bikes.map((x) => [x.id, x.en, x.speed, x.riding]), [['bike-kids', "Kids' Bike", 1.5, false]]);

  // のる：となりの 子の 画面の 姿の 文字に じてんしゃが 入る。
  a.send('move', { s: 'main', x: -80, z: -60, r: 0, a: 'idle', t: 1 });
  a.send('bike:ride', { id: 'bike-kids' });
  assert.equal((await nextMessage(a, 'bike:on')).id, 'bike-kids');
  await waitFor(() => avatarOf(b, a)?.bike === 'bike-kids');
  a.send('bag:get', {});
  assert.equal((await nextMessage(a, 'bag:state')).bikes[0].riding, true);
  // すがたを かえても のった まま（部屋の 記録）。
  a.send('profile', { avatar: { id: 'kai' } });
  await waitFor(() => avatarOf(b, a)?.id === 'kai');
  assert.equal(avatarOf(b, a).bike, 'bike-kids');
  // まだ 買って いない 速い じてんしゃには のりかえられない。
  a.send('bike:ride', { id: 'bike-gold' });
  assert.equal((await nextMessage(a, 'bike:error')).reason, 'not yours');
  assert.equal(avatarOf(b, a).bike, 'bike-kids');

  // おりる。
  a.send('bike:ride', { id: '' });
  assert.equal((await nextMessage(a, 'bike:on')).id, '');
  await waitFor(() => avatarOf(b, a) && !avatarOf(b, a).bike);

  // 家の 中に 入ると 部屋が おろす・中では のれない。
  a.send('bike:ride', { id: 'bike-kids' });
  await nextMessage(a, 'bike:on');
  await waitFor(() => avatarOf(b, a)?.bike === 'bike-kids');
  const off = nextMessage(a, 'bike:on');
  a.send('move', { s: 'in:main:phones', x: 0, z: 0, r: 0, a: 'idle', t: 2 });
  assert.equal((await off).id, '');
  await waitFor(() => avatarOf(b, a) && !avatarOf(b, a).bike);
  a.send('bike:ride', { id: 'bike-kids' });
  assert.equal((await nextMessage(a, 'bike:error')).reason, 'indoors');

  // あとから 入って きた 子にも、のって いる 子は のって 見える。
  a.send('move', { s: 'main', x: -80, z: -60, r: 0, a: 'idle', t: 3 });
  a.send('bike:ride', { id: 'bike-kids' });
  await nextMessage(a, 'bike:on');
  const c = await join('Late');
  await waitFor(() => avatarOf(c, a)?.bike === 'bike-kids');
  await Promise.all([a.leave(), b.leave(), c.leave()]);
});

test('メインの島：じてんしゃやの 場所・大通りが とどく・土地の 中', () => {
  const j = JSON.parse(readFileSync(new URL('../../client/dist/main_island.json', import.meta.url), 'utf8')).island;
  const s = j.spots.find((x) => x.id === 'bike_shop');
  assert.ok(s && s.kind === 'bike_shop' && s.en === 'Bike Shop' && s.ja === 'じてんしゃや');
  for (const o of j.spots) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) >= 10, `${o.id} と 10 より はなれて いる`);
  const road = j.roads[0];
  assert.ok(road.x0 <= s.path.x - 2 && Math.abs(road.z - s.path.z) < 0.01, '大通りが お店の 前まで');
  const plaza = readFileSync(new URL('../../client/dist/main-plaza.js', import.meta.url), 'utf8');
  const m = /\{ x0: (-\d+), x1: (-\d+), z0: (-?\d+), z1: (\d+), r: \d+ \}\] \}/.exec(plaza);
  assert.ok(m, '西の 土地（annex.also の 2 つめ）');
  const [x0, x1, z0, z1] = m.slice(1).map(Number);
  const hz = s.z - 1.1 - s.d / 2;
  assert.ok(s.x - s.w / 2 > x0 + 3 && s.x + s.w / 2 < x1 && hz - s.d / 2 > z0 + 3 && s.z < z1, '建物が 土地の 中');
  assert.ok(road.x0 > x0 + 2, '道は 土地の 中');
});
