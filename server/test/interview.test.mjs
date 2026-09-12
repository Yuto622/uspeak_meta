// 面接の間 — the rules of an interview, decided on the server.
//
// What is being held to account here is the thing a page could otherwise lie about: that
// the passage was actually read, that a question was answered before the next one came,
// that the model answer was not handed over in advance, and that what a sitting pays is
// worked out from the marks rather than from anything a browser said.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
const {
  INTERVIEW, INTERVIEW_BANK_PATH, loadInterviewBank, startInterview, interviewStep,
  interviewPayload, interviewResult, markAnswer, markReading, scriptedLine,
  INTERVIEW_XP, INTERVIEW_COINS, KINDS,
} = await import('../src/game/interview.js');
const { GRADES } = await import('../src/game/eiken.js');
const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');

const dir = mkdtempSync(join(tmpdir(), 'interview-'));
const write = (data) => { const f = join(dir, 'x.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const rawBank = () => JSON.parse(readFileSync(INTERVIEW_BANK_PATH, 'utf8'));
const first = () => 0;

// One whole sitting, answered from the bank's own model answers.
function sitThrough(grade) {
  const session = startInterview(grade, { random: first });
  const out = [interviewStep(session, session.card.passage)];
  for (const step of session.card.steps) out.push(interviewStep(session, step.model));
  return { session, out };
}

test('面接: every grade has an interview, and each one is a whole exam', () => {
  for (const grade of GRADES) {
    const bank = INTERVIEW[grade];
    assert.ok(bank, `${grade} has no interview`);
    assert.ok(bank.cards.length >= 2, `${grade} needs a second card so a second go differs`);
    for (const card of bank.cards) {
      assert.ok(card.passage.split(/\s+/).length >= 12, `${card.id}'s passage is too short to read aloud`);
      // The real thing goes passage, then picture or self: a card that only asks about
      // the child is a chat, and one that only asks about the passage is a quiz.
      assert.equal(card.steps[0].kind, 'passage', `${card.id} does not start with the passage`);
      assert.ok(card.steps.some((s) => s.kind === 'self'), `${card.id} never asks about the child`);
      for (const step of card.steps) assert.ok(KINDS.includes(step.kind));
    }
  }
  // 3級 is the real interview, so it is longer than the 5級 speaking test.
  assert.ok(INTERVIEW.g3.cards[0].steps.length > INTERVIEW.g5.cards[0].steps.length);
});

test('面接: a broken bank is refused rather than half-loaded', () => {
  const bad = (mutate, message) => {
    const raw = rawBank();
    mutate(raw);
    assert.throws(() => loadInterviewBank(write(raw)), (err) => new RegExp(message).test(err.message), message);
  };
  bad((r) => { delete r.grades.g4; }, 'no g4');
  bad((r) => { r.grades.g5.cards = [r.grades.g5.cards[0]]; }, 'at least two cards');
  bad((r) => { r.grades.g5.cards[0].passage = ''; }, 'no passage');
  bad((r) => { r.grades.g5.cards[0].steps[0].keys = []; }, 'nothing to mark against');
  bad((r) => { r.grades.g5.cards[0].steps[0].model = ''; }, 'no model answer');
  bad((r) => { r.grades.g5.cards[0].steps[0].kind = 'chatting'; }, 'unknown kind');
  bad((r) => { r.grades.g5.cards[1].id = r.grades.g5.cards[0].id; }, 'repeated id');
});

test('面接: the page is never told the answer before it answers', () => {
  const session = startInterview('g3', { random: first });
  const shown = JSON.stringify(interviewPayload(session));
  assert.ok(shown.includes(session.card.passage), 'the passage is shown: it has to be read aloud');
  for (const step of session.card.steps) {
    assert.ok(!shown.includes(step.model), 'a model answer reached the page');
    for (const group of step.keys) for (const key of group) {
      // Key words may of course appear inside the passage; what must not appear is the
      // question that has not been asked yet.
      assert.ok(!shown.includes(step.q), 'a question reached the page before it was asked');
      assert.ok(typeof key === 'string');
    }
  }
  // Answering brings the next question, and only the next one.
  const after = interviewStep(session, session.card.passage);
  assert.equal(after.next.question.q, session.card.steps[0].q);
  assert.equal(after.next.of, session.card.steps.length);
  assert.ok(!JSON.stringify(after.next).includes(session.card.steps[1].q));
});

test('面接: the passage has to be read, and the questions answered, in order', () => {
  const { session, out } = sitThrough('g5');
  assert.equal(out[0].kind, 'read');
  assert.equal(out[0].correct, true, 'reading the passage back is reading it');
  assert.deepEqual(out.slice(1).map((o) => o.correct), [true, true, true]);
  assert.equal(out.at(-1).done, true);
  assert.equal(session.stage, 'done');
  // And it is over: a page that keeps talking is answered, not marked.
  assert.deepEqual(interviewStep(session, 'one more thing'), { ok: false, reason: 'finished' });

  const result = interviewResult(session);
  assert.equal(result.right, 4);
  assert.equal(result.total, 4);
  assert.equal(result.perfect, true);
  assert.equal(result.coins, INTERVIEW_COINS, '5級 pays the base rate');
  assert.equal(result.xp, INTERVIEW_XP.read + INTERVIEW_XP.answer * 3 + INTERVIEW_XP.finish);
});

test('面接: a harder grade is worth more for the same sitting', () => {
  const g5 = interviewResult(sitThrough('g5').session);
  const g3 = interviewResult(sitThrough('g3').session);
  assert.ok(g3.coins > g5.coins, '3級 pays more than 5級');
  assert.ok(g3.total > g5.total, 'and asks more');
});

test('面接: what counts as an answer, and what does not', () => {
  const step = { kind: 'passage', keys: [['soccer', 'football'], ['play', 'plays', 'playing']], q: '', model: '' };
  assert.equal(markAnswer(step, 'He plays soccer with his friends.').correct, true);
  assert.equal(markAnswer(step, 'HE PLAYS SOCCER!!').correct, true, 'a microphone gives no punctuation and odd case');
  assert.equal(markAnswer(step, 'he plays football').correct, true, 'either word in a group will do');
  const missed = markAnswer(step, 'he plays baseball');
  assert.equal(missed.correct, false);
  assert.deepEqual(missed.missing, ['soccer'], 'and the room knows which half was missing');
  assert.equal(markAnswer(step, '').correct, false);

  // A question about the child is marked on shape, not on content: there is no right
  // answer to "do you like sports", but "yes" alone is not an answer to "tell me more".
  const self = { kind: 'self', keys: [['yes', 'no']], q: '', model: '' };
  assert.equal(markAnswer(self, 'yes I do').correct, true);
  assert.equal(markAnswer(self, 'yes').correct, false, 'two words at least');
  const more = { kind: 'self', keys: [['because', 'and', 'so']], minWords: 6, q: '', model: '' };
  assert.equal(markAnswer(more, 'because it is fun').correct, false, 'six words for "tell me more"');
  assert.equal(markAnswer(more, 'because my room is very quiet and warm').correct, true);

  // 音読 is judged the way the 話す hall judges a sentence: near enough is near enough.
  const passage = INTERVIEW.g5.cards[0].passage;
  assert.equal(markReading(passage, passage).correct, true);
  assert.equal(markReading(passage, 'hello').correct, false);
});

test('面接: an interview that is walked out of is not paid for', () => {
  const session = startInterview('g4', { random: first });
  interviewStep(session, session.card.passage);
  interviewStep(session, session.card.steps[0].model);
  const result = interviewResult(session);
  assert.equal(result.coins, 0, 'the coins are for sitting the whole thing');
  assert.ok(result.xp > 0, 'but the English that was spoken still counts');
  assert.equal(result.perfect, false);
});

test('面接: a second interview is a different card, and ウーピー always has a line', () => {
  const one = startInterview('g5', { random: first });
  const two = startInterview('g5', { random: first, avoid: one.cardId });
  assert.notEqual(two.cardId, one.cardId);
  for (const where of ['read', 'answer', 'end']) {
    for (const correct of [true, false]) {
      assert.ok(scriptedLine(where, correct, first).length > 3, `${where}/${correct} has no line`);
    }
  }
});

test('面接: an interview left open all morning is closed rather than resumed', () => {
  const session = startInterview('g5', { random: first, now: 0 });
  const out = interviewStep(session, session.card.passage, { now: 60 * 60 * 1000 });
  assert.deepEqual(out, { ok: false, reason: 'time' });
  assert.equal(session.stage, 'done');
});
