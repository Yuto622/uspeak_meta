// ことばのジム — listen and speak, ported from Roblox's ListenSpeakGym v5.1.
//
// Two drills, five questions a set:
//   listen  ウーピーが英語で言う → 絵を4つから選ぶ
//   speak   お題の絵と単語を見て → 英語で言う
//
// Roblox's version had the client decide it was right and fire an XP event the server
// paid without checking - 15 XP and 5 coins every 1.2 seconds to anyone who called it.
// Here the server holds the question and does the judging.
//
// Speaking is judged the way Roblox judged it, by edit distance, because speech
// recognition mangles a child's pronunciation and a strict compare would punish them for
// the microphone's mistakes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WORDS_PATH = path.resolve(here, 'gym-words.json');

export const MODES = ['listen', 'speak'];
export const QUESTIONS_PER_SET = 5;      // Roblox: 5問セット制
export const CHOICES = 4;

export class GymError extends Error {}

export function loadWords(file = WORDS_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const words = data.words || [];
  if (words.length < 20) throw new Error('gym-words.json: too few words to draw a set from');
  const seen = new Set();
  for (const [i, w] of words.entries()) {
    for (const key of ['emoji', 'en', 'ja', 'group']) {
      if (typeof w[key] !== 'string' || !w[key]) throw new Error(`gym-words.json: [${i}] is missing ${key}`);
    }
    const en = w.en.toLowerCase();
    if (seen.has(en)) throw new Error(`gym-words.json: "${w.en}" appears twice`);
    seen.add(en);
  }
  return words.map((w) => ({ emoji: w.emoji, en: w.en, ja: w.ja, group: w.group }));
}

export const WORDS = loadWords();

// Levenshtein, capped: the words are short, so this stays cheap.
export function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= t.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[t.length];
}

const normalise = (s) => String(s ?? '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

// How close is close enough. Roblox used edit distance for its "おしい!" - a near miss is
// encouragement, not a pass - and that is the right line: "cut" is not "cat", and saying
// so is the whole point of a speaking drill. So the tolerance for a right answer stays
// tight (one slip per four letters, never more than two, which means none at all for a
// three-letter word), and anything one further out comes back as close.
export function judgeSpoken(target, heard) {
  const want = normalise(target);
  const said = normalise(heard);
  if (!said) return { correct: false, close: false, distance: -1 };   // nothing heard
  // Recognition often returns a sentence; accept the word appearing anywhere in it.
  const words = said.split(' ');
  let best = editDistance(want, said);
  for (const w of words) best = Math.min(best, editDistance(want, w));
  const tolerance = Math.min(2, Math.floor(want.length / 4));
  return { correct: best <= tolerance, close: best <= tolerance + 1, distance: best };
}

export function createSet(mode, random = Math.random) {
  if (!MODES.includes(mode)) throw new GymError('unknown mode');
  const pool = [...WORDS.keys()];
  const questions = [];
  for (let i = 0; i < QUESTIONS_PER_SET; i += 1) {
    const [index] = pool.splice(Math.floor(random() * pool.length), 1);
    const word = WORDS[index];
    if (mode === 'speak') {
      questions.push({ word, choices: null, answer: -1 });
      continue;
    }
    // Distractors from the same category where possible: telling a dog from a cat is a
    // listening test, telling a dog from a bicycle is a guess.
    const sameGroup = WORDS.filter((w) => w.group === word.group && w.en !== word.en);
    const others = WORDS.filter((w) => w.en !== word.en);
    const bag = (sameGroup.length >= CHOICES - 1 ? sameGroup : others).slice();
    const picked = [];
    while (picked.length < CHOICES - 1 && bag.length) picked.push(...bag.splice(Math.floor(random() * bag.length), 1));
    const slots = [word, ...picked];
    for (let j = slots.length - 1; j > 0; j -= 1) {
      const k = Math.floor(random() * (j + 1));
      [slots[j], slots[k]] = [slots[k], slots[j]];
    }
    questions.push({ word, choices: slots, answer: slots.indexOf(word) });
  }
  return { mode, questions, at: 0, correct: 0, startedAt: Date.now() };
}

// What the client is allowed to see. In speak mode that is the word, because the child
// has to read it. In listen mode it is the word too, because the browser has to say it
// out loud - so the answer is derivable there, exactly as it is for the island lessons.
// What the client cannot do either way is decide whether it was right.
export function questionPayload(session) {
  const q = session.questions[session.at];
  if (!q) return null;
  return {
    mode: session.mode,
    index: session.at,
    total: session.questions.length,
    correct: session.correct,
    say: q.word.en,
    ja: session.mode === 'speak' ? q.word.ja : '',
    emoji: session.mode === 'speak' ? q.word.emoji : '',
    choices: q.choices ? q.choices.map((c) => ({ emoji: c.emoji, ja: c.ja })) : null,
  };
}

export function answerSet(session, { choice, text }) {
  const q = session.questions[session.at];
  if (!q) return null;
  let correct = false;
  let close = false;
  if (session.mode === 'listen') {
    correct = Number.isInteger(choice) && choice === q.answer;
  } else {
    const verdict = judgeSpoken(q.word.en, text);
    correct = verdict.correct;
    close = !correct && verdict.close;
  }
  if (correct) session.correct += 1;
  session.at += 1;
  const done = session.at >= session.questions.length;
  return {
    correct,
    close,
    answer: q.answer,
    word: q.word.en,
    ja: q.word.ja,
    emoji: q.word.emoji,
    index: session.at - 1,
    total: session.questions.length,
    score: session.correct,
    done,
    // Roblox showed stars for a set; three of three thresholds keeps that shape.
    stars: done ? (session.correct === session.questions.length ? 3 : session.correct >= 4 ? 2 : session.correct >= 3 ? 1 : 0) : 0,
  };
}
