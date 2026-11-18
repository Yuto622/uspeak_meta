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
