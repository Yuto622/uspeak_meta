// 英検の島: the four skills, what the server sends, and everything it refuses to send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EIKEN, ISLANDS, GRADES, SKILLS, QUESTIONS_PER_SET, BANK, BANK_PATH, ISLANDS_PATH,
  loadBank, loadIslands, islandOfGrade, createSession, questionPayload, answerSession,
  judgeSpoken, judgeWritten, wordsOf, markOf,
} from '../src/game/eiken.js';

const dir = mkdtempSync(join(tmpdir(), 'eiken-'));
const write = (data) => { const f = join(dir, 'x.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const rawBank = () => JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const rawIslands = () => JSON.parse(readFileSync(ISLANDS_PATH, 'utf8'));
// A fixed "random" so a set is the same set twice: the first of everything.
const first = () => 0;

test('three grades, four halls each, one hall per skill', () => {
  assert.deepEqual(EIKEN.list.map((i) => i.grade), GRADES);
  for (const island of EIKEN.list) {
    assert.equal(island.spotById.size, SKILLS.length);
    assert.deepEqual([...island.spotById.values()].map((s) => s.skill).sort(), [...SKILLS].sort());
    for (const spot of island.spotById.values()) {
      // The island is a place before it is a menu: every hall carries where it stands,
      // what it is called, and where its path starts.
      assert.ok(spot.name && spot.en && spot.tone, `${island.id}/${spot.id} is not labelled`);
      assert.ok(Number.isFinite(spot.path?.x) && Number.isFinite(spot.path?.z), `${island.id}/${spot.id} has no path`);
      assert.equal(spot.wx, island.x + spot.x);
    }
  }
  assert.equal(islandOfGrade('g5').id, 'eiken5');
  assert.equal(islandOfGrade('nonsense'), null);
});

test('every bank fills a set, and nothing in it is broken', () => {
  for (const grade of GRADES) {
    for (const skill of SKILLS) {
      const list = BANK[grade][skill];
      assert.ok(list.length >= QUESTIONS_PER_SET * 2, `${grade}.${skill} is too small to draw twice`);
      for (const item of list) {
        if (skill === 'reading' || skill === 'listening') {
          assert.equal(item.choices.length, 4);
          assert.equal(item.answer, 0, 'the bank keeps the answer first; the session shuffles');
        } else {
          assert.ok(item.ja && item.en);
          assert.ok(/[.?!]$/.test(item.en), `${grade}.${skill}: "${item.en}" has no end mark`);
        }
      }
    }
  }
  // 書く has to be a puzzle: too few words and there is nothing to arrange.
  for (const grade of GRADES) {
    for (const item of BANK[grade].writing) assert.ok(wordsOf(item.en).length >= 3);
  }
  assert.equal(markOf('Do you like music?'), '?');
  assert.deepEqual(wordsOf('I like dogs.'), ['I', 'like', 'dogs']);
});

test('what the page is told never includes the answer', () => {
  const reading = questionPayload(createSession('g3', 'reading'));
  assert.ok(reading.text && reading.q && reading.choices.length === 4);
  assert.equal(reading.answer, undefined, 'the right option is not sent');
  const listening = questionPayload(createSession('g5', 'listening'));
  assert.ok(listening.say && listening.choices.length === 4);
  assert.equal(listening.answer, undefined);
  const writing = createSession('g4', 'writing');
  const writingPayload = questionPayload(writing);
  assert.equal(writingPayload.en, undefined, 'the sentence itself is not sent, only its words');
  assert.deepEqual([...writingPayload.tiles].sort(), wordsOf(writing.questions[0].en).sort());
  assert.notEqual(writingPayload.tiles.join(' '), wordsOf(writing.questions[0].en).join(' '), 'and not in order');
  // 話す is the one that does send the sentence, because saying it is the whole drill.
  const speaking = questionPayload(createSession('g5', 'speaking'));
  assert.ok(speaking.en && speaking.ja);
});

test('a set is five questions drawn without repeats, and the options are shuffled', () => {
  const session = createSession('g5', 'reading');
  assert.equal(session.questions.length, QUESTIONS_PER_SET);
  const asked = session.questions.map((q) => q.q);
  assert.equal(new Set(asked).size, QUESTIONS_PER_SET, 'the same question twice in one set');
  // Shuffling moves the answer off the top often enough to be doing something.
  const spots = new Set();
  for (let i = 0; i < 40; i += 1) spots.add(createSession('g4', 'listening').questions[0].answer);
  assert.ok(spots.size > 1, 'the answer sat in the same place every time');
});

test('choosing: the right option scores, a wrong one does not, and both reveal it', () => {
  const session = createSession('g5', 'reading', first);
  const want = session.questions[0].answer;
  const wrong = (want + 1) % 4;
  let result = answerSession(session, { choice: wrong });
  assert.equal(result.correct, false);
  assert.equal(result.answer, want, 'the answer comes back once the child has committed');
  assert.equal(result.score, 0);
  result = answerSession(session, { choice: session.questions[1].answer });
  assert.equal(result.correct, true);
  assert.equal(result.score, 1);
  assert.equal(result.index, 1);
  // Nonsense from a page is a wrong answer, not a crash.
  assert.equal(answerSession(session, {}).correct, false);
  assert.equal(answerSession(session, { choice: 99 }).correct, false);
  const last = answerSession(session, { choice: session.questions[4].answer });
  assert.equal(last.done, true);
  assert.equal(last.perfect, false);
  assert.equal(answerSession(session, { choice: 0 }), null, 'a finished set answers nothing');
});

test('writing: the words in the right order, sent either way round', () => {
  const session = createSession('g5', 'writing', first);
  const target = session.questions[0].en;
  const tiles = session.questions[0].tiles;
  const order = wordsOf(target).map((w) => tiles.indexOf(w));
  // The page may send the words it laid out...
  const byWords = answerSession(createSession('g5', 'writing', first), { words: wordsOf(target) });
  assert.equal(byWords.correct, true);
  assert.equal(byWords.answer, target);
  // ...or the tiles it moved, which is the same sentence.
  const byOrder = answerSession(session, { order });
  assert.equal(byOrder.correct, true);
  // Order is the whole of the question: the same words the wrong way round is wrong.
  const jumbled = answerSession(createSession('g5', 'writing', first), { words: [...wordsOf(target)].reverse() });
  assert.equal(jumbled.correct, wordsOf(target).length === 1);
  assert.equal(judgeWritten('I like dogs.', ['i', 'like', 'dogs']).correct, true, 'case and the full stop are not the test');
  assert.equal(judgeWritten('I like dogs.', ['I', 'dogs', 'like']).correct, false);
  assert.equal(judgeWritten('I like dogs.', []).correct, false);
});

test('speaking: judged from what the microphone heard, with room for the microphone', () => {
  // Said exactly.
  assert.equal(judgeSpoken('I like music very much.', 'I like music very much').correct, true);
  // A lost article is not a lost sentence.
  assert.equal(judgeSpoken('The movie was very interesting.', 'movie was very interesting').correct, true);
  // Recognition punctuation and case are nothing to do with the child.
  assert.equal(judgeSpoken('How are you today?', 'how are you today').correct, true);
  // A different sentence is a different sentence.
  assert.equal(judgeSpoken('I want to be a doctor.', 'I want a dog').correct, false);
  // One word further out is encouragement, not a pass.
  const close = judgeSpoken('Nice to meet you.', 'nice to meet');
  assert.equal(close.correct, false);
  assert.equal(close.close, true);
  // Silence is not an answer.
  assert.deepEqual(judgeSpoken('Thank you very much.', ''), { correct: false, close: false, gap: -1 });
  const session = createSession('g5', 'speaking', first);
  const result = answerSession(session, { heard: session.questions[0].en });
  assert.equal(result.correct, true);
  assert.equal(result.answer, session.questions[0].en);
});

test('a perfect five is noticed', () => {
  const session = createSession('g3', 'listening', first);
  let result = null;
  for (let i = 0; i < QUESTIONS_PER_SET; i += 1) result = answerSession(session, { choice: session.questions[i].answer });
  assert.equal(result.done, true);
  assert.equal(result.perfect, true);
  assert.equal(result.score, QUESTIONS_PER_SET);
});

test('broken data is refused rather than half-loaded', () => {
  assert.throws(() => createSession('g9', 'reading'), /unknown hall/);
  assert.throws(() => createSession('g5', 'drawing'), /unknown hall/);

  const thin = rawBank();
  thin.grades.g5.reading = thin.grades.g5.reading.slice(0, 2);
  assert.throws(() => loadBank(write(thin)), /needs at least/);
  const threeChoices = rawBank();
  threeChoices.grades.g4.listening[0].choices.pop();
  assert.throws(() => loadBank(write(threeChoices)), /four choices/);
  const repeated = rawBank();
  repeated.grades.g4.reading[0].choices[1] = repeated.grades.g4.reading[0].choices[0];
  assert.throws(() => loadBank(write(repeated)), /repeats an option/);
  const wordless = rawBank();
  wordless.grades.g3.writing[0].en = '';
  assert.throws(() => loadBank(write(wordless)), /has no English/);
  const tooShort = rawBank();
  tooShort.grades.g3.writing[0].en = 'Yes.';
  assert.throws(() => loadBank(write(tooShort)), /does not make a puzzle/);
  const twice = rawBank();
  twice.grades.g5.speaking[1] = twice.grades.g5.speaking[0];
  assert.throws(() => loadBank(write(twice)), /repeats/);

  const noHall = rawIslands();
  noHall.islands[0].spots = noHall.islands[0].spots.filter((s) => s.skill !== 'writing');
  assert.throws(() => loadIslands(write(noHall)), /has 0 halls for writing/);
  const stacked = rawIslands();
  stacked.islands[1].spots[1].x = stacked.islands[1].spots[0].x;
  stacked.islands[1].spots[1].z = stacked.islands[1].spots[0].z;
  assert.throws(() => loadIslands(write(stacked)), /overlap/);
  const crowded = rawIslands();
  crowded.islands[2].x = crowded.islands[1].x + 10;
  crowded.islands[2].z = crowded.islands[1].z;
  assert.throws(() => loadIslands(write(crowded)), /too close together/);
  const oneGrade = rawIslands();
  oneGrade.islands[1].grade = oneGrade.islands[0].grade;
  assert.throws(() => loadIslands(write(oneGrade)), /two islands for/);
});

test('the halls of every island are known to the island registry', () => {
  assert.equal(ISLANDS.size, GRADES.length);
  for (const grade of GRADES) {
    const island = islandOfGrade(grade);
    assert.ok(ISLANDS.get(island.id) === island);
    for (const skill of SKILLS) {
      const hall = [...island.spotById.values()].find((s) => s.skill === skill);
      assert.ok(createSession(grade, hall.skill).questions.length === QUESTIONS_PER_SET);
    }
  }
});
