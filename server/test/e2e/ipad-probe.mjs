// iPad 横向きで ゲームを 開き、渡した 式を ページの 中で 評価して JSON で 出す（見た目の 数字を 測る 用）。
// node test/e2e/ipad-probe.mjs '<js expression>' [island]   （SHOT=path.jpg で 最後に 写真）
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { waitForServer } from './lib/walk.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 2694;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' }, stdio: 'ignore' });
await waitForServer(PORT);
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 1180), height: Number(process.env.H || 820) }, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', 'probe'); await page.fill('#net-class', 'probe');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(async (isle) => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.net.main.skipHome?.();
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    if (isle) { uspeak.rpg.fly(isle); uspeak.rpg.finishFlight(); }
  }, process.argv[3] || '');
  await page.waitForTimeout(2000);
  const out = await page.evaluate(`(async () => { const box = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent || getComputedStyle(e).position === 'fixed').map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { s, id: e.id, cls: String(e.className).slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, color: cs.color, txt: (e.innerText || '').replace(/\\s+/g, ' ').slice(0, 40) }; }); return (${process.argv[2]}); })()`);
  console.log(JSON.stringify(out, null, 1));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, type: 'jpeg', quality: 85, timeout: 180000 });   // SHOT=path で 写真も
} finally { await browser.close(); server.kill('SIGTERM'); }
