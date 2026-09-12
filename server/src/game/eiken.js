// 英検の島（5級・4級・3級）— four halls on each island, one for each of the four skills.
//
// The shape of it is the shape of the exam: 読む・聞く・書く・話す. A child walks into the
// hall they want to practise and answers five questions there, and the hall they are
// standing in is which skill they get — there is no menu to pick from, which is why the
// islands exist rather than a dialog.
//
// The bank lives here, on the server, exactly like the word huts' bank: the server
// composes each question and sends only what has to be shown, so the answers never reach
// a browser. For the two choosing skills that means the four options and nothing else;
// for 書く it means the words of the sentence in a shuffled order, never their order; for
// 話す it means the sentence to say, judged from what the microphone heard.
//
// The islands themselves are shared data (client/dist/eiken.json): the client builds from
// those coordinates and the server checks a child's position against the same ones, so a
// hall a child can see is a hall the server agrees they are standing in.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BANK_PATH = path.resolve(here, 'eiken-bank.json');
export const ISLANDS_PATH = path.resolve(here, '../../../client/dist/eiken.json');

export const GRADES = ['g5', 'g4', 'g3'];
export const SKILLS = ['reading', 'listening', 'writing', 'speaking'];
// The fifth building on each island: 面接の間. Not a skill, and not in the courtyard's
// four quarters — the room a child walks past everything else to reach.
export const INTERVIEW_ROOM = 'interview';
export const QUESTIONS_PER_SET = 5;
export const CHOICES = 4;
// What the four halls together may pay in a day. A child who wants more coins has a
// whole archipelago to go and earn them on; the islands are for the English.
export const EIKEN_CAP = 150;

export class EikenError extends Error {}

// ---- the bank ------------------------------------------------------------------------

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function checkChoices(list, where) {
  if (!Array.isArray(list) || list.length !== CHOICES) throw new Error(`eiken-bank.json: ${where} needs four choices`);
  if (list.some((c) => !text(c))) throw new Error(`eiken-bank.json: ${where} has an empty choice`);
  // A repeated option means a right answer can score as wrong, which is worse than a
  // missing question.
  if (new Set(list.map((c) => c.trim().toLowerCase())).size !== CHOICES) throw new Error(`eiken-bank.json: ${where} repeats an option`);
}

// The words a sentence is built from. Punctuation stays off the tiles — a child arranges
// words, not commas — and the mark at the end is drawn by the page.
export const wordsOf = (sentence) => text(sentence).replace(/[.?!]+$/, '').split(/\s+/).filter(Boolean);
export const markOf = (sentence) => (/[?]\s*$/.test(sentence) ? '?' : /[!]\s*$/.test(sentence) ? '!' : '.');

export function loadBank(file = BANK_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const grades = {};
  for (const grade of GRADES) {
    const source = raw.grades?.[grade];
    if (!source) throw new Error(`eiken-bank.json: no ${grade}`);
    const bank = {};
    for (const skill of SKILLS) {
      const list = source[skill];
      if (!Array.isArray(list) || list.length < QUESTIONS_PER_SET) {
        throw new Error(`eiken-bank.json: ${grade}.${skill} needs at least ${QUESTIONS_PER_SET} questions`);
      }
      bank[skill] = list.map((item, i) => {
        const where = `${grade}.${skill}[${i}]`;
        if (skill === 'reading') {
          if (!text(item.text)) throw new Error(`eiken-bank.json: ${where} has no passage`);
          if (!text(item.q)) throw new Error(`eiken-bank.json: ${where} has no question`);
          checkChoices(item.choices, where);
          return { text: item.text, q: item.q, choices: [...item.choices], hint: text(item.hint), answer: 0 };
        }
        if (skill === 'listening') {
          if (!text(item.say)) throw new Error(`eiken-bank.json: ${where} has nothing to say`);
          if (!text(item.q)) throw new Error(`eiken-bank.json: ${where} has no question`);
          checkChoices(item.choices, where);
          return { say: item.say, q: item.q, choices: [...item.choices], answer: 0 };
        }
        // 書く and 話す are the same two fields: what it means, and what to build or say.
        if (!text(item.ja)) throw new Error(`eiken-bank.json: ${where} has no Japanese`);
        if (!text(item.en)) throw new Error(`eiken-bank.json: ${where} has no English`);
        const words = wordsOf(item.en);
        if (skill === 'writing' && (words.length < 3 || words.length > 12)) {
          throw new Error(`eiken-bank.json: ${where} is ${words.length} words, which does not make a puzzle`);
        }
        return { ja: item.ja, en: item.en };
      });
      // The bank is drawn from without repeats, so it has to be able to fill a set twice
      // over before a child sees the same question again in one sitting.
      const seen = new Set();
      for (const item of bank[skill]) {
        const key = (item.q || item.en || '').toLowerCase();
        if (seen.has(key)) throw new Error(`eiken-bank.json: ${grade}.${skill} repeats "${key.slice(0, 40)}"`);
        seen.add(key);
      }
    }
    grades[grade] = bank;
  }
  return grades;
}

