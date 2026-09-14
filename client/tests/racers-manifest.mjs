// AURORA KART が「配られたそのまま」であることを確かめる。
//
// racers/ の中身は別のゲームで、こちらのルール（11px の下限、閉じたダイアログ、
// モジュールの命名）はどれも適用されない。だから回帰テストの他の検査はここを見ない。
// 見ないものは腐るので、代わりに**中身が1バイトも変わっていないこと**を見る。
//
// 直してよいものが1つも無い、というのがこの検査の言いたいことではない。言いたいのは
// 「直したなら、それは fork であって vendor ではない」ということ。差し替えるときは
// 新しいビルドを丸ごと置いて `node client/tests/racers-manifest.mjs --write` を回す。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist/racers/', import.meta.url));
const manifestPath = path.join(dir, 'SOURCE.json');

export function scanRacers() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const onDisk = readdirSync(dir)
    .filter((f) => f !== 'SOURCE.json' && statSync(path.join(dir, f)).isFile())
    .sort();
  const problems = [];
  for (const name of onDisk) {
    const want = manifest.files[name];
    if (!want) { problems.push(`${name}: not in SOURCE.json (a file was added by hand?)`); continue; }
    const bytes = readFileSync(path.join(dir, name));
    const got = createHash('sha256').update(bytes).digest('hex');
    if (got !== want.sha256) problems.push(`${name}: edited since it was vendored`);
    if (bytes.length !== want.bytes) problems.push(`${name}: ${bytes.length} bytes, expected ${want.bytes}`);
  }
  for (const name of Object.keys(manifest.files)) {
    if (!onDisk.includes(name)) problems.push(`${name}: missing`);
  }
  // The game is only a game if these are all there.
  for (const need of ['index.html', 'game.js', 'style.css', 'vocab.js', 'net.js', 'three.module.js']) {
    if (!onDisk.includes(need)) problems.push(`${need}: the game cannot run without it`);
  }
  return { manifest, onDisk, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--write')) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files = {};
    for (const name of readdirSync(dir).filter((f) => f !== 'SOURCE.json' && statSync(path.join(dir, f)).isFile()).sort()) {
      const bytes = readFileSync(path.join(dir, name));
      manifest.files[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    }
    manifest.vendored = new Date().toISOString().slice(0, 10);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`SOURCE.json rewritten: ${Object.keys(manifest.files).length} files`);
  } else {
    const { onDisk, problems } = scanRacers();
    if (problems.length) { console.log(`FAIL: racers/\n  ${problems.join('\n  ')}`); process.exit(1); }
    console.log(`PASS: AURORA KART — ${onDisk.length} files vendored, all byte-identical to SOURCE.json.`);
  }
}
