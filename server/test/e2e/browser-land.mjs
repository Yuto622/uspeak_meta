// Browser end-to-end check for 土地島: a real avatar lands on the island, walks into the
// estate office, sees all twelve islands as real 3D pictures and one turning on the stage,
// buys the first with the first day's coins, walks into the ferry house and stands on an
// island of their own — then walks back down the jetty and is on 土地島 again. The board
// lists the class by name, and sails to a classmate's island. Every price and tier is the room's.
//
// Run: node test/e2e/browser-land.mjs   (not part of `npm test`)
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
const FIGS = path.resolve(serverDir, '../docs/figures');
mkdirSync(SHOTS, { recursive: true });

const PORT = 2658;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
setTimeout(() => { console.log('FAIL timed out'); server.kill(); process.exit(2); }, 15 * 60 * 1000).unref();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 1100, height: 720 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 120000 }); };
const fig = async (page, name) => { await page.screenshot({ path: path.join(FIGS, `${name}.jpg`), type: 'jpeg', quality: 90, timeout: 120000 }); };

// Walk up to a building's door: the island opens what is behind it (land.js enter()).
async function walkTo(page, spot) {
  await page.evaluate(async () => { const d = await uspeak.rpg.land.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
  await sleep(1200);
  await page.evaluate(async (id) => {
    const d = await uspeak.rpg.land.ready; const p = d.island.spots.find((s) => s.id === id);
    uspeak.player.position.set(d.island.x + p.x, 0, d.island.z + p.z);
  }, spot);
}

try {
  // A classmate first, on her own (two of these pages starve each other of frames): Rin buys
  // the rocky islet, so the board later has two islands and a boat to each.
  const rin = await openPage('Rin');
  rin.on('pageerror', (e) => console.log('[pageerror:Rin]', e.message));
  await rin.evaluate(() => uspeak.rpg.fly('land'));
  await rin.evaluate(() => uspeak.rpg.finishFlight());
  await rin.waitForFunction(() => uspeak.rpg.state.current === 'land' && uspeak.rpg.land.visible, null, { timeout: 60000 });
  await sleep(2000);
  await walkTo(rin, 'office');
  await rin.waitForFunction(() => uspeak.net.land.state.land && uspeak.net.land.state.mode === 'office', null, { timeout: 20000 });
  await rin.waitForSelector('#land-body .land-card[data-look="rock"]', { timeout: 20000 });
  await rin.click('#land-body .land-card[data-look="rock"]');
  await sleep(300);
  await rin.click('#land-body [data-ask]');
  await rin.waitForSelector('#land-body [data-buy]', { timeout: 10000 });
  await rin.click('#land-body [data-buy]');
  await rin.waitForFunction(() => uspeak.net.land.state.land?.look === 'rock', null, { timeout: 20000 });
  await rin.evaluate(() => uspeak.net.land.close());
  check('a classmate bought the other look of the first step', true);
  // She goes offline: the board and the boat find her island in the class record, not in the room.
  await rin.context().close();


  const page = await openPage('Sora');
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.evaluate(() => uspeak.rpg.fly('land'));
  await page.evaluate(() => uspeak.rpg.finishFlight());
  await page.waitForFunction(() => uspeak.rpg.state.current === 'land' && uspeak.rpg.land.visible, null, { timeout: 60000 });
  await sleep(3000);
  check('landed on 土地島', true);
  await page.evaluate(() => { uspeak.player.position.set(330 - 3, 0, 100 + 17); });
  await sleep(2500);
  await fig(page, 'island-land');

  // The office: twelve cards in a grid, the first step buyable with the first day's coins.
  await walkTo(page, 'office');
  await page.waitForSelector('#land-dialog[open]', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => uspeak.net.land.state.land && uspeak.net.land.state.mode === 'office', null, { timeout: 20000 });
  const L = await page.evaluate(() => uspeak.net.land.state.land);
  check('walking into the office opens the six steps, two looks each', L.tiers.length === 6 && L.tiers.every((t) => t.looks.length === 2) && L.tier === 0 && L.next.id === 'step1');
  check('the first step costs no more than a first day', L.next.price <= (await page.evaluate(() => uspeak.net.land.state.coins)), `price=${L.next.price}`);
  check('twelve cards on the grid', (await page.evaluate(() => document.querySelectorAll('#land-body .land-card').length)) === 12);
  // Every card gets a real 3D picture, baked by the dialog's own renderer, a few a frame.
  await page.waitForFunction(() => uspeak.net.land.shots.size >= 12, null, { timeout: 120000 });
  const baked = await page.evaluate(() => ({
    urls: [...uspeak.net.land.shots.values()].filter((u) => typeof u === 'string' && u.startsWith('data:image/')).length,
    shown: document.querySelectorAll('#land-body .land-shot.shot img:not([hidden])').length,
    distinct: new Set([...uspeak.net.land.shots.values()]).size,
  }));
  check('every card shows a 3D picture of its island, each one different', baked.urls === 12 && baked.shown === 12 && baked.distinct === 12, JSON.stringify(baked));
  const stage = await page.evaluate(() => { const c = document.querySelector('#land-canvas'); return { w: c.width, h: c.height, hidden: c.hidden, pick: uspeak.net.land.state.pick }; });
  check('the stage turns the next island in 3D', stage.w > 100 && stage.h > 100 && !stage.hidden && stage.pick === 'sand', JSON.stringify(stage));
  // Tapping a card puts that island on the stage.
  await page.click('#land-body .land-card[data-look="rock"]');
  await sleep(300);
  check('tapping a card puts that island on the stage', (await page.evaluate(() => ({ pick: uspeak.net.land.state.pick, sel: document.querySelector('#land-body .land-card.selected')?.dataset.look }))).sel === 'rock');
  await sleep(1500);
  // The whole grid, scrolled to the far steps, for the guide's "twelve worlds" page.
  await page.evaluate(() => { document.querySelector('#land-body').scrollTop = 1e6; });
  await sleep(600);
  await fig(page, 'screen-land-worlds');
  await page.evaluate(() => { document.querySelector('#land-body').scrollTop = 0; });
  await sleep(400);
  await fig(page, 'screen-land-office');
  await page.click('#land-body .land-card[data-look="sand"]');
  await sleep(300);
  check('buying takes two taps: the first only asks', await page.evaluate(() => !!document.querySelector('#land-body [data-ask]') && !document.querySelector('#land-body [data-buy]')));
  await page.click('#land-body [data-ask]');
  await page.waitForSelector('#land-body [data-buy]', { timeout: 10000 });
  const coinsBefore = await page.evaluate(() => uspeak.net.land.state.coins);
  await page.click('#land-body [data-buy]');
  await page.waitForFunction(() => uspeak.net.land.state.land?.tier === 1, null, { timeout: 20000 });
  const after = await page.evaluate(() => ({
    coins: uspeak.net.land.state.coins, look: uspeak.net.land.state.land.look, mine: document.querySelectorAll('#land-body .land-card.mine').length,
    restyle: document.querySelectorAll('#land-body .land-card.restyle').length, next: uspeak.net.land.state.land.next?.id,
  }));
  check('the sandy islet is bought and the room charged its price', after.coins === coinsBefore - L.next.price && after.look === 'sand' && after.mine === 1 && after.next === 'step2', JSON.stringify(after));
  check('the other look of the same step is offered as a restyle', after.restyle === 1 && (await page.evaluate(() => document.querySelector('#land-body .land-card.restyle .land-price').textContent)).includes(String(L.next.restyle)));
  await page.click('#land-body .land-card[data-look="rock"]');
  await sleep(300);
  check('the restyle is out of reach today, and the button says by how much', await page.evaluate(() => { const b = document.querySelector('#land-body [data-ask]'); return !!b && b.disabled; }));
  await page.click('#land-body .land-card[data-look="grass"]');
  await sleep(300);
  check('the second step is out of reach today too', await page.evaluate(() => { const b = document.querySelector('#land-body [data-ask]'); return !!b && b.disabled; }));
  await sleep(1200);
  await fig(page, 'screen-land-bought');
  await page.evaluate(() => uspeak.net.land.close());

  // The ferry: a boat that really sails, from the hub's jetty to the island's own.
  await walkTo(page, 'ferry');
  await page.waitForFunction(() => uspeak.net.myLand.active, null, { timeout: 30000 });
  check('the ferry puts the child on a boat bound for their own island', await page.evaluate(() => uspeak.net.currentSpace() === 'in:land' && uspeak.net.myLand.riding && uspeak.net.myLand.state.ride.dir === 'in' && uspeak.net.myLand.state.island?.theme === 'sand'));
  check('with a skip on screen', await page.evaluate(() => { const r = document.querySelector('#land-ride'); return !!r && !r.hidden && !!r.querySelector('#land-ride-skip') && document.body.classList.contains('on-ferry'); }));
  // (This renderer draws a frame every second or two, so the boat is watched for
  // progress rather than timed: the ride advances by the frame's dt, as on a tablet.)
  const z0 = await page.evaluate(() => uspeak.net.myLand.boat.position.z);
  await page.waitForFunction((z) => uspeak.net.myLand.boat.position.z < z - 0.5, z0, { timeout: 60000 }).catch(() => {});
  const z1 = await page.evaluate(() => ({ boat: uspeak.net.myLand.boat.position.z, player: uspeak.player.position.z, half: uspeak.net.myLand.state.island.grid / 2 }));
  check('the boat moves across the water with the child aboard', z1.boat < z0 - 0.5 && Math.abs(z1.player - z1.boat) < 1 && z1.boat > z1.half, JSON.stringify({ z0, ...z1 }));
  check('nothing is walked while aboard', await page.evaluate(() => uspeak.rpg.blocked(uspeak.player.position.x, uspeak.player.position.z) === true));
  await fig(page, 'screen-land-ferry');
  await shot(page, 'land-ferry');
  await page.click('#land-ride-skip');
  await page.waitForFunction(() => !uspeak.net.myLand.riding, null, { timeout: 10000 });
  const landed = await page.evaluate(() => ({ z: uspeak.player.position.z, half: uspeak.net.myLand.state.island.grid / 2, ride: document.querySelector('#land-ride').hidden, boat: uspeak.net.myLand.boat.visible }));
  check('skip steps the child straight onto the jetty, the boat moored beside it', landed.z > landed.half && landed.z < landed.half + 3 && landed.ride && landed.boat, JSON.stringify(landed));
  check('with their name on the sign', (await page.evaluate(() => uspeak.net.myLand.state.island.owner)) === 'Sora');
  check('and the island draws its own minimap', await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 180; c.height = 140; return uspeak.rpg.mapSmall(c.getContext('2d')); }));
  await sleep(2500);
  await page.evaluate(() => { uspeak.player.position.set(2, 0, 2); });
  await sleep(2000);
  await fig(page, 'island-mine');
  await shot(page, 'land-mine');
  check('the water and the tent are not walked through', await page.evaluate(() => uspeak.rpg.blocked(0, -2) === true && uspeak.rpg.blocked(0, 40) === true && uspeak.rpg.blocked(2, 2) === false));
  // Down the jetty: aboard again, and the boat sails back to 土地島 (skipped here).
  await page.evaluate(() => { uspeak.player.position.set(0, 0, uspeak.net.myLand.state.island.grid / 2 + 2.6); });
  await page.waitForFunction(() => uspeak.net.myLand.riding && uspeak.net.myLand.state.ride.dir === 'out', null, { timeout: 30000 });
  check('walking down the jetty is boarding the boat home', true);
  await sleep(800);
  await page.evaluate(() => uspeak.net.myLand.skip());
  await page.waitForFunction(() => !uspeak.net.myLand.active && uspeak.rpg.state.current === 'land', null, { timeout: 30000 });
  check('and the boat (or the skip) lands the child back on 土地島', await page.evaluate(() => document.querySelector('#land-ride').hidden && !document.body.classList.contains('on-ferry')));

  // The board: by name, with both owners on it, their islands' pictures, and a boat to each.
  await sleep(1500);
  await walkTo(page, 'board');
  await page.waitForFunction(() => uspeak.net.land.state.board, null, { timeout: 30000 });
  const board = await page.evaluate(() => uspeak.net.land.state.board);
  check('the board lists the class by name and counts the owners', board.rows.some((r) => r.name === 'Sora' && r.tier === 1 && r.look === 'sand') && board.rows.some((r) => r.name === 'Rin' && r.look === 'rock') && board.owners >= 2, JSON.stringify(board.rows));
  await sleep(800);
  check('the board shows each island by its 3D picture', (await page.evaluate(() => document.querySelectorAll('#land-body .land-board .land-shot.shot img:not([hidden])').length)) >= 1);
  await fig(page, 'screen-land-board');
  await page.click('#land-body [data-visit="Rin"]');
  await page.waitForFunction(() => uspeak.net.myLand.active && uspeak.net.myLand.riding, null, { timeout: 30000 });
  const visit = await page.evaluate(() => ({ open: document.querySelector('#land-dialog').open, owner: uspeak.net.myLand.state.island.owner, theme: uspeak.net.myLand.state.island.theme, visiting: uspeak.net.myLand.state.island.visiting }));
  check("⛵ いく on the board sails to the classmate's island, in their look", !visit.open && visit.owner === 'Rin' && visit.theme === 'rock' && visit.visiting === true, JSON.stringify(visit));
  await page.evaluate(() => uspeak.net.myLand.skip());
  await page.waitForFunction(() => !uspeak.net.myLand.riding, null, { timeout: 10000 });
  await sleep(1500);
  await page.evaluate(() => { uspeak.player.position.set(1.5, 0, 3); });
  await sleep(7000);                         // this renderer refreshes the HUD a few times a minute; let it catch up before the picture
  await fig(page, 'island-visit');
  check('nothing on a classmate\'s island can be walked through either', await page.evaluate(() => uspeak.rpg.blocked(0, 40) === true));
  await page.evaluate(() => { uspeak.player.position.set(0, 0, uspeak.net.myLand.state.island.grid / 2 + 2.6); });
  await page.waitForFunction(() => uspeak.net.myLand.riding, null, { timeout: 30000 });
  await page.evaluate(() => uspeak.net.myLand.skip());
  await page.waitForFunction(() => !uspeak.net.myLand.active && uspeak.rpg.state.current === 'land', null, { timeout: 30000 });
  check('and the jetty brings them home from there too', true);
} catch (err) {
  check('no exception', false, err.stack || String(err));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
