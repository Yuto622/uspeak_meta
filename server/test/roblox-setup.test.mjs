// Roblox Studio の「一発 セットアップ」（roblox/setup-*.lua）：いまの スクリプトが まるごと 入って いる（作りなおし わすれを 見つける）・
// 鍵らしい ものが 入って いない・子どもに 見える 字に 漢字と カタカナ語が ない（ABC の 画面）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../roblox');
const read = (n) => readFileSync(path.join(R, n), 'utf8');
const SETUPS = {
  'setup-abc-place.lua': ['USpeakAbc.server.luau', 'USpeakAbcClient.client.luau'],
  'setup-books-place.lua': ['USpeakBooks.server.luau', 'USpeakBooksClient.client.luau', 'USpeakWalletSync.server.luau'],
  'setup-drill-place.lua': ['USpeakDrill.server.luau', 'USpeakDrillClient.client.luau', 'USpeakWalletSync.server.luau'],
};

test('一発 セットアップに いまの スクリプトが まるごと 入って いる（なおしたら scripts/make-roblox-*-setup.py を 走らせる）', () => {
  for (const [setup, sources] of Object.entries(SETUPS)) {
    const text = read(setup);
    for (const s of sources) assert.ok(text.includes(`[=====[${read(s)}]=====]`), `${setup} に ${s} の いまの 中身が ない（作りなおして ください）`);
  }
});

test('セットアップと スクリプトに 鍵は 入って いない（鍵は Roblox の Secrets から 読む）', () => {
  for (const f of [...Object.keys(SETUPS), 'USpeakAbc.server.luau', 'USpeakAbcClient.client.luau', 'USpeakBooks.server.luau', 'USpeakBooksClient.client.luau']) {
    const text = read(f).replace(/-{5,}/g, ' ').replace(/={5,}/g, ' '); // 見出しの 線（----）は 鍵では ない
    assert.ok(!/[A-Za-z0-9+/=_-]{40,}/.test(text), `${f}: 長い 鍵の ような 文字が ある`);
    assert.ok(!/ROBLOX_OPEN_CLOUD_KEY\s*=|USPEAK_ROBLOX_KEY\s*=/.test(text), f);
  }
  for (const f of ['USpeakAbc.server.luau', 'USpeakBooks.server.luau']) assert.ok(read(f).includes('GetSecret("USPEAK_WEB_KEY")'), f);
});

test('ABC の 画面：子どもに 見える 字は ひらがな＋英語だけ（漢字・カタカナなし）・10 しゅるいの もんだいを あつかう', () => {
  for (const f of ['USpeakAbcClient.client.luau', 'USpeakAbc.server.luau']) {
    for (const [i, line] of read(f).split('\n').entries()) {
      if (line.trim().startsWith('--')) continue;
      for (const m of line.split(' -- ')[0].matchAll(/"([^"]*)"/g)) assert.ok(!/[一-龯ァ-ヶ]/.test(m[1]), `${f}:${i + 1} ${m[1]}`);
    }
  }
  const client = read('USpeakAbcClient.client.luau');
  for (const kind of ['show', 'chant', 'name', 'sound', 'picture', 'rule', 'blend', 'pair', 'word', 'spell']) assert.ok(new RegExp(`\\b${kind} = \\{|"${kind}"`).test(client), kind);
});

// サーバーが セットアップを くばる口（Studio の コマンドバーの 1 行が 読む）。
test('/roblox-setup/<名前>.lua：きまった 3 つだけ 出る・中身は ファイルと 同じ・ほかは 404', async () => {
  process.env.STORE_BACKEND = 'memory'; process.env.LOG_LEVEL = 'error';
  const { startServer } = await import('../src/index.js');
  const server = await startServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${server.server.address().port}`;
    for (const [name, file] of [['abc', 'setup-abc-place.lua'], ['books', 'setup-books-place.lua'], ['drill', 'setup-drill-place.lua']]) {
      const r = await fetch(`${base}/roblox-setup/${name}.lua`);
      assert.equal(r.status, 200, name);
      assert.match(r.headers.get('content-type'), /text\/plain/);
      assert.equal(await r.text(), read(file), name);
    }
    for (const bad of ['nope.lua', '..%2f..%2fserver%2fpackage.json', 'USpeakAbc.server.luau']) assert.equal((await fetch(`${base}/roblox-setup/${bad}`)).status, 404, bad);
  } finally { await server.shutdown('test'); }
});

// コマンドバー用の 1 行ずつの セットアップ（roblox/oneline/）。コマンドバーは 1 行の 入力らんで、長い 複数行の ファイルを 貼ると こわれる。
test('roblox/oneline：どれも 1 行・コメントなし・いまの スクリプトと 同じ 中身（なおしたら scripts/make-roblox-oneline.py）', () => {
  const unescape = (q) => q.slice(1, -1).replace(/\\(\\|"|n|t)/g, (_, c) => ({ '\\': '\\', '"': '"', n: '\n', t: '\t' }[c]));
  const want = { 'abc-1.txt': 'USpeakAbc.server.luau', 'abc-2.txt': 'USpeakAbcClient.client.luau', 'books-1.txt': 'USpeakBooks.server.luau', 'books-2.txt': 'USpeakWalletSync.server.luau', 'books-3.txt': 'USpeakBooksClient.client.luau' };
  for (const f of [...Object.keys(want), 'abc-3.txt', 'books-4.txt']) {
    const t = read(`oneline/${f}`);
    assert.ok(!t.includes('\n') && !t.includes('\r'), `${f}: 1 行で ない`);
    assert.ok(!/--/.test(t.replace(/"(?:[^"\\]|\\.)*"/g, '""')), `${f}: コメントが ある（1 行だと うしろが ぜんぶ 消える）`);
    assert.ok(!/USPEAK_ROBLOX_KEY\s*=|ROBLOX_OPEN_CLOUD_KEY\s*=/.test(t), `${f}: 鍵らしい もの`);
    if (want[f]) {
      const m = /s\.Source=("(?:[^"\\]|\\.)*");/.exec(t);
      assert.ok(m, `${f}: Source が ない`);
      assert.equal(unescape(m[1]), read(want[f]).replace(/\r\n/g, '\n'), `${f} が ${want[f]} と ちがう（作りなおして ください）`);
    }
  }
});
