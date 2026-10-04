// ぼくじょう島: the farm grows only on right answers, the answers never leave the
// server, the data the page draws is the data the room judges — and the English is
// 英検5級, short enough for a seven-year-old.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FARM, BANK, blankFarm, sanitizeFarm, settle, prepare, judge, askPayload, statePayload, farmDay, DAY_MS, seasonId, valueOf, spotForAct, FarmError,
  rainyDay, isRainy, weatherOf, daysToRain, DRY_DAYS,
} from '../src/game/farm.js';

// A moment in each real season, so a test does not depend on today.
const AT = { spring: Date.UTC(2026, 3, 10, 3), summer: Date.UTC(2026, 6, 10, 3), autumn: Date.UTC(2026, 9, 10, 3), winter: Date.UTC(2026, 0, 10, 3) };
// The weather is the day's. The fixtures below want a dry day, so `spring` is the first
// dry farm day from April 10; the rain tests pick their own rainy and dry days.
const dryFrom = (t) => { let d = farmDay(t); while (rainyDay(d)) d += 1; return d * DAY_MS + DAY_MS / 2; };
const rainFrom = (t) => { let d = farmDay(t); while (!rainyDay(d)) d += 1; return d * DAY_MS + DAY_MS / 2; };
const spring = dryFrom(AT.spring);
const rich = { now: spring, coins: 1000, spot: 'seeds' };

test('the island is sound: five buildings, far enough apart, with a shop, a field, a barn, a box and a kitchen', () => {
  assert.equal(FARM.island.spots.length, 5);
  for (const kind of ['shop', 'field', 'barn', 'ship', 'kitchen']) assert.ok(FARM.island.spots.some((s) => s.kind === kind), kind);
  for (const a of FARM.island.spots) for (const b of FARM.island.spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 10, `${a.id}/${b.id}`);
  for (const season of Object.keys(AT)) assert.ok([...FARM.crops.values()].some((c) => c.season === season && c.hearts === 0), season);
  assert.equal(seasonId(AT.spring), 'spring'); assert.equal(seasonId(AT.winter), 'winter');
});

test('the English is 英検5級: short answers, a picture on every question, Japanese beside it', () => {
  for (const w of BANK.water) {
    assert.ok(w.pic, w.q);
    assert.ok(w.q.split(' ').length <= 6, `"${w.q}" is short`);
    for (const c of [w.a, ...w.d]) assert.ok(!c.includes(' '), `"${c}" is one word`);
  }
  for (const t of BANK.talk) {
    assert.ok(t.says.split(' ').length <= 7, `"${t.says}" is short`);
    for (const c of [t.a, ...t.d]) assert.ok(c.split(' ').length <= 6, `"${c}" is short`);
  }
  // Every action, asked of a full farm, carries a picture and a Japanese line, and no
  // answer is longer than four words.
  const farm = blankFarm();
  farm.hearts = { seeds: 10, barn: 10, kitchen: 10 };
  farm.seeds.turnip = 1; farm.items = { egg: 3, milk: 1, potato: 1, cucumber: 1, carrot: 1 };
  farm.animals.push({ kind: 'cow', name: 'Momo', hearts: 0, fed: -1, brushed: -1, got: -1 });
  farm.plots[1] = { crop: 'turnip', growth: 0, last: -1, planted: 0 };
  const asks = [
    ['buy', { item: 'turnip', qty: 3 }, 'seeds'], ['buy', { item: 'cow' }, 'seeds'], ['tool', { item: 'can2' }, 'seeds'],
    ['plant', { plot: 0, crop: 'turnip' }, 'house'], ['water', {}, 'house'], ['feed', { animal: 0 }, 'barn'], ['brush', { animal: 0 }, 'barn'], ['trough', { animal: 0 }, 'barn'],
    ['ship', { item: 'egg' }, 'ship'], ['ship', { item: 'cucumber' }, 'ship'], ['cook', { recipe: 'pancakes' }, 'kitchen'], ['talk', {}, 'kitchen'], ['gift', { item: 'egg' }, 'seeds'],
  ];
  for (const [act, params, spot] of asks) {
    const q = prepare(farm, act, params, { ...rich, spot });
    assert.ok(q.pic, `${act} has a picture`);
    assert.ok(q.prompt.ja, `${act} has Japanese`);
    assert.ok(q.answer.split(' ').length <= 4, `${act}: "${q.answer}" is short`);
    assert.ok(!('answer' in askPayload(q)) && !('effect' in askPayload(q)), `${act}: no answer on the wire`);
  }
});

