import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, NAMES, EGG_COST, FEED_COST, FEED_HUNGER, PAT_COOLDOWN_MS, DAY_MS, FULL_AT,
  PET_ISLAND, hatch, sanitizePet, decay, petPayload, act, levelOf, PetError,
} from '../src/game/pets.js';

test('a pet is one of six, with a name', () => {
  const seen = new Set();
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 200; i += 1) {
    const pet = hatch(rnd, 1000);
    assert.ok(SPECIES.some((sp) => sp.id === pet.species));
    assert.ok(NAMES.includes(pet.name));
    assert.equal(pet.hunger, 100);
    assert.equal(pet.happy, 100);
    seen.add(pet.species);
  }
  assert.equal(seen.size, SPECIES.length, 'all six can hatch');
});

test('hunger and mood fall with real time, not with play time', () => {
  const now = 1_000_000_000_000;
  const pet = hatch(() => 0.5, now);

  // Half a day away is half the meter, whether or not anyone was online.
  let view = petPayload(pet, now + DAY_MS / 2);
  assert.equal(view.hunger, 50);
  assert.equal(view.happy, 50);

  // Two more days bottoms out but never goes below zero.
  view = petPayload(pet, now + DAY_MS * 3);
  assert.equal(view.hunger, 0);
  assert.equal(view.happy, 0);

  // Time going backwards (a clock change) must not refill it.
  const before = pet.hunger;
  decay(pet, now);
  assert.equal(pet.hunger, before);
});

test('feeding costs coins and cannot be repeated on a full pet', () => {
  const now = 1_000_000_000_000;
  const pet = hatch(() => 0.5, now);
  const hungry = now + DAY_MS / 2;

  assert.throws(() => act(pet, 'feed', { coins: FEED_COST - 1, now: hungry }), PetError);
  const fed = act(pet, 'feed', { coins: 999, now: hungry });
  assert.equal(fed.cost, FEED_COST);
  assert.equal(petPayload(pet, hungry).hunger, 50 + FEED_HUNGER);

  // Full is full: a second helping is refused rather than charged for.
  const full = hatch(() => 0.5, now);
  assert.ok(full.hunger >= FULL_AT);
  assert.throws(() => act(full, 'feed', { coins: 999, now }), /already full/);
});

test('patting is free but only once a minute', () => {
  const now = 1_000_000_000_000;
  const pet = hatch(() => 0.5, now);
  const later = now + DAY_MS / 2;
  const first = act(pet, 'pat', { coins: 0, now: later });
  assert.equal(first.cost, 0);
  assert.equal(petPayload(pet, later).happy, 60);

  assert.throws(() => act(pet, 'pat', { coins: 0, now: later + 1000 }), /too soon/);
  const again = act(pet, 'pat', { coins: 0, now: later + PAT_COOLDOWN_MS });
  assert.equal(again.cost, 0);

  assert.throws(() => act(pet, 'dance', { coins: 0, now: later }), /unknown action/);
  assert.throws(() => act(null, 'pat', { coins: 0, now: later }), /no pet/);
});

test('xp comes from care, and a tampered pet is rebuilt', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(25), 2);
  assert.equal(levelOf(249), 10);

  // A save claiming a maxed-out pet of an invented species is thrown away entirely.
  assert.equal(sanitizePet({ species: 'dragon', name: 'X', hunger: 999 }), null);
  assert.equal(sanitizePet(null), null);
  assert.equal(sanitizePet('cat'), null);
  const fixed = sanitizePet({ species: 'cat', name: 'NotAName', xp: -5, hunger: 500, happy: -20, seen: 'x' });
  assert.equal(fixed.species, 'cat');
  assert.ok(NAMES.includes(fixed.name));
  assert.equal(fixed.xp, 0);
  assert.equal(fixed.hunger, 100);
  assert.equal(fixed.happy, 0);
  assert.ok(Number.isFinite(fixed.seen));
});

test('the island has a nest, a kitchen and a meadow, far enough apart', () => {
  assert.deepEqual([...PET_ISLAND.spotById.keys()].sort(), ['kitchen', 'meadow', 'nest']);
  const all = [...PET_ISLAND.spotById.values()];
  for (let i = 0; i < all.length; i += 1) {
    assert.equal(all[i].wx, PET_ISLAND.x + all[i].x);
    for (let j = i + 1; j < all.length; j += 1) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > PET_ISLAND.radius * 2);
    }
  }
  assert.equal(EGG_COST, 300);
  assert.equal(FEED_COST, 20);
});
