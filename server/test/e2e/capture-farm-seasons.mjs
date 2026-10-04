// ぼくじょう島の きせつ・おまつり・住人の写真を撮る（「?」のガイド用）。
//
//   node test/e2e/capture-farm-seasons.mjs
//
// The island in each of its four seasons, the island on a festival day, the villager's
// card (a birthday, hearts, likes and dislikes) and the festival question. The server
// decides the real season, so the four seasons are shown the way the room would send
// them: the page's own `onState` with the calendar changed — the island draws only what
// it is told, which is the point of the test and of the picture. The festival is real
// (FARM_FESTIVAL_DAYS=all). Island shots wait for daylight like capture-figures.mjs.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';
import { phaseAt, PHASES } from '../../../client/dist/world-clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const FIGS = path.resolve(serverDir, '../docs/figures');
const PORT = 2659;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'warn', FARM_RAIN_PCT: '0', FARM_FESTIVAL_DAYS: 'all', ANSWER_MIN_INTERVAL_MS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
setTimeout(() => { console.log('FAIL timed out'); server.kill(); process.exit(2); }, 25 * 60 * 1000).unref();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 1100, height: 720 } });
const fig = async (page, name) => { await page.screenshot({ path: path.join(FIGS, `${name}.jpg`), type: 'jpeg', quality: 90, timeout: 180000 }); console.log(`  ${name}.jpg`); };
const inject = (page, patch) => page.evaluate((p) => { const f = uspeak.net.farm.state.farm; uspeak.net.farm.onState({ farm: { ...f, ...p } }); }, patch);

async function daylight(page, need = 25) {
  const skew = await page.evaluate(() => uspeak.net.serverNow() - Date.now()).catch(() => 0);
  const now = phaseAt(Date.now() + skew);
  if (now.id !== 'day' || now.endsIn < need) {
    let wait = now.endsIn;
    for (let i = (now.index + 1) % PHASES.length; PHASES[i].id !== 'day'; i = (i + 1) % PHASES.length) wait += PHASES[i].seconds;
    console.log(`  …${now.ja}。あと ${Math.ceil(wait)} 秒で ひるま`);
    await sleep(Math.ceil(wait * 1000) + 500);
  }
  await page.waitForFunction(() => uspeak.atmosphere.state.night < 0.06, null, { timeout: 240000, polling: 1000 }).catch(() => console.log('  (sky never brightened — shooting anyway)'));
}
async function enter(page, spot) {
  await page.evaluate(async (id) => { const d = await uspeak.rpg.farm.ready; const p = d.island.spots.find((s) => s.id === id); uspeak.player.position.set(d.island.x + p.x, 0, d.island.z + p.z); }, spot);
  for (let i = 0; i < 40 && !(await page.evaluate(() => uspeak.rpg.insideBuilding)); i += 1) {
    await sleep(250);
    if (i % 6 === 2) await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
    if (i % 6 === 4) await page.evaluate(async (id) => { const d = await uspeak.rpg.farm.ready; const p = d.island.spots.find((s) => s.id === id); uspeak.player.position.set(d.island.x + p.x, 0, d.island.z + p.z); }, spot);
  }
  if (!(await page.evaluate(() => uspeak.rpg.insideBuilding))) {
    await page.evaluate(async (id) => { const d = await uspeak.rpg.farm.ready; uspeak.rpg.inside.enter('farm', d.island.spots.find((s) => s.id === id)); }, spot);
    await sleep(800);
  }
  await page.evaluate(() => uspeak.player.position.set(0, 0, -1.8));
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!uspeak.rpg.farmNearby?.())); i += 1) await sleep(200);
  await page.evaluate(() => uspeak.net.farmInteract());
  await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 });
  await page.waitForFunction((id) => uspeak.net.farm.state.farm && uspeak.net.farm.state.spot === id, spot, { timeout: 20000 });
}
const leave = async (page) => {
  await page.evaluate(() => { document.querySelector('#farm-dialog').close(); uspeak.rpg.inside?.leave?.(true); });
  await sleep(400);
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
  await sleep(1500);
};

