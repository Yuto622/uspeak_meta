// このゲームは何MBか、実際に遊んで測る。
//
// **「ファイルを全部足すと何MB」では答えにならない。** 同梱ゲームは開くまで1バイトも
// 落ちてこないし、BGM は最初のタッチのあと、キャラクターの動画は家に入って初めて、
// ガイドの写真は開いているページの分だけ落ちる。教室で知りたいのは
// **「授業で1人あたり何MB流れるか」**なので、順番にさわって、そのつど測る。
//
// Run: node test/e2e/measure-weight.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers, waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2713;
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

// 何を数えるか：**本当にネットワークを流れたバイト**。キャッシュから出たものは0。
let bytes = 0;
const seen = [];          // { url, size } — 何が重いかを最後に出すため
const mark = () => bytes;
const since = (from) => (bytes - from) / 1e6;

const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await ctx.newPage();
page.on('response', async (res) => {
  const url = res.url();
  if (!url.includes(`:${PORT}`)) return;
  try {
    const len = Number((await res.allHeaders())['content-length'] || 0)
      || (res.request().resourceType() === 'websocket' ? 0 : (await res.body().catch(() => Buffer.alloc(0))).length);
    bytes += len;
    if (len > 0) seen.push({ url: url.split(`:${PORT}`)[1], size: len });
  } catch { /* リダイレクトや中断は数えない */ }
});

const steps = [];
const step = async (name, fn) => { const from = mark(); await fn(); steps.push([name, since(from)]); console.log(`  ${name.padEnd(34)} ${since(from).toFixed(2)} MB  (合計 ${(bytes / 1e6).toFixed(2)} MB)`); };

try {
  await step('1. ページを開く（絵をえらぶまで）', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await sleep(3000);
  });
  await step('2. クラスに入る（島が建つ）', async () => {
    await page.click('#avatar-confirm');
    await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await page.fill('#net-name', 'はかる'); await page.fill('#net-class', 'weigh');
    await page.click('#net-join');
    await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000, polling: 250 });
    await page.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
    });
    await sleep(4000);
  });
  await step('3. さいしょのタッチ（BGMが鳴りだす）', async () => {
    await page.mouse.click(590, 410);
    await page.waitForFunction(() => uspeak.ambience?.state.started, null, { timeout: 30000, polling: 200 }).catch(() => {});
    await sleep(9000);   // 2曲 約2.8MB ずつ。落ち切るのを待つ
  });
  await step('4. 「?」のガイドを 5ページ めくる', async () => {
    await page.click('#help');
    await page.waitForSelector('#guide-dialog[open]', { timeout: 30000 });
    for (let i = 0; i < 5; i += 1) { await page.click('#guide-next'); await sleep(900); }
    await page.evaluate(() => document.querySelector('#guide-close').click());
    await sleep(600);
  });
  await step('5. さかなつり・ワールドマップ・マイページ', async () => {
    await page.evaluate(() => document.querySelector('#fishing-button').click());
    await sleep(2500);
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(() => uspeak.rpg.openMap()); await sleep(2000);
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(() => document.querySelector('.coin-hud')?.click()); await sleep(2000);
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  });
  await step('6. 島を4つ まわる', async () => {
    for (const hub of ['errand', 'school', 'ride', 'town']) {
      await page.evaluate(async (h) => { uspeak.rpg.fly(h); uspeak.rpg.finishFlight(); }, hub);
      await sleep(4000);
    }
  });
  await step('7. 英会話島でウーピーと話す（動画2本）', async () => {
    await page.evaluate(async () => { uspeak.rpg.fly('conv'); uspeak.rpg.finishFlight(); });
    await sleep(3500);
    await page.evaluate(async () => {
      const data = await uspeak.rpg.conv.ready;
      const isle = data.island || data;
      const spot = isle.spots.find((s) => s.id === 'cafe') || isle.spots[0];
      uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.6);
    });
    await page.waitForFunction(() => !!uspeak.rpg.convNearby(), null, { timeout: 60000, polling: 400 }).catch(() => {});
    await page.evaluate(() => uspeak.net.convInteract());
    await page.waitForSelector('#conv-dialog[open]', { timeout: 40000 }).catch(() => {});
    await sleep(9000);
    await page.evaluate(() => document.querySelector('#conv-close')?.click());
    await sleep(800);
  });
  await step('8. AURORA KART をひらく（別ゲーム）', async () => {
    await page.evaluate(() => uspeak.net.racers.open());
    await page.waitForFunction(() => document.querySelector('.arcade-frame')?.contentDocument?.readyState === 'complete',
      null, { timeout: 180000, polling: 600 }).catch(() => {});
    await sleep(6000);
    await page.evaluate(() => uspeak.net.racers.close());
  });
  await step('9. BLOCKWILD をひらく（別ゲーム）', async () => {
    await page.evaluate(() => uspeak.net.blockwild.open());
    await page.waitForFunction(() => document.querySelector('.arcade-frame')?.contentDocument?.readyState === 'complete',
      null, { timeout: 180000, polling: 600 }).catch(() => {});
    await sleep(6000);
    await page.evaluate(() => uspeak.net.blockwild.close());
  });
} catch (err) {
  console.log('MEASURE ERROR', err);
  process.exitCode = 1;
} finally {
  console.log('\n===== まとめ =====');
  for (const [name, mb] of steps) console.log(`${name.padEnd(36)} ${mb.toFixed(2)} MB`);
  console.log(`${'ぜんぶ'.padEnd(36)} ${(bytes / 1e6).toFixed(2)} MB`);
  // 何が重かったか（上位15件）。ここを見れば、次に削るものが分かる。
  const byFile = new Map();
  for (const s of seen) byFile.set(s.url, (byFile.get(s.url) || 0) + s.size);
  console.log('\n----- 重いファイル 上位15 -----');
  for (const [url, size] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`${(size / 1e6).toFixed(2)} MB  ${url}`);
  }
  await browser.close();
  server.kill('SIGTERM');
}
