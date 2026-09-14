// きせかえ — the shop's rules, which are the only thing standing between a child and a
// free crown.
//
// Worth testing rather than reading, because every one of these is a rule a page could
// otherwise decide for itself: what a hat costs, whether this child may have one, and
// what happens to the hat already on their head. The client draws all of it and decides
// none of it, so if these are wrong the shop is decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WARDROBE, shopPayload, priceOf, wear, sanitizeOwned, sanitizeWorn, WardrobeError,
} from '../src/game/wardrobe.js';
import { tableFrom } from '../../client/dist/wardrobe-data.js';
import { readFileSync } from 'node:fs';

const rich = { owned: [], coins: 100000, level: 99 };

test('the table the page draws and the table the room charges from are one file', () => {
  assert.ok(WARDROBE.items.length >= 32, 'a shop with four slots needs a rail in each');
  for (const slot of WARDROBE.slots) {
    const stock = WARDROBE.items.filter((i) => i.slot === slot.id);
    // Eight is roughly a screen of cards. A slot with two things in it is a slot a child
    // opens once, and it is the slot rail that makes them look, so every tab must repay it.
    assert.ok(stock.length >= 8, `${slot.id} has only ${stock.length} things in it`);
    // …and something to buy on the first day, in every slot: a rail where the cheapest
    // thing is 300 coins is a rail a beginner cannot shop from at all.
    assert.ok(stock.some((i) => i.level === 1 && i.price <= 100), `${slot.id} has nothing a level 1 child can buy`);
  }
  // Every item is drawable, priced and reachable. A slot the page has no anchor for, or a
  // level no child reaches, is an item that exists only in the JSON.
  for (const it of WARDROBE.items) {
    assert.ok(it.price > 0 && Number.isInteger(it.price), `${it.id} price`);
    assert.ok(it.level >= 1 && it.level <= 20, `${it.id} level`);
    assert.match(it.colour, /^[0-9a-f]{6}$/, `${it.id} colour`);
    assert.ok(it.ja && it.en && it.kind, `${it.id} is missing a name or a shape`);
  }
});

test('a broken wardrobe.json is refused rather than half-loaded', () => {
  const ok = { slots: [{ id: 'hat' }], items: [{ id: 'a', slot: 'hat', price: 10, level: 1, colour: 'ff0000', kind: 'cap' }] };
  assert.ok(tableFrom(ok).byId.get('a'));
  const bad = (patch) => () => tableFrom({ ...ok, items: [{ ...ok.items[0], ...patch }] });
  assert.throws(bad({ id: '' }), /missing id/);
  assert.throws(bad({ slot: 'nose' }), /no such slot/);
  assert.throws(bad({ price: 0 }), /no price/);
  assert.throws(bad({ price: 'free' }), /no price/);
  assert.throws(bad({ level: 0 }), /no level/);
  assert.throws(bad({ colour: 'red' }), /bad colour/);
  assert.throws(() => tableFrom({ ...ok, items: [ok.items[0], ok.items[0]] }), /duplicate/);
  assert.throws(() => tableFrom({ slots: ok.slots, items: [] }), /no items/);
});

test('the shop tells a child why they cannot have it, and the two reasons are different', () => {
  const crown = WARDROBE.items.find((i) => i.id === 'crown');
  const p = shopPayload({ owned: [], worn: [], coins: crown.price, level: 1 });
  const seen = p.items.find((i) => i.id === 'crown');
  // Enough coins, not enough level: saving up more would not help, and a child told
  // "あと 0 コイン" would keep fishing forever.
  assert.equal(seen.afford, true);
  assert.equal(seen.locked, true);
  const poor = shopPayload({ owned: [], worn: [], coins: 0, level: 99 }).items.find((i) => i.id === 'crown');
  assert.equal(poor.afford, false);
  assert.equal(poor.locked, false);
  // Nothing is hidden. Wanting the crown you cannot buy is most of what a shop is for.
  assert.equal(p.items.length, WARDROBE.items.length);
});

test('the shop marks what is owned and what is on', () => {
  const p = shopPayload({ owned: ['cap-red', 'scarf'], worn: ['scarf'], coins: 0, level: 1 });
  const by = (id) => p.items.find((i) => i.id === id);
  assert.deepEqual([by('cap-red').owned, by('cap-red').worn], [true, false]);
  assert.deepEqual([by('scarf').owned, by('scarf').worn], [true, true]);
  assert.deepEqual([by('crown').owned, by('crown').worn], [false, false]);
});

test('buying is refused for every reason it should be, and the reason says which', () => {
  const cap = WARDROBE.byId.get('cap-red');
  assert.equal(priceOf({ id: 'cap-red', ...rich }).price, cap.price);
  const refuse = (args, why) => assert.throws(
    () => priceOf({ ...rich, ...args }), (e) => e instanceof WardrobeError && e.message === why, why,
  );
  refuse({ id: 'sombrero' }, 'no such item');
  refuse({ id: 'cap-red', owned: ['cap-red'] }, 'already owned');
  refuse({ id: 'crown', level: 5 }, 'level too low');
  refuse({ id: 'cap-red', coins: cap.price - 1 }, 'not enough coins');
  // One coin short is short. A shop that rounds in the child's favour is a shop where the
  // price on the card is not the price.
  assert.equal(priceOf({ ...rich, id: 'cap-red', coins: cap.price }).id, 'cap-red');
});

