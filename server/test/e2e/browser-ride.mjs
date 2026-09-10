// Browser end-to-end check for のりもの島: a real avatar walks to a gate, buys the
// vehicle standing there, and then drives the course through six checkpoints in order.
// The point being checked is that both the gate and the lap are walked, and that the
// coins and the lap time come back from the server.
//
// Run: node test/e2e/browser-ride.mjs   (not part of `npm test`)
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

const PORT = 2623;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT, viewport: { width: 420, height: 320 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);
const nearLabel = (page) => page.evaluate(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none' ? document.querySelector('#interact span').textContent : ''; });

try {
  const a = await openPage('Kaito');
  const data = await a.evaluate(async () => (await (await fetch('vehicles.json')).json()));
  const island = data.island;
  const world = (p) => [island.x + p.x, island.z + p.z];
  const gate = island.spots.find((s) => s.vehicle === 'kick');
  const start = island.spots.find((s) => s.kind === 'start');

  await a.evaluate(() => uspeak.rpg.fly('ride'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on のりもの島', at.space === 'ride', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('no closed dialog is eating taps', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !hit.closest('#ride-dialog');
  }));

  const base = await calibrate(a);
  // On foot, the start line is where a child chooses: it must not simply refuse them.
  await walkTo(a, 'the start line first', ...world(start), base, { arrive: 2.2 });
  await a.click('#interact');
  await a.waitForSelector('#ride-dialog[open] .ride-lead', { timeout: 10000 });
  check('the start line explains what is missing, on foot',
    (await a.textContent('#ride-body .ride-lead')).includes('のりもの'), (await a.textContent('#ride-body .ride-lead')).slice(0, 40));
  check('and it is the garage, not a dead end', (await a.$$eval('#ride-body .ride-card', (n) => n.length)) === 4);
  await a.click('#ride-done').catch(() => {});
  await sleep(300);

  await walkTo(a, `gate ${gate.id}`, ...world(gate), base);
  check('the gate offers its vehicle', (await nearLabel(a)).includes('キックボード'), await nearLabel(a));

  const before = await coins(a);
  await a.click('#interact');
  await a.waitForSelector('#ride-dialog[open] .ride-card', { timeout: 10000 });
  check('all four vehicles are shown, dearest last', (await a.$$eval('#ride-body .ride-card .ride-name strong', (n) => n.length)) === 4);
  check('only the gate you stand at can sell you one', (await a.$$eval('#ride-body [data-buy]', (n) => n.length)) === 1);
  await a.click('#ride-body [data-buy]');
  await a.waitForFunction(() => uspeak.net.ride.riding === 'kick', null, { timeout: 10000, polling: 150 });
  check('the server sold it and put the child on it', true);
  check('and took the coins', (await coins(a)) === before - 100, `${before} → ${await coins(a)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-ride-garage.png') });
  await a.click('#ride-done').catch(() => {});
  await sleep(300);

  // A vehicle is a speed: the same walk has to be quicker on it.
  check('a vehicle is faster than feet', await a.evaluate(() => uspeak.net.speed()) > 1, `speed ${await a.evaluate(() => uspeak.net.speed())}`);

  // ---- drive the course
  await walkTo(a, 'the start line', ...world(start), base);
  check('the start line offers the course', (await nearLabel(a)).includes('コース'), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#ride-hud:not([hidden])', { timeout: 10000 });
  check('the course started with a word to drive to', (await a.textContent('#ride-hud-word')) === data.course.gates[0].word, await a.textContent('#ride-hud-word'));

  let drove = 0;
  for (const g of data.course.gates) {
    await walkTo(a, `checkpoint ${g.word}`, ...world(g), base, { arrive: 2.2, timeout: 90000 });
    // The world reports the crossing; the server decides whether it counted.
    const ok = await a.waitForFunction((id) => uspeak.net.ride.state.next?.id !== id || !uspeak.net.ride.state.lap, g.id, { timeout: 12000, polling: 150 }).then(() => true).catch(() => false);
    if (!ok) break;
    drove += 1;
  }
  check('all six checkpoints were driven in order', drove === data.course.gates.length, `${drove}/${data.course.gates.length}`);
  check('the lap finished and the HUD went away', await a.evaluate(() => document.querySelector('#ride-hud').hidden));
  const toastText = await a.evaluate(() => document.querySelector('#toast').textContent);
  check('the server timed the lap and paid for it', /ゴール/.test(toastText), toastText);
  check('the lap coins arrived', (await coins(a)) === before - 100 + data.course.reward.coins, `coins=${await coins(a)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-ride-lap.png') });
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
