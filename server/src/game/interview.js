// 面接の間 — the fifth building on each 英検 island, and the only one that talks back.
//
// The four halls ask a child to choose, to build or to say one sentence. This is the
// other half of the exam: sit down, read a passage out loud, and answer questions about
// it, about a picture, and about yourself — in that order, because that is the order the
// real second stage goes in.
//
// Everything that decides anything is here. The page sends what the microphone heard and
// nothing else: it never says whether it was right, it is never told the model answer
// before it answers, and it cannot skip a step. The bank (interview-bank.json) never
// reaches a browser.
//
// ウーピー's manner — "Good!", "Let's try the next one" — is written by ai/tutor.js when
// there is an API key and by the script below when there is not. Neither of them decides
// the mark: a friendly AI that says "perfect!" must not be able to pay a child.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GRADES, judgeSpoken } from './eiken.js';
import { GRADE_RATE } from './progression.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const INTERVIEW_BANK_PATH = path.resolve(here, 'interview-bank.json');

export const KINDS = ['passage', 'picture', 'self'];
// What a whole interview is worth. Deliberately close to a set of five in one of the
// halls: this takes about as long, and asks for more.
export const INTERVIEW_XP = { read: 10, answer: 12, finish: 20 };
export const INTERVIEW_COINS = 30;
// The exam is not a place to hurry: a child gets as long as they like on a question, but
// a page cannot answer one twice, and an interview left open all day is closed.
export const INTERVIEW_MAX_MS = 20 * 60 * 1000;

export class InterviewError extends Error {}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// ---- the bank --------------------------------------------------------------------------

export function loadInterviewBank(file = INTERVIEW_BANK_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const grades = {};
  for (const grade of GRADES) {
    const source = raw.grades?.[grade];
    if (!source) throw new Error(`interview-bank.json: no ${grade}`);
    const cards = source.cards || [];
    // Two cards is the minimum that makes a second go different from the first.
    if (cards.length < 2) throw new Error(`interview-bank.json: ${grade} needs at least two cards`);
    const seen = new Set();
    for (const card of cards) {
      const where = `${grade}/${card.id || '?'}`;
      if (!text(card.id) || seen.has(card.id)) throw new Error(`interview-bank.json: ${where} has a missing or repeated id`);
      seen.add(card.id);
      if (!text(card.passage)) throw new Error(`interview-bank.json: ${where} has no passage to read`);
      if (!text(card.ja)) throw new Error(`interview-bank.json: ${where} has no Japanese for the passage`);
      const steps = card.steps || [];
      if (steps.length < 3) throw new Error(`interview-bank.json: ${where} needs at least three questions`);
      for (const [i, step] of steps.entries()) {
        const at = `${where}[${i}]`;
        if (!KINDS.includes(step.kind)) throw new Error(`interview-bank.json: ${at} has unknown kind "${step.kind}"`);
        if (!text(step.q) || !text(step.ja)) throw new Error(`interview-bank.json: ${at} is missing its question`);
        if (!text(step.model)) throw new Error(`interview-bank.json: ${at} has no model answer`);
        if (!Array.isArray(step.keys) || !step.keys.length) throw new Error(`interview-bank.json: ${at} has nothing to mark against`);
        for (const group of step.keys) {
          if (!Array.isArray(group) || !group.length || group.some((k) => !text(k))) {
            throw new Error(`interview-bank.json: ${at} has an empty group of key words`);
          }
        }
        if (step.kind === 'picture' && !text(step.scene)) throw new Error(`interview-bank.json: ${at} is about a picture nobody described`);
      }
    }
    grades[grade] = { title: text(source.title), howto: text(source.howto), cards };
  }
  return grades;
}

export const INTERVIEW = loadInterviewBank();

// ---- marking -----------------------------------------------------------------------------

// What a microphone heard, with everything that is not a word taken out. Speech
// recognition gives no punctuation and inconsistent case, so neither may matter.
const normalise = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const wordCount = (s) => (normalise(s) ? normalise(s).split(' ').length : 0);

// A question is answered when every group of key words has one of its words in the
// answer: "soccer" and "play" both have to be there, but "plays" will do for "play".
// Groups are how a mark stays generous about wording and strict about content.
export function markAnswer(step, heard) {
  const said = ` ${normalise(heard)} `;
  const words = wordCount(heard);
  const need = Number(step.minWords) || (step.kind === 'self' ? 2 : 1);
  const missing = [];
  for (const group of step.keys) {
    const hit = group.some((k) => said.includes(` ${normalise(k)} `) || (normalise(k).includes(' ') && said.includes(` ${normalise(k)} `)));
    if (!hit) missing.push(group[0]);
  }
  // Too short is its own answer: "yes" to "tell me more" is not telling anybody more.
  if (words < need) return { correct: false, reason: 'short', missing, words };
  if (missing.length) return { correct: false, reason: 'missing', missing, words };
  return { correct: true, reason: 'ok', missing: [], words };
}

// 音読 is marked like the 話す hall marks a sentence: the same judge, so a child who has
// practised there knows what this room expects.
export function markReading(passage, heard) {
  const verdict = judgeSpoken(passage, heard);
  return { ...verdict, words: wordCount(heard) };
}

// ---- a sitting ---------------------------------------------------------------------------

