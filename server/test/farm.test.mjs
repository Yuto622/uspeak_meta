// ぼくじょう島: the farm grows only on right answers, the answers never leave the
// server, the data the page draws is the data the room judges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FARM, BANK, blankFarm, sanitizeFarm, settle, prepare, judge, askPayload, statePayload, farmDay, DAY_MS, seasonId, valueOf, spotForAct, FarmError,
} from '../src/game/farm.js';

// A moment in each real season, so a test does not depend on today.
const AT = { spring: Date.UTC(2026, 3, 10, 3), summer: Date.UTC(2026, 6, 10, 3), autumn: Date.UTC(2026, 9, 10, 3), winter: Date.UTC(2026, 0, 10, 3) };
const spring = AT.spring;
const rich = { now: spring, coins: 1000, spot: 'seeds' };

test('the island is sound: five buildings, far enough apart, with a shop, a field, a barn, a box and a kitchen', () => {
  assert.equal(FARM.island.spots.length, 5);
  for (const kind of ['shop', 'field', 'barn', 'ship', 'kitchen']) assert.ok(FARM.island.spots.some((s) => s.kind === kind), kind);
  for (const a of FARM.island.spots) for (const b of FARM.island.spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 10, `${a.id}/${b.id}`);
  // Every season has a first crop a brand-new farmer can buy, and the shop is empty of
  // nothing in any season.
  for (const season of Object.keys(AT)) assert.ok([...FARM.crops.values()].some((c) => c.season === season && c.hearts === 0), season);
  assert.equal(seasonId(AT.spring), 'spring'); assert.equal(seasonId(AT.winter), 'winter');
  // Every recipe has its steps in the bank, and every bank line has three wrong answers.
  for (const r of FARM.recipes.values()) assert.ok(BANK.cook[r.id].length >= 3, r.id);
});

test('a day is one turn of the world clock, and the state the page sees carries no answer', () => {
  assert.equal(farmDay(DAY_MS * 10 + 5), 10);
  const farm = blankFarm();
  const q = prepare(farm, 'talk', {}, rich);
  farm.q = q;
  const state = statePayload(farm, spring);
  assert.equal(state.plots.length, FARM.plotCount);
  assert.ok(!('answer' in state.pending), 'the pending question is sent without its answer');
  assert.ok(!('effect' in state.pending));
  assert.ok(!JSON.stringify(askPayload(q)).includes(q.answer) || q.kind === 'reply' || q.kind === 'word', 'order/spell questions never carry the sentence');
  assert.ok(state.catalog.seeds.every((c) => c.season === 'spring'), 'spring seeds only');
});

test('buying is a sentence put in order; the seeds arrive only on the right order', () => {
  const farm = blankFarm();
  const q = prepare(farm, 'buy', { item: 'turnip', qty: 3 }, rich);
  assert.equal(q.kind, 'order');
  assert.equal(q.cost, 3 * FARM.crops.get('turnip').seed);
  assert.deepEqual([...q.tokens].sort(), q.answer.split(' ').sort(), 'the tokens are exactly the sentence, shuffled');
  assert.equal(judge(q, q.tokens), judge(q, q.answer.split(' ')) && q.tokens.join(' ') === q.answer, 'a shuffled order is wrong unless it happens to be right');
  assert.equal(judge(q, "i'd like three turnip seeds, please."), true, 'case is forgiven');
  assert.equal(judge(q, 'I like three turnip seeds, please.'), false, 'a word is not');
  const effect = q.effect(farm);
  assert.equal(effect.spend, q.cost);
  assert.equal(farm.seeds.turnip, 3);
  // Out of season, locked, or broke: refused before any question is asked.
  assert.throws(() => prepare(farm, 'buy', { item: 'tomato' }, rich), FarmError);
  assert.throws(() => prepare(farm, 'buy', { item: 'cucumber' }, rich), /locked/);
  assert.throws(() => prepare(farm, 'buy', { item: 'turnip' }, { ...rich, coins: 1 }), /coins/);
});

