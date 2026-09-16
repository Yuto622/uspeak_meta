// 画面の言語が ほんとうに 切り替わるか。実ブラウザで。
//
// **ふだんは英語。** レッスンは外国人の先生が進めるので、画面が英語のほうが先生は
// そのまま読める。ヘッダーの「あ」を押すと、日本語（小学1年生が読めるひらがな）になる。
//
// ここで見ているのは4つ：
//   1. 最初に開いた画面が **英語**になっているか（辞書が引けているか）。
//   2. 「あ」を押すと **日本語**になるか。
//   3. **もう一度開いても日本語のまま**か（localStorage に残るか）。
//   4. 切り替えたときに **文字が消えないか**。ボタンの中身が空になるのが
//      いちばん怖い壊れかたで（label() を textContent で上書きした時に実際に起きた）、
//      「英語でも日本語でもない」は 画面を見ないと気づけない。
//
// Run: node test/e2e/browser-lang.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2716;
const JA = /[぀-ゟ゠-ヿ㐀-鿿]/;
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

// 見るところ。**入口の画面に出ていて、英語と日本語で ちゃんと違う**ものだけを選ぶ。
const SPOTS = [
  ['#fishing-button', 'Fishing', 'さかなつり'],
  ['#mapbtn', 'Map', 'しまの ちず'],
  ['#journal', 'Words', 'たんごちょう'],
  // **ヘッダーの島の名前は rpg.js が毎回書きなおす。** 静的な HTML のほうだけ直しても
  // 島に降りた瞬間に上書きされるので、ここは「書きなおしたあと」を見ている。
  ['.location', 'U-Speak Island', 'U-Speak島'],
];

try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.click('#net-offline');
  await sleep(1500);
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  // 見えている文字だけを読む。`.en` と `.ja` は両方 DOM にいるので、
  // `textContent` で読むと どちらの言語でも同じ文字列が返ってしまう。
  const seen = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const vis = (n) => getComputedStyle(n).display !== 'none';
    const parts = [...el.querySelectorAll('.en, .ja')].filter(vis).map((n) => n.textContent.trim());
    return (parts.length ? parts.join(' ') : el.textContent).trim();
  }, sel);

  check('はじめは英語', await page.evaluate(() => document.documentElement.dataset.lang) === 'en');
  for (const [sel, en] of SPOTS) {
    const text = await seen(sel);
    check(`英語で出ている — ${sel}`, !!text && text.includes(en) && !JA.test(text), JSON.stringify(text));
  }

  // 「あ」を押す。**`page.click` は使わない**：相棒をまだ選んでいない子には冒険ノートが
  // 開いていて、当たり判定をそこが吸う（browser-speech.mjs の ♫ と同じ手当て）。
  const tap = () => page.evaluate(() => document.querySelector('#lang-toggle').click());
  await tap();
  await sleep(400);
  check('「あ」を押すと日本語', await page.evaluate(() => document.documentElement.dataset.lang) === 'ja');
  for (const [sel, , ja] of SPOTS) {
    const text = await seen(sel);
    check(`日本語で出ている — ${sel}`, !!text && text.includes(ja), JSON.stringify(text));
  }

  // **どこも空にならないこと。** 押したあとに文字の消えたボタンが1つでもあれば落とす。
  const blank = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.right-rail button, .hotbar button, header button')) {
      if (el.offsetParent === null) continue;               // 隠れているものは数えない
      if (!el.innerText.trim()) out.push(el.id || el.className);
    }
    return out;
  });
  check('切り替えても 空のボタンが出ない', blank.length === 0, JSON.stringify(blank));

  // ボタン自身も入れ替わる（英語の画面では「あ」、日本語の画面では「A」）。
  check('ボタンの字が「A」に変わる', (await seen('#lang-toggle')) === 'A', JSON.stringify(await seen('#lang-toggle')));

  // 開き直しても日本語のまま。**島を建て直すのは待たない**（このコンテナでは数分かかる）。
  // 見たいのは `i18n.js` が読み込まれた時点の言語なので、「あ」ボタンが出れば足りる。
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#lang-toggle', { timeout: 240000 });
  await sleep(1200);
  check('開き直しても日本語のまま', await page.evaluate(() => document.documentElement.dataset.lang) === 'ja');

  // もどす。
  await tap();
  await sleep(400);
  check('もう一度押すと英語にもどる', await page.evaluate(() => document.documentElement.dataset.lang) === 'en');
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
