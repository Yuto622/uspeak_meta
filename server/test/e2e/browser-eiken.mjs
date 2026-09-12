// Browser end-to-end check for 英検の島: a real avatar lands on the 5級 island, walks into
// the 読む hall, answers a question there and is paid for it by the server, then visits
// the other three halls and gets the screen each skill is supposed to give. The points
// being checked are that the hall a child stands in decides the skill, that the page is
// never sent the answer, and that the four screens all reach the server.
//
// Run: node test/e2e/browser-eiken.mjs   (not part of `npm test`)
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

const PORT = 2627;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT, viewport: { width: 520, height: 380 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);
const screen = (page) => page.evaluate(() => document.querySelector('#eiken-body')?.textContent?.replace(/\s+/g, ' ').trim() || '');

try {
  const a = await openPage('Nanami');
  const data = await a.evaluate(async () => (await (await fetch('eiken.json')).json()));
  const isle = data.islands.find((i) => i.id === 'eiken5');
  const hall = (skill) => isle.spots.find((s) => s.skill === skill);
  const world = (s) => [isle.x + s.x, isle.z + s.z];

  await a.evaluate(() => uspeak.rpg.fly('eiken5'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on 英検5級の島', at.space === 'eiken5', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('three 英検 islands exist, four halls and an interview room each',
    data.islands.length === 3
      && data.islands.every((i) => i.spots.filter((s) => s.skill).length === 4)
      && data.islands.every((i) => i.spots.some((s) => s.kind === 'interview')),
    data.islands.map((i) => `${i.badge}:${i.spots.length}`).join(' '));

  // ---- 読む, walked to rather than teleported to
  const base = await calibrate(a);
  await walkTo(a, 'the 読む hall', ...world(hall('reading')), base, { arrive: 0.8, timeout: 90000 });
  await a.waitForFunction(() => uspeak.rpg.insideBuilding?.spot?.id === 'reading', null, { timeout: 30000, polling: 150 });
  check('walking into the hall is going inside it', true);
  check('and inside is its own place, named after the hall',
    (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:eiken5:reading',
    await a.evaluate(() => uspeak.net.currentSpace()));

  // The counter inside is where the practice starts, exactly like every other island.
  await a.evaluate(() => { uspeak.player.position.set(0, 0, -1.8); });
  await a.waitForFunction(() => !!uspeak.rpg.eikenNearby()?.spot, null, { timeout: 30000, polling: 150 });
  check('the counter offers the skill this hall teaches',
    (await a.evaluate(() => uspeak.net.eikenLabel(uspeak.rpg.eikenNearby().spot))).includes('読む'),
    await a.evaluate(() => uspeak.net.eikenLabel(uspeak.rpg.eikenNearby().spot)));

  const before = await coins(a);
  await a.evaluate(() => uspeak.net.eikenInteract());
  await a.waitForSelector('#eiken-dialog[open] .eiken-choices', { timeout: 20000 });
  check('a passage, a question and four options', (await a.$$eval('#eiken-choices, #eiken-body [data-choice]', (n) => n.length)) === 4,
    `${await a.$$eval('#eiken-body [data-choice]', (n) => n.length)} options`);
  check('the page was never told which one is right', await a.evaluate(() => {
    const body = document.querySelector('#eiken-body').innerHTML;
    return !/right|correct|answer="/.test(body);
  }));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-eiken-reading.png') });

  // Answer every option in turn until the server says one was right: the page cannot know
  // which, and neither can this test — that is the point.
  let paid = false;
  for (let i = 0; i < 4 && !paid; i += 1) {
    const asked = await a.evaluate(() => document.querySelector('#eiken-body .eiken-q')?.textContent || '');
    await a.click(`#eiken-body [data-choice="${i}"]`);
    await a.waitForFunction((was) => {
      const feedback = document.querySelector('#eiken-body .quiz-feedback');
      return !!feedback || (document.querySelector('#eiken-body .eiken-q')?.textContent || '') !== was;
    }, asked, { timeout: 20000, polling: 200 });
    const line = await screen(a);
    if (line.includes('せいかい')) paid = true;
    await sleep(2800);           // the screen moves itself on to the next question
  }
  check('the server graded it and paid for the right one', paid && (await coins(a)) > before,
    `${before} → ${await coins(a)}`);

  // ---- the other three halls, from the doorway
  for (const skill of ['listening', 'writing', 'speaking']) {
    const spot = hall(skill);
    await a.evaluate(() => { document.querySelector('#eiken-quit')?.click(); });
    await sleep(400);
    await a.evaluate(([x, z]) => { uspeak.rpg.inside.leave(true); uspeak.player.position.set(x, 0, z); }, world(spot));
    await a.waitForFunction((id) => uspeak.rpg.insideBuilding?.spot?.id === id, spot.id, { timeout: 30000, polling: 150 });
    await a.evaluate(() => { uspeak.player.position.set(0, 0, -1.8); });
    await a.waitForFunction(() => !!uspeak.rpg.eikenNearby()?.spot, null, { timeout: 30000, polling: 150 });
    await a.evaluate(() => uspeak.net.eikenInteract());
    await a.waitForFunction(() => !!document.querySelector('#eiken-dialog[open] .quiz-actions'), null, { timeout: 20000, polling: 200 });
    const body = await screen(a);
    const head = await a.evaluate(() => document.querySelector('#eiken-eyebrow').textContent);
    if (skill === 'listening') {
      check('聞く gives an ear and four meanings', head.includes('LISTENING') && body.includes('きく'), head);
      check('and the sentence is not written down until it has been answered', !(await a.evaluate(() => !!document.querySelector('.eiken-said')?.textContent?.match(/[a-z]{3}/i))));
    }
    if (skill === 'writing') {
      const tiles = await a.$$eval('#eiken-body [data-tile]', (n) => n.map((x) => x.textContent));
      check('書く gives the words of the sentence, shuffled', head.includes('WRITING') && tiles.length >= 3, tiles.join(' '));
      // Build it in whatever order the tiles came in — almost certainly wrong, which is
      // the point: the server has to be the one that says so. Every tap redraws the row,
      // so each tile is found again rather than held on to.
      for (let i = 0; i < tiles.length; i += 1) {
        await a.click('#eiken-body [data-tile]:not([disabled])');
        await a.waitForFunction((n) => document.querySelectorAll('#eiken-body [data-tile]:not([disabled])').length === n, tiles.length - i - 1, { timeout: 10000, polling: 100 });
      }
      await a.click('#eiken-done');
      await a.waitForSelector('#eiken-body .quiz-feedback', { timeout: 20000 });
      check('and the server marks the order, not the page', (await screen(a)).includes('こたえは'));
      await a.screenshot({ path: path.join(SHOTS, 'e2e-eiken-writing.png') });
    }
    if (skill === 'speaking') {
      check('話す gives a sentence to say, with a microphone', head.includes('SPEAKING') && body.includes('言ってみる'), head);
      // No microphone in a headless browser: the typed fallback is the same message.
      const said = await a.evaluate(() => document.querySelector('.eiken-say strong').textContent);
      await a.evaluate((text) => {
        const box = document.querySelector('#eiken-typed');
        box.value = text;
        document.querySelector('#eiken-send').click();
      }, said);
      await a.waitForSelector('#eiken-body .quiz-feedback', { timeout: 20000 });
      check('saying the sentence is judged by the server, from the words only',
        (await screen(a)).includes('せいかい'), (await screen(a)).slice(0, 60));
      await a.screenshot({ path: path.join(SHOTS, 'e2e-eiken-speaking.png') });
    }
  }

  // Leaving is a doorway, like everywhere else.
  await a.evaluate(() => { document.querySelector('#eiken-quit')?.click(); });
  await sleep(400);
  await a.evaluate(() => { uspeak.player.position.z = 9.4; });
  await a.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 30000, polling: 150 });
  check('walking out puts the child back on the island', (await pos(a)).space === 'eiken5');
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
