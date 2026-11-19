// のりもの島の レース（AURORA KART）の ことばの ゲート。
//
// 問題は サーバーが 作り、ブラウザーには「絵文字・日本語・3つの 英語」だけを 送る。
// どれが 正解かは ここに 残すので、コインと 学習記録は サーバーが 決める（ことばの 小屋と 同じ 考え方）。
// 語彙は レースの ゲームに 入って いる もの（client/dist/racers/vocab.js）を そのまま 使う：
// 級ごとに むずかしさが そろって いて、動画の Roblox 版と 同じ「たんご 3たく」に なる。
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { vocabulary } = await import(pathToFileURL(path.resolve(here, '../../../client/dist/racers/vocab.js')).href);

export const KART_GRADES = Object.keys(vocabulary).map(Number).filter((g) => Array.isArray(vocabulary[g]) && vocabulary[g].length >= 6);
export const KART_MAX = 15;
let serial = 0;

export function createKartSession(grade, count, random = Math.random) {
  const g = KART_GRADES.includes(Number(grade)) ? Number(grade) : KART_GRADES.includes(5) ? 5 : KART_GRADES[0];
  const pool = vocabulary[g];
  const n = Math.max(1, Math.min(KART_MAX, Math.floor(Number(count)) || 9));
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const questions = [];
  for (let k = 0; k < n; k += 1) {
    const word = pool[order[k % order.length]];
    const wrong = [];
    for (let guard = 0; wrong.length < 2 && guard < 200; guard += 1) {
      const c = pool[Math.floor(random() * pool.length)];
      if (c[2] !== word[2] && c[1] !== word[1] && !wrong.some((w) => w[2] === c[2])) wrong.push(c);
    }
    const choices = [word, ...wrong].map((w) => w[2]);
    for (let i = choices.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
    questions.push({ emoji: word[0], ja: word[1], en: word[2], choices, answer: choices.indexOf(word[2]) });
  }
  serial += 1;
  return { id: `k${Date.now().toString(36)}${serial}`, grade: g, questions, answered: new Set(), score: 0 };
}

// ブラウザーに 送る 形：正解（answer・en）は 入れない。
export function kartPayload(session) {
  return { id: session.id, grade: session.grade, questions: session.questions.map((q) => ({ emoji: q.emoji, ja: q.ja, choices: q.choices })) };
}

// 1問に 1回だけ。choice が -1（くぐれなかった）なら まちがい。
export function answerKart(session, index, choice) {
  const i = Number(index);
  const q = Number.isInteger(i) ? session.questions[i] : null;
  if (!q || session.answered.has(i)) return null;
  session.answered.add(i);
  const correct = Number(choice) === q.answer;
  if (correct) session.score += 1;
  return { i, correct, answer: q.answer, en: q.en, done: session.answered.size >= session.questions.length };
}
