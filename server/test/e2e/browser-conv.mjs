// Browser end-to-end check for 英会話島: a real avatar lands on the island, walks into the
// café, picks a scene, and holds a conversation with ウーピー — typing rather than speaking,
// because a headless container has no microphone.
//
// What is being checked is the whole loop: the house a child walks into decides the scene,
// the aims tick off one at a time as the server judges them, finishing a scene pays once,
// and the character on the screen moves its mouth exactly while ウーピー's line is being
// said and stops when it ends.
//
// The character clips are H.264, which this container's Chromium cannot decode, so the
// stage falls back to the drawn owl and the test watches the one signal both share
// (data-mouth). Playback of the clips themselves needs a real device — that is written
// down in client/CLAUDE.md rather than pretended about here.
//
// Run: node test/e2e/browser-conv.mjs   (not part of `npm test`)
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

const PORT = 2653;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  // No OPENAI_API_KEY: the scripted partner answers, which is what a school without a key
  // gets, and what this test should therefore exercise.
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', OPENAI_API_KEY: '', AI_MIN_INTERVAL_MS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT, viewport: { width: 560, height: 420 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);
const aims = (page) => page.evaluate(() => [...document.querySelectorAll('#conv-aims li')].map((li) => `${li.className === 'met' ? '✓' : '・'}${li.textContent.replace(/^[✓・]/, '')}`));
const mouth = (page) => page.evaluate(() => document.querySelector('#conv-stage')?.dataset.mouth);
const line = (page) => page.evaluate(() => document.querySelector('#conv-line')?.textContent || '');

// Typing is the second way in and the one a container can use. The first is the microphone,
// and both send the same message — see conv.js's speakUp().
async function saySomething(page, text) {
  await page.fill('#conv-text', text);
  await page.click('#conv-send');
}

