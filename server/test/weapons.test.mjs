// ぶきや（メインの島）：100 本・前の 6 本は id と 値段 そのまま・サーバーが 表の 値段で 買う・3D の 形が ぜんぶ ある。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, ITEM_BY_ID } from '../../client/dist/fishing-data.js';
import { WEAPON_STYLES, WEAPON_TIERS } from '../../client/dist/weapons-data.js';
import { blankWallet, applyOp, sanitizeWallet } from '../src/game/economy.js';

const W = ITEMS.filter((i) => i.kind === 'weapon');

test('ぶきは 100 本・形 10 × 素材 10 の マスが ぜんぶ うまる・id は ひとつずつ', () => {
  assert.equal(W.length, 100);
  assert.equal(new Set(W.map((w) => w.id)).size, 100);
  const cells = new Set(W.map((w) => `${w.style}:${WEAPON_TIERS[w.tier]?.id}`));
  assert.equal(cells.size, WEAPON_STYLES.length * WEAPON_TIERS.length);
  for (const w of W) { assert.ok(w.price > 0 && Number.isInteger(w.price)); assert.ok(w.en && w.ja, w.id); }
});

test('前から ある 6 本は id と 値段が かわらない（子どもの セーブが その id）', () => {
  const old = { 'wood-sword': 80, 'steel-sword': 240, bow: 360, trident: 650, staff: 1000, sunblade: 1800 };
  for (const [id, price] of Object.entries(old)) assert.equal(ITEM_BY_ID[id]?.price, price, id);
  const w = sanitizeWallet({ coins: 0, owned: ['sunblade', 'w-fire-hammer', 'nope'] });
  assert.deepEqual(w.owned, ['sunblade', 'w-fire-hammer'], '新しい ぶきも セーブに のこる・ない id は すてる');
});

test('サーバーは 表の 値段で 買う（ページの 言う 値段は 使わない）・たりないと ことわる', () => {
  const w = blankWallet(); w.coins = 2000;
  const hammer = ITEM_BY_ID['w-fire-hammer'];
  assert.equal(hammer.style, 'hammer');
  const r = applyOp(w, { type: 'buy', id: 'w-ice-wand', price: 1 });
  assert.equal(r.delta, -ITEM_BY_ID['w-ice-wand'].price);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'w-star-trident' }), /not enough coins/);
  assert.throws(() => applyOp(w, { type: 'buy', id: 'w-ice-wand' }), /already owned/);
});

test('3D の 形：10 の 形 ぜんぶ fishing-models.js に ある', () => {
  const src = readFileSync(new URL('../../client/dist/fishing-models.js', import.meta.url), 'utf8');
  for (const s of WEAPON_STYLES) assert.match(src, new RegExp(`st==='${s.id}'`), s.id);
});
