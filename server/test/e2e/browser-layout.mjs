// Renders the game at phone and tablet viewports, screenshots the multiplayer UI
// states, and fails if anything leaves the viewport or collides with something else.
//
// Requires Playwright, like the other e2e scripts:
//   npm i -D playwright && npx playwright install chromium
// Run:  npm run test:layout            (all viewports)
//       node test/e2e/browser-layout.mjs iphone-portrait   (just one)
// Screenshots land in server/loadtest-results/layout-*.png.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.LAYOUT_PORT || 2671);
const OUT = path.resolve(serverDir, 'loadtest-results');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ONLY = process.argv.slice(2);
const ALL = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'small-portrait', width: 360, height: 640 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
];
const DEVICES = ONLY.length ? ALL.filter((d) => ONLY.includes(d.name)) : ALL;
// The rail is a scrolling container: its children may extend past it, and it always
// overlaps them. The teacher console is a deliberate overlay drawn on top.
const RAIL_KIDS = ['.map-panel', '.scenery-controls', '#flight-button', '.fishing-button', '.rpg-buddy-button', '#voice-button'];
const OVERLAY = ['#net-teacher'];
const PROBES = ['.right-rail', '#net-status', '#net-chat-button', '#net-teacher-button', '#net-teacher',
  '.hotbar', '.mobile-pad', '#near', '.quest-panel', '#errand-hud', ...RAIL_KIDS];

// Every panel a child can actually open, and how to open it from the page. A screen that
// only looks right on a laptop is a screen a classroom never sees: these are all measured
// at phone and iPad sizes, one at a time.
//
// `go` is run in the page and may be async; it should leave the panel open. `sel` is what
// gets measured. Anything that fails to open is reported rather than skipped quietly.
const SCREENS = [
  { id: 'chat', sel: '#net-chat', go: `document.querySelector('#net-chat-button').click()` },
  { id: 'teacher', sel: '#net-teacher', go: `document.querySelector('#net-teacher-button').click()` },
  { id: 'map', sel: '#rpg-dialog', go: `uspeak.rpg.openMap()` },
  { id: 'book', sel: '#rpg-dialog', go: `uspeak.rpg.openBook()` },
  { id: 'fishing', sel: '#fishing-dialog', go: `document.querySelector('#fishing-button').click()` },
  // The island screens. Each one flies there, stands in the right building and opens the
  // panel through the same call the E key makes.
  { id: 'errand', sel: '#mission-dialog', go: `await uspeak.__layout.island('errand'); document.querySelector('#mission-button').click()` },
  { id: 'quiz', sel: '#quiz-dialog', go: `await uspeak.__layout.at('school', 'easy'); uspeak.net.schoolInteract()` },
  { id: 'gym', sel: '#gym-dialog', go: `await uspeak.__layout.at('school', 'gym'); uspeak.net.schoolInteract()` },
  { id: 'battle', sel: '#battle-dialog', go: `await uspeak.__layout.at('arena', 'easy'); uspeak.net.arenaInteract()` },
  { id: 'dojo', sel: '#dojo-dialog', go: `await uspeak.__layout.at('arena', 'dojo'); uspeak.net.arenaInteract()` },
  { id: 'pet', sel: '#pet-dialog', go: `await uspeak.__layout.at('pet', 'nest'); uspeak.net.petInteract()` },
  { id: 'town', sel: '#town-dialog', go: `await uspeak.__layout.at('town', 'shop'); uspeak.net.townInteract()` },
  { id: 'garage', sel: '#ride-dialog', go: `await uspeak.__layout.at('ride', 'kick'); uspeak.net.rideInteract()` },
  { id: 'eiken', sel: '#eiken-dialog', go: `await uspeak.__layout.at('eiken5', 'reading'); uspeak.net.eikenInteract()` },
  { id: 'interview', sel: '#iv-dialog', go: `await uspeak.__layout.at('eiken5', 'interview'); uspeak.net.eikenInteract()` },
  { id: 'conv', sel: '#conv-dialog', go: `await uspeak.__layout.at('conv', 'cafe'); uspeak.net.convInteract()` },
  { id: 'voice', sel: '#voice-panel', go: `await uspeak.__layout.at('talk', null)` },
];