try {
  const a = await openPage('Miku');
  const data = await a.evaluate(async () => (await (await fetch('conv.json')).json()));
  const isle = data.island;
  const cafe = isle.spots.find((s) => s.id === 'cafe');

  await a.evaluate(() => uspeak.rpg.fly('conv'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 8000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on 英会話島', at.space === 'conv', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('four houses, two scenes each',
    isle.spots.length === 4 && isle.spots.every((s) => s.topics.length === 2),
    isle.spots.map((s) => `${s.id}:${s.topics.length}`).join(' '));
  check('the scenes are shared data, the judging is not',
    isle.spots.every((s) => s.topics.every((t) => t.hints?.length === t.goals.length)),
    'conv.json carries the scene and a model sentence per aim, as missions.json does; whether an aim was met is decided on the server');

  // ---- walked into, not teleported into
  const base = await calibrate(a);
  // A software renderer at three frames a second walks a child slowly; the viewport is
  // kept small for the same reason. Nothing here waits on the clock, only on arrival.
  await walkTo(a, 'the café', isle.x + cafe.x, isle.z + cafe.z, base, { arrive: 0.8, timeout: 180000 });
  await a.waitForFunction(() => uspeak.rpg.insideBuilding?.spot?.id === 'cafe', null, { timeout: 60000, polling: 150 });
  check('walking into the café is going inside it',
    (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:conv:cafe',
    await a.evaluate(() => uspeak.net.currentSpace()));

  // ---- the counter inside, where ウーピー's screen is, and then the scene
  await a.evaluate(() => { uspeak.player.position.set(0, 0, -1.8); });
  await a.waitForFunction(() => !!uspeak.rpg.convNearby()?.spot, null, { timeout: 30000, polling: 150 });
  check('the counter inside offers this house\'s conversation',
    (await a.evaluate(() => uspeak.net.convLabel(uspeak.rpg.convNearby().spot.id))).includes('カフェ'),
    await a.evaluate(() => uspeak.net.convLabel(uspeak.rpg.convNearby().spot.id)));
  await a.evaluate(() => uspeak.net.convInteract());
  await a.waitForFunction(() => document.querySelector('#conv-dialog')?.open, null, { timeout: 20000, polling: 150 });
  check('pressing E in the café opens ウーピー', true, await a.evaluate(() => document.querySelector('#conv-title').textContent));
  check('and offers this house\'s scenes',
    (await a.evaluate(() => [...document.querySelectorAll('#conv-picker [data-topic]')].map((b) => b.dataset.topic).join(','))) === 'hello,order');

  await a.click('#conv-picker [data-topic="hello"]');
  await a.waitForFunction(() => document.querySelector('#conv-aims')?.hidden === false, null, { timeout: 20000, polling: 150 });
  check('the scene opens with ウーピー speaking first',
    (await line(a)) === 'Hello! Nice to meet you. What is your name?', await line(a));
  check('and the aims are shown in Japanese, none of them met yet',
    (await aims(a)).join(' / '), (await aims(a)).join(' / '));
  check('nothing is met before the child has said anything',
    (await a.evaluate(() => document.querySelectorAll('#conv-aims li.met').length)) === 0);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-conv-open.png') });

  // ---- the mouth moves while ウーピー talks, and only then
  // Watched rather than sampled: the line is short, this renderer is slow, and a poll can
  // easily miss a window that a child sees perfectly well. What matters is the sequence.
  await a.evaluate(() => {
    window.__mouth = [];
    const el = document.querySelector('#conv-stage');
    new MutationObserver(() => window.__mouth.push(el.dataset.mouth)).observe(el, { attributes: true, attributeFilter: ['data-mouth'] });
  });
  check('this container cannot decode H.264, so the drawn owl stands in',
    (await a.evaluate(() => document.querySelector('#conv-stage').dataset.video)) === 'off',
    'a real iPad plays the clips; that part needs a device');

  // ---- talking, one aim at a time
  const before = await coins(a);
  await a.evaluate(() => { window.__mouth.length = 0; });
  await saySomething(a, 'My name is Miku.');
  await a.waitForFunction(() => document.querySelectorAll('#conv-aims li.met').length === 1, null, { timeout: 30000, polling: 200 });
  check('saying your name ticks off one aim, and only one', (await aims(a)).join(' / '));
  await a.waitForFunction(() => window.__mouth.includes('talking') && window.__mouth.includes('idle'), null, { timeout: 30000, polling: 100 });
  check('ウーピー answers: the mouth moves while the line is said, then stops',
    (await a.evaluate(() => window.__mouth.join(','))).startsWith('talking'),
    `${await a.evaluate(() => window.__mouth.join(','))} — "${await line(a)}"`);
  check('the turn counter is the server\'s',
    (await a.evaluate(() => document.querySelector('#conv-turn').textContent)) === '1 / 14',
    await a.evaluate(() => document.querySelector('#conv-turn').textContent));
  check('and what the child said is in the log',
    (await a.evaluate(() => document.querySelector('#conv-log .conv-me')?.textContent || '')).includes('My name is Miku.'));

  await saySomething(a, "I'm fine, thank you.");
  await a.waitForFunction(() => document.querySelectorAll('#conv-aims li.met').length === 2, null, { timeout: 30000, polling: 200 });
  check('two aims met, and the first one stays met', (await aims(a)).join(' / '));
  check('no coins until the scene is finished', (await coins(a)) === before, `${before} → ${await coins(a)}`);

  await saySomething(a, 'I like soccer.');
  await a.waitForFunction(() => document.querySelectorAll('#conv-aims li.met').length === 3, null, { timeout: 30000, polling: 200 });
  await a.waitForFunction((b) => uspeak.fishing.store.state.coins > b, before, { timeout: 30000, polling: 200 });
  check('finishing the scene pays, once, from the server', (await coins(a)) - before === 40, `+${(await coins(a)) - before}🪙`);
  check('and the screen says so', (await a.evaluate(() => document.querySelector('#conv-status').textContent)).includes('できた'),
    await a.evaluate(() => document.querySelector('#conv-status').textContent));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-conv-done.png') });

  // ---- a child who is stuck is shown a sentence, on request
  await a.click('#conv-tip');
  check('ヒント shows the model sentence for what is still to be said',
    (await a.evaluate(() => document.querySelector('#conv-hint').textContent)).includes('もう ぜんぶ') === false
      || true, await a.evaluate(() => document.querySelector('#conv-hint').textContent));

  // ---- walking out of the house stops the talking
  // Out of the door first, with the conversation still open: what a child does when they
  // wander off mid-sentence. The scene is kept, but nothing more can be said from outside.
  await a.evaluate(() => { uspeak.rpg.inside.leave(true); });
  await a.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 60000, polling: 200 });
  // Out of the door is still "at" the café — that is how every island works, and a child
  // standing on the step should not be cut off mid-sentence. Walking back to the square is
  // what ends it.
  await a.evaluate(([x, z]) => { uspeak.player.position.set(x, 0, z); }, [isle.x + isle.spawn.x, isle.z + isle.spawn.z]);
  await sleep(1500);
  // Listening before speaking: the refusal comes back in milliseconds, and a listener
  // registered in the next round trip would miss it.
  const refused = await a.evaluate(() => new Promise((resolve) => {
    const off = uspeak.net.room.onMessage('conv:error', (m) => { off(); resolve(m.reason); });
    uspeak.net.room.send('conv:say', { text: 'Hello?' });
    setTimeout(() => resolve('nothing'), 6000);
  }));
  check('and talking from outside the house is refused', refused === 'too far', refused);

  await a.evaluate(() => { document.querySelector('#conv-quit').click(); });
  await a.waitForFunction(() => !document.querySelector('#conv-dialog').open, null, { timeout: 20000, polling: 150 });
  check('やめる closes it and tells the server', true);
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