test('plant, water twice, harvest: a turnip in one lesson', () => {
  const farm = blankFarm();
  farm.seeds.turnip = 1;
  const plant = prepare(farm, 'plant', { plot: 4, crop: 'turnip' }, rich);
  assert.equal(plant.kind, 'word');
  assert.ok(plant.choices.includes('turnip') && plant.choices.length === 4);
  assert.equal(judge(plant, 'Turnip'), true);
  plant.effect(farm);
  assert.equal(farm.seeds.turnip, undefined, 'the seed is used');
  assert.equal(farm.plots[4].crop, 'turnip');
  assert.throws(() => prepare(farm, 'plant', { plot: 4, crop: 'turnip' }, rich), /taken|no seeds/);
  // Day 1: water. The question is a farm sentence with a hole.
  let now = spring;
  const w1 = prepare(farm, 'water', {}, { ...rich, now });
  assert.equal(w1.kind, 'fill');
  assert.ok(w1.choices.includes(w1.answer) && w1.choices.length === 4);
  assert.deepEqual(w1.plots, [4]);
  w1.effect(farm);
  assert.equal(farm.plots[4].growth, 1);
  assert.throws(() => prepare(farm, 'water', {}, { ...rich, now }), /nothing to water/, 'once a day');
  assert.equal(statePayload(farm, now).plots[4].watered, true);
  // Day 2.
  now += DAY_MS;
  prepare(farm, 'water', {}, { ...rich, now }).effect(farm);
  assert.equal(farm.plots[4].growth, 2);
  assert.equal(statePayload(farm, now).plots[4].ready, true);
  const h = prepare(farm, 'harvest', { plot: 4 }, { ...rich, now });
  assert.equal(h.kind, 'order');
  assert.match(h.answer, /^I picked a turnip today!$/);
  h.effect(farm);
  assert.equal(farm.items.turnip, 1);
  assert.equal(farm.plots[4], null, 'a turnip does not grow back');
  assert.ok(farm.dex.includes('turnip'));
});

test('a silver can waters two plots per answer; a regrowing crop comes back; a wilted one is cleared', () => {
  const farm = blankFarm();
  farm.hearts.seeds = 2;
  farm.seeds.cucumber = 2;
  prepare(farm, 'plant', { plot: 0, crop: 'cucumber' }, rich).effect(farm);
  prepare(farm, 'plant', { plot: 1, crop: 'cucumber' }, rich).effect(farm);
  const tool = prepare(farm, 'tool', { item: 'can2' }, rich);
  assert.equal(tool.cost, FARM.tools.get('can2').price);
  tool.effect(farm);
  assert.equal(farm.can, 2);
  let now = spring;
  const w = prepare(farm, 'water', {}, { ...rich, now });
  assert.deepEqual(w.plots, [0, 1]);
  w.effect(farm);
  assert.equal(farm.plots[0].growth + farm.plots[1].growth, 2);
  for (let d = 1; d < 4; d += 1) { now += DAY_MS; prepare(farm, 'water', {}, { ...rich, now }).effect(farm); }
  assert.equal(statePayload(farm, now).plots[0].ready, true);
  prepare(farm, 'harvest', { plot: 0 }, { ...rich, now }).effect(farm);
  assert.equal(farm.plots[0].crop, 'cucumber', 'cucumbers regrow');
  assert.equal(farm.plots[0].growth, FARM.crops.get('cucumber').days - FARM.crops.get('cucumber').regrow);
  // Summer comes: spring plots wilt, and clearing one is an English sentence too.
  settle(farm, AT.summer);
  assert.equal(statePayload(farm, AT.summer).plots[1].wilted, true);
  assert.throws(() => prepare(farm, 'harvest', { plot: 1 }, { ...rich, now: AT.summer }), /not ready/);
  const c = prepare(farm, 'clear', { plot: 1 }, { ...rich, now: AT.summer });
  assert.equal(c.kind, 'order');
  c.effect(farm);
  assert.equal(farm.plots[1], null);
});

test('animals: feed and brush for a heart, collect only when fed, and the product pays more with hearts', () => {
  const farm = blankFarm();
  const buy = prepare(farm, 'buy', { item: 'chicken', name: 'Coco' }, { ...rich, spot: 'seeds' });
  assert.equal(buy.cost, 80);
  buy.effect(farm);
  assert.equal(farm.animals[0].name, 'Coco');
  assert.throws(() => prepare(farm, 'collect', { animal: 0 }, rich), /hungry/);
  const feed = prepare(farm, 'feed', { animal: 0 }, rich);
  assert.equal(feed.kind, 'order');
  assert.match(feed.answer, /chicken some corn/);
  feed.effect(farm);
  assert.throws(() => prepare(farm, 'feed', { animal: 0 }, rich), /already fed/);
  const brush = prepare(farm, 'brush', { animal: 0 }, rich);
  assert.equal(brush.kind, 'reply');
  brush.effect(farm);
  assert.equal(farm.animals[0].hearts, 1, 'fed and brushed on the same day is a heart');
  const col = prepare(farm, 'collect', { animal: 0 }, rich);
  assert.equal(col.kind, 'word');
  assert.ok(col.choices.includes('egg'));
  col.effect(farm);
  assert.equal(farm.items.egg, 1);
  assert.throws(() => prepare(farm, 'collect', { animal: 0 }, rich), /already/);
  const egg = FARM.items.get('egg');
  const plain = valueOf(blankFarm(), egg, 1);
  farm.animals[0].hearts = 10;
  assert.ok(valueOf(farm, egg, 1) > plain, 'hearts lift the price');
  // The barn's size and its locks.
  assert.throws(() => prepare(farm, 'buy', { item: 'cow' }, rich), /locked/);
  farm.hearts.barn = 4;
  for (let i = farm.animals.length; i < FARM.animalLimit; i += 1) prepare(farm, 'buy', { item: 'chicken' }, rich).effect(farm);
  assert.throws(() => prepare(farm, 'buy', { item: 'cow' }, rich), /full/);
});

