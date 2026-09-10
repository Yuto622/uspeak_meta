// Browser end-to-end check for 日課: the login bonus a child sees on joining, and the
// class's weekly ranking. What is checked is that the page only displays these — the
// coins are in the wallet before the popup renders, and reloading pays nothing again.
//
// Run: node test/e2e/browser-daily.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');

const PORT = 2621;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

// Joins without dismissing the daily dialog: that popup is what this file is about.
async function openPage(ctx, name) {
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 90000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 90000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 5000 });
  await page.fill('#net-name', name);
  await page.fill('#net-class', 'e2e-daily');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 30000, polling: 250 });
  return page;
}
const coins = (page) => page.evaluate(() => uspeak.fishing.store.state.coins);

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
  const a = await openPage(ctx, 'Hoshi');
  await a.waitForSelector('#daily-dialog[open]', { timeout: 15000 });
  check('the login bonus greets a child on arrival', true);
  const banked = await coins(a);
  const shown = Number((await a.textContent('#daily-body .daily-hit p b')).replace(/\D/g, ''));
  check('the coins are already in the purse when the popup renders', banked >= shown && shown === 100, `purse=${banked} shown=${shown}`);
  check('the stamp card shows the whole week', (await a.$$eval('#daily-body .daily-stamps li', (n) => n.length)) === 7);
  check('today is the one marked', (await a.$$eval('#daily-body .daily-stamps li.today', (n) => n.map((x) => x.textContent))).join('|').includes('1日目'));
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOTS, { recursive: true });
  await a.screenshot({ path: path.join(SHOTS, 'e2e-daily-bonus.png') });

  // The ranking is asked for, not held: the page has no board until the server answers.
  await a.click('#daily-rank');
  await a.waitForSelector('#daily-body .daily-rank li', { timeout: 10000 });
  const row = (await a.textContent('#daily-body .daily-rank li.me')) || '';
  check('my own line is on the board and marked', row.includes('Hoshi'), row.replace(/\s+/g, ' ').trim());
  check('the season is named', ((await a.textContent('#daily-body .daily-season')) || '').trim().length > 1, await a.textContent('#daily-body .daily-season'));
  await a.screenshot({ path: path.join(SHOTS, 'e2e-daily-rank.png') });
  await a.click('#daily-body .quiz-actions .primary');
  await sleep(300);
  check('closing it gives the world back', !(await a.evaluate(() => document.querySelector('#daily-dialog').open)));
  check('and the closed dialog is not over the interact button', await a.evaluate(() => {
    const r = document.querySelector('#interact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !hit || !hit.closest('#daily-dialog');
  }));

  // The ranking button is the way back in, and it is only there while connected. The
  // starter picker opens over the world on a first visit, so put that away first.
  await a.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(300);
  await a.click('#rank-button');
  await a.waitForSelector('#daily-body .daily-rank li', { timeout: 10000 });
  check('the ranking button reopens the board', await a.evaluate(() => document.querySelector('#daily-dialog').open));
  await a.click('#daily-body .quiz-actions .primary');

  // Reloading is not a second payday: the same day claims once, on the server.
  await a.reload({ waitUntil: 'commit' });
  await a.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 40000, polling: 250 });
  await sleep(1200);
  check('reloading pays nothing again', !(await a.evaluate(() => document.querySelector('#daily-dialog')?.open)));
  check('and the purse is unchanged', (await coins(a)) === banked, `purse=${await coins(a)} was=${banked}`);
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
