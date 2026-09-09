// One real browser page in a room with N headless bots (default 99): verifies the client
// keeps up at 100 players (all remotes tracked, render budget applied, status online, no page
// errors, reconnect < 3 s) and prints frame time. Needs Playwright like browser-sync.mjs.
// Run: node test/e2e/browser-scale.mjs [bots]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const PORT = 2640;
const BOTS = Number(process.argv[2] || 99);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', MAX_CLIENTS: '100', LOG_LEVEL: 'info' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
server.stdout.on('data', (d) => { const t = String(d); if (/Teacher|created|full/.test(t)) process.stdout.write('[server] ' + t); });
await sleep(1500);
const bots = spawn('node', ['loadtest/run.mjs', `--url=ws://127.0.0.1:${PORT}`, `--clients=${BOTS}`, '--duration=400', '--class=scale', `--out=${path.join(serverDir, 'loadtest-results')}`], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] });
bots.stdout.on('data', (d) => { const t = String(d); if (/joined|alive=/.test(t)) process.stdout.write('[bots] ' + t); });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 240 } });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  let pageErrors = 0;
  page.on('pageerror', (e) => { pageErrors++; console.log('[page] error', e.message); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 120000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 20000 });
  await page.fill('#net-name', 'Teacher');
  await page.fill('#net-class', 'scale');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
  await page.evaluate(async () => { const { STARTERS } = await import('./magic-data.js'); if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id); uspeak.rpg.close(); for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  for (let i = 0; i < 24; i++) {
    const d = await page.evaluate(() => ({ size: uspeak.net.room?.state.players.size, mode: uspeak.net.mode, remotes: uspeak.net.remotes.count, rendered: uspeak.net.remotes.stats.rendered, sid: uspeak.net.sessionId }));
    console.log(`[page] t+${i * 5}s`, JSON.stringify(d));
    if (d.size >= BOTS + 1) break;
    await sleep(5000);
  }
  await sleep(3000);
  const measure = async (label) => {
    const r = await page.evaluate(async () => new Promise((resolve) => {
      const frames = []; let last = performance.now(); let n = 0;
      const step = () => { const now = performance.now(); frames.push(now - last); last = now; if (++n < 90) requestAnimationFrame(step); else resolve({ avg: frames.reduce((a, b) => a + b, 0) / frames.length, max: Math.max(...frames), remotes: uspeak.net.remotes.count, rendered: uspeak.net.remotes.stats.rendered, inSpace: uspeak.net.remotes.stats.inSpace }); };
      requestAnimationFrame(step);
    }));
    console.log(`${label}: frame avg ${r.avg.toFixed(1)} ms, max ${r.max.toFixed(0)} ms, remotes ${r.remotes}, in space ${r.inSpace}, rendered ${r.rendered}`);
    return r;
  };
  const budget = await measure('LOD budget ON (32 nearest)');
  check(`page tracks all ${BOTS} remotes`, budget.remotes === BOTS, `${budget.remotes}`);
  check('render budget caps drawn avatars at 32', budget.rendered <= 32 && budget.rendered > 0, `${budget.rendered}`);
  check('status still online with 100 in room', await page.evaluate(() => document.querySelector('#net-status').classList.contains('online')));
  check('no page errors', pageErrors === 0, `${pageErrors}`);
  const status = await page.evaluate(() => document.querySelector('#net-status span').textContent);
  console.log('status chip:', status);
  const t1 = Date.now();
  await page.evaluate(() => uspeak.net.room.leave(false));
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 15000, polling: 250 });
  check('reconnect with 100 in room < 3000 ms', Date.now() - t1 < 3000, `${Date.now() - t1} ms`);
} catch (err) { console.log('SCALE ERROR', err); results.push({ name: 'script', ok: false }); }
finally { await browser.close(); bots.kill('SIGTERM'); server.kill('SIGTERM'); }
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
