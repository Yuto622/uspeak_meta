// Browser end-to-end check for おはなし: two children walk into the same building and can
// hear each other, and the server never carries a byte of it.
//
// What is being checked is the whole rule: nothing is open until a teacher opens it, the
// room a child is standing in is the call they are in, two browsers in that room really
// do connect to each other (a real RTCPeerConnection, with a real audio track arriving),
// and walking out hangs up.
//
// Chromium is given fake capture devices, so "the microphone" is a test tone. The pages
// are served from 127.0.0.1, which browsers treat as a secure context — on a plain http://
// address on a LAN they would refuse the microphone before we ever asked.
//
// Run: node test/e2e/browser-voice.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
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

const PORT = 2629;
const TEACHER_KEY = 'voice-test-key';
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', TEACHER_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox',
    '--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 520, height: 420 } });

// This container has no sound card, so Chromium's fake capture device reports "no device"
// however it is asked. The microphone is therefore stood in for by a tone the page makes
// itself: everything after getUserMedia — the offer, the answer, the candidates, the track
// crossing between two browsers — is the real thing.
const FAKE_MIC = () => {
  const make = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    osc.start();
    const out = ctx.createMediaStreamDestination();
    osc.connect(out);
    return out.stream;
  };
  const camera = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const paint = () => { const c = canvas.getContext('2d'); c.fillStyle = '#2f6b4f'; c.fillRect(0, 0, 160, 120); requestAnimationFrame(paint); };
    paint();
    return canvas.captureStream(10);
  };
  navigator.mediaDevices.getUserMedia = async (want) => (want?.video ? camera() : make());
};
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const HALL = 'in:eiken5:speaking';

// Walking into the hall, the way a child does: fly to the island, step into the doorway,
// and the page declares `in:eiken5:speaking` on its own. Nothing here tells the server
// where anybody is — that is the game's job, and it is the thing being tested.
async function enterHall(page, isle) {
  const hall = isle.spots.find((s) => s.skill === 'speaking');
  await page.evaluate(() => { if (uspeak.rpg.state.current !== 'eiken5') { uspeak.rpg.fly('eiken5'); uspeak.rpg.finishFlight(); } });
  await page.evaluate(([x, z]) => { uspeak.rpg.inside.leave(true); uspeak.player.position.set(x, 0, z); }, [isle.x + hall.x, isle.z + hall.z]);
  await page.waitForFunction(() => uspeak.rpg.insideBuilding?.spot?.id === 'speaking', null, { timeout: 40000, polling: 150 });
  await page.waitForFunction(() => uspeak.net.currentSpace() === 'in:eiken5:speaking', null, { timeout: 20000, polling: 150 });
}

async function leaveHall(page) {
  await page.evaluate(() => { uspeak.player.position.z = 9.4; });
  await page.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 40000, polling: 150 });
}

const peers = (page) => page.evaluate(() => [...uspeak.net.voice.state.peers.values()].map((p) => ({
  name: p.name, connection: p.pc.connectionState, ice: p.pc.iceConnectionState, tracks: p.stream.getTracks().map((t) => t.kind),
})));

try {
  const a = await openPage('Hina', { initScript: FAKE_MIC });
  const b = await openPage('Ren', { initScript: FAKE_MIC });
  const t = await openPage('Sensei', { teacherKey: TEACHER_KEY });

  const isle = await a.evaluate(async () => (await (await fetch('eiken.json')).json())).then((d) => d.islands.find((i) => i.id === 'eiken5'));

  // Nothing is open, so standing in a room together offers nothing.
  await enterHall(a, isle);
  await enterHall(b, isle);
  await sleep(800);
  check('a room is silent until a teacher opens it', await a.evaluate(() => document.querySelector('#voice-panel').hidden));

  await t.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'voice', on: true }));
  await a.waitForFunction(() => !document.querySelector('#voice-panel').hidden, null, { timeout: 15000, polling: 200 });
  check('opening it shows the room panel to the children in a room', true);
  check('and the panel says who could be in the call',
    (await a.evaluate(() => document.querySelector('#voice-room').textContent)).includes('ステージ'),
    await a.evaluate(() => document.querySelector('#voice-room').textContent));

  // Standing outside is not being in a call, however open it is.
  await t.evaluate(() => { uspeak.rpg.fly('eiken5'); uspeak.rpg.finishFlight(); });
  await t.waitForFunction(() => uspeak.net.currentSpace() === 'eiken5', null, { timeout: 20000, polling: 200 });
  await sleep(900);
  check('the island itself is not a call', await t.evaluate(() => document.querySelector('#voice-panel').hidden));

  // Both children tap to allow the microphone. Everything after this is browser to browser.
  await a.click('#voice-join');
  await b.click('#voice-join');
  await a.waitForFunction(() => uspeak.net.voice.state.peers.size === 1, null, { timeout: 20000, polling: 200 });
  await b.waitForFunction(() => uspeak.net.voice.state.peers.size === 1, null, { timeout: 20000, polling: 200 });
  check('each child is introduced to the other', true, `${(await peers(a))[0]?.name} / ${(await peers(b))[0]?.name}`);

  await a.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].every((p) => p.pc.connectionState === 'connected'), null, { timeout: 40000, polling: 300 });
  await b.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].every((p) => p.pc.connectionState === 'connected'), null, { timeout: 40000, polling: 300 });
  check('the two browsers connected to each other', true, JSON.stringify(await peers(a)));

  await a.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].some((p) => p.stream.getAudioTracks().length), null, { timeout: 30000, polling: 300 });
  check('and the voice itself arrives', (await peers(a))[0].tracks.includes('audio'), JSON.stringify((await peers(a))[0].tracks));
  check('the room shows both of them', (await a.evaluate(() => document.querySelectorAll('#voice-people span').length)) === 2);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-voice-room.png') });

  // Muting is the child's own microphone, not a message to anybody.
  await a.click('#voice-mute');
  check('a child can mute themselves', await a.evaluate(() => uspeak.net.voice.state.muted && !document.querySelector('#voice-me')?.srcObject?.getAudioTracks?.().some((t) => t.enabled)));
  await a.click('#voice-mute');

  // Walking out is hanging up: no button is pressed on either side.
  await leaveHall(a);
  await b.waitForFunction(() => uspeak.net.voice.state.peers.size === 0, null, { timeout: 20000, polling: 200 });
  check('walking out of the room hangs up, for both of them',
    (await a.evaluate(() => uspeak.net.voice.state.joined)) === false);

  // And the teacher closing it takes everyone out at once.
  await enterHall(a, isle);
  await sleep(600);
  await a.click('#voice-join');
  await a.waitForFunction(() => uspeak.net.voice.state.joined, null, { timeout: 20000, polling: 200 });
  await t.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'voice', on: false }));
  await a.waitForFunction(() => !uspeak.net.voice.state.joined && document.querySelector('#voice-panel').hidden, null, { timeout: 20000, polling: 200 });
  check('the teacher can close every call in the class at once', true);
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false, detail: String(err) });
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
