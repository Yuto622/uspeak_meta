import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpToNext, totalXp, blankProgress, sanitizeProgress, grantXp, REWARDS, MAX_LEVEL } from '../src/game/progression.js';

test('the level curve is the one children already played on Roblox', () => {
  // need(level) = 20 + level * 10, straight from XPCore.
  assert.equal(xpToNext(1), 30);
  assert.equal(xpToNext(2), 40);
  assert.equal(xpToNext(10), 120);

  // Total XP is derived, never stored - the same reverse-derivation SheetSync used,
  // which is why the sheet and the game always agreed.
  assert.equal(totalXp({ level: 1, xp: 0 }), 0);
  assert.equal(totalXp({ level: 1, xp: 5 }), 5);
  assert.equal(totalXp({ level: 2, xp: 0 }), 30);
  assert.equal(totalXp({ level: 3, xp: 0 }), 70);
  // And it agrees with walking the curve one level at a time.
  let sum = 0;
  for (let l = 1; l < 12; l += 1) {
    assert.equal(totalXp({ level: l, xp: 0 }), sum, `level ${l}`);
    sum += xpToNext(l);
  }
});

test('granting XP rolls as many levels as it earns', () => {
  const p = blankProgress();
  let r = grantXp(p, 10);
  assert.deepEqual([r.levels, r.level, r.xp], [0, 1, 10]);

  r = grantXp(p, 20);                       // exactly 30: one level, nothing left over
  assert.deepEqual([r.levels, r.from, r.level, r.xp], [1, 1, 2, 0]);

  r = grantXp(p, 100);                      // 40 + 50 = 90 for two levels, 10 spare
  assert.deepEqual([r.levels, r.level, r.xp], [2, 4, 10]);
  assert.equal(r.need, xpToNext(4));

  // Nothing is awarded for nothing, and a bad amount cannot move anything.
  const before = { ...p };
  for (const bad of [0, -50, NaN, undefined, '30', null]) {
    const out = grantXp(p, bad);
    if (typeof bad === 'string') continue;  // '30' is coerced by Number, which is fine
    assert.equal(out.gained, 0, String(bad));
  }
  assert.equal(p.level >= before.level, true);
});

test('a corrupt stored progress cannot mint levels', () => {
  // XP inside a level can never reach what that level costs; a stored value that does
  // is corrupt, and clamping beats letting it roll into free levels on load.
  assert.deepEqual(sanitizeProgress({ level: 5, xp: 99999 }), { level: 5, xp: xpToNext(5) - 1, chats: 0 });
  assert.deepEqual(sanitizeProgress({ level: -3, xp: -1 }), { level: 1, xp: 0, chats: 0 });
  assert.deepEqual(sanitizeProgress({ level: 1e9, xp: 0 }), { level: MAX_LEVEL, xp: 0, chats: 0 });
  assert.deepEqual(sanitizeProgress(null), blankProgress());
  assert.deepEqual(sanitizeProgress('hello'), blankProgress());
  assert.deepEqual(sanitizeProgress({ level: 2.9, xp: 3.7, chats: 1.2 }), { level: 2, xp: 3, chats: 1 });

  // The cap holds even when XP keeps arriving.
  const p = { level: MAX_LEVEL, xp: 0, chats: 0 };
  grantXp(p, 1e9);
  assert.equal(p.level, MAX_LEVEL);
  assert.ok(p.xp < xpToNext(MAX_LEVEL));
});

test('the rate card pays speaking the most', () => {
  // Roblox's tuning, carried over: the voice work is the highest-paid act.
  assert.ok(REWARDS.missionGoal.xp > REWARDS.wordQuiz.xp, 'speaking beats a quiz');
  assert.ok(REWARDS.wordQuiz.xp > REWARDS.phrase.xp, 'a quiz beats a tapped phrase');
  assert.equal(REWARDS.wordQuiz.coins, 10);
  for (const [name, r] of Object.entries(REWARDS)) {
    assert.ok(Number.isInteger(r.xp) && r.xp >= 0, `${name} xp`);
    assert.ok(Number.isInteger(r.coins) && r.coins >= 0, `${name} coins`);
  }
});
