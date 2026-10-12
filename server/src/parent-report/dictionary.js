// 英単語 → 日本語の いみ。保護者レポートの「今週おぼえた単語」「次に覚える単語」の 下に 出す。
//
// 新しい 辞書は 作らない：サーバーに もう ある 問題データ（ことばのジム・つり島・バトル・英単語ハウスの
// 1 語の 問題）から 拾う。どれにも 無い 語は いみ なし（英語だけ 出す）。まちがった いみを 出すより よい。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { englishWord } from '../game/review.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => { try { return JSON.parse(readFileSync(path.join(here, '../game', name), 'utf8')); } catch { return null; } };
const hasJa = (s) => /[぀-ヿ一-鿿]/.test(String(s || ''));

let cache = null;
export function dictionary() {
  if (cache) return cache;
  const map = new Map();
  const put = (en, ja) => {
    const w = englishWord(en);
    if (!w || !hasJa(ja) || map.has(w)) return;
    map.set(w, String(ja).trim().slice(0, 24));
  };
  for (const w of load('gym-words.json')?.words || []) put(w.en, w.ja);
  const fw = load('fishworld-quiz.json')?.quiz || {};
  for (const list of Object.values(fw)) for (const q of list || []) put(q.q, q.a);
  for (const q of load('battle-bank.json')?.questions || []) put(q.q, q.choices?.[q.answer]);
  cache = map;
  return map;
}

export const meaningOf = (word) => dictionary().get(englishWord(word)) || '';
