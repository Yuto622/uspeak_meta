// 大広間 — the ticket into a room a mesh cannot hold.
//
// The SFU itself is not tested here (test/e2e/browser-stage.mjs runs a real LiveKit server
// and two real browsers through it). What is tested here is the part this server decides:
// which rooms are big, who may be seen in one, and what a signed ticket actually says —
// because a page that could mint its own would be a page that could join another class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

process.env.LIVEKIT_URL = 'wss://livekit.example.test';
process.env.LIVEKIT_API_KEY = 'testkey';
process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret';
process.env.LOG_LEVEL = 'error';

const { mintToken, readToken, stageReady, stageRoomName, STAGE_MAX } = await import('../src/game/stage.js');

test('大広間: a ticket says who, where, and what they may publish — and is signed', () => {
  assert.equal(stageReady(), true, 'three environment variables are what turns the hall on');
  assert.equal(STAGE_MAX, 100);

  const token = mintToken({ room: 'kids__talk', identity: 'abc123', name: 'Hina' });
  const claims = readToken(token);
  assert.equal(claims.iss, 'testkey', 'the key names the server, and only the server has the secret');
  assert.equal(claims.sub, 'abc123', 'a ticket is for one child');
  assert.equal(claims.name, 'Hina');
  assert.equal(claims.video.room, 'kids__talk', 'and for one room');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canSubscribe, true, 'everyone hears everyone');
  assert.equal(claims.video.canPublishData, false, 'the written channel is ours, not the SFU\'s');
  assert.deepEqual(claims.video.canPublishSources, ['microphone'],
    'a child in a hall of a hundred publishes a voice and nothing else');
  assert.ok(claims.exp > Math.floor(Date.now() / 1000) + 60, 'and it runs out');

  // The signature is what makes any of that true: change a claim and it stops matching.
  const [h, p, sig] = token.split('.');
  const expected = createHmac('sha256', 'testsecret-testsecret').update(`${h}.${p}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(sig, expected, 'HS256 over the header and the claims');

  // A teacher, and a child the teacher has put on the stage, may also be seen.
  const staged = readToken(mintToken({ room: 'kids__talk', identity: 'x', camera: true, screen: true }));
  assert.deepEqual(staged.video.canPublishSources, ['microphone', 'camera', 'screen_share', 'screen_share_audio']);
});

test('大広間: a room name keeps one class out of another class\'s hall', () => {
  assert.equal(stageRoomName('ひまわり 1-A', 'talk'), '-1-A__talk', 'anything but plain characters becomes one dash');
  assert.notEqual(stageRoomName('kids', 'talk'), stageRoomName('other', 'talk'),
    'the same island in two classes is two rooms');
  assert.equal(stageRoomName('kids', 'in:eiken5:speaking'), 'kids__in-eiken5-speaking');
});

test('大広間: without the three environment variables there is no hall at all', () => {
  // A bare server still runs; big rooms simply fall back to a six-child mesh. The check
  // runs in a child process because the configuration is read once, at startup.
  const env = { ...process.env, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' };
  const out = execFileSync(process.execPath, ['-e',
    "import('./src/game/stage.js').then((m) => console.log(JSON.stringify([m.stageReady(), m.mintToken({ room: 'r', identity: 'i' })])))",
  ], { env, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.deepEqual(JSON.parse(out.trim()), [false, ''], 'no url, no key, no secret: no hall and nothing minted');
});
