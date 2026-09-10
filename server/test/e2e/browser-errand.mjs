// Browser end-to-end check for おつかい島: a real Chromium page, a real avatar, and an
// errand that is completed only by walking. Every leg is driven with the keyboard, the
// same way a child does it; nothing here teleports and nothing calls the room directly.
//
// Requires Playwright: `npm i -D playwright && npx playwright install chromium`
// (or set PLAYWRIGHT_MODULE_DIR to a global install and CHROMIUM_PATH to a binary).
// Run: node test/e2e/browser-errand.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');

const PORT = 2613;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', TEACHER_KEY: 'testkey12345', LOG_LEVEL: 'info', AI_MIN_INTERVAL_MS: '0', OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

async function openPage(name) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 320 } });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console.error`, m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 90000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 90000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 5000 });
  await page.fill('#net-name', name);
  await page.fill('#net-class', 'e2e');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 30000, polling: 250 });
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(300);
  return page;
}

const pos = (page) => page.evaluate(() => ({ x: uspeak.player.position.x, z: uspeak.player.position.z, space: uspeak.net.currentSpace(), facing: uspeak.player.rotation.y }));
const hud = (page) => page.evaluate(() => { const h = document.querySelector('#errand-hud'); return h && !h.hidden ? h.textContent.replace(/\s+/g, ' ').trim() : ''; });
const nearLabel = (page) => page.evaluate(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none' ? document.querySelector('#interact span').textContent : ''; });
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);

// The eight key combinations in 45-degree steps from whatever heading 'w' produces.
// Facing is atan2(dx, dz) and 'w' means dz--, so 'd' (dx++) is a quarter turn *down*
// from it, not up: the order below runs anticlockwise.
const COMBOS = [['w'], ['w', 'a'], ['a'], ['s', 'a'], ['s'], ['s', 'd'], ['d'], ['w', 'd']];

// Walk there. Camera yaw is not exposed, so calibrate once from the avatar's own facing:
// pressing 'w' turns it to the world heading that key means, and the other seven combos
// sit at 45-degree steps from it.
async function calibrate(page) {
  await page.keyboard.down('w');
  await sleep(260);
  const { facing } = await pos(page);
  await page.keyboard.up('w');
  await sleep(120);
  return facing;
}

async function walkTo(page, name, tx, tz, base, { arrive = 2.5, timeout = 45000 } = {}) {
  const t0 = Date.now();
  let held = [];
  const release = async () => { for (const k of held) await page.keyboard.up(k).catch(() => {}); held = []; };
  let best = Infinity;
  let stuckSince = Date.now();
  let detour = 0;              // steps to swing aside when a shop is in the way
  while (Date.now() - t0 < timeout) {
    const p = await pos(page);
    const dx = tx - p.x;
    const dz = tz - p.z;
    const gap = Math.hypot(dx, dz);
    if (gap < best - 0.4) { best = gap; stuckSince = Date.now(); detour = 0; }
    if (gap < arrive) break;
    // Walking into a building gets you nowhere; step round it, as a child would.
    if (Date.now() - stuckSince > 1400) { detour = detour === 2 ? -2 : detour + 1; stuckSince = Date.now(); }
    // Heading we want, expressed the way the game expresses facing.
    const want = Math.atan2(dx, dz);
    const turn = (((want - base) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const step = ((Math.round(turn / (Math.PI / 4)) + detour) % 8 + 8) % 8;
    const keys = COMBOS[step];
    if (keys.join() !== held.join()) {
      await release();
      for (const k of keys) await page.keyboard.down(k);
      held = keys;
    }
    await sleep(gap > 8 ? 200 : 90);
  }
  await release();
  await sleep(250);
  const p = await pos(page);
  const gap = Math.hypot(tx - p.x, tz - p.z);
  console.log(`  walked to ${name}: gap ${gap.toFixed(2)} (closest ${best.toFixed(2)}) in ${Date.now() - t0} ms`);
  return gap;
}

async function say(page, text) {
  await page.fill('#mission-say', text);
  await page.click('#mission-send');
  await page.waitForFunction(() => !document.querySelector('#mission-send')?.disabled || !document.querySelector('#mission-say'), null, { timeout: 15000, polling: 100 });
  await sleep(250);
}

try {
  const a = await openPage('Aki');
  const data = await a.evaluate(async () => (await (await fetch('missions.json')).json()));
  const island = data.island;
  const mission = data.missions.find((m) => m.id === 'bakery-two-drinks');
  const plaza = island.spots.find((s) => s.id === mission.from);
  const shop = island.spots.find((s) => s.id === mission.spot);
  const world = (s) => [island.x + s.x, island.z + s.z];

  // The board is reachable from anywhere, and offers the trip.
  await a.click('#mission-button');
  await a.waitForSelector('#mission-dialog[open]');
  check('the board says the errand is walked on おつかい島', (await a.textContent('#mission-body')).includes('おつかい島'));
  check('the board offers the trip when you are elsewhere', await a.$eval('#mission-travel', (e) => !e.disabled));

  // Fly there, the way every other island is reached.
  await a.click('#mission-travel');
  await a.waitForFunction(() => uspeak.rpg.state.mode === 'flight', null, { timeout: 5000, polling: 100 });
  await a.evaluate(() => uspeak.rpg.finishFlight());
  await sleep(600);
  const arrived = await pos(a);
  check('arrived on おつかい島', arrived.space === 'errand', `at (${arrived.x.toFixed(1)},${arrived.z.toFixed(1)})`);
  check('the Willow quest list gives way to the errand slot', await a.evaluate(() => document.body.classList.contains('on-errand-island')));
  // A closed dialog must not sit over the world swallowing taps meant for it.
  check('the closed errand dialog takes no space', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !hit.closest('#mission-dialog');
  }));

  // Choosing on the board takes nothing: it only points at the plaza.
  const coins0 = await coins(a);
  await a.click('#mission-button');
  await a.waitForSelector('#mission-dialog[open]');
  await a.click(`[data-mission="${mission.id}"]`);
  await sleep(400);
  check('choosing an errand does not open a conversation', !(await a.evaluate(() => !!document.querySelector('#mission-say'))));
  const hud0 = await hud(a);
  check('the tracker points at the plaza', hud0.includes(plaza.ja) && hud0.includes('もらいに行こう'), hud0.slice(0, 90));

  // Pressing the interact button anywhere else does not take the errand either.
  const base = await calibrate(a);
  await walkTo(a, shop.id, ...world(shop), base);
  check('standing at the shop first offers nothing to take', (await nearLabel(a)).includes('おつかいは広場で'), await nearLabel(a));
  await a.click('#interact');
  await sleep(600);
  check('the errand cannot be taken at the shop', !(await a.evaluate(() => !!document.querySelector('#mission-say'))) && (await hud(a)).includes('もらいに行こう'));

  // ---- leg 1: walk to the plaza and take it
  await walkTo(a, plaza.id, ...world(plaza), base);
  check('the plaza offers the errand', (await nearLabel(a)).includes('うけとる'), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#mission-accept', { timeout: 8000 });
  check('the request is given in English with a Japanese subtitle', (await a.textContent('#mission-body')).includes(mission.requestJa));
  await a.click('#mission-accept');
  await sleep(300);
  const hud1 = await hud(a);
  check('the tracker now points at the shop', hud1.includes(shop.ja), hud1.slice(0, 90));

  // ---- leg 2: walk to the shop and speak English
  await walkTo(a, shop.id, ...world(shop), base);
  check('the shop offers the conversation', (await nearLabel(a)).includes(mission.character), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#mission-say', { timeout: 10000 });
  check('the shopkeeper opens the conversation', (await a.textContent('#mission-line')).length > 0);
  await say(a, "I'd like a juice please");
  check('the first goal ticks', (await a.$$eval('.mission-goals li.met', (n) => n.length)) === 1);
  await say(a, 'Two please');
  await say(a, 'Thank you');
  await a.waitForSelector('#mission-back', { timeout: 10000 });
  check('every goal is met but no coins yet', (await coins(a)) === coins0, `coins=${await coins(a)} started=${coins0}`);
  check('the item is in hand', (await a.textContent('#mission-body')).includes(mission.item));
  await a.click('#mission-back');
  await sleep(300);
  const hud2 = await hud(a);
  check('the tracker turns back to the plaza', hud2.includes(plaza.ja) && hud2.includes(mission.item), hud2.slice(0, 110));

  // Delivering from where we stand is refused by the server.
  await a.evaluate(() => uspeak.net.room.send('mission:deliver', {}));
  await sleep(600);
  check('the server refuses a delivery made from the shop', (await coins(a)) === coins0);

  // ---- leg 3: carry it back
  await walkTo(a, plaza.id, ...world(plaza), base);
  check('the plaza offers the delivery', (await nearLabel(a)).includes('とどける'), await nearLabel(a));
  await a.click('#interact');
  await a.waitForSelector('#mission-again', { timeout: 10000 });
  await sleep(400);
  check('the reward arrives on delivery', (await coins(a)) === coins0 + mission.reward, `coins=${await coins(a)} expected=${coins0 + mission.reward}`);
  check('the stamp is recorded', (await a.textContent('#mission-body')).includes('おつかい完了'));
  check('the tracker clears', (await hud(a)) === '');

  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await a.screenshot({ path: path.join(SHOTS, 'e2e-errand-done.png') });
  await a.click('#mission-close').catch(() => {});
  await sleep(300);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-errand-island.png') });
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
