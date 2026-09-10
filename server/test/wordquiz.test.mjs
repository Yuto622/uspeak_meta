import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, SCHOOL, DIFFICULTIES, QUESTIONS_PER_SESSION, createSession, questionPayload, answerSession, loadBank, loadSchool } from '../src/game/wordquiz.js';

test('every shipped question is answerable', () => {
  let total = 0;
  for (const difficulty of DIFFICULTIES) {
    const bank = BANK[difficulty];
    assert.ok(bank.length >= 100, `${difficulty} is thin: ${bank.length}`);
    total += bank.length;
    for (const [i, q] of bank.entries()) {
      assert.equal(q.choices.length, 4, `${difficulty}[${i}]`);
      // A repeated option means one right answer scores as wrong. Roblox's bank had
      // three of those; the port fixed them and this keeps them fixed.
      assert.equal(new Set(q.choices.map((c) => c.trim().toLowerCase())).size, 4, `${difficulty}[${i}] repeats an option: ${q.choices}`);
      assert.ok(q.choices[q.answer], `${difficulty}[${i}] answer points at nothing`);
    }
  }
  assert.ok(total > 1400, `only ${total} questions`);
});

test('a broken bank is refused rather than half-loaded', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'quiz-'));
  const write = (data) => { const f = path.join(dir, `${Math.random()}.json`); writeFileSync(f, JSON.stringify(data)); return f; };
  const ten = (q) => Array.from({ length: 10 }, (_, i) => ({ ...q, q: `${q.q} ${i}` }));
  const good = { q: 'x?', choices: ['a', 'b', 'c', 'd'], answer: 0 };
  const banks = (easy) => ({ banks: { easy, medium: ten(good), hard: ten(good) } });
  assert.equal(loadBank(write(banks(ten(good)))).easy.length, 10);
  assert.throws(() => loadBank(write(banks(ten({ ...good, choices: ['a', 'b', 'c'] })))), /needs four choices/);
  assert.throws(() => loadBank(write(banks(ten({ ...good, choices: ['a', 'b', 'c', 'A'] })))), /repeats an option/);
  assert.throws(() => loadBank(write(banks(ten({ ...good, answer: 9 })))), /no valid answer/);
  assert.throws(() => loadBank(write(banks(ten({ ...good, choices: ['a', 'b', 'c', ' '] })))), /empty choice/);
  assert.throws(() => loadBank(write(banks([good]))), /at least 10/);
});

test('the island is three huts a child cannot stand in at once', () => {
  assert.equal(SCHOOL.spotById.size, 3);
  const huts = [...SCHOOL.spotById.values()];
  assert.deepEqual(huts.map((h) => h.difficulty).sort(), [...DIFFICULTIES].sort());
  for (let i = 0; i < huts.length; i += 1) {
    for (let j = i + 1; j < huts.length; j += 1) {
      assert.ok(Math.hypot(huts[i].x - huts[j].x, huts[i].z - huts[j].z) > SCHOOL.radius * 2);
    }
    // World coordinates are what a `move` message carries.
    assert.equal(huts[i].wx, SCHOOL.x + huts[i].x);
    assert.equal(huts[i].wz, SCHOOL.z + huts[i].z);
  }
});

test('the answer is never in what the client is sent', () => {
  const session = createSession('easy');
  assert.equal(session.questions.length, QUESTIONS_PER_SESSION);
  assert.equal(new Set(session.questions.map((q) => q.q)).size, QUESTIONS_PER_SESSION, 'no repeats inside one set');

  const payload = questionPayload(session);
  assert.deepEqual(Object.keys(payload).sort(), ['choices', 'correct', 'difficulty', 'index', 'q', 'total']);
  assert.equal('answer' in payload, false);
  // Serialised, which is what actually goes over the wire, it still carries nothing.
  const wire = JSON.parse(JSON.stringify(payload));
  assert.equal(wire.answer, undefined);
  assert.equal(payload.choices.length, 4);
});

test('a set is graded, scored and finished by the server', () => {
  const session = createSession('hard');
  let last = null;
  for (let i = 0; i < QUESTIONS_PER_SESSION; i += 1) {
    // Answer the first three wrong on purpose, the rest right.
    const right = session.questions[i].answer;
    const pick = i < 3 ? (right + 1) % 4 : right;
    last = answerSession(session, pick);
    assert.equal(last.correct, i >= 3);
    assert.equal(last.answer, right, 'the answer comes back only after committing');
    assert.equal(last.index, i);
  }
  assert.equal(last.done, true);
  assert.equal(last.score, 7);
  assert.equal(last.perfect, false);
  assert.equal(answerSession(session, 0), null, 'a finished set grades nothing more');

  // A clean ten is what pays the bonus.
  const clean = createSession('medium');
  let r = null;
  for (const q of clean.questions) r = answerSession(clean, q.answer);
  assert.equal(r.perfect, true);
  assert.equal(r.score, QUESTIONS_PER_SESSION);

  // Rubbish is a wrong answer, not a crash.
  const junk = createSession('easy');
  for (const bad of [null, undefined, 'A', 9, -1, 1.5, {}]) {
    const out = answerSession(junk, bad);
    assert.equal(out.correct, junk.questions[out.index].answer === bad);
  }
});

test('shuffling moves the answer off A', () => {
  // Roblox shuffled because the correct answer skewed to A. Over many draws the answer
  // index should be spread, not parked.
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 60; i += 1) for (const q of createSession('easy').questions) counts[q.answer] += 1;
  const total = counts.reduce((a, b) => a + b, 0);
  for (const c of counts) assert.ok(c > total * 0.15, `answer positions are skewed: ${counts}`);
});