export function startInterview(grade, { random = Math.random, now = Date.now(), avoid = '' } = {}) {
  const bank = INTERVIEW[grade];
  if (!bank) throw new InterviewError('unknown grade');
  // Not the same card twice in a row, so a second go is a second interview.
  const pool = bank.cards.filter((c) => c.id !== avoid);
  const card = (pool.length ? pool : bank.cards)[Math.floor(random() * (pool.length || bank.cards.length))];
  return {
    grade,
    cardId: card.id,
    card,
    stage: 'read',          // read -> ask -> done
    at: 0,                  // which question
    startedAt: now,
    marks: [],              // one per stage, in order
    said: [],               // what the child said, for the log and the result card
  };
}

// What the page may know at each point: the passage (it has to be read aloud), and the
// question it is on. Never the model answer, never the key words, never what is coming.
export function interviewPayload(session) {
  const card = session.card;
  const step = session.stage === 'ask' ? card.steps[session.at] : null;
  return {
    grade: session.grade,
    title: INTERVIEW[session.grade].title,
    howto: INTERVIEW[session.grade].howto,
    card: { id: card.id, title: card.title || '', passage: card.passage, ja: card.ja },
    stage: session.stage,
    at: session.at,
    of: card.steps.length,
    question: step ? { kind: step.kind, q: step.q, ja: step.ja, scene: step.scene || '', emoji: step.emoji || '' } : null,
  };
}

// One turn. `heard` is what the microphone made of it — or what a child typed, on a
// tablet whose microphone a school has turned off.
export function interviewStep(session, heard, { now = Date.now() } = {}) {
  if (session.stage === 'done') return { ok: false, reason: 'finished' };
  if (now - session.startedAt > INTERVIEW_MAX_MS) {
    session.stage = 'done';
    return { ok: false, reason: 'time' };
  }
  const said = String(heard ?? '').slice(0, 400);
  if (session.stage === 'read') {
    const mark = markReading(session.card.passage, said);
    session.marks.push({ kind: 'read', correct: mark.correct, close: mark.close });
    session.said.push({ kind: 'read', said });
    session.stage = 'ask';
    session.at = 0;
    return {
      ok: true,
      kind: 'read',
      correct: mark.correct,
      close: mark.close,
      xp: mark.correct ? INTERVIEW_XP.read : 0,
      passage: session.card.passage,
      next: interviewPayload(session),
      done: false,
    };
  }
  const step = session.card.steps[session.at];
  if (!step) return { ok: false, reason: 'finished' };
  const mark = markAnswer(step, said);
  session.marks.push({ kind: step.kind, correct: mark.correct, reason: mark.reason });
  session.said.push({ kind: step.kind, q: step.q, said });
  session.at += 1;
  const done = session.at >= session.card.steps.length;
  if (done) session.stage = 'done';
  return {
    ok: true,
    kind: step.kind,
    correct: mark.correct,
    reason: mark.reason,
    xp: mark.correct ? INTERVIEW_XP.answer : 0,
    // Only now: the model answer and the hint. Before answering, a child gets neither.
    model: step.model,
    hint: step.hint || '',
    next: done ? null : interviewPayload(session),
    done,
  };
}

// The card at the end. 英検 gives a number out of a total; so does this, with the number
// of stages as the total, and the reward scaled by the grade the same way the halls are.
export function interviewResult(session) {
  const total = session.marks.length;
  const right = session.marks.filter((m) => m.correct).length;
  const rate = GRADE_RATE[session.grade] || 1;
  const finished = session.stage === 'done';
  const perfect = finished && right === total && total > 0;
  const xp = session.marks.reduce((sum, m) => sum + (m.correct ? (m.kind === 'read' ? INTERVIEW_XP.read : INTERVIEW_XP.answer) : 0), 0)
    + (finished ? INTERVIEW_XP.finish : 0);
  return {
    grade: session.grade,
    cardId: session.cardId,
    right,
    total,
    perfect,
    // Coins are for sitting the whole interview, not for each answer: the point is to get
    // to the end without stopping, which is the thing that is hard about a real one.
    coins: finished ? Math.round(INTERVIEW_COINS * rate) : 0,
    xp: Math.round(xp * rate),
    marks: session.marks.map((m) => ({ kind: m.kind, correct: m.correct })),
  };
}

// What ウーピー says between questions when there is no API key. The AI says it better;
// this says it every time.
const SCRIPT = {
  read: {
    yes: ['Good reading! Now, some questions.', 'Very nice. Let\'s begin the questions.'],
    no: ['Thank you. Let\'s go on to the questions.', 'OK! Now, some questions.'],
  },
  answer: {
    yes: ['Good!', 'That\'s right!', 'Very good.', 'Nice answer!'],
    no: ['Thank you.', 'I see. Let\'s go on.', 'OK, next one.'],
  },
  end: {
    yes: ['Well done! That is the end of the test.', 'Excellent. This is the end of the test.'],
    no: ['Thank you. This is the end of the test.', 'That is all. Thank you very much.'],
  },
};

export function scriptedLine(where, correct, pick = Math.random) {
  const lines = SCRIPT[where]?.[correct ? 'yes' : 'no'] || SCRIPT.answer.no;
  return lines[Math.floor(pick() * lines.length)];
}
