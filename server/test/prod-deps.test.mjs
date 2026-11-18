// 本番の イメージは `npm ci --omit=dev`（devDependencies を 入れない）。サーバーの コードが import する 部品は
// ぜんぶ dependencies に ないと、本番だけ 起動しない（2026-11：qrcode が devDependencies に あって サイトが 止まった）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// 本番で 入る もの＝ロックファイルで dev で ない 部品（colyseus が つれて くる @colyseus/schema なども 入る）。
const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const prod = new Set(Object.entries(lock.packages || {}).filter(([k, v]) => k.startsWith('node_modules/') && !k.slice(13).includes('node_modules/') && !v.dev).map(([k]) => k.slice(13)));
for (const n of Object.keys(pkg.dependencies || {})) prod.add(n);
const builtin = new Set(builtinModules);

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(m?js)$/.test(n)) yield p;
  }
}
const nameOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

test('src/ が import する 部品は ぜんぶ dependencies に ある（devDependencies では 本番で 見つからない）', () => {
  const missing = new Map();
  // scripts/ は 手で 動かす 道具（本番では 動かさない）なので 見ない。
  for (const dir of ['src']) {
    for (const f of files(path.join(ROOT, dir))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:^|[\s;])(?:import\s[^'"`]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"./][^'"]*)['"]/gm)) {
        const spec = m[1];
        if (spec.startsWith('node:') || builtin.has(spec) || builtin.has(nameOf(spec))) continue;
        const name = nameOf(spec);
        if (!prod.has(name)) missing.set(name, path.relative(ROOT, f));
      }
    }
  }
  assert.deepEqual([...missing].map(([n, f]) => `${n} (${f})`), []);
});
