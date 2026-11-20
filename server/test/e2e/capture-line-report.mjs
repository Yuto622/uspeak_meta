// 紹介動画の「LINE で とどく 保護者レポート」の 見本を 作る（docs/figures/tour-line-*.jpg）。
//
// 本物の 子どもの 記録は 出せないので、架空の 1 人（さくら）の 5 週間を 作り、
// 本番と 同じ 道（weeklyData / monthlyData → weeklyTex / monthlyTex → xelatex → PNG）で 組む。
//
// Run: node test/e2e/capture-line-report.mjs      （xelatex と pdftoppm が 要る）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

process.env.LOG_LEVEL = 'error';
const { weeklyData, monthlyData } = await import('../../src/parent-report/aggregate.js');
const { jstMidnight, weekOf, monthOf, HOUR } = await import('../../src/parent-report/jst.js');
const { weeklyTex, monthlyTex } = await import('../../src/parent-report/render-tex.js');
const { compileTex } = await import('../../src/parent-report/render.js');
const { fiveText } = await import('../../src/parent-report/line.js');

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../docs/figures');

const at = (y, m, d, h = 18, mi = 0) => jstMidnight(y, m, d) + h * HOUR + mi * 60000;
let seq = 0;
const row = (ts, type, data, world = 'hut') => ({ id: `e${seq += 1}`, ts, type, world, username: 'sakura', place_id: 'web', data_json: JSON.stringify(data) });
const WORDS = ['dog', 'cat', 'apple', 'book', 'pen', 'fish', 'bird', 'milk', 'rain', 'sun', 'tree', 'ship', 'cake', 'bike', 'moon', 'star', 'egg', 'hat', 'bus', 'cup'];
const rows = [];
// 10/1〜10/31 の 平日に 少しずつ。正解率は だんだん 上がる。
for (let d = 1; d <= 31; d += 1) {
  const dow = new Date(Date.UTC(2026, 9, d)).getUTCDay();
  if (dow === 0 || (dow === 3 && d % 2)) continue;
  const rate = 0.6 + d / 100;
  for (let i = 0; i < 9; i += 1) {
    const w = WORDS[(d * 3 + i) % WORDS.length];
    rows.push(row(at(2026, 10, d, 17, i), 'quiz', { word: w, correct: ((d * 7 + i * 13) % 100) / 100 < rate, format: 'mc', level: 'Easy', grade: 'g5' }));
  }
  rows.push(row(at(2026, 10, d, 17, 30), 'session', { seconds: 900 + (d % 4) * 240 }));
  if (d % 2) rows.push(row(at(2026, 10, d, 17, 40), 'speak', { text: 'hello' }, 'conv'));
  if (d % 3 === 0) rows.push(row(at(2026, 10, d, 17, 50), 'book', { book: `rd-${d}`, title: ['Hungry Bear', 'The Little Cloud', 'My Red Kite', 'Lost in the Park', 'A Day at the Sea'][d % 5], stage: 'B', words: 50 }, 'reading'));
}
const teacher = { text: 'さくらさん、今週は 毎日 がんばりました。英会話で 自分から 話しかけられる ように なっています。' };
const week = weekOf(at(2026, 10, 28));
const month = monthOf(at(2026, 10, 15));
const w = weeklyData(rows, { week, nick: 'さくら', sender: 'U-Speak 英語教室', teacher });
const m = monthlyData(rows, { month, nick: 'さくら', sender: 'U-Speak 英語教室', teacher });

const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-line-'));
try {
  const wk = await compileTex(weeklyTex(w), { kind: 'weekly' });
  await writeFile(path.join(dir, 'weekly.png'), wk.png);
  const mo = await compileTex(monthlyTex(m), { kind: 'monthly' });
  await writeFile(path.join(dir, 'monthly.pdf'), mo.pdf);
  await run('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', 'monthly.pdf', 'monthly'], { cwd: dir });
  const bubble = fiveText(w.five, { nick: 'さくら', label: '今週' }) || '';
  await writeFile(path.join(dir, 'bubble.txt'), bubble);
  // 絵に するのは python（Pillow）：資料の 図と 同じ 1280×800。
  await run('python3', [path.join(here, 'lib', 'line-figure.py'), dir, OUT], { timeout: 60000 });
  console.log('  docs/figures/tour-line-weekly.jpg / tour-line-monthly.jpg');
} finally {
  await rm(dir, { recursive: true, force: true });
}
