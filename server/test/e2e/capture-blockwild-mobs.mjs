// BLOCKWILD の動物の写真を撮る（ガイドと、顔が頭に乗っているかの目視用）。
//
//   node test/e2e/capture-blockwild-mobs.mjs
//
// The single-player sandbox (the class world spawns no animals), creative mode, standing
// next to the nearest cow / pig / sheep / chicken in turn, one screenshot each.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const FIGS = path.resolve(serverDir, '../docs/figures');
const PORT = 2661;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'warn' }, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
setTimeout(() => { console.log('FAIL timed out'); server.kill(); process.exit(2); }, 10 * 60 * 1000).unref();
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/blockwild/index.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.BLOCKWILD && document.querySelector('#game')?.width, null, { timeout: 180000, polling: 500 });
  await page.click('#play');
  await page.waitForFunction(() => window.BLOCKWILD.state.playing && window.BLOCKWILD.mobs.list.length > 0, null, { timeout: 240000, polling: 500 });
  await sleep(1500);
  const kinds = ['cow', 'pig', 'sheep', 'chicken', 'zombie'];
  for (const kind of kinds) {
    const ok = await page.evaluate((k) => {
      const B = window.BLOCKWILD;
      let m = B.mobs.list.find((x) => x.type === k);
      if (!m) { const p = B.player.pos; m = B.mobs.spawn(k, p.x + 3, p.y, p.z + 3); }
      if (!m) return false;
      const mp = m.g.position;
      // Stand a few blocks away, facing the animal, a little above it.
      B.player.pos.x = mp.x + 2.6; B.player.pos.z = mp.z + 2.2; B.player.pos.y = mp.y + 0.2;
      B.player.yaw = Math.atan2(-(mp.x - B.player.pos.x), -(mp.z - B.player.pos.z));
      B.player.pitch = -0.25;
      B.setDrawing?.(false);
      return true;
    }, kind);
    if (!ok) { console.log(`  (no ${kind})`); continue; }
    await sleep(1200);
    await page.screenshot({ path: path.join(FIGS, `screen-blockwild-${kind}.jpg`), type: 'jpeg', quality: 88, timeout: 120000 });
    console.log(`  screen-blockwild-${kind}.jpg`);
  }
} catch (err) { console.log('FAIL', err.stack || String(err)); code = 1; }
await browser.close(); server.kill(); process.exit(code);
