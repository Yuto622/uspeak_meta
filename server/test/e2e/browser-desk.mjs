// パソコンの画面で、島の道具どうしが かぶっていないか。
//
// **`browser-layout.mjs` はタッチ端末しか見ていない**（34px の押せる大きさ・11px の
// 文字の下限は、あちらの規則だから）。ところがパソコンの窓は横も縦も自由で、
// **右のバーの高さは中身と窓の高さで変わる**。教室から写真で上がった不具合
// （島のキャッチコピーが 📹 ビデオ通話 の上にかぶる）は、1280x800 でオンラインの
// ときだけ出るもので、あちらの5サイズでは一度も出なかった。
//
// ここで測るのはひとつだけ：**重なっている道具は無いか**。
// 親子（ヘッダーの中のコインなど）は数えない。
//
//   node test/e2e/browser-desk.mjs      （npm run test:desk）
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2733;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ノートパソコン・デスクトップ・教室のモニター。**縦が低いものを入れておくこと**：
// かぶるのはいつも下の帯で、それは窓の高さで決まる。
const SIZES = [
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'laptop-tall', width: 1440, height: 900 },
  { name: 'desktop', width: 1600, height: 900 },
  { name: 'big', width: 1920, height: 1080 },
  { name: 'short', width: 1024, height: 768 },
];

// 島に出ている道具。**押せるものと、その上に乗りうる飾りの両方**を並べる。
const PANELS = ['.world-label', '.map-panel', '.scenery-controls', '#flight-button', '.fishing-button',
  '.rpg-buddy-button', '#voice-button', '.hotbar', '.save-status', '.control-hint', '#net-status',
  '#net-chat-button', '#net-teacher-button', '.quest-panel', '.guest-dock', '#near', '.coin-hud',
  '#rpg-region-panel', '#errand-hud'];

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

// 見えている枠を集めて、総当たりで重なりを見る。**親子は数えない**
// （コインのバッジはヘッダーの中にあるので、いつでも「重なって」いる）。
function measure(list) {
  const seen = [];
  for (const s of list) {
    const el = document.querySelector(s);
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    seen.push({ s, el, x: r.x, y: r.y, r: r.right, b: r.bottom });
  }
  const hit = [];
  for (let i = 0; i < seen.length; i += 1) {
    for (let j = i + 1; j < seen.length; j += 1) {
      const a = seen[i]; const b = seen[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) hit.push(`${a.s} x ${b.s} (${Math.round(ox)}x${Math.round(oy)})`);
    }
  }
  return hit;
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

async function open(size) {
  // **タッチ端末にしない**（isMobile / hasTouch を渡さない）。mobile.css が当たると
  // 別のレイアウトを測ることになり、パソコンの重なりは永遠に見つからない。
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  page.on('pageerror', (e) => console.log(`[${size.name}] pageerror`, e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.evaluate(() => document.querySelector('#avatar-confirm').click());
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  // **オンラインで測る。** つながりのドック（人数・💬・👩‍🏫）と 📹 は
  // オンラインのときだけ出るので、オフラインで測ると教室で起きる重なりが出ない。
  await page.evaluate(() => {
    document.querySelector('#net-name').value = 'Yuto';
    document.querySelector('#net-class').value = 'desk';
    document.querySelector('#net-join').click();
  });
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'),
    null, { timeout: 60000, polling: 250 });
  await sleep(2500);
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(1200);
  return page;
}

try {
  for (const size of SIZES) {
    const page = await open(size);
    const hit = await page.evaluate(measure, PANELS);
    check(`${size.name}（${size.width}x${size.height}）— はじまりの島`, hit.length === 0, hit.join(' | '));

    // のりもの島は左下に同梱ゲームのボタンが出る島。**下の帯がいちばん混む**ので、
    // 1サイズだけそこまで歩かせて測る。
    if (size.name === 'laptop') {
      await page.evaluate(async () => {
        uspeak.rpg.fly('ride'); uspeak.rpg.finishFlight();
        await uspeak.rpg.ride.ready;
      });
      await page.waitForFunction(() => uspeak.rpg.state.current === 'ride', null, { timeout: 60000, polling: 300 });
      await sleep(4000);
      const isle = await page.evaluate(measure, PANELS);
      check(`${size.name}（${size.width}x${size.height}）— のりもの島`, isle.length === 0, isle.join(' | '));
    }
    await page.context().close();
  }
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