test('a day is one turn of the world clock, and the state the page sees carries no answer', () => {
  assert.equal(farmDay(DAY_MS * 10 + 5), 10);
  const farm = blankFarm();
  farm.q = prepare(farm, 'talk', {}, rich);
  const state = statePayload(farm, spring);
  assert.equal(state.plots.length, FARM.plotCount);
  assert.ok(!('answer' in state.pending) && !('effect' in state.pending));
  assert.ok(state.catalog.seeds.every((c) => c.season === 'spring'), 'spring seeds only');
});

test('buying is three cards in order — "Three turnips, please." — and the seeds arrive only on the right order', () => {
  const farm = blankFarm();
  const q = prepare(farm, 'buy', { item: 'turnip', qty: 3 }, rich);
  assert.equal(q.kind, 'order');
  assert.equal(q.answer, 'Three turnips, please.');
  assert.equal(q.tokens.length, 3);
  assert.notEqual(q.tokens.join(' '), q.answer, 'the cards are not already in order');
  assert.equal(q.cost, 3 * FARM.crops.get('turnip').seed);
  assert.equal(judge(q, ['Three', 'turnips,', 'please.']), true);
  assert.equal(judge(q, ['please.', 'Three', 'turnips,']), false);
  assert.equal(prepare(farm, 'buy', { item: 'potato', qty: 1 }, rich).answer, 'A potato, please.');
  const got = q.effect(farm);
  assert.equal(farm.seeds.turnip, 3);
  // The effect names what the room must charge: without `spend` the shop would be free.
  assert.equal(got.spend, q.cost);
  assert.equal(prepare(blankFarm(), 'tool', { item: 'can2' }, rich).effect(blankFarm()).spend, FARM.tools.get('can2').price);
  assert.throws(() => prepare(farm, 'buy', { item: 'tomato' }, rich), FarmError);
  assert.throws(() => prepare(farm, 'buy', { item: 'cucumber' }, rich), /locked/);
  assert.throws(() => prepare(farm, 'buy', { item: 'turnip' }, { ...rich, coins: 1 }), /coins/);
});

test('plant by picture, water by a word in a sentence, harvest by counting', () => {
  const farm = blankFarm();
  farm.seeds.turnip = 1;
  const plant = prepare(farm, 'plant', { plot: 4, crop: 'turnip' }, rich);
  assert.equal(plant.kind, 'word');
  assert.ok(plant.choices.includes('turnip') && plant.choices.length === 4);
  assert.match(plant.prompt.en, /What is this\?/);
  plant.effect(farm);
  assert.equal(farm.plots[4].crop, 'turnip');
  let now = spring;
  const w1 = prepare(farm, 'water', {}, { ...rich, now });
  assert.equal(w1.kind, 'fill');
  assert.ok(w1.prompt.en.includes('___') && w1.choices.includes(w1.answer) && w1.choices.length === 4);
  w1.effect(farm);
  assert.throws(() => prepare(farm, 'water', {}, { ...rich, now }), /nothing to water/, 'once a day');
  now = dryFrom(now + DAY_MS);
  prepare(farm, 'water', {}, { ...rich, now }).effect(farm);
  assert.equal(statePayload(farm, now).plots[4].ready, true);
  const h = prepare(farm, 'harvest', { plot: 4 }, { ...rich, now });
  assert.equal(h.kind, 'word');
  assert.match(h.prompt.en, /How many\?/);
  const n = ['one', 'two', 'three'].indexOf(h.answer) + 1;
  assert.ok(n >= 1, `a harvest is one to three, said in English: ${h.answer}`);
  assert.equal([...h.pic].length, n, 'the picture shows exactly that many');
  h.effect(farm);
  assert.equal(farm.items.turnip, n);
  assert.equal(farm.plots[4], null);
});

