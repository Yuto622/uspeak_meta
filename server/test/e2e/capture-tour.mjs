// 紹介動画（docs/make-tour.py）に 足した 機能の 写真を 撮る。docs/figures/tour-*.jpg（1280×800）。
//
// Run: node test/e2e/capture-tour.mjs [name …]     （名前を 書くと その 写真だけ）
//
// ・ゆぴちゃん（英会話島・めんせつの間）は lib/character-webm.mjs で 本物の 動画を 出す。
// ・英会話島・英検の 島は プレミアム なので、撮る 子（みほん）を 名簿で プレミアムに する。
// ・この 端末は 1 秒に 数コマ しか 描けないので、待ち時間は 長め。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';
import { characterWebm, routeCharacter } from './lib/character-webm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = path.resolve(serverDir, '../docs/figures');
const TMP = path.resolve(serverDir, 'loadtest-results/tour-tmp');
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2695;
const ADMIN = 'tour-admin-key-123';
const NAME = 'みほん';
const ONLY = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error', ADMIN_KEY: ADMIN, REPORT_SECRET: 'tour-report-secret-0123456789' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await waitForServer(PORT);

async function adminCookie() {
  const r = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${ADMIN}`, redirect: 'manual' });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const cookie = await adminCookie();
await fetch(`${base}/admin/api/roster`, { method: 'PUT', headers: { cookie, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ name: NAME, premium: true }] }) });

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await routeCharacter(ctx, characterWebm(path.join(TMP, 'character')));
const [name, value] = cookie.split('=');
await ctx.addCookies([{ name, value, url: base }]);
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('  pageerror', e.message));

const shot = async (id) => { await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 86, timeout: 120000 }); console.log(`  docs/figures/${id}.jpg`); };
const closeAll = () => page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); if (uspeak.rpg.isOpen) uspeak.rpg.close(); });
// 島へ とんで、その 場所の 前に 立つ（近いと 言うまで 置きなおす）。
async function stand(island, spotId, dz = 1.6) {
  await page.evaluate((id) => { uspeak.rpg.inside?.leave?.(true); uspeak.rpg.fly(id); uspeak.rpg.finishFlight?.(); }, island);
  await sleep(1500);
  await page.waitForFunction(async ([id, spotId, dz]) => {
    const isl = uspeak.rpg[id]; const data = isl?.ready ? await isl.ready : isl?.data; const d = data?.island || data;
    if (!d?.spots) return false;
    const spot = d.spots.find((s) => s.id === spotId); if (!spot) return false;
    uspeak.player.position.set(d.x + spot.x, 0, d.z + spot.z + dz);
    return true;
  }, [island, spotId, dz], { timeout: 120000, polling: 500 });
  await sleep(1500);
}

await page.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
await page.click('#avatar-cancel');
await page.waitForSelector('#net-lobby[open]');
await page.fill('#net-name', NAME); await page.fill('#net-class', 'tour'); await page.click('#net-join');
await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000 });
await page.evaluate(async () => {
  const { STARTERS } = await import('./magic-data.js');
  if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
});
await page.mouse.click(10, 400);   // 音の 許可（さいしょの タップ）

const STEPS = {
  // 入った とき：せかいを えらぼう（カードを おすと その 島の 代表の 場所が すぐ ひらく）。
  async 'tour-worlds'() { await page.evaluate(() => uspeak.rpg.openMap()); await sleep(4000); await shot('tour-worlds'); await closeAll(); },
  // メインの島：つぎに やること・光の 道・下の バー。
  async 'tour-main'() { await closeAll(); await sleep(5000); await shot('tour-main'); },
  async 'tour-abc'() {
    await closeAll(); await page.evaluate(() => uspeak.net.abc.open()); await sleep(2500);
    await page.evaluate(() => uspeak.net.abc.handle('abc:ask', { kind: 'show', teach: true, n: 1, of: 5, letter: 's', word: 'sun', sound: 's' })); await sleep(3500);
    await shot('tour-abc-letter');
    await page.evaluate(() => uspeak.net.abc.handle('abc:ask', { kind: 'blend', n: 2, of: 5, parts: ['sh', 'i', 'p'], sounds: ['sh', 'i', 'p'], choices: ['ship', 'shop', 'fish'] }));
    await sleep(2200); await shot('tour-abc-blend'); await closeAll();
  },
  async 'tour-roadmap'() { await closeAll(); await page.evaluate(() => uspeak.net.roadmap.open()); await sleep(5000); await shot('tour-roadmap'); await closeAll(); },
  async 'tour-rank'() { await closeAll(); await page.evaluate(() => document.querySelector('#rank-button')?.click()); await sleep(4500); await shot('tour-rank'); await closeAll(); },
  async 'tour-quick'() { await closeAll(); await page.evaluate(() => uspeak.net.quick.open()); await sleep(4500); await shot('tour-quick'); await closeAll(); },
  async 'tour-avatar'() {
    await closeAll(); await page.evaluate(() => uspeak.net.wardrobe.open({ slot: 'avatar' })); await sleep(6000);
    await page.evaluate(() => [...document.querySelectorAll('.wear-card')].find((c) => c.querySelector('[data-shot="av-dragon"]'))?.click()); await sleep(3000);
    await shot('tour-avatar'); await closeAll();
  },
  // 英会話島（ゆぴちゃん）：場面を えらんで、はじめの ひとこと。
  async 'tour-conv'() {
    await closeAll(); await stand('conv', 'cafe');
    await page.waitForFunction(() => !!uspeak.rpg.convNearby(), null, { timeout: 60000, polling: 500 }).catch(() => {});
    await page.evaluate(() => uspeak.net.convInteract());
    await page.waitForSelector('#conv-dialog[open]', { timeout: 60000 }); await sleep(2500);
    await page.click('#conv-picker [data-topic]'); await sleep(9000);
    await shot('tour-conv'); await page.evaluate(() => document.querySelector('#conv-close')?.click()); await closeAll();
  },
  // めんせつの間（ゆぴちゃんが 面接官）。
  async 'tour-interview'() {
    await closeAll(); await stand('eiken5', 'interview', 1.4);
    await page.waitForFunction(() => uspeak.rpg.eikenNearby?.()?.spot?.kind === 'interview', null, { timeout: 60000, polling: 500 }).catch(() => {});
    await page.evaluate(() => uspeak.net.eikenInteract()); await sleep(9000);
    await shot('tour-interview'); await closeAll();
  },
  // 先生・運営の 画面（同じ ブラウザに 運営の ログインを 入れて ある）。
  async 'tour-homework-admin'() { await page.goto(`${base}/admin/homework`); await sleep(3000); await shot('tour-homework-admin'); },
  async 'tour-phonics-admin'() { await page.goto(`${base}/admin/abc`); await sleep(2500); await page.evaluate(() => document.querySelector('#ph')?.scrollIntoView()); await sleep(800); await shot('tour-phonics-admin'); },
};

try {
  for (const [id, run] of Object.entries(STEPS)) {
    if (ONLY.length && !ONLY.some((o) => id.startsWith(o))) continue;
    try { console.log(id); await run(); } catch (err) { console.log(`  ${id} failed:`, err.message.split('\n')[0]); }
  }
} finally {
  await browser.close();
  server.kill();
}
