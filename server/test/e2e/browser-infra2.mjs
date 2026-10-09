// 教室の土台（2）を本物のブラウザーで通す：きょうの5ふん・声かけ・先生のメモ・
// 英検の準会場・教室のようす・面談メモ・学習の記録証。
//
//   node test/e2e/browser-infra2.mjs            （確かめるだけ）
//   FIGURES=1 node test/e2e/browser-infra2.mjs  （資料用の写真も docs/figures/ に撮る）
//
// **子どもの本物の記録は使わない。** 架空のクラス（14人・1年分）を記録ファイルに書き、
// 本番と同じサーバーに読ませる。画面を作っているのは本番と同じコード。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';
import { reportPath, classPath } from '../../src/game/report.js';
import { monthKey } from '../../src/game/months.js';
import { keyMinusMonth } from '../../src/game/retention.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const FIG = process.env.FIGURES ? path.resolve(serverDir, '../docs/figures') : null;
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2733;
const SECRET = 'infra2-only-secret';
const KEY = 'infra2key12345';
const KLASS = 'treebell-b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${what}`); if (!ok) fails.push(what); };

// ---- 架空のクラス ---------------------------------------------------------------------
const now = Date.now();
const DAY = 86400000;
const keys = []; { let k = monthKey(now); for (let i = 0; i < 13; i += 1) { keys.push(k); k = keyMinusMonth(k); } }
const box = (k, days, home = 0, eg5 = 0) => ({
  answers: days * 8, correct: days * 6, xp: days * 40, coins: days * 30, seconds: days * 420,
  days: Array.from({ length: days }, (_, i) => `${k}-${String(2 + i * 3).padStart(2, '0')}`),
  home: Array.from({ length: Math.min(home, days) }, (_, i) => `${k}-${String(2 + i * 3).padStart(2, '0')}`),
  eg: { g5: eg5, g4: 0, g3: 0 },
});
const bits = (r, n) => '1'.repeat(r) + '0'.repeat(n - r);
const ready5 = { g5: { reading: bits(9, 10), listening: bits(8, 10), writing: '', speaking: '' }, g4: { reading: bits(6, 10), listening: bits(5, 10), writing: '', speaking: '' }, g3: { reading: '', listening: '', writing: '', speaking: '' } };
const close5 = { g5: { reading: bits(9, 10), listening: bits(5, 10), writing: '', speaking: '' }, g4: { reading: '', listening: '', writing: '', speaking: '' }, g3: { reading: '', listening: '', writing: '', speaking: '' } };
// 1人ずつ：来た月（keys の番号）と、英検の形。
function kid(name, active, { exam = null, firstDays = 400, lastDays = 1, home = 2, notes = [] } = {}) {
  const months = {};
  for (const i of active) months[keys[i]] = box(keys[i], i === 0 ? 4 : 6, home, 12);
  return {
    class: KLASS, name, role: 'student', level: 6, xp: 20, total_xp: 500, coins: 800,
    correct: 300, attempts: 380, study_ms: 150 * 60000, study_days: 45,
    months_json: JSON.stringify(months), eiken_json: exam ? JSON.stringify(exam) : '',
    notes_json: JSON.stringify(notes),
    skills_json: JSON.stringify({ listen: { a: 60, c: 45 }, speak: { a: 40, c: 25 }, read: { a: 90, c: 80 }, write: { a: 20, c: 12 }, think: { a: 100, c: 95 } }),
    first_seen: new Date(now - firstDays * DAY).toISOString(),
    last_seen: new Date(now - lastDays * DAY).toISOString(), updated_at: new Date(now).toISOString(),
    inventory_json: '{}', owned_json: '[]', wands_json: '[]', missions_json: '[]',
  };
}
const all = (from = 12, to = 0) => Array.from({ length: from - to + 1 }, (_, i) => to + i);
const without = (list, gone) => list.filter((i) => !gone.includes(i));
const shared = [{ kind: 'note', at: new Date(now - 10 * DAY).toISOString(), text: 'ご家庭でも、寝る前の音読を続けてください。とても上手になっています。', share: true, id: 'seed-1' },
  { kind: 'note', at: new Date(now - 9 * DAY).toISOString(), text: '（先生だけ）発表の場面で緊張しやすい。', share: false, id: 'seed-2' }];
const kids = [
  kid('さくら', all(), { exam: ready5, notes: shared, home: 3 }),
  kid('はると', without(all(), [0]), { exam: close5, lastDays: 25 }),
  kid('ゆい', all(), { exam: ready5 }), kid('そうた', all(11), { exam: ready5 }),
  kid('りん', without(all(), [5]), { exam: ready5 }), kid('こはる', all(), { exam: ready5 }),
  kid('いつき', without(all(), [8, 9]), { exam: ready5 }), kid('めい', all(), { exam: ready5 }),
  kid('あおい', all(), { exam: ready5 }), kid('ひなた', all(3), { exam: close5, firstDays: 70 }),
  kid('れん', all(2), { exam: close5, firstDays: 45 }), kid('みお', without(all(), [3]), { exam: close5 }),
  kid('たいが', all(12, 4), { lastDays: 110 }), kid('ことね', all(12, 7), { lastDays: 200 }),
];

