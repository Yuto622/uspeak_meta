// Web 版の ふだん（FOOD_HUNGER なし）：おなかは へらない・まんぷくでも たべられる（たべる たのしみだけ のこす）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
delete process.env.FOOD_HUNGER; delete process.env.FOOD_RATE_MS;
const { MAX, RATE_MS, HUNGER_ON, blankFood, hungerNow, resume, eat, foodPayload } = await import('../src/game/food.js');

test('おなかは へらず、まんぷくでも たべられる', () => {
  assert.equal(HUNGER_ON, false);
  const f = blankFood(); f.h = 3;
  resume(f, 1000);
  assert.equal(hungerNow(f, 1000 + RATE_MS * 50), MAX, 'つないだら まんぷくに もどり、へらない');
  const r = eat(f, 'apple', 2000);
  assert.equal(r.item.id, 'apple');
  assert.equal(f.bag.apple, 1);
  const p = foodPayload(f);
  assert.equal(p.rateMs, 0); assert.equal(p.hungerOn, false);
});
