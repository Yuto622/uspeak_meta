// Browser end-to-end check for まちづくり島: a real avatar walks to the block shop, buys
// a block, walks to the door of their own room, goes in and builds with it. The point
// being checked is that the room is instanced (built on entry from the server's list)
// and that every block placed is one the server agreed to.
//
// Run: node test/e2e/browser-town.mjs   (not part of `npm test`)
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

const PORT = 2624;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const a = await openPage('Sumire');
  const data = await a.evaluate(async () => (await (await fetch('town.json')).json()));
  const island = data.island;
  const world = (p) => [island.x + p.x, island.z + p.z];
  const shop = island.spots.find((s) => s.kind === 'shop');
  const door = island.spots.find((s) => s.kind === 'door');

  await a.evaluate(() => uspeak.rpg.fly('town'));
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(800);
  const at = await pos(a);
  check('arrived on まちづくり島', at.space === 'town', `at (${at.x.toFixed(1)},${at.z.toFixed(1)})`);
  check('no closed dialog is eating taps', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !hit.closest('#town-dialog');
  }));

  const base = await calibrate(a);
  await walkTo(a, 'the block shop', ...world(shop), base);
  check('the shop offers its blocks', (await nearLabel(a)).includes('ブロック'), await nearLabel(a));
  const before = await coins(a);
  await a.click('#interact');
  await a.waitForSelector('#town-dialog[open] .town-block', { timeout: 10000 });
  check('every kind is on the shelf, with its English', (await a.$$eval('#town-body .town-block strong', (n) => n.length)) === data.blocks.length);
  check('the free kind is already owned', (await a.$$eval('#town-body .town-block.owned', (n) => n.length)) === 1);
  const stone = data.blocks.find((b) => b.id === 'stone');
  await a.click('#town-body [data-block="stone"]');
  await a.waitForFunction(() => document.querySelectorAll('#town-body .town-block.owned').length === 2, null, { timeout: 10000, polling: 150 });
  check('the server sold the block', true);
  check('and took the coins', (await coins(a)) === before - stone.price, `${before} → ${await coins(a)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-town-shop.png') });
  await a.click('#town-done').catch(() => {});
  await sleep(300);

  // ---- the room
  await walkTo(a, 'the door of your room', ...world(door), base);
  check('the door offers the room', (await nearLabel(a)).includes('マイルーム'), await nearLabel(a));
  await a.click('#interact');
  await a.waitForFunction(() => uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  check('the room was built on entry, not standing in the town', true);
  check('and being inside is its own place', (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:room');
  check('the building HUD is up with both blocks in the palette',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(',') === 'wood,stone',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(','));

  // Build a little tower where the avatar stands, one block on top of another.
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 1, null, { timeout: 10000, polling: 150 });
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 2, null, { timeout: 10000, polling: 150 });
  check('two blocks are stacked', true);
  await a.click('[data-hand="stone"]');
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 3, null, { timeout: 10000, polling: 150 });
  const kinds = await a.evaluate(() => [...uspeak.net.myRoom.state.cells.keys()]);
  check('the bought block went in too', kinds.length === 3, kinds.join(' '));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-town-room.png') });

  await a.click('#room-remove');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 2, null, { timeout: 10000, polling: 150 });
  check('and one can be taken back out', true);

  // Leaving is a door, not a menu.
  await a.click('#room-exit');
  await a.waitForFunction(() => !uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  await sleep(600);
  check('walking out puts the child back in the town', (await pos(a)).space === 'town');
  check('and the HUD is gone', await a.evaluate(() => document.querySelector('#room-hud').hidden));

  // What was built is on the server: it comes back next time the door opens.
  await walkTo(a, 'the door again', ...world(door), base, { arrive: 3 });
  await a.click('#interact');
  await a.waitForFunction(() => uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  check('the room came back as it was left', (await a.evaluate(() => uspeak.net.myRoom.state.used)) === 2,
    `${await a.evaluate(() => uspeak.net.myRoom.state.used)} blocks`);
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
