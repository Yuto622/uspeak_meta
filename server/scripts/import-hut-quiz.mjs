// Roblox の小屋（英単語ハウス）の問題を、サーバーだけが読む hut-quiz.json にする。
//
//   node server/scripts/import-hut-quiz.mjs EXPORT_Hut_1.luau EXPORT_Hut_2.luau [...]
//
// Roblox の書き出しは 1 つの JSON を いくつかのファイルに切って出す（文字は Shift_JIS）。
// 渡した順につないで読み、使えない問題を外して server/src/game/hut-quiz.json に書く。
// 外すもの：書き出しが自分で挙げた issues（「全部」型・選択肢3つ・同じ選択肢）、選択肢が 4 つそろわない・
// 同じ選択肢がある・正解が選択肢に無い・「all of them」が選択肢にある、同じレベルの同じ問題文（2 つめ以降）。
// **このファイルは client/dist に置かないこと**（答えつき）。
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: import-hut-quiz.mjs <export parts in order>'); process.exit(1); }

const bytes = Buffer.concat(files.map((f) => readFileSync(f)));
let text;
try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('shift_jis').decode(bytes); }
const raw = JSON.parse(text);
if (!raw.levels || typeof raw.levels !== 'object') throw new Error('no "levels" in the export');

const ORDER = ['SuperEasy', 'Easy', 'Medium', 'Hard'];
const flagged = new Set((raw.issues || []).map((i) => `${i.level}\u0000${i.q}`));
const levels = {};
const dropped = [];
for (const level of ORDER) {
  const list = raw.levels[level];
  if (!Array.isArray(list)) throw new Error(`no level ${level} in the export`);
  const seen = new Set();
  levels[level] = [];
  for (const x of list) {
    const q = String(x.q ?? '').trim();
    const o = ['A', 'B', 'C', 'D'].map((k) => String(x[k] ?? '').trim());
    const a = String(x[x.correct] ?? '').trim();
    const issue = (raw.issues || []).find((i) => i.level === level && i.q === x.q);
    let why = '';
    if (flagged.has(`${level}\u0000${x.q}`)) why = issue?.why || 'flagged';
    else if (!q) why = 'no question';
    else if (o.some((c) => !c)) why = 'missing choice';
    else if (new Set(o.map((c) => c.toLowerCase())).size < 4) why = 'same choice twice';
    else if (!a || a !== String(x.answer ?? '').trim()) why = 'answer is not a choice';
    else if (o.some((c) => /^all of (them|the above)$/i.test(c))) why = 'all-of-them';
    else if (seen.has(q)) why = 'duplicate question';
    if (why) { dropped.push({ level, q, why }); continue; }
    seen.add(q);
    levels[level].push({ q, a, o });
  }
}

const out = {
  version: raw.version ?? 1,
  source: 'Roblox WordHouse (hut) export',
  exportedAt: raw.exportedAt || '',
  note: 'Server only — answers included. Do not copy into client/dist. Rebuild with server/scripts/import-hut-quiz.mjs.',
  levels,
  dropped,
};
const target = new URL('../src/game/hut-quiz.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(out, null, 1)}\n`);
for (const level of ORDER) console.log(`${level}: ${levels[level].length} (from ${raw.levels[level].length})`);
const why = {};
for (const d of dropped) why[d.why] = (why[d.why] || 0) + 1;
console.log('dropped', dropped.length, why);
