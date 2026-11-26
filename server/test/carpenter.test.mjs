// 大工さんの 増築を 本物の ソケットで：たのむ → コインが へる → 工事中 → 1 日（ここでは 1 秒）→ 大きい へや。
// きまり そのものは town.test.mjs。ここは 部屋（ClassRoom）が 場所・コイン・保存・しらせを ただしく あつかうか。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.TASKS = 'off';
process.env.PREMIUM_ISLANDS = '';
process.env.BUILD_DAY_SEC = '1';          // 工事の 1 日を 1 秒に（ふだんは 世界の 時計の ひとまわり）

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const colyseus = await import('colyseus');
const matchMaker = (colyseus.default || colyseus).matchMaker || colyseus.matchMaker;
const { ROOMS, MAIN_HOME, TOWN_ISLAND, BUILD_MS } = await import('../src/game/town.js');

let server, url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
async function join(name) {
  const client = new Client(url);
  const room = await client.joinOrCreate('class', { classCode: 'carp-1', name });
  room.onMessage('*', () => {});
  const welcome = await nextMessage(room, 'welcome');
  return { client, room, welcome };
}
const live = async () => matchMaker.getRoomById((await matchMaker.query({}))[0].roomId);
const privOf = async (room) => (await live()).priv.get(room.sessionId);
const stand = async (room, x, z, space) => {
  room.send('move', { s: space, x, z, r: 0, a: 'idle', t: 1 });
  await waitFor(() => { const p = room.state.players.get(room.sessionId); return p && Math.abs(p.x - x) < 0.01 && p.space === space; });
};

