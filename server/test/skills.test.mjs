// 5技能 — the map from "where an answer came from" to "what it exercised", and the score
// that becomes one arm of the chart on a child's page.
//
// This is worth testing rather than eyeballing because it is arithmetic a parent will read
// as a judgement of their child. The two ways to get it wrong are opposite and both easy:
// score on accuracy alone and two lucky answers become a perfect skill; score on volume
// alone and guessing beats learning.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILLS, SKILL_IDS, FULL, skillOf, blankSkills, sanitizeSkills, addAnswer, scoreOf, radarOf, weakestOf,
} from '../src/game/skills.js';

test('every place a child answers lands on one of the five skills', () => {
  assert.equal(SKILLS.length, 5);
  // The modes the eleven learning writes in ClassRoom actually use.
  assert.equal(skillOf('listen'), 'listen');       // ジム・きくモード
  assert.equal(skillOf('listening'), 'listen');    // 英検リスニング
  assert.equal(skillOf('speak'), 'speak');         // ジム・はなすモード
  assert.equal(skillOf('speaking'), 'speak');      // 英検スピーキング
  assert.equal(skillOf('conv'), 'speak');          // 英会話島
  assert.equal(skillOf('interview'), 'speak');     // めんせつの間
  assert.equal(skillOf('mission'), 'speak');       // おつかい島
  assert.equal(skillOf('reading'), 'read');        // 英検リーディング
  assert.equal(skillOf('quiz'), 'read');           // ことばの学校
  assert.equal(skillOf('race'), 'read');           // 📦
  assert.equal(skillOf('writing'), 'write');       // 英検ライティング
  assert.equal(skillOf('chat'), 'write');          // じゆうにゅうりょく
  assert.equal(skillOf('battle'), 'think');        // アリーナ
  // And anything not on the list is comprehension rather than lost: the willow lessons,
  // the fish meanings and the RPG all ask a child to understand and choose.
  assert.equal(skillOf('lesson'), 'think');
  assert.equal(skillOf('meaning'), 'think');
  assert.equal(skillOf(''), 'think');
  assert.equal(skillOf(undefined), 'think');
});

test('a skill nobody has practised scores nothing, and cannot be faked by being right', () => {
  assert.equal(scoreOf({ a: 0, c: 0 }), 0);
  // Two perfect answers is two answers, not a mastered skill.
  assert.ok(scoreOf({ a: 2, c: 2 }) < 10, `${scoreOf({ a: 2, c: 2 })}`);
  // A term's worth of it, all correct, is the shape filled.
  assert.equal(scoreOf({ a: FULL, c: FULL }), 100);
  // The same volume answered badly is well short of it, but not nothing: turning up and
  // trying is some of the shape.
  const half = scoreOf({ a: FULL, c: FULL / 2 });
  assert.ok(half > 60 && half < 80, `${half}`);
  assert.equal(scoreOf({ a: FULL, c: 0 }), 40);
  // Practice past the point that fills the axis does not overflow it.
  assert.equal(scoreOf({ a: FULL * 5, c: FULL * 5 }), 100);
});

test('more practice and better answers both move the arm outwards', () => {
  const little = scoreOf({ a: 10, c: 10 });
  const lots = scoreOf({ a: 40, c: 40 });
  assert.ok(lots > little, `${little} → ${lots}`);
  const sloppy = scoreOf({ a: 40, c: 20 });
  assert.ok(lots > sloppy, `${sloppy} vs ${lots}`);
});

test('counting an answer puts it on the right arm, and a record cannot claim more right than asked', () => {
  const skills = blankSkills();
  assert.deepEqual(Object.keys(skills), SKILL_IDS);
  assert.equal(addAnswer(skills, 'listening', true), 'listen');
  addAnswer(skills, 'listening', false);
  assert.deepEqual(skills.listen, { a: 2, c: 1 });
  addAnswer(skills, 'conv', true);
  assert.deepEqual(skills.speak, { a: 1, c: 1 });

  // A row that says twelve right out of three is a broken row, not twelve right.
  const fixed = sanitizeSkills({ read: { a: 3, c: 12 }, write: { a: -5, c: -5 }, nonsense: { a: 9 } });
  assert.deepEqual(fixed.read, { a: 3, c: 3 });
  assert.deepEqual(fixed.write, { a: 0, c: 0 });
  assert.equal(fixed.nonsense, undefined);
  assert.deepEqual(sanitizeSkills(null), blankSkills());
  assert.deepEqual(sanitizeSkills('nope'), blankSkills());
});

test('the chart comes out in a fixed order, and names the arm to go and practise', () => {
  const skills = blankSkills();
  for (let i = 0; i < 30; i += 1) addAnswer(skills, 'reading', true);
  for (let i = 0; i < 4; i += 1) addAnswer(skills, 'listening', true);
  const rows = radarOf(skills);
  assert.deepEqual(rows.map((r) => r.id), SKILL_IDS, 'the arms are always drawn in the same order');
  assert.ok(rows.find((r) => r.id === 'read').score > rows.find((r) => r.id === 'listen').score);
  // An arm with nothing on it is the most useful thing to point a child at, so an empty
  // one outranks a thin one.
  const weak = weakestOf(skills);
  assert.equal(weak.attempts, 0, `pointed at ${weak.id}`);
  assert.equal(weak.score, 0);
});
