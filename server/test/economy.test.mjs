import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, blankWallet, sanitizeWallet, EconomyError } from '../src/game/economy.js';
import { FISH, ITEMS } from '../../client/dist/fishing-data.js';
import { WANDS } from '../../client/dist/magic-data.js';

test('sell requires server-side inventory', () => {
  const w = blankWallet();
  assert.throws(() => applyOp(w, { type: 'sell', id: FISH[0].id, quantity: 1 }), EconomyError);
  applyOp(w, { type: 'catch', id: FISH[0].id });
  applyOp(w, { type: 'catch', id: FISH[0].id });
  const entry = applyOp(w, { type: 'sell', id: FISH[0].id, quantity: 2 });
  assert.equal(entry.delta, FISH[0].price * 2);
  assert.equal(w.coins, FISH[0].price * 2);
  assert.deepEqual(w.inventory, {});
  assert.throws(() => applyOp(w, { type: 'sell', id: FISH[0].id, quantity: 1 }), EconomyError);
});

test('buy checks balance and duplicates', () => {
  const w = blankWallet();
  const item = ITEMS[0];
  assert.throws(() => applyOp(w, { type: 'buy', id: item.id }), EconomyError);
  w.coins = item.price;
  applyOp(w, { type: 'buy', id: item.id });
  assert.equal(w.coins, 0);
  assert.deepEqual(w.owned, [item.id]);
  assert.throws(() => applyOp(w, { type: 'buy', id: item.id }), EconomyError);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'nope' }), EconomyError);
});

test('buyWand equips and sellAll sums prices', () => {
  const w = blankWallet();
  const wand = WANDS.find((x) => x.price > 0);
  w.coins = wand.price;
  applyOp(w, { type: 'buyWand', id: wand.id });
  assert.equal(w.wand, wand.id);
  assert.ok(w.wands.includes(wand.id));
  assert.throws(() => applyOp(w, { type: 'sellAll' }), EconomyError);
  applyOp(w, { type: 'catch', id: FISH[1].id });
  applyOp(w, { type: 'catch', id: FISH[2].id });
  const entry = applyOp(w, { type: 'sellAll' });
  assert.equal(entry.delta, FISH[1].price + FISH[2].price);
  assert.equal(entry.quantity, 2);
});

test('sanitizeWallet drops tampered values', () => {
  const w = sanitizeWallet({ coins: -5, inventory: { [FISH[0].id]: 3, nope: 1, [FISH[1].id]: -1 }, owned: ['nope', ITEMS[0].id], wands: ['nope'], wand: 'nope', catches: 'x' });
  assert.equal(w.coins, 0);
  assert.deepEqual(w.inventory, { [FISH[0].id]: 3 });
  assert.deepEqual(w.owned, [ITEMS[0].id]);
  assert.deepEqual(w.wands, [WANDS[0].id]);
  assert.equal(w.wand, WANDS[0].id);
  assert.equal(w.catches, 0);
  assert.equal(sanitizeWallet({ coins: 5e9 }).coins, 0);
});
