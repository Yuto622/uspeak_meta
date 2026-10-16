// テーマパークの のりもの：のる たびに U-Speak コイン。はらうのは 部屋、値段は park-rides.json。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { RIDES, rideOf } = await import('../src/game/themepark.js');
const { Client } = await import('colyseus.js');
const { matchMaker } = (await import('colyseus')).default;

let server; let url;
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('3 つの のりものに 値段が ある。知らない のりものは ことわる', () => {
  assert.deepEqual([...RIDES.keys()].sort(), ['carousel', 'coaster', 'wheel']);
  for (const r of RIDES.values()) assert.ok(r.price > 0);
  assert.throws(() => rideOf('rocket'), /unknown ride/);
});

test('部屋: のると コインが へる。すぐ もう 1 回は とらない。たりなければ ことわる', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'park1', name: 'Kai' });
  room.onMessage('*', () => {});
  await nextMessage(room, 'welcome');
  const fare = RIDES.get('carousel').price;

  const wallet = matchMaker.getRoomById(room.roomId).priv.get(room.sessionId).wallet;
  wallet.coins = 5;
  room.send('park:ride', { id: 'coaster' });
  const poor = await nextMessage(room, 'park:ride:error');
  assert.equal(poor.reason, 'not enough coins');
  assert.equal(poor.wallet.coins, 5, 'nothing is taken');

  // コインを ためた ことに する（部屋の 中の さいふ）。
  const coins = 100;
  wallet.coins = coins;

  room.send('park:ride', { id: 'rocket' });
  assert.equal((await nextMessage(room, 'park:ride:error')).reason, 'unknown ride');

  room.send('park:ride', { id: 'carousel' });
  {
    const ok = await nextMessage(room, 'park:ride:ok');
    assert.equal(ok.wallet.coins, coins - fare, 'the room takes the fare');
    room.send('park:ride', { id: 'carousel' });
    const again = await nextMessage(room, 'park:ride:error');
    assert.equal(again.reason, 'too fast', 'a double tap is not charged twice');
    assert.equal(again.wallet.coins, coins - fare);
  }
  await room.leave();
});
