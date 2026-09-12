// Browser end-to-end check for おはなし: two children on おはなし島 are in a call by
// standing on it, two children who walk into the same building elsewhere can hear each
// other once a teacher opens it, and the server never carries a byte of either.
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
  // WebRtcHideLocalIpsWithMdns off: Chromium normally hides a machine's own address behind
  // an mDNS name, and a container with no mDNS responder then gathers no candidates at all
  // and the call never connects. Real browsers on a school network resolve those names; the
  // flag is about this container, not about how the call works.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox',
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection',
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
  // A "screen" to share: a different colour, so a tile showing it can be told apart from
  // a tile showing a face.
  const screen = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 200;
    const paint = () => { const c = canvas.getContext('2d'); c.fillStyle = '#3b2f6b'; c.fillRect(0, 0, 320, 200); requestAnimationFrame(paint); };
    paint();
    return canvas.captureStream(5);
  };
  navigator.mediaDevices.getUserMedia = async (want) => (want?.video ? camera() : make());
  navigator.mediaDevices.getDisplayMedia = async () => screen();
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
  await page.waitForFunction(() => uspeak.rpg.insideBuilding?.spot?.id === 'speaking', null, { timeout: 150000, polling: 150 });
  await page.waitForFunction(() => uspeak.net.currentSpace() === 'in:eiken5:speaking', null, { timeout: 60000, polling: 150 });
}

// おはなし島 is the island that is a call: flying to it is all it takes.
async function landOnTalkIsland(page) {
  await page.evaluate(() => { uspeak.rpg.fly('talk'); uspeak.rpg.finishFlight(); });
  await page.waitForFunction(() => uspeak.net.currentSpace() === 'talk', null, { timeout: 150000, polling: 150 });
}

async function leaveHall(page) {
  await page.evaluate(() => { uspeak.player.position.z = 9.4; });
  await page.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 150000, polling: 150 });
}

const peers = (page) => page.evaluate(() => [...uspeak.net.voice.state.peers.values()].map((p) => ({
  name: p.name, connection: p.pc.connectionState, ice: p.pc.iceConnectionState, tracks: p.stream.getTracks().map((t) => t.kind),
})));

// Both children tap, and the two browsers connect. The tap is the real thing being tested;
// the retry around it is not. This container's ICE gathering sometimes produces no
// candidates at all (no mDNS responder, no reachable STUN, a shaped virtual network), and
// a connection that never gathered one never connects. Hanging up and tapping again builds
// a fresh RTCPeerConnection, which is exactly what a child would do — and what a school
// network with a TURN server would not need.
async function bothJoin(p1, p2, tries = 4) {
  const connected = (page) => page.evaluate(() => [...uspeak.net.voice.state.peers.values()].length > 0
    && [...uspeak.net.voice.state.peers.values()].every((p) => p.pc.connectionState === 'connected'));
  for (let go = 1; go <= tries; go++) {
    if (!(await p1.evaluate(() => uspeak.net.voice.state.joined))) await p1.click('#voice-join');
    if (!(await p2.evaluate(() => uspeak.net.voice.state.joined))) await p2.click('#voice-join');
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      if (await connected(p1) && await connected(p2)) return true;
      await sleep(500);
    }
    console.log(`  (attempt ${go}: not connected yet — ${JSON.stringify(await peers(p1))})`);
    if (go < tries) {
      for (const page of [p1, p2]) await page.evaluate(() => uspeak.net.voice.leave());
      await sleep(1500);
    }
  }
  return false;
}

