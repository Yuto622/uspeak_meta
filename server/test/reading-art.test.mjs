// 絵本の 絵（サーバーで かく SVG）：ぜんぶの 場面が かける・顔の 絵文字は 人の 気持ちに なる・太陽が 2 つ ならばない・口（/reading-art）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';

const R = await import('../src/game/reading.js');
const { renderScene, canDraw } = await import('../src/game/reading-art/render.js');
const { BACKGROUND_NAMES } = await import('../src/game/reading-art/backgrounds.js');
const { startServer } = await import('../src/index.js');

test('ぜんぶの 本の ぜんぶの 場面が 絵に なる（かけない 絵文字が ない・スクリプトが 入らない）', () => {
  let pages = 0;
  for (const b of R.allBooks().values()) {
    for (const sc of [b.cover, ...b.pages.map((p) => p.scene)]) {
      for (const it of sc.items) assert.ok(canDraw(it.e), `${b.id}: ${it.e}`);
      const svg = renderScene(sc, { seed: b.id });
      assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"') && svg.endsWith('</svg>'), b.id);
      assert.ok(!/<script|javascript:|\son[a-z]+=|<foreignObject|href="(?!#)/i.test(svg), `${b.id}: 外の ものを 読む 絵`);
      assert.ok(svg.length < 120_000, `${b.id}: 絵が 大きすぎる ${svg.length}`);
      pages += 1;
    }
  }
  assert.ok(pages > 300);
  for (const bg of R.BACKGROUNDS) assert.ok(BACKGROUND_NAMES.includes(bg), `背景 ${bg}`);
});

test('同じ 場面は いつも 同じ 絵・本が ちがえば 人の 見た目が かわる・still は うごかない', () => {
  const sc = { bg: 'room', items: [{ e: '👦', x: 30, y: 70, s: 3.2, a: 'bob' }, { e: '🎒', x: 66, y: 72, s: 3 }] };
  assert.equal(renderScene(sc, { seed: 'a' }), renderScene(sc, { seed: 'a' }));
  assert.ok(renderScene(sc, { seed: 'a' }).includes('class="m bob"'));
  assert.ok(!renderScene(sc, { seed: 'a', still: true }).includes('<style>'));
  const looks = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => renderScene(sc, { seed, still: true })));
  assert.ok(looks.size > 1);
});

test('顔の 絵文字は 人の 気持ちに なって 消える（人が いなければ そのまま）・太陽は 1 つ', () => {
  const tear = '#6fc3ff';
  const withKid = renderScene({ bg: 'room', items: [{ e: '👧', x: 30, y: 70, s: 3 }, { e: '😢', x: 34, y: 30, s: 1.4 }] }, { still: true });
  assert.ok(withKid.includes(tear) && !withKid.includes('id="e1f622"'), 'なみだの 顔に なり、絵文字は 出ない');
  const alone = renderScene({ bg: 'room', items: [{ e: '😢', x: 34, y: 30, s: 1.4 }] }, { still: true });
  assert.ok(alone.includes('id="e1f622"'));
  const sun = '#ffd86b';
  const plain = renderScene({ bg: 'meadow', items: [{ e: '🌼', x: 50, y: 70, s: 2 }] }, { still: true });
  const own = renderScene({ bg: 'meadow', items: [{ e: '☀️', x: 50, y: 20, s: 3 }] }, { still: true });
  assert.ok(plain.includes(`fill="${sun}"`) && !own.includes(`fill="${sun}"`));
  // よるの 場面に 海の ものが あれば よるの はまべ（草の 上に 波が のらない）。
  assert.notEqual(renderScene({ bg: 'night', items: [{ e: '🐢', x: 50, y: 70, s: 2 }] }, { still: true }).slice(0, 4000), renderScene({ bg: 'night', items: [{ e: '🦉', x: 50, y: 70, s: 2 }] }, { still: true }).slice(0, 4000));
});

let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('/reading-art：表紙と ページが SVG で 出る・版つきは 長く キャッシュ・ない 本は 404・本の 送りに 絵の 場所が 入る', async () => {
  const book = R.allBooks().values().next().value;
  const cover = await fetch(`${base}/reading-art/${book.id}/0.svg?v=${R.ART_VERSION}&still=1`);
  assert.equal(cover.status, 200);
  assert.match(cover.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(cover.headers.get('cache-control'), /immutable/);
  const text = await cover.text();
  assert.ok(text.startsWith('<svg') && !text.includes('<style>'));
  const last = await fetch(`${base}/reading-art/${book.id}/${book.pages.length}.svg`);
  assert.equal(last.status, 200);
  assert.match(last.headers.get('cache-control'), /max-age=300/);
  assert.ok((await last.text()).includes('<svg'));
  for (const bad of [`${book.id}/${book.pages.length + 1}.svg`, 'rd-A-nope/0.svg', `${book.id}/x.svg`, `..%2f..%2fpackage/0.svg`]) assert.equal((await fetch(`${base}/reading-art/${bad}`)).status, 404, bad);
  const pub = R.publicBook(book, R.blankProgress());
  assert.equal(pub.art, `/reading-art/${book.id}`);
  assert.equal(pub.artV, R.ART_VERSION);
});
