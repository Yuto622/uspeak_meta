// 配信しているファイルの「どれだけ持たせるか」。
//
// **これがずれると、直したものが教室に出ない。** このゲームのファイル名にはバージョンが
// 入っていない（`game.js` は毎回 `game.js`）ので、max-age をそのまま当てると、新しい版を
// 出した直後の一定時間、子どもの iPad には古い `net-client.js` が出たままになる。
// 実際それで「左下のボタンが出ない」が起きた。だから、ここは表で押さえる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2703;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up() {
  const proc = spawn('node', ['src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const until = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) return proc;
    } catch { /* not up yet */ }
    if (Date.now() > until) { proc.kill('SIGTERM'); throw new Error('server never came up'); }
    await sleep(200);
  }
}

test('自分たちのファイルは毎回聞きに来る、同梱ゲームは持たせる', async () => {
  const proc = await up();
  try {
    const head = async (url) => {
      const res = await fetch(`http://127.0.0.1:${PORT}${url}`);
      assert.equal(res.status, 200, `${url} should be served`);
      return res.headers.get('cache-control') || '';
    };

    // 直したものがすぐ出ないと困るもの。no-cache は「持つな」ではなく「毎回確かめろ」で、
    // 変わっていなければ ETag で 304 が返る（中身は流れない）。
    for (const f of ['/index.html', '/game.js', '/net-client.js', '/guest-dock.js',
      '/style.css', '/mobile.css', '/missions.json', '/town.json']) {
      assert.match(await head(f), /no-cache/, `${f} must be revalidated on every load`);
    }

    // 丸ごと差し替えるまで1バイトも変わらないもの。1本で何百ファイルあるので、
    // 開くたびに全部へ問い合わせると目に見えて遅くなる。
    // BGM もここ。1曲2.8MB あり、名前は day.mp3 / night.mp3 のまま変わらないので、
    // 毎回 304 を聞きに行かせる理由がない（差し替えるときは中身ごと入れ替える）。
    for (const f of ['/racers/game.js', '/blockwild/game.js', '/puyo/index.html',
      '/suika/index.html', '/vendor/colyseus.js',
      '/assets/bgm/day.mp3', '/assets/bgm/night.mp3']) {
      assert.match(await head(f), /max-age=\d{4,}/, `${f} should be held by the browser`);
    }

    // ETag が付いていること。no-cache は ETag があって初めて安い。
    //
    // **ここは fetch ではなく node:http で聞く。** undici の fetch は条件つき要求を
    // そのまま出してくれず（自前のキャッシュ判断が入る）、サーバーが 304 を返していても
    // 200 に見える。curl で確かめたら 304 だった。ブラウザの動きを測りたいので、素で送る。
    const raw = (headers = {}) => new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: PORT, path: '/net-client.js', headers }, (r) => {
        r.resume();
        r.on('end', () => resolve({ status: r.statusCode, etag: r.headers.etag }));
      });
    });
    const first = await raw();
    assert.equal(first.status, 200);
    assert.ok(first.etag, 'net-client.js must carry an ETag');
    const again = await raw({ 'If-None-Match': first.etag });
    assert.equal(again.status, 304, 'an unchanged file must come back as 304, not a re-download');
  } finally {
    proc.kill('SIGTERM');
  }
});
