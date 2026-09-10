import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, MODES, QUESTIONS_PER_SET, CHOICES, createSet, questionPayload, answerSet, judgeSpoken, editDistance, loadWords } from '../src/game/gym.js';
import { REWARDS } from '../src/game/progression.js';

test('the word list is drawable and has no repeats', () => {
  assert.ok(WORDS.length >= 100, `only ${WORDS.length} words`);
  assert.equal(new Set(WORDS.map((w) => w.en.toLowerCase())).size, WORDS.length);
  for (const w of WORDS) {
    assert.match(w.en, /^[a-z][a-z ]*$/, `${w.en} is not a plain English word`);
    assert.ok(w.emoji && w.ja && w.group);
  }
  assert.ok(new Set(WORDS.map((w) => w.group)).size >= 4, 'several categories, so distractors can come from one');
});

test('a broken word list is refused', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-'));
  const write = (words) => { const f = path.join(dir, `${Math.random()}.json`); writeFileSync(f, JSON.stringify({ words })); return f; };
  const many = (extra = []) => [...Array.from({ length: 20 }, (_, i) => ({ emoji: '🐕', en: `w${i}`, ja: 'x', group: 'a' })), ...extra];
  assert.equal(loadWords(write(many())).length, 20);
  assert.throws(() => loadWords(write(many([{ emoji: '🐕', en: 'W3', ja: 'x', group: 'a' }]))), /appears twice/);
  assert.throws(() => loadWords(write(many([{ emoji: '', en: 'zz', ja: 'x', group: 'a' }]))), /missing emoji/);
  assert.throws(() => loadWords(write([{ emoji: '🐕', en: 'dog', ja: 'x', group: 'a' }])), /too few words/);
});

test('the client is never told which picture is right', () => {
  const set = createSet('listen');
  assert.equal(set.questions.length, QUESTIONS_PER_SET);
  const payload = questionPayload(set);
  assert.equal('answer' in payload, false);
  assert.equal(payload.choices.length, CHOICES);
  // The choices carry a picture and a Japanese label, and nothing else.
  for (const c of payload.choices) assert.deepEqual(Object.keys(c).sort(), ['emoji', 'ja']);
  // The word to speak has to be sent - the browser says it out loud - so listening is
  // like the island lessons: the verdict is the server's, the answer is derivable.
  assert.ok(payload.say);
  assert.equal(JSON.parse(JSON.stringify(payload)).answer, undefined);

  // Every question offers four different pictures.
  for (const q of set.questions) {
    assert.equal(new Set(q.choices.map((c) => c.en)).size, CHOICES);
    assert.equal(q.choices[q.answer].en, q.word.en);
  }
});

test('speaking is judged from what was heard, not from a verdict the page sent', () => {
  // The whole word, however it was framed by the recogniser.
  assert.equal(judgeSpoken('cat', 'cat').correct, true);
  assert.equal(judgeSpoken('cat', 'CAT!').correct, true);
  assert.equal(judgeSpoken('cat', "it's a cat").correct, true);
  assert.equal(judgeSpoken('rabbit', 'rabit').correct, true, 'one slip in six letters is the microphone, not the child');
  assert.equal(judgeSpoken('bicycle', 'bicicle').correct, true);

  // A different word is a different word. This is a pronunciation drill.
  assert.equal(judgeSpoken('cat', 'cut').correct, false);
  assert.equal(judgeSpoken('cat', 'dog').correct, false);
  assert.equal(judgeSpoken('cat', 'kat').correct, false);
  assert.equal(judgeSpoken('cat', 'kat').close, true, 'but it comes back as a near miss');

  // Nothing heard is not a pass.
  for (const empty of ['', '   ', null, undefined, '!!!', 123]) {
    assert.equal(judgeSpoken('cat', empty).correct, false, String(empty));
  }
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', 'abc'), 0);
});

test('a set is scored and starred by the server', () => {
  const set = createSet('speak');
  let last = null;
  for (let i = 0; i < QUESTIONS_PER_SET; i += 1) {
    // Say the right word for all but the last.
    const text = i < QUESTIONS_PER_SET - 1 ? set.questions[i].word.en : 'zzzzzz';
    last = answerSet(set, { text });
    assert.equal(last.correct, i < QUESTIONS_PER_SET - 1);
  }
  assert.equal(last.done, true);
  assert.equal(last.score, QUESTIONS_PER_SET - 1);
  assert.equal(last.stars, 2, '4 of 5 is two stars');
  assert.equal(answerSet(set, { text: 'x' }), null, 'a finished set grades nothing more');

  const clean = createSet('listen');
  let r = null;
  for (const q of clean.questions) r = answerSet(clean, { choice: q.answer });
  assert.equal(r.stars, 3);
  assert.equal(r.score, QUESTIONS_PER_SET);

  // In listen mode a text answer is not an answer, and vice versa.
  const l = createSet('listen');
  assert.equal(answerSet(l, { text: l.questions[0].word.en }).correct, false);
  const s = createSet('speak');
  assert.equal(answerSet(s, { choice: 0 }).correct, false);
});

test('the gym is the best-paid drill, as Roblox tuned it', () => {
  assert.equal(REWARDS.gym.xp, 15);
  assert.equal(REWARDS.gym.coins, 5);
  assert.ok(REWARDS.gym.xp > REWARDS.wordQuiz.xp, 'the voice work outpays a written quiz');
  assert.deepEqual(MODES, ['listen', 'speak']);
});
