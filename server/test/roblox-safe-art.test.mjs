// Roblox に 送る 絵の あんぜん フィルター：あぶない 絵は かわる／外れる・Web の 絵は かわらない・ぜんぶの 本で のこらない・絵の しるしが かわる。
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
const { robloxScene, robloxChanges, SAFE_TABLE } = await import('../src/roblox/safe-art.js');
const { sceneSvg, artHash } = await import('../src/roblox/book-png.js');
const { renderScene, canDraw } = await import('../src/game/reading-art/render.js');
const R = await import('../src/game/reading.js');

test('かわりの 絵は ぜんぶ かける・おさけ／はもの／お札は かわり、シャワーは 外れる', () => {
  for (const [from, to] of Object.entries(SAFE_TABLE)) if (to) assert.ok(canDraw(to), `${from}→${to}`);
  const { scene, changes } = robloxScene({ bg: 'kitchen', items: [{ e: '🍾', x: 30, y: 70, s: 2 }, { e: '🔪', x: 50, y: 70, s: 2 }, { e: '💵', x: 60, y: 70, s: 2 }, { e: '🚿', x: 70, y: 30, s: 2 }, { e: '👧', x: 20, y: 70, s: 3 }] });
  assert.deepEqual(scene.items.map((it) => it.e), ['🫙', '🍽️', '🪙', '👧']);
  assert.equal(changes.length, 4);
});

test('ぜんぶの 本：Roblox に 送る 絵に きまりの 表の ものが のこらない・Web の 絵は もとの まま', () => {
  const bad = new Set(Object.keys(SAFE_TABLE));
  let changed = 0;
  for (const b of R.allBooks().values()) {
    [b.cover, ...b.pages.map((p) => p.scene)].forEach((sc) => { for (const it of robloxScene(sc).scene.items) assert.ok(!bad.has(it.e), `${b.id}: ${it.e}`); });
    changed += robloxChanges(b).length;
  }
  assert.ok(changed > 0);
  const book = [...R.allBooks().values()].find((b) => robloxChanges(b).length);
  const n = robloxChanges(book)[0].n; const sc = n === 0 ? book.cover : book.pages[n - 1].scene;
  assert.notEqual(sceneSvg(book, n), renderScene(sc, { seed: book.id, still: true }), 'Roblox の 絵は かわる');
  assert.ok(renderScene(sc, { seed: book.id, still: true }).length > 0, 'Web の 絵は そのまま かける');
  assert.match(artHash(book, n), /^[0-9a-f]{32}$/);
});