try {
  const a = await openPage('Hina', { initScript: FAKE_MIC });
  const b = await openPage('Ren', { initScript: FAKE_MIC });
  const t = await openPage('Sensei', { teacherKey: TEACHER_KEY });

  const isle = await a.evaluate(async () => (await (await fetch('eiken.json')).json())).then((d) => d.islands.find((i) => i.id === 'eiken5'));
  const talk = await a.evaluate(async () => (await (await fetch('talk.json')).json())).then((d) => d.island);

  // ---- the button on the rail: the one part of the call a child can see from anywhere.
  const rail = (page) => page.evaluate(() => {
    const el = document.querySelector('#voice-button');
    return el && !el.hidden ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('the rail has a call button as soon as a child is online', !!(await rail(a)), await rail(a));
  check('and out on the grass it offers to take them where the class meets',
    (await rail(a)).includes('おはなし島'), await rail(a));
  // Pressed rather than tapped: this window (520x420) is shorter than any real device and
  // the rail has scrolled the button out of it, which a real thumb would simply scroll
  // back. Whether it is reachable is browser-layout.mjs's job; this is about what it does.
  await a.evaluate(() => document.querySelector('#voice-button').click());
  // The journey itself is the game's own flight. This renderer caps dt at 40ms and draws
  // three frames a second, so a fourteen-second flight takes two minutes here: the test
  // checks that the flight started and then lands the plane, exactly as the ✈ button's
  // own "skip" does.
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 30000, polling: 150 });
  check('pressing it sets off for おはなし島', true, await a.evaluate(() => uspeak.rpg.state.target));
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await a.waitForFunction(() => uspeak.net.currentSpace() === 'talk', null, { timeout: 60000, polling: 200 });
  check('and it lands there', (await a.evaluate(() => uspeak.net.currentSpace())) === 'talk');
  await a.waitForFunction(() => (document.querySelector('#voice-button')?.textContent || '').includes('ここで'), null, { timeout: 30000, polling: 200 })
    .catch(() => {});
  check('and on the island it offers the call itself', (await rail(a)).includes('ここで'), await rail(a));

  // ---- おはなし島: nobody opens anything, because the island is already a call.
  await landOnTalkIsland(a);
  await landOnTalkIsland(b);
  await a.waitForFunction(() => !document.querySelector('#voice-panel').hidden, null, { timeout: 90000, polling: 200 });
  check('landing on おはなし島 opens the call, with no teacher and no switch', true,
    await a.evaluate(() => document.querySelector('#voice-room').textContent));
  check('and everyone standing on the island is in it',
    (await bothJoin(a, b)) && (await peers(a))[0]?.name === 'Ren', JSON.stringify(await peers(a)));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-voice-island.png') });

  // A booth on the island is a room of its own: walking in leaves the island's call.
  const booth = talk.spots[0];
  await a.evaluate(([x, z]) => { uspeak.rpg.inside.leave(true); uspeak.player.position.set(x, 0, z); }, [talk.x + booth.x, talk.z + booth.z]);
  await a.waitForFunction((id) => uspeak.rpg.insideBuilding?.spot?.id === id, booth.id, { timeout: 150000, polling: 150 });
  await b.waitForFunction(() => uspeak.net.voice.state.peers.size === 0, null, { timeout: 90000, polling: 200 });
  check('stepping into a booth leaves the island behind', true, booth.name);
  await a.evaluate(() => { uspeak.player.position.z = 9.4; });
  await a.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 150000, polling: 150 });

  // ---- everywhere else: a room on any island is a call as well, and nobody opened it.
  await enterHall(a, isle);
  await enterHall(b, isle);
  await a.waitForFunction(() => !document.querySelector('#voice-panel').hidden, null, { timeout: 90000, polling: 200 });
  check('a room on another island is a call too, with no teacher and no switch', true);
  check('and the panel says who could be in the call',
    (await a.evaluate(() => document.querySelector('#voice-room').textContent)).includes('ステージ'),
    await a.evaluate(() => document.querySelector('#voice-room').textContent));

  // A teacher who needs the class quiet narrows it to おはなし島, and opens it again.
  await t.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'voice', mode: 'rooms' }));
  await a.waitForFunction(() => document.querySelector('#voice-panel').hidden, null, { timeout: 60000, polling: 200 });
  check('a teacher can narrow it back to おはなし島 alone', true);
  await t.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'voice', mode: 'all' }));
  await a.waitForFunction(() => !document.querySelector('#voice-panel').hidden, null, { timeout: 60000, polling: 200 });
  check('and open it again', true);

  // Standing outside is not being in a call, however open it is.
  await t.evaluate(() => { uspeak.rpg.fly('eiken5'); uspeak.rpg.finishFlight(); });
  await t.waitForFunction(() => uspeak.net.currentSpace() === 'eiken5', null, { timeout: 90000, polling: 200 });
  await sleep(900);
  check('the island itself is not a call', await t.evaluate(() => document.querySelector('#voice-panel').hidden));

  // Both children tap to allow the microphone. Everything after this is browser to browser.
  const paired = await bothJoin(a, b);
  check('each child is introduced to the other', (await a.evaluate(() => uspeak.net.voice.state.peers.size)) === 1,
    `${(await peers(a))[0]?.name} / ${(await peers(b))[0]?.name}`);
  check('the two browsers connected to each other', paired, JSON.stringify(await peers(a)));

  await a.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].some((p) => p.stream.getAudioTracks().length), null, { timeout: 120000, polling: 300 });
  check('and the voice itself arrives', (await peers(a))[0].tracks.includes('audio'), JSON.stringify((await peers(a))[0].tracks));
  check('the room shows both of them', (await a.evaluate(() => document.querySelectorAll('#voice-people span').length)) === 2);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-voice-room.png') });

  // カメラ. Off to begin with, switched on in the middle of a call, and the other side
  // gets a picture without anybody renegotiating anything by hand.
  check('a camera is off until it is turned on', (await a.evaluate(() => document.querySelector('#voice-tiles').hidden)));
  await a.click('#voice-cam');
  await a.waitForFunction(() => uspeak.net.voice.state.camera, null, { timeout: 90000, polling: 200 });
  check('the child who turned it on sees themselves', await a.evaluate(() => !!document.querySelector('#voice-tiles [data-tile="me"] video')?.srcObject));
  await b.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].some((p) => p.stream.getVideoTracks().length), null, { timeout: 180000, polling: 300 });
  check('the picture crosses to the other child', true, JSON.stringify((await peers(b))[0].tracks));
  await b.waitForFunction(() => document.querySelectorAll('#voice-tiles [data-tile]').length >= 1, null, { timeout: 120000, polling: 300 });
  check('and their screen shows a face with a name on it',
    (await b.evaluate(() => document.querySelector('#voice-tiles [data-tile] small')?.textContent)) === 'Hina',
    await b.evaluate(() => document.querySelector('#voice-tiles [data-tile] small')?.textContent));
  await b.screenshot({ path: path.join(SHOTS, 'e2e-voice-camera.png') });

  // 画面共有. A second video track, told apart from a face by the stream it arrives on.
  await a.click('#voice-share');
  await a.waitForFunction(() => uspeak.net.voice.state.screen, null, { timeout: 90000, polling: 200 });
  check('the child sharing sees their own screen', await a.evaluate(() => !!document.querySelector('#voice-tiles [data-tile="me:screen"] video')?.srcObject));
  await b.waitForFunction(() => [...uspeak.net.voice.state.peers.values()].some((p) => p.screen.getVideoTracks().length), null, { timeout: 180000, polling: 300 });
  check('the screen crosses to the other child as a screen, not as a face',
    (await b.evaluate(() => [...uspeak.net.voice.state.peers.values()][0]?.stream.getVideoTracks().length)) === 1,
    JSON.stringify(await b.evaluate(() => [...uspeak.net.voice.state.peers.values()].map((p) => ({ face: p.stream.getVideoTracks().length, screen: p.screen.getVideoTracks().length })))));
  await b.waitForFunction(() => document.querySelectorAll('#voice-tiles .voice-tile.screen').length === 1, null, { timeout: 120000, polling: 300 });
  check('and it is shown wide, with whose screen it is',
    (await b.evaluate(() => document.querySelector('#voice-tiles .voice-tile.screen small')?.textContent)) === 'Hinaの がめん',
    await b.evaluate(() => document.querySelector('#voice-tiles .voice-tile.screen small')?.textContent));
  await b.screenshot({ path: path.join(SHOTS, 'e2e-voice-screen.png') });
  await a.click('#voice-share');
  await b.waitForFunction(() => document.querySelectorAll('#voice-tiles .voice-tile.screen').length === 0, null, { timeout: 120000, polling: 300 });
  check('stopping the share takes it off the other screen too', true);

  // メッセージ. Preset phrases only, and they reach the room without any browser having
  // connected to any other one — which is the point of having them.
  await a.click('#voice-say-open');
  await a.waitForFunction(() => document.querySelectorAll('#voice-phrases [data-say]').length > 0, null, { timeout: 60000, polling: 200 });
  check('the phrase list is English a child can read', 
    (await a.evaluate(() => document.querySelector('#voice-phrases [data-say="can-you-hear"] span')?.textContent)) === 'Can you hear me?');
  await a.click('#voice-phrases [data-say="can-you-hear"]');
  await b.waitForFunction(() => document.querySelectorAll('#voice-log li').length === 1, null, { timeout: 90000, polling: 200 });
  check('a message written in the room reaches the room',
    (await b.evaluate(() => document.querySelector('#voice-log li span')?.textContent)) === 'Can you hear me?',
    await b.evaluate(() => document.querySelector('#voice-log li')?.textContent));
  check('and it says who wrote it',
    (await b.evaluate(() => document.querySelector('#voice-log li b')?.textContent)) === 'Hina');
  // The writer's own line arrives on the server's echo, which is not the same moment as
  // the other child's: wait for it rather than assume the two land together.
  await a.waitForFunction(() => document.querySelectorAll('#voice-log li').length === 1, null, { timeout: 60000, polling: 200 }).catch(() => {});
  check('the writer sees their own line as theirs',
    (await a.evaluate(() => document.querySelector('#voice-log li')?.className)) === 'mine');
  // A child standing in another room is not in this conversation.
  check('and nobody outside the room sees it',
    (await t.evaluate(() => document.querySelectorAll('#voice-log li').length)) === 0);

  // がめんの 大きさ. The faces are the point of the camera, so the panel they live in has
  // to be resizable — one button, stepping 小 → 中 → 大 → 特大 and back round. Measured on
  // the child's own face, which is on the screen whatever the network is doing.
  const panelWidth = (page) => page.evaluate(() => document.querySelector('#voice-panel').getBoundingClientRect().width);
  const faceWidth = (page) => page.evaluate(() => document.querySelector('#voice-tiles [data-tile="me"] video')?.getBoundingClientRect().width || 0);
  const startedAt = await panelWidth(a);
  check('the panel opens at 中', (await a.evaluate(() => document.querySelector('#voice-panel').dataset.size)) === 'm');
  const faceAtM = await faceWidth(a);
  await a.click('#voice-size');
  await a.waitForFunction(() => document.querySelector('#voice-panel').dataset.size === 'l', null, { timeout: 60000, polling: 150 });
  const bigger = await panelWidth(a);
  check('tapping it once makes the panel bigger', bigger > startedAt, `${startedAt} → ${bigger}`);
  check('and the face grows with it', (await faceWidth(a)) > faceAtM, `${faceAtM} → ${await faceWidth(a)}`);
  await a.click('#voice-size');
  await a.waitForFunction(() => document.querySelector('#voice-panel').dataset.size === 'xl', null, { timeout: 60000, polling: 150 });
  check('特大 is bigger again', (await faceWidth(a)) > bigger, `${bigger} → ${await panelWidth(a)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-voice-size-xl.png') });
  await a.click('#voice-size');
  await a.waitForFunction(() => document.querySelector('#voice-panel').dataset.size === 's', null, { timeout: 60000, polling: 150 });
  check('tapping past 特大 comes back round to 小', (await panelWidth(a)) < startedAt);
  check('and the choice is remembered for the next lesson',
    (await a.evaluate(() => localStorage.getItem('uspeak-voice-size-v1'))) === 's');
  await a.click('#voice-size');
  await a.waitForFunction(() => document.querySelector('#voice-panel').dataset.size === 'm', null, { timeout: 60000, polling: 150 });

  await a.click('#voice-cam');
  await a.waitForFunction(() => !uspeak.net.voice.state.camera, null, { timeout: 90000, polling: 200 });
  await b.waitForFunction(() => document.querySelectorAll('#voice-tiles [data-tile]').length === 0, null, { timeout: 120000, polling: 300 });
  check('turning the camera off takes the picture away again, on both screens',
    await a.evaluate(() => document.querySelector('#voice-tiles').hidden));

  // Muting is the child's own microphone, not a message to anybody.
  await a.click('#voice-mute');
  check('a child can mute themselves', await a.evaluate(() => uspeak.net.voice.state.muted));
  // The rail button follows the call: in it, it is the camera switch.
  check('once in a call the rail button counts the room and switches the camera',
    /人/.test(await rail(a)), await rail(a));
  await a.click('#voice-mute');

  // Walking out is hanging up: no button is pressed on either side.
  await leaveHall(a);
  await b.waitForFunction(() => uspeak.net.voice.state.peers.size === 0, null, { timeout: 90000, polling: 200 });
  check('walking out of the room hangs up, for both of them',
    (await a.evaluate(() => uspeak.net.voice.state.joined)) === false);

  // And the teacher closing it takes everyone out at once.
  await enterHall(a, isle);
  await sleep(600);
  await a.click('#voice-join');
  await a.waitForFunction(() => uspeak.net.voice.state.joined, null, { timeout: 90000, polling: 200 });
  await t.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'voice', on: false }));
  await a.waitForFunction(() => !uspeak.net.voice.state.joined && document.querySelector('#voice-panel').hidden, null, { timeout: 90000, polling: 200 });
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
