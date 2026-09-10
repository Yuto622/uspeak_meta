// Browser end-to-end check for the night: a real avatar walks up to a ghost on Willow
// Island and swings at it. What is being checked is that the sky is the server's, that
// the ghost has to be walked to, and that the coins come back from the server.
//
// Run: node test/e2e/browser-night.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';
import { untilNight, phaseAt } from '../../../client/dist/world-clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');
const { mkdirSync } = await import('node:fs');
mkdirSync(SHOTS, { recursive: true });

const PORT = 2622;
// Step the world into the night rather than waiting eleven minutes for it. The clients
// are told the shifted time, so the class is still in one sky.
const OFFSET = untilNight() + 25000;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', WORLD_TIME_OFFSET_MS: String(OFFSET) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const a = await openPage('Yoru');
  const night = await a.evaluate(async () => (await (await fetch('night.json')).json()));
  check('the world is in the night the server says it is', await a.evaluate(async () => {
    const { phaseAt } = await import('./world-clock.js');
    return phaseAt(uspeak.net.serverNow()).id;
  }) === 'night', `local clock says ${phaseAt(Date.now() + OFFSET).id}`);
  await sleep(2500);
  check('and the sky went dark on its own', await a.evaluate(() => uspeak.net.night.state.night) === 1);
  // Not just the number: the world itself has to have gone dark.
  await a.waitForFunction(() => uspeak.atmosphere.state.night > 0.9, null, { timeout: 30000, polling: 300 }).catch(() => {});
  check('the island is actually dark', await a.evaluate(() => uspeak.atmosphere.state.night) > 0.9,
    `night=${(await a.evaluate(() => uspeak.atmosphere.state.night)).toFixed(2)} target=${await a.evaluate(() => uspeak.atmosphere.state.targetNight)}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-night-sky.png') });
  check('the ghosts are out', (await a.evaluate(() => [...uspeak.net.night.state.out].length)) === night.ghosts.length);

  // Every haunt has to be somewhere a child can actually reach: standable ground within
  // a swing of the ghost, on the island the data claims.
  const unreachable = await a.evaluate((data) => {
    const bad = [];
    for (const g of data.ghosts) {
      let ok = false;
      for (let a2 = 0; a2 < 16 && !ok; a2 += 1) {
        const th = a2 / 16 * Math.PI * 2;
        for (const r of [0, data.reach * 0.5, data.reach * 0.9]) {
          if (!uspeak.blocked(g.x + Math.cos(th) * r, g.z + Math.sin(th) * r)) { ok = true; break; }
        }
      }
      if (!ok) bad.push(g.id);
    }
    return bad;
  }, night);
  check('every ghost can be walked up to', unreachable.length === 0, unreachable.join(','));

  // Now do it for real, with the keyboard: the nearest ghost to where a child lands.
  const start = await pos(a);
  const target = night.ghosts.slice().sort((g1, g2) =>
    Math.hypot(g1.x - start.x, g1.z - start.z) - Math.hypot(g2.x - start.x, g2.z - start.z))[0];
  const base = await calibrate(a);
  await walkTo(a, `ghost ${target.id}`, target.x, target.z, base, { arrive: 2.2, timeout: 90000 });
  const at = await pos(a);
  check('arrived beside it', Math.hypot(at.x - target.x, at.z - target.z) <= night.reach, `gap ${Math.hypot(at.x - target.x, at.z - target.z).toFixed(2)}`);
  const label = await nearLabel(a);
  check('the prompt is to swing the wand', label.includes(target.word), label);

  const before = await coins(a);
  await a.click('#interact');
  await a.waitForFunction((id) => !uspeak.net.night.state.out.has(id), target.id, { timeout: 10000, polling: 100 });
  check('the ghost is caught', true);
  check('the server paid for it', (await coins(a)) === before + night.coins, `+${(await coins(a)) - before}`);
  check('and it left its word behind', (await a.evaluate(() => document.querySelector('#toast').textContent)).includes(target.word), await a.evaluate(() => document.querySelector('#toast').textContent));


  await a.screenshot({ path: path.join(SHOTS, 'e2e-night.png') });

  // Swinging at nothing is refused by the server, not by the page.
  await a.evaluate((id) => uspeak.net.night.state.out.add(id), target.id);
  await a.evaluate(() => { uspeak.player.position.x += 14; });
  await sleep(400);
  await a.evaluate((id) => uspeak.net.night.swing('willow') || uspeak.net.night.state, target.id);
  await sleep(600);
  check('a swing from across the island earns nothing', (await coins(a)) === before + night.coins, `coins=${await coins(a)}`);
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
