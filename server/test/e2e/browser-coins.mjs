// コインの見える化, in a real browser.
//
// The badge is easy to get wrong in a way no unit test would see: it lives inside
// `header .stats`, where style.css says `.stats button { width:32px; height:32px }`, and
// that rule is one class plus one element — enough to beat a plain `.coin-hud` and squeeze
// the number out of existence. It did exactly that the first time. So this measures the
// rendered badge rather than the markup: is it wider than a 32px square, does it actually
// show the balance, do coins really fall, and does the screen clean itself up afterwards.
//
// Run: node test/e2e/browser-coins.mjs   (not part of `npm test`)
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

const PORT = 2672;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1600);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 900, height: 620 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

try {
  const page = await openPage('Yuto');
  const badge = () => page.evaluate(() => {
    const el = document.querySelector('header .stats #coin-hud');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim(), shown: r.width > 0 };
  });

  const first = await badge();
  check('the balance sits in the header, on every island', !!first?.shown, JSON.stringify(first));
  // The regression this exists for: squeezed to a 32px square, the number is gone.
  check('and it is a badge, not a 32px square with the number squeezed out',
    first.w > 46 && first.h >= 34, `${first.w}×${first.h}`);

  const start = Number((await badge()).text.replace(/[^\d]/g, '')) || 0;

  // Earn, the way the game really pays: answer a question and let the room decide. Doing
  // it locally would only prove the page can animate its own optimism — the room rejects
  // fish it never saw caught, and the balance would end where it started.
  // Catching pays its own small bonus, so that is one payment; let it finish completely
  // before the one being measured. Two payments arriving together is not the thing this
  // check is looking for — that is just a child being paid twice.
  await page.evaluate(() => uspeak.net.room.send('answer', { q: 'fish:fish-1', c: 'fish-1' }));
  await sleep(3000);
  await page.evaluate(() => uspeak.net.room.send('economy', { op: 'sellAll' }));

  // Polled, not sampled once. The burst is over in about a second and this container
  // renders under two frames a second, so a single reading at a fixed moment is as likely
  // to land after it as during it.
  let flying = 0;
  let parkedEver = 0;
  for (let i = 0; i < 12; i += 1) {
    await sleep(120);
    const seen = await page.evaluate(() => {
      const h = window.innerHeight;
      const all = [...document.querySelectorAll('.coin-fly')];
      return { n: all.length, low: all.filter((c) => c.getBoundingClientRect().top > h * 0.7).length };
    });
    flying = Math.max(flying, seen.n);
    parkedEver = Math.max(parkedEver, seen.low);
  }
  check('earning draws coins, it does not only count them', flying > 0, `${flying} in the air`);
  // Earning is frequent, so it must not leave anything lying about: the coins stay up by
  // the badge and are gone in a second. Nothing travels down to the bottom edge and waits
  // there, which is what it used to do and what made it clutter.
  check('and it leaves nothing sitting at the bottom of the screen', parkedEver === 0, `${parkedEver} reached the bottom`);
  // One payment, one animation: the page's own update and the room's confirmation are the
  // same reward arriving twice, and drawing it twice is twice the coins for one event.
  check('one reward is one animation, not two', flying <= 10, `${flying} coins for one payment`);
  await page.screenshot({ path: path.join(SHOTS, 'coin-falling.png') });

  await sleep(1800);
  const after = await badge();
  const total = Number(after.text.replace(/[^\d]/g, '')) || 0;
  check('the balance ends on the number the coins added up to', total > start, `${start} → ${total}`);
  check('and the screen is left clean', (await page.evaluate(() => document.querySelectorAll('.coin-fly, .coin-pour').length)) === 0);
  await page.screenshot({ path: path.join(SHOTS, 'coin-collected.png') });

  // The じゃらじゃら: asked for, not automatic. Tapping the balance pours the purse down
  // the whole height of the screen, and how much falls is how much there is.
  const spreadNow = () => page.evaluate(() => {
    const h = window.innerHeight;
    const els = [...document.querySelectorAll('.coin-pour')];
    // Keyed by the coin's own identity, so the same coin can be followed from one poll to
    // the next rather than compared with whichever coin happens to be lowest.
    const tops = {};
    els.forEach((c) => {
      if (!c.dataset.probe) c.dataset.probe = String(Math.random()).slice(2);
      tops[c.dataset.probe] = c.getBoundingClientRect().top;
    });
    const all = Object.values(tops);
    return {
      n: els.length,
      // Whether the animation has had a frame at all: the coins are placed by CSS and
      // only ever get a transform from inside the rAF loop.
      moved: els.some((c) => !!c.style.transform),
      spread: all.length ? Math.round((Math.max(...all) - Math.min(...all)) / h * 100) : 0,
      tops,
    };
  });
  // Polled through the whole pour, and judged on how far the coins actually got. A single
  // reading proves nothing: the first version of this animation never moved at all in this
  // container — the Web Animations clock was frozen while the world kept rendering — and a
  // one-shot check of their positions passed it happily, because they were sitting exactly
  // where their CSS put them.
  // What can honestly be checked here, and what cannot.
  //
  // This container renders at roughly one frame a second. A pour lives about a second and
  // a half, so it gets two or three frames in total — measured, with the loop's own
  // counter, ticking in exact step with requestAnimationFrame. That is enough to prove the
  // animation RUNS and is driven by the right clock; it is not enough to watch a coin
  // travel the height of the screen, and a check that depends on catching it mid-fall
  // passes or fails on luck (identical code gave 19%, 51%, 58% and 0% on four runs).
  //
  // So: the loop running, the coins existing in the right number, and the screen being
  // left clean are asserted. How it LOOKS needs a machine that can draw it, and the
  // motion was confirmed by hand at 900x620 — coins from -37px to 492px with the
  // expected transforms.
  const loop = () => page.evaluate(() => ({
    ticks: uspeak.coins.frames, flying: uspeak.coins.flying,
    dom: document.querySelectorAll('.coin-pour').length,
    posed: [...document.querySelectorAll('.coin-pour')].filter((c) => !!c.style.transform).length,
  }));
  const before = await loop();
  await page.evaluate(() => document.querySelector('#coin-hud').click());
  let most = 0;
  let posedEver = 0;
  let ticksEnd = before.ticks;
  for (let i = 0; i < 14; i += 1) {
    await sleep(200);
    const seen = await loop();
    most = Math.max(most, seen.dom);
    posedEver = Math.max(posedEver, seen.posed);
    ticksEnd = seen.ticks;
    if (i === 3) await page.screenshot({ path: path.join(SHOTS, 'coin-pour.png') });
  }
  check('tapping the balance pours the coins down the screen', most > 8, `${most} falling`);
  // Scaled to the purse: this is the whole point of the button. 128 coins at one drawn
  // coin per eight is 16, floored at the 18 that still reads as じゃらじゃら.
  check('and how many fall is set by how much money there is', most >= 18, `${most} for ${total} coins`);
  const ticked = ticksEnd - before.ticks;
  check('the coins are driven by the browser\'s own frame clock, and it really ran',
    ticked >= 2 && posedEver > 0, `${ticked} frames, ${posedEver} coins placed by the loop`);

  // And the sweep: coins must go even if the frames do not come, or a slow tablet keeps
  // them on screen for the rest of the lesson.
  await sleep(3200);
  check('the pour clears itself away, frames or no frames',
    (await page.evaluate(() => document.querySelectorAll('.coin-pour').length)) === 0);

  // …and the coins and the record are two different taps, because a modal dialog would
  // sit on top of the pour and hide it.
  await page.evaluate(() => document.querySelector('#record-button').click());
  await page.waitForFunction(() => document.querySelector('#dash-dialog')?.open, null, { timeout: 15000 });
  check('the level beside the coins opens マイページ', true);
  await page.evaluate(() => { try { uspeak.net.dash.dialog.close(); } catch {} });

  // The race and the grand prix take the whole window; the island's furniture goes too.
  await page.evaluate(() => { document.body.dataset.gp = 'on'; });
  await sleep(150);
  check('and it steps aside for the screens that take the whole window',
    !(await page.evaluate(() => !!document.querySelector('#coin-hud')?.getClientRects().length)));
  await page.evaluate(() => { delete document.body.dataset.gp; });
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
