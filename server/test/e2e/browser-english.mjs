// 英語モードで、画面に日本語が残っていないかを数える。
//
// 教室から「英語に切り替えても、冒険ノート・クエスト・リーグ・地図が日本語のまま」と
// 写真で指摘された。1つずつ直すと、次の画面でまた見つかる。そこで**全部の画面を開いて、
// 見えている日本語を全部数える**。0になるまで直し、0のままであることをこの検査が守る。
//
// 数えないもの：学習の中身（`dist/i18n-dom.js` の LEARNING。英検の日本語文・意味の
// 選択肢・訳など。日本語であることが問題そのもの）、子どもの名前とチャット、
// 見えていない要素（閉じたダイアログ・hidden・幅0）。
//
//   node test/e2e/browser-english.mjs          （確かめる。残っていれば 1 で終わる）
//   REPORT=out.json node test/e2e/browser-english.mjs   （残った文字を JSON で書き出す）
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';
import { SCREENS, LAYOUT_HELPERS } from './lib/screens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.EN_PORT || 2677);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', TEACHER_KEY: 'testkey12345', REPORT_SECRET: 'english-audit-secret', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await waitForServer(PORT);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const found = {};       // 画面 → [日本語]
let total = 0;
const record = (where, list) => {
  const uniq = [...new Set(list)];
  if (!uniq.length) { console.log(`PASS ${where}`); return; }
  found[where] = uniq; total += uniq.length;
  console.log(`FAIL ${where} — ${uniq.length}: ${uniq.slice(0, 12).join(' | ')}${uniq.length > 12 ? ' …' : ''}`);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('uspeak-lang-v1', 'en'); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const press = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
  const scan = () => page.evaluate(async () => (await import('./i18n-dom.js')).untranslated());

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.waitForFunction(() => document.documentElement.dataset.lang === 'en');
  await sleep(1500);
  record('キャラえらび', await scan());
  await press('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.evaluate(() => { document.querySelector('#net-teacher-details').open = true; });
  record('ロビー', await scan());
  await page.evaluate(() => {
    document.querySelector('#net-name').value = 'Yuto';
    document.querySelector('#net-class').value = 'en-audit';
    document.querySelector('#net-key').value = 'testkey12345';
    document.querySelector('#net-join').click();
  });
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
  // 最初のパートナーえらび（RPG の入口）も1枚の画面として数える。
  await sleep(1200);
  record('最初のパートナー', await scan());
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(1200);
  record('はじまりの島（クエスト・右のバー・下のバー）', await scan());

  // RPG メニューの全部のタブ（教室の写真の2枚目と3枚目）。
  await page.evaluate(() => uspeak.rpg.openMap());
  await page.waitForSelector('#rpg-dialog[open]', { timeout: 30000 });
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#rpg-dialog nav button, #rpg-dialog [data-rpg-tab]')].map((b, i) => i));
  for (const i of tabs) {
    await page.evaluate((n) => [...document.querySelectorAll('#rpg-dialog nav button, #rpg-dialog [data-rpg-tab]')][n]?.click(), i);
    await sleep(700);
    const name = await page.evaluate((n) => [...document.querySelectorAll('#rpg-dialog nav button, #rpg-dialog [data-rpg-tab]')][n]?.textContent.trim(), i);
    record(`RPG：${name}`, await scan());
  }
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  // つりのタブ。
  await press('#fishing-button');
  await page.waitForSelector('#fishing-dialog[open]', { timeout: 30000 });
  for (const tab of await page.evaluate(() => [...document.querySelectorAll('[data-fish-tab]')].map((b) => b.dataset.fishTab))) {
    await page.evaluate((t) => document.querySelector(`[data-fish-tab="${t}"]`)?.click(), tab);
    await sleep(600);
    record(`つり：${tab}`, await scan());
  }
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  // 「?」のガイドは全部のページを めくる。
  await press('#help');
  await page.waitForSelector('#guide-dialog[open]', { timeout: 30000 });
  const chapters = await page.evaluate(() => document.querySelectorAll('#guide-tabs button').length);
  const guide = [];
  for (let c = 0; c < chapters; c += 1) {
    await page.evaluate((n) => document.querySelectorAll('#guide-tabs button')[n]?.click(), c);
    for (let step = 0; step < 12; step += 1) {
      await sleep(250);
      guide.push(...await scan());
      const next = await page.evaluate(() => { const b = [...document.querySelectorAll('#guide-foot button')].find((x) => /→|Next|つぎ/.test(x.textContent) && !x.disabled); if (b) { b.click(); return true; } return false; });
      if (!next) break;
    }
  }
  record('あそびかたガイド（全ページ）', guide);
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  // ゲームの中の画面ぜんぶ（レイアウトの検査と同じ22枚）。
  await page.evaluate(LAYOUT_HELPERS);
  for (const screen of SCREENS) {
    let opened = false;
    for (let attempt = 0; attempt < 2 && !opened; attempt += 1) {
      await page.evaluate(() => uspeak.__layout.close());
      await sleep(300);
      await page.evaluate(`(async () => { ${screen.go} })()`).catch(() => {});
      opened = await page.waitForFunction((sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && el.getClientRects().length > 0; },
        screen.sel, { timeout: 20000, polling: 200 }).then(() => true).catch(() => false);
    }
    if (!opened) { console.log(`SKIP ${screen.id}: did not open`); continue; }
    await sleep(900);
    record(screen.id, await scan());
  }
  await page.evaluate(() => uspeak.__layout.close());

  // **日本語に戻すと、元の日本語に戻る**（英語にしたまま戻らない、を防ぐ）。
  await page.evaluate(() => uspeak.rpg.openMap());
  await page.waitForSelector('#rpg-dialog[open]');
  await sleep(500);
  const enTab = await page.evaluate(() => document.querySelector('#rpg-dialog nav')?.textContent || '');
  await press('#lang-toggle');
  await sleep(800);
  const jaTab = await page.evaluate(() => document.querySelector('#rpg-dialog nav')?.textContent || '');
  const back = /Adventure Notes/.test(enTab) && /冒険ノート/.test(jaTab);
  console.log(`${back ? 'PASS' : 'FAIL'} 日本語に戻すと元の日本語に戻る（${enTab.slice(0, 40)} → ${jaTab.slice(0, 40)}）`);
  if (!back) total += 1;
  await press('#lang-toggle');
  await sleep(800);
  const again = await page.evaluate(() => document.querySelector('#rpg-dialog nav')?.textContent || '');
  const forth = /Adventure Notes/.test(again);
  console.log(`${forth ? 'PASS' : 'FAIL'} もう一度押すと英語にもどる`);
  if (!forth) total += 1;
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify(found, null, 1));
console.log(`\n${total} untranslated string(s) on screen in English mode`);
process.exit(total ? 1 : 0);
