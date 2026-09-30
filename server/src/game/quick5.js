// 今日の5分 — 島まで歩かなくても、どこからでも答えられる5問。
//
// **子ども英語教室の退会理由の1位は「塾が始まるから」**（不満ではなく、時間の奪い合い）。
// 塾の日に島をめぐる30分は取れなくても、5分なら取れる。その5分が記録に残れば、
// 面談で「塾の日でも、おうちで続けられています」と言える（`months.js` の `home`）。
//
// 中身は英検の島と同じ問題（読む3問・聞く2問）で、**採点も同じサーバーがする**。
// 答えはブラウザーに届かない（`eiken.js` の約束をそのまま使う）。
// 級は、その子が次にめざす級（`eiken-ready.js` の `aim`）から出す。
// きびしさは教室の設定（先生が決める）に従う。
import { createSession, GRADES } from './eiken.js';

export const READ_N = 3;
export const LISTEN_N = 2;
export const SIZE = READ_N + LISTEN_N;

export class QuickError extends Error {}

export function createQuick(grade, random = Math.random, level = 'normal') {
  if (!GRADES.includes(grade)) throw new QuickError('unknown grade');
  const r = createSession(grade, 'reading', random, level);
  const l = createSession(grade, 'listening', random, level);
  const questions = [
    ...r.questions.slice(0, READ_N).map((q) => ({ ...q, skill: 'reading' })),
    ...l.questions.slice(0, LISTEN_N).map((q) => ({ ...q, skill: 'listening' })),
  ];
  return { grade, level: r.level, questions, at: 0, correct: 0, answered: [], startedAt: Date.now() };
}

// ページに見せてよいもの。**正解の番号は入れない。**
export function quickPayload(s) {
  const q = s?.questions[s.at];
  if (!q) return null;
  const head = { grade: s.grade, level: s.level, skill: q.skill, index: s.at, total: s.questions.length, correct: s.correct };
  if (q.skill === 'reading') return { ...head, text: q.text, q: q.q, choices: [...q.choices], hint: q.hint || '' };
  return { ...head, say: q.say, q: q.q, choices: [...q.choices] };
}

export function answerQuick(s, given) {
  const q = s?.questions[s.at];
  if (!q) return null;
  const picked = Number.isInteger(given?.choice) ? given.choice : -1;
  const correct = picked === q.answer;
  if (correct) s.correct += 1;
  s.answered.push({ id: q.q, picked, correct });
  s.at += 1;
  const done = s.at >= s.questions.length;
  return {
    correct, picked, answer: q.answer, skill: q.skill, grade: s.grade, level: s.level,
    index: s.at - 1, total: s.questions.length, score: s.correct, done,
    perfect: done && s.correct === s.questions.length,
  };
}
