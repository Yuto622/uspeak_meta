import test from 'node:test';
import assert from 'node:assert/strict';
import { createKartSession, kartPayload, answerKart, KART_GRADES, KART_MAX } from '../src/game/kart.js';

test('kart: questions have three different choices and the payload carries no answer', () => {
  for (const g of KART_GRADES) {
    const s = createKartSession(g, 9);
    assert.equal(s.questions.length, 9);
    for (const q of s.questions) {
      assert.equal(new Set(q.choices).size, 3);
      assert.equal(q.choices[q.answer], q.en);
    }
    const sent = JSON.stringify(kartPayload(s));
    assert.ok(!/"answer"|"en"/.test(sent), 'the answer must stay on the server');
  }
  assert.equal(createKartSession(5, 999).questions.length, KART_MAX);
  assert.ok(KART_GRADES.includes(createKartSession('nope', 3).grade));
});

test('kart: each gate is judged once, and a missed gate is wrong', () => {
  const s = createKartSession(5, 3);
  const first = answerKart(s, 0, s.questions[0].answer);
  assert.equal(first.correct, true);
  assert.equal(answerKart(s, 0, s.questions[0].answer), null);
  assert.equal(answerKart(s, 1, -1).correct, false);
  assert.equal(answerKart(s, 7, 0), null);
  assert.equal(answerKart(s, 2, (s.questions[2].answer + 1) % 3).done, true);
  assert.equal(s.score, 1);
});
