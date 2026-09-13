// U-SPEAK GRAND PRIX, in real browsers.
//
// The point of this test is the one thing the single-page tests cannot show: that two
// children in the same class are racing the SAME ミドリ. The rivals are driven by the room
// and broadcast ten times a second, so at any moment both browsers must be drawing her in
// the same place on the road. A page that ran its own copy of her would pass every other
// check in this file and fail that one.
//
// The child's kart is driven by the rivals' own autopilot (setAutoDrive). This container
// renders about three frames a second, which is hopeless for steering by hand but fine for
// the game's fixed 1/120 s physics — the same code, sub-stepped, so the kart really does
// drive the circuit rather than being teleported round it. The feel of the driving is
// checked in client/tests/regression.mjs and server/test/kart-drive.test.mjs.
//
// Run: node test/e2e/browser-gp.mjs   (not part of `npm test`)
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

const PORT = 2661;
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
const gpState = (page) => page.evaluate(() => ({
  open: uspeak.net.gp.state.open,
  phase: uspeak.net.gp.state.phase,
  online: uspeak.net.gp.state.online,
  lap: uspeak.net.gp.state.lap,
  laps: uspeak.net.gp.state.laps,
  place: uspeak.net.gp.state.place,
  field: (uspeak.net.gp.state.field || []).map((r) => r.name),
}));
const midori = (page) => page.evaluate(() => {
  const r = uspeak.net.gp.rivals.find((x) => x.id === 'ai-midori');
  return r ? { x: r.kart.x, z: r.kart.z, s: Math.round(r.kart.s), cp: r.cp } : null;
});
const watchErrors = (page) => page.evaluate(() => {
  window.__errs = [];
  for (const type of ['ride:error', 'gp:error']) {
    uspeak.net.room.onMessage(type, (m) => { window.__errs.push(`${type} ${JSON.stringify(m)}`); });
  }
});
const errors = (page) => page.evaluate(() => window.__errs || []);
const shown = (page, sel) => page.evaluate((s) => !!document.querySelector(s)?.getClientRects().length, sel);

