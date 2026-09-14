// 同梱した外部ゲームが「配られたそのまま」であることを確かめる。
//
// `client/dist/racers/` と `client/dist/blockwild/` は別々に作られたゲームで、こちらの
// ルール（11px の下限、閉じたダイアログ、モジュールの命名）はどれも適用されない。だから
// 回帰テストの他の検査はそこを見ない。見ないものは腐るので、代わりに**中身が1バイトも
// 変わっていないこと**を見る。
//
// 直してよいものが1つも無い、というのがこの検査の言いたいことではない。言いたいのは
// 「直したなら、それは fork であって vendor ではない」ということ。差し替えるときは
// 新しいビルドを丸ごと置いて `node client/tests/guests-manifest.mjs --write` を回す。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A guest is a folder with a SOURCE.json in it. Adding a third game means dropping it in
// and adding one line here, not writing another checker.
export const GUESTS = [
  { dir: 'racers', needs: ['index.html', 'game.js', 'style.css', 'vocab.js', 'net.js', 'three.module.js'] },
  { dir: 'blockwild', needs: ['index.html', 'game.js', 'style.css', 'three.module.js', 'src/world.js', 'src/net.js'] },
  { dir: 'puyo', needs: ['index.html', 'styles/main.css', 'src/main.js', 'src/core/game.js', 'src/data/dictionary.js'] },
  { dir: 'suika', needs: ['index.html', 'styles.css', 'js/game.js', 'js/physics.js', 'js/words.js'] },
];

const root = fileURLToPath(new URL('../dist/', import.meta.url));

// Recursive: BLOCKWILD keeps half of itself in `src/`, and a checker that only reads the
// top of the folder would call a gutted copy intact.
function walk(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'SOURCE.json') continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push(rel);
  }
  return out;
}

export function scanGuest({ dir, needs }) {
  const base = path.join(root, dir);
  const manifestPath = path.join(base, 'SOURCE.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const onDisk = walk(base);
  const problems = [];
  for (const name of onDisk) {
    const want = manifest.files[name];
    if (!want) { problems.push(`${dir}/${name}: not in SOURCE.json (a file was added by hand?)`); continue; }
    const bytes = readFileSync(path.join(base, name));
    if (createHash('sha256').update(bytes).digest('hex') !== want.sha256) problems.push(`${dir}/${name}: edited since it was vendored`);
    if (bytes.length !== want.bytes) problems.push(`${dir}/${name}: ${bytes.length} bytes, expected ${want.bytes}`);
  }
  for (const name of Object.keys(manifest.files)) {
    if (!onDisk.includes(name)) problems.push(`${dir}/${name}: missing`);
  }
  for (const need of needs) {
    if (!onDisk.includes(need)) problems.push(`${dir}/${need}: the game cannot run without it`);
  }
  return { manifest, onDisk, problems };
}

export function scanGuests() {
  const problems = [];
  const seen = [];
  for (const guest of GUESTS) {
    const { manifest, onDisk, problems: bad } = scanGuest(guest);
    problems.push(...bad);
    seen.push({ dir: guest.dir, name: manifest.name, files: onDisk.length });
  }
  return { seen, problems };
}

function rewrite({ dir }) {
  const base = path.join(root, dir);
  const manifestPath = path.join(base, 'SOURCE.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files = {};
  for (const name of walk(base)) {
    const bytes = readFileSync(path.join(base, name));
    manifest.files[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  }
  manifest.vendored = new Date().toISOString().slice(0, 10);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.keys(manifest.files).length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--write')) {
    const only = process.argv.find((a) => GUESTS.some((g) => g.dir === a));
    for (const guest of GUESTS.filter((g) => !only || g.dir === only)) {
      console.log(`${guest.dir}/SOURCE.json rewritten: ${rewrite(guest)} files`);
    }
  } else {
    const { seen, problems } = scanGuests();
    if (problems.length) { console.log(`FAIL:\n  ${problems.join('\n  ')}`); process.exit(1); }
    console.log(`PASS: ${seen.map((g) => `${g.name} (${g.files} files)`).join(', ')} — byte-identical to SOURCE.json.`);
  }
}
