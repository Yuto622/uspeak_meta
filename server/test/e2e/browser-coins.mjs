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

  // Earn. Any coin the game pays goes through the fishing store's commit, so this is the
  // same path a caught fish, a won race or the room's own reconcile takes.
  await page.evaluate(() => { for (let i = 0; i < 6; i += 1) uspeak.fishing.store.catchFish(`fish-${i + 1}`); });
  await page.evaluate(() => { try { uspeak.fishing.store.sellAll(); } catch { /* the room may have its own idea */ } });
  await sleep(900);

  const falling = await page.evaluate(() => document.querySelectorAll('.coin-drop').length);
  check('coins are actually drawn falling, not just counted', falling > 0, `${falling} on screen`);
  // The reference lines them up along the bottom edge, where they can be counted. That
  // row is the "見える化" — coins somewhere off-screen would tell a child nothing.
  const low = await page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('.coin-drop')].filter((c) => c.getBoundingClientRect().bottom > h * 0.75).length;
  });
  check('and they land in a row along the bottom of the screen', low > 0, `${low} of ${falling} in the bottom quarter`);
  // One payment, one shower: the page's own update and the room's confirmation are the
  // same reward arriving twice, and drawing it twice is twice the coins for one event.
  check('one reward is one shower, not two', falling <= 14, `${falling} coins for one payment`);
  await page.screenshot({ path: path.join(SHOTS, 'coin-falling.png') });

  await sleep(1800);
  const after = await badge();
  const total = Number(after.text.replace(/[^\d]/g, '')) || 0;
  check('the balance ends on the number the coins added up to', total > start, `${start} → ${total}`);
  check('and the screen is left clean', (await page.evaluate(() => document.querySelectorAll('.coin-drop').length)) === 0);
  await page.screenshot({ path: path.join(SHOTS, 'coin-collected.png') });

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
