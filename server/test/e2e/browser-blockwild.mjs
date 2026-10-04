// BLOCKWILD together, in two real browsers: two children of one class walk into ブロックの
// とびら on まちづくり島, are put into the class's shared world without typing anything, see
// each other's name in the game's own player count, and a block one of them places appears
// in the other's world — and the server, not the game, is what remembers it.
//
// Run: node test/e2e/browser-blockwild.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const PORT = 2679;
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'bw-e2e-'));
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'info', DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
setTimeout(() => { console.log('FAIL timed out'); server.kill(); process.exit(2); }, 15 * 60 * 1000).unref();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 900, height: 620 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const fig = async (page, name) => { await page.screenshot({ path: path.join(FIGS, `${name}.jpg`), type: 'jpeg', quality: 90, timeout: 120000 }); };

// Walk into ブロックの とびら: the frame opens, and the game inside boots.
async function openBlockwild(page) {
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.fly('town'); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 900));
    const isle = (await uspeak.rpg.town.ready).island;
    const spot = isle.spots.find((s) => s.kind === 'blockwild');
    uspeak.rpg.inside?.leave?.(true);
    uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z);
  });
  await page.waitForFunction(() => document.querySelector('.arcade-frame'), null, { timeout: 60000, polling: 200 });
  // The game's own window: a canvas drawn and its dev hook up means it has booted.
  await page.waitForFunction(() => {
    const w = document.querySelector('.arcade-frame')?.contentWindow;
    return !!(w?.document?.readyState === 'complete' && w.BLOCKWILD && w.document.querySelector('#game')?.width);
  }, null, { timeout: 180000, polling: 500 });
}
// Joined AND in: `online` flips the moment the welcome arrives, but the shared world is
// still being generated then (the game's own seed is the local one until createWorld ends
// and start() runs). This renderer takes a minute or more over that generation.
const joined = (page) => page.waitForFunction(() => { const s = document.querySelector('.arcade-frame')?.contentWindow?.BLOCKWILD?.state; return !!(s?.online && s.playing); }, null, { timeout: 240000, polling: 500 });
// What the game inside says about itself (through the hook it publishes for its own tests).
const inside = (page) => page.evaluate(() => {
  const w = document.querySelector('.arcade-frame')?.contentWindow;
  const s = w?.BLOCKWILD?.state || {};
  const d = w?.document;
  return {
    online: !!s.online, netId: s.netId || 0, friends: s.friends || 0, seed: s.seed, playing: !!s.playing,
    tag: d?.querySelector('#onlineTag')?.textContent || '', tagHidden: d?.querySelector('#onlineTag')?.classList.contains('hidden'),
    status: d?.querySelector('#netStatus')?.textContent || '', join: d?.querySelector('#netJoin')?.textContent || '',
    rowHidden: d?.querySelector('#netPanel .netrow')?.style.display === 'none', newHidden: d?.getElementById('new')?.style.display === 'none',
    name: d?.querySelector('#netName')?.value || '', code: d?.querySelector('#netCode')?.value || '',
  };
});
const blockAt = (page, x, y, z) => page.evaluate(([bx, by, bz]) => { const B = document.querySelector('.arcade-frame')?.contentWindow?.BLOCKWILD; const get = B?.W3?.getBlock || B?.getBlock; return get ? get(bx, by, bz) : -1; }, [x, y, z]);

try {
  const a = await openPage('Sora');
  a.on('pageerror', (e) => console.log('[pageerror:Sora]', e.message));
  await openBlockwild(a);
  await joined(a);
  const sa = await inside(a);
  check('walking into ブロックの とびら puts the child straight into the class world — no typing', sa.online && sa.netId >= 1 && sa.name === 'Sora' && /\/bw\/e2e\/ws$/.test(sa.code) && sa.rowHidden, JSON.stringify(sa));
  check('the local-world buttons step aside while in the shared world', sa.newHidden);
  check('the game shows one child in', /1人/.test(sa.tag) && !sa.tagHidden, sa.tag);

  // A second child of the same class: both see two, and the first hears the join.
  const b = await openPage('Rin');
  b.on('pageerror', (e) => console.log('[pageerror:Rin]', e.message));
  await openBlockwild(b);
  await joined(b);
  const sb = await inside(b);
  check('a classmate lands in the same world (same seed) and is counted', sb.online && sb.seed === sa.seed && /2人/.test(sb.tag), JSON.stringify({ a: sa.seed, b: sb.seed, tag: sb.tag }));
  await a.waitForFunction(() => /2人/.test(document.querySelector('.arcade-frame')?.contentWindow?.document.querySelector('#onlineTag')?.textContent || ''), null, { timeout: 30000, polling: 500 }).catch(() => {});
  const sa2 = await inside(a);
  check('and the first child sees the count go up and a friend appear', /2人/.test(sa2.tag) && sa2.friends === 1, JSON.stringify(sa2));

  // Sora places a block through the game's own path (changeBlock sends `block` when online);
  // Rin's world gets it without Rin doing anything. The spot is high over the map's
  // middle, so it is air in both worlds whatever the terrain.
  const X = 130; const Y = 60; const Z = 130;
  const before = await blockAt(b, X, Y, Z);
  await a.evaluate(([x, y, z]) => { const w = document.querySelector('.arcade-frame').contentWindow; w.BLOCKWILD.changeBlock ? w.BLOCKWILD.changeBlock(x, y, z, 1, 0) : w.BLOCKWILD.net.send({ t: 'block', x, y, z, id: 1, m: 0 }); }, [X, Y, Z]);
  await b.waitForFunction(([x, y, z]) => { const B = document.querySelector('.arcade-frame')?.contentWindow?.BLOCKWILD; const get = B?.W3?.getBlock || B?.getBlock; return !!get && get(x, y, z) === 1; }, [X, Y, Z], { timeout: 20000, polling: 300 }).catch(() => {});
  const after = await blockAt(b, X, Y, Z);
  check("a block one child places appears in the other's world", before === 0 && after === 1, `${before} → ${after}`);
  await sleep(2000);
  await fig(a, 'screen-blockwild-together');

  // The server kept it: a third child, in later, is handed the edit before anything else.
  const c = await openPage('Umi');
  await openBlockwild(c);
  await joined(c);
  await sleep(1500);
  check('a child who comes in later finds it already there', (await blockAt(c, X, Y, Z)) === 1);
  check('three in: the count says so', /3人/.test((await inside(c)).tag));
} catch (err) {
  check('no exception', false, err.stack || String(err));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
