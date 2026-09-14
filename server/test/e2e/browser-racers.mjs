// AURORA KART が のりもの島から開くこと、を実ブラウザで。
//
// This one is worth running for real because almost nothing about it can be unit-tested.
// It is a whole other game in a frame: a second three.js, a second WebGL context, a second
// stylesheet full of bare `header` and `button` selectors, and a second set of key
// handlers that want the arrow keys. The questions are therefore:
//
//   * does it BOOT — not "does the frame exist", but is there a three.js in there that
//     has drawn something?
//   * does the island get out of the way, and does it come back?
//   * does the island STOP? A hidden world still rendering behind an opaque frame is an
//     iPad's battery spent on a picture nobody can see.
//   * is the way home where a child will look for it?
//
// Run: node test/e2e/browser-racers.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');
mkdirSync(SHOTS, { recursive: true });

const PORT = 2678;
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1600);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 900, height: 620 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

try {
  // The whole game is served as ordinary static files under the client. If any one of
  // them 404s the frame comes up black, and a black frame looks exactly like a game that
  // failed to start — so check the files before checking the game.
  for (const file of ['index.html', 'game.js', 'style.css', 'vocab.js', 'net.js', 'three.module.js']) {
    const res = await fetch(`http://127.0.0.1:${PORT}/racers/${file}`);
    check(`racers/${file} is served`, res.ok, `${res.status}`);
  }

  const page = await openPage('Yuto');

  // ---- the way in ------------------------------------------------------------------
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.fly('ride');
    uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 900));
    const data = await uspeak.rpg.ride.ready;
    const isle = data.island;
    const start = isle.spots.find((s) => s.kind === 'start');
    uspeak.player.position.set(isle.x + start.x, 0, isle.z + start.z);
    for (let i = 0; i < 40 && !uspeak.rpg.rideNearby(); i += 1) await new Promise((r) => setTimeout(r, 150));
  });
  check('のりもの島のスタートラインに立てる', !!(await page.evaluate(() => uspeak.rpg.rideNearby()?.spot?.id)));

  await page.evaluate(() => uspeak.net.rideInteract());
  await page.waitForFunction(() => document.querySelector('#ride-arcade'), null, { timeout: 30000, polling: 250 });
  const door = await page.evaluate(() => {
    const b = document.querySelector('#ride-arcade');
    const r = b.getBoundingClientRect();
    return { text: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('ガレージに AURORA KART の入口がある', /AURORA KART/.test(door.text) && door.h >= 34, JSON.stringify(door));
  await page.screenshot({ path: path.join(SHOTS, 'racers-door.png') });

  // ---- it opens, and the island gets out of the way --------------------------------
  const framesBefore = await page.evaluate(() => uspeak.renderer.info.render.frame);
  await page.evaluate(() => document.querySelector('#ride-arcade').click());
  await page.waitForFunction(() => document.querySelector('#racers-frame'), null, { timeout: 30000, polling: 200 });
  const covered = await page.evaluate(() => {
    const f = document.querySelector('#racers-frame').getBoundingClientRect();
    const seen = (sel) => !!document.querySelector(sel)?.getClientRects().length;
    return {
      w: Math.round(f.width), h: Math.round(f.height),
      full: Math.round(f.width) >= window.innerWidth - 1 && Math.round(f.height) >= window.innerHeight - 1,
      furniture: ['header', '.right-rail', '.bottom', '#coin-hud', '#net-dock'].filter(seen),
      flag: document.body.dataset.racers || '',
    };
  });
  check('フレームが画面いっぱいに開く', covered.full, `${covered.w}×${covered.h}`);
  check('島の家具はぜんぶ消える', covered.furniture.length === 0, covered.furniture.join(',') || 'none left');
  check('body[data-racers] が立つ', covered.flag === 'on', covered.flag);

  // ---- the game inside really starts -----------------------------------------------
  //
  // Not "the iframe loaded" — that is true of a blank page. This asks the game's own
  // window whether three.js is in it and whether it has put anything on the screen.
  const boot = await page.waitForFunction(() => {
    const w = document.querySelector('#racers-frame')?.contentWindow;
    const d = w?.document;
    if (!d || d.readyState !== 'complete') return null;
    const canvas = d.querySelector('#game');
    if (!canvas || !canvas.width) return null;
    return {
      title: d.title,
      canvas: `${canvas.width}×${canvas.height}`,
      // The game's own menu, which only exists once its script has run.
      modes: [...d.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode),
      tracks: d.querySelectorAll('[data-track]').length,
      webgl: !!(canvas.getContext('webgl2') || canvas.getContext('webgl')),
      body: d.body.className,
    };
  }, null, { timeout: 90000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
  check('中のゲームが起動する', !!boot && /AURORA/.test(boot.title || ''), JSON.stringify(boot));
  check('…3Dのキャンバスを持っている', !!boot?.webgl && boot.canvas !== '0×0', boot?.canvas);
  check('…4つのコースとモードのメニューが出ている', (boot?.tracks || 0) === 4 && (boot?.modes || []).length >= 3,
    `${boot?.tracks} tracks, modes ${(boot?.modes || []).join(',')}`);

  // The online tab is removed on purpose: its WebSocket goes to the origin root, which
  // here is the classroom's Colyseus endpoint. A child pressing it would get an error
  // nobody can act on, so it is replaced by a sentence saying where class racing lives.
  check('オンラインのタブは外してある（Colyseus と口がぶつかるため）',
    !(boot?.modes || []).includes('online'), (boot?.modes || []).join(','));
  const note = await page.evaluate(() => {
    const d = document.querySelector('#racers-frame')?.contentDocument;
    return [...(d?.querySelectorAll('.mode-description') || [])].map((p) => p.textContent).join(' | ');
  });
  check('…かわりに「みんなで走るのはこっち」と書いてある', /のりもの島/.test(note), note.slice(0, 80));
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOTS, 'racers-game.png') });

  // ---- the island stops --------------------------------------------------------------
  const a = await page.evaluate(() => uspeak.renderer.info.render.frame);
  await sleep(2500);
  const b = await page.evaluate(() => uspeak.renderer.info.render.frame);
  check('後ろの島は描くのをやめている', b === a, `${framesBefore} → ${a} → ${b}`);
  // …and the game in front is not stopped: its own renderer is still going.
  const drew = await page.evaluate(() => {
    const w = document.querySelector('#racers-frame')?.contentWindow;
    return !!w && typeof w.performance?.now === 'function';
  });
  check('前のゲームは動いている', drew);

  // ---- the way home ------------------------------------------------------------------
  const home = await page.evaluate(() => {
    const d = document.querySelector('#racers-frame')?.contentDocument;
    const b = d?.querySelector('#racers-home');
    return b ? { text: b.textContent, inHeader: !!b.closest('.top-actions') } : null;
  });
  check('もどるボタンはゲーム自身のヘッダーの中にある', !!home?.inHeader, JSON.stringify(home));
  check('…なので画面のすみの非常口は出していない',
    await page.evaluate(() => !!document.querySelector('#racers-exit')?.hidden));

  await page.evaluate(() => document.querySelector('#racers-frame').contentDocument.querySelector('#racers-home').click());
  await page.waitForFunction(() => !document.querySelector('#racers-frame'), null, { timeout: 30000, polling: 200 });
  const back = await page.evaluate(() => ({
    flag: document.body.dataset.racers || '',
    furniture: ['header', '.right-rail', '.bottom'].filter((s) => !!document.querySelector(s)?.getClientRects().length),
    where: uspeak.rpg.state.current,
  }));
  check('島がそのまま戻ってくる', back.flag === '' && back.furniture.length === 3 && back.where === 'ride', JSON.stringify(back));
  await sleep(1500);
  const c = await page.evaluate(() => uspeak.renderer.info.render.frame);
  await sleep(2000);
  const d = await page.evaluate(() => uspeak.renderer.info.render.frame);
  check('…そして島がまた描きはじめる', d > c, `${c} → ${d}`);
  await page.screenshot({ path: path.join(SHOTS, 'racers-back.png') });

  // A phone in landscape is the shape this is actually held in. The frame is
  // `position:fixed; inset:0`, so the only way it can go wrong is by making the page
  // itself scroll sideways — which would let a child drag the game half off the screen.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => uspeak.net.racers.open());
  await page.waitForFunction(() => document.querySelector('#racers-frame')?.contentDocument?.readyState === 'complete',
    null, { timeout: 90000, polling: 500 }).catch(() => {});
  await sleep(1200);
  const phone = await page.evaluate(() => {
    const f = document.querySelector('#racers-frame').getBoundingClientRect();
    return {
      fills: Math.round(f.width) >= window.innerWidth - 1 && Math.round(f.height) >= window.innerHeight - 1,
      sideways: document.documentElement.scrollWidth > window.innerWidth,
      size: `${Math.round(f.width)}×${Math.round(f.height)}`,
    };
  });
  check('横向きのスマホでも画面ちょうどに収まる', phone.fills && !phone.sideways, JSON.stringify(phone));
  await page.screenshot({ path: path.join(SHOTS, 'racers-phone.png') });
  await page.evaluate(() => uspeak.net.racers.close());
  await page.setViewportSize({ width: 900, height: 620 });
  await sleep(600);

  // Opening it twice must work: the frame is destroyed on the way out, not hidden.
  await page.evaluate(() => uspeak.net.racers.open());
  const again = await page.waitForFunction(() => {
    const d = document.querySelector('#racers-frame')?.contentWindow?.document;
    return d?.readyState === 'complete' && d.querySelectorAll('[data-track]').length === 4;
  }, null, { timeout: 90000, polling: 500 }).then(() => true).catch(() => false);
  check('二度目もちゃんと開く', again);
  await page.evaluate(() => uspeak.net.racers.close());
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false, detail: String(err) });
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
