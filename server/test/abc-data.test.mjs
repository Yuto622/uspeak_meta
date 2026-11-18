// 「ABC と おと」の 中身と 絵：中身の 形・絵が ぜんぶ かける・口（/abc-art）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';

const A = await import('../src/game/abc-art.js');
const { startServer } = await import('../src/index.js');
const ABC = 'abcdefghijklmnopqrstuvwxyz'.split('');
const clean = (svg, what) => {
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.trimEnd().endsWith('</svg>'), what);
  assert.ok(!/<script|javascript:|\son[a-z]+=|<foreignObject|href=|<text|<image/i.test(svg), `${what}: 外の もの・字・スクリプトが 入って いる`);
  assert.ok(svg.length < 60_000, `${what}: 大きすぎる ${svg.length}`);
};

test('中身：26 文字・3 文字の ことば 45 以上・2 文字の おと・ながい おと。parts が ことばに なる・絵が かける・絵と ことばが 1 対 1', () => {
  const d = A.loadAbcData();
  assert.deepEqual(A.abcProblems(d), []);
  assert.deepEqual(d.order.slice(0, 6), ['s', 'a', 't', 'p', 'i', 'n']);
  assert.equal(d.letters.x.end, true);
  // こわした 中身は 見つかる
  const broken = JSON.parse(JSON.stringify(d));
  broken.cvc[0].parts = ['c', 'a']; broken.letters.b.words[0].w = 'apple'; broken.digraphs.sh[0].e = '🚫🚫';
  assert.ok(A.abcProblems(broken).length >= 3);
});

test('絵：文字の つみき（3 つの 出し方）・ことばの 絵カード・表紙が ぜんぶ かける。字や 外の ものは 入らない', () => {
  for (const l of ABC) for (const mode of ['both', 'upper', 'lower']) clean(A.letterSvg(l, mode), `${l} ${mode}`);
  assert.notEqual(A.letterSvg('a', 'upper'), A.letterSvg('a', 'lower'));
  assert.notEqual(A.letterSvg('a'), A.letterSvg('b'));
  const d = A.abcData();
  const words = [...Object.values(d.letters).flatMap((x) => x.words), ...d.cvc, ...Object.values(d.digraphs).flat(), ...Object.values(d.magicE).flat()];
  for (const w of words) clean(A.wordSvg(w.w), w.w);
  clean(A.coverSvg(), 'cover');
  assert.equal(A.letterSvg('1'), null); assert.equal(A.letterSvg('ab'), null); assert.equal(A.wordSvg('nope'), null);
});

let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('/abc-art：SVG で 出る・版つきは 長く キャッシュ・だめな 入力は 404', async () => {
  const ok = async (p, cache) => { const r = await fetch(base + p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /image\/svg\+xml/); assert.match(r.headers.get('cache-control'), cache); assert.ok((await r.text()).startsWith('<svg')); };
  await ok(`/abc-art/letter/s.svg?v=${A.ABC_ART_VERSION}`, /immutable/);
  await ok('/abc-art/letter/s.svg?case=lower', /max-age=300/);
  await ok('/abc-art/letter/q.svg?case=upper', /max-age=300/);
  await ok('/abc-art/word/apple.svg', /max-age=300/);
  await ok('/abc-art/word/yo-yo.svg', /max-age=300/);
  await ok('/abc-art/cover.svg', /max-age=300/);
  for (const bad of ['/abc-art/letter/A.svg', '/abc-art/letter/ab.svg', '/abc-art/letter/1.svg', '/abc-art/letter/a.svg?case=big', '/abc-art/letter/a.png', '/abc-art/word/nope.svg', '/abc-art/word/..%2fabc-data.svg', '/abc-art/word/APPLE.svg', '/abc-art/nothing.svg']) {
    assert.equal((await fetch(base + bad)).status, 404, bad);
  }
});
