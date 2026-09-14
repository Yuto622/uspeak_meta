// きせかえの店, in a real browser.
//
// The shop is worth opening for real rather than unit-testing, because three of the four
// ways it can be broken are invisible to Node:
//
//   * the way in. The 👕 sits in `header .stats`, where `style.css` says
//     `.stats button { width:32px; height:32px }` — one class plus one element, enough to
//     beat a plain `.wear-button` and squash it. The coin badge lost that fight once
//     already.
//   * the hat itself. `dressAvatar` hangs a model on an anchor inside a body built by
//     `buildAvatar`; whether the anchor exists, and whether the hat comes off again when
//     another one goes on, is a question about real Three.js objects.
//   * the other children. An outfit is only worth coins if the class can see it, and it
//     reaches them through the avatar string their remote players are already built from.
//
// The fourth — that the room decides the price — is covered in room.test.mjs; here it is
// only confirmed that the page does not quietly help itself.
//
// Run: node test/e2e/browser-wear.mjs   (not part of `npm test`)
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

const PORT = 2674;
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
  const page = await openPage('Yuto');
  const mate = await openPage('Aki');

  // ---- the way in -----------------------------------------------------------------
  const button = await page.evaluate(() => {
    const el = document.querySelector('header .stats #wear-button');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim() };
  });
  check('きせかえ has a button in the header, beside the avatar it changes', !!button, JSON.stringify(button));
  // The `.stats button` trap: 32px is under the 34px a finger needs, and the coin badge
  // was flattened by exactly this rule.
  check('and it is big enough to press with a finger', button.w >= 34 && button.h >= 34, `${button.w}×${button.h}`);

  await page.evaluate(() => document.querySelector('#wear-button').click());
  await page.waitForFunction(() => document.querySelector('#wear-dialog')?.open, null, { timeout: 60000 });
  // The cards come from the room, so the grid is empty until wear:shop lands.
  await page.waitForFunction(() => document.querySelectorAll('#wear-grid [data-item]').length > 0, null, { timeout: 60000, polling: 200 });

  const shop = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#wear-grid [data-item]')];
    const canvas = document.querySelector('#wear-canvas');
    const r = canvas?.getBoundingClientRect();
    return {
      cards: cards.length,
      slots: document.querySelectorAll('#wear-slots [data-slot]').length,
      priced: cards.filter((c) => /\d/.test(c.querySelector('.wear-price')?.textContent || '')).length,
      swatched: cards.filter((c) => (getComputedStyle(c.querySelector('.wear-swatch')).backgroundColor || '') !== 'rgba(0, 0, 0, 0)').length,
      coins: Number((document.querySelector('#wear-coins')?.textContent || '').replace(/[^\d]/g, '')),
      stage: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      fallback: !document.querySelector('#wear-fallback')?.hidden,
      wide: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  check('the shop opens with the room\'s stock in it', shop.cards >= 3 && shop.slots === 4, `${shop.cards} cards, ${shop.slots} slots`);
  check('every card shows what it costs and what colour it is',
    shop.priced === shop.cards && shop.swatched === shop.cards, `${shop.priced}/${shop.cards} priced, ${shop.swatched} coloured`);
  check('the child\'s purse is on the shop, not only in the header', shop.coins > 0, `${shop.coins} coins`);

  // ---- the picture on each card ----------------------------------------------------
  //
  // Every card shows the real model, baked once through the one renderer the stage owns.
  // A blank 132px transparent PNG is a few hundred bytes; anything with a model in it is
  // several kilobytes, so the size of the data URL is a fair test of "there is something
  // in the picture" without reading pixels back out of the page.
  await page.waitForFunction(
    () => [...document.querySelectorAll('#wear-grid img[data-shot]')].filter((i) => !i.hidden && i.src.startsWith('data:image/png')).length >= 3,
    null, { timeout: 60000, polling: 300 },
  ).catch(() => {});
  const pics = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#wear-grid img[data-shot]')];
    const drawn = all.filter((i) => !i.hidden && i.src.startsWith('data:image/png'));
    return {
      cards: all.length,
      drawn: drawn.length,
      // The smallest picture in the set: if one item bakes to an empty frame this catches
      // it, where an average would hide it.
      thinnest: drawn.length ? Math.min(...drawn.map((i) => i.src.length)) : 0,
      tinted: document.querySelectorAll('#wear-grid .wear-swatch.shot').length,
      distinct: new Set(drawn.map((i) => i.src)).size,
    };
  });
  check('every card in the slot shows a rendered model, not a colour swatch',
    pics.drawn === pics.cards && pics.cards >= 8, `${pics.drawn}/${pics.cards} drawn`);
  check('and each picture actually has something in it',
    pics.thinnest > 2000, `smallest picture ${pics.thinnest} bytes`);
  check('…a different something for each item', pics.distinct === pics.drawn, `${pics.distinct} distinct of ${pics.drawn}`);
  check('the flat colour steps aside once the picture lands', pics.tinted === pics.cards);
  check('the preview stage has a size to draw into', !!shop.stage && shop.stage.w > 80 && shop.stage.h > 80, JSON.stringify(shop.stage));
  check('and the dialog does not push the page sideways', shop.wide);
  await page.screenshot({ path: path.join(SHOTS, 'wear-shop.png') });

  // ---- trying it on is free -------------------------------------------------------
  const worn = () => page.evaluate(() => {
    const model = uspeak.player.children.find((c) => c.userData?.anchors);
    return { on: [...(model?.userData?.worn?.keys() || [])], anchors: Object.keys(model?.userData?.anchors || {}) };
  });
  check('the avatar has somewhere to hang a hat', (await worn()).anchors.length >= 4, JSON.stringify((await worn()).anchors));

  const cheapest = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#wear-grid [data-item]')]
      .filter((c) => !c.classList.contains('locked'))
      .map((c) => ({ id: c.dataset.item, price: Number((c.querySelector('.wear-price')?.textContent || '').replace(/[^\d]/g, '')) }))
      .sort((a, b) => a.price - b.price);
    return cards[0];
  });
  const purseNow = () => page.evaluate(() => Number((document.querySelector('#coin-hud')?.textContent || '').replace(/[^\d]/g, '')));
  const before = await purseNow();

  await page.evaluate((id) => document.querySelector(`[data-item="${id}"]`).click(), cheapest.id);
  await sleep(700);
  const tried = await page.evaluate((id) => {
    const model = uspeak.player.children.find((c) => c.userData?.anchors);
    return {
      preview: !!document.querySelector('#wear-do'),
      buys: (document.querySelector('#wear-do')?.textContent || '').includes('かう'),
      // Trying on is a preview, on the stage; it does not dress the child in the world.
      onBody: [...(model?.userData?.worn?.keys() || [])].includes(id),
      coins: Number((document.querySelector('#coin-hud')?.textContent || '').replace(/[^\d]/g, '')),
    };
  }, cheapest.id);
  check('tapping an item offers it rather than buying it', tried.preview && tried.buys, JSON.stringify(tried));
  check('and browsing the shop costs nothing', tried.coins === before && !tried.onBody, `${before} → ${tried.coins}`);

  // ---- buying is a second, deliberate tap -----------------------------------------
  await page.evaluate(() => document.querySelector('#wear-do').click());
  await page.waitForFunction((id) => {
    const model = uspeak.player.children.find((c) => c.userData?.anchors);
    return [...(model?.userData?.worn?.keys() || [])].includes(id);
  }, cheapest.id, { timeout: 60000, polling: 200 });
  // The badge counts DOWN to a new balance rather than jumping to it, and that count is
  // driven by the frame clock — which in this container ticks about once a second. So
  // wait for the number to land rather than for a stopwatch: read too early and you catch
  // it at 79 on its way from 100 to 60, which is the animation working, not a bug.
  await page.waitForFunction((want) => {
    const shown = Number((document.querySelector('#coin-hud')?.textContent || '').replace(/[^\d]/g, ''));
    return uspeak.coins.coins === want && shown === want;
  }, before - cheapest.price, { timeout: 30000, polling: 250 }).catch(() => {});
  const after = await purseNow();
  check('buying charges the room\'s price', after === before - cheapest.price, `${before} − ${cheapest.price} = ${after}`);
  check('and what was bought is being worn, on the real body', (await worn()).on.includes(cheapest.id));
  await page.screenshot({ path: path.join(SHOTS, 'wear-bought.png') });

  // ---- one thing per slot ----------------------------------------------------------
  const sibling = await page.evaluate((id) => {
    const cards = [...document.querySelectorAll('#wear-grid [data-item]')]
      .filter((c) => !c.classList.contains('locked') && c.dataset.item !== id)
      .map((c) => ({ id: c.dataset.item, price: Number((c.querySelector('.wear-price')?.textContent || '').replace(/[^\d]/g, '')) }))
      .sort((a, b) => a.price - b.price);
    return cards[0] || null;
  }, cheapest.id);
  if (sibling && sibling.price <= after) {
    await page.evaluate((id) => document.querySelector(`[data-item="${id}"]`).click(), sibling.id);
    await sleep(500);
    await page.evaluate(() => document.querySelector('#wear-do').click());
    await page.waitForFunction((id) => {
      const model = uspeak.player.children.find((c) => c.userData?.anchors);
      return [...(model?.userData?.worn?.keys() || [])].includes(id);
    }, sibling.id, { timeout: 60000, polling: 200 });
    const both = await worn();
    check('a second hat replaces the first rather than stacking two', !both.on.includes(cheapest.id), both.on.join(','));
  } else {
    check('a second hat replaces the first rather than stacking two', true, 'skipped: purse spent');
  }
  const nowOn = (await worn()).on;

  // ---- a locked item says which kind of no it is -----------------------------------
  const locked = await page.evaluate(() => {
    for (const slot of [...document.querySelectorAll('#wear-slots [data-slot]')]) {
      slot.click();
      const card = document.querySelector('#wear-grid .wear-card.locked');
      if (card) return { id: card.dataset.item, says: card.querySelector('em')?.textContent || '' };
    }
    return null;
  });
  check('an item the child has not levelled up to still shows, with the reason',
    !!locked && /レベル/.test(locked.says), JSON.stringify(locked));
  if (locked) {
    await page.evaluate((id) => document.querySelector(`[data-item="${id}"]`).click(), locked.id);
    await sleep(500);
    const spend = await page.evaluate(() => ({
      buyable: !!document.querySelector('#wear-do'),
      says: document.querySelector('#wear-caption')?.textContent || '',
    }));
    check('and it cannot be bought by tapping it twice', !spend.buyable && /レベル/.test(spend.says), JSON.stringify(spend));
  }

  // ---- the rest of the class ---------------------------------------------------------
  // The whole point of paying for a hat: someone else can see it. The other page builds
  // its remote avatars from the same wardrobe.json.
  const seen = await mate.waitForFunction((want) => {
    const ids = [...uspeak.net.room.state.players.keys()];
    for (const id of ids) {
      const r = uspeak.net.remotes.get(id);
      const on = [...(r?.model?.userData?.worn?.keys() || [])];
      if (want.every((w) => on.includes(w)) && on.length) return on;
    }
    return null;
  }, nowOn, { timeout: 30000, polling: 400 }).then((h) => h.jsonValue()).catch(() => null);
  check('and the other children in the class can see it on', !!seen, JSON.stringify(seen));
  await mate.screenshot({ path: path.join(SHOTS, 'wear-classmate.png') });

  // ---- taking it off, and going home ------------------------------------------------
  // Find the card again: it may be under a different slot tab by now.
  await page.evaluate((id) => {
    for (const s of document.querySelectorAll('#wear-slots [data-slot]')) {
      s.click();
      const card = document.querySelector(`#wear-grid [data-item="${id}"]`);
      if (card) { card.click(); return; }
    }
  }, nowOn[0]);
  await sleep(600);
  const off = await page.evaluate(() => (document.querySelector('#wear-do')?.textContent || '').trim());
  check('what is already on offers to come off', off === 'ぬぐ', off);
  await page.evaluate(() => document.querySelector('#wear-do')?.click());
  await page.waitForFunction((id) => {
    const model = uspeak.player.children.find((c) => c.userData?.anchors);
    return ![...(model?.userData?.worn?.keys() || [])].includes(id);
  }, nowOn[0], { timeout: 60000, polling: 200 }).then(() => check('and it comes off', true)).catch(() => check('and it comes off', false));

  await page.evaluate(() => document.querySelector('#wear-close').click());
  await sleep(300);
  check('the shop closes and leaves nothing behind',
    await page.evaluate(() => !document.querySelector('#wear-dialog')?.open
      && !document.querySelector('#wear-dialog').getClientRects().length));

  // ---- きせかえ島 ---------------------------------------------------------------------
  //
  // The other way in, and the nicer one: four shops round a courtyard, and the shop a
  // child walks into is the kind of thing they are shopping for. The header button opens
  // the whole shop; walking into the hat shop should open it on hats.
  const isle = await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    uspeak.rpg.fly('wear');
    uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 900));
    const data = await uspeak.rpg.wear.ready;
    return { here: uspeak.rpg.state.current, shops: (data.island?.spots || []).map((s) => ({ id: s.id, slot: s.slot, x: s.x, z: s.z })), x: data.island.x, z: data.island.z };
  });
  check('きせかえ島 is a place a child can fly to', isle.here === 'wear', isle.here);
  check('and it has one shop for each kind of thing', isle.shops.length === 4, isle.shops.map((s) => s.slot).join(','));
  await page.screenshot({ path: path.join(SHOTS, 'wear-island.png') });

  // Walk into the back shop — deliberately not the slot the panel was last left on, so
  // "it opened on せなか" cannot be a coincidence.
  const shopFor = isle.shops.find((s) => s.slot === 'back');
  await page.evaluate(async ({ isle: i, spot }) => {
    uspeak.player.position.set(i.x + spot.x, 0, i.z + spot.z);
    for (let n = 0; n < 40 && !uspeak.rpg.wearNearby(); n += 1) await new Promise((r) => setTimeout(r, 150));
  }, { isle, spot: shopFor });
  const standing = await page.evaluate(() => uspeak.rpg.wearNearby()?.spot?.id || null);
  check('walking to a shop puts a child at its door', standing === shopFor.id, `${standing}`);

  await page.evaluate(() => uspeak.net.wearInteract());
  await page.waitForFunction(() => document.querySelector('#wear-dialog')?.open, null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#wear-grid [data-item]').length > 0, null, { timeout: 60000, polling: 200 });
  const opened = await page.evaluate(() => ({
    slot: document.querySelector('#wear-slots button.on')?.dataset.slot || '',
    first: document.querySelector('#wear-grid [data-item]')?.dataset.item || '',
  }));
  check('and the shop opens on the thing that shop sells', opened.slot === 'back', JSON.stringify(opened));
  await page.screenshot({ path: path.join(SHOTS, 'wear-island-shop.png') });
  await page.evaluate(() => document.querySelector('#wear-close').click());
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
