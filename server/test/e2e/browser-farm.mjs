// Browser end-to-end check for ぼくじょう島: a real avatar lands on the island, walks into
// the seed shop, buys seeds by putting a sentence in order, walks into the greenhouse,
// plants and waters, and the field outside changes. Every answer is judged by the room;
// this test, like a child, only sees the cards.
//
// Run: node test/e2e/browser-farm.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
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

const PORT = 2657;
// The bank lives on the server, so this script (which is server-side code) may read it
// to answer the second time. The page never can: it only ever sees the cards.
const BANK = JSON.parse(readFileSync(path.resolve(serverDir, 'src/game/farm-bank.json'), 'utf8'));
const clickChoice = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll('#farm-q [data-choice]')].find((x) => x.dataset.choice === t); if (!b) throw new Error('no choice ' + t); b.click(); }, text);
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', FARM_RAIN_PCT: '0', FARM_FESTIVAL_DAYS: 'all', ANSWER_MIN_INTERVAL_MS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
setTimeout(() => { console.log('FAIL timed out'); server.kill(); process.exit(2); }, 20 * 60 * 1000).unref();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 1100, height: 720 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 120000 }); };
const fig = async (page, name) => { await page.screenshot({ path: path.join(FIGS, `${name}.jpg`), type: 'jpeg', quality: 90, timeout: 120000 }); };

