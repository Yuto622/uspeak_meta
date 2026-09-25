// 教室さま向け資料（docs/uspeak-infra.tex）に載せる画面の写真を撮る。
//
// **本物の子どもの記録は資料に出せない**ので、架空の一人（さくら・treebell-a）を
// 記録ファイルに書き、**そのファイルを本番と同じサーバーに読ませて**撮ります。
// 画面を作っているのは本番と同じコードで、数字だけが架空です。
//
//   node test/e2e/capture-infra.mjs
//
// 出るもの（docs/figures/）:
//   infra-report.jpg     保護者レポート（保護者が開くページ）
//   infra-dash.jpg       マイページ（子どもが開く画面）
//   infra-teacher.jpg    先生コンソール
//   infra-links.jpg      レポートのリンク一覧と CSV のボタン
//   infra-island-en.jpg  島（英語）
//   infra-island-ja.jpg  島（日本語）
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';
import { reportPath } from '../../src/game/report.js';
import { monthKey } from '../../src/game/months.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const OUT = path.resolve(serverDir, '../docs/figures');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2721;
const SECRET = 'figures-only-secret';
const KLASS = 'treebell-a';
const NAME = 'さくら';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 架空の一人 ---------------------------------------------------------------------
// 小4が半年つづけたくらい。月ごとの箱は、いまの月から順に5か月ぶん。
const day = (mk, d) => `${mk}-${String(d).padStart(2, '0')}`;
const month = (mk, days, answers, correct, minutes) => ({
  answers, correct, xp: answers * 6, coins: answers * 4, seconds: minutes * 60,
  days: Array.from({ length: days }, (_, i) => day(mk, 2 + i * 3)),
});
const now = Date.now();
const back = (n) => monthKey(now - n * 30 * 24 * 3600 * 1000);
const months = {
  [back(0)]: month(back(0), 8, 62, 48, 41),
  [back(1)]: month(back(1), 9, 74, 55, 47),
  [back(2)]: month(back(2), 7, 58, 40, 33),
  [back(3)]: month(back(3), 10, 88, 59, 52),
  [back(4)]: month(back(4), 6, 46, 28, 25),
};
const record = {
  class: KLASS, name: NAME, role: 'student',
  level: 7, xp: 45, total_xp: 645, coins: 1240,
  correct: 351, attempts: 428, chats: 96, catches: 61,
  study_ms: 198 * 60 * 1000, study_days: 40,
  login_streak: 9, login_day: 0, week_key: 0, week_xp: 0,
  dex_json: JSON.stringify(Array.from({ length: 23 }, (_, i) => `fish-${i + 1}`)),
  // 5技能は `{a: 挑戦, c: 正解}`（server/src/game/skills.js）。かく（ならべかえ）が
  // いちばん少ない子にしてある — マイページの「つぎは かく を やってみよう」が出る形。
  skills_json: JSON.stringify({
    listen: { a: 74, c: 55 }, speak: { a: 52, c: 33 }, read: { a: 108, c: 92 },
    write: { a: 41, c: 24 }, think: { a: 153, c: 147 },
  }),
  months_json: JSON.stringify(months),
  inventory_json: '{}', owned_json: '[]', wands_json: '[]', missions_json: '[]',
  last_seen: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
};
// クラスに一人だけだと名簿も CSV もさみしいので、同級生を数人。
const classmate = (name, level, correct, attempts, coins) => ({
  ...record, name, level, correct, attempts, coins,
  months_json: JSON.stringify({ [back(0)]: month(back(0), 5, 38, 25, 22) }),
});

const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-infra-'));
await writeFile(path.join(dir, 'store.json'), JSON.stringify({
  players: {
    [`${KLASS}|${NAME}`]: record,
    [`${KLASS}|はると`]: classmate('はると', 5, 208, 266, 730),
    [`${KLASS}|ゆい`]: classmate('ゆい', 8, 402, 470, 1580),
    [`${KLASS}|そうた`]: classmate('そうた', 4, 133, 190, 410),
  },
  learning: [], coins: [],
}), 'utf8');

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(PORT), STORE_BACKEND: 'file', DATA_DIR: dir,
    TEACHER_KEY: 'figurekey12345', REPORT_SECRET: SECRET,
    // **ここを本番のURLにしてはいけない。** `/config.js` がこの値をブラウザーに渡すので、
    // 手元のサーバーではなく fly.dev につなぎに行き、いつまでもオンラインにならない
    // （実際にそうなった）。リンクの見た目だけ、撮る直前に DOM で直す。
    PUBLIC_SERVER_URL: `http://127.0.0.1:${PORT}`, LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

