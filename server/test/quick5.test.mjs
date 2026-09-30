// 今日の5分。**答えがブラウザーに届かないこと**と、読む3・聞く2の形を測る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuick, quickPayload, answerQuick, SIZE, QuickError } from '../src/game/quick5.js';

test('読む3問・聞く2問の5問で、見せる形に正解は入らない', () => {
  const s = createQuick('g5');
  assert.equal(s.questions.length, SIZE);
  assert.deepEqual(s.questions.map((q) => q.skill), ['reading', 'reading', 'reading', 'listening', 'listening']);
  for (let i = 0; i < SIZE; i += 1) {
    const p = quickPayload(s);
    assert.equal(p.answer, undefined, '正解の番号を送らない');
    assert.equal(p.choices.length, 4);
    if (p.skill === 'listening') assert.ok(p.say);
    const r = answerQuick(s, { choice: s.questions[s.at].answer });
    assert.equal(r.correct, true);
  }
  assert.equal(quickPayload(s), null);
  assert.equal(answerQuick(s, { choice: 0 }), null, '終わったセットには答えられない');
});

test('やさしいは2たく、知らない級は断る、変な答えは×', () => {
  const s = createQuick('g4', Math.random, 'easy');
  assert.equal(quickPayload(s).choices.length, 2);
  assert.equal(answerQuick(s, { choice: '0' }).correct, false, '数字の文字列は受けない');
  assert.throws(() => createQuick('g1'), QuickError);
});

test('全問正解で perfect', () => {
  const s = createQuick('g3');
  let last = null;
  while (s.at < SIZE) last = answerQuick(s, { choice: s.questions[s.at].answer });
  assert.equal(last.done, true);
  assert.equal(last.perfect, true);
  assert.equal(last.score, SIZE);
});