test('wearing replaces the thing in that slot rather than stacking two hats', () => {
  const owned = ['cap-red', 'cap-navy', 'scarf'];
  let worn = wear({ owned, worn: [], id: 'cap-red' });
  assert.deepEqual(worn, ['cap-red']);
  worn = wear({ owned, worn, id: 'scarf' });
  assert.deepEqual(worn.sort(), ['cap-red', 'scarf']);
  worn = wear({ owned, worn, id: 'cap-navy' });
  assert.deepEqual(worn.sort(), ['cap-navy', 'scarf'], 'the red cap came off when the navy went on');
  // Taking off is wearing nothing there, and does not disturb the other slots.
  worn = wear({ owned, worn, id: 'cap-navy', off: true });
  assert.deepEqual(worn, ['scarf']);
});

test('a child cannot wear what they have not bought', () => {
  assert.throws(() => wear({ owned: [], worn: [], id: 'crown' }),
    (e) => e instanceof WardrobeError && e.message === 'not yours');
  assert.throws(() => wear({ owned: [], worn: [], id: 'nope' }),
    (e) => e instanceof WardrobeError && e.message === 'no such item');
  // Taking something off is always allowed: a save written by an older build may hold an
  // item this child no longer owns, and they must be able to get it off their head.
  assert.deepEqual(wear({ owned: [], worn: ['crown'], id: 'crown', off: true }), []);
});

test('a tampered save loads as a wearable outfit rather than a crash', () => {
  // What comes back out of the store is a string a page once sent. None of this is
  // trusted: unknown ids go, duplicates go, and a second hat in the hat slot goes.
  assert.deepEqual(sanitizeOwned(['cap-red', 'cap-red', 'ghost', 7, null]), ['cap-red']);
  assert.deepEqual(sanitizeOwned('crown'), []);
  assert.deepEqual(sanitizeOwned(undefined), []);
  assert.deepEqual(sanitizeWorn(WARDROBE, ['cap-red', 'cap-navy', 'scarf']), ['cap-red', 'scarf']);
  assert.deepEqual(sanitizeWorn(WARDROBE, ['ghost', { id: 'crown' }]), []);
  assert.deepEqual(sanitizeWorn(WARDROBE, null), []);
});

test('the cheapest thing in the shop is a morning of fishing, and the dearest is a term', () => {
  // Not arithmetic so much as a promise to a seven-year-old: something buyable today, and
  // something worth coming back for. Both ends drift when items get added, so they are
  // pinned here rather than in a comment.
  const prices = WARDROBE.items.map((i) => i.price).sort((a, b) => a - b);
  assert.ok(prices[0] <= 60, `nothing under 60 coins: cheapest is ${prices[0]}`);
  assert.ok(prices.at(-1) >= 300, `nothing to save for: dearest is ${prices.at(-1)}`);
  // And the dear things are the locked ones, so a child cannot buy the crown on day one
  // by selling every fish they own.
  for (const it of WARDROBE.items) {
    if (it.price >= 300) assert.ok(it.level >= 5, `${it.id} costs ${it.price} but unlocks at ${it.level}`);
  }
});

test('every item in the file is something the page knows how to draw', async () => {
  // The shop shows a picture of the thing, so an item whose `kind` has no model is a card
  // with a blank in it. `itemModel` returns null rather than throwing — which is right, it
  // keeps a data file that runs ahead of the code from breaking the island — but that
  // makes a typo in `kind` completely silent. This is where it stops being silent.
  const { itemModel, KNOWN_KINDS } = await import('../../client/dist/wardrobe-models.js');
  const blank = WARDROBE.items.filter((i) => !itemModel(i));
  assert.deepEqual(blank.map((i) => `${i.id}:${i.kind}`), [], 'these items have no model');
  // And the other way: a shape nobody wears is dead code carrying a comment that lies.
  const unworn = KNOWN_KINDS.filter((k) => !WARDROBE.items.some((i) => i.kind === k));
  assert.deepEqual(unworn, [], 'these shapes are drawn by nothing');
});

test('きせかえ島 is laid out so a child can walk to all four shops', () => {
  // The island's coordinates live in this same file, and the page builds the island from
  // them. The walking itself is checked in the browser by client/tests/regression.mjs;
  // what is checked here is that the data cannot say something impossible.
  const raw = JSON.parse(readFileSync(new URL('../../client/dist/wardrobe.json', import.meta.url), 'utf8'));
  const isle = raw.island;
  assert.ok(isle, 'wardrobe.json carries きせかえ島');
  assert.equal(isle.spots.length, WARDROBE.slots.length, 'one shop per slot, no more and no less');
  for (const spot of isle.spots) {
    assert.ok(WARDROBE.slots.some((s) => s.id === spot.slot), `${spot.id} sells "${spot.slot}", which is not a slot`);
    // island-kit works to ±30 by ±25 around the island's centre, and a building sits
    // 4.6 behind its spot and is 6.4 deep.
    assert.ok(Math.abs(spot.x) <= 26, `${spot.id} is off the side of the island`);
    assert.ok(spot.z - 4.6 - 3.2 >= -25 && spot.z <= 22, `${spot.id} is off the end of the island`);
    for (const other of isle.spots) {
      if (other.id === spot.id) continue;
      assert.ok(Math.hypot(spot.x - other.x, spot.z - other.z) > 10, `${spot.id} and ${other.id} overlap`);
    }
  }
  // Every shop sells a different slot, or two doors lead to the same rail.
  assert.equal(new Set(isle.spots.map((s) => s.slot)).size, isle.spots.length);
});
