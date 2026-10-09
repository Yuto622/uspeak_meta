// 英単語ハウス（メインの島）— 形式の重み・Roblox と同じルール・答えはページに来ない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { makeRng } from '../../client/dist/formats-core.js';
import { LEVELS, HOUSES, SET_SIZE, COIN, COIN_RETRY, XP, PERFECT_BONUS, startSet, askPayload, answer, WordHouseError } from '../src/game/wordhouse.js';

test('each house serves its own levels, and only those', () => {
  assert.deepEqual(HOUSES.hut_easy, ['SuperEasy', 'Easy']);
  assert.equal(startSet('hut_easy', 'SuperEasy').level, 'SuperEasy');
  assert.equal(startSet('hut_easy', 'Easy').level, 'Easy');
  assert.equal(startSet('hut_medium', 'Hard').level, 'Medium', 'a level a house does not teach falls back to its own');
  assert.equal(startSet('hut_hard', '').level, 'Hard');
  assert.throws(() => startSet('nope', 'Easy'), WordHouseError);
});

test('formats follow the Roblox weights for every level', () => {
  const rng = makeRng(42);
  for (const [level, def] of Object.entries(LEVELS)) {
    const seen = new Set();
    for (let k = 0; k < 30; k += 1) for (const it of startSet(def.house, level, { rng }).items) seen.add(it.kind);
    for (const kind of seen) assert.ok(def.weights.includes(kind) || kind === 'mc', `${level} served ${kind}`);
    for (const kind of new Set(def.weights)) assert.ok(seen.has(kind), `${level} never served ${kind}`);
  }
});

test('a set is ten different questions, and what the page gets has no answer in it', () => {
  for (const [level, def] of Object.entries(LEVELS)) {
    const set = startSet(def.house, level, { rng: makeRng(7) });
    assert.equal(set.items.length, SET_SIZE);
    assert.equal(new Set(set.items.map((i) => i.word)).size, SET_SIZE, `${level} repeated a question`);
    for (let i = 0; i < SET_SIZE; i += 1) {
      set.i = i;
      const ask = askPayload(set);
      const json = JSON.stringify(ask);
      assert.ok(!('answer' in ask.format) && !('pairs' in ask.format) && !('sentence' in ask.format), `${level} ${ask.format.kind} leaks the answer`);
      if (ask.format.kind === 'type') assert.ok(!json.includes(`"${set.items[i].fmt.word}"`), 'type never sends the word');
    }
  }
});

test('Roblox rules: miss → same question reshuffled; 2nd-try right is half coins and no XP; 2nd miss moves on; all first-try right is the bonus', () => {
  const set = startSet('hut_hard', 'Hard', { rng: makeRng(3) });
  const first = set.items[0];
  const r1 = answer(set, first.id, '___wrong___');
  assert.equal(r1.retry, true); assert.equal(r1.coins, 0); assert.ok(r1.reveal); assert.equal(r1.format.attempt, 2);
  assert.equal(set.i, 0, 'still the same question');
  const r2 = answer(set, first.id, first.fmt.answer);
  assert.equal(r2.correct, true); assert.equal(r2.coins, COIN_RETRY); assert.equal(r2.xp, 0);
  const second = set.items[1];
  answer(set, second.id, 'x'); const r3 = answer(set, second.id, 'x');
  assert.equal(r3.correct, false); assert.equal(r3.retry, false); assert.ok(r3.reveal); assert.equal(set.i, 2, 'two misses move on');
  assert.throws(() => answer(set, first.id, 'x'), WordHouseError, 'an old question cannot be answered again');
  let last;
  for (let i = 2; i < SET_SIZE; i += 1) { const it = set.items[i]; last = answer(set, it.id, it.fmt.answer); assert.equal(last.coins, COIN); assert.equal(last.xp, XP); }
  assert.equal(last.done.bonus, 0, 'no bonus after a miss');
  assert.equal(last.done.correct, SET_SIZE - 1);
  const perfect = startSet('hut_easy', 'SuperEasy', { rng: makeRng(9) });
  let end;
  for (const it of perfect.items) end = answer(perfect, it.id, it.fmt.answer);
  assert.equal(end.done.bonus, PERFECT_BONUS); assert.equal(end.done.firstTry, SET_SIZE);
});

test('no answer bank ships to the browser', () => {
  const dist = new URL('../../client/dist/', import.meta.url);
  for (const name of ['wordhouse-quiz.json', 'hut_quiz.json', 'word-quiz.json', 'fishworld-quiz.json']) assert.ok(!existsSync(new URL(name, dist)), `client/dist/${name}`);
  const fw = JSON.parse(readFileSync(new URL('fishworld.json', dist), 'utf8'));
  assert.equal(fw.quiz, undefined, 'fishworld.json carries no questions');
});