// The helpers the list above uses, installed in the page once it is online.
const LAYOUT_HELPERS = `uspeak.__layout = {
  async island(id) {
    for (const el of document.querySelectorAll('dialog[open]')) el.close();
    uspeak.rpg.fly(id); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 500));
  },
  // Fly to an island and stand in one of its buildings, the way a child walks in. The
  // spot's own coordinates come from the island the game itself built.
  async at(island, spot) {
    await this.island(island);
    if (!spot) { await new Promise((r) => setTimeout(r, 900)); return; }
    const data = await (uspeak.rpg[island]?.ready || Promise.resolve(null));
    const isle = data?.island || data;
    const place = (isle?.spots || []).find((s) => s.id === spot) || (isle?.spots || [])[0];
    if (!place) throw new Error('no spot ' + island + '/' + spot);
    uspeak.player.position.set(isle.x + place.x, 0, isle.z + place.z);
    // Walking to a building takes a child inside it, and this renderer takes its time
    // about it: wait for the room rather than for the clock.
    for (let i = 0; i < 40 && !uspeak.rpg.insideBuilding; i += 1) await new Promise((r) => setTimeout(r, 150));
    if (uspeak.rpg.insideBuilding) {
      // Inside, the counter is the place. Same as every island.
      uspeak.player.position.set(0, 0, -1.8);
      for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        if (uspeak.rpg.schoolNearby?.() || uspeak.rpg.arenaNearby?.() || uspeak.rpg.petNearby?.()
          || uspeak.rpg.townNearby?.() || uspeak.rpg.eikenNearby?.() || uspeak.rpg.convNearby?.()
          || uspeak.rpg.rideNearby?.()) break;
      }
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
  },
  close() {
    for (const el of document.querySelectorAll('dialog[open]')) el.close();
    // Closing the panel is not ending the session: a battle or a set of five is still
    // open on the server, and the next screen on the list would be refused. Say goodbye
    // to all of them — the room ignores the ones that were not running.
    for (const bye of ['battle:quit', 'quiz:quit', 'gym:quit', 'eiken:quit', 'interview:quit',
      'mission:quit', 'conv:end', 'race:leave', 'voice:leave']) {
      try { uspeak.net.room?.send(bye, {}); } catch { /* not connected */ }
    }
    // Leaving the building too: the next screen is somewhere else, and a child standing
    // in a room has the room's coordinates rather than the island's.
    try { uspeak.rpg.inside?.leave?.(true); } catch { /* not inside */ }
  },
  where() {
    return { space: uspeak.net.currentSpace(), inside: uspeak.rpg.insideBuilding?.spot?.id || null };
  },
};`;

// What "responsive" means here, measured rather than eyeballed: the panel is inside the
// screen, the page does not scroll sideways, a thumb can hit every control, and nothing
// is set in type too small for a nine-year-old to read on a phone.
const AUDIT = `(sel) => {
  const el = document.querySelector(sel);
  if (!el || el.hidden || !el.getClientRects().length) return { open: false };
  const r = el.getBoundingClientRect();
  const bad = [];
  const vw = innerWidth; const vh = innerHeight;
  if (r.width > vw + 1) bad.push('wider than the screen (' + Math.round(r.width) + ' > ' + vw + ')');
  if (r.left < -1 || r.right > vw + 1) bad.push('hangs off the side');
  if (r.top < -1 || r.bottom > vh + 1) bad.push('taller than the screen (' + Math.round(r.height) + ' > ' + vh + ')');
  if (document.documentElement.scrollWidth > vw + 1) bad.push('the page scrolls sideways');
  // Controls: 40px is the smallest thing a child hits reliably on glass (Apple says 44).
  const small = [];
  for (const c of el.querySelectorAll('button, input, select, [role="button"]')) {
    if (!c.getClientRects().length || c.disabled) continue;
    const b = c.getBoundingClientRect();
    if (b.width < 28 || b.height < 28) small.push((c.id || c.className || c.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
  }
  if (small.length) bad.push('controls too small to tap: ' + small.slice(0, 4).join(', '));
  // Type: anything under 11px is unreadable at arm's length on a phone.
  const tiny = [];
  for (const t of el.querySelectorAll('p, span, small, li, b, strong, button, label, h1, h2, h3')) {
    if (!t.getClientRects().length || !t.textContent.trim()) continue;
    const size = parseFloat(getComputedStyle(t).fontSize);
    if (size && size < 10.5) {
      const path = (t.parentElement?.className || t.parentElement?.tagName || '') + ' > ' + (t.className || t.tagName);
      tiny.push(String(path).trim() + ' ' + size.toFixed(1) + 'px');
    }
  }
  if (tiny.length) bad.push('type too small: ' + [...new Set(tiny)].slice(0, 4).join(', '));
  // A panel that overflows its own box without a scroller has content nobody can reach.
  if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY === 'visible') {
    bad.push('content is cut off (' + el.scrollHeight + ' in ' + el.clientHeight + ', no scroll)');
  }
  return { open: true, w: Math.round(r.width), h: Math.round(r.height), bad };
}`;