before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('the carpenter beside the house: order, wait a day, and the room is bigger with everything still in it', async () => {
  assert.equal(BUILD_MS, 1000);
  assert.ok(MAIN_HOME, 'the main island has the house');
  const a = await join('Daiku');
  const home = MAIN_HOME.spot;
  const main = MAIN_HOME.island.id;

  // どこからでも 聞ける。はじめは ワンルーム・工事なし。
  a.room.send('build:peek', {});
  let st = await nextMessage(a.room, 'build:state');
  assert.equal(st.tier, 1);
  assert.equal(st.build, null);
  assert.equal(st.finished, undefined);
  assert.deepEqual(st.rooms.map((r) => r.id), ROOMS.map((r) => r.id));
  assert.equal(st.dayMs, 1000);

  // 遠くからは たのめない。
  await stand(a.room, home.wx + 60, home.wz, main);
  a.room.send('build:order', { tier: 2 });
  assert.equal((await nextMessage(a.room, 'build:error')).reason, 'too far');

  // 大工さんの そば（いえの 東 6）。コインが たりない。
  await stand(a.room, home.wx + 6, home.wz + 0.5, main);
  const priv = await privOf(a.room);
  priv.wallet.coins = ROOMS[1].price - 1;
  a.room.send('build:order', { tier: 2 });
  let err = await nextMessage(a.room, 'build:error');
  assert.equal(err.reason, 'not enough coins');
  assert.equal(err.need, ROOMS[1].price);
  assert.equal(priv.wallet.coins, ROOMS[1].price - 1, 'and nothing was taken');

  // とばせない。
  priv.wallet.coins = 50000;
  a.room.send('build:order', { tier: 3 });
  assert.equal((await nextMessage(a.room, 'build:error')).reason, 'one step at a time');
  assert.equal(priv.wallet.coins, 50000);

  // たのむ：コインが へり、1 日 先に できあがる。
  const furnitureBefore = JSON.parse(JSON.stringify(priv.room.furniture));
  assert.ok(furnitureBefore.length >= 5, 'the starter set is in the room');
  const t0 = Date.now();
  a.room.send('build:order', { tier: 2 });
  st = await nextMessage(a.room, 'build:state');
  assert.equal(st.ordered, 2);
  assert.equal(st.tier, 1, 'still the old size');
  assert.equal(st.build.tier, 2);
  assert.ok(st.build.left > 0 && st.build.left <= 1000);
  assert.equal(st.wallet.coins, 50000 - ROOMS[1].price);
  assert.equal(priv.wallet.coins, 50000 - ROOMS[1].price);
  assert.ok(priv.room.build.doneAt >= t0 + 1000 && priv.room.build.doneAt <= Date.now() + 1000, 'one day ahead');

  // 工事中は もう 1 つ たのめない（コインも うごかない）。
  a.room.send('build:order', { tier: 2 });
  assert.equal((await nextMessage(a.room, 'build:error')).reason, 'already building');
  a.room.send('build:order', { tier: 3 });
  assert.equal((await nextMessage(a.room, 'build:error')).reason, 'already building');
  assert.equal(priv.wallet.coins, 50000 - ROOMS[1].price);

  // 工事中も へやは 使える（前の 大きさ）。
  await stand(a.room, home.wx, home.wz, main);
  a.room.send('room:enter', {});
  let roomState = await nextMessage(a.room, 'room:state');
  if (roomState.tier === 1) assert.equal(roomState.grid, ROOMS[0].grid);

  // 1 日 たった：つぎに 聞いた ときに 大きく なって いて、しらせは 1 回だけ。
  await sleep(1100);
  a.room.send('build:peek', {});
  st = await nextMessage(a.room, 'build:state');
  assert.equal(st.tier, 2);
  assert.equal(st.build, null);
  assert.equal(st.finished, 2);
  assert.equal(st.room.grid, ROOMS[1].grid);
  assert.deepEqual(st.room.furniture, furnitureBefore, 'nothing moved');
  a.room.send('build:peek', {});
  st = await nextMessage(a.room, 'build:state');
  assert.equal(st.finished, undefined);
  a.room.send('room:enter', {});
  roomState = await nextMessage(a.room, 'room:state');
  assert.equal(roomState.tier, 2);
  assert.equal(roomState.cap, ROOMS[1].props);
  assert.deepEqual(roomState.furniture, furnitureBefore);

  // まちづくり島の ふどうさんでも 同じ たのみかた・同じ 値段（room:move は 前の ボタン）。
  const agent = TOWN_ISLAND.spotById.get('agent');
  await stand(a.room, agent.wx, agent.wz, TOWN_ISLAND.id);
  const coins = priv.wallet.coins;
  a.room.send('room:move', {});
  st = await nextMessage(a.room, 'build:state');
  assert.equal(st.ordered, 3);
  assert.equal(st.wallet.coins, coins - ROOMS[2].price);

  // 工事中に 出て、おわった あとに もどる：へやは 大きく、入った ときに しらせが 来る。
  await a.room.leave();
  await sleep(1300);
  const b = await join('Daiku');
  b.room.send('build:peek', {});
  st = await nextMessage(b.room, 'build:state');
  assert.equal(st.tier, 3);
  assert.equal(st.finished, 3, 'told the next time they are online');
  assert.deepEqual(st.room.furniture, furnitureBefore);
  assert.equal(st.coins, coins - ROOMS[2].price);

  // へやに 入った ときにも おわって いれば 大きく なり、しらせ（build:state の finished）が いっしょに 来る。
  await stand(b.room, home.wx + 6, home.wz + 0.5, main);
  b.room.send('build:order', { tier: 4 });
  st = await nextMessage(b.room, 'build:state');
  assert.equal(st.ordered, 4);
  await sleep(1100);
  await stand(b.room, home.wx, home.wz, main);
  const told = nextMessage(b.room, 'build:state');
  b.room.send('room:enter', {});
  roomState = await nextMessage(b.room, 'room:state');
  assert.equal(roomState.tier, 4);
  assert.equal(roomState.grid, ROOMS[3].grid);
  assert.deepEqual(roomState.furniture, furnitureBefore);
  st = await told;
  assert.equal(st.finished, 4, 'told on walking in');
  await b.room.leave();
  await sleep(100);
});
