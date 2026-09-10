// Browser end-to-end check: the islands' buildings are rooms you walk into.
//
// A child walks up to a hut on ことばの学校島 and ends up inside it, the counter offers
// the same quiz the doorstep used to, and walking out of the door puts them back on the
// island. Then the same door is checked on every other island, because "all of them" is
// the point.
//
// Run: node test/e2e/browser-inside.mjs   (not part of `npm test`)
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

const PORT = 2625;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const { openPage, pos, calibrate, walkTo } = makeHelpers({ browser, port: PORT, viewport: { width: 420, height: 320 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const nearLabel = (page) => page.evaluate(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none' ? document.querySelector('#interact span').textContent : ''; });
const fly = async (page, id) => {
  await page.evaluate((r) => uspeak.rpg.fly(r), id);
  await page.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await page.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(900);
};

try {
  const a = await openPage('Mahiro');
  const school = await a.evaluate(async () => (await (await fetch('school.json')).json())).then((d) => d.island);
  const easy = school.spots.find((s) => s.id === 'easy');

  await fly(a, 'school');
  const base = await calibrate(a);
  // Walk right up to the hut, as a child does: the last metre is the doorway.
  await walkTo(a, `the ${easy.id} hut`, school.x + easy.x, school.z + easy.z, base, { arrive: 0.8, timeout: 60000 });
  await sleep(600);
  const inside = await a.evaluate(() => uspeak.rpg.insideBuilding);
  check('walking up to the hut takes the child inside it', !!inside, JSON.stringify(inside?.spot?.id ?? null));
  check('and inside is its own place, named after the building', (await a.evaluate(() => uspeak.net.currentSpace())) === 'in:school:easy',
    await a.evaluate(() => uspeak.net.currentSpace()));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-inside-hut.png') });

  // Inside, the counter is a place to walk to - which is the point of a building.
  check('the doorway itself offers nothing yet', (await nearLabel(a)) === '', await nearLabel(a));
  const indoorBase = await calibrate(a);
  await walkTo(a, 'the counter', 0, -1.8, indoorBase, { arrive: 2.4, timeout: 40000 });
  check('the counter offers what the doorstep used to', (await nearLabel(a)).includes(easy.name), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#quiz-dialog[open]', { timeout: 10000 });
  await a.waitForSelector('#quiz-body [data-choice="0"]', { timeout: 8000 });
  check('the server graded it from inside the building', true);
  await a.click('#quiz-body [data-choice="0"]');
  await a.waitForSelector('#quiz-body .quiz-feedback', { timeout: 10000 });
  check('an answer is taken indoors', true);
  await a.click('#quiz-close').catch(() => {});
  await sleep(400);

  // Walking out of the doorway puts the child back at the door, outside.
  await a.evaluate(() => { uspeak.player.position.z = 9.4; });
  await a.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 8000, polling: 150 });
  await sleep(500);
  const out = await pos(a);
  check('walking out returns to the island', out.space === 'school', `${out.space} (${out.x.toFixed(1)},${out.z.toFixed(1)})`);
  check('and back on the doorstep of the hut it left',
    Math.hypot(out.x - (school.x + easy.x), out.z - (school.z + easy.z)) < 4,
    `${Math.hypot(out.x - (school.x + easy.x), out.z - (school.z + easy.z)).toFixed(1)} away`);

  // Every other island's buildings, from the doorway rather than the whole walk: the
  // walking is the same everywhere, the question is whether each door works.
  for (const [region, file, key] of [['arena', 'arena.json', 'arenaNearby'], ['pet', 'pets.json', 'petNearby'], ['ride', 'vehicles.json', 'rideNearby'], ['town', 'town.json', 'townNearby'], ['errand', 'missions.json', 'errandNearby']]) {
    await fly(a, region);
    const data = await a.evaluate(async (f) => (await (await fetch(f)).json()), file).then((d) => d.island);
    const doors = await a.evaluate((r) => uspeak.rpg[r].doors, region);
    const missed = [];
    for (const door of doors) {
      await a.evaluate(([x, z]) => { uspeak.player.position.set(x, 0, z); }, [data.x + door.x, data.z + door.z]);
      const ok = await a.waitForFunction((id) => uspeak.rpg.insideBuilding?.spot?.id === id, door.id, { timeout: 8000, polling: 120 }).then(() => true).catch(() => false);
      if (!ok) { missed.push(`${door.id}:door`); continue; }
      // Step up to the counter inside; the walking has already been proved on the hut.
      await a.evaluate(() => { uspeak.player.position.set(0, 0, -1.8); });
      // The prompt is refreshed every eighth frame, which on a software renderer is
      // seconds rather than milliseconds. Wait for the state, not the clock.
      const offers = await a.waitForFunction(() => {
        const n = document.querySelector('#near');
        return n && n.style.display !== 'none' && !!document.querySelector('#interact span').textContent.trim();
      }, null, { timeout: 8000, polling: 200 }).then(() => true).catch(() => false);
      if (!offers) missed.push(`${door.id}:counter`);
      await a.evaluate(() => { uspeak.player.position.z = 9.4; });
      await a.waitForFunction(() => !uspeak.rpg.insideBuilding, null, { timeout: 8000, polling: 120 }).catch(() => {});
      await sleep(250);
    }
    check(`every building on ${region} opens and offers its counter`, missed.length === 0, missed.join(' ') || `${doors.length}/${doors.length}`);
  }
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
