// 「ABC と おと」の かいた 絵を たしかめる：node scripts/check-abc-words.mjs [ことば…]（なければ ぜんぶ）
// 形（240×240・使える 部品だけ・id の 名前・大きさ）と、abc-data.json の ことばで まだ 絵が ない もの。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawnProblem, loadAbcData } from '../src/game/abc-art.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/game/abc-art-words');
const d = loadAbcData();
const all = new Set([...Object.values(d.letters).flatMap((l) => l.words), ...d.cvc, ...Object.values(d.digraphs).flat(), ...Object.values(d.magicE).flat()].map((w) => w.w));
const want = process.argv.slice(2).length ? process.argv.slice(2) : (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)) : []);
let bad = 0;
for (const w of want) {
  const p = path.join(DIR, `${w}.svg`);
  if (!existsSync(p)) { console.log(`✗ ${w}: ファイルが ない`); bad += 1; continue; }
  const why = drawnProblem(w, readFileSync(p, 'utf8'));
  if (why) { console.log(`✗ ${w}: ${why}`); bad += 1; continue; }
  if (!all.has(w)) console.log(`? ${w}: abc-data.json に ない ことば（使われない）`);
}
const missing = [...all].filter((w) => !existsSync(path.join(DIR, `${w}.svg`)));
console.log(`絵 ${want.length - bad} まい OK${bad ? `・だめ ${bad}` : ''}・まだ 絵が ない ことば ${missing.length}${missing.length && missing.length <= 40 ? `（${missing.join(' ')}）` : ''}`);
process.exit(bad ? 1 : 0);
