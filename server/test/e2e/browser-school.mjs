// Browser end-to-end check for ことばの学校島: a real avatar walks into a hut and answers
// ten questions there. The point being checked is that the difficulty is chosen by which
// building you walk into, and that the page never holds the answers.
//
// Run: node test/e2e/browser-school.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');

const PORT = 2619;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);
const nearLabel = (page) => page.evaluate(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none' ? document.querySelector('#interact span').textContent : ''; });

try {
  const a = await openPage('Sora');
  const school = await a.evaluate(async () => (await (await fetch('school.json')).json())).then((d) => d.island);
  const easy = school.spots.find((s) => s.id === 'easy');
  const world = (s) => [school.x + s.x, school.z + s.z];

  await a.evaluate(() => uspeak.rpg.fly('school'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on ことばの学校島', at.space === 'school', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('the closed quiz dialog takes no space', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !hit.closest('#quiz-dialog');
  }));
  // Nothing the page can reach holds the bank; only the server does.
  check('the browser cannot fetch the question bank', await a.evaluate(async () => {
    const island = await (await fetch('school.json')).json();
    // The island data describes buildings, not questions.
    if (island.island.spots.some((s) => 'choices' in s || 'answer' in s || 'q' in s)) return false;
    for (const guess of ['word-quiz.json', 'game/word-quiz.json', '../server/src/game/word-quiz.json']) {
      try {
        const r = await fetch(guess);
        if (r.ok && /"answer"\s*:/.test(await r.text())) return false;
      } catch { /* unreachable is the point */ }
    }
    return true;
  }));

  const base = await calibrate(a);
  await walkTo(a, easy.id, ...world(easy), base);
  check('the hut offers its quiz', (await nearLabel(a)).includes(easy.name), await nearLabel(a));

  const coins0 = await coins(a);
  await a.click('#interact');
  await a.waitForSelector('#quiz-dialog[open]', { timeout: 10000 });
  await a.waitForSelector('[data-choice="0"]', { timeout: 5000 });
  check('a question and four choices appear', (await a.$$eval('[data-choice]', (n) => n.length)) === 4);
  // And the rendered page carries no hint of which one it is.
  check('the page does not mark the right choice before answering', await a.evaluate(() =>
    ![...document.querySelectorAll('[data-choice]')].some((b) => b.className.trim() || b.disabled)));
  check('the score line counts the set', (await a.textContent('#quiz-score')).includes('/ 10'), await a.textContent('#quiz-score'));

  // Answer all ten by always picking A. Some land; the server decides which.
  let answered = 0;
  for (let i = 0; i < 10; i += 1) {
    await a.waitForSelector('[data-choice="0"]:not([disabled])', { timeout: 15000 });
    await a.click('[data-choice="0"]');
    await a.waitForSelector('.quiz-feedback, .quiz-done', { timeout: 15000 });
    answered += 1;
    await sleep(1600);
  }
  check('all ten were answered', answered === 10);
  await a.waitForSelector('.quiz-done', { timeout: 15000 });
  const summary = await a.textContent('.quiz-done');
  check('the set ends with a score', /\/ 10 せいかい/.test(summary), summary.replace(/\s+/g, ' ').slice(0, 80));

  const earned = (await coins(a)) - coins0;
  const score = Number(summary.match(/(\d+) \/ 10/)?.[1] ?? -1);
  check('coins match the score the server gave', earned === score * 10 || earned === score * 10 + 10, `earned=${earned} score=${score}`);
  const header = await a.evaluate(() => document.querySelector('#xp').textContent);
  check('XP matches the score too', Number(header.replace(/,/g, '')) === score * 10, `xp=${header} score=${score}`);

  // ---- ことばのジム: walk on to the gym and do a speaking set with the text fallback.
  await a.click('#quiz-close').catch(() => {});
  await sleep(300);
  const gymSpot = school.spots.find((sp) => sp.id === 'gym');
  // Via the courtyard, which is where the island's paths meet: walking straight from a
  // hut clips the corner of another one, exactly as it would for a child.
  await walkTo(a, 'courtyard', school.x, school.z + 12, base, { arrive: 4 });
  await walkTo(a, 'gym', ...world(gymSpot), base);
  check('the gym offers itself', (await nearLabel(a)).includes(gymSpot.name), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#gym-dialog[open]', { timeout: 10000 });
  check('both drills are offered', (await a.$$eval('[data-mode]', (n) => n.map((x) => x.dataset.mode))).join(',') === 'listen,speak');

  const gymCoins = await coins(a);
  await a.click('[data-mode="speak"]');
  await a.waitForSelector('#gym-text', { timeout: 10000 });
  let said = 0;
  for (let i = 0; i < 5; i += 1) {
    await a.waitForSelector('#gym-text:not([disabled])', { timeout: 15000 });
    const word = await a.textContent('.gym-speak strong');
    await a.fill('#gym-text', word.trim());
    await a.click('#gym-send');
    await a.waitForSelector('.quiz-feedback, .quiz-done', { timeout: 15000 });
    said += 1;
    await sleep(1800);
  }
  check('all five were spoken', said === 5);
  await a.waitForSelector('.gym-stars', { timeout: 15000 });
  const stars = await a.textContent('.gym-stars');
  check('a clean set is three stars', stars.trim() === '★★★', stars.trim());
  check('the gym pays 5 coins a word', (await coins(a)) - gymCoins === 25, `earned=${(await coins(a)) - gymCoins}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-gym-done.png') });

  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await a.screenshot({ path: path.join(SHOTS, 'e2e-school-done.png') });
  await a.click('#quiz-close').catch(() => {});
  await sleep(400);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-school-island.png') });
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