test('a silver can waters two plots per answer; a regrowing crop comes back; a wilted plot asks the season', () => {
  const farm = blankFarm();
  farm.hearts.seeds = 2;
  farm.seeds.cucumber = 2;
  prepare(farm, 'plant', { plot: 0, crop: 'cucumber' }, rich).effect(farm);
  prepare(farm, 'plant', { plot: 1, crop: 'cucumber' }, rich).effect(farm);
  const tool = prepare(farm, 'tool', { item: 'can2' }, rich);
  assert.equal(tool.answer, 'watering can');
  tool.effect(farm);
  let now = spring;
  const w = prepare(farm, 'water', {}, { ...rich, now });
  assert.deepEqual(w.plots, [0, 1]);
  w.effect(farm);
  for (let d = 1; d < 4; d += 1) { now = dryFrom(now + DAY_MS); prepare(farm, 'water', {}, { ...rich, now }).effect(farm); }
  prepare(farm, 'harvest', { plot: 0 }, { ...rich, now }).effect(farm);
  assert.equal(farm.plots[0].crop, 'cucumber', 'cucumbers regrow');
  settle(farm, AT.summer);
  assert.equal(statePayload(farm, AT.summer).plots[1].wilted, true);
  const c = prepare(farm, 'clear', { plot: 1 }, { ...rich, now: AT.summer });
  assert.equal(c.answer, 'summer');
  c.effect(farm);
  assert.equal(farm.plots[1], null);
});

test('animals: feed by its sound, brush by its name, collect by what it gives', () => {
  const farm = blankFarm();
  const buy = prepare(farm, 'buy', { item: 'chicken', name: 'Coco' }, rich);
  assert.equal(buy.answer, 'A chicken, please.');
  buy.effect(farm);
  assert.throws(() => prepare(farm, 'collect', { animal: 0 }, rich), /hungry/);
  const feed = prepare(farm, 'feed', { animal: 0 }, rich);
  assert.equal(feed.answer, 'Cluck');
  assert.ok(feed.choices.includes('Moo'));
  feed.effect(farm);
  const brush = prepare(farm, 'brush', { animal: 0 }, rich);
  assert.equal(brush.answer, 'chicken');
  brush.effect(farm);
  assert.equal(farm.animals[0].hearts, 1, 'fed and brushed on the same day is a heart');
  assert.throws(() => prepare(farm, 'collect', { animal: 0 }, rich), /thirsty/, 'fed but not watered: no egg yet');
  const drink = prepare(farm, 'trough', { animal: 0 }, rich);
  assert.ok(drink.prompt.en.includes('___'), 'the trough asks the same fill-in as the field');
  drink.effect(farm);
  assert.throws(() => prepare(farm, 'trough', { animal: 0 }, rich), /already watered/);
  const col = prepare(farm, 'collect', { animal: 0 }, rich);
  assert.equal(col.answer, 'egg');
  col.effect(farm);
  assert.equal(farm.items.egg, 1);
  const egg = FARM.items.get('egg');
  farm.animals[0].hearts = 10;
  assert.ok(valueOf(farm, egg, 1) > valueOf(blankFarm(), egg, 1), 'hearts lift the price');
});

test('shipping spells the word — tiles for a short word, three spellings for a long one', () => {
  const farm = blankFarm();
  farm.items = { egg: 2, pumpkin: 1 };
  const egg = prepare(farm, 'ship', { item: 'egg', qty: 2 }, { ...rich, spot: 'ship' });
  assert.equal(egg.kind, 'letters');
  assert.deepEqual([...egg.tokens].sort(), ['e', 'g', 'g']);
  assert.equal(judge(egg, ['e', 'g', 'g']), true);
  assert.equal(judge(egg, ['g', 'e', 'g']), false);
  assert.equal(egg.value, 2 * FARM.items.get('egg').sell);
  const e = egg.effect(farm);
  assert.equal(e.award, egg.value);
  assert.equal(farm.items.egg, undefined);
  const pumpkin = prepare(farm, 'ship', { item: 'pumpkin' }, { ...rich, spot: 'ship' });
  assert.equal(pumpkin.kind, 'spell', 'seven letters: pick the right spelling instead');
  assert.equal(pumpkin.choices.length, 3);
  assert.ok(pumpkin.choices.includes('pumpkin'));
  assert.equal(new Set(pumpkin.choices).size, 3, 'three different spellings');
});

