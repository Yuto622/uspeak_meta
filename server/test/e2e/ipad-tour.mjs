// iPad 横向き（1180×820・タッチ）で ひととおり 遊び、画面ごとに 写真を 撮る（UI の 見にくい 所を 洗い出す 用）。
// Run: OUT=/tmp/ipad node test/e2e/ipad-tour.mjs [名前の 一部 …]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = process.env.OUT || path.resolve(serverDir, '../docs/ipad');
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ONLY = process.argv.slice(2);
const want = (n) => !ONLY.length || ONLY.some((o) => n.includes(o));

const PORT = 2693;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error', TEACHER_KEY: 'ipad-teacher-1' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
const errors = new Set();
page.on('pageerror', (e) => errors.add(e.message));
const done = [];
const shot = async (name, note) => {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80, timeout: 180000 });
  done.push(name); console.log(`  ${name}  ${note || ''}`);
};
const closeAll = () => page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => console.log('   (step failed)', e.message.split('\n')[0]));

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await sleep(2500); await shot('01-avatar', 'すがたを えらぶ');
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', 'ゆうと'); await page.fill('#net-class', 'ipad');
  await sleep(600); await shot('02-lobby', 'なまえと クラス');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
  await sleep(4000); await shot('03-bonus', 'ログインボーナス');
  await closeAll();
  await ev(() => uspeak.net.main.open());
  await sleep(2500); await shot('03-home', 'ホーム（メインの島の 地図）');
  // 地図の 中の お店を 1 つ 押した ところ
  await ev(() => document.querySelector('.mi-poi, [data-poi]')?.click());
  await sleep(1200); await shot('04-home-sheet', '地図の お店を 押した ところ');
  await ev(() => { uspeak.net.main.close?.(); });
  await closeAll();
  await ev(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
  });
  await closeAll();
  await sleep(3000); await shot('05-main-3d', 'メインの島（3D）の 画面と ボタン');

  // 上の バーの ボタン
  await ev(() => uspeak.net.food.openShop('fruit'));
  await sleep(1500); await shot('06-food-shop', 'たべものの 屋台');
  await closeAll();
  await ev(() => uspeak.net.bag.open());
  await sleep(2500); await shot('07-bag', '持ち物');
  await ev(() => uspeak.net.bag.open('wear'));
  await sleep(2500); await shot('08-bag-wear', '持ち物（ふく）');
  await closeAll();
  await ev(() => document.querySelector('#journal')?.click());
  await sleep(1500); await shot('09-wordbook', 'たんごちょう');
  await closeAll();
  await ev(() => uspeak.net.wordhouse.open('wh_easy'));
  await sleep(2000); await shot('10-wordhouse', '英単語ハウス');
  await closeAll();
  await ev(() => document.querySelector('#flight-button')?.click());
  await page.waitForSelector('#rpg-dialog[open]', { timeout: 30000 }).catch(() => {});
  await sleep(2000); await shot('11-worldmap', 'ワールドマップ');
  await ev(() => document.querySelector('#rpg-close')?.click());

  const at = async (isle, spotWant) => page.evaluate(async ({ isle, spotWant }) => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.inside?.leave?.(true);
    uspeak.rpg.fly(isle); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 1200));
    const data = await (uspeak.rpg[isle]?.ready || Promise.resolve(null));
    const island = data?.island || data;
    const place = (island?.spots || []).find((s) => s.id === spotWant || s.kind === spotWant) || (island?.spots || [])[0];
    if (island && place) uspeak.player.position.set(island.x + place.x, 0, island.z + place.z + 1.6);
    await new Promise((r) => setTimeout(r, 900));
  }, { isle, spotWant }).catch((e) => console.log('   (fly failed)', e.message.split('\n')[0]));
  const openAt = async (name, note, isle, spotWant, act, sel, wait = 1200) => {
    if (!want(name)) return;
    await at(isle, spotWant);
    await ev(act);
    if (sel) await page.waitForSelector(sel, { timeout: 40000 }).catch(() => console.log(`   (${sel} did not open)`));
    await sleep(wait); await shot(name, note);
    await closeAll();
  };

  await at('willow', 'x'); await sleep(2500); await shot('12-island-willow', 'はじまりの島（HUD・スティック）');
  await openAt('13-quiz', 'ことばの学校・クイズ', 'school', 'easy', () => uspeak.net.schoolInteract(), '#quiz-dialog[open]');
  await openAt('14-gym', 'ことばのジム', 'school', 'gym', () => uspeak.net.schoolInteract(), '#gym-dialog[open]');
  await openAt('15-battle', 'アリーナ・バトル', 'arena', 'easy', () => uspeak.net.arenaInteract(), '#battle-dialog[open]');
  await openAt('16-pet', 'ペット島', 'pet', 'nest', () => uspeak.net.petInteract(), '#pet-dialog[open]');
  await openAt('17-errand', 'おつかい島', 'errand', 'plaza', () => uspeak.net.errandInteract(), '#mission-dialog[open]');
  await openAt('18-eiken', '英検・よむ', 'eiken5', 'reading', () => uspeak.net.eikenInteract(), '#eiken-dialog[open]');
  await openAt('19-interview', '英検の 面接', 'eiken5', 'interview', () => uspeak.net.eikenInteract(), '#iv-dialog[open]');
  await openAt('20-conv', 'AI英会話', 'conv', 'cafe', () => uspeak.net.convInteract(), '#conv-dialog[open]');
  await openAt('21-blockshop', 'ブロック屋', 'town', 'shop', () => uspeak.net.townInteract(), '#town-dialog[open]');
  await openAt('22-garage', 'のりもの ガレージ', 'ride', 'kick', () => uspeak.net.rideInteract(), '#ride-dialog[open]');
  await openAt('23-farm', 'ぼくじょう', 'farm', 'seeds', () => uspeak.net.farmInteract(), 'dialog[open]');
  if (want('24-fishing')) {
    await at('willow', 'x');
    await ev(() => uspeak.fishing.open('spots'));
    await page.waitForSelector('#fishing-dialog[open]', { timeout: 40000 }).catch(() => {});
    await sleep(2000); await shot('24-fishing', 'さかなつり メニュー');
    await ev(() => document.querySelector('#fishing-close')?.click());
  }
  if (want('25-fishworld')) {
    await at('fishworld', 'pond'); await sleep(2500); await shot('25-fishworld', 'つり島');
  }
  await closeAll();
  await ev(() => uspeak.net.wardrobe.open());
  await sleep(3000); await shot('26-wardrobe', 'きせかえ');
  await ev(() => uspeak.net.wardrobe.dialog.close());
  await ev(() => uspeak.net.dash.open());
  await sleep(1500); await shot('27-dashboard', 'マイページ');
  await closeAll();
  await ev(() => document.querySelector('#help')?.click());
  await sleep(1500); await shot('28-guide', 'あそびかた');
  await closeAll();
  // クイズを 1 問 答えて、正解・不正解の 画面
  if (want('29-quiz-answer')) {
    await at('school', 'easy');
    await ev(() => uspeak.net.schoolInteract());
    await page.waitForSelector('#quiz-dialog[open]', { timeout: 40000 }).catch(() => {});
    await sleep(800);
    await ev(() => document.querySelector('#quiz-dialog [data-choice], #quiz-dialog .choice, #quiz-dialog button.q-choice')?.click());
    await sleep(1500); await shot('29-quiz-answer', 'クイズに 答えた あと');
    await closeAll();
  }
  console.log(`\n${done.length} shots → ${OUT}`);
  if (errors.size) console.log('page errors:', [...errors].slice(0, 8));
} catch (err) {
  console.log('TOUR ERROR', err);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