export const BANK = loadBank();

// ---- the islands ---------------------------------------------------------------------

export function loadIslands(file = ISLANDS_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const skills = raw.skills || [];
  for (const skill of SKILLS) {
    if (!skills.some((s) => s.id === skill)) throw new Error(`eiken.json: the skill ${skill} is not described`);
  }
  const list = raw.islands || [];
  if (list.length !== GRADES.length) throw new Error(`eiken.json: expected ${GRADES.length} islands, found ${list.length}`);
  const byId = new Map();
  const byGrade = new Map();
  for (const island of list) {
    if (!text(island.id)) throw new Error('eiken.json: an island has no id');
    if (byId.has(island.id)) throw new Error(`eiken.json: duplicate island "${island.id}"`);
    if (!GRADES.includes(island.grade)) throw new Error(`eiken.json: ${island.id} has unknown grade "${island.grade}"`);
    if (byGrade.has(island.grade)) throw new Error(`eiken.json: two islands for ${island.grade}`);
    for (const key of ['name', 'en', 'badge']) {
      if (!text(island[key])) throw new Error(`eiken.json: ${island.id} is missing ${key}`);
    }
    for (const key of ['x', 'z', 'radius']) {
      if (!Number.isFinite(island[key])) throw new Error(`eiken.json: ${island.id} is missing a numeric ${key}`);
    }
    const spotById = new Map();
    for (const spot of island.spots || []) {
      // Four of the five buildings are a skill each. The fifth is the interview room,
      // which is not a skill and has its own bank; everything else about a place — where
      // it is, that it is only one place, that you have to be standing in it — is the
      // same for both, so it goes through the same door here.
      if (spot.kind === INTERVIEW_ROOM) {
        if (spot.skill) throw new Error(`eiken.json: ${island.id}/${spot.id} is the interview room and a skill hall at once`);
      } else if (!SKILLS.includes(spot.skill)) {
        throw new Error(`eiken.json: ${island.id}/${spot.id} has unknown skill "${spot.skill}"`);
      }
      if (spotById.has(spot.id)) throw new Error(`eiken.json: ${island.id} has two halls called "${spot.id}"`);
      if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) throw new Error(`eiken.json: ${island.id}/${spot.id} has no coordinates`);
      spotById.set(spot.id, { ...spot, wx: island.x + spot.x, wz: island.z + spot.z });
    }
    // Every island has the interview room, or one grade would quietly have no interview.
    if (![...spotById.values()].some((s) => s.kind === INTERVIEW_ROOM)) {
      throw new Error(`eiken.json: ${island.id} has no ${INTERVIEW_ROOM} room`);
    }
    // Four halls, one per skill, and far enough apart that standing in one is never
    // standing in another — or a child could answer a reading question from the stage.
    for (const skill of SKILLS) {
      const halls = [...spotById.values()].filter((s) => s.skill === skill);
      if (halls.length !== 1) throw new Error(`eiken.json: ${island.id} has ${halls.length} halls for ${skill}`);
    }
    const halls = [...spotById.values()];
    for (let i = 0; i < halls.length; i += 1) {
      for (let j = i + 1; j < halls.length; j += 1) {
        if (Math.hypot(halls[i].x - halls[j].x, halls[i].z - halls[j].z) <= island.radius * 2) {
          throw new Error(`eiken.json: ${island.id}'s ${halls[i].id} and ${halls[j].id} overlap`);
        }
      }
    }
    const entry = { ...island, spotById };
    byId.set(island.id, entry);
    byGrade.set(island.grade, entry);
  }
  // Two islands close enough to share a doorstep would share their questions too.
  for (const a of byId.values()) {
    for (const b of byId.values()) {
      if (a.id >= b.id) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 80) throw new Error(`eiken.json: ${a.id} and ${b.id} are too close together`);
    }
  }
  return { islands: byId, byGrade, list: [...byId.values()], skills };
}

export const EIKEN = loadIslands();
export const ISLANDS = EIKEN.islands;
export const islandOfGrade = (grade) => EIKEN.byGrade.get(grade) || null;

// ---- a set of five -------------------------------------------------------------------