const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-infra2-'));
await writeFile(path.join(dir, 'store.json'), JSON.stringify({
  players: Object.fromEntries(kids.map((k) => [`${KLASS}|${k.name}`, k])), learning: [], coins: [],
}), 'utf8');
if (FIG) await mkdir(FIG, { recursive: true });

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'file', DATA_DIR: dir, TEACHER_KEY: KEY, REPORT_SECRET: SECRET,
    PUBLIC_SERVER_URL: `http://127.0.0.1:${PORT}`, LOG_LEVEL: 'error', ANSWER_MIN_INTERVAL_MS: '0' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await waitForServer(PORT);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const base = `http://127.0.0.1:${PORT}`;

async function page(url, width, height, shot = '') {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `${shot || url} は ${width}px で横にはみ出さない（${over}px）`);
  if (FIG && shot) { await p.screenshot({ path: path.join(FIG, shot), type: 'jpeg', quality: 90, fullPage: true, timeout: 120000 }); console.log(`  ${shot}`); }
  return { p, ctx };
}

try {
  // ---- 1. 教室のようす・保護者レポート・面談メモ・記録証 --------------------------------
  for (const w of [390, 1024]) {
    const { p, ctx } = await page(base + classPath(SECRET, KLASS), w, 900, w === 1024 ? 'infra2-class.jpg' : '');
    const text = await p.textContent('body');
    check(/利用継続率/.test(text) && /%/.test(text), `教室のようす（${w}px）：利用継続率が出る`);
    check(/準会場を開ける人数です|届く見込み/.test(text), `教室のようす（${w}px）：英検の準会場の見込み`);
    check(text.includes('はると'), `教室のようす（${w}px）：先月来ていて今月まだの子が名前で出る`);
    check(await p.locator('svg .line').count() === 1, `教室のようす（${w}px）：折れ線が1本`);
    await ctx.close();
  }
  {
    const url = base + reportPath(SECRET, KLASS, 'さくら');
    const { p, ctx } = await page(url, 390, 900, 'infra2-report.jpg');
    const text = await p.textContent('body');
    check(text.includes('英検の目安') && text.includes('中学1年生くらい'), '保護者レポート：英検の目安と中学の目安');
    check(text.includes('寝る前の音読'), '保護者レポート：保護者に見せるメモが「先生から」に出る');
    check(!text.includes('緊張しやすい'), '保護者レポート：先生だけのメモは出ない');
    check(/自分でひらいた日/.test(text), '保護者レポート：おうちの日');
    await ctx.close();
    const meet = await page(`${url}&view=meet`, 1024, 900, 'infra2-meet.jpg');
    const mt = await meet.p.textContent('body');
    check(mt.includes('きょう お話しすること') && !mt.includes('緊張しやすい'), '面談メモ：話すことが上に出て、先生だけのメモは出ない');
    await meet.ctx.close();
    const cert = await page(`${url}&format=cert`, 1024, 760, 'infra2-cert.jpg');
    check((await cert.p.textContent('body')).includes('学習の記録証'), '学習の記録証');
    await cert.ctx.close();
  }

  // ---- 2. 子ども：マイページ → きょうの5ふん ---------------------------------------------
  async function join(name, { teacherKey = '', viewport = { width: 1180, height: 820 } } = {}) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
    p.on('pageerror', (e) => { console.log(`[${name}] pageerror`, e.message); fails.push(`pageerror: ${e.message}`); });
    await p.goto(`${base}/`, { waitUntil: 'commit', timeout: 240000 });
    await p.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await p.evaluate(() => document.querySelector('#avatar-confirm').click());
    await p.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await p.evaluate(([n, k, key]) => {
      document.querySelector('#net-name').value = n;
      document.querySelector('#net-class').value = k;
      if (key) { document.querySelector('#net-teacher-details').open = true; document.querySelector('#net-key').value = key; }
      document.querySelector('#net-join').click();
    }, [name, KLASS, teacherKey]);
    await p.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
    // ホームはメインの島（2D）。この検査は 3D の島を見るので、開いたら閉じる。
    await p.waitForFunction(() => globalThis.uspeak?.net?.main?.isOpen, null, { timeout: 8000, polling: 100 }).catch(() => {});
    await p.evaluate(() => globalThis.uspeak?.net?.main?.close());
    await p.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
    });
    await sleep(500);
    return p;
  }

  const child = await join('さくら', { viewport: { width: 900, height: 900 } });
  await child.evaluate(() => uspeak.net.dash.open());
  await child.waitForSelector('#dash-dialog #dash-quick', { timeout: 60000 });
  const aim = await child.textContent('#dash-dialog .dash-quick');
  check(/英検4級/.test(aim), `マイページ：きょうの5ふんは次にめざす級（4級）から（「${aim.trim().slice(0, 40)}」）`);
  check(/めやすに とどいた/.test(aim), 'マイページ：届いた級を一言そえる');
  if (FIG) await child.locator('#dash-dialog').screenshot({ path: path.join(FIG, 'infra2-dash.jpg'), type: 'jpeg', quality: 90, timeout: 120000 });
  await child.evaluate(() => document.querySelector('#dash-quick').click());
  await child.waitForSelector('#quick-dialog[open] [data-choice]', { timeout: 30000 });
  if (FIG) await child.locator('#quick-dialog').screenshot({ path: path.join(FIG, 'infra2-quick.jpg'), type: 'jpeg', quality: 90, timeout: 120000 });
  let skills = [];
  for (let i = 0; i < 5; i += 1) {
    skills.push(await child.evaluate(() => document.querySelector('#quick-eyebrow').textContent));
    await child.evaluate(() => document.querySelector('#quick-dialog [data-choice="0"]').click());
    await child.waitForSelector('#quick-dialog .quiz-feedback', { timeout: 30000 });
    if (i < 4) {
      await child.evaluate(() => document.querySelector('#quick-next').click());
      await child.waitForFunction(() => !document.querySelector('#quick-dialog .quiz-feedback'), null, { timeout: 30000 });
    }
  }
  check(skills.filter((s) => /READING/.test(s)).length === 3 && skills.filter((s) => /LISTENING/.test(s)).length === 2, `きょうの5ふん：読む3・聞く2（${skills.join(' / ')}）`);
  check(await child.locator('#quick-end').count() === 1, 'きょうの5ふん：5問で終わる');
  await child.evaluate(() => document.querySelector('#quick-end').click());
  await child.setViewportSize({ width: 320, height: 480 });   // 島を2枚同時に描かせない
  await sleep(1500);

  // ---- 3. 先生：気づき → 声をかけた → メモ → 教室のようす -----------------------------------
  const t = await join('先生', { teacherKey: KEY, viewport: { width: 1180, height: 1000 } });
  await t.evaluate(() => document.querySelector('#net-teacher-button').click());
  await t.waitForSelector('#net-teacher .net-t-notice', { timeout: 30000 });
  check(await t.locator('#net-t-exam .net-t-examhead').count() === 1, '先生コンソール：英検の準会場の見込み');
  const callBtn = t.locator('#net-teacher [data-called="はると"]');
  check(await callBtn.count() === 1, '先生コンソール：来ていない子に「声をかけた」ボタン');
  await t.evaluate(() => document.querySelector('#net-teacher [data-called="はると"]').click());
  await t.waitForFunction(() => [...document.querySelectorAll('#net-teacher .net-t-called')].some((x) => /声かけ済み/.test(x.textContent)), null, { timeout: 30000, polling: 250 });
  check(true, '先生コンソール：押すと「声かけ済み」に変わる');

  await t.evaluate(() => document.querySelector('#net-teacher [data-child="はると"]').click());
  await t.waitForSelector('#net-t-child:not([hidden]) #net-t-note-text', { timeout: 30000 });
  await t.waitForFunction(() => /5級/.test(document.querySelector('#net-t-child').textContent), null, { timeout: 30000, polling: 250 });
  check(true, '先生コンソール：名前を押すと英検の目安とメモの画面');
  await t.evaluate(() => {
    document.querySelector('#net-t-note-text').value = 'お休みが続いたので、お母さまに電話。来週から戻る予定。';
    document.querySelector('#net-t-note-save').click();
  });
  await t.waitForFunction(() => /お母さまに電話/.test(document.querySelector('#net-t-child .net-t-notes').textContent), null, { timeout: 30000, polling: 250 });
  check(true, '先生コンソール：メモを残すと一覧に出る');
  check(/声かけ/.test(await t.textContent('#net-t-child .net-t-notes')), '先生コンソール：声かけもメモの一覧に残る');

  await t.evaluate(() => document.querySelector('#net-t-reports').click());
  await t.waitForSelector('#net-teacher .net-t-link', { timeout: 30000 });
  const owner = await t.getAttribute('#net-t-links a[href*="/class/"]', 'href');
  check(!!owner, '先生コンソール：教室のようすのリンク');
  check(await t.locator('#net-t-child a[href*="view=meet"]').count() === 1, '先生コンソール：その子の面談メモのリンク');
  if (FIG) {
    await t.evaluate(() => {
      for (const i of document.querySelectorAll('#net-teacher .net-t-link input')) i.value = i.value.replace(/\?t=.*$/, '?t=••••••••');
    });
    await t.locator('#net-teacher').screenshot({ path: path.join(FIG, 'infra2-teacher.jpg'), type: 'jpeg', quality: 90, timeout: 120000 });
  }
  await sleep(6000);   // 声かけ・メモが保存に乗るまで（STORE_FLUSH）
  const json = await (await fetch(`${owner}&format=json`)).json();
  check(json.calls.total >= 1, `教室のようす：声かけが数えられている（${json.calls.total}）`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await rm(dir, { recursive: true, force: true });
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
