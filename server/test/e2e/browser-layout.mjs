// Renders the game at phone and tablet viewports, screenshots the multiplayer UI
// states, and fails if anything leaves the viewport or collides with something else.
//
// Requires Playwright, like the other e2e scripts:
//   npm i -D playwright && npx playwright install chromium
// Run:  npm run test:layout            (all viewports)
//       node test/e2e/browser-layout.mjs iphone-portrait   (just one)
// Screenshots land in server/loadtest-results/layout-*.png.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.LAYOUT_PORT || 2671);
const OUT = path.resolve(serverDir, 'loadtest-results');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ONLY = process.argv.slice(2);
const ALL = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'small-portrait', width: 360, height: 640 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
];
const DEVICES = ONLY.length ? ALL.filter((d) => ONLY.includes(d.name)) : ALL;
// The rail is a scrolling container: its children may extend past it, and it always
// overlaps them. The teacher console is a deliberate overlay drawn on top.
const RAIL_KIDS = ['.map-panel', '.scenery-controls', '#flight-button', '.fishing-button', '.rpg-buddy-button'];
const OVERLAY = ['#net-teacher'];
const PROBES = ['.right-rail', '#net-status', '#net-chat-button', '#net-teacher-button', '#net-teacher',
  '.hotbar', '.mobile-pad', '#near', '.quest-panel', ...RAIL_KIDS];

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', TEACHER_KEY: 'testkey12345', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await sleep(1500);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-background-networking', '--disable-sync', '--disable-features=AutofillServerCommunication,OptimizationHints',
    '--no-first-run', '--no-default-browser-check'],
});

let failures = 0;
try {
  for (const d of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    // The sandbox has no internet: answer the font request locally and drop anything
    // else off-host so screenshots never wait on a hanging connection.
    await page.route('**/*', (r) => {
      const u = r.request().url();
      if (u.includes('127.0.0.1')) return r.continue();
      if (u.includes('fonts.googleapis.com')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return r.abort();
    });
    page.on('pageerror', (e) => console.log(`[${d.name}] pageerror`, e.message));
    const shot = (n) => page.screenshot({ timeout: 90000, path: path.join(OUT, `layout-${d.name}-${n}.png`) });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 120000 });
    await shot('1-avatar');
    await page.click('#avatar-confirm');
    await page.waitForSelector('#net-lobby[open]', { timeout: 30000 });
    await page.click('#net-teacher-details summary');
    await shot('2-lobby');
    await page.fill('#net-name', 'Yuto');
    await page.fill('#net-class', 'a');
    await page.fill('#net-key', 'testkey12345');
    await page.click('#net-join');
    await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
    await page.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const el of document.querySelectorAll('dialog[open]')) el.close();
    });
    await sleep(700);
    await shot('3-game');
    await page.click('#net-chat-button');
    await sleep(400);
    await shot('4-chat');
    await page.click('#net-chat-close');
    await page.click('#net-teacher-button');
    await sleep(700);
    await shot('5-teacher');
    await page.click('#net-teacher-close');
    await sleep(300);

    const report = await page.evaluate((probes) => {
      const boxes = {};
      for (const sel of probes) {
        const el = document.querySelector(sel);
        if (!el || el.hidden || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') { boxes[sel] = null; continue; }
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) { boxes[sel] = null; continue; }
        boxes[sel] = { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return { vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, coarse: matchMedia('(pointer: coarse)').matches, boxes };
    }, PROBES);

    const bad = [];
    if (report.scrollW > report.vw + 1) bad.push(`horizontal scroll (${report.scrollW} > ${report.vw})`);
    for (const [k, b] of Object.entries(report.boxes)) {
      if (!b || RAIL_KIDS.includes(k)) continue; // rail children are clipped by the rail, not the viewport
      if (b.right > report.vw + 1 || b.bottom > report.vh + 1 || b.x < -1 || b.y < -1) bad.push(`${k} leaves the viewport ${JSON.stringify(b)}`);
    }
    const keys = Object.keys(report.boxes).filter((k) => report.boxes[k] && !OVERLAY.includes(k));
    const related = (a, b) => (a === '.right-rail' && RAIL_KIDS.includes(b)) || (b === '.right-rail' && RAIL_KIDS.includes(a)) || (RAIL_KIDS.includes(a) && RAIL_KIDS.includes(b));
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      if (related(keys[i], keys[j])) continue;
      const a = report.boxes[keys[i]], b = report.boxes[keys[j]];
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      if (ov > 200) bad.push(`overlap ${keys[i]} x ${keys[j]} = ${ov}px2`);
    }
    console.log(`\n== ${d.name} (${d.width}x${d.height}) coarse=${report.coarse} pad=${!!report.boxes['.mobile-pad']} rail=${!!report.boxes['.right-rail']}`);
    if (!bad.length) console.log('  clean');
    bad.forEach((b) => { console.log('  ' + b); failures++; });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
console.log(`\n${failures} layout problem(s)`);
process.exit(failures ? 1 : 0);
