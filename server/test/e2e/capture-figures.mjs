// 資料用のスクリーンショットを、島とゲームのぶんだけ撮る。
//
// 手で撮ると「あとから1枚だけ足す」ができなくなるので、一覧にして回す。撮るサイズは
// 1280x800（PDF に2枚並べても読める大きさ）、形式は JPEG（PNG だと資料が 13MB を超える）。
//
// Run: node test/e2e/capture-figures.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';
import { phaseAt, PHASES } from '../../../client/dist/world-clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = path.resolve(serverDir, '../docs/figures');
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2691;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1600);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 1280, height: 800 } });
const done = [];

// 島は「飛んで、少し待って、撮る」。パネルは「その建物に立って、開いて、撮る」。
const ISLANDS = [
  ['willow', 'はじまりの島'], ['errand', 'おつかい島'], ['school', 'ことばの学校島'],
  ['arena', 'えいごアリーナ島'], ['pet', 'ペット島'], ['ride', 'のりもの島'],
  ['town', 'まちづくり島'], ['eiken5', '英検5級の島'], ['eiken3', '英検3級の島'],
  ['conv', '英会話島'], ['talk', 'おはなし島'], ['wear', 'きせかえ島'],
  ['mini', 'ミニゲーム島'], ['park', 'テーマパーク'],
];

// 引数を渡すと、その名前を含む図だけを撮り直す。1枚だけ差し替えたいときのため。
//   node test/e2e/capture-figures.mjs blockwild island-town
const ONLY = process.argv.slice(2);
const want = (name) => !ONLY.length || ONLY.some((o) => name.includes(o));

const page = await openPage('みほん');

// 島の写真は昼に撮る。
//
// 空はこの端末の設定ではなく世界の時計で決まる（world-clock.js・昼300秒/夕120秒/
// 夜240秒/朝45秒）ので、夜に走らせると14枚ぜんぶ真っ暗になる。撮る前に次の昼まで待つ。
// 「待つ」は二段構え：まず時計の計算で昼が来るまで寝て、そのあと実際に空が明るく
// なったことを確かめる（atmosphere は目標値へ damp で近づくので、昼になった瞬間は
// まだ暗い）。時計合わせのずれはサーバーの時刻で直す。
const DAYLIGHT_NEEDED = 20; // 1枚撮り終えるまでに必要な昼の残り秒数
async function daylight(need = DAYLIGHT_NEEDED) {
  const skew = await page.evaluate(() => uspeak.net.serverNow() - Date.now()).catch(() => 0);
  const now = phaseAt(Date.now() + skew);
  if (now.id !== 'day' || now.endsIn < need) {
    let wait = now.endsIn;
    for (let i = (now.index + 1) % PHASES.length; PHASES[i].id !== 'day'; i = (i + 1) % PHASES.length) wait += PHASES[i].seconds;
    console.log(`  …${now.ja}。あと ${Math.ceil(wait)} 秒で ひるま`);
    await sleep(Math.ceil(wait * 1000) + 500);
  }
  // そして本当に明るくなるまで。
  await page.waitForFunction(() => uspeak.atmosphere.state.night < 0.06, null, { timeout: 240000, polling: 1000 })
    .catch(() => console.log('  (sky never brightened — shooting anyway)'));
}
const shot = async (name, note) => {
  if (!want(name)) return;
  // JPEG で撮る。PNG だと29枚で 14MB になり、PDF が 13MB を超えて配れなくなる。
  // 画質92の 4:4:4 なら、UI の細い文字も紙で読める。
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 92 });
  done.push(name);
  console.log(`  ${name}.jpg  ${note || ''}`);
};

