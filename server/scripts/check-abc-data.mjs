// 「ABC と おと」の 中身（src/game/abc-data.json）を たしかめる：node scripts/check-abc-data.mjs
import { abcProblems, loadAbcData } from '../src/game/abc-art.js';
const data = loadAbcData();
const bad = abcProblems(data);
for (const b of bad) console.log(`✗ ${b}`);
const n = (o) => Object.values(o).reduce((s, l) => s + l.length, 0);
console.log(`文字 ${Object.keys(data.letters).length}・3 文字の ことば ${data.cvc.length}・2 文字の おと ${n(data.digraphs)}・ながい おと ${n(data.magicE)}`, bad.length ? `だめ ${bad.length}` : 'OK');
console.log(`じゅんばん: ${data.order.join(' ')}`);
process.exit(bad.length ? 1 : 0);
