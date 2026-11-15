// TOEIC・TOEFL・IELTS の 問題ファイルを たしかめる：node scripts/check-exam-bank.mjs [ファイル…]（なければ ぜんぶ）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { examFiles, problemOf, EXAMS } from '../src/qbank/seed-exams.js';

const args = process.argv.slice(2);
const files = args.length ? args.map((f) => ({ exam: path.basename(path.dirname(path.resolve(f))), file: path.resolve(f) })) : examFiles();
const ids = new Map(); let bad = 0; const total = {}; const pos = {}; const fmt = {};
for (const { exam, file } of files) {
  if (!EXAMS[exam]) { console.log(`✗ ${file}: フォルダは toeic / toefl / ielts`); bad += 1; continue; }
  let list;
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.log(`✗ ${file}: JSON が 読めない ${e.message}`); bad += 1; continue; }
  if (!Array.isArray(list)) { console.log(`✗ ${file}: 配列で ない`); bad += 1; continue; }
  for (const raw of list) {
    const why = problemOf(exam, raw);
    if (why) { bad += 1; console.log(`✗ ${path.basename(file)} ${raw?.id}: ${why}`); continue; }
    if (ids.has(raw.id)) { bad += 1; console.log(`✗ ${raw.id}: id が かさなる（${ids.get(raw.id)}）`); continue; }
    ids.set(raw.id, path.basename(file));
    total[exam] = (total[exam] || 0) + 1;
    const k = `${exam}|${raw.skill}|${raw.format}`; fmt[k] = (fmt[k] || 0) + 1;
    if (raw.choices?.length) { const p = (pos[exam] ||= [0, 0, 0, 0]); p[raw.choices.indexOf(raw.answer)] += 1; }
  }
}
for (const [k, n] of Object.entries(fmt).sort()) console.log(`  ${k}: ${n}`);
console.log('ぜんぶ', JSON.stringify(total), '正解の 位置', JSON.stringify(pos), bad ? `だめ ${bad}` : 'OK');
process.exit(bad ? 1 : 0);