test('cooking asks what goes in, and the dish sells for twice its ingredients', () => {
  const farm = blankFarm();
  farm.items = { egg: 2 };
  const cook = prepare(farm, 'cook', { recipe: 'omelet' }, { ...rich, spot: 'kitchen' });
  assert.equal(cook.answer, 'egg');
  assert.ok(!cook.choices.filter((c) => c !== 'egg').includes('egg'));
  cook.effect(farm);
  assert.equal(farm.items.omelet, 1);
  assert.throws(() => prepare(farm, 'cook', { recipe: 'omelet' }, { ...rich, spot: 'kitchen' }), /missing/);
  assert.throws(() => prepare(farm, 'cook', { recipe: 'pumpkin-pie' }, { ...rich, spot: 'kitchen' }), /locked/);
  assert.equal(FARM.items.get('omelet').sell, 2 * 2 * FARM.items.get('egg').sell);
});

test('villagers: one talk a day for a heart, "This is for you." for a gift', () => {
  const farm = blankFarm();
  const talk = prepare(farm, 'talk', {}, { ...rich, spot: 'house' });
  assert.equal(talk.kind, 'reply');
  assert.match(talk.prompt.en, /^Gramps: /);
  talk.effect(farm);
  assert.equal(farm.hearts.house, 1);
  assert.throws(() => prepare(farm, 'talk', {}, { ...rich, spot: 'house' }), /already talked/);
  farm.items.strawberry = 1;
  const gift = prepare(farm, 'gift', { item: 'strawberry' }, { ...rich, spot: 'seeds' });
  assert.equal(gift.answer, 'This is for you.');
  gift.effect(farm);
  assert.equal(farm.hearts.seeds, 2, 'Hana loves strawberries');
});

test('every action belongs to a building, and a saved farm comes back whole but never bigger than the rules', () => {
  // Field work is checked at the field when the page says it is standing there, and at the
  // greenhouse otherwise; the two open places sit where the page draws them.
  assert.equal(spotForAct('water'), 'field');
  assert.equal(spotForAct('water', 'house'), 'house');
  assert.equal(spotForAct('plant', 'barn'), 'field');
  assert.equal(spotForAct('feed', 'pen'), 'pen');
  assert.equal(spotForAct('talk', 'barn'), 'barn');
  assert.equal(spotForAct('fly', 'barn'), null);
  const field = FARM.placeById.get('field'); const pen = FARM.placeById.get('pen');
  assert.ok(field && pen && FARM.placeById.size === FARM.spotById.size + 2);
  assert.equal(field.x, FARM.plots.x + ((FARM.plots.cols - 1) * FARM.plots.gap) / 2);
  assert.equal(pen.wz, FARM.island.z + FARM.pen.z);
  assert.throws(() => prepare(blankFarm(), 'talk', {}, { ...rich, spot: 'field' }), /no such spot/, 'nobody lives on the field');
  const farm = blankFarm();
  farm.seeds.turnip = 2; farm.can = 2; farm.hearts.barn = 3;
  farm.animals.push({ kind: 'cow', name: 'Momo', hearts: 3, fed: 1, brushed: 1, got: 0 });
  const back = sanitizeFarm(JSON.parse(JSON.stringify({ ...farm, q: null })));
  assert.deepEqual(back.seeds, { turnip: 2 });
  assert.equal(back.animals[0].name, 'Momo');
  const junk = sanitizeFarm({ plots: [{ crop: 'gold' }], seeds: { gold: 99 }, can: 99, hearts: { nowhere: 5, barn: 99 }, animals: [{ kind: 'dragon' }] });
  assert.equal(junk.plots[0], null);
  assert.deepEqual(junk.seeds, {});
  assert.equal(junk.can, 3);
  assert.deepEqual(junk.hearts, { barn: 10 });
  assert.equal(junk.animals.length, 0);
});