test('shipping is spelling, cooking is sequencing, and both leave words in the dex', () => {
  const farm = blankFarm();
  farm.items = { egg: 2, tomato: 2 };
  const ship = prepare(farm, 'ship', { item: 'tomato', qty: 2 }, { ...rich, spot: 'ship' });
  assert.equal(ship.kind, 'spell');
  assert.ok(!('answer' in askPayload(ship)));
  assert.match(ship.hint, /^t/);
  assert.equal(judge(ship, ' TOMATO '), true);
  assert.equal(judge(ship, 'tomatoe'), false);
  assert.equal(ship.value, 2 * FARM.crops.get('tomato').sell);
  const e = ship.effect(farm);
  assert.equal(e.award, ship.value);
  assert.equal(farm.items.tomato, undefined);
  assert.equal(farm.shipped, 2);
  const cook = prepare(farm, 'cook', { recipe: 'omelet' }, { ...rich, spot: 'kitchen' });
  assert.equal(cook.kind, 'order');
  assert.equal(cook.steps, true);
  assert.equal(cook.tokens.length, 4);
  assert.equal(judge(cook, BANK.cook.omelet), true);
  assert.equal(judge(cook, [...BANK.cook.omelet].reverse()), false);
  cook.effect(farm);
  assert.equal(farm.items.omelet, 1);
  assert.equal(farm.items.egg, undefined);
  assert.throws(() => prepare(farm, 'cook', { recipe: 'omelet' }, { ...rich, spot: 'kitchen' }), /missing/);
  assert.throws(() => prepare(farm, 'cook', { recipe: 'pumpkin-pie' }, { ...rich, spot: 'kitchen' }), /locked/);
  assert.ok(farm.dex.includes('tomato') && farm.dex.includes('omelet'));
  // The dish sells for twice its ingredients.
  assert.equal(FARM.items.get('omelet').sell, 2 * 2 * FARM.items.get('egg').sell);
});

test('villagers: one talk a day for a heart, a loved gift for two, and hearts open the shelves', () => {
  const farm = blankFarm();
  const talk = prepare(farm, 'talk', {}, { ...rich, spot: 'house' });
  assert.equal(talk.kind, 'reply');
  assert.match(talk.prompt.en, /^Gramps: /);
  talk.effect(farm);
  assert.equal(farm.hearts.house, 1);
  assert.throws(() => prepare(farm, 'talk', {}, { ...rich, spot: 'house' }), /already talked/);
  farm.items.strawberry = 1;
  const gift = prepare(farm, 'gift', { item: 'strawberry' }, { ...rich, spot: 'seeds' });
  assert.match(gift.answer, /Hana/);
  gift.effect(farm);
  assert.equal(farm.hearts.seeds, 2, 'Hana loves strawberries');
  assert.ok(statePayload(farm, spring).catalog.seeds.find((c) => c.id === 'cucumber').locked === false);
  assert.throws(() => prepare(farm, 'gift', { item: 'strawberry' }, { ...rich, spot: 'seeds' }), /already gifted|nothing to give/);
});

test('every action belongs to a building, and a saved farm comes back whole but never bigger than the rules', () => {
  assert.equal(spotForAct('water'), 'house');
  assert.equal(spotForAct('ship'), 'ship');
  assert.equal(spotForAct('talk', 'barn'), 'barn');
  assert.equal(spotForAct('fly', 'barn'), null);
  const farm = blankFarm();
  farm.seeds.turnip = 2; farm.items.egg = 1; farm.can = 2; farm.hearts.barn = 3; farm.dex = ['egg'];
  farm.animals.push({ kind: 'cow', name: 'Momo', hearts: 3, fed: 1, brushed: 1, got: 0 });
  const back = sanitizeFarm(JSON.parse(JSON.stringify({ ...farm, q: null })));
  assert.deepEqual(back.seeds, { turnip: 2 });
  assert.equal(back.animals[0].name, 'Momo');
  assert.equal(back.can, 2);
  // Rubbish in a record does not become a farm.
  const junk = sanitizeFarm({ plots: [{ crop: 'gold' }], seeds: { gold: 99 }, can: 99, hearts: { nowhere: 5, barn: 99 }, animals: [{ kind: 'dragon' }] });
  assert.equal(junk.plots[0], null);
  assert.deepEqual(junk.seeds, {});
  assert.equal(junk.can, 3);
  assert.deepEqual(junk.hearts, { barn: 10 });
  assert.equal(junk.animals.length, 0);
});
