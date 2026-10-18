// 営業用デモ動画：保護者レポート（スマホ）を 上から 下へ スクロールして 1 コマずつ 撮る。架空の クラス（browser-infra2.mjs と 同じ）。
//   node test/e2e/demo-report.mjs <outdir>
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
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2733;
const SECRET = 'infra2-only-secret';
const KEY = 'infra2key12345';
const KLASS = 'treebell-b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const out = process.argv[2];
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'file', DATA_DIR: dir, TEACHER_KEY: KEY, REPORT_SECRET: SECRET,
    PUBLIC_SERVER_URL: `http://127.0.0.1:${PORT}`, LOG_LEVEL: 'error' },
  stdio: 'ignore',
});
await waitForServer(PORT);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.5 });
  const p = await ctx.newPage();
  await p.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  await p.goto(`http://127.0.0.1:${PORT}${reportPath(SECRET, KLASS, 'さくら')}`, { waitUntil: 'load' });
  await sleep(800);
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const FPS = 15, SEC = Number(process.env.DUR || 10), n = FPS * SEC, hold = FPS * 1.2;
  const stop = Math.min(max, 2600);
  for (let i = 0; i < n; i += 1) {
    const k = Math.min(1, Math.max(0, (i - hold) / (n - hold * 2)));
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await p.evaluate((y) => window.scrollTo(0, y), Math.round(stop * ease));
    await p.screenshot({ path: path.join(out, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
  }
  console.log('report frames', n, 'scroll', stop, 'of', max);
} finally { await browser.close(); server.kill(); await rm(dir, { recursive: true, force: true }); }
