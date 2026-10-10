// 「?」のガイドの 新しい ページ用の 写真（メインの島・おなか・一人称・ワープ・授業モード・復習）。
//
// capture-figures.mjs は 島ごとの 写真を 撮る。こちらは **はじめの 流れ**（すがた → ロビー → メインの島）と、
// あとから 入った 画面だけ。形式は capture-figures と 同じ（1280x800・JPEG 画質92・日本語の 画面）。
// 撮ったら `python3 docs/make-guide-images.py` で client/dist/assets/guide に 落とす。
//
// Run: node test/e2e/capture-guide.mjs            （ぜんぶ）
//      node test/e2e/capture-guide.mjs main-stall （名前を 含む 写真だけ。ほかの 手順は 写さずに 通る）
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';
import { phaseAt, PHASES } from '../../../client/dist/world-clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = path.resolve(serverDir, '../docs/figures');
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2693;
const TEACHER_KEY = 'guide-teacher-key-0123';
const ROBLOX_KEY = 'guide-roblox-key-0123456789abcdef-XYZ';
const KLASS = 'つばめ2くみ';
const NAME = 'ゆうと';
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error',
    TEACHER_KEY, USPEAK_ROBLOX_KEY: ROBLOX_KEY, ANSWER_MIN_INTERVAL_MS: '0',
    // 1 日 1 回の 復習カードは 写真の じゃまなので 出さない（復習は 先生の ボタンから 出す）。
    REVIEW_OFFER_DELAY_MS: '3600000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => server.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await waitForServer(PORT);

