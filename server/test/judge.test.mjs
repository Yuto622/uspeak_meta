import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, JudgeError } from '../src/game/judge.js';
import { REWARDS } from '../src/game/progression.js';
import { FISH } from '../../client/dist/fishing-data.js';
import { LESSONS } from '../../client/dist/adventure-data.js';
import { WILLOW_LESSONS } from '../../client/dist/lesson-data.js';

test('lesson answers are judged from the shared data', () => {
  const step = WILLOW_LESSONS[0].steps[0];
  assert.equal(judge('lesson:0:0', step[3]).correct, true);
  assert.equal(judge('lesson:0:0', (step[3] + 1) % step[2].length).correct, false);
  assert.throws(() => judge('lesson:9:0', 0), JudgeError);
  assert.throws(() => judge('lesson:0:0', 99), JudgeError);
  assert.throws(() => judge('lesson:0:0', 'true'), JudgeError);
});

test('fish answers must match the asked fish', () => {
  const [a, b] = FISH;
  const r = judge(`fish:${a.id}`, a.id);
  assert.equal(r.correct, true);
  assert.equal(r.fishId, a.id);
  assert.equal(judge(`fish:${a.id}`, b.id).correct, false);
  assert.throws(() => judge('fish:nope', a.id), JudgeError);
  assert.throws(() => judge(`fish:${a.id}`, 'nope'), JudgeError);
});

test('word answers support choice and typed modes', () => {
  const id = Object.keys(LESSONS)[0];
  assert.equal(judge(`word:${id}:meaning`, id).correct, true);
  assert.equal(judge(`word:${id}:meaning`, 'other').correct, false);
  assert.equal(judge(`word:${id}:spell`, ` ${LESSONS[id].word.toUpperCase()}. `).correct, true);
  assert.throws(() => judge(`word:${id}:bogus`, id), JudgeError);
  assert.throws(() => judge('word:nope:meaning', 'x'), JudgeError);
});

test('client cannot claim correctness; only the choice is trusted', () => {
  const step = WILLOW_LESSONS[0].steps[0];
  const wrong = (step[3] + 1) % step[2].length;
  const r = judge('lesson:0:0', wrong);
  assert.equal(r.correct, false);
  // Judging says whether it was right; the rate card says what that is worth.
  assert.equal(REWARDS.lesson.xp, 10);
  assert.equal(REWARDS.wordQuiz.coins, 10);
  assert.throws(() => judge('bogus:1', 1), JudgeError);
  assert.throws(() => judge({ toString: () => 'lesson:0:0' }, 0), JudgeError);
});