// Walk into a building and open its counter, the way screens.mjs does for every island.
async function enter(page, spot) {
  await page.evaluate(async (id) => {
    const data = await uspeak.rpg.farm.ready;
    const isle = data.island;
    const place = isle.spots.find((s) => s.id === id);
    uspeak.player.position.set(isle.x + place.x, 0, isle.z + place.z);
  }, spot);
  // The doorway check runs in the frame loop, which this renderer turns slowly, and a
  // short hold follows leaving a building: keep standing in the doorway until it opens.
  for (let i = 0; i < 90 && !(await page.evaluate(() => uspeak.rpg.insideBuilding)); i += 1) {
    await sleep(250);
    // A door just left stays latched until the child walks away from it: step back
    // into the yard, then up to the door again, the way a child would.
    if (i % 6 === 2) await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
    if (i % 6 === 4) await page.evaluate(async (id) => { const d = await uspeak.rpg.farm.ready; const p = d.island.spots.find((s) => s.id === id); uspeak.player.position.set(d.island.x + p.x, 0, d.island.z + p.z); }, spot);
  }
  if (!(await page.evaluate(() => uspeak.rpg.insideBuilding))) {
    // The doorway is a frame-loop affair and this renderer manages a few frames a second;
    // when the latch will not let go in time, go in the way the doorway itself does.
    console.log('[note] doorway did not take in time; entering directly');
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
  // Step out into the yard so the latch on the door just used lets go.
  await sleep(400);
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
  await sleep(1500);
};
const ask = (page) => page.evaluate(() => uspeak.net.farm.state.q);
const waitResult = (page) => page.waitForFunction(() => uspeak.net.farm.state.result, null, { timeout: 20000 }).then(() => page.evaluate(() => uspeak.net.farm.state.result));
const next = (page) => page.evaluate(() => document.querySelector('#farm-next')?.click());

try {
  const page = await openPage('Hana');
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.evaluate(() => uspeak.rpg.fly('farm'));
  await page.evaluate(() => uspeak.rpg.finishFlight());
  await page.waitForFunction(() => uspeak.rpg.state.current === 'farm' && uspeak.rpg.farm.visible, null, { timeout: 60000 });
  await sleep(3000);
  check('landed on ぼくじょう島', true);
  await page.evaluate(() => { uspeak.player.position.set(-330 - 4, 0, 70 + 17); });
  await sleep(2500);
  await fig(page, 'island-farm');

  // The seed shop: buy two bags of the cheapest seed by ordering the cards. Two, not
  // three: the first day's purse is 100 coins and the chicken below costs 80.
  await enter(page, 'seeds');
  await shot(page, 'farm-shop');
  const seeds = await page.evaluate(() => uspeak.net.farm.state.farm.catalog.seeds.filter((c) => !c.locked));
  check('the shop sells this season\'s seeds', seeds.length >= 2, seeds.map((c) => c.en).join(','));
  const pick = seeds.slice().sort((a, b) => a.seed - b.seed)[0];
  await page.click(`[data-buy="${pick.id}"][data-qty="2"]`);
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'order', null, { timeout: 20000 });
  let q = await ask(page);
  check('buying asks for three cards in order, with no answer on the page', q.kind === 'order' && q.tokens.length === 3 && !('answer' in q), q.tokens.join(' | '));
  await shot(page, 'farm-order');
  await fig(page, 'screen-farm-shop');
  // Put the cards in order: "Two carrots, please." — the last card placed answers.
  const plural = (w) => (/(sh|ch|s|x|z|o)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
  const sentence = `Two ${plural(pick.en)}, please.`;
  for (const w of sentence.split(' ')) {
    const idx = await page.evaluate((word) => { const q = uspeak.net.farm.state.q; const used = uspeak.net.farm.state.picked; return q.tokens.findIndex((t, i) => t === word && !used.includes(i)); }, w);
    await page.click(`[data-pick="${idx}"]`);
  }
  let r = await waitResult(page);
  check('the right order buys the seeds', r.correct === true && r.farm.seeds[pick.id] === 2, JSON.stringify(r.farm.seeds));
  await fig(page, 'screen-farm-answer');
  await next(page);
  // A chicken, for the barn.
  await page.click('[data-buy="chicken"]');
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'order', null, { timeout: 20000 });
  for (const w of ['A', 'chicken,', 'please.']) {
    const idx = await page.evaluate((word) => { const q = uspeak.net.farm.state.q; const used = uspeak.net.farm.state.picked; return q.tokens.findIndex((t, i) => t === word && !used.includes(i)); }, w);
    await page.click(`[data-pick="${idx}"]`);
  }
  r = await waitResult(page);
  check('"A chicken, please." buys a chicken', r.correct && r.farm.animals.length === 1, JSON.stringify(r.farm.animals));
  await next(page);
  // The farm's own calendar and the season's festival (the test server makes every day a
  // festival day). The strip says the season and its day; the host's house has a join
  // button; the host's question is a reply, and joining pays the prize and hearts all round.
  const cal = await page.evaluate(() => uspeak.net.farm.state.farm.calendar);
  check('the calendar strip says the season and its day', await page.evaluate((c) => { const el = document.querySelector('#farm-calendar'); return !el.hidden && el.classList.contains(c.season) && el.textContent.includes(String(c.seasonDay)) && el.textContent.includes(String(c.seasonDays)); }, cal),
    await page.evaluate(() => document.querySelector('#farm-calendar')?.textContent));
  check('the villager card names the friendship and what they like and dislike', await page.evaluate(() => document.querySelectorAll('#farm-villager .farm-level b').length === 1 && document.querySelectorAll('#farm-villager .farm-likes .like').length >= 1 && document.querySelectorAll('#farm-villager .farm-likes .dislike').length >= 1));
  const ev = await page.evaluate(() => uspeak.net.farm.state.farm.event);
  check('a festival is on, with a host and a prize', !!ev && !!ev.host && ev.bonus > 0 && ev.joined === false, JSON.stringify(ev));
  check('the next step points at the festival', await page.evaluate(() => uspeak.rpg.farm.target) === ev.host, await page.evaluate(() => uspeak.rpg.farm.target));
  await leave(page);
  await enter(page, ev.host);
  await page.waitForSelector('#farm-event', { timeout: 20000 });
  await fig(page, 'screen-farm-festival');
  await page.click('#farm-event');
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'reply', null, { timeout: 20000 });
  q = await ask(page);
  const festLine = BANK.festival[ev.id].find((l) => q.prompt.en.endsWith(`"${l.says}"`));
  check('the host asks a festival question with a reply to choose', !!festLine && q.choices.length === 4 && q.pic === ev.emoji, q.prompt.en);
  await clickChoice(page, festLine.a);
  r = await waitResult(page);
  check('the right reply joins the festival: the prize is paid and every villager gives a heart', r.correct && r.coins >= ev.bonus && r.farm.event.joined === true && Object.values(r.farm.villagers).every((v) => v.hearts >= 1) && r.farm.villagers[ev.host].hearts >= 2,
    `coins=${r.coins} hearts=${JSON.stringify(Object.fromEntries(Object.entries(r.farm.villagers).map(([k, v]) => [k, v.hearts])))}`);
  await next(page);
  check('joining twice is refused', await page.evaluate(() => !!document.querySelector('#farm-event')?.disabled));
  await leave(page);

  // The field itself (2026-10): walk onto a plot, press E, and the small card opens with the
  // one thing that plot wants. Planting is a word; watering a sentence with a hole; a right
  // answer changes the plot under the child's feet.
  const standOnPlot = async (i) => {
    await page.evaluate(() => { document.querySelector('#farm-dialog')?.close?.(); });
    await page.evaluate(async (idx) => {
      const d = await uspeak.rpg.farm.ready; const pl = d.island.plots;
      uspeak.player.position.set(d.island.x + pl.x + (idx % pl.cols) * pl.gap, 0, d.island.z + pl.z + Math.floor(idx / pl.cols) * pl.gap);
    }, i);
    for (let k = 0; k < 40 && !(await page.evaluate(() => uspeak.rpg.farmFieldNearby()?.kind === 'plot')); k += 1) await sleep(200);
  };
  await standOnPlot(4);
  check('standing on a plot says what it wants', (await page.evaluate(() => uspeak.rpg.farmFieldNearby())).index === 4,
    await page.evaluate(() => JSON.stringify(uspeak.rpg.farmFieldNearby())));
  check('and the next-step light stands on the field, not over a door', (await page.evaluate(() => uspeak.rpg.farm.target)) === 'field',
    await page.evaluate(() => uspeak.rpg.farm.target));
  await page.evaluate(() => uspeak.net.farmFieldInteract());
  await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 });
  await page.waitForFunction(() => uspeak.net.farm.state.spot === 'field' && document.querySelector('#farm-dialog').classList.contains('mini'), null, { timeout: 20000 });
  check('E on an empty plot opens the small card with the seeds to choose from', await page.evaluate(() => document.querySelectorAll('#farm-main [data-plant]').length >= 1));
  await page.click(`#farm-main [data-plant="${pick.id}"]`);
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'word', null, { timeout: 20000 });
  q = await ask(page);
  check('planting asks for the English word, four choices, with a picture', q.choices.length === 4 && q.choices.includes(pick.en) && !!q.pic);
  await fig(page, 'screen-farm-field');
  await clickChoice(page, pick.en);
  r = await waitResult(page);
  check('the right word plants the seed, on the plot the child is standing on', r.correct && r.farm.plots[4]?.crop === pick.id);
  await next(page);
  check('OK closes the small card so the field is in view', await page.evaluate(() => !document.querySelector('#farm-dialog').open));
  check('the plot under the child now shows a sprout', await page.evaluate(() => uspeak.rpg.farm.visible && uspeak.net.farm.state.farm.plots[4]?.growth === 0));
  // E again on the same plot: it is dry, so the water question comes at once (no second tap).
  await page.evaluate(() => uspeak.net.farmFieldInteract());
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'fill', null, { timeout: 20000 });
  q = await ask(page);
  check('E on a dry plot asks the watering question at once: a 英検5級 sentence with a hole and a picture', q.kind === 'fill' && q.prompt.en.includes('___') && !!q.pic, q.prompt.en);
  // Wrong on purpose: nothing grows, and the answer is shown.
  const right = BANK.water.find((f) => q.prompt.en === `${f.pic} ${f.q}`).a;
  const wrong = q.choices.find((c) => c !== right);
  await clickChoice(page, wrong);
  r = await waitResult(page);
  check('a wrong answer grows nothing, and the answer is shown', !r.correct && r.farm.plots[4].growth === 0 && r.answer === right, `answer=${r.answer}`);
  await next(page);
  await page.evaluate(() => uspeak.net.farmFieldInteract());
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'fill', null, { timeout: 20000 });
  q = await ask(page);
  await clickChoice(page, BANK.water.find((f) => q.prompt.en === `${f.pic} ${f.q}`).a);
  r = await waitResult(page);
  check('the right answer waters the plot', r.correct && r.farm.plots[4].growth === 1 && r.xp > 0, `xp=${r.xp}`);
  await next(page);
  const watered = await page.evaluate(() => uspeak.net.farm.state.farm.plots[4]);
  check('the plot is watered today and grew once', watered.watered && watered.growth === 1, JSON.stringify(watered));
  check('a watered plot says so from the ground', (await page.evaluate(() => uspeak.net.farmFieldLabel(uspeak.rpg.farmFieldNearby()))).length > 0,
    await page.evaluate(() => uspeak.net.farmFieldLabel(uspeak.rpg.farmFieldNearby())));
  await sleep(1500);
  await shot(page, 'farm-field');
  await page.evaluate(() => { uspeak.player.position.set(-330 - 8, 0, 70 + 19); });
  await sleep(2000);
  await shot(page, 'farm-outside');
  // From the greenhouse the same plot can still be seen and watered — the overview is kept.
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
  await sleep(600);
  await enter(page, 'house');
  check('the greenhouse still shows the whole field as an overview', await page.evaluate(() => document.querySelectorAll('#farm-main [data-plot]').length === 9 && !document.querySelector('#farm-dialog').classList.contains('mini')));
  await leave(page);

  // The pen: walk in among the animals and press E; feed by the animal's sound.
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; const pen = d.island.pen; uspeak.player.position.set(d.island.x + pen.x - 0.6, 0, d.island.z + pen.z); });
  for (let k = 0; k < 40 && !(await page.evaluate(() => uspeak.rpg.farmFieldNearby()?.kind === 'pen')); k += 1) await sleep(200);
  check('standing in the pen is a place of its own', (await page.evaluate(() => uspeak.rpg.farmFieldNearby()?.kind)) === 'pen');
  await page.evaluate(() => uspeak.net.farmFieldInteract());
  await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 });
  await page.waitForFunction(() => uspeak.net.farm.state.spot === 'pen' && uspeak.net.farm.state.farm, null, { timeout: 20000 });
  await fig(page, 'screen-farm-barn');
  await page.click('[data-animal="0"][data-do="feed"]');
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'word', null, { timeout: 20000 });
  q = await ask(page);
  check('feeding asks what the chicken says', q.choices.includes('Cluck'), q.choices.join(','));
  await clickChoice(page, 'Cluck');
  r = await waitResult(page);
  check('"Cluck" feeds the chicken, from the pen', r.correct && r.farm.animals[0].fed === true);
  await next(page);
  await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 }).catch(() => {});
  if (!(await page.evaluate(() => document.querySelector('#farm-dialog').open))) { await page.evaluate(() => uspeak.net.farmFieldInteract()); await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 }); }
  // Rain or shine: the test server is pinned to dry days (FARM_RAIN_PCT=0), so the strip says sun,
  // the animals are thirsty, and nothing is collected until the trough is filled.
  check('the weather strip says it is a sunny day and how many dry days a plant survives', await page.evaluate(() => { const w = document.querySelector('#farm-weather'); return !w.hidden && w.classList.contains('sun') && /3/.test(w.textContent); }),
    await page.evaluate(() => document.querySelector('#farm-weather')?.textContent));
  check('a fed but thirsty chicken gives no egg yet: collect waits for water', await page.evaluate(() => { const b = document.querySelector('[data-animal="0"][data-do="collect"]'); return b.disabled && /みずが さき|Water first/.test(b.textContent); }),
    await page.evaluate(() => document.querySelector('[data-animal="0"][data-do="collect"]')?.textContent));
  check('the pen shows the animals in 3D: a live paddock and a baked picture on the card', await page.evaluate(() => !!document.querySelector('#farm-stage canvas')) && await page.waitForFunction(() => { const img = document.querySelector('#farm-main img[data-shot]'); return img && !img.hidden && img.src.startsWith('data:image/'); }, null, { timeout: 20000 }).then(() => true, () => false));
  await fig(page, 'screen-farm-barn');
  await page.click('[data-animal="0"][data-do="trough"]');
  await page.waitForFunction(() => uspeak.net.farm.state.q?.kind === 'fill', null, { timeout: 20000 });
  q = await ask(page);
  check('the trough asks a fill-in-the-blank sentence with a picture', q.kind === 'fill' && q.prompt.en.includes('___') && !!q.pic && q.choices.length === 4, q.prompt.en);
  await clickChoice(page, BANK.water.find((f) => q.prompt.en === `${f.pic} ${f.q}`).a);
  r = await waitResult(page);
  check('the right word fills the trough: the chicken is watered today', r.correct && r.farm.animals[0].wet === true, JSON.stringify(r.farm.animals[0]));
  await next(page);
  if (!(await page.evaluate(() => document.querySelector('#farm-dialog').open))) { await page.evaluate(() => uspeak.net.farmFieldInteract()); await page.waitForSelector('#farm-dialog[open]', { state: 'attached', timeout: 20000 }); }
  await page.waitForFunction(() => uspeak.net.farm.state.farm?.animals?.[0]?.wet === true, null, { timeout: 20000 });
  check('fed and watered, the chicken can now be collected from', await page.evaluate(() => !document.querySelector('[data-animal="0"][data-do="collect"]').disabled));
  // A rainy day, as the room would send it: the strip turns blue, the trough says the rain
  // did it, and the sky over the island rains (the room's own rain days are deterministic).
  await page.evaluate(() => { const f = uspeak.net.farm.state.farm; uspeak.net.farm.onState({ farm: { ...f, weather: 'rain', rainIn: null, plots: f.plots.map((p) => (p ? { ...p, watered: true } : p)), animals: f.animals.map((a) => ({ ...a, wet: true })) } }); });
  check('on a rainy day the strip says no watering is needed', await page.evaluate(() => { const w = document.querySelector('#farm-weather'); return w.classList.contains('rain') && /いらない|No watering/.test(w.textContent); }));
  check('and the trough button says the rain did it', await page.evaluate(() => { const b = document.querySelector('[data-animal="0"][data-do="trough"]'); return b.disabled && /あめで のんだ|Rain did it/.test(b.textContent); }));
  check('the next step skips watering on a rainy day', await page.evaluate(() => !/みずを|water/i.test(document.querySelector('#farm-next-step span').textContent)), await page.evaluate(() => document.querySelector('#farm-next-step span').textContent));
  await fig(page, 'screen-farm-rain');
  await page.evaluate(() => uspeak.net.farm.dialog.close());
  await page.evaluate(async () => { const d = await uspeak.rpg.farm.ready; uspeak.player.position.set(d.island.x, 0, d.island.z + 9); });
  await sleep(1500);
  await enter(page, 'ship');
  await page.waitForFunction(() => uspeak.net.farm.state.board, null, { timeout: 20000 });
  const board = await page.evaluate(() => uspeak.net.farm.state.board);
  check('the shipping house shows the class festival board', typeof board.total === 'number' && Array.isArray(board.top));
  await fig(page, 'screen-farm-ship');
  await leave(page);
  await enter(page, 'kitchen');
  await fig(page, 'screen-farm-kitchen');
  check('the kitchen lists recipes', await page.evaluate(() => document.querySelectorAll('#farm-main [data-cook]').length >= 4));
  check('the next-step banner is on every screen', await page.evaluate(() => !!document.querySelector('#farm-next-step span')?.textContent));
  await leave(page);
} catch (err) {
  check('no exception', false, err.stack || String(err));
}
await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