const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Five questions, drawn without repeats. The choosing skills shuffle their options too,
// which is also what keeps the answer index meaningless to anyone watching the wire.
export function createSession(grade, skill, random = Math.random) {
  const bank = BANK[grade]?.[skill];
  if (!bank) throw new EikenError('unknown hall');
  const pool = [...bank.keys()];
  const questions = [];
  for (let i = 0; i < QUESTIONS_PER_SET; i += 1) {
    const [index] = pool.splice(Math.floor(random() * pool.length), 1);
    const source = bank[index];
    if (skill === 'reading' || skill === 'listening') {
      const order = shuffled([0, 1, 2, 3], random);
      questions.push({
        ...source,
        choices: order.map((o) => source.choices[o]),
        answer: order.indexOf(source.answer),
      });
    } else if (skill === 'writing') {
      const words = wordsOf(source.en);
      // A shuffle that happens to come out in order would hand the child the answer, so
      // it is reshuffled until it does not (three words have six orders; give up after a
      // few tries rather than looping on a two-word sentence).
      let tiles = shuffled(words, random);
      for (let tries = 0; tries < 8 && tiles.join(' ') === words.join(' '); tries += 1) tiles = shuffled(words, random);
      questions.push({ ...source, tiles, mark: markOf(source.en) });
    } else {
      questions.push({ ...source });
    }
  }
  return { grade, skill, questions, at: 0, correct: 0, answered: [], startedAt: Date.now() };
}

// What a client is allowed to see. Never the answer: not the right option, not the order
// of the words, not which of the four it is.
export function questionPayload(session) {
  const q = session.questions[session.at];
  if (!q) return null;
  const head = { grade: session.grade, skill: session.skill, index: session.at, total: session.questions.length, correct: session.correct };
  if (session.skill === 'reading') return { ...head, text: q.text, q: q.q, choices: [...q.choices], hint: q.hint || '' };
  if (session.skill === 'listening') return { ...head, say: q.say, q: q.q, choices: [...q.choices] };
  if (session.skill === 'writing') return { ...head, ja: q.ja, tiles: [...q.tiles], mark: q.mark };
  return { ...head, ja: q.ja, en: q.en };
}

// ---- judging -------------------------------------------------------------------------

export const normalise = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Levenshtein over whatever units it is given — letters for a word, words for a sentence.
export function distance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// 話す is judged the way the gym judges a word, but a sentence is longer and the
// microphone is no kinder for it: a child who says a long sentence and loses "the" to the
// recognition has said the sentence. So the tolerance is counted in words and grows with
// the length — one word in every five may go astray, which means a four-word sentence has
// to be said whole, because there is nothing in it to lose. One word further out is
// "おしい": encouragement, not a pass.
export function judgeSpoken(target, heard) {
  const want = normalise(target).split(' ').filter(Boolean);
  const said = normalise(heard).split(' ').filter(Boolean);
  if (!said.length) return { correct: false, close: false, gap: -1 };
  const gap = distance(want, said);
  const allow = Math.floor(want.length / 5);
  return { correct: gap <= allow, close: gap > allow && gap <= allow + 1, gap };
}

// 書く is not judged so kindly: the child is building the sentence out of the very words
// it is made of, so the only question is whether they are in the right order.
export function judgeWritten(target, built) {
  const want = normalise(target);
  const said = normalise(Array.isArray(built) ? built.join(' ') : built);
  return { correct: !!said && said === want, close: false, gap: distance(want.split(' '), said.split(' ')) };
}

// Grades one answer and advances. Returns null if the set is already finished.
export function answerSession(session, given) {
  const q = session.questions[session.at];
  if (!q) return null;
  let correct = false;
  let close = false;
  let picked = null;
  let answer = null;
  if (session.skill === 'reading' || session.skill === 'listening') {
    picked = Number.isInteger(given?.choice) ? given.choice : -1;
    correct = picked === q.answer;
    answer = q.answer;
  } else if (session.skill === 'writing') {
    // The page may send the words it laid out, or the indexes of the tiles it moved.
    const built = Array.isArray(given?.words)
      ? given.words.map((w) => String(w ?? ''))
      : Array.isArray(given?.order)
        ? given.order.map((i) => q.tiles[Number(i)] ?? '')
        : String(given?.text ?? '').split(/\s+/);
    const verdict = judgeWritten(q.en, built);
    correct = verdict.correct;
    picked = built.join(' ');
    answer = q.en;
  } else {
    const verdict = judgeSpoken(q.en, given?.heard);
    correct = verdict.correct;
    close = verdict.close;
    picked = String(given?.heard ?? '').slice(0, 200);
    answer = q.en;
  }
  if (correct) session.correct += 1;
  session.answered.push({ id: q.q || q.en, picked, correct });
  session.at += 1;
  const done = session.at >= session.questions.length;
  return {
    correct,
    close,
    picked,
    answer,                    // revealed only after the child has committed
    index: session.at - 1,
    total: session.questions.length,
    score: session.correct,
    done,
    perfect: done && session.correct === session.questions.length,
  };
}
