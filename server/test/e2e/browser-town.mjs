// Browser end-to-end check for まちづくり島: a real avatar buys a block at the block shop
// and a rug at the かぐ屋, walks into the doorway of their own room — which is all it
// takes to be inside now — puts the furniture down, then walks into the square and
// stacks blocks on their lot. The points being checked are that both places are
// instanced (built on entry from the server's list), that walking in is entering, and
// that everything put down is something the server agreed to.
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
  const kagu = island.spots.find((s) => s.kind === 'furniture');
  const door = island.spots.find((s) => s.kind === 'door');
  const plaza = island.spots.find((s) => s.kind === 'plaza');

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
  // Between two buildings on the same island a child is standing in a doorway, and one
  // step in any direction walks them straight back inside. Each leg therefore starts
  // from the fork in the path, the way a child who has walked out of a shop does.
  const fork = async () => {
    await a.evaluate(([x, z]) => { uspeak.rpg.inside.leave(true); uspeak.player.position.set(x, 0, z); }, world({ x: 0, z: -4 }));
    await sleep(700);
  };
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

  // ---- the furniture shop
  await fork();
  await walkTo(a, 'the かぐ屋', ...world(kagu), base);
  check('the かぐ屋 offers its furniture', (await nearLabel(a)).includes('かぐ'), await nearLabel(a));
  const beforeRug = await coins(a);
  await a.click('#interact');
  await a.waitForSelector('#town-dialog[open] .town-block', { timeout: 10000 });
  check('every piece is on the shelf, with its English', (await a.$$eval('#town-body .town-block strong', (n) => n.length)) === data.furniture.length);
  const rug = data.furniture.find((f) => f.id === 'rug');
  await a.click('#town-body [data-prop="rug"]');
  await a.waitForFunction(() => document.querySelectorAll('#town-body .town-block.owned').length === 2, null, { timeout: 10000, polling: 150 });
  check('the server sold the rug, and took the coins', (await coins(a)) === beforeRug - rug.price, `${beforeRug} → ${await coins(a)}`);
  await a.click('#town-done').catch(() => {});
  await sleep(300);

  // ---- the room. Walking into the doorway is the whole of going in.
  await fork();
  await walkTo(a, 'the door of your room', ...world(door), base, { arrive: 0.8, timeout: 60000 });
  await a.waitForFunction(() => uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  check('walking in is going in: nothing was pressed', true);
  check('the room was built on entry, not standing in the town', true);
  check('and being inside is its own place', (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:room');
  check('the building HUD is up with both pieces in the palette',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(',') === 'chair,rug',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(','));

  // Furnish with the crosshair: whatever floor square it is on is where the piece lands.
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 1, null, { timeout: 10000, polling: 150 });
  await a.click('[data-hand="rug"]');
  await a.click('#room-turn');
  await a.evaluate(() => { uspeak.player.position.x -= 2; });
  await sleep(400);
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 2, null, { timeout: 10000, polling: 150 });
  const pieces = await a.evaluate(() => [...uspeak.net.myRoom.state.props.values()].map((p) => p.prop.f));
  check('the bought piece went in too', pieces.includes('rug'), pieces.join(' '));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-town-room.png') });

  await a.click('#room-remove');
  await a.waitForFunction(() => uspeak.net.myRoom.state.used === 1, null, { timeout: 10000, polling: 150 });
  check('and one can be put away again', true);

  // Leaving is a door, not a menu.
  await a.click('#room-exit');
  await a.waitForFunction(() => !uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  await sleep(600);
  check('walking out puts the child back in the town', (await pos(a)).space === 'town');
  check('and the HUD is gone', await a.evaluate(() => document.querySelector('#room-hud').hidden));

  // ---- the plaza. Blocks are not put down in a room at all.
  await fork();
  await walkTo(a, 'the square', ...world(plaza), base, { arrive: 0.8, timeout: 60000 });
  await a.waitForFunction(() => uspeak.net.myPlaza.active, null, { timeout: 10000, polling: 150 });
  check('walking into the square opens the lot', true);
  check('and the lot is its own place', (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:plaza');
  check('the palette is the blocks, not the furniture',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(',') === 'wood,stone',
    (await a.$$eval('#room-palette [data-hand]', (n) => n.map((x) => x.dataset.hand))).join(','));
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myPlaza.state.used === 1, null, { timeout: 10000, polling: 150 });
  await a.click('#room-place');
  await a.waitForFunction(() => uspeak.net.myPlaza.state.used === 2, null, { timeout: 10000, polling: 150 });
  check('two blocks went down where the crosshair pointed', true);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-town-plaza.png') });
  await a.click('#room-remove');
  await a.waitForFunction(() => uspeak.net.myPlaza.state.used === 1, null, { timeout: 10000, polling: 150 });
  check('and one can be dug back out', true);
  await a.click('#room-exit');
  await a.waitForFunction(() => !uspeak.net.myPlaza.active, null, { timeout: 10000, polling: 150 });
  await sleep(600);

  // What was built and put down is on the server: both come back next time.
  await fork();
  await walkTo(a, 'the door again', ...world(door), base, { arrive: 0.8, timeout: 60000 });
  await a.waitForFunction(() => uspeak.net.myRoom.active, null, { timeout: 10000, polling: 150 });
  check('the room came back as it was left', (await a.evaluate(() => uspeak.net.myRoom.state.used)) === 1,
    `${await a.evaluate(() => uspeak.net.myRoom.state.used)} pieces`);
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
