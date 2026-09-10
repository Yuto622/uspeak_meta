// Browser end-to-end check for えいごアリーナ島: an avatar walks to a stand, fights, and
// buys its damage with English. Then it feeds a fish at the dojo and finds the move it
// learned waiting as a fifth button.
//
// Run: node test/e2e/browser-arena.mjs   (not part of `npm test`)
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

const PORT = 2627;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const nearLabel = (page) => page.evaluate(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none' ? document.querySelector('#interact span').textContent : ''; });

try {
  const a = await openPage('Riku');
  const island = await a.evaluate(async () => (await (await fetch('arena.json')).json())).then((d) => d.island);
  const easy = island.spots.find((s) => s.id === 'easy');
  const dojo = island.spots.find((s) => s.id === 'dojo');
  const world = (s) => [island.x + s.x, island.z + s.z];

  await a.evaluate(() => uspeak.rpg.fly('arena'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on えいごアリーナ島', at.space === 'arena', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('no closed dialog is eating taps', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !(hit.closest('#battle-dialog') || hit.closest('#dojo-dialog'));
  }));

  const base = await calibrate(a);
  await walkTo(a, 'courtyard', island.x + easy.path.x, island.z + easy.path.z, base, { arrive: 4 });
  await walkTo(a, easy.id, ...world(easy), base);
  check('the stand offers a battle', (await nearLabel(a)).includes(easy.name), await nearLabel(a));

  await a.click('#interact');
  await a.waitForSelector('#battle-dialog[open]', { timeout: 10000 });
  await a.waitForSelector('#battle-body [data-waza]', { timeout: 5000 });
  check('four moves before any fish is eaten', (await a.$$eval('#battle-body [data-waza]', (n) => n.length)) === 4);

  // A strong move asks a question first, and nothing has happened until it is answered.
  const foeBefore = await a.evaluate(() => Number(document.querySelector('.battle-side.foe .battle-name span').textContent.split('/')[0].trim()));
  await a.click('#battle-body [data-waza="super"]');
  await a.waitForSelector('#battle-body [data-answer]', { timeout: 10000 });
  check('the strong move asks an English question', (await a.$$eval('#battle-body [data-answer]', (n) => n.length)) === 3);
  const foeDuring = await a.evaluate(() => Number(document.querySelector('.battle-side.foe .battle-name span').textContent.split('/')[0].trim()));
  check('no damage before the answer', foeDuring === foeBefore, `${foeDuring} vs ${foeBefore}`);
  await a.click('#battle-body [data-answer="0"]');
  await a.waitForSelector('#battle-body [data-waza]', { timeout: 10000 });
  const foeAfter = await a.evaluate(() => Number(document.querySelector('.battle-side.foe .battle-name span').textContent.split('/')[0].trim()));
  check('the answer resolves the turn', foeAfter <= foeBefore, `${foeAfter} vs ${foeBefore}`);

  // Fight it out with the free attack.
  let guard = 0;
  while (guard < 40 && !(await a.$('#battle-body .quiz-done'))) {
    const btn = await a.$('#battle-body [data-waza="poyon"]:not([disabled])');
    if (btn) await btn.click();
    await sleep(450);
    guard += 1;
  }
  check('the battle finishes', !!(await a.$('#battle-body .quiz-done')), `${guard} rounds`);
  const summary = (await a.textContent('#battle-body .quiz-done')).replace(/\s+/g, ' ');
  check('and it pays', /コインを もらいました/.test(summary), summary.slice(0, 60));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-arena-battle.png') });
  await a.click('#battle-close').catch(() => {});
  await sleep(300);

  // ---- おさかな道場: eat a fish, gain a fifth move.
  const fish = await a.evaluate(async () => {
    const { FISH } = await import('./fishing-data.js');
    uspeak.net.room.send('answer', { q: `fish:${FISH[0].id}`, c: FISH[0].id });
    return { id: FISH[0].id, name: FISH[0].name };
  });
  await sleep(600);
  await walkTo(a, 'dojo path', island.x + dojo.path.x, island.z + dojo.path.z, base, { arrive: 4 });
  await walkTo(a, 'dojo', ...world(dojo), base);
  check('the dojo offers itself', (await nearLabel(a)).includes(dojo.name), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#dojo-dialog[open]', { timeout: 10000 });
  check('the caught fish is in the bag', !!(await a.$(`#dojo-body [data-fish="${fish.id}"]`)), fish.name);
  await a.click(`#dojo-body [data-fish="${fish.id}"]`);
  await a.waitForSelector('#dojo-body .dojo-learned', { timeout: 10000 });
  const learned = (await a.textContent('#dojo-body .dojo-learned')).replace(/\s+/g, ' ');
  check('a move is learned from it', /を おぼえた/.test(learned), learned.slice(0, 60));
  check('and the fish is gone', !(await a.$(`#dojo-body [data-fish="${fish.id}"]`)));
  await a.click('#dojo-done');
  await sleep(300);

  await walkTo(a, 'courtyard', island.x + easy.path.x, island.z + easy.path.z, base, { arrive: 4 });
  await walkTo(a, easy.id, ...world(easy), base);
  await a.click('#interact');
  await a.waitForSelector('#battle-body [data-waza]', { timeout: 10000 });
  check('the taught move is now a fifth button', (await a.$$eval('#battle-body [data-waza]', (n) => n.length)) === 5);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-arena-taught.png') });
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