async function goTo(page, x, z) {
  await page.evaluate(([px, pz]) => {
    uspeak.rpg.inside?.leave?.(true);
    uspeak.player.position.set(px, 0, pz);
  }, [x, z]);
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
  const world = (p) => [isle.x + p.x, isle.z + p.z];
  const start = isle.spots.find((s) => s.kind === 'start');
  const kickGate = isle.spots.find((s) => s.vehicle === 'kick');

  for (const page of [a, b]) {
    await page.evaluate(() => { uspeak.rpg.fly('ride'); uspeak.rpg.finishFlight(); });
    await page.waitForFunction(() => uspeak.net.currentSpace() === 'ride', null, { timeout: 60000, polling: 200 });
    await watchErrors(page);
  }
  check('both children are on のりもの島', (await pos(a)).space === 'ride' && (await pos(b)).space === 'ride');

  // A vehicle each, then the start line. The grand prix is its own world, but the door to
  // it is still a place on the island a child has to walk to.
  for (const page of [a, b]) {
    await goTo(page, ...world(kickGate));
    await page.evaluate(() => uspeak.net.room.send('ride:buy', { id: 'kick' }));
    await sleep(600);
    await goTo(page, ...world(start));
  }

  // Pressing start is what the start line does: net-client's onRace('join').
  for (const page of [a, b]) await page.evaluate(() => uspeak.net.gp.start({ name: 'テスト' }));
  for (const page of [a, b]) {
    await page.waitForFunction(() => uspeak.net.gp.state.open, null, { timeout: 40000, polling: 200 })
      .catch(async () => { throw new Error(`no grid: ${JSON.stringify(await errors(page))}`); });
  }
  const grid = await gpState(a);
  check('the start line opens the grand prix, and the room dealt the grid',
    grid.open && grid.online && grid.laps === 3, JSON.stringify(grid));

  // It is a whole screen. The island is not behind it, it is gone.
  check('the grand prix takes the whole screen',
    !(await shown(a, '.right-rail')) && !(await shown(a, '.bottom')) && !(await shown(a, '.quest-panel'))
    && !(await shown(a, '.net-dock')) && !(await shown(a, '.mobile-pad')) && (await shown(a, '#gp')),
    await a.evaluate(() => document.body.dataset.gp || '(none)'));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-gp-grid.png') });

  // The lights and the flag are the room's.
  for (const page of [a, b]) {
    await page.waitForFunction(() => uspeak.net.gp.state.phase === 'race', null, { timeout: 40000, polling: 150 })
      .catch(async () => { throw new Error(`no lights: ${JSON.stringify(await gpState(page))}`); });
  }
  check('the lights go out on the room\'s clock, for both of them at once', true);

  // ---- the thing this test exists for
  //
  // Both browsers must have the same ミドリ in the same place. They are sampled a moment
  // apart and drawn a tenth of a second in the past, so they are compared with a tolerance
  // of a few metres — a page running its own rival would be tens of metres out within
  // seconds, and hundreds within a lap.
  await sleep(3000);
  const was = await midori(a);
  await sleep(4000);
  const m1 = await midori(a);
  const m2 = await midori(b);
  const apart = m1 && m2 ? Math.hypot(m1.x - m2.x, m1.z - m2.z) : Infinity;
  check('both children are racing the same ミドリ, in the same place on the road',
    apart < 12, `${apart.toFixed(1)}m apart (${JSON.stringify(m1)} / ${JSON.stringify(m2)})`);
  // And she is being driven, not parked on the grid: four seconds of a kart is tens of
  // metres of road. A page that never applies the room's samples would sit still here.
  const drove = Math.hypot(m1.x - was.x, m1.z - was.z);
  check('and she is driving, not parked', drove > 25, `${drove.toFixed(1)}m in four seconds`);

  // ---- the child drives, with the rivals' own autopilot
  for (const page of [a, b]) {
    await page.evaluate(async () => {
      const { createDriver, driveAI } = await import('./kart-ai.js');
      const d = createDriver({ id: 'me', name: 'me', skill: 1.02, style: 0 });
      uspeak.net.gp.setAutoDrive((kart, now) => driveAI(d, kart, { track: uspeak.net.gp.state.track, now }));
    });
  }
  await a.waitForFunction(() => uspeak.net.gp.state.lap >= 2, null, { timeout: 120000, polling: 400 })
    .catch(async () => { throw new Error(`no lap: ${JSON.stringify(await gpState(a))} ${JSON.stringify(await errors(a))}`); });
  check('a lap the child actually drove counts', (await gpState(a)).lap >= 2, JSON.stringify(await gpState(a)));
  // A handful of 'too fast' is the lap floor doing its job on a page running in slow
  // motion. A pile of 'not next' or 'too far' is the retry thrashing: the page and the
  // room have come apart and are arguing about it several times a second.
  const refusals = (list, why) => list.filter((e) => e.includes(why)).length;
  const errs1 = await errors(a);
  check('and the page and the room agree about which checkpoint is next',
    refusals(errs1, 'not next') + refusals(errs1, 'too far') < 4, JSON.stringify(errs1).slice(0, 200));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-gp-racing.png') });

  // ---- 📦 an item box: English first, dash second
  //
  // The right word is looked up here the way a teacher would, from the bank on disk. The
  // page never has it: it is sent one Japanese word and three English ones.
  const BANK = JSON.parse(readFileSync(path.resolve(serverDir, 'src/game/gym-words.json'), 'utf8')).words;
  await a.evaluate(() => {
    // Put the kart on the next box AHEAD of it, and remember where it was. Everything the
    // room checks about the claim — which box, and where on the circuit the kart was — is
    // unchanged by how it got there, and the kart goes straight back afterwards so the
    // lap it is in the middle of is still the lap it drove.
    const t = uspeak.net.gp.state.track;
    const k = uspeak.net.gp.me.kart;
    const ahead = (b) => ((b.s - k.s) + t.length) % t.length;
    const box = t.items.slice().sort((p, q) => ahead(p) - ahead(q))[0];
    window.__wasAt = { x: k.x, y: k.y, z: k.z, s: k.s, heading: k.heading };
    k.x = box.x; k.z = box.z; k.y = box.y; k.speed = 0; k.s = box.s; k.hint = -1;
  });
  const asked = await a.waitForFunction(() => (document.querySelector('#gp-quiz').hidden ? null : {
    ja: document.querySelector('#gp-quiz-ja').textContent,
    choices: [...document.querySelectorAll('#gp-quiz-choices [data-pick]')].map((el) => el.dataset.pick),
  }), null, { timeout: 40000, polling: 200 }).then((h) => h.jsonValue());
  const answerOf = (q) => BANK.filter((w) => w.ja === q.ja).map((w) => w.en).find((en) => q.choices.includes(en));
  check('a box asks for an English word before it gives anything',
    asked.choices.length === 3 && !!asked.ja && !!answerOf(asked), `${asked.ja} → ${asked.choices.join(' / ')}`);
  await a.screenshot({ path: path.join(SHOTS, 'e2e-gp-box.png') });

  const before = await a.evaluate(() => uspeak.net.gp.me.kart.boostUntil);
  await a.evaluate((p) => document.querySelector(`#gp-quiz-choices [data-pick="${p}"]`).click(), answerOf(asked));
  const boosted = await a.waitForFunction((was) => uspeak.net.gp.me.kart.boostUntil > was, before, { timeout: 25000, polling: 150 })
    .then(() => true).catch(() => false);
  check('and the right word is a dash', boosted, `${asked.ja} → ${answerOf(asked)}`);
  await a.evaluate(() => {
    const k = uspeak.net.gp.me.kart;
    Object.assign(k, window.__wasAt, { hint: -1 });
    uspeak.net.gp.me.lastS = k.s;
  });

  // ---- the flag
  const purse = await coins(a);
  await a.waitForFunction(() => uspeak.net.gp.state.phase === 'done', null, { timeout: 600000, polling: 500 })
    .catch(async () => { throw new Error(`no flag: ${JSON.stringify(await gpState(a))} ${JSON.stringify(await errors(a))}`); });
  await a.waitForFunction(() => !!uspeak.net.gp.state.result, null, { timeout: 40000, polling: 250 })
    .catch(() => {});
  const result = await a.evaluate(() => uspeak.net.gp.state.result || null);
  check('three laps is the flag, and the room says where the child came',
    !!result && result.place >= 1, JSON.stringify(result));
  check('and the flag pays, out of the room\'s purse', (await coins(a)) > purse, `${purse} → ${await coins(a)}`);
  const errs2 = await errors(a);
  check('and it stayed that way for the whole race',
    refusals(errs2, 'not next') + refusals(errs2, 'too far') < 8,
    `${refusals(errs2, 'not next')} not-next, ${refusals(errs2, 'too far')} too-far, ${refusals(errs2, 'too fast')} too-fast`);
  const card = await a.evaluate(() => document.querySelector('#gp-result-body')?.textContent.replace(/\s+/g, ' ').trim() || '');
  check('the result card shows the lap time and the finishing order',
    card.includes('ベストラップ') && (await a.evaluate(() => document.querySelectorAll('.gp-result-order li').length)) >= 6,
    card.slice(0, 90));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-gp-result.png') });

  // Out. The island comes back, and nothing of the race is left on the screen.
  await a.evaluate(() => document.querySelector('#gp-exit').click());
  await sleep(800);
  check('leaving the grand prix hands the island back',
    (await shown(a, '.right-rail')) && (await shown(a, '.bottom')) && !(await shown(a, '#gp')),
    await a.evaluate(() => document.body.dataset.gp || '(none)'));

  // The other child was in the same race all along.
  const other = await gpState(b);
  check('the second child raced the same race', other.field.length >= 6, JSON.stringify(other.field));
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
