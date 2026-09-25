// 島の看板と、同梱したスイカゲームが ほんとうに英語で出るか。実ブラウザで。
//
// `browser-lang.mjs` が見ているのは **HTML の文字**（CSS が切り替える2行と、辞書を引く
// `t()`）。ここで見るのはその外側の2つ：
//
//   1. **島の看板は canvas に焼いた絵**なので、CSS も辞書も効かない。`{en, ja}` を渡して
//      `onLangChange` で焼き直している。**焼いた文字そのもの**（`island.signs`）を読む。
//   2. **同梱ゲーム（えいご スイカゲーム）は別の書類**。あちらのフォルダは1バイトも
//      触らず、席の側から書き替えている。中の画面が英語になっていて、**遊んでも
//      日本語に戻らない**こと（あちらは画面を作り直す）と、**中の切り替えボタン**で
//      日本語に戻せることを見る。
//
// Run: node test/e2e/browser-signs.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2718;
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

  const tap = () => page.evaluate(() => document.querySelector('#lang-toggle').click());
  const lang = () => page.evaluate(() => document.documentElement.dataset.lang);

  // ---- 1. 島の看板 -------------------------------------------------------------------
  // **相棒をまだ選んでいない子には冒険ノートが開いたままで、`state.busy` が立つ。**
  // そのあいだ `activate()` は何もせず、飛んだつもりで はじまりの島に居続ける
  // （実際にそれで検査が空の看板を読んだ）。先に選ばせてから飛ぶ。
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(600);
  // ことばの学校島。**建つのを待つ**（このコンテナは1秒に数コマしか描かない）。
  await page.evaluate(async () => {
    uspeak.rpg.inside?.leave?.(true);
    uspeak.rpg.fly('school'); uspeak.rpg.finishFlight();
    await uspeak.rpg.school.ready;
  });
  await page.waitForFunction(() => uspeak.rpg.state.current === 'school', null, { timeout: 60000, polling: 300 });
  const signs = () => page.evaluate(() => uspeak.rpg.school.signs.filter(Boolean));
  await page.waitForFunction(() => (uspeak.rpg.school.signs || []).length > 3, null, { timeout: 60000, polling: 300 });

  const en = await signs();
  check('島の看板が英語で焼けている', en.length > 3 && !en.some((s) => JA.test(s)), JSON.stringify(en.slice(0, 4)));
  check('…島の名前もお店の名前も入っている',
    en.some((s) => /WORD SCHOOL/i.test(s)) && en.some((s) => /Word Gym/i.test(s)), JSON.stringify(en.slice(0, 6)));

  await tap();
  await page.waitForFunction(() => document.documentElement.dataset.lang === 'ja', null, { timeout: 30000, polling: 200 });
  const ja = await signs();
  check('「あ」を押すと看板が焼き直される', ja.some((s) => s.includes('ことばの学校島')) && ja.some((s) => s.includes('ことばのジム')),
    JSON.stringify(ja.slice(0, 4)));
  check('…焼き直しても看板の数は変わらない', ja.length === en.length, `${en.length} → ${ja.length}`);
  await tap();
  await page.waitForFunction(() => document.documentElement.dataset.lang === 'en', null, { timeout: 30000, polling: 200 });
  check('英語にもどせる', !(await signs()).some((s) => JA.test(s)));

  // ---- 2. えいご スイカゲーム ----------------------------------------------------------
  await page.evaluate(() => uspeak.net.arcades.suika.open());
  await page.waitForFunction(() => {
    const d = document.querySelector('.arcade-frame')?.contentDocument;
    return d?.readyState === 'complete' && !!d.querySelector('#startBtn');
  }, null, { timeout: 180000, polling: 500 });
  await sleep(1500);

  const inside = () => page.evaluate(() => {
    const d = document.querySelector('.arcade-frame')?.contentDocument;
    return {
      text: (d?.body?.textContent || '').replace(/\s+/g, ' ').trim(),
      lang: d?.querySelector('.arcade-lang')?.textContent || '',
      exits: [...(d?.querySelectorAll('button') || [])].filter((b) => /U-Speak/.test(b.textContent)).length,
      // 帰り道のボタンの class を借りると `arcade-home` まで付いてきて、
      // 「出口はどれか」にこのボタンが先に当たる＝押しても島に戻らない。
      steals: !!d?.querySelector('.arcade-lang')?.classList.contains('arcade-home'),
    };
  });
  const first = await inside();
  check('スイカゲームが英語で出ている', first.text.includes('Start') && !first.text.includes('スタート'), first.text.slice(0, 90));
  check('…中に切り替えボタンがある', first.lang === '日本語', JSON.stringify(first.lang));
  check('…帰り道のボタンも1つだけある', first.exits === 1, String(first.exits));
  check('…切り替えボタンが出口のふりをしていない', first.steals === false);

  // あちらは遊びはじめると画面を作り直す。作り直したところも英語のままか。
  await page.evaluate(() => document.querySelector('.arcade-frame').contentDocument.querySelector('#startBtn').click());
  await sleep(2500);
  const playing = await inside();
  check('あそんでも日本語に戻らない', !/スタート|つくろう|レベル/.test(playing.text), playing.text.slice(0, 90));

  // 中のボタンで日本語に。**島の「あ」ではなく、ゲームの中のボタン**（全画面なので
  // 島のヘッダーは押せない）。
  await page.evaluate(() => document.querySelector('.arcade-frame').contentDocument.querySelector('.arcade-lang').click());
  await sleep(1500);
  const back = await inside();
  check('「日本語」で日本語に戻せる', JA.test(back.text) && back.lang === 'English', back.text.slice(0, 90));

  // 島の「あ」にも ついていく。
  await page.evaluate(() => document.querySelector('.arcade-frame').contentDocument.querySelector('.arcade-lang').click());
  await sleep(1200);
  await tap();                                            // 島を日本語に
  await sleep(1500);
  const followed = await inside();
  check('島の「あ」にも ついていく', followed.lang === 'English' && JA.test(followed.text), JSON.stringify(followed.lang));
  check('…島の言語は日本語になっている', (await lang()) === 'ja');
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
