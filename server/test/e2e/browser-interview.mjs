// めんせつの間, in a real browser: a child lands on 英検5級の島, walks to the fifth
// building at the head of the island, sits down, reads the passage aloud, answers the
// questions and takes the result card.
//
// What is being checked is the thing that makes this an exam rather than a quiz: the
// passage comes first and the questions come one at a time, the model answer is not on
// the page until the child has answered, a wrong answer still moves the interview on,
// and the coins are paid once at the end by the server.
//
// Typed rather than spoken, because a headless container has no microphone — the two
// paths send the same message (see interview.js's answer()). The character is the same
// two clips as 英会話島, which this container cannot decode, so the drawn owl stands in
// and the test watches data-mouth, the one signal both share.
//
// Run: node test/e2e/browser-interview.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');
mkdirSync(SHOTS, { recursive: true });

const PORT = 2657;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  // No key: the scripted examiner and the scripted comment, which is what a school
  // without an API key gets and therefore what this test should exercise.
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', OPENAI_API_KEY: '', ANSWER_MIN_INTERVAL_MS: '0' },
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
const card = (page) => page.evaluate(() => document.querySelector('#iv-card')?.textContent?.replace(/\s+/g, ' ').trim() || '');
const marks = (page) => page.evaluate(() => [...document.querySelectorAll('#iv-marks i')].map((i) => i.className || '-'));
const answer = async (page, text) => { await page.fill('#iv-text', text); await page.click('#iv-send'); };

// The bank is the server's, and the test reads it the way a teacher would: from disk.
const BANK = JSON.parse(readFileSync(path.resolve(serverDir, 'src/game/interview-bank.json'), 'utf8')).grades;

