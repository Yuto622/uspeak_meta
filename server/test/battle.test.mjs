import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK, ARENA, WAZA, WAZA_IDS, CPU, CPU_IDS, REWARD, DAILY_CAP, MAX_TURNS, maxHp,
  createBattle, statePayload, quizPayload, chooseWaza, answerQuiz, BattleError, loadBank,
} from '../src/game/battle.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('every battle question is answerable', () => {
  assert.ok(BANK.length >= 200, `only ${BANK.length} questions`);
  for (const [i, q] of BANK.entries()) {
    assert.equal(q.choices.length, 3, `[${i}]`);
    assert.equal(new Set(q.choices).size, 3, `[${i}] repeats a choice`);
    assert.ok(q.choices[q.answer], `[${i}] answer points at nothing`);
  }
});

test('a broken bank is refused', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'battle-'));
  const write = (questions) => { const f = path.join(dir, `${Math.random()}.json`); writeFileSync(f, JSON.stringify({ questions })); return f; };
  const many = (extra) => [...Array.from({ length: 25 }, (_, i) => ({ q: `q${i}`, choices: ['a', 'b', 'c'], answer: 0 })), ...(extra ? [extra] : [])];
  assert.equal(loadBank(write(many())).length, 25);
  assert.throws(() => loadBank(write(many({ q: 'x', choices: ['a', 'b'], answer: 0 }))), /three choices/);
  assert.throws(() => loadBank(write(many({ q: 'x', choices: ['a', 'a', 'b'], answer: 0 }))), /repeats a choice/);
  assert.throws(() => loadBank(write(many({ q: 'x', choices: ['a', 'b', 'c'], answer: 5 }))), /no valid answer/);
});

test('the arena is four stands a child cannot stand in two of', () => {
  const all = [...ARENA.spotById.values()];
  assert.equal(all.filter((s) => s.kind === 'stand').length, 3);
  assert.equal(all.filter((s) => s.kind === 'pvp').length, 1);
  assert.deepEqual(all.filter((s) => s.kind === 'stand').map((s) => s.difficulty).sort(), [...CPU_IDS].sort());
  for (let i = 0; i < all.length; i += 1) {
    assert.equal(all[i].wx, ARENA.x + all[i].x);
    for (let j = i + 1; j < all.length; j += 1) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > ARENA.radius * 2, `${all[i].id}/${all[j].id}`);
    }
  }
});

test('the plain attack always lands and the strong ones ask first', () => {
  const b = createBattle({ difficulty: 'easy', level: 1, random: seeded(3) });
  assert.equal(b.you.max, maxHp(1));
  assert.equal(b.foe.max, CPU.easy.hp);

  // ぽよんアタック resolves on the spot.
  const foeBefore = b.foe.hp;
  const out = chooseWaza(b, 'poyon');
  assert.equal(out.asked, undefined);
  assert.equal(b.foe.hp, foeBefore - WAZA.poyon.damage);

  // The other three pose a question, and nothing happens until it is answered.
  for (const id of ['beam', 'super', 'heal']) {
    const fresh = createBattle({ difficulty: 'easy', level: 1, random: seeded(9) });
    const asked = chooseWaza(fresh, id);
    assert.equal(asked.asked, true);
    assert.equal(fresh.foe.hp, fresh.foe.max, 'no damage before the answer');
    const payload = quizPayload(fresh);
    assert.equal('answer' in payload, false, 'the answer is never sent');
    assert.equal(payload.choices.length, 3);
    assert.equal(payload.seconds, WAZA[id].seconds);
    assert.throws(() => chooseWaza(fresh, 'poyon'), BattleError, 'and no other move can jump the queue');
  }
});

