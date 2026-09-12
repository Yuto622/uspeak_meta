// のりもの島のレース, in real browsers: two children on the grid, a countdown, three laps
// of the circuit, an item box that wants an English word before it gives a boost, and a
// finishing order that pays.
//
// The karts are driven by moving the avatar round the checkpoints rather than by holding
// the keys down: this container renders at about three frames a second, which is fine for
// a race that is timed by the server but hopeless for steering. The driving itself — the
// throttle, the grass, the drift and its boost — is checked in client/tests/regression.mjs
// against the same module the browser runs.
//
// Run: node test/e2e/browser-race.mjs   (not part of `npm test`)
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
mkdirSync(SHOTS, { recursive: true });

const PORT = 2659;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const { openPage, pos } = makeHelpers({ browser, port: PORT, viewport: { width: 560, height: 420 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);
const raceState = (page) => page.evaluate(() => ({
  phase: uspeak.net.race.state.phase,
  lap: uspeak.net.race.state.lap,
  laps: uspeak.net.race.state.laps,
  place: uspeak.net.race.state.place,
  next: uspeak.net.race.state.next?.id || '',
  standings: uspeak.net.race.state.standings.map((r) => `${r.place}:${r.name}`),
}));
// Whatever the server refused: a race that will not start is nearly always a child
// standing in the wrong place, and this says which. It takes over the page's own handler
// for those two messages — the toast is not what is being tested — so everything the
// server refuses ends up in this list and in the failure message.
const watchErrors = (page) => page.evaluate(() => {
  window.__errs = [];
  for (const type of ['ride:error', 'race:error']) {
    uspeak.net.room.onMessage(type, (m) => { window.__errs.push(`${type} ${JSON.stringify(m)}`); });
  }
});
const errors = (page) => page.evaluate(() => window.__errs || []);
const hudText = (page) => page.evaluate(() => document.querySelector('#race-hud')?.textContent?.replace(/\s+/g, ' ').trim() || '');

// Put the kart at a place on the island. Moving rather than driving, for the reason in the
// header — everything the server checks (where the kart is, in what order) is unchanged.
async function goTo(page, x, z) {
  await page.evaluate(([px, pz]) => {
    // A gate on this island is a building, and walking onto one takes the child inside it.
    // Coming back out first is what a child would do, and it keeps the coordinates world
    // coordinates rather than the little room's.
    uspeak.rpg.inside?.leave?.(true);
    uspeak.player.position.set(px, 0, pz);
  }, [x, z]);
  // And wait until the room agrees. The page only sends its position from inside a frame,
  // and a frame here is a third of a second: asking the server a question before that
  // lands is how a child gets told they are standing somewhere else.
  await page.waitForFunction(() => {
    const me = uspeak.net.room?.state?.players?.get(uspeak.net.room.sessionId);
    return !!me && me.space === uspeak.net.currentSpace()
      && Math.hypot(me.x - uspeak.player.position.x, me.z - uspeak.player.position.z) < 0.3;
  }, null, { timeout: 25000, polling: 120 });
}

try {
  const a = await openPage('Tsubasa');
  const b = await openPage('Nao');
  const data = await a.evaluate(async () => (await (await fetch('vehicles.json')).json()));
  const isle = data.island;
  const course = data.course;
  const world = (p) => [isle.x + p.x, isle.z + p.z];
  const start = isle.spots.find((s) => s.kind === 'start');
  const kickGate = isle.spots.find((s) => s.vehicle === 'kick');

  for (const page of [a, b]) {
    await page.evaluate(() => { uspeak.rpg.fly('ride'); uspeak.rpg.finishFlight(); });
    await page.waitForFunction(() => uspeak.net.currentSpace() === 'ride', null, { timeout: 60000, polling: 200 });
  }
  for (const page of [a, b]) await watchErrors(page);
  check('both children are on のりもの島', (await pos(a)).space === 'ride' && (await pos(b)).space === 'ride');
  check('the circuit has a grid, boxes and pads on the road',
    course.grid.length >= 2 && course.items.length >= 3 && course.boosts.length >= 3 && course.laps === 3,
    `${course.gates.length} checkpoints · ${course.laps} laps`);

  // A kickboard each, bought at its own gate with the day's login bonus.
  for (const page of [a, b]) {
    await goTo(page, ...world(kickGate));
    await page.evaluate(() => uspeak.net.room.send('ride:buy', { id: 'kick' }));
    await page.waitForFunction(() => uspeak.net.state?.riding === 'kick' || uspeak.net.riding === 'kick', null, { timeout: 20000, polling: 200 })
      .catch(() => {});
    await sleep(400);
  }
  const riding = async (page) => page.evaluate(() => uspeak.net.ride.riding);
  check('both are on a vehicle', (await riding(a)) === 'kick' && (await riding(b)) === 'kick',
    `${await riding(a)} / ${await riding(b)} ${JSON.stringify(await errors(a))}`);

  // On the line, and on the grid.
  for (const page of [a, b]) {
    await goTo(page, ...world(start));
    await page.evaluate(() => uspeak.net.room.send('race:join', {}));
  }
  await a.waitForFunction(() => uspeak.net.race.state.phase === 'grid', null, { timeout: 30000, polling: 200 })
    .catch(async () => { throw new Error(`no grid: ${JSON.stringify(await errors(a))}`); });
  const grid = await raceState(a);
  check('the start line puts both of them on the grid', grid.phase === 'grid', JSON.stringify(grid.standings));
  // A race is its own screen: from the grid, the island is gone. Measured by what is
  // actually drawn — an element hidden with `display: none` has no client rects.
  const shown = (page, sel) => page.evaluate((s2) => !!document.querySelector(s2)?.getClientRects().length, sel);
  check('the race takes the whole screen: the island\'s own chrome is gone',
    !(await shown(a, '.right-rail')) && !(await shown(a, '.bottom')) && !(await shown(a, '.quest-panel'))
    && !(await shown(a, '.net-dock')) && (await shown(a, '#race-screen')),
    await a.evaluate(() => document.body.dataset.race));
  check('and the island stops labelling itself over the road',
    (await a.evaluate(() => uspeak.net.remotes.tagsOn)) === false);
  check('and the field includes the rivals, so the grid is a field',
    grid.standings.length >= 4, `${grid.standings.length} on the grid`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-race-grid.png') });

  // The lights, on the room's clock rather than on anybody's tap.
  await a.waitForFunction(() => uspeak.net.race.state.phase === 'countdown', null, { timeout: 30000, polling: 150 });
  check('the lights come on by themselves', true);
  await a.waitForFunction(() => uspeak.net.race.state.phase === 'running', null, { timeout: 20000, polling: 150 });
  check('and the race starts', (await raceState(a)).phase === 'running');
  check('the HUD shows the lap and the word to drive to',
    (await hudText(a)).includes('LAP') && (await hudText(a)).includes('1/3'), await hudText(a));

  // ---- lap one, checkpoint by checkpoint
  const drive = async (page, laps = 1) => {
    for (let lap = 0; lap < laps; lap += 1) {
      for (const gate of course.gates) {
        await goTo(page, ...world(gate));
        await sleep(1100);     // laps have a floor: the server refuses one driven too fast
      }
    }
  };
  await drive(a, 1);
  await a.waitForFunction(() => uspeak.net.race.state.lap >= 2, null, { timeout: 60000, polling: 200 })
    .catch(async () => { throw new Error(`no lap: ${JSON.stringify(await raceState(a))} ${JSON.stringify(await errors(a))}`); });
  check('a lap counts when every checkpoint was crossed in order', (await raceState(a)).lap >= 2, JSON.stringify(await raceState(a)));

  // ---- an item box: an English word, and a boost for the right answer
  //
  // The test knows which word is right the way a teacher does, from the bank on disk. The
  // page is never told: it gets one Japanese word and three English ones, and the boost
  // arrives only if the server agrees with the tap.
  const BANK = JSON.parse(readFileSync(path.resolve(serverDir, 'src/game/gym-words.json'), 'utf8')).words;
  const boxAt = async (i) => {
    await goTo(a, ...world(course.items[i]));
    await a.waitForFunction(() => !document.querySelector('#race-box').hidden, null, { timeout: 30000, polling: 150 });
    return a.evaluate(() => ({
      ja: document.querySelector('#race-box-ja').textContent,
      choices: [...document.querySelectorAll('#race-box-choices [data-pick]')].map((el) => el.dataset.pick),
    }));
  };
  const answerOf = (asked) => BANK.filter((w) => w.ja === asked.ja).map((w) => w.en).find((en) => asked.choices.includes(en));
  const tap = (page, pick) => page.evaluate((p) => {
    document.querySelector(`#race-box-choices [data-pick="${p}"]`).click();
  }, pick);
  const boostUntil = (page) => page.evaluate(() => uspeak.net.race.kart.boostUntil);

  const first = await boxAt(0);
  check('an item box asks for an English word before it gives anything',
    first.choices.length === 3 && !!first.ja && !!answerOf(first), `${first.ja} → ${first.choices.join(' / ')}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-race-box.png') });

  // The wrong word is worth nothing — the dash is for the English, not for driving over
  // the box — and the child is told what it was.
  const wrongWord = first.choices.find((c) => c !== answerOf(first));
  const beforeWrong = await boostUntil(a);
  await tap(a, wrongWord);
  await a.waitForFunction(() => document.querySelector('#race-box').hidden, null, { timeout: 15000, polling: 150 });
  await sleep(600);
  check('a wrong word is no dash', (await boostUntil(a)) <= beforeWrong,
    `${wrongWord} for ${first.ja} · ${JSON.stringify(await errors(a))}`);
  check('and the child is told the word they wanted',
    (await a.evaluate(() => document.querySelector('#race-flash').textContent)).includes(answerOf(first)),
    await a.evaluate(() => document.querySelector('#race-flash').textContent));

  // The right one, at the next box along.
  const second = await boxAt(1);
  const beforeRight = await boostUntil(a);
  await tap(a, answerOf(second));
  const boosted = await a.waitForFunction((was) => uspeak.net.race.kart.boostUntil > was, beforeRight, { timeout: 20000, polling: 150 })
    .then(() => true).catch(() => false);
  check('and the right word is a dash', boosted, `${second.ja} → ${answerOf(second)}`);

  // ---- the rest of the race, and the flag
  const before = await coins(a);
  await drive(a, 2);
  await a.waitForFunction(() => uspeak.net.race.state.phase === 'done', null, { timeout: 120000, polling: 250 })
    .catch(async () => { throw new Error(`no flag: ${JSON.stringify(await raceState(a))} ${JSON.stringify(await errors(a))}`); });
  const done = await a.evaluate(() => document.querySelector('#race-result-body').textContent.replace(/\s+/g, ' ').trim());
  check('three laps is the flag', done.includes('ベストラップ'), done.slice(0, 90));
  check('and the flag pays', (await coins(a)) > before, `${before} → ${await coins(a)}`);
  check('the result board shows where everyone came',
    (await a.evaluate(() => document.querySelectorAll('.race-result-board li').length)) >= 4);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-race-result.png') });

  // Closing the board gives the island back — the one way out of the race screen.
  await a.click('#race-result-close');
  check('closing the result hands the island back',
    (await shown(a, '.right-rail')) && (await shown(a, '.bottom')) && !(await shown(a, '#race-screen')),
    await a.evaluate(() => document.body.dataset.race || '(none)'));
  check('and the names come back over everyone\'s heads',
    (await a.evaluate(() => uspeak.net.remotes.tagsOn)) === true);

  // The other child was in the same race, and is still in it.
  const other = await raceState(b);
  check('the second child raced the same race', other.standings.length >= 4, JSON.stringify(other.standings));
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
