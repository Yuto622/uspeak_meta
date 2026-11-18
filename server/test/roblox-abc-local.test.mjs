// Roblox だけで うごく「ABC と おと」（roblox/USpeakAbcLocal.server.luau）。
// ・中の ことば（DATA）は abc-data.json から Roblox に 出さない ことばを ぬいた ものと 同じ（作りなおし わすれを 見つける）。
// ・fengari（Node で うごく Lua）が あれば、スクリプトを まるごと うごかして 子どもを 何人も あそばせる（roblox-abc-local.sim.lua）。
//   fengari は このリポジトリの 依存に 入れて いない：`FENGARI=<fengari の 場所> node --test test/roblox-abc-local.test.mjs`。なければ とばす。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { allWords, wordsLeft } from '../src/game/abc.js';
import { ROBLOX_BLOCKED } from '../src/roblox/abc-assets.js';
import { LOCAL_FILE, localData, luaData, withData } from '../scripts/make-roblox-abc-local.mjs';

const source = () => readFileSync(LOCAL_FILE, 'utf8');

test('中の ことばは abc-data.json − Roblox に 出さない ことば（なおしたら server/scripts/make-roblox-abc-local.mjs）', () => {
  const text = source();
  assert.equal(withData(text), text, 'DATA が 古い（作りなおして ください）');
  const block = text.slice(text.indexOf('-- DATA BEGIN'), text.indexOf('-- DATA END'));
  const inLua = new Set([...block.matchAll(/w="([a-z]+)"/g)].map((m) => m[1]));
  const blocked = Object.keys(ROBLOX_BLOCKED);
  assert.equal(blocked.length, 6);
  for (const w of blocked) assert.ok(!inLua.has(w), `${w} が 入って いる`);
  assert.deepEqual([...inLua].sort(), allWords().filter((w) => !ROBLOX_BLOCKED[w]).sort());
  // ことば 1 つずつ：え（emoji）と 音の 分けかたも 同じ。
  const d = localData();
  assert.deepEqual(d, wordsLeft(new Set(blocked)));
  const every = [...Object.values(d.letters).flatMap((l) => l.words), ...d.cvc, ...Object.values(d.digraphs).flat(), ...Object.values(d.magicE).flat()];
  for (const x of every) {
    assert.ok(x.e, `${x.w}: え（emoji）が ない`);
    const parts = x.parts ? `,parts={${x.parts.map((p) => `"${p}"`).join(',')}}` : '';
    assert.ok(block.includes(`{w="${x.w}",e="${x.e}"${parts}${x.end ? ',fin=true' : ''}}`), x.w);
  }
  assert.equal(luaData(d).split('\n')[1], `\torder = {${d.order.map((l) => `"${l}"`).join(',')}},`);
});

test('HTTP も Secrets も 使わない・子どもに 見える 字は ひらがな＋英語だけ', () => {
  const text = source();
  const code = text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const bad of ['HttpService', 'GetSecret', 'RequestAsync', 'USPEAK_WEB_KEY', 'https://', 'rbxassetid']) assert.ok(!code.includes(bad), bad);
  const after = text.slice(text.indexOf('-- DATA END'));
  for (const [i, line] of after.split('\n').entries()) {
    if (line.trim().startsWith('--')) continue;
    for (const m of line.split(' -- ')[0].matchAll(/"([^"]*)"/g)) assert.ok(!/[一-龯ァ-ヶ]/.test(m[1]), `${i + 1}: ${m[1]}`);
  }
});

test('Lua で まるごと うごかす：はじめの もんだい → もじ → きまり → おわり・8 わり・にがて・きろく（fengari が ある とき）', (t) => {
  let fengari;
  try { fengari = createRequire(import.meta.url)(process.env.FENGARI || 'fengari'); } catch { t.skip('fengari が ない'); return; }
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(source()));
  lua.lua_setglobal(L, to_luastring('ABC_SOURCE'));
  const sim = readFileSync(new URL('./roblox-abc-local.sim.lua', import.meta.url), 'utf8');
  let rc = lauxlib.luaL_loadbuffer(L, to_luastring(sim), null, to_luastring('@sim'));
  if (rc === lua.LUA_OK) rc = lua.lua_pcall(L, 0, 0, 0);
  assert.equal(rc, lua.LUA_OK, rc === lua.LUA_OK ? '' : lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('SIM_REPORT'));
  const report = lua.lua_tojsstring(L, -1);
  assert.match(report, /^A perfect child/);
  assert.match(report, /H 60 random children/);
  for (const kind of ['show', 'chant', 'name', 'sound', 'picture', 'rule', 'blend', 'pair', 'word', 'spell']) assert.match(report, new RegExp(`\\b${kind}=\\d`), kind);
  t.diagnostic(report);
});