test('a wrong answer fizzles the move; a right one lands it', () => {
  const right = createBattle({ difficulty: 'easy', level: 9, random: seeded(11) });
  chooseWaza(right, 'super');
  const answer = right.pending.question.answer;
  const hit = answerQuiz(right, answer);
  assert.equal(hit.quiz.correct, true);
  assert.equal(right.foe.hp, right.foe.max - WAZA.super.damage);

  const wrong = createBattle({ difficulty: 'easy', level: 9, random: seeded(11) });
  chooseWaza(wrong, 'super');
  const miss = answerQuiz(wrong, (wrong.pending.question.answer + 1) % 3);
  assert.equal(miss.quiz.correct, false);
  assert.equal(wrong.foe.hp, wrong.foe.max, 'a wrong answer does no damage');
  assert.ok(miss.events.some((e) => e.who === 'you' && e.fizzled));

  // Running out of time is a wrong answer, and so is rubbish.
  const late = createBattle({ difficulty: 'easy', level: 9, random: seeded(11) });
  chooseWaza(late, 'beam');
  assert.equal(answerQuiz(late, late.pending.question.answer, { timedOut: true }).quiz.correct, false);
  for (const junk of [null, undefined, 'A', 9, -1, 1.5, {}]) {
    const b = createBattle({ difficulty: 'easy', level: 9, random: seeded(11) });
    chooseWaza(b, 'beam');
    assert.equal(answerQuiz(b, junk).quiz.correct, false, String(junk));
  }
  // And answering when nothing was asked is refused rather than paid.
  const idle = createBattle({ difficulty: 'easy', level: 1, random: seeded(2) });
  assert.throws(() => answerQuiz(idle, 0), BattleError);
  assert.throws(() => chooseWaza(idle, 'nonsense'), BattleError);
});

test('healing cannot go past full, and a battle always ends', () => {
  const b = createBattle({ difficulty: 'easy', level: 1, random: seeded(5) });
  chooseWaza(b, 'heal');
  const out = answerQuiz(b, b.pending.question.answer);
  const healed = out.events.find((e) => e.heal !== undefined);
  assert.equal(healed.heal, 0, 'at full health a heal restores nothing');
  // (hp is below max again by now: the opponent takes its turn straight after.)
  assert.ok(b.you.hp <= b.you.max, 'and hp never rises above full');

  // Hurt first, then heal: it restores, and still stops at full.
  const hurt = createBattle({ difficulty: 'hard', level: 1, random: seeded(23) });
  while (hurt.you.hp > hurt.you.max - WAZA.heal.heal && !hurt.over) chooseWaza(hurt, 'poyon');
  if (!hurt.over) {
    const low = hurt.you.hp;
    chooseWaza(hurt, 'heal');
    const got = answerQuiz(hurt, hurt.pending.question.answer).events.find((e) => e.heal !== undefined);
    assert.ok(got.heal > 0, 'a hurt fighter is actually healed');
    assert.ok(low + got.heal <= hurt.you.max);
  }

  // Mash the safe button against the hardest opponent: it resolves, one way or another.
  const long = createBattle({ difficulty: 'hard', level: 1, random: seeded(17) });
  let turns = 0;
  let last = null;
  while (!long.over && turns < MAX_TURNS + 5) { last = chooseWaza(long, 'poyon'); turns += 1; }
  assert.equal(long.over, true, 'a battle cannot run forever');
  assert.ok(last.reward === REWARD.win || last.reward === REWARD.lose);
  assert.throws(() => chooseWaza(long, 'poyon'), BattleError, 'and it stays over');
});

test('the harder the opponent, the more it lands and the more it takes', () => {
  assert.ok(CPU.easy.accuracy < CPU.normal.accuracy && CPU.normal.accuracy < CPU.hard.accuracy);
  assert.ok(CPU.easy.hp < CPU.normal.hp && CPU.normal.hp < CPU.hard.hp);
  assert.equal(DAILY_CAP, 150);
  assert.ok(REWARD.win > REWARD.lose, 'winning pays more, but trying still pays');
  assert.deepEqual(WAZA_IDS, ['poyon', 'beam', 'super', 'heal']);
  // The safe move is the weakest: the strong ones are bought with English.
  assert.ok(WAZA.poyon.damage < WAZA.beam.damage && WAZA.beam.damage < WAZA.super.damage);
  assert.equal(WAZA.poyon.quiz, false);
  for (const id of ['beam', 'super', 'heal']) assert.equal(WAZA[id].quiz, true);
  // Level makes a child tougher, exactly as Roblox had it.
  assert.equal(maxHp(1), 68);
  assert.equal(maxHp(10), 140);
  assert.ok(statePayload(createBattle({ difficulty: 'normal', level: 3 })).waza.every((w) => !('answer' in w)));
});