// 復習に 出す 苦手：Roblox で 2 日前に まちがえた 4 つ（Web と 同じ 箱に 入る）。
{
  const ts = Date.now() - 2 * 86400 * 1000;
  const events = ['river', 'kitchen', 'library', 'window'].map((w, i) => ({ id: `guide-${w}`, ts: ts + i, type: 'quiz', username: NAME, classCode: KLASS, data: { word: w, correct: false, level: 'Easy' } }));
  const res = await fetch(`http://127.0.0.1:${PORT}/api/roblox/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-uspeak-key': ROBLOX_KEY }, body: JSON.stringify({ events }) });
  if (!res.ok) throw new Error(`roblox events ${res.status}`);
}

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ONLY = process.argv.slice(2);
const want = (name) => !ONLY.length || ONLY.some((o) => name.includes(o));
const done = [];

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // ガイドの 文は 日本語なので、写真も 日本語の 画面で 撮る（既定は 英語）。
  await ctx.addInitScript(() => { try { localStorage.setItem('uspeak-lang-v1', 'ja'); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const seen = new Set();
  page.on('pageerror', (e) => { if (!seen.has(e.message)) { seen.add(e.message); console.log(`[${label}] pageerror`, e.message); } });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  return page;
}
const shoot = async (page, name, note) => {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 });
  done.push(name);
  console.log(`  ${name}.jpg  ${note}`);
};
const closeAll = (page) => page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
async function join(page, name, { teacher = false } = {}) {
  // 2 つめの ブラウザは とても おそい（1 秒に 1 こま ほど）。クリックも ゆっくり まつ。
  page.setDefaultTimeout(180000);
  await sleep(2000);
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', name);
  await page.fill('#net-class', KLASS);
  if (teacher) {
    await page.evaluate(() => { document.querySelector('#net-teacher-details').open = true; });
    await page.fill('#net-key', TEACHER_KEY);
  }
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
  await page.waitForFunction(() => globalThis.uspeak?.net?.main?.homed, null, { timeout: 30000, polling: 250 }).catch(() => {});
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
  });
  await sleep(1500);
  await closeAll(page);
}
// 昼に 撮る（capture-figures と 同じ：時計で 昼まで 寝て、空が 明るく なるのを 待つ）。
async function daylight(page, need = 25) {
  const skew = await page.evaluate(() => uspeak.net.serverNow() - Date.now()).catch(() => 0);
  const now = phaseAt(Date.now() + skew);
  if (now.id !== 'day' || now.endsIn < need) {
    let wait = now.endsIn;
    for (let i = (now.index + 1) % PHASES.length; PHASES[i].id !== 'day'; i = (i + 1) % PHASES.length) wait += PHASES[i].seconds;
    console.log(`  …${now.ja}。あと ${Math.ceil(wait)} 秒で ひるま`);
    await sleep(Math.ceil(wait * 1000) + 500);
  }
  await page.waitForFunction(() => uspeak.atmosphere.state.night < 0.06, null, { timeout: 240000, polling: 1000 }).catch(() => {});
}
// メインの島の 場所の 前に 立つ（建物は 北に 建つので 南がわ、屋台は 南に 建つので 北がわ）。
const standAt = (page, id) => page.evaluate((id) => {
  const isl = uspeak.rpg.main.data;
  const sp = isl.spots.find((q) => q.id === id);
  uspeak.player.position.set(isl.x + sp.x, 0, isl.z + sp.z + (sp.kind === 'food_shop' ? -2.5 : 2.5));
  uspeak.player.rotation.y = sp.kind === 'food_shop' ? 0 : Math.PI;
  return sp;
}, id);
const nearShown = (page) => page.waitForFunction(() => { const n = document.querySelector('#near'); return n && n.style.display !== 'none'; }, null, { timeout: 60000, polling: 300 }).catch(() => console.log('  (no prompt showed)'));

try {
  // ---- 1. すがた・ロビー（まだ 島に 入っていない 画面） ----
  const kid = await newPage(NAME);
  await sleep(2500);
  await shoot(kid, 'guide-avatar', 'すがたを えらぶ');
  await kid.click('#avatar-confirm');
  await kid.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await kid.fill('#net-name', NAME);
  await kid.fill('#net-class', KLASS);
  await sleep(800);
  await shoot(kid, 'guide-lobby', 'なまえと クラス');
  await kid.click('#net-join');
  await kid.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
  await kid.waitForFunction(() => globalThis.uspeak?.net?.main?.homed, null, { timeout: 30000, polling: 250 }).catch(() => {});
  await kid.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
  });
  await sleep(2000);
  await closeAll(kid);

  // ---- 2. メインの島（はじめに 立つ ところ。光の柱が 英単語ハウスを さす。右上は 島の 地図） ----
  await daylight(kid, 60);
  await sleep(2500);
  await shoot(kid, 'main-3d', 'メインの島（3D）・ミニマップ・光の柱');

  // 英単語ハウスの 戸口：「📖 はいる」の ボタン。
  await standAt(kid, 'hut_easy');
  await nearShown(kid);
  await sleep(1500);
  await shoot(kid, 'main-near', '英単語ハウスの まえ（はいる ボタン）');

  // 英単語ハウス（10 もん）。
  if (want('main-wordhouse')) {
    await kid.evaluate(() => uspeak.net.wordhouse.open('hut_easy'));
    await kid.waitForSelector('#wh-dialog[open]', { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    await shoot(kid, 'main-wordhouse', '英単語ハウスの はじめ');
    await closeAll(kid);
  }

  // 2D の 地図（🏠 を おすと 出る）。
  if (want('main-map')) {
    await kid.evaluate(() => uspeak.net.main.open());
    await kid.waitForFunction(() => !document.querySelector('#main-island')?.hidden, null, { timeout: 30000 }).catch(() => {});
    await sleep(1800);
    await shoot(kid, 'main-map', 'メインの島の 2D の 地図');
    await kid.evaluate(() => uspeak.net.main.close());
    await sleep(500);
  }

  // 屋台（たべものを かう）。部屋が 屋台の 前か 確かめるので、ほんとうに 前に 立つ。
  if (want('main-stall')) {
    const sp = await standAt(kid, 'shop_food2');
    await sleep(1500);
    await kid.evaluate(async (id) => {
      const s = uspeak.rpg.main.data.spots.find((q) => q.id === id);
      uspeak.net.food.openShop(s.shop);
    }, sp.id);
    await kid.waitForSelector('#food-dialog[open] .fd-item', { timeout: 30000 }).catch(() => console.log('  (stall did not open)'));
    await sleep(1200);
    await shoot(kid, 'main-stall', '屋台の メニュー');
    await closeAll(kid);
  }

  // おなかが 0：上に 帯が 出て、あるくのが おそく なる。
  if (want('main-hunger')) {
    await standAt(kid, 'shop_food2');
    await kid.evaluate(() => uspeak.net.food.apply({ hunger: 0, rateMs: 3600000, bag: [] }));
    await kid.waitForFunction(() => !document.querySelector('#hunger-notice')?.hidden, null, { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    await shoot(kid, 'main-hunger', 'おなかが すいた ときの 帯');
  }

  // かばん（🎒）：たべもの・ふく・いえ・ブロック。
  if (want('main-bag')) {
    // ほんとうに 屋台で 2 つ かってから（中身は 部屋が もっている）。
    await standAt(kid, 'shop_food2');
    await sleep(800);
    await kid.evaluate(() => uspeak.net.food.openShop(uspeak.rpg.main.data.spots.find((q) => q.id === 'shop_food2').shop));
    await kid.waitForSelector('#food-dialog[open] .fd-buy', { timeout: 30000 }).catch(() => {});
    for (const n of [0, 1]) {
      await kid.evaluate((n) => document.querySelectorAll('#food-dialog .fd-buy')[n]?.click(), n);
      await sleep(1500);
    }
    await closeAll(kid);
    await kid.evaluate(() => uspeak.net.bag.open('food'));
    await sleep(2500);
    await shoot(kid, 'main-bag', 'かばん（たべもの）');
    await closeAll(kid);
  }
  // おなかを もとに もどす（部屋の 数を もらいなおす）。
  await kid.evaluate(() => uspeak.net.food.apply({ hunger: 20, rateMs: 0, bag: [] }));
  await kid.evaluate(() => document.querySelector('#hunger-notice') && (document.querySelector('#hunger-notice').hidden = true));

  // ゲートの まえ（ほかの 世界へ）。
  if (want('main-gate')) {
    await standAt(kid, 'gate_rpg');
    await nearShown(kid);
    await sleep(1500);
    await shoot(kid, 'main-gate', 'ゲートの まえ');
  }

  // 一人称（4 キー / 👁）。BLOCKWILD と 同じ 見え方。
  if (want('screen-fp')) {
    // スタートの ひろばから 島の なかを 見る（たてものの 前だと かんばんや 木で いっぱい）。
    await kid.evaluate(() => {
      const isl = uspeak.rpg.main.data;
      const sp = isl.spots.find((q) => q.id === 'spawn') || isl.spots[0];
      uspeak.player.position.set(isl.x + sp.x, 0, isl.z + sp.z - 3);
      uspeak.view.look(0.55, 0.05);
    });
    await sleep(800);
    await kid.evaluate(() => document.querySelector('#fp-button')?.click());
    await kid.waitForFunction(() => uspeak.atmosphere.state.firstPerson, null, { timeout: 20000 }).catch(() => {});
    await sleep(3000);
    await shoot(kid, 'screen-fp', '一人称の 画面');
    await kid.evaluate(() => document.querySelector('#fp-button')?.click());
    await sleep(1500);
  }

  // ひこうきの ワープ（島へ とぶ とき）。
  if (want('screen-warp')) {
    await kid.evaluate(() => uspeak.rpg.fly('willow'));
    await kid.waitForFunction(() => document.body.dataset.warp !== undefined, null, { timeout: 30000 }).catch(() => {});
    // とびたった すぐは ひこうきが 目の前で 大きすぎる。とちゅう（3〜6 わり）まで まつ。
    await kid.waitForFunction(() => parseFloat(document.querySelector('#rpg-flight-progress')?.style.width || '0') > 30, null, { timeout: 90000, polling: 250 }).catch(() => {});
    await shoot(kid, 'screen-warp', 'とんでいる ところ（ワープ）');
    await kid.evaluate(() => { uspeak.rpg.finishFlight(); });
    await sleep(1500);
    await kid.evaluate(() => uspeak.rpg.activate('main', true, true));
    await sleep(1500);
  }

  // ---- 3. 先生（授業モード）と、生徒の ストップ・復習 ----
  if (['screen-teacher', 'screen-classmode', 'screen-classfreeze', 'screen-review'].some(want)) {
    const teacher = await newPage('せんせい');
    await join(teacher, 'さなだ先生', { teacher: true });
    await sleep(2500);
    await teacher.evaluate(() => document.querySelector('#net-teacher-button')?.click());
    await sleep(1500);
    await shoot(teacher, 'screen-teacher', '先生コンソール');
    await closeAll(teacher);
    await teacher.click('#class-mode-button');
    await teacher.waitForFunction(() => document.querySelectorAll('#cm-students li:not(.cm-empty)').length > 0, null, { timeout: 30000, polling: 500 }).catch(() => {});
    await sleep(1500);
    await shoot(teacher, 'screen-classmode', '授業モードの パネル');

    // ストップ：生徒の 画面が とまる。
    await teacher.click('#class-mode-panel [data-act="freeze"]').catch(() => teacher.evaluate(() => [...document.querySelectorAll('#class-mode-panel .cm-act')].find((b) => /Freeze|Resume/.test(b.textContent))?.click()));
    await sleep(800);
    await teacher.click('#cm-confirm .cm-yes').catch(() => {});
    await kid.waitForFunction(() => !document.querySelector('#class-mode-cover')?.hidden, null, { timeout: 30000, polling: 300 }).catch(() => console.log('  (no freeze cover)'));
    await sleep(1500);
    await shoot(kid, 'screen-classfreeze', '生徒の 画面（ストップ）');
    await teacher.click('#class-mode-panel [data-act="freeze"]').catch(() => teacher.evaluate(() => [...document.querySelectorAll('#class-mode-panel .cm-act')].find((b) => /Freeze|Resume/.test(b.textContent))?.click()));
    await sleep(800);
    await teacher.click('#cm-confirm .cm-yes').catch(() => {});
    await kid.waitForFunction(() => document.querySelector('#class-mode-cover')?.hidden, null, { timeout: 30000, polling: 300 }).catch(() => {});

    // 苦手の 復習：先生の ボタンで 全員に。
    await sleep(1200);
    await teacher.click('#class-mode-panel [data-act="review"]').catch(() => teacher.evaluate(() => document.querySelector('#class-mode-panel .cm-act.review')?.click()));
    await sleep(800);
    await teacher.click('#cm-confirm .cm-yes').catch(() => {});
    await kid.waitForSelector('#review-dialog[open] .rv-opts button', { timeout: 30000 }).catch(() => console.log('  (no review)'));
    await sleep(1500);
    await shoot(kid, 'screen-review', '苦手の 復習');
    await closeAll(kid);
    await teacher.context().close();
  }

  // マイページ（コインの ばしょ）。
  if (want('screen-dashboard')) {
    await kid.evaluate(() => uspeak.net.dash.open());
    await kid.waitForSelector('#dash-dialog[open]', { timeout: 40000 }).catch(() => {});
    await sleep(1500);
    await shoot(kid, 'screen-dashboard', 'マイページ（5技能）');
    await closeAll(kid);
  }
} finally {
  console.log(`\n${done.length} 枚 → docs/figures`);
  await browser.close();
  server.kill();
}
