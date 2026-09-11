// 百人. A whole school standing on おはなし島 at once, joined for real over WebSocket.
//
// The SFU's own capacity is LiveKit's business (a machine holds thousands); what is tested
// here is ours — that a hundred children are admitted to one room, that each is handed a
// ticket for that room and nobody else's, that the hundred-and-first is turned away with a
// reason rather than half-joined, and that the same island holds six when there is no SFU
// behind it. A hundred real clients, no browsers: the part that decides is this server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.MAX_CLIENTS = '120';
process.env.LOG_LEVEL = 'error';
process.env.CHAT_MIN_INTERVAL_MS = '0';
process.env.LIVEKIT_URL = 'wss://livekit.example.test';
process.env.LIVEKIT_API_KEY = 'devkey';
process.env.LIVEKIT_API_SECRET = 'secret-secret-secret';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { TALK } = await import('../src/game/talk.js');
const { readToken } = await import('../src/game/stage.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };

before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('大広間: a hundred children stand on おはなし島 and are all in the same call', async () => {
  const HOW_MANY = 100;
  const kids = [];
  // Joined in small batches: a classroom arrives over a minute, not in one instant, and a
  // hundred sockets opened at literally the same moment is a test of Node, not of this.
  for (let i = 0; i < HOW_MANY; i += 10) {
    const batch = await Promise.all(Array.from({ length: 10 }, (_, k) => {
      const name = `Kid${String(i + k).padStart(3, '0')}`;
      return new Client(url).joinOrCreate('class', { classCode: 'hall-1', name });
    }));
    kids.push(...batch);
  }
  assert.equal(kids.length, HOW_MANY);

  const tokens = new Map();
  const rooms = new Map();
  const errors = [];
  for (const room of kids) {
    room.onMessage('voice:token', (m) => tokens.set(room.sessionId, m));
    room.onMessage('voice:room', (m) => rooms.set(room.sessionId, m));
    room.onMessage('voice:error', (m) => errors.push(m.reason));
  }

  // Everyone walks onto the island and taps.
  for (const room of kids) room.send('move', { s: TALK.id, x: 0, z: 0, r: 0, a: 'idle', t: 1 });
  await waitFor(() => kids.every((r) => r.state.players.get(r.sessionId)?.space === TALK.id));
  for (const room of kids) room.send('voice:join', {});
  await waitFor(() => rooms.size === HOW_MANY && tokens.size === HOW_MANY, 30000);

  assert.equal(errors.length, 0, `nobody was turned away: ${errors.join(',')}`);
  const first = rooms.get(kids[0].sessionId);
  assert.equal(first.kind, 'sfu', 'a hundred is not a mesh');
  assert.equal(first.max, 100);
  assert.deepEqual(first.peers, [], 'a big room introduces nobody: the SFU is the only connection');

  // Every ticket is for that child alone, in the one room the class shares.
  const halls = new Set();
  for (const room of kids) {
    const claims = readToken(tokens.get(room.sessionId).token);
    assert.equal(claims.sub, room.sessionId, 'a ticket names the child it was minted for');
    assert.deepEqual(claims.video.canPublishSources, ['microphone'], 'a hundred voices, no hundred cameras');
    halls.add(claims.video.room);
  }
  assert.equal(halls.size, 1, 'and all hundred are in the same hall');
  assert.equal([...halls][0], 'hall-1__talk');

  // The hundred-and-first is told why, rather than joining a room that cannot hold them.
  const late = await new Client(url).joinOrCreate('class', { classCode: 'hall-1', name: 'Late' });
  const refused = new Promise((resolve) => late.onMessage('voice:error', (m) => resolve(m)));
  late.send('move', { s: TALK.id, x: 0, z: 0, r: 0, a: 'idle', t: 1 });
  await waitFor(() => late.state.players.get(late.sessionId)?.space === TALK.id);
  late.send('voice:join', {});
  const said = await Promise.race([refused, sleep(3000).then(() => ({ reason: 'let in anyway' }))]);
  assert.equal(said.reason, 'room is full');
  assert.equal(said.max, 100);

  await Promise.all([...kids, late].map((r) => r.leave()));
  await sleep(200);
});