try {
  // ---- 1. 保護者レポート ------------------------------------------------------------
  // 保護者が実際に開くページ。スマートフォンの幅で撮る。
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 1180 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
    await page.goto(`http://127.0.0.1:${PORT}${reportPath(SECRET, KLASS, NAME)}`, { waitUntil: 'load', timeout: 60000 });
    await sleep(600);
    // 累計の下半分は前からあるものなので、**新しいところだけ**を切り出す。
    await page.screenshot({ path: path.join(OUT, 'infra-report.jpg'), type: 'jpeg', quality: 92,
      clip: { x: 0, y: 0, width: 430, height: 620 }, timeout: 120000 });
    console.log('  infra-report.jpg');
    await ctx.close();
  }

  // ---- 2〜6. ゲームの中の画面 --------------------------------------------------------
  // **クリックは evaluate で押す。** Playwright の click は「動いていないこと」を待つが、
  // このコンテナは1秒に数コマで、もう1枚のページが島を描いていると キャラえらびの
  // プレビューが止まらず、30秒待って落ちる（実際に落ちた）。押せれば足りる。
  async function join(name, { klass = KLASS, teacherKey = '', viewport = { width: 1180, height: 820 } } = {}) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
    page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await page.evaluate(() => document.querySelector('#avatar-confirm').click());
    await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await page.evaluate(([n, k, key]) => {
      document.querySelector('#net-name').value = n;
      document.querySelector('#net-class').value = k;
      if (key) {
        document.querySelector('#net-teacher-details').open = true;
        document.querySelector('#net-key').value = key;
      }
      document.querySelector('#net-join').click();
    }, [name, klass, teacherKey]);
    await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'),
      null, { timeout: 60000, polling: 250 });
    await page.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
    });
    await sleep(500);
    return page;
  }

  // 子どもの画面。**記録ファイルにいる「さくら」として入る**ので、マイページに出るのは
  // その記録そのもの（部屋が store から読んだもの）。
  const child = await join(NAME, { viewport: { width: 1000, height: 1220 } });
  await child.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await child.evaluate(() => uspeak.net.dash.open());
  await child.waitForFunction(() => document.querySelector('#dash-dialog .dash-month'), null, { timeout: 60000, polling: 300 });
  await sleep(1200);
  await child.locator('#dash-dialog').screenshot({ path: path.join(OUT, 'infra-dash.jpg'), type: 'jpeg', quality: 92, timeout: 120000 });
  console.log('  infra-dash.jpg');
  await child.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });

  // 先生の画面。名簿に子どもが並んでいてほしいので、**子どもは入れたまま**。
  // ただし窓は小さくしておく：1000x1220 を2倍解像度で描き続けている裏で もう1枚
  // 立ち上げると、キャラえらびの画面が4分たっても出てこない（実際に出なかった）。
  await child.setViewportSize({ width: 320, height: 480 });
  await sleep(1500);
  const teacher = await join('先生', { teacherKey: 'figurekey12345', viewport: { width: 1180, height: 900 } });
  await teacher.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await teacher.evaluate(() => document.querySelector('#net-teacher-button').click());
  await teacher.waitForSelector('#net-teacher:not([hidden])', { timeout: 30000 });
  await sleep(1500);
  await teacher.locator('#net-teacher').screenshot({ path: path.join(OUT, 'infra-teacher.jpg'), type: 'jpeg', quality: 92, timeout: 120000 });
  console.log('  infra-teacher.jpg');

  // レポートのリンクと CSV。**URL は資料に写るので、ここでは伏せ字にする**
  // （見本の署名でも、本物のリンクの形を紙に残す意味はない）。
  await teacher.evaluate(() => document.querySelector('#net-t-reports').click());
  await teacher.waitForSelector('#net-teacher .net-t-link', { timeout: 30000 });
  await sleep(800);
  await teacher.evaluate(() => {
    // ホスト名は本番のもの（撮影用サーバーの 127.0.0.1 が資料に写らないように）、
    // 署名は伏せ字に（見本の署名でも、リンクの形を紙に残す意味はない）。
    for (const i of document.querySelectorAll('#net-teacher .net-t-link input')) {
      i.value = i.value.replace(/^https?:\/\/[^/]+/, 'https://uspeak-multiplayer.fly.dev').replace(/\?t=.*$/, '?t=••••••••');
    }
    const csv = document.querySelector('#net-teacher .net-t-csv');
    if (csv) csv.removeAttribute('href');
  });
  await teacher.locator('#net-teacher').screenshot({ path: path.join(OUT, 'infra-links.jpg'), type: 'jpeg', quality: 92, timeout: 120000 });
  console.log('  infra-links.jpg');
  await teacher.context().close();       // 島を2枚同時に描かせない

  // ---- 島の看板（英語と日本語） --------------------------------------------------------
  await child.setViewportSize({ width: 1180, height: 760 });
  await child.evaluate(async () => {
    uspeak.rpg.fly('school'); uspeak.rpg.finishFlight();
    await uspeak.rpg.school.ready;
  });
  await child.waitForFunction(() => uspeak.rpg.state.current === 'school', null, { timeout: 60000, polling: 300 });
  await sleep(6000);
  await child.screenshot({ path: path.join(OUT, 'infra-island-en.jpg'), type: 'jpeg', quality: 90, timeout: 180000 });
  console.log('  infra-island-en.jpg');
  // **1秒に数コマなので、焼き直しが画面に出るまで待つ。** 早く撮ると前の言語のまま写る。
  await child.evaluate(() => document.querySelector('#lang-toggle').click());
  await sleep(10000);
  await child.screenshot({ path: path.join(OUT, 'infra-island-ja.jpg'), type: 'jpeg', quality: 90, timeout: 180000 });
  console.log('  infra-island-ja.jpg');
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await rm(dir, { recursive: true, force: true });
}
process.exit(0);
