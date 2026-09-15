// 紹介動画に入れる「実際に動いているところ」を録る。
//
// 静止画では伝わらないものが3つある — カートが走っていること、ブロックの世界を
// 歩けること、そしてウーピーとのやりとりが進むこと。ここはその3本だけを録る。
//
// Run: node test/e2e/capture-clips.mjs [racers blockwild conv]
// 出る場所: docs/clips/clip-<id>.webm （Playwright の録画そのまま・VP8・音声なし）
//
// **この端末は1秒に数コマしか描けない。** ソフトウェアGLで三次元を2つ動かすので当然で、
// 録画もその速さのままになる。少しでも稼ぐために：小さめの窓で録る、ゲーム側の画質を
// 「軽量」に落とす、島の描画を止める（全画面のゲームが上がっている間はもともと止まる）。
// それでも本物の端末より粗い。**教室の iPad はこれよりずっと滑らかに動く。**
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = path.resolve(serverDir, '../docs/clips');
const TMP = path.resolve(serverDir, 'loadtest-results/clip-tmp');
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2694;
const SIZE = { width: 1024, height: 576 };     // 16:9。大きくすると目に見えて重くなる
const ONLY = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

// iframe の中を外から触る。同一オリジンなので普通に届く（arcade.js と同じ理屈）。
const inFrame = (page, fn, arg) => page.evaluate(([src, a]) => {
  const doc = document.querySelector('.arcade-frame')?.contentDocument;
  // eslint-disable-next-line no-new-func
  return doc ? new Function('doc', 'arg', `return (${src})(doc, arg)`)(doc, a) : null;
}, [fn.toString(), arg]);
const waitIn = (page, fn, ms = 240000) => page.waitForFunction((src) => {
  const doc = document.querySelector('.arcade-frame')?.contentDocument;
  // eslint-disable-next-line no-new-func
  return doc ? !!new Function('doc', `return (${src})(doc)`)(doc) : false;
}, fn.toString(), { timeout: ms, polling: 500 });

