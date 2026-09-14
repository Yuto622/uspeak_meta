// ブロック屋 と BLOCKWILD をつなぐ表。
//
// この表を間違えると、買ったブロックが向こうに出てこない — そして**何も壊れない**ので、
// 誰かが子どもに言われるまで気づかない。だから表そのものを検査する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOP_TO_BLOCKWILD, BLOCKWILD_TO_SHOP, allowedIds } from '../../client/dist/blockwild-blocks.js';

const town = JSON.parse(readFileSync(new URL('../../client/dist/town.json', import.meta.url), 'utf8'));

test('ブロック屋の品は、ひとつ残らず BLOCKWILD の何かになる', () => {
  const missing = town.blocks.filter((b) => SHOP_TO_BLOCKWILD[b.id] === undefined).map((b) => b.id);
  assert.deepEqual(missing, [], 'これらは買っても BLOCKWILD に出てこない');
});

test('表にあって店に無いものは無い（消した品が表に残らない）', () => {
  const sold = new Set(town.blocks.map((b) => b.id));
  const orphans = Object.keys(SHOP_TO_BLOCKWILD).filter((id) => !sold.has(id));
  assert.deepEqual(orphans, [], 'これらはもう売っていない');
});

test('ふたつの品が同じブロックにならない', () => {
  const ids = Object.values(SHOP_TO_BLOCKWILD);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(BLOCKWILD_TO_SHOP).length, ids.length);
});

test('BLOCKWILD の id は、あちらが本当に持っている番号である', async () => {
  // 数字を手で書き写した表なので、写し間違いはここで止める。
  const { ID } = await import('../../client/dist/blockwild/src/blocks.js');
  const known = new Set(Object.values(ID));
  for (const [shop, id] of Object.entries(SHOP_TO_BLOCKWILD)) {
    assert.ok(known.has(id), `${shop} → ${id} は BLOCKWILD に無い番号`);
  }
  // …そして意味が合っていること。番号だけ合っていて「いし」を買うと「すな」が出る、
  // というのがいちばん気づきにくい壊れ方。
  assert.equal(SHOP_TO_BLOCKWILD.stone, ID.STONE);
  assert.equal(SHOP_TO_BLOCKWILD.brick, ID.BRICK);
  assert.equal(SHOP_TO_BLOCKWILD.glass, ID.GLASS);
  assert.equal(SHOP_TO_BLOCKWILD.grass, ID.GRASS);
  assert.equal(SHOP_TO_BLOCKWILD.sand, ID.SAND);
  assert.equal(SHOP_TO_BLOCKWILD.snow, ID.SNOW);
  assert.equal(SHOP_TO_BLOCKWILD.wood, ID.PLANKS);
  assert.equal(SHOP_TO_BLOCKWILD.lamp, ID.LANTERN);
  assert.equal(SHOP_TO_BLOCKWILD.flower, ID.ROSE);
  assert.equal(SHOP_TO_BLOCKWILD.water, ID.WATER);
});

test('何も買っていない子にも、ひとつは建てるものがある', () => {
  // ブロック屋の「き」は 0 コイン。初日の子が空のパレットを見ることはない。
  const free = town.blocks.filter((b) => b.price === 0).map((b) => b.id);
  assert.ok(free.length >= 1, 'むりょうの品がひとつも無い');
  const allow = allowedIds(free);
  assert.ok(allow.size >= 1);
});

test('持っていない物は通さない（買った物だけが集合に入る）', () => {
  assert.deepEqual([...allowedIds(['stone'])], [SHOP_TO_BLOCKWILD.stone]);
  assert.deepEqual([...allowedIds([])], []);
  assert.deepEqual([...allowedIds(['diamond', 'tnt', null, 7])], [], '店に無い名前は通さない');
  assert.deepEqual([...allowedIds(undefined)], []);
});