const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', TEACHER_KEY: 'testkey12345', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[srv] ' + d));
await sleep(1500);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-background-networking', '--disable-sync', '--disable-features=AutofillServerCommunication,OptimizationHints',
    '--no-first-run', '--no-default-browser-check'],
});

let failures = 0;
try {
  for (const d of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    // The sandbox has no internet: answer the font request locally and drop anything
    // else off-host so screenshots never wait on a hanging connection.
    await page.route('**/*', (r) => {
      const u = r.request().url();
      if (u.includes('127.0.0.1')) return r.continue();
      if (u.includes('fonts.googleapis.com')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return r.abort();
    });
    page.on('pageerror', (e) => console.log(`[${d.name}] pageerror`, e.message));
    const shot = (n) => page.screenshot({ timeout: 90000, path: path.join(OUT, `layout-${d.name}-${n}.png`) });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 120000 });
    await shot('1-avatar');
    await page.click('#avatar-confirm');
    await page.waitForSelector('#net-lobby[open]', { timeout: 30000 });
    await page.click('#net-teacher-details summary');
    await shot('2-lobby');
    await page.fill('#net-name', 'Yuto');
    await page.fill('#net-class', 'a');
    await page.fill('#net-key', 'testkey12345');
    await page.click('#net-join');
    await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000, polling: 250 });
    await page.evaluate(async () => {
      const { STARTERS } = await import('./magic-data.js');
      if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
      uspeak.rpg.close();
      for (const el of document.querySelectorAll('dialog[open]')) el.close();
    });
    await sleep(700);
    await shot('3-game');
    await page.click('#net-chat-button');
    await sleep(400);
    await shot('4-chat');
    await page.click('#net-chat-close');
    await page.click('#net-teacher-button');
    await sleep(700);
    await shot('5-teacher');
    await page.click('#net-teacher-close');
    await sleep(300);

    const probe = async (where) => {
      const report = await page.evaluate((probes) => {
        const boxes = {};
        for (const sel of probes) {
          const el = document.querySelector(sel);
          if (!el || el.hidden || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') { boxes[sel] = null; continue; }
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) { boxes[sel] = null; continue; }
          boxes[sel] = { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
        }
        const sel = (el) => (el ? getComputedStyle(el).webkitUserSelect || getComputedStyle(el).userSelect : '');
        return {
          vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth,
          coarse: matchMedia('(pointer: coarse)').matches, boxes,
          select: { body: sel(document.body), pad: sel(document.querySelector('[data-key]')), input: sel(document.querySelector('#net-chat-text')) },
        };
      }, PROBES);

      const bad = [];
      if (report.scrollW > report.vw + 1) bad.push(`horizontal scroll (${report.scrollW} > ${report.vw})`);
      // Holding a direction must not offer to look the arrow up in a dictionary.
      if (report.select.body !== 'none') bad.push(`text is selectable on a touch screen (body: ${report.select.body})`);
      if (report.select.pad !== 'none') bad.push(`the movement pad is selectable (${report.select.pad})`);
      if (report.select.input && report.select.input === 'none') bad.push('a box to type in is not selectable');
      for (const [k, b] of Object.entries(report.boxes)) {
        if (!b || RAIL_KIDS.includes(k)) continue; // rail children are clipped by the rail, not the viewport
        if (b.right > report.vw + 1 || b.bottom > report.vh + 1 || b.x < -1 || b.y < -1) bad.push(`${k} leaves the viewport ${JSON.stringify(b)}`);
      }
      // The rail scrolls, so a child that no longer fits is not off the screen — it is just
      // gone until somebody thinks to flick the column, which a seven-year-old will not.
      // Every button on the rail has to be on it without scrolling; when a new one stops
      // fitting, something older gives up its place (mobile.css drops the minimap, then the
      // camera angles). Measured here because the overlap check only notices it by accident,
      // when the overflow happens to run under the dock.
      const railBox = report.boxes['.right-rail'];
      if (railBox) for (const k of RAIL_KIDS) {
        const b = report.boxes[k];
        if (!b || b.bottom <= railBox.bottom + 1) continue;
        // What is on the rail and how tall it is, because that is the whole of the fix.
        const load = RAIL_KIDS.filter((n) => report.boxes[n]).map((n) => `${n} ${report.boxes[n].h}`).join(', ');
        bad.push(`${k} has scrolled off the rail (${b.bottom} > ${railBox.bottom}; rail ${railBox.h} holds ${load})`);
      }
      const keys = Object.keys(report.boxes).filter((k) => report.boxes[k] && !OVERLAY.includes(k));
      const related = (a, b) => (a === '.right-rail' && RAIL_KIDS.includes(b)) || (b === '.right-rail' && RAIL_KIDS.includes(a)) || (RAIL_KIDS.includes(a) && RAIL_KIDS.includes(b));
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (related(keys[i], keys[j])) continue;
        const a = report.boxes[keys[i]], b = report.boxes[keys[j]];
        const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        if (ov > 200) bad.push(`overlap ${keys[i]} x ${keys[j]} = ${ov}px2`);
      }
      console.log(`\n== ${d.name} (${d.width}x${d.height}) ${where} coarse=${report.coarse} pad=${!!report.boxes['.mobile-pad']} rail=${!!report.boxes['.right-rail']} tracker=${!!report.boxes['#errand-hud']}`);
      if (!bad.length) console.log('  clean');
      bad.forEach((b) => { console.log('  ' + b); failures++; });
    };
    await probe('willow');

    // おつかい島 with an errand in hand: the tracker takes the quest list's slot and the
    // interact prompt sits mid-screen, which is where they used to collide.
    await page.evaluate(() => { uspeak.rpg.fly('errand'); });
    await sleep(400);
    await page.evaluate(() => uspeak.rpg.finishFlight());
    await sleep(900);
    await page.click('#mission-button');
    await page.waitForSelector('#mission-dialog[open]', { timeout: 15000 });
    await page.click('[data-mission="bakery-two-drinks"]');
    await sleep(500);
    // Stand at the plaza so the interact prompt is showing while we measure.
    await page.evaluate(async () => {
      const d = await (await fetch('missions.json')).json();
      const p = d.island.spots.find((s) => s.id === 'plaza');
      uspeak.player.position.set(d.island.x + p.x, 0, d.island.z + p.z);
    });
    await sleep(700);
    await shot('6-errand');
    await probe('errand');

    // ---- every screen a child can open, one at a time -----------------------------------
    await page.evaluate(LAYOUT_HELPERS);
    for (const screen of SCREENS) {
      try {
        // Opening a screen means flying to an island, walking into a building and asking
        // the server for something — at three frames a second, with five browsers' worth
        // of work behind it. One retry, so a slow open is not reported as a broken screen.
        let opened = false;
        for (let attempt = 0; attempt < 2 && !opened; attempt += 1) {
          await page.evaluate(() => uspeak.__layout.close());
          await sleep(300);
          // eslint-disable-next-line no-new-func
          await page.evaluate(`(async () => { ${screen.go} })()`);
          opened = await page.waitForFunction((sel) => {
            const el = document.querySelector(sel);
            return !!el && !el.hidden && el.getClientRects().length > 0;
          }, screen.sel, { timeout: 20000, polling: 200 }).then(() => true).catch(() => false);
        }
        if (!opened) throw new Error('the screen never opened');
        await sleep(500);
        const out = await page.evaluate(new Function(`return ${AUDIT}`)(), screen.sel);
        if (!out.open) { console.log(`  ${screen.id}: did not open`); failures++; continue; }
        if (out.bad.length) {
          console.log(`  ${screen.id} (${out.w}x${out.h})`);
          out.bad.forEach((b) => { console.log('    ' + b); failures++; });
          await page.screenshot({ timeout: 90000, path: path.join(OUT, `layout-${d.name}-x-${screen.id}.png`) });
        } else {
          console.log(`  ${screen.id} (${out.w}x${out.h}) clean`);
        }
      } catch (err) {
        const where = await page.evaluate(() => uspeak.__layout.where()).catch(() => null);
        console.log(`  ${screen.id}: could not be opened — ${String(err).split('\n')[0]} ${JSON.stringify(where)}`);
        failures++;
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
console.log(`\n${failures} layout problem(s)`);
process.exit(failures ? 1 : 0);
