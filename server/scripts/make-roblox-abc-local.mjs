// Roblox だけで うごく「ABC と おと」（roblox/USpeakAbcLocal.server.luau）の なかみ（DATA）を abc-data.json から 作りなおす。
//   node server/scripts/make-roblox-abc-local.mjs && python3 scripts/make-roblox-oneline.py
// Roblox には 出さない ことば（ROBLOX_BLOCKED）は ぬく（Web に つなぐ 版と 同じ ぬきかた：wordsLeft）。
// サーバーには つながない。ファイルの「-- DATA BEGIN」〜「-- DATA END」の あいだだけを 書きかえる。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wordsLeft } from '../src/game/abc.js';
import { ROBLOX_BLOCKED } from '../src/roblox/abc-assets.js';

export const LOCAL_FILE = fileURLToPath(new URL('../../roblox/USpeakAbcLocal.server.luau', import.meta.url));
const BEGIN = '-- DATA BEGIN', END = '-- DATA END';

export function localData() { return wordsLeft(new Set(Object.keys(ROBLOX_BLOCKED))); }

const s = (x) => JSON.stringify(String(x)); // ことば・emoji に \ や " は ない（あれば JSON の 書きかたは Lua でも 同じ）
const word = (x) => `{w=${s(x.w)},e=${s(x.e || '')}${x.parts ? `,parts={${x.parts.map(s).join(',')}}` : ''}${x.end ? ',fin=true' : ''}}`;
const words = (list) => `{${list.map(word).join(',')}}`;

export function luaData(d = localData()) {
  const out = ['local DATA = {'];
  out.push(`\torder = {${d.order.map(s).join(',')}},`);
  out.push('\tletters = {');
  for (const l of Object.keys(d.letters).sort()) out.push(`\t\t${l} = {words=${words(d.letters[l].words)}},`);
  out.push('\t},');
  out.push('\tcvc = {');
  for (const x of d.cvc) out.push(`\t\t${word(x)},`);
  out.push('\t},');
  for (const key of ['digraphs', 'magicE']) {
    out.push(`\t${key} = {`);
    for (const [id, list] of Object.entries(d[key])) out.push(`\t\t{id=${s(id)},words=${words(list)}},`);
    out.push('\t},');
  }
  out.push('}');
  return out.join('\n');
}

export function withData(text, data = luaData()) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error('DATA の しるしが ない');
  return `${text.slice(0, a)}${BEGIN}\n${data}\n${text.slice(b)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const before = readFileSync(LOCAL_FILE, 'utf8');
  const after = withData(before);
  if (after !== before) writeFileSync(LOCAL_FILE, after);
  console.log(after === before ? 'そのまま' : '書きかえました', LOCAL_FILE, after.length, 'chars');
}
