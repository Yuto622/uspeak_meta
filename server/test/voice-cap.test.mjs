// つうわの1日の上限 — a microphone left open costs something every second it is open, and
// unlike the AI conversation (AI_DAILY_TURNS_PER_STUDENT) nothing used to bound how long.
// A tab forgotten in a call room would simply keep running, and on the big room that runs
// up a real LiveKit bill.
//
// Isolated in its own file, its own server, its own tiny cap (a few seconds, not the real
// 120 minutes) so the periodic cutoff can actually be watched happening rather than taken
// on faith. Sharing room.test.mjs's server would mean either waiting a real two hours or
// setting a cap small enough to break its own, unrelated voice test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';
// Three seconds, not two hours: long enough to prove a real elapsed-time measurement is
// happening (not an off-by-one on a single tick), short enough that this file runs in
// seconds rather than minutes.
process.env.VOICE_DAILY_MINUTES_PER_STUDENT = '0.05';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { TALK } = await import('../src/game/talk.js');
const { blankCaps, sanitizeCaps, roomLeft } = await import('../src/game/night.js');
const { dayIndex } = await import('../src/game/daily.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 6000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
// A message that must NOT arrive: used to prove a teacher is not cut off.
const noMessage = (room, type, ms) => new Promise((resolve, reject) => {
  const off = room.onMessage(type, (m) => { off(); reject(new Error(`unexpected ${type}: ${JSON.stringify(m)}`)); });
  setTimeout(() => { off(); resolve(); }, ms);
});
async function join(name, extra = {}) {
  const client = new Client(url);
  const room = await client.joinOrCreate('class', { classCode: 'voice-cap', name, ...extra });
  await nextMessage(room, 'welcome');
  return { client, room };
}
async function stand(who, space) {
  who.room.send('move', { s: space, x: 0, z: 0, r: 0, a: 'idle', t: 1 });
  await waitFor(() => who.room.state.players.get(who.room.sessionId).space === space);
}

before(async () => { server = await startServer({ port: 0 }); const addr = server.server.address(); url = `ws://127.0.0.1:${addr.port}`; });
after(async () => { await server.shutdown('test'); });

// The pure bookkeeping first: blankCaps carries the new key, sanitizeCaps keeps it across
// a reconnect on the same day and drops it on a new one, and roomLeft rolls every cap over
// on a day boundary — conv included, which it did not before this. A room that stays up
// past midnight with a child mid-call must not leave conv (or now voice) stuck at
// yesterday's spend until the next reconnect happens to call sanitizeCaps fresh.
test('the daily caps carry つうわ, and a day boundary rolls every one of them over', () => {
  const blank = blankCaps(1_700_000_000_000);
  assert.equal(blank.voice, 0);

  const today = dayIndex(1_700_000_000_000);
  const kept = sanitizeCaps({ day: today, voice: 42, conv: 7 }, 1_700_000_000_000);
  assert.equal(kept.voice, 42, 'the same day carries the spend forward');
  assert.equal(kept.conv, 7);

  const stale = sanitizeCaps({ day: today, voice: 42, conv: 7 }, 1_700_000_000_000 + 86_400_000 * 2);
  assert.equal(stale.voice, 0, 'a stale day starts fresh');
  assert.equal(stale.conv, 0);

  // roomLeft is the one that has to catch a day turning over WITHOUT a fresh sanitizeCaps
  // — a room that has been up since before midnight, mid-session.
  const caps = { day: today, battle: 5, ghost: 5, course: 5, eiken: 5, conv: 5, voice: 5 };
  const left = roomLeft(caps, 'voice', 100, 1_700_000_000_000 + 86_400_000);
  assert.equal(left, 100, 'yesterday\'s spend is gone');
  for (const key of ['battle', 'ghost', 'course', 'eiken', 'conv', 'voice']) {
    assert.equal(caps[key], 0, `${key} rolled over too`);
  }
});

test('a call left open past today\'s minutes is closed by the room, not by a child leaving', async () => {
  const a = await join('Nao');
  await stand(a, TALK.id);
  a.room.send('voice:join', {});
  const opened = await nextMessage(a.room, 'voice:room');
  assert.equal(opened.room, TALK.id);

  // Nobody sends voice:leave. If the cap is only checked at join time, this call runs
  // forever; if tickVoice is banking and checking it once a second, the room hangs up.
  const closed = await nextMessage(a.room, 'voice:closed', 8000);
  assert.equal(closed.reason, 'daily limit', 'the room ended the call, unasked');

  // And the day's minutes are spent: rejoining immediately is refused with the same
  // reason, not treated as a fresh call.
  a.room.send('voice:join', {});
  const err = await nextMessage(a.room, 'voice:error');
  assert.equal(err.reason, 'daily limit');

  await a.room.leave();
  await sleep(100);
});

test('a teacher is exempt: the one adult in the room is not the exposure this guards', async () => {
  const t = await join('Sensei', { teacherKey: 'testkey12345' });
  await stand(t, TALK.id);
  t.room.send('voice:join', {});
  await nextMessage(t.room, 'voice:room');

  // The same window that closed a student's call, and nothing arrives.
  await noMessage(t.room, 'voice:closed', 4000);

  t.room.send('voice:leave', {});
  await sleep(100);
  await t.room.leave();
  await sleep(100);
});
