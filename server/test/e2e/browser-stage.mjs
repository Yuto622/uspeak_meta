// 大広間 end-to-end: a real LiveKit server, a real Colyseus server, and real browsers
// standing on おはなし島 talking through the SFU rather than to each other.
//
// What is being checked is the whole rule: the island is one room for a hundred rather
// than six, a child's browser makes one connection instead of ninety-nine, the voice
// actually arrives, a child may not put their camera on until the teacher has put them on
// the stage, and the written channel works whatever the media is doing.
//
// Run:  LIVEKIT_BIN=./livekit-server node test/e2e/browser-stage.mjs
// A LiveKit server is needed. It is one binary, no Docker:
//   curl -sSL https://github.com/livekit/livekit/releases/download/v1.10.1/livekit_1.10.1_linux_amd64.tar.gz | tar xz
// and `--dev` runs it with the well-known devkey/secret, which is what this test uses.
//
// It has to be 1.10 or newer: the 2.x browser SDK signs in at /rtc/v1, which older servers
// answer with a 404 — everything looks like it is connecting and then quietly is not.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 2641;
const LK_PORT = 7880;
const TEACHER_KEY = 'stage-test-key';
const LK_BIN = process.env.LIVEKIT_BIN || 'livekit-server';

// No LiveKit binary, no test: say so plainly rather than pretending to pass.
if (spawnSync(LK_BIN, ['--version'], { encoding: 'utf8' }).status !== 0) {
  console.log(`SKIP: no LiveKit server at "${LK_BIN}". Set LIVEKIT_BIN, or see the header of this file.`);
  process.exit(0);
}

