// 同梱した外部ゲーム（AURORA KART / BLOCKWILD）が島から開くこと、を実ブラウザで。
//
// Worth running for real because almost nothing about it can be unit-tested. Each is a
// whole other game in a frame: a second three.js, a second WebGL context, a second
// stylesheet full of bare `header` and `button` selectors, and a second set of key
// handlers that want WASD. The questions are therefore:
//
//   * does it BOOT — not "does the frame exist", but is there a three.js in there that
//     has put something on the screen?
//   * does the island get out of the way, and does it come back?
//   * does the island STOP? A hidden world still rendering behind an opaque frame is an
//     iPad's battery spent on a picture nobody can see.
//   * is the way home where a child will look for it?
//   * is the mode that cannot work here actually gone, and does it say where to go?
//
// Run: node test/e2e/browser-arcade.mjs   (not part of `npm test`)
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

// The two guests, and the one thing that differs about each: how a child gets to it, and
// what "this really booted" looks like from outside its frame.
const GAMES = [
  {
    id: 'racers',
    label: 'AURORA KART',
    title: /AURORA/,
    files: ['index.html', 'game.js', 'style.css', 'vocab.js', 'net.js', 'three.module.js'],
    // Its own header row, beside 操作ガイド and 音声.
    homeIn: '.top-actions',
    // The start line has no room for a sixth building — the course rings the island — so
    // the way in is a card at the top of the panel it opens.
    async approach(page) {
      await page.evaluate(async () => {
        for (const d of document.querySelectorAll('dialog[open]')) d.close();
        uspeak.rpg.fly('ride'); uspeak.rpg.finishFlight();
        await new Promise((r) => setTimeout(r, 900));
        const isle = (await uspeak.rpg.ride.ready).island;
        const spot = isle.spots.find((s) => s.kind === 'start');
        uspeak.rpg.inside?.leave?.(true);
        uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.6);
        for (let i = 0; i < 40 && !uspeak.rpg.rideNearby(); i += 1) await new Promise((r) => setTimeout(r, 150));
      });
      await page.evaluate(() => uspeak.net.rideInteract());
      await page.waitForSelector('#ride-dialog[open] #ride-arcade', { timeout: 40000 });
      return page.evaluate(() => {
        const b = document.querySelector('#ride-arcade');
        return { how: 'パネルのカード', text: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) };
      });
    },
    enter: (page) => page.evaluate(() => document.querySelector('#ride-arcade').click()),
    booted: (d) => ({
      canvas: d.querySelector('#game')?.width || 0,
      modes: [...d.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode),
      pieces: d.querySelectorAll('[data-track]').length,   // four courses
    }),
    ok: (b) => b.pieces === 4 && b.modes.length >= 3 && !b.modes.includes('online'),
    gone: '[data-mode="online"]',
    says: /のりもの島/,
  },
  {
    id: 'blockwild',
    label: 'BLOCKWILD',
    title: /BLOCKWILD/,
    files: ['index.html', 'game.js', 'style.css', 'three.module.js', 'src/world.js', 'src/net.js'],
    // Its own menu row, beside 保存 and 設定.
    homeIn: '.menulinks',
    // まちづくり島 had room for a building, so BLOCKWILD got one: ブロックの とびら, walked
    // into like every other door in this world. This first lived as a card inside the
    // block shop's panel and was, fairly, called hard to reach.
    async approach(page) {
      await page.evaluate(async () => {
        for (const d of document.querySelectorAll('dialog[open]')) d.close();
        uspeak.rpg.fly('town'); uspeak.rpg.finishFlight();
        await new Promise((r) => setTimeout(r, 900));
        const isle = (await uspeak.rpg.town.ready).island;
        const spot = isle.spots.find((s) => s.kind === 'blockwild');
        uspeak.rpg.inside?.leave?.(true);
        // Just short of the doorway, so the label can be read before it opens.
        uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.8);
        for (let i = 0; i < 40 && !uspeak.rpg.townNearby(); i += 1) await new Promise((r) => setTimeout(r, 150));
      });
      // The label is written by the world's frame loop, which here runs at about two
      // frames a second — read it the instant the child arrives and you get whatever the
      // last island wrote. Wait for it to catch up rather than sampling once.
      await page.waitForFunction(
        () => document.querySelector('#near')?.style.display !== 'none'
          && /BLOCKWILD/.test(document.querySelector('#interact span')?.textContent || ''),
        null, { timeout: 30000, polling: 250 },
      ).catch(() => {});
      return page.evaluate(() => ({
        how: '島の建物',
        text: document.querySelector('#near')?.style.display !== 'none'
          ? document.querySelector('#interact span').textContent : '(#near is hidden)',
        h: Math.round(document.querySelector('#interact').getBoundingClientRect().height),
      }));
    },
    // Walked into, not pressed: the doorway is the button, as it is everywhere else here.
    enter: (page) => page.evaluate(async () => {
      const isle = (await uspeak.rpg.town.ready).island;
      const spot = isle.spots.find((s) => s.kind === 'blockwild');
      uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z);
    }),
    booted: (d) => ({
      canvas: d.querySelector('#game')?.width || 0,
      modes: [...d.querySelectorAll('.choice[data-mode]')].map((b) => b.dataset.mode),
      pieces: d.querySelector('#play') ? 1 : 0,            // the way into the world
    }),
    ok: (b) => b.pieces === 1 && b.modes.includes('creative') && b.modes.includes('survival'),
    gone: '#netJoin',
    says: /まちづくり島/,
  },
];