try {
  for (const [id, label] of ISLANDS) {
    if (!want(`island-${id}`)) continue;
    await daylight();
    await page.evaluate(async (hub) => {
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
      uspeak.rpg.inside?.leave?.(true);
      uspeak.rpg.fly(hub);
      uspeak.rpg.finishFlight();
      await new Promise((r) => setTimeout(r, 1400));
    }, id);
    await sleep(2200);                       // this renderer takes its time
    await shot(`island-${id}`, label);
  }

  // 各画面。開き方はレイアウト検査と同じ道を使う。
  const at = async (island, spot) => page.evaluate(async ({ isle, want }) => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.inside?.leave?.(true);
    uspeak.rpg.fly(isle); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 1100));
    const data = await (uspeak.rpg[isle]?.ready || Promise.resolve(null));
    const island2 = data?.island || data;
    const place = (island2?.spots || []).find((s) => s.id === want || s.kind === want) || (island2?.spots || [])[0];
    uspeak.player.position.set(island2.x + place.x, 0, island2.z + place.z + 1.6);
    await new Promise((r) => setTimeout(r, 900));
  }, { isle: island, want: spot });

  if (want('screen-')) await daylight(60);
  await at('school', 'easy');
  await page.evaluate(() => uspeak.net.schoolInteract());
  await page.waitForSelector('#quiz-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-quiz', 'ことばの学校・10問クイズ');

  await at('arena', 'easy');
  await page.evaluate(() => uspeak.net.arenaInteract());
  await page.waitForSelector('#battle-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-battle', 'えいごアリーナ・バトル');

  await at('eiken5', 'reading');
  await page.evaluate(() => uspeak.net.eikenInteract());
  await page.waitForSelector('#eiken-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-eiken', '英検・よむ');

  await at('eiken5', 'interview');
  await page.evaluate(() => uspeak.net.eikenInteract());
  await page.waitForSelector('#iv-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-interview', '英検の面接');

  await at('conv', 'cafe');
  await page.evaluate(() => uspeak.net.convInteract());
  await page.waitForSelector('#conv-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-conv', 'AI英会話');

  await at('town', 'shop');
  await page.evaluate(() => uspeak.net.townInteract());
  await page.waitForSelector('#town-dialog[open] [data-block]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-blockshop', 'ブロック屋');

  await at('ride', 'kick');
  await page.evaluate(() => uspeak.net.rideInteract());
  await page.waitForSelector('#ride-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-garage', 'のりもの島のガレージ');

  // どこからでも開く画面
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.evaluate(() => document.querySelector('#flight-button')?.click());
  await page.waitForSelector('#rpg-dialog[open] #rpg-world-map', { timeout: 40000 }).catch(() => {});
  await sleep(1600); await shot('screen-map', 'ワールドマップ（島へ飛ぶ）');
  await page.evaluate(() => document.querySelector('#rpg-close')?.click());
  await sleep(500);
  await page.evaluate(() => uspeak.net.wardrobe.open());
  await page.waitForFunction(() => document.querySelectorAll('#wear-grid [data-item]').length > 0, null, { timeout: 40000 }).catch(() => {});
  await sleep(2500); await shot('screen-wardrobe', 'きせかえ');
  await page.evaluate(() => uspeak.net.wardrobe.dialog.close());

  await page.evaluate(() => uspeak.net.dash.open());
  await page.waitForSelector('#dash-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-dashboard', 'マイページ（5技能）');
  await page.evaluate(() => uspeak.net.dash.dialog.close());

  await page.evaluate(() => document.querySelector('#net-teacher-button')?.click());
  await sleep(900); await shot('screen-teacher', '先生コンソール');
  await page.evaluate(() => document.querySelector('#net-teacher-button')?.click());

  // 同梱のゲーム4本
  // ready は「あちらのゲームが、撮ってよい状態になったか」を iframe の中で見る式。
  // BLOCKWILD はここが要る：世界を組み立てる間ずっと読み込み画面なので、秒数で待つと
  // 進捗バーの写真になる（実際に一度なった）。
  const guest = async (open, name, wait = 4000, ready = null) => {
    if (!want(`game-${name}`)) return;
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(open);
    await page.waitForFunction(() => document.querySelector('.arcade-frame')?.contentDocument?.readyState === 'complete',
      null, { timeout: 120000, polling: 500 }).catch(() => {});
    if (ready) {
      await page.waitForFunction((src) => {
        const doc = document.querySelector('.arcade-frame')?.contentDocument;
        // eslint-disable-next-line no-new-func
        return doc ? !!new Function('doc', `return (${src})(doc)`)(doc) : false;
      }, ready.toString(), { timeout: 240000, polling: 1000 }).catch(() => console.log(`  (${name} never signalled ready)`));
    }
    await sleep(wait);
    await shot(`game-${name}`, name);
    await page.evaluate(() => {
      for (const g of [uspeak.net.racers, uspeak.net.blockwild, ...Object.values(uspeak.net.arcades)]) g.close();
    });
    await sleep(700);
  };
  await guest(() => uspeak.net.racers.open(), 'racers');
  await guest(() => uspeak.net.blockwild.open(), 'blockwild', 6000,
    (doc) => doc.querySelector('#loading')?.classList.contains('hidden'));
  await guest(() => uspeak.net.arcades.puyo.open(), 'puyo');
  await guest(() => uspeak.net.arcades.suika.open(), 'suika');

  console.log(`\n${done.length} figures written to docs/figures/`);
} catch (err) {
  console.log('CAPTURE ERROR', err);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