let code = 0;
try {
  const page = await openPage('Hana');
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.evaluate(() => uspeak.rpg.fly('farm'));
  await page.evaluate(() => uspeak.rpg.finishFlight());
  await page.waitForFunction(() => uspeak.rpg.state.current === 'farm' && uspeak.rpg.farm.visible && uspeak.net.farm.state.farm, null, { timeout: 60000 });
  await sleep(2000);
  // Stand at the south edge looking over the yard: the ring of trees and the field in view.
  await page.evaluate(() => { uspeak.player.position.set(-330 - 2, 0, 70 + 19); uspeak.view?.look?.(0, -0.1); });
  await daylight(page);
  const real = await page.evaluate(() => uspeak.net.farm.state.farm);
  const seasonDays = real.calendar?.seasonDays || 7;
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    await inject(page, { season, calendar: { ...real.calendar, season, seasonDay: 2, left: seasonDays - 1 }, event: null, nextEvent: real.nextEvent });
    await sleep(3000);
    await fig(page, `island-farm-${season}`);
  }
  // The festival, as the room really sends it today (lanterns, the stall, the banner).
  await inject(page, real);
  await sleep(3000);
  await fig(page, 'island-farm-festival');
  // The livestock yard with three animals and what each wants, from the gate.
  await inject(page, { ...real, animals: [
    { i: 0, kind: 'chicken', name: 'Coco', hearts: 2, fed: false, brushed: false, wet: false, got: false, product: 'egg' },
    { i: 1, kind: 'sheep', name: 'Momo', hearts: 4, fed: true, brushed: false, wet: false, got: false, product: 'wool' },
    { i: 2, kind: 'cow', name: 'Hana', hearts: 7, fed: true, brushed: true, wet: true, got: false, product: 'milk' },
  ] });
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; const pen = d.island.pen; uspeak.player.position.set(d.island.x + pen.x - pen.w / 2 - 2.5, 0, d.island.z + pen.z + 1); });
  await sleep(3500);
  await fig(page, 'island-farm-pen');
  // And the pen's own card, standing among them.
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; const pen = d.island.pen; uspeak.player.position.set(d.island.x + pen.x - 1, 0, d.island.z + pen.z); });
  for (let i = 0; i < 40 && !(await page.evaluate(() => uspeak.rpg.farmFieldNearby()?.kind === 'pen')); i += 1) await sleep(200);
  await page.evaluate(() => uspeak.net.farmFieldInteract());
  await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 });
  await page.waitForFunction(() => uspeak.net.farm.state.spot === 'pen' && uspeak.net.farm.state.farm, null, { timeout: 20000 });
  await inject(page, { ...real, animals: [
    { i: 0, kind: 'chicken', name: 'Coco', hearts: 2, fed: false, brushed: false, wet: false, got: false, product: 'egg' },
    { i: 1, kind: 'sheep', name: 'Momo', hearts: 4, fed: true, brushed: false, wet: false, got: false, product: 'wool' },
  ] });
  await page.waitForFunction(() => { const img = document.querySelector('#farm-main img[data-shot]'); return img && !img.hidden; }, null, { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await fig(page, 'screen-farm-pen');
  await page.evaluate(() => { document.querySelector('#farm-dialog').close(); });
  await inject(page, real);

  // The villager's card: Hana on her birthday, a few hearts in, with what she likes.
  await enter(page, 'seeds');
  const st = await page.evaluate(() => uspeak.net.farm.state.farm);
  const v = { ...st.villagers.seeds, hearts: 6, level: 'close', birthday: { ...st.villagers.seeds.birthday, today: true, inDays: 0 } };
  await inject(page, { villagers: { ...st.villagers, seeds: v }, hearts: { ...st.hearts, seeds: 6 }, items: { ...st.items, strawberry: 1, turnip: 2 } });
  await sleep(1200);
  await fig(page, 'screen-farm-villager');
  await leave(page);

  // The festival question at the host's house.
  const ev = real.event;
  if (ev) {
    await enter(page, ev.host);
    await page.waitForSelector('#farm-event', { timeout: 20000 });
    await page.click('#farm-event');
    await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'reply', null, { timeout: 20000 });
    await sleep(800);
    await fig(page, 'screen-farm-festival-q');
    await leave(page);
  } else console.log('FAIL no festival today (FARM_FESTIVAL_DAYS=all should make one)'), code = 1;
} catch (err) {
  console.log('FAIL', err.stack || String(err)); code = 1;
}
await browser.close();
server.kill();
process.exit(code);
