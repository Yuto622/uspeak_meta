import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISH_MOVES, moveForFish, sanitizeMove } from '../src/game/fish-moves.js';
import { FISH } from '../../client/dist/fishing-data.js';
import { WAZA } from '../src/game/battle.js';

test('every fish teaches a move, and rarer fish teach stronger ones', () => {
  const byRarity = new Map();
  for (const fish of FISH) {
    const move = moveForFish(fish.id);
    assert.ok(move, `${fish.id} teaches nothing`);
    assert.ok(FISH_MOVES[move.id], `${fish.id} teaches an unknown move`);
    assert.equal(move.from, fish.id);
    assert.equal(move.quiz, true, 'a taught move is still bought with English');
    if (!byRarity.has(fish.rarity)) byRarity.set(fish.rarity, []);
    byRarity.get(fish.rarity).push(move.damage);
  }
  // The promise a child can see: a rarer fish is never a weaker move.
  const tiers = [...byRarity.keys()].sort((a, b) => a - b);
  for (let i = 1; i < tiers.length; i += 1) {
    const below = Math.max(...byRarity.get(tiers[i - 1]));
    const here = Math.min(...byRarity.get(tiers[i]));
    assert.ok(here >= below, `rarity ${tiers[i]} can teach ${here}, weaker than ${below} below it`);
  }
  // And the weakest taught move still beats the free attack, or nobody would feed a fish.
  const weakest = Math.min(...FISH.map((f) => moveForFish(f.id).damage));
  assert.ok(weakest > WAZA.poyon.damage, `${weakest} is no better than the free attack`);

  // Several different moves are reachable, so two children fight differently.
  assert.ok(new Set(FISH.map((f) => moveForFish(f.id).id)).size >= 6);
});

test('a stored move is rebuilt from the fish, so it cannot be forged', () => {
  const real = moveForFish(FISH[0].id);
  // A save claiming a 9999-damage golden move on a common fish gets that fish's move.
  const forged = sanitizeMove({ id: 'golden', name: 'まぼろし', damage: 9999, seconds: 1, from: FISH[0].id });
  assert.deepEqual(forged, real);
  assert.equal(forged.damage, real.damage);

  assert.equal(sanitizeMove(null), null);
  assert.equal(sanitizeMove({ from: 'not-a-fish' }), null);
  assert.equal(sanitizeMove({}), null);
  assert.equal(sanitizeMove(42), null);
  assert.equal(sanitizeMove(FISH[3].id)?.from, FISH[3].id, 'a bare id works too');
});