const CLIPS = {
  // 走っているところ。メニューで軽量にしてから、アクセルを踏みっぱなしで曲げる。
  async racers(page) {
    await page.evaluate(() => uspeak.net.racers.open());
    await waitIn(page, (doc) => !!doc.querySelector('#start'));
    await inFrame(page, (doc) => {
      const q = doc.querySelector('#quality');
      if (q) { q.value = 'low'; q.dispatchEvent(new Event('change', { bubbles: true })); }
      const auto = doc.querySelector('#autoGas');           // 加速は自動に（キーを1つ減らす）
      if (auto && auto.getAttribute('aria-checked') === 'false') auto.click();
      doc.querySelector('#start')?.click();
    });
    // **カウントダウンが消えたかではなく、実際に動き出したかを待つ。** `#countdown` は
    // 数字が入る前も空なので、そこで進むと「3」が出ているところで録り終わる（一度そうなった）。
    // メーターが 0 を離れたら、本当に走っている。
    await page.mouse.click(SIZE.width / 2, SIZE.height / 2);
    await waitIn(page, (doc) => (parseFloat(doc.querySelector('#speed')?.textContent || '0') > 5),
      180000).catch(() => console.log('  (race never got going)'));
    // ゆるく左右に振りながら30秒。直進だけだと、走っているのか止まっているのか分からない。
    for (const [key, ms] of [['', 1500], ['ArrowRight', 2200], ['', 1800], ['ArrowLeft', 2600],
      ['', 1900], ['ArrowRight', 2400], ['', 1600], ['ArrowLeft', 2400], ['', 1800],
      ['ArrowRight', 2200], ['', 1700], ['ArrowLeft', 2000], ['', 1600], ['ArrowRight', 2300]]) {
      if (key) await page.keyboard.down(key);
      await sleep(ms);
      if (key) await page.keyboard.up(key);
    }
    await page.evaluate(() => uspeak.net.racers.close());
  },

  // ブロックの世界を歩く。掘る・置くまでやると画面が寄りすぎるので、歩いて見回すだけ。
  async blockwild(page) {
    await page.evaluate(() => uspeak.net.blockwild.open());
    await waitIn(page, (doc) => doc.querySelector('#loading')?.classList.contains('hidden'));
    await inFrame(page, (doc) => doc.querySelector('#play')?.click());
    await waitIn(page, (doc) => doc.querySelector('#menu')?.classList.contains('hidden'), 180000)
      .catch(() => console.log('  (never entered the world)'));
    await sleep(4000);
    await page.mouse.click(SIZE.width / 2, SIZE.height / 2);   // ポインタを渡す
    await page.keyboard.down('KeyW');
    // **世界が出るまでに30秒近くかかる**（生成中はずっと読み込み画面）。歩くところが
    // 短いと、紹介動画のカットのほうが長くて繰り返しになるので、長めに歩く。
    for (let i = 0; i < 36; i += 1) {
      // 見回しはマウスの移動で。歩きながら少しずつ首を振る。
      await page.mouse.move(SIZE.width / 2 + Math.sin(i / 2.4) * 240, SIZE.height / 2 + Math.sin(i / 5) * 40);
      await sleep(1000);
    }
    await page.keyboard.up('KeyW');
    await page.evaluate(() => uspeak.net.blockwild.close());
  },

  // ウーピーとのやりとり。打つ・送る・返事が来る・目標が埋まる、が順に動く。
  //
  // **この端末ではキャラクターは絵のフクロウになる。** 本物は mp4 の動画だが、この
  // Chromium に H.264 が入っていないので character.js が絵に切り替える（そういう作り）。
  // 教室の端末では動画のウーピーが出る。口が動くのはどちらも同じ。
  async conv(page) {
    // **近さの判定はフレームループの中。** 1秒に数コマしか回らないので、置いて1回待つ
    // だけでは間に合わないことがある（実際そうなって開かなかった）。近いと言うまで置き直す。
    await page.evaluate(async () => {
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
      uspeak.rpg.inside?.leave?.(true);
      uspeak.rpg.fly('conv'); uspeak.rpg.finishFlight();
      await new Promise((r) => setTimeout(r, 1500));
    });
    await page.waitForFunction(async () => {
      // 島によって ready が返す形が違う（島そのものだったり {island} だったり）。
      const data = await uspeak.rpg.conv.ready;
      const isle = data.island || data;
      const spot = isle.spots.find((s) => s.id === 'cafe');
      uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.6);
      return !!uspeak.rpg.convNearby();
    }, null, { timeout: 120000, polling: 500 });
    await page.evaluate(() => uspeak.net.convInteract());
    await page.waitForSelector('#conv-dialog[open]', { timeout: 60000 });
    await sleep(2500);
    await page.click('#conv-picker [data-topic]');
    await page.waitForFunction(() => !document.querySelector('#conv-foot')?.hidden,
      null, { timeout: 60000, polling: 300 }).catch(() => {});
    await sleep(3500);
    for (const line of ['Hello! My name is Kai.', "I'm fine, thank you!"]) {
      await page.click('#conv-text');
      await page.type('#conv-text', line, { delay: 110 });   // 打っているところを見せる
      await sleep(600);
      await page.click('#conv-send');
      const before = await page.evaluate(() => document.querySelectorAll('#conv-log li').length);
      await page.waitForFunction((n) => document.querySelectorAll('#conv-log li').length > n,
        before, { timeout: 60000, polling: 300 }).catch(() => {});
      await sleep(3500);
    }
    await page.evaluate(() => document.querySelector('#conv-close')?.click());
  },
};

const results = [];
try {
  for (const [id, drive] of Object.entries(CLIPS)) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    // makeHelpers は録画の設定を渡せないので、ここだけ自分でコンテキストを作る。
    // Playwright は**コンテキストを閉じたとき**に動画を書き出すので、1本ずつ閉じる。
    const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: TMP, size: SIZE } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [${id}] pageerror`, e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await page.click('#avatar-confirm');
    await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await page.fill('#net-name', 'みほん');
    await page.fill('#net-class', 'tour');
    await page.click('#net-join');
    await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'),
      null, { timeout: 120000, polling: 250 });
    // **相棒を選んでいない子は飛べない。** rpg.fly() の最初の行がそれで、選んでいないと
    // 冒険ノートを開いて false を返す（島が willow のままになる）。lib/walk.mjs の
    // openPage がやっているのと同じことを、ここでもやる。
    await page.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
    });
    // 島の描画は軽いほうに。録画の1コマ1コマがこの端末では高い。
    await page.evaluate(() => document.querySelector('#quality-toggle')?.click());
    await sleep(1200);
    console.log(`  recording ${id} …`);
    const t0 = Date.now();
    await drive(page);
    const took = (Date.now() - t0) / 1000;
    await ctx.close();                       // ここで初めて .webm が書かれる
    const file = readdirSync(TMP).find((f) => f.endsWith('.webm'));
    const dest = path.join(OUT, `clip-${id}.webm`);
    renameSync(path.join(TMP, file), dest);
    results.push({ id, took, mb: (await import('node:fs')).statSync(dest).size / 1e6 });
    console.log(`  docs/clips/clip-${id}.webm  ${took.toFixed(0)}s  ${results.at(-1).mb.toFixed(1)} MB`);
  }
} catch (err) {
  console.log('CLIP ERROR', err);
  process.exitCode = 1;
} finally {
  rmSync(TMP, { recursive: true, force: true });
  await browser.close();
  server.kill('SIGTERM');
}