try {
  // Every guest is served as ordinary static files under the client. If any one of them
  // 404s the frame comes up black, and a black frame looks exactly like a game that
  // failed to start — so check the files before checking the game.
  for (const game of GAMES) {
    const missing = [];
    for (const file of game.files) {
      const res = await fetch(`http://127.0.0.1:${PORT}/${game.id}/${file}`);
      if (!res.ok) missing.push(`${file}:${res.status}`);
    }
    check(`${game.label}: ${game.files.length} 個のファイルが配信されている`, missing.length === 0, missing.join(' '));
  }

  const page = await openPage('Yuto');

  for (const game of GAMES) {
    // ---- the way in ----------------------------------------------------------------
    const door = await game.approach(page);
    check(`${game.label}: 島に入口があって、名前が読める（${door.how}）`,
      door.text.includes(game.label) && door.h >= 34, JSON.stringify(door));
    await page.screenshot({ path: path.join(SHOTS, `arcade-${game.id}-door.png`) });

    // ---- it opens, the island gets out of the way and stops -------------------------
    await game.enter(page);
    await page.waitForFunction(() => document.querySelector('.arcade-frame'), null, { timeout: 40000, polling: 200 });
    const covered = await page.evaluate(() => {
      const f = document.querySelector('.arcade-frame').getBoundingClientRect();
      const seen = (sel) => !!document.querySelector(sel)?.getClientRects().length;
      return {
        full: Math.round(f.width) >= window.innerWidth - 1 && Math.round(f.height) >= window.innerHeight - 1,
        furniture: ['header', '.right-rail', '.bottom', '#coin-hud', '#net-dock'].filter(seen),
        flag: document.body.dataset.arcade || '',
      };
    });
    check(`${game.label}: フレームが画面いっぱいに開く`, covered.full);
    check(`${game.label}: 島の家具はぜんぶ消える`, covered.furniture.length === 0, covered.furniture.join(',') || 'none left');
    check(`${game.label}: body[data-arcade] がこのゲームの名前になる`, covered.flag === game.id, covered.flag);

    // Not "the iframe loaded" — that is true of a blank page. This asks the game's own
    // window whether it has drawn a canvas and put its menu up.
    const boot = await page.waitForFunction((probe) => {
      const w = document.querySelector('.arcade-frame')?.contentWindow;
      const d = w?.document;
      if (!d || d.readyState !== 'complete') return null;
      // eslint-disable-next-line no-new-func
      const read = new Function(`return (${probe})`)();
      const out = read(d);
      return out.canvas ? { ...out, title: d.title } : null;
    }, game.booted.toString(), { timeout: 120000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
    check(`${game.label}: 中のゲームが起動する`, !!boot && game.title.test(boot.title || ''), JSON.stringify(boot));
    check(`${game.label}: …メニューがそろっている`, !!boot && game.ok(boot), JSON.stringify(boot));

    // The mode that cannot work here: both games open a WebSocket on this origin, and
    // Colyseus takes every upgrade on this port. Gone, and replaced by where to go.
    const neutral = await page.evaluate((g) => {
      const d = document.querySelector('.arcade-frame')?.contentDocument;
      return { still: !!d?.querySelector(g.gone), text: d?.body?.textContent || '' };
    }, { gone: game.gone });
    check(`${game.label}: つながらないオンラインは外してある`, !neutral.still);
    check(`${game.label}: …かわりに「みんなでやるのはこっち」と書いてある`, game.says.test(neutral.text));
    await sleep(2500);
    await page.screenshot({ path: path.join(SHOTS, `arcade-${game.id}-game.png`) });

    const a = await page.evaluate(() => uspeak.renderer.info.render.frame);
    await sleep(2500);
    const b = await page.evaluate(() => uspeak.renderer.info.render.frame);
    check(`${game.label}: 後ろの島は描くのをやめている`, b === a, `${a} → ${b}`);

    // ---- the way home ----------------------------------------------------------------
    const home = await page.evaluate((host) => {
      const d = document.querySelector('.arcade-frame')?.contentDocument;
      const el = d?.querySelector('.arcade-home');
      return el ? { text: el.textContent, inPlace: !!el.closest(host) } : null;
    }, game.homeIn);
    check(`${game.label}: もどるボタンはゲーム自身のメニューの中にある`, !!home?.inPlace, JSON.stringify(home));
    check(`${game.label}: …なので画面のすみの非常口は出していない`,
      await page.evaluate(() => !!document.querySelector('.arcade-exit')?.hidden));

    await page.evaluate(() => document.querySelector('.arcade-frame').contentDocument.querySelector('.arcade-home').click());
    await page.waitForFunction(() => !document.querySelector('.arcade-frame'), null, { timeout: 30000, polling: 200 });
    const back = await page.evaluate(() => ({
      flag: document.body.dataset.arcade || '',
      furniture: ['header', '.right-rail', '.bottom'].filter((s) => !!document.querySelector(s)?.getClientRects().length),
    }));
    check(`${game.label}: 島がそのまま戻ってくる`, back.flag === '' && back.furniture.length === 3, JSON.stringify(back));
    const c = await page.evaluate(() => uspeak.renderer.info.render.frame);
    await sleep(2200);
    const d2 = await page.evaluate(() => uspeak.renderer.info.render.frame);
    check(`${game.label}: …そして島がまた描きはじめる`, d2 > c, `${c} → ${d2}`);
  }

  // ---- the case the first version of this got wrong ----------------------------------
  //
  // On the start line, a child already sitting on a vehicle used to skip the panel and go
  // straight into a countdown — so the only door to AURORA KART was shut at the one place
  // on のりもの島 that is about racing.
  const rode = await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.fly('ride'); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 900));
    const isle = (await uspeak.rpg.ride.ready).island;
    const at = async (id) => {
      const spot = isle.spots.find((s) => s.id === id);
      // Stand in FRONT of the door, not in it: land inside the 1.4-wide doorway box and
      // the child is taken into the building, and from there `player.position` is interior
      // coordinates, so moving it does not walk them back out.
      uspeak.rpg.inside?.leave?.(true);
      uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.6);
      for (let i = 0; i < 40 && uspeak.rpg.rideNearby()?.spot?.id !== id; i += 1) await new Promise((r) => setTimeout(r, 150));
      return uspeak.rpg.rideNearby()?.spot?.id === id;
    };
    return { kick: await at('kick') };
  });
  check('キックボード置き場まで行ける', rode.kick);
  // Bought through the panel, not by sending `ride:buy` by hand: the room refuses a
  // purchase from a child it thinks is somewhere else, and it is net-client's own send
  // that tells it where they are first.
  await page.evaluate(() => uspeak.net.rideInteract());
  await page.waitForSelector('#ride-dialog[open] [data-buy]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#ride-body [data-buy]').click());
  const bought = await page.waitForFunction(() => uspeak.net.ride.riding || null,
    null, { timeout: 30000, polling: 200 }).then((h) => h.jsonValue()).catch(() => '');
  check('キックボードを買って乗れる', bought === 'kick', String(bought));
  await page.evaluate(() => document.querySelector('#ride-done')?.click());
  await sleep(400);
  const onLine = await page.evaluate(async () => {
    const isle = (await uspeak.rpg.ride.ready).island;
    const spot = isle.spots.find((s) => s.id === 'start');
    uspeak.rpg.inside?.leave?.(true);
    uspeak.player.position.set(isle.x + spot.x, 0, isle.z + spot.z + 1.6);
    for (let i = 0; i < 40 && uspeak.rpg.rideNearby()?.spot?.id !== 'start'; i += 1) await new Promise((r) => setTimeout(r, 150));
    return { where: uspeak.rpg.rideNearby()?.spot?.id || '', riding: uspeak.net.ride.riding };
  });
  check('乗ったままスタートラインに立てる', onLine.where === 'start' && !!onLine.riding, JSON.stringify(onLine));
  await page.evaluate(() => uspeak.net.rideInteract());
  await page.waitForFunction(() => document.querySelector('#ride-dialog')?.open, null, { timeout: 30000, polling: 200 });
  const both = await page.evaluate(() => ({
    classRace: document.querySelector('#ride-start')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || '',
    arcade: !!document.querySelector('#ride-arcade'),
    racing: !!document.body.dataset.race,
  }));
  check('乗っていても、スタートラインで両方から選べる',
    /クラスの レースに でる/.test(both.classRace) && both.arcade && !both.racing, JSON.stringify(both));
  await page.screenshot({ path: path.join(SHOTS, 'arcade-startline.png') });
  await page.evaluate(() => document.querySelector('#ride-close')?.click());

  // ---- a phone in landscape, which is the shape this is held in ----------------------
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => uspeak.net.blockwild.open());
  await page.waitForFunction(() => document.querySelector('.arcade-frame')?.contentDocument?.readyState === 'complete',
    null, { timeout: 120000, polling: 500 }).catch(() => {});
  await sleep(1200);
  const phone = await page.evaluate(() => {
    const f = document.querySelector('.arcade-frame').getBoundingClientRect();
    return {
      fills: Math.round(f.width) >= window.innerWidth - 1 && Math.round(f.height) >= window.innerHeight - 1,
      sideways: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  check('横向きのスマホでも画面ちょうどに収まる', phone.fills && !phone.sideways, JSON.stringify(phone));
  await page.screenshot({ path: path.join(SHOTS, 'arcade-phone.png') });
  await page.evaluate(() => uspeak.net.blockwild.close());
  await page.setViewportSize({ width: 900, height: 620 });
  await sleep(600);

  // Opening twice must work: the frame is destroyed on the way out, not hidden. And the
  // two guests must not tread on each other — the second one opened is the one you get.
  await page.evaluate(() => uspeak.net.racers.open());
  const again = await page.waitForFunction(() => {
    const d = document.querySelector('.arcade-frame')?.contentWindow?.document;
    return d?.readyState === 'complete' && d.querySelectorAll('[data-track]').length === 4;
  }, null, { timeout: 120000, polling: 500 }).then(() => true).catch(() => false);
  check('二度目もちゃんと開く', again);
  check('…そして開いているのは1つだけ',
    (await page.evaluate(() => document.querySelectorAll('.arcade-frame').length)) === 1);
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
