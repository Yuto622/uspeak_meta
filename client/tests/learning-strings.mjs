// 学習の中身にある日本語を全部あつめる。**英語モードの辞書に当たってはいけない**もの。
//
// 英検の「書く」の日本語文、リスニングの日本語の選択肢、単語の意味、定型文の訳は、
// 日本語であることが問題そのもの。画面ぜんぶを訳す層（`dist/i18n-dom.js`）が
// これを英語にしてしまうと、問題が成立しない（答えが画面に出る）。
// `regression.mjs` がここで集めたものを、辞書で1つも訳せないことを確かめる。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const JA = /[぀-ヿ㐀-鿿]/;

export async function learningStrings() {
  const out = new Set();
  const add = (s) => { if (typeof s === 'string' && JA.test(s)) out.add(s.trim()); };
  const walk = (x, keep) => {
    if (Array.isArray(x)) { for (const v of x) walk(v, keep); return; }
    if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (keep(k)) add(v); if (typeof v === 'object') walk(v, keep); } return; }
  };
  // サーバーの問題バンク（答えはブラウザーに来ないが、問題文と選択肢は来る）。
  walk(json('server/src/game/eiken-bank.json'), (k) => ['q', 'choices', 'ja', 'hint'].includes(k));
  for (const v of Object.values(json('server/src/game/eiken-bank.json').grades)) for (const s of Object.values(v)) for (const q of s) for (const c of q.choices || []) add(c);
  walk(json('server/src/game/word-quiz.json'), () => true);
  walk(json('server/src/game/gym-words.json').words, (k) => k === 'ja');
  try { walk(json('server/src/game/interview-bank.json'), (k) => ['ja', 'hint'].includes(k)); } catch { /* 無ければ無い */ }
  // クライアントの学習データ。
  const { FISH } = await import(root + 'client/dist/fishing-data.js');
  for (const f of FISH) add(f.meaning);
  walk(json('client/dist/night.json').ghosts, (k) => k === 'ja');
  walk(json('client/dist/vehicles.json').course.gates, (k) => k === 'ja');
  for (const v of json('client/dist/vehicles.json').vehicles) add(v.ja);
  walk(json('client/dist/phrases.json'), (k) => k === 'ja');
  for (const m of json('client/dist/missions.json').missions) add(m.requestJa);
  return [...out];
}