const livekit = spawn(LK_BIN, ['--dev', '--bind', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
livekit.stderr.on('data', (d) => { if (/error|panic/i.test(String(d))) process.stdout.write('[livekit] ' + d); });
await sleep(2500);

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', TEACHER_KEY,
    // The three that turn the hall on. --dev mode's well-known pair; a real deployment
    // puts its own in the environment and never in a file.
    LIVEKIT_URL: `ws://127.0.0.1:${LK_PORT}`, LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
await sleep(1500);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox',
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection',
    '--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 520, height: 420 } });

// The container has no sound card and no camera, so both are stood in for. Everything
// after getUserMedia — publishing, forwarding, subscribing — is the real thing.
const FAKE_DEVICES = () => {
  const tone = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    osc.start();
    const out = ctx.createMediaStreamDestination();
    osc.connect(out);
    return out.stream;
  };
  const picture = (colour) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const paint = () => { const c = canvas.getContext('2d'); c.fillStyle = colour; c.fillRect(0, 0, 320, 240); requestAnimationFrame(paint); };
    paint();
    return canvas.captureStream(10);
  };
  navigator.mediaDevices.getUserMedia = async (want) => (want?.video ? picture('#2f6b4f') : tone());
  navigator.mediaDevices.getDisplayMedia = async () => picture('#3b2f6b');
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

const landOnTalkIsland = async (page) => {
  await page.evaluate(() => { uspeak.rpg.fly('talk'); uspeak.rpg.finishFlight(); });
  await page.waitForFunction(() => uspeak.net.currentSpace() === 'talk', null, { timeout: 150000, polling: 150 });
};
const voiceState = (page) => page.evaluate(() => ({
  kind: uspeak.net.voice.state.kind,
  max: uspeak.net.voice.state.max,
  joined: uspeak.net.voice.state.joined,
  heads: uspeak.net.voice.state.heads,
  can: uspeak.net.voice.state.can,
  error: uspeak.net.voice.state.error,
  people: [...uspeak.net.voice.state.peers.values()].map((p) => ({ name: p.name, audio: p.stream.getAudioTracks().length, video: p.stream.getVideoTracks().length, screen: p.screen?.getVideoTracks().length || 0 })),
}));

try {
  const a = await openPage('Hina', { initScript: FAKE_DEVICES });
  const b = await openPage('Ren', { initScript: FAKE_DEVICES });
  const t = await openPage('Sensei', { teacherKey: TEACHER_KEY, initScript: FAKE_DEVICES });

  check('the server tells the page it has a hall behind it',
    await a.evaluate(() => uspeak.net.voice.state.stageOpen === true));

  await landOnTalkIsland(a);
  await landOnTalkIsland(b);
  await landOnTalkIsland(t);
  await a.waitForFunction(() => !document.querySelector('#voice-panel').hidden, null, { timeout: 90000, polling: 200 });
  check('and the island says so before anybody taps',
    (await a.evaluate(() => document.querySelector('#voice-note').textContent)) === 'この島に いる みんなと 話せます。',
    await a.evaluate(() => document.querySelector('#voice-note').textContent));

  // Everyone taps. Each browser makes one connection — to the SFU — however many people
  // are standing on the island.
  for (const page of [a, b, t]) {
    await page.click('#voice-join');
    await page.waitForFunction(() => uspeak.net.voice.state.joined, null, { timeout: 60000, polling: 200 });
  }
  await a.waitForFunction(() => uspeak.net.voice.state.kind === 'sfu', null, { timeout: 60000, polling: 200 });
  const state = await voiceState(a);
  check('おはなし島 is one room for a hundred, not six', state.kind === 'sfu' && state.max === 100, JSON.stringify({ kind: state.kind, max: state.max }));

  await a.waitForFunction(() => uspeak.net.voice.state.peers.size >= 2, null, { timeout: 120000, polling: 300 });
  check('everyone standing on it is in the same call',
    (await a.evaluate(() => [...uspeak.net.voice.state.peers.values()].map((p) => p.name).sort().join(','))) === 'Ren,Sensei',
    await a.evaluate(() => [...uspeak.net.voice.state.peers.values()].map((p) => p.name).join(',')));

  // The voice itself: forwarded by the SFU, one copy up and one copy down per listener.
  await a.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].every((p) => p.stream.getAudioTracks().length === 1), null, { timeout: 120000, polling: 300 });
  check('and every voice arrives', true, JSON.stringify((await voiceState(a)).people));
  check('the panel counts the room', (await voiceState(a)).heads === 3, String((await voiceState(a)).heads));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-stage-hall.png') });

  // A hundred cameras is not a lesson: a child's camera waits for the teacher.
  check('a child may not be seen until the teacher says so', (await voiceState(a)).can.camera === false);
  await a.click('#voice-cam');
  await sleep(800);
  check('and tapping the camera says why, rather than failing quietly',
    (await a.evaluate(() => document.querySelector('#voice-note').textContent)).includes('ステージ'),
    await a.evaluate(() => document.querySelector('#voice-note').textContent));
  check('the teacher may be seen from the start', (await voiceState(t)).can.camera === true);

  // ステージ: the teacher puts Hina up, and Hina's browser is handed a new ticket.
  const hina = await a.evaluate(() => uspeak.net.voice.state.me);
  await t.evaluate((id) => uspeak.net.room.send('teacher', { cmd: 'stage', target: id, on: true }), hina);
  await a.waitForFunction(() => uspeak.net.voice.state.can.camera === true, null, { timeout: 60000, polling: 200 });
  check('a teacher can put a child on the stage', true);
  await a.click('#voice-cam');
  await a.waitForFunction(() => uspeak.net.voice.state.camera, null, { timeout: 60000, polling: 200 });
  await b.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].some((p) => p.stream.getVideoTracks().length), null, { timeout: 120000, polling: 300 });
  check('and then the room can see them', true, JSON.stringify((await voiceState(b)).people));
  await b.screenshot({ path: path.join(SHOTS, 'e2e-stage-child.png') });

  // Off the stage again: the camera goes with it.
  await t.evaluate((id) => uspeak.net.room.send('teacher', { cmd: 'stage', target: id, on: false }), hina);
  await a.waitForFunction(() => uspeak.net.voice.state.can.camera === false, null, { timeout: 60000, polling: 200 });
  await a.waitForFunction(() => !uspeak.net.voice.state.camera, null, { timeout: 60000, polling: 200 });
  check('taking them off the stage takes the camera with it', true);

  // The written channel does not care about any of this.
  await a.click('#voice-say-open');
  await a.waitForFunction(() => document.querySelectorAll('#voice-phrases [data-say]').length > 0, null, { timeout: 60000, polling: 200 });
  await a.click('#voice-phrases [data-say="can-you-hear"]');
  await b.waitForFunction(() => document.querySelectorAll('#voice-log li').length === 1, null, { timeout: 60000, polling: 200 });
  check('a message still reaches a hall of a hundred',
    (await b.evaluate(() => document.querySelector('#voice-log li span')?.textContent)) === 'Can you hear me?');

  // Walking off the island is hanging up, here as everywhere.
  await a.evaluate(() => { uspeak.rpg.fly('eiken5'); uspeak.rpg.finishFlight(); });
  await b.waitForFunction(() => uspeak.net.voice.state.peers.size === 1, null, { timeout: 120000, polling: 300 });
  check('walking off the island leaves the hall', (await a.evaluate(() => uspeak.net.voice.state.joined)) === false);

  // And a small room is a small room again: six children, and a camera nobody has to ask
  // for. The hall's rules do not follow a child out of it.
  const hall5 = await a.evaluate(async () => (await (await fetch('eiken.json')).json())).then((d) => d.islands.find((i) => i.id === 'eiken5'));
  const speaking = hall5.spots.find((sp) => sp.skill === 'speaking');
  await a.evaluate(([x, z]) => { uspeak.rpg.inside.leave(true); uspeak.player.position.set(x, 0, z); }, [hall5.x + speaking.x, hall5.z + speaking.z]);
  await a.waitForFunction(() => uspeak.net.currentSpace() === 'in:eiken5:speaking', null, { timeout: 150000, polling: 150 });
  await a.click('#voice-join');
  await a.waitForFunction(() => uspeak.net.voice.state.kind === 'mesh', null, { timeout: 60000, polling: 200 });
  const small = await voiceState(a);
  check('a building is a six-child mesh again, camera and all',
    small.kind === 'mesh' && small.max === 6 && small.can.camera === true, JSON.stringify({ kind: small.kind, max: small.max, can: small.can }));
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false, detail: String(err) });
} finally {
  await browser.close();
  server.kill('SIGTERM');
  livekit.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
