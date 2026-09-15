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
import { makeHelpers, waitForServer } from './lib/walk.mjs';
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
await waitForServer(PORT);

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
  // **1秒に数コマしか描かない端末なので、既定の30秒では撮り切れないことがある。**
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 });
  done.push(name);
  console.log(`  ${name}.jpg  ${note || ''}`);
};

try {
  // 「?」のガイドの 1〜4ページ目だけは、**まだ島に入っていない画面**が要る。
  // openPage はアバターもロビーも抜けてしまうので、ここだけ自分でページを開く。
  if (want('guide-')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const first = await ctx.newPage();
    await first.route('**/fonts.googleapis.com/**', (r) => r.abort());
    await first.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
    await first.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await sleep(2500);
    await first.screenshot({ path: path.join(OUT, 'guide-avatar.jpg'), type: 'jpeg', quality: 92, timeout: 180000 });
    done.push('guide-avatar'); console.log('  guide-avatar.jpg  すがたをえらぶ');
    await first.click('#avatar-confirm');
    await first.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await first.fill('#net-name', 'ゆうと');
    await first.fill('#net-class', 'つばめ2くみ');
    await sleep(800);
    await first.screenshot({ path: path.join(OUT, 'guide-lobby.jpg'), type: 'jpeg', quality: 92, timeout: 180000 });
    done.push('guide-lobby'); console.log('  guide-lobby.jpg  なまえとクラス');
    await ctx.close();
    // 「◯◯と話す」の札が出ているところ。島の人の前に立って、札が出るまで待つ。
    await daylight();
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(async () => {
      uspeak.rpg.inside?.leave?.(true);
      uspeak.rpg.fly('willow'); uspeak.rpg.finishFlight();
      await new Promise((r) => setTimeout(r, 1200));
      const { WILLOW_LESSONS } = await import('./lesson-data.js');
      const q = WILLOW_LESSONS[0];
      uspeak.player.position.set(q.x, 0, q.z + 2.6);
      uspeak.view.look(0, -0.12);
    });
    await page.waitForFunction(() => {
      const n = document.querySelector('#near');
      return n && n.style.display !== 'none';
    }, null, { timeout: 60000, polling: 300 }).catch(() => console.log('  (no prompt showed)'));
    await sleep(900);
    await shot('guide-near', '「◯◯と話す」が出ているところ');
  }

  // 前の島で出ていた「E ○○する」の札。下で、書き換わったことを確かめるのに使う。
  let lastPrompt = '';
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
    // 「E ○○する」の札は、近くに何も無いときは**表示だけ消えて文字は残る**。
    // 1〜3fps だと前の島の札を持ったまま次の島を撮ってしまうので（まちづくり島の写真に
    // 「のりものを えらぶ」が写った）、消えるか、書き換わるまで待つ。
    await page.waitForFunction((was) => {
      const near = document.querySelector('#near');
      const now = document.querySelector('#interact span')?.textContent || '';
      return getComputedStyle(near).display === 'none' || now !== was;
    }, lastPrompt, { timeout: 8000, polling: 300 }).catch(() => {});
    lastPrompt = await page.evaluate(() => document.querySelector('#interact span')?.textContent || '');
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
    // はじまりの島のように「建物の一覧」を持たない島もある。その場合は飛ぶだけ。
    const place = (island2?.spots || []).find((s) => s.id === want || s.kind === want) || (island2?.spots || [])[0];
    if (island2 && place) uspeak.player.position.set(island2.x + place.x, 0, island2.z + place.z + 1.6);
    await new Promise((r) => setTimeout(r, 900));
  }, { isle: island, want: spot });

  if (want('screen-')) await daylight(60);
  await at('school', 'easy');
  await page.evaluate(() => uspeak.net.schoolInteract());
  await page.waitForSelector('#quiz-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-quiz', 'ことばの学校・10問クイズ');

  await at('school', 'gym');
  await page.evaluate(() => uspeak.net.schoolInteract());
  await page.waitForSelector('#gym-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-gym', 'ことばのジム（聞く・話す）');

  await at('arena', 'easy');
  await page.evaluate(() => uspeak.net.arenaInteract());
  await page.waitForSelector('#battle-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-battle', 'えいごアリーナ・バトル');

  await at('pet', 'nest');
  await page.evaluate(() => uspeak.net.petInteract());
  await page.waitForSelector('#pet-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-pet', 'ペット島・たまごの巣');

  // 釣りはどこからでも開く。はじまりの島で開けば、後ろに島が写る。
  await at('willow', 'x');
  await page.evaluate(() => uspeak.fishing.open('spots'));
  await page.waitForSelector('#fishing-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(2000); await shot('screen-fishing', '英単語釣り（魚1匹＝英単語1つ）');
  await page.evaluate(() => document.querySelector('#fishing-close')?.click());
  await sleep(400);

  await at('errand', 'plaza');
  await page.evaluate(() => uspeak.net.errandInteract());
  await page.waitForSelector('#mission-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-errand', 'おつかい島・用事をうけとる');

  await at('eiken5', 'reading');
  await page.evaluate(() => uspeak.net.eikenInteract());
  await page.waitForSelector('#eiken-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-eiken', '英検・よむ');

  await at('eiken5', 'interview');
  await page.evaluate(() => uspeak.net.eikenInteract());
  await page.waitForSelector('#iv-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-interview', '英検の面接');

  await at('eiken3', 'writing');
  await page.evaluate(() => uspeak.net.eikenInteract());
  await page.waitForSelector('#eiken-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-eikenwrite', '英検3級・かく');

  // 会話は2枚。場面を選ぶところと、実際に話しているところ。
  await at('conv', 'cafe');
  await page.evaluate(() => uspeak.net.convInteract());
  await page.waitForSelector('#conv-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(1200); await shot('screen-conv', 'AI英会話・場面をえらぶ');

  // ひとこと話してみて、返事が返ってきた画面。ここが資料のいちばん見たいところ。
  await page.evaluate(() => document.querySelector('#conv-picker [data-topic]')?.click());
  await page.waitForFunction(() => !document.querySelector('#conv-foot')?.hidden, null, { timeout: 40000, polling: 300 }).catch(() => {});
  await sleep(1500);
  await page.fill('#conv-text', 'Hello! My name is Kai. Nice to meet you.').catch(() => {});
  await page.click('#conv-send').catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#conv-log li').length >= 2, null, { timeout: 60000, polling: 400 }).catch(() => {});
  await sleep(2500); await shot('screen-convtalk', 'ウーピーと 話しているところ');
  await page.evaluate(() => document.querySelector('#conv-close')?.click());
  await sleep(500);

  await at('town', 'shop');
  await page.evaluate(() => uspeak.net.townInteract());
  await page.waitForSelector('#town-dialog[open] [data-block]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-blockshop', 'ブロック屋');

  await at('town', 'furniture');
  await page.evaluate(() => uspeak.net.townInteract());
  await page.waitForSelector('#town-dialog[open] [data-prop]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-furniture', 'かぐ屋');

  // ここから「実際に遊んでいる画面」。パネルではなく、世界の中。
  //
  // 部屋とひろばは**歩いて入る**のが本来だが、この端末は1〜3fps で歩かせると分単位に
  // なるので、戸口そのものに置いて同じ判定に任せる（近づいたら入る、は毎フレーム動く）。
  // 戸口は建物の正面（spot.z - 0.65）にあるので、そこへ置く。前に建物の1.6手前に
  // 置いていたときは、判定の外に立って「はいる」の札を見ているだけの写真になった。
  const intoDoor = async (spot, active) => {
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(async (want) => {
      uspeak.rpg.inside?.leave?.(true);
      uspeak.rpg.fly('town'); uspeak.rpg.finishFlight();
      await new Promise((r) => setTimeout(r, 1100));
      const d = await uspeak.rpg.town.ready;
      const isle = d.island || d;
      const place = isle.spots.find((s) => s.kind === want);
      uspeak.player.position.set(isle.x + place.x, 0, isle.z + place.z - 0.65);
    }, spot);
    await page.waitForFunction((k) => uspeak.net[k].active, active, { timeout: 30000, polling: 300 })
      .catch(async () => { await page.click('#interact').catch(() => {}); });
    await page.waitForFunction((k) => uspeak.net[k].active, active, { timeout: 20000, polling: 300 })
      .catch(() => console.log(`  (never got into ${spot})`));
    await sleep(1500);
  };
  // 中に入ったら、置いたものが見えるように少し見下ろす（既定はほぼ水平で、床しか写らない）。
  const lookDown = () => page.evaluate(() => uspeak.view.look(0, -0.35));

  await intoDoor('door', 'myRoom');
  await lookDown();
  for (let i = 0; i < 3; i += 1) {
    await page.click('#room-place').catch(() => {});
    await sleep(700);
    await page.evaluate(() => { uspeak.player.position.x -= 1.8; });
    await sleep(500);
  }
  await page.evaluate(() => { uspeak.player.position.x += 4.5; });
  await lookDown();
  await sleep(1200); await shot('screen-myroom', 'マイルーム。十字でねらって かぐを おく。');
  await page.click('#room-exit').catch(() => {});
  await sleep(900);

  await intoDoor('plaza', 'myPlaza');
  await lookDown();
  for (let i = 0; i < 4; i += 1) {
    await page.click('#room-place').catch(() => {});
    await sleep(600);
    await page.evaluate(() => { uspeak.player.position.z -= 1.4; });
    await sleep(500);
  }
  await page.evaluate(() => { uspeak.player.position.z += 5; });
  await lookDown();
  // 下がってから少し待つ。最後の1個を自分の足元に置こうとした注意書きが出たままだと、
  // 資料に載るのが「置けませんでした」の写真になる。
  await sleep(5000); await shot('screen-plaza', 'ひろば。クラス全員で ひとつの 世界を つくる。');
  await page.click('#room-exit').catch(() => {});
  await sleep(900);

  await at('ride', 'kick');
  await page.evaluate(() => uspeak.net.rideInteract());
  await page.waitForSelector('#ride-dialog[open]', { timeout: 40000 }).catch(() => {});
  await sleep(900); await shot('screen-garage', 'のりもの島のガレージ');

  // レースの本番。コースを走っている画面で、順位・ラップ・タイムが出ているところ。
  //
  // **レースは のりものを持っていないと始まらない**（徒歩では走れない、という島の規則が
  // そのままサーバーにある）。だからまずキックボードを買う。買わずに start を押した
  // ときは、夜の島がただ写っただけの写真になった。
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.evaluate(() => uspeak.net.room?.send('ride:buy', { id: 'kick' }));
  await sleep(1500);
  await at('ride', 'start');
  if (want('screen-race')) await daylight(90);
  await page.evaluate(() => uspeak.net.gp.start({ name: 'みほん' }));
  await page.waitForFunction(() => uspeak.net.gp.state.phase === 'race', null, { timeout: 120000, polling: 400 })
    .catch(() => console.log('  (race never started — shooting whatever is on screen)'));
  await sleep(4000); await shot('screen-race', 'レース。3周・順位・ラップ。');
  await page.evaluate(() => uspeak.net.gp.quit());
  await sleep(1500);

  // おはなし島の通話パネル。部屋に入ると出る。島が外に写るので、ここも昼に。
  await at('talk', 'chat');
  if (want('screen-talk')) await daylight(40);
  await page.waitForFunction(() => !document.querySelector('#voice-panel')?.hidden, null, { timeout: 40000, polling: 300 }).catch(() => {});
  await sleep(1500); await shot('screen-talk', 'おはなし島・通話のパネル');

  // どこからでも開く画面
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.evaluate(() => document.querySelector('#flight-button')?.click());
  await page.waitForSelector('#rpg-dialog[open] #rpg-world-map', { timeout: 40000 }).catch(() => {});
  await sleep(1600); await shot('screen-map', 'ワールドマップ（島へ飛ぶ）');
  await page.evaluate(() => document.querySelector('#rpg-close')?.click());
  await sleep(500);
  await page.evaluate(() => uspeak.net.wardrobe.open());
  await page.waitForFunction(() => document.querySelectorAll('#wear-grid [data-item]').length > 0, null, { timeout: 40000 }).catch(() => {});
  await sleep(2500); await shot('screen-wardrobe', 'きせかえ・ぼうし');
  // もう1枚、別のスロット。品数と 3D のカードが並ぶところを見せる。
  await page.evaluate(() => uspeak.net.wardrobe.open({ slot: 'back' }));
  await page.waitForFunction(() => document.querySelectorAll('#wear-grid [data-item]').length > 0, null, { timeout: 40000 }).catch(() => {});
  await sleep(3000); await shot('screen-wearback', 'きせかえ・せなか');
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
  // `play` は「入口の画面ではなく、遊んでいるところを撮る」ためのひと押し。
  // 同梱ゲームのタイトル画面は、教室の先生が知りたいこと（何をして遊ぶのか）を
  // ほとんど写さない。iframe は同一オリジンなので、あちらのボタンを外から押せる。
  const guest = async (open, name, wait = 4000, ready = null, play = null) => {
    if (!want(`game-${name}`)) return;
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
    await page.evaluate(open);
    await page.waitForFunction(() => document.querySelector('.arcade-frame')?.contentDocument?.readyState === 'complete',
      null, { timeout: 120000, polling: 500 }).catch(() => {});
    const inFrame = (fn, arg) => page.evaluate(([src, a]) => {
      const doc = document.querySelector('.arcade-frame')?.contentDocument;
      // eslint-disable-next-line no-new-func
      return doc ? new Function('doc', 'arg', `return (${src})(doc, arg)`)(doc, a) : null;
    }, [fn.toString(), arg]);
    const waitIn = (fn, ms = 240000) => page.waitForFunction((src) => {
      const doc = document.querySelector('.arcade-frame')?.contentDocument;
      // eslint-disable-next-line no-new-func
      return doc ? !!new Function('doc', `return (${src})(doc)`)(doc) : false;
    }, fn.toString(), { timeout: ms, polling: 1000 });
    if (ready) await waitIn(ready).catch(() => console.log(`  (${name} never signalled ready)`));
    if (play) await play({ inFrame, waitIn });
    await sleep(wait);
    await shot(`game-${name}`, name);
    await page.evaluate(() => {
      for (const g of [uspeak.net.racers, uspeak.net.blockwild, ...Object.values(uspeak.net.arcades)]) g.close();
    });
    await sleep(700);
  };
  // AURORA KART: メニューではなく、走っているところ。カウントダウンが消えてから撮る。
  await guest(() => uspeak.net.racers.open(), 'racers', 6000,
    (doc) => !!doc.querySelector('#start'),
    async ({ inFrame, waitIn }) => {
      await inFrame((doc) => doc.querySelector('#start')?.click());
      await waitIn((doc) => {
        const cd = doc.querySelector('#countdown');
        return !!doc.querySelector('#hud') && (!cd || !cd.textContent.trim() || cd.hidden);
      }, 180000).catch(() => console.log('  (AURORA KART never got going)'));
      await sleep(9000);
    });

  // BLOCKWILD: タイトルではなく、ブロックの世界の中。
  await guest(() => uspeak.net.blockwild.open(), 'blockwild', 9000,
    (doc) => doc.querySelector('#loading')?.classList.contains('hidden'),
    async ({ inFrame, waitIn }) => {
      await inFrame((doc) => doc.querySelector('#play')?.click());
      await waitIn((doc) => doc.querySelector('#menu')?.classList.contains('hidden'), 180000)
        .catch(() => console.log('  (BLOCKWILD never entered the world)'));
    });
  // ふたつのパズルも、選ぶ画面ではなく落ちているところ。
  // ぷよは落ちてくるのを少し待つ。押した直後だと、まっさらな盤の写真になる。
  await guest(() => uspeak.net.arcades.puyo.open(), 'puyo', 30000,
    (doc) => !!doc.querySelector('[data-mode="uspeak"]'),
    async ({ inFrame }) => { await inFrame((doc) => doc.querySelector('[data-mode="uspeak"]')?.click()); });
  await guest(() => uspeak.net.arcades.suika.open(), 'suika', 7000,
    (doc) => !!doc.querySelector('#startBtn'),
    async ({ inFrame, waitIn }) => {
      await inFrame((doc) => doc.querySelector('#startBtn')?.click());
      await waitIn((doc) => doc.querySelector('#titleOverlay')?.hidden
        || doc.querySelector('#titleOverlay')?.classList.contains('hidden'), 60000).catch(() => {});
    });

  console.log(`\n${done.length} figures written to docs/figures/`);
} catch (err) {
  console.log('CAPTURE ERROR', err);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
