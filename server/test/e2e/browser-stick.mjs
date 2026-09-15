// 左下のスティックで、本当に歩けるか。
//
// **教室のほぼ全員がこれで歩く。** iPad にキーボードは付いていない。それなのに、ここまで
// 動かしていたのはキーボードだけだった（`lib/walk.mjs` は矢印キーを押している）ので、
// スティックそのものを指で倒して測る。
//
// 見ているのは4つ：
//   1. 倒せば歩く
//   2. **倒した量で速さが変わる**（これが十字キーには無かったもの）
//   3. 離せば止まり、つまみは真ん中に戻る
//   4. 真ん中に指を置いただけでは歩かない（遊び＝デッドゾーン）
//
// Run: node test/e2e/browser-stick.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2711;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

try {
  // **指の端末として開く。** スティックは `pointer: coarse` でしか出ない。
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  page.on('pageerror', (e) => console.log('[stick] pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', 'Yubi');
  await page.fill('#net-class', 'stick');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000, polling: 250 });
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await sleep(1500);

  const box = await page.evaluate(() => {
    const el = document.querySelector('.stick');
    if (!el || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width };
  });
  check('指の端末ではスティックが出ている', !!box, box ? `${Math.round(box.w)}px` : 'not shown');
  if (!box) throw new Error('no stick');

  const pos = () => page.evaluate(() => ({ x: uspeak.player.position.x, z: uspeak.player.position.z }));
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // 倒して2.5秒歩き、どれだけ進んだかを返す。`out` は中心からの距離（px）。
  async function walk(dx, dy, out, ms = 2500) {
    const from = await pos();
    await page.mouse.move(box.cx, box.cy);
    await page.mouse.down();
    await page.mouse.move(box.cx + dx * out, box.cy + dy * out, { steps: 3 });
    await sleep(ms);
    const at = await pos();
    await page.mouse.up();
    await sleep(400);
    return { moved: gap(from, at), at };
  }

  // **どちらへ倒すかは、歩ける向きを実際に探して決める。** この島は木も家もあるので、
  // 決め打ちの一方向だと「壁に向かって全力で歩いた」を「動かない」と読んでしまう。
  let best = { moved: 0, dir: null };
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const r = await walk(dx, dy, box.w * 0.33);
    if (r.moved > best.moved) best = { moved: r.moved, dir: [dx, dy] };
    if (best.moved > 2) break;
  }
  check('いっぱいに倒すと歩く', best.moved > 1.5, `${best.moved.toFixed(2)}m 進んだ`);

  // 倒した量で速さが変わること。遊び（0.14）の少し外まで倒す。
  const gentle = await walk(best.dir[0], best.dir[1], box.w * 0.33 * 0.30);
  check('そっと倒すとゆっくり歩く', gentle.moved > 0 && gentle.moved < best.moved * 0.7,
    `${gentle.moved.toFixed(2)}m（いっぱいは ${best.moved.toFixed(2)}m）`);

  // 離したら止まる。つまみも真ん中へ。
  const after = await pos();
  await sleep(1200);
  const still = await pos();
  check('離すと止まる', gap(after, still) < 0.05, `${gap(after, still).toFixed(3)}m`);
  check('つまみは真ん中に戻る', await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('.stick i')).transform;
    return t === 'none' || /matrix\([^)]*\)/.test(t);
  }) && await page.evaluate(() => !document.querySelector('.stick').classList.contains('on')));

  // 遊びの中。指を置いただけでは歩き出さない。
  const dead = await walk(best.dir[0], best.dir[1], box.w * 0.33 * 0.10, 1800);
  check('真ん中に置いただけでは歩かない', dead.moved < 0.05, `${dead.moved.toFixed(3)}m`);

  // キーボードは今まで通り（パソコンの子の道を塞いでいない）。
  const before = await pos();
  await page.keyboard.down('w');
  await sleep(1800);
  await page.keyboard.up('w');
  const walked = gap(before, await pos());
  check('キーボードも今までどおり歩ける', walked > 0.5, `${walked.toFixed(2)}m`);
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false });
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
