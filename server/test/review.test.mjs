// 苦手単語の自動復習：1 日 → 3 日 → 7 日 → 卒業。日付を 進めて たしかめる（Roblox 版と 同じ ルール）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, applyQuiz, blankBox, boxFromEvents, dueWords, pickWords, optionsFor, makeSet, publicSet, answer, englishWord, nextWord, graduatedWords, MAX_BOX, jstDay } from '../src/game/review.js';

const T0 = Date.UTC(2026, 9, 1, 1, 0, 0);

test('only English answers, lower-cased, up to 30 letters', () => {
  assert.equal(englishWord('River'), 'river');
  assert.equal(englishWord("ice cream"), 'ice cream');
  assert.equal(englishWord("don't"), "don't");
  assert.equal(englishWord('りんご'), '');
  assert.equal(englishWord('3 apples'), '');
  assert.equal(englishWord('a'.repeat(31)), '');
});

test('a miss comes back the next day; right after, a correct retry does not move it', () => {
  const s = blankBox();
  applyQuiz(s, { word: 'river', correct: false, ts: T0 });
  assert.deepEqual(s.box.river, { s: 0, d: T0 + DAY, n: 1 });
  applyQuiz(s, { word: 'river', correct: true, ts: T0 + 5000 });   // やり直し（時期前）
  assert.equal(s.box.river.s, 0);
  assert.deepEqual(dueWords(s, T0 + DAY - 1), []);
  assert.deepEqual(dueWords(s, T0 + DAY), ['river']);
});

test('1 day, then 3 days, then 7 days, then it graduates', () => {
  const s = blankBox();
  applyQuiz(s, { word: 'kitchen', correct: false, ts: T0 });
  applyQuiz(s, { word: 'kitchen', correct: true, ts: T0 + DAY });          // 時期を 過ぎて 正解 → stage 1
  assert.equal(s.box.kitchen.s, 1);
  assert.equal(s.box.kitchen.d, T0 + DAY + 3 * DAY);
  applyQuiz(s, { word: 'kitchen', correct: true, ts: T0 + 2 * DAY });      // 時期前 → 動かない
  assert.equal(s.box.kitchen.s, 1);
  applyQuiz(s, { word: 'kitchen', correct: true, ts: T0 + 4 * DAY });      // stage 2 → 7 日後
  assert.equal(s.box.kitchen.s, 2);
  assert.equal(s.box.kitchen.d, T0 + 4 * DAY + 7 * DAY);
  applyQuiz(s, { word: 'kitchen', correct: true, ts: T0 + 11 * DAY });     // stage 3 → 卒業
  assert.equal(s.box.kitchen, undefined);
  assert.deepEqual(graduatedWords(s), ['kitchen']);
});

test('a Review answer moves the word even before it is due; a miss starts it over', () => {
  const s = blankBox();
  applyQuiz(s, { word: 'library', correct: false, ts: T0 });
  applyQuiz(s, { word: 'library', correct: true, level: 'Review', ts: T0 + 1000 });
  assert.equal(s.box.library.s, 1);
  applyQuiz(s, { word: 'library', correct: false, ts: T0 + 2000 });
  assert.deepEqual(s.box.library, { s: 0, d: T0 + 2000 + DAY, n: 2 });
});

test('the box keeps 60 words, the most-missed ones', () => {
  const s = blankBox();
  applyQuiz(s, { word: 'often', correct: false, ts: T0 - 2 });
  applyQuiz(s, { word: 'often', correct: false, ts: T0 - 1 });
  for (let i = 0; i < 70; i += 1) applyQuiz(s, { word: `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, correct: false, ts: T0 + i });
  assert.equal(Object.keys(s.box).length, MAX_BOX);
  assert.ok(s.box.often, 'the most-missed word stays');
});

test('Roblox and Web quiz events fold into the same box, in time order', () => {
  const ev = (ts, data, source) => ({ type: 'quiz', ts, data_json: JSON.stringify({ ...data, ...(source ? { source } : {}) }) });
  const s = boxFromEvents([
    ev(T0 + DAY, { word: 'River', correct: true }, 'web'),     // 後の 記録が 先に 並んでいても
    ev(T0, { word: 'river', correct: false }),                  // Roblox で まちがえた
    { type: 'catch', ts: T0, data_json: '{"fish":"x"}' },
    ev(T0, { word: 'さかな', correct: false }),
  ]);
  assert.equal(s.box.river.s, 1);
  assert.equal(Object.keys(s.box).length, 1);
});

test('a set: up to 5 due words, oldest first; a teacher set adds not-yet-due words by misses', () => {
  const s = blankBox();
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  words.forEach((w, i) => applyQuiz(s, { word: w, correct: false, ts: T0 + i }));
  applyQuiz(s, { word: 'seven', correct: false, ts: T0 + 10 * DAY });     // seven は まだ 時期前、2 回 まちがい
  assert.deepEqual(pickWords(s, T0 + DAY + 100), ['one', 'two', 'three', 'four', 'five']);
  assert.deepEqual(pickWords(s, T0 + 3), []);
  assert.deepEqual(pickWords(s, T0 + 3, { teacher: true }).slice(0, 1), ['seven']);
  const opts = optionsFor(s, 'one');
  assert.equal(opts.length, 4);
  assert.ok(opts.includes('one'));
  assert.equal(new Set(opts).size, 4);
});

test('the page never gets the answer; the server judges', () => {
  const s = blankBox();
  applyQuiz(s, { word: 'river', correct: false, ts: T0 });
  const set = makeSet(s, T0 + DAY);
  assert.equal(JSON.stringify(publicSet(set)).includes('"word"'), false);
  assert.equal(publicSet(set).items[0].say, 'river', 'the word to read aloud (listen format)');
  assert.equal(makeSet(s, T0), null, 'nothing due → no set');
  const r = answer(set, 0, 'River');
  assert.deepEqual({ ok: r.ok, done: r.done, correct: r.correct }, { ok: true, done: true, correct: 1 });
  assert.throws(() => answer(set, 0, 'river'), /already/);
  assert.equal(nextWord(s), 'river');
  assert.equal(jstDay(Date.UTC(2026, 9, 1, 16, 0)), '2026-10-02');
});

test('reports: the next word, words waiting, and graduated words count as learned', async () => {
  const { CUSTOM } = await import('../src/game/roblox-metrics.js');
  const ev = (ts, word, correct, level = '') => ({ type: 'quiz', ts, data: { word, correct, level } });
  const events = [ev(T0, 'river', false), ev(T0 + 1, 'kitchen', false), ev(T0 + 2, 'pen', false),
    ev(T0 + DAY, 'pen', true), ev(T0 + 4 * DAY, 'pen', true), ev(T0 + 11 * DAY, 'pen', true)];   // pen は 卒業
  assert.equal(CUSTOM.review_due(events, { now: T0 + 12 * DAY }), 2);
  assert.deepEqual(CUSTOM.review_next(events), [{ word: 'river' }]);
  assert.equal(CUSTOM.words_mastered(events), 1, 'pen graduated from review');
});
