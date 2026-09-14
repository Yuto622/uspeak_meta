// 資料に載せる「保護者レポートの見本」を作る。
//
// 本物の子どもの記録は資料に出せないので、**架空の一人**を作って、本番と同じ道
// （reportFor → reportTex → xelatex）で組みます。見本が本物と違って見えることは
// ありません。組んだ2ページを docs/figures/report-page*.jpg にします。
//
// Run: node test/e2e/capture-report.mjs      （xelatex と pdftoppm が要ります）
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { reportFor } from '../../src/game/report.js';
import { reportTex } from '../../src/game/report-tex.js';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../docs/figures');

// 架空の子ども。小4が半年つづけたくらいの数字にしてあります。
const record = {
  name: 'さくら', class: 'treebell-a', level: 7, xp: 45,
  attempts: 428, correct: 351, chats: 96, coins: 1240,
  dex_json: JSON.stringify(Array.from({ length: 23 }, (_, i) => `fish${i}`)),
  garage_json: JSON.stringify(['kick', 'bike']),
  room_json: JSON.stringify({ tier: 1, furniture: Array(7).fill({}), plaza: { blocks: Array(64).fill({}) } }),
  pet_json: JSON.stringify({ name: 'ぽこ', en: 'Poco', xp: 120 }),
  missions_json: JSON.stringify(Array(11).fill('m')),
  lap_best: 38400, login_streak: 9,
  last_seen: new Date().toISOString(),
};

const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-figure-'));
try {
  await writeFile(path.join(dir, 'report.tex'), reportTex(reportFor(record)), 'utf8');
  // TikZ のページ位置は2回通さないと決まらない（1回目は表紙が白いまま出ます）。
  for (let pass = 0; pass < 2; pass += 1) {
    await run('xelatex', ['-no-shell-escape', '-interaction=nonstopmode', 'report.tex'], { cwd: dir, timeout: 60000 });
  }
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=92', '-r', '150', 'report.pdf', 'page'], { cwd: dir });
  for (const n of [1, 2]) {
    await copyFile(path.join(dir, `page-${n}.jpg`), path.join(OUT, `report-page${n}.jpg`));
    console.log(`  report-page${n}.jpg`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