try {
  const a = await openPage('Yui');
  const data = await a.evaluate(async () => (await (await fetch('eiken.json')).json()));
  const isle = data.islands.find((i) => i.id === 'eiken5');
  const room = isle.spots.find((s) => s.id === 'interview');
  check('every 英検 island has an interview room, in the same place on all three',
    data.islands.every((i) => i.spots.some((s) => s.id === 'interview' && s.x === room.x && s.z === room.z)),
    `(${room.x},${room.z})`);
  check('and it is not one of the four skills',
    data.islands.every((i) => i.spots.filter((s) => s.skill).length === 4 && !room.skill));

  await a.evaluate(() => uspeak.rpg.fly('eiken5'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 8000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  check('arrived on 英検5級の島', (await pos(a)).space === 'eiken5');

  // ---- walked to, not teleported to
  const base = await calibrate(a);
  await walkTo(a, 'the interview room', isle.x + room.x, isle.z + room.z, base, { arrive: 1.2, timeout: 200000 });
  await a.waitForFunction(() => uspeak.rpg.eikenNearby()?.spot?.id === 'interview', null, { timeout: 60000, polling: 200 });
  check('walking to the head of the island reaches the interview room',
    (await a.evaluate(() => uspeak.net.eikenLabel(uspeak.rpg.eikenNearby().spot))).includes('めんせつ'),
    await a.evaluate(() => uspeak.net.eikenLabel(uspeak.rpg.eikenNearby().spot)));

  // ---- the card, and the passage before anything else
  await a.evaluate(() => uspeak.net.eikenInteract());
  await a.waitForFunction(() => document.querySelector('#iv-dialog')?.open, null, { timeout: 20000, polling: 150 });
  const opened = await card(a);
  const source = BANK.g5.cards.find((c) => opened.includes(c.passage.slice(0, 24)));
  check('it opens with the passage to read aloud, not with a question',
    !!source && opened.includes('音読'), opened.slice(0, 60));
  check('and nothing on the page is an answer to a question nobody has asked',
    !!source && source.steps.every((s) => !opened.includes(s.model) && !opened.includes(s.q)),
    'the model answers and the questions stay on the server until they are due');
  await a.screenshot({ path: path.join(SHOTS, 'e2e-interview-read.png') });

  // ---- the mouth moves while the examiner speaks, and only then
  await a.evaluate(() => {
    window.__mouth = [];
    const el = document.querySelector('#iv-stage');
    new MutationObserver(() => window.__mouth.push(el.dataset.mouth)).observe(el, { attributes: true, attributeFilter: ['data-mouth'] });
  });
  check('this container cannot decode H.264, so the drawn owl stands in',
    (await a.evaluate(() => document.querySelector('#iv-stage').dataset.video)) === 'off',
    'a real iPad plays the clips; that part needs a device');

  // ---- reading the passage brings the first question
  await answer(a, source.passage);
  await a.waitForFunction(() => (document.querySelector('#iv-step')?.textContent || '').includes('/'), null, { timeout: 30000, polling: 150 });
  const first = await card(a);
  check('reading the passage counts, and the first question follows it',
    first.includes(source.steps[0].q), first.slice(0, 80));
  check('the marks show one part done and the next one waiting',
    (await marks(a)).slice(0, 2).join(',') === 'ok,now', (await marks(a)).join(','));

  // ---- a wrong answer is marked wrong, shows the model, and moves on
  await answer(a, 'banana banana banana');
  await a.waitForFunction(() => (document.querySelector('#iv-card')?.textContent || '').includes('お手本'), null, { timeout: 30000, polling: 150 })
    .catch(() => {});
  const afterWrong = await card(a);
  check('a wrong answer is told the model answer, afterwards',
    afterWrong.includes(source.steps[0].model), afterWrong.slice(0, 90));
  check('and the interview goes on rather than stopping',
    afterWrong.includes(source.steps[1].q), afterWrong.slice(0, 90));
  check('the marks show it as missed', (await marks(a))[1] === 'no', (await marks(a)).join(','));

  // ---- the rest, answered from the bank's own model answers
  const before = await coins(a);
  for (let i = 1; i < source.steps.length; i += 1) {
    await answer(a, source.steps[i].model);
    await sleep(700);
  }
  await a.waitForFunction(() => !document.querySelector('#iv-result')?.hidden, null, { timeout: 30000, polling: 200 });
  const result = await a.evaluate(() => document.querySelector('#iv-result').textContent.replace(/\s+/g, ' ').trim());
  check('the last answer brings the result card', result.includes('/'), result.slice(0, 80));
  check('which counts the reading as one of the parts',
    result.includes(`${source.steps.length} / ${source.steps.length + 1}`), result.slice(0, 40));
  check('ウーピー says what to practise next', /れんしゅう|音読|ぜんぶ/.test(result), result.slice(0, 120));
  check('and finishing the interview pays, from the server',
    (await coins(a)) > before, `${before} → ${await coins(a)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-interview-result.png') });

  // The mouth moved while the examiner was speaking and stopped afterwards.
  const mouthLog = await a.evaluate(() => window.__mouth || []);
  check('the mouth moves only while ウーピー is speaking',
    mouthLog.includes('talking') && mouthLog.includes('idle') && mouthLog.at(-1) === 'idle',
    mouthLog.join(','));

  // ---- a second sitting is a different card, and walking out ends it
  await a.click('#iv-again-run');
  await a.waitForFunction(() => document.querySelector('#iv-result')?.hidden !== false, null, { timeout: 20000, polling: 150 });
  await sleep(900);
  const second = await card(a);
  check('a second interview is a different card', !second.includes(source.passage.slice(0, 24)), second.slice(0, 60));

  // Walking out of the room: the room refuses to mark anything until the child is back.
  await a.evaluate(([x, z]) => { uspeak.player.position.set(x, 0, z); }, [isle.x, isle.z]);
  await sleep(900);
  await answer(a, 'hello');
  await sleep(900);
  check('answering from outside the room is refused',
    (await a.evaluate(() => document.querySelector('#iv-status')?.textContent || '')).includes('めんせつの間'),
    await a.evaluate(() => document.querySelector('#iv-status')?.textContent || ''));
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