test('rain: the day decides, the same for everyone, about three days in ten', () => {
  let wet = 0; for (let d = 0; d < 1000; d += 1) if (rainyDay(d)) wet += 1;
  assert.ok(wet > 200 && wet < 400, `${wet} rainy days in 1000`);
  assert.equal(rainyDay(42), rainyDay(42));
  const t = rainFrom(AT.summer);
  assert.equal(weatherOf(t), 'rain'); assert.equal(isRainy(t), true);
  assert.equal(weatherOf(dryFrom(AT.summer)), 'sun');
  const k = daysToRain(dryFrom(AT.summer)); assert.ok(k === null || (k >= 1 && rainyDay(farmDay(dryFrom(AT.summer)) + k)));
});

test('a rainy day waters every plot (and it grows) and every trough; nothing to water that day', () => {
  const farm = blankFarm();
  const sunny = dryFrom(AT.summer);
  farm.plots[0] = { crop: 'tomato', growth: 0, last: -1, planted: farmDay(sunny) };
  farm.animals.push({ kind: 'cow', name: 'Momo', hearts: 0, fed: -1, brushed: -1, wet: -1, got: -1 });
  settle(farm, sunny);
  assert.equal(farm.plots[0].growth, 0, 'a dry day waters nothing by itself');
  const rainy = rainFrom(sunny + DAY_MS);
  const st = statePayload(farm, rainy);
  assert.equal(st.weather, 'rain');
  assert.equal(st.plots[0].watered, true); assert.equal(st.plots[0].growth, 1, 'the rain watered it and it grew');
  assert.equal(st.animals[0].wet, true, 'the rain filled the trough');
  assert.throws(() => prepare(farm, 'water', {}, { ...rich, now: rainy, spot: 'field' }), /nothing to water/);
  assert.throws(() => prepare(farm, 'trough', { animal: 0 }, { ...rich, now: rainy, spot: 'pen' }), /rain did it/);
  // Feeding is still a chore in the rain; then the cow gives milk without a watering.
  prepare(farm, 'feed', { animal: 0 }, { ...rich, now: rainy, spot: 'pen' }).effect(farm);
  const col = prepare(farm, 'collect', { animal: 0 }, { ...rich, now: rainy, spot: 'pen' });
  assert.equal(col.answer, 'milk');
});

test('a plot left dry wilts after DRY_DAYS days; a rainy day in between saves it; days away are replayed', () => {
  assert.equal(DRY_DAYS, 3);
  // Three dry days in a row, found on the calendar.
  let d0 = farmDay(AT.autumn); while (!(!rainyDay(d0) && !rainyDay(d0 + 1) && !rainyDay(d0 + 2) && !rainyDay(d0 + 3))) d0 += 1;
  const at = (d) => d * DAY_MS + DAY_MS / 2;
  const farm = blankFarm();
  farm.plots[0] = { crop: 'pumpkin', growth: 0, last: -1, planted: d0 };
  farm.settled = d0;
  settle(farm, at(d0 + 2)); assert.equal(!!farm.plots[0].wilted, false, 'two dry days: still alive');
  settle(farm, at(d0 + 3)); assert.equal(farm.plots[0].wilted, true, 'three dry days: wilted');
  // The same plot, but it rains on the second day: it drinks, grows, and lives.
  let r0 = farmDay(AT.autumn); while (!(!rainyDay(r0) && rainyDay(r0 + 1))) r0 += 1;
  const farm2 = blankFarm();
  farm2.plots[0] = { crop: 'pumpkin', growth: 0, last: -1, planted: r0 };
  farm2.settled = r0;
  settle(farm2, at(r0 + 3));
  assert.equal(!!farm2.plots[0].wilted, false); assert.ok(farm2.plots[0].growth >= 1); assert.equal(farm2.settled, r0 + 3);
  // A saved farm remembers how far the weather was applied.
  const back = sanitizeFarm(JSON.parse(JSON.stringify(farm2)));
  assert.equal(back.settled, r0 + 3); assert.equal(back.animals.length, 0);
});
