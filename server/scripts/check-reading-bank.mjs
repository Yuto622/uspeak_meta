// よみもの島の 本を たしかめる：node scripts/check-reading-bank.mjs [ファイル…]（なければ ぜんぶ）
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { problemOf, BANK_DIR, wordsOf } from '../src/game/reading.js';
import { canDraw } from '../src/game/reading-art/render.js';
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : readdirSync(BANK_DIR).filter((n) => n.endsWith('.json')).map((n) => path.join(BANK_DIR, n));
let bad = 0; const ids = new Set(); const by = {}; const pos = [0, 0, 0, 0];
for (const f of files) {
  let b; try { b = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log(`✗ ${path.basename(f)}: JSON ${e.message}`); bad += 1; continue; }
  const why = problemOf(b);
  if (why) { console.log(`✗ ${path.basename(f)}: ${why}`); bad += 1; continue; }
  const undrawn = [b.cover, ...b.pages.map((p) => p.scene)].flatMap((sc) => sc.items.map((it) => it.e)).filter((e) => !canDraw(e));
  if (undrawn.length) { console.log(`✗ ${b.id}: 絵に かけない 絵文字 ${[...new Set(undrawn)].join(' ')}（reading-art/emoji/ に 足す）`); bad += 1; continue; }
  if (ids.has(b.id)) { console.log(`✗ ${b.id}: id が かさなる`); bad += 1; continue; }
  if (path.basename(f) !== `${b.id}.json`) { console.log(`✗ ${path.basename(f)}: ファイル名は ${b.id}.json`); bad += 1; continue; }
  ids.add(b.id); (by[b.stage] ||= []).push(`${b.title}(${b.pages.reduce((s, p) => s + wordsOf(p.text).length, 0)}語)`);
  for (const q of b.quiz) pos[q.choices.indexOf(q.answer)] += 1;
}
for (const [s, l] of Object.entries(by)) console.log(`  ${s}: ${l.join(' / ')}`);
console.log(`本 ${ids.size} さつ・正解の 位置 ${JSON.stringify(pos)}`, bad ? `だめ ${bad}` : 'OK');
process.exit(bad ? 1 : 0);
