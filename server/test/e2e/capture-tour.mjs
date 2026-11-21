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
import { phaseAt, PHASES } from '../../../client/dist/world-clock.js';

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
const api = (method, url, body) => fetch(`${base}/admin/api${url}`, { method, headers: { cookie, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
await api('PUT', '/roster', { rows: [{ name: NAME, premium: true, class: 'tour' }, { name: 'さくら', class: 'tour' }, { name: 'はると', class: 'tour' }, { name: 'さなだ先生', teacher: true, class: 'tour' }] });
// 子どもに 出す 宿題を 1 つ（先生の 画面と 子どもの 画面の 両方を 撮る）。
{
  const r = await api('POST', '/homework', { title: 'Unit 3 どうぶつ', classes: 'tour', due: '', items: [
    { en: 'dog', ja: 'いぬ' }, { en: 'cat', ja: 'ねこ' }, { en: 'rabbit', ja: 'うさぎ' }, { en: 'bird', ja: 'とり' }, { en: 'fish', ja: 'さかな' }, { en: 'horse', ja: 'うま' }] });
  if (r.assignment) await api('POST', `/homework/${r.assignment.id}/publish`, { on: true });
  // 同じ 宿題が 2 つ 以上 あれば 1 つに（撮りなおしで ふえない ように）。
  const all = await api('GET', '/homework');
  for (const a of (all.items || []).filter((a) => a.title === 'Unit 3 どうぶつ' && a.id !== r.assignment?.id)) await api('DELETE', `/homework/${a.id}`);
}

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

// はじめての 画面（ユーザーネームと パスワード）。島に 入る 前なので べつの ページで。
if (!ONLY.length || ONLY.some((o) => 'tour-lobby'.startsWith(o))) {
  const first = await ctx.newPage();
  await first.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
  await first.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await first.click('#avatar-cancel');
  await first.waitForSelector('#net-lobby[open]');
  await first.fill('#net-name', 'さくら'); await first.fill('#net-class', 'tour');
  await sleep(1200);
  await first.screenshot({ path: path.join(OUT, 'tour-lobby.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('  docs/figures/tour-lobby.jpg');
  await first.close();
}
// 島の 写真は 昼に（世界の 時計で 夜なら 次の 昼まで 待つ。capture-figures.mjs と 同じ）。
async function daylight(need = 25) {
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

// メインの島の 場所に 入る（main.walkIn は 戸口を 歩いて 入った ときと 同じ）。
async function walkIn(id) {
  await page.evaluate(async (id) => {
    if (!uspeak.rpg.insideBuilding) { uspeak.rpg.fly('main'); uspeak.rpg.finishFlight?.(); await new Promise((r) => setTimeout(r, 1500)); }
    const r = await fetch('main_island.json'); const d = await r.json();
    const spot = (d.island?.spots || d.spots).find((s) => s.id === id);
    uspeak.net.main.walkIn(spot);
  }, id);
}

await page.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
// すがた えらびは はじめての ときだけ（ロビーの 写真で 1 回 すすめた あとは 出ない）。
await page.waitForSelector('#avatar-dialog[open], #net-lobby[open]', { timeout: 240000 });
if (await page.$('#avatar-dialog[open]')) await page.click('#avatar-cancel');
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


  // 「せかいを えらぼう」の どの カードを おすか（1 まいずつ 赤い わく）。docs/figures/tour-pick-<島>.jpg
  async 'tour-pick'() {
    await closeAll(); await page.evaluate(() => uspeak.rpg.openMap()); await sleep(4000);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#rpg-dialog [data-world]')].map((b) => b.dataset.world));
    for (const id of ids) {
      await page.evaluate((id) => {
        document.querySelectorAll('.tour-pick-mark').forEach((n) => n.remove());
        document.querySelectorAll('[data-tour-pick]').forEach((n) => { n.style.outline = ''; n.removeAttribute('data-tour-pick'); });
        const b = document.querySelector(`#rpg-dialog [data-world="${id}"]`);
        b.scrollIntoView({ block: 'center' });
        b.setAttribute('data-tour-pick', '');
        b.style.outline = '7px solid #e53935'; b.style.outlineOffset = '4px';
        const r = b.getBoundingClientRect();
        const tag = document.createElement('div'); tag.className = 'tour-pick-mark';
        tag.textContent = 'ここを おす';
        Object.assign(tag.style, { position: 'fixed', zIndex: 2147483647, left: `${Math.max(8, r.left + r.width / 2 - 70)}px`, top: `${Math.max(8, r.top - 46)}px`,
          background: '#e53935', color: '#fff', font: '700 20px "Noto Sans JP",sans-serif', padding: '6px 14px', borderRadius: '10px', pointerEvents: 'none' });
        document.querySelector('#rpg-dialog').append(tag);
      }, id);
      await sleep(900); await shot(`tour-pick-${id}`);
    }
    await page.evaluate(() => { document.querySelectorAll('.tour-pick-mark').forEach((n) => n.remove()); });
    await closeAll();
  },

  // 画面ぜんぶを 英語に（「A」）。外国人の 先生むけ。
  async 'tour-english'() {
    await closeAll(); await page.click('#lang-toggle').catch(() => {}); await sleep(7000); await shot('tour-english');
    await page.click('#lang-toggle').catch(() => {}); await sleep(2500);
  },
  async 'tour-guide'() { await closeAll(); await page.click('#help').catch(() => {}); await page.waitForSelector('#guide-dialog[open]', { timeout: 30000 }).catch(() => {}); await sleep(4000); await shot('tour-guide'); await closeAll(); },
  async 'tour-chat'() { await closeAll(); await page.click('#net-chat-button').catch(() => {}); await sleep(3000); await shot('tour-chat'); await page.click('#net-chat-close').catch(() => {}); },
  async 'tour-fp'() { await closeAll(); await page.click('#fp-button').catch(() => {}); await sleep(6000); await shot('tour-fp'); await page.click('#fp-button').catch(() => {}); await sleep(1500); },
  async 'tour-adventure'() { await closeAll(); await page.evaluate(() => uspeak.rpg.adventure?.open?.('team')); await sleep(6000); await shot('tour-adventure'); await closeAll(); },
  async 'tour-daily'() { await closeAll(); await page.evaluate(() => uspeak.net.daily?.openLogin?.()); await sleep(3500); await shot('tour-daily'); await closeAll(); },

  // 操作（iPad の 横もち）：左下の スティック・下の バー・右上の ☰ を 赤い わくで。
  async 'tour-ipad'() {
    await page.goto('about:blank');   // この 端末は 遅いので、もう 1 まいの 3D を 止めて から（でないと 読みこみが おわらない）
    const c2 = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await routeCharacter(c2, characterWebm(path.join(TMP, 'character')));
    const t = await c2.newPage(); t.setDefaultTimeout(180000);
    await t.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
    await t.waitForSelector('#avatar-dialog[open], #net-lobby[open]', { timeout: 240000 });
    if (await t.$('#avatar-dialog[open]')) await t.evaluate(() => document.querySelector('#avatar-cancel').click());
    await t.waitForSelector('#net-lobby[open]'); await t.fill('#net-name', 'はると'); await t.fill('#net-class', 'tour'); await t.evaluate(() => document.querySelector('#net-join').click());
    await t.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000 });
    await sleep(4000);
    await t.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await sleep(3000);
    const mark = (list) => t.evaluate((list) => {
      document.querySelectorAll('.tour-mark').forEach((n) => n.remove());
      for (const [sel, text] of list) {
        const el = document.querySelector(sel); if (!el) continue;
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        const box = document.createElement('div'); box.className = 'tour-mark';
        Object.assign(box.style, { position: 'fixed', zIndex: 2147483647, left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
          border: '6px solid #e53935', borderRadius: '14px', pointerEvents: 'none', boxSizing: 'border-box' });
        const tag = document.createElement('div'); tag.className = 'tour-mark'; tag.textContent = text;
        const above = r.top > 60;
        Object.assign(tag.style, { position: 'fixed', zIndex: 2147483647, left: `${Math.min(innerWidth - 260, Math.max(6, r.left))}px`, top: `${above ? r.top - 46 : r.bottom + 10}px`,
          background: '#e53935', color: '#fff', font: '700 19px "Noto Sans JP",sans-serif', padding: '5px 12px', borderRadius: '9px', pointerEvents: 'none', whiteSpace: 'nowrap' });
        document.body.append(box, tag);
      }
    }, list);
    const snap = async (id) => { await t.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 86, timeout: 120000 }); console.log(`  docs/figures/${id}.jpg`); };
    await mark([['.mobile-pad .stick', 'うごく（スティック）'], ['.hotbar', '下の バー'], ['#rail-toggle', '☰ メニュー']]);
    await sleep(800); await snap('tour-ipad-controls');
    await t.evaluate(() => document.querySelectorAll('.tour-mark').forEach((n) => n.remove()));
    await t.evaluate(() => document.querySelector('#rail-toggle')?.click()); await sleep(1500);
    await mark([['#rail-toggle', '☰ を おすと ならぶ']]);
    await sleep(600); await snap('tour-ipad-menu');
    await c2.close();
  },
  // 操作（パソコン）：WASD・下の バー・Enter
  async 'tour-pc-controls'() {
    await closeAll(); await page.evaluate(() => document.body.classList.remove('pc-moved')); await sleep(2000);
    await page.evaluate(() => {
      document.querySelectorAll('.tour-mark').forEach((n) => n.remove());
      for (const [sel, text] of [['.control-hint', 'WASD・やじるしで うごく'], ['.hotbar', '下の バー（1〜4 の キー）']]) {
        const el = document.querySelector(sel); if (!el) continue; const r = el.getBoundingClientRect(); if (!r.width) continue;
        const box = document.createElement('div'); box.className = 'tour-mark';
        Object.assign(box.style, { position: 'fixed', zIndex: 2147483647, left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, border: '6px solid #e53935', borderRadius: '14px', pointerEvents: 'none', boxSizing: 'border-box' });
        const tag = document.createElement('div'); tag.className = 'tour-mark'; tag.textContent = text;
        Object.assign(tag.style, { position: 'fixed', zIndex: 2147483647, left: `${Math.max(6, r.left)}px`, top: `${r.top - 46}px`, background: '#e53935', color: '#fff', font: '700 19px "Noto Sans JP",sans-serif', padding: '5px 12px', borderRadius: '9px', pointerEvents: 'none', whiteSpace: 'nowrap' });
        document.body.append(box, tag);
      }
    });
    await sleep(800); await shot('tour-pc-controls');
    await page.evaluate(() => document.querySelectorAll('.tour-mark').forEach((n) => n.remove()));
  },
  // メインの島の お店（戸口を 歩いて 入ったのと 同じ 道）。
  async 'tour-wordhouse'() { await closeAll(); await walkIn('hut_easy'); await sleep(5000); await shot('tour-wordhouse'); await closeAll(); },
  async 'tour-weapons'() { await closeAll(); await walkIn('weapons'); await sleep(7000); await shot('tour-weapons'); await closeAll(); },
  async 'tour-bag'() { await closeAll(); await page.evaluate(() => uspeak.net.bag.open('wear')); await sleep(6000); await shot('tour-bag'); await closeAll(); },
  async 'tour-pier'() {
    await closeAll(); await page.evaluate(() => { uspeak.rpg.fly('main'); uspeak.rpg.finishFlight?.(); }); await sleep(2500);
    await walkIn('pier_g5'); await sleep(16000); await shot('tour-pier'); await closeAll();
  },
  async 'tour-talkshop'() {
    // 戸口に 立つと 中に 入る（歩いて 入ったのと 同じ）→ 中で 話しかける（ゆぴちゃんが 店員）。
    await closeAll(); await page.evaluate(() => { uspeak.rpg.inside?.leave?.(true); uspeak.rpg.fly('main'); uspeak.rpg.finishFlight?.(); }); await sleep(3000);
    await page.evaluate(async () => {
      const d = await (await fetch('main_island.json')).json();
      const s = d.island.spots.find((x) => x.id === 'pizza');
      uspeak.player.position.set(d.island.x + s.x, 0, d.island.z + s.z - 0.65);
      uspeak.rpg.inside.enter('main', s);   // 戸口を 歩いて 入った ときと 同じ 入りかた
    });
    await page.waitForFunction(() => !!uspeak.rpg.insideBuilding, null, { timeout: 60000, polling: 500 }).catch(() => console.log('  (not inside the shop)'));
    await sleep(3000); await walkIn('pizza');
    await page.waitForSelector('#conv-dialog[open]', { timeout: 60000 }).catch(() => console.log('  (conv did not open)'));
    await page.click('#conv-picker [data-topic]').catch(() => {}); await sleep(10000); await shot('tour-talkshop');
    await page.evaluate(() => document.querySelector('#conv-close')?.click()); await page.evaluate(() => uspeak.rpg.inside?.leave?.(true)); await closeAll();
  },

  // えほん
  async 'tour-reading'() {
    await closeAll(); await page.evaluate(() => uspeak.net.reading.open()); await sleep(6000); await shot('tour-reading-shelf');
    await page.evaluate(() => uspeak.net.reading.openBook('rd-A-hungry-bear')); await sleep(7000); await shot('tour-reading-book'); await closeAll();
  },
  // しゅくだい（子どもの 画面）
  async 'tour-homework-kid'() {
    await closeAll(); await page.evaluate(() => uspeak.net.homework.open()); await sleep(4000); await shot('tour-homework-list');
    await page.evaluate(() => document.querySelector('#homework-dialog .hw-go')?.click()); await sleep(5000);
    await shot('tour-homework-kid'); await closeAll();
  },
  // つり島：水辺に 立つと すぐ なげる → 問題
  async 'tour-fw'() {
    await closeAll(); await stand('fishworld', 'pond', 0);
    await page.evaluate(() => uspeak.net.fishworldInteract?.());
    await page.waitForSelector('#fw-dialog[open] .fmt, #fw-dialog[open] [class*="fmt-"]', { timeout: 60000 }).catch(() => {});
    await sleep(2500); await shot('tour-fw'); await closeAll();
  },
  async 'tour-farm'() { await closeAll(); await stand('farm', 'seeds'); await page.evaluate(() => uspeak.net.farmInteract()); await sleep(7000); await shot('tour-farm'); await closeAll(); },
  async 'tour-land'() { await closeAll(); await stand('land', 'office'); await page.evaluate(() => uspeak.net.landInteract()); await sleep(12000); await shot('tour-land'); await closeAll(); },
  async 'tour-blockshop'() { await closeAll(); await stand('town', 'shop'); await page.evaluate(() => uspeak.net.townInteract()); await sleep(5000); await shot('tour-blockshop'); await closeAll(); },
  // 先生（名簿の 先生の 列だけで 入る）
  async 'tour-teacher'() {
    await page.goto('about:blank');   // この 端末は 遅いので、もう 1 まいの 3D を 止めて から（でないと 読みこみが おわらない）
    // べつの ブラウザ（同じ ブラウザだと 子どもの なまえで 自動で 入って しまう）。
    const c3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await routeCharacter(c3, characterWebm(path.join(TMP, 'character')));
    const t = await c3.newPage();
    await t.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
    await t.waitForSelector('#avatar-dialog[open], #net-lobby[open]', { timeout: 240000 });
    if (await t.$('#avatar-dialog[open]')) await t.click('#avatar-cancel');
    await t.waitForSelector('#net-lobby[open]'); await t.fill('#net-name', 'さなだ先生'); await t.fill('#net-class', 'tour'); await t.click('#net-join');
    await t.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000 });
    await sleep(3000); await t.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await t.evaluate(() => document.querySelector('#net-teacher-button')?.click()); await sleep(3000);
    await t.screenshot({ path: path.join(OUT, 'tour-teacher.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('  docs/figures/tour-teacher.jpg');
    await t.evaluate(() => document.querySelector('#net-teacher-button')?.click());
    await t.click('#class-mode-button').catch(() => {}); await sleep(5000);
    await t.screenshot({ path: path.join(OUT, 'tour-classmode.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('  docs/figures/tour-classmode.jpg');
    await c3.close();
  },
  // 保護者の web レポート（いちばん 上に 数字 5 つと 進み具合）
  async 'tour-report-web'() {
    const { signReport } = await import('../../src/game/report.js');
    const t = signReport('tour-report-secret-0123456789', 'tour', NAME);
    await page.goto(`${base}/report/tour/${encodeURIComponent(NAME)}?t=${encodeURIComponent(t)}`); await sleep(2500); await shot('tour-report-web');
  },
  async 'tour-admin-roster'() { await page.goto(`${base}/admin`); await sleep(3000); await page.evaluate(() => { const n = document.querySelector('#teacher-notice'); if (n) n.hidden = true; }); await shot('tour-admin-roster'); },
  async 'tour-admin-qr'() { await page.goto(`${base}/admin/kids`); await sleep(3000); await shot('tour-admin-qr'); },
  // 先生・運営の 画面（同じ ブラウザに 運営の ログインを 入れて ある）。
  async 'tour-homework-admin'() { await page.goto(`${base}/admin/homework`); await sleep(3000); await shot('tour-homework-admin'); },
  async 'tour-phonics-admin'() { await page.goto(`${base}/admin/abc`); await sleep(2500); await page.evaluate(() => document.querySelector('#ph')?.scrollIntoView()); await sleep(800); await shot('tour-phonics-admin'); },
};

try {
  for (const [id, run] of Object.entries(STEPS)) {
    if (ONLY.length && !ONLY.some((o) => id.startsWith(o))) continue;
    try { console.log(id); if (!/admin|report|lobby|teacher|line|pick|ipad/.test(id)) await daylight(); await run(); } catch (err) { console.log(`  ${id} failed:`, err.message.split('\n')[0]); }
  }
} finally {
  await browser.close();
  server.kill();
}
