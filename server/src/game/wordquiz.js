// ことばの小屋 — the word quiz, ported from Roblox's WordHouseQuiz v4.7.
//
// The bank lives here, on the server, and never ships to a browser. That is a
// deliberate departure from the other judged data in this project: the lesson and fish
// answer keys sit in client/dist because the client has to render the questions, so a
// determined child can read them. Here the server composes each question and sends only
// the four choices, so there is nothing to read. Roblox worked the same way, and it is
// the reason the word huts are the one activity whose score cannot be looked up.
//
// The cost is that the huts need a connection. That matches the errand quest, and it is
// stated in the docs rather than worked around.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BANK_PATH = path.resolve(here, 'word-quiz.json');

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const QUESTIONS_PER_SESSION = 10;   // Roblox: QUESTIONS_PER_SESSION

export class QuizError extends Error {}

export function loadBank(file = BANK_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const banks = {};
  for (const difficulty of DIFFICULTIES) {
    const list = data.banks?.[difficulty];
    if (!Array.isArray(list) || list.length < QUESTIONS_PER_SESSION) {
      throw new Error(`word-quiz.json: ${difficulty} needs at least ${QUESTIONS_PER_SESSION} questions`);
    }
    banks[difficulty] = list.map((q, i) => {
      const where = `${difficulty}[${i}]`;
      if (typeof q.q !== 'string' || !q.q) throw new Error(`word-quiz.json: ${where} has no question`);
      if (!Array.isArray(q.choices) || q.choices.length !== 4) throw new Error(`word-quiz.json: ${where} needs four choices`);
      if (q.choices.some((c) => typeof c !== 'string' || !c.trim())) throw new Error(`word-quiz.json: ${where} has an empty choice`);
      // A repeated option means one right answer scores as wrong, which is worse than a
      // missing question. Roblox's bank had three of these; they are not coming back.
      if (new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== 4) throw new Error(`word-quiz.json: ${where} repeats an option`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) throw new Error(`word-quiz.json: ${where} has no valid answer`);
      return { q: q.q, choices: q.choices, answer: q.answer };
    });
  }
  return banks;
}

export const BANK = loadBank();

// The island itself is shared data, like the errand island: the client builds from these
// coordinates and the server checks positions against them, so they cannot drift.
export const SCHOOL_PATH = path.resolve(here, '../../../client/dist/school.json');

export function loadSchool(file = SCHOOL_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8')).island;
  if (!raw || typeof raw !== 'object') throw new Error('school.json: no island block');
  for (const key of ['id', 'name', 'en']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error(`school.json: island is missing ${key}`);
  }
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(raw[key])) throw new Error(`school.json: island is missing a numeric ${key}`);
  }
  const spotById = new Map();
  for (const spot of raw.spots || []) {
    if (typeof spot.id !== 'string' || !spot.id) throw new Error('school.json: a hut has no id');
    if (spotById.has(spot.id)) throw new Error(`school.json: duplicate hut "${spot.id}"`);
    if (spot.kind === 'hut' && !DIFFICULTIES.includes(spot.difficulty)) throw new Error(`school.json: hut ${spot.id} has unknown difficulty "${spot.difficulty}"`);
    if (!['hut', 'gym'].includes(spot.kind)) throw new Error(`school.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) throw new Error(`school.json: hut ${spot.id} has no coordinates`);
    spotById.set(spot.id, { ...spot, wx: raw.x + spot.x, wz: raw.z + spot.z });
  }
  // One hut per difficulty, and far enough apart that standing in one is never standing
  // in another - otherwise a child could answer easy questions from the hard hut.
  for (const difficulty of DIFFICULTIES) {
    const huts = [...spotById.values()].filter((h) => h.kind === 'hut' && h.difficulty === difficulty);
    if (huts.length !== 1) throw new Error(`school.json: expected exactly one ${difficulty} hut, found ${huts.length}`);
  }
  const huts = [...spotById.values()];
  for (let i = 0; i < huts.length; i += 1) {
    for (let j = i + 1; j < huts.length; j += 1) {
      if (Math.hypot(huts[i].x - huts[j].x, huts[i].z - huts[j].z) <= raw.radius * 2) {
        throw new Error(`school.json: huts ${huts[i].id} and ${huts[j].id} overlap`);
      }
    }
  }
  return { ...raw, spotById };
}

export const SCHOOL = loadSchool();

// Ten questions, drawn without repeats, each with its own shuffle. Roblox shuffled
// because the correct answer skewed to A; here the shuffle is also what keeps the
// answer index meaningless to anyone watching the wire.
export function createSession(difficulty, random = Math.random) {
  const bank = BANK[difficulty];
  if (!bank) throw new QuizError('unknown difficulty');
  const pool = [...bank.keys()];
  const picked = [];
  for (let i = 0; i < QUESTIONS_PER_SESSION; i += 1) {
    const at = Math.floor(random() * pool.length);
    const [index] = pool.splice(at, 1);
    const source = bank[index];
    const order = [0, 1, 2, 3];
    for (let j = order.length - 1; j > 0; j -= 1) {
      const k = Math.floor(random() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    picked.push({
      q: source.q,
      choices: order.map((o) => source.choices[o]),
      answer: order.indexOf(source.answer),
    });
  }
  return { difficulty, questions: picked, at: 0, correct: 0, answered: [], startedAt: Date.now() };
}

// What a client is allowed to see: the question, the four choices, and where it is in
// the set. Never the answer.
export function questionPayload(session) {
  const q = session.questions[session.at];
  if (!q) return null;
  return {
    difficulty: session.difficulty,
    index: session.at,
    total: session.questions.length,
    correct: session.correct,
    q: q.q,
    choices: [...q.choices],
  };
}

// Grades one answer and advances. Returns null if the session is already finished.
export function answerSession(session, choice) {
  const q = session.questions[session.at];
  if (!q) return null;
  const picked = Number.isInteger(choice) ? choice : -1;
  const correct = picked === q.answer;
  if (correct) session.correct += 1;
  session.answered.push({ q: q.q, picked, correct });
  session.at += 1;
  const done = session.at >= session.questions.length;
  return {
    correct,
    answer: q.answer,          // revealed only after the child has committed
    picked,
    index: session.at - 1,
    total: session.questions.length,
    score: session.correct,
    done,
    perfect: done && session.correct === session.questions.length,
  };
}
